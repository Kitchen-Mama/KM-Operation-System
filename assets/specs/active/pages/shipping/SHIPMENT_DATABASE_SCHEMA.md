# Shipment / Inventory / PO / Carrier Database Schema

**Version:** v1
**Current Storage:** Google Sheet DB MVP
**Future Target:** BigQuery / Cloud DB compatible schema
**Status:** Ready for first DB integration phase
**Last Updated:** 2026-06

---

## Core Database Principles

### Principle 1: Master data should have one source of truth

- `sku_details` 是 SKU 主資料來源。
- `marketplace_skus` 是站點 SKU 關係來源。
- `carriers` 是物流商主資料來源。
- `document_templates` 是模板主資料來源。

不要在不同表重複維護同一個主資料。

### Principle 2: Use ID mapping / join instead of duplicated fields

- `shipping_plan_lines.sku` → `sku_details.sku`
- `shipments.shipping_plan_id` → `shipping_plans.shipping_plan_id`
- `shipment_lines.purchase_order_line_id` → `purchase_order_lines.purchase_order_line_id`
- `shipping_plans.carrier_id` → `carriers.carrier_id`

### Principle 3: Plan data and actual shipment data are separated

- `shipping_plans` = 出貨計畫 / 審核 / 預估成本
- `shipments` = 實際出貨 / tracking / 實際成本

### Principle 4: Summary snapshot fields are allowed when they represent historical transaction values

- `shipping_plans.estimated_freight_cost` 是審核當下的預估值。
- `shipments.freight_cost_actual` 是實際發生成本。
- `shipments.total_qty / total_cartons / total_cbm` 可由 `shipment_lines` 加總後寫回做 summary snapshot。

### Principle 5: Current stock and movement history must be separated

- `factory_stock` = 目前庫存值
- `factory_stock_movements` = 每次庫存異動紀錄

### Principle 6: Templates are not the database

- `document_templates` 記錄模板 metadata。
- `generated_documents` 記錄產出的文件。
- 實際資料仍來自 `purchase_orders` / `shipping_plans` / `shipments` 等資料表。
- Google Drive 存模板與產出文件，DB 只存 `file_id` / `file_url` / metadata。

---

## Table Overview

| Table Name | Purpose | Status | Primary Key | Main Relationships | Notes |
|-----------|---------|--------|-------------|-------------------|-------|
| marketplace_skus | 站點 SKU 關係 | Active v1 | marketplace_sku_id | → sku_details | country+marketplace+sku unique |
| shipping_plans | 出貨計畫主表 | Active v1 | shipping_plan_id | → carriers | 審核 + 預估成本 |
| shipping_plan_lines | 出貨計畫 SKU 明細 | Active v1 | shipping_plan_line_id | → shipping_plans, → sku_details | |
| shipments | 實際出貨主表 | Active v1 | shipment_id | → shipping_plans | tracking + 實際成本 |
| shipment_lines | 出貨 SKU 明細 | Active v1 | shipment_line_id | → shipments, → sku_details, → purchase_order_lines | |
| carriers | 物流商主資料 | Active v1 | carrier_id | | |
| carrier_rate_cards | Carrier 費率表 | Active v1 | rate_card_id | → carriers | |
| carrier_lead_times | 物流 lead time | Active v1 (optional first UI) | lead_time_id | → carriers | |
| document_templates | 文件模板 metadata | Active v1 | template_id | → carriers (optional) | 檔案存 Google Drive |
| generated_documents | 產出文件紀錄 | Active v1 | document_id | → document_templates | 檔案存 Google Drive |
| factory_stock | 工廠目前庫存 | Active v1 | factory_stock_id | → sku_details | current state |
| factory_stock_movements | 庫存異動紀錄 | Active v1 | factory_stock_movement_id | → sku_details | history ledger |
| purchase_orders | PO 主表 | Active v1 | purchase_order_id | | 向工廠下單 |
| purchase_order_lines | PO SKU 明細 | Active v1 | purchase_order_line_id | → purchase_orders, → sku_details | |
| production_schedule | 生產排程 | Active v1 | production_schedule_id | → purchase_orders, → purchase_order_lines | |
| shipment_events | Tracking events | Future | shipment_event_id | → shipments | v1 不接 UI |
| shipment_routes | 路線節點 | Future | shipment_route_id | → shipments | Map tracking future |
| amazon_daily_sales_raw | Amazon 銷售原始報表 | Raw source | — | | Needs normalized layer |
| amazon_inventory_raw | Amazon 庫存原始報表 | Raw source | — | | Needs normalized layer |
| amazon_inventory_health_raw | Amazon 庫齡原始報表 | Raw source | — | | Needs normalized layer |

