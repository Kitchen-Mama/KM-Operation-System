# LEGACY ALLOCATION DRAFT RECONCILIATION — F1-7N-FB-4F

**FB-4F-A: read-only diagnosis and migration design. Nothing in this document has been executed.**

Diagnostic entry point (un-routed, editor-run, read-only):
`TEMP_LEGACY_ALLOCATION_DRAFT_RECONCILE_DIAGNOSE()` in
`assets/tools/apps-script-diagnostics/TEMP_legacy_allocation_draft_reconcile_diagnose.gs`.

> **FB-4F-B1 §H — relocated out of the Apps Script deploy directory.** It was written to
> `assets/specs/active/apps-script/`, which is the directory the active-owner guard in
> `action-registry-and-router-completeness-f1-7n-fb-4e-r2` watches. That guard failed, and it was **right** to:
> a read-only diagnostic sitting in the deploy directory is, to any mechanical check, an active runtime file.
> The guard was not weakened, no `TEMP_*` pattern was ignored, and the file was not added to the owner list.
> It is still loaded, executed and asserted by
> `assets/tests/legacy-allocation-draft-reconcile-diagnosis-f1-7n-fb-4f-a.test.js` from its new location, and its
> git history is intact (`git log --follow`).
>
> **The user may delete `TEMP_legacy_allocation_draft_reconcile_diagnose.gs` from the live Apps Script editor at
> any time.** Nothing routes to it, no action list names it, and **no deployment version is required for its
> removal** — removing it changes no action contract and no routed path.

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


---

# FB-4F-B1 — ROUTE IDENTITY + APPEND-ONLY SCHEMA CONTRACT (CLOSED)

**B1 closes the contract. B2 appends the columns. A later round reconciles the legacy row. Three operations,
never one.** No live schema column was appended, no live row was mutated, no migration ran, and no
Save / Add Route / Submit was executed.

## B1.0 — What the round found before it changed anything

### The live defect was NOT only the schema

The Execution Plan's lead-time mapper, `_irMethodToLeadKey` in `assets/js/pages/inventory-replenishment.js`, was
a prefix ladder:

```js
if (m.indexOf('air') === 0) return 'Air';
if (m.indexOf('sea express') === 0) return 'Sea Express';   // a SPACE
if (m.indexOf('sea') === 0) return 'Sea';                   // caught sea_express
```

The canonical enum is `sea_express` with an **underscore** (`CARRIER_AND_ROUTE_SPEC` §4.5). It therefore missed
the second line and matched the third. **Measured, not inferred: `'sea_express'` → `'Sea'`.** Every Expected
Arrival shown for an express-ocean route was computed from the **regular ocean** lead time — a different service
with different transit days. A silently wrong date on a planning screen is worse than a blank one.

Replaced by two exact tables (canonical enum, display label) with **no prefix, family or transport-mode
fallback**. An unrecognised service maps to nothing, and the caller's existing `Lead time unavailable` is the
correct answer. `美森海卡` and `快船` → `Sea Express`; `普船` → `Sea`; `seafood`, `sea-express`, `ocean` → refused.

### Was the persisted `sea` row genuinely sea, or a lossy conversion?

**Genuinely a `sea` request.** Determined by code, not interpretation: the handler assigns
`recommended_shipping_method` verbatim and **no assignment of it applies a prefix, split or family transform**
(asserted over comment-stripped source). Nothing in the shipped write path could have turned `sea_express` into
`sea` on the way in. The lossy conversion existed in the **ETA/display path**, not in persistence.

**Consequence: the legacy row must NOT be rewritten on the theory that it was meant to be `sea_express`.** It is
a real `sea` route. The `sea_express` route is a *different* route that has never been created.

## B1.1 — §B The transport model, decided by existing frozen spec rather than invented

| concept | owner | values |
| --- | --- | --- |
| transport mode / **exact shipping service** | **`recommended_shipping_method`** on `shipping_allocation_drafts` | `air` `sea` `sea_express` `rail` `truck` |
| carrier rate identity | `carrier_rate_cards.transit_type` (+ the §4 matching ladder) | same enum |
| lead-time identity | `carrier_lead_times.shipping_method` | `Air` `Sea` `Sea Express` `Courier` |
| last-mile service | `recommended_last_mile_delivery` / `last_mile_delivery` | `parcel` `truck` |
| display label | never stored as a key | `美森海卡` `快船` `普船` … |

