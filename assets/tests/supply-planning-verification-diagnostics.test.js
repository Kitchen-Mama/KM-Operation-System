// Kitchen Mama Operation System — READ-ONLY verification diagnostics tests (Round 1S-P4-U).
// Run: node assets/tests/supply-planning-verification-diagnostics.test.js
// Proves the read-only diagnostics: namespaceReport (bundle-load smoke), auditDraftTables (five-table readiness +
// Active-Draft Composite-Key audit + duplicate-active conflict + missing-header detection), and activeDraftAudit
// (single-scope CREATE/REUSE/BLOCKED_CONFLICT decision). No writes; pure; deterministic.

'use strict';
var KMVD = require('../js/core/supply-planning-verification-diagnostics.js');
var KMPW = require('../js/core/supply-planning-production-writer.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');
var KMSP = require('../js/core/supply-planning-source-projection.js');
var KMPS = require('../js/core/supply-planning-production-source.js');
var KMPL = require('../js/core/supply-planning-persistence-locking.js');
var KMORCH = require('../js/core/supply-planning-recommendation-orchestrator.js');
var KMSRP = require('../js/core/supply-planning-source-reader-production.js');
var KMSR = require('../js/core/supply-planning-source-reader.js');
var KMSI = require('../js/core/supply-planning-recommendation-source-integration.js');
var KMPB = require('../js/core/supply-planning-plan-builder.js');
var KMPPB = require('../js/core/supply-planning-persistence-plan-builder.js');
var KMPC = require('../js/core/supply-planning-persistence.js');
var fs = require('fs'); var path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var WRITE_METHODS = ['setValues', 'setValue', 'appendRow', 'deleteRow', 'insertRow', 'clear', 'clearContent'];
function fakeSpreadsheet(sheetMap) {
  var writes = { count: 0 };
  function fakeSheet(values) {
    var range = { getValues: function () { return values.map(function (r) { return r.slice(); }); } };
    WRITE_METHODS.forEach(function (m) { range[m] = function () { writes.count++; }; });
    var sheet = { getLastRow: function () { return values.length; }, getDataRange: function () { return range; }, getRange: function () { return range; } };
    WRITE_METHODS.forEach(function (m) { sheet[m] = function () { writes.count++; }; });
    return sheet;
  }
  return { _writes: writes, getSheetByName: function (n) { return Object.prototype.hasOwnProperty.call(sheetMap, n) ? fakeSheet(sheetMap[n]) : null; } };
}
// build a live-like Draft sheet map with correct headers (from the frozen schema)
function draftSheets(overrides) {
  var wH = KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING, mH = KMPW.DRAFT_HEADERS.MONTHLY_ORDER;
  var m = {
    shipping_allocation_drafts: [wH.header.slice()],
    shipping_allocation_draft_lines: [wH.lines.slice()],
    request_order_allocation_drafts: [mH.header.slice()],
    request_order_allocation_draft_lines: [mH.lines.slice()],
    recommendation_calculation_runs: [KMPR.RUN_JOURNAL_HEADERS.slice()]
  };
  if (overrides) for (var k in overrides) m[k] = overrides[k];
  return m;
}
function weeklyHeaderRow(vals) { var h = KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING.header; return h.map(function (c) { return vals[c] === undefined ? '' : vals[c]; }); }

// ==========================================================================
section('A. namespaceReport (bundle-load smoke; pure over the real modules)');
(function () {
  var env = { KMSP: KMSP, KMPS: KMPS, KMPW: KMPW, KMPR: KMPR, KMPL: KMPL, KMORCH: KMORCH, KMSRP: KMSRP, KMSR: KMSR, KMSI: KMSI, KMPB: KMPB, KMPPB: KMPPB, KMPC: KMPC, KM_BUNDLE_INFO: { modules: new Array(24) } };
  var r = KMVD.namespaceReport(env);
  eq(r.ready, true, 'A1 all required namespaces + public functions present → ready');
  eq(r.moduleCount, 24, 'A2 module count reported from KM_BUNDLE_INFO');
  eq(r.namespaces.KMPW, 'object', 'A3 KMPW namespace object');
  eq(r.functions['KMPW.persistProductionRecommendation'], true, 'A4 writer entry present');
  eq(r.functions['KMORCH.runRecommendationGeneration'], true, 'A5 orchestrator entry present');
  // absent bundle → not ready (fails safe)
  var r2 = KMVD.namespaceReport({ KMPW: KMPW });
  eq([r2.ready, r2.namespaces.KMSP], [false, 'undefined'], 'A6 missing namespaces → not ready');
})();

section('B. auditDraftTables — clean five-table readiness (READ-ONLY)');
(function () {
  var ss = fakeSpreadsheet(draftSheets());
  var a = KMVD.auditDraftTables(ss, {});
  eq(a.ready, true, 'B1 all five tables exist with exact frozen headers → ready');
  eq(a.tables.shipping_allocation_drafts.missingRequiredHeaders, [], 'B2 Weekly header no missing columns');
  eq(a.tables.request_order_allocation_draft_lines.missingRequiredHeaders, [], 'B3 Monthly line no missing columns');
  eq([a.tables.shipping_allocation_drafts.rowCount, a.tables.shipping_allocation_drafts.submittedCount], [0, 0], 'B4 empty header table → 0 rows / 0 submitted');
  eq(ss._writes.count, 0, 'B5 audit performed zero writes');
})();

