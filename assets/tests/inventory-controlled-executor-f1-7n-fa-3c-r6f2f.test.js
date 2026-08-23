// F1-7N-FA-3C-DRAFT-MODEL-R6F2F-P0-CONTROLLED-EXECUTOR — zero-arg one-shot executor for the persisted frozen JP plan.
//   A  loads the stored token + calls the REAL production K2 generator (no second engine).
//   B  ordered pre-write gates; flag FIRST → CONTROLLED_EXECUTION_REFUSED_FLAG_DISABLED with zero work.
//   C  payload built ONLY from the stored token; exact scope / no widening.
//   D  single execution; a committed state → CONTROLLED_EXECUTION_ALREADY_COMMITTED (retry-safe).
//   F  post-write readback fail-closed → COMMITTED_UNVERIFIED, never auto-retry.
//   G  separate REUSE verifier requires the exact committed state first.
// Loads the ACTUAL .gs in a vm sandbox; pure gate evaluator is exercised exhaustively.
// Run: node assets/tests/inventory-controlled-executor-f1-7n-fa-3c-r6f2f.test.js
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var TEMP = read('specs/active/apps-script/TEMP_migrate_request_order_draft_v2.gs');
var pass = 0, fail = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { ok(a === b, l + '  (got ' + JSON.stringify(a) + ' exp ' + JSON.stringify(b) + ')'); }
function section(n) { console.log('\n== ' + n + ' =='); }
function fnSlice(name, endName) { var a = TEMP.indexOf('function ' + name); var b = endName ? TEMP.indexOf('function ' + endName) : TEMP.length; return TEMP.slice(a, b); }

function makeSandbox(opts) {
  opts = opts || {};
  var logs = [], props = opts.props || {}, setCalls = 0;
  var sheets = opts.sheets || null;
  var ss = {
    getSheetByName: function (n) { if (sheets && sheets[n]) { var m = sheets[n]; return { getDataRange: function () { return { getValues: function () { return m; } }; } }; } return null; },
    getId: function () { return 'MOCK'; }, getSpreadsheetTimeZone: function () { return 'Asia/Taipei'; }
  };
  var sandbox = {
    Logger: { log: function (m) { logs.push(String(m)); } },
    SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; }, openById: function () { return ss; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function (k) { return props[k] || null; }, setProperty: function (k, v) { setCalls++; props[k] = v; }, deleteProperty: function (k) { delete props[k]; } }; } },
    Utilities: { computeDigest: function () { return [0]; }, DigestAlgorithm: { MD5: 'MD5' }, Charset: { UTF_8: 'UTF_8' } },
    JSON: JSON, Math: Math, String: String, Number: Number, Array: Array, Object: Object, Date: Date, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, RegExp: RegExp
  };
  if (opts.flagTrue) sandbox.inventoryAiPlanDbGenerationEnabled_ = function () { return true; };
  sandbox.global = sandbox; vm.createContext(sandbox);
  vm.runInContext(TEMP, sandbox, { filename: 'TEMP.gs' });
  return { s: sandbox, logs: logs, props: props, setCalls: function () { return setCalls; } };
}
var S = makeSandbox().s;

// a fully-clean gate bag (flag on, everything aligned) — override to inject one drift at a time
function bag(over) {
  var b = { flag_false: true, token_present: true, token_struct_ok: true, token_struct_reason: null, scope_exact: true, cycle_exact: true,
    gap_done: true, gap_fp_match: true, freeze_reproduces: true, pre_rows_exact: true, expected_absent: true, no_unexpected_in_scope: true,
    unrelated_match: true, legacy_match: true, schema_ok: true, dup_k2_zero: true, preflight_clean_555: true, selected_conservation_ok: true, scoped_all_zero: true };
  if (over) Object.keys(over).forEach(function (k) { b[k] = over[k]; }); return b;
}

