// Kitchen Mama Operation System — AI Plan authorized-schema gate is TYPE-SCOPED — F1-7N-FA-3C-PRE3-R3.
// Run: node assets/tests/ai-plan-schema-gate-type-scope-f1-7n-fa-3c-pre3-r3.test.js
// LOCAL / FAKE-ONLY. Proves the bounded fix: the pre-write authorized-schema gate validates ONLY the tables the
// requested recommendationType actually writes (its own header+lines + the shared run journal) — so a stale/absent
// UNRELATED WEEKLY_SHIPPING (shipping_allocation_*) schema no longer hard-gates a MONTHLY_ORDER request-order draft.
// It weakens NO fail-closed guard for a table that IS written, changes NO header contract, and performs ZERO writes.
// (Root cause of the 4/99 RECOMMENDATION_SCHEMA_NOT_READY: shipping_alloca... family — F1-7N-FA-3C-PRE3-R3.)

'use strict';
var KMPW = require('../js/core/supply-planning-production-writer.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var MUT = ['setValue', 'setValues', 'clear', 'clearContent', 'clearContents', 'deleteRow', 'deleteRows', 'deleteColumn', 'deleteColumns', 'insertRowsAfter', 'insertColumnsAfter', 'appendRow', 'copyTo', 'moveTo', 'setName'];
var EXPECTED_ID = 'SS-PROD-1';
function makeFake(sheetMap) {
  var attempts = [];
  function thrower(w) { return function () { attempts.push(w); throw new Error('WRITE_ATTEMPT:' + w); }; }
  function range(vals) { var r = { getValues: function () { return vals.map(function (x) { return x.slice(); }); } }; MUT.forEach(function (m) { r[m] = thrower('Range.' + m); }); return r; }
  function sheet(name, vals) { var s = { getName: function () { return name; }, getLastRow: function () { return vals.length; }, getLastColumn: function () { return vals[0] ? vals[0].length : 0; }, getDataRange: function () { return range(vals); }, getRange: function () { return range(vals); } }; MUT.forEach(function (m) { s[m] = thrower('Sheet.' + m); }); return s; }
  var ss = { getId: function () { return EXPECTED_ID; }, getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheetMap, n) ? sheet(n, sheetMap[n]) : null; }, getSheets: function () { return Object.keys(sheetMap).map(function (n) { return sheet(n, sheetMap[n]); }); } };
  return { ss: ss, attempts: attempts, snapshot: function () { return JSON.stringify(sheetMap); } };
}

var wH = KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING, mH = KMPW.DRAFT_HEADERS.MONTHLY_ORDER, RUN = KMPR.RUN_JOURNAL_HEADERS;
function names(specs) { return specs.map(function (s) { return s.sheetName; }); }

// ==========================================================================
section('A — authorizedTableSpecs is scoped to the requested recommendationType');
eq(names(KMPW.authorizedTableSpecs('MONTHLY_ORDER')),
  ['request_order_allocation_drafts', 'request_order_allocation_draft_lines', 'recommendation_calculation_runs'],
  'A1 MONTHLY_ORDER validates ONLY its own draft/lines + run journal (no shipping_allocation)');
