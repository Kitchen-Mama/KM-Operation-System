# Kitchen Mama Operation System - System Roadmap

**Last Updated:** 2025-01-22
**Maintained By:** Development Team
**Document Purpose:** Development roadmap, priority order, and status tracking.

---

## Status Legend

| Status | Meaning |
|--------|---------|
| UI Completed | 前端頁面 UI 已完成 |
| DemoData Connected | 使用 demo-shared-data.js 展示資料 |
| Cloud Read Connected | 已接入 Google Sheet / API 讀取 |
| Cloud Write Enabled | 已支援雲端寫入 |
| Planned | 已規劃，尚未開始 |
| In Progress | 進行中 |
| Not Started | 尚未開始 |
| Needs Audit | 需要確認目前狀態 |

---

## Roadmap 注意事項

1. **DemoData ≠ 正式 DB。** `demo-shared-data.js` 只用於 Demo 展示，不是最終資料層。
2. **UI Completed ≠ Cloud Completed。** 頁面做完不代表資料庫已接入。
3. **Cloud Read ≠ Cloud Write。** 能讀 Google Sheet 不代表能寫入。
4. **Google Sheet DB 是 MVP bridge，不是最終正式 DB。** 未來可替換為正式 Backend API。
5. **API Layer 應保持可替換。** `operation-system-db-api.js` 設計為可從 Google Sheet 切換到正式 DB。
6. **HTML 模組化是高風險重構。** 需分頁逐步做，不應阻塞資料庫規劃。
7. **AI 必須等資料源穩定與歷史資料累積後再做。**
8. **Carrier / Cost / Marketplace SKU / Sales Data 會影響 DB 設計。** 應先規劃 schema，再大量做頁面功能。

---

## Page Status Overview

| Page | UI | DemoData | Cloud Read | Cloud Write | Notes |
|------|----|----------|------------|-------------|-------|
| Home | ✅ Completed | N/A | N/A | N/A | Static content |
| SKU Details | ✅ Completed | N/A | ✅ Completed | ✅ Lifecycle only | Google Sheet DB connected |
| SKU Handbook | ✅ Completed | N/A | ✅ Completed | Not Started | product_features fallback, no AI |
| Inventory Replenishment | ✅ Completed | ✅ Connected | Not Started | Not Started | DemoData only for demo |
| Factory Stock | ✅ Completed | ✅ Connected | Not Started | Not Started | DemoData only for demo |
| Forecast Review | ✅ Completed | ✅ Connected | Not Started | Not Started | DemoData only for demo |
| Request Order | ✅ Completed | ✅ Connected | Not Started | Not Started | DemoData only for demo |
| FC Summary | ✅ Completed | ✅ Connected | Not Started | Not Started | DemoData only for demo |
| Shipping Plan | ✅ Completed | Not Started | Not Started | Not Started | sessionStorage data |
| Shipment Overview | ✅ Completed | Not Started | Not Started | Not Started | Placeholder |
| Supply Chain Canvas | ✅ Completed | N/A | N/A | N/A | Standalone canvas tool |
| Promotion Risk Tracker | ✅ Completed | Needs Audit | Needs Audit | Not Started | localStorage mock, DB migration pending |
| Campaign Overview | Needs Audit | Not Started | Not Started | Not Started | Gantt UI may exist, DB pending |
| Campaign Detail | Needs Audit | Not Started | Not Started | Not Started | UI status unclear |

---

## Development Stages

### Stage 1: Foundation & Core UI ✅ Completed

- ✅ Single-page application structure
- ✅ Sidebar navigation with parent/child menus
- ✅ 10+ page sections
- ✅ Dual-layer table component
- ✅ Multi-header table component
- ✅ World time bar
- ✅ Homepage dashboard
- ✅ Design system (base.css, components.css, layout.css)

### Stage 2: Core System & Pages ✅ Completed

- ✅ Core Namespace / Lifecycle / State management
- ✅ SKU Details page
- ✅ Inventory Replenishment page
- ✅ Factory Stock page
- ✅ Forecast Review page
- ✅ Request Order page
- ✅ FC Summary page
- ✅ Shipping Plan page
- ✅ Shipping History page
- ✅ Supply Chain Canvas

### Stage 3: Training Center & Campaign ✅ Completed (UI)