### Existing Related Tables (Defined Elsewhere)

以下表已在其他 DB schema / project-current-state.md 中定調，本文件不重複展開全部欄位，但會被 Shipment DB join 使用：

- `sku_details` — SKU 主資料
- `product_features` — 產品特徵
- `sku_handbook_summaries` — 手冊摘要
- `campaigns` — 活動主表
- `campaign_sku_lines` — 活動 SKU 明細

---

## Active Tables — Detailed Schema

---

### marketplace_skus

#### Purpose
定義每個 country + marketplace 實際管理 / 販售的 SKU。

#### Status
Active v1

#### Primary Key
`marketplace_sku_id`

#### Foreign Keys / Mapping
- `marketplace_skus.sku` → `sku_details.sku`

#### Unique Rule
`country` + `marketplace` + `sku` should be unique.

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| marketplace_sku_id | string | Yes | 唯一識別 | |
| sku | string | Yes | SKU code | → sku_details.sku |
| country | string | Yes | 國家代碼 | US, CA, DE, UK, JP, AU... |
| marketplace | string | Yes | 平台 | Amazon, Walmart, Shopify... |
| site_sku | string | | 平台端 SKU | |
| asin | string | | Amazon ASIN | |
| currency | string | | 幣別 | USD, CAD, EUR... |
| regular_price | number | | 定價 | |
| minimum_price | number | | 最低售價 | |
| msrp | number | | 建議售價 | |
| marketplace_sku_status | enum | Yes | 狀態 | active, phasing_out, inactive, discontinued |
| created_at | date | | 建立時間 | |
| updated_at | date | | 更新時間 | |

---

### shipping_plans

#### Purpose
Shipping Plan 主表，用於出貨計畫、審核、物流方式與預估成本。

#### Status
Active v1

#### Primary Key
`shipping_plan_id`

#### Foreign Keys / Mapping
- `shipping_plans.carrier_id` → `carriers.carrier_id`

#### Important Notes
- `shipping_plan_id` 是系統關聯 ID。
- `shipping_plan_no` 是人類可讀編號，用於搜尋、溝通、文件顯示。
- `estimated_freight_cost` / `estimated_duty` / `estimated_total_cost` 是計畫審核當下的預估 snapshot。
- `country` / `marketplace` / `ship_from` / `destination` / `shipping_method` / `carrier_id` 屬於 plan-level，不應在 shipping_plan_lines 重複維護。

> **Endpoint identity semantics (canonical, 2026-07-21).** `ship_from` / `destination` are **human-readable snapshots**. The **structured** endpoint identities are `ship_from_warehouse_id` / `destination_warehouse_id` (→ `warehouses.warehouse_id`), each qualified by `ship_from_type` / `destination_type`. A `*_warehouse_id` may be blank when that endpoint is not a Warehouse Master record (subject to the `*_type` contract). **Warehouse identity must NEVER be inferred from `ship_from` / `destination` display text.** Do **NOT** add `warehouse_operation_type` here; direction is runtime-derived from origin/destination identities (see WAREHOUSE_OPERATIONS_SPEC.md / SYSTEM_RUNTIME_ARCHITECTURE.md). Full canonical column list = task Section C / DATABASE_RELATIONSHIP_MAP.md; the columns below add the endpoint fields (older revisions of this table omitted them).

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| shipping_plan_id | string | Yes | 系統 ID | PK |
| shipping_plan_no | string | Yes | 人類可讀編號 | 用於搜尋/溝通 |
| plan_name | string | | 計畫名稱 | |
| country | string | Yes | 目的國 | |
| marketplace | string | | 平台 | |
| ship_from | string | Yes | 出貨來源 snapshot | human-readable; NOT identity |
| ship_from_warehouse_id | string | | 出貨來源倉庫 identity | → warehouses.warehouse_id; blank if origin not a WH Master record |
| ship_from_type | string | | 出貨來源端點類型 | origin endpoint type |
| destination | string | | 目的地 snapshot | human-readable; NOT identity |
| destination_warehouse_id | string | | 目的倉庫 identity | → warehouses.warehouse_id when destination is a WH Master record |
| destination_type | string | | 目的地端點類型 | destination endpoint type |
| shipping_method | string | Yes | 運輸方式 | air, sea, truck, express |
| carrier_id | string | | 物流商 | → carriers.carrier_id |
| carrier_unit_rate | number | | 物流單價 | |
| carrier_rate_type | string | | 計費方式 | per_kg, per_cbm... |
| estimated_freight_cost | number | | 預估運費 | snapshot |
| estimated_duty | number | | 預估關稅 | snapshot |
| estimated_total_cost | number | | 預估總成本 | snapshot |
| currency | string | | 幣別 | |
| status | enum | Yes | 狀態 | draft, pending_approval, approved, rejected, converted_to_shipment, cancelled |
| created_by | string | | 建立者 | |
| created_at | datetime | | 建立時間 | |
| submitted_by | string | | 提交者 | |
| submitted_at | datetime | | 提交時間 | |
| approved_by | string | | 核准者 | |
| approved_at | datetime | | 核准時間 | |
| rejected_by | string | | 拒絕者 | |
| rejected_at | datetime | | 拒絕時間 | |
| rejected_reason | string | | 拒絕原因 | |
| note | string | | 備註 | |
| source | string | | 來源 | manual, system, import |
| updated_at | datetime | | 更新時間 | |

