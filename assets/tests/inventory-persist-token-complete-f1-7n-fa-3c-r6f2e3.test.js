// F1-7N-FA-3C-DRAFT-MODEL-R6F2E3-PERSIST-TOKEN-COMPLETE — complete the persisted controlled-scope freeze token.
//   A  the reduced token carries every field needed for post-generation validation (no sku/qty/pricing/cells).
//   B  one canonical serialization + token_integrity_checksum (separate from freeze_checksum); typed read failures.
//   C  DRY_RUN is zero-write, emits the complete token + integrity + expected +1/+5 deltas + DRY_RUN_READY.
//   D  COMMIT builds+validates the token, writes ONE property, reads back byte-equivalent → PERSISTED_FROZEN_SCOPE.
//   E  the stored token proves CREATE delta / unrelated + legacy checksum unchanged; pre-gen → RECONCILIATION_REQUIRED.
// Loads the ACTUAL .gs in a vm sandbox so the token helpers run in-context.
// Run: node assets/tests/inventory-persist-token-complete-f1-7n-fa-3c-r6f2e3.test.js
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }

function makeSandbox() {
  var logs = [], props = {}, setCalls = 0;
  var sheetNull = { getSheetByName: function () { return null; }, getId: function () { return 'MOCK'; }, getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; }, getDataRange: function () { return { getValues: function () { return []; } }; } };
  var sandbox = {
    Logger: { log: function (m) { logs.push(String(m)); } },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return sheetNull; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { setCalls++; props[k] = v; }, deleteProperty: function (k) { delete props[k]; } }; } },
    Utilities: { computeDigest: function () { return [0]; }, DigestAlgorithm: { MD5: 'MD5' }, Charset: { UTF_8: 'UTF_8' } },
    JSON: JSON, Math: Math, String: String, Number: Number, Array: Array, Object: Object, Date: Date, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp
  };
  sandbox.global = sandbox; vm.createContext(sandbox);
  vm.runInContext(TEMP, sandbox, { filename: 'TEMP.gs' });
  return { s: sandbox, logs: logs, props: props, setCalls: function () { return setCalls; } };
}
var H = makeSandbox(); var S = H.s;
// synthetic successful freeze result matching the live frozen evidence
var FR = { envelope: { verdict: 'CONTROLLED_SCOPE_FROZEN_READ_ONLY', freeze_version: 'R6F2E-FREEZE-1',
  requested_scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon' }, planning_cycle: 'RECO-2026-08',
  calculation_run_id_fingerprint: 'len28:GAP-…0001:h9fe21969', freeze_checksum: 'e626e368',
  expected_k2_header_count: 1, expected_k2_line_count: 5,
  expected_header_ids_sorted: ['SADH-K2-7F15DD7D'],
  expected_line_ids_sorted: ['SADL-K2-25BAA672', 'SADL-K2-434B65FA', 'SADL-K2-477B4D96', 'SADL-K2-4ED9AD78', 'SADL-K2-A9F07664'],
  pre_run_db_header_rows: 2, pre_run_db_line_rows: 0, unrelated_scope_active_row_checksum: '62b84b14', legacy_header_checksum: '8a51b860' },
  groups: [{ expected_header_id: 'SADH-K2-7F15DD7D', expected_line_ids: ['SADL-K2-25BAA672', 'SADL-K2-434B65FA', 'SADL-K2-477B4D96', 'SADL-K2-4ED9AD78', 'SADL-K2-A9F07664'] }] };
var EXP = { company: 'ResTW', country: 'JP', marketplace: 'Amazon' };
function clone(t) { return JSON.parse(JSON.stringify(t)); }
function reseal(t) { t.token_integrity_checksum = S.TEMP_r6f2eTokenIntegrity_(t); return t; }

// =====================================================================================================
section('A/B — complete token structure + canonical integrity');
var TOKEN = S.TEMP_r6f2eBuildFrozenToken_(FR);
var REQUIRED = ['token_version', 'frozen', 'freeze_version', 'scope', 'planning_cycle', 'calculation_run_id_fingerprint', 'freeze_checksum',
  'expected_k2_header_count', 'expected_k2_line_count', 'expected_header_ids_sorted', 'expected_line_ids_sorted',
  'pre_run_db_header_rows', 'pre_run_db_line_rows', 'expected_post_run_db_header_rows', 'expected_post_run_db_line_rows',
  'unrelated_scope_active_row_checksum', 'legacy_header_checksum', 'groups', 'token_integrity_checksum'];
