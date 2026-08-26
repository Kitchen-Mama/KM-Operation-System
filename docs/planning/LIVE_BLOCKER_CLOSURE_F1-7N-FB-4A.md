# F1-7N-FB-4A — Execution Plan identity reconciliation and Shipment ETA write/read-back

**Status:** implementation record (local commits only; not pushed, not deployed).
**Date:** 2026-08-26.
**Predecessors:** F1-7N-FB-3B (`d699940`, `9651717`), F1-7N-FB-3C (`ebfb854`, `7d09de4`, `ce965e5`).
**Scope:** the two live blockers reported after the FB-3C round, plus the TEMP planning-cycle ergonomics and a
deferred map-boundary requirement. No live function was executed and no live DB/Drive/property/status/email write
was made in producing this record.

---

## I. §C/§D — the Execution Plan conflict

### I.1 What the operator saw

One Execution Plan route (US · Amazon · `CO1100-R` · planned 400 · source **CN侑鑫** · destination **Amazon** ·
expected arrival 2026-10-15) refused to save with `Database update failed` and one sentence: *"An existing Draft
for this scope cannot be reconciled automatically. It needs an explicit user migration — it is never auto-healed
or overwritten."*

That sentence is produced by `_irReasonNextAction_` for **two different** backend reasons —
`LEGACY_ROUTE_RECONCILIATION_REQUIRED` and `K2_ROUTE_RECONCILIATION_REQUIRED` — and the actual reason code was
hidden inside the collapsed *Technical details* disclosure. So the operator could not tell which row was in the
way, which family it belonged to, or whether the right answer was "retry", "resolve a duplicate" or "migrate".

### I.2 Root cause — a runtime identity/comparison bug, not (necessarily) bad data

`sadLegacyReconcileReason_` asked: **does this row's stored id still equal the deterministic hash of its own
current K2 dimensions?**

That question has a false positive the writer itself manufactures:

- `SADH-K2-<hash>` is minted **once, at CREATE**, from the ten K2 grouping dimensions.
- The UPDATE branch of `sadUpsertDraftHeaderCore_` is **allowed** to change
  `recommended_source_warehouse_id`, `recommended_destination_warehouse_id`, `recommended_shipping_method`,
  `recommended_last_mile_delivery` and `recommendation_group_no` — **five of those ten dimensions**.
- The id is **never re-keyed** (re-keying would orphan every `shipping_allocation_draft_lines` row pointing at it).

So the sequence is:

| save | what happens |
| --- | --- |
| 1 | no id → K2 CREATE → row inserted with dims **A**, id = `H(A)` ✔ |
| 2 | id `H(A)` sent; row still holds **A**, so `H(A) == H(A)` → guard passes → **route edited to dims B** ✔ |
| 3 | id `H(A)` sent; row now holds **B**, so `H(B) ≠ H(A)` → **`K2_ROUTE_RECONCILIATION_REQUIRED` — forever** ✘ |

The row was never an impostor. It is the caller's own row, holding the caller's own dimensions, under a stale
CREATE-time surrogate id — and the guard refuses it.

**The AI-Plan path makes this the normal case, not an edge case.** The K2 contract note in `16_` records that the
bundled generation engine leaves four of the ten K2 dimensions **blank** at generation
(`recommended_shipping_method`, `recommended_last_mile_delivery`, `recommended_destination_warehouse_id`,
`recommendation_group_no`). An AI-generated header is therefore keyed over blank route dimensions, and the
operator's **first completed route in the Execution Plan is exactly the edit that drifts it**. The second edit of
any AI-generated row is then permanently unsaveable.

### I.3 The correction (§D, runtime)

The comparison is now **semantic** rather than self-referential:

> Does this persisted row belong to the **same K2 shipment group as the request being written**?

`sadK2ReconcileDecision_(persistedRow, wantHeader, activeRows)` is a **pure** decision returning
`{ reason, basis, conflictIds }`:

| condition | verdict | basis |
| --- | --- | --- |
| stored id equals the hash of the row's own dims | pass | `K2_ID_MATCHES_OWN_GROUP` |
| no request header available to compare | `K2_ROUTE_RECONCILIATION_REQUIRED` | `K2_ID_DRIFTED_AND_NO_REQUEST_GROUP_SUPPLIED_TO_COMPARE` |
| row's group key ≠ request's group key | `K2_ROUTE_RECONCILIATION_REQUIRED` | `K2_ROW_BELONGS_TO_A_DIFFERENT_SHIPMENT_GROUP` |
| same group, but another ACTIVE header also claims it | `BLOCKED_CONFLICT` | `K2_GROUP_ALREADY_OWNED_BY_ANOTHER_ACTIVE_HEADER` |
| same group, uncontested | pass → **UPDATE IN PLACE** | `K2_STALE_CREATE_TIME_ID_ACCEPTED_SAME_GROUP` |