---

### shipping_plan_lines

#### Purpose
Shipping Plan SKU 明細。

#### Status
Active v1

#### Primary Key
`shipping_plan_line_id`

#### Foreign Keys / Mapping
- `shipping_plan_lines.shipping_plan_id` → `shipping_plans.shipping_plan_id`
- `shipping_plan_lines.sku` → `sku_details.sku`

#### Important Notes
- 不存 `product_name`，使用 sku join sku_details。
- 不存 `factory_name`，`ship_from` 在 shipping_plans 主表。
- `inventory_snapshot_date` 是目前 MVP 用於追溯來源日期；未來若有 inventory_snapshots，可改為 `inventory_snapshot_id`。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| shipping_plan_line_id | string | Yes | PK | |
| shipping_plan_id | string | Yes | FK | → shipping_plans |
| sku | string | Yes | SKU | → sku_details.sku |
| requested_qty | number | Yes | 申請數量 | |
| approved_qty | number | | 核准數量 | |
| carton_qty | number | | 箱數 | |
| units_per_carton | number | | 每箱數量 | |
| source_page | string | | 來源頁面 | inventory, request_order... |
| source_reason | string | | 來源原因 | |
| inventory_snapshot_date | date | | 庫存快照日期 | MVP 追溯用 |
| note | string | | 備註 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### shipments

#### Purpose
實際出貨主表。由 approved shipping plan 建立 shipment。

#### Status
Active v1

#### Primary Key
`shipment_id`

#### Foreign Keys / Mapping
- `shipments.shipping_plan_id` → `shipping_plans.shipping_plan_id`

#### Important Notes
- 不重複 country / marketplace / ship_from / destination / shipping_method / carrier_id，透過 `shipping_plan_id` join `shipping_plans`。
- `freight_cost_actual` 是實際運費，不同於 `shipping_plans.estimated_freight_cost`。
- `total_qty` / `total_cartons` / `total_cbm` / `total_gross_weight` / `total_net_weight` 可由 shipment_lines 加總後寫回做 summary snapshot。
- `shipment_no` 是人類可讀出貨編號。
- `shipment_id` 是系統關聯 ID。

