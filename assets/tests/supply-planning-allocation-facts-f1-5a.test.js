// Kitchen Mama Operation System — Allocation-Fact Producer Runtime (F1-5-A) focused suite.
// Run: node assets/tests/supply-planning-allocation-facts-f1-5a.test.js
// -----------------------------------------------------------------------------
// Proves the NEW pure producer supply-planning-allocation-facts.js (KMAF) derives the caller-owned planning facts by
// INVOKING frozen owners (never reimplementing a formula), seams the genuinely caller-owned inputs (destination /
// window / required-by / demand driver / §7 forecast basis) with structured issues (never fake 0 / never eligible=
// true default), and that the REAL recommendation resolver consumes the produced facts (calculateGap +
// calculateShippingAndResidual invoked). No DB / Sheet / API / clock / RNG.

'use strict';
var KMAF = require('../js/core/supply-planning-allocation-facts.js');
var KMSF = require('../js/core/supply-planning-source-facts.js');
var CALC = require('../js/core/supply-planning-calculations.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function jsonSafe(o) { try { return JSON.parse(JSON.stringify(o)) && true; } catch (e) { return false; } }

// ---- fixtures ---------------------------------------------------------------------------------------------
// §22 sales basis: 10 confirmed normal days @ 10 units → avgSalesPerDay = 10.
function salesBasis(sku, mkt) {
  var rows = [];
  for (var d = 10; d < 20; d++) rows.push({ date: '2026-07-' + d, units: 10, sku: sku, country: 'US', marketplace: mkt, channel: 'amazon', company: 'KM' });
  return { calcDate: '2026-08-01', weekly7d: 70, scope: { sku: sku, company: 'KM', country: 'US', marketplace: mkt, channel: 'amazon' }, dailySales: rows, campaigns: [], events: [] };
}
var WAREHOUSES = [
  { warehouse_id: 'WH_3PL_US', warehouse_type: '3PL', is_active: true, is_factory_warehouse: false, company: 'KM', country: 'US' },
  { warehouse_id: 'WH_FAC_TW', warehouse_type: 'FACTORY', is_active: true, is_factory_warehouse: true, company: 'KM', country: 'TW' },
  { warehouse_id: 'WH_3PL_OLD', warehouse_type: '3PL', is_active: false, is_factory_warehouse: false, company: 'KM', country: 'US' }
];

function weeklyReceiver(over) {
  var r = {
    receiverKey: 'RCV_A', demandRef: 'D1', demandKey: 'DK1', masterSku: 'SKU1', siteSku: 'SITE1', marketplace: 'AMAZON_US',
    company: 'KM', country: 'US', fulfillmentModel: 'self_fulfilled', demandDriver: 'SALES_DRIVEN', salesBasis: salesBasis('SKU1', 'AMAZON_US'),
    allocationPriority: 5, unitsPerCarton: 6, destinationWarehouseId: 'WH_3PL_US', windowCode: '2026-W40',
    demand: 300, destinationCurrentStock: 20, timelyQualifiedIncoming: 30, timelyApprovedCommittedSupply: 0, requiredByDate: '2026-08-20'
  };
  for (var k in (over || {})) r[k] = over[k];
  return r;
}
function baseWeeklyInput(receivers) {
  return { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: { company: 'KM', country: 'US' },
    calculationDate: '2026-08-01', receivers: receivers, warehouses: WAREHOUSES, formulaVersion: 'v4.x', sourceDataAsOf: '2026-08-01' };
}

// ===========================================================================================================
section('A. Owned eligibility predicates (§23.6/§24.9 pool · §35/§40 factory)');
ok(KMAF._threePlEligible(WAREHOUSES, 'KM', 'US') === true, 'A1 3PL eligible when active 3PL warehouse in company+country');
ok(KMAF._threePlEligible(WAREHOUSES, 'KM', 'JP') === false, 'A2 3PL NOT eligible in a country with no active 3PL warehouse');
ok(KMAF._eligibleFactoryWarehouseIds(WAREHOUSES).join(',') === 'WH_FAC_TW', 'A3 factory eligibility = is_factory_warehouse + is_active only');
ok(KMAF._eligiblePoolTypesFor('self_fulfilled', true).join(',') === 'THREE_PL', 'A4 self_fulfilled + 3PL-eligible → THREE_PL');
ok(KMAF._eligiblePoolTypesFor('platform_fulfilled', true).join(',') === 'FBA,THREE_PL', 'A5 platform_fulfilled → FBA + 3PL reserve (warehouse-eligible)');
ok(KMAF._eligiblePoolTypesFor('self_fulfilled', false).length === 0, 'A6 self_fulfilled with NO eligible 3PL warehouse → empty (fail-closed, never defaulted)');
ok(KMAF._eligiblePoolTypesFor('hybrid', true).join(',') === 'FBA,THREE_PL', 'A7 hybrid → both lanes');

section('B. Weekly single receiver — derives facts by invoking frozen owners');
(function () {
  var out = KMAF.projectAllocationFacts(baseWeeklyInput([weeklyReceiver()]));
  ok(out.ready === true && out.issues.length === 0, 'B1 ready with a complete canonical receiver');
  var rf = out.receiverFacts[0];
  ok(rf && rf.dailyDemand === 10, 'B2 dailyDemand = §22 normalizedAvgSalesPerDay (10) — invoked, not reimplemented');
  ok(rf.demandWeight === 1, 'B3 single-receiver demandWeight share = 1 (basis_i ÷ Σ)');
  ok(rf.eligiblePoolTypes.join(',') === 'THREE_PL', 'B4 eligiblePoolTypes derived from warehouses + fulfillment');
  ok(rf.destinationWarehouseId === 'WH_3PL_US', 'B5 destination resolved from the fact seam');
  ok(!has(rf, 'survivalNeedQty'), 'B6 survival NOT recomputed here (fact carries dailyDemand; §20.3 owner is the consumer)');
  ok(out.planningFacts[0].windowCode === '2026-W40' && out.planningFacts[0].demand === 300, 'B7 weekly planning fact carries windowCode + the raw gap inputs');
  ok(jsonSafe(out), 'B8 output is JSON-safe');
})();

section('C. Multi-receiver demand-weight SHARE (§7/§24.5)');
(function () {
  var r1 = weeklyReceiver({ receiverKey: 'A', demandRef: 'D1', demandKey: 'DK1', salesBasis: salesBasis('SKU1', 'AMAZON_US') });   // avg 10
  var r2 = weeklyReceiver({ receiverKey: 'B', demandRef: 'D2', demandKey: 'DK2', marketplace: 'SHOPIFY_US' });
  r2.salesBasis = salesBasis('SKU1', 'SHOPIFY_US'); r2.salesBasis.dailySales.forEach(function (x) { x.units = 30; }); // avg 30
  var out = KMAF.projectAllocationFacts(baseWeeklyInput([r1, r2]));
  ok(out.ready === true, 'C1 ready with two receivers');
  var byKey = {}; out.receiverFacts.forEach(function (f) { byKey[f.receiverKey] = f; });
  ok(Math.abs(byKey.A.demandWeight - 0.25) < 1e-9 && Math.abs(byKey.B.demandWeight - 0.75) < 1e-9, 'C2 shares = 10/40 and 30/40 (proportional; not array order)');
  ok(Math.abs((byKey.A.demandWeight + byKey.B.demandWeight) - 1) < 1e-9, 'C3 weights sum to 1 (canonical invariant)');
})();

section('D. Caller-owned seams fail closed with structured issues (never fake default)');
function codes(out) { return out.issues.map(function (i) { return i.code; }); }
(function () {
  var noDriver = KMAF.projectAllocationFacts(baseWeeklyInput([weeklyReceiver({ demandDriver: '' })]));
  ok(codes(noDriver).indexOf('DEMAND_WEIGHT_UNRESOLVED') !== -1 && noDriver.ready === false, 'D1 missing demand driver → DEMAND_WEIGHT_UNRESOLVED (mode never guessed)');
  var noDest = KMAF.projectAllocationFacts(baseWeeklyInput([weeklyReceiver({ destinationWarehouseId: '' })]));
  ok(codes(noDest).indexOf('MISSING_DESTINATION_WAREHOUSE') !== -1, 'D2 missing destination → MISSING_DESTINATION_WAREHOUSE (D-3 never inferred)');
  var noWin = KMAF.projectAllocationFacts(baseWeeklyInput([weeklyReceiver({ windowCode: '' })]));
  ok(codes(noWin).indexOf('MISSING_WINDOW_CODE') !== -1, 'D3 missing windowCode → MISSING_WINDOW_CODE');
  var badMkt = KMAF.projectAllocationFacts(baseWeeklyInput([weeklyReceiver({ fulfillmentModel: 'self_fulfilled', country: 'JP' })]));
  // country JP has no active 3PL warehouse in fixture → 3PL not eligible → self_fulfilled has no pool
  var jpInput = baseWeeklyInput([weeklyReceiver({ fulfillmentModel: 'self_fulfilled' })]); jpInput.businessScope.country = 'JP';
  var noPool = KMAF.projectAllocationFacts(jpInput);
  ok(codes(noPool).indexOf('POOL_ELIGIBILITY_UNRESOLVED') !== -1, 'D4 no eligible pool → POOL_ELIGIBILITY_UNRESOLVED (never eligible=true default)');
  var fc = KMAF.projectAllocationFacts(baseWeeklyInput([weeklyReceiver({ demandDriver: 'FORECAST_DRIVEN', salesBasis: undefined,
    forecastBasis: { forecastMonth1: { month: '2026-08', baseForecast: 300 }, forecastMonth2: { month: '2026-09', baseForecast: 300 }, targetRules: {}, specialEventDemand: 0 } })]));
  ok(codes(fc).indexOf('DEMAND_WEIGHT_UNRESOLVED') !== -1, 'D5 Forecast-Driven with no forecastShareQty seam → DEMAND_WEIGHT_UNRESOLVED (§7 4-month anchor never guessed)');
})();

section('E. Forecast-driven dailyDemand invokes §2D owner; valid-zero preserved');
(function () {
  var fcReceiver = weeklyReceiver({ demandDriver: 'FORECAST_DRIVEN', salesBasis: undefined,
    forecastBasis: { forecastMonth1: { month: '2026-08', baseForecast: 310 }, forecastMonth2: { month: '2026-09', baseForecast: 300 }, targetRules: {}, specialEventDemand: 0, forecastShareQty: 610 } });
  var out = KMAF.projectAllocationFacts(baseWeeklyInput([fcReceiver]));
  // §2D: adjustedRegularForecast=610, totalDays=Aug31+Sep30=61 → forecastDailyDemand=610/61=10
  ok(out.ready === true && Math.abs(out.receiverFacts[0].dailyDemand - 10) < 1e-9, 'E1 forecast dailyDemand = §2D forecastDailyDemand (610/61=10)');
  var zero = weeklyReceiver({ demandDriver: 'FORECAST_DRIVEN', salesBasis: undefined,
    forecastBasis: { forecastMonth1: { month: '2026-08', baseForecast: 0 }, forecastMonth2: { month: '2026-09', baseForecast: 0 }, targetRules: {}, specialEventDemand: 0, forecastShareQty: 5 } });
  var zout = KMAF.projectAllocationFacts(baseWeeklyInput([zero]));
  ok(zout.ready === true && zout.receiverFacts[0].dailyDemand === 0, 'E2 explicit zero forecast → dailyDemand 0 (valid zero, not missing)');
})();

section('F. Determinism (permutation-invariant, input not mutated)');
(function () {
  var a = weeklyReceiver({ receiverKey: 'A', demandRef: 'D1', demandKey: 'DK1' });
  var b = weeklyReceiver({ receiverKey: 'B', demandRef: 'D2', demandKey: 'DK2', marketplace: 'SHOPIFY_US' }); b.salesBasis = salesBasis('SKU1', 'SHOPIFY_US');
  var in1 = baseWeeklyInput([a, b]); var frozen = JSON.stringify(in1);
  var o1 = KMAF.projectAllocationFacts(in1);
  var o2 = KMAF.projectAllocationFacts(baseWeeklyInput([b, a]));
  ok(JSON.stringify(o1.receiverFacts) === JSON.stringify(o2.receiverFacts), 'F1 permutation-invariant receiverFacts');
  ok(JSON.stringify(in1) === frozen, 'F2 input not mutated');
})();

section('G. Monthly — factory eligibility + required-by seam');
(function () {
  function monthlyReceiver(over) {
    var r = { receiverKey: 'M1', demandRef: 'MD1', demandKey: 'MDK1', masterSku: 'SKU1', marketplace: 'AMAZON_US', company: 'KM', country: 'US',
      allocationPriority: 5, unitsPerCarton: 6, destinationWarehouseId: 'WH_3PL_US', requiredByDate: '2026-09-15', requestMonth: '2026-09', requestBucket: 'T1',
      netOrderNeed: 500 };
    for (var k in (over || {})) r[k] = over[k]; return r;
  }
  var base = { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-09', businessScope: { company: 'KM', country: 'US' }, calculationDate: '2026-08-01', warehouses: WAREHOUSES };
  function inp(recv) { var o = {}; for (var k in base) o[k] = base[k]; o.receivers = recv; return o; }
  var out = KMAF.projectAllocationFacts(inp([monthlyReceiver()]));
  ok(out.ready === true && out.factoryDemandFacts[0].eligibleFactoryWarehouseIds.join(',') === 'WH_FAC_TW', 'G1 factory demand fact carries §35/§40 eligible factory warehouses');
  ok(out.planningFacts[0].requestMonth === '2026-09' && out.planningFacts[0].netOrderNeed === 500, 'G2 monthly planning fact carries requestMonth + net-order-need input');
  var noRbd = KMAF.projectAllocationFacts(inp([monthlyReceiver({ requiredByDate: '' })]));
  ok(codes(noRbd).indexOf('MISSING_REQUIRED_BY_DATE') !== -1, 'G3 missing required-by → MISSING_REQUIRED_BY_DATE (§6 seam, never invented)');
})();

// ===========================================================================================================
section('H. END-TO-END reachability — producer facts consumed by the REAL resolver chain');
(function () {
  var out = KMAF.projectAllocationFacts(baseWeeklyInput([weeklyReceiver()]));
  ok(out.ready === true, 'H0 producer ready');
  // Hand-built frozen LEDGER OUTPUT shape (the §39 builders' output; identity links by demandKey).
  var demandLedger = { entries: [{ demandKey: 'DK1', state: 'COUNTED', company: 'KM', masterSku: 'SKU1', country: 'US',
    marketplace: 'AMAZON_US', destinationWarehouseId: 'WH_3PL_US', effectiveDemandQty: 300 }] };
  var supplyLedger = { pools: [{ poolKey: 'KM|WH_3PL_US|SKU1|THREE_PL', poolType: 'THREE_PL', warehouseId: 'WH_3PL_US', effectiveSupplyQty: 120, state: 'COUNTED' }] };
  var ap = KMSF.projectAllocationInputs({
    identity: { company: 'KM', country: 'US', masterSku: 'SKU1', fulfillmentModel: 'self_fulfilled' },
    demandLedger: demandLedger, supplyLedger: supplyLedger,
    receiverFacts: out.receiverFacts, factoryDemandFacts: []
  });
  ok(ap.ready === true, 'H1 REAL projectAllocationInputs consumes the produced receiverFacts (survival derived from dailyDemand)');
  ok(ap.overseasAllocation && ap.overseasAllocation.allocations.length > 0, 'H2 REAL overseas allocator ran and allocated the shared pool');
  var wk = KMSF.resolveWeeklyRecommendationFacts({
    planningCycle: '2026-W40', businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' },
    allocationProjection: ap, weeklyPlanningFacts: out.planningFacts, formulaVersion: 'v4.x', sourceDataAsOf: '2026-08-01'
  });
  var line = wk.lines[0];
  ok(line && line.blockedReason === null, 'H3 REAL resolveWeeklyRecommendationFacts produced an unblocked line from produced facts');
  // gap = calculateGap(300 - 20 - 30 - 0) = 250 (proves the frozen calculateGap owner was invoked via the 4 inputs)
  ok(line.calculatedGap === CALC.calculateGap({ demand: 300, destinationCurrentStock: 20, timelyQualifiedIncoming: 30, timelyApprovedCommittedSupply: 0 }), 'H4 calculatedGap === frozen calculateGap owner result (250)');
  ok(typeof line.recommendedQty === 'number' && line.recommendedQty >= 0 && line.recommendedQty % 6 === 0, 'H5 recommendedQty is a real carton-FLOOR from calculateShippingAndResidual');
})();

// ===========================================================================================================
console.log('\n----------------------------------------');
console.log('ALLOCATION-FACT PRODUCER (F1-5-A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
