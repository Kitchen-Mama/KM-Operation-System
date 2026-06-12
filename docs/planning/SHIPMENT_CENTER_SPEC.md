# Shipment Center / Shipment Draft / Shipment Overview — Specification

**Status:** 🟡 Draft v1 — Architecture / Spec only (NO code, NO DB, NO implementation)
**Last Updated:** 2026-06-12
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md), `assets/specs/active/SYSTEM_ROADMAP.md`

> **Spec only.** This document defines architecture, flow, UI, and data relationships for the Shipment layer. It does **not** introduce code, Apps Script, API, UI, or DB schema changes. New tables/fields described here are *planned* design, not implemented.

---

## 0. Schema Baseline (current, after recent DB redesign)

These reflect the **current** Google Sheet schema and supersede older docs. **Factory / source location and company come from `warehouses` via `warehouse_id`** — the inventory/PO/production tables no longer store `factory_name` or `company`.

**`factory_stock`** — `factory_stock_id, warehouse_id, sku, current_stock, created_at, updated_at, last_transaction_at`
- No `company`, no `factory_name`. Company = `warehouses.company`; Factory name = `warehouses.warehouse_name` (join by `warehouse_id`).

**`factory_stock_movements`** — `factory_stock_movement_id, movement_date, sku, warehouse_id, movement_type, qty, related_entity_type, related_entity_id, before_qty, after_qty, note, created_by, created_at`
- Uses `warehouse_id` (no `factory_name`). Quantity column is `qty` (not `quantity`); before/after are `before_qty` / `after_qty`; references are `related_entity_type` / `related_entity_id`.

**`purchase_orders`** — `purchase_order_id, po_no, km_po_no, warehouse_id, supplier_name, order_status, order_date, expected_completion_date, expected_ship_date, submitted_by, submitted_at, rejected_by, rejected_at, rejected_reason, created_by, created_at, approved_by, approved_at, note, updated_at`
- No `factory_name`. Source location = `warehouses` via `warehouse_id`.

**`purchase_order_lines`** — `purchase_order_line_id, purchase_order_id, sku, factory_item_no, ordered_qty, completed_qty, shipped_qty, remaining_qty, carton_qty, units_per_carton, unit_cost, currency, expected_completion_date, actual_completion_date, line_status, note, created_at, updated_at`

**`production_schedule`** — `production_schedule_id, purchase_order_id, purchase_order_line_id, warehouse_id, sku, scheduled_month, scheduled_start_date, scheduled_completion_date, actual_completion_date, planned_qty, completed_qty, remaining_qty, status, created_at, updated_at`
- No `factory_name`. Use `warehouse_id` → `warehouses`.

**`shipments`** — `shipment_id, shipment_no, shipping_plan_id, reference_id, warehouse_id, warehouse_code, country, marketplace, ship_from, destination, carrier_id, rate_card_id, shipping_method, status, sales_order_id, tracking_number, container_no, bl_no, invoice_no, etd, eta, actual_departure_date, actual_arrival_date, customs_clearance_date, delivered_date, total_qty, total_cartons, total_cbm, total_gross_weight, total_net_weight, freight_cost_actual, duty_actual, currency, created_by, created_at, updated_at`

**`shipment_lines`** — `shipment_line_id, shipment_id, sku, qty, factory_stock_allocation_qty, carton_qty, carton_no_start, carton_no_end, units_per_carton, cbm, gross_weight, net_weight, purchase_order_line_id, note, created_at, updated_at`
- `qty` = **final shipment quantity** and the source for on-the-way / arrival quantity.
- `factory_stock_allocation_qty` = factory stock reserved/allocated for this line; usually equals `qty`, but may differ during partial preparation.

**`shipment_line_allocations`** *(planned new table)* — `shipment_line_allocation_id, shipment_line_id, purchase_order_line_id, sku, allocated_qty, allocation_method, created_by, created_at, note`
- Tracks FIFO allocation between `shipment_lines` and `purchase_order_lines`. Supports: one shipment line from multiple PO lines; one PO line across multiple shipment lines; FIFO default; future manual override.

---

## 1. Purpose

The **Shipment Center** is the **formal shipment execution layer** that begins **after the Weekly Shipping Plan is approved**. Where the Weekly Shipping Plan is planning/approval (quantities, allocation preview), the Shipment Center turns an approved plan into **real logistics execution records** (`shipments` + `shipment_lines`) and manages them through their lifecycle: draft → planned → ready_to_ship → in_transit → received/completed.

