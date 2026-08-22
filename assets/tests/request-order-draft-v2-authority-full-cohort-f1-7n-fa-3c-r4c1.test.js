// Kitchen Mama Operation System — R4C1 complete 26-ID authority + full-cohort fidelity — F1-7N-FA-3C-DRAFT-MODEL-R4C1.
// Run: node assets/tests/request-order-draft-v2-authority-full-cohort-f1-7n-fa-3c-r4c1.test.js
// Proves the frozen TEMP_R4C_AUTHORIZED_CYCLE_BY_ID_ is the exact package-complete 26-id set, that the complete live
// 26-row actionable cohort migrates to the exact frozen distributions, and that the public Dry Run is package-complete
// (no manual source edit). Loads the ACTUAL TEMP .gs in a vm sandbox with mock Sheets + the real KMRDV2/KMRDV2P.

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var K = require('../js/core/supply-planning-request-draft-v2.js');
var P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS_PATH = path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs');
var GS = fs.readFileSync(GS_PATH, 'utf8').replace(/\r\n/g, '\n');
var RD_ID = 'RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R';
var ACTIVE_RAD = ['RAD-A92D17B1-8', 'RAD-3A0A8227-F', 'RAD-06053044-1', 'RAD-72ABD506-3', 'RAD-17DC0322-0'];
var SUBMITTED_RAD = ['RAD-206A5904-7', 'RAD-5A9B633B-E', 'RAD-8C957E9D-B', 'RAD-DD3DD40E-E', 'RAD-645D0B43-B', 'RAD-094C315F-D', 'RAD-C95E2E4C-A', 'RAD-EC60DBAC-5', 'RAD-01252D00-1', 'RAD-1D7C5E4F-C', 'RAD-1DC89A6D-6', 'RAD-8E10C337-4', 'RAD-BF3FA670-3', 'RAD-1441A13A-7', 'RAD-6F1B8DEE-1', 'RAD-CC8B7647-7', 'RAD-7DD15438-5', 'RAD-D1E1806E-D', 'RAD-79C5A694-B', 'RAD-358E2CAE-9'];

function makeSandbox(tabsExtra) {
  var tabs = tabsExtra || {};
  var track = {}; function T(n) { track[n] = track[n] || { setValues: 0, clear: 0, rename: 0, del: 0 }; return track[n]; }
  var insertLog = [];
  function sheetObj(name) {
    return { getName: function () { return name; }, getDataRange: function () { return { getValues: function () { return tabs[name] || [[]]; } }; },
      getRange: function () { return { setValues: function (m) { T(name).setValues++; tabs[name] = m; } }; },
      clear: function () { T(name).clear++; tabs[name] = []; }, setName: function () { T(name).rename++; } };
  }
  var ss = { getSheetByName: function (n) { return (tabs[n] !== undefined) ? sheetObj(n) : null; }, getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; },
    insertSheet: function (n) { insertLog.push(n); tabs[n] = []; return sheetObj(n); }, deleteSheet: function () {} };
  var Utilities = { formatDate: function (d, tz, f) { var off = (tz === 'Asia/Taipei') ? 8 : 0; var t = new Date(d.getTime() + off * 3600000); var y = t.getUTCFullYear(), m = t.getUTCMonth() + 1; return y + '-' + (m < 10 ? '0' + m : '' + m); } };
  var sandbox = { KMRDV2: K, KMRDV2P: P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, Utilities: Utilities, Logger: { log: function () {} }, console: console };
  vm.createContext(sandbox); vm.runInContext(GS, sandbox, { filename: 'TEMP.gs' });
  return { sandbox: sandbox, track: track, insertLog: insertLog, tabs: tabs };
}
function totalWrites(track) { var n = 0; Object.keys(track).forEach(function (k) { var t = track[k]; n += t.setValues + t.clear + t.rename + t.del; }); return n; }

