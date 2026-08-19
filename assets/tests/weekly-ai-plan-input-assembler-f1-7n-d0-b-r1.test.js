// Kitchen Mama Operation System — F1-7N-D0-B Weekly AI Plan backend fact assembler.
// Run: node assets/tests/weekly-ai-plan-input-assembler-f1-7n-d0-b-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// Proves assembleWeeklySourceAllocationInput(...) turns canonical planning facts into the EXACT F1-7N-B DTO honoring
// the frozen §35A.7 / WA-9 authority, and that the REAL buildWeeklySourceAllocation consumes it with count-once /
// <=100% / carton-FLOOR / residual-chain invariants intact. Uses the USER-confirmed factory warehouse_ids.

var A = require('../js/core/supply-planning-weekly-input-assembler.js');
var B = require('../js/core/supply-planning-weekly-source-allocation.js');
var R = require('../js/core/supply-planning-persistence-repository.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var X = JSON.stringify(a), E = JSON.stringify(e); if (X === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + X); } }
function approx(a, e, l) { if (Math.abs(a - e) < 1e-9) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + e + '\n  got ' + a); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var CN = 'WH-TW-CN-FACTORY-YOUXIN', TW = 'WH-TW-TW-FACTORY-RES';
var CFG = { CN_YOUXIN: CN, TW_SHENGYI: TW };
var WH = {
  'WH-TW-CN-FACTORY-YOUXIN': { warehouse_id: CN, warehouse_code: 'CN_YOUXIN', warehouse_type: 'FACTORY', country: 'CN', is_factory_warehouse: true, is_active: true },
  'WH-TW-TW-FACTORY-RES': { warehouse_id: TW, warehouse_code: 'TW_RES', warehouse_type: 'FACTORY', country: 'TW', is_factory_warehouse: true, is_active: true }
};
function opool(k, w, q, type) { return { poolKey: k, poolType: type || 'THREE_PL', warehouseId: w, effectiveSupplyQty: q }; }
function fpool(k, w, q) { return { poolKey: k, poolType: 'FACTORY', warehouseId: w, effectiveSupplyQty: q }; }
function lane(over) {
  var o = { siteSku: 'S1', destinationWarehouseId: 'DEST-1', marketplace: 'amz', company: 'KM', country: 'US',
    cumulativeGapByWindow: { D18: 100 }, requiredByByWindow: { D18: '2026-09-01', D30: '2026-09-15', D45: '2026-10-01', D90: '2026-11-01' },
    unitsPerCarton: 1, survivalNeedQty: 0, demandWeight: 1, fulfillmentModel: 'self_fulfilled', eligiblePoolTypes: ['THREE_PL'], allocationPriority: 5 };
  if (over) for (var k in over) o[k] = over[k]; return o;
}
function assemble(over) {
  var base = { planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US', marketplace: 'amz' }, masterSku: 'SKU1',
    sourceDataAsOf: '2026-08-18T00:00:00Z', factoryIdentityConfig: CFG, warehousesById: WH,
    overseasSupplyPools: [], factoryPools: [], lanes: [lane()] };
  if (over) for (var k in over) base[k] = over[k];
  return A.assembleWeeklySourceAllocationInput(base);
}
function build(res) { return B.buildWeeklySourceAllocation(res.builderInput); }
function lineBy(r, s) { return r.lines.filter(function (l) { return l.siteSku === s; })[0]; }
function rcvByWin(res, win) { return res.builderInput.overseasInput.receivers.filter(function (r) { return r.demandKey.split('|')[2] === win; })[0]; }

// =================================================================================================================
section('A one SKU / one destination / one window assembles a valid B DTO end to end');
var a = assemble({ overseasSupplyPools: [opool('OV', 'W-OV', 100)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 } })] });
ok(a.ready === true, 'A ready');
eq(a.builderInput.weeklyPlanningFacts.length, 1, 'A one weekly fact (single active window)');
eq(a.builderInput.overseasInput.receivers.length, 1, 'A one overseas receiver');
var aB = build(a);
eq(lineBy(aB, 'S1').recommendedQty, 100, 'A B builder recommends 100 from overseas');