> **Endpoint identity semantics (canonical, 2026-07-21).**
> - **Canonical structured identities:** `origin_warehouse_id` (structured origin) and `destination_warehouse_id` (structured destination), each → `warehouses.warehouse_id`, qualified by `origin_type` / `destination_type`. `ship_from` / `destination` remain **human-readable snapshots** and are **never** the authoritative identity.
> - **Transitional compatibility fields (do NOT delete in this task):** `warehouse_id` = **destination** warehouse identity; `warehouse_code` = **destination** `warehouse_code` **snapshot** derived from the selected `warehouses` record (never freely entered by the user).
> - **Dual-write consistency rule:** when `destination_warehouse_id` is populated, `shipments.warehouse_id` **MUST equal** `shipments.destination_warehouse_id`, and `warehouse_code` **MUST** be resolved by `destination_warehouse_id → warehouses.warehouse_id → warehouses.warehouse_code`.
> - **Identity resolution:** never use `warehouse_code`, `warehouse_name`, `destination` text, or address as the authoritative warehouse identity — always resolve via `warehouse_id` and validate company ownership (company-scoped identity — KM vs ResUS records are distinct even for the same physical AMZLGS facility).
> - **`shipment_direction` is NOT a user-entered column.** Direction (Inbound / Outbound / Transfer) is runtime-derived from origin/destination warehouse identities. Do not add `shipment_direction`, `warehouse_operation_type`, `expected_ship_date`, or `expected_arrival_date` — `shipments.etd` / `shipments.eta` are the canonical estimated departure / arrival.
> - Full canonical column list = task Section C / DATABASE_RELATIONSHIP_MAP.md; the rows below add the endpoint fields (older revisions of this table omitted them).

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| shipment_id | string | Yes | 系統 ID | PK |
| shipment_no | string | Yes | 人類可讀編號 | |
| shipping_plan_id | string | Yes | FK | → shipping_plans |
| reference_id | string | | 外部參考號 | |
| ship_from | string | | 出貨來源 snapshot | human-readable; NOT identity |
| origin_warehouse_id | string | | 出貨來源倉庫 identity (canonical) | → warehouses.warehouse_id |
| origin_type | string | | 來源端點類型 | origin endpoint type |
| destination | string | | 目的地 snapshot | human-readable; NOT identity |
| destination_warehouse_id | string | | 目的倉庫 identity (canonical) | → warehouses.warehouse_id |
| destination_type | string | | 目的地端點類型 | destination endpoint type |
| warehouse_id | string | | 目的倉庫 identity (transitional compat) | = destination_warehouse_id when populated |
| warehouse_code | string | | 目的倉庫 code snapshot (transitional compat) | derived from selected warehouses record; never free-typed |
| status | enum | Yes | 狀態 | planned, booking_requested, booked, factory_preparing, picked_up, departed, in_transit, customs_clearance, arrived, delivered, closed, delayed, cancelled |
| tracking_number | string | | 追蹤號 | |
| container_no | string | | 櫃號 | |
| bl_no | string | | 提單號 | |
| invoice_no | string | | 發票號 | |
| etd | date | | 預估出發 | |
| eta | date | | 預估抵達 | |
| actual_departure_date | date | | 實際出發 | |
| actual_arrival_date | date | | 實際抵達 | |
| customs_clearance_date | date | | 清關日期 | |
| delivered_date | date | | 送達日期 | |
| total_qty | number | | 總數量 | summary snapshot |
| total_cartons | number | | 總箱數 | summary snapshot |
| total_cbm | number | | 總材積 | summary snapshot |
| total_gross_weight | number | | 總毛重 | summary snapshot |
| total_net_weight | number | | 總淨重 | summary snapshot |
| freight_cost_actual | number | | 實際運費 | |
| duty_actual | number | | 實際關稅 | |
| currency | string | | 幣別 | |
| created_by | string | | 建立者 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### shipment_lines

#### Purpose
每票 shipment 的 SKU 明細。

#### Status
Active v1

#### Primary Key
`shipment_line_id`

#### Foreign Keys / Mapping
- `shipment_lines.shipment_id` → `shipments.shipment_id`
- `shipment_lines.sku` → `sku_details.sku`
- `shipment_lines.purchase_order_line_id` → `purchase_order_lines.purchase_order_line_id`

#### Important Notes
- 不存 `factory_name` / `po_no`。
- PO 關係透過 `purchase_order_line_id` 映射。
- `carton_no_start` / `carton_no_end` 用於支援 Amazon carton label sequence。
- 未來若要每箱級別資料，可新增 `shipment_cartons` 表。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| shipment_line_id | string | Yes | PK | |
| shipment_id | string | Yes | FK | → shipments |
| sku | string | Yes | SKU | → sku_details.sku |
| qty | number | Yes | 數量 | |
| carton_qty | number | | 箱數 | |
| carton_no_start | number | | 箱號起 | Amazon carton label |
| carton_no_end | number | | 箱號迄 | |
| units_per_carton | number | | 每箱數量 | |
| cbm | number | | 材積 | |
| gross_weight | number | | 毛重 | |
| net_weight | number | | 淨重 | |
| purchase_order_line_id | string | | FK | → purchase_order_lines |
| note | string | | 備註 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### carriers

#### Purpose
物流商主資料。

#### Status
Active v1

#### Primary Key
`carrier_id`

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| carrier_id | string | Yes | PK | |
| carrier_name | string | Yes | 物流商名稱 | |
| carrier_type | enum | Yes | 類型 | air, sea, truck, express, forwarder, warehouse |
| contact_name | string | | 聯絡人 | |
| contact_email | string | | Email | |
| contact_phone | string | | 電話 | |
| is_active | boolean | Yes | 是否啟用 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### carrier_rate_cards

#### Purpose
Carrier 報價 / 費率表。支援週更、手動匯入、有效期間。

#### Status
Active v1

#### Primary Key
`rate_card_id`

