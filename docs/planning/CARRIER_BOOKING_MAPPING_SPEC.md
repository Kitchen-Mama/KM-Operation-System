# Carrier Booking — Per-Carrier Workbook Mapping Spec

**Status:** 🟢 Carrier-specific mappings — **SPEC ONLY** (no Document Engine runtime, no Drive/Sheets operations, no live template edits). TOP SEALAND completed · **AGL FINALIZED V1** · SINOTRANS = next.
**Last Updated:** 2026-07-16
**Maintained By:** Development Team
**Related (authoritative):** [`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](./DOCUMENT_GENERATION_SYSTEM_SPEC.md) — shared Document Engine architecture + runtime rules (§C registry, §E `document_template_fields`, §O Google Sheet runtime rules) · [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) — HS Code / declared-value / declared-currency lookup (SSOT) · [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) — shipment/line field semantics · [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) §4B/§10.

> **Ownership.** This spec = **carrier-specific Carrier Booking workbook mappings** (which placeholders, which worksheet, which controller, per carrier). The **shared** engine rules — registry/schema, immutable-template + copy-before-render, hidden-control-column behavior, `worksheet_name` semantics, reserved-row capacity, dynamic row expansion, footer-formula preservation + range validation, totals validation — are **NOT duplicated here**; they live in [`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](./DOCUMENT_GENERATION_SYSTEM_SPEC.md) **§O** and are referenced. `document_template_fields.placeholder` is stored WITHOUT braces; the template file uses `{{ }}` (DOC GEN §F.1/§N).

---

## 0. Carrier Mapping Progress / Order

| # | Carrier | Scope | Status |
|---|---------|-------|--------|
| 1 | **TOP SEALAND** | Invoice Import Template + Packing List Template | ✅ Completed |
| 2 | **AGL** | Carrier Invoice / Customs workbook (single `Template` worksheet) | ✅ **FINALIZED V1** (this task) |
| 3 | **SINOTRANS** | Carrier booking workbook | 🔵 **NEXT mapping target** (not started) |
| 4 | Future carriers | — | 🔵 Reserved |

> **Do not begin SINOTRANS mapping until separately requested.**

---

## 1. TOP SEALAND (completed — concise)

- Single booking template per DOC GEN §M: `template_key = BOOKING_TOP_SEALAND`, `template_id = TPL-BOOKING-TOP-SEALAND-V1` (`document_type = carrier_booking_form`, `document_category = carrier`, `document_usage = carrier`).
- Two mapped worksheets: **Invoice Import Template** + **Packing List Template** (both completed). Service (sea/land/last-mile) differences are **placeholders, not separate templates** (§M). The confirmed Invoice-tab draft + shared header/line/lookup rules are recorded in DOC GEN **§I.2**.
- Consumes the shared Google-Sheet runtime rules (DOC GEN §O) and the Tax Master v2 lookup (§K below).

---

## 2. AGL — Carrier Invoice / Customs Workbook (FINALIZED V1)

### 2.1 Template Registry

| Field | Value |
|-------|-------|
| `template_id` | `TPL-BOOKING-AGL-V1` |
| `template_key` | `BOOKING_AGL` |
| `document_type` | `carrier_booking_form` |
| `related_entity_type` | `shipment` |
| `document_category` | `carrier` |
| `document_usage` | `carrier` |
| `template_file_type` | `google_sheet` |
| `worksheet_name` | `Template` (exact tab name — DOC GEN §O.3) |
| Collection controller | `AGL_INVOICE_LINES` |
| Line grain | **one output row per `shipment_lines` record** |

- The AGL workbook currently uses **one mapped worksheet: `Template`**. The **`Instructions`** worksheet is **not** part of rendering — it receives **no** `document_template_fields` rows, is preserved in the generated copy, and **never** receives line expansion (DOC GEN §O.3).

### 2.2 Collection Controller

| Attribute | Value |
|-----------|-------|
| `placeholder` | `AGL_INVOICE_LINES` |
| `field_type` | `collection` |
| `data_scope` | `line` |
| `data_source_table` | `shipment_lines` |
| `data_source_path` | `shipment_lines where shipment_id = current shipment_id` |
| `collection_key` | `AGL_INVOICE_LINES` |
| `worksheet_name` | `Template` |

- The controller token `{{AGL_INVOICE_LINES}}` lives in the **hidden control column on the actual line-template row = row 22** (DOC GEN §O.2 — the hidden control column is structural metadata, removed/hidden in output, and is **not** hardcoded to column A in the shared architecture).
- The AGL template may use a newly inserted **hidden control column** while preserving: one visual **spacer** column, one optional **Part #** column, and the main mapped data columns.

### 2.3 Header Mapping