// =================================================================================================================
section('B–E cumulative -> incremental projection (via assembler)');
function inc(cum) { return assemble({ lanes: [lane({ cumulativeGapByWindow: { D18: cum[0], D30: cum[1], D45: cum[2], D90: cum[3] } })] }).cumulativeByLane[0].incremental; }
eq(inc([10, 20, 30, 40]), [10, 10, 10, 10], 'B 10/20/30/40 -> 10/10/10/10');
eq(inc([20, 20, 20, 20]), [20, 0, 0, 0], 'C 20/20/20/20 -> 20/0/0/0');
eq(inc([0, 10, 10, 25]), [0, 10, 0, 15], 'D 0/10/10/25 -> 0/10/0/15');
eq(inc([20, 15, 30, 25]), [20, 0, 10, 0], 'E decreasing anomaly 20/15/30/25 -> 20/0/10/0');
// facts carry incremental as calculatedGap alias + cumulative preserved
var eRes = assemble({ lanes: [lane({ cumulativeGapByWindow: { D18: 10, D30: 20, D45: 30, D90: 40 } })] });
eq(eRes.builderInput.weeklyPlanningFacts.map(function (f) { return f.calculatedGap; }), [10, 10, 10, 10], 'B calculatedGap alias == incremental per window');
eq(eRes.builderInput.weeklyPlanningFacts.map(function (f) { return f.cumulativeGapQty; }), [10, 20, 30, 40], 'cumulativeGapQty preserved separately');

// =================================================================================================================
section('F–G survival attaches once (earliest active window); zero-demand windows get no receiver');
var s = assemble({ lanes: [lane({ cumulativeGapByWindow: { D18: 0, D30: 200, D45: 300, D90: 300 }, survivalNeedQty: 300 })] });
eq(s.builderInput.overseasInput.receivers.map(function (r) { return r.demandKey.split('|')[2]; }), ['D30', 'D45'], 'F/G receivers only for active windows D30,D45 (D18,D90 excluded)');
eq(rcvByWin(s, 'D30').survivalNeedQty, 300, 'F earliest active window (D30) owns full survival');
eq(rcvByWin(s, 'D45').survivalNeedQty, 0, 'G later window (D45) survival = 0');
ok(s.builderInput.overseasInput.receivers.reduce(function (t, r) { return t + r.survivalNeedQty; }, 0) === 300, 'survival total == one canonical 18-day qty (not per-window)');

// =================================================================================================================
section('H–I demandWeight conservation');
var h = assemble({ lanes: [lane({ cumulativeGapByWindow: { D18: 0, D30: 200, D45: 500, D90: 500 }, demandWeight: 1.0 })] });
approx(h.builderInput.overseasInput.receivers.reduce(function (t, r) { return t + r.demandWeight; }, 0), 1.0, 'H Σ window weights == canonical 1.0');
approx(rcvByWin(h, 'D30').demandWeight, 0.4, 'H D30 weight = 1.0*200/500');
approx(rcvByWin(h, 'D45').demandWeight, 0.6, 'H D45 weight = 1.0*300/500');
// I: equal-canonical-weight sites -> equal total lane pull regardless of window count
var siteA = assemble({ lanes: [lane({ siteSku: 'SA', destinationWarehouseId: 'DEST-A', cumulativeGapByWindow: { D18: 200, D30: 500 }, demandWeight: 1.0 })] });
var siteB = assemble({ lanes: [lane({ siteSku: 'SB', destinationWarehouseId: 'DEST-B', cumulativeGapByWindow: { D18: 500 }, demandWeight: 1.0 })] });
approx(siteA.builderInput.overseasInput.receivers.reduce(function (t, r) { return t + r.demandWeight; }, 0),
       siteB.builderInput.overseasInput.receivers.reduce(function (t, r) { return t + r.demandWeight; }, 0), 'I two-window site does NOT out-pull equal-weight one-window site');

