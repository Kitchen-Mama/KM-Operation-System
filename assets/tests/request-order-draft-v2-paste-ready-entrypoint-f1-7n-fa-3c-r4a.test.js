// Kitchen Mama Operation System — R4A paste-ready migration ENTRYPOINT execution test — F1-7N-FA-3C-DRAFT-MODEL-R4A.
// Run: node assets/tests/request-order-draft-v2-paste-ready-entrypoint-f1-7n-fa-3c-r4a.test.js
// Loads the ACTUAL TEMP_migrate_request_order_draft_v2.gs in a vm sandbox with a mock SpreadsheetApp + the real
// KMRDV2/KMRDV2P, and proves the paste-ready contract: no undefined helper, name consistency, no-argument public
// entrypoints, dry-run/validate write-count = 0, execute writes ONLY the staging tab, legacy tabs never mutated,
// staging validator READY_FOR_SWAP transitions, and STAGING_TAB_NOT_EMPTY protection. No live DB; no mutation.

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS_PATH = path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs');
var GS = fs.readFileSync(GS_PATH, 'utf8').replace(/\r\n/g, '\n');

// ---- static naming-consistency check: every TEMP_ call resolves to a TEMP_ definition ------------------------
section('static: definitions/calls consistent, no undefined helper, public entrypoints present');
var defs = {}; (GS.match(/function\s+(TEMP_[A-Za-z0-9_]+)\s*\(/g) || []).forEach(function (m) { defs[m.replace(/function\s+/, '').replace(/\s*\($/, '')] = 1; });
var calls = {}; (GS.match(/\bTEMP_[A-Za-z0-9_]+\s*\(/g) || []).forEach(function (m) { calls[m.replace(/\s*\($/, '')] = 1; });
var callNames = Object.keys(calls).filter(function (n) { return !/^TEMP_R4_/.test(n); });   // public wrappers call the private core
var unresolved = callNames.filter(function (n) { return !defs[n]; });
eq(unresolved, [], 'every called TEMP_ helper has a matching definition (no ReferenceError-inducing mismatch)');
['TEMP_r4Bundle_', 'TEMP_readObjects_', 'TEMP_buildSource_', 'TEMP_migrateRequestOrderDraftV2_', 'TEMP_validateRequestOrderDraftV2Staging_'].forEach(function (n) { ok(defs[n] === 1, 'private helper defined: ' + n); });
['TEMP_R4_DRY_RUN_RequestOrderDraftV2', 'TEMP_R4_EXECUTE_RequestOrderDraftV2', 'TEMP_R4_VALIDATE_RequestOrderDraftV2Staging'].forEach(function (n) { ok(defs[n] === 1 && !/_$/.test(n), 'public no-`_` entrypoint defined (Run-menu visible): ' + n); });

// ---- 124-shape legacy fixture as sheet matrices --------------------------------------------------------------
var HCOLS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku', 'status', 'generation_type', 'draft_purpose', 'draft_version', 'calculation_run_id', 'formula_version', 'created_by', 'created_at', 'updated_by', 'updated_at'];
var LCOLS = ['request_allocation_draft_id', 'request_bucket', 'request_month', 'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'line_status', 'submitted_by', 'submitted_at', 'user_edited'];
function hRow(id, status, cyc, sku) { return { request_allocation_draft_id: id, planning_cycle: cyc, company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: sku, status: status, generation_type: 'ai_plan', draft_purpose: 'regular', draft_version: 1, calculation_run_id: 'RUN-' + id, formula_version: 'ORDER_PLANNING_GAP', created_by: 'sys', created_at: 'C', updated_by: 'sys', updated_at: 'U' }; }
function lRow(id, b, m, rec, ord, st) { return { request_allocation_draft_id: id, request_bucket: b, request_month: m, recommended_qty: rec, order_qty: ord, carton_qty: '', units_per_carton: '10', line_status: st, submitted_by: st === 'submitted' ? 'u' : '', submitted_at: st === 'submitted' ? 't' : '', user_edited: 'FALSE' }; }
function toMatrix(cols, objs) { return [cols.slice()].concat(objs.map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }
function fixtureMatrices() {
  var H = [], L = [], i;
  for (i = 0; i < 98; i++) { var zid = (i < 10 ? 'RAD-z' + i : 'RD::MONTHLY_ORDER::2026-09::z' + i); H.push(hRow(zid, 'draft', '2026-09', 'Z' + i)); }
  for (i = 0; i < 6; i++) { var aid = 'RD::MONTHLY_ORDER::2026-09::a' + i; H.push(hRow(aid, 'draft', '2026-09', 'A' + i)); L.push(lRow(aid, 'T1', '2026-09', 100, 100, 'active'), lRow(aid, 'T2', '2026-10', 50, 50, 'active'), lRow(aid, 'T3', '2026-11', 0, 0, 'draft')); }
  for (i = 0; i < 20; i++) { var sid = (i < 15 ? 'RAD-s' + i : 'RD::MONTHLY_ORDER::2026-08::s' + i); H.push(hRow(sid, 'submitted', '2026-08', 'S' + i)); L.push(lRow(sid, 'T1', '2026-08', 200, 200, 'submitted'), lRow(sid, 'T2', '2026-09', 100, 100, 'submitted')); }
  return { headerMatrix: toMatrix(HCOLS, H), lineMatrix: toMatrix(LCOLS, L) };
}

// ---- instrumented mock Spreadsheet ---------------------------------------------------------------------------
var HDR_TAB = 'request_order_allocation_drafts', LINE_TAB = 'request_order_allocation_draft_lines', V2_TAB = 'request_order_allocation_drafts_v2';
function makeSandbox(preStaging) {
  var fx = fixtureMatrices();
  var tabs = {}; tabs[HDR_TAB] = fx.headerMatrix; tabs[LINE_TAB] = fx.lineMatrix;
  if (preStaging !== undefined) tabs[V2_TAB] = preStaging;
  var track = {}; function T(n) { track[n] = track[n] || { setValues: 0, clear: 0, rename: 0, del: 0 }; return track[n]; }
  var insertLog = [];
  function sheetObj(name) {
    return {
      getName: function () { return name; },
      getDataRange: function () { return { getValues: function () { return tabs[name] || [[]]; } }; },
      getRange: function () { return { setValues: function (m) { T(name).setValues++; tabs[name] = m; } }; },
      clear: function () { T(name).clear++; tabs[name] = []; },
      setName: function () { T(name).rename++; },
      // deleteSheet lives on Spreadsheet, not sheet; setName is the rename surface
    };
  }
  var ss = {
    getSheetByName: function (n) { return (tabs[n] !== undefined) ? sheetObj(n) : null; },
    insertSheet: function (n) { insertLog.push(n); tabs[n] = []; return sheetObj(n); },
    deleteSheet: function (sh) { if (sh && sh.getName) T(sh.getName()).del++; }
  };
  var logs = [];
  var sandbox = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } },
    Logger: { log: function (m) { logs.push(String(m)); } }, console: console };
  vm.createContext(sandbox);
  vm.runInContext(GS, sandbox, { filename: 'TEMP_migrate_request_order_draft_v2.gs' });
  return { sandbox: sandbox, track: track, insertLog: insertLog, tabs: tabs, T: T, logs: logs };
}
function writeCount(track) { var n = 0; Object.keys(track).forEach(function (k) { n += track[k].setValues + track[k].clear + track[k].rename + track[k].del; }); return n; }
function legacyMutations(track) { var m = 0; [HDR_TAB, LINE_TAB].forEach(function (t) { if (track[t]) m += track[t].setValues + track[t].clear + track[t].rename + track[t].del; }); return m; }

// ==========================================================================
section('DRY RUN — public entrypoint runs; execute===false; ZERO writes');
var d = makeSandbox();
var dryOut = d.sandbox.TEMP_R4_DRY_RUN_RequestOrderDraftV2();
ok(dryOut && dryOut.mode === 'DRY_RUN', 'TEMP_R4_DRY_RUN_RequestOrderDraftV2() returns DRY_RUN');
eq([dryOut.report.MIGRATE_ROWS, dryOut.report.NON_ACTIONABLE_DROPPED_FROM_V2, dryOut.report.SUBMITTED_MIGRATED], [26, 98, 20], 'dry-run report 26 migrate / 98 dropped / 20 submitted');
eq(writeCount(d.track), 0, 'DRY RUN total write count = 0 (no setValues/clear/rename/delete)');
eq(d.insertLog, [], 'DRY RUN inserts no sheet');

section('EXECUTE — public entrypoint passes execute:true; writes ONLY the staging tab; legacy untouched');
var e = makeSandbox();
var exOut = e.sandbox.TEMP_R4_EXECUTE_RequestOrderDraftV2();
ok(exOut && exOut.mode === 'EXECUTE' && exOut.written_rows === 26 && exOut.written_headers === 53, 'EXECUTE wrote 26 rows / 53 headers to staging');
eq(e.insertLog, [V2_TAB], 'EXECUTE inserts ONLY request_order_allocation_drafts_v2');
ok(e.track[V2_TAB] && e.track[V2_TAB].setValues === 1, 'EXECUTE setValues once on the staging tab');
eq(legacyMutations(e.track), 0, 'EXECUTE performs ZERO mutation on the two legacy tabs (no setValues/clear/rename/delete)');
// staging content = 53-header row + 26 rows
ok(e.tabs[V2_TAB].length === 27 && e.tabs[V2_TAB][0].length === 53, 'staging matrix = 1 header row (53 cols) + 26 data rows');

section('VALIDATE — read-only; READY_FOR_SWAP transitions');
// staging present + correct (reuse the executed sandbox e's staging as pre-staging in a fresh sandbox)
var executedStaging = e.tabs[V2_TAB];
var vOk = makeSandbox(executedStaging);
var vRes = vOk.sandbox.TEMP_R4_VALIDATE_RequestOrderDraftV2Staging();
eq(vRes.READY_FOR_SWAP, 'YES', 'valid staging → READY_FOR_SWAP=YES');
eq(writeCount(vOk.track), 0, 'VALIDATE total write count = 0 (read-only)');
// staging absent
var vAbsent = makeSandbox();
eq(vAbsent.sandbox.TEMP_R4_VALIDATE_RequestOrderDraftV2Staging().READY_FOR_SWAP, 'NO', 'absent staging → READY_FOR_SWAP=NO');
// wrong schema
var badSchema = [['x', 'y']].concat(executedStaging.slice(1));
eq(makeSandbox(badSchema).sandbox.TEMP_R4_VALIDATE_RequestOrderDraftV2Staging().SCHEMA_OK, false, 'wrong staging schema → SCHEMA_OK=false');
// wrong row count (drop one row)
var shortRows = [executedStaging[0]].concat(executedStaging.slice(1, 26));
eq(makeSandbox(shortRows).sandbox.TEMP_R4_VALIDATE_RequestOrderDraftV2Staging().ROW_COUNT_OK, false, 'row count 25 → ROW_COUNT_OK=false');

section('EXECUTE fail-closed on a non-empty existing staging tab');
var preFilled = [KMRDV2.V2_HEADERS.slice()].concat([KMRDV2.V2_HEADERS.map(function () { return 'x'; })]);   // header + 1 stray row
var pf = makeSandbox(preFilled);
var pfOut = pf.sandbox.TEMP_R4_EXECUTE_RequestOrderDraftV2();
ok(pfOut && pfOut.halt === 'STAGING_TAB_NOT_EMPTY', 'existing non-empty staging → HALT STAGING_TAB_NOT_EMPTY');
eq(legacyMutations(pf.track), 0, 'aborted EXECUTE still never touches legacy tabs');

section('drift guard reachable through the public entrypoint (mismatched live shape → HALT)');
// shrink the header fixture by monkeypatching: run a sandbox whose source tab has fewer rows
(function () {
  var fx = fixtureMatrices(); var short = { headerMatrix: fx.headerMatrix.slice(0, 100), lineMatrix: fx.lineMatrix };
  var tabs = {}; tabs[HDR_TAB] = short.headerMatrix; tabs[LINE_TAB] = short.lineMatrix;
  var ss = { getSheetByName: function (n) { return tabs[n] !== undefined ? { getDataRange: function () { return { getValues: function () { return tabs[n]; } }; } } : null; }, insertSheet: function () { throw new Error('should not insert on drift'); } };
  var sb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, Logger: { log: function () {} } };
  vm.createContext(sb); vm.runInContext(GS, sb, {});
  var out = sb.TEMP_R4_DRY_RUN_RequestOrderDraftV2();
  ok(out && out.halt === 'R4_LIVE_DATA_DRIFT_FROM_R3', 'drifted live shape → HALT R4_LIVE_DATA_DRIFT_FROM_R3 (no write attempted)');
})();

section('flag + bundle invariants (read-only)');
var cfg = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');
ok(/REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=\s*false/.test(cfg), 'cutover flag remains false');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4A PASTE-READY ENTRYPOINT (F1-7N-FA-3C-R4A): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
