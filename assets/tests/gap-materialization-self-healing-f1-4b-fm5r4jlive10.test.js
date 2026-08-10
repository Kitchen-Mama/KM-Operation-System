// Kitchen Mama Operation System — F1-4B-FM5-R4J-LIVE10 Gap Materialization SELF-HEALING Runtime.
// Run: node assets/tests/gap-materialization-self-healing-f1-4b-fm5r4jlive10.test.js
// -----------------------------------------------------------------------------
// Proves the LIVE10 additions on top of the R4J resumable job (that suite still owns START/STATUS/CANCEL/conservation):
//   §3  the RECOVERY trigger is armed BEFORE any slice processing (a hard kill mid-slice can NEVER orphan the job).
//   §4  the WORKER BUDGET loop processes MANY complete slices per continuation, bounded by the budget (not the ~6-min kill).
//   §5  a durable checkpoint is persisted after EVERY complete slice (a kill loses at most the in-flight slice).
//   §7  STATUS + START AUTO-RECOVER a stale run on the SAME runId (recovering; never a kill, never a whole-job restart),
//       bounded by GAP_JOB_MAX_RECOVERIES_ → then a truthful terminal.
//   §8  a slice that can NEVER fit the budget (no durable progress) becomes a truthful terminal SLICE_EXCEEDS_WORKER_BUDGET.
//   §13 bounded EXECUTION SCOPES (ALL_SITES / CURRENT_COUNTRY / CURRENT_SCOPE); Order Planning is EXPANDED to the whole
//       company (shared-pool conservation); an empty selection fails closed.
//   §11 the client poller: a LOST transport response is NOT a stall; liveness/ recovering resets the stall; a thrown
//       status call keeps polling (never a frozen Calculating); §14 both pages expose the AI-Assist scope callables.
// The job engine is fully injectable (fake env, fake clock). Formulas/mappings are untouched. No Apps Script runtime.

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var F46 = read('specs/active/apps-script/46_api_v1_gap_materialization_job.gs');
var INV_JS = read('js/pages/inventory-replenishment.js');
var RO_JS = read('js/pages/request-order.js');
var GR = require('../js/utils/gap-recalc-transport.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

var PRE = 'function prodRequireSheet_(ss, name){ if (ss && ss.__missingSheet) throw new Error("MISSING_SHEET:"+name); return (ss && ss.getSheetByName) ? (ss.getSheetByName(name) || {__sheet:true}) : {__sheet:true}; }\n';
var H = (new Function(BUNDLE + '\n' + F42 + '\n' + PRE + F43 + '\n' + F46 + '\n return {' +
  ' start: gapJobStart_, cont: gapJobContinue_, status: gapJobStatus_, cancel: gapJobCancel_,' +
  ' selectScopes: gapJobSelectScopes_, orderedScopes: gapJobOrderedScopes_,' +
  ' RECOVERY_MS: GAP_JOB_RECOVERY_DELAY_MS_, CONT_MS: GAP_JOB_CONTINUATION_DELAY_MS_, BUDGET_MS: GAP_JOB_WORKER_BUDGET_MS_,' +
  ' MAX_RECOVERIES: GAP_JOB_MAX_RECOVERIES_, MAX_SLICE_ATTEMPTS: GAP_JOB_MAX_SLICE_ATTEMPTS_, SCOPE_MODES: GAP_JOB_SCOPE_MODES_,' +
  ' PROP_KEYS: GAP_JOB_PROP_KEYS_ };'))();

function fakeEnv(opts) {
  opts = opts || {};
  var store = {}, scheduled = [], cleared = [], processed = [], clock = 0, lockHeld = false;
  var msClock = (opts.startMs != null ? opts.startMs : 0);
  var lockFlags = { block: opts.lockGranted === false };
  var env = {
    _store: store, _scheduled: scheduled, _cleared: cleared, _processed: processed, _lockFlags: lockFlags,
    _advanceMs: function (d) { msClock += d; }, nowMs: function () { return msClock; },
    workerBudgetMs: opts.workerBudgetMs,
    props: { get: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, set: function (k, v) { store[k] = v; }, del: function (k) { delete store[k]; } },
    lock: opts.noLock ? null : { acquire: function () { if (lockFlags.block) return false; if (lockHeld) return false; lockHeld = true; return true; }, release: function () { lockHeld = false; } },
    resolveContext: function (p) { return opts.ctx || { ok: true, jobType: p, calculationDate: '2026-08-10', calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }; },
    openTarget: function () { return opts.ss || { __ss: true }; },
    requireResultSheet: function () { if (opts.missingSheet) throw new Error('MISSING_SHEET'); return { __sheet: true }; },
    enumerateScopes: function () { return (opts.scopes || []).slice(); },
    newRunId: function (p) { return 'GAP-' + (p === 'ORDER_PLANNING' ? 'OP' : 'INV') + '-20260810T000000-0001'; },
    timestamp: function () { clock++; return '2026-08-10 00:00:' + ('0' + (clock % 60)).slice(-2); },
    scheduleContinuation: function (p, ms) { if (opts.scheduleThrows) throw new Error('SCHEDULE_TRIGGER_FAILED'); scheduled.push({ product: p, ms: ms }); },
    clearContinuationTriggers: function (p) { cleared.push(p); for (var i = scheduled.length - 1; i >= 0; i--) { if (scheduled[i].product === p) scheduled.splice(i, 1); } },
    processSlice: opts.processSlice || function (product, sliceScopes, ss, sheet, ctx) {
      if (typeof opts.onProcess === 'function') opts.onProcess(env, sliceScopes);
      processed.push(sliceScopes.map(function (s) { return s.company + '/' + s.country + '/' + s.marketplace; }));
      msClock += (opts.sliceMs != null ? opts.sliceMs : 0);   // LIVE10: default 0 → drain many slices per continuation
      return { scopesCalculated: sliceScopes.length, written: sliceScopes.length * 2, ready: sliceScopes.length * 2, blocked: 0, errors: 0, scopeErrors: [] };
    }
  };
  return env;
}
function invScopes(n) { var out = []; for (var i = 0; i < n; i++) out.push({ company: 'KM', country: 'C' + i, marketplace: 'AMAZON_C' + i }); return out; }
function armedMs(env) { return env._scheduled.map(function (s) { return s.ms; }).sort(function (a, b) { return a - b; }); }

// =============================================================================================================
section('§3 — the RECOVERY trigger is armed BEFORE any slice processing (orphan window closed)');
var recoWasArmed = null;
var e3 = fakeEnv({ scopes: invScopes(3), sliceMs: 0, onProcess: function (env) {
  // captured on the FIRST processSlice call: is a recovery-delay trigger already armed?
  if (recoWasArmed === null) recoWasArmed = env._scheduled.some(function (s) { return s.ms === H.RECOVERY_MS; });
} });
H.start('INVENTORY', e3);
H.cont('INVENTORY', e3);
ok(recoWasArmed === true, 'A1 a recovery trigger (delay > hard limit) was armed BEFORE the first slice ran → a kill mid-slice cannot orphan the job');
ok(H.RECOVERY_MS > 360000, 'A2 the recovery delay is beyond the ~6-min Apps Script hard limit (fires only if the worker died/overran)');

section('§4 — the WORKER BUDGET loop processes MANY complete slices per continuation (Inventory speed-up)');
var e4 = fakeEnv({ scopes: invScopes(6), sliceMs: 0 });   // zero per-slice cost → one continuation drains all
var d4 = H.cont('INVENTORY', H.start('INVENTORY', e4) && e4);
eq([d4.status, d4.scopeCursor, e4._processed.length], ['DONE', 6, 6], 'B1 with slices inside budget, ONE continuation processes ALL 6 scopes → DONE (not one-per-tick)');

section('§4 — the budget BOUNDS a continuation: multiple-but-bounded slices, then a clean exit + prompt next');
var e4b = fakeEnv({ scopes: invScopes(5), sliceMs: 100, workerBudgetMs: 150 });   // ~2 slices per continuation
H.start('INVENTORY', e4b);
var b1 = H.cont('INVENTORY', e4b);
eq([b1.status, b1.scopeCursor], ['RUNNING', 2], 'B2 a budget of 150ms with 100ms slices processes exactly 2 slices, then exits RUNNING at cursor 2');
eq(armedMs(e4b), [H.CONT_MS, H.RECOVERY_MS], 'B3 on a budget exit BOTH a prompt-next AND the recovery backstop are armed (always a recoverable path)');
var b2 = H.cont('INVENTORY', e4b); var b3 = H.cont('INVENTORY', e4b);
eq([b3.status, b3.scopeCursor, e4b._processed.length], ['DONE', 5, 5], 'B4 successive budget-bounded continuations resume from the cursor → DONE at cursor 5');

section('§5 — a durable checkpoint is persisted after EVERY complete slice');
var e5 = fakeEnv({ scopes: invScopes(4), sliceMs: 100, workerBudgetMs: 150 });
H.start('INVENTORY', e5); H.cont('INVENTORY', e5);
var mid = JSON.parse(e5._store[H.PROP_KEYS.INVENTORY]);
eq([mid.status, mid.scopeCursor, mid.scopesProcessed], ['RUNNING', 2, 2], 'C1 the durable Script-Property state advanced to cursor 2 mid-run (a kill now loses at most the in-flight slice)');

section('§8 — a slice that can NEVER fit the budget → truthful terminal SLICE_EXCEEDS_WORKER_BUDGET (no infinite loop)');
var e8 = fakeEnv({ scopes: invScopes(3), workerBudgetMs: 0 });   // budget 0 → the worker can never start a slice
H.start('INVENTORY', e8);
var last8 = null; for (var i8 = 0; i8 < 12 && !(last8 && last8.status === 'FAILED'); i8++) last8 = H.cont('INVENTORY', e8);
eq([last8.status, e8._processed.length], ['FAILED', 0], 'D1 a slice that makes no durable progress becomes terminal FAILED (bounded no-progress guard) — never an endless kill→recover loop');
ok(/SLICE_EXCEEDS_WORKER_BUDGET/.test(last8.lastError || ''), 'D2 the terminal names the honest cause (conservation forbids a finer split)');

section('§7 — STATUS AUTO-RECOVERS a stale run on the SAME runId (recovering), then a truthful terminal when exhausted');
var e7 = fakeEnv({ scopes: invScopes(3), startMs: 1000000 });
var s7 = H.start('INVENTORY', e7);
e7._advanceMs(700000);
var r7 = H.status('INVENTORY', null, e7).data;
eq([r7.status, r7.recovering, r7.recoveryCount, r7.runId], ['PENDING', true, 1, s7.data.runId], 'E1 STATUS on a stale run re-arms the SAME runId (recovering, recoveryCount=1) — never STALLED, never a new run');
ok(e7._scheduled.some(function (s) { return s.ms === H.CONT_MS; }) && e7._processed.length === 0, 'E2 the watchdog armed a prompt continuation and ran NO calculation');

section('§7 — START prefers self-heal of the SAME run over a fresh restart (progress preserved)');
var e7b = fakeEnv({ scopes: invScopes(3), startMs: 1000000 });
var s7b = H.start('INVENTORY', e7b);
e7b._advanceMs(700000);
var s7b2 = H.start('INVENTORY', e7b);
eq([s7b2.data.alreadyRunning, s7b2.data.recovering, s7b2.data.runId], [true, true, s7b.data.runId], 'E3 a second START on a stale run RESUMES the same runId (recovering) — never a second job, never a restart');

section('§13 — bounded execution SCOPE selection (Inventory exact; Order Planning expanded to whole company)');
var univ = [
  { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, { company: 'KM', country: 'US', marketplace: 'WALMART_US' },
  { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA' }, { company: 'BR', country: 'US', marketplace: 'AMAZON_US' }
];
eq(H.selectScopes(univ, { mode: 'ALL_SITES' }, 'INVENTORY').scopes.length, 4, 'F1 ALL_SITES → the full universe');
eq(H.selectScopes(univ, null, 'INVENTORY').scopes.length, 4, 'F2 no scope request → ALL_SITES (backward compatible)');
var invCountry = H.selectScopes(univ, { mode: 'CURRENT_COUNTRY', company: 'KM', country: 'US' }, 'INVENTORY');
eq(invCountry.scopes.map(function (s) { return s.marketplace; }), ['AMAZON_US', 'WALMART_US'], 'F3 INVENTORY CURRENT_COUNTRY → the two KM/US scopes only (exact; scopes independent)');
var invScope = H.selectScopes(univ, { mode: 'CURRENT_SCOPE', company: 'KM', country: 'US', marketplace: 'WALMART_US' }, 'INVENTORY');
eq([invScope.scopes.length, invScope.scopes[0].marketplace], [1, 'WALMART_US'], 'F4 INVENTORY CURRENT_SCOPE → exactly the one company/country/marketplace triple');
var opCountry = H.selectScopes(univ, { mode: 'CURRENT_COUNTRY', company: 'KM', country: 'US' }, 'ORDER_PLANNING');
eq([opCountry.scopes.map(function (s) { return s.company + '/' + s.country; }), opCountry.appliedScope.expandedForConservation], [['KM/US', 'KM/US', 'KM/CA'], true], 'F5 ORDER_PLANNING CURRENT_COUNTRY is EXPANDED to the WHOLE company (all KM scopes across countries) — shared-pool conservation');
var opScope = H.selectScopes(univ, { mode: 'CURRENT_SCOPE', company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, 'ORDER_PLANNING');
eq([opScope.scopes.length, opScope.appliedScope.mode, opScope.appliedScope.requestedMode], [3, 'CURRENT_COMPANY', 'CURRENT_SCOPE'], 'F6 ORDER_PLANNING CURRENT_SCOPE is ALSO expanded to the whole KM company (never a sub-company OP run)');
eq(H.selectScopes(univ, { mode: 'CURRENT_COUNTRY' }, 'INVENTORY').scopes.length, 4, 'F7 a scope request with NO company falls back to ALL_SITES (never an empty silent run)');

section('§13 — START threads the scope into a bounded run; an empty selection fails CLOSED');
var eScope = fakeEnv({ scopes: univ });
var sScope = H.start('INVENTORY', eScope, { mode: 'CURRENT_COUNTRY', company: 'KM', country: 'US' });
eq([sScope.success, sScope.data.scopesTotal, sScope.data.appliedScope.mode], [true, 2, 'CURRENT_COUNTRY'], 'F8 START(CURRENT_COUNTRY KM/US) → a bounded 2-scope run; appliedScope recorded');
var eEmpty = fakeEnv({ scopes: univ });
var sEmpty = H.start('INVENTORY', eEmpty, { mode: 'CURRENT_SCOPE', company: 'ZZ', country: 'US', marketplace: 'AMAZON_US' });
ok(sEmpty.success === false && /GAP_JOB_EMPTY_SCOPE_SELECTION/.test((sEmpty.errors && sEmpty.errors[0] && sEmpty.errors[0].code) || ''), 'F9 a scope matching NO site fails CLOSED (never a fabricated 0/0 DONE)');
var eOpStart = fakeEnv({ scopes: univ });
var sOp = H.start('ORDER_PLANNING', eOpStart, { mode: 'CURRENT_SCOPE', company: 'KM', country: 'US', marketplace: 'AMAZON_US' });
eq([sOp.success, sOp.data.scopesTotal, sOp.data.appliedScope.expandedForConservation], [true, 3, true], 'F10 START OP CURRENT_SCOPE expands to the whole KM company (3 scopes) — conservation-safe bounded run');

// =============================================================================================================
section('§11 — poller: a LOST transport response is NOT a stall (bounded only by maxPolls → POLL_TIMEOUT, never STALLED)');
var immediate = function () { return Promise.resolve(); };
(function () {
  var statusFn = function () { return Promise.resolve({ success: false, error: { code: 'HTTP_TRANSPORT_ERROR' } }); };   // every poll lost
  GR.pollJob(statusFn, { wait: immediate, interval: 1, maxPolls: 5, maxStallPolls: 2 }).then(function (r) {
    ok(r.status === 'POLL_TIMEOUT' && r.transportLost === true, 'G1 sustained lost responses NEVER become STALLED — bounded only by maxPolls (transport != calculation failure §11)');
  });
})();
(function () {
  var thrown = 0;
  var statusFn = function () { thrown++; return Promise.reject(new Error('network down')); };   // status throws every time
  GR.pollJob(statusFn, { wait: immediate, interval: 1, maxPolls: 4, maxStallPolls: 2 }).then(function (r) {
    ok(r.status === 'POLL_TIMEOUT' && thrown >= 4, 'G2 a THROWN status call is caught and polling continues (never a frozen Calculating) → POLL_TIMEOUT');
  });
})();

section('§7 — poller: liveness change resets the stall; a backend that reports recovering is NOT stalled');
(function () {
  // scopesProcessed is frozen at 1, but the continuation timestamp advances each poll (a long single slice) → not stalled.
  var i = 0, seq = [
    { status: 'RUNNING', scopesProcessed: 1, scopesTotal: 3, lastContinuationScheduledAt: 't1' },
    { status: 'RUNNING', scopesProcessed: 1, scopesTotal: 3, lastContinuationScheduledAt: 't2' },
    { status: 'RUNNING', scopesProcessed: 1, scopesTotal: 3, lastContinuationScheduledAt: 't3' },
    { status: 'DONE', scopesProcessed: 3, scopesTotal: 3 }
  ];
  var statusFn = function () { return Promise.resolve({ success: true, data: seq[Math.min(i++, seq.length - 1)] }); };
  GR.pollJob(statusFn, { wait: immediate, interval: 1, maxStallPolls: 2 }).then(function (r) {
    ok(r.status === 'DONE', 'G3 a live-but-slow job (liveness advancing, scope count static) is NOT falsely STALLED → reaches DONE');
  });
})();
(function () {
  var saw = [];
  var i = 0, seq = [
    { status: 'RUNNING', scopesProcessed: 0, scopesTotal: 5, recovering: true },
    { status: 'RUNNING', scopesProcessed: 0, scopesTotal: 5, recovering: true },
    { status: 'RUNNING', scopesProcessed: 0, scopesTotal: 5, recovering: true },
    { status: 'DONE', scopesProcessed: 5, scopesTotal: 5 }
  ];
  var statusFn = function () { return Promise.resolve({ success: true, data: seq[Math.min(i++, seq.length - 1)] }); };
  GR.pollJob(statusFn, { wait: immediate, interval: 1, maxStallPolls: 2, onProgress: function (s) { saw.push(!!s.recovering); } }).then(function (r) {
    ok(r.status === 'DONE' && saw.indexOf(true) !== -1, 'G4 a backend reporting recovering:true is observed (not STALLED) and reaches DONE — the page shows "Recovering…"');
    ok(GR.isRecovering({ recovering: true }) === true && GR.isRecovering({ status: 'RECOVERING' }) === true && GR.isRecovering({ status: 'RUNNING' }) === false, 'G4b isRecovering detects the recovering flag / RECOVERING status');
  });
})();

section('§11 — runJob: a THROWN START routes to an unconfirmed terminal (never a frozen "Starting…")');
(function () {
  var ev = [];
  var startFn = function () { return Promise.reject(new Error('start network drop')); };
  var statusFn = function () { return Promise.resolve({ success: true, data: { status: 'RUNNING' } }); };
  GR.runJob(startFn, statusFn, { wait: immediate, interval: 1, ui: { starting: function () { ev.push('starting'); }, failed: function (st) { ev.push('failed:' + (st && st.status)); } } }).then(function (r) {
    ok(r.started === false && r.transportLost === true && ev.indexOf('failed:POLL_TIMEOUT') !== -1, 'G5 a thrown START surfaces as UNCONFIRMED (POLL_TIMEOUT/transportLost) via ui.failed — the button never freezes at Starting…');
  });
})();

// =============================================================================================================
section('§14 — both pages expose the STABLE AI-Assist scope callables (no toolbar redesign; reuse the one handler)');
ok(/function recalcInventoryGapAllSites\b/.test(INV_JS) && /function recalcInventoryGapCurrentCountry\b/.test(INV_JS) && /function recalcInventoryGapCurrentScope\b/.test(INV_JS), 'H1 Inventory exposes AllSites / CurrentCountry / CurrentScope recalc callables');
ok(/function recalcOrderPlanningGapAllSites\b/.test(RO_JS) && /function recalcOrderPlanningGapCurrentCountry\b/.test(RO_JS) && /function recalcOrderPlanningGapCurrentScope\b/.test(RO_JS), 'H2 Order Planning exposes the three recalc-scope callables');
ok(/window\.recalcInventoryGapCurrentScope\s*=/.test(INV_JS) && /window\.recalcOrderPlanningGapCurrentScope\s*=/.test(RO_JS), 'H3 the callables are window-exposed for a later AI-Assist menu round');
ok(/handleRecalcAllInventoryGap\(scopeSpec\)/.test(INV_JS) && /handleRecalcAllOrderPlanningGap\(scopeSpec\)/.test(RO_JS), 'H4 the scope callables REUSE the one recalc handler (optional scopeSpec) — no duplicated lifecycle');
ok(/handleReplenAiPlan/.test(INV_JS) && /handleRequestOrderAiPlan/.test(RO_JS), 'H5 the existing deterministic "Generate AI Plan" handlers remain (the AI-Assist menu will host them alongside recalc)');

console.log('\n----------------------------------------');
setTimeout(function () {
  console.log('GAP MATERIALIZATION SELF-HEALING (F1-4B-FM5-R4J-LIVE10): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
}, 80);
