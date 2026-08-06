// Kitchen Mama Operation System — Recommendation Planning Context Runtime (F1-5-BD) focused suite.
// Run: node assets/tests/supply-planning-planning-context-f1-5bd.test.js
// -----------------------------------------------------------------------------
// Proves KMPCX (supply-planning-planning-context.js) resolves the four Phase-1-frozen context facts from the frozen
// decisions D-F1-5B-1..3 (never inferred/defaulted), invokes the frozen §10 event owner (no duplication), and feeds
// F1-5-A (KMAF) → REAL allocator → REAL resolver. No DB/Sheet/API/clock/RNG.

'use strict';
var KMPCX = require('../js/core/supply-planning-planning-context.js');
var KMAF = require('../js/core/supply-planning-allocation-facts.js');
var KMSF = require('../js/core/supply-planning-source-facts.js');
var CALC = require('../js/core/supply-planning-calculations.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function jsonSafe(o) { try { return JSON.parse(JSON.stringify(o)) && true; } catch (e) { return false; } }
function codes(out) { return out.issues.map(function (i) { return i.code; }); }

var WAREHOUSES = [
  { warehouse_id: 'WH-US-3PL', warehouse_code: 'US3PL', warehouse_type: '3PL', is_active: true, company: 'KM', country: 'US' },
  { warehouse_id: 'WH-US-OFF', warehouse_code: 'USOFF', warehouse_type: '3PL', is_active: false, company: 'KM', country: 'US' },
  { warehouse_id: 'WH-OTHERCO', warehouse_code: 'OCO', warehouse_type: '3PL', is_active: true, company: 'OTHERCO', country: 'US' }
];
function receiver(over) {
  var r = {
    company: 'KM', country: 'US', marketplace: 'US', sku: 'GA0450', siteSku: 'SITE1',
    destinationWarehouseId: 'WH-US-3PL',
    regularForecastByMonth: { '2026-09': 100, '2026-10': 120, '2026-11': 130, '2026-12': 140 }, specialEventFacts: []
  };
  for (var k in (over || {})) r[k] = over[k];
  return r;
}
function baseInput(receivers) { return { calculationMonth: '2026-08', planningCycle: '2026-08', recommendationType: 'MONTHLY_ORDER', receivers: receivers, warehouses: WAREHOUSES }; }

// ===========================================================================================================
section('A. Destination authority (D-F1-5B-1) — explicit + validated, never inferred');
(function () {
  var ok1 = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver()]));
  ok(ok1.ready === true, 'A0 valid explicit destination resolves ready');
  var c = ok1.contexts[0];
  ok(c.destinationWarehouseId === 'WH-US-3PL' && c.destinationWarehouseCode === 'US3PL' && c.destinationWarehouseType === '3PL', 'A1 destination validated → id + code + type from warehouse_id (not name)');
  ok(codes(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ destinationWarehouseId: '' })]))).indexOf('MISSING_DESTINATION_WAREHOUSE') !== -1, 'A2 missing destination blocks');
  ok(codes(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ destinationWarehouseId: 'WH-DOES-NOT-EXIST' })]))).indexOf('DESTINATION_NOT_ELIGIBLE') !== -1, 'A3 unknown destination → DESTINATION_NOT_ELIGIBLE');
  ok(codes(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ destinationWarehouseId: 'WH-US-OFF' })]))).indexOf('DESTINATION_NOT_ELIGIBLE') !== -1, 'A4 inactive destination → DESTINATION_NOT_ELIGIBLE');
  ok(codes(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ destinationWarehouseId: 'WH-OTHERCO' })]))).indexOf('DESTINATION_NOT_ELIGIBLE') !== -1, 'A5 cross-company destination rejected (no borrowing)');
  ok(codes(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ destinationWarehouseId: ['WH-US-3PL', 'WH-OTHERCO'] })]))).indexOf('DESTINATION_AUTHORITY_CONFLICT') !== -1, 'A6 multiple destination authorities → DESTINATION_AUTHORITY_CONFLICT');
  // never inferred: a receiver with a single active KM warehouse in the fixture but NO destination supplied must still block
  ok(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ destinationWarehouseId: undefined })])).ready === false, 'A7 destination never inferred even when one eligible warehouse exists');
})();

section('B. Demand driver (D-F1-5B-2) — Phase-1 FORECAST, no dynamic classification');
(function () {
  ok(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver()])).contexts[0].demandDriver === 'FORECAST', 'B1 Phase-1 demandDriver = FORECAST');
  ok(codes(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ demandDriver: 'SALES' })]))).indexOf('UNSUPPORTED_PHASE1_DEMAND_DRIVER') !== -1, 'B2 explicit SALES driver rejected for Phase-1 replenishment');
  // adding a big sales run-rate must NOT flip the driver (no value-based classification)
  ok(KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ salesRunRate: 9999 })])).contexts[0].demandDriver === 'FORECAST', 'B3 large sales figure does not dynamically switch the driver');
})();

