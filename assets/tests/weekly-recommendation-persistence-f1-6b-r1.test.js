// Kitchen Mama Operation System — F1-6B-PHASE1-E2E-PRE-CLOSURE-R1 Part A
// Scheduled Recommendation → ACTIONABLE persisted AI Plan draft (backend-driven, browserless).
// Run: node assets/tests/weekly-recommendation-persistence-f1-6b-r1.test.js
// -----------------------------------------------------------------------------
// Proves the weekly scheduler converges onto the EXISTING canonical persistence authority (48_ resumable draft job →
// 24_ locked persister) with NO second engine / table / persister / scheduler and NO frontend dependency:
//   • the PURE decision helpers (scope enumeration, 48_ envelope interpretation, count fold) evaluated directly;
//   • the 49_ orchestrator driven through an injected env — START → self-arming continuation steps → DONE — across
//     multi-scope, duplicate-trigger, overlap-lease, gap-not-ready, foreign-manual-collision, and trigger-auth cases;
//   • an INTEGRATION fixture wiring the REAL 48_ job (fake 48_ env) with a SHARED lock, proving the scheduler drives
//     the same persistence job the manual AI Plan uses AND never holds the script lock across a 48_ call; and
//   • source-scans asserting the negative constraints (reuse of 46_ trigger primitives, SCHEDULED_REFRESH mode, no
//     new table/schema, no second engine, no frontend, INVENTORY not persisted here).
// NOTE: no top-level 'use strict' — PURE blocks are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, m1, m2) { var a = src.indexOf(m1), b = src.indexOf(m2); if (a < 0 || b < 0) throw new Error('markers not found: ' + m1); return src.slice(a, b); }

var GS49 = read('specs/active/apps-script/49_api_v1_weekly_recommendation_job.gs');
var GS48 = read('specs/active/apps-script/48_api_v1_request_order_draft_job.gs');
var GS47 = read('specs/active/apps-script/47_api_v1_recommendation_generation.gs');
var GS45 = read('specs/active/apps-script/45_api_v1_automation_schedule.gs');

// ---- eval the 49_ module + the 47_ pure block + the whole 48_ module (production adapters only resolve when CALLED) ----
eval(GS49);
eval(slice(GS47, '// __GAPDRAFT_PURE_START__', '// __GAPDRAFT_PURE_END__'));
eval(GS48);
ok(typeof weeklyRecoStart_ === 'function' && typeof weeklyRecoContinue_ === 'function', 'X1 49_ orchestrator eval OK');
ok(typeof weeklyRecoDistinctScopes_ === 'function' && typeof weeklyRecoInterpretStart_ === 'function' && typeof weeklyRecoInterpretContinue_ === 'function', 'X2 49_ pure helpers eval OK');
ok(typeof reqDraftJobStart_ === 'function' && typeof reqDraftJobContinue_ === 'function', 'X3 real 48_ job eval OK');

