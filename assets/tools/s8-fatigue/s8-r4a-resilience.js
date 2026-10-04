// =============================================================================================================
// S8-R4A1 — HARNESS RESILIENCE
//
// R4A's first matrix ran for 30 minutes and then stood still for three hours. Nothing was wrong with the
// product; the harness had no way to notice it had stopped. Three defects, all here, all of them the same
// mistake in different clothes: the harness trusted the browser to answer.
//
//   UNBOUNDED_CDP_SEND         a command's promise settled only on a matching reply id. One unanswered
//                              Runtime.evaluate parked the measurement loop inside an `await`, so the loop's
//                              own `while (elapsed < MAX_WAIT_MS)` deadline was never re-evaluated. maxwait
//                              did not bound anything.
//   UNHANDLED_JS_DIALOG        an open native dialog blocks the renderer. With no Page.javascriptDialogOpening
//                              handler every later evaluate hangs, which is defect 1's trigger.
//   END_OF_RUN_ONLY_PERSIST    samples were written once, at the end. Three hours of completed windows were
//                              unrecoverable because one promise never settled.
//
// It lives apart from the runner so each piece can be driven by a test without a browser: the registry takes
// its clock and its timers, the dialog policy is a pure function, the checkpoint writer takes a directory.
// A defect that can only be reproduced by running the whole matrix for three hours is a defect that does not
// get reproduced.
// =============================================================================================================

