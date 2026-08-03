# Request Order / 下單系統 & Purchase Order System — Specification

**Status:** 🔵 **EXTENDED / FUTURE PROCUREMENT ARCHITECTURE REFERENCE** — Draft v1.3, SPEC ONLY (NO code, NO DB, NO implementation). **NOT the current Runtime/DB authority.**
**Last Updated:** 2026-06-16
**Maintained By:** Development Team
**Related:** [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) (**CURRENT IMPLEMENTED authority — Procurement Phase 1: schema, status lifecycle, Convert-to-PO, allocation persistence, snapshot completeness**), [`PURCHASE_ORDER_SPEC.md`](./PURCHASE_ORDER_SPEC.md) (PO v2 Workspace / Receive), [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md), [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md)

> **⚠️ AUTHORITY (2026-07 documentation sync).** This is the **EXTENDED / FUTURE** procurement architecture reference. The **CURRENT IMPLEMENTED Procurement Phase 1** design — `request_orders` / `request_order_lines` / `request_order_line_sources` / `request_order_site_confirmations` / `request_order_allocation_drafts`, the Convert-to-PO mapping, the T1 vs T2+T3 split, company-based persistence, and the Request/PO **status lifecycle** — is owned by **[`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md)**. This document **must NOT be treated as the current Runtime/DB authority**, and it **does not override** the Phase-1 schema or status enum. It retains valid future concepts — multi-layer source structure, `supplier_price_list`, `payment_terms`, `request_order_po_links`, multi-PO architecture, extended factory communication — as design to migrate toward (additively). Where the two disagree about *what is implemented today*, the Phase-1 spec wins.
>
> **⚠️ B-5 CANONICAL DECISION (2026-08-03 — decision only).** The final `request_order_lines` / `request_order_line_sources` grain, quantity authority, Monthly SKU split, and Recommendation→Request writer boundary are now RESOLVED by **[`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.9](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md)**. B-5 selected **Company-on-Line** — the line natural key is `(request_order_id, company, sku, request_bucket)` and **`company` stays on the line**; it did **NOT** adopt this document's *SKU-level aggregated line with company only on the source* (§3 three-layer diagram). This document's **1→N source breakdown** (`request_order_line_sources` per company/country/marketplace/warehouse/site) IS the canonical direction — but as demand-provenance under a company-scoped line, not a company-less aggregated line. The helper counts, `source_type` / `source_priority`, `request_order_po_links`, and multi-PO concepts remain valid future design. This document is not the B-5 owner; §3.9 governs.
>
> **Spec only.** This document defines architecture, flow, UI, and data relationships for the Request Order → Purchase Order layer. It introduces **no** code, Apps Script, API, UI, DB migration, BigQuery, or runtime changes. New tables/fields described here are *planned* design, not implemented. It deliberately does **not** re-define calculation formulas — those live in [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md).
>
> **Changelog v1 → v1.1:**
> - Added future `source_type` / `source_priority` fields to `request_order_line_sources`.
> - Added planned `request_order_po_links` table for **one request converting to multiple purchase orders**.
> - Clarified that `request_orders.converted_purchase_order_id` remains the MVP / backward-compatible shortcut (primary PO reference) but is **not sufficient** for multi-PO conversion — the full relationship belongs to `request_order_po_links` once introduced.
> - All v1 architecture decisions are preserved (three-layer request structure; header has no company/country/marketplace; lines stay SKU-level; sources hold the company/site breakdown; `ownership_company` = ResTW planning metadata only; PO does not own approval workflow; `supplier_price_list` / `payment_terms`; `available_to_ship = completed_qty − shipped_qty`).
>
> **Changelog v1.1 → v1.2:**
> - Added `source_company_count` and `source_site_count` to `request_order_lines`.
> - Clarified these are **aggregated display / helper fields derived from `request_order_line_sources`** — not source-of-truth fields.
> - Preserved `request_order_line_sources` as the **authoritative** source breakdown table (helper counts never replace it; on mismatch, the sources table wins).
> - All v1 / v1.1 architecture decisions are preserved (three-layer structure; `source_type` / `source_priority`; `request_order_po_links` future table; `ownership_company` = ResTW planning metadata only; PO does not own approval workflow; `supplier_price_list` / `payment_terms`; `available_to_ship = completed_qty − shipped_qty`; page specs; non-goals; open items).
>
> **Changelog v1.2 → v1.3:**
> - Added the complete **Request → Purchase Order → Document Generation → Factory Communication flow** (§15).
> - **Clarified Purchase Order `draft` / `issued` status meaning** and added them to the `order_status` enum (`draft` = formal PO created, not yet sent; `issued` = generated/sent/confirmed to factory).
> - Added **PO document generation node** using `document_templates` / `generated_documents` (§16), with PO placeholder tokens.
> - Clarified **MVP manual email to factory** and future automation / API / supplier portal (§17).
> - Clarified that **PO `draft` is an execution-preparation status, NOT an approval workflow** — approval lives entirely on `request_orders`.
> - All v1 / v1.1 / v1.2 decisions preserved (three-layer structure; `source_company_count` / `source_site_count`; `source_type` / `source_priority`; `request_order_po_links`; `ownership_company` = ResTW planning metadata only; `supplier_price_list` / `payment_terms`; `available_to_ship = completed_qty − shipped_qty`; page specs; non-goals; open items).

