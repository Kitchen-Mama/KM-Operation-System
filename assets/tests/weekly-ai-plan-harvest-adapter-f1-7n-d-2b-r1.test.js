// Kitchen Mama Operation System — F1-7N-D-2b Weekly AI Plan harvest→batch-request adapter (KMWHA).
// Run: node assets/tests/weekly-ai-plan-harvest-adapter-f1-7n-d-2b-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves the PURE join/mapping brain KMWHA.mapWeeklyHarvestToBatchRequest: joins the ONE multi-site KMAF §7 call
// (receiverFact ↔ planningFact by demandRef) to per-site horizons/pools, carries KMAF demandWeight verbatim, derives
// survivalNeedQty=ceil(18×dailyDemand), groups lanes by SKU, and fails closed when the §7 call is not ready — then
// feeds KMWRB end to end. Also proves the real KMAF §7 forecast-share basis (70/30 → 0.7/0.3). The .gs harvest I/O
// shell that fetches these facts is live-only (D-2b), verified by the USER live smoke.

var KMWHA = require('../js/core/supply-planning-weekly-harvest-adapter.js');
var KMWRB = require('../js/core/supply-planning-weekly-recommendation-batch.js');
var KMAF = require('../js/core/supply-planning-allocation-facts.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function approx(a, e, l) { if (typeof a === 'number' && Math.abs(a - e) < 1e-9) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + e + '\n  got ' + a); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var CN = 'WH-TW-CN-FACTORY-YOUXIN', TW = 'WH-TW-TW-FACTORY-RES';
var CFG = { CN_YOUXIN: CN, TW_SHENGYI: TW };
var WH = {
  'WH-TW-CN-FACTORY-YOUXIN': { warehouse_id: CN, warehouse_type: 'FACTORY', country: 'CN', is_factory_warehouse: true, is_active: true },
  'WH-TW-TW-FACTORY-RES': { warehouse_id: TW, warehouse_type: 'FACTORY', country: 'TW', is_factory_warehouse: true, is_active: true }
};
// Documented KMAF output shapes (receiverFact carries NO sku; planningFact does — joined by demandRef).
function rf(ref, mkt, dest, dw, dd) { return { demandRef: ref, demandKey: ref, marketplace: mkt, destinationWarehouseId: dest, fulfillmentModel: 'self_fulfilled', dailyDemand: dd, allocationPriority: 5, demandWeight: dw, eligiblePoolTypes: ['THREE_PL'] }; }
function pf(ref, sku, siteSku, upc) { return { demandRef: ref, sku: sku, masterSku: sku, siteSku: siteSku, unitsPerCarton: upc, windowCode: 'RECO-2026-08' }; }
function harvest(over) {
  var base = {
    planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US', source_page: 'inventory_replenishment' },
    mode: 'SCHEDULED_REFRESH', sourceDataAsOf: '2026-08-18T00:00:00Z', factoryIdentityConfig: CFG, warehousesById: WH,
    kmaf: {
      ready: true, issues: [],
      receiverFacts: [rf('KM|US|amz_a|SKU1|DEST-A', 'amz_a', 'DEST-A', 0.7, 4), rf('KM|US|amz_b|SKU1|DEST-B', 'amz_b', 'DEST-B', 0.3, 2)],
      planningFacts: [pf('KM|US|amz_a|SKU1|DEST-A', 'SKU1', 'SA', 1), pf('KM|US|amz_b|SKU1|DEST-B', 'SKU1', 'SB', 1)]
    },
    horizonsByDemandRef: {
      'KM|US|amz_a|SKU1|DEST-A': { cumulativeGapByWindow: { D18: 50 }, requiredByByWindow: { D18: '2026-09-01' } },
      'KM|US|amz_b|SKU1|DEST-B': { cumulativeGapByWindow: { D18: 50 }, requiredByByWindow: { D18: '2026-09-01' } }
    },
    poolsBySku: { SKU1: { overseasSupplyPools: [{ poolKey: 'OV', poolType: 'THREE_PL', warehouseId: 'W-OV', effectiveSupplyQty: 60 }], factoryPools: [] } }
  };
  if (over) for (var k in over) base[k] = over[k]; return base;
}

// =================================================================================================================
section('A join receiverFact↔planningFact by demandRef; per-site lanes; grouped by SKU');
var A = KMWHA.mapWeeklyHarvestToBatchRequest(harvest());
ok(A.ready === true, 'A ready');
eq(A.request.skus.length, 1, 'A one masterSku group');
eq(A.request.skus[0].masterSku, 'SKU1', 'A masterSku SKU1');
eq(A.request.skus[0].lanes.length, 2, 'A two site lanes (amz_a + amz_b)');
var laneA = A.request.skus[0].lanes.filter(function (l) { return l.marketplace === 'amz_a'; })[0];
var laneB = A.request.skus[0].lanes.filter(function (l) { return l.marketplace === 'amz_b'; })[0];
eq(laneA.siteSku, 'SA', 'A siteSku recovered from planningFact join (amz_a)');
eq(laneA.unitsPerCarton, 1, 'A unitsPerCarton recovered from planningFact join');
eq(laneA.destinationWarehouseId, 'DEST-A', 'A destinationWarehouseId from receiverFact');

section('B §7 demandWeight carried VERBATIM (0.7 / 0.3); survivalNeedQty = ceil(18×dailyDemand)');
approx(laneA.demandWeight, 0.7, 'B amz_a demandWeight 0.7 (KMAF §7 site share verbatim)');
approx(laneB.demandWeight, 0.3, 'B amz_b demandWeight 0.3');
eq(laneA.survivalNeedQty, 72, 'B amz_a survival = ceil(18×4) = 72');
eq(laneB.survivalNeedQty, 36, 'B amz_b survival = ceil(18×2) = 36');

section('C fail-closed: KMAF not ready → refuse the whole batch (no partial universe)');
var C = KMWHA.mapWeeklyHarvestToBatchRequest(harvest({ kmaf: { ready: false, issues: [{ kind: 'KMAF', reason: 'DEMAND_WEIGHT_UNRESOLVED' }], receiverFacts: [], planningFacts: [] } }));
ok(C.ready === false && C.request === null, 'C KMAF not ready → ready:false, request null');
// RESTATED (F1-7N-FC-1B-E3-R1): the legacy `{ kind, reason }` issue shape is REPLACED by the typed readiness
// issue, because the old shape is what made the live defect possible — a caller could not tell
// `issues: []` (KMAF refused and said why in `reason`, which this function discarded) from "nothing was wrong".
// The invariant C protects — the KMAF issue is SURFACED and not swallowed — is unchanged and is now
// stronger in two ways: the engine's own code is preserved VERBATIM as `engine_code`, and the readiness code
// the operator is shown is derived from it rather than being a second hand-maintained vocabulary.
eq(C.issues[0].engine_code, 'DEMAND_WEIGHT_UNRESOLVED', 'C surfaces the KMAF issue, engine code verbatim');
eq(C.issues[0].code, 'SUGGESTED_QTY_UNRESOLVED', 'C  and translates it to the readiness code the UI states');
eq(C.issues[0].kind, 'DATA', 'C  classified as DATA, never mixed with a transport fault');
ok(C.issues.length > 0, 'C  and ready:false is never reported with an empty issue list');

section('D site included by KMAF but with no horizon shortage → no lane (not an error)');
var D = KMWHA.mapWeeklyHarvestToBatchRequest(harvest({ horizonsByDemandRef: { 'KM|US|amz_a|SKU1|DEST-A': { cumulativeGapByWindow: { D18: 50 } } } }));
eq(D.request.skus[0].lanes.length, 1, 'D only the site with a horizon becomes a lane');
ok(D.ready === true, 'D still ready (no-gap site is not a failure)');

section('E end-to-end: KMWHA request → KMWRB batch → per-marketplace K3, shared pool once');
var caps = { plans: [] };
var deps = { loadActiveContext: function () { return { status: 'CREATE' }; }, loadPriorSnapshot: function () { return null; }, lockedApply: function (p) { caps.plans.push(p); return { status: 'COMPLETED' }; } };
var E = KMWRB.generateWeeklyShippingRecommendationBatch(A.request, deps);
eq(E.status, 'COMPLETED', 'E batch COMPLETED from harvested request');
eq(E.marketplaceCount, 2, 'E two marketplace K3 drafts');
eq(E.recommendedQtyTotal, 60, 'E shared overseas pool 60 rationed ONCE across amz_a+amz_b (weighted 0.7/0.3 → 42/18)');
ok(caps.plans.length === 2, 'E two persistence plans (one per marketplace)');
var la = E.marketplaceResults.filter(function (r) { return r.marketplace === 'amz_a'; })[0];
ok(la && la.status === 'COMPLETED', 'E amz_a draft COMPLETED');

// =================================================================================================================
section('F REAL KMAF §7 forecast-share basis: forecastShareQty 70/30 → demandWeight 0.7/0.3');
function fcRcv(key, mkt, share) {
  return {
    receiverKey: key, demandRef: key, demandKey: key, demandDriver: 'FORECAST_DRIVEN',
    destinationWarehouseId: 'WH-DEST', marketplace: mkt, fulfillmentModel: 'platform_fulfilled',
    windowCode: 'RECO-2026-08', allocationPriority: 5, unitsPerCarton: 1,
    forecastBasis: { forecastShareQty: share, forecastMonth1: { month: '2026-09', baseForecast: 300 }, forecastMonth2: { month: '2026-10', baseForecast: 320 }, targetRules: {}, specialEventDemand: 0 }
  };
}
var kmafRes = KMAF.projectAllocationFacts({
  recommendationType: 'WEEKLY_SHIPPING', planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US' },
  calculationDate: '2026-08-18',
  receivers: [fcRcv('KM|US|amz_a|SKU1|WH-DEST', 'amz_a', 70), fcRcv('KM|US|amz_b|SKU1|WH-DEST', 'amz_b', 30)],
  warehouses: [{ warehouse_id: 'WH-DEST', company: 'KM', country: 'US', warehouse_type: 'FBA', is_active: true }]
});
if (kmafRes && kmafRes.ready && Array.isArray(kmafRes.receiverFacts) && kmafRes.receiverFacts.length === 2) {
  var byMkt = {}; kmafRes.receiverFacts.forEach(function (r) { byMkt[r.marketplace] = r.demandWeight; });
  approx(byMkt['amz_a'], 0.7, 'F real KMAF: forecastShareQty 70 → demandWeight 0.7');
  approx(byMkt['amz_b'], 0.3, 'F real KMAF: forecastShareQty 30 → demandWeight 0.3');
  approx((byMkt['amz_a'] || 0) + (byMkt['amz_b'] || 0), 1.0, 'F real KMAF: Σ demandWeight == 1 across the (company,country) universe');
} else {
  // KMAF input contract not satisfied by this fixture — surface loudly rather than silently pass.
  ok(false, 'F real KMAF call did not return ready (issues: ' + JSON.stringify(kmafRes && kmafRes.issues) + ')');
}

section('G determinism + single-owner surface');
eq(KMWHA.mapWeeklyHarvestToBatchRequest(harvest()), KMWHA.mapWeeklyHarvestToBatchRequest(harvest()), 'G identical harvest → identical request');
// RESTATED (F1-7N-FC-1B-E3-R1): the surface grew by the READINESS VOCABULARY, and deliberately — the
// server (61_) and the page both name these codes, and exporting them from the one module that decides
// readiness is what stops each of them keeping a copy that drifts. The property G defends is that the surface
// is BOUNDED and enumerated, not that it never grows; it is still enumerated exactly.
eq(Object.keys(KMWHA).sort(),
  ['ENGINE_TO_READINESS', 'ENGINE_TRANSPORT', 'READINESS_CODES', 'SURVIVAL_HORIZON_DAYS', '_version',
   'fromEngineIssue', 'mapWeeklyHarvestToBatchRequest', 'readinessIssue', 'resolveWorkspaceLineDestination'],
  'G bounded surface (readiness vocabulary included, still enumerated)');
eq(Object.keys(KMWHA.READINESS_CODES).sort(),
  ['CANONICAL_MAPPING_INCOMPLETE', 'DESTINATION_UNRESOLVED', 'FACTORY_SOURCE_UNRESOLVED',
   'PLANNING_CYCLE_MISSING', 'REQUESTED_SCOPE_EMPTY', 'SKU_FACTS_MISSING', 'SOURCE_DATA_AS_OF_MISSING',
   'SUGGESTED_QTY_UNRESOLVED'],
  'G  and the readiness vocabulary is exactly the eight codes the refusal contract names');
eq(KMWHA.SURVIVAL_HORIZON_DAYS, 18, 'G frozen survival horizon = 18');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN HARVEST ADAPTER (F1-7N-D-2b): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
