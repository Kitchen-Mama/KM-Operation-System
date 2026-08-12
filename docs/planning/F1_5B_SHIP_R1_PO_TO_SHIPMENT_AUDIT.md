# F1-5B-SHIP-R1 — PO → Shipment Allocation Execution Authority Audit

**MODE:** AUDIT-FIRST · READ-ONLY · NO ARCHITECTURE REWRITE · **Verdict: B — PARTIALLY CONNECTED**
**Date:** 2026-08-12 · Upstream (Planning/Allocation/RO/PO exactly-once) frozen per §0.

## Headline

The system runs **two internally-canonical but DISCONNECTED domains**:

- **Procurement** — AI Plan → Request Order → Purchase Order (R4E5B/C/D + F1-5A-PO exactly-once). `purchase_order_lines` holds `ordered_qty`, `completed_qty` (production/receipt), `shipped_qty`, `remaining_qty`.
- **Logistics** — **Weekly Shipping Plan** (sourced from the inventory-replenishment UI, **not** from POs) → approve → `createShipmentFromApprovedPlan_` → `shipments` + `shipment_lines` → Confirm & Dispatch (deducts **factory_stock**) → On-the-Way Map / receipt.

**The PO→Shipment execution bridge is essentially UNBUILT.** No code path — read or write — connects a `purchase_order_line` to a shipping plan or shipment. The bridge columns exist but are dead:
`shipment_lines.purchase_order_line_id` (schema-present, **never written**), `purchase_order_lines.shipped_qty` (**no accrual writer**, permanently 0), `shipment_line_allocations` (**spec-only / deferred — no runtime code**).

Consequently the §2 canonical quantity chain is broken at BOTH ends and absent in the middle.

---

## §1/§23 Owner map (with file:line)