| `field_id` | Placeholder | Template label | Source / rule |
|------------|-------------|----------------|---------------|
| `FIELD-BOOKING-AGL-0001` | `SHIPMENT_NO` | FBA Shipment ID FBA（运单号码） | `shipments.external_shipment_id` → fallback `shipments.shipment_no` → `shipments.shipment_id`. **Placeholder stays `SHIPMENT_NO`** — do NOT rename to `FBA_ID` / `EXTERNAL_SHIPMENT_ID`. |
| `FIELD-BOOKING-AGL-0002` | `ETD` | Date（日期） | `shipments.etd`; `format_rule = yyyy-MM-dd`; `transform_rule = date_only`. |
| `FIELD-BOOKING-AGL-0003` | `DECLARED_CURRENCY` | (currency label) | **Future-ready mapping** → matched `tax_referral_rates.declared_currency`. **AGL v1: fixed USD in the template is retained** — runtime is NOT required to overwrite the fixed USD cell in v1; dynamic currency rendering is **not** implemented (§2.6). Do **not** confuse with `declared_value`. |

### 2.4 Line Mapping (grain = `shipment_lines`)

| `field_id` | Placeholder | Template label | Source / rule |
|------------|-------------|----------------|---------------|
| `FIELD-BOOKING-AGL-0100` | `AGL_INVOICE_LINES` | *(hidden controller, row 22)* | collection controller (§2.2) |
| `FIELD-BOOKING-AGL-0110` | `PRODUCT_NAME_EN` | Description of Goods | `sku_details.product_name` |
| `FIELD-BOOKING-AGL-0120` | `MATERIAL` | Material | `sku_details.material` |
| `FIELD-BOOKING-AGL-0130` | `HS_CODE` | HTS Code | matched `tax_referral_rates.hscode` (§2.7 lookup) |
| `FIELD-BOOKING-AGL-0140` | `COUNTRY_OF_ORIGIN` | Country of Origin | **constant `"China"`** — `field_type = constant`, `data_scope = static`, `default_value = China`. **AGL v1 ONLY** (see §2.5 limitation). |
| `FIELD-BOOKING-AGL-0150` | `QTY` | Qty (pcs) | `shipment_lines.shipment_qty` |
| `FIELD-BOOKING-AGL-0160` | `DECLARED_UNIT_VALUE` | Actual Unit Cost | matched `tax_referral_rates.declared_value` (numeric; **NOT** `declared_currency`) |
| `FIELD-BOOKING-AGL-0170` | `AMOUNT` | Total Unit Value | **formula** `QTY × DECLARED_UNIT_VALUE`; `field_type = formula`, `data_scope = line`, `transform_rule = multiply_qty_declared_value`, `format_rule = #,##0.00`. **Not stored in Shipment DB.** |
| `FIELD-BOOKING-AGL-0180` | `CARTON_QTY` | Ctns | `shipment_lines.shipment_carton_qty` |
| `FIELD-BOOKING-AGL-0190` | `GROSS_WEIGHT` | GW (kgs) | `shipment_lines.gross_weight` — **line-total** GW for the full line quantity |
| `FIELD-BOOKING-AGL-0200` | `NET_WEIGHT` | NW (kgs) | `shipment_lines.net_weight` — **line-total** NW |
| `FIELD-BOOKING-AGL-0210` | `CARTON_CBM` | CBM | `shipment_lines.shipment_carton_cbm` — **line-total CBM; NEVER multiply again by `shipment_carton_qty`** |

