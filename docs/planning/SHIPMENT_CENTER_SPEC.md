# Shipment Center / Shipment Draft / Shipment Overview — Specification

**Status:** 🟢🟡 Draft v2.9 — **Mixed implementation status.** Core Shipment execution is live and runtime-aligned; several sections remain spec-only (see the status legend below). **Warehouse Picker status is component-level (canonical matrix in §23.8): frontend CODE-COMPLETE, backend source acceptance of the compatibility `warehouse_id + warehouse_code` SOURCE IMPLEMENTED, REDEPLOY PENDING, live GET/save/reload NOT VERIFIED, and `destination_warehouse_id` canonical persistence NOT IMPLEMENTED.** **Factory Stock reservation lifecycle remains PLANNED / NOT IMPLEMENTED (B-1 decision resolved; owner §8A.1).** v2.8 = Batch B · B-3: `shipment_line_plan_allocations` WITHDRAWN (§2.A), two-axis allocation model, Plan→Shipment `0..1` (no split), `shipments.marketplace ≠ MULTI` (MIX = number token only) — documentation only. **v2.9 = Batch B Round 4D-C: External-Origin Link/Adopt Boundary landed (documentation only; Runtime NOT implemented).** This is not a whole-module "spec only" document. No Runtime or DB change in this documentation task.
**Last Updated:** 2026-07-31
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md) (Global Logistics Enums §4.5 / matching §4 / resolution §4.6), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md)

