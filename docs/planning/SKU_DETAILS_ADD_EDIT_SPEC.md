# SKU Details — Add / Edit Dialog Spec

**Status:** 🟡 Draft v1.1 — Spec only (NO code, NO Apps Script, NO DB migration, NO UI)
**Last Updated:** 2026-07-06
**Maintained By:** Development Team
**Related:** [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md) (Product-Master cleanup — authoritative), [`SKU_DETAILS_LOGISTICS_SPEC.md`](./SKU_DETAILS_LOGISTICS_SPEC.md), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §3, [`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`](./SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md) (Immutable Flow)

> **SKU Domain v2.0 sync (2026-07-06, spec only — no DB migration).** Product-Master cleanup per [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md): **ADD** to SKU Details `material` / `battery_type` / `magnet_type` (attributes) + `base_currency`; **REMOVE / HIDE** `hscode` / `declared_value` / `declared_value_unit` (moved to the **`tax_referral_rates`** Reference Master, keyed by `series` — `TAX_AND_REFERRAL_RATES_SPEC.md`) and `minimum_price_unit` / `msrp_unit` / `selling_unit` (replaced by `base_currency`). Brand baseline prices (`minimum_price` / `msrp` / `selling_price`) STAY. Regional compliance-**document** data (packaging regulation / language / manual+label version) lives on the **SKU Regional Details** page; tax/duty/HS-code live in `tax_referral_rates`.

> **Spec only.** Defines the first-version **Add SKU / Edit SKU** dialog for SKU Details: tab structure, fields, required rules, dropdown option sources, and future extensions. Introduces **no** code, Apps Script, API, DB migration, or UI. Field set follows the **current `sku_details` template** (`DATABASE_RELATIONSHIP_MAP.md` §3).

---

## 1. Purpose

SKU Details is the **product master** (`sku_details`). The Add/Edit dialog is how operators create and maintain that master. This spec fixes the v1 field list, validation, and dropdown sourcing so the dialog can be built without re-deciding column semantics.

---

## 2. Dialog Tab Structure

| Tab | Scope | Status |
|-----|-------|--------|
| **General** | identity + classification (`sku`, `product_name`, `category`, `series`, `lifecycle`, `image_url`, `gs1_code`, `gs1_type`, `amz_asin`, `pm`) | v1 |
| **Attributes** | `material`, `battery_type`, `magnet_type` (product attributes) | **v1.1 (added)** |
| **Logistics** | item / package / carton dimensions + weights + `units_per_carton` | v1 |
| **Pricing** | brand baseline `minimum_price`, `msrp`, `selling_price` + single **`base_currency`** | v1 |
| **Marketplace** | per-marketplace identity/pricing links (`marketplace_skus` / `pricing_list`) — read/link only in v1 | v1 (link) |
| **Regional / Compliance** | packaging regulation / language / manual+label version — managed on the **SKU Regional Details** page (`sku_regional_details`). **HS Code / Duty / VAT / Referral / Declared Value are NOT here** — they live in `tax_referral_rates` (`TAX_AND_REFERRAL_RATES_SPEC.md`, keyed by `series`). | **moved out** |
| **Supplier / Cost** | supplier price list / cost | **Future** |
| **Images** | multiple images / assets | **Future** |

> The **Marketplace** tab surfaces the existing `marketplace_skus` / `pricing_list` relationship for the SKU; it does not redefine those tables. **Regional / compliance fields (`hscode` / `declared_value` / …) are NOT on SKU Details** — they moved to `sku_regional_details` (SKU Regional Details page). `minimum_price` / `msrp` / `selling_price` are **brand baseline reference prices** (governance / below-minimum warning), NOT live marketplace prices (`pricing_list` stays the live price). Supplier/Cost and Images are **future extension** tabs.

---

## 3. v1 Fields (follow current `sku_details` template)

### 3.1 Required (v1)

**General:** `sku`, `product_name`, `category`, `series`, `lifecycle`, `image_url`, `gs1_code`, `gs1_type`, `amz_asin`, `pm`
**Attributes (v1.1 added):** `material`, `battery_type`, `magnet_type`
**Logistics — item:** `item_length`, `item_width`, `item_height`, `item_dimension_unit`, `item_weight`, `item_weight_unit`
**Logistics — package:** `package_length`, `package_width`, `package_height`, `package_dimension_unit`, `package_weight`, `package_weight_unit`
**Logistics — carton:** `carton_length`, `carton_width`, `carton_height`, `carton_dimension_unit`, `carton_weight`, `carton_weight_unit`, `units_per_carton`
**Pricing (brand baseline):** `minimum_price`, `msrp`, `selling_price`, `base_currency`

> **Removed from SKU Details (SKU Domain v2.0):** `hscode` / `declared_value` / `declared_value_unit` → moved to the **`tax_referral_rates`** Reference Master (keyed by `series`); `minimum_price_unit` / `msrp_unit` / `selling_unit` → replaced by the single `base_currency`.

### 3.2 Optional (v1)

`item_length_2`, `item_width_2`, `item_height_2` — **secondary item size** (e.g. large+small combo). **Display only — NOT used in carton CBM** (`SKU_DETAILS_LOGISTICS_SPEC.md` §2).

### 3.3 System (not user-entered)

`created_at`, `updated_at` — set by the backend on create/update.

> This is the current `sku_details` header per `DATABASE_RELATIONSHIP_MAP.md` §3. Legacy single `item_dimensions` / `package_dimensions` / `carton_dimensions` columns are superseded by the split `*_length` / `*_width` / `*_height` + `*_dimension_unit` columns (the API normalizer still reads legacy columns as fallback).