- ✅ Training Center sidebar category
- ✅ SKU Handbook page (with product_features integration)
- ✅ Promotion Risk Tracker (localStorage-based)
- ✅ Campaign Performance category (partial)

### Stage 3.5: Data Foundation Planning 🚧 In Progress

目的：在全面雲端化前，定義影響多頁面的基礎資料表。

#### 3.5-1 Marketplace SKU Database

**Status:** Planned / Schema Design

**Purpose:** 定義每個 country + marketplace 實際販售的 SKU。

**Planned Table:** `marketplace_skus`

**Possible Fields:**
```
marketplace_sku_id, sku, country, marketplace, site_sku, asin,
marketplace_sku_status, replenishment_model, launch_date,
created_at, updated_at

marketplace_sku_status values: active, phasing_out, inactive, discontinued
replenishment_model values: sales_driven, forecast_driven
```

**Notes:**
- `marketplace_sku_status` = operational marketplace SKU status (active / phasing_out / inactive / discontinued).
- Pricing fields (currency, regular_price, minimum_price, msrp) are intentionally NOT stored here. Pricing lives in `pricing_list` (see 3.5-X Pricing Database). Source of truth: `SKU_MASTER_FLOW.md`.

**Dependencies:** sku_details

**Affects:**
- Inventory Replenishment
- Promotion Risk Tracker
- Campaign Overview / Detail
- Sales Data join
- Forecast

#### 3.5-1b Pricing Database

**Status:** Planned / Schema Design

**Source of Truth:** `SKU_MASTER_FLOW.md`

**Purpose:** 建立單一權威定價層，與 `marketplace_skus` 分離。

**Planned Tables:** `pricing_list`, `pricing_change_log`

**Core Rules:**
- `pricing_list` is the only source of truth for Regular Price / Minimum Price / MSRP / Currency.
- `marketplace_skus` must NOT store pricing.
- Any page requiring pricing data must read from `pricing_list`.
- `pricing_change_log` records all pricing changes (field-level audit).

**Dependencies:** marketplace_skus (via marketplace_sku_id)

**Affects:**
- Inventory Replenishment
- Promotion Risk Tracker
- Campaign Overview / Detail
- Request Order
- Cost & Pricing analysis

**Future Promotion Pricing:** time-bounded promotion pricing should use `pricing_campaigns` or `promotion_prices` — NOT `effective_from` / `effective_to` columns in `pricing_list`.

#### 3.5-2 Sales Data Database

**Status:** Waiting for report schema

**Purpose:** 建立固定報表匯入後的 raw data 與 clean summary data。

**Planned Tables:** `daily_sales_raw`, `daily_sales_summary`

**Note:** 欄位需等實際固定報表欄位確認後再設計。

**Affects:**
- Forecast Review
- Campaign Performance / Detail
- Promotion Risk
- AI prediction (future)

#### 3.5-3 Carrier Database

**Status:** Schema Planning

**Purpose:** 建立 carrier 主資料、費率、路線、Lead Time、歷史表現。

**Planned Tables:**
```
carriers
carrier_routes
carrier_rate_cards
carrier_lead_times
carrier_performance_history
```

**Affects:**
- Shipping Plan
- Shipping Management
- Request Order
- 文件生成中心
- 成本定價分析表

#### 3.5-4 Cost & Pricing Database

**Status:** Schema Planning

**Purpose:** 建立 SKU 成本結構、平台費、運費、關稅、毛利與定價模擬基礎。

**Scope note:** This database covers cost, margin, landed cost, scenarios, and pricing simulation only. It does NOT own effective selling prices. Effective selling prices (Regular Price / Minimum Price / MSRP / Currency) live in `pricing_list` (see 3.5-1b Pricing Database). This is a simulation layer built on top of `pricing_list`.

**Planned Tables:**
```
sku_costs
landed_costs
platform_fee_rules
pricing_scenarios
margin_history
```

**Affects:**
- 成本定價分析表
- Promotion Risk Tracker
- Campaign Performance
- Request Order
- AI recommendation (future)

---

### Stage 4: Cloud Integration & Data Layer 🚧 Partially In Progress

#### Phase 4-1: Current Google Sheet DB Bridge

**Status:** Partially Completed

