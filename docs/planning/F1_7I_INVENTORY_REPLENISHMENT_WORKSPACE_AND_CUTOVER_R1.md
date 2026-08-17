# F1-7I-INVENTORY-REPLENISHMENT-WORKSPACE-AND-CUTOVER-R1 — Inventory Replenishment scoped workspace + primary-render cutover

**Outcome: IMPLEMENTED (transport/read-model migration; BEFORE FACT == AFTER FACT).** Baseline HEAD `5b3c377`. The active
Inventory Replenishment page (`inventory-replenishment.js`) now renders its PRIMARY surface (the main replenishment table)
from ONE scoped `inventoryReplenishment` workspace — no broad Operation DB for the primary render, scoped post-write
refresh, fail-closed on error. **This was the LAST registered-only workspace → 0 registered-only remain.** No replenishment
business flow, inventory/incoming semantics, Gap/Recommendation authority, Add-SKU/Factory-Stock/marketplace-SKU boundary,
or Flow-A domain boundary changed.

## §0 Audit — primary read model + already-scoped facts
- **PRIMARY render** = `renderReplenishment()` → `getReplenishmentData()` → **`_getCloudReplenishmentData()`**, which assembles
  the main table from ~19 tables read through a single local `get(name)` choke point. The broad load
  (`loadOperationDb({force:true})`) was forced on **Search** (js:3614).
- **ALREADY scoped (unchanged, not duplicated):** Inventory Gap → `inventoryReplenishmentGap.get` (authoritative, no client
  math); Recommendation → `recommendation.workspace.get` (velocity/diagnostic); allocation-draft SSOT →
  `getShippingAllocationDraftWorkspace`.
- All main-table facts classified DISPLAY/FORMAT/FILTER/READ_MODEL_ASSEMBLY over persisted rows — except the incoming
  reconstruction (§8) and the 18-day 3PL `sitePlanningAllocation` (both frontend legacy-parallel/planning math, preserved).

## §1/§18 FLOW-A domain boundary — PROVEN (Inventory ≠ Procurement)
The page and the new workspace create **NO Request Order / Purchase Order / Order-Planning-Gap / AI-Plan ordering** (grep:
zero hits for `createRequestOrder`/`requestOrderDraft`/`orderPlanningGap.get`/`aiPlanFirstLayer`). The downstream execution
chain is preserved: Replenishment Recommendation → **Shipping Plan** (`submitReplenishmentPlans` → `createShippingPlansBatch`,
the Weekly Shipping Plan canonical runtime) → Shipment → FIFO of EXISTING PO lines. Request Order stays in the separate
Procurement flow. Mandatory Flow-A regression guard asserted in the test.

## §2 Frozen quantity authorities — unchanged
site inventory / overseas-3PL / factory stock / incoming / inventory gap / replenishment recommendation / shipping
allocation draft / Shipping Plan approved qty / shipment physical qty / shipment_line_allocations / PO shipped_qty /
PO remaining_qty / receipt qty — all reused from their current owners. No new allocation engine; `60_` computes none of them.

## §8 Incoming-inventory authority — `INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED` (scoped, DEFERRED)
The frontend `_irBuildShipmentRemainingByReceiver` reconstructs a canonical incoming fact:
`remaining = MAX(0, shipment_qty − shipment_received_qty)` (terminal shipments + fully-received lines → 0), ETA-day
mutually-exclusive buckets (0-18/19-30/31-45/45+/overdue), and receiver attribution via the FROZEN
`shipping_plan_line → shipping_plan` lineage (fail-closed on unresolved; header scope on blank; MULTI/merged excluded) —
entirely in the browser from `shipments` + `shipment_lines` + `shipping_plan_lines` + `shipping_plans`. **No backend
authority exposes the same fact:** `shipment.workspace.get` (57_) deliberately leaves remaining/receiver-attribution
presentation-side (aggregates shipment-level sums only); `recommendation.workspace.get` exposes a *different* planning
`qualifiedIncomingQty`. The code itself self-flags `MERGED_SHIPMENT_FROZEN_SHARE_AUTHORITY_GAP` /
`SHIPMENT_OVERDUE_BUCKET_AUTHORITY_GAP`. Building a new canonical incoming owner (to move MAX(0,…) + ETA bucketing +
lineage attribution server-side) is a **receipt/incoming-inventory semantics redesign** → per §8, DEFERRED (not mixed into
a transport cutover). The reconstruction stays presentation-side over the **scoped** raw shipment/line/plan rows →
BEFORE == AFTER. §20 permits this ("incoming-receipt formula *if backend-owned*" — it is not; "display-only math is allowed").
(The 18-day `sitePlanningAllocation` 3PL virtual-pool allocation is a related frontend planning computation, likewise
preserved verbatim — a separate deferred allocation-authority item; §19 forbids changing allocation semantics here.)