---

## 1. Purpose & Scope

This spec defines how Kitchen Mama goes from a **planning recommendation** to a **formal procurement record**:

1. **下單系統 (Request Order calculation page)** — calculates recommended order quantities across all companies / sites / marketplaces and lets the user push **one combined Request**.
2. **Request Order Draft** — the request approval workflow (Draft / Pending Approval / Approved / Rejected / Cancelled).
3. **Purchase Order Overview** — formal PO execution + production tracking, after an approved request is converted.
4. **Purchase Order List** — raw PO-line status view (ordered / completed / shipped / remaining).

It also defines the supporting masters (`supplier_price_list`, `payment_terms`) and the relationship to `production_schedule` and `shipment_line_allocations`.

**This is the bridge layer** referenced in `SUPPLY_PLANNING_CALCULATION_RULES.md` §15 ("Request Order is the bridge between planning calculation and procurement records") and `SUPPLY_CHAIN_SYSTEM_FLOW.md` Step 8.

---

## 2. Layer Distinction (authoritative)

The Request Order / PO system spans the first three layers below; the fourth is explicitly future-only. Keeping these separate is the central architectural rule of this spec.

| # | Layer | Concern | Tables |
|---|-------|---------|--------|
| 1 | **Planning Layer** | Forecast, shortage, factory allocation, demand origin | `request_orders`, `request_order_lines`, `request_order_line_sources`, *(future)* `factory_stock_allocation_plans` |
| 2 | **Procurement Execution Layer** | Formal orders to factories, production tracking | `purchase_orders`, `purchase_order_lines`, `production_schedule` |
| 3 | **Shipment Execution Layer** | Physical movement & PO consumption | `shipments`, `shipment_lines`, `shipment_line_allocations` |
| 4 | **Ownership / Accounting Layer** | Who owns / bills / accounts | *Future only — NOT MVP* (no SO/AR/AP) |

> **Planning allocation and ownership/accounting are separate layers.** Demand origin (which company/site needed the qty) is *planning metadata* in `request_order_line_sources`; it does **not** create intercompany sales orders or accounting records.

---

## 3. Core Architecture Decision — Three-Layer Request Structure

```
request_orders                 (one overall request batch / header)
   ↓ 1 → many
request_order_lines            (SKU-level aggregated order quantity)
   ↓ 1 → many
request_order_line_sources     (company / country / marketplace / warehouse / site source breakdown)
```

**Why three layers:**

- **`request_orders`** = one overall request batch / header (one "push" action).
- **`request_order_lines`** = **SKU-level aggregated** order quantity (the qty actually ordered per SKU). One row per SKU in the batch.
- **`request_order_line_sources`** = the **source breakdown** answering *"this total order qty came from which company / site / marketplace needs?"*

**UI vs DB grouping rule:**
- The UI **may group by Series** (using SKU Details), but the **DB must stay SKU-level**.
- **Series does not need to be stored** in `request_order_lines` — it can be joined from SKU Details by `sku` (`sku_details.series`). Same for category.

**Header-level company rule (critical):**
- **Do NOT store `company` / `country` / `marketplace` on the `request_orders` header** if a request can contain multiple companies / sites.
- Company / site / marketplace source identity belongs **only** in `request_order_line_sources`.

---

## 4. Core Flow (end-to-end)

```
下單系統 (calculation page)
        ↓
System calculates recommended order quantities across all companies / sites / marketplaces
        ↓
User reviews & pushes ONE combined Request
        ↓
Create request_orders + request_order_lines + request_order_line_sources   (request_status = draft)
        ↓
Request Order Draft page
   draft → pending_approval → approved / rejected / cancelled
        ↓  (on approval + convert)
Approved Request converts to Purchase Order(s)
   Create purchase_orders + purchase_order_lines        (request_status → converted_to_po)
        ↓
Purchase Order Overview
   Production Schedule / Production Completion
        ↓
completed_qty updates purchase_order_lines
        ↓
available_to_ship = completed_qty − shipped_qty
        ↓
Shipment FIFO allocation uses shipment_line_allocations   (Shipment Center; see SHIPMENT_CENTER_SPEC.md)
        ↓
Purchase Order List shows raw PO line status
```

**Approval ≠ execution.** The submit / approve / reject / cancel workflow lives entirely on **`request_orders`** (Planning Layer). The **Purchase Order is the formal execution record created only after an approved request is converted** — the PO does **not** own a submit/approve/reject workflow.

