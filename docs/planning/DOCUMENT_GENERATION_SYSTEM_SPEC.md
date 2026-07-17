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
| `placeholder` | token name **stored WITHOUT braces** (DB value `PO_NO`); the template file uses `{{PO_NO}}` and the runtime wraps the stored token with `{{ }}` (§F.1). |
| `field_label` | human label (for the template builder UI) |
| `field_type` | **enum (v1 canonical):** `scalar` / `collection` / `collection_item` / `formula` / `constant` / `system` (structural role — the display type text/number/date/currency is set by `format_rule`, not here). |
| `data_scope` | **enum (v1 canonical):** `header` / `line` / `allocation` / `total` / `system` / `static` |
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
- **`field_type` ∈ {`scalar`, `collection`, `collection_item`, `formula`, `constant`, `system`}** (v1 canonical — structural role):
  - `scalar` = one value per document (header/total single value); `collection` = the repeating-group **controller** token (e.g. `SHIPMENT_LINES`, `LINE_ITEMS`); `collection_item` = a child field rendered **once per collection row** (shares the collection's `collection_key`); `formula` = computed/derived (e.g. `carton_range`, `concat`); `constant` = static literal; `system` = system-provided (e.g. generated timestamp / page).
  - **Display type (text / number / date / currency) is expressed by `format_rule`, NOT by `field_type`.**
- **`data_scope` ∈ {`header`, `line`, `allocation`, `total`, `system`, `static`}** (v1 canonical). `allocation` = a value at the shipment-line-PO-allocation grain (Shipment Detail — §I.1).
- `data_source_table` / `data_source_field` = simple direct mapping; `data_source_path` = nested/derived path.
- `collection_key` links child fields inside a repeating collection (e.g. all `LINE_ITEMS` columns share `collection_key = LINE_ITEMS`).
- `required` drives validation; `default_value` / `fallback_rule` handle missing data; `format_rule` (text/number/date/currency) / `transform_rule` handle formatting/transforms; `example_value` aids builders.

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

**Placeholder storage (canonical — braces are NOT stored):**
- **`document_template_fields.placeholder` stores the token WITHOUT braces** — DB value is `PO_NO`, not `{{PO_NO}}`.
- The **template file** contains `{{PO_NO}}`; the **runtime wraps** the stored token with `{{ }}` when it scans/replaces.
- Uniqueness is still (`template_id`, `placeholder`) on the brace-less token.
- *(In this spec, `{{TOKEN}}` in prose/examples denotes the template-file form; the stored value is always the brace-less `TOKEN`.)*

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

> **Enum reconciliation (§E):** the **Type** column above is the **display type** = `format_rule` (text/date/number). The canonical **`field_type`** is `scalar` for every row **except** `LINE_ITEMS` = `collection` (and its per-row child columns = `collection_item`). **Scope** maps to `data_scope` (`header` / `total` / `line`). Placeholders are stored **without braces** (§F.1) — DB value `PO_NO`, template `{{PO_NO}}`.
> `total_sku` figures follow **`COUNT(DISTINCT sku)`** (RO&PO §7.4). `product_name` is not stored on `purchase_order_lines` — join `sku_details` for label only.

---

## I. Shipment document generation rules

- `related_entity_type = shipment`.
- **Main source = `shipments` + `shipment_lines`.**
- **Shipment documents MUST use the Shipment Snapshot only.** **Do NOT live-read the Request Order.** **Do NOT recalculate allocation.**
- PO No display **may join the PO snapshot** through `purchase_order_lines` / `shipment_line_allocations` **for label only**.
- **Shipping service display name = `shipments.shipping_method_label` (snapshot).** Shipment Detail (and every shipment document) reads the localized service name **from `shipments.shipping_method_label`** — it does **NOT** reconstruct it from `shipping_method` / `last_mile_delivery` at generation (`SHIPMENT_CENTER_SPEC.md` §15A / §20). **`document_template_fields` mapping row (one per placeholder — §F.1):**

| attribute | value |
|---|---|
| `placeholder` | **`SHIPPING_METHOD`** (canonical, Shipment Detail). **`SHIPPING_METHOD_LABEL` is NON-CANONICAL — do not create it** (the DB field name need not equal the placeholder name). |
| `field_type` | `scalar` |
| `format_rule` | `text` |
| `data_scope` | `header` |
| `data_source_table` | `shipments` |
| `data_source_field` | `shipping_method_label` |
| `data_source_path` | `shipments.shipping_method_label` |
| `fallback_rule` | `concat(shipments.shipping_method, "_", shipments.last_mile_delivery)` (e.g. `Sea_Parcel`) — legacy rows only |
| `example_value` | `美森海派` |
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

> **Shipment-focused document types (v1 canonical — §G.1):** `shipment_detail`, `carrier_booking_form`, `commercial_invoice`, `packing_list` (combined invoice+packing is a reserved future type). Token-to-field mapping lives in **`document_template_fields`** — **`shipment_detail` mapping is FINALIZED (§I.1)**; **`carrier_booking_form` per-carrier mappings are FINALIZED for TOP SEALAND + AGL in [`CARRIER_BOOKING_MAPPING_SPEC.md`](./CARRIER_BOOKING_MAPPING_SPEC.md)** (SINOTRANS next); `commercial_invoice` / `packing_list` general mappings still to be defined. Output routing → **§L**; shared Sheet runtime rules → **§O**.

---

## I.0 Document Mapping Priority

**Purpose:** document the official implementation order of document placeholder mappings so future development follows a consistent roadmap.

**Document Mapping Priority (v1)**

1. ✅ **Shipment Detail — COMPLETED**
   - Placeholder mapping finalized
   - Collection grain finalized
   - Merge rules finalized
2. 🟢 **Carrier Booking Form** *(carrier-specific workbook mappings live in [`CARRIER_BOOKING_MAPPING_SPEC.md`](./CARRIER_BOOKING_MAPPING_SPEC.md))*
   - **TOP SEALAND — Invoice + Packing List templates COMPLETED** (Invoice-tab shared draft recorded here in §I.2)
   - **AGL — Carrier Invoice / Customs workbook mapping COMPLETED / FINALIZED V1** (single `Template` worksheet, `AGL_INVOICE_LINES` controller — `CARRIER_BOOKING_MAPPING_SPEC.md` §AGL)
   - **SINOTRANS — NEXT mapping target** (not started)
   - Shared Google-Sheet runtime behavior (immutable template, copy-before-render, reserved rows, dynamic expansion, footer formulas) = **§O** (this spec)
3. 🟡 **Packing List**
4. 🟡 **Commercial Invoice**
5. 🔵 **Future Documents**
   - Combined Commercial Invoice + Packing List
   - Customs Declaration
   - Certificate of Origin
   - MSDS
   - Other future document types

**Rules:**
- This section is **documentation only**.
- No runtime changes.
- No DB changes.
- No enum changes.
- No mapping changes.
- No architecture changes.
- This section only documents the official document implementation sequence.

---

## I.1 Shipment Detail — finalized mapping & grouped-output rules (SPEC ONLY)

Authoritative layout + expansion + merge + join rules for the **Shipment Detail** document (`document_type = shipment_detail`, `related_entity_type = shipment`). **Runtime is NOT implemented** (§J deferred list); this section defines the mapping the future engine must follow.

### I.1.1 Template row / collection controller (A)

The Shipment Detail template is a **Google Sheet**; **row 2 is the collection template row**. Recommended cells:

```
A2 = {{SHIPMENT_LINES}}      ← hidden collection-controller column
B2 = {{SHIPMENT_NO}}
C2 = {{SKU}}
D2 = {{QTY}}
…                            (remaining placeholders per §I.1.3)
```

- **`{{SHIPMENT_LINES}}` is the collection controller** — it identifies the row to duplicate. It is a **scalar-looking token used as a grouping marker**, not a rendered value.
- **Column A is a hidden control column** and stays hidden in the generated file. *(This is the Shipment Detail template's specific layout; the general, non-hardcoded hidden-control-column rule is §O.2 — other templates declare their own control column.)*
- Runtime **duplicates row 2 once per expanded output row** (§I.1.2 grain), then **clears/removes the `{{SHIPMENT_LINES}}` controller token** from generated output.
- **No `LINE_NO` field** is required or added.
- `document_template_fields`: `{{SHIPMENT_LINES}}` is stored as the **collection** field (`field_type = collection`, `collection_key = SHIPMENT_LINES`); every per-row placeholder (SKU/QTY/…) shares `collection_key = SHIPMENT_LINES` (one row per placeholder — §F.1).

### I.1.2 Output grain + join path (B, H, I)

- **Primary collection = `SHIPMENT_LINES`; output grain = ONE output row per shipment-line PO allocation.**
- **Join path:** `shipments → shipment_lines → shipment_line_allocations → purchase_order_lines → purchase_orders` (+ `carriers` for carrier name).
- **Every formal Shipment MUST have ≥ 1 valid PO allocation. A no-allocation Shipment produces NO Shipment Detail output (generation blocked) — `PO_NO` is required.**
- **PO_NO resolution (H):** `shipment_line_allocations.purchase_order_line_id → purchase_order_lines.purchase_order_line_id → purchase_order_lines.purchase_order_id → purchase_orders.purchase_order_id → purchase_orders.po_no`.
- **CARRIER_NAME resolution (H):** `shipments.carrier_id → carriers.carrier_id → carriers.carrier_name`.
- **Performance (I):** the engine **preloads and joins in memory — NO N+1** (`shipments`, `shipment_lines`, `shipment_line_allocations`, `purchase_order_lines`, `purchase_orders`, `carriers` all preloaded once, resolved by in-memory maps).

> **⚠ `shipment_line_allocations` implementation status — ENTIRELY PLANNED (option c).** Audited `12_shipment_handlers.gs` + `operation-system-db-api.js` + tab registration: **no table headers, no getter, no writer, no `validTabs` entry exist.** The **current** data model links a shipment line to **one** PO via **`shipment_lines.purchase_order_line_id`** (single link, already a column). The multi-PO **`shipment_line_allocations`** table (`shipment_line_id` + `purchase_order_line_id` + `allocated_qty`) is the **planned** model that enables the per-allocation grain + `QTY = allocated_qty`. **Until it is built,** the `allocation` grain collapses to one row per shipment line and `PO_NO` resolves via `shipment_lines.purchase_order_line_id`; `QTY` would use `shipment_lines.shipment_qty` (legacy `qty` read-fallback) **only in that pre-allocation interim** (the no-fallback rule applies once allocations exist). This §I.1 mapping is the **target**; it is not runnable until the table + writer land.

### I.1.3 Required fields (C) — formal Shipment Detail

Required (generation blocked if missing): **`SHIPMENT_NO`, `SKU`, `QTY`, `CARTON_QTY`, `GROSS_WEIGHT`, `CARTON_CBM`, `CARTON_NO_RANGE`, `PO_NO`, `WAREHOUSE_CODE`, `DESTINATION`, `ETD`, `ETA`, `CARRIER_NAME`, `SHIPPING_METHOD`.**

- **A Shipment cannot be finalized / exported without PO allocation.**
- **`QTY` source = `shipment_line_allocations.allocated_qty`** — **do NOT fall back to `shipment_lines.shipment_qty`** (allocation is required for formal generation). *(Shipment-line-grain documents that are NOT allocation-based — e.g. the carrier packing-list tab — use `shipment_lines.shipment_qty` directly; see §I.2.10.)*

**(Stored `placeholder` = brace-less token — §F.1. `field_type` / `data_scope` per §E canonical enums; display type = `format_rule`.)**

| placeholder (stored) | field_type | data_scope | format_rule | source (path) |
|---|---|---|---|---|
| `SHIPMENT_LINES` | collection | line | — | controller — `shipment_lines` ⋈ `shipment_line_allocations` (grain = allocation row) |
| `SHIPMENT_NO` | scalar | header | text | `shipments.external_shipment_id` → fallback `shipments.shipment_no` → fallback `shipments.shipment_id` (2026-07: canonical SHIPMENT_NO = the **external/carrier-facing** ID; internal `shipment_no` reserved for `INTERNAL_SHIPMENT_NO`) |
| `REFERENCE_ID` | scalar | header | text | `shipments.reference_id` |
| `WAREHOUSE_CODE` | scalar | header | text | `shipments.warehouse_code` |
| `DESTINATION` | scalar | header | text | `shipments.destination` |
| `ETD` | scalar | header | date | `shipments.etd` |
| `ETA` | scalar | header | date | `shipments.eta` |
| `CARRIER_NAME` | scalar | header | text | `carriers.carrier_name` (via `shipments.carrier_id`) |
| `SHIPPING_METHOD` | scalar | header | text | `shipments.shipping_method_label` (snapshot; fallback `concat(shipping_method,"_",last_mile_delivery)`) — §G |
| `NOTE` | scalar | header | text | `shipments.note` |
| `SKU` | collection_item | line | text | `shipment_lines.sku` |
| `QTY` | collection_item | allocation | number | **`shipment_line_allocations.allocated_qty`** (no `shipment_lines.shipment_qty` fallback — allocation grain) |
| `CARTON_QTY` | collection_item | line | number | `shipment_lines.shipment_carton_qty` *(canonical 2026-07 rename of `carton_qty`; legacy read-fallback only)* |
| `GROSS_WEIGHT` | collection_item | line | number | `shipment_lines.gross_weight` |
| `CARTON_CBM` | collection_item | line | number | `shipment_lines.shipment_carton_cbm` — **LINE-TOTAL CBM** (canonical rename of `carton_cbm`; legacy read-fallback only). **NOT per-carton; do NOT multiply by `shipment_carton_qty` at generation.** Placeholder name kept for template compatibility; a future per-carton value would be a separate derived placeholder. |
| `CARTON_NO_RANGE` | formula | line | text | derived from `shipment_lines.carton_no_start` / `carton_no_end` (§I.1.5) |
| `PO_NO` | collection_item | allocation | text | `purchase_orders.po_no` (via allocation → PO line → PO — §I.1.2) |

> **Canonical shipment field names (2026-07 DB rename).** Shipment quantity columns are canonically `shipments.shipment_total_qty` / `shipment_total_cartons` / `shipment_total_cbm` and `shipment_lines.shipment_carton_qty`; the legacy `total_qty` / `total_cartons` / `total_cbm` / `carton_qty` are retired (read-fallback only). Any shipment total placeholder added later MUST read the canonical column. **`shipments.shipments_customs_type`** (canonical 2026-07 rename of `customs_type`; legacy read-fallback only — customs-method enum snapshot) plus its localized Label snapshot **`shipments.shipments_customs_type_label`** (中文; copied at Execution Commit from `carrier_rate_cards.customs_type_label`, exactly like `shipping_method_label`) are both header-scope sources for customs/carrier documents (read the stored snapshot, never the live rate card). **`{{CUSTOMS_TYPE}}` maps to the Label snapshot, not the enum** — the runtime never translates the enum to 中文. Customs-facing product text sources: `sku_details.product_name_cn`, `sku_details.product_use`, and `sku_regional_details.product_url`. **Canonical `SHIPMENT_NO` (2026-07) = `shipments.external_shipment_id`** (the external/carrier-facing ID) → fallback `shipment_no` → `shipment_id`; this applies to Shipment Detail, Carrier Invoice/Packing tabs, file-name rules, and any label whose business value is the external Shipment ID (`Customer Order No`, `FBA ID No`, `FBA No`, `Outer Carton Mark`, …). The internal system number `shipments.shipment_no` is **not** exposed as `SHIPMENT_NO`; it is reserved for a distinct **`INTERNAL_SHIPMENT_NO`** placeholder (not added to current templates). New header scalars: **`BOOKING_NO` → `shipments.booking_no`** (carrier/forwarder booking ref; not derived from carrier_id/BL/tracking) and **`NOTE` → `shipments.note`** (shipment remark; Draft "Remark"). `ETD`/`ETA` unchanged (`shipments.etd`/`eta`). This note only redirects field names / placeholder sources — the finalized collection controller / grain / merge architecture (§I.1.1–§I.1.5) is unchanged.

### I.1.4 Merge rules (D, E)

Vertical cell-merge in the generated sheet (display only — never changes values):

- **Header-level merge — merge across ALL rows of the same shipment** (`merge_by = shipment_id` / `shipment_no`): `SHIPMENT_NO`, `REFERENCE_ID`, `WAREHOUSE_CODE`, `DESTINATION`, `ETD`, `ETA`, `CARRIER_NAME`, `SHIPPING_METHOD`, `NOTE`.
- **Shipment-line-level merge — merge across rows of the same `shipment_line_id`** (`merge_by = shipment_line_id`): `SKU`, `CARTON_QTY`, `GROSS_WEIGHT`, `CARTON_CBM`, `CARTON_NO_RANGE`.
- **NEVER merge `QTY` or `PO_NO`** — when one `shipment_line_id` is allocated across multiple POs, keep **one output row per PO allocation**, each with its own `QTY` / `PO_NO`.

**Example** — `CO1150-N` split across two POs (40 to PO-A, 80 to PO-B):

```
SKU        QTY   PO_NO
CO1150-N    40   PO-A     ← SKU / CARTON_QTY / GROSS_WEIGHT / CARTON_CBM / CARTON_NO_RANGE merged
CO1150-N    80   PO-B        (one merged block for the shipment_line); QTY + PO_NO stay per-row
```

### I.1.5 CARTON_NO_RANGE (F)

Derived from `shipment_lines.carton_no_start` / `carton_no_end`:
- both present and different → `"1 - 3"`
- same value → `"1"`
- only start present → start only
- both blank → blank

`transform_rule = carton_range;merge_by_shipment_line` (the merge component ties it to the §I.1.4 shipment-line merge).

### I.1.6 Shipping-method snapshot (G)

Canonical DB values remain `shipments.shipping_method` + `shipments.last_mile_delivery`. When a Shipment **selects/commits a Carrier Rate Card**, its `carrier_rate_cards.shipping_method_label` is **copied into `shipments.shipping_method_label`** (historical snapshot — `SHIPMENT_CENTER_SPEC.md` §15A). **`SHIPPING_METHOD` maps to `shipments.shipping_method_label`.** **Do NOT resolve a historical Shipment's label from the current Carrier Rate Card at generation time** (snapshot only; fallback `concat(shipping_method,"_",last_mile_delivery)` for legacy rows without a label). Example: `Sea + Parcel` → canonical key `Sea_Parcel` → display snapshot `美森海派`.

### I.1.7 Formal-document readiness (rule only — validation runtime deferred)

Tiered requirement on `shipping_method_label` by document audience:

- **Draft Shipment** — MAY use the fallback `shipping_method + "_" + last_mile_delivery` (e.g. `Sea_Parcel`); no committed rate card required.
- **Internal Shipment Detail** — MAY render that fallback for **legacy compatibility** (older shipments without a snapshot label still print).
- **External carrier / customs documents** (Carrier Booking Form, Commercial Invoice, Packing List) — **SHOULD require a committed Carrier Rate Card and a NON-BLANK `shipments.shipping_method_label` before generation** (no raw `Sea_Parcel` on a document leaving the company).
- **This is a documented rule only — the validation runtime is NOT implemented in this task** (§J deferred). The engine will later block external-document generation when `shipping_method_label` is blank / no rate card is committed.

---

## I.2 Carrier Booking Form — Invoice Tab (CONFIRMED MAPPING DRAFT — SPEC ONLY)

> **Status.** The Invoice Import tab is a **confirmed mapping draft** for a two-tab (Invoice + Packing List) workbook shape. No Document Engine runtime is implemented. This section records the shared Invoice-tab draft so the mapping is not lost; anything not listed as "confirmed" stays provisional (§I.2.9).
>
> **Carrier-specific workbook mappings now live in [`CARRIER_BOOKING_MAPPING_SPEC.md`](./CARRIER_BOOKING_MAPPING_SPEC.md)** — the authoritative home for per-carrier Carrier Booking mappings. **AGL** (single `Template` worksheet, `AGL_INVOICE_LINES` controller) is **FINALIZED V1** there; **TOP SEALAND** Invoice + Packing List are completed. Shared Google-Sheet runtime behavior (immutable template, copy-before-render, reserved rows, dynamic row expansion, footer-formula preservation + range validation) = **§O**.

### I.2.1 Workbook architecture (A)

- **ONE `document_templates` row** represents the whole `carrier_booking_form` **workbook** (`document_type = carrier_booking_form`, `document_category = carrier`, `document_usage = carrier`). Do **NOT** create a second `document_templates` row just because the workbook has two tabs — a second row is created **only if the physical template files are actually separate**.
- The workbook contains **two mapped worksheets/tabs**: (1) **Invoice Import Template**, (2) **Packing List Import Template**. Both tabs **may share the same Shipment/Header dataset** (shared scalar placeholders).
- The future Document Engine must support: **one template file → multiple mapped worksheets/tabs → tab-specific collection controllers → shared scalar placeholders**. The exact **multi-tab runtime is DEFERRED** (§I.2.9).
- `document_template_fields` may carry a **tab/worksheet qualifier** (e.g. a `worksheet` or `tab` attribute, or a `collection_key` scoped per tab) so the same workbook row can map multiple tabs — the exact column is deferred until the Packing List tab is defined.

### I.2.2 Invoice Tab — header mapping (B)

Header (scalar) placeholders — one value per shipment. `field_type = scalar`, `data_scope = header` unless noted.

| placeholder (stored) | source (path) | notes |
|---|---|---|
| `CUSTOMER_ORDER_NO` | `shipments.external_shipment_id` → fallback `shipment_no` → `shipment_id` | caption alias of canonical `SHIPMENT_NO` (external Shipment ID) — §D |
| `SERVICE` | `shipments.shipping_method_label` | snapshot (§I.1.6); fallback `concat(shipping_method,"_",last_mile_delivery)` |
| `WAREHOUSE_CODE` | `shipments.warehouse_code` | also the recipient lookup key (§I.2.3) |
| `RECIPIENT_NAME` | `warehouses.warehouse_name` | via `warehouse_code` lookup |
| `RECIPIENT_COMPANY` | `warehouses.warehouse_name` | same source as `RECIPIENT_NAME` (confirmed) |
| `RECIPIENT_ADDRESS_1` | `warehouses.address` | **new DB dependency** (§I.2.7) |
| `RECIPIENT_CITY` | `warehouses.city` | **new DB dependency** |
| `RECIPIENT_STATE` | `warehouses.state` | **new DB dependency** |
| `RECIPIENT_POSTAL_CODE` | `warehouses.postal_code` | **new DB dependency** |
| `RECIPIENT_COUNTRY_CODE` | `warehouses.country` → `country_to_iso2` (fallback `shipments.country`) | ISO alpha-2 output via the `country_to_iso2` transform (§I.2.9); alias of `WAREHOUSE_COUNTRY_CODE` |
| `RECIPIENT_PHONE` | `warehouses.contact_phone` | **new DB dependency** |
| `RECIPIENT_EMAIL` | `warehouses.contact_email` | **new DB dependency** |
| `REFERENCE_ID` | `shipments.reference_id` | |
| `TOTAL_CARTONS` | `shipments.shipment_total_cartons` | **canonical renamed field** (§H) — never `shipments.total_cartons` |
| `HAS_BATTERY` | derived from all shipment SKUs (§I.2.6) | any line `sku_details.battery_type` not blank/false/none → `"是"`, else `"否"` |
| `HAS_MAGNET` | derived from all shipment SKUs (§I.2.6) | any line `sku_details.magnet_type` true/non-false → `"是"`, else `"否"` |
| `CUSTOMS_TYPE` | `shipments.shipments_customs_type_label` *(localized 中文 Label SNAPSHOT)* | shipment snapshot (read the stored **Label**, not the enum, not the live rate card). Documents MUST NOT translate the enum — the Label is frozen at creation and mirrors `SHIPPING_METHOD_LABEL`. Legacy rows with a blank label fall back to the canonical enum→Label map in the API normalizer. |
| `VAT_NO` | `tax_referral_rates.vat_no` | resolved tax row (§I.2.3) |
| `DECLARED_CURRENCY` | `tax_referral_rates.declared_currency` | resolved tax row (§I.2.3) |

### I.2.3 Header lookup rules (C)

- **Warehouse (recipient block):** `shipments.warehouse_code` → `warehouses.warehouse_code` → warehouse contact/address fields. (Recipient name/company/address/city/state/postal/country/phone/email all come from the matched `warehouses` row.) This is a **reference lookup at dataset-build time, NOT a Shipment snapshot** — the Warehouse Master is authoritative shared master data and the Shipment stores only `warehouse_code` (`SHIPMENT_CENTER_SPEC.md` §11 / §22). The **canonical `WAREHOUSE_*` placeholder set** (§I.2.9) resolves through this same lookup; `RECIPIENT_*` are the Carrier-Invoice recipient-block aliases of it. **The template never performs the lookup — the Document Dataset Builder resolves it before rendering.** The Warehouse country code uses the `country_to_iso2` transform with a `shipments.country` fallback (§I.2.9).
- **Tax row lookup (VAT_NO / DECLARED_CURRENCY):** match **`shipments.country` → `tax_referral_rates.duty_country`**, apply **effective-date rules** (blank `effective_to` = open-ended); if **multiple applicable rows** exist, **latest `effective_from` wins**. **Do NOT select tax rows by currency alone.** `VAT_NO` = the resolved row's `vat_no`; `DECLARED_CURRENCY` = the resolved row's `declared_currency`.

### I.2.4 Invoice Tab — line collection (D) — PROVISIONAL

- **Collection placeholder:** `INVOICE_LINES` (`field_type = collection`). **Likely collection source = `shipment_lines`.** **Final grain remains PROVISIONAL** until the Packing List tab + carrier import requirements are reviewed (do not lock grain here).
- Per-line placeholders (`field_type = collection_item`; `collection_key = INVOICE_LINES`):

| placeholder (stored) | source (path) | notes |
|---|---|---|
| `CARTON_REFERENCE` | `shipments.external_shipment_id` (→ fallback `shipment_no` → `shipment_id`) + padded carton range | formula; prefix = the external Shipment ID (canonical `SHIPMENT_NO`); **6-digit zero-padded** sequence, e.g. `SHIPMENT123-000001-000004`, `SHIPMENT123-000009-000015`; **exact delimiter/format PROVISIONAL** — confirm against the carrier import requirement |
| `LINE_REFERENCE_ID` | `shipments.reference_id` | |
| `CARTON_WEIGHT_KG` | `sku_details.carton_weight` | |
| `CARTON_LENGTH_CM` | `sku_details.carton_length` | |
| `CARTON_WIDTH_CM` | `sku_details.carton_width` | |
| `CARTON_HEIGHT_CM` | `sku_details.carton_height` | |
| `PRODUCT_NAME_EN` | `sku_details.product_name` | |
| `PRODUCT_NAME_CN` | `sku_details.product_name_cn` | 2026-07 customs field |
| `DECLARED_UNIT_VALUE` | `tax_referral_rates.declared_value` | resolved tax row (§I.2.5) |
| `UNITS_PER_CARTON` | `sku_details.units_per_carton` | |
| `HS_CODE` | `tax_referral_rates.hscode` | resolved tax row (§I.2.5) |
| `BRAND` | constant `"Kitchen Mama"` | `field_type = constant` |
| `MODEL` | `shipment_lines.sku` | |
| `MATERIAL` | `sku_details.material` | |
| `PRODUCT_USE` | `sku_details.product_use` | 2026-07 customs field |
| `PRODUCT_URL` | `sku_regional_details.product_url` | regional lookup (§I.2.5A); **never** from `sku_details` |
| `LINE_HAS_BATTERY` | `sku_details.battery_type` (per line) | not blank/false/none → `"是"`, else `"否"` (§I.2.6) |
| `LINE_HAS_MAGNET` | `sku_details.magnet_type` (per line) | true/non-false → `"是"`, else `"否"` (§I.2.6) |

### I.2.5 Tax / customs line lookup (F) — V2 canonical (authoritative: [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md))

- **Canonical parent business key (V2): `series` + `country_of_origin` + `duty_country` + effective date.** Resolve per shipment line: `shipment_lines.sku → sku_details.series`; `shipments.country → tax_referral_rates.duty_country`; `country_of_origin` from the tax record + SKU/origin context (do not assume permanent CN). Then `HS_CODE → hscode`, `DECLARED_UNIT_VALUE → declared_value`, `DECLARED_CURRENCY → declared_currency`, `VAT_NO → vat_no`, `EORI_NO → eori_no` are **returned attributes of the matched row.**
- **`declared_currency` is a RETURNED value, NOT a lookup key.** Do NOT match declared value / HS code by currency (or by currency alone). Do NOT use `referral_fee_rate` as a declared value.
- **Effective-date rule:** `effective_from ≤ target AND (effective_to blank OR ≥ target)`; **blank `effective_to` = open-ended** (never "invalid"); latest `effective_from` wins; same `effective_from` → highest `V{NN}` / latest `updated_at`; ambiguous duplicates → conflict warning. Calculation/target date per the consumer (documents use the shipment's effective context, **not** the generation date).
- **Do NOT query `tax_rate_components`** unless a document explicitly needs a component.
- **Blocking:** a missing **required** `HS_CODE` or `DECLARED_UNIT_VALUE` blocks that external document with a clear message; a missing **optional** `VAT_NO` / `EORI_NO` (per `document_template_fields.required = FALSE`) must **NOT** block unrelated-country documents.

### I.2.5A Regional product URL resolution (E)

- `PRODUCT_URL` resolves from **`sku_regional_details`** — recommended key **`sku` + `company` + shipment destination `country` + `marketplace`**, using the **shipment's committed company/country/marketplace context**. **Do NOT read `product_url` from `sku_details`.**
- If more than one regional row matches: **exact `country` + `marketplace` match wins**; do **not** select arbitrarily. A **missing product URL** must be surfaced as a **document-readiness validation issue later** (not a silent blank).

### I.2.6 Battery / magnet output rules (G)

- **`battery_type`** stays an **extensible field** (not permanently boolean). v1 may hold `false`/`none` or a specific battery type. **Output:** any value other than `false`/`none`/blank → `"是"`; `false`/`none`/blank → `"否"`.
- **`magnet_type`** v1 canonical values may be boolean `TRUE`/`FALSE`. **Output:** `TRUE`/non-false → `"是"`; `FALSE`/blank → `"否"`.
- **Header `HAS_BATTERY`/`HAS_MAGNET`** = OR across **all** shipment SKUs; **line `LINE_HAS_BATTERY`/`LINE_HAS_MAGNET`** = per-SKU. **These master-field types are NOT changed in this spec task.**

### I.2.7 New DB dependencies (Invoice tab)

The `warehouses` master currently exposes `warehouse_id` / `company` / `country` / `warehouse_name` / `warehouse_type` / `status` (API `normalizeWarehouseRecord`). The Invoice recipient block additionally needs — **NOT yet present / not yet exposed** (add before this document can generate; nullable; no runtime here):
- `warehouses.warehouse_code` (recipient match key from `shipments.warehouse_code`)
- `warehouses.address`, `warehouses.city`, `warehouses.state`, `warehouses.postal_code`
- `warehouses.contact_phone`, `warehouses.contact_email`
- `warehouses.country` exists; the **country-code** representation for `RECIPIENT_COUNTRY_CODE` / `WAREHOUSE_COUNTRY_CODE` is produced by the **`country_to_iso2` transform** (§I.2.7A), **not** a new DB column.
- **`warehouses.is_selectable_for_shipment` (BOOLEAN) — PROPOSED / PLANNED, not implemented.** Drives Shipment Draft warehouse eligibility (`SHIPMENT_CENTER_SPEC.md` §22.G); not required for document generation. No DB column is added here.

Already-available dependencies (no new column): `shipments.external_shipment_id` (canonical `SHIPMENT_NO` source) / `shipment_no` (fallback + `INTERNAL_SHIPMENT_NO`) / `shipping_method_label` / `warehouse_code` / `reference_id` / `booking_no` / `note` / `shipment_total_cartons` / `shipments_customs_type` / `shipments_customs_type_label` / `country`; `tax_referral_rates` (V2) `vat_no` / `vat_rate` / `eori_no` / `declared_currency` / `declared_value` / `hscode` / `duty_rate` / `series` / `country_of_origin` / `duty_country` / `effective_from` / `effective_to` (+ child `tax_rate_components`; SSOT = [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md)); `sku_details.product_name` / `product_name_cn` / `product_use` / `material` / `units_per_carton` / `carton_weight` / `carton_length` / `carton_width` / `carton_height` / `battery_type` / `magnet_type`; `sku_regional_details.product_url`; `shipment_lines.sku`.

### I.2.7A Canonical Warehouse placeholder set + `country_to_iso2` transform (FINALIZED)

**Canonical `WAREHOUSE_*` placeholders** — all resolved by the reference lookup `shipments.warehouse_code → warehouses.warehouse_code` (the template never performs the lookup; the Document Dataset Builder resolves it before rendering; values are **not** stored redundantly on `shipments` in v1):

| placeholder | source (`warehouses` field) | notes |
|---|---|---|
| `WAREHOUSE_CODE` | `warehouse_code` | also the lookup key (= `shipments.warehouse_code`) |
| `WAREHOUSE_NAME` | `warehouse_name` | |
| `WAREHOUSE_ADDRESS` | `address` | |
| `WAREHOUSE_CITY` | `city` | |
| `WAREHOUSE_STATE` | `state` | |
| `WAREHOUSE_POSTAL_CODE` | `postal_code` | |
| `WAREHOUSE_COUNTRY_CODE` | `country` → `country_to_iso2` | fallback `shipments.country` → `country_to_iso2` (see resolution flow below) |
| `WAREHOUSE_PHONE` | `contact_phone` | |
| `WAREHOUSE_EMAIL` | `contact_email` | |

The Carrier-Invoice `RECIPIENT_*` block (§I.2.2) resolves through this **same** lookup — `RECIPIENT_*` are recipient-block aliases of the `WAREHOUSE_*` set.

**`WAREHOUSE_COUNTRY_CODE` fallback rule:**
1. Resolve the Warehouse by `shipments.warehouse_code`.
2. If `warehouses.country` is nonblank → `country_to_iso2(warehouses.country)`.
3. Else → `country_to_iso2(shipments.country)`.
4. If neither resolves → return **blank** and apply `document_template_fields.required` validation.
- **Never** fall back to an unrelated warehouse; **never** guess a country code from `warehouse_code` text.

**`country_to_iso2` — canonical transform rule** (a `transform_rule`, **NOT** a DB column):
- **Purpose:** normalize country names, aliases, ISO alpha-2 codes, or recognized ISO alpha-3 codes into **ISO 3166-1 alpha-2** output.
- **Examples:** `United States / USA / US → US`; `United Kingdom / UK / GBR / GB → GB`; `Japan / JPN / JP → JP`; `Germany / DEU / DE → DE`; `Canada / CAN / CA → CA`; `Australia / AUS / AU → AU`.
- **Rules:** already-valid ISO alpha-2 values pass through unchanged and uppercased; recognized aliases map through a **controlled country dictionary**; **do NOT** generate codes from the first letters of a country name; unknown values return **blank/error** for validation; the source fallback is documented separately as `fallback_rule`.
- **Recommended `document_template_fields` semantics for `WAREHOUSE_COUNTRY_CODE`:** `data_source_table = warehouses`; `data_source_field = country`; `data_source_path = shipments.warehouse_code → warehouses.warehouse_code → warehouses.country`; `transform_rule = country_to_iso2`; `fallback_rule = shipments.country | country_to_iso2`.
- The same `country_to_iso2` alias dictionary backs the Shipment Draft warehouse country filter's `normalize_country` (`SHIPMENT_CENTER_SPEC.md` §22.D / §22.L).

### I.2.8 Naming / total fields (H)

- Use the **renamed canonical shipment fields** in all Carrier Booking mappings: **`shipment_total_qty`, `shipment_total_cartons`, `shipment_total_cbm`, `shipment_total_gross_weight`, `shipment_total_net_weight`, `shipment_carton_qty`, `shipment_qty`** (line quantity). Do **NOT** restore the generic `shipments.total_qty` / `total_cartons` / `total_cbm` / `total_gross_weight` / `total_net_weight` or `shipment_lines.qty` / `carton_qty`.
- The same business field name on different tables is **not** a collision because table scope is explicit (e.g. `purchase_orders.total_cartons` vs `shipments.shipment_total_cartons`).

### I.2.9 Deferred until Packing List definition (I)

Not finalized in this task: **full workbook collection grain**; **Packing List tab mappings** (layout/controller/rows — pending user definition); **tab-specific controller names/cells**; **multi-tab row duplication**; **external document-readiness gate**; **final `document_template_fields` row list**; **runtime implementation**. The Invoice tab above is a **confirmed mapping draft only** — the workbook is not marked finalized. The **confirmed field rules** in §I.2.10 apply once the Packing List tab layout is defined.

### I.2.10 Confirmed shipment-line-grain / footer / customs rules (apply when the Packing List tab is defined)

These **field-level rules are confirmed** even though the Packing List tab **layout** is still pending (§I.2.9):

- **Line quantity (shipment-line grain):** `shipment_lines.shipment_qty` (canonical; legacy `qty` read-fallback only). This is the quantity for **non-allocation** shipment-line-grain docs such as the carrier packing-list tab — distinct from the Shipment Detail allocation grain (`allocated_qty`, §I.1.3, unchanged).
- **Line Measurement / CBM (shipment-line grain):** `shipment_lines.shipment_carton_cbm` — **LINE-TOTAL CBM** (canonical rename of `carton_cbm`; legacy read-fallback only). **Do NOT multiply by `shipment_carton_qty` at generation** — the line already holds its total.
- **Footer / total placeholders:**
  - `TOTAL_QTY` → `shipments.shipment_total_qty`
  - `TOTAL_CBM` → `shipments.shipment_total_cbm` (= Σ `shipment_carton_cbm`; no multiplication at generation)
  - `TOTAL_NET_WEIGHT` → `shipments.shipment_total_net_weight`
  - `TOTAL_GROSS_WEIGHT` → `shipments.shipment_total_gross_weight`
  - (all recomputed by `shipmentRecalcTotals_`, `SHIPMENT_CENTER_SPEC.md` §15/§20 — never computed at generation time)
- **Customs type enum (canonical, D):** `third_party_customs` = 買單報關 · `formal_customs` = 正式報關 · `tax_refund_customs` = 退稅報關. **`tax_refund_customs` is NOT renamed.** The enum→Label map is owned by the backend (`CUSTOMS_TYPE_LABELS_` in `17_carrier_handlers.gs`, mirrored read-side in the API normalizer). The Label is **snapshotted** into `carrier_rate_cards.customs_type_label` → `shipments.shipments_customs_type_label` — exactly like `shipping_method_label`. If a Label ever changes, only the map changes; documents never change.
- **`{{CUSTOMS_TYPE}}` reads the Label snapshot (`shipments.shipments_customs_type_label`), NOT the enum.** The Document runtime is forbidden from performing any `if (customs_type == …)` translation to produce the display Label.
- **Packing-list field 「是否出口退税」** is a *separate* boolean placeholder derived from the **enum** `shipments.shipments_customs_type` (this is an intended enum consumer — a yes/no derivation, not a Label translation):
  - `tax_refund_customs` → **是**
  - `third_party_customs` → **否**
  - `formal_customs` → **否** *(do NOT infer `formal_customs` as a tax refund)*
- **`EORI_NO` → `tax_referral_rates.eori_no`** (EU/UK customs) — resolved by `duty_country` + effective-date rules (latest `effective_from` wins; blank `effective_to` = open-ended; never by currency). **Nullable / optional:** when the `document_template_fields` row for `EORI_NO` has `required = FALSE`, a missing EORI must **NOT** block generation. (Companion to `VAT_NO`, §I.2.2.)

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

> **`{SHIPMENT_NO}` in folder/file-name rules resolves the canonical `SHIPMENT_NO`** = `shipments.external_shipment_id` (fallback `shipment_no` → `shipment_id`), per §D. File-name / `file_name_rule` values using `{{SHIPMENT_NO}}` therefore render the external/carrier-facing Shipment ID, not the internal `shipment_no`.

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

## O. Google Sheet Document Runtime Rules (SPEC ONLY — shared Document Engine)

Shared, carrier-agnostic runtime rules for **`template_file_type = google_sheet`** documents. Carrier-specific mappings that consume these rules live in [`CARRIER_BOOKING_MAPPING_SPEC.md`](./CARRIER_BOOKING_MAPPING_SPEC.md) (TOP SEALAND, AGL, future SINOTRANS). **No runtime is implemented here** — this defines the required behavior for the future Document Engine.

### O.1 Template immutability + copy-before-render workflow (global)

**Original document templates are IMMUTABLE.** Every generation operates on a COPY. Canonical order:

1. Read the template registry (`document_templates`).
2. **Create a copy** of the original template file.
3. Replace scalar placeholders **on the copy**.
4. Expand collections **on the copy**.
5. Insert / hide rows **on the copy**.
6. Update formulas **on the copy**.
7. Export / deliver the generated document.
8. Record the result in `generated_documents`.

**Forbidden on the ORIGINAL template** (permitted only on the generated copy): replacing placeholders · inserting/deleting rows · changing formulas · clearing cells · writing generated values · hiding/unhiding operational rows · changing worksheet names · updating formatting. The template stays reusable and version-controlled; **all modifications happen on the copy only.**

### O.2 Collection-controller row (hidden control column — general rule)

- A collection controller token (e.g. `{{SHIPMENT_LINES}}`, `{{AGL_INVOICE_LINES}}`) lives in a **hidden control column on the actual line-template row** — it marks the row the runtime duplicates once per output-grain record, then the token is cleared/removed from output.
- **Do NOT hardcode the controller to a specific column (e.g. column A) in the shared architecture.** Each template records its own hidden control column + line-template row in its carrier mapping. The hidden control column is **structural metadata** and must **never appear in the final visible document**.
- In `document_template_fields` the controller is one `field_type = collection` row (`collection_key = <NAME>`); every per-row placeholder shares that `collection_key` (§F.1).

### O.3 `worksheet_name` semantics

- **`template_file_type = google_sheet` → `worksheet_name` MUST be the EXACT target tab name** (e.g. `Template`). Placeholder replacement + collection expansion + footer updates apply to that tab only.
- **Non-Sheet templates → `worksheet_name` blank.**
- **Unmapped worksheets** (e.g. an `Instructions` tab) receive **no `document_template_fields` rows**, are **preserved as-is** in the generated copy (unless a future output rule removes them), and **never receive line expansion**.

### O.4 Reserved line capacity (initial capacity, NOT a hard maximum)

A Sheet template's preformatted line region (line-template row → footer) is **initial capacity**, not a maximum line count.

- **Case 1 — generated lines ≤ reserved capacity:** fill the first *N* line rows; **preserve remaining rows blank**; do not modify the original; the generated copy **may keep unused blank rows visible in v1**. Optional future enhancement `hide_unused_template_rows = TRUE` is **deferred**.
- **Case 2 — generated lines > reserved capacity (on the COPY):** (1) compute additional rows required; (2) **insert the missing rows immediately before the footer**; (3) copy the line-template row **formatting** into each new row — borders, row height, number formats, text wrapping, alignment, line-row formulas, data validation, merged-cell behavior where supported; (4) fill all line values; (5) the footer **moves down naturally**; (6) update footer formula ranges to the actual generated line range (§O.5). **Never overwrite or merge multiple shipment lines into one row.**

### O.5 Footer formula preservation + explicit range validation

- **Footer total formulas remain FORMULAS** on the generated copy — do **NOT** replace them with document placeholders in v1.
- Runtime computes `line_start_row = the line-template/controller row` and `line_end_row = line_start_row + generated_line_count − 1`, then **explicitly validates or rewrites** each footer formula so its `SUM(...)` range covers `line_start_row : line_end_row`. **Do NOT assume Google Sheets auto-adjusts every formula correctly** after row insertion — the runtime must verify.
- Footer formulas exist **only on the generated copy**.

### O.6 Formula totals vs Shipment snapshot totals (validation — planned, not implemented)

- Footer totals are computed from the **rendered line values**; **persisted Shipment totals are NOT written into footer cells.**
- The engine MAY compare computed footer totals against the Shipment snapshot as a validation step: `SUM(QTY)` vs `shipments.shipment_total_qty`; `SUM(CARTON_QTY)` vs `shipment_total_cartons`; `SUM(GROSS_WEIGHT)` vs `shipment_total_gross_weight`; `SUM(NET_WEIGHT)` vs `shipment_total_net_weight`; `SUM(CARTON_CBM)` vs `shipment_total_cbm`.
- On mismatch: return a warning / generation validation error per future readiness rules; **never silently alter Shipment DB values; never silently force the formula result to match the header.** This validation is **planned, not implemented.**

---

## P. Document Generation Runtime — Canonical Finalization (SPEC ONLY)

Canonical runtime contract that **every future carrier / document template MUST follow** (AGL, SINOTRANS, Taiwan Export, US Import, and future FedEx / UPS / DHL / Expeditors / Flexport). This section formalizes the shared runtime; the mechanics of immutable-template / copy / reserved-rows / dynamic-expansion / footer-formulas are defined in **§O** and are **not** re-duplicated here. Per-carrier behavior lives in [`CARRIER_DOCUMENT_MAPPING_SPEC.md`](./CARRIER_DOCUMENT_MAPPING_SPEC.md).

> **DB remains the SSOT for field-level mappings.** This markdown describes runtime **architecture** only. The authoritative token → data-source mapping lives in **`document_template_fields`** (§E). Markdown must **never** duplicate `document_template_fields` rows.

### P.1 Runtime Architecture (canonical pipeline)

```
Template (read-only)
  ↓ Copy Template            (§O.1 — never edit the original)
  ↓ Resolve Placeholder      (scalar tokens — §F)
  ↓ Resolve Collection       (collection controller → collection_item rows — §P.3)
  ↓ Dynamic Row Expansion    (§O.4 — insert before footer when actual > reserved)
  ↓ Formula Recalculation    (§O.5 template formulas + §P.5 runtime formulas)
  ↓ Generate Output
  ↓ Generated Document        (immutable snapshot — §P.7; logged in generated_documents)
```

**Rule:** templates are immutable; runtime always copies; generated documents are **independent snapshots**.

### P.2 Template Immutable Rule (canonical)

Templates are **never edited**. Every generated document is produced from a **copied** template (`Template → Copy → Fill Runtime Data → Generated Document`), so the template always remains reusable. Full workflow + forbidden-on-original list: **§O.1**.

### P.3 Collection Runtime + `collection_key` Convention

- A **collection** placeholder is the controller (one `field_type = collection` row in `document_template_fields`); each repeating field is a **`collection_item`** that **MUST reference exactly one `collection_key`** (§O.2 / §F.1). Each collection owns **one** dynamic runtime section on its worksheet.
- **`collection_key` naming convention (canonical):** `{SCOPE}_{DOCTYPE}_LINES`, UPPERCASE snake, one per worksheet section. Registered keys:

  | collection_key | Document / worksheet |
  |---|---|
  | `AGL_INVOICE_LINES` | AGL Carrier Booking — Invoice/Template |
  | `SINOTRANS_INVOICE_LINES` | SINOTRANS Commercial Invoice |
  | `SINOTRANS_PACKING_LINES` | SINOTRANS Packing List |
  | `EXPORT_INVOICE_LINES` | Taiwan Export Commercial Invoice |
  | `EXPORT_PACKING_LINES` | Taiwan Export Packing List |
  | `US_IMPORT_INVOICE_LINES` | US Import Commercial Invoice |
  | `US_IMPORT_PACKING_LINES` | US Import Packing List |

  Future documents add their own `{SCOPE}_{DOCTYPE}_LINES` key following the same pattern.

### P.4 Dynamic Row Runtime

Standard behavior for every template (defined in **§O.4**): if actual rows ≤ placeholder rows → **overwrite placeholder rows only**; if actual rows > placeholder rows → **insert new rows immediately before the Total/Footer**, preserving footer + formulas (§O.5). This is the canonical expansion rule for all future templates.

### P.5 Formula Runtime (two distinct types)

- **Template Formula** — lives **inside the template** and stays there (recalculated by the Sheet): `SUM()`, `AVERAGE()`, `COUNT()`, footer totals, cell formulas. Runtime only validates/rewrites their **ranges** after row expansion (§O.5); it does not replace them with values.
- **Runtime Formula** — computed **by the runtime before writing** the cell value: `AMOUNT = QTY × UNIT_PRICE`, Invoice Number, PO Number, Material Summary, Carton Reference, any Collection Summary. These are written as resolved values (or as a template-form formula only where a carrier template explicitly requires it — recorded per-carrier).

### P.6 Canonical Lookup Priority

Resolution order the runtime MUST use (field-level sources remain in `document_template_fields`; effective-date rule = `effective_from ≤ target_date AND (effective_to blank OR ≥ target_date)`, latest `effective_from` wins — Tax SSOT [`TAX_AND_REFERRAL_RATES_SPEC.md`](./TAX_AND_REFERRAL_RATES_SPEC.md) §4/§5):

| Value | Lookup chain |
|---|---|
| **HS Code** | shipment line → SKU → `sku_details.series` → `tax_referral_rates` → effective date → `hscode` |
| **Declared Value / Currency** | shipment country → `tax_referral_rates.duty_country` (+ series + origin) → effective date → `declared_value` / `declared_currency` |
| **Warehouse (recipient)** | `shipments.warehouse_code` → `warehouses.warehouse_code` → warehouse fields (§I.2.7A; `WAREHOUSE_COUNTRY_CODE` via `country_to_iso2`) |
| **Regional Product** | SKU + company + marketplace + country → `sku_regional_details` |
| **Pricing** | SKU + marketplace + country → `pricing_list` |

Document lookup/target date: `shipments.etd` → shipment creation date → current date (Draft fallback only); **never** the document-generation date for a historical shipment.

### P.7 Generated Document Snapshot Rule

A generated document is an **immutable snapshot** at generation time. Subsequent edits to **Pricing / Tax / SKU / Warehouse / Carrier / Regional** master data **MUST NOT** alter historical generated documents, and **MUST NOT** mutate the existing `generated_documents` record; they may affect only a **new regeneration**, which creates a **new** `generated_documents` record/version (append-only log — §D).

**Two distinct source categories (resolves the §P.6 ↔ §P.7 relationship):**

- **A. Transaction Snapshot sources (committed truth).** Generation reads the committed **PO / Shipment snapshots** for transaction and execution truth — quantities, carton quantities, weight / CBM, shipping-method label, customs-type label, committed carrier / rate-card selection, PO allocation, execution dates, and shipment identifiers. The Document Engine **must NOT recalculate** planning, allocation, shipment totals, or committed execution values from current upstream state.
- **B. Reference Master lookups at generation time.** When a required value is **not persisted in the transaction snapshot**, the Dataset Builder **MAY** resolve it from the authoritative Reference Master per **§P.6** and `document_template_fields` — `tax_referral_rates`, `warehouses`, `sku_regional_details`, `pricing_list`. Effective-dated (tax) lookups use the **transaction target date** (`shipments.etd` → shipment creation date → current date only for a Draft fallback); the **generation timestamp must not replace the historical transaction date**.

> **Canonical (supersedes the earlier "never live master data" phrasing):** *Documents read committed transaction snapshots first. Where a document field is not stored in the transaction snapshot, the Dataset Builder may perform the Canonical generation-time Reference Master lookup defined in §P.6 and `document_template_fields`. Once generated, the output is an immutable snapshot; later master-data changes never alter the historical generated document.* This is consistent with the Global Snapshot Architecture (§A / RO&PO §14): the engine never recomputes committed planning/allocation/execution values — reference lookups fill only non-snapshotted fields.

### P.8 Runtime vs Template Calculation Responsibility

| Runtime calculates (before writing) | Template calculates (stays in the sheet) |
|---|---|
| Invoice Number · PO Number · Amount · Material Summary · Carton Reference · Collection Summary | `SUM()` · `COUNT()` · Totals · cell formulas |

---

## N. Placeholder Rule (naming)

- **Placeholders use UPPERCASE snake case.** In the **template file** they appear inside `{{ }}`; in **`document_template_fields.placeholder`** they are stored **WITHOUT braces** (the runtime wraps them — §F.1).
- Common tokens (template-file form):

```
{{SHIPMENT_NO}}
{{COUNTRY}}
{{MARKETPLACE}}
{{TOTAL_QTY}}
{{TOTAL_CARTONS}}
{{SHIPPING_METHOD}}   ← Shipment shipping-service display (stored placeholder = SHIPPING_METHOD; source shipments.shipping_method_label). No SHIPPING_METHOD_LABEL alias.
```

- Scalar vs collection placeholder semantics are defined in **§F**; canonical `field_type` / `data_scope` enums in **§E**.
- **Token → data mapping lives in `document_template_fields`** (§E). **PO document mapping (§H) and Shipment Detail mapping (§I / §I.1) are FINALIZED**; only the remaining document-type mappings (carrier booking / commercial invoice / packing list) and the **Document Engine runtime** are deferred.

---

## K. Non-Goals (this task)

Runtime / UI implementation · Apps Script handlers · Google Drive/Docs/Sheets API · PDF export · email / automation · Export Center / Template Center UI · DB migration · token-resolution engine · **remaining document-type mappings** (`carrier_booking_form` / `commercial_invoice` / `packing_list`; **PO §H + Shipment Detail §I.1 are finalized**) · **`document_output_folders` table (per-scope folder registry — §L)** · **`shipment_line_allocations` table + writer** (§I.1.2 — entirely planned) · shipment folder-path runtime creation. **Documentation / architecture only.** Runtime is **deferred** until confirmed.

---

**Document Generation System — architecture spec. SPEC ONLY. No runtime, no DB migration.**

**End of Document**