section('C. Forecast anchor + share (D-F1-5B-3) — M+1..M+4 Regular FC only');
(function () {
  var c = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver()])).contexts[0];
  ok(c.forecastWeightAnchor === '2026-08', 'C1 anchor = calculation month M');
  ok(c.forecastWeightMonths.join(',') === '2026-09,2026-10,2026-11,2026-12', 'C2 window = M+1..M+4');
  ok(c.forecastShareQty === 490, 'C3 forecastShareQty = Σ Regular FC (100+120+130+140)');
  ok(KMPCX._forecastWeightMonths('2026-10').join(',') === '2026-11,2026-12,2027-01,2027-02', 'C4 year boundary M=2026-10 → Nov,Dec,Jan,Feb');
  // explicit zero valid
  var z = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ regularForecastByMonth: { '2026-09': 0, '2026-10': 0, '2026-11': 0, '2026-12': 0 } })]));
  ok(z.ready === true && z.contexts[0].forecastShareQty === 0, 'C5 explicit zero FC → forecastShareQty 0 (valid zero)');
  // missing month NOT zero
  var mm = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ regularForecastByMonth: { '2026-09': 100, '2026-10': 120, '2026-11': 130 } })]));
  ok(codes(mm).indexOf('MISSING_FORECAST_WEIGHT_SOURCE') !== -1 && mm.ready === false, 'C6 missing FC month → MISSING_FORECAST_WEIGHT_SOURCE (not 0)');
  var iv = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ regularForecastByMonth: { '2026-09': -5, '2026-10': 120, '2026-11': 130, '2026-12': 140 } })]));
  ok(codes(iv).indexOf('INVALID_FORECAST_WEIGHT_VALUE') !== -1, 'C7 negative FC → INVALID_FORECAST_WEIGHT_VALUE');
  // Special Event NOT double-counted in the Regular-FC weight basis
  var se = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ specialEventFacts: [{ eventStartDate: '2026-10-15', qty: 5000 }] })]));
  ok(se.contexts[0].forecastShareQty === 490, 'C8 Special Event demand is NOT folded into the Regular-FC weight basis');
})();

section('D. Window / required-by — frozen window; §10 event owner invoked');
(function () {
  var c = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver()])).contexts[0];
  ok(c.windowStartDate === '2026-09-01', 'D1 windowStartDate = first day of M+1');
  ok(c.windowEndDate === '2026-12-31', 'D2 windowEndDate = last day of M+4');
  ok(c.requiredByDate === '2026-09-01', 'D3 Regular required-by = window start');
  ok(c.windowCode === '2026-08', 'D4 windowCode = planningCycle');
  // Special Event pull-forward: event 2026-09-20 → prep = event - 30d = 2026-08-21 (earlier than window start) via the frozen owner
  var expectedPrep = CALC.eventPreparationDate('2026-09-20');
  var se = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ specialEventFacts: [{ eventStartDate: '2026-09-20' }] })])).contexts[0];
  ok(se.requiredByDate === expectedPrep && expectedPrep === '2026-08-21', 'D5 special-event required-by = §10 eventPreparationDate (pull-forward, invoked not duplicated)');
  ok(codes(KMPCX.resolveRecommendationPlanningContext({ calculationMonth: '2026-08', receivers: [receiver()], warehouses: WAREHOUSES })).indexOf('MISSING_PLANNING_CYCLE') !== -1, 'D6 missing planningCycle blocks');
  ok(codes(KMPCX.resolveRecommendationPlanningContext({ planningCycle: '2026-08', receivers: [receiver()], warehouses: WAREHOUSES })).indexOf('MISSING_REQUIRED_BY_DATE') !== -1, 'D7 missing calculationMonth → MISSING_REQUIRED_BY_DATE (no browser-date inference)');
})();

