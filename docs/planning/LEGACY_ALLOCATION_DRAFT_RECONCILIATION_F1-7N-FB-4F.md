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
3. **Lifecycle tail append** (indexes 30–33) if still outstanding. **CORRECTED IN B4:** this step is
   ORDER-INDEPENDENT of step 2 and did not have to wait for it. Measured against the shipped gate, a
   34-column header is exact under BOTH the pre-B3 authority (`CANONICAL` 34, tail 4) and the B3
   authority (`FULL` 35, tail 5); only a 35-column header refuses under the pre-B3 authority
   (`COL_COUNT_35_EXPECTED_30_TO_34`). The caution here was right about step 4 and needlessly strict
   about step 3.
4. **The two append-only columns** — header index 34, line index 30. This one really does depend on
   step 2.
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

---

# FB-4F-B3 — CODE-FIRST SCHEMA COMPATIBILITY (CLOSED)

Round: **F1-7N-FB-4F-B3**. Code and deployment contracts only. **No live column appended, no lifecycle migration
run, no backfill, no data migration, no ID rewrite, no frontend change, no Apps Script sync, no deployment, no
push.**

## B3.0 — The live state B2 recorded, reproduced exactly

The B2 dry run was executed against the production database on 2026-08-31 and returned:

```
shipping_allocation_drafts        30 columns, 4 rows, sf:d910d16a
shipping_allocation_draft_lines   30 columns, 6 rows, sf:2226df13
checksum fb4fb2-1:846e7989        decision STOP_SCHEMA_COLLISION
```

B3 reproduced all four values offline from the repository's own schema constants, through the real diagnostic
code path. They match. **So the live sheet is byte-for-byte the canonical base 30/30**, both write gates report
`(exact)` today, and the Execution Plan is working — which is what "preserve current behaviour" has to mean.
The reproduction is a permanent test (§J of the B3 suite), so a future edit that would have changed the live
answer fails here first.

## B3.1 — The canonical orders

**Header — `SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_`, 35 columns. Accepted live lengths: 30, 31, 32, 33, 34, 35.**

```
0..29   the frozen base contract (SHIPPING_ALLOCATION_DRAFTS_HEADERS_)
30      generation_run_id        ┐
31      expired_at               │ SAD_LIFECYCLE_TAIL_COLUMNS_  (frozen indexes)
32      expired_by_run_id        │
33      expiration_reason        ┘
34      destination_marketplace  ← SAD_ROUTE_IDENTITY_TAIL_COLUMNS_
```

**Line — `SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_`, 31 columns. Accepted live lengths: 30, 31.**

```
0..29   the frozen base contract
30      expected_arrival         ← SAD_LINE_ETA_TAIL_COLUMNS_
```

Every present column must sit at its **exact canonical index**. That single positional rule is what refuses
`destination_marketplace` at index 30, a lifecycle column out of order, an unknown name, a duplicate, a
case variant, a blank intervening header and a 36th column — six rejections from one rule rather than six
separate checks that could disagree.

**The existing `SHIPPING_ALLOCATION_DRAFTS_HEADERS_CANONICAL_` is deliberately still 34.**
`TEMP_migrate_shipping_allocation_ai_lifecycle.gs` reads it as *its* canonical target and appends everything
past the live length; widening it in place would have made the **lifecycle** migration append
`destination_marketplace` as well — one tool quietly doing another's job, at an index the lifecycle order does
not own. The write gate got a new, wider authority instead. Asserted in both suites.

## B3.2 — Behaviour at each stage

| stage | header / line | writes | `destination_marketplace` | line `expected_arrival` | identity |
|---|---|---|---|---|---|
| now | 30 / 30 | unchanged | `ROUTE_IDENTITY_NOT_PERSISTABLE`, zero write | `EXPECTED_ARRIVAL_NOT_PERSISTABLE`, zero write | K2 / K3 |
| lifecycle only | 34 / 30 | unchanged | still refused | still refused | K2 / K3 |
| final | 35 / 31 | persists + hydrates both | persisted on the header | persisted on the **line** | **K4** for newly persistable routes |

Every refusal is **typed, echoes the value that would have been lost, and writes nothing**. Nothing is silently
dropped — which is precisely how the live sheet came to hold a blank destination and `sea` for a request that
said Amazon and `sea_express`: the write succeeded and the truth did not survive it.

Hydration needed no new mapping: `sadRowToObject_` and `sadReadLinesForDraft_` build objects from the **live
header row**, so both fields appear on reload the moment their columns exist.

## B3.3 — K4 activation, and what it must never do

K4 is activated by the **schema**, never by a flag: `sadK4SchemaReady_` requires `destination_marketplace` to
physically exist *and* the frozen contract to be loaded. A deterministic identity that cannot be persisted is
not an identity — it is a number that disappears on write.

When ready, resolution has three outcomes and the order is the design:

* **K4 match** → REUSE that row **under its own stored id**. A replay is an UPDATE, and an adopted
  `SADH-K2-` row is *never re-keyed* — re-keying would orphan every line pointing at it.
* **K4 contested** (two active rows, one group) → `BLOCKED_CONFLICT`. A business decision, not something a
  writer settles by picking one.
* **K4 unmatched** → before creating anything, look for an active row that K2 would claim **and that K4 cannot
  classify** (it stores no destination at all). That is the legacy row this whole round exists because of.
  Creating beside it would duplicate the route; adopting it would migrate a legacy row in place. Both are
  forbidden, so it is `K4_IDENTITY_RECONCILIATION_REQUIRED` and the row is left exactly as it is.

**The rival check is restricted to K4-unclassifiable rows, and that restriction is load-bearing.** Without it,
saving a Walmart route beside an existing Amazon route was blocked — K2 cannot tell them apart, but K4 can, and
two rows K4 *can* classify with different keys are simply two different routes.

`sadK2GroupKey_` is **byte-identical**: the same ten dimensions in the same frozen order, and it still does not
read `destination_marketplace`. No existing `SADH-K2-` id regenerates. Proven by test and by mutation.

## B3.4 — Two defects this round found in its own work

**An ETA-only edit was invisible, so it was silently not saved.** The payload fingerprint decides REUSE
(zero write) against REGENERATE, and `expected_arrival` was not in `SAD_K2_LINE_FP_`. Changing only the date
produced an identical fingerprint, the writer took the true-zero-write REUSE branch, and the new value was
never persisted — the same class of silent drop this round exists to end, arriving through the front door
instead of through the schema. The field is now in the line fingerprint, and `sadRegenerateLinePatch_` adopts a
supplied ETA while never writing a blank one, so the server can neither invent a date nor erase one.

**The rival-K2 guard was too broad**, described above.

## B3.5 — Deployment identity

| file | symbol | expected | why |
|---|---|---|---|
| `16_shipping_allocation_handlers.gs` | `SAD_BUILD_VERSION_` | **`F1-7N-FB-4F-B3`** | the writer learned both columns |
| `69_api_v1_route_identity_contract.gs` | `RIC_BUILD_VERSION_` | **`F1-7N-FB-4F-B3`** | now a synchronized owner, newly manifested |
| `63_api_v1_system_health.gs` | `SYS_BUILD_VERSION_` | unchanged | see below |
| `01_router.gs` | `RTR_BUILD_VERSION_` | unchanged | **no router behaviour changed** |

**Action contract 10 · required-action list version 9 · transport contract 1 — all unchanged**, asserted by
reading the constants. No action and no verb was added: a pure identity helper does not need a route to be
reachable (Apps Script shares one global scope), and creating one merely to expose it would change a contract
this round has no business changing.

**`SYS_BUILD_VERSION_` and `RTR_BUILD_VERSION_` are deliberately NOT moved, and this is a judgement call worth
stating so it can be overruled.** Two reasons:

1. The shared `BUILD_STAMP_RE` in `assets/tests/_release-order.js` is applied to exactly two files — `63_` and
   `01_` — and its shape (`F1-7N-<AREA>-<n><LETTER>(-R<n>...)`) does **not** admit this round's `-B3` sub-round
   segment. Moving `SYS_BUILD_VERSION_` to `F1-7N-FB-4F-B3` would require widening that shared guard.
2. It buys no detection. A partial sync of this set is already named from **both** directions by the pair that
   did move: sync `16_` without `63_` and the stale manifest still expects `F1-7N-FB-4D`; sync `63_` without
   `16_` and the new manifest expects B3 while the file declares 4D. Either way `mixed_deployment` is true.
   That is by design — the manifest's own note says the evidence comes from the *other* files.

If you would rather every changed file carry a moved stamp, the change is: widen `BUILD_STAMP_RE` to admit a
`-[A-Z]\d*` segment, then move `SYS_BUILD_VERSION_` and its own manifest entry together. Say the word.

## B3.6 — REQUIRED APPS SCRIPT SYNC ORDER (user-run, later — not performed in this round)

These three files are **one atomic deployment set**. Syncing any subset leaves the project in
`DEPLOYMENT_PARTIAL_SYNC`, which the health check will name.

```
APPS_SCRIPT_SYNC_REQUIRED (bytes changed this round):
  1. 69_api_v1_route_identity_contract.gs     (now called by 16_; RIC_BUILD_VERSION_ -> F1-7N-FB-4F-B3)
  2. 16_shipping_allocation_handlers.gs       (schema compatibility; SAD_BUILD_VERSION_ -> F1-7N-FB-4F-B3)
  3. 63_api_v1_system_health.gs               (manifest: 16_ expectation moved, 69_ entry added)
```

1. Copy **all three** files into the Apps Script project. Paste `69_` **before or with** `16_`: a deployment
   carrying the B3 writer without the contract would refuse a marketplace route it is meant to accept.
2. Create **one new Apps Script deployment version**.
3. Point the stable `/exec` deployment at that new version.
4. Run **`checkDeploymentContract()`** and confirm `mixed_deployment: false` and both owners reporting
   `F1-7N-FB-4F-B3`.
5. **Only after step 4 passes** may the lifecycle-tail migration be considered.

`BUNDLE_REBUILD_REQUIRED:` **NO** — `assets/js/core/*` untouched, bundle hash `d782ea6d…c36ac` unchanged.
`FRONTEND_DEPLOY_REQUIRED:` **NO** for B3 (the `inventory-replenishment.js` lead-time fix from B1 is still
pending its own push, unchanged by this round).

### The order after that, unchanged from §B2.3

```
B3  (this round)  owner files learn both columns          <- code
 ↓  sync + one deployment version + checkDeploymentContract()
B4  lifecycle tail append (indexes 30..33) if outstanding <- schema
B5  destination_marketplace (34) and expected_arrival (30)
B6  legacy row reconciliation — separately authorized, never automatic
```

## B3.7 — Tests

`assets/tests/allocation-code-first-schema-compatibility-f1-7n-fb-4f-b3.test.js` — **194 passed, 0 failed; 15
mutations, 15 caught.** All 32 required cases. The suite **executes the shipped writer**
(`sadAtomicUpsertCore_`) against an in-memory spreadsheet at each of the three stages and checks what ends up in
the cells, rather than describing what the code says.

Eight existing suites had guards that pinned the pre-B3 state. **None was deleted; each was restated to be at
least as strong**, and the pattern in every case was the same one the map rounds paid for five times: a suite
stating an equality with "now" instead of a floor or a derived contract.

* `action-registry…-fb-4e-r2` — "16_ is UNCHANGED since R1" was the right guard from R1 to B2, and it is why
  the B1 contract went into a new file. B3 is the round licensed to change the writer, so the property moves
  from *it never changes* to **it never changes silently and its identity never moves**: the manifest expects
  exactly what the file declares, and `sadK2GroupKey_` is byte-identical. Both asserted; the other three
  business writers keep the original rule.
* `route-identity…-b1` and `allocation-schema-b2…` — three literals about each round's own moment, replaced by
  the derived contract *every owner declares exactly what the manifest expects of it*.
* `live-closure…-fb-4d` — a literal `'F1-7N-FB-4D'`, now read from the manifest.
* `legacy-allocation-draft-reconcile…-fb-4f-a` — restated as a **floor** (FB-4F-A itself changed no writer).
* `ai-plan-lifecycle-migration…` — new gate arguments, **plus** a new assertion that the lifecycle canonical is
  still exactly 34 and still appends only its own four columns.
* `inventory-k2…-r6f2a` — a reason literal moved into `sadResolveBlockMessage_`; the assertion follows it.
* `execution-plan-multi-route…` — harness now supplies the new global, as Apps Script's shared scope would.

One of my own B2 assertions was found **vacuous**: `O2` tested `code(SAD).indexOf("'destination_marketplace'")`,
and `code()` replaces every string literal with `''`, so the right-hand side was true no matter what the file
contained. It was green for the wrong reason. Replaced with the property that still matters.

**Full sweep: 386 suites, 382 pass, 4 fail — the four long-standing failures and nothing else. 0 new.**


## B4.0 — The live state B4 starts from, and the ordering fact that resolved

The lifecycle tail landed between B3 and B4. `TEMP_AI_LIFECYCLE_MIGRATE_COMMIT` added its four columns and
touched no row (all four live drafts are `user_created` → `MANUAL_SOURCE` → `NO_WRITE`), so the live state is now:

```
shipping_allocation_drafts        34 columns, 4 rows, sf:3e83e85c
shipping_allocation_draft_lines   30 columns, 6 rows, sf:2226df13
B2 checksum                       fb4fb2-1:42a1b1ed   decision STOP_UNPERSISTED_EXPECTED_ARRIVAL
```

