# Pricing Database Mapping — Inventory Replenishment Add / Import SKU

**Last Updated:** 2026-06-08
**Maintained By:** Development Team
**Document Purpose:** Focused data-mapping spec for the Inventory Replenishment **Add SKU / Import SKU** flow — defining how a `marketplace_skus` row creates or updates `pricing_list`, `pricing_change_log`, and `fc_regular_forecast`.

**Status:** Specification / Planning (not yet implemented)
**Source of Truth (architecture):** `SKU_MASTER_FLOW.md`

---

## 1. Purpose

This document defines the data mapping and record-creation rules for the Inventory Replenishment Add / Import flow. It specifies:

- How `marketplace_skus` rows are added or imported.
- How `pricing_list` rows are auto-generated from a `marketplace_skus` row.
- How `pricing_change_log` audits subsequent pricing changes.
- How an `fc_regular_forecast` base row is created.

It is intended to be the implementation reference for Inventory Replenishment import, so that build work can proceed with minimal ambiguity (and minimal credit usage). It does not contain code.

---

## 2. Source Tables

Input / source tables referenced by this flow:

| Table | Role in this flow |
|-------|-------------------|
| `sku_details` | Master SKU validation + source of `category`, `series`, and base pricing inputs. |
| `marketplace_skus` | The operational anchor created/updated by Add/Import; drives all downstream rows. |
| `pricing_list` | Auto-created pricing row (one per `marketplace_sku_id`); sole source of truth for prices. |
| `pricing_change_log` | Field-level audit of pricing changes. |
| `fc_regular_forecast` | FC Summary base row (one per year × company × country × marketplace × sku). |

---

## 3. marketplace_skus Required Columns

| Column | Notes |
|--------|-------|
| `marketplace_sku_id` | Primary identity. |
| `sku` | FK to `sku_details.sku`. |
| `company` | Operational ownership (see below). |
| `country` | |
| `marketplace` | |
| `site_sku` | |
| `asin` | |
| `currency` | Site currency / helper field only (see below). |
| `marketplace_sku_status` | active / phasing_out / inactive / discontinued. |
| `replenishment_model` | sales_driven / forecast_driven. |
| `launch_date` | |
| `created_at` | |
| `updated_at` | |

**Important:**
- `company` belongs in `marketplace_skus` because operational ownership may vary by country / marketplace (the same master SKU can be operated by different companies across sites).
- `marketplace_skus` must **not** be the pricing source of truth.
- `currency` may be kept **only** as a site currency / helper field for MVP. Pricing **values** (Regular / Minimum / MSRP) must live in `pricing_list`, never in `marketplace_skus`.

---

## 4. pricing_list Mapping Rules

Create **one** `pricing_list` row per `marketplace_sku_id`.

**Columns:**
```
pricing_id, marketplace_sku_id,
sku, country, marketplace, site_sku, asin,
currency,
base_currency, base_regular_price, base_minimum_price, base_msrp,
fx_rate, fx_rate_date,
auto_regular_price, auto_minimum_price, auto_msrp,
regular_price, minimum_price, msrp,
price_source, price_status,
created_by, created_at, updated_by, updated_at, note
```

**Mapping rules:**

| Target column | Source / rule |
|---------------|---------------|
| `marketplace_sku_id` | ← `marketplace_skus.marketplace_sku_id` |
| `sku` | ← `marketplace_skus.sku` |
| `company` | *Not required in `pricing_list`* unless explicitly needed later. |
| `country` | ← `marketplace_skus.country` |
| `marketplace` | ← `marketplace_skus.marketplace` |
| `site_sku` | ← `marketplace_skus.site_sku` |
| `asin` | ← `marketplace_skus.asin` |
| `currency` | ← `marketplace_skus.currency` |
| `base_currency`, `base_regular_price`, `base_minimum_price`, `base_msrp` | From `sku_details` or user / import input. |
| `fx_rate`, `fx_rate_date` | Stored if FX conversion is used. |
| `auto_regular_price`, `auto_minimum_price`, `auto_msrp` | System-calculated = `base_*` × `fx_rate`. |
| `regular_price`, `minimum_price`, `msrp` | Final effective values. |
| `price_source` | `auto_fx` (FX-generated) / `manual_override` (user-entered final) / `import` (imported directly). |
| `price_status` | Default `draft` or `active` — **default to be confirmed** (system convention unclear). |
| `created_by`, `created_at`, `updated_by`, `updated_at`, `note` | Audit / freeform. |

