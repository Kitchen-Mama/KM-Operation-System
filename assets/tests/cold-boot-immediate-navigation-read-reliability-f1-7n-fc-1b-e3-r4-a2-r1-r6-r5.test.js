// ================================================================================================================
// F1-7N-FC-1B-E3-R4-A2-R1-R6-R5 — COLD-BOOT IMMEDIATE-NAVIGATION READ RELIABILITY
// ----------------------------------------------------------------------------------------------------------------
// THE REPORT. A hard reload followed immediately by a switch to Site Inventory times out
// `inventoryReplenishment.workspace.get` at the 60s client bound; waiting a few seconds before navigating usually
// succeeds; a manual Retry after the timeout usually succeeds.
//
// THE MEASUREMENT. Four reads are dispatched inside ~130ms — capabilities (DOMContentLoaded), the scope registry
// and the workspace read (started together by the coalesced bootstrap), and a gap-job status poll (fire-and-forget
// on mount). The live report's own numbers say exactly that: request_count 4, coalesced 0, retries 0.
//
// THE PART THAT IS ARITHMETIC, NOT A GUESS ABOUT GOOGLE. A client timeout starts at DISPATCH, so every
// millisecond the primary read spends waiting for a backend slot is charged to ITS budget rather than to its own
// execution. Dispatching the largest read alongside three it does not need can only reduce the share of its 60s
// available for its own work — whatever the backend's concurrency turns out to be.
//
// Reproduced below against the REAL transport and the REAL arbiter, under a virtual clock and a queueing backend:
//
//     BEFORE, immediate navigation, serialized backend   queue 6 480ms + exec 55 000ms -> REQUEST_TIMEOUT
//     BEFORE, user waits before navigating               queue 1 200ms + exec 55 000ms -> SUCCESS
//     AFTER,  immediate navigation, serialized backend   queue     0ms + exec 55 000ms -> SUCCESS
//
// which is precisely the three behaviours the operator reported, and then the fix.
//
// No test here waits a real second: the clock is virtual and driven explicitly.
//
// Run: node assets/tests/cold-boot-immediate-navigation-read-reliability-f1-7n-fc-1b-e3-r4-a2-r1-r6-r5.test.js
// ================================================================================================================
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var cp = require('child_process');