#### Foreign Keys / Mapping
- `carrier_rate_cards.carrier_id` → `carriers.carrier_id`

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| rate_card_id | string | Yes | PK | |
| carrier_id | string | Yes | FK | → carriers |
| origin_country | string | Yes | 起運國 | |
| origin_city | string | | 起運城市 | |
| destination_country | string | Yes | 目的國 | |
| destination_city | string | | 目的城市 | |
| marketplace | string | | 平台 | |
| shipping_method | string | Yes | 運輸方式 | |
| rate_type | enum | Yes | 計費方式 | per_kg, per_cbm, per_carton, per_shipment, fixed, tiered |
| currency | string | Yes | 幣別 | |
| unit_rate | number | Yes | 單價 | |
| min_charge | number | | 最低收費 | |
| fuel_surcharge | number | | 燃油附加費 | |
| customs_fee | number | | 報關費 | |
| doc_fee | number | | 文件費 | |
| effective_from | date | Yes | 生效日 | |
| effective_to | date | | 失效日 | |
| status | enum | Yes | 狀態 | active, expired, draft, archived |
| source_file_name | string | | 來源檔名 | |
| import_batch_id | string | | 匯入批次 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### carrier_lead_times

#### Purpose
物流 lead time 資料，用於未來 ETA 預估。

#### Status
Active schema, optional in first UI phase

#### Primary Key
`lead_time_id`

#### Foreign Keys / Mapping
- `carrier_lead_times.carrier_id` → `carriers.carrier_id`

#### Important Notes
- 可用於 ETD + avg_days → estimated ETA。
- 第一版若 ETA 由使用者手動填，這張表可先不接 UI。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| lead_time_id | string | Yes | PK | |
| carrier_id | string | Yes | FK | → carriers |
| origin_country | string | Yes | 起運國 | |
| destination_country | string | Yes | 目的國 | |
| shipping_method | string | Yes | 運輸方式 | |
| min_days | number | | 最短天數 | |
| max_days | number | | 最長天數 | |
| avg_days | number | | 平均天數 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### document_templates

#### Purpose
文件模板 metadata。模板檔案本身放在 Google Drive。

#### Status
Active v1

#### Primary Key
`template_id`

#### Foreign Keys / Mapping
- `document_templates.carrier_id` → `carriers.carrier_id`（可空白，代表通用模板）

#### Important Notes
- 這張表不是 generated file。
- 只記錄模板在哪裡、適用條件、版本、是否啟用。
- 模板實際檔案存在 Google Drive。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| template_id | string | Yes | PK | |
| template_name | string | Yes | 模板名稱 | |
| document_type | enum | Yes | 文件類型 | purchase_order, shipping_order, commercial_invoice, packing_list, factory_order, customs_declaration |
| carrier_id | string | | FK | 可空白=通用 |
| country | string | | 適用國家 | |
| marketplace | string | | 適用平台 | |
| language | string | | 語言 | |
| template_file_type | string | | 檔案格式 | google_doc, google_sheet, pdf |
| template_file_id | string | | Google Drive file ID | |
| template_drive_url | url | | Google Drive URL | |
| template_version | string | | 版本號 | |
| is_active | boolean | Yes | 是否啟用 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### generated_documents

#### Purpose
記錄每次由模板產生的文件。

#### Status
Active v1

#### Primary Key
`document_id`

#### Foreign Keys / Mapping
- `generated_documents.template_id` → `document_templates.template_id`
- `related_entity_type` + `related_entity_id` 指向 purchase_order / shipping_plan / shipment 等實體。

#### Important Notes
- 產出文件存 Google Drive。
- DB 只存 file_id / file_url / metadata。
- 下單模板、invoice、packing list、托單都應透過 document_templates + generated_documents 管理。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| document_id | string | Yes | PK | |
| template_id | string | Yes | FK | → document_templates |
| related_entity_type | enum | Yes | 關聯實體類型 | purchase_order, shipping_plan, shipment |
| related_entity_id | string | Yes | 關聯實體 ID | |
| document_type | string | | 文件類型 | |
| file_name | string | | 檔名 | |
| file_id | string | | Google Drive file ID | |
| file_url | url | | Google Drive URL | |
| generated_by | string | | 產生者 | |
| generated_at | datetime | | 產生時間 | |
| status | enum | | 狀態 | generated, reviewed, sent, archived, failed |
| note | string | | 備註 | |

---

### factory_stock

#### Purpose
工廠目前庫存值。

#### Status
Active v1

#### Primary Key
`factory_stock_id`

#### Foreign Keys / Mapping
- `factory_stock.sku` → `sku_details.sku`

