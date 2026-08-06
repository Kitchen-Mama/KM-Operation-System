# API v1 — Recommendation READ-ONLY Workspace (`recommendation.workspace.get`) — F1-4B-A (2026-08-06)

> **Status: IMPLEMENTED (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED).** One bounded read endpoint that exposes the
> already-complete production recommendation runtime (F1-5-A KMAF + F1-5-BD KMPCX + F1-4B-PRE KMPA + existing KMPS
> resolver). Pure READ boundary: no write, no persistence, no draft/plan/order/shipment/reservation/inventory row, no
> formula, no DB/schema/header change. Feature flags default **false** (infrastructure-only; no page cutover).

## Canonical action
- Action: **`recommendation.workspace.get`** (one action, one owner; no aliases). Workspace registry key: **`recommendation`**.
- Server owner: `assets/specs/active/apps-script/42_api_v1_recommendation_workspace.gs`; routed from `01_router.gs` `doPost`.
- Frontend: `km-api-foundation.js` registers `recommendation` (IMPLEMENTED + resolver); `KM.api.getWorkspace('recommendation', params)`.

## Request DTO
```
{ apiVersion:"1", action:"recommendation.workspace.get", requestId:"REQ-…",
  payload:{ scope:{company,country,marketplace}, destinationWarehouseId, calculationMonth:"YYYY-MM", planningCycle,
            filters:{sku?,siteSku?,category?,series?}, pagination:{page(1-based),size(≤100,default 50)}, include:{diagnostics:false} },
  context:{} }
```
Mandatory (validated **before any table read**): `scope.company/country/marketplace`, `destinationWarehouseId`,
`calculationMonth` (`YYYY-MM`), `planningCycle`. No implicit company/site/warehouse; no automatic destination; no
browser-current-month; no client formula / `demandDriver` / forecast-weight override (Phase-1 driver = FORECAST).

## Server flow (one-way; no formula/mapping/lifecycle in the router)
`doPost → 01_router → handleRecommendationWorkspaceGet_(body, io) → validate → io.openTarget() (exact Spreadsheet-ID
gate) → KMPS.readCanonicalSnapshots (targeted 11-table read, ONCE; never getOperationDb) → per in-scope SKU:
KMPA.assembleProductionRecommendationFacts → KMPS.buildProductionRecommendationSource (existing demand/supply ledger →
allocator → resolver) → aggregate → map/filter/sort/paginate → canonical envelope`. The runtime is per-SKU (the
shipment lifecycle scope carries one masterSku), so the endpoint loops SKUs internally — **one HTTP request, no
per-SKU HTTP**. Injectable `io` makes the handler testable with zero SpreadsheetApp.

## Response DTO (only source-proven runtime outputs)
```
{ success:true, data:{ scope:{…,destinationWarehouseId,calculationMonth,planningCycle},
  lines:[{ sku, siteSku, destinationWarehouseId, currentStockQty, qualifiedIncomingQty, calculatedGap, recommendedQty,
           blocked, blockedReason, formulaVersion, sourceDataAsOf, diagnostics:{issues:[]} }],
  pagination:{page,size,total,totalPages}, dataVersion:{formulaVersion,sourceDataAsOf} },
  meta:{ apiVersion:"1", source:"recommendation.workspace.get", mode:"WORKSPACE", requestId, cached:false, tablesRead, serverDurationMs }, errors:[] }
```
- **currentStockQty** = Σ `CURRENT_STOCK` supply source entries for the SKU (projection F1-3 output).
- **qualifiedIncomingQty** = Σ `SHIPPED_IN_TRANSIT` supply source entries for the SKU (projection F1-3 output).
- **calculatedGap** = the productionRequest planning fact's gap (KMPA attached it via the frozen `KMCALC.calculateGap`).
- **recommendedQty** = the existing resolver's carton-FLOOR output. **Forbidden/omitted:** projectedInventory, coverage,
  daysOfSupply, LOW/OK/CRITICAL, ORDER/TRANSFER/BORROW/NO_ACTION, final Request Order Qty, reservation/draft state.

