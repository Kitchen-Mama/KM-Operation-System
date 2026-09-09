# Product Strategy Board — Design Freeze (P0)

**Round:** PRODUCT-STRATEGY-BOARD-P0 — Discovery, Data Mapping and Design Freeze
**Status:** DESIGN FREEZE — investigation complete, nothing implemented
**Base commit:** `e9fcd27` (`origin/main` at the time this branch was cut)
**Branch:** `feature/product-strategy-board-p0` (isolated git worktree)
**Scope of this round:** this document only. No page, no table, no API, no deployment.

> **What "design freeze" means here.** Every table, column, action name and component named below was
> read out of shipped source in this repository, and the file and line it came from is cited. Where a
> field the product needs does **not** exist, it is recorded as a **GAP** with no invented mapping.
> Where two authorities in the repo disagree, both are quoted and the divergence is named rather than
> reconciled by preference.

---

## §0 — Evidence rules used throughout

Three rules, because this repository has been bitten by all three:

1. **A column that exists and a column that is populated are two different claims.** Column lists
   below come from the *writer* or the *header gate* that production actually runs, never from a
   planning document alone. Where a list is document-sourced only, it is labelled
   `DOC-ONLY (NOT CODE-VERIFIED)`.
2. **A planning document is not an implementation.**
   `assets/specs/active/PRICING_DATABASE_MAPPING.md` is stamped
   *"Status: Specification / Planning (not yet implemented)"* — yet `pricing_list` **is** written by
   shipped code. The doc is behind the code in one place and ahead of it in another; both are stated.
3. **An absent field is a GAP, not a zero and not a rename.** `margin`, `captured_at` and any
   price effective-date do not exist. They are listed as gaps, and one of them turns out to be a
   deliberate architectural decision rather than an oversight (§9).

---

## §1 — Product vision

**Product Strategy Board / 產品策略白板** — an independent, durably-persisted strategy whiteboard
inside the Kitchen Mama Operation System.

**Short term (pre-AI).** A place where price-architecture and Deal-layout thinking is *recorded* rather
than lost: free text notes, official SKU data pulled in as modules, a per-Series price-band overview,
and simple product matrices / charts / Deal layouts.

**Long term (post-AI).** The same board becomes the substrate an AI reads: it can cite the board's SKU,
Regional, Pricing, Deal and human-written notes. **This round builds the seam only** (§14) — no AI
runtime, no AI table, no prompt, no model call.

**The first-priority use case**, which the MVP is designed backwards from: plan a complete price band
and Deal layout across all product lines, by Series, sorted by price, showing entry / core / premium
positions, gaps, overlaps, and where a Deal price would cannibalise a neighbouring SKU.

---

## §2 — MVP / deferred scope

### In the MVP (P1)

| # | Capability | Why it is first |
|---|---|---|
| 1 | Board CRUD + durable server persistence | Without this it is not a record, it is a browser cache (§3.7) |
| 2 | `TEXT_NOTE` element | The whole short-term purpose: positioning, target price, Deal price, reasoning, risk, to-do |
| 3 | `SKU_CARD` element (master-SKU grain) | Series, product name, price fields all live at this grain |
| 4 | `REGIONAL_SKU_CARD` element (company/country/marketplace/sku grain) | Site SKU / ASIN / Regional status / site currency price |
| 5 | `SERIES_PRICE_BAND` element | The price-band overview — the first-priority screen |
| 6 | `MATRIX` element (2-D, fixed grid) | Price × Tier, Price × Feature, Series × Band |
| 7 | LIVE_REFERENCE / FROZEN_SNAPSHOT modes | §5 — decision evidence must not be rewritten by later master-data edits |
| 8 | Initial template: **SKU Series Price Architecture Board** | Gives the board a reason to exist on first open |

### Deferred (P2+), and the reason

| Element / feature | Deferred because |
|---|---|
| `CHART` | Chart.js is already available (§6.4) but every chart needs an agreed metric; §7 shows the price series is incomplete (no margin, no effective date). A chart over a GAP is a confident wrong picture. |
| `DEAL_PLAN` | Deal price exists only inside a **campaign** (`campaign_sku_lines.promo_price`, §4.6). A Deal plan element that is not bound to a campaign would become a second, unauthoritative promo-price store. Needs the §10 boundary decision first. |
| `GROUP` | Pure UI convenience; the matrix covers the grouping need in P1. |
| `CONNECTOR` | The existing canvas already has arrow anchors (§6.3) so this is cheap, but connectors have no analytical meaning for a price band. |
| Infinite canvas, multi-user live cursors | Explicitly out of scope per the round brief. Fixed grid + module cards in v1. |
| Board sharing / per-user ownership | There is **no user identity and no RBAC** in this system (§13). Ownership would be a string nobody verifies. |

---

## §3 — Existing source inventory (what the repo already has)

### 3.1 Master SKU — `sku_details`

- **Read owner (scoped):** `skuDetails.workspace.get`
  — `assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs:46`
  (`SKD_WORKSPACE_TABLES_`, `sku_details` is `[BASE]`, `requiredCols: ['sku']`)
- **Read owner (legacy, full DB):** `getOperationDb`
  — `assets/specs/active/apps-script/03_master_data_handlers.gs:35` (44 tabs)
- **Write owner:** `upsertSkuDetail` → `handleUpsertSkuDetail_`
  — `assets/specs/active/apps-script/01_router.gs:463`.
  Explicit note at `03_master_data_handlers.gs:124`: *"this endpoint edits ONLY sku_details — it does
  NOT create marketplace_skus / pricing_list"*.
- **Lifecycle writer:** `updateSkuLifecycle` — `01_router.gs:459`
- **Frontend model:** `assets/js/pages/sku-details.js`
  (`SKU_FORM_FIELDS_` at `:621`, `SKU_RESIZE_COLUMNS` at `:2273`)
- **Frontend accessor:** `KM.DB.getSkuDetails()` — `assets/js/api/operation-system-db-api.js:2426`

### 3.2 Operational site SKU — `marketplace_skus`

- **Read:** include-gated in the SKU workspace (`include.regional`) — `59_…:50`
- **Writers:** `upsertMarketplaceSku` (`01_router.gs:467`),
  `updateMarketplaceSkuModel` (`:471`), `importMarketplaceSkusBatch` (`:475`)
- **This is where `company` lives.** `PRICING_DATABASE_MAPPING.md` §3:
  *"`company` belongs in `marketplace_skus` because operational ownership may vary by country /
  marketplace (the same master SKU can be operated by different companies across sites)."*
- **This is also where site status lives** (`marketplace_sku_status`) — see §4.5 for why that matters.

### 3.3 Layer-2 regional — `sku_regional_details`

- **Header authority:** `SKU_REGIONAL_DETAILS_HEADERS_`
  — `assets/specs/active/apps-script/18_sku_regional_handlers.gs:17`
- **Identity grain:** `sku + company + country + marketplace` (`18_…:13`, stated as "Match grain")
- **Writer:** `handleUpsertSkuRegionalDetail_` (`18_…:105`), id minted `SRD-` + uuid10 (`18_…:70`)
- **Read owner:** include-gated in `skuDetails.workspace.get` (`59_…:51`)
- **Frontend:** `assets/js/pages/sku-regional-details.js`

### 3.4 Pricing — `pricing_list`, `pricing_change_log`

- **Header gate (authoritative, code-verified):**
  `assets/specs/active/apps-script/04_marketplace_forecast_import.gs:152`
  — a 27-column `requiredHeaders.pricing_list` list validated *before any write*.
- **Auto-creation:** for each NEW `marketplace_skus` row, `handleImportMarketplaceSkusBatch_`
  creates one `pricing_list` row, id `PRC-` + uuid8 (`04_…:342`).
  *"Does NOT overwrite existing `pricing_list` prices"* (`04_…:20`).
- **Base price inputs come from `sku_details`:** `selling_price`, `minimum_price`, `msrp`
  (`04_…:54-56`), with `fx_rate = 1` for MVP (`04_…:344`).
