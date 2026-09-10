# Product Strategy Board — Design Freeze (P0 · updated by P0-R1, P0-R3, P0-R3-R1, P0-R3-R2, P1-B0)

**Rounds:** `PRODUCT-STRATEGY-BOARD-P0` — Discovery, Data Mapping and Design Freeze
· `PRODUCT-STRATEGY-BOARD-P0-R1` — Design Closure and Non-Runtime Visual Prototype
· `PRODUCT-STRATEGY-BOARD-P0-R2` — Interactive SKU Price-Band Prototype
· `PRODUCT-STRATEGY-BOARD-P0-R3` — Data-Contract-First Executive Report Prototype
· `PRODUCT-STRATEGY-BOARD-P0-R3-R1` — Product Image Identity Correction and Visual Acceptance
· `PRODUCT-STRATEGY-BOARD-P0-R3-R2` — Category Command Center, Image Price Markers, Five-Unit Axis
· `PRODUCT-STRATEGY-P1-B0` — Site-Scoped Data Contract + Operation System Integration Freeze (audit only)
**Status:** **DESIGN CLOSED, AND THE DATA CONTRACT IS NOW FROZEN TOO.** All nine decisions are
operator-decided and applied; §23–§28 add the measured source audit, the canonical data contract, the
variant-grouping and image rules, the adapter seam and the P1-B1 handoff. Still nothing implemented in
the application.

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
| Render contract | `sku-overrides.js` — `getNormalizedSkuImage`, `resolveSkuImageUrl`, and `classifySkuImageSource` returning `PRESENT` / `ABSENT` with reason `NO_IMAGE_URL_ON_RECORD` |
| Reported as a data gap | `sku-handbook.js:502-506` counts `skus_with_image_url` / `skus_without_image_url` and calls the second *"a DATA gap — fill in sku_details.image_url"* |

The format is a **URL string**, and the shipped resolver already knows one way it fails: an
`http://` image on an `https://` page is mixed content and is upgraded at render time
(`sku-overrides.js`, F1-7N-FB-4E-R3 §F). The board inherits that classification. It does **not**
inherit the resolver's `localStorage` override branch. See §26 for the local-file question.

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

### 30.2 Category is the first scope

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
