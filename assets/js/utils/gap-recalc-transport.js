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
  var JOB_STATUS = { PENDING: 'PENDING', RUNNING: 'RUNNING', DONE: 'DONE', BLOCKED: 'BLOCKED', ERROR: 'ERROR', NONE: 'NONE' };
  var DEFAULT_JOB_POLL_MS = 3000;        // read-only status poll cadence
  var DEFAULT_JOB_MAX_POLLS = 800;       // bounded guard (~40 min at 3s) — never an infinite poll

  function _isTerminalJob(status) { return status === JOB_STATUS.DONE || status === JOB_STATUS.BLOCKED || status === JOB_STATUS.ERROR; }
  function _stateOf(res) { return (res && res.data) ? res.data : (res || {}); }

  // Poll STATUS (READ ONLY) until terminal / NONE / bounded max. statusFn()->Promise(status envelope). Never writes,
  // never re-POSTs, never calculates. opts.wait(ms)->Promise · opts.interval · opts.maxPolls · opts.onProgress(state).
  function pollJob(statusFn, opts) {
    opts = opts || {};
    var wait = opts.wait || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var interval = opts.interval || DEFAULT_JOB_POLL_MS;
    var maxPolls = opts.maxPolls || DEFAULT_JOB_MAX_POLLS;
    function loop(n) {
      return Promise.resolve(statusFn()).then(function (res) {
        var st = _stateOf(res);
        if (typeof opts.onProgress === 'function') { try { opts.onProgress(st); } catch (e) {} }
        if (_isTerminalJob(st.status) || st.status === JOB_STATUS.NONE) return st;
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
      return pollJob(statusFn, { wait: opts.wait, interval: opts.interval, maxPolls: opts.maxPolls,
        onProgress: function (st) { if (typeof ui.progress === 'function') ui.progress(st); } }).then(function (finalState) {
        if (finalState && finalState.status === JOB_STATUS.DONE) {
          if (typeof ui.refreshing === 'function') ui.refreshing();
          return Promise.resolve(opts.refresh ? opts.refresh() : null).then(function () { if (typeof ui.done === 'function') ui.done(finalState); return { started: true, runId: runId, finalState: finalState }; });
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
      if (st.status !== JOB_STATUS.PENDING && st.status !== JOB_STATUS.RUNNING) return st;
      if (typeof ui.resume === 'function') ui.resume(st);
      return pollJob(statusFn, { wait: opts.wait, interval: opts.interval, maxPolls: opts.maxPolls,
        onProgress: function (s) { if (typeof ui.progress === 'function') ui.progress(s); } }).then(function (finalState) {
        if (finalState && finalState.status === JOB_STATUS.DONE) {
          if (typeof ui.refreshing === 'function') ui.refreshing();
          return Promise.resolve(opts.refresh ? opts.refresh() : null).then(function () { if (typeof ui.done === 'function') ui.done(finalState); return finalState; });
        }
        return finalState;
      });
    });
  }

  return {
    CLASSIFICATION: CLASSIFICATION, OUTCOME: OUTCOME, DEFAULT_SCHEDULE: DEFAULT_SCHEDULE.slice(),
    isTransportError: isTransportError, verify: verify, recover: recover,
    // R4J job lifecycle (backend-owned; browser only starts + read-only polls)
    JOB_STATUS: JOB_STATUS, DEFAULT_JOB_POLL_MS: DEFAULT_JOB_POLL_MS, DEFAULT_JOB_MAX_POLLS: DEFAULT_JOB_MAX_POLLS,
    pollJob: pollJob, runJob: runJob, resumeIfRunning: resumeIfRunning,
    VERSION: 'gap-recalc-fm5r4j-1'
  };
});
