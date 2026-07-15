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
> - **UI display label rule (FC Summary + Inventory Replenishment):** dropdowns / tables show `marketplace_display_name` (fallback `marketplace`); the **selected/stored value + write payload stay the canonical `marketplace` key** (display name is never the DB key). Options dedupe by value+label pair (not key alone) so `KM Walmart` etc. stay visible. See `FC_SUMMARY_SPEC.md` §11 / `INVENTORY_TABLE_MAPPING_SPEC.md` §2.1.
> - **FC Summary filters (FC_SUMMARY_SPEC §13):** Company / Marketplace / Country / Category / Series / Event Type dropdowns always show their **full option set** (non-cascading — earlier faceted narrowing was removed). Selecting a value filters the table only, not the other dropdowns' options. Table filtering uses the **internal** marketplace key (label is display-only); a dimension with nothing checked shows no rows. SKU stays a free-text row filter.
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
| **Marketplace / Pricing Layer** | `marketplaces`, `marketplace_skus`, `sku_regional_details` *(new — planned)*, `tax_referral_rates` *(new — planned; Tax/Referral Reference Master)*, `pricing_list`, `pricing_change_log` |
| **Forecast Layer** | `fc_regular_forecast`, `fc_special_events`, `fc_target_rules` |
| **Inventory Layer** | `factory_stock`, `factory_stock_movements`, `warehouses`, `overseas_inventory_snapshot`, `overseas_inventory_movements`, *future* marketplace inventory snapshots (e.g. `amazon_inventory_snapshot`) |
| **Factory / Procurement Layer** | `request_orders`, `request_order_lines`, `purchase_orders`, `purchase_order_lines`, `production_schedule` |
| **Shipping / Logistics Layer** | `shipping_plans`, `shipping_plan_lines`, `shipments`, `shipment_lines`, `shipment_events`, `shipment_routes` |
| **Carrier / Route Layer** | `carriers`, `carrier_rate_cards`, `shipping_route_rules`, `carrier_lead_times` |
| **Import Job Framework Layer** *(new — planned, platform)* | `import_jobs`, `import_job_details` — generic, review-gated staging for **every** import (Carrier first adopter); see `IMPORT_JOB_FRAMEWORK_SPEC.md` / `IMPORT_JOB_DATABASE_SPEC.md`. (Distinct from `import_sync_runs`, the unattended Amazon-sync audit log.) |
| **Document / Export Layer** | `document_templates`, `document_template_fields`, `generated_documents` |
| **Future ERP / Ownership Layer** | `sales_orders` *(future)*, `sales_order_lines` *(future)*, AR/AP/accounting *(future)* |

---

## 3. Master Data Layer

**Tables:** `sku_details`, `sku_handbook_summaries`, `product_features`

- `sku_details` is the **product master** and the source for `category` / `series` / logistics dimensions + weights / carton info / **base price references** (selling_price, minimum_price, msrp).
- `sku_handbook_summaries` and `product_features` are knowledge/content tables keyed by SKU (or scope), used by SKU Handbook — not part of supply calculation.

> **`sku_details` columns (current live headers; authoritative logistics definition in [`SKU_DETAILS_LOGISTICS_SPEC.md`](./SKU_DETAILS_LOGISTICS_SPEC.md); Product-Master cleanup in [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md)):**
> `sku`, `product_name`, `category`, `series`, `lifecycle`, `image_url`, `gs1_code`, `gs1_type`, `amz_asin`,
> **item:** `item_length`, `item_width`, `item_height`, `item_length_2`, `item_width_2`, `item_height_2`, `item_dimension_unit`, `item_weight`, `item_weight_unit`,
> **package:** `package_length`, `package_width`, `package_height`, `package_dimension_unit`, `package_weight`, `package_weight_unit`,
> **carton:** `carton_length`, `carton_width`, `carton_height`, `carton_dimension_unit`, `carton_weight`, `carton_weight_unit`, `units_per_carton`,
> **attributes (NEW — planned, `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` §2.3):** `material` (multi-value underscore e.g. `Stainless_Steel_ABS`), `battery_type` (`none`/`built_in`/`removable`/`lithium`/`unknown`), `magnet_type` (`none`/`magnetic`/`unknown`),
> **baseline price (brand reference, NOT live price):** `minimum_price`, `msrp`, `selling_price`, **`base_currency`** (NEW — the single currency for all three),
> `pm`, `created_at`, `updated_at`.
> - **Customs fields (NEW 2026-07):** **`product_name_cn`** (Chinese customs/product name) and **`product_use`** (customs-facing product usage/purpose). Both **nullable** (optional for legacy rows; missing values must not break existing SKU flows). Editable in **SKU Details** via the top **`Edit SKU`** action (persisted by `upsertSkuDetail`, which updates `sku_details` by `sku`, preserves omitted columns, and has **no** marketplace / pricing / FC / factory-stock side effects). API exposes `productNameCn` / `productUse`. Kept on `sku_details` (NOT on `sku_regional_details`).
> - **SKU Details is the product master** — identity / logistics / baseline price / customs-facing base attributes. The SKU Details **page table excludes AMZ ASIN**: `marketplace_product_id` (ASIN) is Marketplace-SKU / Regional identity (`marketplace_skus` / `sku_regional_details`), not a master column — the DB column is kept, only the page column was removed (2026-07). Status (`lifecycle`) is edited only through the full Edit SKU modal (row-level status-only editing retired). `battery_type` / `magnet_type` display No/Yes/original-text (extensible, not boolean).
> - **DEPRECATED on `sku_details` (stop writing; read-fallback only during migration — `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`):** `minimum_price_unit` / `msrp_unit` / `selling_unit` (replaced by **`base_currency`**); **`hscode` / `declared_value` / `declared_value_unit` → MOVED to the `tax_referral_rates` Reference Master (§4B), keyed by `series` (SKU Domain v2.0). NOT stored on `sku_regional_details`.** Spec only — no live column added/renamed/removed yet.
> - **Dimensions are split into `*_length` / `*_width` / `*_height` + `*_dimension_unit`** (superseding the legacy single `item_dimensions` / `package_dimensions` / `carton_dimensions` columns; the API normalizer still reads the legacy columns as a fallback).
> - **`item_length_2` / `item_width_2` / `item_height_2`** = optional **secondary item size** (e.g. a large+small combo). **Display only — NOT used in carton CBM** (`SKU_DETAILS_LOGISTICS_SPEC.md` §2).
> - **Logistics CBM / weight uses `carton_*` (and `item_weight` for net weight)** — see `SHIPMENT_CENTER_SPEC.md` §15.3.
> - **No DB migration script needed** — the sheet headers are already updated; this is a documentation + mapping sync.

| Relationship | Type |
|--------------|------|
| `sku_details.sku` ← `sku_handbook_summaries.sku` | 1 → many (logical) |
| `sku_details` ← `product_features` (scope: sku / series / category) | 1 → many (logical, scoped) |

> `sku_details` is referenced by `marketplace_skus`, `factory_stock`, `fc_regular_forecast`, etc. via `sku`.

> **SKU Add / Edit dialog (planned — spec [`SKU_DETAILS_ADD_EDIT_SPEC.md`](./SKU_DETAILS_ADD_EDIT_SPEC.md)):** the v1 Add/Edit field set follows the **current `sku_details` template** above. **Add** creates a master row (and MAY seed a Factory Stock baseline row — future); **Edit** updates `sku_details` only. **Editing the master must NOT mutate historical Decision / Execution / PO snapshots** (`shipping_plan_lines` / `shipment_lines` / `purchase_order_lines` froze their values at commit — Immutable Flow). Dropdown options come from front-end enums now → future `option_lists` / `system_settings` (not yet implemented). Lifecycle enum needs reconciliation with `00_config.gs` `VALID_LIFECYCLES_` before build.

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

- `marketplace_skus` stores **site identity and operational settings**. **Canonical columns (target — `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` §5):** `marketplace_sku_id`, `marketplace_id`, `sku`, `company`, `country`, `marketplace`, `site_sku`, **`marketplace_product_id`** (platform-neutral; **replaces `asin`**), `currency`, `marketplace_sku_status`, `replenishment_model`, `fulfillment_model`, `launch_date`, `created_at`, `updated_at`.
  - **`asin → marketplace_product_id` migration:** ASIN is Amazon-specific; the DB column is **`marketplace_product_id`** and Amazon's ASIN is stored there. The **UI may show the label "ASIN"** when `marketplace = Amazon`. Legacy `asin` is **read-fallback only during migration** — not canonical, no new writes.
- `pricing_list` is the **pricing source of truth** (Regular / Minimum / MSRP / Currency, base + FX + effective). **Independent — NOT moved into `sku_regional_details`.**
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

## 4A. `sku_regional_details` — Regional / Marketplace Compliance Master (SKU Domain v2 — planned)

**Layer 2** of the SKU Master Domain (authoritative: [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md) v2.0). Holds SKU-level **regional product info** and is the **higher-level source of truth for marketplace identifiers** (`site_sku`, `marketplace_product_id`). **Tax/duty/HS-code/declared-value fields were REMOVED in v2** and relocated to `tax_referral_rates` (§4B). **Spec only — not yet created in the live DB.**

> **Columns (v2):** `regional_detail_id` (PK), `sku` (→ `sku_details.sku`), `company`, `country`, `marketplace`, `site_sku`, `marketplace_product_id`, **`product_url`** *(new 2026-07 — country/marketplace-specific listing URL; identity field, nullable; NOT on `marketplace_skus`)*, `packaging_regulation`, `regulation_url`, `language`, `manual_version`, `label_version`, `battery_regulation`, `created_at`, `updated_at`.
> - **Match grain:** `sku + company + country + marketplace` (one row per company/country/marketplace site).
> - **REMOVED in v2 (→ `tax_referral_rates`):** `hscode`, `duty_rate`, `extra_duty_rate`, `vat`, `port_tax`, `referral_fee_rate`, `declared_value`, `declared_currency`. Also removed: `marketplace_sku_id`, `status`, `note`, `warning_label`; `manual_language` → `language`.
> - **Higher-level source:** `sku_regional_details` is the source; `marketplace_skus` is the operational synchronized copy. **Pricing / tax NOT here.**

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `sku_details` → `sku_regional_details` | `sku` | 1 → many (per company/country/marketplace) |
| `sku_regional_details` ↔ `marketplace_skus` | `sku + company + country + marketplace` | 1 → 1 (paired; regional = higher priority) |

- **Creation (two flows):** (A) Add Marketplace SKU → `marketplace_skus` → **ensure** `sku_regional_details`; (B) Regional Details created first → later `marketplace_skus` **copies** `site_sku` / `marketplace_product_id` FROM regional. See `INVENTORY_TABLE_MAPPING_SPEC.md` §17.3A.
- **Sync (avoid silent divergence):** `site_sku` / `marketplace_product_id` propagate **both ways**; **`sku_regional_details` is the higher-priority source** on conflict; save surfaces a warning / repair-sync.

---

## 4B. `tax_referral_rates` — Tax / Referral / Duty Reference Master (SKU Domain v2 Layer 4 — planned)

**Reference Master** (Layer 4). Authoritative: [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md). **Single source of truth** for HS Code / Duty / VAT / Referral / Declared Value; future source for Cost Engine / Duty Engine / Shipment Cost / Export / Compliance. **Spec only — not yet created in the live DB.**