---

## 5. DB Schemas (planned design — not implemented)

> Convention: factory/source location and company come from `warehouses` via `warehouse_id` (per the recent DB redesign, see `SHIPMENT_CENTER_SPEC.md` §0). Inventory/PO/production tables do not store `factory_name`/`company`.

### 5.1 `request_orders` — request header / batch

```
request_order_id
request_no
request_batch_id
request_scope
source_calculation_run_id
request_status
request_date
submitted_by
submitted_at
approved_by
approved_at
rejected_by
rejected_at
rejected_reason
converted_purchase_order_id
created_by
created_at
updated_by
updated_at
note
```

**Definitions:**
- `request_scope` — `all_companies` / `single_company` / `single_marketplace` / `manual`.
- `request_batch_id` — optional id grouping one push action, if a single push needs to be tracked as a batch.
- `source_calculation_run_id` — links to the calculation engine run that produced the recommendation (future calculation spec).
- `converted_purchase_order_id` — link to the resulting PO when **one request → one PO** (MVP / backward-compatible shortcut = primary PO reference). This single FK is **not sufficient** for **multi-PO conversion** (e.g. split by factory); the full request → many POs relationship belongs to the planned **`request_order_po_links`** table (§5.9). Per-line traceability remains available via `request_order_lines.linked_purchase_order_line_id`.
- `request_status` enum: `draft`, `pending_approval`, `approved`, `rejected`, `cancelled`, `converted_to_po`.
  - **`converted_to_po`** means the approved request has been **converted into formal PO record(s)** (one or, via `request_order_po_links`, multiple POs). This request-layer enum is **unchanged** in v1.3 — the request layer owns submit/approve/reject/cancel; the PO `draft`/`issued` states (§5.4) are a **separate** execution-preparation lifecycle.

**Important:** No `company` / `country` / `marketplace` on this header — those live in `request_order_line_sources`.

### 5.2 `request_order_lines` — SKU-level aggregated quantity

```
request_order_line_id
request_order_id
sku
factory_item_no
factory_item_name
supplier_warehouse_id
recommended_qty
requested_qty
approved_qty
final_order_qty
forecast_qty
current_stock
on_the_way_qty
factory_allocated_qty
shortage_qty
reallocation_qty
carton_qty
units_per_carton
unit_cost
currency
calculation_method
line_status
linked_purchase_order_line_id
source_company_count
source_site_count
note
created_at
updated_at
```

**Definitions:**
- `recommended_qty` — system recommended quantity before user edit.
- `requested_qty` — user-edited quantity.
- `approved_qty` — quantity after approval.
- `final_order_qty` — final quantity used to convert into PO.
- `forecast_qty` / `current_stock` / `on_the_way_qty` / `factory_allocated_qty` / `shortage_qty` / `reallocation_qty` — **calculation snapshots** captured at request time (the aggregated roll-up of the source rows).
- `carton_qty` / `units_per_carton` — carton snapshot. Carton rounding per calc rules §14: `Recommended Order Qty = CEILING(Order Need ÷ Units Per Carton) × Units Per Carton`; `units_per_carton` sourced from `sku_details` (missing → validation error / manual review, never silent default).
- `unit_cost` / `currency` — snapshots from `supplier_price_list` when available (copied at request time).
- `calculation_method` — label for how the recommendation was derived (links conceptually to the calculation engine).
- `linked_purchase_order_line_id` — connects to `purchase_order_lines` after conversion (supports the multi-PO case at line granularity).
- `source_company_count` *(helper / summary field)* — number of **unique source companies** contributing to this request line.
- `source_site_count` *(helper / summary field)* — number of **unique site-level sources** (company × country × marketplace × warehouse × site_sku) contributing to this request line.
- `line_status` enum: `draft`, `pending_approval`, `approved`, `rejected`, `cancelled`, `converted_to_po`.

> **`source_company_count` / `source_site_count` are derived aggregates from `request_order_line_sources`**, kept on the line for **UI summary / quick review** (e.g. "this SKU's qty came from 2 companies / 3 sites" without expanding the source rows). They **do not replace** `request_order_line_sources`. If a count and the underlying source rows ever disagree, **`request_order_line_sources` remains the authoritative source** and the counts must be recomputed from it.

**Important:** This table is **SKU-level aggregated quantity**. It does **not** represent company/site source detail — that belongs to `request_order_line_sources`. `series`/`category` are **not stored** here; join from `sku_details` by `sku`.

### 5.3 `request_order_line_sources` — source breakdown (core)

```
request_order_line_source_id
request_order_line_id
company
ownership_company
country
marketplace
warehouse_id
site_sku
source_type
source_priority
forecast_qty
current_stock
on_the_way_qty
factory_allocated_qty
shortage_qty
reallocation_qty
recommended_qty
requested_qty
approved_qty
allocation_method
calculation_run_id
note
created_at
updated_at
```