> **Document status legend (2026-07 reconciliation).** This document is a **mix of implemented runtime and planned design** — do NOT read it as "entire module unimplemented."
> - **🟢 IMPLEMENTED / runtime-aligned:** Shipment Draft + Shipment Overview (two status-filtered views over `shipments` / `shipment_lines`, `shipping-history.js`); Execution Commit (`createShipmentFromApprovedPlan_`) copying the plan snapshot; `updateShipment` editable-field whitelist + Ship gate + carton-range validation; **central `shipmentRecalcTotals_`** header totals; the **2026-07 canonical field renames** (`shipment_total_*`; `shipment_lines.shipment_qty` / `shipment_carton_qty` / `shipment_carton_cbm` with line-total CBM semantics; `shipments.shipments_customs_type`); `shipping_method_label` + `shipments_customs_type` snapshots. These reflect live Apps Script + API + UI.
> - **🟡 PLANNED / spec-only (NOT implemented):** `shipment_line_allocations` multi-PO table + writer (§16/Doc Gen §I.1 allocation grain); `factory_stock` reservation lifecycle + `factory_stock_allocation_plans` (§15.1); `shipment_events` / `shipment_routes` enrichment (§18); Document Engine runtime + most document mappings (§16/§20); cross-site borrowing (§19.3). New tables/fields marked *planned* here are design, not live.
> - Individual sections should be read with this legend; where a section says "planned/future," it is spec-only. Legacy DB names appear in this document **only** inside explicit read-fallback / migration notes.
>
> **Changelog v2.7 → v2.8 (2026-07-31 — Batch B · B-3 Marketplace Header/Line placement; documentation only, no Runtime/DB change):** §2.A rewritten — **`shipment_line_plan_allocations` WITHDRAWN** (not Required/Planned/handoff; no third Demand-source axis; no substitute table); the allocation model is the **two axes** (`factory_stock_allocation_plans` planning + `shipment_line_allocations` PO/FIFO). Shipment provenance: `shipment_lines` = physical qty; `shipment_line_allocations` = PO/FIFO; **Marketplace/period context stays on `shipping_plan_lines`** (read via `shipment_plan_links` as original planning context, NOT an actual-shipped ledger). Same-SKU aggregation retained but **not** decomposed per Marketplace. **`shipments.marketplace ≠ MULTI`** (MIX only as a shipment-number token). **Plan→Shipment cardinality `0..1` (no split); Shipment→Plans `1..N`;** `shipment_plan_links` = header relationship (not an axis) with a same-plan/different-Shipment conflict rule (§2.A, Step 10). Aligns with the 2026-07-31 B-2/B-3 precedence (the 2026-07-27 amendment's no-MULTI clauses partially superseded).
>
> **Changelog v1 → v2:** *(Historical — the "reserve on plan approval" timing below is **SUPERSEDED by v2.7 / B-1**: reserve = Ready to Ship, and cancel-release = B-8. Retained as a historical record only.)* Added `warehouses` full schema, `factory_stock.fac_reserved_stock` + `available_stock = current_stock − reserved_stock` rule, reservation lifecycle (reserve on plan approval, release on cancel, deduct on ship), expanded `factory_stock_movements` (separate before/after for current vs reserved + reservation movement types), planned `factory_stock_allocation_plans` planning-layer table, production_schedule positioned as upstream readiness (not an MVP shipment dependency), and multi-PO display via `shipment_line_allocations`.
>
> **Changelog v2 → v2.1:**
> - Refined FIFO PO allocation eligibility (`available_to_ship = completed_qty − shipped_qty`; never ship uncompleted PO quantity).
> - Added future allocation version / `plan_run_id` requirement for `factory_stock_allocation_plans`.
> - Added open item for received / delivered / completed status distinction.
> - Clarified Formal Shipment positioning (execution layer, not a separate duplicate table).
>
> **Changelog v2.1 → v2.2:**
> - Added the complete **Formal Shipment end-to-end execution flow** (§15) — stock/order/rate confirmation → Weekly Shipping Plan → Manager + COO approval → Shipment Draft → Confirm & Ship → document generation → manual carrier/factory email → in-transit → receiving → completion → Overview/History.
> - **Clarified factory-stock reservation & deduction timing** unambiguously (§15.1): plan creation/submission never deducts `current_stock`; reservation increases on approval/shipment creation; **Confirm & Ship is the physical deduction trigger**; cancellation releases reservation only. *(Historical — "reservation increases on approval/shipment creation" and "cancellation releases reservation" are **SUPERSEDED by v2.7 / B-1**: reserve = Ready to Ship transition; cancel/release mapping = B-8 (BLOCKED). See §7/§8/§15.1.)*
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
> **Changelog v2.6 → v2.7 (2026-07-30, acceptance-corrected) — B-1 Reserve Trigger sync (Batch B Round 1; decision only, NOT implemented):**
> - Mapped the **Factory Stock reserve trigger** to the resolved **B-1** decision (single Canonical owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1): the reserve event is the **successful Ready to Ship transition (`shipments.status: draft → ready_to_ship`) = Formal Shipment Execution Commit** — explicitly **distinct** from the non-reserving *Execution Commit / Create Shipment Draft* (Step 10, the Approved-Plan → Draft handoff). **Plan approval, Create Shipment Draft, and interactive Draft create/save/edit do NOT reserve.** Reservation applies to a **factory-origin** shipment only; identity = **`factory_stock.warehouse_id (= shipments.origin_warehouse_id) + sku`** (never `shipments.warehouse_id` / `destination_warehouse_id` / `warehouse_code` / `company` / `factory_name`); overseas origin → Overseas Outbound Lock / `wh_reserved_stock`, not `factory_stock`. **Ship (Confirm & Ship)** deducts `fac_current_stock` and consumes `fac_reserved_stock` (§8; reserved-consumption not implemented). Corrected §0/§3/§4/§7/§8/§15.1/§23.9 so reserve = Ready to Ship and deduct = Ship (prior sync had bound reserve to Step-10 draft creation). **Cancel / return-to-draft / reject release + `stock_reservation_released` are B-8 (BLOCKED), marked non-canonical.** **No Shipment status redesign, no Warehouse Picker / FIFO / allocation / document-generation change; reservation lifecycle stays PLANNED / NOT IMPLEMENTED.**
>
> **Changelog v2.3 → v2.4 (2026-07-01) — Shipment Draft refinement (implemented):**
> - **external_shipment_id default reformatted** to **`COMPANY-MKT-YYMMDD-##`** (marketplace short codes; 2-digit daily serial; e.g. `RESUS-AMZ-260701-01`) and shown as the **first Shipment Draft card-header field** (fallback `shipment_no` → internal `shipment_id`); §2.
> - **`shipment_lines.carton_cbm` renamed to `shipment_carton_cbm`** and its meaning corrected to **LINE-TOTAL CBM** (total for the whole line/SKU qty — NOT per-carton). Header total CBM = **`Σ shipment_carton_cbm`** (direct sum, never re-multiplied). SKU Lines show **CBM** (line total), totals row shows **Total CBM**; §2, §15.3. Legacy `carton_cbm` (per-carton) = read-fallback only.
> - **Carton No. validation** (§12): integers, `start ≤ end`, non-overlapping within a shipment; blocks Save / Ready to Ship / Ship (frontend + `updateShipment`).
> - **§5B Required fields before Ship** changed to: `external_shipment_id`, Carton No. Start/End (all lines), `reference_id`, `warehouse_code`, `etd`, `eta` (tracking/booking no longer required).
> - **Remark maps to `shipments.note`** (§4).
> - **§12A Return to Draft — Historical v2.4 proposal — SUPERSEDED by v2.7 / B-8.** The former reason-appended-to-`note`, the exact status transition, the release behavior, the writer, the movement literal, and the `shipment_revision_log` table and its columns are **NOT current canonical contracts. They remain BLOCKED under B-8.** No table, writer, status mapping or release contract is created or specified by B-1. *(History preserved; the active misreading is removed — see §12A.)*
> - Implemented in `12_shipment_handlers.gs`, `11_shipping_plan_handlers.gs`, `operation-system-db-api.js`, `shipping-history.js` — **this "implemented" note applies ONLY to the genuinely-completed v2.4 non-B-8 items above (external_shipment_id format, `shipment_carton_cbm`, Carton No. validation, §5B required fields, Remark→`note`). It does NOT implement Return to Draft, any reservation release, an exact status transition, or the `shipment_revision_log` table — those remain B-8 (BLOCKED), not implemented.**

---

## 0. Schema Baseline (current, after recent DB redesign)

These reflect the **current** Google Sheet schema and supersede older docs. **Factory / source location and company come from `warehouses` via `warehouse_id`** — inventory/PO/production tables no longer store `factory_name` or `company`.

**`warehouses`** (warehouse master) —
`warehouse_id, warehouse_code, warehouse_name, warehouse_type, company, country, marketplace, warehouse_owner, is_factory_warehouse, is_active, logistics_region, address, city, state, postal_code, contact_name, contact_email, contact_phone, created_by, created_at, updated_by, updated_at, note`
- `warehouse_id` = system-unique master id (e.g. `WH-RESUS-US-FBA-ONT8`) — **the canonical identity**. `warehouse_code` = external/operator code (e.g. `ONT8`) and is **NOT globally unique** (the same FC code repeats across companies: `WH-RESUS-US-FBA-ONT8` and `WH-KM-US-FBA-ONT8` both have `warehouse_code = ONT8`). Logical uniqueness = `warehouse_id`, or the composite `company + country + marketplace + warehouse_code` — never `warehouse_code` alone. See §22.0(D). *(No DB constraint changed by this task.)*
- **`company` vs `warehouse_owner` (distinct dimensions):** `company` = the KM business/account context **using** the warehouse (`KM` / `ResUS` / `ResTW`); `warehouse_owner` = the physical **operator** (`Amazon` for FBA, `WINIT`, `AMZLGS`, `ResTW`). e.g. both `WH-RESUS-US-FBA-ONT8` (`company=ResUS`) and `WH-KM-US-FBA-ONT8` (`company=KM`) have `warehouse_owner = Amazon`. `warehouse_owner` is **not** the inventory-owning company. See §22.0(C).
- `warehouse_type` ∈ `FBA` / `3PL` / `RETURN` / `FACTORY` — drives Shipment Draft candidate grouping/exclusion (§22.0(F)/(G)/(H)); `marketplace` may be blank for `3PL`. `warehouses` is a **passive Reference Master** — it never creates/moves/allocates inventory or infers FC-level stock (§22.0(A)/(B)).
- **`logistics_region` (EXISTING canonical field)** — coarse logistics region (e.g. `US_WEST` / `US_CENTRAL` / `US_EAST`) used by **Shipment Route Template resolution** by the canonical precedence — **(1) `shipments.destination_warehouse_id`, (2) compatibility `shipments.warehouse_id` fallback, (3) legacy exact composite fallback** → `warehouses.logistics_region` → `shipment_route_templates.destination_region` (never `warehouse_code` alone; lookup contract only — Route Runtime NOT implemented; [`SHIPMENT_ROUTE_AND_EVENT_SPEC.md`](./SHIPMENT_ROUTE_AND_EVENT_SPEC.md) §3). FBA warehouses in the same region (e.g. `ONT8` / `LGB8` → `US_WEST`) share a Route Template. Not a duplicate region table.
- `is_factory_warehouse` distinguishes factory (production-side) warehouses from destination/3PL/FBA warehouses.
- **PROPOSED / PLANNED additive field — `is_selectable_for_shipment` (BOOLEAN):** shipment-destination eligibility flag. **NOT yet present in the live schema** — do not treat as implemented. Default `TRUE` for legitimate destination warehouses; `FALSE` for factory-only / virtual / testing / deprecated / transit-only / internal non-destination warehouses. Until adopted, the Shipment Draft warehouse eligibility filter (§22) falls back to `is_active` (and `is_factory_warehouse = FALSE`) only. See §22.G. **No DB column is added by this spec.**

**`factory_stock`** — `factory_stock_id, warehouse_id, sku, fac_current_stock, fac_reserved_stock, created_at, updated_at, last_transaction_at`
- **Inventory namespace (finalized 2026-07-21):** Factory Stock balance columns are `fac_*`. `fac_current_stock` / `fac_reserved_stock` **supersede** the earlier `current_stock` / `reserved_stock` (same fields, renamed to disambiguate from the overseas `wh_*` domain). See the Inventory Field Namespace Rule in `DATABASE_RELATIONSHIP_MAP.md`. Throughout this spec, prose mentions of `factory_stock.fac_current_stock` / `.reserved_stock` refer to these canonical `fac_*` columns.
- **No `company`, no `factory_name`.** Company = `warehouses.company`; Factory name = `warehouses.warehouse_name` (join by `warehouse_id`).
- `fac_current_stock` = physical stock currently in the factory warehouse.
- `fac_reserved_stock` = stock reserved at the **Ready to Ship transition (`draft → ready_to_ship`) = Formal Shipment Execution Commit** (B-1 resolved, owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1) and **not yet physically shipped** — reserved only for **factory-origin** shipments (identity origin `warehouse_id + sku`), **not** at plan approval, the Create-Shipment-Draft handoff, or interactive Draft create/save/edit. Consumed/released at **Ship**; cancel/release mapping is **B-8 (BLOCKED)**.
- **`fac_available_stock` = `MAX(fac_current_stock − fac_reserved_stock, 0)`** — **computed, do NOT store** unless a future performance need arises (not created as a DB column in this task).
- **Unique key: `warehouse_id + sku`.**
- `factory_stock_movements` audit columns (`before_current_stock` / `after_current_stock` / `before_reserved_stock` / `after_reserved_stock`, below) are **NOT part of this rename** — only the two balance columns were finalized; movement audit columns keep their names pending a separate decision.

**`factory_stock_movements`** — `factory_stock_movement_id, movement_date, sku, warehouse_id, movement_type, qty, related_entity_type, related_entity_id, before_current_stock, after_current_stock, before_reserved_stock, after_reserved_stock, note, created_by, created_at`
- Uses `warehouse_id` (no `factory_name`). Must log **both physical stock and reservation changes** — hence separate `before/after_current_stock` and `before/after_reserved_stock`.
- **Recommended `movement_type` values:** `stock_in`, `stock_reserved` *(B-1 reserve at Ready to Ship)*, `stock_reservation_released` *(**B-8 — BLOCKED**: cancel/release event & mapping not decided)*, `stock_shipped`, `stock_adjustment`. *(These are recommended literals only — no movement writer is implemented; the release literal is not a decided contract.)*
- **Manual Inventory Adjustment writer (2026-07-23):** the Factory Inventory page's **Inventory Adjustment** modal (renamed from the old dead "Edit" placeholder) calls action `adjustFactoryInventory` → `handleAdjustFactoryInventory_` (`21_factory_inventory_handlers.gs`). It writes `factory_stock` (`fac_current_stock` only; **`fac_reserved_stock` is never modified**) + one `factory_stock_movements` row **atomically** (script lock; movement-write failure rolls back the snapshot). The movement row uses `movement_type = 'manual_adjustment'` (already in the authoritative enum), `related_entity_type = 'inventory_adjustment'` (a value this workflow adds to the `related_entity_type` set — existing values `purchase_order` / `shipment` / `manual_adjustment` / `system_import` are unchanged), `related_entity_id = ADJ-YYYYMMDD-XXXX` (backend-generated), `factory_stock_movement_id = FSMV-<8hex>`, and the full 4-way `before/after_current_stock` + `before/after_reserved_stock` audit columns. User sets **New Available** only; backend computes `after_current = new_available + before_reserved`, `qty = new_available − before_available`, invariant `after_current − after_reserved === new_available`.

**`purchase_orders`** — `purchase_order_id, po_no, km_po_no, warehouse_id, supplier_name, order_status, order_date, expected_completion_date, expected_ship_date, submitted_by, submitted_at, rejected_by, rejected_at, rejected_reason, created_by, created_at, approved_by, approved_at, note, updated_at`
- No `factory_name`. Source location = `warehouses` via `warehouse_id`.

**`purchase_order_lines`** — `purchase_order_line_id, purchase_order_id, sku, factory_item_no, ordered_qty, completed_qty, shipped_qty, remaining_qty, carton_qty, units_per_carton, unit_cost, currency, expected_completion_date, actual_completion_date, line_status, note, created_at, updated_at`

**`production_schedule`** — `production_schedule_id, purchase_order_id, purchase_order_line_id, warehouse_id, sku, scheduled_month, scheduled_start_date, scheduled_completion_date, actual_completion_date, planned_qty, completed_qty, remaining_qty, status, created_at, updated_at`
- No `factory_name`. Use `warehouse_id` → `warehouses`.
- **Upstream production-readiness data.** Shipment Center MVP must **not** depend on it for shipment execution; shipment allocation primarily uses `purchase_order_lines.remaining_qty` / `completed_qty`. `production_schedule` may later estimate future available stock / expected completion.

**`shipments`** — `shipment_id, shipment_no, external_shipment_id, shipping_plan_id, reference_id, warehouse_id, warehouse_code, company, country, marketplace, ship_from, destination, carrier_id, rate_card_id, shipping_method, transit_type, last_mile_delivery, shipments_customs_type, shipments_customs_type_label, battery_flag, battery_type, magnet_flag, status, sales_order_id, booking_no, tracking_number, container_no, bl_no, invoice_no, etd, eta, actual_departure_date, actual_arrival_date, customs_clearance_date, delivered_date, shipment_total_qty, shipment_total_cartons, shipment_total_cbm, shipment_total_gross_weight, shipment_total_net_weight, freight_cost_actual, duty_actual, currency, shipped_at, shipped_by, hidden_from_draft_at, hidden_from_draft_by, note, created_by, created_at, updated_by, updated_at` *(canonical `shipment_total_*` and `shipments_customs_type`; legacy `total_qty` / `total_cartons` / `total_cbm` / `total_gross_weight` / `total_net_weight` / `customs_type` read-fallback only)*
- **Warehouse-endpoint fields — three separated categories (do NOT flatten into one "implemented schema"; canonical status §23.8):**
  - **Current Picker persistence (what the Runtime writes today):** `warehouse_id` (destination compatibility mirror / read-fallback), `warehouse_code` (destination display/external-code snapshot).
  - **Current Runtime-observed origin compatibility:** `source_warehouse_id` — **non-canonical, migration-pending Runtime gap** (never the B-1 reserve key; §23.3).
  - **Target canonical endpoint contract (§23):** `origin_warehouse_id` (+ `origin_type`), `destination_warehouse_id` (+ `destination_type`) — the sole canonical origin/destination endpoints.
  - **Implementation truth:** the target canonical endpoint carry/persistence is **NOT IMPLEMENTED** and live save/reload is **NOT VERIFIED**; this spec documents the canonical target contract and the current Runtime compatibility state **separately** — it does **not** assert the structured endpoint columns are live-verified.
- **Aggregated logistics attributes** (`battery_flag`, `battery_type`, `magnet_flag`) are **auto-calculated from `shipment_lines`, never user-editable** — see **§21 Shipment Logistics Attribute Aggregation**. `transit_type` / `last_mile_delivery` / `shipments_customs_type` use the Global Logistics Enums (`CARRIER_AND_ROUTE_SPEC.md` §4.5) and are the shipment-level keys used for carrier matching (with the aggregated battery/magnet). *(`transit_type` / battery/magnet header columns are **planned** additions — spec only; `shipments_customs_type` is the canonical customs field, legacy `customs_type` read-fallback only.)*
- **`shipment_id` = internal DB primary key** (e.g. `SH-2A9E06E1-A`) — **system-generated, never user-editable**. `shipment_lines.shipment_id` is the FK to it and is never changed by the UI.
- **`external_shipment_id` = the user-facing / carrier shipment number** — **editable** (≠ internal `shipment_id` PK, which is never editable). Auto-generated at Execution Commit as **`COMPANY-MKT-YYMMDD-##`** where:
  - **COMPANY** = `company` uppercased with non-alphanumerics removed (e.g. `Res US` → `RESUS`, `KM`, `RESTW`);
  - **MKT** = marketplace short code — `Amazon`→`AMZ`, `Walmart`→`WMT`, `Shopify`→`SHP`, `eBay`→`EBY`, `Target`→`TGT`, `Wayfair`→`WYF`; otherwise the first 3 characters uppercased;
  - **YYMMDD** = commit date; **##** = 2-digit serial per company+marketplace(+country) that day.
  - Examples: `RESUS-AMZ-260701-01`, `KM-AMZ-260701-02`, `RESTW-AMZ-260701-01`.
  - The user may override it (e.g. an Amazon-platform Shipment ID); Save writes `shipments.external_shipment_id`. It is shown as the **first field of the Shipment Draft card header** (fallback: `shipment_no` → internal `shipment_id`) and refreshes there after Save.
- **`carrier_id` is read-only in the Shipment Draft UI** — the carrier is chosen on the Weekly Shipping Plan. Displayed for reference (`--` when none).
- **Destination warehouse selection (canonical — supersedes the earlier "auto-derived from destination" note; the committed canonical destination is `shipments.destination_warehouse_id`, with `shipments.warehouse_id` as the compatibility mirror):** the destination warehouse is **NOT auto-derived** from `destination`. `company` / `marketplace` / country scope / `destination` context are **filtering context** that narrow the candidate list; the user then **selects exactly one warehouse** via the Warehouse Picker, and the system **copies `warehouse_code`** from that row:
  ```
  company / marketplace / country scope / destination context
    ↓ filter eligible warehouses (§22.0(E)–(G))
  user selects exactly one warehouses.warehouse_id
    ↓ persist shipments.destination_warehouse_id (canonical destination identity)   [Target Canonical — persistence NOT IMPLEMENTED, §23.8]
    ↓ persist shipments.warehouse_id (destination compatibility mirror / read fallback only — the field the current Runtime writes)
    ↓ copy warehouses.warehouse_code → shipments.warehouse_code (display/external-code snapshot, never an identity)
  ```
  **Runtime status (2026-07-21; component-level — canonical matrix §23.8):** the **Warehouse Picker frontend is CODE-COMPLETE** in the Shipment Draft frontend (`assets/js/pages/shipping-history.js`, `warehouseFld()` / `shWarehousePick()`) — it replaces the legacy free-text `warehouse_code` input with a grouped FBA→3PL `warehouse_id` selector (candidates filtered per §22.0(E)–(H)), copies `warehouses.warehouse_code` into the hidden `warehouse_code` mirror on selection, and persists the **compatibility** `warehouse_id` + `warehouse_code` via `_shCollectExec` (the destination compatibility mirror — **NOT** the canonical `destination_warehouse_id`, whose persistence is **NOT IMPLEMENTED**). **Backend source acceptance (SOURCE IMPLEMENTED):** `SHIPMENT_EDITABLE_FIELDS_` (`12_shipment_handlers.gs`) accepts the compatibility `warehouse_id`; `normalizeWarehouseRecord` was extended to expose `warehouse_code` / `warehouse_owner` / `is_active` / `is_factory_warehouse` / `logistics_region` / `city` / `state`. **REDEPLOY PENDING + live verification PENDING:** (a) live GET verifying the `warehouses` master actually carries `warehouse_code` / `warehouse_type` / `marketplace` / `is_active` / `is_factory_warehouse` / `logistics_region`; (b) `12_shipment_handlers.gs` redeploy; (c) live save/reload smoke test. Until (a)–(c) pass, the picker frontend is **CODE-COMPLETE but NOT live-verified**, and `destination_warehouse_id` canonical persistence stays **NOT IMPLEMENTED**. **CANONICAL WAREHOUSE ENDPOINTS (AMENDED 2026-07-28; B-1 reconciled 2026-07-30) — single contract, aligned with §23.3 / §23.4 / §7 / §15.1 / §23.9:** (1) **Destination canonical identity = `shipments.destination_warehouse_id` (+ `destination_type`)**. (2) Legacy **`shipments.warehouse_id` = destination compatibility / read-fallback only** — the Warehouse Picker still sends it (destination) and the current backend **accepts/persists it as the compatibility field only**; **there is NO backend step that mirrors it onto `destination_warehouse_id`** — that canonical persistence is **NOT IMPLEMENTED** (§23.8). It is never deleted. *(Target contract — **NOT IMPLEMENTED**: a future Save persists the canonical `destination_warehouse_id` **plus** the `warehouse_id` compatibility mirror **plus** the `warehouse_code` display snapshot.)* (3) **`warehouse_code` = the DESTINATION warehouse-code snapshot — never a source identity.** (4) **Canonical shipment origin/source identity = `shipments.origin_warehouse_id`.** (5) **Factory Stock B-1 reservation identity = `factory_stock.warehouse_id` = `shipments.origin_warehouse_id` + `sku`** (owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1). (6) The **current Runtime may still persist/observe `source_warehouse_id`** as the out-source endpoint column, but this is a **Current Runtime Gap / migration-pending compatibility state**, not a canonical decision. (7) **`source_warehouse_id` is NOT a competing canonical identity** and must **NOT** be used as the B-1 Factory Stock reservation key. (8) This documentation repair **does not implement, restore, rename, migrate or write any Runtime column**; `origin_type` transfer semantics remain exactly as defined in §23.3 / §23.4 (no new Runtime / schema decision is introduced here).
- **`shipped_at` / `shipped_by`** — stamped when the shipment is **Shipped** (status → `shipped`) from the Shipment Draft **Ready to Ship** section (§4). `shipped_by` is a placeholder actor (`system_user`; future Role & Permission).
- **`hidden_from_draft_at` / `hidden_from_draft_by`** — the **Done** marker: the Shipped card is **hidden from the Shipment Draft workspace** (still fully visible in Shipment Overview; the row is **never deleted** and status is unchanged). Minimal-change design (not `completed_*`) because the shipment lifecycle continues in Overview after Done.
- **`company`** = **copied from `shipping_plans.company` at Execution Commit** (when the Shipment Draft is created). It is a **persisted execution snapshot of company ownership** — the Shipment must **NOT** live-join `marketplaces` to recover company for historical records. Company lives on the **header only**; `shipment_lines` do **not** carry company (they inherit it via `shipment_id`).
- **`booking_no` / `note` / `updated_by`** added for the Execution Layer: `booking_no` = carrier/forwarder booking reference; `note` = shipment remark; `updated_by` = placeholder actor of the last execution edit (Role & Permission integration is future, like the plan-layer actors).
- **`marketplace`** is **copied from `shipping_plans.marketplace` at Execution Commit** (part of the six-key header copy) and is **displayed on the Shipment Overview card header** (Marketplace / Company / Country / Method / Total Pcs / Cartons). It is not live-joined. *(`destination` is intentionally NOT shown on the card yet — destination routing is finalized in `CARRIER_AND_ROUTE_SPEC.md` / future Shipping Allocation.)*
- The header six-key context (`company` / `country` / `marketplace` / `ship_from` / `destination` / `shipping_method`) and `shipment_total_qty` / `shipment_total_cartons` are **copied from the approved plan at Execution Commit and are NOT recalculated**. **Warehouse fields are three distinct kinds (canonical, §22.0 — NOT normal editable):**
  - **(1) Picker-controlled destination reference — the selected `warehouses.warehouse_id` Master row:** changed **only** by selecting a Warehouse Picker option (**not free text**). Target canonical destination field = `shipments.destination_warehouse_id`; the current frontend/backend source only persists the selected Master ID into the **compatibility `shipments.warehouse_id`** (`destination_warehouse_id` canonical persistence **NOT IMPLEMENTED** — §22.0(L)/§23.8). `shipments.warehouse_id` is a destination compatibility mirror / read-fallback, **never a canonical / committed identity**.
  - **(2) System-derived from the selected warehouse — `warehouse_code`:** **copied from `warehouses.warehouse_code`** as a display/external-code snapshot; **not independently editable** — the Picker frontend (**CODE-COMPLETE**, §23.8) sets it from the chosen row. *(Backend compatibility acceptance is SOURCE IMPLEMENTED; redeploy + live save/reload remain NOT VERIFIED.)*
  - **(3) Normal manually editable execution fields:** `carrier_id`, `rate_card_id`, `shipping_method`, `shipments_customs_type`, `booking_no`, `tracking_number`, `container_no`, `bl_no`, `invoice_no`, `etd`, `eta`, `actual_*_date`, `customs_clearance_date`, `delivered_date`, `shipment_total_cbm` / `shipment_total_gross_weight` / `shipment_total_net_weight`, `freight_cost_actual`, `duty_actual`, `currency`, `reference_id`, `note`, and `status`.

> **CANONICAL FIELD RENAME (2026-07 DB rename).** The quantity totals on `shipments` were renamed to `shipment_total_qty` / `shipment_total_cartons` / `shipment_total_cbm`; the **weight totals** to `shipment_total_gross_weight` / `shipment_total_net_weight`; `shipment_lines.qty` → **`shipment_qty`**; `shipment_lines.carton_qty` → `shipment_carton_qty`; **`shipment_lines.carton_cbm` → `shipment_carton_cbm` (now LINE-TOTAL, not per-carton)**; `shipping_plan_lines.carton_qty` → `plan_carton_qty`; `shipping_allocation_draft_lines.qty` → **`planned_qty`** (current canonical user Execution Plan quantity — `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6; the interim name `shipment_draft_qty` and the original `qty` are **legacy read/migration aliases only**, and `recommended_qty` stays a **separate** immutable system-recommendation snapshot never merged with `planned_qty`); **`shipments.customs_type` → `shipments_customs_type`** (Rate Card source `carrier_rate_cards.customs_type` is **NOT** renamed). The old names (`total_qty` / `total_cartons` / `total_cbm` / `total_gross_weight` / `total_net_weight` / `carton_qty` / `qty` / `carton_cbm` / `customs_type`) are **RETIRED** — new writes use the canonical names only, they are **never re-ensured/recreated**, and legacy columns remain solely for **read-fallback** on old rows.
>
> **`shipping_allocation_draft_lines` canonical quantities (owner `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6).** `recommended_qty` remains the **immutable system recommendation snapshot**; **`planned_qty` is the user-controlled Execution Plan quantity**; `shipment_draft_qty` and `qty` are **legacy read/migration aliases only**. **New writes must use `planned_qty`** — never re-create/write `qty` or `shipment_draft_qty`, and never merge `recommended_qty` with `planned_qty`. This Shipment spec does not redefine the Request Order draft schema; it references the §3.6 owner.
>
> **Central totals recalculation (`shipmentRecalcTotals_`).** Header snapshot totals are re-derived from the shipment's OWN `shipment_lines`: `shipment_total_qty = Σ shipment_qty`, `shipment_total_cartons = Σ shipment_carton_qty`, `shipment_total_gross_weight = Σ gross_weight`, `shipment_total_net_weight = Σ net_weight`, **`shipment_total_cbm = Σ shipment_carton_cbm`** (LINE-TOTAL summed DIRECTLY — never re-multiplied by cartons). Runs at Execution Commit (from the plan) and whenever **shipment lines change** in `updateShipment` (a header-only edit does not trigger it, so manual actuals overrides stick). `shipment_carton_cbm` / `gross_weight` / `net_weight` are **line totals** read as stored and summed directly; only a legacy per-carton `carton_cbm` fallback is converted once (× `shipment_carton_qty`) for historical rows. Legacy shipments keep blank weight totals until next recalculated.
>
> **`shipments.shipments_customs_type`** (canonical 2026-07 rename of `customs_type`; legacy `customs_type` read-fallback only) = shipment-level customs-method **snapshot**, prefilled from the selected `carrier_rate_cards.customs_type` at creation and confirmable while Draft. Enum: `third_party_customs` (買單報關) / `formal_customs` (正式報關) / `tax_refund_customs` (退稅報關). Documents/Overview read the **stored snapshot** — never live-resolve it from the current rate card. Nullable for legacy rows; new formal shipments should populate it before external customs/carrier document generation. **`carrier_rate_cards.customs_type` (the Rate Card source) is unchanged.**
>
> **`shipments.shipments_customs_type_label`** = the localized (中文) customs-method **Label SNAPSHOT**, architected **identically to `shipping_method_label`**. **Source:** `carrier_rate_cards.customs_type_label` (the Carrier module derives it from the canonical enum→Label map at import). **Snapshot time:** Shipment creation (Execution Commit); re-derived only while still Draft when the customs enum or Rate Card changes; frozen thereafter. **Fallback:** the canonical enum→Label map (`third_party_customs`=買單報關 / `formal_customs`=正式報關 / `tax_refund_customs`=退稅報關) for legacy rows with a blank label. **Used by:** all Shipment Documents — `{{CUSTOMS_TYPE}}` reads this Label, never the enum, never a runtime translation. If a Label ever changes, only the enum→Label map (`CUSTOMS_TYPE_LABELS_` in `17_carrier_handlers.gs`) changes; the next shipment write re-derives and **no document changes**. The enum (`shipments_customs_type`) remains the canonical machine value and the sole source for the 「是否出口退税」 yes/no derivation.

**`shipment_lines`** — `shipment_line_id, shipment_id, sku, shipment_qty, factory_stock_allocation_qty, shipment_carton_qty, carton_no_start, carton_no_end, units_per_carton, shipment_carton_cbm, gross_weight, net_weight, purchase_order_line_id, note, created_at, updated_at, snapshot_current_stock, snapshot_avg_sales_per_day, snapshot_days_of_supply, snapshot_suggested_qty, snapshot_target_days, snapshot_fc_context, snapshot_event_context, snapshot_avg_sales_source, snapshot_avg_sales_warning` *(canonical `shipment_qty` / `shipment_carton_qty` / `shipment_carton_cbm`; legacy `qty` / `carton_qty` / `carton_cbm` read-fallback only)*
- **`shipment_carton_cbm` (canonical 2026-07 rename of `carton_cbm`) = LINE-TOTAL CBM (m³)** for the whole line/SKU quantity — **NOT per-carton**. Copied at Execution Commit from the plan's **line-total** `shipping_plan_lines.cbm` (fallback: per-carton `carton_cbm` — plan value or computed from `sku_details` carton dims — **× `shipment_carton_qty`, multiplied exactly once here**). `gross_weight` / `net_weight` are likewise **line totals**. Header total CBM = **`Σ shipment_carton_cbm`** (summed directly — the line already holds its total; never re-multiplied by cartons). Legacy per-carton `carton_cbm` is read-fallback only (converted once for historical rows). The SKU Lines table shows **CBM** (line total); the totals row shows **Total CBM = Σ shipment_carton_cbm**.
- **`snapshot_*` = the Execution Snapshot** — a **verbatim copy of the line's Decision Snapshot** taken at Execution Commit (ARCHITECTURE §4A). These are **frozen and never recalculated** in the Execution Layer (Current Stock / Avg Sales / Days of Supply / Suggested Qty / Target Days / FC / Event are all copied, not re-derived). `shipment_qty` = the plan line's `approved_qty`; `shipment_carton_qty` / `units_per_carton` are copied from the plan line.
- **`shipment_qty`** (canonical; legacy `qty` read-fallback) = **final shipment quantity** and the source for on-the-way / arrival quantity.
- `factory_stock_allocation_qty` = factory stock reserved/allocated for this line; usually equals `shipment_qty`, but may differ during partial preparation.
- **`carton_no_start` / `carton_no_end` are user-editable (numeric)** on the Shipment Draft SKU Lines (Draft / Ready to Ship); saved via `updateShipment` `{ lines: [{shipment_line_id, carton_no_start, carton_no_end}] }`. All other line fields (qty / carton_qty / logistics / snapshot) are read-only.

**`shipment_line_allocations`** *(planned new table)* — `shipment_line_allocation_id, shipment_line_id, purchase_order_line_id, sku, allocated_qty, allocation_method, created_by, created_at, note`
- **The real allocation source** between `shipment_lines` and `purchase_order_lines`. Supports: one shipment line from multiple PO lines; one PO line across multiple shipment lines; FIFO default; future manual override.
- `shipment_lines.purchase_order_line_id` may hold the **primary/first** PO line for backward compatibility only. **Do not expose `purchase_order_line_id` to users.**

#### 2.A Allocation axes + Shipment provenance (CANONICAL — 2026-07-20; demand-axis WITHDRAWN B-3 2026-07-31)

The allocation model is **two axes** (DB Map §8B): a **Planning / recommendation axis** (`factory_stock_allocation_plans`, upstream planning snapshot, below) and a **Supply-source axis** (`shipment_line_allocations`, PO/FIFO). **There is NO third "Demand-source" shipment-line allocation axis** — `shipment_line_plan_allocations` is **WITHDRAWN** (B-3, 2026-07-31).

| Shipment axis | Chain | Purpose | Table |
|---|---|---|---|
| **Supply-source** | `purchase_order_lines → shipment_line_allocations → shipment_lines` | Preserve PO / FIFO supply source (drives `shipped_qty`); owns `allocated_qty` / `shipped_qty` / release lifecycle. | `shipment_line_allocations` (**PO-specific — never repurposed as Marketplace provenance**) |

**Shipment provenance model (B-3):**
- `shipment_lines` stores the **physical SKU shipped quantity**.
- `shipment_line_allocations` stores the **Shipment → PO / FIFO** supply draw.
- **Marketplace / Site SKU / period planning context stays on the original `shipping_plan_lines`.** The header-level **source Plans** are recorded by `shipment_plan_links`.
- **There is NO Shipment-Line → Plan-Line quantity allocation, and actual shipped qty is NOT claimed to be exactly decomposable back to Marketplace.** Reading the linked Plan Lines shows **original planning / decision context only — not an actual-shipped allocation ledger**.

**Same-SKU aggregation boundary:** Plan Lines remain **separate** in the Decision Layer; `shipment_lines` **MAY aggregate the same SKU** in the Execution Layer into one physical/document line. Example:
```
Shopify plan line  CO1100-R = 120   (original planning context, on shipping_plan_lines)
Walmart plan line  CO1100-R =  80   (original planning context, on shipping_plan_lines)
→ consolidated shipment_lines row  CO1100-R = 200   (physical, shown once)
```
The 120 / 80 are **original planning context on the Plan Lines**, reachable via `shipment_plan_links → shipping_plan_lines`; the physical **200** is **not** stored as a per-Marketplace execution split.

**`shipments.marketplace` must NOT be `MULTI`.** A multi-Marketplace Shipment keeps **one `shipment_id`**; if the shipment-number format needs a token, use **`MIX` only as a shipment-number formatting token — never a stored Marketplace enum / value**. (The `MULTI` scope marker belongs to `shipping_plans.marketplace` — the Plan header, §B-3 — not to `shipments`.)

**Header-level consolidation relationship — `shipment_plan_links` (existing table/header; NOT an allocation axis).**
- Columns (as created externally by the user in the Sheet): `shipment_plan_link_id, shipment_id, shipping_plan_id, created_at, created_by`.
- Authority: **multiple `shipping_plans` → `shipment_plan_links` → one `shipments` row.** This is the canonical multi-plan source relationship; `shipments.shipping_plan_id` (singular scalar) remains only the **legacy single-plan** link and must point at the same Shipment. **Cardinality (B-3):** one Approved Plan → **at most one** Shipment (`0..1`, transferred completely, exactly once, **no split**); a Shipment → **one-or-many** Approved Plans (`1..N`); the same Plan must never link to different Shipments (**report a conflict** if a `shipping_plan_id` is already linked elsewhere). Written **only after the Shipment exists**; idempotent upsert on `shipment_id + shipping_plan_id`.
- **DB status (truthful):** the table/header was **created externally by the user**; **no repo/runtime reference exists** (audited: no `.gs`/getter/writer/tab registration). **Runtime population: NOT IMPLEMENTED.**

> **Withdrawn (B-3, 2026-07-31):** `shipment_line_plan_allocations` is **not** part of the current Canonical design and **must not be created or implemented** — not Required Design, not Planned Implementation, not an Implement handoff, with **no** minimum-field list, **no** `SUM(allocated_qty) = shipment_qty` invariant, and **no** Marketplace-specific On-the-Way back-tracing through it. No substitute or renamed synonym table may be pre-built. *(Any future partial / split execution or actual-Marketplace allocation ledger is a **separate Canonical Design** that does not preselect a table name, schema or implementation.)*

**`factory_stock_allocation_plans`** *(planned future planning-layer table)* — `allocation_plan_id, plan_month, source_factory_warehouse_id, company, country, marketplace, warehouse_id, warehouse_code, sku, forecast_qty, forecast_share, allocated_factory_stock_qty, calculation_method, status, created_by, created_at, updated_by, updated_at, note`
- Planning snapshot only (see §9). Does **not** deduct `factory_stock`, transfer ownership, or create SO/PO/intercompany transactions.
- **`warehouse_id` meaning (user-confirmed, CANONICAL 2026-07-20):** on this table `warehouse_id` = **the SOURCE Factory Warehouse whose stock is being allocated**. It is **NOT** a destination / overseas / receiving / Marketplace warehouse. **Do NOT add `destination_warehouse_id` in this task.**
- **DB Mapping Gap:** this schema **also** lists `source_factory_warehouse_id`. If both physically exist, they must **not** be assigned two competing active meanings. **`warehouse_id` is the user-confirmed current source-factory identity;** `source_factory_warehouse_id` **requires a future migration/deprecation decision.** Do **not** rename or delete either column in this task. *(Note: on `shipments` — a different table — `factory_stock_allocation_plans.warehouse_id` here is that table's current source-factory identity, whereas `shipments.destination_warehouse_id` is the **sole canonical shipment destination** and `shipments.warehouse_id` is only the **destination compatibility mirror / read-fallback** (§11); the two tables use the name for different roles.)*

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
Execution Commit — Create Shipment Draft     (creates shipments + shipment_lines, shipments.status = draft; copy Execution Snapshot)
   NO reservation                            (the Approved-Plan → Draft handoff never reserves)
        ↓
Shipment Draft page fills formal shipment data (carrier, ETD/ETA, cartons, …)
Save / edit draft            → NO reservation (status stays draft / planned)
        ↓
Ready to Ship = Formal Shipment Execution Commit   → status: draft → ready_to_ship
   B-1 reserve trigger (owner §8A.1) — atomic with the status transition:
   factory_stock.fac_reserved_stock  ↑ (increases)   [factory-origin only; identity origin warehouse_id + sku]
   factory_stock.fac_current_stock   = unchanged (NOT decreased yet)
   FIFO PO allocation finalized (§6)
        ↓
Ship (Confirm & Ship)        → status = shipped
   factory_stock.fac_current_stock  ↓ (decreases)             [physical deduction — verified in code]
   factory_stock.fac_reserved_stock ↓ (consumed / released)   [Canonical intent; consumption writer NOT implemented — B-8]
        ↓
ETD or actual_departure_date reached   → status = in_transit
        ↓
Arrival / receiving process            → partial_received  or  completed
        ↓
Completed shipments remain searchable in Shipment Overview
```

**Cancelled shipments (release semantics are B-8 — BLOCKED, NOT canonical yet):**
- A cancel **should** release any held `fac_reserved_stock`, but the **release event / status mapping / movement literal is B-8 pending** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-8) — not a decided Runtime contract.
- **Must NOT deduct `fac_current_stock`.**
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
- **Forward canonical Shipment vocabulary (B-4 contract repair, 2026-08-01).** The active/forward canonical status set is **`draft · ready_to_ship · shipped · in_transit · arrived · received · closed · cancelled`**. The MVP "Status enum" line above is retained for legacy/display compatibility only. Token roles: **`planned`** = legacy/display-only, never a new Runtime write; **`completed`** = legacy/display compatibility, **not** the forward lifecycle terminal (the terminal is `closed`); **`partial_received`** is a **future receiving-Runtime projection token only** — owned by the receiving Runtime if/when built, **not currently implemented**; **`stuck`** is an operational alert/projection state, **not** a supply-qualification stage and **not** a Qualified Incoming allowlist token; **`delivered`** is an **event** meaning (`SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §5.4), **not** a Shipment-header lifecycle status. **Current source only writes the subset `draft → ready_to_ship → shipped → in_transit`; `arrived` / `received` / `closed` remain IMPLEMENTATION_REQUIRED** (not implemented — do not describe them as live).
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

**Required data before `ready_to_ship`:**
- **Destination** — must resolve to **exactly one Warehouse Master row** using §22.J precedence: (1) `shipments.destination_warehouse_id`; (2) compatibility `shipments.warehouse_id`; (3) legacy exact composite fallback **only when neither structured ID resolves**. **Once a structured ID resolves exactly one row, do NOT also require the legacy composite to resolve.** `warehouse_code` remains the destination display/external-code snapshot (never an identity).
- **Other required execution fields (unchanged):** `shipment_no` or `shipment_id`, `reference_id`, `carrier_id`, `shipping_method`, `etd`, `eta`, `carton_no_start`, `carton_no_end`, `shipment_qty`, `shipment_carton_qty`, `units_per_carton`.
- **Current Runtime limitation (explicit):** the current source achieves structured-ID resolution through the compatibility `shipments.warehouse_id` because canonical `shipments.destination_warehouse_id` persistence is **NOT IMPLEMENTED**. This is Current Runtime compatibility behavior, **not** the Target Canonical destination contract.

**Optional / later fields:**
`tracking_number`, `container_no`, `bl_no`, `invoice_no`, `actual_departure_date`, `actual_arrival_date`, `customs_clearance_date`, `delivered_date`, `freight_cost_actual`, `duty_actual`.

**Transitions from this page:**
- Save edited draft → `planned` (**no reserve**).
- Confirm / Ready to Ship → `ready_to_ship` — **Formal Shipment Execution Commit**: finalizes FIFO PO allocation (§6) and **reserves Factory Stock** (§7, factory-origin only; B-1). **Factory-stock deduction happens later at Ship (§8), NOT here.**

> **Page separation (FINAL) — Shipment Draft and Shipment Overview are TWO independent pages.** They **share** the `shipments` / `shipment_lines` DB and the card render helper, but each is its **own section, filter UI, init, and render** — there is **no shared view-mode flag and no shared filter DOM state** (switching between them cannot pollute the other's filter). Sections: **Shipment Draft → `#shipment-draft-section`** (compact **Country + Status** filter); **Shipment Overview → `#shippinghistory-section`** (full **Date / Country / SKU / Shipping Method / Search** bar). Frontend: `assets/html/pages/shipment-draft.html` + `shipping-history.html`; `assets/js/pages/shipping-history.js` hosts `initShipmentDraftPage` / `renderShipmentDraft` and `initShipmentOverviewPage` / `renderShipmentOverview`. (This supersedes the earlier single-page `mode` toggle.)

> **Ready to Create + Manual Consolidation (CANONICAL target — 2026-07-20; NOT IMPLEMENTED).** The Shipment Draft information architecture gains a leading state ahead of the three below: **1. Ready to Create → 2. Draft → 3. Ready to Ship → 4. Shipped.**
> - **Ready to Create** lists **Approved Weekly Plans not yet converted** to a shipment.
> - The system **computes exact consolidation candidates** and **presents suggested groups**, but **does NOT merge automatically**. The user explicitly chooses **Create Consolidated Shipment** or **Keep Separate**. V1 is **human-confirmed / semi-automatic**.
> - **Hard comparison keys (must match to be a candidate):** `company` · `country` · `ship_from` warehouse identity · destination `warehouse_id` OR same planning destination scope · `transit_type`/canonical method · `last_mile_delivery` · `customs_type` · compatible execution window. **Additional validation when available:** `carrier_id`, importer/exporter, consignee, currency/document scope, battery handling, magnet handling, special handling.
> - **Marketplace may differ ONLY where the destination operation is marketplace-independent (e.g. a shared 3PL).** **Amazon FBA must NOT be merged with Shopify/Walmart** merely because an address looks similar.
> - **Consolidated Shipment identity:** one canonical `shipment_id`; **multiple `shipment_plan_links`** (§2.A); source-Marketplace **list derived from the linked Plans**. **Do NOT write `marketplace = MULTI`** or any invented canonical value — `shipments.marketplace` stays a real single value (or the agreed convention), and true multi-marketplace provenance lives in the plan links. Shipment Overview, On the Way, Route, Events, Documents, and Warehouse Inbound all key on the **physical `shipment_id`**; the UI surfaces the linked Plans/Marketplaces for traceability.

> **Phase 2 implementation (current) — Shipment Draft = execution working area.** Menu: **Shipment Center → Weekly Shipping Plan / Shipment Draft / Shipment Overview**. The Shipment Draft page is a **three-section workspace** (only `hidden_from_draft_at IS NULL`):
> - **Draft** (`status = draft`) — freshly created from an Approved Weekly Shipping Plan; execution fields editable; **Save** (saves fields only, does NOT enter Overview) and **Ready to Ship →** (saves + `status = ready_to_ship`).
> - **Ready to Ship** (`status = ready_to_ship`) — still the Draft workspace; final pre-ship check; **Save** and **Ship 🚢** (validates required fields, then `status = shipped`).
> - **Shipped** (`status = shipped`) — officially shipped; fields read-only; **Done** button.
> - **Filter:** a compact top-right **Country + Status** filter (Status = All / Draft / Ready to Ship / Shipped). **No Marketplace, no Date / SKU / Shipping Method / Search** — the full filter bar belongs to Shipment Overview only.
> - **Card header (left):** Shipment No · Status · Plan id. **(right):** **Marketplace · Company · Country · Destination (`--` if blank) · Method · Pcs · ETD · ETA**.
> - **SKU Lines** (clean title, no long caption): SKU · Qty · Cartons · **CBM · Gross Wt · Net Wt · Carton No. Start · Carton No. End** (the CBM column is the **line total** `shipment_carton_cbm`), plus a **totals row** (Total SKU / Qty / Ctn. / **Total CBM = Σ shipment_carton_cbm** / Gross Wt / Net Wt). The frontend **never multiplies** the line CBM by cartons. **`carton_no_start` / `carton_no_end` are editable numeric inputs** (Draft / Ready to Ship); saved to `shipment_lines`.
>   - **Total SKU Rule (official — global):** the **Total SKU** figure (and any `shipments.total_sku` field) = **`COUNT(DISTINCT sku)`, NEVER `COUNT(rows)`**. Qty / Ctn. / CBM / weights remain summations; only the SKU **count** is distinct. Same rule across Request Order, Purchase Order, Weekly Shipping Plan, Shipment Overview — see `DATABASE_RELATIONSHIP_MAP.md` §7.5A.
> - **Execution Fields (clean 2-column form):** **Shipment ID (external, editable = `external_shipment_id`)**, Carrier (**read-only**), Reference ID, **Warehouse (Picker — see below)**, Tracking No, Booking No, Container No, BL No, Invoice No, ETD, ETA, **Remark**. The **internal `shipment_id` is shown read-only and never editable**. **Never editable:** the six-key context, `shipment_qty` / `shipment_carton_qty`, copied logistics + Decision Snapshot. **Remark mapping: the UI "Remark" field maps to `shipments.note`.**
>   - **Warehouse field semantics (three kinds — canonical, §22.0):**
>     - **Picker-controlled destination identity:** changed **only** through Warehouse Picker selection (choose one `warehouses` row); **NOT a free-text editable field**. The **canonical committed destination identity is `shipments.destination_warehouse_id`**; **`shipments.warehouse_id` is the destination compatibility mirror / read-fallback** the current Runtime writes. *(destination_warehouse_id canonical persistence is Target Canonical — NOT IMPLEMENTED, §22.0(L) / §23.8.)*
>     - **Derived display snapshot — `warehouse_code`:** **populated from the selected warehouse row** (external-code snapshot); it is **not** an independently editable free-text field — the Picker frontend (**CODE-COMPLETE**, §23.8) copies it from the chosen `warehouses` row. *(Backend compatibility acceptance SOURCE IMPLEMENTED; redeploy + live save/reload NOT VERIFIED; `destination_warehouse_id` canonical persistence NOT IMPLEMENTED.)*
>     - **Normal manually editable execution fields:** Reference ID, Tracking No, Booking No, Container No, BL No, Invoice No, ETD, ETA, Remark (free text / dates).
> - **Carton No. validation (§12):** integers only; `start ≤ end`; **ranges must not overlap within the same shipment**. On error the offending inputs get a red border + message, and **Save / Ready to Ship / Ship are blocked** (frontend + server-side in `updateShipment`).
> - **Save vs Ship (FINAL):** **Save** only updates execution fields — no history, no Overview, not a shipment. **Ship** requires status `shipped`, sets **`shipped_at` = now**, **`shipped_by` = `system_user`** placeholder, and only then does the shipment enter **Shipment Overview**.
> - **§5B — Required fields before Ship** (validated on the frontend AND server-side in `updateShipment`): **`external_shipment_id`, Carton No. Start, Carton No. End (every line), `reference_id`, `warehouse_code`, `etd`, `eta`** (and `shipment_total_qty > 0`). `tracking_number` / `booking_no` are **not** required at this phase. Missing → error, Ship blocked.
> - **Done (Shipped card):** writes **`hidden_from_draft_at` / `hidden_from_draft_by`** → the card leaves the **Shipment Draft** default view. It stays in **Shipment Overview**; status is unchanged; **no row is deleted**.
> - **Return to Draft (B-8 — BLOCKED, NOT canonical):** a **← Return to Draft** button may appear as a *visual placeholder* on **Ready to Ship** cards, but the **status transition it would perform (whether/how `ready_to_ship → draft`), the reserved-stock release it implies, the exact status mapping, and any writer / movement literal are NOT decided by B-1 — they remain BLOCKED under B-8** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-8). This round defines **no** canonical revert mapping and **no** reservation-release contract. See §12A.

---

## 5. Shipment Overview Page Spec

**Role:** the **official shipped / tracking / history view.** **Shipment Overview execution fields are read-only, but lifecycle actions are handler-driven action entries** (§5.1). "Read-only" describes the *execution fields* (no inline editing of identity/lines/route/carrier/dates); it does **not** mean the page is inert — defined lifecycle actions run through the canonical Shipment / Inbound Receipt handlers.

> **Phase 2 implementation (current).** Shipment Overview shows **only official records: `shipped` / `in_transit` / `arrived` / `received` / `closed`**. **`draft` / `ready_to_ship` are NOT shown** (they live in the Shipment Draft workspace) — so **Save never puts a shipment into Overview; only Ship does.** The card header shows **Marketplace** (Marketplace / Company / Country / Method / Pcs / Cartons / CBM / Gross / Net / ETD / ETA). **Execution fields are READ-ONLY on Overview.** A per-card "Advance →" button steps the post-ship lifecycle `shipped → in_transit → arrived → received → closed` (no factory-stock side effects) — it is a **lifecycle status action** (§5.1), not an inline field editor. `destination` is not shown yet (routing not finalized). **Overview is a SEPARATE page from Shipment Draft** (see the Page separation note in §4): it uses the **full filter bar (Date / Country / SKU / Shipping Method / Search)** and **never** the Draft page's compact Country + Status filter.

### 5.1 Read-Only Execution + Handler-Driven Lifecycle Actions (CANONICAL 2026-07-23 — shared by Shipment Overview and the Global 3D Shipment Map)

**Canonical rule:** *Shipment Overview execution fields are read-only, but lifecycle actions are handler-driven action entries.* Shipment Overview and the Global 3D Shipment Map (`GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md`) use the **same authority boundary** — both are read + action-orchestration surfaces, never a second Shipment mutation authority. (The **Shipment Draft** workspace, §4, is the separate pre-ship editing surface where execution fields are still editable up to Ship; §5.1 governs the post-ship Overview + Map only.)

**Read-only execution fields (no inline edit on Overview / Map):** `shipment_id`, `external_shipment_id`, shipment identity, `shipment_lines` (SKU / shipped qty / carton qty / package / content), origin warehouse, destination warehouse, `company`, `country`, `marketplace`, carrier, shipping method, tracking / reference, `etd`, `eta`, route assignment / route identity, document identity, and all other execution fields. These are displayed with read-only styling; the UI must never turn them into free text inputs / selects that save directly.

**Allowed lifecycle actions (the ONLY mutations reachable from Overview / Map this round):**
1. **Update Shipment Status** — advance the canonical lifecycle status (the `Advance →` action); via `updateShipment` (`status` field). Does **not** edit identity or lines.
2. **Record Shipment Event** — append one `shipment_events` row (never overwrite history). *(Event runtime is spec-only / P1-E.)*
3. **Advance / synchronize Route Progress** — the handler syncs the current route node / progress (and `actual_arrival_date` / `actual_departure_date` / node `status`) from the action/event; the UI never edits a runtime route row directly. *(Route runtime spec-only / P1-E.)*
4. **Confirm Arrival / Carrier Delivered** — records arrival status + a delivery event; **does not receive goods** (§H / boundary rule below).
5. **Open Inbound Receipt** — opens the formal receiving workflow (Overseas Inbound); opening ≠ received.
6. **Warehouse Receipt Confirmation** — only via the formal Inbound Receipt handler, and only when permission + lifecycle allow; this is the **only** path that confirms actual received qty and triggers overseas inventory movement.

**Explicitly NOT allowed from Overview / Map:** editing Shipment ID; editing shipment lines / content / SKU / quantity; editing origin/destination; free route editing; free carrier / tracking editing; direct `etd` / `eta` editing; direct inventory change; treating Carrier Delivered as Warehouse Received. (Broader edit capabilities — `shipment.update` free-field edit, `shipment.route.assign`, `shipment.reroute`, `shipment.eta.override`, `shipment.document.manage` — are **separate gated permissions, NOT default-open**, and are out of this round's allowed action scope.)

**Action → Handler → DB → Read-Model flow (identical on both surfaces):** user triggers a lifecycle action → calls the **canonical Shipment / Inbound Receipt handler** → handler validates permission + company/country scope + current lifecycle status + legal transition + version (optimistic concurrency) → updates `shipments` (status/metadata only; never identity/lines) and, per action type, appends `shipment_events` and/or syncs `shipment_routes` progress → writes audit → on success the surface **re-fetches its read model** and re-renders; on failure it preserves input, keeps the canonical (pre-action) state, and shows an actionable error. **No frontend optimistic display may pretend the DB was updated.** Not every status action rewrites all three tables — the affected tables are determined by action type + transition.

**Table-write relationship by action type (authority + contract only — no runtime this round):** `shipments` = update canonical lifecycle status + necessary current-status metadata; never Shipment identity or lines. `shipment_events` = append a new event (time / location / source / actor); never overwrite event history. `shipment_routes` = sync current node / route progress; only the handler may update `actual_arrival_date` / `actual_departure_date` / node `status`; the UI never edits a runtime route row. Which tables a given action touches is decided by the action type + lifecycle transition — do not assume every status action writes all three.

**Permissions (this round):** `shipment.view`, `shipment.status.update`, `shipment.event.create`, `inbound.receipt.open`, `inbound.receipt.confirm`, `shipment.audit.view`, `map.view`. A user without a given action permission still sees the read-only detail within scope, but the action is hidden or disabled with a reason; the API must re-validate permission (no client-side bypass).

**Audit / concurrency / validation:** every action stores actor, timestamp, `source_ui ∈ {shipment_overview, global_shipment_map}`, previous status, new status, and (where required) a note/reason; uses version check / optimistic concurrency and shows a **conflict** instead of silently overwriting a newer update; never bypasses the authoritative module's lifecycle validation. *(Note: `shipments` has no version/ETag column today — the optimistic-concurrency guard is a documented prerequisite, not yet implemented.)*

**Action UI states (minimum):** action available · unavailable due to lifecycle · permission denied · submitting · success · validation failure · handler failure · conflict / concurrent update · stale shipment data · refresh success · refresh failure · receipt already opened · receipt already confirmed. Execution fields keep read-only styling; lifecycle actions appear as button / action menu / confirmation modal / dedicated receipt workflow — never by converting a read-only field into an editable input.

**Inventory boundary (unbreakable):** Carrier Delivered ≠ Warehouse Received; Confirm Arrival ≠ Receipt Confirmation. A Delivered/Arrival event or status may update shipment status, route progress, event, actual arrival, current location, ETA/timeline, and delivery evidence — it must **never** increase overseas inventory, create an inventory movement, or close the inbound operation. Only the formal Inbound Receipt Confirmation handler confirms actual received qty (shortage/overage/damage) and creates the overseas inventory movement (`DATABASE_RELATIONSHIP_MAP.md` §6.0).

> **Canonical Runtime Mapping Sync is PAUSED** (pending `logistics_locations` finalization). This section defines the **authority + action contract only**; it does **not** implement handlers, DB migration, event projection, or location resolution. `shipment_events` / `shipment_routes` runtime remains **spec-only / P1-E** — see §18 and `SHIPMENT_ROUTE_AND_EVENT_SPEC.md`.

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

> **Allocation Persistence foundation.** Shipment allocation inherits the **Allocation Persistence Rules** (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §13 / `DATABASE_RELATIONSHIP_MAP.md` §7.5B): company-owned quantities are **company-based** (one company = one line/source), flow downstream **without ratio splitting**, and cancelled source rows are immutable. FIFO consumes company-owned committed quantities; it does **not** re-derive a proportional split.

> **Shipment = Execution Snapshot (reference only).** Per the **Global Snapshot Architecture Principle** + **Snapshot Completeness Principle** (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §14 / §14.1 · `DATABASE_RELATIONSHIP_MAP.md` §7.5C):
> - Shipment **never reads the Request Order directly** for execution truth.
> - Shipment **never recalculates allocation**.
> - Shipment **copies from PO / Shipping Plan execution snapshots** at execution commit and thereafter owns its own snapshot.
> - The PO **`request_bucket`** + **company allocation snapshot** (`purchase_order_lines.km_qty` / `resus_qty` / `restw_qty`, RO&PO §3.4) support **future shipment allocation**.
> - Master-data joins are **display-label only**. *(Reference note — Shipment spec is not otherwise changed by this task.)*

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

**Eligibility example (uncompleted PO — must NOT over-allocate). NOTE: this row shows a LEGACY / STALE `remaining_qty` value (10000) that does NOT match the Canonical formula `remaining_qty = MAX(completed_qty − shipped_qty, 0) = 5000`.** FIFO **must ignore the stale stored `remaining_qty`** and recompute `available_to_ship = completed_qty − shipped_qty`:
```
PO line:  ordered_qty 10000 | completed_qty 5000 | shipped_qty 0 | remaining_qty 10000 (STALE — canonical value is 5000)
available_to_ship = completed_qty − shipped_qty = 5000 − 0 = 5000
→ System may allocate at most 5000 from this line, NOT 10000,
  even though the stale stored remaining_qty reads 10000.
```
*(Canonical: `remaining_qty = MAX(completed_qty − shipped_qty, 0)` = available-to-ship. A row where `remaining_qty ≠ completed_qty − shipped_qty` is stale data — FIFO recomputes from `completed_qty − shipped_qty` and never trusts the stored value.)*

---

## 7. Factory Stock Reservation Design

> **B-1 Reserve Trigger (RESOLVED — owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1; decision only, NOT implemented).** The reserve event is the **successful Ready to Ship transition (`shipments.status: draft → ready_to_ship`) = Formal Shipment Execution Commit**. **Weekly Shipping Plan approval, the Approved-Plan → Create-Shipment-Draft handoff (Execution Commit), and interactive Draft create / save / edit all do NOT reserve.** Reservation applies **only** to a **factory-origin** shipment; identity = **`factory_stock.warehouse_id (= shipments.origin_warehouse_id) + sku`**, `warehouses.is_factory_warehouse = TRUE` (never `shipments.warehouse_id` / `destination_warehouse_id` / `warehouse_code` / `company` / `factory_name`). If the origin is an Overseas Warehouse, this section does **not** apply — see the Overseas Outbound Lock / `wh_reserved_stock` lifecycle (`OVERSEAS_OUTBOUND_SPEC.md`). Reserve and the existing **Ship deduction** (§8) stay separate events. This section describes the reserve *mechanics*; per the doc legend it remains **PLANNED / NOT IMPLEMENTED** (no reserve writer/trigger is live).

**At the Ready to Ship / Formal Shipment Execution Commit** (`draft → ready_to_ship`), atomically with the status transition (validate header/lines/carton/warehouse/allocation + Factory Stock applicability; on any failure the status must NOT enter `ready_to_ship` and NO partial reserve occurs):
- **Do NOT deduct `factory_stock.fac_current_stock`.**
- Reserve by **increasing `factory_stock.fac_reserved_stock`** (factory-origin only; identity above).
- Available stock = `fac_current_stock − fac_reserved_stock` (computed).
- The intended audit movement is `movement_type = stock_reserved` (`before/after_reserved_stock` change; `before/after_current_stock` unchanged), keyed `warehouse_id = origin_warehouse_id`, `sku`. **Movement literal / writer / idempotency key are NOT created this round.**

**Release on cancellation / return-to-draft / reject — B-8 (BLOCKED, NOT canonical):**
- A cancel before shipping **should** release the held `fac_reserved_stock` (never change `fac_current_stock`), but the **release event, exact status mapping, negative-delta mapping, and the `stock_reservation_released` writer are NOT decided by B-1 — they remain BLOCKED under B-8** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11 B-8). Do not treat any release/rollback mapping here as a decided Runtime contract.

---

## 8. Factory Stock Deduction Design

**At Ship (Confirm & Ship; `ready_to_ship → shipped` / dispatch) — NOT at the Ready to Ship reserve step:**
- `factory_stock.fac_current_stock` decreases by `shipment_lines.factory_stock_allocation_qty`, or by `shipment_qty` (legacy `qty` fallback) if allocation qty is blank. *(This `fac_current_stock` deduction at Confirm Shipment & Dispatch is the one **verified** factory-stock mutation in code.)*
- `factory_stock.fac_reserved_stock` is **consumed** by the same amount (the hold placed at Ready to Ship is drawn down). **Canonical intent only — the reserved-stock consumption writer is NOT implemented (no reserve is written today); its exact status/movement mapping is B-8.**
- Intended audit movement `movement_type = stock_shipped` (`before/after_current_stock` + `before/after_reserved_stock` recorded), keyed `warehouse_id = origin_warehouse_id`, `sku`.

> Reserve = Ready to Ship (§7); Deduct = Ship (this section). Two separate events. **Spec only — reserve + reserved-consumption not implemented; only the `fac_current_stock` deduction at Ship exists in code.**

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

- **Shipment-side Qualified Incoming allowlist (B-4 contract repair, 2026-08-01 — forward canonical vocabulary).** Shipment statuses **potentially eligible** for Qualified Incoming, subject to **all** other predicate gates (`SUPPLY_PLANNING_CALCULATION_RULES.md` §2E, esp. ETA ≤ Required-By): **`ready_to_ship`** (formal committed Shipment — counts only if ETA + all gates pass), **`shipped`** (physical dispatch confirmed — counts if timely), **`in_transit`** (counts if timely), **`arrived`** (Delivered-not-Received — **remains Incoming** until a confirmed Warehouse Receipt). **Excluded from Qualified Incoming:** `draft`, `received`, `closed`, `cancelled`, legacy `completed`, legacy `planned`, `stuck`, and the event token `delivered` when treated as a header status.
- *(Prior wording listed `ready_to_ship / in_transit / partial_received` off the legacy MVP enum; corrected here to the forward canonical vocabulary. `partial_received` is a not-yet-implemented receiving-Runtime projection, not a shipment on-the-way status.)*
- **`completed` / `received` / `closed` / `cancelled` must NOT count as on-the-way.**
- **This is the canonical contract direction; the Qualified-Incoming Runtime is NOT IMPLEMENTED** and must not be described as live behavior.
- On-the-way quantity source (canonical authority) = **`shipment_lines.shipment_qty`** *(legacy `qty` = read-fallback compatibility only; new Runtime must NOT use legacy `qty` as primary).* **Known defect:** `procurementOnTheWayMaps_` (`13_procurement_handlers.gs:432`) currently reads legacy `qty` (not `shipment_qty`), so new canonical shipment rows can read **0** — correction is **IMPLEMENTATION_REQUIRED** (not fixed in this documentation round).

---

## 11. Warehouse Relationship

- `shipments.destination_warehouse_id` = **the sole canonical destination endpoint** → `warehouses.warehouse_id` (Target Canonical; persistence NOT IMPLEMENTED — §22.0(L)/§23.8).
- `shipments.warehouse_id` = **destination compatibility mirror / read-fallback only** = system warehouse master id, e.g. `WH-RESUS-US-FBA-AMAZON` — **not** the canonical destination and **not** a competing endpoint.
- `shipments.warehouse_code` = **destination display / external-code snapshot** (FC / receiving), e.g. `ONT8`, `LGB8` — never an identity.
- **Do not confuse them.** **Factory/source warehouse identity is NEVER taken from the destination compatibility `warehouse_id`** — it is `shipments.origin_warehouse_id → warehouses.warehouse_id` (the B-1 factory-origin identity; `source_warehouse_id` remains a non-canonical Runtime gap). All factory metadata comes from `origin_warehouse_id → warehouses`, **not** `factory_name`.
- **Warehouse Master is independent shared master data — NOT owned by Shipment.** `warehouses` is the authoritative source for all warehouse address / contact / country / status details; a Shipment stores only the **selected identity** and must **not** duplicate warehouse address/contact fields into separate Shipment columns. The **canonical committed destination identity is `shipments.destination_warehouse_id`** (with `shipments.warehouse_id` as the destination compatibility mirror / read-fallback; `warehouse_code` is displayed but is **not globally unique** and is never an identity) — see §22.0(D)/(L).
- **Cardinality:** `warehouses` **1 → many** `shipments`. **Relationship key (canonical precedence — §22.J): (1) primary `shipments.destination_warehouse_id → warehouses.warehouse_id`; (2) compatibility fallback `shipments.warehouse_id → warehouses.warehouse_id` (destination compatibility / read-fallback only, until `destination_warehouse_id` is populated); (3) legacy exact composite fallback `shipments.company + destination country/scope + shipments.marketplace + shipments.warehouse_code` (exactly one row; ambiguous → validation error). Never `warehouse_code` alone; no first-row / cross-company fallback.**
- **Two distinct uses of the relationship (do not conflate):**
  - **Operational selection (Shipment Draft):** candidates resolve by `company + marketplace + warehouse_type + country scope` (§22.0(E)–(G)); the committed **destination** identity is **`shipments.destination_warehouse_id`** (Target Canonical; `shipments.warehouse_id` is the compatibility mirror; legacy runtime persists `warehouse_code` + the compatibility `warehouse_id`, `destination_warehouse_id` canonical persistence **not implemented** — §22.0(L) / §23.8). See **§22 / §22.0**.
  - **Document lookup (dataset build):** resolves the Warehouse Master row by the canonical precedence — **(1) `shipments.destination_warehouse_id`, (2) compatibility `shipments.warehouse_id` fallback, (3) legacy exact composite fallback** — to populate recipient/warehouse document fields — a **reference lookup at build time, NOT a Shipment snapshot** (values never copied onto `shipments`; the generated document is the immutable snapshot). See **§22.J**.

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

## 12A. Return to Draft / Revision Rule *(B-8 — BLOCKED, NOT canonical)*

> **B-8 (BLOCKED — NOT canonical).** Once a shipment is **Ready to Ship** (or **Shipped**), core data (SKUs, carrier, carton numbers) must **not** be edited freely in place. A revision path (revert to an editable state, re-edit, re-submit) is a *recognized need*, but its **exact status mapping (whether/how `ready_to_ship → draft`), the reserved-stock release it implies, the release / revision writer, the movement literal, and any revision-log schema are all part of B-8 (Cancellation / Rollback status mapping) and are NOT decided by B-1.** This section defines **no** canonical transition, **no** release event, **no** writer, and **no** table.

- **This phase:** a **← Return to Draft** button may appear as a *visual placeholder* on Ready to Ship cards (no permission gating, no decided behaviour). It does **not** constitute a canonical status transition or a reserved-stock release contract.
- Any `shipment_revision_log` table, its columns, and any `from_status → to_status` mapping remain **BLOCKED under B-8** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §11) — **not created and not specified here.**

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
12a. Ready to Ship (draft → ready_to_ship) = Formal Shipment Execution Commit: RESERVES factory stock
       (fac_reserved_stock; factory-origin only) + finalizes FIFO PO allocation; NO deduction here
