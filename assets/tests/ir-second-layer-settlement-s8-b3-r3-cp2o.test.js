// ================================================================================================================
// S8-B3-R3-CP2O — THE SECOND LAYER SETTLES, AND UNTIL NOW IT TOLD THE PANEL SO ONE LINE TOO EARLY
// ----------------------------------------------------------------------------------------------------------------
// `_irOnExposureSettled_` says, in its own comment, what is supposed to happen:
//
//     "The persisted routes are an exposure table, so the hydrate could not have run before now. It pumps the
//      Execution gate itself on completion, which is what releases that panel from its skeleton."
//
// It does pump. It pumps while `_irDraftHydrateInFlight` is STILL TRUE:
//
//     if (typeof _irRevealPumpExec_ === 'function') { try { _irRevealPumpExec_(); } catch (eP) {} }
//     return done(ok);                      // <- done() is what sets the flag false
//
// `executionReadiness` reads that flag as its second input and answers LOADING. `report` accepts the LOADING,
// `settle()` declines to act because LOADING is not terminal, and `revealed` stays false. THEN the flag is
// cleared — and nothing reports again. The Execution Plan holds its skeleton for the rest of the row's life.
//
// It is not a race. It is deterministic: the notification is strictly ordered BEFORE the state change it exists
// to announce, so it announces the state that was already on screen.
//
// WHAT THIS SUITE USES. The REAL `_irHydrateDraftForAppliedScope_`, the REAL `_irRevealPumpExec_`, the REAL
// `_irExecReadinessInput_` and the REAL `IRPlanningReveal` gate, all sliced out of the shipped sources and run
// in one sandbox. The only doubles are the leaves that touch the DOM or the network — the paint callback, the
// DB hydrate, the renderer — because the question here is ORDERING, and a double that answers instantly makes
// the ordering easier to get wrong, not harder.
//
// Run: node assets/tests/ir-second-layer-settlement-s8-b3-r3-cp2o.test.js
// ================================================================================================================
'use strict';

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CODE = PAGE.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
var COMPAT = path.join(ROOT, 'assets/js/utils/inventory-compat.js');

var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
var NL = PAGE.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;

// Slice a named function out of the shipped source, brace-balanced. A miss THROWS: a probe that silently
// extracted nothing would grade an assertion it never made.
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced: ' + name);
}

// The real functions this defect lives across. Every one is taken from the shipped page, not restated.
var REAL_FNS = [
  '_irRevealFrame_', '_irRevealNow_', '_irExecGate_',
  '_irRevealScopeKey_', '_irRevealSearchGen_', '_irRevealCtx_', '_irRevealSkuData_',
  '_irExecReadinessInput_', '_irRevealPumpExec_', '_irHydrateDraftForAppliedScope_'
];

function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

