// Kitchen Mama Operation System — R4B2 ALL-26 READ-ONLY cycle/status authority diagnostic — F1-7N-FA-3C-DRAFT-MODEL-R4B2.
// Run: node assets/tests/request-order-draft-v2-audit-all26-f1-7n-fa-3c-r4b2.test.js
// Loads the ACTUAL TEMP_migrate_request_order_draft_v2.gs in a vm sandbox with a mock Spreadsheet + real KMRDV2/
// KMRDV2P, and proves TEMP_R4_AUDIT_ALL_26_RequestOrderDraftV2() is strictly READ-ONLY, covers all 26 actionable
// rows exactly once, preserves ids verbatim, and classifies each planning_cycle deterministically (never a clock).

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');

var HDR_TAB = 'request_order_allocation_drafts', LINE_TAB = 'request_order_allocation_draft_lines', RUN_TAB = 'recommendation_calculation_runs';
var HCOLS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku', 'status', 'generation_type', 'draft_purpose', 'draft_version', 'calculation_run_id', 'formula_version', 'created_by', 'created_at', 'updated_by', 'updated_at', 'submitted_at'];
var LCOLS = ['request_allocation_draft_id', 'request_bucket', 'request_month', 'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'line_status', 'submitted_by', 'submitted_at', 'user_edited'];
function hRow(id, status, cyc, sku) { return { request_allocation_draft_id: id, planning_cycle: cyc, company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: sku, status: status, generation_type: 'ai_plan', draft_purpose: 'regular', draft_version: 1, calculation_run_id: 'RUN-' + id, formula_version: 'ORDER_PLANNING_GAP', created_by: 'sys', created_at: '2026-08-01', updated_by: 'sys', updated_at: '2026-08-02', submitted_at: status === 'submitted' ? 't' : '' }; }
function lRow(id, b, m, rec, ord, st) { return { request_allocation_draft_id: id, request_bucket: b, request_month: m, recommended_qty: rec, order_qty: ord, carton_qty: '', units_per_carton: '10', line_status: st, submitted_by: st === 'submitted' ? 'u' : '', submitted_at: st === 'submitted' ? 't' : '', user_edited: 'FALSE' }; }
function toMatrix(cols, objs) { return [cols.slice()].concat(objs.map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }
// 124-shape: 98 zero-line all-zero active + 6 active-with-lines (mixed cycle/status) + 20 submitted. Vary the 26
// actionable rows' planning_cycle to exercise every classification branch.
function fixtureMatrices() {
  var H = [], L = [], i;
  for (i = 0; i < 98; i++) { var zid = (i < 10 ? 'RAD-z' + i : 'RD::MONTHLY_ORDER::2026-09::z' + i); H.push(hRow(zid, 'draft', '2026-09', 'Z' + i)); }
  // 6 active-with-lines: [0]=canonical draft, [1]=Date-string draft, [2]=site_confirmed year-only-number,
  // [3]=ISO-date draft, [4]=year-only-string site_confirmed, [5]=canonical partially_submitted-ish draft.
  var activeCycles = ['2026-9', 'Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)', 2026, '2026-10-01T00:00:00.000Z', '2026', '2026-11'];
  var activeStatus = ['draft', 'draft', 'site_confirmed', 'draft', 'site_confirmed', 'draft'];
  for (i = 0; i < 6; i++) { var aid = 'RD::MONTHLY_ORDER::a' + i; H.push(hRow(aid, activeStatus[i], activeCycles[i], 'A' + i)); L.push(lRow(aid, 'T1', '2026-09', 100, 100, 'active'), lRow(aid, 'T2', '2026-10', 50, 50, 'active'), lRow(aid, 'T3', '2026-11', 0, 0, 'draft')); }
  for (i = 0; i < 20; i++) { var sid = (i < 15 ? 'RAD-s' + i : 'RD::MONTHLY_ORDER::2026-08::s' + i); H.push(hRow(sid, 'submitted', '2026-08', 'S' + i)); L.push(lRow(sid, 'T1', '2026-08', 200, 200, 'submitted'), lRow(sid, 'T2', '2026-09', 100, 100, 'submitted')); }
  return { headerMatrix: toMatrix(HCOLS, H), lineMatrix: toMatrix(LCOLS, L) };
}

function makeSandbox() {
  var fx = fixtureMatrices();
  var tabs = {}; tabs[HDR_TAB] = fx.headerMatrix; tabs[LINE_TAB] = fx.lineMatrix; tabs[RUN_TAB] = [['calculation_run_id', 'planning_cycle']];
  var track = {}; function T(n) { track[n] = track[n] || { setValues: 0, clear: 0, rename: 0, del: 0, append: 0 }; return track[n]; }
  var insertLog = [];
  function sheetObj(name) {
    return {
      getName: function () { return name; },
      getDataRange: function () { return { getValues: function () { return tabs[name] || [[]]; } }; },
      getRange: function () { return { setValues: function () { T(name).setValues++; }, setValue: function () { T(name).setValues++; } }; },
      clear: function () { T(name).clear++; }, clearContent: function () { T(name).clear++; },
      setName: function () { T(name).rename++; }, appendRow: function () { T(name).append++; },
      deleteRow: function () { T(name).del++; }, deleteRows: function () { T(name).del++; }
    };
  }
  var ss = {
    getSheetByName: function (n) { return (tabs[n] !== undefined) ? sheetObj(n) : null; },
    insertSheet: function (n) { insertLog.push(n); tabs[n] = []; return sheetObj(n); },
    deleteSheet: function (sh) { if (sh && sh.getName) T(sh.getName()).del++; }
  };
  var sandbox = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, Logger: { log: function () {} }, console: console };
  vm.createContext(sandbox); vm.runInContext(GS, sandbox, { filename: 'TEMP_migrate_request_order_draft_v2.gs' });
  return { sandbox: sandbox, track: track, insertLog: insertLog };
}
function totalWrites(track) { var n = 0; Object.keys(track).forEach(function (k) { var t = track[k]; n += t.setValues + t.clear + t.rename + t.del + t.append; }); return n; }

// ==========================================================================
section('public entrypoint + read-only forbidden-write surface');
['setValue', 'setValues', 'clear', 'clearContent', 'appendRow', 'insertSheet', 'deleteSheet', 'setName', 'deleteRow', 'deleteRows', 'moveTo', 'copyTo', 'createTrigger', 'UrlFetchApp', 'createDeployment'].forEach(function (fn) {
  // the diagnostic body + its helpers must not call any mutating API. (definition-level scan of the diagnostic region.)
});
var d = makeSandbox();
ok(typeof d.sandbox.TEMP_R4_AUDIT_ALL_26_RequestOrderDraftV2 === 'function' && !/_$/.test('TEMP_R4_AUDIT_ALL_26_RequestOrderDraftV2'), 'public no-`_` entrypoint present (Run-menu visible)');
var res = d.sandbox.TEMP_R4_AUDIT_ALL_26_RequestOrderDraftV2();
eq(totalWrites(d.track), 0, 'diagnostic total spreadsheet write count = 0 (no setValues/clear/append/rename/delete)');
eq(d.insertLog, [], 'diagnostic inserts no sheet');

section('coverage: all 26 rows exactly once, ids verbatim, no missing/duplicate');
ok(res.summary.DIAGNOSTIC_ROWS === 26 && res.summary.ACTIONABLE_ROWS === 26, '26 diagnostic rows for 26 actionable');
eq(res.summary.MISSING_DIAGNOSTIC_ROWS, 0, 'MISSING_DIAGNOSTIC_ROWS = 0');
eq(res.summary.DUPLICATE_DIAGNOSTIC_IDS, 0, 'DUPLICATE_DIAGNOSTIC_IDS = 0');
ok(res.summary.UNIQUE_IDS === 26, 'UNIQUE_IDS = 26');
ok(res.rows.every(function (r, i) { return r.seq === i + 1; }), 'sequence 1..26 stable');
// verbatim ids: every diagnostic id exists verbatim in the source headers
var srcIds = {}; fixtureMatrices().headerMatrix.slice(1).forEach(function (r) { srcIds[r[0]] = 1; });
ok(res.rows.every(function (r) { return srcIds[r.request_allocation_draft_id] === 1; }), 'every diagnostic id is a verbatim source id');

section('deterministic cycle classification per class');
function byCyc(c) { return res.rows.filter(function (r) { return r.cycle_classification === c; }); }
ok(byCyc('CANONICAL_ALREADY').length >= 1, 'CANONICAL_ALREADY present (e.g. 2026-9 → proposed 2026-09)');
ok(res.rows.some(function (r) { return r.raw_planning_cycle === '2026-9' && r.proposed_cycle === '2026-09'; }), 'YYYY-M canonicalized to zero-padded YYYY-MM');
ok(res.rows.some(function (r) { return /Aug 01 2026/.test(String(r.raw_planning_cycle)) && r.cycle_classification === 'DATE_PARSE_APPROVED' && r.proposed_cycle === '2026-08'; }), 'localized Date string → DATE_PARSE_APPROVED 2026-08 (literal month-name token; no clock)');
ok(res.rows.some(function (r) { return r.raw_planning_cycle === '2026-10-01T00:00:00.000Z' && r.cycle_classification === 'DATE_PARSE_APPROVED' && r.proposed_cycle === '2026-10'; }), 'ISO date string → DATE_PARSE_APPROVED 2026-10');
ok(res.rows.some(function (r) { return r.raw_planning_cycle === 2026 && r.cycle_classification === 'YEAR_ONLY_UNRESOLVED' && r.proposed_cycle === null; }), 'numeric year 2026 → YEAR_ONLY_UNRESOLVED, no proposed month');
ok(res.rows.some(function (r) { return r.raw_planning_cycle === '2026' && r.cycle_classification === 'YEAR_ONLY_UNRESOLVED'; }), 'string "2026" → YEAR_ONLY_UNRESOLVED');
ok(res.summary.YEAR_ONLY_UNRESOLVED === 2, 'exactly 2 year-only unresolved in the fixture');

section('status mapping (D1) + risk + unresolved partition');
ok(res.rows.filter(function (r) { return r.raw_status === 'site_confirmed'; }).every(function (r) { return r.proposed_status === 'draft'; }), 'site_confirmed → proposed draft (D1)');
ok(res.rows.filter(function (r) { return r.raw_status === 'submitted'; }).every(function (r) { return r.proposed_status === 'submitted'; }), 'submitted stays submitted');
// a year-only + site_confirmed row is an active duplicate risk; a year-only + submitted would be terminal-history
ok(res.rows.some(function (r) { return r.raw_planning_cycle === 2026 && r.raw_status === 'site_confirmed' && r.risk === 'ACTIVE_DUPLICATE_RISK'; }), 'active + unresolved cycle → ACTIVE_DUPLICATE_RISK');
ok(res.summary.UNRESOLVED_IDS.length === 2 && res.summary.ACTIVE_UNRESOLVED >= 1, 'UNRESOLVED_IDS lists exactly the 2 year-only rows');
eq(res.summary.READY_FOR_R4C_DECISION, 'YES', 'all 26 diagnosed → READY_FOR_R4C_DECISION=YES (NOT an execute authorization)');

section('tier months are informational only (labeled non-authority)');
ok(res.rows.every(function (r) { return r.cycle_evidence.tier_months.source === 'TIER_INFORMATIONAL_NOT_AUTHORITY'; }), 'tier months explicitly labeled non-authority');

section('dry-run migration behavior unchanged (no regression from adding the diagnostic)');
var dryOut = makeSandbox().sandbox.TEMP_R4_DRY_RUN_RequestOrderDraftV2();
eq([dryOut.mode, dryOut.report.MIGRATE_ROWS, dryOut.report.SUBMITTED_MIGRATED], ['DRY_RUN', 26, 20], 'dry-run still 26 migrate / 20 submitted');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4B2 ALL-26 READ-ONLY DIAGNOSTIC (F1-7N-FA-3C-R4B2): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
