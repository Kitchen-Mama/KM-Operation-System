// Kitchen Mama Operation System — F1-7N-B Weekly AI Plan pure source-allocation builder.
// Run: node assets/tests/weekly-ai-plan-source-allocation-f1-7n-b-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves the §35A WEEKLY_SHIPPING source axis (Overseas → CN_YOUXIN → TW_SHENGYI → unresolved) realized as a PURE
// composition over the frozen §40 primitives + the frozen resolveWeeklyRecommendationFacts — WITHOUT changing §40.
// Covers all 13 §35A.5 scenarios (A–M) + proves MONTHLY allocateFactoryDeterministic semantics are unchanged.

var path = require('path');
var B = require('../js/core/supply-planning-weekly-source-allocation.js');
var ALLOC = require('../js/core/supply-planning-allocations.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var CN = 'WH-CN-YOUXIN', TW = 'WH-TW-SHENGYI';
// overseas pool / receiver builders
function opool(k, w, q) { return { poolKey: k, poolType: 'THREE_PL', warehouseId: w, effectiveSupplyQty: q }; }
function rcv(demandKey, siteSku, over) {
  var o = { receiverKey: 'R-' + demandKey, demandKey: demandKey, marketplace: 'amz', destinationWarehouseId: 'DEST-' + demandKey,
    fulfillmentModel: 'self_fulfilled', demandQty: 100, survivalNeedQty: 0, allocationPriority: 5, demandWeight: 1, eligiblePoolTypes: ['THREE_PL'] };
  if (over) for (var k in over) o[k] = over[k]; return o;
}
function overseas(pools, receivers) { return { company: 'KM', country: 'US', masterSku: 'SKU1', supplyPools: pools, receivers: receivers }; }
// factory pool / demand builders
function fpool(k, w, q) { return { poolKey: k, poolType: 'FACTORY', warehouseId: w, effectiveSupplyQty: q }; }
function fdem(demandKey, over) {
  var o = { demandKey: demandKey, company: 'KM', marketplace: 'amz', destinationWarehouseId: 'DEST-' + demandKey,
    requiredByDate: '2026-09-01', allocationPriority: 5, demandQty: 100, eligibleFactoryWarehouseIds: [CN, TW] };
  if (over) for (var k in over) o[k] = over[k]; return o;
}
function factory(pools, demands) { return { factoryPools: pools, demands: demands, cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }; }
// weekly fact builder
function wf(demandKey, siteSku, gap, upc) {
  var o = { recommendationType: 'WEEKLY_SHIPPING', sku: 'SKU1', siteSku: siteSku, windowCode: 'D30', demandKey: demandKey, calculatedGap: gap };
  if (upc !== undefined) o.unitsPerCarton = upc; return o;
}
function run(over, fac, facts) { return B.buildWeeklySourceAllocation({ planningCycle: '2026-W37', businessScope: { company: 'KM', country: 'US', marketplace: 'amz' }, masterSku: 'SKU1', overseasInput: over, factory: fac, weeklyPlanningFacts: facts }); }
function lineBy(res, siteSku) { return res.lines.filter(function (l) { return l.siteSku === siteSku; })[0]; }

// =================================================================================================================
section('A — Overseas fully satisfies demand → Factory untouched');
var A = run(overseas([opool('OV1', 'W-OV', 100)], [rcv('D1', 'S1', { demandQty: 100 })]),
            factory([fpool('FC', CN, 50), fpool('FT', TW, 50)], [fdem('D1', { demandQty: 100 })]),
            [wf('D1', 'S1', 100, 1)]);
eq([A.sourcePriority.overseasAllocatedQty, A.sourcePriority.cnAllocatedQty, A.sourcePriority.twAllocatedQty], [100, 0, 0], 'A overseas 100; CN & TW untouched');
eq(lineBy(A, 'S1').recommendedQty, 100, 'A recommendedQty = 100');
eq(lineBy(A, 'S1').unresolvedProductionNeedQty, 0, 'A no unresolved residual');
eq(lineBy(A, 'S1').sourceStages, ['SOURCE_OVERSEAS'], 'A source stage = overseas only');

section('B — Overseas partial → CN fills residual');
var Bx = run(overseas([opool('OV1', 'W-OV', 60)], [rcv('D1', 'S1', { demandQty: 100 })]),
             factory([fpool('FC', CN, 100), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 100 })]),
             [wf('D1', 'S1', 100, 1)]);
