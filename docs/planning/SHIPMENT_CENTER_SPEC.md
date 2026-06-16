# Shipment Center / Shipment Draft / Shipment Overview — Specification

**Status:** 🟡 Draft v2.1 — Architecture / Spec only (NO code, NO DB, NO implementation)
**Last Updated:** 2026-06-12
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md), `assets/specs/active/SYSTEM_ROADMAP.md`

> **Spec only.** This document defines architecture, flow, UI, and data relationships for the Shipment layer. It does **not** introduce code, Apps Script, API, UI, DB migration, or runtime changes. New tables/fields described here are *planned* design, not implemented.
>
> **Changelog v1 → v2:** Added `warehouses` full schema, `factory_stock.reserved_stock` + `available_stock = current_stock − reserved_stock` rule, reservation lifecycle (reserve on plan approval, release on cancel, deduct on ship), expanded `factory_stock_movements` (separate before/after for current vs reserved + reservation movement types), planned `factory_stock_allocation_plans` planning-layer table, production_schedule positioned as upstream readiness (not an MVP shipment dependency), and multi-PO display via `shipment_line_allocations`.
>
> **Changelog v2 → v2.1:**
> - Refined FIFO PO allocation eligibility (`available_to_ship = completed_qty − shipped_qty`; never ship uncompleted PO quantity).
> - Added future allocation version / `plan_run_id` requirement for `factory_stock_allocation_plans`.
> - Added open item for received / delivered / completed status distinction.
> - Clarified Formal Shipment positioning (execution layer, not a separate duplicate table).

---

## 0. Schema Baseline (current, after recent DB redesign)

These reflect the **current** Google Sheet schema and supersede older docs. **Factory / source location and company come from `warehouses` via `warehouse_id`** — inventory/PO/production tables no longer store `factory_name` or `company`.

**`warehouses`** (warehouse master) —
`warehouse_id, warehouse_code, warehouse_name, warehouse_type, company, country, marketplace, warehouse_owner, is_factory_warehouse, is_active, address, city, state, postal_code, contact_name, contact_email, contact_phone, created_by, created_at, updated_by, updated_at, note`
- `warehouse_id` = system master id (e.g. `WH-RESUS-US-FBA-AMAZON`); `warehouse_code` = external/receiving code (e.g. `ONT8`).
- `is_factory_warehouse` distinguishes factory (production-side) warehouses from destination/3PL/FBA warehouses.

**`factory_stock`** — `factory_stock_id, warehouse_id, sku, current_stock, reserved_stock, created_at, updated_at, last_transaction_at`
- **No `company`, no `factory_name`.** Company = `warehouses.company`; Factory name = `warehouses.warehouse_name` (join by `warehouse_id`).
- `current_stock` = physical stock currently in the factory warehouse.
- `reserved_stock` = stock reserved for approved Shipping Plans / draft shipments, **not yet physically shipped**.
- **`available_stock` = `current_stock − reserved_stock`** — **computed, do NOT store** unless a future performance need arises.
- **Unique key: `warehouse_id + sku`.**

**`factory_stock_movements`** — `factory_stock_movement_id, movement_date, sku, warehouse_id, movement_type, qty, related_entity_type, related_entity_id, before_current_stock, after_current_stock, before_reserved_stock, after_reserved_stock, note, created_by, created_at`
- Uses `warehouse_id` (no `factory_name`). Must log **both physical stock and reservation changes** — hence separate `before/after_current_stock` and `before/after_reserved_stock`.
- **Recommended `movement_type` values:** `stock_in`, `stock_reserved`, `stock_reservation_released`, `stock_shipped`, `stock_adjustment`.

**`purchase_orders`** — `purchase_order_id, po_no, km_po_no, warehouse_id, supplier_name, order_status, order_date, expected_completion_date, expected_ship_date, submitted_by, submitted_at, rejected_by, rejected_at, rejected_reason, created_by, created_at, approved_by, approved_at, note, updated_at`
- No `factory_name`. Source location = `warehouses` via `warehouse_id`.

**`purchase_order_lines`** — `purchase_order_line_id, purchase_order_id, sku, factory_item_no, ordered_qty, completed_qty, shipped_qty, remaining_qty, carton_qty, units_per_carton, unit_cost, currency, expected_completion_date, actual_completion_date, line_status, note, created_at, updated_at`