- **Do NOT introduce fields for empty AGL columns** (Part # · Section 301 Exclusion Code · Other Exclusion Code · 301 Exclusion Description · Manufacturer name/address · special metal-content columns) unless separately approved. The existing **fixed Manufacturer content remains template content** in v1 — **do NOT add `MANUFACTURER_NAME` / `MANUFACTURER_ADDRESS`** in this task.

### 2.5 Country of Origin constant — AGL v1 limitation

`COUNTRY_OF_ORIGIN = "China"` is an **AGL v1 template constant**, NOT a system-wide fact. **Do not generalize all products as China-origin.** The future-correct source is the matched tax record's `country_of_origin` (TAX SSOT §5.2); AGL v1 hardcodes China as a documented limitation to revisit.

### 2.6 Fixed USD decision (AGL v1)

AGL v1 operates in **USD**; the Google Sheet template contains a **fixed USD value** the user retains for now. Therefore: fixed USD in the template is **allowed**; `DECLARED_CURRENCY` stays **registered** in `document_template_fields` for future readiness; runtime is **not required to overwrite** the fixed USD cell in v1; dynamic currency rendering is **not** claimed as implemented.

### 2.7 Tax / HS Code lookup (Tax Master v2)

Per shipment line, using the canonical Tax Master v2 model (SSOT [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) §5/§11.3):

```
shipment_lines.sku → sku_details.sku → sku_details.series      (Series)
shipments.country  → tax_referral_rates.duty_country           (Duty jurisdiction)
country_of_origin  + target effective date                     → matched tax_referral_rates version
```
Return: `HS_CODE → hscode` · `DECLARED_UNIT_VALUE → declared_value` · `DECLARED_CURRENCY → declared_currency`.

- **Effective-date rule:** `effective_from ≤ target_date AND (effective_to blank OR ≥ target_date)`; **blank `effective_to` = open-ended/valid**; latest `effective_from` wins. **Do NOT match by currency alone.** `declared_currency` is a returned value, not a lookup key.
- **Document lookup date priority:** (1) `shipments.etd`; (2) Shipment creation date; (3) current date only as a **Draft** fallback. **Do NOT use the document-generation date for a historical Shipment when ETD exists.**

### 2.8 Google-Sheet runtime behavior (references shared §O)

All of the following follow the shared rules in DOC GEN **§O** (no AGL-specific engine):

- **Immutable template + copy-before-render** (§O.1): the original AGL `Template` is never modified; all replacement / expansion / row insertion / formula updates happen on a **copy**; result recorded in `generated_documents`.
- **Reserved line capacity** (§O.4): the preformatted region from **row 22** to the footer is **initial capacity, not a maximum**.
  - *Lines ≤ capacity* (e.g. capacity 13, lines 4): fill 4 rows, keep the rest blank; generated copy may keep unused blank rows visible in v1 (`hide_unused_template_rows` deferred).
  - *Lines > capacity* (e.g. capacity 13, lines 18): on the **copy**, insert the extra rows immediately **before the footer**, copy the row-22 line-template formatting (borders / height / number formats / wrapping / alignment / line formulas / data validation / merged-cell behavior), fill values, footer moves down, footer ranges updated (§2.9). **Never merge multiple shipment lines into one row.**
- **Footer formulas** (§O.5 / §2.9): preserved as **formulas**, not placeholders.

### 2.9 Footer formula rule (AGL)

The AGL footer contains Sheet formulas for **Total Invoice Value · Total Ctns · Total GW · Total NW · Total CBM**. These **remain formulas** (not placeholders) in v1. On the generated copy:

```
line_start_row = row 22 (controller / line-template row)
line_end_row   = line_start_row + generated_line_count − 1
```
Runtime must **explicitly validate or rewrite** each footer formula so its range covers `line_start_row : line_end_row` — do NOT assume Sheets auto-adjusts after row insertion:

- Total Invoice Value = `SUM(AMOUNT column, line_start_row:line_end_row)`
- Total Ctns = `SUM(CARTON_QTY column, …)` · Total GW = `SUM(GROSS_WEIGHT column, …)` · Total NW = `SUM(NET_WEIGHT column, …)` · Total CBM = `SUM(CARTON_CBM column, …)`

Footer formulas exist **only on the generated copy**.

### 2.10 Formula totals vs Shipment totals (validation — planned)

Footer totals are computed from rendered AGL line values; **persisted Shipment totals are not written into footer cells.** The engine MAY compare (planned, not implemented): `SUM(QTY)` vs `shipment_total_qty` · `SUM(CARTON_QTY)` vs `shipment_total_cartons` · `SUM(GROSS_WEIGHT)` vs `shipment_total_gross_weight` · `SUM(NET_WEIGHT)` vs `shipment_total_net_weight` · `SUM(CARTON_CBM)` vs `shipment_total_cbm`. On mismatch → warning/validation error per future readiness rules; **never** silently alter Shipment DB or force the formula to match the header (DOC GEN §O.6).

### 2.11 Confirmed `document_template_fields` inventory (AGL)

Header: `FIELD-BOOKING-AGL-0001` SHIPMENT_NO · `-0002` ETD · `-0003` DECLARED_CURRENCY *(future-ready; fixed USD acceptable in v1)*.
Controller: `FIELD-BOOKING-AGL-0100` AGL_INVOICE_LINES.
Line: `-0110` PRODUCT_NAME_EN · `-0120` MATERIAL · `-0130` HS_CODE · `-0140` COUNTRY_OF_ORIGIN · `-0150` QTY · `-0160` DECLARED_UNIT_VALUE · `-0170` AMOUNT · `-0180` CARTON_QTY · `-0190` GROSS_WEIGHT · `-0200` NET_WEIGHT · `-0210` CARTON_CBM.

### 2.12 AGL mapping status

**COMPLETED / FINALIZED V1.** Completed: header mapping · shipment-line collection mapping · tax/HS-code lookup path · AMOUNT formula · `AGL_INVOICE_LINES` controller · `worksheet_name` · immutable-template rule (via §O) · reserved-row behavior · dynamic row expansion · footer-formula preservation · footer range-update rule · fixed-USD v1 decision.

**Not implemented (deferred):** document-generation runtime · Drive copy · row-insertion runtime · formula-rewrite runtime · `generated_documents` writes · Export Center UI · email delivery · PDF export · readiness validation.

---

## 3. SINOTRANS (next — reserved)

**Next mapping target.** Not started in this task. To be defined: template registry (`TPL-BOOKING-SINOTRANS-V1` / `BOOKING_SINOTRANS`), worksheet(s), controller, header + line mapping, constants, currency decision, footer behavior — following the same shared runtime rules (DOC GEN §O) + Tax Master v2 lookup.

---

**Carrier Booking per-carrier mapping — SPEC ONLY. No runtime, no live-template edits, no DB migration. AGL FINALIZED V1; SINOTRANS is the next mapping target.**

**End of Document**
