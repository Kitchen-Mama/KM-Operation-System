// Kitchen Mama Operation System — §45.B.2 PRODUCER early validation, BOTH producers — S8-B3-R1A.
// Run: node assets/tests/producer-priority-emission-validation-s8-b3-r1a.test.js
// -----------------------------------------------------------------------------------------------------------
// D-S8-C2-2 fixed the scope of §45.B.2 to BOTH core producers and held the clause OPEN "until both producers pass
// their contract tests". `supply-planning-source-projection.js` is covered by the G-numbered characterization
// suite (G14/G15/G16, now CONTRACT). `supply-planning-production-assembly.js` carried the IDENTICAL defect and
// had no G number only because that suite never exercised it — so it is covered HERE, and the two are asserted
// side by side so neither can be closed on the strength of the other.
//
// THE CONTRACT (§45.A, applied at the EMISSION point):
//   • 0 is VALID and is the lowest priority — never swept up by validation.
//   • missing / null / blank  -> UNRESOLVED, the SAME answer as an absent column, and SILENT (an operator leaving
//     a cell empty is a known state, not a data error).
//   • negative / non-numeric / non-finite -> INVALID: emitted UNRESOLVED so nothing unusable travels, AND raised
//     as its own issue so INVALID stays DISTINGUISHABLE from ABSENT rather than collapsing into it.
//   • a numeric STRING stays VALID (the producers' established parsing contract treats 100 and '100' as one
//     answer); the core KMMSA input contract is NOT broadened to accept strings.
//
// Validation is at the EMISSION point and NOT in the identity map build: filtering values out of the priority map
// would change canonical-identity CONFLICT detection, which is R49-F / D-S8-A1 behaviour and out of scope.

'use strict';
var SP = require('../js/core/supply-planning-source-projection.js');
var KMPA = require('../js/core/supply-planning-production-assembly.js');
var KMPS = require('../js/core/supply-planning-production-source.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; console.log('ok   ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n     exp ' + E + '\n     got ' + A); } else { pass++; console.log('ok   ' + l); } }
function section(n) { console.log('\n== ' + n + ' =='); }
function hasOwn(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// =============================================================================================================
section('A — supply-planning-source-projection.js (the G-numbered producer)');
// =============================================================================================================
function canonical(mktRows) {
  return {
    recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40',
    businessScope: { company: 'KM', country: 'US', marketplace: 'Amazon', source_page: 'replen', sku: 'CO1100-R' },
    forecastMonth: 'sep', requiredByDate: '2026-09-01', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01',
    routing: { 'FC:F1': 'WH-3PL' },
    sourceSnapshots: {
      skuDetails: [{ sku: 'CO1100-R', units_per_carton: 12 }],
      marketplaceSkus: [{ marketplace_sku_id: 'M1', sku: 'CO1100-R', company: 'KM', country: 'US',
        marketplace: 'Amazon', site_sku: 'ST-1', fulfillment_model: 'self_fulfilled' }],
      warehouses: [{ warehouse_id: 'WH-3PL', company: 'KM', country: 'US', warehouse_type: '3PL', is_active: true }],
      marketplaces: mktRows,
      fcRegularForecast: [{ forecast_id: 'F1', year: 2026, company: 'KM', country: 'US', marketplace: 'Amazon',
        sku: 'CO1100-R', sep: 100 }],
      overseasInventorySnapshot: [{ warehouse_id: 'WH-3PL', sku: 'CO1100-R', site_sku: 'ST-1',
        wh_available_stock: 100, snapshot_date: '2026-08-01' }]
    },
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50,
      demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }]
  };
}
function proj(priorityValue) {
  var row = { company: 'KM', country: 'US', marketplace: 'Amazon' };
  if (priorityValue !== '@ABSENT@') row.allocation_priority = priorityValue;
  var p = SP.projectRecommendationProductionSources(canonical([row]));
  var out = null;
  Object.keys(p).forEach(function (k) {
    if (!out && Array.isArray(p[k]) && p[k].length && p[k][0] && hasOwn(p[k][0], 'allocation_priority')) out = p[k][0];
  });
  if (!out) throw new Error('FAIL-CLOSED: no row carrying allocation_priority was produced');
  return { priority: out.allocation_priority, issues: (p.issues || []) };
}
function projInvalidIssues(v) {
  return proj(v).issues.filter(function (x) { return /INVALID_ALLOCATION_PRIORITY/.test(String(x.reason)); });
}

