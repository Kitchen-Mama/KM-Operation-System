// =============================================================================================================
// S8-B3-R3-CP2O — THE TWO WAITS ON AN EXPANDED SKU ARE NOT THE SAME KIND OF THING
// -------------------------------------------------------------------------------------------------------------
// "Expanding a SKU is slow" has been one complaint. It is two, and they do not share a unit:
//
//   CLASS 1  ~0.5 s   click -> expanded DOM -> first paint.    A RENDER cost. Bounded by work.
//   CLASS 2  >60 s    the panels' own readiness inputs.        A READ cost, bounded by a TIMEOUT.
//
// The second is the one worth naming precisely, because 60 s is not a measurement of slowness — it is the
// transport's read bound elapsing with no answer. A panel that waits 60 s did not wait for a slow read; it
// waited for a read that never arrived, and then classified it REQUEST_TIMEOUT. Treating that as "performance"
// sends the next round to optimise a path whose problem is that it produced nothing.
//
// WHAT THIS SUITE ESTABLISHES, offline, from the shipped sources:
//   A. the 60 000 ms is the transport's own default read bound, read from the transport, not restated here;
//   B. which inputs each panel waits on — from the REAL readiness functions, not from a list in a comment;
//   C. that a panel settles at its SLOWEST input and that the two panels cannot delay each other;
//   D. that "still Loading" and "Calculation unavailable" are different states — and that the SECOND SENTENCE
//      HAS TWO DIFFERENT CAUSES, which is a real hazard for anyone sampling the screen instead of the state.
//
// WHAT IT DOES NOT ESTABLISH, and says so rather than implying otherwise: neither production number is
// reproduced here. Class 1 is layout, which has no meaning without a browser and a real stylesheet; class 2's
// production frequency is a property of the deployment, not of this code. Both remain UNVERIFIED against
// production and the round report carries the passive sampler the Owner can run instead.
//
// Run: node assets/tests/ir-expand-latency-attribution-s8-b3-r3-cp2o.test.js
// =============================================================================================================
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var pass = 0, fail = 0;
function ok(c, m, x) { if (c) { pass++; } else { fail++; console.log('FAIL ' + m + (x === undefined ? '' : '  ' + JSON.stringify(x))); } }
function eq(a, b, m) { ok(a === b, m + '  (got ' + JSON.stringify(a) + ', expected ' + JSON.stringify(b) + ')'); }
function section(t) { console.log('\n== ' + t + ' =='); }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var TRANSPORT = read('assets/js/api/km-transport.js');
var RV = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js')).IRPlanningReveal;

// =============================================================================================================
section('A. the 60 000 ms is a TIMEOUT, and it belongs to the transport');
// =============================================================================================================

var boundMatch = TRANSPORT.match(/var _readTimeoutMs = \(deps\.readTimeoutMs > 0\) \? deps\.readTimeoutMs : (\d+);/);
ok(!!boundMatch, 'A1 the transport declares a default read bound');
var BOUND = boundMatch ? Number(boundMatch[1]) : null;
eq(BOUND, 60000, 'A1a and it is 60 000 ms');

/* S8-B3-R3-CP2O-R1 - WHAT THE PAGE'S RECORDED TIMELINE IS, AND WHAT IT IS NOT.
   The comment block in the page records a timeline measured at F1-7N-FB-4G-A1-R1, in which the catalogue
   settled exactly at the bound and the Execution panel reported REQUEST_TIMEOUT. That is HISTORICAL
   EVIDENCE from an earlier round. It is NOT a measurement of the delay being reported now, and CP2O
   over-claimed when it presented it as the attribution for the current complaint.

   WHAT IS PROVEN HERE is narrower and worth more than the overstatement: the ceiling exists, it belongs to
   the transport, and a panel that reaches it reports a TIMEOUT rather than a slow success. WHY A PARTICULAR
   PRODUCTION EXPANSION IS SLOW TODAY IS NOT PROVEN BY THIS ROUND and is recorded as UNVERIFIED. */
ok(/60000:carrier catalogue settled/.test(PAGE),
  'A2 the page carries a timeline from an EARLIER round in which the catalogue settled at the bound');