---

## 4. Field Validation Rules

- **Second item dimension group is optional**, but **all-or-nothing**: if `item_length_2` has a value, `item_width_2` and `item_height_2` must **also** be filled (and vice-versa).
- **Dimensions must be > 0** (all length/width/height fields that are filled).
- **Weights must be > 0** (`item_weight`, `package_weight`, `carton_weight`).
- **`units_per_carton` must be a positive integer** (≥ 1).
- **Baseline prices must be ≥ 0** (`minimum_price`, `msrp`, `selling_price`). (`declared_value` moved to `tax_referral_rates`.)
- **Currency / unit fields must not be empty** (every dimension/weight `*_unit`, and `base_currency`).
- **`sku` must be unique** (no duplicate master row).
- **Edit SKU must not change historical Shipment / PO snapshots** — see §7.

---

## 5. Dropdown Fields & Option Source

**Dropdown fields:** `category`, `series`, `lifecycle`, `gs1_type`, `item_dimension_unit`, `item_weight_unit`, `package_dimension_unit`, `package_weight_unit`, `carton_dimension_unit`, `carton_weight_unit`, **`base_currency`**, **`battery_type`**, **`magnet_type`**, `pm`. *(`material` is free text / multi-value underscore, e.g. `Stainless_Steel_ABS` — not a single-select dropdown. Removed: `declared_value_unit` / `minimum_price_unit` / `msrp_unit` / `selling_unit`.)*

**Option source strategy (staged):**

| Term | Source |
|------|--------|
| **Short term** | Front-end **enum config** (hard-coded constants, §6). |
| **Mid term** | `option_lists` / `system_settings` DB tables (centrally editable, no code change). |
| **Long term** | Maintained by **Company / Site / Role management** (per-scope option sets + permissions). |

> `option_lists` / `system_settings` are a **future source** — not implemented now. v1 ships front-end enums; the dialog reads options through a single accessor so the source can later swap to DB without touching field logic.

---

## 6. Default Enums (v1 front-end config)

**dimension_unit:** `cm`, `in`
**weight_unit:** `kg`, `lb`
**base_currency** (single currency for `minimum_price` / `msrp` / `selling_price`): `USD`, `TWD`, `RMB`, `EUR`, `GBP`, `JPY`, `AUD`, `CAD`
**battery_type:** `none`, `built_in`, `removable`, `lithium`, `unknown`
**magnet_type:** `none`, `magnetic`, `unknown`
**gs1_type:** `UPC`, `EAN`, `GTIN`
**lifecycle:** `Upcoming SKU`, `Running in the Market`, `Phasing Out`, `Closure`, `Other`

> `material` is **free text, multi-value underscore format** (e.g. `Stainless_Steel_ABS`) — not enumerated in v1. `battery_type` / `magnet_type` enums are **suggested** and may stay implementation-defined until standardized (`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` §2.3).

> `category` / `series` / `pm` are also dropdowns but their options are **data-derived** (existing distinct values from `sku_details`) plus free-add in v1; they move to `option_lists` in the mid term.
>
> **Lifecycle enum (RECONCILED — authoritative):** the dialog uses exactly the live backend enum `00_config.gs` `VALID_LIFECYCLES_` = `['Upcoming SKU', 'Running in the Market', 'Phasing Out', 'Closure', 'Other']`. The earlier draft values (`Running in Market` / `Phase Out` / `Discontinued`) are **superseded and must not be used** anywhere (spec or front-end). The front-end already uses these live values (`operation-system-db-api.js` normalizer + `saveEditSku` validation); no front-end enum change was required.

---

## 7. Dialog Rules (Add vs Edit) — Immutable Flow

- **Add** creates a new `sku_details` master row.
- **SKU Details master SKU creation MAY trigger a Factory Stock baseline row** (a zero/initial `factory_stock` row for the new SKU) — future behavior, noted here so Add is understood as a master event, not just a form write.
- **Edit** updates the `sku_details` row **only**.
- **Existing Decision Snapshot / Execution Snapshot / PO Snapshot must NOT be mutated** by an Edit. Historical `shipping_plan_lines` / `shipment_lines` / `purchase_order_lines` snapshots (product name, dims, weights, prices captured at commit time) are **frozen** — editing the master never rewrites them (Immutable Flow, `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`). Downstream layers copied what they needed at commit; the master is a live reference only for **new** records.
- **Supplier / Cost, Attributes, Images tabs are future extension** — not part of v1.

---

## 8. Non-Goals (v1)

Do **not** implement now: code · UI · Apps Script · API · DB migration · `option_lists` / `system_settings` tables · Supplier/Cost/Attributes/Images tabs · Role & Permission · image upload/storage · factory-stock baseline automation (spec-noted only).

---

## 9. Open Items

- ~~Lifecycle enum reconciliation with `VALID_LIFECYCLES_`~~ ✅ **Resolved (§6):** dialog uses `Upcoming SKU / Running in the Market / Phasing Out / Closure / Other`.
- `option_lists` / `system_settings` schema (mid-term).
- Factory Stock baseline-row trigger on SKU create (rules, defaults).
- `category` / `series` / `pm` option governance (data-derived → DB → role-managed).
- Marketplace tab depth (read-only link vs inline edit of `marketplace_skus` / `pricing_list`).

---

**Draft v1 — Spec only. No code, DB, API, Apps Script, or UI changes are implied.**

**End of Document**