(function (root, factory) {
  var api = factory(typeof require === 'function' ? require('fs') : null,
                    typeof require === 'function' ? require('path') : null);
  if (typeof module === 'object' && module.exports) { module.exports = api; }
  else { root.KMS8R4A_RESIL = api; }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (fs, path) {
  'use strict';

  var ROUND = 'S8-R4A1';

  // ---------------------------------------------------------------------------------------------------------
  // TIMING CONTRACT
  //
  // The command timeout is derived, not picked. A surface gets MAX_WAIT_MS (180s) to become stable, and that
  // budget is spent across many CDP commands; a single command that consumes the whole budget has already
  // failed the measurement. 20s is 1/9 of the surface budget and roughly 80x the observed median reply, so a
  // slow evaluate on a loaded page still succeeds while a dead one is caught with 160s of budget left to
  // record the failure and move on.
  // ---------------------------------------------------------------------------------------------------------
  var CDP_COMMAND_TIMEOUT_MS = 20000;
  var WATCHDOG_THRESHOLD_MS = 300000;

  function now() { return Date.now(); }

  // =========================================================================================================
  // §3 — bounded CDP command registry
  //
  // Ids are allocated here and never reused. That is the whole defence against the subtle failure in this
  // area: a reply that arrives after its command timed out must not be able to settle a DIFFERENT, newer
  // command. Reusing ids after a timeout would make that possible, so `nextId` is strictly monotonic and
  // timed-out ids are kept as tombstones rather than freed.
  // =========================================================================================================
  function createPendingRegistry(opts) {
    opts = opts || {};
    var timeoutMs = opts.timeoutMs || CDP_COMMAND_TIMEOUT_MS;
    var clock = opts.now || now;
    var setTimer = opts.setTimer || function (fn, ms) { return setTimeout(fn, ms); };
    var clearTimer = opts.clearTimer || function (t) { clearTimeout(t); };
    var onTimeout = opts.onTimeout || function () {};

    var seq = 0;
    var pending = Object.create(null);     // id -> record, live commands only
    var tombstone = Object.create(null);   // id -> record, timed out; never reused, never revived
    var timeouts = [];

    function nextId() { seq++; return seq; }

    // register(id, method, ctx) -> Promise. Rejects with a typed error if no reply arrives in time.
    function register(id, method, ctx) {
      ctx = ctx || {};
      return new Promise(function (resolve, reject) {
        var startedAt = clock();
        var rec = {
          id: id, method: method, startedAt: startedAt,
          surface: ctx.surface || null, scenario: ctx.scenario || null, cycle: ctx.cycle || null,
          resolve: resolve, reject: reject, timer: null
        };
        rec.timer = setTimer(function () {
          // Move, do not delete: the id stays spoken for so a late reply is identifiable as late.
          if (!pending[id]) { return; }
          delete pending[id];
          var elapsed = clock() - startedAt;
          var info = { id: id, method: method, surface: rec.surface, scenario: rec.scenario,
                       cycle: rec.cycle, elapsedMs: elapsed, at: clock() };
          tombstone[id] = info;
          timeouts.push(info);
          var err = new Error('CDP_COMMAND_TIMEOUT ' + method + ' after ' + elapsed + 'ms' +
            (rec.surface ? ' on ' + rec.surface : ''));
          err.code = 'CDP_COMMAND_TIMEOUT';
          err.method = method;
          err.surface = rec.surface;
          err.elapsedMs = elapsed;
          try { onTimeout(info); } catch (e) {}
          reject(err);
        }, timeoutMs);
        pending[id] = rec;
      });
    }

    // deliver(msg) -> outcome string. The runner calls this for every message carrying an id.
    function deliver(msg) {
      if (!msg || typeof msg.id !== 'number') { return 'NOT_A_REPLY'; }
      var rec = pending[msg.id];
      if (rec) {
        clearTimer(rec.timer);
        delete pending[msg.id];
        rec.resolve(msg);
        return 'RESOLVED';
      }
      if (tombstone[msg.id]) { return 'LATE_IGNORED'; }
      return 'UNKNOWN_ID';
    }

    // Called when the socket dies: every live command must settle, or the process parks exactly as before.
    function rejectAll(reason) {
      var ids = Object.keys(pending);
      ids.forEach(function (k) {
        var rec = pending[k];
        clearTimer(rec.timer);
        delete pending[k];
        var err = new Error('CDP_TRANSPORT_CLOSED: ' + reason);
        err.code = 'CDP_TRANSPORT_CLOSED';
        err.method = rec.method;
        rec.reject(err);
      });
      return ids.length;
    }

    function snapshot() {
      return Object.keys(pending).map(function (k) {
        var r = pending[k];
        return { id: r.id, method: r.method, surface: r.surface, waitingMs: clock() - r.startedAt };
      });
    }

    return {
      nextId: nextId,
      register: register,
      deliver: deliver,
      rejectAll: rejectAll,
      snapshot: snapshot,
      timeoutMs: timeoutMs,
      pendingCount: function () { return Object.keys(pending).length; },
      tombstoneCount: function () { return Object.keys(tombstone).length; },
      timeouts: function () { return timeouts.slice(); }
    };
  }

  // =========================================================================================================
  // §4 — JavaScript dialog policy
  //
  // The safe outcome is the one that performs no write, and for every dialog an application raises that is
  // DISMISS. A confirm() is the last gate in front of a destructive action; accepting one is the single
  // click that could turn a read-only fatigue run into a write. So accept is false for alert, confirm and
  // prompt, and CONFIRM_ACCEPTED_COUNT is an invariant, not a statistic.
  //
  // beforeunload is the one dialog where dismiss is the WRONG default, and it is not an application dialog:
  // accept means "yes, leave the page", which runs no application handler and writes nothing, while dismiss
  // means "stay", which would cancel the harness's own navigation and stall the run. It is accepted
  // deliberately and counted apart from confirm so the invariant above stays readable.
  // =========================================================================================================
  var DIALOG_TYPES = ['alert', 'confirm', 'prompt', 'beforeunload'];

  function dialogDecision(ev) {
    ev = ev || {};
    var type = String(ev.type || '').toLowerCase();
    if (type === 'beforeunload') {
      return { known: true, accept: true, promptText: '', action: 'ACCEPT_NAVIGATION',
               reason: 'beforeunload runs no application handler; dismissing it would cancel the harness navigation.' };
    }
    if (type === 'alert' || type === 'confirm' || type === 'prompt') {
      return { known: true, accept: false, promptText: '', action: 'DISMISS',
               reason: 'Dismiss is the no-write outcome for an application dialog.' };
    }
    // An unrecognised dialog type cannot be proven read-only-safe to dismiss. §4 says: abort the surface.
    return { known: false, accept: false, promptText: '', action: 'ABORT_SURFACE',
             reason: 'Unknown dialog type "' + type + '" cannot be proven read-only-safe; the surface is aborted.' };
  }

  function createDialogHandler(opts) {
    opts = opts || {};
    var clock = opts.now || now;
    var seen = [];
    var confirmAccepted = 0;
    var aborted = [];

    // handle(ev, ctx) -> { command, decision, record }. The runner sends `command` via CDP verbatim.
    function handle(ev, ctx) {
      ctx = ctx || {};
      var d = dialogDecision(ev);
      var rec = {
        type: String((ev && ev.type) || ''), message: String((ev && ev.message) || ''),
        surface: ctx.surface || null, scenario: ctx.scenario || null, cycle: ctx.cycle || null,
        action: d.action, accepted: d.accept, at: clock()
      };
      seen.push(rec);
      if (rec.type === 'confirm' && d.accept) { confirmAccepted++; }   // must remain unreachable
      if (d.action === 'ABORT_SURFACE') { aborted.push(rec); }
      return {
        decision: d, record: rec,
        // A dialog is ALWAYS answered, including the unknown one. Leaving it open would re-create the exact
        // hang this module exists to remove; the surface is abandoned for measurement, not left blocking.
        command: { method: 'Page.handleJavaScriptDialog',
                   params: { accept: d.accept, promptText: d.promptText } }
      };
    }

    return {
      handle: handle,
      dialogs: function () { return seen.slice(); },
      count: function () { return seen.length; },
      confirmAcceptedCount: function () { return confirmAccepted; },
      abortedSurfaces: function () { return aborted.slice(); },
      defaultAction: 'DISMISS'
    };
  }

  // =========================================================================================================
  // §5 — durable incremental checkpoints
  //
  // Written temp-then-rename so a reader never sees half a JSON document, and written after EVERY window so
  // that losing window N+1 costs window N+1 and nothing else.
  // =========================================================================================================
  function writeAtomic(file, text) {
    var tmp = file + '.tmp-' + process.pid;
    fs.writeFileSync(tmp, text);
    try {
      fs.renameSync(tmp, file);
    } catch (e) {
      // Windows can refuse a rename over a file another process has open for reading.
      fs.writeFileSync(file, text);
      try { fs.unlinkSync(tmp); } catch (e2) {}
    }
    return file;
  }

  function createCheckpointWriter(outDir, opts) {
    opts = opts || {};
    var clock = opts.now || now;
    if (!fs.existsSync(outDir)) { fs.mkdirSync(outDir, { recursive: true }); }

    var samples = [];
    var files = {
      progress: path.join(outDir, 's8-r4a-progress.json'),
      samples: path.join(outDir, 's8-r4a-samples.partial.json'),
      safety: path.join(outDir, 's8-r4a-safety.partial.json')
    };
    var writes = 0;

    // record(sample, state) — one completed measurement window.
    function record(sample, state) {
      state = state || {};
      samples.push(sample);
      writeAtomic(files.samples, JSON.stringify({ round: ROUND, count: samples.length, samples: samples }, null, 1));
      writeAtomic(files.safety, JSON.stringify(state.safety || {}, null, 1));
      writeAtomic(files.progress, JSON.stringify({
        round: ROUND, at: clock(), iso: new Date(clock()).toISOString(),
        scenario: state.scenario || null, surface: state.surface || null, cycle: state.cycle || null,
        completedWindows: samples.length, status: state.status || 'RUNNING'
      }, null, 1));
      writes++;
      return samples.length;
    }

    // Written when the run ends for any reason, including the watchdog's exit.
    function note(state) {
      writeAtomic(files.progress, JSON.stringify({
        round: ROUND, at: clock(), iso: new Date(clock()).toISOString(),
        scenario: (state && state.scenario) || null, surface: (state && state.surface) || null,
        cycle: (state && state.cycle) || null,
        completedWindows: samples.length, status: (state && state.status) || 'RUNNING',
        detail: (state && state.detail) || null
      }, null, 1));
      writes++;
    }

    function consolidate(name, payload) { return writeAtomic(path.join(outDir, name), JSON.stringify(payload, null, 1)); }

    return {
      record: record, note: note, consolidate: consolidate,
      files: files, outDir: outDir,
      count: function () { return samples.length; },
      writeCount: function () { return writes; },
      all: function () { return samples.slice(); }
    };
  }

  // =========================================================================================================
  // §6 — watchdog
  //
  // The backstop, not the primary defence: with §3 armed, a dead command fails in 20s. The watchdog catches
  // what a per-command timeout cannot — a run that keeps answering CDP but stops making progress. It exits
  // the CLIENT. No Production request is cancelled by it, because it sends nothing to Production; the worst
  // it does is stop measuring.
  // =========================================================================================================
  function createWatchdog(opts) {
    opts = opts || {};
    var thresholdMs = opts.thresholdMs || WATCHDOG_THRESHOLD_MS;
    var clock = opts.now || now;
    var setTimer = opts.setTimer || function (fn, ms) { var t = setInterval(fn, ms); if (t.unref) t.unref(); return t; };
    var clearTimer = opts.clearTimer || function (t) { clearInterval(t); };
    var onTrip = opts.onTrip || function () {};
    var tick = opts.tickMs || 5000;

    var last = clock();
    var lastLabel = 'start';
    var paused = false;
    var tripped = false;
    var timer = null;

    function progress(label) { last = clock(); if (label) { lastLabel = label; } }
    // Scenario E deliberately idles for five minutes. That is progress-shaped silence, so the watchdog is
    // paused around it rather than given a threshold wide enough to hide a real stall.
    function pause(why) { paused = true; lastLabel = 'paused:' + (why || ''); }
    function resume() { paused = false; last = clock(); }

    function check() {
      if (paused || tripped) { return null; }
      var idle = clock() - last;
      if (idle < thresholdMs) { return null; }
      tripped = true;
      var dump = { round: ROUND, reason: 'WATCHDOG_NO_PROGRESS', idleMs: idle, thresholdMs: thresholdMs,
                   lastProgress: lastLabel, at: clock(), iso: new Date(clock()).toISOString() };
      try { onTrip(dump); } catch (e) {}
      return dump;
    }

    function start() { timer = setTimer(check, tick); return timer; }
    function stop() { if (timer) { clearTimer(timer); timer = null; } }

    return { progress: progress, pause: pause, resume: resume, check: check, start: start, stop: stop,
             thresholdMs: thresholdMs,
             isTripped: function () { return tripped; },
             isPaused: function () { return paused; },
             idleMs: function () { return clock() - last; },
             lastProgress: function () { return lastLabel; } };
  }

  // =========================================================================================================
  // §R4B-0 — the open-request map, and why an eviction is not a completion
  //
  // THE DEFECT. The map was written on Fetch.requestPaused and deleted only on a matching Network settle
  // event. Scenario D's rapid burst navigates away mid-flight BY DESIGN; a read the renderer dropped without
  // a matching loadingFinished or loadingFailed stayed in the map forever, and the stability predicate
  // `openCount === 0` could never be true again. Four of 161 windows lost their stable time to it.
  //
  // THE WHOLE CORRECTNESS OF THE REPAIR IS ONE DISTINCTION. `ms` is the measured backend duration and is
  // written ONLY by settle(), from a real Network event. An eviction writes `abandoned` and
  // `abandoned_after_ms` — named so they cannot be read as a duration — and never writes `ms`, `http` or a
  // success. Inventing a duration for a request that never answered would put that invented number into
  // every median in the report, which is a worse defect than the one being fixed.
  //
  // AND EVICTION CANNOT MANUFACTURE STABILITY. It removes one blocker, `openCount === 0`. The quiet-network
  // and quiet-DOM conditions are untouched and still have to be satisfied on their own. The two eviction
  // reasons are each sound for a different reason: a replaced document cannot receive a response at all,
  // and a request older than twice the application's own abort bound has provably stopped being listened to.
  // =========================================================================================================
  var CLIENT_READ_BOUND_MS = 45000;      // operation-system-db-api.js — KM_READ_TIMEOUT_MS_
  var STALE_OPEN_MS = CLIENT_READ_BOUND_MS * 2;

  function createOpenMap(opts) {
    opts = opts || {};
    var clock = opts.now || now;
    var staleMs = opts.staleMs || STALE_OPEN_MS;
    var onEvict = opts.onEvict || function () {};
    var open = Object.create(null);
    var evictions = [];

    function add(id, rec) {
      if (id === null || id === undefined || id === '') { return false; }
      open[id] = { rec: rec || {}, t0: clock() };
      return true;
    }

    // A REAL completion, from a Network event. The only writer of `ms`.
    function settle(id) {
      var o = open[id];
      if (!o) { return null; }
      o.rec.ms = clock() - o.t0;
      delete open[id];
      return o.rec;
    }

    function evict(id, why) {
      var o = open[id];
      if (!o) { return null; }
      delete open[id];
      var openMs = clock() - o.t0;
      o.rec.abandoned = why;
      o.rec.abandoned_after_ms = openMs;     // deliberately NOT `ms`
      var ev = { nid: id, action: o.rec.action || null, surface: o.rec.surface || null,
                 scenario: o.rec.scenario || null, cycle: o.rec.cycle === undefined ? null : o.rec.cycle,
                 openMs: openMs, why: why, at: clock() };
      evictions.push(ev);
      try { onEvict(ev); } catch (e) {}
      return ev;
    }

    function evictAll(why) {
      return Object.keys(open).map(function (k) { return evict(k, why); }).filter(Boolean);
    }
    function evictStale() {
      var t = clock();
      return Object.keys(open).map(function (k) {
        return (t - open[k].t0 >= staleMs) ? evict(k, 'STALE_BEYOND_CLIENT_BOUND') : null;
      }).filter(Boolean);
    }

    function get(id) { return open[id] || null; }
    function ids() { return Object.keys(open); }
    function actions() { return Object.keys(open).map(function (k) { return open[k].rec.action; }); }

    return { add: add, settle: settle, evict: evict, evictAll: evictAll, evictStale: evictStale,
             get: get, ids: ids, actions: actions,
             staleMs: staleMs,
             size: function () { return Object.keys(open).length; },
             evictionCount: function () { return evictions.length; },
             evictionList: function () { return evictions.slice(); } };
  }

  return {
    ROUND: ROUND,
    CLIENT_READ_BOUND_MS: CLIENT_READ_BOUND_MS,
    STALE_OPEN_MS: STALE_OPEN_MS,
    createOpenMap: createOpenMap,
    CDP_COMMAND_TIMEOUT_MS: CDP_COMMAND_TIMEOUT_MS,
    WATCHDOG_THRESHOLD_MS: WATCHDOG_THRESHOLD_MS,
    DIALOG_TYPES: DIALOG_TYPES,
    createPendingRegistry: createPendingRegistry,
    dialogDecision: dialogDecision,
    createDialogHandler: createDialogHandler,
    writeAtomic: writeAtomic,
    createCheckpointWriter: createCheckpointWriter,
    createWatchdog: createWatchdog
  };
}));
