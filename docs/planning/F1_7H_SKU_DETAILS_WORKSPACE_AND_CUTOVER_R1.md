# F1-7H-SKU-DETAILS-WORKSPACE-AND-CUTOVER-R1 — SKU Details scoped workspace + primary-render cutover

**Outcome: IMPLEMENTED (transport/read-model migration; BEFORE FACT == AFTER FACT).** Baseline HEAD `534ac48`. The active
SKU Details page (`sku-details.js`) now renders its PRIMARY surface (the four SKU lifecycle tables + the per-Series
HS-code / Tax subpage) from ONE scoped `skuDetails` workspace — no broad Operation DB for the primary render, scoped
post-write refresh, fail-closed on error. **No SKU creation/update semantics, no Factory Stock initialization boundary, no
marketplace-SKU trigger boundary, and no HS-code semantics changed.** The secondary `sku-regional-details.js` page is a
documented DEFERRED follow-up (the workspace already supports it via `include.regional`).

## §0 Audit — active surfaces + classifications
- **PRIMARY = `sku-details.js`** (`#sku-section`): renders four lifecycle tables of master `sku_details` (via
  `getAllSkuDataWithOverrides` → `getSkuDetails`) + a per-Series **Tax subpage** (`_renderSkuTaxList` reads
  `tax_referral_rates` + `tax_rate_components`). Client-side Category/Series/SKU-text filtering; no pagination. It renders
  from the app-bootstrap `_opDbCache` (does not itself force a broad load before paint).
- **SECONDARY = `sku-regional-details.js`**: Layer-2 regional page (reads sku_regional_details + sku_details +
  marketplace_skus + tax tables). **DEFERRED** this round (§9/§21) — the workspace ships `include.regional` ready.
- `sku-handbook.js` = read-only knowledge view (out of scope).
- Every frontend calc classified DISPLAY_ONLY / FORMAT_ONLY / FILTER_ONLY / READ_MODEL_ASSEMBLY — **no derived
  inventory/forecast fact anywhere** (the cm↔in / kg↔lb unit toggle is a DISPLAY_ONLY table view, never written).

## §1/§12 Factory Stock initialization — PROVEN unchanged (no divergence, no HALT)
Master-SKU creation initializes a `factory_stock` (=0 baseline) row **ONLY on the non-running → "Running in the Market"
transition** — `handleUpsertSkuDetail_` (03_master_data_handlers.gs:289 edit-transition / :309 create-as-Running) →
`ensureFactoryStockBaseline_` (idempotent, per active factory warehouse, `fac_current_stock=0`). It is **NOT** triggered by
mere creation as "Upcoming SKU", and **NOT** by marketplace-SKU creation (`handleUpsertMarketplaceSku_` touches only
marketplace_skus + sku_regional_details, never factory_stock). This matches the documented contract — **no divergence
found**. This transport round touches **no write path**: the READ workspace never reads/writes `factory_stock`, derives no
inventory quantity, and leaves the factory↔company relationship + rawInventory owner `54_` untouched.

## §2 Marketplace-SKU boundary — unchanged
`handleUpsertMarketplaceSku_` remains the separate authority (marketplace_skus + ensure/adopt sku_regional_details
identity; it does NOT initialize factory_stock/pricing_list/fc_regular_forecast). The workspace is a READ MODEL owner, not
a write-orchestration engine — it moves no trigger.

## §6 HS-code — canonical owner unchanged
HS code is per **Series × Origin × Duty-country × effective period**, owned by `tax_referral_rates` and edited via
`saveSkuTaxRate` → `upsertTaxReferralRate` (→ `handleUpsertTaxReferralRate_`). This round only **transports** the persisted
`tax_referral_rates` / `tax_rate_components` rows for READ (verbatim; the equivalence test asserts `hscode`/`dutyRate`/
`series` byte-identical). No tax/currency/customs/mapping semantics changed; no country inference.

## §3/§4/§5/§7 SKU Details workspace (NEW backend `59_api_v1_sku_details_workspace.gs`)
Action `skuDetails.workspace.get` (router dispatch added). Reads ONLY the SKU master/reference table set — **never
`getOperationDb`**:
- **BASE** (fail-closed on missing schema): `sku_details` (identity master — the four lifecycle tables), `tax_referral_rates`,
  `tax_rate_components` (the Tax subpage).