eq([Bx.sourcePriority.overseasAllocatedQty, Bx.sourcePriority.cnAllocatedQty, Bx.sourcePriority.twAllocatedQty], [60, 40, 0], 'B overseas 60 → CN 40 → TW 0');
eq(lineBy(Bx, 'S1').recommendedQty, 100, 'B recommendedQty = 100 (60 OV + 40 CN)');
eq(lineBy(Bx, 'S1').sourceStages, ['SOURCE_FACTORY_CN_YOUXIN', 'SOURCE_OVERSEAS'], 'B stages = overseas + CN');

section('C — Overseas + CN partial → TW fills residual');
var C = run(overseas([opool('OV1', 'W-OV', 30)], [rcv('D1', 'S1', { demandQty: 100 })]),
            factory([fpool('FC', CN, 30), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 100 })]),
            [wf('D1', 'S1', 100, 1)]);
eq([C.sourcePriority.overseasAllocatedQty, C.sourcePriority.cnAllocatedQty, C.sourcePriority.twAllocatedQty], [30, 30, 40], 'C overseas 30 → CN 30 → TW 40');
eq(lineBy(C, 'S1').recommendedQty, 100, 'C recommendedQty = 100');
eq(lineBy(C, 'S1').sourceStages, ['SOURCE_FACTORY_CN_YOUXIN', 'SOURCE_FACTORY_TW_SHENGYI', 'SOURCE_OVERSEAS'], 'C stages = all three');

section('D — all sources insufficient → unresolved residual preserved');
var D = run(overseas([opool('OV1', 'W-OV', 20)], [rcv('D1', 'S1', { demandQty: 100 })]),
            factory([fpool('FC', CN, 20), fpool('FT', TW, 20)], [fdem('D1', { demandQty: 100 })]),
            [wf('D1', 'S1', 100, 1)]);
eq([D.sourcePriority.overseasAllocatedQty, D.sourcePriority.cnAllocatedQty, D.sourcePriority.twAllocatedQty], [20, 20, 20], 'D 20+20+20 allocated');
eq(lineBy(D, 'S1').recommendedQty, 60, 'D recommendedQty = 60 (all available)');
eq(lineBy(D, 'S1').unresolvedProductionNeedQty, 40, 'D unresolved production need = 40 (never fabricated)');
ok(lineBy(D, 'S1').sourceStages.indexOf('UNRESOLVED_PRODUCTION_NEED') !== -1, 'D flags UNRESOLVED_PRODUCTION_NEED');

section('E — CN chosen before TW when both available');
var E = run(null, factory([fpool('FC', CN, 100), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 60 })]), [wf('D1', 'S1', 60, 1)]);
eq([E.sourcePriority.cnAllocatedQty, E.sourcePriority.twAllocatedQty], [60, 0], 'E CN 60, TW 0 (CN strict priority)');
eq(lineBy(E, 'S1').sourceStages, ['SOURCE_FACTORY_CN_YOUXIN'], 'E source = CN only');

section('F — TW used when CN has zero eligible supply');
var F = run(null, factory([fpool('FC', CN, 0), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 60 })]), [wf('D1', 'S1', 60, 1)]);
eq([F.sourcePriority.cnAllocatedQty, F.sourcePriority.twAllocatedQty], [0, 60], 'F CN 0 → TW 60');
eq(lineBy(F, 'S1').sourceStages, ['SOURCE_FACTORY_TW_SHENGYI'], 'F source = TW only');

