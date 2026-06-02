# Kitchen Mama Operation System - Project Current State

**Last Updated:** 2025-01-21
**Maintained By:** Development Team
**Document Purpose:** Single source of truth for current system state, data architecture, and development roadmap.

---

## 1. System Positioning

Kitchen Mama Operation System 目前正在從 **本地 mock-data driven system**，逐步升級為 **Google Sheet DB driven internal operation and training system**。

| Component | Role | Status |
|-----------|------|--------|
| **Google Sheet** | Temporary cloud database | Active |
| **Apps Script Web App** | API bridge (read + limited write) | Active |
| **Operation System** | Frontend application (SPA) | Active |

未來可轉移至正式 backend API + Cloud DB（BigQuery / PostgreSQL / Supabase 等）。

---

## 2. Google Sheet DB Tabs

| Tab | Status | Used By | Write Support |
|-----|--------|---------|---------------|
| `sku_details` | ✅ Active / connected | SKU Details, SKU Handbook | lifecycle only |
| `product_features` | ✅ Active / connected | SKU Handbook | ❌ Read only |
| `sku_handbook_summaries` | ✅ Connected but empty | SKU Handbook (fallback) | ❌ Not yet |
| `campaigns` | 🔧 Debug only | debugOperationDb() | ❌ Not yet |
| `campaign_sku_lines` | 🔧 Debug only | debugOperationDb() | ❌ Not yet |

---

## 3. Google Sheet Schemas

### 3.1 sku_details

```
sku
product_name
category
series
lifecycle
image_url
gs1_code
gs1_type
amz_asin
item_dimensions
item_weight
package_dimensions
package_weight
carton_dimensions
carton_weight
units_per_carton
hscode
declared_value
minimum_price
msrp
selling_price
pm
created_at
updated_at
```

**Notes:**
- `category = "Selling Material"` → 包材 / 備品 / 銷售物料 / internal operational reference 類 SKU
- `lifecycle` valid values: `Upcoming SKU`, `Running in the Market`, `Phasing Out`, `Closure`, `Other`

### 3.2 product_features

```
feature_id
scope_type
scope_id
country
marketplace
language
product_title
product_description
bullet_point_1
bullet_point_2
bullet_point_3
bullet_point_4
bullet_point_5
bullet_point_6
bullet_point_7
generic_keyword
created_at
updated_at
```

**Notes:**
- 不是即時 listing truth。
- 是 internal training / future AI knowledge reference。
- 目前 SKU Handbook 使用其 `product_description` 與 `bullet_points` 作為 fallback summary/key points。
- `scope_type`: `sku` | `series` | `category`
- `scope_id`: 對應的 SKU / Series code / Category name

### 3.3 sku_handbook_summaries

```
summary_id
sku
summary_type
summary_text
generated_from
review_status
reviewed_by
updated_at
```

**Notes:**
- 目前為空表。
- 未來用於儲存 AI 或人工整理的 employee-friendly summary。
- 空白時 SKU Handbook fallback 到 product_features。

### 3.4 campaigns

```
campaign_id, campaign_name, country, marketplace, promotion_type, major_event_flag, year, start_date, end_date, duration, status, event_reporting_fee, commission, total_sales_amount, total_sales_units, total_ad_cost, total_acos, source, created_at, updated_at, performance_sync_status, performance_synced_at
```

### 3.5 campaign_sku_lines

```
campaign_sku_line_id, campaign_id, sku, promo_price, regular_price, discount_percent, special_condition, lps, line_status, sales_amount, sales_units, impressions, sessions, clicks, ad_cost, ctr, cvr, acos, source, created_at, updated_at, performance_source, performance_updated_at
```

---

## 4. API Architecture

### 4.1 Frontend API Adapter

**File:** `assets/js/api/operation-system-db-api.js`

Responsibilities:
- Google Sheet API fetch (with `_ts` cache busting + `cache: 'no-store'`)
- Mock data fallback
- Normalize all 5 tabs
- `buildSkuKnowledgeItems()` — merge sku_details + product_features + summaries
- `getProductFeatureForSku()` — scope matching (sku → series → category)
- `updateSkuLifecycleInSheet()` — POST lifecycle change
- Debug/audit helpers

**Public Interface:**
```
window.KM.DB.loadOperationDb({ force })
window.KM.DB.getSkuDetails()
window.KM.DB.getProductFeatures()
window.KM.DB.getSkuHandbookSummaries()
window.KM.DB.getSkuKnowledgeItems()
window.KM.DB.getCampaigns()
window.KM.DB.getCampaignSkuLines()
window.KM.DB.getDataSourceMode()
window.KM.DB.isCloudWriteEnabled()
window.KM.DB.updateSkuLifecycle(sku, lifecycle)
```