12b. Ship (Confirm & Ship → shipped / dispatch): DEDUCTS factory_stock.fac_current_stock + CONSUMES
       fac_reserved_stock — FACTORY STOCK DEDUCTION HAPPENS HERE (a separate event from 12a)
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
- **Step 10 (Execution Commit — Create Shipment Draft):** approval **creates `shipments` + `shipment_lines` with `status = draft`** and performs **NO reservation and NO deduction** (§15.1 — this handoff is **NOT** the reserve trigger and must **not** be called "Formal Shipment Execution Commit"). The Shipment Draft **copies the header context from `shipping_plans`** — including **`shipping_plans.company` → `shipments.company`** (persisted execution snapshot; **never live-joined from `marketplaces`**, §2) — and **copies each line's Decision Snapshot into the line Execution Snapshot** (`snapshot_*`, §2 / ARCHITECTURE §4A). The Execution Layer **never recalculates** Current Stock / Avg Sales / Days of Supply / Suggested Qty / Target Days / FC / Event — all are copied. Once created, the Shipment reads **only** `shipments` / `shipment_lines` and no longer reads the Weekly Shipping Plan.
  - **Execution Commit Phase 1 (implemented):** Approve auto-creates the Shipment Draft (idempotent — one shipment per approved plan; an explicit `createShipmentFromPlan` action retries). Execution-layer fields (carrier / booking / container / BL / invoice / ETD / ETA / tracking / remark / status) are editable via `updateShipment`; the Execution Snapshot is immutable. **Factory-stock reservation (§15.1) is NOT performed in Phase 1** (deferred — out of this scope); no `factory_stock` / `factory_stock_movements` write occurs yet.