**`production_schedule`** — `production_schedule_id, purchase_order_id, purchase_order_line_id, warehouse_id, sku, scheduled_month, scheduled_start_date, scheduled_completion_date, actual_completion_date, planned_qty, completed_qty, remaining_qty, status, created_at, updated_at`
- No `factory_name`. Use `warehouse_id` → `warehouses`.
- **Upstream production-readiness data.** Shipment Center MVP must **not** depend on it for shipment execution; shipment allocation primarily uses `purchase_order_lines.remaining_qty` / `completed_qty`. `production_schedule` may later estimate future available stock / expected completion.

**`shipments`** — `shipment_id, shipment_no, shipping_plan_id, reference_id, warehouse_id, warehouse_code, country, marketplace, ship_from, destination, carrier_id, rate_card_id, shipping_method, status, sales_order_id, tracking_number, container_no, bl_no, invoice_no, etd, eta, actual_departure_date, actual_arrival_date, customs_clearance_date, delivered_date, total_qty, total_cartons, total_cbm, total_gross_weight, total_net_weight, freight_cost_actual, duty_actual, currency, created_by, created_at, updated_at`

**`shipment_lines`** — `shipment_line_id, shipment_id, sku, qty, factory_stock_allocation_qty, carton_qty, carton_no_start, carton_no_end, units_per_carton, cbm, gross_weight, net_weight, purchase_order_line_id, note, created_at, updated_at`
- `qty` = **final shipment quantity** and the source for on-the-way / arrival quantity.
- `factory_stock_allocation_qty` = factory stock reserved/allocated for this line; usually equals `qty`, but may differ during partial preparation.

**`shipment_line_allocations`** *(planned new table)* — `shipment_line_allocation_id, shipment_line_id, purchase_order_line_id, sku, allocated_qty, allocation_method, created_by, created_at, note`
- **The real allocation source** between `shipment_lines` and `purchase_order_lines`. Supports: one shipment line from multiple PO lines; one PO line across multiple shipment lines; FIFO default; future manual override.
- `shipment_lines.purchase_order_line_id` may hold the **primary/first** PO line for backward compatibility only. **Do not expose `purchase_order_line_id` to users.**

**`factory_stock_allocation_plans`** *(planned future planning-layer table)* — `allocation_plan_id, plan_month, source_factory_warehouse_id, company, country, marketplace, warehouse_id, warehouse_code, sku, forecast_qty, forecast_share, allocated_factory_stock_qty, calculation_method, status, created_by, created_at, updated_by, updated_at, note`
- Planning snapshot only (see §9). Does **not** deduct `factory_stock`, transfer ownership, or create SO/PO/intercompany transactions.

---

## 1. Purpose

The **Shipment Center** is the **formal shipment execution layer** that begins **after the Weekly Shipping Plan is approved**. The Weekly Shipping Plan is planning/approval (quantities, allocation preview); the Shipment Center turns an approved plan into **real logistics execution records** (`shipments` + `shipment_lines`) and manages their lifecycle: draft → planned → ready_to_ship → in_transit → received/completed.

It is the bridge between *what we decided to ship* (plan) and *what is actually shipped, tracked, and received* (execution snapshot). `shipments` / `shipment_lines` become the authoritative source for documents, on-the-way visibility, and shipment history.

---

## 2. Naming

Rename the current **Shipping Plan** area into **Shipping Center**, with two sub-sections; keep **Shipment Overview** as a separate tracking/history/search page:

```
Shipping Center
 ├─ Weekly Shipping Plan      (planning + approval; existing behavior)
 └─ Shipment Draft            (formal data completion for approved plans)

Shipment Overview             (tracking / history / search — standalone)
```

- **Weekly Shipping Plan** — unchanged role: draft plan, adjust, submit, approve/reject. On approval it spawns shipment drafts.
- **Shipment Draft** — completes formal shipment data and advances status up to `ready_to_ship`.
- **Shipment Overview** — read/search/tracking view across all shipments (active, completed, stuck, cancelled).

### 2.1 Formal Shipment positioning

**Formal Shipment is NOT a separate / duplicate table.** It is the **execution layer**, represented by the existing + planned shipment data:
- `shipments`
- `shipment_lines`
- `shipment_line_allocations`
- `factory_stock_movements`
- *future* `shipment_events` / `shipment_routes`
- *future* document-generation data

