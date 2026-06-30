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
