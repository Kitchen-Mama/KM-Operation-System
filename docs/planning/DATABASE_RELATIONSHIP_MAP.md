# Database Relationship Map

**Status:** 🟡 Draft v1 — Database Relationship Specification (documentation only)
**Last Updated:** 2026-06-09
**Maintained By:** Development Team
**Related:** [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md), [`SUPPLY_PLANNING_CALCULATION_RULES.md`](./SUPPLY_PLANNING_CALCULATION_RULES.md), `assets/specs/active/SKU_MASTER_FLOW.md`

> Documentation only. **No code changes. No DB schema changes. No implementation.** This document maps how tables relate; it does not define field-level schemas (see the respective spec/schema docs).

> **Marketplace naming note (accepted current live design — do NOT rename in this task):**
> - `marketplaces.marketplace` may contain a platform name such as `Amazon` / `Walmart` / `Shopify`.
> - `marketplace_display_name` is user-facing display text.
> - Some display names may include company-specific wording such as `KM Amazon`.
> - `marketplace_alias` is an **import-normalization / source-name matching** helper. It **defaults to the same value as `marketplace`** (MVP: `marketplace_alias == marketplace`). On **add**, it is auto-filled from `marketplace` when blank; on **edit**, an existing non-blank alias is **never auto-overwritten** (only auto-filled when empty). Future import normalization may match a source marketplace value against `marketplace_alias` → `marketplace_display_name` → `marketplace`.
> - This document does **not** propose renaming or restructuring marketplace rows.

> **`marketplaces` columns (current live headers):** `marketplace_id`, `company`, `country`, `marketplace`, `marketplace_display_name`, `marketplace_alias`, `fulfillment_model`, `allocation_priority`, `currency`, `status`, `created_by`, `created_at`, `updated_by`, `updated_at`, `note`. A **single-alias** column only — there is **no** `marketplace_aliases` table (multiple aliases is a future option, not implemented).
> - `fulfillment_model` ∈ `platform_fulfilled` / `self_fulfilled` / `hybrid` — decides whether the marketplace uses platform inventory, shared overseas inventory, or both (see Supply Planning Allocation rule).
> - `allocation_priority` is a numeric priority for **shared overseas inventory allocation** — **higher number = higher priority**, editable by PM; becomes the system-wide shared allocation priority (future Factory / Shipping / Carrier allocation may reuse it).

---

## 1. Purpose

This document maps **how database tables relate** across the Kitchen Mama supply chain system — the foreign-key and logical relationships that connect master data, marketplace/pricing, forecast, inventory, factory/procurement, shipping, carrier, document, and future ERP layers.

It is a **relationship map**, not a schema definition and not an implementation plan.

---

## 2. Entity Layers

| Layer | Tables (incl. future) |
|-------|------------------------|
| **Master Data Layer** | `sku_details`, `sku_handbook_summaries`, `product_features` |
| **Marketplace / Pricing Layer** | `marketplaces`, `marketplace_skus`, `pricing_list`, `pricing_change_log` |
| **Forecast Layer** | `fc_regular_forecast`, `fc_special_events`, `fc_target_rules` |
| **Inventory Layer** | `factory_stock`, `factory_stock_movements`, `warehouses`, `overseas_inventory_snapshot`, `overseas_inventory_movements`, *future* marketplace inventory snapshots (e.g. `amazon_inventory_snapshot`) |
| **Factory / Procurement Layer** | `purchase_orders`, `purchase_order_lines`, `production_schedule` |
| **Shipping / Logistics Layer** | `shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_events`, `shipment_routes` |
| **Carrier / Route Layer** | `carriers`, `carrier_rate_cards`, `shipping_route_rules`, `carrier_lead_times` |
| **Document / Export Layer** | `document_templates`, `generated_documents` |
| **Future ERP / Ownership Layer** | `sales_orders` *(future)*, `sales_order_lines` *(future)*, AR/AP/accounting *(future)* |

---

## 3. Master Data Layer

**Tables:** `sku_details`, `sku_handbook_summaries`, `product_features`

