// =============================================================================================================
// S8-R49-E · E1 — KNOWN DEFECT CHARACTERIZATION: cross-company Marketplace Priority identity collision
// -------------------------------------------------------------------------------------------------------------
// THIS FILE IS EXPECTED TO FAIL. It asserts the CONTRACT, and the shipped producers do not meet it. Running it
// is how the defect stays visible and falsifiable; the day the producers are fixed, the contract assertions go
// green and this file must be PROMOTED to a normal `.test.js` suite.
//
// WHY IT IS NOT A `.test.js`. The sweep registry is `/\.test\.js$/` with no exclusion list, so any `.test.js`
// joins the measured baseline (R48-S: 627 CLEAN / 0 FAILING / 0 UNVERIFIABLE). A permanently-red registered
// suite would corrupt that invariant and every future round would have to special-case it. So the
// characterization is isolated by extension, and a REGISTERED sentinel
// (marketplace-priority-collision-sentinel-s8-r49-e.test.js) runs this file and asserts it still fails for
// exactly the known reasons. The failure is therefore visible in the registry without being hidden and without
// being mislabelled CLEAN.
//
// THE CONTRACT. `marketplaces` rows are identified by the composite company + country + marketplace — that is
// the upsert key in 03_master_data_handlers.gs, and marketplace_id is MKT-{COMPANY}-{COUNTRY}-{MARKETPLACE},
// derived from it. DATABASE_RELATIONSHIP_MAP.md calls allocation_priority a per-marketplace-row value, and the
// same document already forbids this exact shortcut for the sibling column: "warehouse_code is NOT globally
// unique (the same FC code repeats across companies) … never warehouse_code alone."
//
// THE DEFECT. Two producers build their priority map keyed by the marketplace NAME ALONE:
//   supply-planning-source-projection.js:148   priorityByMkt[str(r.marketplace) || str(r.marketplace_id)]
//   supply-planning-production-assembly.js:115 prByMkt[str(r.marketplace)]
// Every row sharing a marketplace name therefore overwrites the previous one, and the LAST row read wins — so
// the priority a receiver gets depends on array order, not on who the receiver is.
//
// FIXTURE VALUES (10 / 20 / 30) ARE TEST FIXTURES ONLY. They are not a proposed ranking and carry no business
// meaning. Nothing here changes the frozen §40 allocator, which is not at fault: it consumes a priority already
// attached to a fully identified receiver and fails closed when one is absent.
// =============================================================================================================
'use strict';
var path = require('path');
var SP = require(path.join(__dirname, '../js/core/supply-planning-source-projection.js'));
var KMPA = require(path.join(__dirname, '../js/core/supply-planning-production-assembly.js'));
var KMPS = require(path.join(__dirname, '../js/core/supply-planning-production-source.js'));

var contractViolations = [];   // assertions that fail because of the KNOWN defect
var unexpected = [];           // anything else — must stay empty
var pass = 0;
var fixedNow = [];             // known-defect assertions that have started PASSING -> promote this file

function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function j(v) { return JSON.stringify(v); }
function section(t) { console.log('\n== ' + t + ' =='); }

// `known` marks an assertion the shipped code is currently expected to fail.
function expect(actual, want, label, known) {
  var okNow = j(actual) === j(want);
  if (okNow) {
    pass++;
    if (known) {
      fixedNow.push(label);
      console.log('NOW-PASSING (defect appears FIXED) ' + label);
    }
    return;
  }
  var line = label + '\n      EXPECTED ' + j(want) + '\n      ACTUAL   ' + j(actual);
  if (known) { contractViolations.push(label); console.log('CONTRACT-VIOLATION ' + line); }
  else { unexpected.push(label); console.log('UNEXPECTED-FAILURE ' + line); }
}

// ---- canonical fixture rows -------------------------------------------------------------------------------
var KM_US = { company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 10 };
var RESUS_US = { company: 'ResUS', country: 'US', marketplace: 'Amazon', allocation_priority: 20 };
var KM_CA = { company: 'KM', country: 'CA', marketplace: 'Amazon', allocation_priority: 30 };

// =============================================================================================================
section('0 — the canonical identities are distinct (the premise everything else rests on)');

function identityOf(r) { return [r.company, r.country, r.marketplace].join('|'); }
function mktId(r) {
  var part = function (s) { return String(s || '').trim().toUpperCase().replace(/\s+/g, '_'); };
  return 'MKT-' + part(r.company) + '-' + part(r.country) + '-' + part(r.marketplace);
}
expect([identityOf(KM_US), identityOf(RESUS_US), identityOf(KM_CA)],
       ['KM|US|Amazon', 'ResUS|US|Amazon', 'KM|CA|Amazon'],
       'E1-1 the three fixture rows are three DISTINCT canonical identities');