// ==========================================================================
section('authority map — exactly 26 own keys, all 2026-08, exact membership');
var AUTH = makeSandbox().sandbox.TEMP_R4C_AUTHORIZED_CYCLE_BY_ID_;
var keys = Object.keys(AUTH);
eq(keys.length, 26, 'authority has exactly 26 own keys');
ok(keys.every(function (k) { return AUTH[k] === '2026-08'; }), 'every authority value = 2026-08');
ok(SUBMITTED_RAD.every(function (id) { return AUTH[id] === '2026-08'; }) && SUBMITTED_RAD.length === 20, 'all 20 submitted RAD ids present, each once');
ok(ACTIVE_RAD.every(function (id) { return AUTH[id] === '2026-08'; }), 'all 5 active RAD ids present');
ok(Object.prototype.hasOwnProperty.call(AUTH, RD_ID) && AUTH[RD_ID] === '2026-08', 'sole RD id present, byte-verbatim');
// no unknown id: the key set is exactly the 26 expected
var expectedSet = {}; ACTIVE_RAD.concat(SUBMITTED_RAD).forEach(function (id) { expectedSet[id] = 1; }); expectedSet[RD_ID] = 1;
ok(keys.every(function (k) { return expectedSet[k] === 1; }) && keys.length === Object.keys(expectedSet).length, 'no unknown id; key set == the exact 26');
// duplicate check: the 26 ids are unique (object keys inherently unique; also verify the file lists 26 distinct)
ok(ACTIVE_RAD.concat(SUBMITTED_RAD).concat([RD_ID]).filter(function (v, i, a) { return a.indexOf(v) === i; }).length === 26, 'the 26 expected ids are distinct');

section('no USER manual-ID placeholder remains in the release helper');
ok(!/USER:.*paste/i.test(GS) && GS.indexOf('<<<') === -1, 'no "USER: paste" placeholder and no <<< marker in the TEMP helper');
ok(/Package-complete/.test(GS), 'authority documented as package-complete');