All four values **reproduce offline** through the real B2 code path from this repository's own constants, so the
live header is byte-for-byte the canonical 34 and the live line header the canonical 30. The B2 decision moving
from `STOP_SCHEMA_COLLISION` to `STOP_UNPERSISTED_EXPECTED_ARRIVAL` is the lifecycle append showing up in the
diagnostic exactly where it should.

And the append this round prepares produces:

```
shipping_allocation_drafts        35 columns  sf:870364de
shipping_allocation_draft_lines   31 columns  sf:122f48c3
```

Also reproduced offline, from the B3 authorities, before any tool was written.

**A note on those fingerprints.** The `sf:` digest joins with the CONTROL characters `\x01` and `\x02`, not with
an empty string — which is invisible in a terminal and cost this round two wrong reproductions before the bytes
were dumped. The choice is right (joining with a printable delimiter lets `['a','b']` and `['a|b']` collide), but
B2 embeds the raw bytes in its source. The B4 helper writes them as `'\x01'` escapes instead, so the file
survives a copy-paste into the Apps Script editor with its fingerprints intact.

## B4.1 — The helper

`assets/tools/apps-script-migrations/TEMP_shipping_allocation_schema_b4_append.gs`

Placement: the repository's older migration helpers (`TEMP_migrate_*`) sit in
`assets/specs/active/apps-script/`, which **is** the active deployment directory — a helper there gets deployed,
and this one is meant to be pasted, run and removed. B2 established `assets/tools/` for exactly this reason. No
migration directory existed outside the deployment tree, so this round creates `apps-script-migrations/`
alongside `apps-script-diagnostics/`.

Two entry points, **both argument-free**, because the Apps Script Run selector cannot pass arguments — the
established `COMMIT({mode, checksum})` shape is unreachable from the toolbar:

```
TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN()    READ-ONLY on every path, including every refusal path
TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT()     the only writer
```

### The write plan, and nothing else

```
shipping_allocation_drafts!AI1      = destination_marketplace     (index 34, column 35)
shipping_allocation_draft_lines!AE1 = expected_arrival            (index 30, column 31)
```

Both positions are **derived** from the runtime authority and then asserted against the frozen decision — index,
column letter, and the authority's own name at that index. If a future edit ever moves a column, the tool
refuses with `SPEC_DISAGREES_WITH_AUTHORITY` rather than appending a name where production no longer expects it.

## B4.2 — Why this tool cannot run before the B3 sync

Every rule comes from the shipped authority — `SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_`,
`SAD_HEADER_OPTIONAL_TAIL_COLUMNS_`, `SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_FULL_`,
`SAD_LINE_ETA_TAIL_COLUMNS_`, `sadExactSchemaReason_` — and there is **no local fallback copy of any of them**.

That is not tidiness, it is the ordering guard, and it is the one design decision in this round that carries
real weight. Those symbols exist only in a project synced to B3. Pasted into a project that is not, the tool
cannot find its authority and STOPS with `AUTHORITY_NOT_LOADED`, naming the sync it is waiting for — instead of
falling back to a hardcoded list and appending the very column that takes every allocation read and write down.
A tool carrying its own copy of the schema is a tool that can disagree with production.

## B4.3 — The checksum, which is the whole confirmation

`TEMP_B4_REVIEWED_CHECKSUM_` is a constant the reviewer edits by hand. It starts blank, and a blank constant is
a refusal. There is no argument, no default, no `||` fallback, and **no Script Property** — a persisted
confirmation outlives the intent that recorded it, and this file is meant to be deleted.

The checksum covers everything that would make a reviewed plan stale: both header rows **in order**, both row
counts, the quantity/FK/service census, the exact write plan, and the operation name. It is recomputed live
**twice** — once before the lock and once under it — and must match exactly both times.

Its prefix is `fb4b4-1`, operation-specific by design. B2's `fb4fb2-1:42a1b1ed` authorises a *review*, not a
write, and pasting it here is refused **by name** (`REVIEWED_CHECKSUM_FROM_ANOTHER_OPERATION`) rather than by
happening to hash differently.

## B4.4 — Journal, and why there is no rollback

The established mechanism from `TEMP_migrate_shipping_allocation_ai_lifecycle.gs` is an **ordered in-result
journal plus `Logger.log`**, recorded BEFORE anything is applied — not a journal table. It journals these two
structural changes natively, so nothing incompatible had to be invented and there was nothing to STOP over.

If the journal cannot be written, **nothing is applied**: an unjournalled structural change is precisely the
thing there is no automatic rollback for. And there is no automatic rollback or delete, deliberately — an
automatic reversal of a partially applied change is a second unreviewed write on top of a failure nobody has
looked at yet. What is provided is the exact record to reverse deliberately.

The two cells are applied **one at a time, each read back and verified before the next is attempted**. A second
write on top of an unverified first turns one recoverable failure into two.

## B4.5 — What the commit proves after writing

* exact final header order against the 35- and 31-column authorities
* both runtime gates ACCEPT the final schemas
* every pre-existing data cell byte-identical (compared over the raw row extent, not a filtered row count — a
  positional range built from a populated-row count compares the wrong rows the moment a blank row sits between
  two populated ones)
* every cell under both new columns BLANK
* the quantity/FK/service census unchanged: **1020 planned_qty, 6 matched lines, 0 orphans**, identical id/FK
  digest, and `sea` still `sea` beside `sea_express`

## B4.6 — RUNBOOK (USER-RUN, paste → run → remove)

**Prerequisite: `16_`, `69_` and `63_` must already be synced to `F1-7N-FB-4F-B3` and
`checkDeploymentContract()` must pass.** The tool enforces this itself, but knowing why beats being refused.

1. Back up the spreadsheet (**File › Make a copy**). There is no automatic rollback, by design.
2. Paste `TEMP_shipping_allocation_schema_b4_append.gs` into the Apps Script project as a new file. Save.
3. Run `TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_DRY_RUN()`. Read **every** line. Expect:
   * `decision: MECHANICALLY_SAFE_TO_APPEND`, `blocking_reasons: []`
   * exactly two proposed writes: `shipping_allocation_drafts!AI1` and `shipping_allocation_draft_lines!AE1`
   * `fingerprint_pre` → `sf:3e83e85c` / `sf:2226df13`
   * `fingerprint_post_proposed` → `sf:870364de` / `sf:122f48c3`
   * `runtime_gate_before` and `runtime_gate_after_proposed` both `ACCEPTED` on both tables
   * `DB_WRITES=0 · COLUMNS_APPENDED=0 · ROWS_CHANGED=0`
4. If and only if that is what you see, copy its `confirmation_checksum` (it starts `fb4b4-1:`) into
   `TEMP_B4_REVIEWED_CHECKSUM_` at the top of the file. **Change nothing else.** Save.
5. Run `TEMP_SHIPPING_ALLOCATION_SCHEMA_B4_COMMIT()`. Expect `state: COMMITTED`, `DB_WRITES: 2`,
   `COLUMNS_APPENDED: 2`, `ROWS_CHANGED: 0`, empty `preexisting_cell_mismatches`, empty
   `new_column_non_blank_cells`, `census_unchanged: true`, and both `fingerprint_after_matches_expected: true`.
6. Re-run the DRY RUN. It must now say `NOTHING_TO_DO`.
7. **Delete the file from the Apps Script project.** It is not part of any deployment.

If anything in step 3 or 5 differs, **stop and report it** — do not edit the checksum to make it match. The
checksum is the confirmation; forcing it past a mismatch is the one way to defeat every guard in the file.

## B4.7 — Tests

`assets/tests/allocation-two-column-append-migration-f1-7n-fb-4f-b4.test.js` — **285 passed, 0 failed; 17
mutations, 17 caught.** All 30 required cases. The suite **executes the migration** against an in-memory
spreadsheet and inspects the cells afterwards.

The fixture rows are loaded with every backfill temptation on purpose — `marketplace = Amazon`, a destination
warehouse code snapshot, warehouse ids, created/updated timestamps, a shipping method, and a note literally
containing the attempted `2026-10-16` — so "no backfill source is consulted" is proven by both columns staying
blank on all ten rows, not by reading the source for forbidden words.

**Four mutations initially survived, and all four for the same reason:** they were caught by a *neighbouring*
guard rather than by the check they targeted. A blank checksum is also rejected by the prefix guard; a pre-lock
checksum mismatch is also rejected under the lock; drift that breaks the schema is also rejected as
`REFUSED_UNDER_LOCK`; and tampering with a quantity also trips byte-equivalence. Each probe was rewritten to
attack the point of detection — assert the specific typed reason, assert the lock was never taken, drift the
data without breaking the schema, append a row past the snapshot range instead of editing one inside it. This is
the same lesson B2 paid for with N1/N2/N3.

Two real defects in the helper were found by these tests, not by reading it:

* **A refusal still proposed a write.** The two tables are analysed independently, so a clean line table
  produced a write while the header table was refusing. A plan that still lists a write is a plan someone can
  approve. Refusal is now about the operation, not one of its halves.
* **The write loop resolved its sheet by the write's POSITION.** Correct only while both writes are outstanding:
  in a partial run — one column already appended — the single remaining write would have been applied **to the
  wrong sheet, at the right column number**, putting `expected_arrival` at index 30 of the drafts table. It now
  resolves the sheet by the write's own table name.

**Full sweep: 387 suites, 383 pass, 4 fail — the four long-standing failures and nothing else. 0 new.**
Bundle `--check` parity PASS, hash `d782ea6d…c36ac` unchanged: the helper is outside the deployment set, so it
correctly does not enter the bundle.

## B4.8 — Versions

No deployed file changed in this round, so nothing moved: `SAD_BUILD_VERSION_` stays `F1-7N-FB-4F-B3`,
`RTR_BUILD_VERSION_` stays `F1-7N-FB-4E-R4B-R3`, action contract **10**, required-action list version **9**,
transport contract **1**. The helper is not a manifested deployment owner and adds no action, verb or route.

**No Apps Script sync and no deployment are required by B4.**


## B5.0 — The live state B5 starts from

B4's append landed. Both new columns exist and are BLANK on every existing row, which is what makes this round
possible: there is now somewhere to put a route destination, so "what IS each header, and what happens if
someone saves the route the operator keeps trying to save?" is finally a question with an answer.

```
shipping_allocation_drafts        35 columns, 4 rows, sf:870364de
shipping_allocation_draft_lines   31 columns, 6 rows, sf:122f48c3
planned_qty 1020 · matched lines 6 · orphans 0
```

## B5.1 — The diagnostic

`assets/tools/apps-script-diagnostics/TEMP_shipping_allocation_post_schema_identity_b5_dry_run.gs`
Entry point: `TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN()` — argument-free, no COMMIT, no writer.

**Read-only is enforced by construction, not by intention.** Every sheet is wrapped in a façade exposing exactly
one capability, `getDataRange().getValues()`. `setValue`, `appendRow`, `insertColumnsAfter`, every ensure helper
and `LockService` are not merely unused — they are UNREACHABLE from the objects this file holds. A promise not to
write is worth less than an object that cannot, and the suite mounts a spreadsheet whose every mutator THROWS,
so a diagnostic that tried would fail the suite rather than quietly succeed.

Like B4, it carries no fallback copy of the K4 authority. Missing symbols → `AUTHORITY_NOT_LOADED`, and nothing
is classified: a diagnostic that guesses an identity rule reaches a different verdict than the writer would.

### Tables read — four, each with a stated reason

| table | why |
|---|---|
| `shipping_allocation_drafts` | the subject |
| `shipping_allocation_draft_lines` | the ONLY table storing a foreign key to an allocation header |
| `shipping_plans` | to MEASURE a negative: that it stores no allocation FK |
| `shipping_plan_lines` | the same negative, at line grain |

The two plan tables are read to confirm rather than quote a load-bearing claim. `16_` states it outright:
idempotent Submit retry *"would require a NEW allocation_draft lineage column on shipping_plans (prohibited)"*.
Lineage is returned in the RESPONSE and never persisted, and submit idempotency binds on
`shipping_plans.submit_batch_id === execution_key` — not on any allocation id.

**So re-keying a header cannot orphan anything downstream. The risk is entirely upstream, in the lines.**

## B5.2 — The four headers — **RETRACTED, see §B5.9**

> **This table described the OFFLINE TEST FIXTURE, not the live database.** It was written before the diagnostic
> had ever been run against production, and it is wrong about the live rows. It is kept, struck through, because
> deleting a wrong claim hides that it was made. The live evidence is in §B5.9.

| ~~header~~ | ~~destination~~ | ~~service~~ | ~~decision~~ |
|---|---|---|---|
| ~~the target (`ResUS/US/Amazon`)~~ | ~~**none stored**~~ | ~~`sea`~~ | ~~`SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE`~~ |
| ~~`ResUS/US/Walmart`~~ | ~~warehouse~~ | ~~`sea`~~ | ~~`SAFE_TO_RETAIN_AS_IS`~~ |
| ~~`ResTW/JP/Amazon`~~ | ~~warehouse~~ | ~~`air`~~ | ~~`SAFE_TO_RETAIN_AS_IS`~~ |
| ~~the submitted `K3` row~~ | ~~none stored~~ | ~~`sea_express`~~ | ~~terminal~~ |

The target row's plan SCOPE marketplace is `Amazon` and its route destination cell is blank. Those are different
axes: scope is a PLAN axis, destination is a ROUTE axis, and `ricDestinationIdentity_` reads only the route axis.
That is why the row is still `ROUTE_DESTINATION_MISSING` even though the page has always displayed "Amazon".

