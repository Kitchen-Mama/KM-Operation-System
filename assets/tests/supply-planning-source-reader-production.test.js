// Kitchen Mama Operation System — PRODUCTION Recommendation Source Reader tests (Phase 2C, Round 1S-P1).
// Run: node assets/tests/supply-planning-source-reader-production.test.js
// Exercises supply-planning-source-reader-production.js with a FAKE SpreadsheetApp: raw table reader, header/
// schema validation (fail-closed), value preservation (Date/zero/blank), and the full READ-ONLY projection
// (raw snapshots → Round 1P reader → Round 1Q integration → Plan Builder) for Weekly + Monthly, plus purity and
// read-only/orchestrator-untouched source scans. No live Google Sheets; no writes; no persistence.

'use strict';
var fs = require('fs'), path = require('path');
var KMSRP = require('../js/core/supply-planning-source-reader-production.js');
var PB = require('../js/core/supply-planning-plan-builder.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

// ---- fake read-only SpreadsheetApp -----------------------------------------------------------------------
function fakeSheet(values, writes) {
  return {
    getLastRow: function () { return values.length; },
    getLastColumn: function () { return values[0] ? values[0].length : 0; },
    getDataRange: function () { return { getValues: function () { return values.map(function (r) { return r.slice(); }); } }; },
    appendRow: function () { writes.n++; }, setValues: function () { writes.n++; }, deleteRow: function () { writes.n++; }, insertRows: function () { writes.n++; }
  };
}
function fakeSS(sheets) { var writes = { n: 0 }; return { _writes: writes, getSheetByName: function (name) { var v = sheets[name]; return v ? fakeSheet(v, writes) : null; } }; }

// ---- schema-accurate (DTO-convention) fake source sheets (2D header + rows) ------------------------------
function weeklySheets() {
  return {
    recommendation_source_demand: [
      ['demand_type', 'source_ref', 'required_by_date', 'quantity', 'sku', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'planning_cycle', 'source_data_as_of'],
      ['REGULAR', 'd1', '2026-09-01', 100, 'CO1100-R', 'KM', 'US', 'AMAZON_US', 'WH-3PL', '2026-W40', '2026-08-01']
    ],
    recommendation_source_supply: [
      ['pool_type', 'warehouse_id', 'quantity', 'sku', 'company', 'supply_lineage_ref'],
      ['THREE_PL', 'WH-3PL', 100, 'CO1100-R', 'KM', 'sp']
    ],
    recommendation_source_receivers: [
      ['receiver_key', 'demand_source_ref', 'eligible_pool_types', 'survival_need_qty', 'allocation_priority', 'demand_weight', 'fulfillment_model', 'marketplace', 'destination_warehouse_id'],
      ['R1', 'd1', 'THREE_PL', 50, 1, 1, 'self_fulfilled', 'AMAZON_US', 'WH-3PL']
    ],
    recommendation_source_planning_facts: [
      ['recommendation_type', 'sku', 'site_sku', 'window_code', 'demand_source_ref', 'calculated_gap_qty', 'units_per_carton'],
      ['WEEKLY_SHIPPING', 'CO1100-R', 'ST-1', 'W40-A', 'd1', 100, 12]
    ]
  };
}
function monthlySheets() {
  return {
    recommendation_source_demand: [
      ['demand_type', 'source_ref', 'required_by_date', 'quantity', 'sku', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'planning_cycle'],
      ['REGULAR', 'd1', '2026-09-01', 100, 'CO1100-R', 'KM', 'US', 'AMAZON_US', 'WH-3PL', '2026-M08']
    ],
    recommendation_source_supply: [
      ['pool_type', 'warehouse_id', 'quantity', 'sku', 'company', 'supply_lineage_ref'],
      ['FACTORY', 'WH-FAC', 60, 'CO1100-R', 'KM', 'fs']
    ],
    recommendation_source_factory_demands: [
      ['demand_source_ref', 'eligible_factory_warehouse_ids', 'allocation_priority', 'marketplace', 'destination_warehouse_id', 'required_by_date'],
      ['d1', 'WH-FAC', 1, 'AMAZON_US', 'WH-3PL', '2026-09-01']
    ],
    recommendation_source_planning_facts: [
      ['recommendation_type', 'sku', 'site_sku', 'request_month', 'request_bucket', 'demand_source_ref', 'net_order_need_snapshot', 'units_per_carton'],
      ['MONTHLY_ORDER', 'CO1100-R', 'ST-1', '2026-09', 'B1', 'd1', 13, 12]
    ]
  };
}
var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', sku: 'CO1100-R' };
var MSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };

