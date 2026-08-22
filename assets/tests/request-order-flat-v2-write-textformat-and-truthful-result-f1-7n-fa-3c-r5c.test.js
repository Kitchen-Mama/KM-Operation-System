// Kitchen Mama Operation System — R5C-P0 permanent V2 write text-format + partial-commit truthful semantics.
// Run: node assets/tests/request-order-flat-v2-write-textformat-and-truthful-result-f1-7n-fa-3c-r5c.test.js
// Reproduces BOTH R5C defects with REAL production functions + a faithful Google-Sheets coercion model:
//   D1 (write coercion): rpoKeyedDeltaWrite_ (24_) wrote the flat V2 planning_cycle "2026-08" via bare setValues on a
//       General-format cell → Sheets coerced it into a Date. Fix: force "@" text on ONLY the drafts id/cycle cells of
//       ONLY the written rows BEFORE setValues, then flush + roundtrip-verify.
//   D2 (false failure): recGenSummarizeDraftResult_ (47_) only understood the legacy line shape (data.status), so it
//       misclassified EVERY committed flat write (outcome/wrote/action, no status) as GENERATION_FAILED → live Failed 99
//       with rows committed. Fix: flat-shape branch (marked resultShape='FLAT_V2') → truthful CREATED/… +
//       WRITE_COMMITTED_READBACK_FAILED for a committed-but-unverified write (surfaces the id, requires reconciliation).

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var DIR = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var GS24 = fs.readFileSync(path.join(DIR, '24_recommendation_orchestrator.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS47 = fs.readFileSync(path.join(DIR, '47_api_v1_recommendation_generation.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS48 = fs.readFileSync(path.join(DIR, '48_api_v1_request_order_draft_job.gs'), 'utf8').replace(/\r\n/g, '\n');
var GSTEMP = fs.readFileSync(path.join(DIR, 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');

var HDR = KMRDV2P.HEADER_TABLE, JRN = 'recommendation_calculation_runs';
var V2 = KMRDV2.V2_HEADERS;
var ID_COL = V2.indexOf('request_allocation_draft_id'), CY_COL = V2.indexOf('planning_cycle');
function isDate(v) { return Object.prototype.toString.call(v) === '[object Date]'; }

// ---- faithful Google-Sheets coercion model: a General-format cell given the string "2026-08" stores a Date; an "@"
//      (plain-text) cell stores the string byte-verbatim. honorFormat:false models a sheet where "@" did NOT take
//      (the coercion always fires) — used to force a post-write roundtrip failure.
function makeSheet(name, headers, beforeRows, opts) {
  opts = opts || {}; var honor = opts.honorFormat !== false;
  var grid = []; function ensure(r, c) { while (grid.length <= r) grid.push([]); var row = grid[r]; while (row.length <= c) row.push({ v: '', fmt: 'General' }); }
  headers.forEach(function (h, c) { ensure(0, c); grid[0][c] = { v: h, fmt: 'General' }; });
  (beforeRows || []).forEach(function (row, ri) { row.forEach(function (val, c) { ensure(ri + 1, c); grid[ri + 1][c] = { v: val, fmt: 'General' }; }); });
  var track = { setValuesCalls: 0, formatCalls: 0, formatCols: {} };
  function coerce(v, fmt) { if (honor && fmt === '@') return v; if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return new Date(Date.UTC(+v.slice(0, 4), +v.slice(5, 7) - 1, 1)); return v; }
  function range(r1, c1, nr, nc) {
    return {
      getValues: function () { var out = []; for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) { ensure(r1 - 1 + i, c1 - 1 + j); row.push(grid[r1 - 1 + i][c1 - 1 + j].v); } out.push(row); } return out; },
      setValues: function (vals) { track.setValuesCalls++; for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) { ensure(r1 - 1 + i, c1 - 1 + j); var cell = grid[r1 - 1 + i][c1 - 1 + j]; cell.v = coerce(vals[i][j], cell.fmt); } },
      setNumberFormat: function (fmt) { track.formatCalls++; for (var i = 0; i < nr; i++) for (var j = 0; j < nc; j++) { ensure(r1 - 1 + i, c1 - 1 + j); grid[r1 - 1 + i][c1 - 1 + j].fmt = fmt; track.formatCols[c1 - 1 + j] = fmt; } }
    };
  }
  return { getName: function () { return name; }, getLastRow: function () { return grid.length; }, getLastColumn: function () { return headers.length; },
    getRange: function (r, c, nr, nc) { return range(r, c, nr || 1, nc || 1); }, _grid: grid, _track: track,
    _cell: function (r1, c1) { ensure(r1 - 1, c1 - 1); return grid[r1 - 1][c1 - 1]; }, _dataRowCount: function () { return grid.length - 1; } };
}
function rowFor(id, sku, cycle, status) { var o = {}; V2.forEach(function (h) { o[h] = ''; }); o.request_allocation_draft_id = id; o.planning_cycle = cycle; o.company = 'ResUS'; o.country = 'US'; o.marketplace = 'Amazon'; o.sku = sku; o.draft_purpose = 'regular'; o.status = status || 'draft'; o.draft_version = 1; o.t1_recommended_qty = 100; o.t1_order_qty = 100; return V2.map(function (h) { return o[h]; }); }

// ---- faithful KMORCH.computeKeyedDeltaWrites stub (keyed by request_allocation_draft_id, col 0) ----
var KMORCH = { computeKeyedDeltaWrites: function (before, after) {
  var ids = (before || []).map(function (r) { return String(r[0]); }); var updates = [], appends = [];
  (after || []).forEach(function (row) { var idx = ids.indexOf(String(row[0])); if (idx === -1) appends.push(row); else if (JSON.stringify(before[idx]) !== JSON.stringify(row)) updates.push({ rowIndex: idx, values: row }); });
  return { updates: updates, appends: appends };
} };

function load24(flagOn) {
  var sb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, KMORCH: KMORCH, KMPR: { RUN_JOURNAL_TABLE: JRN, TABLES: { MONTHLY_ORDER: { header: HDR } } },
    requestOrderDraftV2FlatCutoverEnabled_: function () { return flagOn === true; },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return {}; }, flush: function () {} },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    procurementTimestamp_: function () { return '2026-08-22T10:20:00Z'; }, jsonResponse_: function (x) { return x; }, Logger: { log: function () {} }, console: console };
  vm.createContext(sb); vm.runInContext(GS24, sb, { filename: '24_.gs' });
  return sb;
}
var SB47 = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; } }; } }, Utilities: { formatDate: function () { return '2026-08'; } }, Logger: { log: function () {} }, console: console };
vm.createContext(SB47); vm.runInContext(GS47, SB47, { filename: '47_.gs' });
var summarize = SB47.recGenSummarizeDraftResult_;

