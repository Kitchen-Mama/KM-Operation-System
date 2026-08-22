// Kitchen Mama Operation System — R4A paste-ready migration ENTRYPOINT execution test (R4C-contract) — F1-7N-FA-3C-DRAFT-MODEL-R4A.
// Run: node assets/tests/request-order-draft-v2-paste-ready-entrypoint-f1-7n-fa-3c-r4a.test.js
// Loads the ACTUAL TEMP_migrate_request_order_draft_v2.gs in a vm sandbox with a mock SpreadsheetApp + Utilities +
// the real KMRDV2/KMRDV2P. Proves the paste-ready contract under the R4C authority: name consistency + no-argument
// public entrypoints; the mechanism (core, with a COMPLETE injected 26-id authority + a canonical cohort) writes ONLY
// the staging tab (26 rows / 53 cols), normalizes cycle→2026-08 + KM Walmart→Walmart, dry-run/validate write 0, and
// READY_FOR_SWAP=YES; AND the public no-arg wrappers FAIL CLOSED on the live-incomplete frozen 6-id authority.

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
var RD6_ID = 'RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R';
// The six frozen R4B5 canonical active identities (source marketplace → migrated marketplace).
var ACTIVE6 = [
  { id: 'RAD-A92D17B1-8', company: 'ResUS', country: 'US', src_mkt: 'Amazon', sku: 'CO1200-O' },
  { id: 'RAD-3A0A8227-F', company: 'ResTW', country: 'CA', src_mkt: 'Amazon', sku: 'CO1200-O' },
  { id: 'RAD-06053044-1', company: 'KM', country: 'US', src_mkt: 'KM Walmart', sku: 'CO1200-O' },
  { id: 'RAD-72ABD506-3', company: 'ResUS', country: 'US', src_mkt: 'Amazon', sku: 'CO5600-R' },
  { id: 'RAD-17DC0322-0', company: 'ResUS', country: 'US', src_mkt: 'Amazon', sku: 'CO5600-W' },
  { id: RD6_ID, company: 'ResUS', country: 'US', src_mkt: 'Amazon', sku: 'SP5120-R' }
];

