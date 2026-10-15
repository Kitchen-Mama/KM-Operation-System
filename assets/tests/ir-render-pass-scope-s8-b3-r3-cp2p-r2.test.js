// S8-B3-R3-CP2P-R2 §A/§B — A MICROTASK IS NOT THE END OF THE SYNCHRONOUS SCOPE.
//
// THE DEFECT THIS CLOSES, WHICH WAS MINE. CP2P-R1 shared one row assembly between the callers running in
// one synchronous render, and released it with `Promise.resolve().then(release)`. I argued that a microtask
// runs after the current task and before any later one, so nothing outside the render could reach it.
//
// THAT IS FALSE WHENEVER A MICROTASK WAS ALREADY QUEUED. The release is appended to the BACK of the
// microtask queue at the moment the result is stored. Any continuation queued BEFORE that point runs
// FIRST, while the result is still live, and a `.then` callback from an earlier await is exactly such a
// continuation. The share therefore leaked into async work that had nothing to do with the render:
//
//     somePromise.then(cb)          <- cb queued as microtask #1
//     getReplenishmentData()        <- stores, queues release as microtask #2
//     ... synchronous task ends ...
//     cb runs                       <- READS THE SHARE. It is #1; the release is #2.
//     release runs
//
// `_irRowsPass` was also the ONLY guard, so a hit required nothing but a matching dependency snapshot —
// and a dependency snapshot compares the exposure entry and the read model BY IDENTITY, which says nothing
// about whether their CONTENTS changed in between.
//
// WHAT REPLACES IT. An explicit synchronous render scope: a depth counter opened by the render entry points
// and closed in a `finally`, so it survives a throw, nests correctly, and ends when the render ends rather
// than when a queue happens to drain. OUTSIDE a scope there is no store and no hit — the share cannot
// exist, so no residue can be read.
//
// Run: node assets/tests/ir-render-pass-scope-s8-b3-r3-cp2p-r2.test.js

'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var pass = 0, fail = 0;
var LF = String.fromCharCode(10);
function ok(c, l, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + l + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.log('FAIL ' + l + '  (got ' + A + ', expected ' + E + ')'); } }
function section(t) { console.log(LF + '== ' + t + ' =='); }

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}

var PAGE = read('assets/js/pages/inventory-replenishment.js');

// --------------------------------------------------------------------------------------------------------
// THE SANDBOX. The real helpers and the real `getReplenishmentData` are executed; only the assembly is
// replaced, by a counter, because what is under test is how often the shipped code asks for one and who is
// allowed to receive a previous answer.
// --------------------------------------------------------------------------------------------------------
function build() {
  var sb = {
    console: console, Promise: Promise, String: String, Boolean: Boolean, setTimeout: setTimeout,
    assemblies: 0,
    scope: { country: 'US', marketplaceId: 'MKT-A', ltsFilter: '' },
    searchSeq: 1,
    workspaceOn: true,
    readModelRef: { id: 'model-1' },
    exposureEntryRef: { id: 'entry-1', state: 'READY' },
    exposureStateVal: 'READY'
  };
  sb.window = sb;
  sb._irRenderScope_ = function () { return sb.scope; };
  sb._irSearch = { get seq() { return sb.searchSeq; } };
  sb._irEffectiveWorkspace = function () { return sb.workspaceOn; };
  sb._irExposureActiveEntry_ = function () { return sb.exposureEntryRef; };
  sb._irExposureStateForRender_ = function () { return sb.exposureStateVal; };
  sb._getCloudReplenishmentData = function () { sb.assemblies++; return [{ sku: 'S1', build: sb.assemblies }]; };
  sb._getDemoReplenishmentData = function () { return [{ sku: 'DEMO' }]; };
  Object.defineProperty(sb, '_irReadModel', { get: function () { return sb.readModelRef; }, configurable: true });

  var ctx = vm.createContext(sb);
  var names = ['_irRowsPassDeps_', '_irRowsPassSame_', '_irRowsPassRelease_', 'getReplenishmentData'];
  // The scope helpers exist only after the R2 correction; the suite must fail loudly, not silently, before it.
  ['_irRenderPassBegin_', '_irRenderPassEnd_', '_irWithRenderPass_'].forEach(function (n) {
    if (PAGE.indexOf('function ' + n + '(') >= 0) names.push(n);
  });
  if (PAGE.indexOf('function _irRowsPassArm_(') >= 0) names.push('_irRowsPassArm_');
  names.forEach(function (n) { vm.runInContext(extractFn(PAGE, n), ctx); });
  vm.runInContext('var _irRowsPass = null; var _irRowsPassDepth = 0;', ctx);
  sb.__ctx = ctx;
  return sb;
}
function call(sb) { return vm.runInContext('getReplenishmentData()', sb.__ctx); }
// A render scope, driven the way the page drives it. Before the correction there is nothing to drive, and
// the calls simply run — which is what makes the lifetime tests below fail rather than error.
function inScope(sb, fn) {
  var has = PAGE.indexOf('function _irWithRenderPass_(') >= 0;
  if (!has) return fn();
  sb.__fn = fn;
  return vm.runInContext('_irWithRenderPass_(function(){ return __fn(); })', sb.__ctx);
}

