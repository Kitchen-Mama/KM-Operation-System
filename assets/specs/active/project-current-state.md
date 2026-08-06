# Kitchen Mama Operation System - Project Current State

**Last Updated:** 2026-07-24
**Maintained By:** Development Team
**Document Purpose:** Single source of truth for current system state, data architecture, and development roadmap.

---

## 0. Calculation Specification Freeze — v4.1 FINALIZED (2026-07-24)

The dual supply-planning calculation specification is **FINALIZED (v4.1)** (v4.0 freeze + §22 Avg. Sales/day 90-day-source refinement + v4.1 residual documentation cleanup). **This calculation-spec freeze/cleanup work did not modify Runtime / UI / tests / DB Schema / Apps Script** — the calculation engine remains unbuilt. *(Note: separate UI-polish rounds in this project — Inventory Replenishment / Request Order / Promotion Risk / Carrier Rate Card / sidebar — DID change front-end `.js`/`.html`/`.css` + their tests; those are front-end display/filter/navigation changes and did NOT implement any Supply Planning calculation engine, DB schema, or Apps Script. Do not read "spec-only" as "no code ever changed in the project.")*

**Canonical status (v4.1):**
```text
Formula Owner: SUPPLY_PLANNING_CALCULATION_RULES.md v4.1 FINALIZED
Golden Scenarios Specified: 40
Executable Golden Tests: PENDING
Supply Planning Calculation Runtime: NOT IMPLEMENTED
Shared Demand/Supply Ledger: NOT IMPLEMENTED
Config 4 gap-aware Daily Sales importer source: IMPLEMENTED IN REPOSITORY SOURCE (Apps Script, 2026-07-21)
Config 4 Apps Script production redeploy: PENDING
Config 4 live import_sync_runs column confirmation: PENDING
Config 4 one-time historical gap recovery / backfill: PENDING
Config 4 daily trigger confirmation: PENDING
Config 4 live BigQuery / Google Sheet verification: PENDING
Browser Verification: PENDING
```

**Order-state contract (owner §36/§37):** Live T1–T4 Demand/Shortage = continuously recalculated planning signal (never overwrites persisted drafts). Monthly Suggested = persisted planning snapshot in `request_order_allocation_drafts` / `request_order_allocation_draft_lines`. Emergency Draft = on-demand snapshot using the **same** Engine A → Engine B → reallocation → Net Order Need rules. User edits update `order_qty` / `carton_qty` and **preserve** `recommended_qty`. Explicit partial-carton override passes through Send → Approval → PO with note preservation, never re-rounded. **T4 remains visibility-only** (never an order commitment / never `request_bucket = T4`).

| Track | Status |
|-------|--------|
| **Replenishment calculation SPEC (Engine A)** | ✅ **FINALIZED v4.1** |
| **Order calculation SPEC (Engine B)** | ✅ **FINALIZED v4.1** |
| **Runtime (both engines)** | ❌ **NOT IMPLEMENTED** — live Inventory Replenishment `IRMap.needBuckets()` still returns 0; live Request Order rows are `_dbPlaceholder` with `suggestedOrder=null`. Nothing here is marked implemented. |
| **Executable Golden Tests** | ⏳ **PENDING** — the **40-scenario** Golden Scenario Matrix is specified in `SUPPLY_PLANNING_CALCULATION_RULES.md` §33 (#1–#34 + Avg-Sales #35–#40); no executable test was built. |
| **Browser / Production verification** | ⏳ **PENDING** — no runtime exists to verify. |
| **Daily Sales source (Avg Sales/day)** | **Canonical Requirement: latest 90 completed days** (`AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` §7.4). **Config 4 gap-aware importer is IMPLEMENTED IN REPOSITORY SOURCE** (2026-07-21: `06_amazon_import_config.gs` `retentionDays/lookbackDays = 90`, `reconcileRecentDays: 3`, `incrementalDefaultDays: 1` legacy-only; `amazonReadDailyGapAware_` coverage inspection + rolling upsert; latest-per-group fallback removed). **PENDING:** Apps Script production redeploy · live `import_sync_runs` column confirmation · one-time historical gap recovery/backfill · daily trigger confirmation · live BigQuery/Google Sheet verification. This importer Runtime is a **different scope** from the Supply Planning Calculation Runtime (still NOT IMPLEMENTED). BigQuery full history = future long-term store, **not** a Phase-1 prerequisite. |

**Authoritative formula owner:** [`docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md`](../../../docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md) **v4.1 FINALIZED** (sole formula owner). All other specs reference it; none restate a divergent formula.

**Avg. Sales/day contract (v4.1):** search backward within the **latest 90 completed calendar days** and collect the **latest 30 eligible normal sales days** (excluding this SKU's Campaign/Special-Event days, per-SKU participation, overlap once, cancelled events not counted, prep-date not a contamination period); divide by the **actual** normal-day count (never fixed 30); confirmed zero-day counts, missing day ≠ 0. Golden Scenarios §33 #35–#40.

**v4.1 residual cleanup this round (documentation only):** owner Header/Changelog/Footer + all section-status footers unified to **v4.1**; §22.6 "30-day snapshot" wording corrected to the 90→30-normal rule; §20.4/§20.6 stale calculation Open Items resolved (→ owner sections); §33 declared as **40** scenarios; `AMAZON_SNAPSHOT_IMPORT_MAPPING_SPEC.md` Daily Sales config reconciled to `retentionDays/lookbackDays: 90` (spec) with an explicit **runtime gap** note; `DATABASE_RELATIONSHIP_MAP.md` / `SUPPLY_CHAIN_SYSTEM_FLOW.md` owner pointers → v4.1; `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` MOQ demoted to Future Extension, Suggested Order Qty = CEILING full-carton, User Order Qty explicit partial-carton override (no Send block; missing UPC blocks), T4 = display-only (no payload), owner pointer → v4.1; `INVENTORY_TABLE_MAPPING_SPEC.md` §14/§15 restated as owner-pointing summaries, §21 calculation Open Questions closed, version → v1.5.7.

**Final Cross-Document Residual Cleanup Round 4 — documentation only (2026-07-24):**
- Owner §15/§16 no longer label the **existing** `purchase_orders` lifecycle as "Future" — restated as the live downstream user-decision/conversion layer with the persistence layering (live preview not persisted · shipping recommendation → `shipping_allocation_drafts`/`_lines` · monthly/emergency → `request_order_allocation_drafts`/`_lines` · Request Order/PO only after an explicit user decision; schema owned by `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`).
- Purchase Order canonical status field = **`purchase_orders.order_status`** (RO&PO §6.1 auto-closure + §12.4 Ongoing-Orders query corrected); legacy `status` = read-compatibility fallback only, never written.
- Avg Sales/day is managed **exclusively by Owner §22** (owner §20.3 stale `sales_units_7d ÷ 7 / engine-defined run-rate` second entry point removed).
- Shipping-allocation-draft user quantity = **`planned_qty`** (`SHIPMENT_CENTER_SPEC.md` §2 rename note corrected); `recommended_qty` stays the immutable system snapshot; `shipment_draft_qty` / `qty` = legacy read/migration aliases only.
- Historical entries (Amazon 2026-07-01, Request Order 2026-07-02, Shipment 2026-07-13) marked HISTORICAL/SUPERSEDED where they held stale contracts; no history rewritten.
- No Runtime, UI, DB schema, API, Apps Script, or Tests changed this round.
- After Round-4 residual validation, repository-wide active contradiction count = **0** → **SPEC FREEZE PASS**.

> **Historical Record Policy.** Dated implementation entries below are retained as audit history. When a historical entry conflicts with §0 or an authoritative active spec, **§0 and the current authoritative spec govern**; superseded terminology is not an active contract. *(This policy does not excuse contradictions in an active spec — every active-spec contradiction is still corrected in-place.)*

**v4.1 residual SURGICAL repair (2026-07-24, later pass — documentation only, 5 files):** owner §2D result renamed `Suggested Qty` → **`Forecast-Driven Remaining Need`** (Engine A live shortage, explicitly **not** Suggested Order Qty — that exists only after Engine B `Net Order Need`); §20.5 Sales-Driven no longer names Engine A output "Suggested Qty"; §22.4/§20.5/§21.2 ownership pointers corrected (`INVENTORY §14/§15` = display/mapping only, **owner §2C/§2D governs**); Golden Scenario #6 now includes **− Approved/Committed Supply**; owner §24.10 + §36.2 and RO §12.13 exact monthly clock (5th/15:00) removed → **cadence-only**, exact schedule deferred to Runtime config; `INVENTORY §14/§15` second-formula code blocks removed → prose owner-pointing summaries (§14 mislabelled `Event[b]` line deleted); INVENTORY v4.0 residual → v4.1; RO/site-confirmation `planning_cycle` canonical monthly key = **`YYYY-MM`** (runtime-gap noted); RO `recommended_qty` placeholder reworded to persisted-Engine-B-snapshot / runtime NOT IMPLEMENTED; draft parent/line grain reconciled to the existing schema (SKU on parent, inherited by lines; no `sku` column added); AMAZON added the missing **v1.8 changelog** entry + Last Updated 2026-07-24 + footer v1.8, `backfill_days` ceiling 30→90, §7.4 item 9 false "Implemented by" claim → "components to verify/update", clear-and-rewrite vs `rolling_upsert` constrained to Configs 1–3 vs Config 4; project-current-state transitional T1 UI mapping annotated as a Runtime Gap (not canonical). **No Runtime / UI / test / DB schema / Apps Script changed; `DATABASE_RELATIONSHIP_MAP.md` and `SUPPLY_CHAIN_SYSTEM_FLOW.md` NOT touched this pass.**

**Blockers closed this round (formerly Calculation-Audit blockers):** two-engine separation kept · Demand/Supply Ledger grain frozen (§25, no new DB column) · exact-date windows `0–18/19–30/31–45/46–90` with boundary sweep (§26) · T1–T4 non-overlapping, T4 visibility-only (§27) · Factory Stock removed from destination projected balance (§8/§28) · standalone `Received Qty` double-deduction removed (§10.1/§30) · supply lifecycle count-once with 100-unit example (§30) · FBA vs 3PL separate buckets + platform participation in the 3PL reserve (§23.6/§24.9) · three allocation modes incl. PROTECTED_REALLOCATION frozen (§24.5–24.7) · company reallocation feasibility constraints (§32) · Shipment FLOOR / carton-adjusted Residual Production / Order CEILING with worked example (§31) · missing UPC blocks submit, no silent default (§14/§34) · missing/stale data never treated as 0 (§34) · Factory deterministic allocation order (§35). §19 Open Items reduced to non-blocking Future Extensions; header/changelog/footer version unified (v4.0 at that round, now **v4.1** — see the v4.1 cleanup note below); "subject to revision" removed.

**Secondary specs synced (canonical `.md` only):** `INVENTORY_TABLE_MAPPING_SPEC.md`, `DATABASE_RELATIONSHIP_MAP.md`, `SUPPLY_CHAIN_SYSTEM_FLOW.md` (platform / 3PL-reserve contradiction + stale version/footer), `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` (added owner pointer). `SYSTEM_RUNTIME_ARCHITECTURE.md`, `WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md`, `SHIPMENT_CENTER_SPEC.md`, `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` verified already consistent — no change.

**Future Extensions / Non-Blocking:** AI learning · dynamic Safety Stock · dynamic carrier/air-vs-sea optimization beyond §24.11 · intercompany accounting (SO/PO/AR/AP) · ERP `sales_orders` ownership · configured `TW_SHENGYI` preference · MOQ automation · BigQuery intelligence.

> Specification finalized. Runtime not implemented. Executable golden tests pending. No production behavior changed in this task. The next round may build the shared Demand/Supply Ledger and both engines directly from the frozen spec without further product-semantic decisions.

---

## 0.1 UI / Filter / Mapping Reconciliation — 2026-07-24 (this round)

Scope: Avg. Sales/day spec confirmation + Inventory Replenishment / Promotion Risk / Request Order / Carrier Rate Card UI & data-binding. **No calculation engine was built.**

| Item | Status |
|------|--------|
| **A — Avg. Sales/day spec** | **Specification FINALIZED (v4.1)** in `SUPPLY_PLANNING_CALCULATION_RULES.md` §22: Source Lookback = latest 90 completed days (today excluded); sample = latest 30 **eligible normal** days walked backward, excluding this SKU's Campaign/Special-Event days (per-SKU participation, overlap excluded once, cancelled events not counted, prep-date not a contamination period); divide by actual normal-day count (never fixed 30); confirmed zero-day counts, missing day ≠ 0. Golden Scenarios §33 #35–#40 added. **Runtime: NOT IMPLEMENTED. Executable Test: PENDING.** |
| **B — Inventory Replenishment UI** | Implementation: **COMPLETED**. Removed `(待開發) Inventory Overview` placeholder; Series filter → Category filter (`sku_details.category`, matches Request Order); removed first-layer Planned Qty column and moved the gear into the Suggested Qty cell (keyboard + `aria-label`, `plannedQty` state/payload preserved, editing retained in 2nd-layer Execution Plan); 2nd-layer Forecast Breakdown + Upcoming Event group shrunk ~20% (240→192px), freed width redistributed. |
| **C — Marketplace identity** | Implementation: **COMPLETED**. IR + Request Order + Promotion Risk marketplace dropdowns now use **value = `marketplace_id`**, **label = `marketplace_display_name`**; company/country/marketplace derived from the resolved `marketplace_id` record; mapping-integrity `console.warn` on master vs `marketplace_skus` disagreement (no silent first-row pick). |
| **D — Company filter removal** | Implementation: **COMPLETED** on Inventory Replenishment + Promotion Risk (company derived from `marketplace_id`, never a visible control). Request Order had no Company filter — none added. Company retained as internal canonical field; no cross-company data mixing. |
| **E — Request Order CA/Amazon bug** | Implementation: **COMPLETED**. Root cause: identity keyed on the display string `"Amazon"` + blank-snapshot wildcard leak. Fixed: rows carry `marketplace_id`; filter keys on it; Country change prunes incompatible marketplace selection; strict site scoping in `siteStock`/`thirdParty` (no blank-country wildcard). Regression test added. |
| **F — Carrier Rate Card filters** | Implementation: **COMPLETED**. Date = self-contained range picker matching Forecast Review's contract (no change to Forecast Review); Country Ship To / Method / Last Mile / Carrier dropdowns are data-derived from `carrier_rate_cards`; Carrier value = `carrier_id`, label = `carrier_name` (Unmapped fallback + warning); dependent (faceted) filters with downstream reset. |
| **Automated Tests** | **PASS** — all 14 `assets/tests/*.test.js` pass (incl. new `request-order-marketplace-identity.test.js`, `carrier-rate-card.test.js`); `node --check` OK on all 4 page scripts. |
| **Browser Verification** | **MANUAL VERIFICATION PENDING** — no browser environment in this round; not marked VERIFIED. |
| **Calculation Engine** | **NOT IMPLEMENTED** (unchanged; live Replenishment `needBuckets()` = 0, Request Order rows `_dbPlaceholder`). |
| **DB Schema / Apps Script** | **No change.** |

> Marketplace identity uses `marketplace_id`; display labels use `marketplace_display_name`; Company remains internally derived and was not removed from the data model; no DB schema changed; the full Supply Planning calculation engine was not implemented.

---

## 0.2 IR / Request Order / Promotion Risk UI polish + Sidebar disable — 2026-07-24 (this round)

Front-end UI / interaction / navigation-disabled only. **No** Supply Planning calculation formula, DB schema, or Apps Script changed. Implementation **COMPLETED**; Automated Tests **PASS** (16/16 `assets/tests/*.test.js`, `node --check` OK on IR/RO/CR/CRC/app.js); Browser Verification **MANUAL VERIFICATION PENDING** (no browser env — not marked VERIFIED); Calculation Engine **NOT IMPLEMENTED** (unchanged).

| Area | Result |
|------|--------|
| **A1 IR header** | Root cause: after the prior "Planned Qty" leaf removal, the `Replenishment` group width stayed 360px (3 leaves). Fixed to 240px (2 leaves: Days of Supply, Suggested Qty); Factory Stock spans CN, TW; leaf/body/`data-leaf-span` consistent. |
| **A2 IR chevron + gear** | Native `<button>` chevron left of SKU (`aria-expanded`/`aria-controls`/`aria-label`, Enter/Space, rotate state); gear removed from Suggested Qty cell; whole-row toggle with interactive-target guard + chevron `stopPropagation`. |
| **A3 IR left/right sync** | Single `currentExpandedRow` (canonical key prefers `marketplace_sku_id`); one toggle handler applies expanded class to both fixed + scroll sides in the same pass; one shared height/chart timeout; rapid-click desync impossible. |
| **A4 IR Category parity** | IR Category tabs restyled to Request Order tokens (blue `#3B82F6` active, same border/radius/height/padding/font/hover); logic unchanged. |
| **A5 IR Planning Model** | Visible `Status` → **Planning Model**; shared formatter `sales_driven`→`Sales`, `forecast_driven`→`Forecast`; canonical values kept; genuine SKU lifecycle Status field untouched. |
| **A6 IR More Options** | Restyled to SKU Details' neutral tokens (removed saturated orange); interaction/keyboard/click-outside unchanged; SKU Details untouched. |
| **B1 RO Achievement & Forecast** | Grid track 300px→**345px** (+15%); redistributed from Factory Supply 260→215; Order Allocation kept 360px; tablet forecast 300→345. |
| **B2 RO Carton header** | Title now just `Carton` (removed `(x/ctn)`); carton math / `units_per_carton` / Suggested / User Qty / payload / partial-carton unchanged. |
| **B3 RO Marketplace grouping** | Channel-only display (`marketplace_display_name`, no country suffix); each display group resolves to a `marketplace_id` **set** (`marketplaceGroups` + `_roSelectedMarketplaceIdSet`); filter/payload use ids; Country-dependent; US/CA/All cases + 9 regression assertions added to `request-order-marketplace-identity.test.js`. |
| **C Promotion Risk toolbar** | `align-items: flex-end` + unified control height (34→36px); CSS-only; no filter/identity logic change. |
| **D Sidebar Overseas Inbound/Outbound** | Non-interactive (onclick removed + scoped `showSection` guard + `aria-disabled` + `tabindex=-1` + existing `.menu-item--disabled` style); pages/routes preserved; `sidebar-overseas-disabled.test.js` added. |

**Canonical decisions applied:** (1) Planning Model label + Sales/Forecast display, canonical values retained. (2) Marketplace shows channel-only display grouped by `marketplace_display_name`; `marketplace_id` remains the sole relational identity; Company derived from each marketplace master; CA Amazon cannot fall back to US/blank-country snapshots.

> No runtime, DB schema, or Apps Script changed. Overseas Inbound/Outbound remain present but temporarily non-interactive. Suggested Qty / Suggested Order Qty calculations unchanged. Browser verification PENDING (not VERIFIED).

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

> **SUPERSEDED by the 2026-07-21 gap-aware 90-completed-day implementation** (`06_amazon_import_config.gs` `retentionDays/lookbackDays = 90`; `amazonReadDailyGapAware_`; latest-per-group fallback removed). The text below (`default 1 = yesterday`, `30-day retention`, per-group fallback) is retained **only as historical implementation provenance** and is **not** the current Config 4 contract.

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
- **Real source mapping (Parts 2–6)** in `_buildRequestOrderRowsFromDb()` (added `_roNextMonths`/`_roPastMonths` runtime month helper): **Basic(T3)** = Σ `fc_regular_forecast` next 3 months (sku+country+marketplace, per-year); **Site Stock** = latest `amazon_inventory_snapshot` (available+fc_transfer+fc_processing); **3rd Party** = Σ `overseas_inventory_snapshot.available_stock` same-country non-factory WH; **Factory Stock** = Σ `factory_stock.current_stock` (unchanged, Part 4); **Ongoing Orders** = Σ open-PO remaining_qty (`purchase_order_lines` ⋈ `purchase_orders.status ∈ open set` *(HISTORICAL 2026-07-02 legacy wording; the current canonical DB field is `purchase_orders.order_status` — legacy `status` is read-compatibility only; Runtime not modified this round)*; per-SKU, best-effort); **Lead Time** = `supplier_price_list.lead_time_days` (active row, latest effective_from). Missing source → `--` (never fabricated).
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

**Docs:** REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC §3.6 (`shipping_allocation_drafts*` — spec only) + §3.7 (`request_order_allocation_drafts*` — implemented); DATABASE_RELATIONSHIP_MAP §7.5 (draft layers, relationships). Both draft layers are **planning scratchpads — no stock movement / reservation**. Status enum draft/site_confirmed/submitted/cancelled. *(SUPERSEDED by the 2026-07-27 Canonical Schema Sync: the four table headers were resynced to the manually-finalized Live DB; the header status enum now also includes `partially_submitted`, and per-line `line_status` = draft/submitted/cancelled. See the 2026-07-27 entry for the canonical field set — §0 and RO&PO §3.6/§3.7 govern.)*

> **Transitional UI bucket mapping (historical, this 2026-07-03 entry):** the second-layer UI at the time mapped buckets loosely as `T1 = next month, T2 = next 2 months, T3 = next 3 months`. **This is NOT the canonical tier contract** and must not be read as canonical. **Canonical (owner `SUPPLY_PLANNING_CALCULATION_RULES.md` §27):** `T1 = current-month remaining period + Month+1 · T2 = Month+2 · T3 = Month+3 · T4 = Month+4 visibility-only` (non-overlapping; Month+1 counted only in T1). Aligning the UI runtime to the canonical tier windows is a **Runtime Gap — PENDING IMPLEMENTATION AND BROWSER VERIFICATION** (Runtime was not changed to achieve this; the historical entry is retained as implementation history, not rewritten).

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
- **Six canonical renames (writes use new names only; legacy = read-fallback; NEVER re-ensured):** `shipping_allocation_draft_lines.qty → shipment_draft_qty` *(SUPERSEDED: `shipment_draft_qty` was an interim canonical name; the current canonical user-decision field is **`planned_qty`** (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6), with `recommended_qty` the separate immutable system snapshot; `shipment_draft_qty` and `qty` are legacy read/migration aliases only — spec-only table, no runtime writer existed at the time)*; `shipping_plan_lines.carton_qty → plan_carton_qty` (`11_shipping_plan_handlers.gs` header + `createShippingPlansBatch` writer + `updateShippingPlanLineQty` write, column auto-ensured); `shipments.total_qty/total_cartons/total_cbm → shipment_total_qty/shipment_total_cartons/shipment_total_cbm` and `shipment_lines.carton_qty → shipment_carton_qty` (`12_shipment_handlers.gs` headers, editable list, totals write, ship-gate read-fallback, plan-line read-fallback, column auto-ensure). Header weights (`total_gross_weight`/`total_net_weight`) NOT renamed.
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

## 2026-07-22 — Future dual-direction fulfillment orchestration relationship added to Warehouse specs (SPEC + DB-DESIGN + UI-SPEC SYNC ONLY; no code/DB/Runtime/redeploy)
- **Scope:** spec sync only. No frontend/runtime/API/Apps Script; no DB tables/migration; no redeploy; route-template reference data untouched.
- **Terminology boundary preserved:** the **Overseas Inbound Receiving Operation does NOT create/push the origin Shipout Instruction, does not own factory shipout creation, and is not the planning SSOT.** The **Formal Shipment orchestrator** idempotently creates/links **both** the destination Inbound and the origin Shipout Instruction (intent SSOT = Inbound Planning Request; execution SSOT = Formal Shipment).
- **New canonical section `SHIPMENT_CENTER_SPEC.md` §23.11** — Dual-Direction Fulfillment Orchestration (FUTURE; Phase-1 MANUAL): 9-step future flow (Planning Request → Formal Shipment → dest Inbound + origin Shipout → external submission → label retrieval → **Factory Shipping Package** → factory shipment → receiving → receipt confirmation posts good qty only), Phase-1 manual boundary, the "origin Shipout Instruction" generalization (overseas Outbound op when origin=overseas WH; factory shipout instruction when origin=factory), simplified visual, DB-compat field list, Doc-Engine attachment rule, NOT-implemented list.
- **8 idempotency scopes** (was 5) synced across `SHIPMENT_CENTER §23.11`, `OVERSEAS_INBOUND §10.8`, `OVERSEAS_OUTBOUND §10`, `WAREHOUSE_OPERATIONS §7`, `DATABASE_RELATIONSHIP_MAP §8C`: dest-inbound create/link · dest-inbound external submission · label/document retrieval · origin-shipout create/link · origin-shipout instruction submission · receipt confirmation · shipout confirmation · reversal/correction (never one shared key).
- **DB compatibility (planned additive, not created):** operation headers gain a compatible home for `source_type`, `source_request_id`, cross-links `destination_inbound_operation_id`↔`origin_shipout_operation_id`, `external_inbound_id`/`external_inbound_reference`, `submission_mode`/`submission_status`/`submitted_at`, `label_status`/`label_retrieved_at`, `last_api_attempt_at`/`last_api_error` (`shipment_id` already exists). Added to `OVERSEAS_INBOUND §10.1` + `OVERSEAS_OUTBOUND §3` + `DATABASE_RELATIONSHIP_MAP §8C`.
- **Attachment rule:** labels / carton-labels / appointment documents reference the **Document Engine** (`generated_documents.related_entity_type = overseas_inbound_operation | overseas_outbound_operation`, `related_entity_id`, `document_id`; DOC-GEN §D) — **binary content NEVER stored in the operation header.**
- **Visual updated:** `SUPPLY_CHAIN_SYSTEM_FLOW.md §5.7` gained the dual-direction future diagram (dest Inbound + origin Shipout → Factory Shipping Package → factory shipment → receiving → inventory). `SYSTEM_RUNTIME_ARCHITECTURE` module-boundary note added (orchestrator creates both; Inbound never creates Shipout; 8 idempotency scopes; Doc-Engine attachments; Phase-1 manual).
- **Contradictions:** repository-wide audit found **NO active contradiction** (every active statement already makes the Formal Shipment the sole creator of both directions; the only "inbound-first" wording is already SUPERSEDED). Nothing rewritten — additive only; historical/changelog statements preserved.
- **Inventory boundary reaffirmed:** receipt confirmation posts only confirmed **good** qty to Overseas Inventory (damaged never sellable); Delivered ≠ Received; no reservation/deduction in Phase-1.

## 2026-07-22 — Recommendation Summary / Execution Plan UI + shipping_allocation_drafts persistence layer (FRONTEND + Apps Script SOURCE; formal engine NOT activated; backend deploy pending)
- **Scope:** UI + persistence-layer source. Formal Net-Replenishment / four-mode gap / weekly generation / auto route recommendation / auto production calc all remain **OFF**. No Shipment/PO logic changed. No redeploy. `node --check` OK on `inventory-replenishment.js`, `operation-system-db-api.js`, and `16_shipping_allocation_handlers.gs`.
- **Layout (§11.5):** re-organized the expanded row into **Analysis area** (insight column = Sales Trend + **Monthly Achievement Rate directly below it** — card renamed from "Achievement Rate (Past 3 Months)") and **Decision area** (action column `.ir-decision-area` = **Recommendation Summary stacked directly above Execution Plan**, same width, technically separate). Superseded the old v3 A/B/C/D split.
- **Recommendation Summary:** now the FINAL **5 columns — Window / Calculated Gap / Recommended Qty / Route / Reason** (was 4). Read-only; hydrates from the persisted Draft snapshot (`_recDraftLines` via `_shippingDraftLinesFor(scope)`) when one exists; otherwise renders an **honest "No recommendation generated" empty state** (engine inactive — never fabricates qty). Route derived from `recommended_shipping_method`/`last_mile` (no persisted display string). Special-event badge on affected windows; event qty in Reason. Header bg `rgb(255,248,240)`.
- **Execution Plan:** added **Expected Arrival** column immediately after Method → `From / To / Qty / Method / Expected Arrival / Action`. ETA priority runtime→formal→`carrier_lead_times` estimate; in planning it uses `getCarrierLeadTimes()` avg_days from today by dest-country + mapped method; **missing lead time → "Lead time unavailable"** (never fabricated). Recalculates on From/To/Method change. Route-template node offsets NOT used.
- **Persistence layer (NEW, source-complete):** `16_shipping_allocation_handlers.gs` (`shipping_allocation_drafts` + `_draft_lines` canonical headers per RO&PO §3.6; `handleUpsertShippingAllocationDraft_` idempotent by id / uniqueness key; `handleUpsertShippingAllocationDraftLines_` **UPSERT-by-line** that PROTECTS `recommended_*` on refresh and inits `planned_qty=recommended_qty` on create; `handleSubmitShippingAllocationDrafts_`) + 3 router actions + frontend normalizers (`normalizeShippingAllocationDraft*`, recommended_qty/planned_qty canonical with recommand_shipment_draft_qty/shipment_draft_qty/qty legacy read-aliases) + cache registration + accessors (`getShippingAllocationDrafts`/`Lines`) + writers (`upsertShippingAllocationDraft`/`Lines`, `submitShippingAllocationDrafts`). **`generation_type` (not source_type); MUST-NOT-store uncovered_qty/coverage_status/window_label/display strings.**
- **Persistence semantics:** Persisted Draft = SSOT (§11.4). `km_replen_alloc_draft_v1` sessionStorage remains **transient recovery only**. Working-Draft rows now carry `planned_qty` (= user qty) separate from the immutable `recommended_qty` snapshot (which lives read-only in `_recDraftLines`). Submit Plan (`submitReplenishmentPlans` → `createShippingPlansBatch`) still reads **only** the Execution Plan — never the Recommendation Summary, never the DOM (unchanged).
- **BACKEND DEPLOY PENDING (do-not-redeploy):** the `shipping_allocation_drafts` tables + handlers are source-complete but **not deployed** — until an authorized redeploy runs, live DB persistence is inactive and reload-persistence is via sessionStorage recovery (transient). Writers return `{success:false}` when the API is unconfigured and the UI keeps the sessionStorage fallback (honest, no fake success).

## 2026-07-22 — 3rd Party Stock DB mapping + 18-day virtual planning allocation in Inventory Replenishment (FRONTEND SOURCE + 1 normalizer field; display/analysis only; no DB/movement/redeploy)
- **Scope:** planning/display allocation only. No inventory movement, no reserve, no `overseas_inventory_snapshot` write, no second SSOT, no replenishment recommendations enabled. `node --check` OK on `inventory-replenishment.js` + `operation-system-db-api.js`. Physical DB values unchanged.
- **Eligibility (strict, per §20/§24):** `IRMap.eligible3plWarehouses` — `warehouses.company = scope company` AND `country = scope country` AND `warehouse_type='3PL'` AND `is_active === TRUE` (tri-state `_whBool`; blank/unknown excluded). Join physical stock by `warehouse_id + sku` only (never `warehouse_name`/display text).
- **Shared pool:** `IRMap.sharedPhysicalPool` = SUM(`wh_available_stock`) over eligible 3PL warehouses for company+country+Master SKU, **deduped by `warehouse_id`** (never by marketplace → no double-count), retaining warehouse-level contributions + a source snapshot timestamp (`snapshot_date`→`last_movement_at`→`updated_at`→`created_at`). Added `snapshotDate` to the overseas normalizer.
- **18-day allocation engine** `IRMap.sitePlanningAllocation` + `_allocateShared` (§24): `minimum_18d_need_i = CEILING(daily_demand_i × 18)`; daily demand = §22 Avg Sales/Day (sales-driven) or forecast→daily fc60/60 (forecast-driven). **NORMAL** (pool ≥ Σ18d): each eligible site protected to its 18-day need, surplus stays **Unallocated Pool**. **SHORTAGE** (pool < Σ18d): §24.7 weighted (`18d_need × MAX(priority,1)`) largest-remainder, **deterministic tie-break = (1) higher allocation_priority, (2) larger unmet 18-day need, (3) stable marketplace key**; caps at need; warns on 0-allocation starvation. Invariants enforced: `Σ ≤ pool`, each ≤ its 18-day need, non-negative integers, repeatable for the same snapshot. Only `platform_fulfilled` sites are excluded from the pool (§24.1).
- **Display:** 3rd Party Stock primary = **Site Planning Available** (current site's allocation), not the raw pool. Results-table cell shows the value/state + hover tooltip; expand card shows Site Planning Available · Physical 3PL Pool · 18-Day Protected Need · Allocation Basis/Mode · Allocated to Other Sites · Unallocated Pool · Coverage Rate (shortage) · Snapshot As Of · contributing warehouse names+qty.
- **Missing-data (never a fabricated zero):** `NO_ELIGIBLE_3PL` → "No 3PL"; `MISSING_SNAPSHOT` (eligible WH but no snapshot row for the SKU) → "No Data"; `NOT_SELF_FULFILLED` (platform) → "—" + note. Demo/mock path unchanged (falls back to Winit/ONUS).
- **Known spec gap (reported, not invented):** §24.5-step-3 / Mode-B distribution of surplus BEYOND the 18-day floor requires the site's *applicable calculated Need* (Suggested-Qty engine), which is not implemented and which this task must not enable → Phase-1 allocates up to the 18-day protected need only; surplus is shown as Unallocated Pool. The FC-share / sales-run-rate remainder weighting is specced (§24.5/§7) but inert until the Need engine lands. §20.4/§23 defer the NORMAL-mode ultimate tie-break to Open Items; the deterministic §24.7 order is used where a tie-break is needed (shortage).

## 2026-07-22 — FC Summary: 5 approved improvements (FRONTEND SOURCE + normalizer; recommendation engine NOT activated; no redeploy)
- **Scope:** frontend + one API normalizer field. No weekly recommendation generation, no Recommendation Summary calc, no replenishment-formula change, no regular↔special-event FC mixing. `node --check` OK on `fc-summary.js`, `inventory-replenishment.js`, `operation-system-db-api.js`.
- **#1 Dynamic Upcoming Event card** (Inventory Replenishment, per user choice): rewrote `IRMap.upcomingEvents(events, scope)` — date eligibility `event_end_date >= today AND event_start_date < first_day_of_month(today+4mo)`, active + scope match (country/marketplace + sku/scopeType); legacy rows w/o dates fall back to month-window (never dropped). New `_irRenderUpcoming()` shows nearest event (name + start/end + fc_qty) then expandable `<details>` "+N more"; events NOT merged (records stay separate). `upcomingEventQty` = Σ matched (count-once). Demo/mock path unchanged.
- **#2 Series multiselect** (Special Event batch mode): added outside-click + Escape closers (bound once, event-modal-scoped), stopPropagation on toggle, checkbox change no longer closes, Build/Refresh + modal close + reopen all reset panel state via `_evtCloseAllMs()`.
- **#3 Event Period → date inputs:** replaced free-text `#event-period-input` with `#event-start-date` + `#event-end-date` (type=date, accessible); `_evtValidatePeriod()` blocks Save when start>end (inline `role=alert` message), derives Target Year from Start date; Save composes `event_period` (start~end) + sends `event_start_date`/`event_end_date` in campaign + fc payloads. Normalizer `normalizeFcSpecialEventRecord` now exposes `eventStartDate`/`eventEndDate` (real columns, else parsed from `event_period`) + `status`.
- **#4 Special Event Forecast Assist:** added Assist Method select — Apply Growth Rate / Adjust from Base Forecast (percent or fixed ±) / Manual Entry — with a preview table (Base/Old → New → Difference per group). Preview-only pre-fill; never auto-saves; Save stays explicit.
- **#5 Regular Forecast Builder:** redesigned the Regular modal → Builder Mode (Single SKU / Category-Series), Target Year + **Target Month**, methods (Apply Growth Rate w/ Base Year+Month / Adjust from Previous Month / Manual Entry). `_regularBuildPreview()` lists affected SKUs (Old→New→Diff) + affected count; **only the selected Target Month is written, other months preserved** (row rebuilt from existing months); **blank Manual = Skip**, explicit **0** = zero; Save = idempotent bulk `importFcRegularForecastBatch` (business-key upsert, preserves `forecast_id`) → `fc_regular_forecast` only. Demo path updates in-memory single month.
- **NOT implemented / pending backend (no redeploy):** `event_start_date`/`event_end_date` columns are sent in the payload but the Apps Script `fc_special_events` header must be extended to persist them (currently dropped by the header writer) — flagged. Special-event Save on live still reports PENDING (campaign/campaign_sku_line writers absent — unchanged; not part of this task). BQ actual-sales source for growth is not used (growth bases on existing forecast, per approved design).

## 2026-07-23 — Canonical MD sync: Phase 1A / Phase 2 / Phase 2+ boundaries + CAR_SINOTRANS = Completed/Active + event_fc_id backfill dry-run (MD + minimal Apps Script source; REDEPLOY PENDING; no calc/schema/other-carrier change)
**Doc-sync round. No Runtime scope expansion beyond the event_fc_id backfill dry-run. No Forecast / Inventory / Order / Special-FC / Target-Rule / month-attribution formula changed; no Carrier schema or other-carrier data changed.**
- **Phase boundaries (CANONICAL):** codified **Login ≠ Permission ≠ Deployment URL** across `SYSTEM_ROADMAP.md`, `SUPPLY_CHAIN_SYSTEM_FLOW.md` §1A, and `KITCHEN_MAMA_OPERATION_SYSTEM_BLUEPRINT.md`.
  - **Phase 1A (Go-Live target):** Supply Chain Closed Loop (P1-A…P1-G) → **GitHub deployment (system URL)** → controlled internal trial by approved employees. GitHub deploy = delivery/access entry, **not** auth. **NOT blocked by** Google Login / Gmail / full RBAC / DB Capacity Monitor. "Knowing the URL" is **not** a security control. **No** Client Secret / Refresh Token / API credential / sensitive data in frontend / repo / Sheet / public env; environment isolation + controlled sharing + minimal exposure retained; no login/permission runtime invented this round.
  - **Phase 2 (was P1-H → P2-A):** Google Identity/Login, `users`/`roles`/`permissions`/`user_roles`/`role_permissions`, backend token verification + KM session, API permission enforcement, company/country/marketplace/warehouse data scope, Admin User Management, login/security audit, **+ DB Capacity Monitor** (same phase). No longer listed as a Phase-1A/closed-loop completion requirement.
  - **Phase 2+:** role-based system notification email (after Role & Permission); then a **separate** personal Gmail Connect (Gmail read / attachment sync / Amazon Case threads). **Google Login ≠ Gmail access.** No hard-coded Admin recipient email in Phase 1A.
  - Roadmap table rows updated: P1-G "before **Phase-1A** Go-Live"; **P1-I** = Phase-1A Go-Live via GitHub deploy (not login-gated); **P2-A** (was P1-H); **P2+** added.
- **CAR_SINOTRANS (中外運) = COMPLETED / ACTIVE** (no longer Pending; do NOT recreate): `CARRIER_AND_ROUTE_SPEC.md` "Provisioned Carriers" rewritten to the real live values — carrier_name **中外運**; route **CN(Shenzhen)→JP**; `shipping_method=Air`, `last_mile_delivery=Parcel`, `shipping_method_label=空派`; `charge_type/unit=weight/kg`; `currency=RMB`; `unit_rate=42`; battery `no_battery`+`lithium_battery`; `transit_type=door_to_door`; `customs_type=third_party_customs`; `effective_from=2026-07-01`; `status=active`; **`lead_time_id=CLT-000017`** (5/8/7). Rate card (`CRC-…`) + lead time already live; **not modified/recreated**. Canonical mode mapping kept (Air + Parcel; no "Express" enum, not merged). `carrier_rate_cards` ↔ `carrier_lead_times` stay independent (Lead Time never written back to Rate Card). The idempotent seed `handleSeedSinotransCarrier_` is now a **no-op fallback** (carrier_name→中外運, currency→RMB; skips existing rows). **Still genuinely pending:** the 中外運 **Booking Form / Document Template** mapping (`CARRIER_BOOKING_MAPPING_SPEC.md` "SINOTRANS = next") — Carrier **Rate** complete ≠ Document Template complete.
- **event_fc_id backfill dry-run:** `handleBackfillFcSpecialEventIds_` is now **DRY-RUN by default** (reports would_fill / skipped_no_campaign [ambiguous] / collision_duplicate_business_key / sample; writes nothing) and executes only with `{confirm:true}`; standalone, re-runnable, never auto-runs. (The event_fc_id generation/idempotency fix itself shipped 2026-07-22; unchanged.)
- **Conflicts removed:** P1-H "Login/Google/Gmail" no longer reads as a Phase-1 Go-Live gate (moved to Phase 2); DB Capacity Monitor backlog reference updated P1-H→P2-A; CAR_SINOTRANS "no rate card / price pending" corrected to Completed/Active (prior state-log line marked SUPERSEDED). **Preserved intentionally:** the Booking-Form "SINOTRANS = next" (genuinely pending) and all future Gmail-automation-in-Import-Framework notes (Phase 2+, not login).
- **Files:** `assets/specs/active/SYSTEM_ROADMAP.md`, `docs/planning/{SUPPLY_CHAIN_SYSTEM_FLOW,KITCHEN_MAMA_OPERATION_SYSTEM_BLUEPRINT,CARRIER_AND_ROUTE_SPEC,FC_SUMMARY_SPEC}.md`, `assets/specs/active/apps-script/{14_fc_write_handlers,17_carrier_handlers}.gs`, this file. `node --check` clean on the `.gs`; scope-isolation test passes.

## 2026-07-22 — Special Event `event_fc_id` generation fix + CAR_SINOTRANS carrier provisioning (APPS SCRIPT SOURCE + FRONTEND + MD; REDEPLOY PENDING; no fake quotes; no Forecast/Carrier-schema change)
**No existing Forecast formula / Campaign logic / Carrier schema / other-carrier data changed. No fake 中外運 price invented.**
- **A · `event_fc_id` root cause + fix:** the writer used **`event_id`** as PK while the canonical `fc_special_events` PK is **`event_fc_id`** (FC_SUMMARY_SPEC §3.1) — so `fcWriteEnsureColumns_` appended a stray `event_id` column and the real `event_fc_id` stayed **blank**. Fix (`14_fc_write_handlers.gs`): header PK aligned to `event_fc_id`; new `fcSpecialEventUpsert_` + `fcSpecialEventFindRowByKey_`. **event_fc_id is generated by the BACKEND** (`EFC-<12-hex>`, canonical `PREFIX-UUID` pattern) — the frontend no longer fabricates/sends any id. **Create:** new `EFC-` id, uniqueness inherent (find-or-generate). **Update:** existing id **preserved** (never regenerated by fc_qty/date/name); a blank legacy id is inline-backfilled on the row being saved. **Retry/double-click idempotency:** stable business key **campaign_id + campaign_sku_line_id** (fallback `campaign_id + marketplace_id + sku + event_month + year`) → updates the SAME row, no duplicate. **Validation** before write: campaign_id, sku/scope_id, event_name, numeric fc_qty ≥ 0. **Legacy blank rows:** read-only `auditFcSpecialEventIds` (counts + re-identifiability + dup business keys) + one-time manual `backfillFcSpecialEventIds` (`{confirm:true}`; assigns ids only to blank rows with a campaign_id) — **neither auto-runs**. Frontend (`saveEventUpdate`) drops the fabricated `event_id`; normalizer reads `event_fc_id` (legacy `event_id` fallback). Router actions added. **Apps Script redeploy PENDING** (deployed writer still uses `event_id` until then).
- **B · CAR_SINOTRANS (中外運) CN→JP Air+Express:** [**SUPERSEDED 2026-07-23 — now COMPLETED/ACTIVE, not pending; see the 2026-07-23 entry above.** The "no rate card / price pending / seed-to-create" wording below is historical.] `carriers` / `carrier_lead_times` are manually-maintained (no importer, no repo data). Added a bounded, idempotent, **manual-invoke** seed `handleSeedSinotransCarrier_` (router `seedSinotransCarrier`, `17_carrier_handlers.gs`) that appends — if absent — the **carrier** and one **carrier_lead_times** row (`CN→JP`, `shipping_method=Air`, `last_mile_delivery=Parcel`, min 5 / max 8 / avg 7 calendar days). **Mode mapping:** Air = `shipping_method`; Express/Courier = canonical last-mile **`Parcel`** (schema has no "Express" enum; no conflicting enum invented). Scope strictly CN→JP only.
- **Files:** `assets/specs/active/apps-script/{14_fc_write_handlers,01_router,17_carrier_handlers}.gs`; `assets/js/pages/fc-summary.js`; `assets/js/api/operation-system-db-api.js`; `docs/planning/{FC_SUMMARY_SPEC,DATABASE_RELATIONSHIP_MAP,CARRIER_AND_ROUTE_SPEC}.md`. `node --check` clean on all JS + `.gs`; scope-isolation test passes. **Confirmed unchanged:** Forecast calc formulas, Campaign logic, Carrier schema, other carriers' data.

## 2026-07-22 — Monthly Achievement de-mock + Request Order filter/upcoming-events fixes + DB Capacity Monitor spec (FRONTEND + MD; no backend/DB/redeploy; no calc-formula change)
**Minimal-scope fixes. No fake data / Demo fallback added; no Achievement formula invented; FC / order / inventory / allocation calc logic unchanged; DB Capacity Monitor is docs-only.**
- **一 · Monthly Achievement Rate (Inventory Replenishment) de-mocked:** removed the random-percentage chart (`initAchievementChart` neutered to a no-op; `Math.random()` achievement values no longer used). Replaced with an honest read-only **table** for the **past 3 COMPLETED months** via new `getPreviousCompletedMonths(referenceDate, 3)` (excludes the current partial month; handles year rollover — e.g. Feb 2026 → Nov 2025 / Dec 2025 / Jan 2026; label "Mon YYYY"). Columns Month / Achievement / FC Qty / Actual / Sessions / USP: Achievement / Actual / Sessions / USP show **"—"** (never 0%, never mock) via placeholder `getMonthlyAchievementMetrics({...})` which returns an explicit unavailable state and **computes nothing**; **FC Qty** shows real historical `fc_regular_forecast` (company-safe) when present, else "—". Achievement formula deferred until formally defined (single wiring point = `getMonthlyAchievementMetrics`).
- **二 · Request Order filter interactivity:** `_applyRequestOrderFilters` changed from **OR → AND** across Country / Marketplace / Risk / SKU (empty selection = unconstrained); applied to the single `requestOrderState.data` row model → `renderRequestOrderTable`. Added **expanded-row reconciliation** (a filtered-out expanded SKU's detail card is now closed — no stale card from a previous SKU; identity `sku|company|country|marketplace`). Added a **Clear Filters** button + `clearRequestOrderFilters()` (resets filters + Category tab + Show + dropdowns + SKU input, re-renders full set, no DB re-fetch). Added a **"No matching SKUs"** filtered-empty state (distinct from the no-source-data state). SKU input now filters live (`oninput`). **Note:** Request Order has no Series filter (Category is a TAB; Series was replaced by Category tabs) → the Category→Series dependent-dropdown requirement is N/A on this page (it was implemented on FC Summary in the prior round).
- **三 · Request Order Upcoming Events ← Special FC:** source stays canonical **`fc_special_events`** (no campaigns-duplicate table, no regular-FC substitute, no mock, no 0-fill). Scope now includes **company** (company + country + marketplace + sku — KM never reads ResUS events for a shared SKU) and excludes deleted/inactive/cancelled events. Shows the **next 3 complete months** (Aug/Sep/Oct when current = Jul). Table gained an **Event** column (Month / Event / FC Qty): one row per (month, event) — multiple events in a month stay separate rows (names never dropped), month label shown once; no event → "— / —"; missing/non-positive FC → "—" (never 0); months ascending, events by name. Event data read from the in-memory `getFcSpecialEvents()` cache on expand (no repeated DB round-trip); refreshes on expand / filter / scope change / reload / post-save cache reload.
- **四 · DB Capacity Monitor — docs only:** new `docs/planning/DB_CAPACITY_MONITOR_SPEC.md` (metrics `total_allocated_cells = Σ(max_rows×max_columns)` vs `cell_limit`, `usage_rate`, largest_tabs, thresholds Normal <70 / Warning 70–84 / High Risk 85–94 / Critical ≥95, scheduled + import-preflight checks, dashboard + email alerts, dismiss/ack, audit log, role-based recipients, Archive/BQ migration recommendation) + `SYSTEM_ROADMAP.md` backlog entry, both marked **Planned — implement together with P1-H Role & Permission Management** (no hard-coded Admin email). **No DB tab / trigger / email / runtime created.**
- **Files:** `assets/js/pages/inventory-replenishment.js`, `assets/css/pages/inventory-replenishment.css`, `assets/js/pages/request-order.js`, `assets/html/pages/request-order.html`, `assets/specs/active/SYSTEM_ROADMAP.md`, `docs/planning/DB_CAPACITY_MONITOR_SPEC.md`. `node --check` clean on both JS; scope-isolation test still passes. **Confirmed unchanged:** Forecast / Inventory / Order calculation formulas, 3PL allocation engine, Target Rule resolver, Campaign FC persistence.

## 2026-07-22 — Inventory Replenishment + FC Summary follow-up fixes + Overseas Inbound/Outbound Architecture Review (FRONTEND; no backend/DB/redeploy; recommendation engine + overseas transactions NOT activated)
**Follow-up on the same-day fix round below. Minimal-scope edits; existing Forecast / 3PL allocation / Target Rule / Campaign FC / persistence logic preserved.**
- **一 · 3rd Party Stock card simplified:** the SKU-expand card now shows ONLY the contributing physical 3PL warehouses (warehouse_name + Available Physical Qty, qty>0, joined by warehouse_id, sorted qty-desc then name, thousands separators, optional Total) or "No 3rd Party Stock". Title reduced to "3rd Party Stock". The full allocation/runtime detail (site_planning_available, physical_3pl_pool, protected_need, allocation_method, allocated_to_other_sites, unallocated_pool, coverage_rate, snapshot_as_of, priority/weighted-shortage) is **NOT deleted** — it stays on the returned `thirdPartyPlan` object for the engine / API / Admin Debug, only hidden from the daily card. (`_irRenderThirdPartyDetail` / `_irThirdPartyTitle` rewritten; allocation engine untouched.)
- **二 · Regular Forecast Builder:** preview columns renamed **Current Forecast (MonLbl YYYY) / New Forecast / Change** (month+year dynamic from Target Month+Year; blank=Skip, 0=explicit preserved). **Category → Series dependent multiselect** — Series options rebuild to the selected Category(ies), out-of-category selections dropped; Preview & Save use the identical scope (`_regularRebuildSeriesOptions` + shared `_fcSeriesForCategories`).
- **三 · Special Event Builder:** (1) **Apply Growth Rate** now takes a **Base Campaign*** dropdown (label `{year}_{event_name}`, value = stable `campaign_id`, candidates scoped by company/country/marketplace + category/series with valid `fc_special_events` FC); `new_fc = round(base_campaign_fc × (1+growth%))`; no base FC → "No Base Campaign FC", SKU skipped (never 0). (2) **Adjust from Base Forecast** gains **Base Month*** beside Base Year (2-col); base = `fc_regular_forecast[base_year][base_month]` for the scoped SKU; no base → "No Base Forecast", skipped. (3) Category → Series dependent (shared helper). (4) **Dynamic method fields** — Manual shows none; Growth shows Base Campaign + Growth Rate; Adjust shows Base Year + Base Month + Adjustment; switching clears the other method's inputs; batch Save now **skips** blank/no-base rows (confirm count) instead of erroring. (Reverses the earlier "remove Base Campaign / growth-from-regular-FC" interim per this instruction.) `fc_special_events` normalizer now exposes `campaignId`/`campaignSkuLineId`/`marketplaceId`.
- **四 · Overseas Inbound / Outbound — Architecture Review (read-only):** nav entries temporarily unlocked (badge "Review"); new partial pages `assets/html/pages/overseas-{inbound,outbound}.html` + `assets/js/pages/overseas-{inbound,outbound}.js` (lifecycle + partialLoader, tab anchors) + `assets/css/pages/overseas-ops.css`; routes added to both `app.js` sectionMaps; scripts + mounts + CSS linked in `index.html`. Pages render the full operation architecture (header/lines/receipts or confirmations/lifecycle/idempotency/dual-direction) from OVERSEAS_INBOUND_SPEC / OVERSEAS_OUTBOUND_SPEC with a **"Architecture Review — Read Only" banner** and **every mutating button (Create/Submit/Approve/Receive/Dispatch/Cancel/Save/Delete) disabled**. No transaction, no inventory/reserve/movement, no writer wired. **Re-lock to Stage 2 after sign-off.** `node --check` clean on all JS; scope-isolation test still passes.

## 2026-07-22 — Inventory Replenishment + FC Summary fixes: strict company-scope isolation, responsive layout, complete Special/Regular builders, Campaign 3-layer persistence (FRONTEND + APPS SCRIPT SOURCE; REDEPLOY PENDING; recommendation engine NOT activated)
**Implementation task (not spec-only). No Apps Script redeploy. Recommendation engine stays inactive. No physical 3PL inventory/movements changed.**
- **STRICT SCOPE (Section A / #4) — KM ≠ ResUS even on the same US/Amazon.** Root cause (audit): Inventory Replenishment had **no company dimension** — `marketplace_skus` filtered by country+marketplace only and forecast `.find()` grabbed the first country+marketplace match. Fix: added a **Company selector** (`#replenCompany`, top of the scope key; cascade Company → Country ↔ Marketplace). `_getCloudReplenishmentData` now filters the SKU universe by `company+country+marketplace`, resolves `marketplace_id` into `scope`, and adds a **company clause** to the forecast (`forecast60d` + inline breakdown, `fc_regular_forecast` has company), snapshot, sales, Edit-SKU and draft-context lookups. Amazon stock/sales raw tables have **no company column** → isolation is achieved via the company-scoped SKU universe (company clause is forward-safe if the column is ever added). Regression test `assets/tests/scope-isolation.test.js` (runnable `node …`) proves KM vs ResUS return different SKUs / forecast / sales / pricing / 3PL and documents that the old country+marketplace-only predicate merges both. FC Summary Special Event marketplace selector switched to full site identity `company|country|marketplace` (like Regular FC); `_evtScopedMskus` / `_evtSkuPricing` company-scope all lookups.
- **#1 Rec Summary / Execution Plan layout:** cards no longer `overflow:hidden` (was concealing rows) → `overflow:visible`, `height:auto` (grow with content); Rec Summary cells **wrap** (`white-space:normal; word-break`) instead of clipping; new `@media (max-width:1400px)` reflow drops the **decision area below the analysis area** (Group C/D full-width) so headers/inputs/ETA/Action stay visible without horizontal scroll. Visible columns unchanged. Engine NOT activated.
- **#2 Sales Trend:** `IRMap.salesTrend7d` rewritten to **7 calendar dates ending on the latest scoped DB `snapshot_date`** (not browser-today, not last-N rows), sorted chronologically; a missing day renders as an explicit **no-data GAP** (chart `spanGaps:false`, `null`) — never a fabricated 0; empty scope → honest empty chart. `INVENTORY_TABLE_MAPPING_SPEC §6` clarified.
- **#3 3PL semantics:** removed the wrong "platform-fulfilled excluded from 3PL" rule. Eligibility is warehouse-side only (`company + country + warehouse_type='3PL' + is_active`); **every scoped marketplace participates** in the shared 3PL reserve allocation (reserve for future platform-warehouse replenishment). Detail card shows actual `warehouse_name` + per-warehouse qty + Physical 3PL Pool + 18-Day Protected Need + basis + snapshot. `SUPPLY_PLANNING_CALCULATION_RULES §24.1` addendum documents the reversal (display/planning only — no movement/reserve/write).
- **#5–#8 Special Event Builder v3:** button order fixed (**Build cards → Preview & Pre-fill**, Preview disabled until built); group key = **category + series only** (one **row per scoped SKU**; different prices stay in the same card); **method-aware forecast** (Growth/Adjust = read-only New Event FC computed from `fc_regular_forecast` Base Year + event month; Manual = editable per SKU; shows Base FC / New / Diff); **Base Campaign removed** from all three methods; **Single SKU = scoped searchable datalist** + Discount % → Deal Price (currency precision), **Missing Regular Price blocks Save (never 0)**, out-of-scope SKU blocked.
- **#9/#14 Complete Special Event Save + schema:** replaced the PENDING alert with a real **idempotent 3-layer transaction** `campaigns → campaign_sku_lines → fc_special_events` (`upsertCampaign` → `upsertCampaignSkuLines` → `upsertFcSpecialEvent`); any step failure stops and reports the real error (no fake success, no orphan events). New `20_campaign_write_handlers.gs` (header-aware, additive-only, idempotent). Additive columns via `fcWriteEnsureColumns_`: `campaigns` +`company`,`marketplace_id`; `campaign_sku_lines` +`marketplace_sku_id`; `fc_special_events` +`campaign_id`,`campaign_sku_line_id`,`marketplace_id`,`event_start_date`,`event_end_date`. Router + API adapter + normalizers updated. **Redeploy PENDING** → a live Save currently surfaces the backend error honestly until the Web App is redeployed.
- **#10–#13 Regular FC:** Country ↔ Marketplace already linked via full site identity (verified). Category/Series converted to **multiselect** (`.fc-ms`, outside-click/Escape/Build close, chips, All). Single SKU → **scoped searchable datalist**; Manual Entry lists every in-scope SKU (blank=Skip, 0=explicit) via `importFcRegularForecastBatch` (writer already complete; single target month; other months preserved).
- **#12 Preview responsiveness:** Regular Builder modal widened to `min(96vw,960px)` (matches Special Event); preview tables wrap (no horizontal scrollbar at desktop).
- **Files:** `assets/html/pages/{fc-summary,inventory-replenishment}.html`; `assets/js/pages/{fc-summary,inventory-replenishment}.js`; `assets/js/api/operation-system-db-api.js`; `assets/css/pages/{fc-overview,inventory-replenishment}.css`; `assets/specs/active/apps-script/{01_router,14_fc_write_handlers,20_campaign_write_handlers}.gs`; `assets/tests/scope-isolation.test.js`. `node --check` clean on all JS/`.gs`; scope test passes.
- **NOT done / pending:** Apps Script **redeploy** (campaign writer actions + additive columns) — flagged; recommendation-generation engine remains inactive; Amazon raw stock/sales tables still lack a `company` column (backfill/migration gap — isolation currently via company-scoped SKU universe).

## 2026-07-22 — Phase-1 Factory Inventory view implemented + Warehouse navigation menu finalized (FRONTEND SOURCE; no backend/DB/API/redeploy)
- **Scope:** frontend only. No Apps Script, API, DB table, migration, or redeploy. No Factory Stock **business logic** changed; no shipment reservation / Shipout / WMS implemented; no duplicate Factory page/module created.
- **Navigation finalized** (`index.html` sidebar): group relabeled **"Warehouse Stock" → "Warehouse"**; children = **Factory Inventory** (route `factory-stock`), **Overseas Inventory** (route `overseas-stock`) — both active, relabeled from "Factory Stock"/"Overseas Stock" (route keys + section ids **unchanged** → no router/lifecycle break, no duplicate page). **Overseas Inbound** + **Overseas Outbound** added as **disabled "Soon"** entries (spec-only, not built). `data-menu-id`/`data-parent` kept as `warehouse-stock`. Warehouse Master stays under Admin → Master Data (unchanged).
- **Factory Inventory page** = the existing Factory Stock page enhanced in place:
  - `factory-stock.html`: title → "Factory Inventory"; added **KPI row** (Current / Reserved / Available / In Production / Pending Shipout); added **Country** + **Stock Status** filters; snapshot table columns → **Warehouse / SKU(fixed) / Category-Series / Current / Reserved / Available / In Production / Pending Shipout / Last Movement**; Movement Log tab + Edit button + date picker **preserved**.
  - `factory-stock.js`: `_getDbFactoryStockData` now maps `currentStock`/`reservedStock`, **`availableStock = MAX(current − reserved, 0)`**, `country` (warehouses join), `categorySeries` (sku_details join), `lastMovement` (`last_transaction_at`), `stockStatus` (In Stock/Out of Stock from available); added country + stockStatus filters; new `_renderFactoryKpis(filteredRows)` (Current/Reserved/Available summed from filtered rows). Reads **only** `getFactoryStock()` + `getWarehouses()` + `getSkuDetails()` — **never** overseas tables. Demo mapping updated to the same shape (zero-safe).
  - `factory-stock.css`: scoped `.fi-kpi-*` cards (responsive grid 5→3→2 cols) + `.fi-na`; numeric alignment moved from `nth-child(n+5)` to explicit `--num`.
- **In Production / Pending Shipout — NOT fabricated:** no authoritative wired source exists on `factory_stock` (only `fac_current_stock` / `fac_reserved_stock`). Rendered as explicit **"—" (Not tracked yet)** in KPI + table; documented gap (WAREHOUSE_OPERATIONS_SPEC §6A read-only PO/shipment joins not implemented). NOT derived from unrelated statuses.
- **Adjustment workflow:** the existing `factory-stock-edit-btn` → `toggleFactoryStockEdit()` is a **dead placeholder** (defined nowhere) — left as-is; **no second adjustment workflow added.**
- **States:** not-connected → "尚未連接資料來源"; filtered-empty → "No data found"; lazy DB load on first open preserved. Filters are pure client-side reads — **balances never mutated**.
- `node --check` OK on `factory-stock.js`. WAREHOUSE_OPERATIONS_SPEC §10 status updated to "PARTIALLY IMPLEMENTED".

## 2026-07-22 — Warehouse Planning/Operation authority conflict resolved + Warehouse navigation finalized (4 pages) + Overseas Outbound spec created (SPEC + DB-DESIGN + UI-SPEC SYNC ONLY; no code/DB/Runtime change)
- **Scope:** SPEC / DB-DESIGN / UI-SPEC sync only. **No** frontend/runtime/Apps Script/API, **no** DB tables/migration, **no** redeploy, **no** live-data change. **Route reference data (`shipment_route_templates` / `shipment_route_template_nodes`) untouched.** Nothing new is implemented.
- **Warehouse navigation FINALIZED to four separate pages** (`WAREHOUSE_OPERATIONS_SPEC.md` v2.1 §2): **Factory Inventory / Overseas Inventory / Overseas Inbound / Overseas Outbound**. **Warehouse Master moved to Admin → Master Data → Warehouses** (outside the group). Factory vs Overseas = separate domains / pages / queries / balances / ledgers (never merged); `available_factory_stock = MAX(fac_current_stock − fac_reserved_stock, 0)`.
- **Factory Inventory page UI spec ADDED** (`WAREHOUSE_OPERATIONS_SPEC.md` §6A): KPI (Total/Available/Reserved/Low-Stock/In-Production/Pending-Shipout), filters, main table, detail drawer (PO production + Shipment reservations + movement history + related links; read-only joins).
- **Planning vs Operation naming conflict RESOLVED** (`OVERSEAS_INBOUND_SPEC.md` v2): pre-shipment planning concept **renamed to "Inbound Planning Request"** (planning layer, §§2–8) and **no longer owns the Overseas Inbound page**. Canonical **Overseas Inbound = destination Warehouse Receiving Operation** (§9 page + new **§10 contract**: `overseas_inbound_operations` / `_operation_lines` / `_receipts` / `_receipt_lines`; partial/over/short/damaged + disposition; receipt idempotency; reversal/correction; movement posting refs inventory spec; **Received ≠ Closed**; operation_status vs api_status separate). Title + line-1 + pre-§9 note retitled.
- **Overseas Outbound canonical authority CREATED** — new [`OVERSEAS_OUTBOUND_SPEC.md`](../../../docs/planning/OVERSEAS_OUTBOUND_SPEC.md): operation header/lines, ship confirmations + lines, draft→lock→submit→ack→pick→pack→ship-confirm lifecycle, partial shipment, cancellation + reserved-stock release, idempotent WMS submission + idempotent ship confirmation, reversal/correction, movement posting (refs inventory spec), operation_status vs api_status. **Auto-create ≠ auto-submit; Submit ≠ deduct; Lock reserves; Ship Confirm deducts ACTUAL shipped qty only (partial = shipped_qty_this_confirmation); Overseas Outbound never affects Factory Inventory.**
- **Shipout push compatibility (canonical):** **Outbound Instruction Push = KM → WMS** (at Submit/Lock); **Shipout Confirmation Push = WMS → KM** (actual shipped). **Never "shipout first, then push."** Added `SHIPMENT_CENTER_SPEC.md` §23.10.
- **Idempotency:** operation uniqueness `shipment_id + warehouse_id + operation_type`; **separate keys** per action (create/link · WMS submission · receipt confirmation · shipout confirmation · reversal).
- **Synced:** `DATABASE_RELATIONSHIP_MAP.md` §8C (four-page nav + planned operation tables + shipout push + idempotency), `SHIPMENT_CENTER_SPEC.md` §23.10, `SYSTEM_RUNTIME_ARCHITECTURE.md` (Overseas Operation module boundary), `SUPPLY_CHAIN_SYSTEM_FLOW.md` §1A P1-C + §5.7, `SYSTEM_ROADMAP.md` P1-C, `OVERSEAS_STOCK_SPEC.md` (already Overseas-Inventory naming; unchanged).
- **Contradiction audit (11 statements):** repository-wide sweep found **no unqualified active statement** asserting any wrong claim (Overseas-Inbound-is-planning-page / same-record / shipout-first / submit-deducts / formal-shipment-increases-inventory / delivered=received / draft-reserves / lock-deducts / partial-deducts-requested / one-shared-balance / warehouse-creation-moves-inventory). Only stale spots fixed: OVERSEAS_INBOUND title + pre-§9 note; three-page → four-page nav in FLOW/ROADMAP. Old combined-inventory model already SUPERSEDED.
- **NOT implemented:** all `overseas_inbound_*` / `overseas_outbound_*` operation/receipt/confirmation tables; the four-page nav wiring; the Factory Inventory page; inventory movement posting from receipts/shipouts; WMS/API integration. Live nav remains "Warehouse Stock" → Factory Stock + Overseas Stock.

## 2026-07-22 — Replenishment final logic + Route Recommendation Engine + Rec/Execution layout revision + Shipping Allocation Draft DB finalization (SPEC + DB DESIGN + UI SPEC SYNC ONLY; no code/DB/Runtime change)

Spec + DB-design + UI-spec sync. **No Runtime / frontend / Apps Script / DB migration / live data; route-template tables untouched; recommendation engine NOT implemented.**
- **Draft DB model FINALIZED** (owner `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6; mirrored DB-map §7.5 + RECOMMENDATION_RUNTIME §C/§D): only `shipping_allocation_drafts` + `_draft_lines` (**no `shipping_allocation_suggestions`** — confirmed it never existed). Header: removed `sku`/`target_window`; `source_type`→**`generation_type`** (scheduled/manual_refresh/user_created); added planning_cycle, calculation_run_id, calculated_at, source_data_as_of, draft_version, submitted/cancelled actors + cancel_reason. Uniqueness = planning_cycle+company+country+marketplace+draft_version; same calculation_run_id idempotent. Lines carry the full recommendation-input + system-recommendation + user-Execution-Plan column sets. **Canonical qty:** `recommended_qty` (immutable system snapshot; legacy alias `recommand_shipment_draft_qty` = read/migration only) + `planned_qty` (user; legacy alias `shipment_draft_qty`/`qty`); first-gen `planned_qty=recommended_qty`; refresh never overwrites `planned_qty`, never mutates `recommended_qty`. MUST NOT store uncovered_qty/coverage_status/window_label/route display/source display (derive at Runtime); `required_by_date` kept as hidden DB field.
- **Persistence contradiction resolved:** persisted Draft = SSOT; `sessionStorage` = transient UI recovery only; Recommendation Summary shows persisted system snapshot; Execution Plan edits persist to `planned_qty`; Submit Plan reads only the Execution Plan → `shipping_plans`. Superseded the old "no-DB/sessionStorage-SSOT" wording (INVENTORY §11.4 rewritten; supersede banners on `pages/inventory/MARKETPLACE_SKU_FLOW_SPEC.md`, `pages/shipping/ShippingPlan_Rules_Spec.md`; SYSTEM_ROADMAP Shipping-Plan row).
- **Recommendation Summary → FINAL 5 columns** (INVENTORY §11.2): **Window / Calculated Gap / Recommended Qty / Route / Reason**. Removed Required By, Suggested Source, Expected Arrival, Coverage Status, Uncovered Qty from the visible table (supersedes the 9-col version from the earlier 2026-07-22 entry). Remaining Gap = max(Calculated Gap − Σ planned_qty, 0), derived not persisted.
- **Layout revised** (INVENTORY §11.5): supersedes the Group C/D split → **Analysis area** (Stock, Long Term Storage, Forecast Breakdown, Upcoming Event, Sales Trend, **Monthly Achievement Rate below Sales Trend**) + **Decision area** (**Recommendation Summary directly above Execution Plan**, stacked, same width, separate). **Execution Plan columns** = From / To / Qty / Method / **Expected Arrival** / Action (Expected Arrival right of Method; recalc on From/To/Method/ship-date/route-rate-leadtime change).
- **Gap vs Recommended Qty** (SUPPLY_PLANNING §2C.1): `Calculated Gap` → `Raw Recommended Qty = min(gap, eligible source available)` → `Carton-adjusted = FLOOR(raw/upc)*upc`. Distinguished destination shortage / immediately-available source / production-required; **zero Factory Stock ≠ no shipment** (surface production-required). Shipping FLOOR vs order-CEILING (§14) clarified.
- **ETA bucketing** (SUPPLY_PLANNING §2F): display bucket vs qualification (`ETA ≤ Required-By`); ETA source priority runtime-actual > formal-planned > lead-time-estimate; don't re-replace an authoritative runtime ETA; Delivered≠Received (delivered-not-received stays Incoming).
- **Route Recommendation Engine** (CARRIER_AND_ROUTE §5B, spec only): Step A eligibility filter, Step B conservative arrival (`max_days` + receiving buffer; + production lead time when production required), Step C full rate-card cost model (`quote_data_incomplete` flag; never fabricate zero cost), Step D ranking **Feasibility→Cost→Speed→Reliability**; `late_risk` + "not covered" when none on-time.
- **Special Event display** (INVENTORY §8.2): Upcoming Event Card + Recommendation Summary badge + Sales Trend marker; stays in formula after Draft/Plan/Shipment.
- **Files changed (10):** REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC, DATABASE_RELATIONSHIP_MAP, RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC, INVENTORY_TABLE_MAPPING_SPEC, SUPPLY_PLANNING_CALCULATION_RULES, CARRIER_AND_ROUTE_SPEC, SYSTEM_ROADMAP, MARKETPLACE_SKU_FLOW_SPEC, ShippingPlan_Rules_Spec, project-current-state. **Runtime (engine, route recommendation, Draft tables, migration, updated UI) NOT implemented.**

## 2026-07-22 — Phase 1 supply-planning canonical correction + four-mode formula + event lifecycle + lead-time ID + warehouse readiness audit (SPEC / CANONICAL SYNC ONLY; no code/DB/Runtime change)

Spec-only canonical sync. **No Runtime / frontend / Apps Script / DB / live-data change; the two completed Route Template Reference tables untouched.**
- **Phase-1 boundary CORRECTED (supersedes the 2026-07-22 entry below):** the full **90-Day Rule-Based Supply Planning engine is now P1-G — a Phase-1 requirement before Go-Live**, NOT Post-Phase-1. New order **P1-A..P1-I**: A basic Net Replenishment Need → B allocation/order-deduction/qty contract → C warehouse+overseas inbound/outbound → D inventory movement loop → E route runtime → F module APIs → **G 90-Day rule-based planning** → H login/roles/notifications/admin/World-Map UI → I Go-Live integration+acceptance gate. **Post-Phase-1 = learning-based only** (AI, automatic statistical correction, dynamic Safety Stock/optimization, forecast accuracy metrics, route lead-time calibration, cross-company borrowing, BigQuery). Synced in SUPPLY_CHAIN_SYSTEM_FLOW §1A, SYSTEM_ROADMAP, SUPPLY_PLANNING §2A.
- **Four replenishment combinations (SUPPLY_PLANNING §2B):** A Platform×Sales, B Platform×Forecast, C Overseas×Sales, D Overseas×Forecast. Canonical stock rule: non-platform SKU MUST use overseas **Site Planning Available** (never platform, never 0); platform+overseas never blindly added; hybrid resolved at Marketplace-SKU level with explicit lane allocation.
- **Sales-driven (§2C):** exact-date buckets 0–18/19–30/31–45/46–90; `Bucket Need[b]=max(0, incremental regular demand + event demand[b] − cumulative stock − timely qualified incoming − committed supply)`; platform prefers valid snapshot (never re-subtract sales; Estimated fallback labeled); overseas protects 18-day survival first then weight+priority. **Forecast-driven (§2D):** `Adjusted Regular FC = Regular FC × Target Rule (SKU>Series>Category>100%)`; Suggested Qty = FC M+1 + M+2 + 30-day safety + event − stock − qualified incoming − committed; FC Share = allocation weight, not ownership.
- **Qualified Incoming / count-once (§2E):** qualifies only on SKU+Company+destination scope+approved status+ETA≤required+remaining>0; single-bucket chain Committed Production → Approved Plan → In Transit → Delivered-not-Received → Received; no double-count; Delivered ≠ Received.
- **Special Event (§10 + §10.1):** prep-date reconciled — canonical **exact `Event Start − 30 days`** (engine); monthly UI places demand in the month containing the prep date; **previous-calendar-month wording marked SUPERSEDED/legacy**. Added full **coverage lifecycle** (Not Planned → Draft Planned → Approved Planned → In Transit → Late Risk → Partially Received → Received → Closed/Archived) + recognition rules + `Event Net Gap` + close conditions. Event demand additive/100%/not target-adjusted/not deleted by shipment; sales-driven excludes event dates from normalized avg then adds event FC once.
- **Recommendation Summary (INVENTORY_TABLE_MAPPING §11.2):** expanded to canonical columns Window / Required By / Suggested Qty / Suggested Source / Suggested Route / Expected Arrival / Coverage Status / Reason / Uncovered Qty; Coverage Status enum; Reason must expose demand+stock basis, stock/incoming used, event demand, exact gap, timing. Read-only / never-submitted + Layout v3 Group C/D preserved.
- **Lead Time ID (CARRIER_AND_ROUTE §4A + DB map):** `lead_time_id = CLT-000001` (six-digit global sequence, immutable, no business dims in PK); match key carrier+origin+dest+shipping_method+last_mile; enums Sea/Sea Express/Air/Courier × Parcel/Truck; never combine Sea/P·Sea/T; measurement Ship-Confirm→Delivered (calendar; receiving buffer separate); initial `avg_days=ROUND((min+max)/2)`; `carrier_rate_cards` never stores transit_days.
- **Warehouse readiness audit (WAREHOUSE_OPERATIONS §8A):** Inbound receiving qty/movement/received-states + Outbound reserve/ship/deduct + **a dedicated `OVERSEAS_OUTBOUND_SPEC` (does not exist)** classified **Blocking**; nothing fabricated as implemented.
- **Files synced (12):** SUPPLY_PLANNING_CALCULATION_RULES, SUPPLY_CHAIN_SYSTEM_FLOW, SYSTEM_ROADMAP, INVENTORY_TABLE_MAPPING_SPEC, CARRIER_AND_ROUTE_SPEC, DATABASE_RELATIONSHIP_MAP, WAREHOUSE_OPERATIONS_SPEC, SHIPMENT_CENTER_SPEC (phase refs), project-current-state. **Flagged parallel/stale authorities** under `assets/specs/active/pages/` (ShippingPlan_Rules_Spec legacy "Shipping Allocation"; InventoryReplenishment_PRD plan lifecycle) for a later reconciliation.

## 2026-07-22 — Supply Chain Phase 1 finalization & Route Runtime canonical sync (SPEC / DB-CONTRACT SYNC ONLY; no code/DB/Runtime change)

Spec-First canonical sync. **No frontend / Apps Script / Runtime / live-DB change; the two completed Route Template Reference DBs were NOT touched.** Read-only audit → confirmed sync across 11 authority files.
- **Route DB reality synced:** `shipment_route_templates` + `shipment_route_template_nodes` = **Reference DBs manually completed by the user** (docs were stale "(Master — planned)" → now "✅ manually completed; read-only synced; not recreated"). `shipment_routes` / `shipment_route_nodes` / `shipment_events` = **spec-only / NOT implemented** (confirmed absent from all `.gs` + `assets/js`); build = Phase-1 P1-E.
- **`default_offset_days` defined** (was undefined): **cumulative planned days from route start (ETD), NOT inter-node interval** (`SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §4.B).
- **`shipment_routes` / `shipment_events` schema canonicalized** to the richer instruction model (user-approved): `shipment_routes` = per-shipment **route-VERSION header** (`route_version`/`route_status`/`is_current`/`supersedes_shipment_route_id`/projection fields/`route_snapshot_json`), superseding the earlier one-row-per-node model; optional `shipment_route_nodes` holds per-node snapshot; `shipment_events` enriched + `(source_type, source_event_id)` UNIQUE, one-`is_current`-route rule, append-only correction/reversal.
- **Phase-1 P1-A..P1-G authoritative order added** (`SUPPLY_CHAIN_SYSTEM_FLOW.md` §1A + §5.8 E2E loop; `SYSTEM_ROADMAP.md`): A replenishment formula → B order/allocation/qty reconciliation → C warehouse+inbound/outbound → D full inventory loop → E route runtime → F module APIs → G Go-Live Gate; Post-Phase-1 = 90-Day intelligence / dynamic safety stock / analytics / AI. **[SUPERSEDED 2026-07-22 by the entry above: the order is now P1-A..P1-I; the rule-based 90-Day engine is P1-G (pre-Go-Live, NOT Post-Phase-1); only learning-based features are Post-Phase-1. This historical line is retained for audit and is NOT current authority.]**
- **New canonical definitions:** **Net Replenishment Need** = demand window − sellable stock − qualified incoming − approved/committed supply (`SUPPLY_PLANNING_CALCULATION_RULES.md` §2A); **Qualified Incoming** = Approved/Shipped/In-Transit/Received (Draft excluded); event demand not deleted by shipment creation. **P1-B** consolidated (`REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`): `remaining_qty=MAX(completed−shipped,0)`, `unreceived_qty=MAX(ordered−completed,0)`; reserve@lock / deduct@Ship-Confirm / no double-deduct.
- **Reaffirmed (already clean from prior syncs):** Delivered ≠ Received; Template ≠ shipment live state; Shipment Draft doesn't deduct current_stock; Inbound Planning ≠ Warehouse Receiving; 90-Day not a blocker.
- **Files synced (11):** SHIPMENT_ROUTE_AND_EVENT_SPEC, DATABASE_RELATIONSHIP_MAP, SUPPLY_PLANNING_CALCULATION_RULES, REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC, SUPPLY_CHAIN_SYSTEM_FLOW, SYSTEM_RUNTIME_ARCHITECTURE, SHIPMENT_CENTER_SPEC, CARRIER_AND_ROUTE_SPEC, WAREHOUSE_OPERATIONS_SPEC, SYSTEM_ROADMAP, project-current-state. **Runtime DB (routes/events) + P1-E..G build remain pending.**

## 2026-07-21 — Amazon Daily Sales gap-aware rolling sync (SOURCE + SPEC; REDEPLOY + log-header migration PENDING; no live verify)

Corrected `amazon_daily_sales_snapshot` synchronization. **Root cause:** the importer read **only yesterday** (`incrementalDefaultDays: 1`) with a 30-day retention and a latest-per-group fallback — a disabled/failed trigger or late BigQuery arrival left permanent gaps (never recovered). **Fix = gap-aware rolling 90-completed-day sync** (Apps Script source; manual redeploy required).
- **Config (`06_amazon_import_config.gs`):** `retentionDays 30→90`, `lookbackDays 30→90`, added `reconcileRecentDays: 3`; `incrementalDefaultDays: 1` retained as legacy (unused by gap-aware path).
- **Window (`10_amazon_import_helpers.gs`):** new `amazonRetentionWindow_(90, tz)` + `amazonAddDaysStr_` — explicit inclusive 90-completed-day boundary (Asia/Taipei; end=yesterday; start=yesterday−89). Fixed `amazonRollingCutoffDate_` to calendar-inclusive (was ms-offset).
- **Reader (`08_amazon_import_sources.gs`):** `amazonReadDailyGapAware_` — computes window → inspects **source** per-date coverage (`amazonQuerySourceDateCoverage_`: row + distinct-key counts) + **destination** per-date coverage (`amazonReadDestDateCoverage_`: row + distinct-key + duplicates) → detects missing/incomplete → fetches ONLY needed dates (missing ∪ incomplete ∪ recent-3 ∪ optional backfill_days) via `DATE(...) IN (...)`. **Latest-per-group fallback REMOVED from the rolling path**; source-less in-window dates recorded as source_unavailable (never fabricated).
- **Writer (`09_amazon_import_writer_logger.gs`):** `amazonUpsertRollingSnapshot_` now takes an explicit `cutoffDate` (retention_start), collapses pre-existing duplicate keys (last-wins), and uses `source_row_hash` to count unchanged vs updated. Prune = `snapshot_date < retention_start`.
- **Runner (`07_amazon_import_runner.gs`):** `LockService` script lock (30s) around the rolling read+write (fails safe without writing); passes retention_start cutoff; copies `rollingMeta` into ctx; extends `import_sync_runs` record with retention_start/end, source/destination/missing/incomplete/recent/imported/source_unavailable date sets (compact JSON), dates_pruned, rows_inserted/updated/unchanged, duplicate_keys_detected, completed_at.
- **Natural key verified (unchanged):** `snapshot_date + country + marketplace + channel + sku`. Hash = 20-field `rowHashFields`.
- **Failure-safe:** a failed BigQuery read aborts before any prune/write; running twice/day is idempotent (keyed upsert + hash unchanged; no duplicate keys).
- `node --check` **OK** on 06/07/08/09/10. **PENDING (not claimed):** (a) redeploy the modular `apps-script/*.gs` together (shared scope); (b) add the new `import_sync_runs` columns to the live sheet (else those fields no-op — a compact summary is still written to `quality_note`); (c) a one-time run (or `backfill_days: 90`) to recover the existing historical gaps; (d) create/confirm the daily time-trigger on `runAmazonSnapshotImports` (12:00–13:00 Asia/Taipei) — no trigger-creation code exists in the project. **No live BigQuery/Sheet verification performed (no access).** Monolithic `apps-script-web-app.gs` is index-only (not edited).

## 2026-07-21 — Factory Inventory vs Overseas Inventory domain separation (CANONICAL MD SYNC ONLY; no code/DB change)

Hardened the canonical decision that **Factory Inventory and Overseas Inventory are separate inventory domains** — separate across DB tables, balances, movements, lifecycle, UI pages, API/query boundaries, reporting filters, and permissions. **Documentation-only task: no source, DB, or runtime change.**
- **Canonical table roles documented:** `factory_stock` = Factory Inventory balance · `factory_stock_movements` = Factory ledger · `overseas_inventory_snapshot` = Overseas Inventory balance · `overseas_inventory_movements` = Overseas ledger · `shipments`/`shipment_events` = in-transit transportation state (NOT an endpoint balance).
- **Lifecycle boundaries documented:** factory dispatch → factory_stock deduction; in transit → no overseas increase; confirmed Overseas Inbound receipt → overseas increase; confirmed Overseas Outbound ship-out → overseas decrease (factory unaffected). **In-transit never double-counted at both endpoints.**
- **Authority block added:** `DATABASE_RELATIONSHIP_MAP.md` §6.0 (new). Cross-referenced/synced into SUPPLY_CHAIN_SYSTEM_FLOW (§5.7 inventory-domain block), SHIPMENT_CENTER_SPEC (§23.9), SYSTEM_RUNTIME_ARCHITECTURE (§5 note), OVERSEAS_STOCK_SPEC, OVERSEAS_INBOUND_SPEC (§9), SKU_MASTER_AND_REGIONAL_DETAILS_SPEC, SUPPLY_PLANNING_CALCULATION_RULES, SYSTEM_ROADMAP (module table + factory-init note), WAREHOUSE_OPERATIONS_SPEC (v1.0 combined-module changelog marked SUPERSEDED).
- **Source consistency verified (not live):** `overseas_inventory_*` is written **only** by `05_overseas_inventory_handlers.gs`; `03_master_data_handlers.gs` references it only in read endpoints (`handleGetOperationDb_`/`handleGetTable_`); `12_shipment_handlers.gs` writes no overseas inventory (only the `factory_stock_allocation_qty` line field). Factory baseline (03_) writes `factory_stock` only. So formal Shipment creation + Master-SKU/marketplace-SKU creation add no Overseas Inventory — consistent with the separation. Full receipt/outbound lifecycle remains spec-only (NOT implemented).
- **No contradictory active wording found** — the only prior combined-inventory wording (WAREHOUSE_OPERATIONS_SPEC v1.0 "Inventory module" with Factory+Overseas tabs) was already superseded to v2.0 (three separate pages) and is now explicitly marked SUPERSEDED.

## 2026-07-21 — Overseas Warehouse navigation, shipping endpoint semantics & warehouse operation routing (SPEC / DB-CONTRACT + CANONICAL MD SYNC ONLY)

Specification / database-contract correction + canonical MD sync. **This was an MD/contract task (Implementation Boundary §P branch 1): no UI, no runtime operation creation, no live DB migration, no API verification is claimed.** Status recorded separately per task Section N item 10:
- **Endpoint DB fields (asserted to EXIST in the live Sheet per task Section C — NOT verified by me, no live access):** `shipping_plans.ship_from_warehouse_id` / `ship_from_type` / `destination_warehouse_id` / `destination_type`; `shipments.origin_warehouse_id` / `origin_type` / `destination_warehouse_id` / `destination_type`. **No code reads/writes these yet** — `normalizeShippingPlanRecord` / `normalizeShipmentRecord`, `11_shipping_plan_handlers.gs`, and `12_shipment_handlers.gs` (`createShipmentFromApprovedPlan_`) still carry only free-text `ship_from` / `destination`. Wiring them (normalizer exposure + transfer carry + dual-write consistency) is the recommended next implementation step — **NOT done here.**
- **Documentation sync: DONE** across DATABASE_RELATIONSHIP_MAP (§8 endpoint fields + new §8C), SHIPMENT_CENTER_SPEC (new §23 + §22 pointer), SHIPMENT_DATABASE_SCHEMA (plan+shipment endpoint rows + dual-write rule), WAREHOUSE_OPERATIONS_SPEC (rewritten v2.0 — three separate pages), OVERSEAS_INBOUND_SPEC (§9 operation layer), OVERSEAS_STOCK_SPEC (Overseas Inventory naming + factory exclusion), SUPPLY_CHAIN_SYSTEM_FLOW (§5.7 branch), SYSTEM_RUNTIME_ARCHITECTURE (§14A).
- **Canonical decisions:** three **separate** Warehouse pages with explicit labels — **Overseas Inventory / Overseas Inbound / Overseas Outbound** (shared components only; routes/state/actions/queries/lifecycle separate). `origin_warehouse_id` / `destination_warehouse_id` canonical; `warehouse_id` / `warehouse_code` = transitional destination compatibility (dual-write: `warehouse_id = destination_warehouse_id`, `warehouse_code` derived via the warehouse row). Direction runtime-derived (Inbound/Outbound/Transfer/none); factory + non-capable + non-active endpoints excluded; company-scoped identity (KM vs ResUS AMZLGS never cross-route); identity never inferred from display text. Not added: `shipment_direction`, `warehouse_operation_type`, `expected_ship_date`, `expected_arrival_date` (use `shipments.etd`/`eta`), and no overseas-execution columns on `shipping_plan_lines`.
- **Warehouse Picker:** frontend implemented (prior 2026-07-21 entry below); **live verification still pending**. Currently selects/persists the **destination** identity only; extending to select/restore **both** origin + destination endpoints is pending.
- **Overseas Inbound UI:** NOT IMPLEMENTED (spec only — page does not exist). **Overseas Outbound UI:** NOT IMPLEMENTED (spec only — page does not exist). **Overseas Inventory naming:** page exists as "Overseas Stock" (`overseas-stock.*`); user-facing rename to "Overseas Inventory" is documentation-only here (nav label not changed in code).
- **World Map:** deferred (secondary visualization). **Outbound tables** `warehouse_outbound_addresses` / `warehouse_outbound_packages` / `warehouse_outbound_package_items`: deferred (not created).

## 2026-07-21 — Shipment Draft Warehouse Picker (FRONTEND + API + HANDLER SOURCE; LIVE VERIFY + REDEPLOY PENDING)

Implemented the Shipment Draft **Warehouse Picker** (SHIPMENT_CENTER_SPEC §22.0), replacing the legacy free-text `warehouse_code` input in the Shipment Draft execution form. This is a SEPARATE change from the earlier factory/overseas namespace work (that deploy did NOT touch warehouse UI).
- **API (`operation-system-db-api.js`):** `normalizeWarehouseRecord` extended to expose `warehouseCode` / `warehouseOwner` / `isActive` / `isFactoryWarehouse` / `logisticsRegion` / `city` / `state` (the picker's filter/eligibility/display inputs). Added `_whBool` tri-state helper (`true`/`false`/`null` — never `Boolean(value)`, so an "N"/"No"/"0" cell does not flip a flag). Existing warehouse fields unchanged.
- **Frontend (`shipping-history.js`):** `warehouseFld()` builds a grouped `<select data-field="warehouse_id">` — **FBA group then 3PL group**, ordered `logistics_region → warehouse_code`. Candidates: eligible = exclude explicitly-inactive + factory warehouses; scoped by **Company → Country** (only when both sides carry the value — never widen scope); **§22.0(F) FBA** = `warehouse_type=FBA AND marketplace='Amazon'`, **§22.0(G) 3PL** = `warehouse_type=3PL` (marketplace may be blank). Selecting an option copies `warehouse_code` (data-code) into a hidden `data-field="warehouse_code"` mirror via `shWarehousePick()`, so `_shCollectExec` persists **both** `warehouse_id` (identity) + `warehouse_code` (snapshot). Reload restores selection from stored `warehouse_id`. Out-of-scope / legacy selections are preserved as a flagged "Current selection" option (never silently dropped). Empty state = "No eligible warehouse found" (no silent fallback, §22.0(K)). **Warehouse identity is NEVER inferred from `destination` text.**
- **Handler (`12_shipment_handlers.gs`):** `SHIPMENT_EDITABLE_FIELDS_` now accepts `warehouse_id` (was `warehouse_code` only). No new columns, no server-side derivation added.
- **TEMPORARY SEMANTIC (inbound-first, task item 9 / §22.0(L)):** `shipments.warehouse_id` / `warehouse_code` = the **destination** warehouse. Explicit `origin_warehouse_id` / `destination_warehouse_id` are deferred to Warehouse Outbound via a planned migration.
- **NOT added (task guardrails 3–8):** `warehouse_operation_type` (direction is runtime-derived: managed-destination=INBOUND / managed-origin=OUTBOUND / both=TRANSFER), `expected_ship_date`/`expected_arrival_date` (use `shipments.etd`/`eta`), `shipment_direction` as a user field, and `shipping_plan_lines` execution columns (`package_type_id`/`lot_control_required`/`expiration_control_required`/`uom`/`inventory_status`). `warehouse_outbound_addresses` / `warehouse_outbound_packages` / `warehouse_outbound_package_items` remain deferred.
- `node --check` **OK** on `operation-system-db-api.js`, `shipping-history.js`, `12_shipment_handlers.gs`. **PENDING (not claimed complete, task item 10):** live GET confirming the `warehouses` master carries `warehouse_code`/`warehouse_type`/`marketplace`/`is_active`/`is_factory_warehouse`/`logistics_region`; `12_shipment_handlers.gs` **redeploy**; live save→reload smoke test (persist + restore of `warehouse_id`+`warehouse_code`).

## 2026-07-21 — Inventory column namespace migration `fac_*` / `wh_*` (SOURCE + SPEC; LIVE HEADER MIGRATION + REDEPLOY PENDING)

Finalized inventory column namespaces: **`fac_*` = Factory Stock balance** (`factory_stock`), **`wh_*` = Overseas Warehouse Inventory** (`overseas_inventory_snapshot` / `overseas_inventory_movements`). Prevents ambiguous `current_stock`/`reserved_stock`/`available_stock`/`quantity` being read against the wrong domain. **No live Google Sheet access in this task → live header rename is PENDING; no data values/types changed; no columns added/removed/reordered.**
- **Canonical rename:** factory `current_stock→fac_current_stock`, `reserved_stock→fac_reserved_stock` (derived `fac_available_stock`, not stored). Overseas snapshot `physical_stock/available_stock/reserved_stock/damaged_stock/on_the_way_qty/on_the_way_eta/on_the_way_bucket → wh_*`. Overseas movements `quantity/quantity_before/quantity_after/before|after_physical_stock/before|after_reserved_stock/before|after_available_stock → wh_*`. `factory_stock_movements` audit columns (`before_current_stock` etc.) were **NOT** in the finalized map — left as-is.
- **Runtime (source; redeploy pending):** API normalizers (`operation-system-db-api.js`) dual-read prefer canonical + fallback legacy via `_invPick` (TEMPORARY; remove after live rename). Write handlers resolve target header preferring canonical then legacy: factory baseline (`03_master_data_handlers.gs` `fac_*`), overseas import + adjust (`05_overseas_inventory_handlers.gs` `wh_*`, incl. movement quantity columns). camelCase adapter keys (`currentStock`/`physicalStock`/…) intentionally UNCHANGED (stable internal API; frontend pages read camelCase, so no page change needed). Frontend overseas **import template** (`overseas-stock.js` `OVERSEAS_IMPORT_HEADERS`) left on legacy names until the live-migration deploy (server dual-accepts both) — flagged pending.
- **Specs canonicalized + Namespace Rule added:** DATABASE_RELATIONSHIP_MAP §6 (schemas + rule), INVENTORY_TABLE_MAPPING §3.0 rule + §3.1/§3.2 schemas, SHIPMENT_CENTER §2 factory schema + dot-prefixed factory refs, SUPPLY_PLANNING_CALCULATION_RULES formulas (§20.1/§23.1/§24.3), SUPPLY_CHAIN_SYSTEM_FLOW §5.4, SYSTEM_RUNTIME_ARCHITECTURE §7A table, WAREHOUSE_OPERATIONS §3, OVERSEAS_INBOUND. **Unrelated entity fields NOT renamed** (`request_order_line_sources.current_stock`/`.on_the_way_qty`, `shipment_lines.snapshot_current_stock`, allocation-draft `available_stock_snapshot`).
- **⚠ Unresolved (reported to owner):** `wh_quantity_before` / `wh_quantity_after` semantics — in the only implemented writer (manual adjustment) they record the `wh_available_stock` bucket before/after; the general per-movement-type contract is undefined. Renamed structurally; definition pending.
- **Verification:** `node --check` API JS + `03`/`05` `.gs` OK. **No unit values migrated. Live GET/write smoke tests + live header rename NOT performed (no Sheet access).** Redeploy of `03`+`05` PENDING. Fallback removal condition: after live headers renamed + verified.

Corrects the earlier assumption that `magnet_type` stays an enum (the 2026-07-21 "Battery/Magnet storage unchanged — canonical enums no_magnet/magnetic" note below is **superseded for magnet**). Files: `assets/js/pages/sku-details.js`, `assets/specs/active/apps-script/03_master_data_handlers.gs`; specs ADD_EDIT/DB-map/DOC-GEN/MASTER. `operation-system-db-api.js` unchanged (already JSON-serializes booleans; no stringify).
- **`magnet_type` → REAL Boolean.** UI field **Contains Magnet** (Yes→`true` / No→`false`). Frontend collect emits a Boolean (or omits when `— Select —`, preserving existing). Backend `handleUpsertSkuDetail_` now special-cases `magnet_type` → `skuMagnetToBool_` and writes an **actual Boolean cell** (`setValue(true/false)`), never a string; blank/unknown → `''` (never guessed). Shared normalizer `_skuMagnetBool` (frontend) / `skuMagnetToBool_` (backend): true-equiv {true,"true","yes","y","1","magnetic"}, false-equiv {false,"false","no","n","0","no_magnet"}, blank/unknown → null. **Explicit tokens only — no `Boolean(value)`** (proved: `Boolean("false")===true` but normalizer→false). Table shows Yes/No via `_skuMagnetDisplay` (never raw true/false). `battery_type` remains a semantic enum (unchanged); Material/Product Use remain exact ` + `-joined text (unchanged).
- **Legacy magnet compatibility:** legacy `magnetic`/`no_magnet`/`TRUE`/`FALSE` read safely and preselect Yes/No; on the next successful Update they are rewritten to canonical Boolean. **No bulk migration performed** (none requested). Legacy-row counts require live-Sheet inspection (not run in source task) — see report §7.
- **Series/Category Add-New = small confirm dialog** (title *Add New Series*/*Add New Category*, one input, Add/Cancel; Enter=Add, Escape/outside=Cancel). Arbitrary typing only filters; the committed value is `_skuComboData[id].value` (never auto-committed). Case-insensitive de-dup → selects the existing value instead of duplicating.
- **Temporary-until-save option lifecycle:** a confirmed new value is form-local temp state; shown in the current form's combo list only; **never** a master table, **never** the page filters, **never** leaked to another form. Discarded on dialog/form Cancel, Escape, outside-click, selection change, reload, **or a failed Create/Update**. Becomes a global option **only** via a successful `sku_details` Save (upsert reloads DB → next form open rebuilds DISTINCT persisted). No Series/Category master table, no independent Add API, no secondary write — the `sku_details` row is the only persistence event.
- **Verification:** `node --check` both JS + `.gs` OK; magnet-normalization unit tests **20/20** (Yes/No, legacy magnetic/no_magnet/TRUE/FALSE, `"false"`≠truthy, blank/unknown→null, write→real boolean/typeof boolean). Live browser E2E + actual DB-cell inspection after Create/Update **NOT run** (no live Sheet) — pending. **REDEPLOY:** `03_master_data_handlers.gs` must be copied to the live Apps Script project + redeployed for the Boolean write to take effect. Document HAS_MAGNET/LINE_HAS_MAGNET remain spec-only (derive from the Boolean; `true→TRUE`/`false→FALSE`).

## 2026-07-21 — SKU Regional Details Master-SKU/Country-Tab redesign + SKU Details corrections (FRONTEND SOURCE; no backend/DB/API change; live E2E pending)

**Regional page fully rebuilt Master-SKU-first** (`sku-regional-details.html`/`.js`/`.css`); **SKU Details corrections** (`sku-details.html`/`.js`/`.css`). No `.gs`/API/DB touched — existing `handleUpsertSkuRegionalDetail_` + `marketplaceSkuSyncIdentity_` + tax getters + `window.handleSkuTaxRates`/`openSkuMasterForm` all reused.
- **Regional toolbar:** single row — left Category → Series → Search SKU (options from `sku_details`, AND); right Add Regional Details. Removed the whole V1 Company/Country/Marketplace/Status/Coverage/language/packaging·manual·label·battery/date-range/More-Filters set.
- **Regional left panel = Master SKU list:** one row per Master SKU (SKU · Product Name · Series·Category), ~260–300px compact; wide right workspace; pagination 25/50/100 (default 50); selection preserved if SKU still matches, else cleared.
- **Regional right panel = country tabs:** standard US/CA/FR/DE/ES/UK/AU/JP ∪ any country present in data (not a whitelist); data tabs show count, empty show muted “Not configured” + Add {country}; active country preserved. Multiple Company·Marketplace in a country → deterministic second-level selector, **never silent first-pick**.
- **6 sections:** Overview / Marketplace / Packaging & Localization / Compliance / Tax & Commercial / Audit (identity not repeated everywhere).
- **Tax & Commercial = READ-ONLY join** to `tax_referral_rates`: resolved by Series + origin → duty (active country tab) + effective date (latest applicable `effective_from`, deterministic tiebreak) — **never first-row, never country-only**; `tax_rate_components` shown only when present (subsection hidden otherwise); Open HS Code & Tax Rates → canonical Series editor. No tax/pricing/Master write through Regional Edit.
- **SKU Details toolbar:** filter group (Category → Series → Search) left, action group (Add · Edit · CM/KG · Display · More Options) right with clear gap. **More Options items single-line** (`white-space:nowrap` + `width:max-content`) — no more two-line Import.
- **Friendly Battery/Magnet in the SKU table** (`_skuEnumDisplay`): canonical→bilingual labels, blank→`--`, unknown→verbatim + “(Legacy)”. Stored DB codes stay canonical enums (never Boolean).
- **Battery enum simplified (§E):** selectable = no_battery/alkaline_battery/lithium_battery; `rechargeable_lithium` retired from selection but readable as Legacy, **preserved verbatim on save unless the user explicitly edits Battery Type** (collect now returns the original legacy value when the enum is untouched; only an explicit change forces a canonical choice). Help text added. Doc HAS_BATTERY still treats it TRUE.
- **Verification:** `node --check` both JS OK; unit tests **16/16** (tax deterministic latest/duty-filter/multi-origin tiebreak/no-first-row; country-tab standard∪extra ordering + counts; friendly enum display incl. legacy). Live browser E2E (Regional CO1100-R country tabs, multi-marketplace selector, unconfigured-country Add, tax read-only, SKU toolbar grouping, More Options single-line, friendly labels, legacy preserve) **NOT run** — pending. **REDEPLOY:** none.

## 2026-07-21 — SKU Details toolbar + list filters + tag presets; document battery/magnet derivation corrected (FRONTEND SOURCE + DOC-SPEC; no backend/DB/API change; live E2E pending)

Two-part task. **Part 1 (SKU UI, frontend-only):** `assets/html/pages/sku-details.html`, `assets/js/pages/sku-details.js`, `assets/css/pages/sku-details.css`. **Part 2 (document mapping):** verified the doc battery/magnet resolver is **SPEC-ONLY (no code exists)** and corrected the spec derivation — **no runtime/DB/API touched.**
- **Toolbar:** reordered to Add · Edit · Search · Series filter · Category filter · CM/KG↔IN/LB · Display · **More Options** (far right). Export/Import/Refresh moved into a keyboard-accessible **More Options** menu (Escape + outside-click close; Import flagged as data-changing; Refresh never fires on open). Add/Edit stay primary.
- **Series/Category list filters:** DISTINCT values across all lifecycle groups (live from rows), natural-sorted; Search AND Series AND Category; grouping preserved; fully-filtered group shows a concise empty note; filters never mutate data, survive re-render/edit, and pick up new values after refresh. Search SKU behavior unchanged.
- **Creatable Series/Category combobox:** now always shows `＋ Add new …` (labelled `＋ Add new series: {typed}` while typing); persists only via normal `sku_details` Save.
- **Material / Product Use:** upgraded to **preset multi-select + creatable** (one shared control). Presets are UI defaults only (never a DB row/master). Multi-select chips, type-to-filter, `＋ Add new`, duplicate protection, order preserved. Serializer unchanged: exact ` + ` delimiter; legacy value without ` + ` loads as ONE preserved chip and round-trips verbatim unless edited (no split on `_`/comma/slash/space).
- **Battery/Magnet storage unchanged:** canonical enums (`no_battery`/`alkaline_battery`/`lithium_battery`/`rechargeable_lithium`; `no_magnet`/`magnetic`); friendly UI labels only; never store Yes/No/是/否 in the enum columns.
- **Document derivation correction (`DOCUMENT_GENERATION_SYSTEM_SPEC.md` §I.2.6 + 4 mapping rows):** replaced the old *"any value other than false/none/blank → 是"* (which wrongly made `no_battery`/`no_magnet` TRUE) with normalized-token classification: `no_battery`/`no_magnet`/false/no/n/0/blank ⇒ FALSE; battery enums + verified legacy (Lithium-Ion) / `magnetic` / true/yes/y/1 ⇒ TRUE; unknown non-empty ⇒ **unresolved warning** (never blind truthiness, no `!!value`). Business boolean ≠ display text (formatter renders 是/否). Header = OR across ALL lines (no first-row fallback); line = per-line. `BATTERY_TYPE`/`LINE_BATTERY_TYPE` type placeholders **do not exist → documented mapping gap, not added.** CARRIER_DOCUMENT_MAPPING_SPEC has no battery/magnet rows → no conflict.
- **Verification:** `node --check` OK; derivation algorithm **unit-tested 19/19** (no_battery/enums/legacy/unknown/header-OR incl. proof that `Boolean("FALSE")===true`); tag round-trip still 12/12. Live browser flows (menu a11y, filter combos, combobox add + refresh, preset multi-select, mobile) **NOT run** (no live Sheet) — pending. **REDEPLOY:** none (no `.gs` changed; doc resolver remains unimplemented). **Runtime status of derived doc fields: NOT IMPLEMENTED (spec-only).**

## 2026-07-21 — Add/Edit SKU form refinement: stable modal, creatable Series/Category, tag inputs, friendly enums, unit spacing (FRONTEND SOURCE; no backend/DB/API change; live E2E pending)

Focused UI/interaction correction to the unified `SkuMasterForm` (no redesign, no ownership change). **Frontend-only** — `assets/js/pages/sku-details.js` + `assets/css/pages/sku-details.css`; **no Apps Script, DB, schema, or API change** (existing `handleUpsertSkuDetail_` allowlist already covers `series`/`category`/`material`/`product_use`).
- **Stable top-anchored modal:** overlay `align-items:flex-start` + `padding:clamp(24px,8vh,96px)…`; dialog `max-height:calc(100vh − offset − 24px)`; header/tablist/footer `flex-shrink:0`, body `overflow-y:auto;min-height:0`. Header + tab bar no longer jump when switching Basic/Sales/Supplier/Logs; only the body adapts/scrolls.
- **Creatable Series/Category comboboxes** (`.skuf-combo`): distinct live `sku_details` values (trim, case-insensitive de-dup, natural sort) + `＋ Add new …`; Arrow/Enter/Escape; new value persists only via normal Save, appears after cache refresh. No master table. Input IS the value (`#sku-f-series`), so collect/validate unchanged.
- **Material + Product Use tag inputs** (`.skuf-tags`, one shared component): Enter/comma add, per-chip remove, Backspace-on-empty removes last, exact-dup rejected, order preserved. **Serializer = safe reversible `" + "`** (user-confirmed): `" + "` values split to chips; any other non-empty value (incl. bare-underscore legacy) loads as ONE preserved chip and is written back **verbatim unless edited**. Round-trip lossless; nothing mis-split. Residual typed text flushed on Save.
- **Friendly Battery/Magnet labels** (`.skuf-enum`): human-readable option text (`No Battery / 無電池`, `Magnetic / 含磁性`, …); submitted `<option value>` stays canonical code; legacy code → flagged `⚠ Legacy value: {raw}`, must be replaced before Save. Scoped class only — no global native-select restyle.
- **Dimension/weight unit spacing** (`.skuf-dim-grid` / `.skuf-wt-grid`): explicit column gap + `minmax(84px,auto)` unit column (no negative margins/overlap); stacks 2-col / 1-col under 640px. All three groups (Carton/Item/Package) consistent.
- **Preserved unchanged:** Add-vs-Edit mode, duplicate-SKU rejection, Edit-safe omitted-column preservation, lifecycle values + Running-transition factory baseline, Sales/Regional/Tax boundary, SKU double-click Edit, Supplier placeholder, Logs empty state, Save lock, structured error handling. New controls feed the same payload builder.
- **Verification:** `node --check` OK; tag parse/serialize round-trip **unit-tested (12 cases: `" + "` split, legacy-underscore-as-1-chip, dedup, odd spacing, verbatim round-trip) — all pass.** Live browser flows (tab-switch position, combobox add/refresh, tag round-trip, enum submit-code, mobile spacing, duplicate/preserve/baseline regressions) **NOT run** (no live Sheet) — pending. **REDEPLOY:** none. **Spec:** `SKU_DETAILS_ADD_EDIT_SPEC.md` §7 A/B, §11, §23 updated.

## 2026-07-21 — SKU Regional Details V1: Filterable Master–Detail Workspace (FRONTEND SOURCE; no backend/DB change; live E2E pending)

Replaced the wide all-field Regional table with the accepted Master–Detail Workspace. **Frontend-only (live on reload); no Apps Script, DB, schema, or API change** — the existing `handleUpsertSkuRegionalDetail_` + `marketplaceSkuSyncIdentity_` (composite key `sku+company+country+marketplace`, preserves omitted fields, deterministic sync) are reused unchanged; no new API accessor.
- **Files:** `assets/html/pages/sku-regional-details.html`, `assets/js/pages/sku-regional-details.js` (full rewrite), `assets/css/pages/sku-regional-details.css`.
- **Layout:** 40/60 Master–Detail; tablet narrows; mobile list→full detail + Back to Results. Header (title, total·shown counts, Add Regional Detail). Search (Master SKU / Site SKU / Product ID / Master name+Series via `getSkuDetails` join, debounced). Dependent filters Company→Country→Marketplace (Country never infers Company) + Status + Data Coverage + More Filters (Series/Language/packaging·manual·label·battery present-missing/Updated range); removable chips + Clear all.
- **List:** compact selectable items (no per-row Edit; distinct hover/focus/selected; keyboard Enter/Space/Arrows); **client-side pagination 25/50/100** (default 50; renders only the current page).
- **Detail:** pinned header + 6 tabs (Overview/Packaging & Label/Content & Localization/Compliance/Commercial/Audit), **canonical fields only**, blanks `—`. Audit shows created_at/updated_at + "Change author is not tracked yet." / "Detailed change history is not available yet."
- **Data Coverage:** neutral UI-derived `N/8 fields populated` (site_sku, marketplace_product_id, product_url, language, packaging_regulation, manual_version, label_version, battery_regulation); tooltip = not readiness/approval; **never stored, never Complete/Incomplete**.
- **Operational status join:** exactly-one `marketplace_skus` match by composite key → status/launch; zero → "Not linked"; multiple → "Ambiguous marketplace link"; **never first-row fallback** (unit-tested).
- **Edit/Add Regional Detail:** header-only Edit + Add; write via existing `KM.DB.upsertSkuRegionalDetail` (`sync_marketplace_sku:true` preserved); duplicate-submit guard, Saving…, error retention, selection/filters/page preserved. **View Master SKU** drawer (read-only); **Edit Master SKU** reuses the shared `window.openSkuMasterForm('edit')` (body-level modal). No Regional Save writes Master/Tax/Pricing.
- **Verification:** `node --check` OK; status-join + coverage logic **unit-tested (6 cases: one/active, one/inactive, zero→Not linked, multi→Ambiguous, cross-company→none, coverage 8/8 & 3/8) — all pass.** Live browser flows (render, filter dependency, pagination, selection, drawer, save round-trip, mobile) **NOT run** (no live Sheet) — pending.
- **Deferred/NOT IMPLEMENTED:** business completeness/required-field matrix, server pagination, permissions, full audit history, Regional content/certification/image fields, Save Draft; post-Master-edit Regional label refresh happens on next re-select/filter (no callback in V1).
- **REDEPLOY:** none (frontend ships with static bundle; no `.gs` changed). **Specs:** `SKU_REGIONAL_DETAILS_UI_UX_SPEC.md` §22 → IMPLEMENTED IN SOURCE V1.

## 2026-07-21 — Add/Edit SKU Unified PM Workspace + Factory Baseline trigger (RUNTIME SOURCE + SPEC; redeploy + live verify pending)

Implemented the accepted SKU Add/Edit spec. **Frontend live on reload; Apps Script `.gs` requires redeploy; live in-browser + live-Sheet E2E verification NOT yet performed.**
- **Unified `SkuMasterForm` (`sku-details.js`):** one component, `mode ∈ {add,edit}`, four accessible tabs — **Basic / Sales / Supplier / Logs**. `handleAddSku()` → `openSkuMasterForm('add')` (was a stub alert); `handleEditSku()` → `openSkuMasterForm('edit')`. Shared fields/enums/validation/payload/save-lock. Values persist across tab switches; failed Save marks the erroring tab + focuses the first invalid field; sticky footer; single active panel. **Replaces** the flat `SKU_EDIT_FIELDS_` modal + `saveSkuEdit` (removed); new field model `SKU_FORM_FIELDS_` + `SKU_DIM_GROUPS_`.
- **Add mode:** SKU editable + `Create SKU`; duplicate rejected. **Edit mode:** SKU read-only + `Save Changes`; loads current record. **Supplier tab** = read-only "not implemented yet" placeholder (form not disabled). **Logs tab** = created_at/updated_at only + honest "Change author is not tracked yet." / "Detailed change history is not available yet." (no fabricated rows).
- **Enums:** battery `no_battery/alkaline_battery/lithium_battery/rechargeable_lithium`, magnet `no_magnet/magnetic`, gs1 UPC/EAN/GTIN, currency + dim/wt units. Legacy/unrecognized stored values load intact, render flagged (amber) as a disabled "legacy" option, and require explicit canonical re-selection before Save (no silent coercion).
- **Sales tab:** `minimum_price/msrp/selling_price/base_currency` + baseline notice; Regional/Tax = navigation only (never writes Regional/Tax via the sku_details payload); tax route display `origin → duty` (e.g. CN → AU).
- **Backend (`03_master_data_handlers.gs`):** `handleUpsertSkuDetail_` now reads `body.mode` — **`add` rejects existing SKU** (`error_code:'duplicate_sku'`), **`edit` rejects missing SKU** (`not_found`); omitted-field preservation, `created_at` retained + `updated_at` set (unchanged); SKU match = trim + case-sensitive (existing convention, no case-folding invented). Backward-compatible when `mode` omitted.
- **Factory Stock baseline (`ensureFactoryStockBaseline_`, NEW):** fires ONLY on non-running → `Running in the Market` lifecycle transition (prev-lifecycle captured before mutation). Eligibility `is_active ∧ is_factory_warehouse`; idempotent by **`warehouse_id + Master sku`**; `current_stock=0`/`reserved_stock=0` where the column exists; never overwrites/duplicates; **fail-closed to structured `db_mapping_gap`** if `warehouses`/`factory_stock` sheet/columns are absent (never invents columns/tabs); partial failure → `status:'partial'` warning, not silent success. **No factory_stock code path existed before** (was documented as belonging elsewhere). Response carries `data.factory_baseline`.
- **API (`operation-system-db-api.js`):** `upsertSkuDetail` now attaches backend `error_code` to the thrown Error (duplicate_sku / not_found) for structured frontend handling; still resolves with `json.data` (incl. `factory_baseline`) after cache refresh.
- **Verification performed:** `node --check` OK on `sku-details.js`, `operation-system-db-api.js`, `03_master_data_handlers.gs`; **factory-baseline logic unit-tested with mock sheets (5 cases: eligibility filter, idempotent rerun, no-eligible, 2× db_mapping_gap) — all pass.** Live browser flows (modal render, tab switch, duplicate reject round-trip, real factory_stock write) **NOT run** (no live Sheet/deploy access) — pending.
- **REDEPLOY:** `03_master_data_handlers.gs` (only changed `.gs`). Frontend JS/API ship with the static bundle (live on reload). **Depends on the live `factory_stock` + `warehouses` sheets having the documented columns; otherwise the baseline step reports a DB Mapping Gap and is safely retryable.**
- **NOT changed / still NOT IMPLEMENTED:** Supplier Master, full audit history, Regional Detail editing (navigation only), marketplace_skus/pricing_list/tax_referral_rates writes, recommendation scheduler, Overseas Inbound, `pm` field meaning (OPEN DECISION). No Google Sheet header/column added by code (fail-closed instead).
- **Specs updated:** `SKU_DETAILS_ADD_EDIT_SPEC.md` §23 (IMPLEMENTED IN SOURCE), `INVENTORY_TABLE_MAPPING_SPEC.md` §17.3A.1 (factory trigger implemented-in-source; overseas ensure still NOT IMPLEMENTED).

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

## 2026-07-23 — Inventory UI unification + Inventory Adjustment closed loop (IMPLEMENTED)

- **A. Inventory Replenishment toolbar — "Actions" → "More Options".** Renamed + restyled to mirror the SKU Details `⋯ More Options` menu (light-grey trigger `#f1f5f9`/`#334155`, white panel, rounded corners, soft shadow, grouped items, right-aligned, viewport-safe). Kept the existing accessible behavior (aria-haspopup/expanded/controls, outside-click + Escape close, arrow/Home/End keyboard nav, focus return). **Search + Submit Plan stay primary — NOT moved into the menu.** Items unchanged (Add / Import / Edit / Delete SKU · Add Marketplace), each still reusing its existing handler. Files: `inventory-replenishment.html/.css/.js` (UI only).
- **B. SKU Details "changes data" badge hidden by default.** The badge was **static hardcoded HTML — there was no change-detection logic to preserve.** The visible pill is now `hidden` by default (no widening / trailing space); the "changes data" caution is preserved via `aria-label` + `title` (tooltip), and the badge element (`#importTemplateChangesBadge`) is kept hidden so any future detector can un-hide it. Import Template functionality untouched. File: `sku-details.html`.
- **C. Naming unified → "Inventory Adjustment".** Factory's dead `Edit` placeholder (`toggleFactoryStockEdit()`, defined nowhere) and Overseas's `Manual Adjustment` are both now **"Inventory Adjustment"**.
- **D–F. Inventory Adjustment closed loop (Factory + Overseas).** Modal-based (not inline): select ONE unique record (`warehouse_id + sku`) → shows SKU / Warehouse / Company / Country / (Site SKU for Overseas) / Current Available → enter **New Available** (integer ≥ 0) → `Adjustment Qty = New − Current` auto-computed & read-only, with a live "Current → New" preview. Reason/Note **required**; Reference ID optional; New = Current rejected; double-submit guarded; `created_by = 'operation-system'` (runtime identity, not user-entered). On success the page **re-GETs** the DB cache (never a front-end-only patch).
  - **Factory (NEW handler — no duplicate existed):** action `adjustFactoryInventory` → `handleAdjustFactoryInventory_` (`21_factory_inventory_handlers.gs`). Writes `factory_stock.fac_current_stock` **only** (`fac_reserved_stock` never touched) + one `factory_stock_movements` row **atomically** (script lock + snapshot rollback if the movement append throws). `after_current = new_available + before_reserved`; `qty = new_available − before_available`; invariant `after_current − after_reserved === new_available`. Movement: `movement_type='manual_adjustment'`, `related_entity_type='inventory_adjustment'`, `related_entity_id=ADJ-YYYYMMDD-XXXX`, `factory_stock_movement_id=FSMV-<8hex>`, 4-way before/after audit columns. New writer accessor `KM.DB.adjustFactoryInventory`. Normalizer `normalizeFactoryStockMovementRecord` extended to read the 4-way columns + derive available before/after.
  - **Overseas (EXTENDED existing handler — did NOT create a second API):** `handleAdjustOverseasInventory_` reworked to accept `new_available` (signed `adjustment_qty` still accepted for back-compat), require `note`, and write the full canonical movement: `movement_type='manual_adjustment'` (was `'adjustment'`), `movement_scope='available_stock'`, `from_stock_type=''`, `to_stock_type='available'`, `reference_type='inventory_adjustment'` (was `'manual'`), `reference_id=ADJ-…` (backend), `source_module='overseas_inventory'` (was `'overseas_stock'`), plus `wh_before/after_available/physical/reserved_stock` (only available changes; reserved/physical recorded unchanged). Now lock-guarded with snapshot rollback. Historical rows keep old values; readers fall back gracefully. **No incompatible enum invented** — `from/to_stock_type` stay within `available|reserved|damaged|on_the_way|none` (empty allowed).
- **G. Movement Log UI.** Both logs read the real movement tables, most-recent-first, empty-state preserved. Factory: added a **Movement Type** filter; columns now show **Available Before → Available After** and **signed Adjustment Qty (+N/-N)**. Overseas: added **Warehouse** + **Movement Type** filters; Quantity now shows signed +N/-N. (Both keep SKU + Date range + existing filters.)
- **DB / Enum changes:** `related_entity_type` gains `inventory_adjustment` (factory movements). Overseas movement value changes as above (documented, forward-only). No new tables, no parallel inventory truth, no schema renames — `fcWriteEnsureColumns_` only appends missing canonical columns additively.
- **Tests / syntax:** NEW `assets/tests/inventory-adjustment.test.js` (acceptance cases H — Factory 120/20→75 ⇒ qty −25 / after_current 95 / reserved 20; Overseas 300→340 ⇒ +40, reserved/physical unchanged; negative / same / non-integer / empty-note rejections; signed display) — **passes**. `node --check` OK on `inventory-replenishment.js`, `factory-stock.js`, `overseas-stock.js`, `operation-system-db-api.js`, `21_factory_inventory_handlers.gs`, `05_overseas_inventory_handlers.gs`, `01_router.gs`.
- **REDEPLOY Apps Script (pending authorization):** copy all `.gs` together — **NEW** `21_factory_inventory_handlers.gs`, **CHANGED** `05_overseas_inventory_handlers.gs` + `01_router.gs` (new action `adjustFactoryInventory`). The monolithic mirror `apps-script-web-app.gs` must be re-synced from the numbered files at deploy time. Browser/live-DB manual verification of the two adjustment flows is still pending (no code path faked).

## 2026-07-23 — Promotion Risk Tracker rebuilt on real marketplace_skus + site filter gate (frontend)

- **Scope of change:** frontend only (`assets/js/pages/campaign-risk.js`, `assets/html/pages/campaign-risk.html`, `assets/css/pages/campaign-risk.css`). No calc/API/DB/handler change. The **risk formula is unchanged** (trailing-90-day + committed-future promo-days; ≥29 High, ≥15 Watch, else Safe) — only its INPUTS and gating changed.
- **Data authority (was 100% mock):** the page previously built SKUs from `window.upcomingSkuData` + a hardcoded `inventorySkuAvailabilityMock`, defaulted to US/Amazon, keyed on plain `sku`, and stored promotions in localStorage. Now: **SKU universe = `marketplace_skus`** (scoped by company+country+marketplace + active status; `KM.DB.getMarketplaceSkus()`), **joined to `sku_details`** (`getSkuDetails`) for Product Name / Image / Category / Series. **Promotions = real `campaigns` + `campaign_sku_lines`** (`getCampaigns`/`getCampaignSkuLines`), matched to site-SKUs by **`marketplace_sku_id`** (canonical; `sku` fallback only when a promo has no id). Mocks (`countryMarketplaceMap`, `inventorySkuAvailabilityMock`, `defaultPromotionMockData`, window-SKU globals) removed.
- **Row uniqueness = `marketplace_sku_id`** (never plain `sku`), so the same SKU across KM/ResUS or US/CA are separate rows and never cross-contaminate inventory/promotions (acceptance case 10).
- **Filter gate (primary ask):** no site is defaulted. `CampaignRiskState.country/marketplace/company` start empty; Country → Marketplace (→ Company) dependent dropdowns are derived from active `marketplace_skus` (mirrors the Inventory Replenishment cascade). One marketplace auto-selects; one company auto-resolves (selector hidden); multiple companies show the Company selector (never silently merges companies). SKUs load only after a full scope resolves; category/series apply after. A country switch bumps `_crLoadToken` and clears prior rows before rendering the new scope (no stale overwrite).
- **Inventory:** the current risk formula consumes **promotions only** (not inventory/forecast), so NO parallel inventory truth is computed here. If a future formula needs inventory it must reuse `window.IRMap` (the Inventory Replenishment aggregate) — noted as remaining work, not duplicated.
- **States:** (1) no scope → "Select a country and marketplace to view promotion risk." + KPIs 0; (2) scope w/ no active SKUs → "No active marketplace SKUs were found for this site."; (3) SKUs but no promos → rows render, Total Promos 0 (Safe), NOT "No SKUs"; (4) load error → error + **Retry** (`crReload`), never treated as empty; (5) promotion missing a parseable date range → **Missing Data** risk (never silently Safe; excluded from all three KPI cards).
- **Add/Delete Promotion:** SKU selector scoped to the current `marketplace_skus`; records stamped with `marketplace_sku_id` + `company`; buttons disabled until a full scope is selected. Delete is scope-locked and searches only the user-added overlay, so real campaign lines and other countries'/companies' promotions can never be mis-deleted.
- **Remaining API work:** (a) a scoped `marketplace_skus` GET (country/marketplace/company/status) — today only whole-table `getOperationDb` exists, so scoping is front-end `.filter()`; (b) persist user-added promotions to real `campaigns`/`campaign_sku_lines` via `upsertCampaign`/`upsertCampaignSkuLines` (writers exist) and a campaign-line delete/soft-delete handler (none exists) — until then Add/Delete use the local overlay, merged read-only with real campaign lines.
- **Tests / syntax:** logic test (gate, marketplace_sku_id isolation, unchanged thresholds, Missing Data) passes; `node --check` OK on `campaign-risk.js`. Live in-app visual verification at the acceptance viewports/flows still pending.

## 2026-07-23 — Supply Chain Control Tower spec RECORDED; build gate NOT met (no implementation)

- **Action taken:** recorded [`SUPPLY_CHAIN_CONTROL_TOWER_SPEC_V1.md`](../../docs/planning/SUPPLY_CHAIN_CONTROL_TOWER_SPEC_V1.md) to preserve the intended architecture (spec §1), and ran the §11 pre-coding audit. **No Control Tower code was written** — the spec's Implementation Gate requires the owner to confirm the upstream closed loop is finalized/verified, and it is not. Per §11 I stopped and reported.
- **Dependency matrix (build-gate §9 vs. live code, 2026-07-23):**
  1. 90-Day replenishment formula / risk windows — **NOT implemented.** Recommendation engine inactive (`inventory-replenishment.js:1554` "the recommendation engine is not active"); Request Order Suggest Order & Risk are placeholders (`request-order.js:1013` "until the calculation engine exists", `:1031` "placeholder until risk engine").
  2. Qualified Incoming / ETA treatment — **NOT implemented.** No ETA projection handler; no `shipment_routes`/`shipment_route_nodes`/`shipment_events` in `validTabs` (03_master_data_handlers.gs) → not even fetched.
  3. Residual Uncovered Requirement — **NOT implemented** (depends on #1).
  4. Order recommendation / MOQ / carton / lead-time — **NOT implemented** (Suggest Order placeholder).
  5. PO completion / remaining / unreceived formulas — **PARTIAL.** `receivePurchaseOrderLines` handler exists (increments `completed_qty`); no unreceived/remaining projection formula verified.
  6. Allocation & anti-double-count — **NOT implemented.** Allocation handlers are "PLANNING SCRATCHPADS: they do NOT reserve or deduct stock" (`15_request_allocation_handlers.gs:11`); no canonical reservation truth.
  7. Shipment reservation & deduction — **NOT implemented.** Overseas outbound ship-confirm/reserve unbuilt (no `shipConfirm`/`reserve` action); `createShipmentFromPlan`/`updateShipment` exist but don't reserve/deduct inventory.
  8. Route / event / ETA projection — **NOT implemented** (no route/event tables or handlers).
  9. Delivered vs Received — **NOT implemented.** Overseas inbound receipt operation is spec-only (no `receiveInbound` action; `overseas_inbound_operations`/`_receipts` tables not created).
  10. Inbound / Outbound & movement mapping — **NOT implemented** (spec-only per the 2026-07-23 Overseas workspace audit).
  11. Recalculation triggers (delay/receipt/cancel/variance) — **NOT implemented** (depends on #1–#10).
  - **Implemented & usable as authorities today:** `factory_stock`/`factory_stock_movements` (+ new `adjustFactoryInventory`), `overseas_inventory_snapshot`/`overseas_inventory_movements` (+ `adjustOverseasInventory`), `shipments`/`shipment_lines`, `request_orders`/`request_order_lines`, `purchase_orders`/`purchase_order_lines`, `campaigns`/`campaign_sku_lines`, `marketplace_skus`/`sku_details`. These are read-model inputs but do NOT by themselves close the risk→order→allocation→shipment→ETA→receipt loop.
- **Unresolved authority/lifecycle conflicts to resolve before the gate opens:** recommendation/risk engine ownership + formula; a canonical allocation/reservation record (current allocation is a non-reserving scratchpad); overseas inbound-receipt & outbound ship-confirm handlers + tables + movement constants (the one deferred inbound-receipt `movement_type`/`reference_type`/`source_module` is still undefined); shipment route/event/ETA projection model + tables; Delivered-vs-Received posting; recalculation triggers. Apps Script redeploy for the already-built inventory adjustment handlers is also still pending.
- **Result:** Control Tower implementation remains blocked. Files changed this round: the new spec doc + this entry only.

## 2026-07-23 — 3D Global Shipment Map spec recorded + audit; route-runtime/map code NOT built (conflict report)

- **Action taken:** recorded [`GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md`](../../docs/planning/GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md) + [`logistics_locations_import_template.csv`](../../docs/planning/logistics_locations_import_template.csv) + [`LOGISTICS_LOCATIONS_SEED_CHECKLIST.md`](../../docs/planning/LOGISTICS_LOCATIONS_SEED_CHECKLIST.md), and ran the spec's §13 pre-coding audit. Per §13 step 2 (conflict report before editing when live schema differs), **no route-runtime, read-model, or map-UI code was written** — the safe, non-fabricating M1 groundwork (recorded schema + import template + unresolved-location workflow + seed checklist) was delivered instead.
- **Existing-state audit (evidence):**
  - `logistics_locations` — **does not exist** anywhere (greenfield): 0 hits in `*.md`/`*.gs`/`*.js`, not in `validTabs`, no normalizer/accessor.
  - Route **templates** `shipment_route_templates` / `shipment_route_template_nodes` — **owner-maintained live sheets** (SSOT `SHIPMENT_ROUTE_AND_EVENT_SPEC.md` §4.A/B), template-node geography is **inline** (`country/region/city/latitude/longitude`), **not** in `validTabs`, no adapter → not wired to code. **Must not recreate/clear/normalize.**
  - Route **runtime** `shipment_routes` / `shipment_route_nodes` / `shipment_events` — **SPEC-ONLY, not implemented** (`SHIPMENT_ROUTE_AND_EVENT_SPEC.md:13`; `DATABASE_RELATIONSHIP_MAP.md:606,614` "Runtime build = Phase-1 P1-E"): not in `validTabs`, 0 write handlers, 0 adapter. The `shipment_route_nodes.location_ref_type`/`location_ref_id` seam is the reserved hook for a location-master FK.
  - `warehouses` — **no coordinates** (`normalizeWarehouseRecord` has country/city/state/logisticsRegion only). A location master must supply lat/long and link via `warehouse_id`.
  - `shipments` — destination `warehouse_id` + free-text `ship_from`/`destination`; **no origin/destination warehouse pair, no `transit_type`/`transport_mode`** (mode = `shipping_method` + `last_mile_delivery`); has etd/eta/actuals/tracking. `shipment_lines` carry no geography.
  - No route/event/reroute/carrier-event/ETA actions in `01_router.gs`. No map page/component/library/token in the frontend (build from scratch; only Chart.js + ExcelJS are loaded).
- **Conflicts requiring owner resolution before build (§13 step 2):**
  1. **Roadmap phase conflict** — existing authority places World Map at **Phase 2 / deferred / secondary** (`SYSTEM_ROADMAP` P2-A; `SUPPLY_CHAIN_SYSTEM_FLOW:46`; `WAREHOUSE_OPERATIONS_SPEC:210` "Do NOT make the map the primary operation interface"; `project-current-state` "World Map: deferred"), whereas this spec is framed Phase-1 "may proceed now." Needs an explicit reconciliation.
  2. **Data-source dependency unbuilt** — the map reads route runtime (`shipment_routes`/nodes/`shipment_events`), which is P1-E spec-only; `shipments`/`shipment_lines` alone cannot draw a real multi-node route (no route/coordinate/origin-warehouse/transit fields). Rendering a route now would require fabricated shipment paths — **forbidden by the spec's hard rules**.
  3. **No location data + no warehouse coordinates** — greenfield master; per the §13 no-data clause, schema/template/workflow delivered and a seed checklist returned; coordinates must be owner-provided (not guessed).
  4. **Superseded schema conflict** — `SHIPMENT_DATABASE_SCHEMA.md` (lines ~756-809) still defines an OLD one-row-per-node route/event model that contradicts the richer SSOT `SHIPMENT_ROUTE_AND_EVENT_SPEC.md` (which marks that model SUPERSEDED). Align to the SSOT; the old doc should be annotated superseded.
  5. **Map provider / licensing** — no library or token present; provider/token/tile-license/geocoder-persistence rights must be chosen + verified before any deploy; no token may be committed.
- **Safe next step (M1, on approval):** add `logistics_locations` as a read table (+ `validTabs` + normalizer + accessor) and a Preview→Validate→Apply import handler (additive, redeploy-pending); add the additive node FK columns to the template/route-node schema **without touching owner data**. M2 (route runtime) is a prerequisite for any real map rendering and remains P1-E. Files changed this round: the 3 new docs + this entry only (no code).

## 2026-07-23 — Overseas Inbound / Outbound converted from read-only Architecture Review → interactive Operation Workspace (Preview Mode)

- **Action taken:** replaced the read-only "Architecture Review" field tables on both Overseas Inbound and Overseas Outbound with a **fully interactive Operation Workspace** (list → KPI strip → create/edit drawer → warehouse selector → shipment mapping → SKU-lines editor → lifecycle actions → Movement/Inventory Impact preview → empty/loading/error states). The **operation lifecycle runs in an in-memory session store (Preview Mode)** — it does **not** persist and does **not** post inventory movements — because the runtime tables/handlers are still spec-only.
- **Why Preview Mode (honest scope):** `overseas_inbound_operations` / `overseas_outbound_operations` (+ `_operation_lines` / `_receipts` / `_confirmations`) from `OVERSEAS_INBOUND_SPEC.md §10` / `OVERSEAS_OUTBOUND_SPEC.md` are **NOT implemented** — 0 tables, not in `validTabs`, no writer, no `KM.DB` method, no router action (`receiveInbound` / `shipConfirm` / `reserve` all absent). Building a "real" persisting UI would require fabricating a backend. Preview Mode keeps the full interaction real while never faking success.
- **What is REAL vs PREVIEW:**
  - REAL (read from `KM.DB`): warehouse selector (active, non-factory overseas warehouses), shipment mapping + SKU lines (`shipments` / `shipment_lines`), and the **current** overseas inventory used as the baseline for the Movement/Inventory Impact projection (`overseas_inventory_snapshot`). Operation list is seeded from real shipments whose destination warehouse resolves to a managed overseas warehouse (§9 auto-create model).
  - PREVIEW (in-memory only, `KM.OverseasOps._sessions`, cleared on reload — NOT localStorage): operation status, entered good/damaged/reserved/shipped quantities, lifecycle transitions, and the **projected** movement delta. Every mutating step is badged "Preview — not persisted / not posted".
- **Lifecycle modeled** — Inbound: `draft → submitted (pre-advice) → acknowledged → receiving → received → closed` (+ cancel/exception); Outbound: `draft → locked (reserve) → submitted → acknowledged → picking → packed → ready_to_ship → shipped → closed` (+ cancel/release). Movement projection honors the specs: inbound good qty → `available_stock`, damaged → `damaged_stock` (never sellable), Delivered ≠ Received; outbound Lock = available→reserved, Ship Confirm = current_stock AND reserved_stock −actual shipped qty.
- **Files changed:** `assets/js/pages/overseas-ops-preview.js` (NEW — shared `KM.OverseasOps.createController` engine + helpers), rewrote `assets/js/pages/overseas-inbound.js` + `overseas-outbound.js` (direction configs), rewrote `assets/html/pages/overseas-inbound.html` + `overseas-outbound.html` (workspace shell), rewrote `assets/css/pages/overseas-ops.css` (`.oow-*` workspace styles; removed the old `.ovs-*` review styles — overseas-stock keeps its own scoped `.ovs-*`), `index.html` (added the shared script tag; menu badges Review → Preview), NEW `assets/tests/overseas-ops-preview.test.js` (14 assertions, all pass), NEW `docs/planning/overseas-ops-preview-demo.html` (local demo harness that loads the real CSS+controllers with sample data for visual/screenshot review).
- **Layer status:** UI = **implemented** (interactive Preview). Handler = **NOT implemented** (spec-only). DB tables = **NOT implemented** (spec-only). Inventory movement = **NOT connected** (projected only; nothing posted). Tested = **yes** (Node logic test; no live-DB E2E because the operation backend does not exist yet).
- **Known preview approximation:** shipments carry only a structured **destination** `warehouse_id` (origin is free-text `ship_from`), so the Outbound list/drawer defaults its "origin warehouse" to the shipment's structured warehouse and lets the operator pick a qualifying overseas warehouse. A structured origin-warehouse field (or the route-runtime origin node) is needed for a non-approximate outbound origin — tracked with the P1-E route runtime gap.
- **Spec note:** `OVERSEAS_INBOUND_SPEC.md` / `OVERSEAS_OUTBOUND_SPEC.md` remain "runtime NOT implemented"; a Preview-Mode UI now exists as a non-authoritative front-end shell that will bind to the real writers once §10/§11 handlers are built (no drawer rework expected — the lifecycle actions already map 1:1 to the planned handler calls).

## 2026-07-23 — GLOBAL_3D_SHIPMENT_MAP_SPEC updated to v2.0 (formal, canonical-synced; spec-only)

- **Action taken:** rewrote [`GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md`](../../docs/planning/GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md) from a recorded v1 into a formal, implementation-guiding v2.0 after a full re-read + code audit of the Shipment, Route/Event, Carrier, Warehouse, Overseas Inbound/Outbound, Document, and DB-relationship specs. **No frontend/backend/DB code or migration** this round.
- **Canonical decisions applied:** (1) map repositioned as **primary visual monitoring + primary Shipment action entry**, still non-authoritative; (2) **read/write separation** — `GET /api/shipment-map` stays read-only, all mutations route to canonical handlers; (3) every map action bound to a **real** handler — only `updateShipment` (status/ETD/ETA/dates/return-to-draft/done) and `createShipmentFromPlan` are IMPLEMENTED; add-event / assign-route / reroute / confirm-pickup-departure-arrival (as events) / open-inbound-receipt / document actions map to **spec-only** `shipment_events`/`shipment_routes` (P1-E), the Overseas Inbound operation, and the Document Engine — **no parallel handler invented**; (4) coordinate authority corrected — template-node inline lat/long **deprecated** (retained as legacy fallback, owner data untouched), authority = `logistics_locations` via `logistics_location_id` + new `location_resolution_type {fixed_location, origin_warehouse, destination_warehouse, runtime_event, virtual, unresolved}` + `location_ref_type/id`; runtime-node coordinate snapshot **retained**; (5) Delivered ≠ Received boundary kept (Confirm Arrival ≠ Open Inbound Receipt); (6) planned timeline = ETD base + **cumulative** `default_offset_days`; (7) ETA priority + `eta_source` enum + change-record fields; (8) full Map UI / Drawer / Update-Shipment Workspace / Permissions / Audit-Concurrency sections; (9) Implementation Readiness Matrix + M1–M5.
- **Cross-spec conflicts found (owner sync required; NOT edited this round):**
  1. **`carrier_services` / `carrier_service_schedules` do not exist** in the canonical carrier model → schedule-based ETA is future/conditional; v1 ETA is schedule-free (lead time + cumulative offset). Spec does NOT add either table.
  2. **`lead_time_basis` column + enum do not exist** — lead-time basis is narratively fixed (Ship Confirm/Carrier Handover → Delivered). A configurable basis is flagged PROPOSED.
  3. **Only `updateShipment` + `createShipmentFromPlan` are live** Shipment handlers; the other requested action names are spec-only concepts (P1-E route/event ledger, Overseas Inbound, Document Engine).
  4. **`shipments` has no version/ETag field** → optimistic concurrency (required for map writes) is a prerequisite to add to the Shipment authority; current `updateShipment` is last-write-wins.
  5. **World Map positioning conflict** — `WAREHOUSE_OPERATIONS_SPEC.md:210` ("Do NOT make the map the primary operation interface") + `SYSTEM_ROADMAP.md` P2-A (Phase 2) vs this spec's primary/Phase-1-M1 framing. Recorded as an owner decision to sync.
  6. **Superseded route/event model** in `SHIPMENT_DATABASE_SCHEMA.md` (one-row-per-node `shipment_routes`; single-`source` `shipment_events`) conflicts with the SSOT `SHIPMENT_ROUTE_AND_EVENT_SPEC.md` — annotate SUPERSEDED (owner).
  7. **Warehouse `subdivision_code`/`district`** are not in the `warehouses` schema today (they live in `logistics_locations`); adopting them on `warehouses` is a proposal deferred to the Warehouse authority. `inventory_owner_company`/`default_distance_unit`/`default_mass_unit` are already absent (nothing to remove).
  8. **"~352 physical warehouse rows"** is owner-asserted, **not verifiable in-repo**; warehouses currently have no coordinates (greenfield) — recorded as owner-asserted, not fact.
- **Readiness:** M1 (location master + map shell + preview drawer) can begin now; full runtime map is **blocked** on route runtime (P1-E), ETA/timeline runtime, the scoped read model (current adapter is whole-table GET only), owner-provided coordinates, the concurrency guard, and a map provider/licensing decision.
- **Files changed:** the spec doc + this entry only (no code).

## 2026-07-23 — Shipment Overview + Global Map read-only-execution / handler-driven-lifecycle canonical sync (spec-only; Runtime Mapping Sync PAUSED)

- **Action taken:** synced two canonical specs to one rule — *"Shipment execution fields are read-only, but lifecycle actions are handler-driven action entries"* — with the SAME authority boundary for Shipment Overview and the Global 3D Shipment Map. **No code / DB / handler / runtime-mapping work.** Canonical Runtime Mapping Sync is **PAUSED until `logistics_locations` is finalized.**
- **`SHIPMENT_CENTER_SPEC.md`:** refined §5 role line (no longer "whole page read-only"); added **§5.1** — read-only execution field list, the six allowed lifecycle actions (Update Status / Record Event / Advance Route Progress / Confirm Arrival-Delivered / Open Inbound Receipt / Receipt Confirmation), `Advance →` reclassified as a lifecycle status action (not inline edit), Action→Handler→DB→Read-Model flow, per-table write relationship, this-round permissions, audit/concurrency (+ note that `shipments` has no version column yet), UI states, and the Delivered≠Received boundary; plus the PAUSE note.
- **`GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md` → v2.1:** added **§2.1** (same read-only + narrowed six-action scope + pause banner + Action→Handler→DB→Read-Model flow + permissions/audit/UI states); narrowed **§17** (broad actions = gated, NOT default-open) and **§20** (default-open permission subset); added **§30** current live `shipment_events` / `shipment_routes` columns (authoritative until Runtime Mapping Sync; no column add/remove/rename; no second map tables; no event projection / location resolution this round); added **§31** Route Data Review — **Nodes 0-byte blocker removed** (400 rows / 32 route IDs received; DE = `SRT-TOP-CN-DE-TR-P-V1`, 15 nodes), DE Nodes 12/13 Belgium Import Customs / Carrier Handover flagged for review (not edited), Alashankou/Khorgos still unresolved (not assumed); bumped status to v2.1 + decision-log entry.
- **Authority reaffirmed:** Map/Overview never store a second Shipment state; only canonical Shipment/Inbound Receipt handlers mutate; Map API/Read Model stays read-only; no frontend optimistic-success; Carrier Delivered ≠ Warehouse Received; overseas inventory changes only via formal Receipt Confirmation.
- **Deferred (unchanged, paused):** logistics_locations FK/coordinate snapshot mapping, route version-header vs one-row-per-node reconciliation, event projection, location resolution, ETA/timeline runtime — all part of the paused Canonical Runtime Mapping Sync + still-unbuilt P1-E route/event runtime.
- **Files changed:** `SHIPMENT_CENTER_SPEC.md`, `GLOBAL_3D_SHIPMENT_MAP_SPEC_V1.md`, this entry. No code.

## 2026-07-23 — Global Logistics Map v1 implemented (integrated page; read-only; additive getters)

- **Action taken:** built the first-version **Global Logistics Map** page, integrated into the live system (Sidebar → Carrier / Route), reading REAL data via the API Adapter with new **read-only** getters. No writes, no geocoding, no DB migration, no changes to Route Templates / Route Nodes / Route IDs.
- **Files changed:**
  - NEW `assets/js/pages/global-logistics-map.js` (read model + centralized coordinate resolver + 3 modes + inline SVG map + filters + summary + route step panel + pin drawer + states), NEW `assets/css/pages/global-logistics-map.css` (scoped `.glm-*`), NEW `assets/html/pages/global-logistics-map.html` (shell).
  - `assets/js/api/operation-system-db-api.js` — added normalizers + payload mapping + getters `getLogisticsLocations` / `getShipmentRouteTemplates` / `getShipmentRouteTemplateNodes` / `getShipmentEvents` (all READ-ONLY, [] when tab absent). Added `_geoNum` (blank/out-of-range → null; never 0,0).
  - `assets/specs/active/apps-script/03_master_data_handlers.gs` — appended `logistics_locations`, `shipment_route_templates`, `shipment_route_template_nodes`, `shipment_events` to BOTH `validTabs` arrays (getOperationDb + getTable). **Redeploy required** for the frontend to receive these tabs; getOperationDb safe-falls-back to [] for absent tabs (backward-compatible).
  - `index.html` — CSS link, menu item (Carrier / Route), mount div, script tag.
  - `assets/js/app.js` — both `sectionMap` copies (`global-logistics-map` → `global-logistics-map-section`).
  - NEW `assets/tests/global-logistics-map.test.js` (22 assertions, all pass), NEW `docs/planning/global-logistics-map-demo.html` (local harness: real CSS+code + sample data for visual/screenshot review).
- **Coordinate resolver (centralized, §D):** RUNTIME_EVENT → SELECTED_LOCATION → CANONICAL_LOCATION / GATEWAY_REFERENCE → TEMPLATE_DISPLAY (fallback) → UNRESOLVED. Location canonical coordinate outranks node template display; shipment event outranks both; blank/invalid/0,0 never drawn.
- **Modes:** Global Reference (all located locations + gateways; coordinate-pending listed, not pinned), Route Template (32 templates selectable → ordered nodes → resolvable pins + antimeridian-safe polyline + Route Step Panel showing fixed/candidate/dynamic/virtual/unresolved), Shipment Runtime (adapter + resolver + formal empty state; no fake shipment).
- **Map tech:** dependency-free inline SVG equirectangular projection (no external tile/library/token; cannot fail to load; degrades to list + step panel). Documented limitation: schematic grid, not a geographic basemap; Leaflet+OSM is a future richer option pending the spec's tile-license verification.
- **Data authority preserved:** Route Templates (32) / Route Nodes (427 replacement set) / Route IDs untouched — READ-ONLY. Warehouses without coordinates are NOT pinned (shown coordinate-pending). No `logistics_location_id` column added to node schema (read defensively; join via existing fields).
- **Known dependencies / limitations:** live `logistics_locations` (~398) / gateway (~47) / route-node (~427) data + Apps Script redeploy are required for the page to show real pins (until then the adapter safe-returns [] and the page shows coverage-pending / empty states); route runtime (`shipment_events`) is spec-only P1-E so Runtime mode shows an empty state on live data today; multi-candidate gateway expansion needs a candidate-list field that is not in the confirmed schema (single candidate pin only, no fabrication).

## 2026-07-23 — Request Order second-layer data connection (FC / Target% / Special Events / Factory Orders); no new formulas

- **Action taken:** connected the Request Order (下單系統) second layer to canonical data. **No new T1/T2/T3 recommended-qty formula, no Supply Planning MD change, no schema change, no Apps Script change → NO redeploy required** (all getters/writers already existed).
- **Edit Target %** (modal) — was read-only; now editable **N+1~N+3** (Month / Current / New). Saves to canonical `fc_target_rules` via the existing `KM.DB.upsertFcTargetRule` (same path as FC Summary). Per-year grouping across the 3-month window; round-trips the existing SKU-scope rule's `target_rule_id` to dedupe; seeds the other 11 months from the current effective target (no regression); scope = SKU + row marketplace + year. Default 100% (blank ≠ 0). Applies to Base FC only.
- **FC Update** (modal) — was read-only; now editable **N+1~N+3** Base FC. Saves via the existing `KM.DB.importFcRegularForecastBatch` (business key year+company+country+marketplace+sku); preserves the other 11 months, sets only edited months; integer ≥ 0, blank = no change.
- **Special Events** — first-layer `specialEventsFc` now shows the real **N+1~N+3** total (was hardcoded null); second-layer Upcoming Events now buckets by **Preparation Date = Event Start − 30 days** (canonical), month column = calculation month, and shows Event / Event Date / Prep Date / FC Qty. First-layer total == second-layer active window sum. Special-event FC never × Target%. Blank status treated as active (live header may lack `status`).
- **Factory Orders / In Production** (card B2) — was a `--` placeholder; now real `purchase_orders ⋈ purchase_order_lines` for **Current / Next / Month-After-Next** completion months. Bucketed by line `expected_completion_date` (header fallback; never created_at/order_date). Columns: Scheduled (Outstanding = MAX(ordered−completed,0)) and Completed (completed_qty). cancelled/closure excluded. Planning visibility only — **never written to factory_stock**.
- **Shared:** all month windows now use **Asia/Taipei** current date (`_roTpeNow` + `_roMonthWindow`); cross-year handled; internal YYYY-MM keys. Modals have loading / empty / error / success + save-disabled-while-saving states (no alert, no demo fallback, no optimistic fake success); on success re-read the force-reloaded cache and re-render keeping the row expanded.
- **Files changed:** `assets/js/pages/request-order.js` (helpers + panel + modals), `assets/css/pages/request-order.css` (scoped editor-modal styles), NEW `assets/tests/request-order-data-connection.test.js` (13 assertions, all pass), this entry.
- **Not touched:** Request Order Draft approval / company allocation / Manual Allocation Mode (request-order-draft.js), Request Order → PO conversion, Purchase Order Workspace/Overview UI, Shipment Center, Factory Stock reservation/deduction, T1/T2/T3 recommended-qty algorithm, Risk/Recommendation engine, DB schema, Planning MDs.
- **Known limitation / conflict:** `fc_special_events` live sheet header may still lack `status`/`source` (FC_SUMMARY_SPEC pending reconciliation) — read is safe (blank status = active), no MD overwritten. Target rules upsert on `target_rule_id` only (no scope business key); mitigated by round-tripping the id + marketplace-exact matching so RO edits never duplicate or mutate a broader rule.

## 2026-07-24 — On-the-Way / Shipment Runtime page reworked into a real operational tracking center

- **Action taken:** reworked the On-the-Way page (`global-logistics-map.js`) from a location/reference-map into a Shipment-Runtime operational tracking center wired to canonical `shipment_routes` + `shipment_events`. Audit-first; no DB normalization; no unrelated refactor.
- **Adapter (additive, read-only):** added `normalizeShipmentRouteRecord` + payload mapping + `KM.DB.getShipmentRoutes` for `shipment_routes` (runtime route NODES). **Apps Script:** appended `shipment_routes` to BOTH `validTabs` arrays (`03_master_data_handlers.gs`). **Redeploy required** for the frontend to receive the `shipment_routes` tab (getOperationDb safe-falls-back to [] until then).
- **Page mode:** On-the-Way runtime is now the default + primary view. Route Template / Global Reference removed from the main tab bar → moved behind a "Reference / Admin" control (non-default; underlying functionality retained, not deleted).
- **KPIs (shipment-grain):** On the Way · Customs Clearance · Exceptions · Arriving Soon · Delayed · Delivered Today — each shipment counted at most once per KPI (never route-node/event counts); clickable → filters the shipment list. Derived via view-model (no shipments.status enum added, nothing written back). Removed the old location KPIs (Total/Mapped/Coordinate Pending/Gateway/Active Templates/Warehouses/Runtime Events).
- **Filters:** Shipment Runtime Filters (search shipment/tracking/container, company, origin country, destination country, destination warehouse, carrier, method, status, current stage, route template, ETA range, exception-only, delayed-only, arriving-7-days) + Clear Filters. No inline onclick; keyboard/aria preserved. A failing filter source never blanks the list (safe [] fallbacks).
- **Route/Event mapping:** `shipment_routes` grouped by shipment_id, sorted `sequence_no` (canonical planned+actual path); node status → completed/current/planned/exception; **route segments: completed solid, current highlighted, upcoming dashed, exception red (antimeridian-safe).** `shipment_events` grouped by shipment_id, sorted `event_sequence`→`event_time`, deduped by `source`+`source_event_id`; **timeline shows ACTUAL events only** (upcoming nodes come from `shipment_routes`, never planned events).
- **Current Position priority:** latest valid Event coord → current Route Node coord → last completed Node coord → `location_ref_id`→Location Master → Coordinate Pending (never 0,0).
- **Markers/visual hierarchy:** current-position (pulse), origin dot, destination pin, completed node, current node, upcoming hollow, customs square, exception warning; Reference Locations OFF by default (no purple-circle flooding); Show Planned Route on by default.
- **Globe engine audit:** no 3D globe library is installed (only Chart.js/ExcelJS via CDN); the current map is a **dependency-free 2D equirectangular schematic**, now explicitly labeled a FALLBACK banner (not presented as success). Per the task's "don't add a big dependency without approval," a real 3D globe was NOT introduced. Candidates: (a) three.js + globe.gl (~600KB+, real rotatable 3D globe), (b) Leaflet + OSM tiles (~40KB, 2D geographic basemap w/ coastlines, no token, needs tile network). Awaiting owner approval + tile-license verification before swapping the map engine.
- **Schema audit (shipment_routes):** each row = a Route NODE; `shipment_route_id` is the per-row PK (per-node), NOT a route header id; there is **no `shipment_route_node_id`** and **no separate route-header table** in the live model; `shipment_events.shipment_route_id` therefore references a NODE row; business/grouping key = `shipment_id` + `sequence_no` ascending. Kept runtime-compatible (treated rows as nodes). **Future normalization recommendation:** rename `shipment_route_id`→`shipment_route_node_id` and add a real per-Shipment route-version header (`shipment_routes` header with `route_version`/`is_current`), per the SSOT `SHIPMENT_ROUTE_AND_EVENT_SPEC.md` — NOT done this round (no DB refactor).
- **Files changed:** `assets/js/pages/global-logistics-map.js` (full rework), `assets/css/pages/global-logistics-map.css` (runtime UI styles), `assets/js/api/operation-system-db-api.js` (shipment_routes normalizer/getter/mapping), `assets/specs/active/apps-script/03_master_data_handlers.gs` (validTabs ×2), NEW `assets/tests/shipment-runtime.test.js` (25 assertions, all pass), `docs/planning/global-logistics-map-demo.html` (SHP-202607-001 fixture), this entry.
- **Not touched:** Shipment reservation/deduction/receiving lifecycle, Purchase Order, Request Order, Carrier Rate Cards, Export Center, Route Template business logic (only runtime read added), DB schema normalization, Planning MDs.
- **Known limitation:** real pins/routes require the live `shipment_routes`/`shipment_events` data + Apps Script redeploy (until then: formal empty state, no demo substitute). 3D globe pending approval. `shipments` has no structured origin warehouse (origin country derived from route node 1 / ship_from text).

## 2026-07-24 — Confirm Shipment → Formal Shipment / Route / Events / in_transit / On-the-Way lifecycle wired

- **Action taken:** built the single orchestration command `confirmShipmentAndDispatch` so a real Shipment Draft, once "Confirm Shipment", auto-finalizes the Formal Shipment (`in_transit`), snapshots `shipment_routes` from the Route Template nodes, creates one real initial `shipment_event`, and deducts `factory_stock` — atomically (LockService + staged-write + compensating rollback) and idempotently. On-the-Way runtime then reads it with no manual paste. **Owner explicitly authorized** building the factory-stock deduction lifecycle (previously non-existent) + the route/event writers.
- **Files changed:** NEW `assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs` (orchestration + helpers); `01_router.gs` (action `confirmShipmentAndDispatch`); `assets/js/api/operation-system-db-api.js` (`normalizeShipmentRouteRecord` + `getShipmentRoutes` [prior], and `KM.DB.confirmShipmentAndDispatch` writer returning the full structured result); `03_master_data_handlers.gs` (`shipment_routes` in both validTabs [prior]); `assets/js/pages/shipping-history.js` (Confirm Shipment modal + `shConfirmShipment` replacing the ready_to_ship "Ship" button; DOM-built modal, no inline onclick); `assets/js/pages/global-logistics-map.js` (auto-select via `window._glmPendingSelect` for "View On the Way"); NEW `assets/tests/shipment-dispatch.test.js` (21 assertions, all pass); this entry.
- **Confirm flow (single command):** lock → load+validate draft → validate lines (≥1, qty>0) + required exec fields (external id / reference / warehouse_code / carrier / method / ETD / ETA / total qty / carton integrity) → resolve route template (explicit id, else unique active match by destination_country + carrier_id + last_mile/transit; 0 or >1 → block with clear error) → validate factory-stock sufficiency per SKU → **staged writes:** factory_stock deduction + `factory_stock_movements` (movement_type `shipment_out`, related_entity_type `shipment`, qty −shipped) → `shipment_routes` snapshot (1 row per template node; origin=completed, leg=current, rest=planned; coords snapshot both-or-neither, never 0,0; planned_arrival = ETD + cumulative default_offset_days) → ONE `shipment_events` row (`departed_origin`, status completed, deterministic `source_event_id = confirm:<shipment_id>`) → finalize shipment (`status=in_transit`, `actual_departure_date`, `shipped_at/by`). Returns `{ shipment_id, status, route_template_id, route_nodes_created, events_created, stock_movements_created, warnings }`.
- **Status transition:** ready_to_ship → **in_transit** (Confirm goes straight to in_transit per the task; the intermediate `shipped` label is skipped by this command). Draft = the same `shipments` row (no separate draft table), so "draft status update" = the shipment status change.
- **Atomicity/idempotency:** LockService serializes; all validation before any write; rollback stack (cell-restore for factory_stock + shipment, row-delete for appended movements/routes/events, in reverse under lock). Re-Confirm is a no-op: detected via status in_transit+ OR existing `shipment_routes` rows OR event with `source_event_id=confirm:<id>` OR movement with related_entity_id=<id> → returns `already_confirmed` (no double deduct/route/event). Frontend button disables while confirming; UI shows success only after the backend fully completes; failure shows the failed **stage** + shipment_id.
- **On-the-Way linkage:** adapter reloads the DB cache on success; runtime page auto-selects the shipment on navigation; upcoming route from `shipment_routes` planned nodes; timeline = actual events only; current position = latest event coord → current node → last completed → location_ref → Coordinate Pending.
- **Schema audit result:** `shipment_routes` is one-row-per-NODE; `shipment_route_id` is the per-node PK (no `shipment_route_node_id`, no separate route-header table); `shipment_events.shipment_route_id` references a NODE row (the origin node here). Kept runtime-compatible; **no DB normalization**. Future recommendation: add a per-Shipment route-version header + rename to `shipment_route_node_id` per SSOT — NOT done.
- **Redeploy REQUIRED:** the `.gs` source mirror changed (`22_shipment_dispatch_handlers.gs`, `01_router.gs`, `03_master_data_handlers.gs`) → New Version + Deploy the Apps Script Web App before the flow works; the tables (`shipment_routes`/`shipment_events`/`factory_stock_movements`) are auto-ensured on first write.
- **Not touched:** Request Order / PO calculation, PO completed/shipped/unreceived formula, shipment receiving lifecycle, Overseas Inbound receiving, Carrier Rate Cards, Export Center, Document Engine, DB schema normalization, Route Template management, Planning MDs.
- **Known limitations:** (1) no live deploy/test from this environment — verified via 21 mirrored-logic assertions + `node --check`; owner runs the real acceptance. (2) Factory-stock deduction uses a best-effort **FIFO-by-warehouse per SKU** rule because there is no canonical per-shipment origin-warehouse/reservation binding (reserved_stock is never set; `shipment_out` is a new movement_type since none existed). (3) planned_departure_date left blank (no canonical rule); planned_arrival from cumulative offset only when ETD + default_offset_days exist. (4) route-template resolution is best-effort on destination+carrier+method; ambiguous/none → blocked, operator must pass an explicit template.

## 2026-07-24 — On-the-Way / Global Reference data-runtime repair (diagnostics, resilient normalization, Global Reference restored)

- **Context:** three master tables (logistics_locations / shipment_route_templates / shipment_route_template_nodes) confirmed populated + Apps Script redeployed, but the page showed "No rows" and Global Reference pins had disappeared. **No table/schema rebuilt; no schema change.** I cannot reach the live Web App or a WebGL browser from this environment, so I fixed the code-provable breaks and added runtime diagnostics so the owner can pinpoint anything environment-specific.
- **Root causes fixed (code-side):** (1) **Global Reference regression** — my earlier On-the-Way runtime rewrite had demoted Global Reference to a non-rendering admin stub, so its pins vanished; restored it as a first-class layer that renders logistics_locations independently of runtime shipments. (2) **Stale/empty cache + silent mock** — `ensureDb` reused any cache (incl. a pre-redeploy empty one or a mock fallback) and never force-refreshed; now it only trusts a fresh `google-sheet` cache, a manual **Refresh** forces a live re-fetch, and mock/fallback is shown as an explicit red banner (never silently presented as production). (3) **Silent normalizer drop risk** — the master-table filters keyed on a single PK column; loosened so a partial column-name mismatch (or coordinate-only rows) can't zero the dataset.
- **Diagnostics (the evidence tool, since I can't see the live runtime):** adapter now computes `window._opDbDiag` per key table = { raw (rows from the Web App), kept (after normalize+filter), sampleKeys (raw column names of row 0) } + source mode; exposed via `KM.DB.getDataDiagnostics()` / `getDataSourceMode()`. Page shows a diagnostics panel at `?glmdebug=1` (or `window.KM_GLM_DEBUG`). Classification: **raw 0 → getter/sheet-name/router**; **raw N & kept 0 → normalizer/column-name filter (compare sampleKeys to canonical columns)**; **source mock → API failed**. This lets the owner locate the first-broken layer from real runtime evidence in one glance.
- **Coordinate parsing:** `_geoNum` already parses numeric STRINGS ("25.0330") → number; blank/NaN/out-of-range → null (Coordinate Pending); a lone `0` latitude/longitude is kept; `(0,0)` pair is never drawn (never fabricated). One bad-coord row no longer drops the rest — coord-pending Locations stay listed, just not pinned.
- **Layer separation:** Global Reference (logistics_locations) · Template Reference (shipment_route_templates + nodes) · Runtime (shipments / shipment_routes / shipment_events) are distinct modes/layers; switching a shipment or toggling reference does not clear the others; pins use stable IDs (`loc:<id>` / `node:<id>` / shipment_id).
- **3D globe — honest audit result:** **no globe engine is installed** (only Chart.js/ExcelJS via CDN); the map is a dependency-free 2D equirectangular SVG (real coordinates, not a fake globe). The page's render loop rebuilds the whole DOM on every state change, so a naive Globe.gl init per render would risk **WebGL context-loss crashes** — worse than the schematic. A safe real-globe integration needs a render-loop refactor to persist the WebGL context across updates + in-browser (WebGL) testing, which I can't perform here. I did NOT ship a crash-prone globe; the 2D map is honestly labeled. **Recommended follow-up:** refactor the map container to persist across renders, then add Globe.gl (MIT, CDN) with ResizeObserver + dispose + reduced-motion + a specific WebGL-failure fallback — done with the owner testing in-browser.
- **Files changed:** `assets/js/api/operation-system-db-api.js` (diagnostics helper + `_opDbDiag` + resilient filters + explicit mock marking + `getDataDiagnostics`/`getDataSourceMode`); `assets/js/pages/global-logistics-map.js` (Global Reference restore, template reference, source banner, diagnostics panel, force-Refresh, layer branching in drawMap, location drawer, cache gating); `assets/css/pages/global-logistics-map.css` (diagnostics table); NEW `assets/tests/shipment-runtime-repair.test.js` (24 assertions, all pass); `docs/planning/global-logistics-map-demo.html` (fixture incl. logistics_locations + templates + nodes + diagnostics); this entry.
- **No production→mock silent fallback** (now explicit banner); **no schema change**; **no mock substituted for real data**; not touched: Request Order/PO/FC/T1-T4 calc, Factory Stock/receiving lifecycle, Overseas Inbound, Carrier Rate Cards, Export Center, Document Engine, Route Template management, the three master-table schemas.
- **Redeploy:** the adapter/page/CSS are frontend-only (republish frontend). **No `.gs` change this round** (the tabs were already in validTabs from the prior round). If the diagnostics later show `raw 0`, the fix is a sheet-name/getter issue in the already-deployed Apps Script — report the sampleKeys and I'll target it.

## 2026-07-24 — On-the-Way REAL 3D Earth globe + shipment visibility + drawer UX (supersedes the 2D map above)

- **This round installs a real WebGL globe** (the prior entry's "no globe engine / 2D map" status is now superseded). NEW self-contained engine `assets/js/lib/km-globe.js` renders a genuine textured UV-sphere: drag-rotate, wheel/keyboard/button zoom, geographic markers with **back-hemisphere occlusion via the depth buffer**, great-circle route arcs, focus-to-coordinate, resize. **No runtime CDN / no external texture fetch.**
- **Land/ocean texture:** rasterized at runtime from a **vendored** Natural Earth 110m land outline (`assets/js/data/world-land-110m.js`, ~64KB, simplified to 0.1°, loaded as a same-origin `<script>` → `window.KM_WORLD_LAND`, works on `file://` and `http://`). Ocean = blue gradient, land = green fill + low-contrast coastline, drawn onto a 2048×1024 offscreen canvas → GL texture. If WebGL or the land asset is unavailable, an explicit **Globe Error** is shown (with Retry) — never a flat blue grid masquerading as Earth.
- **No context-loss (the prior blocker):** the globe host DOM node + WebGL instance are created ONCE and **persist across page re-renders** — `render()` detaches the host before the `innerHTML` rewrite and re-attaches it after; markers/arcs update imperatively via `setMarkers`/`setArcs`. This resolves the "render loop rebuilds the DOM → context loss" risk that blocked the previous round.
- **Shipment visibility (SHP-20260701-230A):** a shipment with no drawable position is never dropped and never placed at 0,0. Placement priority: Current Position (event→node→location_ref) → **Destination endpoint** (logistics_location bound to the destination warehouse; labeled endpoint, NOT current position, status stays Coordinate Pending) → Origin node → **Coordinate Pending tray** (a compact overlay inside the globe canvas listing shipment no./status/mode/ETA; clickable → opens the drawer with the same selected state). Runtime shipment markers use larger size + higher elevation so they draw on top of Reference pins.
- **Detail Drawer UX:** right-side **overlay inspector** (non-modal `role="dialog"` `aria-modal="false"`), never re-flows the page grid / compresses the globe. Sticky header with a **≥40×40 X button** (`aria-label="Close shipment details"`), **Escape** closes, **focus returns** to the originating list/tray item (or the globe canvas), internal-only scroll, page `overflow-x:hidden` so the drawer never adds horizontal scroll.
- **Layout:** Shipment Runtime Filters narrowed ~20% (320→258px, long labels wrap instead of widening); globe canvas enlarged to `min-height:620px; height:clamp(620px,70vh,860px)`; legend is compact/collapsible bottom-left; controls fixed top-right; runtime-data warning is a compact collapsible note (no big bar over the globe); the old "2D map" banner is removed.
- **Files changed:** NEW `assets/js/lib/km-globe.js`, NEW `assets/js/data/world-land-110m.js`, NEW `assets/tests/globe-math.test.js` (37 assertions — matrix pipeline, lat/lng convention, focus-to-coordinate, slerp, projection + occlusion — all pass); `assets/js/pages/global-logistics-map.js` (globe integration + placement + tray + drawer UX rewrite; removed the SVG map + the `focusOn` latent bug); `assets/css/pages/global-logistics-map.css` (compact filters, large dark globe, tray/tooltip/error/close-button styles, responsive); `index.html` (2 new script includes before the page); `docs/planning/global-logistics-map-demo.html` (globe scripts + a coordinate-pending shipment fixture); `assets/tests/shipment-runtime-repair.test.js` (+7 placement/tray/centroid assertions).
- **Dependency/build:** **no new npm/CDN dependency** — the engine is hand-rolled raw WebGL, the land asset is vendored. **Frontend-only; republish the frontend. No `.gs` change, no schema change, no fabricated/mock coordinates, no shipment-lifecycle change.**
- **Known limitation:** I cannot run WebGL in this environment, so the sphere render itself is verified only by the pure-math test suite (matrix/focus/occlusion) + `node --check`; the visual (land/ocean, rotation, zoom, occlusion, texture-fail error) must be confirmed in a browser per the Manual Acceptance Steps. Minor cosmetic: at 110m the rasterizer fills polygon holes (a few inland seas render as land) and does not special-case antimeridian rings — continents/oceans remain clearly recognizable.

## 2026-07-24 — Request Order: first-level aging + Day-of-Supply · 3-block second level · manual partial carton

- **Scope:** UI/UX + additive display only on the Request Order page (`request-order.js` / `.html` / `.css`). **No canonical formula changed** — T1–T4/FC-Share/Recommended/Suggested rounding untouched (the engine `assets/js/utils/forecast-engine.js` was NOT edited). The live-DB guardrail (recommendation = `--` until the forecast engine is wired) is preserved; full tier evidence renders in Demo Data (which already runs the canonical engine).
- **First-level aging (B):** the Site Stock cell now stacks main qty + a Day-of-Supply chip + `90+` / `180+` aging badges. Aging source = `amazon_inventory_health_snapshot` via the CANONICAL `IRMap.longTermStorage` (over90 = 91–180 bucket; over180 = 181+ sum) + `KM.DB.getAmazonInventoryHealthSnapshot` (existing getter, unchanged). 90+/180+ shown separately, never summed; qty 0 → neutral; snapshot missing → `Aging --` (never a fake 0). No new wide Aging column; the cell fits the existing 48px row height.
- **Day of Supply (C):** official 5-band color rule — 0–18 red / 19–30 yellow / 31–180 teal-normal / >180 orange / null gray — as a request-order-scoped display band (`_roDosBand`). The DOS VALUE is the canonical `IRMap.daysOfSupply(siteStock, IRMap.avgSalesPerDay(weekly, scope))`; when avg sales/day is unavailable it is honestly `Unknown` (gray), never fabricated. Negative → shown as 0 days (raw preserved). Aging and DOS use distinct labels.
- **Second level → 3 blocks (D–G):** the old 6-card v5 grid became `--v6` with THREE cards: (1) **Achievement & Forecast** (Historical Performance / Forward Forecast subsections; Current Month Remaining Demand shown; Special Event FC kept traceable; Edit Target % / FC Update entries unchanged); (2) **Factory Supply** (Factory Inventory / Incoming Supply Next-3-Months subsections, physical-vs-company/shared ownership called out, empty state); (3) **Recommendation Summary** = Tier Projection evidence (Demand / Projected Balance / Shortage / Risk, First-Shortage tier highlighted, supply evidence strip) + Monthly Recommendation (per-tier Recommended/Suggested/Order Qty/Carton/Reason/Note). Widths 34/30/36; tablet 2-col + block 3 full row; mobile single column.
- **Recommended/Suggested/Order Qty (G/H):** Recommended = per-tier canonical gap (NEVER summed across tiers); Suggested = Recommended rounded up to carton multiple; Order Qty defaults to Suggested and is editable. Manual **partial-carton** Order Qty is allowed (NON-blocking): shows Full Cartons + Loose Units + a Partial badge + a non-blocking warning, records Order−Suggested diff, and is never auto-rounded back. Blocking validation only for negative / non-numeric. The old full-carton Gate that blocked Send was removed.
- **Persistence boundary:** no dedicated partial/override column exists, so partial full/loose + Order−Suggested diff are carried in the existing `note` + `allocation_method` (`manual_partial_carton`) / `carton_qty` (full cartons) of `request_order_allocation_draft_lines`. No schema change; nothing claimed as persisted that doesn't already have a column.
- **Reuse, not reinvention:** all DOS/aging math comes from the existing global `window.IRMap` helpers and existing getters (`getAmazonInventoryHealthSnapshot`, `getAmazonWeeklySalesSnapshot`). No adapter/normalizer/router/Apps Script change → **no redeploy**; frontend-only republish.
- **Files changed:** `assets/js/pages/request-order.js` (display helpers + Site Stock cell + 3-block expand panel + partial-carton edit/validation + send-handler non-blocking partial + engine-result stash on mock rows); `assets/css/pages/request-order.css` (aging/DOS/3-block/partial styles); NEW `assets/tests/request-order-supply-ui.test.js` (35 assertions — DOS bands, aging, carton breakdown, per-tier no-sum, first-shortage, blocking/non-blocking — all pass); this entry.
- **Not touched:** forecast-engine.js, FC Share, factory shipment rounding, Factory Stock / PO / Shipment / Overseas / Carrier / Export / Document / Route-Event / Warehouse Picker lifecycles, DB schema, unrelated pages, Control Tower, promotion/coupon automation, full carton-consolidation optimization, Planning MD files.
- **Known limitation:** the live-DB Tier Projection / Recommended / Suggested still show `--` because wiring the canonical engine to live data is a separate (deferred) task; full evidence is demonstrable in Demo Data. WebGL-free; verified via 35 mirrored-logic assertions + `node --check` (no headless DOM run).

## 2026-07-24 — Request Order Aging/DOS boundary cleanup + runtime-truth audit (SUPERSEDES the Aging/DOS parts above)

- **Reversal:** The prior entry's addition of Amazon Aging (90+/180+) and Day-of-Supply to the **Request Order** first level is REMOVED. Site Stock cell again shows the canonical quantity only. Deleted from `request-order.js`: the DOS chip + 90+/180+ badges in the Site Stock cell, the `_roDosBand` / `_roAgingView` / `_roAgingBadgeCls` / `_roAgingDosFor` helpers, and the page-level `getAmazonInventoryHealthSnapshot` + `getAmazonWeeklySalesSnapshot` calls (they were added purely for RO DOS/aging display). Deleted from `request-order.css`: the `.ro-ss-cell` / `.ro-dos--*` / `.ro-aging-badge*` styles. **Request Order no longer references IRMap.** Aging/DOS remains solely on the Inventory Replenishment / 貨物庫存表 page.
- **Preserved (unchanged this round):** the three decision blocks (Achievement & Forecast · Factory Supply · Recommendation Summary) with their subsections, First Shortage Tier, Recommended/Suggested/Order Qty separation, editable Order Qty, manual partial-carton (Full Cartons/Loose Units, non-blocking warning), negative/non-numeric blocking validation, rerender draft preservation, and the 3-region desktop/tablet/mobile layout. NOT reverted to four regions or the old six-card v5.
- **Not deleted:** the shared `IRMap` helpers, the `getAmazonInventoryHealthSnapshot` / `getAmazonWeeklySalesSnapshot` getters themselves (still used by the Inventory page / canonical calc), Site Stock canonical quantity + its calculation inputs.
- **T1–T4 runtime truth:** the canonical engine (`assets/js/utils/forecast-engine.js`) outputs **T1–T3 only** (`shortageMonth1/2/3`, `t1Fc/t2Fc/t3Fc`). `SUPPLY_PLANNING_CALCULATION_RULES.md` contains **no T4 formula**. Therefore **T4 = UNRESOLVED / NOT DEFINED** — not invented this round; RO UI shows only T1–T3 (no blank/fake T4 row) and states there is no T4 term. T4 canonical definition + runtime + live wiring all remain a separate calculation-spec task.
- **Live wiring status:** Three-block UI shell = **IMPLEMENTED**. Live Tier Projection / Recommended / Suggested integration = **NOT IMPLEMENTED** (live-DB rows show `--`/pending; evidence renders only in Demo Data via the canonical engine result). T4 runtime = **NOT IMPLEMENTED (UNRESOLVED definition)**. Production never uses a demo/mock recommendation fallback — live shows honest `--`.
- **Aging bucket semantics (for doc sync — IRMap NOT changed):** `IRMap.longTermStorage` returns `over90 = inv_age_91_to_180_days` (the 91–180 bucket **only**) and `over180 = inv_age_181_to_270 + 271_to_365 + 365_plus + 366_to_455 + 456_plus` (181+ aggregate). These are **mutually-exclusive buckets** → canonical labels should be **`91–180`** and **`181+`**, NOT "90+ includes 180+". A cumulative `90+ total` (= 91–180 + 181+) is only valid if a future UI explicitly labels that 180+ is included; it is not what the current helper returns.
- **Partial-carton persistence audit:** `request_order_allocation_draft_lines` real columns include `order_qty`, `carton_qty`, `units_per_carton`, `allocation_method`, `note` (DATABASE_RELATIONSHIP_MAP §340). **`carton_qty` = full carton COUNT** (map: "total_cartons = Σ carton_qty", "recomputed from units_per_carton"); **`units_per_carton` = carton size**. The Send handler correctly writes full-carton count into `carton_qty` and carton size into `units_per_carton` (no size-vs-count confusion). `allocation_method` is a real column (value `manual` / `manual_partial_carton`). **There is NO structured column for loose units, suggested-qty snapshot, or Order−Suggested diff** → those are persisted as an **unstructured note trace** in `note` only. Structured partial-audit fields = **PLANNED** (not claimed as implemented). No schema change, no new payload fields.
- **Files changed:** `assets/js/pages/request-order.js`, `assets/css/pages/request-order.css`, `assets/tests/request-order-supply-ui.test.js` (now 32 assertions: retained tier/carton/partial logic + source-scan guards proving Aging/DOS removal & 3-block preservation — all pass), this entry.
- **DB/API/Apps Script impact:** none — no getter/adapter/router/`.gs`/schema change. **Frontend-only republish; no redeploy.** Not touched: Inventory Replenishment runtime, `amazon_inventory_health_snapshot` schema/getter, IRMap calculation, forecast-engine formulas, PO/Shipment/Factory Stock lifecycles, unrelated pages/specs.

## 2026-07-24 — SKU Details Resizable Table Columns (pilot)

- **Capability:** NEW reusable utility `assets/js/utils/resizable-columns.js` (`window.KM.ui.resizableColumns.create`) — drag a header cell's right edge to resize a column; no third-party lib, no framework. Definition-only file; it activates nothing by itself. **Enabled ONLY by SKU Details this round** (pilot). Included in `index.html` before `sku-details.js`.
- **Audit result:** SKU Details has four status tables (Upcoming / Running in the Market / Phasing Out / Closure), all sharing ONE 23-column schema. Headers are **static HTML** (persist across every rerender/toggle/unit-switch); bodies are JS-generated. Both header cells (`[data-col="N"]`) and body cells (`.scroll-cell[data-col="N"]`) carry the same `data-col`. Display hide/show uses `display:none` (cells never removed). No pre-existing resizable/column-width utility existed (the only `resize` hits were the unrelated supply-chain canvas).
- **Width mechanism:** one injected `<style>` rule per column key — `#sku-section .scroll-header .header-cell[data-col=N], #sku-section .scroll-col .scroll-cell[data-col=N] { width/min/max }` — so a header and **all four bodies** stay aligned automatically, and the width survives body rerenders (new cells match the rule). The fixed SKU column resizes via a rule over `.fixed-header/.fixed-col/.fixed-body/.fixed-row`. Same `data-column-key` ⇒ shared width across all same-schema tables. Increasing one column widens total width → existing horizontal scroll; neighbors are never compressed.
- **Column identity:** STABLE `data-column-key` (never index/label as the storage key): `sku, image, status, product_name, product_name_cn, series, category, gs1_code, gs1_type, item_dimensions, item_weight, package_dimensions, package_weight, carton_dimensions, carton_weight, units_per_carton, product_use, material, battery_type, magnet_type, minimum_price, msrp, selling_price, pm`. Each has content-sensitive min/max clamps; defaults mirror the base CSS.
- **Handle + a11y:** `<span role="separator" tabindex=0 aria-orientation=vertical aria-label="Resize … column" aria-valuemin/max/now>` on each header cell's right edge (~10px hit area, fine 2px line, col-resize cursor, focus ring). Pointer Events + pointer capture; `pointerup`/`pointercancel` cleanup; `stopPropagation` on the handle's pointerdown/click/dblclick so resize never triggers sort or row-double-click Edit; text selection disabled only while `body.km-rescol-active`; drag coalesced via `requestAnimationFrame`; localStorage written only on pointerup / keyboard commit. Keyboard: ← −10px, → +10px, Shift+← −25px, Shift+→ +25px, Home = reset that column.
- **Persistence:** `localStorage['km.ui.tableWidths.v1'] → sku-details → master-sku-tables → { columnKey: px }`. No DB / Apps Script / API / user-preference schema. Corrupt JSON or bad numbers → safe defaults; loaded values re-clamped to min/max. Restores after reload, filter, search, section collapse/expand, Display hide/show, CM/KG↔IN/LB, Refresh DB.
- **Reset Column Widths:** added inside the existing Display dropdown (`resetSkuColumnWidths()`); clears ONLY the SKU Details group, restores canonical defaults immediately (no reload), does not change column show/hide, filters, search, unit selection, or any other page's localStorage.
- **Lifecycle:** `initSkuResizableColumns()` runs on mount after `renderSkuDetailsTable()`; idempotent singleton (`_skuResizeCtl.refresh()` re-applies width + mounts handles only where missing → no duplicate handles/listeners). No setInterval/polling/MutationObserver added by the pilot. Mobile/narrow (≤820px): handles hidden (pointer drag disabled), horizontal scroll retained.
- **Files changed:** NEW `assets/js/utils/resizable-columns.js`; `assets/js/pages/sku-details.js` (registry + init + reset); `assets/html/pages/sku-details.html` (Reset action in Display panel); `assets/css/pages/sku-details.css` (handle/reset/mobile styles); `index.html` (1 script include); NEW `assets/tests/resizable-columns.test.js` (clamp/persistence/corrupt-fallback + source-scan guards for stable keys, a11y, pilot-only activation — all pass); this entry.
- **DB/API/Apps Script impact:** none. **Frontend-only; no redeploy.** Not touched: Inventory Replenishment, Factory/Overseas Stock, SKU Regional Details, Request Order, FC Summary, Shipment, PO, Carrier, Export, Document Engine, Apps Script, DB schema, unrelated pages. Not a full column-consolidation/reorder system — resize only.
- **Known limitation:** WebGL-free environment can't run the browser DOM interactions; verified via pure-helper unit tests + `node --check` + source-scan guards. The 27 manual acceptance steps (drag, cross-section sync, reload/filter persistence, keyboard, reset, mobile) need a browser pass.

## 2026-07-24 — Request Order + Inventory Replenishment second-level intrinsic-width + decision-UI cleanup

- **Supersedes** the prior round's Recommendation Summary shape (Tier Projection with Demand/Projected Balance/Shortage/Risk, and the Order Allocation "Recommended" visible column). This is a UI layout + presentation-mapping fix — no DB/API/Apps Script change.
- **Request Order overflow root cause + fix:** the v6 grid used `minmax(0, Nfr)` tracks + `min-width:0` cards, so tracks collapsed below content and child tables overflowed into neighbours. Fixed to **intrinsic width**: `grid-template-columns: minmax(300px,max-content) minmax(260px,max-content) minmax(360px,max-content)`, grid `width:max-content; min-width:100%`; the expand panel is `box-sizing:border-box; padding:16px; width:max-content; min-width:100%; overflow:visible`; cards are border-box and grow with content. Overflow past the viewport is carried by the MAIN table's existing horizontal scroll (no nested scrollbar, no absolute/transform/negative-margin/overflow:hidden hacks). Consistent 16px left/right inner padding.
- **Basic FC / Special FC** now **stacked full-width** (order: Current Month Remaining Demand → Basic FC → Special FC); the side-by-side `ro-expand-fc-split` subgrid is gone, so a wide Special FC table grows the Achievement card instead of intruding into Factory Supply.
- **Recommendation Summary redesigned:** (A) **Demand Summary** — T1–T4, columns exactly Tier·Month + Demand; missing month source → `--` (never a copied T3 value or fake 0). **Transitional UI Runtime currently maps: T1 = Month+1, T2 = Month+2, T3 = Month+3, T4 = Month+4** (with the per-tier Demand = the transitional monthly demand = Adjusted Basic FC(month) + Special Event(month)). **This is NOT the canonical tier contract.** **Canonical (owner `SUPPLY_PLANNING_CALCULATION_RULES.md` v4.1 §27): T1 = current-month remaining period + Month+1 · T2 = Month+2 · T3 = Month+3 · T4 = Month+4 visibility-only.** **Status: Runtime Gap / PENDING IMPLEMENTATION AND BROWSER VERIFICATION** (this is existing Runtime implementation history — the Runtime was not changed to make it canonical, and neither Calculation Runtime nor Browser Verification is claimed complete). (B) **Order Allocation** — T1–T3 only, columns exactly Tier·Month / Suggested / Order Qty / Carton / Note; the visible **Recommended column is removed**. Order Qty defaults to Suggested and stays editable; editing it never rewrites Suggested; partial-carton (Full Cartons + Loose Units + Partial badge + inline non-blocking warning) and negative/non-numeric blocking are preserved; unsaved drafts survive rerender; Send Request payload / site-confirmation gate / `allocation_method` unchanged. A single compact **First Shortage** badge shows only when there is valid shortage data; a single `No recommendation available.` line replaces the old per-row developer/pending prose.
- **T4 boundary (non-actionable):** T4 is planning visibility only — no `request_bucket=T4`, no T4 Order Qty, not in Confirm Site, not in All Request / Send Request, T1–T3 gates & Draft grouping unchanged. `forecast-engine.js` gained a **T4 demand projection output only** (`t4Fc = fcMonth4*tfMonth4 + campaignMonth4*campaignTfMonth4`; `null` when Month+4 not provided) — **no `shortageMonth4`, no T4 suggested/allocation, T1–T3 recursion untouched**; mock feeds Month+4; a mirror + source-scan test covers it.
- **Auxiliary prose removed** from the panel: the Replenishment-Model/Edit-Target note, "(remaining demand, not a full-month recalculation)", "live-DB forecast-engine connection not enabled", "Evidence shown in Demo Data", "the canonical engine has three tiers / there is no T4 term", "gaps are never summed", "planning visibility only — never written to factory_stock", "Special Event FC stays traceable", the big shared-stock/FC-Share paragraph, and the repeated per-tier pending rows. The now-dead `_roBuildReason` helper was deleted.
- **Inventory Replenishment overflow root cause + fix (CSS only — IR JS untouched):** the Decision Area (`.ir-panel-column--action`) was 490px but the Execution Plan grid actually has **six** columns (From/To/Qty/Method/**Expected Arrival**/Action — the old comment omitted Expected Arrival), so its ~576px min-content overflowed the card and the X button escaped the border. Fixed: action column → **560px**; `.ir-exec-plan__grid` → six explicit tracks with the **Action a fixed 40px last track**, `box-sizing:border-box`, `width:100%`; head + rows share the grid so they align; the X button stays a normal in-flow grid cell (never absolute). The left analysis group (`.ir-panel--inventory-group`) was given a fixed non-shrinking width (360px) so it can no longer be crushed / appear covered by the sticky SKU column (which is already 120px on both `.fixed-col` and `.replen-expand-fixed` — no new hard-coded offset). Expanded row stays a single `flex-wrap:nowrap; overflow:visible` row → the main table's scroll carries extra width; **no nested scrollbar**; sticky headers/column and main column widths unchanged.
- **Files changed:** `assets/js/utils/forecast-engine.js` (T4 demand output only), `assets/js/pages/request-order.js` (mock Month+4 + `_engine.t4Fc`; Block 1 stacked FC; Block 3 Demand Summary + Order Allocation; carton-cell inline warning; removed `_roBuildReason` + prose), `assets/css/pages/request-order.css` (intrinsic-width panel/grid/cards + new classes), `assets/tests/request-order-supply-ui.test.js` (T4 demand + engine t4Fc + no-Recommended + prose-removal + intrinsic-width guards), `assets/css/pages/inventory-replenishment.css` (exec-plan action column/grid + inventory group width), NEW `assets/tests/replen-execution-plan.test.js`, this entry.
- **DB/API/Apps Script impact:** none — no getter/adapter/router/`.gs`/schema change; Send Request payload & persistence contract unchanged (`recommended_qty`/engine output/adapter mapping preserved, UI just no longer shows a Recommended column; no new `suggested_qty` column). **Frontend-only republish; no redeploy.** T1–T3 formulas, FC Share, factory rounding, PO/Shipment/Factory Stock/Overseas/Carrier/Export/Document/Weekly-Plan lifecycles, site-confirmation persistence, and Planning MD canonical docs untouched.
- **Known limitation:** layout/overflow is verified by `node --check` + source-scan guards on the structural CSS/JS contract (real min-widths, six-column grid, nowrap+overflow-visible, no nested scroll, stacked FC, no Recommended column, prose removed) plus pure mirrors for the T4/demand math; the pixel-level visual (screenshot parity, drag scroll, X-button inside border at the far right) still needs the browser Manual Acceptance pass.

### Acceptance-gate status (2026-07-24, transitional — NOT canonical; nothing here is marked IMPLEMENTED/accepted)

Canonical Documentation Sync remains **PAUSED**. It may run only after ALL six gates pass:
1. Latest relevant tests pass — **MET** (`request-order-supply-ui`, `replen-execution-plan`, `request-order-data-connection` green; `node --check` clean).
2. Human production/live **browser** Manual Acceptance passes — **OUTSTANDING** (cannot be run from this headless environment; exemption explicitly denied by the user).
3. Console / Network results recorded — **OUTSTANDING** (needs the live browser session in gate 2).
4. T4 Demand vs T1–T3 Order Allocation boundary confirmed — **code-confirmed** (engine outputs `t4Fc` demand only, no `shortageMonth4`; Demand Summary T1–T4; Order Allocation T1–T3 only) — pending visual confirmation in gate 2.
5. Request Order has no Aging/DOS — **code-confirmed** (no `ro-dos-chip` / `ro-aging-badge` / `getAmazonInventoryHealthSnapshot`) — pending gate 2.
6. Inventory Replenishment original Aging/DOS unaffected — **code-confirmed** (this round changed only `inventory-replenishment.css` exec-plan grid / action-column / inventory-group width; no `.ir-dos--*`, `.replen-card--lts`, over90/over180, or DOS JS touched) — pending gate 2.

**T4 status definitions (latest product decision — supersedes the earlier "T4 UNRESOLVED"):**
- **T4 Demand** = new product requirement, now **DEFINED**; runtime code exists in transitional form (engine `t4Fc` demand projection + Demand Summary display) but is **awaiting browser acceptance → NOT marked IMPLEMENTED/canonical** until gates 2–3 pass.
- **T4 Order Allocation / Request Bucket** = **N/A — must NOT be added** (no `request_bucket=T4`, no T4 Order Qty, not in Confirm Site / All Request / Send Request).
- **T1–T3 Suggested / Order Qty** = existing Send-Request boundary **maintained, unchanged**.

Because gates 2–3 require a browser/live session that this environment cannot provide, the browser Manual Acceptance PASS/FAIL log (covering both the intrinsic-width work and the Aging/DOS boundary) is to be filled in by the operator; the checklist is in this round's Completion Report.

## 2026-07-27 — Allocation Draft DB Schema Canonical Sync (4 tables → code + specs; Request Allocation runtime migrated; Shipping schema-only; Apps Script redeploy pending)

- **Trigger:** the four Allocation Draft Live Google Sheet tables + headers were **manually finalized by the user**. This round syncs the CODE field contracts / read-write mappings / header constants and the Active Specs to match — **it did NOT delete, clear, rebuild, or reorder the Live DB Sheet.**
- **Canonical headers synced (name + order exact) in the Apps Script source mirror:**
  - `request_order_allocation_drafts` — `15_request_allocation_handlers.gs` `REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_`.
  - `request_order_allocation_draft_lines` — `15_..` `REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_`.
  - `shipping_allocation_drafts` — `16_shipping_allocation_handlers.gs` `SHIPPING_ALLOCATION_DRAFTS_HEADERS_` (added `formula_version`).
  - `shipping_allocation_draft_lines` — `16_..` `SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_` (full canonical reorder + warehouse/sequence fields).
  - `validTabs` already registered all four tab names (03_master_data_handlers.gs) — no registration change needed. All reads/writes are by **header NAME** (never fixed column index).
- **Field renames (canonical; new writes use canonical, legacy read-only fallback retained):** `category→category_snapshot` · `series→series_snapshot` · `fc_qty_snapshot→regular_demand_snapshot` · `site_stock_snapshot→destination_stock_snapshot` · `third_party_stock_snapshot→third_party_available_qty_snapshot` · `factory_stock_snapshot→factory_available_qty_snapshot`; shipping line `source_warehouse_id→recommended_source_warehouse_id` · `source_available_qty_snapshot→source_initial_available_qty_snapshot` · `ship_from→selected_source_warehouse_id` · `destination→selected_destination_warehouse_id`.
- **Removed:** `request_order_allocation_drafts.source_type` — superseded by `generation_type` (`scheduled` / `manual_refresh` / `user_created`; **`ai_suggested` NOT used** — rules Engine, not AI). Legacy `source_type` is a read-only migration fallback in the API normalizer; **never written / ensured / re-created.**
- **Request Allocation runtime updated end-to-end:** `15_` handlers (header + line writers, `submitRequestOrderAllocationDrafts`) · `operation-system-db-api.js` `normalizeRequestOrderAllocationDraftRecord` / `normalizeRequestOrderAllocationDraftLineRecord` + adapter JSDoc · `request-order.js` Send Request payload. Manual flow now writes `generation_type = user_created`, `draft_purpose = regular`, `draft_version = 1`; `category_snapshot` / `series_snapshot` capture the Master SKU values at creation.
- **Quantity protection (unchanged contract, canonical names):** `order_qty` = user input drives the Request Order Draft; `recommended_qty` = system Suggested Order snapshot kept **independent** (Engine B not implemented → stays blank, never faked). An explicit partial-carton `carton_qty` is passed through, never re-CEILINGed. **T4 is never written** as a draft line (`request_bucket = T4` skipped in the writer).
- **Line submission status (new):** each new line starts `line_status = draft`; `submitRequestOrderAllocationDrafts` marks the submitted lines `submitted` (+ `submitted_by` / `submitted_at`) — all lines, or only `submit_buckets` when provided — then derives the header status: every non-cancelled line submitted → `submitted`; a mix → `partially_submitted`; none → header unchanged. Header enum extended with `partially_submitted`.
- **Unfilled calculation snapshot columns** (`special_event_demand_snapshot`, `qualified_incoming_snapshot`, `approved_supply_snapshot`, `calculated_gap_qty_snapshot`, `recommended_shipping_qty_snapshot`, `residual_production_required_snapshot`, `reallocation_in/out_qty_snapshot`, `net_order_need_snapshot`, `recommendation_reason/flags`, and provenance `calculation_run_id` / `formula_version` / `calculated_at` / `source_data_as_of`) are written **blank** in the manual flow — never a fabricated `0`.
- **Shipping Allocation = schema + spec sync ONLY.** `16_` header constants + internal field arrays synced to canonical; a **minimal legacy write-alias shim** (`sadApplyLineAliases_`) maps the still-legacy Inventory Replenishment caller's `ship_from` / `destination` / `source_warehouse_id` / `source_available_qty_snapshot` onto the canonical columns so it is not silently broken (that caller — `inventory-replenishment.js` — was **not** edited this round). **NOT built:** Engine A, Shipping Recommendation writer, route/rate/carrier resolution, Submit-Plan runtime, any new UI, reservation/stock-movement/qualified-incoming. The shipping writer remains an **unwired scaffold**; live persistence is still gated `{success:false}` until an authorized redeploy. **Engine A / Engine B calculation runtime = still NOT IMPLEMENTED** (nothing pre-implemented this round).
- **Specs updated to canonical:** `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` §3.6 / §3.7 (both header + line schemas, status enums, rename notes, `source_type` removal) + §12.x snapshot reference; `DATABASE_RELATIONSHIP_MAP.md` §7.5 line-source snapshot lineage (canonical names). `RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md` already used canonical `recommended_qty` / `planned_qty` / `order_qty` — no field-rename needed.
- **Files changed:** `assets/specs/active/apps-script/15_request_allocation_handlers.gs`, `assets/specs/active/apps-script/16_shipping_allocation_handlers.gs`, `assets/js/api/operation-system-db-api.js`, `assets/js/pages/request-order.js`, `docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md`, `docs/planning/DATABASE_RELATIONSHIP_MAP.md`, this entry.
- **APPS SCRIPT DEPLOY REQUIRED (do-not-assume-live):** `15_` / `16_` are the source mirror. To activate: (1) copy the source mirror into the live Apps Script project, (2) create a New Version, (3) Deploy. Until then the request-allocation writers persist via the live path only where the API is configured; header-name auto-create is missing-header-safe against the manually-adjusted DB.
- **Validation:** `node --check` clean on all four code files (via `.js` copies for the two `.gs`); header constants diffed field-by-field against the canonical schema (0 missing / 0 extra / 0 duplicate / 0 blank / order exact); rg legacy-residual scan on the four-table code paths. **Browser / live-DB Save→Reload→Send + only-T1-partial-submit acceptance = PENDING** (headless environment; must be run by the operator).

## 2026-07-28 — Shipping Plan / Shipment / Carrier Rate Card Canonical DB Sync + Phase-1 Cost/Match Engine (4 tables → code + specs; Apps Script redeploy pending)

- **Scope:** canonical sync of FOUR existing tables only — `shipping_plans`, `shipping_plan_lines`, `shipments`, `carrier_rate_cards`. NOT touched: `shipping_allocation_drafts*` (Shipping Allocation Draft NOT wired this task), the canonical amendment MD, PO/Factory-Stock/Reserved lifecycle. **No table dropped / cleared / rebuilt; all header changes are additive (`sheetEnsureColumns_`), no column shift, no duplicate header, name-based read/write only.**
- **`marketplace_seperate`:** audited — **zero occurrences** in the codebase; NOT introduced. Canonical uses `marketplace`. (No migration needed; the safety guard is documented.)
- **Canonical headers synced (name + canonical order; superset where the no-delete rule keeps in-use extras):**
  - `shipping_plans` (11_) — full canonical incl. `parent_shipping_plan_id`, `source_warehouse_id` / `ship_from_type` / `destination_warehouse_id` / `destination_type`, `shipping_method_label` / `last_mile_delivery` / `customs_type` / `customs_type_label`, `carrier_unit_rate` / `carrier_rate_type` / `import_duty_treatment`, `estimated_customs_fee`, `rejected_comment`. **NO `rate_card_id` / Route / Lead Time on the plan (rough-quote layer).**
  - `shipping_plan_lines` (11_) — adds `site_sku` + `marketplace` (per-line, never MULTI) + avg-sales provenance snapshots; the 7 in-use Decision-Snapshot columns are RETAINED (additive, still copied to the shipment Execution Snapshot).
  - `shipments` (12_) — `source_warehouse_id` (out-source; **NO `origin_warehouse_id` / `origin_type` restored**), `destination_warehouse_id` + `destination_type`, `warehouse_code` KEPT as the DESTINATION code snapshot; `import_duty_treatment`, `master_tracking_number`, `is_cross_dock` / `temperature_requirement` / `hazmat_flag`, `estimated_*` + `estimated_unit_cost` + `total_cost_actual`; `last_mile_delivery` appears **once** (trailing duplicate NOT re-added). Legacy `warehouse_id` / `total_gross_weight` / `total_net_weight` / `updated_by` retained additively (read-fallback; `destination_warehouse_id` falls back to legacy `warehouse_id`).
  - `carrier_rate_cards` (17_) — adds `import_duty_treatment` (`included_in_rate` / `excluded_in_rate` / blank), enum-validated on import; **blank stays blank ("needs data completion") and is NEVER auto-derived from `customs_type`**.
- **Combined-Marketplace Plan (grouping AMENDED):** Weekly Plan now groups by the **ROUTE key (company + country + ship_from + destination + shipping_method)** — Marketplace removed from the key. `shipping_plans.marketplace` is DERIVED: one distinct line marketplace → actual; ≥2 → **`MULTI`** (scope marker; UI reads DISTINCT line marketplaces to show the real set). Lines keep real `marketplace` + `site_sku`; a Combined Plan never merges Marketplace lines in the DB. Specs updated (WEEKLY_SHIPPING_PLAN §3.1, DATABASE_RELATIONSHIP_MAP group-key note).
- **Phase-1 Cost + Rate-Card Matching Engine (shared, in 17_; used by 11_ rough + 12_ exact):**
  - **Weekly Plan ROUGH match:** status=active + effective + origin_country + destination_country + shipping_method + last_mile_delivery + battery_type (lithium if ANY SKU is lithium → whole shipment lithium candidate; **no Magnet matching**). Postal / warehouse-code / route / weight-tier NOT required. Snapshots `carrier_id` (user choice) + `carrier_unit_rate` + `carrier_rate_type` (= charge_type) + `import_duty_treatment`.
  - **Shipment EXACT match (Execution Commit):** copies carrier/method/last_mile/customs/import_duty_treatment from the plan, then resolves the exact `rate_card_id` (rough set + marketplace + destination_warehouse_code + postal range). **No exact match → RATE REVIEW:** `rate_card_id` blank, estimated_* blank, a note recorded, carrier **never silently switched**, not auto-approved/shipped. Exact estimate updates ONLY the shipment — never writes back the approved plan's rough snapshot.
  - **Cost formulas (Phase 1 = Freight + Duty + Customs Fee):** `estimated_freight_cost` = base(by charge_type/unit; min_charge floor) + `base × fuel_surcharge/100` (fuel is a **percent**, 15 = 15%). `estimated_customs_fee` = rate `customs_fee` **charged ONCE** (never × SKU/line/carton/marketplace). Duty via `sku_details.series` → `tax_referral_rates` (**never category**): `included_in_rate` → 0; `excluded_in_rate` → Σ declared_value × qty × duty_rate; blank → Not Applied (blank). `estimated_total_cost` = freight + duty + customs_fee (**`doc_fee` NOT in total; no Estimated Doc Fee column**). `shipments.estimated_unit_cost` = total / total_qty (blank when qty 0 — never ÷0).
  - **Overseas warehouse → FBA:** no carrier rate system yet → no candidate → Estimated Cost = **Not Applied (blank, never 0)**; no Amazon/overseas carrier auto-created; no Route / Lead Time added.
- **Explicitly NOT implemented (unchanged):** Shipping Allocation Draft runtime; overseas rate cards / Route / Lead Time / multi-leg route model; new Cost Component table; Estimated Doc Fee column; PO Allocation / Factory Stock lifecycle. `origin_warehouse_id` / `origin_type` NOT restored. `customs_type` never zeroes Duty. Category never used for Duty.
- **Files changed:** `assets/specs/active/apps-script/{11_shipping_plan,12_shipment,17_carrier}_handlers.gs`, `assets/js/api/operation-system-db-api.js`, `docs/planning/{WEEKLY_SHIPPING_PLAN_MAPPING_SPEC,DATABASE_RELATIONSHIP_MAP,CARRIER_AND_ROUTE_SPEC,SHIPMENT_CENTER_SPEC}.md`, NEW `assets/tests/shipping-cost-engine.test.js`, this entry.
- **APPS SCRIPT DEPLOY REQUIRED:** `11_` / `12_` / `17_` are the source mirror → (1) copy into the live Apps Script project, (2) New Version, (3) Deploy. Until then live persistence of the new columns/cost activates only after redeploy; `sheetEnsureColumns_` is missing-header-safe against the manually-finalized DB.
- **Validation:** `node --check` clean on `11_`/`12_`/`17_` (via `.js` copies) + `operation-system-db-api.js`; superset-aware header-diff = 0 missing / 0 dup / 0 blank / canonical order preserved / exactly one `shipments.last_mile_delivery`; existing shipment/carrier/logistics tests still green (no regression); NEW `shipping-cost-engine.test.js` (MULTI marker, fuel %, customs-once, included/excluded duty via series, unit-cost ÷0 guard) all pass. **Browser / live-DB Submit→Approve→Shipment + exact-match Rate Review acceptance = PENDING** (headless; operator must run).

## 2026-07-28 (later) — Label Snapshot RETIREMENT (reverses the same-day snapshot decision; Code = SSOT, Label = View only)

- **Canonical Decision (supersedes the earlier 2026-07-28 entry's `shipping_method_label` / `customs_type_label` snapshots):** four DISPLAY-label columns are **RETIRED from the transaction DB** — `shipping_plans.shipping_method_label`, `shipping_plans.customs_type_label`, `shipments.shipping_method_label`, `shipments.shipments_customs_type_label`. The **CODE fields are the sole business SSOT**: `shipping_method` / `last_mile_delivery` / `customs_type` (plan) and `shipping_method` / `last_mile_delivery` / `shipments_customs_type` (shipment). Labels live ONLY in the View/Presentation layer.
- **Retired from:** header constants (11_/12_), Sheet init, Header-Repair ensure lists, writers (plan rough-quote + shipment Execution Commit + the Draft label re-sync blocks), the retired resolver helpers (`shipmentMethodLabel_` / `shipmentCustomsTypeLabel_` / `shipmentRateCardLabel_`), and the frontend normalizers. No new writes.
- **Display resolver (View only):** new `KM.display.{shippingMethod,lastMileDelivery,customsType,carrierName}` + non-persistent API view fields `shippingMethodDisplay` / `lastMileDeliveryDisplay` / `customsTypeDisplay` (derived from CODE; customs via the canonical enum→Label map, method/last-mile humanized; a future shared Enum Dictionary / Code Dictionary can extend without touching callers or DB). `carrier_name` is **never stored** on the three tables — `KM.display.carrierName(carrier_id)` looks it up live from `carriers`. Readers updated: `shipping-history.js` + `global-logistics-map.js` now use `shippingMethodDisplay`; dispatch Ship-gate (`22_`) checks the CODE only.
- **Matching / grouping unchanged & CODE-only:** rate-card + carrier matching, customs/duty, Combine eligibility, grouping key, duplicate detection all use CODE (labels were never a matching key in the engine). `carrier_rate_cards.shipping_method_label` / `customs_type_label` are **KEPT** (import display + Carrier page metadata + resolver candidate) but never a matching key; the importer now emits a **Data-Quality warning** when one CODE carries inconsistent labels (treated as the SAME method/customs type, not different).
- **Migration:** new router action **`retireShipmentLabelColumns`** (`12_`, `dry_run` supported) physically deletes the four columns **by header name** — backfill-safe: if a row's CODE is blank but the LABEL has a value it backfills the CODE only via an explicit 1:1 label→code map (customs uses the canonical inverse); `shipping_method` has no dictionary so a blank-code+label row is REPORTED, never guessed; any ambiguity/unrecoverable row → `blocked_needs_review` (column NOT deleted). Header Repair never re-creates them (removed from all header constants + ensure lists), so the migration is one-way and safe to re-run.
- **`shipments_customs_type` NOT renamed** to `customs_type` this task (kept as-is per instruction; a unifying rename is a separate migration).
- **Specs updated:** `SHIPMENT_CENTER_SPEC` §15A (snapshot → RETIRED/render-from-code), `CARRIER_AND_ROUTE_SPEC` (customs label no longer snapshotted to shipments; kept as rate-card display/resolver, not a matching key), `DOCUMENT_GENERATION_SYSTEM_SPEC` (`{{SHIPPING_METHOD}}`/`{{SERVICE}}`/`{{CUSTOMS_TYPE}}` resolve from CODE at render; label data_source_paths superseded), `DATABASE_RELATIONSHIP_MAP` (amendment banner: labels retired, code-only, canonical warehouse ids, no stored carrier_name).
- **Files changed:** `assets/specs/active/apps-script/{01_router,11_shipping_plan_handlers,12_shipment_handlers,17_carrier_handlers,22_shipment_dispatch_handlers}.gs`, `assets/js/api/operation-system-db-api.js`, `assets/js/pages/{shipping-history,global-logistics-map}.js`, `docs/planning/{SHIPMENT_CENTER_SPEC,CARRIER_AND_ROUTE_SPEC,DOCUMENT_GENERATION_SYSTEM_SPEC,DATABASE_RELATIONSHIP_MAP}.md`, this entry.
- **APPS SCRIPT DEPLOY REQUIRED:** 01_/11_/12_/17_/22_ source mirror → copy into live project, New Version, Deploy. Run `retireShipmentLabelColumns` with `dry_run:true` first, resolve any `blocked_needs_review`, then live.
- **Validation:** `node --check` clean on all changed `.gs` + `operation-system-db-api.js` + both reader pages; header-diff = 0 missing / 0 dup / canonical order / four label columns ABSENT from plans+shipments / carrier_rate_cards KEEPS its two labels; existing shipment/carrier/logistics tests + `shipping-cost-engine` all green (no regression). **Browser / live-DB migration dry-run→apply + document/export render-from-code acceptance = PENDING** (headless; operator runs).

## 2026-07-28 (phase 3) — Weekly Plan Layer-1/2 + Combined Plan + Unified Rate Matcher (recommendation/rough/exact) + Method Recommendation

- **Unified Rate Matcher** (`17_` `shippingRateMatch_`, shared global scope — ONE service, no per-page duplication) with 3 modes: **recommendation** (origin/dest country + battery; method/last_mile/customs are OUTPUT), **rough** (+ method+last_mile+customs), **exact** (+ carrier + city/postal/warehouse/marketplace). `shippingMatchRateCards_` kept as a back-compat wrapper (existing callers/tests unchanged). All matching uses **CODE/ID only**. Candidate helpers: `shippingMethodCandidates_` (distinct method+last_mile), `shippingLastMileCandidates_`, `shippingCustomsCandidates_`, `shippingRoughRateCandidates_` (carrier/charge_type/unit_rate/currency options; `rate_card_id` is a transient reference only), `shippingCarrierNameById_` (live carrier_id→name).
- **Execution Plan Method Recommendation** (Inventory Replenishment): action `getShippingMethodCandidates` — READ-ONLY, returns `{battery_class, methods:[{shipping_method,last_mile_delivery}], last_miles?, customs_types?}`. Persists NOTHING (no carrier_id/rate_card_id/carrier_unit_rate/customs_type); `shipping_allocation_drafts*` NOT touched. Execution Plan only *recommends* a method.
- **Weekly Plan Layer 1 (Rationale)**: `updateShippingPlanRationale` writes CODES `shipping_method`/`last_mile_delivery`/`customs_type` (+ optional warehouse endpoints); any change **clears** carrier_id/carrier_unit_rate/carrier_rate_type/import_duty_treatment/estimated_*/currency and bumps `plan_version`. `customs_type` never decides Duty. Cascading candidates via `getShippingMethodCandidates` (method → last_mile → customs).
- **Weekly Plan Layer 2 (Carrier & Cost)**: `getWeeklyPlanRateCandidates` (rough list for the plan's effective lines — user picks; **never auto-selected/cheapest/first**) → `selectShippingPlanCarrier` snapshots carrier_id/carrier_unit_rate/carrier_rate_type(=charge_type)/import_duty_treatment/currency + computes Phase-1 cost over the EFFECTIVE lines. **`rate_card_id` is NOT stored on the plan** (validated: the selected card must be a legit rough candidate). `carrier_name` never stored.
- **Combined Plan runtime** (`combineShippingPlans` / `uncombineShippingPlans`) using `parent_shipping_plan_id` (normal plan = own parent; child → Combined Parent; Parent owns NO own lines). Eligibility: all draft, same company/country/source_wh/dest_wh/ship_from_type/destination_type, currency same-or-blank, not transferred/cancelled/already-child/already-parent (no nested combine); marketplace may differ. **Effective Lines** = Parent's children's lines (else own) — read ONCE, no Parent+child double count (`shippingPlanEffectiveOwnerIds_`/`shippingPlanEffectiveMeasures_`). Parent marketplace derived (actual/MULTI). Guards: children can't submit/approve/cancel (`updateShippingPlanStatus`) or transfer (`createShipmentFromApprovedPlan_` → `is_combined_child`) independently; the Shipment transfer consumes the Parent's effective lines. Combine/uncombine bumps version + clears carrier/cost.
- **Shipment exact — Combined marketplace / Split**: `shipmentExactRateAndCost_` for a MULTI shipment accepts ONLY a whole-shipment (blank-marketplace) rate card; if only per-marketplace cards exist → `splitRequired` (Rate Review note = "SPLIT SHIPMENT"), never averaging/merging cards. Single-marketplace unchanged. No silent carrier switch; no rate → Rate Review (existing).
- **Carrier import** already resolves `carrier_name` → unique `carrier_id` (ambiguous/unknown = rejected); no `carrier_name` column on the three tables. Data-Quality warning on one CODE↔inconsistent labels (from the label-retirement task) retained.
- **Not implemented (per scope):** Shipping Allocation Draft DB runtime; Route/Route Legs; Carrier Lead Time in matching; overseas→FBA rate cards (Cost = Not Applied, blank, never 0); multi-leg carriers; Cost Component table; doc_fee in total; Magnet matching. **UI (interactive) PENDING browser:** cascading Method/Last-Mile/Customs dropdowns, Carrier selector rendering, SKU parent + marketplace child row aggregation, Rate-Review/Split banners — the backend actions + `KM.DB.*` adapters + Code→display resolver are wired; DOM rendering + live verification are the operator's browser pass.
- **New router actions:** `getShippingMethodCandidates`, `getWeeklyPlanRateCandidates`, `updateShippingPlanRationale`, `selectShippingPlanCarrier`, `combineShippingPlans`, `uncombineShippingPlans`. **New adapters:** `KM.DB.{getShippingMethodCandidates,getWeeklyPlanRateCandidates,updateShippingPlanRationale,selectShippingPlanCarrier,combineShippingPlans,uncombineShippingPlans}`.
- **Files changed:** `assets/specs/active/apps-script/{01_router,11_shipping_plan_handlers,12_shipment_handlers,17_carrier_handlers}.gs`, `assets/js/api/operation-system-db-api.js`, `docs/planning/{WEEKLY_SHIPPING_PLAN_MAPPING_SPEC,CARRIER_AND_ROUTE_SPEC}.md`, NEW `assets/tests/shipping-plan-runtime.test.js`, this entry.
- **APPS SCRIPT DEPLOY REQUIRED:** 01_/11_/12_/17_ source mirror → copy to live project, New Version, Deploy.
- **Validation:** `node --check` clean on 01_/11_/12_/17_ + operation-system-db-api.js; existing shipment/carrier/logistics + `shipping-cost-engine` all green (no regression); NEW `shipping-plan-runtime.test.js` (battery scope, recommendation dedup, rough no-auto-select, combine eligibility, effective-lines no-double-count, marketplace MULTI, L1 clears carrier/cost, exact MULTI→matched/split/review, carrier-name lookup) all pass. **Browser / live-DB acceptance PENDING** (operator).

## 2026-07-29 — System Repair 1: Inventory Data Compatibility + Execution Plan Candidate Contract

- **Scope:** three Inventory Replenishment runtime/data-compatibility fixes. **No DB schema, no SQL/migration, no raw-snapshot rewrite, no warehouse-master change, no formula change.** Raw source country values are preserved verbatim (`amazon_inventory_snapshot.country='GB'`, `amazon_weekly_sales_snapshot.country` = `IT`/`DE`/`ES`/`FR`) — all three fixes are READ / comparison / candidate-generation layer only.
- **New shared, DOM-free, Node-testable contract:** `assets/js/utils/inventory-compat.js` exposing `window.IRCountry` (country compatibility) + `window.IRWarehouse` (Execution Plan candidates). Loaded by `index.html` before the pages. There is deliberately **no global `normalizeCountry()`** — country handling is dataset/context-aware.
- **Repair A — UK Inventory (GB compatibility):** `IRMap.latestSnapshot` country gate now uses `IRCountry.matches` — `UK` and `GB` are treated as the **same market** (spelling alias). Amazon UK now reads `country='GB'` snapshots; `US`/other-company still excluded; UK/GB dedupe still picks the single latest snapshot (never summed). EU is **not** expanded for inventory identity.
- **Repair B — Amazon EU Weekly Sales:** `IRMap.avgSalesPerDay` (weekly) + `salesTrend7d` (daily) delegate country handling to `IRCountry`. **Only in an Amazon EU context** (`country='EU'`, `marketplace='Amazon'`) the query rolls up `IT + DE + ES + FR` (each market's own latest week, summed; legacy pan-`EU` row is a fallback only, never double-counted). Amazon FR/DE/ES/IT and non-Amazon contexts stay single-market. `/7` rounding unchanged.
- **Repair C — Execution Plan From/To:** `_execWarehouseCandidates` delegates to one central `IRWarehouse.buildCandidates` for **every** site (no per-site branches). Classification is by warehouse master fields (`warehouse_type` ∈ `FBA`/`3PL`/`RETURN`/`FACTORY`, `is_factory_warehouse`), never by display name. **From** = eligible Factory (any country) + same-company/country Active `3PL`. **To** = same-company/country Active `3PL` + (Amazon only) same-company/country/marketplace-compatible Active `FBA`. The previous synthetic empty-id "Amazon" To option is **removed** — every option is a real `warehouse_id`; empty candidate set → explicit empty state (no cross-country fallback). Warehouse country uses the UK≡GB alias but **never** the EU aggregation (§8.6 — EU is a sales roll-up only, not a warehouse scope).
- **Files changed:** `assets/js/utils/inventory-compat.js` (NEW), `assets/js/pages/inventory-replenishment.js`, `index.html`, `assets/tests/inventory-compat.test.js` (NEW), this entry.
- **Source status:** SOURCE-FIXED. **Local test:** LOCAL-TESTED — `node assets/tests/inventory-compat.test.js` = 38/38 pass (UK-1..6, EU-1..8 + legacy precedence + US regression, Execution-Plan Amazon/Non-Amazon/EU/isolation/active/empty matrices, classification, runtime-wiring guards); full existing `assets/tests/*` suite green (no regression); `node --check` clean; `git diff --check` clean.
- **Deployment status: UNVERIFIED. Production runtime status: UNVERIFIED** — headless environment (no browser, no live DB). No Apps Script change and no redeploy is required (frontend read/candidate layer only; the Apps Script getters/handlers are unchanged). Browser + live-DB visual acceptance (UK inventory renders from GB, Amazon EU shows IT+DE+ES+FR total, Execution Plan From/To dropdowns) = operator's pass.
- **Remaining risk:** live warehouse master must actually carry `warehouse_type='FBA'` rows for Amazon To to list FBA destinations (canonical per `DATABASE_RELATIONSHIP_MAP.md` §4, e.g. `WH-*-US-FBA-*`); where absent, Amazon To correctly shows 3PL Overseas only / empty state (by contract, never a fabricated id). Weekly-sales `country` is imported from the source **Marketplace** column (`06_amazon_import_config.gs`) — the EU roll-up assumes per-country `IT/DE/ES/FR` values as documented.

## 2026-07-29 (Round 2) — System Repair 1 contract corrections (strict active · no EU legacy fallback · factory company-scope)

- **Scope:** minimal corrections to the same three fixes. Still no DB schema/SQL/migration/raw-snapshot/warehouse-master/formula change; still read/comparison/candidate layer only.
- **Correction 1 — STRICT active:** `IRWarehouse.isActive` no longer tri-state. A warehouse is a candidate ONLY when `is_active` resolves to **TRUE** under the canonical adapter contract `_whBool` (`operation-system-db-api.js:471-479`): `true`/`"true"`/`"yes"`/`"y"`/`"1"` (case-insensitive). `false`/`"no"`/`"0"`/`0`/blank/`null`/`undefined`/missing/unknown → **excluded**. Applies uniformly to Factory/3PL/FBA. The module-absent fallback in `inventory-replenishment.js` was aligned to the same strict rule.
- **Correction 2 — NO Amazon EU legacy fallback:** removed `SALES_AGG_LEGACY` and all `set.legacy` usage from `salesSourceSet` / `weeklyUnits7d` / `salesTrendCountries`. Amazon EU weekly sales aggregates **IT+DE+ES+FR only**; if all four are absent the result is empty/zero. A raw `country='EU'` row is preserved in the DB but **never read** by the aggregation. No `/7`/rounding/time-range/formula change.
- **Correction 3 — Factory eligibility company-scoped (canonical):** removed the invented `companyShared` (blank-company = shared) proxy. Factory From now uses **strict company match** on the canonical `warehouses.company` field (`DATABASE_RELATIONSHIP_MAP.md` §4 warehouses master: `company` = business context USING the warehouse; company-scoped rows `WH-KM-*` vs `WH-RESUS-*` are DISTINCT, matched by `warehouse_id` + validated company). Country stays un-filtered for factories (source may be CN/TW).
- **Correction 4 — EU warehouse scope (canonical, no code change needed):** warehouse candidate country matching uses the warehouse's own `country` vs site country scope (UK≡GB alias only), with **no** EU→IT/DE/ES/FR expansion — per `INVENTORY_TABLE_MAPPING_SPEC.md` §16 (`company + country + warehouse_type='3PL' + is_active`) and `SHIPMENT_CENTER_SPEC.md` §22.0 (`company + marketplace + warehouse_type + country scope`). A legitimate `country='EU'` warehouse is included; DE/FR/… warehouses are not pulled into an EU scope.
- **Correction 5 — test coverage:** `assets/tests/inventory-compat.test.js` expanded to 89 assertions — full active-normalization matrix (7 accepted / 7 rejected × Factory/3PL/FBA), EU no-legacy matrix, UK/GB same-date duplicate protection, factory company-scope, EU warehouse scope (include EU / exclude four-country), full Execution-Plan fixture matrix (Amazon US/UK/EU, Non-Amazon US & non-US, ResUS isolation, empty, dup-code, dup-id, blank-active), stale-selection after company/country/marketplace switch, and wiring guards.
- **Files changed (Round 2):** `assets/js/utils/inventory-compat.js`, `assets/js/pages/inventory-replenishment.js` (fallback only), `assets/tests/inventory-compat.test.js`, this entry. `index.html` unchanged.
- **Source status:** SOURCE-FIXED. **Local test:** LOCAL-TESTED — `node assets/tests/inventory-compat.test.js` 89/89 pass; full `assets/tests/*` suite (19 files) exit 0; `node --check` clean. **Deployment/Production runtime: UNVERIFIED** (headless). **Same-date UK/GB tie:** `latestSnapshot` uses strict `>` on snapshotDate, so a same-date UK-vs-GB tie resolves to the first-seen row (array order) — it never sums/duplicates, but there is no content-level tie-breaker; recorded as a remaining risk (no new DB identity invented). **Batch A acceptance status is NOT asserted by this round.**

## 2026-07-29 (Round 4) — System Repair 1 implementation recovery (UK physical stock · Amazon logical dest · factory cross-company · EU warehouse compat · Draft DB persistence)

- **Authoritative Round 3 decisions implemented** (they supersede Round 2 candidate contracts). Source + deterministic/mocked tests only; **BROWSER / LIVE-DB / PRODUCTION = UNVERIFIED** (headless) → operator runtime verification handoff (4 tests).
- **Decision A — UK 3rd Party Stock = physical:** new shared `IRWarehouse.buildPhysicalThirdPartyBreakdown(plan)` → `{rows,total}`; the summary card total AND the expanded detail now use the SAME physical rows (`total = SUM(rows.qty)`). No longer displays `sitePlanningAvailable` (18-day virtual allocation) — that value is **preserved** on the plan object for the planning/recommendation path (no formula change). Empty → state label (No 3PL / No Data), never a fallback to 31. UK/GB deduped by `warehouse_id` (never summed twice).
- **Decision B — Amazon logical destination:** the Weekly-Plan / Execution-Plan `To` now collapses all FBA warehouses into **exactly one** `Amazon` logical destination (UI token `MARKETPLACE_DESTINATION:Amazon:<country>`), keeping eligible real 3PL. Persists as `marketplace=Amazon` + `selected_destination_warehouse_id=null` (never a fake warehouse_id); the real FBA `warehouse_id` is resolved later at Shipment Draft (that picker contract unchanged).
- **Decision C — Factory From cross-company:** Active Factory (`is_factory_warehouse=true` + strict active) appears in From for any company/marketplace/country; never in To. Removed the Round-2 company-strict factory rule.
- **Decision D — EU warehouse compatibility:** separate `IRWarehouse.warehouseCountryMembers` map — EU aggregate → EU/DE/ES/IT/FR; country-specific (DE/ES/IT/FR) isolated; UK≡GB. Kept fully separate from the sales aggregation (no legacy `country=EU` sales fallback re-enabled).
- **Decision E — Draft persistence:** the shipping-side handler (`16_shipping_allocation_handlers.gs`) is **already an incremental upsert-by-line-id** (NOT blanket REPLACE) and the adapter methods + getters + router already exist — so **no `.gs`/adapter/router change was needed** (all SHA-unchanged). Round 4 added the frontend SSOT wiring: `_persistAllocationDraftToDb` (header upsert → per-line incremental upsert; user edit sends `planned_qty`/`selected_*` only, `recommended_qty` sent only for system lines), `_cancelAllocationDraftLine` (soft cancel `line_status='cancelled'`), `_hydrateAllocationDraftFromDb` (DB-first load with async-race token guard), and pure payload builders `IRDraft.build*`. `sessionStorage` demoted to a recovery cache. When the API is not configured (headless), the DB path no-ops and the cache remains (non-breaking).
- **Files changed (Round 4):** `assets/js/utils/inventory-compat.js`, `assets/js/pages/inventory-replenishment.js`, `assets/tests/inventory-compat.test.js` (rewritten to Round 4 contract), NEW `assets/tests/shipping-allocation-draft-persistence.test.js`, this entry. **Unchanged:** all 8 Batch A docs + SYSTEM_RUNTIME_ARCHITECTURE, adapter `operation-system-db-api.js`, `16_shipping_allocation_handlers.gs`, `01_router.gs`, `index.html`, formulas, schema, warehouse master, raw data.
- **Local test:** `node assets/tests/inventory-compat.test.js` + `shipping-allocation-draft-persistence.test.js` pass; full `assets/tests/*` (20 files) exit 0; `node --check` clean.
- **BROWSER-UNVERIFIED items (operator):** UK 240/240 render; Amazon To single-logical dropdown; EU/DE/FR candidate lists; Manual-Add → context-switch/reload persistence round-trip (the DOM-level stable line-id binding + full reload restoration are source-implemented at the data layer but not runtime-verified here). Not production verified; System Repair 1 not formally accepted.

---

## API Foundation — Phase API-1 (Round A) SOURCE-PRESENT / TEST-VERIFIED, DORMANT (2026-08-04)

The client-side base of the future API layer now exists and is loaded, but is **inert in production**.

```text
API Foundation (assets/js/api/km-api-foundation.js): SOURCE-PRESENT / TEST-VERIFIED / DORMANT
Feature flag USE_WORKSPACE_API: false (production default → legacy transport)
Business logic changed: NONE (zero-business-logic transport foundation)
Workspace Registry: 7 domains REGISTERED only (none implemented)
Legacy transport (KM.DB.* / WEB_APP_FETCH): 100% preserved, no page rewired
Apps Script / .gs / generated bundle / DB / schema: UNCHANGED (no APPS_SCRIPT_SYNC, no BUNDLE_REBUILD)
Tests: assets/tests/km-api-foundation.test.js = 56/0; full suite unchanged (Golden 39/1/0; #34 Pending)
Pre-existing replen-draft-completeness P29–P31: still failing (honestly reported; unrelated)
Next slice: API-2 getWeeklyShippingPlanWorkspace
```

- **What was built:** `ApiClient → ApiTransport → ApiDispatcher → WorkspaceResolver → ResponseEnvelope`, plus ErrorEnvelope, a memory Cache (TTL=0, interface only), and a LegacyAdapter that delegates to `window.KM.DB.*` / `getOperationDb`. Response `{success,data,meta,errors}`; error `errors[]{code,message,details}` (never a bare thrown string). A KMSAFE-mirror forbidden-op guard refuses create-sheet / append-header / modify-schema / migrate in both modes.
- **Backward compatibility:** additive `<script>` in `index.html`; constructing/loading the module mutates nothing and issues no legacy call until invoked; with the flag off every request routes to the existing legacy transport unchanged.
- **Files changed (API-1):** NEW `assets/js/api/km-api-foundation.js`, NEW `assets/tests/km-api-foundation.test.js`, `index.html` (one inert script tag), NEW `docs/planning/API_FOUNDATION_ARCHITECTURE.md`, and doc updates to `API_MIGRATION_MASTER_PLAN.md` §6 / `SYSTEM_RUNTIME_ARCHITECTURE.md` §14.1 / this entry. **Unchanged:** all `assets/js/core/*.js`, all `.gs`, the generated bundle, DB schema, formulas, recommendation/submit/allocation/persistence/shipment runtimes.
- **Deployment classification:** `km-api-foundation.js` + `index.html` = `FRONTEND_GITHUB_PAGES_REQUIRED`; docs = `DOCUMENTATION_ONLY`; **no** `APPS_SCRIPT_SYNC_REQUIRED`, **no** `BUNDLE_REBUILD_REQUIRED`. Governed by `DEPLOYMENT_RELEASE_GOVERNANCE.md` (manual, user-controlled). Not deployed; not pushed.

---

## API v1 — Weekly Shipping READ Workspace (Phase API-2) SOURCE-PRESENT / TEST-VERIFIED, NOT DEPLOYED (2026-08-04)

First real Workspace resolver; **read-only, no page cutover, no business change, not deployed.**

```text
Resolver weeklyShipping.workspace.get: SOURCE-PRESENT / TEST-VERIFIED / NOT DEPLOYED
weeklyShipping registry status: IMPLEMENTED (the other six remain REGISTERED)
Per-workspace flag: USE_WORKSPACE_API=false (global) + WORKSPACE_API_ENABLED all false (default)
Weekly active page: STILL ON LEGACY (no cutover)
Tables read per request: 4 (shipping_plans, shipping_plan_lines, warehouses, carriers) — never getOperationDb (44)
Business logic changed: NONE (read-only view model; multi-currency never aggregated; no status/qty change)
Safety: S0/S0.5 preserved (exact Spreadsheet-ID gate + validate-only sheet/column; fail-closed; no repair)
Tests: km-api-weekly-workspace.test.js 64/0; API-1 57/0 + F2 compat 42/0 (updated for weeklyShipping graduation)
Golden 39/1/0; Scenario #34 Pending; pre-existing replen-draft-completeness P29–P31 still failing (unrelated)
Next: API-3 Weekly page read cutover + write slice (after a new authorized round + Verification Copy)
```

- **Files (API-2):** NEW `assets/specs/active/apps-script/40_api_v1_weekly_workspace.gs` (`APPS_SCRIPT_SYNC_REQUIRED`), `assets/specs/active/apps-script/01_router.gs` (thin dispatch, `APPS_SCRIPT_SYNC_REQUIRED`), `assets/js/api/km-api-foundation.js` (per-workspace flag + Weekly resolver, `FRONTEND_GITHUB_PAGES_REQUIRED`), NEW `assets/tests/km-api-weekly-workspace.test.js`, updated `km-api-foundation.test.js` + `km-api-foundation-compat.test.js` (GIT_ONLY), NEW `API_WEEKLY_SHIPPING_WORKSPACE_SPEC.md` + `API_WEEKLY_SHIPPING_PARITY_REPORT.md`, updated `API_MIGRATION_MASTER_PLAN.md` + this entry (DOCUMENTATION_ONLY). **`BUNDLE_REBUILD_REQUIRED=false`** (no `assets/js/core/*.js` changed). **Unchanged:** generated bundle, Recommendation/Submit runtimes, DB schema, all Weekly business handlers (11_/17_ etc.), formulas.
- **Deployment:** manual, user-controlled (`DEPLOYMENT_RELEASE_GOVERNANCE.md`). Apps Script sync-required = `40_api_v1_weekly_workspace.gs` + `01_router.gs`. Not pushed, not deployed. Live/browser parity = OPEN (API-3 / Verification Copy).

---

## API v1 — Weekly READ page cutover (Phase API-3A) SOURCE-PRESENT / TEST-VERIFIED, NOT DEPLOYED, DEFAULT LEGACY (2026-08-04)

The Weekly Shipping Plan page's **read** path is now reversibly connectable to the Workspace API; **production default is Legacy**, all writes stay Legacy.

```text
Weekly page READ: reversible — Legacy (default) ↔ Workspace API (when per-workspace flag effective)
Boundary: loadWeeklyShippingReadModel_ (one normalized model; _spEffectiveWorkspace gate)
Flags: USE_WORKSPACE_API=false + WORKSPACE_API_ENABLED.weeklyShipping=false (unchanged; no default enablement)
Weekly WRITES: all Legacy KM.DB (updateShippingPlanLineQty/Status, completeShippingPlan, appendShippingPlanNote) — unchanged
Dual read: NONE (Workspace mode does not call getShippingPlans); no silent Workspace→Legacy fallback
Workspace render: snapshot-primary (live=null); cross-domain live fallback stays Legacy-only (documented, tested)
§22 extension: 40_api_v1_weekly_workspace.gs adds read-only raw passthrough on plan+line (same 4 tables)
Planning-cycle: outcome B (field absent, UI not dependent) — no control wired, no column added
Tests: km-api-weekly-page-cutover.test.js 27/0; km-api-weekly-workspace.test.js 66/0; compat 43/0; foundation 57/0
Golden 39/1/0; #34 Pending; replen P29–P31 still failing (unrelated)
Next: API-3B Verification-Copy browser validation (checklist frozen, not run)
```

- **Files (API-3A):** `assets/js/pages/shipping-plan.js` (read boundary + adapter, `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/specs/active/apps-script/40_api_v1_weekly_workspace.gs` (§22 raw passthrough, `APPS_SCRIPT_SYNC_REQUIRED`), NEW `assets/tests/km-api-weekly-page-cutover.test.js` + updated `km-api-weekly-workspace.test.js` / `km-api-foundation-compat.test.js` (GIT_ONLY), NEW `API_WEEKLY_SHIPPING_CUTOVER_SPEC.md` + `API_WEEKLY_SHIPPING_F3A_REPORT.md`, updated `API_MIGRATION_MASTER_PLAN.md` + this entry (DOCUMENTATION_ONLY). `BUNDLE_REBUILD_REQUIRED=false`. **Unchanged:** `01_router.gs`, generated bundle, Recommendation/Submit runtimes, DB schema, all Weekly write handlers, formulas. Not pushed, not deployed; live/browser parity = OPEN (API-3B).

---

## API Workspace Transport Hotfix (Round T1) SOURCE-PRESENT / TEST-VERIFIED, NOT DEPLOYED (2026-08-05)

Root cause of the browser `TRANSPORT_NOT_CONFIGURED`: the Workspace `ApiTransport` had no Web App URL (`deps.baseUrl` never injected). **Fixed** by reusing the existing canonical endpoint via call-time resolution — no duplicate URL, no `.gs` change.

```text
URL authority: window.KM.DB.getApiBaseUrl() (reuses OP_DB_API_BASE_URL; read-only getter) — SINGLE authority
Resolution: call-time (deps.baseUrl/getBaseUrl → KM.DB.getApiBaseUrl → KM.config.operationDbWebAppUrl); no stale capture
Codes: blank → TRANSPORT_NOT_CONFIGURED; malformed → TRANSPORT_URL_INVALID; no silent Legacy fallback
Contract: POST canonical exec URL, text/plain, body {apiVersion,action:weeklyShipping.workspace.get,requestId,payload,context}
Diagnostic: KM.api.getTransportStatus() → {configured,source,maskedEndpoint(no Script ID),urlStatus,weeklyEnabled}
Apps Script: UNCHANGED (doPost already accepts the body action) · Bundle rebuild: false
Legacy: getOperationDb + all KM.DB writes UNCHANGED · Production flags remain false
Global bootstrap: getOperationDb STILL loads at startup — GLOBAL_BOOTSTRAP_OPTIMIZATION_NOT_STARTED
Status flags: TRANSPORT_WIRING_VERIFIED · GLOBAL_LEGACY_BOOTSTRAP_STILL_ACTIVE · VERIFICATION_COPY_WRITE_READBACK_NOT_PERFORMED
Tests: km-api-transport-wiring.test.js 30/0; foundation 57/0; compat 43/0; weekly workspace 66/0; page cutover 27/0
Golden 39/1/0; #34 Pending; replen P29–P31 still failing (unrelated)
Environment: primary DB actively bound (copy = emergency rollback only) → browser verification READ-ONLY, no live write test
Next: API-3B READ-ONLY browser verification on the primary DB (write/readback = LIVE_WRITE_READBACK_NOT_VERIFIED)
```

- **Files (T1):** `assets/js/api/operation-system-db-api.js` (read-only `getApiBaseUrl` getter, `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/js/api/km-api-foundation.js` (call-time transport resolution + `TRANSPORT_URL_INVALID` + `getTransportStatus`, `FRONTEND_GITHUB_PAGES_REQUIRED`), NEW `assets/tests/km-api-transport-wiring.test.js` (GIT_ONLY), updated `API_FOUNDATION_ARCHITECTURE.md` §8.2 + `API_WEEKLY_SHIPPING_F3A_REPORT.md` §5a/§6 + this entry (DOCUMENTATION_ONLY). **No `APPS_SCRIPT_SYNC_REQUIRED`; `BUNDLE_REBUILD_REQUIRED=false`.** Not pushed, not deployed.

---

## Weekly Command Reliability Hotfix (Round C1) SOURCE-PRESENT / TEST-VERIFIED, NOT DEPLOYED (2026-08-05)

Fixes the "write-succeeded / acknowledgement-failed" defects on Weekly commands (Submit/Approve/Reject/Cancel/Complete/Save/Add Note). **Frontend-only; no business logic, no lifecycle change, no `.gs` change, no allocation-draft bridge, not deployed.**

```text
Root cause: the adapter awaited a whole-DB readback AFTER the handler committed → a reload hiccup rejected a committed write (false failure)
Fix: canonical command runner _kmWeeklyCommand_ — result derived ONLY from the handler response; NEVER throws; readback decoupled
Classification: HTTP_TRANSPORT_ERROR · NON_JSON_RESPONSE · BUSINESS_COMMAND_ERROR · ALREADY_IN_TARGET_STATE · TRANSPORT_NOT_CONFIGURED
Idempotency: retry after a committed transition → ALREADY_IN_TARGET_STATE → benign refresh (no scary error, no duplicate side effect)
Single readback: page _spReadbackAfterWrite_ via the ACTIVE path (Workspace when enabled, else Legacy) — never both; stale-seq guarded
Committed-readback-failed: shows "已提交，正在重新確認狀態…" + reconciliation render (no blind-retry prompt)
Double-click guard: per-planId:command in-flight flag → second click IN_FLIGHT (no dual write)
Submit sequencing: qty-save failure now STOPS the submit (no "qty error while already Pending")
Apps Script: UNCHANGED · Bundle rebuild: false · Safety (S0/S0.5) preserved: production-safety 85/85
Tests: km-weekly-command-reliability.test.js 28/0; page cutover 27/0; transport 30/0; foundation 57/0; compat 43/0; weekly workspace 66/0
Golden 39/1/0; #34 Pending; replen P29–P31 still failing (unrelated)
Environment: primary DB in use → live write retest READ-first; write/readback = LIVE_WRITE_READBACK_NOT_VERIFIED unless authorized/copy-bound
Next: Round C2 = shipping_allocation_drafts bridge (explicitly deferred; not started)
```

- **Files (C1):** `assets/js/api/operation-system-db-api.js` (canonical Weekly command runner; the 4 write adapters delegate to it, no internal readback — `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/js/pages/shipping-plan.js` (guarded `_spRunCommand_` + single active-path readback + committed/readback-failed handling — `FRONTEND_GITHUB_PAGES_REQUIRED`), NEW `assets/tests/km-weekly-command-reliability.test.js` (GIT_ONLY), NEW `docs/planning/WEEKLY_COMMAND_RELIABILITY_C1.md` + this entry (DOCUMENTATION_ONLY). **No `APPS_SCRIPT_SYNC_REQUIRED`; `BUNDLE_REBUILD_REQUIRED=false`.** Not pushed, not deployed.

## Phase-1 Allocation Draft Contract Decision Landing (Round C2-D1) DOCS + READ-ONLY DIAGNOSTIC, NO MIGRATION APPLY (2026-08-05)

Lands the user-confirmed Phase-1 allocation-draft contract (D-C2-1…D-C2-4) after Round C2 correctly HALTed on a Header source-of-truth + Active-Draft key conflict. **No migration applied; no runtime/handler/router/page/schema/bundle change; no live DB accessed; no persistence/Submit implemented.**

```text
D-C2-1 Header = Model 1 (running-stack 23-col shipping_allocation_drafts); no recommendation_group_no; recommended method/last-mile NOT header
D-C2-2 Active-Draft/Submit key = K3 (WEEKLY_SHIPPING + planning_cycle + company + country + marketplace + source_page); draft_version = version/concurrency, not a natural key
D-C2-3 Route grain = line-level: selected_source/destination_warehouse_id (From/To), selected_shipping_method (Method), route_no, planned_qty, recommended_qty snapshot
D-C2-4 2026-07-27 Model-2 Amendment (group_no/26-col/K2/air-sea split) = PHASE_2_DEFERRED, retained as design reference, not Phase-1 runtime authority
Source-of-truth gate: §3.6 (design) == running-stack handler constant for the 23-col DRAFTS header (no conflict); LINE table had a minor override_reason/line_status doc-order drift → running stack governs (reconciled, no HALT)
Freeze: byte-for-byte Model-1 headers (drafts 23 / lines 52) from SHIPPING_ALLOCATION_DRAFT(S)_HEADERS_
Diagnostic: 41_shipping_allocation_schema_audit.gs auditShippingAllocationSchemaReadOnly() — READ ONLY, exact-ID guard, zero mutation, not routed, editor-run only; no live apply function
Migration: PLAN-ONLY classifier (NO_MIGRATION_REQUIRED / REORDER_ONLY_SAFE_CANDIDATE / EXTRA_EMPTY_.. / EXTRA_POPULATED_REQUIRES_MAPPING_DECISION / MISSING_CANONICAL_.. / DUPLICATE_OR_BLANK_BLOCKED / UNKNOWN_BLOCKED); never emits DELETE
Running stack: bridge SOURCE PRESENT; LIVE BLOCKED BY SCHEMA MISMATCH; NOT LIVE VERIFIED; 3 adapters await C1 alignment post-migration (C2-D2)
Tests: allocation-draft-schema-audit.test.js; Golden 39/1/0; #34 Pending; replen P29–P31 unchanged (unrelated); production-safety + C1 remain green
```

- **Files (C2-D1):** NEW `docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md` (Phase-1 authority — DOCUMENTATION_ONLY), `docs/planning/SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md` (Phase-2-deferred banner — DOCUMENTATION_ONLY), `docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` (§3.6 Phase-1 landing annotation — DOCUMENTATION_ONLY), NEW `assets/specs/active/apps-script/41_shipping_allocation_schema_audit.gs` (read-only editor-run diagnostic — `APPS_SCRIPT_SYNC_REQUIRED` only to run the audit; not routed; no deployment version), NEW `assets/tests/allocation-draft-schema-audit.test.js` (GIT_ONLY), this entry (DOCUMENTATION_ONLY). **No `BUNDLE_REBUILD_REQUIRED` (false). No frontend/runtime/route change.** Not pushed, not deployed.

## Allocation Draft reconciled to the APPROVED 30/28 live DB schema (Round C2-D1R) SOURCE + TEST-VERIFIED, NOT LIVE-VERIFIED (2026-08-05)

**SUPERSEDES the C2-D1 Model-1 23/52 freeze.** The user confirmed the EXISTING live DB is canonical and is **30-col header (header-level route grain) / 28-col line (SKU+qty)** — NOT the 23/52 the C2-D1 handler *constant* claimed. That stale 23/52 constant was the actual root cause of `PRODUCTION_SAFETY:HEADER_ORDER_MISMATCH`. This round aligns SOURCE (handler constants + write logic + frontend payload bridge + docs + tests) to the approved 30/28 schema. **No live DB read/written; no migration applied; no column expansion; NO_MIGRATION_REQUIRED expected once source == live.**

```text
Draft header (30): ...marketplace, status, recommended_source_warehouse_id, recommended_destination_warehouse_id, *_code_snapshot x2, recommendation_group_no, recommended_shipping_method, recommended_last_mile_delivery, generation_type, calculation_run_id, formula_version, ... note
Line (28): ...calculated_gap_qty, source_initial_available_qty_snapshot, source_available_before_allocation_snapshot, allocation_sequence, recommendation_reason, recommendation_flags, recommended_qty, planned_qty, units_per_carton, route_no, line_status, override_reason, note, created_at, updated_at  (NO selected_*/carrier-cost/user_edited)
Grain: route (From/To/Method/Last-mile) = HEADER recommended_*; line = SKU + qty; one route per Draft (multi-route → separate Drafts, §3)
Key: K3 (WEEKLY_SHIPPING + planning_cycle + company + country + marketplace + source_page); draft_version = version/concurrency; group_no present but Phase-1-unused
Handler: sadUpsertDraftHeaderCore_ writes recommended_* route + PLAN_HEADER_INCOMPLETE gate (sadHeaderRouteIsComplete_); sadLineIsComplete_ = SKU + Qty>0 → PLAN_LINE_INCOMPLETE; EXEC_FIELDS/SAD_RECOMMENDATION_FIELDS_/SAD_LINE_LEGACY_ALIASES_ reconciled to 28-col
Frontend: IRDraft.buildDraftHeaderPayload adds header route context; buildDraftLinePayload = 28-col (no selected_*); _flushDraftDbPersist derives header route from complete[0]
Submit → Weekly Plan handoff: NOT built (handler marks submitted only) — forward (C2-D2); live write NOT VERIFIED
Amendment 2026-07-27: 30-col header shape IS the live Phase-1 schema; air/sea multi-head + group_no multi-draft + K2 key = PHASE_2_DEFERRED
Tests: allocation-draft-30-28-reconcile 24/0; audit 51/0; persistence ALL PASS; replen-draft-completeness ALL PASS (P29–P31 RESOLVED via correct core-targeting); full suite 77/77 files green
Golden 39/1/0; #34 Pending; production-safety 67 + 85 green; C1 28/0
```

- **Files (C2-D1R):** `assets/specs/active/apps-script/16_shipping_allocation_handlers.gs` (30/28 constants + header-route write + completeness gates — `APPS_SCRIPT_SYNC_REQUIRED`, `BUNDLE_REBUILD_REQUIRED=false`), `assets/js/utils/inventory-compat.js` + `assets/js/pages/inventory-replenishment.js` (IRDraft header-route payload + flush — `FRONTEND_GITHUB_PAGES_REQUIRED`), `docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md` + `SHIPPING_ALLOCATION_TO_SHIPMENT_CANONICAL_AMENDMENT_2026-07-27.md` + `REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md` (DOCUMENTATION_ONLY), NEW `assets/tests/allocation-draft-30-28-reconcile.test.js` + updated `allocation-draft-schema-audit.test.js` / `shipping-allocation-draft-persistence.test.js` / `replen-draft-completeness.test.js` (GIT_ONLY), this entry. **P29–P31 resolved (test scanned the public wrapper, not the private `sadUpsertLinesKeyedCore_` core; retargeted).** Not pushed, not deployed, no live DB accessed.

## Allocation Draft runtime completion — reliable Save/Cancel/Readback + K3 hard enforcement (Round C2-D2) SOURCE + TEST-VERIFIED, SUBMIT HALTED, NOT LIVE-VERIFIED (2026-08-05)

Completes the safe C2-D2 runtime gaps on the approved 30/28 schema and **HALTs the Submit → Weekly Shipping Plan handoff** per the round's §17/§25 (unresolved supply authority). **No schema change, no reservation/deduction/stock-movement, no live DB access, no push/deploy.**

```text
K3 hard enforcement: sadResolveActiveDraft_(sh, scope) — key = planning_cycle+company+country+marketplace+source_page (NO draft_version, NO recommendation_group_no); 0→CREATE, 1→REUSE, >1→BLOCKED_CONFLICT (zero mutation, conflict ids). Used by Save/Cancel/Readback.
Multi-route block (§7): IRDraft.distinctRouteContexts + flush → >1 distinct From/To/Method/Last-mile → MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1 (never silently persists route0)
Targeted readback (§9): getShippingAllocationDraftWorkspace / handleGetShippingAllocationDraftWorkspace_ — reads ONLY the 2 draft tables (never getOperationDb); statuses NO_ACTIVE_DRAFT / ACTIVE_DRAFT_FOUND / BLOCKED_CONFLICT
Cancel (§13): cancelShippingAllocationDraft / handleCancelShippingAllocationDraft_ — soft-cancel (status+cancelled_*), preserves Header/Lines, idempotent already_cancelled, submitted-blocked, no hard delete
C1 alignment (§10): the 3 allocation adapters delegate to _kmWeeklyCommand_ (ack decoupled, structured errors, never throw, NO internal loadOperationDb); readback adapter text-first
Router (§20): +getShippingAllocationDraftWorkspace +cancelShippingAllocationDraft (thin)
SUBMIT HALT (§14-§19): createShippingPlansBatch has NO source-availability/L2 authority (engines NOT IMPLEMENTED), random-UUID (non-deterministic) IDs, and shipping_plans/lines have NO allocation_draft lineage column → idempotent retry would need a new column (prohibited §24); existing local-state "Submit Plan" UI predates C2-D2 and does not meet §14 (not modified)
Tests: allocation-draft-runtime-c2d2 29/0; full suite 78/78 files green; C1 28/0; Weekly WS 66/0; cutover 27/0; production-safety 67+85; Golden 39/1/0; #34 Pending; replen ALL PASS
```

- **Files (C2-D2):** `16_shipping_allocation_handlers.gs` (K3 resolver + BLOCKED_CONFLICT + targeted readback + whole-Draft cancel — `APPS_SCRIPT_SYNC_REQUIRED` + **new deployment version** for the doPost readback/cancel actions), `01_router.gs` (2 thin actions — `APPS_SCRIPT_SYNC_REQUIRED`), `assets/js/api/operation-system-db-api.js` + `assets/js/utils/inventory-compat.js` + `assets/js/pages/inventory-replenishment.js` (C1 adapters + readback adapter + multi-route block — `FRONTEND_GITHUB_PAGES_REQUIRED`), `docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md` §9 (DOCUMENTATION_ONLY), NEW `assets/tests/allocation-draft-runtime-c2d2.test.js` (GIT_ONLY), this entry. **`BUNDLE_REBUILD_REQUIRED=false`.** Not pushed, not deployed, no live DB accessed. **Submit → Weekly Plan handoff remains forward (HALTed).**

## Allocation Draft UI workflow — truthful persistence state machine + targeted readback + cancel wiring (Round C2-D2A-UI) FRONTEND SOURCE + TEST-VERIFIED, NOT LIVE-VERIFIED (2026-08-05)

Completes the C2-D2 UI gaps. **Frontend-only + one C1-runner response-contract correction; no `.gs` handler/router change, no schema change, no Submit, no whole-DB reload, no live DB access, no push/deploy.**

```text
State machine (IRDraftWorkspace, inventory-compat.js — pure, DOM-free, deps-injected, Node-tested): NOT_SAVED/SAVING/SAVED/SAVE_FAILED/CONFLICT/CANCELLED/SUBMITTED (+ LOADING_DRAFT). State from committed ack + targeted readback, never toast text.
Save: validate (multi-route→header→line) → SAVING (double-click IN_FLIGHT) → adapter → exactly ONE getShippingAllocationDraftWorkspace readback → SAVED (id/version/timestamp/Saved to DB). Committed+readback-failed → stays SAVED + WRITE_COMMITTED_READBACK_FAILED (Retry Readback; never resends). recommended_qty + line ids pass through.
Load/Refresh: one targeted readback per K3 scope; stale-load seq-guarded; NO_ACTIVE_DRAFT→NOT_SAVED, ACTIVE→DB status, BLOCKED_CONFLICT→CONFLICT (no guessed draft). Never getOperationDb/loadOperationDb.
Cancel: gated control (eligible SAVED) + confirm (id/scope/lines) → one cancelShippingAllocationDraft → one readback → CANCELLED (Header/Lines kept as history); repeat benign ALREADY_CANCELLED; no delete.
Local recovery: sessionStorage = unsaved buffer; compareLocalVsDb → DIFFERENT → explicit Use DB (default)/Restore Local/Review; restore→NOT_SAVED, no write, no merge; SUBMITTED/CANCELLED never overwritten (DB_TERMINAL_LOCKED).
Adapter correction (§16-justified): _kmWeeklyCommand_ now surfaces canonical leading-token codes (BLOCKED_CONFLICT/PLAN_HEADER_INCOMPLETE/PLAN_LINE_INCOMPLETE/MULTIPLE_ROUTE_CONTEXTS_UNSUPPORTED_PHASE1/NO_ACTIVE_DRAFT/IMMUTABLE_TERMINAL_STATUS/…) + preserves conflictIds into error.details (C1 Weekly behavior unchanged).
Legacy Submit Plan: classified as legacy/manual Shipping-Plan creation, kept separate, not wired to any Draft submit; workspace exposes NO submit; page never marks a Draft submitted from local. DB-authoritative Submit remains HALTed.
Tests: allocation-draft-ui-c2d2a 36/0; full suite 79/79 files green; C1 28/0; Golden 39/1/0; #34 Pending.
```

- **Files (C2-D2A-UI):** `assets/js/utils/inventory-compat.js` (IRDraftWorkspace state machine + orchestration — `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/js/pages/inventory-replenishment.js` (controller wiring + truthful persistence panel + cancel/refresh + initial targeted load — `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/js/api/operation-system-db-api.js` (canonical-code + conflictIds response-contract correction — `FRONTEND_GITHUB_PAGES_REQUIRED`), `docs/planning/ALLOCATION_DRAFT_PHASE1_CONTRACT_FREEZE.md` §10 (DOCUMENTATION_ONLY), NEW `assets/tests/allocation-draft-ui-c2d2a.test.js` + updated `km-weekly-command-reliability.test.js` (GIT_ONLY), this entry. **No `APPS_SCRIPT_SYNC_REQUIRED`; `BUNDLE_REBUILD_REQUIRED=false`.** The persistence panel self-injects via JS (no CSS added — functional, unstyled; optional CSS is a follow-up). Not pushed, not deployed, no live DB accessed.

---

## Supply Planning Formula Runtime — Current-State Reconciliation (Phase F1-0) READ-ONLY AUDIT, NO IMPLEMENTATION (2026-08-05)

Full read-only reconciliation of the supply-planning formula runtime (documentation ↔ code ↔ DB ↔ UI) before Formula-Runtime implementation begins. **No formula invented, no business logic / DB schema / Apps Script / frontend change, no deployment, no live Spreadsheet access.** Four audit documents created; this entry is the verified status summary.

```text
Verified central finding — TWO runtime lanes:
  Lane 1 Calculation Pure Runtime = FUNCTIONALLY COMPLETE / TEST-VERIFIED (Golden 39/1/0; #34 Pending downstream)
  Lane 2 Recommendation/Persistence/Orchestration Runtime = NOT WIRED / NOT DEPLOYED / fail-closed
Browser reach of the canonical core: 0 of 8 Phase-1 pages (index.html loads ZERO supply-planning-*.js)
Deployed supply writer: ONLY 21_factory_inventory_handlers.gs (physical factory_stock + movements)
Recommendation output columns (recommended_qty / calculated_gap_qty / net_order_need_snapshot): BLANK in production (no deployed writer; never faked)
calculation_run_id: DETERMINISTIC (RUN::<draftId>::v<version>, persistence.js) — NOT the random-UUID of the shipping_plans Submit path
recommendation_calculation_runs journal: schema+writer implemented as pure modules (test-verified), NOT migrated live
RECOMMENDATION_TARGET_SPREADSHEET_ID_: unified to PRODUCTION_DB_SPREADSHEET_ID_ (00_config.gs:25); live gate now = schema-not-provisioned fail-closed (not empty id)
Pooling: correctly bounded — NO accidental Phase-2 cross-company borrowing; reallocation_in/out_qty_snapshot are blank Engine-B placeholders
Tests (run from Main): 80/80 test files PASS; Golden Matrix 39 executed / 1 pending / 0 canonical-blocked; Scenario #34 Pending
Note: pre-existing replen-draft-completeness P29–P31 are RESOLVED (C2-D1R retargeted to sadUpsertLinesKeyedCore_); file PASSES — older API-1/API-2 "still failing" ledger lines are STALE
```

- **First missing end-to-end link (verified):** primary = the deployed **Recommendation Runtime seam** (live-source → complete pure calc → persisted output → UI readback) — everything upstream (source reads, pure calc) and everything downstream of a *decided* quantity (draft save/readback, request-order decision layer, PO convert/receive, shipment, current-stock deduction) is present/wired; the calc→persist→UI bridge is the single severed edge. Adjacent gaps: no §8/§9 month-by-month projection engine (DOCUMENT_ONLY); §2E Qualified-Incoming ten-gate **bypassed** in the production ledger path (status-map shortcut; 3 divergent status vocabularies; `arrived` conflict). Secondary (execution lane) = **Allocation Draft Submit → Weekly Shipping Plan HALTED** (`16_…:352`, HALT `:359-365`).
- **Selected first implementation slice:** **F1-3 Qualified-Incoming → Supply-Ledger Production Connection** (pure, test-first, no deploy, read-only) — uses only frozen+implemented+tested pieces, resolves the highest-severity active conflict, is a prerequisite for truthful projection + replenishment, lowest rework/business risk. The spec's preferred *Inventory Projection Runtime Integration* is NOT ready (no engine + status-mapping blocker + no writer + not deployed).
- **Genuine open decisions (register):** D-1 Verification-Copy deploy target (🔴 blocks live), D-2 provision `factory_stock_allocation_plans` (🟠 blocks F1-5), D-3 Submit lineage/idempotency + additive lineage column (🔴 blocks Submit), D-4 B-8 cancel/release (🔴 blocks reservation), D-5 B-4 residual QI double-count owner (🟠 affects F1-3), D-6 B-6 Request→PO atomicity (🟢 non-blocking), D-7 Forecast Target% apply-vs-retire (🟠 blocks F1-1). Already-frozen rules NOT re-opened.
- **Files (F1-0):** NEW `docs/planning/SUPPLY_PLANNING_FORMULA_RUNTIME_RECONCILIATION.md`, NEW `docs/planning/SUPPLY_PLANNING_FIELD_OWNERSHIP_MATRIX.md`, NEW `docs/planning/PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md`, NEW `docs/planning/SUPPLY_PLANNING_DECISION_REGISTER.md` (all DOCUMENTATION_ONLY), this entry. **No production code, no test, no `.gs`, no DB schema, no bundle change. `BUNDLE_REBUILD_REQUIRED=false`; no `APPS_SCRIPT_SYNC_REQUIRED`.** Not pushed, not deployed, no live DB accessed. Next: F1-3 (first slice) after the round's authorization.

---

## Global Logistics Map — Premium Control-Tower Visual Pass (Batch UI-GLOBE-02) VISUAL ONLY (2026-08-05)

Enterprise Supply-Chain-Control-Tower visual upgrade of the On-the-Way / Global Logistics Map (the persistent 3D WebGL globe + its page chrome). **Visual only — no business logic / data mapping / API / event handler / route projection / marker / shipment / state change.** User confirmed direction "Elevate the globe + full chrome" (kept the existing `KMGlobe` architecture; did NOT rebuild as SVG/flat map).

```text
Globe surface (km-globe.js, buildEarthCanvas — pure canvas-2D, one-time, deterministic seeded PRNG):
  richer terrain painted from the SAME vendored land outline (window.KM_WORLD_LAND) — NO new asset, NO dependency:
  latitude biome banding (snow/taiga/temperate/desert/tropical) + anchored desert/forest/ice patches +
  two-octave relief mottling (mountain feel, no elevation data) + ocean depth gradient + continental-shelf halo +
  faint baked lat/long graticule + restrained baked cloud layer. Texture STILL 2048×1024 (memory unchanged).
Shader: FS_PTS constant-only marker layering (core→white halo→status ring→dark rim; opaque, same picking).
  FS_SPHERE atmosphere UNCHANGED (UI-GLOBE-01). Arcs UNCHANGED (40-step smooth). Data-driven marker/arc colors UNCHANGED.
Render model: NO new draw pass (clouds baked into the texture, not a 2nd sphere), NO setInterval, exactly 3 rAF sites,
  on-demand render preserved → runtime FPS unchanged. Honest WebGL-unavailable error card + prefers-reduced-motion kept.
Chrome (global-logistics-map.css, full premium rewrite; ALL class names preserved): design-token system, glass
  floating panels (backdrop-filter), refined typography hierarchy + tabular-nums, premium KPI stat rail, Apple-card
  shipment cards / drawer / tooltip / tray, taller immersive map hero (clamp(600px,80vh,1000px)), restrained
  150–300ms motion, ultra-wide/laptop/mobile responsive. Kitchen Mama brand blue + neutral slate; no neon/glow/gaming.
Tests: globe-visual-guard 44/0 (all UI-GLOBE-01 runtime/structure/data-binding guards STILL green + new V5–V12);
  globe-math ALL PASS; global-logistics-map ALL PASS; FULL SUITE 80/80 files green.
HEADLESS CAVEAT: no browser/GPU here — FPS/memory/screenshots UNMEASURABLE; user must verify in a browser. Revert = this one commit.
```

- **Files (UI-GLOBE-02):** `assets/js/lib/km-globe.js` (`buildEarthCanvas` premium texture + `FS_PTS` marker constants — `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/css/pages/global-logistics-map.css` (premium chrome rewrite — `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/tests/globe-visual-guard.test.js` (updated visual markers + new guards — GIT_ONLY), this entry (DOCUMENTATION_ONLY). **No `.gs` / router / DB / bundle change; `BUNDLE_REBUILD_REQUIRED=false`; no `APPS_SCRIPT_SYNC_REQUIRED`.** Frontend-only (GitHub Pages redeploy of `km-globe.js` + `global-logistics-map.css`). Not pushed, not deployed, no live DB accessed.

---

## Phase F1-3 — Qualified Incoming → Supply Ledger Production Connection HALTED / PARTIAL (read-only Phase A; NO runtime change) (2026-08-05)

Executed Phase A (read + root-cause) of the first F1 implementation slice. **HALTED before any code connection** per the round's HALT protocol, on a genuine, code+doc-verified reconciliation conflict. **No formula / DB / schema / Apps Script / router / adapter / frontend / bundle change; no live DB; no push/deploy.**

```text
Root cause: source-projection.js:projectRecommendationProductionSources builds shipping_plans+shipments supply
  via its OWN status maps (SHIPPING_PLAN_STATUS/SHIPMENT_STATUS/LEGACY_STATUS, lines 50-56) — never calls the
  canonical §2E path. The canonical QI→ledger bridge source-facts.js:projectSupplyLifecycle (line 241; routes
  shipments through the REAL evaluateQualifiedIncoming + count-once + buildSupplyLedger) EXISTS + is tested (68)
  but has NO production caller (grep-verified).
GENUINE BLOCKER: the canonical bridge is itself NON-CONFORMING to frozen SC-11.4 and diverges from the already-
  conforming production projector:
  • arrived: bridge = DELIVERED_NOT_RECEIVED (source-facts:93, TESTED) vs SC-11.4-B/C = SHIPPED_IN_TRANSIT
    (delivered only from a delivery-event authority, never inferred from arrived). source-projection:53 conforms.
  • shipping_plans vocab: source-projection 'site_confirmed' vs bridge/handlers/spec canonical 'approved'.
  • delivered/received: source-projection uses non-canonical delivery_event/receiving_authority flags; the bridge
    uses canonical routeEvents/receivingFacts inputs (which the production path does not feed).
  • lineage format differs (ship:<lineId> vs canonical B4-R3 shipment:<shipmentId>:<shipmentLineId>).
  → wiring production→bridge as-is would REGRESS SC-11.4 conformance + change multiple frozen, test-locked
    semantics; a correct connection requires reconciling the bridge to SC-11.4 FIRST (a decision, not a wiring).
RESOLVED / NOT blocking: PO→Shipment ownership (PRODUCTION_STATUS_MAP shipped→OMIT_TRANSFERRED, REQUEST_ORDER §1);
  count-once identity present (B4-R3 lineageKey + buildSupplyLedger by lineageRef); no DB/schema need; the ETA-
  coverage gate correctly lives in the GAP path (evaluateQualifiedIncoming→calculateGap), so late supply is
  ledger-VISIBLE but contributes 0 to coverage per §2F "visible, not covering" (correct, not a defect).
Recommendation: Option B — F1-3a (conform the bridge's arrived to SC-11.4-B/C + update its cited test + rebuild
  bundle; requires explicit authorization as it changes a test-locked frozen semantic) THEN F1-3b (wire the
  production path to the now-conforming bridge). Full analysis + options A/B/C: PHASE_F1_..._PLAN.md §"F1-3
  Execution Status".
Tests: no test added/changed this round; full suite unaffected (80/80). Golden Matrix 39/1/0 (unchanged). #34 Pending.
```

- **Files (F1-3, read-only outcome):** `docs/planning/PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md` (appended F1-3 Execution Status + options A/B/C + recommendation — DOCUMENTATION_ONLY), this entry (DOCUMENTATION_ONLY). **No production code, no `.gs`, no bundle, no test, no DB.** Not pushed, not deployed, no live DB accessed. Next authorized step: **F1-3a** (SC-11.4 `arrived` bridge conformance) pending authorization, then **F1-3b** (production wiring).

---

## Global Logistics Map — Globe Material & Color Calibration (Batch UI-GLOBE-02B) VISUAL ONLY (2026-08-05)

Restrained material/lighting/color-calibration pass on the existing 3D WebGL globe (which looked washed-out / foggy / over-saturated after UI-GLOBE-02). **NOT a redesign, no added complexity.** Visual only — **no shipment / marker / route / filter / click / hover / zoom / camera / state / API / DB / business-logic change.** The globe is **raw WebGL (custom GLSL + procedural canvas texture), NOT Three.js** — there is no toneMapping / toneMappingExposure / outputColorSpace / metalness / roughness / normalScale; the calibration touches their raw-WebGL equivalents.

```text
Lighting (FS_SPHERE, constant-only): ambient 0.66→0.46, diffuse 0.42→0.52 (day 0.98 = no overexposure; night floor
  0.46 = readable, not black; more terrain contrast, less washed-out). Light dir vec3(0.35,0.25,1.0) unchanged.
Atmosphere: in-shader rim narrowed + softened (pow 2.4→3.4; colour 0.14/0.28/0.50 → 0.10/0.20/0.38) → edge-only
  silhouette that never milks the surface. CSS .glm-globe-host::before central glow opacity ~3x down (0.15→0.05)
  = no milky overlay over land; ::after depth vignette unchanged; mix-blend-mode/pointer-events preserved.
Ocean (texture): darker + calmer, less cyan — deep #0a1a30→#081627, tropical peak #166b96→#134f70; shelf halo
  rgba(92,168,205,0.45)→rgba(74,132,165,0.32) (restrained coastal depth cue).
Land colour (texture): biome palette desaturated toward natural satellite tones (muted olive-greens + muted
  tan/ochre, less vivid); anchored biome patches muted + lower alpha; base #43733f→#4a6a48. Regional variation kept
  (NOT globally desaturated to gray). Relief mottling soft-light 0.34/0.20→0.40/0.24 (mild local-contrast lift).
Clouds (texture): MINIMIZED — count 96→54, size 30-115→26-92, per-blob alpha 0.08-0.19→0.035-0.085 (a faint hint,
  must not haze terrain). Baked into the texture (rotates WITH Earth); no separate cloud sphere.
Material/colour-space: raw WebGL, non-metallic diffuse (no metalness/roughness); canvas texture authored in display
  space, uploaded gl.RGB, sampled gl.LINEAR/CLAMP_TO_EDGE (filtering unchanged); NO tone-mapping / NO gamma pass →
  no double gamma; colours calibrated in the texture/shader directly, NOT via CSS filters (none added).
Perf: texture built ONCE (cheaper: fewer clouds), NO new render loop, NO setInterval, exactly 3 rAF sites, on-demand
  render preserved (FPS unchanged), texture still 2048x1024 (memory stable), honest WebGL-unavailable fallback kept.
Tests: globe-visual-guard 44/0 (all runtime/structure/data-binding guards green + calibrated V1/V2/V7); globe-math +
  global-logistics-map ALL PASS; FULL SUITE 80/80.
HEADLESS: no browser/GPU here — before/after screenshots UNMEASURABLE; user must capture at the SAME camera angle. Revert = this one commit.
```

- **Files (UI-GLOBE-02B):** `assets/js/lib/km-globe.js` (FS_SPHERE lighting/rim constants + `buildEarthCanvas` ocean/land/biome/patch/relief/cloud calibration — `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/css/pages/global-logistics-map.css` (`.glm-globe-host::before` de-milk — `FRONTEND_GITHUB_PAGES_REQUIRED`), `assets/tests/globe-visual-guard.test.js` (calibrated V-markers — GIT_ONLY), this entry (DOCUMENTATION_ONLY). **No `.gs` / router / DB / bundle / supply-planning change; `BUNDLE_REBUILD_REQUIRED=false`; no `APPS_SCRIPT_SYNC_REQUIRED`.** Not pushed, not deployed, no live DB accessed.

---

## Phase F1-3a — Canonical Qualified-Incoming Bridge SC-11.4 `arrived` Conformance Fix COMPLETED (2026-08-05)

Surgical, cited conformance fix to the canonical QI→ledger bridge. **No formula / DB / schema / Apps Script handler / router / API / frontend / UI change; no production wiring (F1-3b NOT started); no live DB; no push/deploy.**

```text
Fix: supply-planning-source-facts.js projectSupplyLifecycle SHIPMENT_STATUS_MAP.arrived
     DELIVERED_NOT_RECEIVED → SHIPPED_IN_TRANSIT (SC-11.4-B, RECOMMENDATION_SOURCE_CONTRACT_SPEC.md:597;
     SC-11.4-C:602-603 — DELIVERED_NOT_RECEIVED never inferred from arrived). ONLY this mapping changed.
Preserved (unchanged): received→RECEIVED_NOT_REFLECTED; routeEvents 'delivered'→DELIVERED_NOT_RECEIVED (the
     canonical delivery-event authority); receivingFacts 'confirmed'→RECEIVED_NOT_REFLECTED (receiving authority);
     Current Stock (inventory→CURRENT_STOCK) direct path; external quarantine (contribution 0). Quantity-NEUTRAL
     (both SHIPPED_IN_TRANSIT + DELIVERED_NOT_RECEIVED are active buckets → same effectiveSupplyQty).
Bundle: source-facts is bundled → regenerated via assets/tools/build-apps-script-bundle.js (hash 6f0b654…,
     --check reproducible). BUNDLE_REBUILD_REQUIRED=true (generated 90_*.gs only; no handler/router sync).
Tests: supply-lifecycle 68→74 (+6 focused F1-3a A–F: arrived→SHIPPED_IN_TRANSIT + delivery/receiving authority
     intact + quantity-neutral + Current-Stock + external quarantine); source-facts/qualified-incoming/ledgers/
     source-projection PASS; bundle parity 56 PASS; FULL SUITE 80/80; Golden 39/1/0; #34 Pending.
Next authorized: F1-3b — wire source-projection production path to the now-conforming projectSupplyLifecycle.
```

- **Files (F1-3a):** `assets/js/core/supply-planning-source-facts.js` (arrived mapping — bundled pure module), `assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs` (regenerated via canonical build tool — `APPS_SCRIPT_SYNC_REQUIRED` = generated bundle only, if/when user later deploys), `assets/tests/supply-planning-supply-lifecycle.test.js` (cited arrived assertions + A–F block — GIT_ONLY), `docs/planning/PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md` (§F F1-3a COMPLETED — DOCUMENTATION_ONLY), this entry (DOCUMENTATION_ONLY). **`FRONTEND_GITHUB_PAGES_REQUIRED=false`.** Not pushed, not deployed, no live DB accessed.

### Checkpoint — F1-3b COMPLETED → F1-3 = COMPLETED (2026-08-05)
```
F1-3b — Qualified Incoming → Supply Ledger PRODUCTION connection (wiring/reconciliation, NOT formula work).
Production supply builder (source-projection.js:projectRecommendationProductionSources) now has TWO paths:
  A. Current Stock (FBA/THREE_PL/FACTORY inventory) → DIRECT CURRENT_STOCK (never through Qualified Incoming).
  B. shipping_plans + shipments → canonical KMSF.projectSupplyLifecycle (§2E evaluateQualifiedIncoming ten-gate
     + §39.5 lifecycle + buildSupplyLedger). Canonical entries reused VERBATIM (shape adapter only; bucket never
     re-translated). evaluateQualifiedIncoming is NOW on the production incoming-supply path.
Removed source-projection's own SHIPPING_PLAN_STATUS/SHIPMENT_STATUS/LEGACY_STATUS maps (single canonical
     authority). Canonical `approved` plan vocab (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.2A; 11_ handlers — NOT the
     stale `site_confirmed`, which is the allocation-draft family). Canonical B4-R3 shipment lineage
     shipment:<shipment_id>:<shipment_line_id> (was ship:<line_id>); plan lineage shipping_plan:<id>:<line_id>.
Two residual SC-11.4 bridge corrections (§9-permitted, cited): (§4.1) ROUTE_EVENT_MAP arrived/arrived_port
     DELIVERED_NOT_RECEIVED→SHIPPED_IN_TRANSIT (SC-11.4-C: arrival≠delivery; delivered still→DELIVERED_NOT_RECEIVED);
     (§4.2) SHIPMENT_STATUS_MAP.received RECEIVED_NOT_REFLECTED→OMIT_RECEIVING_AUTHORITY (SC-11.4-B/SC-11.5:
     raw status never a receiving authority; RECEIVED_NOT_REFLECTED only from receivingFacts 'confirmed'). Spec
     owners unanimous (code-only contradictions) → conformance fix, not HALT.
Count-once proven: plan→shipment (OMIT_TRANSFERRED), duplicate lineage (ledger dedup), cross-bucket conflict
     (SUPPLY_LINEAGE_CONFLICT fail-closed), posted-to-current-stock (Gate 9). Late supply (ETA>Required-By)
     ledger-VISIBLE but 0 coverage (§2F). External quarantine preserved (0; no production external table).
Reachable production buckets: APPROVED_SHIPPING_PLAN, SHIPPED_IN_TRANSIT, CURRENT_STOCK. NOT reachable (separate
     slices; canonical authorities not wired): COMMITTED_PRODUCTION (PO), DELIVERED_NOT_RECEIVED (routeEvents),
     RECEIVED_NOT_REFLECTED (receivingFacts). Non-canonical delivery_event/receiving_authority/correction_reversal
     raw-row flags dropped (operational source writes none today — SHIPMENT_CENTER §273 — quantity-neutral).
Bundle: source-facts + source-projection are bundled → regenerated (hash 5795e29…, --check reproducible);
     parity 56 PASS. BUNDLE_REBUILD_REQUIRED=true (generated 90_*.gs only; NO handler/router sync).
Tests: NEW supply-planning-qualified-ledger-connection-f1-3.test.js (23; 22 §12 proofs); supply-lifecycle 74→76;
     source-projection F/G re-based canonical (64); production-source F3 (43); recommendation-source-integration
     29. FULL SUITE 81/81; Golden 39/1/0; #34 Pending. NO formula/DB/schema/API/frontend change; no live DB.
F1-3 = COMPLETED. Next: F1-7 (recommendation persistence/journal — gated by Decision D-1 Verification-Copy target).
```

- **Files (F1-3b):** `assets/js/core/supply-planning-source-projection.js` (production rewire — bundled pure module), `assets/js/core/supply-planning-source-facts.js` (two SC-11.4 bridge corrections — bundled pure module), `assets/specs/active/apps-script/90_generated_supply_planning_bundle.gs` (regenerated via canonical build tool — `APPS_SCRIPT_SYNC_REQUIRED` = generated bundle only, if/when user later deploys), `assets/tests/supply-planning-qualified-ledger-connection-f1-3.test.js` (NEW — GIT_ONLY), `assets/tests/supply-planning-supply-lifecycle.test.js` + `assets/tests/supply-planning-source-projection.test.js` + `assets/tests/supply-planning-production-source.test.js` (canonical re-base + citations — GIT_ONLY), `docs/planning/PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md` (§G F1-3b COMPLETED — DOCUMENTATION_ONLY), this entry (DOCUMENTATION_ONLY). **`FRONTEND_GITHUB_PAGES_REQUIRED=false`.** Not pushed, not deployed, no live DB accessed.

### Checkpoint — F1-4A Recommendation Runtime Connection = AUDIT / HALTED (2026-08-05)
```
F1-4A — connect Inventory Replenishment to the existing runtime (connection only, NO formula rewrite).
Read-only audit → HALTED (dependency graph delivered; no code connection landed). Blockers:
  1. Runtime is SERVER-SIDE only — index.html loads ZERO supply-planning-*.js scripts; the runtime lives only in
     90_generated_supply_planning_bundle.gs. No recommendation READ-API exists (operation-system-db-api.js has
     allocation-draft persistence + getRecommendationDraftToken, nothing that returns computed recommendations).
     Connecting needs API + Apps Script work → FORBIDDEN this round (and F1-4 depends on F1-7, D-1 gated).
  2. Coverage / Days-of-Supply-as-runtime / Projected-Inventory / business Reason (ORDER/TRANSFER/BORROW/NO_ACTION)
     + per-SKU Status/Level are produced by NO runtime — emitting them is a formula/runtime BUILD → FORBIDDEN.
Runtime DOES produce: Current Stock (echo/ledger), Qualified Incoming (qualifiedIncomingQuantity), Suggested Qty
     (resolver recommendedQty). calculateGap returns a BARE number (no coverage/DOS/reason). Read entry point =
     KM.recommendationSourceIntegration.resolveRecommendationFactsFromSource (needs a rich source DTO the page
     doesn't build). Page is fully DISCONNECTED (0 runtime refs); live outputs are stubs (onTheWay:0, suggestedQty
     via needBuckets()=0, status='Sufficient', needsAlert:false); DOS is a UI calc; no Projected/Coverage column.
A minimal client-side calculateGap wire would emit a WRONG number (QI pipeline not loaded → incoming=0) — worse
     than the honest stub; so the stubs must remain until a real connection slice.
Recommended next slices (each needs its own authorization — crosses a forbidden boundary): F1-4B = a read-only
     recommendation API seam (server-side compute via existing runtime → read endpoint; the page consumes
     recommendedQty); F1-5 = a Coverage/DOS/Projected-Inventory engine (the genuine formula build for the 4 gaps).
No formula/runtime/API/DB/schema/Apps Script/UI/bundle change. No live DB. Full suite 83/83; Golden 39/1/0; #34 Pending.
```

### Checkpoint — F1-4B Read-Only Recommendation Workspace API Seam = READINESS AUDIT / HALTED (2026-08-05)
```
F1-4B — one bounded read-only recommendation.workspace.get seam invoking the existing runtime (NO new formula).
§2 readiness audit → HALTED (HALT condition #2). The API/Apps-Script seam is NOW in scope (dissolves F1-4A blocker
  #1) and in fact already stubbed server-side: 27_recommendation_production_source.gs buildProductionRecommendationSource_
  is "kept for a future authorized read-only route". BUT wiring it would return BLOCKED for every real page scope:
Root blocker — the production projection ROUTES, never COMPUTES, the planning facts a recommendation needs:
  • source-projection.js:25 — windowCode/requestMonth/requestBucket/calculatedGap/netOrderNeed are CALLER-OWNED.
  • :345-356 planningRows are a pass-through of input.planningFacts (Weekly window_code+calculated_gap_qty; Monthly
    net_order_need_snapshot). :358-377 receiver/factory facts (survival/daily_demand/demand_weight/eligible_*) are
    caller-owned too. :403-407 fail-closed gate BLOCKS when planningRows (or demand/supply) is empty.
  • :147-154/:174-175/:192-193 destination is caller-owned (D-3); no destination → MISSING_DESTINATION_WAREHOUSE.
  • resolver CAN calculateGap from 4 raw inputs (source-facts.js:588-596) but NOTHING produces them from the DB for a
    fresh scope — the SC-1 "single biggest freeze finding": no Forecast/Sales/warehouse → planning-facts projector.
Only the TEST fixtures supply those facts (Weekly 96 / Monthly 24 from crafted planningFacts/receiverFacts). The
  Inventory Replenishment page supplies scope only — no destination, window_code, gap, net-order-need, receiver facts.
Net: recommendation.workspace.get for the page scope → ready:false SOURCE_NOT_AVAILABLE / MISSING_DESTINATION_WAREHOUSE
  → no lines, no recommendedQty. Suggested Qty (the round's goal) is unobtainable without inventing gap/allocation/
  destination facts → forbidden ("Do not create new formulas"; "no fake zeroes"). §2 HALT rule → make NO runtime/API/
  page code changes; document; smallest next slice; docs checkpoint only.
F1-3b supply lifecycle bridge confirmed landed at HEAD (source-projection.js:249-342; commit 97df611) → Current Stock
  + Qualified Incoming ARE produced (supply ledger) but reachable only if the whole chain reaches ready (it won't).
Smallest next slice: F1-4B-PRE = Recommendation Planning-Facts Projection Runtime (SC-1 convergent gap / SC-9 #1
  remainder) — PRODUCE the caller-owned facts by INVOKING frozen owners (Engine-A calculateGap, sumRemainingShortages,
  survival/weight/eligibility §20.3/§7/§23.6/§40) + D-3 destination selection; THEN this seam becomes meaningful.
Doc: docs/planning/PHASE_F1_4B_RECOMMENDATION_WORKSPACE_BLOCKER.md (readiness table + cited blocker + next slice).
No formula/runtime/API/router/Foundation/page/DB/schema/Apps Script/bundle/CSS change. No live DB. Full suite 83/83
  (unchanged); Golden 39/1/0; #34 Pending. Not pushed, not deployed.
```

### Checkpoint — F1-4B-PRE Recommendation Planning-Facts Projection Runtime = AUTHORITY AUDIT / HALTED (2026-08-05)
```
F1-4B-PRE — build a pure projector that DERIVES the caller-owned planning facts by INVOKING frozen owners (no new
  formula). §2 authority matrix → HALTED (§3). Several required facts have NO callable frozen producer:
IMPLEMENTED / DERIVABLE (invoke-only, exist): regular+special-event+safety demand (calculations.js:489-542
  calculateForecastDrivenRemainingNeed), daily demand (normalizedAvgSalesPerDay run-rate ~:360-430), gap
  (calculateGap :160-167), net order need (sumRemainingShortages :434-443), required-by CLASSIFIER (classifyRequiredByWindow
  :572 — consumes a date, doesn't produce one), current stock + qualified incoming (already in projection, F1-3b).
MISSING CANONICAL AUTHORITY (no producer; only spec formula or caller DTO field → building = new formula = §3/§15
  FORBIDDEN): demand_weight (FC-share §7/§24.5 — source-facts.js:459 requires caller value); eligible_pool_types
  (§23.6/§24.9 — :460 validates a caller list, no derivation); eligible_factory_warehouse_ids (§40/§35 — :498);
  receiver decomposition (receiverFacts[] always caller-supplied — source-projection.js:358 / source-reader.js:347);
  per-receiver dailyDemand→survival wiring (survival=CEILING(18×dailyDemand) :456 needs a caller dailyDemand;
  SURVIVAL_HORIZON_DAYS=18 :389); destination_warehouse_id (D-3 caller-owned, SC-11.3 never inferred, no producer);
  required_by_date (actual date) + window_code (Weekly grain :546) — no producer.
Wall = the allocation stage: projectAllocationInputs (source-facts.js:401-505) VALIDATES caller receiver/factory facts
  and fails closed when absent → allocators allocateOverseasSharedPool/allocateFactoryDeterministic can't run → Weekly
  recommendedQty (FLOOR over ALLOCATED source :638-646) and Monthly factory path can't produce. §15: existing function
  can't be called because inputs underspecified → HALT, don't reimplement. §12: defaulting weight=1/eligible=true/
  guessed destination = fake default success → forbidden.
Bounded decision request: authorize a dedicated FORMULA/producer round (F1-5-A Allocation-Fact Producer Runtime) to
  implement the frozen-but-unimplemented §7/§24.5 weight, §23.6/§24.9 pool eligibility, §40/§35 factory eligibility,
  §22 run-rate→receiver dailyDemand, receiver decomposition, D-3 destination, and window/required-by derivation — the
  SC-1 "single biggest freeze finding" / SC-9 #1 remainder. (Chain reachability is ALREADY proven by test fixtures.)
Doc: docs/planning/PHASE_F1_4B_PRE_PLANNING_FACTS_AUTHORITY_HALT.md (authority matrix + cited blocker + decision + next slice).
No formula/runtime/API/router/Foundation/page/DB/schema/Apps Script/bundle/CSS/source-reader change. No live DB. Full
  suite 83/83 (unchanged); Golden 39/1/0; #34 Pending. Not pushed, not deployed.
```

### Checkpoint — F1-5-A Allocation-Fact Producer Runtime = IMPLEMENTED (2026-08-05)
```
F1-5-A — the previously-missing planning-facts producer is BUILT (formula/runtime round; invoke frozen owners only).
NEW pure module supply-planning-allocation-facts.js (KMAF / window.KM.allocationFacts; projectAllocationFacts(input))
  produces receiverFacts / factoryDemandFacts / planningFacts by INVOKING frozen owners — authors NO formula:
  • dailyDemand = §22 normalizedAvgSalesPerDay (Sales) / §2D calculateForecastDrivenRemainingNeed.forecastDailyDemand
    (Forecast) — from KMCALC.
  • survival NOT recomputed: fact carries dailyDemand; §20.3 CEILING(18×dd) owner is the consumer projectAllocationInputs.
  • demandWeight = §7/§24.5 SHARE basis_i÷Σ_group (company+country); Sales basis = run-rate, Forecast basis =
    forecastShareQty (caller seam — §7 4-month anchor not canonically pinned).
  • eligiblePoolTypes §23.6/§24.9 + eligibleFactoryWarehouseIds §35/§40 DERIVED from warehouses + fulfillment.
  • gap/netOrderNeed NOT computed: planning fact carries the 4 raw inputs; resolver invokes calculateGap /
    sumRemainingShortages.
Caller-owned SEAMS fail-closed (structured issue, never guess/fake): destination D-3 → MISSING_DESTINATION_WAREHOUSE;
  windowCode/requiredByDate §6; demand driver (no canonical classifier) → DEMAND_WEIGHT_UNRESOLVED; POOL_/FACTORY_
  ELIGIBILITY_UNRESOLVED; DAILY_DEMAND_SOURCE_MISSING. MISSING never 0; eligibility never defaults true.
Integration: production-source.js gains a backward-compatible request.allocationFactsInput seam → runs KMAF → injects
  receiver/factory/planning facts into the projection request (producer issues → sourceIssues); absent = unchanged.
Reachability TEST VERIFIED end-to-end: producer → REAL projectAllocationInputs (real overseas allocator) → REAL
  resolveWeeklyRecommendationFacts → real carton-FLOOR recommendedQty; calculatedGap === calculateGap(...) proven.
Tests: NEW supply-planning-allocation-facts-f1-5a.test.js (36). Bundle regenerated 25→26 modules (hash 710cdd36…,
  --check reproducible); parity test updated 25→26. FULL SUITE 84 files / 0 failing; Golden 39/1/0; #34 Pending.
Remaining upstream decision (NOT invented this round): demand-driver classifier (Sales vs Forecast) + §7 rolling-
  4-month FC window anchor have no canonical owner → kept as caller seams (DEMAND_WEIGHT_UNRESOLVED when absent).
Files: assets/js/core/supply-planning-allocation-facts.js (NEW, bundled), supply-planning-production-source.js (seam,
  bundled), assets/tools/build-apps-script-bundle.js (KMAF registered), 90_generated_supply_planning_bundle.gs
  (regenerated — APPS_SCRIPT_SYNC_REQUIRED = generated bundle only, if/when user later deploys), NEW test +
  bundle-parity test (GIT_ONLY), PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md §H + this entry (DOCUMENTATION_ONLY).
BUNDLE_REBUILD_REQUIRED=true (generated 90_*.gs only; NO handler/router sync). FRONTEND_GITHUB_PAGES_REQUIRED=false.
No new business formula/DB/schema/header/API/router/page/CSS change. No live DB. Not pushed, not deployed.
Next: F1-4B-PRE (feed producer facts through the production source builder) then F1-4B (read-only API seam).
```

### Checkpoint — F1-5-B Planning Context Authority Runtime = AUTHORITY AUDIT / HALTED (2026-08-06)
```
F1-5-B — close the four F1-5-A caller seams (destination / window+required-by / demand driver / forecast anchor)
  using existing canonical mapping + frozen rules. §3 authority matrix → HALTED (§4). Round premise does NOT hold:
  3 of 4 seams have no live/frozen canonical source.
BLOCKERS (each a distinct §4 HALT condition):
  1. destinationWarehouseId (condition 4) — D-3/SC-11.3 freezes it caller-owned, "never inferred"; DATABASE_RELATIONSHIP_MAP
     :599 destination fields are "human-readable snapshots only, identity NEVER inferred". The automated source
     replenishment_route_rules (CARRIER_AND_ROUTE_SPEC §5A) is "the future source" / "Spec only — no runtime engine
     exists" (INVENTORY_TABLE_MAPPING §11.2/:44; CARRIER_AND_ROUTE :537,555) — NOT live. Deriving it needs a new DB
     table (forbidden §18) or a business routing decision. Every context needs a destination → central blocker.
  2. demandDriver Sales-vs-Forecast (condition 6 / §9) — §2C/§2D/§20.5 USE it; no stored column (no demand_driver/
     sales_driven/forecast_driven in DATABASE_RELATIONSHIP_MAP) and no frozen classifier rule (§589 treats it as a
     pre-existing SKU property; data-presence is NOT the rule). → DEMAND_DRIVER_AUTHORITY_UNRESOLVED; never default.
  3. forecastWeightAnchor (condition 7) — §7 "rolling future 4-month FC window" anchor NOT pinned (Month+1..+4 §27
     tiers vs Month0..+3); §7 does not cite §27 as its window. Downstream of #2.
Per §4/§19: multiple core authorities unresolved (destination needed by EVERY context) → NO partial public runtime;
  docs-only HALT. F1-5-A seams remain the correct boundary; nothing guessed/defaulted.
Safely-implementable-later (blocked only by 1-3): planningCycle (caller run-param), window start/end + Engine-A/B
  classification via the already-implemented classifyRequiredByWindow (§27A), Regular required-by = window end.
A/B/C options + recommendations (doc §D): Dest = keep caller-owned now (D-3) + authorize a replenishment_route_rules
  schema-freeze path; Driver = add a stored demand_driver classifier (interim = seam); Anchor = confirm §7 == §27
  T1-T4 Regular-only (interim = seam). Each needs an explicit business/schema decision — not derivable this round.
Doc: docs/planning/PHASE_F1_5B_PLANNING_CONTEXT_AUTHORITY_HALT.md (authority matrix + cited blockers + A/B/C + recommendation).
No runtime/API/page/persistence/DB/schema/header/formula/bundle/source-reader change. No live DB. Full suite unchanged
  (84 files / 0 failing); Golden 39/1/0; #34 Pending. Not pushed, not deployed. F1-5-A (83afd10) unchanged.
```

### Checkpoint — F1-5-BD Phase-1 Planning Context decision closure + runtime = IMPLEMENTED (2026-08-06)
```
F1-5-BD — the three F1-5-B seams are FROZEN for Phase 1 and the Planning Context Runtime is BUILT.
Decisions (SUPPLY_PLANNING_DECISION_REGISTER D-F1-5B-1..3; none contradicts an active owner — SC-11.3/§7/§27):
  D-F1-5B-1 destination = explicit caller-owned warehouse_id, VALIDATED (exists+active+same-company; no cross-company
    borrowing), NEVER inferred (auto-routing replenishment_route_rules = Phase 2; NO table created).
  D-F1-5B-2 Phase-1 demandDriver = FORECAST (frozen policy, not a fallback; no dynamic classifier; no demand_driver
    column; non-FORECAST explicit → UNSUPPORTED_PHASE1_DEMAND_DRIVER; sales run-rate stays diagnostic-only).
  D-F1-5B-3 forecast anchor = injected calc month M; window M+1..M+4; forecastShareQty = Σ Regular FC over M+1..M+4
    (Regular FC ONLY; Special Event NEVER double-counted in the weight basis; explicit 0 valid; missing month ≠ 0).
NEW pure module supply-planning-planning-context.js (KMPCX / window.KM.planningContext;
  resolveRecommendationPlanningContext(input, options)) produces destination-context / planningCycle / windowCode /
  windowStart-End / requiredByDate / demandDriver / forecastWeightAnchor / forecastWeightMonths / forecastShareQty +
  issues. Window = frozen 4-month window (start=first day M+1, end=last day M+4; NO invented 30/60/90 horizon); Regular
  required-by = window start; Special-Event required-by INVOKES frozen §10 KMCALC.eventPreparationDate (pull-forward,
  never duplicated). §7 SHARE normalization stays F1-5-A-owned; context supplies only the basis (narrow
  toAllocationFactReceiver bridge → KMAF FORECAST_DRIVEN receiver.forecastBasis.forecastShareQty). Injected calc month
  (no Date.now/browser); deterministic; permutation-invariant; input not mutated; MISSING never 0; JSON-safe.
Tokens: MISSING_DESTINATION_WAREHOUSE / DESTINATION_NOT_ELIGIBLE / DESTINATION_AUTHORITY_CONFLICT / MISSING_PLANNING_CYCLE
  / MISSING_WINDOW_CODE / MISSING_REQUIRED_BY_DATE / WINDOW_AUTHORITY_CONFLICT / UNSUPPORTED_PHASE1_DEMAND_DRIVER /
  MISSING_FORECAST_WEIGHT_SOURCE / INVALID_FORECAST_WEIGHT_VALUE / FORECAST_WEIGHT_SOURCE_CONFLICT /
  FORECAST_WEIGHT_ANCHOR_UNRESOLVED / PLANNING_CONTEXT_NOT_READY.
Reachability TEST VERIFIED end-to-end: context → KMAF.projectAllocationFacts (share once) → REAL projectAllocationInputs
  (real overseas allocator) → REAL resolveWeeklyRecommendationFacts → carton-FLOOR recommendedQty; calculatedGap ===
  calculateGap(...) unchanged.
Tests: NEW supply-planning-planning-context-f1-5bd.test.js (39). Bundle 26→27 modules (hash 7e766e35…, --check
  reproducible); parity updated 26→27. FULL SUITE 85 files / 0 failing; Golden 39/1/0; #34 Pending.
Files: NEW supply-planning-planning-context.js (bundled), build-apps-script-bundle.js (KMPCX registered),
  90_generated_supply_planning_bundle.gs (regenerated — APPS_SCRIPT_SYNC_REQUIRED = generated bundle only if/when user
  deploys), NEW test + bundle-parity test (GIT_ONLY), SUPPLY_PLANNING_DECISION_REGISTER.md (D-F1-5B-1..3),
  PHASE_F1_5B_…_HALT.md (marked RESOLVED FOR PHASE 1, evidence retained), PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md
  §I + this entry (DOCUMENTATION_ONLY). F1-5-A (83afd10) untouched. BUNDLE_REBUILD_REQUIRED=true (generated 90_*.gs
  only; NO handler/router sync). FRONTEND_GITHUB_PAGES_REQUIRED=false.
No new business formula/DB/schema/header/API/router/page/CSS/persistence change. No live DB. Not pushed, not deployed.
Next: F1-4B-PRE (wire context → producer → production-source with real canonical snapshots) then F1-4B (read-only API).
```

### Checkpoint — F1-4B-PRE Production Recommendation Fact Assembly = IMPLEMENTED (2026-08-06)
```
F1-4B-PRE — raw canonical snapshots now reach the REAL resolver without prebuilt planningFacts/receiverFacts.
NEW pure module supply-planning-production-assembly.js (KMPA / window.KM.productionAssembly;
  assembleProductionRecommendationFacts(rawSnapshots, request, options)) assembles production inputs:
  request validation → identity normalization (marketplace_skus/sku_details/warehouses/marketplaces/fc — canonical
  rows, never index/display-name) → KMPCX.resolveRecommendationPlanningContext → KMPCX.toAllocationFactReceiver +
  §2D forecast basis → KMAF.projectAllocationFacts → attach calculatedGap via the FROZEN KMCALC.calculateGap
  (source-projection routes only calculated_gap_qty) → productionRequest {…, receiverFacts, factoryDemandFacts,
  planningFacts} on source-projection's NATIVE seam. Authors NO formula.
Gap model (matches the existing production fixture; no formula change): per-receiver gap = Regular FC M+1
  (= demand-ledger forecastMonth); destinationCurrentStock/timelyQualifiedIncoming/committed = explicit 0
  (self-fulfilled has no exclusive destination stock; current stock + qualified incoming pass through the UNCHANGED
  F1-3 path into the supply ledger as the allocation source). forecastShareQty (M+1..M+4) = §7 weight basis (KMAF
  normalizes). Destination explicit caller-owned + validated (KMPCX; never inferred). demandDriver = FORECAST.
END-TO-END TEST VERIFIED: realistic canonical fixture (identity + 4-month FC + 3PL current stock + one qualified-
  incoming shipment; NO prebuilt planningFacts/receiverFacts/demandWeight/eligiblePoolTypes/calculatedGap/
  recommendedQty) → KMPA → KMPS.buildProductionRecommendationSource → existing demand/supply ledger + allocator +
  resolver → REAL recommendedQty = 96 (FLOOR(MIN(gap100, allocated)/12)×12); calculatedGap === calculateGap(...);
  carton-FLOOR owner unchanged. §12 preserved: current stock direct, QI canonical (F1-3), count-once, arrived →
  SHIPPED_IN_TRANSIT, late incoming visible-but-not-covering (ETA>required-by → recommendedQty unchanged), no
  cross-company borrowing, no missing→0, read-only (0 Sheet writes).
Tests: NEW supply-planning-production-assembly-f1-4b-pre.test.js (30). Bundle 27→28 modules (hash d40c3708…,
  --check reproducible); parity updated 27→28. FULL SUITE 86 files / 0 failing; Golden 39/1/0; #34 Pending.
Files: NEW supply-planning-production-assembly.js (bundled), build-apps-script-bundle.js (KMPA registered),
  90_generated_supply_planning_bundle.gs (regenerated — APPS_SCRIPT_SYNC_REQUIRED = generated bundle only if/when
  user deploys), NEW test + bundle-parity test (GIT_ONLY), PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md §J,
  PHASE_F1_4B_PRE_…_HALT.md (marked SUPERSEDED/RESOLVED, evidence retained), this entry (DOCUMENTATION_ONLY). KMPCX/
  KMAF/production-source UNTOUCHED (native seam; no KMAF calculatedGap change needed).
BUNDLE_REBUILD_REQUIRED=true (generated 90_*.gs only; NO handler/router sync). FRONTEND_GITHUB_PAGES_REQUIRED=false.
No new formula/DB/schema/header/API/router/page/persistence change. No live DB. Not pushed, not deployed.
Next: F1-4B — read-only recommendation.workspace.get API seam (separately authorized).
```

### Checkpoint — F1-4B-A Read-Only Recommendation Workspace API = IMPLEMENTED (2026-08-06)
```
F1-4B-A — the F1-4B-PRE assembly is exposed through ONE bounded read endpoint: recommendation.workspace.get.
NEW Apps Script handler 42_api_v1_recommendation_workspace.gs (routed from 01_router.gs doPost):
  validate (mandatory scope + destinationWarehouseId + calculationMonth + planningCycle; size≤100; FAILS before any
  read) → io.openTarget() exact-ID gate → KMPS.readCanonicalSnapshots (targeted 11 canonical tables ONCE; never
  getOperationDb) → per in-scope SKU: KMPA.assembleProductionRecommendationFacts → KMPS.buildProductionRecommendationSource
  (existing demand/supply ledger → allocator → resolver) → aggregate → map/filter/sort/paginate → canonical
  {success,data,meta,errors} envelope. Injectable io → testable with zero SpreadsheetApp. Pure READ boundary; authors
  NO formula; no write/persistence/draft/plan/order/reservation/inventory; no header/sheet creation/repair. Runtime is
  per-SKU (shipment lifecycle scope = one masterSku) → internal SKU loop = ONE HTTP request, no per-SKU HTTP.
Source-proven line outputs: currentStockQty (Σ CURRENT_STOCK supply source), qualifiedIncomingQty (Σ SHIPPED_IN_TRANSIT),
  calculatedGap (frozen calculateGap owner via planning fact), recommendedQty (existing resolver carton-FLOOR). NO
  Coverage/DOS/Projected/Reason/Status invented (omitted). Missing source → structured failure (never fake zero);
  legitimate runtime zero → successful zero; filter miss → successful empty page; scope with no marketplace_skus →
  MISSING_SKU_MAPPING. Tokens: VALIDATION_FAILED / MISSING_DESTINATION_WAREHOUSE / MISSING_CALCULATION_MONTH /
  MISSING_PLANNING_CYCLE / UNSUPPORTED_PHASE1_DEMAND_DRIVER / MISSING_SKU_MAPPING / MISSING_FORECAST_WEIGHT_SOURCE /
  WRONG_SPREADSHEET_TARGET / RECOMMENDATION_RUNTIME_BLOCKED / PRODUCTION_RECOMMENDATION_SOURCE_INCOMPLETE.
Additive core change (to surface source-proven currentStock/QI): supply-planning-production-source.js
  buildProductionRecommendationSource now also returns supplySourceEntries/demandSourceEntries (the projection's
  lifecycle-bucketed rows; NOT a formula/recommendation change). Bundle regenerated (28 modules, hash a002c6a3…,
  --check reproducible; parity 56).
API Foundation: km-api-foundation.js registers recommendation (IMPLEMENTED + resolver + bounded DTO builder); master
  USE_WORKSPACE_API=false + per-workspace recommendation=false remain DEFAULT FALSE (infrastructure-only; NO page
  cutover; no dual execution; no silent legacy fallback).
Tests: NEW supply-planning-recommendation-workspace-f1-4b-a.test.js (35 — end-to-end real recommendedQty 96 from raw
  snapshots; source-proven currentStock 100 / QI 24 / gap 100; validation-before-read; wrong-ID fail-closed; zero
  writes; pagination/filter; registration + default-false flags + no-fallback). km-api-foundation + -compat updated
  7→8 workspaces. FULL SUITE 87 files / 0 failing; Golden 39/1/0; #34 Pending.
Files: NEW 42_api_v1_recommendation_workspace.gs (APPS_SCRIPT_SYNC_REQUIRED — copy 42_ + 01_router.gs), 01_router.gs
  (route), supply-planning-production-source.js (additive supplySourceEntries — bundled), 90_generated_supply_planning_bundle.gs
  (regenerated — APPS_SCRIPT_SYNC_REQUIRED bundle), km-api-foundation.js (recommendation workspace — FRONTEND_GITHUB_PAGES_REQUIRED=true),
  km-api-foundation.test.js + km-api-foundation-compat.test.js (7→8), NEW test (GIT_ONLY),
  API_RECOMMENDATION_WORKSPACE_SPEC.md (NEW), PHASE_F1_FORMULA_RUNTIME_IMPLEMENTATION_PLAN.md §K + this entry (DOCUMENTATION_ONLY).
BUNDLE_REBUILD_REQUIRED=true. No new formula/DB/schema/header change, no page connection, no persistence, no live DB.
Not pushed, not deployed. Next: F1-4B-B — Inventory Replenishment page cutover behind the disabled-by-default flag.
```

### Checkpoint — F1-4B-B Inventory Replenishment Recommendation Runtime Cutover = READINESS AUDIT / HALTED (2026-08-06)
```
F1-4B-B — replace the Recommendation Summary placeholders (AI Pending / No recommendation generated / Suggested Qty 0)
  with the real recommendation.workspace.get API, behind the default-false recommendation flag. Readiness/authority
  gate → HALTED. NO runtime/API/router/Foundation/page/HTML/CSS/DB/schema/Apps-Script/bundle change.
The F1-4B RUNTIME blocker is RESOLVED: F1-4B-A endpoint returns a REAL recommendedQty (96 end-to-end from raw snapshots)
  with source-proven currentStock/QI/gap. So the seam is meaningful — GIVEN its three mandatory caller-owned inputs.
Distinct, still-open PAGE blocker: the read API validates (before any read) three CALLER-OWNED inputs the Inventory
  Replenishment page does not own, and the frozen registry forbids synthesizing two of them:
  • destinationWarehouseId — explicit canonical warehouse_id, NEVER auto-selected/inferred (D-F1-5B-1;
    planning-context.js:54-76). Page has NO destination selector; auto-picking "the one 3PL" is the banned inference.
  • calculationMonth (YYYY-MM) — injected anchor; NO browser-current-date (D-F1-5B-3; planning-context.js:118-119).
    Page only has new Date().getMonth() (inventory-replenishment.js:3433 — the banned source).
  • planningCycle — required caller/scheduler run parameter (planning-context.js:116-117). No page representation.
Page controls (source-proven): only Country + Marketplace + LTS + Target Days (inventory-replenishment.html:16,32,44,52);
  page scope = {company,country,marketplace,sku,marketplaceId,series,category} (inventory-replenishment.js:3450-3454).
  Frontend DTO defaults each missing input to null (km-api-foundation.js:350-366) → server MISSING_* (never a value).
Net: wiring the seam now → every row renders MISSING_DESTINATION_WAREHOUSE / MISSING_CALCULATION_MONTH /
  MISSING_PLANNING_CYCLE — never a populated recommendation — failing the round GOAL + "Recommendation Summary
  populated" acceptance test, while the honest legacy stubs already convey "not generated". Manufacturing the inputs
  breaches the frozen registry AND the round's own "No fake zero / No placeholder values / No page calculation / pure
  presentation layer"; building a destination/month/cycle input authority is new caller-context (decision-input)
  semantics outside a pure-presentation cutover and adjacent to the DO-NOT list (Decision Engine / Allocation Runtime).
  Either path breaks a hard constraint → HALT.
Smallest next slice (separately authorized): F1-4B-B-PRE — Inventory Replenishment Planning-Context Input Authority
  (page/UX only, NO formula/runtime/inference): (1) explicit destination-warehouse_id selection from canonical eligible
  warehouses (validated, never auto-picked; incl. how platform-fulfilled/FBA destinations are represented as a
  warehouse_id); (2) explicit injected calculationMonth (YYYY-MM) anchor — value sent to the API must be caller-explicit,
  never the browser clock; (3) explicit planningCycle run-parameter. THEN F1-4B-B (this cutover) becomes meaningful:
  Recommendation Summary calls recommendation.workspace.get behind the default-false flag and presents real
  currentStockQty/qualifiedIncomingQty/calculatedGap/recommendedQty (+ blocked/blockedReason/formulaVersion/
  sourceDataAsOf/diagnostics) with differentiated states (NO_DATA/BLOCKED/MISSING_FORECAST/MISSING_DESTINATION/
  API_FAILURE/VALID_ZERO) replacing the AI-Pending / No-recommendation-generated placeholders.
Doc: docs/planning/PHASE_F1_4B_RECOMMENDATION_WORKSPACE_BLOCKER.md §G (runtime-READY / page-inputs-ABSENT + next slice).
No new formula/runtime/inference/fake value; docs-only checkpoint. No live DB. Full suite unchanged (87 files / 0
  failing); Golden Matrix 39/1/0; Scenario #34 Pending. Not pushed, not deployed.
```

### Checkpoint — F1-4B-B-PRE Inventory Replenishment Planning-Context Input Authority = IMPLEMENTED (2026-08-06)
```
F1-4B-B-PRE — page-side input authority so Inventory Replenishment can OWN the three caller-owned inputs the read
  endpoint recommendation.workspace.get (F1-4B-A) requires and the frozen registry forbids inferring. Page/UX only:
  NO API call, NO Recommendation Summary placeholder replacement, NO formula/runtime change, NO write.
NEW page-local pure module window.IRContext (inventory-replenishment.js, between __IRCTX_START__/__IRCTX_END__):
  eligibleDestinationWarehouses (active + same company + compatible country via IRCountry UK≡GB; identity = warehouse_id,
  never display name), validateCalculationMonth (explicit YYYY-MM; blank=UNSELECTED; no new Date()), validatePlanningCycle
  (explicit non-empty run identifier; no invented format), destinationState (UNSELECTED/SELECTED_VALID/SELECTED_INVALID/
  NO_ELIGIBLE_DESTINATION/PLATFORM_DESTINATION_IDENTITY_UNRESOLVED/DESTINATION_AUTHORITY_CONFLICT — NEVER auto-selects
  first/only), normalizeRecommendationContext (one model: NOT_READY/READY/INVALID/DESTINATION_BLOCKED),
  validateRecommendationContext, toRequestContext (returns {company,country,marketplace,destinationWarehouseId,
  calculationMonth,planningCycle} ONLY when READY, else null — matches the F1-4B-A request contract),
  restoreContextSelection (session restore validated + scope-guarded).
NEW controls (HTML partial, inside the sticky control panel — page-local, not body children; separate from Execution
  Plan From/To/Method): Destination Warehouse <select> (blank default, not auto-selected), Calculation Month
  <input type=month> (blank), Planning Cycle <input type=text> (blank) + a role=status/aria-live=polite readiness
  indicator (Not Ready/Ready/Invalid/Destination blocked). CSS: .replen-reco-context + data-status states.
Wiring: mount → initReplenRecoContext (populate options + restore explicit session selections + bind + refresh);
  Country/Marketplace onchange → onReplenRecoScopeChanged (recompute eligible options, drop a now-invalid destination,
  preserve valid month/cycle). Reads the already-loaded getWarehouses/getMarketplaces cache (no new fetch, no
  getOperationDb, no whole-DB reload). sessionStorage key 'replenRecoContext' persists explicit selections only.
FBA/platform: destination appears only if a canonical warehouse_id exists; else PLATFORM_DESTINATION_IDENTITY_UNRESOLVED
  (no fabricated id, marketplace never used as warehouse id). No canonical FBA-warehouse DB change made this round.
Tests: NEW replen-recommendation-context-f1-4b-b-pre.test.js (67 — extract+eval IRContext + source-scan of DOM/HTML/CSS:
  identity=warehouse_id, no auto-select, inactive/wrong-company/wrong-country excluded, platform-unresolved blocks with no
  fake id, explicit YYYY-MM only + no new Date(), planning cycle explicit + not auto-copied, READY/NOT_READY/INVALID/
  DESTINATION_BLOCKED truth, DTO matches F1-4B-A + fully-populates the Foundation DTO, session restore validated, no API
  call/no Foundation workspace call/no whole-DB reload/no write, existing filters + Recommendation placeholders unchanged,
  accessibility labels/role=status). FULL SUITE 88 files / 0 failing; Golden 39/1/0; #34 Pending.
Files: inventory-replenishment.js (IRContext + wiring + mount/scope hooks), inventory-replenishment.html (context
  controls), inventory-replenishment.css (context styles) — all FRONTEND_GITHUB_PAGES_REQUIRED=true; NEW test (GIT_ONLY);
  PHASE_F1_4B_RECOMMENDATION_WORKSPACE_BLOCKER.md §H + this entry (DOCUMENTATION_ONLY).
No API/Apps Script/router/Foundation/runtime/formula/bundle/DB/schema change. APPS_SCRIPT_SYNC_REQUIRED=false;
  BUNDLE_REBUILD_REQUIRED=false. No live DB. Not pushed, not deployed.
Exact F1-4B-B readiness: the page now produces a validated READY context + toRequestContext DTO; F1-4B-B may call
  recommendation.workspace.get behind the default-false recommendation flag and present the real outputs + differentiated
  structured states, replacing the AI-Pending / No-recommendation-generated placeholders.
```

### Checkpoint — F1-4B-B Inventory Replenishment Recommendation READ Cutover = IMPLEMENTED (2026-08-06)
```
F1-4B-B — the Recommendation Summary is connected to recommendation.workspace.get behind the default-false
  recommendation flag. Read cutover + presentation mapping ONLY: NO formula/runtime/API/Apps-Script/router/Foundation/
  DB/schema/bundle change, NO write, NO persistence, NO Submit, NO Execution Plan / Allocation Draft mutation.
Effective rule (single predicate _irRecommendationWorkspaceEnabled = Foundation workspaceApiActive('recommendation')):
  master USE_WORKSPACE_API + per-workspace recommendation BOTH ON → workspace; else legacy placeholder preserved.
One request per READY scope (loadRecommendationWorkspace_): IRContext.toRequestContext → getWorkspace('recommendation',
  {scope, destinationWarehouseId, calculationMonth, planningCycle, filters:null, pagination:{1,100}, include:{diagnostics:true}}).
  Server loops SKUs internally → NO per-SKU HTTP. Deduped by context key; monotonic-seq stale guard; AbortController
  invalidation on scope/destination/month/cycle change + unmount. Context NOT READY or flags OFF → no request.
Page-local read state _irRecoState (separate from Allocation Draft): DISABLED / CONTEXT_NOT_READY / LOADING / READY /
  EMPTY / API_ERROR + per-line VALID_ZERO / BLOCKED / RECOMMENDATION_LINE_NOT_FOUND / RECOMMENDATION_LINE_CONFLICT.
  Row identity = canonical composite key company|country|marketplace|sku|siteSku|destinationWarehouseId (never index/
  order/label; duplicate key → CONFLICT, never latest-win). Added siteSku to the page row for identity.
Mapping (_irRecoMapLine via _irNumOrNull — direct passthrough, NO recompute): currentStockQty / qualifiedIncomingQty /
  calculatedGap / recommendedQty; legitimate 0 preserved, missing → null (never || 0). Blocked line shows reason +
  source-proven stock/QI but NOT recommendedQty. Diagnostics (issues + formulaVersion + sourceDataAsOf + requestId)
  in a collapsible <details>; role=status/aria-live=polite on the state body; states distinguished by text + border
  (not color-only). Structured API failure → visible API_ERROR (code + message + requestId); no silent legacy fallback.
Presentation scope: the Recommendation Summary card is the API-value surface (all four fields co-labeled). The main
  results-table columns KEEP their existing FBA/legacy meaning — the API destination-scoped currentStockQty ≠ the
  table's FBA 'Current Inventory', so they are deliberately not overwritten (honest bounded disposition, documented).
  Legacy windowed placeholder (_recSummaryRows / AI-Pending / No-recommendation-generated) preserved for flags-off.
Tests: NEW replen-recommendation-cutover-f1-4b-b.test.js (54 — predicate; request gating flags/context; one request per
  scope + DTO from IRContext + no per-SKU loop; direct field mapping + legitimate-zero + missing→null; EMPTY / BLOCKED /
  API_ERROR + missing-forecast vs missing-destination differentiation; composite row identity + not-found + conflict;
  stale guard + invalidation; ON→OFF clears API values; enabled-but-unavailable → visible error; no formula/runtime
  import; no whole-DB reload; no write/Submit/Execution-Plan mutation; legacy preserved). km-api-foundation-compat.test.js
  PG1 updated + PG1c added (weekly + recommendation are the two READ cutover pages; each READ-only, no executeCommand).
  FULL SUITE 89 files / 0 failing; Golden 39/1/0; #34 Pending.
Files: inventory-replenishment.js (read state + fetch lifecycle + summary presentation + card switch + siteSku +
  triggers/unmount), inventory-replenishment.css (workspace state styles) — FRONTEND_GITHUB_PAGES_REQUIRED=true;
  NEW test + km-api-foundation-compat.test.js (GIT_ONLY); PHASE_F1_4B_RECOMMENDATION_WORKSPACE_BLOCKER.md §I + this
  entry (DOCUMENTATION_ONLY). No HTML change this round.
APPS_SCRIPT_SYNC_REQUIRED=false; BUNDLE_REBUILD_REQUIRED=false. Flags remain default-false (endpoint dormant until
  enabled). No live DB. Not pushed, not deployed.
Exact next slice: enabling the recommendation flag in a controlled environment for live browser verification, then
  (separately authorized) Coverage/DOS/Projected Inventory, recommendation persistence, and Submit — all out of scope here.
```

### Checkpoint — F1-4B-C Inventory Replenishment Recommendation Context UI Refactor (leak removal) = IMPLEMENTED (2026-08-06)
```
F1-4B-C — UI-only refactor. The "Recommendation Context" panel (Destination Warehouse / Calculation Month /
  Planning Cycle + readiness indicator) surfaced in F1-4B-B-PRE was an implementation leak — users must not be
  asked for Recommendation-Runtime internals. This round REMOVES that panel and makes the context INTERNAL/HIDDEN.
  NO Runtime/API/Formula/Planning-Context/Recommendation-Engine/Apps-Script/Bundle/DB/Schema/Mapping change.
HTML: removed the entire .replen-reco-context block (3 controls + status). The page's ONLY scope controls are again
  Country / Marketplace / LTS Filter / Target Days / Search (original UX restored). No new popup/dialog/drawer/panel.
CSS: deleted the dead .replen-reco-context* panel styles. Kept .replen-recsum-ws* (Recommendation Summary OUTPUT
  state styles — not inputs).
JS: the pure window.IRContext MODEL is RETAINED (frozen decisions unchanged). Replaced the DOM-bound panel wiring with
  an INTERNAL hidden context: _irInternalContext {destinationWarehouseId, calculationMonth, planningCycle} defaults
  null; updateReplenRecoContext() now builds the normalized model from scope + the internal inputs (no control read,
  no status render); _irSetInternalRecommendationContext(ctx) is a NON-UI seam a future scheduler/config uses to supply
  the runtime context (never the user). Removed panel-only helpers: refreshReplenRecoDestinationOptions,
  bindReplenRecoContextControls, _irctxRenderStatus, _irctxRestoreFromSession, _irctxPersist, REPLEN_RECO_CONTEXT_KEY.
  Kept _irctxScope/_irctxEligible/_irctxWarehouses (internal), _irRecoTrigger, and the entire F1-4B-B read cutover
  (loadRecommendationWorkspace_ / read state / mapping / summary presentation) unchanged — the Runtime still receives
  destinationWarehouseId/calculationMonth/planningCycle, now ONLY from the internal context via IRContext.toRequestContext.
Behavior: with no internal populator + flags default-false, the context stays NOT_READY and the workspace is DISABLED,
  so the Recommendation Summary keeps its honest legacy placeholder (No recommendation generated / AI Pending) until the
  runtime is truly Ready — exactly as required. No user-facing recommendation-context state is shown.
Tests: replen-recommendation-context-f1-4b-b-pre.test.js REWRITTEN to F1-4B-C (64 — retained pure-model sections A–H;
  I internal-context wiring + removed-panel-function deletion + no control refs + no clock/API/whole-DB; J UI removal +
  original filters restored + Summary intact; K dead panel CSS removed + summary-state CSS retained).
  replen-recommendation-cutover-f1-4b-b.test.js (54) unchanged + green (read block untouched). FULL SUITE 89 files /
  0 failing; Golden 39/1/0; #34 Pending.
Files: inventory-replenishment.html (panel removed), inventory-replenishment.js (internal context refactor),
  inventory-replenishment.css (dead panel CSS removed) — FRONTEND_GITHUB_PAGES_REQUIRED=true; PRE test rewritten
  (GIT_ONLY); PHASE_F1_4B_RECOMMENDATION_WORKSPACE_BLOCKER.md §J + this entry (DOCUMENTATION_ONLY).
No API/Apps-Script/router/Foundation/runtime/formula/bundle/DB/schema change. APPS_SCRIPT_SYNC_REQUIRED=false;
  BUNDLE_REBUILD_REQUIRED=false. No live DB. Not pushed, not deployed.
```

### Checkpoint — F1-4B-D Internal Recommendation Context Authority = AUTHORITY AUDIT / HALTED (2026-08-06)
```
F1-4B-D — establish a background, auditable, non-UI, non-guessed Internal Recommendation Context Authority to populate
  the hidden _irInternalContext (destinationWarehouseId / calculationMonth / planningCycle) so recommendation.workspace.get
  can be reached on the real page. Phase-1 authority audit (mandated FIRST) → HALTED. NO page-runtime/API/schema change.
Authority matrix (live-repo + active-spec verified):
  • destinationWarehouseId → SOURCE_NOT_IMPLEMENTED. The automated source replenishment_route_rules is "Spec only — no
    runtime engine exists" (CARRIER_AND_ROUTE_SPEC §5A.4:555); no getReplenishmentRouteRules/route loader in
    operation-system-db-api.js; ship_from/destination on shipments are human-readable snapshots, never identity
    (DATABASE_RELATIONSHIP_MAP §599); warehouses.marketplace is an optional Movement-Log filter, not a unique mapping.
    FBA/platform → PLATFORM_DESTINATION_UNRESOLVED (no warehouse row models a platform FC identity).
  • calculationMonth → SOURCE_MISSING. No active_planning_context / planning-month config loader (grep: none); only
    new Date() browser clock (forbidden as the anchor, D-F1-5B-3).
  • planningCycle → SOURCE_MISSING (page). planning_cycle exists only as a caller/scheduler-supplied upsert key on
    request_allocation_draft / site-confirmation headers; nothing derives it, and no scheduler injects it interactively.
HALT conditions tripped: no unique canonical destination; destination only guessable from a candidate list; platform/FBA
  identity unresolved; calc month only from browser clock; planning cycle no source/frozen derivation; a real authority
  needs new table/column/config (schema forbidden this round). Any one suffices; all hold.
Precise decision escalated (not a docs-only loop): "Where does the authoritative non-UI (destination, calcMonth,
  planningCycle) for an interactive scope come from?" Recommended = ONE bounded active_recommendation_context config
  (company+country+marketplace → {destination_warehouse_id, calculation_month, planning_cycle}), admin/scheduler-owned,
  read by a pure injectable resolver — which requires a minimal config store (a schema/config round F1-4B-D forbids).
  Until adjudicated: page stays dormant behind default-false flags; Recommendation Summary keeps its honest legacy
  placeholder (no guess, no clock, no fake). A/B/C per authority in the audit doc.
Exact next slice: F1-4B-E — provision active_recommendation_context (after the user picks the store) + a pure injectable
  resolveInventoryRecommendationContext feeding _irSetInternalRecommendationContext; then the page can reach READY and
  issue the one flag-gated recommendation.workspace.get per scope. No formula/runtime/API-contract change needed there.
Doc: docs/planning/PHASE_F1_4B_D_INTERNAL_RECOMMENDATION_CONTEXT_AUTHORITY_AUDIT.md (matrix + HALT + A/B/C + decision);
  PHASE_F1_4B_RECOMMENDATION_WORKSPACE_BLOCKER.md §K pointer. Corroborates PHASE_F1_5B_PLANNING_CONTEXT_AUTHORITY_HALT.md.
No page/API/router/Apps-Script/bundle/DB/schema/formula change; no inventory-compat change; no write; no live DB. Full
  suite unchanged (89 files / 0 failing — no code touched); Golden 39/1/0; #34 Pending. Not pushed, not deployed.
```

### Checkpoint — F1-4B-E0R Recommendation Destination Node + Phase-1 Fixed Multi-Warehouse Demand Allocation = IMPLEMENTED (pure building blocks) (2026-08-06)
```
F1-4B-E0R — a NEW authorized Phase-1 business decision (D-F1-4B-E0R-1..4): marketplace-level demand may be split to
  multiple overseas warehouses by an EXPLICIT configured fixed ratio (KM/US/Amazon 30/70 example). Supersedes the prior
  blanket prohibition on proportional warehouse demand allocation. This round = authority/grain AUDIT + pure building
  blocks + config provisioning spec + tests. NO wiring into KMPCX/KMAF/KMPA/KMPS; NO UI/Submit/Shipment/persistence;
  NO formula/API-contract/DB-schema/bundle/Apps-Script change; NO runtime DB mutation; NO live DB.
Authority + grain audit (live-repo verified):
  • 30/70 ratio → SOURCE_MISSING in repo (no allocation_ratio/demand_allocation field anywhere); business origin is
    manual Google-Sheet formulas (SOURCE_PROVEN_MANUAL_SHEET_ONLY) — NOT runtime-authoritative.
  • Marketplace identity = marketplaces.marketplace_id (canonical); Warehouse identity = warehouses.warehouse_id.
  • Forecast (fc_regular_forecast), Sales (amazon_weekly/daily_sales_snapshot), Special Event (fc_special_events) =
    MARKETPLACE-level (no warehouse_id). Current Stock (overseas_inventory_snapshot.warehouse_id) + Qualified Incoming
    (shipments.destination_warehouse_id) = WAREHOUSE-level (separable — no pooling needed).
  • Remainder owner = FROZEN deterministic largest-remainder (§24.7 supply-planning-allocations.js distributeByWeightCapped;
    IRMap._allocateShared fractional-remainder + stable key). §5 gate satisfied by REUSING it — not inventing a policy.
No HALT condition tripped (deterministic remainder frozen; marketplace scope identifiable; new decision authorizes
  ratio allocation; stock/incoming separable by warehouse_id; marketplace identity present; allocator splits — never
  invents sales; Special-Event handled by split-once, not duplication).
NEW pure module assets/js/core/supply-planning-demand-allocation.js (window.KM.demandAllocation): buildDestinationDTO +
  destinationKey (MARKETPLACE vs WAREHOUSE; Amazon→MARKETPLACE no fake warehouse; legacy destinationWarehouseId→WAREHOUSE),
  readActiveAllocationRules (pure; rows injected; active + effective-period; no live DB), validateAllocationRules
  (canonical active same-company warehouse_id; ratios∈[0,1]; integer basis points sum EXACTLY 10000; dup/period/total
  errors), allocateByBasisPoints (largest-remainder, conserves exact total; leftover→largest fractional remainder,
  tie-break warehouse_id asc), allocateMarketplaceDemand (split once; MISSING→null not 0; explicit 0→0),
  passthroughWarehouseDemand (warehouse-level source NEVER re-split), buildWarehouseDemandFacts (per-warehouse
  allocatedForecastQty/allocatedSalesQty — no pooled stock/incoming), allocationRuleId (RDAR-{CO}-{CY}-{MP}-{WH}).
  Error tokens: DEMAND_ALLOCATION_RULE_NOT_CONFIGURED / _RATIO_INVALID / _RATIO_TOTAL_INVALID / _DESTINATION_CONFLICT /
  _PERIOD_CONFLICT / DESTINATION_WAREHOUSE_INVALID. 30/70 of 1000 → 300/700; of 1001 → 300/701 (exact); permutation-invariant.
Config authority: NEW docs/planning/REPLENISHMENT_DEMAND_ALLOCATION_RULES_SPEC.md — exact header + grain + stable id +
  validation + USER-OWNED provisioning (runtime never creates/repairs; manual sheet setup; exact Spreadsheet-ID gate).
  No live table created this round; getReplenishmentDemandAllocationRules loader deferred to the wiring slice.
Tests: NEW supply-planning-demand-allocation-f1-4b-e0r.test.js (37 — DTO/key + Amazon-no-warehouse + legacy normalize;
  30/70 validate + sum-100 + under/over/dup/inactive/cross-company/period/ratio-range blocks; 1000→300/700, 1001 exact,
  permutation-invariant, no-first-row-remainder, zero vs missing; warehouse isolation + passthrough-not-resplit + no
  double-allocation; event split-once; multi-line; no hard-coded 0.3/0.7; no clock/RNG/row-index; no DB mutation).
  FULL SUITE 90 files / 0 failing; Golden 39/1/0; #34 Pending.
Decision register: SUPPLY_PLANNING_DECISION_REGISTER.md D-F1-4B-E0R-1..4 recorded (authorized).
Files: NEW supply-planning-demand-allocation.js (browser+node core module; NOT bundled — not in MODULE_ORDER; NOT loaded
  by index.html this round — no page wiring; effectively GIT_ONLY / no deploy effect until the wiring slice),
  NEW test (GIT_ONLY), NEW REPLENISHMENT_DEMAND_ALLOCATION_RULES_SPEC.md + decision-register + this entry (DOCUMENTATION_ONLY).
  No change to any existing runtime/formula/API/router/bundle/DB-api/page. APPS_SCRIPT_SYNC_REQUIRED=false; BUNDLE_REBUILD_REQUIRED=false.
Exact next slice: F1-4B-E — provision replenishment_demand_allocation_rules (user-owned) + a targeted read adapter +
  wire buildWarehouseDemandFacts into the (unchanged) recommendation runtime per warehouse; then destination READY per
  warehouse. Not pushed, not deployed.
```

- **Files (F1-4A):** `docs/planning/PHASE_F1_4A_RUNTIME_CONNECTION_AUDIT.md` (NEW — dependency graph + blockers + options + recommendation — DOCUMENTATION_ONLY), this entry (DOCUMENTATION_ONLY). **No code/test/bundle change; `APPS_SCRIPT_SYNC_REQUIRED=false`; `FRONTEND_GITHUB_PAGES_REQUIRED=false`.** Not pushed, not deployed, no live DB accessed.
