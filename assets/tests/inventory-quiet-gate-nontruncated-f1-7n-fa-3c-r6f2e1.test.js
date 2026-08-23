// F1-7N-FA-3C-DRAFT-MODEL-R6F2E1-QUIET-GATE — make the R6F2E compact gate/freeze operationally non-truncated.
//   A  ONE canonical preflight calc, quiet-capable; verbose vs quiet return byte-identical objects, differ only by log.
//   B  gate summary emits exactly one primary R6F2E_GATE_SUMMARY (no nested R6F2_PREFLIGHT / R6F2C_DIAGNOSE log).
//   C  compact parity evidence — one entry, five fingerprinted exclusions, no carrier tables.
//   D  quiet freeze — compact envelope is the FIRST log, evidence chunks after; drift still refused.
//   E  persist/validate emit their own compact primary first; read-only freeze never writes a Script Property.
// Runtime proof loads the ACTUAL .gs in a vm sandbox with mock SpreadsheetApp/Logger/PropertiesService (repo pattern);
// with the cross-file KMxx globals absent the calc degrades identically in both modes — exactly what the proof needs.
// Run: node assets/tests/inventory-quiet-gate-nontruncated-f1-7n-fa-3c-r6f2e1.test.js
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('fn not found: ' + name);
  var i = src.indexOf('{', start), depth = 0, end = -1;
  for (var j = i; j < src.length; j++) { var ch = src[j]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) { end = j; break; } } }
  return src.slice(start, end + 1);
}

// ---- vm sandbox with a Logger spy + inert SpreadsheetApp/PropertiesService ---------------------------------------
function makeSandbox() {
  var logs = [], props = {}, setCalls = 0, delCalls = 0;
  var sheetNull = { getSheetByName: function () { return null; }, getId: function () { return 'MOCK_SS'; }, getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; }, getDataRange: function () { return { getValues: function () { return []; } }; } };
  var sandbox = {
    Logger: { log: function (m) { logs.push(String(m)); } },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return sheetNull; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { setCalls++; props[k] = v; }, deleteProperty: function (k) { delCalls++; delete props[k]; } }; } },
    Utilities: { computeDigest: function () { return [0]; }, DigestAlgorithm: { MD5: 'MD5' }, Charset: { UTF_8: 'UTF_8' } },
    JSON: JSON, Math: Math, String: String, Number: Number, Array: Array, Object: Object, Date: Date, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp
  };
  sandbox.global = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(TEMP, sandbox, { filename: 'TEMP_migrate_request_order_draft_v2.gs' });
  return { sandbox: sandbox, logs: logs, setCalls: function () { return setCalls; }, delCalls: function () { return delCalls; } };
}

// =====================================================================================================
section('A — canonical preflight quiet vs verbose: byte-identical result, differ only by the R6F2_PREFLIGHT log');
var pf = makeSandbox();
var verbose = pf.sandbox.TEMP_r6f2ePreflightCore_({ quiet: false });
var verboseLogCount = pf.logs.length;
var verbosePreflightLogs = pf.logs.filter(function (m) { return m.indexOf('R6F2_PREFLIGHT ') === 0; }).length;
var pf2 = makeSandbox();
var quiet = pf2.sandbox.TEMP_r6f2ePreflightCore_({ quiet: true });
var quietPreflightLogs = pf2.logs.filter(function (m) { return m.indexOf('R6F2_PREFLIGHT ') === 0; }).length;
eq(verbosePreflightLogs, 1, 'A1 verbose preflight logs exactly one R6F2_PREFLIGHT entry');
eq(quietPreflightLogs, 0, 'A2 quiet preflight logs ZERO R6F2_PREFLIGHT entries');
// gate-relevant keys byte-identical
var REL = ['verdict', 'header_schema_exact_30', 'line_schema_exact_30', 'duplicate_active_k2_group_count', 'empty_header_classification_checksum', 'inventory_flag_remains_false', 'authority_blockers'];
var vSub = {}, qSub = {}; REL.forEach(function (k) { vSub[k] = verbose[k]; qSub[k] = quiet[k]; });
eq(JSON.stringify(qSub), JSON.stringify(vSub), 'A3 quiet/verbose preflight gate-relevant results are byte-identical');
eq(JSON.stringify(quiet.dry_assembly), JSON.stringify(verbose.dry_assembly), 'A4 quiet/verbose dry-assembly (parity/clean-scope/ids/conservation/conflicts) byte-identical');
eq(JSON.stringify(pf.sandbox.TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY().verdict), JSON.stringify(verbose.verdict), 'A5 public preflight delegates to the same core');

