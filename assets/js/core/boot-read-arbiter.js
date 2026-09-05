/**
 * assets/js/core/boot-read-arbiter.js
 * F1-7N-FC-1B-E3-R4-A2-R1-R6-R5 §4 — THE BOOT/READ COORDINATOR.
 *
 * ==============================================================================================================
 * WHAT WAS MEASURED, AND WHY IT IS A RACE RATHER THAN A SLOW READ
 * ==============================================================================================================
 * A hard reload followed by an immediate switch to Site Inventory dispatched FOUR reads inside ~130 ms:
 *
 *     t=0     getClientCapabilities                 (app.js DOMContentLoaded, fire-and-forget)
 *     t~120   inventoryScope.registry.get           (_irBootstrapScope_, COALESCED)
 *     t~120   inventoryReplenishment.workspace.get  (_irBootstrapScope_, COALESCED — started together)
 *     t~130   gapJob.status.get                     (_irResumeGapJobOnMount_, fire-and-forget)
 *
 * The live report shows exactly that shape: request_count 4, coalesced 0, retries 0, three small reads settling
 * at 5.4-6.7 s and the workspace read hitting the 60 000 ms client bound.
 *
 * THE PART THAT IS NOT A GUESS. A client timeout starts at DISPATCH. Every millisecond the primary read spends
 * waiting for a backend slot is therefore charged to ITS timeout budget and not to its own execution. That is
 * true whatever the backend's concurrency turns out to be — it is arithmetic about when the clock starts, not a
 * claim about Apps Script's scheduler. Dispatching the largest read alongside three others it does not need can
 * only ever REDUCE the share of its 60 s available for its own work.
 *
 * Reproduced against the real transport under a virtual clock, with a queueing backend:
 *
 *     immediate navigation, serialized backend   queue_wait 6 480 ms + execution 55 000 ms  -> REQUEST_TIMEOUT
 *     user waits before navigating               queue_wait 1 200 ms + execution 55 000 ms  -> SUCCESS 56 200 ms
 *     retry alone                                queue_wait     0 ms + execution 55 000 ms  -> SUCCESS 55 000 ms
 *
 * Which is precisely the three behaviours the operator reported. The fix is therefore NOT a longer timeout and
 * NOT a retry loop: it is to stop spending the primary read's budget on other requests' queueing.
 *
 * ==============================================================================================================
 * WHAT THIS IS NOT
 * ==============================================================================================================
 * It is NOT a global request serializer. §4 is explicit that only requests whose measured overlap causes
 * contention, or whose dependency order requires it, may be ordered — everything else keeps running freely.
 * Three things are arbitrated and nothing else:
 *
 *   1. ONE named CRITICAL lane, for the primary read of a page. Single-flight by key, so a Search issued while
 *      the bootstrap read is open attaches to it instead of starting a second one.
 *   2. DEPENDENCIES, declared by name and awaited by SETTLEMENT — never by a timer. `waitCapMs` exists only so
 *      a dependency that never settles cannot block the read for ever; it can make the read start SOONER, never
 *      later, which is the opposite of the arbitrary wait §0 forbids.
 *   3. A DEFERRED lane for reads that are genuinely non-critical (a status poll for a job that is usually not
 *      running). They run when the critical lane is clear, so they cannot take a backend slot ahead of the read
 *      the table is waiting for.
 *
 * GENERATIONS ANSWER §6. A scope change bumps the generation. A late answer is accepted only if its generation
 * is still current, so an old request can never overwrite a newer scope's result — and a stale one is DROPPED
 * rather than rendered.
 *
 * Pure core: no DOM, no fetch, injectable clock. Nothing here writes.
 */
