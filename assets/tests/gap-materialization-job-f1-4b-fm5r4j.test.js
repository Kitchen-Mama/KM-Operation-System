// Kitchen Mama Operation System — F1-4B-FM5-R4J Backend-Owned Resumable Gap Materialization Job.
// Run: node assets/tests/gap-materialization-job-f1-4b-fm5r4j.test.js
// -----------------------------------------------------------------------------
// The ~14-min all-site materialization is now a BACKEND-OWNED RESUMABLE job: one click STARTs one logical job
// (Script-Property state, cursor=0, first continuation scheduled) and returns immediately; self-re-arming one-off
// continuation triggers process BOUNDED scope chunks until a TERMINAL state; the browser only STARTs + polls a
// READ-ONLY status. Order Planning chunks by WHOLE COMPANY so the shared Overseas/Factory allocation stays
// conserved (a company is the exact competing-set boundary). The job engine is fully injectable (env) so the
// entire PENDING→RUNNING→DONE lifecycle is proven deterministically with fakes (no Apps Script runtime). The
// client poller is proven with a fake clock. Formulas/mappings are untouched (43 slice processors reused verbatim).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var F42 = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var F43 = read('specs/active/apps-script/43_api_v1_gap_materialization.gs');
var F46 = read('specs/active/apps-script/46_api_v1_gap_materialization_job.gs');
var F44 = read('specs/active/apps-script/44_gap_materialization_scheduler.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var INV_JS = read('js/pages/inventory-replenishment.js');
var RO_JS = read('js/pages/request-order.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var GR = require('../js/utils/gap-recalc-transport.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// Handler-eval harness: define BUNDLE + 42 + 43 + 46 in one scope (Apps Script globals only referenced when the
// PRODUCTION adapters are called — the engine tests inject a fake env, so none are needed at define time).
var PRE = 'function prodRequireSheet_(ss, name){ if (ss && ss.__missingSheet) throw new Error("MISSING_SHEET:"+name); return (ss && ss.getSheetByName) ? (ss.getSheetByName(name) || {__sheet:true}) : {__sheet:true}; }\n';
var H = (new Function(BUNDLE + '\n' + F42 + '\n' + PRE + F43 + '\n' + F46 + '\n return {' +
  ' start: gapJobStart_, cont: gapJobContinue_, status: gapJobStatus_,' +
  ' orderedScopes: gapJobOrderedScopes_, nextSlice: gapJobNextSlice_,' +
  ' isOwnedCont: gapJobIsOwnedContinuationHandler_, normalizeProduct: gapJobNormalizeProduct_,' +
  ' buildAlloc: gapOpBuildSupplyAllocation_, receiverKey: gapReceiverKey_,' +
  ' INV_CHUNK: GAP_JOB_INV_CHUNK_SCOPES_, PROP_KEYS: GAP_JOB_PROP_KEYS_, CONT_HANDLERS: GAP_JOB_CONTINUATION_HANDLERS_ };'))();

// ---- injectable fake env: Script Properties + lock + scheduler + clock + slice processor (all recorded) --------
function fakeEnv(opts) {
  opts = opts || {};
  var store = {}, scheduled = [], cleared = [], processed = [], resolveCalls = 0, clock = 0, lockHeld = false;
  var msClock = (opts.startMs != null ? opts.startMs : 0);   // R4J-LIVE2 progress clock (epoch ms); advanceable by a test
  var throwOnce = opts.throwSliceOnce ? { hit: false } : null;
  var lockFlags = { block: opts.lockGranted === false };   // mutable so a test can let START acquire, then block continuations
  return {
    _store: store, _scheduled: scheduled, _cleared: cleared, _processed: processed, _lockFlags: lockFlags,
    _advanceMs: function (d) { msClock += d; }, _setMs: function (v) { msClock = v; },
    nowMs: function () { return msClock; },
    get _resolveCalls() { return resolveCalls; },
    props: { get: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; }, set: function (k, v) { store[k] = v; }, del: function (k) { delete store[k]; } },
    lock: opts.noLock ? null : { acquire: function () { if (lockFlags.block) return false; if (lockHeld) return false; lockHeld = true; return true; }, release: function () { lockHeld = false; } },
    resolveContext: function (p) { resolveCalls++; return opts.ctx || { ok: true, jobType: p, calculationDate: (p === 'ORDER_PLANNING' ? '2026-08-09' : '2026-08-10'), calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' }; },
    openTarget: function () { return opts.ss || { __ss: true }; },
    requireResultSheet: function () { if (opts.missingSheet) throw new Error('MISSING_SHEET'); return { __sheet: true }; },
    enumerateScopes: function () { return (opts.scopes || []).slice(); },
    newRunId: function (p) { return 'GAP-' + (p === 'ORDER_PLANNING' ? 'OP' : 'INV') + '-20260810T000000-0001'; },
    timestamp: function () { clock++; return '2026-08-10 00:00:' + ('0' + (clock % 60)).slice(-2); },
    scheduleContinuation: function (p, ms) { if (opts.scheduleThrows) throw new Error('SCHEDULE_TRIGGER_FAILED'); scheduled.push({ product: p, ms: ms }); },
    clearContinuationTriggers: function (p) { cleared.push(p); },
    processSlice: opts.processSlice || function (product, sliceScopes, ss, sheet, ctx) {
      if (opts.throwSliceAlways) throw new Error('ALWAYS_SLICE_FAILURE');
      if (throwOnce && !throwOnce.hit) { throwOnce.hit = true; throw new Error('SIMULATED_SLICE_FAILURE'); }
      processed.push({ scopes: sliceScopes.map(function (s) { return s.company + '/' + s.country + '/' + s.marketplace; }), calcDate: ctx.calculationDate, calcMonth: ctx.calculationMonth });
      return { scopesCalculated: sliceScopes.length, written: sliceScopes.length * 2, ready: sliceScopes.length * 2, blocked: 0, errors: 0, scopeErrors: [] };
    }
  };
}
function invScopes(n) { var out = []; for (var i = 0; i < n; i++) out.push({ company: 'KM', country: 'C' + i, marketplace: 'AMAZON_C' + i }); return out; }
function isTerminal(s) { return s === 'DONE' || s === 'FAILED' || s === 'BLOCKED' || s === 'ERROR'; }
function drain(env, product, max) {   // fire the continuation worker until terminal (or a bounded number of times)
  var last = null;
  for (var i = 0; i < (max || 50); i++) { last = H.cont(product, env); if (last && isTerminal(last.status)) break; }
  return last;
}

// =============================================================================================================
section('§3/§22 — START enqueues quickly (PENDING), NO calculation in the request');
var e1 = fakeEnv({ scopes: invScopes(7) });
var s1 = H.start('INVENTORY', e1);
ok(s1 && s1.success === true && s1.data.status === 'PENDING', 'A1 START returns success + PENDING');
eq(s1.data.scopesTotal, 7, 'A2 START reports scopesTotal (enumerated) without calculating');
eq(e1._processed.length, 0, 'A3 NO slice was calculated during START (browser-independent: returns before any work)');
eq(e1._scheduled.length, 1, 'A4 START scheduled exactly ONE continuation');
ok(/"status":"PENDING"/.test(e1._store[H.PROP_KEYS.INVENTORY]) && /"scopeCursor":0/.test(e1._store[H.PROP_KEYS.INVENTORY]), 'A5 Script-Property job state persisted with cursor=0');

section('§17 — double START → same logical run, NEVER a second job/worker chain');
var s1b = H.start('INVENTORY', e1);
ok(s1b.success === true && s1b.data.alreadyRunning === true, 'B1 second START returns alreadyRunning');
eq(s1b.data.runId, s1.data.runId, 'B2 same runId (one logical job)');
eq(e1._scheduled.length, 1, 'B3 the second START scheduled NO extra continuation (no duplicate worker chain)');

section('§5/§22 — continuation processes BOUNDED chunks, RUNNING…, cursor resumes, then DONE');
var e2 = fakeEnv({ scopes: invScopes(7) });
H.start('INVENTORY', e2);
var c1 = H.cont('INVENTORY', e2);
eq([c1.status, c1.scopeCursor, c1.scopesProcessed], ['RUNNING', 1, 1], 'C1 first continuation → RUNNING, cursor 1 (R4J-LIVE2 chunk = 1 scope)');
eq(e2._processed[0].scopes, ['KM/C0/AMAZON_C0'], 'C2 processed exactly the first scope');
var c2 = H.cont('INVENTORY', e2);
eq([c2.status, c2.scopeCursor], ['RUNNING', 2], 'C3 second continuation resumes at cursor 1 → 2 (not from 0)');
var cLast = c2; for (var _ci = 0; _ci < 12 && cLast.status !== 'DONE'; _ci++) cLast = H.cont('INVENTORY', e2);   // drain the rest
eq([cLast.status, cLast.scopeCursor, cLast.finishedAt !== null], ['DONE', 7, true], 'C4 draining every scope → DONE at cursor 7 with finishedAt set');
eq(e2._processed.map(function (p) { return p.scopes.length; }), [1, 1, 1, 1, 1, 1, 1], 'C5 every slice was a single scope (bounded; never the whole universe at once)');
var afterDone = H.cont('INVENTORY', e2);
eq(afterDone.status, 'DONE', 'C6 continuation after DONE is a no-op (idempotent terminal)');
eq(e2._processed.length, 7, 'C7 no extra slice processed after DONE');
eq(H.INV_CHUNK, 1, 'C8 Inventory chunk size = 1 scope/continuation (R4J-LIVE2 §8 — always within the ~6-min execution budget → the worker always re-arms)');

section('§10 — a slice failure does NOT advance the cursor or lose work; bounded retry; idempotent re-run');
var e3 = fakeEnv({ scopes: invScopes(4), throwSliceOnce: true });
H.start('INVENTORY', e3);
var f1 = H.cont('INVENTORY', e3);   // first slice throws
eq([f1.status, f1.scopeCursor, f1.sliceAttempts], ['RUNNING', 0, 1], 'D1 slice failure keeps cursor=0 (no lost/duplicated work), attempts=1, still RUNNING');
ok(/SIMULATED_SLICE_FAILURE/.test(f1.lastError || ''), 'D2 lastError recorded');
eq(e3._scheduled.length, 2, 'D3 re-armed a continuation (START=1 + retry=1) — recoverable from the saved cursor');
var f2 = H.cont('INVENTORY', e3);   // retry: same slice (cursor still 0) now succeeds → reprocessed idempotently
eq([f2.scopeCursor, f2.sliceAttempts], [1, 0], 'D4 retry reprocesses the SAME slice from cursor 0 (idempotent UPSERT) then advances by 1; attempts reset');
eq(e3._processed[0].scopes[0], 'KM/C0/AMAZON_C0', 'D5 the retried slice is the same first scope set');

section('§8 — STATUS is strictly READ-ONLY (no write, no schedule, no calculation)');
var e4 = fakeEnv({ scopes: invScopes(5) });
H.start('INVENTORY', e4); H.cont('INVENTORY', e4);
var storeBefore = JSON.stringify(e4._store), schedBefore = e4._scheduled.length, procBefore = e4._processed.length;
var st = H.status('INVENTORY', null, e4);
ok(st.success === true && st.data.status && st.data.scopesTotal === 5, 'E1 STATUS returns the public job state');
eq([JSON.stringify(e4._store) === storeBefore, e4._scheduled.length === schedBefore, e4._processed.length === procBefore], [true, true, true], 'E2 STATUS mutated nothing (no write / no schedule / no slice)');
ok(st.data.calculationDate && st.data.finishedAt === null && st.data.lastError === undefined ? true : ('lastError' in st.data), 'E3 STATUS exposes the progress/context fields');

section('§18/§19 — calculation context FROZEN at START across all slices (midnight-safe)');
var e5 = fakeEnv({ scopes: invScopes(7) });
H.start('INVENTORY', e5);
drain(e5, 'INVENTORY');
var dates = e5._processed.map(function (p) { return p.calcDate; });
eq(dates, ['2026-08-10', '2026-08-10', '2026-08-10', '2026-08-10', '2026-08-10', '2026-08-10', '2026-08-10'], 'F1 every (single-scope) slice used the START-frozen calculationDate (no midnight drift)');
eq(e5._resolveCalls, 1, 'F2 calc context resolved EXACTLY once (at START) — continuations never re-resolve from the wall clock');

section('§14/§17 — scheduled + manual share the owner: an active job blocks a duplicate START');
var e6 = fakeEnv({ scopes: invScopes(3) });
var manual = H.start('INVENTORY', e6);        // manual button
var sched = H.start('INVENTORY', e6);         // daily scheduler while it is still PENDING/RUNNING
eq([manual.data.status, sched.data.alreadyRunning, sched.data.runId], ['PENDING', true, manual.data.runId], 'G1 the scheduler START joins the SAME run (SKIPPED_ALREADY_RUNNING semantics) — never a competing job');

section('§3 — START fails CLOSED if the result table/header is missing');
var e7 = fakeEnv({ scopes: invScopes(2), missingSheet: true });
var s7 = H.start('INVENTORY', e7);
ok(s7.success === false, 'H1 START on a missing/invalid result sheet → failure envelope (never a fabricated job)');
eq(e7._scheduled.length, 0, 'H2 no continuation scheduled when START fails closed');

section('§11 — trigger hygiene: continuation deletes ONLY its own handler; Amazon + daily untouched');
var e8 = fakeEnv({ scopes: invScopes(2) });
H.start('INVENTORY', e8); H.cont('INVENTORY', e8);
ok(e8._cleared.indexOf('INVENTORY') !== -1, 'I1 the worker cleared its own product continuation triggers before processing (no accumulation)');
eq([H.isOwnedCont('continueInventoryGapMaterializationJob'), H.isOwnedCont('continueOrderPlanningGapMaterializationJob')], [true, true], 'I2 the two continuation handlers are job-owned');
eq([H.isOwnedCont('runAmazonSnapshotImports'), H.isOwnedCont('runDailyInventoryGapMaterialization'), H.isOwnedCont('runDailyOrderPlanningGapMaterialization')], [false, false, false], 'I3 Amazon import + the daily scheduler handlers are NOT job-owned (continuation cleanup can never delete them)');
var F46_NOCOMMENT = F46.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/runAmazonSnapshotImports|runDailyInventoryGapMaterialization|runDailyOrderPlanningGapMaterialization/.test(F46_NOCOMMENT), 'I4 46.gs CODE never references the Amazon/daily handlers (continuation cleanup cannot touch them)');

section('R4J-LIVE §A2 — FAIL-CLOSED: a worker that irrecoverably fails becomes FAILED, never infinite RUNNING 0/N');
var eFail = fakeEnv({ scopes: invScopes(4), throwSliceAlways: true });
H.start('INVENTORY', eFail);
var fdrain = drain(eFail, 'INVENTORY');
eq([fdrain.status, fdrain.scopeCursor], ['FAILED', 0], 'L1 a slice that always throws → terminal FAILED at cursor 0 (bounded retry, never infinite RUNNING)');
ok(fdrain.finishedAt && /ALWAYS_SLICE_FAILURE/.test(fdrain.lastError || ''), 'L2 FAILED persists finishedAt + lastError (truthful failure)');
ok((eFail._processed.length === 0) && fdrain.sliceAttempts >= 3, 'L3 exactly the bounded number of attempts, then stop (no infinite re-arm)');
var afterFail = H.cont('INVENTORY', eFail);
eq(afterFail.status, 'FAILED', 'L4 continuation after FAILED is a terminal no-op');

section('R4J-LIVE §A2/§A3 — START fails CLOSED if the continuation cannot be scheduled (no dangling PENDING 0/N)');
var eSched = fakeEnv({ scopes: invScopes(5), scheduleThrows: true });
var sSched = H.start('INVENTORY', eSched);
ok(sSched.success === false && /CONTINUATION_SCHEDULE_FAILED/.test((sSched.errors && sSched.errors[0] && sSched.errors[0].code) || ''), 'M1 trigger-scheduling failure at START → START returns an explicit failure (the "Error" the user saw)');
var mSt = H.status('INVENTORY', null, eSched).data;
eq(mSt.status, 'FAILED', 'M2 the stored job state is TERMINAL FAILED — NOT a dangling PENDING that would poll 0/N forever');
ok(/CONTINUATION_SCHEDULE_FAILED/.test(mSt.lastError || ''), 'M3 lastError names the schedule failure (points at trigger auth/quota on the live run)');
ok(eSched._cleared.indexOf('INVENTORY') !== -1, 'M4 START cleared any stale continuation trigger first (at-most-one per product)');

section('R4J-LIVE §A2 — a permanently stuck LOCK becomes FAILED (bounded), never infinite RESCHEDULED_LOCKED');
var eLock = fakeEnv({ scopes: invScopes(3) });
H.start('INVENTORY', eLock);                                    // START acquires+releases the lock normally (job created)
eLock._lockFlags.block = true;                                  // now simulate a permanently stuck lock for every continuation
var lockLast = null; for (var li = 0; li < 20; li++) { lockLast = H.cont('INVENTORY', eLock); if (lockLast && lockLast.status === 'FAILED') break; }
var lockSt = H.status('INVENTORY', null, eLock).data;
eq(lockSt.status, 'FAILED', 'N1 after the bounded lock-wait limit the job is FAILED (never an infinite 0/N reschedule loop)');
ok(/LOCK_UNAVAILABLE_TIMEOUT/.test(lockSt.lastError || ''), 'N2 lastError records the lock timeout');

section('R4J-LIVE §A5 — lifecycle DIAGNOSTICS pinpoint the broken edge (timestamps + last scope; no per-SKU payload)');
var eDiag = fakeEnv({ scopes: invScopes(7) });
var sDiag = H.start('INVENTORY', eDiag);
var startState = JSON.parse(eDiag._store[H.PROP_KEYS.INVENTORY]);
ok(startState.lastContinuationScheduledAt && startState.lastWorkerStartedAt === null, 'O1 after START: lastContinuationScheduledAt set, lastWorkerStartedAt still null (⇒ if it stays null live, the trigger never fired)');
H.cont('INVENTORY', eDiag);
var afterCont = JSON.parse(eDiag._store[H.PROP_KEYS.INVENTORY]);
ok(afterCont.lastWorkerStartedAt && afterCont.lastWorkerFinishedAt && afterCont.lastProcessedScope === 'KM/C0/AMAZON_C0', 'O2 after one continuation (single-scope): worker start/finish timestamps + lastProcessedScope recorded');
var pub = H.status('INVENTORY', null, eDiag).data;
ok('lastWorkerStartedAt' in pub && 'lastContinuationScheduledAt' in pub && 'lastProcessedScope' in pub, 'O3 STATUS surfaces the diagnostics (read-only) for live triage');
ok(!/sku|SKU|rows\s*:\s*\[/.test(JSON.stringify(pub)), 'O4 diagnostics are counts/timestamps only — no per-SKU payload');

section('§5/§7 — Order Planning chunks by WHOLE COMPANY (never splits a company across slices)');
var opScopes = [{ company: 'A', country: 'US', marketplace: 'AMAZON_US' }, { company: 'B', country: 'US', marketplace: 'AMAZON_US' }, { company: 'A', country: 'UK', marketplace: 'AMAZON_UK' }];
eq(H.orderedScopes(opScopes).map(function (s) { return s.company; }), ['A', 'A', 'B'], 'J1 scopes are grouped by company (stable first-appearance order) so a company is contiguous');
var ordered = H.orderedScopes(opScopes);
var slice0 = H.nextSlice('ORDER_PLANNING', ordered, 0);
eq([slice0.scopes.map(function (s) { return s.company + '/' + s.country; }), slice0.nextCursor], [['A/US', 'A/UK'], 2], 'J2 OP slice 0 = the WHOLE of company A (both scopes), cursor → 2');
var slice1 = H.nextSlice('ORDER_PLANNING', ordered, 2);
eq([slice1.scopes.map(function (s) { return s.company + '/' + s.country; }), slice1.nextCursor], [['B/US'], 3], 'J3 OP slice 1 = the whole of company B, cursor → 3 (done)');
var invSlice = H.nextSlice('INVENTORY', H.orderedScopes(invScopes(7)), 0);
eq(invSlice.nextCursor, 1, 'J4 INVENTORY slices by scope count (1 per continuation), independent of company');

section('§7 — SHARED-POOL CONSERVATION: per-company allocation == monolithic (real KMMSA; chunk boundary is inert)');
// Two companies share SKU X (factory pool is keyed by SKU). Company A contends 2 marketplaces for a small pool.
function opReceivers() {
  return [
    { company: 'A', country: 'US', marketplace: 'AMAZON_US', sku: 'X', demandQty: 100, allocationPriority: 1, requiredByDate: '2026-09-01' },
    { company: 'A', country: 'US', marketplace: 'WALMART_US', sku: 'X', demandQty: 100, allocationPriority: 0, requiredByDate: '2026-09-01' },
    { company: 'B', country: 'US', marketplace: 'AMAZON_US', sku: 'X', demandQty: 100, allocationPriority: 0, requiredByDate: '2026-09-01' }
  ].map(function (r) { r.key = H.receiverKey(r.company, r.country, r.marketplace, r.sku); return r; });
}
var poolFacts = {
  overseasPoolsByKey: { 'A||US||X': [{ poolKey: 'OV:WA:X', poolType: 'THREE_PL', warehouseId: 'WA', effectiveSupplyQty: 120 }], 'B||US||X': [{ poolKey: 'OV:WB:X', poolType: 'THREE_PL', warehouseId: 'WB', effectiveSupplyQty: 80 }] },
  factoryPoolsBySku: { 'X': [{ poolKey: 'FC:WF:X', poolType: 'FACTORY', warehouseId: 'WF', effectiveSupplyQty: 60 }] },
  eligibleFactoryWarehouseIds: ['WF'], priorityByMkt: {}
};
var recv = opReceivers();
var mono = H.buildAlloc(recv, poolFacts).byReceiverKey;                               // ALL companies at once (monolithic)
var aOnly = H.buildAlloc(recv.filter(function (r) { return r.company === 'A'; }), poolFacts).byReceiverKey;   // per-company slices
var bOnly = H.buildAlloc(recv.filter(function (r) { return r.company === 'B'; }), poolFacts).byReceiverKey;
var merged = {}; [aOnly, bOnly].forEach(function (m) { for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) merged[k] = m[k]; });
eq(merged, mono, 'K1 per-company allocation (union of company-A + company-B slices) is BYTE-IDENTICAL to the monolithic allocation → chunk boundaries never change allocation');
ok(Object.keys(mono).length > 0, 'K2 the scenario actually exercised the shared-pool allocator (non-empty result)');

// =============================================================================================================
section('R4J-LIVE2 §5/§7 — a STALLED non-terminal job is RECLAIMED by a new START; a LIVE job is never reclaimed');
// LIVE job: updatedAtMs advancing → the duplicate guard holds (alreadyRunning, same run, no extra worker chain).
var eLive = fakeEnv({ scopes: invScopes(3), startMs: 1000000 });
var live1 = H.start('INVENTORY', eLive);
eLive._advanceMs(1000);                           // 1s later — well within the stale window
var live2 = H.start('INVENTORY', eLive);
eq([live2.data.alreadyRunning, live2.data.runId], [true, live1.data.runId], 'Q1 a fresh/advancing job blocks a duplicate START (alreadyRunning, same run) — §7 no duplicate job');
eq(eLive._scheduled.length, 1, 'Q2 no extra continuation scheduled for the live job (no second worker chain)');
// STALLED job: a worker killed just after START (progress frozen at 0/N) + > stale window elapsed → START reclaims.
var eStale = fakeEnv({ scopes: invScopes(3), startMs: 1000000 });
var stale1 = H.start('INVENTORY', eStale);        // PENDING, updatedAtMs=1000000, 1 continuation scheduled
eStale._advanceMs(700000);                        // 700s later, still 0/N — the worker was killed with no re-arm
var stale2 = H.start('INVENTORY', eStale);        // the user clicks again
ok(stale2.success === true && stale2.data.status === 'PENDING' && !stale2.data.alreadyRunning, 'Q3 a STALLED job (no progress > 10-min window) is reclaimed → a FRESH job starts so the user can retry (§5 recoverable)');
eq(eStale._scheduled.length, 2, 'Q4 exactly ONE new continuation scheduled for the fresh job (START#1 + reclaim START#2) — never an automatic retry');
ok(eStale._cleared.filter(function (p) { return p === 'INVENTORY'; }).length >= 1, 'Q5 reclaim cleared the orphaned continuation trigger before starting fresh');
var reclaimedStore = JSON.parse(eStale._store[H.PROP_KEYS.INVENTORY]);
eq([reclaimedStore.status, reclaimedStore.scopeCursor], ['PENDING', 0], 'Q6 the stored state is the FRESH PENDING job (the stalled one was marked FAILED then replaced) — never two live jobs on one key');

// =============================================================================================================
section('poller — runJob: START once → READ-ONLY status poll → refresh on DONE (fake clock)');
var immediate = function () { return Promise.resolve(); };
(function () {
  var startCalls = 0, statusSeq = [{ status: 'PENDING', scopesProcessed: 0, scopesTotal: 3 }, { status: 'RUNNING', scopesProcessed: 2, scopesTotal: 3 }, { status: 'DONE', scopesProcessed: 3, scopesTotal: 3 }], i = 0;
  var refreshed = 0, ui = { events: [] };
  var startFn = function () { startCalls++; return Promise.resolve({ success: true, data: { runId: 'R1', status: 'PENDING', scopesTotal: 3 } }); };
  var statusFn = function () { return Promise.resolve({ success: true, data: statusSeq[Math.min(i++, statusSeq.length - 1)] }); };
  GR.runJob(startFn, statusFn, { wait: immediate, interval: 1, refresh: function () { refreshed++; return Promise.resolve(); },
    ui: { starting: function () { ui.events.push('starting'); }, progress: function (s) { ui.events.push('progress:' + s.status); }, refreshing: function () { ui.events.push('refreshing'); }, done: function () { ui.events.push('done'); }, failed: function () { ui.events.push('failed'); } } })
    .then(function (r) {
      ok(startCalls === 1, 'P1 START (the WRITE) was called EXACTLY once (no write retry)');
      ok(refreshed === 1, 'P2 refresh ran exactly once, only after DONE');
      ok(ui.events[0] === 'starting' && ui.events.indexOf('done') === ui.events.length - 1 && ui.events.indexOf('failed') === -1, 'P3 UX: starting → progress… → refreshing → done (never failed)');
      ok(r.started === true && r.finalState.status === 'DONE', 'P4 runJob resolves started + DONE');
    });
})();

section('poller — START failure → failed, NO polling; pollJob bounded; resumeIfRunning recovers a live job');
(function () {
  var polled = 0;
  var startFn = function () { return Promise.resolve({ success: false, error: { code: 'GAP_JOB_LOCK_UNAVAILABLE' } }); };
  var statusFn = function () { polled++; return Promise.resolve({ success: true, data: { status: 'RUNNING' } }); };
  GR.runJob(startFn, statusFn, { wait: immediate, interval: 1, ui: {} }).then(function (r) {
    ok(r.started === false && polled === 0, 'P5 START failure → no status polling, no work');
  });
})();
(function () {
  var i = 0, seq = [{ status: 'RUNNING', scopesProcessed: 1, scopesTotal: 2 }, { status: 'RUNNING', scopesProcessed: 1, scopesTotal: 2 }];
  var statusFn = function () { return Promise.resolve({ success: true, data: seq[Math.min(i++, seq.length - 1)] }); };
  GR.pollJob(statusFn, { wait: immediate, interval: 1, maxPolls: 3 }).then(function (r) {
    ok(r.status === 'POLL_TIMEOUT', 'P6 pollJob is BOUNDED — never infinite (POLL_TIMEOUT after maxPolls)');
  });
})();
(function () {
  var i = 0, seq = [{ status: 'RUNNING', scopesProcessed: 1, scopesTotal: 2 }, { status: 'DONE', scopesProcessed: 2, scopesTotal: 2 }], refreshed = 0;
  var statusFn = function () { return Promise.resolve({ success: true, data: seq[Math.min(i++, seq.length - 1)] }); };
  GR.resumeIfRunning(statusFn, { wait: immediate, interval: 1, refresh: function () { refreshed++; }, ui: {} }).then(function (r) {
    ok(r.status === 'DONE' && refreshed === 1, 'P7 resumeIfRunning recovers a RUNNING job → polls to DONE → refreshes (tab-close/reload safe)');
  });
  GR.resumeIfRunning(function () { return Promise.resolve({ success: true, data: { status: 'NONE' } }); }, { wait: immediate, ui: {} }).then(function (r) {
    ok(r.status === 'NONE', 'P8 resumeIfRunning with NO active job returns immediately (no poll)');
  });
})();

section('R4J-LIVE2 §5 — the STALL guard: a stuck 0/N EXITS Calculating (never infinite); advancing jobs are safe');
(function () {
  var statusFn = function () { return Promise.resolve({ success: true, data: { status: 'RUNNING', scopesProcessed: 0, scopesTotal: 10 } }); };
  GR.pollJob(statusFn, { wait: immediate, interval: 1, maxPolls: 100000, maxStallPolls: 4 }).then(function (r) {
    ok(r.status === 'STALLED', 'P9 pollJob on a frozen 0/N (progress never advances) → STALLED (bounded; never an endless Calculating)');
    ok(GR.isUnconfirmedJob('STALLED') === true && GR.isUnconfirmedJob('POLL_TIMEOUT') === true && GR.isUnconfirmedJob('FAILED') === false, 'P9b STALLED/POLL_TIMEOUT = "unconfirmed" (recoverable); a real FAILED is not');
  });
})();
(function () {
  var i = 0, seq = [{ status: 'RUNNING', scopesProcessed: 0, scopesTotal: 3 }, { status: 'RUNNING', scopesProcessed: 1, scopesTotal: 3 }, { status: 'RUNNING', scopesProcessed: 2, scopesTotal: 3 }, { status: 'DONE', scopesProcessed: 3, scopesTotal: 3 }];
  var statusFn = function () { return Promise.resolve({ success: true, data: seq[Math.min(i++, seq.length - 1)] }); };
  GR.pollJob(statusFn, { wait: immediate, interval: 1, maxStallPolls: 2 }).then(function (r) {
    ok(r.status === 'DONE', 'P10 an ADVANCING job is never falsely stalled (each advance resets the counter) → reaches DONE');
  });
})();
(function () {
  var startCalls = 0, ev = [];
  var startFn = function () { startCalls++; return Promise.resolve({ success: true, data: { runId: 'RS', status: 'PENDING', scopesTotal: 5 } }); };
  var statusFn = function () { return Promise.resolve({ success: true, data: { status: 'RUNNING', scopesProcessed: 0, scopesTotal: 5 } }); };
  GR.runJob(startFn, statusFn, { wait: immediate, interval: 1, maxStallPolls: 3, ui: { starting: function () { ev.push('starting'); }, progress: function () { ev.push('progress'); }, failed: function (st) { ev.push('failed:' + (st && st.status)); } } }).then(function (r) {
    ok(startCalls === 1 && ev.indexOf('failed:STALLED') !== -1, 'P11 runJob on a stuck 0/N → START exactly once, then ui.failed(STALLED) (exit Calculating; NO automatic write retry)');
    ok(r.finalState && r.finalState.status === 'STALLED', 'P11b runJob surfaces the STALLED terminal to the caller');
  });
})();

// =============================================================================================================
section('wiring — router / client adapters / scheduler / page cutover');
ok(/inventoryReplenishmentGap\.job\.start/.test(ROUTER) && /orderPlanningGap\.job\.start/.test(ROUTER) && /gapJob\.status\.get/.test(ROUTER), 'W1 router dispatches job.start x2 + gapJob.status.get');
ok(/handleStartInventoryReplenishmentGapJob_\(body\)/.test(ROUTER) && /handleGetGapJobStatus_\(body\)/.test(ROUTER), 'W2 router calls the 46.gs job handlers');
ok(/startInventoryReplenishmentGapJob\b/.test(DBAPI) && /startOrderPlanningGapJob\b/.test(DBAPI) && /getGapJobStatus\b/.test(DBAPI), 'W3 client exposes start x2 + getGapJobStatus');
ok(/_kmWeeklyCommand_\('inventoryReplenishmentGap\.job\.start'/.test(DBAPI) && /_kmGapRead_\('gapJob\.status\.get'/.test(DBAPI), 'W4 START = write runner (quick), STATUS = read runner (read-only)');
var F44_NOCOMMENT = F44.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(/gapSchedStartJob_\('INVENTORY_GAP', 'INVENTORY'\)/.test(F44_NOCOMMENT) && /gapSchedStartJob_\('ORDER_PLANNING_GAP', 'ORDER_PLANNING'\)/.test(F44_NOCOMMENT), 'W5 the daily schedulers START the canonical job (shared owner)');
ok(/gapJobStart_\(product, gapJobDefaultEnv_\(product\)\)/.test(F44_NOCOMMENT), 'W6 scheduler delegates to the SAME gapJobStart_ owner the manual button uses');
ok(!/handleRecalculateInventoryReplenishmentGapBatch_|handleRecalculateOrderPlanningGapBatch_/.test(F44_NOCOMMENT), 'W7 scheduler no longer runs a synchronous monolithic batch (no second calculation implementation)');
ok(/startInventoryReplenishmentGapJob/.test(INV_JS) && /getGapJobStatus\('INVENTORY'\)/.test(INV_JS) && /gr\.runJob\(/.test(INV_JS), 'W8 Inventory button cut over to START→poll (gr.runJob)');
ok(/startOrderPlanningGapJob/.test(RO_JS) && /getGapJobStatus\('ORDER_PLANNING'\)/.test(RO_JS) && /gr\.runJob\(/.test(RO_JS), 'W9 Order Planning button cut over to START→poll');
ok(/_irResumeGapJobOnMount_/.test(INV_JS) && /_roResumeGapJobOnMount_/.test(RO_JS), 'W10 both pages resume a running job on mount/reload (§13)');
ok((INV_JS.match(/startInventoryReplenishmentGapJob\(\{\}\)/g) || []).length === 1 && (RO_JS.match(/startOrderPlanningGapJob\(\{\}\)/g) || []).length === 1, 'W11 each page issues the START write exactly once (no repeated WRITE POST)');
ok(/isUnconfirmedJob/.test(INV_JS) && /isUnconfirmedJob/.test(RO_JS), 'W12 both pages branch on isUnconfirmedJob → truthful "could not be confirmed" (recoverable) vs a hard failure (§5/§12)');
ok(/could not be confirmed/.test(INV_JS) && /could not be confirmed/.test(RO_JS), 'W13 the §5 truthful "unconfirmed — check latest data before retrying" message is present on both pages');
ok(H.INV_CHUNK === 1, 'W14 R4J-LIVE2 execution unit reduced to 1 Inventory scope/continuation (§8 within the execution budget)');
ok(/GAP_JOB_STALE_MS_/.test(F46) && /RECLAIMED_STALLED/.test(F46), 'W15 START reclaims a demonstrably-stalled job (bounded stale window) so a killed worker never blocks retry forever');

section('safety — job engine authors NO formula; job state is Script-Property only (NO new DB table)');
var F46_CODE = F46.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/KMHP|KMTPP|KMCALC|KMMSA|KMALLOC|KMQI|KMPD|projectTimePhasedSupply|projectHorizons|allocateMarketplaceReceiverSupply/.test(F46_CODE), 'S1 46.gs invokes NO formula owner (orchestration/lifecycle only)');
ok(!/insertSheet|createSheet|new table|gap_job.*Headers|setName\(/i.test(F46_CODE), 'S2 46.gs creates NO new DB table/sheet (job state = Script Properties)');
ok(/PropertiesService\.getScriptProperties/.test(F46) && /GAP_JOB_INVENTORY/.test(F46) && /GAP_JOB_ORDER_PLANNING/.test(F46), 'S3 job state owner = Script Properties (one key per product)');
ok(/gapRunId_\(/.test(F46), 'S4 runId reuses the existing gapRunId_ owner (no new run-id format)');
ok(!/order_planning_gap.*headers|INV_GAP_HEADERS_\s*=|OP_GAP_HEADERS_\s*=/.test(F46), 'S5 46.gs does not redefine the gap table headers (schema untouched)');

console.log('\n----------------------------------------');
setTimeout(function () {
  console.log('GAP MATERIALIZATION JOB (F1-4B-FM5-R4J): ' + pass + ' passed, ' + fail + ' failed');
  if (fail > 0) { process.exitCode = 1; }
}, 60);
