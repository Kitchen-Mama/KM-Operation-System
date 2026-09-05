// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A1 — LIVE READ CONTRACT + STAGE ACCOUNTING
// ----------------------------------------------------------------------------------------------------------------
// R4 SHIPPED A DIAGNOSTIC THAT COULD NOT SEE, AND A PARAMETER THAT NEVER ARRIVED. THE LIVE LOG SAID BOTH.
//
// First failure: request_count = 4, every named stage attempts = 0, first_attempt = getClientCapabilities
// succeeding in 3 768 ms — and then, from that empty set, the verdict COLD_START_OR_TRANSIENT_TIMEOUT. Four
// requests happened and the report placed none of them, because I mapped ACTION NAMES I HAD GUESSED: the
// transport records `inventoryReplenishment.workspace.get` and I wrote `getInventoryReplenishmentWorkspace`,
// which nothing emits. Unmatched samples were dropped silently, so "no request reached this stage" and "I do
// not recognise this action" produced the identical zero. A diagnostic that cannot fail is worse than none.
//
// Second success: server_execution_ms = 30833, tables_read = 21, rows_returned = 13107, recent_window = null.
// R4's projection never ran, because `buildInventoryReplenishmentRequestDTO` builds `payload: { include }` and
// discards every other field the caller passed. The page asked; the DTO dropped it; the server never saw it.
// And the falling row count proves nothing either way — 13 107 is simply how big this database is.
//
// THE COST IS PER-TABLE, NOT PER-ROW. Thirteen thousand rows do not take thirty-one seconds to serialize;
// twenty-one getDataRange().getValues() calls do. Trimming the response cannot reach that, so the workspace now
// accepts an explicit table subset, the carrier catalogue names its two tables instead of riding on the read
// the screen waits for, and the server times each sheet so the next live run names the expensive one.
//
// Run: node assets/tests/live-read-contract-and-stage-accounting-f1-7n-fc-1b-e3-r4-a1.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function ops(src) {
  return code(src).replace(/'(?:[^'\\\n]|\\.)*'/g, "''").replace(/"(?:[^"\\\n]|\\.)*"/g, '""');
}
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var s = src.indexOf('var ' + name + ' = ');
  if (s < 0) throw new Error('not found: var ' + name);
  var i = src.indexOf('=', s), d = 0, started = false;
  for (; i < src.length; i++) {
    var c = src[i];
    if (c === '[' || c === '{') { d++; started = true; }
    else if (c === ']' || c === '}') { d--; if (started && !d) return src.slice(s, i + 1) + ';'; }
    else if (c === ';' && !started) return src.slice(s, i + 1);
  }
  throw new Error('unbalanced var: ' + name);
}
function swap(src, find, repl) {
  var re = new RegExp(String(find).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\n/g, '\\r?\\n'));
  if (!re.test(src)) throw new Error('swap anchor not found: ' + String(find).slice(0, 90));
  return String(src).replace(re, repl);
}

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var G60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var HLTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var FOUND = read('assets/js/api/km-api-foundation.js');
var MREG = read('assets/js/core/method-registry.js');
var TEMP = read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs');
var INDEX = read('index.html');
var NL = PAGE.indexOf('\r\n') !== -1 ? '\r\n' : '\n';
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));

function gs60(src) {
  var sb = { console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object,
    Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, Error: Error,
    RegExp: RegExp, Boolean: Boolean };
  sb.global = sb;
  var c = vm.createContext(sb);
  vm.runInContext(src || G60, c, { filename: '60' });
  return c;
}
var C60 = gs60();
var H60 = vm.runInContext('handleInventoryReplenishmentWorkspaceGet_', C60);
function io60(reads, sizes) {
  var t = { v: 0 };
  return { now: function () { t.v += 100; return t.v; }, nextSeq: function () { return 1; },
    openTarget: function () { return {}; },
    readTable: function (ss, n) {
      if (reads) reads.push(n);
      var k = (sizes && sizes[n]) || 1, a = [];
      for (var i = 0; i < k; i++) a.push({ sku: 'S' + i, country: 'US', marketplace: 'Amazon' });
      return a;
    } };
}

// ================================================================================================================
section('§1 — THE DTO DROPPED IT. That is why the live server never applied a projection.');
// ================================================================================================================
var dtoSrc = extractFn(FOUND, 'buildInventoryReplenishmentRequestDTO');
ok(/params\.recentWindow === true/.test(dtoSrc), 'D1  the DTO now carries recentWindow through to the payload');
ok(/Array\.isArray\(params\.only\)/.test(dtoSrc), 'D1a and `only`, the table subset');
// PROVE it by BUILDING one, rather than by reading it.
var dtoFn = new Function('API_VERSION', 'makeRequestId', 'isObj',
  dtoSrc + NL + 'return buildInventoryReplenishmentRequestDTO;')(
  '1', function () { return 'REQ-1'; }, function (o) { return !!o && typeof o === 'object'; });
