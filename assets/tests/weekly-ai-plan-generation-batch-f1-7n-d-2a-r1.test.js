// Kitchen Mama Operation System — F1-7N-D-2a Weekly AI Plan (company,country) BATCH generation core.
// Run: node assets/tests/weekly-ai-plan-generation-batch-f1-7n-d-2a-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves generateWeeklyShippingRecommendationBatch(request, deps): per-masterSku shared overseas pool rationed ONCE
// across all marketplaces, then fanned out to ONE K3 draft per marketplace via the frozen bridge + orchestrator, with
// fake repo/lock deps. Covers count-once-across-marketplaces, multi-SKU aggregation, per-marketplace conflict
// isolation, and fail-closed (no persist). The .gs harvest (KMAF multi-site demandWeight) + router are D-2b (live).

var BATCH = require('../js/core/supply-planning-weekly-recommendation-batch.js');
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
function opool(k, w, q) { return { poolKey: k, poolType: 'THREE_PL', warehouseId: w, effectiveSupplyQty: q }; }
function lane(mkt, siteSku, dest, over) {
  var o = { siteSku: siteSku, destinationWarehouseId: dest, marketplace: mkt, company: 'KM', country: 'US',
    cumulativeGapByWindow: { D18: 50 }, requiredByByWindow: { D18: '2026-09-01' }, unitsPerCarton: 1,
    survivalNeedQty: 0, demandWeight: 0.5, fulfillmentModel: 'self_fulfilled', eligiblePoolTypes: ['THREE_PL'], allocationPriority: 5 };
  if (over) for (var k in over) o[k] = over[k]; return o;
}
function request(over) {
  var base = {
    planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US', source_page: 'inventory_replenishment' },
    mode: 'SCHEDULED_REFRESH', sourceDataAsOf: '2026-08-18T00:00:00Z', factoryIdentityConfig: CFG, warehousesById: WH,
    skus: [{ masterSku: 'SKU1', overseasSupplyPools: [opool('OV', 'W-OV', 60)], factoryPools: [],
      lanes: [lane('AMZ_A', 'SA', 'DEST-A'), lane('AMZ_B', 'SB', 'DEST-B')] }]
  };
  if (over) for (var k in over) base[k] = over[k];
  return base;
}
// Fake KMPR/KMPL deps; captures one persistence plan per marketplace (keyed by query.businessScope.marketplace).
function fakeDeps(cap, blockMkt) {
  return {
    loadActiveContext: function (q) {
      var m = q && q.businessScope ? q.businessScope.marketplace : null;
      if (blockMkt && m === blockMkt) return { status: 'BLOCKED_CONFLICT', matchCount: 2 };
      return { status: 'CREATE' };
    },
    loadPriorSnapshot: function () { return null; },
    lockedApply: function (plan) { if (cap) cap.plans.push(plan); return { status: 'COMPLETED' }; }
  };
}

// =================================================================================================================
section('A shared overseas pool rationed ONCE across marketplaces -> per-marketplace K3 drafts');
var capA = { plans: [] };
var A = BATCH.generateWeeklyShippingRecommendationBatch(request(), fakeDeps(capA));
eq(A.status, 'COMPLETED', 'A batch COMPLETED');
ok(A.success === true, 'A success');
eq(A.marketplaceCount, 2, 'A two marketplaces');
eq(A.marketplaceResults.map(function (r) { return r.marketplace; }), ['AMZ_A', 'AMZ_B'], 'A one result per marketplace (sorted)');
ok(A.marketplaceResults.every(function (r) { return r.status === 'COMPLETED' && r.success; }), 'A each marketplace draft COMPLETED');
eq(A.recommendedQtyTotal, 60, 'A total recommended == 60 (pool 60 rationed ONCE across both marketplaces, NOT 120)');
ok(A.marketplaceResults[0].lineCount === 1 && A.marketplaceResults[1].lineCount === 1, 'A each marketplace draft has its own single line');
eq(capA.plans.length, 2, 'A exactly two persistence plans (one per marketplace K3)');
// each plan targets shipping-allocation draft tables, carries its marketplace, and no procurement/carrier fields
capA.plans.forEach(function (p, i) {
  var j = JSON.stringify(p);
  ok(j.indexOf('shipping_allocation_drafts') !== -1 && j.indexOf('shipping_allocation_draft_lines') !== -1, 'A plan[' + i + '] targets shipping-allocation draft tables');
  ok(j.indexOf('request_order') === -1 && j.indexOf('purchase_order') === -1, 'A plan[' + i + '] writes NO request_order/purchase_order');
  ok(/carrier_id|rate_card_id|lead_time_id|expected_arrival|freight|duty|customs|landed/.test(j) === false, 'A plan[' + i + '] carries NO carrier/rate/lead-time/ETA/cost');
});
ok(/marketplace=AMZ_A/.test(JSON.stringify(capA.plans)) && /marketplace=AMZ_B/.test(JSON.stringify(capA.plans)), 'A the two K3 plans carry distinct marketplaces (AMZ_A + AMZ_B)');