expect(new Set([mktId(KM_US), mktId(RESUS_US), mktId(KM_CA)]).size, 3,
       'E1-2 and they mint three distinct marketplace_id values (MKT-{COMPANY}-{COUNTRY}-{MARKETPLACE})');
expect(new Set([KM_US.marketplace, RESUS_US.marketplace, KM_CA.marketplace]).size, 1,
       'E1-3 while sharing ONE marketplace NAME — which is exactly why name-only keying collapses them');

// =============================================================================================================
section('A — supply-planning-source-projection.js (scope = KM / US / Amazon)');

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
    // NO allocationPriority on the receiver fact, so the marketplaces fallback at line 374 is what runs.
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50,
      demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }]
  };
}
function projectionPriority(mktRows) {
  var p = SP.projectRecommendationProductionSources(canonical(mktRows));
  var row = null;
  Object.keys(p).forEach(function (k) {
    if (!row && Array.isArray(p[k]) && p[k].length && p[k][0] && has(p[k][0], 'allocation_priority')) row = p[k][0];
  });
  if (!row) throw new Error('FAIL-CLOSED: no receiver row carrying allocation_priority; keys=' + Object.keys(p).join(','));
  return row.allocation_priority;
}

expect(projectionPriority([KM_US]), 10,
       'A1 requirement 7 — a UNIQUE-name fixture is unaffected: the KM receiver gets KM\'s own 10');
expect(projectionPriority([KM_US, RESUS_US]), 10,
       'A2 requirement 2/8 — a KM-scoped receiver keeps KM\'s 10 even though ResUS also sells on "Amazon" '
       + '(ResUS\'s 20 must never reach a KM receiver)', true);
expect(projectionPriority([RESUS_US, KM_US]), 10,
       'A3 requirement 4 — and the SAME answer when the snapshot rows arrive in the other order');
expect([projectionPriority([KM_US, RESUS_US]), projectionPriority([RESUS_US, KM_US])], [10, 10],
       'A4 requirement 4 — row ORDER is not an input to a receiver\'s priority. Both orders must give 10; '
       + 'today they give different numbers, so the LAST row read is deciding.', true);
expect(projectionPriority([KM_US, KM_CA]), 10,
       'A5 requirement 5 — COUNTRY isolation: a US receiver keeps 10 and never picks up the CA row\'s 30', true);
expect([projectionPriority([KM_US, KM_CA]), projectionPriority([KM_CA, KM_US])], [10, 10],
       'A6 requirement 5 — country isolation holds in BOTH row orders too', true);
expect(projectionPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 0 }]), 0,
       'A7 requirement 6 — an explicit priority of 0 is preserved as 0 (0 is the LOWEST valid priority, '
       + 'not "absent")');
expect(projectionPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon' }]), undefined,
       'A8 requirement 6 — an ABSENT priority column stays absent and is NOT coerced to 0, so the two remain '
       + 'distinguishable at this layer');

// =============================================================================================================
section('B — supply-planning-production-assembly.js (request = KM / US / Amazon)');

