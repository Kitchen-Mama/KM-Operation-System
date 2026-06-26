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