- **Steps 11–12 (two separate stock events, §15.1):** Shipment Draft completes formal data (no reserve, no deduct). **Step 12a — Ready to Ship (`draft → ready_to_ship`) = the B-1 reserve event:** reserves `fac_reserved_stock` (factory-origin only) and finalizes FIFO PO allocation (§6); **no `fac_current_stock` deduction.** **Step 12b — Ship (Confirm & Ship) = the physical deduction event:** deducts `fac_current_stock` and consumes `fac_reserved_stock`. Reserve = Ready to Ship; Deduct = Ship — never merged.
- **Steps 13–14:** documents are generated (§16) and, in MVP, manually emailed to factory/carrier.
- **Steps 15–18:** in-transit (future events/routes §18) → receiving (§17) → completed → searchable in Overview/History.

### 15.1 Factory Stock Reservation / Deduction Timing

This makes the reservation/deduction timing in §7/§8 **unambiguous across the full flow**:

- **Creating a Shipping Plan does NOT deduct `factory_stock.fac_current_stock`** and does NOT reserve.
- **Submitting a Weekly Shipping Plan does NOT deduct `factory_stock.fac_current_stock`** and does NOT reserve.
- **Execution Commit — Create Shipment Draft (Step 10)** — the Approved-Plan → Draft **handoff** that creates the `shipments` row at `status = draft`: performs, idempotently, (a) persist **`shipment_plan_links`** for every source plan (§2.A; header consolidation relationship, not an allocation axis — one link per plan, conflict if a plan is already linked to a different Shipment); (b) copy the Execution Snapshot (Marketplace / Site SKU / period planning context stays on `shipping_plan_lines`, read back via `shipment_plan_links` as original planning context — **there is NO Shipment-Line → Plan-Line allocation; `shipment_line_plan_allocations` is WITHDRAWN**, §2.A / B-3). **It performs NO reservation and NO deduction — it is NOT the reserve trigger and must not be called "Formal Shipment Execution Commit".**
- **Shipment Draft is `shipments.status = draft`; interactive Draft create / save / edit (§4 `updateShipment`) does NOT reserve and does NOT deduct.**
- **Ready to Ship (`draft → ready_to_ship`) = Formal Shipment Execution Commit — the B-1 reserve trigger** (owner `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A.1): atomically with the status transition it (a) finalizes eligible **PO-line** allocation (Supply axis — FIFO, §6); (b) for a **factory-origin** shipment **increases `factory_stock.fac_reserved_stock`** (identity `factory_stock.warehouse_id = shipments.origin_warehouse_id` + `sku`; overseas origin → `wh_reserved_stock`, not here), intended movement `stock_reserved`, `fac_current_stock` unchanged. **If validation / applicability / reserve fails, status must NOT enter `ready_to_ship` and NO partial reserve occurs. No `current_stock` deduction here.**
- **Ship (Confirm & Ship, Step 12) is the physical execution trigger:**
  - `factory_stock.fac_current_stock` **decreases** (verified in code).
  - `factory_stock.fac_reserved_stock` is **consumed** for the shipped allocation (Canonical intent; **consumption writer NOT implemented**).
  - intended `factory_stock_movements` `stock_shipped` movement, before/after for both balances, keyed `warehouse_id = origin_warehouse_id`, `sku`.
- **Cancel / return-to-draft / reject release of `reserved_stock`** (never touching `fac_current_stock`) **is B-8 (BLOCKED)** — the release event, status mapping, and `stock_reservation_released` writer are NOT decided by B-1.
- **`completed` / `cancelled` shipments must NOT count as on-the-way.**

> Consistent with §7 (reservation at the **Ready to Ship transition** — B-1 resolved, owner §8A.1; plan approval / Create-Draft / draft-edit do not reserve) and §8 (deduction at **Ship**). **Reserve = Ready to Ship; Deduct = Ship** — two separate events; the physical deduction moment is Confirm & Ship. Cancel/release mapping = B-8.

### 15.2 Shipment Draft Role

- **Shipment Draft is NOT a separate DB.**
- **Shipment Draft = records in `shipments` + `shipment_lines` where `shipments.status = draft`.**
- Shipment Draft is the **editable formal preparation view** after Weekly Shipping Plan approval.
- **Shipping Plan is the planning / approval layer**; **Shipment is the formal execution layer.**
- **Do NOT create `shipment_drafts` / `shipment_draft_lines` tables.**

### 15.3 Shipment CBM / Weight Calculation (FUTURE — basis defined, not implemented)

When CBM / weight is computed for `shipment_lines`, it uses the **carton** dimensions from `sku_details` (per `SKU_DETAILS_LOGISTICS_SPEC.md`) — **never the item `*_2` secondary size**:

```
per_carton_cbm = carton_length * carton_width * carton_height / 1,000,000   (when carton_dimension_unit = cm)
line_total_cbm  = per_carton_cbm * carton_qty          (the ONE multiplication — done upstream / at Commit)
shipping_plan_lines.carton_cbm = per_carton_cbm        (PLAN per-carton logistics input)
shipping_plan_lines.cbm        = line_total_cbm         (PLAN line-total Decision Snapshot)
shipment_lines.shipment_carton_cbm = line_total_cbm     (LINE-TOTAL — copied from plan `cbm`)
shipment_lines.gross_weight = carton_qty * carton_weight   (line total)
shipment_lines.net_weight   = qty * item_weight            (line total)
```

- **`shipment_lines.shipment_carton_cbm` = LINE-TOTAL CBM** (canonical; the former `carton_cbm` is retired to read-fallback). It is **NOT per-carton**. Header total CBM = **`Σ shipment_carton_cbm`** (summed directly — never re-multiplied by cartons).
- **CBM is based on carton dimensions only.** `item_length_2` / `item_width_2` / `item_height_2` do **not** participate in any logistics calculation (they are product-content display only).
- **Units are read, never hard-coded:** dimension unit from `carton_dimension_unit` (default `cm`); weight unit from `carton_weight_unit` / `item_weight_unit` (default `kg`). Non-cm / non-kg values require conversion (handled by the future engine).
- **Execution Commit COPIES, never recalculates.** The Execution Commit copies the plan's **line-total** `shipping_plan_lines.cbm` into `shipment_lines.shipment_carton_cbm` (fallback: per-carton `carton_cbm` — plan value or `sku_details` carton dims — **× `shipment_carton_qty`, multiplied exactly once**), and copies `gross_weight` / `net_weight` (line totals). The multiplication happens **once** upstream/at Commit — never again. The shipment header totals are summed:
  - `shipments.shipment_total_cbm = Σ shipment_lines.shipment_carton_cbm` *(direct sum; legacy per-carton `carton_cbm` converted once for historical rows only)*
  - `shipments.shipment_total_gross_weight = Σ shipment_lines.gross_weight` *(canonical; legacy `total_gross_weight` read-fallback only)*
  - `shipments.shipment_total_net_weight = Σ shipment_lines.net_weight` *(canonical; legacy `total_net_weight` read-fallback only)*
  The **Shipment header may store** these totals (unlike the Shipping Plan header, which keeps them Runtime). The formula above is the **definition** of how the plan values were produced; the Execution Layer **does not re-run it**.
- If a plan line has no logistics value (blank — e.g. `sku_details` missing carton dims), the copied value stays blank; no fabrication.

### 15.4 Shipment Estimated Duty / Tax (FUTURE — source + lookup defined, formula NOT invented)

Estimated duty/tax will source from the **Tax & Referral Rate Master** ([`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) — SSOT). **No landed-cost formula, FX conversion, or engine is defined here** (the Cost Analysis spec finalizes formulas later). Only the **inputs + lookup** are fixed:

