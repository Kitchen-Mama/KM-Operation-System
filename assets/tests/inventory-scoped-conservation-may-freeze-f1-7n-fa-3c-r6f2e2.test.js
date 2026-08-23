// F1-7N-FA-3C-DRAFT-MODEL-R6F2E2-SCOPED-CONSERVATION — separate global vs selected-scope conservation; prove the JP
// freeze gate + may_freeze use SELECTED-scope conservation (never global).
//   A  gate summary carries global_conservation_ok + selected_scope_conservation_ok + _source (exact mk.conserved).
//   B  may_freeze uses the selected-scope scoped gate; global false cannot block, global true cannot compensate.
//   C  freeze refuses selected conservation false/unavailable with SELECTED_SCOPE_CONSERVATION_FAILED.
//   D  compact output preserved (one primary log) + global_scope_has_unresolved_or_blocked_lines.
// Loads the ACTUAL .gs in a vm sandbox so the pure helpers run in-context with the real constants.
// Run: node assets/tests/inventory-scoped-conservation-may-freeze-f1-7n-fa-3c-r6f2e2.test.js
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
  return { s: sandbox, logs: logs, setCalls: function () { return setCalls; } };
}
var S = makeSandbox().s;
var EG = S.TEMP_r6f2eExpectedGate_();
var JP = { company: 'ResTW', country: 'JP', marketplace: 'Amazon' };
var CA = { company: 'ResTW', country: 'CA', marketplace: 'Amazon' };
// a clean scoped-checks object (every gate passes); override to inject drift
function checks(over) {
  var c = { planning_cycle: 'RECO-2026-08', positive: 5, ai_ranked: 5, fully_routed: 5, blocked_total: 0, parity_mismatch_total: 0,
    selected_scope_conservation_ok: true, over_allocation: 0, duplicate_ids: 0, projected_conflict: 0, header_schema_ok: true, line_schema_ok: true, flag_false: true, legacy_checksum: '8a51b860' };
  if (over) Object.keys(over).forEach(function (k) { c[k] = over[k]; }); return c;
}
var SCOPED = 'READY_FOR_SCOPED_CONTROLLED_INVENTORY_AI_PLAN';

// =====================================================================================================
section('B — may_freeze uses SELECTED-scope conservation, not global');
// (1) global false, selected true → may_freeze true if all other scoped gates pass. Global is not even an input.
ok(S.TEMP_r6f2eMayFreeze_(SCOPED, JP, checks({ selected_scope_conservation_ok: true }), EG) === true, 'E1 global=false/selected=true → may_freeze can be true (global not an input)');
// (2) global true, selected false → may_freeze false
ok(S.TEMP_r6f2eMayFreeze_(SCOPED, JP, checks({ selected_scope_conservation_ok: false }), EG) === false, 'E2 selected conservation false → may_freeze false (global true cannot compensate)');
// (3) selected conservation missing (null) → may_freeze false
ok(S.TEMP_r6f2eMayFreeze_(SCOPED, JP, checks({ selected_scope_conservation_ok: null }), EG) === false, 'E3 selected conservation unavailable → may_freeze false');
// verdict / scope gating still required
ok(S.TEMP_r6f2eMayFreeze_('HALT', JP, checks(), EG) === false, 'E1b HALT verdict → may_freeze false');
ok(S.TEMP_r6f2eMayFreeze_(SCOPED, CA, checks(), EG) === false, 'E7 CA scope → may_freeze false (JP required)');

// =====================================================================================================
section('C — freeze gate typed refusal SELECTED_SCOPE_CONSERVATION_FAILED');
eq(S.TEMP_r6f2eFreezeGate_(JP, checks(), EG).verdict, 'CONTROLLED_SCOPE_FROZEN_READ_ONLY', 'E0 clean JP → frozen read-only');
ok(S.TEMP_r6f2eFreezeGate_(JP, checks({ selected_scope_conservation_ok: false }), EG).drift_reasons.indexOf('SELECTED_SCOPE_CONSERVATION_FAILED') >= 0, 'E4 freeze refuses selected conservation false');
ok(S.TEMP_r6f2eFreezeGate_(JP, checks({ selected_scope_conservation_ok: null }), EG).drift_reasons.indexOf('SELECTED_SCOPE_CONSERVATION_FAILED') >= 0, 'E5 freeze refuses selected conservation unavailable');
// the freeze gate never references a global conservation field
ok(!/checks\.global_conservation|checks\.conservation_ok\b/.test(TEMP.slice(TEMP.indexOf('function TEMP_r6f2eFreezeGate_'), TEMP.indexOf('function TEMP_r6f2eMayFreeze_'))), 'E4b freeze gate reads ONLY selected_scope_conservation_ok (never global)');

