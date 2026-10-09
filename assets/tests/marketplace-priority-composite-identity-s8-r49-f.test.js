// =============================================================================================================
// S8-R49-F — MARKETPLACE PRIORITY RESOLVES BY THE CANONICAL COMPOSITE IDENTITY
// -------------------------------------------------------------------------------------------------------------
// LINEAGE. This file was R49-E's red known-defect characterization
// (_known-defect-marketplace-priority-collision-s8-r49-e.characterization.js). It asserted the contract while
// the producers violated it: 18 assertions, 8 CONTRACT VIOLATIONS, exit 1, deliberately isolated from the sweep
// registry so a permanently-red suite could not corrupt the measured baseline, and watched by a temporary
// sentinel that proved it stayed red for exactly those eight reasons.
//
// R49-F fixed both producers, all eight went green, and the file is PROMOTED here as ordinary registered
// regression coverage. The sentinel is deleted — its whole purpose was to make a red file impossible to forget,
// and there is no longer a red file. Two assertions had to be INVERTED on promotion (C2/C3): they asserted the
// defect was still present in source, which is the one thing a characterization asserts that an acceptance
// suite must not.
//
// THE CONTRACT. A `marketplaces` row is identified by company + country + marketplace — the upsert key in
// 03_master_data_handlers.gs, from which marketplace_id = MKT-{COMPANY}-{COUNTRY}-{MARKETPLACE} is derived. A
// marketplace NAME alone is not unique. A receiver must never inherit another company's or country's priority;
// priority 0 is a valid value (the lowest); a missing priority must never be fabricated.
//
// FIXTURE VALUES (10 / 20 / 30) ARE TEST FIXTURES ONLY — not a ranking, and they carry no business meaning.
// The frozen §40 allocator is untouched by this repair: it consumes a priority already attached to a fully
// identified receiver and fails closed when one is absent, which is asserted below.
// =============================================================================================================
'use strict';
var path = require('path');
var fs = require('fs');
var SP = require(path.join(__dirname, '../js/core/supply-planning-source-projection.js'));
var KMPA = require(path.join(__dirname, '../js/core/supply-planning-production-assembly.js'));
var KMPS = require(path.join(__dirname, '../js/core/supply-planning-production-source.js'));

var pass = 0, fail = 0;
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function j(v) { return JSON.stringify(v); }
function section(t) { console.log('\n== ' + t + ' =='); }
function eq(actual, want, label) {
  if (j(actual) === j(want)) { pass++; return; }
  fail++;
  console.log('FAIL ' + label + '\n      EXPECTED ' + j(want) + '\n      ACTUAL   ' + j(actual));
}
function ok(cond, label) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + label); } }

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
eq([identityOf(KM_US), identityOf(RESUS_US), identityOf(KM_CA)],
   ['KM|US|Amazon', 'ResUS|US|Amazon', 'KM|CA|Amazon'],
   'F1 the three fixture rows are three DISTINCT canonical identities');
eq(new Set([mktId(KM_US), mktId(RESUS_US), mktId(KM_CA)]).size, 3,
   'F2 and they mint three distinct marketplace_id values (MKT-{COMPANY}-{COUNTRY}-{MARKETPLACE})');
eq(new Set([KM_US.marketplace, RESUS_US.marketplace, KM_CA.marketplace]).size, 1,
   'F3 while sharing ONE marketplace NAME — which is what name-only keying used to collapse');

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
    // NO allocationPriority on the receiver fact, so the marketplaces lookup is what gets exercised.
    receiverFacts: [{ receiverKey: 'R1', demandRef: 'FC:F1', eligiblePoolTypes: 'THREE_PL', survivalNeedQty: 50,
      demandWeight: 1, fulfillmentModel: 'self_fulfilled', destinationWarehouseId: 'WH-3PL' }],
    planningFacts: [{ demandRef: 'FC:F1', siteSku: 'ST-1', windowCode: 'W40-A', calculatedGap: 100, unitsPerCarton: 12 }]
  };
}
function projectionRow(mktRows) {
  var p = SP.projectRecommendationProductionSources(canonical(mktRows));
  var row = null;
  Object.keys(p).forEach(function (k) {
    if (!row && Array.isArray(p[k]) && p[k].length && p[k][0] && has(p[k][0], 'allocation_priority')) row = p[k][0];
  });
  if (!row) throw new Error('FAIL-CLOSED: no receiver row carrying allocation_priority; keys=' + Object.keys(p).join(','));
  return row;
}
function projectionPriority(mktRows) { return projectionRow(mktRows).allocation_priority; }