**No new service column.** Two frozen documents settle this and B1 obeys them rather than adding a third opinion:

* `CARRIER_AND_ROUTE_SPEC.md` §4.5 — `transit_type` is the canonical main-mode enum; `shipping_method` is
  demoted to a legacy display alias **on the carrier tables**.
* `SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md` §164 — *"If the existing DB keeps the
  column name `recommended_shipping_method`, do not also create a duplicate `recommended_transit_type` column
  during Phase 1."*

So on **this** table `recommended_shipping_method` **is** the exact-service owner and holds the canonical enum
verbatim. `sadCanonicalService_` normalises accepted spellings to that enum and returns `''` — never a
neighbouring service — for anything else.

## B1.2 — §C Destination identity

A destination is **`WAREHOUSE`** or **`MARKETPLACE`**, exclusively.

| destination type | `recommended_destination_warehouse_id` | `destination_marketplace` |
| --- | --- | --- |
| WAREHOUSE | **required** | blank |
| MARKETPLACE | blank | **required** |

**No `destination_type` column is proposed, and that is a decision rather than an omission.** The type is
*derivable* from which of the two mutually exclusive fields is populated. A third column that can disagree with
the other two is a contradiction waiting to be persisted, and §C explicitly says not to add it for convenience.
`sadDestinationIdentity_` derives the type from the data and reads **no** label, display or UI field — asserted.

Marketplace comparison is trimmed and lower-cased, so `Amazon`, `  AMAZON  ` and `amazon` are **one** identity.
`Amazon` in the warehouse-id column and `Amazon` in the marketplace column are **different** identities. Both
fields populated → `ROUTE_DESTINATION_AMBIGUOUS`. Neither → `ROUTE_DESTINATION_MISSING`.

`sadHeaderRouteIsComplete_` already accepted a logical marketplace destination before B1 — that half was never
the bug. The **identity** half was.

## B1.3 — §D Append-only schema proposal (for B2 to execute, NOT executed here)

`shipping_allocation_drafts` is **30 columns** and holds neither value. Verified against the handler's own
`SHIPPING_ALLOCATION_DRAFTS_HEADERS_`, asserted byte-for-byte in the B1 suite: **B1 appended nothing.**

### Column 1 — `destination_marketplace`

| | |
| --- | --- |
| table | `shipping_allocation_drafts` (append at **position 31**, end of schema) |
| type | string |
| normalization | trimmed for storage; trimmed + lower-cased for comparison and identity |
| blank semantics | blank = **this is a warehouse route**, not "unknown" |
| writer | `handleUpsertShippingAllocationDraftAtomic_` (header write) |
| reader | header readback, hydration, `sadDestinationIdentity_` |
| hydration field | `destinationMarketplace` |
| validation | mutually exclusive with `recommended_destination_warehouse_id`; both → refuse |
| identity participation | **YES** — via K4 `destination_type` + `destination_identity` |
| legacy default | blank on all existing rows, which is correct: they are warehouse or incomplete routes |
| backfill evidence | **none, and none is needed.** No existing row can be *proved* to have meant a marketplace |
| ambiguity behavior | fail closed, typed refusal, zero write |
| old frontend/backend | additive: an old reader ignores column 31; an old writer leaves it blank |
| deployment order | schema append → runtime deploy → (much later) legacy reconciliation |
| rollback | clearing the column restores prior behaviour; the column itself may stay (additive, inert) |

### Column 2 — `expected_arrival`

**A correction to the task's candidate list.** §D proposed `expected_arrival_date` on the header table. The
canonical model already owns this field, under a different name **and on a different table**:

