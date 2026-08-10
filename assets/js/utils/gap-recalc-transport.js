// Kitchen Mama Operation System — Gap Materialization manual-recalc TRANSPORT hardening (F1-4B-FM5-R4T).
// -----------------------------------------------------------------------------
// ONE shared, deterministically-testable transport-recovery contract used IDENTICALLY by Inventory Replenishment
// and Order Planning "Recalculate All Sites". Core principle: TRANSPORT FAILURE != CALCULATION FAILURE.
//
// Manual recalc stays ONE browser command → ONE server batch → canonical materialization owner → latest UPSERT.
// This module NEVER re-sends the write. On a transport interruption it performs bounded READ-ONLY verification
// against the materialized gap table (via the caller's refetch + newest-calculated_at readers) and classifies the
// outcome — it issues NO POST, runs NO per-SKU calls, and never mutates calculation_status (READY/BLOCKED stay
// business state). Pure/deps-injected (wait + schedule + notify are overridable) so it unit-tests with a fake clock.
(function (root, factory) {
  'use strict';
  var mod = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  if (root) { root.KM = root.KM || {}; root.KM.gapRecalc = mod; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  // Recovery classifications (transport/execution states — NEVER a business READY/BLOCKED value).
  var CLASSIFICATION = {
    RESPONSE_LOST: 'SERVER_COMPLETED_RESPONSE_LOST',   // materialized rows already advanced on the first verify
    RECOVERED: 'SUCCESS_RECOVERED',                     // advanced on a later bounded poll
    UNCONFIRMED: 'SERVER_COMPLETION_UNCONFIRMED'        // never advanced within the bounded window
  };
  // Client transport/outcome codes (normalized). READY/BLOCKED are business states and are NOT in this set.
  var OUTCOME = {
    SUCCESS: 'SUCCESS', FAILED: 'FAILED',
    TRANSPORT_ERROR: 'HTTP_TRANSPORT_ERROR', NON_JSON: 'TRANSPORT_NON_JSON_RESPONSE', SERVER_ERROR: 'SERVER_ERROR_RESPONSE'
  };
  // Bounded verification window (ms). Four read-only checks after the immediate one; then UNCONFIRMED. No POST.
  var DEFAULT_SCHEDULE = [2000, 5000, 10000, 20000];

  // A lost/broken transport response — NOT a server failure envelope. (A structured server error envelope carries a
  // business/validation code and is handled as FAILED, never routed to recovery.)
  function isTransportError(e) {
    var c = (e && e.code) ? String(e.code) : (typeof e === 'string' ? e : '');
    return c === 'HTTP_TRANSPORT_ERROR' || c === 'NON_JSON_RESPONSE' || c === 'TRANSPORT_NON_JSON_RESPONSE';
  }

  function _advanced(preMax, maxFn) {
    var pm = maxFn ? maxFn() : '';
    return { adv: !!(pm && (!preMax || String(pm) > String(preMax))), pm: pm };
  }

  // Bounded READ-ONLY verification. refetchFn = re-READ the materialized gap table (never the write); maxFn =
  // newest stored calculated_at for the scope. Resolves { classification, postMax, polls, reads } — NEVER a write.
  //   opts.schedule (ms[]) · opts.wait(ms)->Promise · opts.expectedCalcContext (optional, informational)
  function verify(preMax, refetchFn, maxFn, opts) {
    opts = opts || {};
    var schedule = opts.schedule || DEFAULT_SCHEDULE;
    var wait = opts.wait || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var reads = 0;
    function doRead() { reads++; return Promise.resolve(refetchFn ? refetchFn() : null); }   // READ ONLY
    // First verify is IMMEDIATE — the server usually finished the writes before the socket dropped.
    return doRead().then(function () {
      var a = _advanced(preMax, maxFn);
      if (a.adv) return { classification: CLASSIFICATION.RESPONSE_LOST, postMax: a.pm, polls: 1, reads: reads };
      function step(i) {
        if (i >= schedule.length) return { classification: CLASSIFICATION.UNCONFIRMED, postMax: (maxFn ? maxFn() : ''), polls: i + 1, reads: reads };
        return wait(schedule[i]).then(doRead).then(function () {
          var b = _advanced(preMax, maxFn);
          if (b.adv) return { classification: CLASSIFICATION.RECOVERED, postMax: b.pm, polls: i + 2, reads: reads };
          return step(i + 1);
        });
      }
      return step(0);
    });
  }

  // UX wrapper: interrupted → verifying… → recovered / unconfirmed. Never claims failure. ui.notify(msg) (default
  // alert), ui.done(classification). Returns the verify result. Reuses `verify` (bounded, read-only, no retry).
  function recover(product, preMax, refetchFn, maxFn, ui) {
    ui = ui || {};
    var notify = ui.notify || function (m) { if (typeof alert === 'function') alert(m); };
    notify('Connection interrupted — verifying ' + product + ' calculation result…');
    return verify(preMax, refetchFn, maxFn, ui).then(function (r) {
      if (r.classification === CLASSIFICATION.RESPONSE_LOST || r.classification === CLASSIFICATION.RECOVERED) {
        notify(product + ' recalculation completed. The connection was interrupted while receiving the response — the results have been refreshed.');
      } else {
        notify(product + ': unable to confirm completion. Check the latest data before retrying (no automatic retry was issued).');
      }
      if (typeof ui.done === 'function') ui.done(r.classification);
      return r;
    }).catch(function (err) { if (typeof ui.done === 'function') ui.done(CLASSIFICATION.UNCONFIRMED); return { classification: CLASSIFICATION.UNCONFIRMED, error: err }; });
  }

  // =============================================================================================================
  // F1-4B-FM5-R4J — Backend-owned RESUMABLE job client contract. The ~14-min all-site materialization is now a
  // backend job: the browser STARTS it (a quick write returning { runId, status, scopesTotal }) and then POLLS a
  // strictly READ-ONLY status endpoint until a TERMINAL state. The browser NEVER owns the calculation lifetime,
  // NEVER re-POSTs the write, and may be closed/refreshed mid-run (the backend continues). Deterministically
  // testable: wait / interval / maxPolls / all status+start fns are injectable (fake clock, no real network).
  // =============================================================================================================
  var JOB_STATUS = { PENDING: 'PENDING', RUNNING: 'RUNNING', DONE: 'DONE', BLOCKED: 'BLOCKED', FAILED: 'FAILED', ERROR: 'ERROR', CANCELLED: 'CANCELLED', STALLED: 'STALLED', NONE: 'NONE' };
  var DEFAULT_JOB_POLL_MS = 3000;        // read-only status poll cadence
  var DEFAULT_JOB_MAX_POLLS = 800;       // bounded guard (~40 min at 3s) — never an infinite poll
  // R4J-LIVE2 §5 — STALL guard: consecutive READ-ONLY polls with NO durable progress advance before the poller
  // gives up with a truthful "unconfirmed" state. ~4 min at 3s — long enough to absorb one healthy slice + trigger
  // latency (so a live job is never falsely stalled), short enough that a frozen 0/N never lingers ~40 min.
  var DEFAULT_JOB_MAX_STALL_POLLS = 80;

  // R4J-LIVE §A2 — FAILED / ERROR / BLOCKED are terminal so the poller STOPS and the page surfaces a truthful
  // failure (never spins forever on a permanently-broken 0/N job).
  function _isTerminalJob(status) { return status === JOB_STATUS.DONE || status === JOB_STATUS.BLOCKED || status === JOB_STATUS.FAILED || status === JOB_STATUS.ERROR || status === JOB_STATUS.CANCELLED || status === JOB_STATUS.STALLED; }
  function _stateOf(res) { return (res && res.data) ? res.data : (res || {}); }
  function _progressOf(st) { return (st && typeof st.scopesProcessed === 'number') ? st.scopesProcessed : -1; }
  // A non-DONE poll result the UI must treat as "could not confirm completion" (recoverable) rather than a hard
  // business failure — no automatic WRITE retry is ever issued for either (§5).
  function isUnconfirmedJob(status) { return status === 'STALLED' || status === 'POLL_TIMEOUT'; }
  function _log(tag, st) { try { if (typeof console !== 'undefined' && console.log) console.log('[GapJob] ' + tag + (st ? ' ' + (((st.product || '') + (st.runId ? ' run=' + st.runId : '') + ' ' + Math.max(0, _progressOf(st)) + '/' + (st.scopesTotal != null ? st.scopesTotal : '?') + ' ' + (st.status || '')).trim()) : '')); } catch (e) {} }

  // Poll STATUS (READ ONLY) until terminal / NONE / bounded max / STALLED. statusFn()->Promise(status envelope).
  // Never writes, never re-POSTs, never calculates. opts.wait(ms)->Promise · opts.interval · opts.maxPolls ·
  // opts.maxStallPolls · opts.onProgress(state). STALLED = durable progress did not advance for maxStallPolls polls.
  function pollJob(statusFn, opts) {
    opts = opts || {};
    var wait = opts.wait || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var interval = opts.interval || DEFAULT_JOB_POLL_MS;
    var maxPolls = opts.maxPolls || DEFAULT_JOB_MAX_POLLS;
    var maxStallPolls = opts.maxStallPolls || DEFAULT_JOB_MAX_STALL_POLLS;
    var bestProgress = -1, stall = 0;
    function loop(n) {
      // §6 cooperative CANCEL — the page sets this once its backend cancel write has been issued; stop polling now
      // (backend has/there will persist CANCELLED). READ-only: this never issues a write itself.
      if (typeof opts.isCancelled === 'function' && opts.isCancelled()) { _log('CLIENT_RESET', { status: JOB_STATUS.CANCELLED }); return Promise.resolve({ status: JOB_STATUS.CANCELLED, cancelledByClient: true }); }
      return Promise.resolve(statusFn()).then(function (res) {
        var st = _stateOf(res);
        if (typeof opts.onProgress === 'function') { try { opts.onProgress(st); } catch (e) {} }
        if (_isTerminalJob(st.status) || st.status === JOB_STATUS.NONE) { _log('CLIENT_TERMINAL', st); return st; }
        // §5 stall detection — advance resets the counter; no advance for maxStallPolls consecutive non-terminal
        // polls → STOP (truthful "unconfirmed"; never an endless Calculating 0/N, never an auto WRITE retry).
        var prog = _progressOf(st);
        if (prog > bestProgress) { bestProgress = prog; stall = 0; _log('PROGRESS', st); } else { stall++; }
        if (stall >= maxStallPolls) { _log('STALLED', st); return { status: 'STALLED', last: st, polls: n + 1 }; }
        if (n >= maxPolls) return { status: 'POLL_TIMEOUT', last: st };
        return wait(interval).then(function () { return loop(n + 1); });
      });
    }
    return loop(0);
  }

  // START one job → poll to terminal → on DONE run the caller's READ-ONLY refresh. ONE click = ONE logical job:
  // startFn()->Promise({ success, data:{ runId, status, scopesTotal }, error }). ui: starting() · progress(state) ·
  // refreshing() · done(state) · failed(state). No write retry; the write POST happens exactly once inside startFn.
  function runJob(startFn, statusFn, opts) {
    opts = opts || {};
    var ui = opts.ui || {};
    if (typeof ui.starting === 'function') ui.starting();
    return Promise.resolve(startFn()).then(function (startRes) {
      if (!startRes || startRes.success !== true) {
        if (typeof ui.failed === 'function') ui.failed({ status: JOB_STATUS.ERROR, error: (startRes && startRes.error) || null });
        return { started: false, error: (startRes && startRes.error) || null };
      }
      var runId = (startRes.data && startRes.data.runId) || null;
      if (typeof opts.onRunId === 'function') { try { opts.onRunId(runId); } catch (e) {} }   // §6 give the page the runId for a targeted cancel
      _log('START', startRes.data);
      return pollJob(statusFn, { wait: opts.wait, interval: opts.interval, maxPolls: opts.maxPolls, maxStallPolls: opts.maxStallPolls, isCancelled: opts.isCancelled,
        onProgress: function (st) { if (typeof ui.progress === 'function') ui.progress(st); } }).then(function (finalState) {
        var status = finalState && finalState.status;
        _log(status === JOB_STATUS.DONE ? 'COMPLETED' : status === JOB_STATUS.CANCELLED ? 'CANCELLED' : (isUnconfirmedJob(status) ? 'UNCONFIRMED' : 'FAILED'), (finalState && finalState.last) ? finalState.last : finalState);
        // DONE or CANCELLED → refresh the materialized READ (cancelled keeps whatever completed); then reset the button.
        if (status === JOB_STATUS.DONE || status === JOB_STATUS.CANCELLED) {
          if (typeof ui.refreshing === 'function') ui.refreshing();
          return Promise.resolve(opts.refresh ? opts.refresh() : null).then(function () {
            if (status === JOB_STATUS.CANCELLED && typeof ui.cancelled === 'function') ui.cancelled(finalState);
            else if (typeof ui.done === 'function') ui.done(finalState);
            return { started: true, runId: runId, finalState: finalState };
          });
        }
        if (typeof ui.failed === 'function') ui.failed(finalState || { status: JOB_STATUS.ERROR });
        return { started: true, runId: runId, finalState: finalState };
      });
    });
  }

  // Mount/reload recovery (§13): read status ONCE; if a job is in flight, resume polling to completion + refresh.
  // The original tab need not have stayed alive — this recovers whatever backend job currently owns the product.
  function resumeIfRunning(statusFn, opts) {
    opts = opts || {};
    var ui = opts.ui || {};
    return Promise.resolve(statusFn()).then(function (res) {
      var st = _stateOf(res);
      // §4 a page reload must NOT resurrect a terminal job. If the backend already says DONE, refresh the
      // materialized READ once and leave the button in its NORMAL idle state — never flash/keep Calculating.
      if (st.status === JOB_STATUS.DONE) { _log('CLIENT_TERMINAL', st); return Promise.resolve(opts.refresh ? opts.refresh() : null).then(function () { return st; }); }
      // Any other non-active terminal/none state → nothing to resume (button stays normal). Backend state is authoritative.
      if (st.status !== JOB_STATUS.PENDING && st.status !== JOB_STATUS.RUNNING) { _log('CLIENT_TERMINAL', st); return st; }
      if (typeof ui.resume === 'function') ui.resume(st);
      return pollJob(statusFn, { wait: opts.wait, interval: opts.interval, maxPolls: opts.maxPolls, maxStallPolls: opts.maxStallPolls, isCancelled: opts.isCancelled,
        onProgress: function (s) { if (typeof ui.progress === 'function') ui.progress(s); } }).then(function (finalState) {
        var status = finalState && finalState.status;
        if (status === JOB_STATUS.DONE || status === JOB_STATUS.CANCELLED) {
          if (typeof ui.refreshing === 'function') ui.refreshing();
          return Promise.resolve(opts.refresh ? opts.refresh() : null).then(function () {
            if (status === JOB_STATUS.CANCELLED && typeof ui.cancelled === 'function') ui.cancelled(finalState);
            else if (typeof ui.done === 'function') ui.done(finalState);
            return finalState;
          });
        }
        // §5 resumed job did not complete (FAILED / STALLED / POLL_TIMEOUT) → exit Calculating truthfully; NO auto retry.
        if (typeof ui.failed === 'function') ui.failed(finalState || { status: JOB_STATUS.ERROR });
        return finalState;
      });
    });
  }

  return {
    CLASSIFICATION: CLASSIFICATION, OUTCOME: OUTCOME, DEFAULT_SCHEDULE: DEFAULT_SCHEDULE.slice(),
    isTransportError: isTransportError, verify: verify, recover: recover,
    // R4J job lifecycle (backend-owned; browser only starts + read-only polls)
    JOB_STATUS: JOB_STATUS, DEFAULT_JOB_POLL_MS: DEFAULT_JOB_POLL_MS, DEFAULT_JOB_MAX_POLLS: DEFAULT_JOB_MAX_POLLS,
    DEFAULT_JOB_MAX_STALL_POLLS: DEFAULT_JOB_MAX_STALL_POLLS, isUnconfirmedJob: isUnconfirmedJob,
    pollJob: pollJob, runJob: runJob, resumeIfRunning: resumeIfRunning,
    VERSION: 'gap-recalc-fm5r4jlive4-1'
  };
});