var dtoA = dtoFn({ include: { carrierPlanning: true } });
var dtoB = dtoFn({ include: { carrierPlanning: true }, recentWindow: true });
var dtoC = dtoFn({ include: { carrierPlanning: true }, recentWindow: true, only: ['carrier_lead_times', 'carrier_rate_cards'] });
eq(dtoA.payload.recentWindow, undefined, 'D2  a caller that does not ask still sends the pre-R4 payload exactly');
eq(dtoB.payload.recentWindow, true, 'D2a a caller that DOES ask now reaches the server (this is the R4 defect, fixed)');
eq(dtoC.payload.only, ['carrier_lead_times', 'carrier_rate_cards'], 'D2b and a table subset survives the DTO');
eq(dtoA.action, 'inventoryReplenishment.workspace.get', 'D3  the action name is the one the transport records');
// The PRE behaviour, so the defect is demonstrated and not merely described.
var dtoPre = new Function('API_VERSION', 'makeRequestId', 'isObj',
  "function b(params){params=params||{};return{apiVersion:API_VERSION,action:'inventoryReplenishment.workspace.get',"
  + "requestId:makeRequestId(params.requestId),payload:{include:Object.assign({summary:true},isObj(params.include)?params.include:{})}};}"
  + NL + 'return b;')('1', function () { return 'REQ-1'; }, function (o) { return !!o && typeof o === 'object'; });
eq(dtoPre({ include: {}, recentWindow: true }).payload.recentWindow, undefined,
  'D4  PRE (executed): R4\'s DTO silently discarded recentWindow — the page asked and the server never saw it');

// ================================================================================================================
section('§2 — THE SERVER ECHOES THE CONTRACT, so "asked" and "applied" can disagree visibly');
// ================================================================================================================
var e1 = H60({ payload: { include: { carrierPlanning: true } } }, io60());
var e2 = H60({ payload: { include: { carrierPlanning: true }, recentWindow: true } }, io60());
eq([e1.meta.recentWindowRequested, e1.meta.recentWindowApplied], [false, false], 'S1  not asked, not applied');
eq([e2.meta.recentWindowRequested, e2.meta.recentWindowApplied], [true, true], 'S1a asked, and applied');
ok(Object.prototype.hasOwnProperty.call(e1.meta, 'recentWindowRequested'),
  'S1b the REQUEST is echoed even when the answer is "nothing" — R4 reported only the RESULT, so "not asked"\n     and "asked but the field never arrived" produced the identical null');
ok(typeof e2.meta.openMs === 'number', 'S2  the spreadsheet OPEN is timed separately from the reads');
ok(Array.isArray(e2.meta.slowestTables) && e2.meta.slowestTables.length > 0,
  'S2a and each table is timed, so "which sheet costs 31 seconds" has an answer instead of a guess');
ok(e2.meta.slowestTables.every(function (t) { return t.table && typeof t.ms === 'number' && typeof t.rows === 'number'; }),
  'S2b each entry naming the table, its milliseconds and its rows');
ok(e2.meta.slowestTables.length <= 5, 'S2c capped at five — enough to decide, never a log of its own');

// ================================================================================================================
section('§3 — READ FEWER TABLES, not merely return fewer rows');
// ================================================================================================================
var rA = [], rB = [], rC = [], rD = [];
H60({ payload: { include: { carrierPlanning: true } } }, io60(rA));
H60({ payload: { recentWindow: true } }, io60(rB));
H60({ payload: { include: { carrierPlanning: true }, only: ['carrier_lead_times', 'carrier_rate_cards'] } }, io60(rC));
H60({ payload: { only: ['carrier_rate_cards'] } }, io60(rD));
eq(rA.length, 21, 'T1  today\'s default still reads twenty-one tables — the contract is unchanged for old callers');
eq(rB.length, 19, 'T2  the PRIMARY render reads nineteen: it no longer pays for carrier reference data');
eq(rC.sort(), ['carrier_lead_times', 'carrier_rate_cards'], 'T3  the CATALOGUE reads exactly two sheets, not twenty-one');
eq(rD.length, 0, 'T4  `only` cannot reach an include-gated table without the include — it narrows, it never widens');
ok(/only: \['carrier_lead_times', 'carrier_rate_cards'\]/.test(MREG), 'T5  the method registry names its two tables');
// ops() — the function's own COMMENT explains why the include was removed, and matching prose is how a probe
// reports a defect that is not there. The claim is about the CODE.
// R6-R2 RESTATEMENT: the claim is about the REQUEST, so it is asserted against the request. R6-R2 must name
// `include.carrierPlanning` inside this function in order to test whether the RESPONSE carried it (the
// adoption gate), so the word's presence in the body no longer distinguishes asking from checking.
var _payloadR6R2 = /var _wsPayload = \{[^}]*\};/.exec(ops(PAGE))[0];
eq(/carrierPlanning/.test(_payloadR6R2), false,
  'T6  and the read the SCREEN waits on no longer asks for the include at all');
