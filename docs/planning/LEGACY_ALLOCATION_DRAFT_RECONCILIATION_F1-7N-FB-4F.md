# LEGACY ALLOCATION DRAFT RECONCILIATION — F1-7N-FB-4F

**FB-4F-A: read-only diagnosis and migration design. Nothing in this document has been executed.**

Diagnostic entry point (un-routed, editor-run, read-only):
`TEMP_LEGACY_ALLOCATION_DRAFT_RECONCILE_DIAGNOSE()` in
`assets/specs/active/apps-script/TEMP_legacy_allocation_draft_reconcile_diagnose.gs`.

---

## 1. The refusal, exactly

The live Execution Plan route (US / Amazon / CO1100-R · CN侑鑫 → Amazon · sea_express · 400) is refused with
`LEGACY_ROUTE_RECONCILIATION_REQUIRED`, aggregated by the page as `ROUTE_GROUP_PARTIAL_FAILURE`.

| | |
|---|---|
| Backend owner | `assets/specs/active/apps-script/16_shipping_allocation_handlers.gs` |
| Raising function | `sadLegacyReconcileReason_` (final line) and `sadResolveActiveDraftK2OrK3_` (BLOCK branch) |
| Predicate | `sadHeaderRouteIsComplete_(persistedRow)` is **false** for a non-`SADH-K2-` id |
| Predicate body | `from && (destination_warehouse_id ‖ destination_marketplace) && method` |
| Compared identities | the **request** header (client, carries `destination_marketplace`) vs the **persisted** header (re-read from the sheet, cannot carry it) |
| Mismatch that fires | `recommended_destination_warehouse_id` is blank on the stored row and `destination_marketplace` is not a column, so the stored row can never be route-complete |
| Call sites | manual `sadUpsertDraftHeaderCore_` (guard before the first `setValue`), atomic `sadAtomicUpsertCore_` (guard before the header write) |
| Before all writes | **yes** — proven at runtime: the suite reaches the verdict over a sheet stub whose every write method throws, and no write is attempted |
| Write count on refusal | **0** |

`ROUTE_GROUP_PARTIAL_FAILURE` is not a second backend code. `assets/js/pages/inventory-replenishment.js`
(`_irMultiRouteOutcomeEnvelope_`) aggregates per-route outcomes and carries the **first** failing route's backend
code, which is how the legacy refusal surfaced under that name.

**The refusal is correct and stays.** The persisted row genuinely cannot express "destination = the Amazon
marketplace". `allow_legacy_reconcile` remains the only bypass and remains a separate, explicit, user-owned
migration.

> **Observation, not changed in this round.** The atomic refusal returns `zero_write: true` in its envelope; the
> manual one does not, although it is equally zero-write structurally. FB-4F-B may align them. FB-4F-A did not
> touch a shipped refusal path.

---

## 2. Why the tooling that already exists was not enough

| Candidate | Verdict |
|---|---|
| `67_api_v1_allocation_draft_identity.gs` / `system.allocationDraftIdentityDiagnostic` | **Wrong table.** It diagnoses `request_order_allocation_drafts` (Order Planning; `RD::MONTHLY_ORDER::` vs `RAD-M-`). It cannot see a `shipping_allocation_drafts` row. Not extended, not called. |
| `68_api_v1_execution_plan_conflict_diagnostic.gs` / `system.executionPlanConflictDiagnostic` | **Right table, right families, already read-only and masked, and already runs the real 16_ authorities.** It answers §A and most of §D–§E. It does not answer quantity conservation, the downstream foreign-key inventory, the schema decision, the before/after mapping or the checksum. |

So FB-4F-A added a **thin un-routed TEMP wrapper** that reuses 68_'s pure helpers and 16_'s authorities verbatim
and refuses to run at all when 16_ is absent, rather than re-deriving an identity rule. **No route was added and
the action contract stays 10 / 9 / 1.**

---

## 3. Where each route dimension actually lives

| Dimension | Classification | Column |
|---|---|---|
| company · country · marketplace · planning_cycle | persisted canonical | own columns |
| origin (From) | persisted canonical | `recommended_source_warehouse_id` |
| origin display | persisted legacy | `recommended_source_warehouse_code_snapshot` |
| destination **warehouse** (To) | persisted canonical | `recommended_destination_warehouse_id` |
| **destination MARKETPLACE (To)** | **client-only / unpersistable** | **no column exists** |
| shipping method · last mile | persisted canonical | `recommended_shipping_method` / `recommended_last_mile_delivery` |
| expected arrival | client-only / unpersistable | no column on the header or the line |
| route quantity | persisted canonical | `shipping_allocation_draft_lines.planned_qty` |
| route-completeness verdict · K2 group key · canonical K2 id | derived | the 16_ functions, never stored |

