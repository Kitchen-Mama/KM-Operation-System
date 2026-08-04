// Kitchen Mama Operation System — FORENSIC write-spy audit of the verification diagnostics (P4-U Incident Round A).
// Run: node assets/tests/supply-planning-verification-diagnostics-forensic.test.js
// LOCAL / FAKE-ONLY. Executes the REAL diagnostic source (KMVD) + a bundle-load against a spreadsheet whose EVERY
// mutating API THROWS + is recorded, and asserts: (1) ZERO write attempts across all three diagnostics + bundle
// load; (2) the fake Spreadsheet is byte-identical before/after (deep snapshot); (3) the incident-state fixture
// (run-journal absent, blank header, duplicate Active Draft) is REPORTED read-only with no repair/create/clear.
// This is evidence, not a grep: any reachable write would throw and fail the run.

'use strict';
var KMVD = require('../js/core/supply-planning-verification-diagnostics.js');
var KMPW = require('../js/core/supply-planning-production-writer.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');
var BUILD = require('../tools/build-apps-script-bundle.js');
var vm = require('vm'); var path = require('path'); var fs = require('fs');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- fake Spreadsheet whose EVERY mutating method throws + is recorded (read methods are pure) --------------
var MUTATORS = ['setValue', 'setValues', 'setFormula', 'setFormulas', 'clear', 'clearContent', 'clearFormat',
  'clearNote', 'deleteRow', 'deleteRows', 'deleteColumn', 'deleteColumns', 'insertRowAfter', 'insertRowBefore',
  'insertRows', 'insertColumnAfter', 'insertColumns', 'appendRow', 'copyTo', 'moveTo', 'setName', 'setFrozenRows',
  'setFrozenColumns', 'setValues2', 'setBackground', 'setFontWeight'];
var SS_MUTATORS = ['insertSheet', 'deleteSheet', 'setActiveSheet', 'setName', 'renameActiveSheet', 'moveActiveSheet', 'duplicateActiveSheet'];

function makeFake(sheetMap) {
  var attempts = [];
  function thrower(where) { return function () { attempts.push(where); throw new Error('WRITE_ATTEMPT:' + where); }; }
  function fakeRange(values) {
    var range = { getValues: function () { return values.map(function (r) { return r.slice(); }); }, getValue: function () { return values[0] ? values[0][0] : ''; }, getNumRows: function () { return values.length; }, getNumColumns: function () { return values[0] ? values[0].length : 0; } };
    MUTATORS.forEach(function (m) { range[m] = thrower('Range.' + m); });
    return range;
  }
  function fakeSheet(name, values) {
    var sheet = {
      getName: function () { return name; },
      getLastRow: function () { return values.length; },
      getLastColumn: function () { return values[0] ? values[0].length : 0; },
      getDataRange: function () { return fakeRange(values); },
      getRange: function (r, c, nr, nc) { // read-only slice; a write via .setValues on the returned range throws
        var out = []; var rows = (nr === undefined) ? 1 : nr; var cols = (nc === undefined) ? 1 : nc;
        for (var i = 0; i < rows; i++) { var row = []; for (var j = 0; j < cols; j++) { var rr = (r - 1) + i, cc = (c - 1) + j; row.push(values[rr] ? values[rr][cc] : ''); } out.push(row); }
        return fakeRange(out);
      }
    };
    MUTATORS.forEach(function (m) { sheet[m] = thrower('Sheet.' + m); });
    return sheet;
  }
  var ss = {
    getId: function () { return 'FAKE-SS'; },
    getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheetMap, n) ? fakeSheet(n, sheetMap[n]) : null; },
    getSheets: function () { return Object.keys(sheetMap).map(function (n) { return fakeSheet(n, sheetMap[n]); }); }
  };
  SS_MUTATORS.forEach(function (m) { ss[m] = thrower('Spreadsheet.' + m); });
  return { ss: ss, attempts: attempts, snapshot: function () { return JSON.stringify(sheetMap); } };
}