**Completed:**
- ✅ sku_details read
- ✅ product_features read
- ✅ sku_handbook_summaries read (empty, fallback working)
- ✅ campaigns read (debug only)
- ✅ campaign_sku_lines read (debug only)
- ✅ SKU Details cloud read
- ✅ SKU Handbook cloud read
- ✅ SKU lifecycle write-back (single field)
- ✅ Cache busting + no-store fetch
- ✅ Mock fallback preserved
- ✅ Debug/audit tools

**Not Completed:**
- ❌ Add SKU cloud write
- ❌ Bulk import cloud write (preview only)
- ❌ product_features edit/write
- ❌ sku_handbook_summaries write
- ❌ Promotion / Campaign cloud write

#### Phase 4-2: API Layer Abstraction

**Status:** Planned

**Content:**
- core/api.js unified request layer
- local / demo / cloud mode support
- Error handling & retry
- Request caching strategy
- Rate limiting awareness

#### Phase 4-3: Operational Data Cloud Migration

**Status:** Planned

**Content:**
- marketplace_skus cloud table
- Inventory data cloud source
- Factory stock cloud source
  - On SKU creation, Factory Stock may optionally create an initialization row with current_stock default = 0. Initialization is optional, not mandatory.
- Forecast data cloud source
- Request order data cloud source
  - Request Order uses dynamic SKU sourcing — no placeholder rows. SKU universe is read at runtime from marketplace_skus, joined with forecast and inventory data. Records are created only when an actual order/request is generated.
- FC summary cloud source

**Prerequisite:** Stage 3.5 schema planning complete

#### Phase 4-4: Promotion / Campaign DB Migration

**Status:** Planned / Needs Audit

**Content:**
- campaigns table full integration
- campaign_sku_lines table full integration
- Promotion Risk Tracker data source migration
- Add Promotion cloud write
- Delete Promotion cloud write
- Campaign Overview DB migration
- Campaign Detail DB migration

#### Phase 4-5: Carrier & Cost Foundation

**Status:** Schema Planning

**Content:**
- Carrier Database implementation
- Cost & Pricing Analysis Database
- Shipping cost calculation engine

---

### Stage 5: AI Integration ⏳ Future

**Prerequisites (must be stable before AI):**
1. SKU Details / product_features stable
2. marketplace_skus exists
3. Sales Data raw / summary exists
4. Campaign performance data exists
5. Enough historical data accumulated

**Planned Features:**
- AI summary generation → sku_handbook_summaries
- Human review flow (review_status: ai_draft → reviewed)
- AI-powered demand forecasting
- AI chatbot / RAG for product knowledge
- AI recommendation engine

---

### Stage 6: Advanced Features ⏳ Future

- HTML 模組化 (high-risk refactor, do incrementally)
- Virtual scrolling for large tables
- Lazy loading page scripts
- User authentication & permissions
- Multi-language support (full i18n)
- Mobile responsive optimization
- Document generation center
- Shipping management full workflow

---

## Short-term Priority (Demo + Data Foundation)

1. DemoData Visual QA across all 5 demo pages
2. Promotion Risk Tracker data source audit
3. marketplace_skus DB schema planning
4. Sales Data raw / summary schema planning
5. Carrier Database schema planning
6. Cost & Pricing Analysis schema planning
7. Campaign / Promotion DB source confirmation
8. Add / Delete Promotion cloud write planning

## Mid-term Priority (Cloud Migration)

1. Add SKU cloud write MVP
2. Bulk import cloud write with preview/confirmation
3. marketplace_skus table creation
4. Inventory / Factory / Forecast cloud read migration
5. Promotion Risk Tracker cloud migration
6. HTML 模組化 (incremental, page by page)

## Long-term Priority (AI & Scale)

1. Sales Data pipeline
2. AI summary generation
3. AI demand forecasting
4. Full i18n
5. Document generation
6. Performance optimization

---

## Dependency Graph

```
Data Foundation Planning (Stage 3.5)
    ↓
Google Sheet / API Bridge (Stage 4-1) ← PARTIALLY DONE
    ↓
Marketplace SKU + Sales Data Schema (Stage 4-3)
    ↓
Promotion / Campaign DB Migration (Stage 4-4)
    ↓
Carrier DB + Cost DB (Stage 4-5)
    ↓
Document Generation (Stage 6)
    ↓
AI Integration (Stage 5)

[Parallel] HTML Modularization (Stage 6)
    → Does NOT block DB/API work
    → High-risk, do incrementally
```