ok(REQUIRED.every(function (k) { return TOKEN[k] !== undefined && TOKEN[k] !== null; }), 'A1 complete token carries every required field');
eq(S.TEMP_r6f2eValidateTokenStructure_(TOKEN, EXP).ok, true, 'A2 complete token passes structural validation');
// no forbidden business data
ok(!/"sku"|"quantity"|"recommended_qty"|"planned_qty"|"unit_rate"|"currency"/.test(JSON.stringify(TOKEN)), 'A3 token carries NO sku/qty/pricing/cell values');
eq(TOKEN.expected_post_run_db_header_rows, 3, 'B/8 expected post-run header rows = pre 2 + create 1 = 3');
eq(TOKEN.expected_post_run_db_line_rows, 5, 'B/8 expected post-run line rows = pre 0 + create 5 = 5');
eq(TOKEN.token_integrity_checksum, S.TEMP_r6f2eTokenIntegrity_(TOKEN), 'B1 integrity checksum reproduces from the canonical serialization');
ok(TOKEN.token_integrity_checksum !== TOKEN.freeze_checksum, 'B2 token_integrity_checksum is SEPARATE from freeze_checksum');

// =====================================================================================================
section('B — typed read failures (never silently repaired)');
// the OLD incomplete reduced shape
var OLD = { frozen: true, freeze_version: 'R6F2E-FREEZE-1', scope: EXP, scope_checksum: 'e626e368', groups: TOKEN.groups, lines: [] };
eq(S.TEMP_r6f2eValidateTokenStructure_(OLD, EXP).reason, 'FROZEN_TOKEN_INCOMPLETE', 'F1 the previous incomplete token is rejected');
// every required field removed one at a time
var allRejected = true, firstOk = null;
REQUIRED.forEach(function (k) { var t = clone(TOKEN); delete t[k]; var r = S.TEMP_r6f2eValidateTokenStructure_(t, EXP); if (r.ok || (r.reason !== 'FROZEN_TOKEN_INCOMPLETE' && r.reason !== 'FROZEN_TOKEN_INTEGRITY_FAILED')) { allRejected = false; if (!firstOk) firstOk = k + '→' + JSON.stringify(r); } });
ok(allRejected, 'F3 every required field removed one at a time is rejected  ' + (firstOk || ''));
// mutation → integrity failure (no reseal)
var mut = clone(TOKEN); mut.planning_cycle = 'RECO-2026-07';
eq(S.TEMP_r6f2eValidateTokenStructure_(mut, EXP).reason, 'FROZEN_TOKEN_INTEGRITY_FAILED', 'F4 any field mutation without reseal → integrity failure');
// duplicate id (resealed so integrity passes → duplicate is the surfaced failure)
var dup = clone(TOKEN); dup.expected_line_ids_sorted[1] = dup.expected_line_ids_sorted[0]; dup.groups[0].expected_line_ids[1] = dup.groups[0].expected_line_ids[0]; reseal(dup);
eq(S.TEMP_r6f2eValidateTokenStructure_(dup, EXP).reason, 'FROZEN_TOKEN_DUPLICATE_ID', 'F5 duplicate expected id rejected');
// count / cardinality mismatch (resealed)
var cnt = clone(TOKEN); cnt.expected_k2_line_count = 4; reseal(cnt);
eq(S.TEMP_r6f2eValidateTokenStructure_(cnt, EXP).reason, 'FROZEN_TOKEN_COUNT_MISMATCH', 'F6 count/ID-cardinality mismatch rejected');
// membership != flat line set (resealed)
var mem = clone(TOKEN); mem.groups[0].expected_line_ids.pop(); mem.groups[0].expected_line_ids.push('SADL-K2-DIFFERENT'); reseal(mem);
eq(S.TEMP_r6f2eValidateTokenStructure_(mem, EXP).reason, 'FROZEN_TOKEN_COUNT_MISMATCH', 'F6b header→line membership must equal the flat line set');
// wrong scope (resealed)
var sc = clone(TOKEN); sc.scope = { company: 'ResTW', country: 'CA', marketplace: 'Amazon' }; reseal(sc);
eq(S.TEMP_r6f2eValidateTokenStructure_(sc, EXP).reason, 'FROZEN_TOKEN_SCOPE_INVALID', 'F7 scope other than exact ResTW/JP/Amazon rejected');
// post-run delta tamper (resealed) → count mismatch
var pr = clone(TOKEN); pr.expected_post_run_db_header_rows = 9; reseal(pr);
eq(S.TEMP_r6f2eValidateTokenStructure_(pr, EXP).reason, 'FROZEN_TOKEN_COUNT_MISMATCH', 'F6c expected post-run delta must equal pre-run + create');