// ==========================================================================
section('full live 26-row actionable cohort → exact canonical distributions');
// Build the complete cohort: 98 non-actionable (zero-line) + 6 active (frozen identities) + 20 submitted.
var HCOLS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku', 'status', 'generation_type', 'draft_purpose', 'draft_version', 'calculation_run_id', 'formula_version', 'created_by', 'created_at', 'updated_by', 'updated_at'];
var LCOLS = ['request_allocation_draft_id', 'request_bucket', 'request_month', 'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'line_status', 'submitted_by', 'submitted_at', 'user_edited'];
function line(id, b, m, rec, ord, st) { return { request_allocation_draft_id: id, request_bucket: b, request_month: m, recommended_qty: rec, order_qty: ord, carton_qty: '', units_per_carton: '10', line_status: st, submitted_by: st === 'submitted' ? 'u' : '', submitted_at: st === 'submitted' ? 't' : '', user_edited: 'FALSE' }; }
// the 6 active source rows = the frozen identities; 5 site_confirmed + RD draft; RD purpose 'regular', rest blank
var ACTIVE6 = [
  { id: ACTIVE_RAD[0], company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'CO1200-O', status: 'site_confirmed', purpose: '' },
  { id: ACTIVE_RAD[1], company: 'ResTW', country: 'CA', mkt: 'Amazon', sku: 'CO1200-O', status: 'site_confirmed', purpose: '' },
  { id: ACTIVE_RAD[2], company: 'KM', country: 'US', mkt: 'KM Walmart', sku: 'CO1200-O', status: 'site_confirmed', purpose: '' },
  { id: ACTIVE_RAD[3], company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'CO5600-R', status: 'site_confirmed', purpose: '' },
  { id: ACTIVE_RAD[4], company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'CO5600-W', status: 'site_confirmed', purpose: '' },
  { id: RD_ID, company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'SP5120-R', status: 'draft', purpose: 'regular' }
];
// 20 submitted: 13 Amazon + 4 KM Walmart + 3 Shopify (→ total Walmart 5, Amazon 18, Shopify 3); first 7 have a T3 line
function submittedMkt(i) { return i < 13 ? 'Amazon' : (i < 17 ? 'KM Walmart' : 'Shopify'); }
function buildCohort() {
  var H = [], lbd = {}, i;
  for (i = 0; i < 98; i++) { var zid = 'RD::MONTHLY_ORDER::2026-09::z' + i; H.push({ request_allocation_draft_id: zid, planning_cycle: '2026-09', company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'Z' + i, status: 'draft', draft_purpose: 'regular', draft_version: 1, calculation_run_id: 'RUN-' + zid }); }
  ACTIVE6.forEach(function (a) {
    H.push({ request_allocation_draft_id: a.id, planning_cycle: '2026-07', company: a.company, country: a.country, marketplace: a.mkt, sku: a.sku, status: a.status, draft_purpose: a.purpose, draft_version: 1, calculation_run_id: 'RUN-' + a.id });
    lbd[a.id] = [line(a.id, 'T1', '2026-08', 100, 100, 'active'), line(a.id, 'T2', '2026-09', 50, 50, 'active'), line(a.id, 'T3', '2026-10', 0, 0, 'draft')];
  });
  SUBMITTED_RAD.forEach(function (sid, k) {
    H.push({ request_allocation_draft_id: sid, planning_cycle: '2026-07', company: 'ResUS', country: 'US', marketplace: submittedMkt(k), sku: 'SUB' + k, status: 'submitted', draft_purpose: '', draft_version: 1, calculation_run_id: 'RUN-' + sid });
    lbd[sid] = (k < 7) ? [line(sid, 'T1', '2026-08', 200, 200, 'submitted'), line(sid, 'T2', '2026-09', 100, 100, 'submitted'), line(sid, 'T3', '2026-10', 40, 40, 'submitted')]
      : [line(sid, 'T1', '2026-08', 200, 200, 'submitted'), line(sid, 'T2', '2026-09', 100, 100, 'submitted')];
  });
  return { H: H, lbd: lbd };
}
var EXPECT = { TOTAL_HEADERS: 124, ACTIONABLE: 26, ALL_ZERO: 98, NEEDS_MANUAL_REVIEW: 0, BLOCKED_CONFLICT: 0, ORPHAN_LINES: 0, DUPLICATE_T1: 0, DUPLICATE_T2: 0, DUPLICATE_T3: 0, T4_PRESENT: 0, SUBMITTED: 20 };
var co = buildCohort();
var srcLineCount = Object.keys(co.lbd).reduce(function (a, id) { return a + co.lbd[id].length; }, 0);
eq(srcLineCount, 65, 'complete cohort source lines = 65');
var plan = P.planMigration(co.H, co.lbd, { expect: EXPECT, authorizedCycleById: AUTH });
ok(plan.ok === true && !plan.halt, 'full cohort migrates ok under the complete 26-id authority');

section('exact distributions');
var d = plan.report.NORMALIZED_DISTRIBUTIONS;
eq(d.cycle, { '2026-08': 26 }, 'cycle distribution {2026-08:26}');
ok(d.status['submitted'] === 20 && d.status['draft'] === 6 && Object.keys(d.status).length === 2 && !d.status['site_confirmed'], 'status {submitted:20, draft:6}, site_confirmed:0');
ok(d.purpose['regular'] === 26 && Object.keys(d.purpose).length === 1, 'purpose {regular:26} (blank:0, monthly:0)');
ok(d.marketplace['Amazon'] === 18 && d.marketplace['Shopify'] === 3 && d.marketplace['Walmart'] === 5 && !d.marketplace['KM Walmart'] && Object.keys(d.marketplace).length === 3, 'marketplace {Amazon:18, Shopify:3, Walmart:5}, KM Walmart:0');

section('exact normalization counts + report');
var n = plan.report.NORMALIZATION_COUNTS;
eq([n.CYCLE_NORMALIZED, n.STATUS_NORMALIZED, n.PURPOSE_NORMALIZED, n.MARKETPLACE_NORMALIZED], [26, 5, 25, 5], 'normalization: cycle 26 / site_confirmed→draft 5 / blank→regular 25 / KM Walmart→Walmart 5');
eq([plan.report.PRESERVED_IDS, plan.report.CONVERTED_IDS], [26, 0], 'PRESERVED 26 / CONVERTED 0');
eq([plan.report.SUBMITTED_SOURCE, plan.report.SUBMITTED_MIGRATED], [20, 20], 'submitted 20 / migrated 20');
eq([plan.report.TARGET_HEADERS, plan.report.TARGET_ROWS, plan.report.MIGRATE_ROWS, plan.report.NON_ACTIONABLE_DROPPED_FROM_V2], [53, 26, 26, 98], 'target 53 headers / 26 rows / 26 migrate / 98 dropped');
// ids byte-verbatim
ok(plan.stagingRows.every(function (r) { return AUTH[r.request_allocation_draft_id] === '2026-08'; }), 'every staging id is an authorized id (verbatim)');

section('authority mutation → MIGRATION_AUTHORIZED_ID_SET_MISMATCH (fail closed)');
function authMinus(id) { var a = {}; Object.keys(AUTH).forEach(function (k) { if (k !== id) a[k] = AUTH[k]; }); return a; }
function authPlus(id) { var a = {}; Object.keys(AUTH).forEach(function (k) { a[k] = AUTH[k]; }); a[id] = '2026-08'; return a; }
eq(P.planMigration(co.H, co.lbd, { expect: EXPECT, authorizedCycleById: authMinus('RAD-206A5904-7') }).halt, 'MIGRATION_AUTHORIZED_ID_SET_MISMATCH', 'deleting one authority entry → HALT (that actionable id is now unauthorized)');
eq(P.planMigration(co.H, co.lbd, { expect: EXPECT, authorizedCycleById: authPlus('RAD-EXTRA-9') }).halt, 'MIGRATION_AUTHORIZED_ID_SET_MISMATCH', 'adding an extra authority id → HALT (authorized id not actionable in source)');
// prefix-equivalent id (drop the trailing "-7") is a DIFFERENT id → both missing + extra → HALT
var prefixAuth = authMinus('RAD-206A5904-7'); prefixAuth['RAD-206A5904'] = '2026-08';
eq(P.planMigration(co.H, co.lbd, { expect: EXPECT, authorizedCycleById: prefixAuth }).halt, 'MIGRATION_AUTHORIZED_ID_SET_MISMATCH', 'a prefix-equivalent id does NOT satisfy the exact key (no prefix matching)');

section('changing one cycle to 2026-07 fails PLANNING_CYCLE_AUTHORITY_OK (format-valid but wrong)');
var IDENT = makeSandbox().sandbox.TEMP_r4cCanonicalActiveIdentities_();
var vgood = P.validateStaging(plan.stagingHeaders, plan.stagingRows, co.H, co.lbd, { expectRows: 26, authorizedCycleById: AUTH, canonicalActiveIdentities: IDENT, oldLineWriteCount: 0 });
eq(vgood.READY_FOR_SWAP, 'YES', 'canonical staging → READY_FOR_SWAP=YES');
var bad = plan.stagingRows.map(function (r) { return Object.assign({}, r); }); bad[0].planning_cycle = '2026-07';
var vbad = P.validateStaging(plan.stagingHeaders, bad, co.H, co.lbd, { expectRows: 26, authorizedCycleById: AUTH, canonicalActiveIdentities: IDENT });
ok(vbad.PLANNING_CYCLE_FORMAT_OK === true && vbad.PLANNING_CYCLE_AUTHORITY_OK === false && vbad.READY_FOR_SWAP === 'NO', '2026-07 is format-valid but fails authority → READY_FOR_SWAP=NO');

// ==========================================================================
section('public Dry Run is PACKAGE-COMPLETE (frozen authority, no manual edit): 26 rows, all gates, zero writes');
function toMatrix(cols, objs) { return [cols.slice()].concat(objs.map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }
var lineRows = []; Object.keys(co.lbd).forEach(function (id) { co.lbd[id].forEach(function (l) { lineRows.push(l); }); });
var sheet = { 'request_order_allocation_drafts': toMatrix(HCOLS, co.H), 'request_order_allocation_draft_lines': toMatrix(LCOLS, lineRows) };
var s = makeSandbox(sheet);
var dry = s.sandbox.TEMP_R4_DRY_RUN_RequestOrderDraftV2();   // no-arg PUBLIC entrypoint, frozen authority
ok(dry && dry.mode === 'DRY_RUN' && !dry.halt, 'public no-arg Dry Run succeeds with NO manual source edit');
eq([dry.SOURCE_HEADERS, dry.SOURCE_LINES], [124, 65], 'dry-run reports 124 source headers / 65 source lines');
eq([dry.report.MIGRATE_ROWS, dry.report.NON_ACTIONABLE_DROPPED_FROM_V2, dry.report.SUBMITTED_MIGRATED, dry.report.PRESERVED_IDS, dry.report.CONVERTED_IDS], [26, 98, 20, 26, 0], 'dry-run report 26/98/20/26/0');
eq(dry.normalized_distributions.cycle, { '2026-08': 26 }, 'dry-run cycle distribution {2026-08:26}');
ok(dry.normalized_distributions.marketplace['Amazon'] === 18 && dry.normalized_distributions.marketplace['Shopify'] === 3 && dry.normalized_distributions.marketplace['Walmart'] === 5, 'dry-run marketplace {Amazon:18, Shopify:3, Walmart:5}');
eq(dry.gate_precheck.READY_FOR_SWAP, 'YES', 'dry-run 14-gate precheck READY_FOR_SWAP=YES');
eq(totalWrites(s.track), 0, 'Dry Run total write count = 0');
eq(s.insertLog, [], 'Dry Run inserts no sheet');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4C1 26-ID AUTHORITY + FULL-COHORT (F1-7N-FA-3C-R4C1): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