**Definitions:**
- `company` — demand/source company, e.g. `KM` / `ResUS` / `ResTW`.
- `ownership_company` — ownership / supply-hub company; **MVP default = `ResTW`**.
- `country` / `marketplace` / `warehouse_id` / `site_sku` — site-level source identity.
- `source_type` *(future-ready metadata)* — describes **why this source row exists**. Suggested enum: `shortage_based`, `forecast_share`, `transfer_need`, `manual_override`, `reallocation`, `safety_stock`.
- `source_priority` *(future-ready metadata)* — optional **numeric** priority for future allocation/reallocation logic. A **lower number can mean higher priority** if the system later needs deterministic prioritization.
- `source_type` / `source_priority` are **future-ready metadata only**; they must **not** trigger ownership or accounting behavior.
- `forecast_qty` / `current_stock` / `on_the_way_qty` / `factory_allocated_qty` / `shortage_qty` / `reallocation_qty` — per-source calculation snapshot.
- `recommended_qty` / `requested_qty` / `approved_qty` — **source-level contribution** to the aggregated request line. (Sum of source rows ≈ the parent `request_order_lines` aggregated qty.)
- `allocation_method` examples: `forecast_share`, `shortage_based`, `manual_override`, `reallocation`.
- `calculation_run_id` — links to future calculation engine output.

**Purpose:** This is the **core source breakdown**. It answers: *"This total order qty came from which company / site / marketplace needs?"*

**Ownership rule (MVP):** `ownership_company` is **planning metadata only**. It does **not** drive accounting or any intercompany transaction. **Do not create SO / intercompany accounting flow in this spec.**

### 5.4 `purchase_orders` — formal PO header (execution)

```
purchase_order_id
po_no
km_po_no
source_request_order_id
warehouse_id
supplier_name
order_status
order_date
inspection_date
expected_completion_date
expected_ship_date
outer_carton_batch_no
nameplate_note
subtotal_amount
deposit_amount
balance_amount
paid_amount
payment_status
payment_term_id
currency
created_by
created_at
updated_by
updated_at
note
```

> **Compatibility note:** This extends the `purchase_orders` schema baseline in `SHIPMENT_CENTER_SPEC.md` §0 with procurement/payment fields (`source_request_order_id`, `inspection_date`, `outer_carton_batch_no`, `nameplate_note`, `subtotal_amount`, `deposit_amount`, `balance_amount`, `paid_amount`, `payment_status`, `payment_term_id`, `currency`). The Shipment baseline's submit/approve/reject fields are **intentionally dropped** here (workflow lives on `request_orders`).

**Definitions:**
- `source_request_order_id` — links back to the approved request.
- `warehouse_id` — supplier/factory warehouse id from `warehouses` (source location; **no `factory_name`**).
- `supplier_name` — supplier name **snapshot** for historical display.
- `inspection_date` — 驗貨日期.
- `expected_completion_date` — 預計完工日.
- `expected_ship_date` — 預計出貨日.
- `outer_carton_batch_no` — 外箱批號.
- `nameplate_note` — 銘板備註 / 銘板資訊.
- `payment_status` enum: `unpaid`, `deposit_paid`, `partial_paid`, `fully_paid`, `overdue`, `cancelled`.
- `order_status` enum: `draft`, `issued`, `in_production`, `partial_completed`, `completed`, `partial_shipped`, `shipped`, `closed`, `cancelled`.
  - `draft` — formal PO has been **created from an approved Request** but is still being reviewed/edited **before being sent to the factory** (execution-preparation, **not** an approval state).
  - `issued` — PO document has been **generated / sent / confirmed to the factory**; the factory can begin execution.
  - `in_production` — factory has started production.
  - `partial_completed` — some quantity completed.
  - `completed` — full ordered qty completed.
  - `partial_shipped` — some completed quantity has been consumed by shipments.
  - `shipped` — all ordered/completed quantity has been shipped or allocated as shipped.
  - `closed` — final closed state after all execution is complete.
  - `cancelled` — PO cancelled; must **not** be used for shipment allocation.

> The previous `open` value is **superseded by `draft` → `issued`** to make the pre-production lifecycle explicit (created-but-not-sent vs sent-to-factory). `draft`/`issued` are **execution-preparation** states owned by the PO; they are **not** the request approval workflow (which lives on `request_orders`).

**Important:** Formal PO **does not own** submit/reject/approve workflow — those fields belong to `request_orders`. Purchase Order is the formal execution record created **after** an approved request is converted.

### 5.5 `purchase_order_lines` — PO line (execution)

```
purchase_order_line_id
purchase_order_id
source_request_order_line_id
sku
factory_item_no
factory_item_name
ordered_qty
completed_qty
shipped_qty
remaining_qty
carton_qty
units_per_carton
unit_cost
currency
expected_completion_date
actual_completion_date
line_status
note
created_at
updated_at
```