- **Read owner: NONE that is scoped.** `pricing_list` appears in **no** workspace/raw read owner
  (`4x`–`9x` files). The only read path is the legacy full-DB read via
  `KM.DB.getPricingList()` — `assets/js/api/operation-system-db-api.js:2470`,
  normalised at `:1559`, tab-mapped at `:3065`. **This is a real architectural gap** (§12.3).
- **`pricing_change_log` columns are `DOC-ONLY (NOT CODE-VERIFIED)`** — the table is registered in
  `validTabs` (`03_…:35`) and in `filterRows_` (`02_core_sheet_db.gs:120`), but no shipped writer
  defines its columns. The 8-column list in `PRICING_DATABASE_MAPPING.md` §5 is a specification.

### 3.5 Series

- **`series` is a column of `sku_details`** — not a table, and there is no `series` master.
- **It is a REQUIRED import field:** `sku-details.js:2371` states
  *"Import required fields: ['sku','product_name','category','series','lifecycle']"*, and the
  pre-write header gate requires `sku_details.series` (`04_…:150`).
- It is propagated into `fc_regular_forecast.series` from `sku_details.series`
  (`04_…:53`, `PRICING_DATABASE_MAPPING.md` §6).
- **Consequence for the board:** a "Series" is a **distinct-value set derived from `sku_details.series`**.
  There is no series id, no series ordering column, no entry/core/premium tier column. Tier is a
  board-owned judgement (§7.5), not a field to read.

### 3.6 Deal / Promotion / Campaign / Pricing Center

- **`campaigns`** — `CAMPAIGNS_HEADERS_`, `assets/specs/active/apps-script/20_campaign_write_handlers.gs:28`
  (25 columns). Business key `company|country|marketplace|campaign_name|year` (`20_…:49`).
- **`campaign_sku_lines`** — `CAMPAIGN_SKU_LINES_HEADERS_`, `20_…:40` (16 columns).
  **This is the only authoritative Deal price in the system**: the file's own comment at `20_…:36`
  says *"`promo_price` = the deal/promotional price (the Special Event Builder's 'Deal Price')"*.
- **Writer action:** `upsertCampaign*` family in `20_`; routed from `01_router.gs`.
- **Frontend:** `KM.DB.getCampaigns()` (`:2450`), `KM.DB.getCampaignSkuLines()` (`:2455`).
  `assets/js/pages/campaign-risk.js` reads both — but **does not read `promo_price`,
  `regular_price`, `discount_percent` or `price_units`** (measured: zero references). So the Deal
  price is stored and has **no display surface today**.
- **"Pricing Center" in the navigation is NOT product pricing.** `index.html:189` labels the menu
  group *"Pricing Center"* while keeping the internal routing key `carrier`; its children are
  *Carrier Rate Card* (live), *Container Rate Card* (Soon), *Warehouse Pricing* (Soon). That group is
  **logistics cost**, not retail price. Placing a product price-band board under it would conflate two
  different axes — see §11.1.

### 3.7 Reusable UI: Chart, Card, Filter, Modal, Drag/Drop

| Need | What already exists | Where |
|---|---|---|
| **Board canvas** | `CanvasController` — pan (`panX`/`panY`), zoom (wheel + buttons + label), item drag, 8-way resize handles, arrow/connector anchors, `data-id` addressing, `renderItems`/`createItemElement` | `assets/js/pages/supplychain.js` (1656 lines) + `assets/css/pages/supply-chain-canvas.css` (745 lines) |
| **Charts** | **Chart.js already loaded** (CDN, `index.html:34`); 5 shipped call sites | `app.js:248`, `forecast.js:644/722/850`, `inventory-replenishment.js:8259` |
| **Card** | `.km-category-card` | `assets/css/components.css` |
| **Right property panel** | `.kmf-panel`, `.kmf-panel--right` | `assets/css/components.css` |
| **Modal** | `KM.scopeModal` (public API), `.km-scope-modal`, `.km-scope-modal-overlay` | `assets/js/utils/scope-select-modal.js:21` |
| **Multi-select filter** | `KM.ui.*` | `assets/js/utils/multi-select-filter.js:32` |
| **Column/panel resize** | `resizable-columns.js`, `dual-layer-resize.js` | `assets/js/utils/` |
| **Tabs** | `tab-rail.js` | `assets/js/utils/` |
| **Page lifecycle** | `KM.lifecycle.register(pageName, { mount, unmount })` with a monotonic **epoch** so a superseded async mount discards its late `.then` | `assets/js/core/lifecycle.js:37` |
| **XLSX export** | ExcelJS already loaded | `index.html:36` |

**The single most important finding in this section.** The existing canvas is a complete, shipped,
vanilla-JS DOM board — and it persists to **`localStorage` only**:

```js
saveToStorage() {
  localStorage.setItem('supplychain-canvas', JSON.stringify({ items, arrows, nextId, nextArrowId }));
}
```
— `assets/js/pages/supplychain.js:1525`, loaded at `:1534`.

So the **engine** is reusable and proven; the **persistence is not a record**. It is per-browser,
per-device, invisible to anyone else, and lost when site data is cleared. The Product Strategy Board's
stated purpose is "可持續保存的策略紀錄" — a durable strategy record — which `localStorage` cannot be.
This is precisely the boundary between what P1 reuses and what P1 must add.

### 3.8 Frontend framework suitability

- **Vanilla JS + CSS, no framework.** No React / Vue / jQuery / Konva / Fabric / React Flow anywhere
  (measured across `assets/js/`, `assets/html/`, `index.html`).
- Only two external scripts, both already present: Chart.js and ExcelJS (`index.html:34,36`).
- Page module pattern: one `assets/html/pages/<page>.html` partial + one `assets/js/pages/<page>.js`
  + one `assets/css/pages/<page>.css`, registered through `KM.lifecycle.register`. 23 pages follow it.
- **Verdict: a DOM-based board is not merely acceptable, it is the shipped precedent.** §6 therefore
  adds **zero** dependencies. Per the round brief, nothing bigger is introduced without repo evidence
  of need, and there is none.

### 3.9 Can the DB/API create new board data today?

**No — and this is the main implementation cost of P1.**

- There is **no generic table write**. Every write is an explicitly routed action
  (`01_router.gs`, ~50 `if (action === …)` branches). A new table needs: a new handler file, new
  action names in the router, and an **Apps Script sync performed by the user**
  (`CLAUDE.md`: `APPS_SCRIPT_SYNC_OWNER = USER`).
- There **is** a clean client-side seam to plug into: `km-data-access.js` `RESOURCES`
  (`assets/js/api/km-data-access.js:150`) maps a domain resource to an Apps Script action and is
  described in the file as *"the ONLY place a domain resource meets an Apps Script action name"*.
  Commands there **must** carry an idempotency key or no request is issued
  (`IDEMPOTENCY_KEY_REQUIRED`, `:227`), and a second adapter (in-memory, `:250`) exists so the
  contract is testable without a backend.
- Reads the board needs are **all already available with zero backend work**, via
  `KM.DB.getSkuDetails / getMarketplaceSkus / getPricingList / getCampaigns / getCampaignSkuLines`
  — at the cost of the legacy 44-tab `getOperationDb` read.

### 3.10 Role / permission / audit / user identity

- **No RBAC.** No `users` / `roles` / `permissions` / `user_roles` / `acl` table is referenced by any
  shipped `.gs` file (measured).
- **No server-side identity.** `Session.getActiveUser()` appears exactly **once** in the whole
  Apps Script tree, and it is in a TEMP migration file
  (`TEMP_migrate_request_order_draft_v2.gs:1803`), not in production runtime.
- **`created_by` is client-asserted.** The shipped pattern is
  `String(body.created_by || 'operation-system')` — the caller supplies it and a literal default fills
  the blank. It is provenance, not authentication.
- **This is by design and already scheduled.** `assets/specs/active/SYSTEM_ROADMAP.md` puts
  Login + Google Identity + `users`/`roles`/`permissions`/`user_roles`/`role_permissions` + backend
  token verification + API permission enforcement in **P2-A (Phase 2)**, and states explicitly that
  Phase-1A is *"NOT gated on Login / RBAC"* and that *"'Knowing the URL' is NOT a security control."*