It is the bridge between *what we decided to ship* (plan) and *what is actually shipped, tracked, and received* (execution snapshot). `shipments` / `shipment_lines` become the authoritative source for documents, on-the-way visibility, and shipment history.

---

## 2. Naming

Rename the current **Shipping Plan** area into **Shipping Center**, with two sub-sections, and keep **Shipment Overview** as the separate tracking/history/search page:

```
Shipping Center
 ├─ Weekly Shipping Plan      (planning + approval; existing behavior)
 └─ Shipment Draft            (formal data completion for approved plans)

Shipment Overview             (tracking / history / search — standalone)
```

- **Weekly Shipping Plan** — unchanged role: draft plan, adjust, submit, approve/reject. On approval it spawns shipment drafts.
- **Shipment Draft** — completes formal shipment data and advances status up to `ready_to_ship`.
- **Shipment Overview** — read/search/tracking view across all shipments (active, completed, stuck, cancelled).

---

## 3. Core Flow

```
Weekly Shipping Plan Approved
        ↓
Create shipments + shipment_lines      (shipments.status = draft)
        ↓
Shipment Draft page — complete formal data (carrier, ETD/ETA, cartons, etc.)
        ↓
Save edited draft            → status = planned
        ↓
Confirm / Ready to Ship      → status = ready_to_ship
   (FIFO PO allocation + factory stock deduction happen here — see §6, §7)
        ↓
ETD or actual_departure_date reached   → status = in_transit
        ↓
Arrival / receiving process            → partial_received  or  completed
        ↓
Completed shipments remain searchable in Shipment Overview
```

**Rules:**
- A shipment is created in `draft` directly from an approved Weekly Shipping Plan (header + lines copied as a snapshot).
- **Cancelled shipments must NOT deduct stock and must NOT count as on-the-way.**
- Status transitions are explicit user actions in MVP (no auto-scheduler yet — see Open Items).

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

> **Status ≠ shipping_method.** `status` is lifecycle state (above). `shipping_method` is the transport mode: Air / Sea / AGL / Truck / etc.

---

## 4. Shipment Draft Page Spec

**Role:** complete the formal shipment data for shipments that came from an approved plan, and advance them to `ready_to_ship`.

**UI:**
- Same **card / expand** style as Shipment Overview (consistent visual language).
- **Country filter** at the top right (MVP scope).
- **Status group sections** (only the pre-shipment states are editable here):
  - Draft
  - Planned
  - Ready to Ship

**Actions per card:** Edit · Save · Cancel · Confirm Shipment / Ready to Ship.

**Required fields before `ready_to_ship`:**
`shipment_no` or `shipment_id`, `reference_id`, `warehouse_id`, `warehouse_code`, `carrier_id`, `shipping_method`, `etd`, `eta`, `carton_no_start`, `carton_no_end`, `qty`, `carton_qty`, `units_per_carton`.

**Optional / later fields (may be filled during/after transit):**
`tracking_number`, `container_no`, `bl_no`, `invoice_no`, `actual_departure_date`, `actual_arrival_date`, `customs_clearance_date`, `delivered_date`, `freight_cost_actual`, `duty_actual`.

**Transitions from this page:**
- Save edited draft → `planned`.
- Confirm / Ready to Ship → `ready_to_ship` (triggers FIFO PO allocation §6 and factory stock deduction §7).

---

## 5. Shipment Overview Page Spec

**Role:** tracking / history / search across all shipments. Read-only.

**Filters:** Date · Country · Marketplace · Carrier · Shipping Method · Status · SKU · **Search** button.
- **Date** uses the **same standard date range picker** as Forecast Review / Overseas Stock Movement Log (preset list + start/end inputs + dual calendar + Apply/Cancel).
- **Search-gated:** no rows before Search; render only after Search is clicked; **no fake data in Demo OFF** (empty DB → empty/instruction state).

**Card layout — Layer 1 (collapsed):**
- Left: Shipment ID / Shipment No
- Right: Country · Marketplace · Destination · ETA · Cost · Status · Expand/Collapse

**Expanded section header:**
- Left: SKU Details
- Right: Shipping Plan ID · Reference ID · Container No · BL No · Invoice No

**Left detail table (per shipment line):**
`SKU · Qty · Carton Qty · Carton No. Start · Carton No. End · CBM · Gross Weight · Net Weight · PO No`

