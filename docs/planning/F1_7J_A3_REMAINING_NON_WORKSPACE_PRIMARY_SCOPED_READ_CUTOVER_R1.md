# F1-7J-A3-REMAINING-NON-WORKSPACE-PRIMARY-SCOPED-READ-CUTOVER-R1 — Final primary broad-read cutover (6 pages)

**Outcome: TRANSPORT / READ-MODEL only. BEFORE FACT == AFTER FACT. No new business authority, no formula change, no
writer-reload change, no app.js prime removal, no schema change. FRONTEND-ONLY (reuses the existing `getTable` action —
NO .gs / router / /exec change).** Baseline PRE HEAD `b08be3c`. Migrates every ACTIVE_PRIMARY non-workspace broad
Operation-DB read + the last legitimate app-prime-dependent surface (SKU Handbook) onto ONE bounded scoped read.

## §0 Pre-edit master audit (source-grounded, HEAD b08be3c)
Active `loadOperationDb` call sites by class: **ACTIVE_PRIMARY = 5** (factory-stock:22, overseas-stock:34,
overseas-ops-preview:47, campaign-risk:596, carrier-rate-card:240) · ACTIVE_SECONDARY = 2 (request-order 2nd-layer expand,
fc-summary builder modals) · BACKGROUND = 2 (app.js:382 prime, sku-details:2082 manual refresh) · WRITE_REFRESH ≈ 47
(operation-system-db-api.js writer success paths) · LEGACY_ONLY = 8 (kill-switch branches of the cut-over workspace pages
+ sku-regional-details:692). **ACTIVE_PRIMARY non-workspace pages = 6** (the 5 above + **sku-handbook.js**, which has NO
self-load → app-prime-dependent). **App-prime-dependent surfaces = 2**: sku-handbook.js (`getSkuKnowledgeItems`) + IR
`_hydrateAllocationDraftFromDb` (bare broad getters — HALT E, out of scope). **sku-regional-details.js confirmed
LEGACY_ONLY** (no remaining ACTIVE_PRIMARY broad path after F1-7J-A).