// ==========================================================================
section('1. coercion model: a General-format cell coerces "2026-08" into a Date (the incident mechanism)');
var gs = makeSheet('t', V2, []); gs.getRange(2, CY_COL + 1, 1, 1).setValues([['2026-08']]);
ok(isDate(gs._cell(2, CY_COL + 1).v), 'without "@" a General cell stores "2026-08" as a Date (reproduces D1)');
var gs2 = makeSheet('t', V2, []); gs2.getRange(2, CY_COL + 1, 1, 1).setNumberFormat('@'); gs2.getRange(2, CY_COL + 1, 1, 1).setValues([['2026-08']]);
eq(gs2._cell(2, CY_COL + 1).v, '2026-08', 'with "@" the cell stores the primitive string "2026-08" (the fix mechanism)');

section('2-7. rpoKeyedDeltaWrite_ (flag=true): id/cycle text-formatted, roundtrip-verified, other cols + tables untouched');
var sbW = load24(true);
var draftSheet = makeSheet(HDR, V2, [rowFor('RD::MONTHLY_ORDER::2026-08::PRE', 'PRE-SKU', '2026-08')]);   // 1 pre-existing migrated row
var jrnSheet = makeSheet(JRN, ['calculation_run_id'], [['run-0']]);
var appendRow = rowFor('RD::MONTHLY_ORDER::2026-08::NEW', 'NEW-SKU', '2026-08');
var set = {}; set[HDR] = { headers: V2.slice(), rows: [draftSheet._grid[1].map(function (c) { return c.v; }), appendRow] }; set[JRN] = { headers: ['calculation_run_id'], rows: [['run-0']] };
var meta = {}; meta[HDR] = draftSheet; meta[JRN] = jrnSheet;
var before = {}; before[HDR] = [draftSheet._grid[1].map(function (c) { return c.v; })]; before[JRN] = [['run-0']];
var wres = sbW.rpoKeyedDeltaWrite_(meta, set, before, [HDR, JRN]);
eq(wres.verified, true, '2/3. append write roundtrip-verified true (cycle stays string)');
ok(!isDate(draftSheet._cell(3, CY_COL + 1).v) && draftSheet._cell(3, CY_COL + 1).v === '2026-08', '3. newly appended row planning_cycle roundtrips as the string "2026-08" (NOT a Date)');
eq(draftSheet._cell(3, ID_COL + 1).v, 'RD::MONTHLY_ORDER::2026-08::NEW', '5. appended request_allocation_draft_id is byte-verbatim string');
eq(draftSheet._cell(3, CY_COL + 1).fmt, '@', '2. planning_cycle cell got "@" text format');
eq(draftSheet._cell(3, ID_COL + 1).fmt, '@', '2. request_allocation_draft_id cell got "@" text format');
ok(draftSheet._track.formatCols[ID_COL] === '@' && draftSheet._track.formatCols[CY_COL] === '@' && Object.keys(draftSheet._track.formatCols).length === 2, '6. ONLY the id + cycle columns received text formatting (2 columns, no others)');
eq(jrnSheet._track.formatCalls, 0, '7. the run-journal (non-V2) table received ZERO setNumberFormat calls');
eq(wres.committedDraftIds, ['RD::MONTHLY_ORDER::2026-08::NEW'], 'append committed id recorded');