// =====================================================================================================
section('C — DRY_RUN: zero-write, complete token, integrity, +1/+5 deltas (runtime empty mocks → freeze refuses)');
var dr = makeSandbox();
var dryOut = dr.s.TEMP_R6F2E_PERSIST_FROZEN_SCOPE_DRY_RUN();
eq(dr.setCalls(), 0, 'C1 DRY_RUN writes ZERO Script Properties');
ok(dr.logs.length === 1 && dr.logs[0].indexOf('R6F2E_PERSIST_DRY_RUN ') === 0, 'C2 DRY_RUN emits one compact primary log');
ok(dr.logs.filter(function (m) { return m.indexOf('R6F2E_FREEZE_ENVELOPE ') === 0 || m.indexOf('R6F2_PREFLIGHT ') === 0; }).length === 0, 'C3 no nested envelope/preflight log');
// source contract for the compact fields (empty-mock live freeze refuses, so verify the code path emits them)
var dryFn = TEMP.slice(TEMP.indexOf('function TEMP_R6F2E_PERSIST_FROZEN_SCOPE_DRY_RUN'), TEMP.indexOf('function TEMP_R6F2E_PERSIST_FROZEN_SCOPE_COMMIT'));
ok(/would_store_token = token/.test(dryFn) && /token_integrity_checksum = token\.token_integrity_checksum/.test(dryFn) && /token_complete = struct\.ok/.test(dryFn), 'C4 DRY_RUN emits complete token + integrity + token_complete');
ok(/expected_post_run_deltas = \{ shipping_allocation_drafts: '\+' \+ token\.expected_k2_header_count, shipping_allocation_draft_lines: '\+' \+ token\.expected_k2_line_count \}/.test(dryFn), 'C5 DRY_RUN emits expected post-run deltas +1/+5');
ok(/freeze_checksum_to_confirm = fr\.envelope\.freeze_checksum/.test(dryFn), 'C6 DRY_RUN reports the LIVE freeze checksum truthfully (drift-safe)');

