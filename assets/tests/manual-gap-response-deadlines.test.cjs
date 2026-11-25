'use strict';
const assert = require('node:assert/strict');
const gr = require('../js/utils/gap-recalc-transport.js');
const { makeClient } = require('./helpers/write-command-flight-world.cjs');
let checks = 0;
function check(label, value) { assert(value, label); checks++; console.log('PASS ' + label); }
const never = () => new Promise(() => {});
const scope = { mode: 'CURRENT_SCOPE', company: 'KM', country: 'US', marketplace: 'Amazon' };
const state = (runId, status = 'DONE') => ({ success: true, data: { runId, status, product: 'INVENTORY', requestedScope: scope, scopesProcessed: 1, scopesTotal: 1 } });
const small = { startTimeoutMs: 15, readTimeoutMs: 15, interval: 1, maxPolls: 2, maxStallPolls: 2, wait: () => Promise.resolve() };
(async () => {
  let starts = 0, reads = 0, refreshes = 0, failure = null;
  const outcome = await gr.runJob(() => { starts++; return never(); }, () => { reads++; return state(reads === 1 ? null : 'RECOVERED', reads === 1 ? 'NONE' : 'DONE'); }, {
    ...small, observeBeforeStart: true, acceptRecoveredStart: s => JSON.stringify(s.requestedScope) === JSON.stringify(scope), refresh: () => { refreshes++; }, ui: { failed: s => { failure = s; } }
  });
  check('lost START reconciles only a new exact-scope run via status, one POST', starts === 1 && reads === 3 && refreshes === 1 && outcome.finalState.status === 'DONE' && !failure);
  starts = reads = 0; failure = null;
  await gr.runJob(() => { starts++; return never(); }, () => { reads++; return state('OLD'); }, {
    ...small, observeBeforeStart: true, acceptRecoveredStart: () => true, ui: { failed: s => { failure = s; } }
  });
  check('an old DONE cannot confirm an unanswered new START', starts === 1 && reads === 2 && failure.status === 'POLL_TIMEOUT');
  reads = 0; failure = null;
  await gr.runJob(() => ({ success: false, error: { code: 'GAP_JOB_LOCK_UNAVAILABLE', message: 'Busy' } }), () => { reads++; return state(null, 'NONE'); }, {
    ...small, observeBeforeStart: true, acceptRecoveredStart: () => true, ui: { failed: s => { failure = s; } }
  });
  check('explicit business refusal retains code and never enters transport recovery', reads === 1 && failure.code === 'GAP_JOB_LOCK_UNAVAILABLE');
  const hungStatus = await gr.runJob(() => state('RUN', 'PENDING'), never, { ...small, ui: {} });
  check('hung status call ends observation without declaring calculation failure', hungStatus.finalState.status === 'POLL_TIMEOUT');
  let completed = false; failure = null;
  await gr.runJob(() => state('RUN', 'PENDING'), () => state('RUN'), { ...small, refresh: never, ui: { done: () => { completed = true; }, failed: s => { failure = s; } } });
  check('hung result refresh becomes READBACK_FAILED, not a fabricated completion', !completed && failure.status === 'READBACK_FAILED');
  const mismatched = await gr.pollJob(() => state('OTHER'), { ...small, runId: 'RUN' });
  check('targeted status never accepts a different run ID', mismatched.status === 'POLL_TIMEOUT');
  const missingIdentity = await gr.pollJob(() => ({ success: true, data: { status: 'DONE' } }), { ...small, runId: 'RUN' });
  check('targeted DONE without run identity remains unconfirmed', missingIdentity.status === 'POLL_TIMEOUT');
  reads = 0; completed = false; failure = null;
  await gr.runJob(() => ({ success: true, data: { status: 'PENDING' } }), () => { reads++; return state('OLD'); }, {
    ...small, observeBeforeStart: true, acceptRecoveredStart: () => true, ui: { done: () => { completed = true; }, failed: s => { failure = s; } }
  });
  check('success-shaped START without run identity cannot complete from an old DONE', !completed && reads === 2 && failure.status === 'POLL_TIMEOUT');
  let lateResolve, lateCalls = 0;
  await assert.rejects(gr.boundedCall(() => new Promise(resolve => { lateResolve = resolve; }), 10, () => { lateCalls++; }), e => e.code === 'RESPONSE_DEADLINE');
  lateResolve(state('LATE')); await new Promise(r => setTimeout(r, 1));
  check('late acknowledged response is observed once, never retried', lateCalls === 1);
  const throwingUi = await gr.runJob(() => state('RUN'), () => state('RUN'), { ...small, ui: { starting() { throw new Error('fixture UI failure'); }, failed() { throw new Error('fixture failed callback'); } } });
  check('throwing UI callbacks cannot leave an unhandled pending observation', throwingUi.transportLost === true);
  const resumed = await gr.resumeIfRunning(never, { ...small, force: true, ui: { failed: () => {} } });
  check('mount status read has a finite observation deadline too', resumed.status === 'POLL_TIMEOUT');

  let progress = [], observedProgressBeforeRead = false;
  starts = reads = 0;
  const lost = await gr.runJob(() => { starts++; return state('ACK', 'PENDING'); }, () => {
    observedProgressBeforeRead = progress.length > 0;
    reads++;
    return { success: false, error: { code: 'TEMPORARY_UNAVAILABLE' } };
  }, { ...small, maxPolls: 20, maxLostPolls: 3, ui: { progress: s => progress.push(s.status) } });
  check('acknowledged START reports progress before the first status read', observedProgressBeforeRead && progress[0] === 'PENDING');
  check('three unusable reads leave Starting without retrying the write or claiming failure', reads === 3 && starts === 1 && lost.finalState.status === 'POLL_TIMEOUT' && lost.finalState.transportLost && lost.finalState.lastError.includes('STATUS_READ_UNCONFIRMED'));
  reads = 0;
  const recoveredStatus = await gr.pollJob(() => {
    reads++;
    return reads === 2 ? state('ACK', 'RUNNING') : reads === 5 ? state('ACK') : { success: false };
  }, { ...small, runId: 'ACK', maxPolls: 20, maxLostPolls: 3, maxStallPolls: 20 });
  check('usable status resets consecutive-loss count and can still finish', reads === 5 && recoveredStatus.status === 'DONE');
  reads = 0;
  const rejectedStatus = await gr.pollJob(() => { reads++; throw new Error('fixture disconnect'); }, { ...small, maxPolls: 20, maxLostPolls: 3 });
  check('repeated thrown reads use the same observation bound', reads === 3 && rejectedStatus.status === 'POLL_TIMEOUT' && rejectedStatus.transportLost);
  let baseline = null, baselineBeforeWrite = false;
  reads = starts = 0;
  await gr.runJob(() => { starts++; baselineBeforeWrite = baseline && baseline.status === 'NONE'; return state('ACK', 'PENDING'); },
    () => { reads++; return state(reads === 1 ? null : 'ACK', reads === 1 ? 'NONE' : 'DONE'); }, {
      ...small, observeBeforeStart: true, onBaselineState: st => { baseline = st; }
    });
  check('known pre-start identity is handed to persistence before the single write', baselineBeforeWrite && starts === 1 && baseline.runId === null);
  baseline = null; failure = null; starts = reads = 0;
  await gr.runJob(() => { starts++; return never(); }, () => { reads++; return { success: true, data: { runId: 'NOT-A-STATUS' } }; }, {
    ...small, observeBeforeStart: true, onBaselineState: st => { baseline = st; }, acceptRecoveredStart: () => true, ui: { failed: s => { failure = s; } }
  });
  check('malformed pre-start reply cannot be used as recovery proof', baseline === null && starts === 1 && reads === 1 && failure.status === 'POLL_TIMEOUT');

  const c = makeClient({});
  c.sb.window.KM_REQUEST_TIMEOUT_MS = { write: 5 };
  let bodyResolve, posts = 0;
  c.sb.fetch = async () => { posts++; return { ok: true, status: 200, text: () => new Promise(r => { bodyResolve = r; }) }; };
  const pending = c.DB.startInventoryReplenishmentGapJob({ payload: { scope } });
  await assert.rejects(gr.boundedCall(() => pending, 20), e => e.code === 'RESPONSE_DEADLINE');
  check('actual DB API reproduces headers-only timeout gap: body still pending after fetch bound', posts === 1 && c.sb._kmWriteFlights_.size === 1);
  bodyResolve(JSON.stringify(state('BODY-LATE', 'PENDING')));
  const ack = await pending;
  check('same underlying write resolves when its late body arrives; no second dispatch', ack.success && posts === 1 && c.sb._kmWriteFlights_.size === 0);
  console.log('MANUAL_GAP_RESPONSE_DEADLINES_PASS ' + checks + ' live_business_writes=0');
})().catch(err => { console.error(err); process.exitCode = 1; });