> `DATABASE_RELATIONSHIP_MAP.md` §360 — allocation-draft **Lines**, user Execution Plan block:
> `planned_qty` · `ship_from` · `destination` · `selected_rate_card_id` · `selected_lead_time_id` ·
> `selected_carrier_id` · `selected_shipping_method` · `selected_last_mile_delivery` · **`expected_arrival`** ·
> `override_reason`

§D says to use the exact existing naming convention where an authoritative equivalent exists. It does. So:

| | |
| --- | --- |
| table | **`shipping_allocation_draft_lines`** (append at end), **not** the header |
| exact name | **`expected_arrival`** — not `expected_arrival_date` |
| type | `yyyy-mm-dd` string |
| blank semantics | blank = no ETA chosen; **never** a fabricated date |
| identity participation | **NO** |
| legacy default | blank |
| everything else | as above — additive, fail-closed, typed refusal |

**And this settles §E's expected-arrival question structurally rather than by rule.** Expected arrival is a
**line** attribute; route identity is a **header** key. A line attribute cannot reach a header key, so
*same route + changed ETA → UPDATE the same header* is guaranteed by the schema shape, not by remembering a
policy. No frozen spec places expected arrival in deterministic identity, so there is **no conflict to report**.

### The rule that makes the refusals necessary

Runtime code must never silently drop a supplied value whose column is absent. That is exactly how the live
sheet came to hold a blank destination and `sea` for a request that said Amazon and `sea_express`: **the write
succeeded and the truth did not survive it.** `sadRoutePersistability_` is a pure predicate over a header and
the sheet's actual header row. It reads no sheet, appends no column, creates nothing, and calls **no**
schema-ensure helper — asserted by name for `getSheet`, `insertColumn`, `appendRow`, `setValue`, `getRange`,
`SpreadsheetApp`, `ensureSchema`, `ensureColumns`, `createSheet`, `insertSheet`.

```text
ALLOCATION_DRAFT_SCHEMA_COLUMN_ABSENT   the schema-level fact
ROUTE_IDENTITY_NOT_PERSISTABLE          a destination/service that cannot be stored truthfully
EXPECTED_ARRIVAL_NOT_PERSISTABLE        an ETA that cannot be stored
SERVICE_NOT_CANONICAL                   a service that is not one of the five
ROUTE_DESTINATION_AMBIGUOUS             both destination identities supplied
ROUTE_DESTINATION_MISSING               neither supplied
```

## B1.4 — §E Versioned identity: K2 is frozen, K4 is the successor

**K2 could not be extended in place, and this is the crux of the round.** K2's ten dimensions carry no
destination marketplace, so a marketplace route and a destination-less route key **identically** — the identity
half of the FB-4F-A refusal. But appending a dimension to `sadK2GroupKey_` changes the joined string for
**every** row, including the ones whose new field is blank, so every `SADH-K2-*` id would regenerate and every
existing header would be re-keyed. That is a silent bulk migration disguised as a refactor, and §E forbids it.

`sadK2GroupKey_` is therefore **byte-identical** after B1. Proven, not asserted by intent: the ten dimensions in
the frozen order, a fixed header reproducing a fixed key, and the K2 id **unmoved** by adding
`destination_marketplace`, `expected_arrival`, `planned_qty` or `note`.

**K4, not K3** — `K3` is the *landed live scope* that `sadResolveActiveDraftK2OrK3_` already resolves against, so
the name is taken. The number is a version, not a ranking.

### The exact natural key

```text
K4 = planning_cycle | company | country | marketplace | source_page
   | recommended_source_warehouse_id
   | destination_type          <- DERIVED: WAREHOUSE | MARKETPLACE
   | destination_identity      <- warehouse id, or trimmed+lowercased marketplace
   | recommended_shipping_method_canonical   <- through sadCanonicalService_
   | recommended_last_mile_delivery
   | recommendation_group_no

id = 'SADH-K4-' + FNV1a(key).toUpperCase()
```

A **different prefix on purpose**: a K4 id can never be misread as a K2 id, so no resolver, log line or operator
can confuse the generations and a mixed-generation sheet stays legible.

**Not in the key, deliberately:** quantity, expected arrival, notes, audit timestamps, draft version — each
asserted individually.