- **INCLUDE-gated `regional`** (missing-safe; read only when `include.regional`): `marketplace_skus`, `sku_regional_details`
  (for the deferred sku-regional-details.js page) — bounded includes, no read cost when not requested.
- **Input grain:** `{ include? }`. **Output grain:** `{ summary, skuDetails[] (raw), taxReferralRates[] (raw),
  taxRateComponents[] (raw), (+regional) marketplaceSkus[] (raw), skuRegionalDetails[] (raw), capped, counts }`.
- **FULL-SET by design (BEFORE == AFTER):** both SKU pages filter/search/sort/paginate CLIENT-side over the complete
  dataset (sku-details.js builds its lifecycle sections + Category/Series universes from ALL rows). Server-side narrowing
  would shrink those universes → a user-visible change. So the workspace returns raw passthrough of the ENTIRE tables
  (bounded by a generous cap that is **never silently applied** — reported via `capped`). The win is table SCOPE (3–5
  tables, never the ~44-tab getOperationDb), not server pagination. Same discipline as `57_`/`58_`: pure `skdWorkspaceBuild_`
  + injectable `io`; S0/S0.5; fail-closed.
- **No write side effects, no Factory Stock init, no Forecast/Gap/Recommendation** (source-guarded).

## §14 BEFORE == AFTER (gold-standard) — the adapter + the ACTUAL browser read model
`KM.DB.adaptSkuDetailsWorkspace` maps each workspace raw array through the **SAME** canonical normalizer with the **SAME
per-array filter** `normalizeOperationDb` applies (`normalizeSkuDetailsRecord` filter `sku`; `normalizeTaxReferralRateRecord`
filter `taxRateId||series`; `normalizeTaxRateComponentRecord` filter `taxComponentId||taxRateId`; `normalizeMarketplaceSkuRecord`
filter `sku`; `normalizeSkuRegionalDetailRecord` filter `regionalDetailId||sku`), preserving the `.raw` passthrough the
render/edit paths read. The suite runs the **ACTUAL** browser `getAllSkuDataWithOverrides()` grouping + `_skuDistinctValues()`
option universes from the Workspace read-model **and** from the Legacy broad-cache getters, asserting IDENTICAL output;
plus shared-factory/multi-company passthrough (one master SKU across KM + ResTW marketplace rows, no inference),
HS-code equivalence, junk-row filter parity, include-gating (regional absent without include; the orchestrator does not
READ the regional tables without it), empty (EMPTY ≠ ERROR), and the non-silent `capped` backstop.
`api-sku-details-workspace-f1-7h-r1.test.js` **53/0**.

## §8/§9/§15/§16 Frontend cutover (`sku-details.js`)
- `_skEffectiveWorkspace()` gates on canonical `skuDetails`; `_skReadModel` sourced from
  `KM.api.getWorkspace('skuDetails')` → `KM.DB.adaptSkuDetailsWorkspace`. Read-model-first accessors
  (`_skGetSkuDetails`/`_skGetTaxReferralRates`/`_skGetTaxRateComponents`) swap the source; the render (`renderSkuDetailsTable`
  → `getAllSkuDataWithOverrides(_skGetSkuDetails())`), `_skuFindRecord`, `_skuDistinctValues`, the Tax subpage
  (`_renderSkuTaxList`/`openSkuTaxForm`), and the debug tool route through them → the primary render reads NO broad cache.
- The shared `getAllSkuDataWithOverrides(sourceItems)` gained an **optional** read-model arg (backward compatible — omitted
  by Legacy / sku-handbook, which keep the getter).
- Mount → `_skLoadAndRender()`: Workspace mode fetches the scoped workspace then renders (fail-closed via `_skRenderError_`
  / `SKU_DETAILS_READ_FAILED` — **no silent legacy broad fallback**; the broad path lives ONLY in the Legacy branch).
  `KM.loadState.createRegion` bounded loading/error region. Kill switch `setWorkspaceEnabled('skuDetails', false)` → instant
  Legacy.