**Definitions:**
- `source_request_order_line_id` — links back to `request_order_lines`.
- `unit_cost` / `currency` — **PO line snapshots** (copied from `supplier_price_list` at PO creation time).
- `completed_qty` — produced/completed quantity.
- `shipped_qty` — quantity already consumed by shipment allocation.
- `remaining_qty` — reporting / backward-compatible remaining quantity.
- **`available_to_ship = completed_qty − shipped_qty`** (computed; **do NOT store**). Shipment FIFO must never ship more than this (see `SHIPMENT_CENTER_SPEC.md` §6).
- `line_status` enum: `open`, `in_production`, `partial_completed`, `completed`, `partial_shipped`, `shipped`, `closed`, `cancelled`.

### 5.6 `production_schedule` — upstream production readiness (existing)

Keep the existing schema (unchanged from `SHIPMENT_CENTER_SPEC.md` §0):

```
production_schedule_id
purchase_order_id
purchase_order_line_id
warehouse_id
sku
scheduled_month
scheduled_start_date
scheduled_completion_date
actual_completion_date
planned_qty
completed_qty
remaining_qty
status
created_at
updated_at
```

**Definition:** Production Schedule is **upstream production-readiness data**. It supports PO progress display, but **shipment allocation uses `purchase_order_lines.completed_qty` and `shipped_qty`**, not `production_schedule`. Source location via `warehouse_id` → `warehouses` (no `factory_name`).

### 5.7 `supplier_price_list` — cost / pricing master

```
supplier_price_id
supplier_warehouse_id
supplier_name_snapshot
sku
factory_item_no
factory_item_name
unit_cost
currency
moq
lead_time_days
payment_term_id
effective_from
effective_to
is_active
created_by
created_at
updated_by
updated_at
note
```

**Definitions:**
- `factory_item_name` — factory-side item name; **may differ from SKU Details product name**.
- This table is the **cost/pricing master**.
- **SKU Details `declared_value` is for customs/declaration, NOT purchase cost.** The two must not be conflated.
- **PO line `unit_cost` must be a snapshot copied from the price list at PO creation time** (price list may change later; PO records the price at order time).
- `supplier_warehouse_id` → `warehouses` (factory/supplier warehouse).
- `payment_term_id` → `payment_terms`.

### 5.8 `payment_terms` — payment term master

```
payment_term_id
term_name
deposit_rate
balance_rate
deposit_due_trigger
balance_due_trigger
default_currency
is_active
created_by
created_at
updated_by
updated_at
note
```

**Example — "30/70 before shipment":**
- `deposit_rate = 30`
- `balance_rate = 70`
- `deposit_due_trigger = po_created`
- `balance_due_trigger = before_shipment`

### 5.9 `request_order_po_links` — future multi-PO linkage table *(planned, not MVP)*

```
request_order_po_link_id
request_order_id
purchase_order_id
supplier_warehouse_id
split_method
created_by
created_at
note
```

**Definitions:**
- Supports **one request converting into multiple POs**.
- Useful when one combined Request must **split by supplier / factory** (e.g. part of the request goes to `CN_YOUXIN`, part to `TW_SHENGYI`).
- `request_order_id` → `request_orders`; `purchase_order_id` → `purchase_orders`; `supplier_warehouse_id` → `warehouses` (the factory/supplier the split PO is placed with).
- `split_method` examples: `by_supplier_warehouse`, `by_factory`, `manual_split`.

**Relationship to existing linkage fields:**
- This table is **future-ready** — **not** part of MVP.
- **MVP may still use `request_orders.converted_purchase_order_id`** for the simple **one request → one PO** case.
- **`request_order_lines.linked_purchase_order_line_id`** can still support **line-level traceability** (which PO line a request line became), independent of this table.
- **If `request_order_po_links` exists later**, `converted_purchase_order_id` should be treated as a **backward-compatible shortcut / primary PO reference only** — `request_order_po_links` becomes the **full (request → many POs) relationship source**.

---

## 6. Page Spec — A. 下單系統 (Request Order calculation page)

**Purpose:** Calculation / recommendation page. It calculates order recommendations across **all companies / sites / marketplaces**.