// ----------------------------------------------------------------------------------------------------------------
// THE HARNESS. One sandbox per scenario, so no scenario can inherit another's gate singleton or in-flight flag.
// ----------------------------------------------------------------------------------------------------------------
function build(opts) {
  opts = opts || {};
  var log = { reveals: [], reports: [], hydrateFlagAtReadiness: [], renders: 0, hydrateCalls: 0, banner: 0 };

  var sb = {
    console: console, Promise: Promise, JSON: JSON, Math: Math, Date: Date, String: String, Number: Number,
    Object: Object, Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt,
    Error: Error, RegExp: RegExp, Boolean: Boolean, setTimeout: setTimeout
  };
  sb.window = sb;
  sb.global = sb;
  // No `document` and no `requestAnimationFrame`: `_irRevealFrame_` then calls back synchronously, which is
  // the shipped headless path and makes the ordering observable without a timer standing in for a frame.

  var ctx = vm.createContext(sb);

  // The REAL shared module, loaded the way the page loads it.
  var compat = require(COMPAT);
  sb.IRPlanningReveal = compat.IRPlanningReveal;

  // A recording passthrough over the REAL readiness function, so the suite can show WHICH value of
  // `hydrationInFlight` the gate was actually told — the mechanism, not just the symptom.
  var realExecReadiness = compat.IRPlanningReveal.executionReadiness;
  sb.IRPlanningReveal = Object.assign({}, compat.IRPlanningReveal, {
    executionReadiness: function (input) {
      log.hydrateFlagAtReadiness.push(!!(input && input.hydrationInFlight));
      return realExecReadiness(input);
    }
  });

  // ---- module state the sliced functions close over, declared exactly as the page declares it --------------
  vm.runInContext([
    'var _irRecoGateSingleton = null, _irExecGateSingleton = null;',
    'var _irRowGen = 0;',
    'var _irDraftHydrateInFlight = false;',
    'var _irDraftHydrateScopeKey = "";',
    'var _irUnsavedRoutes = {};',
    'var _irReadModel = { ready: true };',
    'var _irSearch = { seq: 1 };'
  ].join(NL), ctx, { filename: 'state' });

  // ---- leaf doubles: the DOM painter, the DB hydrate, the renderer, the scope ------------------------------
  sb.__log = log;
  sb.__scope = opts.scope || { company: 'KM', country: 'US', marketplace: 'Amazon' };
  sb.__hydrateResult = (opts.hydrateResult === undefined) ? true : opts.hydrateResult;
  sb.__hydrateThrows = !!opts.hydrateThrows;
  sb.__exposureState = opts.exposureState || 'READY';
  sb.__catalogueLoaded = (opts.catalogueLoaded === undefined) ? true : opts.catalogueLoaded;
  sb.__rows = opts.rows || [{ sku: 'SKU-1' }];

  vm.runInContext([
    'function _irExecRevealPaint_(snap) { __log.reveals.push({ sku: snap.sku, state: snap.readiness.state, frameId: snap.frameId }); }',
    'function _replenCtx() { return { company: __scope.company, country: __scope.country, marketplace: __scope.marketplace }; }',
    'function _irMethodScope_() { return { company: __scope.company, country: __scope.country, marketplace: __scope.marketplace }; }',
    'function _irEffectiveWorkspace() { return true; }',
    'function _hydrateAllocationDraftFromDb(c) { __log.hydrateCalls++; if (__hydrateThrows) { throw new Error("db boom"); } return __hydrateResult; }',
    'function _irRenderUnsavedBanner_() { __log.banner++; }',
    'function renderReplenishment() { __log.renders++; }',
    'function _allocationDraftRowsFor(sku) { return __rows; }',
    'function getReplenishmentData() { return [{ sku: "SKU-1" }]; }',
    'function _irExposureStateForRender_() { return __exposureState; }',
    'function _irExposureActiveEntry_() { return { state: __exposureState, error: null }; }',
    'window.KM = { methodRegistry: { isLoaded: function () { return __catalogueLoaded; }, getError: function () { return null; } } };'
  ].join(NL), ctx, { filename: 'doubles' });

  // ---- the REAL functions, sliced from the shipped page ----------------------------------------------------
  REAL_FNS.forEach(function (n) { vm.runInContext(extractFn(PAGE, n), ctx, { filename: n }); });

  var api = {
    log: log,
    ctx: ctx,
    run: function (src) { return vm.runInContext(src, ctx); },
    gate: function () { return vm.runInContext('_irExecGate_()', ctx); },
    snapshot: function () { return vm.runInContext('(function(){var g=_irExecGate_();return g?g.snapshot():null;})()', ctx); },
    openPanel: function (sku) {
      return vm.runInContext('(function(){var g=_irExecGate_();g.begin(_irRevealCtx_(' + JSON.stringify(sku) + '));return g.snapshot();})()', ctx);
    },
    abandon: function () { return vm.runInContext('(function(){var g=_irExecGate_();g.abandon();return true;})()', ctx); },
    hydrate: function (o) { return vm.runInContext('_irHydrateDraftForAppliedScope_(' + JSON.stringify(o || null) + ')', ctx); },
    flag: function () { return vm.runInContext('_irDraftHydrateInFlight', ctx); },
    setScopeKey: function (k) { return vm.runInContext('_irDraftHydrateScopeKey = ' + JSON.stringify(k), ctx); }
  };
  return api;
}

// ================================================================================================================
section('A. the defect, with the real hydrate and the real gate');
// ================================================================================================================

var A = build();
A.openPanel('SKU-1');
eq(A.snapshot().readiness.state, 'LOADING', 'A1 a freshly opened Execution panel starts in its skeleton');
eq(A.snapshot().revealed, false, 'A1a and has not been revealed');

