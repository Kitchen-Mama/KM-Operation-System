# F1-5B-SHIP-R2 — FIFO PO Allocation Authority + Shipment Allocation Architecture Audit

**MODE:** AUDIT FIRST → implement only if the existing contract is sufficient & unambiguous.
**Outcome: HALT — implementation NOT authorized this round.** Four §17 gates fail; each needs a USER decision or authorized schema. No code written. Baseline: [F1_5B_SHIP_R1_PO_TO_SHIPMENT_AUDIT.md](F1_5B_SHIP_R1_PO_TO_SHIPMENT_AUDIT.md).

USER-frozen business rule accepted: **PO consumption = FIFO**, one Shipment Line MAY consume multiple PO Lines (no 1:1 assumption).

---

## §17 authorization gate — result

| Precondition | Status |
|---|---|
| FIFO ordering authority exists | ⚠ **AMBIGUOUS** → `PO_FIFO_ORDERING_AUTHORITY_GAP` |
| Legal PO matching scope is deterministic | ⚠ **AMBIGUOUS** → `SHIPMENT_TO_PO_ATTRIBUTION_IDENTITY_GAP` |
| `shipment_line_allocations` existing schema is sufficient | ✗ **ABSENT** → `SHIPMENT_FIFO_ALLOCATION_SCHEMA_GAP` |
| Capacity authority is unambiguous | ✗ **AMBIGUOUS** → `PO_SHIPPABLE_CAPACITY_AUTHORITY_GAP` |
| No collision with `shipment_lines.purchase_order_line_id` | ✓ (see §5) |
| Existing Dispatch boundary can own execution | ✓ (Confirm & Dispatch, locked) |

Two hard-absent gates (schema, capacity) + two ambiguous gates (ordering, scope) ⇒ **HALT**. Below are the audited facts and the smallest safe options for each gap so the USER can authorize a complete R3.

---

## §2 — FIFO "first" ordering authority (AUDIT)

Date fields on the PO tables (`PURCHASE_ORDERS_HEADERS_` [13_:72-84], `PURCHASE_ORDER_LINES_HEADERS_` [13_:87-96]):

| Field | Location | Semantics | FIFO fit |
|---|---|---|---|
| `order_date` | PO header | **Send-PO date** — blank at Convert, stamped only at the `issue` transition ([13_:1828] `order_date:''`; issue stamps it) | Best *business* "when ordered" — but **blank until issued** |
| `created_at` | PO header + line | Row creation (at RO→PO Convert) | Always present, but "created" ≠ "ordered" (spec §2: *do not silently pick created_at*) |
| `expected_completion_date` / `expected_ship_date` / `inspection_date` | header + line | Schedule dates copied from the request line | Schedule intent, not order chronology |
| `issued_at` / `confirmed_at` / `completed_at` | PO header | Lifecycle transition stamps | Partial (only after that transition) |

**Finding:** there is **no single field that is both always-populated AND the business order chronology.** `order_date` is the correct business key but is blank for draft/approved-not-yet-issued POs; `created_at` is always present but is not the order date. Deterministic tie-breaker identity **does** exist (`po_no` / `purchase_order_line_id`). → **`PO_FIFO_ORDERING_AUTHORITY_GAP`.**

**Smallest safe options (USER picks one):**
1. FIFO key = `order_date ASC, po_no ASC, purchase_order_line_id ASC`; **eligibility floor = PO `order_status` ∈ {issued, confirmed, in_production, ready_to_ship, …}** (i.e. only *placed* POs have an order_date and are FIFO-eligible). Recommended — matches "earliest placed order consumed first."
2. FIFO key = `COALESCE(order_date, created_at) ASC, created_at ASC, purchase_order_line_id ASC` — includes not-yet-issued POs using created_at as a documented fallback. Weaker (mixes two semantics).

## §3 — Legal FIFO matching scope (AUDIT)

Fields available to match a **shipment line** to eligible **PO lines**:

| Dimension | On shipment side | On PO side | Verdict |
|---|---|---|---|
| `sku` | `shipment_lines.sku` | `purchase_order_lines.sku` | **REQUIRED MATCH** (both present) |
| `company` | `shipments.company` [12_:32] | `purchase_order_lines.company` / PO header | **REQUIRED MATCH** (both present) |
| factory / supplier | shipment carries `source_warehouse_id` / `ship_from` (NOT factory_id/supplier_id) | PO carries `factory_id` + `supplier_id` | **AMBIGUOUS** — no direct shared key; would require `source_warehouse_id → factory` mapping that may not hold (shipment can ship from a consolidation warehouse, not the PO factory) |
| country / marketplace | `shipments.country`,`marketplace` [12_:32] | **absent on PO** (procurement is destination-agnostic) | **NOT AVAILABLE** — cannot be a match dimension |
| destination warehouse | `shipments.destination_warehouse_id` | absent on PO | **NOT AVAILABLE** |
| PO status / line status | — | `order_status` / `line_status` | **REQUIRED FILTER** (eligibility, not a join key) |
| request_bucket (T1/T2_T3) | — | `purchase_order_lines.request_bucket` | INFORMATIONAL (not a shipment concept) |
| planning cycle | — | not on PO line | NOT AVAILABLE |