// ==========================================================================
section('A. Raw table reader (fake SpreadsheetApp) — value preservation, fail-closed');
(function () {
  var d = new Date(2026, 8, 1);
  var ss = fakeSS({ t: [['a', 'b', 'c', 'd'], [0, '', '0', d]] });
  var snap = KMSRP.readRawTableSnapshot(ss, { sourceType: 't', sheetName: 't', asOfHeader: 'a' });
  eq([snap.found, snap.rowCount, snap.headers], [true, 1, ['a', 'b', 'c', 'd']], 'A1 snapshot headers + rowCount');
  ok(snap.rows[0][0] === 0 && snap.rows[0][1] === '' && snap.rows[0][2] === '0' && snap.rows[0][3] instanceof Date, 'A2 numeric 0 / blank / text "0" / Date preserved distinctly (no coercion)');
  ok(ss._writes.n === 0, 'A3 reader performed NO writes');
  ok(function () { try { JSON.stringify(snap); return true; } catch (e) { return false; } }(), 'A4 snapshot is JSON-safe');
  // missing sheet → SOURCE_NOT_AVAILABLE (fail-closed, not fabricated)
  var miss = KMSRP.readRawTableSnapshot(fakeSS({}), { sourceType: 't', sheetName: 'nope' });
  eq([miss.found, miss.issues[0]], [false, 'SOURCE_NOT_AVAILABLE'], 'A5 missing sheet → found false + SOURCE_NOT_AVAILABLE');
  // empty sheet → MISSING_SNAPSHOT
  var empty = KMSRP.readRawTableSnapshot(fakeSS({ t: [] }), { sourceType: 't', sheetName: 't' });
  eq(empty.issues[0], 'MISSING_SNAPSHOT', 'A6 empty sheet → MISSING_SNAPSHOT');
  // as-of evidence read from the registry column (never the clock)
  eq(snap.sourceDataAsOfEvidence, '0', 'A7 as-of evidence = first non-empty value of asOfHeader column');
  throwsType(function () { KMSRP.readRawTableSnapshot({}, { sheetName: 't' }); }, 'A8 non-spreadsheet accessor → TypeError');
})();

section('B. Header / schema validation (fail-closed tokens)');
(function () {
  var entry = { sourceType: 'demand', requiredHeaders: ['demand_type', 'source_ref', 'quantity'] };
  eq(KMSRP.validateSnapshot({ found: true, headers: ['demand_type', 'source_ref', 'quantity'], rows: [] }, entry), [], 'B1 valid schema → no issues');
  ok(KMSRP.validateSnapshot({ found: true, headers: ['demand_type', 'source_ref'], rows: [] }, entry).some(function (x) { return x.reason === 'MISSING_REQUIRED_HEADER:quantity'; }), 'B2 missing required header');
  ok(KMSRP.validateSnapshot({ found: true, headers: ['demand_type', 'demand_type', 'source_ref', 'quantity'], rows: [] }, entry).some(function (x) { return x.reason === 'DUPLICATE_HEADER:demand_type'; }), 'B3 duplicate header');
  ok(KMSRP.validateSnapshot({ found: true, headers: ['demand_type', '', 'source_ref', 'quantity'], rows: [] }, entry).some(function (x) { return x.reason === 'MISSING_REQUIRED_HEADER:blank'; }), 'B4 blank header');
  ok(KMSRP.validateSnapshot({ found: true, headers: ['demand_type', 'source_ref', 'quantity'], rows: [[1, 2]] }, entry).some(function (x) { return x.reason.indexOf('INVALID_ROW_WIDTH') === 0; }), 'B5 row-width mismatch');
  ok(KMSRP.validateSnapshot({ found: false }, entry)[0].reason === 'SOURCE_NOT_AVAILABLE', 'B6 missing snapshot → SOURCE_NOT_AVAILABLE');
})();