**Behavior:**
- User reviews the generated recommendation.
- User pushes **one combined Request**.
- System creates `request_orders` + `request_order_lines` + `request_order_line_sources` in one action (`request_status = draft`).
- **Calculation formula details are deferred** to the calculation spec ([`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md)) — do not fully define all formulas here. Snapshots (`forecast_qty`, `shortage_qty`, `reallocation_qty`, `recommended_qty`, carton rounding) are persisted onto the three request tables at push time.

**Aggregation contract:** the page may present recommendations grouped by Series/SKU, but on push it writes **SKU-level** `request_order_lines` with the **source breakdown** in `request_order_line_sources` (one source row per company/country/marketplace/warehouse/site contributing to that SKU).

---

## 7. Page Spec — B. Request Order Draft

**Role:** request approval workflow. **UI is the card / expand style** of Weekly Shipping Plan / Shipment Overview.

**Top selectors:** Date · `request_status` · Series · SKU · **Search** button.
- **Date** uses the **standard date range picker** (preset list + start/end inputs + dual calendar + Apply/Cancel), consistent with Forecast Review / Overseas Stock Movement Log / Shipment Overview.
- **Search-gated** (recommended, consistent with other pages): render rows only after Search; no fake data in Demo OFF.

**Layer 1 card (collapsed):**
- `request_status` · `request_no` · `submitted_at` · Series · Expand · Submit · Cancel.

**Expanded Layer 2 — title: "SKU List"**

**Section 1 — SKU Details table:**

| Column | Source |
|--------|--------|
| SKU | `request_order_lines.sku` |
| Current Stock | snapshot (`current_stock`) |
| Following 3 months FC | forecast snapshot |
| Avg. Sales / FC | calc display |
| Days of Supply | calc display |
| Order Qty | `requested_qty` (editable) |
| Carton | `carton_qty` (auto) |

**Totals:** Total SKU · Total Qty · Total Ctn.

**Editable behavior:**
- SKU row can be removed via an **X icon**.
- **Order Qty is editable**.
- **Order Qty must be an integer carton multiple** (`Order Qty % units_per_carton === 0`).
- If invalid → **red border + validation message**.
- **Carton auto-updates** when Order Qty changes (`carton_qty = Order Qty ÷ units_per_carton`).

**Section 2 — schedule/notes:** `inspection_date` · `expected_completion_date` · `expected_ship_date` · `note`.

**Section 3 — payment:** Factory · Deposit · Balance · Total · Payment Status · Payment Term.

**Payment display rule:**
- **Outsourced supplier/factory** → show deposit / balance / payment term (from `payment_terms` + computed `deposit_amount` / `balance_amount`).
- **Internal / self-owned factory** → may **hide** deposit/balance or display **"N/A Internal Factory"**.

> Submit moves the request `draft → pending_approval`. Approve/Reject (manager/COO) sets `approved` / `rejected` (+ `rejected_reason`). Cancel sets `cancelled`. On convert, status → `converted_to_po` and PO records are created (§4, §8 of this spec).

---

## 8. Page Spec — C. Purchase Order Overview

**Purpose:** formal PO execution and production tracking.

**Top selectors:** Date · `order_status` · Series · SKU · **Search** button.

**Tabs (factory/supplier):**
- **CN 侑鑫** (`CN_YOUXIN` / 東莞侑鑫)
- **TW 勝一** (`TW_SHENGYI` / 南投勝一)
- **Future:** tabs generated from supplier/factory `warehouses` (`is_factory_warehouse = true`). Factory users may later be permission-limited to their own factory (permission **not** implemented in this spec).

**Layer 1 card (collapsed):**
- `order_status` · `order_date` · Series · `po_no` · `km_po_no` · `expected_completion_date` · Expand.

**Expanded — SKU Details:**

**Section 1 — line table:** SKU · `factory_item_no` · Order Qty (`ordered_qty`) · Carton (`carton_qty`).
- **Totals:** Total SKU · Total Qty · Total Ctn.

**Section 2 — schedule:** `inspection_date` · `expected_completion_date` · `expected_ship_date` · `outer_carton_batch_no` · `nameplate_note`.

**Section 3:** Note.

**Section 4 — payment:** Factory · Deposit · Balance · Total · Payment Status · Payment Term.

**Permission note:** Payment status may be editable by specific authorized users in the future. **Do not implement permission in this spec.**

---

## 9. Page Spec — D. Purchase Order List

**Purpose:** raw PO **line** status view.

**Selectors:** Date · Category · Series · SKU · **Search** button.

**Columns:**

| Column | Source |
|--------|--------|
| SKU | `purchase_order_lines.sku` |
| Category | `sku_details.category` (join by sku) |
| Series | `sku_details.series` (join by sku) |
| Factory | `purchase_orders.warehouse_id` → `warehouses.warehouse_name` |
| PO_NO | `purchase_orders.po_no` |
| ordered_qty | `purchase_order_lines.ordered_qty` |
| completed_qty | `purchase_order_lines.completed_qty` |
| shipped_qty | `purchase_order_lines.shipped_qty` |
| remaining_qty | `purchase_order_lines.remaining_qty` |

**Data source:** `purchase_orders` + `purchase_order_lines` + `sku_details` (category/series) + `shipment_line_allocations` (for the shipped relationship if needed).

---

## 10. Relationship to Production & Shipment

**Production completion:**
```
production_schedule.completed_qty / actual_completion_date
        ↓ (drives)
purchase_order_lines.completed_qty
        ↓
available_to_ship = completed_qty − shipped_qty
```

**Shipment consumption (see `SHIPMENT_CENTER_SPEC.md` §6):**
- Shipment FIFO allocation consumes PO lines where **`available_to_ship = completed_qty − shipped_qty > 0`** — **never ship uncompleted quantity**, even if `remaining_qty` is larger.
- **`shipment_line_allocations`** records which PO lines were consumed by which shipment lines (one shipment line ← many PO lines; one PO line → many shipment lines; FIFO default).
- After allocation: `purchase_order_lines.shipped_qty` (+) and `remaining_qty` (−) update.
- **Do not expose `purchase_order_line_id` to users**; surface `po_no` via the allocation join.

```
purchase_orders ─▶ purchase_order_lines ─(available_to_ship)─▶ shipment_line_allocations ─▶ shipment_lines
                                          ▲
                              production_schedule (readiness)
```

---

## 11. Company / Site Allocation Rules

- UI can **aggregate by Series/SKU**, but **source detail remains in `request_order_line_sources`**.
- A single Request Order total qty may **combine KM / ResUS / ResTW / multiple marketplaces**.
- `request_order_line_sources` **preserves demand origin** (company / country / marketplace / warehouse / site_sku).
- `ownership_company` **defaults to `ResTW`** for MVP.
- This does **NOT** create an intercompany sales order or accounting records.
- **Planning allocation** and **ownership/accounting** are **separate layers** (§2).

This mirrors `SUPPLY_PLANNING_CALCULATION_RULES.md` §12–13 (company reallocation, factory shared pool) and `SUPPLY_CHAIN_SYSTEM_FLOW.md` §3 (KM/ResUS place demand through ResTW; ResTW = procurement hub).

---

## 12. Snapshot & Persistence Rules

- **Calculation previews are not persisted** until the user pushes the Request (consistent with calc rules §17 / system-flow §7).
- On push, **calculation snapshots** (`forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `shortage_qty`, `reallocation_qty`, `recommended_qty`, carton fields) are copied onto `request_order_lines` and `request_order_line_sources` so the request is a stable historical record independent of later forecast changes.
- **`unit_cost` / `currency`** are snapshotted from `supplier_price_list` at request time (line) and again at PO creation (PO line) — the PO price is authoritative for that order even if the price list later changes.
- `supplier_name` on `purchase_orders` is a **display snapshot**; live supplier identity comes from `warehouses` via `warehouse_id`.

---

## 13. Non-Goals

Do **not** implement (now): code · UI · DB migration · Apps Script · API · BigQuery · role / permission · intercompany SO · full accounting · automatic supplier email · automatic PO PDF generation · payment transaction accounting · AI recommendation engine.

---

## 14. Open Items

- Exact **order calculation formula** (deferred to calculation spec / future calculation engine).
- **Factory stock allocation calculation method** (forecast/company/marketplace/warehouse).
- **Reallocation rules across companies**.
- **`ownership_company` future behavior** (when ownership/accounting layer is introduced).
- **One request converting to multiple POs** (e.g. split by factory) — now designed via the planned **`request_order_po_links`** table (§5.9). MVP still uses header `converted_purchase_order_id` (one request → one PO) and per-line `linked_purchase_order_line_id` (line-level traceability); the multi-PO linkage table is **future / not implemented now**, at which point `converted_purchase_order_id` becomes a backward-compatible primary-PO shortcut only.
- **Payment permission control** (who can edit payment status).
- **Supplier price update governance** (effective dating, who can change, approval).
- **PO number / KM PO number rule** (`po_no` / `km_po_no` generation format).
- **Production completion approval flow** (who confirms `completed_qty`).
- **Shipment allocation override** (manual override beyond FIFO).
- **Integration with Export Center** (PO document generation via `generated_documents` / `document_templates`).
- **Integration with Cost Analysis** (using `unit_cost` snapshots).
- **API migration and BigQuery mapping** for these tables.
- **PO document template token mapping** (token → DB field for each PO template — future Mapping / Export Center spec; §16).
- **Automatic email to factory** (replace MVP manual download-and-email; §17).
- **Supplier / factory portal acknowledgement** (factory ack + status update back into the PO — future; §17).
- **PO `issued` confirmation rule** (what action/check sets `order_status = issued`; whether issuing is gated on document generation/send).

---

## 15. Request to Purchase Order End-to-End Flow

This documents how the **order side** operates after the calculation page creates a Request: through approval, PO creation, PO document generation, and (MVP-manual) factory communication. The three-table request structure (§3), the status enums (§5.1, §5.4), and `available_to_ship` (§5.5) remain authoritative.

```
 1. 下單系統 (calculation page) gives recommended order quantities
 2. User / planner reviews recommendation and plans quantity
 3. Dedicated responsible person pushes ONE combined Request
 4. System creates: request_orders + request_order_lines + request_order_line_sources   (request_status = draft)
 5. Request Order Draft page:
       review / adjust request lines, notes, inspection_date, expected_completion_date,
       expected_ship_date, payment info if needed → Submit for approval         (→ pending_approval)
 6. Manager approval
 7. COO approval                                                                  (→ approved)
 8. Approved Request converts to Purchase Order
 9. System creates: purchase_orders + purchase_order_lines        (request_status → converted_to_po)
10. Purchase Order Overview receives the PO
11. Initial purchase_orders.order_status = draft
12. User reviews / edits PO execution details if needed
13. User generates PO document                                   (document_type = PURCHASE_ORDER; §16)
14. Purchase Order List shows PO line status records             (read/view over PO tables; §15.3)
15. MVP: user manually downloads / emails the PO document to the factory   (→ order_status = issued; §17)
16. Future: automatic email / supplier portal / API
17. After factory starts production, PO status progresses through production status   (in_production …)
18. Factory completes goods → production completion updates purchase_order_lines.completed_qty
19. Completed PO quantities become available for Shipment:
       available_to_ship = completed_qty − shipped_qty
20. Weekly shipment confirmation continues in the Shipment Center (see SHIPMENT_CENTER_SPEC.md)
```

### 15.1 Request Approval vs PO Execution

- **Request Order Draft is the approval workflow.**
- **`request_orders` owns submit / approve / reject / cancel.**
- **Purchase Order does NOT own the approval workflow.**
- **Purchase Order is created only after request approval / conversion.**
- **PO `draft` is NOT an approval draft.**
- **PO `draft`** means a **formal PO record exists but has not been finalized / issued to the factory**.
- **PO `issued`** means the **PO document has been generated / sent / confirmed for factory execution**.

> Two distinct lifecycles: the **request approval lifecycle** (`draft → pending_approval → approved/rejected/cancelled → converted_to_po`) on `request_orders`, and the **PO execution lifecycle** (`draft → issued → in_production → … → closed/cancelled`) on `purchase_orders`. They must not be conflated.

### 15.2 Production Completion

- **Production completion can be entered manually in MVP**, or later through a **factory portal / API**.
- **Production completion updates `purchase_order_lines.completed_qty`** (and `actual_completion_date`).
- **Header `purchase_orders.order_status` should be derived / synchronized from line statuses** (e.g. all lines completed → header `completed`; some → `partial_completed`).
- **Do not ship uncompleted quantity.**
- **Shipment allocation uses `available_to_ship = completed_qty − shipped_qty`** (FIFO; see `SHIPMENT_CENTER_SPEC.md` §6).

### 15.3 Purchase Order List relationship

- **Purchase Order List is NOT a separate execution DB.**
- It **reads `purchase_orders` + `purchase_order_lines`**.
- It shows raw PO **line** status: SKU · Category · Series · Factory · PO_NO · `ordered_qty` · `completed_qty` · `shipped_qty` · `remaining_qty` (Category/Series joined from `sku_details`; Factory from `warehouses` via `warehouse_id`).
- It **may also use `shipment_line_allocations`** to show the shipped relationship.
- It should **update automatically** as PO lines and shipment allocations change (it is a view/projection, not an independent record store).

---

## 16. Purchase Order Document Generation

> **Generated PO documents are derived outputs, not source-of-truth records.** They are assembled from the authoritative PO data; regenerating a document must not change underlying records.

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

**For PO documents:**
- `document_type = PURCHASE_ORDER`
- `related_entity_type = purchase_order`
- `related_entity_id = purchase_order_id`

**PO template placeholder tokens** (examples):
`{{PO_NO}}`, `{{KM_NO}}`, `{{DOC_DATE}}`, `{{SHIP_MONTH}}`, `{{SHIP_DATE_FULL}}`, `{{LINE_ITEMS}}`, `{{TOTAL_QTY}}`, `{{TOTAL_CARTONS}}`, `{{SUPPLIER_DATE_FULL}}`, `{{DOC_DATE_PLUS_5}}`.

- **`{{LINE_ITEMS}}` is a repeatable line block** built from `purchase_order_lines`.
- **Exact token-to-DB mapping belongs to a future Mapping Spec / Export Center Spec** — not part of this update.
- The template file can remain **Word / Excel / Google Docs** format depending on implementation (`template_file_type`).

> Consistent with `SHIPMENT_CENTER_SPEC.md` §16: one document dataset → many rendered templates; documents are derived, not authoritative.

---

## 17. Factory Communication

**MVP (manual):**
- System generates the PO document.
- User downloads / opens the generated file.
- User **manually emails the PO document to the factory**.
- User may attach additional packaging / spec files if needed.
- User **updates PO `order_status` to `issued`** after sending / confirming.

**Future:**
- automatic email sending
- supplier / factory portal
- factory acknowledgement
- status update from factory
- API integration if available

> **Do not implement email automation in this spec. Do not add a supplier-portal DB now.** These are future items (see §14 Open Items).

---

**Draft v1.3 — Spec only. No code, DB, API, Apps Script, or runtime changes are implied by this document.**

**End of Document**