## §3/§4/§5/§6 Inventory Replenishment workspace (NEW backend `60_api_v1_inventory_replenishment_workspace.gs`)
Action `inventoryReplenishment.workspace.get` (router dispatch added). Reads ONLY the 19 tables the main-table assembly
consumes — **never `getOperationDb`**: marketplaces, marketplace_skus, sku_details, warehouses; amazon_inventory_snapshot,
amazon_inventory_health_snapshot, amazon_daily_sales_snapshot, amazon_weekly_sales_snapshot; fc_regular_forecast,
fc_target_rules, fc_special_events; overseas_inventory_snapshot, factory_stock; shipments, shipment_lines, shipping_plans,
shipping_plan_lines; shipping_allocation_drafts, shipping_allocation_draft_lines. It is the LARGEST workspace because the
main table is genuinely a broad read model; it still bounds the read to exactly this page's 19 tables (vs the ~44-tab
getOperationDb) and removes the global-cache dependency. **Input grain:** `{ include? }`. **Output grain:** raw passthrough
keyed by table name + `summary`/`capped`/`counts`. **FULL-SET by design (BEFORE == AFTER):** the page derives scope
(Country + Marketplace → Company) and filters/assembles per-SKU rows client-side; reproducing that scope filter server-side
would risk drift, so the workspace returns raw passthrough (non-silent `capped` backstop) and the client assembly runs
unchanged. Authors NO Gap/Recommendation/allocation/FIFO/PO/incoming logic and creates NO Request Order (source-guarded).

## §7 Inventory facts (all READ_MODEL_ASSEMBLY over raw rows; unchanged)
Site (`IRMap.stockCard` = available+fc_transfer+fc_processing, latest snapshot), Overseas (`IRMap.thirdPartyStock` +
`sitePlanningAllocation`), Factory (`IRMap.factoryByCountry` Σ current_stock by CN/TW; shared-factory pure per-SKU sum,
no company gating), Incoming (§8). RAW ≠ ALLOCATED ≠ RECOMMENDED preserved — the workspace transports raw rows only and
subtracts no Gap.

## §9 Gap / Recommendation — reused, not recomputed
The workspace runs no Gap and no Recommendation and does NOT read Order Planning Gap or the AI-Plan composer. Inventory Gap
stays on `inventoryReplenishmentGap.get`; Recommendation on `recommendation.workspace.get` (Inventory product isolation
preserved).

## §13/§14/§16 Frontend cutover (`inventory-replenishment.js`)
- `_irEffectiveWorkspace()` gates on canonical `inventoryReplenishment`; `_irReadModel` sourced from
  `KM.api.getWorkspace('inventoryReplenishment')` → `KM.DB.adaptInventoryReplenishmentWorkspace` (keyed by getter name).
  **Single choke point:** the main-assembly local `get(name)` now returns `_irReadModel[name]` in Workspace mode (else the
  legacy getter); `_replenActiveMarketplaces` routes through `_irWsGet('getMarketplaces')` → the filter dropdowns + main
  render need NO broad Operation DB.
- **Mount** fetches the scoped workspace then populates filters + renders (fail-closed via `_irRenderError_` /
  `INVENTORY_REPLENISHMENT_READ_FAILED`); **Search** re-uses the read-model (fetches if absent) — the broad load lives ONLY
  in the Legacy branch (**no silent fallback**). `KM.loadState.createRegion` bounded region. Kill switch
  `setWorkspaceEnabled('inventoryReplenishment', false)` → instant Legacy.
- **Post-write** `_irAfterWrite(cb)` — Workspace mode a SCOPED re-read then re-render; wired into the SKU writes (Add ×2 +
  Edit). Allocation-draft/gap-job writes keep their existing scoped readbacks.
- **SECONDARY surfaces** (expand-panel Monthly Achievement + Execution-Plan carrier method-rec, Add-SKU/Marketplace/Edit
  modal dropdowns) keep reading the app-primed broad cache — documented secondary detail (§14).

## §10/§19 Add-SKU + Factory-Stock + shared-factory boundaries — unchanged
Add SKU → `importMarketplaceSkusBatch` (marketplace_skus + pricing_list + fc_regular_forecast); **never factory_stock**
(Factory Stock init stays with master-SKU creation). Shared factory: the raw factory pool is summed per SKU with no
company/factory inference; allocation stays company/site-scoped by the existing canonical rules (unchanged).

## §15 Writes / refresh
| Write | Owner | Post-write refresh |
|---|---|---|
| Add SKU (`importMarketplaceSkusBatch` / fallback `upsertMarketplaceSku`) | 03_ | scoped `inventoryReplenishment` re-read |
| Edit SKU (`updateMarketplaceSkuModel`) | 03_ | scoped re-read |
| Allocation draft upsert/cancel | 16_ | existing scoped `getShippingAllocationDraftWorkspace` readback |
| Submit Plan (`createShippingPlansBatch`) | shipping-plan runtime | navigates to Shipping Plan |
| Recalc gap job | 46_ | existing scoped gap re-read (`refreshInventoryGapAfterRecalc_`) |
Write API/payload/authority unchanged. **Boundary:** the shared `KM.DB.*` writers still `loadOperationDb({force:true})`
INTERNALLY — the ~40-writer **Batch F** debt (not fixed here).