- `sku_details` is the **product master** and the source for `category` / `series` / logistics dimensions + weights / carton info / **base price references** (selling_price, minimum_price, msrp).
- `sku_handbook_summaries` and `product_features` are knowledge/content tables keyed by SKU (or scope), used by SKU Handbook — not part of supply calculation.

> **`sku_details` columns (current live headers; authoritative logistics definition in [`SKU_DETAILS_LOGISTICS_SPEC.md`](./SKU_DETAILS_LOGISTICS_SPEC.md)):**
> `sku`, `product_name`, `category`, `series`, `lifecycle`, `image_url`, `gs1_code`, `gs1_type`, `amz_asin`,
> **item:** `item_length`, `item_width`, `item_height`, `item_length_2`, `item_width_2`, `item_height_2`, `item_dimension_unit`, `item_weight`, `item_weight_unit`,
> **package:** `package_length`, `package_width`, `package_height`, `package_dimension_unit`, `package_weight`, `package_weight_unit`,
> **carton:** `carton_length`, `carton_width`, `carton_height`, `carton_dimension_unit`, `carton_weight`, `carton_weight_unit`, `units_per_carton`,
> **customs / price:** `hscode`, `declared_value`, `declared_value_unit`, `minimum_price`, `minimum_price_unit`, `msrp`, `msrp_unit`, `selling_price`, `selling_unit`,
> `pm`, `created_at`, `updated_at`.
> - **Dimensions are split into `*_length` / `*_width` / `*_height` + `*_dimension_unit`** (superseding the legacy single `item_dimensions` / `package_dimensions` / `carton_dimensions` columns; the API normalizer still reads the legacy columns as a fallback).
> - **`item_length_2` / `item_width_2` / `item_height_2`** = optional **secondary item size** (e.g. a large+small combo). **Display only — NOT used in carton CBM** (`SKU_DETAILS_LOGISTICS_SPEC.md` §2).
> - **Logistics CBM / weight uses `carton_*` (and `item_weight` for net weight)** — see `SHIPMENT_CENTER_SPEC.md` §15.3.
> - **No DB migration script needed** — the sheet headers are already updated; this is a documentation + mapping sync.

| Relationship | Type |
|--------------|------|
| `sku_details.sku` ← `sku_handbook_summaries.sku` | 1 → many (logical) |
| `sku_details` ← `product_features` (scope: sku / series / category) | 1 → many (logical, scoped) |

> `sku_details` is referenced by `marketplace_skus`, `factory_stock`, `fc_regular_forecast`, etc. via `sku`.

---

## 4. Marketplace / Pricing Layer

**Tables:** `marketplaces`, `marketplace_skus`, `pricing_list`, `pricing_change_log`

```
marketplaces ──1:many──▶ marketplace_skus ──1:1──▶ pricing_list ──1:many──▶ pricing_change_log
```

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `marketplaces` → `marketplace_skus` | `marketplace_id` | 1 → many |
| `marketplace_skus` → `pricing_list` | `marketplace_sku_id` | 1 → 1 |
| `pricing_list` → `pricing_change_log` | `pricing_id` | 1 → many |

- `marketplace_skus` stores **site identity and operational settings** (site_sku, asin, status, replenishment_model, launch_date, `fulfillment_model`).
- `pricing_list` is the **pricing source of truth** (Regular / Minimum / MSRP / Currency, base + FX + effective).
- **`marketplace_skus` must NOT be treated as the final pricing source.**

**Fulfillment model:**
- `marketplaces.fulfillment_model` ∈ `platform_fulfilled` / `self_fulfilled` / `hybrid`.
- `marketplace_skus.fulfillment_model` is the **SKU-level override**: when the marketplace is `platform_fulfilled` or `self_fulfilled` the SKU value is **locked** to that model; when the marketplace is `hybrid` the **PM must select** the SKU-level fulfillment model. The Marketplace SKU's fulfillment model decides final fulfillment behavior and whether the SKU participates in **shared overseas inventory allocation** (only `self_fulfilled` — platform-fulfilled inventory is not shared).

**Import SKU Template:** for a **hybrid** marketplace, the marketplace-SKU import template must include a **Fulfillment Model column** (so each imported SKU carries its `fulfillment_model`). For `platform_fulfilled` / `self_fulfilled` marketplaces the column may be omitted/locked because the SKU model is fixed by the marketplace.