section('4. existing-row UPDATE also retains a string cycle (text-format applies to updates, not just appends)');
var upSheet = makeSheet(HDR, V2, [rowFor('RD::MONTHLY_ORDER::2026-08::UP', 'UP-SKU', '2026-08')]);
var upSet = {}; var updated = rowFor('RD::MONTHLY_ORDER::2026-08::UP', 'UP-SKU', '2026-08'); updated[V2.indexOf('t1_order_qty')] = 999;
upSet[HDR] = { headers: V2.slice(), rows: [updated] };
var upMeta = {}; upMeta[HDR] = upSheet;
var upBefore = {}; upBefore[HDR] = [upSheet._grid[1].map(function (c) { return c.v; })];
var upRes = sbW.rpoKeyedDeltaWrite_(upMeta, upSet, upBefore, [HDR]);
eq(upRes.verified, true, '4. update roundtrip-verified');
eq(upSheet._cell(2, CY_COL + 1).v, '2026-08', '4. updated row planning_cycle stays the string "2026-08"');

section('13. flag=false (rollback) — byte-identical bare setValues; NO text-format; legacy path unchanged');
var sbOff = load24(false);
var offSheet = makeSheet(HDR, V2, []); var offSet = {}; offSet[HDR] = { headers: V2.slice(), rows: [rowFor('RD::X', 'X', '2026-08')] };
var offMeta = {}; offMeta[HDR] = offSheet; var offBefore = {}; offBefore[HDR] = [];
sbOff.rpoKeyedDeltaWrite_(offMeta, offSet, offBefore, [HDR]);
eq(offSheet._track.formatCalls, 0, '13. flag=false → ZERO setNumberFormat (legacy write byte-identical)');
ok(isDate(offSheet._cell(2, CY_COL + 1).v), '13. flag=false coerces to Date (proves the guard leaves the legacy/rollback path exactly as before)');