#### Important Notes
- 不存 category / series，使用 sku join sku_details。
- **Inventory namespace (finalized 2026-07-21):** Factory balance columns are `fac_*` — `fac_current_stock` / `fac_reserved_stock` supersede `current_stock` / `reserved_stock` (see `DATABASE_RELATIONSHIP_MAP.md` Inventory Field Namespace Rule). Live header rename pending.
- `fac_current_stock` 是目前值。
- 所有增減原因都應寫入 `factory_stock_movements`。
- `factory_stock` 是 current state，`factory_stock_movements` 是 history ledger。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| factory_stock_id | string | Yes | PK | |
| sku | string | Yes | SKU | → sku_details.sku |
| company | string | | 公司 | |
| factory_name | string | Yes | 工廠名稱 | 侑鑫, 勝一... |
| fac_current_stock | number | Yes | 目前庫存 | canonical (was `current_stock`) |
| fac_reserved_stock | number | | 已保留庫存 | canonical (was `reserved_stock`) |
| created_at | datetime | | | |
| updated_at | datetime | | | |
| last_transaction_at | datetime | | 最後異動時間 | |

---

### factory_stock_movements

#### Purpose
工廠庫存異動紀錄。

#### Status
Active v1

#### Primary Key
`factory_stock_movement_id`

#### Foreign Keys / Mapping
- `factory_stock_movements.sku` → `sku_details.sku`

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| factory_stock_movement_id | string | Yes | PK | |
| sku | string | Yes | SKU | → sku_details.sku |
| factory_name | string | Yes | 工廠名稱 | |
| movement_type | enum | Yes | 異動類型 | initial_input, purchase_order_completed, shipment_deduct, manual_adjustment, damage_adjustment, return_adjustment, correction |
| qty | number | Yes | 異動數量 | 正=增, 負=減 |
| related_entity_type | enum | | 關聯實體類型 | purchase_order, shipment, manual_adjustment, system_import |
| related_entity_id | string | | 關聯實體 ID | |
| before_qty | number | | 異動前庫存 | |
| after_qty | number | | 異動後庫存 | |
| note | string | | 備註 | |
| created_by | string | | 建立者 | |
| created_at | datetime | Yes | 異動時間 | |

---

### purchase_orders

#### Purpose
向工廠下單的 PO 主表。

#### Status
Active v1

#### Primary Key
`purchase_order_id`

#### Important Notes
- Request Order = 向工廠下 PO / purchase order flow。
- Shipping Plan = 已有貨要出到海外站點 / shipment flow。
- 兩者不可混淆。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| purchase_order_id | string | Yes | PK | |
| po_no | string | Yes | PO 編號 | 人類可讀 |
| km_po_no | string | | KM 內部 PO 編號 | |
| factory_name | string | Yes | 工廠 | |
| supplier_name | string | | 供應商名稱 | |
| order_status | enum | Yes | 狀態 | draft, pending_approval, approved, submitted, confirmed, in_production, completed, partially_shipped, shipped, cancelled, rejected |
| order_date | date | | 下單日期 | |
| expected_completion_date | date | | 預計完工日 | |
| expected_ship_date | date | | 預計出貨日 | |
| submitted_by | string | | 提交者 | |
| submitted_at | datetime | | 提交時間 | |
| rejected_by | string | | 拒絕者 | |
| rejected_at | datetime | | 拒絕時間 | |
| rejected_reason | string | | 拒絕原因 | |
| created_by | string | | 建立者 | |
| created_at | datetime | | | |
| approved_by | string | | 核准者 | |
| approved_at | datetime | | 核准時間 | |
| note | string | | 備註 | |
| updated_at | datetime | | | |

---

### purchase_order_lines

#### Purpose
PO SKU 明細。

#### Status
Active v1

#### Primary Key
`purchase_order_line_id`

#### Foreign Keys / Mapping
- `purchase_order_lines.purchase_order_id` → `purchase_orders.purchase_order_id`
- `purchase_order_lines.sku` → `sku_details.sku`
- `shipment_lines.purchase_order_line_id` → `purchase_order_lines.purchase_order_line_id`
- `production_schedule.purchase_order_line_id` → `purchase_order_lines.purchase_order_line_id`

