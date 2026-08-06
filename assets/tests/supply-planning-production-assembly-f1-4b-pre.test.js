// Kitchen Mama Operation System — Production Recommendation Fact Assembly (F1-4B-PRE) focused suite.
// Run: node assets/tests/supply-planning-production-assembly-f1-4b-pre.test.js
// -----------------------------------------------------------------------------
// Proves supply-planning-production-assembly.js (KMPA) turns a REALISTIC canonical snapshot fixture (NO prebuilt
// planningFacts / receiverFacts) → KMPCX → KMAF → the EXISTING production source (KMPS.buildProductionRecommendationSource)
// → existing allocator + resolver → a REAL recommendedQty, preserving the frozen properties. No DB/API/clock/RNG.

'use strict';
var KMPA = require('../js/core/supply-planning-production-assembly.js');
var KMPS = require('../js/core/supply-planning-production-source.js');
var CALC = require('../js/core/supply-planning-calculations.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function jsonSafe(o) { try { return JSON.parse(JSON.stringify(o)) && true; } catch (e) { return false; } }
function codes(out) { return out.issues.map(function (i) { return i.code; }); }

// ---- fake read-only SpreadsheetApp (writes increment a counter → proves no writes) ------------------------
var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'deleteRows', 'insertRow', 'insertRows', 'clear', 'clearContent'];
function fakeSpreadsheet(sheetMap) {
  var writes = { count: 0 };
  function fakeSheet(values) {
    var range = { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
    WRITE_METHODS.forEach(function (m) { range[m] = function () { writes.count++; return range; }; });
    var sheet = { getLastRow: function () { return values.length; }, getLastColumn: function () { return values[0] ? values[0].length : 0; }, getDataRange: function () { return range; }, getRange: function () { return range; } };
    WRITE_METHODS.forEach(function (m) { sheet[m] = function () { writes.count++; return sheet; }; });
    return sheet;
  }
  return { _writes: writes, getSheetByName: function (n) { return has(sheetMap, n) ? fakeSheet(sheetMap[n]) : null; } };
}

// ---- REALISTIC canonical snapshot fixture — identity + 4-month FC + 3PL current stock + one QI shipment ----
// NO planningFacts / receiverFacts / demandWeight / eligiblePoolTypes / calculatedGap / recommendedQty anywhere.
function sheets(over) {
  var s = {
    sku_details: [['sku', 'units_per_carton'], ['CO1100-R', 12]],
    marketplace_skus: [['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model'], ['M1', 'CO1100-R', 'KM', 'US', 'AMAZON_US', 'ST-1', 'self_fulfilled']],
    warehouses: [['warehouse_id', 'company', 'country', 'warehouse_type', 'is_active'], ['WH-3PL', 'KM', 'US', '3PL', true]],
    marketplaces: [['marketplace', 'allocation_priority'], ['AMAZON_US', 1]],
    // M = 2026-08 → weight months sep/oct/nov/dec 2026; demand-ledger month (M+1) = sep.
    fc_regular_forecast: [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep', 'oct', 'nov', 'dec'], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100, 120, 130, 140]],
    overseas_inventory_snapshot: [['warehouse_id', 'sku', 'site_sku', 'wh_available_stock', 'snapshot_date'], ['WH-3PL', 'CO1100-R', 'ST-1', 100, '2026-08-01']],
    // one qualified-incoming shipment: shipped → SHIPPED_IN_TRANSIT; ETA <= required-by (timely)
    shipments: [['shipment_id', 'shipment_line_id', 'company', 'country', 'marketplace', 'sku', 'site_sku', 'destination_warehouse_id', 'shipment_qty', 'status', 'eta', 'source_data_as_of'],
      ['SH1', 'SL1', 'KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST-1', 'WH-3PL', 24, 'shipped', '2026-08-25', '2026-08-01']]
  };
  for (var k in (over || {})) s[k] = over[k];
  return s;
}
function request(over) {
  var r = { recommendationType: 'WEEKLY_SHIPPING', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R',
    destinationWarehouseId: 'WH-3PL', calculationMonth: '2026-08', planningCycle: '2026-W40', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' };
  for (var k in (over || {})) r[k] = over[k];
  return r;
}
function readSnaps(sheetMap) { return KMPS.readCanonicalSnapshots(fakeSpreadsheet(sheetMap), null); }

// ===========================================================================================================
section('A. Request validation (explicit, mandatory; no inference)');
(function () {
  ok(codes(KMPA.assembleProductionRecommendationFacts(readSnaps(sheets()), request({ destinationWarehouseId: '' }))).indexOf('MISSING_DESTINATION_WAREHOUSE') !== -1, 'A1 missing destination blocks');
  ok(codes(KMPA.assembleProductionRecommendationFacts(readSnaps(sheets()), request({ calculationMonth: '' }))).indexOf('MISSING_CALCULATION_MONTH') !== -1, 'A2 missing calculationMonth blocks');
  ok(codes(KMPA.assembleProductionRecommendationFacts(readSnaps(sheets()), request({ planningCycle: '' }))).indexOf('MISSING_PLANNING_CYCLE') !== -1, 'A3 missing planningCycle blocks');
  ok(codes(KMPA.assembleProductionRecommendationFacts(readSnaps(sheets()), request({ demandDriver: 'SALES' }))).indexOf('UNSUPPORTED_PHASE1_DEMAND_DRIVER') !== -1, 'A4 explicit non-FORECAST driver blocked');
  var noMsk = KMPA.assembleProductionRecommendationFacts(readSnaps(sheets({ marketplace_skus: [['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model']] })), request());
  ok(codes(noMsk).indexOf('MISSING_SKU_MAPPING') !== -1, 'A5 no marketplace_skus in scope → MISSING_SKU_MAPPING');
})();

section('B. Assembly produces context + facts from raw snapshots (no prebuilt facts)');
var A = KMPA.assembleProductionRecommendationFacts(readSnaps(sheets()), request());
(function () {
  ok(A.ready === true && A.issues.length === 0, 'B1 assembly ready from raw snapshots');
  ok(A.planningContextResult.ready && A.planningContextResult.contexts.length === 1, 'B2 KMPCX context produced');
  var ctx = A.planningContextResult.contexts[0];
  ok(ctx.demandDriver === 'FORECAST', 'B3 demandDriver = FORECAST');
  ok(ctx.forecastWeightMonths.join(',') === '2026-09,2026-10,2026-11,2026-12', 'B4 forecast anchor months M+1..M+4');
  ok(ctx.forecastShareQty === 490, 'B5 forecastShareQty = Σ Regular FC (100+120+130+140), Special Event not folded');
  ok(A.allocationFactsResult.ready && A.allocationFactsResult.receiverFacts.length === 1, 'B6 KMAF receiverFacts produced (survival/weight/eligibility derived)');
  var rf = A.allocationFactsResult.receiverFacts[0];
  ok(rf.demandWeight === 1 && rf.eligiblePoolTypes.join(',') === 'THREE_PL' && typeof rf.dailyDemand === 'number', 'B7 receiverFact derived: weight/eligibility/dailyDemand');
  var pf = A.allocationFactsResult.planningFacts[0];
  ok(pf.calculatedGap === CALC.calculateGap({ demand: 100, destinationCurrentStock: 0, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }) && pf.calculatedGap === 100, 'B8 calculatedGap attached via frozen owner (=100)');
  ok(A.productionRequest && A.productionRequest.receiverFacts.length === 1 && A.productionRequest.planningFacts.length === 1, 'B9 productionRequest carries produced facts (native source-projection seam)');
  ok(A.productionRequest.forecastMonth === 'sep', 'B10 demand-ledger forecastMonth = M+1 abbrev (sep)');
  ok(jsonSafe(A), 'B11 JSON-safe');
})();

section('C. END-TO-END — assembly → EXISTING production source → allocator → resolver → real recommendedQty');
(function () {
  var ss = fakeSpreadsheet(sheets());
  var res = KMPS.buildProductionRecommendationSource(ss, A.productionRequest);
  ok(res.ready === true && res.status === 'READY' && res.persistenceStatus === 'NOT_EXECUTED', 'C1 read-only production result READY');
  ok(res.lines.length === 1 && res.lines[0].recommendedQty === 96, 'C2 REAL recommendedQty = 96 (FLOOR(MIN(gap100, allocated)/12)*12) — produced, not fixture');
  ok(A.productionRequest.planningFacts[0].calculatedGap === 100 && res.lines[0].blocked === false, 'C3 resolver consumed the frozen-owner gap (100) → unblocked line');
  ok(res.lines[0].recommendedQty % 12 === 0, 'C4 recommendedQty uses the existing carton-FLOOR owner');
  ok(ss._writes.count === 0, 'C5 no Sheet write invoked (read-only)');
  ok(res.lineage && res.lineage.supplyCount >= 1, 'C6 supply ledger built from raw snapshots (current stock + qualified incoming)');
})();

section('D. Frozen-property preservation (§12) — QI canonical / count-once / arrived=SHIPPED_IN_TRANSIT / late not covering');
(function () {
  // The qualified-incoming shipment flows through the UNCHANGED F1-3 path into the supply ledger (SHIPPED_IN_TRANSIT).
  var ss = fakeSpreadsheet(sheets());
  var res = KMPS.buildProductionRecommendationSource(ss, A.productionRequest);
  ok(res.ready === true, 'D1 chain ready with a real qualified-incoming shipment in the fixture');
  // arrived → SHIPPED_IN_TRANSIT (F1-3 / SC-11.4): change shipment status to arrived; still projects as timely supply.
  var arrived = KMPA.assembleProductionRecommendationFacts(readSnaps(sheets({ shipments: [['shipment_id', 'shipment_line_id', 'company', 'country', 'marketplace', 'sku', 'site_sku', 'destination_warehouse_id', 'shipment_qty', 'status', 'eta', 'source_data_as_of'], ['SH1', 'SL1', 'KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST-1', 'WH-3PL', 24, 'arrived', '2026-08-25', '2026-08-01']] })), request());
  var arrivedRes = KMPS.buildProductionRecommendationSource(fakeSpreadsheet(sheets({ shipments: [['shipment_id', 'shipment_line_id', 'company', 'country', 'marketplace', 'sku', 'site_sku', 'destination_warehouse_id', 'shipment_qty', 'status', 'eta', 'source_data_as_of'], ['SH1', 'SL1', 'KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST-1', 'WH-3PL', 24, 'arrived', '2026-08-25', '2026-08-01']] })), arrived.productionRequest);
  ok(arrivedRes.ready === true && arrivedRes.lines[0].recommendedQty === 96, 'D2 arrived shipment still projects (SHIPPED_IN_TRANSIT; recommendedQty stable — allocation capped by demand)');
  // LATE incoming (ETA after required-by) remains visible but does not cover: recommendedQty must not increase.
  var lateReq = request();
  var lateAsm = KMPA.assembleProductionRecommendationFacts(readSnaps(sheets({ shipments: [['shipment_id', 'shipment_line_id', 'company', 'country', 'marketplace', 'sku', 'site_sku', 'destination_warehouse_id', 'shipment_qty', 'status', 'eta', 'source_data_as_of'], ['SH1', 'SL1', 'KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST-1', 'WH-3PL', 24, 'shipped', '2027-01-01', '2026-08-01']] })), lateReq);
  var lateRes = KMPS.buildProductionRecommendationSource(fakeSpreadsheet(sheets({ shipments: [['shipment_id', 'shipment_line_id', 'company', 'country', 'marketplace', 'sku', 'site_sku', 'destination_warehouse_id', 'shipment_qty', 'status', 'eta', 'source_data_as_of'], ['SH1', 'SL1', 'KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST-1', 'WH-3PL', 24, 'shipped', '2027-01-01', '2026-08-01']] })), lateAsm.productionRequest);
  ok(lateRes.ready === true && lateRes.lines[0].recommendedQty === 96, 'D3 late incoming (ETA>required-by) visible but not covering — recommendedQty unchanged');
})();

section('E. Missing / valid-zero / determinism');
(function () {
  // missing FC month (drop dec) → KMPCX MISSING_FORECAST_WEIGHT_SOURCE (never 0)
  var miss = KMPA.assembleProductionRecommendationFacts(readSnaps(sheets({ fc_regular_forecast: [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep', 'oct', 'nov'], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100, 120, 130]] })), request());
  ok(codes(miss).indexOf('MISSING_FORECAST_WEIGHT_SOURCE') !== -1 && miss.ready === false, 'E1 missing FC month → MISSING_FORECAST_WEIGHT_SOURCE (not 0)');
  // explicit zero FC month preserved as 0 (not missing): one month explicit 0 → share = 100+0+130+140 = 370
  var zero = KMPA.assembleProductionRecommendationFacts(readSnaps(sheets({ fc_regular_forecast: [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep', 'oct', 'nov', 'dec'], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100, 0, 130, 140]] })), request());
  ok(zero.ready === true && zero.planningContextResult.contexts[0].forecastShareQty === 370, 'E2 explicit zero FC month counted as 0 (valid zero, not missing → 370)');
  // inactive destination blocks
  var off = KMPA.assembleProductionRecommendationFacts(readSnaps(sheets({ warehouses: [['warehouse_id', 'company', 'country', 'warehouse_type', 'is_active'], ['WH-3PL', 'KM', 'US', '3PL', false]] })), request());
  ok(codes(off).indexOf('DESTINATION_NOT_ELIGIBLE') !== -1, 'E3 inactive destination warehouse → DESTINATION_NOT_ELIGIBLE');
  // determinism + no mutation
  var snap = readSnaps(sheets()); var frozen = JSON.stringify(snap);
  var o1 = KMPA.assembleProductionRecommendationFacts(snap, request());
  var o2 = KMPA.assembleProductionRecommendationFacts(readSnaps(sheets()), request());
  ok(JSON.stringify(o1.productionRequest) === JSON.stringify(o2.productionRequest), 'E4 deterministic productionRequest');
  ok(JSON.stringify(snap) === frozen, 'E5 input snapshots not mutated');
})();

// ===========================================================================================================
console.log('\n----------------------------------------');
console.log('PRODUCTION ASSEMBLY (F1-4B-PRE): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