section('8-9. rpoFlatLockedApply_ — a committed row whose readback fails → WRITE_COMMITTED_READBACK_FAILED');
function lockedEnv(honor) {
  var sb = load24(true);
  var dSheet = makeSheet(HDR, V2, [], { honorFormat: honor }); var jSheet = makeSheet(JRN, ['calculation_run_id'], []);
  function rowsFrom(sheet, width) { var out = []; for (var r = 2; r <= sheet.getLastRow(); r++) { var row = []; for (var c = 1; c <= width; c++) row.push(sheet._cell(r, c).v); out.push(row); } return out; }
  sb.rprBuildSheetSet_ = function () { var s = {}; s[HDR] = { headers: V2.slice(), rows: rowsFrom(dSheet, V2.length) }; s[JRN] = { headers: ['calculation_run_id'], rows: rowsFrom(jSheet, 1) }; var m = {}; m[HDR] = dSheet; m[JRN] = jSheet; return { set: s, meta: m }; };
  sb.KMRDV2P = Object.create(KMRDV2P); sb.KMRDV2P.applyFlat = function (set2, plan) { var rows = set2[HDR].rows; var arr = V2.map(function (h) { return plan.row[h] !== undefined ? plan.row[h] : ''; }); var idx = rows.map(function (r) { return String(r[0]); }).indexOf(String(plan.draftId)); if (idx === -1) rows.push(arr); else rows[idx] = arr; return { runStatus: 'COMPLETED', wrote: true, action: idx === -1 ? 'INSERT' : 'UPDATE', draftId: plan.draftId }; };
  return { sb: sb, dSheet: dSheet };
}
function planFor(id, sku, cycle) { return { recommendationType: 'MONTHLY_ORDER', draftId: id, draftVersion: 1, calculationRunId: 'crun-1', runMeta: { planning_cycle: cycle }, action: 'refresh', row: (function () { var o = {}; V2.forEach(function (h) { o[h] = ''; }); o.request_allocation_draft_id = id; o.planning_cycle = cycle; o.company = 'ResUS'; o.country = 'US'; o.marketplace = 'Amazon'; o.sku = sku; o.draft_purpose = 'regular'; o.status = 'draft'; o.draft_version = 1; return o; })() }; }
var broken = lockedEnv(false);   // "@" does NOT take → cycle coerces → roundtrip fails though the row committed
var brokenRes = broken.sb.rpoFlatLockedApply_({}, planFor('RD::MONTHLY_ORDER::2026-08::BRK', 'BRK', '2026-08'), { draft_version: 1 }, {});
eq(brokenRes.writeOutcome, 'WRITE_COMMITTED_READBACK_FAILED', '8. committed row + failed readback → writeOutcome WRITE_COMMITTED_READBACK_FAILED');
eq(brokenRes.requiresReconciliation, true, '8. requiresReconciliation flagged');
eq(brokenRes.committedDraftId, 'RD::MONTHLY_ORDER::2026-08::BRK', '8. the committed draft id is surfaced (not lost)');
ok(broken.dSheet._dataRowCount() === 1, '8. the row IS committed (Created=0-with-no-mutation is NOT claimed)');

var good = lockedEnv(true);
var goodRes = good.sb.rpoFlatLockedApply_({}, planFor('RD::MONTHLY_ORDER::2026-08::OK', 'OK', '2026-08'), { draft_version: 1 }, {});
eq(goodRes.writeOutcome, 'WRITE_COMMITTED_VERIFIED', 'good sheet → WRITE_COMMITTED_VERIFIED');

section('9. a committed-but-unverified write is NOT blindly retried as CREATE (summarizer surfaces reconciliation)');
var s9 = summarize('BRK', { success: true, data: { resultShape: 'FLAT_V2', wrote: true, outcome: 'REFRESH', draftId: 'RD::X', result: { writeOutcome: 'WRITE_COMMITTED_READBACK_FAILED', committedDraftId: 'RD::X' } } });
eq([s9.status, s9.requiresReconciliation, s9.draftId], ['WRITE_COMMITTED_READBACK_FAILED', true, 'RD::X'], '9. summarizer → WRITE_COMMITTED_READBACK_FAILED + requiresReconciliation + committed id');

section('10-11. deterministic-id retry REUSES the active row → UPDATE not append → no duplicate natural key');
var reuseEnv = lockedEnv(true);
reuseEnv.sb.rpoFlatLockedApply_({}, planFor('RD::MONTHLY_ORDER::2026-08::DET', 'DET', '2026-08'), { draft_version: 1 }, {});
reuseEnv.sb.rpoFlatLockedApply_({}, planFor('RD::MONTHLY_ORDER::2026-08::DET', 'DET', '2026-08'), { draft_version: 1 }, {});
eq(reuseEnv.dSheet._dataRowCount(), 1, '10-11. same deterministic id twice → exactly ONE row (idempotent reuse, no duplicate active natural key)');
eq(reuseEnv.dSheet._cell(2, CY_COL + 1).v, '2026-08', '10. reused row still carries the string cycle');

section('12. a malformed/blank cycle written to a V2 row fails the roundtrip closed (never silently accepted)');
var badSheet = makeSheet(HDR, V2, []); var badRow = rowFor('RD::BAD', 'BAD', 'RECO-2026-08'); var badSet = {}; badSet[HDR] = { headers: V2.slice(), rows: [badRow] };
var badMeta = {}; badMeta[HDR] = badSheet; var badBefore = {}; badBefore[HDR] = [];
var badRes = sbW.rpoKeyedDeltaWrite_(badMeta, badSet, badBefore, [HDR]);
eq(badRes.verified, false, '12. a non-YYYY-MM cycle fails the roundtrip (verified=false)');
ok(badRes.readbackFailures.length === 1 && badRes.readbackFailures[0].draftId === 'RD::BAD', '12. the offending row is surfaced in readbackFailures');