## §17 BEFORE == AFTER (gold-standard)
`api-inventory-replenishment-workspace-f1-7i-r1.test.js` **66/0**: backend raw passthrough of all 19 tables (rows verbatim
— shipment_received_qty NOT recomputed), orchestrator reads exactly 19, non-silent `capped`; the db-api adapter maps every
table→getter with the SAME normalizer + filter as `normalizeOperationDb` (end-to-end equivalence for the inventory/stock
facts + masters + shared-factory raw pool + HS/junk-row filter parity; full 19-pair wiring proof); frontend read-model
routing (`get()`/`_irWsGet`/`_replenActiveMarketplaces` swap source); source guards (60_ read-only, no getOperationDb, no
Gap/Reco/FIFO/allocation-compute/factory-init/incoming MAX(0,..)); **FLOW-A guard** (no Request Order / Order Planning Gap /
AI Plan; downstream = createShippingPlansBatch); Gap/Reco/allocation-draft owners unchanged; incoming reconstruction
retained presentation-side.

## §21/§22 app.js prime / tests / regression
- app.js prime unchanged (KEEP). **Inventory Replenishment PRIMARY render independent of broad DB: YES.** Secondary
  expand-panel/modal surfaces still read the app-primed broad cache (documented). Remaining broad-cache pages ≈ 6.
- New F1-7I suite **66/0**. Contract tests repointed to a synthetic `customWs` (no registered-only workspace remains):
  foundation R3b/R6/F2/F3/L4, compat NS1/NS2/FF4, weekly CR2/OW1, recommendation-cutover A6. **Full regression: 229 files,
  only the 4 known baseline failures (none new).** Bundle unchanged (`aaf5b07`, --check PASS).

## §23 Deployment / version
- **PRE HEAD** `5b3c377` · **POST HEAD** = this commit.
- **Apps Script sync: YES — `60_api_v1_inventory_replenishment_workspace.gs` (new) + `01_router.gs` (new dispatch).**
- **New `/exec` deployment: YES** — deploy the **backend FIRST** (canonical-ON), then the frontend, or hold with the kill
  switch. If the frontend ships first, the page fails-closed with a bounded read error (never Legacy, never silent) until
  the backend is live.
- **Frontend deploy: YES** — `km-api-foundation.js`, `operation-system-db-api.js`, `inventory-replenishment.js`.
  **Bundle rebuild: NO** (`60_` not a bundle source). **DB/schema: NONE.**
- **API contract delta:** +1 route `inventoryReplenishment.workspace.get`; no existing route/DTO changed.
- **Rollback:** revert this commit; or runtime kill switch `KM.api.setWorkspaceEnabled('inventoryReplenishment', false)` →
  instant Legacy broad-cache primary render (no deploy).

## §24 Workspace status
IMPLEMENTED/canonical = weeklyShipping · recommendation · purchaseOrder · requestOrder · shipment · fcSummary · skuDetails ·
**inventoryReplenishment**. **REGISTERED-only workspace count = 0.** Every registered page workspace is now scoped-read
canonical. (Full system migration NOT complete — secondary surfaces + Batch F remain.)

## FINAL GATE — PASS
Inventory Replenishment primary render = scoped API ✓ · Inventory Gap / Replenishment Recommendation remain canonical
(reused, not recomputed) ✓ · Flow A = Gap → Recommendation → Shipping Plan → Shipment, NOT Request Order ✓ · inventory /
incoming facts preserve current semantics ✓ · Factory Stock / marketplace-SKU boundaries unchanged ✓ · BEFORE == AFTER
(adapter = SAME normalizers + filters; 66/0) ✓ · no broad Operation DB required by the primary path ✓ · no silent fallback
✓ · no new regression failures ✓.
**Carve-out:** the incoming-inventory reconstruction remains presentation-side, deliberately, as
`INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED` (a deferred, separately-authorized receipt-semantics redesign) — its facts
are unchanged (§20-compliant).

**Inventory Replenishment scoped read: DONE.**

**Exact next slice:** the DEFERRED **incoming-inventory authority redesign** (move MAX(0, qty−received) + ETA bucketing +
shipping-plan-lineage receiver attribution to a canonical backend owner); OR the deferred secondary surfaces
(sku-regional-details.js; fc-summary.js Event Assist redesign; request-order.js secondary panels;
inventory-replenishment.js expand-panel Monthly Achievement / Execution Plan); OR **Batch F** (retire the ~40-writer
WRITE_FORCES_FULL_RELOAD + app.js global prime). Do NOT begin automatically.