| Owner | Where | Class |
|---|---|---|
| `purchase_orders` / `_lines` writer | `poCreateBucketGroup_` [13_:1680,1628](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1628) | **CANONICAL** |
| `ordered_qty` | set = `approved_qty` at PO create [13_:1794](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L1794) | **CANONICAL** (source capacity) |
| `completed_qty` (production/receipt) | `handleReceivePurchaseOrderLines_` [13_:2203](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L2203) | **CANONICAL** |
| **`shipped_qty` accrual** | **none** (init 0 at [13_:1794]; receipt "shipped_qty untouched" [13_:2262]) | **UNWIRED** |
| `remaining_qty` | `max(0, completed_qty − shipped_qty)` [13_:2168,2263](../../assets/specs/active/apps-script/13_procurement_handlers.gs#L2168) | **CANONICAL** but `shipped_qty` term is inert (≈ `completed_qty`) |
| Shipping-plan writer | `handleCreateShippingPlansBatch_` [11_:264](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs#L264) | **CANONICAL** (no PO key) |
| Shipping-plan lines | `SHIPPING_PLAN_LINES_HEADERS_` [11_:40](../../assets/specs/active/apps-script/11_shipping_plan_handlers.gs#L40); qty from request body | **CANONICAL** (no PO lineage) |
| Shipment + `shipment_lines` writer | `createShipmentFromApprovedPlan_` [12_:314,535](../../assets/specs/active/apps-script/12_shipment_handlers.gs#L535) | **CANONICAL** (unguarded append; plan-id idempotency, no lock) |
| `shipment_lines.shipment_qty` | = plan `approved_qty` [12_:539](../../assets/specs/active/apps-script/12_shipment_handlers.gs#L539) | **CANONICAL** (physical truth) |
| `shipment_lines.shipping_plan_line_id` | [12_:542](../../assets/specs/active/apps-script/12_shipment_handlers.gs#L542) | **CANONICAL** (1:1 lineage) |
| `shipment_lines.purchase_order_line_id` | header [12_:63](../../assets/specs/active/apps-script/12_shipment_handlers.gs#L63), never written | **UNWIRED** |
| `shipment_line_allocations` | not defined/written in any `.gs` (docs only) | **UNWIRED / PLANNED** |
| Confirm & Dispatch (finalization) | `handleConfirmShipmentAndDispatch_` [22_:35](../../assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs#L35) — **locked + rollback**, deducts **factory_stock** (not shipped_qty) | **CANONICAL** |
| Receipt writer | `handleUpdateShipmentReceipt_` [31_:268] — locked | **CANONICAL** |
| Over-ship / conservation guard vs PO | **none** | **ABSENT** |
| Shipment cancel / reversal | **none** (no cancel action in router) | **ABSENT** |
| Shipping-detail / export document engine | none (spec-only, deferred) | **UNWIRED** |
| Shipment Draft/Overview render | `shipping-history.js` `_shRenderDbCard` | **DISPLAY_ONLY** (reads persisted snapshot; no recompute) |

## §2 Canonical quantity chain — audited vs reality

| Intended | Reality |
|---|---|
| `ordered_qty → available_to_ship` | ✗ shipments do **not** read `purchase_order_lines`; qty comes from the shipping plan (inventory replenishment) |
| `→ shipment_lines.shipment_qty` | ✓ but sourced from plan `approved_qty`, **not** PO |
| `→ shipment_line_allocations.allocated_qty` | ✗ table does not exist in runtime |
| `→ purchase_order_lines.shipped_qty` | ✗ never written |
| `→ remaining = ordered − shipped` | ✗ actual formula is `completed − shipped` (shipped always 0 → remaining ≈ completed) |

- Exact ordered field: `purchase_order_lines.ordered_qty`. Exact shipped field: `purchase_order_lines.shipped_qty` (dead). Exact remaining: `purchase_order_lines.remaining_qty` = `max(0, completed − shipped)`.
- Allocation qty field: **none** (table absent). `shipment_lines.shipment_qty` **is** physical truth (persisted, read-only on shipment pages). Allocation qty is neither persisted nor derived against POs.

## §3 `shipment_line_allocations` — **SHIPMENT_LINE_ALLOCATIONS_NOT_RUNTIME_AUTHORITY**
Defined only in specs (`SHIPMENT_CENTER_SPEC.md`) + one test-name fixture; **no header array, getter, or writer in any `.gs`**. `project-current-state.md` records it as "ENTIRELY PLANNED (option c) … current model = single `shipment_lines.purchase_order_line_id` link." Current supported grain (once wired) would be **A: 1 shipment line → 1 PO line** via that column. **§9 MULTI_PO_SHIPMENT_SOURCE_NOT_SUPPORTED** (no multi-source per shipment line exists; do not invent it).

## §4 Allocation timing / §11 finalization boundary
No allocation is created at any phase today. The one **locked, staged, rollback-compensated** finalization transition is **Confirm & Dispatch** [22_:35] — it already atomically deducts `factory_stock`. That is the natural (and only safe) attach point for a future PO-consumption seam. Shipment creation on plan-approve is **unguarded** (no lock).

## §5 `shipped_qty` authority
Writer: **none**. Never set/incremented at any transition; not derived from allocations/shipment_lines/receipt. No reversal, no partial increment, no double-increment risk (because it is never written). No dual authority — it is simply un-owned.

## §6 remaining authority
Single owner (`13_`), formula `max(0, completed_qty − shipped_qty)`. No duplicate calculation on the backend; the frontend PO list recomputes `completed − shipped` for display only ([purchase-order-list.js:134]). Because `shipped_qty≡0`, remaining currently means "produced-but-not-dispatched" only in name.

## §7 Conservation — **FAILS (cannot be proven)**
No writer accrues `shipped_qty`; no guard compares shipment qty to PO `ordered_qty`/`remaining_qty`. `Σ allocations ≤ ordered` is vacuously true only because allocations don't exist; `shipped_qty = Σ executed allocations` is false (0 vs actual shipped). The §7 fixture (PO 1000 → 600 → 300 → 500) is **not enforceable** today — nothing prevents 1400.

## §8 Partial shipment
Partial is possible at the plan/shipment level (a plan can ship < produced), but it is **not conserved against PO capacity** (no PO ledger). So partial "works" only in the logistics domain, blind to the PO.

## §10 Actual shipment qty
Editable **only** on the **Weekly Shipping Plan** (`shipping-plan.js`) SKU line `approvedQty`, and **only while the plan is `draft`** → persisted via `updateShippingPlanLineQty`. Frozen into `shipment_lines` at plan approval; **read-only** on every shipment page thereafter (before and after dispatch). Validation is against replenishment inputs, **not** PO remaining → **no backend PO-capacity ownership (unsafe w.r.t. PO conservation).**

## §12 Idempotency / retry
- Shipment creation: **unguarded append**, best-effort plan-id scan (`already_exists`), **no lock** → concurrent plan-approve can race.
- Confirm & Dispatch: **locked + idempotency pre-check + rollback** (factory_stock) — safe for its own scope.
- PO `shipped_qty`: never written → no double-allocation at the PO layer (nothing to double). The idempotency gap is therefore **not** in the PO ledger yet — it will materialize the moment a `shipped_qty` accrual seam is added, and MUST be built idempotent (derive from `shipment_lines`, or a durable allocation record + lock).

## §13 Cancellation / editing
No shipment cancel/reversal path exists anywhere. Editing shipment qty after plan approval is not possible on shipment pages. PO cancel sets `order_status='cancelled'` only — does not touch shipments/allocations/shipped_qty. **No corruption risk today because there is no PO consumption to corrupt.**

## §14 Factory stock
`factory_stock` is deducted at Confirm & Dispatch (locked). PO `shipped_qty` is a **different** ledger (order-fulfillment, un-owned) from factory physical stock. They are **not** double-owned today; a future R2 must keep them distinct (physical inventory vs order-fulfilled qty), both legitimately updated at dispatch. **Not modified this round.**

## §15 Receipt / On-the-Way
`shipment_lines` (getShipmentLines) is the single source feeding On-the-Way Map + receipt + overseas posting. **One shipment source, no duplicate line generation.** ✓

## §16/§17 Final document readiness
No shipment document/export engine exists (deferred). Shipment Draft/Overview is **DISPLAY_ONLY**, reading the persisted `shipments`/`shipment_lines` snapshot with **no** Forecast/FC/planning recompute (commit is "never recalculated from live inventory"). Completeness of the persisted snapshot: shipment_no ✓, lines ✓, sku ✓, shipment_qty ✓, carton_qty ✓, carton_ranges ✓(user-entered), units_per_carton ✓, CBM ✓(+fallback), gross/net ✓, destination/warehouse/carrier/ETA/method/plan-lineage ✓; **PO lineage ✗ (blank)**, **UPC ✗ (not in schema)**. Target architecture (documents read a complete canonical snapshot) is **already the pattern** — the only gaps are PO lineage + UPC, not a recompute defect.

## §18 Lineage chain — present vs missing
Present: `AI Plan → allocation draft → request_order_line (request_order_line_sources.request_allocation_draft_id, LIVE) → purchase_order_line (request_order_line_id, F1-5A) ✓` and separately `shipment_line → shipping_plan_line → shipping_plan → shipment ✓`.
**Missing links:** `purchase_order_line → shipment_line` (column exists, unwired) and `shipment_line_allocation` (absent). The two chains never meet.

## §19 Page / DB integration
All pages read the **canonical Operation DB** (`window.KM.DB.get*` → `_opDbCache`); none uses mock in live mode:
- request-order-draft.js — CANONICAL_DB · purchase-order-overview.js (= PO Workspace) — CANONICAL_DB · purchase-order-list.js — CANONICAL_DB (read-only) · shipping-plan.js (Weekly Shipping Plan) — **MIXED** (canonical primary; sessionStorage/`replenishmentMockData` only in Demo) · shipping-history.js (Shipment Draft + Overview) — CANONICAL_DB · global-logistics-map.js — CANONICAL_DB (read-only). **No page-connection gap** — the pages are already on canonical DB.

## §21 Fixture map (analysis, no code)
A (1000→600): shipment created, `shipment_qty=600`; PO `shipped_qty` stays 0, remaining stays `completed`. **PO unaware.** · B (600+400): two shipments; PO still unaware; no ≤1000 enforcement. · C (rem 100 → ship 500): **not blocked** (no PO guard) → over-ship possible. · D/E (retry / two-tab finalize): Confirm&Dispatch is locked/idempotent for factory_stock; **PO ledger N/A** (unwritten). · F (edit 600→500 pre-final): only via plan-draft; not reflected to any PO. · G/H (cancel): **no shipment cancel path**. · I (same SKU across 2 PO lines): **unsupported** (MULTI_PO_SHIPMENT_SOURCE_NOT_SUPPORTED). · J (multi-SKU shipment): supported (plan lines). · K (merged shipment): plan-level only. · L (fully received downstream): receipt works against `shipment_qty`, not PO.

---

## §22 DECISION — **B: PARTIALLY CONNECTED**

Both domains are individually canonical, but the PO→Shipment execution bridge is unbuilt. This is **not** verdict D (the lineage CAN be represented — `shipment_lines.purchase_order_line_id` exists — so no schema HALT), and **not** C (no dual writer; `shipped_qty` has no writer at all).

**Exact missing seams, smallest safe implementation order (for a future authorized F1-5B-SHIP-R2 — NOT built here):**

1. **Attribution identity (design decision — resolve FIRST, needs authorization).** Shipping plans carry **no PO key**, so a shipment line's SKU qty currently cannot be attributed to a `purchase_order_line`. Decide the rule: (a) source shipping-plan/ shipment lines from PO available-to-ship, or (b) an explicit attribution step matching `shipment_lines` (sku + company + destination) to open PO lines. Flag: **`SHIPMENT_TO_PO_ATTRIBUTION_IDENTITY_ABSENT`** — do not invent silently.
2. **Populate `shipment_lines.purchase_order_line_id`** at shipment creation (column already exists; no schema change).
3. **Accrue `purchase_order_lines.shipped_qty` at the Confirm & Dispatch boundary** (already locked + rollback) as `Σ shipment_qty` attributed per PO line, with a **conservation guard** (reject over-ship vs `ordered_qty`) and **idempotency by derivation** (recompute `shipped_qty = Σ shipment_lines.shipment_qty` over dispatched shipments per PO line — avoids double-increment; **no new table** needed while 1 shipment line → 1 PO line).
4. **Reversal**: a shipment cancel / return-to-draft path that reverses the PO consumption (and, separately, factory_stock).
5. **`shipment_line_allocations`**: build ONLY if multi-PO-source per shipment line becomes a requirement (§9). Until then keep the single `purchase_order_line_id` link.
6. **Documents**: add PO lineage + UPC to the persisted snapshot before any export engine — keep documents read-only over canonical DB.

## §23 Completion report (summary)
PRE/POST HEAD → chat · ordered owner = `ordered_qty` @PO create · shipped owner = **none** · remaining owner = `13_` (`completed−shipped`) · plan owner = `11_` · shipment/lines owner = `12_` · allocations owner = **none (PLANNED)** · allocation grain = would-be 1:1 via `purchase_order_line_id` · finalization = Confirm&Dispatch [22_] · PO capacity validation = **absent** · shipped mutation = **never** · partial support = logistics-only, not PO-conserved · multi-PO = **not supported** · retry = create unguarded / dispatch locked; PO ledger N/A · cancel = **absent** · factory-stock = deducted at dispatch (distinct ledger) · incoming/receipt = single shipment source ✓ · shipping-detail owner = display-only, no engine · snapshot completeness = complete except PO lineage + UPC · lineage = PO↔shipment link missing · page/DB = all canonical (plan mixed in Demo only) · duplicate owners = none (under-owned, not over-owned) · **DB/schema impact = NONE (audit)** · formula/stock impact = NONE · files changed = this doc · tests = none · **verdict = B** · next slice = F1-5B-SHIP-R2 seams 1–4 above (attribution decision first).

## FINAL GATE (proof status)
PO ORDERED = SOURCE CAPACITY ✓ · SHIPMENT LINE = ACTUAL PHYSICAL QTY ✓ · SHIPMENT INCOMING USES SAME SHIPMENT ✓ · RECEIPT USES SAME SHIPMENT LINE ✓ · FINAL DOCUMENT READS CANONICAL DATA ✓ · NO PLANNING RECOMPUTE ✓ · NO SECOND SHIPMENT ENGINE ✓ ·
**FAILS (unbuilt seam):** SHIPMENT LINE ALLOCATION = PO CONSUMPTION LINEAGE ✗ · Σ ALLOCATION ≤ PO ORDERED ✗ · PO SHIPPED CONSISTENT WITH EXECUTED ALLOCATION ✗ · PO REMAINING CONSERVED (vs ordered) ✗ · PARTIAL SHIPMENT SAFE (vs PO) ✗ · RETRY CANNOT DOUBLE ALLOCATE (no PO ledger yet) ✗ · CANCEL/EDIT DOES NOT CORRUPT CAPACITY (no path) ✗ · FACTORY STOCK NOT DOUBLE-OWNED ✓ (distinct today).

**HALT at the missing authority: the PO→Shipment consumption seam (shipped_qty accrual + attribution + conservation) is unbuilt.** No implementation this round; F1-5B-SHIP-R2 must resolve the attribution identity before writing the seam.