section('B multi-SKU: one marketplace K3 draft aggregates lines across SKUs');
var capB = { plans: [] };
var B = BATCH.generateWeeklyShippingRecommendationBatch(request({
  skus: [
    { masterSku: 'SKU1', overseasSupplyPools: [opool('OV1', 'W-OV', 30)], factoryPools: [], lanes: [lane('AMZ_A', 'SA', 'DEST-A', { demandWeight: 1 })] },
    { masterSku: 'SKU2', overseasSupplyPools: [opool('OV2', 'W-OV', 30)], factoryPools: [], lanes: [lane('AMZ_A', 'SC', 'DEST-A', { demandWeight: 1 })] }
  ]
}), fakeDeps(capB));
eq(B.marketplaceCount, 1, 'B single marketplace');
eq(B.marketplaceResults[0].lineCount, 2, 'B one K3 draft aggregates BOTH SKUs lines');
eq(capB.plans.length, 1, 'B exactly one persistence plan (one marketplace)');
eq(B.skuCount, 2, 'B two SKUs processed');

section('C per-marketplace conflict isolation (one BLOCKED_CONFLICT does not corrupt the other)');
var capC = { plans: [] };
var C = BATCH.generateWeeklyShippingRecommendationBatch(request(), fakeDeps(capC, 'AMZ_B'));
eq(C.status, 'PARTIAL', 'C batch PARTIAL when one marketplace conflicts');
ok(C.success === false, 'C not a fake overall success');
var rA = C.marketplaceResults.filter(function (r) { return r.marketplace === 'AMZ_A'; })[0];
var rB = C.marketplaceResults.filter(function (r) { return r.marketplace === 'AMZ_B'; })[0];
eq(rA.status, 'COMPLETED', 'C AMZ_A still COMPLETED');
eq(rB.status, 'BLOCKED_CONFLICT', 'C AMZ_B surfaced BLOCKED_CONFLICT');
eq(capC.plans.length, 1, 'C only the non-conflicted marketplace persisted');

// =================================================================================================================
section('D–F fail-closed: NO persistence on bad input');
var capD = { plans: [] };
var D = BATCH.generateWeeklyShippingRecommendationBatch(request({ businessScope: { company: 'KM', country: 'US' } }), fakeDeps(capD)); // missing source_page
eq(D.status, 'BLOCKED_INPUT', 'D missing source_page -> BLOCKED_INPUT');
ok(D.success === false && capD.plans.length === 0, 'D no persist on missing scope');
var capE = { plans: [] };
var E = BATCH.generateWeeklyShippingRecommendationBatch(request({ warehousesById: { 'WH-TW-CN-FACTORY-YOUXIN': WH[CN], 'WH-TW-TW-FACTORY-RES': { warehouse_id: TW, warehouse_type: 'FACTORY', is_factory_warehouse: true, is_active: false } } }), fakeDeps(capE));
eq(E.status, 'BLOCKED_INPUT', 'E inactive configured factory -> BLOCKED_INPUT (fail closed, whole batch)');
ok(capE.plans.length === 0, 'E no persist on invalid factory identity');
var capF = { plans: [] };
var F = BATCH.generateWeeklyShippingRecommendationBatch(request({ skus: [] }), fakeDeps(capF));
eq(F.status, 'BLOCKED_INPUT', 'F empty skus -> BLOCKED_INPUT');
ok(capF.plans.length === 0, 'F no persist');

section('G determinism + single-owner surface + provenance');
var g1 = BATCH.generateWeeklyShippingRecommendationBatch(request(), fakeDeps({ plans: [] }));
var g2 = BATCH.generateWeeklyShippingRecommendationBatch(request(), fakeDeps({ plans: [] }));
eq(g1, g2, 'G identical request -> identical bounded batch result');
eq(Object.keys(BATCH).sort(), ['_version', 'generateWeeklyShippingRecommendationBatch'], 'G owner exposes ONE batch generation fn');
eq(g1.formulaVersion, 'WEEKLY_AI_PLAN_V1', 'G formulaVersion WEEKLY_AI_PLAN_V1');
eq(g1.sourceDataAsOf, '2026-08-18T00:00:00Z', 'G sourceDataAsOf carried (never a clock)');
eq(BATCH._version, 'f1-7n-d-2a-r1', 'G version tag');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN GENERATION BATCH (F1-7N-D-2a): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
