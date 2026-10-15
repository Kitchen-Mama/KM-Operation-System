// Kitchen Mama Operation System - S8-B3-R3-CP2R
// ONE REVEAL CALLBACK, ONE ASSEMBLY - AND NOTHING THAT OUTLIVES THE CALLBACK
//
// Run: node assets/tests/ir-reveal-callback-scope-s8-b3-r3-cp2r.test.js
//
// LOCAL / OFFLINE. No network, no DB, no writes.
//
// WHAT WAS MEASURED BEFORE ANYTHING WAS SCOPED. With the handler already scoped by CP2P-R2, a 100-SKU
// expand still ran SEVEN full-station assemblies after the handler returned, about 150 ms. Seven calls is
// not by itself a reason to add a scope: a render scope may only share inside ONE synchronous turn, so if
// those were seven turns of one call each, a scope would buy exactly nothing and the honest answer would be
// "not capturable under this approval". Stamping each call with its turn answered it - 7 calls, 3 turns, one
// turn assembling 5 times - and that is why this scope exists.
//
// WHAT THIS SUITE TESTS IS BEHAVIOUR, NOT THE PRESENCE OF A WRAPPER. The lesson CP2P-R2 paid for is that a
// lifetime claim has to be exercised: a callback that assembles twice must assemble once, a LATER callback
// must assemble again, and a reader outside every scope must never see a residue. Section A drives the real
// `_irRecoRevealOnce_` / `_irExecRevealOnce_` with the real scope helpers; the paints themselves are stubbed
// so the only thing under test is the boundary.
'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var PAGE = fs.readFileSync(path.join(ROOT, 'assets/js/pages/inventory-replenishment.js'), 'utf8');