| requirement | result |
| --- | --- |
| `sea` vs `sea_express` | **different** K4 identities |
| `美森海卡` vs `sea_express` | **same** identity — the key canonicalises, so a label is not a second route |
| Amazon vs Walmart marketplace | different |
| marketplace vs warehouse destination | different |
| `Amazon` / `  amazon ` | same |
| ETA / qty / note changed | same |
| identical dimensions | same, deterministically — a true collision *is* one route |

## B1.5 — §L The quantities

**Quantity is not identity** — the K4 key reads no quantity field at all, asserted, so a migration cannot key on
one. The legacy `800` and the requested `400` on the same route are **one identity**, which is precisely why a
future reconciliation must **UPDATE** rather than create, and must **not** touch the quantity.

* `800` is untouched by B1 and must be preserved by B2 and by reconciliation.
* `400` **may only** come from an explicitly authorized user Save / Add Route. **Migration must never
  manufacture it.** B1 assigns neither literal anywhere — asserted.

## B1.6 — §I B2 APPEND-ONLY SCHEMA DRY RUN (planned, NOT executed)

**Dry-run by default. `COMMIT` requires an explicit, current-turn user instruction.** The FB-4F-A checksum
`fb4fa-1:063955fd` is **evidence only** and must never authorize a COMMIT after the contract or schema changed.

1. **Read-only schema census** — header row of `shipping_allocation_drafts` and
   `shipping_allocation_draft_lines`; column count, order, exact names. No write.
2. **Explicit pre-append schema checksum** — over the ordered header names of both tables. Recorded before
   anything is appended.
3. **Backup instructions (USER)** — File › Make a copy of the spreadsheet, or download as `.xlsx`, before any
   append. The report must print this and stop if the user has not confirmed it.
4. **Append-only operation** — ~~`destination_marketplace` at the **end** of the drafts header~~
   **SUPERSEDED BY B2 — see §B2.2.** "At the end" is measurably wrong: when the lifecycle tail has not yet
   been materialized, the end of the drafts header is index **30**, which is exactly where the frozen canonical
   order places `generation_run_id`. Appending there would refuse the queued lifecycle migration permanently.
   The position is the **canonical index (34)**, not the live end. **No reorder, no rename, no delete.**
5. **No row-data mutation.** Not one cell of any existing row. Appending a column leaves existing rows blank in
   it, which is the correct legacy default.
6. **Post-append schema validator** — re-read both header rows; assert the previous names are unchanged and in
   the same order, and that exactly one column was appended to each.
7. **New post-append schema checksum** + the FB-4F diagnostic re-run → a **new** data checksum. The old one is
   superseded, not reused.
8. **Deployment order** — ~~(a) schema append; (b) Apps Script sync; (c) frontend push~~
   **REVERSED BY B2 — see §B2.1.** The reasoning above ("a schema with no runtime is inert and harmless") is
   false for this table: the write gate is **positional and exact**, so an appended column the owner file does
   not know about is not inert — it makes every allocation read and write fail closed. **Code first, then
   schema.**
9. **Rollback** — the appended columns are additive and inert until the runtime is deployed, so rollback is
   "do not deploy the runtime". If the runtime is already live, clearing the two columns restores prior
   behaviour without deleting them.
10. **Explicitly OUT of B2:** legacy row reconciliation, and creation of the `sea_express` / `400` route. Those
    are separate, separately authorized operations.

## B1.7 — §K Versions

`deployed_action_contract_version` **10** · required action list **9** · `transport_contract_version` **1** — all
**unchanged**, asserted by reading the constants (not the prose). B1 adds no action and changes no verb.

~~`SAD_BUILD_VERSION_` moved `F1-7N-FB-4D` → `F1-7N-FB-4F-B1`~~ — **this records a decision B1 reverted before
committing, and it is corrected here because a wrong sync manifest sends the user to the wrong file.** The bump
was attempted and put the whole project into `DEPLOYMENT_PARTIAL_SYNC` across four suites, because
`63_api_v1_system_health.gs` pins each owner's expected stamp against the **deployed** build — so a bump asserts
"the deployed copy is not this one", which is true only once a round has actually synced the file. B1 does not
sync. The stamp and its manifest entry therefore move together, in the round that syncs.