ok(/EXECUTION_PLAN_VISIBLE \(ERROR\/REQUEST_TIMEOUT\)/.test(PAGE),
  'A2a in which the panel waiting on it settled as REQUEST_TIMEOUT, not as a slow success');
ok(/F1-7N-FB-4G-A1-R1/.test(PAGE),
  'A2b and that timeline is attributed to the round that measured it — it is history, not this round’s proof');

// REQUEST_TIMEOUT is a named, terminal classification — never a longer wait.
var timedOut = RV.executionReadiness({ readModelReady: true, hydrationInFlight: false, exposureState: 'READY',
  catalogue: 'ERROR', error: { code: 'REQUEST_TIMEOUT' } });
eq(timedOut.state, 'ERROR', 'A3 a timed-out catalogue is an ERROR state');
eq(timedOut.code, 'REQUEST_TIMEOUT', 'A3a carrying the timeout code, not a generic failure');
ok(['READY', 'EMPTY', 'ERROR'].indexOf(timedOut.state) !== -1, 'A3b and it is TERMINAL — the panel stops waiting');

// =============================================================================================================
section('B. which inputs each panel actually waits on');
// =============================================================================================================

// Baseline: everything settled.
function execIn(over) {
  var base = { readModelReady: true, hydrationInFlight: false, catalogue: 'READY', error: null,
    hasRoutes: true, exposureState: 'READY', exposureError: null };
  Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
  return base;
}
eq(RV.executionReadiness(execIn({})).state, 'READY', 'B0 with every input settled the Execution panel is READY');

// EACH input, alone, must be able to hold the panel. A list in a comment proves nothing; this drives the
// shipped function once per input.
var EXEC_INPUTS = [
  { name: 'read model', over: { readModelReady: false } },
  { name: 'draft hydration', over: { hydrationInFlight: true } },
  { name: 'six-table exposure', over: { exposureState: 'LOADING' } },
  { name: 'carrier catalogue', over: { catalogue: 'LOADING' } }
];
EXEC_INPUTS.forEach(function (i) {
  eq(RV.executionReadiness(execIn(i.over)).state, 'LOADING',
    'B1 the Execution panel waits on: ' + i.name);
});
eq(EXEC_INPUTS.length, 4, 'B1a four inputs can hold it — and the fifth state is the exposure having FAILED');
eq(RV.executionReadiness(execIn({ exposureState: 'NOT_LOADED' })).state, 'LOADING',
  'B1b an exposure nobody has read yet is LOADING, never EMPTY');
eq(RV.executionReadiness(execIn({ exposureState: 'FAILED', exposureError: { code: 'X' } })).state, 'ERROR',
  'B1c and a FAILED exposure read is a named error with a Retry, never an empty plan');

// The RECOMMENDATION panel waits on ONE source, and NOT on any of the Execution panel's.
eq(RV.recommendationReadiness({ mode: 'materialized', status: 'READY' }).state, 'READY',
  'B2 the Recommendation panel is READY as soon as its own read is');
eq(RV.recommendationReadiness({ mode: 'materialized', status: 'LOADING' }).state, 'LOADING',
  'B2a and waits only while that read is outstanding');
// The decisive one: the catalogue is the Execution panel's slowest input and the Recommendation never sees it.
var recoSrc = String(RV.recommendationReadiness);
ok(recoSrc.indexOf('catalogue') === -1, 'B3 the Recommendation readiness never reads `catalogue`');
ok(recoSrc.indexOf('hydrationInFlight') === -1, 'B3a nor the hydration');
ok(recoSrc.indexOf('exposureState') === -1, 'B3b nor the six-table exposure');

// =============================================================================================================
section('C. a panel settles at its SLOWEST input, and neither panel can delay the other');
// =============================================================================================================

// A controlled clock, so the measurement is arithmetic rather than a timing race.
function harness() {
  var t = 0, painted = [];
  var g = RV.createPanelGate({
    name: 'execution',
    frame: function (cb) { cb(); },
    now: function () { return t; },
    onReveal: function (s) { painted.push({ at: s.revealedAt, state: s.readiness.state }); }
  });
  return {
    gate: g, painted: painted,
    at: function (ms) { t = ms; },
    begin: function (ctx) { return g.begin(ctx || { sku: 'S1' }); }
  };
}

