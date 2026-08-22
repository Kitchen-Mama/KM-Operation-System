// Kitchen Mama Operation System — R4C2 staging write TYPE preservation + post-write roundtrip — F1-7N-FA-3C-DRAFT-MODEL-R4C2.
// Run: node assets/tests/request-order-draft-v2-staging-write-roundtrip-f1-7n-fa-3c-r4c2.test.js
// Loads the ACTUAL TEMP_migrate_request_order_draft_v2.gs in a vm sandbox with a Google-Sheets-COERCION-MODELING mock:
// a General-format cell coerces "2026-08" into a Date; a plain-text ('@') cell preserves the primitive string. Proves
// the root cause, the setNumberFormat-before-setValues fix, and the flush→getValues roundtrip HALT/READY behavior.

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var GS = fs.readFileSync(path.join(__dirname, '..', 'specs', 'active', 'apps-script', 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var RD_ID = 'RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R';
var ACTIVE_RAD = ['RAD-A92D17B1-8', 'RAD-3A0A8227-F', 'RAD-06053044-1', 'RAD-72ABD506-3', 'RAD-17DC0322-0'];
var SUBMITTED_RAD = ['RAD-206A5904-7', 'RAD-5A9B633B-E', 'RAD-8C957E9D-B', 'RAD-DD3DD40E-E', 'RAD-645D0B43-B', 'RAD-094C315F-D', 'RAD-C95E2E4C-A', 'RAD-EC60DBAC-5', 'RAD-01252D00-1', 'RAD-1D7C5E4F-C', 'RAD-1DC89A6D-6', 'RAD-8E10C337-4', 'RAD-BF3FA670-3', 'RAD-1441A13A-7', 'RAD-6F1B8DEE-1', 'RAD-CC8B7647-7', 'RAD-7DD15438-5', 'RAD-D1E1806E-D', 'RAD-79C5A694-B', 'RAD-358E2CAE-9'];

// ---- Sheets-coercion-modeling mock -----------------------------------------------------------------------------
// General format: a bare YYYY-MM string is coerced into a Date object (what Google Sheets actually does). Plain-text
// ('@'): the string is stored verbatim. Coercion applies to EVERY sheet (legacy source + staging) exactly as real
// Sheets would — so a legacy line month and its migrated staging month coerce identically (TIER_VALUES_OK stays true),
// while planning_cycle only stays a string when text-formatted. `ignoreFormat:true` models a run where the text format
// never took (regression). `seed` populates initial (General-format) content WITHOUT counting as a tracked write.
function coerce_(v, fmt) {
  if (fmt === '@') return (v === null || v === undefined) ? '' : v;               // text: keep exact primitive
  if (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return new Date(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, 1);   // General → Date coercion
  return v;
}
function makeSheet(name, track, opts) {
  opts = opts || {};
  var cells = {}, maxR = 0, maxC = 0;
  function cell(r, c) { var k = r + ',' + c; if (!cells[k]) cells[k] = { v: '', fmt: 'GENERAL' }; return cells[k]; }
  function put(r, c, v) { var cc = cell(r, c); cc.v = coerce_(v, cc.fmt); maxR = Math.max(maxR, r); maxC = Math.max(maxC, c); }
  if (opts.seed) { for (var i = 0; i < opts.seed.length; i++) for (var j = 0; j < opts.seed[i].length; j++) put(i + 1, j + 1, opts.seed[i][j]); }
  return {
    getName: function () { return name; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        setNumberFormat: function (fmt) { track(name).fmt++; if (opts.ignoreFormat) return; for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) cell(r + i, c + j).fmt = fmt; },
        setValues: function (m) { track(name).setValues++; for (var i = 0; i < m.length; i++) for (var j = 0; j < m[i].length; j++) put(r + i, c + j, m[i][j]); },
        getValues: function () { var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push(cell(r + i, c + j).v); out.push(row); } return out; }
      };
    },
    getDataRange: function () { return { getValues: function () { var out = []; for (var i = 1; i <= maxR; i++) { var row = []; for (var j = 1; j <= maxC; j++) row.push(cell(i, j).v); out.push(row); } return out; } }; },
    clear: function () { cells = {}; maxR = 0; maxC = 0; track(name).clear++; },
    setName: function () { track(name).rename++; }
  };
}