This is **strictly stronger against a real impostor** — a row for a different group is still refused, on the group
key rather than on a hash coincidence — and it stops refusing the one row the caller means.

**Nothing is auto-healed.** The stale id is kept exactly as stored: no re-key, no overwrite, no cancel, no delete,
no line-FK rewrite. The row is updated in place under its existing identity, which is what editing an existing
Execution Plan route has always meant. The `wantHeader` parameter is **optional and additive** — omitted, the K2
branch keeps the exact pre-FB-4A rule, so no existing caller changes behaviour by accident.

### I.4 What was deliberately NOT changed — and why it is migration-required

The **generic / legacy (non-`SADH-K2-`) branch is unchanged.** A `SAD-…` header is a pre-K2, scope-keyed row whose
id is a random UUID rather than the deterministic identity of its shipment group. Adopting it into a canonical K2
write would make a non-canonical id the identity of that group. That is a **data migration decision, not a runtime
repair**, so per §D the writer STOPs: the route stays UNSAVED and Submit Plan stays blocked for it.

There is a second, structural reason a legacy row with a **marketplace-logical destination** can never satisfy the
persisted-route completeness rule: `sadHeaderRouteIsComplete_` accepts a `To` that is either
`recommended_destination_warehouse_id` **or** `destination_marketplace` — but `destination_marketplace` is an
**accepted payload field that is not a stored column**. Evaluated against a *persisted row* it is always
`undefined`, so a logical-Amazon destination reads as an incomplete route forever. R6F2G5 fixed this for
`SADH-K2-` rows only, by design; generic rows keep the original rule.

### I.5 Proposed idempotent migration plan (NOT EXECUTED — requires explicit user authorization)

Applies to a `shipping_allocation_drafts` header that the diagnostic classifies as identity family `LEGACY`
(a non-K2 id whose persisted route is incomplete) **or** `K2` with basis `K2_ROW_BELONGS_TO_A_DIFFERENT_SHIPMENT_GROUP`.

Preconditions, all re-checked at execution time:

1. the header's status is `draft` / `site_confirmed` / `partially_submitted` (never `submitted`/`cancelled`);
2. the header has **not** produced a Shipping Plan (`shipping_plan_evidence.verdict == NO_EVIDENCE_OF_A_SHIPPING_PLAN`);
3. exactly **one** ACTIVE header claims the target K2 group (`conflict.duplicate_count == 0`);
4. the operator has named the exact row by its masked id **and** its stable hash.

Steps (idempotent — re-running after any step is a no-op):

| step | before | after | FK effect | quantity effect |
| --- | --- | --- | --- | --- |
| 1 | header `allocation_draft_id = <legacy id>` | a NEW header is INSERTED at the canonical `SADH-K2-<hash>` for the row's real route dims, copying every business column verbatim | none yet | none — quantities are copied, never recomputed |
| 2 | lines point at `<legacy id>` | each non-cancelled line is INSERTED under the new header with the canonical K2 line id (`sadK2DeterministicLineId_`), `planned_qty` and `recommended_qty` copied byte-for-byte | line FKs now resolve to the canonical header | **none** — no quantity is derived, rounded or recomputed at any point |
| 3 | legacy header still ACTIVE | legacy header **soft-cancelled** (`status='cancelled'` + `cancelled_by`/`cancelled_at`/`cancel_reason`), header and lines **PRESERVED** | old rows remain readable for audit | none |

Explicitly excluded: no row is deleted; no id is rewritten in place; no quantity is manufactured, merged or
adjusted; nothing runs automatically; and the migration never executes inside a save. It stays a separate,
user-authorized task.

### I.6 §C — the diagnostic

`system.executionPlanConflictDiagnostic` (owner `68_`, **new**, strictly read-only) takes the exact route/business
scope and returns: the proposed and existing draft ids (**masked, plus stable hashes**), the identity family
(`CANONICAL` / `K2` / `K3` / `LEGACY` / `UNEXPECTED` / `NOT_FOUND`) with its detail, the full scope (cycle,
company, country, marketplace, SKU/site SKU, source and destination warehouse ids **and** code snapshots, route
number, shipping method, planned qty, expected arrival), the existing header's status/version/provenance, every
existing line id (masked) with its status and quantity, the **named business dimensions that conflict**, the
duplicate count, the K2/K3 reconciliation classification with its basis, whether the row has already produced a
Shipping Plan, the exact blocking reason, safe idempotent dispositions, and a zero-write proof.