// =================================================================================================================
section('J demandKey convention sku|destinationWarehouseId|windowCode (deterministic, isolated)');
eq(A.weeklyDemandKey('SKU1', 'DEST-1', 'D18'), 'SKU1|DEST-1|D18', 'J format');
var j = assemble({ lanes: [lane({ cumulativeGapByWindow: { D18: 10, D30: 20 } })] });
eq(j.builderInput.overseasInput.receivers.map(function (r) { return r.demandKey; }), ['SKU1|DEST-1|D18', 'SKU1|DEST-1|D30'], 'J keys differ by window; identical across receivers/demands/facts');
eq(j.builderInput.factory.demands.map(function (d) { return d.demandKey; }), ['SKU1|DEST-1|D18', 'SKU1|DEST-1|D30'], 'J factory demands share the same demandKey');
eq(j.builderInput.weeklyPlanningFacts.map(function (f) { return f.demandKey; }), ['SKU1|DEST-1|D18', 'SKU1|DEST-1|D30'], 'J weekly facts share the same demandKey');

// =================================================================================================================
section('K–O factory identity: exact warehouse_id only; fail closed; no country inference');
eq(A.resolveWeeklyFactoryIdentity(CN, CFG), 'CN_YOUXIN', 'K exact CN id -> CN_YOUXIN');
eq(A.resolveWeeklyFactoryIdentity(TW, CFG), 'TW_SHENGYI', 'L exact TW id -> TW_SHENGYI');
eq(A.resolveWeeklyFactoryIdentity('WH-KM-CN-FACTORY-OTHER', CFG), 'UNKNOWN', 'M other CN-country factory -> UNKNOWN (no country inference)');
// M cont: an unconfigured factory pool is EXCLUDED (never classified) with an issue, not consumed.
var m = assemble({ factoryPools: [fpool('FC', CN, 100), fpool('FX', 'WH-KM-CN-FACTORY-OTHER', 100)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 } })] });
ok(m.issues.some(function (i) { return i.reason === 'UNCONFIGURED_FACTORY_POOL_EXCLUDED:WH-KM-CN-FACTORY-OTHER'; }), 'M unconfigured factory pool excluded (issue), not classified');
var mPoolWh = m.builderInput.factory.factoryPools.map(function (p) { return p.warehouseId; });
ok(mPoolWh.indexOf('WH-KM-CN-FACTORY-OTHER') === -1, 'M unconfigured factory warehouse never reaches B pools');
ok(mPoolWh.indexOf(CN) !== -1 && mPoolWh.indexOf(TW) !== -1, 'M only the two configured factory identities are represented (real CN + zero-qty TW placeholder)');
var wInactive = { 'WH-TW-CN-FACTORY-YOUXIN': WH[CN], 'WH-TW-TW-FACTORY-RES': { warehouse_id: TW, warehouse_type: 'FACTORY', is_factory_warehouse: true, is_active: false } };
var n = assemble({ warehousesById: wInactive, lanes: [lane()] });
ok(n.ready === false && n.issues[0].reason === 'FACTORY_WAREHOUSE_INACTIVE:' + TW, 'N inactive configured factory -> fail closed');
var wNonFac = { 'WH-TW-CN-FACTORY-YOUXIN': { warehouse_id: CN, warehouse_type: 'THREE_PL', is_factory_warehouse: false, is_active: true }, 'WH-TW-TW-FACTORY-RES': WH[TW] };
var oNF = assemble({ warehousesById: wNonFac, lanes: [lane()] });
ok(oNF.ready === false && oNF.issues[0].reason === 'FACTORY_WAREHOUSE_NOT_FACTORY_TYPE:' + CN, 'O non-factory configured row -> fail closed');
// overlap fail closed
var ov = assemble({ factoryIdentityConfig: { CN_YOUXIN: CN, TW_SHENGYI: CN }, lanes: [lane()] });
ok(ov.ready === false && ov.issues[0].reason === 'FACTORY_IDENTITY_OVERLAP:' + CN, 'identity overlap -> fail closed');

