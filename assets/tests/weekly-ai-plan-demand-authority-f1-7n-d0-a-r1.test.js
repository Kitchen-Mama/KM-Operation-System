// Kitchen Mama Operation System — F1-7N-D0-A Weekly AI Plan demand-grain / survival / weight / factory-identity
// AUTHORITY FREEZE guard. Run: node assets/tests/weekly-ai-plan-demand-authority-f1-7n-d0-a-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// This suite is the EXECUTABLE CONTRACT for the user-frozen Weekly AI Plan authority (F1-7N-D0-A). It does NOT
// implement the D0-B backend assembler — it encodes the frozen deterministic rules as test-local reference helpers
// and LOCKS them, so the later assembler MUST conform. It also (a) exercises the ALREADY-FROZEN F1-7N-B builder
// end-to-end for the count-once / <=100% / carton-FLOOR invariants using the CONFIRMED factory warehouse_ids, and
// (b) asserts the SSOT docs carry the frozen tokens (WEEKLY_AI_PLAN_V1, confirmed ids, incremental/survival/weight
// conservation) so the authority cannot silently regress. No runtime module is added by this round.
//
// USER-CONFIRMED FACTORY IDENTITY (production warehouses master, Phase 1):
//   CN_YOUXIN  -> warehouse_id WH-TW-CN-FACTORY-YOUXIN (warehouse_code CN_YOUXIN, FACTORY, country CN, active)
//   TW_SHENGYI -> warehouse_id WH-TW-TW-FACTORY-RES    (warehouse_code TW_RES,    FACTORY, country TW, active)
// warehouse_id is the ONLY runtime identity; country/name/code/token are NEVER used to derive identity.