## §1 The enabler (reuse, no new API)
`KM.DB.loadScopedTables(tableNames)` (operation-system-db-api.js): fetches ONLY the named tables via the EXISTING generic
`getTable` GET action (`getOperationDbTableFromSheet`), assembles a partial rawDb, and runs the SAME `normalizeOperationDb`
per-table logic → a `_opDbCache`-shaped object with exactly those tables populated (byte-identical to the broad getters,
because it's the identical normalizer + per-array filter) and every other table `[]`. `normalizeOperationDb` is fully
defensive (`db.X || []`), so a partial input is safe. **NEVER mutates the global `window._opDbCache`** — the caller holds
it as a page read-model. Rejects on transport error → the page renders a bounded state, NEVER a silent broad fallback.
Proven: `normalizeOperationDb(partial).factoryStock == normalizeOperationDb(full).factoryStock` (and `.campaigns == []` for
a table absent from the scoped set).

## §2–§8 Per-target cutover (all BEFORE==AFTER, same read-model-first pattern)
Each page: `_xScopedActive()` (cloud mode + `loadScopedTables` present + `window.KM_SCOPED_PAGE_READS !== false` kill
switch) · `_xReadModel` · read-model-first accessor (`_xGet(key)` derives the getter name from the cache key; the scoped
object is `_opDbCache`-shaped) · canonical mount does a bounded scoped load (fail-closed; Legacy kill-switch keeps the broad
`loadOperationDb`) · writing pages add `_xAfterWrite` (scoped re-read; writer payloads/side effects UNCHANGED).

| §  | Page | Scoped tables | Writes → post-write |
|----|------|---------------|---------------------|
| §2 | **factory-stock.js** | factory_stock, factory_stock_movements, sku_details, warehouses | adjustFactoryInventory, factoryInventory import → `_fsAfterWrite`. **Factory stays NOT company-owned** (shared-factory pool summed as-is; no factory→company inference; no Factory Stock init change — proven: both company rows preserved). |
| §3 | **overseas-stock.js** | overseas_inventory_snapshot, overseas_inventory_movements, warehouses, sku_details | adjustOverseasInventory, importOverseasInventorySnapshotBatch → `_osAfterWrite`. Raw overseas inventory stays DISTINCT from site/sitePlanning/incoming. |
| §4 | **overseas-ops-preview.js** | warehouses, overseas_inventory_snapshot, shipments, shipment_lines | none (PREVIEW — nothing posted). Own read grain (shipments+lines, NOT identical to overseas-stock). |
| §5 | **campaign-risk.js** | campaigns, campaign_sku_lines, marketplace_skus, sku_details, marketplaces | read-only tracker (`_crDB()` choke point returns a scoped shim). `calculateSkuRisk` untouched (transport only). |
| §6 | **carrier-rate-card.js** | carrier_rate_cards, carriers, carrier_lead_times | importCarrierRateTemplate → `_crcAfterWrite`. This page's OWN bounded owner (NOT coupled to the A2 IR `carrierPlanning` include). CRUD payloads / effective dates / method identity unchanged. |
| §8 | **sku-handbook.js** | sku_details, product_features, sku_handbook_summaries | read-only. Knowledge merge reuses the SAME `buildSkuKnowledgeItems` as the broad getter (BEFORE==AFTER proven). **Fail-closed: canonical-but-not-loaded returns `[]`, NEVER a silent broad read.** Renders correctly with empty `_opDbCache`. |

## §9 SKU Regional status — LEGACY_ONLY (unchanged)
Confirmed: after F1-7J-A, sku-regional-details.js canonical path reads `getWorkspace('skuDetails',{include:{regional:true}})`;
its `loadOperationDb` (:692) is the Legacy kill-switch `else if`. No remaining ACTIVE_PRIMARY broad path. Not rebuilt.

## §10–§12 Secondary authority debts (unchanged) & §11 Batch-F blocker reconciliation (source-grounded)
Incoming Inventory, sitePlanningAllocation, FC Event Assist, IR allocation-draft hydrate, RO 2nd-layer expand, FC
builder/import modals — all left byte-identical. **Canonical Batch-F definition:** replace the ~47 writers' post-write
`await loadOperationDb({force:true})` with scoped reconciliation.

| ITEM | BLOCKS_BATCH_F? | BLOCKS_APP_PRIME_REMOVAL? | REASON (source) |
|---|---|---|---|
| Incoming Inventory reconstruction | **NO** | **NO** | Reads via the IR scoped `get()` choke point (scoped `_irReadModel` / self-loaded Legacy); freshness from IR's own scoped re-fetch, NOT `updateShipmentReceipt`'s full reload. `_irBuildShipmentRemainingByReceiver` (inventory-replenishment.js:80). |
| sitePlanningAllocation 18-day 3PL pool | **NO** | **NO** | Display-only virtual calc (no movement/reserve/write); inputs via the scoped `get()`. `IRMap.sitePlanningAllocation` (:708). |
| FC Event Assist | **NO** | **NO** | Preview compute + write reconciled via scoped `_fcAfterWrite`; no consumer needs the writers' full reload for this fact. (fc-summary.js:3026/3225). |
| IR allocation-draft hydrate | **NO** | **YES** | Reads bare broad `getShippingAllocationDrafts()/…Lines()` (inventory-replenishment.js:2511-2512) → app-prime-dependent; but its writers use `_kmWeeklyCommand_` (NO whole-DB reload) → removing writer reloads changes nothing for this fact. |

**0 of the 4 deferred authority debts technically block Batch F.** Only the IR allocation-draft hydrate blocks **app.js
prime removal** (the sole remaining bare-broad-getter read). This corrects F1-7J-A2 §19's implication that these
authority items are Batch-F prerequisites — they are NOT (Batch F is gated only on the writer-invalidation work itself).

## §16 Debt recount (exact, PRE = A2 POST → POST = A3)
| Metric | PRE | POST | Note |
|---|---|---|---|
| ACTIVE_PRIMARY non-workspace broad surfaces | 6 | **0** | all 6 pages scoped (5 loadOperationDb + sku-handbook app-prime) |
| ACTIVE_PRIMARY `loadOperationDb` call sites | 5 | **0** | moved to LEGACY_ONLY (kill-switch branch) |
| LEGACY_ONLY `loadOperationDb` sites | 8 | **13** | +5 (the migrated pages' Legacy branches) |
| ACTIVE_SECONDARY broad | 2 | 2 | request-order expand, fc-summary modals (self-heal; out of scope) |
| BACKGROUND | 2 | 2 | app.js prime, sku-details manual refresh |
| WRITE_REFRESH (writer full reload) | 47 | **47** | untouched (asserted) |
| app-prime-dependent surfaces | 2 | **1** | sku-handbook resolved; only IR allocation-draft hydrate remains (HALT E) |

**`ACTIVE_PRIMARY_BROAD_DB_DEPENDENCY = 0` — §12 PASS target met.** `APP_PRIME_READ_DEPENDENCY = 1` (allocation-draft
hydrate).

## §12/§20 Readiness
- **Batch F ready? YES** (no authority blocker; it is the writer-invalidation work itself — a separate round F1-7K).
- **app-prime removal ready? NO** — 1 hard blocker (IR allocation-draft hydrate, HALT E) + the broad `loadOperationDb` is
  still used by the 2 ACTIVE_SECONDARY lazy surfaces, the 13 Legacy kill-switch branches, and the 47 writers. app.js prime
  removal (F1-7L) is gated on resolving the allocation-draft hydrate (or accepting sessionStorage-only working draft) and
  the secondary lazy reads.

## Delivery
- **Files changed** — runtime: operation-system-db-api.js (loadScopedTables) + factory-stock.js, overseas-stock.js,
  overseas-ops-preview.js, campaign-risk.js, carrier-rate-card.js, sku-handbook.js. Tests: NEW
  `api-non-workspace-primary-scoped-cutover-f1-7j-a3-r1.test.js` (49/0) + `overseas-inventory-scoped-import-f1-ux-r1`
  (harness gains `_osGet`). Docs: this file + master-plan delta.
- **API contract delta** — NONE (reuses the existing `getTable` action; `loadScopedTables` is a frontend db-api helper).
- **Tests** — new 49/0; full regression **232 files, only the 4 known baselines** (`gap-job-done-notice-f1-small-r1`,
  `order-planning-monthly-projection-consumer-f1-4b-fm3d`, `replen-header-toggle`, `supply-planning-route-inventory`).
  Bundle unchanged (`aaf5b07…2782`).
- **Deployment** — **Apps Script sync: NO. Router change: NO. New /exec: NO. Bundle: NO. DB/schema: NONE.** Frontend deploy
  YES: operation-system-db-api.js + the 6 page files. Kill switch `window.KM_SCOPED_PAGE_READS = false` reverts all 6 pages
  to Legacy broad-cache (no deploy).
- **Rollback** — revert the commit; or the kill switch.
- **HALT/risk tokens** — none this round. `IR_ALLOCATION_DRAFT_SSOT_NOT_BEFORE_EQUALS_AFTER` (HALT E) remains deferred and
  is the sole app-prime-removal blocker.

**STOP after F1-7J-A3. Do NOT begin Batch F automatically. Do NOT remove app.js prime automatically. Do NOT begin authority
redesign automatically.**