- **Audit precedent that does exist:** per-field change logs (`pricing_change_log`), `created_by` /
  `created_at` / `updated_by` / `updated_at` quads on most tables, and monotonic
  `version` columns on draft tables.

### 3.11 Navigation

- Sidebar in `index.html:52`+: `menu-parent` (with `data-menu-id`, `onclick="toggleMenu(id)"`) and
  `menu-children` → `menu-item` (`onclick="showSection(key)"`).
- Groups today: Operations, Warehouse & Stock, Forecast, Shipment, Procurement,
  **Campaign Performance**, **SKU Management**, **Pricing Center**, Training Center, Administration.
- **Convention for a page that is designed but not built:**
  `class="menu-item menu-item--disabled"` + `<span class="stage-badge">Soon</span>`
  (`index.html:181`, `:196`, `:200`). Three items use it today.
- The existing Supply Chain Canvas sits under **Training Center** (`index.html:221`) — i.e. the
  current canvas is positioned as a teaching tool, not an operational surface.

---

## §4 — Exact table / API / field mapping

> Every list below is code-verified at the cited line unless marked otherwise.
> `⟶` marks the field the board's first-priority screen consumes.

### 4.1 `sku_details` — 43 columns
Source: `assets/js/pages/sku-details.js:2369` (export/import schema), cross-checked against the
pre-write header gate `04_marketplace_forecast_import.gs:150`.

```
sku ⟶, product_name ⟶, category, series ⟶, lifecycle ⟶, image_url,
gs1_code, gs1_type, amz_asin,
item_length, item_width, item_height, item_length_2, item_width_2, item_height_2,
item_dimension_unit, item_weight, item_weight_unit,
package_length, package_width, package_height, package_dimension_unit,
package_weight, package_weight_unit,
carton_length, carton_width, carton_height, carton_dimension_unit,
carton_weight, carton_weight_unit, units_per_carton,
hscode, declared_value, declared_value_unit,
minimum_price ⟶, minimum_price_unit ⟶, msrp ⟶, msrp_unit ⟶,
selling_price ⟶, selling_unit ⟶,
pm, created_at, updated_at
```

**Required on import:** `sku`, `product_name`, `category`, `series`, `lifecycle`
(`sku-details.js:2371`).
**Required by the header gate:** `sku`, `category`, `series`, `selling_price`, `minimum_price`, `msrp`
(`04_…:150`).

**Two asymmetries worth naming, because a board that renames them silently would be wrong:**
- The currency companion of `selling_price` is **`selling_unit`**, not `selling_price_unit` — while
  `minimum_price`/`msrp` do use `…_price_unit` / `msrp_unit`. Three price fields, three different
  unit-column spellings.
- The master-level ASIN column is **`amz_asin`** here, but `marketplace_product_id` in the
  operational and pricing tables (§4.2, §4.4).

### 4.2 `marketplace_skus` — 14 required columns
Source: `04_marketplace_forecast_import.gs:151` (`requiredHeaders.marketplace_skus`).

```
marketplace_sku_id ⟶, marketplace_id, sku ⟶, company ⟶, country ⟶, marketplace ⟶,
site_sku ⟶, marketplace_product_id ⟶, currency ⟶,
marketplace_sku_status ⟶, replenishment_model, launch_date,
created_at, updated_at
```

`asin` is an **optional** read-side alias: the importer prefers `asin`, falls back to
`sku_details.amz_asin`, and always writes the canonical `marketplace_product_id`
— *"canonical marketplace_product_id (never asin)"* (`04_…:291`, `:399`).

### 4.3 `sku_regional_details` — 16 columns
Source: `18_sku_regional_handlers.gs:17` (`SKU_REGIONAL_DETAILS_HEADERS_`).

```
regional_detail_id ⟶, sku ⟶, company ⟶, country ⟶, marketplace ⟶,
site_sku ⟶, marketplace_product_id ⟶, product_url,
packaging_regulation, regulation_url, language, manual_version, label_version, battery_regulation,
created_at, updated_at
```

**The file states what it deliberately excludes** (`18_…:16`):
*"v2.0 canonical header (NO hscode/duty/declared-value; NO status/note/marketplace_sku_id)"*.

### 4.4 `pricing_list` — 27 columns
Source: `04_marketplace_forecast_import.gs:152` (`requiredHeaders.pricing_list`, validated before
any write).

```
pricing_id ⟶, marketplace_sku_id ⟶, sku ⟶, country ⟶, marketplace ⟶,
site_sku, marketplace_product_id,
currency ⟶, base_currency ⟶,
base_regular_price, base_minimum_price, base_msrp,
fx_rate ⟶, fx_rate_date ⟶,
auto_regular_price, auto_minimum_price, auto_msrp,
regular_price ⟶, minimum_price ⟶, msrp ⟶,
price_source ⟶, price_status ⟶,
created_by, created_at, updated_by, updated_at, note
```

**`pricing_list` has no `company` column.** Confirmed against the gate above and against
`PRICING_DATABASE_MAPPING.md` §4 (*"`company` — Not required in `pricing_list`"*).
**Consequence, and it is a hard one:** `marketplace_skus` identity includes `company`, so when two
companies operate the same `country|marketplace|sku`, their price rows can be told apart **only by
`marketplace_sku_id`**. Any board price lookup must therefore join
`sku → marketplace_skus(company,country,marketplace) → marketplace_sku_id → pricing_list`.
Joining on `(country, marketplace, sku)` alone is ambiguous and must not be implemented.

### 4.5 Where "Regional status" actually lives — a mapping correction

The round brief asks each SKU card to show *"Regional 狀態"*. There is **no status column in
`sku_regional_details`** (§4.3, stated by the file itself). The site-level status is
**`marketplace_skus.marketplace_sku_status`**.

So `REGIONAL_SKU_CARD` must resolve status from `marketplace_skus`, joined on the shared
`sku + company + country + marketplace` grain, and label it as such. The two tables share that grain
exactly (`18_…:13`), so the join is well-defined.

**Canonical vocabularies** — `assets/specs/active/apps-script/00_config.gs:9-12`:
```
VALID_LIFECYCLES_              = ['Upcoming SKU','Running in the Market','Phasing Out','Closure','Other']
VALID_MARKETPLACE_SKU_STATUSES_= ['active','phasing_out','inactive','discontinued']
VALID_REPLENISHMENT_MODELS_    = ['sales_driven','forecast_driven']
```
The board renders these values; it must not invent a status of its own.

### 4.6 `campaigns` — 25 columns
Source: `20_campaign_write_handlers.gs:28` (`CAMPAIGNS_HEADERS_`).

```
campaign_id ⟶, company ⟶, marketplace_id, campaign_name ⟶, country ⟶, marketplace ⟶,
promotion_type ⟶, major_event_flag, event_flag, year ⟶,
start_date ⟶, end_date ⟶, duration, status ⟶,
event_reporting_fee, commission,
total_sales_amount, total_sales_units, total_ad_cost, total_acos,
source, created_by, created_at, updated_by, updated_at
```
Business key: `company|country|marketplace|campaign_name|year` (`20_…:49`).

### 4.7 `campaign_sku_lines` — 16 columns  **(the only authoritative Deal price)**
Source: `20_campaign_write_handlers.gs:40` (`CAMPAIGN_SKU_LINES_HEADERS_`).

```
campaign_sku_line_id ⟶, campaign_id ⟶, marketplace_sku_id ⟶, sku ⟶,
promo_price ⟶, regular_price ⟶, price_units ⟶, discount_percent ⟶,
special_condition, lps, line_status ⟶, source,
created_by, created_at, updated_by, updated_at
```

The file's own definition of the two fields the board depends on (`20_…:36-39`):
- `promo_price` = *"the deal/promotional price (the Special Event Builder's 'Deal Price')"*
- `price_units` = *"the currency snapshot of the SAME `pricing_list` row that supplied
  `regular_price` / `promo_price`… a display/audit currency snapshot only — NOT a sales amount and
  NOT an FX rate"*

The last clause is load-bearing for §7.6: the repo already refuses to treat `price_units` as an FX
rate, and this board must inherit that refusal.

