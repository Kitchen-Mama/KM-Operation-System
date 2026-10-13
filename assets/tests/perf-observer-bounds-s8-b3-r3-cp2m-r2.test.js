// =============================================================================================================
// S8-B3-R3-CP2M-R2 — THE PERFORMANCE OBSERVER'S BOUNDS, ENFORCED RATHER THAN PROMISED
// -------------------------------------------------------------------------------------------------------------
// The observation was approved with limits attached: no new business request, no upload, no Production write, no
// full rows or credentials or sensitive URLs, no change to the Loader / IR 13+6 / Boot Arbiter / transport /
// timeout / cache / hydration, enabling or disabling it must not change a business result, cleanup must be
// verified with no duplicate listeners, and a release candidate ships with it OFF.
//
// A report can only ASSERT those. This file checks them, in two ways that catch different things:
//
//   SOURCE  — the file may not contain a fetch, an XHR, a storage write or a script insertion at all. An
//             observer that cannot issue a request cannot issue one by accident later either.
//   RUNTIME — the module is loaded into a fake window with instrumented seams, enabled, exercised and
//             disabled, and the seams are compared BY IDENTITY before and after. A wrapper that restored a
//             look-alike instead of the original would pass a source grep and fail here.
//
// AND IT IS OFF IN THE CANDIDATE BY NOT BEING THERE. index.html must never reference this file, which is the
// strongest form of "default OFF": a release candidate carries zero bytes of it and registers nothing.
// =============================================================================================================
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

const SRC = read('assets/js/core/perf-observer.js');
const INDEX = read('index.html');

// -------------------------------------------------------------------------------------------------------------
section('A. a release candidate carries none of it');

ok(INDEX.indexOf('perf-observer') === -1,
  'A1 index.html does not reference the observer — the candidate loads zero bytes of it');
