# F1-7E-PREREQ-5-AI-PLAN-FIRST-LAYER-COMPOSER-AND-CUTOVER-R1 — final AI-Plan first-layer cutover

**Outcome: IMPLEMENTED (backend composer + frontend cutover; BEFORE FACT == AFTER FACT proven for the whole first-layer
table).** Baseline HEAD `293f484`. The AI-Plan (`request-order.js` / 下單系統) first-layer table now renders from ONE
scoped backend composer that REUSES the PREREQ-1..4 Layer-1 owners + identity — no `getOperationDb`/`loadOperationDb`/
`_opDbCache` for first-layer factual assembly. No new formula, no second engine, no DB schema change. **AI Plan
first-layer scoped read = DONE.**

## §0 Precondition audit (all present)
| Owner | Action | Input | Output |
|---|---|---|---|
| 42_ | `recommendation.workspace.get` | scope+filters+pagination | `lines[]` (recommendedQty, calculatedGap, …) |
| 43_ | `orderPlanningGap.get` | `{company,country,marketplace(,sku)}` | materialized T1–T4 gap/suggested rows |
| 52_ | `openPoRemaining.raw.get` | `{skus, scope?}` | `openPoRemainingRawQty` |
| 53_ | `fcSummary.raw.get` | `{planning_cycle, scope, skus}` | `basicFcRawT3Qty` / `specialEventFcRawQty` |
| 54_ | `rawInventory.get` | `{scope, skus}` | `siteStockRawQty` / `overseasStockRawQty` / `factoryStockRawQty` |
| 55_ | `leadTime.raw.get` | `{skus, scope?}` | `leadTimeDays` |
No `AI_PLAN_COMPOSER_PREREQUISITE_MISSING`.

## §3 Composition strategy — BACKEND COMPOSER (chosen)
**`56_api_v1_ai_plan_first_layer.gs`**, action **`aiPlanFirstLayer.get`**. ONE bounded page read (no N+1). It REUSES the
frozen pure fact functions of 52_/53_/54_/55_ (all global in Apps Script) — `oprLineRemaining_`, `fcrParseCycle_`/
`fcrWindow_`/`fcrBasicRawT3_`/`fcrSpecialRawQty_`/`fcrEventScopeMatch_`, `rivSiteStock_`/`rivOverseasStock_`/`rivPick_`,
`ltoLeadTimeForSku_` — and duplicates NO owner arithmetic. It only (a) builds the SKU-scope indexes those functions take,
(b) iterates `marketplace_skus` for identity, and (c) maps each owner's "raw fact 0/absent" to the browser's DISPLAY
`null` convention. Frontend composition was rejected: the identity rows (`marketplace_skus`+`sku_details`) have no scoped
owner, and per-site N calls would be N+1. Layer-2 (Gap/Recommendation) is NOT recomputed — it stays on its existing
scoped on-expand path.

## §4 Target DTO
`{ planningCycle, anchorMonth, windowMonths[], rows[], count }` where each `row` is byte-identical to a
`_buildRequestOrderRowsFromDb` row: identity (sku/country/marketplace/marketplaceId/category/series/company/boxSize) +
**Layer-1** (basicFcT3, specialEventsFc, siteStock, thirdPartyStock, factoryStock, totalOngoingOrders, leadTime) +
placeholders (risk/remaining/suggestedOrder = null, `_dbPlaceholder`). **Layer-2** (Gap/Suggested/Recommendation) is NOT
in this DTO — it stays on `orderPlanningGap.get`/`recommendation.workspace.get` (consumed on expand, painted via
`_opMatCache`). **Layer-3** (chosen qty/allocation/RO) stays on the draft flow.

## §5 planning_cycle authority (PDR-2)
`planning_cycle "RECO-YYYY-MM"` is REQUIRED and **client-resolved** from the SAME `_roTpeNow()` the browser window uses
(`_opFirstLayerCycle()` → `RECO-<TPE year>-<TPE month>`). The server NEVER uses its clock; the window is derived from the
cycle (53_ `fcrWindow_`). This is deterministic per request AND equals the legacy current-month window → BEFORE == AFTER.
Not `AI_PLAN_PLANNING_CYCLE_NOT_RESOLVED`.