- **Per shipment line:** (1) resolve SKU Series `shipment_lines.sku → sku_details.sku → sku_details.series`; (2) duty jurisdiction `shipments.country → tax_referral_rates.duty_country`; (3) resolve `country_of_origin` from the tax record's stored value + SKU/origin context (**do not assume permanent CN**; a controlled CN default only where an existing spec permits, documented); (4) choose the effective **parent** row for the calculation date; (5) load child `tax_rate_components` valid for the **same** date; (6) compute from `declared_value` × shipment quantity per the future costing formula; (7) aggregate line → shipment totals.
- **Calculation date priority (explicit):** (1) Shipment **ETD** if present; (2) Shipment creation/order calc date; (3) current date only as a last-resort **Draft** estimate. **Never** use the document-generation date as the historical tax date of an existing shipment.
- **Effective-date rule (from the SSOT):** `effective_from ≤ target AND (effective_to blank OR ≥ target)`; **blank `effective_to` = open-ended**; latest `effective_from` wins; ambiguous duplicates → conflict warning. Cost Analysis must preserve the matched `tax_rate_id` + component IDs + calculation date + currency + source values for historical audit (never re-query only the latest row without the transaction date).
- `shipments.duty_actual` (§0 header) remains the **post-invoice actual** — estimated tax never overwrites it.

### 15A. Shipping-service display name — RETIRED as a snapshot (SUPERSEDED 2026-07-28)

**This section's earlier requirement to snapshot `shipments.shipping_method_label` (and `shipments.shipments_customs_type_label`) is REVERSED by the 2026-07-28 Canonical Decision.** Those label columns are **RETIRED from the transaction DB** (`shipments` and `shipping_plans`). The **CODE fields are the sole SSOT**: `shipments.shipping_method` + `shipments.last_mile_delivery` + `shipments.shipments_customs_type` (canonical `shipping_method` / `last_mile_delivery` / `customs_type` on the plan).

- **No label is copied onto shipments/plans at creation** — the old copy/re-copy/freeze rules are removed.
- **Display text is resolved at RENDER time from the CODE** via the shared Code→Display resolver (`KM.display.shippingMethod` / `lastMileDelivery` / `customsType`; API also exposes non-persistent `shippingMethodDisplay` / `lastMileDeliveryDisplay` / `customsTypeDisplay`). Display source may come from a shared Enum Display Dictionary, `carrier_rate_cards` display metadata, or a future Code Dictionary table — **never written back to `shipments` / `shipping_plans`**.
- **`carrier_rate_cards.shipping_method_label` / `customs_type_label` are KEPT** (import display + Carrier page metadata + a resolver candidate source) but are **NEVER a matching / grouping / dedupe key** — matching uses CODE only.
- **Documents / Export** (`DOCUMENT_GENERATION_SYSTEM_SPEC.md`) resolve `{{SHIPPING_METHOD}}` / `{{SERVICE}}` / `{{CUSTOMS_TYPE}}` from the CODE at generation — they no longer read a stored label column.
- **Migration:** the four label columns are physically removed by header name via `retireShipmentLabelColumns` (backfill-safe; blocks + reports if a code cannot be safely recovered). Header Repair never re-creates them.

---

## 16. Shipment Document Generation

> **Generated documents are derived outputs, not source-of-truth records.** They are assembled from the authoritative shipment/PO/SKU/warehouse data; regenerating a document must not change underlying records.