// ==========================================================================
section('D2 REPRODUCE + FIX — recGenSummarizeDraftResult_ flat-shape classification');
// pre-R5C: a flat result WITHOUT the resultShape marker fell to the legacy line branch → GENERATION_FAILED (the bug)
var preFix = summarize('SKU', { success: true, data: { wrote: true, outcome: 'CREATE', action: 'create', draftId: 'RD::C' } });
eq([preFix.status, preFix.code], ['FAILED', 'GENERATION_FAILED'], 'REPRODUCE: an unmarked flat result → GENERATION_FAILED (the live Failed 99 with rows committed)');
eq(summarize('SKU', { success: true, data: { resultShape: 'FLAT_V2', wrote: true, outcome: 'CREATE', draftId: 'RD::C', result: { writeOutcome: 'WRITE_COMMITTED_VERIFIED' } } }), { sku: 'SKU', status: 'CREATED', draftId: 'RD::C' }, 'FIX: committed create → CREATED (truthful)');
eq(summarize('SKU', { success: true, data: { resultShape: 'FLAT_V2', wrote: true, outcome: 'REFRESH', draftId: 'RD::R' } }).status, 'REUSED', 'committed refresh → REUSED');
eq(summarize('SKU', { success: true, data: { resultShape: 'FLAT_V2', wrote: true, outcome: 'REGENERATE', draftId: 'RD::G' } }).status, 'REGENERATED', 'committed regenerate → REGENERATED');
eq(summarize('SKU', { success: true, data: { resultShape: 'FLAT_V2', wrote: false, persisted: false, outcome: 'NON_ACTIONABLE', reason: 'NON_ACTIONABLE_ZERO_RECOMMENDATION' } }), { sku: 'SKU', status: 'NOT_READY', code: 'NON_ACTIONABLE_ZERO_RECOMMENDATION', draftId: null }, 'zero-recommendation → NOT_READY (not a failure; no mutation)');
eq(summarize('SKU', { success: false, data: { resultShape: 'FLAT_V2', error: 'BLOCKED_CONFLICT', stage: 'active' } }).status, 'BLOCKED_CONFLICT', 'blocked conflict classified (flat)');

section('SOURCE wiring — the fix lives in the standalone .gs seams (no core/bundle change)');
ok(/result\.resultShape = 'FLAT_V2'/.test(GS24), "24_ marks the flat generate result resultShape='FLAT_V2'");
ok(/requestOrderDraftV2FlatCutoverEnabled_\(\) === true/.test(GS24) && /setNumberFormat\('@'\)/.test(GS24), '24_ rpoKeyedDeltaWrite_ is flag-gated and applies "@" text format');
ok(/name === V2TABLE/.test(GS24), '24_ text-format gate is scoped to the V2 drafts table only');
ok(/SpreadsheetApp\.flush\(\)/.test(GS24) && /rpoFlatVerifyWrittenRows_/.test(GS24), '24_ flushes + roundtrip-verifies the written rows');
ok(/WRITE_COMMITTED_READBACK_FAILED/.test(GS24) && /WRITE_COMMITTED_VERIFIED/.test(GS24) && /WRITE_NOT_STARTED/.test(GS24) && /WRITE_REJECTED/.test(GS24), '24_ implements the four explicit write outcomes');
ok(/d\.resultShape === 'FLAT_V2'/.test(GS47), '47_ summarizer routes on the FLAT_V2 marker');
ok(/committedUnverified\+\+/.test(GS48) && /'WRITE_COMMITTED_READBACK_FAILED' \? 'X'/.test(GS48), '48_ job folds committed-unverified into its own truthful bucket (code X)');
ok(!/request_order_allocation_draft_lines/.test(GS24.split('function rpoKeyedDeltaWrite_')[1].split('\nfunction ')[0]), 'the keyed-delta writer never references the Draft-Line table');