#### Important Notes
- 不存 `product_name`，使用 sku join sku_details。
- 若未來 PO 文件需要保留當時品名，可新增 `product_name_snapshot`，但目前 v1 不使用。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| purchase_order_line_id | string | Yes | PK | |
| purchase_order_id | string | Yes | FK | → purchase_orders |
| sku | string | Yes | SKU | → sku_details.sku |
| factory_item_no | string | | 工廠品號 | |
| ordered_qty | number | Yes | 訂購數量 | |
| carton_qty | number | | 箱數 | |
| units_per_carton | number | | 每箱數量 | |
| unit_cost | number | | 單位成本 | |
| currency | string | | 幣別 | |
| expected_completion_date | date | | 預計完工日 | |
| actual_completion_date | date | | 實際完工日 | |
| line_status | enum | | 狀態 | draft, confirmed, in_production, completed, partially_shipped, cancelled |
| note | string | | 備註 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### production_schedule

#### Purpose
工廠生產排程與完工追蹤。

#### Status
Active v1

#### Primary Key
`production_schedule_id`

#### Foreign Keys / Mapping
- `production_schedule.purchase_order_id` → `purchase_orders.purchase_order_id`
- `production_schedule.purchase_order_line_id` → `purchase_order_lines.purchase_order_line_id`

#### Important Notes
- `purchase_order_line_id` 是正式關聯來源。
- `factory_name` / `sku` 保留作為查詢 helper / snapshot，不是唯一資料來源。
- 可支援某月份預計完工 pcs、已完工 pcs、剩餘 pcs。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| production_schedule_id | string | Yes | PK | |
| purchase_order_id | string | Yes | FK | → purchase_orders |
| purchase_order_line_id | string | Yes | FK | → purchase_order_lines |
| factory_name | string | | 工廠（helper） | snapshot, not source |
| sku | string | | SKU（helper） | snapshot, not source |
| scheduled_month | string | | 排程月份 | YYYY-MM |
| scheduled_start_date | date | | 預計開始 | |
| scheduled_completion_date | date | | 預計完工 | |
| actual_completion_date | date | | 實際完工 | |
| planned_qty | number | Yes | 計畫數量 | |
| completed_qty | number | | 已完工數量 | |
| remaining_qty | number | | 剩餘數量 | |
| status | enum | | 狀態 | planned, in_progress, completed, delayed, partially_completed, cancelled |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

## Future Tables

---

### shipment_events

#### Purpose
未來 tracking event / shipment status history / map tracking 使用。

#### Status
Future table / Not active in v1 UI

#### Primary Key
`shipment_event_id`

#### Foreign Keys / Mapping
- `shipment_events.shipment_id` → `shipments.shipment_id`

#### Important Notes
- MVP 階段 shipment tracking 先使用 `shipments.status`。
- 未來狀態變更、carrier API tracking、map events 可自動寫入 shipment_events。
- 使用者不需要手動逐筆填 events。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| shipment_event_id | string | Yes | PK | |
| shipment_id | string | Yes | FK | → shipments |
| event_time | datetime | Yes | 事件時間 | |
| event_type | string | | 事件類型 | |
| event_status | string | | 事件狀態 | |
| location_name | string | | 地點名稱 | |
| country | string | | 國家 | |
| city | string | | 城市 | |
| latitude | number | | 緯度 | |
| longitude | number | | 經度 | |
| source | string | | 來源 | carrier_api, manual, system |
| note | string | | 備註 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

### shipment_routes

#### Purpose
未來 Shipping Overview 地圖視覺化使用，用於定義預計路線節點。

#### Status
Future table / Map tracking future phase

#### Primary Key
`shipment_route_id`

#### Foreign Keys / Mapping
- `shipment_routes.shipment_id` → `shipments.shipment_id`

#### Important Notes
- `shipment_routes` 是 planned route nodes。
- `shipment_events` 是 actual tracking / status event history。
- 第一版不接功能。

#### Columns

| Column | Type | Required | Description | Notes |
|--------|------|----------|-------------|-------|
| shipment_route_id | string | Yes | PK | |
| shipment_id | string | Yes | FK | → shipments |
| sequence_no | number | Yes | 順序 | |
| location_name | string | | 地點名稱 | |
| country | string | | 國家 | |
| city | string | | 城市 | |
| latitude | number | | 緯度 | |
| longitude | number | | 經度 | |
| transport_mode | string | | 運輸方式 | air, sea, truck |
| planned_arrival_date | date | | 預計到達 | |
| actual_arrival_date | date | | 實際到達 | |
| status | string | | 狀態 | |
| created_at | datetime | | | |
| updated_at | datetime | | | |

---

## Raw Report Tables — Not Final UI Tables

以下三張表保留 Amazon 原始報表資料，用於追溯、重新運算與未來 summary table 生成。
目前先不進一步定義 normalized layer，但標註 future action。

### amazon_daily_sales_raw

**Status:** Raw source table. Needs future normalized layer.

**Purpose:** Amazon daily sales 原始報表匯入。