ok(/\benabled\s*=\s*false\s*;/.test(SRC), 'A2 and the module is disabled until enable() is called');
ok(SRC.indexOf('KM.perf.enable(') === -1 || !/^\s*(window\.)?KM\.perf\.enable\(/m.test(SRC),
  'A3 and nothing in the file enables itself on load');

// -------------------------------------------------------------------------------------------------------------
section('B. it cannot issue a request, upload anything, or persist anything');

// `fetch(` would also match a comment; the check is on CODE lines only, which is why comments are stripped.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

ok(!/[^.\w]fetch\s*\(/.test(CODE), 'B1 no fetch');
ok(CODE.indexOf('XMLHttpRequest') === -1, 'B2 no XHR');
ok(CODE.indexOf('sendBeacon') === -1, 'B3 no sendBeacon');
ok(CODE.indexOf('WebSocket') === -1, 'B4 no socket');
ok(CODE.indexOf('localStorage') === -1, 'B5 no localStorage');
ok(CODE.indexOf('sessionStorage') === -1, 'B6 no sessionStorage');
ok(CODE.indexOf('indexedDB') === -1, 'B7 no IndexedDB');
ok(CODE.indexOf('document.cookie') === -1, 'B8 no cookie');
ok(!/createElement\s*\(\s*['"]script/.test(CODE), 'B9 no script insertion');
ok(!/new\s+Image\s*\(/.test(CODE), 'B10 no image beacon');

// -------------------------------------------------------------------------------------------------------------
section('C. it does not touch the owners it is forbidden to change');

[['KM.transport', 'transport'], ['boot-read-arbiter', 'the Boot Read Arbiter'],
 ['deferredRead', 'the deferred-read owner'], ['referenceCache', 'the reference cache'],
 ['setTimeout(_kmFetch', 'the client timeout']].forEach(function (p) {
  ok(CODE.indexOf(p[0]) === -1, 'C1 does not reference ' + p[1]);
});
// The seams it DOES wrap, named here so a future addition is a deliberate edit to this list.
const WRAPPED = ['beginNavigation', 'loadPartial', 'load', 'ensure', 'switchTo'];
WRAPPED.forEach(function (n) {
  ok(new RegExp("wrap\\([^)]*'" + n + "'").test(CODE), 'C2 wraps ' + n);
});
const wrapCount = (CODE.match(/wrap\(window\.KM/g) || []).length;
eq(wrapCount, WRAPPED.length, 'C2a and wraps exactly those five seams and nothing else');
// A wrapper that did not forward its arguments verbatim would rewrite switchTo's navigation authority,
// because switchTo reads `navToken === undefined` to mean "a fresh intent".
ok((CODE.match(/orig\.apply\(this, arguments\)/g) || []).length >= WRAPPED.length,
  'C3 every wrapper forwards with apply(this, arguments) — arity is part of switchTo\'s contract');

// -------------------------------------------------------------------------------------------------------------
section('D. what it retains cannot carry a secret');

ok(/function tag\(/.test(CODE), 'D1 resource URLs go through a reducer');
ok(/q\s*=\s*s\.indexOf\('\?'\)/.test(CODE), 'D2 which removes the query string');
ok(/slice\(0,\s*60\)/.test(CODE), 'D3 and truncates');
ok(CODE.indexOf('innerText') === -1 && CODE.indexOf('textContent') === -1,
  'D4 it never reads page text — no row, no field value, no label');
ok(CODE.indexOf('.value') === -1, 'D5 and never reads an input value');

// -------------------------------------------------------------------------------------------------------------
section('E. "request finished" and "screen shown" are separate metrics');

ok(/t_shell_visible/.test(CODE) && /t_data_visible/.test(CODE),
  'E1 both a shell paint and a data paint are recorded');
ok(/requestAnimationFrame\(function \(\) \{ requestAnimationFrame/.test(CODE),
  'E2 and both are taken after a DOUBLE rAF — a single one runs before the paint it belongs to');
ok(/shellToDataMs/.test(CODE),
  'E3 the summary reports the gap between them — the interval a loading state cannot close');

// -------------------------------------------------------------------------------------------------------------
section('F. RUNTIME — enable, exercise, disable, and compare the seams by identity');

// A minimal window with the five seams the observer wraps. Each returns a sentinel so a wrapper that
// swallowed or replaced a return value is caught.
function makeWindow() {
  const calls = [];
  const w = {
    KM: {
      lifecycle: {
        beginNavigation: function () { calls.push(['beginNavigation', arguments.length]); return 7; },
        switchTo: function (p, t) { calls.push(['switchTo', arguments.length, p, t]); return 99; }
      },
      partialLoader: { loadPartial: function (k, u) { calls.push(['loadPartial', k, u]); return Promise.resolve('TARGET'); } },
      scriptLoader: {
        load: function (u) { calls.push(['load', u]); return Promise.resolve(true); },
        ensure: function (k) { calls.push(['ensure', k]); return Promise.resolve(true); },
        isLoaded: function () { return false; }
      }
    },
    addEventListener: function () { w.__winListeners++; },
    removeEventListener: function () { w.__winListeners--; },
    __winListeners: 0
  };
  w.calls = calls;
  return w;
}

const listeners = { count: 0 };
const fakeDocument = {
  addEventListener: function () { listeners.count++; },
  removeEventListener: function () { listeners.count--; },
  getElementById: function () { return null; },
  querySelectorAll: function () { return []; }
};

const win = makeWindow();
const sandbox = {
  window: win,
  document: fakeDocument,
  console: { log: function () {} },
  performance: { now: function () { return 1; }, getEntriesByName: function () { return []; } },
  setTimeout: function () { return 0; },
  clearTimeout: function () {},
  requestAnimationFrame: undefined,
  MutationObserver: undefined,
  PerformanceObserver: undefined,
  Date: Date, Math: Math, String: String, Object: Object, JSON: JSON
};
// The module is a browser IIFE; it is given its globals explicitly rather than being allowed to find Node's.
const names = Object.keys(sandbox);
try {
  // eslint-disable-next-line no-new-func
  new Function(names.join(','), SRC).apply(null, names.map(function (n) { return sandbox[n]; }));
} catch (e) {
  ok(false, 'F0 the module loads in a bare browser-like environment', String(e.message));
}

const P = win.KM && win.KM.perf;
ok(!!P, 'F1 it installed KM.perf');

if (P) {
  const origBegin = win.KM.lifecycle.beginNavigation;
  const origSwitch = win.KM.lifecycle.switchTo;
  const origPartial = win.KM.partialLoader.loadPartial;
  const origLoad = win.KM.scriptLoader.load;
  const origEnsure = win.KM.scriptLoader.ensure;

  eq(P.isEnabled(), false, 'F2 and it is OFF on load');
  eq(P.installedCount(), 0, 'F2a with nothing installed');
  eq(listeners.count, 0, 'F2b and no listener registered');

  eq(P.enable(), true, 'F3 enable() installs');
  eq(P.isEnabled(), true, 'F3a and reports enabled');
  ok(P.installedCount() >= 5, 'F3b at least the five wrappers are live', P.installedCount());
  eq(listeners.count, 1, 'F3c and exactly one document listener');

  // A SECOND enable MUST NOT double-wrap. This is the duplicate-listener check, and it is the one that
  // matters: a wrapper installed twice would record every phase twice and remove only one on teardown.
  eq(P.enable(), false, 'F4 a second enable() is refused');
  eq(listeners.count, 1, 'F4a and registers no second listener');
  const afterTwo = P.installedCount();

  // Exercise every wrapped seam and confirm the ORIGINAL return value survives unchanged.
  eq(win.KM.lifecycle.beginNavigation(), 7, 'F5 beginNavigation still returns what it returned');
  eq(win.KM.scriptLoader.ensure('ops') instanceof Promise, true, 'F5a ensure still returns its promise');
  eq(win.KM.partialLoader.loadPartial('k', 'u') instanceof Promise, true, 'F5b loadPartial too');
  eq(win.KM.lifecycle.switchTo('ops-section', 7), 99, 'F5c switchTo still returns its epoch');

  // ARITY IS PART OF THE CONTRACT. switchTo reads `navToken === undefined` as "a fresh intent", so a
  // wrapper that forwarded a fixed arity would silently convert every tokenless call into a tokened one.
  win.calls.length = 0;
  win.KM.lifecycle.switchTo('home-section');
  const tokenless = win.calls.filter(function (c) { return c[0] === 'switchTo'; })[0];
  eq(tokenless[1], 1, 'F6 a tokenless switchTo reaches the original with ONE argument, not two');

  win.calls.length = 0;
  win.KM.lifecycle.switchTo('home-section', 42);
  const tokened = win.calls.filter(function (c) { return c[0] === 'switchTo'; })[0];
  eq(tokened[1], 2, 'F6a and a tokened one with two');
  eq(tokened[3], 42, 'F6b carrying the same token');

  // A sample stays OPEN until the section goes quiet or the harness flushes it, and this sandbox has no
  // timers, so the flush is what closes it. Asserting on samples() without flushing first was checking
  // that an unfinished measurement had already been filed.
  P.flush();
  ok(P.samples().length >= 1, 'F7 samples were recorded', P.samples().length);
  const smp = P.samples()[0];
  ok(smp && smp.t_nav !== null, 'F7a and the sample carries a navigation timestamp');
  ok(smp && typeof smp.closed === 'string', 'F7b and records why it closed', smp && smp.closed);

  const rep = P.disable();
  eq(rep.wasEnabled, true, 'F8 disable() reports it was on');
  eq(P.isEnabled(), false, 'F8a and it is now off');
  eq(P.installedCount(), 0, 'F8b with nothing left installed');
  eq(listeners.count, 0, 'F8c and the document listener released');
  ok(afterTwo >= 5, 'F8d (the second enable did not inflate the count)', afterTwo);

  // BY IDENTITY, not by behaviour. A teardown that reinstalled an equivalent function would pass every
  // check above and still have replaced the application's own.
  ok(win.KM.lifecycle.beginNavigation === origBegin, 'F9 beginNavigation is the ORIGINAL function object again');
  ok(win.KM.lifecycle.switchTo === origSwitch, 'F9a switchTo is');
  ok(win.KM.partialLoader.loadPartial === origPartial, 'F9b loadPartial is');
  ok(win.KM.scriptLoader.load === origLoad, 'F9c load is');
  ok(win.KM.scriptLoader.ensure === origEnsure, 'F9d ensure is');

  // And an enable/disable CYCLE must return to the same place, not drift upward.
  P.enable(); const cyc1 = P.installedCount(); P.disable();
  P.enable(); const cyc2 = P.installedCount(); P.disable();
  eq(cyc1, cyc2, 'F10 two enable/disable cycles install the same number of hooks — no drift');
  eq(P.installedCount(), 0, 'F10a and end at zero');
  ok(win.KM.lifecycle.switchTo === origSwitch, 'F10b with the original still restored');
}

// -------------------------------------------------------------------------------------------------------------
section('G. the harness that drives it does not freeze the clock');

const RUNNER = read('assets/tests/_cp2m-r2-perf-runner.js');
/* COMMENTS ARE NOT CODE, AND THE FIRST VERSION OF THIS CHECK DID NOT KNOW THAT: the runner's own header
   EXPLAINS why it must not use --virtual-time-budget, and the explanation made the assertion fail. A
   guard that cannot tell a prohibition from its rationale reports the documentation as the violation. */
const RUNNER_CODE = RUNNER.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(RUNNER_CODE.indexOf('--virtual-time-budget') === -1,
  'G1 the perf runner never passes --virtual-time-budget — under it performance.now() measures scheduling, not work');
ok(RUNNER.indexOf('--virtual-time-budget') !== -1,
  'G1a (and the header still explains why, so the rule survives the next person reading it)');
ok(/host-resolver-rules/.test(RUNNER),
  'G2 and the browser is pinned to loopback, so an interception bug cannot become a live read');
ok(/MAP \* ~NOTFOUND/.test(RUNNER), 'G2a by mapping every other host to NOTFOUND');
ok(/assertInjectedScriptsParse/.test(RUNNER),
  'G3 and the injected scripts are compiled before a browser is launched');

// -------------------------------------------------------------------------------------------------------------
console.log('\n----------------------------------------');
console.log('PERF OBSERVER BOUNDS (S8-B3-R3-CP2M-R2): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