> **Authoritative architecture: [`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](./DOCUMENT_GENERATION_SYSTEM_SPEC.md).** The earlier MVP two-table sketch is **superseded** by the shared three-table system — **`document_templates`** (registry), **`document_template_fields`** (placeholder mapping layer), **`generated_documents`** (output log). Do **not** maintain a separate shipment-only schema here; field/token definitions live in `document_template_fields`.
>
> - **Shipment Document Dataset → many templates → `generated_documents`** (§20): one shared dataset per shipment renders multiple document templates.
> - **Token-to-field mapping lives in `document_template_fields`** (per template, per placeholder — scalar vs collection per the Document Generation spec §E/§F).
> - Shipment documents use the **Shipment Snapshot only** — never live-read the Request Order, never recalculate allocation (Document Generation spec §I).
> - **Shipment Detail finalized mapping = Document Generation spec §I.1.** Output grain = **one row per shipment-line PO allocation** (`shipments → shipment_lines → shipment_line_allocations → purchase_order_lines → purchase_orders`); **a formal Shipment MUST have ≥ 1 valid PO allocation — no-allocation Shipment cannot be finalized / exported** (`PO_NO` required; `QTY` = `shipment_line_allocations.allocated_qty`, no `shipment_lines.shipment_qty` fallback). Header fields merge by `shipment_id`; SKU/carton physical fields merge by `shipment_line_id`; **`QTY` / `PO_NO` never merge** (one row per PO allocation). `{{SHIPPING_METHOD}}` reads the `shipments.shipping_method_label` snapshot (§15A). Collection controller `{{SHIPMENT_LINES}}` on template row 2, hidden column A.
> - **⚠ `shipment_line_allocations` = ENTIRELY PLANNED** (audited: no table headers / getter / writer / tab registration in `12_shipment_handlers.gs` or the adapter). The **current** model links a shipment line to ONE PO via **`shipment_lines.purchase_order_line_id`** (single link, existing column). The multi-PO allocation table + writer must be built before §I.1's per-allocation grain / `allocated_qty` is runnable; until then Shipment Detail is not generatable at the allocation grain.

**Document-type catalog** (`document_type`): `PURCHASE_ORDER`, `SHIPMENT_DETAIL_SHEET`, `CARRIER_BOOKING_FORM`, `COMMERCIAL_INVOICE`, `PACKING_LIST`, `COMMERCIAL_INVOICE_PACKING_COMBINED`, `CUSTOMS_DECLARATION`, `CERTIFICATE_OF_ORIGIN`, `MSDS`, `OTHER`. (Canonical enum: Document Generation spec §G.)

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
- customer order number (canonical `SHIPMENT_NO` = **`shipments.external_shipment_id`** → fallback `shipment_no` → `shipment_id`; §D of DOC GEN) · service / `shipping_method_label` · booking no (`shipments.booking_no`) · recipient name · recipient company · recipient address · recipient city · recipient postal code · recipient country code · PO number · carton count · battery flag · magnetic flag · customs declaration type (`shipments.shipments_customs_type`) · declaration currency · note (`shipments.note`).

**SKU / customs section:**
- cargo item number (e.g. external Shipment ID `SHIPMENT_NO` + six-digit sequence) · PO number · cargo weight KG · carton length / width / height CM · English product name · Chinese product name · declared unit value · per-carton declared quantity · HS / HTS code · model · material · product usage · sales link · battery flag · magnetic flag.

Likely sources: `shipments`, `shipment_lines`, `sku_details`, `marketplace_skus`, `purchase_orders`, `warehouses`, `tax_referral_rates`, `sku_regional_details`, carrier / shipping method, future template mapping.

> **Invoice tab = CONFIRMED MAPPING DRAFT (`DOCUMENT_GENERATION_SYSTEM_SPEC.md` §I.2).** The `carrier_booking_form` workbook is **ONE `document_templates` row with two tabs** (Invoice Import + Packing List Import). The **Invoice tab** header + line placeholder mappings and lookup rules are now recorded in DOC GEN §I.2 (warehouse recipient lookup — **DOC-GEN currently contains an older `warehouse_code`-only path; that path is a KNOWN EXTERNAL DOC-GEN RESIDUAL, is NOT the intended canonical lookup, and the intended precedence is owned by Shipment §22.J (destination_warehouse_id → compatibility warehouse_id → legacy exact composite; never `warehouse_code` alone). Actual DOC-GEN correction is OUT OF ROUND 5 SCOPE and `DOCUMENT_GENERATION_SYSTEM_SPEC.md` is not modified here**; tax row by `shipments.country → tax_referral_rates.duty_country` + effective date, latest `effective_from` wins; declared value / HS code by `series + duty_country + declared_currency? + effective date`, never by currency alone; `PRODUCT_URL` from `sku_regional_details` by `sku + company + country + marketplace`; `HAS_BATTERY`/`HAS_MAGNET` → `是`/`否`). Uses canonical `shipment_total_cartons` / `shipment_carton_qty`. **Packing List tab + full workbook are NOT finalized.** New `warehouses` columns (address / city / state / postal_code / contact_phone / contact_email / warehouse_code) are required before generation — see DOC GEN §I.2.7.

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

> **Field-level SSOT:** [`SHIPMENT_ROUTE_AND_EVENT_SPEC.md`](./SHIPMENT_ROUTE_AND_EVENT_SPEC.md) — the authoritative Domain Spec for `shipment_route_templates` (route header), `shipment_route_template_nodes` (ordered stages), `shipment_routes` (per-shipment **route-version** snapshot), optional `shipment_route_nodes` (per-shipment node snapshot), and `shipment_events` (append-only actual ledger), including matching, generation flow, event flow, and progress projection. This section keeps only the **Phase-1 authority / non-blocking** rules; **field schemas live in that spec** (not duplicated here).
>
> **Status (2026-07-22):** `shipment_route_templates` + `shipment_route_template_nodes` are **Reference DBs manually completed by the user** (read-only synced; not recreated). `shipment_routes` / `shipment_route_nodes` / `shipment_events` are **spec-only / NOT implemented** — Runtime build = Phase-1 **P1-E**. `default_offset_days` = **cumulative days from route start** (SSOT §4.B). `shipment_routes` is now a **per-shipment route-VERSION header** (one is_current; supersedes lineage on reroute), not one-row-per-node.

- **Shipment Overview, On The Way, and World Map still read `shipments` + `shipment_lines` as the authoritative shipment records.**
- **`shipment_events` and `shipment_routes` are future detail / enrichment tables** — they **must NOT replace** `shipments` / `shipment_lines`.
- **`shipment_routes`** may support: `origin`, `destination`, route points, carrier route, map visualization. **`shipment_routes` = planned route nodes** (the intended path, e.g. Factory → export customs → ocean leg → destination port → FC).

### 18.0 `shipment_routes` role & phasing

- **`shipment_routes` are planned route nodes** — the intended path a shipment is expected to travel.
- **They must NOT be required per shipment.** No shipment needs a hand-built route to be created, shipped, or settled (see "No route or event is required to Ship" above).
- **Now (pre-P1-E): not enforced.** `shipment_routes` are optional and are not generated or required. Overview / On The Way / World Map continue to work from `shipments` + `shipment_lines` alone.
- **P1-E: auto-generated from the (now-completed) `shipment_route_templates` Reference DB.** The Template + Template-Node Reference DBs are **manually completed by the user**, so route generation can proceed when P1-E is built: match a template (§SSOT §3) → copy into a per-shipment `shipment_routes` **version** snapshot (+ optional `shipment_route_nodes`) with planned dates = `ETD + cumulative default_offset_days` — no manual node entry. Templates are the source; `shipment_routes` are the per-shipment snapshot; template edits never rewrite existing snapshots.
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

**Field-level schema (all four tables — route templates, template nodes, `shipment_routes`, `shipment_events`): [`SHIPMENT_ROUTE_AND_EVENT_SPEC.md`](./SHIPMENT_ROUTE_AND_EVENT_SPEC.md) §5.** `shipment_events` is an **append-only** ledger; current position/progress is **derived from the latest valid events** (not a stored current-state row). Route Templates resolve `destination_region` from the existing **`warehouses.logistics_region`** field. Exact schema is future work — the Domain Spec is the reserved definition.

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
  - It does **NOT** deduct `factory_stock.fac_current_stock`.
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

### 19.2 Shipment Plan Quantity Limit — V1 canonical (CORRECTED 2026-07-20)

> **Superseded:** the earlier rule that a site's shipment quantity **cannot exceed its FC-Share allocation unless a Reallocation is approved** is **NOT the V1 rule.** FC Share allocation is a **recommendation, not a hard entitlement.**

**V1 canonical rules:**
- **`factory_stock` is the physical inventory SSOT;** `factory_stock_allocation_plans` / FC Share is **planning/reference only**.
- **Same-company site adjustments require NO approval.** **Cross-company** coordination is handled **operationally** by internal teams during V1.
- **No Allocation approval UI / status / workflow / runtime is enabled in V1** (the strict entitlement + `manager_approval_required` / `COO_approval_required` reallocation model is **FUTURE / NOT IMPLEMENTED**, §19.3).
- **Shipment execution is NOT blocked merely because a site exceeds its recommended FC Share.**

**V1 hard PHYSICAL gate (the only enforced limit):**
```
Existing Active Reservations + New Reservation  <=  factory_stock.fac_current_stock
  ⟺  New Reservation  <=  MAX(factory_stock.fac_current_stock − factory_stock.fac_reserved_stock, 0)
```
- Physical `current_stock`, `reserved_stock`, and available stock **may never go negative.**
- A **planning variance** may display **Over Allocation / Borrowed Allocation / Negative Planning Balance**, but these are analysis-only and **must never write negative physical inventory.**
- **Physical stock deduction still happens only at Confirm & Ship** (§15.1).

**Example:**
```
Factory current_stock for SKU A = 10,000 ; reserved_stock = 2,000
Recommended FC-Share display:  KM US 4,000 · ResUS US 3,000 · ResTW CA 3,000
→ KM US MAY plan/reserve more than its 4,000 recommendation (no approval, no block).
→ The ONLY hard limit: total reservations ≤ 10,000 (available = 8,000 remaining).
```

### 19.3 Cross-site / Cross-company Borrowing *(FUTURE / NOT IMPLEMENTED)*

> The strict entitlement + approval model below is **FUTURE / NOT IMPLEMENTED** and is **not** the V1 rule (see §19.2). In V1, cross-company use is coordinated operationally and needs no approval; only the physical gate applies.

- Some sites may **not need their full recommended factory-stock share**; another site/company with a shortage may use the unused pool.
- **This is a planning exception, not ownership / accounting.**
- Future rules **may** support: `borrow_from_low_risk_site`, `manual_override`, `manager_approval_required`, `COO_approval_required`, `reallocation_reason`. **Do not implement now.**
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
`shipment_id`, `shipment_no`, `reference_id`, `fba_shipment_id`, `invoice_no`, `invoice_date`, `carrier_id`, `shipping_method`, `last_mile_delivery`, **`shipping_method_label`**, **`shipments_customs_type`**, **`shipments_customs_type_label`**, `etd`, `eta`, `warehouse_code`, `destination_warehouse`, `ship_to`, `ship_from`, `currency`.

> **Shipping service display name = `shipments.shipping_method_label` (snapshot).** Shipment Detail (and every shipment document) MUST read the localized service name from **`shipments.shipping_method_label`** — do **NOT** reconstruct it from `shipping_method` / `last_mile_delivery` at generation time. The label was copied from the Carrier Rate Card at Shipment creation and frozen (§15A); documents therefore stay historically correct even if the rate card later changes. Only when `shipping_method_label` is blank (legacy shipments) does the runtime fall back to `shipping_method + '_' + last_mile_delivery`.

**Line fields:**
`sku`, `product_name_en`, `product_name_cn`, `shipment_qty`, `shipment_carton_qty`, `carton_no_start`, `carton_no_end`, `gross_weight`, `net_weight`, `cbm`, `carton_length`, `carton_width`, `carton_height`, `declared_unit_value`, `amount`, `hs_code` / `hts_code`, `material`, `usage`, `model`, `country_of_origin`, `sales_link`, `battery_flag`, `magnetic_flag`, `po_no`. *(`shipment_qty` / `shipment_carton_qty` are the canonical line quantity columns — legacy `qty` / `carton_qty` read-fallback only. **Shipment-line-grain docs (e.g. carrier packing-list tab) use `shipment_qty`; the finalized Shipment Detail allocation grain still uses `shipment_line_allocations.allocated_qty`** once that table exists — DOC GEN §I.1.3.) `product_name_cn` sourced from `sku_details.product_name_cn`; `usage` from `sku_details.product_use`; `sales_link` from `sku_regional_details.product_url`.*

**Total fields:**
`shipment_total_qty`, `shipment_total_cartons`, `shipment_total_gross_weight`, `shipment_total_net_weight`, `shipment_total_cbm`, `total_amount`. *(canonical renamed totals — legacy `total_qty` / `total_cartons` / `total_cbm` / `total_gross_weight` / `total_net_weight` read-fallback only. Packing-list footer: `TOTAL_QTY→shipment_total_qty`, `TOTAL_GROSS_WEIGHT→shipment_total_gross_weight`, `TOTAL_NET_WEIGHT→shipment_total_net_weight`.)*

**Notes:**
- **Exact token-to-dataset mapping belongs to the future Export Center / Mapping Spec.**
- **`country_of_origin`** may require **SKU Details or a future customs / product master** (no schema added now — see Open Items).
- **The Shipment Document Dataset is a generated runtime / mapping concept, not necessarily a DB table in MVP.**
- **Do not add DB schema now** unless a future Mapping Spec requires it.

---

## 21. Shipment Logistics Attribute Aggregation (FINALIZED — SPEC ONLY)

Shipment-level logistics attributes are **automatically calculated from the shipment's lines and are NOT user-overridable.** They are the values the future Carrier Price Engine matches on (`CARRIER_AND_ROUTE_SPEC.md` §4 matching / §4.5 enums) — **carrier matching always uses the shipment-level aggregate, never an individual SKU's value.**

Each `shipment_lines.sku` resolves its per-SKU logistics attributes from `sku_details` (`battery_type`, `magnet_type` — Global Logistics Enums, `CARRIER_AND_ROUTE_SPEC.md` §4.5). The shipment header then aggregates:

### 21.1 Battery Rule

- **`shipments.battery_flag` = TRUE** if **ANY** line's SKU has `battery_type != no_battery`; otherwise FALSE.
- **`shipments.battery_type` = the highest logistics level present** across all lines, by priority:

  `rechargeable_lithium` (3) > `lithium_battery` (2) > `alkaline_battery` (1) > `no_battery` (0)

  (When `battery_flag` is FALSE — every line is `no_battery` — `battery_type` = `no_battery`.)

### 21.2 Magnet Rule

- **`shipments.magnet_flag` = TRUE** if **ANY** line's SKU has `magnet_type = magnetic`; otherwise FALSE.

### 21.3 Rules & Provenance

- **Auto-calculated, read-only.** The UI never lets a user set `battery_flag` / `battery_type` / `magnet_flag` directly — they derive from the lines. (Consistent with the Execution-Snapshot principle: the shipment records what its lines contain.)
- **Recompute basis:** derived from the shipment's lines at Execution Commit (and re-derived if lines change while still editable). No manual override path exists.
- **Carrier matching** consumes `shipments.battery_type` (highest level) and `shipments.magnet_flag` — **not** per-SKU values (`CARRIER_AND_ROUTE_SPEC.md` §4: destination → `battery_type` → `customs_type` → `transit_type` → `last_mile_delivery`). The shipment-level customs attribute is stored on the header as **`shipments_customs_type`** (canonical; legacy `customs_type` read-fallback); `transit_type` / `last_mile_delivery` are the other shipment-level route/handling attributes (from the plan / routing).
- **Enum source of truth:** `battery_type` / `magnet_type` values follow the Global Logistics Enums (`CARRIER_AND_ROUTE_SPEC.md` §4.5). DB stores English enums; UI may localize.
- **No engine, no code, no migration in this spec** — the header columns (§0) are **planned** additions; aggregation is defined here for the future Carrier Price Engine + Shipment execution layer.

---

## 22. Shipment Draft → Warehouse Selection Flow (FINALIZED — SPEC ONLY)

**Status: architecture finalized; picker frontend implemented 2026-07-21 (live verification pending), broader endpoint runtime NOT implemented.** See **§23 (canonical 2026-07-21)** for the endpoint identity model (`origin_warehouse_id` / `destination_warehouse_id`, `warehouse_id`/`warehouse_code` as transitional compatibility), plan→shipment transfer mapping, managed-overseas detection, auto-create/link, and validation gates — §23 supersedes any conflicting endpoint wording below. Warehouse Master (`warehouses`, §2) is the authoritative operational master. This section defines how the Shipment Draft **selects** that reference and how documents **resolve** it. **§22.0 (2026-07 refinement) is canonical and supersedes the country-only wording in §22.B/§22.D and the "committed identity = warehouse_code" wording where they differ.**

### 22.0 Warehouse Picker — Canonical Semantics & Candidate Filtering (2026-07 refinement — SPEC ONLY)

> **Warehouse Picker status (component-level — canonical matrix §23.8):** frontend **CODE-COMPLETE** 2026-07-21 in `shipping-history.js` (`warehouseFld()` / `shWarehousePick()`), replacing the free-text `warehouse_code` input with a grouped FBA→3PL `warehouse_id` selector that copies `warehouse_code` from the chosen row and persists the **compatibility** `warehouse_id` + `warehouse_code` (destination mirror — **NOT** the canonical `destination_warehouse_id`, whose persistence is **NOT IMPLEMENTED**). Backend **SOURCE IMPLEMENTED**: `normalizeWarehouseRecord` extended (`warehouse_code` / `warehouse_owner` / `is_active` / `is_factory_warehouse` / `logistics_region` / `city` / `state`); `12_shipment_handlers.gs` `SHIPMENT_EDITABLE_FIELDS_` accepts the compatibility `warehouse_id`. **REDEPLOY PENDING + live verification NOT VERIFIED:** the `warehouses` master must actually carry these columns (live GET), `12_shipment_handlers.gs` must be redeployed, and a live save/reload smoke test must pass. **Legacy aggregate migration: NOT EXECUTED. Warehouse DB rows: already populated externally by the user. Inventory Runtime + Overseas Inbound Runtime: unchanged.**

**(A) `warehouses` is a passive Reference Master.** It stores location/reference truth only — internal identity, external code, operating company context, physical operator/owner, warehouse type, physical country, marketplace context, logistics region, address, active state. It may be **read** by Shipment Draft destination selection, Warehouse Lookup, Route Template / Shipment Route initialization, shipment map points, Document Generation address lookup, Overseas Inbound destination selection, and Receiving destination selection. It must **NOT automatically** create/split/move/allocate inventory, update `overseas_inventory_snapshot` / `overseas_inventory_movements`, or create Shipment Events / Shipment Routes / Warehouse Receipts.

**(B) Inventory source separation (no FC-level inference).** Amazon FBA inventory remains **report-driven**, resolved by `company + marketplace/site + country + SKU/marketplace SKU`. The existence of physical FBA warehouse rows does **not** mean the system knows inventory by FC. Unless a future Amazon report provides FC-level inventory, overseas inventory must **not** be distributed across physical FBA warehouse rows. `warehouses` = location/reference truth; `overseas_inventory_snapshot` = imported inventory truth — **separate concerns; do not infer FC-level inventory from `warehouses`.**

**(C) `company` vs `warehouse_owner` (distinct dimensions).** `company` = the KM legal/business/account context **using** the warehouse (`KM` / `ResUS` / `ResTW`); it determines whose shipment / inventory context / marketplace account / transaction uses the warehouse. **Country alone must not determine `company`** — US contains both `KM` and `ResUS`, so site/account context must participate. `warehouse_owner` = the physical warehouse **operator / controlling logistics party** (e.g. `Amazon` for FBA, `WINIT`, `AMZLGS`, `ResTW` for an owned factory). Example: `WH-RESUS-US-FBA-ONT8` → `company = ResUS`, `warehouse_owner = Amazon`; `WH-KM-US-FBA-ONT8` → `company = KM`, `warehouse_owner = Amazon`. **Do not redefine `warehouse_owner` as the inventory-owning company.**

**(D) The warehouse MASTER row identity is `warehouses.warehouse_id`; the committed shipment DESTINATION identity is `shipments.destination_warehouse_id` (with `shipments.warehouse_id` as the compatibility mirror); `warehouse_code` is NOT globally unique.** `warehouses.warehouse_id` is the system-unique internal master identifier; `warehouse_code` is the external/operator code and **may repeat across companies** (e.g. `ONT8` under both `WH-RESUS-US-FBA-ONT8` and `WH-KM-US-FBA-ONT8`). The UI **displays** `warehouse_code` (+ location); the **committed destination endpoint is `shipments.destination_warehouse_id`, with `shipments.warehouse_id` as the destination compatibility mirror / read-fallback** (both resolve to a `warehouses.warehouse_id` master row). Any logical uniqueness is either `warehouses.warehouse_id`, or the composite `company + country + marketplace context + warehouse_code` — **never `warehouse_code` alone.** *(No DB constraint is added by this task.)*

**(E) Picker trigger / resolution order.** `Site / Marketplace Account → Company → Marketplace → Shipment Destination Country / Country Scope → Destination Warehouse Type → Active Warehouse Candidates → Selected warehouse_id`. Site/account selection derives or confirms `company`, `marketplace`, and the business destination country/site context. **Country alone is insufficient to derive `company`.**

**(F) Standard FBA candidate filter.** `is_active = TRUE AND company = resolved_company AND warehouse_type = 'FBA' AND marketplace = 'Amazon' AND warehouse country matches the resolved destination-country scope`. Both ResUS-US and KM-US may display `ONT8`, but they resolve to **different `warehouse_id`** values.

**(G) 3PL exception group (marketplace-independent).** A 3PL warehouse may have `marketplace = NULL/blank`. 3PL candidates: `is_active = TRUE AND company = resolved_company AND country = resolved destination country/scope AND warehouse_type = '3PL'` — **do not require `marketplace = Amazon` for 3PL rows.** For an Amazon-context shipment the UI may show two groups: **Amazon FBA** (physical FBA warehouses) and **Overseas 3PL** (same-company, same-country active 3PL). **RETURN** warehouses appear only in a Return-specific flow (never normal FBA/3PL destination selection); **FACTORY** rows never appear as overseas destination candidates.

**(H) UI grouping & sorting (Warehouse Picker — frontend CODE-COMPLETE; §23.8).** Grouped, human-readable options (e.g. `Amazon FBA` → `ONT8 — Moreno Valley, CA`; `Overseas 3PL` → `WINIT US — US East`); display shows `warehouse_code` + location; the Picker option value identifies one `warehouses.warehouse_id` Master row. **Current Runtime:** selected Master ID → compatibility `shipments.warehouse_id`. **Target canonical:** selected Master ID → `shipments.destination_warehouse_id` plus the compatibility `warehouse_id` and the `warehouse_code` snapshot (`destination_warehouse_id` canonical persistence **NOT IMPLEMENTED** — §23.8). Deterministic order: `warehouse_type` group → `logistics_region` → `warehouse_code`; recommended group order **FBA → 3PL** (RETURN only in Return flow; FACTORY only in factory-origin contexts).

**(I) EU / Pan-EU country scope.** Physical EU FBA rows use their **actual** warehouse country (`DE`/`FR`/`ES`/`IT`/`PL`/`CZ`/`SE`); the business may still use **EU** as an umbrella site/country context. Keep the distinction: *business site context = EU* vs *physical warehouse country = actual country*. For an EU umbrella shipment, FBA candidates may resolve from the configured EU FBA country set or canonical EU logistics-region membership; 3PL aggregate rows may still use `country = EU`. **Do not equate a physical DE/FR/PL FBA warehouse with `country = EU`, and do not invent a second country field.** *If no canonical EU country-scope resolver exists yet, that is an implementation prerequisite / open mapping item.*

**(J) Legacy aggregate warehouses (transitional — preserve).** The country-level aggregate rows — `WH-RESUS-US-FBA-AMAZON`, `WH-KM-US-FBA-AMAZON`, `WH-RESTW-CA-FBA-AMAZON`, `WH-RESTW-JP-FBA-AMAZON`, `WH-RESTW-UK-FBA-AMAZON`, `WH-RESTW-EU-FBA-AMAZON`, `WH-RESTW-AU-FBA-AMAZON`, `WH-RESTW-SG-FBA-AMAZON` — are **legacy transitional records. Keep them; do not delete or migrate them in this task.** The **Warehouse Picker frontend is already CODE-COMPLETE** (§23.8). Legacy aggregate reference verification must occur **before** any of: (a) deactivating any aggregate row; (b) completing production / live acceptance; (c) enabling new transactions to rely exclusively on physical rows. That verification checks whether any runtime/transaction references these aggregate `warehouse_id` values; **after** verification mark them **inactive** (not hard-delete); inactive legacy rows must remain **resolvable for historical records**; new transactions must use physical `warehouse_id` rows. **Do NOT** use string-pattern exclusions (`warehouse_id LIKE '%FBA-AMAZON'`) or note-text detection. **Legacy aggregate migration remains NOT EXECUTED** — this task neither executes nor defines the migration.

**(K) Empty result.** If no matching warehouse exists: **do not** silently fall back to another company, another country, or a legacy aggregate row; show **"No eligible warehouse found"**; authorized master-data correction / explicit exception handling is a later concern.

**(L) Persistence boundary + DB Mapping Gap.**
- **Identity persistence.** UI **displays** `warehouse_code`; the **canonical committed destination identity is `shipments.destination_warehouse_id`** (with `shipments.warehouse_id` as the compatibility mirror). *Target Canonical:* on Warehouse Picker Save the system **MUST persist** the canonical `shipments.destination_warehouse_id`, plus the compatibility `shipments.warehouse_id` mirror and the `shipments.warehouse_code` display snapshot (external/display code copied from the selected row). *Current Runtime (LEGACY):* persists/relies on `shipments.warehouse_code` (+ the compatibility `shipments.warehouse_id`); **`shipments.destination_warehouse_id` canonical persistence is NOT IMPLEMENTED**. **The target runtime is NOT IMPLEMENTED and is not claimed complete.**
- **Address is NOT snapshotted onto the Shipment today (reconciliation).** Target canonical reference = `shipments.destination_warehouse_id`; current Runtime compatibility reference = `shipments.warehouse_id`. **The unresolved gap is `destination_warehouse_id` canonical persistence, not `warehouse_id` population.** **Warehouse address stays Reference Master data** and is **read from `warehouses`** for display in Draft. There are **no complete shipment warehouse-address snapshot fields** in the current schema — **do not claim Shipment address-snapshot persistence exists.** Document Generation resolves Warehouse Reference fields **at generation time** per `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §P.6/§P.7 + `document_template_fields`; the **generated document is the immutable snapshot**, and later Warehouse Master edits **never mutate an already-generated document**. A dedicated Shipment Address Snapshot is **FUTURE / REQUIRES DB DESIGN** (no fields added in this task).
- **DB Mapping Gap.** Committing `shipments.destination_warehouse_id` as the canonical destination identity (with `shipments.warehouse_id` as the compatibility mirror) **requires closing this gap before target canonical destination persistence and full end-to-end Runtime acceptance** (the Warehouse Picker frontend is already CODE-COMPLETE — §23.8; what is gated is the canonical `destination_warehouse_id` persistence + live verification, not the picker's implementation). Interim precedence until then (§22.J): (1) `destination_warehouse_id`, (2) compatibility `warehouse_id`, (3) legacy exact composite `company + destination country/scope + marketplace + warehouse_code` (must resolve exactly one row).

### 22.A Architecture Position

- **Warehouse Master (`warehouses`) is the single source of truth** for: `warehouse_code`, `warehouse_name`, `country`, `state`, `city`, `address`, `postal_code`, `contact_phone`, `contact_email`, and warehouse status / availability (`is_active`, `is_factory_warehouse`, proposed `is_selectable_for_shipment`).
- **Shipment stores only the reference** (not duplicated address/contact fields). Per §22.0(D)/(L) the **canonical committed destination identity is `shipments.destination_warehouse_id`** (with `shipments.warehouse_id` as the compatibility mirror); `warehouse_code` is displayed but is **not globally unique** and is insufficient alone (composite resolution / DB Mapping Gap — §22.0(L)).
- **Document Dataset resolves warehouse details by reference lookup at build time** — **not** a Shipment snapshot (§22.J). *(Resolution precedence (§22.J): (1) `shipments.destination_warehouse_id → warehouses.warehouse_id`; (2) compatibility `shipments.warehouse_id → warehouses.warehouse_id`; (3) legacy exact composite fallback `company + destination country/scope + marketplace + warehouse_code`. The legacy composite runs **only when** the preceding structured-ID lookups cannot resolve.)*

### 22.B Shipment Draft Warehouse Selection Flow

> **Refined by §22.0 (canonical):** filtering is **not country-only** — it resolves `Site → Company → Marketplace → Country Scope → Type → warehouse_id` (§22.0(E)) with company + marketplace + warehouse_type participating (§22.0(F)/(G)). The country-only steps below are the earlier simplified form, retained for history and superseded where they differ.

1. The Shipment already has (or the user sets) `shipments.country` (and, per §22.0, the resolved `company` / `marketplace` / country scope).
2. Shipment Draft loads eligible Warehouse Master records. Conceptual filter (see §22.0(F)/(G) for the canonical company/type/marketplace-aware form):
   ```
   warehouse is active
   AND warehouses.company = resolved_company
   AND warehouse_type ∈ {FBA (+ marketplace=Amazon), 3PL}
   AND warehouse country matches the resolved destination-country scope (§22.0(I) for EU)
   ```
3. **Warehouse Code is a searchable dropdown/select control — NOT unrestricted free text.**
4. The dropdown lists **only** warehouses relevant to the Shipment country (never the full global list).
5. **Recommended option display:** `{warehouse_code} — {warehouse_name} — {city/state}`
   e.g. `PSC2 — Amazon Fulfillment Center — Pasco, WA`.
6. Selecting a warehouse writes **`shipments.warehouse_code`** (only the code; details are not copied).
7. Warehouse details shown elsewhere in the Shipment UI are **resolved from Warehouse Master and are not independently editable inside Shipment Draft.**

### 22.C UI / UX Specification

| Aspect | Behavior |
|---|---|
| Label | **Warehouse Code** |
| Control | searchable dropdown / select |
| Option source | eligible Warehouse Master records for `shipments.country` (§22.D, §22.G) |
| Dropdown footer / action | **+ Add New Warehouse** (§22.F) |
| Loading state | `Loading warehouses…` |
| No country selected | disabled, or `Select a country first.` — **do not load the full global list** |
| No eligible match | `No active warehouse is available for this country.` + **+ Add New Warehouse** |
| After a new warehouse is saved | refresh country-filtered options → auto-select the new record → show its name/address summary → mark the Draft as changed/unsaved per current page behavior |

This does **not** redesign the whole Shipment Draft page — only the Warehouse Code field behavior.

### 22.D Country Matching Rule

- Filtering uses **canonical country comparison:** `normalize_country(shipments.country) = normalize_country(warehouses.country)`.
- If both tables already store ISO alpha-2 codes, **direct comparison is allowed** (`US = US`, `GB = GB`, `JP = JP`).
- If legacy Warehouse rows store full names / aliases, `normalize_country` maps them through the controlled dictionary (`United States / USA / US → US`; `United Kingdom / UK / GB → GB`; `Japan / JP → JP`). This shares the alias dictionary with `country_to_iso2` (§22.L).
- **No partial-string matching.** **Never** show all warehouses when a country-specific match is available.

### 22.E Empty-State Behavior

- **Shipment country blank:** the Warehouse selector is disabled / shows `Select a country first.`; the full global Warehouse list is **not** loaded.
- **Country populated but no eligible warehouse:** show the explicit empty state `No active warehouse is available for this country.` with a **+ Add New Warehouse** action. **Never** silently permit arbitrary warehouse-code entry.

### 22.F Add New Warehouse Flow

The Warehouse selector includes a visible **+ Add New Warehouse** action that opens the Warehouse Master create flow/modal (runtime deferred — §22 non-goals).

**Minimum fields:** `warehouse_code`, `warehouse_name`, `country`, `state`, `city`, `address`, `postal_code`, `contact_phone`, `contact_email`, `status` / `is_active`, and the shipment-selection eligibility field (§22.G) if adopted.

**`warehouse_code` uniqueness (canonical):**
- **`warehouse_id` is globally unique.**
- **`warehouse_code` is NOT globally unique.**
- Duplicate business validation uses the **composite** `company + country + marketplace context + warehouse_code` — never `warehouse_code` alone.
- **KM and ResUS may legitimately share `ONT8`.**
- **No DB constraint is changed in this task.**

**Flow rules:**
1. **Prefill Country** from the current Shipment country (+ resolved `company` / `marketplace` — §22.0(E)).
2. Country stays editable **only if** the Warehouse Master design permits it.
3. Validate **composite** duplicate `company + country + marketplace context + warehouse_code` (NOT global `warehouse_code` uniqueness).
4. Save creates a Warehouse Master record.
5. Close the create flow.
6. Refresh **only** the current candidate options (company/type/country-scope filtered — §22.0(F)/(G)).
7. **New warehouse selection must resolve exactly one `warehouses.warehouse_id` Master row.** Target commit = `shipments.destination_warehouse_id`; current compatibility persistence = `shipments.warehouse_id` + `shipments.warehouse_code`. Add-New-Warehouse auto-select / target commit remains **NOT IMPLEMENTED** until `destination_warehouse_id` persistence exists.
8. **Persistence is blocked by the DB Mapping Gap** (§22.0(L)): until `shipments.destination_warehouse_id` canonical persistence is implemented, Add-New-Warehouse → auto-select/commit is **NOT IMPLEMENTED** and must not be claimed. *(When implemented, Save MUST persist the canonical `shipments.destination_warehouse_id` + the compatibility `shipments.warehouse_id` mirror + the `shipments.warehouse_code` display snapshot copied from the selected row.)*
9. Do **not** force a manual page refresh.

**Canceling** the create flow leaves the previous Shipment warehouse selection unchanged.

### 22.G Warehouse Eligibility Rule (future-ready)

**Recommended canonical rule** — a warehouse is selectable when:
```
is_active = TRUE
AND is_selectable_for_shipment = TRUE
```

- **`is_selectable_for_shipment` is PROPOSED / PLANNED, not implemented** (§2). Recommended definition: `warehouses.is_selectable_for_shipment` BOOLEAN, default `TRUE` for existing legitimate destination warehouses.
- **v1 fallback** (until the field exists): use `is_active` / `status` only (and exclude `is_factory_warehouse = TRUE`).
- Eventual `FALSE` cases to exclude: factory-only, virtual, testing record, deprecated, transit-only, internal non-destination warehouses.
- **No DB column is added by this spec.**

### 22.H Shipment Country Change Behavior

When `shipments.country` / `company` / site context changes:
1. Rebuild candidates for the new context (§22.0(E)/(F)/(G)).
2. **Resolve the currently selected destination by canonical precedence** (§22.J): `destination_warehouse_id` → compatibility `warehouse_id` → legacy exact composite.
3. **Validate the one resolved Warehouse Master row** against the changed company / country / site context.
4. If the resolved selection remains eligible (same `company`, in the new country scope, eligible type) → **keep the resolved selection**.
5. If no longer eligible → **clear `shipments.destination_warehouse_id` when present**, **clear the compatibility `shipments.warehouse_id`**, **clear/recalculate the `warehouse_code` display snapshot**, and require the user to choose a valid warehouse.
6. **Never** retain a **cross-company or cross-country** warehouse reference silently.
7. **Current Runtime limitation (explicit):** `destination_warehouse_id` persistence is **not implemented**; the current source only handles the compatibility `warehouse_id` + `warehouse_code` — the precedence/clear behavior above is the target contract, not a claim of current canonical behavior.

No Shipment may proceed to the formal / external-document stage with a warehouse that conflicts with the Shipment company/country scope.

### 22.I Validation / Readiness Rules

- **Draft:** the warehouse selection may be temporarily blank while editing; warnings are allowed.
- **Before formal Shipment confirmation / external carrier-customs document generation, the destination must resolve to EXACTLY ONE Warehouse Master row using §22.J precedence:**
  - **A.** If `shipments.destination_warehouse_id` resolves exactly one row → **stop; do NOT also require composite resolution.**
  - **B.** Else if the compatibility `shipments.warehouse_id` resolves exactly one row → **stop; do NOT also require composite resolution.**
  - **C.** **Only when neither structured ID can resolve** may the legacy exact composite fallback run (`company + destination country/scope + marketplace + warehouse_code`): exactly one match = resolved; **zero matches = validation error when a Warehouse is required**; **more than one match = ambiguity error**; **no first-row fallback**; **no cross-company fallback**; **never `warehouse_code` alone**.
- **After the destination resolves to one row, the selected Warehouse must satisfy ALL of:**
  - **`is_active = TRUE`**;
  - **`company` matches `shipments.company`**;
  - **country / country scope matches** (§22.0(I) for EU);
  - **`warehouse_type` is eligible for the selected destination flow**;
  - **FBA requires `marketplace = Amazon`**; **3PL may have `marketplace` blank**;
  - **RETURN is rejected outside a Return flow**; **FACTORY is rejected as an overseas destination**;
  - **no Legacy Aggregate fallback** (§22.0(J));
  - required warehouse address/contact fields depend on the target `document_template_fields.required` rules.
- The Shipment is **not** blocked merely because *optional* Warehouse fields are blank. Example: `contact_email` required = FALSE → a missing email does not block; `postal_code` required = TRUE for a carrier template → a missing postal code blocks **that document only**.

### 22.J Document Dataset Warehouse Lookup

- **Lookup precedence (canonical):** (1) `shipments.destination_warehouse_id → warehouses.warehouse_id`; (2) `shipments.warehouse_id → warehouses.warehouse_id` — **destination compatibility fallback only** (until `destination_warehouse_id` is populated); (3) legacy composite fallback: `shipments.company + destination country/country scope + shipments.marketplace + shipments.warehouse_code → warehouses`.
- `shipments.warehouse_code` is only a **display snapshot / legacy support dimension** — never an endpoint identity and never a primary lookup key.
- **`warehouse_code` alone must NEVER be used when more than one row can match.** **No first-row fallback. No cross-company fallback.** Ambiguous legacy lookup (>1 match) returns an **explicit validation error** — it must not silently pick a KM vs ResUS row on a duplicate FC code.
- Canonical document fields resolved from the matched Warehouse Master row: `WAREHOUSE_CODE`, `WAREHOUSE_NAME`, `WAREHOUSE_ADDRESS`, `WAREHOUSE_CITY`, `WAREHOUSE_STATE`, `WAREHOUSE_POSTAL_CODE`, `WAREHOUSE_COUNTRY_CODE`, `WAREHOUSE_PHONE`, `WAREHOUSE_EMAIL`.
- These values are **not stored redundantly on `shipments`**. The **template never performs the lookup** — the **Document Dataset Builder resolves it before rendering** (the generated document is the immutable snapshot — §22.0(L)). Field-level placeholder mappings live in `document_template_fields` (SSOT) / `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §P.6/§P.7 — **not duplicated here**. *(Those DOC-GEN sections still show the older `warehouse_code`-only path and need the same primary/legacy correction in a future DOC-GEN-scoped task — out of scope for this task's allowed files.)*

### 22.K Warehouse Country Code Fallback (`WAREHOUSE_COUNTRY_CODE`)

- **Primary source:** `warehouses.country`; **fallback source:** `shipments.country`; **transform:** `country_to_iso2` (§22.L).
- **Resolution flow:**
  1. Resolve the Warehouse by the canonical precedence (§22.J): (1) `shipments.destination_warehouse_id → warehouses.warehouse_id`; else (2) compatibility `shipments.warehouse_id → warehouses.warehouse_id` (fallback only); else (3) the legacy exact composite `company + destination country/scope + marketplace + warehouse_code` (must resolve exactly one row; ambiguous → validation error; never `warehouse_code` alone).
  2. If `warehouses.country` is nonblank → `country_to_iso2(warehouses.country)`.
  3. Else → `country_to_iso2(shipments.country)`.
  4. If neither resolves → return **blank** and apply `document_template_fields.required` validation.
- **Never** fall back to an unrelated warehouse; **never** guess a country code from `warehouse_code` text.

### 22.L `country_to_iso2` — canonical transform rule

- **Purpose:** normalize country names, aliases, ISO alpha-2 codes, or recognized ISO alpha-3 codes into **ISO 3166-1 alpha-2** output.
- **Examples:** `United States / USA / US → US`; `United Kingdom / UK / GBR / GB → GB`; `Japan / JPN / JP → JP`; `Germany / DEU / DE → DE`; `Canada / CAN / CA → CA`; `Australia / AUS / AU → AU`.
- **Rules:** already-valid ISO alpha-2 values pass through unchanged and uppercased; recognized aliases map through a **controlled country dictionary**; **do NOT** generate codes by taking the first letters of a country name; unknown values return **blank/error** (for validation); this is a **transform_rule, not a DB column**; the source fallback is documented separately as the `fallback_rule` (§22.K).
- **Recommended `document_template_fields` semantics for `WAREHOUSE_COUNTRY_CODE`:**

  | key | value |
  |---|---|
  | `placeholder` | `WAREHOUSE_COUNTRY_CODE` |
  | `data_source_table` | `warehouses` |
  | `data_source_field` | `country` |
  | `data_source_path` | primary `shipments.destination_warehouse_id → warehouses.warehouse_id → warehouses.country`; compatibility fallback `shipments.warehouse_id → warehouses.warehouse_id → warehouses.country`; legacy exact composite fallback `shipments.company + destination country/scope + marketplace + warehouse_code → warehouses.country` (exactly one row; ambiguous → error; never `warehouse_code` alone) |
  | `transform_rule` | `country_to_iso2` |
  | `fallback_rule` | `shipments.country \| country_to_iso2` |

---

## 23. Overseas Warehouse Operations — Endpoint Semantics, Transfer, Detection, Auto-Create & Gates (CANONICAL 2026-07-21 — SPEC / CONTRACT SYNC)

> **Scope of this section:** specification / database-contract sync only. The structured endpoint columns are **documented as the canonical target contract** for the `warehouses` / `shipping_plans` / `shipments` sheets; this section does **NOT** assert they are live-verified to exist, and the runtime that reads/writes/auto-creates the endpoint fields and the Overseas Inbound / Overseas Outbound operations is **NOT implemented**, **NOT verified**, and is **not** claimed here (the current Runtime persists only the compatibility `warehouse_id` + `warehouse_code`). This section supersedes, where they differ, the "temporary inbound-first" note in §22.0(L) and any wording that treats `warehouse_id` alone as the canonical endpoint model.

### 23.1 Responsibility Boundaries (canonical)
- **Shipping Plan** — what will be transported, planned quantity, origin, destination, company/country/marketplace, carrier + estimated cost.
- **Shipment Draft** — completes **common transportation data**: origin/destination identity, carrier, shipping method, customs type, SKU + qty, cartons, CBM + weight, ETD/ETA, booking/tracking/container/BL/invoice. **Shipment Draft must NOT absorb overseas-warehouse execution fields.**
- **Formal Shipment / Shipment Overview** — the actual transportation record + in-transit lifecycle.
- **Shipment Events** — transportation milestones / status events.
- **Overseas Inbound** — the **destination** overseas warehouse receiving/pre-advice operation + its WMS/API details.
- **Overseas Outbound** — the **origin** overseas warehouse picking/shipping operation + its WMS/API details.
- **Overseas Inventory** — current overseas warehouse inventory + movements. Inbound/Outbound are **lightweight operational supplement layers** that drive overseas inventory movements after confirmed execution.

### 23.2 Shipping Plan Endpoint Fields (canonical)
`ship_from` (human-readable origin snapshot) · `ship_from_warehouse_id` (structured origin identity → `warehouses.warehouse_id`; may be blank per `ship_from_type`) · `ship_from_type` (origin endpoint type) · `destination` (human-readable destination snapshot) · `destination_warehouse_id` (structured destination identity when destination is a WH Master record) · `destination_type` (destination endpoint type). **Warehouse identity must NOT be inferred from `ship_from` / `destination` text.**

### 23.3 Shipment Endpoint & Compatibility Semantics (canonical)
- **Canonical structured identities:** `origin_warehouse_id`, `destination_warehouse_id` (+ `origin_type` / `destination_type`).
- **Transitional compatibility fields (do NOT delete):** `shipments.warehouse_id` = **destination compatibility mirror / read-fallback only** — it may resolve one `warehouses.warehouse_id` Master row, but it is **never the canonical or committed shipment destination** (the sole canonical destination is `shipments.destination_warehouse_id`; the sole canonical origin is `shipments.origin_warehouse_id`). `shipments.warehouse_code` = destination display/external-code snapshot derived from the selected Warehouse Master row — **never freely entered and never an identity**. *(No backend step mirrors `warehouse_id` onto `destination_warehouse_id`; that canonical persistence is NOT IMPLEMENTED.)*
- **Consistency rule:** when `destination_warehouse_id` is populated → `shipments.warehouse_id = shipments.destination_warehouse_id`, and `warehouse_code` resolved by `destination_warehouse_id → warehouses.warehouse_id → warehouses.warehouse_code`.
- Never use `warehouse_code` / `warehouse_name` / `destination` text / address as authoritative identity.

### 23.4 Shipping Plan → Shipment Transfer Mapping (canonical)
At Execution Commit (approved plan → Shipment Draft), carry:
`ship_from → ship_from` · `ship_from_warehouse_id → origin_warehouse_id` · `ship_from_type → origin_type` · `destination → destination` · `destination_warehouse_id → destination_warehouse_id` · `destination_type → destination_type`. If `destination_warehouse_id` is populated, also set `warehouse_id = destination_warehouse_id` and `warehouse_code = warehouses.warehouse_code` resolved by `destination_warehouse_id`. The transfer must **not** infer identity from display text; endpoints are preserved across edit, save, formalization, and reload. *(Runtime: current `createShipmentFromApprovedPlan_` copies only `ship_from`/`destination` text — the endpoint carry is a documented gap, NOT implemented.)*

### 23.5 Managed Overseas Warehouse Detection (canonical, runtime-derived direction)
An endpoint qualifies as an **Overseas Warehouse Operation** only when its `warehouse_id` resolves to an **active** `warehouses` record, `is_factory_warehouse` is **not TRUE**, the relevant receiving/shipping capability is enabled, and the warehouse is supported by the applicable operation/integration config. Do **not** rely solely on `warehouse_type = 3PL` (other managed overseas types may be added).
- **Inbound rule:** `destination_warehouse_id` qualifies + `is_receiving_enabled = TRUE` → create/link one **Overseas Inbound**.
- **Outbound rule:** `origin_warehouse_id` qualifies + `is_shipping_enabled = TRUE` → create/link one **Overseas Outbound**.
- **Transfer rule:** both → one Outbound (origin) **and** one Inbound (destination).
- **Neither:** no overseas operation. **Direction is derived — never a user selector.** Factory warehouses (`is_factory_warehouse = TRUE`) never create an overseas operation.

### 23.6 Company-Scoped Warehouse Identity (canonical)
`WH-RESUS-US-3PL-AMZLGS` and `WH-KM-US-3PL-AMZLGS` are **separate** Warehouse Master records (different company accounts + inventory ownership) even for the same physical provider. Shipment company and selected warehouse company must be compatible; ResUS routes through the ResUS record, KM through the KM record; inventory / credentials / org & SKU mapping / inbound / outbound must never cross the two identities. **Match by `warehouse_id` + validated company ownership — never by name / `warehouse_code` / provider name / address.**

### 23.7 Auto-Create / Link & Validation Gates (canonical)
- When a Shipment becomes formal (or reaches the canonical operation-creation trigger): evaluate origin/destination identities and **idempotently** create or link the required Overseas Inbound and/or Outbound Draft, copy common Shipment data, and preserve `shipment_id` as the authoritative linkage. Idempotency keys on **shipment + warehouse + operation direction/type** (no duplicates on repeat).
- **Saving Shipment Draft:** allowed even when overseas warehouse API details are incomplete.
- **Selecting a managed overseas warehouse:** show a **non-blocking** notice that an Overseas Inbound/Outbound operation will be required (destination → Inbound notice; origin → Outbound notice).
- **Submitting to WMS/API:** block if provider-required fields are incomplete; show the exact missing-field checklist; provide a direct action to open the correct operation record.
- **Marking shipped/dispatched:** apply the finalized business gate; if successful warehouse submission is required before dispatch, block and link directly to the relevant operation record; **do not block unrelated normal shipments.**

### 23.9 Factory vs Overseas Inventory separation (CANONICAL 2026-07-21)
Factory Inventory (`factory_stock` / `factory_stock_movements`) and Overseas Inventory (`overseas_inventory_snapshot` / `overseas_inventory_movements`) are **separate domains** (authority: `DATABASE_RELATIONSHIP_MAP.md` §6.0). A Shipment carries goods **in transit** — it is a transportation state, **not** an inventory balance at either endpoint. **Formal Shipment creation does NOT add Overseas Inventory.** Overseas Inventory increases **only** on a confirmed Overseas Inbound receipt; it decreases **only** on a confirmed Overseas Outbound ship-out. Factory Stock reservation/deduction uses **only** the factory tables (§7/§8/§15.1) and is unaffected by Overseas Outbound. **B-1 reservation applies only when the Shipment's `origin_warehouse_id` resolves to a factory warehouse (`is_factory_warehouse = TRUE`); an overseas-origin shipment reserves via the Overseas Outbound Lock / `wh_reserved_stock` and never writes `factory_stock`.** **In-transit quantities are never double-counted as available inventory at both endpoints.**

### 23.8 Warehouse Picker — component-level status (CANONICAL status matrix; Round 4)
The blanket phrases "Warehouse Picker IS IMPLEMENTED" and "Warehouse Picker PLANNED / NOT IMPLEMENTED" are **both retired** — each conflated frontend code, backend source acceptance, deployment, live verification, and canonical endpoint persistence. This matrix is the **single canonical status owner**; every summary / heading / changelog / status note in this spec and in `DATABASE_RELATIONSHIP_MAP.md` must agree with it:

| Component | Canonical status |
|---|---|
| Warehouse Picker spec / decision | **FINALIZED** |
| Frontend selector / controls (`shipping-history.js` `warehouseFld()` / `shWarehousePick()`) | **CODE-COMPLETE** |
| Frontend compatibility persistence (sends `warehouse_id` + `warehouse_code`) | **IMPLEMENTED IN SOURCE** |
| Backend acceptance of compatibility `warehouse_id` (`12_shipment_handlers.gs` `SHIPMENT_EDITABLE_FIELDS_`) | **SOURCE IMPLEMENTED** |
| Apps Script / backend redeploy | **PENDING** |
| Live warehouse GET verification | **NOT VERIFIED** |
| Live save / reload smoke test | **NOT VERIFIED** |
| `destination_warehouse_id` canonical persistence (+ mirror / dual-endpoint carry) | **NOT IMPLEMENTED** |
| Full end-to-end Warehouse Picker Runtime | **NOT ACCEPTED / NOT LIVE-VERIFIED** |
| Legacy aggregate migration | **NOT EXECUTED** |

- **Frontend code-complete does NOT mean the full Runtime is complete.**
- **Backend source acceptance does NOT mean a deployed Runtime is verified.**
- **Current compatibility `warehouse_id + warehouse_code` support does NOT mean `destination_warehouse_id` canonical persistence is implemented.**

Behaviour: the Picker (never free text) selects the **destination** warehouse and copies the `warehouse_code` display snapshot; company compatibility + receiving/shipping capability filtering apply where applicable; reload restores the selected endpoint. The current frontend selects/persists the compatibility `warehouse_id` + `warehouse_code`; extending it to persist/select/restore **both** `origin_warehouse_id` and the canonical `destination_warehouse_id` is **NOT IMPLEMENTED**. Candidate-filtering detail: §22.0. This round changes documentation only — no Picker code, handler, Apps Script, schema, UI, or deployment is modified, and no redeploy / live save-reload is claimed complete.

### 23.10 Shipout Push Compatibility & Operation Timing (CANONICAL 2026-07-22 — runtime NOT implemented)
Two **directional** integration pushes exist and must never be conflated:
- **Outbound Instruction Push — KM System → Warehouse/WMS** (we tell the warehouse what to ship). Sent when the Overseas Outbound operation is **Submitted** (after Lock).
- **Shipout Confirmation Push — Warehouse/WMS → KM System** (the warehouse tells us what actually shipped). Received as the actual ship result.

**Canonical outbound timing:** Formal Shipment → auto-create/link Outbound Draft → complete provider fields → **Lock and reserve stock** → **Submit outbound instruction to WMS** → acknowledged → picking → packed → ready_to_ship → **actual Shipout Confirmation returned** → post overseas outbound movement → **reduce `current_stock` and `reserved_stock` by the actual shipped qty** → update Shipment shipped/tracking state.

**Hard rules (bind here; full lifecycle owned by `OVERSEAS_OUTBOUND_SPEC.md`):**
- **Do NOT define "Shipout first, then push the outbound instruction."** The instruction push (KM→WMS) always precedes the shipout confirmation (WMS→KM).
- **Auto-create does NOT auto-submit.** **Submit does NOT deduct physical stock.**
- **Lock reserves** stock (`available → reserved`); **Ship Confirm deducts** stock (`current_stock` and `reserved_stock`). Reserve at Lock, never at Draft.
- **Ship Confirm deducts only the actual shipped quantity; a Partial Ship Confirm deducts only `shipped_qty_this_confirmation`** — never the requested/planned qty.
- The symmetric **inbound** side: pre-advice push (KM→WMS) then a confirmed **Receipt** (recorded in KM) posts the inventory increase; **Delivered ≠ Received** (§23.9, `SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §5.4). Owned by `OVERSEAS_INBOUND_SPEC.md` §10.

### 23.11 Dual-Direction Fulfillment Orchestration (FUTURE; Phase-1 MANUAL — CANONICAL 2026-07-22; runtime NOT implemented)

Documents the future-compatible relationship where **one execution event drives BOTH a destination Inbound operation AND an origin Shipout Instruction**, and the destination-side external references/labels are packaged with the shipout instruction for the origin party (e.g. the factory) to execute the shipment.

**Terminology boundary (MUST hold):**
- The **Formal Shipment / execution orchestrator** is the record that idempotently **creates/links both** the destination Inbound operation **and** the origin Shipout Instruction. 
- The **Overseas Inbound Receiving Operation is the destination receiving record ONLY.** It **does NOT** directly create or push the origin Shipout Instruction, it does **NOT** own factory shipout creation, and it is **NOT** the planning SSOT (the planning intent SSOT is the **Inbound Planning Request**; the execution SSOT is the **Formal Shipment**).
- The **origin Shipout Instruction** is the general origin-side execution record. When the origin is a managed overseas warehouse it **is** the **Overseas Outbound operation** (`OVERSEAS_OUTBOUND_SPEC.md`); when the origin is a factory it is a **factory shipout instruction** (future record). Either way the **orchestrator**, not the destination Inbound, creates it.

**Canonical future flow (design; each step manual in Phase 1 — see below):**
1. **Inbound Planning Request** supplies planning intent (`OVERSEAS_INBOUND_SPEC.md` §§2–8).
2. **Formal Shipment** becomes the execution-level orchestration record.
3. The orchestrator **idempotently creates/links the destination Inbound operation** (`shipment_id + warehouse_id + operation_type=inbound`).
4. The orchestrator **idempotently creates/links the origin Shipout Instruction** (`shipment_id + warehouse_id + operation_type=outbound`).
5. The destination Inbound data **may be submitted externally** (warehouse / platform / carrier system).
6. External **inbound references / shipping label / carton label / appointment documents may be retrieved** (referenced via the Document Engine — see DB compatibility below; never stored as binary in the operation header).
7. The **origin Shipout Instruction + destination inbound references + retrieved labels/documents may be packaged together** (the **Factory Shipping Package**) and delivered to the factory / origin party.
8. **Origin shipment execution** generates departure / shipping events.
9. **Destination receipt confirmation** posts **only confirmed good quantity** to Overseas Inventory (`overseas_inventory_movements`; damaged never sellable; **Delivered ≠ Received**).

**Phase-1 boundary (MANUAL — none of the following are implemented):** manually create/record the Inbound; manually maintain transit quantities + status; manually upload/register retrieved labels/inbound documents; manually assemble + hand the Factory Shipping Package to the factory; manually update departure/transit/arrival status; manually confirm receipt. **NOT implemented / MUST NOT be claimed:** automatic destination Inbound submission · automatic shipping-label retrieval · automatic origin Shipout creation · factory API delivery · WMS/API synchronization · automatic inventory reservation/deduction · automatic Formal Shipment orchestration.

**Separate idempotency scopes (8; never one shared key — §23.7):** (1) destination inbound operation **create/link**, (2) destination inbound **external submission**, (3) **label/document retrieval**, (4) origin shipout operation **create/link**, (5) origin shipout **instruction submission**, (6) **receipt confirmation**, (7) **shipout confirmation**, (8) **reversal/correction**. Each guarantees a repeated call is a no-op on its already-applied effect.

**Simplified visual relationship (future):**
```
Inbound Planning Request
   → Formal Shipment / Orchestrator
        ├─→ Destination Inbound  →  external submission  →  external reference / label retrieval
        └─→ Origin Shipout Instruction        (parallel; created by the orchestrator, NOT by the Inbound)

Destination Inbound reference/labels  +  Origin Shipout Instruction
   → Factory Shipping Package
   → Factory shipment (departure / shipping events)
   → Overseas Inbound Receiving
   → Receipt confirmation (good qty only)
   → Overseas Inventory
```

**DB compatibility (planned additive; see `OVERSEAS_INBOUND_SPEC.md` §10.1 / `OVERSEAS_OUTBOUND_SPEC.md` §3 / `DATABASE_RELATIONSHIP_MAP.md` §8C):** the operation tables must carry a compatible home for `source_type`, `source_request_id` (Inbound Planning Request), `shipment_id`, the cross-links `destination_inbound_operation_id` ↔ `origin_shipout_operation_id`, `external_inbound_id` / `external_inbound_reference`, `submission_mode`, `submission_status`, `submitted_at`, `label_status`, `label_retrieved_at`, a **document/attachment relationship via the Document Engine** (`generated_documents.related_entity_type = overseas_inbound_operation` / `related_entity_id = inbound_operation_id`; `document_id` reference — **never store label binary content in the operation header**), `last_api_attempt_at`, `last_api_error`. All **planned design — not created / not implemented.**

---

## External-Origin Link / Adopt Boundary (CANONICAL 2026-08-01 Round 4D-C — documentation only; Runtime NOT implemented)

- The **Formal Shipment remains the sole Incoming owner** for every quantity it represents (`SUPPLY_PLANNING_CALCULATION_RULES.md` §38; count-once §30).
- **External Link** connects external execution evidence to an **existing** KM Shipment: the external quantity becomes discrepancy / evidence and **never contributes separately**.
- **External Adopt** creates or associates a KM canonical execution record (Shipment / Operation) through an **explicit controlled action** (orchestrator §23.11) — **not** a background fuzzy match; the original external source reference is preserved.
- The **canonical quantity comes from the KM Shipment**; the external quantity is discrepancy / evidence only.
- **Planning eligibility begins only after a KM canonical record exists** (post-Adopt). A raw unlinked external record is quarantined and contributes **0** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §12).
- No fuzzy matching (stable source identity only). **No Runtime for Link / Adopt / quarantine is implemented in this round.**

