# Shipment Center / Shipment Draft / Shipment Overview — Specification

**Status:** 🟡 Draft v2.3 — Architecture / Spec only (NO code, NO DB, NO implementation)
**Last Updated:** 2026-06-17
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
>
> **Changelog v2.1 → v2.2:**
> - Added the complete **Formal Shipment end-to-end execution flow** (§15) — stock/order/rate confirmation → Weekly Shipping Plan → Manager + COO approval → Shipment Draft → Confirm & Ship → document generation → manual carrier/factory email → in-transit → receiving → completion → Overview/History.
> - **Clarified factory-stock reservation & deduction timing** unambiguously (§15.1): plan creation/submission never deducts `current_stock`; reservation increases on approval/shipment creation; **Confirm & Ship is the physical deduction trigger**; cancellation releases reservation only.
> - Reconfirmed **Shipment Draft = `shipments.status = draft`** (no `shipment_drafts` table) as a dedicated role subsection (§15.2).
> - Added **Shipment Document Generation** (§16): `document_templates` / `generated_documents` as the MVP document DB, document-type catalog, and shipment-focused document set.
> - Added field lists for **Shipment Detail Sheet**, **Carrier Booking Form / 托單**, **Commercial Invoice**, **Packing List**, and **Amazon AGL Combined Invoice + Packing** (§16.1–§16.3).
> - Clarified **MVP manual email flow** to carrier/factory (download → attach labels → email; future API).
> - Clarified **receiving / completion inventory impact**, including the **Amazon API / live-inventory exception** (§17).
> - Clarified the **future `shipment_events` / `shipment_routes`** role as enrichment only — Overview / On The Way / World Map still read `shipments` + `shipment_lines` (§18).
>
> **Changelog v2.2 → v2.3:**
> - Added **Shipment Planning Inputs** section (§19) + module-boundary rule: Shipment Center **does not calculate replenishment quantity**; it **executes** approved/planned shipping needs and must not create a parallel replenishment engine.
> - Added **Inventory Replenishment factory-stock allocation display rules** (§19.1) — allocated factory stock shown per site is **planning metadata only** (no `current_stock` deduction, no ownership transfer, no intercompany transaction; aligns with future `factory_stock_allocation_plans`).
> - Added **Shipment Plan Quantity Limit** rule (§19.2): a site's planned shipment qty cannot exceed its allocated available factory stock unless explicit borrowing/reallocation is allowed.
> - Added **future Cross-site / Cross-company Borrowing** planning exception (§19.3) — planning only, never ownership/accounting.
> - Added the **Shipment Document Dataset** concept (§20): one shared dataset → many rendered templates → `generated_documents`; template controls layout, dataset controls values.
>
> **Changelog v2.3 → v2.4 (2026-07-01) — Shipment Draft refinement (implemented):**
> - **external_shipment_id default reformatted** to **`COMPANY-MKT-YYMMDD-##`** (marketplace short codes; 2-digit daily serial; e.g. `RESUS-AMZ-260701-01`) and shown as the **first Shipment Draft card-header field** (fallback `shipment_no` → internal `shipment_id`); §2.
> - **`shipment_lines.cbm` renamed to `carton_cbm`** (single-carton CBM = the only stored CBM column). Line/header total CBM is **runtime** = `Σ(carton_cbm × carton_qty)`; SKU Lines show **Carton CBM only** (no CBM column), totals row shows **Total Carton CBM**; §2, §15.3.
> - **Carton No. validation** (§12): integers, `start ≤ end`, non-overlapping within a shipment; blocks Save / Ready to Ship / Ship (frontend + `updateShipment`).
> - **§5B Required fields before Ship** changed to: `external_shipment_id`, Carton No. Start/End (all lines), `reference_id`, `warehouse_code`, `etd`, `eta` (tracking/booking no longer required).
> - **Remark maps to `shipments.note`** (§4).
> - **§12A Return to Draft** revision rule (future) + reserved **← Return to Draft** button on Ready to Ship (reason appended to `note`; no permissions yet); future `shipment_revision_log` table documented (not created).
> - Implemented in `12_shipment_handlers.gs`, `11_shipping_plan_handlers.gs`, `operation-system-db-api.js`, `shipping-history.js`.

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

**`shipments`** — `shipment_id, shipment_no, external_shipment_id, shipping_plan_id, reference_id, warehouse_id, warehouse_code, company, country, marketplace, ship_from, destination, carrier_id, rate_card_id, shipping_method, status, sales_order_id, booking_no, tracking_number, container_no, bl_no, invoice_no, etd, eta, actual_departure_date, actual_arrival_date, customs_clearance_date, delivered_date, total_qty, total_cartons, total_cbm, total_gross_weight, total_net_weight, freight_cost_actual, duty_actual, currency, shipped_at, shipped_by, hidden_from_draft_at, hidden_from_draft_by, note, created_by, created_at, updated_by, updated_at`
- **`shipment_id` = internal DB primary key** (e.g. `SH-2A9E06E1-A`) — **system-generated, never user-editable**. `shipment_lines.shipment_id` is the FK to it and is never changed by the UI.
- **`external_shipment_id` = the user-facing / carrier shipment number** — **editable** (≠ internal `shipment_id` PK, which is never editable). Auto-generated at Execution Commit as **`COMPANY-MKT-YYMMDD-##`** where:
  - **COMPANY** = `company` uppercased with non-alphanumerics removed (e.g. `Res US` → `RESUS`, `KM`, `RESTW`);
  - **MKT** = marketplace short code — `Amazon`→`AMZ`, `Walmart`→`WMT`, `Shopify`→`SHP`, `eBay`→`EBY`, `Target`→`TGT`, `Wayfair`→`WYF`; otherwise the first 3 characters uppercased;
  - **YYMMDD** = commit date; **##** = 2-digit serial per company+marketplace(+country) that day.
  - Examples: `RESUS-AMZ-260701-01`, `KM-AMZ-260701-02`, `RESTW-AMZ-260701-01`.
  - The user may override it (e.g. an Amazon-platform Shipment ID); Save writes `shipments.external_shipment_id`. It is shown as the **first field of the Shipment Draft card header** (fallback: `shipment_no` → internal `shipment_id`) and refreshes there after Save.