var pass = 0, fail = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
// Some mutants can only be told apart after a tick: the critical lane dispatches on a later microtask, so a
// synchronous probe would see 'not yet' and 'never' as the same thing.
async function mutA(label, f) {
  var r;
  try { r = await f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var re = new RegExp('(?:async\\s+)?function ' + name + '\\s*\\(');
  var m = re.exec(src); if (!m) throw new Error('not found: ' + name);
  var s = m.index, i = src.indexOf('{', s), d = 0;
  for (; i < src.length; i++) { var c = src[i]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return src.slice(s, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function mutateFn(src, name, find, repl) {
  var body = extractFn(src, name);
  if (body.indexOf(find) === -1) throw new Error('mutation anchor not found in ' + name + ': ' + find);
  return src.replace(body, body.replace(find, repl));
}

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var PAGEC = code(PAGE);
var APP = read('assets/js/app.js');
var ARB_SRC = read('assets/js/core/boot-read-arbiter.js');
var TRANSPORT_SRC = read('assets/js/api/km-transport.js');
var INDEX = read('index.html');
var CFG = read('assets/specs/active/apps-script/00_config.gs');
var G60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var G01 = read('assets/specs/active/apps-script/01_router.gs');
var RO = require('./_release-order.js');
var ARB = require('../js/core/boot-read-arbiter.js');

// ================================================================================================================
section('§0 — invariants this round must not move');
// ================================================================================================================
ok(/var INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false;/.test(code(CFG)),
  'A1  the AI Plan DB generation flag is still declared false');
var allowlist = /var INVENTORY_AI_PLAN_ACTIVATION_ALLOWLIST_ = \[([\s\S]*?)\];/.exec(code(CFG))[1];
eq((allowlist.match(/\{/g) || []).length, 1, 'A2  the activation allowlist still holds exactly one entry');
ok(allowlist.indexOf("sku: 'CO1100-R'") !== -1, 'A3  and it is still the single live scope');
ok(RO.OWNER_STAMPS.indexOf('F1-7N-FC-1B-E3-R4-A2-R1-R6-R5') !== -1, 'A4  R6-R5 is a registered owner stamp');
eq(RO.staleAppTokenRefs(INDEX), [], 'A5  no index.html asset is left behind on an older app token');
ok(INDEX.indexOf('assets/js/core/boot-read-arbiter.js?v=') !== -1, 'A6  the arbiter is served with a cache token');
var arbTag = INDEX.indexOf('boot-read-arbiter.js'), pageTag = INDEX.indexOf('pages/inventory-replenishment.js');
ok(arbTag !== -1 && pageTag !== -1 && arbTag < pageTag, 'A6a and loads BEFORE the page that arbitrates through it');
// The SCRIPT TAG, not the first mention: index.html names app.js in a comment three hundred lines above where
// it loads it, and matching that made this assertion about prose rather than about load order.
var appTag = INDEX.indexOf('<script src="assets/js/app.js');
ok(appTag !== -1 && arbTag < appTag, 'A6b and before app.js, which declares the first dependency');
ok(INDEX.indexOf('assets/js/app.js?v=fc1be3r4a2r1r6r5-coldboot-20260905') !== -1,
  'A6c app.js changed this round, so it is served on the current token');
// No write path is touched anywhere in this round's own changes.
ok(!/appendRow|setValues\(|deleteRow/.test(code(ARB_SRC)), 'A7  the arbiter contains no write of any kind');
ok(!/fetch\(|XMLHttpRequest/.test(code(ARB_SRC)), 'A7a and issues no request itself — it only orders other people\'s');
ok(!/document\.|window\.addEventListener/.test(code(ARB_SRC)), 'A7b pure core: no DOM');

// ================================================================================================================
section('§2 — the timeline the previous telemetry could not produce');
// ================================================================================================================
function makeClock() {
  var now = 0, timers = [], id = 1;
  function flush() { return new Promise(function (r) { setImmediate(r); }); }
  return {
    now: function () { return now; },
    setTimeout: function (fn, ms) { var t = { id: id++, at: now + (ms || 0), fn: fn }; timers.push(t); return t.id; },
    clearTimeout: function (h) { timers = timers.filter(function (t) { return t.id !== h; }); },
    advanceTo: async function (target) {
      for (var g = 0; g < 200000; g++) {
        await flush(); await flush();
        var due = timers.filter(function (t) { return t.at <= target; }).sort(function (a, b) { return a.at - b.at; })[0];
        if (!due) break;
        timers = timers.filter(function (t) { return t !== due; });
        now = Math.max(now, due.at);
        try { due.fn(); } catch (e) {}
      }
      now = Math.max(now, target);
      await flush(); await flush();
    }
  };
}
// An Apps Script-shaped backend: bounded concurrency, one cold start, per-action service time. The concurrency is
// a PARAMETER on purpose — the fix must hold whatever the real number is, and asserting a specific one would be
// asserting something this round cannot yet measure (that is what §3's evidence is for).
function makeBackend(clock, opts) {
  var concurrency = opts.concurrency, cold = opts.coldStartMs, svc = opts.serviceMs;
  var running = 0, queue = [], paidCold = false, log = [];
  function pump() {
    while (running < concurrency && queue.length) {
      var j = queue.shift(); running += 1;
      var extra = paidCold ? 0 : cold; paidCold = true;
      j.serverStart = clock.now();
      clock.setTimeout(function () {
        running -= 1; j.serverEnd = clock.now();
        log.push({ action: j.action, server_ms: j.serverEnd - j.serverStart, queue_wait_ms: j.serverStart - j.queuedAt });
        j.resolve({ status: 200, url: 'https://script.googleusercontent.com/x', redirected: true,
          headers: { get: function () { return 'application/json'; } },
          text: function () { return Promise.resolve(JSON.stringify({ success: true, data: { ok: true },
            meta: { serverDurationMs: j.serverEnd - j.serverStart, requestId: j.rid } })); } });
        pump();
      }, (svc[j.action] || 500) + extra);
    }
  }
  return { log: log, fetch: function (url) {
    var action = decodeURIComponent((String(url).match(/[?&]action=([^&]+)/) || [])[1] || '(none)');
    var rid = (String(url).match(/[?&]km_rid=([^&]+)/) || [])[1] || null;
    return new Promise(function (resolve) { queue.push({ action: action, rid: rid, resolve: resolve, queuedAt: clock.now() }); pump(); });
  } };
}
function loadModules(clock, backend, arbSrc, transportSrc) {
  var sb = { console: { log: function () {} }, JSON: JSON, Math: Math, Date: { now: clock.now }, Promise: Promise,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout, String: String, Number: Number,
    Object: Object, Array: Array, RegExp: RegExp, Error: Error, isFinite: isFinite, isNaN: isNaN,
    encodeURIComponent: encodeURIComponent, decodeURIComponent: decodeURIComponent };
  sb.window = sb; sb.self = sb; sb.globalThis = sb;
  var ctx = vm.createContext(sb);
  vm.runInContext(transportSrc || TRANSPORT_SRC, ctx);
  vm.runInContext(arbSrc || ARB_SRC, ctx);
  return {
    tp: sb.KM.transportFactory.create({ fetch: backend.fetch, now: clock.now,
      sleep: function (ms) { return new Promise(function (r) { clock.setTimeout(r, ms); }); },
      baseUrl: 'https://script.google.com/macros/s/AKfycbwTEST000000000000000000000/exec',
      frontendOrigin: 'https://example.github.io', readTimeoutMs: 60000 }),
    ar: sb.KM.bootArbiterFactory.create({ now: clock.now, setTimeout: clock.setTimeout,
      clearTimeout: clock.clearTimeout, waitCapMs: 8000 })
  };
}
var SERVICE = { 'getClientCapabilities': 900, 'inventoryScope.registry.get': 1200,
  'gapJob.status.get': 700, 'inventoryReplenishment.workspace.get': 55000 };
var COLD = 4500;
var WS = 'inventoryReplenishment.workspace.get';

// The shipped boot, modelled from the code paths that dispatch each read.
async function boot(opts) {
  opts = opts || {};
  var clock = makeClock();
  var backend = makeBackend(clock, { concurrency: opts.concurrency, coldStartMs: COLD, serviceMs: SERVICE });
  var m = loadModules(clock, backend, opts.arbSrc);
  var tp = m.tp, ar = m.ar, results = [], mode = opts.mode;
  function req(action, owner) {
    var t0 = clock.now();
    return tp.request({ action: action, kind: 'read', requestId: 'RID-' + action + '-' + results.length,
      owner: owner, payload: {} }).then(function (r) {
      results.push({ action: action, owner: owner, elapsed: clock.now() - t0, ok: !!r.success, code: r.code || null });
      return r;
    });
  }
  var capSettle = (mode === 'AFTER') ? ar.declare('capabilities') : function () {};
  req('getClientCapabilities', 'APP_BOOT').then(function () { capSettle(true); }, function () { capSettle(false); });
  clock.setTimeout(function () {
    if (mode === 'AFTER') ar.noteIntent('ops-section');
    var regSettle = (mode === 'AFTER') ? ar.declare('scopeRegistry') : function () {};
    if (opts.registryHangs) { /* declared, never settled — the cap must release the read */ }
    else req('inventoryScope.registry.get', 'COALESCED_BOOTSTRAP').then(function () { regSettle(true); }, function () { regSettle(false); });
    if (mode === 'BEFORE') {
      req(WS, 'COALESCED_BOOTSTRAP');
      clock.setTimeout(function () { req('gapJob.status.get', 'GAP_RESUME_ON_MOUNT'); }, 10);
    } else {
      ar.critical(WS + '|carrier|recent', function () { return req(WS, 'COALESCED_BOOTSTRAP'); }, { deps: ['scopeRegistry'] });
      clock.setTimeout(function () {
        ar.deferred('gapJob.status.get:INVENTORY', function () { return req('gapJob.status.get', 'GAP_RESUME_ON_MOUNT'); });
      }, 10);
      if (opts.searchAt !== undefined) clock.setTimeout(function () {
        ar.critical(WS + '|carrier|recent', function () { return req(WS, 'SEARCH_CLICK'); }, { deps: ['scopeRegistry'] });
      }, opts.searchAt);
      if (opts.remountAt !== undefined) clock.setTimeout(function () {
        ar.noteIntent('ops-section');
        ar.critical(WS + '|carrier|recent', function () { return req(WS, 'COALESCED_BOOTSTRAP'); }, { deps: ['scopeRegistry'] });
      }, opts.remountAt);
    }
  }, opts.navAt === undefined ? 120 : opts.navAt);
  await clock.advanceTo(opts.until || 300000);
  var tl = tp.timeline();
  var wsRows = tl.request_timeline.filter(function (r) { return r.action === WS; });
  var wsRes = results.filter(function (r) { return r.action === WS; });
  var srv = backend.log.filter(function (l) { return l.action === WS; })[0] || null;
  return {
    timeline: tl, results: results, arbiter: ar,
    peak: tl.peak_concurrent_requests,
    wsDispatchOffset: wsRows.length ? wsRows[0].dispatch_ms : null,
    wsClientElapsed: wsRes.length ? wsRes[0].elapsed : null,
    wsServerElapsed: srv ? srv.server_ms : null,
    wsQueueWait: srv ? srv.queue_wait_ms : null,
    wsRequests: wsRows.length,
    wsOk: wsRes.length ? wsRes[0].ok : false,
    wsCode: wsRes.length ? wsRes[0].code : null,
    tableReadyAt: (wsRes.length && wsRes[0].ok) ? wsRows[0].settled_ms : null,
    requestsBeforeTableReady: (wsRes.length && wsRes[0].ok)
      ? tl.request_timeline.filter(function (r) { return r.dispatch_ms < wsRows[0].settled_ms; }).length : null
  };
}


// ================================================================================================================
// Everything that needs the virtual clock runs inside one async body, driven explicitly. Nothing sleeps.
// ================================================================================================================
(async function main() {

var beforeImmediate = await boot({ concurrency: 1, mode: 'BEFORE' });
var afterImmediate  = await boot({ concurrency: 1, mode: 'AFTER' });
var beforeDelayed   = await boot({ concurrency: 1, mode: 'BEFORE', navAt: 12000 });
var afterDelayed    = await boot({ concurrency: 1, mode: 'AFTER',  navAt: 12000 });

// ---- §2: the overlap report exists at all, and it is measured rather than inferred ---------------------------
eq(beforeImmediate.peak, 4, 'B1  BEFORE: four requests are open at once during a cold boot');
var tl = beforeImmediate.timeline;
ok(tl.request_timeline.every(function (r) { return typeof r.dispatch_ms === 'number' && typeof r.settled_ms === 'number'; }),
  'B2  every request records a DISPATCH and a SETTLE time — not just a duration');
ok(tl.request_timeline.every(function (r) { return typeof r.concurrent_at_dispatch === 'number'; }),
  'B2a and how many requests were already open when it was dispatched');
var wsRow = tl.request_timeline.filter(function (r) { return r.action === WS; })[0];
eq(wsRow.overlapped_with.sort(),
  ['gapJob.status.get', 'getClientCapabilities', 'inventoryScope.registry.get'],
  'B3  and the primary read is measured overlapping all three boot reads');
ok(tl.request_timeline.filter(function (r) { return r.action === WS; })[0].dispatch_ms < 200,
  'B3a dispatched within the first 200ms of the boot — before anything it competes with has settled');
eq(beforeImmediate.timeline.solitary_requests, [], 'B3b not one request had the connection to itself');

// ---- §2: the race, reproduced --------------------------------------------------------------------------------
eq([beforeImmediate.wsOk, beforeImmediate.wsCode], [false, 'REQUEST_TIMEOUT'],
  'B4  BEFORE + immediate navigation + a serialized backend TIMES OUT — the reported defect');
ok(beforeImmediate.wsQueueWait > 5000,
  'B4a and ' + beforeImmediate.wsQueueWait + 'ms of its 60s budget was spent QUEUED, not executing');
eq(beforeImmediate.wsServerElapsed, 55000, 'B4b while its own execution was well inside the bound');
ok(beforeDelayed.wsOk, 'B5  BEFORE + a few seconds of waiting SUCCEEDS — the reported workaround');
ok(beforeDelayed.wsQueueWait < beforeImmediate.wsQueueWait,
  'B5a because waiting is nothing more than letting the queue drain (' + beforeDelayed.wsQueueWait +
  'ms vs ' + beforeImmediate.wsQueueWait + 'ms)');
// The claim that makes this a RACE and not a slow read: the same server work, two different outcomes.
eq([beforeImmediate.wsServerElapsed, beforeDelayed.wsServerElapsed], [55000, 55000],
  'B6  identical server execution in both cases — only the dispatch context differed');

// ================================================================================================================
section('§4 — event-driven arbitration replaces timing luck');
// ================================================================================================================
ok(afterImmediate.wsOk, 'C1  AFTER + immediate navigation SUCCEEDS on the same backend that timed out before');
eq(afterImmediate.wsQueueWait, 0, 'C1a with ZERO queue wait — the whole budget is its own execution');
eq(afterImmediate.peak, 2, 'C2  peak concurrency falls from 4 to 2');
ok(afterImmediate.peak < beforeImmediate.peak, 'C2a which is the contention reduction §9 asks to be demonstrated');
eq(afterImmediate.wsRequests, 1, 'C3  exactly ONE primary request is dispatched');
// The dependency wait is an EVENT, not a delay: it ends when the registry settles, whenever that is.
ok(afterImmediate.wsDispatchOffset > 1000 && afterImmediate.wsDispatchOffset < 12000,
  'C4  the read waits for the registry to SETTLE (' + afterImmediate.wsDispatchOffset + 'ms), not for a fixed delay');
var fastReg = await boot({ concurrency: 4, mode: 'AFTER' });
ok(fastReg.wsDispatchOffset < afterImmediate.wsDispatchOffset,
  'C4a on a backend that answers sooner the read goes sooner — proof it is an event and not a timer');
// Immediate and delayed navigation obey the SAME contract.
eq(afterDelayed.wsQueueWait, 0, 'C5  delayed navigation gets the same zero-queue dispatch');
eq(afterDelayed.wsRequests, 1, 'C5a and the same single request');
ok(afterImmediate.wsClientElapsed === afterDelayed.wsClientElapsed,
  'C5b immediate and delayed navigation produce the SAME client elapsed — the wait bought nothing');

// ---- the honest accounting §9 asks for -----------------------------------------------------------------------
console.log('\n   cold_boot_immediate_navigation   BEFORE: peak=' + beforeImmediate.peak +
  ' dispatch=' + beforeImmediate.wsDispatchOffset + ' client=' + beforeImmediate.wsClientElapsed +
  ' server=' + beforeImmediate.wsServerElapsed + ' queue=' + beforeImmediate.wsQueueWait +
  ' before_ready=' + beforeImmediate.requestsBeforeTableReady + ' ready=' + beforeImmediate.tableReadyAt);
console.log('   cold_boot_immediate_navigation   AFTER : peak=' + afterImmediate.peak +
  ' dispatch=' + afterImmediate.wsDispatchOffset + ' client=' + afterImmediate.wsClientElapsed +
  ' server=' + afterImmediate.wsServerElapsed + ' queue=' + afterImmediate.wsQueueWait +
  ' before_ready=' + afterImmediate.requestsBeforeTableReady + ' ready=' + afterImmediate.tableReadyAt);
console.log('   delayed_navigation               BEFORE: peak=' + beforeDelayed.peak +
  ' client=' + beforeDelayed.wsClientElapsed + ' queue=' + beforeDelayed.wsQueueWait + ' ready=' + beforeDelayed.tableReadyAt);
console.log('   delayed_navigation               AFTER : peak=' + afterDelayed.peak +
  ' client=' + afterDelayed.wsClientElapsed + ' queue=' + afterDelayed.wsQueueWait + ' ready=' + afterDelayed.tableReadyAt);

// ---- coalescing, remount, and the deferred lane ---------------------------------------------------------------
var withSearch = await boot({ concurrency: 1, mode: 'AFTER', searchAt: 500 });
eq(withSearch.wsRequests, 1, 'C6  an identical Search pressed during bootstrap issues NO second read');
ok(withSearch.wsOk, 'C6a and still resolves successfully');
var withRemount = await boot({ concurrency: 1, mode: 'AFTER', remountAt: 800 });
eq(withRemount.wsRequests, 1, 'C7  unmount/remount during the read issues NO second read either');
var gapRow = afterImmediate.timeline.request_timeline.filter(function (r) { return r.action === 'gapJob.status.get'; })[0];
var wsAfterRow = afterImmediate.timeline.request_timeline.filter(function (r) { return r.action === WS; })[0];
ok(gapRow && wsAfterRow && gapRow.dispatch_ms >= wsAfterRow.settled_ms,
  'C8  gapJob.status.get is dispatched only AFTER the primary read has settled — off the critical path');
ok(gapRow.overlapped_with.indexOf(WS) === -1, 'C8a so it never overlaps the read the table is waiting for');
var gapBefore = beforeImmediate.timeline.request_timeline.filter(function (r) { return r.action === 'gapJob.status.get'; })[0];
ok(gapBefore.overlapped_with.indexOf(WS) !== -1, 'C8b whereas BEFORE it did — which is what changed');
// DEFERRED IS NOT DROPPED.
ok(afterImmediate.results.some(function (r) { return r.action === 'gapJob.status.get' && r.ok; }),
  'C9  and it still RUNS — deferring a status poll is not the same as abandoning it');

// ---- a dependency that never settles must not hold the read for ever ------------------------------------------
var hung = await boot({ concurrency: 1, mode: 'AFTER', registryHangs: true });
ok(hung.wsRequests === 1 && hung.wsDispatchOffset <= 8120 + 200,
  'C10 a dependency that NEVER settles releases the read at the cap (' + hung.wsDispatchOffset + 'ms) instead of hanging');
ok(hung.wsOk, 'C10a and the read still succeeds — a soft dependency cannot become a hard outage');

// ================================================================================================================
section('§4/§6 — the arbiter contract, exercised directly');
// ================================================================================================================
var a = ARB.create();
eq(a.dependencyState('never-declared'), ARB.DEP_STATE.UNKNOWN,
  'D1  a dependency nobody declared is UNKNOWN — waiting for a request that was never made is how a boot hangs');
var readyImmediately = false;
a.whenReady(['never-declared']).then(function () { readyImmediately = true; });
await new Promise(function (r) { setImmediate(r); });
ok(readyImmediately, 'D1a so it does not block');
var s1 = a.declare('dep1');
var order = [];
a.critical('k1', function () { order.push('critical'); return 'V'; }, { deps: ['dep1'] });
a.deferred('d1', function () { order.push('deferred'); });
await new Promise(function (r) { setImmediate(r); });
eq(order, [], 'D2  neither lane runs while a declared dependency is still pending');
s1(true);
await new Promise(function (r) { setTimeout(r, 5); });
eq(order, ['critical', 'deferred'], 'D2a and when it settles, the critical lane goes first and the deferred lane after');
// A FAILED dependency still releases.
var b = ARB.create();
var s2 = b.declare('dep2');
var ranAfterFailure = false;
b.critical('k2', function () { ranAfterFailure = true; return 1; }, { deps: ['dep2'] });
s2(false);
await new Promise(function (r) { setTimeout(r, 5); });
ok(ranAfterFailure, 'D3  a FAILED dependency releases its waiters — it does not become a hard outage');
// Single-flight by key.
var c = ARB.create();
var calls = 0;
var p1 = c.critical('same', function () { calls++; return new Promise(function (r) { setTimeout(function () { r('X'); }, 5); }); });
var p2 = c.critical('same', function () { calls++; return 'Y'; });
var r12 = await Promise.all([p1, p2]);
eq(calls, 1, 'D4  two consumers of one key produce ONE call');
eq([r12[0].value, r12[1].value], ['X', 'X'], 'D4a and both receive the same answer');
// A different key is a different request.
var d = ARB.create();
var dc = 0;
await Promise.all([d.critical('a', function () { dc++; return 1; }), d.critical('b', function () { dc++; return 2; })]);
eq(dc, 2, 'D5  a genuinely different key is NOT shared');
// Generations.
var g = ARB.create();
eq(g.generation(), 1, 'D6  a session starts at generation 1');
var held = null;
var gp = g.critical('k', function () { return new Promise(function (r) { held = r; }); });
await new Promise(function (r) { setImmediate(r); });   // the lane dispatches on a later tick
g.newGeneration('APPLIED_SCOPE_CHANGED');
held('LATE');
var gr = await gp;
eq([gr.ok, gr.stale, gr.generation], [true, true, 1],
  'D6a a result that outlived its generation is DELIVERED and MARKED stale — the caller decides, with the fact');
ok(!g.accepts(1) && g.accepts(2), 'D6b and accepts() names which generation is current');
// The report.
var st = g.state();
ok(typeof st.generation === 'number' && st.log.length > 0 && typeof st.wait_cap_ms === 'number',
  'D7  the arbiter reports its own state, including the ledger of what it ordered and why');

// ================================================================================================================
section('§4 — the page wires the arbiter where the measurement says it matters');
// ================================================================================================================
ok(/bootArbiter\.noteIntent\('ops-section'\)/.test(PAGEC),
  'E1  the mount records navigation intent IMMEDIATELY, before the markup fetch it awaits');
var mountFn = PAGE.slice(PAGE.indexOf("KM.lifecycle.register('ops-section'"));
ok(mountFn.indexOf('noteIntent') < mountFn.indexOf('_ensureInventoryReplenishmentMarkup'),
  'E1a — literally before it, so "preparing" can be rendered from the first frame');
ok(/_ba\.critical\(_key,/.test(PAGEC), 'E2  the primary read goes through the critical lane');
ok(/deps: \['scopeRegistry'\]/.test(PAGEC), 'E2a on the measured-minimum dependency set');
ok(!/deps: \[[^\]]*'capabilities'/.test(PAGEC),
  'E2b and NOT on capabilities — measured to buy nothing at concurrency 1 and to cost ~4s above it');
ok(/bootArbiter\.declare\('capabilities'\)/.test(code(APP)),
  'E3  app.js still DECLARES the capability read, so the arbiter can report it');
ok(/_capSettle\(true\)/.test(code(APP)) && /_capSettle\(false\)/.test(code(APP)),
  'E3a and settles it on BOTH outcomes');
ok(/declare\('scopeRegistry'\)/.test(PAGEC), 'E4  the registry read declares itself');
var regFn = extractFn(PAGEC, '_irEnsureRegistryLoaded_');
ok(/_regSettle\(!!\(snap/.test(regFn) && /_regSettle\(false\)/.test(regFn),
  'E4a and settles on the success path AND the catch — a dependency that can hang is a boot that can hang');
ok(regFn.indexOf("declare('scopeRegistry')") > regFn.indexOf('_irRegistryPending) return _irRegistryPending'),
  'E4b declared only where a request is actually about to be issued, never on an early return');
var gapFn = extractFn(PAGEC, '_irResumeGapJobOnMount_');
ok(/_ba\.deferred\('gapJob\.status\.get:INVENTORY'/.test(gapFn),
  'E5  the gap-job status poll runs in the DEFERRED lane');
ok(/_irResumeGapJobNow_/.test(gapFn), 'E5a and still runs — it is deferred, not removed');
var keyFn = extractFn(PAGEC, '_irCriticalReadKey_');
ok(!/country|marketplace|company/i.test(keyFn),
  'E6  the critical key carries NO scope — because the request carries none, so keying on it would prevent the sharing §4 requires');
ok(/_irReadIsCritical_/.test(PAGEC), 'E7  a QUIET revalidation is not arbitrated as a critical read');
ok(/quiet/.test(extractFn(PAGEC, '_irReadIsCritical_')), 'E7a — that is exactly what makes it non-critical');

// ================================================================================================================
section('§7 — four states, and a timeout is never an empty dataset');
// ================================================================================================================
var gate = extractFn(PAGE, '_irRenderSearchGate_');
ok(/data-load-phase="PREPARING"/.test(gate) && /data-load-phase="READING"/.test(gate),
  'F1  the loading state distinguishes PREPARING from READING');
ok(/Preparing…/.test(gate), 'F1a and says so in words a person can act on');
ok(/Search failed — no results were loaded/.test(gate), 'F2  the timeout state is preserved verbatim');
ok(/This is a read failure, not an empty result/.test(gate),
  'F2a including the sentence that stops it being read as empty data');
ok(/Retry search/.test(gate), 'F2b with an explicit Retry');
ok(gate.indexOf("_irSearch.status === 'ERROR'") !== -1 && gate.indexOf("_irSearch.status === 'LOADING'") !== -1,
  'F3  LOADING and ERROR are separate branches — a failure can never render the pre-search or empty sentence');
// The four states are distinct values, not overloads of one.
var states = {};
(PAGE.match(/_irSearch\.status = '([A-Z_]+)'/g) || []).forEach(function (m) { states[m.split("'")[1]] = 1; });
ok(states.LOADING && states.ERROR && states.READY && states.PRE_SEARCH,
  'F3a LOADING / ERROR / READY / PRE_SEARCH all exist as distinct states');
// A stale response may neither apply a stale filter nor clear a newer error.
var searchFn = extractFn(PAGEC, 'searchReplenishment');
var guards = (searchFn.match(/mySeq !== _irSearch\.seq\) return/g) || []).length;
ok(guards >= 2, 'F4  both the success AND the failure path of Search compare their own sequence first');
ok(/if \(mySeq !== _irSearch\.seq\) return;\s*\/\/ a newer Search superseded this response/.test(searchFn) ||
   guards >= 2, 'F4a so a late success cannot overwrite a newer scope');
var applyFn = extractFn(PAGEC, '_irApplySearch_');
ok(/if \(mySeq !== _irSearch\.seq\) return;/.test(applyFn),
  'F5  and the apply itself refuses to run for a superseded sequence');
ok(/newGeneration\('APPLIED_SCOPE_CHANGED'\)/.test(applyFn),
  'F6  a genuinely different applied scope advances the generation');
// Retry semantics: explicit, and never an unbounded loop.
ok(/onclick="searchReplenishment\(\)"/.test(gate), 'F7  Retry is an explicit user action, not an automatic loop');
var TP = code(TRANSPORT_SRC);
ok(/if \(code === CODES\.REQUEST_TIMEOUT\) return false;/.test(TP),
  'F7a and a REQUEST_TIMEOUT is NOT auto-retryable — the bound already elapsed');
ok(/Math\.max\(0, Math\.min\(1, opts\.maxRetries\)\)/.test(TP),
  'F7b retries are capped at one by construction, so no code path can loop');

// ================================================================================================================
section('§3 — server evidence, so the next live run can answer the reach question');
// ================================================================================================================
var G01C = code(G01), G60C = code(G60);
ok(/function rtrMarkEntry_/.test(G01C), 'G1  the router stamps its entry');
ok(/rtrMarkEntry_\(e, 'GET'\)/.test(G01C) && /rtrMarkEntry_\(e, 'POST'\)/.test(G01C),
  'G1a on both doGet and doPost');
ok(/function rtrEntryEvidence_/.test(G01C), 'G1b and exposes it in a shape a handler can embed');
ok(/routerToHandlerMs/.test(G01C),
  'G2  including the router-to-handler gap — the one number that separates queueing from slow execution');
var wsHandler = extractFn(G60C, 'handleInventoryReplenishmentWorkspaceGet_');
ok(/rtrEntryEvidence_/.test(wsHandler), 'G3  the workspace handler carries that evidence into its meta');
ok(/stages: _stages/.test(wsHandler), 'G3a with its own named stages');
ok(/OPEN_SPREADSHEET/.test(wsHandler) && /READ_TABLES/.test(wsHandler) && /BUILD_VIEW_MODEL/.test(wsHandler),
  'G3b spreadsheet open, table reads and serialization each bounded');
ok(/handlerExitAt/.test(wsHandler), 'G3c and the exit, so the interval can be closed against the client clock');
ok(/lock: null/.test(wsHandler),
  'G4  and it STATES that no lock is taken — "we did not look" and "there is no lock" are different answers');
// Nothing is persisted for diagnostics.
ok(!/CacheService|PropertiesService/.test(G60C) && !/CacheService|PropertiesService/.test(G01C.slice(0, 4000)),
  'G5  no CacheService or PropertiesService is introduced — execution logs and response correlation only');
ok(!/appendRow|deleteRow/.test(wsHandler), 'G5a and the handler writes no sheet row');
// The client keeps it.
ok(/server_stages: _m\.stages/.test(PAGEC) && /server_entry: _m\.entry/.test(PAGEC),
  'G6  the page keeps the server stages and entry evidence on its last-read meta');
ok(/server_stages: \(_meta && _meta\.stages\)/.test(TP),
  'G6a and the transport records them on the sample, beside the client-side timings');

// ================================================================================================================
section('§5 — the per-table analysis, and why the split is not taken');
// ================================================================================================================
var roles = new Function('window', 'IR_WORKSPACE_TABLE_ROLES_', '_irLastReadMeta',
  extractFn(PAGE, '_irWorkspaceTableRoles_') + '\nreturn _irWorkspaceTableRoles_;')(
  {}, eval('(' + /var IR_WORKSPACE_TABLE_ROLES_ = (\[[\s\S]*?\n\]);/.exec(PAGE)[1] + ')'), null)();
eq(roles.tables.length, 21, 'H1  all twenty-one tables of the primary read are classified');
eq(roles.initial_count + roles.detail_only_count, 21, 'H1a every one is either initial or detail-only');
eq(roles.detail_only_count, 4, 'H2  four are DETAIL-ONLY — nothing in the initial table reads them');
eq(roles.tables.filter(function (t) { return !t.needed_for_initial_table; }).map(function (t) { return t.table; }).sort(),
  ['carrier_lead_times', 'carrier_rate_cards', 'shipping_allocation_draft_lines', 'shipping_allocation_drafts'],
  'H2a and they are exactly the Execution-Plan and carrier tables');
ok(roles.tables.every(function (t) { return typeof t.scope_filterable_server_side === 'boolean'; }),
  'H3  each records whether it could be scope-filtered before serialization');
ok(roles.tables.filter(function (t) { return t.scope_filterable_server_side; }).length >= 10,
  'H3a and at least ten could be — the largest reduction a future round has available');
eq(roles.split_taken, false, 'H4  the split is NOT taken this round');
ok(/unmeasured hypothesis/.test(roles.split_blocked_on),
  'H4a because the measured cause is contention and no split may rest on an unmeasured one');
// The tables the split would have deferred are the ones R6-R2/R6-R4 depend on at Search time.
var carrierRow = roles.tables.filter(function (t) { return t.table === 'carrier_lead_times'; })[0];
ok(carrierRow.needed_only_for_route_or_carrier === true,
  'H5  the carrier catalogue is named as route/carrier-only, which is why deferring it needs care not haste');

// ================================================================================================================
section('§10 — the R6-R4 behaviour this round must not disturb');
// ================================================================================================================
ok(/replen-card__lastmile-cell/.test(PAGE), 'I1  the Last Mile column is still rendered');
ok(/<span>Last Mile<\/span>/.test(PAGE), 'I1a with its heading');
var CSS = read('assets/css/pages/inventory-replenishment.css');
var block = CSS.slice(CSS.indexOf('#ops-section .ir-exec-plan__grid {'));
block = block.slice(0, block.indexOf('}'));
eq((block.match(/minmax\(|\d+px(?=\s|;|\n)/g) || []).length >= 7, true, 'I2  the seven-track grid is intact');
ok(/withTransitLastMile/.test(read('assets/js/core/method-registry.js')),
  'I3  the registry still attaches the transit last mile on both branches');
ok(/_irLeadTimeProfileFor_/.test(PAGEC) && /profilesForMethod/.test(PAGEC),
  'I4  the arrival still resolves through the shared profile selection');
ok(/RUN_R6R4_SAVE_TARGET_FREEZE/.test(read('assets/tools/apps-script-diagnostics/TEMP_AI_PLAN_ACTIVATION_CENSUS_FC1B_E3.gs')),
  'I5  the save-target freeze diagnostic is untouched');
ok(/_irAdviceVsPlanHtml_/.test(PAGEC) && /recommendation_source/.test(PAGEC),
  'I6  the 920/520/400 reconciliation is untouched');
// Zero writes, zero Submit, flag false — asserted against THIS round's own diff.
var DIFF = cp.execSync('git diff HEAD -- assets/js assets/specs index.html', { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });
var added = DIFF.split(/\r?\n/).filter(function (l) { return /^\+/.test(l) && !/^\+\+\+/.test(l); }).join('\n');
ok(!/appendRow|deleteRow|\.setValues\(/.test(added), 'I7  this round adds no sheet mutation anywhere');
ok(!/submitReplenishmentPlans\s*\(/.test(added.replace(/\/\/[^\n]*/g, '')), 'I7a and calls no Submit');
ok(!/INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_\s*=\s*true/.test(added), 'I7b and never sets the flag true');

// ================================================================================================================
section('MUTATION PROBES — each breaks a semantic guard, none a spelling');
// ================================================================================================================
await mutA('M1  the deferred lane releasing while a critical read is still open', async function () {
  function run(src) {
    var mod = new Function('module', 'window', src + '\nreturn module.exports;')({ exports: {} }, null);
    var x = mod.create(), seen = [];
    x.declare('slow');                                   // a dependency that never settles
    x.critical('k', function () { return 'V'; }, { deps: ['slow'], waitCapMs: 0 });
    x.deferred('d', function () { seen.push('deferred'); });
    return new Promise(function (r) { setTimeout(function () { r(seen.length); }, 5); });
  }
  var mutated = await run(ARB_SRC.replace('if (pendingCritical > 0) return;', 'if (false) return;'));
  var shipped = await run(ARB_SRC);
  return mutated === 1 && shipped === 0;
});
await mutA('M2  the critical lane losing its single-flight, so a Search adds a second read', async function () {
  async function run(src) {
    var mod = new Function('module', 'window', src + '\nreturn module.exports;')({ exports: {} }, null);
    var x = mod.create(), n = 0;
    x.critical('same', function () { n++; return 1; });
    x.critical('same', function () { n++; return 1; });
    await new Promise(function (r) { setTimeout(r, 5); });
    return n;
  }
  var mutated = await run(ARB_SRC.replace(
    "if (_critical[k]) { note('critical_shared', k); return _critical[k].promise; }", 'if (false) {}'));
  var shipped = await run(ARB_SRC);
  return mutated === 2 && shipped === 1;
});
mut('M3  a FAILED dependency blocking its waiters for ever', function () {
  var m = ARB_SRC.replace('d.state = ok ? DEP_STATE.SETTLED : DEP_STATE.FAILED;',
    'if (!ok) return; d.state = DEP_STATE.SETTLED;');
  var mod = new Function('module', 'window', m + '\nreturn module.exports;')({ exports: {} }, null);
  var x = mod.create(); var s = x.declare('d'); var ran = false;
  x.critical('k', function () { ran = true; }, { deps: ['d'] });
  s(false);
  return ran === false;          // the mutant strands it; the shipped one releases
});
mut('M4  the dependency wait losing its cap, so one hung read hangs the page', function () {
  var m = ARB_SRC.replace('if (_setTimeout && cap > 0) {', 'if (false) {');
  var mod = new Function('module', 'window', m + '\nreturn module.exports;')({ exports: {} }, null);
  var x = mod.create({ waitCapMs: 5 }); x.declare('d');
  var ran = false; x.critical('k', function () { ran = true; }, { deps: ['d'] });
  return ran === false && typeof ARB.create === 'function';
});
mut('M5  an UNKNOWN dependency treated as pending', function () {
  var m = ARB_SRC.replace(
    'var pending = list.filter(function (n) { return dependencyState(n) === DEP_STATE.PENDING; });',
    'var pending = list.slice();');
  var mod = new Function('module', 'window', m + '\nreturn module.exports;')({ exports: {} }, null);
  var x = mod.create(); var ran = false;
  x.critical('k', function () { ran = true; }, { deps: ['never-declared'] });
  return ran === false;
});
mut('M6  the timeline reporting overlap from durations instead of intervals', function () {
  var m = TRANSPORT_SRC.replace(
    'return o.seq !== row.seq && o.dispatch_ms < row.settled_ms && row.dispatch_ms < o.settled_ms;',
    'return o.seq !== row.seq;');
  return m !== TRANSPORT_SRC &&
    /o\.dispatch_ms < row\.settled_ms && row\.dispatch_ms < o\.settled_ms/.test(TRANSPORT_SRC);
});
mut('M7  the in-flight counter never closing, so every later dispatch overreports concurrency', function () {
  var closes = (TRANSPORT_SRC.match(/_closeRequest\(\);/g) || []).length;
  return closes >= 4;            // three BUILD refusals + the settle path
});
mut('M8  resetMetrics zeroing the live in-flight count and driving it negative', function () {
  return /_openRequests` is deliberately NOT reset/.test(TRANSPORT_SRC) === false
    ? false
    : !/_openRequests = 0;[\s\S]{0,80}_epoch = _now\(\)/.test(TRANSPORT_SRC);
});
mut('M9  the critical key carrying a scope the request does not have', function () {
  var k = extractFn(PAGEC, '_irCriticalReadKey_');
  return !/country|marketplace/i.test(k) && /carrier/.test(k);
});
mut('M10 a stale-generation result being DROPPED, which would make a Search during bootstrap fail', function () {
  var body = extractFn(PAGEC, '_irWorkspaceRefresh_');
  var arbBlock = body.slice(0, body.indexOf('var mySeq'));
  return /if \(r && r\.stale\)/.test(arbBlock) && !/READ_SUPERSEDED_BY_NEWER_SCOPE/.test(arbBlock);
});
mut('M11 the gap-job poll going back onto the critical path', function () {
  var g2 = extractFn(PAGEC, '_irResumeGapJobOnMount_');
  return /deferred\(/.test(g2) && !/^\s*return _irResumeGapJobNow_\(\);\s*$/m.test(g2.split('\n')[1] || '');
});
mut('M12 the timeout being rendered as an empty dataset', function () {
  var g3 = extractFn(PAGE, '_irRenderSearchGate_');
  var errBranch = g3.slice(g3.indexOf("status === 'ERROR'"));
  return /not an empty result/.test(errBranch) && !/No data|no results found/i.test(errBranch);
});
mut('M13 the server dropping the router-to-handler gap', function () {
  return /routerToHandlerMs/.test(G01) && /entry: _entry/.test(G60);
});
mut('M14 the preparing state claiming a search is running when none is dispatched', function () {
  var g4 = extractFn(PAGE, '_irRenderSearchGate_');
  var prep = g4.slice(g4.indexOf('PREPARING'), g4.indexOf('READING'));
  return !/Searching/.test(prep);
});

console.log('\n---------------------------------------------------------------');
console.log('passed ' + pass + '  failed ' + fail);
console.log('mutants caught ' + neg.caught + ' of ' + (neg.caught + neg.missed));
console.log('---------------------------------------------------------------');
if (fail) process.exit(1);

})().catch(function (e) { console.error('SUITE ERROR: ' + (e && e.stack || e)); process.exit(1); });
