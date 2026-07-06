# SKU Master Domain — Architecture Spec

**Status:** 🟢 Draft v2.0 — **Spec only.** NO code, NO frontend, NO Apps Script, NO API, NO DB migration. The actual DB is **not** modified. Implementation is **pending**; the user will update the actual DB after this MD and the implementation plan are ready.
**Last Updated:** 2026-07-06
**Maintained By:** Development Team
**Related:** [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) (Tax/Referral Reference Master — authoritative for HS Code / Duty / VAT / Referral / Declared Value), [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §3/§4/§4A/§4B, [`SKU_DETAILS_ADD_EDIT_SPEC.md`](./SKU_DETAILS_ADD_EDIT_SPEC.md), [`SKU_DETAILS_LOGISTICS_SPEC.md`](./SKU_DETAILS_LOGISTICS_SPEC.md), [`INVENTORY_TABLE_MAPPING_SPEC.md`](./INVENTORY_TABLE_MAPPING_SPEC.md) §17.

> **v2.0 changelog (2026-07-06, spec only — no DB migration).** Restructured the SKU domain into **four clean layers** (§1). **`sku_regional_details` simplified** — all tax/duty/HS-code/declared-value fields **removed** and relocated to the new **`tax_referral_rates`** Reference Master ([`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md)); regional details now holds regional identity + compliance-document fields only (§4). **`sku_regional_details` is now the HIGHER-LEVEL source** and `marketplace_skus` is its **operational synchronized copy** (§6 — reverses the v1 conflict rule for identity fields). Two creation flows documented (§6.1). `country_of_origin` intentionally lives in `tax_referral_rates` (not `sku_details`) for now.

> **Purpose.** Finalize the SKU domain: (1) `sku_details` = Product Master, (2) `sku_regional_details` = Regional/Marketplace Compliance Master + source of truth for marketplace identifiers, (3) `marketplace_skus` = Operational Marketplace Layer (synced copy), (4) `tax_referral_rates` = Tax/Referral/Duty Reference Master. **Schema/relationship definition only — nothing implemented; no live DB column added, renamed, or removed by this spec.**

---

## 1. Four-layer SKU domain & source-of-truth summary

| Layer | Table | Role | Authority / stores |
|-------|-------|------|--------------------|
| **1** | **`sku_details`** | **Product Master** | globally shared product facts: identity · classification · lifecycle · image · logistics dims/weights · material · battery/magnet type · **brand baseline price** (`base_currency`) |
| **2** | **`sku_regional_details`** | **Regional / Marketplace Compliance Master** | regional product info + **source of truth for marketplace identifiers** (`site_sku`, `marketplace_product_id`): packaging regulation · regulation url · language · manual/label version · battery regulation |
| **3** | **`marketplace_skus`** | **Operational Marketplace Layer** | used by Inventory Replenishment / Forecast / Inventory / Shipment; **operational copy synchronized from `sku_regional_details`** |
| **4** | **`tax_referral_rates`** | **Reference Master** | country-level **HS Code · Duty · Extra Tax · VAT · Port Tax · Referral Fee · Declared Value · country_of_origin**; future Cost / Duty / Shipment-cost / Compliance engines |

**Layer flow (identity):** `sku_details` → `sku_regional_details` → `marketplace_skus`.
**Reference flow (tax):** `sku_details` → `series` → `tax_referral_rates` → Duty / Referral / VAT / Declared Value / Cost Engine / Shipment Cost / Export / future AI cost recommendation.

**Pricing stays separate (unchanged):** `sku_details` = brand **baseline** reference price; `pricing_list` = **live** marketplace price; `pricing_change_log` = price history. Tax/duty/referral is **NOT** pricing — it lives only in `tax_referral_rates` (§8).

`sku_details` stays the **primary SKU master**. `sku_regional_details` is the **higher-level source** for marketplace identifiers; `marketplace_skus` is the **operational synchronized copy**.

---

## 2. `sku_details` — Product Master (cleanup)

`sku_details` stores **global product facts only**. Regional / compliance data moves out (§4); price-unit columns are replaced by a single `base_currency` (§2.2); product attributes are added (§2.3).

### 2.1 Brand baseline price — KEPT in `sku_details`
- **KEEP:** `minimum_price`, `msrp`, `selling_price`.
- These are **brand baseline / reference prices — NOT live marketplace prices.** Uses: pricing comparison, **warning when a marketplace price is below the brand minimum**, audit / pricing governance.
- The live price stays in `pricing_list` (§1). No pricing logic is added here.

### 2.2 `base_currency` replaces the per-price unit columns
- **ADD:** `base_currency` — the single currency for all three baseline prices.
- **DEPRECATE / stop writing:** `minimum_price_unit`, `msrp_unit`, `selling_unit`.
- **Rule:** `minimum_price` / `msrp` / `selling_price` are all expressed in `base_currency`.
- Legacy `*_unit` columns are **read-fallback only** during migration (if `base_currency` is blank, a reader may fall back to the old `*_unit`); no new writes go to `*_unit`.

### 2.3 Product attribute columns — ADD to `sku_details`
- **ADD:** `material`, `battery_type`, `magnet_type`.
- **Suggested value rules (implementation-defined; may stay loose if not already standardized):**
  - `material` — may be **multi-value using underscore format**, e.g. `Stainless_Steel_ABS`.
  - `battery_type` — controlled values, e.g. `none` / `built_in` / `removable` / `lithium` / `unknown`.
  - `magnet_type` — controlled values, e.g. `none` / `magnetic` / `unknown`.

### 2.4 Regional / compliance columns — MOVE OUT of `sku_details`
- **DEPRECATE / stop writing from `sku_details`:** `hscode`, `declared_value`, `declared_value_unit`.
- These belong to **`sku_regional_details`** (§4). They are compliance data that varies by country/marketplace and must not live on the global master.
- Legacy values on `sku_details` are **read-fallback only** during migration; the authoritative home is `sku_regional_details`.

### 2.5 Resulting `sku_details` column intent (post-cleanup, target)
`sku`, `product_name`, `category`, `series`, `lifecycle`, `image_url`, `gs1_code`, `gs1_type`, `amz_asin`, `pm`,
**item/package/carton** dims + units + weights + `units_per_carton` (unchanged — `SKU_DETAILS_LOGISTICS_SPEC.md`),
**attributes:** `material`, `battery_type`, `magnet_type`,
**baseline price:** `minimum_price`, `msrp`, `selling_price`, `base_currency`,
`created_at`, `updated_at`.
Deprecated (present for back-compat, not written): `hscode`, `declared_value`, `declared_value_unit`, `minimum_price_unit`, `msrp_unit`, `selling_unit`.

> `amz_asin` on `sku_details` (a master-level informational field) is out of scope for this change; the **operational** platform id migration is on `marketplace_skus` (§5).

---

## 3. `pricing_list` remains independent (unchanged)
- Do **NOT** move `pricing_list` into `sku_regional_details`.
- `pricing_list` remains the **live marketplace pricing source**; `pricing_change_log` remains the **pricing history**.
- No pricing field is added to `sku_regional_details`. **No pricing editing** happens on the SKU Regional Details page.

---

## 4. `sku_regional_details` — Regional / Marketplace Compliance Master (v2 — simplified)

**Purpose:** SKU-level **regional product information** and the **source of truth for marketplace identifiers** (`site_sku`, `marketplace_product_id`). **All tax / duty / HS-code / declared-value fields were removed in v2** and relocated to `tax_referral_rates` (§8, [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md)).

**Schema (v2 — authoritative):**

| Column | Note |
|--------|------|
| `regional_detail_id` | PK (system generated) |
| `sku` | → `sku_details.sku` |
| `company` | operational owner (KM / ResUS / ResTW …) |
| `country` | site country |
| `marketplace` | site marketplace |
| `site_sku` | **source of truth** for the site SKU (synced INTO `marketplace_skus`, §6) |
| `marketplace_product_id` | **source of truth** for the platform-neutral product id (Amazon ASIN stored here; UI may label "ASIN"). Synced INTO `marketplace_skus` (§5/§6) |
| `packaging_regulation` | free text / code |
| `regulation_url` | reference link |
| `language` | required manual / label language(s) |
| `manual_version` | manual version reference |
| `label_version` | label version reference |
| `battery_regulation` | battery-compliance reference |
| `created_at` | system |
| `updated_at` | system |

- **Match grain:** `sku + company + country + marketplace` (one regional row per company/country/marketplace site).
- **REMOVED in v2 (moved to `tax_referral_rates`):** `hscode`, `duty_rate`, `extra_duty_rate`, `vat`, `port_tax`, `referral_fee_rate`, `declared_value`, `declared_currency`. Also removed: `marketplace_sku_id`, `status`, `note`, `warning_label` (superseded by `label_version` / `battery_regulation`); `manual_language` → `language`.
- Compliance-document fields (`packaging_regulation`, `regulation_url`, `language`, `manual_version`, `label_version`, `battery_regulation`) may be **blank** until filled by the Regional Details page.

---

## 5. `marketplace_skus` — `asin → marketplace_product_id` migration

- **Conceptual rename/migration:** `asin` → **`marketplace_product_id`** (platform-neutral). Reason: ASIN is Amazon-specific; `marketplace_product_id` generalizes to any platform.
- **Amazon ASIN is stored in `marketplace_product_id`.** The **UI may display the label "ASIN"** when `marketplace = Amazon`, but the **DB column is `marketplace_product_id`**.
- **`asin` is NOT canonical.** If a legacy `asin` column exists, it is **read-fallback only during migration** (reader uses `marketplace_product_id`, falling back to `asin` when blank); no new writes go to `asin`.

**`marketplace_skus` canonical columns (target):**
`marketplace_sku_id`, `marketplace_id`, `sku`, `company`, `country`, `marketplace`, `site_sku`, **`marketplace_product_id`** (was `asin`), `currency`, `marketplace_sku_status`, `replenishment_model`, `fulfillment_model`, `launch_date`, `created_at`, `updated_at`.

- `marketplace_skus` remains the **operational source of truth for site identity** and must **not** be treated as the pricing source (`pricing_list` is). `fulfillment_model` rules unchanged (`DATABASE_RELATIONSHIP_MAP.md` §4).

---

## 6. Creation & sync rules (`sku_regional_details` ↔ `marketplace_skus`)

**`sku_regional_details` is the higher-level source; `marketplace_skus` is the operational synchronized copy.** Match grain for the pair: `sku + company + country + marketplace`. Primary synchronized fields: **`site_sku`, `marketplace_product_id`, `company`, `country`, `marketplace`**.

### 6.1 Two valid creation flows

**Flow A — Inventory Replenishment first:**
Inventory Replenishment → **Add Marketplace SKU** → creates `marketplace_skus` → **ensure `sku_regional_details`** (create the matching regional row if absent; copy `sku` / `company` / `country` / `marketplace` / `site_sku` / `marketplace_product_id`; compliance-document fields left blank).

**Flow B — Regional Details first:**
SKU Regional Details → create the regional information first (`site_sku`, `marketplace_product_id`, compliance docs) → later, Inventory Replenishment → when the `marketplace_skus` row is created it **automatically copies `site_sku` / `marketplace_product_id` FROM `sku_regional_details`**.

### 6.2 Sync rule (Regional Details = higher priority)
- If `site_sku` or `marketplace_product_id` **changes inside SKU Regional Details** → `marketplace_skus` **must synchronize** (regional → operational).
- If **Inventory Replenishment** updates `site_sku` / `marketplace_product_id` → `sku_regional_details` **must synchronize** (operational → regional).
- **Avoid silent divergence** — a save that changes an identity field propagates to the paired row.

### 6.3 Conflict resolution
- **`sku_regional_details` remains the higher-priority source** for the synchronized identity fields (`site_sku`, `marketplace_product_id`). On an unresolved conflict, the Regional Details value wins.
- Implementation should **surface a warning or repair-sync during save** (no blind overwrite that hides a mismatch).

---

## 7. UI model

### 7.1 SKU Details page (mostly as-is)
- **ADD fields:** `material`, `battery_type`, `magnet_type`, `base_currency`.
- **REMOVE / HIDE fields:** `hscode`, `declared_value`, `declared_value_unit`, `minimum_price_unit`, `msrp_unit`, `selling_unit`.
- Keep everything else (identity, logistics, baseline prices) as today.

### 7.2 SKU Regional Details page / tab (simple management UI)
Manages **`sku_regional_details`** (v2 schema). Shows and edits:
`sku`, `company`, `country`, `marketplace`, `site_sku`, `marketplace_product_id`, `packaging_regulation`, `regulation_url`, `language`, `manual_version`, `label_version`, `battery_regulation`.
- **No pricing editing** and **no tax/duty editing** in SKU Regional Details — HS Code / Duty / VAT / Referral / Declared Value live in `tax_referral_rates` (§8).
- Editing `site_sku` / `marketplace_product_id` here propagates to `marketplace_skus` (§6.2); Regional Details is the higher-priority source.

---

## 8. Layer 4 — `tax_referral_rates` (Reference Master)

- **HS Code / Duty / Extra Tax / VAT / Port Tax / Referral Fee / Declared Value / `country_of_origin`** live **ONLY** in `tax_referral_rates` — **do not duplicate these values in `sku_details`, `sku_regional_details`, or `marketplace_skus`.**
- Keyed by **`series`** (+ `duty_country`), joined from `sku_details.series`. Full schema, purpose, and effective-date rules: [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md).
- **`country_of_origin` intentionally stays in `tax_referral_rates` for now** — it is **NOT** moved into `sku_details` in this version.
- Future consumers: Cost Engine · Duty Engine · Shipment Cost · Export · Compliance · future AI cost recommendation (none implemented here).

---

## 9. Non-Goals / Deferred
- No code, frontend, Apps Script, API, DB migration, or live DB change.
- No pricing engine, no Cost/Duty engine; no move of `pricing_list` / `pricing_change_log`.
- Exact enum finalization for `material` / `battery_type` / `magnet_type` may remain implementation-defined until standardized.
- Backfill strategy (populate `base_currency` from legacy `*_unit`; relocate `hscode` / `duty` / `declared_value` → `tax_referral_rates`; copy `asin` → `marketplace_product_id`; simplify `sku_regional_details`) is a **future migration step**, executed by the user on the real DB after this MD + implementation are ready.

---

**Draft v2.0 — Spec only. No code, DB, API, Apps Script, or UI changes are implied. The actual DB will be updated by the user after the MD and implementation are ready.**

**End of Document**
