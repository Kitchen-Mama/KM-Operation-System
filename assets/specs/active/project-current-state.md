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
product_name_cn
product_use
pm
created_at
updated_at
```

> **2026-07 customs fields:** `product_name_cn` (Chinese customs/product name) + `product_use` (customs-facing usage). Both nullable; editable on SKU Details (persisted via `upsertSkuDetail`); API exposes `productNameCn` / `productUse`.

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


---

## Inventory Replenishment — Table Layout Polish (2026-06)

**Status:** Completed

**What was fixed:**
- Right-side fake green header region removed.
- Root cause: `.table-header-bar` used `background: var(--table-header-bg)` (green) which filled the entire flex container width. Changed to neutral `#f5f5f5`.
- Header / data horizontal scroll sync fixed (selector was targeting wrong scroll-col).
- `padding-right: 40px` removed from scroll-header and scroll-row.

**What was NOT changed:**
- No data logic changes.
- DemoData mode unaffected.
- Submit Plan / Shipping Plan push unaffected.
- No other pages modified.

**Note:**
This page now serves as the **first validated example** of the Operation System User Operation Table layout standard (defined in `TableTemplate_ScrollXY_Standard.md`).


---

## Shipment / Inventory / PO / Carrier DB Schema v1

- **Reference file:** `assets/specs/active/SHIPMENT_DATABASE_SCHEMA.md`
- **Status:** v1 schema ready for first Google Sheet DB integration phase
- **Includes:** shipping_plans, shipping_plan_lines, shipments, shipment_lines, carriers, carrier_rate_cards, carrier_lead_times, document_templates, generated_documents, factory_stock, factory_stock_movements, purchase_orders, purchase_order_lines, production_schedule, marketplace_skus
- **Future tables:** shipment_events, shipment_routes
- **Raw report tables:** amazon_daily_sales_raw, amazon_inventory_raw, amazon_inventory_health_raw (normalized layer is future work)
- **Note:** Full field details in SHIPMENT_DATABASE_SCHEMA.md. Do not duplicate schema here.


---

## Table UI Standardization Current State (2026-06)

- Inventory Replenishment is the first validated **User Operation Table** layout.
- **Raw Data Table** standard is now defined but not yet applied system-wide.
- **User Operation Table** standard is now defined but not yet applied system-wide.
- **Shared SKU Column Standard** is defined and should be applied in future table cleanup.
- **Table Category Strategy** (Raw Data vs User Operation) is documented in `TableTemplate_ScrollXY_Standard.md`.
- No system-wide table refactor has been completed yet.


---

## Raw Data Table Baseline Alignment (2026-06)

- Raw Data Table baseline now includes standardized header/body padding (`8px 12px`) and image-column guidance (64px separate column).
- Factory Stock, FC Summary, and SKU Details are the first pages aligned to this baseline.
- Compact numeric columns (month/weight/percentage) use `6px 10px` padding.
- Header text uses `nowrap` + `ellipsis` to prevent visual overflow.
- All three pages use neutral `#f8f9fa` header background (no colored header bar extending right).


---

## Promotion Risk Tracker — Raw Data Table Alignment (2026-06)

- Promotion Risk Tracker now follows Raw Data Table rule: sticky SKU column only (120px), Image column belongs to scrollable data area (64px).
- Image was previously inside the fixed SKU column alongside the SKU text; now separated into its own scroll-cell.
- Header/body columns aligned: Image, Product Name, 90-Day Promo, Future Promo, Annual Events, LPS, Risk Level, Total Promos.
- Neutral `#f8f9fa` header background applied.
- Risk cards, filters, Add/Delete Promotion, and pagination are unaffected.


---

## Shipping History Inner SKU Details Table (2026-06)

- Shipping History inner SKU Details table now follows Raw Data child table baseline.
- SKU column: 120px / min-width 110px, font-weight 600, nowrap + ellipsis.
- Numeric columns (Quantity, Cartons): right-aligned, compact 100px.
- Header: neutral `#f8f9fa` background, `8px 12px` padding, 12px font-size.
- Body: white background, `8px 12px` padding, 13px font-size.
- Outer Shipping History search UI, expand/collapse, and summary footer remain unchanged.


---

## Filter & Button UI Standard (2026-06)

- `FILTER_BUTTON_DESIGN_STANDARD.md` created as source of truth for filter/button design.
- Brand color tokens added to `base.css` (`:root` block): `--km-brand-red`, `--km-brand-teal`, `--km-brand-blue`, `--km-brand-yellow`, `--km-brand-purple`, `--km-brand-black`.
- UI semantic tokens added: `--km-ui-success`, `--km-ui-danger`, `--km-ui-warning`, `--km-ui-info`, `--km-ui-utility`.
- Filter tokens added: `--km-filter-bg`, `--km-filter-surface`, `--km-filter-border`, `--km-filter-text`, `--km-filter-muted`, `--km-filter-radius`, `--km-filter-height`.
- Button tokens added: `--km-button-radius`, `--km-button-height`, `--km-button-padding-x`.
- Filter template and button semantic color rules defined.
- Cascading filter guidance documented (recommend Strategy B for future).
- **Not yet applied system-wide.**
- Pages pending alignment: Inventory Replenishment, Shipping History, Promotion Risk Tracker, SKU Handbook, SKU Details toolbar.


---

## Inventory Replenishment Filter & Button Alignment (2026-06)

- Filter area restructured from compact toolbar to Primary Filter Template (label-on-top + filter-group).
- Country / Marketplace / LTS Filter / Target Days now each have visible label above control.
- Action buttons (Submit Plan, Add SKU, Add Marketplace) separated to right-side action area.
- All controls use `--km-filter-*` tokens; buttons use `--km-button-*` tokens.
- Demo badge uses `--km-ui-utility` (purple).
- HTML structure changed: added `.replen-filters`, `.replen-filter-group`, `.replen-actions`, `.replen-btn` classes.
- No behavior or data logic changes.


---

## Shipping History Filter & Button Alignment (2026-06)

- Filter bar styled with Primary Filter Template using `--km-*` tokens.
- Date / Country / SKU / Shipping Method have label-on-top (already in HTML).
- Search button uses `--km-brand-blue` (Info/Utility action).
- All controls use consistent height (`--km-filter-height`), border, radius.
- No behavior or data logic changes.
- Outer search UI updated; inner SKU Details table and Collapse/Expand unaffected.

---

## Factory Stock & FC Summary Filter Fixes (2026-06)

- Factory Stock: removed `_factoryStockInitialized` guard; switched to `onclick`/`onchange` property binding to prevent stale/duplicate handlers. Now re-binds reliably on every mount.
- FC Summary: fixed dropdown panel missing `top: 100%; left: 0; right: 0; margin-top: 4px` — panels were rendering at unpredictable positions ("跑版").


---

## Filter Dropdown Option Standard (2026-06)

- `FILTER_BUTTON_DESIGN_STANDARD.md` updated with Filter Dropdown Option Standard section.
- Factory Stock is the reference implementation for checkbox dropdown option style.
- FC Summary dropdown options aligned to Factory Stock baseline (padding, spacing, checkbox style).
- Shipping History Country/Method remain as native select (single-select, few options — acceptable per standard).
- Shipping History filter layout overlap fixed: SKU input given controlled flex-basis, proper min-widths applied.


---

## Filter Dropdown Checked State Alignment (2026-06)

- All checkbox dropdowns now use `accent-color: var(--km-brand-teal)` (#3abfb6) for consistent checked state.
- Factory Stock, FC Summary, Shipping History all share identical checked visual.
- Shipping History Country/Method converted from native `<select>` to custom checkbox dropdown (single-select behavior preserved).
- `FILTER_BUTTON_DESIGN_STANDARD.md` updated with Checked State Standard and revised Native Select Exception.


---

## Promotion Risk Tracker + SKU Handbook Filter & Button Alignment (2026-06)

- Promotion Risk Tracker: pill chips use `--km-ui-success`, buttons use `--km-button-*` tokens, filter panel uses `--km-filter-*` tokens. Add Promotion = success green, Delete = danger style.
- SKU Handbook: filters wrapped in `--km-filter-surface` container with proper height/border/radius tokens. Language toggle uses `--km-ui-success` for active state. Data badge uses `--km-ui-info`.
- Pill Filter Variant documented in `FILTER_BUTTON_DESIGN_STANDARD.md`.
- Checkbox accent-color (`--km-brand-teal`) added to Request Order and Forecast Review for system-wide consistency.
- No behavior or data logic changes.


---

## Primary Checkbox Dropdown Conversion (2026-06)

- Promotion Risk Tracker: Product Category / Product Series converted from pill chips to checkbox dropdown multi-select.
- SKU Handbook: Product Line / Brand / Lifecycle converted from native `<select>` to checkbox dropdown multi-select.
- Both pages now use array-based filter state (empty array = all, non-empty = OR within group, AND between groups).
- Dropdown styling matches Factory Stock reference implementation (accent-color teal, consistent padding/spacing).
- Native selects removed from SKU Handbook filter UI.
- Old pill chip code removed from Promotion Risk Tracker.
- No data logic, Google Sheet fetch, or calculation changes.


---

## SKU Handbook Lifecycle + Promotion Risk Checkbox Fix (2026-06)

- SKU Handbook: Lifecycle filter value fixed from `'Running in the market'` to `'Running in the Market'` (capital M) to match `mapStatusToLifecycle()` output.
- SKU Handbook: `Closure` lifecycle option added to filter.
- SKU Handbook: Lifecycle dropdown trigger min-width increased to 180px.
- SKU Handbook: `LIFECYCLE_MAP` expanded with identity/alias entries for robustness.
- Promotion Risk Tracker: `renderRiskFilters()` removed from `renderCampaignRiskTracker()` render cycle — filters now only built once on init, not rebuilt on every filter change (which was resetting all checkboxes).
- Debug helpers added: `debugSkuHandbookLifecycleFilters()`, `debugPromotionRiskFilters()`.


---

## Demo Mode Off Cleanup + Modal Fix + Audit (2026-06)

- Forecast Review: Cumulative Goal now guarded by demo mode. Shows '—' when demo off.
- Promotion Risk Tracker: `getSkuMasterData()` now guarded by demo mode. Returns empty array when demo off (no fake SKU rows).
- Inventory Replenishment: Add SKU / Add Marketplace modal fixed — `width: min(560px, calc(100vw - 48px))`, `overflow-x: hidden`, form rows wrap on narrow screens.
- Legacy calculator ("補貨數量試算器"): removed sidebar menu item, section HTML, `calculateRestock()` function from app.js, and `'restock'` route from showSection mapping.
- `FILTER_OPTION_SOURCE_AUDIT.md` created: documents filter option sources for Factory Stock, Forecast Review, Request Order, FC Summary, Shipping History.
- Audit conclusion: Country/Marketplace/Company/Factory/Method are safe static enums. Category/Series/Year/Event should migrate to dynamic DB source in future.


---

## Inventory / Marketplace SKU Flow Audit (2026-06)

- `INVENTORY_MARKETPLACE_SKU_FLOW_AUDIT.md` created.
- Add SKU currently writes to in-memory only — lost on reload. Should write to `marketplace_skus`.
- Add Marketplace is non-functional (TODO placeholder) — only logs to console.
- `marketplace_skus` tab does not yet exist in Google Sheet.
- No `getMarketplaceSkus()` API support exists yet.
- Recommended: marketplace_skus as single source for site SKU relationships.
- Recommended: Phase 1 = read foundation, Phase 3 = write support, Phase 4 = cross-page sync.
- FC Summary Add SKU button: keep as admin fallback, primary entry should be Inventory Replenishment.
- No code changes made — audit and plan only.


---

## Inventory Replenishment: Replenishment Model + Edit/Delete SKU (2026-06)

- Status column now displays `replenishmentModel` (Sales Driven / Forecast Driven) instead of lifecycle.
- Add SKU modal: added Replenishment Model select + Launch Date input. Writes to `KM.DB.upsertMarketplaceSku()` when API connected.
- Edit SKU modal: allows editing replenishment_model, launch_date, marketplace_sku_status. Writes via `KM.DB.updateMarketplaceSkuModel()`.
- Delete SKU button: present but non-functional ("Delete SKU is not enabled yet.").
- Button semantic colors: Search=blue, Submit=orange, Add=green, Edit=blue, Delete=red, Marketplace=secondary.
- Apps Script: `upsertMarketplaceSku` and `updateMarketplaceSkuModel` POST actions added.
- API: `KM.DB.upsertMarketplaceSku()` and `KM.DB.updateMarketplaceSkuModel()` public methods added.
- `normalizeMarketplaceSkuRecord` now includes `replenishmentModel` and `launchDate`.
- Demo mode unaffected — demo data defaults to `sales_driven`.
- **Requires Apps Script redeployment** (new version) to activate POST actions.


---

## Runtime Architecture Spec Created (2026-06)

- `docs/planning/SYSTEM_RUNTIME_ARCHITECTURE.md` created — the **authoritative Runtime Architecture / runtime blueprint** for the whole system (architecture only; no code/Apps Script/API/SQL/DB/frontend changes).
- Defines: Runtime Philosophy, **Canonical Data Flow (權威資料流)**, Runtime Layers (9), Runtime Data Lifecycle, Module Boundaries, Runtime Dependency graph, Trigger Rules, Recalculation Rules, Freshness Rules, Runtime Ownership, Runtime Event Flow, Runtime Logging, Runtime Service Catalog, Future API Architecture, and Design Principles.
- Rule-driven chain: Business Rule → Database → Data Lifecycle → Runtime Mapping → Implementation. This doc is the **Runtime Mapping** layer; it synthesizes (does not override) the Blueprint, DB Relationship Map, Supply Chain Flow, Calculation Rules, Shipment Spec, Request/PO Spec, and Amazon Snapshot Import spec.
- Key invariants registered: Single Source of Truth · Snapshot First · Calculation Never Writes Source · Derived Data Never Owns Data · Planning Never Owns Inventory · Execution Never Recalculates Planning · Business Rules before Runtime · Data Lifecycle First.
- Snapshot Layer = single source of truth for imported data; calculation/planning/execution/documents read forward-only; documents are derived; freshness derived from `import_sync_runs`.
- No runtime, DB, API, or existing spec changed. Planning document only.


---

## Amazon Import Spec v1.4 + Runtime v1.2 — DB Header Requirements (2026-06)

- `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` → **Draft v1.4**: defined importer-generated **destination headers** ahead of the Apps Script refactor.
  - `amazon_daily_sales_snapshot`: `data_window_start_date`, `data_window_end_date`, `latest_source_date`, `is_fallback_used`, `fallback_reason`, `data_age_days` (per-group fallback transparency).
  - `amazon_inventory_snapshot`: `total_days_of_supply_including_open_shipments_is_capped`, `days_of_supply_amazon_fulfillment_network_is_capped` (Days-of-Supply `365+` capping flags).
  - `import_sync_runs`: `latest_source_date`, `data_window_start_date`, `data_window_end_date`, `is_fallback_used`, `fallback_group_count`, `normalized_placeholder_count`, `data_age_days`, `quality_note`.
  - Capping rule: `365+` → numeric `365` **and** `*_is_capped = TRUE`; exact → `FALSE`/blank; `/` and blank numeric → null; known placeholders create **no** `import_sync_issues`.
- `SYSTEM_RUNTIME_ARCHITECTURE.md` → **Draft v1.2**: Daily Sales freshness display must read `latest_source_date`, `data_window_start_date`, `data_window_end_date`, `is_fallback_used`, `data_age_days`.
- `DATABASE_RELATIONSHIP_MAP.md`: added a one-line pointer (no schema rewrite) noting Amazon snapshot + import-log table headers live in the import spec.
- Config blocks (§7/§27) unchanged — new fields are importer-generated, not `fieldMap` entries. **Spec/doc only; no code or Apps Script changed.**


---

## Apps Script Source Mirror Modularized (2026-06)

- **Structure-only split — no runtime behavior change.** `assets/specs/active/apps-script-web-app.gs` (the single ~2,300-line source mirror) was split into 11 module files under `assets/specs/active/apps-script/` (`00_config.gs` … `10_amazon_import_helpers.gs`).
- The original `apps-script-web-app.gs` is now an **index/comment-only** file (no behavior) listing the modules + public entry points + supported POST actions.
- Google Apps Script shares one global scope across all `.gs` files in a project, so functions/globals were moved (not duplicated) across files with **no imports/exports**. All `.gs` files in `apps-script/` must be copied into the Apps Script project **together**.
- Validation: 42 functions → 42 (identical name set, no duplicates); each global const (`VALID_LIFECYCLES_`, `VALID_REPLENISHMENT_MODELS_`, `VALID_MARKETPLACE_SKU_STATUSES_`, `AMAZON_DESTINATION_SPREADSHEET_ID_`, `AMAZON_TEXT_FIELDS_`, `IMPORT_CONFIGS`) declared exactly once; `doGet`/`doPost`/`runAmazonSnapshotImports`/`clearAmazonImportTestLogs` present; all 11 POST actions still routed; Amazon Health inv-age mapping intact; `node --check` passes on the concatenated modules.
- No DB headers, mappings, routes, frontend, or business logic changed. **Requires redeploying the Apps Script project from the new module files.**


---

## Inventory Table Mapping Spec v0.1 + Daily Sales 7-Day Window (2026-06)

- **`docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md` created (Draft v0.1)** — mapping for the Inventory Replenishment main table (貨物庫存表): Country+Marketplace mandatory scope; Stock block (Available/FC Transfer/FC Processing/C Orders/Unfulfillable ← `amazon_inventory_snapshot`); Long Term Storage (Over 90 / Over 180 ← `amazon_inventory_health_snapshot`); Sales Trend Past 7 Days ← `amazon_daily_sales_snapshot`; Forecast Breakdown (SKU>Series>Category target priority) ← `fc_regular_forecast`/`fc_target_rules`; Upcoming Event ← `fc_special_events`. Many sections TBD (AI Suggestion, Days of Supply, Suggested/Planned Qty, 3rd Party Stock, Shipping). No frontend / calc engine / DB change.
  - Open question logged: `inv_age_366_to_455_days`/`inv_age_456_plus_days` requested in §4 do **not** exist in the current health snapshot (top bucket is `inv_age_365_plus_days`); Over 180 maps to existing buckets until finer buckets are added.
  - Monthly Sales summary deferred to a future BigQuery table (`AmazonSales.amazon_monthly_sales_summary`) with close/refresh/recalc policy TBD.
- **Amazon Daily Sales import window changed: rolling 4-day → past 7 completed days, EXCLUDING today** (`06_amazon_import_config.gs`: `lookbackDays: 7` + `excludeToday: true`; `08_amazon_import_sources.gs`: rolling `WHERE DATE(Date) BETWEEN DATE_SUB(CURRENT_DATE("Asia/Taipei"), INTERVAL 7 DAY) AND DATE_SUB(..., INTERVAL 1 DAY)`). Per-group fallback retained, now using each group's own 7-completed-day window ending on its latest date (`INTERVAL 6 DAY`). No other import sources changed; Amazon Health mapping intact. **Requires Apps Script redeploy.**


---

## Inventory Table Mapping Spec v0.2 (2026-06-29)

- **`docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md` upgraded v0.1 → v0.2 (spec/doc only — no code, frontend, Apps Script, API, or DB change).**
- **DB sync documented:** `overseas_inventory_snapshot` now carries `physical_stock` / `available_stock` / `reserved_stock` / `damaged_stock` / `on_the_way_qty` / `on_the_way_eta` / `on_the_way_bucket` / `last_movement_at` + audit fields (`available_stock = physical_stock − reserved_stock − damaged_stock`). New `overseas_inventory_movements` ledger (before/after per stock type, `from_stock_type → to_stock_type`, reference linkage) registered for **future reservation control** — no logic implemented.
- **Stock block:** added **Unsellable** = `amazon_inventory_snapshot.unfulfillable_qty` (same field as Unfulfillable; display label only, not double-counted).
- **AI Suggestion columns:** replaced old columns with incremental buckets **Need 0–18d / 19–30d / 31–45d / 46–90d** + **Suggested Qty** (= sum of the four buckets, floored at 0).
- **Sales Driven algorithm rewritten:** consumes **Upcoming Event** (count-once, one bucket only) and **Shipping Shipment / On-the-Way** (FIFO-by-ETA waterfall: 0–18 → 19–30 → 31–45 → 46–90; consume-once, never reused across buckets). Shipment Allocation Priority Rule stated explicitly.
- **Forecast Driven algorithm:** Safety Days **15 → 30**; `Forecast Daily Demand = Adjusted 60-Day FC / 60`; `Suggested Qty = max(0, Adj 60-Day FC + Daily×30 + Event − Current Stock − On The Way)`.
- **Days of Supply UI:** `<30` Red (Needs Action) · `30–150` Normal · `>150` Light Brown (Potential Overstock).
- **Mixed Carton:** `mixed_carton_rules` exists in DB — **Future Extension only, no implementation.**
- All formulas remain owned by `SUPPLY_PLANNING_CALCULATION_RULES.md` (this spec records Inventory-Table-level intent/direction only). New open questions logged (demand run-rate window, event-to-bucket attribution, On-the-Way source unification, Current Stock definition).


---

## Supply Planning Finalized — Inventory Table V1 + Shared Allocation + Fulfillment Model (2026-06-29)

**Spec/doc only — no code, frontend, Apps Script, BigQuery, API, or DB implementation. Four docs synchronized consistently.**

- **`INVENTORY_TABLE_MAPPING_SPEC.md` → v1.0 (Inventory Table Mapping V1 finalized):**
  - Filter scope finalized to **Company + Country + Marketplace** (Company added; never aggregate all marketplaces).
  - Stock Card finalized (Available / FC Transfer / FC Processing / Customer Orders / **Unsellable** = `unfulfillable_qty`).
  - Long Term Storage **Over 180+** = `181_270 + 271_365 + 366_455 + 456_plus` (importer source dependency flagged: config currently tops at `365_plus`).
  - Sales Trend = **Past 7 Days** (previous 7 complete days, exclude today) + Apps Script requirement stated in spec.
  - **First Layer Summary Mapping** added: Current Stock (`Available+FC Transfer+FC Processing`), On The Way (pending), 3rd Party Stock (eligible overseas `available_stock`), Avg Sales/Day (`weekly sales_units_7d ÷ 7`, 1 dp), 60 Days FC (`M+1 + M+2`, target applied), Upcoming Event (Total Event FC), Days of Supply (`Current Stock ÷ Avg/Day`), Suggested Qty, Factory CN/TW (`factory_stock.current_stock` by `warehouses.country`).
  - **Sales Driven** replaced: cumulative incremental Need buckets `0–18/19–30/31–45/46–90`, **events count once**, **on-the-way deducted once (FIFO by ETA)**; Suggested Qty = final remaining demand after stock/on-the-way/event processed.
  - **Forecast Driven** finalized: **Safety Days = 30**; `max(0, FC M+1 + FC M+2 + Safety − Current Stock − Qualified On-the-Way)`, target rule applied.
  - **Days of Supply** color: `<30` Red · `30–150` Normal · `>150` Khaki/Brown (long inventory warning).
  - **Overseas Shared Inventory Allocation** chapter (7 rules, now official): scope same company + same country; platform = no sharing; self = required; hybrid = both visible; **18-day minimum survival stock = highest priority**; remaining by `allocation_priority` (higher = higher, PM-editable); future Factory/Shipping/Carrier reuse the same priority.
  - **Marketplace Fulfillment Model UI flow:** Add Marketplace picks `platform_fulfilled`/`self_fulfilled`/`hybrid`; Add SKU locks model for platform/self, PM selects for hybrid; Inventory UI shows platform layout / hides platform card (self) / both (hybrid).
- **`DATABASE_RELATIONSHIP_MAP.md` synced:** `marketplaces` + `fulfillment_model` + `allocation_priority`; `marketplace_skus` + `fulfillment_model` (SKU-level override + lock rule); `overseas_inventory_snapshot` current columns (physical/available/reserved/damaged/on_the_way_*); `overseas_inventory_movements` current columns (`movement_scope` + before/after per stock type); **`mixed_carton_rules`** new table mentioned (future extension); Import SKU Template note (hybrid marketplace requires Fulfillment Model column).
- **`SUPPLY_PLANNING_CALCULATION_RULES.md` → Draft v3:** new chapter **§20 Overseas Shared Inventory Allocation Engine** (scope, fulfillment-model behavior, 18-day survival stock, `allocation_priority` distribution, Sales/Forecast Need alignment with Safety Days = 30, future Shipping allocation extension).
- **Status: Inventory Table Mapping V1 finalized · Shared Overseas Allocation Rule finalized · Marketplace Fulfillment Model finalized · Allocation Priority finalized. Ready for next module.**


---

## Amazon Inventory Health — Optional Age-Bucket Importer Support (2026-06-29)

**Importer bug fix only — no frontend, no DB schema, no BigQuery, no other import sources changed.**

- **Problem:** the config-driven importer validated **every** `fieldMap` source header as required, so an Amazon Inventory Health report missing an age-bucket header (reports vary by marketplace/version) raised `missing_required_header` and stopped the whole `amazon_inventory_health_snapshot` source.
- **Fix:** added **`optionalFieldMap`** support in `07_amazon_import_runner.gs` — header validation still checks **only** `fieldMap`; optional fields are mapped **only if the source header exists**, otherwise set to blank (safe for `rowHashFields` + dedup). Optional headers never raise `missing_required_header`.
- **`06_amazon_import_config.gs`** (config 2, `amazon_inventory_health_snapshot`): required `fieldMap` = Date / Country / SKU / ASIN / Available + `inv_age_61_to_90` / `91_to_180` / `181_to_270` / `271_to_365`. Moved to `optionalFieldMap`: `inv_age_0_to_90_days`, `inv_age_365_plus_days`, `inv_age_366_to_455_days`, `inv_age_456_plus_days`. `rowHashFields` extended to all required + optional buckets.
- **Compatibility:** `inv_age_365_plus_days` = backward-compatible top bucket for old reports; `inv_age_366_to_455_days` / `inv_age_456_plus_days` = newer finer buckets, preferred when present. Missing buckets → blank/0; import still succeeds.
- **DB header reminder:** destination tab headers must be underscored (e.g. `inv_age_456_plus_days`), **not** hyphenated (`inv-age-456-plus-days`) — the writer maps by destination header, so a hyphenated header silently drops the value. DB not changed automatically.
- **Docs:** `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` → Draft v1.5 (§7.2 + §9.1 optionalFieldMap); `INVENTORY_TABLE_MAPPING_SPEC.md` → v1.2 (§5 report-version note, Over 180+ formula unchanged).
- **Requires Apps Script redeploy** to take effect (repo `.gs` is the source mirror).


---

## Weekly Shipping Plan Mapping Spec — Decision Layer (2026-06-29)

**Spec/doc only — no code, frontend, Apps Script, DB migration, or BigQuery.**

- **`docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` created (Draft v1).** Defines Weekly Shipping Plan as the **Decision Layer** between Inventory Replenishment (**Analysis Layer**) and Shipment Draft/Overview (**Execution Layer**).
- **Submit Plan DB write contract clarified:** Submit Plan creates `shipping_plans` + `shipping_plan_lines`; **one `shipping_method` = one `shipping_plan` card** (SKUs grouped by method); created in `status = draft`; no factory-stock reservation/deduction at submit (that stays in Shipment Center).
- **`shipping_plans` / `shipping_plan_lines` column schema defined** (this fills the gap flagged in the Shipment/Request/PO readiness audit — `DATABASE_RELATIONSHIP_MAP.md` §8 listed the tables without columns; this spec is now their authoritative column definition, planned/not migrated).
- **Decision snapshot rule:** Submit Plan freezes Current Stock / Avg Sales-Day / Days of Supply / Suggested Qty / Target Days / Shipping Method / Inventory Snapshot Date (+ optional FC/event context) onto the plan so it does not drift with daily inventory changes.
- **Status flow:** `draft → pending_approval → approved → (convert) Shipment Draft`; `draft → cancelled`; `pending_approval → rejected → draft` (Reject requires `rejected_reason`, appended to `note`). Plan-layer status is **distinct** from shipment execution status (`SHIPMENT_CENTER_SPEC.md` §3).
- **Editable rule:** Shipping Qty editable **only in Draft** (updates `approved_qty` → `carton_qty` → plan totals → cost if carrier selected); read-only in Pending Approval / Approved.
- **Shipment hand-off:** Approved plan converts to Shipment Draft as an execution snapshot (initial plan→shipment field copy documented); shipment never recalculates planning.
- **`SUPPLY_CHAIN_SYSTEM_FLOW.md` → Draft v1.1:** added §5.1 Decision Layer chain + cross-reference; Inventory Replenishment / Weekly Shipping Plan / Shipment layer roles stated.
- Cost Breakdown left as placeholder (future Carrier Price Spec). Non-goals: no carrier pricing formula, no Request/PO conversion, no Shipping Allocation algorithm, no code.


---

## Weekly Shipping Plan Architecture Finalized (2026-06-29)

**Spec/doc only — no code, frontend, Apps Script, DB migration, or BigQuery.**

- **`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` → Draft v1.1.** Finalized the Weekly Shipping Plan architecture before implementation:
  - **Shipping Plan Group Key (FINAL):** a plan is uniquely grouped by the **six values** Company + Country + Marketplace + Ship From + Destination + Shipping Method; if any differs → new plan. Supersedes the method-only rule. `company` added to `shipping_plans`.
  - **`plan_version`** added (default 1; in-Draft edits do not bump; Reject→Draft→resubmit = +1; decision revisions only).
  - **`submit_batch_id`** added (one Submit Plan action → many plans share one batch id; for history / audit / AI / reporting).
  - **Snapshot location FINALIZED to `shipping_plan_lines` only** (per-SKU); planning snapshots are **not** stored on `shipping_plans`. Required fields: `snapshot_current_stock`, `snapshot_avg_sales_per_day`, `snapshot_days_of_supply`, `snapshot_suggested_qty`, `snapshot_target_days`, `snapshot_fc_context`, `snapshot_event_context`. SKU Shipping Details displays them after Submit; Shipment Draft inherits them **without recalculation**.
- **`SUPPLY_CHAIN_SYSTEM_FLOW.md` → Draft v1.1:** added **§2A Core Architecture Philosophy — Three-Layer Separation**: Inventory Replenishment always **recalculates** (Analysis), Weekly Shipping Plan always **preserves planning decisions** (Decision), Shipment always **preserves execution records** (Execution) — these three must never be mixed.
- **`DATABASE_RELATIONSHIP_MAP.md` §8 synced:** documented full `shipping_plans` columns (incl. `plan_version`, `submit_batch_id`, six group-key fields) and confirmed the `shipping_plan_lines` snapshot fields; snapshot location finalized on the line. Marked authoritative-in-Weekly-Shipping-Plan-spec (planned, not migrated).
- Resolved prior open questions (grouping key, snapshot location, submit batch). Remaining open: plan_no/plan_name format, approval actor model, ship_from/destination source, cancel-from-pending semantics, resubmit history retention, cost recalc trigger.


---

## Weekly Shipping Plan — Version / Batch / Immutable-Flow Finalized (2026-06-29)

**Spec/doc only — no code, frontend, Apps Script, DB migration, or BigQuery.**

- **`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` → Draft v1.2:**
  - **Reject/Resubmit (FINAL MVP):** keeps the **same `shipping_plan_id`** (one row); **only `plan_version` increments** (e.g. SP-001 v1 pending → reject → v1 draft → resubmit → v2 pending). No new row per version.
  - **`parent_shipping_plan_id` added:** MVP `parent_shipping_plan_id = shipping_plan_id`; reserved for a future one-row-per-version model (version rows point back to the original) without changing the conceptual model.
  - **`batch_status` added:** batch-level summary across the `submit_batch_id` group (`open / partial_approved / approved / rejected / cancelled / mixed`), **derived helper only**; `shipping_plans.status` stays the **primary** approval status.
  - **Glossary added:** **Decision Commit** (= Submit Plan: before = recalculated/unpersisted, after = `shipping_plans`/lines created + snapshot frozen) and **Decision Snapshot** (immutable per-SKU planning context on `shipping_plan_lines`; single source of truth for Shipment; never recalculated).
- **`SUPPLY_CHAIN_SYSTEM_FLOW.md`:** added the **Immutable Flow Principle** (every downstream layer inherits/copies upstream into its own snapshot but never mutates upstream — Replenishment→Plan→Shipment) and the **Single Source of Truth by layer** table (Analysis = live data; Decision = `shipping_plans`/lines; Execution = `shipments`/lines; Procurement = `purchase_orders`/lines; Documents = `generated_documents`). No new DB required.
- **`DATABASE_RELATIONSHIP_MAP.md` §8:** added `parent_shipping_plan_id` + `batch_status` to the `shipping_plans` column list; clarified `status` (individual, primary) vs `batch_status` (batch summary, helper); documented MVP same-row reject/resubmit + `parent_shipping_plan_id = shipping_plan_id`.


---

## Supply Chain Architecture Principles File Created (2026-06-29)

**Spec/doc only — no code, frontend, Apps Script, DB schema, or BigQuery.**

- **`docs/planning/SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` created (v1)** — the single stable home for supply-chain architecture language, reusable by all current/future specs (Inventory Replenishment, Weekly Shipping Plan, Shipment Draft/Overview, Request Order, Purchase Order, Export Center, API Architecture).
- **Analysis / Decision / Execution architecture language centralized:** Analysis Layer (Inventory Replenishment — recalculates from live data), Decision Layer (Weekly Shipping Plan — `shipping_plans`/lines), Execution Layer (Shipment — `shipments`/lines), each with owner, source-of-truth, and rules.
- **Formalized:** **Decision Commit** (= Submit Plan), **Decision Snapshot** (immutable per-SKU context on `shipping_plan_lines`, 7 fields, never recalculated), **Immutable Flow** (every layer owns its truth; downstream copies upstream into its own snapshot but never mutates upstream), **Single Source of Truth** table (Analysis/Decision/Execution/Procurement/Documents), **Business Object Identity** (stable business identity vs physical DB identity; MVP `parent_shipping_plan_id = shipping_plan_id` + `plan_version` on same row; future one-row-per-version — no new DB field now), plus the Analysis→Decision→Execution→History/Documents diagram.
- **Docs synchronized to reference it:** `SUPPLY_CHAIN_SYSTEM_FLOW.md` (Related + §2A pointer; "every layer owns its own truth, downstream copies but never mutates"), `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` (Authority line + §0 Glossary governed-by note), `DATABASE_RELATIONSHIP_MAP.md` §8 (architecture-governance note). No duplicate/conflicting definitions; no DB schema change.


---

## Weekly Shipping Plan Phase 1 — Implemented (2026-06-29)

**Code change (frontend + Apps Script source mirror); requires Apps Script redeploy + the two new tabs.**

- **Submit Plan now writes real records.** Inventory Replenishment `submitReplenishmentPlans()` builds a flat per-SKU line list and calls **`KM.DB.createShippingPlansBatch`** (Decision Commit). Backend groups by the six-value key → `shipping_plans` (status=draft, plan_version=1, parent=self, batch_status=open, source=inventory_replenishment_submit_plan, shared submit_batch_id) + `shipping_plan_lines` (requested/approved/carton + 7 Decision Snapshot fields). Falls back to legacy sessionStorage only when cloud write is unavailable (Demo). AI Suggestion algorithm untouched.
- **Apps Script:** new module `11_shipping_plan_handlers.gs` (`handleCreateShippingPlansBatch_` / `handleUpdateShippingPlanStatus_` / `handleUpdateShippingPlanLineQty_`); router wired (3 POST actions); `shipping_plans` + `shipping_plan_lines` added to `getOperationDb`/`getTable` validTabs + `filterRows_`. Handlers auto-create the two tabs with the documented headers if missing (the only schema-affecting action; no existing table/field altered).
- **DB API:** normalizers + cache + getters (`getShippingPlans` / `getShippingPlanLines`) + write methods (`createShippingPlansBatch` / `updateShippingPlanStatus` / `updateShippingPlanLineQty`).
- **Weekly Shipping Plan page** reads `shipping_plans`/`shipping_plan_lines` from DB (one plan = one card) with the spec's card + SKU-detail mapping (snapshots displayed). Draft: editable Shipping Qty (live totals) + Save + Submit + Cancel; Pending Approval: Approve + Reject (reason required, appended to note, → Draft); Approved: read-only. Resubmit reuses the same `shipping_plan_id`, `plan_version +1`. Legacy sessionStorage render kept as fallback.
- **DB impact:** two NEW tables only (`shipping_plans`, `shipping_plan_lines`) auto-created with documented headers in the operation DB spreadsheet; no existing schema changed. **Requires Apps Script redeploy.**


---

## Normalized Avg Sales Rule + Daily Sales 30-Day Window (2026-06-29)

**Spec + import config. No new table, no BigQuery schema change, no Shipment/Request/PO/Carrier change.**

- **Normalized Avg Sales / Day Rule finalized** (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22, Draft v3.2): Promotion / campaign / special event days are **excluded from the baseline sales calculation**. Default `sales_units_7d ÷ 7`; when event/promotion contamination exists in the recent window, use `normalized_avg_sales_per_day = sum(sales on normal days) ÷ count(normal days)` over the **latest 30 completed days excluding today**, with normal days = 30-day window − event/promo days (from `fc_special_events` + `campaigns` + `campaign_sku_lines`). Fallback ladder: ≥7 normal days → normalized; 3–6 → normalized + `low_sample_warning`; <3 → weekly fallback + `insufficient_normal_days`. Forecast-Driven SKUs: Avg Sales auxiliary only.
- **Amazon Daily Sales snapshot expanded 7 → 30 complete days** (still excludes today): `06_amazon_import_config.gs` `lookbackDays: 7→30`, `excludeToday: true`; spec §4/§7.4/Appendix synced (`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` Draft v1.6). One snapshot now feeds both the Sales Trend 7-day display and the Avg Sales 30-day normalization. **No new column, no BigQuery schema change.**
- **`INVENTORY_TABLE_MAPPING_SPEC.md` → v1.3:** Avg Sales/Day no longer always `weekly_7d ÷ 7` (primary = normalized 30-day when applicable; fallback = weekly); Sales Trend still Past 7 complete days.
- **Weekly Shipping Plan line snapshot extended** (`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` → v1.3): added `snapshot_avg_sales_source` (the Avg-Sales source field; renamed on 2026-06-29), `snapshot_normal_days_count`, `snapshot_excluded_event_days_count`, `snapshot_avg_sales_warning`; `snapshot_avg_sales_per_day` now stores the final adopted value. `DATABASE_RELATIONSHIP_MAP.md` §8 synced (decision-context fields, not live calc).
- **Note:** the runtime normalization engine (reading the 30-day daily snapshot + event/campaign overlap to compute `normalized_avg_sales_per_day` and the method/warning) is **spec-defined but not yet implemented** in the frontend/Apps Script — Submit Plan currently snapshots the displayed Avg Sales as `weekly_7d` until the engine lands.


---

## Shipping Allocation Working Draft — Principle + Bug Fix (2026-06-29)

**Spec + frontend behavior fix. No DB table/schema change; no Shipment/Request/PO/Carrier change.**

- **Shipping Allocation Working Draft principle added.** The pre-Submit allocation is a **Temporary Decision** (Analysis Layer), **not** a Decision Snapshot. It **creates no `shipping_plans` / `shipping_plan_lines`** and **never updates** a Weekly Shipping Plan. Working Draft uses **JS State + sessionStorage recovery** (context-scoped: country/marketplace; sessionStorage is recovery only, not a committed record).
- **Submit Plan is the only Decision Commit and only creator of Weekly Shipping Plan records.** Submit reads the Working Draft (SKUs edited-then-collapsed are included; SKUs without a draft fall back to AI-default allocation). Success → clears the draft (JS + sessionStorage); failure → keeps it.
- **Bug fixed:** Shipping Allocation inputs no longer disappear on collapse/expand. `initializeShippingAllocation` rebuilds from the Working Draft (exact qty, no re-rounding) when a draft exists for the SKU+context; otherwise it shows the AI-default preview (which is captured into the draft only once the user edits). Allocation edits (`addShippingMethod` / `removeShippingMethod` / qty input via `onAllocationEdit`) update the draft only — **none call `createShippingPlansBatch`**.
- **Context lifecycle:** changing Country/Marketplace (both demo + cloud) clears the draft; mount restores the draft from sessionStorage and applies it per-SKU only when the active context matches.
- **State object:** `window.KM.shippingAllocationDraft` ( `{ context:{country,marketplace}, targetDays, bySku:{ sku:[ {shipping_method, qty, ship_from, destination, source_reason} ] } }` ); sessionStorage key `km_replen_alloc_draft_v1`.
- **Specs updated:** `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A; `SUPPLY_CHAIN_SYSTEM_FLOW.md` §5.1 (Working Draft inserted before Decision Commit); `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §2A (Draft v1.4). No Apps Script / DB change in this task.


---

## Normalized Avg Sales Runtime Architecture Alignment (Draft v3.3) (2026-06-29)

**Spec-only documentation refactor — NO calculation logic, runtime engine, Apps Script, API, BigQuery, Submit Plan flow, or DB table-count change.**

- **Runtime Calculation Rule** added (`SUPPLY_PLANNING_CALCULATION_RULES.md` §22.6, Draft v3.3): `normalized_avg_sales_per_day` is a **Runtime result, not a DB column** — recomputed each time, displayed in the Inventory Table (Analysis Layer), **not persisted**; only at **Submit Plan (Decision Commit)** is the final adopted value written to `shipping_plan_lines.snapshot_avg_sales_per_day` → immutable Decision Snapshot. Aligned with `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`.
- **Renamed the Avg-Sales method/source snapshot field to `snapshot_avg_sales_source`** across all specs (records the *source* of the Avg Sales basis, not an algorithm; fits Analysis → Decision data flow). No residual of the old field name remains.
- **`snapshot_avg_sales_source` fixed enum:** `weekly_7d`, `normalized_30d`, `manual_override`, `forecast_override`, `ai_adjusted` (runtime currently only `weekly_7d` / `normalized_30d`; rest Future Extension).
- **Source ⟂ Warning fully decoupled:** removed combined tokens (`normalized_30d_low_sample`, `weekly_7d_fallback_insufficient_normal_days`). `snapshot_avg_sales_warning` enum stays `blank` / `low_sample_warning` / `insufficient_normal_days` / `event_contaminated_weekly_sales`; a warning never alters the source.
- **Fallback ladder (§22.3) restated** as independent source + warning: ≥7 → `normalized_30d` / blank; 3–6 → `normalized_30d` / `low_sample_warning`; <3 → `weekly_7d` / `insufficient_normal_days`.
- **Docs synced:** `SUPPLY_PLANNING_CALCULATION_RULES.md` (v3.3), `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` (v1.5), `DATABASE_RELATIONSHIP_MAP.md` §8, `INVENTORY_TABLE_MAPPING_SPEC.md` §13. `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` unchanged (no snapshot-field reference; 30-day window rule already in place). **Deploy impact: None.**


---

## Architecture Finalization v1.1 — Execution Commit / Execution Snapshot + Terminology (2026-06-29)

**Spec-only. No Frontend / Apps Script / API / DB migration / BigQuery / runtime change. No new DB table.**

- **Avg Sales snapshot naming unified:** all literal residuals of the old method field name removed; everywhere uses **`snapshot_avg_sales_source`** (fixed enum `weekly_7d` / `normalized_30d` / `manual_override` / `forecast_override` / `ai_adjusted`; runtime uses the first two). `snapshot_avg_sales_warning` stays an independent field (Source ⟂ Warning).
- **`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` extended:** §1A **canonical Terminology table** (all 11 terms — every spec references, never redefines); §3A **Execution Commit** (Approved Weekly Shipping Plan → Create Shipment Draft: creates `shipments`/`shipment_lines`, copies Decision Snapshot, creates Execution Snapshot, no recalculation); §4A **Execution Snapshot** (Shipment-layer copy of the Decision Snapshot; immutable; never mutates the Decision); §4 Decision Snapshot field list + `snapshot_avg_sales_source` enum added; §5 Immutable Flow full chain; §6 Architecture Diagram expanded (Analysis → Working Draft → Decision Commit → Decision Snapshot → Execution Commit → Execution Snapshot → Shipment Events → History → Documents); §7 Single Source of Truth now Owner / Truth / Snapshot per layer.
- **`SUPPLY_CHAIN_SYSTEM_FLOW.md` §5.1:** named **Execution Commit**, added Shipment Draft → Shipment Overview → Shipping History as the Execution Layer; Execution Layer must not recalculate the Decision.
- **`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §12:** added "Shipment Draft inherits Decision Snapshot and creates Execution Snapshot; Execution Snapshot is immutable; Shipment never mutates the Decision Snapshot."
- **Canonical Architecture Language now finalized:** Analysis → Working Draft → Decision Commit → Decision Snapshot → Execution Commit → Execution Snapshot → Shipment Events → History → Documents. All specs reference one shared vocabulary.

## Architecture Finalization — Snapshot Provenance + Truth Flow Principle (2026-06-29)

**Spec-only. No Frontend / Apps Script / API / DB migration / BigQuery / runtime change. No new DB table or column.**

- **`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` → v1.1:** added **§4B Snapshot Provenance** (a snapshot = **Value + Source + Provenance**; Value=`snapshot_avg_sales_per_day`, Source=`snapshot_avg_sales_source` are persisted; **Provenance** = which engine/decision produced the value is **architecture-reserved for a future AI Audit Trail, NOT persisted, no new column**). Added **§5A Truth Flow Principle** (*truth flows downstream, context flows with it, authority never flows back*: Shipment inherits Shipping Plan, Shipping Plan inherits Inventory Replenishment, Inventory inherits Amazon Runtime Data — never editing upstream). Both added to §1A Terminology; §4 cross-references §4B.
- **`SUPPLY_CHAIN_SYSTEM_FLOW.md`:** Immutable Flow section now references Truth Flow Principle + Snapshot Provenance (architecture file authoritative; not redefined here).
- **`WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §5.3:** added a **Snapshot Provenance (Architecture Reserved)** note under the Decision Snapshot — Value + Source persisted, Provenance reserved, no new field.
- **`SUPPLY_PLANNING_CALCULATION_RULES.md` §22.5:** clarified `snapshot_avg_sales_source` is current persisted metadata; Snapshot Provenance is architecture-reserved for future AI / Planning audit, not persisted.
- **No change to:** Runtime calculation, Decision Commit, Decision Snapshot, Immutable Flow, Single Source of Truth. Architecture extended only.

## Weekly Shipping Plan — UI / Mapping Fixes Before Execution Phase (2026-06-29)

**Frontend + API + Apps Script fix (no DB migration, no BigQuery, no Carrier formula, no Shipment Draft/Overview, no Request Order/PO). Spec → `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` Draft v1.6.**

- **Fix 1 — `shipping_plans.company` resolution (was blank):** `handleCreateShippingPlansBatch_` now resolves company server-side per priority `marketplace_skus` (country+marketplace+sku) → `marketplaces` (country+marketplace) → payload company (`--` treated as blank) → blank; resolved **per line before the six-key grouping**. Frontend submit also stops sending the `--` placeholder. New plans get a populated Company.
- **Fix 2 — Add Note restored in Plan Rationale (DB card):** `+ Add Note` button + inline editor; new `appendShippingPlanNote` action (`01_router.gs` + `handleAppendShippingPlanNote_`) appends to `shipping_plans.note` (append-only, preserves history, **never touches `rejected_reason`**); `KM.DB.appendShippingPlanNote` added.
- **Fix 3 — Cost Breakdown placeholder restored:** expanded DB card now shows **Plan Rationale + Cost Breakdown side by side** (Carrier Name / Carrier Fee / Duty-Custom / Total Cost / Unit Cost, `--` when unpriced). UI placeholder only — no carrier formula.
- **Fix 4 — Total SKU removed from Layer 1 card** (DB card header).
- **Fix 5 — SKU Shipping Details footer totals** added (Total SKU / Total Qty / Total Cartons), kept in sync with header totals while editing qty.
- **Fix 6 — Current Stock / Avg Sales now show** via snapshot-first display: `snapshot_current_stock` → live `available+fc_transfer+fc_processing` → 0; `snapshot_avg_sales_per_day` → live `sales_units_7d/7` → 0; Days of Supply snapshot → `stock/avg` → `--`.
- **Fix 7 — Shipping Allocation enforces full-carton qty:** every submitted line qty must be an integer multiple of `sku_details.units_per_carton`; missing UPC or non-multiple shows inline red text and **blocks Submit Plan** (no silent rounding). `unitsPerCarton` added to cloud + demo replenishment data; live validation in `updateShippingAllocationTotal`; gate in `submitReplenishmentPlans`.
- **Files:** `assets/js/pages/shipping-plan.js`, `assets/js/pages/inventory-replenishment.js`, `assets/js/api/operation-system-db-api.js`, `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`, `assets/specs/active/apps-script/01_router.gs`, `docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`. **Apps Script repo is a source mirror — redeploy `01_router.gs` + `11_shipping_plan_handlers.gs` for Fix 1 / Fix 2 backend to take effect.**

## Company Snapshot Flow Fix — marketplaces.company → shipping_plans.company → shipments.company (2026-06-30)

**Spec sync + DB header sync + Submit Plan company-mapping fix (no Shipment Draft impl, no Carrier pricing, no Request Order/PO, no Amazon imports, no calc rules). No new DB table.**

- **Company resolution priority SWAPPED** to make `marketplaces` authoritative: `handleCreateShippingPlansBatch_` now resolves `shipping_plans.company` as **(1) `marketplaces.company` by country+marketplace → (2) `marketplace_skus.company` by country+marketplace+sku → (3) frontend payload → (4) blank + `Logger.log` warning**. Company is resolved **per line before** the six-key grouping (company is part of the group key, not display-only).
- **`shipments.company` added** to the `shipments` column definition (`SHIPMENT_CENTER_SPEC.md` §2): copied from `shipping_plans.company` at **Execution Commit** (Shipment Draft creation); Shipment must **not** live-join `marketplaces` for historical company ownership.
- **Line tables do NOT carry company:** `shipping_plan_lines` / `shipment_lines` inherit company from the header via `shipping_plan_id` / `shipment_id` (documented in `DATABASE_RELATIONSHIP_MAP.md` §8).
- **Weekly Shipping Plan card** reads `shipping_plans.company` (persisted snapshot). Added a **legacy-only display fallback**: when `company` is blank, the card live-joins `marketplaces` (country+marketplace) for display; **new rows always persist company** so the fallback rarely fires.
- **Specs updated:** `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §3.3 (priority swap + snapshot-flow rule), §4 / §6 / §12; `SHIPMENT_CENTER_SPEC.md` §2 + Step 10; `DATABASE_RELATIONSHIP_MAP.md` §8 (company snapshot flow + no line duplication).
- **Files:** `assets/js/pages/shipping-plan.js`, `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`, `docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`, `docs/planning/SHIPMENT_CENTER_SPEC.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. **Redeploy `11_shipping_plan_handlers.gs` for the new priority to take effect.** **Note: `shipments.company` is a documented column for the future Shipment build — the `shipments` table is not yet migrated/created.**

## Weekly Shipping Plan — Save / Submit / Cancel Behavior + Soft Cancel (2026-06-30)

**Spec + small frontend/Apps Script fix. No Shipment Draft / Execution Commit / Carrier / Request Order / PO / Role-Permission / User-Management. No DB row delete, no hard delete. WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md → Draft v1.7.**

- **Save = Draft-only edit save** (`spDbSaveQty` → `updateShippingPlanLineQty`): writes `approved_qty`, recomputes `carton_qty`, **does NOT change status / `submitted_at` / `submitted_by`**, stays on the page. Note append remains the separate Add Note flow (`appendShippingPlanNote`).
- **Submit = send for approval**: `draft → pending_approval`, writes `submitted_at = now`, `submitted_by` = placeholder actor.
- **Cancel = SOFT cancel**: now allowed from **`draft` OR `pending_approval`** (`handleUpdateShippingPlanStatus_` guard updated); writes `status = cancelled`, `cancelled_at = now`, `cancelled_by` = placeholder; **never deletes `shipping_plans` / `shipping_plan_lines`**. A **Cancel button was added to Pending Approval cards**.
- **New `shipping_plans` columns:** `cancelled_by`, `cancelled_at`, `updated_by` (added to `SHIPPING_PLANS_HEADERS_`, db-api normalizer, spec §4, DATABASE_RELATIONSHIP_MAP §8). `setCell` skips columns absent from the live sheet, so the handler is non-blocking until the tab is re-created/migrated with the new headers.
- **Cancelled display:** new **Cancelled** section + container (`cancelledCards`) + Status-filter option; `renderShippingPlanFromDb` now renders cancelled and calls `filterByStatus()`; `filterByStatus` rewritten so **All Active excludes cancelled** and **Cancelled filter reveals them**. Status filter label `All Status` → **All Active**.
- **Actor placeholder rule (§13A):** `created_by / submitted_by / approved_by / rejected_by / cancelled_by / updated_by` resolve as `body.<field> || body.updated_by || actor || 'system_user'` — never block the flow; future Role & Permission module swaps in real identity.
- **Files:** `assets/js/pages/shipping-plan.js`, `assets/html/pages/shipping-plan.html`, `assets/js/api/operation-system-db-api.js`, `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`, `docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. **Redeploy `11_shipping_plan_handlers.gs`; re-create the `shipping_plans` tab (or add the 3 new header columns) so `cancelled_by` / `cancelled_at` / `updated_by` persist.**

## Amazon Inventory Health — Long Term Storage Mapping Fix (2026-06-30)

**Apps Script import config + frontend mapping + spec sync. No new DB table; no country-branch logic. Did not touch Weekly Shipping Plan / Shipment / amazon_inventory_snapshot / Daily Sales.**

- **Amazon Inventory Health schema updated:** `inv_age_61_to_90_days` **removed** (superseded by the `0–90` bucket); `inv_age_366_to_455_days` / `inv_age_456_plus_days` are part of the bucket set. Health columns now: `inv_age_0_to_90_days`, `inv_age_91_to_180_days`, `inv_age_181_to_270_days`, `inv_age_271_to_365_days`, `inv_age_365_plus_days`, `inv_age_366_to_455_days`, `inv_age_456_plus_days`.
- **Long Term Storage mapping standardized (one algorithm, all countries):**
  - **Over 90+ = `inv_age_91_to_180_days`** (corrected 2026-06-30 — `inv_age_0_to_90_days` is **NOT** included; it stays in DB/import but does not feed Over 90+).
  - **Over 180+ = `inv_age_181_to_270_days` + `inv_age_271_to_365_days` + `inv_age_365_plus_days` + `inv_age_366_to_455_days` + `inv_age_456_plus_days`**
  - missing / blank / undefined buckets all count as **0**.
  - Previously Over 180+ omitted `inv_age_365_plus_days` — corrected.
- **`06_amazon_import_config.gs`** (config 2): required `fieldMap` reduced to Date / Country / SKU / ASIN / Available; **all** age buckets moved to `optionalFieldMap` (any subset imports cleanly); `inv-age-61-to-90-days` removed from fieldMap + `rowHashFields`; `366/456` confirmed present.
- **`inventory-replenishment.js`** `IRMap.longTermStorage` rewritten to the unified formula; reads `amazon_inventory_health_snapshot` matched by country+marketplace+sku, latest `snapshot_date` (existing `IR.latestSnapshot`). **Never uses `inv_age_61_to_90_days`.**
- **`operation-system-db-api.js`**: health normalizer gained `invAge0To90Days` (missing → 0).
- **Specs:** `INVENTORY_TABLE_MAPPING_SPEC.md` §5 → v1.4; `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` §7.2 / §9.1 / appendix Config 2 synced.
- **Files:** `assets/specs/active/apps-script/06_amazon_import_config.gs`, `assets/js/pages/inventory-replenishment.js`, `assets/js/api/operation-system-db-api.js`, `docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md`, `docs/planning/AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`. **Redeploy the Amazon import Apps Script; ensure the `amazon_inventory_health_snapshot` tab headers match (no `inv_age_61_to_90_days`; has `inv_age_0_to_90_days` + `366/456`).**

## Execution Commit Phase 1 — Approved Plan → Shipment Draft (2026-06-30)

**Implemented the Execution Commit: Approved Weekly Shipping Plan → create `shipments` + `shipment_lines`, copying the Decision Snapshot into the Execution Snapshot. Backend + DB + Shipment Overview frontend (modified existing pages, not rebuilt). Did not touch Inventory Replenishment / Planning Engine / Request Order / Purchase Order / Carrier Price Engine / Factory Allocation Engine.**

- **Execution Commit trigger:** approving a Weekly Shipping Plan (`updateShippingPlanStatus` transition `approve`) now also runs `createShipmentFromApprovedPlan_` — creates the Shipment Draft (`shipments.status = draft` + `shipment_lines`). **Idempotent** (one shipment per approved plan); a failure does not roll back the approval. Explicit retry via the new `createShipmentFromPlan` action.
- **Execution Snapshot = verbatim copy of the Decision Snapshot** (ARCHITECTURE §4A): each `shipment_lines` row copies `snapshot_current_stock / snapshot_avg_sales_per_day / snapshot_days_of_supply / snapshot_suggested_qty / snapshot_target_days / snapshot_fc_context / snapshot_event_context / snapshot_avg_sales_source / snapshot_avg_sales_warning`; `qty = approved_qty`. Header copies company/country/marketplace/ship_from/destination/shipping_method/carrier_id + total_qty/total_cartons. **Nothing is recalculated.**
- **New `shipments` columns** (vs SHIPMENT_CENTER §2 prior): `booking_no`, `note`, `updated_by`. **New `shipment_lines` columns:** the 9 `snapshot_*` Execution Snapshot fields.
- **New Apps Script:** `12_shipment_handlers.gs` (`createShipmentFromApprovedPlan_`, `handleCreateShipmentFromPlan_`, `handleUpdateShipment_`, `SHIPMENTS_HEADERS_` / `SHIPMENT_LINES_HEADERS_`, auto-creates tabs). Router (`01_router.gs`) adds `createShipmentFromPlan` + `updateShipment`. `03_master_data_handlers.gs` validTabs + `02_core_sheet_db.gs` filterRows_ add `shipments` / `shipment_lines` (read path).
- **DB API:** `normalizeShipmentRecord` / `normalizeShipmentLineRecord`, added to `normalizeOperationDb`; getters `getShipments` / `getShipmentLines`; write methods `createShipmentFromPlan` / `updateShipment`.
- **Shipment Overview (`shipping-history.js`) now reads `shipments` / `shipment_lines` from DB** when cloud is enabled (mock retained for demo). Shows status + header + SKU lines (Execution Snapshot **read-only**, not recalculated) and an **editable execution-fields panel** (Carrier / Booking / Container / BL / Invoice / ETD / ETA / Tracking / Remark + Save → `updateShipment`) for non-terminal shipments. **Does not read the Weekly Shipping Plan.** `updateShipment` rejects any non-execution field server-side, so the Execution Snapshot cannot be edited.
- **Weekly Shipping Plan Approve** message now reports the created Shipment Draft.
- **Specs:** `SHIPMENT_CENTER_SPEC.md` §2 (column lists) + §15 step 10 (Execution Commit / Execution Snapshot copy / no-recalculation / Phase 1 scope: factory reservation deferred); `DATABASE_RELATIONSHIP_MAP.md` §8 (shipments / shipment_lines columns + Execution Snapshot).
- **Files:** `assets/specs/active/apps-script/12_shipment_handlers.gs` (new), `01_router.gs`, `02_core_sheet_db.gs`, `03_master_data_handlers.gs`, `11_shipping_plan_handlers.gs`, `assets/js/api/operation-system-db-api.js`, `assets/js/pages/shipping-plan.js`, `assets/js/pages/shipping-history.js`, `docs/planning/SHIPMENT_CENTER_SPEC.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. **Redeploy ALL `.gs` (new `12_shipment_handlers.gs` must be copied in); the `shipments` / `shipment_lines` tabs auto-create on first Execution Commit with the documented headers.** **Phase 1 does NOT reserve factory stock (deferred).**

## Weekly Shipping Plan — Save Refresh Bug Fix (2026-06-30)

**Frontend-only fix (no Apps Script / DB schema / spec change). Save no longer makes the Draft card disappear.**

- **Root cause:** Save → `updateShippingPlanLineQty` → `await loadOperationDb({force:true})`. When the forced reload's GET failed (common right after a write POST to Apps Script), `loadOperationDb`'s catch **replaced the good cloud cache with `_buildMockFallbackDb()`** (`_sourceMode='mock'`, no `shippingPlans`). That flipped `isCloudWriteEnabled()` / `_spUseDb()` to false → `renderShippingPlan()` fell to the legacy sessionStorage path → empty → the Draft card vanished. A manual refresh reloaded successfully and the card returned.
- **Fix 1 (`operation-system-db-api.js` `loadOperationDb`):** on a forced-reload failure, if a valid `google-sheet` cache already exists, **preserve it** (mark `_apiFailed`, keep `_sourceMode='google-sheet'`) instead of clobbering with mock. Initial-load behavior unchanged (still falls to mock when there is no prior cloud cache). This keeps cards visible on any post-write reload hiccup (Save/Submit/Approve/Cancel/Note) without changing their transition logic.
- **Fix 2 (`shipping-plan.js` `spDbSaveQty` + `_spPatchLocalQty`):** after a successful save write, patch the in-memory cache lines (`approvedQty` + recomputed `cartonQty`) from the saved values, then re-render — so the card stays in **Draft** with the new qty/cartons/totals even if the reload returned stale data. On write failure, the cards are kept on screen and only an error is shown (no destructive render).
- Save still **never** changes `shipping_plans.status`; `All Active` filter still shows draft/pending_approval/approved (verified, unchanged).
- **Files:** `assets/js/api/operation-system-db-api.js`, `assets/js/pages/shipping-plan.js`.

## Carrier / Route Foundation Tables — Spec Only (2026-06-30)

**Spec only. No code / frontend / Apps Script / DB migration / BigQuery / pricing engine. Created the foundation DB definition for the Carrier / Route layer.**

- **New spec** `docs/planning/CARRIER_AND_ROUTE_SPEC.md` (Draft v1.0) defines three foundation tables:
  - **`carriers`** — logistics-provider master (`carrier_id`, `carrier_code`, `carrier_name`, `carrier_type` air/sea/express/rail/courier/forwarder, `scac_code`, `default_currency`, contacts, `is_active`, audit).
  - **`carrier_rate_cards`** — price + validity source for the FUTURE engine (`rate_card_id`, `carrier_id` FK, `route_code`, `ship_from`, `destination`, `shipping_method`, `rate_type` per_kg/per_cbm/per_carton/per_container/flat, `unit_rate`, `currency`, `min_charge`, `fuel_surcharge_pct`, `duty_rate_pct`, `transit_days`, `valid_from`, `valid_to`, `is_active`, audit). **No calculation defined.**
  - **`shipping_route_rules`** — default `ship_from` / `destination` / `route_code` driver, keyed by `company` + `country` + `marketplace` + `shipping_method` (`route_rule_id`, `default_ship_from`, `default_destination`, `default_carrier_id` FK, `route_code`, `priority`, `is_active`, audit).
- **Behavior documented (not implemented):** `shipping_route_rules` pre-fills `ship_from` / `destination` / `route_code` on a Weekly Shipping Plan; **the Weekly Shipping Plan may OVERRIDE `ship_from` / `destination`** (those persist on `shipping_plans` and are part of the six-value group key). `route_code` is the shared join between route rules and rate cards for the future engine.
- **Cost Breakdown stays a placeholder** until the future **Carrier Price Engine** (not built here).
- **`DATABASE_RELATIONSHIP_MAP.md` §9** renamed to **Carrier / Route Layer**; added column definitions + relationships for the three tables (`shipping_route_rules → shipping_plans` default/override; `route_code` join; `carrier_lead_times` still deferred for ETA planning).
- **Files:** `docs/planning/CARRIER_AND_ROUTE_SPEC.md` (new), `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. **No table is migrated/created yet** (planned design).

## Shipment Overview Marketplace + Converted Plan Visibility (2026-06-30)

**Small UI fix + Execution-Commit writeback + spec sync. No SKU logistics schema, no CBM/weight, no factory deduction, no Carrier Engine, no Request Order/PO. Decision Snapshot untouched; no rows deleted.**

- **Part 1 — Shipment Overview Marketplace:** `shipping-history.js` shipment card header now shows **Marketplace** (from `shipments.marketplace`) left of Company → header = Marketplace / Company / Country / Method / Total Pcs / Cartons. `destination` intentionally not shown (not finalized).
- **Part 2 — Converted visibility:** a Weekly Shipping Plan that has been converted to a Shipment Draft (`transferred_shipment_id` set, `status` stays `approved`) is now grouped as **Converted** and **hidden from the default / All Active view**; viewable via the new **Converted** Status-filter option. Mirrors the soft-cancel hide rule; draft / pending_approval / cancelled rules unchanged. The Plan Rationale shows the converted shipment id.
- **Part 3 — Execution Commit writeback:** `createShipmentFromApprovedPlan_` now stamps `shipping_plans.transferred_to_shipment_at = now`, `transferred_shipment_id = shipment_id`, `updated_at = now` after creating the shipment. **Handoff metadata only — not a Decision Snapshot change (Immutable Flow preserved); rows + lines preserved; status NOT changed to deleted.** `setValue` skips columns absent from the live sheet (non-blocking until migrated).
- **New `shipping_plans` columns:** `transferred_to_shipment_at`, `transferred_shipment_id` (added to `SHIPPING_PLANS_HEADERS_`, db-api normalizer, WEEKLY §4, DATABASE_RELATIONSHIP_MAP §8).
- **Specs:** `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` → Draft v1.8 (§4, §9B filter list, §12.1 Converted visibility); `SHIPMENT_CENTER_SPEC.md` §2 (Marketplace display + copy note); `DATABASE_RELATIONSHIP_MAP.md` §8.
- **Files:** `assets/js/pages/shipping-history.js`, `assets/js/pages/shipping-plan.js`, `assets/html/pages/shipping-plan.html`, `assets/js/api/operation-system-db-api.js`, `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`, `assets/specs/active/apps-script/12_shipment_handlers.gs`, `docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`, `docs/planning/SHIPMENT_CENTER_SPEC.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. **Redeploy `11_*` + `12_*` `.gs`; add `transferred_to_shipment_at` / `transferred_shipment_id` headers to the `shipping_plans` tab so the handoff metadata persists.**

## SKU Details Logistics Schema Sync + UI Display (2026-06-30)

**Spec + frontend/API mapping. No DB migration (sheet headers already updated by user); no CBM/weight calculation, no Carrier/Duty/Factory/Request-Order/PO/Planning engine; no new table.**

- **`sku_details` logistics columns synced:** dimensions split into `*_length` / `*_width` / `*_height` + `*_dimension_unit` for **item / package / carton**; weights `*_weight` + `*_weight_unit`; **secondary item size** `item_length_2` / `item_width_2` / `item_height_2`; price units `declared_value_unit` / `minimum_price_unit` / `msrp_unit` / `selling_unit`; plus `units_per_carton`, `hscode`, `pm`, timestamps.
- **API normalizer** (`operation-system-db-api.js` `normalizeSkuDetailsRecord`): exposes all split fields + units; composes numeric `L x W x H` display strings (`itemDimensions` / `itemDimensions2` / `packageDimensions` / `cartonDimensions`); **legacy combined `*_dimensions` columns kept as fallback**.
- **SKU Details UI** (`sku-details.js`): Item Dimensions cell now shows **two lines** when the secondary size is present (primary line 1, secondary line 2; shared `item_dimension_unit`). Each line is a numeric `.dim-line` span so the **CM/IN unit toggle still converts per line** (`convertSkuUnitValues` updated). Price cells show **`{value} {unit}`** inline (prices have no metric/imperial toggle). Debug export/import schema arrays updated to the new headers.
- **Secondary item size is DISPLAY ONLY** — never used in carton CBM / logistics.
- **Shipment CBM / weight basis documented** (`SHIPMENT_CENTER_SPEC.md` §15.3, `SKU_DETAILS_LOGISTICS_SPEC.md` §4): `carton_cbm = carton_length*carton_width*carton_height/1e6` (cm), `cbm = carton_qty*carton_cbm`, `gross_weight = carton_qty*carton_weight`, `net_weight = qty*item_weight`; units read from `*_dimension_unit` / `*_weight_unit` (never hard-coded). **Calculation NOT implemented** this task.
- **New spec** `docs/planning/SKU_DETAILS_LOGISTICS_SPEC.md` (Draft v1.0); `DATABASE_RELATIONSHIP_MAP.md` §3 sku_details column list; `SHIPMENT_CENTER_SPEC.md` §15.3.
- **Files:** `assets/js/api/operation-system-db-api.js`, `assets/js/pages/sku-details.js`, `docs/planning/SKU_DETAILS_LOGISTICS_SPEC.md` (new), `docs/planning/DATABASE_RELATIONSHIP_MAP.md`, `docs/planning/SHIPMENT_CENTER_SPEC.md`. **No Apps Script change; no DB migration (headers already in the sheet).**

## Shipping Plan Logistics Calculation Phase 1 — CBM / Weight Runtime (2026-06-30)

**Spec + runtime calculation + small UI. Computes Shipping Plan line CBM/weight from sku_details and copies to Shipment. No Factory Allocation/Stock, Carrier recommendation/rate engine, Request Order/PO, Inventory Runtime, or Decision Engine touched; Decision Snapshot / Immutable Flow / Execution Commit semantics preserved.**

- **SKU Details item dimension UI:** now one cell, `A × B × C + A2 × B2 × C2 {unit}` (or `A × B × C {unit}` when no secondary) — single cell, inline unit; each numeric group still converts under the CM/IN toggle and the inline unit suffix flips cm↔in. (`sku-details.js` `_skuItemDimCell`, normalizer `dim3` now joins with `×`.)
- **shipping_plan_lines logistics (Decision Snapshot):** added **`cbm`, `gross_weight`, `net_weight`** columns. Computed server-side from `sku_details` (`carton_length/width/height` + `carton_dimension_unit` cm, `carton_weight`, `item_weight`, `units_per_carton`):
  - `carton_cbm = L×W×H/1,000,000` (cm only; other units reserved → 0); `cbm = carton_qty×carton_cbm`; `gross_weight = carton_qty×carton_weight`; `net_weight = approved_qty×item_weight`.
  - Written at **Submit Plan** (`handleCreateShippingPlansBatch_`) and **recomputed on every Draft Save** (`handleUpdateShippingPlanLineQty_`). Frozen (read-only) once Pending/Approved.
- **Save behavior:** Save now persists `approved_qty` + `carton_qty` + **`cbm`/`gross_weight`/`net_weight`** (no need to wait for Submit). Frontend `_spPatchLocalQty` + live `spDbOnQtyInput` recompute them so the card updates instantly.
- **Shipping Plan header Runtime totals:** each card shows **Total CBM / Total Gross Wt / Total Net Wt = Σ line values** (Runtime; NOT stored on `shipping_plans`). Updates live while editing qty.
- **Execution Commit copy:** `createShipmentFromApprovedPlan_` copies line `cbm/gross_weight/net_weight` into `shipment_lines` (Execution Snapshot, no recompute) and sums `shipments.total_cbm/total_gross_weight/total_net_weight` (Shipment header **stores** the totals).
- **New columns:** `shipping_plan_lines.cbm/gross_weight/net_weight` (headers in `11_shipping_plan_handlers.gs` + normalizer). `shipment_lines.cbm/gross_weight/net_weight` and `shipments.total_*` already existed (Execution Commit task).
- **Specs:** `SKU_DETAILS_LOGISTICS_SPEC.md` §3 (A+B display) / §4 (calc); `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` → v1.9 (§5.1, §5.4, §6, §8, §9A); `SHIPMENT_CENTER_SPEC.md` §15.3 (copy + header totals); `DATABASE_RELATIONSHIP_MAP.md` §8.
- **Files:** `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`, `assets/specs/active/apps-script/12_shipment_handlers.gs`, `assets/js/api/operation-system-db-api.js`, `assets/js/pages/shipping-plan.js`, `assets/js/pages/sku-details.js`, `docs/planning/SKU_DETAILS_LOGISTICS_SPEC.md`, `docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`, `docs/planning/SHIPMENT_CENTER_SPEC.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. **Redeploy `11_*` + `12_*` `.gs`; add `cbm` / `gross_weight` / `net_weight` headers to the `shipping_plan_lines` tab (and ensure `shipment_lines` has them + `shipments` has `total_cbm/total_gross_weight/total_net_weight`).** No new table; no DB migration script.

### Addendum — `carton_cbm` added to logistics snapshot (2026-06-30)
- User added a **`carton_cbm`** column to `shipping_plan_lines`. Synced: `carton_cbm` = single-carton CBM (`carton_length × carton_width × carton_height ÷ 1,000,000`, cm) is now part of the **logistics Decision Snapshot** alongside `cbm` / `gross_weight` / `net_weight`.
- Written at **Submit Plan** and **recomputed on every Draft Save** (`shippingPlanLineLogistics_` now returns `carton_cbm`; `SHIPPING_PLAN_LINES_HEADERS_` + update-qty handler include it). **Execution Commit copies `carton_cbm` → `shipment_lines.carton_cbm`** (no recompute; `SHIPMENT_LINES_HEADERS_` + copy updated). Normalizers (`shipping_plan_lines` + `shipment_lines`) expose `cartonCbm`; frontend `_spLineLogistics` / `_spPatchLocalQty` set it.
- **Save DOES recompute the logistics fields** (`carton_cbm` / `cbm` / `gross_weight` / `net_weight`) every time `approved_qty` changes — not deferred to Submit.
- Specs synced: `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §5.1/§5.4/§8/§9A, `SHIPMENT_CENTER_SPEC.md` §2/§15.3, `DATABASE_RELATIONSHIP_MAP.md` §8.
- **Add a `carton_cbm` header to the `shipping_plan_lines` tab and to `shipment_lines`** when redeploying.

## Shipment Phase 2 — Shipment Draft / Overview UI + Menu (2026-06-30)

**Existing-page update + menu setup + Shipment UI mapping. No factory stock deduction/allocation, no Carrier/Cost engine, no Request Order/PO/Export, no Inventory Runtime; no Decision Snapshot / CBM / weight recalculation (all copied). No Apps Script change (reused `updateShipment`). No DB schema change.**

- **Menu:** added a **Shipment Center** parent (`toggleMenu('shipment')`) with **Shipment Draft** + **Shipment Overview** children (replaces the lone "Shipment Overview" item; the disabled "Shipping Management (Stage 2)" placeholder left untouched). Both call `showShipmentDraft()` / `showShipmentOverview()` → same `shippinghistory-section`, different **view mode**.
- **View mode (`window.KM.shipmentViewMode`):** `draft` shows `draft`/`planned`/`ready_to_ship`; `overview` shows all **non-draft**. Page title updates to "Shipment Draft" / "Shipment Overview". Both read `shipments` / `shipment_lines` (cloud DB).
- **Card header:** Shipment No · Status · **Marketplace** · Company · Country · Method · Total Pcs · Total Cartons · **Total CBM / Gross / Net** · **ETD / ETA**.
- **SKU lines:** SKU · Qty · Cartons · **Carton CBM · CBM · Gross Wt · Net Wt** · (Decision Snapshot Current Stock / Avg Sales / DoS, greyed read-only).
- **Editable execution fields (Draft page only):** carrier_id, booking_no, container_no, bl_no, invoice_no, etd, eta, tracking_number, note → `updateShipment` whitelist (Save). **Overview = read-only fields.** Snapshot / qty / carton_qty / carton_cbm / cbm / gross_weight / net_weight are **never editable**.
- **Status-advance placeholder:** per-card "Advance →" button steps `draft → planned → ready_to_ship → shipped → in_transit → delivered → completed` via `updateShipment({status})`; available while non-terminal on both pages. **No factory-stock side effects** (deferred). `shipped` / `delivered` are Phase-2 placeholder statuses (pending §15 status-granularity Open Question).
- **API/Apps Script:** none changed — `updateShipment` already whitelists execution fields + `status`; `shAdvanceStatus` reuses it.
- **Specs:** `SHIPMENT_CENTER_SPEC.md` §4/§5 (Phase 2 notes), `SUPPLY_CHAIN_SYSTEM_FLOW.md` (Execution Layer Phase 2 pages), `DATABASE_RELATIONSHIP_MAP.md` §8.
- **Files:** `index.html` (menu), `assets/js/pages/shipping-history.js` (view mode, header/line columns, status buttons, menu wrappers), `docs/planning/SHIPMENT_CENTER_SPEC.md`, `docs/planning/SUPPLY_CHAIN_SYSTEM_FLOW.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. No `.gs` / DB change. (Shipment line CBM/weight columns must exist from the prior logistics task for them to display.)

## Supply Chain Architecture v1.2 — Four Layers + Decision Layer Completion (2026-06-30)

**Architecture + spec + small feature. Establishes the four-layer architecture (Analysis → Decision → Execution → Settlement) and the Weekly Shipping Plan "Done" (Decision Layer Completion). No change to Shipment / Shipment Lines / Factory / Carrier / PO / RO / Runtime / Decision Snapshot / Execution Snapshot; no row deletes.**

- **Architecture v1.2** (`SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`): added §10 **Supply Chain Layer Lifecycle** (4 layers, per-layer owner/truth/lifecycle), §11 **Truth Flow extended to Settlement**, §12 **Layer Responsibility**; added **Settlement Truth** + **Decision Layer Completion** to §1A. Decision Layer lifecycle = Draft → Pending Approval → Approved → Execution Commit → **Completed**. Execution Layer lifecycle = Draft → Booked → Ready to Ship → Shipped → In Transit → Arrived → Received → Closed. Settlement Layer = final immutable records (documents / history / audit / KPI).
- **Weekly Shipping Plan Done (Decision Layer Completion):** new `shipping_plans.completed_at` / `completed_by`. An **Approved + transferred** card now shows a **Done** button (confirm dialog) → `completeShippingPlan` writes only `completed_at = now` / `completed_by = system_user` (+ `updated_*`), **never touches the Shipment**, status stays `approved`. The plan then **leaves the Active view** (`completed_at IS NULL` only) and stays hidden after refresh; preserved in DB; viewable via the new **Completed** Status-filter. **Supersedes the v1.8 "Converted auto-hide on transfer"** — transferred-but-not-completed plans stay in Approved with the Done button.
- **Apps Script:** `11_shipping_plan_handlers.gs` +2 headers (`completed_at`/`completed_by`) + `handleCompleteShippingPlan_` (guard: approved + transferred); `01_router.gs` action `completeShippingPlan`. **No Shipment handler change.**
- **DB API:** normalizer +`completedAt`/`completedBy`; write method `completeShippingPlan`.
- **Frontend:** `shipping-plan.js` — `_spCompleted`/`_spTransferred` helpers, Done button on approved+transferred cards, `spDbDone`, Completed bucket/section, `filterByStatus` Converted→Completed, rationale shows completion; `shipping-plan.html` — Completed section + filter option (replaced Converted).
- **Specs:** `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` v1.2 (§1A/§10/§11/§12), `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` v1.10 (§4/§9B/§12.1/§12.2/§13A), `SHIPMENT_CENTER_SPEC.md` §3 (Execution Layer Lifecycle), `SUPPLY_CHAIN_SYSTEM_FLOW.md` (flow incl. Completed + Settlement), `DATABASE_RELATIONSHIP_MAP.md` §8.
- **Files:** `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`, `01_router.gs`, `assets/js/api/operation-system-db-api.js`, `assets/js/pages/shipping-plan.js`, `assets/html/pages/shipping-plan.html`, `docs/planning/SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md`, `docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`, `docs/planning/SHIPMENT_CENTER_SPEC.md`, `docs/planning/SUPPLY_CHAIN_SYSTEM_FLOW.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. **Redeploy `11_*` + `01_router` `.gs`; add `completed_at` / `completed_by` headers to the `shipping_plans` tab** so Done persists (until added, `setValue` skips them and the card won't hide after refresh).

## Shipment Center Menu + Shipment Draft Lifecycle Redesign (2026-07-01)

**Spec + existing-UI refactor. No factory stock, Carrier engine, RO/PO, Decision Snapshot recompute; no `shipments`/`shipment_lines` row deletes.**

- **Menu:** the standalone "Shipping Plan" item moved **under Shipment Center**. Now **Shipment Center → Weekly Shipping Plan / Shipment Draft / Shipment Overview** (no function removed — `showSection('shippingplan')` reused).
- **Shipment Draft = execution working area** (three sections, only `hidden_from_draft_at IS NULL`): **Draft** (`status=draft`; fields editable; Save / Ready to Ship), **Ready to Ship** (`status=ready_to_ship`; fields editable; Save / Ship), **Shipped** (`status=shipped`; read-only; Done).
- **Save vs Ship:** **Save** (`updateShipment`, no status) updates execution fields only — **does NOT enter Overview**. **Ship** validates required fields then `status=shipped` + stamps **`shipped_at` / `shipped_by`** — **only Ship makes it official**; then it appears in Overview.
- **Required-before-Ship** (frontend + server-side in `updateShipment`): `carrier_id`, `etd`, `eta`, (`tracking_number` OR `booking_no`), `total_qty>0`, `total_cartons>0`. Missing → error, Ship blocked.
- **Shipment Overview = official view:** shows only `shipped` / `in_transit` / `arrived` / `received` / `closed`; read-only fields; per-card Advance → steps the post-ship lifecycle. `draft` / `ready_to_ship` never shown.
- **Done:** Shipped card's Done sets **`hidden_from_draft_at` / `hidden_from_draft_by`** (new columns) → hidden from the Shipment Draft workspace; **still in Overview; not deleted; status unchanged**. (Minimal-change design: `hidden_from_draft_*`, not `completed_*`, since the shipment lifecycle continues.)
- **New `shipments` columns:** `shipped_at`, `shipped_by`, `hidden_from_draft_at`, `hidden_from_draft_by` (headers in `12_shipment_handlers.gs` + db-api normalizer). Execution status flow updated to `draft → ready_to_ship → shipped → in_transit → arrived → received → closed`.
- **Apps Script:** `handleUpdateShipment_` extended — Ship gate (required-field validation) + stamps `shipped_at`/`shipped_by` on `→shipped`; handles `hidden_from_draft` (Done). No new action; no Shipment Commit change.
- **Specs:** `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §10, `SUPPLY_CHAIN_SYSTEM_FLOW.md`, `SHIPMENT_CENTER_SPEC.md` §2/§3/§4/§5, `DATABASE_RELATIONSHIP_MAP.md` §8.
- **Files:** `index.html` (menu), `assets/js/pages/shipping-history.js` (draft sections, Save/ReadyToShip/Ship/Done, overview filter), `assets/specs/active/apps-script/12_shipment_handlers.gs`, `assets/js/api/operation-system-db-api.js`, `docs/planning/*`. **Redeploy `12_shipment_handlers.gs`; add `shipped_at` / `shipped_by` / `hidden_from_draft_at` / `hidden_from_draft_by` headers to the `shipments` tab** (until added, Ship/Done still change status but the timestamps won't persist).

## Weekly Shipping Plan Done Fix + Shipment Draft UI Refinement (2026-07-01)

**Bug fix + UI refinement + spec sync. No Factory Stock / Carrier engine / RO / PO / Inventory runtime; no PK change; no row deletes; no snapshot recompute.**

- **Root cause (Done button missing):** the Approved card's Done relied on `plan.transferredShipmentId` / `transferred_to_shipment_at`, which never persisted because those headers were absent on the live `shipping_plans` tab (writeback silently skipped). **Fix:** (a) frontend now also detects transfer by **an existing `shipments` row for the plan** (`getShipments()` map) so Done shows regardless; (b) Apps Script **auto-adds missing columns** — `completeShippingPlan` ensures `completed_at`/`completed_by`; `createShipmentFromApprovedPlan_` / `updateShipment` ensure `transferred_*` / `external_shipment_id` / `shipped_*` / `hidden_from_draft_*` / line `carton_no_*`. `sheetEnsureColumns_` helper added.
- **Weekly Shipping Plan Done:** condition `status=approved` + transferred + `completed_at` empty → Done; writes `completed_at`/`completed_by`; plan leaves Active view (preserved; Completed filter). (unchanged semantics; now actually works.)
- **Shipment Draft filter:** legacy big bar hidden; compact top-right **Country / Marketplace** filter injected.
- **Shipment Draft header:** Marketplace · Company · Country · **Destination (`--` if blank)** · Method · Pcs · ETD · ETA.
- **SKU Lines:** clean title "SKU Lines"; columns SKU / Qty / Cartons / Carton CBM / CBM / Gross Wt / Net Wt / **Carton No Start / Carton No End (editable numeric)** + totals row (Total SKU / Qty / Ctn. / CBM / Gross / Net). Carton numbers saved to `shipment_lines` via `updateShipment { lines }`.
- **Execution Fields (redesigned 2-col form):** **Shipment ID = `external_shipment_id` (editable)** — internal `shipment_id` PK shown read-only, never editable; auto-generated `COMPANY-MARKETPLACE-COUNTRY-YYYYMMDD-###`. **Carrier read-only.** reference_id / warehouse_code / tracking / booking / container / BL / invoice / ETD / ETA / Remark editable.
- **New DB columns:** `shipments.external_shipment_id`; (`shipment_lines.carton_no_start/end` already existed). Execution status flow unchanged (`draft→ready_to_ship→shipped→in_transit→arrived→received→closed`). Warehouse_id future-mapped from destination (spec only).
- **Specs:** `SHIPMENT_CENTER_SPEC.md` §2/§4, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §12.2, `DATABASE_RELATIONSHIP_MAP.md` §8.
- **Files:** `assets/js/pages/shipping-plan.js`, `assets/js/pages/shipping-history.js`, `assets/js/api/operation-system-db-api.js`, `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`, `assets/specs/active/apps-script/12_shipment_handlers.gs`, `docs/planning/*`. **Redeploy `11_*` + `12_*` `.gs`** — columns auto-add on first write, but redeploy is required for the new handler logic.

## Shipment Draft Bug Fix + Carton Validation + External ID Refinement (2026-07-01)

**Bug fix + UI refinement + spec sync. No Factory Stock / Carrier engine / RO / PO / Inventory runtime / Role Permission; no `shipment_id` PK change; no row deletes; no Decision Snapshot recompute.**

- **Done "not transferred" bug (Part 1):** `handleCompleteShippingPlan_` no longer relies solely on `transferred_shipment_id`. If it's blank it looks up an existing `shipments` row for the plan (new shared helper `shipmentFindForPlan_` in `12_shipment_handlers.gs`, matching `shipping_plan_id` / `source_shipping_plan_id` / `plan_id`) and **backfills `transferred_shipment_id` + `transferred_to_shipment_at`** (auto-adding columns) before writing `completed_at` / `completed_by`. An Approved plan that truly has a Shipment Draft can now always be completed.
- **External Shipment ID format (Part 2):** default reformatted from `COMPANY-MARKETPLACE-COUNTRY-YYYYMMDD-###` to **`COMPANY-MKT-YYMMDD-##`** — company uppercased no-spaces; marketplace short code (`Amazon→AMZ`, `Walmart→WMT`, `Shopify→SHP`, `eBay→EBY`, `Target→TGT`, `Wayfair→WYF`, else first 3 chars); 2-digit daily serial per company+marketplace(+country). e.g. `RESUS-AMZ-260701-01`. Helper `shipmentMarketplaceAbbrev_`.
- **Card header shows external ID (Part 3):** first header field = `external_shipment_id` (fallback `shipment_no` → internal `shipment_id`); refreshes after Save (`_shLoadAndRender` reload). Internal `shipment_id` never editable.
- **`shipment_lines.cbm` → `carton_cbm` (Part 4/5):** user renamed the column. `carton_cbm` = single-carton CBM (only stored CBM column); Execution Commit copies `shipping_plan_lines.carton_cbm` (fallback: compute from `sku_details` carton dims), drops the line `cbm` write; `total_cbm = Σ(carton_cbm × carton_qty)`. SKU Lines show **Carton CBM only** (CBM column removed); columns SKU / Qty / Cartons / Carton CBM / Gross Wt / Net Wt / **Carton No. Start / End**; totals row shows **Total Carton CBM = Σ(carton_cbm × carton_qty)**.
- **Carton No. validation (Part 6):** integers only, `start ≤ end`, non-overlapping within a shipment — enforced frontend (`_shValidateCartons`, red border + message) AND server-side (`shipmentValidateCartons_`). Blocks Save / Ready to Ship / Ship.
- **Required before Ship (Part 7):** now `external_shipment_id`, Carton No. Start/End (every line), `reference_id`, `warehouse_code`, `etd`, `eta` (+ `total_qty>0`). `tracking_number` / `booking_no` no longer required. Enforced frontend (`shShip`) + `updateShipment` ship gate.
- **Remark mapping (Part 8):** UI Remark = `shipments.note` (confirmed; documented in `SHIPMENT_CENTER_SPEC.md` §4).
- **Return to Draft (Part 9):** future revision rule + reserved **← Return to Draft** button on Ready to Ship cards → prompts required reason (appended to `shipments.note` via `revision_reason`) and sets `status=draft`. No permissions yet. Future `shipment_revision_log` table documented (NOT created).
- **Specs:** `SHIPMENT_CENTER_SPEC.md` (v2.4: §2/§4/§5B/§12/§12A/§15.3), `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` (v1.11: §12.2), `DATABASE_RELATIONSHIP_MAP.md` §8.
- **Files:** `assets/js/pages/shipping-history.js`, `assets/specs/active/apps-script/11_shipping_plan_handlers.gs`, `assets/specs/active/apps-script/12_shipment_handlers.gs`, `docs/planning/SHIPMENT_CENTER_SPEC.md`, `docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`. **Redeploy `11_*` + `12_*` `.gs`** — columns auto-add on first write; redeploy required for the new handler logic. **User already renamed `shipment_lines.cbm` → `carton_cbm` in the sheet.**

## Inventory Replenishment — Recommendation Summary + Execution Plan (2026-07-01)

**Spec update + first-version UI refactor. No AI Recommendation Engine, no Carrier Rate Engine, no Factory Allocation Engine, no Inventory runtime recompute; Submit Plan / Weekly Shipping Plan / Shipment Draft / Overview unchanged in mechanism.**

- **Second-layer right panel redefined** (`inventory-replenishment.js` + `.css`): the legacy trio **AI Suggestion / Shipping Allocation / Shipping Plan Suggestions** is replaced by two blocks — **Recommendation Summary** (top) and **Execution Plan** (bottom). `Shipping Plan Suggestions` removed; `Shipping Allocation` is now a legacy name.
- **Recommendation Summary (read-only system suggestion, NOT submitted):** table **Target Window / Suggested Qty / Suggested Route / Reason** over rows `0–18d / 19–30d / 31–45d / 46–90d / Total`. Suggested Qty from existing need-bucket data; **Suggested Route = `--`** and **Reason = `AI Pending`/`Stock Sufficient`** placeholders (no AI engine). New helper `_recSummaryRows`.
- **Execution Plan (submitted):** route list **Ship From / Destination / Suggested Qty / Shipping Method / Delete** + **`+ Add Route`**. First version: manual entry. New functions `addExecutionRoute` / `removeExecutionRoute` / `_renderExecutionRoute` / `onExecutionRouteEdit`; rewrote `_saveAllocationDraftFromDom`, `initializeShippingAllocation`, `updateShippingAllocationTotal`, `validateAllocationCartons` to the route-row model. Carton-multiple gate unchanged.
- **Terminology:** Recommendation Summary = 系統建議摘要 (not submitted); Execution Plan = 使用者實際提交到 Weekly Shipping Plan 的出貨計畫. **Submit Plan uses the Execution Plan only.**
- **API-ready:** Execution Plan lives in centralized JS state (`window.KM.shippingAllocationDraft`); **Submit Plan reads ONLY the Execution Plan state** (removed the old AI-default fallback that read need buckets); `sessionStorage` = recovery only; writes go through `KM.DB.createShippingPlansBatch`. `ship_from` / `destination` now threaded from Execution Plan routes into `shipping_plan_lines`.
- **Route Rule spec:** `CARRIER_AND_ROUTE_SPEC.md` v1.1 — new **`replenishment_route_rules`** (§5A, Part 4 columns) for Inventory Replenishment / Recommendation Summary / Execution Plan defaults; **explicitly distinct from `shipment_routes`** (Shipment/World Map/in-transit only). Added **`carrier_lead_times`** (§4A) and the **import-oriented `carrier_rate_cards` column variant** (§4.1). Carrier tables (`carriers` / `carrier_rate_cards` / `carrier_lead_times`) synced to spec — no Carrier Engine.
- **Specs updated:** `INVENTORY_TABLE_MAPPING_SPEC.md` v1.5 (§11 rewrite + §11.4 API-ready), `CARRIER_AND_ROUTE_SPEC.md` v1.1, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` v1.12 (§2A/§3 Execution Plan terminology), `DATABASE_RELATIONSHIP_MAP.md` §9 (replenishment_route_rules + carrier_lead_times), `SUPPLY_CHAIN_SYSTEM_FLOW.md` §5.1 (Recommendation Summary → Execution Plan → Submit), `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §8A (Execution Plan Working Draft Principle).
- **Files:** `assets/js/pages/inventory-replenishment.js`, `assets/css/pages/inventory-replenishment.css`, `docs/planning/{INVENTORY_TABLE_MAPPING_SPEC,CARRIER_AND_ROUTE_SPEC,WEEKLY_SHIPPING_PLAN_MAPPING_SPEC,DATABASE_RELATIONSHIP_MAP,SUPPLY_CHAIN_SYSTEM_FLOW,SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES}.md`. **No Apps Script / DB change required** (frontend + spec only; `replenishment_route_rules` / `carrier_lead_times` are future tables, not migrated).

## Inventory Replenishment — Expanded Row Layout Fix (2026-07-01)

**UI / CSS fix only. No Submit Plan logic, Execution Plan data structure, Apps Script, DB, Weekly Shipping Plan, Shipment, Recommendation calculation, or Carrier/Route/AI engine change.**

- **Stacked planning column:** Recommendation Summary and Execution Plan are now **stacked vertically** (Recommendation above Execution) inside one `.ir-panel-column--planning`, instead of side-by-side. Both blocks now carry the base **`.replen-card`** class → same white / border / radius / padding styling as the left detail cards.
- **Single overflow strategy (Part 1/4):** removed the nested `overflow-x: auto` on `.replen-expand-scroll` (consolidated the two duplicate rules) → the expanded row no longer creates its own scrollbar; panels **wrap** (`flex-wrap: wrap`). The only horizontal scroll is the main table's `.scroll-col`. No `overflow-y` / `max-height` anywhere in the expanded row → **no nested vertical scrollbar**; height is content-driven. (The two remaining `overflow-y:auto` rules are modals — `.replen-import__result` + import modal — unrelated.)
- **Execution Plan grid:** header row + every route row share one CSS grid class **`.ir-exec-plan__grid`** (`1fr 1fr 72px 1fr 24px`) so columns align; route inputs use `min-width: 0` to shrink inside grid tracks without overflowing. Moved inline styles (title-row, add-route button, grid) into CSS classes (`.replen-card__title-row`, `.replen-card__add-route-btn`, `.ir-exec-plan__grid--head`, `.replen-recsum-table`).
- **Responsive (Part 3):** added `@media (max-width: 900px)` → the whole expanded row collapses to a single top-to-bottom column (inventory group / columns / planning column all full-width; `.replen-card-grid` → 1 column). No hard-coded over-wide widths in the planning column (`flex: 1 1 320px; min-width: 260px; max-width: 460px`).
- **Sticky header (Part 5):** verified `.table-header-bar { position: sticky; top: 72px; z-index: 120 }` and `.fixed-col` sticky are intact and unaffected; removing the nested expand-row scroll + side-by-side over-wide layout restores the correct sticky/top-aligned two-row header behavior. No ancestor `overflow` was introduced.
- **Spec:** `INVENTORY_TABLE_MAPPING_SPEC.md` v1.5.1 — new **§11.5 expanded-row layout rule** (stacked planning blocks; no nested scrollbars; main-table horizontal scroll is the single strategy; responsive card-grid).
- **Files:** `assets/js/pages/inventory-replenishment.js` (planning-column wrapper markup + shared grid class), `assets/css/pages/inventory-replenishment.css` (expand-scroll wrap, planning column, rec/exec card styling, responsive media query), `docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md`. **No Apps Script / DB / other-page change.**

## Inventory Replenishment — Expanded Row Layout v2 Fix (2026-07-01)

**UI / CSS fix only. No Submit Plan logic, Execution Plan state, Recommendation calculation, Apps Script, DB, Weekly Shipping Plan, Shipment, or Carrier/Route/AI engine change.**

- **Layout v2 — four horizontal groups, each stacking vertically:** A = inventory state (Stock / LTS / Shipping / 3rd Party, kept as the 2×2 small-card group), B = planning context (Forecast / Upcoming Event, **narrowed** to ≈190px), C = recommendation insight (**Sales Trend → Recommendation Summary**), D = decision action (**Achievement Rate → Execution Plan**). Recommendation Summary and Execution Plan **no longer share one narrow vertical stack** — they now live under Sales Trend / Achievement Rate respectively. New group classes `.ir-panel-column--context / --insight / --action` (replaced `--planning`).
- **Overflow hardening (no content exceeds card/container):** `#ops-section .replen-expand-scroll > * { min-width: 0 }`; cards inside columns + `.replen-card-grid` children + card rows/labels `min-width: 0` (labels ellipsis); Recommendation Summary table `table-layout: fixed` with cell ellipsis (removed the `.replen-recsum-table-wrap` overflow-x box → **no nested horizontal scrollbar**); Execution Plan grid `grid-template-columns: minmax(0,1fr) minmax(0,1fr) 52px minmax(0,1fr) 22px` so tracks shrink; inputs/selects `min-width:0`; **Delete `×` button fixed in a 22px track** (no longer spills out). Cards use `overflow: hidden` as a boundary safety.
- **Recommendation Summary spacing (Part 3):** title `margin-bottom: 6px`, table sits directly under the title (no wrapper div / extra top margin).
- **Execution Plan width (Part 4):** all five columns (Ship From / Destination / Qty / Method / Delete) stay inside the card; header labels shortened (`Qty` / `Method`) + ellipsis so they never overflow.
- **Responsive (Part 5):** `@media (max-width: 900px)` collapses all four groups to a single top-to-bottom column (`--context/--insight/--action` + inventory group full-width, `.replen-card-grid` → 1 col); nothing falls outside the expanded-row container. The main table remains the single horizontal-scroll surface; the expanded row scrolls with it.
- **Sticky header (Part 6):** `.table-header-bar { position: sticky; top: 72px; z-index: 120 }` and `.fixed-col` sticky verified intact; no ancestor `overflow` introduced; the removal of nested expand-row scrollbars restores correct sticky/top-aligned behavior.
- **Spec:** `INVENTORY_TABLE_MAPPING_SPEC.md` v1.5.2 — §11.5 rewritten as **Expanded Row Layout v2** (group A/B/C/D table; no content exceeds card/container; single main-table overflow; no inner scrollbars).
- **Files:** `assets/js/pages/inventory-replenishment.js` (expand-row regroup markup), `assets/css/pages/inventory-replenishment.css` (group columns, overflow safety, exec grid minmax, rec table fixed layout, title spacing, responsive), `docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md`. **No Apps Script / DB / other-page change.**

## Inventory Replenishment — Expanded Row Layout v3 (Stable Horizontal) (2026-07-01)

**UI / CSS fix only. No Submit Plan logic, Execution Plan state, Recommendation calculation, Apps Script, DB, Weekly Shipping Plan, Shipment, or Carrier/Route/AI engine change.**

- **Root cause:** v2 used `flex-wrap` + an `@media (max-width:900px)` single-column reflow on the expanded row. On small screens the groups reflowed vertically and the scroll panel's height (measured once by `syncExpandPanelHeight`) went stale relative to the reflowed content, so the expanded content visually overlapped the next SKU row (CO1100-S/-T). Recommendation Summary / Execution Plan were also over-compressed and clipped (ellipsis).
- **Layout Strategy v3 (fixed-width horizontal, no reflow):** `.replen-expand-scroll` → `flex-wrap: nowrap; align-items: stretch; overflow: visible`. Four groups with **fixed widths, no shrink/grow/wrap**: A (`.ir-panel--inventory-group`) 320px, B (`.ir-panel-column--context`) 240px, C (`.ir-panel-column--insight`) 400px, D (`.ir-panel-column--action`) 420px. **Removed the `@media (max-width:900px)` reflow block.** The row extends past the viewport and is viewed via the main table's `.scroll-col` horizontal scroll (same as layer 1). Also fixed `.replen-expand-section--inventory` (was width:360 → width:100%/min-width:0) to fit the 320 group.
- **Row overlap fix:** expanded row is content-height (no `position:absolute`, no `transform`, no height-collapsing children); `syncExpandPanelHeight` still equalizes the fixed-col and scroll-col panels to `max(...)` so neither clips → bottom always sits above the next SKU row. Stable now that content height no longer depends on viewport width.
- **Recommendation Summary UI:** removed the "(system suggestion — not submitted)" title note (title = just "Recommendation Summary"); title `margin-bottom: 6px`; columns renamed **Window / Qty / Route / Reason**; table `white-space: normal` (full text, wrap if needed) — **no ellipsis**, `Stock Sufficient` shown complete; font 12px.
- **Execution Plan UI:** columns **From / To / Qty / Method / X**; grid `minmax(90px,1fr) minmax(90px,1fr) 56px minmax(96px,1fr) 28px`, `gap: 6px`; Method select and `X` never overlap; `X` in a 28px track (justify-self:center) so it never touches the card edge; input placeholders shortened to From / To.
- **Top-card alignment (best-effort):** `.replen-card--sales-trend, .replen-card--achievement { min-height: 150px }`; `align-items: stretch` makes the four group boxes equal height; charts not squeezed.
- **Sticky header (Part 6/11):** `.table-header-bar` sticky + `.fixed-col` sticky untouched and verified; no ancestor overflow introduced.
- **Spec:** `INVENTORY_TABLE_MAPPING_SPEC.md` v1.5.3 — §11.5 rewritten as **Expanded Row Layout v3** (fixed-width horizontal groups; no vertical reflow; main-table scroll; no overlap; readable Recommendation/Execution labels without header ellipsis).
- **Files:** `assets/js/pages/inventory-replenishment.js` (labels: Window/Qty/Route/Reason, From/To/Qty/Method/X, removed title note, From/To placeholders), `assets/css/pages/inventory-replenishment.css` (nowrap+stretch expand-scroll, fixed group widths, removed media query, rec table no-ellipsis, exec grid widths, top-card min-height), `docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md`. **No Apps Script / DB / other-page change.**

## Amazon Daily Sales — Incremental Rolling Upsert Snapshot (2026-07-01)

**Apps Script optimization + spec sync. Scope: `amazon_daily_sales_snapshot` ONLY. No change to Inventory / Health / Weekly Sales importers, no BigQuery schema change, no frontend, no replenishment calculation. No header deletion. BigQuery history never pruned.**

- **Problem:** `runAmazonSnapshotImport_` previously re-read a rolling 30-day window from BigQuery and handed it to `amazonWriteSnapshot_`, which **cleared + rewrote all data rows** every day. Acceptable for true snapshots, wasteful for Daily Sales as a daily job.
- **New write mode `rolling_upsert` (Daily Sales only):** config 4 gains `writeMode: 'rolling_upsert'`, `retentionDays: 30`, `incrementalDefaultDays: 1` (`lookbackDays: 30` kept as backfill ceiling). Each daily run reads **only new completed-day data (default 1 = yesterday, excludes today)**, **UPSERTs** by natural key `snapshot_date + country + marketplace + channel + sku` (existing key → update in place; new key → append), then **prunes** destination rows with `snapshot_date < today − 30d`. Header + all non-batch rows preserved — **no full-table wipe**. Google Sheet keeps a rolling 30 completed days; **BigQuery keeps full history (never pruned).**
- **Backfill:** POST `{ action:'runAmazonSnapshotImports', destination_table:'amazon_daily_sales_snapshot', backfill_days: N }` re-reads the last N completed days (capped at 30) and upserts them — still no wipe; safe to re-run. Default (scheduler / no `backfill_days`) reads just yesterday.
- **New function** `amazonUpsertRollingSnapshot_(spreadsheetId, sheetName, destObjs, naturalKey, dateField, retentionDays, tz)` (09) — reads dest header, builds existing-row map by natural key, updates existing / appends new, prunes by date (`amazonRollingCutoffDate_` helper), preserves header, returns `{rowsWritten, updated, appended, pruned, total}`.
- **Runner (07):** `runAmazonSnapshotImport_(config, triggeredBy, options)` now threads `options.backfillDays`; write step branches on `writeMode==='rolling_upsert'` (else legacy `amazonWriteSnapshot_`); `ctx.rowsPruned` added; `handleRunAmazonSnapshotImports_` parses `body.backfill_days`; `runAmazonSnapshotImports()` passes `{}` (scheduler → incremental default). `import_sync_runs.quality_note` records `write_mode=rolling_upsert; rows_pruned=<n>`; `rows_read`/`rows_written`/`status` unchanged in shape.
- **Sources (08):** `amazonReadBigQuerySource_(config, options)` computes the completed-day window = `incrementalDefaultDays` (1) by default, or `backfill_days` (capped at `lookbackDays`) for rolling_upsert; other configs keep `lookbackDays` (7 default). Same start/end SQL (`excludeToday`), same per-group fallback when the window is empty.
- **BigQuery credit impact:** daily query now scans ~1 completed day instead of 30 → ~30× less data scanned per daily run (unless a manual `backfill_days` is requested). No schema change.
- **Spec:** `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` v1.7 — §4 (incremental rolling upsert), §7.4 (write-mode rules + config), §20 (retention exception), config code blocks + comparison table + changelog/status.
- **Files:** `assets/specs/active/apps-script/06_amazon_import_config.gs`, `07_amazon_import_runner.gs`, `08_amazon_import_sources.gs`, `09_amazon_import_writer_logger.gs`, `docs/planning/AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md`. **Redeploy `06`–`09` `.gs`.** No sheet header change required (natural key + date columns already exist).

## Inventory Replenishment — Expanded Row UI Polish (2026-07-01)

**UI / CSS fix only. No Submit Plan, Execution Plan state, Recommendation calculation, Apps Script, DB, Weekly Shipping Plan, Shipment, or Carrier/Route/AI engine change.**

- **Top-row equal height (Part 1):** the top card of each group — **Stock / Long Term Storage** (Group A grid row 1), **Forecast Breakdown** (B), **Sales Trend** (C), **Achievement Rate** (D) — now share `min-height: 150px` and `flex: 0 0 auto` (removed the old `flex: 1.15` / `.ir-panel flex:1` grow), so Forecast Breakdown and Achievement Rate no longer stretch tall and the divider line aligns across groups. Chart canvases keep `max-height: 100px` (not squeezed). Second-row cards flow naturally.
- **Recommendation Summary Reason single-line (Part 2):** `.replen-recsum-table` changed to `table-layout: auto` + cells `white-space: nowrap` (was `normal`/wrap) — `Stock Sufficient` stays on one line, no ellipsis. Group C widened to 420px so it fits.
- **Recommendation Summary header color (Part 3):** `thead th` background `rgb(255, 248, 240)` with `#1f2937` text — that table only (no green, no impact on other tables).
- **Execution Plan Method/Delete (Part 4):** removed the `X` text from the header row (empty last cell; red `×` button only). Grid changed to `minmax(90px,1fr) minmax(90px,1fr) 56px minmax(110px,1fr) 32px` with `column-gap: 8px` (was `…96px…28px`, gap 6px) so Method select and the red `×` never overlap and `×` sits inside a 32px track (20px centered) — off the card edge.
- **Width / overflow (Part 5):** Group C min-width 400→**420px**, Group D 420→**440px** (both `flex: 0 0` fixed). Groups still never wrap; overflow past viewport uses the main table's `.scroll-col` horizontal scroll. Lower cards (Recommendation Summary / Execution Plan) are not squeezed.
- **Sticky header:** unchanged and unaffected (no ancestor overflow touched).
- **Spec:** `INVENTORY_TABLE_MAPPING_SPEC.md` v1.5.4 — §11.5 top-row alignment + Recommendation Summary single-line Reason + warm header color + Execution Plan Method/Delete spacing + Group C/D widths.
- **Files:** `assets/css/pages/inventory-replenishment.css` (top-card min-height/no-grow, rec table nowrap + header color, exec grid widths/gap, Group C/D widths), `assets/js/pages/inventory-replenishment.js` (exec header `X` → empty span), `docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md`. **No Apps Script / DB / other-page change.**

## Inventory UI Polish + Carrier Rate Card Spec Update (2026-07-01)

**UI fix + spec update only. No Submit Plan, Apps Script, DB handler, Carrier Engine, Request Order/PO, or Shipment logic change.**

### Inventory Expanded Row UI (CSS + 1 markup)
- **Upcoming Event height:** expanded row changed `align-items: stretch → flex-start`; `.replen-card--upcoming` / `--recommendation-summary` / `--execution-plan` set `flex: 0 0 auto` → Upcoming Event no longer stretched tall, matches Shipping Shipment / 3rd Party small cards. Top-row alignment still from the shared `min-height: 150px` on top cards.
- **Recommendation Summary title spacing:** title `margin-bottom: 6px → 4px` (matches Long Term Storage title→content).
- **Recommendation Summary Total row:** `_recSummaryRows` now blanks Route + Reason on the Total row (shows only Total + Qty); qty cell uses `replen-recsum-table__num`.
- **Execution Plan Method/Delete overlap:** grid `minmax(90/90/…/110)px 28px` → **`minmax(100px,1fr) minmax(100px,1fr) 60px minmax(130px,1fr) 36px`**, `column-gap: 8px`; **Group D widened 440 → 490px** so the grid (≈458px min) fits without shrinking Method under the `×` button. `×` sits centered in a 36px track, off the card edge.
- **Files:** `assets/css/pages/inventory-replenishment.css`, `assets/js/pages/inventory-replenishment.js` (Total-row markup), `docs/planning/INVENTORY_TABLE_MAPPING_SPEC.md` v1.5.5.

### Carrier & Route Spec (spec only — no engine)
- `CARRIER_AND_ROUTE_SPEC.md` v1.2:
  - **`carriers.carrier_type` enum** → `forwarder / courier / trucker / warehouse_partner / customs_broker / other` (§3).
  - **`carrier_rate_cards` (§4) rewritten** to authoritative import schema: `rate_card_id, carrier_id, origin_country, origin_city, destination_country, destination_city, destination_postal_code_start/end, destination_warehouse_code, marketplace, shipping_method, charge_type, charge_unit, dim_divisor, min_box_weight(+unit), weight_tier(+unit), currency, unit_rate, min_charge, fuel_surcharge, customs_fee, doc_fee, transit_days, effective_from/to, status, source_file_name, import_batch_id, created_at, updated_at`. `charge_type` = actual_weight/dim_weight/chargeable_weight/cbm/carton/shipment; `charge_unit` = kg/cbm/carton/shipment; `dim_divisor` e.g. 5000/6000; `min_box_weight` = per-carton min chargeable weight; `weight_tier` = tier start (20/50/100); `unit_rate` = per charge_unit. Matching: warehouse_code → postal range → city → country + marketplace + method + weight_tier. **`route_code` optional/deprecated — not the primary match key.**
  - **§4B Estimated Quote vs Actual Cost:** coarse estimate at Shipping Plan (country+marketplace+method+weight_tier) → refined at Shipment Draft (warehouse_code/postal/city known) → actual after carrier invoice. Suggested columns: `shipping_plans.estimated_freight_cost/estimated_duty/estimated_total_cost/estimated_unit_cost`; `shipments` same `estimated_*` + `freight_cost_actual/duty_actual/total_cost_actual`.
  - **§4A lead-time rule:** rate-card `transit_days` = quoted reference; `carrier_lead_times.avg_days` = actual/observed; future AI prefers `avg_days`.
  - **§6A `shipment_routes` (planned nodes) vs `shipment_events` (actual events)** clarified (routes = 東莞工廠→深圳出口海關→太平洋航段→洛杉磯港→ONT8; events = picked_up/customs_cleared/vessel_departed/arrived_port/delivered). Execution-layer, distinct from planning route rules.
- `DATABASE_RELATIONSHIP_MAP.md` §9 synced: carrier_type enum, new carrier_rate_cards columns, route_code deprecated, transit_days vs carrier_lead_times, cost lifecycle, shipment_routes vs shipment_events, and **DB Columns Needed** (estimated_*/*_actual).

### DB Columns Needed (future — planned, no writer/engine)
- `shipping_plans`: `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `estimated_unit_cost`.
- `shipments`: `estimated_freight_cost`, `estimated_duty`, `estimated_total_cost`, `estimated_unit_cost`, `total_cost_actual` (new); `freight_cost_actual` / `duty_actual` already exist.
- `carrier_rate_cards`: new expanded schema (§4). `carrier_lead_times`: as defined. **All spec-only — not migrated, no engine.**

## Inventory UI CSS Override + Shipment Events Spec Check (2026-07-01)

**Small UI override + spec sync only. No components.css global change, no Submit Plan / Apps Script / DB handler / Carrier Engine / PO / Request Order change.**

### shipment_events spec (Part 1)
- `SHIPMENT_CENTER_SPEC.md` §18 expanded with **§18.1 `shipment_events` definition**: optional actual tracking/event records = actual event history; **does not affect Ship main flow**; **no route/event required to Ship**; sources = `manual` / `carrier API` / `tracking API` / `import`; `shipment_routes` = planned route nodes vs `shipment_events` = actual event history. Preserved full field list: `shipment_event_id, shipment_id, event_time, event_type, event_status, location_name, country, city, latitude, longitude, source, note, created_at, updated_at`. Schema future work (spec-only, no migration).
- `DATABASE_RELATIONSHIP_MAP.md` already documents `shipment_events` consistently (planned nodes vs actual events) — no change needed.

### Recommendation Summary table CSS (Part 2 — Inventory Replenishment scoped only)
- Header background warm `rgb(255,248,240)` → **gray `#F1F5F9`** (`.replen-recsum-table thead th`, `#ops-section` scoped).
- `.replen-recsum-table` given explicit **`margin: 10px 0`** to override the global 20px table margin — keeps the table tight to its title (visual close to Long Term Storage). Title `margin-bottom` stays 4px.

### Execution Plan Delete Button CSS (Part 3)
- `.exec-route-row .replen-card__remove-btn` now **overrides global button `min-width: 60px`** via `min-width/max-width: 24px`; fixed `24×24` square, `padding: 0`, `justify-self: center` in its 36px track (off the card edge), flex-centered `×`. Method select and `×` no longer overlap.

### Execution Plan alignment (Part 4)
- Unified to **left align**: Qty header (`.ir-exec-plan__qty`) and Qty input (`[data-field="qty"]`) changed `text-align: right → left` so From / To / Qty / Method headers and inputs read consistently. Delete header cell stays centered.

- **Files:** `assets/css/pages/inventory-replenishment.css`, `docs/planning/SHIPMENT_CENTER_SPEC.md`. No JS/markup change needed (labels/classes unchanged). No components.css / Apps Script / DB / other-page change.

## Procurement Layer Phase 1 — Request Order Draft + Purchase Order Foundation (2026-07-01)

**New Procurement Center (下單系統) module: UI + mapping + DB handler foundation. API-ready. No auto-procurement engine, supplier API, payment flow, or formal document generation. Existing Inventory / Weekly Shipping Plan / Shipment / Apps Script actions untouched.**

### Menu / Navigation
- `index.html`: new **Procurement Center** parent menu (`toggleMenu('procurement')`) with children **Request Order Draft** / **Purchase Order Overview** / **Purchase Order List** (`showSection('request-order-draft' | 'purchase-order-overview' | 'purchase-order-list')`). Legacy 下單系統 (request-order) leaf under Forecast preserved. Added 3 mount points + 3 page `<script>`s + `procurement.css` link.
- `app.js`: both `sectionMap` objects gained the three new section ids.

### Pages (partial-loaded, lifecycle-registered — same pattern as shipping-history)
- **Request Order Draft** (`assets/html/pages/request-order-draft.html` + `assets/js/pages/request-order-draft.js`): Draft / Pending Approval / Approved sections; card + expand SKU Details (SKU/Product/Series/Requested/Approved[editable in Draft]/Units-Ctn/Cartons/Supplier/Supplier SKU/Unit Cost/Est. Amount/Need Reason/Related). Save (`updateRequestOrderLineQty`), Submit, Cancel, Approve, Reject (reason required), Convert to PO (`createPurchaseOrderFromRequest`), Done. **+ New Manual Draft** modal (`createRequestOrderDraft`); **From Shortage** = placeholder alert.
- **Purchase Order Overview** (`purchase-order-overview.html` + `.js`): status-grouped PO cards (Draft/Issued/Confirmed/In Production/Ready to Ship/Partially Shipped/Completed/Cancelled); expand PO Lines (SKU/Product/Ordered[editable in Draft]/Shipped/Remaining/Unit Cost/Line Amount/Cartons/Related Request/Related Shipment/Note). Save/Issue/Confirm/Start Production/Ready to Ship/Complete/Cancel via `updatePurchaseOrderStatus` + `updatePurchaseOrderLine`. `partially_shipped` displayed (partial impl).
- **Purchase Order List** (`purchase-order-list.html` + `.js`): filter bar (Company/Supplier/Status/PO No/SKU/Date range) + table (PO No/Status/Supplier/Company/Currency/Total Qty/Total Amount/Expected Ready/Created/Updated/Action). Action: View (modal) / Overview (jump+expand) / Edit-if-draft.
- **CSS:** `assets/css/pages/procurement.css` (scoped `.procurement-*` / `.pc-*`; no global override).

### API (`operation-system-db-api.js`)
- Normalizers: `normalizeRequestOrderRecord` / `normalizeRequestOrderLineRecord` / `normalizePurchaseOrderRecord` / `normalizePurchaseOrderLineRecord`; wired into `normalizeOperationDb` (`requestOrders` / `requestOrderLines` / `purchaseOrders` / `purchaseOrderLines`; [] when payload lacks the table).
- Getters: `getRequestOrders` / `getRequestOrderLines` / `getPurchaseOrders` / `getPurchaseOrderLines`.
- Writers (POST { action } + reload): `createRequestOrderDraft` / `updateRequestOrderStatus` / `updateRequestOrderLineQty` / `createPurchaseOrderFromRequest` / `updatePurchaseOrderStatus` / `updatePurchaseOrderLine`. API-ready; sessionStorage only for the create modal's working input.

### Apps Script
- **New `13_procurement_handlers.gs`**: 4 header constants + ensure-sheet (auto-create with documented header; missing-header safe; reuses global `sheetEnsureColumns_`) + append-by-header + `handleCreateRequestOrderDraft_` / `handleUpdateRequestOrderStatus_` (submit/approve/reject/cancel/done) / `handleUpdateRequestOrderLineQty_` (Draft only; recalc header totals) / `handleCreatePurchaseOrderFromRequest_` (Approved→PO; sets request `converted_to_po` — the only write-back) / `handleUpdatePurchaseOrderStatus_` (issue/confirm/start_production/ready_to_ship/complete/cancel) / `handleUpdatePurchaseOrderLine_` (Draft PO only; recalc totals).
- `01_router.gs`: 6 new POST actions routed. `02_core_sheet_db.gs`: `filterRows_` cases for the 4 tables. `03_master_data_handlers.gs`: both `validTabs` arrays include the 4 tables.

### DB Schema Foundation
- `request_orders` / `request_order_lines` / `purchase_orders` / `purchase_order_lines` — exact Phase-1 columns per the task. Auto-created on first write; no manual migration; no existing table altered.

### Status Flow
- Request Order: `draft → pending_approval → approved → converted_to_po`; reject → draft (version +1 on resubmit); cancel (soft); done sets `completed_*` (visual hide).
- Purchase Order: `draft → issued → confirmed → in_production → ready_to_ship → completed`; cancel; `partially_shipped` display-only.

### Immutable Flow (enforced)
- `Shipment / Inventory / Factory Stock` → Request Order Draft → Purchase Order. PO never writes Request Order (except the one-time `converted_to_po` marker the request sets on itself). Request Order never writes Shipment / Inventory / Factory Stock (upstream refs are copy-only `source_ref_*` / `related_entity_*`).

### Spec Sync
- **New** `docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` (Phase-1 implemented spec; cross-references the extended future design `REQUEST_ORDER_AND_PO_SPEC.md`).
- `DATABASE_RELATIONSHIP_MAP.md` §7 expanded (4-table schema + relationships + supplier price source); Entity Layers row updated.
- `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §7 (Snapshot Provenance table + Immutable-Flow note); `SUPPLY_CHAIN_SYSTEM_FLOW.md` Step 8 (Procurement Layer Phase 1 note).

### Verification
- `node --check` passes for all 5 touched/new JS files; all 5 touched/new `.gs` files pass syntax check (copied to `.js`). Supplier price source: Phase 1 reads existing list where available, `--` fallback + manual entry (future audit) — supplier price list NOT refactored.

## KM Sticky Header Framework + Inventory Sticky-Header Bug Fix (2026-07-01)

**Reusable sticky-header framework + fix for the Inventory Replenishment two-layer header being covered. CSS + core helper only. No Apps Script / DB / Submit Plan / calculation / Weekly Shipping Plan / Shipment / RO-PO change; expanded-row layout untouched.**

### Root cause
- `#ops-section .table-header-bar` pinned at hard-coded `top: 72px`, but the sticky `.replen-control-panel` above it is **taller than 72px** (≈83px desktop, and **wraps much taller on small screens**). Since the panel's z-index (131) > header bar (120), it overlapped and **covered Header Row 2** (`Current Stock / On the Way / Avg. Sales/day`). The fixed app header (`.top-header`) is outside the `.main-content` scroll container, so it was never the offending element.

### Framework (new, reusable, global)
- **`assets/css/core/km-sticky-header.css`** — `:root` variables: `--km-sticky-top-base` (default 0), `--km-sticky-row-1-height` / `-2-` / `-3-height` (48/48/0), `--km-sticky-header-total` (calc), z-scale `--km-sticky-z-toolbar 131 / -corner 121 / -header-1 120 / -header-2 119 / -header-3 118 / -col 110`. Reusable classes `.km-sticky-table` / `.km-sticky-row-1/2/3` (accumulated top offsets) / `.km-sticky-col` / `.km-sticky-corner`. Linked in `index.html` after `layout.css`.
- **`assets/js/core/sticky-header.js`** — `KM.stickyHeader.bindToolbar(pageRoot, toolbar, opts)`: measures the toolbar's live height, writes `--km-sticky-top-base` on `pageRoot`, re-measures on `ResizeObserver` + `window resize`; returns `{ refresh, destroy }`. Linked after `partial-loader.js`.

### Inventory application
- `inventory-replenishment.css`: `.table-header-bar` `top: 72px → var(--km-sticky-top-base, 72px)`, `height/z` from vars; `.fixed-header` / `.scroll-header` height, `--level1/2` row heights, `--status` corner height/z, `.fixed-col` z, `.replen-control-panel` z all routed through framework vars (identical computed values — no visual change except the fix).
- `inventory-replenishment.js`: `_bindReplenStickyHeader()` calls `KM.stickyHeader.bindToolbar(#opsSection, .replen-control-panel)` in `ops-section` mount; `_replenStickyHeaderHandle.destroy()` in unmount.

### Result
- Both header rows fully visible on scroll; Header Row 2 no longer covered; correct on small screens (dynamic base) and horizontal scroll; left sticky SKU column + corner z-indexes unchanged relative to headers; expanded row still below the header. No new magic numbers.

### Spec sync
- **New** `docs/planning/UI_COMPONENT_GUIDELINES.md` (framework reference for future RO / PO / Shipment / Warehouse Stock tables).
- `INVENTORY_TABLE_MAPPING_SPEC.md` v1.5.6: §11.6 Sticky Header — KM Sticky Header Framework + changelog.
- Verified `node --check` on `sticky-header.js` + `inventory-replenishment.js`.

## Shipment Overview Filter Restore + PO List Date Range Picker (2026-07-02)

**Frontend filter UI only. No Apps Script / DB / procurement handlers / PO or Shipment status flow change; Shipment Draft's simple filter unchanged.**

### Shipment Overview filter restore + Draft isolation (`shipping-history.js`)
- **Root cause:** `_shRenderFromDb` called `_shEnsureSimpleFilter` **unconditionally**, so the compact Country/Marketplace filter (built for Shipment Draft) also replaced Shipment Overview's full filter bar.
- **Fix:** new `_shApplyFilterUiForMode(mode, shipments)` — **draft** hides `.fc-filter-bar` and shows the compact top-right Country/Marketplace filter; **overview** restores the full `.fc-filter-bar` (Date / Country / SKU / Shipping Method / Search) and hides the compact filter (display toggle, so switching modes is reversible).
- New `_shBuildPassFilters(mode, linesByShipment)` — **draft** filters by the compact Country/Marketplace selects; **overview** filters by the full bar: Country + Shipping Method dropdowns (`_getShDropdownValue`), SKU (matched against shipment lines), and the Date range (`historyState.dateRange`, matched via `_shShipmentDate` = etd→eta→shippedAt→createdAt; **shipments with no date are never hidden**). Search re-applies live values (`onHistorySearch` → `_shLoadAndRender` in DB mode).

### PO List single Date Range picker (`purchase-order-list.html` / `.js`, `procurement.css`)
- Replaced the two `Created From` / `Created To` `<input type=date>` with a single **Date** filter: a `.history-date-trigger` button (`#pol-date-trigger`) that opens the **shared** `#frDateModal` / `.fr-*` date-range picker (same component as Forecast Review / Shipment Overview — no new picker invented; reused global `components.css` styles).
- `purchase-order-list.js`: added `polDateState` + PO-scoped picker fns (`polOpenDateModal` / `polSetupDateModalEvents` / `polApplyDateRange` / `polHandlePresetClick` / `polRenderCalendar[s]` / `polHandleDayClick` / …) bound to the shared modal via `.onclick =` (established per-page claim pattern). Presets: Today / Yesterday / Last 7 / 30 / 60 / 90 days / Last month / Custom range. Apply writes `polDateState.createdFrom` / `createdTo` (YYYY-MM-DD) → `passesFilters` matches `created_at >= from` / `<= to`. **Reset** clears the range (trigger back to "All"). Other filters (Company / Supplier / Status / PO No / SKU) unchanged.
- `procurement.css`: `.procurement-filter--date` min-width so the trigger matches the other controls.
- Spec: `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.3 notes the single Date Range filter.
- Verified `node --check` on `shipping-history.js` + `purchase-order-list.js`.

## Overseas Inbound Spec + SKU Add/Edit Spec (2026-07-02)

**Spec-only. No code, Apps Script, DB handler, or UI change. Two new planning specs + doc sync.**

### New specs
- **`docs/planning/OVERSEAS_INBOUND_SPEC.md`** (Draft v1): Overseas Inbound = **Overseas Stock planning input**, NOT a Shipment Draft. Flow `Overseas Stock → Inbound Draft → Submit to Weekly Shipping Plan → Pending Approval → Approved → Shipment Draft → Ship → received → Overseas Stock 入庫`. Layer roles (Inbound=Planning Input / Weekly Shipping Plan=Decision / Shipment=Execution / Receiving=Inventory Update). Header `overseas_inbound` (v1) + lines `overseas_inbound_lines` (v1) columns. Status `draft / submitted_to_shipping_plan / cancelled`. Rules: Submit creates a Weekly Shipping Plan (never a Shipment Draft directly); no factory-stock deduction; no direct overseas-available write; never bypass plan approval; stock updates only on `received`.
- **`docs/planning/SKU_DETAILS_ADD_EDIT_SPEC.md`** (Draft v1): Add/Edit dialog tabs (General / Logistics / Pricing / Marketplace v1; Supplier-Cost / Attributes / Images future). v1 required + optional (`item_*_2` all-or-nothing) + system fields following the **current `sku_details` template**. Validation (dims/weights > 0, `units_per_carton` positive int, prices ≥ 0, units non-empty, unique SKU, edit never mutates historical snapshots). Dropdown source strategy (front-end enum → `option_lists`/`system_settings` → Company/Site/Role). Default enums (dimension/weight/currency units, gs1_type, lifecycle) — **flagged lifecycle reconciliation** with live `VALID_LIFECYCLES_` (`Running in the Market` / `Phasing Out` / `Closure` / `Other`) as an open item. Add may seed a Factory Stock baseline row (future); Edit updates `sku_details` only.

### Doc sync
- `DATABASE_RELATIONSHIP_MAP.md`: §6 Inventory Layer lists planned `overseas_inbound` / `overseas_inbound_lines` + note (Submit→Weekly Shipping Plan, receipt-only stock update); §3 note for SKU Add/Edit (Add=master row + future factory baseline; Edit=`sku_details` only; snapshots frozen; dropdown source; lifecycle reconciliation).
- `SUPPLY_CHAIN_SYSTEM_FLOW.md`: note that Overseas Inbound Submit → Weekly Shipping Plan (not Shipment Draft directly), stock updates on `received`.
- `SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md` §7: Overseas Inbound = planning input feeding Decision Layer; master edits (SKU Add/Edit) never rewrite Decision/Execution/PO snapshots.
- `option_lists` / `system_settings` documented as **future** dropdown source (not implemented).

## Split Shipment Draft and Shipment Overview into Separate Pages (2026-07-02)

**Frontend page-separation fix. No Apps Script / DB / status flow / Weekly Shipping Plan / Inventory / Procurement / Carrier change. Save / Ready to Ship / Ship / Done handlers unchanged.**

### Root cause
- `shipping-history.js` treated Draft/Overview as one page toggled by `window.KM.shipmentViewMode`; `_shRenderFromDb` + `_shApplyFilterUiForMode` mutated the **same** `.fc-filter-bar` / injected the compact filter into the **same** section, so switching modes polluted the other's filter UI.

### Fix — two independent pages (shared DB + card helper, separate section/state)
- **Shipment Draft → `#shipment-draft-section`** (new partial `assets/html/pages/shipment-draft.html`, new mount `#shipment-draft-mount`): compact top-right **Country + Status** filter (Status = All / Draft / Ready to Ship / Shipped); shows draft / ready_to_ship / shipped (Done-hidden excluded). `initShipmentDraftPage` / `renderShipmentDraft` / `_shdEnsureFilter` / `_shdPopulateCountry`.
- **Shipment Overview → `#shippinghistory-section`** (existing `shipping-history.html`, title → "Shipment Overview"): full filter bar **Date / Country / SKU / Shipping Method / Search**; shows shipped / in_transit / arrived / received / closed. `initShipmentOverviewPage` / `renderShipmentOverview` (mock/demo path preserved, scoped to the section).
- Removed the mode machinery (`_shViewMode`, `_shUpdateTitle`, `_shEnsureSimpleFilter`, `_shApplyFilterUiForMode`, `_shBuildPassFilters`, `_shRenderFromDb`, `shipmentViewMode`).
- `_shLoadAndRender()` is now a **dispatcher** that re-renders whichever page is `.active` (called by shSaveExecution / shReadyToShip / shShip / shReturnToDraft / shShipmentDone / shAdvanceStatus — all unchanged; `_shRenderDbCard(mode)` reused for both pages).
- **Card render + empty-state queries scoped to their own section** (`.history-list` / `.history-empty-state` no longer global) so the two pages never cross-write.
- **Two lifecycle registrations** (`shippinghistory-section`, `shipment-draft-section`) with `_ensureShipmentOverviewMarkup` / `_ensureShipmentDraftMarkup`. `showShipmentDraft()` → `showSection('shipment-draft')`; `showShipmentOverview()` → `showSection('shipment-overview')` (both maps in `app.js`; `shipment-overview` → `shippinghistory-section`).

### CSS
- `shipping-history.css`: retargeted the **shared** card styles (`.sh-sku-table*`, `.history-empty-state`) from `#shippinghistory-section` → **`.page-shipping-history`** (both pages wrap in it). Overview-only filter-bar selectors stay `#shippinghistory-section`.

### Spec
- `SHIPMENT_CENTER_SPEC.md` §4: **Page separation (FINAL)** note (two independent pages; Draft = Country + Status; Overview = full bar); §5 Overview note updated.
- Verified `node --check` on `shipping-history.js` + `app.js`.

## Shipment Draft + Weekly Shipping Plan section-title restyle + count badges (2026-07-02)

**Visual-only: section group titles on Shipment Draft and Weekly Shipping Plan now match Request Order Draft (compact 15px heading + count badge beside each status group). No functional / data / status-flow change; no other page touched.**

- **Weekly Shipping Plan:** `shipping-plan.html` 5 section titles `<h2 …>` → `<h3 class="plan-section-title">Label <span class="plan-section-title__count" id="…SectionCount">0</span></h3>` (Draft / Pending Approval / Approved / Completed / Cancelled; ids preserved so `filterByStatus` still toggles them; completed/cancelled keep inline `display:none`). `shipping-plan.css`: `.plan-section-title` (15px, flex, gap) + `.plan-section-title__count` (badge) mirroring `procurement-group__title/__count`. `shipping-plan.js`: `_spSetSectionCount(id,n)` helper; counts set in both `renderShippingPlanFromDb` (draft/pending/approved/completed/cancelled `.length`) and the mock `renderShippingPlan` (draft/pending/approved).
- **Shipment Draft:** `shipping-history.js` `renderShipmentDraft` group titles → `<h3 class="shd-group-title">Label <span class="shd-group-title__count">N</span></h3>` (Draft / Ready to Ship / Shipped, N = items in group). `shipping-history.css`: `#shipment-draft-section .shd-group-title` + `__count` mirroring the Request Order look.
- Verified `node --check` on `shipping-plan.js` + `shipping-history.js`.

## PO List Mapping Update + Lifecycle Enum + Closure + Procurement DB Test (2026-07-02)

**Spec sync + PO List UI mapping + Procurement DB connection validation. No auto-procurement algorithm / factory-stock deduction / shipment allocation / payment / template / supplier API / role permission.**

### Lifecycle enum (Part 1 — spec only)
- `SKU_DETAILS_ADD_EDIT_SPEC.md` §6 reconciled to the **live** enum: `Upcoming SKU / Running in the Market / Phasing Out / Closure / Other` (dropped `Running in Market / Phase Out / Discontinued`); §9 open item marked resolved. **Front-end already used these values** (`operation-system-db-api.js` normalizer + `saveEditSku` `validLc`), so no front-end enum change needed.

### PO List filters + columns (Parts 2–3)
- `purchase-order-list.html`: filters now **Date / Status / Supplier / Category / Series / SKU / Search** (removed Company + PO No as primary filters; Date = shared range picker). Table is **line-level**: **SKU / Category / Series / Supplier / Factory / PO No / Status / Ordered / Completed / Shipped / Remaining / Updated**.
- `purchase-order-list.js`: `renderRows` rewritten to iterate `purchase_order_lines`, join `sku_details` (Category/Series) + `purchase_orders` (Supplier/Factory/Status/Updated) + `warehouses` (Factory name); PO-header filters (Status/Supplier/Date) + line filters (Category/Series/SKU); PO No links to Overview; `PO_STATUS_LABEL` extended with target enum; `reset()` updated to new filter ids.

### PO status enum + Closure (Part 4)
- `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §6 rewritten: target enum `draft / issued / in_production / partial_completed / completed / partial_shipped / shipped / closure / cancelled`; **§6.1 Closure rule** (auto when all lines `remaining_qty=0`; manual requires `closure_reason` + `closed_by` + `closed_at`). §3.3/§3.4 + `DATABASE_RELATIONSHIP_MAP.md` §7.3/§7.4: added `purchase_orders.factory_id/warehouse_id/closure_reason/closed_by/closed_at` and `purchase_order_lines.completed_qty`.
- Apps Script `13_procurement_handlers.gs`: `PURCHASE_ORDERS_HEADERS_` + `PURCHASE_ORDER_LINES_HEADERS_` gained the new columns (auto-created via `procurementEnsureSheet_`); `createPurchaseOrderFromRequest` now copies `factory_id`/`warehouse_id` and sets line `completed_qty=0`.
- API `operation-system-db-api.js`: `normalizePurchaseOrderRecord` gained `factoryId/warehouseId/closureReason/closedBy/closedAt`; `normalizePurchaseOrderLineRecord` gained `completedQty`.
- **Note:** the live `updatePurchaseOrderStatus` handler still implements the Phase-1 subset (draft→issued→confirmed→in_production→ready_to_ship→completed, cancel); the fuller enum + closure transitions are spec-defined targets (status-flow wiring deferred, per guardrails).

### Procurement DB connection (Part 5)
- **Audit:** API getters (`getRequestOrders/getRequestOrderLines/getPurchaseOrders/getPurchaseOrderLines`), `normalizeOperationDb` mapping, router actions, `filterRows_` cases, and `validTabs` (both arrays) are **all present and correct**. So the pages will show live data once the Apps Script is (re)deployed and the tabs exist.
- **Missing tabs are created on first WRITE** (`procurementEnsureSheet_`), not on read (`handleGetOperationDb_` returns `[]` for a missing tab). Added **`seedProcurementSampleData()`** to `13_procurement_handlers.gs` — a manual, run-once helper (not wired to any trigger) that creates the 4 tabs + 1 sample Request Order (approved) + 1 sample Purchase Order (in_production) with lines, so Request Order Draft / PO Overview / PO List display real rows.
- **"Demo mode" root cause is deployment, not code:** the `.gs` files under `assets/specs/active/apps-script/` are a source mirror that must be copied into the live Apps Script project and redeployed; the pages show Demo mode only when the DB isn't loaded as `google-sheet`.
- Verified `node --check` on `purchase-order-list.js`, `operation-system-db-api.js`, and `13_procurement_handlers.gs` (copied to .js).

## Request Order UI — KM Design System v1 Alignment (2026-07-02)

**UI/CSS only. No DB / API / Apps Script / business logic / calculation / status-flow change. Only Request Order (下單系統) touched; `request-order.css` + 1 line of `request-order.js` (empty-state markup).**

- **Legacy green header removed:** the saturated green table header (level-1 `#6cae4f`/`#7fb069` white-on-green band, level-2 `#f5fbf2`/`#e8f5e8`, green rowspan) → **KM Design System neutral**: level-1 `#F1F5F9` bg + `#1E293B` text + `#E2E8F0` border; level-2 white + `#475569` + thin grey border; rowspan `#F1F5F9` neutral. Matches FC Summary / Shipment / Purchase Order header language.
- **Shared Sticky Header Framework:** `.ro-table .table-header-bar` / `.fixed-header` / `.fixed-col` / rowspan corner now use `--km-sticky-top-base` / `--km-sticky-z-header-1` / `--km-sticky-z-col` / `--km-sticky-z-corner` / `--km-sticky-header-total` (assets/css/core/km-sticky-header.css) instead of hard-coded `top:0` / `z-index:120/110/121` / `height:96px`. No second sticky implementation.
- **Brand/action green → design-system blue `#3B82F6`** (hover `#2563EB`): active Series tab, Send Request / date-apply / request-row / Update FC primary buttons, coverage bar fill, decision-coverage value, expand toggle/tier-label/AI-input focus rings, row-hover key-column outline, light-green accent bg `#f0f7ed → #EFF6FF`. **Semantic status colors kept** (risk red/orange/green badges, remaining-days urgency, suggest-order "action" green) — consistent with the cross-page semantic palette.
- **Column alignment (Part 8):** data cells now **text left** (Country/Marketplace), **numbers right** (Basic/Special FC, Site/3rd/Factory Stock, Ongoing, Lead Time, Remaining, Suggest), **status center** (Risk) — replaced the blanket center alignment.
- **Empty state:** ad-hoc inline `Please select a date range…` → `.ro-empty-state` (KM neutral: muted grey, dashed border, `#F8FAFC`) matching Purchase Order `.procurement-empty` / Shipment empty state.
- **Consistency audit:** filter card already used shared `--filter-*` tokens (height/padding/radius/font) — unchanged. Header/table/sticky/empty-state/colors now aligned. **Follow-up:** `.ro-*` classes remain a page-local copy; a future step can extract shared table/filter components (Part 10) to avoid three parallel copies (Inventory / FC Summary / Request Order).
- Verified `node --check` on `request-order.js`; CSS braces balanced (228/228); brand-green audit = 0 remaining.

## Request Order Mapping v1 — Data Source + Filters + Tabs + Second-Layer (2026-07-02)

**Spec-first mapping audit + safe frontend wiring for 下單系統 (Request Order analysis page). NO calculation engine, NO Remaining/Risk/Suggested formula, NO PO/Shipment/Inventory/Weekly-Plan change, NO new DB tables (spec note only), NO Inventory-DOM dependency.**

- **Data source (Part 3):** added `_buildRequestOrderRowsFromDb()` — rows built from normalized DB (`marketplace_skus` identity SKU+Country+Marketplace, join `sku_details` for category/series, **real Factory Stock = Σ `factory_stock.current_stock` per SKU**). Every calc-dependent column (Risk / Basic T3 FC / Special Events / Site Stock / 3rd Party / Ongoing Orders / Remaining / Lead Time / Suggested Order) is a **placeholder → `--`** (`_roFmt`). Source priority **live DB (`google-sheet`) → Demo Data → empty**; the page no longer depends on `window.fcRegularData` / `window.factoryStockData` DOM globals for the DB path.
- **Filters (Part 1):** filter bar is now **Country · Marketplace · Risk · SKU · Search** (removed Date + Category filters). **Country/Marketplace use OR semantics** via shared `_applyRequestOrderFilters()` (neither→all; one→that one; both→country OR marketplace). Risk = placeholder dropdown. Added a **Search** button (`handleRequestOrderSearch`). Country/Marketplace options rebuilt from live data (`_populateRequestOrderFilterOptions`).
- **Category tabs (Part 2):** Series tabs → **Category tabs** from distinct `sku_details.category` (`_populateRequestOrderCategoryTabs` + `setRequestOrderCategory`), "All" first. CSS `.ro-tabs--category` shares the `.ro-tabs--series` styling.
- **Site vs 3rd Party (Part 4):** kept as **two separate columns** (never merged); documented platform-fulfilled vs self-fulfilled meaning in spec §12.5.
- **Supplier / Lead Time (Part 5/6):** Lead Time source = `supplier_price_list.lead_time_days` (placeholder — no normalized getter yet). Future **`suppliers` master table** documented (spec §12.6 + DB map) — spec only, not implemented.
- **Second layer (Part 6):** inspected — the expand panel is a **mock-only design (no functional DB-backed second layer)**. Live-DB rows now show a clean placeholder inside the expand panel (guarded against missing fields); the rich mock panel renders only for Demo rows. Expand/collapse works. No new second-layer design invented.
- **Spec sync (Part 7):** `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` **§12 Request Order Analysis Page (下單系統) — Mapping v1** added (filter rules / category tabs / main-table mapping / DB source principle / Site–3rd Party rule / lead-time source / suppliers future table / second-layer status). `DATABASE_RELATIONSHIP_MAP.md` updated (suppliers master note + Request Order consumer row).
- Verified `node --check` on `request-order.js` (OK).

## Request Order Mapping v2 — Pagination + Real Source Mapping + Site Confirmation + Second-Layer (2026-07-02)

**Data mapping + UX only. NO calculation engine, NO Remaining/Risk/Suggested formula, NO AI, NO real RO Draft aggregation, NO PO/Shipment/Weekly-Plan change, NO Inventory DOM.**

- **Pagination (Part 1):** main table renders **25 rows/page** (`requestOrderState.page/pageSize`); filter + category tab apply before slicing; page resets to 1 on Search / filter / tab / show-mode change. Controls (`#ro-pagination`): Prev / Page X/N / Next + "Showing a–b of N".
- **Real source mapping (Parts 2–6)** in `_buildRequestOrderRowsFromDb()` (added `_roNextMonths`/`_roPastMonths` runtime month helper): **Basic(T3)** = Σ `fc_regular_forecast` next 3 months (sku+country+marketplace, per-year); **Site Stock** = latest `amazon_inventory_snapshot` (available+fc_transfer+fc_processing); **3rd Party** = Σ `overseas_inventory_snapshot.available_stock` same-country non-factory WH; **Factory Stock** = Σ `factory_stock.current_stock` (unchanged, Part 4); **Ongoing Orders** = Σ open-PO remaining_qty (`purchase_order_lines` ⋈ `purchase_orders.status ∈ open set`; per-SKU, best-effort); **Lead Time** = `supplier_price_list.lead_time_days` (active row, latest effective_from). Missing source → `--` (never fabricated).
- **API:** added `normalizeSupplierPriceListRecord` + `supplierPriceList` in `normalizeOperationDb` + `getSupplierPriceList()` getter (`[]` when tab absent). No suppliers table.
- **Site Confirmation (Part 7):** `Confirm Site` button + status in top bar; `handleConfirmSite` marks `requestOrderState.confirmedSites[scope]` — **frontend-only marker, no DB write, no permissions**. Future `request_order_site_confirmations` table documented (spec §12.9 + DB map).
- **Series aggregation (Part 8):** documented as the target (Send Request → aggregate by Series → RO Draft expands per company/site/country/marketplace); **not implemented** (guardrail).
- **Second-layer v2 (Part 9):** replaced mock-only panel with clean v1 structure (4 right panels: Past Achievement / Future Basic+Special FC / Factory Orders (Future 2 Months) / Recommendation Summary — structure only, no formula). Basic FC + Upcoming Events pull real `fc_regular_forecast` / `fc_special_events`; unsourced cells `--`. Left buttons **Edit Target %** (`fc_target_rules`, read-only modal) + **FC Update** (`fc_regular_forecast`, read-only modal) — no save handler yet. Site Stock / 3rd Party NOT duplicated in the second layer.
- **Spec sync (Part 10):** `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §12 upgraded to v1/v2 (mapping table statuses, §12.7 second-layer UI, §12.8 pagination, §12.9 site confirmation + future table, §12.10 Series aggregation, §12.11 non-goals). `DATABASE_RELATIONSHIP_MAP.md` updated (v2 consumer sources, supplier_price_list getter note, future request_order_site_confirmations).
- Verified `node --check` on `request-order.js` + `operation-system-db-api.js`; CSS braces balanced (249/249).

## FC Summary Write Path Phase 1 — Special Events + Target Rules (2026-07-02)

**Wires fc_special_events + fc_target_rules read/write. NO FC/Target-resolver formula change; NO Edit Base FC / + Add SKU / Regular single-row write (Phase 2); NO Request Order / Inventory / PO / Shipment change.**

- **New spec:** `docs/planning/FC_SUMMARY_SPEC.md` (tables, phased status, schemas, actions, deploy note, non-goals).
- **Apps Script** `assets/specs/active/apps-script/14_fc_write_handlers.gs` (new): `handleUpsertFcSpecialEvent_` / `handleDeleteFcSpecialEvent_` / `handleUpsertFcTargetRule_` / `handleDeleteFcTargetRule_` + self-contained helpers (`fcWriteEnsureSheet_`, `fcWriteUpsert_`, `fcWriteDelete_`). Auto-create tab + header row; update-by-id-else-create; stamp created/updated meta; header-based writes; hard delete by id. `01_router.gs` routes the 4 new actions (error string updated).
- **API adapter** `operation-system-db-api.js`: added `upsertFcSpecialEvent` / `deleteFcSpecialEvent` / `upsertFcTargetRule` / `deleteFcTargetRule` (POST + `loadOperationDb({force:true})`). Getters `getFcSpecialEvents` / `getFcTargetRules` pre-existed; normalizers untouched (UI mappers read extra columns via `.raw`).
- **UI** `fc-summary.js`: added `_fcUseDb()`, `_getDbFcEventData()`, `_getDbTargetRules()`, `_getActiveTargetRules()`.
  - **Special Event** table now reads `getFcSpecialEvents()` on Demo OFF (was fixed `[]`). `saveNewEvent` (Manual) + `saveEventUpdate` (growth/copy batch) write `fc_special_events` on Demo OFF (base source is DB-aware); Demo ON keeps mock.
  - **Target Rules** table/`getEffectiveTargetPct`/`validateDataIntegrity` read `_getActiveTargetRules()` (live on Demo OFF). `saveNewTargetRule` → `upsertFcTargetRule`; `deleteTargetRule` → `deleteFcTargetRule`. `const targetRules=[]` now used **only in Demo ON**.
  - `_fcSummaryEnsureDbAndRender` afterLoad also calls `renderTargetRulesTable()`.
- **DB columns:** `fc_special_events` core + UI-continuity `event_period` / `year`; `fc_target_rules` core + UI-continuity `year` / `category` / `series` / `sku` (documented in spec §3/§4).
- **Deploy dependency:** `14_fc_write_handlers.gs` + `01_router.gs` must be copied into the live Apps Script project and redeployed before writes hit the sheet.
- Verified `node --check`: fc-summary.js, operation-system-db-api.js, 14_fc_write_handlers.gs, 01_router.gs all OK.

## FC Summary — New FC Update Regular Forecast UI + Mapping (2026-07-02)

**UI + mapping/spec only. NO BQ query, NO forecast calc engine, NO Edit Base FC / Add SKU / Target Rules change, NO Inventory/Request Order/PO/Shipment change. Live-DB write reported as PENDING (never faked).**

- **First screen (Part 1):** `+ New FC Update` chooser is now **two large card buttons** (Regular Forecast / Special Events) with hover + selected state + Cancel/Next (`.fc-mode-options--cards` in fc-overview.css).
- **Regular modal (Part 2/3):** added **Country + Marketplace** selects (no Company — derived from marketplaces/marketplace_skus). Update Method → 3 options: **Apply Growth Rate (Based on Actual Sales)** / **Adjust From Previous Month Forecast** / **Manual Monthly Forecast** (on its own full-width row so the label isn't truncated). Conditional show/hide via `toggleRegularMethodFields`: actual → Base Year + Growth (Growth **required > 0**); prevMonth → Month + Growth (hide Base Year); manual → Jan–Dec grid (hide Base Year/Growth/Month).
- **Save (`saveRegularUpdate`):** validates per method; **Demo OFF (live) → PENDING alert, no write, no fake success** (no single-row `fc_regular_forecast` writer / no BQ actual-sales source yet); **Demo ON → in-memory illustrative update clearly labeled DEMO**.
- **Files:** `assets/html/pages/fc-summary.html`, `assets/js/pages/fc-summary.js`, `assets/css/pages/fc-overview.css` (FC Summary styles live here), `docs/planning/FC_SUMMARY_SPEC.md` §8 added.
- **Pending backend:** single-row fc_regular_forecast upsert action + BQ actual-sales source (documented in FC_SUMMARY_SPEC §8.4).
- Verified `node --check` fc-summary.js OK; fc-overview.css braces 216/216.

## FC Summary — New FC Update: Regular Manual + Special Event Mapping (2026-07-02)

**UI + mapping/spec + limited wiring. NO BQ query, NO forecast calc engine, NO Inventory/Request Order/PO/Shipment change. Live writes reported PENDING where no writer exists (never faked).**

- **Regular modal (Part 1):** added **SKU** field. Manual Monthly Forecast **prefills Jan–Dec from existing `fc_regular_forecast`** (SKU+Country+Marketplace+Target Year) via `_regularPrefillManual()` (read-only lookup; onchange on SKU + on method switch); manual hides Growth Rate. Save is SKU-scoped upsert intent. **Live write still PENDING** (no single-row `fc_regular_forecast` writer — only batch import); Demo ON = in-memory. Actual (BQ) + prevMonth also pending on live.
- **Special Event modal (Part 2/3):** rebuilt to Scope → Target → Event Info → FC Qty with same base fields (Country/Marketplace/SKU/Target Year/Base Year/Update Method/Growth Rate/Event/Event Period/FC Qty). No Company (derived); Category/Series joined from sku_details. Event enum = Spring Deal / Prime Day / Fall Prime / BFCM / Mother's Day. Two methods: **Manual Event Forecast → writes `fc_special_events`** (real `upsertFcSpecialEvent` on Demo OFF; mock on Demo ON); **Apply Growth Rate (Based on Actual Sales) → PENDING** (BQ, no fake success).
- **fc_special_events DB spec (Part 4):** FC_SUMMARY_SPEC §3.1 target schema added — PK `event_fc_id`, + `marketplace_id`, `fc_share`(runtime), `source`(manual/growth_actual_sales/import), `status`(active/inactive/archived); `company` derived; `event` fixed enum. **Reconciliation pending:** live `14_fc_write_handlers.gs` still uses `event_id` PK and does not persist source/status/marketplace_id/fc_share (header not aligned — out of this task's file scope). Manual save passes source/status forward-compatibly (silently dropped until columns added).
- **Files:** fc-summary.html, fc-summary.js, fc-overview.css (FC styles), FC_SUMMARY_SPEC.md (§3.1, §8.2/8.3a, §9), DATABASE_RELATIONSHIP_MAP.md. No Apps Script / API adapter change needed (upsertFcSpecialEvent already existed).
- **Pending backend:** single-row `fc_regular_forecast` upsert + BQ actual-sales source; fc_special_events header alignment (event_fc_id/source/status/marketplace_id/fc_share).
- Verified `node --check` fc-summary.js OK; fc-overview.css braces balanced.

## FC Summary Safety Fix + Regular FC Modal Refinement (2026-07-02)

**UI + mapping only. NO Inventory/Request Order/PO/Shipment change, NO BQ query, NO calc engine, NO Import Forecast change, NO Special Event UI change. Live write reported PENDING (never faked).**

- **+ Add SKU REMOVED (Part 1):** the FC Summary "+ Add SKU" button is deleted (data safety). SKU / FC base-row creation is owned by SKU Details / Inventory SKU flow (+ batch Import). The Add SKU modal markup is now unreachable dead code. Docs: FC_SUMMARY_SPEC §1.1 + §2, SUPPLY_CHAIN_SYSTEM_FLOW Step 7.
- **Import Forecast UNCHANGED (Part 2):** still `openFcImportModal()` → `importFcRegularForecastBatch` → writes `fc_regular_forecast` (batch upsert + marketplace-import base-row create). Not touched.
- **Previous Month method (Part 3):** modal now has explicit **Target Year / Target Month / Based Year / Based Month** (+ Country/Marketplace/SKU/Rate). `_regularSyncBasedFromTarget()` defaults Based = month before Target (editable); source is never silently inferred. Validation requires all of the above. Live save = PENDING (no writer); demo applies Based(year,month) value × (1+rate) → Target month.
- **Manual Monthly Forecast (Part 4):** has SKU; hides Growth Rate + Base Year; prefills Jan–Dec from existing `fc_regular_forecast` (SKU+Country+Marketplace+Target Year) via `_regularPrefillManual()` (on SKU change + method switch); 0 when no row. Save = upsert intent; **live PENDING** (no single-row writer — clear pending message, no fake success); demo = in-memory upsert on that SKU.
- **DB writer status:** single-row `fc_regular_forecast` upsert still NOT implemented (only batch Import). Regular modal Save reports pending on Demo OFF.
- **Files:** fc-summary.html, fc-summary.js, FC_SUMMARY_SPEC.md, SUPPLY_CHAIN_SYSTEM_FLOW.md. (No CSS change needed; no API/Apps Script change.)
- Verified `node --check` fc-summary.js OK; + Add SKU button absent from markup.

## 2026-07-02 — FC Summary Special Event UI rebuild + Campaign sync rule spec

**Special Event modal** (`fc-summary.html` / `.js` / `fc-overview.css`) rebuilt to mirror the Promotion Risk Tracker "Add Promotion" structure — four labelled sections **Scope → Target → Event Info → Forecast**:
- **Scope:** Country, Marketplace.
- **Target:** Target Mode = Single SKU / Category-Series Batch (Batch = Category + Series multi-selects sourced from `sku_details`; matched SKUs resolved in JS).
- **Event Info:** **Event Flag** (Normal / Spring Deal / Prime Day / Fall Prime / BFCM / Mother's Day), Target Year, Event Period.
- **Forecast:** FC Qty + source note (`manual_fc_summary`).

**Rules:** Event Flag = Normal → creates **no** `fc_special_events` (period + qty hidden, Save explains + writes nothing). Event Flag != Normal → Event Period + FC Qty (> 0) required; Save writes one `fc_special_events` row **per target SKU** (Batch = one row per matched SKU, same qty; no allocation calc). Removed the old Update Method / Growth Rate / BQ actual-sales path.

**Backend writer:** `upsertFcSpecialEvent` writes the columns present in the live `14_fc_write_handlers.gs` header. New target columns — `campaign_id`, `campaign_sku_line_id`, `source` (enum `manual_fc_summary`/`campaign_sync`/`import`/`growth_actual_sales`), `status` — are **passed but PENDING** (header not aligned; `.gs` change intentionally out of scope). No fake success.

**Campaign sync rule (spec only):** Campaign = promotion source of truth (`campaigns` + `campaign_sku_lines`); `fc_special_events` = supply-chain forecast source of truth; **linked** by `campaign_id`/`campaign_sku_line_id`, **not** blind two-way synced. Campaign Add Promotion (Event Flag != Normal) should write `campaigns` → `campaign_sku_lines` → `fc_special_events` (`source='campaign_sync'`) — Campaign-side writer **PENDING**.

Specs: FC_SUMMARY_SPEC §3.1 (campaign cols + source enum), §9 (rebuilt UI), §10 (new Campaign sync rule); DATABASE_RELATIONSHIP_MAP (fc_special_events → campaigns link + sync note); SUPPLY_CHAIN_SYSTEM_FLOW Step 7.

## 2026-07-02 — FC Summary manual prefill hardening + Marketplace display-name labels

**Regular FC Manual prefill** (`fc-summary.html` / `.js`): prefill now re-triggers on **Country / Marketplace / SKU** change (not just SKU) while in Manual mode. New protections against silent zero overwrite:
- No SKU → month inputs untouched (no wipe); helper "Enter a SKU…".
- Live + DB cache not loaded → prefill skipped, **Save disabled**, helper "Loading existing forecast…".
- Match found → months filled; a **blank stored month stays blank** (never forced 0); helper "Existing forecast loaded…".
- No match → 0s kept, helper "No existing FC found. Saving will create a new forecast row."
Marketplace value is resolved to the canonical key before matching (`_fcResolveMarketplaceKey`). Single-row `fc_regular_forecast` writer still **PENDING** — no fake success.

**Marketplace display-name labels** (presentation only; canonical key stays the DB value / write payload):
- FC Summary — filter panel, Regular + Special Event modal dropdowns, Regular/Event table marketplace column now show `marketplace_display_name` (fallback `marketplace`).
- Inventory Replenishment — main Marketplace filter + results-table marketplace column now show display name (`_replenMarketplaceLabel`).
- Options dedupe by value+label pair (not key alone) so `KM Walmart` etc. appear and are selectable.
- Helpers: `_fcMarketplaceLabel` / `_fcMarketplaceOptions` / `_fcResolveMarketplaceKey`; `_replenMarketplaceLabel`. `_rebuildFcPanel` extended to accept `{value,label}`. **No normalizer/API/DB-key change** (`marketplaceDisplayName` already normalized). Import Forecast untouched.

Specs: FC_SUMMARY_SPEC §8.3a (prefill + no-silent-zero), new §11 (display label rule); INVENTORY_TABLE_MAPPING_SPEC §2.1; DATABASE_RELATIONSHIP_MAP marketplaces note.

## 2026-07-02 — FC Summary Special Event Builder v2

Rebuilt the Special Event builder (`fc-summary.html` / `.js` / `fc-overview.css`) with two modes selected by radio pills:
- **Single SKU** — up to **8 rows** (add/remove; ≥1 kept), each: SKU / Regular Price (auto-filled read-only from `marketplace_skus`) / Deal Price / Forecast Qty. No growth/base-campaign here.
- **Category / Series** — Category + Series multi-selects, each with **All** checkbox. **Build Group Cards** groups candidate SKUs by **category + series + regular_price** (same series, different price ⇒ separate cards). Cards show regular price + SKU chips + Deal Price + Forecast Qty, with remove-group / remove-SKU controls.
- **Discount %** appears only when All Category / All Series; **Apply Discount** pre-fills `deal = regular × (1 − disc%)` (overridable).
- **Forecast Assist** (Category/Series only): Base Year / Base Campaign / Growth Rate % → **pre-fills** suggested Forecast Qty (base × (1+growth%)); never silently writes. Base Campaign source = `getCampaigns()`; disabled/pending when no campaign records.

**Event Flag** enum Normal + Spring Deal / Prime Day / Fall Prime / BFCM / Mother's Day. Normal → creates nothing. != Normal → Target Year + Event Period + Forecast Qty (>0 per row/card) required.

**Save mapping (documented, §12):** `campaigns` → `campaign_sku_lines` → `fc_special_events`, linked by campaign_id / campaign_sku_line_id (source `campaign_sync`). **Writer status PENDING** — `upsertCampaign` / `upsertCampaignSkuLine` do NOT exist (only `upsertFcSpecialEvent`). Live Save writes **nothing** and shows a clear pending message enumerating what would be created; `fc_special_events` is intentionally NOT written alone (would orphan). **No fake success.** Demo ON = illustrative in-memory rows only.

Removed dead `saveNewEvent` (referenced obsolete element IDs). Specs: FC_SUMMARY_SPEC §9 (rewritten) + §12 (save mapping/backend); DATABASE_RELATIONSHIP_MAP; SUPPLY_CHAIN_SYSTEM_FLOW Step 7.

## 2026-07-03 — FC Summary Target Year editable + cascading filters

**Part 1 — Target Year editable:** removed `readonly` from `regular-target-year` and `event-target-year`. Root cause was purely the `readonly` attribute (no JS reset). Default (`fcTargetYear`) is written only in `openRegularUpdateModal` / `openEventModal`; method/scope/SKU/flag/mode changes only read it, so a user edit persists until reopen.

**Part 2/4 — Marketplace display name (already in place, verified):** FC Summary filter panel, Regular + Special Event modal dropdowns, and both tables show `marketplace_display_name` (fallback `marketplace`) via `_fcMarketplaceLabel` / `_fcMarketplaceOptions`; filtering compares the internal canonical key (`item.marketplace`), never the label.

**Part 3 — Cascading filters:** new `_fcCascadeFilters()` + `_rebuildFcPanelChecked()` in fc-summary.js, hooked into `updateFcFilter` + `toggleFcAll`. Company / Marketplace / Country / Category / Series are faceted over `fc_regular_forecast`: each dimension's options are limited by the others' current selections; valid checked values preserved, fully-invalid selections reset to All (All always present). Marketplace options carry canonical value + display label. SKU stays a free-text row filter (dropdown facet impractical). Demo mode keeps static options (cascade no-op).

Docs: FC_SUMMARY_SPEC §13 (target year + cascading); DATABASE_RELATIONSHIP_MAP marketplaces note. No schema / calc / other-page changes.

## 2026-07-03 — FC Summary filters: revert cascading (full option set)

Reverted the faceted/cascading filter narrowing in FC Summary. Company / Marketplace / Country / Category / Series / Event Type dropdowns now **always show their full option set** — selecting e.g. Country = US filters the table but no longer hides other countries' related options. Removed `_fcCascadeFilters` / `_rebuildFcPanelChecked` and their calls from `updateFcFilter` / `toggleFcAll`. Options are built once per load by `_populateFcFilterOptionsFromDb`. The All-toggle behaviour and internal-value table filtering (marketplace by canonical key, display by `_fcMarketplaceLabel`) are unchanged. FC Summary only; no other page touched. Docs: FC_SUMMARY_SPEC §13.2, DATABASE_RELATIONSHIP_MAP.

## 2026-07-03 — Milestone: Factory Stock Allocation architecture finalized (docs only)

**Factory Stock Allocation architecture finalized.**
- **Weekly allocation snapshot DB finalized** — `factory_stock_allocation_plans` (planning snapshot ONLY: no inventory movement / no reservation / no ownership change). Allocated by **FC Share** (`fc_regular_forecast` + target rules); `allocation_version` enables recalculation without losing historical plans; `status` = draft / confirmed / archived (future). Column purposes documented in DATABASE_RELATIONSHIP_MAP §6.
- **Allocation rule finalized** — existing inventory = **shared pool**; new POs may carry intended-company info but factory allocation is **recalculated weekly** and **never permanently bound to a company**.
- **Reserved Stock lifecycle finalized** — Submit Plan = no movement; **Shipment Draft → `reserved_stock +=`** (current_stock unchanged); **Ship → `current_stock −=` and `reserved_stock −=`**. Inventory effects live only at the Execution Layer.
- Finalized flow: SUPPLY_CHAIN_SYSTEM_FLOW §5.2 (Factory → Shipping workflow), §5.3 (Allocation Rule), §5.4 (Reserved Stock Rule).

**Ready for next implementation:** Request Order Draft → Purchase Order → Shipment.

*Documentation only — no code / UI / schema changes in this update.*

## 2026-07-03 — FC Summary pagination fix + Special Event Builder UI refinement

- **FC Summary pagination display fixed.** Footer no longer shows "Showing 0-0 of 0" when the table has rows. Root cause: Regular + Event tables share one footer and both called `updatePaginationInfo`; the last (often empty Event) render overwrote the count. `updatePaginationInfo` now always recomputes from the **active tab**, format = `Showing 1-25 of 493 rows` + `Page 1 / 20`, buttons `‹ Previous` / `Next ›` styled to match Request Order (`.fc-page-btn` = `.ro-page-btn`). Tab switch re-renders the active tab (resets to page 1); footer hidden on the non-paginated Target tab. Works with the page-size selector (25/50/100).
- **Special Event Builder Category / Series changed to dropdown multi-select** (replacing raw multi-line list boxes): dropdown button + checkbox panel + All Category / All Series + summary text; selection drives Build / Refresh Group Cards. Discount % row shows when All Category or All Series is selected.
- **Modal clipping fixed.** The base `.fc-modal` capped width at 500px so `--large` (700px) never applied; the Special Event Builder wrapper is widened to 900px and content fills it — no clipped fields, Save/Cancel always visible, no unnecessary inner horizontal scrollbar.

FC Summary only. No FC calculation / schema / Campaign sync / Import Forecast / Request Order changes.

## 2026-07-03 — FC Regular Manual: match by full site identity (company+country+marketplace+sku+year)

Fixed wrong-data load when two sites share a platform name (e.g. ResUS/US/Amazon vs KM/US/Amazon). The Regular FC Update Marketplace select now carries the **full site identity** (`value = company|country|marketplace`, label = display name, disambiguated by company when needed) built per selected Country from marketplaces registry + fc_regular_forecast (+ demo fcRegularMock). New helpers `_fcRegularSiteOptions` / `_regularSelectedSite` / `_regularRebuildSites` / `onRegularCountryChange`. `_regularPrefillManual` and `saveRegularUpdate` now match/upsert by **company + country + marketplace + sku + year** (company derived from the selected site; strict — no fallback to another company). If no row exists for the selected site → Jan–Dec = 0. Single-row live writer still PENDING (no fake success); pending message + demo matching updated to include company. FC Summary only; no schema/calc/other-page changes.

## 2026-07-03 — Standardized table pagination footer (FC Summary + Request Order)

Unified both table footers on a shared `.km-table-footer` component (in `components.css`): footer sits **outside** the table markup (below the table container), **left** = `Showing X-Y of N rows`, **right** = `‹ Previous` / `Page X / Y` / `Next ›` (+ page-size selector where present). Shared button `.km-page-btn` (+ `:disabled`) and `.km-page-info` give consistent style/disabled state across pages. Request Order footer was reordered to match FC (previously controls-left / showing-right) and now uses the shared classes; FC keeps `.fc-pagination` only as the JS show/hide hook. No changes to data calc, filtering, page-size logic, or modals.

## 2026-07-03 — FC Summary Special Event Builder UI overflow fixes + Regular marketplace clean label

Part A (CSS only, builder-scoped): Builder Mode pills forced one-line (`white-space:nowrap`, `flex-wrap:nowrap`); Single SKU row X button no longer clipped (`.fc-evt-row > * { min-width:0 }` stops number inputs expanding grid tracks + `justify-self:center` on the remove button); Category/Series dropdown panel constrained to trigger width with `overflow-x:hidden` (vertical scroll only) and wrapping option text. Part B: Regular FC marketplace dropdown label now shows `marketplace_display_name` only (fallback `marketplace`) — removed the `(company)` disambiguation suffix; the option value still carries the full identity `company|country|marketplace`, so KM Amazon / ResUS Amazon stay strictly separated internally. No DB/API/save/mapping-key/calculation changes.

## 2026-07-03 — Request Order draft persistence + second-layer UI v3 + Send Request wiring

**Docs:** REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC §3.6 (`shipping_allocation_drafts*` — spec only) + §3.7 (`request_order_allocation_drafts*` — implemented); DATABASE_RELATIONSHIP_MAP §7.5 (draft layers, relationships). Both draft layers are **planning scratchpads — no stock movement / reservation**. Status enum draft/site_confirmed/submitted/cancelled. Buckets T1=next month, T2=next 2 months, T3=next 3 months.

**Second-layer UI (request-order.js / .css):** expand panel rebuilt as a 2×2 grid (`ro-sku-expand-grid--v3`) so top-row cards share equal height: Past Achievement (compact) | Factory (Factory Stock over Factory Orders); Future Basic/Special FC (compact, Basic FC now has **Target %** column → `_roTargetPct` reads fc_target_rules, default 100% placeholder) | Recommendation Summary (future 4 months) over **Order Allocation** (T1/T2/T3, **editable Order Qty** + Note). Factory Stock shows Factory/Warehouse/Current/Reserved/Available (Available = current − reserved when reserved present, else --). Left cards ~35% lighter footprint (narrower column + compact cells). Edits held in `requestOrderState.allocEdits`.

**Persistence + Send Request (request-order.js, operation-system-db-api.js, Apps Script 15_request_allocation_handlers.gs + 01_router + 03 validTabs):** new handlers `upsertRequestOrderAllocationDraft` / `upsertRequestOrderAllocationDraftLines` (replace-by-draft_id) / `submitRequestOrderAllocationDrafts`; adapter getters `getRequestOrderAllocationDrafts` / `getRequestOrderAllocationDraftLines` + writers; tabs auto-create headers; reload after write. **Send Request** now: gate on confirmed sites → collect confirmed rows with positive Order Qty in selected buckets → (live) persist allocation drafts+lines, create `request_orders`/`request_order_lines` via existing `createRequestOrderDraft` grouped by Series (supplier/factory pending; site/bucket/month snapshot preserved in need_reason/note/related_entity_type), then mark drafts submitted → records appear on Request Order Draft page → existing Approve / Convert to PO / PO Overview / PO List flow unchanged. Demo = in-memory simulation only. Pagination = 50 rows/page; footer already on shared `.km-table-footer`.

**No** shortage/recommendation formula, supplier-selection algorithm, factory lead-time logic, or Inventory/Shipment/FC Summary changes. Apps Script files are source mirrors — must be copied into the live project and redeployed.

## 2026-07-03 — Procurement & Shipment lifecycle finalized (documentation sync only)

- **Procurement lifecycle finalized:** Recommendation Engine → `request_order_allocation_drafts`/`_lines` (regenerable) → **Send Request** → `request_orders`/`request_order_lines` (official) → `request_order_line_sources` (every source: FC / Inventory / Lead Time / Target Rules / Manual — never deleted) → **Approve** → `purchase_orders`/`purchase_order_lines` → `request_order_po_links` (Request↔PO many-to-many; supplier/factory split). Documented in SUPPLY_CHAIN_SYSTEM_FLOW §5.5.
- **Shipment lifecycle finalized:** Recommendation Engine → `shipping_allocation_drafts`/`_lines` (regenerable) → **Submit Plan** → `shipping_plans`/`shipping_plan_lines` → **Approve** → `shipments`/`shipment_lines` → `shipment_events` (full lifecycle log; future tracking integration). Documented in SUPPLY_CHAIN_SYSTEM_FLOW §5.6.
- **Export Template source finalized:** Purchase Order Template ALWAYS from `purchase_orders`/`purchase_order_lines`; Shipping Template ALWAYS from `shipments`/`shipment_lines`. **Never generated from a Draft.**
- **Request Order / Shipment Draft architecture officially documented:** DATABASE_RELATIONSHIP_MAP §7.6 adds both relationship trees. `request_order_line_sources`, `request_order_po_links`, and the full `shipment_events` lifecycle log are **documented (spec-only), not yet implemented** — no schema/code change.
- **Documentation sync only — no code / API / DB / calculation / Shipment Center Spec / frontend / backend changes.**

## 2026-07-03 — Request Order second-layer layout small fix

- **3-column grouping:** expand panel moved from a 2×2 grid to three columns (`ro-sku-expand-grid--v4`, top-aligned, no stagger): **Left** = Past Achievement + Future Basic/Special FC; **Middle** = Factory Stock + Factory Orders; **Right (Decision block)** = Recommendation Summary + Order Allocation. Recommendation/Order Allocation no longer sit under the Factory section.
- **Factory Stock factory name:** Factory column now displays `warehouses.warehouse_name` (join by `warehouse_id`; fallback `warehouse_id` → `--`).
- **Order Allocation column order:** swapped to **Month | Bucket** (display only; stored allocEdits keys / data-attributes unchanged).
- Docs: REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC §12.7 updated. **No DB schema / calculation / mapping-key changes**; UI/CSS + spec only.

## 2026-07-03 — Request Order: Site Confirmation persistence + composite row key + second-layer 3×2 layout

**Fix 1 — Confirm Site now persists to DB (was frontend-only).** New table `request_order_site_confirmations` (site_confirmation_id, planning_cycle, company, country, marketplace, series, bucket, status, confirmed_by/at, note, created/updated_at). New Apps Script `16_request_site_confirmation_handlers.gs` (`upsertRequestOrderSiteConfirmations` — batch upsert by `planning_cycle+company+country+marketplace+series+bucket`) + router action + `03` validTabs (×2). API adapter: `normalizeRequestOrderSiteConfirmationRecord`, assembly `requestOrderSiteConfirmations`, `getRequestOrderSiteConfirmations` getter, `upsertRequestOrderSiteConfirmations` writer (reload after write). Frontend: Confirm Site modal reworked to **Planning Bucket(s) T1/T2/T3 (each with month) + Confirm All checkbox**; `saveConfirmSite` is async → writes one record per (scope × bucket), demo = in-memory. `confirmedSites` **rehydrated from DB on every render** (`_roLoadConfirmationsFromDb`) so it survives reload. **Send Request gate is now bucket-aware**: Send T1/T2/T3 requires all site scopes confirmed for that bucket; All requires T1∧T2∧T3; block message = "Please confirm all site scopes before sending this request." Confirm Site records approval ONLY — never creates request_orders, never moves stock.

**Fix 2 — expand row key.** Row expansion identity changed from **SKU-only** (`expandedSku`) to composite **`sku|company|country|marketplace`** (`expandedRowKey` + `_roRowKey`). `toggleRequestOrderSkuExpand(sku,country,marketplace,company)` rebuilds the key; wrappers use `data-rowkey`; height sync selects the single open panel by class. CO1100-R/US/Amazon and CO1100-R/CA/Amazon now expand/collapse independently.

**Fix 3+4+5 — second-layer layout.** Expand panel rebuilt as a true **3-column × 2-row grid** (`ro-sku-expand-grid--v5`, columns **A 34% · B 24% · C 42%**): every block is its **own card** (Factory Stock ≠ Factory Orders; Recommendation ≠ Order Allocation). Explicit grid placement → top row (Past Achievement / Factory Stock / Recommendation) and bottom row (Future FC / Factory Orders / Order Allocation) each auto-align to equal height. DOM order is column-major → clean grouped stacking on ≤900px, no horizontal overflow. **Factory Stock table dropped the Warehouse column** → Factory · Current Stock · Reserved · Available (Factory = `warehouses.warehouse_name`, fallback warehouse_id → --).

**Fix 6 — Order Allocation column order** already correct: Month | Bucket | Suggested | Order Qty | Carton | Note (no change).

**No** shortage/recommendation formula, supplier-selection, lead-time logic, or Inventory/Shipment/FC Summary changes. `request_order_site_confirmations` is the only new table (approval state, no stock effect). Apps Script files are source mirrors — must be copied into the live project and **redeployed**.

## 2026-07-03 — Request Order Draft card UI + Send Request data integrity + bucket preservation

**Part A/B — Request Order Draft card (request-order-draft.js + procurement.css).** Card restructured to the **Weekly Shipping Plan visual** (`.sp-card` header summary + right-side actions; `.sp-card-details` shown via `.is-expanded`; styles replicated scoped to `#request-order-draft-section` in procurement.css). Header Layer 1 = Status · Request No · Company (summary; per-line split → `request_order_line_sources` future) · Factory/WH (default Tier 1 `WH-TW-CN-FACTORY-YOUXIN`, shows `warehouses.warehouse_name`) · Series · Total Qty · Total Ctn · Est. Amount · Created. Actions = Expand/Save/Submit/Cancel. Expanded detail = **3 blocks**: **A SKU Details** (SKU +T1/T2/T3 chip · Current Stock · Following 3 Month FC · Avg Sales/FC · Days of Supply · Requested · Approved [editable] · Carton; Approved edits recompute Carton + totals live; Save via updateRequestOrderLineQty), **B Schedule/Reason** (inspection/ready/ship dates placeholders + note), **C Factory/Payment** (Factory · deposit · balance · Total=estimated_amount · payment_status; deposit/balance/status are `--` placeholders). **Full-carton gate blocks Submit** when Approved not a multiple of units/carton.

**Part C/D — data integrity + mapping (13_procurement_handlers.gs, operation-system-db-api.js, request-order.js).** `request_order_lines` schema extended (additive, sheetEnsureColumns_-safe): `request_bucket`, `request_month`, `final_order_qty`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `shortage_qty`, `reallocation_qty`, `calculation_method`, `line_status`, `linked_purchase_order_line_id`. `createRequestOrderDraft` writes bucket/month + snapshots + calculation_method='manual_order_allocation' + line_status='draft'. Status transitions set line_status + lock `final_order_qty`=approved on submit/approve (clear on reject; cancelled on cancel) via new `procurementUpdateRequestLines_`. **Send Request (下單系統)** now: full-carton validation blocks send when order_qty not a multiple of units/carton; threads bucket/month + snapshots (factory/site/third-party/fc/target) into allocation-draft lines AND request_order_lines; **bucket preserved per line, never merged**. API normalizer exposes all new line fields.

**Finalized rule (docs — SPEC §3.2/§7.1/§12.13, DB_MAP §7.2, FLOW §5.5):** Request Layer preserves T1/T2/T3; PO Layer may merge later via `request_order_po_links`; T1/T2/T3 are demand buckets, not direct PO-grouping rules. Send Request creates official request_orders/lines only on action; drafts are never official until sent.

**Part E:** Phase 1 only (bucket + data integrity preserved; current selector kept). T1/T2/T3 tabs = Phase 2; PO Overview grouping = Phase 3 — spec-documented, not built.

**Part F (from prior task, verified):** composite expand key `sku|company|country|marketplace`; second-layer 3×2 independent-card grid (`--v5`); Factory Stock without Warehouse column (shows warehouse_name); Order Allocation order Month|Bucket. No change needed this task.

**Snapshots left blank when source absent (documented):** on_the_way_qty (no shipment-overview join), factory_allocated_qty (no allocation engine), shortage_qty (no formula), reallocation_qty (no reallocation engine); Avg Sales/FC + Days of Supply on the draft card (no sales snapshot join); Schedule dates + deposit/balance/payment_status (no source). **No** calculation formula / AI / carrier-template / shipment-flow / FC-Summary-Campaign-Inventory change. Apps Script `13_` is a source mirror — copy into live project and **redeploy**.

## 2026-07-03 — Request Order Draft = Decision Layer (finalized 3-block refactor)

**Direction:** PO Overview split/merge PAUSED. All ordering decisions now finish in Request Order Draft; PO Overview later only inherits the approved result + execution info (supplier/factory/payment/dates).

**Part A — first-layer header (request-order-draft.js):** `Factory/WH` → **`Factory`** showing `warehouses.warehouse_name` only (warehouse_id is source of truth, shown only if no name; default Tier 1 `WH-TW-CN-FACTORY-YOUXIN`). Company summary now from the real per-line `company` column (KM / ResUS / ResTW).

**Parts B–E — expanded card = exactly 3 stacked blocks:** (1) **SKU In Total** read-only `SKU · KM · ResUS · ResTW · Requested · Approved · Carton` + footer Total SKUs/Approved/Ctn, **computed live = T1 + (T2+T3)**; removed Current Stock / Following 3 Month FC / Avg Sales·FC / Days of Supply. (2) **T1 Request** and (3) **T2 + T3 Request**: upper table same columns (one row per (sku,bucket) to preserve bucket), **Approved editable**; KM/ResUS/ResTW split **locked when Approved==Requested**, **editable + must sum to Approved when Approved≠Requested** (each company cell = one real request_order_line via new `company` column); lower editable schedule **Inspection/Expected Ready/Expected Ship dates**; top-right **✕ (cancel tier)** + **+ Add Note**. **Factory/Payment block REMOVED** (only Est. Amount stays in header). Save/Submit validate company-split==Approved and full-carton.

**✕ cancel tier:** new Apps Script `cancelRequestOrderTier` (+ router + `KM.DB.cancelRequestOrderTier`) — soft sets `line_status='cancelled'` for the tier's lines; if a request has no active line left, header `status='cancelled'` + cancelled_by/at; totals recalc excludes cancelled lines. No hard delete.

**Add Note:** writes to `request_order_lines.note` for the tier's lines (via extended `updateRequestOrderLineQty`, which now also persists `inspection_date`/`expected_ready_date`/`expected_ship_date`/`note` per line).

**DB (13_procurement_handlers.gs, additive columns on `request_order_lines`):** `company`, `inspection_date`, `expected_ready_date`, `expected_ship_date`. `createRequestOrderDraft` writes `company` (Send Request passes `item.company`); recalc excludes cancelled lines. API normalizer exposes company/schedule fields. CSS: decision-layer blocks scoped to `#request-order-draft-section` in procurement.css.

**Data integrity (Part F):** Send Request preserves T1/T2/T3 bucket + company per line + Requested/Approved/Carton + schedule (if entered).

**MISSING DB FIELD (documented, no silent behavior):** there is **no structured company-split store** — split = one line per company. Re-allocating Approved to a company with **no existing line** for a (sku,bucket) is **not supported** in Phase 1 (would need a new company line). `request_order_line_sources` (append-only source incl. company allocation) remains **spec-only, not implemented** — its status is NOT touched by tier-cancel.

**Unchanged:** PO Overview split/merge, PO List, Shipment/Shipping Plan, FC Summary, calculation engine, supplier/payment automation. Apps Script `13_`/`01_` are source mirrors — copy to live project + **redeploy**.

## 2026-07-03 — Request Order mapping finalization: DB cleanup spec + Company Allocation popup + horizontal blocks

**Part 1 — DB cleanup (docs only, no columns deleted from live sheets):** `request_order_lines` fields marked **DEPRECATED / not source of truth**: final_order_qty, forecast_qty, current_stock, on_the_way_qty, factory_allocated_qty, reallocation_qty, source_company_count, source_site_count, product_name, need_reason, related_entity_type, related_entity_id. **PRIMARY:** company, request_bucket, request_month, series, requested_qty, approved_qty, shortage_qty, carton_qty, units_per_carton, inspection/expected_ready/expected_ship dates, calculation_method, line_status (+ reserved km/resus/restw/recommended_qty). Documented in SPEC §3.2, DB_MAP §7.2, FLOW §5.5.

**Part 2 — request_order_line_sources = source of truth for company/site/month:** spec adds **tier_type** + **source_month** (SPEC §3.8). **Read path implemented** (safe/additive): validTabs (03) + adapter `getRequestOrderLineSources()` + `normalizeRequestOrderLineSourceRecord` (exposes tierType/sourceMonth; requested/approved/shortage as numbers). **Write path PENDING** — no handler populates it yet (documented, no invented behavior).

**Part 3 — purchase_order_lines future snapshot (SPEC ONLY):** documented `km_qty`/`resus_qty`/`restw_qty` snapshot at PO creation (commitment layer shouldn't recompute Request source). No PO code changed.

**Part 4/5 — Company Allocation popup (request-order-draft.js + procurement.css):** in SKU In Total, KM/ResUS/ResTW values are **clickable when >0** → read-only modal "Company Allocation Detail" (Company · SKU · Tier · Month · Country · Marketplace · Requested · Approved · Shortage · Note). Source = `request_order_line_sources` filtered to the card's lines for that SKU+company; **fallback** = card's `request_order_lines` grouped by company with a **"Site-level source pending."** banner. Clicking 0/-- does nothing; empty → "No allocation detail." Read-only, closes on ✕/overlay/Esc, never stacks (`.pc-modal` style). Per-card line cache `roLinesCache`.

**Part 6 supplement — horizontal equal-height blocks:** SKU In Total / T1 Request / T2+T3 Request now render side-by-side via `.ro-decision-grid` (3 equal columns, `align-items:stretch`), tables scroll inside their wrapper (no page overflow), stacks ≤1100px.

**Part 6 — normalizer:** request_order_line_sources normalized with numeric requested/approved/shortage + tier_type/source_month exposure.

**No changes to:** PO Overview, PO List, Shipment, FC Summary, Inventory, Carrier/Template/Export, calculation engine. Apps Script `03_` is a source mirror — copy to live project + redeploy for the new validTab to take effect (until then getRequestOrderLineSources returns []).

## 2026-07-06 — Request Order Draft → Request Order DB mapping finalization

**1. request_order_line_sources WRITE path implemented (13_procurement_handlers.gs):** `handleCreateRequestOrderDraft_` now appends one `request_order_line_sources` row per request line at Send Request. Finalized header: line_source_id, request_order_line_id, request_order_id, sku, company, country, marketplace, tier_type(=request_bucket), source_month(=request_month), requested_qty, approved_qty, shortage_qty, source_type, note, created_at, updated_at. Deprecated old fields NOT created (ownership_company, warehouse_id, site_sku, forecast_qty, current_stock, on_the_way_qty, factory_allocated_qty, reallocation_qty, recommended_qty, allocation_method, source_bucket, source_priority). Send Request (request-order.js) now passes country/marketplace into the RO line payload. Company Allocation popup shows REAL rows (legacy pre-write requests still fall back).

**2. request_order_lines km_qty/resus_qty/restw_qty:** new columns written at creation (matched company = approved, others 0) via `procurementCompanyQty_`; recomputed in `updateRequestOrderLineQty` when approved changes. Normalizer exposes kmQty/resusQty/restwQty.

**3. tier_type on request_order_lines:** removed from header; canonical bucket = request_bucket. Not written/ensured/re-added.

**4. request_orders.tier_group:** new column; `procurementTierGroup_` computes T1 / T2_T3 / mixed / blank from the request's line buckets at creation.

**5. Header-level dates removed:** request_orders never writes inspection_date/expected_ready_date/expected_ship_date (line-level only, already on request_order_lines).

**6. request_status canonical:** request_orders header uses `request_status` (draft/pending_approval/approved/cancelled/converted_to_po). Legacy `status` removed from header array (not recreated). All handlers read via `procurementReqStatus_` (request_status || status fallback) and write ONLY request_status (createRequestOrderDraft, updateRequestOrderStatus, cancelRequestOrderTier, createPurchaseOrderFromRequest, seed). Normalizer: requestStatus + status both = request_status||status; tierGroup exposed. Handlers `sheetEnsureColumns_(['request_status'])` before findRow so old rows resolve.

**7. Default warehouse_id:** createRequestOrderDraft defaults warehouse_id to `WH-TW-CN-FACTORY-YOUXIN` (CN Youxin) when none supplied.

**8. Deprecated request_order_lines fields removed from header/write:** product_name, need_reason, related_entity_type, related_entity_id, final_order_qty, forecast_qty, current_stock, on_the_way_qty, factory_allocated_qty, reallocation_qty (source_company_count/source_site_count were never present). `procurementUpdateRequestLines_` no longer writes final_order_qty. Normalizer drops these (keeps productName/finalOrderQty read-only for back-compat). Missing-header safe (appendByHeader writes only existing columns).

**Files:** 13_procurement_handlers.gs, operation-system-db-api.js (normalizers), request-order.js (Send Request line payload). 03 validTabs already had request_order_line_sources. **No PO Overview/List/Shipment/Carrier/Export/calc changes.** Apps Script `13_` is a source mirror — copy to live project + redeploy; on old sheets the new columns auto-append (missing-header safe), old `status`/deprecated columns remain but are no longer written.

## 2026-07-06 — Carrier Rate Card v1 spec finalized (spec only — pending implementation)

**Docs only — no code / frontend / Apps Script / DB migration / pricing engine.** Updated `CARRIER_AND_ROUTE_SPEC.md` → Draft v1.3 and `DATABASE_RELATIONSHIP_MAP.md` §9.

- **Purpose:** Carrier Rate Card is **Reference / Master-like** logistics pricing data — NOT a Decision Layer, does NOT auto-decide carrier, no calculation; supports lookup / filter / manual comparison + future pricing engine.
- **Schema (`carrier_rate_cards` §4):** added `transit_type` (port_to_port/door_to_port/port_to_door/door_to_door), `battery_type` (no_battery/built_in_battery/removable_battery/lithium_battery/unknown), `customs_type` (buy_export_license/tax_refund_export/not_applicable/unknown), `note`. Clarified `charge_type` = pricing model (weight/volume/container/shipment/carton), `charge_unit` (kg/lb/cbm/20GP/40HQ/shipment/carton), `min_charge` = per-row minimum billable amount.
- **Carrier Rate Card page v1 (§4C.2):** filters Date / Country-Ship To / Method / Carrier + Search; **no data before Search**; 23 display columns; **Lead Time from `carrier_lead_times.min_days~max_days`, blank if none**.
- **Template Export v1 (§4C.3):** from active rows; preserve fixed route/method/charge structure; clear `unit_rate`/`effective_from`/`effective_to`; optionally editable `fuel_surcharge`/`customs_fee`/`doc_fee`/`min_charge`; example rows + protected columns; **template-only `row_type` (example/data) NOT persisted**.
- **Template Import v1 (§4C.4):** **append-only** (no overwrite); validation (carrier/method/charge_type/charge_unit/currency exist, numeric unit_rate, valid dates, effective_from ≤ effective_to, status defaults active, `example` skipped).
- **Effective-date overlap (§4C.5):** append new rate version, never overwrite; future engine tie-break latest effective_from → latest import_batch_id/updated_at → conflict warning; v1 page shows both.
- **Deferred (§4C.6):** `carrier_fee_types` + `carrier_rate_breakdowns` NOT v1 (FCL/container breakdown later); v1 keeps all rate rows flat in `carrier_rate_cards`.

**Status: Carrier Rate Card v1 spec FINALIZED / pending implementation** (no schema migrated, no page/handlers built).

## 2026-07-06 — Carrier & Route Spec v1.4 finalized (final architecture sync; spec only)

**Docs only — no code / frontend / Apps Script / DB migration / engine.** `CARRIER_AND_ROUTE_SPEC.md` → Draft v1.4; `DATABASE_RELATIONSHIP_MAP.md` §9 synced.

- **`carrier_rate_cards.transit_days` REMOVED** everywhere — Lead Time is no longer stored on rate cards.
- **`carrier_lead_times` = the SINGLE SOURCE OF TRUTH for Lead Time.** `carrier_rate_cards` must never duplicate lead-time data.
- **Carrier Rate Card page:** Lead Time is a **display-only join** to `carrier_lead_times` matched by `carrier_id + origin_country + destination_country + shipping_method`; **blank if no match — no fallback value**.
- **Carrier Rate Template:** does **NOT** include Lead Time; responsible only for `unit_rate` / `effective_from` / `effective_to` / `fuel_surcharge` / `customs_fee` / `doc_fee` / `min_charge`; all routing/method/charge-structure columns locked.
- **`carrier_lead_times` lifecycle is independent** from Carrier Rate — Kitchen-Mama-maintained (manual now; future manual/shipment-history auto updates); never updated by the rate template.
- **Relationship Map:** `carriers → carrier_rate_cards` and `carriers → carrier_lead_times` shown as **independent master tables**; the page reads both together **for display only — neither writes to the other**.

**Status: Carrier Rate Card Spec v1.4 finalized — Carrier implementation ready. Carrier Lead Time finalized as independent master data.**

## 2026-07-06 — Carrier Rate Card page v1 implemented (Carrier & Route Spec v1.4)

**New modular page** following the partial-loader + lifecycle architecture. Carrier Rate Card = Reference/Master-like data (NOT a Decision Layer; no pricing engine, no ranking, no auto carrier decision).

**Files added:** `assets/html/pages/carrier-rate-card.html`, `assets/js/pages/carrier-rate-card.js`, `assets/css/pages/carrier-rate-card.css`, `assets/specs/active/apps-script/17_carrier_handlers.gs`.
**Files changed:** `index.html` (CSS link + `#carrier-rate-card-mount` + JS include + "Carrier / Route" sidebar menu), `assets/js/app.js` (sectionMap `carrier-rate-card` → `carrier-rate-card-section`, both maps), `assets/js/api/operation-system-db-api.js` (normalizers + getters + export/import wrappers), `01_router.gs` (`importCarrierRateCards` action), `03_master_data_handlers.gs` (validTabs += carriers, carrier_rate_cards, carrier_lead_times).

**Reads (missing-tab/header safe → []):** `getCarriers()`, `getCarrierRateCards()`, `getCarrierLeadTimes()` + `normalizeCarrierRecord` / `normalizeCarrierRateCardRecord` / `normalizeCarrierLeadTimeRecord`. `carrier_rate_cards` normalizer has **NO** `transit_days`.

**Page:** filters Date / Country-Ship To / Method / Carrier + **Search**; **no data before Search**; 23 columns in spec order; `carrier_name` joined from `carriers`; **Lead Time is a display-only join** to `carrier_lead_times` by `carrier_id + origin_country + destination_country + shipping_method` → `min ~ max days` / `avg days avg` / **blank (no fallback)**. Sticky header via `--km-sticky-top-base` (no magic numbers).

**Template Export (client-side CSV, `KM.DB.exportCarrierRateTemplate`):** from current Search result; `row_type` helper (example/data, not persisted); one example row; clears `unit_rate`/`effective_from`/`effective_to`; editable = unit_rate/effective dates/fuel/customs/doc/min_charge/note/status; fixed structure columns preserved (visually via a documented fixed/editable split). **Excludes** rate_card_id/import_batch_id/created/updated + **all Lead Time columns + transit_days**.

**Template Import (`KM.DB.importCarrierRateTemplate` → `importCarrierRateCards` handler):** **APPEND-ONLY** (never overwrites/deletes; overlapping effective dates allowed = multiple rows); new `rate_card_id` + `source_file_name` + `import_batch_id` + timestamps per row; `row_type=example` skipped; blank row_type treated as data. **Rejects the whole import** if forbidden columns present (transit_days / min_days / max_days / avg_days / lead_time_id — client pre-check + server guard). Per-row validation: carrier_id exists, shipping_method not blank, charge_type/charge_unit valid enum, currency not blank, numeric unit_rate, valid effective_from/effective_to, effective_from ≤ effective_to; status defaults active. Returns imported / skipped_examples / rejected / batch_id / per-row errors → shown in a summary; Search refreshes after success.

**Out of scope (not built):** Carrier Price Engine, carrier recommendation, shipment ETA, carrier_fee_types, carrier_rate_breakdowns, carrier_quote_history. No `transit_days` anywhere.

**Deploy note:** Apps Script `01_`/`03_`/`17_` are source mirrors — copy into the live project and **redeploy** for the new validTabs + `importCarrierRateCards` action to take effect (until then reads return [] and import is a no-op with "API not configured").

## 2026-07-06 — SKU Master + SKU Regional Details architecture spec finalized (spec only — no DB migration)

**Docs only. No code / frontend / Apps Script / API / DB migration. The actual DB is NOT modified — implementation pending; the user will update the real DB after the MD + implementation are ready.**

**New doc:** `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` (authoritative). **Updated:** DATABASE_RELATIONSHIP_MAP.md §3/§4/§4A + layer table, SKU_DETAILS_ADD_EDIT_SPEC.md, SKU_DETAILS_LOGISTICS_SPEC.md, INVENTORY_TABLE_MAPPING_SPEC.md §17.3A.

- **`sku_details` = Product Master** (global product facts only). Keeps brand **baseline** prices `minimum_price` / `msrp` / `selling_price` (reference/governance, NOT live price).
- **`base_currency` ADDED** to `sku_details`; **`minimum_price_unit` / `msrp_unit` / `selling_unit` DEPRECATED** (all three prices use base_currency).
- **Attributes ADDED** to `sku_details`: `material` (multi-value underscore, e.g. Stainless_Steel_ABS), `battery_type` (none/built_in/removable/lithium/unknown), `magnet_type` (none/magnetic/unknown).
- **`hscode` / `declared_value` / `declared_value_unit` MOVED OUT** of `sku_details` → `sku_regional_details`.
- **NEW `sku_regional_details`** (extension, not master): regional_detail_id, sku, company, country, marketplace, marketplace_sku_id, site_sku, marketplace_product_id, hscode, declared_value, declared_currency, duty_rate, extra_duty_rate, packaging_regulation, regulation_url, manual_language, warning_label, status(active/inactive/pending), note, created/updated_at. Match grain sku+company+country+marketplace+marketplace_sku_id.
- **`marketplace_skus.asin → marketplace_product_id`** (platform-neutral; Amazon ASIN stored there; UI may label "ASIN"). `asin` = read-fallback only during migration, not canonical.
- **Creation rule:** Add SKU / Add Marketplace SKU also creates/ensures the paired `sku_regional_details` row (copies identity + status=active; compliance blank).
- **Sync rules:** site_sku / marketplace_product_id edits propagate both ways; conflict → marketplace_skus wins operational identity, sku_regional_details wins compliance; surface warning / repair-sync.
- **Pricing unchanged & independent:** `pricing_list` = live price, `pricing_change_log` = history; NOT moved into sku_regional_details; no pricing edit on the Regional Details page.
- **UI:** SKU Details ADD material/battery_type/magnet_type/base_currency, REMOVE hscode/declared_value/declared_value_unit + the three *_unit; new simple **SKU Regional Details** page manages sku_regional_details (no pricing).

**Legacy read-fallback during migration:** `*_unit` (until base_currency set), `hscode`/`declared_value` on sku_details (until moved), `asin` (until copied to marketplace_product_id). Backfill is a future user-run migration step.

## 2026-07-06 — SKU Domain Architecture v2.0 finalized (spec only — no DB migration)

**Docs only. No code / frontend / Apps Script / API / DB migration. Actual DB NOT modified — implementation pending; user updates the real DB later.**

**SKU Domain restructured into 4 layers:** (1) `sku_details` = Product Master; (2) `sku_regional_details` = Regional/Marketplace Compliance Master (higher-level source of marketplace identifiers); (3) `marketplace_skus` = Operational Marketplace Layer (synced copy); (4) **`tax_referral_rates` = Tax/Referral/Duty Reference Master (NEW)**.

- **`sku_regional_details` simplified (v2):** now `regional_detail_id`, `sku`, `company`, `country`, `marketplace`, `site_sku`, `marketplace_product_id`, `packaging_regulation`, `regulation_url`, `language`, `manual_version`, `label_version`, `battery_regulation`, created/updated_at. **Removed** all tax fields (`hscode`, `duty_rate`, `extra_duty_rate`, `vat`, `port_tax`, `referral_fee_rate`, `declared_value`, `declared_currency`) + `marketplace_sku_id` / `status` / `note` / `warning_label` (→ `manual_language` renamed `language`).
- **New `TAX_AND_REFERRAL_RATES_SPEC.md`:** Reference Master `tax_referral_rates` (`tax_rate_id` PK, `series`, `duty_country`, `country_of_origin`, `hscode`, `duty_rate`, `extra_tax_rate`, `vat`, `port_tax`, `referral_fee_rate`, `declared_value`, `declared_currency`, `effective_from/to`, `note`, created/updated_at). Keyed by `series`. **Single source of truth** for HS Code / Duty / VAT / Referral / Declared Value — not duplicated anywhere. **`country_of_origin` intentionally stays here, NOT moved to `sku_details`.** Future Cost/Duty/Shipment-cost/Export/AI reference; no engine.
- **Marketplace sync updated:** `sku_regional_details` = higher-level source; `marketplace_skus` = synchronized operational copy. Primary synced fields: `site_sku`, `marketplace_product_id`, `company`, `country`, `marketplace`. Two flows (A: replenishment first → ensure regional; B: regional first → marketplace copies). Conflict → Regional Details wins (reverses v1).
- **Inventory mapping:** duty synchronization **removed**; tax info now comes from `tax_referral_rates` via `series`.
- **DATABASE_RELATIONSHIP_MAP:** §4A rewritten (v2 schema), **§4B `tax_referral_rates` added**, layer table + relationship diagrams updated (`sku_details → sku_regional_details → marketplace_skus`; `sku_details → series → tax_referral_rates`).

**Files:** NEW `TAX_AND_REFERRAL_RATES_SPEC.md`; updated `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` (→ v2.0), `DATABASE_RELATIONSHIP_MAP.md`, `INVENTORY_TABLE_MAPPING_SPEC.md`, this file. **No implementation, no DB migration.**

## 2026-07-06 — SKU Domain v2.0 DB/API/UI sync IMPLEMENTED (DB already updated by user)

**API adapter (operation-system-db-api.js):**
- `sku_details` normalizer: added `material` / `batteryType` / `magnetType` / `baseCurrency` (base_currency canonical; falls back to legacy *_unit only when blank). Kept `hsCode`/`declaredValue`/`*Unit` as **read-only** back-compat (no longer displayed/written).
- `marketplace_skus` + `pricing_list` normalizers: added canonical **`marketplaceProductId`** (reads `marketplace_product_id`, falls back to legacy `asin`). `asin` kept read-only alias.
- NEW normalizers/getters: `getSkuRegionalDetails()` + `normalizeSkuRegionalDetailRecord` (v2 schema), `getTaxReferralRates()` + `normalizeTaxReferralRateRecord` (**read-only**). NEW writer `upsertSkuRegionalDetail(payload)`.

**Apps Script:**
- `04_marketplace_forecast_import.gs` (primary Add SKU path): required headers use `marketplace_product_id` (not `asin`); reads product id from marketplace_product_id (asin fallback); **writes canonical marketplace_product_id, never asin** (marketplace_skus + pricing_list, create + update). Added SKU-domain sync: **Flow B** (regional row exists → its site_sku/marketplace_product_id override), **Flow A** (create → ensure sku_regional_details), and operational-edit → regional sync.
- `03_master_data_handlers.gs`: `handleUpsertMarketplaceSku_` writes company + marketplace_product_id (never asin), applies Flow B + ensures regional; validTabs += `sku_regional_details`, `tax_referral_rates` (both arrays).
- NEW `18_sku_regional_handlers.gs`: `handleUpsertSkuRegionalDetail_` (page writer, optional sync into marketplace_skus) + shared helpers `skuRegionalLookup_` / `skuRegionalEnsure_` / `skuRegionalSyncIdentity_` / `marketplaceSkuSyncIdentity_`. Regional = higher-priority source.
- `01_router.gs`: + action `upsertSkuRegionalDetail`.

**Frontend:**
- `inventory-replenishment.js` Add SKU payload: `asin` → `marketplace_product_id` (input id `replen-add-asin` retained; UI may label "ASIN").
- `sku-details.js` + `sku-details.html`: repurposed table cols 16/17 (HScode / 申報價值) → **Material / Battery·Magnet**; price columns now display with **base_currency** (removed per-price units + hscode + declared value from SKU Details display). 21-col grid intact (no scroll refactor).
- NEW **SKU Regional Details** page (`sku-regional-details.html/.js/.css`, lifecycle `sku-regional-details-section`, sidebar item, app.js sectionMap): list + Edit modal for sku/company/country/marketplace/site_sku/marketplace_product_id/packaging_regulation/regulation_url/language/manual_version/label_version/battery_regulation. Editing site_sku/marketplace_product_id syncs to marketplace_skus (regional higher-priority) via `upsertSkuRegionalDetail({sync_marketplace_sku:true})`. No pricing/tax editing.

**Out of scope (not implemented):** Cost/Duty/Tax calculation engines, Carrier, Shipment, Pricing engine. `tax_referral_rates` is **read-only** (no CRUD/engine).

**Deploy note:** Apps Script `01_`/`03_`/`04_`/`18_` are source mirrors — copy to the live project + **redeploy**. DB already updated by user (marketplace_product_id, base_currency, material/battery/magnet, sku_regional_details, tax_referral_rates present). Missing-tab/header remains safe (getters return []; asin read-fallback until legacy column dropped).

## 2026-07-06 — SKU Regional Details backfill tool + Carrier `last_mile_delivery` split

**A. SKU Regional Details backfill (fixes empty `sku_regional_details` after redeploy; idempotent + resumable).** The Flow-A "ensure" only fires on future Add/Upsert SKU; it does not populate rows for pre-existing `marketplace_skus`. Added a repeatable, timeout-safe backfill:
- `18_sku_regional_handlers.gs`: `handleSyncMarketplaceSkusToSkuRegionalDetails_(body)` — walks ALL `marketplace_skus` rows; match key `sku + company + country + marketplace`. **Idempotent:** existing regional keys are indexed ONCE up front (`skuRegionalKeyIndex_`, single read → O(1) per-row lookup, replacing the old per-row full-sheet re-read that caused timeouts); a row whose key already exists is **skipped immediately — never updated/rewritten**. Missing identity → skipped (invalid) + warning. Missing key → **create** (`SRD-<10-char UUID>`, copies sku/company/country/marketplace/site_sku/marketplace_product_id, `created_at`+`updated_at`), **`SpreadsheetApp.flush()` after each create** so a timeout never rolls back earlier rows. **Batch limit** `body.batch_limit` (default 300, ceiling 5000) caps CREATES per execution; on hit it stops gracefully. Never touches `packaging_regulation`/`regulation_url`/`language`/`manual_version`/`label_version`/`battery_regulation`. Writes `marketplace_product_id` only (never `asin`). Returns `{created_count, skipped_exists_count, skipped_invalid_count, remaining_count, next_start_index, finished, batch_limit, warning_count, errors, warnings}`. **Click again to continue** — already-created rows are skipped, so it converges with no duplicates.
- `01_router.gs`: + action `syncMarketplaceSkusToSkuRegionalDetails` → `handleSyncMarketplaceSkusToSkuRegionalDetails_`.
- `operation-system-db-api.js`: `KM.DB.syncMarketplaceSkusToSkuRegionalDetails()` (POST + reload).
- `inventory-replenishment.html` / `.js`: **Sync Regional Details** button — summary alert shows Created / Skipped(exists) / Skipped(invalid) / Remaining / Finished, and prompts to click again when not finished.
- **Note on the reported "handler is not defined" error:** the function + router wiring were already correct in the source mirror — the error was purely because the live Apps Script project had not been redeployed with `18_`/`01_`. Redeploy all `.gs` files together to resolve.

**B. Carrier `shipping_method` vs `last_mile_delivery` split (runtime + UI implemented).** `shipping_method` = main transportation mode (`Sea`/`Sea Express`/`Air`/`Courier`); new `last_mile_delivery` = final delivery mode (`Parcel`/`Truck`). Separate columns — never combined, never `Sea/P`/`P`/`T`.
- `operation-system-db-api.js`: `normalizeCarrierRateCardRecord` + `normalizeCarrierLeadTimeRecord` add `lastMileDelivery`. Template export: `last_mile_delivery` added to `CARRIER_RATE_TEMPLATE_FIXED_COLS` + example/data rows (slice bound `19→20` to keep `currency` in structure block).
- `17_carrier_handlers.gs`: `CARRIER_RATE_CARDS_HEADERS_` + import write path add `last_mile_delivery`.
- `carrier-rate-card.js` / `.html`: **Shipping Method** and **Last Mile Delivery** shown as separate columns; optional **Last Mile Delivery** filter. Lead Time display join now keys on `carrier_id + origin_country + destination_country + shipping_method + last_mile_delivery`, with **legacy fallback** to `… + shipping_method` when the rate card's `last_mile_delivery` is blank; still blank (no fabricated value) if nothing matches.
- Specs: `CARRIER_AND_ROUTE_SPEC.md` v1.5, `DATABASE_RELATIONSHIP_MAP.md` §9 updated (schema rows, join key, separation note).

**Out of scope (unchanged):** NO Carrier Price Engine, NO Cost Engine, no unrelated refactor.

**Deploy note:** `01_`/`17_`/`18_` are source mirrors — copy to the live project + **redeploy together**. DB must have the new `carrier_rate_cards.last_mile_delivery` + `carrier_lead_times.last_mile_delivery` columns (auto-added on next import for rate cards; add manually to `carrier_lead_times`). All reads remain missing-column safe (blank).

## 2026-07-06 — Carrier v1.1 template modes + matching priority + SKU Management nav + Sync button removed

**A. Carrier Rate Card — two export template modes** (`operation-system-db-api.js` `exportCarrierRateTemplate(rows, {mode})`; `carrier-rate-card.js` + `.html` two buttons):
- **Export Update Template** (`mode:'update'`, default) — weekly/monthly rate update. Uses current Search result; route/method/charge structure locked; `unit_rate` / `effective_from` / `effective_to` cleared for re-fill. (Prior behavior, now explicit.)
- **Export Master Template** (`mode:'master'`) — one-time full import / new-route setup. Exports ALL loaded `carrier_rate_cards` rows (no Search required); every field editable, nothing cleared; supports adding new `shipping_method` / `last_mile_delivery` / `destination_warehouse_code` / city / zip / country rows.
- Both include `last_mile_delivery`; **neither** includes Lead Time / `transit_days`. Import path unchanged (append-only + validation). Handlers: `crcExportUpdateTemplate` / `crcExportMasterTemplate` (+ `crcExportTemplate` back-compat alias → update).

**B. Carrier destination matching priority FINALIZED** (spec only — no engine): `destination_warehouse_code` → `destination_city` → `destination_postal_code_start~end` → `destination_country`, **stop at the first (most specific) matching level** (higher wins; lower ignored). Then `marketplace` + `shipping_method` + `last_mile_delivery` + `weight_tier`. Documented in `CARRIER_AND_ROUTE_SPEC.md` §4 + `DATABASE_RELATIONSHIP_MAP.md` §9. Note: priority now puts **city above postal-range** (was postal→city).

**C. `last_mile_delivery`** — confirmed already implemented (separate columns on `carrier_rate_cards` + `carrier_lead_times`, separate UI column + filter). No code change this task.

**D. SKU Management nav grouping** (`index.html`): SKU Details + SKU Regional Details moved under a new collapsible **SKU Management** parent menu (`toggleMenu('sku-management')`), plus a disabled **Tax & Referral Rates** placeholder (Soon badge; page not built — spec only). Pages themselves unchanged; `showSection` keys (`skuDetails`, `sku-regional-details`) unchanged.

**E. Sync Regional Details button removed** (`inventory-replenishment.html`) — one-time backfill migration complete; not a permanent feature. Button replaced with an explanatory comment. The JS handler `syncRegionalDetails()` and backend action `syncMarketplaceSkusToSkuRegionalDetails` remain available (idempotent, safe to re-run) but are no longer user-facing.

**F. Specs:** `CARRIER_AND_ROUTE_SPEC.md` → v1.6 (Carrier v1.1: two template modes §4C.3, matching priority §4, last_mile), `DATABASE_RELATIONSHIP_MAP.md` §9 (matching priority).

**Out of scope (unchanged):** NO Request Order / PO / Calculation / Cost / Shipment logic touched; no unrelated refactor. Carrier changes are frontend + client CSV export only — no new Apps Script / API / DB migration required (Master export reuses the existing append-only import path).

## 2026-07-06 — Request Order Draft source mapping fixed + real-time validation

**A. `request_order_line_sources` write mapping fixed** (`13_procurement_handlers.gs` `handleCreateRequestOrderDraft_`). Header expanded to the full source schema; canonical PK renamed to **`request_order_line_source_id`** (generated `ROLS-<10-char UUID>`; legacy `line_source_id` dual-written so existing tabs stay populated; normalizer reads either). Per line now populates:
- **site_sku / marketplace_product_id** — looked up from `marketplace_skus` by `sku+company+country+marketplace` (`procurementMarketplaceSkuMap_`; asin read-fallback).
- **forecast_qty** — Σ next-3-month `fc_regular_forecast` (M+1, M+2, M+3, year-aware) × target multiplier (`procurementForecastNext3Map_` + `procurementTargetRuleResolver_`, priority **SKU > Series > Category > default 100%**; percent/fraction auto-normalized).
- **current_stock** — `amazon_inventory_snapshot.available_qty`, latest snapshot per `sku(+country+marketplace)` (`procurementInventoryStockMaps_`). *Limitation:* that snapshot has no `company` column → matched on sku/country/marketplace only (documented).
- **on_the_way_qty** — Σ `shipment_lines.qty` for the SKU where the parent `shipments.status` is NOT completed/received/closed/cancelled/delivered (`procurementOnTheWayMaps_`); narrows by parent country/marketplace when the line carries them. Status-join unavailable → 0 (missing-safe, documented).
- **allocation_method** = `manual_order_allocation` (never blank); **source_type** = `request_order_draft`; **source_bucket** = tier T1/T2/T3; **source_priority** = 1/2/3 (`procurementSourcePriority_`); **tier_type** = bucket.
- **shortage_qty / reallocation_qty / recommended_qty** = blank (Calculation Engine not implemented).
- All source-table reads are missing-tab/header safe. Manual drafts without company/country/marketplace still write correctly (identity-dependent fields resolve to '' / 0). API normalizer `normalizeRequestOrderLineSourceRecord` extended to expose the new fields.

**B. No deprecated fields written** — only current source-table columns are written; `procurementAppendByHeader_` writes only columns present in the sheet header, so nothing deprecated is recreated.

**C+D. Real-time Request Order Draft validation** (`request-order-draft.js`) — runs on every input/change **and** on expand, before Save (Part D: no layout/card redesign — only validation state added):
- **Approved = KM+ResUS+ResTW** (company allocation total) and **Approved = full-carton multiple** of units_per_carton, validated per editable tier row live.
- Invalid inputs get an immediate **red border** (`setInvalid_`) + a short **inline message** under the Approved input ("Approved qty must equal company allocation total." / "Approved qty must be a full-carton multiple.").
- **Save + Submit buttons are disabled** while any row is invalid (`setSaveBlocked_`; marker classes `ro-save-btn` / `ro-submit-btn`); the existing Save/Submit guards remain as a fallback.
- Applies across **T1 Request** and **T2+T3 Request** (SKU In Total is read-only). Full-carton is validated on the row TOTAL only — per-company full-carton NOT required (documented in code).

**Deploy note:** `13_procurement_handlers.gs` is a source mirror — copy to the live project + **redeploy**. `request_order_line_sources` gains new columns automatically (`sheetEnsureColumns_`) on the next createRequestOrderDraft. Out of scope (untouched): Purchase Order, Shipment, Carrier, Template/Export Center, Calculation Engine.

## 2026-07-06 — Carrier Rate Template: update/create by rate_card_id + carrier-scoped Update Template + importer-enforced locking

**Server (`17_carrier_handlers.gs` `handleImportCarrierRateCards_` rewritten):** import now classifies each data row by **`rate_card_id`**:
- **Existing row** (`rate_card_id` present, must exist) → **UPDATE**. In **`update` mode** only `unit_rate`/`effective_from`/`effective_to`/`fuel_surcharge`/`customs_fee`/`doc_fee`/`status`/`note` are writable; edits to any **locked** field (carrier_id/origin/destination keys/marketplace/shipping_method/last_mile_delivery/charge_*/dim_divisor/min_box_weight(+unit)/weight_tier(+unit)/currency/min_charge/transit_type/battery_type/customs_type) are **ignored (DB value kept) + counted (`locked_fields_ignored_count`) + row-warned**. In **`master` mode** any stored field may be updated.
- **New row** (blank `rate_card_id` + meaningful values) → **CREATE** (new `CRC-…` id; all fields editable; `carrier_id` defaults to the resolved **carrier scope**; may add new shipping_method/last_mile_delivery/destination_warehouse_code/city/zip/country). Required-field validation; invalid → rejected + reported.
- **Blank row** (no id, no meaningful values) → **skipped** (`blank_skipped_count`).
- New summary returned: `mode`, `updated_existing_count`, `created_new_count`, `blank_skipped_count`, `rejected_count`, `locked_fields_ignored_count`, `skipped_examples`, `warnings`, `errors`, `batch_id` (+ `imported` = updated+created back-compat). Lead Time/`transit_days` columns still reject the whole import. **Field locking is enforced here (importer), not by the CSV** (documented).

**Client:**
- `operation-system-db-api.js`: templates now include **`rate_card_id`** (2nd column; blank on example/new rows, populated on existing rows); `CARRIER_RATE_TEMPLATE_EDITABLE_COLS` aligned to the 8 editable fields (min_charge moved to locked). `exportCarrierRateTemplate` writes `rate_card_id`; `importCarrierRateTemplate` unchanged signature but callers now pass `mode` + `carrier_scope`.
- `carrier-rate-card.js`: **Export Update Template requires a selected carrier** (else blocks with *"Please select a carrier before exporting Update Template."*) and exports **only that carrier's active rows** (with `rate_card_id`), full set regardless of date/country filters, carrier-named filename. **Import** derives `mode` from the filename (`master` → master rules, else update) and passes the selected carrier as `carrier_scope` for new rows. Import result alert shows the full new summary (updated/created/blank-skipped/locked-ignored/rejected + warnings + errors).

**Master Template** unchanged in intent (all carriers, all fields editable, create-or-update by `rate_card_id`) — now genuinely updates existing rows on import.

**Specs:** `CARRIER_AND_ROUTE_SPEC.md` → v1.7 (§4C.3 two modes + carrier scope + `rate_card_id`, new **§4C.3A** row semantics & importer-enforced locking, **§4C.4** update/create import + full summary, new **§4C.7 future Export Center → carrier-email round-trip — documentation only**). `DATABASE_RELATIONSHIP_MAP.md` §9 carrier import note updated.

**Deploy note:** `17_carrier_handlers.gs` is a source mirror — copy to the live project + **redeploy**. No DB migration (columns unchanged; `rate_card_id` already exists). **Out of scope / NOT implemented:** email automation, Gmail/Inbox parser, Export Center, Carrier Price Engine, Shipment Cost Engine — the carrier round-trip is manual export → manual import; email return is documented as future only.

## 2026-07-07 — Import Job Framework architecture finalized (SPEC ONLY; Carrier = first adopter)

**Platform-level architecture** introduced. Import Job is a **shared platform layer, NOT a Carrier feature** — every import flows through it: **External Data → Import Job → Validation → Review → Apply → History → Business Tables.** Import **never** writes a business table directly; users review + approve, the system applies (Apply is the only write, from an Approved job), history remains.

**New specs created:**
- `docs/planning/IMPORT_JOB_FRAMEWORK_SPEC.md` — Purpose, Architecture, Import Flow, Review Flow, Apply Flow, History, Retry, Cancel, Permissions, Future Gmail automation, Future API automation; **Import Review UI** = **Task Card → Review Page → Apply** (popup = quick summary only, never the main workflow); row rules (existing = update w/ locked-field **Warning + default Keep Original + Override**; new = create; blank = ignore); 9-state status lifecycle (Draft → Uploading → Validating → Waiting Review → Approved → Applying → Completed; + Cancelled / Failed).
- `docs/planning/IMPORT_JOB_DATABASE_SPEC.md` — two generic tables **`import_jobs`** (header: module/job_type/status/source/counts/actors) + **`import_job_details`** (per-row: action/warning_type/changed_fields_json/old_value_json/new_value_json/user_action/apply_result), 1→N; value sets for status/action/warning_type/user_action/apply_result; module-mapping guidance with Carrier as §10.1 first adopter; relationship to existing `import_sync_runs` (complementary — that stays the unattended Amazon-sync audit log).

**Updated:**
- `CARRIER_AND_ROUTE_SPEC.md` → v1.8: new **§4C.8** — Carrier Rate is the **first adopter**; canonical workflow is the Import Job Framework (Task Card → Review Page → Apply → History), not a Carrier-specific popup; locked-field change becomes a reviewable Warning (Keep Original default / Override) rather than silently ignored; summary counts map to Import Job header counts. Related/Status/changelog updated.
- `DATABASE_RELATIONSHIP_MAP.md` → new **Import Job Framework Layer** in §2 + new **§10A** (tables, 1→N, logical `table_name`+`record_key` link, status lifecycle, first adopter, future adopters, vs `import_sync_runs`).
- `KITCHEN_MAMA_OPERATION_SYSTEM_BLUEPRINT.md` (the actual roadmap; **no `SYSTEM_ROADMAP.md` exists**) → new **§3.12A Import Job Framework**, sequenced **before §3.13 Export Center**.

**Future modules that will reuse the framework:** Carrier Rate (first), Warehouse Rate, Container Rate, Forecast, Amazon Inventory, Amazon Sales, Promotion, Factory, Warehouse, Template Import, Future AI Import.

**Out of scope / NOT implemented:** all runtime code, DB migration, Gmail/Inbox reading/parsing, attachment extraction, API ingestion, Export Center, auto-apply. **SPEC ONLY.** Future Gmail + API automation documented as creating/validating jobs up to Waiting Review — human review still required.

## 2026-07-07 — Carrier Master Template import: auto-generated rate_card_id + carrier_name resolution

**Server (`17_carrier_handlers.gs` `handleImportCarrierRateCards_`):**
- **`rate_card_id` blank ⇒ CREATE** with an auto-generated **`CRC-<10-char UUID>`** (already stamped with `source_file_name` / `import_batch_id` / `created_at` / `updated_at`); present ⇒ UPDATE; unknown id ⇒ rejected. (Create/generate path already existed; formalized + documented.)
- **NEW carrier resolution** for create rows (`crcResolveNewRowCarrier_`): builds `carrier_id`, `carrier_id → carrier_name`, and `normalized(carrier_name) → [carrier_id]` maps from `carriers`. Blank `carrier_id` → resolve by `carrier_name` (unique = use; **none → reject** *"carrier_name not found. Please create carrier first."*; **multiple → reject** *"carrier_name is ambiguous. Please provide carrier_id."*). Explicit `carrier_id` is **authoritative**; a mismatched `carrier_name` emits a **warning** (*"carrier_name does not match carrier_id; carrier_id was used."*), not a silent overwrite. Update-Template create rows still fall back to the carrier scope when both are blank.
- **No carrier auto-create** — rate-card import never inserts a `carriers` row; unknown carriers are rejected (avoids polluting the carrier master with typos/inconsistent names).
- Update Template rules unchanged (existing = update by `rate_card_id`; blank = create under carrier scope; allowed/locked field rules intact).

**Client:** no change — `carrier_name` already round-trips as a template column, so the server resolves it; existing warnings/errors alert surfaces the new messages.

**Specs:** `CARRIER_AND_ROUTE_SPEC.md` → v1.9 (new **§4C.3B** Master Template ID & carrier resolution; §4C.3A New-row carrier line + §4C.4 validation updated; header/changelog). `DATABASE_RELATIONSHIP_MAP.md` §9 carrier import note updated (auto-ID + carrier_name resolution + no auto-create).

**Deploy note:** `17_carrier_handlers.gs` is a source mirror — copy to the live project + **redeploy**. No DB migration; no client change. **Out of scope / untouched:** Import Job Framework runtime, Gmail automation, Export Center, Carrier Price Engine, Cost Engine.

## 2026-07-07 — Global Logistics Enums + Shipment Logistics Aggregation + Carrier Rate Resolution (SPEC ONLY)

Platform-wide logistics finalization. **No runtime code, no DB migration** — spec sync only.

**Part 1 — Global Logistics Enums finalized** (`CARRIER_AND_ROUTE_SPEC.md` §4.5, canonical UI↔DB maps; DB/API store English, UI/reports/templates may localize, **importer maps localized labels → English enum**):
- `battery_type`: `no_battery` (不帶電) / `alkaline_battery` (鹼性電池) / `lithium_battery` (鋰電池) / `rechargeable_lithium` (可充電鋰電池) — logistics levels 0–3.
- `magnet_type`: `no_magnet` (不帶磁) / `magnetic` (帶磁).
- `customs_type`: `third_party_customs` (買單報關) / `tax_refund_customs` (退稅報關) / `formal_customs` (正式報關).
- `last_mile_delivery`: `parcel` / `truck`.
- `transit_type`: `air` / `sea` / `sea_express` / `rail` / `truck` — **now the canonical main transportation mode**; old leg-coverage values retired; **`shipping_method` demoted to a legacy display alias** (matching uses `transit_type`).

**Part 2 — Shipment Logistics Attribute Aggregation** (`SHIPMENT_CENTER_SPEC.md` §21; planned header fields `battery_flag`/`battery_type`/`magnet_flag` + `transit_type`/`last_mile_delivery`/`customs_type`): auto-calculated from `shipment_lines` (via each SKU's `sku_details`), **never user-overridable**. Battery flag TRUE if any line ≠ `no_battery`; shipment `battery_type` = highest level present (`rechargeable_lithium` > `lithium_battery` > `alkaline_battery` > `no_battery`); magnet flag TRUE if any line `magnetic`. **Carrier matching uses the shipment-level aggregate, not per-SKU.**

**Part 3 — Carrier Rate Resolution Rules** (`CARRIER_AND_ROUTE_SPEC.md` §4.6): valid when `effective_from ≤ shipment_date ≤ effective_to`; **blank `effective_to` = Open End**; multiple Open End → **latest `effective_from`** is the active quotation; **data-hygiene rule** = one Open End per route (a 2nd is not blocked but the Import Job shows a notice); explicit-`effective_to` overlap → **Import Job Warning / Require Review (no silent guess)**.

**Part 4 — Carrier matching priority extended** (`CARRIER_AND_ROUTE_SPEC.md` §4): destination stop-ladder (`destination_warehouse_code` → `destination_city` → `destination_postal_code` → `destination_country`) → `battery_type` → `customs_type` → `transit_type` → `last_mile_delivery` → `weight_tier`.

**Part 5 — Import Job overlap review** (`IMPORT_JOB_FRAMEWORK_SPEC.md` v1.1 + `CARRIER_AND_ROUTE_SPEC.md` §4C.5): effective-period overlap raises `warning_type = overlap`; Review Page shows **Existing Version → Imported Version → Recommended Action** with **Keep Existing (default) / Override / Cancel Import**; localized-value mapping documented (importer maps zh-TW labels → English enums; unmappable = row error).

**Files updated:** `CARRIER_AND_ROUTE_SPEC.md` → v2.0; `SHIPMENT_CENTER_SPEC.md` → v2.4 (§21 + planned header fields); `IMPORT_JOB_FRAMEWORK_SPEC.md` → v1.1; `DATABASE_RELATIONSHIP_MAP.md` (§8 shipment aggregation note + §9 carrier v2.0 enums/matching/resolution).

**Follow-up (not done here):** `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` should later reference §4.5 for `sku_details.battery_type`/`magnet_type` enum values (not in this task's file scope). All items are **SPEC ONLY** — runtime enum migration, shipment aggregation, and the Carrier Price Engine remain future implementation.

## 2026-07-07 — Template UI Standard finalized (SPEC ONLY)

Platform-wide standard for **every exported spreadsheet template**. **No runtime code, no library choice, no DB migration** — spec + cross-references only.

**New spec:** `docs/planning/TEMPLATE_UI_STANDARD_SPEC.md` — governs Carrier Rate / Warehouse Rate / Container Rate / PO / Shipment / Export documents / Forecast Import / Inventory Import / future Factory & Warehouse templates. Rules: **XLSX preferred** (CSV = unformatted fallback; imports identically); **freeze header** (rows 1–2 when an instruction row exists); **header style** (bold + strong fill + auto-filter + canonical snake_case DB names); **cell colors** (editable = white, locked/reference = gray, required = yellow/marker — UX guidance only, importer is authority); **sheet protection** (unlock only editable cells; NOT security); **data-validation dropdowns** for enum fields (status/battery/magnet/customs/transit/last-mile/shipping_method/charge_type/charge_unit/currency), sourced from the module's canonical enums; **comments/helper notes** (date formats, blank-`effective_to`=open-end, blank-`rate_card_id`=create, blank-`carrier_id`=resolve by name); **auto-width**; **example row** marked `row_type = example` (importer skips); **hidden `_SYSTEM` sheet** (`template_id`, `template_name`, `template_version`, `module`, `generated_at`, `generated_by`, `export_mode`, `source_system`, carrier scope, notes); **template versioning** (warn on unknown/outdated/incompatible — block only on structural incompatibility); **Carrier Master/Update template rules** aligned to `CARRIER_AND_ROUTE_SPEC.md` §4C (editable/locked field sets, no lead-time); **Import Job relationship** (template = input surface, Import Job = official validation/review/apply); **localization mapping** (localized label → English enum; unmappable = row error).

**Updated:** `CARRIER_AND_ROUTE_SPEC.md` → v2.1 (§4C.3 points to the standard; Related + changelog); `IMPORT_JOB_FRAMEWORK_SPEC.md` → v1.2 (template input surface + `_SYSTEM` read + version warnings; Related + changelog); `DATABASE_RELATIONSHIP_MAP.md` §10A (Import Job Framework Layer references the standard).

**Out of scope / NOT implemented:** any code, XLSX generation library, sheet-protection runtime, Export Center, Gmail automation. **SPEC ONLY** — formatting standard for future templates; the Import Job Framework remains the validation authority.

## 2026-07-07 — Template Runtime + Carrier XLSX templates IMPLEMENTED (Phase 1+2)

Runtime implementation of `TEMPLATE_UI_STANDARD_SPEC` (Phase 1) + Carrier XLSX templates (Phase 2). **Decisions (confirmed):** client CDN library; keep the existing carrier importer as-is (Import Job runtime = later, parallel); deliver **Phase 1+2 only** (Import/Review runtime = Phases 3–4, deferred).

- **`index.html`:** added **ExcelJS** via CDN (`cdn.jsdelivr.net/npm/exceljs`, alongside the existing chart.js) + `assets/js/utils/template-export.js` include.
- **NEW `assets/js/utils/template-export.js`** — generic, module-agnostic XLSX runtime `KM.templateExport.buildAndDownload(spec)`: XLSX (§1), freeze pane (rows 1–2 with instruction row) (§2), bold header + strong fill + auto-filter (§3), editable=white / locked=gray / required=yellow fills (§4), sheet protection unlocking only editable cells (§5), enum dropdown validation (§6), header comments (§7), auto width (§8), example row `row_type=example` (§9), hidden `_SYSTEM` sheet with `template_id`/`template_name`/`template_version`/`module`/`generated_at`/`generated_by`/`export_mode`/`source_system`/carrier scope/notes (§10), `template_id`+`template_version` (§11). Reusable by all future template modules; +50 blank styled/validated input rows for new-row entry.
- **`assets/js/pages/carrier-rate-card.js`:** added `exportUpdateTemplateXlsx` / `exportMasterTemplateXlsx` (+ carrier field-spec builder, Global Logistics Enum dropdowns §4.5, editable/locked/required kinds per §4C.3A/§4C.3B, example row, `_SYSTEM` with carrier scope). Reuses `KM.DB.CARRIER_RATE_TEMPLATE_COLS` for column order. **Existing CSV export functions left untouched.**
- **`assets/html/pages/carrier-rate-card.html`:** added **Export Update (XLSX)** + **Export Master (XLSX)** buttons; relabeled the existing CSV buttons `(CSV)`. Both formats coexist (XLSX canonical, CSV fallback).

**⚠️ Library note (confirm):** implemented with **ExcelJS**, not SheetJS. The chosen mechanism was "client CDN library (SheetJS example)", but **SheetJS community build cannot write cell styles / data-validation dropdowns / sheet protection** required by §3–§6; ExcelJS (free, same CDN pattern) can. Architecture decision (client CDN library) unchanged — only the specific library differs. Flagged for confirmation.

**NOT done (deferred / out of scope this task):** Phase 3 Import Runtime (parser / validation / `import_jobs` + `import_job_details` / enum+localization mapping / `_SYSTEM` reader / version check / warning+error generation) and Phase 4 Review Runtime (Task Card / Review Page / History / Keep-Original / Override / Cancel / Approved→Applying→Completed). The existing carrier CSV importer is unchanged (still writes `carrier_rate_cards` directly — the Import Job re-route is a later task). No Export Center / email / API / price / matching / cost / AI / permissions.

**Deploy note:** frontend-only; requires the ExcelJS CDN to be reachable at runtime (same as chart.js). No Apps Script / DB change. **Browser-verify** the XLSX (freeze/color/dropdown/protection/hidden sheet render in Excel) — `node --check` only validated JS syntax, not the in-browser ExcelJS output.

### 2026-07-07 (follow-up) — Carrier page UI consolidated + Update Rate Card modal

ExcelJS **confirmed/kept**. Reduced the Carrier page to **two** user-facing buttons and added a unified modal (no Import Job runtime; existing CSV/direct-import backend untouched).
- **`carrier-rate-card.html`:** header now shows **Update Rate Card** (primary → opens modal) + **Export Master Template** (XLSX). The XLSX-Update / CSV / standalone-Import buttons are kept in the DOM but **hidden (`display:none`, dev-only)**. Added the **Update Rate Card modal** (reuses global `pc-modal` styles): Carrier selector · Download Update Template · Upload file · Close · Import.
- **`carrier-rate-card.js`:** `exportUpdateTemplateXlsx(carrierIdArg)` now accepts an explicit carrier (modal passes its own selector; falls back to page filter). Refactored import into shared `crcImportFile(file, carrierScopeId)` + `crcRunImport(parsed, fileName, carrierScopeId)`; added **client-side XLSX reader** `crcReadXlsxFile` (+ `crcCellText`) via ExcelJS so an uploaded XLSX (or CSV) is parsed and fed to the **existing** `importCarrierRateTemplate` backend. New modal fns `openUpdateModal` / `closeUpdateModal` / `updModalPopulateCarriers` / `modalDownloadUpdate` / `modalImport` (exposed as `crcOpenUpdateModal` / `crcCloseUpdateModal` / `crcModalDownloadUpdate` / `crcModalImport`).
- **Unchanged backend:** `importCarrierRateTemplate` / `handleImportCarrierRateCards_` (direct import) and the CSV export functions are all intact. **Import Job runtime NOT implemented** (still Phase 3/4).
- Note: the modal Import uses the existing direct importer (not Import Job). XLSX upload is parsed client-side (ExcelJS) into the same row/columns the CSV importer expects — this only enables the round-trip; it is not the Import Job runtime.

### 2026-07-07 (follow-up 2) — Update Template curated columns + editability alignment

Refinement of the Carrier **Update** template (Master unchanged; Import Job runtime still deferred).
- **`template-export.js`:** generic runtime now supports per-column **`hidden: true`** — the column's header + data are still written (preserved in the file) but the Excel column is hidden. Reusable by any future template.
- **`carrier-rate-card.js` (Part C):** the Update template now renders a **curated, reordered visible column set** — reference/context (gray, locked): carrier_name, origin_country, destination_country, destination_warehouse_code, destination_city, destination_postal_code_start/end, shipping_method, last_mile_delivery, battery_type, weight_tier, weight_tier_unit, currency, charge_unit; editable (white): unit_rate, min_charge, fuel_surcharge, customs_fee, doc_fee, effective_from, effective_to, status, note. **Hidden-but-preserved** (Excel-hidden; kept for import traceability incl. `rate_card_id`): row_type, rate_card_id, carrier_id, origin_city, marketplace, charge_type, dim_divisor, min_box_weight, min_box_weight_unit, transit_type, customs_type. Canonical DB headers preserved (headers unchanged; only visibility/order curated). Master template keeps the full canonical column set.
- **Part D / editability:** Update editable set now **includes `min_charge`** (per Part C/D). Client `CRC_UPDATE_EDITABLE` + curated white set and the server importer `CRC_UPDATE_EDITABLE_` (`17_carrier_handlers.gs`) both updated; `min_charge` removed from `CRC_LOCKED_COLS_`. This **extends CARRIER_AND_ROUTE_SPEC §4C.3A** (which listed min_charge as locked) — spec follow-up flagged below.
- **Import unchanged (Part E):** still the direct path (`importCarrierRateTemplate` → `handleImportCarrierRateCards_`); existing rows update by `rate_card_id` (hidden column preserved), locked/hidden fields not silently overwritten, carrier resolved from scope/carrier_name. Hidden columns are read by the importer normally.
- **Spec follow-up:** `CARRIER_AND_ROUTE_SPEC §4C.3A` should be updated to move `min_charge` from locked → editable (or revert this change) so spec + runtime agree. Not edited in this implementation-only task.
- **Deploy:** `17_carrier_handlers.gs` is a source mirror — copy + redeploy for the min_charge editable change to take effect server-side; frontend is static. **Browser-verify** the Update XLSX (curated visible columns, hidden columns preserved, min_charge white/editable).

## 2026-07-07 — request_order_line_sources approved_qty parallel-sync (no ratio)

Fixed Request Order Draft Save to update `request_order_line_sources.approved_qty` **in parallel** with `request_order_lines`, by the **same company/SKU/tier decision quantity** — **no proportional/ratio distribution** (there was none before; source sync simply wasn't wired).
- **`13_procurement_handlers.gs` `handleUpdateRequestOrderLineQty_`:** after writing a line's `approved_qty` / `carton_qty` / `km_qty`/`resus_qty`/`restw_qty`, calls new `syncLineSourceApproved_(lineId, sku, company, bucket, month, approved)`. Matching key = `request_order_line_id` + `sku` + `company` + `tier_type`/`source_bucket` + `source_month` (prefers exact month; falls back to line-id link). Sets each matched source row's `approved_qty` to the line's approved qty (same value; **no split**), plus `updated_at`. **Snapshot fields preserved** (forecast_qty / current_stock / on_the_way_qty / shortage_qty / reallocation_qty / recommended_qty / requested_qty / source_month / source_bucket / source_priority / site_sku / marketplace_product_id — never written). Source sheet read **once**; **missing-tab / missing-header / no-match safe** → adds a warning, never crashes, still saves the line. Response now returns `sources_updated` + `warnings`.
- **`request-order-draft.js` `saveDraft`:** surfaces returned `warnings` in the Save alert (non-blocking). Existing pre-Save validation (approved = KM+ResUS+ResTW + full-carton, blocks Save) unchanged.
- **No ratio, no deprecated fields recreated, no unrelated modules touched.** Import Job runtime not involved. **Deploy:** `13_procurement_handlers.gs` is a source mirror — copy + redeploy.

## 2026-07-07 — Cancelled-line immutability + Manual Allocation Mode + Carrier Master Template modal

**A1 — Cancelled lines are now IMMUTABLE (bug fix).** Cancelling a tier (e.g. T1) then Submitting T2/T3 no longer resurrects the cancelled T1 line.
- **`13_procurement_handlers.gs` `procurementUpdateRequestLines_`:** skips any line whose `line_status = cancelled` — submit/approve/reject transitions never re-status or re-stamp a cancelled line.
- **`handleUpdateRequestOrderLineQty_`:** Save loop also skips cancelled lines (`line_status = cancelled` → skipped, reported). Cancelled lines are already excluded from header totals (`procurementRecalcRequestTotals_`) and from the source parallel-sync.

**A2 — Manual Allocation Mode (line-per-company, Option B).** When Approved Qty ≠ the KM+ResUS+ResTW total, the Draft enters manual allocation.
- **`request-order-draft.js`:** Draft cards always expose KM / ResUS / ResTW columns (`tableCompanies` = the 3 canonical + any present, e.g. Unassigned). Companies with no line render as editable **phantom 0-cells** (`data-new-line="1"`, carrying sku / bucket / upc); editable when the row is unlocked (Approved ≠ Requested), readonly 0 otherwise. `collectDraftLineEdits` emits a `new_line` payload for each phantom cell with qty > 0 (keyed by row+company). Live validation (`Approved = company total` + full-carton) already sums phantom cells; Save/Submit stay blocked until valid. Header **Company** summary still reflects only companies actually present.
- **`13_procurement_handlers.gs` `handleUpdateRequestOrderLineQty_`:** new `createManualAllocLine_(rq)` handles `new_line` entries — creates a NEW `request_order_line` for the company (Draft parent only; `requested_qty = 0`, `approved_qty` = entered qty, `km/resus/restw` derived, `line_status = draft`) and appends a minimal `request_order_line_sources` row (`source_type = manual_reallocation`, snapshots blank). Response returns `created_lines`.

**B — Carrier Master Template unified modal.** The **Master Template** header button now opens a modal (mirrors the Update Rate Card modal) instead of downloading directly.
- **`carrier-rate-card.html`:** button `onclick` → `crcOpenMasterModal()`; new `#crc-master-modal` (instructions + Download Master Template + Upload + Close + Import).
- **`carrier-rate-card.js`:** `openMasterModal` / `closeMasterModal` / `modalDownloadMaster` (reuses existing `exportMasterTemplateXlsx` — formatted XLSX per Template UI Standard, `export_mode = master`) / `modalImportMaster` (existing direct importer, no carrier scope, **forces `master` mode**). `crcImportFile` / `crcRunImport` gained an optional `forceMode` param. **Import Job runtime NOT wired**; existing CSV/direct importer unchanged.

**Deploy:** `13_procurement_handlers.gs` is a source mirror — copy + redeploy. Frontend is static.

## 2026-06-24 — Purchase Order v2 finalized (DOCUMENTATION FIRST — spec only, no runtime)

Aligned all planning/spec docs to the finalized **Purchase Order v2** architecture ahead of implementation (Discuss → Spec → DB Mapping → Runtime; this task = Spec + DB Mapping only). **No runtime / UI / handler / adapter changes.**

- **Purchase Order v2 finalized.** New authoritative page spec **`docs/planning/PURCHASE_ORDER_SPEC.md`** (created): Overview adopts the Request-Order-Draft **Card architecture** — factory Top Tabs **CN侑鑫 / TW勝一**, top-right selector **Series / PO No**, **Draft / Completed** groups, one expandable Card per PO. Card Header = **PO No (primary) · Parent PO No · Order Date · Series · Supplier Expected Ready**; actions **Expand / Save / Send PO / Cancel** (Completed cards swap **Send PO → Update**). Four blocks: **1 SKU Summary** (SKU · Ordered · Shipped · Remaining · Carton; footer Total SKU / Qty / Carton) · **2 Production Timeline** (Inspection · Supplier Expected Ready · Expected Ship · Outer Carton Lot [future] · Nameplate Version [future]) · **3 Factory Notes** (future attachment) · **4 Factory Payment** (Supplier · Deposit · Balance · Total · Payment Status). **Update appends timeline history, never silent overwrite.** **Pagination = 25 Cards/page** (same as Request Order Draft).
- **Supplier timeline naming standardized.** `purchase_orders.expected_ready_date` / `confirmed_ready_date` → **`supplier_expected_ready_date`** / **`supplier_confirmed_ready_date`** (official; no mixed naming). Kept distinct from the Request Order line schedule `request_order_lines.expected_ready_date` (unchanged — PO copies it into `supplier_expected_ready_date` at conversion). Updated in `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.3 and `DATABASE_RELATIONSHIP_MAP.md` §7.3.
- **Distinct SKU counting standardized (global).** **`Total SKU = COUNT(DISTINCT sku)`, never `COUNT(rows)`** — applies to Request Order, Purchase Order (Overview + List), Weekly Shipping Plan, Shipment Overview, and every `total_sku` DB field. Documented in `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.4, `DATABASE_RELATIONSHIP_MAP.md` §7.5A, `SHIPMENT_CENTER_SPEC.md` §Shipment-Draft totals.
- **Allocation Persistence finalized (official architecture rule).** New **§13** in `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` + **§7.5B** in `DATABASE_RELATIONSHIP_MAP.md`: company-based identity (`request_order_id + company + sku + tier`); **one Company = one `request_order_line` = one `request_order_line_source`**; **Manual Allocation Mode auto-creates a missing company row (no ratio; each company owns its `approved_qty`)**; **sync `request_order_line_sources.approved_qty == request_order_lines.approved_qty` on Save / Submit / Convert to PO**; **cancelled lines immutable (Submit ignores them)**. Foundation for Shipment Allocation / Purchase Orders / Factory Allocation (referenced from `SHIPMENT_CENTER_SPEC.md` §6). This supersedes the old §12.14 "re-allocating to a company with no line is not supported" note.
- **Purchase Order Card UI finalized** (grouped-column **PO List** refresh documented in `PURCHASE_ORDER_SPEC.md` §7 + `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.3; document only).

**Files changed:** `docs/planning/PURCHASE_ORDER_SPEC.md` (new) · `docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` · `docs/planning/DATABASE_RELATIONSHIP_MAP.md` · `docs/planning/SHIPMENT_CENTER_SPEC.md` · this file. **No runtime implemented.**

## 2026-06-24 — Procurement lifecycle + snapshot architecture finalized (SPEC ONLY, no runtime)

Locked the final lifecycle and snapshot rules ahead of Purchase Order v2 runtime. **No JS / GS / HTML / CSS changed; no DB migration.**

- **Request Order lifecycle finalized.** `Draft → Saved → Submitted → Approved → Converted to PO → Completed`; **Cancelled = terminal**. Cancelled `request_order_lines` are immutable (Submit ignores them, Convert to PO excludes them, never deleted; restore = future explicit + audited action). Added as `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` **§5.0**.
- **Purchase Order lifecycle finalized.** `Draft → Issued/Sent → Supplier Confirmed → In Production → Partial Completed → Completed → Partial Shipped → Shipped → Closure`; **Cancelled = terminal** (partial/completed driven by `completed_qty`; partial/shipped by `shipped_qty`; Closure auto or manual). Added as `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` **§6.0**; referenced from `PURCHASE_ORDER_SPEC.md` §9.
- **PO Snapshot Rule finalized.** PO = execution/commitment snapshot; at Convert to PO, approved Request data is **copied** into `purchase_orders`/`purchase_order_lines` (`approved_qty → ordered_qty`, company + km/resus/restw snapshot, supplier/factory, `supplier_expected_ready_date`, inspection/ship dates, unit_cost/currency, carton fields, note). PO never live-reads Request; later Request edits never mutate an existing PO; export uses the PO snapshot only; cancelled lines excluded. Added as `PURCHASE_ORDER_SPEC.md` **§8A**.
- **Global Snapshot Architecture Principle added.** `Forecast/Planning → Request Snapshot → PO Snapshot → Shipment Snapshot → History` — each layer copies upstream at commit; no downstream live-join for historical execution truth (master joins = display labels only); historical rows stay stable when upstream planning changes (audit / export / BI / API / AI). Added as `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` **§14**, `PURCHASE_ORDER_SPEC.md` **§8B**, `DATABASE_RELATIONSHIP_MAP.md` **§7.5C** (+ Immutable-Flow pointer). `SHIPMENT_CENTER_SPEC.md` carries a **reference only** (Shipment = Execution Snapshot; inherits PO / Shipping Plan by copy; no live recalculation).
- **Ready for Purchase Order v2 runtime implementation after confirmation.**

**Files changed:** `docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` · `docs/planning/PURCHASE_ORDER_SPEC.md` · `docs/planning/DATABASE_RELATIONSHIP_MAP.md` · `docs/planning/SHIPMENT_CENTER_SPEC.md` · this file. **Documentation only — no runtime, no DB migration.**

## 2026-06-24 — Manual Allocation Mode render fix (request-order-draft.js)

Fixed Manual Allocation Mode so the missing canonical company (e.g. KM) renders as an editable input the moment Approved qty diverges from the company allocation total — the render logic (not just validation) now decides Manual Allocation Mode.
- **`request-order-draft.js`:** added `RO_CANON_COMPANIES = ['KM','ResUS','ResTW']`; draft cards force all three columns (uses the constant). Per row, `manualAllocationMode = isDraft && (rowApproved !== companyTotal)` where `companyTotal = Σ(km+resus+restw cells)` — determined at **row render time**; `locked = !isDraft || !manualAllocationMode` (company inputs editable only in manual mode). Missing company → phantom editable input default **0** (already `data-new-line`).
- **Sticky manual mode:** the Approved input carries `data-manual` (set at render when already diverged, and live in `roOnApprovedInput` the instant `approved !== ΣcompanyInputs`). `roOnApprovedInput` no longer resets company cells to the requested split (that fought manual allocation); it toggles all three canonical inputs editable via `setRowCompaniesEditable_`. `roOnCompanyInput` keeps manual mode sticky. Validation unchanged (coSum must equal Approved → red border + "Approved qty must equal company allocation total." + Save/Submit blocked; clears immediately on match).
- **Persistence unchanged:** a company entered with qty > 0 that had no line still creates a new `request_order_line` (+ `request_order_line_sources`) on Save via the existing `new_line` payload (one company = one line = one source, no ratio). Cancelled lines remain immutable/excluded. `node --check` OK. Frontend static — no redeploy of `.gs` needed.

## 2026-06-24 — Procurement Mapping finalized (DOCUMENTATION / MAPPING ONLY — no runtime, no DB migration)

Locked the final procurement schemas + Convert-to-PO mapping ahead of Purchase Order v2 runtime. **No JS / GS / HTML / CSS changed; no DB migration.**

- **Procurement Mapping finalized.** All four schema/mapping docs updated and cross-referenced.
- **`request_order_lines` FINAL schema** (RO&PO §3.2 / DB map §7.2): identity = `company + sku + request_bucket`; one company = one line; `request_bucket` canonical (**`tier_type` forbidden here**); `purchase_order_line_id` **replaces** `linked_purchase_order_line_id`; added `factory_item_no` / `factory_item_name` / `supplier_warehouse_id` / `recommended_qty` / `reallocation_qty` / `cancelled_by` / `cancelled_at` / `cancel_reason`; `line_status` always populated. **Removed/deprecated (stop writing):** `final_order_qty`, `forecast_qty`, `current_stock`, `on_the_way_qty`, `factory_allocated_qty`, `source_company_count`, `source_site_count`, `tier_type`, `product_name`, `need_reason`, `related_entity_type`, `related_entity_id`, `linked_purchase_order_line_id`.
- **`request_order_line_sources`** (RO&PO §3.8 / DB map §7.6): PK **standardized to `request_order_line_source_id`** (retire `line_source_id`); full source-detail column set retained (snapshot fields allowed here, forbidden on `request_order_lines`); `approved_qty` must equal the matching line for same company+sku+bucket, sync on Save/Submit/Convert, cancelled lines never update sources; `site_sku` from `marketplace_skus` / `sku_regional_details`.
- **`purchase_orders` FINAL schema** (RO&PO §3.3 / DB map §7.3): **`order_status` canonical; `status` deprecated**; `expected_ready_date` / `confirmed_ready_date` deprecated → `supplier_expected_ready_date` / `supplier_confirmed_ready_date`; added `po_no` / `km_po_no` / `order_date` (= Send PO date) / `expected_completion_date` / payment fields / **`request_bucket`** (header `T1` or `T2_T3`). `factory_id` resolved from `warehouse_id` + warehouse master. `total_sku = COUNT(DISTINCT sku)`.
- **`purchase_order_lines` FINAL schema** (RO&PO §3.4 / DB map §7.4): **`product_name` removed**; **`km_qty`/`resus_qty`/`restw_qty`, `request_bucket`, `line_status` mandatory**; `ordered_qty = approved_qty`; `completed_qty`/`shipped_qty` start 0; `remaining_qty = ordered_qty − shipped_qty`; `line_amount = ordered_qty × unit_cost`; dates mapped from request line schedule.
- **Convert to PO Field Mapping Table finalized** (RO&PO §15.2/§15.3/§15.4): header + line field-by-field mapping + derived fields.
- **T1 vs T2+T3 split rule finalized** (RO&PO §15.1): cancelled excluded; T1 → one PO (`request_bucket=T1`); T2+T3 → one combined PO (`request_bucket=T2_T3`); never merge; lines keep original bucket.
- **Cancelled immutable rule reaffirmed** (RO&PO §13.4): terminal; Save/Submit/Approve/Convert/source-sync all exclude cancelled; kept for audit; restore = future explicit audited action.
- **Snapshot Completeness Principle added** (RO&PO §14.1 / DB map §7.5C): every downstream snapshot must be independently executable; PO/Shipment never live-read the Request for execution truth. Ready-date naming defined: `expected_completion_date` ← `request_order_lines.expected_ready_date`; `supplier_expected_ready_date` mirrors it.
- **Shipment spec** carries a **reference-only** update (never reads Request directly, never recalculates, copies from PO / Shipping Plan snapshots; PO `request_bucket` + company snapshot support future shipment allocation).
- **Ready for Purchase Order v2 runtime implementation after user confirmation.**

**Files changed:** `docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` · `docs/planning/PURCHASE_ORDER_SPEC.md` · `docs/planning/DATABASE_RELATIONSHIP_MAP.md` · `docs/planning/SHIPMENT_CENTER_SPEC.md` · this file. **Documentation / mapping only — no runtime, no DB migration.**

## 2026-06-24 — Document Generation / Template Mapping spec created (SPEC ONLY — no runtime, no DB migration)

Created the first document-generation architecture spec for the future **Export Center / Template Center**. **No JS / GS / HTML / CSS changed; no DB migration.**

- **Document Generation / Template Mapping spec created:** new **`docs/planning/DOCUMENT_GENERATION_SYSTEM_SPEC.md`** — three-table architecture (registry → mapping → output log), scalar vs collection placeholders, `document_type` enum, PO + Shipment generation rules. Core rule: **generated documents are derived outputs and never mutate PO / Shipment / Inventory / Master data**.
- **`document_templates` final schema proposed** — template registry (scope: `document_type` / `related_entity_type` / `series` / `sku` / supplier / factory / carrier / country / marketplace / language; file + `output_folder_id` + `file_name_rule`; versioned; `status` draft/active/retired). Product Name / Unit NOT stored here.
- **`generated_documents` final schema proposed** — append-only output log (`file_id`/`file_url`, `pdf_file_id`/`pdf_file_url`, `regenerated_from_document_id`, `status` generated/regenerated/emailed/archived/cancelled/failed, `email_status`). Copies `template_id`/`template_version` at generation.
- **`document_template_fields` proposed as placeholder mapping layer** — token → data (`data_scope` header/line/total/system/static; `field_type` incl. `collection`; `collection_key`; `format_rule` / `transform_rule` / `fallback_rule`). Mapping changeable without runtime changes where possible.
- **PO generation rules:** `related_entity_type = purchase_order`; **PO Snapshot only** (no live Request read); `LINE_ITEMS` → `purchase_order_lines`; `file_name_rule` = `KitchenMama_{{PO_NO}}_{{KM_NO}}_{{SERIES}}_{{TOTAL_QTY}}_{{SHIP_MONTH}}`.
- **Shipment generation rules:** `related_entity_type = shipment`; **Shipment Snapshot only** (no live Request read, no allocation recalculation); one shipment → many documents; PO No is label-only.
- **Docs updated:** `DATABASE_RELATIONSHIP_MAP.md` §10 (added `document_template_fields`; PO/Shipment → `generated_documents` relationships; derived-output rule) · `SHIPMENT_CENTER_SPEC.md` §16 (MVP schema → reference to the new spec; kept shipment field sections) · `PURCHASE_ORDER_SPEC.md` §8C (PO export reference).
- **Export Center runtime NOT implemented. Template Center runtime NOT implemented. Document generation runtime DEFERRED.**

**Files changed:** `docs/planning/DOCUMENT_GENERATION_SYSTEM_SPEC.md` (new) · `docs/planning/DATABASE_RELATIONSHIP_MAP.md` · `docs/planning/SHIPMENT_CENTER_SPEC.md` · `docs/planning/PURCHASE_ORDER_SPEC.md` · this file. **Documentation only — no runtime, no DB migration.**

## 2026-06-24 — Cancelled-immutable + Manual Allocation verification + `purchase_order_line_id` rename (runtime)

Re-verified the cancelled-immutable (A) and Manual Allocation render (B) fixes are fully in place from the prior tasks, and closed the remaining **Section C** field-naming gap.
- **A — cancelled immutability (already implemented, re-verified):** `procurementUpdateRequestLines_` skips `line_status = cancelled` on submit/approve/reject (transition never reactivates a cancelled tier); `handleUpdateRequestOrderLineQty_` save loop skips cancelled lines; `procurementRecalcRequestTotals_` excludes cancelled from totals; source sync (`syncLineSourceApproved_`) only runs for non-cancelled lines; frontend never renders/collects cancelled lines. **Cancel T1 → Submit T2/T3 → T1 stays cancelled.**
- **B — Manual Allocation render (already implemented, re-verified):** draft cards always render `RO_CANON_COMPANIES` = KM/ResUS/ResTW columns; per-row `manualAllocationMode = (rowApproved !== companyTotal)` at render + sticky live via `data-manual`; missing company = editable phantom `0` input (`data-new-line`); on Save qty>0 creates a new `request_order_line` (+ `request_order_line_sources`, no ratio, snapshots preserved); validation "Approved qty must equal company allocation total." + full-carton (`approved % upc`) block Save/Submit.
- **C — field guard (new change this task):** `13_procurement_handlers.gs` — `REQUEST_ORDER_LINES_HEADERS_` and `handleCreateRequestOrderDraft_` now use **`purchase_order_line_id`** (canonical) instead of the deprecated **`linked_purchase_order_line_id`** (no longer written/ensured; legacy column kept only if physically present). `operation-system-db-api.js` `normalizeRequestOrderLineRecord` now exposes **`purchaseOrderLineId`** reading `purchase_order_line_id` with legacy `linked_purchase_order_line_id` fallback. No other removed legacy fields are written by the request-line create path. `node --check` OK on all three files.
- **Not touched:** PO conversion / Shipment / Carrier / Document Engine / Export Center. **Deploy:** `13_procurement_handlers.gs` is a source mirror — copy + redeploy; frontend + adapter are static.

## 2026-06-24 — PO v2 Runtime Step 2: Convert-to-PO split rule + final PO header/line mapping (runtime)

Implemented the finalized Convert-to-PO in `13_procurement_handlers.gs` (+ adapter normalizers + Draft convert message). **PO Overview / PO List UI NOT redesigned.**
- **Header schemas migrated to FINAL (PO v2):** `PURCHASE_ORDERS_HEADERS_` now uses **`order_status`** (canonical) + `po_no`/`km_po_no`/`order_date`/`inspection_date`/`expected_completion_date`/`expected_ship_date`/payment fields/`supplier_expected_ready_date`/`supplier_confirmed_ready_date`/`request_bucket`; **deprecated `status` / `expected_ready_date` / `confirmed_ready_date` removed** (no longer written/ensured). `PURCHASE_ORDER_LINES_HEADERS_` adds `request_order_id`/`request_bucket`/`company`/`factory_item_no`/`factory_item_name`/`supplier_name`/`supplier_warehouse_id`/`km_qty`/`resus_qty`/`restw_qty`/`recommended_qty`/`requested_qty`/`approved_qty`/`line_status`/`expected_completion_date`; **`product_name` removed**.
- **`handleCreatePurchaseOrderFromRequest_` rewritten (split rule):** excludes cancelled request lines; groups active lines by bucket → **T1** and **T2_T3**; creates **one PO per non-empty group** (two if both present, never merged, no empty headers); PO lines keep original `T1`/`T2`/`T3` in `request_bucket`; writes final line mapping (`ordered_qty = approved_qty`, `completed_qty`/`shipped_qty` = 0, `remaining_qty = ordered_qty`, `line_amount = ordered × unit_cost`, `expected_completion_date ← request expected_ready_date`); header `total_sku = COUNT(DISTINCT sku)`, `subtotal_amount = total_amount`, `supplier_expected_ready_date` mirrors `expected_completion_date`, `order_status = draft`, `order_date` blank; `factory_id` resolved from `warehouse_id` via `warehouses` (new `procurementResolveFactoryId_`, fallbacks, no crash); back-references each converted active line's `request_order_lines.purchase_order_line_id`; returns **`purchase_orders` array** + `po_count` (+ back-compat single-PO fields). Cancelled lines get no PO line / no `purchase_order_line_id`.
- **Coherent `order_status` migration (procurement handlers):** `handleUpdatePurchaseOrderStatus_` now reads/writes canonical `order_status` (fallback legacy `status`), ensures the column, and remaps optional supplier dates to `supplier_expected_ready_date`/`supplier_confirmed_ready_date` (no deprecated writes). `handleUpdatePurchaseOrderLine_` draft-gate reads `order_status` (fallback `status`). `procurementRecalcPoTotals_` now uses `COUNT(DISTINCT sku)` and mirrors `subtotal_amount`. Manual sample-data helper updated to the final schema.
- **Adapter normalizers (`operation-system-db-api.js`):** PO header exposes `orderStatus` (+ `status` back-compat alias), `poNo`/`kmPoNo`, `requestBucket`, `expectedCompletionDate`, `supplierExpectedReadyDate`/`supplierConfirmedReadyDate` (+ `expectedReadyDate` alias), payment fields. PO line exposes `requestOrderId`/`requestBucket`/`company`/`kmQty`/`resusQty`/`restwQty`/`recommendedQty`/`requestedQty`/`approvedQty`/`lineStatus`/`expectedCompletionDate` (+ `productName` kept as blank alias, not depended on). Request-line `purchaseOrderLineId` already reads `purchase_order_line_id` (legacy fallback).
- **Frontend:** `request-order-draft.js` `convertToPo` shows a count + per-bucket PO numbers (array-aware; single-PO fallback). PO Overview / List UI unchanged (back-compat aliases keep them working; `product_name` shows `--` for v2 lines).
- `node --check` OK on all three. **Deploy:** copy + redeploy `13_procurement_handlers.gs`; frontend/adapter static.

## 2026-06-24 — Manual Allocation new-company line mapping (series + site_sku) + deprecated-field guard (runtime)

Fixed the Manual Allocation new-company line so it no longer has a blank `series` / blank source `site_sku`, and confirmed removed `request_order_lines` fields are never written/ensured. Only `13_procurement_handlers.gs` changed.
- **A — sibling copy:** `createManualAllocLine_` now finds a sibling `request_order_line` (same `request_order_id` + `sku` + `request_bucket`, non-cancelled, via new `findSiblingLine_`) and copies stable non-company fields onto the new line — **`series`**, `supplier_id`/`supplier_name`/`supplier_sku`, `factory_item_no`/`factory_item_name`/`supplier_warehouse_id`, `request_month`, `units_per_carton`, `unit_cost`, `currency`, `calculation_method`, `inspection_date`/`expected_ready_date`/`expected_ship_date`, `note` (payload schedule preferred, else sibling). Company-specific: `company` = target, `km/resus/restw` (target = approved, others 0), `approved_qty` = target qty, `requested_qty` = 0, `recommended_qty` blank, `line_status` = draft. (Fields whose column is absent from the header are silently skipped by `procurementAppendByHeader_`.)
- **B — source `site_sku`:** new `request_order_line_sources` row now resolves company-specific site fields by priority — (1) sibling source row same `sku`+`bucket`+`company` (new `srcSiblingByKey` index), (2) `marketplace_skus` by sku+company, (3) `sku_regional_details` by sku+company (new `procurementSiteFieldsByCompany_` helper; lazy-built), else blank. Populates `site_sku`, `marketplace_product_id`, `country`, `marketplace`, `ownership_company`, `warehouse_id`. Existing source snapshot fields are never overwritten (append-only new row).
- **C — deprecated guard (verified, no code needed):** `REQUEST_ORDER_LINES_HEADERS_` already excludes `final_order_qty`/`forecast_qty`/`current_stock`/`on_the_way_qty`/`factory_allocated_qty`/`source_company_count`/`source_site_count`/`tier_type`/`product_name`/`need_reason`/`related_entity_type`/`related_entity_id`/`linked_purchase_order_line_id`; no writer assigns them to `request_order_lines`; `handleCreateRequestOrderDraft_` writes `forecast_qty`/`current_stock`/`on_the_way_qty` **only to `request_order_line_sources`** (source table — allowed); no `sheetEnsureColumns_` call recreates a deprecated line column.
- `node --check` OK. **Deploy:** copy + redeploy `13_procurement_handlers.gs`. Frontend/adapter unchanged.

## 2026-06-24 — Runtime 3: PO date-only formatting + blank supplier ready fields at Convert (runtime)

Fixed Convert-to-PO date formatting and supplier-ready-field behavior. Only `13_procurement_handlers.gs` changed. (A/B/C — new-company `series` + source `site_sku` + deprecated-field guard — already implemented in the prior task and left intact.)
- **D/E — date-only PO dates:** new module helper `procurementDateOnly_(v)` normalizes any schedule value (Sheets Date cell **or** datetime string) to **`yyyy-MM-dd`** (no time/timezone/seconds). New `cellDate(row,name)` in `handleCreatePurchaseOrderFromRequest_` uses it. `purchase_orders` **and** `purchase_order_lines` `inspection_date` / `expected_completion_date` / `expected_ship_date` are now written date-only, copied from `request_order_lines.inspection_date` / `expected_ready_date` / `expected_ship_date` respectively (`expected_completion_date ← expected_ready_date`).
- **D/E — supplier ready fields blank at Convert:** `purchase_orders.supplier_expected_ready_date` and `supplier_confirmed_ready_date` are now **both blank** at Convert-to-PO (previously supplier_expected_ready_date mirrored expected_completion_date). These are future supplier-confirmation add-ons; `expected_completion_date` is the working date. (The manual PO status-update handler still lets a user set them later — unchanged, out of Convert scope.)
- **Also** normalized the Manual Allocation new-company line's `inspection_date`/`expected_ready_date`/`expected_ship_date` copies to date-only (consistency; prevents datetime leakage from Sheets Date cells).
- **Unchanged (per E):** T1/T2_T3 split rule, `order_status` behavior, `total_sku = COUNT(DISTINCT sku)`.
- `node --check` OK. **Deploy:** copy + redeploy `13_procurement_handlers.gs`.

## 2026-06-24 — Runtime 4: Purchase Order Overview v2 Card UI (runtime)

Rebuilt the Purchase Order Overview page as a card dashboard (same visual language as Request Order Draft). Scope: PO Overview page only.
- **`purchase-order-overview.js` (rewritten):** factory tabs **All / CN侑鑫 / TW勝一** (token match on factory_id/warehouse_id/warehouse_name — strong `YOUXIN`/`SHENGYI`/`侑鑫`/`勝一` win over broad `CN`/`TW`; **All** added as a safety default so nothing is hidden); **Series** + **PO No** selectors; **Draft / Completed** sections (Completed = `completed`/`closure`/`cancelled` — cancelled kept visible with its label, matching prior behavior); **25 cards/page** pagination across the filtered list (tab/selector change resets to page 1). Each PO = one expandable `.sp-card`. **Header:** PO No (primary) · Parent PO No (resolved) · Order Date (`order_date`→`created_at`) · Series (distinct, line→sku_details fallback) · Expected Completion. **Four expand blocks:** ① SKU Summary (SKU/Ordered/Shipped/Remaining/Carton; footer **Total SKU = COUNT(DISTINCT sku)**, Total Qty, Total Carton; Ordered editable only for Draft) · ② Production Timeline (inspection/expected_completion/expected_ship — **date-only**, read-only; Outer Carton Lot / Nameplate Version = future placeholders) · ③ Factory Notes (header note, read-only) · ④ Factory Payment (Factory=warehouse_name / Deposit / Balance / Total=subtotal→total / Payment Status, read-only). `order_status` canonical (fallback legacy `status`).
- **Actions (existing handlers only; no faked success):** **Save** → `updatePurchaseOrderLine` for Draft ordered_qty edits (else clear "nothing editable" notice); **Send PO** → `updatePurchaseOrderStatus` transition `issue` (draft→issued; non-draft shows a clear message); **Cancel** → transition `cancel`; **Update** (Completed) → clear not-yet-wired message (no header/timeline writer). Header date/note/payment editing is display-only this phase.
- **`13_procurement_handlers.gs` (minimal):** on `issue`, also set `order_date = today` (date-only) — Send PO date. `order_status` write path already canonical.
- **`purchase-order-overview.html`:** toolbar (tabs + selectors) + groups + pagination containers.
- **`procurement.css`:** PO Overview styles fully scoped under `#purchase-order-overview-section` (re-declares `.sp-*` locally; `.sp-card` behavior for Shipment/Request pages untouched); 4-block grid horizontal on desktop, stacks ≤1100px, tables scroll inside blocks.
- **Adapter:** no change needed — PO header/line normalizers already expose all Section I fields (from the PO v2 Convert task).
- **Not built (non-goals):** PO List grouped UI, timeline history, document generation, email, export, payment settlement, shipment allocation. `node --check` OK on JS + GS. **Deploy:** redeploy `13_procurement_handlers.gs` (for order_date-on-issue); frontend/CSS static.

## 2026-07-08 — Runtime 5: Purchase Order List v2 grouped UI (runtime)

Refactored the Purchase Order List from a 12-column raw table into a **four-column grouped** operational line list. Scope: PO List page only (frontend + scoped CSS). No adapter/handler/DB change.
- **`purchase-order-list.js`:** `renderRows` rewritten — one row per `purchase_order_line`, four grouped cells: **SKU Info** (SKU / Category[`sku_details`] / Series[line→`sku_details`]) · **PO Info** (PO No `po_no`→`purchase_order_no`→id / Supplier / Factory[`warehouses.warehouse_name` via factory_id→warehouse_id→raw]) · **Qty** (Ordered / **Remaining** [fallback `ordered−shipped`] / Completed) · **Status** (canonical `order_status`→`status` badge / Updated[line→PO `updated_at`, date-only] / Ready Date[`expected_completion_date` PO→line, date-only]). Added `poStatus()` + `dateOnly()` helpers. Status filter now matches canonical `order_status`. Remaining shows a **done** (green, =0) vs **active** (amber, >0) indicator. **Pagination = 25 rows/page** (`polPage`; filters apply before pagination; Search/Reset/date-apply reset to page 1; Prev/Page X of Y/Next). Result meta shows line count + **distinct SKU count (`COUNT(DISTINCT sku)`)**. Cross-page **PO No → Overview** navigation preserved (updated to v2 `.is-expanded`). Existing shared date-range picker + all filters kept intact.
- **`purchase-order-list.html`:** wide 12-col table → 4-col grouped table (`.pol-grouped-table`); added result-meta + pagination containers. Filter bar unchanged.
- **`procurement.css`:** grouped-list styles fully scoped under `#purchase-order-list-section` (stacked cells, bold primary / muted secondary, remaining pill, pagination); no global `.procurement-table` change.
- **Adapter:** no change — PO header/line normalizers already expose `poNo`/`orderStatus`/`expectedCompletionDate`/line `expectedCompletionDate`/`updatedAt`.
- **Not touched:** PO Overview v2, Request Order Draft, Shipment, Carrier, Document Engine, Export Center. `node --check` OK. Frontend/CSS static — no redeploy.

## 2026-07-08 — Runtime 6: PO Overview editable header execution fields (runtime)

Wired PO Overview v2 editable execution fields to a new header-update handler. Scope: PO Overview header only.
- **New handler `handleUpdatePurchaseOrderHeader_` (`13_procurement_handlers.gs`) + router action `updatePurchaseOrderHeader` (`01_router.gs`):** partial update of `purchase_orders` by `purchase_order_id` for `inspection_date` / `expected_completion_date` / `expected_ship_date` (stored **date-only** via `procurementDateOnly_`), `note`, `deposit_amount` / `balance_amount` / `paid_amount` (number-or-blank), `payment_status`. Ensures the columns first (additive), stamps `updated_by`/`updated_at`, returns `updated_fields`. **Writes `purchase_orders` ONLY** — never `request_orders` / `request_order_lines`; **`supplier_expected_ready_date` / `supplier_confirmed_ready_date` are never touched**; errors on unknown PO / no fields.
- **API `window.KM.DB.updatePurchaseOrderHeader(payload)` (`operation-system-db-api.js`):** posts the action, throws on `!success`, reloads DB.
- **`purchase-order-overview.js`:** Block 2 (Production Timeline) dates, Block 3 (Factory Notes) textarea, Block 4 (Factory Payment) Deposit/Balance/Paid inputs + Payment Status select are now **editable** (Factory + Total stay read-only). **Save** and Completed-card **Update** both call `persist()` → `updatePurchaseOrderHeader` (+ Draft ordered_qty via existing line handler); real success/error alerts; reload after save. **No faked success.** Line-qty logic and Convert-to-PO unchanged.
- **`procurement.css`:** scoped styles for the editable inputs under `#purchase-order-overview-section`.
- **Not implemented (per scope):** timeline history table, document generation, Gmail Send PO. `node --check` OK on all JS + GS. **Deploy:** copy + redeploy `13_procurement_handlers.gs` **and** `01_router.gs`; frontend/CSS static.

## 2026-07-08 — Runtime 7: PO List v2 made PO-oriented (runtime)

Rebuilt the Purchase Order List from one-row-per-`purchase_order_line` into a **PO-oriented** remaining/production table (one row per PO, expandable to SKU lines). Scope: PO List page only (frontend + scoped CSS). No adapter/handler/DB change.
- **`purchase-order-list.js`:** `buildModels()` groups `purchase_order_lines` by `purchase_order_id` (joins `sku_details` for category/series, `warehouses` for factory) and aggregates ordered/completed/shipped/remaining + **distinct-SKU** totals per PO. `renderPoRow` renders **one row per PO** — 5 columns: PO/SKU Summary (PO No link + series + `COUNT(DISTINCT sku)` + first-3-SKU preview + `+N more`), Supplier/Factory, Qty Summary, Status/Ready Date, Note. Clicking a row toggles a **nested SKU detail table** (`SKU · Category · Series · Ordered · Completed · Shipped · Remaining · Carton · Line Status · Note`). **Tabs** `In Production` (draft/issued/supplier_confirmed/in_production/**partial_completed**) vs `Ready / Completed` (completed/partial_shipped/shipped/closure + **cancelled** with badge, never mixed into production) with live counts. Filters `applyFilters()` run **before** tabs+pagination; changing filters/tab resets to page 1. Pagination = **25 PO rows/page**. PO No navigation to Overview preserved.
- **`purchase-order-list.html`:** Supplier/Category/Series converted from free-text to **dropdowns** (options generated from current PO data via `populateFilterOptions`); SKU stays free-text; added `#pol-tabs`; table headers → 5 PO-oriented columns.
- **`procurement.css`:** scoped tab, PO-row (caret/preview), and nested detail-table styles under `#purchase-order-list-section` (no global `.procurement-table` change).
- **Not touched:** PO Overview, Request Order Draft, Shipment, Carrier, Document Engine, Export Center. `node --check` OK. Frontend/CSS static — **no redeploy**.

## 2026-07-08 — PO v2 Spec: Workspace + Receive Flow (SPEC ONLY)

Updated the PO v2 planning docs for the **Purchase Order Workspace** + **Receive Flow**. **Documentation only — no runtime/handler/adapter/UI/file-rename changes.**
- **Page-role rename (conceptual, files NOT renamed):** *Purchase Order Overview* → **Purchase Order Workspace** (active management/execution/receive); *Purchase Order List* → **Purchase Order Overview / PO Remaining Overview** (read-oriented remaining/completed + future Shipment-allocation source). Runtime files keep `purchase-order-overview.*` / `purchase-order-list.*`.
- **`PURCHASE_ORDER_SPEC.md`:** new §1.1 page roles; §3 renamed to Workspace with **linked factory tab ↔ Series/PO selectors** (CN tab → CN Series/POs only; switching tab re-derives + resets invalid selection); **three lifecycle groups Draft / In Production / Completed**; per-group buttons (Draft: Expand/Save/Send PO/Cancel · In Production: Expand/Update/Receive · Completed: not in active list); **Parent PO removed from header**, **PO No lighter weight**; **Block 1 aggregated-by-SKU** (SKU·KM·ResUS·ResTW·Ordered·Completed·Carton, **ordered qty read-only after creation**); Block 2 timeline (inspection/expected_completion/expected_ship, **change only via Update w/ reason, no silent overwrite**); new **§4A Receive Flow** (modal SKU·Ordered·Completed(gray)·Remaining·Receive-Qty; partial ≤ remaining; `completed_qty += receive_qty`, `remaining_qty = ordered − completed`; PO-only mutation) + **§4B receive status transition** (all completed → `completed` + leaves active Workspace; partial → `partial_completed` stays In Production); §7 retitled to PO Overview/Remaining Overview (PO-oriented); Non-Goals + pagination wording updated.
- **`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`:** §7.2 rewritten (Workspace, linked selectors, 3 groups, receive summary); §6.0 `partial_completed`/`completed` tied to Receive flow; §7.3 retitled + PO-oriented + legacy line-level table marked superseded.
- **`DATABASE_RELATIONSHIP_MAP.md`:** §7.4 receive rule (`completed_qty`/`remaining_qty`, PO-only, read-only ordered qty); §13 Page-to-Table Map split into Workspace (writes incl. Receive) vs Overview/Remaining (read).
- **Runtime impact:** none this task. Receive-flow runtime (modal + `completed_qty`/`remaining_qty` write + status transition), linked-selector wiring, and file renames are **deferred**.

## 2026-07-08 — PO Remaining Overview: merged SKU-row table + Order Gantt (spec + runtime)

**Phase 1 (spec):** redesigned the PO Remaining Overview (formerly "Purchase Order List") in `PURCHASE_ORDER_SPEC.md` §7 (now §7.1–7.5) and mirrored in `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §7.3 — **SKU rows visible without expanding**, 9 columns (**PO · Supplier/Factory · Category · Series · SKU · Completed · Shipped · Remaining · Note**), row-span merge of repeated PO/Supplier·Factory/Category/Series, same-SKU-within-PO aggregation, **no KM/ResUS/ResTW split**, tabs (In Production incl. partial_completed / Ready·Completed; cancelled hidden unless filtered), data-derived Supplier/Category/Series dropdowns, and a new **collapsible Order Gantt** spec (X=timeline, Y=PO No, bars from inspection→expected_completion→expected_ship, tooltip = PO No/SKU list/qty/expected_completion/status). `DATABASE_RELATIONSHIP_MAP.md` §13 already lists the reads.

**Phase 2 (runtime — `purchase-order-list.{js,html}` + `procurement.css`):**
- **`buildModels()`** now also produces `skuRows` (same SKU within a PO aggregated; `completed`/`shipped`/`remaining` summed; sorted Category→Series→SKU for contiguous merge). **No company split carried.**
- **`renderPoGroup()`** replaces the expandable one-row-per-PO renderer: emits one `<tr>` per aggregated SKU with **row-spanned** PO (link + status badge + ready date), Supplier/Factory, and consecutive-run Category / Series cells; group-start heavier top border. **No expand — SKU rows always visible.** Remaining colored green (0) / amber (>0).
- **Order Gantt** (`renderGantt` + `toggleGantt`): collapsible panel between filters and table; default collapsed; renders the **same filtered+tab PO set**; MVP HTML/CSS bars positioned by `inspection_date`/`expected_completion_date`/`expected_ship_date` with per-date colored ticks, X-axis start/mid/end labels, and a `title` tooltip (PO No · per-SKU C/S/R · expected completion · status). POs without any schedule date are counted and noted (no silent drop). **No external library.**
- **Filters/tabs behavior:** dropdowns derived from data, applied before tabs+pagination, page resets to 1 on change. **Pagination = 25 PO groups/page.** HTML headers → 9 columns; removed old expandable detail markup/handler (`polToggle` → `polToggleGantt`).
- **Not touched:** PO Workspace/Overview card runtime, Request Order Draft, Shipment, Carrier, Document Engine, Export Center. `node --check` OK. Frontend/CSS static — **no redeploy**.

## 2026-07-08 — PO Workspace runtime: three groups + Receive flow (runtime; user authorized minimal backend)

Implemented the finalized Purchase Order **Workspace** runtime (`purchase-order-overview.{js}` + `procurement.css`) per `PURCHASE_ORDER_SPEC.md` §3–§4B. Receive needed a persistence path the existing handlers could not provide (`updatePurchaseOrderLine` skips non-draft POs + no `completed_qty`; `updatePurchaseOrderStatus` has no `partial_completed` and `complete` requires `ready_to_ship`), so — **with explicit user authorization (AskUserQuestion)** — a minimal backend write path was added.
- **Three lifecycle groups** Draft / In Production / Completed (mapping: draft → Draft; issued/supplier_confirmed/confirmed/in_production/partial_completed → In Production; completed/closure/shipped/partial_shipped/ready_to_ship → Completed). **Cancelled + unknown are hidden.**
- **Card header** shows ONLY PO No · Order Date · Series · Supplier Expected Ready Date (Parent PO removed; PO No no longer oversized — same weight/size as other summary values; summary grid 6→4 cols).
- **Actions by group:** Draft = Save / Send PO / Cancel · In Production = Update / Receive · Completed = read-only (Expand only).
- **Block 1 SKU Summary** aggregated by SKU: SKU · KM · ResUS · ResTW · Ordered · Completed · Carton (sums); footer Total SKU=COUNT(DISTINCT sku) / Total Qty / Total Carton. **Ordered is read-only** (no inputs). **Block 2 Production Timeline** + **Block 4 Factory Payment** are now **display-only**; **Block 3 Factory Notes** display/placeholder.
- **Receive modal** (`poReceive` → `poConfirmReceive`): columns SKU · Ordered · Completed (gray, read-only) · Remaining (`ordered−completed`) · Receive Qty (default=Remaining). Validates `0 ≤ Receive Qty ≤ Remaining`; fully-received lines locked. Confirm → `KM.DB.receivePurchaseOrderLines` → `completed_qty += receive_qty`, `remaining_qty = ordered − completed`; PO `order_status` → `completed` (all lines done, +completed_by/at) or `partial_completed`; UI reloads. Completed POs then fall out of the active groups automatically.
- **Edit modal** (Save on Draft / Update on In Production → `poConfirmEdit`): the only editing path (blocks display-only) — timeline dates + deposit/balance/paid + payment_status + note via existing `updatePurchaseOrderHeader`.
- **Backend (authorized):** new `handleReceivePurchaseOrderLines_` (`13_procurement_handlers.gs`) + router action `receivePurchaseOrderLines` (`01_router.gs`) + adapter `KM.DB.receivePurchaseOrderLines` (`operation-system-db-api.js`). Writes **purchase_orders / purchase_order_lines ONLY** — never request orders / shipments / inventory / factory stock / carrier. Columns additive-ensured; **no schema change**. Rejects cancelled PO; clamps receive to remaining; no faked success (all writes surface real errors).
- **Deploy:** copy + redeploy `13_procurement_handlers.gs` **and** `01_router.gs`; frontend/CSS/adapter static. `node --check` OK on overview.js / adapter / 13.gs / 01_router.gs. **Not touched:** Request Order, PO List/Remaining Overview, Shipment, Carrier, Export Center, Document Engine, DB schema.

## 2026-07-08 — Receive routing verify + `remaining_qty` redefinition (runtime + spec)

Fixed the Receive routing report + **redefined `remaining_qty` = available-to-ship** across runtime + specs.
- **A — Routing (verified present in source mirror):** `01_router.gs` routes `receivePurchaseOrderLines → handleReceivePurchaseOrderLines_`; the supported-actions error string now lists `updatePurchaseOrderHeader, receivePurchaseOrderLines`; adapter posts exact action `receivePurchaseOrderLines`; handler exists. The live "Invalid POST action" was a **stale deploy** — **must copy `01_router.gs` + `13_procurement_handlers.gs` to the live Apps Script project and redeploy.**
- **Quantity definition (authoritative):** `remaining_qty = completed_qty − shipped_qty` (available-to-ship, clamp ≥ 0) — **NOT** `ordered − completed`, **NOT** `ordered − shipped`. New derived-only `unreceived_qty = ordered_qty − completed_qty` (Receive modal / production progress; never stored).
- **C — Convert-to-PO init (`13_procurement_handlers.gs`):** new `purchase_order_lines` now set `completed_qty=0, shipped_qty=0, remaining_qty=0` (was `remaining_qty=ordered_qty`). Seed sample data corrected.
- **E — Receive handler:** `completed_qty += receive_qty`; `remaining_qty = max(0, completed_qty − shipped_qty)`; `shipped_qty` untouched; status → `completed` (all lines `completed ≥ ordered`) else `partial_completed`. Line-editor (`updatePurchaseOrderLine`) remaining now `completed − shipped` (added `completed_qty` col lookup).
- **D — Receive modal (`purchase-order-overview.js`):** column relabeled **Unreceived Qty** = `ordered − completed`; Receive Qty defaults to Unreceived; validation `0 ≤ x ≤ Unreceived` (`data-unreceived`). **F —** Block 1 unchanged (SKU/KM/ResUS/ResTW/Ordered/Completed/Carton; no Remaining column; Completed=Σcompleted_qty).
- **G — PO Remaining Overview (`purchase-order-list.js`):** Remaining fallback now `max(0, completed − shipped)` (available-to-ship); stored `remaining_qty` authoritative.
- **H — Spec sync:** `PURCHASE_ORDER_SPEC.md` (§4A modal → Unreceived, §4A.2 confirm formula, new **§4C quantity definitions**, §7.1 Remaining col, §8A convert-derived `remaining_qty=0`), `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` (§3.4, §6/§6.1 closure now keys off `shipped_qty ≥ ordered_qty`, §7.3, §15 convert-derived), and `DATABASE_RELATIONSHIP_MAP.md` §7.3/§7.4 (formula + receive rule + closure) corrected.
- **Redeploy required:** `01_router.gs` + `13_procurement_handlers.gs`. Frontend/CSS/adapter static. `node --check` OK on overview.js / list.js / 13.gs / 01_router.gs. **Not touched:** Request Order runtime, Shipment, Carrier, Export Center, Document Engine, DB schema. *(Follow-up: RO&PO §7.5 "Ongoing Orders" Request-Order-Analysis read still references PO `remaining_qty` with its own fallback — left unchanged as Request Order is out of scope; revisit its semantics separately.)*

## 2026-07-08 — PO Workspace UI polish + page rename (runtime; UI only)

Front-end-only polish of the **Purchase Order Workspace** card + the Procurement page rename. **No DB / API / handler / status-flow changes.**
- **Header row (`purchase-order-overview.js`):** now **PO No · Order Date · [Series + Total Qty] · Expected Completion**. **Total Qty = SUM(ordered_qty)** (same as footer Total Qty), shown stacked under Series in one cell. **Supplier Expected Ready removed from header** and added as a **display-only last date row in Production Timeline** (`--` when blank).
- **Date formatting:** `dateOnly`/`dateVal` now route through a new `toYMD()` that also parses JS Date strings (e.g. `Sun Jul 26 2026 00:00:00 GMT+0800`) → **`YYYY-MM-DD`**; fixes ugly Expected Completion display.
- **PO No weight:** confirmed same size/weight as other summary values (`.po-no` = 14px/600, not emphasized); added `.sp-summary-label--stacked` spacing for the combined Series+Total Qty cell.
- **Footer unchanged:** Total SKU / Total Qty / Total Carton retained; header Total Qty is a convenience mirror. SKU Summary / Receive flow / Receive modal / Save / Update / Factory Payment / Factory Notes runtime all unchanged.
- **Page rename (display labels only):** sidebar + page `<h2>` — *Purchase Order Overview* → **Purchase Order Workspace** (card/execution page); *Purchase Order List* → **Purchase Order Overview** (history / remaining / Shipment-allocation-source / Order Gantt). Request Order Draft convert-success message → "Open Purchase Order Workspace". `index.html` menu labels/titles + comment, both page `<h2>` updated.
- **Internal identifiers intentionally NOT renamed** (regression safety): section IDs `#purchase-order-overview-section` / `#purchase-order-list-section`, mount IDs, `showSection('purchase-order-overview'|'purchase-order-list')` keys, `app.js` section map, init functions, CSS scoping, file names all unchanged. So `purchase-order-overview*` internally = the **Workspace**; `purchase-order-list*` internally = the **Overview/Remaining** page. Documented mismatch; a full internal rename is a separate, larger refactor (follow-up).
- **Files:** `index.html`, `assets/html/pages/purchase-order-overview.html`, `assets/html/pages/purchase-order-list.html`, `assets/js/pages/purchase-order-overview.js`, `assets/js/pages/request-order-draft.js` (one label string), `assets/css/pages/procurement.css`. `node --check` OK. Static — **no redeploy**. **Not touched:** DB, API, handlers, status flow, Receive/Update/Save logic, Shipment, Carrier.

## 2026-07-08 — Bug fix: Request Order `total_sku` distinct-count (Apps Script)

- **Bug A (fixed):** `request_orders.total_sku` was persisted as **line count** in two spots of `13_procurement_handlers.gs` — `handleCreateRequestOrderDraft_` (`total_sku: lineCount`) and `procurementRecalcRequestTotals_` (`totalSku++` per line). Both now compute **`COUNT(DISTINCT sku)`** (distinct accumulator keyed by lowercased sku; cancelled lines still excluded in recalc). Frontend `recomputeCard()` already counted distinct correctly — no frontend change. **Redeploy `13_procurement_handlers.gs`.**
- **Bug B (Submit 404) — root cause = stale Web App deployment, NOT a code bug.** Full trace verified consistent: `roSubmit → transition(id,'submit') → KM.DB.updateRequestOrderStatus` posts action `updateRequestOrderStatus` → `01_router.gs` line 117 registers it → `handleUpdateRequestOrderStatus_` exists and accepts `submit`. Apps Script `ContentService` always returns HTTP 200 (unknown action → 200 + "Invalid POST action"), so a hard **404 can only be the `/exec` endpoint not resolving** — the live deployment behind `OP_DB_API_BASE_URL` is stale/superseded (reads still serve from `_opDbCache`, POSTs 404). **Fix = redeploy the Apps Script Web App** (and ensure `OP_DB_API_BASE_URL` matches the current `/exec`). No source change. `node --check` OK on `13_procurement_handlers.gs`.

## 2026-07-09 — Document Template Registry & Routing Spec v1 (SPEC ONLY)

Documented **Template Registry & Routing v1** in `DOCUMENT_GENERATION_SYSTEM_SPEC.md` (+ `DATABASE_RELATIONSHIP_MAP.md` §10). **No runtime / UI / DB migration / `document_template_fields` population.**
- **`document_templates` FINAL schema (§C):** 30 canonical columns incl. new **`document_category`** + **`document_usage`** (alongside template_id/key/name, document_type, related_entity_type, series/sku, supplier/factory/carrier/country/marketplace/language scope, file/type/drive/output_folder, file_name_rule, version/status/is_active/effective window, remark, audit).
- **Naming rules (§C.1):** `template_id = TPL-{DOC}-{SCOPE}-V{VERSION}`, `template_key = {DOC}_{SCOPE}`, UPPERCASE snake, no spaces — with the 7 canonical examples (PO_CO1100_YOUXIN … BOOKING_TOP_SEALAND).
- **Enums (§G):** `document_type` v1 = `purchase_order` / `shipment_detail` / `commercial_invoice` / `packing_list` / `carrier_booking_form`; `related_entity_type` rule (PO docs→purchase_order, shipment docs→shipment); `document_category` = factory/shipment/customs/carrier; `document_usage` = factory/internal/export/import/carrier.
- **Shipment output routing v1 (§L):** `output_folder_id` = root Shipment folder; runtime nests `Shipment/{COUNTRY}/{SHIP_DATE}/{SHIPMENT_NO}_{COUNTRY}/`; **all docs for one shipment share one folder**; `document_output_folders` **deferred**.
- **Carrier template rule (§M):** one template per carrier when layout differs; same-layout services share one row; service variation via placeholders (`{{SHIPPING_METHOD}}` / `{{SERVICE_TYPE}}` / `{{LAST_MILE_DELIVERY}}`).
- **Placeholder rule (§N):** UPPERCASE snake in `{{ }}`; token→field mapping (`document_template_fields`) deferred.
- **Deferred:** all runtime, `document_template_fields` population, `document_output_folders` table, folder-path creation, PDF/email/Export Center UI.

## 2026-07-09 — Carrier Rate Card Master Template: editable mode (runtime, XLSX export only)

Fixed the exported **Master Template** (.xlsx) so it no longer inherits the Update Template's lock rule — Master = admin master-data maintenance (fully editable); Update = restricted.
- **`assets/js/utils/template-export.js`:** new spec flag **`masterTemplate: true`** (`isMaster`). When set: **worksheet protection skipped** (`ws.protect()` not called), **all cells `protection.locked = false`** (header + data + example), and **no gray "locked" fill** — locked-kind columns render **white/editable** (only Required stays yellow). Update Template behavior unchanged (default `isMaster=false` → gray locked cells + sheet protection as before).
- **`assets/js/pages/carrier-rate-card.js`:** `crcBuildTemplateSpec('master', …)` now returns `masterTemplate: true`; Update spec stays restricted (`CRC_UPDATE_EDITABLE` / locked / gray / protect). No column-set, mapping, enum, or DB change.
- **Preserved in Master (verified unaffected by the flag):** Freeze header (A2), Auto-Filter, Auto-Width, Dropdown validation (Shipping Method / Battery Type / Charge Type / Weight Unit / Currency / Transit Type / Status), Required (yellow) header/cells, Example row, hidden `_SYSTEM` (`veryHidden`) sheet.
- **Not touched:** Import runtime, Review runtime, Carrier DB, Carrier UI, Rate Card mapping, Template Spec (TEMPLATE_UI_STANDARD_SPEC.md). `node --check` OK on both files. Static — **no redeploy** (client-side XLSX build).

## 2026-07-09 — Carrier Rate Card template: yellow = Business Editable columns (UX only)

Redefined **yellow = Business Editable** (NOT "required") for the Carrier Rate Card XLSX templates, scoped to the 9 business columns, applied through the prepared template area (row 5000).
- **`template-export.js`:** new column **`kind: 'business'`** → yellow fill (`STYLE.business = FFFFF2CC`), **always editable/unlocked in BOTH Master and Update** modes (added to the update unlock set; master already unlocks all). New spec field **`templateMaxRow`** extends the prepared area (fills + protection + dropdowns) down to an absolute row (overrides `blankInputRows`). Other templates unaffected (opt-in via `kind:'business'` / `templateMaxRow`).
- **`carrier-rate-card.js`:** `CRC_BUSINESS_EDITABLE` = the 9 columns (currency, unit_rate, destination_country, destination_city, destination_postal_code_start, destination_postal_code_end, destination_warehouse_code, shipping_method, last_mile_delivery); `CRC_TEMPLATE_MAX_ROW = 5000`. **Master:** business → yellow/editable, all others → white/editable (no lock, no protection). **Update:** business → yellow/editable, all other visible → **gray/locked**, hidden set unchanged; dropdowns kept on business enum columns (currency/shipping_method/last_mile_delivery). `templateMaxRow: 5000` on both specs. Instruction note now: *"Blank rows = New Rate Card. Fill business editable fields; reference fields should reuse existing values."*
- **Preserved:** freeze pane (A2), auto-filter, auto-width, dropdown validations, example row, hidden `_SYSTEM` sheet, Master no-protection behavior.
- **Not touched:** import/validation/apply logic, Apps Script, DB schema, API adapter, Carrier page UI, non-carrier templates. `node --check` OK. Static — **no redeploy**. *(Note: 5000-row prepared area × columns is a heavier XLSX build; `CRC_TEMPLATE_MAX_ROW` is tunable if generation feels slow.)*

## 2026-07-09 — Fix: Carrier import allows blank effective_to (open-ended)

- **Root cause:** the **master-import** validator in `17_carrier_handlers.gs` rejected blank `effective_to` — `crcParseDate_` returns `''` for blank / `null` for invalid, and the check was `if (et === null || et === '')`, so a blank cell errored "effective_to is not a valid date." (The update-import path already gated on non-blank, so only master was affected.)
- **Fix:** changed the master check to `if (et === null)` — **blank `effective_to` ('') is allowed** (open-ended / active until replaced); only a present-but-invalid value errors. `effective_from` validation unchanged (blank or invalid still errors). The write already normalizes blank → `''` (`effective_to: et`), and the existing `effective_from > effective_to` overlap check only runs when both are present (blank is never treated as invalid there).
- **Not changed:** no frontend change needed (`carrier-rate-card.js` has no client-side date validation — it posts rows to the handler); DB schema, template export UX, carrier page layout, Import Job framework, non-carrier modules untouched. Multiple open-ended rows are **not** rejected at import (latest-`effective_from` resolution / any warning is deferred, not this task). `node --check` OK. **Redeploy `17_carrier_handlers.gs`** for the fix to take effect.

## 2026-07-09 — PO mapping small fixes + Factory Price List spec

- **1. `purchase_orders.total_cartons` (runtime + spec):** added to `PURCHASE_ORDERS_HEADERS_`; Convert-to-PO accumulates `totalCartons` and writes `total_cartons` on the header; `procurementRecalcPoTotals_` now recomputes `total_cartons = SUM(purchase_order_lines.carton_qty)` (kept in sync). Documented in `PURCHASE_ORDER_SPEC.md` §8A, `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.3/§15.4, `DATABASE_RELATIONSHIP_MAP.md` §7.3. **Redeploy `13_procurement_handlers.gs`** (additive column auto-ensured on old sheets).
- **2. PO Overview / Remaining Overview (`purchase-order-list.js`):** `draft` POs are now **excluded entirely** (added `if (m.status === 'draft') return false;` in `applyFilters`; removed `draft` from `IN_PRODUCTION_STATUS`) — Draft belongs only to the Workspace. **PO column −25%** via inline `min-width:112px` (overrides `.pol-cell--po` 150px; CSS not in scope). Documented in PO_SPEC §7.1/§7.2 + RO&PO §7.3.
- **3. `requested_qty` / `approved_qty` finding — AUDIT-ONLY:** verified **not referenced** in `purchase-order-overview.js` or `purchase-order-list.js` runtime. Execution keys off `ordered_qty` (+ completed/shipped/remaining); `km_qty+resus_qty+restw_qty = ordered_qty`. Documented as audit-snapshot-only in PO_SPEC §8A, RO&PO §3.4, DB map §7.4. **Columns retained** (no removal).
- **4. `factory_price_list` (planned, SPEC ONLY):** new Factory Cost/Source Master documented in DB map §7.7 (all 20 columns) — sensitive factory cost/source; `sku_details` stays marketing-facing (no factory costs); `factory_item_no`/`factory_item_name`/`factory_item_unit` (+unit_cost) resolve from here for PO lines/documents; blank `effective_to` = open-ended, latest `effective_from` wins. Referenced in PO_SPEC §8A. **Not implemented** (no schema/handler/getter).
- **Not touched:** Document Engine runtime, Carrier import, Shipment, Request Order UI. `node --check` OK on `purchase-order-list.js` + `13_procurement_handlers.gs`. PO adapter normalizer left unchanged (pages derive cartons from lines; `total_cartons` header is for DB/documents) — no API-adapter edit needed.

## 2026-07-09 — Carrier Rate Card import policy: Master=Upsert, Update=Update-Only (spec + runtime)

Finalized the current-stage Carrier Rate Card import behavior.
- **Runtime (`17_carrier_handlers.gs`):** the create-new-row branch (blank `rate_card_id` + meaningful) now runs **only in `mode = master`**. In **`mode = update`** a meaningful blank-`rate_card_id` row is **rejected** with a clear message ("Update Template requires rate_card_id (update-only) — new rate cards must be added via the Master Template. Row skipped."), counted in `rejected_count` + `errors`. Master import stays an **upsert** (existing id → update, blank id → create auto-`CRC-…`); unknown id → rejected (both modes). effective_from/effective_to rules unchanged from the prior fix (from required+valid; to optional/blank=open-ended; non-blank invalid errors). No auto-close of prior `effective_to`; multiple open-ended rows allowed; latest-`effective_from` resolution is a read-time rule (auto-close deferred).
- **No frontend change:** `carrier-rate-card.js` already displays the distinct summary (Updated / Created / Blank skipped / Locked ignored / Rejected + row errors) and derives import mode via `forceMode`/filename (Master modal forces `master`).
- **Spec:** `CARRIER_AND_ROUTE_SPEC.md` §4C.3A rewritten to a Master-Upsert / Update-Update-Only policy table + per-row semantics; §4C.4 updated (mode split, effective-date rules, current-stage versioning + deferred auto-close). `DATABASE_RELATIONSHIP_MAP.md` §9 carrier import clause updated to the mode split.
- **Not touched:** template export UX, Import Job framework, Shipment, PO, Document Engine, DB schema (columns already header-ensured). `node --check` OK on `17_carrier_handlers.gs`. **Redeploy `17_carrier_handlers.gs`** for the update-only guard to take effect.
- **Follow-up flagged:** the exported **Update Template** instruction banner still reads "Blank rows = New Rate Card" (set in template export UX, which is out of scope here) — now inconsistent with update-only import; reconcile that banner text in a future export-UX task.

## 2026-07-09 — PO deposit_due_date + supplier timeline + doc placeholder rule

- **`purchase_orders.deposit_due_date` (runtime + spec):** new column = **`order_date` + 5 BUSINESS days** (Mon–Fri; Sat/Sun excluded; holidays deferred; never from `created_at`; date-only `yyyy-MM-dd`). Added helper `procurementAddBusinessDays_`; **Send PO (`issue`)** now stamps `order_date` **and** `deposit_due_date` (column ensured before write); Convert-to-PO writes `deposit_due_date: ''` (blank, order_date blank); `handleUpdatePurchaseOrderHeader_` accepts `deposit_due_date` (date-only) for manual edit. `PURCHASE_ORDERS_HEADERS_` gains the column. **Redeploy `13_procurement_handlers.gs`.**
- **Adapter/UI:** `normalizePurchaseOrderRecord` exposes `depositDueDate`; PO Workspace Block 4 (Factory Payment) shows **Deposit Due Date** (display) and the header edit modal adds a **Deposit Due Date** date input (`data-f="deposit_due_date"` → existing `updatePurchaseOrderHeader`). Supplier Expected Ready already displays in the Production Timeline block.
- **Supplier timeline fields:** documented `supplier_expected_ready_date` / `supplier_confirmed_ready_date` as **supplier-specific, not globally required** (blank allowed); Workspace may display supplier_expected_ready_date; doc gen may map `SUPPLIER_DATE_FULL` from it.
- **Doc template mapping rule (spec only):** `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §F.1 — **one `document_template_fields` row per placeholder per template; runtime replaces ALL occurrences** (DOC_DATE / SHIP_MONTH / SUPPLIER_DATE_FULL examples; key = template_id+placeholder). Added §H placeholders **`{{DOC_DATE_PLUS_5}}` ← `deposit_due_date`** (format `yyyy-MM-dd`, transform `date_only`) and **`{{SUPPLIER_DATE_FULL}}` ← `supplier_expected_ready_date`**. Document Engine runtime NOT implemented.
- **Specs:** PO_SPEC §2/§4-Block4, RO&PO §3.3/§15.4, DB map §7.3 updated. **Deferred:** holiday calendar, manual-override flag + auto-recalc-on-order_date-change, full Document Engine.
- **Not touched:** Shipment, Carrier, Document Engine runtime, Request Order Draft (Convert only adds a blank column). `node --check` OK on overview.js / adapter / 13.gs.

## 2026-07-13 — Shipments `shipping_method_label` snapshot (runtime + spec)

- **`shipments.shipping_method_label` (+ `last_mile_delivery`) added (`12_shipment_handlers.gs`):** new header columns. **Snapshot at creation** — `shipmentMethodLabel_()` resolves the localized service name from `carrier_rate_cards.shipping_method_label` (read-only via new `shipmentRateCardLabel_()`; **never modifies carrier tables/import**), falling back to `shipping_method + '_' + last_mile_delivery`. Creation now also copies `rate_card_id` / `last_mile_delivery` from the plan. `updateShipment` **re-copies the label only while status = `draft`** (rate-card/method change pre-confirmation); **frozen afterward — never auto-resynced**. `last_mile_delivery` added to `SHIPMENT_EDITABLE_FIELDS_`; label is derived (not directly editable). Columns auto-ensured on old sheets. Canonical `shipping_method` / `last_mile_delivery` kept, not replaced.
- **API (`operation-system-db-api.js`):** `normalizeShipmentRecord` exposes **`shippingMethodLabel`** (with legacy fallback `shipping_method_'_'_last_mile_delivery`) + `lastMileDelivery`. No field renames.
- **Spec:** `DATABASE_RELATIONSHIP_MAP.md` §8 shipments (column + snapshot/fallback bullet; reconciled §21 note — `last_mile_delivery` is a copied service field, not a battery/magnet auto-aggregate); `SHIPMENT_CENTER_SPEC.md` §15A (snapshot rule) + §20 (dataset header + read-the-snapshot rule); `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §I (`{{SHIPPING_METHOD_LABEL}}` ← `shipments.shipping_method_label`; documents read snapshot, not reconstruct).
- **Backward compatible:** existing shipments unchanged (nullable; blank → runtime/API fallback). **Redeploy `12_shipment_handlers.gs`.** `node --check` OK on 12.gs + adapter. `carrier_rate_cards.shipping_method_label` source column is added/populated by the Carrier module (out of scope) — resolver reads it defensively and falls back until then. **Not touched:** Carrier import, Document Engine runtime, Request Order, Purchase Order, frontend UI.

## 2026-07-13 — Carrier `shipping_method_label` source column (runtime + spec; completes the shipment snapshot)

Added the **source** column `carrier_rate_cards.shipping_method_label` + template/import support so the shipment snapshot (prior task) has a real value to copy.
- **A/C — `17_carrier_handlers.gs`:** `shipping_method_label` added to `CARRIER_RATE_CARDS_HEADERS_` (after `last_mile_delivery`) and to `CRC_LOCKED_COLS_` (Update import **ignores edits → existing value kept + warning**). Master new-row append captures `shipping_method_label` (blank allowed, never auto-derived); Master existing-row update already writes it via `crcMasterWritableForExisting_`. Additive column (auto-ensured).
- **B — `carrier-rate-card.js` + adapter cols:** `shipping_method_label` added to `CARRIER_RATE_TEMPLATE_COLS` (adapter) + `CRC_COLS_FALLBACK` (Master template — **white/editable** admin field, NOT yellow) and `CRC_UPDATE_VISIBLE_REF` (Update template — **gray/locked**, not in `CRC_BUSINESS_EDITABLE` yellow set). Admin hint added to `CRC_COMMENTS`.
- **E — adapter:** `normalizeCarrierRateCardRecord` exposes **`shippingMethodLabel`** (shipment normalizer already exposes it). snake_case DB / camelCase frontend; no renames.
- **D — shipment snapshot:** already wired last task (`12_shipment_handlers.gs` reads `carrier_rate_cards.shipping_method_label` by `rate_card_id` at creation + re-copies on rate-card select while Draft; frozen after). Now that the source column exists, the copy resolves; **no 12.gs change this task.** `shipping_plans` intentionally untouched (no rate_card_id/label on the plan — label resolves when a rate card is selected on the shipment draft).
- **F — doc mapping (spec):** `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §I now gives the full `document_template_fields` row for `SHIPPING_METHOD` (alias `SHIPPING_METHOD_LABEL`) → `shipments.shipping_method_label` (scalar / header / table `shipments` / field+path `shipping_method_label` / fallback `concat(shipping_method,"_",last_mile_delivery)` / example `美森海派`).
- **Spec:** `CARRIER_AND_ROUTE_SPEC.md` (column table + §4C.3A import locked/Master-editable), `SHIPMENT_CENTER_SPEC.md` §15A (source column now exists), `DATABASE_RELATIONSHIP_MAP.md` §9 note. Canonical `shipping_method` / `last_mile_delivery` unchanged.
- `node --check` OK on `17_carrier_handlers.gs` + `carrier-rate-card.js` + adapter. **Redeploy `17_carrier_handlers.gs`** (source column + import lock). `12_shipment_handlers.gs` redeploy still required from the prior task if not yet deployed. **Not touched:** PO runtime, Request Order, Document Engine runtime, Import Job framework.

## 2026-07-13 — Shipment Detail document mapping & grouped-output rules (SPEC ONLY)

Finalized the **Shipment Detail** collection layout / grain / merge / joins in `DOCUMENT_GENERATION_SYSTEM_SPEC.md` **§I.1** (mirrored in `SHIPMENT_CENTER_SPEC.md` §16 + `DATABASE_RELATIONSHIP_MAP.md` §10). **No Document Engine runtime.**
- **Collection controller (A):** template row 2; `A2 = {{SHIPMENT_LINES}}` in hidden control column A; duplicate row 2 per output row; clear the controller token; keep col A hidden; no `LINE_NO`. `{{SHIPMENT_LINES}}` = collection field; per-row placeholders share `collection_key = SHIPMENT_LINES`.
- **Grain + joins (B/H/I):** one output row per **shipment-line PO allocation**; join `shipments → shipment_lines → shipment_line_allocations → purchase_order_lines → purchase_orders` (+ `carriers`). **≥ 1 PO allocation required — no-allocation Shipment cannot finalize/export; `PO_NO` required.** PO_NO + CARRIER_NAME resolution chains documented; preload-all / no-N+1.
- **Required fields (C):** SHIPMENT_NO, SKU, QTY, CARTON_QTY, GROSS_WEIGHT, CARTON_CBM, CARTON_NO_RANGE, PO_NO, WAREHOUSE_CODE, DESTINATION, ETD, ETA, CARRIER_NAME, SHIPPING_METHOD. **`QTY` = `shipment_line_allocations.allocated_qty` (no `shipment_lines.qty` fallback).** Full placeholder→field table added.
- **Merge (D/E):** header fields merge by `shipment_id`; SKU/CARTON_QTY/GROSS_WEIGHT/CARTON_CBM/CARTON_NO_RANGE merge by `shipment_line_id`; **QTY / PO_NO never merge** (one row per PO allocation) — worked example included.
- **Carton range (F):** `carton_range;merge_by_shipment_line` (both diff → "1 - 3"; same → "1"; start only → start; blank → blank).
- **Shipping method snapshot (G):** `SHIPPING_METHOD` → `shipments.shipping_method_label` (snapshot copied at rate-card select; fallback `concat(shipping_method,"_",last_mile_delivery)`); do NOT resolve historical labels from the current rate card at generation.
- **Deferred (J):** row duplication, vertical-merge runtime, Drive generation, `generated_documents` writes, Export Center UI. `shipment_line_allocations` noted as a **planned** link table (not yet migrated). Spec-only — no code/`node --check` (no runtime files touched).

## 2026-07-13 — Document + Shipment mapping consistency audit (SPEC ONLY)

Reconciled the Document/Shipment/Carrier mapping specs; **no runtime touched** (inspected `12_shipment_handlers.gs` / `17_carrier_handlers.gs` / adapter — read-only).
- **Enum reconciliation (DOC GEN §E):** canonical **`field_type` = scalar / collection / collection_item / formula / constant / system** (structural role; display type text/number/date/currency now lives in `format_rule`); canonical **`data_scope` = header / line / allocation / total / system / static** (added `allocation`). §H PO table + §I.1 Shipment Detail table reconciled to these (field_type + format_rule columns; `QTY`/`PO_NO` = collection_item @ allocation, `CARTON_NO_RANGE` = formula).
- **Placeholder storage (§F.1 / §E / §N):** `document_template_fields.placeholder` stored **WITHOUT braces** (`PO_NO`); template file uses `{{PO_NO}}`; runtime wraps `{{ }}`; uniqueness = (template_id, placeholder).
- **Shipping-method placeholder (§I / §I.1 / §N):** **`SHIPPING_METHOD` is canonical** → `shipments.shipping_method_label`; **`SHIPPING_METHOD_LABEL` marked NON-CANONICAL (do not create)** — DB field name need not equal placeholder name.
- **Stale deferral fixed (Req 4):** removed "all `document_template_fields` population deferred"; now **PO (§H) + Shipment Detail (§I.1) mappings FINALIZED**; only remaining doc-type mappings (carrier booking / commercial invoice / packing list) + Document Engine runtime + `shipment_line_allocations` table/writer are deferred (DOC GEN §K, DB map §10, §N).
- **`shipment_line_allocations` audit (Req 5) = ENTIRELY PLANNED (option c):** no headers/getter/writer/tab-registration in `12_shipment_handlers.gs` or adapter; current model = single **`shipment_lines.purchase_order_line_id`** link. Stated truthfully in DOC GEN §I.1.2, SHIPMENT §16, DB map §10 (no false "implemented").
- **Schema consistency (Req 6/7):** confirmed `carrier_rate_cards.shipping_method_label` sits **right after `last_mile_delivery`** in the authoritative CARRIER column table (+ runtime header); every authoritative `shipments` schema list (DB map §8, SHIPMENT §20, runtime `SHIPMENTS_HEADERS_`) includes `last_mile_delivery` + `shipping_method_label` (the §225 list is a ship-gate field subset, not a schema list — left as-is).
- **Formal-document readiness (Req 8, rule only):** Draft may use fallback; internal Shipment Detail may render fallback (legacy); **external carrier/customs docs SHOULD require a committed rate card + non-blank `shipping_method_label`** — documented in DOC GEN §I.1.7 + SHIPMENT §15A; validation runtime deferred.
- **Not changed:** Shipment/PO lifecycle, Carrier pricing, Document Engine runtime, UI, DB migration. No runtime files modified.

## 2026-07-13 — DB schema alignment: shipment quantity renames + customs/tax/SKU regional fields (IMPLEMENTATION)

Synchronized runtime + API + UI + specs with the 2026-07 DB column renames and new customs fields.
- **Six canonical renames (writes use new names only; legacy = read-fallback; NEVER re-ensured):** `shipping_allocation_draft_lines.qty → shipment_draft_qty` *(spec-only table — no runtime writer exists)*; `shipping_plan_lines.carton_qty → plan_carton_qty` (`11_shipping_plan_handlers.gs` header + `createShippingPlansBatch` writer + `updateShippingPlanLineQty` write, column auto-ensured); `shipments.total_qty/total_cartons/total_cbm → shipment_total_qty/shipment_total_cartons/shipment_total_cbm` and `shipment_lines.carton_qty → shipment_carton_qty` (`12_shipment_handlers.gs` headers, editable list, totals write, ship-gate read-fallback, plan-line read-fallback, column auto-ensure). Header weights (`total_gross_weight`/`total_net_weight`) NOT renamed.
- **New DB fields:** `shipments.customs_type` (customs-method **snapshot**; prefilled from `carrier_rate_cards.customs_type` at creation via new `shipmentCustomsType_`/`shipmentRateCardField_`, editable while Draft, read the stored snapshot — never live-resolve); `tax_referral_rates.vat_no` (normalizer only — read generically, no writer); `sku_details.product_name_cn` + `product_use` (new `handleUpsertSkuDetail_` upsert-by-sku + `upsertSkuDetail` route); `sku_regional_details.product_url` (`18_sku_regional_handlers.gs` header + `skuRegionalEnsure_`/`skuRegionalSyncIdentity_`/`handleUpsertSkuRegionalDetail_` + column auto-ensure).
- **API (`operation-system-db-api.js`):** normalizers expose `shipmentTotalQty/Cartons/Cbm` + `customsType` (shipment, legacy fallback + `totalQty/totalCartons/totalCbm` aliases kept), `shipmentCartonQty`/`cartonQty` (shipment line), `planCartonQty`/`cartonQty` (plan line), `vatNo` (tax), `productNameCn`/`productUse` (sku_details), `productUrl` (regional). New writer **`KM.DB.upsertSkuDetail`**.
- **Shipment UI (`shipping-history.js`):** Customs Type **`<select>`** in the Draft edit form (options = distinct nonblank `carrier_rate_cards.customs_type`; prefill from stored value → selected rate card); read-only display in Overview (header span + read-only field, from the stored snapshot). `_shCollectExec` now collects `select[data-field]` too, so `customs_type` saves via `updateShipment`.
- **Add SKU (`inventory-replenishment.html` + `.js`):** new required **ASIN** (`replen-add-asin` → `marketplace_product_id`) + **Product URL** (`replen-add-product-url` → `sku_regional_details.product_url`) inputs; validation (both required; product_url trimmed + `http(s)://`; marketplace_product_id trimmed/case-preserved/no fixed length); `product_url` added to the import-batch row → `04_marketplace_forecast_import.gs` resolves it + `skuRegionalSyncIdentity_(..., productUrl)` (ensure-create or identity-update; compliance fields untouched; no duplicate regional rows). Edit SKU is lifecycle-only — **left unchanged** (identity not broadened, per task).
- **SKU Details editor (new):** per-row ✎ button on the SKU Details table opens a JS-built modal editing `product_name_cn` / `product_use`, loaded from `KM.DB.getSkuDetails()` and saved via `KM.DB.upsertSkuDetail` → `handleUpsertSkuDetail_` (upsert `sku_details` by sku; additive column ensure; identity read-only). *(User opted to build the full editor — previously the page was read-only + an Add-SKU stub.)*
- **Specs:** `SHIPMENT_CENTER_SPEC.md` (rename callout + customs_type + Shipment Detail dataset), `DATABASE_RELATIONSHIP_MAP.md` (§4A/§4B/§7.5/§8 columns + renames + product_url/vat_no/customs_type/sku_details customs fields), `DOCUMENT_GENERATION_SYSTEM_SPEC.md` (§I.1 CARTON_QTY source + canonical-field note), `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` (§4/§6/§7 product_url + Add SKU required fields + sku_details customs fields), `INVENTORY_TABLE_MAPPING_SPEC.md` §17.3A (ASIN/product_url flow), `project-current-state.md` §3.1 + this entry.
- `node --check` **OK** on all edited JS (`operation-system-db-api.js`, `shipping-history.js`, `inventory-replenishment.js`, `sku-details.js`) and all edited `.gs` (`01_router`, `03_master_data`, `04_marketplace_forecast_import`, `11_shipping_plan`, `12_shipment`, `18_sku_regional`).
- **REDEPLOY required (copy to live Apps Script + redeploy):** `01_router.gs`, `03_master_data_handlers.gs`, `04_marketplace_forecast_import.gs`, `11_shipping_plan_handlers.gs`, `12_shipment_handlers.gs`, `18_sku_regional_handlers.gs`.
- **Backfill:** old columns physically remain — write canonical only, read legacy as fallback; no auto-duplication. One-time backfill of legacy→canonical is **optional/recommended** but not automated; `product_url` left blank on legacy rows (no guessing).
- **Not changed:** PO lifecycle, Request Order calcs, Carrier pricing, Document Engine runtime, Gmail, Packing List/Invoice runtime, role/permission system.

## 2026-07-13 — Carrier Booking Form: Invoice tab mapping draft (SPEC ONLY)

Recorded the confirmed **Invoice Import tab** mappings for the `carrier_booking_form` workbook in `DOCUMENT_GENERATION_SYSTEM_SPEC.md` **§I.2** (cross-ref in `SHIPMENT_CENTER_SPEC.md` §16.2 + `DATABASE_RELATIONSHIP_MAP.md` §10). **No Document Engine runtime; workbook NOT finalized.**
- **Workbook architecture (A):** ONE `document_templates` row (`carrier_booking_form` / category `carrier` / usage `carrier`) → two mapped tabs (Invoice Import + Packing List Import); shared scalar header dataset; tab-specific collection controllers + multi-tab runtime **deferred**. Second `document_templates` row only if physical files are actually separate.
- **Invoice header mapping (B/C):** `CUSTOMER_ORDER_NO→shipment_no`, `SERVICE→shipping_method_label`, `WAREHOUSE_CODE→warehouse_code`, recipient block → `warehouses.*` (name/address/city/state/postal_code/country/contact_phone/contact_email via `warehouse_code` lookup), `REFERENCE_ID→reference_id`, `TOTAL_CARTONS→shipment_total_cartons`, `CUSTOMS_TYPE→customs_type`, `VAT_NO`/`DECLARED_CURRENCY`→resolved `tax_referral_rates` row (match `shipments.country → duty_country` + effective date; latest `effective_from` wins; never by currency), `HAS_BATTERY`/`HAS_MAGNET` → OR across SKUs → `是`/`否`.
- **Invoice line collection (D, PROVISIONAL grain):** `INVOICE_LINES` (likely `shipment_lines`). Lines: `CARTON_REFERENCE` (shipment_no + 6-digit padded carton range, delimiter provisional), `LINE_REFERENCE_ID`, carton weight/L/W/H (`sku_details`), `PRODUCT_NAME_EN`/`PRODUCT_NAME_CN`, `DECLARED_UNIT_VALUE`+`HS_CODE` (`tax_referral_rates` by series+duty_country+effective; declared value also declared_currency; never currency-only), `UNITS_PER_CARTON`, `BRAND`=const "Kitchen Mama", `MODEL→shipment_lines.sku`, `MATERIAL`, `PRODUCT_USE`, `PRODUCT_URL`→`sku_regional_details.product_url` (by sku+company+country+marketplace; exact country+marketplace wins; missing = later readiness issue), `LINE_HAS_BATTERY`/`LINE_HAS_MAGNET` → `是`/`否`.
- **New DB dependencies (§I.2.7):** `warehouses.warehouse_code` / `address` / `city` / `state` / `postal_code` / `contact_phone` / `contact_email` not yet present on the warehouse master (normalizer exposes only id/company/country/warehouse_name/type/status) — required before generation; nullable; no runtime added.
- **Naming (H):** uses canonical `shipment_total_qty` / `shipment_total_cartons` / `shipment_total_cbm` / `shipment_carton_qty`; retired generic names not restored.
- **Deferred (I):** Packing List tab, full workbook grain, controller cells, multi-tab duplication, totals/footer, readiness gate, final `document_template_fields` row list, runtime. Priority §I.0 updated: Carrier Booking Form → Invoice tab = confirmed draft, Packing List tab = pending, full workbook = not finalized.
- **Runtime impact: NONE** — spec-only; no code / `.gs` / API / UI touched.

## 2026-07-13 — Shipment qty/weight snapshot + EORI schema alignment (RUNTIME + SPEC)

Aligned Shipment line quantity + header weight totals + tax EORI across runtime, API, and specs.
- **Canonical rename `shipment_lines.qty → shipment_qty` (A/F):** `12_shipment_handlers.gs` — `SHIPMENT_LINES_HEADERS_` + Execution Commit line writer now write `shipment_qty`; legacy `qty` never re-ensured (read-fallback only). Column auto-ensured. No other allowed file writes `shipment_lines.qty` (`11_shipping_plan_handlers.gs` writes `shipping_plan_lines`, not shipment lines; `01_router.gs` = routing only — neither changed).
- **New header weight totals (B) — canonicalized like the other shipment totals:** `shipments.shipment_total_gross_weight` / `shipment_total_net_weight` (retire `total_gross_weight` / `total_net_weight`; legacy read-fallback). Added to `SHIPMENTS_HEADERS_`, editable list, creation writer, and both column-ensure calls.
- **Central totals recalc (E):** new **`shipmentRecalcTotals_(ss, shipmentId)`** sums the shipment's OWN lines → `shipment_total_qty=Σ shipment_qty`, `_cartons=Σ shipment_carton_qty`, `_gross_weight=Σ gross_weight`, `_net_weight=Σ net_weight`, `_cbm=Σ(carton_cbm × shipment_carton_qty)` (established CBM rule preserved). Called at creation (inline, from plan) and from `updateShipment` **when shipment lines change** (`linesUpdated > 0`) — header-only edits don't trigger it, so manual actuals overrides stick. `net_weight`/`gross_weight`/`carton_cbm` read as stored (line-vs-unit semantics unchanged). Legacy shipments stay blank until recalculated.
- **EORI (C):** `tax_referral_rates.eori_no` (nullable; `duty_country` + effective-date lookup, latest `effective_from` wins, blank `effective_to` open-ended; never currency-only; missing must not block a doc whose `document_template_fields.required = FALSE`). Read generically (no writer) — normalizer only.
- **Customs enum (D):** canonical `third_party_customs` (買單報關) / `formal_customs` (正式報關) / `tax_refund_customs` (退稅報關) — `tax_refund_customs` NOT renamed. Packing-list 「是否出口退税」: `tax_refund_customs→是`, `third_party_customs→否`, `formal_customs→否` (do not infer formal as refund). Documented in DOC GEN §I.2.10.
- **API (`operation-system-db-api.js`):** `normalizeShipmentLineRecord` exposes **`shipmentQty`** (+ `qty` alias, `shipment_qty`→`qty` fallback); `normalizeShipmentRecord` exposes **`shipmentTotalGrossWeight`/`shipmentTotalNetWeight`** (+ `totalGrossWeight`/`totalNetWeight` aliases, `shipment_total_*`→`total_*` fallback); `normalizeTaxReferralRateRecord` exposes **`eoriNo`**.
- **Shipment UI:** `shipment-draft.js` / `shipment-overview.js` **do not exist** — the shipment workspace/overview live in `shipping-history.js` (NOT in this task's allowed files). It reads normalized `l.qty` / `s.totalGrossWeight` etc., which remain as read aliases, so no UI break; no UI file was in scope to edit.
- **Document mapping (G):** DOC GEN — Shipment Detail `QTY` still `shipment_line_allocations.allocated_qty` (allocation grain, unchanged); non-allocation shipment-line-grain docs (carrier packing-list) use `shipment_lines.shipment_qty`; packing-list footer `TOTAL_QTY→shipment_total_qty`, `TOTAL_NET_WEIGHT→shipment_total_net_weight`, `TOTAL_GROSS_WEIGHT→shipment_total_gross_weight` (§I.2.10). SHIPMENT §20 dataset line/total fields + DB map §8 shipments/shipment_lines updated; TAX spec + DB map §4B add `vat_no`/`eori_no`.
- `node --check` **OK** on `operation-system-db-api.js` + `12_shipment_handlers.gs`. **REDEPLOY:** `12_shipment_handlers.gs` (only changed `.gs`). Legacy `qty`/`total_*_weight` columns remain physically; canonical-only writes + read-fallback; no auto-duplication; weight totals blank on legacy shipments until recalc.
- **Not changed:** established CBM formula, line weight/cbm storage semantics, PO/Request/Carrier logic, Document Engine runtime, role/permission system. `11_shipping_plan_handlers.gs` / `01_router.gs` contained no affected mapping → not modified.

## 2026-07-13 — SKU Details UI refinement: central Edit SKU + customs columns (RUNTIME + SPEC)

Moved SKU Details editing to a page-level action, reworked the table columns, and expanded the upsert.
- **Central Edit action (A/B):** new top **`Edit SKU`** button (`sku-details.html` toolbar). Flow: click a row to select → `Edit SKU` opens the full `sku_details` editor for that SKU → save → table refresh. Removed the row-level ✎ pencil and the inline **status dropdown** — Status now renders as a normal display column and is edited only in the modal (no competing edit paths). `canEditSkuDetails()` added as the future permission gate. `handleSkuStatusChange` kept (still used by SKU Handbook) but no longer wired in this table.
- **Full editor (D/E):** descriptor-driven modal (`SKU_EDIT_FIELDS_`) covering sku (read-only key), status(`lifecycle`), product_name, product_name_cn, series, category, gs1_code/type, product_use, material, battery_type, magnet_type, units_per_carton, item/package/carton dims+units+weights, minimum_price/msrp/selling_price/base_currency, pm. Loads from `KM.DB.getSkuDetails()` (`rec.raw.<col>`; status via `getNormalizedSkuStatus`). Saves via **`KM.DB.upsertSkuDetail`**.
- **Table columns (C/F/G):** Product Name CN added immediately **right of Product Name** (`sku_details.product_name_cn`); **AMZ ASIN removed** from the SKU Details table (DB `marketplace_product_id` untouched — it belongs to marketplace_skus/regional); Product Use added immediately **left of Material** (`sku_details.product_use`). Net columns 22→23; removing ASIN before adding two limits width growth; horizontal scroll + sticky header preserved. Renumbered `data-col` 1–23 across all 4 lifecycle header blocks + Display panel + JS cells + CSS positional widths (`header-cell[data-col]` + `scroll-cell:nth-child`). New rows render `--` for blank Product Name CN / Product Use.
- **Boolean display (C6/C7/F):** `_skuBoolDisplay` → `No` (false/none/blank), `Yes` (true), else the original enum text (e.g. `Lithium-Ion`) — extensibility preserved; raw lowercase true/false never shown.
- **Backend (`03_master_data_handlers.gs`):** expanded `SKU_DETAILS_UPSERT_FIELDS_` from the 2-field customs allowlist to the full editor set (incl. `lifecycle` = Status, dims/weights, prices, pm, etc.). `handleUpsertSkuDetail_` already **preserves omitted fields** (only writes allowlisted + supplied), ensures columns additively, and touches **only `sku_details`** — no marketplace_skus / pricing_list / FC / factory_stock side effects. Router `upsertSkuDetail` route already existed (unchanged).
- **Specs:** `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` §7.1 (product master; Edit-SKU action; ASIN removed from page; status-only editing retired; boolean display; product_url stays regional), `DATABASE_RELATIONSHIP_MAP.md` (sku_details master + page-excludes-ASIN note).
- `node --check` **OK** on `sku-details.js` + `03_master_data_handlers.gs`. **REDEPLOY:** `03_master_data_handlers.gs` (expanded allowlist). Frontend JS/HTML/CSS ship with the static bundle.
- **Not changed:** marketplace_product_id DB columns, Marketplace SKU / Add SKU / Inventory Replenishment flows, Factory Stock baseline (still tied to first master SKU creation only), Document Engine, role/permission system.

## 2026-07-13 — Shipment line CBM canonical rename + line-total semantics (RUNTIME + SPEC)

Renamed `shipment_lines.carton_cbm → shipment_carton_cbm` AND corrected its meaning from per-carton to **LINE-TOTAL** CBM (total for the whole line/SKU qty).
- **Upstream audit (E):** `shipping_plan_lines.carton_cbm` = **per-carton** (L×W×H/1e6); `shipping_plan_lines.cbm` = **line-total** (`carton_qty × carton_cbm`, computed once at Submit/Save, §5.4). `gross_weight`/`net_weight` on the plan are line totals. → Execution Commit copies the plan's line-total **`cbm`** into `shipment_carton_cbm` (Case "both exist"). Plan fields unchanged (no plan rename).
- **Rename (A/F, `12_shipment_handlers.gs`):** `SHIPMENT_LINES_HEADERS_` `carton_cbm → shipment_carton_cbm`; line-sheet column-ensure adds `shipment_carton_cbm`; legacy `carton_cbm` never ensured/written. New `lineCbmFor_(planLine)` = plan line-total `cbm`, else per-carton (`cartonCbmFor_`) × `plan_carton_qty` **once**. Creation writes `shipment_carton_cbm: lineCbmFor_(lr)`.
- **Header formula (C/D):** header totals loop now `totalCbm += lineCbmFor_(line)` (direct sum). `shipmentRecalcTotals_`: `shipment_total_cbm = Σ shipment_carton_cbm` summed **directly** (removed the old `Σ(carton_cbm × shipment_carton_qty)`); legacy per-carton `carton_cbm` fallback converted **once** (× `shipment_carton_qty`) for historical rows only — never treats per-carton as total, never double-multiplies. gross/net weight still direct-sum. Qty/carton totals unchanged (canonical names).
- **API (G):** `normalizeShipmentLineRecord` exposes **`shipmentCartonCbm`** (canonical line-total; read `shipment_carton_cbm` → legacy `carton_cbm`); `cartonCbm` / `cbm` retained as **read-compat aliases = the same line-total value**. Writes use `shipment_carton_cbm`. (Plan-line normalizer's `cartonCbm`/`cbm` untouched.)
- **UI (H, `shipping-history.js`):** SKU-Lines column relabeled **Carton CBM → CBM**; cell reads `l.shipmentCartonCbm`; totals row `Σ shipmentCartonCbm` (removed `× cartonQty` — no frontend multiplication). Card/table layout otherwise unchanged.
- **Docs (I):** DOC GEN Shipment Detail `CARTON_CBM` source → `shipment_lines.shipment_carton_cbm` (line-total; do not multiply; placeholder name kept). §I.2.10 packing-list: line Measurement → `shipment_carton_cbm`, footer `TOTAL_CBM → shipments.shipment_total_cbm`.
- **Specs (J):** `SHIPMENT_CENTER_SPEC.md` (§15.3 note, rename callout, schema, CBM formula block, SKU-Lines UI, recalc), `DATABASE_RELATIONSHIP_MAP.md` (shipment_lines schema + recalc note), `DOCUMENT_GENERATION_SYSTEM_SPEC.md`, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md` §5.4 Execution-Commit copy note. All now state `shipment_carton_cbm = line-total`, `shipment_total_cbm = Σ shipment_carton_cbm`, multiplication happens once upstream.
- **Historical risk (K):** legacy shipment rows stored `carton_cbm` = per-carton (provable from the old writer). No blind backfill done. `shipmentRecalcTotals_` converts legacy per-carton × cartons **once** as a read-time compatibility (only when canonical blank), so a legacy shipment whose lines are edited recomputes correctly. Recommended one-time migration priority: existing `shipment_carton_cbm` → legacy line-total `cbm` (none on shipment_lines historically) → legacy `carton_cbm × shipment_carton_qty` → blank+warning. **Not auto-run.**
- `node --check` **OK** on `operation-system-db-api.js`, `shipping-history.js`, `12_shipment_handlers.gs`. **REDEPLOY:** `12_shipment_handlers.gs` (only changed `.gs`). `11_shipping_plan_handlers.gs` / `01_router.gs` had no affected shipment CBM mapping → not modified.
- **Out of scope (L) untouched:** Product Image/sku_assets, Document Engine runtime, carrier workbook engine, shipment_line_allocations, PO allocation, Factory Stock, plan approval lifecycle, carton numbering, carrier prices, tax lookup.

## 2026-07-13 — Shipment canonical field spec cleanup (SPEC ONLY)

Removed the remaining stale Shipment field names / CBM wording left after the completed runtime renames. **No runtime touched** (no JS / Apps Script / API / UI / DB).
- **Shipments schema lists:** `SHIPMENT_CENTER_SPEC.md` §2 `shipments` schema line + §5B ship-gate (`total_qty > 0` → `shipment_total_qty > 0`) now use `shipment_total_qty` / `_cartons` / `_cbm` / `_gross_weight` / `_net_weight`. (DB map §8 + §20 dataset already canonical from prior tasks.)
- **Shipment Line canonical refs:** `shipment_lines.qty → shipment_lines.shipment_qty`, `carton_qty → shipment_carton_qty`, `carton_cbm → shipment_carton_cbm` across SHIPMENT §10 on-the-way source + §16 Shipment Detail note, DB map §10 Shipment Detail note, WEEKLY Plan→Shipment mapping table (both sides: left `plan_carton_qty`, right `shipment_carton_qty`), DOC GEN §I.1 interim note. Legacy names now appear ONLY in explicit read-fallback / "do-not-restore" notes.
- **On-the-Way source (item 3):** SHIPMENT §10 now `shipment_lines.shipment_qty` (legacy `qty` read-fallback only).
- **Execution Commit CBM (item 4):** confirmed consistent everywhere — plan `carton_cbm` = per-carton, plan `cbm` = line-total → copied into `shipment_lines.shipment_carton_cbm` (line-total); `shipment_total_cbm = Σ shipment_carton_cbm`. Stale "single-carton / carton_cbm canonical / total = carton_cbm × cartons / no line-total field" wording removed (SHIPMENT §2/§15.3, DB map §8, WEEKLY §5.4, DOC GEN §I.1 already corrected).
- **Plan fields preserved (item 6):** `shipping_plan_lines.carton_cbm` (per-carton) and `shipping_plan_lines.cbm` (line-total) NOT renamed.
- **Status banner reconciled (item 7):** `SHIPMENT_CENTER_SPEC.md` header replaced the whole-module "Spec only (NO code)" claim with a 🟢 IMPLEMENTED / 🟡 PLANNED legend — core Shipment execution (Draft/Overview, Execution Commit, `shipmentRecalcTotals_`, canonical renames, label/customs snapshots) marked live; allocation table, reservation lifecycle, events/routes, Document Engine runtime marked spec-only.
- **Runtime impact: NONE** — documentation only; Document Mapping architecture / allocation rules / UI behavior / runtime code unchanged.

## 2026-07-14 — Shipment customs_type canonical rename (RUNTIME + SPEC)

Renamed `shipments.customs_type → shipments.shipments_customs_type`. **`carrier_rate_cards.customs_type` (the Rate Card source) is unchanged.**
- **Runtime (`12_shipment_handlers.gs`):** `SHIPMENTS_HEADERS_` + `SHIPMENT_EDITABLE_FIELDS_` + both `sheetEnsureColumns_` calls + Execution-Commit header write now use `shipments_customs_type`; legacy `customs_type` never ensured/written. The Rate Card prefill still READS `carrier_rate_cards.customs_type` via `shipmentRateCardField_(ss, rateCardId, 'customs_type')` (source unchanged) → stores into `shipments_customs_type`. `17_carrier_handlers.gs` untouched (its `customs_type` is the carrier field).
- **API (`operation-system-db-api.js`):** shipment normalizer exposes **`shipmentsCustomsType`** (reads `shipments_customs_type`, legacy `customs_type` fallback) + keeps **`customsType`** as a temporary read-compat alias = same value. Carrier rate-card normalizer/template columns unchanged.
- **UI (`shipping-history.js`):** Customs Type `<select>` write key `data-field` → `shipments_customs_type`; value read → `s.shipmentsCustomsType || s.customsType`. Rate-card option list still reads carrier `customsType`.
- **Document mapping:** placeholder `CUSTOMS_TYPE` → `shipments.shipments_customs_type`; `TAX_REFUND_FLAG` (是否出口退税) derives from `shipments_customs_type == tax_refund_customs ? 是 : 否` (formal_customs → 否). Enum unchanged: third_party_customs/formal_customs/tax_refund_customs.
- **Specs:** `SHIPMENT_CENTER_SPEC.md` (§2 schema, rename callout, editable list, customs snapshot bullet, §16 dataset header, §21 aggregation + changelog, status legend), `DATABASE_RELATIONSHIP_MAP.md` (§8 shipments schema + recalc note + §21 + Carrier Booking deps), `DOCUMENT_GENERATION_SYSTEM_SPEC.md` (§I.1 canonical note, §I.2.2 CUSTOMS_TYPE row, §I.2.7 deps, §I.2.10 TAX_REFUND_FLAG). `CARRIER_AND_ROUTE_SPEC.md` + `TAX_AND_REFERRAL_RATES_SPEC.md` unchanged (carrier field / no ref). `CARRIER_BOOKING_MAPPING_SPEC.md` not yet created.
- **Legacy compatibility:** old `customs_type` rows readable via normalizer + spec read-fallback notes; canonical-only writes; never overwrite populated `shipments_customs_type` from legacy; no blind migration.
- `node --check` **OK** on `operation-system-db-api.js`, `shipping-history.js`, `12_shipment_handlers.gs`. **REDEPLOY:** `12_shipment_handlers.gs` (only changed `.gs`).
- **Not changed:** `carrier_rate_cards.customs_type`, carrier runtime, Document Engine runtime, allocation rules.

## 2026-07-14 — Shipment booking_no/note column-ensure + SHIPMENT_NO → external_shipment_id (RUNTIME + SPEC)

- **`shipments.booking_no` / `shipments.note` — already LIVE** (inspected, not spec-only): both in `SHIPMENTS_HEADERS_`, `SHIPMENT_EDITABLE_FIELDS_`, the API normalizer (`bookingNo`/`note`), and the Shipment Draft UI (`Booking No` / `Remark` fields); Return-to-Draft already appends to `note`. **Only gap fixed:** added `booking_no` + `note` to BOTH `sheetEnsureColumns_` calls in `12_shipment_handlers.gs` (create + update) so legacy shipment tabs auto-add the columns. No duplicate `shipment_note`/`remark`/`shipment_booking_no` created. Default blank at creation; editable via the existing whitelist. **No API/UI change needed** (already wired).
- **Document placeholder `SHIPMENT_NO` redefined (DOC GEN §I.1/§I.2/§L + canonical note):** now `shipments.external_shipment_id` → fallback `shipment_no` → `shipment_id` (external/carrier-facing ID). Placeholder name unchanged (`{{SHIPMENT_NO}}`). Applied to Shipment Detail `SHIPMENT_NO`, Carrier Invoice `CUSTOMER_ORDER_NO`, `CARTON_REFERENCE` prefix, file-name/folder `{SHIPMENT_NO}` routing, and all external-ID label variants (Customer Order No / FBA ID No / FBA No / Outer Carton Mark). Internal `shipments.shipment_no` unchanged and reserved for a distinct `INTERNAL_SHIPMENT_NO` (not added to current templates). `BOOKING_NO → shipments.booking_no`, `NOTE → shipments.note` documented. `ETD`/`ETA` unchanged (no `shipment_etd`/`shipment_eta`).
- **Specs:** `DOCUMENT_GENERATION_SYSTEM_SPEC.md` (§I.1 SHIPMENT_NO row + canonical note, §I.2.2 CUSTOMER_ORDER_NO, §I.2.4 CARTON_REFERENCE, §I.2.7 deps, §L routing note), `SHIPMENT_CENTER_SPEC.md` §16.2 (Carrier Booking header/SKU fields), `DATABASE_RELATIONSHIP_MAP.md` §10 (routing + SHIPMENT_NO/BOOKING_NO/NOTE note). Schema lists already included `booking_no`/`note`. `CARRIER_BOOKING_MAPPING_SPEC.md` not yet created.
- `node --check` **OK** on `12_shipment_handlers.gs` (only changed JS/`.gs`). **REDEPLOY:** `12_shipment_handlers.gs`.
- **Legacy fallback:** `SHIPMENT_NO` = external_shipment_id → shipment_no → shipment_id (historical rows with blank external id). New docs normally resolve external_shipment_id.

## 2026-07-14 — Shipment customs Label snapshot (`shipments_customs_type_label`) — mirrors `shipping_method_label` (RUNTIME + SPEC)

- **Goal (Architecture Alignment):** give Customs Type the EXACT same Label-snapshot architecture as Shipping Method Label, so documents never translate the enum. Canonical enum (`shipments_customs_type`) unchanged.
- **DB (already updated by user):** `carrier_rate_cards.customs_type_label` (中文 Label source) + `shipments.shipments_customs_type_label` (frozen snapshot).
- **`17_carrier_handlers.gs`:** added canonical `CUSTOMS_TYPE_LABELS_` map + `customsTypeLabel_(code)` helper (SINGLE SOURCE OF TRUTH: `third_party_customs`=買單報關 / `formal_customs`=正式報關 / `tax_refund_customs`=退稅報關); added `customs_type_label` to `CARRIER_RATE_CARDS_HEADERS_` + `CRC_LOCKED_COLS_`; import writer derives `customs_type_label = row override || customsTypeLabel_(customs_type)`. Existing tabs auto-add the column via `procurementEnsureSheet_`→`sheetEnsureColumns_`.
- **`12_shipment_handlers.gs`:** added `shipmentCustomsTypeLabel_(ss, rateCardId, presetLabel, customsType)` resolver (mirrors `shipmentMethodLabel_`: preset → `carrier_rate_cards.customs_type_label` → enum→Label fallback via shared `customsTypeLabel_`); added `shipments_customs_type_label` to `SHIPMENTS_HEADERS_` + both `sheetEnsureColumns_` calls; creation writes the Label snapshot; **Draft-only re-derive block** recomputes the Label when `shipments_customs_type` or `rate_card_id` changes (frozen after Draft). Label is DERIVED, never directly editable (not added to `SHIPMENT_EDITABLE_FIELDS_`).
- **API (`operation-system-db-api.js`):** added shared JS `CUSTOMS_TYPE_LABELS_` + `customsTypeLabelFallback_`; shipment normalizer exposes `shipmentsCustomsTypeLabel` (stored label → enum fallback); carrier rate card normalizer exposes `customsTypeLabel` (stored → enum fallback).
- **Document mapping:** `{{CUSTOMS_TYPE}}` → `shipments.shipments_customs_type_label` (the Label, NOT the enum). Runtime forbidden from `if (customs_type == …)` translation. 「是否出口退税」 remains a SEPARATE enum-driven yes/no derivation off `shipments_customs_type` (intended enum consumer, not a Label translation).
- **Specs:** `DOCUMENT_GENERATION_SYSTEM_SPEC.md` (§I.2.2 CUSTOMS_TYPE row + §I.1 canonical note + §I.2 enum/label note + §I.2.7 deps), `SHIPMENT_CENTER_SPEC.md` (§2 schema + snapshot note + §16.x doc field list), `DATABASE_RELATIONSHIP_MAP.md` (§8 shipments + carrier_rate_cards bullet + §10 doc deps), `CARRIER_AND_ROUTE_SPEC.md` (§4 carrier_rate_cards column table). `CARRIER_BOOKING_MAPPING_SPEC.md` still not created (paused task) — the `{{CUSTOMS_TYPE}}`→label rule will carry into it from DOC GEN.
- `node --check` **OK** on `operation-system-db-api.js`, `12_shipment_handlers.gs`, `17_carrier_handlers.gs`. **REDEPLOY:** `12_shipment_handlers.gs` **and** `17_carrier_handlers.gs`.
- **Result:** Shipping Method Label and Customs Type Label now use a fully identical Snapshot Architecture (carrier column → shipment snapshot → document Label; enum→Label map is the only place a Label lives).

## 2026-07-15 — Shipment Draft → Warehouse Selection Flow architecture (SPEC ONLY)

- **Decision (SPEC ONLY — no runtime):** finalized the Shipment Draft warehouse-selection architecture. **No JS / Apps Script / API / DB / UI files changed.** No new Warehouse spec created — `SHIPMENT_CENTER_SPEC.md` already owns the `warehouses` master schema (§2), so it is the master-data home.
- **Warehouse Master = SSOT** for `warehouse_code` / `warehouse_name` / `country` / `state` / `city` / `address` / `postal_code` / `contact_phone` / `contact_email` / status. Shipment stores **only `shipments.warehouse_code`** (no duplicated address/contact columns in v1).
- **`SHIPMENT_CENTER_SPEC.md`:** new **§22 Shipment Draft → Warehouse Selection Flow (FINALIZED — SPEC ONLY)** — country-filtered searchable dropdown (not free text, never the global list); recommended option display `{code} — {name} — {city/state}`; empty states (`Select a country first.` / `No active warehouse is available for this country.`); **+ Add New Warehouse** flow (prefill country, unique `warehouse_code`, refresh + auto-select, no manual page reload, cancel leaves selection unchanged); **country-change invalidation** (clear cross-country `warehouse_code`); Draft vs formal-confirmation validation; document lookup (§22.J); `WAREHOUSE_COUNTRY_CODE` fallback (§22.K); `country_to_iso2` transform (§22.L); UI/UX table (§22.C). §2 warehouses schema notes proposed additive **`is_selectable_for_shipment` (BOOLEAN)** — PLANNED, not implemented. §11 gains Warehouse Master independence + cardinality + operational-selection-vs-document-lookup split; §4 Warehouse Code field flagged as country-filtered dropdown.
- **`DOCUMENT_GENERATION_SYSTEM_SPEC.md`:** §I.2.3 warehouse lookup clarified as reference-lookup (not snapshot); new **§I.2.7A** canonical `WAREHOUSE_*` placeholder set (`WAREHOUSE_CODE/NAME/ADDRESS/CITY/STATE/POSTAL_CODE/COUNTRY_CODE/PHONE/EMAIL`) + `WAREHOUSE_COUNTRY_CODE` fallback flow + `country_to_iso2` transform rule + `document_template_fields` semantics; `RECIPIENT_COUNTRY_CODE` now resolves via `country_to_iso2`; §I.2.7 marks `is_selectable_for_shipment` proposed and country-code as a transform (not a column).
- **`DATABASE_RELATIONSHIP_MAP.md`:** §8 adds `shipments → warehouses` (`warehouse_code`, many→1) + **§8A** Warehouse reference note (Master independence, cardinality, operational selection vs document lookup, `country_to_iso2`, proposed `is_selectable_for_shipment`).
- **Conditional files left UNCHANGED (criteria not met):** `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` (its only "governance" is pricing, not shared master-data governance) and `SYSTEM_RUNTIME_ARCHITECTURE.md` (no master-reference selection patterns).
- **Deferred runtime:** Warehouse Master page, Add Warehouse modal, Apps Script/API, `is_selectable_for_shipment` DB column, `country_to_iso2` implementation, Document Engine. All planned, none implemented.

## 2026-07-16 — Tax & Referral Rate Master V2 — DB/API/UI/spec alignment (RUNTIME + SPEC)

- **Scope:** synchronized the system with the user-finalized V2 DB for `tax_referral_rates` (parent) + `tax_rate_components` (child), and made these the authoritative SSOT for SKU/Series HS Code & country tax master data. **[`TAX_AND_REFERRAL_RATES_SPEC.md`](../../docs/planning/TAX_AND_REFERRAL_RATES_SPEC.md) is the SSOT** — other specs carry concise consumer rules + pointers.
- **Final schemas (V2):** parent `tax_rate_id, series, country_of_origin, duty_country, hscode, duty_rate, vat_no, vat_rate, eori_no, port_tax_rate, referral_fee_rate, declared_value, declared_currency, effective_from, effective_to, note, created_at, updated_at`; child `tax_component_id, tax_rate_id(FK), component_type, component_code, component_name, rate_type, rate_value, amount_per_unit, amount_currency, quantity_unit, effective_from, effective_to, source_url, note, created_at, updated_at`. **Retired v1→v2:** `extra_tax_rate` dropped; `vat`→`vat_rate`; `port_tax`→`port_tax_rate` (legacy `vat`/`port_tax` = API read-fallback only). **Rate convention audited → whole-number percent (25 = 25%)** documented as canonical.
- **IDs:** `TRR-{SERIES}-{DUTY}-{ORIGIN}-{YYYYMMDD}-V{NN}` · `TRC-{…}-{COMPONENT_CODE}-V{NN}` (immutable; lookups never parse the ID). **Parent business key = series + country_of_origin + duty_country + effective date.** Blank `effective_to` = open-ended (never "invalid"). New period = new row/version; history preserved, never overwritten.
- **NEW Apps Script `19_tax_handlers.gs`** (REDEPLOY): `handleUpsertTaxReferralRate_` (correction updates in place preserving id/created_at; `create_version` makes a new row + generated id; optional `close_previous` sets prior open-ended row's `effective_to = new from − 1 day`; overlap detection → warnings; duplicate-id guard; blank-date accepted; ISO-2 uppercasing; numeric normalize; `updated_at` bumped) and `handleUpsertTaxRateComponent_` (validates parent `tax_rate_id` exists → **no orphan components**; `rate_type` enum check; component versioning). Header-based mapping; additive column ensure only.
- **Router (`01_router.gs`, REDEPLOY):** wired `upsertTaxReferralRate` / `upsertTaxRateComponent` (+ supported-actions list). **Reads (`03_master_data_handlers.gs`, REDEPLOY):** added `tax_rate_components` to both valid-tabs lists (`filterRows_` default passes it through).
- **API (`operation-system-db-api.js`):** `normalizeTaxReferralRateRecord` → V2 canonical (`hscode`+`hsCode` alias, `vatRate`/`portTaxRate` with legacy read-fallback, `extraTaxRate` REMOVED as canonical); new `normalizeTaxRateComponentRecord`; `taxRateComponents` added to the DB load; new getter `getTaxRateComponents`; new adapters `upsertTaxReferralRate` / `upsertTaxRateComponent` (action names match the router; resolve only on real handler success — **no fake save**).
- **UI (`sku-details.js`):** Edit SKU modal gains an **`HS Code & Tax Rates`** action → Series-scoped subpage listing `tax_referral_rates` rows (per Origin × Duty × version) with **Add Country Rate / Edit / New Version** (writes `tax_referral_rates` only, never `sku_details`; Series inherited read-only). **`tax_rate_components` render read-only** (component editor DEFERRED — no fake saves).
- **Consumer specs:** `DATABASE_RELATIONSHIP_MAP.md` §4B rewritten to V2 (parent+child columns, IDs, business key, cardinality, retired cols, rate convention, not-one-row-per-SKU); `SKU_MASTER_AND_REGIONAL_DETAILS_SPEC.md` §1/§7.1/§8 (subpage + tax-is-Series-master, not in sku_details); `SHIPMENT_CENTER_SPEC.md` new **§15.4** estimated duty/tax (source + effective-date lookup + calc-date priority ETD→creation→current; **no formula invented**); `DOCUMENT_GENERATION_SYSTEM_SPEC.md` §I.2.5 → V2 canonical key (declared_currency is returned, not a key; VAT/EORI optionality via `document_template_fields.required`; required HS/declared blocks that doc) + §I.2.7 dependency list.
- **Syntax:** `node --check` OK on `operation-system-db-api.js`, `sku-details.js`, `19_tax_handlers.gs`, `01_router.gs`, `03_master_data_handlers.gs`.
- **REDEPLOY Apps Script:** `19_tax_handlers.gs` (new), `01_router.gs`, `03_master_data_handlers.gs`.
- **Deferred:** component editor UI (read-only for now); standalone Tax & Referral Rates management page (documented, deferred — no page shell exists); landed-cost/duty engine + FX + Cost Analysis UI; migration audit is advisory (no auto-fix of blank IDs / invalid codes / overlaps / orphans).

## 2026-07-16 — AGL Carrier Booking template mapping + Google Sheet Document Runtime rules finalized (SPEC ONLY)

- **SPEC ONLY — no runtime changed.** No JS / Apps Script / API / DB migration / frontend / live Google Sheet template edited. Document Engine remains deferred.
- **NEW [`CARRIER_BOOKING_MAPPING_SPEC.md`](../../docs/planning/CARRIER_BOOKING_MAPPING_SPEC.md)** — the authoritative home for per-carrier Carrier Booking workbook mappings (not a duplicate of the shared engine architecture). Contains: carrier progress order (TOP SEALAND ✅ · **AGL ✅ FINALIZED V1** · **SINOTRANS = next**); a concise TOP SEALAND pointer; and the **full AGL mapping** — registry (`TPL-BOOKING-AGL-V1` / `BOOKING_AGL`, `carrier_booking_form`/`shipment`/`carrier`/`carrier`, `google_sheet`, `worksheet_name = Template`), `AGL_INVOICE_LINES` controller (hidden control column on line-template **row 22**, grain = `shipment_lines`), header mapping (`SHIPMENT_NO → external_shipment_id` fallback shipment_no→shipment_id; `ETD → shipments.etd` yyyy-MM-dd/date_only; `DECLARED_CURRENCY` future-ready with fixed-USD v1 retained), line mapping (`PRODUCT_NAME_EN`/`MATERIAL`/`HS_CODE`/`COUNTRY_OF_ORIGIN`=constant "China" v1/`QTY`/`DECLARED_UNIT_VALUE`/`AMOUNT`=formula QTY×declared_value/`CARTON_QTY`/`GROSS_WEIGHT`/`NET_WEIGHT`/`CARTON_CBM`=line-total), the confirmed `FIELD-BOOKING-AGL-####` inventory, tax lookup (Tax Master v2), footer-formula preservation + range-update, and the fixed-USD v1 decision + China-origin limitation.
- **[`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](../../docs/planning/DOCUMENT_GENERATION_SYSTEM_SPEC.md)** — new shared **§O Google Sheet Document Runtime Rules** (immutable template + copy-before-render 8-step workflow + forbidden-on-original list; hidden-control-column general rule — **not** hardcoded to column A; `worksheet_name` semantics incl. unmapped `Instructions` tab; reserved-row capacity = initial not max; dynamic row insertion before footer with formatting copy; footer-formula preservation + explicit range validation; formula-vs-shipment-totals validation, planned). §I.0 priority + §I.2 status + §G.1 note now point to the carrier spec (carrier_booking_form finalized for TOP SEALAND + AGL; SINOTRANS next); §I.1.1 column-A note cross-references the general §O.2 rule.
- **Cross-references (concise, no duplicate schemas):** `DATABASE_RELATIONSHIP_MAP.md` §10 Carrier Booking note → carrier spec + AGL finalized; `TAX_AND_REFERRAL_RATES_SPEC.md` §11.3 → AGL consumer pointer. Tax resolution paths (`shipment_lines.sku → sku_details.series → tax_referral_rates`, `shipments.country → duty_country`) already existed from the Tax V2 task — not duplicated.
- **AGL mapping status: COMPLETED / FINALIZED V1.** Not implemented: Document Engine runtime, Drive copy, row-insertion runtime, formula-rewrite runtime, `generated_documents` writes, Export Center UI, email/PDF, readiness validation. **Next carrier mapping = SINOTRANS** (not started).

## 2026-07-17 — Document Generation Runtime finalized (canonical) — SPEC ONLY

- **SPEC ONLY — no runtime/DB/UI/code changed.** Canonical document-engine runtime formalized so every future carrier template follows one contract. **`document_template_fields` remains the SSOT for field-level mappings** — markdown describes runtime architecture only; no `document_template_fields` rows were duplicated into markdown.
- **[`DOCUMENT_GENERATION_SYSTEM_SPEC.md`](../../docs/planning/DOCUMENT_GENERATION_SYSTEM_SPEC.md)** — new **§P Document Generation Runtime — Canonical Finalization**: runtime pipeline (Template→Copy→Resolve Placeholder→Resolve Collection→Dynamic Row Expansion→Formula Recalc→Generate→Generated Document), immutable-template rule (→§O.1), collection runtime + **`collection_key` convention** `{SCOPE}_{DOCTYPE}_LINES` (AGL/SINOTRANS/EXPORT/US_IMPORT invoice+packing keys registered), dynamic-row runtime (→§O.4), **formula runtime split** (template formulas `SUM`/`COUNT`/totals stay in-sheet vs runtime formulas Amount/Invoice No/PO No/Material Summary/Carton Reference/Collection Summary computed before write), **canonical lookup priority** (HS Code / Declared Value / Warehouse / Regional Product / Pricing chains + effective-date + document-date priority), **generated-document snapshot immutability** (later Pricing/Tax/SKU/Warehouse/Carrier edits never alter historical docs), and runtime-vs-template calculation responsibility table. Reuses existing §O (immutable/copy/reserved-rows/dynamic-expansion/footer-formulas) — not re-duplicated.
- **NEW [`CARRIER_DOCUMENT_MAPPING_SPEC.md`](../../docs/planning/CARRIER_DOCUMENT_MAPPING_SPEC.md)** — carrier-specific document **runtime behavior** (not field mappings): shared-runtime §0; AGL (points to `CARRIER_BOOKING_MAPPING_SPEC.md` for the field inventory; runtime + fixed-USD + China-origin special rules); SINOTRANS (Invoice + Packing, `SINOTRANS_*_LINES`); Taiwan Export (`EXPORT_*_LINES`, Invoice No / PO / Material Summary as runtime formulas); US Import (`US_IMPORT_*_LINES`, **shares Export runtime**, only import-specific fixed content differs); future FedEx/UPS/DHL/Expeditors/Flexport extension point.
- **Milestone — Document Generation Runtime finalized:** ✔ `document_templates` schema · ✔ `document_template_fields` runtime · ✔ collection runtime · ✔ dynamic row runtime · ✔ lookup priority · ✔ immutable template rule · ✔ AGL / SINOTRANS / Taiwan Export / US Import mappings (field-level details in `document_template_fields`). **Document Engine execution runtime itself remains deferred** (copy/generation/row-insertion/formula-rewrite/`generated_documents` writes/Export Center/PDF/email not built).
- **Next planned milestone:** SKU Details UX completion → Master Data completion → Supply Chain Runtime closed loop.