## Tables read (targeted; via `KMPS.readCanonicalSnapshots`)
`sku_details` (units_per_carton), `marketplace_skus` (sku/site_sku/fulfillment_model/scope), `warehouses`
(id/type/is_active/company/is_factory_warehouse), `marketplaces` (allocation_priority), `fc_regular_forecast`
(month cols + year), `fc_special_events`, `amazon_inventory_snapshot`, `overseas_inventory_snapshot`, `factory_stock`
(current stock), `shipping_plans`, `shipments` (qualified incoming via F1-3). **11 targeted tables — never
`getOperationDb`, never a 44-table load.** (The internal per-SKU `buildProductionRecommendationSource` re-reads the
same bound spreadsheet; classification `TARGETED_RECOMMENDATION_READ_READY`, `LIVE_LATENCY_UNVERIFIED`.)

## Errors (structured; never a raw throw; missing source ≠ fake zero)
`VALIDATION_FAILED` · `MISSING_DESTINATION_WAREHOUSE` · `MISSING_CALCULATION_MONTH` · `MISSING_PLANNING_CYCLE` ·
`UNSUPPORTED_PHASE1_DEMAND_DRIVER` · `MISSING_SKU_MAPPING` · `MISSING_FORECAST_WEIGHT_SOURCE` ·
`DESTINATION_NOT_ELIGIBLE` · `PLANNING_CONTEXT_NOT_READY` · `ALLOCATION_FACTS_NOT_READY` · `SUPPLY_LINEAGE_CONFLICT` ·
`WRONG_SPREADSHEET_TARGET` · `RECOMMENDATION_RUNTIME_BLOCKED` · `PRODUCTION_RECOMMENDATION_SOURCE_INCOMPLETE`.
A legitimate runtime-calculated zero is a **successful zero**; a filter that matches no in-scope SKU is a **successful
empty page**; a scope with no marketplace_skus is `MISSING_SKU_MAPPING`.

## Feature flags (production default false; infrastructure-only)
`USE_WORKSPACE_API = false` (master); `WORKSPACE_ENABLED.recommendation = false`. master OFF → legacy; master ON +
recommendation OFF → legacy; master ON + recommendation ON → workspace. No dual execution; no silent legacy fallback
after a workspace request starts. **No active page is connected this round.**

## Safety
Exact target-ID gate before any read; zero Sheet writes (setValues/appendRow/insert/delete/clear/insertSheet never
invoked); no header/sheet creation/repair; no migration; no LockService; no reservation/deduction; no draft/Submit; no
live DB in tests. Read-only over the existing bundled runtime.

## Not this round (F1-4B-B and later)
Inventory Replenishment page cutover; Coverage/DOS/Projected Inventory; Reason/Status tokens; persistence; Submit;
global bootstrap optimization.

---

# F1-4B-FM1-T ADDENDUM — Unified Destination Transport (SCOPE-ONLY read; server-owned destination + calc context) (2026-08-06)

> **Status: IMPLEMENTED (SOURCE PRESENT / TEST VERIFIED — NOT DEPLOYED; `TARGETED_RECOMMENDATION_FANOUT_READY`,
> `LIVE_LATENCY_UNVERIFIED`).** The endpoint is refactored from "one warehouse destination supplied by the client" to
> a **scope-only** read where the SERVER expands destinations (MARKETPLACE vs WAREHOUSE) and owns the calculation
> context. Supersedes the F1-4B-A request/response DTO above. Feature flags remain default **false**.

## Request DTO (SCOPE-ONLY — supersedes the F1-4B-A DTO)
```
{ apiVersion:"1", action:"recommendation.workspace.get", requestId:"REQ-…",
  payload:{ scope:{company,country,marketplace,sku?:null,siteSku?:null},
            filters:{lts?,series?,category?,sku?,siteSku?}, pagination:{page,size(≤100,default 50→client 100)}, include:{diagnostics:true} },
  context:{} }
```
Mandatory: `scope.company/country/marketplace`. The client NO LONGER sends `destinationWarehouseId`,
`calculationMonth`, or `planningCycle` — a legacy value is accepted only as **deprecated compatibility input**
(recorded, never drives fanout; no dual execution).

