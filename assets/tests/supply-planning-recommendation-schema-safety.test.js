// Kitchen Mama Operation System — RECOMMENDATION pre-write schema safety (Production Safety Round S0, §9/§14/§15).
// Run: node assets/tests/supply-planning-recommendation-schema-safety.test.js
// LOCAL / FAKE-ONLY. Runs the REAL KMPW.validateAuthorizedRecommendationSchemas + assertAuthorizedSchemasReady
// against a Spreadsheet whose every mutating method THROWS + is recorded, and asserts: the writer validates all
// five authorized tables BEFORE any lock/write; a missing recommendation_calculation_runs → SCHEMA_NOT_PROVISIONED
// (NOT created); a blank line Header → HEADER_BLANK (NOT repaired); a duplicate Active Draft is left intact; and
// EVERY path performs zero writes with a byte-identical Spreadsheet before/after. No live access.

'use strict';
var KMPW = require('../js/core/supply-planning-production-writer.js');
var KMSAFE = require('../js/core/supply-planning-production-safety.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var MUTATORS = ['setValue', 'setValues', 'clear', 'clearContent', 'clearContents', 'deleteRow', 'deleteRows',
  'deleteColumn', 'deleteColumns', 'insertRowsAfter', 'insertColumnsAfter', 'appendRow', 'copyTo', 'moveTo', 'setName'];
var SS_MUTATORS = ['insertSheet', 'deleteSheet', 'setName'];
var EXPECTED_ID = 'SS-PROD-DUP';
function makeFake(sheetMap) {
  var attempts = [];
  function thrower(w) { return function () { attempts.push(w); throw new Error('WRITE_ATTEMPT:' + w); }; }
  function range(vals) { var r = { getValues: function () { return vals.map(function (x) { return x.slice(); }); } }; MUTATORS.forEach(function (m) { r[m] = thrower('Range.' + m); }); return r; }
  function sheet(name, vals) { var s = { getName: function () { return name; }, getLastRow: function () { return vals.length; }, getLastColumn: function () { return vals[0] ? vals[0].length : 0; }, getDataRange: function () { return range(vals); }, getRange: function () { return range(vals); } }; MUTATORS.forEach(function (m) { s[m] = thrower('Sheet.' + m); }); return s; }
  var ss = { getId: function () { return EXPECTED_ID; }, getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheetMap, n) ? sheet(n, sheetMap[n]) : null; }, getSheets: function () { return Object.keys(sheetMap).map(function (n) { return sheet(n, sheetMap[n]); }); } };
  SS_MUTATORS.forEach(function (m) { ss[m] = thrower('Spreadsheet.' + m); });
  return { ss: ss, attempts: attempts, snapshot: function () { return JSON.stringify(sheetMap); } };
}

var wH = KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING, mH = KMPW.DRAFT_HEADERS.MONTHLY_ORDER;
var KMPR = require('../js/core/supply-planning-persistence-repository.js');
var RUN = KMPR.RUN_JOURNAL_HEADERS;

