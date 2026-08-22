// Kitchen Mama Operation System — R5B-P0 flat V2 table loading + header authority — F1-7N-FA-3C-DRAFT-MODEL-R5B.
// Run: node assets/tests/request-order-flat-v2-table-loading-f1-7n-fa-3c-r5b.test.js
// Reproduces the live PRODUCTION_SAFETY:HEADER_MISSING [request_order_allocation_drafts] with the REAL shared loader
// rprReadTable_ (23_): the V2 canonical tab (53 headers, category_snapshot/series_snapshot retired) validated against
// the LEGACY authority → HEADER_MISSING. Proves the flag-gated fix (flag=true → KMRDV2.V2_HEADERS; flag=false →
// legacy, for rollback) and that the read-only diagnostic reports the canonical table correctly.

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS23 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '23_recommendation_persistence_repository.gs'), 'utf8').replace(/\r\n/g, '\n');
var GSTEMP = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS47 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '47_api_v1_recommendation_generation.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS24 = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '24_recommendation_orchestrator.gs'), 'utf8').replace(/\r\n/g, '\n');

var LEGACY_HEADERS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku', 'category_snapshot', 'series_snapshot', 'status', 'generation_type', 'draft_purpose', 'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version', 'created_by', 'created_at', 'updated_by', 'updated_at', 'submitted_by', 'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'];
var CANON = 'request_order_allocation_drafts';

// ---- a V2 canonical tab (53 headers + N rows) as a read-only mock sheet -----
function v2Matrix(headerList, nRows) {
  var m = [headerList.slice()];
  for (var r = 0; r < nRows; r++) { var row = headerList.map(function () { return ''; }); row[headerList.indexOf('request_allocation_draft_id')] = 'RAD-' + r; row[headerList.indexOf('planning_cycle')] = '2026-08'; row[headerList.indexOf('company')] = 'ResUS'; row[headerList.indexOf('country')] = 'US'; row[headerList.indexOf('marketplace')] = 'Amazon'; row[headerList.indexOf('sku')] = 'S' + r; row[headerList.indexOf('status')] = 'draft'; m.push(row); }
  return m;
}
function mockSheet(name, matrix, track) {
  return { getName: function () { return name; }, getLastRow: function () { return matrix.length; }, getLastColumn: function () { return matrix[0] ? matrix[0].length : 0; },
    getDataRange: function () { return { getValues: function () { return matrix; } }; },
    getRange: function (r, c, nr, nc) { return { getValues: function () { var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push((matrix[r - 1 + i] || [])[c - 1 + j]); out.push(row); } return out; }, setValues: function () { track.writes++; } }; },
    getId: function () { return name; } };
}

// ---- load the REAL 23_ shared loader with a faithful prodRequireSheet_ stub + toggleable flag ----
function load23(opts) {
  opts = opts || {};
  var track = { writes: 0, ensureHeaders: [], appendCalls: 0 };
  var tabs = {};
  if (!opts.noTab) tabs[CANON] = mockSheet(CANON, opts.matrix || v2Matrix(KMRDV2.V2_HEADERS, 26), track);
  var ss = { getSheetByName: function (n) { return tabs[n] || null; } };
  var sb = {
    KMRDV2: KMRDV2, KMPR: { TABLES: {}, RUN_JOURNAL_TABLE: 'recommendation_calculation_runs' },
    REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_: LEGACY_HEADERS,
    RECOMMENDATION_CALCULATION_RUNS_HEADERS_: ['calculation_run_id'],
    requestOrderDraftV2FlatCutoverEnabled_: function () { return opts.flag === true; },
    // faithful mini prodRequireSheet_ (exact token) — validates actual headers ⊇ expected; empty/missing fails closed
    procurementEnsureSheet_: function (ss2, name, headers) {
      track.ensureHeaders = headers;
      var sh = ss2.getSheetByName(name);
      if (!sh) throw new Error('PRODUCTION_SAFETY:SCHEMA_NOT_PROVISIONED [' + name + ']');
      var lc = sh.getLastColumn(); if (sh.getLastRow() < 1 || lc < 1) throw new Error('PRODUCTION_SAFETY:HEADER_MISSING [' + name + ']');
      var actual = sh.getRange(1, 1, 1, lc).getValues()[0].map(function (h) { return String(h).trim(); });
      var missing = (headers || []).filter(function (h) { return actual.indexOf(h) === -1; });
      if (missing.length) throw new Error('PRODUCTION_SAFETY:HEADER_MISSING [' + name + ']');
      return sh;
    },
    sheetEnsureColumns_: function (sh, headers) { track.appendCalls++; /* no-op: additive ensure; V2 headers already present */ },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, console: console
  };
  vm.createContext(sb); vm.runInContext(GS23, sb, { filename: '23_.gs' });
  return { sb: sb, track: track, ss: ss };
}
function tryRead(env) { try { return { ok: true, res: env.sb.rprReadTable_(env.ss, CANON) }; } catch (e) { return { ok: false, err: String(e.message || e) }; } }