var fs = require('fs'), path = require('path');
var B = require('../js/core/supply-planning-weekly-source-allocation.js');
var R = require('../js/core/supply-planning-persistence-repository.js');
var C1 = require('../js/core/supply-planning-weekly-recommendation-draft.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function approx(a, e, l) { if (Math.abs(a - e) < 1e-9) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + e + '\n  got ' + a); } }
function section(n) { console.log('\n== ' + n + ' =='); }

// =================================================================================================================
// FROZEN CONTRACT REFERENCE HELPERS (F1-7N-D0-A). These ARE the executable authority; the D0-B assembler must match.
// =================================================================================================================

// §35A.7 cumulative -> incremental demand projection. incremental(n) = max(0, cum(n) - runningMax(cum(1..n-1))).
function incrementalNeeds(cum) {
  var out = [], runMax = 0;
  for (var i = 0; i < cum.length; i++) {
    var g = Math.max(0, cum[i]);
    out.push(Math.max(0, g - runMax));
    if (g > runMax) runMax = g;
  }
  return out;
}

// §35A.8 survival-once: full canonical site survival on the EARLIEST window with incrementalNeed>0, else 0.
function assignSurvivalOnce(increments, siteSurvivalNeedQty) {
  var earliest = -1;
  for (var i = 0; i < increments.length; i++) { if (increments[i] > 0) { earliest = i; break; } }
  return increments.map(function (inc, i) { return i === earliest ? siteSurvivalNeedQty : 0; });
}

// §35A.9 multi-window demandWeight conservation. SUM(window weights) == canonical lane weight (split proportional to
// each window's incrementalNeed; zero-need window -> zero weight; total-need 0 -> all zero / emit no receiver).
function splitWeight(canonicalLaneWeight, increments) {
  var total = 0; increments.forEach(function (x) { if (x > 0) total += x; });
  if (total === 0) return increments.map(function () { return 0; });
  return increments.map(function (x) { return x > 0 ? (canonicalLaneWeight * x / total) : 0; });
}

// §35A.10 canonical weekly demandKey = {sku}|{destinationWarehouseId}|{windowCode}.
function weeklyDemandKey(sku, destinationWarehouseId, windowCode) { return [sku, destinationWarehouseId, windowCode].join('|'); }

// §35A.11 factory identity: EXACT full warehouse_id config match only — never country/name/code/token inference.
var FACTORY_IDENTITY_CONFIG = { CN_YOUXIN: 'WH-TW-CN-FACTORY-YOUXIN', TW_SHENGYI: 'WH-TW-TW-FACTORY-RES' };
function resolveWeeklyFactoryIdentity(warehouseId, config) {
  if (config.CN_YOUXIN === warehouseId) return 'CN_YOUXIN';
  if (config.TW_SHENGYI === warehouseId) return 'TW_SHENGYI';
  return 'UNKNOWN'; // fail closed — no country/name/token fallback
}
function isTrue(v) { return v === true || v === 'TRUE' || v === 'true'; }
function validateFactoryConfig(config, whById) {
  var wids = {}, idents = Object.keys(config);
  for (var i = 0; i < idents.length; i++) {
    var ident = idents[i], wid = config[ident];
    if (wids[wid]) return { ok: false, reason: 'IDENTITY_OVERLAP:' + wid };
    wids[wid] = ident;
    var row = whById[wid];
    if (!row) return { ok: false, reason: 'CONFIGURED_WAREHOUSE_MISSING:' + wid };
    if (String(row.warehouse_type) !== 'FACTORY') return { ok: false, reason: 'NOT_FACTORY_TYPE:' + wid };
    if (!isTrue(row.is_factory_warehouse)) return { ok: false, reason: 'NOT_FACTORY_WAREHOUSE:' + wid };
    if (!isTrue(row.is_active)) return { ok: false, reason: 'INACTIVE:' + wid };
  }
  return { ok: true };
}

// CONFIRMED production warehouse rows (for config validation guards)
var WH_BY_ID = {
  'WH-TW-CN-FACTORY-YOUXIN': { warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', warehouse_code: 'CN_YOUXIN', warehouse_type: 'FACTORY', country: 'CN', is_factory_warehouse: true, is_active: true },
  'WH-TW-TW-FACTORY-RES': { warehouse_id: 'WH-TW-TW-FACTORY-RES', warehouse_code: 'TW_RES', warehouse_type: 'FACTORY', country: 'TW', is_factory_warehouse: true, is_active: true }
};

// =================================================================================================================
// A–D: cumulative -> incremental projection
// =================================================================================================================
section('A–D incremental demand projection (count the cumulative curve exactly once)');
eq(incrementalNeeds([10, 20, 30, 40]), [10, 10, 10, 10], 'A cumulative 10/20/30/40 -> 10/10/10/10');
eq(incrementalNeeds([20, 20, 20, 20]), [20, 0, 0, 0], 'B cumulative 20/20/20/20 -> 20/0/0/0');
eq(incrementalNeeds([0, 10, 10, 25]), [0, 10, 0, 15], 'C cumulative 0/10/10/25 -> 0/10/0/15');
eq(incrementalNeeds([20, 15, 30, 25]), [20, 0, 10, 0], 'D decreasing anomaly 20/15/30/25 -> 20/0/10/0 (running-max, no negative/double)');

section('L SUM(incremental) does not double-count the cumulative curve');
// The cumulative curve peaks at max(G). SUM(incremental) must equal that peak (never the naive Σ of cumulative rows).
ok(incrementalNeeds([10, 20, 30, 40]).reduce(function (a, b) { return a + b; }, 0) === 40, 'L Σincremental(10/20/30/40)=40 (peak, not 100)');
ok(incrementalNeeds([20, 20, 20, 20]).reduce(function (a, b) { return a + b; }, 0) === 20, 'L Σincremental(20/20/20/20)=20 (peak, not 80)');
ok(incrementalNeeds([20, 15, 30, 25]).reduce(function (a, b) { return a + b; }, 0) === 30, 'L Σincremental(20/15/30/25)=30 (running-max peak)');

// =================================================================================================================
// E–G: survival protection count-once
// =================================================================================================================
section('E–G survival protection applied exactly once (earliest non-zero incremental window)');
eq(assignSurvivalOnce([200, 100, 50, 0], 300), [300, 0, 0, 0], 'E/G D18>0 -> D18 owns full survival; later windows 0');
eq(assignSurvivalOnce([0, 200, 300, 100], 300), [0, 300, 0, 0], 'F earliest non-zero (D30) owns survival; D45/D90 = 0');
eq(assignSurvivalOnce([0, 0, 0, 0], 300), [0, 0, 0, 0], 'survival not generated when no window has incremental need');
ok(assignSurvivalOnce([200, 100, 50, 0], 300).reduce(function (a, b) { return a + b; }, 0) === 300, 'survival total == ONE canonical 18-day quantity (never 4x)');

// =================================================================================================================
// H–K: multi-window demandWeight conservation (fixes WEEKLY_MULTIWINDOW_DEMAND_WEIGHT_DOUBLE_COUNT)
// =================================================================================================================
section('H–K demandWeight conservation: SUM(window weights) == canonical lane weight');
var w2 = splitWeight(1.0, [200, 300, 0, 0]);        // two active windows, canonical lane weight 1.0
approx(w2.reduce(function (a, b) { return a + b; }, 0), 1.0, 'H two windows: Σ weights == 1.0 (not 2.0)');
approx(w2[0], 0.4, 'H window D18 weight = 1.0 * 200/500');
approx(w2[1], 0.6, 'H window D30 weight = 1.0 * 300/500');
eq([w2[2], w2[3]], [0, 0], 'K zero-incremental windows carry zero weight');
var w4 = splitWeight(1.0, [100, 100, 100, 100]);    // four active windows
approx(w4.reduce(function (a, b) { return a + b; }, 0), 1.0, 'J four windows: Σ weights == 1.0 (not 4.0)');
// I: a site with TWO windows must not out-pull an equal-weight site with ONE window in a shared lane.
var siteA = splitWeight(1.0, [200, 300, 0, 0]);     // Site A: two windows, canonical 1.0
var siteB = splitWeight(1.0, [500, 0, 0, 0]);       // Site B: one window, canonical 1.0
approx(siteA.reduce(function (a, b) { return a + b; }, 0), siteB.reduce(function (a, b) { return a + b; }, 0), 'I equal canonical weight -> equal total lane pull regardless of window count (no double-count)');
var wZero = splitWeight(1.0, [0, 0, 0, 0]);
eq(wZero, [0, 0, 0, 0], 'total incremental 0 -> all weights 0 (emit no active receiver)');

// =================================================================================================================
// M–O: canonical demandKey determinism / isolation
// =================================================================================================================
section('M–O demandKey = sku|destinationWarehouseId|windowCode');
eq(weeklyDemandKey('GA0450', 'DEST-1', 'D18'), 'GA0450|DEST-1|D18', 'M deterministic format');
ok(weeklyDemandKey('GA0450', 'DEST-1', 'D18') === weeklyDemandKey('GA0450', 'DEST-1', 'D18'), 'M identical logical demand -> identical key');
ok(weeklyDemandKey('GA0450', 'DEST-1', 'D18') !== weeklyDemandKey('GA0450', 'DEST-2', 'D18'), 'N destination change -> key changes');
ok(weeklyDemandKey('GA0450', 'DEST-1', 'D18') !== weeklyDemandKey('GA0450', 'DEST-1', 'D30'), 'O window change -> key changes');

// =================================================================================================================
// P–T: factory identity — exact warehouse_id only, fail-closed, no country inference
// =================================================================================================================
section('P–T factory identity resolves ONLY from exact warehouse_id; fail-closed; country inference forbidden');
eq(resolveWeeklyFactoryIdentity('WH-TW-CN-FACTORY-YOUXIN', FACTORY_IDENTITY_CONFIG), 'CN_YOUXIN', 'P CN exact id -> CN_YOUXIN');
eq(resolveWeeklyFactoryIdentity('WH-TW-TW-FACTORY-RES', FACTORY_IDENTITY_CONFIG), 'TW_SHENGYI', 'Q TW exact id -> TW_SHENGYI');
eq(resolveWeeklyFactoryIdentity('WH-SOME-OTHER-FACTORY', FACTORY_IDENTITY_CONFIG), 'UNKNOWN', 'R unknown factory -> UNKNOWN (fail closed)');
// T: a different CN-country FACTORY warehouse is NOT the configured id -> must stay UNKNOWN (no country heuristic).
eq(resolveWeeklyFactoryIdentity('WH-KM-CN-FACTORY-OTHER', FACTORY_IDENTITY_CONFIG), 'UNKNOWN', 'T CN-country factory that is not the configured id -> UNKNOWN (country never infers identity)');
// S: overlap (same warehouse_id mapped to both identities) fails closed.
eq(validateFactoryConfig({ CN_YOUXIN: 'WH-DUP', TW_SHENGYI: 'WH-DUP' }, { 'WH-DUP': WH_BY_ID['WH-TW-CN-FACTORY-YOUXIN'] }).reason, 'IDENTITY_OVERLAP:WH-DUP', 'S identity overlap -> fail closed');
// missing configured warehouse fails closed.
eq(validateFactoryConfig(FACTORY_IDENTITY_CONFIG, { 'WH-TW-CN-FACTORY-YOUXIN': WH_BY_ID['WH-TW-CN-FACTORY-YOUXIN'] }).reason, 'CONFIGURED_WAREHOUSE_MISSING:WH-TW-TW-FACTORY-RES', 'configured TW warehouse absent -> fail closed');
// non-factory / inactive fail closed.
eq(validateFactoryConfig({ CN_YOUXIN: 'WH-X' }, { 'WH-X': { warehouse_id: 'WH-X', warehouse_type: 'THREE_PL', is_factory_warehouse: false, is_active: true } }).reason, 'NOT_FACTORY_TYPE:WH-X', 'non-FACTORY type -> fail closed');
// the CONFIRMED production config validates OK.
eq(validateFactoryConfig(FACTORY_IDENTITY_CONFIG, WH_BY_ID), { ok: true }, 'confirmed CN_YOUXIN + TW_SHENGYI config validates (exists/FACTORY/is_factory/active/no-overlap)');

// =================================================================================================================
// U–AA: end-to-end conservation via the FROZEN F1-7N-B builder, using the CONFIRMED factory warehouse_ids
// =================================================================================================================
section('U–AA count-once / <=100% / carton-FLOOR via F1-7N-B builder (confirmed CN/TW ids)');
var CN = 'WH-TW-CN-FACTORY-YOUXIN', TW = 'WH-TW-TW-FACTORY-RES';
function opool(k, w, q) { return { poolKey: k, poolType: 'THREE_PL', warehouseId: w, effectiveSupplyQty: q }; }
function rcv(demandKey, over) {
  var o = { receiverKey: 'R-' + demandKey, demandKey: demandKey, marketplace: 'amz', destinationWarehouseId: 'DEST-' + demandKey,
    fulfillmentModel: 'self_fulfilled', demandQty: 100, survivalNeedQty: 0, allocationPriority: 5, demandWeight: 1, eligiblePoolTypes: ['THREE_PL'] };
  if (over) for (var k in over) o[k] = over[k]; return o;
}
function overseas(pools, receivers) { return { company: 'KM', country: 'US', masterSku: 'SKU1', supplyPools: pools, receivers: receivers }; }
function fpool(k, w, q) { return { poolKey: k, poolType: 'FACTORY', warehouseId: w, effectiveSupplyQty: q }; }
function fdem(demandKey, over) {
  var o = { demandKey: demandKey, company: 'KM', marketplace: 'amz', destinationWarehouseId: 'DEST-' + demandKey,
    requiredByDate: '2026-09-01', allocationPriority: 5, demandQty: 100, eligibleFactoryWarehouseIds: [CN, TW] };
  if (over) for (var k in over) o[k] = over[k]; return o;
}
function factory(pools, demands) { return { factoryPools: pools, demands: demands, cnYouxinWarehouseIds: [CN], twShengyiWarehouseIds: [TW] }; }
function wf(demandKey, siteSku, gap, upc) {
  var o = { recommendationType: 'WEEKLY_SHIPPING', sku: 'SKU1', siteSku: siteSku, windowCode: 'D30', demandKey: demandKey, calculatedGap: gap };
  if (upc !== undefined) o.unitsPerCarton = upc; return o;
}
function run(over, fac, facts) { return B.buildWeeklySourceAllocation({ planningCycle: 'RECO-2026-08', businessScope: { company: 'KM', country: 'US', marketplace: 'amz' }, masterSku: 'SKU1', overseasInput: over, factory: fac, weeklyPlanningFacts: facts }); }
function lineBy(res, s) { return res.lines.filter(function (l) { return l.siteSku === s; })[0]; }

// U: Overseas consumed BEFORE factory reduces the factory residual.
var uNoOv = run(null, factory([fpool('FC', CN, 100), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 100 })]), [wf('D1', 'S1', 100, 1)]);
var uOv = run(overseas([opool('OV', 'W-OV', 30)], [rcv('D1', { demandQty: 100 })]), factory([fpool('FC', CN, 100), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 100 })]), [wf('D1', 'S1', 100, 1)]);
ok((uNoOv.sourcePriority.cnAllocatedQty + uNoOv.sourcePriority.twAllocatedQty) === 100, 'U no overseas -> factory covers full 100');
ok((uOv.sourcePriority.cnAllocatedQty + uOv.sourcePriority.twAllocatedQty) === 70 && uOv.sourcePriority.overseasAllocatedQty === 30, 'U overseas 30 first -> factory residual reduced to 70');
// V: CN consumed before TW reduces the TW residual (overseas 30 -> CN 30 -> TW 40).
var V = run(overseas([opool('OV', 'W-OV', 30)], [rcv('D1', { demandQty: 100 })]), factory([fpool('FC', CN, 30), fpool('FT', TW, 100)], [fdem('D1', { demandQty: 100 })]), [wf('D1', 'S1', 100, 1)]);
eq([V.sourcePriority.overseasAllocatedQty, V.sourcePriority.cnAllocatedQty, V.sourcePriority.twAllocatedQty], [30, 30, 40], 'V overseas 30 -> CN 30 -> TW 40 (CN reduces TW residual)');
// W: one shared CN pool cannot satisfy two demands beyond its physical quantity (count-once).
var W = run(null, factory([fpool('FC', CN, 50)], [fdem('D1', { requiredByDate: '2026-09-01', demandQty: 40 }), fdem('D2', { requiredByDate: '2026-09-01', demandQty: 40 })]), [wf('D1', 'S1', 40, 1), wf('D2', 'S2', 40, 1)]);
eq(W.sourcePriority.cnAllocatedQty, 50, 'W shared CN pool allocated exactly 50 (its quantity) — never 80');
ok((lineBy(W, 'S1').recommendedQty + lineBy(W, 'S2').recommendedQty) === 50, 'W the 50 physical units split across demands, sum == 50 (no unit counted twice)');
// X: total allocated per pool <= pool quantity.
var X = run(overseas([opool('OV', 'W-OV', 40)], [rcv('D1', { demandQty: 200 })]), factory([fpool('FC', CN, 40), fpool('FT', TW, 40)], [fdem('D1', { demandQty: 200 })]), [wf('D1', 'S1', 200, 1)]);
ok(X.sourcePriority.overseasAllocatedQty <= 40 && X.sourcePriority.cnAllocatedQty <= 40 && X.sourcePriority.twAllocatedQty <= 40, 'X no pool allocated beyond its physical quantity (<=100%)');
// Y: per-demand allocation never exceeds demand; Z: recommended_qty <= allocated; AA: carton FLOOR.
eq(lineBy(X, 'S1').recommendedQty, 120, 'Y/Z recommended 120 = total allocated (<= gap 200, never fabricated)');
var K = run(null, factory([fpool('FC', CN, 95)], [fdem('D1', { demandQty: 100 })]), [wf('D1', 'S1', 100, 24)]);
eq(lineBy(K, 'S1').recommendedQty, 72, 'AA carton FLOOR: FLOOR(95/24)*24 = 72 (no partial-carton inflation)');
eq(lineBy(K, 'S1').unresolvedProductionNeedQty, 28, 'AA residual 28 preserved (100-72)');