It runs the **real** production authorities from `16_` (`sadHeaderRouteIsComplete_`, `sadK2GroupKey_`,
`sadK2DeterministicHeaderId_`, `sadK2ReconcileDecision_`) and re-implements none of them — a second copy of an
identity rule is exactly how a "corresponding canonical id" becomes wrong.

Warehouse endpoints may be given by `warehouse_id`, `warehouse_code` **or** `warehouse_name`, so the operator can
describe the route the way the page shows it (`CN侑鑫`). An ambiguous name is reported as ambiguous, never resolved
by guessing.

### I.7 §D — the UI

The typed backend reason and the server's own sentence are **promoted out of the collapsed disclosure** onto the
face of the inline error, together with the blocking record key when the server supplies one. `Database update
failed` remains the headline (it is true and it is what the operator needs to know first), but the reason code is
now visible without expanding anything. A failed save still leaves the route **UNSAVED** with Submit Plan blocked,
and the local values are kept only so the user can correct and retry.

---

## II. §E/§F/§G — the Shipment ETA

### II.1 Complete call path, and the comparison with Update Position

| stage | Update Position (works) | Update ETA (did not) |
| --- | --- | --- |
| control | `[data-act="route-advance"]` | `[data-act="eta-update"]` |
| identity sent | `vm.shipmentId` = **internal** `shipments.shipment_id` | `vm.shipmentId` = **internal** `shipments.shipment_id` ✔ (never `external_shipment_id`, never `shipment_no`) |
| request field | `route_template_node_id` | `eta` |
| API client | `advanceShipmentRoutePoint` | `updateShipmentEta` |
| verb / action | POST · `shipment.route.advance` | POST · `shipment.eta.update` |
| router | `01_router.gs` doPost | `01_router.gs` doPost ✔ (registered, reachable) |
| handler | `handleAdvanceShipmentRoutePoint_` (31_) | `handleUpdateShipmentEta_` (31_) |
| target | `shipment_routes.status` — a plain **enum string** | `shipments.eta` — a **date-formatted** cell |
| read-back | row match count + status re-read | **none** |
| refresh | bounded `shipment` workspace re-read | bounded `shipment` workspace re-read |

Everything above the last two rows was already correct. **The identity was never wrong and the action was never
unregistered.**

### II.2 Root cause

`shipments.eta` is a **date-formatted column**, and every writer stores it by handing Sheets a `'yyyy-MM-dd'`
string. `Range.setValue` parses a string exactly as if a user had typed it, so the value that comes back out of
`getValues()` is a **Date object**, not the string that went in. The Demo seed states this mechanism verbatim:

> *"a date/datetime written as a STRING will read back as a Date OBJECT whenever the column is date-formatted,
> and the two sides only agree when the canonical wall-clock offset equals the spreadsheet's"*

The legacy whole-DB read has always coped, because `02_ formatValue_` maps a Date to `'yyyy-MM-dd'` before it
leaves the server. **The scoped shipment workspace (`57_`) did not** — `shipWsStr_` is a bare `String(v)`. So on
the Global Logistics Map the ETA came back as `Thu Oct 15 2026 00:00:00 GMT+0800 (…)`, failed the page's
`/^\d{4}-\d{2}-\d{2}$/` date-input test, and rendered as a **blank date box** plus a nonsense card line.

**The write landed. The read could not show it.** Update Position was unaffected because a route status is a plain
enum string with no date coercion anywhere in its path.

Two secondary defects compounded it:

- **No read-after-write.** The handler returned `{ success: true, eta: <the echoed input> }` without re-reading
  the cell, so it reported success on evidence it never gathered — and actively masked the display defect.
- **No transport bound.** `updateShipmentEta` awaited a bare `fetch` with **no timeout**, so a stalled write left
  the button disabled and "Updating ETA…" on screen indefinitely, with no way to distinguish running from dead.

### II.3 §F — the normalization contract (settled by existing authority; no business decision is open)

`shipEtaDateOnly_(v, tz)` in `31_` is the one ETA round-trip normalizer. It is `procurementDateOnly_`'s rule with
the timezone made an explicit parameter; the default is byte-identical.

- **ETA is DATE-ONLY.** The Demo seed's canonical field-class map declares `eta: 'date'` (**not** `'datetime'`);
  `12_` groups `eta` with the `*_date` fields; every writer writes `yyyy-MM-dd`; the map control is
  `<input type="date">`. There is therefore **no time-of-day on an ETA to preserve or to invent**, and §F's STOP
  condition does not trigger. This is read off the canonical authorities, not decided here.
- **Timezone = `Session.getScriptTimeZone()`** — the single authority `02_ formatValue_`, `11_`, `12_` and
  `13_ procurementDateOnly_` all use. It is a **named business timezone, never UTC**, so a UTC day shift cannot
  occur.