**Company rule:**
- `company` on `marketplace_skus` is **required**.
- **`company + country + marketplace`** distinguishes operational ownership.
- **`country` alone is not enough** — e.g. US can include both `KM` and `ResUS`.

---

## 5. Forecast Layer

**Tables:** `fc_regular_forecast`, `fc_special_events`, `fc_target_rules`

| Relationship | Logical key |
|--------------|-------------|
| `fc_regular_forecast` → `marketplace_skus` | `company + country + marketplace + sku` |
| `fc_special_events` → `marketplace_skus` | `marketplace_id` and/or `company + country + marketplace + sku` |
| `fc_target_rules` → forecast | by **scope**: category / series / sku |

- **Target rules adjust Regular FC only** (`Target Adjusted Forecast = Regular Forecast × Target Rule %`, default 100%).
- **Special Event FC is independent and always 100%** (no target adjustment); event demand is pulled forward one month (see calculation rules doc §8).

---

## 6. Inventory Layer

**Tables:** `factory_stock`, `factory_stock_movements`, `warehouses`, `overseas_inventory_snapshot`, `overseas_inventory_movements`, `mixed_carton_rules`, *future* `amazon_inventory_snapshot` (and similar).

> **Current `overseas_inventory_snapshot` columns (warehouse-side inventory):** `overseas_inventory_id`, `snapshot_date`, `warehouse_id`, `sku`, `site_sku`, `physical_stock`, `available_stock`, `reserved_stock`, `damaged_stock`, `on_the_way_qty`, `on_the_way_eta`, `on_the_way_bucket`, `last_movement_at`, `updated_by`, `created_at`, `updated_at`, `note`.
> - `available_stock = physical_stock − reserved_stock − damaged_stock`.
> - `on_the_way_qty` / `on_the_way_eta` / `on_the_way_bucket` = inbound-to-warehouse qty + ETA + ETA bucket (warehouse-side on-the-way source).
>
> **Current `overseas_inventory_movements` columns (movement ledger):** `movement_id`, `movement_date`, `warehouse_id`, `sku`, `site_sku`, `movement_type`, `movement_scope`, `from_stock_type`, `to_stock_type`, `quantity`, `quantity_before`, `quantity_after`, `before_physical_stock`, `after_physical_stock`, `before_reserved_stock`, `after_reserved_stock`, `before_available_stock`, `after_available_stock`, `reference_type`, `reference_id`, `source_module`, `created_by`, `created_at`, `note`.
> - Logs **before/after balances per stock type** (physical / reserved / available); `movement_scope` classifies the movement domain; `from_stock_type → to_stock_type` models holds/releases (e.g. `available → reserved`). Intended write path for **future reservation control** (not yet implemented).
>
> **`mixed_carton_rules` (newly added table):** registered for a **future mixed-carton extension**. **Not implemented** — no mapping, write path, or relationship is defined yet.

> **Amazon snapshot + import-log tables:** the Amazon snapshot tables (`amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot`, `amazon_daily_sales_snapshot`) and the import-governance tables (`import_sync_runs`, `import_sync_issues`) are **import-only**, populated by the config-driven importer. Their **field-level headers, governance, freshness/fallback, and capping flags** are specified in [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) (this relationship map intentionally does not duplicate field-level schema).

| Relationship | Key |
|--------------|-----|
| `factory_stock` → `sku_details` | `sku` |
| `factory_stock_movements` → `factory_stock` | logical: `sku + factory_name` |
| `overseas_inventory_snapshot` → `warehouses` | `warehouse_id` |
| `overseas_inventory_movements` → `warehouses` | `warehouse_id` (+ `sku`) |

- `warehouses` is the **warehouse master**.
- **Overseas inventory = warehouse-side inventory** (3PL / marketplace logistics), **not** factory stock.
- **Factory stock = production-side inventory** (at CN_YOUXIN / TW_SHENGYI).

**Warehouse ID convention:** `WH-{COMPANY}-{COUNTRY}-{TYPE}-{NAME}`

Examples:
- `WH-RESUS-US-3PL-WINIT`
- `WH-RESUS-US-3PL-AMZLGS`
- `WH-RESUS-US-RETURN-AMZLGS_LIKE_NEW`
- `WH-KM-US-3PL-AMZLGS`