var aDone = A.hydrate({ skipRerender: true }).then(function (r) {
  eq(r, true, 'A2 the hydrate reports success');
  eq(A.flag(), false, 'A2a and clears its in-flight flag');
  eq(A.log.hydrateCalls, 1, 'A2b having actually read once');

  // THE MECHANISM, not merely the symptom: what the gate was TOLD about the flag.
  eq(A.log.hydrateFlagAtReadiness.length, 1, 'A3 the Execution gate was told exactly once');
  eq(A.log.hydrateFlagAtReadiness[0], false,
    'A3a AND IT WAS TOLD hydrationInFlight=false — the notification must follow the state change it announces');

  // THE SYMPTOM.
  var s = A.snapshot();
  eq(s.readiness.state, 'READY', 'A4 so the panel SETTLES instead of holding its skeleton for ever');
  eq(s.revealed, true, 'A4a and is revealed');
  eq(A.log.reveals.length, 1, 'A4b exactly once');
});

// ================================================================================================================
section('B. success, failure, stale scope, SKU switch, leaving the page');
// ================================================================================================================

// --- B1 success WITHOUT skipRerender still repaints the table, as it always did -----------------------------
var B1 = build();
B1.openPanel('SKU-1');
var b1Done = B1.hydrate().then(function (r) {
  eq(r, true, 'B1 a plain hydrate succeeds');
  eq(B1.log.renders, 1, 'B1a and still repaints the table when the caller did not refuse it');
  eq(B1.snapshot().readiness.state, 'READY', 'B1b and the panel settles');
});

// --- B2 skipRerender must NOT close the open row -------------------------------------------------------------
var B2 = build();
B2.openPanel('SKU-1');
var b2Done = B2.hydrate({ skipRerender: true }).then(function () {
  eq(B2.log.renders, 0, 'B2 skipRerender repaints nothing — the open row is not closed under the operator');
  eq(B2.snapshot().revealed, true, 'B2a and the panel is still released from its skeleton');
});

// --- B3 a FAILED hydrate must still release the skeleton ------------------------------------------------------
// A read that failed is still an answer. Holding the skeleton because the hydrate returned false would be the
// same hang with a different cause.
var B3 = build({ hydrateResult: false });
B3.openPanel('SKU-1');
var b3Done = B3.hydrate({ skipRerender: true }).then(function (r) {
  eq(r, false, 'B3 the hydrate reports failure');
  eq(B3.flag(), false, 'B3a and still clears its flag');
  eq(B3.log.hydrateFlagAtReadiness[0], false, 'B3b and still tells the gate the hydration is over');
  eq(B3.snapshot().readiness.state, 'READY', 'B3c so the panel settles on its OTHER inputs rather than hanging');
  eq(B3.log.renders, 0, 'B3d a failed hydrate repaints nothing');
  eq(B3.log.banner, 0, 'B3e and does not clear the unsaved-routes banner');
});

// --- B4 a THROWN hydrate is the same contract ------------------------------------------------------------------
var B4 = build({ hydrateThrows: true });
B4.openPanel('SKU-1');
var b4Done = B4.hydrate({ skipRerender: true }).then(function (r) {
  eq(r, false, 'B4 a hydrate that throws is reported as failure, not propagated');
  eq(B4.flag(), false, 'B4a the flag is cleared');
  eq(B4.snapshot().revealed, true, 'B4b and the panel is released');
});

// --- B5 a STALE SCOPE must NOT notify, and must NOT leave the flag stuck ---------------------------------------
// The panel on screen belongs to the NEW scope. Reporting a readiness assembled for the old one would paint an
// answer about a station the operator has left — which is exactly what the scope guard exists to prevent.
var B5 = build();
B5.openPanel('SKU-1');
var b5p = B5.hydrate({ skipRerender: true });
B5.setScopeKey('KM|CA|Amazon');            // a newer Search lands while the hydrate is awaiting
var b5Done = b5p.then(function (r) {
  eq(r, false, 'B5 a superseded hydrate reports false');
  eq(B5.flag(), false, 'B5a and does NOT leave the in-flight flag stuck');
  eq(B5.log.hydrateCalls, 0, 'B5b it never read for the abandoned scope');
  eq(B5.log.hydrateFlagAtReadiness.length, 0,
    'B5c and it notified NOBODY — the panel now on screen is not the one this answer belongs to');
  eq(B5.snapshot().revealed, false, 'B5d so nothing was painted');
});

