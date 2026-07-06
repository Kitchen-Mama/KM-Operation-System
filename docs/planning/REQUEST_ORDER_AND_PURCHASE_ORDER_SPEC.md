# Request Order & Purchase Order — Procurement Layer Phase 1 Spec

**Status:** 🟢 Phase 1 — UI + Mapping + DB Handler Foundation (API-ready, no auto-procurement engine)
**Last Updated:** 2026-07-01
**Maintained By:** Development Team
**Related:** [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) (extended / future design — three-layer sources, payment terms, multi-PO links), [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md), [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md)

> **This is the Phase-1 IMPLEMENTED design** for the Procurement Layer (Request Order Draft, Purchase Order Overview, Purchase Order List). It intentionally uses a **flat, directly-implementable** schema (header carries `company` / `supplier` / `factory_id`) so the UI + Apps Script handlers + API adapter can ship now.
>
> The sibling [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md) (v1.3) remains the **extended / future design** — three-layer request structure with `request_order_line_sources`, `supplier_price_list` / `payment_terms` masters, and `request_order_po_links` for multi-PO splits. When the future calculation engine and multi-company source breakdown are built, this Phase-1 schema migrates toward that design (additively; no field removed here is reused with a different meaning there).
>
> **Guardrails honored:** no Factory Stock deduction · no Factory Allocation Engine · no Carrier Rate Engine · no Export/Template Center · no payment/invoice settlement · no full auto-procurement algorithm · no Role & Permission implementation. Actor fields are placeholder identities.

---

## 1. Purpose & Scope

Phase 1 builds the **first version UI + data flow foundation** for the Procurement Layer:

1. **Request Order Draft** = **Procurement Planning Draft** — the request approval workspace (Draft / Pending Approval / Approved).
2. **Purchase Order Overview** = **Procurement Commitment dashboard** — PO cards grouped by execution status.
3. **Purchase Order List** = **PO operational list / history** — filterable table view.

Phase 1 delivers: menu + pages + card/expand UI + status flows + the four DB tables + Apps Script basic handlers + API-ready normalizers/getters/writers. It does **not** build the auto-procurement algorithm, supplier API, payment flow, or formal document generation.

---

## 2. Layer Definition & Immutable Flow (authoritative)

| Term | Meaning |
|------|---------|
| **Request Order Draft** | **Procurement Planning Draft** — a proposed purchase request, editable and subject to approval. |
| **Purchase Order** | **Procurement Commitment** — the formal order to the supplier, created only from an approved request. |
| **Purchase Order List** | **PO operational list / history** — a read/query projection over PO tables. |

**Immutable Flow (must hold):**

```
Shipment / Inventory / Factory Stock          (upstream demand signals — read only)
        ↓  copy (never write back)
Request Order Draft   (request_orders + request_order_lines)      [Procurement Planning Draft]
        ↓  copy (never write back)
Purchase Order        (purchase_orders + purchase_order_lines)    [Procurement Commitment]
```

- **Downstream may copy upstream data but must NOT write back upstream.**
- `purchase_orders` **never** writes `request_orders` (except the one-time `request_orders.status = converted_to_po` marker set on the request itself at conversion — that is the request layer recording its own conversion, not the PO editing the request).
- `request_orders` **never** writes `shipments` / inventory / `factory_stock`. Upstream references are copied into `source_ref_type` / `source_ref_id` / `related_entity_*` for traceability only.

---

## 3. DB Schema (Phase 1 — implemented; tables auto-created with documented header)