eq(projectionPriority([KM_US]), 10,
   'A1 unique marketplace name — the KM receiver gets KM\'s own 10 (unchanged by the repair)');
eq(projectionPriority([KM_US, RESUS_US]), 10,
   'A2 DIFFERENT COMPANY, SAME COUNTRY — a KM receiver keeps 10; ResUS\'s 20 never reaches it');
eq(projectionPriority([RESUS_US, KM_US]), 10,
   'A3 and the same answer with the rows in the other order');
eq([projectionPriority([KM_US, RESUS_US]), projectionPriority([RESUS_US, KM_US])], [10, 10],
   'A4 ROW ORDER is not an input to a receiver\'s priority — both orders agree');
eq(projectionPriority([KM_US, KM_CA]), 10,
   'A5 SAME COMPANY, DIFFERENT COUNTRY — a US receiver keeps 10 and never picks up the CA row\'s 30');
eq([projectionPriority([KM_US, KM_CA]), projectionPriority([KM_CA, KM_US])], [10, 10],
   'A6 country isolation holds in BOTH row orders');
eq(projectionPriority([KM_US, RESUS_US, KM_CA]), 10,
   'A7 all three rows present at once — the receiver still resolves to its own identity');
eq(projectionPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon', allocation_priority: 0 }]), 0,
   'A8 PRIORITY 0 is preserved as 0 — the lowest valid priority, not "absent"');
eq(projectionPriority([{ company: 'KM', country: 'US', marketplace: 'Amazon' }]), undefined,
   'A9 a MISSING priority stays missing and is never coerced to 0');
eq(projectionPriority([RESUS_US]), undefined,
   'A10 and when only ANOTHER company\'s row exists, the KM receiver gets NOTHING rather than that row\'s 20 — '
   + 'a miss is a missing priority, never a fallback');

// The repair must not have touched anything else on the receiver row.
(function () {
  var row = projectionRow([KM_US, RESUS_US]);
  eq([row.receiver_key, row.demand_weight, row.fulfillment_model, row.marketplace, row.destination_warehouse_id],
     ['R1', 1, 'self_fulfilled', 'Amazon', 'WH-3PL'],
     'A11 receiver_key, demand_weight, fulfillment_model, marketplace and destination are all unchanged');
})();