> **PO No** is displayed by joining `shipment_lines.purchase_order_line_id → purchase_order_lines → purchase_orders.po_no`. **Do not expose `purchase_order_line_id` to users.** (When a line is split across multiple PO lines per §6, the displayed PO No should reflect the allocation set; primary PO line for MVP display, full set from `shipment_line_allocations`.)

**Right details:**
`Carrier · Shipping Method · Departure Date · Arrival Date · Tracking Number · Delivered Date · Freight Cost Actual · Duty Actual`

---

## 6. FIFO PO Allocation Design

**When:** runs by default at **Confirm Shipment / Ready to Ship**.

**Logic:**
- Use `purchase_order_lines.remaining_qty`.
- Allocate the **oldest eligible PO lines first** (FIFO; eligibility = same SKU, remaining_qty > 0).
- Create `shipment_line_allocations` records (one per PO line consumed).
- Update `purchase_order_lines.shipped_qty` (+) and `remaining_qty` (−) for each consumed PO line.
- `shipment_lines.purchase_order_line_id` may store the **primary / first** PO line for backward compatibility, but **`shipment_line_allocations` is the real allocation source**.
- `allocation_method` = `fifo` by default; reserved for future `manual` override.

**FIFO example:**
```
Shipment line SKU C01100-R qty 7000
PO line A remaining 5000   (older)
PO line B remaining 3000
→ Allocation:
   A → 5000   (A.remaining 5000 → 0)
   B → 2000   (B.remaining 3000 → 1000)
shipment_line_allocations: 2 rows (A 5000, B 2000)
```

---

## 7. Factory Stock Deduction Design

**When:** at shipment confirmation (Ready to Ship).

- `factory_stock.current_stock` decreases by `shipment_lines.factory_stock_allocation_qty`, or by `qty` if `factory_stock_allocation_qty` is blank.
- Write a `factory_stock_movements` row (outbound / `shipment_allocated` type):
  - `related_entity_type = shipment_line`
  - `related_entity_id = shipment_line_id`
  - `before_qty` / `after_qty` recorded; `qty` = deducted amount; `warehouse_id` from the factory stock row.
- **Cancelled shipments do not deduct stock** (and a cancellation after deduction must reverse via a compensating movement — design TBD).

> Spec only — not implemented here.

---

## 8. On-the-Way Relationship

Shipment Overview and the future On The Way view read from `shipments` + `shipment_lines` (+ `shipment_events` if added later).

- Only statuses **`ready_to_ship` / `in_transit` / `partial_received`** are **active shipment candidates** (i.e., may count as on-the-way).
- **`completed` and `cancelled` must NOT count as on-the-way.**
- On-the-way quantity source = `shipment_lines.qty`.

---

## 9. Warehouse Relationship

- `shipments.warehouse_id` = **destination logical warehouse** = system warehouse master id, e.g. `WH-RESUS-US-FBA-AMAZON`.
- `shipments.warehouse_code` = **external / receiving code** (FC / receiving), e.g. `ONT8`, `LGB8`.
- **Do not confuse the two.** `warehouse_id` joins the `warehouses` master; `warehouse_code` is an external label carried on the shipment for receiving/labeling.
- Factory/source company and name everywhere (factory_stock, movements, PO, production) come from `warehouses` via `warehouse_id` (company = `warehouses.company`, factory name = `warehouses.warehouse_name`).

---

## 10. Carton Number Policy

- **MVP:** `carton_no_start` / `carton_no_end` are **manual** required fields (entered on the Shipment Draft page before Ready to Ship).
- **Do not automate** Amazon carton numbering yet.
- Future automation may be added after Amazon / carrier template logic is confirmed.

---

## 11. Non-Goals

Do **not** implement (now): code · Apps Script · API · UI · `shipment_events` · `shipment_routes` · automatic email · document generation · carton auto-numbering · BigQuery · permission system · AI.

---

## 12. Open Items

- Final **carton numbering** logic.
- **Amazon shipment box label** rules.
- **`shipment_events` / `shipment_routes`** detail design.
- **`sales_order` linkage** (`shipments.sales_order_id`).
- **Document template** requirements (出貨明細 / Packing List / 托單 / Invoice).
- **Manual PO allocation override** (beyond FIFO).
- **Automatic status transition scheduler** (e.g., ETD reached → in_transit).
- **Receiving process design** (partial_received → completed; quantity reconciliation).
- Cancellation **stock-reversal** rules after deduction.

---

**Draft v1 — Spec only. No code, DB, or implementation changes are implied by this document.**

**End of Document**