eq(/getWorkspace\('inventoryReplenishment', \{ include/.test(ops(extractFn(PAGE, '_irWorkspaceRefresh_'))), false,
  'T6b nor does it pass an inline include object to the workspace call');
ok(/var _wsPayload = \{ recentWindow: true \};/.test(PAGE), 'T6a its payload is the bounded one, unconditionally');
// PURITY — four suites lift sirWorkspaceBuild_ by itself.
var lifted = new Function('SIR_WORKSPACE_TABLES_', 'sirWsStr_', 'sirCap_', 'SIR_WS_RECENT_WINDOW_', 'sirWsRecentWindow_',
  extractFn(G60, 'sirWorkspaceBuild_') + NL + 'return sirWorkspaceBuild_;')(
  vm.runInContext('SIR_WORKSPACE_TABLES_', C60), vm.runInContext('sirWsStr_', C60), vm.runInContext('sirCap_', C60),
  vm.runInContext('SIR_WS_RECENT_WINDOW_', C60), vm.runInContext('sirWsRecentWindow_', C60));
var liftedOut = lifted({ marketplaces: [{ marketplace_id: 'M1' }], carrier_rate_cards: [{ rateCardId: 'R1' }] },
  { only: ['marketplaces'] });
eq(Object.prototype.hasOwnProperty.call(liftedOut, 'carrier_rate_cards'), false,
  'T7  sirWorkspaceBuild_ honours `only` with NOTHING but its declared helpers in scope...');
eq(liftedOut.requestEcho.only, ['marketplaces'], 'T7a ...and echoes it');
// This is the regression that actually happened: it called a sibling helper and four suites died on a ReferenceError.
ok(!/sirWsOnlySet_|sirWsOnlyList_/.test(ops(extractFn(G60, 'sirWorkspaceBuild_'))),
  'T7b the builder calls NO sibling helper — it is documented PURE and four suites lift it alone');

// ================================================================================================================
section('§4 — THE STAGE REPORT: it classified one live request in four, then named a root cause anyway');
// ================================================================================================================
function stageReport(meta, metrics) {
  var win = { KM: { transport: { metrics: function () { return metrics; } } },
    IRReadTimeoutDiagnostic: { classify: function (samples) {
      var t = samples.filter(function (s) { return String(s.code || '') === 'REQUEST_TIMEOUT'; }).length;
      return { classification: t ? 'SUCCESS_AFTER_RETRY' : 'NO_TIMEOUT_OBSERVED', timeouts: t };
    } } };
  var src = [extractVar(PAGE, 'IR_READ_STAGES_'), extractVar(PAGE, 'IR_STAGE_IGNORED_ACTIONS_'),
    extractFn(PAGE, '_irReadStageReport_')].join(NL);
  return new Function('window', '_IR_BOOT_MS_', '_irLastReadMeta', src + NL + 'return _irReadStageReport_;')(
    win, Date.now() - 66208, meta)();
}
// THE LIVE FIRST_FAILURE, replayed with the real action names.
var LIVE_FIRST = { requests: 4, retries: 0, coalesced: 0, samples: [
  { action: 'getClientCapabilities', kind: 'read', code: null, phase: 'ok', ms: 3768 },
  { action: 'system.health', kind: 'read', code: null, phase: 'ok', ms: 4102 },
  { action: 'inventoryScope.registry.get', kind: 'read', code: null, phase: 'ok', ms: 2210 },
  { action: 'inventoryReplenishment.workspace.get', kind: 'read', code: 'REQUEST_TIMEOUT', phase: 'timeout', ms: 60000 } ] };
var rep1 = stageReport(null, LIVE_FIRST);
eq(rep1.classified_count, 4, 'M1  all four live requests are now placed into a stage');
eq(rep1.unclassified_requests, [], 'M1a none dropped');
eq(rep1.instrumentation_complete, true, 'M1b and the accounting balances');
var invStage = rep1.stages.filter(function (s) { return s.stage === 'inventory_workspace'; })[0];
eq(invStage.attempts, 1, 'M2  the timing-out request lands in a NAMED stage...');
eq(invStage.codes, ['REQUEST_TIMEOUT'], 'M2a ...carrying its code');
eq(invStage.elapsed_ms, [60000], 'M2b and its elapsed time — the 60 s bound, named at last');
eq(invStage.actions, ['inventoryReplenishment.workspace.get'], 'M2c and the action that did it');
// The map R4 shipped placed ONE of these four.
(function pre() {
  var old = [
    ['checkDeploymentContract', 'system.health', 'systemHealth'],
    ['getInventoryReplenishmentWorkspace', 'adaptInventoryReplenishmentWorkspace', 'loadOperationDb'],
    ['getInventoryReplenishmentGap', 'getGapJobStatus'],
    ['getShippingAllocationDraftWorkspace', 'getShippingAllocationDrafts'],
    ['getCarrierRateCards', 'getWarehouseAllocationConfig'] ];
  var placed = 0;
  LIVE_FIRST.samples.forEach(function (x) {
    if (old.some(function (a) { return a.indexOf(x.action) !== -1; })) placed++;
  });
  eq(placed, 1, 'M3  PRE (executed): R4\'s guessed map placed ONE of the four, which is why every inventory stage read 0');
})();
// An unknown action must be NAMED, and the classification withheld.
var rep2 = stageReport(null, { requests: 3, retries: 0, coalesced: 0, samples: [
  { action: 'system.health', kind: 'read', code: null, phase: 'ok', ms: 900 },
  { action: 'inventoryReplenishment.workspace.get', kind: 'read', code: null, phase: 'ok', ms: 30833 },
  { action: 'nobodyMappedThis.get', kind: 'read', code: null, phase: 'ok', ms: 4000 } ] });
eq(rep2.unclassified_requests.length, 1, 'M4  an unmapped action is COUNTED...');
eq(rep2.unclassified_requests[0].action, 'nobodyMappedThis.get', 'M4a ...and NAMED');
eq(rep2.instrumentation_complete, false, 'M4b the accounting does not balance');
eq(rep2.classification, 'INSTRUMENTATION_INCOMPLETE', 'M5  so NO root cause is offered — this is the whole fix');
ok(/nobodyMappedThis\.get/.test(rep2.classification_withheld || ''), 'M5a and it says which action it could not place');
ok(!/COLD_START/.test(rep2.classification), 'M5b never COLD_START_OR_TRANSIENT_TIMEOUT from an empty set again');
// A write is explicitly ignored, not unknown.
var rep3 = stageReport(null, { requests: 2, retries: 0, coalesced: 0, samples: [
  { action: 'inventoryReplenishment.workspace.get', kind: 'read', code: null, phase: 'ok', ms: 100 },
  { action: 'upsertShippingAllocationDraftAtomic', kind: 'write', code: null, phase: 'ok', ms: 1200 } ] });
eq([rep3.classified_count, rep3.ignored_count, rep3.unclassified_requests.length], [1, 1, 0],
  'M6  a write action is EXPLICITLY ignored, so the accounting still balances');
eq(rep3.instrumentation_complete, true, 'M6a and a real classification is available again');
// Every stage the round names must exist in the map.
var mapSrc = extractVar(PAGE, 'IR_READ_STAGES_');
['deployment_contract', 'scope_registry', 'inventory_workspace', 'recommendation_read',
 'allocation_hydration', 'carrier_authorities'].forEach(function (st, i) {
  ok(mapSrc.indexOf("stage: '" + st + "'") !== -1, 'M7.' + (i + 1) + ' the map declares ' + st);
});
// And every mapped action must be one the code actually emits.
['system.health', 'getClientCapabilities', 'inventoryScope.registry.get',
 'inventoryReplenishment.workspace.get', 'recommendation.workspace.get'].forEach(function (a, i) {
  var emitted = FOUND.indexOf("'" + a + "'") !== -1 || read('assets/js/api/operation-system-db-api.js').indexOf("'" + a + "'") !== -1
    || read('assets/js/api/km-transport.js').indexOf("'" + a + "'") !== -1;
  ok(mapSrc.indexOf("'" + a + "'") !== -1 && emitted,
    'M8.' + (i + 1) + ' ' + a + ' is mapped AND is a name the shipped code actually emits');
});
// The live SECOND_SUCCESS, with the echo R4 lacked.
var rep4 = stageReport({ server_execution_ms: 30833, tables_read: 21, rows_returned: 13107,
  recent_window_requested: true, recent_window_applied: false, only_requested: null, open_ms: 1120,
  slowest_tables: [{ table: 'amazon_daily_sales_snapshot', ms: 9800, rows: 4210 }] },
  { requests: 2, retries: 0, coalesced: 1, samples: [
    { action: 'system.health', kind: 'read', code: null, phase: 'ok', ms: 3100 },
    { action: 'inventoryReplenishment.workspace.get', kind: 'read', code: null, phase: 'ok', ms: 41200 } ] });
eq([rep4.recent_window_requested, rep4.recent_window_applied], [true, false],
  'M9  the R4 defect is now VISIBLE in the report: asked true, applied false');
eq(rep4.server_execution_ms, 30833, 'M9a beside the server\'s own execution time');
ok(Array.isArray(rep4.server_slowest_tables), 'M9b and the per-table timing that says where it went');

// ================================================================================================================
section('§5/§6 — THE CENSUS: the live run was an INVALID SCOPE, not an AI Plan finding');
// ================================================================================================================
ok(/SCOPE_INCOMPLETE: company, country and marketplace are all required/.test(TEMP),
  'C1  the census REFUSES an empty scope — the live blocker was correct behaviour, not a readiness result');
ok(/SCOPE_ALL_SITES_FORBIDDEN/.test(TEMP), 'C1a and it never runs ALL_SITES');
ok(/function RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R\(\)/.test(TEMP),
  'C2  §6 there is ONE fixed entry point, and it takes NO parameters');
ok(/TEMP_E3_FIXED_SCOPE_ = \{ company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'CO1100-R' \}/.test(TEMP),
  'C2a the scope is IN the function — nobody has to reconstruct an args schema in a console');
var wrap = extractFn(TEMP, 'RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R');
['scope', 'planning_cycle', 'read_only', 'flag_effective', 'db_writes', 'writer_constructed'].forEach(function (f, i) {
  ok(wrap.indexOf("'" + f + "'") !== -1, 'C3.' + (i + 1) + ' it prints ' + f + ' FIRST, before any read');
});
ok(wrap.indexOf("CENSUS_log_('scope'") < wrap.indexOf('TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3({'),
  'C3a and that header is printed BEFORE the harvest is called');
ok(/FIXED_SCOPE_ALTERED/.test(wrap), 'C4  it STOPS before harvest if any of the four values is edited');
ok(wrap.indexOf('FIXED_SCOPE_ALTERED') < wrap.indexOf('TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3({'),
  'C4a and that stop comes BEFORE the census call, not after it');
ok(!/(appendRow|setValue|setValues|deleteRow|insertRow)/.test(ops(wrap)), 'C5  the wrapper writes nothing');
ok(/company: S\.company, country: S\.country, marketplace: S\.marketplace, sku: S\.sku/.test(wrap),
  'C5a and passes the scope EXPLICITLY — nothing is defaulted, no first-SKU fallback');
// Execute the STOP path for real.
(function runStop() {
  var logs = [];
  var f = new Function('CENSUS_log_', 'CENSUS_str_', 'TEMP_E3_CENSUS_BUILD_', 'TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3',
    extractVar(TEMP, 'TEMP_E3_FIXED_SCOPE_').replace("'ResUS'", "'WRONG'") + '\n' + wrap
    + '\nreturn RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R;')(
    function (k, v) { logs.push(k + '=' + JSON.stringify(v)); },
    function (v) { return String(v == null ? '' : v).trim(); }, 'B',
    function () { throw new Error('THE CENSUS MUST NOT BE REACHED'); });
  var r = f();
  eq(r.verdict, 'STOP', 'C6  an altered scope STOPS (executed — the census itself throws if reached)');
  ok(/FIXED_SCOPE_ALTERED: company/.test(r.blockers[0]), 'C6a naming which value was altered');
  eq([r.read_only, r.db_writes, r.writer_constructed], [true, 0, false], 'C6b and still reports zero writes');
})();

// ================================================================================================================
section('§A — deployment identity: a stale 60_ must be a NAMED fault');
// ================================================================================================================
var sir = (G60.match(/SIR_BUILD_VERSION_ = '([^']+)'/) || [])[1];
var sirExp = (HLTH.match(/\{ file: '60_api_v1_inventory_replenishment_workspace\.gs',[^}]*expected: '([^']+)'/) || [])[1];
ok(!!sir, 'A1  60_ DECLARES a build for the first time');
eq(sir, sirExp, 'A1a and the manifest expects exactly it (' + sir + ')');
// R6-R5 RESTATEMENT. "Which is this round" was a true statement about R4-A1 and a false one about every round
// that legitimately edits 60_ afterwards — R6-R5 added the router-entry/stage evidence to this very handler and
// MUST move the stamp, or a stale deployment would become undetectable. The durable claim is that the stamp is
// a REGISTERED owner stamp and that the manifest agrees with it (A1a), which is what makes a stale 60_ a named
// fault rather than a silent one.
ok(RO.OWNER_STAMPS.indexOf(sir) !== -1, 'A1b and it is a registered owner stamp, so a stale 60_ is a NAMED fault');
ok(RO.OWNER_STAMPS.indexOf(sir) >= RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A1'),
  'A1c at least the round that introduced the declaration');
ok(RO.BUILD_STAMP_RE.test(sir), 'A2  the shared stamp validator accepts an A-series stamp...');
['F1-7N-FB-4G-A0-R1', 'F1-7N-FB-4G-A1-R1', 'F1-7N-FB-4G-A2-R3-R1'].forEach(function (st, i) {
  ok(RO.BUILD_STAMP_RE.test(st), 'A2.' + (i + 1) + ' ...and so does ' + st + ', which it had been rejecting all along');
});

// ================================================================================================================
section('§K — release identity');
// ================================================================================================================
// RESTATED (F1-7N-FC-1B-E3-R4-A2-R1): the TENTH consecutive round of pinning one's own token as "the current
// one", and the second I have written myself after correcting the previous nine. A floor states the durable
// claim: R4-A1 minted its token, it came after R4's, and the series has never moved behind it.
ok(RO.tokenIndex('fc1be3r4a1-livecontract-20260904') !== -1, 'K1  this round minted its own application token');
ok(RO.tokenIndex('fc1be3r4a1-livecontract-20260904') > RO.tokenIndex('fc1b-e3r4-scopedread-20260904'),
  'K1a strictly after R4\'s, which was PUBLISHED (origin/main carries 3b44cbd)');
ok(RO.tokenIndex(RO.currentAppToken()) >= RO.tokenIndex('fc1be3r4a1-livecontract-20260904'),
  'K1b and the series has not moved behind it (current: ' + RO.currentAppToken() + ')');
eq(RO.staleAppTokenRefs(INDEX).join(' | '), '', 'K2  nothing is left behind on a superseded token');
var IX = RO.parseIndexTokens(INDEX);
eq(IX['assets/js/api/km-api-foundation.js'], RO.currentAppToken(),
  'K3  km-api-foundation.js carries it — a cached copy keeps DROPPING recentWindow, which is the R4 defect');
eq(IX['assets/js/pages/inventory-replenishment.js'], RO.currentAppToken(),
  'K3a and the page, which carries the rebuilt stage report');
eq(IX[RO.METHOD_REGISTRY_FILE], RO.currentMethodRegistryToken(),
  'K4  method-registry.js rotates in its OWN family (' + RO.currentMethodRegistryToken() + ')');
ok(RO.methodRegistryTokenAtOrAfter(RO.currentMethodRegistryToken(), 'fb4ga1r1-method-registry-20260902'),
  'K4a at or after A1-R1\'s, in a family that now has a ledger instead of a literal in four suites');
eq(IX[RO.IR_CSS_FILE], RO.currentIrCssToken(), 'K5  the stylesheet did NOT change and stays on its own token');
ok(RO.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A1', 'F1-7N-FC-1B-E3-R4'), 'K6  the owner stamp is recorded, after R4\'s');

// ================================================================================================================
section('§H — the boundary this round must not have crossed');
// ================================================================================================================
ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false/.test(read('assets/specs/active/apps-script/00_config.gs')),
  'B1  the AI Plan flag is still FALSE');
ok(/TEMP_FCROLL_DRY_RUN\s*=\s*true/.test(read('assets/tools/apps-script-diagnostics/TEMP_FC_REGULAR_FORECAST_YEAR_ROLLOVER_2027.gs')),
  'B2  the rollover runner is still DRY_RUN');
['sirWsRecentWindow_', 'sirWsOnlyList_', 'sirWsOnlySet_', 'sirWorkspaceBuild_'].forEach(function (fn, i) {
  ok(!/(appendRow|setValue|setValues|deleteRow|insertRow)/.test(ops(extractFn(G60, fn))),
    'B3.' + (i + 1) + ' ' + fn + ' writes nothing');
});
ok(!/(appendRow|setValue|setValues)/.test(ops(extractFn(PAGE, '_irReadStageReport_'))),
  'B4  and the stage report is measurement only');
ok(!/setTimeout|fetch\(|KM\.DB\./.test(ops(extractFn(PAGE, '_irReadStageReport_'))),
  'B4a issuing no request, adding no retry, substituting no cache');

// ================================================================================================================
section('MUTATIONS');
// ================================================================================================================
mut('N1  the DTO drops recentWindow again (the exact R4 defect)', function () {
  var m = swap(FOUND, 'if (params.recentWindow === true) payload.recentWindow = true;', '');
  var f = new Function('API_VERSION', 'makeRequestId', 'isObj',
    extractFn(m, 'buildInventoryReplenishmentRequestDTO') + NL + 'return buildInventoryReplenishmentRequestDTO;')(
    '1', function () { return 'R'; }, function (o) { return !!o && typeof o === 'object'; });
  return f({ include: {}, recentWindow: true }).payload.recentWindow === undefined;
});
mut('N2  the DTO drops the table subset, so the catalogue reads all 21 again', function () {
  var m = swap(FOUND, 'if (Array.isArray(params.only) && params.only.length) {', 'if (false) {');
  var f = new Function('API_VERSION', 'makeRequestId', 'isObj',
    extractFn(m, 'buildInventoryReplenishmentRequestDTO') + NL + 'return buildInventoryReplenishmentRequestDTO;')(
    '1', function () { return 'R'; }, function (o) { return !!o && typeof o === 'object'; });
  return f({ only: ['carrier_rate_cards'] }).payload.only === undefined;
});
mut('N3  the server stops echoing the REQUEST, so asked-and-lost looks like never-asked', function () {
  var m = swap(G60, 'out.requestEcho = { recentWindow: (payload.recentWindow === true), only: null };',
    'out.requestEcho = { recentWindow: false, only: null };');
  var c = gs60(m);
  var e = vm.runInContext('handleInventoryReplenishmentWorkspaceGet_', c)(
    { payload: { recentWindow: true } }, io60());
  return e.meta.recentWindowRequested === false;
});
mut('N4  `only` is ignored, so the catalogue reads twenty-one tables again', function () {
  var m = swap(G60, '      if (onlySet && !onlySet[spec.name]) continue;           // §A1: an explicit subset was requested', '');
  var c = gs60(m), reads = [];
  vm.runInContext('handleInventoryReplenishmentWorkspaceGet_', c)(
    { payload: { include: { carrierPlanning: true }, only: ['carrier_rate_cards'] } }, io60(reads));
  return reads.length > 2;
});
mut('N5  `only` can reach an include-gated table WITHOUT the include', function () {
  var m = swap(G60, "      if (spec.include && !include[spec.include]) continue;   // F1-7J-A2: skip un-requested include tables (no read cost)", '');
  var c = gs60(m), reads = [];
  vm.runInContext('handleInventoryReplenishmentWorkspaceGet_', c)({ payload: { only: ['carrier_rate_cards'] } }, io60(reads));
  return reads.indexOf('carrier_rate_cards') !== -1;
});
mut('N6  the primary read goes back to carrying the carrier include', function () {
  var m = swap(PAGE, 'var _wsPayload = { recentWindow: true };',
    'var _wsPayload = { include: { carrierPlanning: true }, recentWindow: true };');
  // The MUTANT payload nests an object, so the extractor has to tolerate one level of braces — otherwise
  // it fails to match the very thing the mutation introduces, and the probe errors instead of catching it.
  function payloadOf(src) { return /var _wsPayload = \{(?:[^{}]|\{[^{}]*\})*\};/.exec(ops(src))[0]; }
  return !/carrierPlanning/.test(payloadOf(PAGE)) && /carrierPlanning/.test(payloadOf(m));
});
// N7 REPLACED. My first attempt dropped only the `unclassified_requests.push`, and the mutant survived —
// correctly — because the completeness test has a SECOND, independent guard: classified + ignored must also
// reach the transport's own request_count. Either one alone catches an unrecognised action, which is the
// property worth having and not a defect to assert. So this mutates BOTH, which is the realistic change:
// someone "simplifies" the accounting down to a single list check.
mut('N7  the accounting is reduced to one check, so an unrecognised action becomes invisible', function () {
  var m = swap(PAGE, "      out.unclassified_requests.push({ action: a || '(unnamed)', ms: Number(x.ms) || 0,",
    '      if (false) out.unclassified_requests.push({ action: a, ms: Number(x.ms) || 0,');
  m = swap(m, '      && (out.classified_count + out.ignored_count >= out.request_count);', '      && true;');
  var src = [extractVar(m, 'IR_READ_STAGES_'), extractVar(m, 'IR_STAGE_IGNORED_ACTIONS_'),
    extractFn(m, '_irReadStageReport_')].join(NL);
  var r = new Function('window', '_IR_BOOT_MS_', '_irLastReadMeta', src + NL + 'return _irReadStageReport_;')(
    { KM: { transport: { metrics: function () { return { requests: 1, samples: [
        { action: 'nobodyMappedThis.get', kind: 'read', ms: 4000 }] }; } } },
      IRReadTimeoutDiagnostic: { classify: function () { return { classification: 'NO_TIMEOUT_OBSERVED', timeouts: 0 }; } } },
    0, null)();
  return r.unclassified_requests.length === 0 && r.classification !== 'INSTRUMENTATION_INCOMPLETE';
});
// And each guard alone, so "defence in depth" is a measured claim rather than an excuse.
mut('N7a the LIST check alone still catches it (the count guard removed)', function () {
  var m = swap(PAGE, '      && (out.classified_count + out.ignored_count >= out.request_count);', '      && true;');
  var src = [extractVar(m, 'IR_READ_STAGES_'), extractVar(m, 'IR_STAGE_IGNORED_ACTIONS_'),
    extractFn(m, '_irReadStageReport_')].join(NL);
  var r = new Function('window', '_IR_BOOT_MS_', '_irLastReadMeta', src + NL + 'return _irReadStageReport_;')(
    { KM: { transport: { metrics: function () { return { requests: 1, samples: [
      { action: 'nobodyMappedThis.get', kind: 'read', ms: 4000 }] }; } } } }, 0, null)();
  return r.classification === 'INSTRUMENTATION_INCOMPLETE';   // still caught
});
mut('N8  a classification is offered even when the accounting does not balance', function () {
  var m = swap(PAGE, "    if (!out.instrumentation_complete) {\r\n      out.classification = 'INSTRUMENTATION_INCOMPLETE';", "    if (false) {\r\n      out.classification = 'INSTRUMENTATION_INCOMPLETE';");
  var src = [extractVar(m, 'IR_READ_STAGES_'), extractVar(m, 'IR_STAGE_IGNORED_ACTIONS_'),
    extractFn(m, '_irReadStageReport_')].join(NL);
  var r = new Function('window', '_IR_BOOT_MS_', '_irLastReadMeta', src + NL + 'return _irReadStageReport_;')(
    { KM: { transport: { metrics: function () { return { requests: 1, samples: [
        { action: 'nobodyMappedThis.get', kind: 'read', ms: 4000 }] }; } } },
      IRReadTimeoutDiagnostic: { classify: function () { return { classification: 'NO_TIMEOUT_OBSERVED', timeouts: 0 }; } } },
    0, null)();
  return r.classification === 'NO_TIMEOUT_OBSERVED' && r.unclassified_requests.length > 0;
});
mut('N9  the stage map goes back to the guessed action names', function () {
  var m = swap(PAGE, "{ stage: 'inventory_workspace', actions: ['inventoryReplenishment.workspace.get'] }",
    "{ stage: 'inventory_workspace', actions: ['getInventoryReplenishmentWorkspace'] }");
  var src = [extractVar(m, 'IR_READ_STAGES_'), extractVar(m, 'IR_STAGE_IGNORED_ACTIONS_'),
    extractFn(m, '_irReadStageReport_')].join(NL);
  var r = new Function('window', '_IR_BOOT_MS_', '_irLastReadMeta', src + NL + 'return _irReadStageReport_;')(
    { KM: { transport: { metrics: function () { return LIVE_FIRST; } } } }, 0, null)();
  return r.classification === 'INSTRUMENTATION_INCOMPLETE';
});
mut('N10 the fixed-scope census stops asserting its scope, so an edit censuses another site', function () {
  var m = swap(TEMP, "  if (bad.length) {", "  if (false) {");
  return /if \(bad\.length\) \{/.test(TEMP) && !/if \(bad\.length\) \{/.test(m);
});
mut('N11 the census wrapper stops passing the scope explicitly', function () {
  var m = swap(TEMP, 'company: S.company, country: S.country, marketplace: S.marketplace, sku: S.sku', '');
  return !/company: S\.company/.test(extractFn(m, 'RUN_E3_CENSUS_RESUS_US_AMAZON_CO1100R'));
});
mut('N12 60_ ships at a build its manifest does not expect', function () {
  var m = swap(HLTH, "expected: '" + sirExp + "', owns: 'the inventory workspace read",
    "expected: 'F1-7N-FC-1B-E3-R4', owns: 'the inventory workspace read");
  var e = (m.match(/\{ file: '60_api_v1_inventory_replenishment_workspace\.gs',[^}]*expected: '([^']+)'/) || [])[1];
  return e !== sir;
});
mut('N13 the AI Plan flag is turned on', function () {
  var CFG = read('assets/specs/active/apps-script/00_config.gs');
  var m = swap(CFG, 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false', 'INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true');
  return /ENABLED_ = false/.test(CFG) && /ENABLED_ = true/.test(m);
});
mut('N14 km-api-foundation.js is left behind on a superseded token', function () {
  var m = swap(INDEX, 'km-api-foundation.js?v=' + RO.currentAppToken(),
    'km-api-foundation.js?v=fc1b-e3r4-scopedread-20260904');
  return RO.staleAppTokenRefs(INDEX).length === 0 && RO.staleAppTokenRefs(m).length > 0;
});
mut('N15 the per-table timing is removed, so "which sheet" has no answer again', function () {
  var m = swap(G60, 'tableMs[spec.name] = io.now() - tT;', '');
  var c = gs60(m);
  var e = vm.runInContext('handleInventoryReplenishmentWorkspaceGet_', c)({ payload: {} }, io60());
  return (e.meta.slowestTables || []).length === 0;
});

console.log('\n----------------------------------------');
console.log('LIVE READ CONTRACT + STAGE ACCOUNTING (F1-7N-FC-1B-E3-R4-A1): ' + pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
process.exit(fail ? 1 : 0);