var HCOLS = ['request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku', 'status', 'generation_type', 'draft_purpose', 'draft_version', 'calculation_run_id', 'formula_version', 'created_by', 'created_at', 'updated_by', 'updated_at'];
var LCOLS = ['request_allocation_draft_id', 'request_bucket', 'request_month', 'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'line_status', 'submitted_by', 'submitted_at', 'user_edited'];
function toMatrix(cols, objs) { return [cols.slice()].concat(objs.map(function (o) { return cols.map(function (c) { return o[c] !== undefined ? o[c] : ''; }); })); }
function line(id, b, m, rec, ord, st) { return { request_allocation_draft_id: id, request_bucket: b, request_month: m, recommended_qty: rec, order_qty: ord, carton_qty: '', units_per_carton: '10', line_status: st, submitted_by: st === 'submitted' ? 'u' : '', submitted_at: st === 'submitted' ? 't' : '', user_edited: 'FALSE' }; }
var ACTIVE6 = [
  { id: ACTIVE_RAD[0], company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'CO1200-O', status: 'site_confirmed', purpose: '' },
  { id: ACTIVE_RAD[1], company: 'ResTW', country: 'CA', mkt: 'Amazon', sku: 'CO1200-O', status: 'site_confirmed', purpose: '' },
  { id: ACTIVE_RAD[2], company: 'KM', country: 'US', mkt: 'KM Walmart', sku: 'CO1200-O', status: 'site_confirmed', purpose: '' },
  { id: ACTIVE_RAD[3], company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'CO5600-R', status: 'site_confirmed', purpose: '' },
  { id: ACTIVE_RAD[4], company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'CO5600-W', status: 'site_confirmed', purpose: '' },
  { id: RD_ID, company: 'ResUS', country: 'US', mkt: 'Amazon', sku: 'SP5120-R', status: 'draft', purpose: 'regular' }
];
function submittedMkt(i) { return i < 13 ? 'Amazon' : (i < 17 ? 'KM Walmart' : 'Shopify'); }
function cohortSheet() {
  var H = [], L = [], i;
  for (i = 0; i < 98; i++) { var zid = 'RD::MONTHLY_ORDER::2026-09::z' + i; H.push({ request_allocation_draft_id: zid, planning_cycle: '2026-09', company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'Z' + i, status: 'draft', draft_purpose: 'regular', draft_version: 1, calculation_run_id: 'RUN-' + zid }); }
  ACTIVE6.forEach(function (a) { H.push({ request_allocation_draft_id: a.id, planning_cycle: '2026-07', company: a.company, country: a.country, marketplace: a.mkt, sku: a.sku, status: a.status, draft_purpose: a.purpose, draft_version: 1, calculation_run_id: 'RUN-' + a.id }); L.push(line(a.id, 'T1', '2026-08', 100, 100, 'active'), line(a.id, 'T2', '2026-09', 50, 50, 'active'), line(a.id, 'T3', '2026-10', 0, 0, 'draft')); });
  SUBMITTED_RAD.forEach(function (sid, k) { H.push({ request_allocation_draft_id: sid, planning_cycle: '2026-07', company: 'ResUS', country: 'US', marketplace: submittedMkt(k), sku: 'SUB' + k, status: 'submitted', draft_purpose: '', draft_version: 1, calculation_run_id: 'RUN-' + sid }); L.push(line(sid, 'T1', '2026-08', 200, 200, 'submitted'), line(sid, 'T2', '2026-09', 100, 100, 'submitted')); });
  return { 'request_order_allocation_drafts': toMatrix(HCOLS, H), 'request_order_allocation_draft_lines': toMatrix(LCOLS, L) };
}

var STAGE = 'request_order_allocation_drafts_v2';
function makeSandbox(opts) {
  opts = opts || {};
  var base = cohortSheet();
  var track = {}; function T(n) { track[n] = track[n] || { setValues: 0, clear: 0, rename: 0, del: 0, fmt: 0 }; return track[n]; }
  // ALL tabs are coercion-modeling sheets (as real Sheets). Legacy tabs are seeded (untracked) so their reads coerce
  // identically to staging; the staging tab is created fresh by insertSheet during EXECUTE.
  var sheets = {};
  sheets['request_order_allocation_drafts'] = makeSheet('request_order_allocation_drafts', T, { seed: base['request_order_allocation_drafts'] });
  sheets['request_order_allocation_draft_lines'] = makeSheet('request_order_allocation_draft_lines', T, { seed: base['request_order_allocation_draft_lines'] });
  if (opts.preStaging) sheets[STAGE] = makeSheet(STAGE, T, { seed: opts.preStaging });
  var insertLog = [], flushN = { n: 0 };
  var ss = {
    getSheetByName: function (n) { return sheets[n] || null; },
    getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; },
    insertSheet: function (n) { insertLog.push(n); sheets[n] = makeSheet(n, T, { ignoreFormat: (n === STAGE ? opts.ignoreFormat : false) }); return sheets[n]; },
    deleteSheet: function () {}
  };
  var Utilities = { formatDate: function (d, tz, f) { var off = (tz === 'Asia/Taipei') ? 8 : 0; var t = new Date(d.getTime() + off * 3600000); return t.getUTCFullYear() + '-' + ('0' + (t.getUTCMonth() + 1)).slice(-2); } };
  var sandbox = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, flush: function () { flushN.n++; } }, Utilities: Utilities, Logger: { log: function () {} }, console: console };
  vm.createContext(sandbox); vm.runInContext(GS, sandbox, { filename: 'TEMP.gs' });
  return { sandbox: sandbox, track: track, insertLog: insertLog, flushN: flushN, sheets: sheets };
}
function legacyWrites(track) { var m = 0; ['request_order_allocation_drafts', 'request_order_allocation_draft_lines'].forEach(function (t) { if (track[t]) m += track[t].setValues + track[t].clear + track[t].rename + track[t].del + track[t].fmt; }); return m; }