// --- B6 a SKU switch / collapse abandons the gate; the late answer has nowhere to land --------------------------
var B6 = build();
B6.openPanel('SKU-1');
var b6p = B6.hydrate({ skipRerender: true });
B6.abandon();                               // the operator collapsed the row or opened another SKU
var b6Done = b6p.then(function (r) {
  eq(r, true, 'B6 the hydrate still completes');
  eq(B6.flag(), false, 'B6a and clears its flag');
  eq(B6.snapshot(), null, 'B6b the gate has no current generation');
  eq(B6.log.reveals.length, 0, 'B6c so nothing was painted onto the row the operator closed');
  eq(B6.log.hydrateFlagAtReadiness.length, 0, 'B6d the pump found no panel and asked for no readiness');
});

// --- B7 leaving the page (no panel ever opened) is a no-op, not a throw -------------------------------------------
var B7 = build();
var b7Done = B7.hydrate({ skipRerender: true }).then(function (r) {
  eq(r, true, 'B7 a hydrate with no open panel completes');
  eq(B7.log.reveals.length, 0, 'B7a and paints nothing');
  eq(B7.log.hydrateFlagAtReadiness.length, 0, 'B7b and reports nothing');
});

// --- B8 a second hydrate while one is in flight does not start a second read ---------------------------------------
var B8 = build();
B8.openPanel('SKU-1');
var b8a = B8.hydrate({ skipRerender: true });
var b8b = B8.hydrate({ skipRerender: true });
var b8Done = Promise.all([b8a, b8b]).then(function (rs) {
  eq(rs[1], false, 'B8 the second call returns immediately without starting a second hydrate');
  eq(B8.log.hydrateCalls, 1, 'B8a exactly one read was issued');
});

// ================================================================================================================
section('C. the guards the fix must not weaken');
// ================================================================================================================

// The gate's own acceptance rules, exercised against the REAL gate. The fix changes WHEN the pump runs and
// nothing about WHO it is allowed to paint.
var C = build();
C.openPanel('SKU-1');
var cGate = C.run('(function(){ var g=_irExecGate_(); var base=_irRevealCtx_("SKU-1"); var gen=g.snapshot().gen;'
  + ' var R = window.IRPlanningReveal.executionReadiness({ readModelReady:true, hydrationInFlight:false,'
  + ' catalogue:"READY", hasRoutes:true, exposureState:"READY" });'
  + ' function cp(o){ var c={}; for (var k in base) c[k]=base[k]; for (var k2 in o) c[k2]=o[k2]; return c; }'
  + ' return { staleGen: g.report(gen-1, R, base),'
  + '          staleSku: g.report(gen, R, cp({ sku:"SKU-OTHER" })),'
  + '          staleScope: g.report(gen, R, cp({ scopeKey:"km|ca|amazon" })),'
  + '          staleSearch: g.report(gen, R, cp({ searchGen: 99 })),'
  + '          staleRow: g.report(gen, R, cp({ rowGen: 99 })),'
  + '          good: g.report(gen, R, base) }; })()');

eq(cGate.staleGen.accepted, false, 'C1 a report from a superseded generation is refused');
eq(cGate.staleGen.reason, 'STALE_GENERATION', 'C1a by name');
eq(cGate.staleSku.accepted, false, 'C2 a report for another SKU is refused');
eq(cGate.staleSku.reason, 'STALE_SKU', 'C2a by name');
eq(cGate.staleScope.accepted, false, 'C3 a report for another scope is refused');
eq(cGate.staleScope.reason, 'STALE_SCOPE', 'C3a by name');
eq(cGate.staleSearch.accepted, false, 'C4 a report from an older Search is refused');
eq(cGate.staleSearch.reason, 'STALE_SEARCH', 'C4a by name');
eq(cGate.staleRow.accepted, false, 'C5 a report from an older row generation is refused');
eq(cGate.staleRow.reason, 'STALE_ROW', 'C5a by name');
eq(cGate.good.accepted, true, 'C6 and the matching report IS accepted');

// NOT a forced terminal state: an input that is genuinely still loading must still read LOADING.
var CL = build({ exposureState: 'LOADING' });
CL.openPanel('SKU-1');
var clDone = CL.hydrate({ skipRerender: true }).then(function () {
  eq(CL.log.hydrateFlagAtReadiness[0], false, 'C7 the hydration is reported as finished');
  eq(CL.snapshot().readiness.state, 'LOADING',
    'C7a but an exposure read still in flight keeps the panel LOADING — unknown is never forced to READY');
  eq(CL.snapshot().revealed, false, 'C7b and nothing is painted');
});