var checks = [];

// ==============================================================================================================
section('A. THE LEAK: a continuation queued BEFORE the render must not inherit its rows');
// ==============================================================================================================
checks.push(function () {
  var sb = build();
  var seen = null;
  // #1 — queued BEFORE anything is stored. This is an ordinary awaited continuation.
  var p = Promise.resolve().then(function () { call(sb); seen = sb.assemblies; });
  // The synchronous render then runs and stores its result (and, before the correction, queues the release
  // behind the callback above).
  inScope(sb, function () { call(sb); call(sb); });
  return p.then(function () {
    eq(seen, 2, 'A1 a callback queued BEFORE the render assembles for ITSELF — it does not inherit the render\'s rows');
  });
});
checks.push(function () {
  var sb = build();
  var seen = [];
  var ps = [1, 2, 3].map(function () { return Promise.resolve().then(function () { call(sb); seen.push(sb.assemblies); }); });
  inScope(sb, function () { call(sb); });
  return Promise.all(ps).then(function () {
    eq(seen, [2, 3, 4], 'A2 and so does each of several already-queued callbacks — none of them shares with the render or with each other');
  });
});
checks.push(function () {
  var sb = build();
  var after = null;
  inScope(sb, function () { call(sb); });
  // Queued AFTER the render, which is the case CP2P-R1 did test and did pass.
  return Promise.resolve().then(function () { call(sb); after = sb.assemblies; }).then(function () {
    eq(after, 2, 'A3 a callback queued AFTER the render also assembles for itself');
  });
});

// ==============================================================================================================
section('B. THE SCOPE: nesting, throwing, and what happens outside it');
// ==============================================================================================================
checks.push(function () {
  var sb = build();
  inScope(sb, function () {
    call(sb);
    inScope(sb, function () { call(sb); });   // nested synchronous render
    call(sb);                                  // still inside the OUTER scope
  });
  eq(sb.assemblies, 1, 'B1 a nested synchronous render shares with its parent — one assembly, not three');
  // And the outer scope ending really does end it.
  call(sb);
  eq(sb.assemblies, 2, 'B1a while the first call after the outer scope closes assembles again');
  return Promise.resolve();
});
checks.push(function () {
  var sb = build();
  var threw = false;
  try {
    inScope(sb, function () { call(sb); throw new Error('render blew up'); });
  } catch (e) { threw = true; }
  ok(threw, 'B2 a throw inside the scope propagates — the scope does not swallow it');
  call(sb);
  eq(sb.assemblies, 2, 'B2a and the scope was released anyway, so the next read does NOT hit the residue');
  return Promise.resolve();
});
checks.push(function () {
  var sb = build();
  call(sb); call(sb);
  eq(sb.assemblies, 2, 'B3 two reads OUTSIDE any render scope never share — there is nothing to hit');
  return Promise.resolve();
});

// ==============================================================================================================
section('C. DEPENDENCIES STILL REBUILD INSIDE ONE SCOPE');
// ==============================================================================================================
function depCase(label, mutate) {
  var sb = build();
  inScope(sb, function () {
    call(sb);
    mutate(sb);
    call(sb);
  });
  eq(sb.assemblies, 2, label);
}
checks.push(function () {
  depCase('C1 a different marketplace rebuilds', function (sb) { sb.scope = { country: 'US', marketplaceId: 'MKT-B', ltsFilter: '' }; });
  depCase('C2 a different country rebuilds', function (sb) { sb.scope = { country: 'CA', marketplaceId: 'MKT-A', ltsFilter: '' }; });
  depCase('C3 the live LTS filter rebuilds', function (sb) { sb.scope = { country: 'US', marketplaceId: 'MKT-A', ltsFilter: 'over90' }; });
  depCase('C4 a new Search generation rebuilds', function (sb) { sb.searchSeq = 2; });
  depCase('C5 a NEW workspace model rebuilds', function (sb) { sb.readModelRef = { id: 'model-2' }; });
  depCase('C6 a NEW exposure entry rebuilds', function (sb) { sb.exposureEntryRef = { id: 'entry-2', state: 'READY' }; });
  depCase('C7 exposure readiness changing rebuilds', function (sb) { sb.exposureStateVal = 'NOT_LOADED'; });
  depCase('C8 leaving workspace mode rebuilds', function (sb) { sb.workspaceOn = false; });
  depCase('C9 an equal-looking NEW model object rebuilds — identity, not deep equality', function (sb) { sb.readModelRef = { id: 'model-1' }; });
  return Promise.resolve();
});

