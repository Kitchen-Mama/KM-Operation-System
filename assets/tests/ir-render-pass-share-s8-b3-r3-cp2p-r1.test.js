// S8-B3-R3-CP2P-R1 §A — ONE SYNCHRONOUS RENDER SHARES ONE ASSEMBLY, AND NOTHING OUTLIVES IT.
//
// WHAT CP2P MEASURED AND DID NOT FIX. `_getCloudReplenishmentData` re-assembles EVERY row of the station
// from twelve source tables, and one expand asks for it about nine times. CP2P proved that, tried to hide
// the cost behind a deferred paint, measured the result properly, found it bought the first paint with a
// LATER finish in ten of ten pairs, and withdrew it. The cost itself was left for the Owner to rule on.
//
// WHAT THIS ROUND DOES, UNDER THAT RULING. The callers that run in ONE SYNCHRONOUS TASK share one result.
// The share is released by a microtask, so it is gone before any later task, timer or promise continuation
// can reach it; and a dependency that moved — scope, LTS, Search generation, workspace model identity,
// exposure entry identity, exposure readiness — forces a rebuild even inside the same task.
//
// MEASURED, EIGHT INTERLEAVED PAIRS, each pair back to back (docs/evidence/cp2p-r1-share/):
//
//                                   baseline      shared      paired delta
//   click -> first paint             73.8 ms      56.3 ms     -20.1 ms, better in 8 of 8
//   click -> Execution resolved     239.8 ms     123.0 ms     -113  ms, better in 8 of 8
//   synchronous handler              48.0 ms      30.1 ms
//   assembly cost inside handler     45.5 ms      28.4 ms
//   assembly cost after handler     172.9 ms      77.8 ms
//
// THE TIMING BOUNDARIES ARE CORRECTED. CP2P reported a "build rest" figure computed as the synchronous
// handler duration MINUS every assembly seen anywhere in the window, including assemblies that ran later
// from async continuations. It mixed two clocks and went negative. The handler and the follow-on work are
// now attributed by timestamp and reported separately; neither is ever subtracted from the other.
//
// THE CALL COUNT IS NOT THE METRIC, AND THE BASELINE ASSERTIONS SAY SO. The callers still call; what
// changed is what a repeat COSTS. Every assertion about the historical nine-per-expand redundancy reads the
// BASELINE evidence and is labelled BASELINE — none of them requires the shipped page to keep rebuilding.
//
// Run: node assets/tests/ir-render-pass-share-s8-b3-r3-cp2p-r1.test.js

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var crypto = require('crypto');