// =====================================================================================================
section('B — ordered pre-write gate evaluator (exhaustive typed refusals)');
eq(S.TEMP_r6f2fEvaluateGates_(bag()).ok, true, 'G0 all gates aligned (flag false + internal authority) → ok');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ flag_false: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_FLAG_ENABLED', 'G1 flag ENABLED refused FIRST (controlled path is flag-false only)');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ token_present: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_NO_FROZEN_SCOPE_STORED', 'G2 missing token refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ token_struct_ok: false, token_struct_reason: 'FROZEN_TOKEN_INTEGRITY_FAILED' })).reason, 'CONTROLLED_EXECUTION_REFUSED_TOKEN_FROZEN_TOKEN_INTEGRITY_FAILED', 'G3 tampered token refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ scope_exact: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_SCOPE_INVALID', 'G4 wrong scope refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ cycle_exact: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_CYCLE_DRIFT', 'G5 cycle drift refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ gap_done: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_GAP_NOT_DONE', 'G6 GAP not DONE refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ gap_fp_match: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_GAP_FINGERPRINT_DRIFT', 'G7 GAP fingerprint drift refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ freeze_reproduces: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_FREEZE_CHECKSUM_DRIFT', 'G8 freeze checksum drift refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ pre_rows_exact: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_PREROW_DRIFT', 'G9 pre-row drift refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ expected_absent: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_EXPECTED_ROWS_PRESENT', 'G10 expected rows present refused (first-run)');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ no_unexpected_in_scope: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_UNEXPECTED_IN_SCOPE', 'G11 unexpected in scope refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ unrelated_match: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_UNRELATED_CHECKSUM_DRIFT', 'G12 unrelated checksum drift refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ legacy_match: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_LEGACY_CHECKSUM_DRIFT', 'G13 legacy checksum drift refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ schema_ok: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_SCHEMA_NOT_EXACT_30', 'G14 schema drift refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ dup_k2_zero: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_DUPLICATE_ACTIVE_K2', 'G15 duplicate K2 refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ preflight_clean_555: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_PREFLIGHT_NOT_CLEAN', 'G16 preflight not 5/5/5 refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ selected_conservation_ok: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_SELECTED_SCOPE_CONSERVATION_FAILED', 'G17 selected conservation false refused');
eq(S.TEMP_r6f2fEvaluateGates_(bag({ scoped_all_zero: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_SCOPED_PARITY_OR_BLOCK_NONZERO', 'G18 scoped parity/block nonzero refused');
// flag precedence: flag disabled beats every other drift
eq(S.TEMP_r6f2fEvaluateGates_(bag({ flag_false: false, scope_exact: false, freeze_reproduces: false })).reason, 'CONTROLLED_EXECUTION_REFUSED_FLAG_ENABLED', 'G19 flag-enabled takes precedence over all other drift');

// =====================================================================================================
section('B — runtime: flag-false controlled path proceeds past GATE 0; flag-enabled refuses; zero writes');
// flag ENABLED → controlled path refuses (use normal production); zero work
var rfEnabled = makeSandbox({ flagTrue: true });
var execEnabled = rfEnabled.s.TEMP_R6F2F_EXECUTE_FROZEN_INVENTORY_AI_PLAN_ONCE();
eq(execEnabled.verdict, 'CONTROLLED_EXECUTION_REFUSED_FLAG_ENABLED', 'B0 flag ENABLED → CONTROLLED_EXECUTION_REFUSED_FLAG_ENABLED (never flips the flag)');
eq(execEnabled.generation_called, false, 'B0b flag-enabled refusal → no production call');
eq(rfEnabled.setCalls(), 0, 'B0c flag-enabled refusal → zero writes');
// flag FALSE, no token → passes GATE 0, refuses at token load (controlled path is available, but nothing to run)
var rf = makeSandbox();   // no inventoryAiPlanDbGenerationEnabled_ defined → flag false; no stored token
var exec = rf.s.TEMP_R6F2F_EXECUTE_FROZEN_INVENTORY_AI_PLAN_ONCE();
eq(exec.global_flag_is_false, true, 'B1 GATE 0 confirms the global flag is false (controlled path proceeds)');
eq(exec.verdict, 'CONTROLLED_EXECUTION_REFUSED_NO_FROZEN_SCOPE_STORED', 'B1b flag false + no token → refuses at token load');
eq(exec.generation_called, false, 'B2 no production generation call');
eq(rf.setCalls(), 0, 'B3 zero Script Property writes');
eq(rf.logs.length, 1, 'B4 one compact primary log');
ok(rf.logs[0].indexOf('R6F2F_CONTROLLED_EXECUTION ') === 0, 'B5 primary log is R6F2F_CONTROLLED_EXECUTION');

// =====================================================================================================
section('D — ALREADY_COMMITTED: the exact frozen 1+5 state present → no regenerate/mutate (retry-safe)');
var TOKEN = { token_version: 'R6F2E-TOKEN-1', frozen: true, freeze_version: 'R6F2E-FREEZE-1', scope: { company: 'ResTW', country: 'JP', marketplace: 'Amazon' },
  planning_cycle: 'RECO-2026-08', calculation_run_id_fingerprint: 'len28:GAP-…0001:h9fe21969', freeze_checksum: 'e626e368',
  expected_k2_header_count: 1, expected_k2_line_count: 5, expected_header_ids_sorted: ['SADH-K2-7F15DD7D'],
  expected_line_ids_sorted: ['SADL-K2-25BAA672', 'SADL-K2-434B65FA', 'SADL-K2-477B4D96', 'SADL-K2-4ED9AD78', 'SADL-K2-A9F07664'],
  pre_run_db_header_rows: 2, pre_run_db_line_rows: 0, expected_post_run_db_header_rows: 3, expected_post_run_db_line_rows: 5,
  unrelated_scope_active_row_checksum: '62b84b14', legacy_header_checksum: '8a51b860',
  groups: [{ expected_header_id: 'SADH-K2-7F15DD7D', expected_line_ids: ['SADL-K2-25BAA672', 'SADL-K2-434B65FA', 'SADL-K2-477B4D96', 'SADL-K2-4ED9AD78', 'SADL-K2-A9F07664'] }] };
TOKEN.token_integrity_checksum = S.TEMP_r6f2eTokenIntegrity_(TOKEN);   // valid integrity so REUSE/gate reaches state checks
var Hhdr = ['allocation_draft_id', 'company', 'country', 'marketplace', 'planning_cycle', 'status'];
var Hrows = [Hhdr, ['SADH-K2-7F15DD7D', 'ResTW', 'JP', 'Amazon', 'RECO-2026-08', 'draft']];
var Lhdr = ['allocation_draft_line_id', 'allocation_draft_id'];
var Lrows = [Lhdr].concat(TOKEN.expected_line_ids_sorted.map(function (id) { return [id, 'SADH-K2-7F15DD7D']; }));
var ac = makeSandbox({ sheets: { shipping_allocation_drafts: Hrows, shipping_allocation_draft_lines: Lrows }, props: { R6F2E_CONTROLLED_FROZEN_SCOPE_V1: JSON.stringify(TOKEN) } });   // flag false (controlled path)
var acOut = ac.s.TEMP_R6F2F_EXECUTE_FROZEN_INVENTORY_AI_PLAN_ONCE();
eq(acOut.verdict, 'CONTROLLED_EXECUTION_ALREADY_COMMITTED', 'D1 committed 1+5 state → CONTROLLED_EXECUTION_ALREADY_COMMITTED');
eq(acOut.generation_called, false, 'D2 ALREADY_COMMITTED performs no production call');
eq(ac.setCalls(), 0, 'D3 ALREADY_COMMITTED performs zero writes');
ok(/VERIFY_FROZEN_INVENTORY_AI_PLAN_REUSE/.test(acOut.note || ''), 'D4 ALREADY_COMMITTED instructs the REUSE verifier');

// =====================================================================================================
section('A/C/D/F — executor source contracts (real engine, token-only payload, single call, readback)');
var execFn = fnSlice('TEMP_R6F2F_EXECUTE_FROZEN_INVENTORY_AI_PLAN_ONCE', 'TEMP_R6F2F_VERIFY_FROZEN_INVENTORY_AI_PLAN_REUSE');
var genFn = fnSlice('TEMP_r6f2fRunProductionGeneration_', 'TEMP_R6F2F_EXECUTE_FROZEN_INVENTORY_AI_PLAN_ONCE');
ok(/weeklyAiPlanGenerateK2_\(ss, mapped\.request, h, deps,/.test(genFn), 'A1 calls the REAL production K2 generator weeklyAiPlanGenerateK2_');
ok((genFn.match(/weeklyAiPlanGenerateK2_\(/g) || []).length === 1, 'A2 exactly ONE production generation call');
ok(!/buildK2GenerationPlan|handleUpsertShippingAllocationDraftAtomic_\(/.test(genFn), 'A3 no second engine (no direct KMWRR/atomic re-implementation in the executor)');
ok(/businessScope: \{ company: sc\.company, country: sc\.country, marketplace: sc\.marketplace/.test(genFn) && /mapped\.request\.businessScope\.marketplace = sc\.marketplace/.test(genFn), 'C1 payload scope built ONLY from the stored token (sc = token.scope); marketplace-exact');
ok(!/body\.marketplace|currentMarketplace|pageState/i.test(genFn), 'C2 no page-state / caller marketplace param');
ok(/CONTROLLED_EXECUTION_HALT_SCOPE_WIDENED/.test(execFn) && /applied_equals_requested === 'YES'/.test(execFn) && /requested_scope\.marketplace === token\.scope\.marketplace/.test(execFn), 'C3 exact-scope / no-widening guard on the production response');
ok(/CONTROLLED_INVENTORY_AI_PLAN_COMMITTED/.test(execFn) && /COMMITTED_UNVERIFIED/.test(execFn) && /fullyVerified \?/.test(execFn), 'F1 verdict is CONTROLLED_INVENTORY_AI_PLAN_COMMITTED else COMMITTED_UNVERIFIED (fail-closed, no auto-retry)');
ok(/readback\.db_header_rows === token\.expected_post_run_db_header_rows/.test(execFn) && /readback\.db_line_rows === token\.expected_post_run_db_line_rows/.test(execFn) && /line_fk_ok/.test(execFn) && /unrelated_checksum_unchanged/.test(execFn) && /legacy_checksum_unchanged/.test(execFn), 'F2 success requires exact +1/+5 rows + FK + unchanged unrelated/legacy checksums');
ok(/route_complete/.test(execFn) && /lineage_ok/.test(execFn) && /editable_draft/.test(execFn), 'F3 readback checks route-complete + frozen lineage + editable-draft status');
ok(/NO shipping_plans \/ shipment draft \/ reservation \/ Submit/.test(execFn), 'F4 executor declares NO shipping_plans/shipment/reservation/Submit write');
ok(!/shipping_plans|createShipment|reservation|Submit/i.test(genFn), 'F5 the production-call helper touches no shipment/reservation/submit table');

// =====================================================================================================
section('G — REUSE verifier: separate entrypoint; requires committed state; 0/0 REUSE');
ok(/function TEMP_R6F2F_VERIFY_FROZEN_INVENTORY_AI_PLAN_REUSE\(\)/.test(TEMP), 'G20 separate zero-arg REUSE verifier present');
var reuseFn = fnSlice('TEMP_R6F2F_VERIFY_FROZEN_INVENTORY_AI_PLAN_REUSE', null);
ok(/REUSE_REFUSED_FLAG_ENABLED/.test(reuseFn) && /REUSE_REFUSED_NOT_COMMITTED/.test(reuseFn), 'G21 REUSE refuses when flag enabled / not already committed (never a first CREATE)');
ok(/\(post\.db_header_rows - before\.headers\) === 0 && \(post\.db_line_rows - before\.lines\) === 0/.test(reuseFn) && /'REUSED'/.test(reuseFn), 'G22 REUSE expects 0/0 delta → REUSED');
ok(/weeklyAiPlanGenerateK2_/.test(TEMP.slice(TEMP.indexOf('function TEMP_r6f2fRunProductionGeneration_'))), 'G23 REUSE uses the SAME real production path (deterministic-id REUSE)');
// runtime: REUSE refuses when nothing committed (empty DB, flag on)
var ru = makeSandbox({ props: { R6F2E_CONTROLLED_FROZEN_SCOPE_V1: JSON.stringify(TOKEN) } });   // flag false (controlled REUSE path)
var ruOut = ru.s.TEMP_R6F2F_VERIFY_FROZEN_INVENTORY_AI_PLAN_REUSE();
eq(ruOut.verdict, 'REUSE_REFUSED_NOT_COMMITTED', 'G24 REUSE (flag false) with no committed rows → REUSE_REFUSED_NOT_COMMITTED (no production call)');
eq(ruOut.generation_called, false, 'G25 REUSE refusal performs no production call');

// =====================================================================================================
section('regression — no flag flip; flag gate is first in both entrypoints');
ok(!/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*true|inventoryAiPlanDbGenerationEnabled_\s*=\s*function/.test(TEMP), 'R1 no flag flip / no flag redefinition in TEMP tooling');
ok(/if \(flagEnabled === true\) \{ out\.verdict = 'CONTROLLED_EXECUTION_REFUSED_FLAG_ENABLED'/.test(execFn), 'R2 executor checks the flag FIRST — refuses when ENABLED (controlled path requires flag false; never flips it)');
ok(/mint\(\{ freeze_checksum: token\.freeze_checksum/.test(TEMP) && /weeklyAiPlanGenerateK2_\(ss, mapped\.request, h, deps, \{ company: sc\.company, country: sc\.country, marketplace: sc\.marketplace \}, cap\)/.test(TEMP), 'R3 executor mints the INTERNAL capability from the token and passes it as the dedicated arg (never via request/body)');

console.log('\n----------------------------------------');
console.log('R6F2F CONTROLLED EXECUTOR: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