## NULL-FIDELITY (the critical equivalence detail)
The first-layer render distinguishes `null` ("--") from `0` ("0"), and `specialEventsFc` is 3-way ("--"/"‑"/number); the
facts are ALSO written as snapshots into `request_order_allocation_draft_lines` (`item.siteStock`/`thirdPartyStock`/
`factoryStock`). So exact null-vs-number is required for BOTH display and write correctness. The composer preserves the
browser semantics EXACTLY: `basicFcT3`/`specialEventsFc`/`siteStock`/`thirdPartyStock` = `null` when the underlying rows/
match are absent (presence-checked) else the reused sum (incl 0); `totalOngoingOrders` = `null` when the open-PO
remaining is 0 (the browser `ongoing` is never 0); `factoryStock` = `Σ || 0` (never null); `leadTime` = the 55_ value
(null/number).

## §8/§9 Frontend cutover (`request-order.js`)
- Canonical primary read = `KM.DB.getAiPlanFirstLayer({planning_cycle})` (db-api helper over the scoped read transport)
  → `requestOrderState.data = data.rows` → render. Only the **data source** of `requestOrderState.data` changed; ALL
  render/filter/category-tab/pagination/second-layer/allocation-snapshot logic is untouched → whole-page BEFORE == AFTER.
- **No broad Operation DB in the canonical first-layer path** (proven: `_opLoadFirstLayerComposer_` contains no
  `getOperationDb`/`loadOperationDb`/`_opDbCache`). On failure → bounded region ERROR (`_opFirstLayerError_`) — **no
  silent legacy fallback** (the broad load lives ONLY in the Legacy/kill-switch branch of `initRequestOrderSection`).
