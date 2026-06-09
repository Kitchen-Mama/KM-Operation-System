# SKU Master Flow

**Last Updated:** 2026-06-08
**Maintained By:** Development Team
**Document Purpose:** Source of truth for SKU lifecycle management — Master SKU creation, Marketplace SKU creation, pricing architecture, FC Summary auto-generation, Request Order SKU sourcing, and Factory Stock initialization.

**Status:** Specification / Planning (not yet fully implemented)

---

## 1. Purpose

This document defines the end-to-end lifecycle of a SKU across the Kitchen Mama Operation System, from the moment a Product Manager (PM) creates a master SKU to the point where it drives operational pages (Inventory Replenishment, FC Summary, Request Order, Factory Stock).

The objective of SKU lifecycle management is to ensure that:

- A SKU is defined **once** as a master record and reused everywhere.
- Marketplace-specific identity (per country + marketplace) is captured separately from the master SKU.
- Pricing is stored in **one** authoritative place and never duplicated.
- Operational pages derive their data from the marketplace SKU relationship rather than maintaining independent SKU lists.
- The flow is explicit and predictable, so future cloud migration and automation can follow a known sequence.

This document is the **single source of truth** for how these records are created and how they relate. Where it conflicts with older notes in other specs, this document describes the intended target architecture (see Section 9 / conflicts in the completion notes).

---

## 2. Core Principles

### Single Source of Truth
Each piece of data has exactly one authoritative table. Master product data lives in `sku_details`. Marketplace identity lives in `marketplace_skus`. Pricing lives in `pricing_list`. No page may maintain its own competing copy.

### No Duplicate Pricing Storage
Pricing values (Regular Price, Minimum Price, MSRP, Currency) are stored **only** in `pricing_list`. They must not be duplicated into `marketplace_skus`, page state, or any operational table. Pages that need pricing read it from `pricing_list`.

### Marketplace SKU Drives Operational Flow
The `marketplace_skus` record (one per SKU × country × marketplace) is the operational anchor. Inventory Replenishment, FC Summary, Request Order, and Factory Stock all key off the marketplace SKU relationship rather than off ad-hoc SKU lists.

### Dynamic Order Planning
Request Order and downstream planning read `marketplace_skus` dynamically at runtime. They do not store a frozen snapshot of which SKUs exist; adding or retiring a marketplace SKU is immediately reflected in planning.

---

## 3. SKU Master Flow

```
PM creates master SKU in SKU Details
        ↓
System creates sku_details record
        ↓
(optional) System initializes Factory Stock baseline rows (current_stock = 0)
        ↓
User creates OR imports marketplace SKU in Inventory Replenishment
        ↓
System creates / updates marketplace_skus record
        ↓
System auto-creates pricing_list record
        ↓
System creates FC Summary base row (fc_regular_forecast: Jan–Dec = 0, total_fc = 0)
        ↓
Request Order dynamically derives plannable SKUs from marketplace_skus + forecast + inventory
```

**Step notes:**

1. **PM creates master SKU in SKU Details** — the product is defined at the master level (product name, category, series, lifecycle, dimensions, etc.).
2. **System creates `sku_details` record** — the master row keyed by `sku`.
3. **(Optional) System initializes Factory Stock baseline** — at master SKU creation, the system *may* optionally create Factory Stock baseline rows with `current_stock = 0`, so the SKU is tracked from day one. Factory Stock initialization belongs to **SKU Details master SKU creation**, not to the Inventory Replenishment Add SKU flow. Initialization is optional, not mandatory.
4. **User creates OR imports marketplace SKU in Inventory Replenishment** — a country + marketplace listing is declared for an existing master SKU, either one at a time (Add SKU) or in bulk (Import; see Import Flow below). The Inventory Replenishment Add SKU flow must **not** create Factory Stock rows.
5. **System creates / updates `marketplace_skus` record** — one row per SKU × country × marketplace, holding identity + operational settings only.
6. **System auto-creates `pricing_list` record** — a pricing row linked to the new `marketplace_sku_id`. This is where all price values live.
7. **System creates FC Summary base row** — an `fc_regular_forecast` base row so the SKU appears in FC Summary without manual setup (Jan–Dec forecast and `total_fc` initialized to 0; see Section 4 / FC Summary notes).
8. **Request Order dynamically derives plannable SKUs** — order planning reads its SKU universe live from `marketplace_skus`, joined with forecast and inventory. It must **not** create placeholder rows; actual request/order records are created only when the user submits an order/request.

### 3.1 Inventory Replenishment Import Flow

`marketplace_skus` may be used as an **import template** for bulk marketplace / site SKU setup. For each imported row, the system creates or updates:

- `marketplace_skus` — the marketplace/site SKU identity + operational settings record.
- `pricing_list` — the auto-created pricing row linked via `marketplace_sku_id`.
- `fc_regular_forecast` — the FC Summary base row (Jan–Dec = 0, `total_fc` = 0).