**Finding:** only **sku + company** are cleanly, deterministically matchable from persisted fields. Factory/supplier alignment — the intuitively-correct fulfillment boundary — is **ambiguous** (shipment has no factory/supplier; PO has no destination). Matching on sku+company alone risks consuming a PO produced at factory X for a shipment leaving factory Y. → **`SHIPMENT_TO_PO_ATTRIBUTION_IDENTITY_GAP`.** Per spec, must NOT weak-match by date/qty/latest/actor — so this requires a USER decision.

**Smallest safe options (USER picks one):**
1. Scope = `sku + company` only (accept cross-factory fulfillment as legitimate for a single company). Simplest; deterministic.
2. Scope = `sku + company + factory`, where shipment factory = `warehouses[source_warehouse_id].factory_id` (reuse `procurementResolveFactoryId_`'s master). Deterministic **iff** every source warehouse maps to exactly one factory — must be verified against live `warehouses` before adopting.
3. Introduce an explicit attribution at shipment-line creation (out of scope for a pure allocation seam; larger change).

## §4/§18 — `shipment_line_allocations` re-audit — **SCHEMA ABSENT**

Confirmed (grep across all `*.gs`): **no `SHIPMENT_LINE_ALLOCATIONS_HEADERS_` array, no sheet registration, no getter, no writer.** The only `*_allocation*` runtime owner is `shipping_allocation_drafts` (KMALLOC source-split, `16_shipping_allocation_handlers.gs`) — a **different** table (which source warehouse supplies a shipping-plan qty), not PO consumption. `shipment_line_allocations` exists only in docs (`SHIPMENT_CENTER_SPEC.md:142`, `DATABASE_RELATIONSHIP_MAP.md`) and a test name.

The table **cannot be auto-created at runtime**: `procurementEnsureSheet_` → `prodRequireSheet_` is VALIDATE-ONLY (throws if the sheet is absent); creating a sheet requires `prodMigrateCreateSheet_` with a Migration Authorization DTO (production-safety RULE S0-3). → **`SHIPMENT_FIFO_ALLOCATION_SCHEMA_GAP`** — creating this table is a USER-authorized migration (the R4E5D pattern).

**Proposed smallest additive schema** (for USER authorization — do NOT create without it):

```
sheet: shipment_line_allocations
  shipment_line_allocation_id   (PK — 'SLA-' + uuid)
  shipment_id                   (parent shipment; scoping + bulk reversal)
  shipment_line_id              (FK → shipment_lines.shipment_line_id — physical qty owner)
  purchase_order_id             (denormalized parent for readback/documents)
  purchase_order_line_id        (FK → purchase_order_lines — the consumed PO line)
  sku                           (denormalized guard/readback)
  company                       (denormalized scope guard)
  allocated_qty                 (this allocation's consumed qty — PO-consumption lineage ONLY)
  allocation_status             ('draft' | 'executed' | 'reversed')   ← lifecycle
  fifo_rank                     (deterministic order this allocation was generated at — audit)
  created_by, created_at, updated_by, updated_at
  reversed_by, reversed_at, reverse_reason   (reversal metadata)
```

This represents `Shipment Line 1 ├ POL-A→300 └ POL-B→300` as **two rows** (same `shipment_line_id`, different `purchase_order_line_id`). Physical shipment qty stays solely on `shipment_lines.shipment_qty`; the allocation table holds **only** PO-consumption lineage (no duplicate physical-qty ownership). Backward compatible (new sheet; historical shipments simply have no allocation rows → treated as un-attributed legacy, never rewritten). Migration owner = `prodMigrateCreateSheet_` (USER-run, like R4E5D).

## §5 — `shipment_lines.purchase_order_line_id` semantic verdict

Column exists ([12_:63]), **never written**, **no runtime consumer** (R1 + this audit). No code depends on it being the sole/1:1 PO link. → **No `SHIPMENT_LINE_PO_SINGLE_LINK_SEMANTIC_CONFLICT`.** Verdict: keep the column as an **optional primary-source convenience reference** (populate with the FIFO *first* PO line when an allocation exists; leave blank when a line spans multiple POs or has no allocation). The authoritative multi-PO lineage lives in `shipment_line_allocations`. Do not delete or repurpose.

## §6 — Allocation timing (recommendation, pending gates)
Recommended boundary = **D (Hybrid)**: materialize `allocation_status='draft'` allocations when shipment qty is known (draft), and flip to `allocation_status='executed'` + reconcile `purchase_order_lines.shipped_qty` **only at Confirm & Dispatch** [22_:35] (the existing locked, rollback-compensated physical boundary that already deducts factory_stock). Draft allocations are PREVIEW only and must NOT touch `shipped_qty`. This preserves the frozen dispatch execution semantics and gives one durable consumption moment. (Not implemented — gated on §2/§3/§4/§9.)

## §9 — PO shippable-capacity authority — **AMBIGUOUS**

| Field | Meaning in the existing system | Writer |
|---|---|---|
| `ordered_qty` | Qty ordered from supplier (= `approved_qty` at PO create) | `poCreateBucketGroup_` [13_:1794] |
| `completed_qty` | Qty **produced/received at factory** (cumulative) | `handleReceivePurchaseOrderLines_` [13_:2203] |
| `shipped_qty` | Qty shipped out — **never written** (R1) | none |
| `remaining_qty` | `max(0, completed_qty − shipped_qty)` = **available-to-ship** | [13_:2168,2263] |

The existing frozen semantics gate shippable capacity on **`completed_qty`** (you cannot ship un-produced goods) — the code comment is explicit: *"remaining_qty = available-to-ship = completed_qty − shipped_qty (NOT ordered − shipped)"* [13_:2165]. The spec §7/§9 FIFO `available` uses **`ordered_qty − shipped`**. These are two different remainders:
`ordered − completed` = still-to-produce; `completed − shipped` = ready-to-ship; `ordered − shipped` = not-yet-shipped-of-order. → **`PO_SHIPPABLE_CAPACITY_AUTHORITY_GAP`** — a business decision, must NOT be silently chosen.

**Recommendation (USER confirms):** FIFO `available = max(0, completed_qty − executed_shipped_qty)` — bounded by produced goods, consistent with the existing frozen `remaining_qty` and physical reality; then `shipped_qty = Σ executed allocations` and `remaining_qty = completed_qty − shipped_qty` stays the single existing formula (no change to its shape). Adopt `ordered − shipped` ONLY if the business wants to reserve PO capacity before production (a different model).

## §7/§8 — Algorithm & over-ship (defined, pending gates)
Once §2/§3/§9 are fixed, the canonical allocator is deterministic: `remaining = shipment_qty; for poLine in eligible (FIFO): take = min(remaining, available(poLine)); emit allocation; remaining -= take; until 0`. If `Σ available < shipment_qty` → **`PO_CAPACITY_INSUFFICIENT`** (fail closed; diagnostic = requested/available/shortage/eligible lines). No negative remaining, no silent partial dispatch.

## §10/§11/§12 — Execution, idempotency, edit/cancel (audited)
- Execution boundary = **Confirm & Dispatch** [22_:35] (locked + rollback + factory_stock). Extend it (not a second engine) to flip draft→executed allocations + reconcile shipped_qty in the same locked transaction.
- Idempotency = **reconciliation from durable executed allocations** (recompute `shipped_qty = Σ executed shipment_line_allocations.allocated_qty` per PO line) — retry-safe by construction, no blind `+=`, no frontend/localStorage/timestamp dedupe.
- Edit before dispatch: shipment qty is editable only on the **Weekly Shipping Plan while draft** (R1); on edit, draft allocations must be regenerated to converge (e.g. 600→450). Post-dispatch qty is immutable in the current UI.
- **`DISPATCHED_SHIPMENT_REVERSAL_POLICY_GAP`**: R1 confirmed **no** shipment cancel/reversal path exists. Post-dispatch reversal is a **separate** business decision — isolate it; it does NOT block pre-dispatch FIFO allocation. Do not invent destructive reversal.

## §13/§14/§15 — Relationships (audited, unchanged)
- **Shipping Plan** stays logistics demand/intent (no PO key) — do NOT force PO IDs into it; Shipment execution resolves FIFO. ✓ preferred separation.
- **Factory stock** deduction stays its own authority at dispatch; PO `shipped_qty` (order-fulfillment ledger) is a **distinct** quantity — not double-owned. Do not modify factory stock.
- **Receipt / On-the-Way** already consume the single `shipment_lines` source — one shipment, no duplicate lines. ✓

## §16 — Shipping-detail / export readiness (audited)
A future document snapshot can already read `shipment` + `shipment_lines` (physical qty) + (once built) `shipment_line_allocations` (→ one shipment line → **multiple** PO nos/lines + allocated_qty). The allocation table's denormalized `purchase_order_id`/`sku` make multi-PO representation straightforward without flattening to one arbitrary PO. UPC is present on shipment_lines; UPC-per-PO is derivable. No export work this round.

---

## §20 Completion report (summary)
PRE/POST HEAD → chat · FIFO date field = **ambiguous** (`order_date` best but blank-until-issued; GAP) · tie-breaker = `po_no`/`purchase_order_line_id` (exists) · legal scope = **sku+company deterministic; factory ambiguous** (GAP) · eligible PO status/line-status = must be a USER-set filter (not yet defined) · shippable-capacity authority = **ambiguous** (completed vs ordered; GAP) · ordered_qty = supplier order · completed_qty = produced/received · shipped_qty = never written (target: Σ executed allocations) · remaining before/after = `completed−shipped` (keep) · shipment physical qty = `shipment_lines.shipment_qty` ✓ · `shipment_line_allocations` = **ABSENT (no runtime schema)** · allocation grain = 1 shipment_line → N PO lines (multi-PO **required**) · `shipment_lines.purchase_order_line_id` = keep as optional primary-source ref · allocation boundary = Hybrid (draft preview → executed at dispatch) · dispatch boundary = Confirm&Dispatch [22_] · reservation = none today · capacity guard = to build (`PO_CAPACITY_INSUFFICIENT`) · idempotency = reconcile from executed allocations · edit-before-dispatch = via plan draft · post-dispatch cancel = **no path (GAP, isolate)** · factory stock = distinct ledger ✓ · Shipping Plan = logistics intent (no PO key) ✓ · export = deferred, representable · **files changed = this doc** · tests = none · **Apps Script sync = none · frontend deploy = none · bundle rebuild = none · DB/schema impact = none · API/formula/inventory/shipment/PO impact = none** · commit = chat · **verdict = HALT** · next slice = R3 after gaps resolved.

## DECISION — **HALT** (audit only; no implementation)

Blocking gaps, each with the smallest safe resolution above:
1. **`SHIPMENT_FIFO_ALLOCATION_SCHEMA_GAP`** — create `shipment_line_allocations` (proposed schema §4) via authorized migration (`prodMigrateCreateSheet_`, USER-run). Backward compatible (new sheet).
2. **`PO_SHIPPABLE_CAPACITY_AUTHORITY_GAP`** — USER confirms capacity = `completed − shipped` (recommended) or `ordered − shipped`.
3. **`PO_FIFO_ORDERING_AUTHORITY_GAP`** — USER confirms FIFO key + eligibility floor (option 1 recommended).
4. **`SHIPMENT_TO_PO_ATTRIBUTION_IDENTITY_GAP`** — USER confirms legal scope (sku+company, or +factory via warehouse→factory map).
   (Plus isolated, non-blocking: `DISPATCHED_SHIPMENT_REVERSAL_POLICY_GAP`.)

### Exact R3 scope (once the four gaps are resolved + schema authorized)
Backend-only, no second engine: canonical eligible-PO resolver (§3 scope) · deterministic FIFO sorter (§2 key) · shipment-line → multi-PO allocation generator (§7) · capacity/conservation validation (§8, `PO_CAPACITY_INSUFFICIENT`) · persist `shipment_line_allocations` (draft) · reconcile `shipped_qty` + flip executed at Confirm & Dispatch (§9/§10) with idempotency-by-reconciliation · focused tests (§19 A–J). Export + post-dispatch reversal deferred.

## FINAL GATE (proof status)
SHIPMENT_LINES REMAINS PHYSICAL TRUTH ✓ · MULTI-PO REQUIRED (no 1:1) ✓ (design) · FACTORY STOCK NOT DUPLICATED ✓ · NO SECOND ENGINE ✓ · UPSTREAM AI PLAN→RO→PO UNCHANGED ✓ ·
**Cannot yet prove (missing authority):** FIFO ORDER DETERMINISTIC ✗ (date gap) · NO GLOBAL SKU-ONLY MATCH ✗ (scope gap) · ALLOCATIONS = PO-CONSUMPTION LINEAGE AUTHORITY ✗ (schema absent) · NO OVER-SHIP / Σ=qty / CAPACITY CONSERVED ✗ (capacity gap + no allocator yet) · NO RETRY DOUBLE-CONSUME ✗ (no ledger yet).
→ **HALT at the four exact authorities above. No approximation, no schema created, no silent picks.**