### 4.8 API surface the board can use

| Purpose | Action / accessor | Status |
|---|---|---|
| SKU master + regional, scoped | `skuDetails.workspace.get` (`include.regional`) | **Exists.** `01_router.gs:572`; owner `59_` |
| SKU master, legacy | `KM.DB.getSkuDetails()` | Exists (via `getOperationDb`) |
| Marketplace SKUs | `KM.DB.getMarketplaceSkus()` | Exists (via `getOperationDb`) |
| **Pricing** | `KM.DB.getPricingList()` | Exists **only** via `getOperationDb` — **no scoped owner (GAP)** |
| **Campaigns / Deal lines** | `KM.DB.getCampaigns()`, `KM.DB.getCampaignSkuLines()` | Exists **only** via `getOperationDb` — **no scoped owner (GAP)** |
| One table, ad hoc | `getTable?table=<name>` | Exists (`01_router.gs:237`) — read-only, single tab |
| **Board read/write** | — | **Does not exist. New handler + router actions + user-owned Apps Script sync.** |

---

## §5 — Data ownership and SSOT

| Data | Single source of truth | The board's relationship to it |
|---|---|---|
| Master SKU identity, Series, category, lifecycle, base prices | `sku_details` | **Read only** |
| Company / country / marketplace / site SKU / site status / site currency | `marketplace_skus` | **Read only** |
| Regional regulatory + site identity detail | `sku_regional_details` | **Read only** |
| Effective prices (regular / minimum / MSRP), FX, price source & status | `pricing_list` | **Read only** |
| Deal / promo price | `campaign_sku_lines` (inside a `campaigns` row) | **Read only** |
| Board layout, notes, positioning, target price, strategy reasoning, risk, to-dos | **`product_strategy_board_elements` (new, board-owned)** | **Owns** |
| Snapshot of displayed source values at decision time | **`snapshot_json` on the element (new)** | **Owns** |

**The boundary, stated as a rule the implementation must enforce (§15.4):**
the board **never writes** to `sku_details`, `marketplace_skus`, `sku_regional_details`,
`pricing_list`, `pricing_change_log`, `campaigns` or `campaign_sku_lines`. A board element that holds
a "target price" holds a *proposal*, in board-owned storage, with no path to the pricing tables.
Promoting a board proposal into `pricing_list` would be a separate, explicitly authorized flow that
this design does **not** create.

**Why this matters more than usual here.** `pricing_list` is described in the roadmap as
*"the only source of truth for Regular Price / Minimum Price / MSRP / Currency"* and
*"Any page requiring pricing data must read from `pricing_list`"*
(`SYSTEM_ROADMAP.md` §3.5-1b). A board that stored its own prices would become a second pricing
authority — the exact thing that rule exists to prevent.

---

## §6 — Proposed board schema

Two tables. Deliberately two, not five.

### 6.1 `product_strategy_boards`

| Column | Type | Notes |
|---|---|---|
| `board_id` | string, PK | `PSB-` + 8 uppercase hex. **Deterministic derivation, not `Utilities.getUuid()`** — see §6.4 |
| `board_name` | string | Required |
| `board_type` | enum | `SERIES_PRICE_ARCHITECTURE` \| `FREEFORM` (P1: two values only) |
| `owner` | string | **Client-asserted, same contract as `created_by`.** Not authenticated (§13) |
| `status` | enum | `DRAFT` \| `ACTIVE` \| `ARCHIVED` |
| `created_at` | datetime | |
| `updated_at` | datetime | |
| `version` | integer | Monotonic; incremented on every accepted write. Optimistic-concurrency token (§15.3) |

### 6.2 `product_strategy_board_elements`

| Column | Type | Notes |
|---|---|---|
| `element_id` | string, PK | `PSE-` + 8 uppercase hex, derived (§6.4) |
| `board_id` | string, FK | → `product_strategy_boards.board_id` |
| `element_type` | enum | §7 |
| `position_x`, `position_y` | number | Board coordinates (grid units in P1) |
| `width`, `height` | number | |
| `z_index` | integer | |
| `source_type` | enum | `NONE` \| `SKU` \| `REGIONAL_SKU` \| `SERIES` \| `PRICING` \| `CAMPAIGN_SKU_LINE` |
| `source_identity` | string | The **official** identity, verbatim, in a documented shape (§7.2) |
| `source_mode` | enum | `LIVE_REFERENCE` \| `FROZEN_SNAPSHOT` (§8) |
| `snapshot_json` | JSON string | Populated **only** when `source_mode = FROZEN_SNAPSHOT`; carries `captured_at` |
| `content_json` | JSON string | Human-authored content + per-type config (§7) |
| `created_by` | string | Client-asserted (§13) |
| `created_at`, `updated_at` | datetime | |
| `version` | integer | Per-element monotonic |

### 6.3 What is deliberately NOT created

- **No `board_links` table.** Connectors are deferred (§2), and when they arrive a `CONNECTOR`
  element with two ids in `content_json` costs one row and no new table.
- **No `board_history` table in P1.** `version` + `updated_at` on both tables carries "which version
  am I looking at". A full history table is only worth building once there is an actual restore or
  diff requirement — and once AI writes to the board (§14), which is when it becomes mandatory.
  **This is recorded as open decision D-7 (§19).**
- **No AI table.** §14 is a seam, not a schema.

### 6.4 Id derivation — and why it is not a UUID

`21_factory_inventory_handlers.gs` mints operational ids with
`Utilities.getUuid().replace(/-/g,'').substring(0,8)`, and that is correct for a row that can only be
created once. But `71_api_v1_factory_stock_guard.gs:574` mints its audit id as
`'FSOA-' + KMFSG.fnv1a(<natural key>).toUpperCase()` — a deterministic hash of a natural key, which is
the shipped precedent for **anything a retry can reach twice**.

Board writes go through `km-data-access.js`, where a command **must** carry an idempotency key
(`IDEMPOTENCY_KEY_REQUIRED`, `km-data-access.js:227`). A retried "create element" must therefore
resolve to the **same** `element_id` or one gesture produces two elements. So:

```
element_id = 'PSE-' + fnv1a('PSE|' + board_id + '|' + idempotency_key).toUpperCase()
board_id   = 'PSB-' + fnv1a('PSB|' + board_name + '|' + created_at + '|' + idempotency_key).toUpperCase()
```

`fnv1a` returns `('00000000' + h.toString(16)).slice(-8)` — always 8 zero-padded hex characters — so
the shape is byte-identical to the `FSMV-`/`FSOA-` family already in the database.

---

## §7 — Element contracts

### 7.1 The nine types

| `element_type` | P1? | `source_type` | What `content_json` carries |
|---|---|---|---|
| `TEXT_NOTE` | **Yes** | `NONE` | `{ text, title?, colour?, tags[] }` |
| `SKU_CARD` | **Yes** | `SKU` | `{ shown_fields[], note? }` |
| `REGIONAL_SKU_CARD` | **Yes** | `REGIONAL_SKU` | `{ shown_fields[], note? }` |
| `SERIES_PRICE_BAND` | **Yes** | `SERIES` | `{ axis, currency_basis, members[], annotations[] }` (§9) |
| `MATRIX` | **Yes** | `NONE` | `{ x_axis, y_axis, cells[] }` where a cell references an element_id |
| `CHART` | No (P2) | `NONE` \| `SERIES` | `{ chart_type, metric, series[] }` — blocked by §9 gaps |
| `DEAL_PLAN` | No (P2) | `CAMPAIGN_SKU_LINE` | blocked by the §10 boundary decision |
| `GROUP` | No (P2) | `NONE` | `{ member_element_ids[] }` |
| `CONNECTOR` | No (P2) | `NONE` | `{ from_element_id, to_element_id, style }` |

Also carried on every element, in `content_json`, for §14:
`author_type` ∈ `HUMAN` \| `AI` (P1 writes `HUMAN` only, always explicitly — never by omission).

### 7.2 `source_identity` shapes — the official identities, verbatim

These are the identities the source tables actually use. No board-local key is invented.