// ==========================================================================
section('REPRODUCE: flag=false (or pre-fix legacy authority) validates the V2 tab against LEGACY → HEADER_MISSING');
var legacyEnv = load23({ flag: false });
var legacyRead = tryRead(legacyEnv);
ok(!legacyRead.ok && /PRODUCTION_SAFETY:HEADER_MISSING \[request_order_allocation_drafts\]/.test(legacyRead.err), 'legacy authority on the V2 tab → exact HEADER_MISSING (reproduces the live failure)');
eq(legacyEnv.track.ensureHeaders, LEGACY_HEADERS, 'flag=false selects the LEGACY header authority (rollback path preserved)');

section('FIX: flag=true → rprReadTable_ selects KMRDV2.V2_HEADERS → the V2 tab loads');
var v2Env = load23({ flag: true });
var v2Read = tryRead(v2Env);
ok(v2Read.ok, 'flag=true → V2 tab loads without HEADER_MISSING');
eq(v2Env.track.ensureHeaders, KMRDV2.V2_HEADERS, 'flag=true selects KMRDV2.V2_HEADERS (53) BEFORE schema validation');
eq(v2Read.res.headers.length, 53, 'loaded sheetSet has the 53 V2 headers');
eq(v2Read.res.rows.length, 26, 'loaded 26 canonical rows');
eq(v2Env.track.writes, 0, 'loader performed ZERO writes (read-only)');

section('fail-closed: missing tab; one missing V2 header');
ok(!tryRead(load23({ flag: true, noTab: true })).ok, 'absent canonical tab → fail closed (SCHEMA_NOT_PROVISIONED)');
var short = KMRDV2.V2_HEADERS.filter(function (h) { return h !== 'planning_cycle'; });   // drop one V2 header
var missEnv = load23({ flag: true, matrix: v2Matrix(short, 26) });
ok(!tryRead(missEnv).ok, 'a V2 tab missing one V2 header (planning_cycle) → HEADER_MISSING (fail closed, strict)');

section('rprBuildSheetSet_ converges on the V2 authority under flag=true');
var built = load23({ flag: true }).sb.rprBuildSheetSet_(load23({ flag: true }).ss, [CANON]);
eq(built.set[CANON].headers.length, 53, 'rprBuildSheetSet_ returns the 53-header V2 sheetSet under flag=true');

section('all V2 consumers converge on the ONE shared loader (source-level)');
ok(/rprBuildSheetSet_\(ss,\s*\[KMRDV2P\.HEADER_TABLE\]\)/.test(GS47), '47_ flat readback builds via the shared rprBuildSheetSet_');
ok(/rpoFlatLoadActive_[\s\S]*rprBuildSheetSet_\(ss,\s*\[KMRDV2P\.HEADER_TABLE\]\)/.test(GS24), '24_ rpoFlatLoadActive_ builds via the shared rprBuildSheetSet_');
ok(/function rprReadTable_/.test(GS23) && /KMRDV2\.V2_HEADERS/.test(GS23) && /requestOrderDraftV2FlatCutoverEnabled_/.test(GS23), '23_ rprReadTable_ is flag-aware and selects KMRDV2.V2_HEADERS');
ok(!/request_order_allocation_draft_lines/.test(GS47.split('function recGenFlatReadback_')[1].split('\nfunction ')[0]), 'flat readback has zero Draft-Line dependency');

