// Kitchen Mama Operation System — R6A flat-draft lifecycle (Edit/Submit/Send) + preflight — F1-7N-FA-3C-R6A.
// Run: node assets/tests/request-order-flat-lifecycle-preflight-f1-7n-fa-3c-r6a.test.js
// Part A proves the REAL core lifecycle contract (KMRDV2/KMRDV2P edit/submit/explode + optimistic token). Part B drives
// the REAL read-only preflight + validators (TEMP helper) against a mock live DB (flat table + downstream Request-Order
// tables), proving the verdicts, downstream lineage, zero-write, and zero Draft-Line dependency. Part C asserts wiring.

'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var KMRDV2 = require('../js/core/supply-planning-request-draft-v2.js');
var KMRDV2P = require('../js/core/supply-planning-request-draft-v2-persistence.js');
var KMPR = require('../js/core/supply-planning-persistence-repository.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var DIR = path.join(__dirname, '..', 'specs', 'active', 'apps-script');
var GSTEMP = fs.readFileSync(path.join(DIR, 'TEMP_migrate_request_order_draft_v2.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS24 = fs.readFileSync(path.join(DIR, '24_recommendation_orchestrator.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS25 = fs.readFileSync(path.join(DIR, '25_recommendation_user_edit.gs'), 'utf8').replace(/\r\n/g, '\n');
var GS15 = fs.readFileSync(path.join(DIR, '15_request_allocation_handlers.gs'), 'utf8').replace(/\r\n/g, '\n');
var V2 = KMRDV2.V2_HEADERS, HDR = KMRDV2P.HEADER_TABLE, JRN = 'recommendation_calculation_runs';
var TARGET = 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1100-R';

function draftRowObj(over) {
  var o = {}; V2.forEach(function (h) { o[h] = ''; });
  o.request_allocation_draft_id = TARGET; o.planning_cycle = '2026-08'; o.company = 'ResUS'; o.country = 'US'; o.marketplace = 'Amazon'; o.sku = 'CO1100-R'; o.draft_purpose = 'regular';
  o.status = 'draft'; o.generation_type = 'ai_plan'; o.draft_version = 1; o.units_per_carton = 10; o.created_at = '2026-08-22T10:00:00Z'; o.created_by = 'system'; o.updated_at = '2026-08-22T10:00:00Z';
  o.t1_month = '2026-08'; o.t1_recommended_qty = 100; o.t1_order_qty = 100; o.t1_carton_qty = 10; o.t1_status = 'draft'; o.t1_user_edited = false;
  o.t2_month = '2026-09'; o.t2_recommended_qty = 50; o.t2_order_qty = 50; o.t2_carton_qty = 5; o.t2_status = 'draft'; o.t2_user_edited = false;
  o.t3_month = '2026-10'; o.t3_recommended_qty = 0; o.t3_order_qty = 0; o.t3_carton_qty = 0; o.t3_status = 'draft'; o.t3_user_edited = false;
  over && Object.keys(over).forEach(function (k) { o[k] = over[k]; });
  return o;
}
function toArr(o) { return V2.map(function (h) { return o[h] !== undefined ? o[h] : ''; }); }

// ==========================================================================
section('A. EDIT contract — only order/carton/note + user_edited change; recommended_qty & created_at protected');
var base = draftRowObj();
var edited = KMRDV2.applyTierEdit(base, 'T1', { order_qty: 120, note: 'bump' }, 'vic', '2026-08-22T11:00:00Z');
ok(edited.ok, 'edit applied');
eq(edited.row.t1_order_qty, 120, 'T1 order_qty updated to 120');
eq(edited.row.t1_carton_qty, 12, 'T1 carton_qty recomputed from UPC (120/10)');
eq(edited.row.t1_recommended_qty, 100, '3. recommended_qty PROTECTED (still 100)');
eq(edited.row.t1_note, 'bump', 'note updated');
eq(edited.row.t1_user_edited, true, 'user_edited stamped');
eq(edited.row.created_at, '2026-08-22T10:00:00Z', '3. created_at PROTECTED');
eq(edited.row.updated_at, '2026-08-22T11:00:00Z', '4. updated_at advances');
eq(edited.row.t2_order_qty, 50, 'other tier untouched');
var termRow = draftRowObj({ t1_status: 'submitted' });
eq(KMRDV2.applyTierEdit(termRow, 'T1', { order_qty: 5 }, 'vic', 't').reason, 'TIER_TERMINAL', '2. a submitted tier is terminal — edit rejected (no field change)');

section('A. optimistic token/version prevents a stale edit (KMRDV2P.applyFlat CONFLICT)');
var set = {}; set[HDR] = { headers: V2.slice(), rows: [toArr(base)] }; set[JRN] = { headers: ['calculation_run_id', 'recommendation_type', 'draft_id', 'planning_cycle', 'business_scope_key', 'draft_version', 'run_status', 'current_stage', 'formula_version', 'source_data_as_of', 'started_by', 'started_at', 'completed_by', 'completed_at', 'error_summary', 'attempt_count'], rows: [] };
var staleToken = { draft_version: 99, userEditFingerprint: KMPR.buildUserEditFingerprint([]) };
var conflictPlan = { recommendationType: 'MONTHLY_ORDER', draftId: TARGET, draftVersion: 1, calculationRunId: 'RUN::x', runMeta: { planning_cycle: '2026-08' }, row: draftRowObj({ t1_order_qty: 130 }) };
var cRes = KMRDV2P.applyFlat(set, conflictPlan, staleToken, {});
eq([cRes.runStatus, cRes.conflict], ['CONFLICT', true], '5. stale expected token → CONFLICT, no write');

section('A. PARTIAL SUBMIT — only the selected tier; header partially_submitted');
var partial = KMRDV2.applySubmit(base, ['T1'], 'vic', 't');
eq(partial.results.T1, 'SUBMITTED', '6. selected tier T1 submitted');
eq(partial.row.t2_status, 'draft', '6. unselected tier T2 unchanged (draft)');
eq(partial.row.status, 'partially_submitted', '7. header derives partially_submitted');
eq(partial.row.t1_submitted_by, 'vic', 'submitted_by stamped');

section('A. FULL SUBMIT — all submittable tiers; zero-qty tier never blocks / never a false line');
var full = KMRDV2.applySubmit(base, ['T1', 'T2', 'T3'], 'vic', 't');
eq([full.results.T1, full.results.T2, full.results.T3], ['SUBMITTED', 'SUBMITTED', 'NOT_SUBMITTABLE_ZERO_QTY'], '8/9. T1+T2 submit; T3 zero-qty rejected (no false submit)');
eq(full.row.status, 'submitted', '8. header submitted (all SUBMITTABLE tiers submitted; zero-qty T3 excluded)');
eq(KMRDV2.deriveHeaderStatus(draftRowObj({ t1_order_qty: 0, t2_order_qty: 0, t3_order_qty: 0 })), 'draft', '9. all-zero draft never becomes submitted');

section('A. SEND explode — one flat row → value lines for order_qty>0 non-cancelled tiers only');
var dto = { draftId: TARGET, unitsPerCarton: 10, scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' },
  tiers: [{ tier: 'T1', month: '2026-08', orderQty: 120, cartonQty: 12, status: 'submitted' }, { tier: 'T2', month: '2026-09', orderQty: 50, cartonQty: 5, status: 'submitted' }, { tier: 'T3', month: '2026-10', orderQty: 0, cartonQty: 0, status: 'draft' }] };
var lines = KMRDV2.explodeSendRequestLinesFromDto(dto);
eq(lines.length, 2, '10. Send explodes exactly 2 value lines (T1,T2); zero-qty T3 skipped');
eq([lines[0].request_bucket, lines[0].requested_qty, lines[0].request_allocation_draft_id], ['T1', 120, TARGET], '10. line carries bucket + qty + draft-id lineage FK');
ok(lines.every(function (l) { return l.request_allocation_line_id === undefined; }), '14. explode never emits a request_allocation_line_id (no Draft-Line dependency)');
var cancelledDto = { draftId: TARGET, unitsPerCarton: 10, scope: dto.scope, tiers: [{ tier: 'T1', month: '2026-08', orderQty: 120, cartonQty: 12, status: 'cancelled' }] };
eq(KMRDV2.explodeSendRequestLinesFromDto(cancelledDto).length, 0, '10. a cancelled tier is excluded from Send');

// ==========================================================================
section('B. READ-ONLY preflight + validators against a mock live DB (TEMP helper)');
function mockSheet(name, headers, rows, track) {
  var grid = [headers.slice()].concat(rows.map(function (r) { return r.slice(); }));
  function range() { return { getValues: function () { return grid; }, setValues: function () { track.writes++; }, setNumberFormat: function () { track.writes++; } }; }
  return { getName: function () { return name; }, getDataRange: function () { return range(); }, getLastRow: function () { return grid.length; }, getLastColumn: function () { return headers.length; },
    getRange: function () { return range(); }, appendRow: function () { track.writes++; }, insertSheet: function () { track.writes++; } };
}
var SRC_HEADERS = ['request_order_line_source_id', 'request_order_line_id', 'request_order_id', 'sku', 'request_allocation_draft_id'];
var LINE_HEADERS = ['request_order_line_id', 'request_order_id', 'sku', 'request_bucket', 'requested_qty'];
var ORDER_HEADERS = ['request_order_id', 'request_order_no', 'request_status'];
function buildDb(opts) {
  opts = opts || {}; var track = { writes: 0 };
  var flatRows = [];
  var target = opts.targetRow || draftRowObj();
  if (!opts.noTarget) { flatRows.push(toArr(target)); if (opts.duplicate) flatRows.push(toArr(draftRowObj({ request_allocation_draft_id: TARGET + '::DUP' }))); }
  for (var i = flatRows.length; i < (opts.canonCount === undefined ? 67 : opts.canonCount); i++) { flatRows.push(toArr(draftRowObj({ request_allocation_draft_id: 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=FILL-' + i, sku: 'FILL-' + i }))); }
  var lineRows = []; for (var L = 0; L < (opts.lineCount === undefined ? 65 : opts.lineCount); L++) lineRows.push(['L' + L]);
  var srcRows = opts.srcRows || [], roLineRows = opts.roLineRows || [], orderRows = opts.orderRows || [];
  var tabs = {};
  tabs[HDR] = mockSheet(HDR, V2, flatRows, track);
  tabs['request_order_allocation_draft_lines'] = mockSheet('request_order_allocation_draft_lines', ['request_allocation_line_id'], lineRows, track);
  tabs['request_order_line_sources'] = mockSheet('request_order_line_sources', SRC_HEADERS, srcRows, track);
  tabs['request_order_lines'] = mockSheet('request_order_lines', LINE_HEADERS, roLineRows, track);
  tabs['request_orders'] = mockSheet('request_orders', ORDER_HEADERS, orderRows, track);
  var ss = { getId: function () { return 'SS-LIVE'; }, getName: function () { return 'KM Ops DB'; }, getSheetByName: function (n) { return tabs[n] || null; } };
  var sb = { KMRDV2: KMRDV2, KMRDV2P: KMRDV2P, requestOrderDraftV2FlatCutoverEnabled_: function () { return true; }, PRODUCTION_DB_SPREADSHEET_ID_: 'SS-LIVE',
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } }, Utilities: { formatDate: function () { return '2026-08'; }, computeDigest: function () { return [0]; }, DigestAlgorithm: {}, Charset: {} }, Logger: { log: function () {} }, console: console };
  vm.createContext(sb); vm.runInContext(GSTEMP, sb, { filename: 'TEMP.gs' });
  return { sb: sb, track: track };
}

var fresh = buildDb();
var pf = fresh.sb.TEMP_R6A_PREFLIGHT_FLAT_DRAFT_LIFECYCLE();
eq(pf.verdict, 'READY_FOR_CONTROLLED_LIFECYCLE', 'preflight: a clean draft target → READY_FOR_CONTROLLED_LIFECYCLE');
eq([pf.canonical_row_count, pf.draft_line_row_count], [67, 65], 'preflight observes 67 canonical rows / 65 Draft Lines');
eq([pf.target_present, pf.target_count, pf.target_status], ['YES', 1, 'draft'], 'target present, unique, draft');
eq(pf.id_scope_agreement, 'YES', 'target id/cycle/scope fidelity confirmed');
eq([pf.safe_for_edit, pf.safe_for_partial_submit, pf.safe_for_full_submit], ['YES', 'YES', 'YES'], 'edit/partial/full safe (T1+T2 order_qty>0)');
eq([pf.safe_for_send, pf.already_sent], ['NO', 'NO'], 'Send NOT yet safe (no submitted tier); not already sent');
eq(pf.expected_send_downstream_deltas, { request_orders: 1, request_order_lines: 2, request_order_line_sources: 2 }, 'expected downstream deltas = 1 RO / 2 lines / 2 sources (T1,T2)');
eq([pf.existing_request_order_count, pf.existing_line_source_count], [0, 0], 'no existing downstream references');
eq(pf.R6A_ZERO_WRITE_CONFIRMED.slice(0, 3), 'YES', '20. zero-write proof');
eq(fresh.track.writes, 0, 'preflight performed ZERO writes');
ok(/DRAFT_LINE_DEPENDENCY_ZERO/.test(JSON.stringify(pf)) && pf.DRAFT_LINE_DEPENDENCY_ZERO.indexOf('YES') === 0, 'C. Draft-Line dependency zero');
ok(typeof pf.R6A_PREFLIGHT_CHECKSUM === 'string' && pf.R6A_PREFLIGHT_CHECKSUM.length === 8, '21. preflight checksum emitted');

section('B. preflight HALT/consumed/collision verdicts');
eq(buildDb({ noTarget: true }).sb.TEMP_R6A_PREFLIGHT_FLAT_DRAFT_LIFECYCLE().verdict, 'HALT', 'missing target → HALT');
eq(buildDb({ duplicate: true }).sb.TEMP_R6A_PREFLIGHT_FLAT_DRAFT_LIFECYCLE().verdict, 'DOWNSTREAM_COLLISION', 'duplicate active natural key → DOWNSTREAM_COLLISION');
eq(buildDb({ targetRow: draftRowObj({ status: 'submitted', t1_status: 'submitted', t2_status: 'submitted' }) }).sb.TEMP_R6A_PREFLIGHT_FLAT_DRAFT_LIFECYCLE().verdict, 'TARGET_ALREADY_CONSUMED', 'already-submitted target → TARGET_ALREADY_CONSUMED');
var sentDb = buildDb({ srcRows: [['SRC1', 'ROL1', 'RO1', 'CO1100-R', TARGET]], roLineRows: [['ROL1', 'RO1', 'CO1100-R', 'T1', 120]], orderRows: [['RO1', 'RO-0001', 'draft']] });
var pfSent = sentDb.sb.TEMP_R6A_PREFLIGHT_FLAT_DRAFT_LIFECYCLE();
eq([pfSent.verdict, pfSent.already_sent, pfSent.existing_request_order_count], ['DOWNSTREAM_COLLISION', 'YES', 1], '15. existing downstream lineage → collision + already_sent (fail closed for a new Send)');

section('B. staged validators (read-only, frozen target + lineage)');
eq(fresh.sb.TEMP_R6A_VALIDATE_AFTER_EDIT().verdict, 'STAGE_VALIDATED_EDIT', 'AFTER_EDIT validates an active draft target');
var partialDb = buildDb({ targetRow: draftRowObj({ status: 'partially_submitted', t1_status: 'submitted', t1_submitted_by: 'vic' }) });
eq(partialDb.sb.TEMP_R6A_VALIDATE_AFTER_PARTIAL_SUBMIT().verdict, 'STAGE_VALIDATED_PARTIAL_SUBMIT', 'AFTER_PARTIAL_SUBMIT validates one submitted tier + partially_submitted header');
var fullDb = buildDb({ targetRow: draftRowObj({ status: 'submitted', t1_status: 'submitted', t2_status: 'submitted' }) });
eq(fullDb.sb.TEMP_R6A_VALIDATE_AFTER_FULL_SUBMIT().verdict, 'STAGE_VALIDATED_FULL_SUBMIT', 'AFTER_FULL_SUBMIT validates submitted header + all submittable tiers submitted');
var sendTarget = draftRowObj({ status: 'submitted', t1_status: 'submitted', t2_status: 'submitted' });
var sendDb = buildDb({ targetRow: sendTarget, srcRows: [['S1', 'RL1', 'RO1', 'CO1100-R', TARGET], ['S2', 'RL2', 'RO1', 'CO1100-R', TARGET]], roLineRows: [['RL1', 'RO1', 'CO1100-R', 'T1', 120], ['RL2', 'RO1', 'CO1100-R', 'T2', 50]], orderRows: [['RO1', 'RO-1', 'draft']] });
eq(sendDb.sb.TEMP_R6A_VALIDATE_AFTER_SEND().verdict, 'STAGE_VALIDATED_SEND', '10/11. AFTER_SEND validates 1 RO / 2 lines / 2 sources matching the submitted tiers');
eq(sendDb.sb.TEMP_R6A_VALIDATE_RESEND_IDEMPOTENCY().verdict, 'STAGE_VALIDATED_RESEND', '12. RESEND validates exactly ONE RO, zero duplicates');
var dupSend = buildDb({ targetRow: sendTarget, srcRows: [['S1', 'RL1', 'RO1', 'CO1100-R', TARGET], ['S3', 'RL3', 'RO2', 'CO1100-R', TARGET]], roLineRows: [['RL1', 'RO1', 'x', 'T1', 120]], orderRows: [['RO1', 'RO-1', 'draft'], ['RO2', 'RO-2', 'draft']] });
eq(dupSend.sb.TEMP_R6A_VALIDATE_RESEND_IDEMPOTENCY().checks.no_duplicate_request_order, false, '12. a duplicate Request Order is detected (idempotency violation fails closed)');
eq(sendDb.track.writes, 0, 'all validators are read-only (zero writes)');

// ==========================================================================
section('C. SOURCE — lifecycle wiring is flat-V2 native with zero Draft-Line dependency');
ok(/rpoEditMonthlyFlatResult_\(body\)/.test(GS25) && /requestOrderDraftV2FlatCutoverEnabled_/.test(GS25), 'edit (25_) routes to the flat core under the cutover flag');
ok(/rpoSubmitMonthlyFlatResult_\(/.test(GS15) && /requestOrderDraftV2FlatCutoverEnabled_/.test(GS15), 'submit (15_) routes to the flat core under the cutover flag');
ok(/KMRDV2P\.editMonthlyFlat/.test(GS24) && /KMRDV2P\.submitMonthlyFlat/.test(GS24), '24_ flat cores delegate to KMRDV2P edit/submit');
// the flat WRITE SET is exactly the header table + run journal — never the retired Draft-Line table (positive proof;
// 24_ still contains the legacy line table name only for the flag=false rollback path, which never runs under cutover).
ok(/function rpoFlatTables_\(\) \{ return \[KMRDV2P\.HEADER_TABLE, KMPR\.RUN_JOURNAL_TABLE\]/.test(GS24), 'C. the flat write set = [HEADER_TABLE, RUN_JOURNAL] only (no Draft-Line table)');
var KMRDV2P_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-request-draft-v2-persistence.js'), 'utf8');
var KMRDV2P_CODE = KMRDV2P_SRC.split('\n').filter(function (ln) { return !/^\s*\/\//.test(ln); }).join('\n');   // strip comment lines
ok(!/request_order_allocation_draft_lines/.test(KMRDV2P_CODE), 'C. the flat persistence authority (KMRDV2P) has ZERO code reference to the Draft-Line table (only comments assert the exclusion)');
ok(/NEVER reads or writes request_order_allocation_draft_lines/.test(KMRDV2P_SRC), 'C. KMRDV2P documents the zero Draft-Line dependency explicitly');
ok(/MONTHLY_ORDER.*requestOrderDraftV2FlatCutoverEnabled_/.test(GS25), 'C. 25_ gates the flat edit path on MONTHLY_ORDER + the cutover flag');
ok(/requestOrderDraftV2FlatCutoverEnabled_\(\).*rpoSubmitMonthlyFlatResult_/.test(GS15), 'C. 15_ gates the flat submit path on the cutover flag (legacy line path only under flag=false rollback)');
var r6aBlock = GSTEMP.slice(GSTEMP.indexOf('F1-7N-FA-3C-DRAFT-MODEL-R6A'));
ok(/request_order_allocation_draft_lines/.test(r6aBlock) && /never request_order_allocation_draft_lines/.test(r6aBlock), 'C. preflight only names the Draft-Line table to assert zero dependency (never reads it)');
ok(!/\.setValues\(|\.appendRow\(|\.setNumberFormat\(|\.insertSheet\(|\.deleteRow\(|\.setName\(/.test(r6aBlock), 'C. R6A tooling performs no mutating sheet ops');

// ==========================================================================
console.log('\n' + '-'.repeat(40));
console.log('R6A FLAT LIFECYCLE PREFLIGHT (F1-7N-FA-3C-R6A): ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