```
source_type = SKU                → "<sku>"
                                   (sku_details.sku)
source_type = REGIONAL_SKU       → "<company>|<country>|<marketplace>|<sku>"
                                   (the grain 18_sku_regional_handlers.gs:13 declares)
source_type = SERIES             → "<series>"
                                   (a distinct value of sku_details.series — §3.5)
source_type = PRICING            → "<marketplace_sku_id>"
                                   (pricing_list has no company column — §4.4)
source_type = CAMPAIGN_SKU_LINE  → "<campaign_sku_line_id>"
```

`REGIONAL_SKU` deliberately keeps the four-part scope key rather than `regional_detail_id`, because
the board resolves **two** tables at that grain — `sku_regional_details` *and*
`marketplace_skus` (for status, §4.5) — and only the scope key addresses both.

### 7.3 Refusal contract per element
Every element renders one of exactly four states, and they are never collapsed:
`RESOLVED` · `SOURCE_MISSING` · `SOURCE_INACTIVE` · `UNRESOLVABLE` (§15).

---

## §8 — Live vs snapshot lifecycle

### 8.1 `LIVE_REFERENCE`
- Stores **only** `source_type` + `source_identity`. `snapshot_json` stays null.
- Resolves against the official read path on every board open.
- **The board does not become a second SKU master:** no source field value is persisted at all in
  this mode, so there is nothing to drift.

### 8.2 `FROZEN_SNAPSHOT`
- Stores the **displayed values at the moment of freezing**, plus `captured_at`, plus
  `snapshot_version` and the read path used.
- Later edits to `sku_details` / `pricing_list` / `campaign_sku_lines` **never** rewrite it. A
  decision made on 2026-09-09 must still show the numbers that were on screen on 2026-09-09.

```json
{
  "snapshot_version": 1,
  "captured_at": "2026-09-09T04:12:33Z",
  "captured_via": "skuDetails.workspace.get",
  "source_type": "REGIONAL_SKU",
  "source_identity": "ResUS|US|Amazon|CO1100-R",
  "values": { "series": "...", "regular_price": 39.99, "currency": "USD",
              "marketplace_sku_status": "active" },
  "value_provenance": { "regular_price": "pricing_list.regular_price",
                        "marketplace_sku_status": "marketplace_skus.marketplace_sku_status" }
}
```

`value_provenance` exists because §4 proved that three different tables supply fields a single card
shows. A frozen number without the column it came from cannot be re-checked later.

### 8.3 Refresh behaviour

| Mode | On board open | On explicit "Refresh" |
|---|---|---|
| `LIVE_REFERENCE` | Re-reads; shows current values | Same as open |
| `FROZEN_SNAPSHOT` | Shows the snapshot, **always**, with `captured_at` visible | Shows a **side-by-side diff** (snapshot vs live) and requires an explicit user action to re-freeze. Re-freezing **increments `snapshot_version`** and writes a new `captured_at`. |

A silent re-freeze is prohibited: it would destroy the only copy of the decision evidence while
appearing to be a refresh.

### 8.4 Source missing / deleted / inactive — three different answers

| Situation | Detection | `LIVE_REFERENCE` | `FROZEN_SNAPSHOT` |
|---|---|---|---|
| **Missing** — identity resolves to no row | no matching row | `SOURCE_MISSING`, identity shown, no value invented | Snapshot still renders, badged *"source no longer present"* |
| **Inactive** — row exists, `marketplace_sku_status` ∈ `inactive`/`discontinued`, or `lifecycle` = `Closure` | vocabulary from `00_config.gs:9-12` | `SOURCE_INACTIVE` + current values | Snapshot renders + inactive badge |
| **Unreadable** — the read failed | transport/ business error from `km-data-access` | `UNRESOLVABLE`, **never** rendered as empty or zero | Snapshot renders (this is exactly what it is for) |

"I could not read it" is never displayed as "it is empty". A blank price cell and a failed price read
are different facts with different remedies.

### 8.5 The no-reverse-write boundary
- The board's write actions accept `board_id` / `element_id` **only**. There is no code path from a
  board write to a source table, because the handler has no such action to call.
- `snapshot_json` is write-once-per-freeze and is never read back into any source write.
- **Testable claim (§18):** the board handler's source contains no reference to `sku_details`,
  `marketplace_skus`, `sku_regional_details`, `pricing_list`, `pricing_change_log`, `campaigns` or
  `campaign_sku_lines` as a **write** target — asserted on the source, not promised in prose.

---

## §9 — Price-band calculation and display rules

### 9.1 The available price fields, and the gaps

| Requested concept | Field that exists | Where | Verdict |
|---|---|---|---|
| 正常售價 / normal selling price | `pricing_list.regular_price` | `04_…:152` | **OK** |
| MSRP / List price | `pricing_list.msrp` (site), `sku_details.msrp` (+`msrp_unit`, master base) | `04_…:152`, `sku-details.js:2369` | **OK — two levels, must be labelled** |
| Current selling price | — | — | **GAP.** `sku_details.selling_price` is a master **base** input the importer feeds into `base_regular_price`, not a live site price. `pricing_list` has no "current" column distinct from `regular_price`. |
| Planned deal price | `campaign_sku_lines.promo_price` | `20_…:41` | **OK, but campaign-scoped only** (§10) |
| Floor / minimum price | `pricing_list.minimum_price`; `sku_details.minimum_price` (+`minimum_price_unit`) | `04_…:152` | **OK — two levels** |
| Margin | — | — | **GAP.** No `margin`, `margin_percent` or `gross_margin` column exists anywhere in the Apps Script tree (measured). Cost data lives in the (planned) Cost & Pricing layer, `SYSTEM_ROADMAP.md` §3.5-4. |
| Currency | `pricing_list.currency` (site), `pricing_list.base_currency`, `campaign_sku_lines.price_units`, and the master `*_unit` trio | `04_…:152`, `20_…:42` | **OK — four different currency carriers, see 9.4** |
| Effective date | — | — | **GAP — AND IT IS DELIBERATE.** See 9.2 |
| Data source | `pricing_list.price_source` (`auto_fx` / `manual_override` / `import`) + `price_status` | `PRICING_DATABASE_MAPPING.md` §4 | **OK** |
| `captured_at` | — | — | **GAP in the source; board-owned** (§8.2) |

### 9.2 The effective-date gap is an architectural decision, not an omission

`SYSTEM_ROADMAP.md` §3.5-1b states:

> **Future Promotion Pricing:** time-bounded promotion pricing should use `pricing_campaigns` or
> `promotion_prices` — **NOT** `effective_from` / `effective_to` columns in `pricing_list`.

Measured consistency: `effective_from` appears 19 times and `effective_date` once across the Apps
Script tree, and **every one of them is carrier, tax, party-authority, document-template or
warehouse-config** — never pricing.

**Therefore this design does not propose adding an effective date to `pricing_list`, and the board must
not synthesise one.** Time-bounded price information in P1 comes from the campaign window
(`campaigns.start_date` / `end_date`), which is the repo's own answer to the question.

### 9.3 Price-band visual — what P1 renders

1. **Horizontal price axis per Series.** Domain from the members' own values; no fixed scale.
2. **One point (or a low–high range) per SKU** at the chosen basis, carrying: `sku`,
   `product_name`, and — for a regional card — `company|country|marketplace`.
3. **Normal vs Deal are visually distinct**: `regular_price` as the primary marker,
   `campaign_sku_lines.promo_price` as a secondary marker with the campaign window in the tooltip.
   They are never averaged and never drawn on the same marker.
4. **Gap and overlap marking, defined arithmetically** so the picture is checkable:
   - sort members ascending by basis price;
   - **overlap** = two members whose `[promo_price, regular_price]` intervals intersect;
   - **gap** = adjacent members whose price distance exceeds a **user-set threshold** on the element.
     There is no repo-derived "correct" band width, so the threshold is an input, is stored in
     `content_json`, and is displayed next to the finding. A gap marking whose threshold is invisible
     is an opinion presented as a measurement.
   - **Cannibalisation flag** = member A's `promo_price` ≤ member B's `regular_price` where
     B sits below A in the normal-price order. Flagged, counted, never auto-resolved.
