# Product Strategy Board — Design Freeze (P0 · updated by P0-R1, P0-R3, P0-R3-R1, P0-R3-R2, P1-B0, P1-B1, P1-B1-R1, P1-B2, P1-B2A)

**Rounds:** `PRODUCT-STRATEGY-BOARD-P0` — Discovery, Data Mapping and Design Freeze
· `PRODUCT-STRATEGY-BOARD-P0-R1` — Design Closure and Non-Runtime Visual Prototype
· `PRODUCT-STRATEGY-BOARD-P0-R2` — Interactive SKU Price-Band Prototype
· `PRODUCT-STRATEGY-BOARD-P0-R3` — Data-Contract-First Executive Report Prototype
· `PRODUCT-STRATEGY-BOARD-P0-R3-R1` — Product Image Identity Correction and Visual Acceptance
· `PRODUCT-STRATEGY-BOARD-P0-R3-R2` — Category Command Center, Image Price Markers, Five-Unit Axis
· `PRODUCT-STRATEGY-P1-B0` — Site-Scoped Data Contract + Operation System Integration Freeze (audit only)
· `PRODUCT-STRATEGY-P1-B1` — Site-Scoped Bounded Read API, implemented behind a false flag
· `PRODUCT-STRATEGY-P1-B1-R1` — Release-Identity Completion + Dynamic Category Contract
**Status:** **DESIGN CLOSED, AND THE DATA CONTRACT IS NOW FROZEN TOO.** All nine decisions are
operator-decided and applied; §23–§28 add the measured source audit, the canonical data contract, the
variant-grouping and image rules, the adapter seam and the P1-B1 handoff. Still nothing implemented in
the application.

> **THE CATEGORIES ARE THE SITE'S, AND THE RELEASE NOW SAYS WHAT IT IS (P1-B1-R1).** P1-B1 changed
> four sync-visible backend files without moving the deployment release, and five standing assertions
> said so — every one of them correctly. The release is `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R7`, `72_` is a
> **REQUIRED** manifest owner (the router already dispatches its action, so its absence is a partial
> sync and never an optional one), and this is a **deployment CANDIDATE**: nothing synced, no Web App
> version, flag still false. Category is now **discovered from the site**, never declared — the
> prototype's three are fixture data, `sku_details.category` is the authority, and the universe is the
> rows that survived membership and the status gate. §33 records all of it, including the one ordering
> constraint a release creates: **Pages must be redeployed AFTER the Apps Script sync, never before.**

> **THE CONTRACT IS BUILT, AND NOBODY CAN REACH IT (P1-B1).** `productPricing.workspace.get` exists,
> resolves the membership universe server-side, and refuses an unscoped read. `PRODUCT_STRATEGY_ENABLED_`
> is false, so it answers FEATURE_DISABLED before the spreadsheet is opened; `index.html` loads neither
> the accessor nor a nav entry. **Production visibility is zero.** `skuDetails.workspace.get` is
> unchanged — the site scope lives in the new owner precisely so the shared one did not have to grow it.
> §32 records what was built, the two decisions the implementation had to make, and the three older
> assertions that now say — correctly — that a sync-visible backend change has not been released.

> **SITE MEMBERSHIP IS A FACT, NOT AN INFERENCE (P1-B0).** A SKU is sold on a site only when
> `marketplace_skus` says so, for that exact `company + country + marketplace`. It is never inferred
> from `sku_details`, a currency, an `image_url` or a SKU naming pattern, and the membership decision
> is made SERVER-SIDE — a client filter over everything is a rendering choice, not a bound. §31
> freezes the site scope key, the six-table join map (with the regional join **corrected**: there is
> no `marketplace_sku_id` on `sku_regional_details`), the missing-regional and missing-pricing
> behaviour, the response contract, the two read owners, the Operation System integration and the
> feature-flag contract. **Nothing in §31 is implemented.**

> **CATEGORY IS A CORRECTNESS RULE, NOT A FILTER (P0-R3-R2).** `sku_details.category` is now the
> FIRST scope. Two categories never share a price axis, and no gap, overlap or cannibalisation is
> ever computed across one — a step between an electric can opener and a spatula is not an
> opportunity, because they are not alternatives. The cross-category view is cards and a table.
> §30 records the command-center shell, the five-unit axis and the image price markers.

> **IMAGES RESTORED ON NEW EVIDENCE (P0-R3-R2).** Seven photographs are back, on evidence class E —
> the operator's per-SKU statement of the `image_url` on the live `sku_details` row, plus a check
> that the named file exists at that exact path. P0-R3-R1's finding is unchanged: nothing in the
> REPOSITORY binds a file to a SKU. What changed is the witness. A real photograph still does not
> make a price real, and every row keeps `identity_source` and `price_source` apart.

> **CORRECTION OF RECORD (P0-R3-R1).** P0-R3 shipped seven product photographs on the strength of a
> filename that matches a SKU plus a shipped mention of that SKU. That pair corroborates the **SKU**;
> it says nothing about the **bytes**. Nothing in the repository binds any file under
> `assets/img/products/` to any SKU, so all seven were reclassified UNVERIFIED and **removed**. The
> prototype now ships **zero** product images and states the absence on every card. §26 is rewritten
> with the evidence standard, the probes and a row per file; §29 records the correction.

> **CORRECTION OF RECORD (P0-R3).** Every SKU, price, deal and warning shown in the P0-R2 prototype was
> **mock data**. It was not connected to `sku_details`, `marketplace_skus`, `sku_regional_details`,
> `pricing_list`, `campaigns` or `campaign_sku_lines`, and **no gap, overlap or cannibalisation on that
> screen was a conclusion about Kitchen Mama's products**. The prototype now says so permanently, on
> every screen, and every finding it renders is tagged as a demonstration.
**Base commit:** `e9fcd27` (`origin/main` at the time this branch was cut)
**Branch:** `feature/product-strategy-board-p0` (isolated git worktree)
**Scope of P0:** this document. **Scope of P0-R1:** this document + a non-runtime static prototype under
`docs/prototypes/product-strategy-board/` (§22). **Scope of P0-R2:** that prototype made interactive — a
real X/Y price band, a multi-select SKU selector, working filters and live gap/overlap/cannibalisation
arithmetic. **Scope of P0-R3:** a measured audit of the six real source tables (§23), a frozen
`ProductStrategyDataContract` (§24), the variant-grouping and image contracts (§25, §26), a data adapter
seam with the Operation DB adapter defined-and-disabled (§27), the P1-B1 handoff (§28), and the prototype
rebuilt as an executive report on top of that contract with 285 automated DOM assertions. In all four
rounds: no page, no table, no API, no `.gs` change, no deployment, and **no live data**.
**Scope of P0-R3-R1:** a re-audit of the seven copied product photographs against a real
image-to-SKU identity standard (§26, rewritten), their removal, the frozen live image behaviour
(one authority, two failure states, no fallback of any kind), a report-grade missing-image state,
a manual visual acceptance package, and 312 automated DOM assertions. Nothing else in P0-R3
changed.
**Scope of P0-R3-R2:** category as the first scope with its own authority and ladder (§30.2), a
professional sidebar shell with six destinations and an icon rail, a cross-category overview that
draws no shared axis, a per-category analysis page with a product comparison table, a Y axis fixed
at five currency units per gridline (§30.3), product photographs as the everyday-price marker
(§30.4), and seven images restored on evidence class E (§30.5). 222 automated DOM assertions.

> **What "design freeze" means here.** Every table, column, action name and component named below was
> read out of shipped source in this repository, and the file and line it came from is cited. Where a
> field the product needs does **not** exist, it is recorded as a **GAP** with no invented mapping.
> Where two authorities in the repo disagree, both are quoted and the divergence is named rather than
> reconciled by preference.

> **What P0-R1 changed.** P0 ended with nine open decisions (§19) and five defaults. The operator has now
> decided all nine, and **six of the nine went against the P0 default**. This document is not P0 with a
> decision log appended — the affected sections were rewritten so that no superseded default survives
> anywhere in the text. The nine decisions and where each one landed:
>
> | # | Decision | vs. P0 default | Sections rewritten |
> |---|---|---|---|
> | **D-1** | New top-level `Product Strategy` nav group. **Never** under *Pricing Center* (which is logistics cost) | same, now binding | §11.1, §16 |
> | **D-2** | Band price source is **`pricing_list.regular_price`**; absent ⇒ `SOURCE_MISSING`. **No fallback** to `sku_details.selling_price` | same + a new prohibition | §9.1, §9.3, §15 |
> | **D-3** | P1 supports **only** `AS_QUOTED_SINGLE_CURRENCY`; other currencies **split into separate bands**, never converted, never on a shared axis | **CHANGED** — split, not just refuse | §9.4, §11.2 |
> | **D-4** | **`DEAL_PLAN` enters the P1 MVP** as `PROPOSAL_ONLY` | **CHANGED** — was deferred to P2 | §2, §7, §10, §17, §18 |
> | **D-5** | P1 **must not** use the legacy 44-tab `getOperationDb`. Bounded reads land **in B1**, before the price band | **CHANGED** — was "accept the legacy read" | §12.3, §17, §16 |
> | **D-6** | Current selling price is **not displayed** until its source is settled. No substitute may stand in for it | same + a named prohibition | §9.1, §15 |
> | **D-7** | **A third table, `product_strategy_board_revisions`, ships in P1** | **CHANGED** — was deferred to P2 | §6.3, §6.4, §8.6, §16, §17 |
> | **D-8** | `margin` waits for a real cost source. **No margin may be estimated from a selling price** | same + a named prohibition | §9.1, §15 |
> | **D-9** | `owner` is **provenance, not access control**; no "Private"/"Secure" wording; the production feature ships **disabled**; enablement needs a separate authorization/security gate | **CHANGED** — "accept and say so" was not enough | §13, §16, §17, §18 |

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
| 1 | Board CRUD + durable **server** persistence | Without this it is not a record, it is a browser cache (§3.7) |
| 2 | **Bounded, scoped source reads** — no legacy 44-tab read | **D-5.** The board's first act is a read; if that read is the full-DB read, every later batch inherits it (§12.3) |
| 3 | `product_strategy_board_revisions` | **D-7.** History UI can wait; the history *data* cannot, because a checkpoint not written at v1 is not recoverable later (§6.3) |
| 4 | `TEXT_NOTE` element | The whole short-term purpose: positioning, target price, Deal price, reasoning, risk, to-do |
| 5 | `SKU_CARD` element (master-SKU grain) | Series, product name, price fields all live at this grain |
| 6 | `REGIONAL_SKU_CARD` element (company/country/marketplace/sku grain) | Site SKU / ASIN / site status / site currency price |
| 7 | `SERIES_PRICE_BAND` element | The price-band overview — the first-priority screen |
| 8 | **`DEAL_PLAN` element, `PROPOSAL_ONLY`** | **D-4.** Deal layout is half of the first-priority use case. It ships as a *proposal* with no write path to `campaigns` / `campaign_sku_lines` / `pricing_list` (§10) |
| 9 | `MATRIX` element (2-D, fixed grid) | Price × Tier, Price × Feature, Series × Band |
| 10 | LIVE_REFERENCE / FROZEN_SNAPSHOT modes | §8 — decision evidence must not be rewritten by later master-data edits |
| 11 | Initial template: **SKU Series Price Architecture Board** | Gives the board a reason to exist on first open |

### Deferred (P2+), and the reason

| Element / feature | Deferred because |
|---|---|
| `CHART` | Chart.js is already available (§3.7) but every chart needs an agreed metric, and §9.1 shows the price series is incomplete: **no current selling price (D-6), no margin (D-8), no effective date**. A chart over a GAP is a confident wrong picture. |
| `GROUP` | Pure UI convenience; the matrix covers the grouping need in P1. |
| `CONNECTOR` | The existing canvas already has arrow anchors (§3.7) so this is cheap, but connectors have no analytical meaning for a price band. |
| **History UI** (diff + restore) | **The `revisions` table itself is P1 (D-7)**; only the *screen* that diffs and restores is deferred. The data is written from the first version, so the UI can be built later against real history rather than against an empty table. |
| Infinite canvas, multi-user live cursors | Explicitly out of scope per the round brief. Fixed grid + module cards in v1. |
| Board-level access control | There is **no user identity and no RBAC** in this system (§13). `owner` is provenance, and P1 says so in the UI rather than implying otherwise — **D-9**. |
| Cross-currency comparison on one axis | **D-3.** P1 splits by currency instead. No FX policy is decided here, and none is inferred (§9.4). |
| `DEAL_PLAN` → real campaign lines | **D-4** admits the element, not the write. Promoting a proposal into `campaign_sku_lines` is a separate authorized flow this design does not create (§10). |
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
- Every read the board needs **does** already resolve through
  `KM.DB.getSkuDetails / getMarketplaceSkus / getPricingList / getCampaigns / getCampaignSkuLines`
  — but only at the cost of the legacy 44-tab `getOperationDb` read.
  **P0 read that as "zero backend work for reads" and recommended taking it. D-5 refused it**
  (§12.3): three of the six tables already have a scoped owner the board reuses unchanged, the other
  three have no owner at all, and building that owner is B1 work rather than a later optional batch.
  So the reads are *available*, and they are **not** the P1 read path.

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
| **Official** Deal / promo price | `campaign_sku_lines.promo_price` (inside a `campaigns` row) | **Read only** |
| Board layout, notes, positioning, target price, strategy reasoning, risk, to-dos | **`product_strategy_board_elements`** (new, board-owned) | **Owns** |
| **A *proposed* deal (price, window, reason, risk) that is not yet a campaign** | **`content_json` on a `DEAL_PLAN` element** (new, board-owned) | **Owns — and it is a proposal, never a Deal (§10)** |
| Snapshot of displayed source values at decision time | **`snapshot_json` on the element** (new) | **Owns** |
| Board checkpoints, freezes and pre-restore states | **`product_strategy_board_revisions`** (new, board-owned — **D-7**) | **Owns** |

**The boundary, stated as a rule the implementation must enforce (§15.4):**
the board **never writes** to `sku_details`, `marketplace_skus`, `sku_regional_details`,
`pricing_list`, `pricing_change_log`, `campaigns` or `campaign_sku_lines`. A board element that holds
a "target price" or a `DEAL_PLAN` holds a *proposal*, in board-owned storage, with no path to the
pricing or campaign tables. Promoting a board proposal into `pricing_list` or `campaign_sku_lines`
would be a separate, explicitly authorized flow that this design does **not** create.

**Why this matters more than usual here.** `pricing_list` is described in the roadmap as
*"the only source of truth for Regular Price / Minimum Price / MSRP / Currency"* and
*"Any page requiring pricing data must read from `pricing_list`"*
(`SYSTEM_ROADMAP.md` §3.5-1b). A board that stored its own prices would become a second pricing
authority — the exact thing that rule exists to prevent. **D-4 admits `DEAL_PLAN` into P1 precisely
because the element is defined so that it cannot become that second authority**: it stores
`proposed_*` fields under names that can never be mistaken for the official columns (§7.4).

---

## §6 — Proposed board schema

**Three tables** — two owned by the live board, one by its history. The third is new in P0-R1 (**D-7**).

### 6.1 `product_strategy_boards`

| Column | Type | Notes |
|---|---|---|
| `board_id` | string, PK | `PSB-` + 8 uppercase hex. **Deterministic derivation, not `Utilities.getUuid()`** — §6.5 |
| `board_name` | string | Required |
| `board_type` | enum | `SERIES_PRICE_ARCHITECTURE` \| `FREEFORM` (P1: two values only) |
| `owner` | string | **Client-asserted provenance, same contract as `created_by`. NOT access control** (§13, D-9) |
| `status` | enum | `DRAFT` \| `ACTIVE` \| `ARCHIVED` |
| `created_by` | string | Client-asserted (§13) |
| `created_at` | datetime | |
| `updated_by` | string | Client-asserted (§13) |
| `updated_at` | datetime | |
| `version` | integer | Monotonic; incremented on every accepted write. Optimistic-concurrency token (§15.3) |

### 6.2 `product_strategy_board_elements`

**The canonical column list. Twenty columns, in this order.** P0 carried `author_type` inside
`content_json`; **P0-R1 promotes it to a real column**, because a field the handler must enforce
(§14: an AI write may never update a `HUMAN` element in place) cannot live inside an opaque JSON
string the handler does not parse.

| # | Column | Type | Notes |
|---|---|---|---|
| 1 | `element_id` | string, PK | `PSE-` + 8 uppercase hex, derived (§6.5) |
| 2 | `board_id` | string, FK | → `product_strategy_boards.board_id` |
| 3 | `element_type` | enum | §7.1 |
| 4 | `position_x` | number | Board coordinates (grid units in P1) |
| 5 | `position_y` | number | |
| 6 | `width` | number | |
| 7 | `height` | number | |
| 8 | `z_index` | integer | |
| 9 | `source_type` | enum | `NONE` \| `SKU` \| `REGIONAL_SKU` \| `SERIES` \| `PRICING` \| `CAMPAIGN_SKU_LINE` |
| 10 | `source_identity` | string | The **official** identity, verbatim, in a documented shape (§7.2) |
| 11 | `source_mode` | enum | `LIVE_REFERENCE` \| `FROZEN_SNAPSHOT` (§8) |
| 12 | `snapshot_json` | JSON string | Populated **only** when `source_mode = FROZEN_SNAPSHOT`; carries `captured_at` |
| 13 | `content_json` | JSON string | Human-authored content + per-type config (§7) |
| 14 | `author_type` | enum | **`HUMAN` \| `AI`. A real column, NOT a `content_json` key.** P1 writes the literal `HUMAN` on every row |
| 15 | `created_by` | string | Client-asserted (§13) |
| 16 | `created_at` | datetime | |
| 17 | `updated_by` | string | Client-asserted (§13) |
| 18 | `updated_at` | datetime | |
| 19 | `version` | integer | Per-element monotonic |
| 20 | `deleted` | boolean | Soft delete (§12.1). No row is removed and no id is ever reused |

**`author_type` is written, never defaulted.** The value `HUMAN` is stored explicitly on every P1 row.
A blank `author_type` is **not** `HUMAN` — it is an unclassified row, and the handler must reject a
write that omits it (`AUTHOR_TYPE_REQUIRED`). The reason is §14: the AI seam distinguishes AI content
*by the presence of a value*, and a scheme where "blank means human" cannot tell an AI row written by
an older build from a human row at all. **A blank is a third state, never a synonym for the default.**

### 6.3 `product_strategy_board_revisions` — new in P0-R1 (**D-7**)

| Column | Type | Notes |
|---|---|---|
| `revision_id` | string, PK | `PSR-` + 8 uppercase hex, derived (§6.5) |
| `board_id` | string, FK | → `product_strategy_boards.board_id` |
| `board_version` | integer | The board `version` this revision captures — the join back to §6.1 |
| `revision_type` | enum | `SAVE_CHECKPOINT` \| `FREEZE_SNAPSHOT` \| `PRE_RESTORE` \| `PRE_AI_WRITE` |
| `snapshot_json` | JSON string | The board row + **all** its element rows at that moment |
| `created_by` | string | Client-asserted (§13) |
| `created_at` | datetime | |
| `author_type` | enum | `HUMAN` \| `AI` — who caused the revision. P1 writes `HUMAN` explicitly |
| `idempotency_key` | string | The key the command carried. **Stored**, so a retry is provably the same revision (§6.5) |

**A revision is created on exactly four events, and on nothing else:**

| Event | `revision_type` | Why it earns a row |
|---|---|---|
| The user presses **Save checkpoint** | `SAVE_CHECKPOINT` | An explicit human statement that this state is worth returning to |
| An element is **frozen** (`LIVE_REFERENCE` → `FROZEN_SNAPSHOT`), or re-frozen | `FREEZE_SNAPSHOT` | The freeze *is* the decision evidence (§8.2); the board state around it is part of that evidence |
| **Before** a restore is applied | `PRE_RESTORE` | A restore that cannot itself be undone is a delete with a friendly name |
| **Before** any future AI write | `PRE_AI_WRITE` | §14 requires it. Reserved in P1; no AI writes anything |

**Explicitly NOT revision events:** drag, resize, pan, zoom, selection, z-order change, panel toggle,
filter change, or any autosave of geometry. A canvas produces hundreds of these per session; one row
each would make the table larger than the board and the checkpoints impossible to find.

**Deliberate P1 asymmetry.** P1 **writes** revisions and **lists** them (id, type, version, who, when).
It does **not** ship diff or restore UI (§2, deferred). This is not a half-built feature — it is the
one ordering that cannot be reversed later: a restore screen can be built at any time against history
that exists, and cannot be built at all against history that was never written.

### 6.4 What is deliberately NOT created

- **No `board_links` table.** Connectors are deferred (§2), and when they arrive a `CONNECTOR`
  element with two ids in `content_json` costs one row and no new table.
- **No AI table.** §14 is a seam, not a schema. `PRE_AI_WRITE` is a reserved enum value, not a feature.
- **No `board_permissions` / `board_shares` table.** There is no identity to key it on (§13, D-9).
  Inventing one would produce a table that looks like access control and enforces nothing.
- ~~No `board_history` table in P1~~ — **superseded by D-7.** P0 argued that `version` + `updated_at`
  answers "which version am I looking at", which is true and is also not the question. The question a
  strategy record has to answer is *"what did we decide, and what did the board look like when we
  decided it"*, and `version` alone cannot answer it once the row has moved on. §6.3 ships in P1.

### 6.5 Id derivation, and the idempotency contract for all three tables

`21_factory_inventory_handlers.gs` mints operational ids with
`Utilities.getUuid().replace(/-/g,'').substring(0,8)`, and that is correct for a row that can only be
created once. But `71_api_v1_factory_stock_guard.gs:574` mints its audit id as
`'FSOA-' + KMFSG.fnv1a(<natural key>).toUpperCase()` — a deterministic hash of a natural key, which is
the shipped precedent for **anything a retry can reach twice**.

Board writes go through `km-data-access.js`, where a command **must** carry an idempotency key
(`IDEMPOTENCY_KEY_REQUIRED`, `km-data-access.js:227` and `:305`). A retried write must therefore
resolve to the **same** id or one gesture produces two rows. P0 specified this for `element_id` and
left `board_id` half-stated; **P0-R1 states all three, plus what the handler does on replay:**

```
board_id    = 'PSB-' + fnv1a('PSB|' + board_name + '|' + idempotency_key).toUpperCase()
element_id  = 'PSE-' + fnv1a('PSE|' + board_id   + '|' + idempotency_key).toUpperCase()
revision_id = 'PSR-' + fnv1a('PSR|' + board_id   + '|' + revision_type + '|' + idempotency_key).toUpperCase()
```

`fnv1a` returns `('00000000' + h.toString(16)).slice(-8)` — always 8 zero-padded hex characters — so
the shape is byte-identical to the `FSMV-` / `FSOA-` family already in the database.

**`created_at` is deliberately NOT part of the `board_id` key.** P0's draft included it, and that was a
defect: the server clock differs between the original call and the retry, so a retried create would
derive a *different* `board_id` and produce a second board — the exact failure the derivation exists to
prevent. **A deterministic key may contain only values the client sends and resends unchanged.**

**The replay contract, for each table:**

| Situation | Handler behaviour |
|---|---|
| Derived id does not exist | Insert. Return `{ id, version: 1, applied: true, replayed: false }` |
| Derived id exists, payload identical | **Write nothing.** Return `{ id, version: <current>, applied: false, replayed: true }` |
| Derived id exists, payload differs | This is an **edit**, and it must carry `expected_version`. Version match → apply; mismatch → `BOARD_VERSION_CONFLICT`, write nothing (§15.3) |
| `idempotency_key` absent | Refuse before deriving anything: `IDEMPOTENCY_KEY_REQUIRED`. Zero writes |

`product_strategy_board_revisions.idempotency_key` is **stored on the row**, not merely consumed to
derive the id, so a replay can be *proven* rather than inferred from an id collision.

---

## §7 — Element contracts

### 7.1 The nine types

| `element_type` | P1? | `source_type` | What `content_json` carries |
|---|---|---|---|
| `TEXT_NOTE` | **Yes** | `NONE` | `{ text, title?, colour?, tags[] }` |
| `SKU_CARD` | **Yes** | `SKU` | `{ shown_fields[], note? }` |
| `REGIONAL_SKU_CARD` | **Yes** | `REGIONAL_SKU` | `{ shown_fields[], note? }` |
| `SERIES_PRICE_BAND` | **Yes** | `SERIES` | `{ price_basis, currency_basis, gap_threshold, members[], annotations[] }` (§9) |
| **`DEAL_PLAN`** | **Yes — `PROPOSAL_ONLY` (D-4)** | `NONE` \| `CAMPAIGN_SKU_LINE` | §7.4 — a fixed, closed field list, every price and date key prefixed `proposed_` |
| `MATRIX` | **Yes** | `NONE` | `{ x_axis, y_axis, cells[] }` where a cell references an `element_id` |
| `CHART` | No (P2) | `NONE` \| `SERIES` | `{ chart_type, metric, series[] }` — blocked by the §9.1 gaps |
| `GROUP` | No (P2) | `NONE` | `{ member_element_ids[] }` |
| `CONNECTOR` | No (P2) | `NONE` | `{ from_element_id, to_element_id, style }` |

`author_type` is **not** in this table any more — it is column 14 of the element row (§6.2).

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
source_type = NONE               → ""   (the empty string; never null, never absent)
```

`REGIONAL_SKU` deliberately keeps the four-part scope key rather than `regional_detail_id`, because
the board resolves **two** tables at that grain — `sku_regional_details` *and*
`marketplace_skus` (for status, §4.5) — and only the scope key addresses both.

### 7.3 Refusal contract per element
Every element renders one of exactly four resolution states, and they are never collapsed:
`RESOLVED` · `SOURCE_MISSING` · `SOURCE_INACTIVE` · `UNRESOLVABLE` (§15).

### 7.4 `DEAL_PLAN` — the P1 element, and its closed field list (**D-4**)

A `DEAL_PLAN` element stores **exactly** these keys in `content_json`, and the handler rejects any
other key (`DEAL_PLAN_UNKNOWN_FIELD`). A closed list is what keeps the element a proposal: an open
object drifts into a price store the first time somebody adds a key named `promo_price`.

| Key | Type | Notes |
|---|---|---|
| `proposed_regular_price` | number \| null | A proposal. Never written to `pricing_list.regular_price` |
| `proposed_deal_price` | number \| null | A proposal. Never written to `campaign_sku_lines.promo_price` |
| `currency` | string \| null | As quoted. **No conversion** (D-3) |
| `proposed_start_date` | date \| null | A proposal. Never written to `campaigns.start_date` |
| `proposed_end_date` | date \| null | A proposal. Never written to `campaigns.end_date` |
| `strategy_reason` | string | Free text |
| `expected_effect` | string | Free text |
| `cannibalization_risk` | string | Free text. The §9.3 arithmetic *flags* cannibalisation; this is the human's reading of it |
| `note` | string | Free text |
| `source_campaign_reference` | string \| null | **May be empty.** When set it is a `campaign_id` or a `campaign_sku_line_id`, and it is a **read** reference — a link to what exists, not a claim to have written it |

**Every price and date key is prefixed `proposed_`, and that is a design device, not a naming style.**
The four official columns are `campaign_sku_lines.promo_price`, `campaign_sku_lines.regular_price`,
`campaigns.start_date` and `campaigns.end_date`. Because no key on this element shares a name with any
of them, a copy-paste from proposal to writer cannot silently line up, and a grep for an official
column name never lands inside board-owned content.

**What a `DEAL_PLAN` may not do — the prohibition list, enforced structurally (§8.5, §15.4):**

1. It may **not** write `campaigns` or `campaign_sku_lines`. The board handler has no such action.
2. It may **not** write `pricing_list` (or `pricing_change_log`).
3. It may **not** claim a Deal exists. The element renders a permanent, non-dismissible
   **`PROPOSAL ONLY`** marker, and its resolved-campaign section is visually and textually separate
   from its proposal section.
4. It may **not** be the answer to "what is the deal price". `campaign_sku_lines.promo_price` is, and
   when a `DEAL_PLAN` carries `source_campaign_reference`, the element shows the **official** price
   read from that line *beside* the proposal, labelled as the official one — the two are never merged,
   never averaged, and never drawn on one marker.
5. Absence of an official price renders `SOURCE_MISSING`, **never** "no deal", and never the proposal
   promoted into the official value's place (§10).
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
| `FROZEN_SNAPSHOT` | Shows the snapshot, **always**, with `captured_at` visible | Shows a **side-by-side diff** (snapshot vs live) and requires an explicit user action to re-freeze. Re-freezing **increments `snapshot_version`**, writes a new `captured_at`, and writes a `FREEZE_SNAPSHOT` revision (§8.6) |

A silent re-freeze is prohibited: it would destroy the only copy of the decision evidence while
appearing to be a refresh.

### 8.4 Source missing / deleted / inactive — three different answers

| Situation | Detection | `LIVE_REFERENCE` | `FROZEN_SNAPSHOT` |
|---|---|---|---|
| **Missing** — identity resolves to no row | no matching row | `SOURCE_MISSING`, identity shown, no value invented | Snapshot still renders, badged *"source no longer present"* |
| **Inactive** — row exists, `marketplace_sku_status` ∈ `inactive`/`discontinued`, or `lifecycle` = `Closure` | vocabulary from `00_config.gs:9-12` | `SOURCE_INACTIVE` + current values | Snapshot renders + inactive badge |
| **Unreadable** — the read itself failed | transport / envelope error | `UNRESOLVABLE`, and it is **not** shown as missing | Snapshot renders (it needs no read) |

The third row is the one that matters: **a failed read and an absent row are different facts.** An
element that shows "no price" because a request timed out has told the operator something false.

### 8.5 The no-reverse-write boundary
- The board's write actions accept `board_id` / `element_id` / `revision_id` **only**. There is no code
  path from a board write to a source table, because the handler has no such action to call.
- `snapshot_json` is write-once-per-freeze and is never read back into any source write.
- A `DEAL_PLAN`'s `proposed_*` fields have no writer anywhere in the system (§7.4).
- **Testable claim (§18):** the board handler's source contains no reference to `sku_details`,
  `marketplace_skus`, `sku_regional_details`, `pricing_list`, `pricing_change_log`, `campaigns` or
  `campaign_sku_lines` as a **write** target — asserted on the source text, not promised in prose.

### 8.6 Revision events — how the lifecycle and the history table meet (**D-7**)

The freeze lifecycle and the revision table are one mechanism, not two. Every freeze is a decision, and
a decision that leaves no board-level record is only half-recorded.

| Lifecycle action | Element write | Revision write | Order |
|---|---|---|---|
| Create / move / resize / edit an element | yes | **no** | — |
| Save checkpoint | no (geometry already saved) | `SAVE_CHECKPOINT` | — |
| Freeze `LIVE_REFERENCE` → `FROZEN_SNAPSHOT` | yes (`snapshot_json`) | `FREEZE_SNAPSHOT` | **revision first, then the element write** |
| Re-freeze (`snapshot_version` + 1) | yes | `FREEZE_SNAPSHOT` | **revision first** |
| Restore (P2 UI; the data path exists in P1) | yes | `PRE_RESTORE` | **revision first** |
| Future AI write (§14) | yes | `PRE_AI_WRITE` | **revision first** |

**The revision is always written before the change it precedes.** Writing it afterwards records the
state that already includes the change, which is the one state a restore does not need.

**If the revision write fails, the change does not happen.** The pair is refused as a unit
(`REVISION_WRITE_FAILED`, zero writes) rather than applying the change and losing its checkpoint — a
freeze whose revision is missing is exactly the case the table exists to prevent.

---

## §9 — Price-band calculation and display rules

### 9.1 The available price fields, the gaps, and the three decisions that closed them

| Requested concept | Field that exists | Where | Verdict |
|---|---|---|---|
| **Band basis / normal selling price** | **`pricing_list.regular_price`** | `04_…:152` | **DECIDED — D-2.** The one and only band basis. Absent ⇒ `SOURCE_MISSING`, and **no fallback** |
| MSRP / List price | `pricing_list.msrp` (site), `sku_details.msrp` (+ `msrp_unit`, master base) | `04_…:152`, `sku-details.js:2369` | **OK — two levels, each labelled with its own** |
| **Current selling price** | — | — | **GAP — NOT DISPLAYED IN P1 (D-6).** No column carries it, and none of `regular_price`, `selling_price` or `promo_price` may stand in for it |
| Planned deal price (official) | `campaign_sku_lines.promo_price` | `20_…:41` | **OK, campaign-scoped only** (§10) |
| Planned deal price (proposal) | **board-owned** `proposed_deal_price` | §7.4 | **OK — and it is never the official one (D-4)** |
| Floor / minimum price | `pricing_list.minimum_price`; `sku_details.minimum_price` (+ `minimum_price_unit`) | `04_…:152` | **OK — two levels** |
| **Margin** | — | — | **GAP — OUT OF SCOPE IN P1 (D-8).** No `margin`, `margin_percent` or `gross_margin` column exists anywhere in the Apps Script tree (measured). **No margin may be estimated from a selling price** |
| Currency | `pricing_list.currency` (site), `pricing_list.base_currency`, `campaign_sku_lines.price_units`, and the master `*_unit` trio | `04_…:152`, `20_…:42` | **OK — four different currency carriers, see 9.4** |
| Effective date | — | — | **GAP — AND IT IS DELIBERATE.** See 9.2 |
| Data source | `pricing_list.price_source` (`auto_fx` / `manual_override` / `import`) + `price_status` | `PRICING_DATABASE_MAPPING.md` §4 | **OK** |
| `captured_at` | — | — | **GAP in the source; board-owned** (§8.2) |

**D-2 — the band basis, and the fallback that is now prohibited.**
`SERIES_PRICE_BAND.price_basis` has exactly one P1 value: **`PRICING_LIST_REGULAR_PRICE`**.
When a member has no `pricing_list.regular_price`, the member renders `SOURCE_MISSING` and is **plotted
nowhere**. It is **not** back-filled from `sku_details.selling_price`.

The reason is a category difference, not a preference. `sku_details.selling_price` is a **master base
input**: the importer reads it into `pricing_list.base_regular_price` and derives the site price from it
with `fx_rate` (`04_…:54-56`, `:344`). So `selling_price` is upstream of the number the band is about.
Substituting it would draw a point that looks like a site price, is not one, and is indistinguishable
on the chart from a real one. **A missing point is a fact; a substituted point is a fabrication that
renders identically to a measurement.**

**D-6 — "current selling price" is not displayed, and no field is promoted into its place.**
The concept is real and the column is not. The three candidates each mean something else:
`pricing_list.regular_price` is the *set* site price, `sku_details.selling_price` is the master base
input, and `campaign_sku_lines.promo_price` is a *campaign* price with a window. Labelling any of them
"current selling price" would make the board assert something no table says. P1 therefore does not show
the field at all — not blank, not zero, not a substitute. Where it is settled, it lands as a new
labelled field; that source question remains open (§19, Q-1).

**D-8 — margin is out of scope, and may not be estimated.**
There is no cost column anywhere in this layer, so any margin the board displayed would be derived from
prices alone — i.e. a made-up cost. Margin waits for the planned Cost & Pricing DB
(`SYSTEM_ROADMAP.md` §3.5-4). **Prohibited in P1:** any percentage, ratio or "margin-like" figure
computed from `regular_price`, `msrp`, `minimum_price`, `promo_price` or a `proposed_*` price. A
discount percentage between two *prices* is permitted and must be labelled *discount*, never *margin* —
they differ by exactly the cost that does not exist.

### 9.2 The effective-date gap is an architectural decision, not an omission

`SYSTEM_ROADMAP.md` §3.5-1b states:

> **Future Promotion Pricing:** time-bounded promotion pricing should use `pricing_campaigns` or
> `promotion_prices` — **NOT** `effective_from` / `effective_to` columns in `pricing_list`.

Measured consistency: `effective_from` appears 19 times and `effective_date` once across the Apps
Script tree, and **every one of them is carrier, tax, party-authority, document-template or
warehouse-config** — never pricing.

**Therefore this design does not propose adding an effective date to `pricing_list`, and the board must
not synthesise one.** Time-bounded price information in P1 comes from the campaign window
(`campaigns.start_date` / `end_date`), which is the repo's own answer to the question. A `DEAL_PLAN`'s
`proposed_start_date` / `proposed_end_date` are a *proposal's* window and are never presented as an
effective date of any price on record (§7.4).

### 9.3 Price-band visual — what P1 renders

1. **Horizontal price axis per Series, per currency.** Domain from the members' own values; no fixed
   scale. One axis serves exactly one currency (9.4).
2. **One point (or a low–high range) per SKU** at `price_basis = PRICING_LIST_REGULAR_PRICE` (D-2),
   carrying `sku`, `product_name`, and — for a regional card — `company|country|marketplace`.
3. **Normal vs Deal are visually distinct.** `regular_price` is the primary marker;
   `campaign_sku_lines.promo_price` is a secondary marker with the campaign window in the tooltip; a
   board `proposed_deal_price` is a **third, explicitly provisional** marker (dashed, labelled
   `PROPOSAL`). The three are never averaged and never drawn on one marker.
4. **Gap and overlap marking, defined arithmetically** so the picture is checkable:
   - sort members ascending by basis price;
   - **overlap** = two members whose `[promo_price, regular_price]` intervals intersect;
   - **gap** = adjacent members whose price distance exceeds a **user-set threshold** stored in
     `content_json.gap_threshold`. There is no repo-derived "correct" band width, so the threshold is
     an input and is **displayed next to every finding it produced**. A gap marking whose threshold is
     invisible is an opinion presented as a measurement.
   - **Cannibalisation flag** = member A's deal price ≤ member B's `regular_price` where B sits below A
     in the normal-price order. Flagged, counted, never auto-resolved. **A flag computed from a
     `proposed_deal_price` is labelled as proposal-driven**, so a warning caused by an idea is never
     read as a warning caused by a live campaign.
   - **EVERY PRICE COMPARISON IS PERFORMED IN INTEGER CENTS, never on binary floats.** Not a style
     preference — a correctness rule, and the §22 prototype demonstrated why before any of this was
     built. `32.99 - 24.99` evaluates to `8.000000000000004` in IEEE-754, so a step **exactly equal**
     to a threshold of `8.00` satisfies `distance > threshold` and is reported as a gap; the finding
     then renders through two decimals as *"gap 8.00 exceeds threshold 8.00"* — a measurement that
     refutes itself on screen, and the one kind of error a checkable picture must not contain. The
     rule applies to the gap test, the overlap-interval test and the cannibalisation test alike, and
     it is an acceptance criterion (§18, B5).
5. **Entry / core / premium** are **positions in the sorted list**, computed and labelled as such
   (lowest / median band / highest), **not** read from any column — no tier column exists (§3.5).
   A human can override the label per member; the override is board-owned content.
6. **Members that resolve to `SOURCE_MISSING` are listed, not plotted**, with the reason, immediately
   under the axis. A Series where four of nine SKUs have no `regular_price` must not look like a
   five-SKU Series.

### 9.4 Currency — P1 splits, it does not convert (**D-3**)

Four different currency carriers exist (9.1). They are not interchangeable:
`pricing_list.currency` is the site currency, `base_currency` is the master basis,
`campaign_sku_lines.price_units` is *"a display/audit currency snapshot only — NOT … an FX rate"*
(`20_…:38`), and the master trio (`minimum_price_unit`, `msrp_unit`, `selling_unit`) is a third level.

**The P1 rule, decided:**

- `SERIES_PRICE_BAND.currency_basis` has exactly one permitted value: **`AS_QUOTED_SINGLE_CURRENCY`**.
- If the members resolve to **more than one** currency, the element **splits into one band track per
  currency**, each with **its own axis and its own domain**, ordered by currency code. Every track is
  labelled with its currency. **No shared axis is drawn under any circumstance.**
- The element additionally renders **`MIXED_CURRENCY_COMPARISON_REFUSED`** — as a visible, permanent
  statement on the element, alongside the split tracks. It is not an error state and does not replace
  the tracks: the split is what the operator gets, and the refusal is why they are not one picture.
- **No conversion is performed.** `pricing_list.fx_rate` and `fx_rate_date` exist and are **displayed
  when present**, as source facts on the member. They are **not** applied.
- Entry / core / premium positions, gaps, overlaps and cannibalisation flags are computed
  **within a single currency track only**, never across tracks. A cross-track comparison is not a
  wrong number, it is a meaningless one.
- **P0 decided no FX policy and P1 implements none.** A base-currency view is a later decision, and
  the only remaining question — *which* FX source would be authoritative if one is ever wanted —
  is recorded at §19 Q-2.

---

## §10 — Deal planning boundaries

**`DEAL_PLAN` is in the P1 MVP, as `PROPOSAL_ONLY` (D-4).** P0 deferred it to P2 for a real reason —
an unbound Deal element becomes a second promo-price store the moment somebody treats it as one — and
that reason is answered by *how the element is defined* (§7.4) rather than by leaving it out. Deal
layout is half of the first-priority use case; a price-band board that cannot record a proposed deal
cannot do the job it exists for.

- **The only authoritative Deal price is `campaign_sku_lines.promo_price`, inside a `campaigns` row.**
  An official Deal price always has a scope (`company|country|marketplace`), a window
  (`start_date`/`end_date`) and a campaign identity.
- **The board reads it. The board never writes it.** No board element and no board action writes
  `promo_price`, `discount_percent`, `regular_price` or `price_units` into `campaign_sku_lines`, nor any
  column of `campaigns`, nor any column of `pricing_list`. The handler exposes no action that could.
- **A `DEAL_PLAN` is a proposal, and it says so permanently.** Its keys are all `proposed_*` or free
  text (§7.4); it carries a non-dismissible `PROPOSAL ONLY` marker; and it never claims a Deal has been
  created, scheduled, submitted or approved.
- **Where a proposal sits next to an official line**, the two are separate sections of the element with
  separate labels and separate markers on the band (§9.3.3). They are never merged into one number.
- **Promotion is out of scope, by design.** Turning a proposal into a real `campaign_sku_lines` row is a
  separate, explicitly authorized flow that this design does not create and P1 does not contain. There
  is no button, no action name, and no reserved router branch for it.
- **Note for the operator, unchanged from P0 and now more relevant:** `campaign_sku_lines.promo_price`
  is currently stored and has **no read surface in the UI** (§3.6 — `campaign-risk.js` reads both
  campaign tables but never these four columns). The board's price band would be the **first** place
  the Deal price becomes visible. That is a benefit and also a risk: the first reader of a column often
  discovers the column is not populated the way everyone assumed. So P1 renders `promo_price` absence as
  **`SOURCE_MISSING`, never as "no deal"** — and, with `DEAL_PLAN` now in P1, never as the proposal
  quietly filling the official value's place.
---

## §11 — UI wireframe description

### 11.1 Navigation placement — **DECIDED (D-1)**

**A new top-level sidebar group, `Product Strategy`, with one child, `Product Strategy Board`.**

**It is explicitly NOT placed under *Pricing Center*.** That group is labelled *"Pricing Center"* at
`index.html:189` while keeping the internal routing key `carrier`, and its children are *Carrier Rate
Card* (live), *Container Rate Card* (Soon) and *Warehouse Pricing* (Soon) — i.e. the group is
**logistics cost**, not retail price (§3.6). A retail price-band board placed there would put two
different meanings of the word "pricing" in one menu, and the one that is already there is the one
that does not match the name.

Also rejected: *Training Center*, where the existing Supply Chain Canvas sits (`index.html:221`) — this
board is an operational planning surface, not a teaching aid; and *SKU Management*, which is the
closest existing fit but is a grain too narrow, since the board spans SKU **+** Pricing **+** Campaign.

**Until the page exists** the repo's own convention for a designed-but-unbuilt page applies:
`menu-item menu-item--disabled` + `<span class="stage-badge">Soon</span>` (`index.html:183-185`,
`:198-204`). **And per D-9 it stays that way through B1–B6**: the nav entry is only enabled by the
separate authorization/security gate (§13), not by the batch that finishes the UI.

### 11.2 Layout

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ TOP BAR                                                                               │
│ [Board ▾ New] │ Series ▾ │ Company ▾ │ Country ▾ │ Marketplace ▾ │ [Save ✓] [History ▾]│
│                          board v12 · checkpoint 14:22 · 4 revisions · owner: vic (prov.)│
├────────────┬───────────────────────────────────────────────────┬──────────────────────┤
│ TOOLBAR    │  BOARD (fixed grid, pan / zoom / drag / resize)   │ PROPERTIES           │
│            │                                                   │                      │
│ ▭ Text     │   ┌──────────────┐   ┌──────────────────────┐     │ Element: SKU_CARD    │
│ ▣ SKU      │   │ TEXT_NOTE    │   │ SKU_CARD  CO1100-R   │     │ ─────────────────    │
│ ▤ Regional │   │ positioning… │   │ Series: Can Opener   │     │ Source               │
│ ⎯ Price    │   │ risk…        │   │ regular 39.99 USD    │     │  type  SKU           │
│   Band     │   └──────────────┘   │ msrp    49.99 USD    │     │  id    CO1100-R      │
│ ▦ Matrix   │                      │ min     29.99 USD    │     │  mode  ◉ Live        │
│ ◆ Deal     │   ┌───────────────────┴──────────────────────┐     │        ○ Snapshot    │
│   Plan     │   │ SERIES_PRICE_BAND — "Can Opener"         │     │  captured_at  —      │
│            │   │ ── USD ─────────────────────────────────  │     │ ─────────────────    │
│ ▧ Chart ⏳ │   │ 25 ──●──────●───◇────┈◇┈────●──────── 60 │     │ Notes                │
│ ⬚ Group ⏳ │   │      ▲gap 12.0  ▲overlap ▲cannibal(prop) │     │  [            ]      │
│ ↗ Conn. ⏳ │   │ ── EUR ─────────────────────────────────  │     │ ─────────────────    │
│            │   │ 22 ────●────────●──────────────────── 48 │     │ Position / Size      │
│            │   │ ⚠ MIXED_CURRENCY_COMPARISON_REFUSED      │     │ z-index              │
│            │   │ ● regular ◇ promo ┈◇┈ proposal · thr 8.00 │     │ ─────────────────    │
│            │   │ not plotted: CO1140-R SOURCE_MISSING      │     │ author_type  HUMAN   │
│            │   └──────────────────────────────────────────┘     │ version      3       │
│            │                                                    │                      │
│            │  [− 100% +] [reset]                                │                      │
└────────────┴───────────────────────────────────────────────────┴──────────────────────┘
```

Five things in that sketch are decisions rather than decoration:

1. **`Deal Plan` is an enabled tool** (D-4); `Chart`, `Group` and `Connector` carry the `⏳` deferred
   marker instead.
2. **The band has one axis per currency** (D-3), stacked, each labelled, with
   `MIXED_CURRENCY_COMPARISON_REFUSED` stated on the element — the split *and* the reason.
3. **`not plotted:` is part of the band**, not a tooltip (§9.3.6, D-2). Members with no
   `regular_price` are named with their reason and are absent from the axis.
4. **The top bar shows the revision count and last checkpoint** (D-7), because a history that is
   written and never surfaced is indistinguishable from one that is not written.
5. **`owner: vic (prov.)`** — the owner is rendered with an explicit provenance qualifier and no lock
   icon, no "Private", no "Secure" (D-9, §13).

### 11.3 Behaviour, and what it reuses

| Region | Behaviour | Reuses |
|---|---|---|
| Board | pan, zoom, drag, resize, multi-select, group | **Canvas Core — an extraction, not a copy. See §11.5** |
| Top bar filters | Series / Company / Country / Marketplace | `KM.ui` multi-select filter (`multi-select-filter.js:32`); `KM.scopeModal` (`scope-select-modal.js:21`) for scope picking |
| Properties panel | element props, source, live/snapshot toggle, notes | `.kmf-panel--right` (`components.css`) |
| Cards | module card visuals | `.km-category-card` (`components.css`) |
| History list | revision list (id, type, version, who, when) | plain list; no diff/restore UI in P1 (§6.3) |
| Charts (P2) | — | Chart.js, already loaded (`index.html:34`) |
| Page shell | mount / unmount with epoch guards | `KM.lifecycle.register` (`lifecycle.js:37`) |

**Explicitly not added:** React, Konva, Fabric, React Flow, or any other library. The repo proves a
DOM board works (§3.8); nothing in the requirement exceeds what it does today.

### 11.4 Initial template — "SKU Series Price Architecture Board"
On first creation with `board_type = SERIES_PRICE_ARCHITECTURE`, the board is seeded with:
one `TEXT_NOTE` ("Objective / constraints"), one `SERIES_PRICE_BAND` bound to the Series chosen in the
top bar, one `MATRIX` pre-labelled `Price × Product Tier`, and one **empty** `DEAL_PLAN` (D-4).
Nothing is auto-populated with values the user did not ask for; the band resolves live and shows its
own refusals. **The seeding writes one `SAVE_CHECKPOINT` revision**, so a board has a restorable
initial state from the moment it exists.

### 11.5 Canvas Core reuse contract — **new in P0-R1**

**The rule: `supplychain.js` is not copied.** Not the file, not the class, not a renamed fork. What P1
reuses is an extracted **Canvas Core** with two adapters; what stays behind is the Supply Chain
Canvas's own data model, its own storage, and its own behaviour.

#### 11.5.1 Why a copy is refused — measured, not assumed

The existing controller is good engineering that is nonetheless not copyable, and the reasons are
facts in the file:

| Measured fact | Where | Why it forbids a copy |
|---|---|---|
| `CanvasController` is a **single module-level object literal singleton**, with all mutable state (`panX`, `panY`, `zoom`, `items`, `arrows`, `selectedItem`, `nextId`, `_initialized`, …) as its own properties | `supplychain.js:2-26` | There is one instance, ever. A copy gives two singletons that both answer to `window`-reachable globals, and no path to two boards on one page |
| **Two duplicate object keys.** `onCanvasClick` is defined at `:179` **and** `:587`; `showColorPicker` at `:883` **and** `:1515` — all four inside the one object literal that closes at `:1544` | `supplychain.js:179, 587, 883, 1515, 1544` | In an object literal the **later key silently wins**. `showColorPicker`'s two definitions have *incompatible signatures* — `(itemId, colorType)` vs `(e, item)` — and the only caller, `:538`, passes `(e, item)`, so `:883` is **dead code that appears to exist**. Copying the file copies the defect and its plausible-looking dead branch |
| Item creation is **shape-specific and hard-coded**: `addShape`, `addText`, `addNote`, `addHighlight` | `:313, 355, 376, 395` | The board's element types are `TEXT_NOTE` / `SKU_CARD` / `REGIONAL_SKU_CARD` / `SERIES_PRICE_BAND` / `DEAL_PLAN` / `MATRIX`. None of them is a shape, and a fork would grow six more `addX` methods |
| Persistence is **two lines, inline, with a literal key** | `:1526`, `:1535` (`localStorage`, key `'supplychain-canvas'`) | The board needs server persistence with idempotency, versioning and revisions (§6, §12). This is the one part that must not be reused at all |
| A **prototype-time rebind** patches a method after definition | `:1585` (`CanvasController.showColorPicker = CanvasController.showColorPicker.bind(CanvasController)`) | State and behaviour are bound to the singleton, so extraction has to break that binding deliberately rather than inherit it |

**Two duplicate keys in 1544 lines is the whole argument.** They are invisible in review and harmless
today only because one caller happens to match the surviving definition. A fork doubles that surface
and guarantees the two copies diverge — because the second copy is the one that gets the new features.

#### 11.5.2 The seven separated concerns

Canvas Core is **extractable or adapter-based** — the extraction may be done by moving code into a new
`assets/js/utils/canvas-core.js` **or** by leaving `supplychain.js` in place behind an adapter that
implements the same interface. The contract is the boundary, not the file layout.

| # | Concern | What it owns | What it must not know |
|---|---|---|---|
| 1 | **Viewport** | `panX`, `panY`, `zoom`, wheel/button zoom, reset, the transform, the zoom label | What an element *is* |
| 2 | **Element geometry** | `position_x/y`, `width`, `height`, `z_index`; grid snapping | Element type, source, or content |
| 3 | **Selection** | current selection, multi-select, selection change events | What the selected thing renders as |
| 4 | **Drag / resize** | pointer capture, 8-way handles, live geometry, commit-on-release | Whether the commit goes to a server or nowhere |
| 5 | **Connectors** | anchors, edge-point maths, arrow rendering | Board semantics (deferred to P2 for the board; **kept working for Supply Chain**) |
| 6 | **Serialization adapter** | model ⇄ core-neutral geometry (`{ id, x, y, w, h, z }` + an opaque payload) | The shape of either consumer's model |
| 7 | **Persistence adapter** | `load()`, `save(changes)`, conflict surfacing | Everything above it |

Concerns 1–5 are the reusable engine. **6 and 7 are where the two consumers differ, and they are the
only place they differ.**

#### 11.5.3 The two adapters

```
                       ┌───────────────────────────────┐
                       │        CANVAS CORE            │
                       │ viewport · geometry · select   │
                       │ drag/resize · connectors       │
                       └───────┬───────────────┬───────┘
                    serialization         persistence
                       ┌───────┴───────┐   ┌───┴───────────────┐
     Supply Chain ───▶ │ items/arrows  │   │ localStorage      │
        Canvas         │ nextId/       │   │ 'supplychain-     │
                       │ nextArrowId   │   │  canvas'          │
                       └───────────────┘   └───────────────────┘
                       ┌───────────────┐   ┌───────────────────┐
   Product Strategy ─▶ │ elements[]    │   │ SERVER            │
        Board          │ (§6.2, 20 col)│   │ productStrategy-  │
                       │ + revisions   │   │ Board.upsert*     │
                       └───────────────┘   └───────────────────┘
```

| | Supply Chain Canvas | Product Strategy Board |
|---|---|---|
| Model | `items[]` + `arrows[]` + `nextId` / `nextArrowId` | `elements[]` per §6.2 (20 columns) |
| Ids | client counters | derived `PSE-` ids (§6.5) |
| Persistence | `localStorage`, key **`'supplychain-canvas'`** — **unchanged** | **server**, via §12.1 actions |
| Storage key | keeps its own; **no key is shared** | **holds no `localStorage` key for board data at all** |
| History | none | `product_strategy_board_revisions` (§6.3) |
| Connectors | in use today | P2 |

#### 11.5.4 The non-regression contract

1. **The Supply Chain Canvas's observable behaviour does not change.** Same key, same model, same
   arrows, same colour and text tooling, same `KM.lifecycle` mount/unmount and `_initialized`
   idempotency, same rendered DOM.
2. **`localStorage` is never shared.** The board stores **no** board data in `localStorage` under any
   key — its record is the server (§3.7: `localStorage` is per-browser, per-device, invisible to others
   and lost with site data, which is the opposite of a durable strategy record). Per-viewer UI
   conveniences (last board opened, panel width) may use a **board-namespaced** key and must never hold
   element data. **`'supplychain-canvas'` is read and written by the Supply Chain Canvas only.**
3. **The extraction is behaviour-preserving and separately proven.** The batch that extracts Canvas
   Core (B2a) changes the Supply Chain Canvas's *structure* and nothing else, and it ships with tests
   asserting the storage key, the serialized shape and the mount/unmount contract are unchanged.
4. **The two duplicate keys are resolved during extraction, not carried through it** — the dead
   `showColorPicker(itemId, colorType)` at `:883` and the shadowed `onCanvasClick` at `:179` are
   settled explicitly, with the surviving behaviour named, because an extraction that preserves a
   silent shadow has preserved the wrong thing.
5. **No new dependency.** The extraction is a move plus an interface; it adds no library.

#### 11.5.5 What P0-R1 does about it: nothing but this contract

**No production code is extracted, moved, refactored or touched in this round.** `supplychain.js` and
`supply-chain-canvas.css` are byte-identical to `e9fcd27` on this branch (§21). The prototype in §22
demonstrates the *information architecture* with its own throwaway code and does not import, fork or
adapt the shipped canvas.
---

## §12 — API proposal

### 12.1 New board actions (four)

| Action | Kind | Payload | Returns |
|---|---|---|---|
| `productStrategyBoard.workspace.get` | read | `{ board_id?, include: { revisions?: bool } }` | `{ boards[], elements[], revisions[] }` — all boards when `board_id` omitted (list); one board's elements when given; revisions only when included |
| `productStrategyBoard.upsertBoard` | write | `{ board_id?, board_name, board_type, owner, status, created_by, expected_version?, idempotency_key }` | `{ board_id, version, applied, replayed }` |
| `productStrategyBoard.upsertElements` | write | `{ board_id, elements[], expected_version?, idempotency_key }` — each element carries `author_type` explicitly | `{ element_ids[], version, applied, replayed }` |
| **`productStrategyBoard.createRevision`** | write | `{ board_id, revision_type, created_by, author_type, idempotency_key }` | `{ revision_id, board_version, applied, replayed }` |

- **Revisions are append-only.** There is no update and no delete action for a revision. A history that
  can be edited is not a history.
- **Deletion** is `status` / soft-delete on the board and the `deleted` flag on the element (§6.2 col 20)
  — no row removal, so an accidental delete is recoverable and no id is ever reused.
- **`include.revisions` is bounded** the same way `59_`'s includes are: off by default, missing-safe, and
  capped with the cap **reported** rather than silently applied (`59_…:57`, `skdCap_`).

### 12.2 Client resource registration

Two entries in the existing registry (`assets/js/api/km-data-access.js:150`) — the board, and the
bounded pricing read of §12.3:

```js
productStrategyBoard: {
  read: 'productStrategyBoard.workspace.get', rowsAt: 'elements',
  commands: { upsertBoard:     'productStrategyBoard.upsertBoard',
              upsertElements:  'productStrategyBoard.upsertElements',
              createRevision:  'productStrategyBoard.createRevision' }
},
productPricing: { read: 'productPricing.workspace.get', rowsAt: 'pricing_list' }
```

This inherits, for free: the typed envelope, business-vs-transport error separation, the mandatory
idempotency key (`:227`, `:305`), and the in-memory adapter (`:250`) for contract tests.

**`skuDetails` needs no new entry** — it is already registered at `km-data-access.js:155`
(`skuDetails: { read: 'skuDetails.workspace.get', rowsAt: 'rows' }`). The board is simply a second
caller of an owner that already exists, which is exactly what D-5 asks for.

### 12.3 The source reads — **DECIDED (D-5): no legacy 44-tab read in P1**

P0 offered two options and recommended the cheap one: ship on the existing `KM.DB.*` accessors and
accept the legacy full-DB read. **That option is now withdrawn.** P1 must not read through
`getOperationDb` (`03_master_data_handlers.gs:35`, 44 tabs).

**The six tables the board reads, and who owns each read:**

| Table | Read owner in P1 | New work |
|---|---|---|
| `sku_details` | **`skuDetails.workspace.get`** — `59_api_v1_sku_details_workspace.gs`, `[BASE]` (`SKD_WORKSPACE_TABLES_`, `59_…:46`) | **None.** Reuse |
| `marketplace_skus` | **`skuDetails.workspace.get`** with `include.regional` (`59_…:50`) | **None.** Reuse |
| `sku_regional_details` | **`skuDetails.workspace.get`** with `include.regional` (`59_…:51`) | **None.** Reuse |
| `pricing_list` | **`productPricing.workspace.get`** (new) | New bounded owner |
| `campaigns` | **`productPricing.workspace.get`** (new) | New bounded owner |
| `campaign_sku_lines` | **`productPricing.workspace.get`** (new) | New bounded owner |

**Three of the six already have a scoped owner, and the board reuses it verbatim.** `59_` declares in
its own header that it reads *"the SKU Details master/reference table set — never getOperationDb"*
(`59_…:10`) and that the `'regional'` include is *"bounded includes, not broad loading; read
missing-safe"* (`59_…:16`). The board adds **no** table to `SKD_WORKSPACE_TABLES_`, changes **no** line
of `59_`, and becomes a caller — one more consumer of one owner.

**The other three have no read owner at all today** (§4.8), so creating one is filling a vacuum, not
competing with an incumbent. `productPricing.workspace.get` is the **single** owner for those three
tables and the `marketplace_skus` join key they need (§4.4 — a price lookup must route through
`marketplace_sku_id`, never `(country, marketplace, sku)`).

**Why not extend `59_` to cover all six?** Because `59_`'s declared scope is
*"MASTER/REFERENCE READ MODEL ONLY … the SKU Details master-data surface"* (`59_…:5-10`). Adding pricing
and campaign tables would widen an owner past its own stated boundary and make one action responsible
for two surfaces — the shape D-5's "no second competing read authority" rule is protecting against,
arrived at from the other direction.

**One owner for these tables, system-wide.** `campaign-risk.js` today reads `campaigns` and
`campaign_sku_lines` through the legacy path, and `F1-7J-A3`
(`docs/planning/F1_7J_REMAINING_SECONDARY_SURFACES_AND_AUTHORITY_MASTER_AUDIT_R1.md` §10) already plans
*"Remaining non-workspace PRIMARY pages → scoped reads … campaign-risk, carrier-rate-card (new small
workspaces or bounded reads)"*. **`productPricing.workspace.get` should be that owner for both
surfaces.** Sequencing consequence, and it is the one coordination item in this design: whichever round
lands first builds it, and the other consumes it. Two bounded readers over `campaign_sku_lines` would be
the competing authority D-5 forbids, arrived at by accident.

**Cost of the decision, stated plainly.** D-5 moves roughly 400–600 lines of `.gs` plus tests, and one
user-owned Apps Script sync, from an optional late batch (P0's B7) into the **mandatory first batch**
(§17, B1). The board cannot render a price band before it exists. That is the trade the decision makes,
and it buys the board never having to be migrated off the legacy read later — with the price band, the
Deal markers and the frozen snapshots all already built on top of it.

---

## §13 — Permission / audit model — **DECIDED (D-9)**

**The honest position: this system has no authentication and no authorization, and the board must not
pretend otherwise.** P0 stated this and set the default to "accept it and say so in the UI". D-9 goes
further: **saying so is necessary and not sufficient.**

### 13.1 What is true today (measured, §3.10)
- **No RBAC.** No `users` / `roles` / `permissions` / `user_roles` / `acl` table is referenced by any
  shipped `.gs` file.
- **No server-side identity.** `Session.getActiveUser()` appears exactly **once** in the whole Apps
  Script tree, in a TEMP migration file (`TEMP_migrate_request_order_draft_v2.gs:1803`), not in runtime.
- **`created_by` is client-asserted**: `String(body.created_by || 'operation-system')`.
- **Scheduled, not forgotten.** `SYSTEM_ROADMAP.md` puts Login + Google Identity +
  `users`/`roles`/`permissions`/`user_roles`/`role_permissions` + backend token verification + API
  permission enforcement in **P2-A**, and states that Phase-1A is *"NOT gated on Login / RBAC"* and that
  *"'Knowing the URL' is NOT a security control."*

### 13.2 The five rules D-9 imposes

1. **`owner` is provenance, never access control.** It is a client-asserted string with the same
   contract as `created_by`. It answers *"who made this"*, and it does not and cannot answer
   *"who may open this"*.
2. **The UI may not say `Private`, `Secure`, `Confidential`, `Restricted`, `Only you`, or show a lock
   icon** on a board, an element or a revision. The owner renders with an explicit provenance qualifier
   (§11.2: `owner: vic (prov.)`). Any user of the deployment can read and edit any board, and the board
   list says so once, in plain words, where it cannot be missed.
3. **The production feature ships disabled by default.** The repo's own two-layer pattern applies:
   - **Server:** a module-level flag plus an accessor, exactly as
     `00_config.gs:88-89` does it — `var PRODUCT_STRATEGY_BOARD_ENABLED_ = false;` +
     `function productStrategyBoardEnabled_() { return PRODUCT_STRATEGY_BOARD_ENABLED_ === true; }`.
     While false, **every board action refuses with zero writes**.
   - **Frontend:** the mirror default is **fail-safe false**, read as
     `window.KM_FLAGS && window.KM_FLAGS.PRODUCT_STRATEGY_BOARD === true` — the shape already used at
     `inventory-replenishment.js:13234` and `request-order.js:446`, and the deliberate asymmetry
     `00_config.gs:84-87` names: *"if the capability transport cannot be read, the page must not offer a
     write it cannot confirm the server accepts."*
   - The nav entry stays `menu-item--disabled` + `Soon` until the gate opens (§11.1).
4. **A hidden button is not a control, and the design must not count it as one.** `00_config.gs:93-101`
   is the shipped statement of this: activation there is *"TWO conditions, not one"*, the allowlist is
   *"SERVER-OWNED config in the same file as the flag, which means a browser cannot widen it, a request
   payload cannot widen it, and widening it is a deployment with a diff."* The board inherits that
   standard. **The server flag is the control; the frontend flag only avoids offering what the server
   would refuse.** No claim of safety in this document rests on the UI hiding anything.
5. **Enabling it in production requires a separate authorization / security gate.** Not this document,
   not the batch that finishes the UI, and not a frontend change. A distinct authorization round must
   decide the flag flip, and it must answer at least: is every board being readable and editable by
   every deployment user acceptable for the content that will be on these boards; and is the board's
   content in scope for P2-A RBAC when it lands. **That round is out of scope here, and P1 is not
   complete without it** (§17, B-GATE).

### 13.3 Audit in P1
- `created_by` / `created_at` / `updated_by` / `updated_at` / `version` on **all three** tables (§6).
- `author_type` as a **real column** on elements and revisions, written explicitly (§6.2).
- `product_strategy_board_revisions`, append-only, with the `idempotency_key` stored (§6.3, §12.1).
- **No credential, token or secret** is introduced anywhere by this design — consistent with the
  Phase-1A rule that no secret may sit in the frontend, the repo or the Sheet.

### 13.4 P2-A alignment
When identity and RBAC land, `owner` becomes a real FK and board-level read/write scoping becomes
enforceable. The schema is already shaped for it: `owner`, `created_by` and `updated_by` are single
string columns on every table, and the revision table already records who caused each checkpoint.

---

## §14 — AI extension seam (design only, nothing implemented)

| Requirement | How the schema already satisfies it |
|---|---|
| AI can read board, elements, source references and snapshots | `productStrategyBoard.workspace.get` returns exactly that; `source_type` + `source_identity` are the official identities (§7.2), so AI cites the source rather than the board's copy |
| AI content marked `author_type=AI` | **`author_type` is a real column** (§6.2 col 14), written explicitly as `HUMAN` on every P1 row. An AI element is distinguishable by the *presence of a value*, never by the absence of one, and a row with a blank `author_type` is rejected outright |
| Human content never silently overwritten by AI | Element `version` + `expected_version` optimistic concurrency (§15.3). An AI write to an element whose `author_type = HUMAN` must create a **new adjacent element** (a suggestion), never an in-place update. Enforced by the handler on a column it can read, not by a convention inside `content_json` |
| AI suggestions separated from official SKU / Pricing writes | Already structural: the board has **no write path to any source table** (§8.5), and a `DEAL_PLAN` has no writer at all (§7.4). An AI suggestion cannot reach `pricing_list` or `campaign_sku_lines` even in principle |
| Version + audit for every AI change | `version`, `updated_at`, `updated_by`, `author_type` — **plus a mandatory `PRE_AI_WRITE` revision before the write** (§8.6). **D-7 landed this in P1**, so the AI seam is not waiting on a table |
| Future: meeting notes, price-gap analysis, Deal cannibalisation alerts | `TEXT_NOTE` carries meeting notes today; §9.3's gap / overlap / cannibalisation findings are **computed and stored in `content_json`** with the threshold that produced them, so an AI reads a measurement rather than re-deriving one from a picture; and `DEAL_PLAN` (D-4) gives a cannibalisation alert somewhere to land as a proposal rather than as a source edit |

**Nothing in this round implements any of it.** No AI table, no prompt, no model configuration, no
model call, and no action name reserved in the router. `PRE_AI_WRITE` is an enum value in a table
definition — the seam is that the write path *cannot* exist without first creating a revision.

---

## §15 — Failure and refusal behaviour

1. **Source unreadable → `UNRESOLVABLE`, never empty and never zero.** A failed price read and a blank
   price are different facts; the element says which (§8.4).
2. **Mixed currency → split tracks + `MIXED_CURRENCY_COMPARISON_REFUSED`** (§9.4, D-3). The band never
   draws a shared axis, never converts, and states the refusal on the element next to the split.
3. **Concurrent edit → refuse, do not merge.** Every write carries `expected_version`; a mismatch
   returns `BOARD_VERSION_CONFLICT` with the current version and writes nothing, and the client
   re-reads. Last-write-wins on a strategy board silently destroys someone's reasoning.
4. **No reverse write, structurally.** The handler exposes no action that targets a source table
   (§8.5), and that is asserted on its source text in tests (§18).
5. **Ambiguous price join → refuse.** If `sku + country + marketplace` resolves to more than one
   `marketplace_sku_id` (i.e. multiple companies), the element must **not** pick one: it renders
   `PRICE_SOURCE_AMBIGUOUS_ACROSS_COMPANIES` and asks for a company. This follows directly from
   `pricing_list` having no `company` column (§4.4).
6. **Missing band basis → `SOURCE_MISSING`, listed and not plotted** (§9.3.6, D-2). **No fallback to
   `sku_details.selling_price`, ever.** A substituted point renders identically to a measured one, and
   that is the whole objection.
7. **No substitute for "current selling price"** (D-6). The field is absent from P1; it is not rendered
   blank, zero, or filled from `regular_price` / `selling_price` / `promo_price`.
8. **No estimated margin** (D-8). Any margin-shaped figure derived from prices alone is refused at
   design level: it does not appear in an element, a tooltip, an export or a chart. A price-to-price
   percentage is permitted and is labelled **discount**.
9. **A `DEAL_PLAN` never claims to be a Deal** (§7.4, D-4). The `PROPOSAL ONLY` marker is
   non-dismissible; an official price absent renders `SOURCE_MISSING`, never "no deal", and never the
   proposal in the official value's place.
10. **Snapshot never silently re-frozen** (§8.3), and a re-freeze always writes its revision first
    (§8.6).
11. **Revision write failure blocks the change it precedes** (§8.6). `REVISION_WRITE_FAILED`, zero
    writes, nothing applied.
12. **Missing element type → refuse to render**, not a default type. A `CHART` element created by a
    future version and opened by an older client shows `UNSUPPORTED_ELEMENT_TYPE` and is preserved
    untouched on save.
13. **Missing `author_type` → refuse the write** (`AUTHOR_TYPE_REQUIRED`, §6.2). A blank is a third
    state, not a default.
14. **Feature disabled → refuse with zero writes** (§13.2.3). While `PRODUCT_STRATEGY_BOARD_ENABLED_`
    is false the server refuses every board action, and the refusal is a named fact
    (`FEATURE_DISABLED`), not a silent empty response.
15. **Element cap.** A board is bounded (proposal: 500 elements) and the cap is **reported**, never
    silently applied — the same rule `59_` uses for its row cap (`skdCap_`, `capped` always surfaced,
    `59_…:57`).

---

## §16 — Migration and deployment impact

| Item | Impact |
|---|---|
| New Google Sheet tabs | **3** — `product_strategy_boards`, `product_strategy_board_elements`, **`product_strategy_board_revisions`** (D-7) |
| Changes to existing tabs | **None.** No column added, renamed or removed anywhere |
| Data migration | **None.** No existing row is read-modify-written; the three tabs start empty |
| New Apps Script files | **2** — a board handler and **a bounded pricing/campaign read owner** (D-5). Proposed `65_api_v1_product_strategy_board.gs` and `66_api_v1_product_pricing_workspace.gs`; **both numbers to be confirmed against the live Apps Script project before use** |
| Changes to `59_api_v1_sku_details_workspace.gs` | **None** (D-5). The board reuses `skuDetails.workspace.get` as a caller; `SKD_WORKSPACE_TABLES_` is not extended |
| Router changes | **5** new `if (action === …)` branches in `01_router.gs` — 4 board actions (§12.1) + 1 pricing read |
| Frontend deployment-probe registries | **3 edits** — the 5 new actions into `KM_REQUIRED_DEPLOYED_ACTIONS_` (`operation-system-db-api.js:4069`), a `'product-strategy-board'` entry in `KM_PAGE_REQUIRED_ACTIONS_` (`:4097`), and 2 rows in `KM_PERF_SURFACES_` (`:4380`). Without these, a deployment missing an action is discovered by the page failing rather than by a named `DEPLOYMENT_CONTRACT_MISMATCH` |
| `getOperationDb` `validTabs` | **Do NOT add the three board tabs.** The board has its own bounded read, and adding them makes every other page's legacy full-DB read bigger |
| Frontend files | **4 new** — `assets/html/pages/product-strategy-board.html`, `assets/js/pages/product-strategy-board.js`, `assets/css/pages/product-strategy-board.css`, **`assets/js/utils/canvas-core.js`** (the §11.5 extraction) + 1 `<link>` and 1 nav block in `index.html` + 2 `RESOURCES` entries |
| Changes to `supplychain.js` / `supply-chain-canvas.css` | **Structural only, in B2a**: the Canvas Core extraction, behaviour-preserving, with the `localStorage` key `'supplychain-canvas'` and the serialized shape asserted unchanged (§11.5.4) |
| **Feature flag** | **`PRODUCT_STRATEGY_BOARD_ENABLED_ = false` ships in `00_config.gs`, and stays false** (D-9). A frontend mirror defaults fail-safe false. Flipping it is a separate authorization round (§17, B-GATE) |
| **Apps Script sync** | **REQUIRED at B1, and it is USER-owned.** `CLAUDE.md`: `APPS_SCRIPT_SYNC_OWNER = USER`, `DEPLOYMENT_OWNER = USER`. A new Web App deployment version is required because new actions must be reachable |
| Web App deployment version | **Required at B1.** **Not required for P0 or P0-R1** — neither round changes any `.gs` file |
| DB capacity | Three more tabs count toward the Google-Sheet cell budget tracked by the planned DB Capacity Monitor (`SYSTEM_ROADMAP.md`, Phase 2). `…_elements` and `…_revisions` are the growing tables; §15.15 caps elements per board, and §6.3 bounds revisions by making them a *deliberate* act rather than an autosave |
| Rollback | Delete the three tabs, revert the frontend files, and revert the B2a extraction. No source table is touched, so rollback cannot lose operational data. With the flag false, a partially deployed board is inert rather than half-live |
---

## §17 — Implementation batches

The decisions reshaped this plan in three places: **the bounded read moved from an optional last batch
into B1** (D-5), **revisions moved into B1** (D-7), **`DEAL_PLAN` moved from P2 into B6** (D-4), and a
**terminal authorization gate was added** (D-9).

| Batch | Scope | Ships | Apps Script sync |
|---|---|---|---|
| **B0** *(P0)* | Design freeze — discovery, mapping, schema, 9 open decisions | docs only | No |
| **B0-R1** *(this round)* | Design closure — all 9 decisions applied, Canvas Core contract (§11.5), non-runtime prototype (§22) | docs + prototype only | No |
| **B1** | **3 tabs** + board handler + **4 board actions** + **`productPricing.workspace.get` bounded read** (D-5) + 2 `RESOURCES` entries + probe-registry entries + **the disabled feature flag** (D-9). Read + write + idempotent replay + version conflict + **revisions** (D-7). **No UI.** Proven by fixture tests with zero `SpreadsheetApp` | the whole backend seam | **Yes (user)** |
| **B2a** | **Canvas Core extraction** (§11.5) — behaviour-preserving, Supply Chain Canvas unchanged, storage key and serialized shape asserted, the two duplicate keys resolved | a reusable engine | No (frontend only) |
| **B2b** | Page shell + nav (`disabled`) + Canvas Core wired to the **server** persistence adapter. `TEXT_NOTE` only. Save checkpoint + revision list | a usable notes board | No |
| **B3** | `SKU_CARD` + `REGIONAL_SKU_CARD`, `LIVE_REFERENCE` mode, the four resolution states, the §15.5 company-ambiguity refusal | SKU modules on the board | No |
| **B4** | `FROZEN_SNAPSHOT`: freeze, `captured_at`, `value_provenance`, the refresh diff, re-freeze versioning, `FREEZE_SNAPSHOT` revisions | decision evidence | No |
| **B5** | `SERIES_PRICE_BAND`: per-currency tracks, points, normal-vs-deal markers, gap / overlap / cannibalisation arithmetic with a visible threshold, the D-2 `SOURCE_MISSING` list, entry/core/premium positions | **the first-priority screen** | No |
| **B6** | **`DEAL_PLAN` (`PROPOSAL_ONLY`, D-4)** — closed field list, permanent `PROPOSAL ONLY` marker, official-vs-proposal separation, the third band marker | Deal layout | No |
| **B7** | `MATRIX` + the "SKU Series Price Architecture Board" template | matrices | No |
| **B-GATE** | **Authorization / security round (D-9).** Decides whether the flag may be flipped, and answers the two questions §13.2.5 names. **P1 is not complete without it** | production enablement | **Yes (user)** — the flag flip is a deployment |
| **P2** | `CHART`, `GROUP`, `CONNECTOR`, **History UI (diff + restore)**, AI seam activation | deferred | TBD |

**Complexity and effort estimate** (rough, for sequencing only — not a commitment):

| Batch | Complexity | Rough size |
|---|---|---|
| B1 | **High** — three tables, derived ids, replay, version conflict, revisions **and** a new bounded read owner. D-5 and D-7 both land here | ~1200–1600 lines `.gs` + heavy tests |
| B2a | Medium — a behaviour-preserving extraction is easy to do and easy to do wrong; the tests are the work | ~300–500 lines moved + ~200 lines tests |
| B2b | Low-Medium — the engine exists; the persistence adapter is the work | ~400–600 lines JS/CSS |
| B3 | Medium — three-table join, four refusal states, the company ambiguity | ~400–600 lines |
| B4 | Medium — snapshot / diff / re-freeze semantics + revision ordering | ~350–550 lines |
| B5 | **High** — the price arithmetic, the per-currency split and their refusals are where correctness lives | ~700–1000 lines + heavy tests |
| B6 | Low-Medium — the element is small; keeping it a proposal is a discipline, not a cost | ~250–400 lines |
| B7 | Low | ~200–300 lines |
| B-GATE | Not an engineering size — a decision round | — |

**Sequencing facts:**
- **B1 blocks everything**, and D-5 made it bigger. It is also the only batch besides B-GATE that needs
  a user-owned Apps Script sync.
- **B2a is the only batch that touches shipped production frontend code.** It ships alone, so a
  Supply Chain Canvas regression can only have come from it.
- **B5 depends on B1's bounded read**, which is the point of D-5: the price band is never built on the
  legacy full-DB read and therefore never has to be migrated off it.
- **B6 depends on B5** (the third band marker) and on B1 (the closed-field validation).
- **Total P1 is roughly 30–40% larger than P0's plan.** D-5, D-7 and D-9 each added real work, and each
  of them added it *before* the screen the board exists for rather than after.

---

## §18 — Acceptance criteria

**P0 (first round) — all met:**
- A1 Isolated worktree + feature branch off the real `origin/main`; mainline untouched. ✔
- A2 Every table, column, action and component cited to a shipped file and line. ✔
- A3 Every field the product asked for is either mapped to a real column or marked **GAP** with no
  invented mapping. ✔ (§9.1)
- A4 No page, table, API, `.gs`, frontend or deployment change. ✔
- A5 No push, no merge, no deploy, no DB write. ✔

**P0-R1 (this round) — all met:**
- R1 All nine decisions applied, and **no superseded default survives anywhere in the text** — the
  affected sections were rewritten, not annotated. ✔ (§19 records each one and where it landed)
- R2 The element schema is stated **once**, canonically, with all twenty columns including
  `author_type` as a **real column** and `updated_by`. ✔ (§6.2)
- R3 Board create has a stated idempotency and deterministic-id contract, not only element create —
  including the removal of `created_at` from the derived key. ✔ (§6.5)
- R4 `DEAL_PLAN` is in the MVP and is `PROPOSAL_ONLY`, with a **closed** field list and a prohibition
  list. It is **not** deferred to P2 anywhere in this document. ✔ (§2, §7.4, §10, §17)
- R5 The legacy 44-tab read is **not** an accepted P1 approach anywhere in this document, and the
  bounded read is in B1. ✔ (§12.3, §17)
- R6 `owner` is never described as providing secure access, and the feature ships disabled behind a
  server-owned flag with a separate authorization gate. ✔ (§13, §16, §17 B-GATE)
- R7 A Canvas Core reuse contract exists, forbids copying `supplychain.js`, separates the seven named
  concerns, keeps the two storage keys apart, and states that **P0-R1 extracts no production code**. ✔
  (§11.5)
- R8 A non-runtime prototype exists, opens from the filesystem, makes no network request, and is loaded
  by nothing in the app. ✔ (§22)
- R9 Schema, MVP, batches and acceptance criteria are mutually consistent with the nine decisions. ✔
- R10 No production file, no `.gs`, no S1 file changed; no push, merge, deploy or DB write. ✔ (§21)

**P0-R2 (the interactive prototype) — all met:**
- S1 The price band is a real X/Y chart: X = SKU, Y = price, with Y-axis ticks, SKU labels, a legend
  and per-SKU details. ✔ (§22.4)
- S2 Five price levels per SKU, and the vertical minimum→MSRP band. ✔
- S3 Regular, official deal and proposed deal are three visually distinct markers, and no SKU ever
  carries both deal markers. ✔
- S4 Multi-select SKU selector with search, Select all and Clear all; the X axis follows it
  immediately. ✔ (10 plotted members in the default panel — inside the 8–12 target)
- S5 Series replaces the SKU universe; Company / Country / Marketplace narrow it. ✔
- S6 Currencies never share a Y axis; three currencies produce three panels and no FX is applied. ✔
- S7 Gap, overlap, cannibalisation and entry/core/premium computed live, with the threshold displayed;
  a step exactly equal to the threshold is not a gap and a single-point touch is not an overlap. ✔
- S8 `SOURCE_MISSING` is listed and never plotted; no point is invented. ✔
- S9 Text, Price Band and Matrix create, edit and delete real elements; unimplemented tools are
  disabled controls rather than dialogs, and the absent interactions are named on the page. ✔
- S10 No network, no storage, no dependency, no production integration — proven by a
  comment-and-string-stripped scan and by the page's own assertions. ✔
- S11 120 automated DOM assertions pass. ✔ (§22.5)

**P0-R3 (the data contract and the executive report) — all met:**
- T1 Every source mapping is quoted from shipped source at a cited line; no column is inferred from a
  field name, and a field with no column is a **GAP**. ✔ (§23, §24)
- T2 The contract is machine-readable and the preview fixture satisfies it field for field, with no
  extra field of its own. ✔ (asserted, group B)
- T3 The renderer never reads the fixture — it is handed an adapter, chosen in one line at boot. ✔
- T4 `OperationDbProductStrategyDataAdapter` is defined, disabled, makes zero requests and returns
  `SOURCE_NOT_CONNECTED`; checked as a property of the object. ✔ (§27, group C)
- T5 The page carries a permanent, undismissible notice that it is not connected to the database, and
  never uses the words "live data", "current data" or "official database". ✔ (group D)
- T6 Every finding is tagged `DEMONSTRATION INSIGHT`; live and proposed are never conflated. ✔ (group K)
- T7 Variant grouping merges only on a proven `variant_group` plus identical prices, splits on any price
  difference, and refuses without authority. Nothing is derived from a SKU string. ✔ (§25, group E)
- T8 A missing image is stated in words; no placeholder, no similar photograph, no unproven file. ✔
  (§26, group J) — **restated by P0-R3-R1: no LOCAL file either, proven or otherwise; the preview
  ships zero images.**
- T9 Executive Report and Strategy Workspace both work; the report carries no schema name and no
  decision code on its **visible** surface. ✔ (group L)
- T10 Print/PDF and 16:9 presentation both work; the findings drawer and Advanced details are collapsed
  by default. ✔ (groups L, P)
- T11 Every P0-R2 price rule still holds, including all three boundary cases. ✔ (group I)
- T12 No network, no storage, four local subresources, zero production integration. ✔ (group O + scan)
- T13 312 automated DOM assertions pass. ✔ (285 at P0-R3; 27 added by P0-R3-R1)

**P0-R3-R1 (the image-identity correction) — all met:**
- T14 Every retained image carries evidence of class A, B, C or D that this exact file belongs to
  this exact SKU. **Zero images are retained**, because zero met it. ✔ (§26.2, §26.3)
- T15 A filename, a SKU appearing in tests or mock data, visual similarity, the directory name, a
  person's judgement and a matching hash are each explicitly **not** evidence — recorded as data on
  `IMAGE_POLICY.not_evidence` and asserted. ✔ (group Q)
- T16 The live contract is unchanged: one authority, `IMAGE_SOURCE_MISSING` on an empty column,
  `IMAGE_LOAD_FAILED` on a failed load, and no fallback to a local file, another SKU's photograph
  or a placeholder — each a checkable field, and the no-local-fallback rule enforced by the
  renderer composing no path at all. ✔ (§26.4, group Q)

**P0-R3-R2 (the category command center) — all met:**
- T17 Navigation is a collapsible sidebar with six destinations, exactly one active, tooltips on
  the rail, inline SVG icons, no emoji and **no browser storage**. ✔ (group L)
- T18 Category is the first scope. Two categories never share a price axis, the cross-category view
  draws none at all, and no finding is computed across one. ✔ (§30.2, group M)
- T19 Summary, chart, table and insights on a category page come from ONE scoped row set, and a
  category switch leaves nothing behind. ✔ (group M)
- T20 Every Y axis is `floor(min/5)*5 → ceil(max/5)*5` in steps of 5, every tick drawn and
  labelled, pixels compressing rather than the scale. ✔ (§30.3, group G)
- T21 The everyday price is a product photograph where the mapping is verified, its CENTRE on the
  coordinate, with a neutral fallback otherwise — and deal markers keep their own shapes. ✔
  (§30.4, group H)
- T22 Every image on the page traces to a named per-SKU mapping whose SKU is a member of that very
  grouping; the two near misses are refused; no path is composed anywhere. ✔ (§30.5, group Q)
- T23 A real photograph does not make a price real: `identity_source` and `price_source` are kept
  apart on every row and in the provenance. ✔ (§30.6, group C)
- T24 Every earlier guarantee re-asserted against the new markup. ✔ (§30.8, group R)

**P1 acceptance (for the batches above):**
- **B1** a create replayed with the same idempotency key returns `replayed: true`, creates **no** second
  row, and the derived id is byte-identical across the retry — for **boards, elements and revisions**.
- **B1** a board create retried after a clock change still derives the same `board_id` (§6.5 — proves
  `created_at` is not in the key).
- **B1** a write with a stale `expected_version` returns `BOARD_VERSION_CONFLICT` and writes nothing.
- **B1** an element write omitting `author_type` returns `AUTHOR_TYPE_REQUIRED` and writes nothing.
- **B1** with `PRODUCT_STRATEGY_BOARD_ENABLED_ = false`, every board action returns `FEATURE_DISABLED`
  with **zero writes** — asserted per action, not once.
- **B1** the handler's own source contains **no write** to any of the seven source tables — asserted on
  the source text, and a mutation that adds one must fail a test.
- **B1** the board reads **no** table through `getOperationDb`; the six source tables resolve through
  `skuDetails.workspace.get` and `productPricing.workspace.get` only (D-5), and `59_` is unmodified.
- **B1** a revision is written for each of the four events and for **none** of drag / resize / pan /
  zoom / select; and a failed revision write blocks the change it precedes (§8.6).
- **B2a** the Supply Chain Canvas's `localStorage` key is still `'supplychain-canvas'`, its serialized
  shape is unchanged, its mount/unmount and `_initialized` idempotency are unchanged, and the board
  writes **no** element data to `localStorage` under any key.
- **B3** an element whose source row is absent renders `SOURCE_MISSING` and displays no numeric value;
  an element whose *read failed* renders `UNRESOLVABLE` and is not shown as missing.
- **B3** `sku + country + marketplace` matching two companies renders
  `PRICE_SOURCE_AMBIGUOUS_ACROSS_COMPANIES` and picks neither.
- **B4** after editing `pricing_list` behind a frozen element, the element still shows the original
  values and `captured_at`; the refresh diff shows both; a re-freeze increments `snapshot_version` and
  wrote its `FREEZE_SNAPSHOT` revision first.
- **B5** a Series whose members resolve to two currencies renders **one track per currency with its own
  axis**, states `MIXED_CURRENCY_COMPARISON_REFUSED`, draws **no** shared axis, and performs no
  conversion — with gaps and overlaps computed within a track only (D-3).
- **B5** a member with no `pricing_list.regular_price` is **listed with its reason and plotted nowhere**,
  and is **never** back-filled from `sku_details.selling_price` (D-2).
- **B5** gap findings display the threshold that produced them.
- **B5** a price step **exactly equal** to `gap_threshold` is **not** a gap, and an interval touching
  at a single point is **not** an overlap — asserted on values chosen to expose binary-float error
  (e.g. `24.99 → 32.99` against a threshold of `8.00`), because every comparison runs in integer
  cents (§9.3.4).
- **B5** `promo_price` absent renders `SOURCE_MISSING`, never "no deal".
- **B5/B6** no margin-shaped figure appears in any element, tooltip, export or chart (D-8); a
  price-to-price percentage is labelled *discount*.
- **B5/B6** no field is labelled "current selling price", and no other field is shown in its place (D-6).
- **B6** a `DEAL_PLAN` with an unknown `content_json` key is refused (`DEAL_PLAN_UNKNOWN_FIELD`); the
  `PROPOSAL ONLY` marker cannot be dismissed; and a proposal price and an official `promo_price` never
  merge into one value or one marker (D-4).
- **All:** measured zero writes to every source table across the whole suite.

---

## §19 — Decisions — closed, and what remains

### 19.1 The nine decisions, as decided by the operator (P0-R1)

| # | Decision | P0 default | **DECIDED** | Landed in |
|---|---|---|---|---|
| **D-1** | Navigation placement | New top-level group | **New top-level `Product Strategy` group. Never *Pricing Center*, which is logistics cost** | §11.1, §16 |
| **D-2** | Band price basis | `pricing_list.regular_price` | **`pricing_list.regular_price`; absent ⇒ `SOURCE_MISSING`; NO fallback to `sku_details.selling_price` (a master base input, not a site effective price)** | §9.1, §9.3, §15.6 |
| **D-3** | Cross-country basis | Original currency; refuse mixed axes | **`AS_QUOTED_SINGLE_CURRENCY` only. Other currencies SPLIT into separate bands; no conversion; no shared axis; state `MIXED_CURRENCY_COMPARISON_REFUSED`** | §9.4, §11.2, §15.2 |
| **D-4** | May the board create campaign lines? | No — and `DEAL_PLAN` deferred | **No writes — but `DEAL_PLAN` IS in the P1 MVP as `PROPOSAL_ONLY`, with a closed `proposed_*` field list** | §2, §7.4, §10, §17 B6 |
| **D-5** | Legacy 44-tab read in P1? | Accept it; bounded read later | **NOT acceptable. Bounded scoped reads land in B1. Reuse `skuDetails.workspace.get` for 3 tables; ONE new owner for the other 3; no second competing authority** | §12.3, §16, §17 B1 |
| **D-6** | Current selling price | Not shown in P1 | **Not shown until the source is settled, and NO field may stand in for it** | §9.1, §15.7 |
| **D-7** | `board_history` | Defer to P2 | **A third table, `product_strategy_board_revisions`, ships in P1. Four revision events only. History UI may wait; the DATA may not** | §6.3, §8.6, §16, §17 B1 |
| **D-8** | `margin` | Out of scope until Cost & Pricing | **Out of scope, AND no margin may be estimated from a selling price** | §9.1, §15.8 |
| **D-9** | Board visibility | Accept it; say so in the UI | **`owner` = provenance only; no Private/Secure wording; production feature ships DISABLED behind a server-owned flag; a hidden button is not a control; enablement needs a separate authorization/security gate** | §13, §16, §17 B-GATE |

**Six of the nine changed the plan** (D-3, D-4, D-5, D-7, D-9 outright; D-2/D-6/D-8 added prohibitions
that the design did not previously state). The affected sections were rewritten so that no superseded
default remains anywhere in this document.

### 19.2 What is still open — and none of it blocks B1

These are **not** re-openings of the nine. They are the questions the nine deliberately left downstream.

| # | Open question | Raised by | Blocks | If it stays unanswered |
|---|---|---|---|---|
| **Q-1** | **Where does "current selling price" come from** — a new `pricing_list` column, a marketplace snapshot job, or manual entry? | D-6 | Nothing in P1 | The field stays absent. It is a **new labelled field** when it arrives, never a rename of an existing one |
| **Q-2** | **If a base-currency view is ever wanted, which FX source is authoritative** — `pricing_list.fx_rate`, or something else? | D-3 | Nothing in P1 | P1 stays as-quoted and split by currency. `fx_rate` / `fx_rate_date` are displayed as source facts, never applied |
| **Q-3** | **Who builds `productPricing.workspace.get`** — this board's B1, or `F1-7J-A3`'s `campaign-risk` migration? | D-5 | B1's sequencing, not its design | Whichever lands first owns it and the other consumes it. **Two bounded readers over `campaign_sku_lines` would be the competing authority D-5 forbids, arrived at by accident** |
| **Q-4** | **The two Apps Script file numbers** (`65_`, `66_` proposed) | §16 | B1's first commit | Must be confirmed against the live Apps Script project before use; a collision would overwrite a shipped file |
| **Q-5** | **The B-GATE questions** — is universal read/write acceptable for this content, and is board content in scope for P2-A RBAC? | D-9 | **Production enablement only** | The flag stays false. B1–B7 are fully buildable and testable with it false |

---

## §20 — Conflict check against the S-slices

| Work | Overlap | Verdict |
|---|---|---|
| **S1 diagnostic slice** (`TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs`, Manifest P / S, factory movement census, R4C–R4F) | Tables: `factory_stock*`, `shipping_allocation_drafts*`, `reservations`, `inventory_gap*`. Files: one TEMP diagnostic + its suite | **No conflict.** Zero table overlap, zero file overlap. Neither P0 nor P0-R1 touched any S1 file (§21) |
| **F1-7J S1–S5 surface migrations** (S1 = SKU Handbook, S2 = weekly line-logistics, S3 = PO-list, S4 = RO scope, S5 = IR reference lookups) | The board adds a **consumer** of `skuDetails.workspace.get` — and **D-5 makes that reuse mandatory rather than optional** | **Aligned, not conflicting.** F1-7J-A prescribes exactly this move for `sku-regional-details.js`. The board follows the same direction and extends `59_` by zero lines |
| **F1-7J-A3** (non-workspace pages → scoped reads, incl. `campaign-risk`) | **Direct overlap, now load-bearing.** D-5 requires `pricing_list` / `campaigns` / `campaign_sku_lines` to have a bounded owner in **B1** | **Complementary but must be coordinated** — see Q-3. One owner for those tables, system-wide |
| **P1-A…P1-G supply-chain closed loop** | None. The board reads no forecast, gap, recommendation, allocation, PO or shipment data | **No conflict** |
| **P2-A RBAC** | The board's `owner` becomes a real FK; **D-9 makes the board's production enablement wait on a security decision** | **Forward-compatible by design** (§13.4), and now explicitly gated (§17 B-GATE) |
| **Supply Chain Canvas** (`supplychain.js`, Training Center) | **New overlap introduced by §11.5**: B2a extracts a shared Canvas Core from it | **Managed, not conflicting.** B2a is behaviour-preserving, ships alone, keeps `'supplychain-canvas'` as that page's own key, and is proven by non-regression tests (§11.5.4, §18) |

The one thing to coordinate: **if F1-7J-A3 builds a `campaign-risk` bounded read first, the board must
consume it rather than adding a second one.** Same tables, one owner (Q-3).

---

## §21 — Isolation record

### 21.1 P0 (first round)
- **Read-only baseline taken before any change:** branch `main`, HEAD `e9fcd27`,
  `origin/main` `e9fcd27` (confirmed against the live remote with `git ls-remote`), 0 ahead / 0 behind,
  worktree clean.
- **Isolated worktree** created at `…/Vibe Coding/Operation System/wt-product-strategy-board-p0` on
  branch `feature/product-strategy-board-p0`, based on `e9fcd27`.
- **`C:/km-lb` untouched** (a pre-existing worktree on another branch; `CLAUDE.md` forbids modifying it).
- **No branch switch, reset, checkout or cleanup in the mainline working tree.**
- **No S1 TEMP diagnostic file** was read into this branch's changes or modified.
- **Files created: 1** — this document. Commit `5654db6`.
- **No push, no merge, no deploy, no Apps Script sync, no DB write, no frontend or `.gs` change.**

### 21.2 P0-R1 (this round)
- **Preconditions verified read-only before any change**, all seven from the brief:
  worktree is the designated one; branch `feature/product-strategy-board-p0`; **PRE HEAD
  `5654db64583797cdf4d2eda87968201cd7e7b358`**; its sole parent `e9fcd27`; worktree clean including
  untracked; the mainline worktree at `e9fcd27` and clean; `origin` carries no
  `feature/product-strategy-board-p0` branch — **expected, and this round pushes nothing**.
- **Files changed: 1 modified** (this document) **+ 4 created** (§22, all under
  `docs/prototypes/product-strategy-board/`).
- **No production file touched.** `index.html`, `assets/js/**`, `assets/css/**`, `assets/html/**` and
  every `.gs` file are byte-identical to `e9fcd27` on this branch — including `supplychain.js` and
  `supply-chain-canvas.css`, which §11.5 describes and does not modify.
- **No S1 file** read into a change or modified. **`C:/km-lb` untouched.** **Mainline worktree
  untouched** — no branch switch, reset, checkout or cleanup anywhere.
- **No table created, no DB write, no API implemented, no AI implemented, no dependency added, no flag /
  release / build change, no Apps Script sync, no deployment, no push, no merge.**

### 21.3 P0-R2 (the interactive price band)
- **Preconditions verified read-only before any change:** the designated worktree; branch
  `feature/product-strategy-board-p0`; **PRE HEAD `98ea5adae75298f212fad09cde3c88dae9460325`**; its sole
  parent `5654db6`; worktree clean including untracked; the mainline worktree clean; `origin` still
  carries no `feature/product-strategy-board-p0` branch — **expected, and this round pushes nothing**.
- **Files changed: 4 modified**, all under `docs/` — this document (§22 plus the header) and the three
  prototype files, plus its `README.md`.
- **No production file touched.** `index.html`, `assets/**` and every `.gs` are byte-identical to
  `e9fcd27` on this branch — verified by object hash, including `supplychain.js` and
  `supply-chain-canvas.css`, which §11.5 describes and does not modify.
- **No S1 file** read into a change or modified — `TEMP_S1_POSITIVE_RESIDUAL_READINESS_CENSUS.gs` hashed
  identical. **`C:/km-lb` untouched. Mainline worktree untouched** — no branch switch, reset or checkout.
- **No table, no migration, no DB write, no API, no AI, no dependency, no flag / release / build change,
  no Apps Script sync, no deployment, no push, no merge.**

### 21.4 P0-R3 (the data contract and the executive report)
- **Preconditions verified read-only before any change:** the designated worktree; branch
  `feature/product-strategy-board-p0`; **PRE HEAD `3d762cc326f6978091aa556ab4ef0dc12907c527`**; worktree
  clean including untracked; the mainline worktree clean and untouched.
- **Files changed: 5 modified, 3 added, 7 image copies added** — all under `docs/`.
- **The audit was a READ.** Every source file quoted in §23 was opened read-only. `assets/**` is
  byte-identical to the branch base by object hash, the seven copied photographs included — the copies
  are under `docs/`, and `assets/img/products/` itself is unchanged.
- **No production file touched.** `index.html`, `assets/**` and every `.gs` hash identical to `e9fcd27`.
- **No S1 file** read into a change or modified. **`C:/km-lb` untouched. Mainline worktree untouched.**
- **No network request, no storage, no dependency, no table, no migration, no DB write, no API, no AI,
  no flag / release / build change, no Apps Script sync, no deployment, no push, no merge.**

---

### 21.5 P0-R3-R1 (the image-identity correction)
- **Preconditions verified read-only before any change:** the designated worktree; branch
  `feature/product-strategy-board-p0`; **PRE HEAD `2c7bb13966a5cbc9a3e68f34e9e52a0af9f2b461`**;
  worktree clean including untracked; **`git ls-remote` confirming `origin` carries no such branch**,
  because the round amends that commit and amending a published commit cannot be undone locally.
- **Files changed: 6 modified, 7 binaries deleted, 0 added** — all under `docs/`.
- **The re-audit was a READ.** `git grep`, `git log`, `git ls-files`. No file outside `docs/` was
  opened for writing, and **`assets/img/products/` is byte-identical to the branch base**.
- **No production file touched.** `index.html`, `assets/**` and every `.gs` hash identical to
  `e9fcd27`. No S1 file read into a change. **`C:/km-lb` untouched. Mainline worktree untouched.**
- **No network request, no storage, no dependency, no table, no migration, no DB write, no Drive
  write, no API, no AI, no flag / release / build change, no Apps Script sync, no deployment, no
  push, no merge.**

### 21.6 P0-R3-R2 (the category command center)
- **Preconditions verified read-only before any change:** the designated worktree; branch
  `feature/product-strategy-board-p0`; **PRE HEAD `0b71e6c566173e45c2dde38eeeae67474c8b4de8`**;
  worktree clean including untracked; **`git ls-remote` confirming `origin` carries no such
  branch**, because the round amends that commit.
- **Files changed: 6 modified, 7 image binaries added, 0 deleted** — all under `docs/`.
- **`assets/img/products/` is untouched** — 138 files, byte-identical to the branch base; the seven
  copies were hash-checked against their sources and live under `docs/`.
- **No production file touched.** `index.html`, `assets/**` and every `.gs` hash identical to
  `e9fcd27`. No S1 file read into a change. **`C:/km-lb` untouched. Mainline worktree untouched.**
- **No network request, no DB or API read, no DB / Drive write, no storage, no dependency, no CDN,
  no table, no migration, no flag / release / build change, no Apps Script sync, no deployment, no
  push, no merge.**

## §22 — The non-runtime prototype (P0-R1, extended in P0-R2, rebuilt in P0-R3)

> **P0-R3 superseded most of this section.** The prototype is now three files behind an adapter — the
> contract (`data-contract.js`), the invented data (`preview-fixture.js`) and the renderer
> (`prototype.js`) — and the screen is an executive report. The rules recorded below still hold and are
> still enforced; the counts and the file list are P0-R2's. The current description is §23–§28 and the
> prototype's own `README.md`.

**Path:** `docs/prototypes/product-strategy-board/`
— `index.html`, `prototype.css`, `prototype.js`, `README.md`

**How to open it:** double-click `index.html`, or open the local file path in a browser. No server,
no build step, no install; it runs from `file://`.

### 22.1 What P0-R2 changed, and why

P0-R1 illustrated the information architecture with static cards, and the operator's acceptance
found the gap: **the point of this screen is not a card, it is an axis.** A Series' price
architecture is a question about where every SKU sits relative to every other one, and that cannot
be read from a stack of cards. So the price band stopped being a sketch and became the working
centrepiece.

| | P0-R1 | P0-R2 |
|---|---|---|
| Price band | a hand-drawn illustration | **a real X/Y chart**: X = SKU, Y = price, hand-built inline SVG |
| SKU choice | fixed, three cards | **multi-select selector** with search, Select all, Clear all |
| Filters | present, inert | **Series / Company / Country / Marketplace all really filter** |
| Analysis | pre-written text | **computed live** from the mock data, re-computed on every change |
| Gap threshold | a fixed label | **an input** that drives the arithmetic |
| Currencies | two illustrated tracks | **three panels**, one per currency, each with its own Y axis |
| Board tools | every button opened a dialog | **Text / Price Band / Matrix really work**, and delete; the rest are **disabled** |
| Verification | none | **120 DOM assertions**, run on load, restoring the page afterwards |

### 22.2 What it is, and what it deliberately is not

| | |
|---|---|
| **Is** | The first-priority screen, working: the price band, the SKU selector, the filters, the analysis arithmetic and three board elements — plus every refusal §9 and §15 require |
| **Is not** | Runtime. Not a page of the app, not a data layer, not persistence, and not the Canvas Core |

**What is open** is listed in `README.md`. **What is not open is not pretended:** drag, resize, pan,
zoom, board multi-select and z-order are absent, the page says so where the tools are, and the tools
that need P1 work (`SKU_CARD`, `REGIONAL_SKU_CARD`, `DEAL_PLAN`, `CHART`, `GROUP`, `CONNECTOR`) are
**disabled controls rather than buttons wired to a dialog**. A prototype that answers every click
with an apology teaches the reader nothing about which parts are real.

### 22.3 Hard constraints, all satisfied

| Constraint | How, and how it is checked |
|---|---|
| Local mock data only | One `MOCK` object whose own `note` field declares it invented. Every SKU, price and campaign is made up |
| No network request | **Scanned with comments *and string literals* stripped first: zero occurrences** of `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, dynamic `import(`, `KM.*`, `google.script`, `http://`, `https://`. Stripping matters: the file's own disclaimers name every API it promises not to use, so a raw grep counts those as hits |
| No production DB read | No client accessor referenced, no action invoked, no Apps Script URL |
| No storage | `localStorage` / `sessionStorage` / `indexedDB` / `openDatabase` are never called. State lives in one object; **reload clears it, and that is this round's intended behaviour** |
| Exactly two subresources | `prototype.css` and `prototype.js`, both local siblings — asserted by the page itself (N3) |
| No dependency | Plain HTML + CSS + vanilla JS; the charts are `createElementNS` SVG. **Zero** `@import`, `@font-face` or `url()` in the CSS |
| Not loaded by the app | Nothing in the app's `index.html` or under `assets/**` references `docs/prototypes/**` |
| No production frontend change | Zero bytes changed under `assets/**` or in the app's `index.html` |
| Not deployed | `docs/**` is in no deployment or bundle |
| No table or migration | None is created, and there is nothing to write to |

### 22.4 The chart, and the rules it obeys

X axis is SKU, Y axis is price, and **five levels per SKU**: `msrp` (top tick), `regular_price`
(filled circle — the band basis, D-2), `official_deal_price` (filled diamond, only where
`campaign_sku_lines.promo_price` exists), `proposed_deal_price` (dashed hollow diamond, D-4) and
`minimum_price` (bottom tick). The vertical bar from minimum to MSRP **is** the price band.

Every §9 rule is enforced by the code rather than described by it:

| Rule | Where |
|---|---|
| **D-2** — `pricing_list.regular_price` is the only basis; absent ⇒ `SOURCE_MISSING`, listed and **plotted nowhere**, never back-filled from `sku_details.selling_price` | one member of the mock data has no price row, and the self-test proves it never becomes a point |
| **D-3** — one panel per currency, own axis, own domain, **no shared axis, no FX** | three currencies in the data; the self-test proves no panel mixes two and no finding crosses two |
| **D-4** — a proposal is a third marker, visually distinct, and every finding it causes is labelled `PROPOSAL-DRIVEN` | two proposals in the data, driving one overlap and one cannibalisation |
| **D-6 / D-8** — current selling price and margin are absent, with nothing standing in | stated in the tooltip and the details panel; the self-test looks for a **figure** beside the word rather than the word, so the honest absence-statement is not mistaken for a violation |
| **§9.3.4** — every comparison in **integer cents** | `cents()` at the top of the file, and the two boundary rules below |
| **§9.3.5** — entry / core / premium are **positions in the sorted list**, not a column | computed per panel; a single-member panel says `only` |
| **§9.3.4** — a gap marking must display the threshold that produced it | every gap finding and every on-chart gap label carries it |

**The two boundary rules, each with a case sitting in the default data on purpose:**

- a step **exactly equal** to the threshold is **not** a gap — `CO1190-R → CO1195-R` is exactly
  `8.00` against the default `8.00`;
- intervals meeting at **a single point** are **not** an overlap — `CO1160-R`'s regular `52.99`
  equals `CO1180-R`'s deal `52.99`. The same touch **is** a cannibalisation, because that test is
  `≤`, and the two tests differing at the boundary is deliberate rather than an oversight.

### 22.5 The verification

**120 automated DOM assertions, run on load**, against the real DOM: they tick real checkboxes,
change the real selects, read back the rendered SVG, and **restore the starting selection when they
finish**. A badge in the top banner shows the count; a detail list and the browser console carry the
failures; a button re-runs them.

Groups: **A** integer cents · **B** empty state · **C** multi-select changes the X-axis item count ·
**D** Select all / Clear all · **E** search · **F** Series replaces the universe · **G** band bounds
per SKU · **H** the three markers, legend and axes · **I** `SOURCE_MISSING` never becomes a point ·
**J** currency never shares an axis · **K** gap / overlap / cannibalisation values and the two
boundary rules · **L** the four filters · **M** Text / Price Band / Matrix create, edit and delete ·
**N** no storage, no network, no substituted price · **Z** the page is restored.

**Two of these assertions were wrong when first written, and the corrections are worth recording**,
because both are mistakes this document warns about elsewhere. One counted marker elements without
scoping to the chart, so it also counted the **legend's own swatches** — a measurement whose subject
was wider than its name. The other scanned the self-test function for the forbidden API names, and
the self-test has to *name* them in order to look for them — a check that could only ever fail,
about itself. Both now assert the narrower, real thing.

---

## §23 — Canonical source audit (P0-R3)

> **Why this section exists.** P0-R2 produced a convincing screen out of invented data. A convincing
> screen is exactly the thing that must not be mistaken for a finding, and the way to make sure it
> is not is to write down — from the shipped source, at cited lines — what the real data actually
> is. Everything in §24 is built on this section and nothing in it is inferred from a field name.
>
> **Correction of record, restated because it matters:** every SKU, price, deal and warning shown in
> P0-R2 was mock. None of it came from `sku_details`, `marketplace_skus`, `sku_regional_details`,
> `pricing_list`, `campaigns` or `campaign_sku_lines`, and no gap, overlap or cannibalisation on that
> screen was a conclusion about Kitchen Mama's products.

### 23.1 The fourteen questions, answered

**1 — Live column names.** Re-verified verbatim against the shipped declarations; §4.1–4.7 are
correct and unchanged. The authorities are `sku-details.js:2369` (43 columns),
`04_marketplace_forecast_import.gs:151` / `:152` (the `marketplace_skus` and `pricing_list`
required-header gates, checked before any write), `18_sku_regional_handlers.gs:17`,
`20_campaign_write_handlers.gs:28` and `:40`.

**2 — Primary keys.**

| Table | Primary key | Business grain |
|---|---|---|
| `sku_details` | `sku` | one row per MASTER sku |
| `marketplace_skus` | `marketplace_sku_id` | `sku + company + country + marketplace` |
| `sku_regional_details` | `regional_detail_id` | the same four-part grain (`18_:13`) |
| `pricing_list` | `pricing_id` | one row per `marketplace_sku_id` |
| `campaigns` | `campaign_id` | `company\|country\|marketplace\|campaign_name\|year` (`20_:49`) |
| `campaign_sku_lines` | `campaign_sku_line_id` | `campaign_id + marketplace_sku_id` |

**3 — The join grain.** One contract row = one operational site SKU = one `marketplace_skus` row.

```
sku_details.sku            -> marketplace_skus.sku                    (1 master : N sites)
marketplace_skus(sku, company, country, marketplace) -> marketplace_sku_id
marketplace_sku_id         -> pricing_list.marketplace_sku_id          (1 : 1)
marketplace_sku_id         -> campaign_sku_lines.marketplace_sku_id    (1 : N deal lines)
campaign_sku_lines.campaign_id -> campaigns.campaign_id                (period + status)
sku + (company, country, marketplace) -> sku_regional_details          (same grain)
```

**`pricing_list` has no `company` column,** so joining it on `(country, marketplace, sku)` cannot
separate two companies operating the same site SKU. That join is ambiguous and must never be
implemented.

**4 — Series authority.** `sku_details.series`. Master grain only; required by both import gates.
It is the **only** grouping column that exists — and it groups a *series*, not a *model*, which is
why §25 exists.

**5 — Product name authority.** `sku_details.product_name`. Required by the import contract
(`sku-details.js:2371`) but **not** by the pre-write header gate (`04_:150`), so a row can exist
without one. Nullable on read. A Chinese companion `product_name_cn` appears in the editable-field
allowlist (`03_:125`) but **not** in the 43-column export schema — a real asymmetry, recorded and
not used.

**6 — Product image. The column exists and it has an owner chain.**

| Layer | Evidence |
|---|---|
| Column | `sku_details.image_url`, in the 43-column export schema (`sku-details.js:2369`) |
| Editable | `03_master_data_handlers.gs:132` — `image_url` is in `SKU_DETAILS_UPSERT_FIELDS_` |
| Client mapping | `operation-system-db-api.js:184` — `image: String(r.image_url || '')` |
| Render contract | **`km-image-reference-policy.js` (P1-B8C-R3)** — the single authority both pages ask. `sku-overrides.js` keeps `getNormalizedSkuImage` / `resolveSkuImageUrl` / `classifySkuImageSource` under the same names and delegates to it; `classifySkuImageSource` now returns `PRESENT` / `ABSENT` / **`REFUSED`** with a reason |
| Reported as a data gap | `sku-handbook.js:502-506` counts `skus_with_image_url` / `skus_without_image_url` and calls the second *"a DATA gap — fill in sku_details.image_url"* |

The format is a **URL string**, and the shipped resolver already knows one way it fails: an
`http://` image on an `https://` page is mixed content and is upgraded at render time
(F1-7N-FB-4E-R3 §F, now inside `km-image-reference-policy.js`). The board inherits that
classification. It does **not** inherit the resolver's `localStorage` override branch. See §26 for
the local-file question.

> **P1-B8C-R3 — "the board inherits that classification" WAS THE PLAN AND NOT THE CODE.** The board
> had its own rule (`imageStateOf`: an absolute `http(s)` URL or nothing) while SKU Details had
> another (pass everything through). A repo-relative `image_url` — **the shape production actually
> holds**, per the seven operator-asserted `verified_mappings` and P1-B8C-R2's sixty live rows —
> rendered on one page and was refused on the other. §53 records the correction. The format line
> above is now enforced by one function rather than described in two places.

**7 — Master SKU vs site SKU.** `sku_details.sku` is the master identity. `marketplace_skus.site_sku`
is the listing code on that site, and `marketplace_sku_id` is the site identity. One master maps to
N sites. `sku_regional_details` carries its own copy of `site_sku` at the same grain, which is a
convenience column and not a second authority.

**8 — Colour / variant identity. There is none.** Searched across
`assets/specs/active/apps-script/*.gs`: no `parent_sku`, no `variant_group`, no `model`, no
`model_code`, no colour column, in any of the six tables. This is a **GAP**, not a missing value.
The naming convention (`CO1150-R`, `CO1150-T`) is visible and is **not** evidence: a shared prefix is
a habit, and §25 refuses to treat it as a declaration.

**9 — Regular / minimum / MSRP / currency.**

| Level | Table | Columns |
|---|---|---|
| **Site-effective (the board's basis)** | `pricing_list` | `regular_price`, `minimum_price`, `msrp`, `currency` |
| Master base inputs | `sku_details` | `minimum_price` + `minimum_price_unit`, `msrp` + `msrp_unit`, `selling_price` + **`selling_unit`** |

Three price fields with three different unit-column spellings, and decision **D-2** forbids using
the master values as a fallback for the site ones. **Two currency columns exist** —
`marketplace_skus.currency` and `pricing_list.currency`. The price row wins, because it is the
currency *of those numbers*; reading the other one would let a panel be labelled in a currency its
prices are not in.

**10 — Official deal price and campaign period.** `campaign_sku_lines.promo_price` is the only
authoritative deal price (`20_:36`). The **period is not on the line** — it is
`campaigns.start_date` / `campaigns.end_date`, reached through `campaign_id`. `price_units` is a
display/audit currency snapshot and the shipped file explicitly refuses to let it be an FX rate
(`20_:37-39`).

**11 — Status. There are five, and they are not interchangeable.**

| Status | Table.column | Vocabulary |
|---|---|---|
| Master lifecycle | `sku_details.lifecycle` | `00_config.gs:9` `VALID_LIFECYCLES_` |
| **Site status** | `marketplace_skus.marketplace_sku_status` | `00_config.gs:12` `VALID_MARKETPLACE_SKU_STATUSES_` |
| Price row | `pricing_list.price_status` | not pinned in config |
| Deal line | `campaign_sku_lines.line_status` | not pinned in config |
| Campaign | `campaigns.status` | not pinned in config |

`sku_regional_details` has **no status column at all** — the file says so itself (`18_:16`). Site
status therefore comes from `marketplace_skus`, which is the mapping correction §4.5 already made.

**12 — What `skuDetails.workspace.get` can actually read.** Five tables, and only five
(`59_api_v1_sku_details_workspace.gs:46-52`):

| Table | Gate |
|---|---|
| `sku_details` | BASE, always, `requiredCols: ['sku']`, fail-closed |
| `tax_referral_rates` | BASE, always |
| `tax_rate_components` | BASE, always |
| `marketplace_skus` | **include-gated `regional`** |
| `sku_regional_details` | **include-gated `regional`** |

Every array is **raw passthrough** — each source row unmodified — so every live column, `image_url`
included, arrives. The cap is `SKD_WS_ROW_MAX_ = 50000` and truncation is reported via `capped.*`,
never silent (`59_:74-82`). An un-requested include costs no read (`59_:164`). **It reads no
pricing and no campaign data.**

**13 — Is there a bounded read owner for pricing or campaigns? No.**

| Route | What it is | Why it is not an owner |
|---|---|---|
| `getOperationDb` | 44 tabs in one response (`03_:31`) | Reads 44 tabs to answer one question; **D-5** forbids it in P1 |
| `getTable?table=…` | one whole tab (`03_:52`) | `readSheetAsObjects_` then `filterRows_` and nothing else — no scope, no bounds, no pagination, no cap |

`filterRows_` (`02_core_sheet_db.gs:90-118`) drops only rows with no identifying key; it is a
blank-row filter, not a scope. The router's campaign actions are **writes** — `upsertCampaign` and
`upsertCampaignSkuLines` (`01_router.gs:857-864`). There is no campaign read action and no pricing
read action of any kind.

**14 — What has no API owner at all.**

| Thing | State |
|---|---|
| `pricing_list`, `campaigns`, `campaign_sku_lines` | No **bounded** owner. Reachable only through the two unbounded legacy routes above. |
| `variant_group` / `variant_name` | No **column**, so nothing to own. |
| `product_strategy_boards` / `_elements` / `_revisions` | The tables do not exist. Proposed in §6; nothing is created. |

### 23.2 What the audit changed about the design

Nothing in §4 was wrong. Three things it did not say are now recorded: the **image column is real
and already has a client mapping and a render contract** (§26); **two currency columns exist and one
of them is the wrong one to read**; and **the period of a deal lives on the campaign, not on the
line**, so a `promo_price` whose campaign cannot be resolved is a price with no validity and must
not be drawn as a live deal.

---

## §24 — `ProductStrategyDataContract` (P0-R3, frozen)

One contract row = **one operational site SKU**. The contract is machine-readable in
`docs/prototypes/product-strategy-board/data-contract.js`; this table is its authority.

**Two words that are not interchangeable, and the contract depends on the difference:**
- **ABSENT VALUE** — the column exists and this row's cell is empty → `SOURCE_MISSING`.
- **ABSENT COLUMN** — no table has this field at all → **GAP**.

The first is a data question and can be fixed by typing. The second is a schema question and needs a
decision. Reporting one as the other is how a board comes to promise something nobody can supply.

| # | Field | Source table | Source column | Join key | Nullable | On missing | API today | Needs P1-B1 |
|---|---|---|---|---|---|---|---|---|
| 1 | `identity` | `marketplace_skus` | `marketplace_sku_id` | the site identity | no | `CONTRACT_MISMATCH` | ✔ `skuDetails.workspace.get` + `include.regional` | — |
| 2 | `master_sku` | `sku_details` | `sku` | `= marketplace_skus.sku` | no | `CONTRACT_MISMATCH` | ✔ base | — |
| 3 | `site_sku` | `marketplace_skus` | `site_sku` | same row as identity | yes | `SOURCE_MISSING` | ✔ regional | — |
| 4 | `product_name` | `sku_details` | `product_name` | `sku` | yes | `SOURCE_MISSING` | ✔ base | — |
| 5 | `series` | `sku_details` | `series` | `sku` | no | `SOURCE_MISSING` | ✔ base | — |
| 6 | `variant_group` | — | — | — | yes | **`VARIANT_GROUPING_SOURCE_MISSING`** | ✘ **GAP** | **yes — new column** |
| 7 | `variant_name` | — | — | — | yes | **`VARIANT_GROUPING_SOURCE_MISSING`** | ✘ **GAP** | **yes — new column** |
| 8 | `company` | `marketplace_skus` | `company` | site grain | no | `CONTRACT_MISMATCH` | ✔ regional | — |
| 9 | `country` | `marketplace_skus` | `country` | site grain | no | `CONTRACT_MISMATCH` | ✔ regional | — |
| 10 | `marketplace` | `marketplace_skus` | `marketplace` | site grain | no | `CONTRACT_MISMATCH` | ✔ regional | — |
| 11 | `currency` | `pricing_list` | `currency` | `marketplace_sku_id` | no | `SOURCE_MISSING` | ✘ | **yes — read owner** |
| 12 | `regular_price` | `pricing_list` | `regular_price` | `marketplace_sku_id` | yes | `SOURCE_MISSING` | ✘ | **yes — read owner** |
| 13 | `minimum_price` | `pricing_list` | `minimum_price` | `marketplace_sku_id` | yes | `SOURCE_MISSING` | ✘ | **yes — read owner** |
| 14 | `msrp` | `pricing_list` | `msrp` | `marketplace_sku_id` | yes | `SOURCE_MISSING` | ✘ | **yes — read owner** |
| 15 | `official_deal_price` | `campaign_sku_lines` | `promo_price` | `marketplace_sku_id` | yes | `SOURCE_MISSING` | ✘ | **yes — read owner** |
| 16 | `official_deal_start` | `campaigns` | `start_date` | `campaign_id` | yes | `SOURCE_MISSING` | ✘ | **yes — read owner** |
| 17 | `official_deal_end` | `campaigns` | `end_date` | `campaign_id` | yes | `SOURCE_MISSING` | ✘ | **yes — read owner** |
| 18 | `product_image` | `sku_details` | `image_url` | `sku` | yes | `IMAGE_SOURCE_MISSING` | ✔ base (raw passthrough) | — |
| 19 | `lifecycle_status` | `sku_details` | `lifecycle` | `sku` | no | `SOURCE_MISSING` | ✔ base | — |
| 20 | `source_status` | `marketplace_skus` | `marketplace_sku_status` | site grain | no | `SOURCE_MISSING` | ✔ regional | — |
| 21 | `missing_reasons` | — | derived | — | no (always an array) | `CONTRACT_MISMATCH` | derived | — |
| 22 | `provenance` | — | derived | — | no | `CONTRACT_MISMATCH` | derived | — |

**Nine of the twenty-two fields cannot be supplied by any bounded read that exists today** — every
price, the currency, and every part of the official deal. **Two have no column at all.**

**Fields deliberately NOT in the contract, and they stay out:** `current_selling_price` (D-6 — no
source of record; `regular_price`, `selling_price` and `promo_price` are each a different thing and
none of them is it) and `margin` (D-8 — no cost source). A field with no source is left out rather
than filled from a neighbour.

---

## §25 — Variant grouping contract (P0-R3)

The operator's requirement: *when one model differs only by colour and every price is identical,
show one product node; when any price differs, split them.* That requires knowing which SKUs are
variants of one model, and **the database cannot say** (§23.1 Q8).

| Rule | |
|---|---|
| **Authority** | `variant_group`. State: **GAP** — no column proves it. |
| **Merge** | Two rows merge into one product node only when they share the **same non-empty `variant_group`** AND all four prices — `regular_price`, `minimum_price`, `msrp`, `official_deal_price` — are **equal to the cent**. |
| **Split** | Any difference in any one of those four makes a **distinct price variant** with its own column. A price band is a statement about price; two prices cannot occupy one position on a price axis. |
| **Refuse** | A row with no `variant_group` is rendered **alone** and labelled `VARIANT_GROUPING_SOURCE_MISSING`. It is never merged, not even with a row it obviously belongs to. |
| **Never** | Derive a group from the SKU string. Truncating at a dash would merge on a naming habit, and a habit that is right 95% of the time merges the other 5% wrongly and **invisibly** — the merge, once made, looks exactly like a correct one. |
| **Representative** | A merged node shows ONE image, from the member whose image identity is provable. It publishes the **variant count** and **lists every merged SKU**, so the merge is legible rather than a number that hides its members. |

**What P1-B1 must add for this to work on real data:** a `variant_group` (or `parent_sku`) column on
`sku_details`, with a `variant_name` beside it, and an owner for both. Until then a real-data board
will show every SKU separately and say why — which is the correct behaviour, not a degraded one.

---

## §26 — Product image source audit (P0-R3, **corrected and re-measured by P0-R3-R1**)

> **P0-R3's rule 2 is RETRACTED.** It admitted a local file on two conditions — the filename **is**
> the SKU, and that SKU is corroborated by a shipped reference elsewhere in the repo. Those two
> facts corroborate the **SKU**. They say nothing about the **bytes**. The evidence and the claim
> are about different things, and on a price board a wrong photograph is indistinguishable from a
> right one. All seven local copies were re-audited against a real identity standard, none met it,
> and all seven were removed.

### 26.1 The evidence standard

A file may be shown as a product's photograph only with at least one of these:

| | Evidence that proves *this exact file belongs to this exact SKU* |
|---|---|
| **A** | `sku_details` data, or a controlled fixture source, whose `image_url` for that SKU names that exact file |
| **B** | A shipped mapping file recording master SKU → exact local image path |
| **C** | A shipped renderer or importer carrying a traceable SKU → exact image asset mapping |
| **D** | Any other repo content that directly proves this exact file belongs to this exact SKU |

**None of these is evidence on its own:** the filename contains the SKU · the SKU appears in tests ·
the SKU appears in mock data · the images look alike · the directory is called `products` · a person
thinks it looks right · **a hash matches** — a hash proves the copy is faithful, not what it is a
copy *of*.

No web search and no download may be used to supply the missing evidence.

### 26.2 The re-audit, probe by probe

| Probe | Result |
|---|---|
| `git grep` for `img/products`, `images/products`, `product_images` across **all** tracked files of every type | **0 hits** |
| Any tracked file naming any of the seven filenames | **0** |
| A manifest, index or provenance file beside the images | **none.** `assets/img/` carries only `earth/PROVENANCE.md`, for a different asset set |
| Any `image_url` **value** anywhere in the repository | **none.** Every occurrence is a schema header, an allowlist entry (`03_master_data_handlers.gs:132`), a client field map (`operation-system-db-api.js:184`) or a spec line — declarations, never data |
| Any CSV / import fixture carrying an image column | **none.** The repo's two CSVs (`amazon_daily_sales_snapshot`, `logistics_locations_import_template`) have no image column |
| A shipped SKU → local-path resolver | **none.** The one SKU→image mechanism, `getSkuImageOverride` (`sku-overrides.js:26`), reads `localStorage['km_sku_image_overrides_v1']` — a per-browser store a person types into, not a repository artifact |
| What the shipped pipeline actually expects | **remote URLs.** `resolveSkuImageUrl` (`sku-overrides.js:76`) upgrades `http://` to `https://`, and `operation-system-db-api.js:6180` tells the operator to *"add image paths to Google Sheet"* |
| How `assets/img/products/` arrived | one bulk commit, `864d1d8` *0526_SKU Details資料建置_Submit*. Provenance for **when**, not for **which SKU** |

### 26.3 The seven files, one row each

Every row below carries the same verdict, and it is worth seeing why: the hash column is real and
it is the one column that proves nothing about identity.

| Prototype path | Original repo path | Claimed SKU | Object hash | Identity evidence | Class | Verdict | Action |
|---|---|---|---|---|---|---|---|
| `images/CO1100-R.jpg` | `assets/img/products/CO1100-R.jpg` | CO1100-R | `8659b25aebdc0d20d92c849a19f09d315ed9d069` | none found | — | **UNVERIFIED** | **REMOVE** |
| `images/CO1150-R.jpg` | `assets/img/products/CO1150-R.jpg` | CO1150-R | `22742b8f4d70c872fc165703d195da7dc0512d32` | none found | — | **UNVERIFIED** | **REMOVE** |
| `images/CO1200-R.jpg` | `assets/img/products/CO1200-R.jpg` | CO1200-R | `bf83977e44b980254623908fb37122d68e6aa4a1` | none found | — | **UNVERIFIED** | **REMOVE** |
| `images/CO2102-R.jpg` | `assets/img/products/CO2102-R.jpg` | CO2102-R | `c355b556a8029ead6402893a0b759c284202c727` | none found | — | **UNVERIFIED** | **REMOVE** |
| `images/CO2300-R.jpg` | `assets/img/products/CO2300-R.jpg` | CO2300-R | `60f8e92c8958b780d6aa1e3101e15019aeb0c07e` | none found | — | **UNVERIFIED** | **REMOVE** |
| `images/CO2600-R.jpg` | `assets/img/products/CO2600-R.jpg` | CO2600-R | `d69bc8ac5d6c1b31cdabe71572fdf0d6690e276b` | none found | — | **UNVERIFIED** | **REMOVE** |
| `images/CO5600-R.jpg` | `assets/img/products/CO5600-R.jpg` | CO5600-R | `3a4af65c8410da5b0403ab5d1ad2d6c523e53c84` | none found | — | **UNVERIFIED** | **REMOVE** |

**Kept: 0. Removed: 7. Final preview image count: 0.** The `images/` directory is gone, no source
file references an image file, and the prototype ships no image binary of any kind — measured by
walking the whole prototype tree for `.jpg/.jpeg/.png/.gif/.webp/.svg/.bmp/.avif/.ico`.

`assets/img/products/` itself is **unmodified** — 138 files, byte-identical to the branch base. The
old A/B/C tiering (94 / 43 / 1) is superseded: **Tier A was never an identity claim**, and counting
it as one is the error this round corrects.

### 26.4 The live image contract, unchanged and now frozen in fields

Removing the preview copies removed a *preview* claim. `ProductStrategyDataContract.product_image`
still has exactly one authority, `sku_details.image_url`, and P1-B1 inherits these — as checkable
properties of `IMAGE_POLICY`, not as prose:

| Rule | Field |
|---|---|
| One authority, and no second | `authority: 'sku_details.image_url'` |
| Column empty → say so | state `IMAGE_SOURCE_MISSING` |
| URL supplied but will not load → say so | state `IMAGE_LOAD_FAILED` |
| Never fall back to a same-named local file | `fallback_to_local_file: false` |
| Never substitute another SKU's photograph | `fallback_to_another_sku_image: false` |
| Never let a placeholder read as a product photo | `placeholder_may_read_as_a_product_photo: false` |
| No network image loading in this round | `network_image_loading_in_this_round: false` |
| Local copies shipped in the preview | `local_copies_in_preview: 0` |

The no-local-fallback rule is enforced **structurally** rather than by intent: the renderer assigns
`n.image` to `src` verbatim and composes no directory, filename or extension of its own. The
assertion reads the renderer's own source for `images/`, `.jpg` and `assets/`, so the rule cannot be
broken without a test noticing.

### 26.5 The missing state on screen

The card keeps its **full height** — a card that shrinks when a photograph is absent turns a data
gap into a layout event. Flat neutral ground, a quiet field label `IMAGE SOURCE MISSING`, and one
plain sentence, *Product image unavailable in preview source*. No broken-image glyph, no invented
product outline, nothing red, and no `svg` / `canvas` / `picture` standing in. On a load failure the
same slot reads `IMAGE LOAD FAILED` — *The image on record could not be loaded* — and the failing
URL is left exactly as it was.

In the Insight Drawer the absence is reported **once per reason**, not once per product. Eleven
copies of one sentence is the wall of warnings §21 exists to prevent; the reader needs the count,
the reason and the list, once. Two reasons are two findings, because *"the column is empty for this
row"* and *"no source can say which file this is"* are different problems with different owners.

### 26.6 What P1-B1 should decide

1. **Give `assets/img/products/` an owner, or stop treating it as a source.** 138 files, named by
   SKU, referenced by nothing. Either a shipped mapping and a documented naming rule (which would
   satisfy evidence class B and make them usable), or an explicit statement that they are not a
   source and the board never looks at them.
2. **A blank-`image_url` report.** `sku-handbook.js:502-506` already counts the gap; a strategy
   board is the natural second consumer of that count.
3. **Where authoritative images will be hosted.** The shipped pipeline expects a URL and upgrades
   `http://` to `https://`; a board that renders images over `file://` or in a print sheet needs
   that host to be reachable and stable, or the `IMAGE_LOAD_FAILED` state becomes the normal one.

---

## §27 — The data adapter seam (P0-R3)

```
ProductStrategyDataAdapter.load(filters) -> LoadResult
  filters     { series, company, country, marketplace, search }
  LoadResult  { state, rows, row_count, fields, refusals, provenance, notice,
                applied_filters, capped }
```

**Rules the interface imposes.**
- Every row has **every** contract field as an own property. A missing field is
  `CONTRACT_MISMATCH`, not an `undefined` the renderer has to guess about.
- A `null` value is a value: the source had nothing, and `missing_reasons` says which.
- The adapter never computes a price, never substitutes one field for another, and never invents a
  deal, an image, a margin or a current selling price.
- A filter the adapter cannot apply at the source is reported as `applied_at: "client"`, never
  silently ignored.

**The five refusal states.**

| State | Meaning |
|---|---|
| `SOURCE_NOT_CONNECTED` | No connection to the Operation System database was attempted or exists. |
| `SOURCE_MISSING` | A column exists and this row has no value in it. |
| `PARTIAL_DATA` | Some rows or fields resolved and others did not; both counts are reported. |
| `CONTRACT_MISMATCH` | A row does not have the shape the contract requires. |
| `MIXED_CURRENCY_REFUSED` | Rows in more than one currency were asked to share one price axis. |

**The two implementations.**

| Adapter | This round |
|---|---|
| `PreviewProductStrategyDataAdapter` | **Implemented and enabled.** Returns invented rows in contract shape. `provenance.connected = false`, `provenance.requests_made = 0`. |
| `OperationDbProductStrategyDataAdapter` | **Defined and disabled.** `load()` returns `SOURCE_NOT_CONNECTED`, zero rows, `requests_made: 0`. It contains no transport call and no client accessor reference; it carries the interface, the response contract, the list of tables it is waiting on, and the instruction that it **must not become a second read authority** for the three tables that already have one. |

**Why it is disabled rather than merely unused.** Three of the six tables have no bounded read
owner. Enabling it before P1-B1 would mean reading them through the 44-tab legacy path, which D-5
refuses. The refusal is a value returned by the object, not a comment about it, and the prototype's
own assertions check it as a property.

---

## §28 — P1-B1 handoff (P0-R3, design only — nothing is implemented or deployed)

### 28.1 What can be reused as-is

| Need | Existing action | Reuse |
|---|---|---|
| `sku_details` (incl. `image_url`, `series`, `lifecycle`, `product_name`) | `skuDetails.workspace.get` | **Direct.** Already bounded, already raw passthrough. |
| `marketplace_skus`, `sku_regional_details` | `skuDetails.workspace.get` with `include.regional` | **Direct.** Include-gated, so no read cost when not requested. |

**Do not create a second owner for these three tables.** They have one; two owners of one resource
disagree, and the first symptom is a screen that contradicts another screen.

### 28.2 What is missing, and the one action that closes it

| Table | Owner today | Needed |
|---|---|---|
| `pricing_list` | none (bounded) | ✔ |
| `campaigns` | none (bounded) | ✔ |
| `campaign_sku_lines` | none (bounded) | ✔ |

**Proposed action — ONE, not three:** `productPricing.workspace.get`.

One action, because the three tables are only ever read together for this purpose and three actions
would mean three round trips and three chances for the scope to drift apart. It is a *workspace*
read in the shape `59_` and `61_` already established, not a new pattern.

**Request**

```json
{
  "action": "productPricing.workspace.get",
  "scope":  { "company": "…", "country": "…", "marketplace": "…", "series": "…" },
  "include": { "campaigns": true },
  "page":   { "limit": 2000, "cursor": null }
}
```

- `scope` is **required** and at least one of `company` / `country` / `marketplace` / `series` must
  be non-empty. An unscoped read is refused rather than answered with everything.
- `include.campaigns` gates the two campaign tables the way `include.regional` gates the two
  regional ones — an un-requested include costs no read.

**Response**

```json
{ "success": true,
  "data": {
    "pricing":          [ /* raw pricing_list rows in scope */ ],
    "campaigns":        [ /* raw campaigns rows in scope */ ],
    "campaignSkuLines": [ /* raw campaign_sku_lines rows for those campaigns */ ],
    "counts":  { "pricing": 0, "campaigns": 0, "campaignSkuLines": 0 },
    "capped":  { "pricing": false, "campaigns": false, "campaignSkuLines": false },
    "cursor":  null,
    "scope_applied": { "…": "…" }
  },
  "meta": { "action": "productPricing.workspace.get", "requestId": "…", "build": "…" },
  "errors": [] }
```

- **Raw passthrough**, like `59_`. The client normalises; the server does not reshape.
- **`capped` is reported, never silent** — `59_`'s rule, and the reason a truncated read cannot be
  mistaken for a short one.
- **Bounds:** a hard row cap per array plus `page.limit` / `cursor`. `pricing_list` is one row per
  site SKU and is the array that will grow.
- **Scope resolution:** `pricing_list` has no `company`, so a company scope resolves through
  `marketplace_skus` to a set of `marketplace_sku_id`s and filters on that. This is the join rule of
  §23.1 Q3, enforced server-side rather than trusted client-side.

### 28.3 Read-only and authorization contract

- **Read-only by construction.** The handler opens the spreadsheet through the same exact-ID gate
  the rest of the API uses and calls no writer. No `setValue`, no `appendRow`, no ensure-sheet.
- **No new authorization surface.** D-9 still holds: there is no backend RBAC, so this action is
  exactly as exposed as every other read action and must not be described as protected. If the
  pricing data needs restricting, that is a separate authorization round and this action waits for
  it.

### 28.4 Deployment, flag and rollback

| | |
|---|---|
| **New file** | `assets/specs/active/apps-script/<nn>_api_v1_product_pricing_workspace.gs` |
| **Modified** | `01_router.gs` — one action branch. `assets/js/api/*` — one client accessor. |
| **Sync required** | Both `.gs` files, copied by the **user** into the Apps Script project, then a deployment version. Never `clasp`. |
| **Flag** | `PRODUCT_PRICING_WORKSPACE_ENABLED_`, default **false**, in `00_config.gs`. The client falls back to showing `SOURCE_NOT_CONNECTED` while it is false — which is what the board already does today, so the fallback path is the one currently in production use. |
| **Rollback** | Set the flag false. The action stays deployed and unreachable; no data changes, because nothing was written. A read-only action needs no compensating write. |
| **Not in scope for B1** | The board tables (§6), any write path, any AI, any authorization change. |

### 28.5 Two decisions B1 needs before it starts

1. **`variant_group` / `variant_name`** — add the columns to `sku_details`, or accept that a
   real-data board shows every SKU separately (§25). Both are legitimate; only one of them is a
   product the operator asked for.
2. **The local product image directory** (§26.4) — give it an owner and a naming rule, or stop
   treating it as a source.

---

## §29 — P0-R3-R1: the image-identity correction, and the visual acceptance package

### 29.1 What was wrong, in one sentence

P0-R3 proved that seven SKUs are real and then showed seven photographs as if that were the same
proof. **Corroborating the SKU is not corroborating the image.** The two facts are about different
objects, and the gap between them is invisible on the page: a photograph of the wrong product looks
exactly as convincing as a photograph of the right one, which is precisely the failure mode that
this document's correction of record (P0-R3, header) was written about.

### 29.2 What changed

| | Before (P0-R3) | After (P0-R3-R1) |
|---|---|---|
| Admissible sources | `sku_details.image_url`, **plus** a filename-matched local file with a corroborated SKU | `sku_details.image_url`. **Nothing else.** |
| Local copies shipped | 7 | **0** |
| `images/` directory | present | **removed** |
| Image binaries anywhere under the prototype | 7 | **0** |
| Cards with a photograph (default view) | 8 | **0** |
| Cards stating the absence | 3 | **11** |
| Image findings in the drawer | 3 (one per product) | **2** (one per **reason**) |
| Renderer states | PRESENT / IMAGE_SOURCE_MISSING | PRESENT / IMAGE_SOURCE_MISSING / **IMAGE_LOAD_FAILED** |
| Fallback to a same-named local file | not stated | **`false`, and structurally impossible in the renderer** |
| DOM assertions | 285 | **312** |

Every price rule, boundary case, grouping rule, currency rule, refusal state, adapter behaviour and
preview label from P0-R3 is unchanged and still asserted. The audit (§23), the contract (§24), the
grouping contract (§25) and the handoff (§28) are untouched; only §26 is rewritten.

### 29.3 The demonstration got stronger, not weaker

The prototype's job is to show what the board does when the data is not there. With seven
photographs on screen, the refusal was a footnote on three cards. With none, **the refusal is the
page** — eleven cards holding their full size and saying, in report language, what is missing and
why. That is the state the board will actually be in on the day it first meets real data, because
`sku_details.image_url` is populated by hand and `sku-handbook.js:502-506` already counts the gap.

### 29.4 Manual visual acceptance

The full walk-through — exact path, browser, window size, hard-refresh, the Executive Report
checklist with every expected count, the Strategy Workspace checklist, 16:9 presentation, and
Print → Save as PDF — is in the prototype's
[`README.md`](../prototypes/product-strategy-board/README.md), under *Manual acceptance*. The
headline figures, measured by executing the page:

| Default view (Executive Report · US · Amazon · Can Opener) | |
|---|---|
| self-test badge | **312 / 312** |
| summary cells | 7 — products 10 · variants 32 · range 21.99–82.99 USD · opportunities 2 · watch 1 · risks 4 · data to fix 5 |
| chart | 1 panel · 10 columns · 10 bands · 7 y-ticks · 10 x-labels · 5 legend items |
| markers | 10 everyday · 2 live promotion · 2 proposed |
| product strip | 11 cards · 10 tier badges · **0 photographs · 11 missing-image states** |
| drawer (collapsed by default) | 12 findings — gap 2 · overlap 1 · cannibalisation 4 · no price 1 · **image 2** · grouping 1 · dateless deal 1 |

| Country | Panels | Columns | Cards | Findings | Photographs |
|---|---|---|---|---|---|
| US (default) | 1 | 10 | 11 | 12 | 0 |
| DE | 1 | 3 | 3 | 2 | 0 |
| UK | 1 | 1 | 1 | 1 | 0 |
| All | 3 (USD, EUR, GBP) | 14 | 15 | 15 | 0 |

**No screenshots are shipped.** The only test environment available is a hand-written DOM in Node
with no rendering engine; producing images would require a headless browser, which is a new
dependency and forbidden this round. The tables above are the acceptance artefact, and the on-page
self-test badge is a faster and more precise check than an image would be.

### 29.5 Isolation record

- **PRE HEAD `2c7bb13966a5cbc9a3e68f34e9e52a0af9f2b461`**, branch `feature/product-strategy-board-p0`,
  worktree clean including untracked. `origin` carries **no** such branch — verified by
  `git ls-remote` before amending, because amending a published commit is not reversible by a local
  action.
- **Files changed:** 6 modified, **7 binaries deleted**, 0 added. All under
  `docs/prototypes/product-strategy-board/` and `docs/planning/`.
- **`assets/img/products/` is untouched** — 138 files, byte-identical to the branch base. The
  removal happened only under `docs/`.
- No production file, no `.gs`, no S1–S5 file, no mainline worktree change, `C:/km-lb` untouched.
- **No network request, no DB read or write, no Drive write, no storage, no dependency, no CDN, no
  deployment, no push, no merge.** The re-audit was `git grep` and `git log`; the verification was
  the page's own self-test.

---

---

## §30 — P0-R3-R2: the Category Command Center, the five-unit axis, and the images restored on evidence

### 30.1 What the visual acceptance said, and what it actually meant

Three findings came back from the walk-through: *it still looks like a prototype*, *the top of the
page is a pile of buttons*, and *different categories must not share one price chart*. The first
two are the same finding. What made it read as a prototype was not the palette — it was that every
tool sat at the same visual weight in the same place, so nothing was primary, nothing was a
destination, and the page had no answer to "where am I". A sidebar is not decoration; it is the
statement of a hierarchy.

The third is not a layout preference at all. It is a correctness rule, and it is now in the
contract.

### 30.2 Category is the first scope  —  **SUPERSEDED BY §34.4 (P1-B2, D-B2-1)**

> **This ring order no longer holds.** P1-B2 inverted the ladder to
> `company → country → marketplace → category → series → currency`. Category first was correct while the
> board had one site; it became wrong the moment the site decided which products exist, because a
> category menu built before the site is known is a menu over every site — and on DE, which sells one
> category, the old order offered three. Everything below about category being a real column the
> database can enforce still stands; only its POSITION in the ladder changed. See §34.2 and §34.4.

`sku_details.category` is a real column — 43-column export schema, `sku-details.js:2369` — so this
is a scope the database can **enforce**, not a label the page invents.

```
category → company → country → marketplace → currency → series
```

| Rule | Where it is enforced |
|---|---|
| Two categories never share a price axis | one panel per currency, inside one category model |
| No gap, overlap or cannibalisation across a category | `analyse()` only ever sees one panel |
| The cross-category view is cards and a table | `viewOverview` draws no `<svg class="chart">` at all |
| Narrowing filters are closed until a category is chosen | `disabled` while the scope is All categories |
| Category is part of the grouping key | so two categories cannot merge into one node either |
| P1-B1 bounds `filters.category` server-side | `CATEGORY_AUTHORITY.p1b1`, frozen |

**Why this is a correctness rule and not taste.** A price ladder is an argument about products a
buyer would consider *instead of one another*. An electric can opener is not an alternative to a
spatula, so a step between them is not an opportunity, an overlap between them is not a conflict,
and a discount from one to the other cannibalises nothing. Pooling them does not widen the ladder;
it fills it with findings that are all false in the same invisible way.

### 30.3 The five-unit axis

```
axis_min = floor(min displayed price / 5) * 5
axis_max = ceil (max displayed price / 5) * 5
ticks    = axis_min, +5, +5, … , axis_max        (every tick drawn, every tick labelled)
```

No "nice number" search, no magnitude rounding, no adaptive step: 20 / 40 / 60 can appear only as
members of the 5-unit sequence. When a category's range is tall the **pixel** distance between
ticks compresses — clamped to a 480 px plot — and the **scale** never does. The axis stays linear;
tooltips carry two decimals. Each currency keeps its own panel and its own axis, and nothing is ever
converted.

Measured on Electric Can Opener / US: data span 17.99 – 84.99 → axis **15.00 – 85.00**, fifteen
ticks, fifteen gridlines, every step exactly 5.00.

### 30.4 The everyday price is a photograph

| | |
|---|---|
| Verified image | 36 px rounded white plate, 1 px border, soft shadow, `preserveAspectRatio="xMidYMid meet"` |
| **The coordinate** | the plate is drawn at `cy − 18`, so its **centre** is the price. A 2 px anchor circle is drawn **at** `cy` carrying `data-price-c`, and it is what the assertions measure |
| Why that matters | the marker may grow on hover without moving the datum. A picture that could shift a price is a picture that has become the data |
| No verified image | the same plate, neutral, carrying the model code. No broken image, no other SKU's photograph, no shape that could pass for a product |
| Deal markers | live promotions stay red diamonds, proposals stay dashed outlines, and both are drawn **before** the plate so a photograph can never hide one |
| Representative image | resolved from the node's **own members**. A price-split sibling shares a `variant_group` and is a different node, so it does **not** inherit the photograph |

### 30.5 The images, restored on evidence — class E

P0-R3-R1 removed all seven because nothing in the **repository** bound a file to a SKU. That
finding stands. What changed is the witness: the repository was never the only one, and the
operator can read the database.

**Evidence class E — `OPERATOR_ASSERTED_DB_RECORD` + `EXACT_REPO_FILE_EXISTS`.** The operator
reports, SKU by SKU, the `image_url` the live `sku_details` row carries; the named file is then
checked to exist at that exact path with exact case and extension. **Neither half is sufficient
alone**, and the mapping is per-SKU — nothing is extended to a SKU nobody named.

| # | SKU | `image_url` asserted on the row | Repo file | Object hash (prototype copy identical) |
|---|---|---|---|---|
| 1 | `CO1100-R` | `assets/img/products/CO1100-R.jpg` | exists | `8659b25aebdc0d20d92c849a19f09d315ed9d069` |
| 2 | `CO1150-R` | `assets/img/products/CO1150-R.jpg` | exists | `22742b8f4d70c872fc165703d195da7dc0512d32` |
| 3 | `CO2600-B` | `assets/img/products/CO2600-B.jpg` | exists | `35b1146e435166037c93c083f313f6e6fa96e949` |
| 4 | `CO5600-RB` | `assets/img/products/CO5600-RB.jpg` | exists | `2785d6bdcab7e00a912f74383b696982911db6d2` |
| 5 | `SP3120-R` | `assets/img/products/SP3120-R.jpg` | exists | `1d47cc50d303407c9cbc1703deae5e52471492d0` |
| 6 | `SP3410-R` | `assets/img/products/SP3410-R.jpg` | exists | `b4fc87a1431edfbe833995f36cab530b424aee3e` |
| 7 | `MO5600-R` | `assets/img/products/MO5600-R.jpg` | exists | `3c280fa42a3e828682763e12a0a5b35434cc1679` |

**Seven, and not an eighth.** `CO2600-R.jpg` and `CO5600-R.jpg` both exist in the repository and
**neither is used**, because the operator named `CO2600-B` and `CO5600-RB`. Those two files are the
whole reason the table is per-SKU: a SKU family is not a product, and the near miss is the failure
mode that looks most like success.

> **The evidence was operator TESTIMONY, and this document should say so plainly.** The database
> screenshot referred to in the round brief did not reach this session — no image was attached to
> the request. So what was verified here is: (a) the operator's per-SKU statement of the mapping,
> recorded verbatim in `IMAGE_POLICY.verified_mappings`, and (b) that every named target exists at
> that exact path, checked against the repository. Class E is named after exactly that pair, and it
> is deliberately not called "verified from a database record", because nothing in this session read
> one.

### 30.6 A real photograph does not make a price real

Every fixture row now carries the two halves apart:

```
identity_source   USER_PROVIDED_DB_EVIDENCE      price_source   PREVIEW_DEMONSTRATION
image_identity_verified  true | false            connected_to_db  false
```

and the load result repeats them in its provenance. The banner is unchanged and unconditional, and
every finding is still tagged DEMONSTRATION INSIGHT. This is the one confusion the round could
plausibly have introduced — a page that looks more real is a page more easily mistaken for real —
so the distinction is carried on the data rather than in a sentence somebody has to remember.

### 30.7 What the shell became

| Before (P0-R3-R1) | After (P0-R3-R2) |
|---|---|
| A row of loose buttons across the top | A **sidebar** with six destinations, one active, plus a separate action area |
| Two modes behind a toggle | Executive Overview · Category Analysis · Deal Risk · Data Quality · Strategy Workspace · Advanced Details |
| Category was not a concept | Category is the **first scope**, with its own selector above every other filter |
| One shared chart | One chart per currency **inside one category**, and none at all on the overview |
| Auto-scaled Y axis | **Five currency units per gridline**, always |
| Circle markers | **Product photographs** on the everyday price, with neutral fallbacks |
| No product table | A **comparison table** per category: image, model, representative SKU, variants, series, floor, everyday, list, official deal, proposed, status, data quality |
| 0 images shipped | **7**, each traceable to a named mapping |
| 312 assertions | **222** (the suite was rewritten with the shell; §30.8 records what carried over) |

The sidebar collapses to a 64 px icon rail with tooltips, and **the collapsed state is a variable,
not `localStorage`** — a preference worth persisting is a preference worth an owner, and this page
has neither. Icons are inline SVG, stroked, `currentColor`; no emoji, no icon font, no CDN, and not
one of them is ever used where a photograph would go.

### 30.8 What carried over from the earlier rounds

The suite was rewritten because the markup was, so group **R** re-asserts the earlier guarantees
against the new shell rather than assuming they survived: the contract shape and its two GAPs, the
five refusal states, the disabled Operation DB adapter refusing to become a second read authority,
**no schema name or decision code on the visible executive surface**, Advanced details collapsed by
default and carrying the engineering vocabulary, the workspace's three working and six disabled
tools, the `.bel-note` class collision that P0-R3 found the hard way, and the notice surviving every
one of the six destinations. Group **I** re-asserts every price rule and all three boundary cases.

### 30.9 Isolation record

- **Preconditions verified read-only:** worktree `wt-product-strategy-board-p0`, branch
  `feature/product-strategy-board-p0`, **PRE HEAD `0b71e6c566173e45c2dde38eeeae67474c8b4de8`**,
  clean including untracked, and `git ls-remote` confirming `origin` carries no such branch —
  checked before amending, because amending a published commit cannot be undone locally.
- **Files changed:** 6 modified, **7 image binaries added**, all under `docs/`.
- **`assets/img/products/` is untouched** — 138 files, byte-identical to the branch base. The seven
  copies live under `docs/`, and each was hash-checked against its source.
- No production file, no `.gs`, no S1–S5 file, no mainline worktree change, `C:/km-lb` untouched.
- **No network request, no DB or API read, no DB / Drive write, no storage, no dependency, no CDN,
  no deployment, no push, no merge.**

---

---

## §31 — P1-B0: the site-scoped data contract and the Operation System integration freeze

**Nothing in this section is implemented.** It is an audit of what the repository actually contains
and a freeze of the contract P1-B1 and P1-B2 must build to. No API, no production UI, no DB, no
deployment, no flag change.

### 31.1 Three corrections the audit forced, before anything else

The round brief carried three assumptions the source does not support. Each is corrected here rather
than carried forward, because a contract that is frozen wrong is worse than one that is not frozen.

**(1) `sku_regional_details` has no `marketplace_sku_id`, so that join does not exist.**

The brief proposed `marketplace_skus.marketplace_sku_id → sku_regional_details.marketplace_sku_id`,
and allowed for verification against the live schema. The live canonical header says the opposite in
its own comment:

```js
// v2.0 canonical header (NO hscode/duty/declared-value; NO status/note/marketplace_sku_id).
var SKU_REGIONAL_DETAILS_HEADERS_ = [
  'regional_detail_id', 'sku', 'company', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'product_url', … ];
```
`18_sku_regional_handlers.gs:16-23`. The match grain is stated at `:13` — *"Match grain: sku +
company + country + marketplace"* — and enforced by `skuRegionalFind_` (`:30-51`), which compares
exactly those four. `DATABASE_RELATIONSHIP_MAP.md:139` records the same pairing, 1→1.

**So regional is the one join in the map that does not travel on `marketplace_sku_id`** — which
makes it the one join that can silently mis-match, because a composite key can be *partly* right.
The frozen rule: the four parts are read **from the `marketplace_skus` row**, which already carries
all four, and never re-derived from `sku_details` or from the request. A regional row is attached to
a site SKU only when all four match; three out of four is not a near miss, it is a different site.

**(2) There is no `running` marketplace-SKU status. "active / running" is two columns on two tables.**

```js
var VALID_LIFECYCLES_               = ['Upcoming SKU','Running in the Market','Phasing Out','Closure','Other'];
var VALID_MARKETPLACE_SKU_STATUSES_ = ['active','phasing_out','inactive','discontinued'];
```
`00_config.gs:9` and `:12`. *Running in the Market* is a **master lifecycle** on `sku_details` — a
statement about the product. `marketplace_sku_status` is a **site status** on `marketplace_skus` — a
statement about one company selling it in one marketplace. They answer different questions and a SKU
can be `Running in the Market` while `inactive` on a specific site. **Site membership is decided by
`marketplace_sku_status` alone; `lifecycle` never participates in it** and is display only.

**(3) `phasing_out` is a fourth answer, and the brief's two-way default cannot express it.**

The brief says show active by default and exclude inactive. `phasing_out` is neither. It is
**still on sale**, so excluding it understates the ladder a buyer actually faces; calling it active
misreports it. Frozen default, and it is a decision the operator may overturn in one line:

| Status | In the default (Executive) set | Counted as | On the price axis |
|---|---|---|---|
| `active` | yes | `activeSiteSkuCount` | yes |
| `phasing_out` | **yes**, badged with its exact value | `phasingOutSiteSkuCount` | yes — it is still purchasable |
| `inactive` | no — only with `include_inactive` | `inactiveSiteSkuCount` | no |
| `discontinued` | no — only with `include_inactive` | `discontinuedSiteSkuCount` | no |

The four values are **never collapsed into two on screen**. `include_inactive` admits `inactive` and
`discontinued` together, because both mean *not on sale*, and each row keeps its exact status string.

### 31.2 The site membership authority and the scope key

| Concern | Authority | Never inferred from |
|---|---|---|
| Master identity, `category`, `series`, `image_url` | `sku_details` | — |
| **Which SKUs exist on a site** | **`marketplace_skus`** | `sku_details`, currency, `image_url`, SKU naming, pricing |
| Site regulatory / identity enrichment | `sku_regional_details` | master columns |
| **Site pricing and currency** | **`pricing_list`** | `sku_details` base price, `marketplace_skus.currency`, country default |
| Official campaign / deal price | `campaigns` + `campaign_sku_lines` | a proposal, a board element, a fixture |

**Site scope key — all three parts required, no defaults, no partial:**

```
{ company, country, marketplace }
```

**Site SKU identity: `marketplace_skus.marketplace_sku_id`.** `company` lives on `marketplace_skus`
and not on `pricing_list` (`PRICING_DATABASE_MAPPING.md` §4: *"company — Not required in
`pricing_list`"*), so `pricing_list.country` / `.marketplace` are **denormalised copies, not a scope
key**. Two companies operating the same `country|marketplace|sku` produce price rows that are
distinguishable *only* by `marketplace_sku_id` — the ambiguity §4.5 already recorded. Joining
pricing on `(country, marketplace, sku)` is therefore forbidden, not merely discouraged.

### 31.3 The six-table join map, as the source actually has it

```
sku_details.sku
   └─(sku)──────────────▶ marketplace_skus.sku                                     [MEMBERSHIP GATE]
                              marketplace_skus WHERE company+country+marketplace = scope
                              ⇒ THE UNIVERSE  U = { marketplace_sku_id … }
                                 │
   sku_regional_details ◀────────┤ (sku + company + country + marketplace)   ← NOT marketplace_sku_id
                                 │
   pricing_list ◀────────────────┤ (marketplace_sku_id)
                                 │
   campaign_sku_lines ◀──────────┘ (marketplace_sku_id)
        └─(campaign_id)─────────▶ campaigns.campaign_id
```

| Edge | Key | Verified at |
|---|---|---|
| `sku_details` → `marketplace_skus` | `sku` | `04_marketplace_forecast_import.gs:151` header list |
| `marketplace_skus` ↔ `sku_regional_details` | **`sku + company + country + marketplace`** | `18_sku_regional_handlers.gs:13`, `:16-23`, `skuRegionalFind_` `:30-51` |
| `marketplace_skus` → `pricing_list` | `marketplace_sku_id` | `PRICING_DATABASE_MAPPING.md` §4 |
| `marketplace_skus` → `campaign_sku_lines` | `marketplace_sku_id` | `CAMPAIGN_SKU_LINES_HEADERS_`, `20_campaign_write_handlers.gs:40` |
| `campaign_sku_lines` → `campaigns` | `campaign_id` | `20_campaign_write_handlers.gs:28`, `:40` |

`campaigns` also carries `company` and `marketplace_id` additively (`:28`) *"because a campaign is
NOT uniquely scoped by country+marketplace alone — the same marketplace name can belong to two
companies"*. A campaign is therefore filtered by its **line universe**, and its own `country` /
`marketplace` columns are display snapshots, exactly like `pricing_list`'s.

### 31.4 The membership gate, stated as an order of operations

1. Resolve `U = { marketplace_sku_id }` from `marketplace_skus` where `company + country +
   marketplace` equal the scope, **server-side**.
2. Apply the status filter to `U` (§31.1(3)).
3. **Only members of `U` may become rows.** Master, regional, pricing and campaign data are
   *enrichment of a member*, never a way in.
4. A `sku_details` row with no `marketplace_skus` row in scope is **absent** — not greyed, not
   zero-priced, not "missing data". It does not appear in the summary, the chart, the comparison
   table, gap, overlap, cannibalisation, deal risk, or a recommendation.

> **Reading everything and filtering in the browser does not satisfy step 1.** The membership
> decision must be made by the side that owns the table, because a client filter is a rendering
> choice and can be widened by a request payload, a stale cache or a bug — and when it is widened,
> nothing on screen says so.

**`AMBIGUOUS_SITE_IDENTITY`.** If more than one `marketplace_skus` row matches the same
`sku + company + country + marketplace`, the four-part regional join is no longer 1→1. That is a
refusal for those rows, not a first-match, and it is reported per SKU.

### 31.5 Regional details missing — the site SKU still exists

`marketplace_skus` present, `sku_regional_details` absent:

- The site SKU **exists**. It is never re-classified as not sold on the site.
- It appears in Data Quality, counted in `regionalMissingCount`.
- If identity and pricing are complete it **may be analysed**, carrying the row status
  `REGIONAL_DETAILS_MISSING`.
- **No master column is copied into a regional field to fill the hole.** An invented regional row is
  indistinguishable from a real one, and the whole purpose of the layer is that the two differ.

`sku_regional_details` present but its four-part scope disagrees with the site row: status
`CONTRACT_MISMATCH`. No cross-site join, and no fallback to another country's regional row — that
would answer a question about Germany with a fact about the United States.

### 31.6 Pricing missing — the SKU exists and has no coordinate

`marketplace_skus` present, `pricing_list` absent:

- Listed in Data Quality, counted in `pricingMissingCount`, status `PRICING_SOURCE_MISSING`.
- **Not plotted.** No axis position, no gap, no overlap, no cannibalisation. A missing price is not a
  price of zero and is not the bottom of the ladder.
- Counted in `siteSkuCount` but excluded from `analysableSiteSkuCount`, so the two numbers disagree
  visibly rather than the shortfall disappearing.

**`pricing_list.currency` is the pricing currency authority.** Not `sku_details`, not
`marketplace_skus.currency`, not a country default. `PRICING_DATABASE_MAPPING.md` §4 maps
`pricing_list.currency ← marketplace_skus.currency` **at creation**, which means the two are a copy
that can drift — so when they differ the row carries `CURRENCY_SOURCE_CONFLICT` and `pricing_list`
still wins. A conflict is a finding; it is never a tiebreak.

**`price_status` must not be filtered on in B1.** `PRICING_DATABASE_MAPPING.md` §4 records its
default as *"draft or active — default to be confirmed (system convention unclear)"*. Filtering on
an undecided enum would silently drop rows on a rule nobody has agreed. B1 carries the value through
and reports its distribution; the filter waits for the decision.

### 31.7 `ProductStrategyWorkspaceResponse` — frozen

```jsonc
{
  "scope": { "company": "", "country": "", "marketplace": "",
             "category": null, "series": null, "include_inactive": false },
  "masterSkus": [], "marketplaceSkus": [], "regionalDetails": [],
  "pricing": [], "campaigns": [], "campaignSkuLines": [],
  "normalizedRows": [],
  "counts": {
    "siteSkuCount": 0, "activeSiteSkuCount": 0, "inactiveSiteSkuCount": 0,
    "regionalMissingCount": 0, "pricingMissingCount": 0, "imageMissingCount": 0,
    // additive to the brief's six — the four statuses do not fit in two counters
    "phasingOutSiteSkuCount": 0, "discontinuedSiteSkuCount": 0, "analysableSiteSkuCount": 0
  },
  "capped": {}, "pagination": {}, "provenance": {}, "refusals": []
}
```

- **`normalizedRows` grain is one `marketplace_sku_id`.** A master SKU with no site identity can
  never be a row. `masterSkus` is enrichment and is not a row source.
- **Raw passthrough** for the six table arrays, as `59_` established: the client normalises, the
  server does not reshape.
- **`capped` is per array and never silent** — `59_`'s rule, and the reason a truncated read cannot
  be mistaken for a short one.
- **`provenance`** carries `connected: true|false`, `scope_applied`, the action, the build, the
  request id and the row counts as read. It is what makes "this is live" a fact on the payload
  rather than a claim in the UI.
- **`refusals`** is an array of `{ code, scope_part | marketplace_sku_id, message }`. Frozen codes:
  `SCOPE_INCOMPLETE`, `FEATURE_DISABLED`, `SOURCE_NOT_CONNECTED`, `AMBIGUOUS_SITE_IDENTITY`,
  `CAPPED_RESULT`.
- **Row statuses** (per `normalizedRows` entry, a list, never booleans): `REGIONAL_DETAILS_MISSING`,
  `CONTRACT_MISMATCH`, `PRICING_SOURCE_MISSING`, `CURRENCY_SOURCE_CONFLICT`, `IMAGE_SOURCE_MISSING`,
  `IMAGE_LOAD_FAILED`, `VARIANT_GROUPING_SOURCE_MISSING`, `DEAL_PERIOD_MISSING`.

### 31.8 Existing API owner audit — `skuDetails.workspace.get`

Owner `59_api_v1_sku_details_workspace.gs`; routed at `01_router.gs:75` and `:572`.

| Question | Measured answer |
|---|---|
| Reads `sku_details`? | **Yes** — BASE, `requiredCols: ['sku']`, fail-closed (`:46-52`) |
| Does `include.regional` read `marketplace_skus`? | **Yes** — and `sku_regional_details` with it. Both `optional: true`, missing-safe, and skipped entirely when not requested (`:46-52`, `:160`) |
| Reads `sku_regional_details`? | **Yes**, under the same include |
| Server-side `company` / `country` / `marketplace` / `category` / `series`? | **NO. None. There is no scope parameter of any kind.** The only request knobs are `payload.include.*`, `include.summary` and `requestId` |
| Row cap / truncation | `SKD_WS_ROW_MAX_ = 50000` (`:56`), applied per array by `skdCap_`, reported in `capped` and `counts` — **never silent** |
| Authorization gate | **None at the caller level.** The gate is `prodExpectedDbId_()` + `prodAssertDbTarget_()` — a *wrong-spreadsheet* gate, not a *who-is-asking* gate. D-9 §13.1 measured the same thing system-wide: no RBAC, no server-side identity |
| Response shape | `{ success, data:{ summary, skuDetails, taxReferralRates, taxRateComponents, capped, counts, (+marketplaceSkus, skuRegionalDetails under include.regional) }, meta, errors }` |
| Reads pricing / campaigns? | **No.** Not in `SKD_WORKSPACE_TABLES_` |
| Uses `getOperationDb` / unrestricted `getTable`? | **No** — the file states it, and the table list proves it |

**The gap is total, and it is deliberate.** `:27` states the design: *"FULL-SET (NOT server-filtered)
BY DESIGN — BEFORE == AFTER … Server-side narrowing would shrink those universes → a user-visible
change."* Both existing consumers build their filter universes and country tabs from **all** rows.

> **So option A cannot be "add a site scope to `skuDetails.workspace.get`".** Adding one changes what
> two shipped pages see. The freeze is narrower and safe: **B1 does not modify `59_` at all.** If a
> later round does add a scope, it must be **opt-in and absent by default** — a request carrying no
> `scope` must produce a byte-identical response — and that equality must be a test, not a promise.

**Pricing and campaigns have no bounded read owner.** `KM.DB.getPricingList()`,
`getCampaigns()`, `getCampaignSkuLines()` exist only through `getOperationDb`. §4.8 recorded this as
a GAP and it is unchanged. `getOperationDb` and unrestricted `getTable` are forbidden to this
feature, and no second SKU Details read authority may be created.

### 31.9 The read owners, frozen — two, and only one decides membership

**A. `skuDetails.workspace.get` — UNCHANGED.** Master identity, `category`, `series`, `image_url`,
plus `marketplace_skus` / `sku_regional_details` under `include.regional`. It is the SKU-page
universe builder. **It is never used to decide site membership**, because it cannot: it has no
scope, and a client narrowing its full set is the very thing §31.4 forbids.

**B. `productPricing.workspace.get` — NEW, and it is the site-membership authority.** One action for
the three unowned tables plus the membership resolution, not six competing endpoints. Its name is
narrower than its responsibility; the name is kept because it is the one the operator issued and the
one §28.2 already carries, and one name in two documents beats two names for one action.

| Requirement | Frozen rule |
|---|---|
| Site scope | `company` **and** `country` **and** `marketplace`, all non-empty. Missing any ⇒ `SCOPE_INCOMPLETE`, zero rows. **An unscoped read is refused, never answered with everything** |
| Membership | Server resolves `U` from `marketplace_skus`; only `U`'s ids may appear in any returned array |
| Narrowing | `category` / `series` optional, applied server-side **after** `U` |
| Status | `include_inactive` (default `false`) per §31.1(3) |
| Campaigns | `include.campaigns` gates the two campaign tables the way `include.regional` gates the regional pair — an un-requested include costs no read |
| Bounds | `page.limit` / `page.cursor` plus a hard per-array cap; `capped` reported per array, never silent |
| Target gate | the same exact-ID `prodExpectedDbId_` / `prodAssertDbTarget_` pair every other read uses |
| Read-only | no `setValue`, no `appendRow`, no ensure-sheet, no writer call, no lock — **by construction, verified by a test that greps the shipped handler** |
| Flag | refuses with `FEATURE_DISABLED` and zero reads while `PRODUCT_STRATEGY_ENABLED_` is false (§31.12) |

**This supersedes §28.2's scope rule.** §28.2 required *"at least one of company / country /
marketplace / series"*. That admits a series-only read across every site — which is exactly the
cross-site contamination this round exists to prevent. All three site parts are now required.

### 31.10 Operation System navigation ownership — measured

| Concern | Owner, measured |
|---|---|
| Global sidebar markup | **`index.html`** — `<nav class="sidebar" id="appSidebar">`, hand-written `menu-parent` / `menu-children` blocks |
| Collapse / expand | `toggleSidebar()` `app.js:35`; group open/close `toggleMenu(menuId)` `app.js:20` |
| Route / section registry | **`showSection(key)` `app.js:67`** — two literal `sectionMap` objects mapping nav key → `*-section` id |
| Page lifecycle | **`KM.lifecycle` `core/lifecycle.js`** — `register(pageName, hooks)`, `switchTo(sectionId)`, monotonic nav epoch, `isCurrent(epoch)` for late async mounts |
| Active-page state | **`enforceSingleActiveSection()`** — at all times exactly one `.module-section` carries `.active`, re-enforced by a `MutationObserver` |
| Lazy init | **`KM.partialLoader.loadPartial(pageKey, url, mountSelector)`** — fetch-once-and-inject, cached per key; called from each page's mount |
| HTML partial ownership | `assets/html/pages/<page>.html` — **23 partials exist**; `index.html` holds only a `<div id="<page>-mount">` |
| CSS scope | one file per page, `assets/css/pages/<page>.css`, linked from `index.html` with a cache-busting `?v=` |
| Responsive | `assets/css/responsive-foundation.css` — canonical breakpoint tokens `--km-bp-tablet/compact/laptop/desktop/xl`; *"new code MUST use the tiers frozen here"* |
| **Secondary navigation** | **`.km-tab-rail` already exists** — `components.css:889-941` + `assets/js/utils/tab-rail.js`, in use by `campaign-risk`, `inventory-replenishment`, `request-order` |
| Permission / visibility hook | **None exists.** The header user is a hard-coded string in `index.html`. D-9 §13.1 measured the same absence server-side |
| Print / presentation | **No `@media print` rule exists anywhere in `assets/css/`** |

**Two consequences that decide the integration.**

1. **The prototype sidebar does not survive contact with the app.** Its six destinations become a
   `.km-tab-rail` inside one section; the rail, the collapse toggle, the tooltips and the brand block
   are deleted, because `#appSidebar` already owns every one of those jobs. A second collapsible
   sidebar would be a second global shell, and the first symptom is two "where am I" indicators
   disagreeing.
2. **The production menu icons are emoji** (`🏬 🏭 📈 🚢 🧾 🎯 📝 💰 🎓 ⚙️`), one per
   `<span class="menu-icon">`. The prototype forbade emoji — a *prototype* rule, made when it owned
   the whole page. Product Strategy follows the **production** convention: one emoji icon like every
   sibling. Importing the prototype's inline-SVG set would make this the one menu item that looks
   different, which is the two-shells problem in miniature.

### 31.11 Production integration file plan — frozen, and not touched this round

| File | Change | Note |
|---|---|---|
| `index.html` | one `menu-parent` + `menu-children` group under **Product Strategy**, six `menu-item`s; one `<div id="product-strategy-mount">`; one CSS `<link>` | starts `menu-item--disabled` + `Soon`, as D-9 §13.2 requires |
| `assets/js/app.js` | six keys added to **both** `sectionMap` objects → `product-strategy-section` | both, or navigation and lifecycle disagree |
| `assets/html/pages/product-strategy.html` | new — the whole section, `.km-tab-rail` + six panels | |
| `assets/css/pages/product-strategy.css` | new — page-scoped; **every selector under `#product-strategy-section`** | no global rule, no `@media print` outside the section |
| `assets/js/pages/product-strategy.js` | new — `KM.lifecycle.register`, `loadPartial`, epoch guard, live adapter | |
| `assets/js/api/*` | one accessor for `productPricing.workspace.get` | |
| `assets/specs/active/apps-script/<nn>_api_v1_product_pricing_workspace.gs` | new handler | `APPS_SCRIPT_SYNC_REQUIRED` |
| `assets/specs/active/apps-script/01_router.gs` | one action branch | `APPS_SCRIPT_SYNC_REQUIRED` |
| `assets/specs/active/apps-script/00_config.gs` | the flag + accessor | `APPS_SCRIPT_SYNC_REQUIRED` |
| `assets/specs/active/apps-script/63_api_v1_system_health.gs` | report the effective flag | `APPS_SCRIPT_SYNC_REQUIRED` |

**Six sub-pages, one section, one mount, one lifecycle registration.** The internal tab is state in
the page module; it is not a `showSection` key and it is not in `sectionMap`, because the global
router owns pages and the page owns its tabs.

**What must not cross over from the prototype:** the preview banner, the self-test badge, the fixture
controls, the `PreviewProductStrategyDataAdapter`, and the prototype's own shell. None of them may
appear in the live default view.

### 31.12 Feature flag and permission contract — designed, not implemented

```js
// 00_config.gs — server-owned, the same shape as 00_config.gs:88-89
var PRODUCT_STRATEGY_ENABLED_ = false;
function productStrategyEnabled_() { return PRODUCT_STRATEGY_ENABLED_ === true; }
```

| | |
|---|---|
| **Flag owner** | `00_config.gs`, server-side. A browser cannot widen it, a request payload cannot widen it, and widening it is a deployment with a diff |
| **Backend action gate** | **`productPricing.workspace.get` refuses while the flag is false** — `FEATURE_DISABLED`, zero rows, zero table reads. The gate is in the handler, before the spreadsheet is opened |
| **Frontend visibility gate** | the nav group stays `menu-item--disabled` + `Soon`; the mirror default is **fail-safe false**, read through the capability transport that already carries `inventoryAiPlanDbGenerationEnabled` (`km-api-foundation.js:507`, `failSafeDefaults` `:521-522`) |
| **Permission hook** | **there is none, and the design must not pretend there is.** D-9 §13.1: no RBAC, no server-side identity, `created_by` client-asserted, Login/RBAC scheduled for P2-A. **Until then the flag *is* the access control** |
| **Unauthorized behaviour** | there is no authorization to fail. Every caller of a deployed, enabled read action is equally able to call it — so the data restriction question, if it matters, is a separate round and this feature waits for it rather than claiming a protection it does not have |
| **flag = false behaviour** | the nav entry is visible-but-disabled, the section does not mount, the action refuses. **No preview data is shown in its place** |
| **Rollback** | set the flag to `false`, then publish a **new Apps Script deployment version** — two steps, both the user's. No compensating write exists or is needed: the action never wrote |
| **Reportable** | `system.health` exposes `product_strategy_enabled`, the way `63_:655` exposes the AI-Plan flag, so *"is it on in the deployment that is actually answering"* has an answer instead of an inference |

> **A hidden button is not a control.** `00_config.gs:93-101` is the repo's own statement of this.
> The disabled nav item only avoids offering what the server would refuse; the refusal is the
> control, and it lives in the handler.

**Correction of record — the flag has one name.** §13.2 froze
`PRODUCT_STRATEGY_BOARD_ENABLED_`, and §28.4 separately proposed
`PRODUCT_PRICING_WORKSPACE_ENABLED_`. Both are **superseded by `PRODUCT_STRATEGY_ENABLED_`**, which
is the operator's name and the only one. Two flags for one feature admits a state where the page is
on and its only data source is off — a state with no meaning and no owner. Neither name exists in
any shipped file, so the cost of settling this now is zero and the cost of settling it later is a
live disagreement.

### 31.13 Live-versus-preview, at the seam

- **`PreviewProductStrategyDataAdapter` must never be a production fallback.** It is a fixture, and a
  fixture reached by a failure path is a lie told at the worst possible moment.
- **API failure shows `SOURCE_NOT_CONNECTED`** — the state, not a substitute. The three refusal
  states stay distinct: `FEATURE_DISABLED` (off on purpose), `SOURCE_NOT_CONNECTED` (the read
  failed), and an **empty** scope (a real configuration answer: this site sells nothing matching).
  An empty select presented as success is the failure `core/scope-registry.js` was written to end,
  and this feature inherits that standard.
- **Live and preview rows are never mixed in one view**, one chart, one table or one count.

### 31.14 Handoff

**P1-B1 — the bounded read.** `productPricing.workspace.get`: site scope required; server-resolved
membership universe; the frozen response of §31.7; read-only by construction; flag false; no
production visibility; contract tests covering scope refusal, membership exclusion, the four status
values, missing regional, missing pricing, currency conflict, ambiguous identity, `capped`, and the
byte-identical no-scope response of `59_`.

**P1-B2 — the integration.** The global shell as-is; one nav group; the six sub-pages behind
`.km-tab-rail`; the live adapter; category and site filters; **no preview fallback**; flag false;
visual and regression tests including *exactly one `.module-section` active* and *no second sidebar
in the DOM*.

**P1-B3 — the readback.** Verify real site membership against the database; verify the missing-
regional and missing-pricing behaviour on real rows; compare DB counts with UI counts; prove no
cross-site contamination; operator visual acceptance. **Only then is `flag = true` even a question**,
and it remains a user-owned two-step release.

### 31.15 Two decisions B1 needs, carried forward and still open

1. **`variant_group` / `variant_name`** on `sku_details` (§28.5) — add the columns, or accept that a
   real-data board shows every SKU separately.
2. **`pricing_list.price_status`** — its default is recorded as unconfirmed. Until it is decided, B1
   filters on it not at all (§31.6).

### 31.16 Isolation record

- **Preconditions verified read-only:** worktree `wt-product-strategy-board-p0`, branch
  `feature/product-strategy-board-p0`, **PRE HEAD `08a507041e9fd95d7131c4f76150c2cd423d7615`**,
  clean including untracked.
- **Files changed: 2, both documentation.** This file, and one appended checkpoint block in
  `assets/specs/active/project-current-state.md` recording the freeze — no existing entry edited, no
  mainline priority changed.
- **Nothing was implemented.** No API, no handler, no router branch, no flag, no production frontend
  file, no `.gs`, no schema, no migration, no prototype runtime change, no S1–S5 file, no mainline
  worktree change, `C:/km-lb` untouched.
- **No DB or API read, no DB / API / Drive write, no network request, no deployment, no flag change,
  no merge, no push.**

---

---

## §32 — P1-B1: the site-scoped bounded read, implemented behind a false flag

P1-B0 §31 froze the contract. This section records what was BUILT to it, what was deliberately not
touched, and the two places the implementation had to decide something §31 left open.

**Nothing here is visible to a user.** `PRODUCT_STRATEGY_ENABLED_` is false, `index.html` loads
neither the accessor nor any Product Strategy markup, and there is no nav entry. Production
visibility is zero by construction, not by a hidden button.

### 32.1 What was added

| File | Role |
|---|---|
| `assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs` | **NEW.** The one bounded read owner and the site-membership authority. `productPricing.workspace.get` |
| `assets/js/api/km-product-pricing-workspace.js` | **NEW.** The client half. Not referenced by `index.html` and imported by no page |
| `assets/tests/api-product-pricing-workspace-p1-b1.test.js` | **NEW.** 163 assertions + 13 mutants |
| `assets/specs/active/apps-script/00_config.gs` | `PRODUCT_STRATEGY_ENABLED_ = false` + `productStrategyEnabled_()` |
| `assets/specs/active/apps-script/01_router.gs` | one GET read-table entry, one POST branch, same handler |
| `assets/specs/active/apps-script/63_api_v1_system_health.gs` | the `product_strategy_enabled` capability + the owner's build stamp |

**72 was chosen by reading the registry, not by guessing.** The highest existing owner is
`71_api_v1_factory_stock_guard.gs`; 72 is free and keeps the API-v1 owners contiguous.

**72 is deliberately NOT in 63_'s module-stamp manifest yet, and the first attempt to add it was
wrong.** It was registered `optional: true`, reasoning that health should be able to report whether
the handler is deployed. The census suite refused it immediately: the health contract is *exactly
one absent optional owner*, and a second one makes "an absent optional owner" — a real, measured
signal — into a number that no longer means anything. The row belongs in the round that turns the
flag on, as a REQUIRED row, because that is when "is the handler actually deployed" becomes a
question whose wrong answer is visible to a user.

### 32.2 The membership algorithm, in the order it actually runs

```
1  flag            productStrategyEnabled_() — BEFORE the spreadsheet is opened
2  request         schema, bounds, forbidden fields, cursor identity
3  scope           company AND country AND marketplace, all non-empty, none defaulted or derived
4  target          SpreadsheetApp.openById(prodExpectedDbId_()) + prodAssertDbTarget_
5  membership      marketplace_skus WHERE company + country + marketplace = scope
6  U               = { marketplace_sku_id }, sorted ascending
7  status          marketplace_sku_status ∈ the requested set
8..13  enrichment  master → regional → pricing → campaign lines → campaigns
14 narrowing       category / series, applied to rows that are ALREADY members
15..17             normalize → paginate → counts / capped / provenance
```

Steps 1–3 cost **zero reads**: a disabled feature and an unscoped request are both refused before the
spreadsheet is opened, and the tests measure the open count rather than trusting the ordering.

**What can never confer membership:** `sku_details` (a master SKU with no site row is absent, however
complete its record), `lifecycle`, a currency, an `image_url`, a price existing, a SKU naming pattern,
or a client filter. The response says so as data — `membership.inferred_from: []` and
`membership.lifecycle_participates: false`.

### 32.3 The joins, each on the key the live schema has

| Edge | Key | Why not the obvious one |
|---|---|---|
| master | `sku_details.sku = marketplace_skus.sku` | — |
| **regional** | **`sku + company + country + marketplace`** | `sku_regional_details` has no `marketplace_sku_id` (`18_:16-23`). It is the only edge not travelling on an id, so it is the only one that can half-match; all four parts are taken from the membership row itself |
| **pricing** | **`marketplace_sku_id` only** | `pricing_list` has no `company`, so its `country`/`marketplace` are denormalised copies. Two companies on one `country|marketplace|sku` are distinguishable only by the id |
| campaign lines | `campaign_sku_lines.marketplace_sku_id` | — |
| campaign parent | `campaigns.campaign_id`, then `company` / `country` / `marketplace` checked **column by column** | a campaign is not uniquely scoped by country+marketplace alone (`20_:27`) |

The fixture proves the pricing rule rather than restating it: a neighbouring company's price row sits
on the same `(country, marketplace, sku)` as the SKU under test, at a visibly different price. A join
on those three columns returns it; the shipped join does not.

### 32.4 Two decisions the implementation had to make

**(1) `include` defaults.** `regional` and `pricing` default **on**, `campaigns` defaults **off**.
The response's own counts — `regionalMissingCount`, `pricingMissingCount`, `analysableSiteSkuCount` —
are unanswerable without the first two, and an un-requested include must cost no read, which is what
makes the third opt-in. When an include is off the matching count is **`null`, not `0`**: a count
nobody took is not a measurement of zero.

**(2) What "success" means when nothing is usable.** Every answer carries
**`data.analysis_permitted`**, false whenever `refusals` is non-empty, and `meta.refused`. A refused
request returns the same shape with **null counts** — so a site that genuinely sells nothing
(`refusals: []`, `siteSkuCount: 0`, `analysis_permitted: true`) stays distinguishable from
`FEATURE_DISABLED`, `SCOPE_INCOMPLETE`, `SOURCE_NOT_CONNECTED` and `CAPPED_RESULT`, which was §31's
requirement and is the one thing a `success: true` envelope could otherwise have blurred.

### 32.5 Refusals and row statuses, frozen

```
REFUSALS   FEATURE_DISABLED · SCOPE_INCOMPLETE · UNKNOWN_STATUS_VALUE · INVALID_STATUS_FILTER
           INVALID_PAGE_LIMIT · PAGE_LIMIT_EXCEEDS_MAXIMUM · INVALID_CURSOR
           CURSOR_SCOPE_MISMATCH · UNSUPPORTED_REQUEST_FIELD · CAPPED_RESULT
ROW STATUS REGIONAL_DETAILS_MISSING · REGIONAL_NOT_REQUESTED · AMBIGUOUS_SITE_IDENTITY
           PRICING_SOURCE_MISSING · PRICING_NOT_REQUESTED · AMBIGUOUS_PRICING_SOURCE
           IMAGE_SOURCE_MISSING
FINDINGS   CONTRACT_MISMATCH · AMBIGUOUS_SITE_IDENTITY · AMBIGUOUS_PRICING_SOURCE
           CURRENCY_SOURCE_CONFLICT · SITE_SKU_WITHOUT_IDENTITY · UNKNOWN_SITE_STATUS_VALUE
           CAMPAIGN_RECORDS_CAPPED
```

`AMBIGUOUS_PRICING_SOURCE` is the one §31 did not name in advance. `pricing_list` is one row per
`marketplace_sku_id` (`PRICING_DATABASE_MAPPING` §4), so a second row is a contract violation and no
rule in the contract picks a winner — therefore none is picked. Not the last row, not the highest
price, not the lowest.

### 32.6 Pagination, bounds and the cursor

No existing workspace read paginates — the convention is a full set with a non-silent `capped`
backstop, and that convention is kept for the six SOURCE arrays. Pagination is added only over
**`normalizedRows`**, which is the page grain, because six independently pageable tables would let a
client assemble a view no server ever agreed to.

```
default 200 · hard maximum 1000 · sort marketplace_sku_id ascending (deterministic)
cursor  PPW1-<scope+filter fingerprint>-<offset>
counts  TOTALS over the whole membership; only pagination.returned describes the page
```

The fingerprint covers company, country, marketplace, category, series, the effective status set and
the include flags. A cursor issued under a different scope or filter set is **refused**
(`CURSOR_SCOPE_MISMATCH`), because a cursor that survived a scope change would page through one
site's rows using another site's offsets — cross-site contamination arriving by the back door.

A capped SOURCE is a refusal, not a shorter answer: if `marketplace_skus` or any joined table was
truncated, membership or join completeness cannot be proved, and an answer that cannot prove its own
completeness must not be handed over looking analytics-ready.

### 32.7 `skuDetails.workspace.get` is unchanged, and it is proved by execution

`59_api_v1_sku_details_workspace.gs` was **not modified** — object hash identical to the P1-B0 commit.
The site scope lives in 72 precisely so the shared SKU-page owner did not have to grow one, which
would have changed what two shipped pages see (`59_:27` states the BEFORE == AFTER contract).

The regression is not a source read. The suite EXECUTES `skdWorkspaceBuild_` against a fixture and
compares it to a frozen expected response, then calls it again **passing a scope** and asserts the
answer is identical — so if a later round teaches that builder about scope, this line turns red.

### 32.8 Flag and permission contract

```
server    PRODUCT_STRATEGY_ENABLED_ = false      productStrategyEnabled_()        00_config.gs
gate      the handler refuses FEATURE_DISABLED with 0 opens and 0 reads
health    system.health.product_strategy_enabled, read from that one resolver     63_
client    a fail-safe-FALSE mirror inside the accessor; only a server capability payload raises it
rollback  set false + a NEW deployment version — both user-owned, no compensating write
```

One name. §13.2's `PRODUCT_STRATEGY_BOARD_ENABLED_` and §28.4's
`PRODUCT_PRICING_WORKSPACE_ENABLED_` are superseded and neither is declared anywhere. **There is
still no RBAC** (§13.1), so the flag is not a convenience — it is the access control, and a control
that runs after the read has already failed at the only job it had.

### 32.9 Tests

**163 assertions, 0 failed, 13 mutants, 0 survived.** The mutants are the ways the site scope could
leak, written as the change that would do it: the scope becoming optional; membership dropping the
company comparison; `phasing_out` dropped from the default or squashed into `active`; `lifecycle`
promoted to a membership gate; the regional join losing one of its four parts; pricing joining on
`sku`; a currency conflict resolved silently; a missing price becoming zero; a capped source handed
over as complete; the flag checked after the read; a writer reaching the read path; a preview
fallback introduced.

Three of my own defects were caught by these tests before the round closed, and one of them was in
the harness rather than the handler: the sandbox had been given the host's `Array`, so every
in-context `instanceof Array` compared against a foreign constructor and answered false. The code
under test was correct and the test was measuring the wrong realm.

### 32.9a Three assertions in older suites are red, and one act clears all three

The whole suite was swept before and after. One suite found a real defect (the manifest row, §32.1),
and **three assertions in two older suites remain red. All three say the same thing and all three
are cleared by the release step, which is user-owned.**

| Suite | Assertion | What it says |
|---|---|---|
| `ai-plan-advice-…-r5` | `E4` | a file edited in this working tree must move its own module stamp — `00_config.gs`, `01_router.gs` and `63_` were edited and their stamps did not move |
| `single-scope-allowlist-cutover-…-r7-r6` | `G1` | since release `…R6-R7-R6`, exactly two runtime files may have changed; `01_router.gs` is now a third |
| same | `G2.7` | `01_router.gs` is unchanged |

**Why the stamps were not moved here.** Moving them was tried and reverted. `SYS_BUILD_VERSION_` has
always been *equal to* `SYS_DEPLOYMENT_RELEASE_`, and the deployment-contract probe compares the
payload's `build_id` (the RELEASE) against the scraped `SYS_BUILD_VERSION_` (the STAMP) — so
separating them declares a release as a side effect, and four probe assertions plus two transport
assertions went red to say so. 63_'s own manifest row calls itself *"self-referential — not a
partial-sync check"*, which is the same fact stated in the source: **for the deployment-identity
module, the stamp IS the release.**

And a release is not this round's to declare. `63_:35` — *"SYS_DEPLOYMENT_RELEASE_ MUST be bumped in
the same commit as any sync-visible backend change"* — is exactly right, and it is the reason this
belongs to the round that ships: the release id goes in `DEPLOYMENT_RELEASE_LOG.md`, which is
user-owned, and this round is forbidden to sync or deploy. Claiming a release for a change nobody
has deployed would put a name in the ledger's blind spot.

**So the act that clears all three is one act, and it is the release step:** bump
`SYS_DEPLOYMENT_RELEASE_`, move `SYS_BUILD_VERSION_` / `CONFIG_BUILD_VERSION_` /
`RTR_BUILD_VERSION_` and their manifest rows with it, and re-base the two release-window suites onto
the new release. Until then the three red assertions are an accurate statement of the position: a
sync-visible backend change exists and has not been released.

### 32.10 Isolation record

- **PRE HEAD `e98fdedc164f5c6039d069bb0a5b679117d81b52`**, branch
  `feature/product-strategy-board-p0`, clean including untracked.
- **No production UI file touched:** `index.html`, `assets/js/app.js`, every page HTML / CSS / JS,
  and the prototype are unchanged. `59_api_v1_sku_details_workspace.gs` object hash identical.
- **No schema, no migration, no new table, no S1–S5 file, no mainline worktree change,
  `C:/km-lb` untouched.**
- **No DB or API read, no DB / Drive write, no network request, no Apps Script sync, no deployment,
  no flag change, no merge, no push.**

---

---

## §33 — `PRODUCT-STRATEGY-P1-B1-R1`: the release identity P1-B1 owed, and the Category universe made dynamic

**Round:** `PRODUCT-STRATEGY-P1-B1-R1` — Release-Identity Completion + Dynamic Category Contract
**Branch:** `feature/product-strategy-board-p0` · follow-up commit on top of `9ee85d5`, which is **not** amended
**Flag:** `PRODUCT_STRATEGY_ENABLED_` **stays false.** Production visibility remains **zero.**

### §33.1 P1-B1 changed four sync-visible files and did not move the release. Three assertions said so.

P1-B1 added `72_api_v1_product_pricing_workspace.gs`, routed `productPricing.workspace.get` to it in
`01_router.gs`, and edited `00_config.gs` and `63_api_v1_system_health.gs`. `63_`'s own contract
(`63_:35-38`) is explicit about what that obliges:

- `SYS_DEPLOYMENT_RELEASE_` — bumped in the same commit as **any** sync-visible backend change.
- `SYS_BUILD_VERSION_` — bumped in the same commit as any change to `63_` itself.
- `SYS_DEPLOYED_ACTION_CONTRACT_VERSION_` — bumped whenever a router **ACTION** is added or removed.

None of the three moved. Three assertions failed as a result, and **all three were right**:

| suite | assertion | what it was saying |
|---|---|---|
| `ai-plan-advice…r5` | `E4` | three manifest owners were edited without their stamps moving |
| `single-scope-allowlist-cutover…r6-r7-r6` | `G1` | a release window that permits two runtime files saw four |
| same | `G2.7` | `01_router.gs` — named individually — changed inside that window |

Two more failed for the same cause and are recorded here because the brief did not name them: `G1a`
(a browser file changed in that window — the new accessor) and `action-registry…fb-4e-r2` item **8**
(an Apps Script file outside the R1 line's owned set changed — `72_`, which only became visible once
P1-B1 was committed). **Five assertions, one omission.**

### §33.2 The release: `F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R7`

Derived from the chain in `63_`, not invented: `…R6-R6` → `…R6-R6-R4-R2` → `…R6-R7-R1` → `R2` → `R3`
→ `R4` → `R5` → `R5-R1` → `R6` → **`R7`**. It satisfies `_release-order.js`'s `BUILD_STAMP_RE` and is
appended to `OWNER_STAMPS`, which is append-only.

Everything that moves with it, and why each one had to:

| what | from | to |
|---|---|---|
| `SYS_DEPLOYMENT_RELEASE_` (63_) | `…R6-R7-R6` | `…R6-R7-R7` |
| `SYS_BUILD_VERSION_` (63_'s own stamp) | `…R6-R7-R6` | `…R6-R7-R7` |
| `SYS_DEPLOYED_ACTION_CONTRACT_VERSION_` | 12 | **13** — one router action was added |
| `KM_EXPECTED_ACTION_CONTRACT_VERSION_` (browser) | 12 | **13** — held to EQUALITY by ~11 suites |
| `CONFIG_BUILD_VERSION_` (00_config) | `…R6-R7-R6` | `…R6-R7-R7` |
| `RTR_BUILD_VERSION_` (01_router) | `…R6-R7-R5` | `…R6-R7-R7` |
| `PPW_BUILD_VERSION_` (72_) | `PRODUCT-STRATEGY-P1-B1` | `…R6-R7-R7` |
| `SYS_MODULE_BUILD_STAMPS_` rows for 63_ / 00_ / 01_ | — | moved with their files |
| **new REQUIRED row for `72_`** | — | added |
| `S1_BUILD_`, `R6R7_ACTIVATION_BUILD_`, `TEMP_E3_CENSUS_BUILD_` | `…R6-R7-R6` | `…R6-R7-R7` |
| `OWNER_STAMPS` (`_release-order.js`) | — | `…R6-R7-R7` appended |

`SYS_REQUIRED_ACTION_LIST_VERSION_` deliberately **does not** move. `SYS_REQUIRED_ACTIONS_` is the list of
actions **pages** depend on, and no page depends on this one — the same reason `createShipmentFromPlan`
waited for a page before it was listed.

`PPW_BUILD_VERSION_` had to be re-stamped into the release vocabulary. `PRODUCT-STRATEGY-P1-B1` named the
round honestly but could not be **ordered** against any other stamp, and a manifest owner must be
comparable: `_release-order.js` keeps one sequence and `stampAtOrAfter` is an index lookup in it.

### §33.3 `72_` is a REQUIRED owner, and never an optional one

The manifest's `optional: true` flag exempts a row from `absent_modules`, so an absent optional owner is
not a partial sync. `72_` gets **no such flag**:

- `01_router.gs` already dispatches the action on both GET and POST. A deployment carrying the router but
  not `72_` routes a live action to an **undefined handler** — the exact partial sync the manifest exists
  to name, and `optional: true` would forgive precisely that.
- The **feature flag is a separate axis and does not soften this one.** `PRODUCT_STRATEGY_ENABLED_ = false`
  makes the action **refuse**; a refusal from a handler that is present is a different fact from a handler
  that is not there. Only the first is recoverable by flipping a flag.

P1-B1 had briefly added this row as an absent OPTIONAL owner and an older suite caught it (the health
contract is **exactly one** absent optional owner — the one-shot migration file). It was removed then and
returns now as REQUIRED, which is where it belonged.

### §33.4 This is a deployment CANDIDATE. Nothing has been deployed.

The release id says what a sync **would** be. It is not a claim that one happened, and the ledger entry
in `docs/planning/DEPLOYMENT_RELEASE_LOG.md` records the difference explicitly:

```
deployment candidate prepared     ·  PRODUCT_STRATEGY_ENABLED_ = false
Apps Script sync                  ·  NOT PERFORMED
Web App deployment version        ·  NOT CREATED
production UI                     ·  NOT OPENED
formal DB / API read              ·  NONE
Product Strategy                  ·  NOT ENABLED
```

**One operational coupling, stated rather than discovered.** The browser pin now requires a deployment at
action-contract **13**. A browser carrying this build refuses anything below it with
`DEPLOYMENT_CONTRACT_MISMATCH` — so **Pages must not be redeployed before the Apps Script sync**. Both are
USER-owned steps; the ledger records the order.

### §33.5 Five release-window assertions were bound to their own round, none was weakened

The repair is the one this repo already applies, quoted from the commit that created the cutover suite:

> *"The R5-R1 sync-set section was measuring BASE..working tree while describing a shipped round, so it is
> now bound to that round's own commit and can no longer be broken by a later one."*

`git diff BASE` is BASE..**working tree**, so a suite describing a shipped release silently re-scopes
itself to the present on every later commit. §F and §G of the cutover suite now read the modules and the
change set **at the commit that introduced R6-R7-R6**; the behavioural sections above them keep reading
the working tree, which is right, because those are claims about the code as it stands.

**One refinement over the sibling repair.** R5-R1 took the *newest* commit declaring the release; for that
round the newest and the introducing commit were the same. Here they are **not** — P1-B1 reused
`R6-R7-R6` by omission, so the newest commit declaring it is P1-B1's. Ending the window there would
hard-code the omission into the historical claim, so `roundIntro()` takes the **oldest** commit declaring
the release: the one that introduced it.

Nothing was deleted, skipped, downgraded to a warning, or widened to a pattern:

| assertion | before | after |
|---|---|---|
| cutover `G1`/`G1a`/`G2.7` | window ended at the working tree | window ends at the round's own commit |
| cutover `F1`…`F8b`, `N6`/`N7`/`N9`/`N12` | read today's sources | read the round's sources |
| `ai-plan-advice E4` | — | passes because the stamps moved, not because it was changed |
| `action-registry` item 8 | `72_` unaccounted | `GS_OWNED_SINCE_R1['72_…']` **named, with the reason** |
| guard `F5` | `=== 12` | `>= 12` — a floor, which is what "R5 moved it" durably means |
| guard `F5a` | `=== 12` | equals the deployed contract — which is what "to MATCH" says |
| override `C5` | `.gs` at the round vs browser file **today** | both sides at the round |
| override `E10` (mutant) | mutated the literal `12` | mutates one below whatever the pin is |
| activation `BP2a` | `=== 'R6-R7-R6'` | registered · legally shaped · at or after R6-R7-R3 |
| activation `N13` (mutant) | mutated two spelled releases | mutates one registered release back |
| activation `OBSERVED_BUILD` | a literal retyped every release | **derived** from the pin it already documents |
| census `AB20c`/`AB20e` | assumed build == frozen build | assert the gate that fires, **plus three new ones** |

Two of these deserve naming. `OBSERVED_BUILD` was a hand-edited copy of a value whose own comment said
*"this double follows the pin"* — two things that are by definition the same, and R6-R7-R7 is the release
that forgot the second. It is derived now, and the chain `SYS_DEPLOYMENT_RELEASE_ → R6R7_ACTIVATION_BUILD_
(BP3) → the healthy double` is still asserted end to end.

And `AB20`: with `S1_BUILD_` following the release, the frozen S1-R4E authorization is now pinned to an
**earlier** build, so §6.1 STOPs with `BUILD_DRIFTED` before §6.3 ever reads the sheet. That is the designed
order — *"an expectation frozen against another build is not this build's evidence"* — and marching the
frozen build field to match would claim the operator measured at a release that did not exist. So the
default run asserts the gate that actually fires, and the live-state gate is proved immediately below on
the same world with the expectation re-pinned to the current build: **one assertion re-aimed, three added,
and the ORDER between the two gates now covered where it had been assumed.**

### §33.6 Category is dynamic. The prototype's three are a fixture, and they are not a contract.

**`category authority = sku_details.category`, and nothing else.** Never `series`, never `product_name`,
never a SKU prefix — those are a product family, a label and a naming habit, and each would invent a
taxonomy nobody maintains.

**But the universe is the SITE's, not the table's.** Reading `DISTINCT category` off the whole of
`sku_details` would put categories in the menu that this site does not sell — the same defect as showing a
SKU that is not on the site, one level up. The order is fixed:

```
complete company/country/marketplace scope
  → marketplace_skus membership universe        (server-resolved)
  → status gate
  → join sku_details by sku
  → take category from the SURVIVING rows
  → trim
  → drop blanks
  → exact-value de-duplication
  → deterministic ascending sort
  → offer as the UI category filter
```

| situation | behaviour |
|---|---|
| category exists in `sku_details`, no site SKU sells it | **absent** from this site's menu |
| at least one site SKU with a permitted status | **present** |
| only `inactive` / `discontinued` SKUs | absent by default; present under `include_inactive: true` |
| only `phasing_out` SKUs | **present by default** — still on sale |
| `category` blank | **`CATEGORY_SOURCE_MISSING`**; the SKU is kept and returned with `category: null`, and is **never** renamed `Other` |
| two values differing only by case or spacing | trimmed, **kept as two**, and reported as `CATEGORY_NORMALIZATION_REVIEW_REQUIRED` — merging is a data decision an operator owns |

There is **no category allowlist, no limit of three, and no maximum at all**: `PPW_CATEGORY_ALLOWLIST_` is
`null` and `max_options` is `null`, both published in the response so a reader can check rather than trust.

The **category filter itself is now exact** (trim-only). It compared lower-cased values, which is a semantic
merge: it would have made two menu entries behave as one, contradicting the very list the menu is built from.

### §33.7 `filterOptions` — derived from membership, counted over the universe, withheld when unprovable

```
filterOptions: {
  categories: [ { value: "Electric Can Opener", siteSkuCount: 12, analysableSiteSkuCount: 10 }, … ],
  series:     [ … ],
  provenance: { category_source, series_source, derived_from, counts_are, page_size_independent,
                self_excluding, normalization, semantic_merge, blank_category_rows,
                blank_becomes_other, allowlist, max_options, inferred_from }
}
```

- **Server-resolved.** Built from rows that already survived membership and the status gate. A client that
  received every master SKU could not compute this, and is not asked to.
- **Self-excluding.** A dimension's options are not narrowed by its own filter — a menu that collapses to
  the item you just picked cannot be used to pick anything else — but they **are** narrowed by the other
  dimension, so every option shown still leads to at least one row.
- **Counts are the whole scope/filter universe, never the page.** Pagination is a window onto
  `normalizedRows`; a category with 12 SKUs has 12 whether the page shows 200 or 1.
- **Withheld when the universe is not provable.** A capped source — or any refusal — sets `filterOptions`
  to **`null`**, not to an empty list, and `analysis_permitted` to false from the *same expression*, so the
  two can never disagree. A menu that looks complete over a truncated universe is worse than no menu.
- **No second endpoint.** There is no generic category read; the options travel with the answer they
  describe, so they cannot drift from it.

The accessor learns the **shape** and not one **value**: it validates that `categories`/`series` are arrays
of `{value, …}`, accepts `null` as meaningful, refuses `null` when `analysis_permitted` is true, and
contains no category string, no default list and no three-item fallback. `contract.categoryVocabulary` is
`null`, `contract.categorySource` is `'server'`, `contract.categoryLimit` is `null`, and
`contract.derivesCategoriesFromMasterData` is `false`.

### §33.8 The prototype boundary, restated

`docs/prototypes/product-strategy-board/` is **unchanged this round** — no HTML, no CSS, no JS, no fixture.
Its banner stays. And, again, on the record:

- The prototype's **three categories are demonstration data**. They are not the Operation DB category
  universe and they never were.
- **The prototype's category count says nothing about the real data.** A site may have one category or
  forty; §33.6 is how many it has.
- **P1-B2's live UI must not carry the fixture list in.** The menu comes from `filterOptions.categories`
  or it does not render.
- **No Preview fallback before the live adapter succeeds.** A failed read is `SOURCE_NOT_CONNECTED`.
- **An empty real response shows a true empty state**, never the three demo categories. `filterOptions:
  null` and `categories: []` are different answers and must look different.

### §33.9 What this round did not do

No production UI file, no `app.js`, no page HTML/CSS/JS, no prototype change, no `index.html`, no schema,
no migration, no new table, no S1–S5 work, no main worktree change, no DB or API read, no DB/Drive write,
no network, no Apps Script sync, no deployment version, no `flag = true`, no merge, no push.

`APPS_SCRIPT_SYNC_REQUIRED` when the user releases: `72_api_v1_product_pricing_workspace.gs` (NEW) +
`00_config.gs` + `01_router.gs` + `63_api_v1_system_health.gs`. Pages redeploy **after** that sync, never
before it.

**Next:** P1-B2 — Operation System page integration, `.km-tab-rail` sub-navigation, the live adapter, the
category menu fed from `filterOptions`, no Preview fallback, flag still false. Then P1-B3 — production
readback, DB-vs-UI counts, no cross-site contamination, operator acceptance. Only then is `flag = true`
a question that can be asked.

---

## §34 — P1-B2: the site decides what exists, the data decides how many categories there are, and a simulated price has nowhere to go

Three asks, and each turned out to be a different kind of defect. Everything below was measured by
executing the files, not by reading them.

### §34.1 Why the screen showed three categories — the root cause, measured

**The screen is `docs/prototypes/product-strategy-board/index.html`, and it is connected to nothing.**
Its three categories were three string literals in a hard-coded `MODELS` array inside
`preview-fixture.js`. Executed before the change: 54 rows, 3 distinct `category` values, counts
32 / 5 / 17.

Each of the six candidate causes the brief listed was checked and each is **not** the cause:

| candidate | verdict |
|---|---|
| hard-coded fixture | **THIS IS IT.** 14 `MODELS` entries, 3 `cat:` literals |
| demo adapter | true but downstream — `PreviewProductStrategyDataAdapter` returns those rows; `provenance.connected_to_db: false`, `requests_made: 0` |
| sampled from part of the SKU set | no — it returns every fixture row it has |
| a fixed allowlist | no — `PPW_CATEGORY_ALLOWLIST_` is `null` and there was no client-side list either |
| normalization merging several kinds | no — no folding existed on the read path |
| blank / unknown values dropped | no blank value existed in the fixture to drop |
| never wired to `sku_details.category` at all | **yes, and this is the same finding** — nothing in the prototype reads any table |

**So the number three was never a statement about the database.** P1-B1-R1 had already made the
server-side universe dynamic (§33.6: no allowlist, no cap, discovered per site). What remained was a
prototype whose demonstration data had quietly become the thing people read the count off.

### §34.2 The second defect, which the audit found rather than the brief: the menu was never site-derived

```
F.CATEGORIES = distinct category over ALL_ROWS, across every site, computed once at load
ADAPTER.categories = F.CATEGORIES.slice()
```

Six places in `prototype.js` read that list. Measured on the pre-change fixture:

| site | menu offered | site actually sells |
|---|---|---|
| US | 3 | 3 |
| DE | 3 | **1** |
| UK | 3 | **1** |

So on DE the menu offered two categories that country does not stock, and picking either produced an
**empty category card**. That is the same defect as showing a SKU the site does not sell, one level up —
and it is the reason this round inverts the scope ladder rather than merely reformatting the menu.

The list is **deleted**, not corrected. A site-derived menu that still has a cross-site list within
reach has a fallback, and a fallback is where the next round's version of this defect would live. The
suite asserts on the *absence*: `F.CATEGORIES === undefined`, no `categories` property on the adapter,
and no reader of that name anywhere in the renderer's source.

### §34.3 The mapping, and the counts, after the change

`category authority = sku_details.category`. Nothing else — not `series`, not `product_name`, not a SKU
prefix. Raw → canonical → label, over the whole canonical fixture (75 rows, 4 sites):

| raw `sku_details.category` | canonical | UI label | rows |
|---|---|---|---|
| `Electric Can Opener` | `Electric Can Opener` | Electric Can Opener | 32 |
| `Silicone Spatula` | `Silicone Spatula` | Silicone Spatula | 27 |
| `Manual Can Opener` | `Manual Can Opener` | Manual Can Opener | 5 |
| `Electric Kettle` | `Electric Kettle` | Electric Kettle | 4 |
| `Milk Frother` | `Milk Frother` | Milk Frother | 4 |
| `Kitchen Shears` | `Kitchen Shears` | Kitchen Shears | 1 |
| `silicone spatula` | `silicone spatula` | silicone spatula | 1 |
| *(blank)* | `null` | **Unmapped / Needs Review** | 1 |

**The transform is identity in every row, and that is the point.** `canonicalCategory` folds case and
spacing in the *lookup* only, against an alias table an operator declares; `S.ALIASES` is `{}`, so no
value is rewritten. An undeclared value is returned unchanged rather than matched to the nearest thing,
because nearest-matching is how a taxonomy nobody maintains gets invented.

Per site — the menu is now whatever that site sells, and no two sites agree:

| site | eligible | plottable | excluded | categories (site SKUs / analysable) | blank | review | DQ |
|---|---|---|---|---|---|---|---|
| `Kitchen Mama\|US\|Amazon` | 43 | 42 | 32 | Electric Can Opener (20/19) · Electric Kettle (2/2) · Manual Can Opener (4/4) · Silicone Spatula (17/17) | 0 | — | 1 |
| `Kitchen Mama\|US\|Walmart` | 15 | 14 | 60 | Electric Kettle (2/2) · Kitchen Shears (1/0) · Silicone Spatula (10/10) · silicone spatula (1/1) | 1 | `Silicone Spatula` vs `silicone spatula` | 2 |
| `Kitchen Mama\|DE\|Amazon` | 10 | 10 | 65 | Electric Can Opener (8/8) · Milk Frother (2/2) | 0 | — | 0 |
| `Kitchen Mama\|UK\|Amazon` | 6 | 6 | 69 | Electric Can Opener (4/4) · Milk Frother (2/2) | 0 | — | 0 |

Excluded rows always carry a reason. US Amazon: `NOT_LISTED_ON_THIS_SITE` 31, `EXCLUDED_BY_STATUS` 1.

**What the live universe is, this round still cannot say.** There is no execution channel from this
repository into the Operation System spreadsheet, so `DISTINCT sku_details.category` over live data is
not enumerated here and is not guessed at. What is established is that no code path caps, folds or
allowlists it: the operator obtains the real list by running `productPricing.workspace.get` and reading
`filterOptions.categories`, which is server-derived and travels with the rows it describes (§33.7).

### §34.4 **D-B2-1 — the scope ladder inverts. This supersedes §30.2.**

P0-R3-R2 made category the first ring. That was right while the board had one site and it became wrong
the moment the site decided which products exist: a category menu built before the site is known is a
menu over every site.

```
  BEFORE (P0-R3-R2)   category → company → country → marketplace → currency → series
  AFTER  (P1-B2)      company → country → marketplace → category → series → currency → threshold
```

The new order is the source's own (§33.6, `72_ ppwMembership_`). Two consequences are attached at the
source rather than remembered by each view:

- **Changing a ring invalidates everything to its right**, in one function (`narrowAfterSiteChange`). A
  category the new site does not sell cannot stay selected — otherwise every downstream view filters to
  zero rows and the screen looks like a site with no products instead of a stale selection.
- **The board opens on a complete site identity** (`Kitchen Mama | US | Amazon`), not on `ALL`. A price
  ladder needs one currency and a scenario needs one site; a board that opened on an aggregate would
  have to refuse both on the first screen a person sees.

`ALL` remains available and is a **different state**, `AGGREGATE_ACROSS_SITES`: one axis per currency
(never pooled, `fx_applied: false`), and no scenario, because a simulated price not attached to one site
is a number in no currency.

### §34.5 Site eligibility — the order, and the three-way outcome

```
site identity → marketplace_skus membership → status gate → sku_details join → regional detail
```

**Membership is a row in `marketplace_skus` and nothing else.** Not a master SKU in `sku_details`, not a
price in USD, not a currency that looks American. A master record is a product the company owns; it is
not a listing. Asserted directly: a DE row with its currency rewritten to USD does not appear on the US
site, and the universe publishes `currency_decides_membership: false` and
`master_table_decides_membership: false` as data.

**The status gate needs one of each to be demonstrated.** One fixture model is `inactive` (excluded by
default, returned under `include_inactive` — a gate, not a deletion) and one is `phasing_out` (present
by default, because a product being phased out is still on sale). A gate that excluded everything
unusual would be as wrong as one that excluded nothing.

**A blank or unrecognised status is not "yes".** It is excluded with a named reason
(`SITE_STATUS_MISSING` / `SITE_STATUS_NOT_RECOGNISED`) and reported as Data Quality. A question answered
"yes" would put a SKU on a page on the strength of a blank cell.

**Regional detail does not decide membership, and a missing one has three outcomes at once:**

| | outcome |
|---|---|
| in the universe | **KEPT** — `marketplace_skus` said it is on this site, and membership never depended on `sku_regional_details` (§31.5) |
| Data Quality | **REPORTED**, by identity, in the missing-mapping ledger on the Data Quality page |
| price chart | **NOT PLOTTED** — `chart_refusals: ['REGIONAL_DETAILS_MISSING']` |

Collapsing those three would make "we cannot describe this listing" indistinguishable from "it is not
sold here" or from "all is well". It is never read as sold-everywhere.

**One chart-refusal rule, and both callers ask it.** The first implementation computed chartability
inside `getEligibleProductUniverse` and published a `chartRows` list that nothing downstream read — so
the universe knew the Kitchen Shears listing was unplottable and the chart drew it anyway. The suite
caught it (§I14). `S.chartRefusalsFor` is now called by the universe *and* by `ingest`, so the ledger
and the axis are the same decision. Chartability is decided on the **canonical** price, never a
simulated one: a scenario must not be able to give a coordinate to a product that has no price on
record — that would not be a simulation, it would be an invention.

### §34.6 The category menu, and the two things it refuses to do

Rules are the live read's (`72_ ppwFilterOptions_` / `ppwNormalizationVariants_`), implemented once in
`selectors.js` so the prototype and the live page cannot answer differently.

- **Trim is the only normalization.** Case and internal spacing are **not** folded.
- **Two values differing only by case are kept as two and reported** as
  `normalization_review` — `Silicone Spatula` vs `silicone spatula` on US Walmart. Merging two business
  categories is a data decision an operator owns.
- **Blank is absent from the menu, never a bucket, never renamed `Other`.** The SKU is kept, its
  `category` is `null`, it is labelled *Unmapped / Needs Review*, and it is counted in Data Quality.
- **No allowlist, no maximum.** Both published as `null` so a reader can check rather than trust.
- **Counts are the whole eligible universe, never the current page.**
- **Self-excluding:** a dimension's options are not narrowed by its own filter — a menu that collapsed
  to the item just picked could no longer be used to pick anything else — but they *are* narrowed by
  the other dimension, so every option shown still leads to at least one row.
- **Deterministic ascending sort.** Never source order.
- **Adding a category requires no code change**: two injected values produced two new sorted menu
  entries and nothing else (§D18–D20).

### §34.7 **D-B2-2 — the session price scenario, and why a series override has a mode**

**Where it lives:** `overrides[siteIdentityKey][series][priceField]`, one plain object inside `STATE`,
and nowhere else. No `localStorage`, no `sessionStorage`, no IndexedDB, no cookie, no URL, no DB, no
sheet, no API, no export. A reload constructs a new empty object and the simulation is gone — which is
the requirement, not a limitation: a price somebody tried out in a meeting must not survive the meeting
by accident. `S.SCENARIO_STORAGE = 'IN_MEMORY_ONLY'` and `survives_reload: false` are published, and the
suite scans all four prototype sources with literals stripped for every persistence API.

**Keyed by site identity first**, because a price is a number in a currency and the currency is the
site's. A scenario keyed by series alone would apply 14.99 to a USD ladder and a EUR ladder at once —
the same defect as a shared price axis, one level up. Asserted: a US override touches neither DE nor US
Walmart.

**THE FINDING THIS FEATURE ALMOST SHIPPED WITH.** The first implementation took one number per series
and assigned it to every member. Run against the Spatula series it turned a four-rung ladder —
14.99 / 19.99 / 24.99 / 34.99 — into four products at 9.99, and every gap and cannibalisation finding
went to zero. That is not a price simulation; it is the deletion of the structure the board exists to
show. So an override carries a **mode**:

| mode | meaning | everyday | promotion |
|---|---|---|---|
| `PERCENT` | each member moves by a percentage of its **own** price; the ladder moves and keeps its shape | default | allowed |
| `DELTA` | each member moves by the same signed amount | allowed | allowed |
| `ABSOLUTE` | one number for the whole series | **REFUSED** | default |

`ABSOLUTE` on the everyday price at series scope returns
`EVERYDAY_ABSOLUTE_AT_SERIES_SCOPE_WOULD_FLATTEN_THE_LADDER` — as a value, not a comment, so the panel
shows the reason — and stores nothing. On the promotion field it is correct and it is the default: a
series-wide deal price genuinely is one number, and simulating one is how a meeting discovers that a
12.99 promotion on the Spatula series creates six cannibalisation findings that were not there.

**Which field, and what it never touches.** `proposed_scenario_price` is the default: board-owned,
already meaning "a number somebody suggested", so nothing downstream mistakes it for a price the
company charges. `everyday_scenario_price` is offered as well, and it **never replaces `regular_price`
on the canonical row**. The canonical values are kept beside the simulated ones under `_canonical`, so
the original is always available to show next to the scenario and a reload has something to restore to.

**The overlay is applied at the one point where cents are computed** (`S.ingest`), so every consumer —
the axis, the open price steps, the gap findings, the comparison table, the category summary — reflects
a simulated price by construction rather than by each view remembering to ask. Findings caused by a
scenario carry `scenario_driven: true`.

**Three resets, because they are three different questions**: this Series on this site, every Series on
this site, every scenario anywhere. An unrecognised scope resets **nothing** — a typo must not clear the
board — and every reset returns a new object rather than mutating the one handed in.

**A printed page says so.** When a scenario is active, `#scenarioPrintMark` appears inside the banner —
undismissable, and kept visible by the print stylesheet against its own hide-the-chrome rules — naming
the site, the override count, that these are not prices the company charges, that they are saved
nowhere, and that they vanish on reload. The controls themselves do not print. The original preview
notice is untouched and still first: this is a *second* statement, and it has to be conditional, because
a warning that is always shown teaches a reader to ignore it.

### §34.8 One pipeline, in one file

```
canonical rows
  → deriveSiteIdentity          → getEligibleProductUniverse
  → deriveCategoryOptions / deriveSeriesOptions
  → applyDimensionFilters       → applyScenarioPriceOverlay
  → derivePriceArchitecture     → render
```

`selectors.js` (new, ~1000 lines, `PSB_SELECTORS`) owns every stage. It is pure: no DOM, no storage, no
network, no clock, no random, no mutation of an input — which is what lets the node suite drive the
whole pipeline with no browser, and what lets a scenario be discarded by forgetting one object.

`prototype.js` is now rendering. The pure functions that used to live in it — `groupNodes`,
`splitByCurrency`, `analyse`, `tierOf`, `sellInterval`, `priceSignature`, `ingest`, `cents` — were
**moved**, and the names remain in the render file as **single delegations** so the chart, the tables
and two hundred DOM assertions did not have to be rewritten to prove a refactor. Each is asserted to be
a delegation and not a copy: two implementations of the grouping rule would agree on the day they were
written and drift afterwards. An absent `PSB_SELECTORS` throws at load — a broken build, not a reason
to guess a chart into existence.

`deriveBoardModel` is the whole pipeline in one call, and `categoryModel(category)` runs it with the
category pinned, so a category page's summary, chart, table and findings drawer cannot disagree.

### §34.9 Contract changes — `ProductStrategyDataContract` is now `P1-B2`

Three, and no more:

1. **`regional` appended** — the `sku_regional_details` row as an object, or `null`. Exactly the shape
   `72_ ppwNormalizeRow_` returns, so the live adapter hands it over without translation. `null` means
   the table has no row for this four-part identity; it never means the SKU is not sold here.
2. **`category` is nullable on read**, `on_missing: 'CATEGORY_SOURCE_MISSING'`. The pre-write header
   gate (`04_:150`) requires a category before a *write*, which is not the same as every existing row
   having one. A contract that called a blank category a `CONTRACT_MISMATCH` would force the renderer to
   choose between dropping the row and inventing a bucket — the two outcomes §33.6 forbids.
3. **`series` is nullable on read**, for the same reason: `72_` already reports a blank series as
   `VARIANT_GROUPING_SOURCE_MISSING` and renders the row ungrouped rather than dropping it.

**One field carries the site status, and it is the one the contract already had.** `source_status` *is*
`marketplace_skus.marketplace_sku_status` (vocabulary `00_config.gs VALID_MARKETPLACE_SKU_STATUSES_`).
Adding a second field holding the same value would be redundancy that can disagree, so `S.STATUS_FIELD`
reads that one — see §34.11 for the collision this creates with the live response, and the assertion
that will catch it.

### §34.10 Operation System integration assessment (design only — nothing was integrated)

**Directly reusable as a sub-tab under an existing top-level category.** `selectors.js` in full: it has
zero dependencies, no DOM and no globals beyond `PSB_CONTRACT`, which is why it can move to
`assets/js/pages/` unchanged. The analysis engine, the variant-grouping rule, the currency-panel split
and the five-unit axis move with it.

**Shell / navigation / layout to reuse from the Operation System**, not to port from the prototype: the
app shell, `.km-tab-rail` sub-navigation, the sidebar hierarchy, modal and card primitives, the i18n
layer, and the existing print stylesheet. The prototype's own sidebar, banner and `prototype.css` are
**prototype-only** and must not travel — a second shell is a second set of layout bugs.

**Adapters that must be replaced by the real API.** `PreviewProductStrategyDataAdapter` →
`productPricing.workspace.get` via `assets/js/api/km-product-pricing-workspace.js` (shipped in P1-B1,
behind a false flag). The two row shapes are **not yet identical**, and this is the integration's real
work:

| gap | prototype row | live response | action |
|---|---|---|---|
| **the `source_status` collision** | the status **value** | an **array of state codes**; the value lives in `marketplace_sku_status` | rename at the adapter. `S.statusStateOf` returns `SITE_STATUS_SHAPE_UNEXPECTED` on an array — **this is the assertion that catches the swap**, instead of every row silently reading as "not recognised" |
| deal / promotion | `official_deal_price` / `_start` / `_end` | `campaigns[]` per row | adapter derives the live-period figure; the board's rule (dates required, else not live) is unchanged |
| variant grouping | `variant_group` (fixture-supplied; **no such column exists**) | `series` | already the live authority; the prototype's per-model grouping is a demonstration and the contract records it as a GAP |
| `variant_name` | fixture colours | `null` — no authoritative column (§28.5, still open) | decide, or render ungrouped |
| image evidence | `image_identity_status` | `product_image` from `sku_details.image_url` | keep the evidence field; it is derived, and an unproven image must stay unshown |
| identity | `MSK-<country>-<mkt>-<sku>` | `MSKU:<marketplace_sku_id>` | live wins; the prototype's shape exists only because the fixture has no ids |

**Route, permission, navigation.** As frozen in §31.11/§31.12 — unchanged by this round and still not
implemented: the page is a sub-tab of an existing top-level section, gated by the P1 feature flag
(still `false`) and a read permission key; no write action is registered because the board writes
nothing.

**Blocking items before any integration.**
1. **`APPS_SCRIPT_SYNC_REQUIRED` from P1-B1-R1 is still unsynced** — `72_api_v1_product_pricing_workspace.gs` (NEW) + `00_config.gs` + `01_router.gs` + `63_api_v1_system_health.gs`. Until the user syncs and deploys, the live adapter has no endpoint to call.
2. **P1-B3 production readback** — DB-vs-UI counts, no cross-site contamination, operator acceptance.
3. The six row-shape gaps above.
4. `variant_name` (§28.5) and the variant-grouping decision (§25) are still open.
5. The flag stays `false` until 1–4 are closed. **No Preview fallback** in the live UI: a failed read is `SOURCE_NOT_CONNECTED`, and an empty real response shows a true empty state — `filterOptions: null` and `categories: []` are different answers and must look different.

### §34.11 Backup-table audit (§九) — read-only reference and dependency scan, nothing deleted

**The two names in the brief do not exist anywhere in this repository.**

| name | repo references | verdict |
|---|---|---|
| `request_order_allocation_drafts_backup` | **0** | **RETAIN — cannot classify** |
| `request_order_allocation_draft_lines_backup` | **0** | **RETAIN — cannot classify** |

Scanned across the whole P worktree and the whole `main` worktree, all file types. Zero occurrences in
code, tests, docs, migrations and diagnostics.

**And the migration used a different name.** `REQUEST_ORDER_ALLOCATION_DRAFT_V2_FLATTEN_DESIGN_FREEZE.md`
§19.8/§19.11/§19.12 names the backup **`request_order_allocation_drafts_legacy_backup`** — the product of
the atomic swap, and step 4 of the documented rollback (`rename _legacy_backup → request_order_allocation_drafts`).
It has **0 references in code**: it is named only in the design freeze, as the rollback target.

**The un-suffixed legacy child table is live.** `request_order_allocation_draft_lines` has **34
references across 10 shipped `.gs` files**, including the valid-tab registry (`03_:35`, `03_:52`), a
sheet-ensuring write path (`15_:316`), the header registry (`23_:38`), a read (`47_:530`,
`gapReadObjects_`), and flow diagnostics that count it and declare an UPSERT against it (`65_:259`,
`:332`, `:355`, `:657`). The design freeze keeps it "untouched (read-only history + rollback) through
R6; retired at R7", and `REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_` is `true` (`00_config.gs:37`).

| item | repo refs | runtime read | runtime write | migration/rollback dependency | FK / id references | rollback evidence | recommendation |
|---|---|---|---|---|---|---|---|
| `request_order_allocation_drafts_backup` | 0 | none | none | none found | none | unknown | **RETAIN** |
| `request_order_allocation_draft_lines_backup` | 0 | none | none | none found | none | unknown | **RETAIN** |
| `request_order_allocation_drafts_legacy_backup` | 0 in code, named in the freeze | none | none | **YES — §19.12 step 4, the single-step rollback** | ids copied verbatim from the pre-swap table | **YES** | **RETAIN** |
| `request_order_allocation_draft_lines` | 34 in 10 files | **yes** | **yes** (`15_:316` ensure) | **YES** — legacy line path resumes on rollback | `request_allocation_draft_id`, `request_allocation_draft_line_id` | **YES** | **RETAIN — not a backup at all** |

**Nothing is classified `SAFE_TO_DELETE`, and the reason is the rule the brief set.** There is no live
dependency evidence either way: this repository has no execution channel into the spreadsheet, so
whether tabs by those two exact names exist at all is not established here. Recommending deletion of a
table nobody can see, under a name the system does not use, would be a decision made on a name
mismatch. If the operator sees those tabs live, the question to answer first is which of the two real
artefacts above they correspond to.

### §34.12 Tests

`assets/tests/product-strategy-board-p1-b2.test.js` — **239 assertions passed, 0 failed, 17 mutants,
0 survived.** Sections: Z the suite reads what it thinks it reads · §A root cause · §B site identity and
eligibility · §C regional detail · §D the category menu · §E the scenario · §F one pipeline · §G derived
numbers recomputed · §H the real page, rendered and driven · §I the Data Quality ledger and the printed
page.

**The prototype's own DOM assertions now run headless.** They used to be observable only by opening the
file in a browser, which meant a refactor of the render pipeline could be reasoned about but not proved.
The suite boots all four files against a DOM shim narrow enough to audit — the selector shapes the file
actually uses and no others, and it **throws** on a syntax it cannot parse rather than returning an
empty match list, because a selector engine that answers "no matches" to what it cannot read turns every
DOM assertion into a passing one. The page's verdict becomes this suite's assertions: **231/231**.

The shim is **held to `index.html`** rather than transcribed from it: every id it declares is asserted
to exist in the real file, and the script tags, link tags, banner text and button titles are extracted
from it. A skeleton nobody checks is a second page, and a suite that tests a second page proves nothing
about the first.

**Six findings came out of the work rather than out of the brief:**

1. **The menu was never site-derived** (§34.2) — found by executing the old fixture per country.
2. **A series-wide absolute everyday price flattens the ladder** (§34.7) — the feature's first
   implementation, which did not error.
3. **`chartRows` was computed and never read** (§34.5) — the universe knew a row was unplottable and the
   chart plotted it. Found by §I14.
4. **`us_only` meant "the home site", not "the United States"** — the same thing only while the US had
   one marketplace. Adding US Walmart made the two readings diverge, and the old one silently withheld
   every US-only product from the second US site: a defect that looked like "Walmart does not sell
   spatulas".
5. **The page's own assertions encoded "three"** — three cards, three rows, and a literal list of three
   names. Changing 3 to 4 would have been the same defect one number along, so each now asserts the
   derivation, and one of them switches the country and requires the menu to change.
6. **The suite was green on LF and red on CRLF, and it lied about why.** `core.autocrlf=true` means every
   checkout lands CRLF in the working tree while the blob stays LF. A mutant's anchor is a multi-line
   string, so an anchor that matches zero times makes `swap` throw — which `mut` reports as MUTANT
   SURVIVED. A `git stash pop` during the pre-existing-failure check re-checked the files out and six
   mutants flipped to SURVIVED with the code they target unchanged by a byte. **That is the worst
   failure mode available: red with a message about a rule, when what happened is that git touched the
   file.** Sources are now normalized on read, and section Z asserts the normalization worked and that a
   representative multi-line anchor still matches exactly once — so the next time a checkout breaks
   this, one assertion says so instead of six mutants blaming the rules.

Two mutants had to be re-aimed after surviving: one assigned `'Other'` above the branch's own `return`,
so the bucket it was meant to create was unreachable; the other forced the `ABSOLUTE` branch and
survived because `S.cents('-15')` is negative, so the override was dropped and the ladder stayed intact
for the wrong reason. A mutant that goes green while the rule it targets is untouched is worse than no
mutant.

### §34.13 Isolation record

**Changed** — 9 files, all inside the P worktree (2 new, 7 modified; +3942 / −403):

| file | change |
|---|---|
| `docs/prototypes/product-strategy-board/selectors.js` | **NEW** — the pipeline |
| `docs/prototypes/product-strategy-board/preview-fixture.js` | 4 sites, the regional layer, the status column, 5 new models, `loadCanonical()`, `load()` delegates, `F.CATEGORIES` deleted |
| `docs/prototypes/product-strategy-board/data-contract.js` | `regional` appended; `category` / `series` nullable on read; version `P1-B2` |
| `docs/prototypes/product-strategy-board/prototype.js` | render-only; ladder inverted; scenario panel; eligibility ledger; print mark; self-test de-hardcoded |
| `docs/prototypes/product-strategy-board/prototype.css` | site ring, scenario panel, DQ ledger, print rules |
| `docs/prototypes/product-strategy-board/index.html` | `selectors.js` as the second script |
| `assets/tests/product-strategy-board-p1-b2.test.js` | **NEW** — 232 assertions, 17 mutants, the DOM shim |
| `docs/planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md` | this §34, and §30.2 marked superseded |
| `assets/specs/active/project-current-state.md` | the P1-B2 entry |

**Not touched:** no production page HTML/CSS/JS, no `app.js`, no `index.html` of the application, no
Operation System shell or navigation, no `assets/js/pages/**`, no `assets/specs/active/apps-script/**`,
no schema, no migration, no new table, no S1–S5 work, no `main` worktree, no `C:/km-lb`.

**Zero:** production DB writes, Google Sheets writes, Drive writes, network requests, Apps Script sync,
deployment version, `flag = true`, backup-table deletions, merges, pushes.

`APPS_SCRIPT_SYNC_REQUIRED` **for this round: none.** The outstanding sync is still P1-B1-R1's four
files, unchanged by P1-B2.

### §34.14 What this round did not do

No live UI page was created and nothing was integrated into the Operation System shell — §34.10 is an
assessment, as the brief asked. The live category universe was not enumerated, because there is no
execution channel to enumerate it with. `variant_name` (§28.5) and the variant-grouping decision (§25)
remain open. The prototype's own DOM assertions are now executed headless, but the **visual** result —
layout, colour, print pagination — is still verified by a person opening `index.html`.

**Next:** P1-B3 — production readback against the live endpoint once the user has synced P1-B1-R1's four
files: DB-vs-UI counts per site, no cross-site contamination, the real category universe read off
`filterOptions`, and operator acceptance. Only then is `flag = true` a question that can be asked.

---

## §35 — P1-B2A: the black dot, the density, and a meeting control that speaks English

This round came from a person looking at the screen, which changes what the work is. Nothing in §34
was wrong — the P1-B2 suite was green before this round started and stayed green throughout — and the
screen was still hard to use. Four of the defects fixed below were **invisible to every DOM assertion
in the repository** and were found by rendering the page in a browser and looking at it.

### §35.1 The black dot — one source, and the fix is not transparency

**Root cause, exactly.** `prototype.js`, inside `everydayMarker`:

```js
grp.appendChild(svg('circle', { cx: cx, cy: cy, r: 2, 'class': 'mk-anchor mk-reg', … }));
```

a 2px circle filled `#14181f`, appended **last** — therefore on top of the photograph — at the plate's
exact centre. Its purpose was honest (make the datum visible and provably independent of plate size);
its placement was not: the one pixel that proves the coordinate sat on the one thing a person came to
look at. Every other candidate the brief listed was checked and cleared:

| candidate | verdict |
|---|---|
| SVG point / circle | **this one** — `.mk-anchor`, fill `#14181f`, `r=2`, drawn last |
| everyday-price marker | the plate itself; it is the marker, and it is not a dot |
| image placeholder | a plate plus a short code, never a dot |
| pseudo-element | none on any chart element (`::before`/`::after` exist only on the sidebar nav) |
| a marker behind a transparent image | no; the image is drawn after the plate and before nothing |
| alt / fallback text | text, not a dot |
| scenario marker | `.mk-prop`, a hollow diamond at the **proposed** price — a different y, and kept |

**The fix removes it rather than hiding it.** A dot made transparent is still in the tree, still
hit-tested, and still there for the next reader to rediscover. The datum is now a **crosshair drawn
behind the plate** and extending 8px past it on both sides, so what remains visible are two short
stubs meeting the gridline — more readable than the dot, and nowhere near the picture. It keeps the
class, the exact coordinate and the price, so the assertions that prove the plate is centred on its
price still have something to read.

Assertions: `B1`–`B11` plus the page's own `H4a`/`H4b`/`H4c`; mutants `N1` (the dot returns) and `N2`
(the dot is hidden instead of removed).

**Semantic markers are kept** — live promotion and proposed scenario sit at their own prices, never
on the photograph. **The no-image placeholder** is modelled on the Operation System's
`.cr-img-placeholder` (`campaign-risk.css:440` — grey plate, light border, small muted text). Note for
integration: the Operation System has **two** placeholder implementations today (`.cr-img-placeholder`
and `.skuh-placeholder`), not one; a shared component should be extracted when this page moves in.

### §35.2 Chart readability

| | before | after |
|---|---|---|
| product image | 36px | **50px** (brief: 46–54), square, never cropped |
| column width | fixed 112px | 74–208px, computed from the design width and **centred** |
| product label | 11.5px | 12.5px |
| price sub-label | 10.5px | 11.5px |
| axis ticks | 11px | 11.5px |
| plot height | 260–480px | 300–560px |

**Centring is the part that mattered.** Capping the column width without centring is what left the
large empty margin on the right, because all the slack collects at one end. The assertion is that
`|leftGap − rightGap| < colW/2` — half a column, not a whole one: a full-column tolerance accepted the
uncentred layout and let its mutant through (`N12`).

**No layout box is ever measured.** There is no `getBoundingClientRect` and no `offsetWidth` anywhere
in the prototype; the SVG carries a `viewBox` at a declared design width (1180) and the element is
sized in CSS. A chart whose geometry depends on when it was measured draws differently on a slow load.

**Labels stagger onto two rows** when the column falls under 104px, so 44 of them do not overlap.
**Keyboard reaches the same facts**: every column is `tabindex="0"` with a full `aria-label`, and focus
opens the same detail panel the pointer does (`data-anchor="focus"` distinguishes the route).

### §35.3 Zoom — and why it cannot move a price

`Fit · 100% · 125% · 150% · Reset view`. The **viewBox is identical at every size**; what changes is
the width the element is painted across. That is what makes "zoom cannot move a price" provable rather
than promised, and it is asserted directly: at 150% the viewBox string, every `data-price-c`/`data-cy`
pair and every axis tick are byte-identical to Fit (`C16`–`C21`), and the mutant that scales the
viewBox instead is caught (`N3`).

**Fit has a legibility floor, and the 44-product chart is why.** `width: 100%` on a drawing that needs
3364px inside a ~1400px card paints it at **0.42×** — every coordinate correct, every pixel unreadable,
which is the exact complaint this round exists to answer. So Fit means *fit the card when it fits*;
once the columns need more than the design width the chart is painted at natural size and the
container scrolls. A chart you scroll is usable; a chart shrunk to illegibility is not, and calling it
"fitted" does not make it readable. **The page never asks the browser to zoom**, and **print always
uses Fit** (`@media print { .chart { width: 100% !important } }`), so a size chosen for a room never
reaches the paper. Zoom lives in page memory only.

**Reset view is not a second Fit.** It restores the zoom **and** the layer set — the thing a person
wants after ten minutes of a meeting and cannot reconstruct from memory.

### §35.4 Layers, Clean and Detail — and the one band that is not two

**`Floor to list price` is a single band from `pricing_list.minimum_price` to `pricing_list.msrp`, and
`msrp` IS the list price** — it is the only list-price column the schema has. An "MSRP" layer and a
"List price" layer would therefore be two switches over one field: two names for the same number, which
is how a reader comes to believe the board holds data it does not. So the top cap is **one** layer,
named for both words (`MSRP / list price`), and its tooltip says they are one column. Asserted:
"list price" appears in exactly one layer label, and there is no separate `MSRP` layer (`D2`–`D4`).

Six layers — Product images · MSRP / list price · Lowest / floor price · Live promotion · Proposed
scenario · Open price steps — each independently switchable. **A hidden layer removes its element AND
its legend key together**; hiding a line and leaving its key is worse than showing the line, because
the reader is told the chart contains something it does not (`D5`–`D16`, mutant `N4`).

**The band needs both ends.** With one cap hidden it is not a shortened band, it is a line from a price
to nothing, so it is not drawn (`D8`, `D13`, mutant `N5`). **The axis range follows the visible
layers** — a hidden MSRP stops reserving the top of the chart, which is the reason to switch it off.

**Clean and Detail set the switches** rather than being a third state, so a person can press Clean and
then re-enable one layer without the two fighting; once a layer is edited the badge stops claiming a
preset (`D19`–`D25`). No layer touches the data: `selectors.js` cannot even see the layer state (`D27`).

### §35.5 The scenario, redesigned around what a person is doing

The form used to expose the data model — a field called `proposed_scenario_price`, a mode called
`PERCENT`, a Series box defaulting to `All`. Those are precise names that belong in the override
object. Now:

1. **The site is read-only context** — Company / Country / Marketplace / Currency, with nothing in it
   to change. It is chosen upstairs in the scope ladder and a scenario never gets to disagree with it.
2. **The Series must be chosen.** There is no `All` option at all, and the empty option reads
   "Choose a Series…". A change whose reach you cannot see is not a scenario you can discuss. The list
   is the analysable Series of *this* site and category.
3. **Price to simulate**: `Proposed price` (default) or `Everyday price`.
4. **Adjustment**: `Set proposed price` · `Increase / decrease by amount` · `Increase / decrease by
   percentage`. With the everyday price chosen, `Set…` is **not offered** — the combination that would
   flatten the ladder cannot be expressed, which is better than accepting it and explaining afterwards.
5. **Apply to chart**, gated by one validator that reports in the same sentences: no Series, empty,
   not a number, a negative price, a figure outside the board, a percentage at or below −100%. Nothing
   is stored on a refusal and nothing half-applies (`E12`–`E18`, mutant `N8`).

**The reach is shown before the change** — how many listings the chosen Series would move — and again
after. **The original position stays on the chart** as a hollow ghost marker joined to the simulated
one by a connector, so the difference is a distance rather than a number to remember. Affected products
carry a quiet dashed outline: a highlight, not an alarm.

**Undo last change** pops a stack of previous override objects (they are immutable values, so
remembering one costs a reference), beside the three resets. Everything is still `IN_MEMORY_ONLY`; the
contract name moved behind the `?` and the surface says it in words. A reload restores every canonical
value (`E36`–`E39`), and the printed page carries the unsaved-scenario mark.

**Meeting mode starts collapsed.** With the form open by default the chart began below the fold at
1920×1080. The badge stays outside the collapse: hiding a control is a density choice, hiding the state
would be a lie.

### §35.6 Progressive disclosure

One `?` component, used everywhere. It is a **button**, not a hover tooltip — hover alone excludes
keyboard users and every touch device. Click or Enter/Space toggles; Escape, a click outside, or the
control again closes it; `aria-expanded`, `aria-controls` and `role="note"` carry the state; one panel
is open at a time. The document-level listeners are registered **once** at boot, not per render.

Moved off the permanent surface and behind the `?`: category normalization detail, canonical/excluded
row explanations, the scope order, the `IN_MEMORY_ONLY` contract name, and the all-countries
aggregation limits. What remains visible is one line of state per block.

**Column names are allowed inside a popover and not on the default surface**, and both halves are
asserted: the category popover names `sku_details.category` (`F9`), while the category page's visible
text carries no schema name at all (the page's own `R10`). The marker's own tooltip was rewritten into
words for the same reason.

### §35.7 The Operation System's control contract, copied by value and held to it

`assets/css/base.css` already declares a `--filter-*` block described in its own comment as
*"SINGLE SOURCE OF TRUTH for every filter control"*, calibrated to the SKU Details filter, plus
`--btn-*`, spacing, radius and typography tokens, and a shared `.km-filter-bar` class in
`components.css`.

The prototype is a self-contained non-runtime page and may not reach into `assets/**`, so **41 tokens
are copied here with their names kept identical, and the suite asserts every one against the real
`base.css`** (`G1`–`G3`). A copy nobody checks becomes a second system the first day somebody changes
the original; a copy a test holds to the original is a mirror.

Three tiers, in the source's own order: **Site** (company · country · marketplace) → **Analysis**
(category · series · currency) → **Advanced**, collapsed (gap threshold · include inactive · the stress
fixture). **Meeting mode is its own panel**, not another row of filters. Selection is a green fill
rather than red text. **Category has two shapes**: chips up to six, and above that the busiest five
plus a searchable `More (N)` popover — a wall of forty chips is not a menu, it is a paragraph, and it
pushes the chart below the fold. The count travels with every option in both shapes.

### §35.8 Density — the stress fixture

Generated, deterministic (**no `Math.random` anywhere**; every price is arithmetic on an index), and
labelled `STRESS_FIXTURE_GENERATED` on every row with `is_database_data: false`:

**8 countries · 10 site identities · 12 categories · 15 series · 44 products on one chart · 401 rows**

It is opt-in from Advanced filters so the density can be *seen*, and the suite drives it directly
(`H1`–`H31`). It is not data and this round does not claim otherwise.

### §35.9 Four defects that only a screenshot could see

The page was rendered in headless Chrome at 1920×1080, 1440×900 and 1280×720 and inspected. Both suites
were green for every one of these:

1. **Two `.scope` rules merged.** CSS picks a winning *declaration*, not a winning *rule*: the old
   rule's `align-items: flex-end` survived into the new `flex-direction: column`, right-aligned every
   tier and shrank each to content width — the whole filter area stacked into the right half of an
   empty band.
2. **`.adv-body-row { display: flex }` beat the browser's `[hidden]` rule**, so the advanced drawer
   rendered fully open while its `hidden` property was `true` and its button said "Show". The
   assertion read the property, and the property was correct.
3. **Two legend keys had no swatch style** — `MSRP / list price` and `Lowest / floor price` rendered as
   a label beside an empty box. A key that shows nothing sends a reader looking for a marker that does
   not exist.
4. **Fit painted the 44-product chart at 0.42×** (§35.3).

Each is now an assertion (§J): no top-level selector declared twice, `[hidden]` forced to win, every
legend key styled, and the Fit floor. `.adv-toggle` was additionally found to be **two different
components sharing a class name** — the Advanced Details page header and the new filter toggle — and
the new one was renamed `.filt-toggle`; components do not take turns with a class, their declarations
merge.

### §35.10 Visual acceptance

**Screenshots produced** (headless Chrome, local file, no network), in the session scratchpad:

| view | file |
|---|---|
| Executive Overview 1920×1080 | `shots/1920x1080.png` |
| Category Analysis 1920×1080 · 1440×900 · 1280×720 | `shots/cat-1920x1080.png`, `cat-1440x900.png`, `cat-1280x720.png` |
| Category Analysis, full page | `shots/cat-full.png` |
| Stress fixture, 44 products | `shots/stress-fit.png`, `stress-full.png` |

**Print preview was NOT captured** — headless `--print-to-pdf` was not run, so the print stylesheet is
verified by assertion only (Fit forced, controls hidden, scenario mark kept) and needs a person.

**Manual acceptance checklist — a person with a browser, `docs/prototypes/product-strategy-board/index.html`:**

- [ ] 1920×1080, 1440×900, 1280×720: the filter area stays three compact rows and the price chart is visible without scrolling past a wall of controls.
- [ ] No black dot on any product photograph, at any zoom, on any category.
- [ ] Product images read clearly at arm's length; SKU, price and variant counts are legible.
- [ ] Fit / 100% / 125% / 150% / Reset view: the y-axis values are identical at every setting.
- [ ] Load the stress fixture, choose Electric Can Opener: 44 products, markers full size, the chart scrolls sideways and the page does not.
- [ ] Clean and Detail: lines appear and disappear together with their legend keys.
- [ ] Meeting mode: pick a Series, set a proposed price, Apply — the original position is visibly beside the simulated one; Undo and the three resets behave.
- [ ] Reload the page: every simulated price is gone.
- [ ] `?` icons: click, Escape, click-outside, and Tab + Enter all work.
- [ ] **Print preview / Save as PDF**: the chart is at Fit, controls are gone, the preview banner and (with a scenario active) the UNSAVED SCENARIO mark are on the first page.
- [ ] Colour and weight read as the Operation System, not as a second product.

### §35.11 Isolation record

**Changed** — 8 files, all inside the P worktree:

| file | change |
|---|---|
| `docs/prototypes/product-strategy-board/prototype.js` | the chart, the controls, the scope tiers, the scenario form, the popovers |
| `docs/prototypes/product-strategy-board/prototype.css` | the Operation System tokens, the new components, de-duplicated rules, `[hidden]` |
| `docs/prototypes/product-strategy-board/preview-fixture.js` | the stress fixture and its adapter |
| `docs/prototypes/product-strategy-board/selectors.js` | the human scenario vocabulary, validation, affected-SKU count |
| `docs/prototypes/product-strategy-board/index.html` | the always-visible universe caveat |
| `assets/tests/_psb-harness.js` | **NEW** — the shared DOM shim, extracted so two suites cannot test two browsers |
| `assets/tests/product-strategy-board-p1-b2a.test.js` | **NEW** — 220 assertions, 14 mutants |
| `assets/tests/product-strategy-board-p1-b2.test.js` | follows the redesigned controls; unchanged rules |

**Not touched:** no production page, no `app.js`, no Operation System shell or navigation, no
`assets/js/**`, no `assets/css/**`, no `assets/specs/active/apps-script/**`, no schema, no migration,
no S1–S5, no `main`, no `C:/km-lb`.

**Zero:** DB writes, Sheets writes, Drive writes, network requests, Apps Script sync, deployment,
`flag = true`, merges, pushes. `APPS_SCRIPT_SYNC_REQUIRED` for this round: **none** (the outstanding
sync is still P1-B1-R1's four files).

### §35.12 The merge gate is unchanged, and none of it moved this round

P1-B2A is UI acceptance on a fixture. It does **not** connect the live database and does not claim to.
All nine conditions in the brief's §十一 still stand: P1-B2A visual acceptance, P1-B3 live readback, the
real universe measured, regional eligibility verified on live data, the six adapter shape gaps closed,
Preview fallback off in production, the flag and permission key, shell integration with its own tests,
and regression + responsive + print acceptance.

**Next:** P1-B3 — production readback once the user has synced P1-B1-R1's four Apps Script files.

---

## §36 — P1-B2B · STABLE CHART GEOMETRY · LABEL COLLISION · PRICE-GAP TERMINOLOGY

*(P worktree `feature/product-strategy-board-p0`; PRE `c93f004`→`b1f60ff`, POST `<this commit>`.
Local commit only, never pushed. Fixture UI work; no live database connection is claimed.)*

Three complaints came out of the visual acceptance of P1-B2A, and all three turned out to be the
same mistake told three different ways: **something whose job was to DESCRIBE the drawing had been
allowed to DERIVE it.**

### §36.1 Root cause 1 — the checkboxes owned the y domain

`renderChart` computed the axis extent like this:

```js
[n._regular_c,
 layerOn('floor')    ? n._min_c  : null,
 layerOn('msrp')     ? n._msrp_c : null,
 (layerOn('promo') && n._deal_live) ? n._deal_c : null,
 layerOn('scenario') ? n._proposed_c : null]
```

The visible layers decided the range. Switching off **MSRP / list price** removed the top of the
data, so:

1. the axis re-scaled and every gridline re-spaced;
2. the tick count fell, so `plotHeightFor` returned a **shorter plot**;
3. every product marker slid **down** toward the labels — which is why the photographs closed on
   the text the moment a layer was hidden;
4. the SVG height changed, so the legend, the comparison table and everything below **jumped**.

One checkbox, described to the reader as "show or hide a line", silently redrew every coordinate on
the chart. The comment above it argued the case honestly — *"a hidden MSRP must not keep reserving
the top of the chart: the reason to switch it off is to get the space back"* — and that is a real
want traded the wrong way. **A person hides a layer to read the rest of the chart more easily; a
chart that moves everything else while they do it cannot be read at all.** Reclaiming a few pixels
is not worth making two views of the same prices disagree about where those prices are.

**Visibility and geometry are now two separate things.**

```
visibility   decides whether an element is DRAWN      — the checkboxes
domain       decides where every price SITS           — the scope
```

`scopeDomain(ns)` takes the **canonical price envelope of the products currently in scope** —
company · country · marketplace · category · series · currency. Every canonical field of every row
in scope, including the ones whose layer is switched off. Not the whole database (§三.7: a US
ladder must not be stretched by a European one, and `M2` is aimed at exactly that), and not the
visible layers. Changing a ring of the scope re-derives it, which is right — those are different
products. Ticking a box does not, which is also right — those are the same products.

**A scenario can only ever expand it.** The canonical values are always in the envelope, so a
simulated price *inside* the existing range changes nothing at all; one *outside* pushes the bound
out and the axis rounding supplies the padding. Reset returns to exactly the canonical domain,
because the canonical envelope never depended on the scenario in the first place.

Published on the chart so the claim is checkable rather than promised: `data-domain-source`,
`data-domain-lo-c`, `data-domain-hi-c`, `data-domain-expanded`, `data-plot-top`,
`data-plot-bottom`, `data-plot-h`, `data-tick-px`, `data-lane-top`, `data-lane-h`.

### §36.2 Root cause 2 — there was no label lane

Labels were drawn at `PAD_T + PLOT_H + 22`, inside the same coordinate space the prices use. The
bottom of the price scale and the top of the type were therefore **the same pixel**, and a 50px
plate centred on the lowest price hung 25px into the words. Widening `LABEL_H` could never have
fixed it: the plate was not overflowing the label area, it was overflowing the **plot**.

The drawing is now three stacked bands with declared heights:

```
PAD_T      30    air above the top gridline
PLOT_PAD   30    the marker gutter — MK/2 + 5, so nothing can cross a plot edge
PLOT_H     ...   the price scale: gridline to gridline, and NOTHING else lives here
PLOT_PAD   30    the same gutter at the bottom
LANE_H     52    the label lane: sku, price, variants — and no price coordinate at all
```

Lane rows at `LANE_TOP + 20` and `LANE_TOP + 38`. Every label sits on a baseline measured from the
**lane**, never from a price, which is what makes "all labels share one baseline" true by
construction rather than by a lucky arrangement.

**The stagger is gone.** Alternating labels onto two rows was how narrow columns used to be
survived, and it breaks the one thing the lane is for: half the labels 18px below the other half
reads as two different kinds of product, and at 44 columns it read as noise. Narrow columns
**truncate** instead — `data-shown`, `data-full`, `data-truncated`, and a `<title>` **only when
truncated**, because an SVG `<title>` is part of its parent's `textContent` and attaching one to
every label would make each label read as itself twice to anything that reads text.

**The Series is not printed under every column.** The filter that selected it and the panel heading
already say it; a third copy would occupy the space the sku and the price need.

**The gutter is a guarantee, not a lucky fixture.** No product in the preview fixture happens to sit
exactly on the bottom tick, so "no plate collides today" would pass on a chart that collides on the
first dataset that does. `D7a`/`D7b` assert the invariant — at least half a plate of clearance at
both ends — and `M3` is aimed at the gutter rather than at an instance.

### §36.3 Vertical readability is a pixel FLOOR, and the step is what gives way

28px per five currency units put two 50px photographs 28px apart: they overlapped, and no label
avoidance can rescue a chart whose own markers collide. `PX_PER_TICK = 48` (the brief's 44–52), and
it is a floor. When a range is so wide that 48px per five units would make an absurd drawing, the
**tick step** grows — `STEP_LADDER_C = [500, 1000, 2500, 5000, 10000, 25000]` — and the pitch is
preserved. Keeping the step and shrinking the pitch is the defect this replaces. `PLOT_MIN_H = 300`,
`PLOT_MAX_H = 960`, `PX_PER_TICK_MIN = 44` asserted. A drawing too tall for its card scrolls inside
the card (`.chartwrap { overflow-y: auto; max-height: 78vh }`), and print lifts the cap so nothing
is clipped on paper.

The axis title names the step it is actually using rather than the words "5 USD".

### §36.4 Root cause 3 — every control called `render()`

`render()` rebuilt the nav, the crumbs, the **whole** scope area — site filters, analysis filters,
the advanced drawer and the entire scenario panel — and then emptied and refilled `#view`. Choosing
a Series from the scenario's own dropdown therefore **destroyed that dropdown**: the `<select>` the
person had just used no longer existed when their change finished. Three consequences, and together
they are the jump the operator reported:

1. the focused element vanished, so the browser had nothing to keep in view and fell back to
   whatever its scroll anchoring could find;
2. the panel's height changed as the validation line and the "Applied:" line appeared and
   disappeared, so content genuinely moved under the viewport;
3. because the rebuild happened **above and around** the reading position, whether it jumped up,
   jumped down, or happened to look still depended entirely on where the page was scrolled — which
   is precisely the operator's symptom: *"if you are at one particular position it does not jump,
   and the same action at another position does."*

**Three redraws now, because there are three sizes of change.**

| | what it rebuilds | what calls it |
|---|---|---|
| `render()` | everything | site · country · marketplace · category · series · currency |
| `renderData()` | the banner mark and `#view` | Apply · Undo · the three resets · every layer · every zoom |
| `updateScenarioForm()` | **nothing is replaced at all** | Series · Price to simulate · Adjustment · the amount |

`updateScenarioForm` writes the dependent options, the placeholder, the amount label, the reach
count, the readiness state, the badge and the status line **in place**. `fillOptions` rewrites the
`<option>` children of a `<select>` and leaves the `<select>` itself alone, so the element keeps its
identity, its focus and its position — and it does nothing at all when the option list is unchanged,
which is the common case.

### §36.5 The viewport contract — an anchor, not a saved offset

**A saved `scrollY` is not a position, it is a distance from the top.** Restoring it after a redraw
that changed the height of anything above the reading position puts the reader somewhere else and
calls it unchanged. So `withViewport(fn)` preserves an **anchor**: `#view` is never replaced — only
its children are — so its distance from the top of the window measures the same piece of content
before and after, and the difference is exactly how far the page moved.

**The compensation only fires when the anchor actually moved.** This is deliberately not a blind
`scrollTo(savedX, savedY)` after every render (§C.6): that would hide an unnecessary rebuild instead
of removing it, and it would be wrong in exactly the case it was added for. There is **one**
`window.scrollTo` in the file, it is conditional, and there is **no `scrollIntoView`, no
`location.hash` and no `href="#"` anywhere**.

Measuring a layout box here is not measuring one for geometry: the chart still reads no layout box,
its coordinates come from a declared design width, and this reads the live layout only to answer a
question the live layout alone can answer — did the page move under the reader.

The chart's own sideways position is the reader's too, so `.chartwrap` scroll offsets are saved and
restored across every redraw.

**Measured, across six starting positions × eight actions:**

| | result |
|---|---|
| the content the reader was looking at | **unchanged, all 48** |
| the raw scroll offset | **unchanged, 42 of 48** |
| Apply / Undo | the offset moves by exactly the height of the banner's UNSAVED SCENARIO line, which is content genuinely appearing above the reader. Holding the offset there would push the page; holding the content still is the contract. |
| one further exception | a page **already at the very top** cannot compensate for content disappearing above it — there is nowhere further up to go. A browser's own scroll anchoring does the same. It is allowed exactly once, at exactly that position, in exactly that direction, and counted. |
| focus · meeting mode · zoom · chart scrollLeft | unchanged, all 48 |

**Layout shift removed at the source, not compensated for.** The form is a grid with declared
columns, so switching Proposed↔Everyday changes which *adjustments* are offered without changing
how many rows the form has or how wide a control is. The status row is **one `<p>` that never
leaves** — present on an empty form, on a refusal and after an Apply, with its id, class and words
changing — because a row that exists only sometimes pushes the page sometimes, whatever the
stylesheet reserves. `.scenario-status` also carries a `min-height`, and the reset buttons carry a
`min-width` so disabling one changes its opacity and not its geometry.

Apply stays **clickable** when the form is incomplete: a disabled button hides the refusal, and the
refusal is the only thing that says why. Readiness is published as `data-ready`/`aria-disabled` and
the styling goes quiet instead.

### §36.6 `10.00 open` → `USD 10 Price gap`

"Open", on a page that also shows orders, stock and promotions, can be read as an open order, open
stock, an opening price or an open promotion — and the one thing it meant was none of those: **a
rung of the price ladder that no product stands on.** Every surface now says the same words, in the
panel's own currency: the chart label, the layer switch (`Price gaps`), the legend (`Price gap`),
the finding headline (`Price gap of …`) and the executive recommendation.

Hover and keyboard focus give the lower product and its price, the upper product and its price, the
gap amount, the threshold in force, and the definition the brief specified verbatim — *"Difference
between two adjacent everyday prices that exceeds the selected gap threshold. It indicates an
unoccupied price tier for review; it is not an inventory shortage or an order status."*

**THE BOUNDARY WAS CHECKED, NOT CHANGED.** The brief asked for `>=`. `selectors.js` already declares
the opposite, in a comment that gives its reason: *"gap — strictly greater than the threshold ( > )
… A step exactly equal to the threshold is not a gap."* Measured: threshold 999 → one gap of 1000;
threshold 1000 → none. §七.6 says to check the existing spec before changing it, so the spec stands
and this is reported instead. Changing it is a one-line decision the user can make.

**The internal contract is unchanged.** `kind: 'PRICE_GAP'`, `distance_c` and `threshold_c` keep
their names in every finding object — renaming a key is a migration, and this round changed what a
person reads.

### §36.7 Two more defects only a screenshot could see

Both got past three green suites and were found by rendering the page in headless Chrome and
looking at it. Each is now an assertion in §J of the new suite.

1. **The executive recommendation still read `1 open step in the ladder`.** Every search this round
   had been for the phrase *"open price step"*; this sentence says *"open step"*. **A rename driven
   by grep finds the places you remembered to grep for.** §J1/J2 now scan the whole visible page for
   `open` beside `step|price|tier|gap` and for any amount followed by the word.
2. **`USD 10 Price gap` lay across the next product's markers.** The label is drawn beside its line,
   the line sits on the boundary between two columns, and the room beside it is half a column —
   about 104px against roughly 100px of type. At four products it just fitted; at a narrower column
   it ran past the next product's centre and landed on that product's band and its live-promotion
   diamond. **The assertion in place checked the label against the PHOTOGRAPHS, and the photographs
   were clear** — nothing checked it against the other markers. The form is now chosen by what
   fits — the full phrase, then `USD 10 gap`, then the amount alone — the whole sentence stays in a
   `<title>` and the aria-label whichever form is painted, and §J6/§J7 assert that no gap label
   reaches another column's centre line, on the four-product chart and on the forty-four.

### §36.8 The shim grew a scroll, a focus and a layout

A shim with no scroll cannot fail a scroll assertion, and a test that cannot fail is not a test.
`_psb-harness.js` now models the three browser behaviours the contract is about:

- **`focus()`** moves the focus *and*, as a real browser does when the element is outside the
  visible band, scrolls to bring it into view — so a handler that focuses a node it has just created
  moves `scrollY` here exactly as it does on the page;
- **`scrollIntoView()`** moves the window to the element;
- **layout**: every element has a synthetic top — its index in document order times a fixed row
  height. It is not a real layout and does not pretend to be one, but it has the property that
  matters: *inserting or removing nodes above something moves it.*

**Elements that occupy no page space are excluded** — `<option>`, `<title>`, `<defs>`. An `<option>`
is painted by the operating system inside an open dropdown, not in the document flow, so rewriting a
select's options changes no layout; a model that counted them would report the correct fix as a
jump.

**The stated limit:** the model counts nodes, not pixels, so it cannot model a CSS `min-height` that
reserves space for a row that is sometimes empty. That is why the status row is implemented as a
node that never leaves (a DOM fact the model can see) *as well as* a reserved height (a stylesheet
fact asserted as one).

### §36.9 Tests

```
assets/tests/product-strategy-board-p1-b2b.test.js   NEW   137 passed / 0 failed / 16 mutants / 0 survived
assets/tests/product-strategy-board-p1-b2a.test.js         222 / 0 / 14 / 0
assets/tests/product-strategy-board-p1-b2.test.js          241 / 0 / 17 / 0
the page's own DOM assertions                              236 / 236
full sweep, 448 suites                                     only the four PRE-EXISTING red (3 / 1 / 7 / 2)
```

Sections: A boot · B the domain belongs to the scope · C a scenario expands and never shrinks ·
D vertical readability · E the label lane · F nothing jumps on a toggle · G a price gap is called a
price gap · H the viewport does not move · I what keeps its identity · J what only a screenshot
could see · 16 mutants.

**Two mutants were re-aimed after they passed for the wrong reason**, which is worth recording
because both failure modes recur:

- **N6 (P1-B2A)** wrote `'ALL'` into `STATE.scenarioSeries` from `narrowAfterSiteChange`. The
  in-place updater added this round drops any value the menu does not offer — so the mutant became
  unobservable *through a defence that is itself correct*. The rule "there is no All" now lives in
  one function, `seriesChoiceValues()`, and the mutant is aimed there.
- **M15** was written so that a throwing mutant counted as caught (`m.thrown !== null || …`). That
  is a mutant that passes when its own anchor is stale — the exact thing the CRLF round taught.

Two more were re-aimed because they were inert on this fixture: the only layer whose absence moves
this fixture's domain is MSRP, so **M2** went after the other half of the rule (the global range),
and **M3** went after the gutter rather than a plate that happens not to collide.

### §36.10 Visual acceptance

Produced with headless Chrome against the local file, no network. Eight cases × four frames in
`…/scratchpad/p1b2b/shots/`: `detail-all`, `no-msrp`, `no-floor`, `no-both`, `clean`, `scenario`,
`zoom150`, `stress` — each at `top-1920x1080`, `top-1440x900`, `top-1280x720` and
`full-1920x2600`.

**Compared across the eight full-page frames and confirmed by eye:** identical y-axis min/max,
identical everyday-marker y coordinates, identical SVG height, identical label baseline, the Product
comparison card at the same y, and the legend block holding its height as keys come and go.

**STILL NEEDS A PERSON — a DOM assertion is not a visual review:**

1. **Print / PDF preview.** Not captured (no `--print-to-pdf` run). The print stylesheet is verified
   by assertion only: Fit forced, `max-height` lifted, controls hidden, UNSAVED SCENARIO kept.
2. The small-viewport captures (1280×720, 1440×900) show a **headless compositing artefact** — a
   blank band above the sticky banner. The same page renders correctly in the 2600px frame, so this
   is a capture quirk rather than a page defect, but the three real viewport sizes should be looked
   at in a real window.
3. Native `<select>` behaviour: open a dropdown, choose, close, and confirm the viewport shows the
   same content before and after. The shim models a change event, not an OS dropdown.
4. The 44-product chart's upper half is empty in the first screen because the expensive products are
   off to the right and the axis reaches their list price. Correct, but worth a judgement call on
   whether a 960px plot is the right ceiling for that shape of range.
5. Colour, weight, focus rings, and the feel of the 48px pitch at arm's length.

### §36.11 Isolation record

```
docs/prototypes/product-strategy-board/prototype.js        geometry · domain · lane · gaps · three redraws
docs/prototypes/product-strategy-board/prototype.css       grid form · reserved rows · legend height · lane
docs/prototypes/product-strategy-board/selectors.js        the gap finding's words (keys unchanged)
docs/prototypes/product-strategy-board/preview-fixture.js  a third of the stress skus carry long names
assets/tests/_psb-harness.js                               scroll · focus · synthetic layout
assets/tests/product-strategy-board-p1-b2b.test.js         NEW
assets/tests/product-strategy-board-p1-b2a.test.js         follows the one-baseline and no-All contracts
docs/planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md      this section
assets/specs/active/project-current-state.md               the round entry
```

Production DB writes 0 · Sheets 0 · Drive 0 · network 0 · Apps Script 0 · deployment 0 · main 0 ·
S1 0 · S2–S5 0 · `assets/js/**` 0 · `assets/css/**` 0 · `assets/html/**` 0 · km-lb 0 · merge 0 ·
push 0 · amend 0 · rebase 0 · force-push 0. `APPS_SCRIPT_SYNC_REQUIRED` this round: **none** —
P1-B1-R1's four files are still the outstanding sync.

### §36.12 The merge gate is unchanged

All nine conditions of the P1-B2A brief's §十一 still stand. This round is fixture UI work and
claims no live database connection. **Next:** P1-B3 — production readback once the user has synced
P1-B1-R1's four Apps Script files.

---

## §37 — P1-B2C · RESPONSIVE CHART ENGINE · VIEWPORT-FIT MODE · INSIGHT DRAWER

*(P worktree `feature/product-strategy-board-p0`; PRE `67c3f16`, POST `<this commit>`. Local commit
only, never pushed. Fixture UI work; no live database connection is claimed.)*

### §37.1 Root cause — a fixed floor is not a layout

P1-B2B fixed a real collision by nailing three numbers down: **50px images, 48px per gridline, a
78vh cap.** On 1280×720 an ordinary seven-product chart then stopped fitting in its own card — you
had to scroll the chart to see its own axis.

That is what a floor does. It is right for the one screen it was measured on and wrong everywhere
else, and the worse part is **how quietly it fails**: a scrollbar appears, nothing is broken, no
assertion goes red, and the reader simply cannot see the thing. The 78vh cap was the mechanism —
it converted a layout failure into a scrollbar nobody had asked for.

**P1-B2B ALSO REPEATED A CLAIM THAT WAS NOT TRUE, and it should be corrected in the record.** It
justified the 48px floor with *"two 50px photographs 28px apart overlap"*. They do not: two
products occupy two COLUMNS, so their markers are separated horizontally whatever the pitch is. The
real reason to want a generous pitch is that a price scale whose labels you cannot read is not a
scale. That is a preference about legibility — exactly the kind of thing that should yield when the
alternative is not seeing the axis at all, and exactly the kind of thing a floor should never have
been used for.

So `48px` is now the **preferred** pitch: honoured wherever there is room, and the first thing to
give way when there is not.

### §37.2 The engine — one pure function, in its own file

`docs/prototypes/product-strategy-board/chart-layout.js` · `PSB_CHART_LAYOUT` ·
`deriveResponsiveChartLayout({ containerWidth, availableHeight, productCount, domainLowC,
domainHighC, mode })`.

No DOM, no window, no storage, no clock, no random — asserted item by item (§B2). Everything it
needs arrives as an argument, so the suite hands it 1366×768 and gets a layout with **no browser in
the call at all**, and the same inputs give byte-identical output (checked twenty times over).

**WHY MEASURING IS NOW ALLOWED, AND WHY THAT IS NOT A REVERSAL.** P1-B2A wrote *"NO LAYOUT BOX IS
MEASURED ANYWHERE"*, because a chart whose geometry depends on WHEN it was measured draws
differently on a slow load. That reasoning is still right and it is an argument against a **hidden**
dependency. A measurement that arrives as a named argument to a pure function is the opposite of
hidden: the layout stays deterministic given its inputs, the moment of measurement is **one line**
in the renderer (`measureBox`), and a test can supply any viewport without a browser.

It returns everything the drawing needs and **what it could not make fit**: `density`,
`tickStepC`, `ticks`, `pxPerTick`, `plotH/plotTop/plotBottom`, `gutter`, `laneTop/laneH/laneRow1/2`,
`imageSize`, `colW`, `plotW`, `viewBoxW/H`, `offset`, `labelStride`, `labelChars`,
`labelPx/subPx/tickPx`, `fitsHeight`, `fitsWidth`, `overflow`, `reasons[]`, `measured{}`. Every one
of those is published on the SVG as a `data-` attribute, so the claim is checkable rather than
promised.

### §37.3 The algorithm — two ladders, and the first thing that fits wins

```
DENSITY   spacious 50px · normal 44px · compact 34px · overview 24px
          col minimums 74 · 58 · 44 · 26   (an image has to fit inside its own column)
COUNT     ≤12 spacious · 13-24 normal · ≥25 overview
STEPS     5 · 10 · 20 · 25 · 50 · 100 · 250 · 500 currency units
PITCH     preferred 48 · floor 22 (below that a tick label is not worth drawing)
```

The count band picks the **starting** density; the container decides whether it survives. For each
density from there downward, and inside each the tick step from fine to coarse, the first
combination that fits **both** dimensions wins — so the chart gives up the least it can: a coarser
axis before a smaller photograph, and a smaller photograph before an axis you cannot see. Label
DENSITY gives way before either, via `labelStride`.

**WHEN NOTHING FITS, IT STILL CHOOSES, AND THE ORDERING IS ONE EXPRESSION** (`L.score`): fitting the
height first, then the width, then overflowing by as little as possible. Without that last clause
the walk kept the first near-miss it happened to meet — on a tablet that meant twenty-four 44px
photographs and 776px of sideways scroll when stepping down one profile would have left eight.
**Overflowing anyway is not a reason to overflow as much as possible.**

The three modes: **auto** (the default) fits the card; **comfortable** keeps the spacious profile
and the preferred pitch and gives the overflow to the CONTAINER; **fullscreen** is the auto
algorithm with the whole window to spend. `fullscreen` is a separate flag rather than a third mode
value, because it has to compose with the other two — going fullscreen and coming back must not
change which mode you were in.

### §37.4 The coordinate is not the pixel

Every column publishes `data-regular-frac`, and every cap and diamond a `data-frac`: the price's
place in its own domain, a number between 0 and 1. `data-cy` is pixels and is **supposed** to change
— that is what responsive means. `data-frac` is not, and §D compares it across all seven target
viewports while confirming the pixels really did move. That turns "resizing cannot move a price"
from a comment into two attributes a reader can compare across screenshots.

### §37.5 Measured, on the seven target viewports

Seven products (Silicone Spatula, 4 plotted), Auto Fit:

| viewport | container/room | density | image | step | pitch | column | viewBox | fits H | fits W |
|---|---|---|---|---|---|---|---|---|---|
| 1920×1080 | 1552/848 | spacious | 50 | 5 | 48 | 208 | 1552×478 | ✓ | ✓ |
| 1600×900 | 1232/672 | spacious | 50 | 5 | 48 | 208 | 1232×478 | ✓ | ✓ |
| 1440×900 | 1072/672 | spacious | 50 | 5 | 48 | 208 | 1072×478 | ✓ | ✓ |
| 1366×768 | 1000/536 | spacious | 50 | 5 | 48 | 208 | 1000×478 | ✓ | ✓ |
| 1280×720 | 912/488 | spacious | 50 | 5 | 48 | 201 | 912×478 | ✓ | ✓ |
| 1024×768 | 656/536 | spacious | 50 | 5 | 48 | 137 | 656×478 | ✓ | ✓ |
| 768×1024 | 648/792 | spacious | 50 | 5 | 48 | 135 | 648×478 | ✓ | ✓ |

Forty-four products, Auto Fit:

| viewport | density | image | step | pitch | column | stride | viewBox | fits W | overflow |
|---|---|---|---|---|---|---|---|---|---|
| 1920×1080 | overview | 24 | 5 | 37.2 | 32.8 | 2 | 1552×848 | ✓ | none |
| 1440×900 | overview | 24 | 5 | 28.4 | 26 | 2 | 1252×672 | ✗ | container-x |
| 1280×720 | overview | 24 | 10 | 34.9 | 26 | 2 | 1252×488 | ✗ | container-x |
| 1024×768 | overview | 24 | 10 | 39.3 | 26 | 2 | 1252×536 | ✗ | container-x |

**All forty-four products and all forty-four price points are on the chart at every one of those**
— what changes is the picture size, the label density, and whether the card scrolls sideways. The
card says so in words: *"Compact overview — switch to Comfortable for larger product images. Every
product and every price is on the chart; only the pictures and the labels are smaller."*

The height budget is `viewport − CHROME_H(232)`, declared rather than derived from the card's live
top offset: **deriving it from the scroll position would make the chart re-lay-out as the reader
scrolled past it**, which is a worse defect than the one this round fixes.

### §37.6 The observer, and the three guards that stop it looping

1. **It observes `#view`, which the renderer never replaces.** An observer on the chart's own
   container would stop firing the first time the chart was redrawn — the classic version of this
   bug, where resizing works exactly once.
2. **The measurement is quantised to 8px and compared** (`boxKey`). A container reporting 1281.6
   then 1281.4 has not changed, so even a genuine feedback path terminates after one pass.
3. **The callback only schedules**, on an animation frame, so a drag that fires forty resize events
   produces one redraw.

It calls `renderData()`, which by the P1-B2B contract rebuilds no control and holds the reader's
place — so a resize costs nothing: not the scenario, not the filters, not the layers, not the mode,
not the scroll position. All six are asserted (§F10–F15), and `#scopeSite` is checked to be the
same node afterwards (§F16). Fallback for an environment with no `ResizeObserver` is a window
resize listener, which is strictly worse — it cannot see the sidebar collapse — and is why the
observer is preferred rather than the reverse.

### §37.7 A sticky scale, because §三.2 asked

The axis is now two groups. `.axis-grid` holds the gridlines and scrolls with the products they
cross; `.axis-scale` holds the tick numbers, the axis rule and the title, and is **translated in X
by the container's scroll offset** so it stays still on screen. On a forty-four product Comfortable
chart, scrolling the numbers off the screen leaves a grid of markers with no way to read a single
price off it — so the answer to "is a sticky axis necessary" is yes. It is a translate and only a
translate: no price coordinate is touched.

### §37.8 The control bar

It had grown to thirteen controls in one row above a chart that was itself too tall to see. Most of
them are settings somebody touches once a session; the one they touch constantly is how big it is.

```
View     Auto Fit · Comfortable · Fullscreen     the decision that matters
Detail   Clean · Detail                          the two presets
Layers   one button, a popover, and "6/6"        the six, folded away
Size     100% · 125% · 150%                      COMFORTABLE ONLY
Reset view
```

**The size buttons are hidden in Auto Fit on purpose.** Auto Fit means the engine chose the size; a
125% button beside it would be a second, contradictory answer to the same question, and whichever
won, the other would be lying. **The layers count stays on the button's face** — folding away six
switches is a density decision, folding away which of them are on would be hiding the state. The
popover is absolutely positioned, so opening it does not move the thing you opened it to look at.

**Fullscreen is a CSS overlay, not `requestFullscreen`.** That API needs a trusted user gesture, is
refused outright in a headless render and in a print, cannot be entered by the page's own
self-test, and hands Escape to the browser so the page cannot tell leaving from a stray keypress.
An overlay gives the same thing while staying testable, printable and ours to leave. Escape and the
button both leave it, and both restore the scroll position.

### §37.9 The insight pills — root cause was one line of CSS

The summary used `<span class="cls cls-RISK">`, and the stylesheet gives `.cls-RISK` **a background
colour and nothing else**: the padding, the radius, the weight and the white text all live in
`.fgroup-h .cls`, a descendant rule that only matches inside a finding group's header. So the same
class produced a proper pill in one place and a bare saturated rectangle with default dark text in
the other — four of them flush against each other, unreadable, and nothing like anything else in
the Operation System. **A class that is only half-styled somewhere is two components wearing one
name**, which is the third time this project has met that shape (`.adv-toggle`, `.scope`, and now
`.cls`).

Now: `Opportunities 3` — a label layer and a count layer, modelled on the Operation System's own
count pill (`.km-tab-rail__count`, components.css:929), in a 999px capsule with a token gap,
`flex-wrap` on both the pill row and the drawer header, and **dark text on a light tint with a
matching border** — never saturated fill under black type, which is harder to read and, on paper, a
quarter page of ink (print drops the tint).

**They are not buttons.** Nothing filters by clicking one this round, and a control that looks
pressable and does nothing costs a reader more than a plain label ever saves them. `role="list"` /
`role="listitem"` instead.

**A REAL GAP FOUND WHILE DOING THIS: the Operation System has no badge or status-token set.**
base.css declares semantic *text* colours (`--text-success`, `--text-warning`, `--text-error`,
`--text-link`), radii, spacing and a type scale, and components.css has exactly one count pill —
but there is no `--badge-*` block, and no shared status-chip component. The six semantic tokens were
copied into the prototype (and are therefore held to base.css by the existing G1/G2 assertions);
the tints are local. **A semantic status-badge token set is the thing to add to base.css before a
second page needs one.**

### §37.10 The reusable contract (§十, recorded and not applied)

`PSB_CHART_LAYOUT.CONTRACT`, published as data so the rules can be adopted rather than the code:

```json
{"id":"KM_RESPONSIVE_CHART_LAYOUT_V1","container_driven":true,
 "reads_window_width_directly":false,"modes":["auto","comfortable","fullscreen"],
 "density_profiles":["spacious","normal","compact","overview"],
 "coordinates_are_separate_from_pixels":true,"layer_visibility_changes_layout":false,
 "state_survives_resize":true,"print_uses_its_own_layout":true,
 "applies_to":"product-strategy-board prototype only, until a page adopts it deliberately"}
```

The rules, for whoever adopts them next:

1. **Container-driven, never page-specific.** Observe the element, not the window: a breakpoint
   table cannot see a collapsing sidebar or a split view.
2. **One pure layout function per component**, taking measurements as arguments. Deterministic,
   testable at any viewport with no browser, and one named place where a box is read.
3. **Three tiers**: fit the container · comfortable with container overflow · fullscreen.
4. **Four density profiles**, each internally coherent (image, column minimum, lane, type), and a
   ladder the layout walks rather than four independent choices.
5. **Separate the mathematical coordinate from the visual size**, and publish both.
6. **A minimum legible size and a declared overflow policy** — say which way it does not fit
   rather than shrinking into illegibility.
7. **State survives a resize.** A resize is not a navigation.
8. **Tooltips and popovers work by mouse, keyboard and touch** — a button, not a hover.
9. **Print gets its own layout**, and the room's mode never reaches paper.

**§十 says record, not roll out. Nothing outside the prototype was touched** (§J9/J10), and the
contract says so in its own `applies_to`.

### §37.11 Two more defects only a screenshot could see

Third round in a row this section has been needed, which is itself the finding: **what survives a
green suite is what lives INSIDE the elements the suite checks, not the elements themselves.**

1. **The fallback code did not shrink with its plate.** `shortCode` returned up to seven characters
   whatever size the marker was, so at the overview density a six-character sku was painted across
   a 24px plate — about 38px of type in 24px of room — and forty-four of them ran into each other
   in a smear along the ladder. Every assertion was green: the plates were the right size, centred
   on the right prices, inside the plot and clear of the lane. **Nothing measured the text inside
   one.** The budget now comes from the plate, and below four characters there is no text at all —
   a two-letter stump is not an identifier, it is noise on top of the one thing the marker is for.
   The name stays on the plate's own `<title>`, the column's aria-label, the hover panel and the
   lane.
2. **The gap label degraded to a naked number.** When neither `USD 10 Price gap` nor `USD 10 gap`
   fitted the gutter, it printed `10` — beside a line, on a price chart, which is exactly the
   ambiguity this project spent a round removing from the word "open". There are three forms now,
   the shortest still names the currency, and if even that will not fit there is **no label** and
   the line carries the measurement.
3. Also found: **the KPI strip sat half-visible behind the fullscreen card.** It was not hidden, so
   it stayed in the flow and the fixed overlay covered most of it. A half-visible summary is worse
   than no summary; it is hidden in fullscreen and restored in print.

All three are assertions now (§K1–K13, §G21–G22) with mutants M13/M14 aimed at the first two.

### §37.12 Tests

```
assets/tests/product-strategy-board-p1-b2c.test.js   NEW   157 passed / 0 failed / 14 mutants / 0 survived
assets/tests/product-strategy-board-p1-b2b.test.js         142 / 0 / 16 / 0
assets/tests/product-strategy-board-p1-b2a.test.js         227 / 0 / 14 / 0
assets/tests/product-strategy-board-p1-b2.test.js          242 / 0 / 17 / 0
the page's own DOM assertions                              238 / 238
full sweep, 449 suites                                     only the four PRE-EXISTING red (3 / 1 / 7 / 2)
```

Sections: A boot · B the engine is pure · C seven products fit on every target viewport · D the
coordinate is not the pixel · E density from one to forty-four · F the observer watches the
container · G the modes · H the control bar · I the insight pills · J the reusable contract ·
K what only a screenshot could see · 14 mutants.

**FOUR EARLIER ASSERTIONS WERE SUPERSEDED RATHER THAN PATCHED, and each is worth recording:**

- **P1-B2A H28** required `colW >= 74` on the 44-product chart. 74 was the SPACIOUS minimum and it
  still is; forty-four products get the overview profile, whose minimum is 26 because a 24px
  thumbnail fits in it and a 50px photograph does not. Asserting 74 would have been asserting that
  the density ladder does not work. It now checks the minimum **of the profile the chart chose**.
- **P1-B2A J8–J11** asserted the "fit floor" — past a point, stop shrinking and scroll. That was
  the right patch for a layout that had already gone wrong upstream; the same forty-four products
  now need 1252px rather than 3364px, so the cause is gone and the patch with it. What is checked
  now is the promise: either it fits and is painted across the card, or it does not and says so
  and takes its natural width. There is no third state where it is silently shrunk.
- **P1-B2B D8–D10** grepped the renderer for `STEP_LADDER_C` and `PX_PER_TICK_MIN`. Both moved into
  the engine, so the suite `require`s the module and reads the values.
- **The zoom sections of both earlier suites** now enter Comfortable first, because Auto Fit
  deliberately offers no manual size.

**Two mutants had to be re-aimed after passing for the wrong reason** — the same two failure modes
as last round, so they are worth naming again:

- **M10** was first written to restrict the density-ladder walk and observed on forty-four
  products, whose count band ALREADY starts at the last profile: the mutant was a no-op. The
  second attempt broke the count band instead, and the ladder then did the band's work and reached
  the same answer — a **defence being correct rather than a mutant being caught**. Twelve products
  in a 660px card is where the two rules are distinguishable, and because the engine is pure the
  whole thing is decided in two calls with no page at all.
- **P1-B2B M5**'s anchor moved when the layer handler moved into the popover. A mutant whose anchor
  no longer matches throws, and a throwing mutant is reported as caught — a green light for a rule
  nobody checked.

The shim gained a container width, a window size, a `ResizeObserver` that records what was
observed, and an animation-frame queue a test can drain. `__viewport(w, h)` derives the content
width the way the real page does, so a test names a viewport rather than keeping two numbers
consistent by hand.

### §37.13 Visual acceptance

Headless Chrome against the local file, no network. Twenty-nine frames in
`…/scratchpad/p1b2c/shots/`:

```
auto7-{1920x1080,1600x900,1440x900,1366x768,1280x720,1024x768,768x1024}
full-auto7-{1920,1366,1280,1024,768}x2400+     whole page, so the card can be inspected
comfortable7-1440x900 · full-comfortable7-1440x2400
fullscreen7-1440x900
layers-open-1280x720 · full-layers-1280x2400
auto44-{1920x1080,1280x720} · full-auto44-{1920,1280}x2400
comfortable44-1920x1080 · full-comfortable44-1920x2800
drawer-open-{1920x1080,1280x720,1024x768,768x1024} · full-drawer-{1920,1024}x2600
```

Confirmed by eye across them: the whole chart inside the card at every target viewport; both axes
and the lane visible without scrolling the chart; the control bar on one row at 1920 and wrapping
cleanly at 1024 and 768; all 44 products and 44 price points present at every size; the pills as
tinted capsules with counts, wrapping rather than squeezing; fullscreen filling the window with the
mode and layers intact.

**STILL NEEDS A PERSON — a DOM assertion is not a visual review:**

1. **Print / PDF.** Not captured (no `--print-to-pdf` run). The print layout is verified by
   assertion only: the fullscreen overlay goes static, the KPI strip returns, the chart goes back
   to full width, the pills drop their tint, the layers popover is hidden.
2. **Whether a 24px thumbnail is enough to judge a 44-product chart in a meeting.** The engine's
   answer is "no, switch to Comfortable", and the card says so — but whether the overview is
   *readable enough to decide from* is a judgement only the operator can make.
3. **The sidebar collapse.** The observer watches `#view`, so collapsing the rail should re-fit the
   chart without a window resize. Asserted through a synthetic container width; worth doing once
   with a real mouse.
4. Native `<select>`, focus rings, colour and weight at arm's length.
5. The 44-product chart's upper band is sparse because the axis reaches the dearest product's list
   price. Correct, but worth a judgement on whether that is the right shape of axis for that data.

### §37.14 Isolation record

```
docs/prototypes/product-strategy-board/chart-layout.js     NEW — the pure layout engine
docs/prototypes/product-strategy-board/prototype.js        measure · modes · fullscreen · control bar · pills
docs/prototypes/product-strategy-board/prototype.css       pills · popover · overflow per mode · overlay · print
docs/prototypes/product-strategy-board/index.html          the fifth script tag
assets/tests/_psb-harness.js                               container width · viewport · ResizeObserver · frames
assets/tests/product-strategy-board-p1-b2c.test.js         NEW
assets/tests/product-strategy-board-p1-b2b.test.js         follows the modes and the engine
assets/tests/product-strategy-board-p1-b2a.test.js         superseded assertions and two re-aimed mutants
assets/tests/product-strategy-board-p1-b2.test.js          five scripts, not four
docs/planning/PRODUCT_STRATEGY_BOARD_DESIGN_FREEZE.md      this section
assets/specs/active/project-current-state.md               the round entry
```

Production DB writes 0 · Sheets 0 · Drive 0 · network 0 · Apps Script 0 · deployment 0 · main 0 ·
S1 0 · S2–S5 0 · `assets/js/**` 0 · `assets/css/**` 0 · `assets/html/**` 0 · other production pages
0 · km-lb 0 · merge 0 · push 0 · amend 0 · rebase 0 · force-push 0.
`APPS_SCRIPT_SYNC_REQUIRED` this round: **none** — P1-B1-R1's four files are still the outstanding
sync.

### §37.15 The merge gate is unchanged

All nine conditions of the P1-B2A brief's §十一 still stand. This round is fixture UI work and
claims no live database connection. **Next:** P1-B3 — production readback once the user has synced
P1-B1-R1's four Apps Script files.

## §38 — P1-B3 · PRODUCTION API READBACK · LIVE UNIVERSE CENSUS · ADAPTER CONTRACT FREEZE

**Nothing in this section was measured against production.** The readback is built, proved and
committed; it has not been synced and has not read a live table. Every number below comes from a
synthetic fixture and is labelled so. The live universe is still unmeasured, and the whole point of
this round is to make measuring it a single safe act rather than a project.

### §38.1 The package is read-only, and the proof is a call graph rather than a promise

The four P1-B1-R1 files were audited from the repository, not from the previous report. The filenames
were confirmed by `git diff` against `main`, and the read-only claim was proved by enumerating every
identifier each file CALLS that it does not define — **with comments and string literals stripped
first**, because 72_'s own header paragraph names every writer it promises not to use, and a scan that
counted those would be measuring the promise instead of the code.

| File | External calls | Google services |
|---|---|---|
| `72_api_v1_product_pricing_workspace.gs` | `prodAssertDbTarget_` · `prodExpectedDbId_` · `prodRequireSheet_` · `prodRequireColumns_` · `productStrategyEnabled_` | `SpreadsheetApp.openById` only |
| `TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs` | the five above (minus two) plus `ppwRowsToObjects_` · `ppwSchemaFingerprint_` · `ppwValidateRequest_` · `ppwWorkspaceBuild_` · `handleProductPricingWorkspaceGet_` | `SpreadsheetApp.openById` only |
| `00_config.gs` · `01_router.gs` · `63_` | shared files; the round's own added lines were diffed and scanned separately | — |

**The shared safety adapter CAN write, and the read path does not call the half that does.** `29_` was
the interesting case. Asserting "this file calls no writer" is FALSE: `prodMigrateCreateSheet_` holds
`insertSheet` and a header write, `prodMigrateAppendColumns_` holds `setValues`. Both are
migration-only and both demand a Migration authorization. So the claim worth proving is not that the
file cannot write but that **nothing on the read path reaches the two functions that can** — which is
checkable, and which a whole-file scan would have hidden by failing for the wrong reason. The six read
helpers are scanned individually; the two migration writers are asserted to EXIST (so that deleting
them cannot turn the first assertion into a claim about a file with no writers in it), to be
authorization-gated, and to be absent from both 72_ and the readback.

**A known blind spot, stated rather than left looking like coverage.** `Range.sort()` and
`Range.removeDuplicates()` are writers; `Array.prototype.sort` is not, and a source scan cannot tell
them apart — it flagged `headers.sort()` in both files. `sort` is therefore NOT in the writer
vocabulary, and a `Range.sort()` would instead be caught in §38.2, where the fake Sheet has no such
method to call.

### §38.2 The write API is not reachable, and that is structural rather than asserted

The suite runs the readback against a synthetic production DB behind a **fake Spreadsheet whose writer
methods are absent, not stubbed**. A readback that tried to write does not fail an assertion — it
throws `TypeError` naming the method it reached for. *A test that asserts `writes === 0` against a
counter the code under test increments is a test of the counter.*

The readback reports both kinds of zero and says which is which:

- `rows_modified` is **MEASURED** — every table's `lastRow`/`lastColumn` is captured before the census
  and again after it, and the delta is reported. It would catch an `appendRow`.
- `writer_calls: 0` is **DECLARED**, backed by the call graph above, and labelled as declared in the
  output. *A zero that looks measured and is not is the thing this project keeps finding at the bottom
  of a false green.*

### §38.3 The flag is never touched, and the readback proves the gate instead of working round it

The obvious way to exercise a flag-gated read from a diagnostic is to inject an `io` whose
`flagEnabled` returns true. The readback deliberately does the opposite, which is stronger:

1. It **calls the real endpoint with the real `io`** and expects `FEATURE_DISABLED`, `dbOpened: false`,
   `tablesRead: 0`. That is a live proof that the gate works in the project that is answering.
2. It reads the four tables itself, through the same shared safety helpers 72_ uses.
3. It hands those tables to `ppwWorkspaceBuild_` — the **pure** builder, which has no gate because the
   gate lives in the handler.

So the eligibility classification is computed by the very code that will serve the page. **A census
that computes eligibility its own way measures a pipeline nobody ships**, and a census taken by
bypassing the gate could not have reported on the gate at all. There is no flag bypass in the project.

### §38.4 THE CONTRACT, FROZEN — `productPricing.workspace.get`

`PPW_SCHEMA_CONTRACT_VERSION_ = 2`. This is the **response SHAPE's** version, separate from
`PPW_BUILD_VERSION_` (which round the FILE last changed) and from `SYS_DEPLOYMENT_RELEASE_` (which tree
a project came from). A caller pins the shape, so a comment-only edit must not make a correctly-pinned
client refuse.

**Request.** `payload.scope` requires `company`, `country` and `marketplace` — none defaulted, none
derived, an incomplete scope is `SCOPE_INCOMPLETE` and costs zero reads. `payload.filters` takes
`statuses[]` (from the four the schema defines; an unknown value fails closed) and `include_inactive`,
plus `category` and `series` which narrow AFTER membership. `payload.include` gates `regional`,
`pricing` (both default true) and `campaigns` (default false). `payload.page` takes `limit` (default
200, max 1000), `offset` and `cursor`. Naming `spreadsheetId`, `sheet`, `table`, `sql` or `query` is
`UNSUPPORTED_REQUEST_FIELD` — *ignoring `spreadsheetId` would let a caller believe it had redirected
the read.*

**Response.** One key set for success AND refusal, so a caller has one shape to read:
`sourceState` · `scope` · `filtersApplied` · `normalizedRows` · `filterOptions` · `sources` ·
`counts` · `capped` · `pagination` · `findings` · `refusals` · `analysis_permitted` · `schema` ·
`membership` · `provenance`.

**THE FIVE SOURCE STATES, AND WHY A SERVER MAY ONLY SEND FOUR.**

| State | Means | Who may say it |
|---|---|---|
| `READY` | rows, and nothing withheld | server |
| `SOURCE_EMPTY` | every table read in full; this scope has nothing in it — **a measurement** | server |
| `SOURCE_PARTIALLY_READABLE` | a source was capped, so completeness is unprovable | server |
| `STOP_DATA_INTEGRITY` | identities are ambiguous, so no number here can be trusted | server |
| `SOURCE_NOT_CONNECTED` | **no server answered** | accessor ONLY |

`SOURCE_NOT_CONNECTED` is not servable, and that asymmetry is the contract: *a response that carries
this field is proof that a server answered*, so the server can never honestly emit it. The adapter
passes a server state through untouched and may only ADD the client-only state; a server answer that
claims it is reported as `SERVER_SENT_A_CLIENT_ONLY_STATE` rather than believed.

`analysis_permitted` stays, derived from the same facts, because eleven assertions and the accessor's
validator hold it — but it is a BOOLEAN and so could only ever say "not usable". Which of the four it
was, the caller had to infer from the refusal list, **and inferring a state from a list is how a
genuinely empty site came to look like a broken one.**

**Precedence is severity, and it is not negotiable.** Integrity → partially readable → empty → ready.
Partially-readable outranks empty deliberately: *a read that could not see all of a table has not
established that a scope is empty*, and empty is the one state a caller answers by moving on.

**A refusal reports `sourceState: null`.** Nothing was read, so no state was MEASURED — the same reason
`counts` are null and `filterOptions` is null rather than `[]`. `SOURCE_EMPTY` would report a
measurement of a site nobody looked at; `SOURCE_NOT_CONNECTED` would blame the transport for a refusal
the server chose.

**THE SAME FINDING CODE AT TWO LEVELS MEANS TWO SEVERITIES, AND THE LEVEL DECIDES.**
`AMBIGUOUS_SITE_IDENTITY` raised on one ROW says that row's regional join matched twice — that row is
not analysable and the other forty-three are fine. Raised at MEMBERSHIP level it says two rows claim
one `marketplace_sku_id`, so the universe itself is wrong. Same code, two severities. The stop is
therefore derived from the build's **top-level** findings only; no code had to be renamed and the two
lists are built in different places by construction.

**And a blank identity is not a duplicate one.** `SITE_SKU_WITHOUT_IDENTITY` was in the stop set for
one round and made a healthy site report `STOP_DATA_INTEGRITY` over a single unjoinable row.

- duplicate id → every join may attach to the **wrong** product; the numbers are wrong and nothing says
  which ones. **A stop.**
- blank id → the row is dropped, **counted** and named; every remaining row is correct and the universe
  is short by an amount the response reports. **Incomplete, and saying so.**

**MIS-ATTRIBUTION IS A STOP; A COUNTED OMISSION IS NOT.**

**`schema` — freshness and shape.** `read_at` (the server clock when the read ran), `contract_version`,
`build`, `integrity_stops`, and a per-table fingerprint of the **header NAMES** — order-independent,
because columns get dragged about in a spreadsheet without any change of meaning and a fingerprint that
moved when they did would cry wolf on every reorder. No cell value is hashed, so it cannot leak a price.

`source_modified_at` is **null with its reason attached**. A Spreadsheet object exposes no
last-modified time, and the Drive file service that does needs a scope this action deliberately does
not hold. *Reporting a freshness nobody measured would be worse than reporting none.*

**`readAt` is a PARAMETER, which is why the builder is still pure.** The response has to carry when it
was read and the builder must not grow a clock: a clock read inside would make the output depend on WHEN
it ran, and three identical calls are asserted byte-identical. Same argument as the chart layout
engine's measured box (§37), same conclusion — *a measurement passed in as a named argument is the
opposite of a hidden dependency.*

**Production never falls back to the preview fixture.** Declared in `provenance.preview_fallback`,
`provenance.fx_conversion`, the adapter's `CONTRACT.fixture_fallback`, and asserted in the adapter's
source: an empty scope adapts to zero rows, never a demo row.

### §38.5 One production adapter — `assets/js/api/km-product-pricing-adapter.js`

Six fields differ between the live schema and the shape the board's selectors read. **§6 requires one
adapter, and the reason is sharper than tidiness:** if each page converts them itself, a page that
forgets `image_identity_status` renders a broken `<img>`, a page that forgets the `source_status`
collision marks every row "not recognised", and a page that maps `campaigns[]` its own way shows a
different promotion from the page beside it. Each of those is a bug you can only find by opening two
pages and comparing them — *which is to say, one nobody finds.*

| # | Gap | What it actually was | Resolution |
|---|---|---|---|
| 1 | `source_status` | **ONE NAME FOR TWO THINGS.** The fixture's is the status STRING; live uses the same name for an ARRAY of diagnostic codes and carries the status under `marketplace_sku_status`. | `source_status` becomes the status value; the codes keep `source_status_codes`. Nothing is dropped; one is renamed. |
| 2 | Promotion | **A JOIN, NOT A COLUMN.** Live has `campaigns[]` with dates; the fixture has `official_deal_*`. | The effective campaign is derived against an `asOf` **parameter**. Dates survive. Rejections keep their reason. |
| 3 | `variant_group` | No such column exists in the live schema. | `series` — the only product-family column the schema can prove. |
| 4 | `variant_name` | Live is null. | **Stays null.** No colour is composed from a sku suffix, a product name or a series label; the absence is `VARIANT_NAME_SOURCE_MISSING` and the grouping falls back to the master SKU, so two series-less products stay two nodes. |
| 5 | Image | **THREE STATES, NOT TWO.** | `VERIFIED_DB_MAPPING` (absolute http(s) URL on that SKU's own row) · `UNVERIFIED_SOURCE_REFERENCE` (a bare filename, a Drive id, or no master row to have come from) · `IMAGE_SOURCE_MISSING`. The selectors render only on the first, so an unverified reference draws the marker plate instead of a broken image. |
| 6 | Identity | `MSK-<country>-<marketplace>-<sku>` is composed from three attributes, so it changes when a listing moves marketplace and collides when two companies share one. | `MSKU:<marketplace_sku_id>`. The fixture form appears nowhere in the adapter. |

**Two effective campaigns is ambiguity, not a tie-break.** No rule in the contract ranks them — not the
lower price, not the later start, not the sheet order — so none is applied, `official_deal_price` is
null, and `AMBIGUOUS_EFFECTIVE_PROMOTION` is reported with both candidates. *A promotion chosen by a
rule nobody agreed is a number an operator cannot reproduce.*

**A non-ISO campaign period yields no deal, and says so.** The selectors compare these as STRINGS
(`start <= today && today <= end`), which is correct for `YYYY-MM-DD` and silently wrong for anything
else: `'1/3/2026'` compares as less than `'2026-09-11'`, so a loose parse would make a campaign that
finished in March look like today's deal. The value is reported as
`CAMPAIGN_PERIOD_NOT_AN_ISO_DAY`, never coerced.

**`asOf` is a parameter and the adapter has no clock.** Without a date there is no "currently", so
nothing is declared effective and `NO_AS_OF_DATE_SUPPLIED` says why. A clock in here would turn a
campaign that expired at midnight into a test that fails once a day.

**The adapter is loaded by no page.** Asserted, and stated in its own `CONTRACT.applies_to`.

### §38.6 What the readback measures (§4, §5, §7)

Per table: present · readable · typed reason · row count · column count · header names · fingerprint ·
lastRow/lastColumn. **An absent table is not an empty one** — that is the single most important
distinction in §4, and an empty array says the first about the second. `SCHEMA_NOT_PROVISIONED` on a
missing sheet makes the verdict `SOURCE_PARTIALLY_READABLE` and the next action
`PROVISION_OR_REPAIR_THE_NAMED_TABLES_THEN_RERUN`; a present, readable, zero-row table makes it
`SOURCE_EMPTY` and `POPULATE_MARKETPLACE_SKUS_THEN_RERUN`.

`sku_details`: distinct RAW category and series values with blank counts and type faults kept separate,
alias candidates, `category_allowlist: null`, `category_max: null`. `marketplace_skus`: the
company/country/marketplace identities, status distribution against the four the schema defines,
distinct `site_sku`, blank-identity rows, duplicate identities. `sku_regional_details`: the four-part
canonical identity, duplicates, orphans, missing `site_sku`. `pricing_list`: identity coverage on
`marketplace_sku_id`, duplicates, orphans, currency coverage, missing everyday/minimum/**msrp** counts,
and cross-currency sites. **`msrp` IS the list price — one band, two words in its name**; looking for a
separate `list_price` column would report every row as incomplete.

**The six eligibility classes**, each computed from the shipped builder's own row output:
`ELIGIBLE_AND_CHARTABLE` · `ELIGIBLE_REGIONAL_MISSING` · `ELIGIBLE_PRICE_MISSING` ·
`EXCLUDED_BY_STATUS` · `ORPHAN_OR_INVALID_IDENTITY` · `DATA_QUALITY_ONLY`. All six appear in the output
including the zeroes. Regional is checked before price: *a site SKU with no Regional Detail is not
confirmed as sold there at all, so its missing price is the second question.* `EXCLUDED_BY_STATUS`
comes from the builder's membership report rather than the row tally, because those rows never become
rows — and the site pass leaves the status filter at its DEFAULT (`active` + `phasing_out`) on purpose:
asking for all four would make `excluded_by_status` zero by construction.

**Seven proofs, and `NOT_PROVABLE` is a real answer.** A proof that needs two countries cannot be given
by a DB that has one, and reporting PASS there would be a lie about the evidence rather than about the
code. P1 (USD does not leak a non-US SKU into a US site) checks the rows that came back — not the rule
that was supposed to produce them — and reports `NOT_PROVABLE` when no USD-priced row exists outside
the US, because a clean result with no population at risk proves nothing.

**Alias candidates are proposed and never applied.** Two category spellings differing only by case or
whitespace are reported as a candidate group with `merged: false`, both spellings stay distinct options,
and `CATEGORY_ALIAS_APPROVAL_REQUIRED` is recorded as an evidence gap an operator owns. *A read that
merges on a guess makes the sheet and the menu disagree while looking tidier than either.*

**No sensitive data, and no "first N then claim complete".** Counts, distinct KEY values and header
NAMES only — no price, no cost, no URL, no spreadsheet id (asserted, including on the failure path).
Ledgers are capped with the cap reported beside the total; the per-site pass reports its own cap rather
than counting the sites it did not classify.

### §38.7 THE DEFECT THE CENSUS FOUND — `analysable` did not require a Regional Detail

72_'s own comment says `analysable` means *"MAY BE PLOTTED AND COMPARED"*. It checked the price, the
currency, and both ambiguities — **and not the regional match.** The prototype's `chartRefusalsFor`
refuses a row with `REGIONAL_DETAILS_MISSING`, and the rule is explicit: a site SKU with no Regional
Detail does not go on the price chart but does go into Data Quality.

So one question had two authorities with two answers. **Nothing looked broken, because the client's
answer was the right one:** the chart plotted the correct products while `analysableSiteSkuCount`
counted one more than the chart drew. A KPI that says three while the chart shows two is the quiet
disagreement, and the first site pass of the census is what made it visible — 3 of 3 analysable on a
site where one product has no Regional Detail at all.

`analysable` now requires a confirmed regional match, and **is false when the caller did not request
the join**: a caller holding no evidence that the listing exists cannot be told the row may be plotted.
`REGIONAL_NOT_REQUESTED` already distinguishes that case from a genuine miss.

**Two standing assertions were superseded, not patched, and both are recorded here.**

- `api-product-pricing-workspace-p1-b1` **21d** asserted `analysableSiteSkuCount === 3`. The right
  answer for that fixture is **1**: of six site SKUs, M1 has both a regional row and a price; M2's only
  regional row is the deliberate cross-site DE one; M5 has no price; M6 has no regional row; M7's
  regional match is ambiguous; M8's pricing is ambiguous. The old 3 counted two products the chart would
  not draw, and the assertion was holding it in place. M2, M6 and M1 are now named individually so the
  change is legible rather than a number that quietly moved.
- `api-product-pricing-category-contract-p1-b1-r1` **C9a** — here the **FIXTURE** was the defect, not
  the number. It carried `sku_regional_details: []`, describing a catalogue in which nothing is listed
  anywhere: harmless while `analysable` ignored the join, and not representative of any site now. C9a
  exists to assert that the two counts DIFFER and that CAN-2's missing PRICE is why. Dropping it to 0
  would have kept the suite green and deleted the thing it was written to check, so the fixture gained
  the ten regional rows a real site would have.

### §38.8 A guard read an absence as a presence — for the third time this round

`final-output-seam-audit-f1-5c-export-r1.test.js §K` proves there is exactly one binary file renderer
(37_) by scanning every `.gs` for `DriveApp` / `DocumentApp` / `getAs` / `createFile` / `makeCopy`. It
strips **comments** first — and not string literals. 72_'s new
`source_modified_at_unavailable_because` explained, in a string, that the freshness is unavailable
because DriveApp would need a scope this action does not hold. **Naming the API in order to say the file
does not use it made a long-standing guard report 72_ as a second file engine.**

The guard was **not** relaxed. Stripping string literals in §K would weaken a check whose job is to
catch a second file engine, to accommodate an explanatory sentence — the wrong trade. The identifier
moved into a comment, where §K strips it, and the string says the same thing in words.

This is the same shape three times in one round, which is the finding worth keeping: **a declaration
that something is absent, read as evidence that it is present.** The accessor's
`preview_fallback: false` tripped this suite's own §G10a the same way (fixed by aiming at identifiers —
`PreviewProductStrategy`, `previewFixture` — rather than at the word "preview"), and 72_'s "no
setValue" paragraph is exactly why §38.1 strips string literals before it counts anything.

### §38.9 Line endings, and three mutants that had never actually run

`core.autocrlf=true` normalises CRLF to LF when git reads the working tree, so a patch that only
rewrites line endings shows up as **nothing at all**. One patch this round wrote `72_` back as CRLF;
`git diff --stat` reported +145/−3 and looked correct, and the next test run found that every
multi-line `swap()` anchor in two suites had stopped matching — including anchors in code the patch had
never touched.

The files in this worktree are **not uniform**: `72_` and the prototype are LF, `00_config` /
`01_router` / `63_` / `_release-order.js` are CRLF, because each holds whatever its last writer used and
git never rewrites a file it has not been asked to. **A patch does not get to choose**: it detects what
the file already uses and writes that back, and refuses to guess on a file with mixed endings.

**AND THEN THE SAME FACT TURNED OUT TO BE HIDING A YEAR-OLD HOLE.** The first commit of this round was
checked out into a detached worktree to verify it on real bytes — the routine this project adopted in
P1-B2B — and on that checkout, where `autocrlf` gives every `.gs` CRLF, the mutant anchors do not match
*at all*, because they are written with `
`. Measured at the PREVIOUS commit from its own detached
worktree, `api-product-pricing-workspace-p1-b1` already reported **163 passed, 3 failed: M5, M6 and M12
SURVIVED.**

Those three mutants — the regional join losing a part of its four-part key, pricing joining on `sku`
instead of the id, and a preview fallback appearing on the failure path — have been green only in a
working tree where an earlier Python patch happened to leave `72_` as LF. **Three rules that matter
were being reported as checked by a suite that could not check them**, and `git diff` cannot show why,
because autocrlf normalises the comparison it would have to make.

**The fix is at the READ, not at the anchors.** Both suites now normalise `\r\n` to `\n` when they read
a source for mutation. CRLF anchors would have been the same bug with the sign flipped — broken in an
LF worktree and on any Linux checkout — and normalising changes nothing about what executes, because
these sources are run in a `vm` where line endings are not semantics.

**The routine is what found it.** A suite that is green in the tree you are working in and red on a
fresh checkout is indistinguishable from a passing suite until somebody checks out the commit, which is
why that step is not optional.

### §38.9a A one-off census is not a runtime owner

The first commit put `TEMP_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK.gs` in
`assets/specs/active/apps-script/`, and `action-registry-and-router-completeness §8` failed with its
name. That audit requires every `.gs` in the runtime mirror that changed since the R1 commit to be a
NAMED entry carrying the REASON it was touched — *"never a pattern that would forgive the next one
too"*.

The obvious response is to add the entry. The right response was to read what the audit was saying:
**that directory is the project's runtime mirror, and a one-off admin census is not a runtime owner.**
It owns no action, no table and no schema, and it is deleted when the question it answers is closed.
Sixteen read-only censuses of exactly this genus — same admin-only entry point, same release pin, the
same *"READ ONLY. ZERO WRITES ON EVERY PATH."* header, including the two whose pins this round
moved — already live in `assets/tools/apps-script-diagnostics/`. That is where it now is.

Worth stating plainly that this is **not** an audit dodge: nothing was added to any allowlist, the file
is still in the sync package, still named in the runbook, and still proved read-only by call graph.
What changed is that it is filed with its siblings instead of among the owners, and the suite asserts
both halves of that (`A11d`/`A11e`).

### §38.10 What is NOT done

No Apps Script sync. No deployment version. No live table read — **the live universe is still
unmeasured**, and every number in this section is from a synthetic fixture. No `flag = true`. No page
loads the adapter or the accessor. No production DB, Sheets or Drive write. No Operation System shell
integration. No other production page. No S1–S5, no `main`, no `km-lb`. No schema change and no
migration. The nine merge conditions from §31 remain open, and nothing here closes any of them.

`APPS_SCRIPT_SYNC_REQUIRED` is now **five files** — the four P1-B1-R1 has owed since 2026-09-10, plus
the readback. This round grows that sync; it does not replace it. There is exactly one package to paste.
Four come from `assets/specs/active/apps-script/`; the readback comes from
`assets/tools/apps-script-diagnostics/`, and the ledger lists every path in the order to paste them.

**NEXT:** the user syncs the five files, creates a Web App version, and runs
`RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()`. Its verdict decides P1-B4: `READY` means the universe
gets recorded here and the adapter gets wired to a page behind the flag; anything else names a repair
first.

## §39 — P1-B4 · COMPACT COMMAND BAR · CLEAR USER FLOW

**The readback has not run.** This addendum opens with "after the production DB/API readback is
complete", and it is not: P1-B3 built it and it still needs a person to sync five files and run one
function. Nothing here depends on that — it is prototype UI work against the preview fixture — but the
live Company / Country / Marketplace / Category / Series universe is still unmeasured, so every count
and every menu on this page remains a fixture's.

### §39.1 What was actually wrong, measured

| viewport | command area BEFORE | AFTER | of viewport | first chart element |
|---|---|---|---|---|
| 1920×1080 | **422px** | **112px** | 43% → **11.5%** | KPI strip y=678 → **y≈250** |
| 1366×768 | 422px | **184px** | 63% → 28% | y=677 → y≈319 |
| 1024×768 | 422px | **257px** | 63% → 39% | y=677 → y≈391 |
| 768×1024 | 458px | **452px** | 50% → 49% | y=743 → y≈616 |

**1920×1080 lands inside the 90–130px target.** No horizontal overflow at any of the four widths.

**And the height was never the controls.** Five dropdowns are five dropdowns; what took 422px was
FOUR CARDS — four headings, four `?` rows, four borders, three state paragraphs — plus a fifth card
(`.scope`) wrapped around them, so a border inside a border and 24px of padding for nothing. Every
control still stands at the Operation System's 38px `--filter-height`; not one was shrunk to hit the
number, which §7's last line asks for explicitly.

### §39.2 The bar

```
Company    Country   Marketplace   Category            Series          [More filters] [Meeting scenario]
Kitchen…   US ▾      Amazon ▾      Silicone Spatula ▾  Spatula
US · Amazon · Silicone Spatula · All series · USD   [No scenario]      43 listings · 42 with a price to plot  (?)
```

Row one is the ladder, in the order of dependence, with the two secondary entrances pushed right and
**outside the wrapping container** — that last detail is why they stay on the first line. Row two is a
12px muted context line. Hierarchy is position and weight: no uppercase and no alarm colour anywhere
in the bar's stylesheet block, both asserted.

**§1.4 — one option is a fact, not a choice.** A dimension with a single value renders as read-only
context: the label, the value, no chevron, no focus stop, and the state is corrected to that value so
the scope cannot read "aggregate" about a single site. The fixture has one company, so `Company:
Kitchen Mama` is that case on screen today; DE and UK each have one marketplace, so the Marketplace
control becomes context when either is selected. *A dropdown with one item is a control that cannot do
anything, and it reads as a decision still to be made.*

**§2 — the summary shows values, not an explanation of itself.** Country · marketplace · category ·
series · currency. Company is **omitted while there is only one**, because a word that cannot change
is not information. The site KEY (`Kitchen Mama|US|Amazon`) is in the `?` popover with the rest of the
mapping and nowhere on the line — asserted both ways.

**Currency is derived, not chosen.** P1-B3 proved the read refuses to pool currencies, so a complete
site has exactly one and a dropdown offering it is a decision already made. It appears in the summary
always, and becomes a real control inside More filters only when the scope is an aggregate holding
more than one.

### §39.3 A defect underneath the layout one: the menus were never narrowed

`siteDimensionValues` read the WHOLE fixture. The Country menu listed every country in the data
whatever Company was chosen, and the Marketplace menu every marketplace whatever Country was. Nothing
looked broken because `narrowAfterSiteChange` cleared an invalid selection **after** it had been
made — *a repair where a constraint belongs*. The menu was offering journeys that end in an empty
chart.

`scopeDimensionValues(key)` filters on the tiers ABOVE and on nothing below, so choosing a marketplace
never restricts the country list that produced it. §9's dependent-filter test walks every country and
compares its marketplace menu against the data, and a companion assertion checks the countries do NOT
all offer the same list — *without that second one, the first would pass on a global menu.*

### §39.4 More filters

`Advanced filters` → **`More filters`**. §3.9 is right that "advanced" is developer vocabulary for
"the ones we put away": nothing behind the button is expert analysis, it is a threshold and a
checkbox.

Closed by default, and **closed means not in the DOM** rather than rendered-and-hidden. Open, it is
the Operation System's own `.kmf-panel` — absolutely positioned, its own shadow, clamped to the
viewport, with a right-edge modifier — so **opening it moves nothing.** The band it replaces was in
the flow and pushed everything below it by its own height every time, which is a layout that punishes
you for looking.

`More filters · 1` on the button, using the shared `.km-tab-rail__count` pill: *a filter you cannot
see is a filter you forget you set* — the same argument as the Layers count in §37.

**§3.8 asks for a consistent rule about staying open, and the rule is one sentence: a value change
never closes it.** Only Escape, a click outside, or the trigger again. Reset stays open too, so the
reader watches the controls return to their defaults instead of watching the panel vanish. The three
closing paths come from the ONE pair of document listeners the `?` popovers already use — a component
that registered its own would be a second rule to keep in step.

**The drawer is deliberately NOT in that set.** Escape closes popovers; a workspace someone is halfway
through typing into is not a popover, and a stray key should not throw the form away.

### §39.5 The stress fixture is out of the product

`Load generated stress fixture (density test)` was a checkbox beside the filters. It loads
forty-four invented products, and *a control that loads fake data sitting next to the controls that
filter real data is one misclick from a meeting shown fiction.*

It is gone from the UI, it is **not** hidden in More filters, and there is **no URL parameter** —
§4.6 rules that out and is right to: a link is forwardable, so a query string is how one person's
debugging becomes another person's screenshot. The page never reads `location.search`,
`URLSearchParams`, `location.href` or `window.location` at all, asserted by name.

Two ways in remain, both deliberate. `window.__PSB_DEV_MODE__ = true` set BEFORE the scripts run
shows a labelled developer strip and defines `window.__psbUseStressFixture()`; the suites call that —
query-independent fixture injection, exactly as §4.3 asks, through
`bootPage(mutate, { devMode: true })`. On a normal load neither exists, so there is nothing to find.

### §39.6 The meeting scenario drawer

**There is no shared drawer in the Operation System, and that is now recorded rather than worked
around.** §5 asks for the shared component if one exists. Three PAGES define their own —
`.glm-drawer` (global logistics map), `.oow-drawer` (overseas ops) and one in sku-regional-details —
every one page-prefixed and page-local, with no `--drawer-*` token anywhere. So this is a fourth local
drawer, and **the thing to add to the shared layer before a fifth page needs one.**

`position: fixed` is the whole geometry guarantee. Out of flow means the chart's container never
changes width and the layout engine is never re-measured. **Measured in Chrome with the drawer open:
viewBox identical, every `data-cy` identical, the view width identical, and the scroll position
unchanged** (3→3 at 1920, 250→250 at 768). The panel it replaces was IN the flow, which is why every
open and close pushed the chart down and back.

The form is the same form, re-housed, in §5's order: site context → series, price to simulate,
adjustment → amount → Apply → Undo and the three resets → the unsaved explanation. Every refusal code
and status line P1-B2/B2A proved still works, because nothing was rebuilt.

**Closing is not clearing.** The overrides stay, the chart keeps showing them, the chip stays active,
and the banner keeps its scenario mark. Only Reset clears; only a reload forgets. The page touches no
`localStorage`, no `sessionStorage`, no `indexedDB`, no cookie, no transport — asserted by name.

**The command bar shows a button and a chip, and the chip is on the CONTEXT row** because §6 files
"scenario status" under Context, not among the controls. It is a `<span>` with `role="status"`, a
light tint with dark text and a same-family border — never a saturated block, which on paper is a
quarter page of ink — carrying the count of listings currently showing a simulated price.

### §39.7 The chip was stale after Apply — the same shape as §33's badge

Apply runs `renderData()`, which by the P1-B2B contract rebuilds no control. So the chip sat in the
command bar reading `No scenario` while the chart showed simulated prices. **This is exactly the
defect P1-B2A found on the scenario badge**, in a new place, and it gets the same fix:
`updateScenarioChip()` writes the class, `data-active`, the label and the count IN PLACE, and it runs
BEFORE the permitted check so a scope where a scenario is not allowed still has its chip corrected
rather than left showing the last site's state.

*A chart showing a simulated price beside a chip reading "No scenario" would be the worst defect on
the screen* — which is the sentence already written above the badge update, and the reason it was worth
recognising the shape rather than quietly repeating the fix.

### §39.8 `flex: 1 1 160px` is a width in a row and a height in a column

The first column layout at 768 produced an **886px** command area — every select field 160px tall.
The cause is one line written for a different container: the narrow rule further up the prototype's
stylesheet sets `.filter-group { flex: 1 1 160px }`, correct as a WIDTH when a filter group only ever
sat in a row, and a flex-BASIS on the main axis the moment the container becomes a column. Nothing
was wrong with the rule; what was wrong was reusing a container in a direction it had never been in.
The basis is cleared in the 820px block, and the assertion that holds it says why.

### §39.9 The shared stylesheets cannot be loaded à la carte, and `.btn-secondary` is not secondary

Two measurements that matter for the formal merge, because §8 asks for direct reuse.

**`components.css` and `base.css` assume they ARE the page.** `components.css` styles the bare
`button` element with `background: var(--soft-green)`, white text, a 60px min-width and a hover
translate; `base.css` sets `body { overflow: hidden }`. Loading them into a standalone prototype turns
every control on the page green and kills page scrolling. That is not a design finding — it is what
happens when a stylesheet that is a page is asked to be a component library. So the prototype loads
exactly one stylesheet, its own, and the shared values are COPIED and asserted equal to base.css
value for value (22 tokens, including the three added this round for the popover primitive). §8 permits
that as design validation; what it forbids is a second SSOT in the formal version, and that is the
thing to remove at merge time — by putting the page inside the shell, not by loading its CSS beside a
different one.

**`.btn-secondary` is a filled green primary.** `background: var(--soft-green)`, white text, no
border, and its own literal `padding: 0.8rem 1.5rem` / `border-radius: 8px` which override the
`--btn-*` token contract `.btn` sets one line above it. A class named "secondary" that renders as a
saturated primary and breaks the height every other control shares. Using it for the two entrances
would have given the bar two green pills — exactly the loud hierarchy §1.8 and §5 rule out. This round
uses `.btn-quiet`, which is the real quiet secondary, and **the absence of one in the shared layer is a
third recorded gap** beside the missing drawer and the missing status-chip tokens.

### §39.10 A fourth round of defects only a screenshot could see

**The drawer's form row was clipped.** `.scenario-row` is a five-column GRID whose minimums add up to
570px; the drawer body is about 392px. The re-housing rule said `flex-direction: column`, which does
nothing to a grid — so `ADJUSTMENT` was cut in half and the Amount field was off the edge of the
drawer entirely. **Every DOM assertion was green**, because the fields were all present, all in the
right order, and all reachable; none of them was about whether a person could SEE one. One column, and
the grid stacks.

Also caught by eye at 768: the category trigger kept a 260px cap and the scenario button sized to its
text, so a stacked column had two ragged edges beside three full-width selects.

**Four rounds running, which is the finding.** What survives a green suite is what lives INSIDE the
elements the suite checks, and what a layout engine does with a rule written for a different container.

### §39.11 The suite, and three assertions that were measuring the harness

NEW `product-strategy-board-p1-b4.test.js` — **251 / 0 / 12 mutants / 0 survived**. Sections: the bar
and its order · dependent filters · single-option context · the summary · More filters · the fixture's
removal · the drawer · the structural facts behind the height · what is reused and what is missing ·
the information hierarchy · keyboard, touch and aria.

**What this suite can and cannot see.** The DOM shim has no layout engine, so the §7 pixel targets are
measured in Chrome and recorded in §39.1, and the suite asserts the structural facts that produce
them: one bar not four cards, one card not two nested, the popover absolute, the drawer fixed, the
category control a single trigger, and the media queries that carry the three widths. *A structural
assertion cannot prove a height; it can prove that the things which made it 422px are gone.*

**Three assertions were superseded and each was measuring the harness rather than the page:**

- **P1-B2A's H13** asserted that a few categories render as CHIPS. The bar always asks for the menu
  shape, because a control whose width grows with the option count cannot live in a fixed-height bar —
  measured at 833px wide, pushing the other four fields onto two extra rows. The count-based default
  stays in the control for a card to use; the assertion now checks the BAR's choice and that the
  count is still published either way.
- **P1-B2A's N11** raised `CATEGORY_CHIP_LIMIT` to 999 and counted chips. The bar names its shape, so
  the limit has no effect there and the mutation changed nothing observable — **a mutant neutralised
  by a design change, which is a green light for a rule nobody checks.** Re-aimed at the one decision
  the harm now comes from: the bar asking for chips.
- **P1-B2B's M11** expected exactly `'scSeries@24'`. The 24 is the shim's synthetic layout — every
  element gets a top of (document order × 24) — so the anchor compensation depends on how many nodes
  sit above `#view`, and the same correct behaviour reports 48 with a different bar. M11 is about
  FOCUS, and it now compares the clean page against the mutant.

**And one shared helper replaced six copies.** "Find the chip whose `data-category` is X and click it"
appeared six times across four suites; every copy broke together and each had to be found separately.
`H.pickCategory` works with either shape, `H.categoryOptionsOffered` reads the options from whichever
control is there, `H.openMoreFilters` and `H.stressChart` do the same for the two new entrances. *A
suite should say what it wants selected, not how the control happens to be built this round.*

**Non-regression:** P1-B2 **246/0/17/0** · B2A **237/0/14/0** · B2B **142/0/16/0** · B2C
**157/0/14/0** · B3 readback **332/0/17/0** · B1 **167/0/13/0** · page self-test **238/238**. 451
suites swept; only the four PRE-EXISTING red, counts identical to the untouched main worktree
(3/1/7/2).

### §39.12 What is NOT done

No Apps Script file changed, no `assets/js`, no `assets/css`, no production page, no `index.html` —
**so no release bookkeeping moved this round, and nothing became sync-visible.** The five files
P1-B3 left for the user to sync are unchanged and still outstanding.

The readback has still not run. No live DB or API read. `PRODUCT_STRATEGY_ENABLED_` is still false. No
page loads the accessor or the adapter. No Operation System shell integration — and §39.9 is the
measurement of what that will cost. No production DB, Sheets or Drive write. No S1–S5, no `main`, no
`km-lb`. The nine merge conditions from §31 remain open.

**Print/PDF is asserted, not photographed.** The drawer's print rule makes the fixed overlay static
and drops the two entrances; that is checked in the stylesheet and has not been rendered to paper.
A person still needs to confirm it, along with whether the drawer covering the last KPI cell at 1920
is acceptable — it is the deliberate cost of overlaying rather than resizing, because resizing would
move every price.


## §40 — P1-B5 · LIVE UNIVERSE ACCEPTANCE · PRODUCTION INTEGRATION PACKAGE

### 40.1  THE LIVE EVIDENCE, RECORDED ONCE AND NOT RE-MEASURED

The production readback ran on **2026-09-11** and returned **READY**. This section is the record;
§2 of the P1-B5 brief forbids re-running it and forbids overwriting it with a new measurement, so
every number below is CITED from that run and nothing in this round re-derives one.

```
chunks 9/9 · report fingerprint FP0d88b7eb · report length 57493
build / handler / deployment release   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R8
read_only true · writes 0 · writer_calls 0 · sheets_created 0 · rows_modified 0
feature_flag false · gate refusal FEATURE_DISABLED · gate db_opened false
verdict READY
```

| table | rows | columns | fingerprint |
|---|---:|---:|---|
| `sku_details` | 192 | 42 | `DF770684` |
| `marketplace_skus` | 495 | 15 | `2AF82658` |
| `sku_regional_details` | 495 | 16 | `12CB99B7` |
| `pricing_list` | 495 | 29 | `9B0471B0` |
| `campaigns` | 1 | 27 | `100DF154` |
| `campaign_sku_lines` | 2 | 27 | `E9260A0C` |

**The universe:** 10 sites · 13 categories · 43 series · every `marketplace_skus` row active ·
0 duplicate master SKU · 0 duplicate marketplace identity · 0 duplicate regional canonical identity ·
0 duplicate pricing identity · 0 orphan regional/pricing identity · 0 cross-currency site ·
6 missing `regular_price` · 16 missing `minimum_price` · 9 missing `msrp` ·
**61 site SKUs with no Regional Detail, concentrated in ONE site** · alias candidates 0 ·
alias table changed false.

**THE GATE PROOF IS THE STRONGEST LINE IN THE LOG.** `feature_flag false` with
`gate refusal FEATURE_DISABLED` and `db_opened false` means the readback called the real endpoint,
was refused, and never opened the database — then read the tables itself and handed them to the pure
builder. A census taken around the gate would have measured a pipeline nobody ships.

### 40.2  P1 IS `NOT_PROVABLE`, AND THAT IS AN ANSWER

Proofs P2–P7 PASS. **P1 reports `NOT_PROVABLE`** — not FAIL — for a stated reason: outside the US
there is no USD-priced population at risk, so the claim "a USD price does not drag a non-US SKU into
the US site" has nothing to be tested against. The only evidence gap in the whole run is
`PROOF_NOT_PROVABLE(P1)`.

*A proof with an empty population is not a proof that passed.* Recording it as PASS would mean a
later round inherits a guarantee nobody measured, and the day a USD price appears on a non-US site
is exactly the day that guarantee matters. It is **not a blocker**: P2–P7 cover the leaks that do
have populations, and the board refuses cross-site pooling structurally rather than on the strength
of this proof.

P1-B5's suite reproduces the at-risk population the live data lacks — **MX/Amazon prices in USD, and
so does US/Amazon** — so the rule is tested even though production cannot yet test it (§E5–E9).

### 40.3  THE ORDER OF EVENTS, RECORDED HONESTLY

P1-B4 was built and committed BEFORE the readback ran. The readback's `next_action` of
`PROCEED_TO_P1_B4` is therefore a **historical** next-action, already satisfied; it is not a
re-instruction and P1-B4 is not re-implemented. What P1-B5 owes instead is a reconciliation: can the
board P1-B4 built survive the universe the readback found?

| measured | what the board does | evidence |
|---|---|---|
| 10 sites | the ladder narrows on the tiers ABOVE and nothing below | P1-B4 §39, b4 suite |
| 13 categories | menu shape, not chips; no allowlist, no three-category limit | §B3, §B8 |
| 43 series | derived per site/category from the response | §B4 |
| 495 rows | one site at a time; the page grain is `normalizedRows` | §A2 |
| 61 no Regional Detail | eligible, ledgered, **not plotted** | §C1–C7 |
| 6/16/9 missing prices | stay `null`; never 0 | §D1–D9 |
| 6 currencies | split before drawing; never pooled | §E1–E4 |
| 0 cross-currency sites | currency is derived, not a scope | §E5–E9 |

**Nothing was rewritten to move code.** The board needed no change to accept live rows, and the
reason is recorded below.

### 40.4  THE SEAM WAS ALREADY THERE — WHICH IS WHY THIS IS A SWAP, NOT A PORT

`prototype.js` has said the same thing at `boot()` since P0:

> THE ONE PLACE AN ADAPTER IS CHOSEN. Everything above this line is adapter-agnostic; P1-B1 replaces
> this single expression and touches no chart, no table and no rule.

It was true. There are **nine** references to the preview fixture in a 4,600-line renderer, and
eight of them are the fixture's own self-test. `ADAPTER` is one module-level variable assigned at
boot. P1-B5 made it an argument.

`PSB_CONTRACT.OperationDbProductStrategyDataAdapter` has also existed since P0 as a DEFINED,
DISABLED object returning `SOURCE_NOT_CONNECTED` with `requests_made: 0`, carrying a written reason
(three of six source tables had no bounded read owner). **P1-B5 is the enabled implementation of a
seam that was reserved two rounds before it could be filled**, and the reserved stub stays disabled
because it is a definition, not a second adapter.

*The renderer cannot tell live data from preview data, so it cannot be rendering them differently.*
That is the argument the promotion rests on, and it is only available because the seam was honoured.

### 40.5  THE PROMOTION — ONE COPY OF EVERY RULE

| from | to |
|---|---|
| `docs/prototypes/…/data-contract.js` | `assets/js/product-strategy/psb-data-contract.js` |
| `docs/prototypes/…/selectors.js` | `assets/js/product-strategy/psb-selectors.js` |
| `docs/prototypes/…/chart-layout.js` | `assets/js/product-strategy/psb-chart-layout.js` |
| `docs/prototypes/…/prototype.js` | `assets/js/product-strategy/psb-board-ui.js` |
| `docs/prototypes/…/prototype.css` | `assets/css/product-strategy-board.css` |

Git records all five as pure renames. **The prototype now owns exactly one script — its fixture** —
and loads everything else from production, which is the only arrangement in which "the prototype
proves the production board" is a true sentence rather than a hopeful one. §3's "no second UI, no
second selector, no second adapter" is satisfied by there being one copy, not by a promise.

**1,127 assertions pass against the promoted files unchanged.** That is the evidence that a
promotion happened rather than a rewrite: had the files been re-typed, the suites would have needed
re-typing too, and the agreement between them would prove nothing.

### 40.6  FOUR SURGICAL EDITS TO THE BOARD, AND NO FIFTH

1. **`boot(opts)` takes the adapter as an argument**, defaulting to the preview one, and throws
   rather than inventing a board when a host passes neither.
2. **`PSB_BOARD.mount()` is exposed and auto-boot becomes conditional** on `PSB_BOARD_DEFER`. The
   prototype auto-boots exactly as before; a host that must fetch first mounts when its data lands.
3. **The self-test runs only under the preview adapter.** It asserts the demonstration banner, the
   demonstration prices and the disabled Operation DB adapter — every one true while the fixture is
   in use and none of them a statement about the board. *Over live rows it would report that
   production data is not preview data, which is a suite measuring its own fixture's absence.*
   Gated at the CALL SITE, in one edit: guarding the assertions individually means finding all of
   them, and the one that got missed is the one that goes red in production.
4. **Chrome bindings tolerate absence.** `boot()` called `byId('btnRail').addEventListener`
   directly. Inside the Operation System shell the navigation rail is the shell's and there is no
   self-test panel. *A renderer that throws because the host did not supply a navigation toggle is a
   renderer coupled to one host's chrome.* Presentation and Print stay bound wherever they exist,
   because §8 lists them as board features.

### 40.7  THE SOURCE-STATE MATRIX — EXACTLY ONE STATE YIELDS ROWS

`km-product-strategy-live-adapter.js` owns the mapping from the server's vocabulary onto the board's,
and the decision whether a chart may be drawn at all.

| state | rows | analysis | why |
|---|---:|---|---|
| `OK` (server `READY`) | all | **yes** | the only one |
| `SOURCE_EMPTY` | 0 | no — *info* | read, and empty. A measurement, not a failure |
| `SOURCE_PARTIALLY_READABLE` | 0 | no — **stop** | see below |
| `STOP_DATA_INTEGRITY` | 0 | no — **stop** | a join may have attached to the wrong product |
| `SOURCE_NOT_CONNECTED` | 0 | no — **stop** | client-only; no server answered |
| `FEATURE_DISABLED` | 0 | no — *info* | asked first, so no request is sent |
| `SCHEMA_CONTRACT_MISMATCH` | 0 | no — **stop** | a shape this build never read |
| `CONTRACT_MISMATCH` | 0 | no — **stop** | rows lack fields the board indexes into |

**PARTIALLY-READABLE IS DELIBERATELY HARSHER THAN IT NEEDS TO BE.** The rows it did see are real.
Showing them would be a price comparison drawn from part of a population with no way for a reader to
know which part — *and the product that is missing is exactly the one nobody checks.* A partial
answer to "which product is priced wrong" is not a partial answer; it is a confident wrong one.

**THE ORDER OF CHECKS IS ITSELF A RULE.** A response can be `READY` and carry a contract version this
build has never read. The structural stop is checked first, because a reader told "the shape is
wrong" can act on it, where a reader told "0 products" goes looking for the products (mutant N10).

**`SCHEMA_CONTRACT_MISMATCH` is the live adapter's own addition to the stop list.**
`km-product-pricing-adapter` REPORTS a version it was not written against and does not refuse —
correctly, because a pure adapter's job is to say what it saw. *Refusing is a decision about what a
person is allowed to be shown, and it belongs at the seam that hands rows to a chart.*

**A MISSING STATE IS NOT AN EMPTY SOURCE** (N4). "Nobody measured" and "measured, and it is empty"
are different answers and only one of them tells a reader to move on. **A state nobody froze is a
shape problem, not a state** (N5). **A server cannot honestly send `SOURCE_NOT_CONNECTED`** — a
response carrying it is proof a server answered, which is the one thing it claims did not happen.

### 40.8  THE 61 MISSING REGIONAL DETAILS — AND THE CODE ALREADY DID THIS

§6 asks that the 61 be counted in Data Quality and kept off the price chart. **`psb-selectors.js`
already does exactly that**, and P1-B5 recorded the evidence rather than writing it again:

* `regionalStateOf` answers `REGIONAL_DETAILS_MISSING` when `row.regional` is null;
* the identity goes into `dataQuality.regional_details_missing` — **named, not counted**, because a
  count on its own cannot be acted on;
* `chartRefusalsFor` keeps it out of `chartRows`;
* `regional_detail_decides_membership: false` is published as data, so no view has to infer it.

All 61 are **eligible** (membership is `marketplace_skus`, and a missing Regional Detail does not
un-list a SKU), and **not one is chartable**. The concentration matters and is asserted: 61 in one
site is a very different fact from 61 spread over ten — it points at one site's setup, not at a
systemic gap. No DB was touched and no Regional Detail was created.

### 40.9  THE GAP THE REAL UNIVERSE EXPOSED — THE SITE LADDER HAS NO SOURCE

**This is the finding of the round.**

The board derives Company → Country → Marketplace from the rows its adapter hands over, because the
preview fixture hands over the CANONICAL universe: every site it knows about, unfiltered, narrowed
afterwards in the selectors. That is correct for a fixture, and it is the only reason the ladder
worked.

`productPricing.workspace.get` **cannot** do that, and must not. It is site-scoped by construction —
company, country and marketplace are required and the server refuses without them — and P1-B1 built
it that way precisely so one site's rows can never appear under another site's heading. Its
`filterOptions` carries categories and series **for the site already chosen**; it carries no site
list, and there is nowhere honest for one to come from inside a site-scoped answer.

So **the live universe cannot populate the top three rungs of the ladder**, and no existing read
owner publishes `marketplace_skus` membership across sites.

*This is not a defect in P1-B4 — the board is correct for the adapter it was given.* It is a gap
between a renderer that assumed a canonical universe and a read that is scoped on purpose, and it
was invisible until there was a real read to scope.

**It is recorded, not closed.** The production page fails closed with `SITE_UNIVERSE_NOT_AVAILABLE`
and takes the scope as an INPUT (`opts.scope`), with `opts.siteUniverse` reserved as the seam a
later round wires. **No endpoint was invented**: a second read authority for `marketplace_skus` is
the one thing the adapter contract names as forbidden, because two owners of one resource disagree —
and adding a server action would require a sync and a deployment this round is not authorised to do.

### 40.10  THE PRODUCTION PAGE — FOUR STEPS, AND NO FIFTH

`assets/js/pages/product-strategy-board.js` + `assets/html/pages/product-strategy-board.html`.

1. ask the capability mirror — the accessor owns it, and refuses locally with the same code the
   server would send rather than spending a round trip to be told (N11: a mutant that asks the
   server first is caught by the request counter moving);
2. resolve the scope, checked locally, because two of three is not a narrower question — it is a
   question the server cannot answer;
3. one read through the accessor, handed to the live adapter;
4. mount the board with that adapter, or render the state and mount nothing.

**There is no fifth step in which something is shown anyway.**

**NOT REGISTERED.** No menu item in `index.html`, no entry in the `app.js` section map, no script
tag. `showSection` cannot reach it. §4 forbids enabling the navigation entry and §11 forbids
changing it, so production visibility stays zero **by construction rather than by a hidden button** —
the same discipline the accessor has carried since P1-B1, and the suite asserts both files.

**WHAT THE PARTIAL DELIBERATELY OMITS:** the demonstration banner (it reads "Preview data — not
connected to Operation System Database", the truest sentence on the prototype and a false one here;
*a page that kept the element and emptied it would be one edit away from labelling live prices as a
demonstration*), the sidebar and nav (the shell owns navigation), and the self-test panel.

### 40.11  `scratchpad/dryrun/wrapper.gs` — THE ON-SIGHT AUDIT (§9)

**Resolved to: Claude local scratchpad only. Rule A. Deleted.**

It was **not** a leftover of the P1-B3 sync attempt, which is what §9 supposed. It was
`TEMP_RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_DRY_RUN`, dated **2026-09-10**, a one-shot
paste-block wrapping an **S1** factory-stock-movement row removal with `execute:false`.

| question | answer |
|---|---|
| in the Git repo? | **no** — untracked, and `git log --all --diff-filter=A` finds it was never added |
| referenced by anything? | **no** — 0 hits repo-wide for either function name |
| defines a public entry point? | yes, one — but inert as scratchpad text |
| in any sync package / manifest / router? | **no** — P1-B3's manifest is five files and none is this |
| the only still-needed dry-run guard? | **no** — the guard lives in the removal tool; this carried only a frozen baseline, itself reproducible from its siblings (`frozen.json`, `c1–c3.txt`, `rebuild.py`) |
| in the live Apps Script project? | **unprovable from here** — no credential; see below |

**Two facts made deletion safe rather than merely permitted.** First, **S1 is COMPLETE** — that is
`main`'s HEAD commit (`c139943`, *"S1 is complete — the write path closes in the lifecycle, not in
the database"*). Second, **the wrapper would refuse itself**: its own preflight pins
`frozen.build === 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R6'` while the live build is now `…R7-R8`, so
pasting it throws `WRAPPER_PREFLIGHT_FAILED: the baseline is for another build`.

A stale paste-block for a finished project is a thing somebody can find and paste. **No Git commit
was created for the deletion**, per rule A. The suite pins the finding (§M): if a `wrapper.gs` ever
appears in the repository, or anything references the dry-run name, it goes red.

**Residual, and it belongs to the user:** whether a copy was ever pasted into the live Apps Script
project cannot be determined from here — there is no credential, which is the same wall the P1-B3
sync hit. If one is there, rule C applies: **do not delete it this round**; the removal plan is to
open the project, confirm no other file calls
`TEMP_RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_DRY_RUN`, delete that one file, and save.

### 40.12  THE CAMPAIGN CONTRACT, UNCHANGED AND RE-ASSERTED (§7)

`campaigns` had 1 row and `campaign_sku_lines` 2 in the live read, so the join is real but tiny —
which is exactly when a contract matters, because nothing on screen would look wrong if it broke.
Everything P1-B3 froze is still in force and untouched: promotion is a **join**, never a column;
`asOf` is a **parameter**, so the same response on the same day gives the same rows and a campaign
that expired at midnight is not a test that fails once a day; two simultaneously effective
promotions are `AMBIGUOUS_EFFECTIVE_PROMOTION` with **nothing picked** — not the lowest, not the
newest, not the sheet order, because picking one would be a coin toss reported as a fact;
`source_status` is the status string and the codes keep `source_status_codes`; `variant_group` is
`series` and `variant_name` stays `null`; an image is drawn only on `VERIFIED_DB_MAPPING`; identity
is `MSKU:<marketplace_sku_id>` and the fixture form cannot survive the chain (§A8–A9). The scenario
remains front-end memory only (§J).

### 40.13  WHAT IS NOT DONE

* **The site ladder has no live source** (§40.9) — the page takes a scope as input until one exists.
* **No page loads any of this.** No navigation entry, no script tag, `PRODUCT_STRATEGY_ENABLED_`
  still false, no deployment, no live read performed this round.
* **The board has not been rendered against live rows in a browser.** The chain is proven to the
  row contract and the selectors; the pixels are proven only for the preview fixture (P1-B4 §39.1).
* **P1-B3's five Apps Script files are still unsynced**, and the readback whose evidence this
  section records was run by the user from a package that is still outstanding in this repo.
* **Print/PDF is still asserted rather than photographed**, unchanged from §39.


## §41 — P1-B6 · SITE UNIVERSE READ OWNER · DYNAMIC ENTRY SCOPE

### 41.1  THE GAP §40.9 RECORDED, AND WHY IT NEEDED AN OWNER RATHER THAN A WORKAROUND

P1-B5 measured it and refused to close it by guessing: the board derives Company → Country →
Marketplace from the rows its adapter hands over, because the preview fixture hands over the whole
canonical universe. `productPricing.workspace.get` cannot do that **and must not** — it is site-scoped
by construction, and that scoping is the single reason one site's rows can never appear under another
site's heading.

`productPricing.siteUniverse.get` is the answer, and the decisive design choice is where it lives:
**the same 72_ owner, not a new file.** `ppwMembership_` already decides what "listed on this site"
means. A second file holding that rule would agree with the first on the day it was written and drift
every day after — *and the drift would be invisible, because each would look correct on its own.*
The adapter contract has named this hazard since P0: a second read authority for `marketplace_skus`
is the one thing it forbids.

### 41.2  THE CONTRACT

One table (`marketplace_skus`), no scope, no filters, no page. It publishes **identities and counts**:

```
per site   company · country · marketplace · membership_row_count
           active / phasing_out / inactive / discontinued / unknown_status / blank_id counts
           selectable · selectable_with_inactive · refusal_reasons · site_key
whole      site_count · hierarchy{companies, countries_by_company, marketplaces_by_country}
           excluded{blank per tier, blank listing ids, unknown status}
           findings · refusals · completeness{rows_examined, capped, is_whole_universe}
           schema{contract_version 1, build, action, read_at, table fingerprint}
           publishes[] · does_not_publish[]
```

**It returns no price, no currency, no image, no URL, no spreadsheet id and no SKU row**, and says so
as data so the claim is assertable rather than merely written. **Currency is absent on purpose:** a
complete site is single-currency (P1-B3), so currency is a property of a site already chosen —
publishing it here invites a menu keyed on it, which §4 forbids outright.

**SELECTABILITY IS DERIVED FROM THE EXISTING PRODUCT RULE.** `PPW_DEFAULT_STATUSES_` is what the
workspace read applies when a caller names no statuses, so a site with nothing in that gate opens to
an empty chart by default: `selectable:false` with `ONLY_INACTIVE_OR_DISCONTINUED_LISTINGS` named,
and `selectable_with_inactive:true` because `include_inactive` is a real and supported request. Two
booleans, one existing rule, no new judgement.

### 41.3  THE STATES, AND THE THREE THINGS THEY REFUSE TO CONFLATE

| state | published | why |
|---|---|---|
| `READY` | the ten sites | the table was read whole |
| `SOURCE_EMPTY` | nothing | read whole, and it holds no usable identity |
| `SOURCE_PARTIALLY_READABLE` | nothing | missing sheet, missing column, or a capped read |
| `STOP_DATA_INTEGRITY` | nothing | a duplicate listing id, or one site spelled two ways |
| `null` | nothing | the gate refused; nothing was measured |

**A MISSING TABLE IS NOT AN EMPTY ONE.** Empty is the one answer a caller responds to by moving on,
and a table nobody could read has established nothing at all. **A CAPPED READ IS NOT A UNIVERSE** —
a partial menu is indistinguishable from a short one, *and a site missing from a menu looks exactly
like a site that does not exist.* **AND A BLANK IDENTITY IS NEVER AN OPTION**: it is counted per tier
and excluded, because a blank choice is one a person can make that the server must then refuse.

**A DUPLICATE LISTING ID STOPS EVERYTHING, INCLUDING THE NINE SITES THAT WERE FINE.** This endpoint
performs no join — and detects it anyway, because the universe is what a person chooses FROM, and
offering a site whose rows may attach to the wrong product is offering a wrong answer before it has
been asked for.

**THE SERVER NEVER SENDS `SOURCE_NOT_CONNECTED`**, asserted across every reachable path; a response
carrying it is proof a server answered. The accessor rejects one anyway, and the client universe
module is the second wall.

### 41.4  THE TEN CANONICAL SITES, VERBATIM

```
KM/US/Shopify · KM/US/Target · KM/US/Walmart
ResTW/AU/Amazon · ResTW/CA/Amazon · ResTW/EU/Amazon · ResTW/JP/Amazon · ResTW/UK/Amazon
ResUS/US/Amazon · ResUS/US/Walmart
```

**`KM` is not rewritten to `Kitchen Mama` and `EU` is not split into member countries**, both
asserted. *A canonical value that a display layer improved is a value no exact-match join will find
again* — and this endpoint's output is precisely what the NEXT request is built from, so a friendly
name here becomes a refused scope there. No canonical company/country master exists to map them, so
that is recorded as a **display-name evidence gap** rather than closed by invention.

Two shapes in that list are worth noticing: **KM sells on no Amazon marketplace at all**, and **KM
and ResUS both sell in US** — so a menu keyed on country, or on currency, would merge two companies'
listings. The hierarchy is keyed on `company|country`, and the suite asserts the two lists differ.

### 41.5  THE CLIENT FLOW, AND THE TWO ASYNCHRONOUS HAZARDS

```
capability mirror → siteUniverse.get → [ Company → Country → Marketplace ] → workspace.get → adapter → selectors → chart
```

**THE WORKSPACE READ IS NEVER FIRST**, and the suite asserts the request COUNT rather than the
intention. An incomplete scope is answered locally at zero cost: *two of three is not a narrower
question, it is a question the server cannot answer.*

**NARROWING IS A FUNCTION, NOT A RENDER-TIME FILTER.** P1-B4 found this defect in the prototype and
fixed it there; here it has a sharper edge, because now an invalid journey ends in a REQUEST. An
upstream change drops the downstream values the new value does not offer, and **names the tiers it
cleared** — a renderer that knows Marketplace was cleared can say so, where one that only sees a
blank field looks like it lost the value itself. It never revises upward: *a control that edits its
own input is one nobody can predict.*

**ONE OPTION IS A FACT, NOT A CHOICE.** A tier with exactly one value is resolved and reported as
context — and `autoResolved` names where that happened, so "the only one" stays distinguishable from
"the first of several". A mutant that changes `length === 1` to `length >= 1` is caught.

**SINGLE FLIGHT** — one workspace request outstanding; a second selection supersedes rather than
races, because two concurrent reads of two sites resolving in an order nobody controls is the exact
mechanism this feature exists to prevent. **STALENESS** is a different problem and needs its own
rule: the superseded request still resolves, so every request carries a token and a response whose
token is not current is DROPPED and counted. *A slow answer to a question nobody is asking any more
is not late data, it is wrong data* — and it arrives looking exactly like the right data, because the
only thing wrong with it is when it came back.

**A SITE SWITCH RE-MOUNTS THE BOARD** with the new adapter, which is what clears category, series and
any scenario override. There is no partial-update path that could miss one.

### 41.6  WHAT ADDING ONE ROUTER ACTION ACTUALLY COSTS

This is the finding worth keeping, because almost none of it is about the feature:

1. **The GET read table AND the doPost branch.** Assertion 4.4 requires both to reach the same
   handler — *an action cannot be renamed for one verb and not the other.* I had registered GET only.
2. **`SYS_DEPLOYED_ACTION_CONTRACT_VERSION_` 13 → 14**, which is exactly this constant's stated rule.
3. **`KM_EXPECTED_ACTION_CONTRACT_VERSION_` 13 → 14.** I had reasoned it should stay, citing 63_'s own
   comment that it "deliberately STAYS AT 12" for the workspace action. **That comment is stale** —
   the pin was later raised to 13 — and two suites assert equality outright. The suites encode the
   rule the repo follows. **The consequence is binding and is in the release order: this file is
   loaded by every page, so Apps Script must be synced BEFORE the frontend is redeployed**, or every
   page refuses the old deployment with `DEPLOYMENT_CONTRACT_MISMATCH`.
4. **Three module stamps** (`SYS_BUILD_VERSION_`, `PPW_BUILD_VERSION_`, `RTR_BUILD_VERSION_`) → R9,
   because three files changed. E4 catches a dirty file whose stamp did not move — it used to skip
   dirty files as "the round's own edit in progress", which is exactly the window in which the rule
   can be broken, and it was broken that way once. **It caught me for the reason it was rewritten.**
5. **The manifest in 63_**, which declares the build each owner file should report. Moving a stamp
   without its manifest entry reports a MIXED DEPLOYMENT — that was 31 red suites, and my first
   instinct was wrong: I reverted the release, when the missing half was the manifest.
6. **`SYS_DEPLOYMENT_RELEASE_` → R9 and the append-only ledger in `_release-order.js` gains R9.**
7. **Three diagnostic build pins** that track the release (`TEMP_E3_CENSUS_BUILD_`,
   `R6R7_ACTIVATION_BUILD_`, `S1_BUILD_`), because a lagging pin refuses a correctly synced project —
   which those files say in as many words. **`P1B3_READBACK_BUILD_` deliberately does NOT move**: a
   module stamp declares the round its own file belongs to, and the P1-B3 readback did not change.
8. **A negative fixture with an expiry date nobody wrote down.** The S1 census used
   `…R6-R7-R9` as its stand-in for "a build nobody measured on". P1-B6 shipped R9, so the fixture
   silently stopped being unmeasured and the STOP it exists to prove stopped firing. Moved to
   `…-NEVER`, a token the append-only ledger cannot mint. *A negative fixture that names the next
   round's token is a trap set for the next round.*

### 41.7  THE READBACK

`RUN_P1_SITE_UNIVERSE_READBACK()` — no parameters, no router entry, no web entry point, filed with
the other read-only censuses. It calls the **real endpoint** expecting `FEATURE_DISABLED` with
`dbOpened false` and `tablesRead 0`, then reads the table through the **same fail-closed io helper**
and hands it to the **shipped pure builder**. It never writes the flag: *a live refusal is stronger
evidence than a census taken around the gate*, and a readback that flipped the flag would measure a
pipeline nobody ships and leave a bypass behind. Zero-write is labelled **DECLARED** (no writer in
the file, asserted against the source) versus **MEASURED** (`rows_modified`, a lastRow/lastColumn
delta). It prints identities and counts, never rows.

### 41.8  NOT DONE

* **The readback has not been run.** This round builds the repo-side package only.
* **No page loads any of this.** `PRODUCT_STRATEGY_ENABLED_` still false, navigation still not
  enabled — and it must NOT be enabled before this action is deployed, or the board opens with a
  site menu it cannot fill.
* **No live read was performed**, and the ten identities are this round's fixture built to the
  brief's specification, not a new measurement.
* **Display names are an evidence gap**: no canonical company/country master exists, so `KM` and `EU`
  are shown as themselves.
* The board has still not been rendered against live rows in a browser.


---

## 42.  P1-B7 — LIVE EVIDENCE FROZEN · SHELL INTEGRATION · DEPLOYMENT ORDER PROVED

### 42.1  The live evidence, frozen (§2)

`RUN_P1_SITE_UNIVERSE_READBACK()` was run once by the user against the deployed R9 project. Recorded
here as formal evidence; **not re-measured, not rewritten**.

```
executed_at        2026-09-11T13:31:30.059Z        chunks 2/2
report fingerprint D53C96CE                        report length 7272
readback           P1_B6_SITE_UNIVERSE             endpoint build F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9
action             productPricing.siteUniverse.get contract version 1
read_only true · writes 0 · writer_calls 0 · sheets_created 0 · rows_modified 0
gate: feature flag false · refusal FEATURE_DISABLED · db_opened false · tables_read 0
source_state READY · site_count 10 · marketplace_skus rows 495
table fingerprint 2AF82658 · columns 15 · capped false · cap 2000 · is_whole_universe true
findings [] · refusals []
evidence gap  SOURCE_MODIFIED_AT_NOT_MEASURABLE_IN_THIS_DEPLOYMENT_SCOPE
verdict       P1_B6_SITE_UNIVERSE_READY
```

| # | company | country | marketplace | membership rows |
|---|---------|---------|-------------|-----------------|
| 1 | KM | US | Shopify | 101 |
| 2 | KM | US | Target | 19 |
| 3 | KM | US | Walmart | 64 |
| 4 | ResTW | AU | Amazon | 35 |
| 5 | ResTW | CA | Amazon | 51 |
| 6 | ResTW | EU | Amazon | 39 |
| 7 | ResTW | JP | Amazon | 26 |
| 8 | ResTW | UK | Amazon | 42 |
| 9 | ResUS | US | Amazon | 100 |
| 10 | ResUS | US | Walmart | 18 |

All ten active, `selectable`, `selectable_with_inactive`. Blank identity, blank listing id and unknown
status all **0**. 101+19+64+35+51+39+26+42+100+18 = **495**.

**THE GATE REFUSED, LIVE, AND THAT IS THE STRONGEST LINE IN THE REPORT.** `FEATURE_DISABLED` with
`db_opened false` and `tables_read 0` is the flag being checked *before the door*, measured on the
deployed project rather than argued from the source. A readback that had flipped the flag to get a
prettier verdict would have measured a pipeline nobody ships and left a bypass behind.

**`SOURCE_MODIFIED_AT` REMAINS UNMEASURED.** It is not "assumed fresh" and not "probably fine": the
deployment scope cannot see a sheet's last-modified time, so the board cannot tell a reader how old the
numbers are. Carried forward as an evidence gap.

**THE TEN IDENTITIES ARE NOW MEASURED, NOT SPECIFIED.** P1-B6 asserted them against a fixture built to
the brief. This round replaces the provenance of that claim, not the claim: the same ten came back from
the live table, and the per-site row counts — which no earlier round had — are new information.

### 42.2  What running it found that reading it could not (§4)

P1-B5 asserted the adapter seam and P1-B6 asserted the read order, both by reading, and every one of
those assertions was true. Installing the page ran them, and three defects fell out at once.

**1. THE BOARD COULD NOT RENDER IN THE SHELL AT ALL.** `render()` dereferenced `#shell` and `#btnRail`
unconditionally, and `renderNav` / `renderCrumbs` / `renderScenarioMark` appended into hosts the
production partial does not have — because §6 forbids a second sidebar, and P1-B5 was right to drop
them. The first `render()` threw, so nothing after it ran. It was invisible because the test harness
builds its DOM from **the prototype's** index.html: the board had only ever been rendered into a page
that had all of the chrome. P1-B7 boots it into a DOM parsed from the **production partial**.

**2. THE LIVE ADAPTER DID NOT IMPLEMENT THE METHOD THE RENDERER CALLS.** psb-board-ui.js asks an adapter
for `loadCanonical()` — and has since P1-B2A moved the category menu out of the adapter and into the
pipeline, because *a menu built from rows a sieve has already narrowed cannot tell "this site does not
sell it" from "a filter removed it"*. The live adapter offered `load()`, under a comment claiming the
interfaces matched. Mounting threw on the first render. Both methods now return the same snapshot, and
that is right rather than lazy: in the fixture the two differ because it holds every site, while the
server already scoped this response, so the canonical universe for this board **is** the response.

**3. LOADING THE SCRIPT CRASHED EVERY PAGE IN THE APPLICATION.** psb-board-ui.js auto-boots on load, and
`boot()` throws when there is no adapter and no fixture. Correct in the prototype; in a shared shell it
is a thrown exception at the startup of every page, for a feature that is switched off, on a page nobody
can navigate to. The refusal was right and its *timing* was wrong. The auto-boot now runs where a
fixture is present — which is what it exists for — and an explicit `mount()` with no adapter still
throws, because that is a caller asking for a board it has given no data for.

**A DEFAULT THAT IS SAFE WHEN NOBODY SAYS ANYTHING BEATS A CONVENTION EVERYBODY HAS TO KNOW.** The
alternative was one line of `window.PSB_BOARD_DEFER = true` in index.html, which works and makes every
future host responsible for remembering a global whose absence crashes the page at load.

### 42.3  The stylesheet stopped being a page (§6)

`product-strategy-board.css` was written for a standalone prototype: it styled `body`, reset `*`, and
claimed generic names. Linked from index.html it loads **after** base.css and components.css, so all of
it won — across the whole application, on every page, whether or not the board was open.

The leak was **measured before anything was changed**, against all production markup and all production
JS class tokens:

| what | where it actually reached |
|---|---|
| `body` | every page — the `font:` shorthand replaces family *and* line-height (1.6 → 1.5); background cream-white → `#f5f6f9` |
| `h1,h2,h3,h4` · `button` | every page, every button element |
| `.btn` | 18 markup uses + request-order.js |
| `.filter-group` | **49 markup uses** — and the copy drops `position: relative`, which is what a popover is positioned against |
| `.kmf*` | the shared popover primitive, generated by utils/multi-select-filter.js for other pages |
| `* { box-sizing }` | duplicate of base.css, which also zeroes margin and padding — strictly stronger |
| `@media print { body }` | every page's printed output |

Each is now a descendant of `.psb-page`. **Scoped rather than deleted**, because those declarations are
copies of base.css and components.css and the P1-B2A suite holds every value to the original — that pin
is what keeps the copy a mirror instead of a second system, and deleting the block would have dropped
the pin along with the leak.

**AND THE ONES THAT DO NOT LEAK WERE LEFT ALONE, measured the same way**: `.shell` `.side` `.main`
`.banner` `.card` `.view` `.scope` `.sw` `.pill` `.act` `.navbtn` `.stbadge` `.catbtn` `.segbtn`
`.scenario` have **zero** occurrences anywhere in production outside this board, in markup or in JS.
Renaming them would be churn against a risk that does not exist today. **Named residual risk:** if
another page ever adopts one of those names, it will collide, and the fix then is to scope that rule —
not to pretend the collision was unforeseeable.

The scope root exists in **both** documents that use the sheet: the production `<section class="…
psb-page">` and the prototype's `<body class="psb-page">`. One stylesheet, two documents, one scope.

### 42.4  The three hosts, as in-page controls rather than a second shell

`#shell`, `#side` and `#btnRail` stay absent — they are the second sidebar §6 forbids. But three of the
elements dropped with them are not navigation:

* **`#nav`** — the board's six views. Switching between views of one page is a page control. Dropped,
  five of six views were unreachable; kept as a sidebar, it is a second sidebar. It is an **in-page
  horizontal rail**; the button markup is unchanged, so the renderer does not know the difference.
* **`#crumbs`** — which of the six is showing. Without it the six-way switch has no label and a printed
  page cannot say what it is a picture of.
* **`#banner`** — the strip `renderScenarioMark()` writes into. **Not the prototype's demonstration
  banner**, which says "Preview data" — the truest sentence on the prototype and a false one here. It is
  empty until a scenario is applied, and then carries the one sentence that has to survive being printed
  and carried out of the room.

### 42.5  Two gates, and the weaker one is declared rather than absent (§7)

| gate | where | value |
|---|---|---|
| server flag | `00_config.gs` `PRODUCT_STRATEGY_ENABLED_` | **false** — the read is refused at the source |
| navigation | `app.js` `KM_STAGED_SECTIONS_['product-strategy']` | **enabled: false**, with the reason written next to it |
| capability | accessor mirror, raised only by a server payload | **false** — a direct call costs **zero requests** |

**A SECTION THAT IS MISSING FROM `showSection` AND ONE THAT IS DELIBERATELY REFUSED LOOK IDENTICAL FROM
OUTSIDE AND ARE COMPLETELY DIFFERENT IN THE CODE.** Absent, nobody can tell whether the entry was left
out or lost, enabling the page later is an addition nobody can review against an intent, and there is no
line for a mutant to flip. Declared and false, the decision has one line, the tests have something to
assert, and two mutants that switch it on both fail.

**THE GUARD IS THE FIRST STATEMENT IN `showSection`**, above `setHomeShellVisible(false)` and above the
`.active` sweep. A refusal after those would leave no visible section at all — a blank page, which reads
as a crash rather than as a feature that is off.

### 42.6  The deployment order, proved by execution (§8)

P1-B6 recorded "Apps Script first, frontend second" as binding. That is a claim about a comparison, so
the comparison was **run**: the real `checkDeploymentContract` loaded into four sandboxes with the
frontend pin rewritten and the deployment's own answer varied.

| Browser pin | Server contract | Result |
|---|---|---|
| 13 | 13 | `DEPLOYMENT_CONTRACT_OK` — today, unchanged |
| 13 | 14 | **`DEPLOYMENT_CONTRACT_OK` — BACKEND-FIRST IS SAFE, zero interruption** |
| 14 | 13 | `DEPLOYMENT_CONTRACT_MISMATCH` — frontend-first breaks **every page** |
| 14 | 14 | `DEPLOYMENT_CONTRACT_OK` — after both steps |

**THE RULE IS MINIMUM-COMPATIBLE, NOT EQUALITY**:
`identity.deployed_action_contract_version < KM_EXPECTED_ACTION_CONTRACT_VERSION_`. That single `<` is
the only reason the 13/14 cell is green, so **no compatibility window is needed** and the round does not
have to stop. A mutant changes it to `!==` and the suite fails.

**AND `productPricing.siteUniverse.get` IS NOT IN THE REQUIRED-ACTION PROBE LIST.** That is what makes a
**rollback** clean: a browser carrying this build against a rolled-back deployment reports one contract
version, not a list of missing actions — one named fact instead of a hunt.
`SYS_REQUIRED_ACTION_LIST_VERSION_` did not move.

**SYNCING IS NOT DEPLOYING, and that is the safety property of the sync step.** An Apps Script
deployment serves an immutable version: saving files in the editor changes nothing a user can reach.
A half-copied project is invisible until a new version is published — so the version is created **after**
every file is saved, and there is no partial-sync window facing users. (If one were published mid-way,
`mixed_deployment` reports `DEPLOYMENT_PARTIAL_SYNC` naming the stale files.)

### 42.7  Evidence gaps and what is still unproven

* **`SOURCE_MODIFIED_AT` is unmeasurable in this deployment scope** (frozen above).
* **The live readback calls the handler directly, not through the router.** It proves
  `handleProductPricingSiteUniverseGet_` exists and behaves; it does **not** prove `01_router.gs` routes
  the action. The cheap proof is `system.health` — and a browser at pin 14 against a project whose
  router is a round behind reports `DEPLOYMENT_PARTIAL_SYNC` naming the file. Assigned to P1-B8.
* **Display names remain an evidence gap.** No canonical company/country master exists, so `KM` is `KM`
  and `EU` is `EU`.
* **The board has still never been rendered in a browser** — §42.2 is a DOM shim, which is a model. It
  is a much better model than a source search, and it is not a browser.

### 42.8  P1-B8 browser acceptance matrix (§10)

`F` = verifiable with the flag **false** (today, on a controlled build). `A` = requires the controlled
activation P1-B8 owns.

| # | case | when |
|---|---|---|
| 1 | Feature disabled — direct controller call answers FEATURE_DISABLED, network tab shows 0 requests | F |
| 2 | Navigation invisible — no menu item; `showSection('product-strategy')` from the console changes nothing | F |
| 3 | No page regression — every existing page's fonts, buttons, filter widths and popovers unchanged after the stylesheet is linked | F |
| 4 | Print regression — another page prints with its own background | F |
| 5 | Boot — no console exception on any page from the nine new scripts | F |
| 6 | Site Universe loading state | A |
| 7 | Site Universe READY, and the ten-site hierarchy exactly as frozen | A |
| 8 | Company switch clears Country and Marketplace, and names what it cleared | A |
| 9 | Country narrowing offers only that company's countries | A |
| 10 | Marketplace narrowing offers only that company+country's marketplaces | A |
| 11 | Single-option tier resolves to read-only context, marked `autoResolved` | A |
| 12 | Workspace loading state, and **no workspace request before the scope is complete** | A |
| 13 | Workspace READY draws the chart | A |
| 14 | `SOURCE_EMPTY` — zero rows, no fixture | A |
| 15 | `SOURCE_PARTIALLY_READABLE` — zero rows, the unreadable source named | A |
| 16 | `STOP_DATA_INTEGRITY` — zero rows, no normal chart | A |
| 17 | `SCHEMA_CONTRACT_MISMATCH` — a version this build never read | A |
| 18 | Stale response — a slow first answer never overwrites a newer selection | A |
| 19 | Fast site switching — single flight; one request outstanding | A |
| 20 | Missing Regional Detail — counted in Data Quality, excluded from the chart, site not dropped | A |
| 21 | Missing regular / minimum / MSRP — never treated as 0 | A |
| 22 | Six currencies, and **no cross-currency aggregate on any axis** | A |
| 23 | Category and Series menus built from the response, never hard-coded | A |
| 24 | Scenario apply / reset / reload — in memory only, cleared by reload | A |
| 25 | Site switch clears inapplicable scenario overrides | A |
| 26 | Responsive viewports — Auto Fit / Comfortable / Fullscreen, stable axes, no scroll jump | A |
| 27 | Print / PDF, with the scenario warning present when and only when a scenario is applied | A |
| 28 | Router proof — `system.health` reports contract 14 and no `mixed_deployment` | F (after sync) |

**#3, #4 and #5 are the ones to run first and they need no activation at all.** They are the regression
surface this round actually created: a stylesheet and nine scripts loaded by every page.


---

## 43.  P1-B7D / P1-B7E — THE DEPLOYED /exec, AND THE DEFECT ONLY IT COULD FIND

### 43.1  The deployed evidence (P1-B7D §2) — a different thing from the editor readback

**These are not the same evidence and the ledger keeps them apart.** The P1-B6 readback ran in the
Apps Script editor and called `handleProductPricingSiteUniverseGet_` directly: it proves the handler
exists and behaves. It cannot prove the route reaches it, and it never touches the envelope the browser
receives. This is the first evidence taken through the production Web App.

```
endpoint          OP_DB_API_BASE_URL (assets/js/api/operation-system-db-api.js) — the same constant
                  every production read uses. Masked here; never printed in full.
transport         HTTPS GET -> 302 -> script.googleusercontent.com/macros/echo -> 200
                  (the first hop's Location is the ECHO target, not accounts.google.com, so the
                  deployment served this read without a login)
system.health     17,934 bytes      productPricing.siteUniverse.get     1,061 bytes

build_id / deployment_release / router_build / system_health_module_build
                                    F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R9
deployed_action_contract_version    14        required_action_list_version   12
required_action_count               44        transport_contract_version      1
environment_mode                    production
router_ready true · entrypoints { doGet: true, doPost: true } · missing_actions []
mixed_deployment false · 23 non-optional owners all matches_expected
  verdict: "UNIFORM — every probed owner file declares the build its manifest entry expects, AND the
            writer and lifecycle resolve identically at every known schema generation"
read_only true · db_writes 0 · drive_writes 0 · status_transitions 0 · emails 0 · demo_mutations 0
product_strategy_enabled false — reported BY THE DEPLOYMENT, not read from the repository

siteUniverse.get  routed · structured refusal FEATURE_DISABLED · dbOpened false · tablesRead 0
                  UNKNOWN_ACTION 0 · handler undefined 0 · schema.contract_version 1
```

**A FIELD THAT ALMOST PRODUCED THE WRONG CONCLUSION, written down because the next reader will meet
it too.** `system.health` reports `workspace_module_build: …R6-R5`, which reads like the Product
Pricing workspace being four rounds behind. It is not: 63_ binds that field to `SIR_BUILD_VERSION_`,
the **Inventory Replenishment** workspace, which is R5 in the repository and expects R5 in the
manifest. 72_ declares R9 and matches. A reader chasing "the workspace module" during a Product
Strategy verification lands on exactly the opposite conclusion.

### 43.2  The defect: one envelope, two actions, one name (P1-B7E §3)

`ppwEnvelope_` hard-coded `action: PPW_ACTION_`. True while 72_ served one action; a lie the moment it
served two. Every `productPricing.siteUniverse.get` response — refusal, success and exception alike —
published:

```
meta.action        = "productPricing.workspace.get"        <- the envelope's fixed idea
data.schema.action = "productPricing.siteUniverse.get"     <- what actually answered
```

The shipped accessor requires those to agree. Running the **real captured body** through the **real
accessor**:

```
RESPONSE_ACTION_MISMATCH  ->  SOURCE_NOT_CONNECTED  ->  site universe state SOURCE_NOT_CONNECTED
```

"Not connected", written over a response that had arrived — which is the exact failure that validator
exists to prevent, produced by the validator being right.

**WHY TWO ROUNDS OF GREEN SUITES DID NOT SEE IT.** The P1-B6 envelopes were written by hand, and their
`meta.action` was set to what the author expected the server to send. Both sides agreed in the suite
and disagreed in production. *A fixture encodes its author's assumption unless something pins it to
what the server actually does.* So the assumption is now pinned: `assets/tests/_p1b7d-exec-capture.js`
is the de-identified real body, and a suite asserts it **still reproduces the old defect**. An evidence
file quietly updated to agree with the current code proves nothing at all.

### 43.3  The fix, and the two things it refuses to do

`ppwEnvelope_(action, ok, data, errors, meta)` — the action is the **first** parameter and has **no
default**, because a default is the same defect with a longer fuse: the one call site that forgot would
be the one nobody tested. Then it is not trusted:

* it must be one of this file's own constants (`ppwEnvelopeActions_()`, resolved at call time because
  `PPW_SITE_UNIVERSE_ACTION_` is declared nine hundred lines below the function);
* it is stamped **after** the caller's meta is merged, so a caller passing `{ action: … }` cannot win —
  otherwise the allowlist would be advice rather than a rule;
* no handler reads an action from a request body, and a smuggled `payload.action` changes nothing.

**Eight call sites, four per handler, and the proof that is all of them:** `apiVersion` — the
envelope's signature field — appears exactly **once** in 72_, so nothing else assembles a response.
Each handler's body contains exactly four `return ppwEnvelope_(` and no hand-built object.

| | workspace.get | siteUniverse.get |
|---|---|---|
| flag refused | `PPW_ACTION_` | `PPW_SITE_UNIVERSE_ACTION_` |
| second refusal | request invalid | table unreadable |
| success | ✓ | ✓ |
| exception | ✓ | ✓ |

**TWO THINGS DELIBERATELY NOT DONE.** The client validator was not relaxed, and the client was not
allowed to fall back to `data.schema.action`. The validator is the instrument that caught this;
weakening it to make the symptom go away would spend the only thing that worked. Mutants for both.

**An asymmetry left alone and stated instead of tidied:** the two data shapes name their action in
different places — `provenance.action` for the workspace read, `schema.action` for the site universe.
This round makes `meta` agree with each. Adding a `schema.action` to the workspace response for
symmetry would change a shipped response shape for tidiness, which is a decision that deserves its own
round.

### 43.4  R9 -> R10, and what deliberately did not move

R9 is deployed and measured, so the correction cannot wear its name: *an id may not name two trees.*

| moves | why |
|---|---|
| `PPW_BUILD_VERSION_` | 72_ changed behaviourally |
| `SYS_BUILD_VERSION_` | 63_ changed (the manifest) |
| `SYS_DEPLOYMENT_RELEASE_` | a new sync and a new Web App version |
| manifest rows for 63_ and 72_ | a stamp without its manifest entry reports a MIXED sync |
| `_release-order.js` | append-only |
| `TEMP_E3_CENSUS_BUILD_`, `R6R7_ACTIVATION_BUILD_` | held equal to the release by BP3/BP3a |
| `S1_BUILD_` | the census refuses when its pin is not the release (M4a). One line, no logic |

| stays | why |
|---|---|
| **`01_router.gs` — R9** | no action added, renamed or removed. The fix is inside the envelope builder. Its stamp and its manifest row both stay R9, which is the rule working rather than being kept quiet |
| `00_config.gs` — R7 | unchanged |
| **action contract — 14** | a contract version counts the ACTIONS a deployment serves. Bumping it would tell every browser its deployment was too old for a reason that is not about what the deployment can do — and would re-impose an ordering constraint this round does not need |
| required action list — 12, count 44 | same |
| the P1-B3 and P1-B6 readbacks | those files did not change |

### 43.5  The browser found what the source search could not (P1-B7E §7)

A real Chrome, headless, against the real shell served over HTTP — not the DOM shim. It earned its
place on the first run.

P1-B7 scoped the shared primitives by rewriting every selector that began a line at column zero. **Five
rules live inside `@media` blocks, indented, and were missed**: `.filter-group` below 1100px (most
laptops), `.kmf-panel` at 640 and 820, `.kmf-trigger` at 820, and `.kmf-panel { display: none }` in
`@media print` — which hid the shared popover on **every printed page in the application**.

The source assertion passed, because it searched for `\n.selector {`. The browser's own CSSOM scan
**also** passed, for a reason worth keeping: it asks whether a selector matches anything in the
document, and the Home page contains no `.filter-group` — *a leak that only reaches other pages looks
like no leak at all.*

**What worked: measure the shell, disable the stylesheet, measure again, require identity.** It needs
no element present and no value known in advance — which mattered, because the value this round first
asserted for `.filter-group` was simply wrong (160px; it is 140px at that viewport, from a rule nobody
had read).

Custom properties get their own rule, because a variable is not a style: the sheet may **add** a name
the shell does not define and may not **redefine** one it does. Of 70 declared on `:root`, 22 are its
own and 48 are the base.css mirror — identical in the live cascade, the same fact P1-B2A pins in
source.

**Result: 25/25 at 1280x900, 1000x800 and 760x900.** Zero console errors, zero unhandled rejections,
zero Product Strategy requests, capability mirror false, `showSection('product-strategy')` changes
nothing, the mount point present and empty, and no rule in the board's sheet reaching anything outside
a `.psb-page` subtree. The harness is committed at `assets/tools/browser-regression/`.

### 43.6  Still not proven

* **The board has still never been rendered in a browser with rows.** §7 verifies the shell with the
  feature OFF. Drawing the chart needs the controlled activation P1-B8 owns.
* **No live workspace read has been made.** Only the site-universe refusal and system.health.
* Display names remain an evidence gap; `SOURCE_MODIFIED_AT` remains unmeasurable in this deployment
  scope.


## 44.  P1-B7F — R10 VERIFIED ON THE WIRE, AND THE DOOR P1-B8 WOULD OPEN HAS NO LOCK

R10 was synced and published by the user. This round measured it and then asked the question P1-B8
turns on. **The deployment passed every check. The activation did not, and the reason has nothing to
do with this feature.**

### 44.1  R10, by HTTP, through the same 302 every Apps Script answer takes

`system.health` and `productPricing.siteUniverse.get` were called on the production `/exec` using the
endpoint the shipped transport uses and the GET shape it builds. Both answered 200 through one
redirect hop.

```
build_id / deployment_release / build_version   F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10
deployed_action_contract_version 14   required_action_list_version 12   required_action_count 44
router_ready true   entrypoints doGet true / doPost true   missing_actions []
mixed_deployment false   environment_mode production
deployment_uniformity_verdict  UNIFORM - every probed owner file declares the build its manifest expects
read_only true   db_writes 0   drive_writes 0   status_transitions 0   emails 0   demo_mutations 0
product_strategy_enabled false   inventory_ai_plan_db_generation_enabled false
```

Three manifest rows carry this round:

| file | expected | declared | |
|---|---|---|---|
| `63_api_v1_system_health.gs` | R10 | R10 | the release owner |
| `72_api_v1_product_pricing_workspace.gs` | R10 | R10 | the file the fix is in |
| `01_router.gs` | **R9** | **R9** | no route changed, so its stamp did not |

**THE ROUTER ROW IS THE ONE WORTH READING.** A release moved everything around it and it stayed where
it was, because the fix was entirely inside the envelope builder. A manifest that expects R9 and gets
R9 is the rule working. A router quietly marched to R10 to look tidy would be the rule being kept
quiet, and `mixed_deployment` would have had nothing to say about it either way.

`workspace_module_build` reads `...R6-R5` and **that is not 72_ four rounds behind**: the field is
bound to `SIR_BUILD_VERSION_` in 60_ Inventory Replenishment. The same field nearly produced the wrong
conclusion in P1-B7D and is recorded here for the same reason.

### 44.2  The envelope, on the wire

```
meta.action          productPricing.siteUniverse.get      <- the fix, in production
data.schema.action   productPricing.siteUniverse.get      <- and the two agree
meta.build           F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R10
meta.refused true    meta.refusalCode FEATURE_DISABLED    errors []
meta.dbOpened false  meta.tablesRead 0  meta.read_only true  meta.db_writes 0
data.refusals[0]     FEATURE_DISABLED  "PRODUCT_STRATEGY_ENABLED_ is false in the deployment that answered"
```

A **structured refusal** is the one answer that neither an unrouted action nor a missing handler can
produce, so this is also the direct proof that the route is deployed. `dbOpened false` says the gate
ran **before the door**, measured rather than argued.

### 44.3  The pair is the evidence, and only the pair

The R9 body is frozen at `assets/tests/_p1b7d-exec-capture.js`; the R10 body is now frozen beside it at
`assets/tests/_p1b7f-exec-capture-r10.js`, generated programmatically from the captured response and
de-identified by a check that runs rather than a comment that claims. Hand **both** to the **same
unmodified** accessor:

```
R10 body  ->  FEATURE_DISABLED   (no SOURCE_NOT_CONNECTED, no RESPONSE_ACTION_MISMATCH)
              site-universe module state FEATURE_DISABLED, a state the board can render
R9  body  ->  SOURCE_NOT_CONNECTED, detail RESPONSE_ACTION_MISMATCH
```

**THE THING THAT CHANGED IS THE DEPLOYMENT, NOT THE TEST.** One accessor, one call, two wire bodies,
two outcomes. That is the only form of evidence this round accepts for *fixed in production*, and it
is why the R9 capture must never be edited into agreement: the contrast is the proof.

The refusal that arrives is also demonstrably **the server's**. The client has a `FEATURE_DISABLED` of
its own - the capability mirror refuses before sending, so a disabled feature costs zero requests - and
it carries a different sentence on purpose. The sentence observed above exists nowhere in the client.

### 44.4  The site universe did not drift, and that was proved by experiment

The user's R10 readback reported `fp=CA0BB90F len=7273`; P1-B6 froze `fp=D53C96CE len=7272`. **Two
different fingerprints is exactly what a drift question looks like**, and comparing ten row counts by
eye is how one gets answered badly.

So the report was frozen at `assets/tests/_p1b7f-readback-r10.js` and the only two fields a redeploy
legitimately changes - the endpoint build stamp and the read timestamp - were rolled back to their
P1-B6 values and the report re-serialised:

```
R10 as captured      len 7273   fp CA0BB90F
rolled back to R9    len 7272   fp D53C96CE      <- P1-B6, exactly
```

**Not one byte of the universe moved across the envelope fix.** The whole difference is one character:
`R9` became `R10`. This covers the fields nobody thought to check, which is the half that a field-by-
field comparison always misses. Ten sites, 495 membership rows, table fingerprint `2AF82658`, verdict
`P1_B6_SITE_UNIVERSE_READY`, `read_only true`, writes / writer_calls / sheets_created / rows_modified
all 0, the flag false and **not written by the readback**, and `SOURCE_MODIFIED_AT` still recorded as
an evidence gap rather than quietly retired.

### 44.5  P1-B8 GO/NO-GO — `STOP_P1_B8_ACTIVATION_REQUIRES_SERVER_IDENTITY_BOUNDARY`

The question is whether production can tell **who is calling**. It cannot, and the manifest settles it
before any code is read:

```json
"webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
```

Published to **anyone, anonymously**, executing as the **deploying owner**. Apps Script cannot name an
anonymous caller, so `Session.getActiveUser()` would return an empty string even if something asked -
and nothing does: **no runtime `.gs` file calls it**, the router has no token, bearer, shared secret or
session check in front of any handler, and `00_config.gs` has recorded the position since P0 §13.1:
*no RBAC, no server-side identity, `created_by` client-asserted, Login/RBAC scheduled for P2-A.*

**WHAT MUST NOT BE MISTAKEN FOR AUTHORIZATION**, each checked:

| looks like a boundary | what it actually is |
|---|---|
| hidden navigation | a UI decision; the staged registry is not reached by an HTTP caller |
| `PRODUCT_STRATEGY_ENABLED_` | one **global** boolean: it answers *is this feature on*, never *may this caller use it* |
| `created_by` in a payload | a string the client chose |
| `caller_probe` in health | a **deployment** probe. It names an action list, never a user |
| knowing the `/exec` URL | the URL is the access grant, which is the finding, not the control |
| `localStorage` / a frontend button | in the browser, where the caller writes the rules |
| the scope allowlist in `00_config.gs` | a control over **which data** a write may touch. Real, server-owned, and a different axis entirely - it constrains the blast radius of a caller it cannot identify |

**THE HONEST FRAMING, BECAUSE IT CHANGES WHAT SHOULD BE DONE ABOUT IT.** This is not a hole P1-B8 would
open; it is the standing posture of the whole Operation System, and every shipped feature already
answers anonymously. What activation would change is the **content** behind that unlocked door: pricing
and margin by site is a different sensitivity class from what is served today. That is a business
decision about disclosure, and it is the user's to make - it is not a regression this round introduces
and it must not be presented as one.

**THE VERDICT IS NO-GO**, and the flag stays false.

### 44.6  Why the GO/NO-GO is a test and not a paragraph

`assets/tests/deployment-r10-activation-boundary-p1-b7f.test.js` §G asserts the boundary's **absence**,
one named fact at a time, each message saying what to do when the assertion fails. Written as prose,
the conclusion goes stale the first time somebody adds a login and forgets what it was blocking.
Written as assertions, **the day it stops being true is the day the suite goes red** - which is the
signal to re-run the GO/NO-GO, not a failure to be silenced. A mutant restricts the Web App audience
and another adds a session lookup to the router; both are caught, so the section is reading production
rather than remembering a conclusion.

### 44.7  The minimum safe activation, for when it is authorised

Not built this round, and deliberately not started: **a design whose first step is a deployment the
user has not approved is a design that has already begun.** In dependency order:

1. **A server-side identity that Apps Script itself asserts.** Republish the Web App as
   `access: DOMAIN` (or `ANYONE` with sign-in) so `Session.getActiveUser().getEmail()` is non-empty.
   This is a **deployment change and a user-owned decision**, and it affects **every existing page**,
   so it is a scheduled change with its own verification, never a side effect of a feature round.
2. **A server-owned operator allowlist**, in `00_config.gs`, beside the flag - exact addresses, no
   wildcard, **empty means nobody**. Fail-closed is the only safe default for a list whose purpose is
   to be narrow. This is the same shape as the AI Plan scope allowlist, which is the precedent worth
   copying because it is already proven in this codebase.
3. **Two conditions, not one**: the flag true **and** the caller on the list, checked in the handler
   **before the spreadsheet is opened**, with a distinct refusal code (`NOT_AUTHORIZED`) so a refused
   person and a disabled feature are never the same fact.
4. **A test that proves an unauthorised caller is refused before `dbOpened`**, plus mutants for an
   empty allowlist that lets everyone through, a check that runs after the read, and a refusal code
   that collapses the two cases.
5. Only then: controlled activation, live read-only acceptance, and an immediate off switch.

**Steps 1 and 2 are USER decisions, not agent work.** Step 1 in particular changes who can reach the
whole application, and nothing about Product Strategy justifies making that call on the user's behalf.


## 45.  SEC-A0 — THE BOUNDARY IS SYSTEM-WIDE, AND PRODUCT STRATEGY IS NOT WHERE IT BROKE

P1-B7F returned `STOP_P1_B8_ACTIVATION_REQUIRES_SERVER_IDENTITY_BOUNDARY`. SEC-A0 asked how far that
reaches, and the answer reframes the whole activation question.

**Architecture, options, evidence gaps and migration order:
`docs/planning/IDENTITY_AND_ACCESS_ARCHITECTURE_SEC_A0.md`. Layering:
`docs/planning/SYSTEM_RUNTIME_ARCHITECTURE.md` §15.** This section records only what it means for
this board.

### 45.1  What the inventory found

One Web App URL, published `ANYONE_ANONYMOUS`, routes **138 actions**, of which **76 are unambiguous
mutations** - purchase orders, shipment confirmation, allocation submission, inventory adjustment,
batch imports, and the action that creates and deletes the project's own time-driven triggers. Nothing
stands between `doPost` entry and the first dispatch. There are no webhooks, no external integrations,
no HtmlService pages and no second backend: the entire external surface is that one URL.

**PRODUCT STRATEGY IS THE SMALLEST THING BEHIND THAT DOOR, AND IT IS THE ONLY ONE THAT ASKED.** It is
flag-disabled, read-only, has never written a cell and has never rendered a row. Every feature that
already works is exposed more than it is.

### 45.2  What that changes about P1-B8

**Nothing about the board's design, and everything about the order.** P1-B7F's NO-GO stands, but the
prerequisite is not "wait for a login page": it is **SEC-A3**, which enforces caller identity, action
permission and data scope on `productPricing.*` alone. P1-B8 does not need SEC-A4 or SEC-A5; it needs
its own two actions protected.

And the board turns out to be the right first tenant **because nobody uses it**. A new boundary
switched on for a feature whose current user count is zero cannot lock anyone out, and a mistake in the
first version of security code reaches no one. That is a property worth spending, and it is the reason
Option B is recommended over restricting the deployment: restricting access changes something 138
working actions depend on, while this changes something nothing depends on yet.

### 45.3  What must not be read into this

**The anonymous posture is not a defect this feature introduced and it is not one this round created.**
It is how every shipped page has always worked. What activation would change is the *content* behind
that door - pricing and margin by site is a different sensitivity class - and that remains a business
decision about disclosure, which is the user's.

Equally: **SEC-A0 did not make the system less safe by writing the exposure down.** The 76 mutations
were reachable before this document existed. What is new is that the number is now a number a migration
plan can be checked against, recomputed from the router by
`assets/tests/identity-boundary-baseline-sec-a0.test.js` rather than trusted from prose.

### 45.4  Unchanged

`PRODUCT_STRATEGY_ENABLED_` false. Navigation staged-disabled. R10 deployed and correct on the wire.
No client file, no Apps Script file, no deployment and no flag was touched by SEC-A0.


## 46.  SEC-A1 — P1-B8 NOW WAITS ON A COMPONENT, NOT A SETTING

**Evidence: `docs/planning/SEC_A1_IDENTITY_PROTOTYPE_EVIDENCE.md`.**

SEC-A0 left P1-B8 waiting for SEC-A3. SEC-A1 tested the two ways of getting there and **both pure
options failed**, so the prerequisite has changed shape - not its size.

**`access: DOMAIN` cannot reach this frontend at all.** Measured in a real headless browser: a
cross-origin `fetch` with credentials to an Apps-Script-shaped response is blocked, because `TextOutput`
has no method that sets `Access-Control-Allow-Credentials`. The board's own transport is the shared one,
so this was never a Product Strategy question - it is every page's question.

**A Google ID token cannot be verified inside Apps Script.** `Utilities` signs with RSA and never
verifies. The remaining route, Google's `tokeninfo`, is documented as being for debugging.

**So the long-term answer is a small verification gateway**, and the phase-1 answer for this board is
the same Google ID token verified through `tokeninfo` for `productPricing.*` alone - two read-only
actions, named operators, and a throttle that fails closed. Whether even that works is unmeasured.

**What this does NOT change:** the board's design, its adapter contract, its shell integration, R10, or
the fact that the flag stays false. **What it does change:** P1-B8's prerequisite is now a component
somebody has to build and run, not a deployment checkbox - and that is a schedule fact the board's plan
must carry honestly rather than discover later.

The board remains the right first tenant for the same reason as before: **zero current users, so a first
version of security code cannot lock anyone out.**


## 47.  SEC-A2 — THE THING P1-B8 WAS WAITING FOR NOW EXISTS, AND IS NOT DEPLOYED

**`services/auth-gateway/`, with its runbook. Contract: `SYSTEM_RUNTIME_ARCHITECTURE.md` 15.8.**

SEC-A1 left P1-B8 waiting on a component somebody had to build. It is built, attacked with 199
assertions and 20 mutants, and proved end to end in a real browser against a local mock Apps Script
that runs the actual verifier file.

**The part that matters to this board:** the successful gateway response was handed to the REAL shipped
accessor and the site-universe module, unchanged, and came back `OK` with one site and no
`RESPONSE_ACTION_MISMATCH`. *P1-B7E was precisely this seam breaking silently*, so the round did not end
until the client that exists today could still digest what the new path produces.

**The browser also showed the four states as four different things** - not signed in, signed in but not
an operator, an operator on the wrong site, and the feature switched off - which is the whole point of
keeping the refusal codes distinct. An operator who cannot tell those apart cannot act on any of them.

**P1-B8's prerequisite is unchanged in size and now precise:** SEC-A3 wires the verifier into
`productPricing.*` alone, proves the refusal order with the flag still false, adds one operator, and
rehearses the rollback. The board is still the right first tenant for the same reason: **zero current
users, so the first version of security code cannot lock anyone out.**

**Unchanged:** flag false, navigation disabled, R10 deployed, no Apps Script file touched, nothing
deployed anywhere.

---

## §48  SEC-A2R — the gateway is production-ready; Product Strategy is still not enabled

**`PRODUCT_STRATEGY_ENABLED_` remains `false`. P1-B8 has not begun and may not begin.**

SEC-A2R closed the production-readiness gaps SEC-A2 left open: the Google verification library is really
installed, pinned, locked and executed; production configuration refuses to start wrong; the container is
specified; cost and abuse controls are decided rather than deferred. None of that enables anything.

**What this round did NOT do, and what P1-B8 still waits on:** no gate has been added to any of the 138
actions, no Apps Script change was made or deployed, no frontend was released, no navigation was enabled,
no cloud resource exists, and no real Google sign-in has ever been performed against this system.

**The sequence is unchanged and is not negotiable:**

1. **SEC-A3-T** — an isolated, disposable Google Cloud test project; the first real sign-in;
   the refusal order proved from a browser with the flag still false; rollback and key rotation
   rehearsed; then the whole project deleted.
2. **SEC-A3** — enforcement wired into `productPricing.*` **and nothing else**.
3. **Unauthorized-access testing** against that enforcement.
4. **A rehearsed rollback.**
5. **Only then** P1-B8.

**The P1-B7F NO-GO still stands and must be re-decided, not silently dropped.** Its tests assert the
absence of an identity boundary and each carries "RE-RUN THE GO/NO-GO IF THIS CHANGES". A boundary that
exists in `services/auth-gateway/` but is wired to nothing does not change what those tests assert — the
138 actions are exactly as unprotected as they were. The NO-GO is re-decided when enforcement is
**live**, not when the code to enforce it exists.

**One ordering rule that SEC-A3-T tests explicitly, because getting it wrong would be invisible:** a
signed-in stranger must be refused as a stranger **before** the feature flag is consulted. If a stranger
ever sees `FEATURE_DISABLED`, the order is wrong and the round stops — that would make `FEATURE_DISABLED`
a polite way of never exercising authentication at all.

---

## §49  P1-B8A — scope correction, and the leak it uncovered

**The security track is no longer a Product Strategy prerequisite.** SEC-A0 asked a real question —
the Apps Script Web App is deployed `ANYONE_ANONYMOUS` and all 138 actions sit behind that — and the
answer grew into a Cloud Run authentication gateway that had to exist before one read-only page could
ship. **The missing lock was never on Product Strategy's door.** One disabled page behind a false flag
does not change the building's posture either way, and making it the reason to fit the lock delayed
the page without making the building safer. The anonymous posture is recorded, still true, and now
carried by P2-A.

```
AUTH_GATEWAY                          = DEFERRED_TO_P2_A
AUTH_GATEWAY_IS_NOT_A_P1_BLOCKER      = true
P1_USES_CURRENT_OPERATION_SYSTEM_TRANSPORT = true
PRODUCT_STRATEGY_FLAG                 = false
PRODUCT_STRATEGY_NAVIGATION           = disabled
```

Removed at P1-B8A as a forward commit (recoverable in full from history, nothing rewritten):
`services/auth-gateway/` and its 18 files, two gateway test suites, three harnesses, and the Cloud Run
provisioning runbook. Kept and banner-marked `DEFERRED_TO_P2_A` / `NOT_A_P1_BLOCKER` / `NOT_DEPLOYED` /
`NOT_PART_OF_PRODUCT_STRATEGY_RUNTIME`: the SEC-A0 architecture, the SEC-A1 evidence, the SEC-A2R
threat and cost model, and the two self-contained test suites that pin today's posture.

### What the round actually found, which nobody was looking for

`assets/css/product-strategy-board.css` is loaded by `index.html` **on every page**, loads **last** of
all twenty-four stylesheets, and carried **79 rules whose selectors were bare class names** — `.card`,
`.panel`, `.col`, `.grid`, `.nav`, `.main`, `.kpi`, `.banner`, `.shell`. `index.html`'s own shell uses
`.card` seven times and `.grid` seven times. Ten other page partials use `.panel`; seven use `.col`.
Last-loaded plus equal specificity means the board's rules won.

> **The page whose production visibility is zero by construction — disabled, unreachable, behind a
> flag that is false — was restyling the rest of the application on every screen a user could actually
> open.** Nothing failed. There is no error state for "your borders came from somewhere else", which
> is exactly why it survived four rounds of tests that all passed. A feature flag governs behaviour; it
> has never governed a stylesheet, and a `<link>` in `index.html` is live the moment it is committed.

**Fixed:** 444 selectors scoped to `.psb-page`. Two document-level modes remain — `body.presenting`
and `body.is-fullscreen` — and both are keyed on classes the board itself declares and owns, which is
asserted rather than assumed. The sheet now declares **no `:root` block, no `html` rule, no universal
reset, and no `body` rule** beyond those two.

**And the fifty copied tokens are gone from production.** They were copied out of `base.css` verbatim,
names and values identical, with a test holding each one to the original. That was right while the
sheet also had to render a prototype that cannot link `base.css` — that file sets
`body { overflow: hidden }` for the application shell and would kill scrolling on a standalone page.
It stopped being right once the sheet was linked into `index.html`, where `base.css` is loaded on
`:root` **before** it: all fifty were being redefined to the value they already had, on every page.
The copy did not disappear, it **moved** — into `docs/prototypes/product-strategy-board/prototype-tokens.css`,
where the prototype is the only thing that needs it, and where the same test still holds every value to
`base.css`. Production has one definition site; the prototype has a shim that is visibly a shim.

**Nothing was activated.** `PRODUCT_STRATEGY_ENABLED_` is `false`, the staged section is
`enabled: false`, there is no sidebar item (navigation is absent, not greyed out), the two actions are
reads, and no write-shaped `productPricing.*` name exists anywhere in the API layer.

---

## §50  P1-B8B — the menu, the six sub-tabs, the state matrix, and three things that could not be
built as specified

**The navigation is declared, not rendered.** `Product Strategy` is a `menu-parent` above **Pricing
Center** with the six views as `menu-children`, using the Operation System's own
`menu-parent`/`menu-children`/`toggleMenu` pattern — and `index.html` contains none of it. The
placement, the label and the anchor live in `KM_STAGED_SECTIONS_`, and `KM.nav.buildStagedMenu()`
turns them into DOM. **Nothing in production calls it.** That is the shape §3 asks for: markup that
exists and is greyed out can be un-greyed by deleting a class, and an item that is not in the
document cannot. Building the menu in a test still opens nothing — `showSection` refuses the staged
id, the capability mirror is false, and the server refuses on its own flag before any database opens.

```
PRODUCT_STRATEGY_FLAG            = false
PRODUCT_STRATEGY_NAVIGATION      = declared, not rendered
SUBTAB_ROUTE_IDENTITY            = canonical
SUBTAB_URL_BINDING               = none (shell has no router)
VIEWPORTS_PASSING                = 6 of 7
MOBILE_390                       = BLOCKED BY THE SHELL, not by this page
```

### Three things the brief asked for that the system could not give

**1. There is no "Price Center".** The menu is called **Pricing Center** and its `data-menu-id` is the
historical `carrier`. The anchor is pinned to the id, not to an ordinal, and the suite proves it
resolves in `index.html` — a position expressed as "third from the bottom" is one the next menu
addition silently invalidates.

**2. There is no router in this shell.** `location.hash`, `history.pushState`, `popstate` and
`hashchange` appear NOWHERE in `assets/js` — measured, and re-measured by the suite, because the
decision below depends on it. Every page is reached by calling `showSection(...)`, a reload always
returns to Home, and Back leaves the application.

So §2's "back/forward consistent with the main system" and "reload restores the canonical route" are
in tension: the main system creates no history entries at all. What P1-B8B built is the IDENTITY —
one canonical string per view, `product-strategy/<view>`, carried on the sidebar child, on the tab,
accepted by the controller and readable back from it. What it deliberately did not build is the URL.

> A ROUTE THAT DOES NOT SURVIVE BEING PASTED IS NOT A ROUTE, IT IS A DECORATION THAT LIES. A hash
> written here could not be pasted and could not survive a reload — it would sit in the address bar
> while the shell displayed Home. Making it true means giving the whole application a router, which
> changes Back and reload on all twenty-odd pages. P1-B8A is one round old and it was exactly that
> mistake in the other direction: a stylesheet for a disabled page restyling every page a person
> could actually open. **A disabled page does not get to change how the application reloads.**

The binding is one call in one place (`KM.pages.productStrategyBoard.applyRoute`) and the decision is
P1-B8C's.

**3. 390x844 does not fit, and the cause is not this page.** `.sidebar` is a fixed 240px with **no
breakpoint anywhere in `assets/css`**, and `.main-content` carries `margin-left: 240px`
unconditionally. On a 390px phone that leaves 86px of content — for every page in the application.
The board degrades honestly into it (overview density, the chart scrolling inside itself, no page
overflow, and a printed reason) but 40px of chart is not a page. Six of the seven viewports pass;
this one is recorded as **blocked by the shell**, because §2 forbids rewriting the sidebar for one
page and fixing it touches all of them.

### The sub-tabs are the Operation System's tab component now

P1-B7 gave the production rail its own hover, active, padding, radius and overflow rules. All of
those already existed as `.km-tab-rail` in `components.css`, shared by Campaign Risk, Inventory
Replenishment and Order Planning — **a second tab component that looked almost like the first**, which
is worse than an obviously different one because the drift is invisible until they are side by side.
The production partial now carries `km-tab-rail` on the list, and that class is ALSO how
`renderNav()` knows which host it is rendering into. One renderer, no fork, no flag: the prototype's
list does not carry it and keeps the dark sidebar rendering.

`role="tablist"` rather than a `<nav>` landmark, because these are six views of one page rather than
six destinations; one tab stop with Arrow/Home/End rather than six in front of the page's controls;
and `aria-current="page"` — wrong on a control that swaps a panel — is gone from the production side
and kept in the prototype, where the rail really is the navigation.

### The state matrix, and the sentence that was false

§9 asks that different problems not all be shown as a connection failure. They were: both reads ended
`.catch(e => refused('SOURCE_NOT_CONNECTED', e.message))`, so every failure arrived as *"Not connected
to the Operation System database. No server answered."*

> **On the sign-in-page path that sentence is simply false. A server DID answer — it answered "who
> are you" — and the reader was sent to check a connection that is working.**

The information was never missing. `km-api-foundation.js` names the error in `e.apiCode` from a frozen
vocabulary — `AUTH_OR_ACCESS_HTML`, `REQUEST_TIMEOUT`, `TRANSPORT_NON_JSON_RESPONSE` — and this layer
replaced all of it with `e.message`. Four states now, because they are four different next actions:
`BROWSER_OFFLINE` (nothing left the machine), `SOURCE_TIMED_OUT` (it went; the bound elapsed; it is a
read, so asking again is safe), `NOT_AUTHORIZED` (a server answered and the answer was no — asking
again is pointless), `RESPONSE_NOT_READABLE` (something answered with a web page). `navigator.onLine`
is read as evidence and never as an oracle: it can only make an already-failed read more specific.

A server cannot claim one. They describe what happened to the REQUEST, so they are believed only on a
response the accessor built itself.

---

## §51  P1-B8C — the capture that could not be taken, and the machine that is ready for it

**STOP_EXISTING_READBACK_INSUFFICIENT.** §3 asked for a read-only capture of the production workspace
response. It cannot be taken, for two reasons that compose and neither of which is a fault:

1. **The wire cannot produce one.** `PRODUCT_STRATEGY_ENABLED_` is false — §2 forbids changing it — so
   the deployed endpoint refuses before opening anything. Live proof, read by HTTPS on 2026-09-12 and
   frozen in `_p1b7f-exec-capture-r10.js`: `refusalCode: FEATURE_DISABLED`, `dbOpened: false`,
   `tablesRead: 0`, `db_writes: 0`. **The only thing the wire can return is a refusal, and that is the
   gate working.**
2. **The editor readback reaches the builder and discards the rows.**
   `RUN_P1_PRODUCT_STRATEGY_PRODUCTION_READBACK()` does the right thing — it calls the real endpoint,
   asserts the refusal, reads the four tables read-only, and hands them to `ppwWorkspaceBuild_`, the
   shipped builder. Then `p1b3SitePass_` tallies `data.normalizedRows` into class counts and **returns
   none of them**. Its own header says why: *"It never reports a price, a cost, a margin, a URL, a
   customer, or a spreadsheet id."*

That rule was right for the question P1-B3 asked — *is there enough in the SSOT to draw a board* — and
is the wrong shape for the question P1-B8C asks, which is *what exactly would be drawn*. **A renderer
cannot draw a price axis from a count.** The minimum augmentation is specified in
`P1_B8C_LIVE_READBACK_AND_ACTIVATION_MANIFEST.md` §1.3 — one new function in the existing file, a
bounded per-site row sample reduced field by field — and is **proposed, not implemented**.

```
LIVE_WORKSPACE_CAPTURE    = STOP_EXISTING_READBACK_INSUFFICIENT
CAPTURE_KIND              = DETERMINISTIC   (not live evidence)
PRODUCT_STRATEGY_ENABLED_ = false
NAVIGATION_RENDERED       = 0
VIEWPORTS_MEASURED        = 7 of 7 in Chrome, exact
ACTIVATION                = MANIFEST ONLY, NOT EXECUTED
```

### What was built instead

The machine that consumes a capture, proven end to end on data that says what it is. A capture enters
at `KM.api.transport.post` — the ONE substitution §5 permits — and everything above it is shipped
code: the accessor and its response validator, the pricing adapter, the live adapter, the selectors,
psb-views, the board, the production partial, the production stylesheet.

**The seam is the socket and not the adapter, deliberately.** P1-B7E's live defect lived in the
accessor's validator: the deployed envelope said `productPricing.workspace.get` for a siteUniverse
response, was refused as `RESPONSE_ACTION_MISMATCH`, and every suite stayed green because every suite
handed the *adapter* rows it had built itself. §D re-runs that exact defect through this harness and
confirms it is still refused.

### Three things the browser found that no amount of reading would have

**1. Seven screenshots of a blank page.** The first run mounted with `create()` instead of `onMount()`,
so `.module-section` never received `.active`, the board rendered into a `display: none` subtree, and
seven valid PNGs of white were produced. Nothing failed. `viewHost.w === 0` is what caught it — which
is the entire argument for measuring rather than photographing.

**2. `--window-size=390` renders at 548.** Chrome clamps the window width on this platform, so the
phone column was a desktop screenshot wearing a phone's name. Fixed by framing the page in an
exact-sized iframe, and `viewport.w === 390` is now asserted so it cannot come back.

**3. The capture's `product_image` was the wrong type.** `72_` publishes a URL **string** or null;
the first capture invented `{available, source, url}`. The pricing adapter reads it with `str(...)`,
so that object would have arrived downstream as the string `"[object Object]"` and been treated as an
address. **A capture that is not the wire shape tests a contract nobody ships.**

### The image gap, which is structural and worth stating

`A.imageStateOf` returns `VERIFIED_DB_MAPPING` only for an **absolute http(s) URL**, and only that
state draws a photograph — an unproven picture is not shown. §4 removes every URL. Therefore **no
de-identified capture can ever render a product photograph, live or deterministic.** Recorded as an
evidence gap rather than worked around. What IS exercised is both non-photograph states —
`IMAGE_SOURCE_MISSING` (a blank cell) and `UNVERIFIED_SOURCE_REFERENCE` (a cell holding something that
is not a fetchable address) — and the fallback marker, one per labelled product, measured in Chrome.

### What a real browser measured

| | |
|---|---|
| viewports | 7 of 7 at their exact sizes, plus a full-page desktop |
| page horizontal overflow | **0 at every viewport, including 390×844** |
| Y axis fully inside the chart | **7 of 7**, ten tick labels at every size |
| X lane fully visible | 6 of 7; at 390×844 the **chart** scrolls internally (188px) and the page does not |
| tab labels visible | **6 of 6 at every viewport** — the first browser confirmation of P1-B8B's `.side` scoping fix |
| sidebar at 390×844 | still 240px; content area 150px — the shell blocker, measured |
| menu order | `Product Strategy` y=232 above `Pricing Center` y=555, six children, in route order |
| states photographed | 7, each with its own sentence; none says another's |
| print | a PDF from a page with an active scenario, carrying the simulated-price warning |


## §52  P1-B8C-R2 — the live rows arrived, and the board drew them

P1-B8C stopped because the capture could not be taken. P1-B8C-R1/R1A built the one editor-only
function that keeps the rows; the USER ran it against production and returned all thirty-five
chunks. **This is the first round in which the Product Strategy Board has rendered data that came
out of the production Operation System Database.**

### What the live universe actually is

| site | universe rows | sampled | state |
|---|---:|---:|---|
| KM / US / Shopify | 101 | 27 | READY |
| KM / US / Target | 19 | 2 | READY |
| KM / US / Walmart | 64 | 5 | READY |
| ResTW / AU / Amazon | 35 | 3 | READY |
| ResTW / CA / Amazon | 51 | 4 | READY |
| ResTW / EU / Amazon | 39 | 3 | READY |
| ResTW / JP / Amazon | 26 | 3 | READY |
| ResTW / UK / Amazon | 42 | 3 | READY |
| ResUS / US / Amazon | 100 | 7 | READY |
| ResUS / US / Walmart | 18 | 3 | READY |
| **total** | **495** | **60** | |

Three companies, six countries, four marketplaces, six currencies, ten categories, twenty-seven
series. The global sixty-row budget spread across all ten sites with none absent and the largest
share 27 of 60.

### The chain that was exercised, from the socket up

```
capture envelope -> KM.api.transport.post -> km-product-pricing-workspace.js (accessor + validator)
 -> km-product-pricing-adapter.js -> km-product-strategy-live-adapter.js -> psb-selectors.js
 -> psb-views.js -> psb-board-ui.js -> pages/product-strategy-board.js
 -> assets/html/pages/product-strategy-board.html -> assets/css/product-strategy-board.css
```

**All ten sites rendered `OK`. All six views rendered on every one of them — sixty renders — and not
one printed `NaN`, `undefined` or `[object Object]`.** Eleven transport requests: the universe once,
then one workspace read per site, every one of them a `.get`. A write-shaped call still throws.

**The accessor's validator stayed in the path, and live data did not soften it.** An envelope whose
`meta.action` names the wrong action — P1-B7E's live defect exactly — is still refused as
`SOURCE_NOT_CONNECTED`. The mutant that bypasses the accessor demonstrates why that matters: hand the
same envelope's rows straight to the adapter and they come through perfectly, defect invisible.

### The finding: production holds no drawable product photograph

`A.imageStateOf` returns `VERIFIED_DB_MAPPING` only for an **absolute** `http(s)` URL, and only that
state draws a picture. Over all sixty live rows the state histogram is:

| state | rows |
|---|---:|
| `VERIFIED_DB_MAPPING` | **0** |
| `UNVERIFIED_SOURCE_REFERENCE` | the rows that have an image reference |
| `IMAGE_SOURCE_MISSING` | the rows that have none |

`sku_details.image_url` in production is **not** an absolute URL, so the board draws a fallback
marker for every product and never a photograph. The browser measured it independently:
`imageMarkerCount 0`, `fallbackMarkerCount` equal to the labelled-product count.

**This is a data finding, not a rendering defect, and no fixture could have produced it.** The
deterministic capture supplied an absolute URL because that is what the contract describes; the live
one supplies what the sheet holds. It is recorded as an evidence gap against image *identity*
verification and left for an operator to decide, not fixed in the renderer.

### What production cannot demonstrate, and where it is covered instead

Every one of the 495 live rows is `Active`. **LIVE-DERIVED EVIDENCE** therefore cannot exercise the
excluded-by-status path at all. It is covered by **DETERMINISTIC GAP COVERAGE** — the P1-B8C fixture,
which does hold non-active listings — and the two columns are kept apart in the suite and in the
report. Merging them would report as live something no live row supports.

### What the browser measured, on live data

Seven exact viewports plus a full-page desktop, Chrome headless, the production shell and the
production partial:

| measurement | result |
|---|---|
| page horizontal overflow | **0 at all seven**, including 390x844 |
| Y axis fully inside the chart | **7 / 7** |
| X lane fully visible | **7 / 7** |
| six sub-tab labels visible | **6 / 6 at every viewport** |
| console errors / boot errors | **0 at every viewport** |
| board width | non-zero at every viewport — not a photograph of a `display:none` subtree |
| sidebar at 390x844 | still 240px, content area 150px — the standing shell blocker, measured |
| staged section while photographed | `enabled: false` at every shot |

**The live charts are thin, and that is a property of the sample rather than of the layout.** Sixty
rows spread over ten sites and ten categories leaves a handful of products per category, so the
axis-fit result at "normal data volume" remains **DETERMINISTIC GAP COVERAGE** from the P1-B8C run,
which measured a twenty-six-product chart at the same seven viewports. Making the live chart denser
would have meant inventing rows.

### Still not activated

`PRODUCT_STRATEGY_ENABLED_` false, staged section `enabled: false`, no menu item in `index.html`, two
`productPricing` actions and both reads, no Apps Script sync, no version, no deployment, no frontend
deployment, zero database/Sheets/Drive writes. **No production file changed in this round.**

## §53  P1-B8C-R3 — one column, two answers, and the page that validated nothing

**THE REPORTED DEFECT.** SKU Details displays a product photograph; Product Strategy shows a
fallback marker for the same SKU and reports `UNVERIFIED_SOURCE_REFERENCE`. One column
(`sku_details.image_url`), one row, two answers.

**THE CAUSE, AND IT IS NOT A TYPO.** Each page owned its own rule and neither consulted the other:

| Page | Rule | `assets/img/products/CO1100-R.jpg` |
|---|---|---|
| SKU Details | `resolveSkuImageUrl` — upgrade `http://`→`https://` on an https page, **pass everything else through** | renders (a browser resolves a relative path against the page) |
| Product Strategy | `imageStateOf` — `/^https?:\/\//` or `UNVERIFIED_SOURCE_REFERENCE` | refused |

That path is not a hypothetical. `IMAGE_POLICY.verified_mappings` records seven `image_url` values
the operator read off live `sku_details` rows, and **every one of them is repo-relative** — which is
why P1-B8C-R2 measured `VERIFIED_DB_MAPPING` for **zero** of sixty live rows.

**THE SECOND DEFECT, FOUND ON THE WAY, AND THE MORE SERIOUS ONE.** SKU Details validated **nothing**.
`javascript:alert(1)`, `C:\Users\...\photo.jpg`, a bare Drive id and a `data:` URL all reached
`<img src>` verbatim. **Passing a value through is not the same as accepting it.** The board was
strict about the wrong thing; SKU Details was not strict about anything.

**THE FIX — AN EXTRACTION, NOT A SECOND MAPPING.** `assets/js/utils/km-image-reference-policy.js`
is the one authority, asked by both pages. The mixed-content upgrade moved across unchanged, every
caller kept its name, and **nothing in it composes a path from a SKU** — P0-R3-R1's retraction
stands. Verdicts:

| Kind | Example | Result |
|---|---|---|
| `ABSENT` | `''` | no image, reason `NO_IMAGE_URL_ON_RECORD` |
| `SAME_ORIGIN_ASSET` | `assets/img/products/CO1100-R.jpg` | renders |
| `ABSOLUTE_APPROVED` | page-origin URL, or a host the operator declared | renders (http→https upgraded) |
| `REJECTED` | `javascript:` · `C:\…` · UNC · `file:` · `..` · Drive/Sheet id · undeclared host · no image extension | refused, with the reason |

**AN EXTENSION IS HOW A RELATIVE REFERENCE PROVES IT NAMES A FILE.** `CO1100-R.jpg` is a path a
browser can fetch; `1AbCdEf…` is a Drive id that 404s against the page. The rule is the extension and
**not the length** — a length rule would refuse a deeply-nested legitimate path and accept a short id.

**THE ALLOWLIST SHIPS EMPTY, AND THAT IS A DECISION.** Nothing in this repository names an approved
image host — no CSP, no `img-src`, no configuration — and R2 measured zero absolute URLs across sixty
live rows. An allowlist invented here would be a hostname somebody guessed, enforced as policy. **The
page's own origin is approved without being listed**, because that is not a guess. An external host
is one line: `P.APPROVED_EXTERNAL_HOSTS = ['cdn.example.com']`.

> **OPERATOR DECISION OUTSTANDING.** If any live `sku_details.image_url` points at an external
> domain, it will now fall back until that host is declared. All 67 production data points available
> to this round — R2's 60 live rows plus the 7 operator-asserted mappings — are relative paths, so
> the **measured** impact is zero; the unmeasured remainder is the operator's to confirm.

**THE BROKEN-IMAGE FALLBACK, WHICH THE BOARD NEVER HAD.** The policy decides whether an address may
be *fetched*; only the browser learns whether it *was*. SKU Details has had an `onerror` since it
shipped. `psb-board-ui.js` had **two** `<img>` elements and **neither** had one, so a 404 left an
empty frame under a caption claiming a photograph. Both now fall back, and "IMAGE FAILED TO LOAD"
stays a different message from "IMAGE SOURCE MISSING".

**WHAT THE LIVE ROWS CANNOT PROVE, AND ARE NOT ASKED TO.** R2's diagnostic *removed* every image
address before the log left the editor — correctly, an address is a locator — so the sixty live rows
carry redaction markers and can demonstrate only that nothing regressed. The photographs are drawn
from `_p1b8c-r3-asset-capture.js`, which reads the seven operator-asserted paths out of the contract
(never a copy) and carries an eighth reference that **must** be refused, because a run in which
everything draws cannot tell "the policy accepts good values" from "the policy accepts everything".

**MEASURED IN A REAL BROWSER, BY `naturalWidth`.** Counting `<img>` elements would score seven broken
images exactly like seven photographs. Across all seven viewports: every `<img>` present reported
`naturalWidth > 0`, `htmlImagesBroken` = **0**, chart photograph markers > 0 **while fallback plates
were still drawn** for rows with no mapping, and every chart `href` traced to an operator-asserted
path. The deterministic capture's redaction marker lost its `.svg` extension so it stays undrawable.

## §54  P1-B8C-R3-R1 — the compatibility gate, and the consumer nobody had counted

**WHY A GATE BEFORE A DEPLOYMENT.** §53's shared policy refuses an absolute URL on a host nobody
declared, where SKU Details previously displayed **any** non-blank value. If production holds an
externally-hosted image, R3 converts a working photograph into a fallback marker.

**THE EVIDENCE R3 LEANED ON WAS NOT A CENSUS.** R3 reported "all 67 production data points are
relative paths". Sixty came from P1-B8C-R2, which sampled **sixty of 495 rows of the PRICING
universe**; the other seven are operator assertions. `sku_details` is a different table at a
different grain, and R2's diagnostic **removed every image address** before the log left the editor —
so those sixty rows could not have reported a host even if one existed. **Sixty of one table is not a
census of another.**

**WHAT THE REPOSITORY CAN PROVE.** Scanned whole (1,032 files, 311 candidate references):

| Shape | Where | Verdict |
|---|---|---|
| filename-only (`img9.jpg` ×20) | archived `backup_legacy_files_20260116/data.js` — the pre-database convention, not loaded by production | accepted |
| repo-relative (`assets/img/products/*.jpg` ×7) | `IMAGE_POLICY.verified_mappings`, operator-asserted from live rows | accepted |
| **external image host** | **`eoimages.gsfc.nasa.gov`, and only in `tools/geo/` + `PROVENANCE.md`** | not a runtime source |

The NASA host is a **build-time** vendoring URL; `km-globe.js` declares `NO RUNTIME NETWORK` and
names no host at all. **No shipped file references an external image host.** No asset base and no CDN
base exists anywhere — the `baseUrl` machinery that does exist belongs to the API transport and names
an `/exec` endpoint.

**THE FOURTH CONSUMER.** `campaign-risk.js:438` joins `sku_details`, takes the same `image` field
through the same mapping, and renders it with **no resolver and no validation** —
`<img class="cr-img" src="${_crEsc(r.image)}">`. §53's parity claim covers SKU Details, SKU Handbook
and Product Strategy; **it does not cover this page**, which remains the path by which a `javascript:`
URL in a sheet cell reaches an attribute. It has its own `onerror`, so only *validation* is missing.
**Recorded, not repaired** — this round's scope is measurement, and adopting the resolver there
changes a page the gate has not measured.

**THE GATE'S ACTUAL QUESTION, REDUCED.** Of every class R3 removes —
`UNSUPPORTED_SCHEME`, `LOCAL_FILE_PATH`, `PATH_TRAVERSAL`, `OPAQUE_REFERENCE`,
`NOT_AN_IMAGE_FILENAME`, `UNAPPROVED_HOST` — only the last could ever have been a working picture.
Every other removal is a value no browser could fetch. So the gate reduces to one question:
**does production hold an absolute image URL?**

**AND COMPATIBILITY IS NOT "IT STILL DISPLAYS".** A policy that displayed a *different* address would
pass that and break every picture. The property asserted is that for every value the new policy
accepts, **the string handed to the browser is byte-identical to the old one** — which holds without
any file needing to exist, and is why the filename-only shape can be certified without inventing a
file at the repository root. The gate is one-directional: `old rejected / new displayed = 0`.

**`RUN_P1_IMAGE_REFERENCE_UNIVERSE_CENSUS()`** closes the remaining gap. Editor-only, no parameters,
reads **one column of one table**, no cap and no sampling. It publishes counts by shape plus
hostnames — a hostname is the allowlist identity; a path, filename or query is not, and each can
carry a SKU, a token or a person. An authority containing `@` stops the **whole** report
(`STOP_P1_B8C_R3_R1_HOSTNAME_REDACTION_FAILED`), because a partial census is not a census. The
buckets must sum to the whole or the report stops. Absolute rows are scored **separately** as
`old_displayed_new_depends_on_allowlist` rather than guessed either way.

**THE TWO CLASSIFIERS ARE PROVEN EQUIVALENT.** An Apps Script census and a browser policy deciding
the same value differently is the exact defect §53 existed to fix, so the repository asserts
agreement over a 35-value corpus that reaches **every branch of both**, in the same order.