// The FACTORY-demand lookup is the second place this module resolves a priority, and it was keyed by name too.
(function () {
  function factoryRow(mktRows) {
    var c = canonical(mktRows);
    c.recommendationType = 'MONTHLY_ORDER';
    c.planningCycle = '2026-M08';
    c.businessScope.draft_purpose = 'monthly';
    c.sourceSnapshots.warehouses = [{ warehouse_id: 'WH-FAC', company: 'CN_YOUXIN', country: 'CN', is_factory_warehouse: true, is_active: true }];
    c.sourceSnapshots.factoryStock = [{ warehouse_id: 'WH-FAC', sku: 'CO1100-R', fac_current_stock: 60, last_transaction_at: '2026-08-01' }];
    delete c.sourceSnapshots.overseasInventorySnapshot;
    c.factoryDemandFacts = [{ demandRef: 'FC:F1', eligibleFactoryWarehouseIds: 'WH-FAC',
      requiredByDate: '2026-09-01', destinationWarehouseId: 'WH-3PL' }];
    c.planningFacts = [{ demandRef: 'FC:F1', siteSku: 'ST-1', requestMonth: '2026-09', requestBucket: 'B1',
      netOrderNeed: 13, unitsPerCarton: 12 }];
    var p = SP.projectRecommendationProductionSources(c);
    var row = null;
    Object.keys(p).forEach(function (k) {
      if (!row && Array.isArray(p[k]) && p[k].length && p[k][0] && has(p[k][0], 'eligible_factory_warehouse_ids')) row = p[k][0];
    });
    if (!row) throw new Error('FAIL-CLOSED: no factory demand row produced');
    return row.allocation_priority;
  }
  eq(factoryRow([KM_US, RESUS_US]), 10,
     'A12 the FACTORY-demand lookup resolves by the composite identity too — KM keeps 10, not ResUS 20');
  eq([factoryRow([KM_US, RESUS_US]), factoryRow([RESUS_US, KM_US])], [10, 10],
     'A13 and it is row-order independent on that path as well');
  eq(factoryRow([KM_US, KM_CA]), 10, 'A14 country isolation holds on the factory path');
})();

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
var MKT_HDR_NOPRIO = ['company', 'country', 'marketplace'];
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
function assemblyFacts(mktSheet) {
  var out = KMPA.assembleProductionRecommendationFacts(
    KMPS.readCanonicalSnapshots(fakeSpreadsheet(mktSheet ? sheets(mktSheet) : sheets([MKT_HDR])), null), REQ);
  if (!out.ready) throw new Error('FAIL-CLOSED: assembly blocked: ' + out.issues.map(function (i) { return i.code; }).join(','));
  var rf = ((out.allocationFactsResult || {}).receiverFacts || [])[0];
  if (!rf) throw new Error('FAIL-CLOSED: no receiverFact produced');
  return rf;
}
function assemblyPriority(rows, hdr) { return assemblyFacts([hdr || MKT_HDR].concat(rows)).allocationPriority; }
var R_KM = ['KM', 'US', 'Amazon', 10], R_RESUS = ['ResUS', 'US', 'Amazon', 20], R_KM_CA = ['KM', 'CA', 'Amazon', 30];

eq(assemblyPriority([R_KM]), 10, 'B1 unique marketplace name — unchanged by the repair');
eq(assemblyPriority([R_KM, R_RESUS]), 10, 'B2 DIFFERENT COMPANY, SAME COUNTRY — the KM receiver keeps 10');
eq([assemblyPriority([R_KM, R_RESUS]), assemblyPriority([R_RESUS, R_KM])], [10, 10],
   'B3 ROW ORDER does not decide — both orders agree');
eq(assemblyPriority([R_KM, R_KM_CA]), 10,
   'B4 SAME COMPANY, DIFFERENT COUNTRY — the US receiver never picks up the CA row\'s 30');
eq(assemblyPriority([R_KM, R_RESUS, R_KM_CA]), 10, 'B5 all three rows present at once — still 10');
eq(assemblyPriority([['KM', 'US', 'Amazon', 0]]), 0, 'B6 PRIORITY 0 is preserved as 0');

// A missing priority must survive as MISSING. Measured, not assumed: the assembly does not refuse here -- it
// emits null, and the refusal happens further downstream (source-facts' MISSING_OR_INVALID_ALLOCATION_PRIORITY
// and SS40's requireQty, asserted in section E). What matters at THIS boundary is that null is distinct from 0
// and that no value was invented.
eq(assemblyPriority([['KM', 'US', 'Amazon']], MKT_HDR_NOPRIO), null,
   'B7 a MISSING priority emits null at this producer boundary -- not 0, and not a fabricated value');
eq(assemblyPriority([R_RESUS]), null,
   'B8 and when ONLY another company row exists the KM receiver gets null -- specifically NOT that row 20. '
   + 'Before the repair this returned 20, which is the collision itself.');
ok(assemblyPriority([['KM', 'US', 'Amazon']], MKT_HDR_NOPRIO) !== assemblyPriority([['KM', 'US', 'Amazon', 0]]),
   'B8b missing and 0 remain DISTINGUISHABLE at this boundary (null vs 0)');
(function () {
  var rf = assemblyFacts([MKT_HDR, R_KM, R_RESUS]);
  ok(typeof rf.demandWeight === 'number' && rf.eligiblePoolTypes.join(',') === 'THREE_PL',
     'B9 demandWeight and pool eligibility are unchanged by the repair');
})();

// =============================================================================================================
section('C — both producers agree, and both now key on the composite identity');

eq([projectionPriority([KM_US, RESUS_US]), assemblyPriority([R_KM, R_RESUS])], [10, 10],
   'C1 the two producers feed the same allocator and now resolve the SAME receiver to the SAME priority');