---

## Demo Shared Data Layer

**File:** `assets/js/utils/demo-shared-data.js`

**Status:** Completed (demo visualization only)

**Coverage:**
- 12 demo SKUs
- Inventory Replenishment ✅
- Factory Stock ✅
- Forecast Review ✅
- Request Order ✅
- FC Summary ✅
- Consistency Audit: PASS

**Important:**
> Demo Shared Data Layer is for demo visualization only.
> It must not be treated as the final database layer.
> Each page must eventually migrate to Cloud Read from proper DB tables.

---

**End of Document**


---

## UI / Table Standardization

**Status:** Partially Started

### Completed:
- ✅ Inventory Replenishment table layout polish
- ✅ Header/body scroll sync fix
- ✅ Data-heavy table visual standard defined (in `TableTemplate_ScrollXY_Standard.md`)
- ✅ Anti-patterns documented
- ✅ Recommended pattern documented
- ✅ Table category strategy defined: Raw Data Table vs User Operation Table
- ✅ Shared SKU Column Standard defined
- ✅ Raw Data Table cell padding standard defined (`8px 12px` / `6px 10px` compact)
- ✅ Image Column Standard for Raw Data Tables defined (64px separate column)
- ✅ Factory Stock aligned to Raw Data Table Visual Baseline
- ✅ FC Summary aligned to Raw Data Table Visual Baseline
- ✅ SKU Details aligned to Raw Data Table Visual Baseline
- ✅ Promotion Risk Tracker aligned to Raw Data Table Visual Baseline
- ✅ Shipping History inner SKU Details table aligned to Raw Data child table baseline

### Not Completed:
- ❌ Apply same standard to Shipping Plan table
- ❌ Apply same standard to Shipment Overview table
- ❌ Apply same standard to Promotion / Campaign tables
- ❌ Apply Shared SKU Column Standard to Request Order
- ❌ Apply Shared SKU Column Standard to future Shipping Plan / Shipment tables
- ❌ Build reusable table component or shared CSS tokens

**Note:** This is "standard defined / first page validated" — not a full system-wide completion.

---

## UI / Filter & Button Design System

**Status:** Partially Started

### Completed:
- ✅ Filter/Button design standard defined (`FILTER_BUTTON_DESIGN_STANDARD.md`)
- ✅ Brand color tokens added to `base.css`
- ✅ UI semantic color tokens added
- ✅ Filter UI tokens added
- ✅ Button UI tokens added
- ✅ Cascading filter guidance documented
- ✅ Inventory Replenishment filter/button aligned
- ✅ Shipping History filter/button aligned
- ✅ Filter Dropdown Option Standard defined
- ✅ FC Summary dropdown options aligned to Factory Stock baseline
- ✅ Checked State Standard defined (accent-color: --km-brand-teal)
- ✅ Shipping History Country/Method converted to checkbox dropdown
- ✅ Promotion Risk Tracker filter/button aligned
- ✅ SKU Handbook filter/button aligned
- ✅ Pill Filter Variant documented
- ✅ Request Order checkbox accent-color aligned
- ✅ Forecast Review checkbox accent-color aligned
- ✅ Promotion Risk Tracker Category/Series converted to checkbox dropdown
- ✅ SKU Handbook Product Line/Brand/Lifecycle converted to checkbox dropdown
- ✅ SKU Handbook lifecycle filter value/source alignment fixed
- ✅ Promotion Risk Tracker checkbox selected-state sync fixed
- ✅ Forecast Review cumulative goal demo-off cleanup
- ✅ Promotion Risk Tracker demo-off cleanup
- ✅ Inventory Replenishment modal horizontal overflow fixed
- ✅ FILTER_OPTION_SOURCE_AUDIT.md created
- ✅ INVENTORY_MARKETPLACE_SKU_FLOW_AUDIT.md created

### Not Completed:
- ❌ Apply button semantic colors to SKU Details toolbar
- ❌ Apply button semantic colors to FC Summary actions
- ❌ Build reusable filter/button component
- ❌ marketplace_skus Google Sheet tab creation + read API
- ❌ Inventory Replenishment Country/Marketplace linked filters
- ❌ Add SKU write to marketplace_skus
- ❌ FC Summary: Auto-create FC Summary base row with Jan–Dec forecast initialized to 0.