5. **Entry / core / premium** are **positions in the sorted list**, computed and labelled as such
   (lowest / median band / highest), **not** read from any column — no tier column exists (§3.5).
   A human can override the label per member; the override is board-owned content.

### 9.4 Currency and cross-country comparison — the refusal

Four different currency carriers exist (9.1). They are not interchangeable:
`pricing_list.currency` is the site currency, `base_currency` is the master basis,
`campaign_sku_lines.price_units` is *"a display/audit currency snapshot only — NOT … an FX rate"*
(`20_…:38`), and the master trio (`minimum_price_unit`, `msrp_unit`, `selling_unit`) is a third level.

**Rules:**
- A `SERIES_PRICE_BAND` element carries an explicit **`currency_basis`**. P1 supports exactly one
  value: `AS_QUOTED_SINGLE_CURRENCY`.
- If the members resolve to **more than one** currency, the element renders
  `MIXED_CURRENCY_COMPARISON_REFUSED`, lists the currencies found and the members in each, and draws
  **no shared axis**. It offers to split into one band per currency.
- `pricing_list.fx_rate` / `fx_rate_date` exist and are **displayed** when present, but **P0 does not
  decide any conversion policy or base currency** and P1 performs **no** conversion. Cross-country
  comparison requires an operator decision — recorded as **D-3 (§19)**.

---

## §10 — Deal planning boundaries

- **The only authoritative Deal price is `campaign_sku_lines.promo_price`, inside a `campaigns` row.**
  A Deal price therefore always has a scope (`company|country|marketplace`), a window
  (`start_date`/`end_date`) and a campaign identity.
- **The board reads it. The board does not write it.** No board element writes `promo_price`,
  `discount_percent`, `regular_price` or `price_units` into `campaign_sku_lines`.
- A board-authored Deal idea is a **proposal** in `content_json` with no path to the campaign tables.
  It must be visually distinguishable from a resolved `campaign_sku_lines` row, and the element
  states which it is.
- **`DEAL_PLAN` is deferred (P2)** for a concrete reason: a Deal plan element that is *not* bound to a
  `campaign_id` becomes a second promo-price store the moment someone treats it as one, and whether
  the board may create campaign lines is a product decision, not an implementation detail
  — **D-4 (§19)**.
- **Note for the operator:** `campaign_sku_lines.promo_price` is currently stored and has **no read
  surface in the UI** (§3.6 — `campaign-risk.js` reads the tables but never these four columns). The
  board's price band would be the **first** place Deal price becomes visible. That is a benefit and
  also a risk: the first reader of a column often discovers that the column is not populated the way
  everyone assumed. P1 must therefore render `promo_price` absence as `SOURCE_MISSING`, not as "no
  deal".

---

## §11 — UI wireframe description

### 11.1 Navigation placement

**Recommendation: a new top-level sidebar group, `Product Strategy`, with one child,
`Product Strategy Board`.**

Reasoning from the existing IA:
- **Not** under *Pricing Center* — that group is logistics **cost** (Carrier / Container / Warehouse
  Rate Cards) despite its name (§3.6). Putting a retail price-band board there conflates two axes.
- **Not** under *Training Center*, where the current canvas sits (§3.11) — this board is an
  operational planning surface, not a teaching aid.
- *SKU Management* is the closest existing fit and is the fallback, but the board spans SKU **+**
  Pricing **+** Campaign, so it is not a SKU sub-page.

Placement is **D-1 (§19)**. Until the page exists, the repo's own convention for a designed-but-unbuilt
page applies: `menu-item menu-item--disabled` + `<span class="stage-badge">Soon</span>`
(`index.html:181`).