// =====================================================================================================
section('B — gate summary emits exactly ONE primary log, no nested verbose preflight/diagnostic');
var gb = makeSandbox();
var gate = gb.sandbox.TEMP_R6F2E_SUMMARIZE_CONTROLLED_INVENTORY_GATE();
eq(gb.logs.length, 1, 'B1 gate summary emits exactly ONE Logger entry');
ok(gb.logs[0].indexOf('R6F2E_GATE_SUMMARY ') === 0, 'B2 the one entry is the primary R6F2E_GATE_SUMMARY');
ok(gb.logs.filter(function (m) { return m.indexOf('R6F2_PREFLIGHT ') === 0 || m.indexOf('R6F2C_DIAGNOSE ') === 0; }).length === 0, 'B3 no nested verbose R6F2_PREFLIGHT / R6F2C_DIAGNOSE log');
eq(gate.output_contract, 'ONE_PRIMARY_LOG_ENTRY', 'B4 gate declares output_contract=ONE_PRIMARY_LOG_ENTRY');
eq(gate.nested_verbose_logs_suppressed, 'YES', 'B5 gate declares nested_verbose_logs_suppressed=YES');
eq(gb.setCalls(), 0, 'B6 gate summary performs ZERO Script Property writes');
ok(gate.summary && 'may_freeze' in gate.summary && gate.summary.may_enable_flag === false, 'B7 gate carries may_freeze + may_enable_flag=false');
ok('legacy_header_checksum' in gate.summary && 'parity_exclusion_reasons' in gate.summary, 'B8 gate carries legacy checksum + parity exclusion reasons');

