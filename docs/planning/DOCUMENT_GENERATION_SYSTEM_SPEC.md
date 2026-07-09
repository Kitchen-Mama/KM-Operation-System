# Document Generation System — Template / Mapping Architecture Spec

**Status:** 🟡 SPEC ONLY — architecture for the future **Export Center / Template Center**. **No runtime, no UI, no DB migration** in this task. Includes **Template Registry & Routing v1** (§C / §C.1 / §G / §L / §M / §N).
**Last Updated:** 2026-07-09
**Maintained By:** Development Team
**Related:** [`PURCHASE_ORDER_SPEC.md`](./PURCHASE_ORDER_SPEC.md) · [`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`](./REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md) (§8A PO Snapshot, §14/§14.1 Snapshot Completeness) · [`SHIPMENT_CENTER_SPEC.md`](./SHIPMENT_CENTER_SPEC.md) (§16 / §20 Shipment Document Dataset) · [`DATABASE_RELATIONSHIP_MAP.md`](./DATABASE_RELATIONSHIP_MAP.md) (§10 Document / Export Layer) · [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) (customs/declared-value reference) · [`TEMPLATE_UI_STANDARD_SPEC.md`](./TEMPLATE_UI_STANDARD_SPEC.md) (import/export XLSX styling — different concern)

> **Documentation First.** This spec defines the shared document-generation architecture (registry → mapping → output log) so template mapping is stable **before** any runtime is written. It introduces **no** code / Apps Script / API / UI / DB migration.

---

## A. Positioning

The **Document Generation System** is a **future shared platform** under the **Export Center / Template Center**. It renders business documents from existing system data.

**Supported documents (initial + future):**
- Purchase Order
- Packing List
- Commercial Invoice
- Carrier Booking Form / 托單
- Shipment Detail Sheet
- Commercial Invoice + Packing Combined (e.g. Amazon AGL)
- Customs / Declaration documents
- Certificate of Origin · MSDS · other future documents

**Core rule — documents are DERIVED OUTPUTS, not source of truth:**
- Generated documents are **derived outputs**; they are **not** source-of-truth records.
- **Generating or regenerating a document must NEVER mutate** Purchase Order / Shipment / Inventory / Master data.
- This aligns with the **Global Snapshot Architecture** + **Snapshot Completeness Principle** (RO&PO §14 / §14.1): documents read committed snapshots; they never write back upstream and never recalculate allocation.

---

## B. Core Architecture

The system is three tables:

1. **`document_templates`** — template registry / template master (which templates exist, their scope and file).
2. **`document_template_fields`** — placeholder mapping layer (how each template token maps to data).
3. **`generated_documents`** — generated-file history / output log (append-only record of every generation).

**Flow:**

```
Select related entity            (a purchase_order / shipment / carrier / …)
        ↓
Select active template           (document_templates, scoped + is_active)
        ↓
Resolve scalar placeholders      (one value per document — §F)
        ↓
Resolve collection placeholders  (repeating tables, e.g. LINE_ITEMS — §F)
        ↓
Generate Google Doc / Sheet / XLSX / PDF
        ↓
Save file to output folder       (output_folder_id)
        ↓
Write generated_documents record (append-only history)
        ↓
Future: email / export package / automation
```

**Layer roles:**
- `document_templates` = **registry** (the template exists and where its file lives).
- `document_template_fields` = **mapping layer** (token → data source; changeable without touching runtime where possible).
- `generated_documents` = **output log** (append/history; never source data).

---

## C. `document_templates` — FINAL schema (Registry & Routing v1)

**Final columns (canonical, in order):**