- **Post-write** `_skAfterWrite(cb)` — Workspace mode a SCOPED `skuDetails` re-read then the page's existing render; Legacy
  render-only. Wired into all 3 live write success paths (SKU save, lifecycle change, tax-rate save).

## §10/§11 Writes / refresh (unchanged authority; scoped refresh)
| Write | Owner | Tables | Downstream side effect | New refresh |
|---|---|---|---|---|
| `upsertSkuDetail` (SKU create/edit) | 03_ | sku_details (+ conditional factory_stock baseline on →Running) | Factory Stock baseline ensure ON →Running only | scoped `skuDetails` re-read |
| `updateSkuLifecycle` | 03_ | sku_details.lifecycle | none | scoped `skuDetails` re-read |
| `upsertTaxReferralRate` (HS-code) | 19_ | tax_referral_rates | versioning (close prior open row) | scoped `skuDetails` re-read |
Write API/payload/authority **unchanged** (the frontend still submits user input verbatim and still surfaces
`data.factory_baseline`). **Boundary:** the shared `KM.DB.*` writers still `loadOperationDb({force:true})` INTERNALLY (the
~40-writer pattern) — that populates `_opDbCache` the primary render now ignores; removing it is deferred **Batch F**.

## §13 No Forecast / Planning crossover
`59_` calculates no Forecast/Target%/Gap/Recommendation, allocates no inventory, computes no Open-PO-Remaining, creates no
Request/Purchase Order, runs no Shipment/FIFO. It reads none of 42_/43_/52_/53_/54_/55_/56_.

## Tests / regression
New `api-sku-details-workspace-f1-7h-r1.test.js` **53/0**. Contract tests: foundation R3b → "only inventoryReplenishment
REGISTERED-only" (+ skuDetails IMPLEMENTED); compat CUTOVER_PAGES += sku-details.js; skuDetails registration table list
updated to include tax_rate_components. **Full regression: 228 files, only the 4 known baseline failures (none new).**
Bundle unchanged (`aaf5b07`, --check PASS).

## §17 app.js prime / broad-cache pages
Unchanged (KEEP). **SKU Details primary surface independent of broad DB: YES.** **Secondary surfaces independent: NO**
(sku-regional-details.js deferred; sku-handbook.js unchanged). Remaining broad-cache pages ≈ 7 (inventory pages,
carrier-rate-card, campaign-risk, sku-regional-details.js, sku-handbook.js, overseas-*, etc.). Global-prime removal remains
Batch F.

## §19 Deployment / version
- **PRE HEAD** `534ac48` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `59_api_v1_sku_details_workspace.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment: YES** — deploy the **backend FIRST** (canonical-ON), then the frontend, or hold with the kill
  switch. If the frontend ships first, SKU Details fails-closed with a bounded read error (never Legacy, never silent)
  until the backend is live.
- **Frontend deploy: YES** — `km-api-foundation.js`, `operation-system-db-api.js`, `sku-details.js`,
  `utils/sku-overrides.js`. **Bundle rebuild: NO** (`59_` not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `skuDetails.workspace.get`; no existing route/DTO changed.
- **Rollback:** revert this commit; or runtime kill switch `KM.api.setWorkspaceEnabled('skuDetails', false)` → instant
  Legacy broad-cache primary render (no deploy).

## FINAL GATE — PASS
SKU Details primary render = scoped API ✓ · master SKU facts remain persisted authority ✓ · SKU creation/update semantics
unchanged ✓ · Factory Stock initialization boundary unchanged ✓ · marketplace-SKU trigger boundary unchanged ✓ · HS-code
semantics unchanged ✓ · BEFORE == AFTER (adapter = SAME normalizers + filters; the ACTUAL grouping/universes equal; 53/0) ✓
· no broad Operation DB required by the primary path ✓ · no silent fallback ✓ · no new regression failures ✓.

**SKU Details scoped read: DONE.**

**Exact next slice:** the DEFERRED **sku-regional-details.js** cutover (trivial — same workspace + `include.regional`), OR the
`inventoryReplenishment` workspace, OR the DEFERRED Event Assist authority redesign, OR request-order.js secondary surfaces,
OR Batch F (retire the ~40-writer WRITE_FORCES_FULL_RELOAD + app.js global prime). Do NOT begin automatically.