// =====================================================================================================
section('A/E6/E7 — selected scope obtained by EXACT company|country|marketplace; CA cannot substitute for JP');
var dry = { mk_scopes: [
  { company: 'ResTW', country: 'CA', marketplace: 'Amazon', conserved: true, positive: 28, ai_ranked: 28, fully_routed: 28, source_blocked: 0, dest_blocked: 0, no_method: 0, manual_only: 0, authority_required: 0, ai_pair_mismatch: 0, selected_route_invalid: 0, over_allocation: 0, dup_id: 0, projected_conflict: 0 },
  { company: 'ResTW', country: 'JP', marketplace: 'Amazon', conserved: false, positive: 5, ai_ranked: 5, fully_routed: 5, source_blocked: 0, dest_blocked: 0, no_method: 0, manual_only: 0, authority_required: 0, ai_pair_mismatch: 0, selected_route_invalid: 0, over_allocation: 0, dup_id: 0, projected_conflict: 0 }
] };
var mkJP = S.TEMP_r6f2eSelectedMkScope_(dry, JP);
eq(mkJP && mkJP.country, 'JP', 'E6 selector returns the EXACT JP marketplace scope');
eq(mkJP.conserved, false, 'E6b it reads JP conserved=false (CA conserved=true is NOT used)');
eq(S.TEMP_r6f2eSelectedMkScope_(dry, { company: 'ResTW', country: 'XX', marketplace: 'Amazon' }), null, 'E6c a non-matching scope returns null (no fallback)');
// scoped checks off the JP mk → conservation false → may_freeze false even though CA in the same dry is conserved
var pre = { header_schema_exact_30: 'YES', line_schema_exact_30: 'YES', inventory_flag_remains_false: 'YES', empty_header_classification_checksum: '8a51b860' };
var selJP = { company: 'ResTW', country: 'JP', marketplace: 'Amazon', planning_cycle: 'RECO-2026-08' };
var chkJP = S.TEMP_r6f2eScopedChecks_(pre, selJP, mkJP);
eq(chkJP.selected_scope_conservation_ok, false, 'E7b scoped checks off JP mk → selected_scope_conservation_ok=false');
ok(S.TEMP_r6f2eMayFreeze_(SCOPED, selJP, chkJP, EG) === false, 'E7c CA conserved=true cannot make the JP run freezable');
// a genuinely clean JP mk → conservation true
var mkClean = S.TEMP_r6f2eScopedChecks_(pre, selJP, { company: 'ResTW', country: 'JP', marketplace: 'Amazon', conserved: true, positive: 5, ai_ranked: 5, fully_routed: 5, source_blocked: 0, dest_blocked: 0, no_method: 0, manual_only: 0, authority_required: 0, ai_pair_mismatch: 0, selected_route_invalid: 0, over_allocation: 0, dup_id: 0, projected_conflict: 0 });
eq(mkClean.selected_scope_conservation_ok, true, 'E7d clean JP mk → selected_scope_conservation_ok=true');
ok(S.TEMP_r6f2eMayFreeze_(SCOPED, selJP, mkClean, EG) === true, 'E7e clean JP mk (global irrelevant) → may_freeze true');
// mk absent → scoped checks fail closed
eq(S.TEMP_r6f2eScopedChecks_(pre, JP, null).selected_scope_conservation_ok, null, 'E3b absent mk → selected_scope_conservation_ok=null (fail closed)');

// =====================================================================================================
section('A/D — gate summary: dual conservation authorities + compact one-primary-log + zero writes (runtime)');
var gb = makeSandbox();
var gate = gb.s.TEMP_R6F2E_SUMMARIZE_CONTROLLED_INVENTORY_GATE();
eq(gb.logs.length, 1, 'E9 gate summary still emits exactly ONE primary log');
ok(gb.logs[0].indexOf('R6F2E_GATE_SUMMARY ') === 0, 'E9b the one entry is R6F2E_GATE_SUMMARY');
eq(gb.setCalls(), 0, 'E10 gate summary performs ZERO Script Property writes');
var sm = gate.summary || {};
ok('global_conservation_ok' in sm && 'selected_scope_conservation_ok' in sm && 'selected_scope_conservation_source' in sm, 'A1 gate carries global + selected_scope conservation + source');
ok(sm.selected_scope_conservation_source.indexOf('dry_assembly.mk_scopes[ResTW|JP|Amazon].conserved') >= 0, 'A2 selected_scope_conservation_source names the exact mk path');
ok('global_scope_has_unresolved_or_blocked_lines' in sm && typeof sm.global_scope_has_unresolved_or_blocked_lines === 'boolean', 'D1 gate carries global_scope_has_unresolved_or_blocked_lines (boolean)');
ok('may_freeze' in sm && sm.may_enable_flag === false, 'B1 gate carries may_freeze + may_enable_flag=false');

// =====================================================================================================
section('source contracts — global blocked truthfully computed; freeze wrapper uses shared scoped checks');
ok(/var globalBlocked = \(\(g\.blocked_lines \|\| 0\) > 0\)/.test(TEMP) && /global_scope_has_unresolved_or_blocked_lines: globalBlocked/.test(TEMP), 'D2 global-blocked flag computed from real global blocked/unresolved counts');
ok(/global_conservation_ok: g\.conservation_ok === true/.test(TEMP), 'A3 global_conservation_ok is the untouched global calc');
var freezeFn = TEMP.slice(TEMP.indexOf('function TEMP_R6F2E_FREEZE_SELECTED_CONTROLLED_INVENTORY_SCOPE'), TEMP.indexOf('// ---- OBJECTIVE D'));
ok(/TEMP_r6f2eScopedChecks_\(pre, sel, mk\)/.test(freezeFn) && /TEMP_r6f2eSelectedMkScope_\(dry, e\)/.test(freezeFn), 'C1 freeze wrapper uses the SHARED selected-scope + scoped-checks helpers');
ok(/selected_scope_conservation_source/.test(freezeFn), 'C2 freeze reports the scoped-conservation source on refusal + envelope');
ok(!/setValue|appendRow|setProperty|handleUpsertShippingAllocationDraftAtomic_/.test(freezeFn), 'C3 freeze remains read-only (zero writes)');
ok(!/inventoryAiPlanDbGenerationEnabled_\s*=\s*true|INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*true/.test(TEMP), 'R1 no flag flip in the TEMP tooling');

console.log('\n----------------------------------------');
console.log('R6F2E2 SCOPED CONSERVATION / MAY_FREEZE: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