// =====================================================================================================
section('D — COMMIT: placeholder confirmation writes nothing; readback-verify contract');
var cm = makeSandbox();
var commitOut = cm.s.TEMP_R6F2E_PERSIST_FROZEN_SCOPE_COMMIT();
eq(cm.setCalls(), 0, 'D1 COMMIT with the shipped placeholder confirmation writes NOTHING');
ok(/COMMIT_REFUSED_/.test(commitOut.verdict), 'D2 COMMIT refuses (confirmation/flag/freeze gate unchanged)');
var commitFn = TEMP.slice(TEMP.indexOf('function TEMP_R6F2E_PERSIST_FROZEN_SCOPE_COMMIT'), TEMP.indexOf('function TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE'));
ok(/TEMP_r6f2eValidateTokenStructure_\(token, TEMP_R6F2E_EXPECTED_SCOPE_\)/.test(commitFn) && /COMMIT_REFUSED_TOKEN_/.test(commitFn), 'D3 COMMIT validates completeness/integrity BEFORE write');
ok(/getProperty\(TEMP_R6F2E_STORE_PROP_KEY_\)/.test(commitFn) && /readbackOk/.test(commitFn) && /COMMIT_REFUSED_READBACK_MISMATCH/.test(commitFn), 'D4 COMMIT reads back + verifies byte-equivalent canonical token');
ok(/out\.verdict = 'PERSISTED_FROZEN_SCOPE'/.test(commitFn), 'D5 COMMIT returns PERSISTED_FROZEN_SCOPE only after verified readback');
ok((commitFn.match(/setProperty\(/g) || []).length === 1, 'D6 COMMIT performs exactly ONE Script Property write');
ok(!/getRange|setValue|appendRow/.test(commitFn), 'D7 COMMIT writes no spreadsheet cells');
ok(/TEMP_R6F2E_CONFIRMED_FREEZE_CHECKSUM_ = 'e626e368'/.test(TEMP), 'D8 the confirmation constant is set to the USER-confirmed freeze checksum e626e368 (R6F2E4)');

// =====================================================================================================
section('E — VALIDATE from a stored COMPLETE token: structure ok, guards, pre-gen RECONCILIATION (no writes)');
var vs = makeSandbox();
vs.s.PropertiesService.getScriptProperties().setProperty(vs.s.TEMP_R6F2E_STORE_PROP_KEY_, JSON.stringify(TOKEN));
var before = vs.setCalls();
var valOut = vs.s.TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE();
eq(vs.setCalls() - before, 0, 'E1 VALIDATE performs ZERO Script Property writes');
eq(valOut.token_structure_ok, true, 'E2 stored complete token passes structure/integrity');
eq(valOut.scope_widening_possible, false, 'E3 validator cannot widen scope');
eq(valOut.verdict, 'RECONCILIATION_REQUIRED_PRE_GENERATION', 'E4 pre-generation (rows absent) → RECONCILIATION_REQUIRED_PRE_GENERATION, not corruption');
ok(valOut.expected_create_delta && valOut.expected_create_delta.shipping_allocation_drafts === '+1' && valOut.expected_create_delta.shipping_allocation_draft_lines === '+5', 'E5 validator reports the +1/+5 CREATE delta');
ok('unrelated_scope_checksum_match' in valOut && 'legacy_header_checksum_match' in valOut, 'E6 validator reports unrelated + legacy checksum match guards');
ok(valOut.frozen_lineage && valOut.frozen_lineage.planning_cycle === 'RECO-2026-08', 'E7 validator reports the frozen planning-cycle / calc-run lineage');
// a corrupt stored token → typed failure (never delegates to the DB validator, never repaired)
var vc = makeSandbox();
var bad = clone(TOKEN); bad.freeze_checksum = 'tampered';   // integrity now stale
vc.s.PropertiesService.getScriptProperties().setProperty(vc.s.TEMP_R6F2E_STORE_PROP_KEY_, JSON.stringify(bad));
var vcOut = vc.s.TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE();
eq(vcOut.verdict, 'FROZEN_TOKEN_INTEGRITY_FAILED', 'E8 a tampered stored token → FROZEN_TOKEN_INTEGRITY_FAILED (never silently repaired)');
ok(!('validation' in vcOut), 'E8b a structurally-invalid token never reaches the DB validator');
// unrelated-scope checksum drift surfaces as match=false
var vu = makeSandbox();
var drift = clone(TOKEN); drift.unrelated_scope_active_row_checksum = 'DRIFTED'; reseal(drift);
vu.s.PropertiesService.getScriptProperties().setProperty(vu.s.TEMP_R6F2E_STORE_PROP_KEY_, JSON.stringify(drift));
var vuOut = vu.s.TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE();
eq(vuOut.unrelated_scope_checksum_match, false, 'F/E9 unrelated-scope checksum drift is detected (match=false)');

// =====================================================================================================
section('regression — no generation / no flag flip anywhere');
ok(!/inventoryAiPlanDbGenerationEnabled_\s*=\s*true|INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*true|handleUpsertShippingAllocationDraftAtomic_\(/.test(TEMP), 'R1 no flag flip / no direct atomic-write call (the R6F2F controlled generation call is flag-gated)');

console.log('\n----------------------------------------');
console.log('R6F2E3 PERSIST TOKEN COMPLETE: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