// =================================================================================================================
section('P–T source residual chain through the real B builder');
var P = build(assemble({ overseasSupplyPools: [opool('OV', 'W-OV', 100)], factoryPools: [fpool('FC', CN, 100), fpool('FT', TW, 100)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 } })] }));
eq([P.sourcePriority.overseasAllocatedQty, P.sourcePriority.cnAllocatedQty, P.sourcePriority.twAllocatedQty], [100, 0, 0], 'P overseas-only covers; factory untouched');
var Q = build(assemble({ factoryPools: [fpool('FC', CN, 100)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 } })] }));
eq([Q.sourcePriority.cnAllocatedQty, Q.sourcePriority.twAllocatedQty], [100, 0], 'Q CN-only covers');
var Rr = build(assemble({ factoryPools: [fpool('FT', TW, 100)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 } })] }));
eq([Rr.sourcePriority.cnAllocatedQty, Rr.sourcePriority.twAllocatedQty], [0, 100], 'R TW-only covers (CN empty)');
var S = build(assemble({ overseasSupplyPools: [opool('OV', 'W-OV', 30)], factoryPools: [fpool('FC', CN, 100)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 } })] }));
eq([S.sourcePriority.overseasAllocatedQty, S.sourcePriority.cnAllocatedQty], [30, 70], 'S overseas 30 -> CN residual 70');
var T = build(assemble({ overseasSupplyPools: [opool('OV', 'W-OV', 30)], factoryPools: [fpool('FC', CN, 30), fpool('FT', TW, 100)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 } })] }));
eq([T.sourcePriority.overseasAllocatedQty, T.sourcePriority.cnAllocatedQty, T.sourcePriority.twAllocatedQty], [30, 30, 40], 'T overseas 30 -> CN 30 -> TW 40 residual chain');

// =================================================================================================================
section('U–W count-once (shared pool <=100%, supply once, demand once) through B');
var uw = assemble({ factoryPools: [fpool('FC', CN, 50)],
  lanes: [lane({ siteSku: 'S1', destinationWarehouseId: 'DEST-1', cumulativeGapByWindow: { D18: 40 } }),
          lane({ siteSku: 'S2', destinationWarehouseId: 'DEST-2', cumulativeGapByWindow: { D18: 40 } })] });
var uwB = build(uw);
eq(uwB.sourcePriority.cnAllocatedQty, 50, 'U/V shared CN pool allocated exactly 50 (never 80)');
ok((lineBy(uwB, 'S1').recommendedQty + lineBy(uwB, 'S2').recommendedQty) === 50, 'W the 50 units split across demands, sum == 50 (no unit/demand counted twice)');

// =================================================================================================================
section('X–Y carton FLOOR + residual preserved');
var x = build(assemble({ factoryPools: [fpool('FC', CN, 95)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 }, unitsPerCarton: 24 })] }));
eq(lineBy(x, 'S1').recommendedQty, 72, 'X FLOOR(95/24)*24 = 72');
eq(lineBy(x, 'S1').unresolvedProductionNeedQty, 28, 'Y residual 28 preserved (100-72)');

// =================================================================================================================
section('Z–AA blocked: invalid UPC & missing destination');
var z = build(assemble({ factoryPools: [fpool('FC', CN, 95)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 }, unitsPerCarton: 0 })] }));
eq(lineBy(z, 'S1').blockedReason, 'MISSING_OR_INVALID_UNITS_PER_CARTON', 'Z invalid UPC -> blocked line');
eq(lineBy(z, 'S1').recommendedQty, null, 'Z blocked -> recommendedQty null');
var aa = assemble({ lanes: [lane({ destinationWarehouseId: '', cumulativeGapByWindow: { D18: 100 } })] });
ok(aa.issues.some(function (i) { return i.reason === 'MISSING_DESTINATION_WAREHOUSE'; }), 'AA missing destination -> fail-closed issue');
eq(aa.builderInput.overseasInput.receivers.length, 0, 'AA missing-destination lane produces no receiver (never ships to unknown dest)');