// ==========================================================================
section('OBJ1 root-cause: the mock reproduces Sheets coercion (General→Date; text→string)');
var probeTrack = function () { return { setValues: 0, clear: 0, rename: 0, del: 0, fmt: 0 }; };
var sGen = makeSheet('probe', function () { return probeTrack(); }, false);
sGen.getRange(1, 1, 1, 1).setValues([['2026-08']]);   // General format
ok(Object.prototype.toString.call(sGen.getRange(1, 1, 1, 1).getValues()[0][0]) === '[object Date]', 'General-format cell coerces "2026-08" into a Date (root cause)');
var sTxt = makeSheet('probe', function () { return probeTrack(); }, false);
sTxt.getRange(1, 1, 1, 1).setNumberFormat('@'); sTxt.getRange(1, 1, 1, 1).setValues([['2026-08']]);
eq(sTxt.getRange(1, 1, 1, 1).getValues()[0][0], '2026-08', 'plain-text cell preserves the primitive string "2026-08"');

// ==========================================================================
section('OBJ2/3 fixed EXECUTE (public no-arg, frozen authority): text-format + flush + roundtrip → READY');
var e = makeSandbox({});
var exOut = e.sandbox.TEMP_R4_EXECUTE_RequestOrderDraftV2();
ok(exOut && exOut.mode === 'EXECUTE' && !exOut.halt, 'EXECUTE succeeds (no halt)');
eq([exOut.written_headers, exOut.written_rows], [53, 26], '53 headers / 26 rows written');
eq(e.insertLog, [STAGE], 'inserts ONLY the staging tab');
eq(e.track[STAGE].setValues, 1, 'exactly ONE setValues on staging');
eq(e.track[STAGE].fmt, 2, 'exactly TWO setNumberFormat calls on staging (planning_cycle + id)');
eq(legacyWrites(e.track), 0, 'legacy header + line tabs: ZERO writes and ZERO formatting');
ok(e.flushN.n >= 1, 'SpreadsheetApp.flush() called before roundtrip read');
eq(exOut.POST_WRITE_FLUSHED, true, 'POST_WRITE_FLUSHED = true');
eq(exOut.POST_WRITE_ROWS, 26, 'POST_WRITE_ROWS = 26');
eq(exOut.POST_WRITE_CYCLE_TYPES, { string: 26 }, 'all 26 read-back cycle types = string (no Date)');
eq(exOut.POST_WRITE_CYCLE_DISTRIBUTION, { '2026-08': 26 }, 'read-back cycle distribution {2026-08:26}');
eq(exOut.POST_WRITE_NON_STRING_CYCLE_IDS, [], 'no non-string / wrong cycle');
eq(exOut.POST_WRITE_ID_TYPES, { string: 26 }, 'all 26 read-back id types = string');
eq(exOut.POST_WRITE_ID_SET_OK, true, 'POST_WRITE_ID_SET_OK = true (ids byte-verbatim from source)');
ok(Object.keys(exOut.POST_WRITE_VALIDATOR).every(function (g) { return g === 'READY_FOR_SWAP' || exOut.POST_WRITE_VALIDATOR[g] === true; }), 'all 14 post-write validator gates = true');
eq(exOut.POST_WRITE_READY_FOR_SWAP, 'YES', 'POST_WRITE_READY_FOR_SWAP = YES');