The three views are lenses over this same execution data — they do **not** own parallel databases:
- **Shipment Draft** = the editable preparation view.
- **Shipment Overview** = the read / search / tracking / history view.
- **Future On The Way / world map** must read from the **same shipment data source**, not create a parallel DB.

---

## 3. Core Flow

```
Weekly Shipping Plan Approved
        ↓
Create shipments + shipment_lines           (shipments.status = draft)
        ↓
Reserve factory stock
   factory_stock.reserved_stock  ↑ (increases)
   factory_stock.current_stock   = unchanged (NOT decreased yet)
        ↓
Shipment Draft page fills formal shipment data (carrier, ETD/ETA, cartons, …)
        ↓
Save edited draft            → status = planned
        ↓
Confirm / Ready to Ship      → status = ready_to_ship
   FIFO PO allocation finalized (§6)
   factory_stock.current_stock  ↓ (decreases)
   factory_stock.reserved_stock ↓ (decreases)
        ↓
ETD or actual_departure_date reached   → status = in_transit
        ↓
Arrival / receiving process            → partial_received  or  completed
        ↓
Completed shipments remain searchable in Shipment Overview
```

**Cancelled shipments:**
- **Must release `reserved_stock`** if a reservation exists.
- **Must NOT deduct `current_stock`.**
- **Must NOT count as on-the-way.**

Status transitions are explicit user actions in MVP (no auto-scheduler yet — see Open Items).

### Status enum
`draft, planned, ready_to_ship, in_transit, partial_received, completed, cancelled, stuck`

### Page filter grouping
| Group | Statuses |
|-------|----------|
| All | (all) |
| Active | `planned` + `ready_to_ship` + `in_transit` + `partial_received` |
| Completed | `completed` |
| Stuck | `stuck` |
| Cancelled | `cancelled` |

> **Status ≠ shipping_method.** `status` is lifecycle state (above). `shipping_method` is transport mode: Air / Sea / AGL / Truck / etc.

---

## 4. Shipment Draft Page Spec

**Role:** complete formal shipment data for shipments spawned from an approved plan, and advance them to `ready_to_ship`.

**UI:**
- Same **card / expand** style as Shipment Overview.
- **Country filter** at the top right (MVP).
- **Status group sections** (pre-shipment states editable here): Draft · Planned · Ready to Ship.

**Actions per card:** Edit · Save · Cancel · Confirm Shipment / Ready to Ship.

**Required fields before `ready_to_ship`:**
`shipment_no` or `shipment_id`, `reference_id`, `warehouse_id`, `warehouse_code`, `carrier_id`, `shipping_method`, `etd`, `eta`, `carton_no_start`, `carton_no_end`, `qty`, `carton_qty`, `units_per_carton`.

**Optional / later fields:**
`tracking_number`, `container_no`, `bl_no`, `invoice_no`, `actual_departure_date`, `actual_arrival_date`, `customs_clearance_date`, `delivered_date`, `freight_cost_actual`, `duty_actual`.

**Transitions from this page:**
- Save edited draft → `planned`.
- Confirm / Ready to Ship → `ready_to_ship` (triggers FIFO PO allocation §6 and factory stock deduction §8).

---

## 5. Shipment Overview Page Spec

**Role:** tracking / history / search across all shipments. Read-only.

**Filters:** Date · Country · Marketplace · Carrier · Shipping Method · Status · SKU · **Search** button.
- **Date** uses the **same standard date range picker** as Forecast Review / Overseas Stock Movement Log (preset list + start/end inputs + dual calendar + Apply/Cancel).
- **Search-gated:** no rows before Search; render only after Search; **no fake data in Demo OFF** (empty DB → empty/instruction state).

**Card — Layer 1 (collapsed):**
- Left: Shipment ID / Shipment No
- Right: Country · Marketplace · Destination · ETA · Cost · Status · Expand/Collapse

**Expanded section header:**
- Left: SKU Details
- Right: Shipping Plan ID · Reference ID · Container No · BL No · Invoice No

**Left detail table (per shipment line):**
`SKU · Qty · Carton Qty · Carton No. Start · Carton No. End · CBM · Gross Weight · Net Weight · PO No`

> **PO No** join (single, backward-compatible): `shipment_lines.purchase_order_line_id → purchase_order_lines → purchase_orders.po_no`.
> **PO No** join (multi, preferred when `shipment_line_allocations` exists): `shipment_lines.shipment_line_id → shipment_line_allocations → purchase_order_lines → purchase_orders.po_no` — a shipment line may show **multiple PO Nos**.
> **Do not expose `purchase_order_line_id` to users.**