| # | Column | Note |
|---|---|---|
| 1 | `template_id` | **system PK** — `TPL-{DOC}-{SCOPE}-V{VERSION}` (§C.1) |
| 2 | `template_key` | human/business **unique key** — `{DOC}_{SCOPE}` (§C.1), e.g. `PO_CO1100_YOUXIN` |
| 3 | `template_name` | display name |
| 4 | `document_type` | **enum** (§G) — `purchase_order` / `shipment_detail` / `commercial_invoice` / `packing_list` / `carrier_booking_form` |
| 5 | `related_entity_type` | generation source root: `purchase_order` / `shipment` (§G rule) |
| 6 | `document_category` | **enum** (§G): `factory` / `shipment` / `customs` / `carrier` — what family the doc belongs to |
| 7 | `document_usage` | **enum** (§G): `factory` / `internal` / `export` / `import` / `carrier` — who/what the doc is used for |
| 8 | `series` | optional — important for PO templates where each series may use a different template |
| 9 | `sku` | optional — only when the template is SKU-specific |
| 10 | `supplier_id` | scope: supplier applicability |
| 11 | `factory_id` | scope: factory applicability |
| 12 | `carrier_id` | scope: carrier applicability |
| 13 | `country` | scope: region |
| 14 | `marketplace` | scope: channel |
| 15 | `language` | scope: language |
| 16 | `template_file_type` | enum: `google_doc` / `google_sheet` / `xlsx` / `html` / `pdf` |
| 17 | `template_file_id` | Google file id or storage id |
| 18 | `template_drive_url` | link to the template file |
| 19 | `output_folder_id` | default output folder for generated files (shipment routing → §L) |
| 20 | `file_name_rule` | file-name pattern, **supports placeholders** (§H example) |
| 21 | `template_version` | versioned integer (mirrors the `V{VERSION}` in `template_id`) |
| 22 | `status` | enum: `draft` / `active` / `retired` |
| 23 | `is_active` | boolean convenience flag |
| 24 | `effective_from` · `effective_to` | version window (cols 24–25) |
| 26 | `remark` | free text |
| 27 | `created_by` · `created_at` · `updated_by` · `updated_at` | audit (cols 27–30) |

**Rules:**
- `template_id` = system PK (`TPL-…-V{n}`); `template_key` = business unique key (`{DOC}_{SCOPE}`). Naming rules in **§C.1**.
- `related_entity_type` defines the generation source object — **`purchase_order` docs → `purchase_order`; shipment docs → `shipment`** (§G rule).
- **`document_category`** (`factory` / `shipment` / `customs` / `carrier`) classifies the doc **family**; **`document_usage`** (`factory` / `internal` / `export` / `import` / `carrier`) classifies **how it is used** (drives routing / filtering, e.g. export vs import customs docs).
- `series` optional but important for PO templates (per-series layout); `sku` optional (SKU-specific templates only).
- `supplier_id` / `factory_id` / `carrier_id` / `country` / `marketplace` / `language` **scope** template applicability (blank = not scoped on that dimension).
- **Carrier templates:** one row per carrier when layout differs; service variations are **placeholders, not separate templates** (§M).
- `status` (`draft` / `active` / `retired`) + `is_active` + `effective_from` / `effective_to` control which template resolves at generation time.
- **Product Name and Unit are NOT stored here** — they come from source data at generation.

---

## C.1 Naming Rules (template_id / template_key)

- **`template_id` = `TPL-{DOC}-{SCOPE}-V{VERSION}`**
- **`template_key` = `{DOC}_{SCOPE}`**
- **UPPERCASE snake case; NO spaces** in either `template_id` or `template_key`. `{SCOPE}` may contain multiple `-` (id) / `_` (key) segments (e.g. series + factory, or region).
- `{DOC}` = short doc code in `template_id` (`PO`, `SHIPDETAIL`, `CI`, `PL`, `BOOKING`), and the fuller canonical token in `template_key` (`PO`, `SHIPDETAIL`, `COMMERCIAL_INVOICE`, `PACKING_LIST`, `BOOKING`). `{VERSION}` mirrors `template_version`.

**Examples:**

| `template_id` | `template_key` |
|---|---|
| `TPL-PO-CO1100-YOUXIN-V1` | `PO_CO1100_YOUXIN` |
| `TPL-SHIPDETAIL-STANDARD-V1` | `SHIPDETAIL_STANDARD` |
| `TPL-CI-EXPORT-V1` | `COMMERCIAL_INVOICE_EXPORT` |
| `TPL-PL-EXPORT-V1` | `PACKING_LIST_EXPORT` |
| `TPL-CI-IMPORT-US-V1` | `COMMERCIAL_INVOICE_IMPORT_US` |
| `TPL-PL-IMPORT-US-V1` | `PACKING_LIST_IMPORT_US` |
| `TPL-BOOKING-TOP-SEALAND-V1` | `BOOKING_TOP_SEALAND` |

---

## D. `generated_documents` — final planned schema