// ==========================================================================
section('OBJ3 roundtrip HALT: if the text format does not take (Date survives) → fail closed, no auto retry');
var g = makeSandbox({ ignoreFormat: true });
var gOut = g.sandbox.TEMP_R4_EXECUTE_RequestOrderDraftV2();
eq([gOut.ok, gOut.halt], [false, 'STAGING_POST_WRITE_ROUNDTRIP_FAILED'], 'Date roundtrip → HALT STAGING_POST_WRITE_ROUNDTRIP_FAILED');
ok(gOut.POST_WRITE_CYCLE_TYPES.Date === 26, 'read-back saw 26 Date cycle values (the failure mode)');
ok(gOut.offenders && gOut.offenders.non_string_or_wrong_cycle.length === 26, 'offenders list the 26 non-string cycle rows with raw value + type');
ok(gOut.offenders.non_string_or_wrong_cycle[0].type === 'Date' && /^2026-0[78]/.test(gOut.offenders.non_string_or_wrong_cycle[0].raw), 'offender carries ISO raw + Date type');
eq(g.track[STAGE].rename || 0, 0, 'no auto rename after roundtrip failure');
eq(g.track[STAGE].clear || 0, 0, 'no auto clear after roundtrip failure');
eq(g.insertLog, [STAGE], 'exactly one staging insert; no second/retry sheet created');
eq(legacyWrites(g.track), 0, 'failed roundtrip still never touches legacy tabs');

// ==========================================================================
section('retry policy: an existing NON-EMPTY staging tab fails closed BEFORE any format/write');
var pre = [KMRDV2.V2_HEADERS.slice()].concat([KMRDV2.V2_HEADERS.map(function () { return 'x'; })]);
var pf = makeSandbox({ preStaging: pre });
var pfOut = pf.sandbox.TEMP_R4_EXECUTE_RequestOrderDraftV2();
eq(pfOut.halt, 'STAGING_TAB_NOT_EMPTY', 'existing non-empty staging → HALT STAGING_TAB_NOT_EMPTY');
eq((pf.track[STAGE] && (pf.track[STAGE].fmt + pf.track[STAGE].setValues + pf.track[STAGE].clear)) || 0, 0, 'no format/write/clear performed on the retained failed staging tab');
eq(pf.insertLog, [], 'no new staging tab inserted on the fail-closed retry');
eq(legacyWrites(pf.track), 0, 'aborted retry never touches legacy tabs');

// ==========================================================================
section('DRY RUN remains zero-write / zero-format');
var d = makeSandbox({});
var dry = d.sandbox.TEMP_R4_DRY_RUN_RequestOrderDraftV2();
ok(dry.mode === 'DRY_RUN' && !dry.halt, 'dry run ok');
eq(d.insertLog, [], 'DRY RUN inserts no sheet');
ok(!d.track[STAGE], 'DRY RUN never touches the staging tab (no setValues/format)');
eq(legacyWrites(d.track), 0, 'DRY RUN zero legacy writes');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R4C2 STAGING WRITE TYPE + ROUNDTRIP (F1-7N-FA-3C-R4C2): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
