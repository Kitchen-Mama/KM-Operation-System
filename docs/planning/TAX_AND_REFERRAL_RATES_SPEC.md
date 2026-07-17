# Tax & Referral Rates — Reference Master Spec (V2)

**Status:** 🟢 V2 — DB finalized by user; runtime alignment IN PROGRESS (SKU Details tax subpage = parent-rate CRUD; component editor deferred, read-only).
**Last Updated:** 2026-07-16
**Maintained By:** Development Team
**Related:** [`SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md`](./SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md) (SKU Domain v2.0 — Layer 4) · [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §4B · [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) (estimated-tax consumer) · [`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](./DOCUMENT_GENERATION_SYSTEM_SPEC.md) (HS_CODE / DECLARED_* / VAT_NO / EORI_NO) · [`CARRIER_AND_ROUTE_SPEC.md`](./CARRIER_AND_ROUTE_SPEC.md).

> **THIS FILE IS THE SINGLE SOURCE OF TRUTH (SSOT)** for `tax_referral_rates` + `tax_rate_components`: schemas, ID conventions, effective-date/versioning rules, lookup rules, and the component model. Other specs carry **concise consumer rules + a pointer here** — they must NOT re-define the schema.

---

## 1. Purpose & Positioning

- **Reference Master** (master/reference data — not a Decision Layer, not transactional).
- **Authoritative source** for: HS Code · base duty rate · VAT number · VAT rate · EORI number · port tax rate · referral fee rate · declared value · declared currency · country of origin — **per Series + Origin Country + Duty Country + validity period**.
- **`tax_rate_components`** is the optional **child breakdown** of additional/compound tax elements (Section 301, IEEPA, anti-dumping, countervailing, excise, surtax, per-unit surcharge, environmental levy, special temporary tariff, …).
- **Authoritative input for these (future) consumers:** SKU Details tax maintenance · Shipment estimated duty/tax · Cost Analysis tax/referral-fee inputs · Carrier/customs document declared value + currency + HS Code · VAT/EORI references · future Tax & Referral Rates management UI.
- **No landed-cost formula, FX conversion, or Duty Engine is defined or implemented here** — consumers read this table when built (see §9–§11).

---

## 2. Canonical Schema (V2 — finalized physical columns)

### 2.1 `tax_referral_rates` (PARENT / master)

| Column | Note |
|--------|------|
| `tax_rate_id` | PK — see §3.1 ID convention; immutable |
| `series` | join key — matched from `sku_details.series`; UPPERCASE |
| `country_of_origin` | manufacturing origin (ISO alpha-2; kept here, **not** on `sku_details`) |
| `duty_country` | destination / duty jurisdiction (ISO alpha-2) |
| `hscode` | HS / tariff classification code |
| `duty_rate` | base import duty rate (**whole-number percent — §7**) |
| `vat_no` | VAT / tax registration number for destination customs docs (nullable) |
| `vat_rate` | value-added tax rate (whole-number percent) |
| `eori_no` | EORI registration number (EU/UK customs; nullable) |
| `port_tax_rate` | port / harbor / handling tax rate (whole-number percent) |
| `referral_fee_rate` | marketplace referral fee rate (whole-number percent) |
| `declared_value` | customs declared **unit** value |
| `declared_currency` | currency for `declared_value` (ISO 4217, uppercase) |
| `effective_from` | effective start (inclusive) |
| `effective_to` | effective end (inclusive; **blank = open-ended**) |
| `note` | free text |
| `created_at` | system |
| `updated_at` | system |

### 2.2 `tax_rate_components` (CHILD / optional breakdown)

| Column | Note |
|--------|------|
| `tax_component_id` | PK — see §3.2 ID convention; immutable |
| `tax_rate_id` | **FK → `tax_referral_rates.tax_rate_id`** (required; a component must never exist without a valid parent) |
| `component_type` | stable classification (e.g. `additional_customs_duty`, `anti_dumping`, `countervailing`, `excise`, `surcharge`, `environmental_levy`, `special_tariff`) |
| `component_code` | stable short code, UPPERCASE, no spaces (e.g. `SEC301`, `IEEPA`, `SURTAX`) |
| `component_name` | human-readable label |
| `rate_type` | `percentage` \| `amount_per_unit` \| `fixed_amount` (§6) |
| `rate_value` | used when `rate_type = percentage` (whole-number percent) |
| `amount_per_unit` | used when `rate_type = amount_per_unit` |
| `amount_currency` | currency for `amount_per_unit` / `fixed_amount` (ISO 4217) |
| `quantity_unit` | unit basis for `amount_per_unit` (e.g. `unit`, `kg`, `carton`) |
| `effective_from` | effective start (inclusive) |
| `effective_to` | effective end (inclusive; blank = open-ended) |
| `source_url` | supporting-evidence URL (nullable; never fabricated) |
| `note` | free text |
| `created_at` | system |
| `updated_at` | system |

> **RETIRED / DO-NOT-REINTRODUCE columns** (v1 → v2): `extra_tax_rate` (dropped), `vat` → **`vat_rate`**, `port_tax` → **`port_tax_rate`**. Do NOT add `status`, `is_active`, `country`, `marketplace`, or `sku` to either table. If a retired column physically remains on the sheet, **stop writing it; preserve it for audit; read it only via an explicit compatibility rule** (the API normalizer keeps a read-only `vat`/`port_tax` fallback — §Runtime). Adding any column outside these two finalized schemas requires raising a blocker first.

---

## 3. Canonical Identity Rules

### 3.1 `tax_rate_id`
Format: **`TRR-{SERIES}-{DUTY_COUNTRY}-{ORIGIN_COUNTRY}-{EFFECTIVE_FROM}-V{NN}`**
Examples: `TRR-CO1100-US-CN-20260701-V01` · `TRR-GA0450-CA-CN-20260701-V01` · `TRR-SP3120-DE-CN-20260715-V01`
- `TRR` prefix fixed; Series UPPERCASE; duty + origin countries ISO alpha-2; `EFFECTIVE_FROM` = `YYYYMMDD`; version `V01`, `V02`, …
- **Immutable after creation.** Do NOT embed HS Code, currency, declared value, or a tax percentage in the ID.
- **Lookup logic uses the real columns — NEVER parses the ID string.**

### 3.2 `tax_component_id`
Format: **`TRC-{TAX_RATE_ID_SUFFIX}-{COMPONENT_CODE}-V{NN}`**, recommended full form **`TRC-{SERIES}-{DUTY_COUNTRY}-{ORIGIN_COUNTRY}-{EFFECTIVE_FROM}-{COMPONENT_CODE}-V{NN}`**
Examples: `TRC-GA0450-US-CN-20260701-SEC301-V01` · `TRC-GA0450-US-CN-20260701-IEEPA-V01` · `TRC-CO1100-CA-CN-20260701-SURTAX-V01`
- `TRC` prefix fixed; `component_code` UPPERCASE, no spaces; immutable.
- **The parent link is always resolved through the `tax_rate_id` column — never by parsing `tax_component_id`.**

---

## 4. Effective-Date Semantics (both tables)

- `effective_from` = inclusive start; `effective_to` = inclusive end.
- **Blank `effective_to` = open-ended / currently valid indefinitely.** Blank `effective_to` is VALID and must NEVER raise `"effective_to is not a valid date"`, be treated as null-invalid, or as a zero date.
- **Canonical active-date rule** for a `target_date`:
  ```
  effective_from <= target_date
  AND ( effective_to is blank OR effective_to >= target_date )
  ```
- **Selection priority:** (1) match the complete business key; (2) keep only rows valid for `target_date`; (3) latest `effective_from` wins; (4) if the same `effective_from` still has multiple versions → highest `V{NN}` or latest `updated_at` wins; (5) if ambiguous duplicates remain → return a **conflict warning**.
- **Never auto-overwrite a historical row** when a new effective period begins. Historical versions stay queryable.

---

## 5. Business Keys & Lookup Paths

### 5.1 Parent business key (canonical)
**`series` + `country_of_origin` + `duty_country` + target effective date.**
HS Code is a **returned** attribute of the matched row — **not** a lookup key.

### 5.2 Shipment-line resolution
```
shipment_lines.sku → sku_details.sku → sku_details.series           (Series)
shipments.country  → tax_referral_rates.duty_country                (Duty jurisdiction)
country_of_origin  = the tax record's stored country_of_origin       (SKU/product origin; commonly CN)
```
- **Do NOT assume every product is permanently CN in an engine.** Use the stored `country_of_origin` on the tax record + available SKU/origin context. If v1 has no SKU origin field, a controlled **CN default** is allowed **only where an existing spec already permits it**, and the limitation is documented (see §K/§M consumers).

### 5.3 Child resolution
Load `tax_rate_components` where `tax_rate_id = matched parent` AND the component is valid for the **same** `target_date` (§4).

---

## 6. Rate Component Model

Canonical `rate_type` values (support at least):
- **`percentage`** — `rate_value` is a percentage rate (whole-number percent — §7; e.g. `25` = 25%).
- **`amount_per_unit`** — uses `amount_per_unit` + `amount_currency` + `quantity_unit` (e.g. `0.50` `USD` per `unit`).
- **`fixed_amount`** — a fixed charge (`amount_per_unit` holds the amount + `amount_currency`), applied per the future calculation scope.

Rules:
- **Do NOT calculate a component from both `rate_value` and `amount_per_unit`** unless its `rate_type` explicitly requires it.
- `component_type` + `component_code` are stable classification fields; `component_name` is the human-readable label.
- **Do NOT duplicate** the parent `duty_rate` / `vat_rate` / `port_tax_rate` / `referral_fee_rate` into a component unless the business explicitly models that element separately.

---

## 7. Rate Convention (project audit result — CANONICAL)

Audit finding: the project has **no single explicit decimal convention** (FC target/percentage fields use percentages; a distinct derived `discount_percent` uses a fraction). Therefore, for **all `tax_referral_rates` rate fields and `percentage` components**, the canonical rule is **whole-number percent**:

- `25` means **25%**, not `0.25`.
- Applies to `duty_rate`, `vat_rate`, `port_tax_rate`, `referral_fee_rate`, and component `rate_value` (when `rate_type = percentage`).
- `amount_per_unit` / `fixed_amount` are absolute currency amounts (not percentages).
- Consumers dividing by 100 must do so exactly once, at the point of computation, in the future engine.

---

## 8. Relationships & Cardinality

```
sku_details.series ──► tax_referral_rates.series            (1 Series → many rate rows)
tax_referral_rates.tax_rate_id ──► tax_rate_components.tax_rate_id   (1 parent → many components)
shipments.country ──► tax_referral_rates.duty_country
shipment_lines.sku → sku_details.sku → sku_details.series
```

- **One Series may have many** duty countries × origin-country combinations × effective versions.
- **One `tax_referral_rates` row may have many components.**
- **`tax_referral_rates` is NOT one row per SKU.** Every SKU in a series inherits its series' tax records; different SKUs under the same series reuse the same rate rows.

---

## 9. SKU Details — HS Code & Tax Rates Subpage

Purpose: authorized users maintain a Series' country tax records from the SKU Details Add/Edit workflow **without opening the raw sheet**. This subpage **writes to `tax_referral_rates`** (and optionally `tax_rate_components`) — it is **NOT** part of `sku_details` and **never writes HS Code or tax fields into `sku_details`**.

**Recommended UI title:** `HS Code & Tax Rates`.

**Parent-rate fields:** Series (inherited from the selected SKU, read-only in the tax row — changed only via the main SKU editor) · Country of Origin · Duty Country · HS Code · Duty Rate · VAT No · VAT Rate · EORI No · Port Tax Rate · Referral Fee Rate · Declared Value · Declared Currency · Effective From · Effective To · Note.

**Behavior:**
1. SKU main data saves normally (existing `upsertSkuDetail`).
2. The subpage lists existing `tax_referral_rates` rows matching the SKU's Series.
3. Users may: add a country rate · edit the current effective version · create a **new** effective version · inspect previous versions · manage optional component rows.
4. Saving a parent rate writes `tax_referral_rates`; saving a component writes `tax_rate_components` and must reference a valid `tax_rate_id`.
5. Warn before creating an **overlapping** effective period for the same business key.
6. Never silently delete or overwrite historical versions.

**Current runtime scope (V2 alignment):** parent-rate **CRUD + versioning is implemented**; the **component editor is DEFERRED** — components are shown **read-only** with an explicit "editor deferred" note. Component saves are **not faked** (no success without a DB write).

---

## 10. Future Tax & Referral Rates Management Page

Responsibilities (documented; runtime deferred unless a page shell already exists — none does today):
- View `tax_referral_rates`; expand/view `tax_rate_components`.
- Filter by Series · Country of Origin · Duty Country · HS Code · Effective Date.
- Show current + historical versions; create a new effective version; update permitted fields; add/edit components; show `source_url`.
- Warn on overlapping periods / ambiguous duplicates. **Do NOT delete history by default.**
- If marked "Soon": update specs + API/data layer only; leave the page explicitly deferred; **do not build a superficial fake page.**

---

## 11. Consumers (source rules; formulas NOT defined here)

### 11.1 Shipment estimated tax (future — inputs only)
Per shipment line: (1) resolve SKU Series; (2) `shipments.country → duty_country`; (3) resolve `country_of_origin`; (4) choose the effective parent row for the **calculation date**; (5) load child components valid for the same date; (6) compute from declared value × quantity per the future costing formula; (7) aggregate line → shipment totals.
- **Calculation date priority:** (1) Shipment ETD if present; (2) Shipment creation/order calc date; (3) current date only as a last-resort Draft estimate. **Never** use the document-generation date as the historical tax date of an existing shipment.

### 11.2 Cost Analysis (future — authoritative inputs + audit)
Parent inputs: `duty_rate`, `vat_rate`, `port_tax_rate`, `referral_fee_rate`, `declared_value`, `declared_currency`. Child inputs: percentage component rates, per-unit charges, fixed components.
Cost Analysis must **preserve** the matched `tax_rate_id`, matched component IDs, calculation date, currency, and source values used (historical audit after newer versions exist). **Do NOT query only the latest row without considering the transaction date.**

### 11.3 Carrier / Customs documents (source path)
```
shipment line SKU → sku_details.series → tax_referral_rates
  (matched by series + country_of_origin + duty_country + effective date)
```
Resolve: `HS_CODE → hscode` · `DECLARED_UNIT_VALUE → declared_value` · `DECLARED_CURRENCY → declared_currency` · `VAT_NO → vat_no` · `EORI_NO → eori_no`.
- Do NOT look up declared values by currency alone. Do NOT use `referral_fee_rate` as a declared value. Do NOT query components unless the document explicitly needs one.
- VAT/EORI optionality follows `document_template_fields.required`; a missing optional VAT/EORI must NOT block unrelated country documents. A missing **required** HS Code or declared value **blocks that external document** with a clear validation message.
- **Carrier Booking consumers** ([`CARRIER_BOOKING_MAPPING_SPEC.md`](./CARRIER_BOOKING_MAPPING_SPEC.md)) use this exact path — e.g. **AGL** maps `HS_CODE → hscode`, `DECLARED_UNIT_VALUE → declared_value` (numeric, not `declared_currency`), with the document lookup date = ETD → creation → current (Draft fallback). AGL v1 keeps a fixed USD declared currency in the template (declared_value still resolved from the matched row).

---

## 12. Versioning / Update Behavior

- **A. Data-entry correction within the same effective version** → **update the existing row**, preserve `tax_rate_id`.
- **B. Genuine new tax/rate/declared-value period** → **create a new row**: new `effective_from`, new `tax_rate_id` (`V{NN}` incremented), previous row preserved.
- Recommended when a new version starts: set the previous row's `effective_to = new effective_from − 1 day`, but **only** when the previous row is open-ended, the business key matches exactly, and the user confirms version creation.
- **Never overwrite the historical row.** The same versioning principle applies to `tax_rate_components`.

---

## 13. Existing-Data Audit / Migration (do not auto-fix silently)

Do NOT delete old data or auto-generate IDs for existing rows if it could cause collisions. Produce a migration recommendation for rows with: blank `tax_rate_id`; blank component ID; invalid country codes; invalid dates; overlapping periods; orphan components (no valid parent); duplicate business keys; missing declared currency/value; missing HS Code. **Never fabricate source URLs or tax values.**

---

## 14. Non-Goals / Deferred

Landed-cost formula · accounting posting · BigQuery migration · government-site scraping · automatic tax-rate verification · FX conversion · deletion of historical versions · Document Engine generation runtime · full Cost Analysis UI · unrelated Carrier Rate Card changes · the component editor UI (read-only for now) · the standalone Tax & Referral Rates management page (documented, deferred).

---

**V2 — DB finalized; SSOT for `tax_referral_rates` + `tax_rate_components`. Parent-rate maintenance runtime aligned via the SKU Details HS Code & Tax Rates subpage; component editor and management page deferred.**

**End of Document**