---

## 5. pricing_change_log Rules

- `pricing_change_log` is only required when an **existing** `pricing_list` value changes.
- Initial auto-created `pricing_list` rows do **not** need per-field log entries, unless a future audit policy requires it.
- **Manual edits** to pricing must create log rows.

**Columns:**
```
log_id, pricing_id, field_name,
old_value, new_value,
changed_by, changed_at, change_reason
```

---

## 6. fc_regular_forecast Base Row Rules

Create **one** base row per: `year` × `company` × `country` × `marketplace` × `sku`.

**Columns:**
```
forecast_id, year, company, country, marketplace, sku,
category, series,
jan, feb, mar, apr, may, jun, jul, aug, sep, oct, nov, dec,
total_fc, fc_share, forecast_status, source,
created_at, updated_at
```

**Mapping:**

| Target column | Source / rule |
|---------------|---------------|
| `company` | ← `marketplace_skus.company` |
| `country` | ← `marketplace_skus.country` |
| `marketplace` | ← `marketplace_skus.marketplace` |
| `sku` | ← `marketplace_skus.sku` |
| `category` | ← `sku_details.category` |
| `series` | ← `sku_details.series` |
| `jan`–`dec` | ← 0 |
| `total_fc` | ← 0 |
| `fc_share` | ← blank or 0 |
| `forecast_status` | `draft` or `active` — **default to be confirmed**. |
| `source` | ← `system_auto` |
| `year` | ← current planning year, or user / import selected year. |

---

## 7. Add SKU Flow

When the user adds one SKU from Inventory Replenishment:

1. Validate `sku` exists in `sku_details`.
2. Validate the `company` + `country` + `marketplace` + `sku` combination is not duplicated.
3. Create `marketplace_skus` row.
4. Auto-create `pricing_list` row.
5. Auto-create `fc_regular_forecast` base row.
6. Do **not** create a Factory Stock row.
7. Do **not** create a Request Order placeholder row.

---

## 8. Import SKU Flow

When the user imports a `marketplace_skus` template:

1. Validate required columns.
2. Validate each `sku` exists in `sku_details`.
3. Upsert `marketplace_skus` by `marketplace_sku_id` if present, otherwise by `company` + `country` + `marketplace` + `sku`.
4. For **new** `marketplace_skus` rows:
   - Create `pricing_list` if missing.
   - Create `fc_regular_forecast` base row if missing.
5. For **existing** `marketplace_skus` rows:
   - Update allowed marketplace fields.
   - Do **not** overwrite manual pricing unless explicitly requested.
   - Do **not** overwrite existing forecast values.
6. Return a row-level success / error report.

---

## 9. Duplicate / Upsert Rules

Uniqueness keys:

| Table | Unique key |
|-------|-----------|
| `marketplace_skus` | `company` + `country` + `marketplace` + `sku` |
| `pricing_list` | `marketplace_sku_id` |
| `fc_regular_forecast` | `year` + `company` + `country` + `marketplace` + `sku` |

---

## 10. Non-Goals

This spec explicitly does **not** cover, and the flow must **not** do, the following:

- No Factory Stock creation from Inventory Replenishment.
- No Request Order placeholder rows.
- No pricing values stored in `marketplace_skus`.
- No separate FX DB table for MVP.
- No promotion pricing in `pricing_list`.
- No code implementation in this spec.

---

## 11. Open Decisions

| # | Decision |
|---|----------|
| 1 | `price_status` default: `draft` or `active`. |
| 2 | `forecast_status` default: `draft` or `active`. |
| 3 | Whether `marketplace_skus.currency` remains as a helper field or moves fully to `pricing_list` later. |
| 4 | Whether FX rate is manually provided or fetched by system / API in a future implementation. |

---

**End of Document**