// ==============================================================================================================
section('D. IDENTITY IS NOT A CONTENT GUARANTEE — and the scope is what keeps that from mattering');
// ==============================================================================================================
// The dependency snapshot compares the exposure entry and the read model BY IDENTITY. An entry MUTATED in
// place is the same object with different contents, so identity alone cannot prove the rows are still
// right. Inside one synchronous render nothing can mutate them, which is the ONLY reason identity is
// sufficient here - and that reason exists only because the scope really is synchronous.
checks.push(function () {
  var sb = build();
  inScope(sb, function () {
    call(sb);
    sb.exposureEntryRef.state = 'MUTATED';    // same object, different contents
    call(sb);
  });
  eq(sb.assemblies, 1,
    'D1 an in-place mutation of the SAME entry is NOT detected by identity — recorded, because it is why the scope must be synchronous');
  // Outside a scope, the same mutation cannot be papered over, because nothing is shared at all.
  var sb2 = build();
  call(sb2);
  sb2.exposureEntryRef.state = 'MUTATED';
  call(sb2);
  eq(sb2.assemblies, 2, 'D1a outside a scope that mutation always gets a fresh assembly');
  return Promise.resolve();
});

// ==============================================================================================================
section('E. THE SHAPE OF THE CORRECTION, in the shipped source');
// ==============================================================================================================
checks.push(function () {
  ok(PAGE.indexOf('function _irWithRenderPass_(') >= 0,
    'E1 there is an explicit synchronous render scope');
  var W = PAGE.indexOf('function _irWithRenderPass_(') >= 0 ? code(extractFn(PAGE, '_irWithRenderPass_')) : '';
  ok(/try\s*\{/.test(W) && /finally\s*\{/.test(W),
    'E2 it is closed in a finally, so a throw cannot leave it open');
  var G = code(extractFn(PAGE, 'getReplenishmentData'));
  ok(/_irRowsPassDepth/.test(G),
    'E3 and the share is consulted only while a scope is open');
  ok(!/Promise\.resolve\(\)\.then\(_irRowsPassRelease_\)/.test(code(PAGE)),
    'E4 the microtask release is GONE — it was never the end of the synchronous scope');
  ok(PAGE.indexOf('function _irRowsPassArm_(') < 0,
    'E4a and so is the function that armed it');
  // The scope is opened by the renders, not by the data function, so the data function cannot extend it.
  ok(/_irWithRenderPass_/.test(code(extractFn(PAGE, 'toggleReplenRow'))),
    'E5 the expand handler opens a scope');
  ok(!/_irWithRenderPass_/.test(G),
    'E5a while getReplenishmentData opens none — it is a participant, not the owner');
  return Promise.resolve();
});

// ==============================================================================================================
section('G. THE MEASUREMENT \u2014 three arms, interleaved triples, and the number CP2P-R1 overstated');
// ==============================================================================================================
// Six triples, each arm run back to back within its triple: the page with NO share, the page with the
// LEAKY microtask release, and the page with the explicit scope. Three arms because two questions had to be
// answered at once: does the correct version still help, and what was the leak worth?
var EV = 'docs/evidence/cp2p-r2-scope';
function ev(n) { return JSON.parse(read(EV + '/' + n)); }
var UNSHARED = [], SCOPED = [], LEAKY = [];
for (var k = 1; k <= 6; k++) {
  UNSHARED.push(ev('unshared-' + k + '.json'));
  SCOPED.push(ev('scoped-' + k + '.json'));
  LEAKY.push(ev('leaky-microtask-' + k + '.json'));
}
function expands(r) { return (r.measurement.expands || []).filter(function (e) { return e.tag !== 'collapse'; }); }
function rmed(r, f) { var a = expands(r).map(f).sort(function (x, y) { return x - y; }); var n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; }
function med2(a) { var b = a.slice().sort(function (x, y) { return x - y; }); var n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; }
function pairs(A, B, f) {
  var out = []; for (var i = 0; i < 6; i++) out.push(rmed(B[i], f) - rmed(A[i], f)); return out;
}
var crypto2 = require('crypto');
function shaOf(rel) { return crypto2.createHash('sha256').update(read(rel).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16); }

checks.push(function () {
  // The SCOPED captures must describe the page on disk; the other two arms must not.
  Object.keys(SCOPED[0].sources).forEach(function (rel) {
    eq(shaOf(rel), SCOPED[0].sources[rel], 'G1 ' + rel.split('/').pop() + ' is unchanged since the scoped capture');
  });
  ok(UNSHARED[0].sources['assets/js/pages/inventory-replenishment.js'] !== shaOf('assets/js/pages/inventory-replenishment.js'),
    'G1a the unshared arm ran against a different page');
  ok(LEAKY[0].sources['assets/js/pages/inventory-replenishment.js'] !== shaOf('assets/js/pages/inventory-replenishment.js'),
    'G1b and so did the leaky arm \u2014 that implementation is gone');

  var paintD = pairs(UNSHARED, SCOPED, function (e) { return e.ms_click_to_paint; });
  var execD = pairs(UNSHARED, SCOPED, function (e) { return e.ms_click_to_exec_resolved; });
  eq(paintD.filter(function (x) { return x < 0; }).length, 6,
    'G2 against NO share, the scope improves first paint in six of six');
  eq(execD.filter(function (x) { return x < 0; }).length, 6,
    'G3 and improves the full ready time in six of six');
  ok(med2(execD) < -15, 'G3a by a median of tens of milliseconds', { medianMs: med2(execD) });

  // THE CORRECTION TO THE PREVIOUS ROUND'S HEADLINE, asserted rather than written in prose only.
  var leakD = pairs(LEAKY, SCOPED, function (e) { return e.ms_click_to_exec_resolved; });
  eq(leakD.filter(function (x) { return x > 0; }).length, 6,
    'G4 the CORRECT scope is SLOWER than the leaky one in six of six \u2014 most of the R1 headline was the leak');
  ok(med2(leakD) > 50,
    'G4a by a median far larger than the gain the scope itself delivers', { medianMs: med2(leakD) });
  ok(Math.abs(med2(leakD)) > Math.abs(med2(execD)),
    'G4b which is the whole point: a number that depended on the defect is not a number this round may keep');

  // WHERE the legitimate gain is: inside the synchronous handler, which is the only place a scope can share.
  var dinD = pairs(UNSHARED, SCOPED, function (e) { return e.ms_data_in_handler; });
  eq(dinD.filter(function (x) { return x < 0; }).length, 6,
    'G5 the assembly cost INSIDE the handler falls in six of six \u2014 that is what one synchronous scope can share');
  var daftD = pairs(UNSHARED, SCOPED, function (e) { return e.ms_data_after_handler; });
  ok(med2(daftD) > -40,
    'G5a while the cost AFTER the handler is essentially unchanged, because each later continuation is its '
    + 'OWN scope and no scope was widened to pretend otherwise', { medianMs: med2(daftD) });

  // The guards, on the scoped build, in every run.
  ok(SCOPED.every(function (r) { return r.measurement.abPanels === 1; }), 'G6 A then B leaves exactly one panel');
  ok(SCOPED.every(function (r) { return r.measurement.afterSwitch.panelsOpen === 0; }), 'G6a a station switch leaves none open');
  ok(SCOPED.every(function (r) { return r.measurement.afterSwitch.rows === 25; }), 'G6b and really switches station');
  ok(SCOPED.every(function (r) { return r.measurement.afterLeave.panels === 0; }), 'G6c leaving the page leaves none');
  ok(SCOPED.every(function (r) { return !r.measurement.fatal; }), 'G6d nothing threw');
  ok(SCOPED.every(function (r) { return r.measurement.dialogs.length === 0; }), 'G6e no dialog was raised');
  ok(SCOPED.every(function (r) { return r.measurement.rowCount === 100; }), 'G6f every run rendered the 100-SKU station');
  return Promise.resolve();
});

// ==============================================================================================================
section('F. WHAT THIS DOES NOT CLAIM');
// ==============================================================================================================
checks.push(function () {
  ok(true, 'F1 the scope bounds a SYNCHRONOUS render; it says nothing about work that resumes later, which '
    + 'gets its own scope or none at all');
  ok(true, 'F2 and nothing here measures production: the latency figures are a 100-SKU fixture on one machine');
  ok(true, 'F3 the CP2P-R1 report claimed -113 ms on the full ready time. The correctly scoped version '
    + 'delivers about a third of that; the rest was the leak, and section G asserts the difference');
  return Promise.resolve();
});

(function run(i) {
  if (i < checks.length) { Promise.resolve(checks[i]()).then(function () { run(i + 1); }); return; }
  console.log(LF + '----------------------------------------');
  console.log('IR RENDER-PASS SCOPE (S8-B3-R3-CP2P-R2): ' + pass + ' passed, ' + fail + ' failed');
  console.log('----------------------------------------');
  if (fail > 0) process.exitCode = 1;
}(0));