**ACTUAL COMMITTED STATE:** `SAD_BUILD_VERSION_` = **`F1-7N-FB-4D`**, unmoved, and
`16_shipping_allocation_handlers.gs` is **byte-identical**. The contract lives in
`69_api_v1_route_identity_contract.gs` (`RIC_BUILD_VERSION_ = 'F1-7N-FB-4F-B1'`), unrouted and unmanifested.

**APPS_SCRIPT_SYNC_REQUIRED (not now):** `69_api_v1_route_identity_contract.gs`, plus its manifest entry in
`63_api_v1_system_health.gs`, in the same step — and, per §B2.1, the owner-file change must precede the append.
**BUNDLE_REBUILD_REQUIRED:** NO — `assets/js/core/*` untouched, bundle hash unchanged.

---

# FB-4F-B2 — APPEND-ONLY SCHEMA DRY-RUN TOOLING (CLOSED)

Round: **F1-7N-FB-4F-B2**.

Read-only tooling only. **No column appended, no value backfilled, no row migrated, no writer wired, no Apps
Script synced or deployed, no frontend change.** The round's substantive output is a correction to B1's plan.

## B2.1 — THE FINDING: the ordering was backwards, and a blank column is not inert

`16_shipping_allocation_handlers.gs` gates **every** allocation read and write on `sadExactSchemaReason_`, which
is **positional and exact**:

| table | authority | optional tail | accepted live shape |
|---|---|---|---|
| `shipping_allocation_drafts` | `SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_` (34) | `SAD_LIFECYCLE_TAIL_COLUMNS_` (4, indexes 30–33) | count 30–34 **and** positional equality at every index |
| `shipping_allocation_draft_lines` | `SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_` (30) | **none** | count **exactly 30** |

So appending either proposed column while the owner file is unchanged refuses in **every** reachable live state.
Measured by handing the proposed header row to the shipped gate itself:

```
header live 30 → COL30_IS_destination_marketplace_EXPECTED_generation_run_id
header live 34 → COL_COUNT_35_EXPECTED_30_TO_34
line   live 30 → COL_COUNT_31_EXPECTED_30
```

The consequence is not cosmetic: **the Execution Plan would stop saving entirely**, with
`SCHEMA_MISMATCH ... zero_write: true` on every request. B1's stated justification — "a schema with no runtime is
inert and harmless" — holds for an additive contract, and this table's write gate is not additive.

**CODE FIRST, THEN SCHEMA.** This is the same conclusion `16_`'s own lifecycle-tail comment reached, for the same
reason: the canonical list must learn the column as an **optional tail entry** (so a pre-append sheet stays
valid) *before* the column exists. Once it has, the append and the sync are order-independent in both directions.

## B2.2 — The second migration already queued against the same table

`TEMP_migrate_shipping_allocation_ai_lifecycle.gs` appends the four lifecycle columns at **frozen indexes
30–33**, and its own safety check requires the live header to be an exact prefix of *its* canonical order with
**no unknown extra column** (`!extra.length`). The two migrations are therefore **not independent**:

* `destination_marketplace` can only ever occupy **canonical index 34**.
* Which means the **lifecycle tail must be physically present first**.
* Appending `destination_marketplace` at index 30 instead would refuse the lifecycle migration **permanently**.

## B2.3 — The corrected order

1. **Owner-file change (a WRITER change — not B2):** `destination_marketplace` joins the header canonical list as
   an optional tail entry; `expected_arrival` joins the line contract (the line gate needs an optional-tail
   mechanism it does not have today). Bump `SAD_BUILD_VERSION_` **in the same round that syncs**.
2. **Apps Script sync + a new deployment version** — `16_`, `69_api_v1_route_identity_contract.gs`, and `69_`'s
   manifest entry in `63_api_v1_system_health.gs`, together.
3. **Lifecycle tail append** (indexes 30–33) if still outstanding.
4. **The two append-only columns** — header index 34, line index 30.
5. **Frontend** — `assets/js/pages/inventory-replenishment.js`.