var CN = build({ exposureState: 'NOT_LOADED' });
CN.openPanel('SKU-1');
var cnDone = CN.hydrate({ skipRerender: true }).then(function () {
  eq(CN.snapshot().readiness.state, 'LOADING', 'C8 NOT_LOADED is not EMPTY either — nobody has looked yet');
});

var CF = build({ exposureState: 'FAILED' });
CF.openPanel('SKU-1');
var cfDone = CF.hydrate({ skipRerender: true }).then(function () {
  eq(CF.snapshot().readiness.state, 'ERROR', 'C9 a failed exposure read is a NAMED error, never an empty plan');
  eq(CF.snapshot().revealed, true, 'C9a and it is terminal, so the panel settles on it');
});

// ================================================================================================================
section('D. the source carries the ordering, in both branches');
// ================================================================================================================

var HY = extractFn(PAGE, '_irHydrateDraftForAppliedScope_').replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');

// The success branch: the flag is cleared BEFORE the pump, and the pump's result is not what is returned.
var pumpAt = HY.indexOf('_irRevealPumpExec_()');
var doneAt = HY.indexOf('done(ok)');
ok(pumpAt > -1 && doneAt > -1, 'D0 (both landmarks are present in the real function)');
ok(doneAt < pumpAt, 'D1 done(ok) runs BEFORE the Execution pump is called', { doneAt: doneAt, pumpAt: pumpAt });

// The catch branch, same shape. The landmark is the bracketed accessor the source actually uses — a bare
// `lastIndexOf('catch')` lands on the INNER `catch (eP2)`, which sits after the pump and would make this
// assertion pass for the wrong reason.
var catchIdx = HY.lastIndexOf("['catch']");
var tail = HY.slice(catchIdx);
var tPump = tail.indexOf('_irRevealPumpExec_()');
var tDone = tail.indexOf('done(false)');
ok(tPump > -1 && tDone > -1, 'D2 (the trailing catch has both landmarks)');
ok(tDone < tPump, 'D2a and clears the flag before notifying there too', { tDone: tDone, tPump: tPump });

// WHAT MUST NOT HAVE CHANGED.
ok(/if \(_irDraftHydrateInFlight\) \{ _irDraftHydrateScopeKey = key; return Promise\.resolve\(false\); \}/.test(HY),
  'D3 the in-flight coalescing guard is untouched');
ok(/if \(_irDraftHydrateScopeKey !== key\) return done\(false\);/.test(HY),
  'D4 the scope guard is untouched — and it still returns WITHOUT notifying');
ok(HY.indexOf('_hydrateAllocationDraftFromDb(ctx)') !== -1, 'D5 the hydrate data call is unchanged');
ok(/if \(!\(opts && opts\.skipRerender\)\) \{ try \{ renderReplenishment\(\); \} catch/.test(HY),
  'D6 the skipRerender contract is unchanged');
ok(HY.indexOf('_irRevealPumpReco_') === -1,
  'D7 the RECOMMENDATION gate is still not told — hydration is none of its inputs');

// The readiness function still reads the flag it has always read; the fix is in the caller, not here.
ok(/if \(input\.hydrationInFlight\) return mk\(S\.LOADING, '', null\);/.test(read('assets/js/utils/inventory-compat.js')),
  'D8 executionReadiness still treats an in-flight hydration as LOADING');

// Protected neighbours: this round changed ordering inside ONE function and nothing about the read strategy.
ok(/var _wsPayload = \{ recentWindow: true, only: IR_FIRST_LAYER_TABLES_\.slice\(\) \};/.test(PAGE),
  'D9 the 13-table first-layer read is unchanged');
ok(/IR_EXPOSURE_TABLES_/.test(PAGE), 'D9a and the 6-table exposure list still exists');

// ================================================================================================================
Promise.all([aDone, b1Done, b2Done, b3Done, b4Done, b5Done, b6Done, b7Done, b8Done, clDone, cnDone, cfDone])
  .then(tick)
  .then(function () {
    console.log('\n----------------------------------------');
    console.log('IR SECOND-LAYER SETTLEMENT (S8-B3-R3-CP2O): ' + pass + ' passed, ' + fail + ' failed');
    if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
    if (fail > 0) process.exitCode = 1;
  })
  .catch(function (e) {
    console.error('FAIL harness error: ' + (e && e.stack || e));
    process.exitCode = 1;
  });