var passed = 0, failed = 0;
function ok(c, m, d) { if (c) { passed++; console.log('ok   ' + m); } else { failed++; console.log('FAIL ' + m + (d === undefined ? '' : '\n       got ' + JSON.stringify(d))); } }
function eq(a, b, m) { ok(JSON.stringify(a) === JSON.stringify(b), m + '  (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

function extractFn(src, name) {
  var i = src.indexOf('\nfunction ' + name + '(');
  if (i === -1) throw new Error('function not found: ' + name);
  var start = i + 1, depth = 0, inStr = null;
  for (var k = src.indexOf('{', start); k < src.length; k++) {
    var ch = src[k], prev = src[k - 1];
    if (inStr) { if (ch === inStr && prev !== '\\') inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '/' && src[k + 1] === '/') { k = src.indexOf('\n', k); if (k === -1) break; continue; }
    if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, k + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// ---------------------------------------------------------------------------------------------------
// The sandbox: the REAL scope helpers and the REAL once-wrappers. The station assembly is a counter and
// the two paints are stubs that assemble as many times as a test tells them to.
// ---------------------------------------------------------------------------------------------------
// `window` with Demo OFF: getReplenishmentData checks the demo layer first, and this suite is about the
// Demo-OFF cloud path, which is the one the reveal callbacks run.
var sandbox = { console: console, assemblies: 0, paintCalls: 0, perPaint: 1, thrower: false, lastSnap: null, window: { KM: {} } };
var ctx = vm.createContext(sandbox);
vm.runInContext('var _irRowsPass = null; var _irRowsPassDepth = 0;', ctx);
vm.runInContext([
  'var country = "US", marketplaceId = "MKT-1", lts = 1, searchGen = 1, workspace = 1;',
  'function _getCloudReplenishmentData() { assemblies++; return [{ sku: "SKU-A" }]; }',
  // The dependency snapshot reads page state this sandbox does not have; a stable stub keeps the test on
  // the LIFETIME question instead of re-testing dependency invalidation, which CP2P-R2 already owns.
  'function _irRowsPassDeps_() { return { k: 1 }; }',
  'function _irRowsPassSame_(a, b) { return !!a && !!b && a.k === b.k; }',
  'function _irRecoRevealPaint_(snap) { lastSnap = snap; paintCalls++; for (var i = 0; i < perPaint; i++) getReplenishmentData(); if (thrower) throw new Error("paint blew up"); }',
  'function _irExecRevealPaint_(snap) { lastSnap = snap; paintCalls++; for (var i = 0; i < perPaint; i++) getReplenishmentData(); }'
].join('\n'), ctx);
['_irRowsPassRelease_', '_irRenderPassBegin_', '_irRenderPassEnd_', '_irWithRenderPass_',
  'getReplenishmentData', '_irRecoRevealOnce_', '_irExecRevealOnce_'].forEach(function (fn) {
    vm.runInContext(extractFn(PAGE, fn), ctx);
  });

function reset(perPaint) { sandbox.assemblies = 0; sandbox.paintCalls = 0; sandbox.perPaint = perPaint; sandbox.thrower = false; vm.runInContext('_irRowsPass = null; _irRowsPassDepth = 0;', ctx); }
function run(expr) { return vm.runInContext(expr, ctx); }

// ---------------------------------------------------------------------------------------------------
section('A  one callback, one assembly');
// ---------------------------------------------------------------------------------------------------
reset(5);
run('_irExecRevealOnce_({ sku: "SKU-A" })');
eq(sandbox.paintCalls, 1, 'A1  the wrapper calls the real paint exactly once');
eq(sandbox.assemblies, 1, 'A2  and five assemblies inside ONE callback become ONE - this is the measured 5-call turn');
eq(sandbox.lastSnap, { sku: 'SKU-A' }, 'A3  the snapshot is passed through untouched');

reset(5);
run('_irRecoRevealOnce_({ sku: "SKU-A" })');
eq(sandbox.assemblies, 1, 'A4  the recommendation callback is scoped the same way');

// A callback that assembles once gains nothing and must cost nothing.
reset(1);
run('_irExecRevealOnce_({ sku: "SKU-A" })');
eq(sandbox.assemblies, 1, 'A5  a callback that assembles once still assembles once - no change, no second call');

// ---------------------------------------------------------------------------------------------------
section('B  and nothing survives the callback');
// ---------------------------------------------------------------------------------------------------
reset(2);
run('_irExecRevealOnce_({ sku: "SKU-A" })');
eq(sandbox.assemblies, 1, 'B1  first callback assembles once');
run('_irExecRevealOnce_({ sku: "SKU-A" })');
eq(sandbox.assemblies, 2, 'B2  a SECOND callback assembles AGAIN - the share did not cross the boundary');
run('_irRecoRevealOnce_({ sku: "SKU-A" })');
eq(sandbox.assemblies, 3, 'B3  and the OTHER panel assembles for itself - one scope per callback, never shared');

// The strongest form of the lifetime claim: outside every scope, nothing is stored and nothing is read.
reset(2);
run('_irExecRevealOnce_({ sku: "SKU-A" })');
eq(sandbox.assemblies, 1, 'B4  a callback ran and shared internally');
run('getReplenishmentData()');
eq(sandbox.assemblies, 2, 'B5  a read OUTSIDE any scope re-assembles - there is no residue to hit');
eq(run('_irRowsPass === null'), true, 'B6  and nothing is left stored after the callback returns');
eq(run('_irRowsPassDepth'), 0, 'B7  with the scope depth back at zero');

// ---------------------------------------------------------------------------------------------------
section('C  a paint that throws still releases');
// ---------------------------------------------------------------------------------------------------
reset(2);
sandbox.thrower = true;
var threw = false;
try { run('_irRecoRevealOnce_({ sku: "SKU-A" })'); } catch (e) { threw = true; }
ok(threw, 'C1  the throw is NOT swallowed - the wrapper changes lifetime, not error handling');
eq(run('_irRowsPassDepth'), 0, 'C2  and the scope was closed anyway, by the finally');
eq(run('_irRowsPass === null'), true, 'C3  with nothing left behind for the next callback to read');
sandbox.thrower = false;
run('getReplenishmentData()');
eq(sandbox.assemblies, 2, 'C4  so the next read assembles for itself');

// ---------------------------------------------------------------------------------------------------
section('D  the wiring, and what was deliberately left alone');
// ---------------------------------------------------------------------------------------------------
var recoGate = extractFn(PAGE, '_irRecoGate_'), execGate = extractFn(PAGE, '_irExecGate_');
ok(/onReveal: _irRecoRevealOnce_/.test(recoGate), 'D1  the recommendation gate reveals through the scoped wrapper');
ok(/onReveal: _irExecRevealOnce_/.test(execGate), 'D2  and the execution gate does too');
// The paints are extracted BY NAME and executed by other suites. A helper call inside their bodies would
// make those slices depend on a function outside themselves - the coupling that broke six suites in CP2P-R2.
ok(!/_irWithRenderPass_/.test(extractFn(PAGE, '_irRecoRevealPaint_')),
  'D3  the recommendation PAINT itself holds no reference to the scope helper');
ok(!/_irWithRenderPass_/.test(extractFn(PAGE, '_irExecRevealPaint_')),
  'D4  nor does the execution paint - the wrapper lives at the registration site');
// No memo, no cache, no cross-frame retention anywhere in the new code.
var once = extractFn(PAGE, '_irRecoRevealOnce_') + extractFn(PAGE, '_irExecRevealOnce_');
ok(!/setTimeout|requestAnimationFrame|cache|memo/i.test(once),
  'D5  the wrappers schedule nothing and remember nothing - they are a boundary, not a store');
ok(/finally/.test(extractFn(PAGE, '_irWithRenderPass_')),
  'D6  and the scope is still closed in a finally');
ok(!/Promise\.resolve\(\)\.then\(_irRowsPassRelease_\)/.test(PAGE),
  'D7  the CP2P-R1 microtask release is still gone and was not reintroduced');

// ---------------------------------------------------------------------------------------------------
section('E  the measurement - six interleaved pairs, and what it does NOT claim');
// ---------------------------------------------------------------------------------------------------
// Unscoped and scoped alternate INSIDE each pair, so the machine's drift lands on both arms of every pair
// instead of on one batch. Batches are never pooled and never cross-compared: that is the mistake CP2P made
// when four pooled runs per side pointed the wrong way and ten interleaved pairs reversed the answer.
// The two arms differ by exactly two identifiers - whether the gate's onReveal is the raw paint or the
// paint wrapped in a render scope. Nothing else in the file moves between them.
var crypto = require('crypto');
function shaOf(rel) { return crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')).digest('hex').slice(0, 16); }
var EV = 'docs/evidence/cp2r-reveal-scope';
function ev(n) { return JSON.parse(fs.readFileSync(path.join(ROOT, EV, n), 'utf8')); }
var UNSCOPED = [], SCOPED = [];
for (var k = 1; k <= 6; k++) { UNSCOPED.push(ev('unscoped-' + k + '.json')); SCOPED.push(ev('scoped-' + k + '.json')); }

function expands(r) { return (r.measurement.expands || []).filter(function (e) { return e.tag !== 'collapse'; }); }
function med(a) { var b = a.slice().sort(function (x, y) { return x - y; }); var n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; }
function rmed(r, f) { return med(expands(r).map(f).filter(function (v) { return v != null; })); }
function pairs(f) { var o = []; for (var i = 0; i < 6; i++) o.push(rmed(SCOPED[i], f) - rmed(UNSCOPED[i], f)); return o; }
function better(d) { return d.filter(function (x) { return x < 0; }).length; }

// The SHIPPED arm must describe the page on disk. The other arm must not.
Object.keys(SCOPED[0].sources).forEach(function (rel) {
  eq(shaOf(rel), SCOPED[0].sources[rel], 'E1 ' + rel.split('/').pop() + ' is unchanged since the shipped capture');
});
ok(UNSCOPED[0].sources['assets/js/pages/inventory-replenishment.js'] !== shaOf('assets/js/pages/inventory-replenishment.js'),
  'E1a the unscoped arm ran against a different page');
ok(/_cp2r-warm-expand-runner\.js/.test(Object.keys(SCOPED[0].sources).join(' ')),
  'E1b and the capture names the instrument that actually produced it');

// WHERE THE GAIN IS. The scope wraps callbacks that run AFTER the handler, so this is the only row where a
// gain is even possible, and it is where the gain is.
var afterD = pairs(function (e) { return e.ms_data_after_handler; });
eq(better(afterD), 6, 'E2 assembly cost AFTER the handler falls in six of six pairs');
ok(med(afterD) < -30, 'E2a by a median of tens of milliseconds', { medianMs: med(afterD) });
var readyD = pairs(function (e) { return e.ms_click_to_exec_resolved; });
eq(better(readyD), 6, 'E3 and the FULL READY time falls in six of six - the gain is not paid for elsewhere');
ok(med(readyD) < -30, 'E3a by a comparable median, because that is the work that was removed', { medianMs: med(readyD) });

// WHAT IT DOES NOT CLAIM, STATED AS A TEST RATHER THAN AS PROSE.
//
// FIRST PAINT IS NOT IMPROVED, and it CANNOT be: first paint is the frame in which the expand panel first
// has a layout box, and every scoped callback runs after that frame. A round that reported a first-paint
// win here would be reporting drift. The assertion is therefore one-sided - it only refuses a real
// REGRESSION - and it deliberately does not require an improvement.
var paintD = pairs(function (e) { return e.ms_click_to_paint; });
ok(med(paintD) < 15, 'E4 first paint does not regress - and no improvement is claimed for it, because the '
  + 'scope runs entirely after the panel is painted', { medianMs: med(paintD), improvedIn: better(paintD) });
var syncD = pairs(function (e) { return e.ms_handler_sync; });
ok(Math.abs(med(syncD)) < 15, 'E4a the synchronous handler is unchanged - CP2P-R2 already owns that scope '
  + 'and this round did not widen it', { medianMs: med(syncD) });

// The turn shape that made this worth doing at all, recorded from the measurement rather than asserted.
ok(UNSCOPED.every(function (r) { return expands(r).every(function (e) { return e.turns_after_handler >= 2; }); }),
  'E5 the post-handler assemblies span MORE THAN ONE turn, so no single scope could ever capture them all');
ok(UNSCOPED.some(function (r) { return expands(r).some(function (e) { return e.max_calls_in_one_turn >= 3; }); }),
  'E5a and at least one turn assembles repeatedly - which is the only part a per-callback scope may take');

// The guards, on the shipped build, in every run.
ok(SCOPED.every(function (r) { return r.measurement.abPanels === 1; }), 'E6 A then B leaves exactly one panel');
ok(SCOPED.every(function (r) { return r.measurement.afterSwitch.panelsOpen === 0; }), 'E6a a station switch leaves none open');
ok(SCOPED.every(function (r) { return r.measurement.afterSwitch.rows === 25; }), 'E6b and really switches station');
ok(SCOPED.every(function (r) { return r.measurement.afterLeave.panels === 0; }), 'E6c leaving the page leaves none');
ok(SCOPED.every(function (r) { return !r.measurement.fatal; }), 'E6d nothing threw');
ok(SCOPED.every(function (r) { return r.measurement.dialogs.length === 0; }), 'E6e no dialog was raised');
ok(SCOPED.every(function (r) { return r.measurement.rowCount === 100; }), 'E6f every run rendered the 100-SKU station');
ok(SCOPED.every(function (r) { return r.ok === true; }) && UNSCOPED.every(function (r) { return r.ok === true; }),
  'E6g and every run in both arms completed');

console.log('\n' + (failed === 0 ? 'PASS' : 'FAIL') + '  ' + passed + ' passed, ' + failed + ' failed');