| Column | Note |
|---|---|
| `document_id` | **system PK** |
| `template_id` | template used (copied at generation) |
| `template_key` | copied for lineage |
| `template_version` | copied at generation time |
| `related_entity_type` | source object type (`purchase_order` / `shipment` / …) |
| `related_entity_id` | source object id |
| `document_type` | enum (§G) |
| `series` · `sku` | copied scope (nullable) |
| `supplier_id` · `factory_id` · `carrier_id` | copied scope |
| `country` · `marketplace` · `language` | copied scope |
| `file_name` | generated file name (from `file_name_rule`) |
| `file_id` · `file_url` | **generated editable source file** (Doc/Sheet/XLSX) |
| `pdf_file_id` · `pdf_file_url` | **exported PDF** if created |
| `output_folder_id` | folder the file was saved to |
| `generated_by` · `generated_at` | actor + timestamp |
| `status` | enum: `generated` / `regenerated` / `emailed` / `archived` / `cancelled` / `failed` |
| `email_status` | enum: `not_sent` / `queued` / `sent` / `failed` |
| `email_sent_at` | timestamp when emailed |
| `regenerated_from_document_id` | links a regenerated version to its predecessor |
| `note` | free text |
| `created_at` · `updated_at` | audit |

**Rules:**
- `template_id` / `template_version` are **copied at generation time** (the output records which template version produced it — reproducible even if the template later changes).
- `related_entity_type` + `related_entity_id` point to the **source object**.
- `file_id` / `file_url` = generated **editable** source file; `pdf_file_id` / `pdf_file_url` = exported PDF if created.
- `regenerated_from_document_id` links regenerated versions (history chain).
- **`generated_documents` are append / history records — not source data.** A row never edits the PO/Shipment it was generated from.

---

## E. `document_template_fields` — final planned schema (placeholder mapping layer)

| Column | Note |
|---|---|
| `field_id` | **system PK** |
| `template_id` | FK → `document_templates` |
| `template_key` | denormalized for lookup |
| `document_type` | enum (§G) |
| `placeholder` | token in the template, e.g. `{{PO_NO}}` |
| `field_label` | human label (for the template builder UI) |
| `field_type` | enum: `text` / `number` / `date` / `currency` / `image` / `table` / `collection` / `boolean` |
| `data_scope` | enum: `header` / `line` / `total` / `system` / `static` |
| `data_source_table` | simple direct mapping — source table |
| `data_source_field` | simple direct mapping — source field |
| `data_source_path` | nested / derived path (dotted path or expression) |
| `collection_key` | links a field **inside** a repeating collection, e.g. `LINE_ITEMS` (§F) |
| `sort_order` | ordering (collection line order + field order) |
| `required` | validation flag |
| `default_value` | value when source is present-but-empty |
| `format_rule` | date / number / currency formatting |
| `transform_rule` | simple business transform (e.g. uppercase, month name, unit convert) |
| `fallback_rule` | value/behavior when data is missing |
| `example_value` | helps template builders preview |
| `is_active` | enable/disable a mapping |
| `note` | free text |
| `created_at` · `updated_at` | audit |

**Rules:**
- This is the **placeholder mapping layer** — token → data. **Mapping can be changed without changing runtime** where possible (data-driven).
- `field_type` ∈ {`text`, `number`, `date`, `currency`, `image`, `table`, `collection`, `boolean`}.
- `data_scope` ∈ {`header`, `line`, `total`, `system`, `static`}.
- `data_source_table` / `data_source_field` = simple direct mapping; `data_source_path` = nested/derived path.
- `collection_key` links child fields inside a repeating collection (e.g. all `LINE_ITEMS` columns share `collection_key = LINE_ITEMS`).
- `required` drives validation; `default_value` / `fallback_rule` handle missing data; `format_rule` / `transform_rule` handle formatting/transforms; `example_value` aids builders.

---

## F. Scalar vs Collection Placeholders

Two placeholder types.

**Scalar placeholders** — **one value per document**:
`{{PO_NO}}` · `{{KM_NO}}` · `{{DOC_DATE}}` · `{{SHIP_MONTH}}` · `{{TOTAL_QTY}}`

**Collection placeholders** — a **repeating section / table**:
`{{LINE_ITEMS}}` · `{{CARTON_ITEMS}}` · `{{PALLET_ITEMS}}`

**Collection rule — each collection must define:**
- `collection_key` (identifies the repeating group)
- source table (which rows repeat)
- line **sort order**
- **child placeholders** (the columns rendered per row, each mapped via `document_template_fields` with the same `collection_key`)

**Example:** `{{LINE_ITEMS}}` maps to **`purchase_order_lines`** for Purchase Order documents (child placeholders = SKU / qty / carton / unit cost / amount …), sorted by `sort_order`.

### F.1 One mapping row per placeholder — replace ALL occurrences (official)

A placeholder may appear **multiple times in the same Google Doc / template**. **`document_template_fields` stores exactly ONE row per placeholder per template** — never one row per occurrence. At generation, the runtime **replaces every occurrence** of that token with the resolved value.