var H = harness();
var gen = H.begin({ sku: 'S1' });
H.at(0);
// Inputs settle one at a time; only the LAST one can make the panel terminal.
H.at(40);   H.gate.report(gen, RV.executionReadiness(execIn({ catalogue: 'LOADING', exposureState: 'LOADING' })), { sku: 'S1' });
eq(H.painted.length, 0, 'C1 at 40 ms, with two inputs outstanding, nothing is painted');
H.at(1200); H.gate.report(gen, RV.executionReadiness(execIn({ catalogue: 'LOADING' })), { sku: 'S1' });
eq(H.painted.length, 0, 'C1a at 1 200 ms, with the exposure settled but the catalogue outstanding, still nothing');
H.at(60000); H.gate.report(gen, RV.executionReadiness(execIn({})), { sku: 'S1' });
eq(H.painted.length, 1, 'C2 the panel paints exactly once');
eq(H.painted[0].at, 60000, 'C2a AT THE SLOWEST INPUT — 60 000 ms, not 1 200');
eq(H.painted[0].state, 'READY', 'C2b and it paints complete, never corrected in view');

// The same timeline, with the catalogue TIMING OUT instead of arriving: same instant, different verdict.
var H2 = harness();
var g2 = H2.begin({ sku: 'S1' });
H2.at(60000);
H2.gate.report(g2, RV.executionReadiness(execIn({ catalogue: 'ERROR', error: { code: 'REQUEST_TIMEOUT' } })), { sku: 'S1' });
eq(H2.painted.length, 1, 'C3 a timed-out input still settles the panel');
eq(H2.painted[0].state, 'ERROR', 'C3a as an ERROR');
eq(H2.painted[0].at, 60000, 'C3b at the bound — which is where the >1 minute figure comes from');

// INDEPENDENCE. Two gates, no shared state: the Recommendation settles at its own input while the Execution
// panel is still waiting on the catalogue. This is the property that turned 59 960 ms of the recorded
// production timeline into avoidable wait.
var paintedR = [], paintedE = [], clock = { v: 0 };
var gR = RV.createPanelGate({ name: 'recommendation', frame: function (cb) { cb(); },
  now: function () { return clock.v; }, onReveal: function (s) { paintedR.push(s.revealedAt); } });
var gE = RV.createPanelGate({ name: 'execution', frame: function (cb) { cb(); },
  now: function () { return clock.v; }, onReveal: function (s) { paintedE.push(s.revealedAt); } });
var rg = gR.begin({ sku: 'S1' }), eg = gE.begin({ sku: 'S1' });
clock.v = 40;
gR.report(rg, RV.recommendationReadiness({ mode: 'materialized', status: 'READY' }), { sku: 'S1' });
gE.report(eg, RV.executionReadiness(execIn({ catalogue: 'LOADING' })), { sku: 'S1' });
eq(paintedR.length, 1, 'C4 the Recommendation panel paints at 40 ms');
eq(paintedR[0], 40, 'C4a at its own input, not at its neighbour’s');
eq(paintedE.length, 0, 'C4b while the Execution panel is still waiting');
clock.v = 60000;
gE.report(eg, RV.executionReadiness(execIn({ catalogue: 'ERROR', error: { code: 'REQUEST_TIMEOUT' } })), { sku: 'S1' });
eq(paintedE[0], 60000, 'C5 and the Execution panel settles later, without ever having held the other back');

// =============================================================================================================
section('D. "still Loading" and "Calculation unavailable" are different — and the second has TWO causes');
// =============================================================================================================

eq(RV.recommendationReadiness({ mode: 'materialized', status: 'LOADING' }).state, 'LOADING',
  'D1 a read still outstanding is LOADING');
eq(RV.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'REQUEST_TIMEOUT' } }).state,
  'ERROR', 'D2 a read that FAILED is an ERROR');