// =============================================================================
// PURE HELPERS
// =============================================================================
section('PURE — scope enumeration (distinct, deterministic, READY-only)');
(function () {
  var rows = [
    { company: 'RES', country: 'US', marketplace: 'AMAZON_US', calculation_status: 'READY' },
    { company: 'KM', country: 'US', marketplace: 'AMAZON_US', calculation_status: 'READY' },
    { company: 'KM', country: 'US', marketplace: 'AMAZON_US', calculation_status: 'READY' },   // dup scope
    { company: 'KM', country: 'TW', marketplace: 'SHOPEE', calculation_status: 'BLOCKED' },      // not READY
    { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', calculation_status: 'READY' }
  ];
  var s = weeklyRecoDistinctScopes_(rows);
  eq(s.map(function (x) { return x.company + '/' + x.country + '/' + x.marketplace; }),
     ['KM/CA/AMAZON_CA', 'KM/US/AMAZON_US', 'RES/US/AMAZON_US'], 'P1 distinct READY scopes, sorted, dedup, non-READY dropped');
  eq(weeklyRecoDistinctScopes_(rows), weeklyRecoDistinctScopes_(rows.slice().reverse()), 'P2 order-independent (deterministic queue on a duplicate/retry fire)');
})();

section('PURE — 48_ envelope interpretation');
(function () {
  eq(weeklyRecoInterpretStart_({ success: true, data: { runId: 'R1', status: 'RUNNING' } }), { kind: 'STARTED', runId: 'R1' }, 'P3 fresh START → STARTED');
  eq(weeklyRecoInterpretStart_({ success: true, data: { alreadyRunning: true, sameScope: true, runId: 'R1' } }), { kind: 'ADOPT', runId: 'R1' }, 'P4 same-scope running → ADOPT');
  eq(weeklyRecoInterpretStart_({ success: true, data: { alreadyRunning: true, sameScope: false, busy: true, runId: 'RX' } }), { kind: 'BUSY', runId: 'RX' }, 'P5 foreign job → BUSY');
  eq(weeklyRecoInterpretStart_({ success: false, errors: [{ code: 'REQUEST_ORDER_DRAFT_EMPTY_SCOPE' }] }), { kind: 'EMPTY', code: 'REQUEST_ORDER_DRAFT_EMPTY_SCOPE' }, 'P6 empty scope → EMPTY');
  eq(weeklyRecoInterpretStart_({ success: false, errors: [{ code: 'ORDER_PLANNING_GAP_NOT_READY' }] }), { kind: 'NOT_READY', code: 'ORDER_PLANNING_GAP_NOT_READY' }, 'P7 gap not ready → NOT_READY');
  eq(weeklyRecoInterpretContinue_({ success: true, data: { status: 'RUNNING', hasMore: true, counts: { created: 2 } } }), { kind: 'PROGRESS', counts: { created: 2 } }, 'P8 continue running → PROGRESS');
  eq(weeklyRecoInterpretContinue_({ success: true, data: { status: 'DONE', hasMore: false, counts: { created: 3, reused: 1 } } }), { kind: 'DONE', counts: { created: 3, reused: 1 } }, 'P9 continue DONE → DONE');
  eq(weeklyRecoInterpretContinue_({ success: true, data: { busy: true } }), { kind: 'BUSY' }, 'P10 continue lease-busy → BUSY');
  var c = { created: 0, reused: 0, regenerated: 0, needsConfirmation: 0, blockedConflict: 0, notReady: 0, failed: 0 };
  weeklyRecoFold48Counts_(c, { created: 3, reused: 1, blockedConflict: 2 });
  eq([c.created, c.reused, c.blockedConflict], [3, 1, 2], 'P11 counts folded from 48_ (scheduler never recomputes)');
})();

// =============================================================================
// FAKE-ENV ORCHESTRATION (49_ driving a simulated 48_)
// =============================================================================
function sim48(scopeJobs) {
  // scopeJobs: key → { total, perStep, counts }.  Models the single-active 48_ slot + per-scope resumable job.
  var live = null;
  return {
    start: function (scope) {
      var key = scope.company + '||' + scope.country + '||' + scope.marketplace, def = scopeJobs[key];
      if (!def) return { success: false, errors: [{ code: 'REQUEST_ORDER_DRAFT_EMPTY_SCOPE' }] };
      if (live && !live.done && live.key !== key) return { success: true, data: { alreadyRunning: true, sameScope: false, busy: true, runId: live.runId } };
      live = { key: key, runId: 'ROD-' + key, cursor: 0, total: def.total, perStep: def.perStep || def.total, counts: def.counts || { created: def.total }, done: false };
      return { success: true, data: { runId: live.runId, status: 'RUNNING', total: def.total, cursor: 0 } };
    },
    cont: function (runId) {
      if (!live || live.runId !== runId) return { success: true, data: { status: 'NONE', runId: runId } };
      live.cursor = Math.min(live.total, live.cursor + live.perStep);
      var more = live.cursor < live.total; if (!more) live.done = true;
      return { success: true, data: { status: more ? 'RUNNING' : 'DONE', cursor: live.cursor, total: live.total, hasMore: more, counts: live.done ? live.counts : {} } };
    }
  };
}
function makeWk(cfg) {
  cfg = cfg || {};
  var store = {}, clock = { ms: cfg.startMs || 1000 }, tok = { n: 0 }, lockHeld = cfg.sharedLock || { v: false };
  var trig = { armed: 0, cleared: 0, delays: [], throwOnArm: !!cfg.throwOnArm };
  var calls = { start: [], cont: [] };
  var env = {
    props: { get: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, set: function (k, v) { store[k] = v; }, del: function (k) { delete store[k]; } },
    lock: { acquire: function () { if (lockHeld.v) return false; lockHeld.v = true; return true; }, release: function () { lockHeld.v = false; } },
    timestamp: function () { return 'T' + clock.ms; },
    nowMs: function () { return clock.ms; },
    token: function () { tok.n++; return 'wtok' + tok.n; },
    newRunId: function () { return cfg.runId || 'WREC-1'; },
    envelope: function (okv, data, code, msg) { return okv ? { success: true, data: data, errors: [] } : { success: false, data: null, errors: [{ code: code, message: msg }] }; },
    planningCycle: function () { return cfg.cycle || 'RECO-2026-08'; },
    gapReady: function () { return cfg.gapReady || { ready: true, status: 'DONE' }; },
    enumerateScopes: function () { return (cfg.scopes || []).slice(); },
    startScopeJob: function (scope, opts) { calls.start.push({ scope: scope, opts: opts }); return (cfg.startFn || function () { return { success: false, errors: [{ code: 'NO_SIM' }] }; })(scope, opts); },
    continueScopeJob: function (runId) { calls.cont.push(runId); return (cfg.contFn || function () { return { success: true, data: { status: 'NONE' } }; })(runId); },
    scheduleContinuation: function (ms) { if (trig.throwOnArm) throw new Error('trigger auth/quota'); trig.armed++; trig.delays.push(ms); },
    clearContinuation: function () { trig.cleared++; }
  };
  env._store = store; env._clock = clock; env._trig = trig; env._calls = calls; env._lockHeld = lockHeld;
  return env;
}
function wkState(env) { var raw = env._store[WEEKLY_RECO_PROP_KEY_]; return raw ? JSON.parse(raw) : null; }
function driveWk(env, maxFires) {
  var s = weeklyRecoStart_(env), fires = 0, last = s;
  while (fires < (maxFires || 200)) {
    var st = wkState(env);
    if (!st || weeklyRecoIsTerminal_(st.status)) break;
    last = weeklyRecoContinue_(env); fires++;
  }
  return { start: s, last: last, fires: fires, state: wkState(env) };
}
var SC = function (c, co, m) { return { company: c, country: co, marketplace: m }; };

section('A1 — weekly START enumerates scopes + arms the FIRST continuation (fast, no scope driven)');
(function () {
  var sim = sim48({ 'KM||US||AMAZON_US': { total: 3 } });
  var env = makeWk({ scopes: [SC('KM', 'US', 'AMAZON_US')], startFn: sim.start, contFn: sim.cont });
  var s = weeklyRecoStart_(env);
  eq([s.success, s.data.status, s.data.scopesTotal], [true, 'PENDING', 1], 'A1a START → PENDING with queue');
  ok(env._trig.armed === 1 && env._calls.start.length === 0, 'A1b first continuation armed; NO scope driven in the request');
})();

section('A2 — one scope drives to DONE across self-arming steps; counts folded (persisted actionable draft)');
(function () {
  var sim = sim48({ 'KM||US||AMAZON_US': { total: 5, perStep: 2, counts: { created: 4, reused: 1 } } });
  var env = makeWk({ scopes: [SC('KM', 'US', 'AMAZON_US')], startFn: sim.start, contFn: sim.cont });
  var r = driveWk(env);
  eq([r.state.status, r.state.counts.scopesDone], ['DONE', 1], 'A2a run DONE, 1 scope persisted');
  eq([r.state.counts.created, r.state.counts.reused], [4, 1], 'A2b 48_ per-SKU counts folded (create/reuse)');
  ok(env._calls.start.length === 1 && env._calls.cont.length >= 3, 'A2c drove the 48_ job START + multiple CONTINUE (browserless)');
  ok(env._calls.start[0].opts.mode === 'SCHEDULED_REFRESH', 'A2d 48_ START called with SCHEDULED_REFRESH mode');
})();

section('A3/A4 — multi-scope queue drains deterministically; same cycle supplied to every 48_ START');
(function () {
  var sim = sim48({ 'KM||US||AMAZON_US': { total: 2, counts: { created: 2 } }, 'RES||US||AMAZON_US': { total: 1, counts: { created: 1 } } });
  var env = makeWk({ scopes: [SC('KM', 'US', 'AMAZON_US'), SC('RES', 'US', 'AMAZON_US')], startFn: sim.start, contFn: sim.cont, cycle: 'RECO-2026-08' });
  var r = driveWk(env);
  eq([r.state.status, r.state.counts.scopesDone, r.state.counts.created], ['DONE', 2, 3], 'A3 both scopes persisted, counts summed');
  ok(env._calls.start.every(function (c) { return c.opts.planningCycle === 'RECO-2026-08'; }), 'A4 deterministic planning cycle on every scope START');
})();

section('A9 — duplicate weekly trigger fire is a no-op JOIN (never a 2nd run)');
(function () {
  var sim = sim48({ 'KM||US||AMAZON_US': { total: 2 } });
  var env = makeWk({ scopes: [SC('KM', 'US', 'AMAZON_US')], startFn: sim.start, contFn: sim.cont });
  var s1 = weeklyRecoStart_(env); var run1 = wkState(env).runId;
  var s2 = weeklyRecoStart_(env);
  eq([s2.success, s2.data.alreadyRunning, wkState(env).runId], [true, true, run1], 'A9 second START joins the same run');
})();

section('A10/A15 — duplicate continuation is idempotent; a lease-held run rejects a second concurrent worker (no browser)');
(function () {
  var sim = sim48({ 'KM||US||AMAZON_US': { total: 4, perStep: 2, counts: { created: 4 } } });
  var env = makeWk({ scopes: [SC('KM', 'US', 'AMAZON_US')], startFn: sim.start, contFn: sim.cont });
  weeklyRecoStart_(env);
  // simulate a stuck lease owned by another worker within the lease window
  var st = wkState(env); st.lease = { owner: 'other', expiresAtMs: env._clock.ms + 100000 }; st.status = 'RUNNING'; env._store[WEEKLY_RECO_PROP_KEY_] = JSON.stringify(st);
  var busy = weeklyRecoContinue_(env);
  ok(busy.data && busy.data.busy === true, 'A10 a lease-held run rejects a second concurrent worker (no double-advance)');
  st = wkState(env); st.lease = null; env._store[WEEKLY_RECO_PROP_KEY_] = JSON.stringify(st);
  var r = driveWk(env);
  eq([r.state.status, r.state.counts.created], ['DONE', 4], 'A15 drives to completion with zero frontend involvement');
})();

section('A8/A13/A14 — manual/scheduled collision: a FOREIGN 48_ job is deferred (bounded), never overwritten');
(function () {
  // 48_ is busy with a manual job for a DIFFERENT scope → our scope is BUSY every fire.
  var env = makeWk({
    scopes: [SC('KM', 'US', 'AMAZON_US')],
    startFn: function () { return { success: true, data: { alreadyRunning: true, sameScope: false, busy: true, runId: 'MANUAL-RUN' } }; },
    contFn: function () { return { success: true, data: { status: 'NONE' } }; }
  });
  var r = driveWk(env);
  eq([r.state.status, r.state.counts.scopesDeferred, r.state.counts.created], ['DONE', 1, 0], 'A8/A13 foreign manual job deferred (bounded), NOT overwritten; no draft forced');
  ok(env._calls.start.length === WEEKLY_RECO_MAX_DEFERRALS_, 'A14 bounded to MAX_DEFERRALS retries then advances (BLOCKED_CONFLICT semantics preserved by 48_/24_)');
})();

section('A11/A16 — timeout+retry safe; trigger-arm failure fails CLOSED (no dangling run, no leak)');
(function () {
  var env = makeWk({ scopes: [SC('KM', 'US', 'AMAZON_US')], throwOnArm: true, startFn: function () { return { success: true, data: { runId: 'X' } }; } });
  var s = weeklyRecoStart_(env);
  eq([s.success, (s.errors[0] || {}).code], [false, 'CONTINUATION_SCHEDULE_FAILED'], 'A16 START arm-throw → terminal FAILED, never a dangling PENDING');
  eq(wkState(env).status, 'FAILED', 'A11 persisted terminal (a retry sees FAILED, not an endless 0/N)');
})();

section('A18 — Administration disable still prevents execution (defensive per-job gate, 45_-owned config)');
(function () {
  ok(/recGenAutomationEnabled_\('monthlyOrderRecommendation'\)/.test(GS47) && /MONTHLY_ORDER_RECOMMENDATION_DISABLED/.test(GS47), 'A18 the Monthly Order trigger target no-ops unless the canonical config enables it');
})();

section('A5/A7/A2 — INTEGRATION: scheduler drives the REAL 48_ job (SHARED lock) → converges on the manual authority');
(function () {
  // Real 48_ env (fake domain io) — the SAME reqDraftJobStart_/reqDraftJobContinue_ the manual AI Plan uses.
  var persisted = [];
  var lockObj = { v: false };   // ONE shared script lock across 49_ and 48_ (production reality)
  var store48 = {}, clk = { ms: 5000 }, tk = { n: 0 };
  var env48 = {
    props: { get: function (k) { return Object.prototype.hasOwnProperty.call(store48, k) ? store48[k] : null; }, set: function (k, v) { store48[k] = v; }, del: function (k) { delete store48[k]; } },
    lock: { acquire: function () { if (lockObj.v) return false; lockObj.v = true; return true; }, release: function () { lockObj.v = false; } },
    timestamp: function () { return 'T' + clk.ms; }, nowMs: function () { return clk.ms; }, token: function () { tk.n++; return 't' + tk.n; },
    newRunId: function (scope) { return 'ROD-' + reqDraftJobScopeKey_(scope); },
    envelope: function (okv, data, code, msg) { return okv ? { success: true, data: data, errors: [] } : { success: false, data: null, errors: [{ code: code, message: msg }] }; },
    readGapBinding: function () { return { jobRunId: 'G1', jobStatus: 'DONE' }; },
    enumerateEligible: function () { return { skuList: ['S1', 'S2', 'S3'], planningCycle: 'RECO-2026-08' }; },
    readGapRowsMap: function () { return { S1: {}, S2: {}, S3: {} }; },
    readUpcMap: function () { return { S1: 6, S2: 6, S3: 6 }; },
    generateOneSku: function (scope, sku, gapRow, upc, opts) { persisted.push({ sku: sku, mode: opts.mode }); return { sku: sku, status: 'CREATED', draftId: 'D-' + sku }; },
    maxSkusPerContinue: 2, workerBudgetMs: 120000
  };
  var env49 = makeWk({
    scopes: [SC('KM', 'US', 'AMAZON_US')], sharedLock: lockObj,
    startFn: function (scope, opts) { return reqDraftJobStart_(env48, scope, { mode: opts.mode, planningCycle: opts.planningCycle, actor: opts.actor }); },
    contFn: function (runId) { return reqDraftJobContinue_(env48, runId); }
  });
  var r = driveWk(env49);
  eq(r.state.status, 'DONE', 'A2int scheduler drove the REAL 48_ job to DONE (shared lock — lock never held across the 48_ call)');
  eq(persisted.map(function (p) { return p.sku; }).sort(), ['S1', 'S2', 'S3'], 'A7 every SKU persisted via the SAME 24_-locked per-SKU authority the manual AI Plan uses');
  ok(persisted.every(function (p) { return p.mode === 'SCHEDULED_REFRESH'; }), 'A5 provenance: persisted with SCHEDULED_REFRESH (→ existing generation_type "scheduled")');
  eq(r.state.counts.created, 3, 'A2int folded 48_ create count = 3 (actionable persisted drafts)');
})();

// =============================================================================
// SOURCE-SCAN NEGATIVE CONSTRAINTS
// =============================================================================
section('A6/A12/A17 — reuse, no second engine, correct provenance (source scans)');
var GS49_NOCOMMENT = GS49.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(/gapJobDeleteTriggersByHandler_/.test(GS49_NOCOMMENT) && /ScriptApp\.newTrigger\(WEEKLY_RECO_CONTINUATION_HANDLER_\)/.test(GS49_NOCOMMENT), 'A17a reuses 46_ SAFE trigger delete-by-handler + one-off .after() arming (no new trigger infra)');
ok(/handleStartRequestOrderDraftJob_/.test(GS49_NOCOMMENT) && /handleContinueRequestOrderDraftJob_/.test(GS49_NOCOMMENT), 'A17c persistence delegated to the EXISTING 48_ job handlers (no reimplementation)');
ok(/WEEKLY_RECO_MODE_\s*=\s*'SCHEDULED_REFRESH'/.test(GS49), 'A6 provenance mode = SCHEDULED_REFRESH (existing vocabulary; no new status invented)');
ok(!/appendRow|\.setValues\(|insertSheet|deleteRow|clearContents|CREATE TABLE|prodMigrate/i.test(GS49_NOCOMMENT), 'A17d writes NO sheet/row itself (orchestration only; the 48_/24_ owner persists; the only Spreadsheet touch is a READ of the gap table for scope enumeration)');
ok(!/KMREC\.generateBatch|calculateGap|KMSF|generateRecommendation[^D]|second.?engine/i.test(GS49_NOCOMMENT), 'A17e authors NO recommendation/gap formula (no second engine)');
ok(/Script Properties/i.test(GS49) && /KM_WEEKLY_RECO_RUN/.test(GS49) && !/new (DB )?table|schema change/i.test(GS49_NOCOMMENT), 'A17f state = Script Properties only (no new DB table/schema)');
// INVENTORY is NOT persisted here — the 49_ orchestrator is ORDER_PLANNING only; INVENTORY stays a summary in 47_.
ok(/WEEKLY_RECO_PRODUCT_\s*=\s*'ORDER_PLANNING'/.test(GS49), 'A17g scheduler persistence scoped to ORDER_PLANNING (the Request Order workflow)');
ok(/INVENTORY/.test(GS47) && /SUMMARY/.test(GS47), 'A17h INVENTORY retained as the existing non-persistent summary (no second engine for inventory)');

section('A19/A20 — Administration scheduler + RO workflow untouched (F1-6B: Monthly Order owns the persistence run)');
ok(/key: 'monthlyOrderRecommendation'/.test(GS45) && /handler: 'runMonthlyOrderRecommendation'/.test(GS45), 'A19 45_ registry owns the MONTHLY Order Recommendation trigger (runMonthlyOrderRecommendation); max-one-trigger reconciler unchanged');
ok(/continueWeeklyRecommendationJob/.test(GS49) && !/continueWeeklyRecommendationJob/.test(GS45), 'A19b the one-off continuation handler is DISTINCT from the recurring 45_ trigger (never in the 45_ allowlist)');
ok(/function runMonthlyOrderRecommendation\(\)/.test(GS47) && /weeklyRecoStart_\(weeklyRecoDefaultEnv_\(\)\)/.test(GS47), 'A20 runMonthlyOrderRecommendation starts the persistence run via 49_ (RO/PO workflow itself unchanged)');

// =============================================================================
console.log('\n----------------------------------------');
console.log('WEEKLY RECOMMENDATION PERSISTENCE (F1-6B Part A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