**Right details:**
`Carrier · Shipping Method · Departure Date · Arrival Date · Tracking Number · Delivered Date · Freight Cost Actual · Duty Actual`

---

## 6. FIFO PO Allocation Design

**When:** runs by default at **Confirm Shipment / Ready to Ship**.

**Eligibility (v2.1 — do NOT rely on `remaining_qty` alone):** a PO line is eligible for FIFO allocation only when:
- it is the **same SKU**, and
- the **PO line is eligible for shipment** (line/PO status allows shipping), and
- **`available_to_ship > 0`**.

```
available_to_ship = completed_qty − shipped_qty          (only produced-but-not-yet-shipped units)
allocate_qty      = min(remaining shipment line qty, available_to_ship)
```

> Only **completed (produced)** units may be shipped. `remaining_qty` may still be updated and used for reporting / backward compatibility, but allocation **must not ship more than `completed_qty − shipped_qty`**, even if `remaining_qty` is larger.

**Logic:**
- Compute `available_to_ship = completed_qty − shipped_qty` per candidate PO line.
- Allocate the **oldest eligible PO lines first** (FIFO), each up to `min(remaining shipment line qty, available_to_ship)`.
- Create `shipment_line_allocations` records (one per PO line consumed).
- Update `purchase_order_lines.shipped_qty` (+) and `remaining_qty` (−) for each consumed PO line.
- `shipment_lines.purchase_order_line_id` may store the primary/first PO line for backward compatibility, but **`shipment_line_allocations` is the real allocation source**. `allocation_method` = `fifo` default; reserved for future `manual` override.
- If total `available_to_ship` across eligible PO lines is **less than** the shipment line qty, the shipment line is **under-allocated** (partial preparation) — flag for review; do not fabricate allocation from uncompleted quantity.

**FIFO example (fully completed lines):**
```
Shipment line SKU C01100-R qty 7000
PO line A available_to_ship 5000   (older)   [completed 5000, shipped 0]
PO line B available_to_ship 3000             [completed 3000, shipped 0]
→ Allocation:
   A → 5000
   B → 2000

Result — shipment_line_allocations (2 rows):
   { shipment_line_id = current, purchase_order_line_id = A, allocated_qty = 5000 }
   { shipment_line_id = current, purchase_order_line_id = B, allocated_qty = 2000 }
purchase_order_lines update:
   A: shipped_qty +5000, remaining_qty 5000 → 0
   B: shipped_qty +2000, remaining_qty 3000 → 1000
```

**Eligibility example (uncompleted PO — must NOT over-allocate):**
```
PO line:  ordered_qty 10000 | completed_qty 5000 | shipped_qty 0 | remaining_qty 10000
available_to_ship = 5000 − 0 = 5000
→ System may allocate at most 5000 from this line, NOT 10000,
  even though remaining_qty = 10000.
```

---

## 7. Factory Stock Reservation Design

**On Weekly Shipping Plan approval** (shipments + shipment_lines created as `draft`):
- **Do NOT deduct `factory_stock.current_stock`.**
- Reserve by **increasing `factory_stock.reserved_stock`**.
- Available stock = `current_stock − reserved_stock` (computed).
- Write `factory_stock_movements` with:
  - `movement_type = stock_reserved`
  - `related_entity_type = shipment_line`, `related_entity_id = shipment_line_id`
  - `before_current_stock` / `after_current_stock` **unchanged**
  - `before_reserved_stock` / `after_reserved_stock` record the reservation change.

**On cancellation before shipping:**
- Release by **decreasing `factory_stock.reserved_stock`**.
- **Do NOT change `current_stock`.**
- Write `movement_type = stock_reservation_released`, `related_entity_type = shipment_line`, `related_entity_id = shipment_line_id`.

---

## 8. Factory Stock Deduction Design

**When shipment is confirmed / `ready_to_ship`:**
- `factory_stock.current_stock` decreases by `shipment_lines.factory_stock_allocation_qty`, or by `qty` if allocation qty is blank.
- `factory_stock.reserved_stock` decreases by the same reserved amount.
- Write `factory_stock_movements` with:
  - `movement_type = stock_shipped`
  - `related_entity_type = shipment_line`, `related_entity_id = shipment_line_id`
  - `before_current_stock` / `after_current_stock` recorded
  - `before_reserved_stock` / `after_reserved_stock` recorded.