---

**Draft v2.9 — Mixed implementation status. Warehouse Picker status is component-level (canonical matrix §23.8): frontend CODE-COMPLETE, backend source acceptance SOURCE IMPLEMENTED, REDEPLOY PENDING, live GET/save/reload NOT VERIFIED, `destination_warehouse_id` canonical persistence NOT IMPLEMENTED. Factory Stock reservation lifecycle PLANNED / NOT IMPLEMENTED (B-1 resolved — trigger = the Ready to Ship transition `draft → ready_to_ship` = Formal Shipment Execution Commit, owner §8A.1; identity origin factory `warehouse_id + sku`; decision only). No Runtime or DB change in this documentation task.** **Current destination lookup precedence: (1) `shipments.destination_warehouse_id` → (2) compatibility `shipments.warehouse_id` → (3) legacy exact composite fallback. `shipments.warehouse_id` is compatibility-only; `shipments.warehouse_code` is display-snapshot-only; `shipments.destination_warehouse_id` is the sole canonical destination.** *(The v2.6 changelog fragments below are **HISTORICAL / SUPERSEDED — NOT AN ACTIVE CONTRACT**; the active contract is the current-state summary above and §23.8.)* (v2.7, acceptance-corrected: mapped the Factory Stock reserve trigger to the resolved B-1 decision — reserve at **Ready to Ship**, distinct from the non-reserving Create-Shipment-Draft Execution Commit; plan approval / Create Draft / interactive Draft create/save/edit do not reserve; reserve applies to factory-origin only (origin `warehouse_id + sku`; overseas → `wh_reserved_stock`); **Ship** deducts `fac_current_stock` + consumes `fac_reserved_stock`; cancel/release = B-8 (BLOCKED); §0/§3/§4/§7/§8/§15.1/§23.9 corrected; no status redesign. v2.6: destination-derived-identity conflict removed (§0 warehouse selection = filter → select one `warehouse_id` → copy `warehouse_code`); editable-field semantics split (Picker-controlled `warehouse_id` / derived `warehouse_code` snapshot / normal editable — §4); document warehouse lookup precedence documented across §22.J/§I.2.3/§I.2.7A/§P.6 *(HISTORICAL v2.6 wording — superseded by the current precedence stated at the top of this footer: destination_warehouse_id → compatibility warehouse_id → legacy exact composite)*; header/footer aligned to v2.6. Earlier v2.6: Warehouse Picker residual-conflict cleanup — §22.F composite duplicate validation (no global `warehouse_code` uniqueness), the then-current committed-identity wording, and §22.H/§22.I/§22.J/§22.K/§22.L lookup-precedence corrections (exactly one row; ambiguous → error), §22.0(L) address-snapshot reconciliation with DOC-GEN §P.7 *(HISTORICAL / SUPERSEDED — NOT AN ACTIVE CONTRACT; the active contract is: `shipments.destination_warehouse_id` = sole canonical destination, `shipments.warehouse_id` = compatibility-only, `shipments.warehouse_code` = display-snapshot-only)*. v2.5: added §22 Shipment Draft Warehouse Selection Flow — country-filtered dropdown, Add New Warehouse flow, country-change invalidation, document warehouse lookup + `WAREHOUSE_COUNTRY_CODE` fallback + `country_to_iso2` transform; proposed `is_selectable_for_shipment` field. v2.4: added §21 Shipment Logistics Attribute Aggregation + planned `battery_flag`/`battery_type`/`magnet_flag`/`transit_type`/`last_mile_delivery`/`shipments_customs_type` header fields.)

**End of Document**
