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

> **Shipment-focused document types (v1 canonical — §G.1):** `shipment_detail`, `carrier_booking_form`, `commercial_invoice`, `packing_list` (combined invoice+packing is a reserved future type). Token-to-field mapping lives in **`document_template_fields`** — **`shipment_detail` mapping is FINALIZED (§I.1)**; `carrier_booking_form` / `commercial_invoice` / `packing_list` mappings are still to be defined. Output routing → **§L**.

---

## I.0 Document Mapping Priority

**Purpose:** document the official implementation order of document placeholder mappings so future development follows a consistent roadmap.

**Document Mapping Priority (v1)**

1. ✅ **Shipment Detail — COMPLETED**
   - Placeholder mapping finalized
   - Collection grain finalized
   - Merge rules finalized
2. 🟡 **Carrier Booking Form** *(in progress — see §I.2)*
   - **Invoice Tab — CONFIRMED MAPPING DRAFT** (§I.2; header + line mappings + lookup rules recorded)
   - **Packing List Tab — PENDING user definition**
   - **Full workbook — NOT finalized** (grain, controllers, multi-tab duplication, totals, readiness gate all deferred — §I.2.9)
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
- **Column A is a hidden control column** and stays hidden in the generated file.
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
| `SHIPMENT_NO` | scalar | header | text | `shipments.shipment_no` |
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

> **Canonical shipment field names (2026-07 DB rename).** Shipment quantity columns are canonically `shipments.shipment_total_qty` / `shipment_total_cartons` / `shipment_total_cbm` and `shipment_lines.shipment_carton_qty`; the legacy `total_qty` / `total_cartons` / `total_cbm` / `carton_qty` are retired (read-fallback only). Any shipment total placeholder added later MUST read the canonical column. **`shipments.customs_type`** (customs-method snapshot) is available as a header-scope source for customs/carrier documents (customs docs should read the stored snapshot, never the live rate card). Customs-facing product text sources: `sku_details.product_name_cn`, `sku_details.product_use`, and `sku_regional_details.product_url`. This note only redirects field names — the finalized collection controller / grain / merge architecture (§I.1.1–§I.1.5) is unchanged.

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

> **Status.** The Invoice Import tab is a **confirmed mapping draft**. The **Packing List Import tab is pending user definition**, and the **whole `carrier_booking_form` workbook is NOT finalized**. No Document Engine runtime is implemented in this task. This section records only what is currently confirmed for the Invoice tab so the mapping is not lost; anything not listed as "confirmed" stays provisional (§I.2.9).

### I.2.1 Workbook architecture (A)

- **ONE `document_templates` row** represents the whole `carrier_booking_form` **workbook** (`document_type = carrier_booking_form`, `document_category = carrier`, `document_usage = carrier`). Do **NOT** create a second `document_templates` row just because the workbook has two tabs — a second row is created **only if the physical template files are actually separate**.
- The workbook contains **two mapped worksheets/tabs**: (1) **Invoice Import Template**, (2) **Packing List Import Template**. Both tabs **may share the same Shipment/Header dataset** (shared scalar placeholders).
- The future Document Engine must support: **one template file → multiple mapped worksheets/tabs → tab-specific collection controllers → shared scalar placeholders**. The exact **multi-tab runtime is DEFERRED** (§I.2.9).
- `document_template_fields` may carry a **tab/worksheet qualifier** (e.g. a `worksheet` or `tab` attribute, or a `collection_key` scoped per tab) so the same workbook row can map multiple tabs — the exact column is deferred until the Packing List tab is defined.

### I.2.2 Invoice Tab — header mapping (B)

Header (scalar) placeholders — one value per shipment. `field_type = scalar`, `data_scope = header` unless noted.