// ==========================================================================
section('B. READ-ONLY diagnostic TEMP_R5C_AUDIT_DRAFT_WRITE_INCIDENT — offenders, checksum, zero writes');
var dtrack = { writes: 0 };
function diagSheet(name, headers, rows) {
  return { getName: function () { return name; }, getDataRange: function () { return { getValues: function () { return [headers].concat(rows); } }; },
    getSheetByName: function () {}, setValues: function () { dtrack.writes++; }, setNumberFormat: function () { dtrack.writes++; } };
}
var canonHeaders = V2.slice();
// two canonical (string cycle) migrated rows + one Date-coerced incident offender (id encodes 2026-08)
function objRowArr(id, sku, cyc, status) { var o = {}; V2.forEach(function (h) { o[h] = ''; }); o.request_allocation_draft_id = id; o.planning_cycle = cyc; o.company = 'ResUS'; o.country = 'US'; o.marketplace = 'Amazon'; o.sku = sku; o.draft_purpose = 'regular'; o.status = status || 'draft'; o.created_at = '2026-08-22T10:18:00Z'; return V2.map(function (h) { return o[h]; }); }
var canonRows = [objRowArr('RD::MONTHLY_ORDER::2026-08::A', 'A', '2026-08'), objRowArr('RD::MONTHLY_ORDER::2026-08::B', 'B', '2026-08'), objRowArr('RD::MONTHLY_ORDER::2026-08::C', 'C', new Date(Date.UTC(2026, 7, 1)))];
var tabs = {}; tabs[HDR] = diagSheet(HDR, canonHeaders, canonRows); tabs['request_order_allocation_draft_lines'] = diagSheet('lines', ['request_allocation_line_id'], [['L1'], ['L2']]);
var dss = { getSheetByName: function (n) { return tabs[n] || null; }, getId: function () { return 'SS-LIVE-1234'; }, getName: function () { return 'KM Ops DB'; } };
var dsb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, requestOrderDraftV2FlatCutoverEnabled_: function () { return true; }, PRODUCTION_DB_SPREADSHEET_ID_: 'SS-LIVE-1234',
  SpreadsheetApp: { getActiveSpreadsheet: function () { return dss; } }, Utilities: { formatDate: function () { return '2026-08'; } }, Logger: { log: function () {} }, console: console };
vm.createContext(dsb); vm.runInContext(GSTEMP, dsb, { filename: 'TEMP.gs' });
var audit = dsb.TEMP_R5C_AUDIT_DRAFT_WRITE_INCIDENT();
eq(audit.R5C_CANONICAL_ROW_COUNT, 3, 'diagnostic: canonical row count observed (3)');
eq(audit.R5C_DRAFT_LINE_ROW_COUNT, 2, 'diagnostic: Draft-Line row count observed (read-only)');
eq(audit.R5C_NONCANONICAL_CYCLE_COUNT, 1, 'diagnostic: exactly one Date/noncanonical cycle row detected');
eq(audit.R5C_OFFENDER_IDS, ['RD::MONTHLY_ORDER::2026-08::C'], 'diagnostic: offender id enumerated');
eq(audit.noncanonical_rows[0].is_date, 'YES', 'diagnostic: offender flagged is_date=YES');
eq(audit.noncanonical_rows[0].id_encoded_cycle, '2026-08', 'diagnostic: deterministic-id cycle parsed (2026-08)');
eq(audit.noncanonical_rows[0].id_cycle_parsable, 'YES', 'diagnostic: offender id cycle is deterministically resolvable');
eq(audit.R5C_UNRESOLVABLE_COUNT, 0, 'diagnostic: zero unresolvable offenders');
eq(audit.R5C_PROJECTED_DUPLICATE_COUNT, 0, 'diagnostic: canonicalizing the offender creates no duplicate active key');
eq(audit.pre_existing_migrated_id_count, 2, 'diagnostic: pre-existing migrated (string-cycle) rows counted');
eq(audit.R5C_ZERO_WRITE_CONFIRMED.slice(0, 3), 'YES', 'diagnostic: zero-write confirmed');
eq(dtrack.writes, 0, 'diagnostic performed ZERO writes');
ok(typeof audit.R5C_INCIDENT_AUDIT_CHECKSUM === 'string' && audit.R5C_INCIDENT_AUDIT_CHECKSUM.length === 8, 'diagnostic: deterministic offender checksum emitted');
eq(audit.R5C_INCIDENT_AUDIT_READY, 'YES', 'R5C_INCIDENT_AUDIT_READY=YES');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R5C V2 WRITE TEXT-FORMAT + TRUTHFUL RESULT (F1-7N-FA-3C-R5C): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