// =================================================================================================================
// AB–AC: versioning provenance
// =================================================================================================================
section('AB–AC formulaVersion + sourceDataAsOf provenance');
var WEEKLY_AI_PLAN_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';
eq(WEEKLY_AI_PLAN_FORMULA_VERSION, 'WEEKLY_AI_PLAN_V1', 'AB frozen Weekly formulaVersion = WEEKLY_AI_PLAN_V1 (never ORDER_PLANNING_GAP)');
ok(WEEKLY_AI_PLAN_FORMULA_VERSION !== 'ORDER_PLANNING_GAP', 'AB not the monthly ORDER_PLANNING_GAP version');
// AC: sourceDataAsOf must be a canonical fact as-of, never an execution timestamp — the B builder carries a supplied
// sourceDataAsOf verbatim into its projection (it never stamps a clock).
var acRes = B.buildWeeklySourceAllocation({ planningCycle: 'RECO-2026-08', businessScope: { company: 'KM' }, masterSku: 'SKU1', sourceDataAsOf: '2026-08-18T00:00:00Z', overseasInput: null, factory: factory([fpool('FC', CN, 50)], [fdem('D1', { demandQty: 50 })]), weeklyPlanningFacts: [wf('D1', 'S1', 50, 1)] });
eq(acRes.allocationProjection.sourceDataAsOf, '2026-08-18T00:00:00Z', 'AC sourceDataAsOf carried verbatim from canonical facts (no Date.now/execution time)');