## B2.4 — The diagnostic

`assets/tools/apps-script-diagnostics/TEMP_shipping_allocation_schema_b2_dry_run.gs`

* Core: `TEMP_shippingAllocationSchemaB2DryRun_()` — the name the task specified.
* **Runnable entry point: `TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN()`.** A trailing underscore is Apps
  Script's *private* convention and such functions are **not offered in the editor's Run selector**, so the
  suggested name is the core and a public wrapper exists beside it — the shape FB-4F-A already uses here.
* **No execute or commit mode exists**, not even a disabled one: there is no `COMMIT` token in the code, no mode
  argument, and no second function.
* It **asks** the production gate rather than forming a second opinion: `sadExactSchemaReason_` reads its sheet
  only through `getDataRange().getValues()`, so the proposed post-append header is validated by the real rule
  through a read-only stub.
* Zero-write is proven by **execution** as well as by source scan — the suite runs it against a spreadsheet stub
  whose every method other than `getSheetByName` / `getDataRange` / `getValues` throws.

### The five decisions, reported separately — all false today

| decision | value | why |
|---|---|---|
| `schemaAppendSafe` | **false** | the positional gate refuses the append until the owner file learns the columns |
| `destinationBackfillSafe` | **false** | see §B2.5 |
| `expectedArrivalBackfillSafe` | **false** | see §B2.6 |
| `k4MigrationSafe` | **false** | the identity columns do not exist, so no K4 id can be persisted |
| `runtimeWiringReady` | **false** | `69_` is unrouted and unmanifested by design |

`READY_FOR_REVIEWED_SCHEMA_APPEND` means **only** that blank append-only columns could be added later. It never
means a backfill is safe, that K4 migration is safe, that the runtime is wired, or that any live migration is
authorized.

## B2.5 — Why no destination backfill candidate is produced

A header whose destination warehouse is blank and whose **scope** marketplace is `Amazon` is, in the persisted
data, **indistinguishable from a route the user simply never finished**. Both store the same thing: nothing. The
scope column answers *which marketplace this plan is for*, not *where this route delivers*, so it cannot promote
itself into a destination. Everything else on offer is either unpersisted or explicitly excluded: UI labels,
display text, warehouse code snapshots, page filters, and attempted client payloads. The `must_remain_blocked`
report lists the scope marketplace and the destination code snapshot as evidence **examined and rejected**, so
the exclusion is auditable rather than assumed.

## B2.6 — Why the attempted `2026-10-16` must not be backfilled

Measured in `assets/js/pages/inventory-replenishment.js`:

```js
var etaEl = rowEl.querySelector('[data-field="expected_arrival"]');
var expectedArrival = etaEl ? String(etaEl.textContent || '').trim() : '';
```

The client's `expected_arrival` is **read out of the rendered DOM cell** — UI-calculated text produced from a
carrier lead time, which the task names as a forbidden source twice. Worse: until B1 fixed `_irMethodToLeadKey`,
that computation used the **regular-ocean** lead time for every express-ocean route. Backfilling `2026-10-16`
would persist, as authoritative, a date derived from the **wrong service's** transit days. A blank ETA is a
missing value; that would be a wrong one wearing a missing one's clothes.

Nearby planning dates (`required_by_date`, `window_end_date`) are enumerated and reported as
`NOT_AN_ARRIVAL_FACT` rather than ignored — a planning window bound is not a carrier arrival, and it is the most
tempting wrong answer available.

## B2.7 — The live target, and the two facts that must not be conflated

The persisted row is a **`sea`** route with **no destination**. The attempted request was a **`sea_express`**
route to **Amazon**. Service and destination are **both K4 dimensions**, so:

* `same_identity = false` — these are **two different routes**. A reconciliation must **not** rewrite the `sea`
  row into a `sea_express` one; the express route has simply never existed.
* Quantity is a **separate** matter: it is not a K4 dimension at all, so `800` and `400` on the *same* route
  would be one identity calling for an **UPDATE**, never a second route.

The first fact says *do not rewrite this row*; the second says *do not duplicate it*. **`800` untouched; `400`
not created.** Neither number is written by this round.