- `{{DOC_DATE}}` appearing twice → **one** mapping row; both occurrences filled.
- `{{SHIP_MONTH}}` appearing twice → **one** mapping row.
- `{{SUPPLIER_DATE_FULL}}` appearing twice → **one** mapping row.
- Uniqueness key = (`template_id`, `placeholder`). A duplicate mapping row for the same placeholder is a data error, not two independent mappings.

---

## G. Enums (Registry & Routing v1)

### G.1 `document_type` enum (v1 canonical)

```
purchase_order
shipment_detail
commercial_invoice
packing_list
carrier_booking_form
```

> **v1 canonical set** (lowercase snake). Additional future types (combined invoice+packing, customs declaration, certificate of origin, MSDS, other) are **reserved / deferred** and not part of v1 routing.

### G.2 `related_entity_type` rule

- **`purchase_order` documents → `related_entity_type = purchase_order`** (root data = `purchase_orders` + `purchase_order_lines`, §H).
- **shipment documents → `related_entity_type = shipment`** (root data = `shipments` + `shipment_lines`, §I). Applies to `shipment_detail`, `commercial_invoice`, `packing_list`, `carrier_booking_form`.

### G.3 `document_category` enum

```
factory
shipment
customs
carrier
```

- `purchase_order` → `factory`; `shipment_detail` → `shipment`; `commercial_invoice` / `packing_list` → `customs`; `carrier_booking_form` → `carrier`.

### G.4 `document_usage` enum

```
factory
internal
export
import
carrier
```

- Classifies **how** the doc is used: e.g. PO = `factory`; Shipment Detail = `internal`; export Commercial Invoice / Packing List = `export`; import (destination) Commercial Invoice / Packing List = `import`; Carrier Booking = `carrier`. `document_usage` distinguishes export vs import variants of the same `document_type` (e.g. `COMMERCIAL_INVOICE_EXPORT` vs `COMMERCIAL_INVOICE_IMPORT_US`).

---

## H. Purchase Order document generation rules

- `related_entity_type = purchase_order`.
- **Main source = `purchase_orders` + `purchase_order_lines`.**
- **PO documents MUST use the PO Snapshot only** (RO&PO §8A / §14.1). **Do NOT live-read the Request Order** for execution values.
- Product display **may join `sku_details` for labels only** (display-label, never a value replacement).
- **Line-items collection = `purchase_order_lines`** (`collection_key = LINE_ITEMS`).
- **`file_name_rule` example:**
  `KitchenMama_{{PO_NO}}_{{KM_NO}}_{{SERIES}}_{{TOTAL_QTY}}_{{SHIP_MONTH}}`

**Initial PO placeholders:**

| Placeholder | Type | Scope | Source (mapping intent) |
|---|---|---|---|
| `{{PO_NO}}` | text | header | `purchase_orders.po_no` |
| `{{KM_NO}}` | text | header | `purchase_orders.km_po_no` |
| `{{DOC_DATE}}` | date | header | `purchase_orders.order_date` (Send PO date) |
| `{{DOC_DATE_PLUS_5}}` | date | header | `purchase_orders.deposit_due_date` (= `order_date` + 5 business days); **format `yyyy-MM-dd`, transform `date_only`** |
| `{{SUPPLIER_DATE_FULL}}` | date | header | `purchase_orders.supplier_expected_ready_date` (blank when the supplier has not provided it) |
| `{{SHIP_MONTH}}` | text | header | derived from `purchase_orders.expected_ship_date` / line ship date |
| `{{SERIES}}` | text | header | `purchase_orders` / lines `series` |
| `{{SUPPLIER_NAME}}` | text | header | `purchase_orders.supplier_name` |
| `{{FACTORY_NAME}}` | text | header | `warehouses.warehouse_name` (via `factory_id` / `warehouse_id`) |
| `{{TOTAL_QTY}}` | number | total | `purchase_orders.total_qty` (Σ ordered_qty) |
| `{{TOTAL_CARTONS}}` | number | total | Σ `purchase_order_lines.carton_qty` |
| `{{LINE_ITEMS}}` | collection | line | `purchase_order_lines` (`collection_key = LINE_ITEMS`) |

> `total_sku` figures follow **`COUNT(DISTINCT sku)`** (RO&PO §7.4). `product_name` is not stored on `purchase_order_lines` — join `sku_details` for label only.

---

## I. Shipment document generation rules

- `related_entity_type = shipment`.
- **Main source = `shipments` + `shipment_lines`.**
- **Shipment documents MUST use the Shipment Snapshot only.** **Do NOT live-read the Request Order.** **Do NOT recalculate allocation.**
- PO No display **may join the PO snapshot** through `purchase_order_lines` / `shipment_line_allocations` **for label only**.
- **One shipment may generate multiple documents** (e.g. TW Invoice + TW Packing List + US Invoice + US Packing List; Amazon AGL → `COMMERCIAL_INVOICE_PACKING_COMBINED`).