section('E. Determinism / identity / dedupe / conflict');
(function () {
  var r1 = receiver({ sku: 'A' }), r2 = receiver({ sku: 'B' });
  var in1 = baseInput([r1, r2]); var frozen = JSON.stringify(in1);
  var o1 = KMPCX.resolveRecommendationPlanningContext(in1);
  var o2 = KMPCX.resolveRecommendationPlanningContext(baseInput([r2, r1]));
  ok(JSON.stringify(o1.contexts) === JSON.stringify(o2.contexts), 'E1 permutation-invariant contexts');
  ok(JSON.stringify(in1) === frozen, 'E2 input not mutated');
  ok(jsonSafe(o1), 'E3 JSON-safe');
  var dup = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver({ sku: 'A' }), receiver({ sku: 'A' })]));
  ok(dup.ready === true && dup.contexts.length === 1, 'E4 equal duplicate contexts dedupe to one');
  var conflict = KMPCX.resolveRecommendationPlanningContext(baseInput([
    receiver({ sku: 'A', regularForecastByMonth: { '2026-09': 100, '2026-10': 120, '2026-11': 130, '2026-12': 140 } }),
    receiver({ sku: 'A', regularForecastByMonth: { '2026-09': 999, '2026-10': 120, '2026-11': 130, '2026-12': 140 } })
  ]));
  ok(codes(conflict).indexOf('PLANNING_CONTEXT_NOT_READY') !== -1 && conflict.ready === false, 'E5 same identity, differing facts → conflict blocks');
})();

section('F. END-TO-END — context → F1-5-A (KMAF) → REAL allocator → REAL resolver');
(function () {
  var ctxOut = KMPCX.resolveRecommendationPlanningContext(baseInput([receiver()]));
  ok(ctxOut.ready === true, 'F0 context ready');
  var ctx = ctxOut.contexts[0];
  // bridge context → KMAF receiver + caller-supplied §2D dailyDemand basis + gap inputs
  var kmafReceiver = KMPCX.toAllocationFactReceiver(ctx, {
    receiverKey: 'RCV', demandRef: 'D1', demandKey: 'DK1', fulfillmentModel: 'self_fulfilled', allocationPriority: 5, unitsPerCarton: 6,
    forecastMonth1: { month: '2026-09', baseForecast: 300 }, forecastMonth2: { month: '2026-10', baseForecast: 300 }, targetRules: {}, specialEventDemand: 0,
    demand: 300, destinationCurrentStock: 20, timelyQualifiedIncoming: 30, timelyApprovedCommittedSupply: 0
  });
  ok(kmafReceiver.forecastBasis.forecastShareQty === 490 && kmafReceiver.demandDriver === 'FORECAST_DRIVEN', 'F1 bridge routes context forecastShareQty (490) as the KMAF FORECAST weight basis');
  var af = KMAF.projectAllocationFacts({ recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: { company: 'KM', country: 'US' }, calculationDate: '2026-08-01', receivers: [kmafReceiver], warehouses: WAREHOUSES });
  ok(af.ready === true, 'F2 KMAF consumes the context-derived receiver (single receiver share = 1)');
  ok(af.receiverFacts[0].demandWeight === 1, 'F3 §7 weight normalization owned by KMAF (share = 1), NOT recomputed in the context runtime');
  // REAL allocator + resolver
  var demandLedger = { entries: [{ demandKey: 'DK1', state: 'COUNTED', company: 'KM', masterSku: 'GA0450', country: 'US', marketplace: 'US', destinationWarehouseId: 'WH-US-3PL', effectiveDemandQty: 300 }] };
  var supplyLedger = { pools: [{ poolKey: 'KM|WH-US-3PL|GA0450|THREE_PL', poolType: 'THREE_PL', warehouseId: 'WH-US-3PL', effectiveSupplyQty: 120, state: 'COUNTED' }] };
  var ap = KMSF.projectAllocationInputs({ identity: { company: 'KM', country: 'US', masterSku: 'GA0450', fulfillmentModel: 'self_fulfilled' }, demandLedger: demandLedger, supplyLedger: supplyLedger, receiverFacts: af.receiverFacts, factoryDemandFacts: [] });
  ok(ap.ready === true && ap.overseasAllocation.allocations.length > 0, 'F4 REAL projectAllocationInputs + overseas allocator run with produced context');
  var wk = KMSF.resolveWeeklyRecommendationFacts({ planningCycle: '2026-W40', businessScope: { company: 'KM', country: 'US', marketplace: 'US' }, allocationProjection: ap, weeklyPlanningFacts: af.planningFacts, formulaVersion: 'v4.x', sourceDataAsOf: '2026-08-01' });
  var line = wk.lines[0];
  ok(line && line.blockedReason === null, 'F5 REAL resolveWeeklyRecommendationFacts produced an unblocked line');
  ok(line.calculatedGap === CALC.calculateGap({ demand: 300, destinationCurrentStock: 20, timelyQualifiedIncoming: 30, timelyApprovedCommittedSupply: 0 }), 'F6 calculatedGap === frozen calculateGap owner (unchanged; 250)');
  ok(typeof line.recommendedQty === 'number' && line.recommendedQty % 6 === 0, 'F7 recommendedQty is a real carton-FLOOR (resolver unchanged)');
})();

// ===========================================================================================================
console.log('\n----------------------------------------');
console.log('PLANNING CONTEXT RUNTIME (F1-5-BD): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
