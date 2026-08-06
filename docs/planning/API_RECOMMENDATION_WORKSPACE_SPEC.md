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