**Initial shipment document dataset (per `SHIPMENT_CENTER_SPEC.md` §16 / §20 — one shared dataset → many templates):**
- shipment header
- shipment lines
- PO reference (label)
- warehouse / destination labels
- SKU logistics labels
- carton / weight / CBM
- carrier / method
- customs values (from future tax / reference data — `TAX_AND_REFERRAL_RATES_SPEC.md`)

> **Shipment-focused document types (v1 canonical — §G.1):** `shipment_detail`, `carrier_booking_form`, `commercial_invoice`, `packing_list` (combined invoice+packing is a reserved future type). Token-to-field mapping lives in **`document_template_fields`** (deferred). Output routing → **§L**.

---

## J. Relationships (see `DATABASE_RELATIONSHIP_MAP.md` §10)

```
document_templates 1 ── many document_template_fields   (template_id)
document_templates 1 ── many generated_documents        (template_id)
purchase_orders    1 ── many generated_documents        (related_entity_type=purchase_order, related_entity_id=purchase_order_id)
shipments          1 ── many generated_documents        (related_entity_type=shipment, related_entity_id=shipment_id)
```

- `generated_documents` **does not mutate** source records (derived output).
- `document_template_fields` is the **mapping layer**.
- `document_templates` is the **template registry**.

---

## L. Shipment Output Routing v1

**v1 storage:** every shipment-generated document sets **`output_folder_id` = the root Shipment folder**. Sub-folder placement is **resolved by runtime logic** (not stored per template in v1).

**Runtime routing logic (folder nesting):**

```
Shipment root  (output_folder_id)
   → {COUNTRY} folder
       → {SHIP_DATE} folder
           → {SHIPMENT_NO}_{COUNTRY} folder   ← all files for the shipment land here
```

**Resolved path:**

```
Shipment/{COUNTRY}/{SHIP_DATE}/{SHIPMENT_NO}_{COUNTRY}/
```

**Rules:**
- **All documents for the SAME shipment go into the SAME shipment folder** — Shipment Detail · Packing List · Commercial Invoice · Carrier Booking · any other shipment docs.
- Runtime creates missing folders on the path (idempotent); the template only needs the root `output_folder_id`.
- **`document_output_folders` (a per-scope folder registry table) is DEFERRED** — not created in v1. v1 keeps root folder on the template + runtime path logic.
- PO documents (§H) keep their own `output_folder_id`; this routing applies to `related_entity_type = shipment` only.

---

## M. Carrier Template Rule

- **One carrier template per carrier WHEN the layout differs.** Distinct booking-form layouts → distinct `document_templates` rows (scoped by `carrier_id`).
- **If the same carrier has multiple services but the same template layout → use ONE template row.** Do **not** create a template per service.
- **Service variations are DATA placeholders, not separate templates** — e.g. `{{SHIPPING_METHOD}}` / `{{SERVICE_TYPE}}` / `{{LAST_MILE_DELIVERY}}` are filled at generation from shipment/carrier data.

**Example:** carrier `TOP_SEALAND` uses a single booking template `BOOKING_TOP_SEALAND` (`template_id = TPL-BOOKING-TOP-SEALAND-V1`); its sea/land/last-mile service differences are rendered through placeholders, not additional template rows.

---

## N. Placeholder Rule (naming)

- **Placeholders use UPPERCASE snake case inside `{{ }}`.**
- Common tokens:

```
{{SHIPMENT_NO}}
{{COUNTRY}}
{{MARKETPLACE}}
{{TOTAL_QTY}}
{{TOTAL_CARTONS}}
{{SHIPPING_METHOD}}
```

- Scalar vs collection placeholder semantics are defined in **§F**.
- **Actual token → data mapping is defined later in `document_template_fields`** (§E) — **NOT implemented in this task.**

---

## K. Non-Goals (this task)

Runtime / UI implementation · Apps Script handlers · Google Drive/Docs/Sheets API · PDF export · email / automation · Export Center / Template Center UI · DB migration · token-resolution engine · **`document_template_fields` population (token→field mapping)** · **`document_output_folders` table (per-scope folder registry — §L)** · shipment folder-path runtime creation. **Documentation / architecture only.** Runtime is **deferred** until confirmed.

---

**Document Generation System — architecture spec. SPEC ONLY. No runtime, no DB migration.**

**End of Document**
