// Kitchen Mama Operation System — F1-7N-D-1 Weekly AI Plan generation-pipeline core.
// Run: node assets/tests/weekly-ai-plan-generation-runtime-f1-7n-d-1-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves the ONE canonical generation owner brain generateWeeklyShippingRecommendationDraft(request, deps) composes
// assembler -> builder -> C1 persistence end-to-end with FAKE repository/lock deps, returns a bounded result DTO, and
// fails closed (no persist) on bad scope / bad factory identity / active conflict. The .gs I/O shell (D-2), frontend
// (D-3) and scheduler (D-4) are later live-verified slices; this suite covers the Node-verifiable foundation.

var RT = require('../js/core/supply-planning-weekly-recommendation-runtime.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var CN = 'WH-TW-CN-FACTORY-YOUXIN', TW = 'WH-TW-TW-FACTORY-RES';
var CFG = { CN_YOUXIN: CN, TW_SHENGYI: TW };
var WH = {
  'WH-TW-CN-FACTORY-YOUXIN': { warehouse_id: CN, warehouse_type: 'FACTORY', country: 'CN', is_factory_warehouse: true, is_active: true },
  'WH-TW-TW-FACTORY-RES': { warehouse_id: TW, warehouse_type: 'FACTORY', country: 'TW', is_factory_warehouse: true, is_active: true }
};
function opool(k, w, q, type) { return { poolKey: k, poolType: type || 'THREE_PL', warehouseId: w, effectiveSupplyQty: q }; }
function fpool(k, w, q) { return { poolKey: k, poolType: 'FACTORY', warehouseId: w, effectiveSupplyQty: q }; }
function lane(over) {
  var o = { siteSku: 'S1', destinationWarehouseId: 'DEST-1', marketplace: 'amz', company: 'KM', country: 'US',
    cumulativeGapByWindow: { D18: 100 }, requiredByByWindow: { D18: '2026-09-01' },
    unitsPerCarton: 1, survivalNeedQty: 0, demandWeight: 1, fulfillmentModel: 'self_fulfilled', eligiblePoolTypes: ['THREE_PL'], allocationPriority: 5 };
  if (over) for (var k in over) o[k] = over[k]; return o;
}
function request(over) {
  var base = { planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US', marketplace: 'amz', source_page: 'SITE_INVENTORY' },
    masterSku: 'SKU1', mode: 'SCHEDULED_REFRESH', sourceDataAsOf: '2026-08-18T00:00:00Z', factoryIdentityConfig: CFG, warehousesById: WH,
    overseasSupplyPools: [opool('OV', 'W-OV', 100)], factoryPools: [fpool('FC', CN, 100), fpool('FT', TW, 100)], lanes: [lane()] };
  if (over) for (var k in over) base[k] = over[k];
  return base;
}
// Fake repository/lock deps (KMPR/KMPL stand-ins). Captures the persistence plan handed to the LockService path.
function fakeDeps(cap, activeStatus) {
  return {
    loadActiveContext: function () { return { status: activeStatus || 'CREATE' }; },
    loadPriorSnapshot: function () { return null; },
    lockedApply: function (plan, token, opts) { if (cap) { cap.plan = plan; cap.token = token; cap.opts = opts; cap.called = true; } return { status: 'COMPLETED' }; }
  };
}

// =================================================================================================================
section('A valid generation -> success COMPLETED + bounded DTO');
var capA = {};
var A = RT.generateWeeklyShippingRecommendationDraft(request(), fakeDeps(capA));
ok(A.success === true, 'A success');
eq(A.status, 'COMPLETED', 'A status COMPLETED');
eq(A.recommendationType, 'WEEKLY_SHIPPING', 'A recommendationType');
ok(typeof A.draftId === 'string' && A.draftId.length > 0, 'A draftId present');
eq(A.formulaVersion, 'WEEKLY_AI_PLAN_V1', 'A formulaVersion carried');
eq(A.sourceDataAsOf, '2026-08-18T00:00:00Z', 'A sourceDataAsOf carried (canonical maxAsOf, not a clock)');
ok(A.generatedLineCount >= 1, 'A generatedLineCount >= 1');
ok(A.sourcePrioritySummary && typeof A.sourcePrioritySummary.overseasAllocatedQty === 'number', 'A sourcePrioritySummary present');
ok(capA.called === true, 'A persistence write path (lockedApply) invoked');

section('B write path is C1 only -> plan targets shipping-allocation draft tables, no procurement');
var planJson = JSON.stringify(capA.plan || {});
ok(planJson.indexOf('shipping_allocation_drafts') !== -1, 'B plan targets shipping_allocation_drafts');
ok(planJson.indexOf('shipping_allocation_draft_lines') !== -1, 'B plan targets shipping_allocation_draft_lines');
ok(planJson.indexOf('request_order') === -1 && planJson.indexOf('purchase_order') === -1, 'B plan writes NO request_order / purchase_order table');
ok(/carrier_id|rate_card_id|lead_time_id|expected_arrival|freight|duty|customs|landed/.test(planJson) === false, 'B plan carries NO carrier/rate/lead-time/ETA/cost field');

section('C multi-source summary (Overseas 30 -> CN 30 -> TW 40)');
var C = RT.generateWeeklyShippingRecommendationDraft(request({ overseasSupplyPools: [opool('OV', 'W-OV', 30)], factoryPools: [fpool('FC', CN, 30), fpool('FT', TW, 100)] }), fakeDeps({}));
eq([C.sourcePrioritySummary.overseasAllocatedQty, C.sourcePrioritySummary.cnAllocatedQty, C.sourcePrioritySummary.twAllocatedQty], [30, 30, 40], 'C source priority summary reflects residual chain');
eq(C.recommendedQtyTotal, 100, 'C recommendedQtyTotal = 100');

section('D carton FLOOR + unresolved residual surfaced in DTO');
var D = RT.generateWeeklyShippingRecommendationDraft(request({ overseasSupplyPools: [], factoryPools: [fpool('FC', CN, 95)], lanes: [lane({ unitsPerCarton: 24 })] }), fakeDeps({}));
eq(D.recommendedQtyTotal, 72, 'D recommendedQtyTotal = FLOOR(95/24)*24 = 72');
eq(D.unresolvedProductionNeedQty, 28, 'D unresolvedProductionNeedQty = 28 surfaced');

// =================================================================================================================
section('E–G fail-closed: NO persistence on bad input');
var capE = {};
var E = RT.generateWeeklyShippingRecommendationDraft(request({ businessScope: { company: 'KM', country: 'US', marketplace: 'amz' } }), fakeDeps(capE)); // missing source_page
eq(E.status, 'BLOCKED_INPUT', 'E missing source_page -> BLOCKED_INPUT');
ok(E.success === false && !capE.called, 'E no persistence attempted on missing scope');
var capF = {};
var F = RT.generateWeeklyShippingRecommendationDraft(request({ warehousesById: { 'WH-TW-CN-FACTORY-YOUXIN': WH[CN], 'WH-TW-TW-FACTORY-RES': { warehouse_id: TW, warehouse_type: 'FACTORY', is_factory_warehouse: true, is_active: false } } }), fakeDeps(capF));
eq(F.status, 'BLOCKED_INPUT', 'F inactive configured factory -> BLOCKED_INPUT (fail closed)');
ok(F.success === false && !capF.called, 'F no persistence attempted on invalid factory identity');
var capG = {};
var G = RT.generateWeeklyShippingRecommendationDraft(request({ masterSku: '' }), fakeDeps(capG));
eq(G.status, 'BLOCKED_INPUT', 'G missing masterSku -> BLOCKED_INPUT');
ok(!capG.called, 'G no persistence attempted');

section('H active-draft conflict surfaced (BLOCKED_CONFLICT), success false');
var H = RT.generateWeeklyShippingRecommendationDraft(request(), { loadActiveContext: function () { return { status: 'BLOCKED_CONFLICT', matchCount: 2 }; }, loadPriorSnapshot: function () { return null; }, lockedApply: function () { return { status: 'COMPLETED' }; } });
eq(H.status, 'BLOCKED_CONFLICT', 'H duplicate active K3 -> BLOCKED_CONFLICT');
ok(H.success === false, 'H not a fake success');

section('I deterministic + single-owner surface');
var i1 = RT.generateWeeklyShippingRecommendationDraft(request(), fakeDeps({}));
var i2 = RT.generateWeeklyShippingRecommendationDraft(request(), fakeDeps({}));
eq(i1, i2, 'I identical request -> identical bounded result');
eq(Object.keys(RT).sort(), ['_version', 'generateWeeklyShippingRecommendationDraft'], 'I owner exposes ONE generation fn (no persist/order/shipment side-channel)');
eq(RT._version, 'f1-7n-d-1-r1', 'I version tag');

section('J no Weekly->procurement / reservation leakage in the result DTO');
var rj = JSON.stringify(A);
ok(rj.indexOf('request_order') === -1 && rj.indexOf('purchase_order') === -1 && rj.indexOf('reserv') === -1, 'J result DTO carries no procurement/reservation field');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN GENERATION RUNTIME (F1-7N-D-1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