## Calculation-month authority (server-owned; no clock)
Injected configuration `RECOMMENDATION_CALCULATION_MONTH` (Script Property; DI in tests). `YYYY-MM`. Missing →
`RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED`; malformed → `RECOMMENDATION_CALCULATION_MONTH_INVALID`.
`planningCycle = RECO-{calculationMonth}`. **No `new Date()` / `Utilities.formatDate()` / current-month / latest-forecast
fallback.** Returned in `meta.calculationMonth` / `meta.planningCycle`.

## Server flow (destination expansion; ONE read)
`validate (scope-only) → recoWsResolveCalcContext_(io) → io.openTarget() (exact-ID gate) → KMPS.readCanonicalSnapshots
(targeted, ONCE, +replenishment_demand_allocation_rules = 12 tables) → resolve in-scope SKUs → resolve fulfillment
(marketplaces.fulfillment_model) → per SKU × destination: MARKETPLACE ⇒ KMDR.resolveUnifiedDestinationRecommendation
(order-need; no source-pool allocator); WAREHOUSE ⇒ per-month frozen ratio fanout (KMDA) → the FROZEN KMPA→KMPS Weekly
path per warehouse (real allocator; `preReadSnapshots` injected so NO per-SKU/per-destination re-open) → KMDR normalizes
each into the canonical line → dedup by stable identity → sort → filter → paginate → envelope`. **`allocatedSupplyQty`
is produced ONLY by the frozen KMPS allocator — never reconstructed in transport.**

## Response DTO (additive destination identity)
```
{ success:true, data:{ scope:{…,calculationMonth,planningCycle}, lines:[{
    recommendationLineId, recommendationMode:"MARKETPLACE_ORDER_NEED"|"WAREHOUSE_REPLENISHMENT",
    company,country,marketplace,marketplaceId, sku,siteSku,
    destinationType,destinationRefId,destinationKey,destinationCode,destinationLabel,warehouseId,
    allocatedForecastQty,allocatedSalesQty, currentStockQty,qualifiedIncomingQty,incomingCompleteness,
    calculatedGap,allocatedSupplyQty,recommendedQty,provisionalOrderNeed,residualShortageQty,
    blocked,blockedReason, formulaVersion,sourceDataAsOf, diagnostics }],
  pagination:{…}, dataVersion:{…} },
  meta:{ …, requestId, calculationMonth, planningCycle, tablesRead, sourceReadCount:1, conflicts, serverDurationMs }, errors:[] }
```
Stable identity: `recommendationMode | company | country | marketplace | sku | siteSku | destinationKey` (never row
index / array position / label / SKU alone). Duplicate identity → `RECOMMENDATION_LINE_IDENTITY_CONFLICT` (no latest-win).

## Added error/blocked tokens
`RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED` · `RECOMMENDATION_CALCULATION_MONTH_INVALID` ·
`DESTINATION_AUTHORITY_UNRESOLVED` (unknown/hybrid fulfillment) · `MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED` (PARTIAL
incoming ⇒ canonical `recommendedQty` withheld, `provisionalOrderNeed` diagnostic only) · `DEMAND_ALLOCATION_RULE_NOT_CONFIGURED`
/ `_RATIO_INVALID` / `_RATIO_TOTAL_INVALID` / `_PERIOD_CONFLICT` · `DESTINATION_WAREHOUSE_INVALID` ·
`RECOMMENDATION_LINE_IDENTITY_CONFLICT`. Source insufficiency returns a canonical `recommendedQty` + `residualShortageQty`
(never an API error). Missing source is never a fake 0; an explicit source 0 stays 0.

## Performance classification
Target: 1 HTTP / scope, 1 targeted snapshot read / request, 0 per-SKU/per-destination re-open, 0 `getOperationDb`, 0
whole-DB load, 0 writes. Test-verified via a fake spreadsheet (`getSheetByName` called exactly 12× for a 2-destination
fanout; write methods never invoked). Live latency **unverified** this round → `LIVE_LATENCY_UNVERIFIED`.