// =================================================================================================================
section('AB fulfillment-model pool eligibility preserved');
var abFba = build(assemble({ overseasSupplyPools: [opool('OV', 'W-OV', 100, 'FBA')], lanes: [lane({ eligiblePoolTypes: ['FBA'], cumulativeGapByWindow: { D18: 100 } })] }));
eq(abFba.sourcePriority.overseasAllocatedQty, 100, 'AB FBA receiver draws from FBA pool');
var abMismatch = build(assemble({ overseasSupplyPools: [opool('OV', 'W-OV', 100, 'FBA')], factoryPools: [fpool('FC', CN, 100)], lanes: [lane({ eligiblePoolTypes: ['THREE_PL'], cumulativeGapByWindow: { D18: 100 } })] }));
eq(abMismatch.sourcePriority.overseasAllocatedQty, 0, 'AB THREE_PL-only receiver does NOT draw from FBA pool (lane separation preserved)');

// =================================================================================================================
section('AC–AE provenance');
eq(assemble().builderInput.formulaVersion, 'WEEKLY_AI_PLAN_V1', 'AD formulaVersion = WEEKLY_AI_PLAN_V1');
ok(assemble().builderInput.formulaVersion !== 'ORDER_PLANNING_GAP', 'AE never ORDER_PLANNING_GAP');
eq(assemble().builderInput.sourceDataAsOf, '2026-08-18T00:00:00Z', 'AC sourceDataAsOf carried from canonical maxAsOf input (no clock)');
eq(build(assemble({ overseasSupplyPools: [opool('OV', 'W-OV', 100)], lanes: [lane()] })).allocationProjection.sourceDataAsOf, '2026-08-18T00:00:00Z', 'AC sourceDataAsOf flows into B projection');

// =================================================================================================================
section('AF–AG purity / determinism');
var inParams = { planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US', marketplace: 'amz' }, masterSku: 'SKU1', sourceDataAsOf: '2026-08-18T00:00:00Z', factoryIdentityConfig: CFG, warehousesById: WH, overseasSupplyPools: [opool('OV', 'W-OV', 30)], factoryPools: [fpool('FC', CN, 30), fpool('FT', TW, 100)], lanes: [lane({ cumulativeGapByWindow: { D18: 100 } })] };
var before = JSON.stringify(inParams);
var r1 = A.assembleWeeklySourceAllocationInput(inParams);
var r2 = A.assembleWeeklySourceAllocationInput(JSON.parse(before));
ok(JSON.stringify(inParams) === before, 'AF assembler does not mutate its input');
eq(r1, r2, 'AG deterministic: identical input -> identical output');

// =================================================================================================================
section('AH–AL no side effects / DTO boundary / monthly unchanged');
eq(Object.keys(assemble().builderInput).sort(), ['businessScope', 'factory', 'formulaVersion', 'masterSku', 'overseasInput', 'planningCycle', 'sourceDataAsOf', 'weeklyPlanningFacts'], 'AH–AK DTO carries ONLY B input keys (no request_order/PO/shipping_plan/reservation fields)');
var apiKeys = Object.keys(A).sort();
ok(apiKeys.indexOf('persist') === -1 && apiKeys.indexOf('persistWeeklyRecommendationDraft') === -1 && apiKeys.indexOf('createRequestOrder') === -1, 'AH–AK assembler exposes no persistence/order/shipment function');
eq(R.TABLES.MONTHLY_ORDER.scope, ['planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku'], 'AL MONTHLY_ORDER path unchanged');
eq(A._version, 'f1-7n-d0-b-r1', 'assembler version tag');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN INPUT ASSEMBLER (F1-7N-D0-B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