### 11.2 Layout

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR                                                                              │
│ [Board ▾ New] │ Series ▾ │ Country ▾ │ Marketplace ▾ │ Company ▾ │ [Save] [History ▾]│
│                                             board v12 · saved 14:22 · LIVE/SNAPSHOT  │
├────────────┬──────────────────────────────────────────────────┬──────────────────────┤
│ TOOLBAR    │  BOARD (fixed grid, pan / zoom / drag / resize)  │ PROPERTIES           │
│            │                                                  │                      │
│ ▭ Text     │   ┌──────────────┐   ┌──────────────────────┐    │ Element: SKU_CARD    │
│ ▣ SKU      │   │ TEXT_NOTE    │   │ SKU_CARD  CO1100-R   │    │ ─────────────────    │
│ ▤ Regional │   │ positioning… │   │ Series: …            │    │ Source               │
│ ⎯ Price    │   │ risk…        │   │ regular 39.99 USD    │    │  type  SKU           │
│   Band     │   └──────────────┘   │ msrp    49.99 USD    │    │  id    CO1100-R      │
│ ▦ Matrix   │                      │ min     29.99 USD    │    │  mode  ◉ Live        │
│ ▧ Chart ⏳ │   ┌───────────────────┴──────────────────────┐    │        ○ Snapshot    │
│ ◆ Deal  ⏳ │   │ SERIES_PRICE_BAND — "Can Opener" (USD)   │    │  captured_at  —      │
│            │   │ 25 ──●──────●───◇─────────●──────── 60   │    │ ─────────────────    │
│            │   │      ▲gap 12.0   ▲overlap  ▲cannibal.    │    │ Notes                │
│            │   │  ● regular  ◇ promo   threshold 8.00     │    │  [            ]      │
│            │   └──────────────────────────────────────────┘    │ ─────────────────    │
│            │                                                  │ Position / Size      │
│            │  [− 100% +] [reset]                              │ z-index              │
└────────────┴──────────────────────────────────────────────────┴──────────────────────┘
```

### 11.3 Behaviour, and what it reuses

| Region | Behaviour | Reuses |
|---|---|---|
| Board | pan, zoom, drag, resize, multi-select, group | `CanvasController` from `supplychain.js` (§3.7) — engine reused, **`localStorage` persistence replaced** |
| Top bar filters | Series / Country / Marketplace / Company | `KM.ui` multi-select filter; `KM.scopeModal` for scope picking |
| Properties panel | element props, source, live/snapshot toggle, notes | `.kmf-panel--right` |
| Cards | module card visuals | `.km-category-card` |
| Charts (P2) | — | Chart.js, already loaded |
| Page shell | mount / unmount with epoch guards | `KM.lifecycle.register` |

**Explicitly not added:** React, Konva, Fabric, React Flow, or any other library. The repo proves a
DOM board works (§3.8); nothing in the requirement exceeds what it does today.

### 11.4 Initial template — "SKU Series Price Architecture Board"
On first creation with `board_type = SERIES_PRICE_ARCHITECTURE`, the board is seeded with:
one `TEXT_NOTE` ("Objective / constraints"), one `SERIES_PRICE_BAND` bound to the Series chosen in the
top bar, and one `MATRIX` pre-labelled `Price × Product Tier`. Nothing is auto-populated with values
the user did not ask for; the band resolves live and shows its own refusals.

---

## §12 — API proposal

### 12.1 New actions (three)

| Action | Kind | Payload | Returns |
|---|---|---|---|
| `productStrategyBoard.workspace.get` | read | `{ board_id? }` | `{ boards[], elements[] }` — all boards when `board_id` omitted (list), one board's elements when given |
| `productStrategyBoard.upsertBoard` | write | `{ board_id?, board_name, board_type, owner, status, expected_version?, idempotency_key }` | `{ board_id, version, applied, replayed }` |
| `productStrategyBoard.upsertElements` | write | `{ board_id, elements[], expected_version?, idempotency_key }` | `{ element_ids[], version, applied, replayed }` |

Deletion is `status`/soft-delete on the board and an element-level `deleted` flag in `content_json`
for P1 — no row removal, so an accidental delete is recoverable and no id is ever reused.

### 12.2 Client resource registration
One entry in the existing registry (`assets/js/api/km-data-access.js:150`):
```js
productStrategyBoard: {
  read: 'productStrategyBoard.workspace.get', rowsAt: 'elements',
  commands: { upsertBoard:    'productStrategyBoard.upsertBoard',
              upsertElements: 'productStrategyBoard.upsertElements' }
}
```
This inherits, for free: the typed envelope, business-vs-transport error separation, the mandatory
idempotency key, and the in-memory adapter for contract tests.

### 12.3 The pricing read gap — a separate, smaller proposal
`pricing_list`, `campaigns` and `campaign_sku_lines` have **no scoped read owner** (§4.8), so a board
that needs prices today must trigger the 44-tab `getOperationDb`. Two options:

- **P1 (recommended): ship the board on the existing `KM.DB.*` accessors.** Zero backend work for
  reads; accepts the legacy full-DB read cost, which every other non-workspace page already pays.
- **P1.5: add `productPricing.workspace.get`** — a bounded read over
  `pricing_list` + `campaigns` + `campaign_sku_lines` (+ `marketplace_skus` for the company join,
  §4.4). This is squarely in line with the repo's own direction: `F1-7J-A3` in
  `docs/planning/F1_7J_REMAINING_SECONDARY_SURFACES_AND_AUTHORITY_MASTER_AUDIT_R1.md` §10 already
  plans *"Remaining non-workspace PRIMARY pages → scoped reads … campaign-risk, carrier-rate-card
  (new small workspaces or bounded reads)"*.

Sequencing is **D-5 (§19)**.

---

## §13 — Permission / audit model

**The honest position: this system has no authentication and no authorization, and the board must not
pretend otherwise.**

- `owner` and `created_by` are **client-asserted strings** with a literal default, exactly like every
  other table (§3.10). The board displays them as *provenance*, never as access control, and the UI
  must not imply a board is private.
- **No board is hidden from anyone.** Any user of the deployment can read and edit any board. Stating
  this in the UI is part of the design, because a board labelled "owner: X" that anyone can edit is
  worse than one with no owner label at all.
- **Audit in P1** = `created_by` / `created_at` / `updated_by` / `updated_at` / `version` on both
  tables, plus `author_type` on every element (§14).
- **P2 alignment.** When `users` / `roles` / `permissions` / `user_roles` / `role_permissions` and
  backend token verification land in **P2-A** (`SYSTEM_ROADMAP.md`), `owner` becomes a real FK and
  board-level read/write scoping becomes enforceable. The schema is already shaped for it: `owner`
  and `created_by` are single string columns.
- **No credential, token or secret** is introduced anywhere by this design — consistent with the
  Phase-1A rule that no secret may sit in the frontend, repo or Sheet.

---

## §14 — AI extension seam (design only, nothing implemented)

| Requirement | How the schema already satisfies it |
|---|---|
| AI can read board, elements, source references and snapshots | `productStrategyBoard.workspace.get` returns exactly that; `source_type` + `source_identity` are the official identities (§7.2), so AI cites the source rather than the board's copy |
| AI content marked `author_type=AI` | `author_type` ∈ `HUMAN`\|`AI` on every element, written **explicitly** in P1 (always `HUMAN`), so an AI element is distinguishable by presence of a value, not by absence |
| Human content never silently overwritten by AI | Element `version` + `expected_version` optimistic concurrency (§15.3). An AI write to an element whose `author_type = HUMAN` must create a **new adjacent element** (a suggestion), never an in-place update. Enforced by the handler, not by convention |
| AI suggestions separated from official SKU/Pricing writes | Already structural: the board has **no write path to any source table** (§8.5). An AI suggestion cannot reach `pricing_list` even in principle |
| Version + audit for every AI change | `version`, `updated_at`, `updated_by`, `author_type`. **A full `board_history` table becomes mandatory at this point** — see D-7 |
| Future: meeting notes, price-gap analysis, Deal cannibalisation alerts | `TEXT_NOTE` carries meeting notes today; §9.3's gap/overlap/cannibalisation findings are **computed and stored in `content_json`**, so an AI reads a measurement rather than re-deriving it from a picture |

**Nothing in this round implements any of it.** No AI table, no prompt, no model configuration, no
action name reserved in the router.

---

## §15 — Failure and refusal behaviour

1. **Source unreadable → `UNRESOLVABLE`, never empty and never zero.** A failed price read and a blank
   price are different facts; the element says which.
2. **Mixed currency → `MIXED_CURRENCY_COMPARISON_REFUSED`** (§9.4). The band refuses the shared axis
   and names the currencies rather than drawing a misleading comparison.
3. **Concurrent edit → refuse, do not merge.** Every write carries `expected_version`; a mismatch
   returns `BOARD_VERSION_CONFLICT` with the current version, and the client re-reads. Last-write-wins
   on a strategy board silently destroys someone's reasoning.
4. **No reverse write, structurally.** The handler exposes no action that targets a source table
   (§8.5), and that is asserted on its source in tests (§18).
5. **Ambiguous price join → refuse.** If `sku + country + marketplace` resolves to more than one
   `marketplace_sku_id` (i.e. multiple companies), the element must **not** pick one: it renders
   `PRICE_SOURCE_AMBIGUOUS_ACROSS_COMPANIES` and asks for a company. This follows directly from
   `pricing_list` having no `company` column (§4.4).
6. **Snapshot never silently re-frozen** (§8.3).
7. **Missing element type → refuse to render**, not a default type. A `CHART` element created by a
   future version and opened by an older client shows `UNSUPPORTED_ELEMENT_TYPE` and is preserved
   untouched on save.
8. **Element cap.** A board is bounded (proposal: 500 elements) and the cap is reported, never
   silently applied — the same rule `59_…` uses for its row cap (`capped` is always surfaced).

---

## §16 — Migration and deployment impact

| Item | Impact |
|---|---|
| New Google Sheet tabs | **2** — `product_strategy_boards`, `product_strategy_board_elements` |
| Changes to existing tabs | **None.** No column added, renamed or removed anywhere |
| Data migration | **None.** No existing row is read-modified-written; the two tabs start empty |
| New Apps Script file | 1 (proposed `65_api_v1_product_strategy_board.gs` — number to be confirmed against the live project) |
| Router changes | 3 new `if (action === …)` branches in `01_router.gs` |
| `getOperationDb` `validTabs` | Optional. **Recommended NOT to add** the two board tabs — the board has its own bounded read, and adding them makes every page's legacy full-DB read bigger |
| Frontend files | 3 new (`assets/html/pages/product-strategy-board.html`, `assets/js/pages/product-strategy-board.js`, `assets/css/pages/product-strategy-board.css`) + 1 `<link>` and 1 nav block in `index.html` + 1 `RESOURCES` entry |
| **Apps Script sync** | **REQUIRED at P1, and it is USER-owned.** `CLAUDE.md`: `APPS_SCRIPT_SYNC_OWNER = USER`, `DEPLOYMENT_OWNER = USER`. A new Web App deployment version is required because a new action must be reachable |
| Web App deployment version | **Required at P1** (new router actions). **Not required for P0** — this round changes no `.gs` file |
| DB capacity | Two more tabs count toward the Google-Sheet cell budget tracked by the planned DB Capacity Monitor (`SYSTEM_ROADMAP.md`, Phase 2). Board elements are the only growing table; the §15.8 cap bounds it |
| Rollback | Delete the two tabs and revert the frontend files. No source table is touched, so rollback cannot lose operational data |

---

## §17 — Implementation batches

| Batch | Scope | Ships | Apps Script sync |
|---|---|---|---|
| **B0** *(this round)* | Design freeze — this document | docs only | No |
| **B1** | Two tabs + `65_` handler + 3 router actions + `RESOURCES` entry. Read + write + version conflict. **No UI.** Proven by fixture tests | backend seam | **Yes (user)** |
| **B2** | Page shell + nav + `CanvasController` reuse with **server** persistence replacing `localStorage`. `TEXT_NOTE` only | a usable notes board | No (frontend only) |
| **B3** | `SKU_CARD` + `REGIONAL_SKU_CARD`, `LIVE_REFERENCE` mode, the four resolution states, the §15.5 ambiguity refusal | SKU modules on the board | No |
| **B4** | `FROZEN_SNAPSHOT` mode: freeze, `captured_at`, `value_provenance`, the refresh diff, re-freeze versioning | decision evidence | No |
| **B5** | `SERIES_PRICE_BAND`: axis, points, normal-vs-deal markers, gap / overlap / cannibalisation arithmetic, mixed-currency refusal, entry/core/premium positions | **the first-priority screen** | No |
| **B6** | `MATRIX` + the "SKU Series Price Architecture Board" template | matrices | No |
| **B7** *(optional)* | `productPricing.workspace.get` bounded read, replacing the legacy full-DB read | performance | **Yes (user)** |
| **P2** | `CHART`, `DEAL_PLAN`, `GROUP`, `CONNECTOR`, `board_history`, AI seam activation | deferred | TBD |

**Complexity and effort estimate** (rough, for sequencing only — not a commitment):

| Batch | Complexity | Rough size |
|---|---|---|
| B1 | Medium — new table pattern, idempotency, version conflict | ~600–900 lines `.gs` + tests |
| B2 | Low-Medium — the engine exists; swapping persistence is the work | ~400–600 lines JS/CSS |
| B3 | Medium — three-table join, four refusal states | ~400–600 lines |
| B4 | Medium — snapshot/diff/re-freeze semantics | ~300–500 lines |
| B5 | **High** — the price arithmetic and its refusals are where correctness lives | ~600–900 lines + heavy tests |
| B6 | Low | ~200–300 lines |
| B7 | Medium | ~400–600 lines `.gs` + tests |

B1 is the only batch that blocks the others, and it is the only one before B7 that needs a user-owned
Apps Script sync.

---

## §18 — Acceptance criteria

**P0 (this round) — all met:**
- A1 Isolated worktree + feature branch off the real `origin/main`; mainline untouched. ✔
- A2 Every table, column, action and component cited to a shipped file and line. ✔
- A3 Every field the product asked for is either mapped to a real column or marked **GAP** with no
  invented mapping. ✔ (§9.1)
- A4 No page, table, API, `.gs`, frontend or deployment change. ✔
- A5 No push, no merge, no deploy, no DB write. ✔

**P1 acceptance (for the batches above):**
- B1: a create replayed with the same idempotency key returns `replayed: true` and creates **no**
  second row; `element_id` is byte-identical across the retry.
- B1: a write with a stale `expected_version` returns `BOARD_VERSION_CONFLICT` and writes nothing.
- B1: the handler's own source contains **no write** to any of the seven source tables — asserted on
  the source text, and a mutation that adds one must fail a test.
- B3: an element whose source row is absent renders `SOURCE_MISSING` and displays no numeric value.
- B3: `sku + country + marketplace` matching two companies renders
  `PRICE_SOURCE_AMBIGUOUS_ACROSS_COMPANIES` and picks neither.
- B4: after editing `pricing_list` behind a frozen element, the element still shows the original
  values and `captured_at`; the refresh diff shows both.
- B5: a Series whose members resolve to two currencies renders
  `MIXED_CURRENCY_COMPARISON_REFUSED`, names both currencies, and draws no shared axis.
- B5: gap findings display the threshold that produced them.
- B5: `promo_price` absent renders `SOURCE_MISSING`, never "no deal".
- All: measured zero writes to every source table across the whole test suite.

---

## §19 — Open decisions requiring operator confirmation

| # | Decision | Why it cannot be decided from the repo | Default if you do not decide |
|---|---|---|---|
| **D-1** | **Navigation placement.** New top-level *Product Strategy* group (recommended), or under *SKU Management*? | *Pricing Center* means logistics cost, and the board spans SKU + Pricing + Campaign. IA judgement, not a fact in the repo (§11.1) | New top-level group |
| **D-2** | **Which price is the band's default basis** — `pricing_list.regular_price` (site, effective) or `sku_details.selling_price` (master base)? | Both exist and mean different things; the repo does not rank them for a strategy view (§9.1) | `pricing_list.regular_price`, because the roadmap calls `pricing_list` the only pricing SSOT |
| **D-3** | **Cross-country comparison basis.** Original currency only, or a base currency + which FX source? | P0 is explicitly forbidden to decide FX. `pricing_list.fx_rate` exists but the repo's promo-currency field is explicitly *"NOT an FX rate"* (§9.4) | Original currency only; refuse mixed-currency axes |
| **D-4** | **May the board ever create `campaign_sku_lines` rows?** | Determines whether `DEAL_PLAN` is a proposal or a writer. Product decision (§10) | No — proposals only, and `DEAL_PLAN` stays deferred |
| **D-5** | **Accept the legacy 44-tab read for prices in P1, or build `productPricing.workspace.get` first?** | A performance/sequencing trade-off, not a correctness one (§12.3) | Accept it in P1; add the bounded read as B7 |
| **D-6** | **"Current selling price" is a GAP.** Do you want it, and if so where does it come from — a new `pricing_list` column, an Amazon snapshot, or manual entry? | No column exists, and inventing one would create a second price authority (§9.1) | Not shown in P1 |
| **D-7** | **`board_history`** — needed at P1, or when AI starts writing? | No restore/diff requirement exists yet; `version` covers "which version". But it becomes mandatory once AI writes (§14) | Defer to P2, together with the AI seam |
| **D-8** | **`margin` is a GAP** — no cost data exists in this layer. Is margin in scope at all, or does it wait for the planned Cost & Pricing DB (`SYSTEM_ROADMAP.md` §3.5-4)? | There is no cost column anywhere to compute it from (§9.1) | Out of scope until Cost & Pricing exists |
| **D-9** | **Board visibility.** Accept that every board is readable and editable by every user of the deployment until P2-A RBAC lands? | There is no identity or RBAC to build on, and Phase-1A is explicitly not gated on it (§13) | Accept, and say so in the UI |

---

## §20 — Conflict check against the S-slices

| Work | Overlap | Verdict |
|---|---|---|
| **S1 diagnostic slice** (`TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs`, Manifest P / S, factory movement census, R4C–R4F) | Tables: `factory_stock*`, `shipping_allocation_drafts*`, `reservations`, `inventory_gap*`. Files: one TEMP diagnostic + its suite | **No conflict.** Zero table overlap, zero file overlap. This round touched no S1 file (§21) |
| **F1-7J S1–S5 surface migrations** (S1 = SKU Handbook, S2 = weekly line-logistics, S3 = PO-list, S4 = RO scope, S5 = IR reference lookups) | The board adds a **consumer** of `skuDetails.workspace.get` | **Aligned, not conflicting.** F1-7J-A prescribes exactly this move for `sku-regional-details.js`. The board follows the same direction |
| **F1-7J-A3** (non-workspace pages → scoped reads, incl. `campaign-risk`) | The board's B7 (`productPricing.workspace.get`) covers `campaigns` / `campaign_sku_lines` | **Complementary.** B7 should be coordinated with F1-7J-A3 so one bounded read serves both |
| **P1-A…P1-G supply-chain closed loop** | None. The board reads no forecast, gap, recommendation, allocation, PO or shipment data | **No conflict** |
| **P2-A RBAC** | The board's `owner` becomes a real FK | **Forward-compatible by design** (§13) |

The one thing to coordinate: **if F1-7J-A3 builds a `campaign-risk` bounded read first, the board
should consume it rather than adding a second one.** Same table, one owner.

---

## §21 — Isolation record for this round

- **Read-only baseline taken before any change:** branch `main`, HEAD `e9fcd27`,
  `origin/main` `e9fcd27` (confirmed against the live remote with `git ls-remote`), 0 ahead / 0 behind,
  worktree clean.
- **Isolated worktree** created at
  `…/Vibe Coding/Operation System/wt-product-strategy-board-p0` on branch
  `feature/product-strategy-board-p0`, based on `e9fcd27`.
- **`C:/km-lb` untouched** (a pre-existing worktree on another branch; `CLAUDE.md` forbids modifying it).
- **No branch switch, reset, checkout or cleanup in the mainline working tree.**
- **No S1 TEMP diagnostic file** was read into this branch's changes or modified.
- **Files created this round: 1** — this document.
- **No push, no merge, no deploy, no Apps Script sync, no DB write, no frontend or `.gs` change.**