- **`carrier_id` is read-only in the Shipment Draft UI** — the carrier is chosen on the Weekly Shipping Plan. Displayed for reference (`--` when none).
- **`warehouse_id` future mapping:** after Shipment Draft creation, `warehouse_id` should be **auto-derived from `destination`** (`destination → warehouses / shipping_route_rules → warehouse_id → warehouse_code`, see `CARRIER_AND_ROUTE_SPEC.md`). While `destination` is not yet finalized, `warehouse_id` may stay blank; this mapping is **not implemented in this phase**.
- **`shipped_at` / `shipped_by`** — stamped when the shipment is **Shipped** (status → `shipped`) from the Shipment Draft **Ready to Ship** section (§4). `shipped_by` is a placeholder actor (`system_user`; future Role & Permission).
- **`hidden_from_draft_at` / `hidden_from_draft_by`** — the **Done** marker: the Shipped card is **hidden from the Shipment Draft workspace** (still fully visible in Shipment Overview; the row is **never deleted** and status is unchanged). Minimal-change design (not `completed_*`) because the shipment lifecycle continues in Overview after Done.
- **`company`** = **copied from `shipping_plans.company` at Execution Commit** (when the Shipment Draft is created). It is a **persisted execution snapshot of company ownership** — the Shipment must **NOT** live-join `marketplaces` to recover company for historical records. Company lives on the **header only**; `shipment_lines` do **not** carry company (they inherit it via `shipment_id`).
- **`booking_no` / `note` / `updated_by`** added for the Execution Layer: `booking_no` = carrier/forwarder booking reference; `note` = shipment remark; `updated_by` = placeholder actor of the last execution edit (Role & Permission integration is future, like the plan-layer actors).
- **`marketplace`** is **copied from `shipping_plans.marketplace` at Execution Commit** (part of the six-key header copy) and is **displayed on the Shipment Overview card header** (Marketplace / Company / Country / Method / Total Pcs / Cartons). It is not live-joined. *(`destination` is intentionally NOT shown on the card yet — destination routing is finalized in `CARRIER_AND_ROUTE_SPEC.md` / future Shipping Allocation.)*
- The header six-key context (`company` / `country` / `marketplace` / `ship_from` / `destination` / `shipping_method`) and `total_qty` / `total_cartons` are **copied from the approved plan at Execution Commit and are NOT recalculated**. Editable execution-layer fields: `carrier_id`, `rate_card_id`, `shipping_method`, `booking_no`, `tracking_number`, `container_no`, `bl_no`, `invoice_no`, `etd`, `eta`, `actual_*_date`, `customs_clearance_date`, `delivered_date`, `total_cbm` / weights, `freight_cost_actual`, `duty_actual`, `currency`, `warehouse_code`, `reference_id`, `note`, and `status`.

**`shipment_lines`** — `shipment_line_id, shipment_id, sku, qty, factory_stock_allocation_qty, carton_qty, carton_no_start, carton_no_end, units_per_carton, carton_cbm, gross_weight, net_weight, purchase_order_line_id, note, created_at, updated_at, snapshot_current_stock, snapshot_avg_sales_per_day, snapshot_days_of_supply, snapshot_suggested_qty, snapshot_target_days, snapshot_fc_context, snapshot_event_context, snapshot_avg_sales_source, snapshot_avg_sales_warning`
- **`carton_cbm` = single-carton CBM (m³)** — copied from `shipping_plan_lines.carton_cbm` at Execution Commit (fallback: computed from `sku_details` carton dims when the plan line has none). **There is no stored line `cbm` column** (the former `shipment_lines.cbm` was renamed to `carton_cbm`). Line/shipment total CBM is **RUNTIME**: line total = `carton_cbm × carton_qty`; header `total_cbm` = `Σ(carton_cbm × carton_qty)`. The SKU Lines table shows **Carton CBM only** (no CBM column); the totals row shows **Total Carton CBM = Σ(carton_cbm × carton_qty)**.
- **`snapshot_*` = the Execution Snapshot** — a **verbatim copy of the line's Decision Snapshot** taken at Execution Commit (ARCHITECTURE §4A). These are **frozen and never recalculated** in the Execution Layer (Current Stock / Avg Sales / Days of Supply / Suggested Qty / Target Days / FC / Event are all copied, not re-derived). `qty` = the plan line's `approved_qty`; `carton_qty` / `units_per_carton` are copied from the plan line.
- `qty` = **final shipment quantity** and the source for on-the-way / arrival quantity.
- `factory_stock_allocation_qty` = factory stock reserved/allocated for this line; usually equals `qty`, but may differ during partial preparation.
- **`carton_no_start` / `carton_no_end` are user-editable (numeric)** on the Shipment Draft SKU Lines (Draft / Ready to Ship); saved via `updateShipment` `{ lines: [{shipment_line_id, carton_no_start, carton_no_end}] }`. All other line fields (qty / carton_qty / logistics / snapshot) are read-only.

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