A UI label is never treated as proof of persistence: every classification above is decided from the actual
header row read from the sheet.

---

## 4. Downstream foreign keys — the finding that decides the mechanism

**No table in this schema stores `allocation_draft_id` or `allocation_draft_line_id` as a column.** Searched:
`shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_line_allocations`,
`shipment_routes`, `shipment_events`, `purchase_orders`, `purchase_order_lines`.

The real references are **textual**:

| Referencing table | Column | Form | Preserved by in-place completion | Preserved by re-keying |
|---|---|---|---|---|
| `shipping_plan_lines` | `source_reason` | `allocation_draft:<header_id>\|run:…\|fv:…\|cyc:…\|line:<line_id>` | **yes** | **no** |
| `shipping_allocation_drafts` | `note` | `[SUBMITTED @<ts> → shipping_plan <ids> · exec <key>]` | **yes** | **no** |

`source_reason` is a member of `SP_LINE_FP_STR_`, the **spfp-1 Submit fingerprint**. Changing a header id or a
line id therefore does two things at once: it strands the lineage string on every already-submitted plan line,
**and** it changes the Submit idempotency hash, so a replay under the same execution key would compare as
`CONFLICT` instead of `REUSED`.

**Conclusion: identity replacement is rejected.** The only mechanism that survives this is in-place completion
under the existing identity — which is also the only one that changes nothing else.

---

## 5. The schema decision — `STOP_FOR_SCHEMA_REVIEW`

```
schema_change_required = true
mechanically_safe      = false
decision               = STOP_FOR_SCHEMA_REVIEW
```

### Append-only proposal (NOT applied in FB-4F-A)

| | |
|---|---|
| Target sheet | `shipping_allocation_drafts` |
| New column | `destination_marketplace` |
| Type | string; trimmed; compared case-insensitively; **blank means "the destination is a warehouse"** |
| Insertion | **append-only**, after the lifecycle tail; no live column is reordered or rewritten |
| Writer changes | `sadUpsertDraftHeaderCore_` and `sadAtomicUpsertCore_` persist the payload field they already accept |
| Reader changes | none in `sadHeaderRouteIsComplete_` (it already reads the field); hydration returns it so the page stops re-deriving it |
| Backfill source | the header's own `marketplace`, **only** where `recommended_destination_warehouse_id` is blank **and** no line carries a destination warehouse |
| Ambiguous legacy rows | left **blank** and left **refused** — never guessed |
| Validation | a row carries a destination **warehouse id** *or* a destination **marketplace**, never both |
| Cutover impact | additive column on a table whose contract already allows extra columns, so code sync and schema migration stay order-independent; **no action, verb or transport version moves** |
| Rollback | the column is additive and unread by any pre-migration code path; removing it restores the prior behaviour exactly |

Explicitly **not** done: `Amazon` is never encoded as a warehouse id, no unrelated text column is reused, and
destination-warehouse semantics are not overloaded.

### The part a schema column alone does not fix

Derived from the shipped rule at diagnosis time, not assumed:
`sadK2GroupKey_` groups on `recommended_destination_warehouse_id` and **does not include
`destination_marketplace`**. Two routes to two different marketplaces both key on a blank destination warehouse
and therefore still collapse onto one K2 header — which is exactly the client-side
`ROUTE_IDENTITY_NOT_PERSISTABLE` refusal.

So persisting the column is **necessary but not sufficient**. FB-4F-B must decide *separately* whether
`sadK2GroupKey_` gains the dimension, weighing that this changes every **future** deterministic id while
existing ids are never re-keyed (the FB-4A `sadK2ReconcileDecision_` semantics compare group keys on both sides,
so a consistent redefinition survives — but it is a decision, not a detail).

---

## 6. Proposed before/after mapping

| Record | Current identity | Proposed identity | Changed fields | Preserved references | Safety |
|---|---|---|---|---|---|
| header | *(masked, from the live run)* | **unchanged** | `destination_marketplace` only, once the column exists | `shipping_plan_lines.source_reason`, `drafts.note`, `draft_lines.allocation_draft_id` | `BLOCKED_ON_SCHEMA` until reviewed |
| lines (all) | *(unchanged)* | **unchanged** | none | line id, parent id, `planned_qty` | `BLOCKED_ON_SCHEMA` |