---

## 7. Factory / Procurement Layer

**Tables:** `purchase_orders`, `purchase_order_lines`, `production_schedule`

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `purchase_orders` → `purchase_order_lines` | `purchase_order_id` | 1 → many |
| `purchase_order_lines` → `production_schedule` | `purchase_order_line_id` (if needed) | 1 → many |
| `purchase_order_lines` → `shipment_lines` | `purchase_order_line_id` | linkable |

- **ResTW is the procurement hub** (KM / ResUS route demand through ResTW).
- Factories **CN_YOUXIN** and **TW_SHENGYI** are **production resources, not company entities**.

---

## 8. Shipping / Logistics Layer

**Tables:** `shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_events`, `shipment_routes`

> **`shipping_plans` / `shipping_plan_lines` columns (authoritative definition in [`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`](./WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md); planned design, not yet migrated):**
> - **`shipping_plans`:** `shipping_plan_id`, `shipping_plan_no`, `plan_name`, `company`, `country`, `marketplace`, `ship_from`, `destination`, `shipping_method`, **`plan_version`**, **`parent_shipping_plan_id`**, **`submit_batch_id`**, **`batch_status`**, `carrier_id`, `carrier_unit_rate`, `carrier_rate_type`, `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `currency`, `status`, `created_by`, `created_at`, `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejected_reason`, **`cancelled_by`**, **`cancelled_at`**, **`transferred_to_shipment_at`**, **`transferred_shipment_id`**, **`completed_at`**, **`completed_by`**, `note`, `source`, **`updated_by`**, `updated_at`.
>   - **`transferred_to_shipment_at` / `transferred_shipment_id`** — Execution-Layer **handoff metadata** written when the Approved plan is converted to a Shipment Draft (Execution Commit). **Not part of the Decision Snapshot** (Immutable Flow preserved); `status` stays `approved`. A non-blank value makes the Approved card show the **Done** button (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §12.1/§12.2).
>   - **`completed_at` / `completed_by`** — **Decision Layer Completion** (Done). `completed_at` non-blank ⇒ **Decision Layer finished** (Execution Layer has taken over); the plan **leaves the Weekly Shipping Plan Active view** (`completed_at IS NULL` only) but the row is **never deleted** and is viewable via the **Completed** filter. Done writes **only** these (+ `updated_*`) — it does **not** touch `shipments` / `shipment_lines` and does not change `status` (stays `approved`). `completed_by` is a placeholder actor (`system_user`; future Role & Permission). See `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §10 (four-layer lifecycle).
>   - **`cancelled_by` / `cancelled_at`** — set on **soft Cancel** (status → `cancelled`; the row and its `shipping_plan_lines` are **never deleted**; UI hides cancelled by default — `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §9A/§9B).
>   - **Actor fields** (`created_by`, `submitted_by`, `approved_by`, `rejected_by`, `cancelled_by`, `updated_by`) are **placeholder actors** in MVP (e.g. `system_user` / `current_user` / `admin@kitchenmama.com`); a future **Role & Permission / User Management** module replaces them with real user identity (no schema change — only the value source). They must never block Save / Submit / Cancel (§13A).
>   - **Group key (FINAL):** a Shipping Plan is uniquely grouped by the **six values** `company` + `country` + `marketplace` + `ship_from` + `destination` + `shipping_method`; if any differs, it is a new plan.
>   - **`plan_version`** — decision-revision counter (default 1; in-Draft edits do not bump; Reject→Draft→resubmit = +1). **MVP reuses the same `shipping_plan_id` row across reject/resubmit** — only `plan_version` increments (no new row per version).
>   - **`parent_shipping_plan_id`** — version-lineage anchor; **MVP: `parent_shipping_plan_id = shipping_plan_id`**. Reserved for a future one-row-per-version model (each version row points back to the original); MVP does not create per-version rows.
>   - **`submit_batch_id`** — shared across all plans created by one Submit Plan action (history / audit / AI / reporting).
>   - **`batch_status`** — batch-level summary across the `submit_batch_id` group (`open` / `partial_approved` / `approved` / `rejected` / `cancelled` / `mixed`); **derived helper only**, may be rolled up from member plans.
>   - **`status` vs `batch_status`:** `status` = the **individual** Shipping Plan approval status (PRIMARY: `draft / pending_approval / approved / rejected / cancelled`); `batch_status` = **batch-level summary** for all plans sharing the same `submit_batch_id` (helper, never the primary approval status).
> - **`shipping_plan_lines`:** `shipping_plan_line_id`, `shipping_plan_id` (FK), `sku`, `requested_qty`, `approved_qty`, `carton_qty`, `units_per_carton`, `source_page`, `source_reason`, `inventory_snapshot_date`, `note`, `created_at`, `updated_at`, **+ planning snapshots (FINALIZED on the line, not on the header):** `snapshot_current_stock`, `snapshot_avg_sales_per_day`, `snapshot_days_of_supply`, `snapshot_suggested_qty`, `snapshot_target_days`, `snapshot_fc_context`, `snapshot_event_context`, **+ Avg-Sales source/quality snapshot:** `snapshot_avg_sales_source`, `snapshot_normal_days_count`, `snapshot_excluded_event_days_count`, `snapshot_avg_sales_warning`, **+ logistics Decision Snapshot:** `carton_cbm`, `cbm`, `gross_weight`, `net_weight`.
>   - **`carton_cbm` / `cbm` / `gross_weight` / `net_weight` are part of the Decision Snapshot** (per-line), computed from `sku_details` carton dims/weights at Submit Plan and recomputed on every Draft Save (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §5.4). `carton_cbm` = single-carton CBM (`L×W×H/1,000,000`, cm); `cbm = carton_qty × carton_cbm`. Header CBM/weight totals are **Runtime** (Σ lines), not stored on `shipping_plans`. Copied into `shipment_lines` (`carton_cbm` / `cbm` / `gross_weight` / `net_weight`) at Execution Commit (`SHIPMENT_CENTER_SPEC.md` §15.3).
>   - `snapshot_avg_sales_source` — records **which Avg Sales source** the Decision adopted (fixed enum: `weekly_7d` / `normalized_30d` / `manual_override` / `forecast_override` / `ai_adjusted`; runtime uses `weekly_7d` / `normalized_30d`).
>   - `snapshot_avg_sales_per_day` — records the **final Avg Sales/day the Runtime Engine adopted** at Decision Commit.
>   - The Normalized Avg Sales **Runtime Calculation itself is NOT persisted** — only this frozen snapshot is (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22.6). These are **frozen decision context, not a live calculation**; `snapshot_avg_sales_source` and `snapshot_avg_sales_warning` are independent fields.
> - **Snapshot location is finalized to `shipping_plan_lines`** (per-SKU); planning snapshots are **not** stored on `shipping_plans`. Shipment Draft inherits the line snapshots without recalculation.
> - **Company snapshot flow (FINAL):** `marketplaces.company` → **`shipping_plans.company`** (copied at Submit Plan / Decision Commit; resolution priority `marketplaces` → `marketplace_skus` → payload → blank+warning, see `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.3) → **`shipments.company`** (copied at Execution Commit when the Shipment Draft is created, see `SHIPMENT_CENTER_SPEC.md` §2). Each layer **persists** company on its **header**; downstream layers must **not** live-join `marketplaces` to recover company for historical records (legacy blank rows may live-join for **display only**). **`company` is part of the `shipping_plans` six-value group key** (not display-only).
> - **`company` is NOT duplicated onto line tables:** neither `shipping_plan_lines` nor `shipment_lines` carry `company` — lines inherit it from the header via `shipping_plan_id` / `shipment_id`.
>
> **`shipments` / `shipment_lines` columns (Execution Layer; authoritative definition in [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) §2; created at Execution Commit):**
> - **`shipments`:** `shipment_id`, `shipment_no`, `shipping_plan_id`, `reference_id`, `warehouse_id`, `warehouse_code`, `company`, `country`, `marketplace`, `ship_from`, `destination`, `carrier_id`, `rate_card_id`, `shipping_method`, `status`, `sales_order_id`, `booking_no`, `tracking_number`, `container_no`, `bl_no`, `invoice_no`, `etd`, `eta`, `actual_departure_date`, `actual_arrival_date`, `customs_clearance_date`, `delivered_date`, `total_qty`, `total_cartons`, `total_cbm`, `total_gross_weight`, `total_net_weight`, `freight_cost_actual`, `duty_actual`, `currency`, `note`, `created_by`, `created_at`, `updated_by`, `updated_at`.
>   - The header six-key context + `carrier_id` + `total_qty` / `total_cartons` are **copied from the approved `shipping_plan` at Execution Commit (not recalculated)**. Editable execution fields: carrier / booking / container / BL / invoice / ETD / ETA / tracking / dates / costs / `note` / `status`.
> - **`shipment_lines`:** `shipment_line_id`, `shipment_id` (FK), `sku`, `qty`, `factory_stock_allocation_qty`, `carton_qty`, `carton_no_start`, `carton_no_end`, `units_per_carton`, `cbm`, `gross_weight`, `net_weight`, `purchase_order_line_id`, `note`, `created_at`, `updated_at`, **+ Execution Snapshot (copied verbatim from the Decision Snapshot, immutable):** `snapshot_current_stock`, `snapshot_avg_sales_per_day`, `snapshot_days_of_supply`, `snapshot_suggested_qty`, `snapshot_target_days`, `snapshot_fc_context`, `snapshot_event_context`, `snapshot_avg_sales_source`, `snapshot_avg_sales_warning`.
>   - **Execution Snapshot = copy, never recalculation** (ARCHITECTURE §4A). `qty` = the plan line's `approved_qty`. After creation the Shipment reads only `shipments` / `shipment_lines` — never the Weekly Shipping Plan.
>   - **Shipment Draft** and **Shipment Overview** are **two views over the same `shipments` / `shipment_lines`** (differing only by a status filter): Draft = `draft` / `planned` / `ready_to_ship` (execution fields editable); Overview = all non-draft (read-only fields). Both display **Marketplace**. Editable execution fields go through the `updateShipment` whitelist; snapshot + logistics columns are read-only (`SHIPMENT_CENTER_SPEC.md` §4/§5).
>
> **Architecture governance:** the principles for **immutable flow**, **decision snapshot**, **execution snapshot**, **layer source-of-truth**, and **business object identity** are governed by [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md). **No DB schema change** is implied by that file — it is a discipline over the existing tables (read upstream, freeze a snapshot, own only your layer's records).

```
shipping_plans ──1:many──▶ shipping_plan_lines
       │ (approved → convert; shipment copies an execution snapshot, never recalculates)
       ▼
shipments ──1:many──▶ shipment_lines
   ├──1:many──▶ shipment_events
   └──1:many──▶ shipment_routes
```

| Relationship | Key | Notes |
|--------------|-----|-------|
| `shipping_plans` → `shipping_plan_lines` | `shipping_plan_id` | 1 → many |
| approved `shipping_plan` → `shipments` | conversion | 1 → one or more |
| `shipments` → `shipment_lines` | `shipment_id` | 1 → many; actual shipped SKU lines |
| `shipment_lines` → `purchase_order_lines` | `purchase_order_line_id` | may reference |
| `shipments` → `sales_orders` | `sales_order_id` | **future** reference |
| `shipments` → `shipment_events` | `shipment_id` | actual tracking/timeline events |
| `shipments` → `shipment_routes` | `shipment_id` | planned/route waypoint structure |

- `shipments` stores the **formal execution snapshot** (header + lines copied at creation).
- **Shipping History** = read view over `shipments` + `shipment_lines`. **No separate Shipping History DB.**
- **On The Way** = visual/operational view over `shipments` + `shipment_lines` + `shipment_events` + `shipment_routes`. **No separate On The Way DB.**

---

## 9. Carrier / Route Layer

**Tables:** `carriers`, `carrier_rate_cards`, `shipping_route_rules`, `carrier_lead_times`

> **Authoritative column definitions for `carriers` / `carrier_rate_cards` / `shipping_route_rules` live in [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md)** (foundation tables; planned design, not yet migrated; **no pricing engine**).
> - **`carriers`:** `carrier_id`, `carrier_code`, `carrier_name`, `carrier_type` (`air`/`sea`/`express`/`rail`/`courier`/`forwarder`), `scac_code`, `default_currency`, `contact_name`, `contact_email`, `contact_phone`, `website`, `is_active`, `note`, `created_by`, `created_at`, `updated_by`, `updated_at`.
> - **`carrier_rate_cards`:** `rate_card_id`, `carrier_id` (FK), `route_code`, `ship_from`, `destination`, `shipping_method`, `rate_type` (`per_kg`/`per_cbm`/`per_carton`/`per_container`/`flat`), `unit_rate`, `currency`, `min_charge`, `fuel_surcharge_pct`, `duty_rate_pct`, `transit_days`, `valid_from`, `valid_to`, `is_active`, `note`, `created_by`, `created_at`, `updated_by`, `updated_at`. **Price + validity source for the future Carrier Price Engine only — no calculation defined.**
> - **`shipping_route_rules`:** `route_rule_id`, `company`, `country`, `marketplace`, `shipping_method`, `route_code`, `default_ship_from`, `default_destination`, `default_carrier_id` (FK), `priority`, `is_active`, `note`, `created_by`, `created_at`, `updated_by`, `updated_at`. **Drives the default `ship_from` / `destination` / `route_code` pre-filled on a Weekly Shipping Plan; the plan may OVERRIDE `ship_from` / `destination`.**

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `carriers` → `carrier_rate_cards` | `carrier_id` | 1 → many |
| `carriers` → `shipping_route_rules` | `default_carrier_id` | 1 → many (optional) |
| `carriers` → `carrier_lead_times` | `carrier_id` | 1 → many |
| `shipping_route_rules` → `shipping_plans` | `company + country + marketplace + shipping_method` → default `ship_from` / `destination` / `route_code` | reference (overridable) |
| `carrier_rate_cards` ↔ `shipping_route_rules` | `route_code` | shared route identifier |
| `shipping_plans` → `carriers` | `carrier_id` | reference |
| `shipments` → `carriers` | `carrier_id` | reference |
| `shipments` → `carrier_rate_cards` | `rate_card_id` | reference |

- `carrier_rate_cards` include `route_code` and `transit_days`.
- `shipping_route_rules` provides routing **defaults only** — the Weekly Shipping Plan's chosen `ship_from` / `destination` win and are persisted on `shipping_plans` (part of the six-value group key, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1).
- `ship_from` / `destination` are **logical warehouse / location ids** resolved via `warehouses` (consistent with `shipments.warehouse_id`).
- Until the future **Carrier Price Engine** exists, the Weekly Shipping Plan **Cost Breakdown stays a placeholder** (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §11).
- `carrier_lead_times` supports **ETA planning** (used by On The Way ETA buckets and shipment planning; defined later).

---

## 10. Document / Export Layer

**Tables:** `document_templates`, `generated_documents`

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `document_templates` → `generated_documents` | `template_id` | 1 → many |

- `generated_documents.related_entity_type` / `related_entity_id` can reference:
  - `shipment`
  - `purchase_order`
  - `sales_order` *(future)*
  - `report` *(future)*
- **Export Center / Document Center** is the future UI; **Template Management is a sub-tab, not the whole module.**

---

## 11. Future ERP / Ownership Layer

**Tables (future):** `sales_orders`, `sales_order_lines`, AR/AP/accounting.

- **Physical shipment flow and ownership flow are separate.**
- **Ownership model:** `Factory → ResTW → KM / ResUS / ResTW → Customer`
- **ResTW** is both **procurement hub** and **non-US operating entity**.
- **ResUS** handles **US Res marketplaces**.
- **KM** handles **Kitchen Mama brand operations**.
- **Full ERP accounting is future scope.**

```
Factory (CN_YOUXIN / TW_SHENGYI)
        ▼
ResTW (procurement hub / non-US operating entity)
        ▼
KM  /  ResUS  /  ResTW   (operating entities)
        ▼
Customer
```

---

## 12. Key Relationship Flow Diagram

```
sku_details
   ▼
marketplaces ──▶ marketplace_skus
                      ▼
                 pricing_list ──▶ pricing_change_log
                      ▼
   fc_regular_forecast / fc_special_events / fc_target_rules
                      ▼
   Inventory Replenishment  /  Request Order      ◀── factory_stock, overseas_inventory_snapshot, on-the-way
                      ▼
                shipping_plans ──▶ shipping_plan_lines
                      ▼ (approve → convert)
                  shipments
                      ▼
   shipment_lines  /  shipment_events  /  shipment_routes
                      ▼
              generated_documents

Procurement branch (links into shipment_lines):
   purchase_orders ──▶ purchase_order_lines ──▶ production_schedule
                                │
                                └──(purchase_order_line_id)──▶ shipment_lines
```

---

## 13. Page-to-Table Map

| Page | Primary Reads | Primary Writes |
|------|---------------|----------------|
| Inventory Replenishment | marketplace_skus, fc_regular_forecast, factory_stock, overseas_inventory_snapshot, shipments (on-the-way) | shipping_plans, shipping_plan_lines (on Submit Plan) |
| FC Summary | fc_regular_forecast, fc_special_events, fc_target_rules, marketplace_skus | fc_regular_forecast / events / rules (edits) |
| Factory Stock | factory_stock, sku_details (category/series join) | — (read; movements future) |
| Warehouse Management *(future)* | warehouses, overseas_inventory_snapshot | warehouses, overseas_inventory_movements |
| Shipping Plan | shipping_plans, shipping_plan_lines | shipping_plans status/approval |
| Formal Shipment | shipping_plans, shipping_plan_lines (snapshot source), carriers, carrier_rate_cards | shipments, shipment_lines |
| Shipment On The Way | shipments, shipment_lines, shipment_events, shipment_routes, carrier_lead_times | — (visualization) |
| Shipment History | shipments, shipment_lines | — (read) |
| Request Order / 下單系統 | fc_regular_forecast, marketplace_skus, factory_stock, overseas_inventory_snapshot, shipments (on-the-way) | future: purchase_orders, purchase_order_lines |
| Purchase Order | purchase_orders, purchase_order_lines, production_schedule | purchase_orders, purchase_order_lines |
| Carrier / Route Management | carriers, carrier_rate_cards, shipping_route_rules, carrier_lead_times | carriers, carrier_rate_cards, shipping_route_rules, carrier_lead_times |
| Export / Document Center | document_templates, shipments / purchase_orders | generated_documents |
| Company Management | marketplaces (company values), marketplace_skus | marketplaces |
| Permission / Role Management *(future)* | role/permission tables *(future)* | role/permission tables *(future)* |

---

## 14. Persistence Rules

- **Calculation previews do not persist unless submitted.**
- **Shipping Allocation preview has no DB in MVP.**
- **`shipping_plans` persist only after Submit Plan.**
- **`shipments` persist only after explicit formal shipment creation.**
- **`generated_documents` persist after document generation.**

| Artifact | Persisted? | Trigger |
|----------|-----------|---------|
| Replenishment / order calculation | No | preview |
| Shipping Allocation preview | No (no DB in MVP) | preview |
| shipping_plans / lines | Yes | Submit Plan |
| shipments / shipment_lines | Yes (snapshot) | explicit formal shipment creation |
| generated_documents | Yes | document generation |

---

## 15. Open Items

- `sales_orders` / `sales_order_lines` *(future)*
- Permission / role model
- Exact warehouse management UI
- Shipment document field templates
- Carton number automation (Amazon / carrier docs)
- Final Inventory Projection Engine implementation
- Future ERP accounting layer

---

## Notes / Cross-document Consistency

- **Field-name divergence (carry-over):** `marketplace_skus` operational status is referred to as `marketplace_sku_status` in SYSTEM_ROADMAP / API, but as `status` in `SKU_MASTER_FLOW.md` §7. This map uses "status (operational)" generically; the naming reconciliation remains an open decision (not resolved here).
- **Company enum:** values are `KM` / `ResUS` / `ResTW` (DB enum); user-facing labels may read "Kitchen Mama" / "Res US" / "Res TW". Marketplace display names may include company wording (e.g. `KM Amazon`) — accepted as current design.

---

**Draft v1 Database Relationship Specification — subject to revision. Documentation only; no code or DB changes are implied by this document.**

**End of Document**