| placeholder (stored) | source (path) | notes |
|---|---|---|
| `CUSTOMER_ORDER_NO` | `shipments.shipment_no` | |
| `SERVICE` | `shipments.shipping_method_label` | snapshot (§I.1.6); fallback `concat(shipping_method,"_",last_mile_delivery)` |
| `WAREHOUSE_CODE` | `shipments.warehouse_code` | also the recipient lookup key (§I.2.3) |
| `RECIPIENT_NAME` | `warehouses.warehouse_name` | via `warehouse_code` lookup |
| `RECIPIENT_COMPANY` | `warehouses.warehouse_name` | same source as `RECIPIENT_NAME` (confirmed) |
| `RECIPIENT_ADDRESS_1` | `warehouses.address` | **new DB dependency** (§I.2.7) |
| `RECIPIENT_CITY` | `warehouses.city` | **new DB dependency** |
| `RECIPIENT_STATE` | `warehouses.state` | **new DB dependency** |
| `RECIPIENT_POSTAL_CODE` | `warehouses.postal_code` | **new DB dependency** |
| `RECIPIENT_COUNTRY_CODE` | `warehouses.country` | provisional — may need a country **code**, not name |
| `RECIPIENT_PHONE` | `warehouses.contact_phone` | **new DB dependency** |
| `RECIPIENT_EMAIL` | `warehouses.contact_email` | **new DB dependency** |
| `REFERENCE_ID` | `shipments.reference_id` | |
| `TOTAL_CARTONS` | `shipments.shipment_total_cartons` | **canonical renamed field** (§H) — never `shipments.total_cartons` |
| `HAS_BATTERY` | derived from all shipment SKUs (§I.2.6) | any line `sku_details.battery_type` not blank/false/none → `"是"`, else `"否"` |
| `HAS_MAGNET` | derived from all shipment SKUs (§I.2.6) | any line `sku_details.magnet_type` true/non-false → `"是"`, else `"否"` |
| `CUSTOMS_TYPE` | `shipments.customs_type` | shipment snapshot (read stored value, not live rate card) |
| `VAT_NO` | `tax_referral_rates.vat_no` | resolved tax row (§I.2.3) |
| `DECLARED_CURRENCY` | `tax_referral_rates.declared_currency` | resolved tax row (§I.2.3) |

### I.2.3 Header lookup rules (C)

- **Warehouse (recipient block):** `shipments.warehouse_code` → `warehouses.warehouse_code` → warehouse contact/address fields. (Recipient name/company/address/city/state/postal/country/phone/email all come from the matched `warehouses` row.)
- **Tax row lookup (VAT_NO / DECLARED_CURRENCY):** match **`shipments.country` → `tax_referral_rates.duty_country`**, apply **effective-date rules** (blank `effective_to` = open-ended); if **multiple applicable rows** exist, **latest `effective_from` wins**. **Do NOT select tax rows by currency alone.** `VAT_NO` = the resolved row's `vat_no`; `DECLARED_CURRENCY` = the resolved row's `declared_currency`.

### I.2.4 Invoice Tab — line collection (D) — PROVISIONAL

- **Collection placeholder:** `INVOICE_LINES` (`field_type = collection`). **Likely collection source = `shipment_lines`.** **Final grain remains PROVISIONAL** until the Packing List tab + carrier import requirements are reviewed (do not lock grain here).
- Per-line placeholders (`field_type = collection_item`; `collection_key = INVOICE_LINES`):

| placeholder (stored) | source (path) | notes |
|---|---|---|
| `CARTON_REFERENCE` | `shipments.shipment_no` + padded carton range | formula; **6-digit zero-padded** sequence, e.g. `SHIPMENT123-000001-000004`, `SHIPMENT123-000009-000015`; **exact delimiter/format PROVISIONAL** — confirm against the carrier import requirement |
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

### I.2.5 Tax / customs line lookup (F)

- **Declared value** (`DECLARED_UNIT_VALUE`) lookup uses: **`series` + `duty_country` + `declared_currency` + effective date**.
- **HS code** (`HS_CODE`) lookup uses: **`series` + `duty_country` + effective date**.
- **Do NOT match declared value or HS code by currency alone.**
- If `tax_referral_rates` contains multiple SKU/series-level variants, **preserve the existing most-specific matching rule** (series-level row wins over a broader row for the same `duty_country` + effective window); document it rather than inventing a new precedence.

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
- `warehouses.country` exists but may need a **country-code** representation for `RECIPIENT_COUNTRY_CODE` (provisional).

Already-available dependencies (no new column): `shipments.shipment_no` / `shipping_method_label` / `warehouse_code` / `reference_id` / `shipment_total_cartons` / `customs_type` / `country`; `tax_referral_rates.vat_no` / `declared_currency` / `declared_value` / `hscode` / `duty_country` / `series` / `effective_from` / `effective_to`; `sku_details.product_name` / `product_name_cn` / `product_use` / `material` / `units_per_carton` / `carton_weight` / `carton_length` / `carton_width` / `carton_height` / `battery_type` / `magnet_type`; `sku_regional_details.product_url`; `shipment_lines.sku`.

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
- **Customs type enum (canonical, D):** `third_party_customs` = 買單報關 · `formal_customs` = 正式報關 · `tax_refund_customs` = 退稅報關. **`tax_refund_customs` is NOT renamed.**
- **Packing-list field 「是否出口退税」** derived from `shipments.customs_type`:
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