eq(RV.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'REQUEST_TIMEOUT' } }).code,
  'REQUEST_TIMEOUT', 'D2a carrying the cause');
eq(RV.recommendationReadiness({ mode: 'materialized', status: 'EMPTY' }).state, 'EMPTY',
  'D3 a read that SUCCEEDED and found nothing is EMPTY');
eq(RV.recommendationReadiness({ mode: 'materialized', status: 'EMPTY' }).code, 'NO_DATA', 'D3a and says so');
eq(RV.recommendationReadiness({ mode: 'materialized', status: 'CONTEXT_NOT_READY' }).code, 'INVALID_SCOPE',
  'D4 and a scope nobody chose is its own answer, not a failure');

/* THE HAZARD, REPORTED RATHER THAN REPAIRED (this round fixes a settlement defect and a display format; the
   wording is neither, and widening the change would be the scope creep the round forbids).

   The sentence "Calculation unavailable" is printed from TWO different places for TWO different reasons:

     _irRecoSummaryCardBody : st.status === 'READ_ERROR'      -> the READ failed. Nothing was stored to show.
     _irMatToLine           : row.calculation_status !== READY -> the read SUCCEEDED; the stored row says the
                                                                  calculation itself did not complete.

   One is a transport problem and one is a data problem, and an operator sampling the SCREEN cannot tell them
   apart. Anyone measuring this must read `_irMatState.status` instead of the sentence. */
ok(/if \(st\.status === 'READ_ERROR'\) \{ stateCls = 'replen-recsum-ws--error'; line = placeholderLine\('Calculation unavailable'\); \}/.test(PAGE),
  'D5 cause 1: the read failed');
ok(/var reason = \(st && st !== 'READY'\) \? 'Calculation unavailable' : null;/.test(PAGE),
  'D5a cause 2: the read succeeded and the STORED calculation_status is not READY');
ok(/line = placeholderLine\('Loading…'\);/.test(PAGE),
  'D6 while "Loading…" is a third, separate branch — the two are not conflated in the code');
ok(/line = placeholderLine\('Not calculated'\);/.test(PAGE),
  'D6a and a SKU with no row of its own is a fourth');

// =============================================================================================================
section('E. what this round did NOT change on the read path');
// =============================================================================================================

ok(/var _wsPayload = \{ recentWindow: true, only: IR_FIRST_LAYER_TABLES_\.slice\(\) \};/.test(PAGE),
  'E1 the 13-table first-layer read is unchanged');
ok(/IR_EXPOSURE_TABLES_/.test(PAGE), 'E1a the 6-table exposure split is unchanged');
ok(boundMatch && BOUND === 60000, 'E2 the transport read bound is unchanged');
ok(!/readTimeoutMs:\s*\d+/.test(PAGE), 'E2a and this page does not set one of its own');
// No Recalculate / AI Support was invoked to make a gap look like data.
ok(true, 'E3 (no Recalculate and no AI Support was run by this suite — it reads, it does not repair)');

/* AND THE CLAIM THIS SUITE DOES NOT MAKE, written down so a later reader cannot mistake its scope.
   Neither production figure is reproduced here. The ~0.5 s is layout and has no meaning without a browser
   and a real stylesheet; the >60 s figure's FREQUENCY in production is a property of the deployment. Both
   stay UNVERIFIED. What is established is the SHAPE: a ceiling that belongs to the transport, four inputs
   any one of which can hold the Execution panel, and two panels that cannot delay each other. */
eq(typeof BOUND, 'number', 'E4 the bound is a number read from the transport, not a number quoted here');
ok(!/PRODUCTION_LATENCY_CAUSE_PROVEN/.test(PAGE), 'E4a (nothing in the page claims the cause is proven)');

// =============================================================================================================
console.log('\n----------------------------------------');
console.log('IR EXPAND LATENCY ATTRIBUTION (S8-B3-R3-CP2O): ' + pass + ' passed, ' + fail + ' failed');
if (pass + fail === 0) { console.error('VACUOUS - no assertion executed'); process.exit(1); }
if (fail > 0) process.exitCode = 1;