var pass = 0, fail = 0;
function ok(c, l, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + l + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.log('FAIL ' + l + '  (got ' + A + ', expected ' + E + ')'); } }
var LF = String.fromCharCode(10);
function section(t) { console.log('\n== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function sha(rel) { return crypto.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function med(a) { var b = a.slice().sort(function (x, y) { return x - y; }); var n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; }

var PAGE = read('assets/js/pages/inventory-replenishment.js');

// ==============================================================================================================
section('A. THE SHARE RUNS — the REAL functions, in a sandbox, not a paraphrase of them');
// ==============================================================================================================
//
// The four helpers and `getReplenishmentData` itself are lifted from the shipped file and executed. The
// assembly is replaced by a COUNTER, because what is under test is how often the real code asks for one.
var sandbox = {
  console: console, Promise: Promise, String: String, Boolean: Boolean,
  assemblies: 0,
  scope: { country: 'US', marketplaceId: 'MKT-A', ltsFilter: '' },
  searchSeq: 1,
  workspaceOn: true,
  readModelRef: { id: 'model-1' },
  exposureEntryRef: { id: 'entry-1' },
  exposureStateVal: 'READY',
  demoOn: false
};
sandbox.window = sandbox;
sandbox._irRenderScope_ = function () { return sandbox.scope; };
sandbox._irSearch = { get seq() { return sandbox.searchSeq; } };
sandbox._irEffectiveWorkspace = function () { return sandbox.workspaceOn; };
sandbox._irExposureActiveEntry_ = function () { return sandbox.exposureEntryRef; };
sandbox._irExposureStateForRender_ = function () { return sandbox.exposureStateVal; };
sandbox._getCloudReplenishmentData = function () { sandbox.assemblies++; return [{ sku: 'S1', n: sandbox.assemblies }]; };
sandbox._getDemoReplenishmentData = function () { return [{ sku: 'DEMO' }]; };
Object.defineProperty(sandbox, '_irReadModel', { get: function () { return sandbox.readModelRef; }, configurable: true });

var ctx = vm.createContext(sandbox);
// S8-B3-R3-CP2P-R2 - `_irRowsPassArm_` is GONE. It armed a microtask release, and a microtask queued at
// store time is not the end of the synchronous scope: a continuation queued EARLIER runs first and could
// read the share. The lifetime is now an explicit scope, and its acceptance lives in
// assets/tests/ir-render-pass-scope-s8-b3-r3-cp2p-r2.test.js. This suite drives that scope so its sharing
// and dependency assertions keep testing what they were written to test.
['_irRowsPassDeps_', '_irRowsPassSame_', '_irRowsPassRelease_',
 '_irRenderPassBegin_', '_irRenderPassEnd_', '_irWithRenderPass_', 'getReplenishmentData']
  .forEach(function (fn) { vm.runInContext(extractFn(PAGE, fn), ctx); });
vm.runInContext('var _irRowsPass = null; var _irRowsPassDepth = 0;', ctx);

// Every call in this suite runs inside ONE render scope unless a test says otherwise.
function call() { return vm.runInContext('_irWithRenderPass_(function(){ return getReplenishmentData(); })', ctx); }
function callsInOneScope(n) {
  sandbox.__n = n;
  return vm.runInContext('_irWithRenderPass_(function(){ var last; for (var i = 0; i < __n; i++) last = getReplenishmentData(); return last; })', ctx);
}
function reset() { sandbox.assemblies = 0; vm.runInContext('_irRowsPass = null; _irRowsPassDepth = 0;', ctx); }
function tick() { return new Promise(function (r) { Promise.resolve().then(function () { Promise.resolve().then(r); }); }); }

reset();
callsInOneScope(3);
eq(sandbox.assemblies, 1, 'A1 three calls in ONE synchronous render scope assemble ONCE');
sandbox.__pair = null;
var same = vm.runInContext(
  '_irWithRenderPass_(function(){ var a = getReplenishmentData(); var b = getReplenishmentData(); return a === b; })', ctx);
ok(same === true, 'A1a and every caller receives the SAME array, not a copy');

// ==============================================================================================================
section('B. AND NOTHING OUTLIVES THAT TASK');
// ==============================================================================================================
var asyncChecks = [];
asyncChecks.push(function () {
  reset(); call();
  return tick().then(function () {
    call();
    eq(sandbox.assemblies, 2, 'B1 a call in a later microtask re-assembles - it is a different scope');
  });
});
asyncChecks.push(function () {
  reset(); call();
  return new Promise(function (res) { setTimeout(res, 0); }).then(function () {
    call();
    eq(sandbox.assemblies, 2, 'B2 and so does a call in a later task');
  });
});

// ==============================================================================================================
section('C. A DEPENDENCY THAT MOVED FORCES A REBUILD — even inside one task');
// ==============================================================================================================
function depCase(label, mutate) {
  reset();
  sandbox.__mutate = mutate;
  vm.runInContext('_irWithRenderPass_(function(){ getReplenishmentData(); __mutate(); getReplenishmentData(); })', ctx);
  eq(sandbox.assemblies, 2, label);
}
depCase('C1 a different marketplace is a different station', function () { sandbox.scope = { country: 'US', marketplaceId: 'MKT-B', ltsFilter: '' }; });
sandbox.scope = { country: 'US', marketplaceId: 'MKT-A', ltsFilter: '' };
depCase('C2 a different country too', function () { sandbox.scope = { country: 'CA', marketplaceId: 'MKT-A', ltsFilter: '' }; });
sandbox.scope = { country: 'US', marketplaceId: 'MKT-A', ltsFilter: '' };
depCase('C3 the LTS filter is read live, so changing it rebuilds', function () { sandbox.scope = { country: 'US', marketplaceId: 'MKT-A', ltsFilter: 'over90' }; });
sandbox.scope = { country: 'US', marketplaceId: 'MKT-A', ltsFilter: '' };
depCase('C4 a new Search generation rebuilds', function () { sandbox.searchSeq = 2; });
depCase('C5 a NEW workspace model rebuilds — identity, not contents', function () { sandbox.readModelRef = { id: 'model-2' }; });
depCase('C6 a NEW exposure entry rebuilds', function () { sandbox.exposureEntryRef = { id: 'entry-2' }; });
depCase('C7 the second layer becoming READY rebuilds', function () { sandbox.exposureStateVal = 'NOT_LOADED'; });
sandbox.exposureStateVal = 'READY';
depCase('C8 leaving workspace mode rebuilds', function () { sandbox.workspaceOn = false; });
sandbox.workspaceOn = true;

// A model object that is merely EQUAL is still a different source.
reset();
sandbox.__mutate = function () { sandbox.readModelRef = { id: 'model-1' }; };   // same contents, new object
vm.runInContext('_irWithRenderPass_(function(){ getReplenishmentData(); __mutate(); getReplenishmentData(); })', ctx);
eq(sandbox.assemblies, 2, 'C9 an equal-looking model object is a DIFFERENT source - identity decides, not deep equality');

// ==============================================================================================================
section('D. THE SHAPE OF THE SHARE, in the shipped source');
// ==============================================================================================================
// S8-B3-R3-CP2P-R2 - SUPERSEDED. D1 and D2 asserted a microtask release and were removed when that
// release was found not to bound the synchronous scope at all. The lifetime is now an explicit scope and
// its acceptance is in ir-render-pass-scope-s8-b3-r3-cp2p-r2.test.js, which reproduces the leak first.
var WRAP = code(extractFn(PAGE, '_irWithRenderPass_'));
ok(/finally/.test(WRAP),
  'D1 the scope is closed in a finally, so a render that throws still releases');
ok(!/Promise\.resolve\(\)\.then\(_irRowsPassRelease_\)/.test(code(PAGE)),
  'D2 and the microtask release is gone from the page entirely');
var DEPS = code(extractFn(PAGE, '_irRowsPassDeps_'));
['marketplaceId', 'country', 'lts', 'searchGen', 'readModel', 'exposureEntry', 'exposureState', 'workspace']
  .forEach(function (k) { ok(new RegExp(k).test(DEPS), 'D3 the dependency set names ' + k); });
var SAME = code(extractFn(PAGE, '_irRowsPassSame_'));
ok(/a\.readModel === b\.readModel/.test(SAME) && /a\.exposureEntry === b\.exposureEntry/.test(SAME),
  'D4 and compares the two source objects by IDENTITY');
// It is not a station cache, and there is no second place that could become one.
ok((PAGE.match(/_irRowsPass =/g) || []).length <= 4,
  'D5 the share has one storage location and one release path');
ok(!/localStorage|sessionStorage|setInterval/.test(code(extractFn(PAGE, 'getReplenishmentData'))),
  'D6 nothing is persisted and nothing is polled');

// The assembly itself, the Loader and the write paths are untouched by this round.
ok(/_getCloudReplenishmentData\(\)/.test(code(extractFn(PAGE, 'getReplenishmentData'))),
  'D7 the real assembly is still the only producer of rows');

// ==============================================================================================================
section('E. THE MEASUREMENT — interleaved pairs, corrected boundaries');
// ==============================================================================================================
var EVDIR = 'docs/evidence/cp2p-r1-share';
function ev(n) { return JSON.parse(read(EVDIR + '/' + n)); }
var BASE = [], SHARE = [];
for (var i = 1; i <= 8; i++) { BASE.push(ev('baseline-' + i + '.json')); SHARE.push(ev('shared-' + i + '.json')); }
function expands(r) { return (r.measurement.expands || []).filter(function (e) { return e.tag !== 'collapse'; }); }
function runMed(r, f) { return med(expands(r).map(f)); }

// S8-B3-R3-CP2P-R2 - THESE ARE NOW HISTORICAL. They were captured against the MICROTASK implementation,
// which no longer exists, so requiring them to match disk would require that implementation back. What must
// still hold is that each capture RECORDS what it ran against, and that the page it ran against is not the
// page on disk. The current measurement is in docs/evidence/cp2p-r2-scope/.
Object.keys(SHARE[0].sources).forEach(function (rel) {
  ok(/^[0-9a-f]{16}$/.test(String(SHARE[0].sources[rel])),
    'E1 HISTORICAL: the R1 capture records the ' + rel.split('/').pop() + ' it ran against', SHARE[0].sources[rel]);
});
ok(SHARE[0].sources['assets/js/pages/inventory-replenishment.js'] !== sha('assets/js/pages/inventory-replenishment.js'),
  'E1b HISTORICAL: and that page is not the one on disk - CP2P-R2 replaced its lifetime');
ok(BASE[0].sources['assets/js/pages/inventory-replenishment.js']
   !== SHARE[0].sources['assets/js/pages/inventory-replenishment.js'],
  'E1a and the two sides were captured against DIFFERENT page source');

var pairs = [];
for (var p = 0; p < 8; p++) {
  pairs.push({
    dPaint: runMed(SHARE[p], function (e) { return e.ms_click_to_paint; })
          - runMed(BASE[p], function (e) { return e.ms_click_to_paint; }),
    dExec: runMed(SHARE[p], function (e) { return e.ms_click_to_exec_resolved; })
         - runMed(BASE[p], function (e) { return e.ms_click_to_exec_resolved; })
  });
}
eq(pairs.length, 8, 'E2 eight interleaved pairs, each its own control');
eq(pairs.filter(function (x) { return x.dExec < 0; }).length, 8,
  'E3 total time to a resolved Execution panel improved in EIGHT of eight');
eq(pairs.filter(function (x) { return x.dPaint < 0; }).length, 8,
  'E4 and the first paint improved in eight of eight — neither was traded for the other');
ok(med(pairs.map(function (x) { return x.dExec; })) < -50,
  'E4a by a median of tens of milliseconds', { medianDeltaMs: med(pairs.map(function (x) { return x.dExec; })) });

// THE BOUNDARIES ARE SEPARATE, AND THE PROOF IS THAT NEITHER IS A SUBTRACTION OF THE OTHER.
ok(expands(SHARE[0]).every(function (e) {
  return typeof e.ms_handler_sync === 'number' && typeof e.ms_data_in_handler === 'number'
      && typeof e.ms_data_after_handler === 'number';
}), 'E5 the synchronous handler, the work inside it and the follow-on work are reported separately');
ok(expands(SHARE[0]).every(function (e) { return e.ms_data_in_handler <= e.ms_handler_sync + 1; }),
  'E5a the assemblies attributed to the handler fit INSIDE it — which a cross-async total never could');
ok(expands(BASE[0]).concat(expands(SHARE[0])).every(function (e) { return e.ms_handler_sync >= 0; }),
  'E5b and no phase figure is negative, which is how the old subtraction announced itself');

// ==============================================================================================================
section('F. THE GUARDS STILL HOLD — exercised in the browser, on the shared build');
// ==============================================================================================================
ok(SHARE.every(function (r) { return r.measurement.abPanels === 1; }),
  'F1 expanding B while A is open leaves exactly ONE panel, in every run');
ok(SHARE.every(function (r) { return r.measurement.afterSwitch && r.measurement.afterSwitch.panelsOpen === 0; }),
  'F2 switching station leaves no panel open');
ok(SHARE.every(function (r) { return r.measurement.afterSwitch.rows === 25; }),
  'F2a and really switches — the other station has a different row count');
ok(SHARE.every(function (r) { return r.measurement.afterLeave.panels === 0; }),
  'F3 leaving the page leaves no panel');
ok(SHARE.every(function (r) { return !r.measurement.fatal; }), 'F4 and nothing threw in any run');
ok(SHARE.every(function (r) { return r.measurement.dialogs.length === 0; }), 'F4a and no dialog was raised');
ok(SHARE.every(function (r) { return r.measurement.rowCount === 100; }), 'F5 every run rendered the 100-SKU station');

// ==============================================================================================================
section('G. BASELINE — the historical redundancy, which the shipped page is NOT required to keep');
// ==============================================================================================================
// These read the CP2P baseline captures. They record what was measured BEFORE the share, and none of them
// asserts anything about the current page: requiring the redundancy to persist would be a gate defending
// the defect it was written to document.
var CP2P = 'docs/evidence/cp2p-ir-expand';
var B0 = JSON.parse(read(CP2P + '/shipped-1.json'));
ok((B0.measurement.getCalls || []).length >= 50,
  'G1 BASELINE: a capture of five expands made fifty-plus assemblies before this round',
  { calls: (B0.measurement.getCalls || []).length });
var b0mean = B0.measurement.getCalls.reduce(function (s, c) { return s + c.ms; }, 0) / B0.measurement.getCalls.length;
ok(b0mean > 10, 'G1a BASELINE: each cost real time', { meanMs: b0mean });
ok(B0.sources['assets/js/pages/inventory-replenishment.js'] !== sha('assets/js/pages/inventory-replenishment.js'),
  'G2 and that capture describes the PRE-share page, which this assertion does not ask anyone to restore');

/* THE SUMMARY IS PRINTED LAST, AFTER THE LIFETIME CHECKS HAVE ACTUALLY RUN.
   An earlier draft printed it first and ran the two async checks afterwards, so a failure in either would
   have been reported BELOW a summary that already said zero failed - and the sweep reads the summary from
   the terminal region. A suite that can announce success before its last assertion has run is the
   exit-code-blind defect this repository has been bitten by before. */
(function runAsync(idx) {
  if (idx < asyncChecks.length) { asyncChecks[idx]().then(function () { runAsync(idx + 1); }); return; }
  console.log(LF + '(lifetime checks: ' + asyncChecks.length + ' run)');
  console.log(LF + '----------------------------------------');
  console.log('IR RENDER-PASS SHARE (S8-B3-R3-CP2P-R1): ' + pass + ' passed, ' + fail + ' failed');
  console.log('----------------------------------------');
  if (fail > 0) process.exitCode = 1;
}(0));