### Execution Layer Lifecycle (Supply Chain Architecture v1.2)

The Execution Layer (Shipment) owns **Execution Truth** and runs a lifecycle **independent** of the Decision Layer — it must **never modify** the Weekly Shipping Plan / Decision Snapshot (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §10/§12):

```
Draft → Booked → Ready to Ship → Shipped → In Transit → Arrived → Received → Closed
```

- **Execution Commit source = an Approved Weekly Shipping Plan** (Approve → Create Shipment Draft; `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §12). The Shipment Draft is the lifecycle's `Draft` state.
- **Implemented flow (Phase 2):** `draft → ready_to_ship → shipped → in_transit → arrived → received → closed`. The Shipment **Draft workspace** drives `draft → ready_to_ship → shipped`; the **Overview** advances the post-ship lifecycle (`shipped → in_transit → arrived → received → closed`). (`booked` from the architecture lifecycle is not a separate implemented status; `planned` / `delivered` / `completed` are legacy labels retained for display only.) No factory-stock side effects are added by any status advance (deferred).
- **Menu grouping:** the left menu groups **Shipment Center → Weekly Shipping Plan (Decision Layer) / Shipment Draft / Shipment Overview (Execution Layer)**. Grouping them under one menu is a UI convenience — it does **not** merge the layers.
- **Decision Layer Completion (the plan's Done) is independent of the shipment lifecycle** — marking the plan Completed does not change any shipment status, and advancing a shipment does not change the plan.

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

> **Page separation (FINAL) — Shipment Draft and Shipment Overview are TWO independent pages.** They **share** the `shipments` / `shipment_lines` DB and the card render helper, but each is its **own section, filter UI, init, and render** — there is **no shared view-mode flag and no shared filter DOM state** (switching between them cannot pollute the other's filter). Sections: **Shipment Draft → `#shipment-draft-section`** (compact **Country + Status** filter); **Shipment Overview → `#shippinghistory-section`** (full **Date / Country / SKU / Shipping Method / Search** bar). Frontend: `assets/html/pages/shipment-draft.html` + `shipping-history.html`; `assets/js/pages/shipping-history.js` hosts `initShipmentDraftPage` / `renderShipmentDraft` and `initShipmentOverviewPage` / `renderShipmentOverview`. (This supersedes the earlier single-page `mode` toggle.)

> **Phase 2 implementation (current) — Shipment Draft = execution working area.** Menu: **Shipment Center → Weekly Shipping Plan / Shipment Draft / Shipment Overview**. The Shipment Draft page is a **three-section workspace** (only `hidden_from_draft_at IS NULL`):
> - **Draft** (`status = draft`) — freshly created from an Approved Weekly Shipping Plan; execution fields editable; **Save** (saves fields only, does NOT enter Overview) and **Ready to Ship →** (saves + `status = ready_to_ship`).
> - **Ready to Ship** (`status = ready_to_ship`) — still the Draft workspace; final pre-ship check; **Save** and **Ship 🚢** (validates required fields, then `status = shipped`).
> - **Shipped** (`status = shipped`) — officially shipped; fields read-only; **Done** button.
> - **Filter:** a compact top-right **Country + Status** filter (Status = All / Draft / Ready to Ship / Shipped). **No Marketplace, no Date / SKU / Shipping Method / Search** — the full filter bar belongs to Shipment Overview only.
> - **Card header (left):** Shipment No · Status · Plan id. **(right):** **Marketplace · Company · Country · Destination (`--` if blank) · Method · Pcs · ETD · ETA**.
> - **SKU Lines** (clean title, no long caption): SKU · Qty · Cartons · **Carton CBM · Gross Wt · Net Wt · Carton No. Start · Carton No. End** (no standalone CBM column), plus a **totals row** (Total SKU / Qty / Ctn. / **Total Carton CBM = Σ(carton_cbm × carton_qty)** / Gross Wt / Net Wt). **`carton_no_start` / `carton_no_end` are editable numeric inputs** (Draft / Ready to Ship); saved to `shipment_lines`.
> - **Execution Fields (clean 2-column form):** **Shipment ID (external, editable = `external_shipment_id`)**, Carrier (**read-only**), Reference ID, Warehouse Code, Tracking No, Booking No, Container No, BL No, Invoice No, ETD, ETA, **Remark**. The **internal `shipment_id` is shown read-only and never editable**. **Never editable:** the six-key context, `qty` / `carton_qty`, copied logistics + Decision Snapshot. **Remark mapping: the UI "Remark" field maps to `shipments.note`.**
> - **Carton No. validation (§12):** integers only; `start ≤ end`; **ranges must not overlap within the same shipment**. On error the offending inputs get a red border + message, and **Save / Ready to Ship / Ship are blocked** (frontend + server-side in `updateShipment`).
> - **Save vs Ship (FINAL):** **Save** only updates execution fields — no history, no Overview, not a shipment. **Ship** requires status `shipped`, sets **`shipped_at` = now**, **`shipped_by` = `system_user`** placeholder, and only then does the shipment enter **Shipment Overview**.
> - **§5B — Required fields before Ship** (validated on the frontend AND server-side in `updateShipment`): **`external_shipment_id`, Carton No. Start, Carton No. End (every line), `reference_id`, `warehouse_code`, `etd`, `eta`** (and `total_qty > 0`). `tracking_number` / `booking_no` are **not** required at this phase. Missing → error, Ship blocked.
> - **Done (Shipped card):** writes **`hidden_from_draft_at` / `hidden_from_draft_by`** → the card leaves the **Shipment Draft** default view. It stays in **Shipment Overview**; status is unchanged; **no row is deleted**.
> - **Return to Draft (Phase-2 placeholder, no permissions yet):** a **Ready to Ship** card has a **← Return to Draft** button. It prompts for a **required reason** (appended to `shipments.note` history) and sets `status = draft` so core data can be re-edited, then re-submitted. See §12A for the standard revision flow and the future `shipment_revision_log` table.

---

## 5. Shipment Overview Page Spec

**Role:** the **official shipped / history view** — read-only.

> **Phase 2 implementation (current).** Shipment Overview shows **only official records: `shipped` / `in_transit` / `arrived` / `received` / `closed`**. **`draft` / `ready_to_ship` are NOT shown** (they live in the Shipment Draft workspace) — so **Save never puts a shipment into Overview; only Ship does.** The card header shows **Marketplace** (Marketplace / Company / Country / Method / Pcs / Cartons / CBM / Gross / Net / ETD / ETA). **Execution fields are READ-ONLY on Overview.** A per-card "Advance →" button steps the post-ship lifecycle `shipped → in_transit → arrived → received → closed` (no factory-stock side effects). `destination` is not shown yet (routing not finalized). **Overview is a SEPARATE page from Shipment Draft** (see the Page separation note in §4): it uses the **full filter bar (Date / Country / SKU / Shipping Method / Search)** and **never** the Draft page's compact Country + Status filter.

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

- **MVP:** `carton_no_start` / `carton_no_end` are **manual** fields on the Shipment Draft SKU Lines, **required before Ship** (§5B).
- **Validation (enforced frontend + server-side in `updateShipment`):**
  - **integers only** (whole numbers);
  - **`start ≤ end`**;
  - **ranges must not overlap** within the same shipment (e.g. `CO1100-R: 1–3` + `SP5020-R: 4–5` OK; `1–3` + `3–5` **rejected** — `3` repeats).
  - A violation red-borders the offending inputs, shows a message, and **blocks Save / Ready to Ship / Ship**.
- **Do not automate** Amazon carton numbering yet.
- Future automation may be added after Amazon / carrier template logic is confirmed.

---

## 12A. Return to Draft / Revision Rule *(future — Return to Draft button reserved now, no permissions)*

Once a shipment is **Ready to Ship** (or **Shipped**), core data (SKUs, carrier, carton numbers) must **not** be edited freely in place. If an issue is found (SKU shortage, carrier change, carton-number error, etc.) the **standard revision flow** is:

```
Ready to Ship → Return to Draft (enter reason) → [authorized editor] edit → Save → Ready to Ship
```

- **This phase:** a **← Return to Draft** button is reserved on Ready to Ship cards. It prompts for a **required reason** (appended to `shipments.note`) and sets `status = draft`. **No permission gating yet.**
- **Future `shipment_revision_log` table** (NOT created now — future spec only):
  `revision_id, shipment_id, action, from_status, to_status, reason, changed_by, changed_at, note`.

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
- **`shipment_events` / `shipment_routes` schema** (milestone + route detail — §18).
- **Carrier master / rate card** (`carriers`, `carrier_routes`, `carrier_rate_cards`, lead times, performance).
- **Document template token mapping** (token → DB field for each template — future Mapping / Export Center spec).
- **Export Center field mapping** (which records/fields feed each document type).
- **Automatic email / carrier API** (replace MVP manual download-and-email).
- **Amazon API receiving sync** (FBA live-inventory pull vs manual receiving — §17).
- **`country_of_origin` / customs master data** (likely sourced from SKU Details or a future product/customs master — §16.3).
- **Document generation logs / `document_template_fields`** (if per-template field definitions are needed later).
- **Shipment receiving workflow** (manual MVP vs API; partial_received → completed reconciliation).
- **Cost analysis integration** (freight/duty/fee inputs from shipment + document data).
- **Exact factory stock allocation formula** (forecast share / shortage / other — Replenishment / Allocation Engine Spec).
- **Integer allocation rounding / reconciliation** (rounding method; reconcile rounded site allocations vs physical available stock — §19.1).
- **Cross-company / site borrowing rules** (when an unused allocation may be borrowed by a short site — §19.3).
- **Borrowing approval rules** (`manager_approval_required` / `COO_approval_required` / `reallocation_reason` — §19.3).
- **Shipment Plan Quantity Limit behavior: warn vs block** (business rule when planned qty exceeds allocated available stock — §19.2).
- **Shipment Document Dataset mapping** (dataset → record sources; §20).
- **Token-to-dataset mapping** (template token → dataset field — future Export Center / Mapping Spec; §16, §20).
- **Export Center / Mapping Spec dependency** (the authoritative home for token/field mapping).

---

## 15. Formal Shipment End-to-End Flow

This section documents the **full shipment-side operating flow**, from stock/order confirmation through document generation to receiving/completion. It is the operational narrative behind the Core Flow (§3); the status enum and reservation rules in §3/§7/§8 remain authoritative.

```
 1. Factory / overseas warehouse stock confirmation
 2. Purchase Order completed / incomplete qty + delivery schedule confirmation
 3. Carrier / forwarder rate confirmation        (MVP manual; future auto / API)
 4. Notify OP team
 5. Inventory Replenishment gives suggestions; OP plans shipping needs
 6. OP pushes selected needs into Weekly Shipping Plan
 7. Weekly Shipping Plan review: OP confirms plan, logistics choice, notes → Submit
 8. Manager approval
 9. COO approval
10. Approved Weekly Shipping Plan → create shipments + shipment_lines   (shipments.status = draft)
11. Shipment Draft stage: OP completes shipment details
       (Amazon shipment ID / reference / warehouse code / ship date / ETD / ETA / carrier / shipping method / note)
12. Confirm & Ship: status → ready_to_ship / in_transit (as applicable); FACTORY STOCK DEDUCTION HAPPENS HERE
13. Generate shipment documents:
       Shipment Detail Sheet · Carrier Booking Form / 托單 · Commercial Invoice · Packing List ·
       Commercial Invoice + Packing Combined (e.g. Amazon AGL combined form)
14. MVP manual communication:
       Download generated documents · attach Shipping Labels · email to factory & carrier/forwarder manually
       (Future: API / automatic email integration)
15. Shipment in transit        (future shipment_events / shipment_routes track milestones + route)
16. Arrival / receiving        (manual MVP, or future API receiving)
17. Shipment completed:
       Non-Amazon warehouse / overseas warehouse inventory increases;
       Amazon inventory should generally come from Amazon API / live inventory pull, NOT manual increase
18. Shipment remains searchable in Shipment Overview / History
```

**Step notes:**
- **Steps 1–4 (pre-plan readiness):** factory/overseas stock and PO completion (`completed_qty` / delivery schedule) are confirmed; carrier/forwarder rate is confirmed (MVP manual, future API-driven); the OP team is notified. These are prerequisites — they do not write shipment records.
- **Steps 5–9 (planning + approval):** Inventory Replenishment suggestions drive the Weekly Shipping Plan; OP submits; **Manager then COO** approve. This is the planning/approval layer (`shipping_plans` / `shipping_plan_lines`).
- **Step 10 (Execution Commit):** approval **creates `shipments` + `shipment_lines` with `status = draft`** and may reserve factory stock (§15.1). The Shipment Draft **copies the header context from `shipping_plans`** — including **`shipping_plans.company` → `shipments.company`** (persisted execution snapshot; **never live-joined from `marketplaces`**, §2) — and **copies each line's Decision Snapshot into the line Execution Snapshot** (`snapshot_*`, §2 / ARCHITECTURE §4A). The Execution Layer **never recalculates** Current Stock / Avg Sales / Days of Supply / Suggested Qty / Target Days / FC / Event — all are copied. Once created, the Shipment reads **only** `shipments` / `shipment_lines` and no longer reads the Weekly Shipping Plan.
  - **Execution Commit Phase 1 (implemented):** Approve auto-creates the Shipment Draft (idempotent — one shipment per approved plan; an explicit `createShipmentFromPlan` action retries). Execution-layer fields (carrier / booking / container / BL / invoice / ETD / ETA / tracking / remark / status) are editable via `updateShipment`; the Execution Snapshot is immutable. **Factory-stock reservation (§15.1) is NOT performed in Phase 1** (deferred — out of this scope); no `factory_stock` / `factory_stock_movements` write occurs yet.
- **Steps 11–12:** Shipment Draft completes formal data; **Confirm & Ship is the physical execution trigger** (§15.1) and finalizes FIFO PO allocation (§6).
- **Steps 13–14:** documents are generated (§16) and, in MVP, manually emailed to factory/carrier.
- **Steps 15–18:** in-transit (future events/routes §18) → receiving (§17) → completed → searchable in Overview/History.

### 15.1 Factory Stock Reservation / Deduction Timing

This makes the reservation/deduction timing in §7/§8 **unambiguous across the full flow**:

- **Creating a Shipping Plan does NOT deduct `factory_stock.current_stock`.**
- **Submitting a Weekly Shipping Plan does NOT deduct `factory_stock.current_stock`.**
- **Approved Weekly Shipping Plan / shipment creation (Step 10) may increase `factory_stock.reserved_stock`** (reservation), writing `factory_stock_movements` with `movement_type = stock_reserved` (`current_stock` unchanged).
- **Shipment Draft is `shipments.status = draft` and does NOT deduct `current_stock` by itself.**
- **Confirm & Ship (Step 12) is the physical execution trigger:**
  - `factory_stock.current_stock` **decreases**.
  - `factory_stock.reserved_stock` **decreases / is released to zero** for the shipped allocation.
  - `factory_stock_movements` writes a **`stock_shipped`** (a.k.a. shipment_allocated) movement, recording before/after for both current and reserved stock, `related_entity_type = shipment_line`, `related_entity_id = shipment_line_id`.
- **Cancelled shipments must release `reserved_stock` and must NOT deduct `current_stock`** (write `stock_reservation_released`).
- **`completed` / `cancelled` shipments must NOT count as on-the-way.**

> Consistent with §7 (reservation on plan approval) and §8 (deduction on ready_to_ship/confirm). The single authoritative deduction moment is **Confirm & Ship**.

### 15.2 Shipment Draft Role

- **Shipment Draft is NOT a separate DB.**
- **Shipment Draft = records in `shipments` + `shipment_lines` where `shipments.status = draft`.**
- Shipment Draft is the **editable formal preparation view** after Weekly Shipping Plan approval.
- **Shipping Plan is the planning / approval layer**; **Shipment is the formal execution layer.**
- **Do NOT create `shipment_drafts` / `shipment_draft_lines` tables.**

### 15.3 Shipment CBM / Weight Calculation (FUTURE — basis defined, not implemented)

When CBM / weight is computed for `shipment_lines`, it uses the **carton** dimensions from `sku_details` (per `SKU_DETAILS_LOGISTICS_SPEC.md`) — **never the item `*_2` secondary size**:

```
carton_cbm = carton_length * carton_width * carton_height / 1,000,000      (when carton_dimension_unit = cm)
shipment_lines.carton_cbm   = carton_cbm            (single-carton CBM — the ONLY stored CBM column)
line total CBM (runtime)    = carton_qty * shipment_lines.carton_cbm
shipment_lines.gross_weight = carton_qty * carton_weight
shipment_lines.net_weight   = qty * item_weight
```

- **`shipment_lines` stores only `carton_cbm` (single-carton CBM).** There is **no** stored line `cbm` column (the former `cbm` was renamed to `carton_cbm`). Line/header total CBM is **derived at runtime** from `carton_cbm × carton_qty`.
- **CBM is based on carton dimensions only.** `item_length_2` / `item_width_2` / `item_height_2` do **not** participate in any logistics calculation (they are product-content display only).
- **Units are read, never hard-coded:** dimension unit from `carton_dimension_unit` (default `cm`); weight unit from `carton_weight_unit` / `item_weight_unit` (default `kg`). Non-cm / non-kg values require conversion (handled by the future engine).
- **Execution Commit COPIES, never recalculates.** The Execution Commit **copies** `shipping_plan_lines.carton_cbm` verbatim into `shipment_lines.carton_cbm` (fallback: compute from `sku_details` carton dims when the plan line has none), and copies `gross_weight` / `net_weight`. The shipment header totals are summed:
  - `shipments.total_cbm = Σ(shipment_lines.carton_cbm × shipment_lines.carton_qty)`
  - `shipments.total_gross_weight = Σ shipment_lines.gross_weight`
  - `shipments.total_net_weight = Σ shipment_lines.net_weight`
  The **Shipment header may store** these totals (unlike the Shipping Plan header, which keeps them Runtime). The formula above is the **definition** of how the plan values were produced; the Execution Layer **does not re-run it**.
- If a plan line has no logistics value (blank — e.g. `sku_details` missing carton dims), the copied value stays blank; no fabrication.

---

## 16. Shipment Document Generation

> **Generated documents are derived outputs, not source-of-truth records.** They are assembled from the authoritative shipment/PO/SKU/warehouse data; regenerating a document must not change underlying records.

**MVP document DB (unchanged):**

**`document_templates`** —
```
template_id
template_name
document_type
carrier_id
country
marketplace
language
template_file_type
template_file_id
template_drive_url
template_version
is_active
created_at
updated_at
```

**`generated_documents`** —
```
document_id
template_id
related_entity_type
related_entity_id
document_type
file_name
file_id
file_url
generated_by
generated_at
status
note
```

**Document-type catalog** (`document_type`): `PURCHASE_ORDER`, `SHIPMENT_DETAIL_SHEET`, `CARRIER_BOOKING_FORM`, `COMMERCIAL_INVOICE`, `PACKING_LIST`, `COMMERCIAL_INVOICE_PACKING_COMBINED`, `CUSTOMS_DECLARATION`, `CERTIFICATE_OF_ORIGIN`, `MSDS`, `OTHER`.

**Shipment-focused document types (this spec):** `SHIPMENT_DETAIL_SHEET`, `CARRIER_BOOKING_FORM`, `COMMERCIAL_INVOICE`, `PACKING_LIST`, `COMMERCIAL_INVOICE_PACKING_COMBINED`.

**Generation rules:**
- **A single shipment may generate multiple documents.**
- Example: a **Taiwan export to US** can generate **TW Invoice, TW Packing List, US Invoice, US Packing List**.
- **Amazon AGL** may use `COMMERCIAL_INVOICE_PACKING_COMBINED`.
- **Invoice and Packing List remain separate document types** even though they share most data — international trade / forwarder / customs workflows may require them as separate documents.
- The system should build **one shared Shipment Document Dataset** per shipment and generate multiple templates from it (one dataset → many rendered documents).
- **Exact token-to-DB mapping is future Mapping Spec / Export Center Spec work** — not part of this update.

### 16.1 Shipment Detail Sheet — fields

Minimum fields:
- Shipment ID · Reference · SKU · Quantity · Carton Qty · Weight KG · CBM · Carton No. · PO No. · Warehouse Code · Destination Warehouse · Expected Ship Date / ETD · Expected Arrival Date / ETA · Carrier · Shipping Method · Note.

Likely sources: `shipments`, `shipment_lines`, `shipment_line_allocations`, `purchase_order_lines`, `purchase_orders`, `warehouses`, `carriers` / future carrier master, `shipment_events` / future milestone data (if needed).

### 16.2 Carrier Booking Form / 托單 — fields

**Header / recipient:**
- customer order number (usually `shipment_id` or `shipment_no`) · service / `shipping_method` · recipient name · recipient company · recipient address · recipient city · recipient postal code · recipient country code · PO number · carton count · battery flag · magnetic flag · customs declaration type · declaration currency.

**SKU / customs section:**
- cargo item number (e.g. `shipment_no` + six-digit sequence) · PO number · cargo weight KG · carton length / width / height CM · English product name · Chinese product name · declared unit value · per-carton declared quantity · HS / HTS code · model · material · product usage · sales link · battery flag · magnetic flag.

Likely sources: `shipments`, `shipment_lines`, `sku_details`, `marketplace_skus`, `purchase_orders`, `warehouses`, carrier / shipping method, future template mapping.

### 16.3 Commercial Invoice / Packing List / Amazon AGL Combined — fields

**Commercial Invoice:**
- Invoice No · Invoice Date · Ship To · Invoice Of · Marks / No. · SKU · Product Description · Quantity · Unit Price · Amount · Total PCS / Amount · Material.

**Packing List:**
- PO No · Invoice Of · Invoice No · Ship To · Invoice Date · Marks / No. · SKU · Product Description · Quantity · SKU-level Total CTNS / Gross Weight / Net Weight / CBM · Total PCS / CTNS / Gross Weight / Net Weight / CBM · Carton Size.

**Amazon AGL Combined Invoice + Packing:**
- FBA Shipment ID · Description of Goods · Material · HTS Code · Country of Origin · Qty PCS · Actual Unit Cost · Total Unit Value · CTNS · GW KGS · NW KGS · CBM · Total Currency / PCS / CTN / GW / NW / CBM · Date.

> **`country_of_origin`** will likely need to be available from **SKU Details or a future product / customs master**. **No DB schema is added now** — this is flagged as a **future mapping / master-data item** (see Open Items).

---

## 17. Receiving & Inventory Impact

- **Receiving can be manual (MVP) or API-driven (future).**
- **Non-Amazon overseas warehouse / 3PL receiving** can update `overseas_inventory_snapshot` and `overseas_inventory_movements` (inventory increases on receipt).
- **Amazon FBA receiving should generally NOT manually increase inventory** when Amazon API / live inventory sync is the source of truth (avoid double-counting).
- **`completed` status should be set only after receiving / completion confirmation.**
- **`partial_received` remains valid** when only part of a shipment is received.

---

## 18. Future `shipment_events` / `shipment_routes`

- **Shipment Overview, On The Way, and World Map still read `shipments` + `shipment_lines` as the authoritative shipment records.**
- **`shipment_events` and `shipment_routes` are future detail / enrichment tables** — they **must NOT replace** `shipments` / `shipment_lines`.
- **`shipment_routes`** may support: `origin`, `destination`, route points, carrier route, map visualization. **`shipment_routes` = planned route nodes** (the intended path, e.g. Factory → export customs → ocean leg → destination port → FC).

### 18.0 `shipment_routes` role & phasing

- **`shipment_routes` are planned route nodes** — the intended path a shipment is expected to travel.
- **They must NOT be required per shipment.** No shipment needs a hand-built route to be created, shipped, or settled (see "No route or event is required to Ship" above).
- **Phase 1: not enforced.** `shipment_routes` are optional and are not generated or required. Overview / On The Way / World Map continue to work from `shipments` + `shipment_lines` alone.
- **Phase 2: auto-generated from `shipment_route_templates`.** Once a `shipment_route_templates` master exists, planned route nodes are produced automatically from the shipment's `shipping_method` / `origin` / `destination` / `carrier` — no manual node entry. Templates are the source; `shipment_routes` are the per-shipment planned instance.
- **World Map usage:** the World Map draws the **planned route** from `shipment_routes`, and overlays / updates the **actual status** from `shipment_events`. Planned (routes) and actual (events) are complementary layers, and both are enrichment on top of the authoritative `shipments` / `shipment_lines`.

### 18.1 `shipment_events` definition (optional actual tracking)

- **`shipment_events` = optional actual tracking / event records.** It is the **actual event history** of a shipment (what actually happened), in contrast to `shipment_routes` (the **planned** route nodes).
- **It does NOT affect the Ship main flow.** `shipments` + `shipment_lines` remain authoritative for Overview / On The Way / World Map.
- **No route or event is required to Ship.** A shipment can be created, shipped, and settled with zero `shipment_events` / `shipment_routes` rows.
- **Sources may be:** `manual` · `carrier API` · `tracking API` · `import` · `system`.
- **`shipment_events`** may track milestones / event types such as: `shipped`, `booked`, `picked_up`, `departed`, `arrived_port`, `customs_clearance`, `delivered`, `received`, `exception` / `stuck`.

#### First event on Ship (optional, non-blocking)

- **When a shipment is marked `shipped`, the system MAY create the first `shipment_event`:**

  | Field | Value |
  |---|---|
  | `event_type` | `shipped` |
  | `event_status` | `completed` |
  | `event_time` | = the shipment's `shipped_at` |
  | `source` | `system` |

- **This event is convenience/enrichment only — it does NOT gate or block the Ship main flow.** Ship succeeds whether or not this event row is written; if event creation fails, the shipment is still `shipped`. `shipments` + `shipment_lines` remain authoritative.
- All later events (in transit, arrived, customs, delivered, received, exception) may be written by `manual` / `carrier API` / `tracking API` / `import`.

**Preserved field list (future schema, spec-only — no migration now):**

| Column | Note |
|---|---|
| `shipment_event_id` | PK |
| `shipment_id` | FK → `shipments` |
| `event_time` | when the event actually occurred |
| `event_type` | e.g. `picked_up` / `customs_cleared` / `vessel_departed` / `arrived_port` / `delivered` |
| `event_status` | status of the event |
| `location_name` | human-readable location |
| `country` | |
| `city` | |
| `latitude` | for map visualization |
| `longitude` | for map visualization |
| `source` | `manual` / `carrier API` / `tracking API` / `import` |
| `note` | free text |
| `created_at` | |
| `updated_at` | |

- **Exact schema is future work** (see Open Items); the fields above are the reserved definition.

---

## 19. Shipment Planning Inputs

**Shipment Center is NOT the primary calculation engine for replenishment quantity.** It **receives planned shipping needs** from Inventory Replenishment / Weekly Shipping Plan and turns them into execution records, documents, and tracking.

**Inputs considered before a Weekly Shipping Plan** (read / reference, not recomputed here):
- Factory Stock
- Factory Stock `reserved_stock` / `available_stock` (`available_stock = current_stock − reserved_stock`, computed)
- Overseas Inventory / Warehouse Stock
- On-the-way shipments
- Forecast / FC Summary
- Inventory Replenishment suggestions
- Purchase Order `completed_qty` / incomplete qty / expected completion date
- Production Schedule
- Carrier / forwarder rate
- OP manual adjustment / notes

**Module boundary (must hold):**
- **Inventory Replenishment calculates or displays the suggested shipping need.**
- **Shipment Center turns selected shipping needs into Weekly Shipping Plan → Shipment Draft → formal Shipment → documents → tracking.**
- **Shipment Center must NOT create a parallel replenishment calculation engine.** Replenishment / allocation math lives in `SUPPLY_PLANNING_CALCULATION_RULES.md` and the future Calculation Engine Spec.

### 19.1 Inventory Replenishment Factory Stock Allocation Display

- **Factory stock is physical stock, not company/site-owned inventory.**
- For **planning display**, factory stock may be **virtually allocated** across company / country / marketplace / warehouse / site / SKU according to forecast share, shortage, or other calculation rules.
- Inventory Replenishment may display each site's allocated factory stock as an **integer quantity**.
- **Allocated factory stock shown in Inventory Replenishment is planning metadata only:**
  - It does **NOT** deduct `factory_stock.current_stock`.
  - It does **NOT** transfer ownership.
  - It does **NOT** create intercompany transactions.
- It should **align with the future `factory_stock_allocation_plans`** planning-layer table (§9).

**Suggested display rule:**
```
site_allocated_factory_stock_qty = rounded integer allocation for that site / SKU
```

- **Exact formula belongs to the Forecast / Replenishment Calculation Spec.**
- **Rounding method must be defined later.**
- If the **total rounded allocation differs from physical available stock**, the future calculation spec must define **rounding reconciliation** (see Open Items).

### 19.2 Shipment Plan Quantity Limit

- **A site's planned shipment quantity should not exceed the site's allocated available factory stock quantity.**
- If a user attempts to plan more than the allocated available stock, the system should **warn or block** (the warn-vs-block business rule is a future decision — see Open Items).
- This **prevents over-planning against shared factory stock**.
- **Physical stock deduction still happens only at Confirm & Ship** (§15.1), **not at planning time.**

**Example:**
```
Factory available stock for SKU A = 10,000
Allocation display:
  KM US   = 4,000
  ResUS US = 3,000
  ResTW CA = 3,000
→ KM US normally cannot plan more than 4,000,
  unless borrowing / reallocation is explicitly allowed (§19.3).
```

### 19.3 Cross-site / Cross-company Borrowing *(future planning exception)*

- Some sites may **not need their full allocated factory stock**.
- Another site / company may have a **shortage** and may need to **borrow** the unused allocation.
- **This is a planning exception, not ownership / accounting.**
- Future rules may support: `borrow_from_low_risk_site`, `manual_override`, `manager_approval_required`, `COO_approval_required`, `reallocation_reason`.
- **Do not implement now. Do not create intercompany SO / AP / AR.**
- This should be finalized in the **Replenishment Calculation / Allocation Engine Spec**.

---

## 20. Shipment Document Dataset

**Shipment documents should be generated from one shared Shipment Document Dataset.**

```
Authoritative DB records
        ↓
Build Shipment Document Dataset        (one dataset per shipment)
        ↓
Render multiple document_templates     (Detail Sheet · Booking Form · Invoice · Packing List · AGL Combined)
        ↓
Save generated_documents
```

**Purpose:**
- Avoid each document template implementing its **own DB query logic**.
- Keep values **consistent** across Shipment Detail Sheet, Carrier Booking Form, Commercial Invoice, Packing List, and AGL Combined forms.
- **Template file controls layout; dataset controls values.**

**Dataset may include:**

**Header fields:**
`shipment_id`, `shipment_no`, `reference_id`, `fba_shipment_id`, `invoice_no`, `invoice_date`, `carrier_id`, `shipping_method`, `etd`, `eta`, `warehouse_code`, `destination_warehouse`, `ship_to`, `ship_from`, `currency`.

**Line fields:**
`sku`, `product_name_en`, `product_name_cn`, `qty`, `carton_qty`, `carton_no_start`, `carton_no_end`, `gross_weight`, `net_weight`, `cbm`, `carton_length`, `carton_width`, `carton_height`, `declared_unit_value`, `amount`, `hs_code` / `hts_code`, `material`, `usage`, `model`, `country_of_origin`, `sales_link`, `battery_flag`, `magnetic_flag`, `po_no`.

**Total fields:**
`total_qty`, `total_cartons`, `total_gross_weight`, `total_net_weight`, `total_cbm`, `total_amount`.

**Notes:**
- **Exact token-to-dataset mapping belongs to the future Export Center / Mapping Spec.**
- **`country_of_origin`** may require **SKU Details or a future customs / product master** (no schema added now — see Open Items).
- **The Shipment Document Dataset is a generated runtime / mapping concept, not necessarily a DB table in MVP.**
- **Do not add DB schema now** unless a future Mapping Spec requires it.

---

**Draft v2.3 — Spec only. No code, DB, or implementation changes are implied by this document.**

**End of Document**