eq(proj(10).priority, 10, 'A1 a positive priority is emitted unchanged');
eq(proj(0).priority, 0, 'A2 an explicit 0 is VALID and survives as 0 (the lowest priority, not "missing")');
eq(proj('@ABSENT@').priority, undefined, 'A3 an ABSENT column is UNRESOLVED');
eq(proj('').priority, undefined, 'A4 a BLANK cell is UNRESOLVED — the same answer as absent (§45.A.2)');
eq(proj(null).priority, undefined, 'A5 null is UNRESOLVED');
eq(proj('high').priority, undefined, 'A6 INVALID text is UNRESOLVED, never carried onward (G15 closed)');
eq(proj(-5).priority, undefined, 'A7 a NEGATIVE priority is INVALID and refused (G16 closed)');
eq(proj('7').priority, '7', 'A8 a numeric STRING stays VALID and keeps its TYPE (verbatim, contract unbroadened)');
eq(proj('7abc').priority, undefined, 'A9 a prefix-numeric string is INVALID (parseFloat would have read 7)');
eq(proj('1,000').priority, undefined, 'A10 a comma-formatted value is INVALID (parseFloat would have read 1)');
eq(proj(Infinity).priority, undefined, 'A11 a NON-FINITE priority is INVALID (isFinite is checked, not typeof)');

// The part that makes this a contract rather than a blanket null-out: INVALID must stay distinguishable.
eq(projInvalidIssues('@ABSENT@').length, 0, 'A12 an ABSENT priority raises NO issue — it is a state, not an error');
eq(projInvalidIssues('').length, 0, 'A13 a BLANK priority raises NO issue either');
eq(projInvalidIssues(null).length, 0, 'A14 null raises NO issue');
ok(projInvalidIssues(-5).some(function (x) { return /-5/.test(String(x.reason)); }),
   'A15 a NEGATIVE priority raises an INVALID_ALLOCATION_PRIORITY issue NAMING the offending value');
ok(projInvalidIssues('high').some(function (x) { return /high/.test(String(x.reason)); }),
   'A16 INVALID text raises an INVALID_ALLOCATION_PRIORITY issue NAMING the offending value');
eq(projInvalidIssues(10).length, 0, 'A17 a VALID priority raises no issue (the check is not firing indiscriminately)');
eq(projInvalidIssues(0).length, 0, 'A18 and neither does 0');