var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'deleteRows', 'insertRow', 'insertRows', 'clear', 'clearContent'];
function fakeSpreadsheet(sheetMap) {
  var writes = { count: 0 };
  function fakeSheet(values) {
    var range = { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
    WRITE_METHODS.forEach(function (m) { range[m] = function () { writes.count++; return range; }; });
    var sheet = { getLastRow: function () { return values.length; },
      getLastColumn: function () { return values[0] ? values[0].length : 0; },
      getDataRange: function () { return range; }, getRange: function () { return range; } };
    WRITE_METHODS.forEach(function (m) { sheet[m] = function () { writes.count++; return sheet; }; });
    return sheet;
  }
  return { _writes: writes, getSheetByName: function (n) { return has(sheetMap, n) ? fakeSheet(sheetMap[n]) : null; } };
}
var MKT_HDR = ['company', 'country', 'marketplace', 'allocation_priority'];
function sheets(mktSheet) {
  return {
    sku_details: [['sku', 'units_per_carton'], ['CO1100-R', 12]],
    marketplace_skus: [['marketplace_sku_id', 'sku', 'company', 'country', 'marketplace', 'site_sku', 'fulfillment_model'],
      ['M1', 'CO1100-R', 'KM', 'US', 'Amazon', 'ST-1', 'self_fulfilled']],
    warehouses: [['warehouse_id', 'company', 'country', 'warehouse_type', 'is_active'], ['WH-3PL', 'KM', 'US', '3PL', true]],
    marketplaces: mktSheet,
    fc_regular_forecast: [['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'sep', 'oct', 'nov', 'dec'],
      ['F1', 2026, 'KM', 'US', 'Amazon', 'CO1100-R', 100, 120, 130, 140]],
    overseas_inventory_snapshot: [['warehouse_id', 'sku', 'site_sku', 'wh_available_stock', 'snapshot_date'],
      ['WH-3PL', 'CO1100-R', 'ST-1', 100, '2026-08-01']]
  };
}
var REQ = { recommendationType: 'WEEKLY_SHIPPING', company: 'KM', country: 'US', marketplace: 'Amazon',
  sku: 'CO1100-R', destinationWarehouseId: 'WH-3PL', calculationMonth: '2026-08', planningCycle: '2026-W40',
  formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' };
function assemblyPriority(mktRows) {
  var out = KMPA.assembleProductionRecommendationFacts(
    KMPS.readCanonicalSnapshots(fakeSpreadsheet(sheets([MKT_HDR].concat(mktRows))), null), REQ);
  if (!out.ready) throw new Error('FAIL-CLOSED: assembly blocked: ' + out.issues.map(function (i) { return i.code; }).join(','));
  var rf = ((out.allocationFactsResult || {}).receiverFacts || [])[0];
  if (!rf) throw new Error('FAIL-CLOSED: no receiverFact produced');
  return rf.allocationPriority;
}
var R_KM = ['KM', 'US', 'Amazon', 10], R_RESUS = ['ResUS', 'US', 'Amazon', 20], R_KM_CA = ['KM', 'CA', 'Amazon', 30];

expect(assemblyPriority([R_KM]), 10,
       'B1 requirement 7 — a UNIQUE-name fixture is unaffected here too');
expect(assemblyPriority([R_KM, R_RESUS]), 10,
       'B2 requirement 2/8 — the KM-scoped receiver keeps KM\'s 10, never ResUS\'s 20', true);
expect([assemblyPriority([R_KM, R_RESUS]), assemblyPriority([R_RESUS, R_KM])], [10, 10],
       'B3 requirement 4 — both row orders give 10; the LAST row read must not decide', true);
expect(assemblyPriority([R_KM, R_KM_CA]), 10,
       'B4 requirement 5 — COUNTRY isolation: the US receiver never picks up the CA row\'s 30', true);

// =============================================================================================================
section('C — the two producers fail the SAME way (one root cause, not two coincidences)');

expect([projectionPriority([KM_US, RESUS_US]), assemblyPriority([R_KM, R_RESUS])], [10, 10],
       'C1 requirement 3 — both producers are name-keyed, so both hand a KM receiver ResUS\'s priority. '
       + 'One root cause: the map key omits company and country.', true);

// The same file already knows how to key correctly two lines away, which is what makes this a slip rather
// than a design decision: source-projection builds ffByMskKey from the FULL composite
// [company, country, marketplace, sku] for fulfillment_model, then keys priority by name alone.
var projSrc = require('fs').readFileSync(
  path.join(__dirname, '../js/core/supply-planning-source-projection.js'), 'utf8');
expect(/ffByMskKey\[k\]\s*=|var k = \[str\(r\.company\), str\(r\.country\), str\(r\.marketplace\), str\(r\.sku\)\]/.test(projSrc), true,
       'C2 the SAME function already builds a composite key for fulfillment_model …');
expect(/priorityByMkt\[k\] = r\.allocation_priority/.test(projSrc), true,
       'C3 … while keying allocation_priority by name alone, two lines away — the exact root cause');

// =============================================================================================================
var total = pass + contractViolations.length + unexpected.length;
console.log('\n----------------------------------------');
console.log('KNOWN-DEFECT CHARACTERIZATION — Marketplace Priority identity collision (S8-R49-E)');
console.log('assertions ' + total + '  passed ' + pass
  + '  CONTRACT_VIOLATIONS ' + contractViolations.length
  + '  UNEXPECTED_FAILURES ' + unexpected.length);
console.log('CONTRACT_VIOLATIONS: ' + (contractViolations.join(' | ').replace(/\n\s+/g, ' ') || 'none'));
if (unexpected.length) console.log('UNEXPECTED_FAILURES: ' + unexpected.join(' | ').replace(/\n\s+/g, ' '));
if (fixedNow.length) {
  console.log('DEFECT_APPEARS_FIXED: ' + fixedNow.length + ' known-defect assertion(s) now PASS. '
    + 'Promote this file to a .test.js suite and retire the sentinel.');
}
if (total === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('STATUS: ' + (contractViolations.length ? 'KNOWN_DEFECT_PRESENT (expected failure)' : 'CONTRACT_MET'));
// Non-zero on purpose: the contract is not met. This file is isolated from the sweep registry by extension.
process.exitCode = (contractViolations.length || unexpected.length) ? 1 : 0;