- **No browser-locale parsing.** The page sends the raw `YYYY-MM-DD` from the date input verbatim — no `Date`
  object, no `toISOString()`, either of which can shift the calendar day.
- **Blank / invalid fails before any write**, pre-lock and pre-sheet-open, so `zero_write` is a fact.

### II.4 §G — write and verification

One canonical writer, three cells (`eta`, `updated_at`, `updated_by`), on exactly one row. Success requires:
exactly one matching row; the `eta` header present; the cell **read back after the flush** and normalized; and the
persisted value **equal** to the intended value. The response returns the **persisted** value, never the echoed
input, and the page renders from it.

Typed failures: `SHIPMENT_ID_REQUIRED` · `ETA_INVALID` · `SHIPMENT_NOT_FOUND` · `SHIPMENT_IDENTITY_AMBIGUOUS` ·
`ETA_HEADER_MISSING` · `ETA_WRITE_NOT_ACKNOWLEDGED` · `ETA_READBACK_MISMATCH` · `LOCK` ·
`REQUEST_TIMEOUT_WRITE_INDETERMINATE` (client) · `HTTP_TRANSPORT_ERROR`. Every one reaches the drawer as a
**NOT SAVED** line carrying the code, at the ETA control itself — not in the Receiving section further down, where
the previous message node lived.

`ETA_STATUS_NOT_ALLOWED` is **deliberately not emitted.** §G makes it conditional on being canonically required,
and it is not: `SHIPMENT_EDITABLE_FIELDS_` lists `eta` with no status qualifier and `handleUpdateShipment_`
applies no terminal-status gate to a field edit. Inventing one would be a new business rule.

**No shipment_event is appended, on canonical authority.** The canonical `shipment_events.event_type` enum is
`departed_origin` / `route_node_reached` / `received` (`partial_receipt` reserved) —
`docs/planning/DEMO_SEED_SHIPPING_SHIPMENT_MAP_F1-7N-FA-4A.md` §G. Every member is a physical movement or receipt
fact **bound to a geographic route row**, and the same spec forbids an event on a row with no bound location. An
ETA revision is a plan change with no location and no movement, and the enum has no `eta_*` member. So the writer
appends nothing — and the map marker cannot move, because no `shipment_routes` cell is addressed anywhere in the
handler.

**Retry after an indeterminate timeout reconciles first.** `reconcileShipmentEta` re-reads the one shipment
through the existing bounded workspace (no new backend surface, no write, no lock) and reports whether the
persisted ETA already equals the intended one. If it does, the page says so and sends **no second write**.

---

## III. §I — map country boundaries: audit, and the deferred requirement

**Audit result: there is no reusable vector administrative-boundary asset.** The globe has exactly one vendored
vector dataset — `assets/js/data/world-land-110m.js`: Natural Earth 110m **land outline**, 128 rings / 5,122
points, simplified to 0.1°, `[lng,lat]` rings, with **no per-ring country name, ISO code or administrative
attribution**. It is a coastline/land mask, not a boundary layer. It is consumed only by `buildEarthCanvas()` in
`km-globe.js`, which rasterizes it into a 2048×1024 equirectangular texture; there is no vector overlay pipeline
at all. Natural Earth is public domain (no attribution required), which settles provenance for the existing asset
only — a boundary layer would need a new dataset (`ne_110m_admin_0_countries` or equivalent) vendered the same
way, same-origin, with its licence recorded.

Nothing was implemented, no dataset was downloaded, and no network dependency was added. The scoped requirement is
recorded in `GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md` §32.

---

## IV. Not done, and said plainly

- **No live evidence.** No live Apps Script function was executed and no live DB / Drive / property / status /
  email write was made, so **no live performance and no live DB success is claimed** anywhere in this record. Which
  of the two Execution Plan conflict classes the live `CO1100-R` row actually is will be settled by running
  `TEMP_EXECUTION_PLAN_CONFLICT_DIAGNOSE` — it is not asserted here.
- **Nothing was migrated.** The plan in §I.5 is a proposal; `rows_migrated = 0`, `rows_deleted = 0`.
- **The legacy/generic reconciliation rule is unchanged.** By instruction, a genuinely migration-required conflict
  STOPs rather than being auto-healed.
- **Country boundaries were not implemented.** By instruction; deferred and scoped.
- **The `_hydrateAllocationDraftFromDb` scope filter is unchanged.** It selects a draft by country + marketplace +
  company only — not by planning cycle, source page or route — so it can hand the writer an explicit id belonging
  to another cycle or another route. The diagnostic reports that case by name
  (`existing_resolution_basis`, `conflicting_business_identity_fields`); narrowing the hydration filter is a
  behaviour change to a working read path and was not made blind, without live evidence that it is the live cause.
