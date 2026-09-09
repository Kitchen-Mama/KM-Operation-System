// Kitchen Mama Operation System — F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R3
// NO_ACTION response contract + AI Plan frontend timeout repair.
// Run: node assets/tests/no-action-response-contract-and-ai-plan-timeout-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r3.test.js
//
// TWO MEASURED DEFECTS, and they had different causes even though they arrived in the same red toast.
//
//  1. THE TIMEOUT WAS A FALSE NEGATIVE. A controlled `weeklyAiPlan.generate` resolved at 60 990 ms with a
//     complete, correct AI_PLAN_NO_ACTION answer. The page had declared TIMEOUT at 60 000 ms — 990 ms early —
//     while the transport it sits on top of was still legitimately waiting (KM_WRITE_TIMEOUT_MS_ = 90 000, no
//     auto-retry). A client bound BELOW the transport's own bound can only ever convert the transport's careful
//     answer into a guess. §C proves the bound is now above it; §D and §E prove both outcomes on a
//     deterministic clock, without waiting a single real second.
//
//  2. THE `undefined` COUNTERS WERE NOT THE BACKEND. This is the part that had to be traced rather than
//     assumed. 61_'s NO_ACTION envelope has stated `created_headers: 0` and friends since R6-R7-R1, FLAT on
//     `data`, which is the canonical DTO location the shipped classifier reads. Two separate things then went
//     wrong: (a) the census capture snippet read the counters from `d.summary || d.counters || d.written`,
//     three sub-objects the contract does not have, so it recorded seven measured zeros as nulls; and (b) the
//     page's SYNTHETIC cls literals for TIMEOUT and FAILED never carried the counter keys at all, so the
//     renderer concatenated `undefined`. Exactly one counter was genuinely missing from the backend —
//     `reservations` — and that one is a real contract fix. §A proves the server sends numbers, §B proves
//     where, §F proves the UI never prints the word `undefined` again.
//
// §六 of the task allows defensive display but forbids a frontend fallback that MASKS a missing backend field.
// So §A/§B assert the SERVER, from the real production decision path, and §F asserts the UI separately. The
// renderer's coercion is a floor under a shape that is already correct, and N5 proves it is not load-bearing.

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, neg = { caught: 0, missed: 0 };
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

// ================================================================================================================
// THE WORLD IS LOADED FROM THE R6-R7-R3 MANIFEST SUITE, NOT COPIED — the rule every round since R2. A second
// copy of the fixtures would let two suites disagree about what production looks like, and this round's whole
// subject is two readers disagreeing about one contract.
// ================================================================================================================
var R3_OF = 'assets/tests/controlled-no-action-activation-manifest-f1-7n-fc-1b-e3-r4-a2-r1-r6-r7-r3.test.js';
var R3_SRC = read(R3_OF).replace(/\r\n/g, '\n');
var CUT = R3_SRC.indexOf("\nsection('A ");
if (CUT < 0) throw new Error('the R6-R7-R3 suite no longer opens its assertions with section()');
var SHARED = (new Function('require', '__dirname', '__filename', 'module', 'exports', 'console',
  R3_SRC.slice(0, CUT)
  + '\nreturn { World: World, failed: failed, swap: swap, extractFn: extractFn, extractVar: extractVar,'
  + ' extractStmt: extractStmt, CENSUS: CENSUS, live: live, projection: projection, NLF: NLF,'
  + ' W: W, runIt: runIt, readback: readback, freezeFrom: freezeFrom, auditSrc: auditSrc,'
  + ' DEPLOYMENT_BUILD: DEPLOYMENT_BUILD };'
))(require, __dirname, __filename, module, exports, { log: function () {}, error: function () {} });

var World = SHARED.World, failed = SHARED.failed, swap = SHARED.swap;
var extractFn = SHARED.extractFn, extractVar = SHARED.extractVar;
var CENSUS = SHARED.CENSUS, live = SHARED.live, NLF = SHARED.NLF;
var W = SHARED.W, runIt = SHARED.runIt, readback = SHARED.readback, freezeFrom = SHARED.freezeFrom;
var auditSrc = SHARED.auditSrc;