> **Columns:** `tax_rate_id` (PK), `series` (join from `sku_details.series`), `duty_country`, `country_of_origin` (**kept here for now — NOT in `sku_details`**), `hscode`, `duty_rate`, `extra_tax_rate`, `vat`, **`vat_no`** *(new 2026-07 — VAT / tax registration number for destination-country customs docs; nullable; looked up by applicable duty country + effective-date row — never derived from currency)*, **`eori_no`** *(new 2026-07 — EORI registration number for EU/UK customs; nullable; same duty_country + effective-date lookup — latest `effective_from` wins, blank `effective_to` = open-ended; never matched by currency; a missing EORI must NOT block a document whose `document_template_fields.required = FALSE`)*, `port_tax`, `referral_fee_rate`, `declared_value`, `declared_currency`, `effective_from`, `effective_to`, `note`, `created_at`, `updated_at`.
> - **Match grain:** `series + duty_country` (+ effective-date window; new period = new row; overlaps allowed).
> - **Source-of-truth rule:** HS Code / Duty / VAT / Referral / Declared Value exist **ONLY** here — never duplicated in `sku_details` / `sku_regional_details` / `marketplace_skus`.

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `sku_details` → `tax_referral_rates` | `series` | 1 → many (per `duty_country` × effective period) |

**SKU Master Domain relationship diagram (v2):**

```
sku_details ──(sku)──▶ sku_regional_details ──(sku+company+country+marketplace, synced)──▶ marketplace_skus
     │
     └──(series)──▶ tax_referral_rates ──▶ Duty / Referral / VAT / Declared Value / Cost Engine / Shipment Cost / Export / future AI cost
```

---

## 5. Forecast Layer

**Tables:** `fc_regular_forecast`, `fc_special_events`, `fc_target_rules`

| Relationship | Logical key |
|--------------|-------------|
| `fc_regular_forecast` → `marketplace_skus` | `company + country + marketplace + sku` |
| `fc_special_events` → `marketplace_skus` | `marketplace_id` and/or `company + country + marketplace + sku` |
| `fc_special_events` → `campaigns` / `campaign_sku_lines` | `campaign_id` / `campaign_sku_line_id` (link only — see Campaign sync rule below) |
| `fc_target_rules` → forecast | by **scope**: category / series / sku |