- Reuses `KM.loadState` (INITIAL_LOADING/READY/EMPTY/ERROR) on `ro-scroll-body`.
- **Kill switch** (canonical default ON): `window.KM_FLAGS.USE_AI_PLAN_FIRST_LAYER_COMPOSER = false` → legacy broad-cache
  path (mirrors the page's existing `USE_MATERIALIZED_GAP_READ` flag).
- **Secondary same-page surfaces** (Edit Target % / FC Update / forecast breakdown — all reachable ONLY from an expanded
  row) still read the broad cache; it is **lazy-loaded on first expand** (`_roToggleRowByKey`), so the first-layer never
  depends on the broad DB while the secondary panels keep working. (Migrating those surfaces is a documented follow-up.)

## §10 Legacy browser first-layer functions — status
`_buildRequestOrderRowsFromDb` (+ its nested `basicT3`/`siteStock`/`thirdParty`/`ongoing`/`leadTime` and the module
`_roSpecialEventsTotal`/`factoryBySku` accumulation) = **DORMANT_LEGACY_ONLY** (retained solely for the kill-switch
path; NOT called in canonical mode). Not removed: they back the kill switch and (`_roSpecialEventsTotal` + event helpers,
`_roParseDate`, `_roNextMonths`/`_roMonthWindow`/`_roTpeNow`) are shared by other same-page surfaces; deletion is deferred.

## §11 `_opMatCache`
BEFORE role = transient client cache of the canonical materialized-gap DTO (Suggest Order repaint, second-layer).
AFTER role = **UNCHANGED** — it is NOT the first-layer factual authority (first-layer = composer). Remaining consumers =
the second-layer expand (Suggest Order/gap). It holds canonical values verbatim (not a second engine).

## §12 Writes / refresh
All write APIs/payloads unchanged. The allocation-draft snapshot writes now read the composer rows (byte-identical → same
persisted snapshots). The page triggers NO broad Operation DB reload for the first-layer post-write (writes update the
second-layer; `initRequestOrderSection` re-runs the scoped composer). The shared `KM.DB.*` writers still internally
`loadOperationDb({force:true})` — the known **Batch-F** debt (not rewritten here).

## §13/§14 BEFORE == AFTER (master gold-standard)
`api-ai-plan-first-layer-composer-f1-7e-prereq5-r1.test.js` **154/0**. The harness runs the **actual** browser
`_buildRequestOrderRowsFromDb()` (extracted; `window.KM.DB` stubbed with the ACTUAL db-api normalizers; `_roTpeNow` frozen
== `planning_cycle`) and the **actual** backend composer `aplBuild_()` over the raw rows, comparing EVERY row field
(sku/country/marketplace/marketplaceId/category/series/company + basicFcT3/specialEventsFc/siteStock/thirdPartyStock/
factoryStock/totalOngoingOrders/leadTime + boxSize/_dbPlaceholder/risk/remaining/suggestedOrder). Covered: single/
multi-SKU, KM/ResTW/ResUS, shared factory (GA0450 pool 1000 for ResTW & ResUS rows), regular/special/both FC,
site/overseas/factory present + absent (null vs 0), open-PO persisted + legacy fallback, closed-PO exclusion, lead-time
valid + null, zero-FC (0 not null), no-data (all null), year-crossing cycle, empty result, planning_cycle window
derivation, and API-error envelope. Plus frontend guards: db-api helper, canonical-default + kill switch, client cycle
resolution, init routing, composer path has no broad DB, fail-closed (no legacy fallback), KM.loadState, lazy secondary
load. **No quantity drift.**

## §16 app.js prime / broad-cache pages
Unchanged (KEEP). **request-order.js first-layer independent = YES.** Remaining broad-cache surfaces: request-order.js's
SECONDARY panels (lazy) + ≈10 other pages (fc-summary.js, inventory, etc.). Global-prime removal stays Batch F.

## §17 Tests / regression
PREREQ-5 suite **154/0**; PREREQ-1 28/0, PREREQ-2 40/0, PREREQ-3 46/0, PREREQ-4 27/0; recommendation/gap/order-planning +
RO/PO workspace + foundation/loading/router + procurement suites green. **Full regression: 224 files, only the 4 known
baseline failures (none new).** Bundle unchanged (`aaf5b07`, --check PASS).

## §18/§19 Deployment contract + cumulative Apps Script sync checklist
- **PRE HEAD** `293f484` · **POST HEAD** = this commit.
- **Apps Script sync: YES.** Deploy order: (1) sync `.gs`, (2) NEW `/exec` version, (3) verify all routes live, (4)
  deploy frontend, (5) canonical default ON.
- **⚠ CUMULATIVE APPS SCRIPT SYNC CHECKLIST (PREREQ-1..5 may not have been individually deployed — sync ALL together):**
  `52_api_v1_open_po_remaining_owner.gs` · `53_api_v1_fc_summary_raw_owner.gs` · `54_api_v1_raw_inventory_owner.gs` ·
  `55_api_v1_lead_time_owner.gs` · `56_api_v1_ai_plan_first_layer.gs` · `01_router.gs` (dispatches all six new actions +
  the pre-existing 42_/43_). The 42_/43_ owners are already deployed. A NEW `/exec` version MUST include all of the
  above BEFORE the canonical-ON frontend calls `aiPlanFirstLayer.get`.
- **New `/exec` deployment: YES.** **Frontend deploy: YES** — `request-order.js` + `operation-system-db-api.js`
  (`index.html`/`km-api-foundation.js` unchanged — the composer uses `KM.DB`, not a foundation workspace, so no registry
  change). **Bundle rebuild: NO** (`56_` not a bundle source). **DB/schema: NONE.**
- **⚠ DEPLOY ORDERING:** canonical is ON by default, so the frontend calls `aiPlanFirstLayer.get` immediately. Deploy the
  backend (`52_`–`56_` + router, new `/exec`) FIRST; if the frontend ships first the first-layer fails-closed with a
  bounded read error (never Legacy, never silent) until the backend is live — or hold with the kill switch
  `window.KM_FLAGS.USE_AI_PLAN_FIRST_LAYER_COMPOSER = false`.
- **API contract delta:** +1 route `aiPlanFirstLayer.get` (new composer); no existing route/DTO changed.
- **Rollback:** revert this commit; or runtime kill switch `window.KM_FLAGS.USE_AI_PLAN_FIRST_LAYER_COMPOSER = false` →
  instant legacy broad-cache first-layer (no deploy).

## Prerequisite status
PREREQ-0 DONE · PREREQ-1 DONE · PREREQ-2 DONE · PREREQ-3 DONE · PREREQ-4 DONE · **PREREQ-5 DONE**. **AI Plan first-layer
scoped read = DONE.** (Full system API migration is NOT complete — Shipment/On-the-Way + the ~40-writer WRITE_FORCES_
FULL_RELOAD + app.js global prime + request-order.js secondary surfaces remain.) F1-PHASE1-LIVE-ACCEPTANCE-R2 =
PAUSED_BY_USER_FOR_API_MIGRATION (unchanged).

## FINAL GATE — PASS
First-layer primary render = scoped composer ✓ · all Layer-1 facts from 52_/53_/54_/55_ ✓ · Layer-2 from 43_/42_ ✓ ·
Layer-3 unchanged ✓ · no broad Operation DB for first-layer assembly ✓ · BEFORE == AFTER (154/0 whole-row) ✓ · no frontend
parallel business math in canonical mode ✓ · no silent broad fallback ✓ · no new regression failures ✓.

**Exact next slice:** Shipment / On-the-Way migration, OR retire the DORMANT legacy first-layer functions + migrate
request-order.js's SECONDARY surfaces (Target Rules / forecast breakdown) off the broad cache, OR Batch-F (retire the
~40-writer WRITE_FORCES_FULL_RELOAD + app.js global prime). Do NOT begin automatically.