section('G — source priority does NOT reorder Required-By demand priority');
// D1 earlier Required-By, D2 later; ONE CN pool of 60 (limited); both gap 60. §35 → earlier serves first.
var G = run(null,
            factory([fpool('FC', CN, 60)], [fdem('D1', { requiredByDate: '2026-09-01', demandQty: 60 }), fdem('D2', { requiredByDate: '2026-09-15', demandQty: 60 })]),
            [wf('D1', 'S1', 60, 1), wf('D2', 'S2', 60, 1)]);
eq(lineBy(G, 'S1').recommendedQty, 60, 'G earlier Required-By (D1) served first → 60');
eq(lineBy(G, 'S2').recommendedQty, 0, 'G later Required-By (D2) gets 0 (demand order preserved through source pass)');
eq([G.sourcePriority.cnAllocatedQty], [60], 'G CN total 60 (pool not exceeded)');

section('H — physical supply cannot be allocated >100%');
var H = run(overseas([opool('OV1', 'W-OV', 40)], [rcv('D1', 'S1', { demandQty: 200 })]),
            factory([fpool('FC', CN, 40), fpool('FT', TW, 40)], [fdem('D1', { demandQty: 200 })]),
            [wf('D1', 'S1', 200, 1)]);
ok(H.sourcePriority.overseasAllocatedQty <= 40 && H.sourcePriority.cnAllocatedQty <= 40 && H.sourcePriority.twAllocatedQty <= 40, 'H no single pool exceeded');
eq([H.sourcePriority.overseasAllocatedQty, H.sourcePriority.cnAllocatedQty, H.sourcePriority.twAllocatedQty], [40, 40, 40], 'H each pool fully but not over-consumed');
eq(lineBy(H, 'S1').recommendedQty, 120, 'H recommendedQty = 120 (= total physical supply, never > gap 200)');
eq(lineBy(H, 'S1').unresolvedProductionNeedQty, 80, 'H residual = 80');

section('I — same source unit cannot satisfy multiple demands (count-once)');
var I = run(null,
            factory([fpool('FC', CN, 50)], [fdem('D1', { requiredByDate: '2026-09-01', demandQty: 40 }), fdem('D2', { requiredByDate: '2026-09-01', allocationPriority: 5, demandQty: 40 })]),
            [wf('D1', 'S1', 40, 1), wf('D2', 'S2', 40, 1)]);
eq(I.sourcePriority.cnAllocatedQty, 50, 'I CN total allocated = 50 (the pool) — NOT 80 (never double-consumed)');
ok((lineBy(I, 'S1').recommendedQty + lineBy(I, 'S2').recommendedQty) === 50, 'I the 50 physical units split across the two demands, summing to exactly 50');

section('J — 18-day overseas survival protection remains intact');
var J = run(overseas([opool('OV1', 'W-OV', 300)], [rcv('D1', 'S1', { demandQty: 500, survivalNeedQty: 100, demandWeight: 1 }), rcv('D2', 'S2', { demandQty: 500, survivalNeedQty: 100, demandWeight: 1 })]),
            null, [wf('D1', 'S1', 500, 1), wf('D2', 'S2', 500, 1)]);
var ovAllocs = J.allocationProjection.overseasAllocation.allocations;
ok(ovAllocs.some(function (a) { return a.allocationReason === 'SURVIVAL_18D'; }), 'J overseas allocation still applies 18-day SURVIVAL_18D protection');
ok(J.sourcePriority.overseasAllocatedQty === 300, 'J overseas conserves the pool (300)');

section('K — carton FLOOR leaves partial-carton residual unmet (Gap 100, source 95, UPC 24 → 72, residual 28)');
var K = run(null, factory([fpool('FC', CN, 95)], [fdem('D1', { demandQty: 100 })]), [wf('D1', 'S1', 100, 24)]);
eq(lineBy(K, 'S1').recommendedQty, 72, 'K recommendedQty = FLOOR(95/24)*24 = 72 (partial carton not shipped)');
eq(lineBy(K, 'S1').unresolvedProductionNeedQty, 28, 'K residual = 100 - 72 = 28 (NOT 5)');