// ---- static naming-consistency check: every TEMP_ call resolves to a TEMP_ definition ------------------------
section('static: definitions/calls consistent, no undefined helper, public entrypoints present');
var defs = {}; (GS.match(/function\s+(TEMP_[A-Za-z0-9_]+)\s*\(/g) || []).forEach(function (m) { defs[m.replace(/function\s+/, '').replace(/\s*\($/, '')] = 1; });
var calls = {}; (GS.match(/\bTEMP_[A-Za-z0-9_]+\s*\(/g) || []).forEach(function (m) { calls[m.replace(/\s*\($/, '')] = 1; });
var callNames = Object.keys(calls).filter(function (n) { return !/^TEMP_R4_/.test(n); });
var unresolved = callNames.filter(function (n) { return !defs[n]; });
eq(unresolved, [], 'every called TEMP_ helper has a matching definition (no ReferenceError-inducing mismatch)');
['TEMP_r4Bundle_', 'TEMP_readObjects_', 'TEMP_buildSource_', 'TEMP_migrateRequestOrderDraftV2_', 'TEMP_validateRequestOrderDraftV2Staging_', 'TEMP_r4cCanonicalActiveIdentities_'].forEach(function (n) { ok(defs[n] === 1, 'private helper defined: ' + n); });
['TEMP_R4_DRY_RUN_RequestOrderDraftV2', 'TEMP_R4_EXECUTE_RequestOrderDraftV2', 'TEMP_R4_VALIDATE_RequestOrderDraftV2Staging'].forEach(function (n) { ok(defs[n] === 1 && !/_$/.test(n), 'public no-`_` entrypoint defined (Run-menu visible): ' + n); });

// ---- 124-shape canonical cohort fixture ----------------------------------------------------------------------
var HCOLS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku', 'status', 'generation_type', 'draft_purpose', 'draft_version', 'calculation_run_id', 'formula_version', 'created_by', 'created_at', 'updated_by', 'updated_at'];
var LCOLS = ['request_allocation_draft_id', 'request_bucket', 'request_month', 'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'line_status', 'submitted_by', 'submitted_at', 'user_edited'];
function hRow(o) { return { request_allocation_draft_id: o.id, planning_cycle: o.cyc, company: o.company, country: o.country, marketplace: o.mkt, sku: o.sku, status: o.status, generation_type: 'ai_plan', draft_purpose: (o.purpose === undefined ? 'regular' : o.purpose), draft_version: 1, calculation_run_id: 'RUN-' + o.id, formula_version: 'ORDER_PLANNING_GAP', created_by: 'sys', created_at: 'C', updated_by: 'sys', updated_at: 'U' }; }
function lRow(id, b, m, rec, ord, st) { return { request_allocation_draft_id: id, request_bucket: b, request_month: m, recommended_qty: rec, order_qty: ord, carton_qty: '', units_per_carton: '10', line_status: st, submitted_by: st === 'submitted' ? 'u' : '', submitted_at: st === 'submitted' ? 't' : '', user_edited: 'FALSE' }; }
function toMatrix(cols, objs) { return [cols.slice()].concat(objs.map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }
var SUBMITTED_IDS = []; for (var si = 0; si < 20; si++) SUBMITTED_IDS.push('RAD-sub-' + si);
function fixtureMatrices() {
  var H = [], L = [], i;
  // 98 non-actionable (zero-line) — dropped before normalization; their fields are irrelevant to the cohort
  for (i = 0; i < 98; i++) { var zid = (i < 10 ? 'RAD-z' + i : 'RD::MONTHLY_ORDER::2026-09::z' + i); H.push(hRow({ id: zid, cyc: '2026-09', company: 'KM', country: 'US', mkt: 'AMAZON_US', sku: 'Z' + i, status: 'draft' })); }
  // 6 active actionable = the frozen canonical identities (legacy cycle 2026-07 → normalized 2026-08; KM Walmart legacy)
  ACTIVE6.forEach(function (a) { H.push(hRow({ id: a.id, cyc: '2026-07', company: a.company, country: a.country, mkt: a.src_mkt, sku: a.sku, status: 'draft' })); L.push(lRow(a.id, 'T1', '2026-08', 100, 100, 'active'), lRow(a.id, 'T2', '2026-09', 50, 50, 'active'), lRow(a.id, 'T3', '2026-10', 0, 0, 'draft')); });
  // 20 submitted actionable (legacy cycle 2026-07 → 2026-08; canonical Amazon)
  SUBMITTED_IDS.forEach(function (sid, k) { H.push(hRow({ id: sid, cyc: '2026-07', company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'SUB' + k, status: 'submitted' })); L.push(lRow(sid, 'T1', '2026-08', 200, 200, 'submitted'), lRow(sid, 'T2', '2026-09', 100, 100, 'submitted')); });
  return { headerMatrix: toMatrix(HCOLS, H), lineMatrix: toMatrix(LCOLS, L) };
}
// COMPLETE authority for this cohort (all 26 actionable ids → 2026-08). Injected into the CORE for the mechanism proof.
var COMPLETE_AUTH = {}; ACTIVE6.forEach(function (a) { COMPLETE_AUTH[a.id] = '2026-08'; }); SUBMITTED_IDS.forEach(function (id) { COMPLETE_AUTH[id] = '2026-08'; });

var HDR_TAB = 'request_order_allocation_drafts', LINE_TAB = 'request_order_allocation_draft_lines', V2_TAB = 'request_order_allocation_drafts_v2';
function makeSandbox(preStaging) {
  var fx = fixtureMatrices();
  var tabs = {}; tabs[HDR_TAB] = fx.headerMatrix; tabs[LINE_TAB] = fx.lineMatrix;
  if (preStaging !== undefined) tabs[V2_TAB] = preStaging;
  var track = {}; function T(n) { track[n] = track[n] || { setValues: 0, clear: 0, rename: 0, del: 0, fmt: 0 }; return track[n]; }
  var insertLog = [], flushCount = { n: 0 };
  function sheetObj(name) {
    return {
      getName: function () { return name; },
      getDataRange: function () { return { getValues: function () { return tabs[name] || [[]]; } }; },
      getRange: function () { return { setValues: function (m) { T(name).setValues++; tabs[name] = m; }, setNumberFormat: function () { T(name).fmt++; } }; },
      clear: function () { T(name).clear++; tabs[name] = []; },
      setName: function () { T(name).rename++; }
    };
  }
  var ss = {
    getSheetByName: function (n) { return (tabs[n] !== undefined) ? sheetObj(n) : null; },
    getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; },
    insertSheet: function (n) { insertLog.push(n); tabs[n] = []; return sheetObj(n); },
    deleteSheet: function (sh) { if (sh && sh.getName) T(sh.getName()).del++; }
  };
  var Utilities = { formatDate: function (d, tz, f) { var off = (tz === 'Asia/Taipei') ? 8 : 0; var t = new Date(d.getTime() + off * 3600000); var y = t.getUTCFullYear(), m = t.getUTCMonth() + 1; return y + '-' + (m < 10 ? '0' + m : '' + m); } };
  var logs = [];
  var sandbox = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, flush: function () { flushCount.n++; } }, Utilities: Utilities,
    Logger: { log: function (m) { logs.push(String(m)); } }, console: console };
  vm.createContext(sandbox);
  vm.runInContext(GS, sandbox, { filename: 'TEMP_migrate_request_order_draft_v2.gs' });
  return { sandbox: sandbox, track: track, insertLog: insertLog, tabs: tabs, T: T, logs: logs, flushCount: flushCount };
}
function writeCount(track) { var n = 0; Object.keys(track).forEach(function (k) { n += track[k].setValues + track[k].clear + track[k].rename + track[k].del; }); return n; }
function legacyMutations(track) { var m = 0; [HDR_TAB, LINE_TAB].forEach(function (t) { if (track[t]) m += track[t].setValues + track[t].clear + track[t].rename + track[t].del; }); return m; }

// ==========================================================================
section('public no-arg wrappers FAIL CLOSED under the live-incomplete frozen authority (6 ids ≠ 26 cohort)');
var pf0 = makeSandbox();
var dryFrozen = pf0.sandbox.TEMP_R4_DRY_RUN_RequestOrderDraftV2();
eq(dryFrozen.halt, 'MIGRATION_AUTHORIZED_ID_SET_MISMATCH', 'DRY_RUN via public wrapper halts on the incomplete frozen authority');
ok(dryFrozen.extra_actionable_ids && dryFrozen.extra_actionable_ids.length === 20, 'reports the 20 unauthorized (submitted) actionable ids');
eq(writeCount(pf0.track), 0, 'fail-closed DRY_RUN writes nothing');
var pf1 = makeSandbox();
var exFrozen = pf1.sandbox.TEMP_R4_EXECUTE_RequestOrderDraftV2();
eq(exFrozen.halt, 'MIGRATION_AUTHORIZED_ID_SET_MISMATCH', 'EXECUTE via public wrapper also halts fail-closed');
eq(writeCount(pf1.track), 0, 'fail-closed EXECUTE writes nothing (no staging insert)');
eq(pf1.insertLog, [], 'fail-closed EXECUTE inserts no sheet');

section('mechanism (core + COMPLETE injected authority): DRY RUN reports normalization + ZERO writes');
var d = makeSandbox();
var dryOut = d.sandbox.TEMP_migrateRequestOrderDraftV2_({ execute: false, authorizedCycleById: COMPLETE_AUTH });
ok(dryOut && dryOut.mode === 'DRY_RUN', 'core dry-run returns DRY_RUN');
eq([dryOut.report.MIGRATE_ROWS, dryOut.report.NON_ACTIONABLE_DROPPED_FROM_V2, dryOut.report.SUBMITTED_MIGRATED], [26, 98, 20], 'dry-run 26 migrate / 98 dropped / 20 submitted');
eq(dryOut.normalized_distributions.cycle, { '2026-08': 26 }, 'all 26 normalized cycles = 2026-08');
eq(dryOut.normalized_distributions.marketplace, { 'Amazon': 25, 'Walmart': 1 }, 'marketplace distribution: 25 Amazon + 1 Walmart (KM Walmart→Walmart)');
ok(dryOut.report.NORMALIZATION_COUNTS.CYCLE_NORMALIZED === 26 && dryOut.report.NORMALIZATION_COUNTS.MARKETPLACE_NORMALIZED === 1, '26 cycle + 1 marketplace normalizations counted');
eq(dryOut.gate_precheck.READY_FOR_SWAP, 'YES', 'dry-run gate precheck READY_FOR_SWAP=YES');
eq(writeCount(d.track), 0, 'DRY RUN total write count = 0');
eq(d.insertLog, [], 'DRY RUN inserts no sheet');

section('mechanism EXECUTE: writes ONLY the staging tab (26 rows / 53 cols); legacy untouched');
var e = makeSandbox();
var exOut = e.sandbox.TEMP_migrateRequestOrderDraftV2_({ execute: true, authorizedCycleById: COMPLETE_AUTH });
ok(exOut && exOut.mode === 'EXECUTE' && exOut.written_rows === 26 && exOut.written_headers === 53, 'EXECUTE wrote 26 rows / 53 headers to staging');
eq(e.insertLog, [V2_TAB], 'EXECUTE inserts ONLY request_order_allocation_drafts_v2');
ok(e.track[V2_TAB] && e.track[V2_TAB].setValues === 1, 'EXECUTE setValues once on the staging tab');
eq(legacyMutations(e.track), 0, 'EXECUTE performs ZERO mutation on the two legacy tabs');
ok(e.tabs[V2_TAB].length === 27 && e.tabs[V2_TAB][0].length === 53, 'staging matrix = 1 header row (53 cols) + 26 data rows');
// R4C2 write-boundary: text-format targets ONLY staging (2 columns), legacy zero; flush called; roundtrip verified
eq(e.track[V2_TAB].fmt, 2, 'setNumberFormat called exactly twice on staging (planning_cycle + request_allocation_draft_id)');
ok(!e.track[HDR_TAB] || e.track[HDR_TAB].fmt === 0, 'legacy header tab receives ZERO formatting');
ok(!e.track[LINE_TAB] || e.track[LINE_TAB].fmt === 0, 'legacy line tab receives ZERO formatting');
ok(e.flushCount.n >= 1, 'SpreadsheetApp.flush() called before roundtrip read');
eq(exOut.POST_WRITE_READY_FOR_SWAP, 'YES', 'post-write roundtrip → READY_FOR_SWAP=YES');
ok(exOut.POST_WRITE_CYCLE_TYPES && exOut.POST_WRITE_CYCLE_TYPES.string === 26 && !exOut.POST_WRITE_CYCLE_TYPES.Date, 'all 26 read-back cycle types = string (no Date)');

section('VALIDATE (core + COMPLETE authority): all 14 gates → READY_FOR_SWAP=YES; read-only');
var executedStaging = e.tabs[V2_TAB];
var vOk = makeSandbox(executedStaging);
var vRes = vOk.sandbox.TEMP_validateRequestOrderDraftV2Staging_({ authorizedCycleById: COMPLETE_AUTH });
eq(vRes.READY_FOR_SWAP, 'YES', 'valid canonical staging → READY_FOR_SWAP=YES');
['SCHEMA_OK', 'ROW_COUNT_OK', 'PLANNING_CYCLE_FORMAT_OK', 'PLANNING_CYCLE_AUTHORITY_OK', 'HEADER_STATUS_OK', 'DRAFT_PURPOSE_OK', 'CANONICAL_MARKETPLACE_OK', 'ID_PRESERVATION_OK', 'ID_SET_OK', 'SUBMITTED_SET_OK', 'TIER_VALUES_OK', 'NATURAL_SCOPE_OK', 'ACTIVE_SCOPE_REUSABLE', 'OLD_LINE_TABLE_UNTOUCHED'].forEach(function (g) { ok(vRes[g] === true, 'gate ' + g + ' = true'); });
eq(writeCount(vOk.track), 0, 'VALIDATE total write count = 0 (read-only)');
var vAbsent = makeSandbox();
eq(vAbsent.sandbox.TEMP_validateRequestOrderDraftV2Staging_({ authorizedCycleById: COMPLETE_AUTH }).READY_FOR_SWAP, 'NO', 'absent staging → READY_FOR_SWAP=NO');

section('EXECUTE fail-closed on a non-empty existing staging tab');
var preFilled = [KMRDV2.V2_HEADERS.slice()].concat([KMRDV2.V2_HEADERS.map(function () { return 'x'; })]);
var pf = makeSandbox(preFilled);
var pfOut = pf.sandbox.TEMP_migrateRequestOrderDraftV2_({ execute: true, authorizedCycleById: COMPLETE_AUTH });
ok(pfOut && pfOut.halt === 'STAGING_TAB_NOT_EMPTY', 'existing non-empty staging → HALT STAGING_TAB_NOT_EMPTY');
eq(legacyMutations(pf.track), 0, 'aborted EXECUTE still never touches legacy tabs');

section('drift guard reachable through the public entrypoint (mismatched live shape → HALT before authority)');
(function () {
  var fx = fixtureMatrices(); var short = { headerMatrix: fx.headerMatrix.slice(0, 100), lineMatrix: fx.lineMatrix };
  var tabs = {}; tabs[HDR_TAB] = short.headerMatrix; tabs[LINE_TAB] = short.lineMatrix;
  var ss = { getSheetByName: function (n) { return tabs[n] !== undefined ? { getDataRange: function () { return { getValues: function () { return tabs[n]; } }; } } : null; }, getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; }, insertSheet: function () { throw new Error('should not insert on drift'); } };
  var sb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, Utilities: { formatDate: function () { return '2026-08'; } }, Logger: { log: function () {} } };
  vm.createContext(sb); vm.runInContext(GS, sb, {});
  var out = sb.TEMP_R4_DRY_RUN_RequestOrderDraftV2();
  ok(out && out.halt === 'R4_LIVE_DATA_DRIFT_FROM_R3', 'drifted live shape → HALT R4_LIVE_DATA_DRIFT_FROM_R3 (no write attempted)');
})();

section('flag invariant (read-only)');
var cfg = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', '00_config.gs'), 'utf8');
// R6E1: the flat V2 cutover is COMPLETE — the flag is now permanently true (authority = 00_config.gs). The R4 paste-
// ready migration tool still NEVER flips it (it is set by config, not by the tool). Assert the completed posture.
ok(/REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=\s*true/.test(cfg), 'cutover flag is true (R6E1 completed the production cutover)');
var tempSrc = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8');
ok(!/REQUEST_ORDER_DRAFT_V2_FLAT_CUTOVER_\s*=/.test(tempSrc), 'the R4 migration tool never assigns/flips the cutover flag');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4A PASTE-READY ENTRYPOINT (F1-7N-FA-3C-R4A, R4C-contract): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