## B5.3 — The target: persisted `sea`/800 against attempted `sea_express`/`Amazon`/400

Held apart on purpose, because conflating them is the whole defect.

```
PERSISTED_LEGACY          service sea · planned_qty 800 · destination (blank) · expected_arrival (blank)
USER_ATTEMPT_EVIDENCE_ONLY service sea_express · destination Amazon · qty 400 · eta 2026-10-16 — persisted nowhere
```

800 is reported, never changed. 400 is never created. `2026-10-16` is never backfilled, and the diagnostic proves
that by reading the actual ETA cells rather than by asserting it.

**The future-save simulation runs the SHIPPED resolver read-only, and its two answers differ — which is the
safety property, not an inconsistency:**

```
save sea_express + Amazon        -> CREATE_DISTINCT_K4_HEADER
save the SAME sea route + Amazon -> K4_IDENTITY_RECONCILIATION_REQUIRED
```

`sea_express` is a different service, so its K2 key differs from the stored `sea` row and it can be created
beside it. Supplying `Amazon` on the SAME `sea` route reproduces the stored row's own K2 key, so it is refused
for reconciliation instead of silently adopting or duplicating a legacy row. `sea` never becomes `sea_express`,
in either direction, and the attempted route can never adopt or overwrite the persisted one.

## B5.4 — The hydration trace, and the exact cause of the blank route row

| boundary | headers | lines | qty | dropped | reason |
|---|---|---|---|---|---|
| 1 sheet rows | 4 | 6 | 1020 | 0 | — |
| 2 active + station scope | 1 | 1 | 800 | 3 | `TERMINAL_STATUS:submitted`, `OUT_OF_STATION_SCOPE` ×2 |
| 3 route identity | 1 | 1 | 800 | 0 | `ROUTE_DESTINATION_MISSING` — **RETURNED, not dropped** |
| 4 client route model | 1 | 1 | 800 | 0 | — |

**No quantity is lost at any boundary.** The API does return the existing allocation route, and the client does
NOT drop it — measured by executing the shipped `_hydrateAllocationDraftFromDb`, which accepts the row and
carries the persisted 800 into the route model.

Two things then happen, and they are different problems in different layers.

**First, the page manufactures a destination.** The shipped hydrate contains

```js
destination_marketplace: hTo ? '' : (ctx.marketplace || ''),
destination_type:        hTo ? '' : 'MARKETPLACE_DESTINATION',
```

so when the header stores no destination warehouse it SYNTHESISES one from the plan scope. It never reads the
new persisted `destination_marketplace` column at all. That value is `UI_DERIVED_NOT_AUTHORITATIVE`, and it is
why `_isRouteComplete` returns TRUE for a route the database cannot identify — the panel looks like it holds an
Amazon route while the database holds a route with no destination.

**Second, the To cell renders blank anyway, because the round trip is asymmetric.**

```
_saveAllocationDraftFromDom  WRITES  destination_type / destination / the MARKETPLACE_DESTINATION: token
_hydrateAllocationDraftFromDb EMITS  destination_type + a scope-derived marketplace, and NEITHER the token
                                     nor a display name
_renderExecutionRoute        SELECTS toSelId = destination_warehouse_id || resolveIdByName(cand, destination)
_execToOptionsHtml           SELECTS the Amazon option ONLY when selectedId === the token
```

Executed: `toSelId` resolves to `''`, the Amazon option is offered but NOT selected, and the operator sees the
`To…` placeholder. Supplying the token DOES select it, which proves the gap is the missing token and not the
option list.

### So: expected fail-closed behaviour, or a hydration bug?

**Both, in different layers, and the database half is correct.**

* The blank *destination* is CORRECT and must not be "fixed". The row genuinely has no route identity; that is
  the FB-4F-A defect this whole workstream exists for.
* The blank *To cell* is a real client round-trip defect, present since before this workstream.
* The scope synthesis is the dangerous one: it makes an unidentifiable route look identified.

**Fixing only the render would be the worst outcome available** — the UI would show a confident "Amazon"
destination that the database does not hold, which is exactly the silent-drop class this workstream exists to
end. The render fix belongs AFTER the destination is persisted, not before.

**How to tell which branch you are looking at, in one glance:** `initializeShippingAllocation` has exactly two.
If the Qty box shows **800**, the persisted route hydrated and only the To cell is blank. If it shows the
Suggested Qty with From/Method also empty, nothing hydrated and you are looking at the default Add Route editor.
The measured contracts say the first; the Qty box settles it without a debugger.

## B5.5 — Verdict and readiness

```
VERDICT  READY_FOR_REVIEWED_USER-CONFIRMATION_PLAN

schemaReady                 true    35/31, both runtime gates ACCEPT
runtimeAuthorityReady       true    B3 authority loaded
existingRouteHydrationReady false   the active header cannot name its own destination
newDistinctRouteSaveReady   true    a sea_express/Amazon save creates a distinct K4 header safely
legacyAdoptionReady         true    on an EXPLICIT user save, no collision, stored id retained
submitReady                 false   while an active header has no route identity
```

Six independent booleans, never collapsed. Quantity 1020 before and proposed, 6 matched lines, 0 orphans, no
duplicate line identities, no downstream references, and retaining the current ids is REQUIRED — the lines are
the only stored FK consumer, so re-keying a header would orphan every line pointing at it.

## B5.6 — RUNBOOK (USER-RUN, paste → run → remove)

1. Paste the file into the Apps Script project as a new file. Save.
2. Run `TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_DRY_RUN()`.
3. Read the four header classifications, the target analysis, the hydration boundaries and the six booleans.
   Expect `DB_WRITES=0 · ROWS_CHANGED=0 · BACKFILLS=0 · IDS_CREATED=0`.
4. **Delete the file from the project.** It is not part of any deployment.

There is no COMMIT to run. This file has no writer.

## B5.7 — Tests

`assets/tests/allocation-post-schema-identity-f1-7n-fb-4f-b5.test.js` — **250 passed, 0 failed; 16 mutations, 16
caught.** All 23 required cases. The suite executes BOTH sides: the real diagnostic against an in-memory
spreadsheet, and the SHIPPED page functions (`_hydrateAllocationDraftFromDb`, `_isRouteComplete`,
`_execToOptionsHtml`) extracted from `assets/js/pages/inventory-replenishment.js`, so the blank-route verdict is
measured rather than reasoned about.

Three mutation probes had to be rewritten, each for a reason worth recording:

* **The rival-rule mutation needed a rival that only K2 can see.** Removing B3's "rivals are rows K4 cannot
  classify" restriction is invisible unless some ACTIVE, CLASSIFIABLE row shares the attempted route's K2 key.
  K2 has no destination-marketplace dimension, so a `Walmart`-destination `sea_express` row on the same
  scope/source/group collides in K2 and not in K4 — exactly the case the restriction exists for.
* **The canonical-service mutation was undetectable on the target strings**, because `sea` and `sea_express` are
  already canonical, so bypassing the resolver changes nothing. It attacks stored data instead: `seafood` must
  never resolve to `sea`.
* **The read-only façade is deliberately NOT mutation-tested.** The tool never writes with or without it, so no
  behavioural probe can distinguish the two. Its guarantee is structural and is asserted structurally; claiming
  a mutation "caught" there would have been a green light for the wrong reason.

Two assertions of my own were found scanning PROSE rather than CODE: the file's header deliberately NAMES the
mutators it cannot reach, and `typeof ricK4GroupKey_ === 'function'` contains the substring `ricK4GroupKey_ =`.
Both now strip comments and test for a DEFINITION rather than a mention — the same vacuous-assertion class as
B3's `O2`.

**Full sweep: 388 suites, 384 pass, 4 fail — the four long-standing failures and nothing else. 0 new.**
Bundle `--check` parity PASS, hash `d782ea6d…c36ac` unchanged.

## B5.8 — Versions

No deployed file changed. `SAD_BUILD_VERSION_` and `RIC_BUILD_VERSION_` stay `F1-7N-FB-4F-B3`,
`RTR_BUILD_VERSION_` stays `F1-7N-FB-4E-R4B-R3`, action contract **10**, required-action list version **9**,
transport contract **1**. No Apps Script sync or deployment is required by B5.

### What B6 has to decide (not decided here)

The persisted route needs a destination, and only a human can supply it. The two candidate shapes are a
controlled single-route UI save test, or a reviewed user-confirmation plan that adopts the stored id in place.
Either way the client's scope synthesis should stop BEFORE the render fix, or the UI will keep asserting a
destination the database does not have.


## B5.9 — CORRECTION: what was measured, what was reported, and where the two parted company

### The mistake, stated plainly

The B5 completion report presented a four-row table as the live state of `shipping_allocation_drafts`. **It was
the offline test fixture.** The diagnostic had not been run against production when that report was written; the
suite's `FX.headers` array was read as though it were a census. Two of its claims are now known to be false of
the live database:

* a `ResUS / US / Walmart` header with a **warehouse** destination — no such row has been observed;
* a `ResTW / JP / Amazon` header with a **warehouse** destination — the live row of that scope stores **no
  destination at all**.

This is the same failure the entire FB-4F workstream exists to end, committed by the report rather than by the
code: **evidence of one rank presented as evidence of another.** The diagnostic itself was right — it classified
whatever rows it was given, and against the fixture it classified them correctly. Nothing in the tool needed to
change for this correction, and nothing in it did.

### The three evidence classes, which must never again be merged

| class | what it is | where it comes from | may it be reported as a live fact? |
|---|---|---|---|
| **offline fixture** | rows invented by the regression suite to exercise a code path | `assets/tests/…-b5.test.js` | **NO** |
| **user-reported B4 census** | counts the operator read off the sheet (35/31, 4 rows, 6 lines, 1020, 6 matched, 0 orphans, digest `52d8989b`) | the B4 task statement | Yes, **as a user report**, and it is not independently reproducible here |
| **B5 live runtime measurement** | what the diagnostic printed when run against production | the Apps Script execution log | Yes — this is the only class that settles what the live rows ARE |

### The live runtime evidence actually obtained (first production run, truncated)

Three headers were visible before the log was cut off. Reported exactly as seen, and no further:

```
1. ResUS / US / Amazon   service=sea_express  destination BLANK  line_count=0
   decision = SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE
2. ResUS / US / Amazon   service=air          destination BLANK  line_count=0
   decision = SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE
3. ResTW / JP / Amazon   service=air          destination BLANK  line_count=5  qty=220
   decision = (not reached before truncation)
```

Confirmed in the same run: read-only, schema 35 / 31, fingerprints correct, both runtime gates ACCEPTED.

**NOT OBTAINED, AND NOT GUESSED HERE:** the fourth header, the target analysis, the boundary census, the six
readiness booleans, the global verdict and the footer. The full summary awaits the R1 live run. This section will
not speculate about any of them, and no decision may be taken as though they were known.

### What the live evidence already changes

* **No warehouse destination has been observed anywhere.** Every header seen so far stores neither a destination
  warehouse nor a destination marketplace, so all three are K4-unclassifiable for the same reason.
* **Two headers carry zero lines.** A header with no lines is still a header; a census that omits it is wrong in
  exactly the direction that hides work. The compact view emits every header, and a mutation test now proves it.
* **`line_count=0` on both `ResUS/US/Amazon` rows means the CO1100-R / 800 line is not under either of them.**
  Where that line sits is a question for the R1 run, not an assumption for this document.
* **The two `ResUS/US/Amazon` rows are not contested by K2**, because their services differ (`sea_express` and
  `air`) and service is a K2 dimension — but that is a reading of the rule, and the run will say so or not.

### Why the first log was truncated

The full report is one pretty-printed object carrying every header's `line_ids` and `line_natural_keys`, four
hydration boundaries with their row models, the read-table inventory and the refusal vocabulary. Apps Script caps
what its execution transcript will show, and `verdict`, `readiness` and `footer` sit at the END of the object —
so the cap ate precisely the lines that decide anything.

The fix is **not** to shrink the full report, which is the complete evidence and should stay complete. R1 adds a
second RENDERING of the same report: `TEMP_SHIPPING_ALLOCATION_POST_SCHEMA_IDENTITY_B5_SUMMARY()`, one short
`[FB4FB5S]`-prefixed line per section, verdict and footer last and on their own lines. Both entry points call the
same `tb5BuildReport_()`; the compact view formats and decides nothing, which is asserted by tests and defended
by seven mutations.

### What this correction does NOT authorise

No destination backfill. No ETA backfill. No ID rewrite. No K4 id creation. No submit. No reconciliation of any
legacy row. The verdict is unknown until the R1 live run prints it, and an unknown verdict authorises nothing.


## B6 — LEGACY ROUTE EXPLICIT CONFIRMATION + HYDRATION REPAIR

The first round in this series that CHANGES what the operator sees and what the database holds. B1–B5 measured;
B6 acts on the measurement, and only on the measurement.

### B6.0 — The live baseline this round acts on