**Rule:** All Google Sheet API logic must be in `operation-system-db-api.js`. Do not put fetch calls in page JS files.

### 4.2 Apps Script Web App

**File (reference):** `assets/specs/active/apps-script-web-app.gs`

**doGet actions:**
| Action | Description |
|--------|-------------|
| `getOperationDb` | Returns all 5 tabs |
| `getTable&table=xxx` | Returns single tab |

**doPost actions:**
| Action | Description |
|--------|-------------|
| `updateSkuLifecycle` | Updates lifecycle + updated_at for one SKU |

**Not supported yet:**
- Add SKU
- Bulk import/upsert
- Update full SKU details
- Update product_features
- Update sku_handbook_summaries
- Delete SKU

**Deployment note:**
- 修改 Google Sheet 資料 → 不需要重新部署
- 修改 Apps Script code → 需要 New version + Deploy

---

## 5. SKU Details Page

### Current State

| Feature | Status |
|---------|--------|
| Read from Google Sheet DB | ✅ via KM.DB.getSkuDetails() |
| Mock fallback | ✅ Preserved |
| Lifecycle dropdown | ✅ Connected to KM.DB.updateSkuLifecycle() |
| Cloud write (lifecycle) | ✅ Google Sheet mode |
| Local write (lifecycle) | ✅ Mock mode → localStorage |
| Reload after update | ✅ force: true |
| Closure section | ✅ Added |
| Unit toggle (CM/KG ↔ IN/LB) | ✅ Label + value conversion |

### Toolbar Buttons

| Button | Status | Description |
|--------|--------|-------------|
| + Add SKU | ⚠️ Placeholder | Not cloud-write ready |
| Export Template | ✅ Cloud-schema compatible | Uses KM.DB, outputs sku_details schema |
| Import Template | ⚠️ Validation + preview only | No cloud write-back |
| Refresh DB | ✅ Connected | Calls reloadOperationDb({ force: true }) |
| CM/KG ↔ IN/LB | ✅ Working | Converts dimension/weight values |
| Display ▼ | ✅ Working | Column visibility toggle |

### localStorage Override Behavior

- `km_sku_lifecycle_overrides_v1` — only overrides `lifecycle`
- `km_sku_image_overrides_v1` — only overrides `image`
- **Does NOT override** productName, category, series, price, dimensions, etc.
- Google Sheet mode: lifecycle write clears localStorage override for that SKU

---

## 6. SKU Handbook Page

### Current State

| Feature | Status |
|---------|--------|
| Data source | KM.DB.getSkuKnowledgeItems() |
| product_features match | sku → series → category priority |
| Fallback when summaries empty | ✅ product_features.product_description |
| displaySummary source tracking | ✅ summarySource field |
| displayKeyPoints source tracking | ✅ keyPointsSource field |
| Selling Material handling | ✅ Badge + warning + no consumer framing |
| Data Mode badge | ✅ Shows Google Sheet / Mock |
| Search | ✅ Includes product_features content |

### Detail Modal Structure

| Section | Content |
|---------|---------|
| A. Header | Image, Name, SKU, Badges (lifecycle, category, series, selling material) |
| B. Employee-Friendly Summary | displaySummary + source label |
| C. Key Features | displayKeyPoints (max 5) + source label |
| D. Basic Product Info | 21 fields with — for empty |
| E. Raw Reference Content | Collapsible. Product Title / Description / Bullets / Generic Keyword |

---

## 7. Debug / Audit Helpers

| Command | Purpose |
|---------|---------|
| `debugOperationDb()` | Table counts, mode, timestamps, language distribution |
| `debugSkuById('CO1100-R')` | Full SKU trace: normalized data, overrides, PF match, summary source |
| `reloadOperationDb({ force: true })` | Force fresh fetch + re-render |
| `testUpdateSkuLifecycle(sku, lc)` | Test cloud lifecycle write |
| `auditSkuHandbookData()` | Full data health audit (coverage, duplicates, missing content) |
| `debugSkuTemplateTools()` | Export/Import schema check |
| `resetSkuHandbookOverrides()` | Clear all localStorage overrides |

---

## 8. What Is NOT Completed

| Feature | Status | Notes |
|---------|--------|-------|
| Add SKU cloud write | ❌ Not implemented | Placeholder UI only |
| Bulk Import cloud write | ❌ Not implemented | Preview/validation only |
| `upsertSkuDetailsBulk` Apps Script action | ❌ Not implemented | |
| Full SKU edit cloud write | ❌ Not implemented | |
| image_url edit cloud write | ❌ Not implemented | |
| product_features edit UI | ❌ Not implemented | |
| sku_handbook_summaries write-back | ❌ Not implemented | |
| AI summary generation | ❌ Not planned this phase | |
| AI chatbot / RAG | ❌ Not planned this phase | |
| 完整 i18n 中英文切換 | ❌ Partial code exists, no i18n module | |
| product_features language filtering | ❌ Not implemented | |
| Promotion Risk Tracker DB migration | ❌ campaigns/lines connected for debug only | |
| Campaign Overview DB migration | ❌ Not started | |
| Campaign Details DB migration | ❌ Not started | |