Mechanism: **in-place canonical-field completion**. Not chosen to avoid a schema change — chosen because §4
rules out every alternative, and the diagnostic reports `NO_SAFE_AUTOMATIC_MIGRATION_UNTIL_SCHEMA_REVIEW` until
the column exists.

---

## 7. FB-4F-B migration protocol (design only — no callable COMMIT exists)

**Mode.** `DRY_RUN` by default. `COMMIT` is authored only in FB-4F-B, after this document is reviewed.

**Checksum.** `fb4fa-1` = FNV-1a over the protected header fields then the protected line fields, each row
projected in a fixed field order (`field=value`, ``-separated) and the projections sorted, so the value
depends on content and never on read order.

- Protected header fields: all 30 columns of `SHIPPING_ALLOCATION_DRAFTS_HEADERS_`.
- Protected line fields: `allocation_draft_line_id, allocation_draft_id, sku, site_sku, window_code,
  recommended_qty, planned_qty, units_per_carton, route_no, source_warehouse_id, line_status, override_reason,
  note, created_at, updated_at`.
- Proven in the suite: it moves for **any** protected field (9/9 probes) and **does not** move for a field
  outside the set.

**Sequence.**

1. `DRY_RUN` emits the plan **and** the `fb4fa-1` checksum. Nothing is written.
2. `COMMIT` requires the operator to pass that exact checksum. A missing or different value is
   `FB4FB_CHECKSUM_MISMATCH` — refuse, zero writes.
3. Acquire the script lock. Failure → `FB4FB_LOCK_UNAVAILABLE`, zero writes.
4. **Re-read** under the lock and **recompute** the checksum. Any drift → `FB4FB_CHECKSUM_MISMATCH_UNDER_LOCK`,
   zero writes, lock released.
5. Journal the before-state of every cell the run will touch, plus the idempotency key, **before** the first
   mutation.
6. Mutate: set `destination_marketplace` only, only on rows the plan named, only where it is currently blank.
   No `deleteRow`. No id is written. No quantity is written. No audit field or operator note is written.
7. Verify by read-back: row count unchanged, every protected field unchanged, every named row now carrying the
   expected value. Failure → `FB4FB_VERIFY_FAILED` with the journal as rollback evidence.
8. Release the lock in `finally`.

**Idempotency key:** `fb4fb:<checksum>:<sorted masked header ids>`. A replay finds every target already carrying
its value, writes nothing, and reports `replay_writes = 0`.

**Guarantees:** no `deleteRow` · no quantity change · no duplicate header · no duplicate line · no FK orphan ·
no lost audit field · no lost operator note · replay writes = 0.

**Typed refusals:** `FB4FB_CHECKSUM_MISMATCH`, `FB4FB_CHECKSUM_MISMATCH_UNDER_LOCK`, `FB4FB_LOCK_UNAVAILABLE`,
`FB4FB_SCOPE_AMBIGUOUS`, `FB4FB_QUANTITY_NOT_CONSERVED`, `FB4FB_CONTESTED_IDENTITY`, `FB4FB_VERIFY_FAILED`,
`FB4FB_SCHEMA_COLUMN_ABSENT`.

**Partial failure:** the journal names every cell already written; the recovery step re-applies the remainder
under a fresh lock and checksum, and never re-writes a cell already carrying its target value.

---

## 8. Post-migration acceptance plan (FB-4F-B — not executed now)

1. The existing route can **UPDATE**.
2. **Add Route** creates a distinct K2 header when route identity differs.
3. **Reload** hydrates both routes correctly.
4. **Submit Plan** reads the correct two headers and their lines.
5. Total quantity equals the sum of the saved routes.
6. Repeated **Save** creates no duplicate.
7. Repeated **Submit** creates no duplicate.
8. A genuinely contested identity remains **blocked**.
9. Every downstream reference still resolves (`shipping_plan_lines.source_reason`, the draft `note` stamp).
10. Migration replay performs **zero** writes.

---

## 9. Status

```
FB-4F-A DIAGNOSTIC PREPARED — WAITING FOR USER-RUN LIVE READ-ONLY OUTPUT
```

The verdicts above are proven against the shipped runtime over fixtures. The **live** identity census, the live
quantity totals and the live checksum come from the user's own run of
`TEMP_LEGACY_ALLOCATION_DRAFT_RECONCILE_DIAGNOSE()`.