// =====================================================================================================
section('C — compact parity evidence: one entry, exclusions surfaced, no carrier tables');
var pe = makeSandbox();
var pev = pe.sandbox.TEMP_R6F2E_SUMMARIZE_PARITY_EVIDENCE();
eq(pe.logs.length, 1, 'C1 parity evidence emits exactly ONE Logger entry');
ok(pe.logs[0].indexOf('R6F2E_PARITY_EVIDENCE ') === 0, 'C2 the one entry is R6F2E_PARITY_EVIDENCE');
ok(pe.logs.filter(function (m) { return m.indexOf('R6F2C_DIAGNOSE ') === 0; }).length === 0, 'C3 no nested verbose R6F2C_DIAGNOSE log');
ok(pev.evidence && 'exclusions' in pev.evidence && 'exclusion_reason_counts' in pev.evidence && 'resolved_lane_mismatches' in pev.evidence, 'C4 parity evidence surfaces exclusions + reasons + resolved-lane mismatches');
ok(!/method_raw_tokens_from_cards_CLEARTEXT|active_cards_by_origin_dest_country/.test(pe.logs[0]), 'C5 parity evidence does NOT dump carrier tables');
ok(/PARITY_EVIDENCE_RECONCILED/.test(TEMP), 'C6 the reconciled verdict token exists');
// live-shape proxy for "exactly five exclusions": the population classifier marks exactly the 5 multi-pool lines N/A
var membership = eval('(function(){ var TEMP_R6F2E_SRC_BLOCKS_={ROUTE_SOURCE_UNKNOWN:1,ROUTE_SOURCE_INACTIVE:1,ROUTE_SOURCE_MULTI_POOL_UNRESOLVED:1}; var TEMP_R6F2E_DST_BLOCKS_={DESTINATION_MISSING:1,DESTINATION_UNKNOWN:1,DESTINATION_INACTIVE:1}; return ' + extractFn(TEMP, 'TEMP_r6f2eParityMembership_') + '; })()');
var synthetic = ['ROUTE_SOURCE_MULTI_POOL_UNRESOLVED', 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED', 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED', 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED', 'ROUTE_SOURCE_MULTI_POOL_UNRESOLVED', '', '', ''];
var excl = synthetic.filter(function (b) { return !membership(b).eligible; });
eq(excl.length, 5, 'C7 exactly the 5 multi-pool lines are excluded (population proxy); the 3 resolved lanes are eligible');

// =====================================================================================================
section('D — quiet freeze: envelope-first ordering (source) + drift refusal (runtime) + no nested verbose');
var freezeFn = extractFn(TEMP, 'TEMP_R6F2E_FREEZE_SELECTED_CONTROLLED_INVENTORY_SCOPE');
var iEnv = freezeFn.indexOf("Logger.log('R6F2E_FREEZE_ENVELOPE");
var iEvi = freezeFn.indexOf("Logger.log('R6F2E_FREEZE_EVIDENCE");
ok(iEnv > 0 && iEvi > iEnv, 'D1 the compact envelope is logged BEFORE the numbered evidence chunks');
ok(/if \(!quiet\) \{[\s\S]*R6F2E_FREEZE_ENVELOPE[\s\S]*R6F2E_FREEZE_EVIDENCE/.test(freezeFn), 'D2 envelope + chunks are both gated behind !quiet (internal callers stay silent)');
ok(/output_contract: 'ENVELOPE_FIRST_THEN_NUMBERED_CHUNKS'/.test(freezeFn), 'D3 freeze declares ENVELOPE_FIRST_THEN_NUMBERED_CHUNKS');
ok(/TEMP_r6f2ePreflightCore_\(\{ quiet: true \}\)/.test(freezeFn) && /TEMP_r6f2eFreezeCore_\([\s\S]*\{ quiet: true \}\)/.test(freezeFn), 'D4 freeze uses the QUIET preflight + freeze cores');
ok(!/setValue|setValues|appendRow|deleteRow|handleUpsertShippingAllocationDraftAtomic_|setProperty/.test(freezeFn), 'D5 freeze performs ZERO writes');
// runtime: empty mocks → no clean JP scope → drift refusal, exactly one refusal log, no nested verbose
var fz = makeSandbox();
var fr = fz.sandbox.TEMP_R6F2E_FREEZE_SELECTED_CONTROLLED_INVENTORY_SCOPE();
eq(fr.verdict, 'FREEZE_REFUSED_LIVE_DRIFT', 'D6 freeze refuses when the live scope is not the exact clean JP scope');
eq(fz.setCalls(), 0, 'D7 freeze runtime performs ZERO Script Property writes');
ok(fz.logs.filter(function (m) { return m.indexOf('R6F2_PREFLIGHT ') === 0 || m.indexOf('R6F2D_FREEZE ') === 0; }).length === 0, 'D8 no nested verbose preflight/canonical-freeze log during the freeze');
// internal quiet call logs nothing
var fzq = makeSandbox();
fzq.sandbox.TEMP_R6F2E_FREEZE_SELECTED_CONTROLLED_INVENTORY_SCOPE({ quiet: true });
eq(fzq.logs.length, 0, 'D9 internal quiet freeze logs nothing (persist calls it silently)');

// =====================================================================================================
section('E — persist/validate/clear: own compact primary; read-only freeze never writes a property');
var dr = makeSandbox();
var dryOut = dr.sandbox.TEMP_R6F2E_PERSIST_FROZEN_SCOPE_DRY_RUN();
eq(dr.setCalls(), 0, 'E1 DRY_RUN writes ZERO Script Properties');
ok(dr.logs.filter(function (m) { return m.indexOf('R6F2E_PERSIST_DRY_RUN ') === 0; }).length === 1, 'E2 DRY_RUN emits its own R6F2E_PERSIST_DRY_RUN primary');
ok(dr.logs.filter(function (m) { return m.indexOf('R6F2E_FREEZE_ENVELOPE ') === 0 || m.indexOf('R6F2_PREFLIGHT ') === 0; }).length === 0, 'E3 DRY_RUN emits no nested envelope/preflight log');
var cm = makeSandbox();
var commitOut = cm.sandbox.TEMP_R6F2E_PERSIST_FROZEN_SCOPE_COMMIT();
eq(cm.setCalls(), 0, 'E4 COMMIT refuses (confirmation/drift) → ZERO writes with the shipped placeholder');
ok(/COMMIT_REFUSED_/.test(commitOut.verdict), 'E5 COMMIT verdict is a refusal (confirmation/flag/freeze gate unchanged)');
var vs = makeSandbox();
var valOut = vs.sandbox.TEMP_R6F2E_VALIDATE_CONTROLLED_SCOPE_FROM_STORE();
eq(valOut.verdict, 'NO_FROZEN_SCOPE_STORED', 'E6 validator reports NO_FROZEN_SCOPE_STORED before any token exists');
ok(vs.logs.filter(function (m) { return m.indexOf('R6F2_VALIDATE_PACKAGE ') === 0; }).length === 0, 'E7 no nested verbose R6F2_VALIDATE_PACKAGE log');
var cl = makeSandbox();
var clr = cl.sandbox.TEMP_R6F2E_CLEAR_CONTROLLED_FROZEN_SCOPE();
eq(clr.verdict, 'CLEARED', 'E8 cleanup returns CLEARED');
// confirmation gate unchanged: placeholder constant still present
ok(/TEMP_R6F2E_CONFIRMED_FREEZE_CHECKSUM_ = 'e626e368'/.test(TEMP), 'E9 the checksum-confirmation gate constant is set to the USER-confirmed freeze checksum (R6F2E4)');

// =====================================================================================================
section('regression — no generation call, no flag flip, quiet cores are pure log-gating');
ok(!/inventoryAiPlanDbGenerationEnabled_\s*=\s*true|INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*true/.test(TEMP), 'R1 no flag flip in the TEMP tooling');
ok(!/weeklyAiPlanGenerateK2_\(|handleUpsertShippingAllocationDraftAtomic_\(/.test(TEMP), 'R2 no AI generation / atomic write call anywhere in the TEMP tooling');
// the quiet gate is a pure logging flag: exactly one Logger.log in the preflight core, gated by !(opts&&opts.quiet)
var preCore = extractFn(TEMP, 'TEMP_r6f2ePreflightCore_');
eq((preCore.match(/Logger\.log\(/g) || []).length, 1, 'R3 preflight core has exactly one Logger.log');
ok(/if \(!\(opts && opts\.quiet\)\) Logger\.log\('R6F2_PREFLIGHT/.test(preCore), 'R4 preflight core log is gated on !(opts&&opts.quiet) — result unaffected');

console.log('\n----------------------------------------');
console.log('R6F2E1 QUIET GATE / NON-TRUNCATED: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