---

## 9. Next Phase Roadmap

### Phase 1: Stabilize Current DB-Driven SKU System
1. Run `auditSkuHandbookData()` and clean data issues
2. Verify SKU Details display with all 190 SKUs
3. Verify SKU Handbook display and product_features matching
4. Verify lifecycle write-back end-to-end
5. Fill missing product_features for uncovered series/categories

### Phase 2: Add Small Cloud Write Features
1. Add SKU single-row cloud write MVP
2. image_url update MVP
3. Limited SKU field edit MVP (product_name, category, series)

### Phase 3: Bulk Import
1. Add Apps Script `doPost action=upsertSkuDetailsBulk`
2. Import preview → confirmation flow
3. Bulk write result report
4. `reloadOperationDb` after write

### Phase 4: Product Knowledge Management
1. product_features edit UI
2. sku_handbook_summaries manual edit / review
3. Language filtering in getProductFeatureForSku
4. i18n module implementation

### Phase 5: AI Integration
1. AI summary generation (OpenAI or similar)
2. Write summaries to sku_handbook_summaries
3. Human review flow (review_status: ai_draft → reviewed)
4. AI chatbot / RAG for product knowledge

### Phase 6: Campaign / Promotion DB Migration
1. campaigns and campaign_sku_lines read integration into Promotion Risk Tracker
2. Campaign Overview / Gantt DB migration
3. Campaign Details performance view
4. Campaign cloud write-back

---

## 10. Architecture Rules

1. Always inspect existing architecture before making changes.
2. Reuse existing `KM.DB` data layer.
3. Do not create duplicate data loaders.
4. Do not bypass `operation-system-db-api.js` for Google Sheet data.
5. Do not modify unrelated pages.
6. Do not introduce new patterns unless necessary.
7. Prefer minimal, safe, incremental changes.
8. Cloud write features must have validation, preview/confirmation, and error handling.
9. localStorage override must never overwrite full Google Sheet records.
10. Google Sheet schema changes must be explicitly approved.
11. AI features must wait until data source and UI are stable.
12. Mock fallback must remain available.
13. All normalize functions must use `String()` wrapper for safety (Google Sheet may return numbers).
14. Fetch calls must include `_ts` cache busting and `cache: 'no-store'`.

---

## 11. File Structure (Key Files)

```
assets/
├── js/
│   ├── api/
│   │   └── operation-system-db-api.js    ← Google Sheet API adapter (ALL DB logic here)
│   ├── core/
│   │   ├── namespace.js
│   │   ├── lifecycle.js
│   │   └── state.js
│   ├── utils/
│   │   ├── data.js                       ← Mock data + DataRepo (legacy)
│   │   ├── sku-overrides.js              ← localStorage overrides + CSV export/import
│   │   ├── scroll-sync.js
│   │   └── forecast-engine.js
│   ├── pages/
│   │   ├── sku-details.js
│   │   ├── sku-handbook.js
│   │   ├── inventory-replenishment.js
│   │   ├── factory-stock.js
│   │   ├── fc-summary.js
│   │   ├── forecast.js
│   │   ├── request-order.js
│   │   ├── shipping-plan.js
│   │   ├── shipping-history.js
│   │   ├── supplychain.js
│   │   ├── campaign-risk.js
│   │   └── home.js
│   └── app.js                            ← Global nav + initialization
├── css/
│   ├── base.css
│   ├── components.css
│   ├── layout.css
│   └── pages/
│       ├── sku-details.css
│       ├── sku-handbook.css
│       ├── supply-chain-canvas.css
│       └── ... (other page CSS)
├── specs/
│   └── active/
│       └── apps-script-web-app.gs        ← Apps Script source reference
└── img/
    └── products/                          ← Product images (local)
```

---

## 12. Configuration

### Google Sheet API URL

**File:** `assets/js/api/operation-system-db-api.js` line 6

```javascript
const OP_DB_API_BASE_URL = 'https://script.google.com/macros/s/AKfycb.../exec';
```

- Must be `/exec` URL (not `/dev`)
- If set to `'PASTE_WEB_APP_EXEC_URL_HERE'` → system uses mock fallback
- If API fails → system uses mock fallback with console warning

---

**End of Document**