(function (root) {
  'use strict';

  var CONTRACT = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R5 §4 — boot/read arbitration: declared dependencies, one critical '
    + 'lane per key, a deferred lane for non-critical reads, and generations that make a late answer safe.';

  // A dependency is one of these, and the difference is reported rather than inferred.
  var DEP_STATE = { PENDING: 'PENDING', SETTLED: 'SETTLED', FAILED: 'FAILED', CAPPED: 'CAPPED', UNKNOWN: 'UNKNOWN' };
  // What the UI may honestly say while a critical read has not been dispatched yet.
  var PHASE = {
    IDLE: 'IDLE',                 // nothing asked for
    PREPARING: 'PREPARING',       // intent recorded, dependencies still settling — NOT "no data"
    DISPATCHED: 'DISPATCHED',     // the one critical request is open
    SETTLED: 'SETTLED'            // it answered (either way)
  };

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }

  function create(deps) {
    deps = deps || {};
    var _now = (typeof deps.now === 'function') ? deps.now
      : function () { return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0; };
    var _setTimeout = (typeof deps.setTimeout === 'function') ? deps.setTimeout
      : ((typeof setTimeout === 'function') ? setTimeout : null);
    var _clearTimeout = (typeof deps.clearTimeout === 'function') ? deps.clearTimeout
      : ((typeof clearTimeout === 'function') ? clearTimeout : null);
    // How long a NON-LOGICAL dependency may hold up a critical read. This is a ceiling on deferral, never a
    // floor on waiting: if the dependency settles in 200 ms the read goes at 200 ms.
    var _waitCapMs = (typeof deps.waitCapMs === 'number' && deps.waitCapMs >= 0) ? deps.waitCapMs : 8000;

    var _epoch = _now();
    var _dependencies = {};        // name -> { state, at, waiters: [] }
    var _critical = {};            // key -> { promise, generation, dispatchedAt }
    var _deferredQueue = [];
    var _openCritical = 0;
    var _generation = 1;
    var _generationReason = 'INITIAL';
    var _intents = [];             // navigation intents, recorded the moment they happen
    var _log = [];                 // bounded arbitration ledger

    function note(event, detail) {
      if (_log.length < 200) _log.push({ at_ms: _now() - _epoch, event: str(event), detail: detail || null });
    }

    // ---- dependencies -----------------------------------------------------------------------------------
    // Declared by whoever OWNS the request, at the moment it is dispatched — so "pending" is a fact about a
    // request in flight, not an assumption that one will be made.
    function declare(name) {
      var n = str(name);
      if (!n) return function () {};
      if (!_dependencies[n]) _dependencies[n] = { state: DEP_STATE.PENDING, at: _now() - _epoch, waiters: [] };
      else if (_dependencies[n].state !== DEP_STATE.PENDING) {
        // Re-declared after settling (a remount, a retry): it is pending again, and anything waiting on it now
        // waits for the NEW attempt.
        _dependencies[n].state = DEP_STATE.PENDING;
        _dependencies[n].at = _now() - _epoch;
      }
      note('dependency_declared', n);
      var settled = false;
      return function settle(ok) {
        if (settled) return;
        settled = true;
        settleDependency(n, ok !== false);
      };
    }
    function settleDependency(name, ok) {
      var n = str(name), d = _dependencies[n];
      if (!d) { _dependencies[n] = d = { state: DEP_STATE.PENDING, at: _now() - _epoch, waiters: [] }; }
      if (d.state !== DEP_STATE.PENDING) return;
      // A FAILED dependency still RELEASES its waiters. A read that waits for capabilities must not be held
      // hostage by capabilities failing — that would turn a soft dependency into a hard outage.
      d.state = ok ? DEP_STATE.SETTLED : DEP_STATE.FAILED;
      d.settledAt = _now() - _epoch;
      note('dependency_settled', { name: n, state: d.state });
      var ws = d.waiters; d.waiters = [];
      ws.forEach(function (w) { try { w(); } catch (e) {} });
    }
    function dependencyState(name) {
      var d = _dependencies[str(name)];
      return d ? d.state : DEP_STATE.UNKNOWN;
    }
    // Resolves when every NAMED dependency has settled, failed, or hit the cap. A name nobody declared is
    // UNKNOWN and does not block: waiting for a request that was never made is how a boot hangs for ever.
    function whenReady(names, capMs) {
      var list = (names || []).map(str).filter(Boolean);
      var cap = (typeof capMs === 'number') ? capMs : _waitCapMs;
      var pending = list.filter(function (n) { return dependencyState(n) === DEP_STATE.PENDING; });
      if (!pending.length) return Promise.resolve({ waited_ms: 0, capped: [] });
      var t0 = _now();
      return new Promise(function (resolve) {
        var done = false, timer = null, capped = [];
        function finish() {
          if (done) return;
          done = true;
          if (timer !== null && _clearTimeout) { try { _clearTimeout(timer); } catch (e) {} }
          resolve({ waited_ms: _now() - t0, capped: capped });
        }
        function check() {
          if (done) return;
          var still = pending.filter(function (n) { return dependencyState(n) === DEP_STATE.PENDING; });
          if (!still.length) finish();
        }
        pending.forEach(function (n) { _dependencies[n].waiters.push(check); });
        if (_setTimeout && cap > 0) {
          timer = _setTimeout(function () {
            if (done) return;
            capped = pending.filter(function (n) { return dependencyState(n) === DEP_STATE.PENDING; });
            capped.forEach(function (n) { _dependencies[n].state = DEP_STATE.CAPPED; });
            note('dependency_wait_capped', capped);
            finish();
          }, cap);
        }
        check();
      });
    }

    // ---- generations (§6) -------------------------------------------------------------------------------
    function generation() { return _generation; }
    function newGeneration(reason) {
      _generation += 1;
      _generationReason = str(reason) || 'UNSPECIFIED';
      note('generation_advanced', { generation: _generation, reason: _generationReason });
      return _generation;
    }
    // The one question a late answer has to pass. A result whose generation is behind the current one belongs
    // to a scope the user has already left, and rendering it would overwrite the newer scope with older data.
    function accepts(gen) { return Number(gen) === _generation; }

    // ---- the critical lane ------------------------------------------------------------------------------
    // ONE open request per key. A second consumer of the SAME key attaches to the first — which is what makes
    // "Search during bootstrap issues no second read" and "unmount/remount issues no second read" the same
    // property rather than two separate fixes.
    function critical(key, fn, opts) {
      opts = opts || {};
      var k = str(key);
      if (!k) return Promise.resolve().then(fn);            // unkeyed: unshareable, so it is not shared
      if (_critical[k]) { note('critical_shared', k); return _critical[k].promise; }
      var gen = _generation;
      var entry = { generation: gen, dispatchedAt: null, requestedAt: _now() - _epoch };
      var p = whenReady(opts.deps || [], opts.waitCapMs).then(function (w) {
        entry.waited_ms = w.waited_ms;
        entry.capped = w.capped;
        entry.dispatchedAt = _now() - _epoch;
        _openCritical += 1;
        note('critical_dispatched', { key: k, waited_ms: w.waited_ms, capped: w.capped });
        return Promise.resolve().then(fn);
      }).then(function (v) {
        _openCritical -= 1; releaseCritical(k, entry); pumpDeferred();
        return { ok: true, value: v, generation: gen, stale: gen !== _generation };
      }, function (e) {
        _openCritical -= 1; releaseCritical(k, entry); pumpDeferred();
        return { ok: false, error: e, generation: gen, stale: gen !== _generation };
      });
      entry.promise = p;
      _critical[k] = entry;
      return p;
    }
    function releaseCritical(k, entry) {
      if (_critical[k] === entry) delete _critical[k];
      note('critical_settled', k);
    }
    function criticalKeys() { return Object.keys(_critical); }
    function openCritical() { return _openCritical; }

    // ---- the deferred lane ------------------------------------------------------------------------------
    // Non-critical reads wait for the critical lane to be clear. They are never dropped and never delayed by a
    // timer — they run the moment nothing important is in flight.
    function deferred(key, fn) {
      var k = str(key) || ('anon-' + _deferredQueue.length);
      return new Promise(function (resolve, reject) {
        _deferredQueue.push({ key: k, fn: fn, resolve: resolve, reject: reject, queuedAt: _now() - _epoch });
        note('deferred_queued', k);
        pumpDeferred();
      });
    }
    function pumpDeferred() {
      if (_openCritical > 0) return;
      var pendingCritical = Object.keys(_critical).length;
      if (pendingCritical > 0) return;                    // a critical read is declared but not yet dispatched
      while (_deferredQueue.length) {
        var job = _deferredQueue.shift();
        note('deferred_released', { key: job.key, waited_ms: (_now() - _epoch) - job.queuedAt });
        (function (j) {
          Promise.resolve().then(j.fn).then(j.resolve, j.reject);
        })(job);
      }
    }
    function deferredDepth() { return _deferredQueue.length; }

    // ---- navigation intent ------------------------------------------------------------------------------
    // Recorded IMMEDIATELY, before any dependency is awaited, so the UI can say "preparing" truthfully from the
    // first frame instead of looking idle while it waits.
    function noteIntent(target, detail) {
      _intents.push({ target: str(target), at_ms: _now() - _epoch, detail: detail || null });
      note('navigation_intent', str(target));
      return _intents.length;
    }
    function phaseFor(key) {
      var k = str(key);
      var e = _critical[k];
      if (e) return e.dispatchedAt === null ? PHASE.PREPARING : PHASE.DISPATCHED;
      return _intents.length ? PHASE.SETTLED : PHASE.IDLE;
    }

    function state() {
      var depOut = {};
      Object.keys(_dependencies).forEach(function (n) {
        depOut[n] = { state: _dependencies[n].state, declared_at_ms: _dependencies[n].at,
          settled_at_ms: _dependencies[n].settledAt === undefined ? null : _dependencies[n].settledAt };
      });
      return {
        contract: CONTRACT,
        generation: _generation, generation_reason: _generationReason,
        dependencies: depOut,
        critical_open: _openCritical,
        critical_keys: criticalKeys(),
        deferred_pending: _deferredQueue.length,
        intents: _intents.slice(),
        wait_cap_ms: _waitCapMs,
        log: _log.slice()
      };
    }
    function reset() {
      _epoch = _now(); _dependencies = {}; _critical = {}; _deferredQueue = [];
      _openCritical = 0; _generation = 1; _generationReason = 'INITIAL'; _intents = []; _log = [];
    }

    return {
      CONTRACT: CONTRACT, DEP_STATE: DEP_STATE, PHASE: PHASE,
      declare: declare, settleDependency: settleDependency, dependencyState: dependencyState, whenReady: whenReady,
      generation: generation, newGeneration: newGeneration, accepts: accepts,
      critical: critical, criticalKeys: criticalKeys, openCritical: openCritical,
      deferred: deferred, deferredDepth: deferredDepth, pumpDeferred: pumpDeferred,
      noteIntent: noteIntent, phaseFor: phaseFor,
      state: state, reset: reset
    };
  }

  var API = { CONTRACT: CONTRACT, DEP_STATE: DEP_STATE, PHASE: PHASE, create: create };
  if (root) { root.KM = root.KM || {}; root.KM.bootArbiter = root.KM.bootArbiter || create(); root.KMBRA = root.KM.bootArbiter; root.KM.bootArbiterFactory = API; }
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : null);