Import follows the same create/update contract as the single Add SKU flow (Steps 5–7). Import must **not** create Factory Stock rows (Factory Stock baseline belongs to master SKU creation, Step 3).

---

## 4. Pricing Architecture

The following rules are authoritative:

- `marketplace_skus` is **NOT** the source of truth for pricing.
- `pricing_list` is the **only** source of truth for:
  - Regular Price
  - Minimum Price
  - MSRP
  - Currency
- Any page requiring pricing data **must** retrieve pricing from `pricing_list`.
- All pricing modifications **must** be recorded in `pricing_change_log`.
- `marketplace_skus` stores only marketplace identity information and operational settings.

**Pricing record creation & FX (MVP):**

- A `pricing_list` row is **auto-created** when a `marketplace_skus` row is created or imported.
- `pricing_change_log` records future **manual** price changes (field-level audit).
- When an FX rate is used to generate auto prices, the rate is stored in `pricing_list.fx_rate` and `pricing_list.fx_rate_date`.
- For the MVP, FX rate does **not** require a separate DB table — storing it on the `pricing_list` row is sufficient.

**FC Summary base row initialization:**

- When a `marketplace_skus` row is created or imported, the system creates an FC Summary / `fc_regular_forecast` base row.
- Jan–Dec forecast values initialize to 0.
- `total_fc` initializes to 0.
- `forecast_status` default status to be confirmed (align with current system convention — `draft` or `active`).

---

## 5. pricing_list Schema

`pricing_list` is the authoritative pricing table. One row per priced marketplace SKU.

```
pricing_id
marketplace_sku_id

sku
country
marketplace
site_sku
asin

currency

base_currency
base_regular_price
base_minimum_price
base_msrp

fx_rate
fx_rate_date

auto_regular_price
auto_minimum_price
auto_msrp

regular_price
minimum_price
msrp

price_source
price_status

created_by
created_at

updated_by
updated_at

note
```

**Field group notes:**

- **Identity** (`pricing_id`, `marketplace_sku_id`, `sku`, `country`, `marketplace`, `site_sku`, `asin`) — links the pricing row back to the marketplace SKU and master SKU.
- **Base pricing** (`base_currency`, `base_regular_price`, `base_minimum_price`, `base_msrp`) — the reference pricing in the originating/base currency.
- **FX** (`fx_rate`, `fx_rate_date`) — exchange rate and the date it was captured, used to derive local-currency auto prices.
- **Auto-derived pricing** (`auto_regular_price`, `auto_minimum_price`, `auto_msrp`) — system-calculated prices from base × FX.
- **Effective pricing** (`regular_price`, `minimum_price`, `msrp`) — the actual prices in use (manual override or accepted auto values), expressed in `currency`.
- **Provenance** (`price_source`, `price_status`) — whether prices are auto/manual and their review/approval state.
- **Audit** (`created_by`, `created_at`, `updated_by`, `updated_at`, `note`).

---

## 6. pricing_change_log Schema

`pricing_change_log` records every modification to a pricing value for audit and traceability. One row per field change.

```
log_id
pricing_id

field_name

old_value
new_value

changed_by
changed_at

change_reason
```

**Notes:**
- `pricing_id` links each log entry to its `pricing_list` row.
- `field_name` identifies which pricing field changed (e.g. `regular_price`).
- `old_value` / `new_value` capture the before/after.
- `changed_by`, `changed_at`, `change_reason` provide the audit trail.

---

## 7. marketplace_skus Responsibilities

`marketplace_skus` stores marketplace identity and operational settings **only**:

- `marketplace_sku_id`
- `sku`
- `site_sku`
- `country`
- `marketplace`
- `company`
- `asin`
- `status`
- `replenishment_model`
- `launch_date`
- `created_at`
- `updated_at`

**`company` notes:**
- `company` is marketplace/site-level **operational ownership** — the entity that operates the listing.
- It may vary by country / marketplace (the same master SKU can be operated by different companies across sites), so it lives on `marketplace_skus`, not on the master `sku_details`.
- `company` is needed by FC Summary, Request Order, Shipping, Pricing, and downstream reporting.

**`marketplace_skus` must NOT store:**

- `regular_price`
- `minimum_price`
- `msrp`

All pricing for a marketplace SKU is retrieved from `pricing_list` via `marketplace_sku_id`.

---

## 8. Future Expansion

Future promotion / campaign pricing should be implemented as a **separate** table, using one of:

- `pricing_campaigns`

  or

- `promotion_prices`

**Do not** add `effective_from` / `effective_to` columns to `pricing_list`. Time-bounded promotional pricing belongs in the dedicated promotion pricing table, keeping `pricing_list` focused on the current authoritative base/effective price.

---

**End of Document**