// =============================================================================================================
section('B — supply-planning-production-assembly.js (the sibling that had no G number)');
// =============================================================================================================
var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'deleteRows', 'insertRow', 'insertRows', 'clear', 'clearContent'];
function fakeSpreadsheet(sheetMap) {
  var writes = { count: 0 };
  function fakeSheet(values) {
    var range = { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
    WRITE_METHODS.forEach(function (m) { range[m] = function () { writes.count++; return range; }; });
    var sheet = { getLastRow: function () { return values.length; }, getLastColumn: function () { return values[0] ? values[0].length : 0; },
      getDataRange: function () { return range; }, getRange: function () { return range; } };
    WRITE_METHODS.forEach(function (m) { sheet[m] = function () { writes.count++; return sheet; }; });
    return sheet;
  }
  return { _writes: writes, getSheetByName: function (n) { return hasOwn(sheetMap, n) ? fakeSheet(sheetMap[n]) : null; } };
}
function sheets(priorityCell, omitColumn) {
  var mkt = omitColumn
    ? [['company', 'country', 'marketplace'], ['KM', 'US', 'AMAZON_US']]
    : [['company', 'country', 'marketplace', 'allocation_priority'], ['KM', 'US', 'AMAZON_US', priorityCell]];
  return {
    sku_details: [['sku', 'units_per_carton'], ['CO1100-R', 12]],
    marketplace_skus: [['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model'], ['M1', 'CO1100-R', 'KM', 'US', 'AMAZON_US', 'ST-1', 'self_fulfilled']],
    warehouses: [['warehouse_id', 'company', 'country', 'warehouse_type', 'is_active'], ['WH-3PL', 'KM', 'US', '3PL', true]],
    marketplaces: mkt,
    fc_regular_forecast: [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep', 'oct', 'nov', 'dec'], ['F1', 2026, 'KM', 'US', 'AMAZON_US', 'CO1100-R', 100, 120, 130, 140]],
    overseas_inventory_snapshot: [['warehouse_id', 'sku', 'site_sku', 'wh_available_stock', 'snapshot_date'], ['WH-3PL', 'CO1100-R', 'ST-1', 100, '2026-08-01']],
    shipments: [['shipment_id', 'shipment_line_id', 'company', 'country', 'marketplace', 'sku', 'site_sku', 'destination_warehouse_id', 'shipment_qty', 'status', 'eta', 'source_data_as_of'],
      ['SH1', 'SL1', 'KM', 'US', 'AMAZON_US', 'CO1100-R', 'ST-1', 'WH-3PL', 24, 'shipped', '2026-08-25', '2026-08-01']]
  };
}
var REQ = { recommendationType: 'WEEKLY_SHIPPING', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100-R',
  destinationWarehouseId: 'WH-3PL', calculationMonth: '2026-08', planningCycle: '2026-W40', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' };
function asm(priorityCell, omitColumn) {
  var snaps = KMPS.readCanonicalSnapshots(fakeSpreadsheet(sheets(priorityCell, omitColumn)), null);
  var A = KMPA.assembleProductionRecommendationFacts(snaps, REQ);
  var rf = A.allocationFactsResult && A.allocationFactsResult.receiverFacts && A.allocationFactsResult.receiverFacts[0];
  return { priority: rf ? rf.allocationPriority : undefined, ready: A.ready,
    invalid: (A.issues || []).filter(function (i) { return i.code === 'INVALID_ALLOCATION_PRIORITY'; }) };
}

eq(asm(1).priority, 1, 'B1 a positive priority is emitted unchanged');
eq(asm(0).priority, 0, 'B2 an explicit 0 is VALID and survives as 0');
ok(asm(0).ready === true, 'B2a and a 0 priority does NOT block the assembly');
eq(asm('').priority, null, 'B3 a BLANK cell is UNRESOLVED');
ok(asm('').ready === true && asm('').invalid.length === 0,
   'B3a a BLANK cell raises NO INVALID issue — absent and blank are the same state (§45.A.2)');
eq(asm(null, true).priority, null, 'B4 an ABSENT allocation_priority column is UNRESOLVED');
ok(asm(null, true).invalid.length === 0, 'B4a and raises no INVALID issue');
eq(asm(-5).priority, null, 'B5 a NEGATIVE priority is INVALID and never travels');
ok(asm(-5).invalid.length === 1, 'B5a a NEGATIVE priority raises exactly one INVALID_ALLOCATION_PRIORITY issue');
ok(asm(-5).ready === false, 'B5b and the assembly FAILS CLOSED rather than returning a result built on it');
eq(asm('high').priority, null, 'B6 INVALID text is UNRESOLVED');
ok(asm('high').invalid.length === 1 && asm('high').ready === false, 'B6a INVALID text raises its issue and fails closed');
ok(/high/.test(JSON.stringify(asm('high').invalid)), 'B6b and the issue NAMES the offending value');
ok(asm('7').priority === 7 || asm('7').priority === '7', 'B7 a numeric STRING stays VALID (not refused)');
ok(asm('7').ready === true && asm('7').invalid.length === 0, 'B7a and raises no issue');
eq(asm('7abc').priority, null, 'B8 a prefix-numeric string is INVALID here too');

// =============================================================================================================
section('C — NON-VACUITY: the suite can tell a fixed producer from a broken one');
// =============================================================================================================
// If either producer reverted to carrying the value through verbatim, A7/B5 would observe -5 rather than
// unresolved. Assert the two observations are genuinely different objects of comparison, so a change in either
// direction is caught rather than silently matching.
ok(proj(-5).priority !== -5, 'C1 the projection producer no longer emits the negative verbatim');
ok(asm(-5).priority !== -5, 'C2 the assembly producer no longer emits the negative verbatim');
ok(proj(10).priority === 10 && asm(1).priority === 1,
   'C3 and a VALID value is still emitted — the validation refuses the unusable, not everything');

console.log('\n----------------------------------------');
console.log('PRODUCER PRIORITY EMISSION VALIDATION (S8-B3-R1A): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