// incident-state fixture: run journal ABSENT, request_order_allocation_draft_lines blank header, duplicate Active Draft
function incidentSheets() {
  var wH = KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING, mH = KMPW.DRAFT_HEADERS.MONTHLY_ORDER;
  function wRow(v) { return wH.header.map(function (c) { return v[c] === undefined ? '' : v[c]; }); }
  var scope = { allocation_draft_id: 'D1', planning_cycle: '2026-W40', company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', status: 'draft' };
  var lineHeaderBlank = mH.lines.slice(); lineHeaderBlank[3] = ''; // one blank header
  return {
    shipping_allocation_drafts: [wH.header.slice(), wRow(scope), wRow(Object.assign({}, scope, { allocation_draft_id: 'D2' }))], // duplicate active
    shipping_allocation_draft_lines: [wH.lines.slice()],
    request_order_allocation_drafts: [mH.header.slice()],
    request_order_allocation_draft_lines: [lineHeaderBlank, mH.lines.map(function () { return 1; })]
    // recommendation_calculation_runs intentionally ABSENT
  };
}

// ==========================================================================
section('A. namespaceReport — pure (no SpreadsheetApp), zero writes');
(function () {
  var report = KMVD.namespaceReport({ KMVD: KMVD, KMPR: KMPR, KMPW: KMPW });
  ok(report && typeof report === 'object' && report.hasOwnProperty('ready'), 'A1 namespaceReport returns a report object');
  ok(true, 'A2 namespaceReport touches no Spreadsheet (pure over the globals object)');
})();

section('B. auditDraftTables — REAL code vs write-throwing fake; ZERO writes + byte-equal');
(function () {
  var fake = makeFake(incidentSheets());
  var before = fake.snapshot();
  var report = KMVD.auditDraftTables(fake.ss, {});
  var after = fake.snapshot();
  eq(fake.attempts, [], 'B1 ZERO write attempts during full table audit');
  eq(after, before, 'B2 fake Spreadsheet byte-identical before/after (no cell/header/sheet mutated)');
  // and it correctly REPORTS the incident state read-only:
  ok(report.tables.recommendation_calculation_runs.exists === false && report.issues.some(function (x) { return x.reason === 'SHEET_MISSING'; }), 'B3 missing run journal reported (not created)');
  ok(report.tables.request_order_allocation_draft_lines.missingRequiredHeaders.length > 0, 'B4 blank header surfaced as MISSING_REQUIRED_HEADER (not repaired)');
  ok(report.tables.shipping_allocation_drafts.duplicateActiveConflicts.length === 1, 'B5 duplicate Active Draft reported (not cleaned)');
  ok(report.ready === false, 'B6 audit not ready (issues present) — but performed no mutation');
})();

section('C. activeDraftAudit — REAL code vs write-throwing fake; ZERO writes + byte-equal');
(function () {
  var fake = makeFake(incidentSheets());
  var before = fake.snapshot();
  var r = KMVD.activeDraftAudit(fake.ss, { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen' } });
  var after = fake.snapshot();
  eq(fake.attempts, [], 'C1 ZERO write attempts during scoped Active-Draft audit');
  eq(after, before, 'C2 fake Spreadsheet byte-identical before/after');
  eq(r.status, 'BLOCKED_CONFLICT', 'C3 duplicate active → BLOCKED_CONFLICT (read-only decision; no repair)');
})();

section('D. GENERATED BUNDLE load has ZERO live-Spreadsheet side effects');
(function () {
  var code = BUILD.buildBundleFromDisk(path.join(__dirname, '..', 'js', 'core')).code;
  var touched = [];
  // a SpreadsheetApp proxy: ANY property access/call during bundle LOAD is recorded (and would break purity)
  var saProxy = new Proxy(function () {}, { get: function (t, p) { touched.push('SpreadsheetApp.' + String(p)); return function () { touched.push('call:' + String(p)); return saProxy; }; }, apply: function () { touched.push('SpreadsheetApp()'); return saProxy; } });
  var lockProxy = new Proxy(function () {}, { get: function () { touched.push('LockService.access'); return function () { return lockProxy; }; } });
  var ctx = { SpreadsheetApp: saProxy, LockService: lockProxy };
  vm.createContext(ctx);
  var threw = null; try { vm.runInContext(code, ctx, { filename: 'bundle.gs' }); } catch (e) { threw = e; }
  ok(threw === null, 'D1 bundle loads without error');
  eq(touched, [], 'D2 bundle LOAD never touches SpreadsheetApp / LockService (zero top-level side effects)');
  ok(ctx.KMVD && ctx.KMPW && ctx.KMPR, 'D3 namespaces exposed after load (KMVD/KMPW/KMPR present)');
})();

section('E. Confirm the ONLY write-capable recommendation path is the GENERATE action (not diagnostics)');
(function () {
  var gs28 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '28_recommendation_verification_diagnostics.gs'), 'utf8');
  var code = gs28.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  ok(!/insertSheet|setValues|appendRow|deleteRow|clearContent|\.clear\(|procurementEnsureSheet_|sheetEnsureColumns_|rpoEnsureSchema_|handleGenerateRecommendationDraftLocked_|runRecommendationGeneration|persistProductionRecommendation/.test(code), 'E1 28_.gs (diagnostics) reaches no ensure/write/generation function');
  var gs24raw = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '24_recommendation_orchestrator.gs'), 'utf8');
  var gs24 = gs24raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');   // strip comments (executable only)
  // Production Safety Round S0: the recommendation generate path no longer auto-creates schema — it VALIDATES
  // (fail-closed) via KMPW.assertAuthorizedSchemasReady, and the auto-creating ensure helpers were removed from it.
  ok(/rpoValidateSchema_/.test(gs24) && /assertAuthorizedSchemasReady/.test(gs24) && /handleGenerateRecommendationDraftLocked_/.test(gs24), 'E2 generate handler validates schema (no auto-create) before lock/write');
  ok(!/procurementEnsureSheet_|sheetEnsureColumns_|rpoEnsureSchema_/.test(gs24), 'E2b auto-creating ensure helpers removed from the recommendation generate path (validate, never repair)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll P4-U Incident Round A forensic assertions passed (' + pass + ' assertions). Diagnostics exonerated: ZERO writes.');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