// A fully-provisioned valid database: exact Headers, line tables carry the ADDITIVE columns (still valid).
function provisionedSheets() {
  return {
    shipping_allocation_drafts: [wH.header.slice()],
    shipping_allocation_draft_lines: [wH.lines.concat(KMPR.LINE_ADDITIVE_HEADERS)],
    request_order_allocation_drafts: [mH.header.slice()],
    request_order_allocation_draft_lines: [mH.lines.concat(KMPR.LINE_ADDITIVE_HEADERS)],
    recommendation_calculation_runs: [RUN.slice()]
  };
}
// The incident-state database: run journal ABSENT, one line Header blank, duplicate Active Draft present.
function incidentSheets() {
  function wRow(v) { return wH.header.map(function (c) { return v[c] === undefined ? '' : v[c]; }); }
  var scope = { allocation_draft_id: 'D1', planning_cycle: '2026-W40', company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', status: 'draft' };
  var lineHeaderBlank = mH.lines.slice(); lineHeaderBlank[3] = '';
  return {
    shipping_allocation_drafts: [wH.header.slice(), wRow(scope), wRow(Object.assign({}, scope, { allocation_draft_id: 'D2' }))],
    shipping_allocation_draft_lines: [wH.lines.concat(KMPR.LINE_ADDITIVE_HEADERS)],
    request_order_allocation_drafts: [mH.header.slice()],
    request_order_allocation_draft_lines: [lineHeaderBlank]
    // recommendation_calculation_runs intentionally ABSENT
  };
}

// ==========================================================================
section('§9 — a fully-provisioned database validates ready with ZERO writes');
(function () {
  var fake = makeFake(provisionedSheets());
  var before = fake.snapshot();
  var v = KMPW.validateAuthorizedRecommendationSchemas(fake.ss, { expectedSpreadsheetId: EXPECTED_ID });
  eq(fake.attempts, [], 'P1 ZERO write attempts during five-table validation');
  eq(fake.snapshot(), before, 'P2 Spreadsheet byte-identical before/after');
  ok(v.ready === true && v.blockers.length === 0, 'P3 provisioned database → ready, no blockers');
  ok(v.tables.recommendation_calculation_runs.schemaStatus === 'SCHEMA_VALID', 'P4 run journal SCHEMA_VALID');
  ok(v.tables.shipping_allocation_draft_lines.schemaStatus === 'SCHEMA_VALID', 'P5 additive line columns accepted (ALLOW)');
  ok(KMPW.assertAuthorizedSchemasReady(fake.ss, { expectedSpreadsheetId: EXPECTED_ID }).ready === true, 'P6 assertAuthorizedSchemasReady passes on provisioned db');
})();

section('§15 — the incident database blocks the writer BEFORE lock/write (no create/repair/cleanup)');
(function () {
  var fake = makeFake(incidentSheets());
  var before = fake.snapshot();
  var v = KMPW.validateAuthorizedRecommendationSchemas(fake.ss, { expectedSpreadsheetId: EXPECTED_ID });
  eq(fake.attempts, [], 'I1 ZERO write attempts (no ensure/create/repair)');
  eq(fake.snapshot(), before, 'I2 Spreadsheet byte-identical before/after (blank Header NOT repaired, run sheet NOT created)');
  ok(v.ready === false, 'I3 not ready');
  eq(v.tables.recommendation_calculation_runs.schemaStatus, 'SCHEMA_NOT_PROVISIONED', 'I4 missing run journal → SCHEMA_NOT_PROVISIONED (not created)');
  eq(v.tables.request_order_allocation_draft_lines.schemaStatus, 'HEADER_BLANK', 'I5 blank line Header → HEADER_BLANK (not repaired)');
  ok(v.blockers.some(function (b) { return b.table === 'recommendation_calculation_runs' && b.schemaStatus === 'SCHEMA_NOT_PROVISIONED'; }), 'I6 run journal is a blocker');
  ok(v.blockers.some(function (b) { return b.table === 'request_order_allocation_draft_lines' && b.schemaStatus === 'HEADER_BLANK'; }), 'I7 blank line table is a blocker');
  var threw = null; try { KMPW.assertAuthorizedSchemasReady(fake.ss, { expectedSpreadsheetId: EXPECTED_ID }); } catch (e) { threw = e; }
  ok(threw && /RECOMMENDATION_SCHEMA_NOT_READY/.test(threw.message), 'I8 assertAuthorizedSchemasReady THROWS before lock/write');
  eq(fake.attempts, [], 'I9 still ZERO writes after the hard gate threw');
})();

section('§14 — wrong Spreadsheet target fails closed with zero writes');
(function () {
  var fake = makeFake(provisionedSheets());
  var before = fake.snapshot();
  var v = KMPW.validateAuthorizedRecommendationSchemas(fake.ss, { expectedSpreadsheetId: 'SS-SOME-OTHER-COPY' });
  eq(fake.attempts, [], 'W1 ZERO writes when target ID mismatches');
  eq(fake.snapshot(), before, 'W2 byte-identical');
  ok(v.ready === false && v.blockers.every(function (b) { return b.schemaStatus === 'WRONG_SPREADSHEET_TARGET'; }), 'W3 every table blocked WRONG_SPREADSHEET_TARGET');
})();

section('duplicate Active Draft is reported, never cleaned (KMVD stays read-only)');
(function () {
  var KMVD = require('../js/core/supply-planning-verification-diagnostics.js');
  var fake = makeFake(incidentSheets());
  var before = fake.snapshot();
  var r = KMVD.activeDraftAudit(fake.ss, { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen' } });
  eq(fake.attempts, [], 'D1 ZERO writes during Active-Draft audit');
  eq(fake.snapshot(), before, 'D2 byte-identical (duplicate draft not cleaned)');
  eq(r.status, 'BLOCKED_CONFLICT', 'D3 duplicate active → BLOCKED_CONFLICT (read-only decision)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Production Safety Round S0 recommendation schema-safety assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