**Future Action:** 建立 `daily_sales_summary` 或 clean adapter layer，將原始欄位轉為 BQ-friendly snake_case：
`report_date, country, marketplace, sku, sales_units, sales_amount, sessions, page_views, orders, return_units, import_batch_id, imported_at`

### amazon_inventory_raw

**Status:** Raw source table. Needs future normalized layer.

**Purpose:** Amazon inventory 原始報表匯入。

**Future Action:** 建立 `inventory_status_daily` 或 clean adapter layer，用於 Inventory Replenishment、stock status、days of supply 計算。

### amazon_inventory_health_raw

**Status:** Raw source table. Needs future normalized layer.

**Purpose:** Amazon inventory health / aging report 原始資料。

**Future Action:** 建立 `inventory_health_summary` 或 clean adapter layer，用於庫齡、滯銷、FBA 長期倉儲費風險。

---

## Relationship Map

```
sku_details
  → marketplace_skus
  → factory_stock
  → purchase_order_lines
  → shipping_plan_lines
  → shipment_lines

shipping_plans
  → shipping_plan_lines
  → shipments
      → shipment_lines
      → shipment_events (future)
      → shipment_routes (future)
  → generated_documents

purchase_orders
  → purchase_order_lines
      → production_schedule
      → shipment_lines (via purchase_order_line_id)
  → factory_stock_movements (via related_entity)
  → generated_documents

carriers
  → carrier_rate_cards
  → carrier_lead_times
  → shipping_plans (via carrier_id)
  → document_templates (via carrier_id)

document_templates
  → generated_documents
```

---

## v1 Readiness

此 schema 已可作為第一版 Google Sheet DB MVP 使用。

### v1 Can Support:

- ✅ Marketplace SKU mapping
- ✅ Shipping Plan creation and approval flow
- ✅ Create Shipment from Approved Shipping Plan
- ✅ Shipment detail tracking (manual status update)
- ✅ Carrier selection and estimated cost
- ✅ Actual freight / duty cost record
- ✅ Factory stock current value
- ✅ Factory stock movement ledger
- ✅ Purchase order and production schedule
- ✅ Document template selection
- ✅ Generated document record

### v1 Does Not Yet Fully Support:

- ❌ Real-time tracking API
- ❌ Shipment map route visualization
- ❌ shipment_events automation
- ❌ shipment_routes UI
- ❌ Normalized Amazon sales / inventory summary layer
- ❌ Full BigQuery migration
- ❌ Document generation engine implementation
- ❌ Carrier quote auto-sync
- ❌ Factory stock import automation

---

## Future Work / Not Yet Completed

1. **shipment_events first implementation**
   - Currently future table
   - Can be system-generated from status changes
   - Can later connect to carrier / Amazon tracking API

2. **shipment_routes for map visualization**
   - Future route node table
   - Used for airplane / ship / truck map UI

3. **Raw report normalized layer**
   - `amazon_daily_sales_raw` → `daily_sales_summary`
   - `amazon_inventory_raw` → `inventory_status_daily`
   - `amazon_inventory_health_raw` → `inventory_health_summary`

4. **Carrier quote update workflow**
   - Manual import or scheduled update
   - Update `carrier_rate_cards` with `import_batch_id`

5. **Document generation engine**
   - Read `document_templates`
   - Fill data from `purchase_orders` / `shipping_plans` / `shipments`
   - Generate Google Drive files
   - Write `generated_documents`

6. **BigQuery migration**
   - Keep snake_case
   - Preserve primary keys and relationships
   - Raw tables and summary tables should be separated

---

## Do Not Confuse These Concepts

### Request Order vs Shipping Plan

**Request Order / Purchase Order:**
- 向工廠下單
- 對應 `purchase_orders` / `purchase_order_lines` / `production_schedule`

**Shipping Plan:**
- 將已有貨物從工廠、倉庫或公司出貨到海外站點
- 對應 `shipping_plans` / `shipping_plan_lines`

### Shipping Plan vs Shipment

**Shipping Plan:**
- Plan and approval
- Estimated cost
- Carrier decision before shipment

**Shipment:**
- Actual shipment record
- Tracking / BL / invoice / ETA / actual arrival
- Actual freight and duty

### Template vs Generated Document

**document_templates:**
- Reusable template metadata

**generated_documents:**
- Actual file generated from template for a specific PO / shipment / shipping plan

### Factory Stock vs Factory Stock Movements

**factory_stock:**
- Current stock (what we have now)

**factory_stock_movements:**
- Why stock changed (history ledger)

---

**End of Document**