section('L — missing/invalid units_per_carton follows the canonical block rule');
var L = run(null, factory([fpool('FC', CN, 95)], [fdem('D1', { demandQty: 100 })]), [wf('D1', 'S1', 100)]);   // no UPC
eq(lineBy(L, 'S1').blockedReason, 'MISSING_OR_INVALID_UNITS_PER_CARTON', 'L blocked: missing UPC');
eq(lineBy(L, 'S1').recommendedQty, null, 'L blocked → recommendedQty null (never a fabricated qty)');
eq(lineBy(L, 'S1').unresolvedProductionNeedQty, null, 'L blocked → residual null');

section('M — deterministic: identical input → identical ordered output');
var m1 = run(overseas([opool('OV1', 'W-OV', 30)], [rcv('D1', 'S1', { demandQty: 100 })]), factory([fpool('FC', CN, 30), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 100 })]), [wf('D1', 'S1', 100, 1)]);
var m2 = run(overseas([opool('OV1', 'W-OV', 30)], [rcv('D1', 'S1', { demandQty: 100 })]), factory([fpool('FC', CN, 30), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 100 })]), [wf('D1', 'S1', 100, 1)]);
eq(m1, m2, 'M identical input → byte-identical output');

// =================================================================================================================
section('MONTHLY allocateFactoryDeterministic semantics UNCHANGED (regression)');
// The frozen monthly single-call path consumes factory pools in ascending poolKey (NOT a named CN/TW order) — the
// builder never touches this. Prove the primitive still behaves exactly so, independent of factory identity.
var mono = ALLOC.allocateFactoryDeterministic({
  masterSku: 'SKU1',
  factoryPools: [fpool('P-B', TW, 100), fpool('P-A', CN, 100)],   // ascending poolKey = P-A(TW? no, P-A is CN here) then P-B
  demands: [{ demandKey: 'D1', company: 'KM', marketplace: 'amz', destinationWarehouseId: 'DEST', requiredByDate: '2026-09-01', allocationPriority: 5, demandQty: 60, eligibleFactoryWarehouseIds: [CN, TW] }]
});
eq(mono.allocations.map(function (a) { return a.sourcePoolKey; }), ['P-A'], 'MONTHLY: pools consumed in ascending poolKey (P-A before P-B) — unchanged §40 semantics');
eq(mono.totalAllocatedQty, 60, 'MONTHLY: demand 60 fully covered by first ascending pool');
ok(mono.allocations[0].allocationReason === 'FACTORY_FIFO', 'MONTHLY: reason token FACTORY_FIFO unchanged');
// purity: builder never mutated the frozen primitive result shape (allocationType stays FACTORY_DETERMINISTIC).
ok(mono.allocationType === 'FACTORY_DETERMINISTIC', 'MONTHLY: result shape unchanged');

// input non-mutation: builder must not mutate caller inputs.
var facPools = [fpool('FC', CN, 30), fpool('FT', TW, 100)];
var facDems = [fdem('D1', { demandQty: 100 })];
var beforePools = JSON.stringify(facPools), beforeDems = JSON.stringify(facDems);
B.buildWeeklySourceAllocation({ planningCycle: '2026-W37', businessScope: { company: 'KM' }, masterSku: 'SKU1', overseasInput: null, factory: { factoryPools: facPools, demands: facDems, cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }, weeklyPlanningFacts: [wf('D1', 'S1', 100, 1)] });
ok(JSON.stringify(facPools) === beforePools && JSON.stringify(facDems) === beforeDems, 'PURITY: caller factory pools/demands are not mutated');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN SOURCE ALLOCATION (F1-7N-B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