The B5 SUMMARY run against production, taken as fact and never re-derived from a fixture (§B5.9's rule):

| | |
|---|---|
| drafts | 35 cols · 4 rows · `sf:870364de` · gate ACCEPTED |
| lines | 31 cols · 6 rows · `sf:122f48c3` · gate ACCEPTED |
| totals | raw quantity 1020 · matched lines 6 · orphans 0 · downstream stored FK 0 |
| checksum | `fb4b5-1:4e40c4f3` |

| | scope | service | destination | lines | qty | decision |
|---|---|---|---|---|---|---|
| **H1** | ResUS / US / Amazon | `sea_express` | **blank** | 0 | 0 | `SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE` |
| **H2** | ResUS / US / Amazon | `air` | **blank** | 0 | 0 | `SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE` |
| **H3** | ResTW / JP / Amazon | `air` | **blank** | 5 | 220 | `SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE` |
| **H4** | ResUS / US / Amazon | `sea` | **blank** | 1 | 800 | `SAFE_TO_ADOPT_ON_EXPLICIT_USER_SAVE` |

`sea_express` / Amazon / 400 / ETA `2026-10-16` is **ATTEMPT EVIDENCE ONLY**. It is persisted nowhere, it must
never overwrite `sea` / 800, and the date must never be backfilled.

### B6.1 — The seven diagnostic answers, each demonstrated before anything was changed

**1. Why the hydrate synthesised `destination_marketplace = ctx.marketplace`.**
The three destination fields were all derived from ONE input — `hTo`, the persisted destination WAREHOUSE:

```js
destination_warehouse_id: hTo,
destination_type: hTo ? '' : 'MARKETPLACE_DESTINATION',
destination_marketplace: hTo ? '' : (ctx.marketplace || ''),
```

A blank warehouse was read as "therefore a MARKETPLACE destination", and the only marketplace the page had in
hand was its own filter. Before B4 there was no `destination_marketplace` column to read, so the fallback was
the only way a marketplace route could round-trip at all — it was a workaround that outlived its reason and
became a fabrication. The value then passed the completeness gate and was written back on the next save.

**2. Why the To selector still rendered its placeholder.**
`_renderExecutionRoute` computed `toSelId = route.destination_warehouse_id || _execResolveIdByName(...)`. The
hydrate emitted `destination_type` and `destination_marketplace`; the `<select>` matches on an option **value**,
which is the token `MARKETPLACE_DESTINATION:Amazon:US`, and neither field is that token. Measured: the Amazon
option IS in the list, and supplying the token DOES select it. The gap was the token, never the option list.
The save path emitted the token and the hydrate did not — an asymmetric round trip.

**3. Why H4's persisted 800 showed as Qty 0.** *(the answer is not what the symptom suggests)*
The quantity was never lost. Run the shipped hydrate against the live row and `planned_qty` is 800. **The
hydrate never ran.** `_restoreAllocationDraftFromSession` is called at MOUNT and its first act is
`var ctx = _replenCtx()`, which reads the two scope `<select>` elements — and at mount those are still empty,
because `populateReplenFiltersFromRegistry` and `_irBootstrapScope_` / `_irSetSelectors_` run later, inside
`_irMountAfterLoad`. With an empty scope the guard `(ctx.country || ctx.marketplace)` is false and the hydrate
is skipped entirely. The only other call site is the AI-Plan generation readback, which is gated off. So
`bySku` stayed empty, `_allocationDraftRowsFor` returned null, and `initializeShippingAllocation` fell to its
SECOND branch — the default Add Route editor, seeded with `parseInt(skuData.suggestedQty) || 0`. **That editor
showing 0 is the "Qty 0".** It was never H4's row at all.

**4. Why both simulations return `K4_IDENTITY_RECONCILIATION_REQUIRED`.**
Not one live header stores a resolvable destination, so K4 can classify none of them and finds no match — it
would CREATE. But before creating, the resolver asks whether a row exists that K2 WOULD have claimed. K2 has no
destination dimension, so a destination-less row and a marketplace route produce the same key. One does, so
creating beside it would duplicate the route and adopting it would migrate a live row — both forbidden without
a human, hence BLOCK.

**5. The rival, per simulation.** Service is a K2 dimension and `sea` never answers for `sea_express`:

* `sea_express` + Amazon → **H1** (the `sea_express` header, 0 lines)
* `sea` + Amazon → **H4** (the `sea` header, the one holding the 800)

**6. Do the zero-line H1/H2 participate in rendering, identity matching, or both?**
**Identity matching: yes. Route rendering: no. And a third thing nobody asked about: they were being sent to
Submit.** The hydrate puts all three US headers into `allocationDraftIds` but produces no `bySku` row for a
header with no lines, so nothing renders. On the server they are ACTIVE rows and therefore candidates — H1 is
the `sea_express` rival above. `_replenActiveAllocationDraftIds` then sent every hydrated header id to Submit,
which is where the third fact bites (see §B6.4).

**7. Can an existing action do this, or is a contract change required?**
**An existing action.** `sadAtomicUpsertCore_` already accepts `allow_legacy_reconcile`, a USER-owned migration
authority, and already passes it to the resolver — the K4 branch simply ignored it. B6 gives that flag a
second, narrower meaning inside the K4 branch and enforces every condition server-side. **Action contract stays
10, `SYS_REQUIRED_ACTION_LIST_VERSION_` stays 9, transport contract stays 1. No new action, no new route.**

### B6.2 — One destination authority (§D)

`IRWarehouse.resolvePersistedDestination(persisted, scope)` is the client mirror of 69_ `ricDestinationIdentity_`:
warehouse XOR marketplace, read from the STORED row and nothing else. Four exhaustive states:

| state | To renders | route complete? |
|---|---|---|
| `PERSISTED_WAREHOUSE` | the stored warehouse, selected by its id | yes |
| `PERSISTED_MARKETPLACE` | the stored marketplace, selected by `MARKETPLACE_DESTINATION:<mkt>:<CC>` | yes |
| `DESTINATION_CONFIRMATION_REQUIRED` | **blank, with a stated requirement** | **no** |
| `DESTINATION_AMBIGUOUS` (both stored) | **blank, refused — not resolved by preferring one** | **no** |

TWO fallbacks were removed, not one. The hydrate's was a display accident; the second lived in
`routeHeaderFields` — `route.destination_marketplace || route.destination_country || scope.marketplace || ''`
— and fed the WRITE payload. Since B4 made `destination_marketplace` a stored column, a value invented there
is a permanent business fact. It could also have written a COUNTRY into a marketplace field.

The token format is now constructed in exactly one place; `amazonLogicalToken` delegates to it. §D.8 forbids a
second destination dictionary, and two functions that each know the layout are exactly that.

### B6.3 — The adoption algorithm (§G), in resolution order

Inside the K4 branch of `sadResolveActiveDraftK2OrK3_`, all of it server-enforced:

1. **Exact persisted K4 match** → REUSE that row under its **own stored id**. Unchanged.
2. **K4 contested** → `BLOCKED_CONFLICT`, zero write. Unchanged.
3. **More than one unclassifiable legacy candidate** → BLOCK `K4_IDENTITY_RECONCILIATION_REQUIRED`, zero write.
   Checked **before** the adoption branch: no amount of user authority makes "which of these two did you mean?"
   answerable by a resolver.
4. **Exactly one unclassifiable legacy candidate**, matching on all ten K2 dimensions and differing only by a
   missing destination → **adoptable, and only when BOTH hold**:
   * `opts.allowLegacyReconcile === true` — the explicit, user-given authority; and
   * `ricDestinationIdentity_(header).ok` — the request actually CARRIES a destination. Adopting a legacy row
     to write another blank destination onto it moves an identity for no gain, which is worse than refusing.

   The **stored id is returned unchanged**: updated in place, never re-keyed, no second header, and every
   `shipping_allocation_draft_lines` row that points at it keeps pointing at it.
5. Otherwise → CREATE a distinct K4 route. A classifiable different destination is a different route.

Terminal, out-of-scope and service-mismatched rows are excluded by mechanisms that already existed:
`sadReadActiveHeaderRows_` drops terminal rows, and company / country / marketplace / planning cycle / source
page / source warehouse / service / last-mile / group number are all K2 dimensions. A terminal header named
EXPLICITLY by id is refused a second time by the writer's own `IMMUTABLE_TERMINAL_STATUS` guard.

**`destination_marketplace` joined `SAD_K2_HEADER_FP_`, and without that the whole thing is a silent no-op.**
Giving a destination-less header its first destination changes nothing else — same source, service, status,
quantity. Outside the fingerprint, prior and incoming compared EQUAL, the writer returned `REUSE` with
`zero_write`, and the operator would have been told the save succeeded while the column stayed blank. The
fingerprint is computed per request from both sides and never stored, so adding a field both sides leave blank
changes nothing for any other row and no id moves.

### B6.4 — The zero-line submit decision (§I), determined rather than guessed

`sadSubmitToShippingPlansCore_` validates EVERY requested draft id. Gate (3) refuses a header with no lines
(`NO_LINES`), and **any** error fails the WHOLE batch with `SUBMIT_VALIDATION_FAILED` and zero writes.

> **Decision: a zero-line active header sent to Submit blocks the entire submit.** It does not merely contribute
> nothing — it makes Submit impossible for every real route beside it.

§J forbids deleting H1/H2, so the fix cannot be on the server: **the CLIENT must stop sending them.**
`_replenActiveAllocationDraftIds` now restricts its two fallbacks to ids that a complete on-screen route is
actually bound to. The server gate is untouched — it is still the authority, and nothing about it was weakened.

Beside it, a new client gate: a route that plans a quantity with **no persisted destination** blocks Submit
before any request, naming each route. Before B6 this state could not appear on screen, because the hydrate
synthesised a destination for every route; now that a destination-less row comes back honestly, Submit needs
its own named refusal rather than silently dropping the route.

### B6.5 — The confirmation (§F)

An adoption is the one save on this page that mutates a live row's meaning, so it is the one save that is not
silently debounced. `destination_state` travels hydrate → `data-dest-state` → collect, so the gate asks about
what was **PERSISTED** rather than re-deriving it from the current selection. The dialog names From, the chosen
To, Method, Qty, an Expected Arrival **only when one is explicitly present**, and states that the existing
record — by id — will be updated.

The question is asked **before** the stale-group cancels and **before** the line-cancel dispatch, both of which
are themselves writes; asking after them would make "cancel writes nothing" false. A decline returns out of the
flush and puts the queued cancels back. **No reachable confirm function is not consent** — it refuses.

### B6.6 — Expected Arrival (§H)

`sea` and `sea_express` remain two services with two rate cards (B1). There is no prefix ladder left in
`_irMethodToLeadKey` and `ricCanonicalService_` returns `''` for an unknown spelling rather than a neighbour's
number. `expected_arrival` is in `SAD_K2_LINE_FP_`, so an ETA-only edit forces a real write; it is in NEITHER
group key, so it updates the SAME route. `2026-10-16` appears in no shipped source.

**One item is deliberately NOT implemented.** §H.5 asks that an explicitly saved ETA be persisted. The shipped
Execution Plan has **no ETA input** — the cell is a `<span>` holding a value COMPUTED from carrier lead times.
Wiring that display value into the line payload would persist a derived date as though the operator had chosen
it, which is precisely the backfill §H.7 forbids. So `buildDraftLinePayload` still carries no `expected_arrival`
from the display, and the server-side path is proven instead by saving an ETA through the writer directly.
**Giving the operator a real ETA field is a separate decision and is not taken here.**

### B6.7 — §J: the two empty headers, recorded for a LATER decision

H1 and H2 are plausible test remnants. **B6 deletes nothing.**

| | |
|---|---|
| lines | 0 |
| quantity | 0 |
| downstream reference | none |
| status | active `draft` |
| destination | missing |

They stay exactly as they are, active, and are simply no longer sent to Submit. No physical delete, no
auto-cancel, no expiry. Their safe disposition can be reviewed **after** adoption behaviour has been live long
enough to show whether either of them is actually reused — which is a thing only running the fixed page can
tell us, and is the reason the decision is deferred rather than taken now.

### B6.8 — Deployment (§K)

| axis | value |
|---|---|
| action contract | **10, unchanged** |
| required-action list version | **9, unchanged** (`SYS_REQUIRED_ACTION_LIST_VERSION_`) |
| transport contract | **1, unchanged** |
| `SAD_BUILD_VERSION_` | `F1-7N-FB-4F-B3` → **`F1-7N-FB-4F-B6`** (16_ changed) |
| `RIC_BUILD_VERSION_` | `F1-7N-FB-4F-B3`, **unmoved** (69_ unchanged) |
| bundle | **not rebuilt** — the bundle ports `assets/js/core/` only; hash `d782ea6d…c36ac` unchanged |

`APPS_SCRIPT_SYNC_REQUIRED`, in order:

1. `16_shipping_allocation_handlers.gs` — the adoption path + the fingerprint + the owner stamp
2. `63_api_v1_system_health.gs` — the manifest expectation for that stamp

63_ must not be published ahead of 16_: it would declare a stamp the deployment does not carry and every page
would report `DEPLOYMENT_PARTIAL_SYNC`. **A deployment version must be created after both are saved** — the
frontend's identity probe is what tells a page whether the writer it depends on is actually there.

`FRONTEND_PUSH_REQUIRED`: `assets/js/pages/inventory-replenishment.js`,
`assets/js/utils/inventory-compat.js`, `assets/css/pages/inventory-replenishment.css`, `index.html`.
Application token `skudisplayinit-20260901` → **`fb4fb6-legacyroute-20260901`** across all 18 co-deployed
references; the inventory stylesheet keeps its own token family and moves `ffcols-20260820` →
`irexecplan-20260901`. No reference is duplicated and no map / earth token moved.

**ORDER MATTERS AND IT IS NOT THE USUAL ONE.** The frontend can be pushed first and is harmless on its own: a
destination-less route renders honestly, refuses to save, and blocks Submit with a named reason — which is
strictly better than today. But **the adoption cannot succeed until 16_ is synced**, and until then an
explicit confirmation will end in `K4_IDENTITY_RECONCILIATION_REQUIRED` with zero writes. That is fail-closed
and correct, not a broken state — but it will look like the fix did not work, so sync Apps Script first if
both are going out together.

### B6.9 — What B6 does NOT authorise

No destination backfill. No ETA backfill. No ID rewrite. No deletion, cancellation or expiry of H1/H2. No
submit. No migration script. Every write in this round happens because a human chose a destination and
confirmed it, one route at a time.


## B6-R1 — EXPECTED ARRIVAL: A STRUCTURED VALUE WITH ONE OWNER, AND ONE DECISION THAT IS NOT OURS

B6 recorded exactly one item as deliberately unimplemented — persisting an explicitly saved Expected Arrival.
R1 was asked to close it. It closes everything the closure needs **except the one input the business has never
defined**, and stops there rather than choosing it.

### B6-R1.0 — Precondition divergence, reported read-only

The task expected `origin/main` = `99996b3` and stated that B6 was not yet pushed. **It was.** The local
reflog records `refs/remotes/origin/main@{0}: update by push → 60afa6e`, and `main` and `origin/main` are both
`60afa6e`, 0 ahead / 0 behind. Nothing was fetched, merged, rebased or reset. This changes exactly one
decision, §H, and it changes it decisively — see B6-R1.7.

### B6-R1.1 — The ETA authority, traced by execution (§C)

| question | answer, as measured from the shipped code |
|---|---|
| **1. departure base date** | `new Date()` → the **browser's local midnight**. R1 changes this to the **project calendar day (Asia/Taipei)**. |
| **2. lead-time record** | `carrier_lead_times`, matched on `shippingMethod` = the mapped key AND (`destinationCountry` blank OR equal to the destination country); first row carrying a numeric `avg_days`; `Math.round`. |
| **3. service canonicalisation** | `_irMethodToLeadKey` — two EXACT tables (canonical enum, then display labels). Unknown → `''`. |
| **4. sea vs sea_express** | `sea` → `Sea`; `sea_express` → `Sea Express`; `快船` / `美森海卡` → `Sea Express`. Two keys, two rate cards. |
| **5. family fallback** | **None.** No prefix ladder, no `startsWith('sea')`. B1 removed it and R1 re-proves it by execution: with ONLY a `Sea` row present, `sea_express` resolves to **nothing**. |
| **6. where the value lived** | Nowhere structured. `_irComputeRouteEta` returned `{ text, available }`, and `text` was `'2026-11-02 (est. 15d)'`. |
| **7. DOM-only?** | **Yes — and worse.** The collect read it back with `etaEl.textContent`, so `row.expected_arrival` held the whole sentence. |

That last row is the finding. `(est. 15d)` is not part of any date. Nothing persisted the field, so it never
reached the database — but it was the value the B6 confirmation dialog showed the operator, and it is what any
future wiring would have written into a date column.

### B6-R1.2 — One owner, one structured value (§C)

* `_irComputeRouteEta` now returns `{ text, available, date, days, lead_key, source }`. The **date** is the
  answer; the display sentence is derived FROM it. Still exactly one calculator — what changed is that its
  answer is structured.
* `_irRouteEtaFor` is the single owner of *which* ETA a route shows: a persisted snapshot, or a live figure.
* The renderer publishes both: `data-eta` carries the date, the cell text carries the sentence.
* The collect reads `data-eta` and **re-validates its shape** — a DOM attribute is still the DOM.
* The confirmation dialog now shows `2026-11-02` rather than `2026-11-02 (est. 15d)`.

### B6-R1.3 — Snapshot beats recomputation (§D.5/§D.6)

A persisted `expected_arrival` is a **snapshot of what was true when it was saved**, and it must not move
because someone later edited the carrier lead-time table — that would silently rewrite a commitment the
operator already made. So:

| state | shown |
|---|---|
| stored date, same service | **the stored date** (`source: PERSISTED`) |
| stored date, service since changed | the live figure — a different service is a different route |
| stored blank | the live figure, and the stored blank **stays blank** |
| no exact lead time | blank + `Lead time unavailable`; **no date is guessed** |

The basis is compared through the SAME canonicaliser on both sides, so `普船` and `sea` are one basis while
`sea` and `sea_express` remain two. `_irUpdateRouteEtas` — which fires when the carrier reference finishes
loading, and is **not** a user edit — carries the stored snapshot on the cell so an async recompute cannot
replace a saved commitment, and it schedules no save.

### B6-R1.4 — Date semantics (§E)

* Base day read in **Asia/Taipei** — the project's canonical wall clock, the same zone `sadCanonDate_` uses
  server-side and the same Shared rule F.1 the Request Order month windows follow.
* Day arithmetic runs in **UTC** (`Date.UTC` + whole days), so no DST boundary can land the result on 23:00 the
  previous day. `toISOString()` is never called on a local-midnight Date — the other classic off-by-one.
* Stored shape `yyyy-MM-dd`, the project-wide date-only shape.
* An invalid date is **refused, never repaired**: `2026-02-30` returns blank rather than rolling into March.
* Proven across two REAL timezones. The shipped arithmetic is executed in child processes at `Pacific/Kiritimati`
  (UTC+14) and `Pacific/Midway` (UTC-11) and must agree; the naive formula must disagree between them. A
  timezone bug cannot be demonstrated from a single timezone, which is why the first draft of that probe was
  worthless.

### B6-R1.5 — THE BLOCKED DECISION (§E STOP)

§E instructed: *if the existing specification does not define the ETA base date, STOP and report the missing
business decision — do not choose today, created_at or updated_at.* **The specification names a base that does
not exist in this flow.**

`CARRIER_AND_ROUTE_SPEC.md` §5B Step B:

```
Expected Arrival = Planned Ship Date + max_days + Receiving Buffer
When production is required:
Expected Arrival = Planning Date + Production Lead Time + Handover Buffer + max_days + Receiving Buffer
```

and `INVENTORY_TABLE_MAPPING_SPEC.md` §326 lists **`planned ship date`** among this cell's recalculation
inputs. Measured against the code:

| the formula needs | does it exist? |
|---|---|
| **Planned Ship Date** | **No.** Not on the Execution Plan UI, not on the 35-column `shipping_allocation_drafts` header, not on the 31-column line, not on `shipping_plans`. (`expected_ship_date` exists only on PO/procurement tables — a factory's ship date for a different entity; `planned_departure_date` exists only on `shipment_routes`, a downstream entity that does not exist at planning time.) |
| **Receiving Buffer** | **No.** The spec names it and says it is separate from Lead Time. No field, table or value defines it. |
| **max_days** | Exists — but the shipped display uses **`avg_days`**, which the same paragraph calls the *normal/reference* ETA while reserving `max_days` for the ARRIVAL formula. |

So the shipped figure is `today + avg_days`, with no buffer. That is a perfectly reasonable **reference
display** and it is precisely the substitution a **persisted commitment** must not be built on — and `today`
is one of the three values §E explicitly forbade choosing.

> **THEREFORE: `expected_arrival` is NOT wired into `buildDraftLinePayload`, and that is the whole of what R1
> does not do.** Three decisions are needed before it can be:
> 1. What is the **Planned Ship Date** for an Inventory Replenishment Execution Plan route? (a new field the
>    operator sets? the planning cycle's departure? the date of the Save?)
> 2. **`max_days` or `avg_days`** — the spec's arrival formula says the former, the shipped display uses the latter.
> 3. What is the **Receiving Buffer**, and where does it live?

The blocked decision is written into `inventory-compat.js` at the exact line where the wiring would go, and a
test asserts the field stays absent — so a future round has to delete that test deliberately rather than
reintroduce a guess by accident.

### B6-R1.6 — What this means for H4 and H1

* **H4** (`sea`, 800, destination blank, ETA blank) — confirming Amazon adopts H4 under its own id and persists
  the destination, exactly as B6 does. The ETA **stays blank**. It is displayed as the live `sea` figure so the
  operator can see it, and it is not written. Under §D.8 it *would* be written in that same explicit save once
  the base date is decided; the adoption itself does not depend on it.
* **H1** (`sea_express`, 400 attempt) — same, and its displayed figure comes from the **`sea_express`** lead
  time. Proven by execution: with only a `Sea` row configured, `sea_express` shows `Lead time unavailable`
  rather than borrowing the `sea` number.
* **`2026-10-16`** appears in no shipped source, and no code path can carry a computed date into the payload.

### B6-R1.7 — The browser token (§H): a NEW token, and the reason is a fact

§H asked whether B6-R1 could be treated as the same unpublished release and reuse B6's token, *provided a test
proves that token was never deployed*. **That proof is not available, because it is false:** B6's commit is on
`origin/main`. Its bytes have left the repository, and any build serving them has handed browsers
`?v=fb4fb6-legacyroute-20260901`.

Reusing that token would leave every one of those browsers on the **B6** copy of
`inventory-replenishment.js` — the copy whose collect reads `etaEl.textContent` — with no cache-busting event
to ever replace it. That is exactly the half-updated deployment the shared token exists to prevent.

> **Rule, recorded: a cache token may be reused only while nothing carrying it has been published. Once its
> commit reaches a remote, the next change mints a new one.**

`skudisplayinit-20260901` → `fb4fb6-legacyroute-20260901` → **`fb4fb6r1-etasnapshot-20260901`**, all 18
co-deployed references together. `60afa6e` was not amended. No map, earth or unrelated token moved.

### B6-R1.8 — No server change (§F)

**Zero Apps Script files changed this round**, and that was verified rather than assumed: B3's writer already
accepts and persists `expected_arrival`, proven here by running the shipped `sadAtomicUpsertCore_` against an
in-memory sheet and reading the stored cell back. `SAD_BUILD_VERSION_` stays `F1-7N-FB-4F-B6`,
`RIC_BUILD_VERSION_` stays `F1-7N-FB-4F-B3`, contracts stay **10 / 9 / 1**, bundle hash unchanged.

**So the Apps Script sync set for the release is still B6's, unchanged, and R1 adds nothing to it.**

### B6-R1.9 — Suites restated, and the pattern that keeps recurring

* **B2 I6/I7** recorded `etaEl.textContent` as the finding. R1 fixed it, so the assertion was restated to keep
  the part that has NOT changed — the client's value is still UI-calculated from a carrier lead time and is
  still not a persisted fact.
* **B6 H9** pinned "the current app token IS my round's token". **Third round running** for this exact shape.
  Restated as a floor.
* **replen-execution-plan G7** captured the row builder with a 1600-character budget, and a comment spent it —
  the match came back empty and every assertion below reported a missing button that is right there. Bounded by
  its terminator now.
* **B5 and B6** both lift `_hydrateAllocationDraftFromDb` out of the page; it gained one pure helper, so both
  lifts had to carry it. Without it the hydrate's own `try/catch` swallowed the `ReferenceError` and returned
  false, which reads exactly like "the live row was dropped".

One probe of R1's own was worthless and had to be rebuilt: **M7** referenced a function eval'd inside another
section's closure, threw a `ReferenceError`, and the lenient `mut` helper scored the exception as a detection.
The helper now reports a throw as a **PROBE ERROR**, and M7 builds both the shipped and the mutant key function
from source so it depends on nothing another section happens to have loaded.


## 4G-A0 — CO1100-R LIVE HYDRATION CLOSURE: THE HYDRATE WAS NEVER WRONG, ITS SOURCE WAS EMPTY

B6 made the hydrate RUN. B6-R1 made its ETA a value. The route still did not appear, and the reason turned
out to be neither of those things.

### 4G-A0.0 — Preconditions

`main` = `origin/main` = `82da01c`; worktree clean; stash empty; `60afa6e` (B6) and `82da01c` (B6-R1) both
ancestors of HEAD and both PUSHED, so §A.3 is satisfied and the frontend of B6-R1 is publishable. The
operator confirmed the deployment contract separately: `ok=true`, `DEPLOYMENT_CONTRACT_OK`,
`endpointClass=STABLE_EXEC`, action 10, transport 1 — which proves the **Apps Script endpoint**, not the
browser's assets, and is not treated here as evidence of either.

### 4G-A0.1 — The root cause, in one sentence

`_hydrateAllocationDraftFromDb` read `window.KM.DB.getShippingAllocationDrafts()`, which returns
`_opDbCache.shippingAllocationDrafts` — **a cache slice with no writer the deployed server will honour.**

| the only two writers of that slice | what the deployed server does |
|---|---|
| `getOperationDb` → `normalizeOperationDb(db)` | `handleGetOperationDb_`'s `validTabs` does not list `shipping_allocation_drafts` or `shipping_allocation_draft_lines` |
| `getTable` → `refreshCacheTables([...])` | `handleGetTable_`'s `validTabs` does not list them either → `success:false, error:'Invalid table name'` |

So the `refreshCacheTables(['shipping_allocation_drafts','shipping_allocation_draft_lines'])` that ran
IMMEDIATELY BEFORE every hydrate was refused on both names, raised `BACKEND_BUSINESS_REJECTION`, and was
swallowed by its own `['catch']`. `activeDrafts.length` was 0 on every Search, the hydrate returned `false`,
and `initializeShippingAllocation` fell to the default Add Route editor. `03_master_data_handlers.gs` has not
been touched since long before this series — this was never a regression, it is the state the page has always
been in.

**And the rows were one accessor away.** `inventoryReplenishment.workspace.get` — the read the very Search
that calls the hydrate had just completed — has served BOTH tables as raw passthrough since F1-7I
(`SIR_WORKSPACE_TABLES_`, no include gate), and `adaptInventoryReplenishmentWorkspace` already normalises them
into the read model under these exact getter names. Every other read on this page goes through `_irWsGet`.
This one did not.

### 4G-A0.2 — Every boundary, measured

Driving the SHIPPED hydrate with the exact production shapes, twice, differing only in which source holds the
rows:

| boundary | broad cache (production today) | read model (after) |
|---|---|---|
| 1 sheet reader / 2 header filter / 3 line filter | server refuses the table names | 4 headers / 6 lines |
| 4 API response | — | 4 headers / 6 lines, H4 verbatim, line carrying 800 |
| 5 station/scope boundary | — | 3 US/Amazon headers; H3 excluded (ResTW/JP) |
| 6 `_hydrateAllocationDraftFromDb` | **returns false**, `bySku` = {} | returns true, `bySku` = { CO1100-R } |
| 7 `_restoreAllocationDraftFromSession` | never hydrates — no scope at mount (B6 §C.3) | unchanged |
| 8 `_irApplySearch_` | calls the hydrate (B6) — it just had nothing to read | calls it, and it has rows |
| 9 bySku lookup | — | keyed by CANONICAL sku; blank `site_sku` is irrelevant |
| 10 route grouping | — | exactly ONE route for CO1100-R |
| 11 `initializeShippingAllocation` | branch 2: default editor, `qty 0` | branch 1: the persisted route |
| 12 rendered Execution Plan row | Add Route editor | H4 · From CN侯鑫’s warehouse id · To blank · 800 · sea |

**H4 as rendered, after:** header `SADH-K2-E7AF9242`, line `SADL-K2-16F4E4F9`, sku `CO1100-R`, `site_sku` ''
(not invented), source `WH-TW-CN-FACTORY-YOUXIN` (inherited from the header — the line's is blank), method
`sea`, `planned_qty` 800, `destination_state` `DESTINATION_CONFIRMATION_REQUIRED`. The legacy destination
snapshot `Amazon` appears NOWHERE in the hydrated route.

### 4G-A0.3 — The twelve candidate causes (§E), each tested rather than argued

Rejected by execution: (1) hydration not called — it is, and after the scope is assigned; (4) requiring
`line.source_warehouse_id` — `lineSrc || hFrom`, proven with a blank line source; (5) blank `site_sku`
blocking the match — the key is `raw.sku`; (6) blank `line_status` treated as inactive — only `cancelled` is
excluded, and a genuinely cancelled line IS dropped, so the rule is not vacuous; (7) `planning_cycle` — the
hydrate does not filter on it at all; (8) blank destination dropping the route — it survives with a typed
state; (9) `bySku` keyed by `site_sku` — it is not; (10)/(11) default editor overwriting or a repeated Search
duplicating — the shipped selector prefers the persisted rows and the trigger is single-flight and
scope-guarded; (12) stale session state — the DB path returns before the cache is consulted, and the cache is
scope-checked. (3) is a confirmed SHAPE, not a cause: the header has a source warehouse and the line does not,
and the line inherits it. (2) is the one candidate a test cannot settle from inside the repository, which is
what the §C browser readback is for.

### 4G-A0.4 — HALT E, and why this round resolves it

Routing the hydrate through `_irWsGet` was **explicitly forbidden** by F1-7J-A §7 and recorded as
`IR_ALLOCATION_DRAFT_SSOT_NOT_BEFORE_EQUALS_AFTER`. That halt was right about the SSOT and wrong about one
premise nobody had tested: **there was no working BEFORE to preserve.** BEFORE == AFTER == zero rows on the
broad path, so the `_irWsGet` route cannot break an equivalence with a source that returns nothing. The
alternative remains unusable, and this round adds a fourth reason to the halt's three: the scoped SSOT
hard-conflicts on more than one active draft and this station holds THREE. §7's SSOT preference is waived for
this one surface, deliberately and on the record, in
`docs/planning/F1_7J_A_EXISTING_WORKSPACE_SECONDARY_AND_SKU_REGIONAL_CUTOVER_R1.md` §6.

**Left unfixed, deliberately:** the `getTable` / `getOperationDb` whitelists still omit both draft tables.
Nothing on this page needs them now, so no Apps Script file was touched; but a future surface that reaches for
the broad getters will get `[]` for the same reason, silently. That is a server gap, recorded rather than
fixed in a frontend-only round.

### 4G-A0.5 — §I: CO1100-T, Suggested Qty 2120 and Execution Plan Qty 0

Not an allocation question and not a hydration failure. **One quantity was being fetched from two places.**
The top cell reads the MATERIALIZED gap (`_irMatState` → `d90_suggested_qty` → 2120). The default editor read
the legacy per-row `item.suggestedQty`, which the materialized read never populates and which is therefore 0.

The shipped design statement is unambiguous — the editor's own comment says it seeds "from the Recommendation
Summary total (Suggested Qty)" — so per §I this is proved and fixed rather than recorded as expected. The
value now has ONE owner, `_irSuggestedQtyState_`, returning a value AND a state; `_irSuggestedCellHtml` renders
from it and the editor seeds from it. Nothing is auto-filled and nothing is saved: it is still a preview
captured only when the PM edits it. And no state becomes a fabricated number — PENDING and BLOCKED both seed
0 while the cell still prints "…" and "—", and a valid canonical 0 still prints 0.

### 4G-A0.6 — §C: the production browser readback

`checkDeploymentContract` proves the Apps Script endpoint, not the browser's assets. Paste this into the
production tab's console. It prints only asset URLs — no allocation ids, masked or otherwise.

```js
['inventory-replenishment.js','inventory-compat.js','inventory-replenishment.css'].forEach(function (n) {
  var el = [].concat(
    [].slice.call(document.scripts),
    [].slice.call(document.querySelectorAll('link[rel=stylesheet]'))
  ).filter(function (e) { return String(e.src || e.href).indexOf(n) !== -1; })[0];
  console.log(n, el ? String(el.src || el.href).split('?v=')[1] || '(no token)' : '(NOT LOADED)');
});
```

Expected after this release: `inventory-replenishment.js` and `inventory-compat.js` →
**`fb4ga0-livehydration-20260902`**; `inventory-replenishment.css` → **`irexecplan-20260901`** — the
stylesheet is deliberately on its OWN token family and did not change this round, so a reviewer expecting one
token across all three would report a false failure.

If the two scripts do NOT carry `fb4ga0-livehydration-20260902`, the browser is on stale/unpublished frontend
and no hydration code should be touched — publish and hard-reload first.

### 4G-A0.7 — The cache token

`fb4fb6r1-etasnapshot-20260901` is on `origin/main`, so by the rule recorded in B6-R1.7 it has been published
and cannot be reused. `fb4fb6r1-etasnapshot-20260901` → **`fb4ga0-livehydration-20260902`**, all 18
co-deployed references together. The stylesheet family is untouched. No map, earth or unrelated token moved.

### 4G-A0.8 — Suites restated, and a probe that was proving nothing

* **F1-7J-A E** and **F1-7L §1/§2** both pinned "the hydrate reads the two broad getters". Restated to what
  survives — no whole-DB prime, no SSOT, unchanged selection contract and bySku transform — with HALT E's
  resolution named.
* **B5** and **B6** lift the hydrate out of the page; it gained `_irWsGet` and `_irReadModel`, so both lifts
  carry them. Without them the hydrate's own `try/catch` swallows a `ReferenceError` and returns false, which
  reads exactly like "the live row was dropped". Third round in a row for this class.
* **FM2B**, **FM3a** and **FM5-R4UI-R5** lift `_irSuggestedCellHtml` by slicing from the renderer; the value
  authority now sits above it, so the slices start at the authority. FM5-R4UI-R5's slice was ALSO a
  1600-character budget — the third false failure this repository has had from a character budget a comment
  spent. It is delimited by its terminator now.
* **B6-R1 H6** pinned "this round minted its own token" as an equality with the present. **Fourth** round
  running for this exact shape (B6 H9 was the third). It is a floor now.

One mutation probe of this round's own was worthless: **M8** used a whole-file `PAGE.replace()` and its pattern
matched a DIFFERENT function — one that spells the same scope filter with `scope` instead of `ctx` — so it
mutated code the hydrate never runs and reported a survival that meant nothing. Every hydrate mutant is now
anchored INSIDE `_hydrateAllocationDraftFromDb`, and a mutation that does not apply THROWS rather than
returning false. Its first draft was also an equivalent mutant for a second reason: dropping only the
country/marketplace test leaves the company test, which still excludes ResTW.

### 4G-A0.9 — Boundaries held

No Apps Script file changed (measured from the working tree, not claimed). No DB schema change. No live write,
no AI Plan, no Save, no Submit, no Send Request. Contracts unmoved: action 10, required-action-list 9,
transport 1. `SAD_BUILD_VERSION_` stays `F1-7N-FB-4F-B6`. Bundle unchanged
(`d782ea6d…c36ac`). Sweep: 392 suites, 388 pass, 4 fail — the four long-standing failures and NOTHING else.


## 4G-A0-R1 — DESTINATION XOR + PERSISTED METHOD: TWO ASYMMETRIES AND ONE MISSING FIELD

A0 made the persisted route appear. R1 closes the last two read/save asymmetries on it — and finding the second
one explained where the live H4 header's `Amazon`-in-a-warehouse-code-column actually came from.

### 4G-A0-R1.0 — Preconditions

`main` = `origin/main` = `60e5ef3`; worktree clean; stash empty; 18 refs on
`fb4ga0-livehydration-20260902`. Deployment contract confirmed by the operator (`DEPLOYMENT_CONTRACT_OK`,
`STABLE_EXEC`, action 10, transport 1).

### 4G-A0-R1.1 — The Method, and there were TWO defects

Each is sufficient on its own; the first needs no spelling mismatch at all.

**(1) `_execRebuildMethodOptions` read the selection from the DOM instead of the route model.** The route's
service lives in the hydrated model. On the FIRST paint of an expanded row the carrier catalogue is still in
flight — `initializeShippingAllocation` kicks off `_irLoadCarrierPlanning_()` and renders immediately — so
`_execMethodOptionsHtml` emits the single `Loading methods…` option and `methodEl.value` is `''`. The rebuild
then ran on the `.then()` of that very load, read `current = ''`, found it invalid, and re-rendered the
now-complete catalogue with `selected = ''`. **The label is present and nothing is chosen** — the reported
symptom exactly, measured in the suite. And because the collect reads the DOM, the next save would have
written a BLANK method over a stored `sea`.

**(2) the selection was an EXACT-TEXT comparison,** between the header's `recommended_shipping_method` and the
rate card's `shipping_method` column verbatim (`method-registry` `methodsForRoute`: `value = str(rc.shippingMethod)`).
Nothing else in the system compares services that way — the server matches rate cards case-insensitively
(`crcFindRateCards_` → `eqi`), computes route identity through `ricCanonicalService_`, and this page's own
lead-time mapper lowercases first. So a header persisted as `sea` did not select an option valued `Sea`.

Both are fixed: the row carries `data-method-persisted` (the same discipline `data-eta-persisted` uses) and the
select's own value wins only when the user has actually touched it (`data-method-dirty`, set by
`onExecutionMethodEdit`); and the match goes through `IRService.matches`.

### 4G-A0-R1.2 — The canonical-to-label ownership (§C.5), stated honestly

There are **two different questions with two different owners**, and pretending they were one is what produced
an exact-text comparison in the first place.

| question | owner |
|---|---|
| what SERVICE is this string? | `IRService.canonical` in `inventory-compat.js` — a **byte-identical mirror** of 69_ `RIC_SERVICE_LABELS_` / `RIC_CANONICAL_SERVICES_`, asserted as such by the suite |
| what LABEL does this service show? | **the data** — `carrier_rate_cards.shipping_method_label`, operator-maintained |

No shipped source spells `空派`, `普船海卡` or `美森海卡` as a picker label, and none may: the picker shows what
the operator maintains. The mirror is a MIRROR — a spelling not in 69_ must never be added to it, because a
client that recognises what the server refuses builds routes the server then rejects. `sea` never answers for
`sea_express` in either direction, and an unrecognised spelling matches nothing but itself, so an unknown
service can never quietly select the first option.

### 4G-A0-R1.3 — The destination, and the field that was missing on the server

`routeHeaderFields` fed the `*_warehouse_code_snapshot` columns from `route.ship_from` / `route.destination` —
the collect's DISPLAY NAMES. For an Amazon destination that name is `Amazon`, so the save wrote a marketplace
name into a warehouse-code column. **That is precisely the legacy value the live H4 header carries.**

Then the reason it had to. `sadUpsertDraftHeaderCore_` — the writer the page ACTUALLY calls
(`upsertShippingAllocationDraft` → `handleUpsertShippingAllocationDraft_` → here) — **never carried
`destination_marketplace`**, on either its update field list or its insert. B4 made the column stored and B6 put
it in the header fingerprint and in the ATOMIC writer's list, but this two-call writer never read it. So an
explicit Amazon save arrived carrying `destination_marketplace='Amazon'`, the field was silently dropped, and
the only surviving evidence of the chosen destination was the misused snapshot — which
`sadStoredHeaderRouteIsComplete_` then read back as the destination so Submit would pass.

> **THE CLIENT COULD NOT STOP WRITING THE MISUSE UNTIL THE SERVER CARRIED THE FIELD.** A correctly XOR'd payload
> on today's deployment would leave the row with NO destination at all and Submit would refuse it with
> `ROUTE_INCOMPLETE`. **This is why the round changes Apps Script**, and why the owner stamp moves.

The server change is minimal and additive: `destination_marketplace` joins the update list and the insert, and
a supplied marketplace with **no column** is now REFUSED (`ROUTE_IDENTITY_NOT_PERSISTABLE`, zero write) rather
than silently dropped — the ATOMIC writer already refuses that exact case, and two writers must not disagree
about whether a route is persistable.

### 4G-A0-R1.4 — The canonical destination model (§D), enforced in ONE place

| | `recommended_destination_warehouse_id` | `..._warehouse_code_snapshot` | `destination_marketplace` |
|---|---|---|---|
| Marketplace | `''` | `''` | trimmed marketplace |
| Warehouse | real `warehouse_id` | `warehouse_code` | `''` |
| Both | see §G correction below | | |
| Neither | `''` | `''` | `''` — read keeps the route + confirmation required; SAVE refuses |

The marketplace comes from the **token the user selected** (`MARKETPLACE_DESTINATION:<marketplace>:<COUNTRY>`),
not from the page filter, not from the scope, and not from a display label. `resolveDestinationPayload` read
`parts[1]` for it now rather than the hardcoded `'Amazon'` — byte-identical for every token that exists today,
and exactly the kind of constant that becomes a wrong answer the day a second marketplace gets one.

**No `destination_type` column is added; the type stays derived from the XOR.** And neither corrected field is a
K2 group dimension, so this **re-keys nothing and moves no id** — proven by computing the group key both ways.

> **§G CORRECTION (F1-7N-FB-4G-A0-R2).** The Both row above originally read *"marketplace — the exclusive
> identity wins"*. That was wrong as a rule and wrong as a description, and it was not merely wording: it
> described a truthy collapse that was really there, on both sides, disagreeing with itself. The client's
> `routeHeaderFields` resolved Both to the MARKETPLACE; the server's `sadHeaderRouteIsComplete_` used
> `toReal || marketplace`, so it resolved Both to the WAREHOUSE and called the row complete. One contradiction,
> two different answers depending on which side you asked, and neither of them a refusal. The corrected rule:
>
> * **A canonical row carrying BOTH is `ROUTE_DESTINATION_AMBIGUOUS` and is REFUSED with zero write** — by the
>   client gate, by both writers and by Submit. Nothing "wins".
> * **An explicit typed picker transition never produces a Both row in the first place.** The To selector is
>   single-select, so the collect emits ONE side and the other is already blank — which is what makes
>   Warehouse→Amazon and Amazon→Warehouse clean *without* any collapse. The collapse only ever fired on a row
>   that was already contradictory, and hid it.
> * **The writer accepts one-sided payloads only.**
>
> Closed in 4G-A0-R2 below.

### 4G-A0-R1.5 — The legacy snapshot policy (§G)

1. **Hydration carries it verbatim and never promotes it.** `resolvePersistedDestination` looks at the id and
   marketplace columns ONLY — it never sees a snapshot.
2. **Page load never clears it**, guaranteed by the hydrate performing no write at all.
3. **Explicit Amazon + confirm** → `destination_marketplace='Amazon'`, warehouse id `''`, **snapshot CLEARED**.
   The writer's `if (header[f] != null) setCol(...)` makes an explicit blank a clear and an omitted field a
   preserve, so the blank is the instruction. The clear is not a silent no-op because `destination_marketplace`
   is in `SAD_K2_HEADER_FP_` (B6 put it there for this exact reason) and it genuinely changes.
4. **Explicit warehouse** → snapshot becomes THAT warehouse's code, marketplace `''`.
5. **Cancel** → zero request, zero write (B6's gate, re-asserted).

### 4G-A0-R1.6 — Adoption, simulated against the shipped writer

H4 chooses Amazon and the operator confirms: header id `SADH-K2-E7AF9242` unchanged, line
`SADL-K2-16F4E4F9` unchanged, service still `sea`, `planned_qty` still 800, `destination_marketplace` = Amazon,
warehouse id `''`, **legacy snapshot cleared**, no second header, no second line, no re-key, replay idempotent.
A physical warehouse destination stores the real id + its code with a blank marketplace, and the To picker
selects the same warehouse after reload.

### 4G-A0-R1.7 — Two fixtures were passing ON the misuse

`live-closure-...-fb-4d` and `execution-plan-multi-route-persistence-...-addendum` both built their in-memory
sheet from `SHIPPING_ALLOCATION_DRAFTS_HEADERS_` — the 30 REQUIRED columns, i.e. a PRE-MIGRATION sheet with no
`destination_marketplace`. On such a sheet the field is dropped and an Amazon route's destination survived only
as the misused snapshot, which is how Submit passed. Both now use `SHIPPING_ALLOCATION_DRAFTS_HEADERS_FULL_`,
the 35 columns B5 measured in production — and the addendum suite gained an EXECUTED check that a genuinely
pre-migration sheet now REFUSES rather than drops.

### 4G-A0-R1.8 — Suites restated, and the constant that was living in four places

* **The 16_ owner-stamp order was duplicated in FOUR suites** (B3, B4, B5, FB-4F-A). Moving the stamp broke all
  four at once — the exact failure a duplicated constant exists to produce. It lives in
  `_release-order.js` (`OWNER_STAMPS` + `stampAtOrAfter`) now; a round that moves the stamp appends one line.
* **B6 H1** pinned "16_ declares THIS ROUND'S owner build" — an equality with the present. A floor now.
* **B6-R1 H1/H3** and **A0 H4/H5** measured the WORKING TREE for facts about their OWN COMMITS. Anchored to
  their own diffs (`60afa6e→82da01c`, `82da01c→60e5ef3`), where the fact is fixed forever; and B6-R1's
  manifest check now asserts the manifest agrees with the SOURCE rather than with a number typed twice.
* **A0 A1** — "this round mints its own app token" — the **FIFTH** round for this exact shape, written by A0
  in the same commit that restated B6-R1's H6 for precisely that reason. A floor now.
* **A0 E12/E13** guarded against renaming a label by asserting the diff mentioned none. A0-R1 legitimately ADDS
  the server's own mapping table, which contains 普船 and 美森海卡; adding a mirror is not a rename, so the check
  measures REMOVALS.
* **B5 G15** pinned the exact literal `destination_marketplace: isLogicalAmazon ? 'Amazon' : ''`. Restated to
  what B5 established — the save path writes a marketplace for a logical destination — plus the new fact that
  it is no longer a hardcoded constant.
* **The 4B-addendum lift** gained `sadLiveHeaderNames_` / `sadHasColumn_`, which the new refusal calls. Fourth
  round in a row for the lift-dependency class: Apps Script has one global scope, and a suite that lifts a
  function must supply the globals the file itself would have had.

One assertion of this round's own was bounded by a **character budget** (`[\s\S]{0,600}` to reach a function
call) and failed on a function longer than the budget. That is the **fourth** false failure this repository has
had from a character budget; it extracts the function whole and asks what it calls.

### 4G-A0-R1.9 — Boundaries

TWO Apps Script files changed (measured, not claimed): `16_shipping_allocation_handlers.gs` and
`63_api_v1_system_health.gs`. `SAD_BUILD_VERSION_` → `F1-7N-FB-4G-A0-R1`, and the manifest expectation moved
with it so a half-synced deployment is detectable. NO DB schema change. No live Save, AI Plan, Submit or Send
Request. Contracts unmoved: action 10, required-action-list 9, transport 1. Bundle unchanged
(`d782ea6d…c36ac`). Token → `fb4ga0r1-destxor-20260902`, all 18 refs. Sweep: 393 suites, 389 pass, 4 fail —
the four long-standing failures and NOTHING else.


## 4G-A0-R2 — SERVER CANONICAL DESTINATION COMPLETENESS: TWO GATES THAT DISAGREED WITH THE CONTRACT

A0-R1's report left two items open. Both turned out to be **reachable behaviour**, not wording — measured on the
shipped code before this round changed anything:

| state | `ricDestinationIdentity_` | `sadHeaderRouteIsComplete_` | `sadStoredHeaderRouteIsComplete_` |
|---|---|---|---|
| WAREHOUSE only | OK WAREHOUSE | true | true |
| MARKETPLACE only | OK MARKETPLACE | true | true |
| **BOTH** | ROUTE_DESTINATION_AMBIGUOUS | **true** | **true** |
| NEITHER | ROUTE_DESTINATION_MISSING | false | false |
| **H4 LIVE (snapshot `Amazon`)** | ROUTE_DESTINATION_MISSING | false | **true** |

### 4G-A0-R2.0 — Precondition divergence, reported read-only

§A.3 expected `origin/main` = `60e5ef3` and §A.6 stated A0-R1 was not yet pushed. **It was.** The reflog records
`refs/remotes/origin/main@{0}: update by push → 1f91d3b`; `main` and `origin/main` are both `1f91d3b`, 0 ahead /
0 behind. Nothing was fetched, merged, rebased or reset. It decides the token question in §4G-A0-R2.7.

### 4G-A0-R2.1 — Was Both wording or behaviour? BEHAVIOUR, and it disagreed with itself

`sadHeaderRouteIsComplete_` asked `toReal || destination_marketplace`. `||` short-circuits, so a row carrying a
warehouse AND a marketplace was **complete** — in effect *warehouse wins*. The client's `routeHeaderFields`
collapsed the same contradiction the other way, *marketplace wins*. One row, two answers, no refusal anywhere.
That reached the write gate on **both** writers, the K2/K4 resolver, and Submit.

### 4G-A0-R2.2 — The snapshot root cause, exactly

`sadStoredHeaderRouteIsComplete_` carried an FB-4D fallback: when the header predicate said no, it accepted the
row anyway if `recommended_destination_warehouse_code_snapshot` was non-blank. FB-4D's reasoning was sound **for
its moment** — `destination_marketplace` was then "an accepted PAYLOAD field and NOT a stored column", so the
stored row's only retained evidence of a chosen destination was the snapshot. **B4 made the column stored;
A0-R1 made the two-call writer actually persist it.** The premise was gone; the fallback was not. So the live H4
header — warehouse id blank, marketplace blank, snapshot `Amazon` — was **Submit-complete on the strength of a
marketplace name sitting in a warehouse-code column**.

**The fallback is removed, and that is a deliberate behaviour change with a known consequence.** A row saved
BEFORE A0-R1 has a blank `destination_marketplace` and a marketplace name in its snapshot; it is now correctly
`ROUTE_DESTINATION_MISSING` and Submit refuses it. The remedy is the explicit, user-confirmed adoption A0-R1
built — not a gate that reads a display snapshot as a business identity.

### 4G-A0-R2.3 — The single authority

**`ricDestinationIdentity_` (69_) is the rule, and every path now asks it.**

* 16_ gained `sadDestinationIdentity_`: it **delegates** to the 69_ contract when that file is deployed and
  applies the **identical rule inline** when it is not. The suite proves the two agree across all 48 generated
  shapes rather than asserting it in a comment — and proves the completeness verdict is identical with 69_
  absent.
* `sadHeaderRouteIsComplete_` asks it. `sadStoredHeaderRouteIsComplete_` **is** that function now, so the write
  gate and the Submit gate cannot drift apart again.
* `sadUpsertDraftHeaderCore_`, `sadAtomicValidateBatch_` (the atomic path's gate) and
  `sadResolveActiveDraftK2OrK3_` all reach it; Submit reaches it through the stored-row name; K4 was already on
  the contract.
* **And route INTENT knew the marketplace was not a destination.** Both writers carried the same
  `hasRouteIntent` predicate and both omitted `destination_marketplace`, so a payload whose only route field was
  a marketplace did not count as route intent and **skipped the completeness gate entirely** — an incomplete
  route written in silence for Submit to refuse much later. Same omission class as A0-R1's insert/update, same
  file, same sync set.

On the client the same rule had been written out **three times** — `resolvePersistedDestination`,
`isRouteComplete`, `routeHeaderFields` — and two of them used `warehouse || marketplace`.
`IRWarehouse.destinationIdentity` is now the one owner and the other three are built on it, in the same shape
the server returns, so a client verdict and a server verdict **cannot** drift. The page's own fallback copy of
the rule and its pre-save destination report were on the same `||`, and now carry the typed code.

**Never a canonical destination, asserted field by field:** the warehouse code snapshot, the header marketplace
scope, a display label, a plan marketplace, a filter, `ctx.marketplace`, a note, or evidence of an earlier
attempt.

### 4G-A0-R2.4 — H4: before → adoption → after

| | before | after explicit Amazon + confirm |
|---|---|---|
| identity | `ROUTE_DESTINATION_MISSING` | `MARKETPLACE` |
| `recommended_destination_warehouse_id` | `''` | `''` |
| `..._warehouse_code_snapshot` | `Amazon` (ignored) | **`''` — cleared** |
| `destination_marketplace` | `''` | `Amazon` |
| stored route complete | **false** | **true** |
| direct server Submit | **ROUTE_INCOMPLETE, zero write** | continues into its other validations |
| header / line id | `SADH-K2-E7AF9242` / `SADL-K2-16F4E4F9` | unchanged |
| qty | 800 | 800 |

Replay is idempotent. Reload selects Amazon through the persisted marketplace column. And the **K4 key proves
the difference is the canonical column, not the snapshot**: H4's destination dimensions are `['', '']` while the
adopted header's are `['marketplace', 'amazon']` — compared by POSITION, because this station's *scope*
marketplace is also `Amazon` and a substring scan of the joined key would have reported a destination that is
not there.

The physical warehouse case: real id, matching code snapshot, blank marketplace, type `WAREHOUSE`,
complete = true.

### 4G-A0-R2.5 — The direct-server Submit line of defence

`sadSubmitToShippingPlansCore_` gate (9) calls the stored-row predicate, which is now the canonical one. H4 and
any BOTH row are refused there with `ROUTE_INCOMPLETE` and `zero_write: true` — **independently of any client
gate**, which is the point of §E's "不可只依賴 client gate".

### 4G-A0-R2.6 — What this round deliberately did NOT change

§E lists "canonical service 合法" among the completeness conditions. The service rule is **unchanged**:
non-blank and not the "no available" placeholder. Tightening it to `ricCanonicalService_` would make every
stored route whose method spelling 69_'s table does not carry **un-submittable** — a live-impact decision this
round was not asked to take and has no evidence to take. §H's twenty behavioural tests contain no service-
validity case, which is consistent with that reading. Recorded here rather than skipped silently, and pinned by
a test so a future round changes it deliberately.

### 4G-A0-R2.7 — Deployment: still ONE Apps Script sync, ONE new version

A0-R1 and A0-R2 touch **the same two files**, so the release still needs exactly one sync set and one new
deployment version. The owner stamp moves once more, to `F1-7N-FB-4G-A0-R2`, and 63_'s manifest expectation
moves with it — asserted against the SOURCE rather than against a number typed twice.

The frontend token DOES rotate, and §I's condition is the reason: this round changes **client code**, not just
reports and tests. `isRouteComplete`, `routeHeaderFields`, the page's fallback gate and its destination report
all stopped accepting a route carrying two contradictory destinations, so a browser left on the A0-R1 copy would
keep sending one. `fb4ga0r1-destxor-20260902` → **`fb4ga0r2-destauthority-20260902`**, all 18 refs.

### 4G-A0-R2.8 — Suite corrections of this round's own making

Two assertions of mine were wrong in ways worth recording:

* the K4 check scanned the WHOLE joined key for `amazon`, which is present because the station's **scope**
  marketplace is Amazon. It would have passed for the wrong reason and failed for the right one. It compares the
  two destination positions now.
* the "every writer routes through the shared predicate" check named `sadAtomicUpsertCore_`, but the atomic
  path's gate lives one frame away in `sadAtomicValidateBatch_`. It named the wrong function and reported a
  working chain as broken; it now names the validator AND asserts the core reaches it.


### 4G-A0-R2.9 — Suites restated, and a class that has now recurred five times

`sadHeaderRouteIsComplete_` gained ONE dependency, and **fifteen** suites lift it out of 16_. Apps Script has a
single global scope, so the file itself always has that dependency; a suite that lifts a function must supply
the globals the file would have had, or it reports a `ReferenceError` as though it were a production defect.
This is the **fifth** round for that class, so the dependency was added to every lift site mechanically rather
than to the ones that happened to fail. Two of those edits were mine and wrong — two of the lists were not
lifts at all but assertions about which authorities a SOURCE FILE references, and adding a name there demanded
that 63_ and the TEMP migration mention a function this round never asked them to. Reverted.

Behavioural restatements, each because the behaviour it pinned improved:

* **A0-R1 D7** asserted that a BOTH route resolved to the marketplace — "the exclusive identity wins". That was
  A0-R1 describing its own collapse. It asserts the REFUSAL now, plus the fact that an explicit transition is
  one-sided by construction so the snapshot clearing never depended on a collapse.
* **A0-R1 X8/X9/X10** asserted the SHAPE of the two predicates (`toReal || marketplace`, and a stored gate that
  "tries that first"). Both shapes are gone; the BEHAVIOUR they protected is asserted by execution instead and
  is unchanged.
* **A0-R1 M5/M6** mutated expressions that no longer exist — a mutation that does not apply is a broken probe.
  Both introduce the same defect where the code now lives.
* **FA-4B 5b** required the stored gate to DELEGATE rather than replace. It now delegates totally: it IS the
  other predicate, which is that requirement in its strongest form.
* **B6 B21** measured that a destination-less route was written with a BLANK marketplace. It now forms **no
  group at all** — stronger, and §D.1's protection (the page scope is never a destination) is asserted first.
* **A0-R1 H4/H5** pinned A0-R1's own stamp as an equality with the present — the **sixth** round for that
  shape. A floor, plus the durable rule that the manifest agrees with the SOURCE.


## 4G-A1 — RECOMMENDATION + EXECUTION PLAN ATOMIC REVEAL

Presentation and readiness only. **No DB change, no Apps Script change, no Save, no Submit, no AI Plan, no
Send Request, and no allocation identity or calculation rule touched.** DB_WRITES = 0.

### 4G-A1.0 — Preconditions

`main`; `HEAD` = `origin/main` = `6b49320`; worktree clean; stash empty. A0-R2's release is published, so its
token has left the repository and cannot be reused (§4G-A1.7).

### 4G-A1.1 — The root cause, MEASURED

Produced by running the shipped `initializeShippingAllocation` against a deterministic scheduler, not by
reading it:

```
    0:EXPAND
    0:ROUTE_ROW_PAINTED(method=placeholder, eta=unavailable)
    0:TOTAL_UPDATED
  120:CARRIER_RESOLVED
  120:METHOD_OPTIONS_REBUILT      <- the Method select is corrected to the stored service
  120:ETA_RECOMPUTED              <- Expected Arrival is corrected from 'unavailable' to a real date
```

The routes were painted **synchronously**, and the carrier catalogue's `.then()` then **corrected** them.
The second paint is not a refresh; it is a fix applied in view. And it happened **even on a cache hit**: a
resolved promise resumes on a microtask, so the synchronous render still won the frame. Measured in both
cases. Beside it the Recommendation Summary settles off a different async source (the materialized gap read),
so the pair was reachable in every combination of half-states.

### 4G-A1.2 — Request dependency graph: unchanged, and that is the point

Search (`_irApplySearch_`) already issues everything, none of it awaited by the other:

| | before | after |
|---|---|---|
| main table render | synchronous, from the read model | unchanged |
| materialized gap read | 1 request per scope, deduped | unchanged |
| recommendation.workspace.get | 1 per scope, flag-gated, deduped | unchanged |
| draft hydration | **0 requests** in Workspace mode (reads the read model) | unchanged |
| carrier catalogue | 1 per applied scope, single-flight, cached | unchanged |
| **expanding a SKU** | **0 requests** | **0 requests** |

Measured on the shipped registry: 20 sequential expands → 1 request; 20 **concurrent** cold expands → 1
request. Both numbers are identical before and after.

**The barrier starts nothing.** It waits on promises and states that already existed. There is no new
endpoint, no new round trip, no re-hydration, no second catalogue fetch, and no cache defeated to satisfy it.

### 4G-A1.3 — The readiness contract

One named owner, `IRPlanningReveal` (in `inventory-compat.js`), pure and DOM-free. Four states, and
**LOADING is the only one that waits**:

* **Recommendation READY** — the read authority actually in effect has settled: the materialized gap read,
  or `recommendation.workspace.get`, or (legacy) the synchronous local table, which has nothing to wait for.
  A scope whose rows are loaded is READY even when THIS sku has no row: *Not calculated* is a truthful
  terminal cell. `EMPTY` (no stored rows for the scope) and `ERROR` are terminal and keep their typed code.
  **A legitimate 0 is data, not absence** — the owner never receives a quantity at all, which is what stops
  it deciding otherwise; proven by asserting the verdict is invariant across zero-bearing and value-bearing
  payloads, and by the stored-0 path end to end (`_irMatNum(0) === 0`, suggested state `READY` with value 0).
* **Execution READY** — all four inputs settled: the read model (warehouse candidates), the draft hydration
  (the persisted route), and the ONE catalogue, which supplies **both** the method options (hence the
  canonical match against the stored service) and the lead times (hence the ETA). A SKU with **no** persisted
  draft is not exempt: its default preview editor is a route and needs the same pickers. A lead time nobody
  configured is a **terminal** *unavailable* answer, not a pending one. A catalogue **ERROR** is terminal and
  named; a **STALE_SCOPE** catalogue is terminal for this station.

### 4G-A1.4 — The reveal, and the stale-generation defence

`begin()` opens a generation per expand; `report()` refuses anything naming a past generation, a different
sku, a different applied station, or an abandoned gate. `abandon()` runs on collapse, on a table re-render
and therefore on every new Search. The frame callback re-checks the generation, so a reveal already scheduled
is dropped if the row closes before it paints.

Both panels are handed to the caller in **one** callback, inside **one** `requestAnimationFrame`. There is
deliberately **no API to reveal a single side** — a second callback would be a second render transaction,
which is the flicker being removed. `reveal time = max(recommendationReadyAt, executionReadyAt)` + one frame,
asserted across an ordering matrix rather than once. On a warm scope both sides are already terminal when the
panel is inserted, so the reveal is scheduled in that same frame and the skeleton never reaches the glass.

No timer, no interval, no polling loop, no sequential await anywhere in the barrier — asserted on the source
of every function in it. `requestAnimationFrame` degrades to an immediate call headless, never to
`setTimeout`.

### 4G-A1.5 — What the shell shows, and what it refuses

Both panels reserve a fixed base height and show a content-shaped skeleton. The pending Execution Plan
contains **no `<select>` and no `<input>` at all** — so no `Loading methods…` picker, no empty route, and no
fabricated `0` total (the Total appears with the routes it totals). `+ Add Route` is disabled and unwired;
Submit Plan is disabled while any decision area on screen is still a shell. The shimmer is pure CSS and is
disabled under `prefers-reduced-motion`.

The Stock / Forecast Breakdown / Upcoming Event / Sales Trend / Monthly Achievement blocks are **outside** the
reveal container and are not delayed by it.

### 4G-A1.6 — H4 at first visible paint

From `CN侱鑫` · To blank + *Destination confirmation required* · Qty 800 · the stored service already
selected · Expected Arrival resolved or formally unavailable — **in one paint, with the Recommendation Summary
beside it in the same frame**. The route is painted exactly once (`ROUTE_PAINTED` count = 1) and
`METHOD_OPTIONS_REBUILT` never runs on that path, because `initializeShippingAllocation` no longer registers
the correcting `.then()` when the barrier has already waited for a terminal catalogue. Every other caller — a
scope change, an explicit Method retry — still gets that refresh, because for them it *is* a refresh.

### 4G-A1.7 — Deployment

`APPS_SCRIPT_SYNC_REQUIRED: NO` · `APPS_SCRIPT_DEPLOYMENT_REQUIRED: NO` · `DATABASE_CHANGE_REQUIRED: NO` ·
`BUNDLE_REBUILD_REQUIRED: NO` (the bundle ports only `assets/js/core/`; nothing there changed and
`--check` reports the hash unmoved) · `FRONTEND_PUSH_REQUIRED: YES`.

Two token families rotate, and they are **not** crossed:

* application token `fb4ga0r2-destauthority-20260902` → **`fb4ga1-atomicreveal-20260902`**, all 18
  co-deployed refs together, appended to the series in `_release-order.js` so it is derived rather than
  restated. A0-R2 is published, so its token cannot be reused; and this round changes client code in both
  `inventory-replenishment.js` and `inventory-compat.js` — a browser holding one file from each round would
  expand a SKU into a decision area that never leaves its skeleton.
* the inventory stylesheet's own family `irexecplan-20260901` → **`iratomicreveal-20260902`**, because this
  round adds the skeleton and reveal rules to `inventory-replenishment.css`.

### 4G-A1.8 — Suite corrections of this round's own making

* **The deterministic scheduler sorted its queue once.** Every reveal frame is queued *during* the run, so it
  was appended after the sorted tail and executed last — reporting its time as the time of the final event
  rather than its own. Two mutation probes were reading that number and reported MUTANT SURVIVED against a
  measurement artefact. The queue picks its minimum on every step now.
* **A probe asserted the absence of a word.** `H4` claimed the recommendation readiness owner contains no
  quantity vocabulary, but `gap` is legitimately there (`GAP_READ_ERROR`). It would have failed for the right
  reason and passed for the wrong one. Restated as an **invariance** check, executed.
* **A mutation probe threw and was scored as a failure, correctly.** Removing the frame's generation guard
  left `cur` null and produced a `TypeError` — a broken probe, not a detection. The defence a late response
  actually meets first is `accept()`'s ABANDONED branch, so that is what is mutated now.
* **An operator label leaked into a shipped source.** A0 §G.9 requires the three service labels to be spelled
  in **no** shipped file, so that no source-wide edit can rename an operator's data. One of my new comments
  quoted one of them. Removed; the rule is cited in its place.

### 4G-A1.9 — Two inherited assertions restated (the working-tree class, third appearance)

A0-R1's `H5b` and A0-R2's `H3` both read `git diff --name-only HEAD` to assert "exactly two Apps Script files
changed". That measures the **working tree**, so each was true only while its own round was uncommitted; the
moment A0-R1 and A0-R2 became commits, both began asserting something about whoever edits the repository
next — and this round is what they caught. It is the same shape as the equality-with-now stamps.

Both are restated as durable claims about the **source**: exactly one Apps Script file *declares*
`SAD_BUILD_VERSION_` and exactly one *expects* it, which derives the two-file sync set at any time with no
working tree involved. This round's own suite states its "nothing joins the sync set" claim the same way — no
`.gs` file mentions this round, its owner or its token — rather than reintroducing the trap.