section('C. auditDraftTables — missing sheet + missing header + duplicate active conflict');
(function () {
  // missing a required header on the Weekly header table
  var bad = draftSheets({ shipping_allocation_drafts: [['allocation_draft_id', 'planning_cycle']] });
  var a = KMVD.auditDraftTables(fakeSpreadsheet(bad), {});
  ok(a.tables.shipping_allocation_drafts.missingRequiredHeaders.indexOf('status') >= 0, 'C1 missing required header detected');
  ok(a.issues.some(function (x) { return x.reason === 'MISSING_REQUIRED_HEADER'; }) && a.ready === false, 'C2 not ready when a required header is missing');
  // missing sheet entirely
  var noRun = draftSheets(); delete noRun.recommendation_calculation_runs;
  var a2 = KMVD.auditDraftTables(fakeSpreadsheet(noRun), {});
  ok(a2.tables.recommendation_calculation_runs.exists === false && a2.issues.some(function (x) { return x.reason === 'SHEET_MISSING'; }), 'C3 missing Sheet flagged');
  // duplicate Active Draft for one Composite Natural Key → conflict
  var scope = { allocation_draft_id: 'D1', planning_cycle: '2026-W40', company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', status: 'draft' };
  var scope2 = Object.assign({}, scope, { allocation_draft_id: 'D2' });
  var dupSheets = draftSheets({ shipping_allocation_drafts: [KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING.header.slice(), weeklyHeaderRow(scope), weeklyHeaderRow(scope2)] });
  var a3 = KMVD.auditDraftTables(fakeSpreadsheet(dupSheets), {});
  ok(a3.tables.shipping_allocation_drafts.duplicateActiveConflicts.length === 1 && a3.issues.some(function (x) { return x.reason === 'DUPLICATE_ACTIVE_DRAFT'; }), 'C4 two active drafts on one Composite Key → DUPLICATE_ACTIVE_DRAFT');
  // a terminal (submitted) row is NOT counted as active
  var term = draftSheets({ shipping_allocation_drafts: [KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING.header.slice(), weeklyHeaderRow(Object.assign({}, scope, { status: 'submitted' }))] });
  var a4 = KMVD.auditDraftTables(fakeSpreadsheet(term), {});
  eq([a4.tables.shipping_allocation_drafts.submittedCount, Object.keys(a4.tables.shipping_allocation_drafts.activeByKey).length], [1, 0], 'C5 submitted row counted, not active');
})();

section('D. activeDraftAudit — single-scope CREATE / REUSE / BLOCKED_CONFLICT decision');
(function () {
  var query = { recommendationType: 'WEEKLY_SHIPPING', planningCycle: '2026-W40', businessScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen' } };
  // 0 active → CREATE
  var c = KMVD.activeDraftAudit(fakeSpreadsheet(draftSheets()), query);
  eq([c.status, c.decision], ['CREATE', 'AUTHORIZED_CREATE_TEST'], 'D1 no active draft → AUTHORIZED_CREATE_TEST');
  // 1 active → REUSE
  var scope = { allocation_draft_id: 'D1', planning_cycle: '2026-W40', company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', status: 'draft' };
  var one = draftSheets({ shipping_allocation_drafts: [KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING.header.slice(), weeklyHeaderRow(scope)] });
  var r = KMVD.activeDraftAudit(fakeSpreadsheet(one), query);
  eq([r.status, r.decision, r.draftId], ['REUSE', 'AUTHORIZED_REUSE_TEST', 'D1'], 'D2 one active draft → AUTHORIZED_REUSE_TEST');
  // >1 active → BLOCKED_CONFLICT HALT
  var two = draftSheets({ shipping_allocation_drafts: [KMPW.DRAFT_HEADERS.WEEKLY_SHIPPING.header.slice(), weeklyHeaderRow(scope), weeklyHeaderRow(Object.assign({}, scope, { allocation_draft_id: 'D2' }))] });
  var b = KMVD.activeDraftAudit(fakeSpreadsheet(two), query);
  eq([b.status, b.decision], ['BLOCKED_CONFLICT', 'BLOCKED_CONFLICT_HALT'], 'D3 duplicate active → BLOCKED_CONFLICT_HALT (no cleanup, no generation)');
  throwsType(function () { KMVD.activeDraftAudit(fakeSpreadsheet(draftSheets()), { recommendationType: 'NOPE' }); }, 'D4 invalid recommendationType → TypeError');
})();

section('E. Purity / non-write / boundary source scans');
(function () {
  var ss = fakeSpreadsheet(draftSheets());
  var a1 = KMVD.auditDraftTables(ss, {});
  var a2 = KMVD.auditDraftTables(fakeSpreadsheet(draftSheets()), {});
  eq(a1, a2, 'E1 deterministic (deep-equal)');
  eq(ss._writes.count, 0, 'E2 zero writes across all diagnostics');
  function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1'); }
  var pure = code(fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-verification-diagnostics.js'), 'utf8'));
  ok(!/SpreadsheetApp|LockService|CacheService/.test(pure), 'E3 pure KMVD: no SpreadsheetApp/LockService/Cache');
  ok(!/Date\.now|Math\.random|localeCompare/.test(pure), 'E4 pure KMVD: no clock/random/locale');
  ok(!/setValues|setValue\b|appendRow|deleteRow|insertRow|clearContent|\.clear\(/.test(pure), 'E5a pure KMVD invokes no Sheet-write method');
  ok(!/applyPersistencePlan\s*\(|executeLockedPersistence\s*\(|runRecommendationGeneration\s*\(/.test(pure), 'E5b pure KMVD invokes no persistence/generation call (namespace presence probes only)');
  var gs = code(fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '28_recommendation_verification_diagnostics.gs'), 'utf8'));
  ok(!/setValues|setValue\b|appendRow|deleteRow|insertRow|clearContent|LockService|applyPersistencePlan|runRecommendationGeneration|persistProductionRecommendation/.test(gs), 'E6 28_.gs invokes no write/lock/generation method (read-only diagnostics)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1S-P4-U Verification Diagnostics assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
