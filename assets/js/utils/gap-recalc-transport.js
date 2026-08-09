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

  return {
    CLASSIFICATION: CLASSIFICATION, OUTCOME: OUTCOME, DEFAULT_SCHEDULE: DEFAULT_SCHEDULE.slice(),
    isTransportError: isTransportError, verify: verify, recover: recover,
    VERSION: 'gap-recalc-fm5r4t-1'
  };
});