> Spec only — not implemented here.

---

## 9. Factory Stock Allocation Planning Design

`factory_stock_allocation_plans` is a **future planning-layer** table.

**Purpose:**
- Calculate how factory stock can be **virtually allocated** across company / country / marketplace / warehouse / SKU.
- Support Inventory Replenishment and Request Order projection.
- Support forecast shortage review.
- Support future approval / audit of allocation results.

**Important — this table does NOT:**
- deduct `factory_stock`;
- transfer ownership;
- create intercompany SO / PO;
- replace shipment records.
It is a **planning snapshot only**.

**Future versioning (recommended, NOT yet implemented):** add the following planned fields so multiple calculation runs can coexist for the same `plan_month`:
- `allocation_version`
- `plan_run_id`

Purpose:
- preserve multiple calculation runs for the same month;
- compare an old forecast allocation vs a new forecast allocation;
- support approval / audit trail;
- avoid overwriting previous allocation results.

> These are a **future design recommendation only** — do **not** treat them as implemented unless the current schema already contains them.

**Example:**
```
Factory stock for SKU C01100-R at ResTW factory warehouse = 10,000
Forecast demand:  KM US = 5,000 | ResUS US = 3,000 | ResTW CA = 2,000
Allocation plan:  KM US → 5,000 | ResUS US → 3,000 | ResTW CA → 2,000
```
This only means these quantities are **planned as usable supply** for site-level replenishment calculation. Actual stock movement still requires shipment execution.

**Ownership note:** Factory Stock is **physical inventory, not company inventory**. ResTW is the procurement / supply-chain hub. KM / ResUS / ResTW may be final sales or operating entities. Factory stock may be *planned* for KM / ResUS / ResTW site needs, but ownership flow and intercompany transactions are **out of MVP scope**.

---

## 10. On-the-Way Relationship

Shipment Overview and the future On The Way view read from `shipments` + `shipment_lines` (+ `shipment_events` if added later).

- Only statuses **`ready_to_ship` / `in_transit` / `partial_received`** are active shipment candidates (may count as on-the-way).
- **`completed` and `cancelled` must NOT count as on-the-way.**
- On-the-way quantity source = `shipment_lines.qty`.

---

## 11. Warehouse Relationship

- `shipments.warehouse_id` = **destination logical warehouse** = system warehouse master id, e.g. `WH-RESUS-US-FBA-AMAZON`.
- `shipments.warehouse_code` = **external / receiving code** (FC / receiving), e.g. `ONT8`, `LGB8`.
- **Do not confuse the two.** Factory/source warehouse and all factory metadata come from `warehouse_id` → `warehouses` relationships, **not** `factory_name`.

---

## 12. Carton Number Policy

- **MVP:** `carton_no_start` / `carton_no_end` are **manual** required fields (entered on Shipment Draft before Ready to Ship).
- **Do not automate** Amazon carton numbering yet.
- Future automation may be added after Amazon / carrier template logic is confirmed.

---

## 13. Non-Goals

Do **not** implement (now): code · Apps Script · API · UI · DB migration · `shipment_events` · `shipment_routes` · automatic email · document generation · carton auto-numbering · BigQuery · permission system · AI · Sales Order · intercompany transaction · full ERP accounting.

---

## 14. Open Items

- Final **carton numbering** logic.
- **Amazon shipment box label** rules.
- **`shipment_events` / `shipment_routes`** detail.
- **`sales_order` linkage** (`shipments.sales_order_id`).
- **Document template** requirements.
- **Manual PO allocation override** (beyond FIFO).
- **Automatic status transition scheduler** (e.g., ETD reached → in_transit).
- **Receiving process design** (partial_received → completed; quantity reconciliation).
- **Status granularity:** clarify whether future statuses need **delivered / received / completed** separation. Amazon / 3PL receiving may require distinguishing **arrival, delivered, receiving, partial_received, and completed**. *(The current MVP status enum is unchanged — see §3: `draft, planned, ready_to_ship, in_transit, partial_received, completed, cancelled, stuck`.)*
- **`factory_stock_allocation_plans` approval workflow.**
- **Exact allocation calculation method** by forecast / company / marketplace / warehouse.
- **Intercompany ownership / SO / accounting flow** (future only).

---

**Draft v2.1 — Spec only. No code, DB, or implementation changes are implied by this document.**

**End of Document**