eq(names(KMPW.authorizedTableSpecs('WEEKLY_SHIPPING')),
  ['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'recommendation_calculation_runs'],
  'A2 WEEKLY_SHIPPING validates ONLY its own draft/lines + run journal (no request_order)');
eq(names(KMPW.authorizedTableSpecs()),
  ['shipping_allocation_drafts', 'shipping_allocation_draft_lines', 'request_order_allocation_drafts', 'request_order_allocation_draft_lines', 'recommendation_calculation_runs'],
  'A3 no type → ALL five (backward-compatible with a type-agnostic caller)');
eq(names(KMPW.authorizedTableSpecs('BOGUS')), names(KMPW.authorizedTableSpecs()), 'A4 unknown type → all five (safe fallback)');

// ==========================================================================
section('B — a stale/ABSENT shipping_allocation schema no longer gates a MONTHLY_ORDER draft');
// request_order_* + run journal valid; BOTH shipping_allocation_* sheets ABSENT (a broken/legacy WEEKLY schema).
function monthlyOkWeeklyBrokenDb() {
  return {
    request_order_allocation_drafts: [mH.header.slice()],
    request_order_allocation_draft_lines: [mH.lines.concat(KMPR.LINE_ADDITIVE_HEADERS)],
    recommendation_calculation_runs: [RUN.slice()]
    // shipping_allocation_drafts / shipping_allocation_draft_lines intentionally ABSENT
  };
}
(function () {
  var fake = makeFake(monthlyOkWeeklyBrokenDb()), before = fake.snapshot();
  var v = KMPW.validateAuthorizedRecommendationSchemas(fake.ss, { expectedSpreadsheetId: EXPECTED_ID, recommendationType: 'MONTHLY_ORDER' });
  ok(v.ready === true && v.blockers.length === 0, 'B1 MONTHLY_ORDER ready even with shipping_allocation absent');
  ok(!v.tables.shipping_allocation_drafts && !v.tables.shipping_allocation_draft_lines, 'B2 shipping_allocation tables are NOT even inspected for MONTHLY_ORDER');
  ok(v.tables.request_order_allocation_draft_lines.schemaStatus === 'SCHEMA_VALID', 'B3 the written line table IS validated (SCHEMA_VALID)');
  eq(fake.attempts, [], 'B4 ZERO write attempts (read-only)');
  eq(fake.snapshot(), before, 'B5 spreadsheet byte-identical');
  // assert the OLD over-broad behavior is what a type-less call still does (proves the scoping is the only change)
  var vAll = KMPW.validateAuthorizedRecommendationSchemas(fake.ss, { expectedSpreadsheetId: EXPECTED_ID });
  ok(vAll.ready === false && vAll.blockers.some(function (b) { return b.table === 'shipping_allocation_drafts'; }), 'B6 type-less call STILL blocks on the absent shipping_allocation (unchanged all-tables path)');
  // and assertAuthorizedSchemasReady with the type does not throw
  var threw = false; try { KMPW.assertAuthorizedSchemasReady(fake.ss, { expectedSpreadsheetId: EXPECTED_ID, recommendationType: 'MONTHLY_ORDER' }); } catch (e) { threw = true; }
  ok(!threw, 'B7 assertAuthorizedSchemasReady(MONTHLY_ORDER) does NOT throw when only WEEKLY schema is stale');
})();

// ==========================================================================
section('C — fail-closed PRESERVED: a stale table that IS written still blocks (no guard weakening)');
// request_order_allocation_draft_lines missing a canonical column (drop factory_available_qty_snapshot).
(function () {
  var brokenLines = mH.lines.filter(function (h) { return h !== 'factory_available_qty_snapshot'; });
  var db = { request_order_allocation_drafts: [mH.header.slice()], request_order_allocation_draft_lines: [brokenLines.concat(KMPR.LINE_ADDITIVE_HEADERS)], recommendation_calculation_runs: [RUN.slice()] };
  var fake = makeFake(db), before = fake.snapshot();
  var v = KMPW.validateAuthorizedRecommendationSchemas(fake.ss, { expectedSpreadsheetId: EXPECTED_ID, recommendationType: 'MONTHLY_ORDER' });
  ok(v.ready === false && v.blockers.some(function (b) { return b.table === 'request_order_allocation_draft_lines'; }), 'C1 a MONTHLY_ORDER table missing a canonical column STILL blocks (fail-closed)');
  var threw = false, msg = ''; try { KMPW.assertAuthorizedSchemasReady(fake.ss, { expectedSpreadsheetId: EXPECTED_ID, recommendationType: 'MONTHLY_ORDER' }); } catch (e) { threw = true; msg = e.message; }
  ok(threw && /RECOMMENDATION_SCHEMA_NOT_READY/.test(msg) && /request_order_allocation_draft_lines/.test(msg), 'C2 assert throws naming the REAL written table (not shipping_allocation)');
  eq(fake.attempts, [], 'C3 ZERO write attempts');
  eq(fake.snapshot(), before, 'C4 spreadsheet byte-identical');
})();

// ==========================================================================
section('D — source wiring: 24_ threads the recommendationType into the gate');
var fs = require('fs'), path = require('path');
var F24 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '24_recommendation_orchestrator.gs'), 'utf8');
ok(/function rpoValidateSchema_\(ss, recommendationType\)/.test(F24), 'D1 rpoValidateSchema_ takes recommendationType');
ok(/recommendationType: recommendationType/.test(F24), 'D2 gate opts carry recommendationType');
ok(/rpoValidateSchema_\(ss, type\)/.test(F24), 'D3 generate path passes the type being generated');

// ==========================================================================
console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