section('C. Weekly production source → Plan Builder (read-only; recommendedQty 96)');
(function () {
  var ss = weeklySheets(); var sa = fakeSS(ss);
  var full = KMSRP.readRecommendationSourceFacts(sa, { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE, formulaVersion: 'fv1' });
  eq([full.ready, full.recommendationType, full.bridgeResult.lines[0].recommendedQty], [true, 'WEEKLY_SHIPPING', 96], 'C1 Weekly source DTO ready; recommendedQty 96 (resolver-owned, not the reader)');
  eq([full.sourceDataAsOf, full.ledgerResult.demandLedger.entries[0].effectiveDemandQty], ['2026-08-01', 100], 'C2 sourceDataAsOf from snapshot evidence; demand qty 100 passes through unchanged');
  var cmd = PB.buildRecommendation(full.bridgeResult);
  eq([cmd.recommendationType, cmd.command.recommendedLines[0].recommendedQty], ['WEEKLY_SHIPPING', 96], 'C3 existing Plan Builder accepts the production-reader Weekly facts → 96');
  eq(PB.splitLineKey('WEEKLY_SHIPPING', cmd.command.recommendedLines[0].lineKey), { sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', source_warehouse_id: 'WH-3PL', route_no: '' }, 'C4 natural key intact end-to-end (R3C2: 5-part; per-source WH-3PL)');
  eq(sa._writes.n, 0, 'C5 NO Sheet writes performed by the production reader');
})();

section('D. Monthly production source → Plan Builder (CEILING 24; no order_qty authority)');
(function () {
  var sa = fakeSS(monthlySheets());
  var full = KMSRP.readRecommendationSourceFacts(sa, { recommendationType: 'MONTHLY_ORDER', planningCycle: '2026-M08', businessScope: MSCOPE, formulaVersion: 'fv1', sourceDataAsOf: '2026-08-02' });
  eq([full.ready, full.bridgeResult.lines[0].recommendedQty], [true, 24], 'D1 Monthly recommendedQty CEILING(13/12)*12 = 24');
  var cmd = PB.buildRecommendation(full.bridgeResult);
  eq([cmd.recommendationType, cmd.generationType, cmd.command.recommendedLines[0].recommendedQty], ['MONTHLY_ORDER', 'scheduled', 24], 'D2 Plan Builder accepts Monthly facts → 24');
  eq(PB.splitLineKey('MONTHLY_ORDER', cmd.command.recommendedLines[0].lineKey), { request_month: '2026-09', request_bucket: 'B1' }, 'D3 Monthly natural key intact');
  ok(JSON.stringify(full.bridgeResult.lines[0]).indexOf('order_qty') < 0, 'D4 no order_qty authority in the source DTO');
  eq(sa._writes.n, 0, 'D5 NO Sheet writes');
})();

section('E. Missing required source → fail closed (no fabricated draft)');
(function () {
  var s = weeklySheets(); delete s.recommendation_source_demand;   // required demand table absent
  var full = KMSRP.readRecommendationSourceFacts(fakeSS(s), { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE });
  eq([full.ready, full.reason], [false, 'SOURCE_NOT_AVAILABLE'], 'E1 missing required demand source → ready false, SOURCE_NOT_AVAILABLE (never fabricated)');
  // missing required header on a present sheet → fail closed
  var s2 = weeklySheets(); s2.recommendation_source_supply = [['pool_type', 'warehouse_id'], ['THREE_PL', 'WH-3PL']]; // no quantity header
  var f2 = KMSRP.readRecommendationSourceFacts(fakeSS(s2), { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE });
  ok(f2.ready === false && f2.reason.indexOf('MISSING_REQUIRED_HEADER') === 0, 'E2 missing required header on a required sheet → fail closed');
})();

section('F. Registry (structural only) + recommendationType routing');
(function () {
  var w = KMSRP.registryFor('WEEKLY_SHIPPING');
  var m = KMSRP.registryFor('MONTHLY_ORDER');
  ok(w.some(function (e) { return e.sourceType === 'receivers'; }) && !w.some(function (e) { return e.sourceType === 'factoryDemands'; }), 'F1 Weekly registry has receivers, not factoryDemands');
  ok(m.some(function (e) { return e.sourceType === 'factoryDemands'; }) && !m.some(function (e) { return e.sourceType === 'receivers'; }), 'F2 Monthly registry has factoryDemands, not receivers');
  ok(KMSRP.SOURCE_TABLE_REGISTRY.every(function (e) { return !/gap|survival|weight|carton|forecast/i.test(JSON.stringify(e).replace(/calculated_gap_qty|net_order_need_snapshot|units_per_carton|survival_need_qty|demand_weight/g, '')); }), 'F3 registry holds structural facts only (no business formula)');
  throwsType(function () { KMSRP.buildRecommendationSourceFacts({}); }, 'F4 malformed input → TypeError');
})();

section('G. Purity / determinism');
(function () {
  var sheets = weeklySheets();
  var snapWeekly = { demand: KMSRP.readRawTableSnapshot(fakeSS(sheets), { sourceType: 'demand', sheetName: 'recommendation_source_demand', asOfHeader: 'source_data_as_of' }) };
  var input = { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: WSCOPE,
    snapshots: {
      demand: KMSRP.readRawTableSnapshot(fakeSS(sheets), { sourceType: 'demand', sheetName: 'recommendation_source_demand' }),
      supply: KMSRP.readRawTableSnapshot(fakeSS(sheets), { sourceType: 'supply', sheetName: 'recommendation_source_supply' }),
      receivers: KMSRP.readRawTableSnapshot(fakeSS(sheets), { sourceType: 'receivers', sheetName: 'recommendation_source_receivers' }),
      planningFacts: KMSRP.readRawTableSnapshot(fakeSS(sheets), { sourceType: 'planningFacts', sheetName: 'recommendation_source_planning_facts' })
    }, formulaVersion: 'fv1' };
  var snap = JSON.stringify(input);
  var a1 = KMSRP.buildRecommendationSourceFacts(input);
  ok(JSON.stringify(input) === snap, 'G1 input snapshots not mutated');
  var a2 = KMSRP.buildRecommendationSourceFacts(input);
  eq(a1.bridgeResult.lines, a2.bridgeResult.lines, 'G2 deterministic (repeat deep-equal)');
  ok(a1 !== a2 && a1.bridgeResult !== a2.bridgeResult, 'G3 fresh output objects');
})();

section('H. Boundary source-scans — no writes / orchestrator untouched / bundle integration');
(function () {
  // strip line + block comments so the scan checks actual CODE, not documentation prose
  function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  var prod = code(read('js/core/supply-planning-source-reader-production.js'));
  var gs = code(read('specs/active/apps-script/26_recommendation_source_reader.gs'));
  var orch = read('specs/active/apps-script/24_recommendation_orchestrator.gs');
  var build = read('tools/build-apps-script-bundle.js');
  ok(!/SpreadsheetApp|LockService|CacheService/.test(prod), 'H1 pure module CODE has NO SpreadsheetApp/LockService/CacheService');
  ok(!/setValues|appendRow|deleteRow|insertRows/.test(gs), 'H2 .gs wrapper CODE performs NO writes');
  ok(/SOURCE_READER_PENDING/.test(orch), 'H3 orchestrator STILL contains SOURCE_READER_PENDING (not replaced this round)');
  ok(/supply-planning-source-reader-production/.test(build) && /KMSRP/.test(build), 'H4 production reader added to the deterministic bundle');
  ok(/Date\.now|Math\.random|localeCompare/.test(prod) === false, 'H5 no clock/random/locale in the pure module CODE');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1S-P1 Production Source Reader assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