## B2.8 — Checksum

`fb4fb2-1:<fnv1a>` over the ordered header rows of both tables plus their row counts — **order-sensitive by
construction**, because every positional reader in this stack depends on order and "the columns are all present
somewhere" is not the same claim as "the schema is right". The run re-reads both header rows at the end and
refuses with `LIVE_SCHEMA_CHANGED_DURING_DIAGNOSTIC` if either moved.

It authorizes **at most one** later, separately reviewed operation: adding the **blank** columns. It is
invalidated by any header change, and it is **not** authorization to backfill a value, to mint a K4 id, to
reconcile a legacy row, or to wire the runtime.

## B2.9 — RUNBOOK (USER-RUN, paste → run → remove)

`69_api_v1_route_identity_contract.gs` is **unsynced by design** — B1 left it unrouted and unmanifested — so the
dry run refuses with `AUTHORITY_NOT_LOADED` unless the contract is present. Both files are pasted temporarily.
**Both are inert (unrouted, called by nothing), so a temporary paste changes no live behaviour, and NO deployment
version is created.**

1. Open the **correct** Apps Script project (the one bound to the production database).
2. Add a new script file and paste **`assets/specs/active/apps-script/69_api_v1_route_identity_contract.gs`**.
3. Add a second new script file and paste
   **`assets/tools/apps-script-diagnostics/TEMP_shipping_allocation_schema_b2_dry_run.gs`**.
4. **Save. Do NOT create a deployment version.** Do not run Deploy at all.
5. Select **`TEMP_SHIPPING_ALLOCATION_SCHEMA_B2_DRY_RUN`** in the Run selector and run it.
6. Read the execution log. It is read-only: `DB_WRITES=0 DRIVE_WRITES=0 LOCKS_ACQUIRED=0 COLUMNS_APPENDED=0
   ROWS_CHANGED=0`, ending with `NO COLUMN WAS APPENDED, NO ROW WAS CHANGED ...`.
7. Record the `DECISION`, the five separate decisions, and the `fb4fb2-1:` checksum.
8. **Remove both pasted files** from the editor. Nothing else changes; because no deployment version was created,
   no deployment version is required for their removal either.

Expected verdict on today's schema: **`STOP_SCHEMA_COLLISION`**, with
`WRITE_GATE_REJECTS_PROPOSED_HEADER` and `LIFECYCLE_TAIL_OUTSTANDING` among the blocking reasons — i.e. §B2.1 and
§B2.2 confirmed against the live sheet rather than only against the constants.

## B2.10 — Tests

`assets/tests/allocation-schema-b2-dry-run-f1-7n-fb-4f-b2.test.js` — all 24 required cases, plus the gate proof
for every reachable live header length (30–34) and the reachability of every typed verdict. 15 mutation tests,
15 caught.

Three of the mutations were **defeated by code layering** on their first run: they attacked the aggregated
`decision`, where `STOP_SCHEMA_COLLISION` is already the answer for an unrelated and correct reason, so the guard
under test could be deleted outright and the suite still went green. They were rewritten to attack the point of
**detection**. One more asserted a regex against string-stripped source, where the literal it searched for had
already been replaced — so its baseline could never hold; it is now behavioural.

`STOP_UNPERSISTED_EXPECTED_ARRIVAL` was first written as a claim about the **schema** and was unreachable in both
directions. It is a claim about a **backfill**: the schema is sound, the column exists, every row is blank, and a
date was asked for — the one state in which a migration would have to invent the value.

## B2.11 — Versions

`deployed_action_contract_version` **10** · required action list **9** · `transport_contract_version` **1** — all
**unchanged**, asserted by reading the constants. `SAD_BUILD_VERSION_` **unmoved at `F1-7N-FB-4D`**;
`RIC_BUILD_VERSION_` unmoved at `F1-7N-FB-4F-B1`. **No build version bumped, no manifest activated, no action or
verb registered.**

**APPS_SCRIPT_SYNC_REQUIRED:** none for B2. **BUNDLE_REBUILD_REQUIRED:** NO.