// =================================================================================================================
// AD–AG: frozen modules unchanged
// =================================================================================================================
section('AD–AG frozen module versions / keys unchanged');
eq(B._version, 'f1-7n-b-r1', 'AD F1-7N-B builder version unchanged');
eq(R.TABLES.WEEKLY_SHIPPING.scope, ['planning_cycle', 'company', 'country', 'marketplace', 'source_page'], 'AE C0 K3 Active key unchanged');
eq(C1._version, 'f1-7n-c1-r1', 'AF C1 persistence adapter version unchanged');
eq(R.TABLES.MONTHLY_ORDER.scope, ['planning_cycle', 'company', 'country', 'marketplace', 'draft_purpose', 'sku'], 'AG MONTHLY_ORDER scope unchanged (procurement isolation)');

// =================================================================================================================
// SSOT doc-source guards — the frozen authority must be present in the canonical docs
// =================================================================================================================
section('SSOT freeze present in canonical docs');
var CALC = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'planning', 'SUPPLY_PLANNING_CALCULATION_RULES.md'), 'utf8');
var RRIS = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'planning', 'RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md'), 'utf8');
ok(/F1-7N-D0-A/.test(CALC), 'CALC doc records the F1-7N-D0-A freeze');
ok(/WEEKLY_AI_PLAN_V1/.test(CALC), 'CALC doc freezes formulaVersion WEEKLY_AI_PLAN_V1');
ok(/WH-TW-CN-FACTORY-YOUXIN/.test(CALC) && /WH-TW-TW-FACTORY-RES/.test(CALC), 'CALC doc records the confirmed CN/TW factory warehouse_ids');
ok(/incrementalNeed|incremental need/i.test(CALC), 'CALC doc freezes the incremental demand projection');
ok(/count[- ]?once/i.test(CALC), 'CALC doc freezes the count-once invariant');
ok(/F1-7N-D0-A/.test(RRIS), 'RRIS doc records the F1-7N-D0-A freeze');
ok(/WEEKLY_AI_PLAN_V1/.test(RRIS), 'RRIS doc freezes formulaVersion WEEKLY_AI_PLAN_V1');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN DEMAND AUTHORITY (F1-7N-D0-A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