var G00 = read('assets/specs/active/apps-script/00_config.gs');
var G61 = read('assets/specs/active/apps-script/61_api_v1_weekly_ai_plan.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var PAGE = read('assets/js/pages/inventory-replenishment.js').replace(/\r\n/g, '\n');
var API = read('assets/js/api/operation-system-db-api.js').replace(/\r\n/g, '\n');
var RO = require('./_release-order.js');
var STAMP = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R3';

// The exact live measurement this round exists to make acceptable, and the one it must still refuse.
var MEASURED_RESOLVE_MS = 60990;
var OLD_BOUND_MS = 60000;

// ================================================================================================================
section('A — the backend NO_ACTION contract, taken from the real production decision path');
// ================================================================================================================
// NOT a hand-built decision object. `weeklyAiPlanControlledDecision_` is the function 61_'s public handler goes
// through, and `.response` is the envelope it hands back — so the zeros below are the ones a browser receives.
var DECIDE_SRC =
  '(function () {'
  + '  var cc = gapCalcResolveContext_("INVENTORY");'
  + '  var ss = SpreadsheetApp.openById(prodExpectedDbId_());'
  + '  var d = weeklyAiPlanControlledDecision_(ss, { company: "ResUS", country: "US",'
  + '    marketplace: "Amazon", planningCycle: cc && cc.ok ? cc.planningCycle : null }, "Amazon",'
  + '    cc && cc.ok ? cc.calculationDate : null);'
  + '  return JSON.stringify({ outcome: d.outcome, code: d.code, would_write: d.would_write,'
  + '    writer_reached: d.writer_reached, response: d.response || null });'
  + '})()';
var Aw = W(live());
var AENV = vm.runInContext(DECIDE_SRC, Aw.ctx);
// The same real path, against a MUTATED 61_. World's third argument is the module source, so a mutant is
// measured on the envelope a browser would receive rather than on the presence of a line of code.
function envelopeFrom(g61) {
  var w = new World(live(), undefined, g61);
  var r = JSON.parse(vm.runInContext(DECIDE_SRC, w.ctx));
  return (r.response && r.response.data) || {};
}
var A = JSON.parse(AENV);
var AD = (A.response && A.response.data) || {};

eq([A.outcome, A.code], ['AI_PLAN_NO_ACTION', 'NO_REPLENISHMENT_REQUIRED'],
  'A1  the production path answers AI_PLAN_NO_ACTION / NO_REPLENISHMENT_REQUIRED for this scope');
eq(A.response && A.response.success, true, 'A1a and it is a typed SUCCESS envelope, not a refusal');
eq([AD.outcome, AD.code, AD.no_action_reason, AD.recommendation_state],
  ['AI_PLAN_NO_ACTION', 'NO_REPLENISHMENT_REQUIRED', 'VALID_ZERO_RECOMMENDATION', 'VALID_ZERO_RECOMMENDATION'],
  'A2  the envelope names the outcome, the code and the reason, twice-stated as the task requires');

// EVERY COUNTER IS A NUMBER, AND THE NUMBER IS 0. Type is asserted separately from value on purpose: the whole
// defect was a field whose VALUE looked like "no" while its TYPE was "absent", and only one of those is a fact.
var COUNTERS = ['created_headers', 'created_lines', 'updated_headers', 'updated_lines',
  'cancelled_headers', 'cancelled_lines', 'reservations', 'db_writes'];
eq(COUNTERS.filter(function (k) { return typeof AD[k] !== 'number'; }), [],
  'A3  every mutation counter is of type number — not absent, not null, not a string');
eq(COUNTERS.map(function (k) { return AD[k]; }), [0, 0, 0, 0, 0, 0, 0, 0],
  'A3a and every one of them is 0');
eq(AD.writer_reached, false, 'A4  writer_reached is the boolean false');
eq(typeof AD.writer_reached, 'boolean', 'A4a and it is a boolean, not a falsy stand-in');
eq([AD.routes, AD.groups], [[], []], 'A5  routes and groups are empty arrays');
eq([AD.route_count, AD.allocated_qty], [0, 0], 'A5a with 0 routes and 0 allocated');

// THE THREE QUANTITIES. These are what make it an ANSWER rather than a shrug, and 520 is the number an
// operator can see on the screen — a message that contradicts it loses its credibility on every later run.
eq([AD.recommended_qty, AD.qualifying_planned_qty, AD.residual_qty], [0, 520, 0],
  'A6  recommended 0, already-planned 520, residual 0');
eq(['recommended_qty', 'qualifying_planned_qty', 'residual_qty']
  .filter(function (k) { return typeof AD[k] !== 'number'; }), [],
  'A6a all three are numbers');

// SERIALIZED. A number that becomes a string or vanishes on the way out is not a number the browser receives.
var AJSON = JSON.stringify(A.response);
eq(COUNTERS.filter(function (k) { return AJSON.indexOf('"' + k + '":0') === -1; }), [],
  'A7  and each one survives JSON.stringify as a bare 0 — no omission, no null, no quoted "0"');
ok(AJSON.indexOf('"reservations":0') !== -1,
  'A7a including `reservations`, the one counter the contract genuinely did not carry before this round');
ok(!/"(created_headers|reservations|db_writes)":\s*(null|"0")/.test(AJSON),
  'A7b and none of them serialize as null or as a quoted string');

// NOTHING WROTE. The envelope claiming zero writes and the sheets showing a write is the disagreement that
// matters most, and it is only detectable because both were read.
eq([A.would_write, A.writer_reached], [false, false], 'A8  the decision would not write and never reached a writer');
eq(Aw.dbWrites(), 0, 'A8a and zero cells were touched, measured on the sheets');

// ================================================================================================================
section('B — WHERE the counters live, which is the fact both readers depend on');
// ================================================================================================================
eq(['summary', 'counters', 'written'].filter(function (k) { return AD[k] !== undefined; }), [],
  'B1  the envelope has NO summary/counters/written sub-object — the place the capture snippet used to look');
eq(COUNTERS.filter(function (k) { return !Object.prototype.hasOwnProperty.call(AD, k); }), [],
  'B1a every counter is an own property of `data` itself');
var NO_ACT_FN = extractFn(G61, 'weeklyAiPlanNoActionResponse_');
ok(/created_headers: 0, updated_headers: 0, created_lines: 0, updated_lines: 0/.test(NO_ACT_FN),
  'B2  and the builder states them as literal zeros rather than computing them from a writer that never ran');
ok(/\n\s+reservations: 0,/.test(NO_ACT_FN), 'B2a with `reservations` among them');
ok(!/summary:\s*\{/.test(NO_ACT_FN), 'B2b and it declares no summary sub-object for a reader to be misled by');

// The census reader must now read the canonical location, and must SAY that it did.
var PICK = (CENSUS.match(/'  function pick\(res\) \{',[\s\S]*?counters_read_from: cSrc \}; \}',/) || [])[0] || '';
ok(PICK, 'B3  the capture snippet still has one `pick` sanitizer');
ok(/function c\(k\) \{/.test(PICK), 'B3a which resolves each counter through a single named accessor');
ok(/if \(d\[k\] !== undefined\)/.test(PICK) && PICK.indexOf('cSrc = "data"') !== -1,
  'B3b that reads the canonical flat `data` location FIRST');
eq((PICK.match(/n\(s\.[a-z_]+\)/g) || []), [],
  'B3c and no counter is read straight off the nested object any more');
ok(/counters_read_from: cSrc/.test(PICK),
  'B3d the reading records WHERE it came from — a number and its provenance are one fact');

// And the readback checks both the value and the provenance.
var RB = extractFn(CENSUS, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK');
ok(/A\.reservations === 0/.test(RB),
  'B4  the zero-counter gate now includes `reservations` — a field measured but never checked is not evidence');
ok(/the_actual_response_counters_came_from_the_canonical_dto/.test(RB),
  'B4a and a supplied provenance must say `data`');
ok(/A\.counters_read_from !== null && A\.counters_read_from !== undefined/.test(RB),
  'B4b checked only when present, so an audit captured before this round is not refused for not predicting it');

// ================================================================================================================
section('C — the timeout contract: a client bound must not sit below the transport bound');
// ================================================================================================================
var PAGE_MS = Number((PAGE.match(/var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = (\d+);/) || [])[1]);
var WRITE_MS = Number((API.match(/var KM_WRITE_TIMEOUT_MS_ = (\d+);/) || [])[1]);
ok(PAGE_MS > 0, 'C1  the page declares a named AI Plan client bound');
ok(WRITE_MS > 0, 'C1a and the transport declares its write bound');
// R6-R7-R4 - RE-AIMED. R6-R7-R4 gives weeklyAiPlan.generate its OWN transport bound, because a controlled
// run took 90 002 ms and the shared 90 s write bound cut it off while the database proved nothing was
// written. So the number the page has to clear is no longer KM_WRITE_TIMEOUT_MS_ - it is the bound the
// transport will ACTUALLY apply to this action. The pair equality is replaced by the relation it stood for,
// which is the thing that must hold in every later round too.
var ACTION_MS = Number((API.match(/'weeklyAiPlan\.generate': (\d+)/) || [])[1]) || WRITE_MS;
ok(ACTION_MS >= WRITE_MS,
  'C2  the per-action write bound is at least the shared one - a per-action entry may only WIDEN');
ok(PAGE_MS > ACTION_MS,
  'C2-r  and the page bound exceeds the bound the transport will actually apply to this action');
ok(PAGE_MS >= 120000, 'C2a at least the 120 000 ms the task asks for');
ok(PAGE_MS > WRITE_MS,
  'C3  THE RULE, not the number: the page bound EXCEEDS the transport bound, so the transport\'s own'
  + ' reconciliation-aware answer is what surfaces and this wrapper is only a backstop');
ok(PAGE_MS > MEASURED_RESOLVE_MS,
  'C4  and it exceeds the 60 990 ms answer this round was measured against');

// The call site carries the constant, not a literal.
var RUNFN = extractFn(PAGE, '_irRunInventoryAiPlanGeneration_');
ok(/_irAiPlanWithTimeout_\([\s\S]*?IR_AI_PLAN_CLIENT_TIMEOUT_MS_\)/.test(RUNFN),
  'C5  the generation call site passes the named constant');
eq((RUNFN.match(/_irAiPlanWithTimeout_\(([^;]*?), 60000\)/g) || []), [],
  'C5a and the literal 60000 is gone from it');
eq((PAGE.match(/_irAiPlanWithTimeout_\(/g) || []).length - 1, 1,
  'C5b there is exactly one call site, so one bound governs the whole action');

// Raising a bound must not have introduced a retry anywhere.
// COUNTED, not word-matched. The helper legitimately contains the prose "no red, no amber, no Retry", so a
// keyword scan says "retry" about a function whose point is that it does not. The property is that the
// generation function is DISPATCHED exactly once in the source, and §D/§E measure the same thing at runtime.
eq((RUNFN.match(/generateWeeklyAiPlanDraft\(/g) || []).length, 1,
  'C6  the generation helper dispatches the request exactly once — a longer bound changes how long we WAIT,'
  + ' not how many we send');
ok(!/setTimeout|setInterval/.test(RUNFN),
  'C6b and it schedules nothing of its own, so there is no delayed re-dispatch');
var WEEKLY = (API.match(/async function _kmWeeklyCommand_\([\s\S]*?\n\}/) || [])[0] || '';
ok(WEEKLY && /never auto-retried/.test(WEEKLY),
  'C6a and the transport still states that a timed-out write is never auto-retried');

// ================================================================================================================
// THE FRONTEND HARNESS — a deterministic clock. The task forbids waiting 61 real seconds, and a test that
// slept would also be a test that could pass for the wrong reason on a slow machine.
// ================================================================================================================
var NOW = 0, TIMERS = [];
function setTimeout(fn, ms) { TIMERS.push({ at: NOW + (Number(ms) || 0), fn: fn }); return TIMERS.length; }
function clearTimeout(h) { if (h && TIMERS[h - 1]) TIMERS[h - 1].fn = null; }
// Fires in `at` order, not insertion order: a clock that fires out of order is not a clock.
function advanceTo(ms) {
  NOW = ms;
  for (;;) {
    var due = TIMERS.filter(function (t) { return t.fn && t.at <= NOW; })
      .sort(function (a, b) { return a.at - b.at; });
    if (!due.length) return;
    var t = due[0], f = t.fn; t.fn = null; f();
  }
}
function settle() {
  var p = Promise.resolve();
  for (var i = 0; i < 30; i++) p = p.then(function () { advanceTo(NOW); });
  return p;
}
function resetClock() { NOW = 0; TIMERS = []; }

var _els = {};
function mkEl(id) {
  var cls = {}, attrs = {};
  return { id: id, hidden: false, disabled: false, style: {}, innerHTML: '', textContent: '', dataset: {},
    classList: { add: function (c) { cls[c] = 1; }, remove: function (c) { delete cls[c]; },
      contains: function (c) { return !!cls[c]; } },
    setAttribute: function (k, v) { attrs[k] = String(v); },
    getAttribute: function (k) { return attrs[k] === undefined ? null : attrs[k]; },
    removeAttribute: function (k) { delete attrs[k]; }, appendChild: function () {} };
}
var document = {
  getElementById: function (id) { return _els[id] || null; },
  createElement: function () { return mkEl(''); },
  querySelectorAll: function () { return []; },
  body: { appendChild: function (el) { _els[el.id || '__anonymous__'] = el; } }
};
function escapeReplenHtml(v) { return String(v == null ? '' : v); }
var renderCalls = 0, hydrateCalls = 0, refreshCalls = 0;
function renderReplenishment() { renderCalls++; }
function _hydrateAllocationDraftFromDb() { hydrateCalls++; return true; }
function _replenSelectedScope() { return { company: 'ResUS', country: 'US', marketplace: 'Amazon', marketplaceId: 'MP1' }; }
function isOperationDbApiConfigured() { return true; }
function _irEffectiveWorkspace() { return false; }
function _irAfterWrite(cb) { if (cb) cb(); }
var _irMatState = { rows: [], bySku: {} }, _irRecoByKey = {};
var _irExpectedDemandFromSnapshot_ = function () { return null; };

// The generation double. It resolves at a CHOSEN moment on the fake clock, and it counts every call, so
// "exactly one request" and "no retry" are measured rather than asserted from the source.
var genCalls = { n: 0, payloads: [] };
var GEN_PLAN = { resolveAt: null, response: null, rejectAt: null, error: null };
var window = {
  KMREC: null,
  KM: {
    DB: {
      generateWeeklyAiPlanDraft: function (payload) {
        genCalls.n++; genCalls.payloads.push(payload);
        return new Promise(function (resolve, reject) {
          if (GEN_PLAN.resolveAt !== null) setTimeout(function () { resolve(GEN_PLAN.response); }, GEN_PLAN.resolveAt);
          if (GEN_PLAN.rejectAt !== null) setTimeout(function () { reject(GEN_PLAN.error); }, GEN_PLAN.rejectAt);
          // resolveAt and rejectAt both null: a promise that never settles, which is what a real hang looks like.
        });
      },
      refreshCacheTables: function () { refreshCalls++; return Promise.resolve(true); }
    },
    api: { inventoryAiPlanDbGenerationEnabled: function () { return true; } }
  }
};

var _pgVars = 'var _irAiSupportTriggerOwner = null; var _irAiPlanRunning = false;';
var _pgTimeout = (PAGE.match(/var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = \d+;/) || [])[0];
var _pgPhases = (PAGE.match(/var IR_AI_PLAN_PHASES = \{[\s\S]*?\};/) || [])[0];
if (!_pgTimeout || !_pgPhases) { console.error('page constants not found'); process.exit(1); }
var PAGE_FNS = ['_replenCtx', '_irRecoNow_', '_irInventoryAiPlanDbGenerationEnabled_', '_irAiPlanDbGenEligible_',
  '_irClassifyGenerationResult_', '_irRunInventoryAiPlanGeneration_', '_irAiPlanReconcile_',
  '_irAiPlanWithTimeout_', '_irShowAiPlanResult_', '_irAiSupportTriggerEl_', '_irAiSupportTriggerBusy_',
  '_irAiSupportTriggerIdle_', '_irAiSupportNoticeEl_', '_irClearAiSupportNotice_', '_irAiSupportNotice_',
  '_irEscNotice_', '_irAiPlanDefer_', '_irAiPlanIsRunning_', '_irAiPlanTriggerBusy_', '_irAiPlanTriggerIdle_',
  '_irExecPlanAriaBusy_', '_irExecListSku_', '_irExecPlanStatusSet_', '_irAiPlanPhase_', '_irAiPlanTerminal_',
  '_irTouchedComposerSkus_', '_irPersistedManualRouteSkus_'];
function pageSrc(src) {
  return _pgVars + '\n' + _pgTimeout + '\n' + _pgPhases + '\n'
    + PAGE_FNS.map(function (n) { return extractFn(src, n); }).join('\n');
}
eval(pageSrc(PAGE));

// The real backend envelope, taken from §A rather than retyped. A double that disagrees with the contract
// cannot fail, and this round is here because exactly that happened in the R3-P1 fixture.
var LIVE_NO_ACTION = JSON.parse(AENV).response;

function runGen(plan) {
  resetClock(); _els = {}; genCalls = { n: 0, payloads: [] };
  renderCalls = 0; hydrateCalls = 0; refreshCalls = 0;
  _els['replen-ai-plan-btn'] = mkEl('replen-ai-plan-btn');
  GEN_PLAN = { resolveAt: plan.resolveAt === undefined ? null : plan.resolveAt,
    response: plan.response === undefined ? LIVE_NO_ACTION : plan.response,
    rejectAt: plan.rejectAt === undefined ? null : plan.rejectAt, error: plan.error || null };
  var done = { settled: false, value: undefined };
  _irRunInventoryAiPlanGeneration_(_els['replen-ai-plan-btn'], {})
    .then(function (v) { done.settled = true; done.value = v; },
      function (e) { done.settled = true; done.value = e; });
  return done;
}
function notice() { var el = _els['replen-ai-support-notice']; return el ? String(el.innerHTML || '') : ''; }
function popup() { var el = _els['replen-ai-plan-result']; return el ? String(el.innerHTML || '') : ''; }
function statusLine() { return (popup().match(/<strong>Status:<\/strong> ([A-Z_]*)/) || [])[1] || ''; }

// ================================================================================================================
section('D — delayed success: the 60 990 ms answer must be ACCEPTED');
// ================================================================================================================
var D = runGen({ resolveAt: MEASURED_RESOLVE_MS });
var Dsteps = [];
settle()
  .then(function () {
    eq(genCalls.n, 1, 'D1  one click sent exactly one generation request');
    // Cross the OLD bound and keep going. Nothing may happen here — this is the 990 ms that produced the
    // false negative, and it is the whole point of the round.
    advanceTo(OLD_BOUND_MS);
    return settle();
  })
  .then(function () {
    eq(statusLine(), '', 'D2  at 60 000 ms — the old bound — the UI has declared NOTHING');
    ok(notice().indexOf('TIMED OUT') === -1, 'D2a and no TIMEOUT message exists at 60 000 ms');
    eq(D.settled, false, 'D2b the run is still in flight, which is the truth at that moment');
    advanceTo(MEASURED_RESOLVE_MS);
    return settle();
  })
  .then(function () {
    eq(statusLine(), 'COMPLETED', 'D3  at 60 990 ms the answer arrives and is accepted');
    ok(notice().indexOf('TIMED OUT') === -1, 'D3a with no TIMEOUT anywhere in the operator message');
    ok(/No replenishment is required for this scope/.test(notice()),
      'D3b and the operator is told, in words, that no replenishment is required');
    eq(genCalls.n, 1, 'D4  still exactly ONE generation request — the longer bound introduced no retry');
    // Run the clock past the NEW bound too: a late timer must not undo a settled success.
    advanceTo(PAGE_MS + 60000);
    return settle();
  })
  .then(function () {
    eq(statusLine(), 'COMPLETED', 'D5  and the new bound firing later cannot turn a delivered answer into a timeout');
    eq(genCalls.n, 1, 'D5a with no extra request');

    // ============================================================================================================
    section('E — a REAL timeout still happens, past the new bound, and still refuses to retry');
    // ============================================================================================================
    var E = runGen({});      // never settles
    Dsteps.push(E);
    return settle().then(function () {
      advanceTo(PAGE_MS - 1);
      return settle();
    });
  })
  .then(function () {
    eq(statusLine(), '', 'E1  one millisecond before the bound, nothing has been declared');
    advanceTo(PAGE_MS);
    return settle();
  })
  .then(function () {
    eq(statusLine(), 'TIMEOUT', 'E2  at the bound it declares TIMEOUT');
    // R6-R7-R4 - read from the page rather than restated, so raising the bound cannot make this stale.
    ok(new RegExp('TIMED OUT after ' + Math.round(PAGE_MS / 1000) + 's').test(notice()),
      'E2a naming the bound it actually waited');
    eq(genCalls.n, 1, 'E3  and it does NOT retry');
    // The safety wording the task requires: do not press again, read back first.
    ok(/DO NOT PRESS GENERATE AGAIN/.test(notice()), 'E4  the message forbids a second press in as many words');
    ok(/read the database back first/i.test(notice()), 'E4a and says to read the database back first');
    ok(/UNKNOWN/.test(notice()), 'E4b it is reported as UNKNOWN, not as a failure — the request had left the browser');
    ok(/Submit Plan is\s+BLOCKED|Submit Plan is BLOCKED/.test(notice()), 'E4c and Submit stays blocked until a run reconciles');
    ok(!/undefined/.test(popup()), 'E5  and the TIMEOUT technical details contain no `undefined`');

    // ============================================================================================================
    section('F — a LATE answer after a declared TIMEOUT must not transition anything');
    // ============================================================================================================
    var F = runGen({ resolveAt: PAGE_MS + 30000 });
    return settle()
      .then(function () { advanceTo(PAGE_MS); return settle(); })
      .then(function () {
        eq(statusLine(), 'TIMEOUT', 'F1  the bound fires first and TIMEOUT is declared');
        var before = popup();
        advanceTo(PAGE_MS + 30000);
        return settle().then(function () {
          eq(statusLine(), 'TIMEOUT', 'F2  the late answer arrives and the UI is STILL TIMEOUT');
          eq(popup() === before, true, 'F2a the result panel was not rewritten by the late response');
          eq(hydrateCalls, 0, 'F2b and nothing re-hydrated from a run the UI had already given up on');
          eq(genCalls.n, 1, 'F2c with no second request');
        });
      });
  })
  .then(function () {
    // ============================================================================================================
    section('G — UI rendering: no `undefined`, and a zero is shown as 0');
    // ============================================================================================================
    var cls = _irClassifyGenerationResult_(LIVE_NO_ACTION);
    eq([cls.ok, cls.noReplenishmentRequired], [true, true],
      'G1  the classifier reads the real envelope as a successful no-action');
    eq([cls.createdHeaders, cls.updatedHeaders, cls.expiredHeaders], [0, 0, 0], 'G1a header counters are 0');
    eq([cls.createdLines, cls.updatedLines, cls.expiredLines], [0, 0, 0], 'G1b line counters are 0');
    eq([cls.cancelledHeaders, cls.cancelledLines, cls.reservations, cls.dbWrites], [0, 0, 0, 0],
      'G1c cancelled, reservations and db_writes are 0');
    eq(cls.writerReached, false, 'G1d and the writer was not reached');
    eq([cls.recommendedQty, cls.qualifyingPlannedQty, cls.residualQty], [0, 520, 0],
      'G1e with the three quantities carried through to the page');
    eq(cls.noActionReason, 'VALID_ZERO_RECOMMENDATION', 'G1f and the reason by name');

    _els = {};
    _irShowAiPlanResult_(cls);
    var html = popup();
    ok(html.indexOf('undefined') === -1, 'G2  the NO_ACTION technical details contain no `undefined`');
    ok(/undefined created/.test(html) === false && /undefined updated/.test(html) === false
      && /undefined expired/.test(html) === false,
      'G2a specifically none of `undefined created`, `undefined updated`, `undefined expired`');
    ok(/<strong>Headers:<\/strong> 0 created · 0 updated · 0 expired/.test(html), 'G3  headers read 0 / 0 / 0');
    ok(/<strong>Lines:<\/strong> 0 created · 0 updated · 0 expired/.test(html), 'G3a lines read 0 / 0 / 0');
    ok(/<strong>Cancelled:<\/strong> 0 header\(s\) · 0 line\(s\)/.test(html), 'G3b cancelled reads 0 / 0');
    ok(/<strong>Reservations:<\/strong> 0/.test(html), 'G3c reservations reads 0');
    ok(/<strong>DB writes:<\/strong> 0 · writer reached: no/.test(html), 'G3d db writes 0, writer not reached');
    ok(/<strong>Recommended:<\/strong> 0/.test(html), 'G4  recommended shows 0');
    ok(/<strong>Existing qualifying plan:<\/strong> 520/.test(html), 'G4a existing qualifying plan shows 520');
    ok(/<strong>Residual:<\/strong> 0/.test(html), 'G4b residual shows 0');
    ok(/no replenishment required for this scope/i.test(html),
      'G5  and the headline names the outcome instead of calling it a missing recommendation');
    ok(!/AI Plan generated/.test(html), 'G5a it does NOT claim rows were generated');
    ok(!/TIMED OUT|TIMEOUT/.test(html), 'G5b and there is no TIMEOUT anywhere in a successful no-action');

    // MISSING IS NEVER ZERO. A server that says nothing about a quantity must not be reported as saying zero.
    var silent = _irClassifyGenerationResult_({ success: true,
      data: { status: 'COMPLETED', code: 'NO_REPLENISHMENT_REQUIRED', zero_result: true, marketplaceResults: [] } });
    eq([silent.recommendedQty, silent.qualifyingPlannedQty, silent.residualQty], [null, null, null],
      'G6  a response that states no quantity yields null, not 0');
    _els = {};
    _irShowAiPlanResult_(silent);
    var sHtml = popup();
    ok(sHtml.indexOf('undefined') === -1, 'G6a the panel still contains no `undefined`');
    ok(!/<strong>Recommended:<\/strong>/.test(sHtml),
      'G6b and the quantity rows are OMITTED rather than printed as a measured 0');
    ok(/<strong>Headers:<\/strong> 0 created/.test(sHtml),
      'G6c while the mutation counters — which mean "no mutation" — still read 0');
    return null;
  })
  .then(function () {
    // ============================================================================================================
    section('H — regression: the write path, the flag and the allowlist are where they were');
    // ============================================================================================================
    var pos = _irClassifyGenerationResult_({ success: true, data: { status: 'COMPLETED', marketplaceCount: 1,
      created_headers: 1, created_lines: 3, updated_headers: 0, updated_lines: 0,
      expired_headers: 2, expired_lines: 5, generation_run_id: 'GEN-1',
      marketplaceResults: [{ marketplace: 'Amazon', success: true, status: 'CREATED', draftId: 'RD::x', lineCount: 3 }] } });
    eq([pos.ok, pos.zeroResult, pos.noReplenishmentRequired], [true, false, false],
      'H1  a positive recommendation is still an ordinary success, not a no-action');
    eq([pos.createdHeaders, pos.createdLines, pos.expiredHeaders, pos.expiredLines], [1, 3, 2, 5],
      'H1a and its counters are reported verbatim, not zeroed');
    eq(_irAiPlanReconcile_(pos).ok, true, 'H1b reconciliation is unchanged: 3 expected, 3 acknowledged');
    eq(_irAiPlanReconcile_({ lineTotal: 3, createdLines: 1, updatedLines: 0 }).reason,
      'LINE_COUNT_NOT_ACKNOWLEDGED', 'H1c and an unacknowledged line count still refuses');
    _els = {};
    _irShowAiPlanResult_(pos);
    ok(/AI Plan generated — 1 marketplace\(s\), 3 line\(s\)/.test(popup()),
      'H1d the positive headline is untouched');
    ok(popup().indexOf('undefined') === -1, 'H1e and it has no `undefined` either');

    ok(/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*false/.test(G00),
      'H2  00_config.gs still holds the production flag at FALSE');
    eq((G61.match(/INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_\s*=/g) || []).length, 0,
      'H2a and 61_ does not redeclare the allowlist');
    // S1-R3 — WHAT THIS ROUND DEPENDS ON IS THE SHAPE, NOT THE SKU. This spelled CO1100-R; the S1-R3 cutover
    // moved the allowlist to SP0750-M and the assertion above already covers the property that matters (one
    // entry). A complete, exact, wildcard-free single scope is what "controlled" means, and it survives every
    // cutover. The live VALUE has one owner: single-scope-allowlist-cutover-...-r6-r7-r6.test.js.
    var _h2Allow = (G00.match(/INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[[\s\S]*?\];/) || [])[0] || '';
    ok(/company: '[^']+', country: '[^']+', marketplace: '[^']+', sku: '[^']+'/.test(_h2Allow) && (_h2Allow.match(/company:/g) || []).length === 1
      && !/ALL_SITES|'ALL'|'\*'|sku: ''|marketplace: ''/.test(_h2Allow),
      'H2b the allowlist is still exactly one complete four-axis scope', _h2Allow);

    // The gate order: the flag is read before anything can write, and this round did not move it.
    var pre = runIt('RUN_R6R7_CONTROLLED_AI_PLAN_PREFLIGHT', live(), {});
    eq(pre.res.verdict, 'READY_NO_ACTION', 'H3  the preflight still answers READY_NO_ACTION');
    eq((pre.res.flag_phase || {}).phase, 'PRE_ACTIVATION', 'H3a in PRE_ACTIVATION, the flag still false');
    eq(pre.res.predicates_failed, 0, 'H3b with no predicate failed');
    eq(pre.world.dbWrites(), 0, 'H3c and zero cells touched');
    eq([pre.res.production_path.would_write, pre.res.production_path.writer_reached], [false, false],
      'H3d production would not write and would not reach a writer');

    // ============================================================================================================
    section('I — build stamps and the deployment contract');
    // ============================================================================================================
    var wap = (G61.match(/var WAP_BUILD_VERSION_ = '([^']+)'/) || [])[1];
    var sysRel = (G63.match(/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/) || [])[1];
    var sysB = (G63.match(/var SYS_BUILD_VERSION_ = '([^']+)'/) || [])[1];
    var cen = (CENSUS.match(/var TEMP_E3_CENSUS_BUILD_ = '([^']+)'/) || [])[1];
    // R6-R7-R4 - FLOORS, not equalities. THIS round moved these four; a later round moves them again, and
    // an equality against this round's build can only hold until it does. What survives is that none of them
    // is BEHIND the round this suite covers. The 61_-to-63_ manifest parity below stays exact, because that
    // is the equality a mixed deployment is actually detected by.
    ok(RO.stampAtOrAfter(wap, STAMP), 'I1  61_ moved, because 61_ changed, and is not behind this round');
    ok(RO.stampAtOrAfter(sysRel, STAMP),
      'I2  the RELEASE moved: a backend file changed, so a new Web App version is required');
    ok(RO.stampAtOrAfter(sysB, STAMP), 'I3  63_ moved too, because its manifest row moved');
    ok(RO.stampAtOrAfter(cen, STAMP), 'I4  and the census moved, because its capture snippet changed');
    // The parity a mixed deployment is actually detected by — exact, both rows.
    ok(new RegExp("symbol: 'WAP_BUILD_VERSION_', expected: '" + wap + "'").test(G63),
      'I5  63_\'s manifest expects precisely the build 61_ carries');
    ok(new RegExp("file: '63_api_v1_system_health\\.gs', symbol: 'SYS_BUILD_VERSION_', expected: '" + sysB + "'").test(G63),
      'I5a including its own self-referential row');
    ok(RO.OWNER_STAMPS.indexOf(STAMP) !== -1, 'I6  this round is registered in the release order');
    ok(RO.stampAtOrAfter(RO.OWNER_STAMPS[RO.OWNER_STAMPS.length - 1], STAMP),
      'I6a with nothing older registered after it');
    // 00_config did NOT change, so its row must NOT have been marched forward.
    var cfg = (G00.match(/var CONFIG_BUILD_VERSION_ = '([^']+)'/) || [])[1];
    ok(new RegExp("symbol: 'CONFIG_BUILD_VERSION_', expected: '" + cfg + "'").test(G63),
      'I7  00_config.gs keeps its own stamp and its manifest row still expects it — an unchanged file is not bumped');
    ok(cfg !== STAMP, 'I7a and it is NOT this round: nothing in 00_config.gs changed');
    // No action added, no transport change.
    // R6-R7-R5 — re-aimed to a FLOOR. R5 added factoryStockGuard.get, so "no action was added" is no longer
    // a property of the deployed contract; "it is not below what this round needed" is.
    ok(Number((G63.match(/SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/) || [])[1]) >= 11,
      'I8  the deployed action contract is not below the version this round required');
    eq((G63.match(/SYS_TRANSPORT_CONTRACT_VERSION_ = (\d+)/) || [])[1], '1',
      'I8a and the envelope shape is unchanged, so the transport contract does not move');

    // ============================================================================================================
    section('J — nothing was generated, flipped, deployed or written by this round');
    // ============================================================================================================
    ok(!/clasp|ScriptApp\.newTrigger|createDeployment/.test(extractFn(G61, 'weeklyAiPlanNoActionResponse_')),
      'J1  the NO_ACTION builder deploys nothing and schedules nothing');
    eq(extractFn(G61, 'weeklyAiPlanNoActionResponse_').indexOf('getRange'), -1,
      'J2  and it touches no range — a success envelope is not a write');
    eq(extractFn(G61, 'weeklyAiPlanNoActionResponse_').indexOf('setValue'), -1, 'J2a nor sets a value');
    var wr = ['weeklyAiPlanWriter', 'K2Writer', 'kmarcWrite'];
    eq(wr.filter(function (n) { return extractFn(G61, 'weeklyAiPlanNoActionResponse_').indexOf(n) !== -1; }), [],
      'J3  and constructs no writer');
    eq(Aw.dbWrites(), 0, 'J4  the production decision path measured 0 cells written');
    eq(pre.world.dbWrites(), 0, 'J4a and so did the preflight');

    // ============================================================================================================
    section('N — mutants');
    // ============================================================================================================
    // N1: the literal that caused the incident, put back.
    mut('N1 the 60 000 ms literal restored at the call site', function () {
      var m = swap(PAGE, 'IR_AI_PLAN_CLIENT_TIMEOUT_MS_).then(function (res) {', '60000).then(function (res) {');
      var f = extractFn(m, '_irRunInventoryAiPlanGeneration_');
      return /_irAiPlanWithTimeout_\([\s\S]*?, 60000\)/.test(f)
        && !/IR_AI_PLAN_CLIENT_TIMEOUT_MS_\)/.test(f);
    });
    // N2: the client bound dropped BELOW the transport bound — still 60s+, still wrong for the stated reason.
    // R6-R7-R4 - the mutant reads the SHIPPED value rather than a literal, so raising the bound cannot
    // silently disarm it, and it is measured against the bound the transport will ACTUALLY apply.
    mut('N2 a client bound below the transport bound for this action', function () {
      var m = swap(PAGE, 'var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = ' + PAGE_MS + ';',
        'var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = ' + (ACTION_MS - 1000) + ';');
      var ms = Number((m.match(/var IR_AI_PLAN_CLIENT_TIMEOUT_MS_ = (\d+);/) || [])[1]);
      // Still accepts the 60 990 ms answer, and still pre-empts the transport: the rule is the RELATION.
      return PAGE_MS > ACTION_MS && ms > MEASURED_RESOLVE_MS && !(ms > ACTION_MS);
    });
    // N3: `reservations` removed from the backend contract — the one genuinely missing counter. Run through
    // the REAL decision path on a mutated 61_, so this measures the envelope a browser would receive rather
    // than the presence of a line of source.
    mut('N3 reservations dropped from the NO_ACTION envelope', function () {
      var bad = envelopeFrom(swap(G61, '      reservations: 0,', ''));
      return typeof AD.reservations === 'number' && bad.reservations === undefined;
    });
    // N4: the capture snippet pointed back at the nested sub-object. This is the exact live defect.
    mut('N4 the capture snippet reading counters off a nested object again', function () {
      var m = swap(CENSUS, "  '      if (d[k] !== undefined) { if (cSrc === null) cSrc = \"data\"; return d[k]; }',\n", '');
      var p2 = (m.match(/'  function pick\(res\) \{',[\s\S]*?counters_read_from: cSrc \}; \}',/) || [])[0] || '';
      return PICK.indexOf('cSrc = "data"') !== -1 && p2 && p2.indexOf('cSrc = "data"') === -1;
    });
    // N5: the renderer's coercion removed. It must not be load-bearing for a correct response — but it IS the
    // floor that stops a synthetic cls printing the word `undefined`, so removing it has to be caught.
    mut('N5 the renderer trusting its caller instead of coercing', function () {
      var m = swap(PAGE, 'function cnt(v) { var n = Number(v); return isFinite(n) ? n : 0; }',
        'function cnt(v) { return v; }');
      var f = extractFn(m, '_irShowAiPlanResult_');
      var sandbox = { out: '' };
      // Render a cls with a MISSING counter through both versions.
      var partial = { ok: false, status: 'X', marketplaceResults: [], errors: [] };
      var mk = function (src) {
        var g = new Function('cls', 'document', 'escapeReplenHtml',
          src + '\n_irShowAiPlanResult_(cls); return document.__html;');
        var doc = { __html: '', getElementById: function () { return null; },
          createElement: function () { var e = mkEl(''); Object.defineProperty(e, 'innerHTML',
            { set: function (v) { doc.__html = String(v); }, get: function () { return doc.__html; } }); return e; },
          querySelectorAll: function () { return []; }, body: { appendChild: function () {} } };
        try { return g(partial, doc, escapeReplenHtml) || doc.__html; } catch (e) { return 'THREW'; }
      };
      var good = mk(extractFn(PAGE, '_irShowAiPlanResult_'));
      var bad = mk(f);
      sandbox.out = good;
      return good.indexOf('undefined') === -1 && bad.indexOf('undefined') !== -1;
    });
    // N6: the synthetic TIMEOUT cls loses its counters AND the coercion goes. Two locks; the mutant removes both,
    // because either one alone still prevents the word `undefined` from reaching an operator.
    mut('N6 the synthetic TIMEOUT cls stripped of its counters, with the coercion also gone', function () {
      var m = swap(PAGE, '                createdHeaders: 0, updatedHeaders: 0, expiredHeaders: 0,\n'
        + '                createdLines: 0, updatedLines: 0, expiredLines: 0,\n'
        + '                cancelledHeaders: 0, cancelledLines: 0, reservations: 0, dbWrites: 0, writerReached: false,\n', '');
      m = swap(m, 'function cnt(v) { var n = Number(v); return isFinite(n) ? n : 0; }', 'function cnt(v) { return v; }');
      // COUNTED, not merely matched: the FAILED literal carries the same keys, so a bare `indexOf` would
      // still find them after the TIMEOUT literal lost them and the mutant would look caught when it was not.
      function timeoutLiterals(src) {
        var f = extractFn(src, '_irRunInventoryAiPlanGeneration_');
        var i = f.indexOf('__irAiPlanTimeout');
        var j = f.indexOf("_irShowAiPlanResult_({ ok: false, status: 'FAILED'");
        var branch = f.slice(i, j < 0 ? f.length : j);
        return (branch.match(/createdHeaders: 0/g) || []).length;
      }
      var cf = extractFn(m, '_irShowAiPlanResult_');
      return timeoutLiterals(PAGE) === 1 && timeoutLiterals(m) === 0
        && /isFinite/.test(extractFn(PAGE, '_irShowAiPlanResult_')) && !/isFinite/.test(cf);
    });
    // N7: an auto-retry introduced on the back of the longer bound.
    mut('N7 a retry added to the generation helper', function () {
      var m = swap(PAGE, '        if (err && err.__irAiPlanTimeout) {',
        '        if (err && err.__irAiPlanTimeout) { window.KM.DB.generateWeeklyAiPlanDraft(payload);');
      var f = extractFn(m, '_irRunInventoryAiPlanGeneration_');
      return !/generateWeeklyAiPlanDraft\(payload\);/.test(
        extractFn(PAGE, '_irRunInventoryAiPlanGeneration_').replace(/_irAiPlanWithTimeout_\(Promise\.resolve\(window\.KM\.DB\.generateWeeklyAiPlanDraft\(payload\)\)/, ''))
        && (f.match(/generateWeeklyAiPlanDraft\(payload\)/g) || []).length === 2;
    });
    // N8: the no-action message drops the quantities and goes back to asserting demand is zero.
    mut('N8 the no-action message asserting zero demand and dropping the quantities', function () {
      var f = (PAGE.match(/if \(cls\.noReplenishmentRequired\) \{[\s\S]*?\n                        \}/) || [])[0] || '';
      var m = swap(PAGE, f, "if (cls.noReplenishmentRequired) {\n"
        + "                            return _irAiPlanTerminal_('ok',\n"
        + "                                'No replenishment is required for this scope.',\n"
        + "                                'No replenishment is required for this scope.');\n"
        + '                        }');
      var f2 = (m.match(/if \(cls\.noReplenishmentRequired\) \{[\s\S]*?\n                        \}/) || [])[0] || '';
      // The branch's own wording, not the renderer's: this is the sentence the operator reads in the notice.
      return /Already planned \(qualifying\) /.test(f) && /FULLY_COVERED_BY_ACTIVE_PLAN/.test(f)
        && /Recommended /.test(f) && /Residual /.test(f)
        && !/Already planned \(qualifying\) /.test(f2) && !/FULLY_COVERED_BY_ACTIVE_PLAN/.test(f2);
    });
    // N9: the readback's zero-counter gate stops checking `reservations` — the field measured but not checked.
    // R5-R1 — RE-AIMED. The gate is no longer a chain of `&&`; the counters are a NAMED list, because
    // `[0,0,0,0,0,0,null,0]` cost a round of tracing to discover that the seventh one is `reservations`.
    // The property is unchanged: `reservations` must be one of the counters the gate actually reads. And it
    // must be on the REQUIRED list too — a counter that is checked but not required is how a missing paste
    // field came to look like a backend omission.
    mut('N9 reservations removed from the readback zero-counter gate', function () {
      var m = swap(CENSUS, "      ['reservations', A.reservations], ['db_writes', A.db_writes]];",
        '      [\'db_writes\', A.db_writes]];');
      var g = extractFn(m, 'RUN_R6R7_CONTROLLED_NO_ACTION_READBACK');
      return /\['reservations', A\.reservations\]/.test(RB) && !/\['reservations', A\.reservations\]/.test(g)
        && /'reservations'/.test(extractVar(CENSUS, 'R6R7_ACTUAL_RESPONSE_REQUIRED_'));
    });
    // N10: `reservations` emitted as null instead of 0. A null is exactly the shape this round is closing —
    // and it is the shape a careless "fix" would produce, so it must be caught separately from N3.
    mut('N10 reservations emitted as null rather than 0', function () {
      var bad = envelopeFrom(swap(G61, '      reservations: 0,', '      reservations: null,'));
      return typeof AD.reservations === 'number' && bad.reservations === null
        && JSON.stringify(bad).indexOf('"reservations":null') !== -1;
    });

    console.log('\n' + '-'.repeat(72));
    console.log('NO_ACTION RESPONSE CONTRACT + AI PLAN TIMEOUT (' + STAMP + '):');
    console.log('passed ' + pass + '  failed ' + fail
      + '  |  mutants caught ' + neg.caught + '  survived ' + neg.missed);
    if (fail) process.exit(1);
  })
  .catch(function (e) {
    console.error('\nASYNC ERROR ' + (e && e.stack || e));
    process.exit(1);
  });