- **Target rules adjust Regular FC only** (`Target Adjusted Forecast = Regular Forecast × Target Rule %`, default 100%).
- **Special Event FC is independent and always 100%** (no target adjustment); event demand is pulled forward one month (see calculation rules doc §8).
- **Write path (FC Summary Phase 1 — see [`FC_SUMMARY_SPEC.md`](./FC_SUMMARY_SPEC.md)):** `fc_special_events` and `fc_target_rules` now have live read + write. Apps Script `14_fc_write_handlers.gs`: `upsertFcSpecialEvent` / `deleteFcSpecialEvent`, `upsertFcTargetRule` / `deleteFcTargetRule` (auto-create tab + header, update-by-id-else-create, audit meta). API adapter: `upsertFcSpecialEvent` / `deleteFcSpecialEvent` / `upsertFcTargetRule` / `deleteFcTargetRule`.
  - `fc_special_events` **live handler** columns: `event_id` (PK), `company`, `country`, `marketplace`, `scope_type`, `scope_id`, `sku`, `series`, `category`, `event_name`, `event_period`, `event_month`, `year`, `fc_qty`, `note`, `created_by/at`, `updated_by/at`.
  - `fc_special_events` **target schema** (FC_SUMMARY_SPEC §3.1 — reconciliation pending): PK renamed `event_fc_id`; add `campaign_id`, `campaign_sku_line_id`, `marketplace_id`, `fc_share` (runtime), `source` (enum `manual_fc_summary` / `campaign_sync` / `import` / `growth_actual_sales`), `status` (enum `active` / `inactive` / `archived`). `company` derived from marketplace / marketplace_skus; `event` = Event Flag enum (**Normal** / Spring Deal / Prime Day / Fall Prime / BFCM / Mother's Day; Normal never produces a row). The FC Summary Special Event modal writes via `upsertFcSpecialEvent` (source `manual_fc_summary`, blank campaign link); **`campaign_id` / `campaign_sku_line_id` / `source` / `status` / `marketplace_id` / `fc_share` are not persisted yet** (handler header not aligned — pending).
  - **Campaign ↔ fc_special_events sync (FC_SUMMARY_SPEC §10, §12):** Campaign (`campaigns` + `campaign_sku_lines`) = promotion source of truth; `fc_special_events` = supply-chain forecast source of truth; **linked** by `campaign_id` / `campaign_sku_line_id`, **not** blind two-way synced.
  - **FC Summary Special Event Builder v2 (FC_SUMMARY_SPEC §9, §12):** Single-SKU (≤8 rows: SKU / regular_price / deal_price / fc_qty) or Category-Series group cards (group key = category + series + regular_price; same series different price ⇒ separate cards; All-Category/All-Series → Discount %; optional Forecast Assist pre-fill). Save target = `campaigns` → `campaign_sku_lines` → `fc_special_events` (`source='campaign_sync'`, linked). **Writer status PENDING:** `upsertCampaign` + `upsertCampaignSkuLine` do **not** exist (only `upsertFcSpecialEvent`); live Save writes **nothing** and reports pending (fc_special_events is NOT written alone → would orphan). `campaign_sku_lines` regular/deal price sourced from `marketplace_skus.regular_price` + user deal price.
  - `fc_target_rules` columns: `target_rule_id` (PK), `company`, `country`, `marketplace`, `scope_type`, `scope_id`, `year`, `category`, `series`, `sku`, `target_percentage`, `jan_pct…dec_pct`, `note`, `created_by/at`, `updated_by/at`.
  - `fc_regular_forecast` single-row edit (Edit Base FC / + Add SKU) remains **Phase 2 (not wired)**; only batch **Import** writes it today.

---

## 6. Inventory Layer

**Tables:** `factory_stock`, `factory_stock_movements`, `factory_stock_allocation_plans`, `warehouses`, `overseas_inventory_snapshot`, `overseas_inventory_movements`, `mixed_carton_rules`, *future* `amazon_inventory_snapshot` (and similar), *planned* `overseas_inbound` / `overseas_inbound_lines` (Overseas Inbound planning input — see below).

> **Current `overseas_inventory_snapshot` columns (warehouse-side inventory):** `overseas_inventory_id`, `snapshot_date`, `warehouse_id`, `sku`, `site_sku`, `physical_stock`, `available_stock`, `reserved_stock`, `damaged_stock`, `on_the_way_qty`, `on_the_way_eta`, `on_the_way_bucket`, `last_movement_at`, `updated_by`, `created_at`, `updated_at`, `note`.
> - `available_stock = physical_stock − reserved_stock − damaged_stock`.
> - `on_the_way_qty` / `on_the_way_eta` / `on_the_way_bucket` = inbound-to-warehouse qty + ETA + ETA bucket (warehouse-side on-the-way source).
>
> **Current `overseas_inventory_movements` columns (movement ledger):** `movement_id`, `movement_date`, `warehouse_id`, `sku`, `site_sku`, `movement_type`, `movement_scope`, `from_stock_type`, `to_stock_type`, `quantity`, `quantity_before`, `quantity_after`, `before_physical_stock`, `after_physical_stock`, `before_reserved_stock`, `after_reserved_stock`, `before_available_stock`, `after_available_stock`, `reference_type`, `reference_id`, `source_module`, `created_by`, `created_at`, `note`.
> - Logs **before/after balances per stock type** (physical / reserved / available); `movement_scope` classifies the movement domain; `from_stock_type → to_stock_type` models holds/releases (e.g. `available → reserved`). Intended write path for **future reservation control** (not yet implemented).
>
> **`mixed_carton_rules` (newly added table):** registered for a **future mixed-carton extension**. **Not implemented** — no mapping, write path, or relationship is defined yet.

> **`factory_stock_allocation_plans` (Factory Stock Allocation — weekly planning snapshot):** stores *how much factory stock a planning cycle intends to make available per SKU, allocated by FC Share*. It is a **planning snapshot ONLY** — it does **NOT move inventory, reserve inventory, or change ownership**; the physical `factory_stock` balance is untouched. Consumed by Inventory Replenishment to display CN / TW available quantity. Finalized flow in [`SUPPLY_CHAIN_SYSTEM_FLOW.md`](./SUPPLY_CHAIN_SYSTEM_FLOW.md) §5.2–§5.4.
>
> **Columns + purposes:**
> - `allocation_plan_id` — PK.
> - `status` — `draft` / `confirmed` / `archived` (future lifecycle).
> - `plan_month` — monthly planning cycle.
> - `plan_week` — weekly allocation snapshot.
> - `warehouse_id` — target warehouse context.
> - `company` · `country` · `marketplace` · `sku` — allocation scope grain.
> - `forecast_qty` — forecast quantity for the cycle.
> - `forecast_share` — **FC percentage** used during allocation (FC Share).
> - `allocated_factory_stock_qty` — **final available factory stock** for this planning cycle (the allocation result).
> - `allocation_version` — allows **recalculation without losing historical plans** (a new version per recalculation).
> - `source_factory_warehouse_id` — the factory pool the stock is drawn from.
> - `calculation_method` — how the allocation was derived (e.g. FC-Share method tag).
> - `created_at` · `updated_at` · `note` — audit + note.
>
> **Allocation rule:** existing inventory = **shared pool**; new POs may carry intended-company info but **factory allocation is recalculated weekly by FC Share** and is **never permanently bound to a company**.
>
> **Reserved Stock lifecycle (inventory effects live only at the Execution Layer):** **Submit Plan → no inventory movement**; **Shipment Draft created → `reserved_stock += shipment qty`** (`current_stock` unchanged); **Shipment shipped → `current_stock −= shipment qty` and `reserved_stock −= shipment qty`**. Planning steps (allocation snapshot / Submit Plan / Weekly Shipping Plan / Approval) move nothing.

> **`overseas_inbound` / `overseas_inbound_lines` (planned — Overseas Inbound planning input):** an **Overseas Stock planning input** (spec: [`OVERSEAS_INBOUND_SPEC.md`](./OVERSEAS_INBOUND_SPEC.md)), **not** a Shipment Draft. Header status `draft` / `submitted_to_shipping_plan` / `cancelled`; **Submit creates a Weekly Shipping Plan + `shipping_plan_lines` (Decision Layer)** — it does **NOT** create a Shipment Draft directly and does **NOT** write `overseas_inventory_snapshot.available_stock` or deduct `factory_stock`. Overseas Stock is updated **only after the resulting shipment is `received`** (via `overseas_inventory_movements`). Flow: `Overseas Inbound → Weekly Shipping Plan (approval) → Shipment Draft → Ship → received → Overseas Stock`. Header/line columns in `OVERSEAS_INBOUND_SPEC.md` §4–§5. **Planned design — not implemented (no table/handler/UI yet).**

> **Amazon snapshot + import-log tables:** the Amazon snapshot tables (`amazon_inventory_snapshot`, `amazon_inventory_health_snapshot`, `amazon_weekly_sales_snapshot`, `amazon_daily_sales_snapshot`) and the import-governance tables (`import_sync_runs`, `import_sync_issues`) are **import-only**, populated by the config-driven importer. Their **field-level headers, governance, freshness/fallback, and capping flags** are specified in [`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`](./AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md) (this relationship map intentionally does not duplicate field-level schema).

| Relationship | Key |
|--------------|-----|
| `factory_stock` → `sku_details` | `sku` |
| `factory_stock_movements` → `factory_stock` | logical: `sku + factory_name` |
| `factory_stock_allocation_plans` → `factory_stock` | logical: `sku` (+ `source_factory_warehouse_id`) — **read/snapshot only, no write-back** |
| `factory_stock_allocation_plans` → `fc_regular_forecast` / target rules | `company + country + marketplace + sku` (FC Share source) |
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

**Tables:** `request_orders`, `request_order_lines`, `purchase_orders`, `purchase_order_lines`, `production_schedule`

> **Procurement Layer (Phase 1) — authoritative definition in [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md); planned design, tables auto-created by `13_procurement_handlers.gs` with the documented header row (no manual migration).**
>
> **Immutable Flow (must hold):** `Shipment / Inventory / Factory Stock` → **`request_orders`** (Procurement Planning Draft) → **`purchase_orders`** (Procurement Commitment). Downstream may **copy** upstream data but **must NOT write back** upstream: `purchase_orders` never writes `request_orders`; `request_orders` never writes `shipments` / `inventory` / `factory_stock`. **Lifecycle + Snapshot rules (Request lifecycle, PO lifecycle, PO Snapshot Rule, Global Snapshot Architecture, cancelled terminal-state, no live recalculation downstream): see §7.5C.**

### 7.1 `request_orders` (Procurement Planning Draft)

> **Columns:** `request_order_id` (PK), `request_order_no`, `request_order_version`, `parent_request_order_id`, `company`, `supplier_id`, `supplier_name`, `factory_id`, **`warehouse_id`**, **`request_status`**, **`tier_group`**, `total_sku`, `total_qty`, `total_cartons`, `estimated_amount`, `currency`, `source`, `source_ref_type`, `source_ref_id`, `created_by`, `created_at`, `submitted_by`, `submitted_at`, `approved_by`, `approved_at`, `rejected_by`, `rejected_at`, `rejected_reason`, `cancelled_by`, `cancelled_at`, `completed_by`, `completed_at`, `note`, `updated_by`, `updated_at`.
> - **`request_status`** (canonical) enum: `draft / pending_approval / approved / converted_to_po / cancelled`. The legacy **`status`** column is **deprecated — no longer written or ensured** (read-fallback only for old rows).
> - **`tier_group`**: only T1 → `T1`; only T2/T3 → `T2_T3`; both → `mixed`; none → blank.
> - **`warehouse_id`**: default preferred factory warehouse **`WH-TW-CN-FACTORY-YOUXIN`** (CN Youxin) when none supplied. Header-level `inspection_date`/`expected_ready_date`/`expected_ship_date` are **NOT written** — dates are line-level.
> - **`source`** enum: `manual / inventory_shortage / factory_stock_shortage / shipment_allocation_shortage / approved_shipment_demand / ai_recommendation` (Phase 1 writes `manual`; the others are reserved placeholders — no auto engine).
> - **`source_ref_type` / `source_ref_id`** — optional upstream reference (e.g. `shipment` / `shipping_plan` / `inventory_snapshot`) copied for traceability; **never written back**.
> - **`request_order_version`** — bumped +1 on resubmit after a reject (MVP reuses the same `request_order_id` row; `parent_request_order_id` = self).
> - **Actor fields** are placeholder identities (MVP; future Role & Permission), must never block Save / Submit / Cancel.
> - **`completed_at`** — non-blank ⇒ hidden from the default Approved view (Done); the row is **never deleted**.

### 7.2 `request_order_lines`

> **FINAL columns (PO v2 mapping):** `request_order_line_id` (PK), `request_order_id` (FK), `sku`, **`company`**, **`request_bucket`**, **`request_month`**, `series`, `supplier_id`, `supplier_name`, `supplier_sku`, **`factory_item_no`**, **`factory_item_name`**, **`supplier_warehouse_id`**, **`km_qty`**, **`resus_qty`**, **`restw_qty`**, **`recommended_qty`**, `requested_qty`, `approved_qty`, **`shortage_qty`**, **`reallocation_qty`**, `carton_qty`, `units_per_carton`, `unit_cost`, `estimated_amount`, `currency`, **`calculation_method`**, **`line_status`**, **`inspection_date`**, **`expected_ready_date`**, **`expected_ship_date`**, **`purchase_order_line_id`**, `note`, **`cancelled_by`**, **`cancelled_at`**, **`cancel_reason`**, `created_at`, `updated_at`.
> - **Line identity = `company` + `sku` + `request_bucket`.** **One line = one company** (= one `request_order_line_source`). `km_qty`/`resus_qty`/`restw_qty` = per-company allocation (matched company = `approved_qty`, others `0`; never blank; row Approved = km+resus+restw).
> - **`request_bucket`** (`T1`/`T2`/`T3`, **canonical — `tier_type` MUST NOT be used here**) + **`request_month`** — bucket preserved on every line; PO Layer may merge later via `request_order_po_links`.
> - **`inspection_date` / `expected_ready_date` / `expected_ship_date`** — line-level schedule (written to all lines of a tier at Save); `expected_ready_date` is the mapping source for PO `expected_completion_date` / `supplier_expected_ready_date`.
> - **`purchase_order_line_id`** = created PO line (traceability) — **replaces `linked_purchase_order_line_id`**. **`line_status`** always populated = draft/submitted/approved/**cancelled**; `cancelled` is terminal + immutable (`cancelled_by`/`cancelled_at`/`cancel_reason`; §7.5B / RO&PO §13.4). Totals exclude cancelled lines.
> - **`factory_item_no` / `factory_item_name` / `supplier_warehouse_id`** = factory/supplier item + warehouse references. **`recommended_qty` / `reallocation_qty`** = allocation snapshots (blank when no formula).
> - **DEPRECATED — no longer written / ensured** (missing-header-safe; not re-created): `final_order_qty`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `source_company_count`, `source_site_count`, **`tier_type`**, `product_name`, `need_reason`, `related_entity_type`, `related_entity_id`, **`linked_purchase_order_line_id`**. Forecast/stock/on-the-way snapshot detail is owned by **`request_order_line_sources`** and **must NOT be re-added here**.
> - **`requested_qty`** (from draft) → **`approved_qty`** (editable in Draft) → **`final_order_qty`** (locked = approved at Submit/Approve; cleared on Reject). **`carton_qty`** recomputed from `units_per_carton`.
> - Snapshots from the allocation draft: **`forecast_qty`** ← `fc_qty_snapshot`, **`current_stock`** ← `site_stock_snapshot`. **`on_the_way_qty`** / **`factory_allocated_qty`** / **`shortage_qty`** / **`reallocation_qty`** blank in Phase 1 (no shipment join / allocation engine / formula yet).
> - **`calculation_method`** = source label (`manual_order_allocation` …); **`line_status`** = draft/submitted/approved/cancelled; **`linked_purchase_order_line_id`** blank until PO line created (traceability → `request_order_po_links`, future). All added columns are **additive** (missing-header safe).
> - **`unit_cost`** preferred source = **`supplier_price_list` / `pricing_list`** (future); manual input allowed with `--` fallback (future audit).
> - **`estimated_amount`** = `approved_qty × unit_cost` (line); header `estimated_amount` = Σ lines.
> - **`related_entity_type` / `related_entity_id`** — optional link to the upstream demand (shipment / inventory), copy-only.

### 7.3 `purchase_orders` (Procurement Commitment)

> **FINAL columns (PO v2 mapping):** `purchase_order_id` (PK), **`po_no`**, **`km_po_no`**, `warehouse_id`, `supplier_name`, **`order_status`**, **`order_date`**, **`deposit_due_date`**, `inspection_date`, **`expected_completion_date`**, `expected_ship_date`, **`subtotal_amount`**, **`deposit_amount`**, **`balance_amount`**, **`paid_amount`**, **`payment_status`**, **`payment_term_id`**, `currency`, `note`, `purchase_order_no`, `po_version`, `parent_purchase_order_id`, `request_order_id` (FK, copied), `company`, `supplier_id`, `factory_id`, `total_sku`, `total_qty`, **`total_cartons`**, `total_amount`, **`supplier_expected_ready_date`**, **`supplier_confirmed_ready_date`**, **`request_bucket`**, `created_by`, `created_at`, `updated_by`, `updated_at`, `issued_by`, `issued_at`, `confirmed_by`, `confirmed_at`, `cancelled_by`, `cancelled_at`, `completed_by`, `completed_at`, `closure_reason`, `closed_by`, `closed_at`.
> - **`order_status` is canonical** (enum: `draft / issued / in_production / partial_completed / completed / partial_shipped / shipped / closure / cancelled`, RO&PO §6). **DEPRECATED — never written/recreated:** `status` (→ `order_status`), `expected_ready_date` / `confirmed_ready_date` (→ `supplier_*`).
> - **PO numbers:** `po_no` = canonical (assigned at Send PO); `km_po_no` = KM-facing; `purchase_order_no` = retained legacy/full.
> - **`order_date` = Send PO date** (not create date); `created_at` = system creation time. **`request_bucket`** header = `T1` or `T2_T3` (lines keep original `T1`/`T2`/`T3`).
> - **`deposit_due_date` = `order_date` + 5 BUSINESS days** (Mon–Fri; Sat/Sun excluded; **holidays deferred**). Stamped **at Send PO** with `order_date`; **blank at Convert**; **never computed from `created_at`**; stored date-only `yyyy-MM-dd`. Editable via `updatePurchaseOrderHeader`; manual-override flag / auto-recalc-on-order_date-change deferred.
> - **Supplier timeline** `supplier_expected_ready_date` / `supplier_confirmed_ready_date` are **supplier-specific, not globally required** (blank allowed); may drive `SUPPLIER_DATE_FULL` in doc generation.
> - **`factory_id`** resolved from `request_orders.warehouse_id` via warehouse master; `warehouse_id` = source ID; factory display = `warehouses.warehouse_name`.
> - **Date mapping:** `expected_completion_date` ← matching `request_order_lines.expected_ready_date` (by `request_order_id` + `request_bucket`); **`supplier_expected_ready_date` MIRRORS `expected_completion_date`**; `supplier_confirmed_ready_date` blank at creation → set on supplier confirmation / delay Update (append timeline history, never silent overwrite). `inspection_date` / `expected_ship_date` copied from the same request lines.
> - **Payment:** `subtotal_amount = Σ line_amount`; `deposit_amount = subtotal × ratio` (else blank); `balance_amount = subtotal − deposit` (else blank); `paid_amount` / `payment_status` / `payment_term_id` (Factory Payment block).
> - **`total_sku`** = **`COUNT(DISTINCT sku)`** (global rule — §7.5A); `total_qty = Σ ordered_qty`; **`total_cartons = Σ purchase_order_lines.carton_qty`**; `total_amount = Σ line_amount`. All written at Convert to PO and kept in sync by `procurementRecalcPoTotals_`.
> - **`closure`** (DB value; UI "Closure") — two sources: **auto** when all lines are fully shipped (`shipped_qty ≥ ordered_qty`), or **manual** with a required `closure_reason` (+ `closed_by` / `closed_at`). *(`remaining_qty = completed − shipped = 0` alone is not a closure signal — it is also true for a fresh PO.)*
> - **`factory_id` / `warehouse_id`** copied from the Request Order at conversion (Factory display; `warehouse_id → warehouses.warehouse_name`).
> - **`request_order_id`** is a **copy** of the source request order (traceability). PO **never writes back** to `request_orders` — conversion only sets `request_orders.status = converted_to_po` on the request side, once, at creation.

### 7.4 `purchase_order_lines`

> **FINAL columns (PO v2 mapping):** `purchase_order_line_id` (PK), `purchase_order_id` (FK), `request_order_line_id` (copied), **`request_order_id`** (copied), **`request_bucket`**, `sku`, **`company`**, `series`, **`factory_item_no`**, **`factory_item_name`**, `supplier_id`, `supplier_name`, `supplier_sku`, **`supplier_warehouse_id`**, **`km_qty`**, **`resus_qty`**, **`restw_qty`**, **`recommended_qty`**, **`requested_qty`**, **`approved_qty`**, `ordered_qty`, **`completed_qty`**, `shipped_qty`, `remaining_qty`, `carton_qty`, `units_per_carton`, `unit_cost`, `line_amount`, `currency`, **`line_status`**, `inspection_date`, **`expected_completion_date`**, `expected_ship_date`, `related_shipment_id`, `note`, `created_at`, `updated_at`.
> - **`product_name` REMOVED** (join `sku_details` for display only). **Company snapshot mandatory:** `km_qty`/`resus_qty`/`restw_qty` (one company = one line, one non-zero; **`km_qty + resus_qty + restw_qty = ordered_qty`**). **`request_bucket`** (original `T1`/`T2`/`T3`) and **`line_status`** mandatory.
> - **`requested_qty` / `approved_qty` / `recommended_qty` are AUDIT-ONLY snapshot fields** (copied from the Request line for lineage). Execution / receiving / remaining / shipment allocation all key off **`ordered_qty`** (+ `completed_qty` / `shipped_qty` / `remaining_qty`); runtime does not read the audit fields. Retained; not removed without an explicit later decision.
> - **`ordered_qty` = `request_order_lines.approved_qty`**; `approved_qty` / `requested_qty` / `recommended_qty` copied for audit. **`completed_qty` / `shipped_qty` start `0`**; **`remaining_qty` = `completed_qty − shipped_qty`** = **available-to-ship**, **= `0` at creation** (NOT `ordered_qty` / NOT `ordered − shipped`). **`line_amount` = `ordered_qty × unit_cost`**. **`ordered_qty` is READ-ONLY once the PO exists** (no order-qty edits after creation — quantity is a Decision-Layer decision). **`unreceived_qty` = `ordered_qty − completed_qty`** is derived only in the Receive modal (never stored).
> - **Receive flow (PO Workspace — `PURCHASE_ORDER_SPEC.md` §4A/§4B):** each Receive does **`completed_qty += receive_qty`** (per line; `receive_qty ≤ unreceived = ordered − completed`; already-completed qty is read-only and never re-received), then **`remaining_qty = completed_qty − shipped_qty`** (available-to-ship, clamp ≥ 0; `shipped_qty` untouched). All lines `completed_qty ≥ ordered_qty` → PO `order_status = completed` (+ `completed_at`/`completed_by` if available); partial → `partial_completed`. **Receive mutates the PO ONLY — never `request_orders` / `request_order_lines`, never `shipments`;** Shipment allocation later *consumes* `completed_qty`/`remaining_qty` (read-only).
> - **Date mapping:** `expected_completion_date` ← `request_order_lines.expected_ready_date`; `inspection_date` ← `request_order_lines.inspection_date`; `expected_ship_date` ← `request_order_lines.expected_ship_date`.
> - **PO List (line-level view)** joins `sku_details` (Category / Series) + `purchase_orders` (Supplier / Factory / Status / Updated) — see `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.3. Full Convert-to-PO field mapping → RO&PO §15.
> - **`related_shipment_id`** — set when a Ready-to-Ship PO line is linked to a Shipment Draft (future; copy-only).

### 7.5 Second-layer draft tables (planning scratchpads — NO stock movement / reservation)

> Two **draft layers** persist second-layer user input / AI suggestions so a reload does not lose work. **Neither reserves nor deducts stock.** See `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6 / §3.7.
>
> - **`shipping_allocation_drafts` / `shipping_allocation_draft_lines`** *(spec only — not implemented)* — Inventory Replenishment second-layer Shipping Allocation / Execution Plan draft. Only **Submit Plan** promotes it to `shipping_plans` / `shipping_plan_lines` (Decision Layer). Header: `allocation_draft_id`, `source_page`, `company`, `country`, `marketplace`, `sku`, `plan_month`, `target_window`, `source_type`, `status`, audit. Lines: `allocation_line_id`, `allocation_draft_id`, `route_no`, `ship_from`, `destination`, `shipment_draft_qty` *(canonical 2026-07 rename of `qty`; legacy `qty` read-fallback only — no runtime writer yet, this table is spec-only)*, `allocation_method`, `source_factory_warehouse_id`, `available_stock_snapshot`, `note`, `created_at`, `updated_at`.
> - **`request_order_allocation_drafts` / `request_order_allocation_draft_lines`** *(implemented — this task)* — Request Order second-layer Order Allocation (T1/T2/T3) editable draft; source for **Send Request → `request_orders` / `request_order_lines`**. Header: `request_allocation_draft_id`, `planning_cycle`, `company`, `country`, `marketplace`, `sku`, `category`, `series`, `status`, `source_type`, audit, `submitted_by`, `submitted_at`, `note`. Lines: `request_allocation_line_id`, `request_allocation_draft_id`, `request_month`, `request_bucket` (`T1`/`T2`/`T3`), `recommended_qty`, `order_qty` (editable), `carton_qty`, `units_per_carton`, `factory_stock_snapshot`, `site_stock_snapshot`, `third_party_stock_snapshot`, `fc_qty_snapshot`, `target_pct_snapshot`, `allocation_method`, `note`, `created_at`, `updated_at`.
> - **Status enum (both):** `draft` / `site_confirmed` / `submitted` / `cancelled`. **Buckets:** T1 = next month, T2 = next two months, T3 = next three months (independently pushable). **No calculation formula** in this task.
> - **Immutable Flow preserved:** these drafts are upstream scratchpads; Send Request **copies** eligible lines into `request_orders` (never writes back to inventory / factory / shipments).

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `shipping_allocation_drafts` → `shipping_allocation_draft_lines` | `allocation_draft_id` | 1 → many |
| `request_order_allocation_drafts` → `request_order_allocation_draft_lines` | `request_allocation_draft_id` | 1 → many |
| `request_order_allocation_draft_lines` → `request_order_lines` | copied at Send Request (order_qty → requested_qty) | many → many (grouped by series + supplier) |
| `request_orders` → `request_order_lines` | `request_order_id` | 1 → many |
| `request_orders` → `purchase_orders` | `request_order_id` (copied at conversion) | 1 → many (typically 1) |
| `request_order_lines` → `purchase_order_lines` | `request_order_line_id` (copied) | 1 → 1 |
| `purchase_orders` → `purchase_order_lines` | `purchase_order_id` | 1 → many |
| `purchase_order_lines` → `production_schedule` | `purchase_order_line_id` (if needed) | 1 → many |
| `purchase_order_lines` → `shipment_lines` | `purchase_order_line_id` | linkable |

- **ResTW is the procurement hub** (KM / ResUS route demand through ResTW).
- Factories **CN_YOUXIN** and **TW_SHENGYI** are **production resources, not company entities**.
- **Supplier / price source:** Phase 1 reads unit cost from the existing supplier price list (`supplier_price_list` / `pricing_list`) when available; missing prices fall back to `--` and allow manual entry (future audit). Not refactored in Phase 1.

### 7.5A Total SKU Rule (official — global)

**Any DB field or UI figure named `total_sku` / "Total SKU" = `COUNT(DISTINCT sku)`, NEVER `COUNT(rows)`.**

- Applies to `request_orders.total_sku`, `purchase_orders.total_sku`, `shipments.total_sku`, and every "Total SKU" figure across **Request Order, Purchase Order (Overview + List), Weekly Shipping Plan, Shipment Overview**.
- One SKU may appear on multiple lines (per company / bucket / tier / route); row count over-counts. Distinct-SKU counting is authoritative.
- `total_qty` / `total_cartons` stay **summations** over non-cancelled lines; only the SKU **count** is distinct.

### 7.5B Allocation Persistence Rules (official architecture rule)

Foundational rule for Request Order persistence and its downstream layers. Full statement: `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §13.

- **Company-based identity:** `request_order_id + company + sku + tier` (tier = `request_bucket` T1/T2/T3). **One Company = one `request_order_line` = one `request_order_line_source`.**
- **Manual Allocation Mode:** if a company row does not exist for a `(request_order_id, sku, tier)`, the system **auto-creates** its `request_order_line` (+ `request_order_line_source`). **No ratio allocation** — each company owns its own `approved_qty`; the row Approved = `km_qty + resus_qty + restw_qty`.
- **Synchronization:** `request_order_line_sources.approved_qty` **must always equal** `request_order_lines.approved_qty` for the same **Company + SKU + Tier**, synced by the **same decision quantity** (no ratio; snapshot fields never overwritten). **Occurs on Save · Submit · Convert to PO.**
- **Cancelled immutability:** once `line_status = cancelled`, the line is immutable — **Submit ignores it** (never reactivated) and it is excluded from totals and source sync.
- **Foundation for:** Shipment Allocation · Purchase Orders (company-split snapshot) · Factory Allocation.

### 7.5C Lifecycle & Snapshot Architecture (official)

Full statements: `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §5.0 (Request lifecycle), §6.0 (PO lifecycle), §14 (Global Snapshot Principle); `PURCHASE_ORDER_SPEC.md` §8A (PO Snapshot Rule).

- **Request Order lifecycle:** `Draft → Saved → Submitted → Approved → Converted to PO → Completed`. **Cancelled = terminal** (canonical `request_status`: `draft / pending_approval / approved / converted_to_po / cancelled`).
- **Purchase Order lifecycle:** `Draft → Issued/Sent → Supplier Confirmed → In Production → Partial Completed → Completed → Partial Shipped → Shipped → Closure`. **Cancelled = terminal** (enum §7.3).
- **Cancelled terminal-state rule:** cancelled `request_order_lines` are **immutable** — Submit ignores them, Convert to PO excludes them, rows are **never deleted**; any restore is a future explicit + audited action. A cancelled PO is not updated by the normal execution flow.
- **PO Snapshot Rule:** a Purchase Order is an **execution/commitment snapshot** — at Convert to PO, approved Request data (`request_order_id`, `request_order_line_id`, `company`, `sku`, `series`, `approved_qty → ordered_qty`, `km_qty/resus_qty/restw_qty` snapshot, supplier/factory ids, `supplier_expected_ready_date`, `inspection_date`, `expected_ship_date`, `unit_cost`, `currency`, `carton_qty/units_per_carton`, `note`) is **copied** into `purchase_orders` / `purchase_order_lines`. The PO then **owns** those fields.
- **Global Snapshot Architecture:** `Forecast / Planning → Request Snapshot → PO Snapshot → Shipment Snapshot → History`. **Each layer copies upstream data into its own snapshot at commit.**
- **No live recalculation downstream:** downstream layers must **not live-join / recalculate** upstream data for historical execution truth. Traceability keys are lineage-only. Master-data joins (`warehouse_id → warehouses.warehouse_name`, `sku → sku_details.*`) are permitted **only for display labels** (blank snapshot or intentionally display-only), never to replace a stored quantity / date / cost / allocation. Historical rows stay stable when upstream planning changes — supporting audit / export / BI / API / AI explanation.
- **Snapshot Completeness Principle (RO&PO §14.1):** every downstream snapshot must contain **all** data required to execute independently — a PO is executable without live-reading the Request Order; a Shipment is executable from PO / Shipping Plan snapshots without recalculating from the Request. Missing values are filled **at commit** (copy), not by a later live join.

### 7.6 Finalized lifecycle relationships (Procurement + Shipment)

> Finalized end-to-end chains (see `SUPPLY_CHAIN_SYSTEM_FLOW.md` §5.5 / §5.6). **`request_order_line_sources`, `request_order_po_links`, and the full `shipment_events` lifecycle log are documented, not yet implemented** — no schema/code change is made by this documentation sync. Existing table names unchanged.

**Procurement**

```
request_order_allocation_drafts
    │
    ├── request_order_allocation_draft_lines
    │
    ▼  Send Request
request_orders
    │
    ├── request_order_lines
    │
    ├── request_order_line_sources        (every recommendation source per line — never deleted)
    │
    ▼  Approve
purchase_orders
    │
    ├── purchase_order_lines
    │
    ▼
request_order_po_links                     (Request ↔ PO join: 1→N, N→1, supplier/factory split)
```

- **`request_order_allocation_drafts` → `request_order_allocation_draft_lines`** — `request_allocation_draft_id`, 1 → many.
- **`request_orders` → `request_order_lines`** — `request_order_id`, 1 → many.
- **`request_order_lines` → `request_order_line_sources`** — `request_order_line_id`; **one company = one line = one source** (§7.5B), **append-only, never deleted**. **Source of truth for company / site / month allocation;** `approved_qty` stays in sync with the line (same Company + SKU + Tier, no ratio; sync on Save / Submit / Convert to PO; **cancelled lines never update source rows**). **PK standardized to `request_order_line_source_id`** (legacy `line_source_id` retired). **FINAL columns:** `request_order_line_source_id` (PK), `request_order_line_id`, `request_order_id`, `tier_type` (T1/T2/T3), `company`, `country`, `marketplace`, `ownership_company`, `warehouse_id`, `site_sku`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `shortage_qty`, `reallocation_qty`, `recommended_qty`, `requested_qty`, `approved_qty`, `allocation_method`, `source_bucket`, `source_month` (YYYY-MM), `source_priority`, `note`, `created_at`, `updated_at`. This is the **source-detail table** — it MAY keep snapshot fields (forecast/stock/on-the-way/…); those must **NOT** be re-added to `request_order_lines`. `site_sku` populated from `marketplace_skus` / `sku_regional_details` when available. Full spec: RO&PO §3.8.
- **`purchase_order_lines` company snapshot** *(finalized — RO&PO §3.4)* — `km_qty` / `resus_qty` / `restw_qty` (+ `request_bucket`, `line_status`) are captured at PO creation so the commitment layer never recomputes the Request source.
- **`request_orders` ↔ `purchase_orders` via `request_order_po_links`** *(new — spec only)* — many-to-many (`request_order_id` × `purchase_order_id`); supports **one Request → many PO**, **many Requests → one PO**, **supplier split**, **factory split**. Legacy 1→1 traceability (copied `purchase_orders.request_order_id` + one-time `request_orders.status = converted_to_po`) remains valid.
- **Purchase Order Export Template** — always from `purchase_orders` / `purchase_order_lines` (never a Draft).

**Shipment**

```
shipping_allocation_drafts
    │
    ├── shipping_allocation_draft_lines
    │
    ▼  Submit Plan
shipping_plans
    │
    ├── shipping_plan_lines
    │
    ▼  Approve
shipments
    │
    ├── shipment_lines
    │
    ▼
shipment_events                            (complete lifecycle log; future tracking integration)
```

- **`shipping_allocation_drafts` → `shipping_allocation_draft_lines`** — `allocation_draft_id`, 1 → many.
- **`shipping_plans` → `shipping_plan_lines`** — `shipping_plan_id`, 1 → many (created on Submit Plan).
- **`shipments` → `shipment_lines`** — `shipment_id`, 1 → many (created after approval; execution snapshot copy).
- **`shipments` → `shipment_events`** — `shipment_id`, 1 → many (Created / Approved / Booked / Loaded / Departed / Arrived / Custom Clearance / Delivered / Received / Cancelled).
- **Shipping Export Template** — always from `shipments` / `shipment_lines` (never a Draft).
- **Shipment = Execution Snapshot (Global Snapshot Architecture, §7.5C):** at execution commit, Shipment **copies** PO / Shipping Plan data into `shipments` / `shipment_lines` and thereafter owns it. It **must not live-recalculate** Request or PO allocation; master-data joins are display-label only. See `SHIPMENT_CENTER_SPEC.md` (Execution Snapshot note).
- **Lead Time source (下單系統 / Request Order analysis page):** `supplier_price_list.lead_time_days` (active supplier row per SKU) — v1 placeholder until a normalized getter + supplier-selection rule exist (see `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §12.6).
- **Future `suppliers` master table (spec only — not implemented):** the vendor **master layer** — `supplier_id` (PK) · `supplier_name` · `supplier_type` · `contact_name` · `contact_email` · `contact_phone` · `country` · `city` · `payment_term_id` · `is_active` · `created_at` · `updated_at` · `note`. `supplier_price_list` (with `supplier_warehouse_id` / `supplier_name_snapshot`) remains the **price-detail layer** and joins to the master via `supplier_id`. See spec §12.6. **`supplier_price_list` is normalized in the API adapter** (`getSupplierPriceList()`; `[]` when the tab is absent) and supplies the 下單系統 **Lead Time** column (`lead_time_days`, active row, latest `effective_from`).
- **Future `request_order_site_confirmations` table (spec only — not implemented):** records per-site confirmation before Series aggregation (Site Confirmation flow, spec §12.10 + §3.5) — `confirmation_id` (PK) · `planning_cycle` · `planning_month` (`YYYY-MM`, **one record per month**) · `company` · `country` · `marketplace` · `series` · `status` (enum: `pending` / `confirmed` / `cancelled`) · `confirmed_by` · `confirmed_at` · `note` · `created_at` · `updated_at`. V1 Confirm Site is a **frontend-only modal marker** (no DB handler / getter / writer yet). **Send Request is gated** on all required site/month/SKU being `confirmed`. Confirm Site ≠ Send Request.

### 7.7 `factory_price_list` (Factory Cost / Source Master — **planned, SPEC ONLY**)

The **sensitive factory cost / sourcing master**: which factory/supplier produces a SKU, the factory item identity, unit cost, MOQ, and lead time. **Not implemented** (no schema/handler/getter yet).

> **Columns (planned):** `factory_price_id` (PK) · `sku` · `series` · `supplier_id` · `supplier_name` · `factory_id` · `factory_item_no` · `factory_item_name` · `factory_item_unit` · `unit_cost` · `currency` · `moq` · `lead_time_days` · `effective_from` · `effective_to` · `status` · `note` · `created_by` · `created_at` · `updated_by` · `updated_at`.

- **Sensitivity boundary:** `factory_price_list` is the **sensitive factory cost/source table**. **`sku_details` stays product/marketing-facing and MUST NOT store sensitive factory costs** (unit cost, MOQ, factory item identity live here, not in `sku_details`).
- **PO/document source of truth for factory item fields:** `factory_item_no` / `factory_item_name` / `factory_item_unit` (and `unit_cost` when sourced) should come from **`factory_price_list`** when generating PO lines or documents (resolved by `sku` + `supplier_id`/`factory_id`). The PO line still **snapshots** these values at Convert (Global Snapshot, §7.5C) — the master is the resolution source, the PO owns the copy.
- **Effective-date logic (same rule as `carrier_rate_cards` / `supplier_price_list`):** blank **`effective_to` = open-ended** (active until replaced); when multiple active rows match, the **latest `effective_from` wins**. `status` ∈ `active` / `inactive`.
- **Relationship:** `factory_price_list.sku` → `sku_details.sku` (label join); `factory_price_list.supplier_id` → future `suppliers` master; `factory_price_list.factory_id` → `warehouses` (factory). One SKU may have multiple factory-price rows (per supplier/factory/effective window).

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
>   - **`carton_cbm` / `cbm` / `gross_weight` / `net_weight` are part of the Decision Snapshot** (per-line), computed from `sku_details` carton dims/weights at Submit Plan and recomputed on every Draft Save (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §5.4). `carton_cbm` = single-carton CBM (`L×W×H/1,000,000`, cm); `cbm = carton_qty × carton_cbm`. Header CBM/weight totals are **Runtime** (Σ lines), not stored on `shipping_plans`. Copied into `shipment_lines` (`carton_cbm` / `gross_weight` / `net_weight` — **`shipment_lines` stores only `carton_cbm`, no line `cbm`**) at Execution Commit (`SHIPMENT_CENTER_SPEC.md` §15.3).
>   - `snapshot_avg_sales_source` — records **which Avg Sales source** the Decision adopted (fixed enum: `weekly_7d` / `normalized_30d` / `manual_override` / `forecast_override` / `ai_adjusted`; runtime uses `weekly_7d` / `normalized_30d`).
>   - `snapshot_avg_sales_per_day` — records the **final Avg Sales/day the Runtime Engine adopted** at Decision Commit.
>   - The Normalized Avg Sales **Runtime Calculation itself is NOT persisted** — only this frozen snapshot is (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22.6). These are **frozen decision context, not a live calculation**; `snapshot_avg_sales_source` and `snapshot_avg_sales_warning` are independent fields.
> - **Snapshot location is finalized to `shipping_plan_lines`** (per-SKU); planning snapshots are **not** stored on `shipping_plans`. Shipment Draft inherits the line snapshots without recalculation.
> - **Company snapshot flow (FINAL):** `marketplaces.company` → **`shipping_plans.company`** (copied at Submit Plan / Decision Commit; resolution priority `marketplaces` → `marketplace_skus` → payload → blank+warning, see `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.3) → **`shipments.company`** (copied at Execution Commit when the Shipment Draft is created, see `SHIPMENT_CENTER_SPEC.md` §2). Each layer **persists** company on its **header**; downstream layers must **not** live-join `marketplaces` to recover company for historical records (legacy blank rows may live-join for **display only**). **`company` is part of the `shipping_plans` six-value group key** (not display-only).
> - **`company` is NOT duplicated onto line tables:** neither `shipping_plan_lines` nor `shipment_lines` carry `company` — lines inherit it from the header via `shipping_plan_id` / `shipment_id`.
>
> **`shipments` / `shipment_lines` columns (Execution Layer; authoritative definition in [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) §2; created at Execution Commit):**
> - **`shipments`:** `shipment_id`, `shipment_no`, **`external_shipment_id`**, `shipping_plan_id`, `reference_id`, `warehouse_id`, `warehouse_code`, `company`, `country`, `marketplace`, `ship_from`, `destination`, `carrier_id`, `rate_card_id`, `shipping_method`, **`last_mile_delivery`**, **`shipping_method_label`**, **`shipments_customs_type`**, **`shipments_customs_type_label`**, `status`, `sales_order_id`, `booking_no`, `tracking_number`, `container_no`, `bl_no`, `invoice_no`, `etd`, `eta`, `actual_departure_date`, `actual_arrival_date`, `customs_clearance_date`, `delivered_date`, **`shipment_total_qty`**, **`shipment_total_cartons`**, **`shipment_total_cbm`**, **`shipment_total_gross_weight`**, **`shipment_total_net_weight`**, `freight_cost_actual`, `duty_actual`, `currency`, **`shipped_at`**, **`shipped_by`**, **`hidden_from_draft_at`**, **`hidden_from_draft_by`**, `note`, `created_by`, `created_at`, `updated_by`, `updated_at`.
>   - **CANONICAL RENAME (2026-07):** `total_qty`/`total_cartons`/`total_cbm` → **`shipment_total_qty`/`shipment_total_cartons`/`shipment_total_cbm`**, and weight totals `total_gross_weight`/`total_net_weight` → **`shipment_total_gross_weight`/`shipment_total_net_weight`**. Legacy names **RETIRED** — canonical-only writes, never re-ensured, legacy read-fallback only. Totals are recomputed from `shipment_lines` by **`shipmentRecalcTotals_`** (`shipment_total_qty=Σ shipment_qty`, `_cartons=Σ shipment_carton_qty`, `_gross_weight=Σ gross_weight`, `_net_weight=Σ net_weight`, **`_cbm=Σ shipment_carton_cbm`** — line-total summed directly, never × cartons) at creation and on any shipment-line change; legacy shipments stay blank until recalculated. **`shipments_customs_type`** (canonical 2026-07 rename of `customs_type`; legacy read-fallback only) = customs-method **snapshot** prefilled from `carrier_rate_cards.customs_type` (Rate Card source — unchanged) at creation, confirmable while Draft; read the stored snapshot (never live-resolve). **`shipments_customs_type_label`** = the localized (中文) customs-method **Label SNAPSHOT** — architected identically to `shipping_method_label`: copied from **`carrier_rate_cards.customs_type_label`** at creation (re-derived while Draft on enum/rate-card change; frozen after), fallback = the canonical enum→Label map (`third_party_customs`=買單報關 / `formal_customs`=正式報關 / `tax_refund_customs`=退稅報關). Documents' `{{CUSTOMS_TYPE}}` reads this **Label**, never the enum. Apps Script auto-adds `shipments_customs_type` / `shipments_customs_type_label` / `shipment_total_*` on demand.
>   - **`shipment_id` = internal PK (never user-editable)**; **`external_shipment_id` = user-facing/carrier number (editable)**, default **`COMPANY-MKT-YYMMDD-##`** (company uppercased no-spaces; marketplace short code Amazon→AMZ / Walmart→WMT / …; 2-digit daily serial; e.g. `RESUS-AMZ-260701-01`). Shown as the **first field of the Shipment Draft card header**. `shipment_lines.shipment_id` FK never changes. **`carrier_id` read-only in UI** (chosen on the plan). **`warehouse_id` is future-mapped from `destination`** (`destination → warehouses / shipping_route_rules → warehouse_id`; not implemented yet). Apps Script **auto-adds** `external_shipment_id` / `shipped_*` / `hidden_from_draft_*` columns on demand.
>   - **`shipping_method_label` (TEXT, nullable — legacy rows only; NOT NULL expected for new shipments):** the **localized display name of the shipping service** (e.g. `美森海派` / `美森海卡` / `空派` / `空卡` / `海運快遞派送`). **SNAPSHOT** — copied from `carrier_rate_cards.shipping_method_label` at Shipment creation (and re-copied on a rate-card change **while still Draft**); **frozen after that** — historical documents keep the copied value even if the rate card later changes. **Fallback** (blank label / legacy) = `shipping_method + '_' + last_mile_delivery` (e.g. `Sea_Parcel`), compatibility only — new shipments should always populate the label. Canonical `shipping_method` / `last_mile_delivery` are **kept, not replaced**; `last_mile_delivery` is copied from the plan/rate card at creation (canonical service field, not the §21 battery/magnet auto-aggregate). Apps Script auto-adds `last_mile_delivery` / `shipping_method_label` on demand. API exposes `shippingMethodLabel` / `lastMileDelivery`.
>   - **`shipment_lines.carton_no_start` / `carton_no_end` are user-editable numeric** (Shipment Draft); saved via `updateShipment { lines: [...] }`. `completeShippingPlan` / `createShipmentFromApprovedPlan_` auto-add missing `shipping_plans.completed_*` / `transferred_*` columns.
>   - The header six-key context + `carrier_id` + `shipment_total_qty` / `shipment_total_cartons` are **copied from the approved `shipping_plan` at Execution Commit (not recalculated)**. Editable execution fields: carrier / booking / container / BL / invoice / ETD / ETA / tracking / dates / costs / `note` / `status`.
>   - **`shipped_at` / `shipped_by`** — stamped when the Shipment is **Shipped** (Ready to Ship → Ship); a shipment enters **Shipment Overview** only after this (Save does not). **`hidden_from_draft_at` / `hidden_from_draft_by`** — **Done** marker that hides the Shipped card from the **Shipment Draft** workspace only; the shipment stays in Overview, status unchanged, **row never deleted**. **Shipment Draft** = draft/ready_to_ship/shipped working area; **Shipment Overview** = official `shipped`/`in_transit`/`arrived`/`received`/`closed` records (`SHIPMENT_CENTER_SPEC.md` §4/§5).
>   - **Aggregated logistics attributes (planned; `SHIPMENT_CENTER_SPEC.md` §21):** `battery_flag`, `battery_type`, `magnet_flag` (+ header `transit_type` / `shipments_customs_type`) are **auto-calculated from `shipment_lines`, never user-editable**. *(`last_mile_delivery` is NOT in this auto-aggregate set — it is a copied shipping-service field, above.)* `battery_flag` = TRUE if any line SKU `battery_type != no_battery`; `battery_type` = **highest level present** (`rechargeable_lithium` > `lithium_battery` > `alkaline_battery` > `no_battery`); `magnet_flag` = TRUE if any line SKU `magnet_type = magnetic`. **Carrier matching uses these shipment-level aggregates, NOT per-SKU values** (§9 / `CARRIER_AND_ROUTE_SPEC.md` §4). Enums per Global Logistics Enums (§4.5).
> - **`shipment_lines`:** `shipment_line_id`, `shipment_id` (FK), `sku`, **`shipment_qty`** *(canonical 2026-07 rename of `qty`; legacy read-fallback only)*, `factory_stock_allocation_qty`, **`shipment_carton_qty`** *(canonical 2026-07 rename of `carton_qty`; legacy read-fallback only)*, `carton_no_start`, `carton_no_end`, `units_per_carton`, **`shipment_carton_cbm`** *(canonical 2026-07 rename of `carton_cbm`; now LINE-TOTAL CBM, legacy read-fallback only)*, `gross_weight`, `net_weight`, `purchase_order_line_id`, `note`, `created_at`, `updated_at`, **+ Execution Snapshot (copied verbatim from the Decision Snapshot, immutable):** `snapshot_current_stock`, `snapshot_avg_sales_per_day`, `snapshot_days_of_supply`, `snapshot_suggested_qty`, `snapshot_target_days`, `snapshot_fc_context`, `snapshot_event_context`, `snapshot_avg_sales_source`, `snapshot_avg_sales_warning`.
>   - **`shipment_carton_cbm` = LINE-TOTAL CBM** for the whole line/SKU quantity (canonical 2026-07 rename of `carton_cbm`; **NOT per-carton**). `gross_weight` / `net_weight` are likewise line totals. Copied at Execution Commit from the plan's line-total `shipping_plan_lines.cbm` (fallback: per-carton `carton_cbm` × `shipment_carton_qty`, multiplied **once**). Header total CBM = **`shipment_total_cbm = Σ shipment_carton_cbm`** (direct sum — never re-multiplied by cartons; legacy per-carton `carton_cbm` converted once for historical rows). `carton_no_start`/`carton_no_end` are integers, `start ≤ end`, non-overlapping within a shipment (validated on Save/Ship, `SHIPMENT_CENTER_SPEC.md` §12).
>   - **Execution Snapshot = copy, never recalculation** (ARCHITECTURE §4A). `shipment_qty` (legacy `qty` read-fallback) = the plan line's `approved_qty`. After creation the Shipment reads only `shipments` / `shipment_lines` — never the Weekly Shipping Plan.
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
| `shipments` → `warehouses` | `warehouse_code` | **many → 1** (Warehouse Master 1 → many shipments); destination warehouse reference — Shipment stores only `warehouse_code`, resolves details on lookup (§8A) |
| `shipments` → `shipment_events` | `shipment_id` | actual tracking/timeline events |
| `shipments` → `shipment_routes` | `shipment_id` | planned/route waypoint structure |

- `shipments` stores the **formal execution snapshot** (header + lines copied at creation).
- **§8A Warehouse reference (Warehouse Master is independent shared master data — NOT owned by Shipment).** `warehouses` is the authoritative source for warehouse `warehouse_code` / `warehouse_name` / `country` / `state` / `city` / `address` / `postal_code` / `contact_phone` / `contact_email` / status; a Shipment stores only **`shipments.warehouse_code`** and does **not** duplicate warehouse address/contact fields in this version. **Cardinality: `warehouses` 1 → many `shipments`.** Two distinct uses of the relationship: **(1) Operational selection (Shipment Draft)** — `shipments.country` **filters** the eligible `warehouses` options by normalized country, the user picks one via a country-filtered dropdown (not free text), and only `warehouse_code` is written; **(2) Document lookup (dataset build)** — `shipments.warehouse_code → warehouses.warehouse_code` **resolves** the Warehouse Master details for document fields (`WAREHOUSE_*` / `RECIPIENT_*`), a **reference lookup at build time, never a Shipment snapshot**. `WAREHOUSE_COUNTRY_CODE` = `country_to_iso2(warehouses.country)` with a `shipments.country` fallback. Proposed additive eligibility flag `warehouses.is_selectable_for_shipment` (BOOLEAN) is **planned, not implemented**. Full flow: `SHIPMENT_CENTER_SPEC.md` §22; document mapping: `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §I.2.3 / §I.2.7A.
- **Shipping History** = read view over `shipments` + `shipment_lines`. **No separate Shipping History DB.**
- **On The Way** = visual/operational view over `shipments` + `shipment_lines` + `shipment_events` + `shipment_routes`. **No separate On The Way DB.**

---

## 9. Carrier / Route Layer

**Tables:** `carriers`, `carrier_rate_cards`, `shipping_route_rules`, `replenishment_route_rules`, `carrier_lead_times`

> **Authoritative column definitions for `carriers` / `carrier_rate_cards` / `shipping_route_rules` / `replenishment_route_rules` / `carrier_lead_times` live in [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md)** (foundation tables; planned design, not yet migrated; **no pricing engine**).
> - **`carriers`:** `carrier_id`, `carrier_code`, `carrier_name`, `carrier_type` (`forwarder`/`courier`/`trucker`/`warehouse_partner`/`customs_broker`/`other`), `scac_code`, `default_currency`, `contact_name`, `contact_email`, `contact_phone`, `website`, `is_active`, `note`, `created_by`, `created_at`, `updated_by`, `updated_at`.
> - **`carrier_rate_cards`** (authoritative import schema, `CARRIER_AND_ROUTE_SPEC.md` §4 + Carrier Rate Card v1 §4C)**:** `rate_card_id`, `carrier_id` (FK), `origin_country`, `origin_city`, `destination_country`, `destination_city`, `destination_postal_code_start`, `destination_postal_code_end`, `destination_warehouse_code`, `marketplace`, `shipping_method` (main transportation mode: `Sea`/`Sea Express`/`Air`/`Courier`), **`last_mile_delivery`** (final delivery mode: `Parcel`/`Truck` — **separate column, never combined with `shipping_method`, never `Sea/P`/`P`/`T`**), `charge_type` (pricing model: `weight`/`volume`/`container`/`shipment`/`carton`), `charge_unit` (`kg`/`lb`/`cbm`/`20GP`/`40HQ`/`shipment`/`carton`), `dim_divisor`, `min_box_weight`, `min_box_weight_unit`, `weight_tier`, `weight_tier_unit`, `currency`, `unit_rate`, `min_charge`, `fuel_surcharge`, `customs_fee`, `doc_fee`, **`transit_type`** (`port_to_port`/`door_to_port`/`port_to_door`/`door_to_door`), **`battery_type`** (`no_battery`/`built_in_battery`/`removable_battery`/`lithium_battery`/`unknown`), **`customs_type`** (`buy_export_license`/`tax_refund_export`/`not_applicable`/`unknown`), **`note`**, `effective_from`, `effective_to`, `status`, `source_file_name`, `import_batch_id`, `created_at`, `updated_at`. **No `transit_days` — Lead Time is NOT stored on rate cards (removed v1.4); `carrier_lead_times` is the single source of truth.** **Matching by destination_warehouse_code → postal-code range → city → country + marketplace + method + weight_tier; `route_code` is optional/deprecated (NOT the match key).** **Reference/Master-like data — NOT a Decision Layer; does not auto-decide carrier.** Price + validity source for the future Carrier Price Engine only — **no calculation defined**.
> - **`shipping_route_rules`:** `route_rule_id`, `company`, `country`, `marketplace`, `shipping_method`, `route_code`, `default_ship_from`, `default_destination`, `default_carrier_id` (FK), `priority`, `is_active`, `note`, `created_by`, `created_at`, `updated_by`, `updated_at`. **Drives the default `ship_from` / `destination` / `route_code` pre-filled on a Weekly Shipping Plan; the plan may OVERRIDE `ship_from` / `destination`.**
> - **`replenishment_route_rules`:** `route_rule_id`, `company`, `country`, `marketplace`, `shipping_method`, `ship_from`, `destination`, `origin_country`, `origin_city`, `destination_country`, `destination_city`, `route_code`, `default_carrier_id` (FK), `priority`, `is_active`, `created_by`, `created_at`, `updated_by`, `updated_at`, `note`. **Route defaults for Inventory Replenishment → Recommendation Summary (Suggested Route) + Execution Plan (`ship_from`/`destination`/`shipping_method` per route). DISTINCT from `shipment_routes` (Shipment/World Map/in-transit only) — do NOT conflate.**
> - **`carrier_lead_times`:** `lead_time_id`, `carrier_id` (FK), `origin_country`, `destination_country`, `shipping_method` (main transportation mode), **`last_mile_delivery`** (final delivery mode; part of the join key — blank allowed for legacy fallback), `min_days`, `max_days`, `avg_days`, `created_at`, `updated_at`. ETA-planning master; no ETA engine yet. **Single source of truth for Lead Time** — independent lifecycle from rate cards (Kitchen-Mama-maintained; never touched by the Carrier Rate Template).

**Carrier master tables — independent (v1.4):**

```
carriers
      │
      ├──────────────►  carrier_rate_cards      (rate + validity; NO lead time)
      │
      └──────────────►  carrier_lead_times      (single source of truth for Lead Time)
```

- The **Carrier Rate Card page** reads **`carrier_rate_cards` + `carrier_lead_times` together for display only** (Lead Time via join). **Neither table writes to the other** — they are independent master data with independent lifecycles.

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `carriers` → `carrier_rate_cards` | `carrier_id` | 1 → many |
| `carrier_rate_cards` → `carrier_rate_breakdowns` | `rate_card_id` | 1 → many — **FUTURE / deferred (not v1)**; FCL/container itemized cost breakdown (`CARRIER_AND_ROUTE_SPEC.md` §4C.6) |
| `carriers` → `shipping_route_rules` | `default_carrier_id` | 1 → many (optional) |
| `carriers` → `replenishment_route_rules` | `default_carrier_id` | 1 → many (optional) |
| `carriers` → `carrier_lead_times` | `carrier_id` | 1 → many |
| `carrier_lead_times` → Carrier Rate Card page | `carrier_id + origin_country + destination_country + shipping_method + last_mile_delivery` (blank `last_mile_delivery` → fall back to `… + shipping_method`) | **read for Lead Time display only** (`CARRIER_AND_ROUTE_SPEC.md` §4C.2) |
| `shipping_route_rules` → `shipping_plans` | `company + country + marketplace + shipping_method` → default `ship_from` / `destination` / `route_code` | reference (overridable) |
| `replenishment_route_rules` → Inventory Replenishment (Recommendation Summary / Execution Plan) | `company + country + marketplace + shipping_method` → default `ship_from` / `destination` / `shipping_method` | reference (overridable by PM) |
| `carrier_rate_cards` ↔ `shipping_route_rules` | `route_code` | legacy shared identifier — **deprecated for MVP matching** |
| `shipping_plans` → `carriers` | `carrier_id` | reference |
| `shipments` → `carriers` | `carrier_id` | reference |
| `shipments` → `carrier_rate_cards` | `rate_card_id` | reference |

- `carrier_rate_cards` **destination matching priority (FINALIZED, Carrier v1.1): `destination_warehouse_code` → `destination_city` → `destination_postal_code_start`~`destination_postal_code_end` → `destination_country`** — **stop at the first (most specific) level that matches**; a higher-priority match wins and lower levels are ignored (e.g. a matching warehouse-code rate is used even if city/zip/country rows also match). Then narrow by `marketplace` + `shipping_method` + `last_mile_delivery` + `weight_tier`. **`route_code` is optional/deprecated (NOT the match key)**. `charge_type` / `charge_unit` / `dim_divisor` / `min_box_weight` / `weight_tier` define the billable basis (future engine — priority order fixed here, engine NOT implemented).
- **`shipping_method` (main transportation mode) and `last_mile_delivery` (final delivery mode) are two SEPARATE columns** on both `carrier_rate_cards` and `carrier_lead_times` — never combined, never `Sea/P` / `P` / `T`. The Lead Time join uses both, with a blank-`last_mile_delivery` fallback to method-only.
- **Lead Time single source of truth = `carrier_lead_times`** (`min_days`/`max_days`/`avg_days`). **`carrier_rate_cards` does NOT store Lead Time** (`transit_days` removed v1.4) and must never duplicate it. The two are **independent master tables** — neither writes to the other. Future AI recommendation reads `carrier_lead_times.avg_days` (`CARRIER_AND_ROUTE_SPEC.md` §4A).
- **Cost lifecycle (`CARRIER_AND_ROUTE_SPEC.md` §4B):** Shipping Plan produces a **coarse estimate** (country+marketplace+method+weight_tier) → Shipment Draft **refines** it when warehouse_code/postal/city are known → **actuals** filled after carrier invoice. Estimated fields never overwrite actuals.
- `shipping_route_rules` provides routing **defaults only** — the Weekly Shipping Plan's chosen `ship_from` / `destination` win and are persisted on `shipping_plans` (part of the six-value group key, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.1).
- `ship_from` / `destination` are **logical warehouse / location ids** resolved via `warehouses` (consistent with `shipments.warehouse_id`).
- Until the future **Carrier Price Engine** exists, the Weekly Shipping Plan **Cost Breakdown stays a placeholder** (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §11).
- `carrier_lead_times` supports **ETA planning** (used by On The Way ETA buckets and shipment planning; defined later).
- **Carrier Rate Card v1.1 (`CARRIER_AND_ROUTE_SPEC.md` §4C):** a **Carrier Rate Card page** (filters Date / Country-Ship To / Method / Last Mile / Carrier + Search; no data before Search) browses `carrier_rate_cards` and reads `carrier_lead_times` for the Lead Time column only. **Two export templates**, both carrying `row_type` (not persisted) + **`rate_card_id`** (present ⇒ update; blank ⇒ create): **Update Template** is **carrier-scoped** (a carrier must be selected; exports that carrier's active rows; route/method/structure locked; clears `unit_rate`/`effective_from`/`effective_to`) and **Master Template** (all carriers, all fields editable). **Import policy (finalized, §4C.3A): Master = UPSERT, Update = UPDATE-ONLY.** Classify each row by `rate_card_id` + mode: existing id → **update** (Update mode edits only `unit_rate`/`effective_from`/`effective_to`/`fuel_surcharge`/`customs_fee`/`doc_fee`/`status`/`note`, **locked-field edits ignored + reported**; Master mode edits any field; unknown id → rejected); blank id + required values → **create** new row **ONLY in Master mode** (auto-gen `CRC-…` id) — in **Update mode a blank-id meaningful row is REJECTED** (update-only; new rate cards go through the Master Template); blank + empty → **skip**. **`effective_from` required + valid; `effective_to` optional (blank = open-ended, written blank; non-blank invalid errors).** **Field locking is enforced by the importer, not the CSV.** **Carrier resolution (create rows):** explicit `carrier_id` is authoritative (mismatched `carrier_name` → warning); blank `carrier_id` resolves by `carrier_name` against `carriers.carrier_name` (unique = use; none/multiple = rejected); Update-Template create rows also fall back to the carrier scope. **Rate-card import NEVER auto-creates a `carriers` row** — unknown carriers are rejected (`CARRIER_AND_ROUTE_SPEC.md` §4C.3B). Summary: `updated_existing_count`/`created_new_count`/`blank_skipped_count`/`rejected_count`/`locked_fields_ignored_count`/warnings/errors. Overlapping effective dates coexist as separate rows (future engine tie-break: latest `effective_from` → latest `import_batch_id`/`updated_at` → conflict warning). **Future (documented only, §4C.7):** Export Center emails a carrier-scoped Update Template → carrier replies with the filled attachment → a future importer applies the same rules. **NO email automation / Gmail parser / Export Center implemented.**
- **`carrier_rate_cards.shipping_method_label`** — localized display label for the service combination (e.g. `美森海派` / `空派`); **display metadata, not a replacement** for canonical `shipping_method` / `last_mile_delivery`. **Master Template editable** (admin); **Update Template gray/locked** (import ignores edits, existing value kept) — NOT a yellow business-editable column. Blank allowed, never auto-derived. **Copied to `shipments.shipping_method_label`** as a frozen snapshot at shipment creation / rate-card select (§8 shipments; `CARRIER_AND_ROUTE_SPEC.md` §A, `SHIPMENT_CENTER_SPEC.md` §15A). API exposes `shippingMethodLabel`.
- **`carrier_rate_cards.customs_type_label`** — localized (中文) display Label for the customs method, architected **identically to `shipping_method_label`**. Unlike the free-text method label it is **derived from the canonical `customs_type` enum→Label map** (`CUSTOMS_TYPE_LABELS_` in `17_carrier_handlers.gs`: `third_party_customs`=買單報關 / `formal_customs`=正式報關 / `tax_refund_customs`=退稅報關) at import (a row override is honored if present). **Master editable / Update locked**, additive column (Apps Script auto-adds it). **Copied to `shipments.shipments_customs_type_label`** as a frozen snapshot at shipment creation (re-derived while Draft on enum/rate-card change). Documents' `{{CUSTOMS_TYPE}}` reads the Label; the enum→Label map is the single source of truth, so a Label change never touches documents. API exposes `customsTypeLabel`.
- **`carrier_fee_types` / `carrier_rate_breakdowns` are deferred (NOT v1)** — FCL/container itemized cost breakdown later; v1 keeps all rate rows flat in `carrier_rate_cards`.
- **Carrier v2.0 — Global Logistics Enums + matching + resolution (`CARRIER_AND_ROUTE_SPEC.md` §4.5 / §4 / §4.6):** DB/API store **English enums** (UI may localize; importer maps localized→English): `battery_type` = `no_battery`/`alkaline_battery`/`lithium_battery`/`rechargeable_lithium`; `magnet_type` = `no_magnet`/`magnetic`; `customs_type` = `third_party_customs`/`tax_refund_customs`/`formal_customs`; `last_mile_delivery` = `parcel`/`truck`; **`transit_type` = `air`/`sea`/`sea_express`/`rail`/`truck` (canonical main mode; `shipping_method` demoted to a legacy display alias)**. **Matching priority:** `destination_warehouse_code` → `destination_city` → `destination_postal_code` → `destination_country` (destination stop-ladder) → `battery_type` → `customs_type` → `transit_type` → `last_mile_delivery` → weight_tier. **Resolution:** valid when `effective_from ≤ shipment_date ≤ effective_to`; **blank `effective_to` = Open End**; multiple Open End → **latest `effective_from`** active (data-hygiene: should be one per route; extra ones surface a notice); explicit-`effective_to` overlap → **Import Job Warning / Require Review** (Keep Existing default / Override / Cancel Import). **Battery/magnet matching uses the SHIPMENT-LEVEL aggregate, not per-SKU** (§8 shipments).

**`shipment_routes` (planned nodes) vs `shipment_events` (actual events) — Execution layer, do NOT conflate:**
- **`shipment_routes`** = the **planned** leg-by-leg path (e.g. 東莞工廠 → 深圳出口海關 → 太平洋航段 → 洛杉磯港 → Amazon ONT8). Used by On-The-Way / World Map for the route line.
- **`shipment_events`** = the **actual** timestamped events (`picked_up` / `customs_cleared` / `vessel_departed` / `arrived_port` / `delivered`). Used for progress along the route.
- Both are **Execution-layer** (Shipment) tables — **distinct** from the planning-side `replenishment_route_rules` / `shipping_route_rules`. Neither is implemented yet (`SHIPMENT_CENTER_SPEC.md` §18).

**Cost columns needed (future — planned schema, no writer/engine yet):**
- `shipping_plans`: `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `estimated_unit_cost`.
- `shipments`: `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `estimated_unit_cost` (estimate) + `freight_cost_actual`, `duty_actual`, `total_cost_actual` (actual, post-invoice). *(`shipments.freight_cost_actual` / `duty_actual` already exist; `estimated_*` and `total_cost_actual` are new/future.)*

---

## 10. Document / Export Layer

**Tables:** `document_templates`, **`document_template_fields`**, `generated_documents`. Authoritative spec: [`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](./DOCUMENT_GENERATION_SYSTEM_SPEC.md).

- **`document_templates`** = template **registry** (which templates exist, scope, file). **Registry & Routing v1** (DOC GEN SPEC §C/§C.1/§G): PK `template_id = TPL-{DOC}-{SCOPE}-V{VERSION}`; unique `template_key = {DOC}_{SCOPE}` (UPPERCASE snake, no spaces). Adds **`document_category`** (`factory`/`shipment`/`customs`/`carrier`) and **`document_usage`** (`factory`/`internal`/`export`/`import`/`carrier`) alongside scope cols (series/sku/supplier_id/factory_id/carrier_id/country/marketplace/language). `document_type` v1 enum = `purchase_order` / `shipment_detail` / `commercial_invoice` / `packing_list` / `carrier_booking_form`.
- **`document_template_fields`** = placeholder **mapping layer** (template token → data source / format / transform). Placeholder stored **without braces** (`PO_NO`; runtime wraps `{{ }}`). `field_type` ∈ scalar/collection/collection_item/formula/constant/system; `data_scope` ∈ header/line/allocation/total/system/static (DOC GEN §E). **PO mapping (§H) + Shipment Detail mapping (§I.1) are FINALIZED**; remaining document-type mappings (carrier booking / commercial invoice / packing list) + the population/runtime are deferred.
- **`generated_documents`** = generated-file **history / output log** (append-only).
- **Shipment Detail finalized mapping (DOC GEN SPEC §I.1):** output grain = **one row per shipment-line PO allocation** via **`shipments → shipment_lines → shipment_line_allocations → purchase_order_lines → purchase_orders`** (+ `carriers` for `carrier_name`). **`shipment_line_allocations` = ENTIRELY PLANNED** (`shipment_line_id` + `purchase_order_line_id` + `allocated_qty`) — audited: **no headers / getter / writer / tab registration exist**; the **current** model links a shipment line to ONE PO via **`shipment_lines.purchase_order_line_id`** (single link). **A formal Shipment must have ≥ 1 PO allocation — no-allocation Shipment cannot generate Shipment Detail** (`PO_NO` required; `QTY` = `allocated_qty`, no `shipment_lines.shipment_qty` fallback). Collection controller `SHIPMENT_LINES` (stored brace-less; template row 2, hidden col A); header fields merge by `shipment_id`, SKU/carton fields by `shipment_line_id`, `QTY`/`PO_NO` never merge; `SHIPPING_METHOD` ← `shipments.shipping_method_label` snapshot. **Table + writer + document runtime all deferred.**

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `document_templates` → `document_template_fields` | `template_id` | 1 → many |
| `document_templates` → `generated_documents` | `template_id` | 1 → many |
| `purchase_orders` → `generated_documents` | `related_entity_type = purchase_order`, `related_entity_id = purchase_order_id` | 1 → many |
| `shipments` → `generated_documents` | `related_entity_type = shipment`, `related_entity_id = shipment_id` | 1 → many |
| `shipment_lines` → `shipment_line_allocations` *(planned)* | `shipment_line_id` | 1 → many (one per PO allocation) |
| `shipment_line_allocations` → `purchase_order_lines` *(planned)* | `purchase_order_line_id` | many → 1 (→ `purchase_orders.po_no` for `PO_NO`) |

- **`related_entity_type` rule (v1):** `purchase_order` documents → `related_entity_type = purchase_order`; **all shipment documents** (`shipment_detail` / `commercial_invoice` / `packing_list` / `carrier_booking_form`) → `related_entity_type = shipment` (carrier booking is a shipment doc scoped by `carrier_id`, not its own entity). `sales_order` / `report` reserved for future.
- **Shipment output routing v1 (DOC GEN SPEC §L):** shipment docs store `output_folder_id = root Shipment folder`; runtime nests `Shipment/{COUNTRY}/{SHIP_DATE}/{SHIPMENT_NO}_{COUNTRY}/` and puts **all docs for one shipment in the same folder**. `{SHIPMENT_NO}` here resolves the canonical `SHIPMENT_NO` = **`shipments.external_shipment_id`** (fallback `shipment_no` → `shipment_id`; 2026-07, §D). A per-scope **`document_output_folders`** table is **DEFERRED** (not in v1).
- **Document `SHIPMENT_NO` placeholder (2026-07):** maps to `shipments.external_shipment_id` (external/carrier-facing ID) → fallback `shipment_no` → `shipment_id`. Internal `shipments.shipment_no` is unchanged and reserved for a distinct `INTERNAL_SHIPMENT_NO` placeholder. Header placeholders `BOOKING_NO → shipments.booking_no` and `NOTE → shipments.note` (both live editable Shipment fields).
- **Carrier template rule (DOC GEN SPEC §M):** one template per carrier when layout differs; same-layout services share one row; service variation via placeholders (`{{SHIPPING_METHOD}}` / `{{SERVICE_TYPE}}` / `{{LAST_MILE_DELIVERY}}`).
- **Generated documents are DERIVED OUTPUTS** — generating / regenerating a document **never mutates** `purchase_orders` / `shipments` / inventory / master data (Snapshot Completeness, §7.5C). PO documents use the **PO snapshot only**; Shipment documents use the **Shipment snapshot only** (no live Request read, no allocation recalculation).
- **`document_template_fields` is the mapping layer**; **`document_templates` is the template registry**; **`generated_documents` is the append-only output log**.
- **Carrier Booking Form workbook (DOC GEN §I.2 — Invoice tab = confirmed draft):** the `carrier_booking_form` workbook is **ONE `document_templates` row** with **two mapped tabs** (Invoice Import + Packing List Import) — a second row is created only if the physical template files are actually separate. Shared scalar header dataset; tab-specific collection controllers (deferred). **Invoice tab mapping confirmed; Packing List tab + full workbook NOT finalized.** Multi-tab runtime deferred.
- **Invoice tab DB dependencies (new — not yet present on `warehouses`):** `warehouses.warehouse_code`, `warehouses.address`, `warehouses.city`, `warehouses.state`, `warehouses.postal_code`, `warehouses.contact_phone`, `warehouses.contact_email` (recipient block, looked up by `shipments.warehouse_code`). Nullable; must be added before the Carrier Booking Form can generate. Existing deps: `shipments` (`shipment_no` / `shipping_method_label` / `warehouse_code` / `reference_id` / `shipment_total_cartons` / `shipments_customs_type` / `shipments_customs_type_label` *(`{{CUSTOMS_TYPE}}` Label source)* / `country`), `tax_referral_rates` (`vat_no` / `declared_currency` / `declared_value` / `hscode` / `duty_country` / `series` / effective dates), `sku_details` (`product_name` / `product_name_cn` / `product_use` / `material` / `units_per_carton` / carton dims+weight / `battery_type` / `magnet_type`), `sku_regional_details.product_url`, `shipment_lines.sku`.
- **Export Center / Document Center** is the future UI; **Template Management (Template Center) is a sub-tab, not the whole module.** Runtime not implemented.

---

## 10A. Import Job Framework Layer *(new — platform; planned, SPEC ONLY)*

**Tables:** `import_jobs`, `import_job_details` (generic, module-agnostic). Full definitions in [`IMPORT_JOB_DATABASE_SPEC.md`](./IMPORT_JOB_DATABASE_SPEC.md); flow in [`IMPORT_JOB_FRAMEWORK_SPEC.md`](./IMPORT_JOB_FRAMEWORK_SPEC.md); the spreadsheet templates that feed imports follow [`TEMPLATE_UI_STANDARD_SPEC.md`](./TEMPLATE_UI_STANDARD_SPEC.md) (XLSX formatting + hidden `_SYSTEM` metadata sheet carrying `template_id` / `template_version` / `module` / `export_mode` / scope).

> **Platform layer, not a module.** Every import flows through here: **External Data → Import Job → Validation → Review → Apply → History → Business Tables.** Import **never** writes a business table directly — Apply (from an **Approved** job) is the only write. Human review is required (Task Card → Review Page → Apply; popup = summary only).

| Relationship | Key | Cardinality |
|--------------|-----|-------------|
| `import_jobs` → `import_job_details` | `import_job_id` | 1 → many |
| `import_job_details` → *any business table* | `table_name` + `record_key` | **logical** reference, resolved on Apply (NOT a stored FK) |

- **Status lifecycle:** Draft → Uploading → Validating → Waiting Review → Approved → Applying → Completed; plus terminal **Cancelled** / **Failed**. Only **Applying** writes business tables.
- **Row classification (per `import_job_details.action`):** `create` (no key), `update` (existing key), `ignore` (blank). Existing-row **locked-field changes** raise a `locked_field_change` **warning** (default `keep_original`; user may `override`) — never silently discarded.
- **First adopter = Carrier Rate Card** (`module = carrier_rate`, `table_name = carrier_rate_cards`, `record_key = rate_card_id`; `CARRIER_AND_ROUTE_SPEC.md` §4C.8 / `IMPORT_JOB_DATABASE_SPEC.md` §10.1).
- **Future adopters:** Warehouse Rate, Container Rate, Forecast, Amazon Inventory, Amazon Sales, Promotion, Factory, Warehouse, Template Import, Future AI Import — all reuse these two tables (no new import tables per module).
- **vs `import_sync_runs`:** `import_sync_runs` is the **unattended** Amazon scheduled/rolling-sync audit log (writes destination directly, no human review); the Import Job Framework is the **review-gated** path. Complementary; this layer does **not** change `import_sync_runs`.
- **Future email / API sources:** an emailed template reply (§`IMPORT_JOB_FRAMEWORK_SPEC.md` §10) or a warehouse/factory/marketplace API (§11) may create an Import Job (`source = 'email' | 'api'`) — still landing at **Waiting Review** for human approval. Documentation only; not implemented.

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
sku_details ──(series)──▶ tax_referral_rates   (HS Code / Duty / VAT / Referral / Declared Value — source of truth)
   │
   └──(sku)──▶ sku_regional_details ──(synced: site_sku / marketplace_product_id)──▶ marketplace_skus
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
| Request Order / 下單系統 | **identity:** marketplace_skus (sku+country+marketplace) + sku_details (category/series). **v2 connected sources:** fc_regular_forecast (Basic T3 + 2nd-layer), amazon_inventory_snapshot (Site Stock), overseas_inventory_snapshot + warehouses (3rd Party), factory_stock (Factory Stock), purchase_orders + purchase_order_lines (Ongoing Orders), supplier_price_list (Lead Time), fc_special_events (2nd-layer events), fc_target_rules (2nd-layer Edit Target %). Remaining / Risk / Suggested Order still placeholders (Mapping v2 §12). **Never reads the Inventory Replenishment DOM.** | future: purchase_orders, purchase_order_lines (Send Request aggregation — not implemented) |
| Purchase Order **Workspace** *(was PO Overview)* | purchase_orders, purchase_order_lines, production_schedule | purchase_orders, purchase_order_lines (Save / Send PO / Update / **Receive** → `completed_qty`/`remaining_qty`/`order_status`) |
| Purchase Order **Overview / Remaining Overview** *(was PO List)* | purchase_orders, purchase_order_lines, sku_details (category/series), warehouses (factory) | — (read; remaining/completed view + future Shipment allocation source) |
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