> Tables live in the OPERATION DB spreadsheet. `13_procurement_handlers.gs` **auto-creates** any missing procurement tab with its documented header row (missing-header-safe; existing tables never altered). Full column notes in [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §7.

### 3.1 `request_orders`
`request_order_id` (PK), `request_order_no`, `request_order_version`, `parent_request_order_id`, `company`, `supplier_id`, `supplier_name`, `factory_id`, **`warehouse_id`** (default = `WH-TW-CN-FACTORY-YOUXIN` / CN Youxin when none supplied), **`request_status`** (canonical), **`tier_group`**, `total_sku`, `total_qty`, `total_cartons`, `estimated_amount`, `currency`, `source`, `source_ref_type`, `source_ref_id`, `created_by`, `created_at`, `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejected_reason`, `cancelled_by`, `cancelled_at`, `completed_by`, `completed_at`, `note`, `updated_by`, `updated_at`.

- **`request_status`** is the **canonical header status** (`draft` / `pending_approval` / `approved` / `cancelled` / `converted_to_po`). The legacy **`status`** column is **NO LONGER written or ensured** (removed from the header array so it is not recreated). Handlers/normalizers read `request_status` first and fall back to `status` **only** for old rows.
- **`tier_group`** summarizes the buckets across the request's lines: **only T1 → `T1`; only T2/T3 → `T2_T3`; both → `mixed`; none → blank**.
- **Header-level dates are NOT written** — `inspection_date` / `expected_ready_date` / `expected_ship_date` are **line-level** (T1 and T2/T3 can differ); canonical source is `request_order_lines`.

### 3.2 `request_order_lines`
`request_order_line_id` (PK), `request_order_id` (FK), `sku`, `series`, **`company`**, **`request_bucket`**, **`request_month`**, **`inspection_date`**, **`expected_ready_date`**, **`expected_ship_date`**, `requested_qty`, `approved_qty`, **`km_qty`**, **`resus_qty`**, **`restw_qty`**, `units_per_carton`, `carton_qty`, **`shortage_qty`**, `supplier_id`, `supplier_name`, `supplier_sku`, `unit_cost`, `estimated_amount`, `currency`, **`calculation_method`**, **`line_status`**, **`linked_purchase_order_line_id`**, `note`, `created_at`, `updated_at`.

**Field mapping:**
- **`company`** = the site owner (KM / ResUS / ResTW …) this line's demand belongs to. **One company per line.**
- **`km_qty` / `resus_qty` / `restw_qty`** = the per-company allocation for this line — the matched company column carries the qty (= `approved_qty`), the others are `0` (never blank). Recomputed when `approved_qty` is edited.
- **`request_bucket`** = **canonical `T1` / `T2` / `T3`** (there is **no `tier_type` on this table** — deprecated; do not re-add). `request_month` = `YYYY-MM`.
- **`inspection_date` / `expected_ready_date` / `expected_ship_date`** — line-level schedule; per tier, written to every line of the tier on Save.
- **`requested_qty`** = requested from the Order Allocation draft. **`approved_qty`** = editable approval qty. **`shortage_qty`** kept as primary (blank when no formula). **`calculation_method`** = `manual_order_allocation`. **`line_status`** = `draft` / `submitted` / `approved` / `cancelled`. **`linked_purchase_order_line_id`** = blank until a PO line is created.

> All columns are **additive** — `sheetEnsureColumns_` appends any missing header; existing columns are never altered, and **deleted headers are missing-header-safe** (code never re-creates removed columns).

**DEPRECATED — no longer written or ensured** (kept only if physically present; NOT source of truth, code must not re-create): on `request_order_lines` → `product_name`, `need_reason`, `related_entity_type`, `related_entity_id`, `final_order_qty`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `reallocation_qty`, `source_company_count`, `source_site_count`, `tier_type`; on `request_orders` → `status` (replaced by `request_status`), header `inspection_date`/`expected_ready_date`/`expected_ship_date` (line-level only). Company/site/month allocation detail is owned by **`request_order_line_sources`** (§3.8).

### 3.3 `purchase_orders`
`purchase_order_id` (PK), `purchase_order_no`, `po_version`, `parent_purchase_order_id`, `request_order_id` (FK, copied), `company`, `supplier_id`, `supplier_name`, **`factory_id`**, **`warehouse_id`** (copied from the source Request Order at conversion — for the PO List Factory column), `status`, `currency`, `total_sku`, `total_qty`, `total_amount`, `expected_ready_date`, `confirmed_ready_date`, `issued_by`, `issued_at`, `confirmed_by`, `confirmed_at`, `cancelled_by`, `cancelled_at`, `completed_by`, `completed_at`, **`closure_reason`**, **`closed_by`**, **`closed_at`** (Closure §6.1), `note`, `created_by`, `created_at`, `updated_by`, `updated_at`.

### 3.4 `purchase_order_lines`
`purchase_order_line_id` (PK), `purchase_order_id` (FK), `request_order_line_id` (copied), `sku`, `product_name`, `series`, `ordered_qty`, **`completed_qty`** (production-completed qty; drives `partial_completed`/`completed`; `available_to_ship = completed_qty − shipped_qty`), `shipped_qty`, `remaining_qty`, `units_per_carton`, `carton_qty`, `supplier_id`, `supplier_sku`, `unit_cost`, `line_amount`, `currency`, `related_shipment_id`, `note`, `created_at`, `updated_at`.

> **Future company-summary snapshot (SPEC ONLY — not implemented in this task):** `purchase_order_lines` should gain **`km_qty` / `resus_qty` / `restw_qty`** as a company-split **snapshot** captured at PO creation. Reason: the PO is a **commitment layer** and must not recalculate the Request source every time. No PO logic is added now (documentation only).

---

## 4. Request Order Source (Phase 1)

Phase 1 supports two sources:

1. **Manual Draft** — the user manually creates a Request Order Draft (`source = manual`). **Implemented.**
2. **From Shipment / Inventory shortage** — a placeholder button + spec only; **not wired to an algorithm** in Phase 1.

**Future `source` enum (reserved — no auto engine now):**
`inventory_shortage` · `factory_stock_shortage` · `shipment_allocation_shortage` · `approved_shipment_demand` · `manual` · `ai_recommendation`.

> When a future engine populates a draft from upstream demand, it writes `source` + `source_ref_type` + `source_ref_id` (header) and `related_entity_type` + `related_entity_id` (line) — **copy only, never a write-back to the upstream record.**

---

## 5. Request Order Status Flow

```
draft ──submit──▶ pending_approval ──approve──▶ approved ──convert──▶ converted_to_po
  ▲                    │
  └──── reject ────────┘   (rejected_reason required; version +1 on resubmit)

draft / pending_approval ──cancel──▶ cancelled   (soft; row + lines preserved)
```

- **`draft`**: `approved_qty` editable; supplier selectable/defaulted; unit cost from supplier price list; **Save** persists without submitting; **Submit** → `pending_approval`; **Cancel** → `cancelled` (soft hide, DB kept).
- **`pending_approval`**: read-only; **Approve** → `approved`; **Reject** → back to `draft` with `rejected_reason` (required); resubmit bumps `request_order_version` +1 (MVP reuses the same row).
- **`approved`**: shows **Create PO / Convert to PO**; **Done** sets `completed_at` / `completed_by` so the card leaves the default Approved view (DB row never deleted).

---

## 6. Purchase Order Status Flow

**PO `status` enum (target — authoritative):**
`draft` · `issued` · `in_production` · `partial_completed` · `completed` · `partial_shipped` · `shipped` · `closure` · `cancelled`.

```
draft ──issue──▶ issued ──▶ in_production ──▶ partial_completed ──▶ completed
                                                                        │
                                                     ──▶ partial_shipped ──▶ shipped
                                                                        │
                                       (all lines remaining_qty = 0)    ▼
                                                                    closure
any (non-completed/closure) ──cancel──▶ cancelled
```

- **`partial_completed`** — some (not all) ordered qty produced (`Σ completed_qty` between 0 and `Σ ordered_qty`).
- **`partial_shipped`** — some (not all) completed qty shipped; **`shipped`** — all shipped.
- **`closure`** — the PO is closed (see §6.1). **DB enum uses `closure`; the UI display name is "Closure".**

> **Phase-1 runtime note:** the current `updatePurchaseOrderStatus` handler implements a **subset** (`draft → issued → confirmed → in_production → ready_to_ship → completed`, `cancel`). The enum above is the **target**; `partial_completed` / `partial_shipped` / `shipped` / `closure` and the legacy `confirmed` / `ready_to_ship` are reconciled toward this set as production/shipment wiring lands. UI status labels already display all target values. Shipment linking (`shipment_lines.purchase_order_line_id`) is future.

**Actions by state (Phase 1):** Draft → Save / Send-Issue / Cancel · Issued → Confirm / Reject-Cancel / update supplier info · Confirmed/In Production → update ready date / production status · Ready to Ship → link to Shipment Draft (future) · Completed → read-only.

### 6.1 Closure Rule

`closure` has **two** sources:

1. **Auto Closure** — when **every** PO line has `remaining_qty = 0`, the system **may** auto-transition the PO `status → closure` (target behavior; not an auto-procurement algorithm — a simple completion check).
2. **Manual Closure** — a user closes / writes off a PO for a special reason. **`closure_reason` is required**; the system records `closed_by` and `closed_at`.

**Suggested DB columns on `purchase_orders`:** `closure_reason`, `closed_by`, `closed_at` (added to the header schema; auto-created by `13_procurement_handlers.gs`). **`completed_qty` is added to `purchase_order_lines`** (production-completed quantity; drives `partial_completed` / `completed` and, with `shipped_qty`, `available_to_ship = completed_qty − shipped_qty`).

---

## 7. Page Specs (Phase 1 UI)

### 7.1 Request Order Draft — **Decision Layer** (finalized)
Three sections: **Draft / Pending Approval / Approved**. **Card/expand structure matches the Weekly Shipping Plan card** (`.sp-card`; `.sp-card-details` shown via `.is-expanded`; styles scoped to `#request-order-draft-section` in `procurement.css`).

> **Request Order Draft = the decision layer. All ordering decisions (approve qty, company split, T1 vs T2+T3, schedule, cancel) are completed here.** Purchase Order Overview = the **execution layer** — it inherits the approved result and only handles supplier / factory / payment / delivery dates. **PO Overview does NOT re-decide split/merge** (paused until an explicit future design).

- **First-layer header:** **Status · Request No · Company (companies included, e.g. KM / ResUS / ResTW, from the line `company` column) · Factory (`warehouses.warehouse_name`; `warehouse_id` is the source of truth but is NOT shown unless no name exists; default Tier 1 = `WH-TW-CN-FACTORY-YOUXIN`) · Series · Total Qty · Total Ctn · Est. Amount · Created**. Right-side actions: **Expand/Collapse · Save · Submit · Cancel** (Draft); Approve/Reject (Pending); Convert to PO/Done (Approved).
- **Expanded detail = exactly THREE stacked blocks:**
  - **Block 1 — SKU In Total (READ-ONLY):** `SKU · KM · ResUS · ResTW · Requested · Approved · Carton` (company columns are the distinct companies present). Footer: **Total SKUs · Total Approved · Total Ctn**. **Computed live** = Σ of Block 2 (T1) + Block 3 (T2+T3). Removed columns (no longer shown): Current Stock, Following 3 Month FC, Avg. Sales / FC, Days of Supply.
  - **Block 2 — T1 Request:** upper table `SKU · KM · ResUS · ResTW · Requested · Approved · Carton` (one row per `(sku, bucket)` so bucket integrity is kept). **Approved editable**; when **Approved == Requested** the KM/ResUS/ResTW split is **locked** (= requested split); when **Approved ≠ Requested** the split becomes **editable and must sum to Approved** (validated on Save/Submit). Each company cell = one real `request_order_line` (`company` column). Lower editable schedule: **Inspection Date · Expected Ready Date · Expected Ship Date** (written to all T1 lines on Save). Top-right actions: **✕ (cancel tier)** and **+ Add Note**.
  - **Block 3 — T2 + T3 Request:** identical structure/rules; groups buckets T2 and T3 (rows tagged T2/T3 to preserve bucket).
- **✕ (cancel tier):** soft cancel — sets `request_order_lines.line_status = 'cancelled'` for the tier's lines (kept in DB, block hidden). If **no active line remains** on the request, `request_orders.request_status = 'cancelled'` + `cancelled_by/at`. Handler `cancelRequestOrderTier`. *(request_order_line_sources rows are append-only and not status-updated on cancel — follow-up.)*
- **+ Add Note:** reveals a textarea; Save writes the note to the tier's `request_order_lines.note` (line-level note field).
- **Validation:** Save/Submit blocked when a row's company split ≠ Approved, or Approved is not a full carton (multiple of `units_per_carton`).
- **Removed from this page:** the **Factory / Payment** block — detailed payment/factory confirmation belongs to Purchase Order Overview. Only **Est. Amount** remains (first-layer header).
- **Layout:** the three blocks render **horizontally, side by side, equal height** (`.ro-decision-grid`, 3 equal columns; stacks to one column ≤1100px). Each block's table scrolls inside its own wrapper — no page horizontal overflow.
- **Company Allocation popup (read-only):** in **SKU In Total**, KM/ResUS/ResTW values are **clickable when > 0**. Click opens a compact popover **"Company Allocation Detail"** — fields **Company · SKU · Tier · Month · Country · Marketplace · Requested · Approved · Shortage · Note**. Source = **`request_order_line_sources`** (§3.8) filtered to this request's lines for the SKU+company; when empty it **falls back** to `request_order_lines` grouped by company and shows **"Site-level source pending."** No fake site rows are invented. Clicking `0` / `--` does nothing (or "No allocation detail."). The popup is **read-only**, closes on ✕ / overlay / Esc, and never stacks (a new open closes the previous). Matches the KM modal style (`.pc-modal`).

### 7.2 Purchase Order Overview
Status-grouped PO cards: **Draft PO / Issued-Sent / Confirmed / In Production / Ready to Ship / Partially Shipped / Completed / Cancelled**.
- **Header:** PO No · Status · Supplier · Company · Currency · Total SKU · Total Qty · Total Amount · Expected Ready Date · Created Date.
- **Expanded PO Lines:** SKU · Product Name · Ordered Qty · Shipped Qty · Remaining Qty · Unit Cost · Line Amount · Cartons · Related Request Order · Related Shipment · Note.

### 7.3 Purchase Order List
**Filters (left→right):** **Date · Status · Supplier · Category · Series · SKU · Search.** (Company and PO No are **not** primary filters; PO No is reserved for a future search-keyword / advanced filter.)
**Table (line-level — one row per `purchase_order_line`), columns left→right:**

| Column | Source |
|--------|--------|
| SKU | `purchase_order_lines.sku` |
| Category | `sku_details.category` (join by sku) |
| Series | `purchase_order_lines.series` → fallback `sku_details.series` |
| Supplier | `purchase_orders.supplier_name` (→ `supplier_id`) |
| Factory | `purchase_orders.factory_id` → fallback `warehouse_id` → `warehouses.warehouse_name` |
| PO No | `purchase_orders.purchase_order_no` (links to PO Overview) |
| Status | `purchase_orders.status` |
| Ordered | `purchase_order_lines.ordered_qty` |
| Completed | `purchase_order_lines.completed_qty` |
| Shipped | `purchase_order_lines.shipped_qty` |
| Remaining | `purchase_order_lines.remaining_qty` (fallback `ordered − shipped`) |
| Updated | `purchase_order_lines.updated_at` → fallback `purchase_orders.updated_at` |

> **Date** = single **Date Range** filter (shared `#frDateModal` / `.fr-*` picker, same as Forecast Review / Shipment Overview) matched against `purchase_orders.created_at`; **Reset** clears the range to "All". Presets: Today / Yesterday / Last 7 / 30 / 60 / 90 days / Last month / Custom range. **Status** filter options = the target PO enum (§6). Category / Series / Supplier / SKU are contains-match. **Factory** requires `purchase_orders.factory_id` / `warehouse_id` (copied from the source Request Order at conversion).

---

## 8. Supplier / Price Source (Phase 1)

- Unit cost first version is sourced from the **existing supplier price list** (`supplier_price_list` / `pricing_list`) where available.
- **If price fields are insufficient, fall back to displaying `--`.** Do **not** refactor the supplier price list for this task.
- **Future:** PO `unit_cost` should be preferred from the supplier price list; when absent, manual input is allowed but must be flagged for **future audit**.

---

## 9. API / Apps Script Actions (API-ready)

**Apps Script module `13_procurement_handlers.gs`** (routed via `01_router.gs`):
`createRequestOrderDraft` · `updateRequestOrderLineQty` (now also writes `inspection_date` / `expected_ready_date` / `expected_ship_date` / `note` per line) · **`cancelRequestOrderTier`** (soft-cancel a tier's lines → `line_status='cancelled'`; auto-cancel the request header when no active line remains) · `updateRequestOrderStatus` · `createPurchaseOrderFromRequest` · `updatePurchaseOrderStatus` · `updatePurchaseOrderLine`.

**Core / master sync:** `02_core_sheet_db.gs` `filterRows_` + `03_master_data_handlers.gs` `validTabs` include `request_orders`, `request_order_lines`, `purchase_orders`, `purchase_order_lines`.

**API adapter (`operation-system-db-api.js`):**
- Getters: `getRequestOrders()` · `getRequestOrderLines()` · `getPurchaseOrders()` · `getPurchaseOrderLines()`.
- Writers: `createRequestOrderDraft(payload)` · `updateRequestOrderStatus(payload)` · `updateRequestOrderLineQty(payload)` · **`cancelRequestOrderTier(payload)`** · `createPurchaseOrderFromRequest(payload)` · `updatePurchaseOrderStatus(payload)` · `updatePurchaseOrderLine(payload)`.

**API-ready principles:**
- The frontend must **not** depend on the DOM as the final source of truth.
- `sessionStorage` is used only for demo fallback / working-draft recovery.
- Writes are **header-based** (write only known columns); missing procurement tables are **auto-ensured** with the documented header; other tables are never altered.

---

## 10. Non-Goals (Phase 1)

Factory Stock deduction · Factory Allocation Engine · Carrier Rate Engine · Export Center · Template Center · payment / invoice settlement · full auto-procurement algorithm · Role & Permission · supplier API · formal document (PDF) generation. These are future work (some designed in [`REQUEST_ORDER_AND_PO_SPEC.md`](./REQUEST_ORDER_AND_PO_SPEC.md)).

---

## 11. Open Items

- Order calculation formula + auto-populate from upstream shortage (future engine).
- Reconciliation/migration path from this flat schema to the three-layer `request_order_line_sources` design.
- Supplier price list field alignment (unit_cost / currency / supplier_sku) and audit for manual overrides.
- PO number generation format; production completion (`completed_qty`) flow; shipment linking (`related_shipment_id` / `purchase_order_line_id`).
- `partially_shipped` full implementation; multi-PO split (`request_order_po_links`).

---

## 12. Request Order Analysis Page (下單系統) — Mapping v1 / v2

> **Scope note.** This section documents the **下單系統 / Request Order analysis page** (`assets/html/pages/request-order.html` + `assets/js/pages/request-order.js`) — the SKU × Country × Marketplace **analysis / suggestion view** that *feeds* the Request Order Draft (§7.1). It is **NOT** the Request Order Draft itself. **Calculation is intentionally not implemented**: Remaining / Risk / Suggested Order are placeholders.
>
> **v2 adds:** pagination (§12.8), **real source mapping** for Basic(T3) / Site Stock / 3rd Party / Ongoing Orders / Lead Time (§12.4), a clean second-layer UI (§12.7), and the Site Confirmation + Series-aggregation flow (§12.9 / §12.10). Lead Time source `supplier_price_list` now has a normalizer + `getSupplierPriceList()` getter (returns `[]` when the tab is absent).

### 12.1 Data source principle
- Rows are built from **normalized DB data**, never from the Inventory Replenishment page DOM.
- Source priority: **live DB (`getDataSourceMode() === 'google-sheet'`) → Demo Data → empty**.
- `_buildRequestOrderRowsFromDb()` assembles rows; the Inventory Replenishment / FC Summary DOM globals (`window.fcRegularData`, `window.factoryStockData`, …) are **not** a dependency of the DB path.

### 12.2 Filters (Part 1)
Filter bar = **Country · Marketplace · Risk · SKU · Search**. (Date and Category are **not** filters — Category is a tab; Date gating was removed.)

- **Country / Marketplace use OR semantics** (`_applyRequestOrderFilters`), never AND:
  - Country = All **and** Marketplace = All → show all.
  - Country selected, Marketplace = All → rows matching country.
  - Country = All, Marketplace selected → rows matching marketplace.
  - **Both selected → rows matching country OR marketplace.**
- **SKU** = keyword contains-match. **Search** button applies the SKU keyword.
- **Risk** = placeholder filter (fixed High/Medium/Low options); effectively a no-op until the risk engine exists.

### 12.3 Category tabs (Part 2)
- Main tabs are **Category-based**, sourced from **`sku_details.category`** (distinct values present in the data), with **All** first.
- Rows are filtered by the active Category tab. **Series is not used for tabs in v1.**

### 12.4 Main table mapping (Part 3)
Row identity = **SKU + Country + Marketplace** (`marketplace_skus`).

| Column | v1 source | Status |
|---|---|---|
| SKU | `marketplace_skus.sku` | **Real** |
| Country | `marketplace_skus.country` | **Real** |
| Marketplace | `marketplace_skus.marketplace` | **Real** |
| Category (tab) | `sku_details.category` (join by sku) | **Real** |
| Series | `sku_details.series` (join by sku) | **Real** |
| Risk | future risk/calculation engine | **Placeholder** → `--` |
| Basic (T3) | Σ `fc_regular_forecast` **next 3 months** (by sku+country+marketplace, month columns per year) | **Connected (v2)** — `--` if no FC row |
| Special Events | `fc_special_events` next 3 months (shown in the **second layer**, not the main table in v2) | **Placeholder** in main table → `--` |
| Site Stock | latest `amazon_inventory_snapshot` = `available_qty + fc_transfer_qty + fc_processing_qty` (same normalized source as Inventory Replenishment Current Stock; **never the DOM**) | **Connected (v2)** — `--` if no snapshot |
| 3rd Party | Σ `overseas_inventory_snapshot.available_stock` across same-country **non-factory** warehouses (same source as Inventory 3rd Party) | **Connected (v2)** — `--` if no snapshot |
| Factory Stock | **Σ `factory_stock.current_stock` for the SKU across factory warehouses** | **Real** |
| Ongoing Orders | Σ open-PO `remaining_qty` (fallback `ordered − max(shipped, completed)`) over `purchase_order_lines` ⋈ `purchase_orders.status ∈ {issued, in_production, partial_completed, partial_shipped, ready_to_ship, confirmed}` (per SKU) | **Connected (v2, best-effort)** — `--` if no open PO |
| Remaining | calculation engine | **Placeholder** → `--` |
| Lead Time | `supplier_price_list.lead_time_days` — active row (`is_active ∈ {active,true,TRUE,yes,1}`), latest `effective_from` | **Connected (v2)** — `--` if table/getter absent or no active row |
| Suggested Order | calculation engine | **Placeholder** → `--` |

> Placeholder columns render `--`. No Remaining / Risk / Suggested Order **formula** is implemented. "Connected (v2)" columns read the normalized DB source and fall back to `--` when the source table is missing (never fabricated).
>
> **Ongoing Orders caveat:** PO lines carry no country/marketplace, so the open-PO total is **per-SKU** and is repeated across a SKU's country/marketplace rows (informational; do not sum across rows). **Site Stock ≠ 3rd Party** are always separate (see §12.5).

### 12.5 Site Stock / 3rd Party Stock rule (Part 4)
**Do NOT merge Site Stock and 3rd Party Stock — always two separate columns.**

- **Platform-warehouse replenishment model:** Site Stock = platform warehouse stock; 3rd Party = 3PL / overseas warehouse stock (if applicable).
- **Self-fulfilled / overseas-warehouse model:** Site Stock may be **0** (stock is not in the platform warehouse); **3rd Party Stock represents the available overseas warehouse stock** (often the main available stock).
- **Reason:** keeping both columns visible avoids hiding *where the inventory actually sits*. Merging them would misrepresent availability for self-fulfilled SKUs.

### 12.6 Supplier / Lead Time source (Part 5)
- **v1 lead time / cost source = `supplier_price_list`** (`supplier_price_list.lead_time_days`). Use the **active** supplier price row for the SKU; if multiple active rows exist, use the primary/latest-effective row, or show `--` until a supplier-selection rule is defined. *(No normalized getter for `supplier_price_list` exists yet, so Lead Time is currently a documented placeholder.)*
- **Mid-term — add a `suppliers` master table** (vendor master layer; **spec only, not implemented in this task**):

  | Column | Note |
  |---|---|
  | `supplier_id` | PK |
  | `supplier_name` | |
  | `supplier_type` | e.g. factory / trading / 3PL |
  | `contact_name` | |
  | `contact_email` | |
  | `contact_phone` | |
  | `country` | |
  | `city` | |
  | `payment_term_id` | FK → payment terms (future) |
  | `is_active` | |
  | `created_at` | |
  | `updated_at` | |
  | `note` | |

  - `supplier_price_list.supplier_warehouse_id` / `supplier_name_snapshot` remain the **price-detail layer**; **`suppliers` is the master vendor layer**. `supplier_price_list.supplier_id` → `suppliers.supplier_id` once the master exists.

### 12.7 Second-layer UI (v2 — Part 9)
Replaced the mock-only panel with a **clean v1 structure** that renders for both DB and demo rows (bug-guarded; no crash on missing fields). **Site Stock / 3rd Party are NOT duplicated here** (they live in the main table).

**Left side (under SKU):** two buttons —
- **Edit Target %** → modal loading the current `fc_target_rules` target for SKU+country+marketplace. **Read-only in v1** (future write target `fc_target_rules`; no save handler yet → notice shown).
- **FC Update** → modal loading the current `fc_regular_forecast` (next 3 months) for SKU+country+marketplace. **Read-only in v1** (future write target `fc_regular_forecast`; no save handler yet → notice shown).

**Three-column visual grouping (v2.2 layout — a true 3-column × 2-row grid; every block is its OWN card):**

Layout = CSS grid `.ro-sku-expand-grid--v5`, columns **A 34% · B 24% · C 42%**, two rows. Each of the six blocks is an **independent card** with visible spacing — Factory Stock is **not** merged with Factory Orders, and Recommendation Summary is **not** merged with Order Allocation. Because the cards are direct grid children, each grid **row auto-stretches to equal height**: the **top row** (Past Achievement / Factory Stock / Recommendation Summary) aligns, and the **bottom row** (Future Basic/Special FC / Factory Orders / Order Allocation) aligns. DOM order is column-major, so on ≤900px the grid collapses to one column and stacks each column's cards together (no horizontal overflow).

**Column A (top → bottom)**
1. **Past Achievement Rate (Past 3 Months)** — Month · Achievement Rate · FC Qty · Actual Qty · Sessions · USP. *FC Qty* is read from `fc_regular_forecast`; Achievement Rate / Actual / Sessions / USP are **not sourced yet → `--`** (need sales snapshots).
2. **Future Basic / Special FC** — *Basic FC* (Month · FC Qty · **Target %**, from `fc_regular_forecast` next 3 months; Target % from `fc_target_rules` → % else 100% placeholder) + *Upcoming Events* (Month · FC Qty, from `fc_special_events` next 3 months, best-effort → `--`).

**Column B (top → bottom)**
3. **Factory Stock** — **Factory · Current Stock · Reserved · Available** (no Warehouse column). **Factory display = `warehouses.warehouse_name`** (join `factory_stock.warehouse_id → warehouses.warehouse_id`); fallback `warehouse_id`, then `--`. Available = `current_stock − reserved_stock` only when reserved is present, else `--`.
4. **Factory Orders (Future 2 Months)** — Month · Qty · Expected Delivery Date (no reliable per-month source yet → `--`).

**Column C — Decision block (top → bottom)**
5. **Recommendation Summary** — Month · Recommended Qty · Reason (future 4 months). **Structure only — no formula.**
6. **Order Allocation** — **Month · Bucket** · Suggested · **Order Qty (editable)** · Carton · Note. Rows T1/T2/T3 (T1 = next month, T2 = next 2 months, T3 = next 3 months). **Display order is Month → Bucket** (stored data keys unchanged). Order Qty is held in local state and persisted on **Send Request** (`request_order_allocation_drafts` / `_lines`, §3.7).

> **Recommendation Summary and Order Allocation belong to Column C (the Decision block)** — they are **NOT** placed under the Factory section. Factory Stock + Factory Orders occupy Column B only.

**Row identity:** the second layer expands by a **composite row key** `sku|company|country|marketplace` (not SKU alone), so two rows sharing a SKU on different sites (e.g. `CO1100-R / US / Amazon` vs `CO1100-R / CA / Amazon`) expand and collapse independently.

### 12.8 Top layout — filter row + action bar (v2 — Parts 1 & 2)
- **Filter row (left→right):** Country · Marketplace · Risk · **Show** · SKU · **Search**. `Show` sits **between Risk and SKU**; options **All / Confirmed / Pending / All Request** (Confirmed/Pending filter rows by their site-confirmation state; All / All Request show everything — no calculation).
- **Top action area:** **Confirm Site · All Request (select) · Send Request** live in a dedicated action bar **above the filter card** — **NOT** in the Category tabs row. The Category tabs row holds category tabs only.
- **Consistent controls:** Search, Confirm Site, All Request, Send Request share one height (`--filter-height`), border-radius (`--filter-border-radius`), font-size (`--filter-font-size`) and vertical alignment.

### 12.9 Pagination (v2 — Part 1 prior)
- Main table renders **max 25 rows per page** (`pageSize = 25`); never renders all rows at once.
- Controls: **‹ Previous / Page X / N / Next ›** + "Showing a–b of N rows".
- Filtering + Category tab apply **before** pagination; **page resets to 1** on Search / filter change / category-tab change / show-mode change.

### 12.10 Site Confirmation flow + Send Request gate (v2 — Parts 2 & 3)
Problem: if every site owner sends their own Request, the same SKU/Series gets split into many orders.
Flow: (1) each site owner views their own country/marketplace rows → (2) **Confirm Site** (opens a modal) marks that scope confirmed for the chosen planning month(s) → (3) system records the confirmations → (4) procurement can Send Request **only after all required sites in scope are confirmed** → (5) Send Request aggregates **by Series** → (6) the Request Order Draft expands to show each company/site/country/marketplace detail. **Confirm Site ≠ Send Request.**
- **Confirm Site modal fields:** **Planning Bucket(s) — T1 / T2 / T3, each shown with its month (multi-select)** · **Company (readonly, locked)** · **Country (readonly, locked)** · **Marketplace (selectable)** · **Series (All or specific)** · **Confirm All (checkbox)** · Status (fixed `confirmed`, hidden) · Note (optional). Company/Country prefill from the current data/filter scope and cannot be edited; Marketplace prefills from the filter when unambiguous. Buckets default to all three (checked). **Buttons: Save / Cancel only** (no Close). Save writes **one confirmation record per (scope × bucket)** and marks rows confirmed (Show = Confirmed / Pending reflects it). **Confirm All** applies to **every visible/eligible site scope** in the filtered view (one record per distinct company/country/marketplace[/series] × bucket).
- **Send Request gate (bucket-aware):** every distinct **site scope (country / marketplace / series)** in the current filtered view must be confirmed **for every requested bucket** — **Send T1** requires all scopes confirmed for T1, **Send T2/T3** likewise, **All Request** requires **T1 AND T2 AND T3**. If any scope/bucket is pending, Send is blocked with **"Please confirm all site scopes before sending this request."** (pending scopes listed).
- **Persistence (Fix 1 — implemented):** Confirm Site now **writes to `request_order_site_confirmations`** via `upsertRequestOrderSiteConfirmations` (Apps Script `16_request_site_confirmation_handlers.gs`, router action, `getRequestOrderSiteConfirmations` getter + normalizer). Confirmed state is **rehydrated from the DB on every render**, so it **persists across reloads**. Upsert key = `planning_cycle + company + country + marketplace + series + bucket` (same scope+bucket → update, never duplicate). **Demo mode = in-memory only.** Confirm Site records **approval state only** — it does **NOT** create `request_orders` and does **NOT** reserve / deduct stock (guardrail).

### 12.11 Request Order grouping principle (v2 — Part 8 prior)
- The analysis page shows **site-level rows** (SKU × country × marketplace).
- Site confirmation captures each site's need; **Send Request aggregates by Series** (not one order per site).
- The **Request Order Draft** then expands per Series → SKU / company / country / marketplace, avoiding the same SKU being split into too many orders.
- **Not implemented in this task** (aggregation is the future Send-Request/RO-Draft engine — guardrail); documented as the target.

### 12.12 Non-Goals (this task)
Procurement calculation engine · Remaining / Risk / Suggested Order formula · AI · real Request Order Draft aggregation / Send-Request engine · `suppliers` table · new DB tables / Apps Script handlers (spec note only) · PO status-flow change · FC Summary change · Shipment / Weekly Shipping Plan change · reliance on the Inventory Replenishment DOM.

### 12.13 T1 / T2 / T3 bucket rule + Send Request data integrity (FINALIZED)

**Finalized layer rule:**
- **Request Layer preserves T1 / T2 / T3.** Every `request_order_line` carries `request_bucket` (+ `request_month`); buckets are **never merged at the Request stage**.
- **PO Layer may merge T1 / T2 / T3 later** (T1 urgent PO separate; T2 + T3 merged normal PO; or custom grouping by supplier / factory / SKU / series) — decided in **Purchase Order Overview** (future Phase 3).
- **T1/T2/T3 are demand buckets, not direct PO-grouping rules.** Request↔PO traceability is preserved later via **`request_order_po_links`** (future). Send Request does **not** force three PO records.

**Send Request data integrity (下單系統):**
1. Send Request first creates/updates `request_order_allocation_drafts` + `_lines` (planning scratchpad), then creates the official `request_orders` + `request_order_lines`. **Draft suggestion data is never treated as official until Send Request runs.**
2. **Full-carton gate:** every selected line's `order_qty` must be an exact multiple of `units_per_carton` (when known) — otherwise Send is **blocked** with a per-SKU message.
3. **Site-confirmation gate (bucket-aware):** Send T1/T2/T3 requires confirmation for that bucket; **All Request** requires T1 ∧ T2 ∧ T3 (Confirm All treats all visible scopes as confirmed) — see §12.10.
4. Each request line keeps `request_bucket` = `T1/T2/T3`; allocation-draft lines carry snapshots (`factory_stock_snapshot`, `site_stock_snapshot`, `third_party_stock_snapshot`, `fc_qty_snapshot`, `target_pct_snapshot`), and request lines carry `forecast_qty` / `current_stock` from the same sources.

**Phasing (Part E):** Phase 1 (this task) = keep the current page/selector but preserve bucket + data integrity on every line. Phase 2 = T1/T2/T3 tabs (Draft / Pending Approval / Approved inside each). Phase 3 = Purchase Order Overview grouping assistant. UI tabs are **not** added in Phase 1; the data model already preserves bucket.

### 12.14 Decision layer vs Execution layer (finalized) + company-split storage note

- **Request Order Draft = Decision Layer.** All ordering decisions finish here: **Approved qty, KM/ResUS/ResTW company split, T1 vs T2+T3, schedule dates, tier cancel**. See §7.1.
- **Purchase Order Overview = Execution Layer.** It **inherits the approved request result** and handles execution info only (supplier / factory / payment / delivery dates). **PO Overview split/merge logic is PAUSED** — it must not re-decide T1/T2/T3 split/merge until an explicit future design. Request↔PO traceability → `request_order_po_links` (future).
- **Factory display** = `warehouses.warehouse_name`; **`warehouse_id` remains the source of truth** (shown only when no name exists; default Tier 1 = `WH-TW-CN-FACTORY-YOUXIN`).
- **Company-split storage:** the KM/ResUS/ResTW split is stored **two ways** — (1) denormalized per-line `km_qty` / `resus_qty` / `restw_qty` on `request_order_lines` (matched company = approved, others 0), and (2) the append-only **`request_order_line_sources`** rows written at request creation (source of truth for company/site/month). Each `request_order_line` still maps to **one company**; re-allocating Approved to a company that has **no existing line** for a `(sku, bucket)` is **not supported** (would require creating a new company line = follow-up).

### 3.5 `request_order_site_confirmations` (IMPLEMENTED — Fix 1)

Records per-site confirmation before Series aggregation (site-level review → confirm → Send Request). **DB-backed:** handler `16_request_site_confirmation_handlers.gs` (`upsertRequestOrderSiteConfirmations`), router action, `getRequestOrderSiteConfirmations` getter + `normalizeRequestOrderSiteConfirmationRecord`. Table auto-creates with the header below (missing-header safe). Records **approval only** — Confirm Site never creates `request_orders` and never moves stock.

| Column | Note |
|---|---|
| `site_confirmation_id` | PK (`SC-XXXXXXXXXX`) |
| `planning_cycle` | planning cycle (year of the bucket's month, e.g. `2026`) |
| `company` | (locked to the scope's company; `All` = every company) |
| `country` | (`All` = every country) |
| `marketplace` | (`All` = every marketplace) |
| `series` | (`All` = every series) |
| `bucket` | **`T1` / `T2` / `T3`** — the planning bucket confirmed (T1 = next month … T3 = +3) |
| `status` | enum: **`pending` / `confirmed` / `cancelled`** |
| `confirmed_by` | actor (placeholder identity until Role & Permission) |
| `confirmed_at` | |
| `note` | free text |
| `created_at` | |
| `updated_at` | |

**Rules:**
- **One `(scope × bucket)` = one confirmation record.** Confirming T1+T2+T3 for a scope creates **three records**; **Confirm All** multiplies across every visible scope.
- **Upsert key** = `planning_cycle + company + country + marketplace + series + bucket` — re-confirming the same scope+bucket **updates in place** (no duplicates).
- **Confirm Site ≠ Send Request.** Each site owner **Confirms** their scope/buckets; procurement verifies all required site scopes are `confirmed` for the requested bucket(s), then **Send Request** aggregates by Series into a Request Order Draft.
- **Send Request gate (bucket-aware):** Send T1/T2/T3 is blocked until every required site scope is `confirmed` for that bucket; **All Request** requires T1 AND T2 AND T3. A record with an empty `bucket` (legacy) covers all buckets.

---

## 3.6 `shipping_allocation_drafts` / `shipping_allocation_draft_lines` (draft layer — spec only)

**Purpose:** persist the **Inventory Replenishment second-layer** Shipping Allocation / Execution Plan (user input **or** AI suggestions) so a page reload does not lose the working draft. **This table does NOT reserve stock and does NOT deduct stock.** Only **Submit Plan** creates formal `shipping_plans` / `shipping_plan_lines` (Decision Layer). It is a *planning scratchpad*, not an execution record.

**`shipping_allocation_drafts` (header):**

| Column | Note |
|---|---|
| `allocation_draft_id` | PK |
| `source_page` | origin (e.g. `inventory_replenishment`) |
| `company` · `country` · `marketplace` · `sku` | scope grain |
| `plan_month` | planning month `YYYY-MM` |
| `target_window` | target-days / window label (display only) |
| `source_type` | `manual` / `ai_suggested` |
| `status` | `draft` / `site_confirmed` / `submitted` / `cancelled` |
| `created_by` · `created_at` · `updated_by` · `updated_at` · `note` | audit + note |

**`shipping_allocation_draft_lines`:**

| Column | Note |
|---|---|
| `allocation_line_id` | PK |
| `allocation_draft_id` | FK → header |
| `route_no` | route sequence within the draft |
| `ship_from` · `destination` | route endpoints |
| `qty` | allocated qty (planning only — no movement) |
| `allocation_method` | how the qty was derived (tag; no formula in this task) |
| `source_factory_warehouse_id` | factory pool reference |
| `available_stock_snapshot` | available stock at draft time (snapshot, not a live reservation) |
| `note` · `created_at` · `updated_at` | audit + note |

**Status enum:** `draft` / `site_confirmed` / `submitted` / `cancelled`. **Not implemented in this task (spec only).**

## 3.7 `request_order_allocation_drafts` / `request_order_allocation_draft_lines` (draft layer — implemented)

**Purpose:** persist the **Request Order page second-layer** Order Allocation (T1/T2/T3 editable draft) **before Send Request**, so user edits survive a reload and become the **source for Request Order Draft creation**. **No stock movement / reservation.**

**Buckets:** **T1 = next month, T2 = next two months, T3 = next three months.** Each month can be pushed independently. **No calculation formula in this task** (Suggested/Recommended are placeholders or `--`).

**`request_order_allocation_drafts` (header):**

| Column | Note |
|---|---|
| `request_allocation_draft_id` | PK |
| `planning_cycle` | planning cycle (e.g. `2026`) |
| `company` · `country` · `marketplace` · `sku` · `category` · `series` | scope grain |
| `status` | `draft` / `site_confirmed` / `submitted` / `cancelled` |
| `source_type` | `manual` / `ai_suggested` |
| `created_by` · `created_at` · `updated_by` · `updated_at` | audit |
| `submitted_by` · `submitted_at` | set when Send Request submits the draft |
| `note` | free text |

**`request_order_allocation_draft_lines`:**

| Column | Note |
|---|---|
| `request_allocation_line_id` | PK |
| `request_allocation_draft_id` | FK → header |
| `request_month` | the pushed month `YYYY-MM` |
| `request_bucket` | `T1` / `T2` / `T3` |
| `recommended_qty` | placeholder (no formula) |
| `order_qty` | **editable** user order qty (drives Request Order Draft line) |
| `carton_qty` · `units_per_carton` | carton math inputs (snapshot; may be blank) |
| `factory_stock_snapshot` · `site_stock_snapshot` · `third_party_stock_snapshot` | stock snapshots at edit time |
| `fc_qty_snapshot` · `target_pct_snapshot` | forecast + target% snapshots (display) |
| `allocation_method` | tag (no formula) |
| `note` · `created_at` · `updated_at` | audit + note |

**Status enum:** `draft` / `site_confirmed` / `submitted` / `cancelled`.

**Wiring (this task):** Apps Script `getRequestOrderAllocationDrafts` (read via `getOperationDb`), `upsertRequestOrderAllocationDraft`, `upsertRequestOrderAllocationDraftLines`, `submitRequestOrderAllocationDrafts`; adapter `KM.DB.getRequestOrderAllocationDrafts()` / `getRequestOrderAllocationDraftLines()` / `upsertRequestOrderAllocationDraft()` / `upsertRequestOrderAllocationDraftLines()` / `submitRequestOrderAllocationDrafts()`. **Send Request** reads eligible (`draft` / `site_confirmed`) lines with `order_qty > 0`, creates `request_orders` / `request_order_lines` via the existing `createRequestOrderDraft` handler (grouped by series + supplier/factory when available; else series with supplier/factory = `--`/pending), then marks the allocation drafts `submitted`. **Demo Mode:** in-memory only (no DB writes; clearly labelled).

## 3.8 `request_order_line_sources` (source of truth for company/site/month allocation — write path pending)

**Purpose:** the **append-only** detail behind each request line — **the source of truth for company / site / month allocation**. Read by the **Company Allocation popup** (Request Order Draft → SKU In Total → click a KM/ResUS/ResTW value).

| Column | Note |
|---|---|
| `line_source_id` | PK |
| `request_order_line_id` | FK → `request_order_lines` |
| `request_order_id` | FK (denormalized, for lookup) |
| `sku` | |
| `company` | KM / ResUS / ResTW … |
| `country` · `marketplace` | site grain |
| **`tier_type`** | **`T1` / `T2` / `T3`** (added by this spec) |
| **`source_month`** | **`YYYY-MM`** the demand belongs to (added by this spec) |
| `requested_qty` · `approved_qty` · `shortage_qty` | per-source quantities |
| `source_type` | `fc` / `inventory` / `lead_time` / `target_rules` / `manual` … |
| `note` | free text |

**Status (IMPLEMENTED — write + read):**
- **Write path implemented:** `handleCreateRequestOrderDraft_` (Send Request → official Request Order) appends **one `request_order_line_sources` row per request line** at creation, with finalized header `line_source_id`, `request_order_line_id`, `request_order_id`, `sku`, `company`, `country`, `marketplace`, `tier_type`, `source_month`, `requested_qty`, `approved_qty`, `shortage_qty`, `source_type`, `note`, `created_at`, `updated_at`. `tier_type` ← `request_bucket`; `source_month` ← `request_month`; `country`/`marketplace` flow from the 下單系統 row. Table auto-creates (missing-header safe). **Deprecated columns are NOT created:** `ownership_company`, `warehouse_id`, `site_sku`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `reallocation_qty`, `recommended_qty`, `allocation_method`, `source_bucket`, `source_priority`.
- **Read path implemented:** `validTabs` includes `request_order_line_sources`; adapter `KM.DB.getRequestOrderLineSources()` + `normalizeRequestOrderLineSourceRecord` (exposes `tierType`, `sourceMonth`; `requestedQty`/`approvedQty`/`shortageQty` as numbers). The **Company Allocation popup** now shows **real source rows**; it still **falls back** to `request_order_lines` grouped by company (**"Site-level source pending."**) for legacy requests created before this write path existed.

---

**Phase 1 — UI + mapping + DB handler foundation. API-ready. No auto-procurement engine, supplier API, payment flow, or formal document generation.**

**End of Document**