// ==========================================================================
section('READ-ONLY diagnostic TEMP_R5B_DIAGNOSE_CANONICAL_DRAFT_TABLE — reports V2_TABLE_READY, zero writes');
var dtrack = { writes: 0 };
var dtabs = {}; dtabs[CANON] = mockSheet(CANON, v2Matrix(KMRDV2.V2_HEADERS, 26), dtrack);
var dss = { getSheetByName: function (n) { return dtabs[n] || null; }, getId: function () { return 'SS-LIVE-ID-1234'; }, getName: function () { return 'KM Ops DB'; }, getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; } };
var dsb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, requestOrderDraftV2FlatCutoverEnabled_: function () { return true; }, PRODUCTION_DB_SPREADSHEET_ID_: 'SS-LIVE-ID-1234',
  SpreadsheetApp: { getActiveSpreadsheet: function () { return dss; } }, Utilities: { formatDate: function () { return '2026-08'; } }, Logger: { log: function () {} }, console: console };
vm.createContext(dsb); vm.runInContext(GSTEMP, dsb, { filename: 'TEMP.gs' });
var diag = dsb.TEMP_R5B_DIAGNOSE_CANONICAL_DRAFT_TABLE();
eq(diag.CANONICAL_TAB_PRESENT, 'YES', 'diagnostic: canonical tab present');
eq(diag.CANONICAL_V2_SCHEMA_EXACT, 'YES', 'diagnostic: V2 schema exact (53 headers match)');
eq(diag.RUNTIME_SPREADSHEET_TARGET_MATCH, 'YES', 'diagnostic: runtime target matches PRODUCTION_DB_SPREADSHEET_ID_');
eq(diag.loader_authority_selected, 'FLAT_V2', 'diagnostic: loader authority = FLAT_V2');
eq(diag.V2_AUTHORITY_SELECTED_BEFORE_HEADER_GUARD, 'YES', 'diagnostic: V2 authority selected before the header guard');
eq(diag.DRAFT_LINE_DEPENDENCY_ZERO, 'YES (flat V2 reads request_order_allocation_drafts ONLY; never request_order_allocation_draft_lines)', 'diagnostic: zero Draft-Line dependency');
eq([diag.missing_v2_headers, diag.extra_headers, diag.duplicate_headers], [[], [], []], 'diagnostic: no missing/extra/duplicate headers');
eq(diag.verdict, 'V2_TABLE_READY', 'diagnostic verdict = V2_TABLE_READY');
eq(diag.R5B_DIAGNOSTIC_READY, 'YES', 'R5B_DIAGNOSTIC_READY=YES');
eq(dtrack.writes, 0, 'diagnostic performed ZERO writes');
ok(!/SS-LIVE-ID-1234/.test(diag.runtime_spreadsheet_id_fingerprint) || diag.runtime_spreadsheet_id_fingerprint.indexOf('…') !== -1, 'diagnostic id is a partial fingerprint, not the full id');
// diagnostic reproduces the failure signature when flag=false (legacy authority would be selected)
var dsb2 = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, requestOrderDraftV2FlatCutoverEnabled_: function () { return false; }, PRODUCTION_DB_SPREADSHEET_ID_: 'SS-LIVE-ID-1234',
  SpreadsheetApp: { getActiveSpreadsheet: function () { return dss; } }, Utilities: { formatDate: function () { return '2026-08'; } }, Logger: { log: function () {} }, console: console };
vm.createContext(dsb2); vm.runInContext(GSTEMP, dsb2, { filename: 'TEMP.gs' });
eq(dsb2.TEMP_R5B_DIAGNOSE_CANONICAL_DRAFT_TABLE().loader_authority_selected, 'LEGACY', 'diagnostic: flag=false → loader authority LEGACY (the pre-fix live state)');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R5B FLAT V2 TABLE LOADING (F1-7N-FA-3C-R5B): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