// Read from source: the acceptance is that the composite key is in the code, not merely that today's fixture
// happens to agree. (On promotion these two INVERTED — as a characterization they asserted the defect's
// presence; as acceptance they assert the repair's.)
function src(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var PROJ = src('js/core/supply-planning-source-projection.js');
var ASM = src('js/core/supply-planning-production-assembly.js');

ok(/mktIdentityKey\(r\.company, r\.country, r\.marketplace\)/.test(PROJ)
   && /mktIdentityKey\(scope\.company, scope\.country, mkt\)/.test(PROJ),
   'C2 source-projection builds AND looks up its priority map by company + country + marketplace');
ok(/mktIdentityKey\(r\.company, r\.country, r\.marketplace\)/.test(ASM)
   && /mktIdentityKey\(vr\.scope\.company, vr\.scope\.country, vr\.scope\.marketplace\)/.test(ASM),
   'C3 production-assembly does the same — the name-only key is gone from both producers');
ok(!/priorityByMkt\[str\(|prByMkt\[str\(|prByMkt\[vr\.scope\.marketplace\]/.test(PROJ + ASM),
   'C4 and no name-only priority index or lookup remains in either file');

// =============================================================================================================
section('D — the composite key is injective (a separator in the data cannot forge a collision)');
// Verified rather than assumed: a bare join would map ('A','B|C','D') and ('A','B','C|D') to one key, which is
// this very defect in a subtler form.

(function () {
  var a = { company: 'A', country: 'B|C', marketplace: 'Amazon', allocation_priority: 11 };
  var b = { company: 'A', country: 'B', marketplace: 'C|Amazon', allocation_priority: 22 };
  function scopedTo(sc, rows) {
    var c = canonical(rows);
    c.businessScope.company = sc.company; c.businessScope.country = sc.country; c.businessScope.marketplace = sc.marketplace;
    c.sourceSnapshots.marketplaceSkus[0].company = sc.company;
    c.sourceSnapshots.marketplaceSkus[0].country = sc.country;
    c.sourceSnapshots.marketplaceSkus[0].marketplace = sc.marketplace;
    c.sourceSnapshots.fcRegularForecast[0].company = sc.company;
    c.sourceSnapshots.fcRegularForecast[0].country = sc.country;
    c.sourceSnapshots.fcRegularForecast[0].marketplace = sc.marketplace;
    var p = SP.projectRecommendationProductionSources(c);
    var row = null;
    Object.keys(p).forEach(function (k) {
      if (!row && Array.isArray(p[k]) && p[k].length && p[k][0] && has(p[k][0], 'allocation_priority')) row = p[k][0];
    });
    return row ? row.allocation_priority : undefined;
  }
  eq(scopedTo({ company: 'A', country: 'B|C', marketplace: 'Amazon' }, [a, b]), 11,
     'D1 a pipe INSIDE a field does not let one identity answer for another (first identity → 11)');
  eq(scopedTo({ company: 'A', country: 'B', marketplace: 'C|Amazon' }, [a, b]), 22,
     'D2 and the other identity still resolves to its own value (→ 22) — the key is injective');
})();

// =============================================================================================================
section('E — the frozen §40 allocator is untouched by this repair');

var ALLOC = src('js/core/supply-planning-allocations.js');
ok(/requireQty\(r\.allocationPriority/.test(ALLOC),
   'E1 §40 still REQUIRES a per-receiver allocationPriority and fails closed without one');
ok(!/mktIdentityKey|priorityByMkt|prByMkt/.test(ALLOC),
   'E2 and it contains no marketplace priority map at all — the repair stayed in the producers');
var GUARD = src('js/core/supply-planning-factory-stock-guard.js');
ok(/priorityByReceiver\[r\.receiver_key\]/.test(GUARD) && /PRIORITY_UNRESOLVED/.test(GUARD),
   'E3 the factory-stock guard still resolves priority per RECEIVER and still STOPs when coverage is '
   + 'incomplete — unchanged ordering and unchanged refusal');

// =============================================================================================================
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
console.log('\n----------------------------------------');
console.log('MARKETPLACE PRIORITY COMPOSITE IDENTITY (S8-R49-F): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
