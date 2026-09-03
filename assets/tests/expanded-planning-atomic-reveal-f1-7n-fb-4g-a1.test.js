// F1-7N-FB-4G-A1 — RECOMMENDATION + EXECUTION PLAN ATOMIC REVEAL.
//
// THE MEASURED ROOT CAUSE. Not read off the source — produced by running the SHIPPED
// initializeShippingAllocation against a deterministic scheduler (§B.5). Before this round:
//
//     0:EXPAND
//     0:ROUTE_ROW_PAINTED(method=placeholder, eta=unavailable)
//     0:TOTAL_UPDATED
//   120:CARRIER_RESOLVED
//   120:METHOD_OPTIONS_REBUILT      <- 'Loading methods…' becomes the real service
//   120:ETA_RECOMPUTED              <- 'Lead time unavailable' becomes the real date
//
// The routes were painted synchronously and the carrier catalogue's .then() then CORRECTED them. It
// happened on every expand, including one where the catalogue was already cached: a resolved promise
// resumes on a microtask, so the synchronous render still won the frame. Beside it the Recommendation
// Summary settles off a different async source, so the pair was visible in every half-state combination.
//
// WHAT THE BARRIER IS. It waits; it does not load. Every request it waits on was already issued by Search —
// the materialized gap read, the draft hydration, and the ONE per-scope carrier catalogue. Expanding a row
// issues no request before this round and none after it. Reveal time is exactly
// max(recommendationSettledAt, executionSettledAt) plus the frame that paints.
//
// SUPERSEDED IN PART BY F1-7N-FB-4G-A1-R1. A1 revealed BOTH decision panels in one frame. Production then
// produced the case that coupling cannot survive: the gap read settled in 40 ms, the carrier catalogue hit the
// transport's 60 000 ms read bound, and a complete Recommendation Summary was held behind a skeleton for a
// full minute waiting for a panel it does not depend on. A1's RULE - a panel appears once, complete, and is
// never corrected in view - was right, and every assertion of it below still stands. The SCOPE it was applied
// at was wrong, so each panel now owns its own gate. The assertions that pinned the coupling say so.
//
// Run: node assets/tests/expanded-planning-atomic-reveal-f1-7n-fb-4g-a1.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
// A mutation probe returns TRUE when it DETECTED the mutant. A THROW is a broken probe, never a detection.
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CMPSRC = read('assets/js/utils/inventory-compat.js');
var CSS = read('assets/css/pages/inventory-replenishment.css');
var INDEX = read('index.html');
var PAGEC = code(PAGE), CMPC = code(CMPSRC);
var CMP = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js'));
var MR = require(path.join(ROOT, 'assets/js/core/method-registry.js'));
var R = CMP.IRPlanningReveal;
var RO = require(path.join(ROOT, 'assets/tests/_release-order.js'));
var NLC = String.fromCharCode(10);

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
// Mutate INSIDE one named function. A0's M8 mutated a different function that spelled the same filter, so
// every mutant here is anchored, and a mutation that does not apply THROWS rather than quietly passing.
function mutateFn(src, name, find, replace) {
  var body = extractFn(src, name);
  if (body.indexOf(find) < 0) throw new Error('mutation target absent in ' + name + ': ' + find);
  return src.replace(body, body.replace(find, replace));
}

// ================================================================================================================
// THE DETERMINISTIC SCHEDULER. One queue, explicit virtual times, no wall clock and no real timer — so every
// timing number below is reproducible and comparable between PRE and POST.
// ================================================================================================================
function Sched() {
  var q = [], t = 0, log = [], seq = 0;
  return {
    now: function () { return t; },
    at: function (w, fn) { q.push({ w: w, fn: fn, i: seq++ }); },
    // Jobs are queued DURING the run (every reveal frame is one), so the queue is re-ordered on every
    // step. Sorting once and shifting would run a frame scheduled at t=120 after a job at t=121 and then
    // report its time as 121 - a measurement artefact that would silently weaken every timing assertion.
    run: function () {
      while (q.length) {
        var b = 0;
        for (var i = 1; i < q.length; i++) if ((q[i].w < q[b].w) || (q[i].w === q[b].w && q[i].i < q[b].i)) b = i;
        var j = q.splice(b, 1)[0];
        t = Math.max(t, j.w); j.fn();
      }
    },
    log: log,
    mark: function (e) { log.push({ t: t, e: e }); },
    at_: function (e) { for (var i = 0; i < log.length; i++) if (log[i].e === e) return log[i].t; return null; },
    count: function (e) { var n = 0; for (var i = 0; i < log.length; i++) if (log[i].e === e) n++; return n; },
    events: function () { return log.map(function (x) { return x.t + ':' + x.e; }); }
  };
}

// ================================================================================================================
// A MINIMAL DOM. Enough for the reveal paint and the shipped route seeder to actually run — ids, innerHTML,
// attributes, disabled. Nothing is simulated that the assertions then measure.
// ================================================================================================================
function El(id) { this.id = id; this.innerHTML = ''; this.attrs = {}; this.children = []; this.disabled = false; this.parentNode = null; }
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.appendChild = function (c) { this.children.push(c); c.parentNode = this; };
function Doc() { this.byId = {}; }
Doc.prototype.add = function (id) { var e = new El(id); this.byId[id] = e; return e; };
Doc.prototype.remove = function (id) { delete this.byId[id]; };
Doc.prototype.getElementById = function (id) { return this.byId[id] || null; };
Doc.prototype.querySelector = function () { return null; };
Doc.prototype.querySelectorAll = function () { return []; };

// ================================================================================================================
// THE SHIPPED PIECES, LIFTED. initializeShippingAllocation is the function whose two-stage paint this round
// removes, so it is executed rather than described.
// ================================================================================================================
function makeInit(S, deps) {
  deps = deps || {};
  var doc = deps.doc || (function () { var d = new Doc(); d.add('shipping-methods-CO1100-R'); return d; })();
  // F1-7N-FC-1B-E1 — initializeShippingAllocation now shows an EMPTY STATE where it used to seed a
  // blank Suggested-Qty route. Its two new collaborators are stubbed exactly as _renderExecutionRoute and
  // updateShippingAllocationTotal already are in this harness: both only WRITE to the DOM, this suite
  // measures the paint SEQUENCE, and the empty state's own behaviour is asserted where it belongs (execution-plan-explicit-intent-f1-7n-fc-1b-e1).
  return new Function(
    'document', '_irLoadCarrierPlanning_', '_execRebuildMethodOptions', '_irUpdateRouteEtas',
    '_allocationDraftRowsFor', '_renderExecutionRoute', 'updateShippingAllocationTotal', '_irSuggestedQtyNumber_',
    '_execRenderEmptyState_', '_execSyncEmptyState_',
    extractFn(PAGE, 'initializeShippingAllocation') + ' return initializeShippingAllocation;'
  )(
    doc,
    deps.carrier || function () { return { then: function (cb) { S.at(deps.carrierAt == null ? 120 : deps.carrierAt, cb); return { then: function () {} }; } }; },
    function () { S.mark('METHOD_OPTIONS_REBUILT'); },
    function () { S.mark('ETA_RECOMPUTED'); },
    deps.draftRows || function () { return [{ sku: 'CO1100-R', shipping_method: 'sea', qty: 800 }]; },
    function (sku, route) { S.mark('ROUTE_PAINTED'); S.mark('ROUTE_METHOD=' + String((route && route.shipping_method) || '')); S.mark('ROUTE_QTY=' + String((route && route.qty) || 0)); },
    function () { S.mark('TOTAL_UPDATED'); },
    deps.suggested || function () { return 800; },
    function () { S.mark('EXEC_EMPTY_STATE_SHOWN'); },
    function () { S.mark('EXEC_EMPTY_STATE_SYNCED'); }
  );
}

// One expand, driven through the SHIPPED gates. F1-7N-FB-4G-A1-R1 - there are TWO of them now, one per panel,
// and the helper reflects that: the Execution Plan's routes are seeded by the EXECUTION gate's own reveal, and
// the Recommendation Summary's paint is recorded independently. Returns both so a test can read either clock.
function expand(opts) {
  opts = opts || {};
  var S = Sched();
  var Rev = opts.R || R;
  var doc = new Doc();
  doc.add('shipping-methods-CO1100-R');
  var init = makeInit(S, { doc: doc, carrierAt: opts.carrierAt });
  var ctx = { sku: opts.sku || 'CO1100-R', scopeKey: opts.scopeKey || 'resus|us|amazon' };
  function panel(name, ev, after) {
    return Rev.createPanelGate({
      name: name,
      frame: function (cb) { S.at(S.now(), function () { S.mark('FRAME'); cb(); }); },
      now: S.now,
      onReveal: function (snap) {
        S.mark(ev);
        S.mark(ev + '@' + snap.frameId);
        S.mark('REVEAL_' + name.toUpperCase() + '=' + snap.readiness.state);
        if (opts.onReveal) opts.onReveal(snap, S);
        if (after) after(snap);
      }
    });
  }
  var rgate = panel('reco', 'RECO_PAINTED', null);
  var egate = panel('exec', 'EXEC_PAINTED', function () { init('CO1100-R', { sku: 'CO1100-R' }, { catalogueSettled: true }); });
  S.mark('EXPAND');
  S.mark('SKELETON_IN_DOM');
  var g1 = rgate.begin(ctx), g2 = egate.begin(ctx);
  rgate.report(g1, Rev.recommendationReadiness({ mode: 'materialized', status: 'LOADING' }), null);
  egate.report(g2, Rev.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }), null);
  if (opts.recoAt != null) S.at(opts.recoAt, function () { S.mark('RECO_SETTLED'); rgate.report(g1, Rev.recommendationReadiness(opts.recoInput || { mode: 'materialized', status: 'READY' }), null); });
  if (opts.carrierAt != null) S.at(opts.carrierAt, function () { S.mark('EXEC_SETTLED'); egate.report(g2, Rev.executionReadiness(opts.execInput || { readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: true }), null); });
  if (opts.during) opts.during(S, rgate, egate, doc);
  S.run();
  return { S: S, reco: rgate, exec: egate, doc: doc };
}

// ================================================================================================================
section('§B — THE PRE MEASUREMENT, ON THE COMMIT THIS ROUND STARTED FROM');
// ================================================================================================================
// The defect is asserted by RUNNING the pre-round shape, reconstructed from the shipped function with the
// barrier's own opt-out withheld — which is exactly what every non-reveal caller still does today.
(function () {
  var S = Sched();
  var init = makeInit(S, { carrierAt: 120 });
  S.mark('EXPAND');
  init('CO1100-R', { sku: 'CO1100-R' });          // no catalogueSettled -> the historical path
  S.run();
  eq(S.at_('ROUTE_PAINTED'), 0, 'B1  the route row is painted at t=0, before the carrier catalogue exists');
  eq(S.at_('METHOD_OPTIONS_REBUILT'), 120, 'B2  and the Method options are REBUILT at t=120 — a second, correcting paint');
  eq(S.at_('ETA_RECOMPUTED'), 120, 'B3  and the Expected Arrival is recomputed in that same later frame');
  ok(S.at_('ROUTE_PAINTED') < S.at_('METHOD_OPTIONS_REBUILT'), 'B4  §B.5 the half-built window is real and measured, not inferred');
})();
(function () {
  // The cache-hit case, which is the one a reader would assume is safe. A resolved promise still resumes on
  // a microtask, so the synchronous render wins the frame anyway.
  var S = Sched();
  var init = makeInit(S, { carrierAt: 0 });
  S.mark('EXPAND');
  init('CO1100-R', { sku: 'CO1100-R' });
  S.run();
  ok(S.at_('ROUTE_PAINTED') === 0 && S.count('METHOD_OPTIONS_REBUILT') === 1,
    'B5  even a CACHED catalogue produced two paints — the flicker was not a cold-start artefact');
})();

// ================================================================================================================
section('§C — THE READINESS CONTRACT (one owner, terminal means terminal)');
// ================================================================================================================
// F1-7N-FB-4G-A1-R1 - ABANDONED joined the vocabulary. It is the GATE's state, not a readiness one: what a
// collapse, a scope change or a newer expand leaves behind, and why a late response has nowhere to land.
eq(Object.keys(R.STATES).sort(), ['ABANDONED', 'EMPTY', 'ERROR', 'LOADING', 'READY'], 'C1  §C five named states — no sixth "probably done"');
eq(R.isTerminal('ABANDONED'), false, 'C1a and ABANDONED is not a terminal readiness — nothing is revealed for it');
eq([R.isTerminal('READY'), R.isTerminal('EMPTY'), R.isTerminal('ERROR'), R.isTerminal('LOADING')], [true, true, true, false],
  'C2  §C READY / EMPTY / ERROR are terminal; LOADING is the only state that waits');
eq(R.recommendationReadiness({ mode: 'materialized', status: 'READY' }).state, 'READY', 'C3  a loaded gap scope is READY');
eq(R.recommendationReadiness({ mode: 'materialized', status: 'EMPTY' }).state, 'EMPTY', 'C4  a scope with no stored rows is a TERMINAL empty, never a permanent skeleton');
// F1-7N-FB-4G-A1-R1 - RESTATED. A1 gave every read failure the single code GAP_READ_ERROR. Production showed
// why that is not enough: a timeout, a backend refusal and a genuinely unresolvable scope need different
// sentences and different remedies, and collapsing them is how "Select a valid Country / Marketplace" ended up
// on a screen whose selectors read US / Amazon. The failure is classified now, and the real code is carried.
eq(R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'READ_FAILED' } }),
  { state: 'ERROR', code: 'READ_FAILED', error: { code: 'READ_FAILED' } },
  'C5  §C a read error is TERMINAL and keeps its typed error — not swallowed into an empty panel');
eq(R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'REQUEST_TIMEOUT' } }).code,
  'REQUEST_TIMEOUT', 'C5a and a TIMEOUT is reported as a timeout, never as a scope problem');
eq(R.recommendationReadiness({ mode: 'materialized', status: 'LOADING' }).state, 'LOADING', 'C6  in flight is LOADING');
eq(R.recommendationReadiness({ mode: 'legacy' }).state, 'READY', 'C7  the legacy synchronous table has nothing to wait for');
eq(R.recommendationReadiness({ mode: 'workspace', status: 'API_ERROR' }).state, 'ERROR', 'C8  the workspace cutover path reports its own error state');
eq(R.executionReadiness({ readModelReady: false, catalogue: 'READY', hasRoutes: true }).state, 'LOADING',
  'C9  §C without the read model there are no warehouse candidates — not ready');
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: true, catalogue: 'READY', hasRoutes: true }).state, 'LOADING',
  'C10 §C a hydration still in flight can still replace the route — not ready');
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }).state, 'LOADING',
  'C11 §C without the catalogue the Method and the ETA are both still provisional — not ready');
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: true }).state, 'READY',
  'C12 §C all four inputs settled -> READY');
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'ERROR', error: { code: 'METHOD_REGISTRY_READ_FAILED' }, hasRoutes: true }),
  { state: 'ERROR', code: 'READ_FAILED', error: { code: 'METHOD_REGISTRY_READ_FAILED' } },
  'C13 §C a catalogue failure is TERMINAL and named — the picker can print the code and a Retry');
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'STALE_SCOPE', hasRoutes: true }),
  { state: 'EMPTY', code: 'STALE_SCOPE', error: null },
  'C14 §C a catalogue held for another station is terminal for THIS one — never an endless wait');

// ================================================================================================================
section('§H.1–§H.3 — THE BARRIER, IN BOTH ORDERS AND IN A TIE');
// ================================================================================================================
// F1-7N-FB-4G-A1-R1 - THESE THREE PINNED THE COUPLING, AND THE COUPLING IS THE DEFECT. A1 asserted that a
// panel whose data is ready is NOT painted until its partner is - "H1a and the Recommendation Summary is NOT
// painted the moment its own data lands" was the requirement. Production made the cost of that literal:
// 59 960 ms of avoidable wait behind a carrier timeout. Each panel is now revealed on its own clock.
//
// What A1 was really protecting - a panel appears ONCE, complete, and is never corrected in view - is
// unchanged and is asserted here per panel, which is the form it should always have had.
(function () {
  var r = expand({ recoAt: 40, carrierAt: 120 });
  eq(r.S.at_('RECO_PAINTED'), 40, 'H1  Recommendation ready at t=40 is PAINTED at t=40 — it waits for nothing else');
  eq(r.S.at_('EXEC_PAINTED'), 120, 'H1a and the Execution Plan appears on its own clock at t=120');
  eq(r.S.count('ROUTE_PAINTED'), 1, 'H1b the route is painted exactly ONCE, from a settled catalogue');
  eq(r.S.count('METHOD_OPTIONS_REBUILT'), 0, 'H1c and never corrected afterwards — no second paint at all');
})();
(function () {
  var r = expand({ recoAt: 120, carrierAt: 40 });
  eq([r.S.at_('EXEC_PAINTED'), r.S.at_('RECO_PAINTED')], [40, 120],
    'H2  carrier fast, Recommendation slow: the Execution Plan does NOT wait for the summary either');
  eq(r.S.count('ROUTE_PAINTED'), 1, 'H2a and it is still built exactly once, from a settled catalogue');
})();
(function () {
  var r = expand({ recoAt: 60, carrierAt: 60 });
  eq([r.S.at_('RECO_PAINTED@1'), r.S.at_('EXEC_PAINTED@1')], [60, 60],
    'H3  when they DO settle together they still appear together — coincidence, no longer a constraint');
  eq([r.reco.frameCount(), r.exec.frameCount()], [1, 1], 'H3a §H.20 exactly ONE render frame per panel');
})();

// ================================================================================================================
section('§H.4 — A LEGITIMATE ZERO IS DATA');
// ================================================================================================================
(function () {
  // RESTATED from a source-substring claim: 'gap' is legitimately present in this owner (GAP_READ_ERROR),
  // so that probe would have failed for the right reason and passed for the wrong one. The claim that
  // actually matters is INVARIANCE — a readiness verdict must not move because a quantity is 0. Executed.
  var bare = R.recommendationReadiness({ mode: 'materialized', status: 'READY' });
  var withZeros = R.recommendationReadiness({ mode: 'materialized', status: 'READY',
    rows: [{ d18_gap_qty: 0, d90_suggested_qty: 0 }], total: 0, suggestedQty: 0, gapQty: 0 });
  var withValues = R.recommendationReadiness({ mode: 'materialized', status: 'READY',
    rows: [{ d18_gap_qty: 900, d90_suggested_qty: 800 }], total: 800, suggestedQty: 800, gapQty: 900 });
  eq([withZeros, withValues], [bare, bare],
    'H4  §C the recommendation readiness verdict is invariant to every quantity — a 0 cannot make it EMPTY');
  // And the shipped value path preserves a stored 0 end to end.
  var matNum = new Function('return ' + extractFn(PAGE, '_irMatNum').replace('function _irMatNum', 'function') + ';')();
  eq([matNum(0), matNum(''), matNum(null), matNum(undefined), matNum(5)], [0, null, null, null, 5],
    'H4a a stored 0 survives as 0; only genuinely absent values become null');
  var sq = new Function('_irUseMaterializedGapRead', '_irMatState', '_irMatNum', '_irRecommendationWorkspaceEnabled',
    '_irRecoLinesForSku', '_irAggregateActionableRecommendedQty',
    extractFn(PAGE, '_irSuggestedQtyState_') + ' return _irSuggestedQtyState_;')(
      function () { return true; },
      { status: 'READY', bySku: { 'CO1100-R': { calculation_status: 'READY', d90_suggested_qty: 0 } } },
      matNum, function () { return false; }, function () { return null; }, function () { return { total: 0, actionableCount: 0 }; });
  eq(sq({ sku: 'CO1100-R' }), { state: 'READY', value: 0 }, 'H4b a stored suggested qty of 0 is READY with the value 0 — not EMPTY, not NONE');
})();

// ================================================================================================================
section('§H.5–§H.7 — WHAT "READY" HAS TO COVER');
// ================================================================================================================
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }).state, 'LOADING',
  'H5  a SKU whose panel holds routes still waits for its pickers and catalogue');
(function () {
  // RESTATED (F1-7N-FC-1B-E1): this executed the SEEDER and asserted that a SKU with no persisted draft still
  // PAINTS one route — "the default editor is a route". E1 removes that route, because a recommendation
  // of 0 was never a route and neither was a recommendation of 520.
  //
  // The invariant this pair protects is that a canonical ZERO is not mistaken for "no data" and not turned
  // into a refusal to render. It holds and is measured here in its new form: no route is painted, the EMPTY
  // STATE is shown exactly once, and the panel neither hangs nor errors. (The 0-prints-as-0 half lives with
  // the Suggested Qty cell, in the FB-4G-A0 suite's G12/G13.)
  var S = Sched();
  var init = makeInit(S, { draftRows: function () { return null; }, suggested: function () { return 0; }, carrierAt: 0 });
  init('CO1100-R', { sku: 'CO1100-R' }, { catalogueSettled: true });
  S.run();
  eq([S.count('ROUTE_PAINTED'), S.count('EXEC_EMPTY_STATE_SHOWN'), S.count('TOTAL_UPDATED') > 0], [0, 1, true],
    'H5a a zero recommendation paints NO route, shows the empty state once, and still updates the total');
})();
(function () {
  var seen = null;
  var r = expand({ recoAt: 30, carrierAt: 90, onReveal: function (snap) { seen = snap; } });
  eq(r.S.at_('ROUTE_METHOD=sea') != null && r.S.at_('ROUTE_QTY=800') != null, true,
    'H6  the persisted H4 route reaches its FIRST paint already carrying sea (普船海卡) and 800');
  eq(r.S.at_('ROUTE_PAINTED'), 90, 'H6a in the reveal frame — never before the catalogue that resolves its label');
  eq(seen.readiness.state, 'READY', 'H6b with the Execution Plan\'s own readiness terminal at that moment');
})();
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: true }).state, 'READY',
  'H7  §C a lead time nobody configured is an UNAVAILABLE terminal answer — the catalogue answered, so execution is READY');

// ================================================================================================================
section('§H.8–§H.9 — A SETTLED FAILURE IS AN ANSWER');
// ================================================================================================================
// F1-7N-FB-4G-A1-R1 - RESTATED for the same reason as H1-H3: a settled ERROR is an ANSWER, so it is shown at
// the moment it settles rather than at the moment the other panel does. What A1 established - a failure is
// stated and named, and the page never stays a skeleton - is unchanged.
(function () {
  var r = expand({ recoAt: 20, carrierAt: 70, recoInput: { mode: 'materialized', status: 'READ_ERROR', error: { code: 'READ_FAILED', message: 'gap read failed' } } });
  eq(r.S.at_('RECO_PAINTED'), 20, 'H8  a Recommendation ERROR is shown when it SETTLES, not when its neighbour does');
  eq([r.S.at_('REVEAL_RECO=ERROR') != null, r.S.at_('REVEAL_EXEC=READY') != null], [true, true],
    'H8a and each panel shows its own outcome — a typed error beside a real plan, never a permanent skeleton');
})();
(function () {
  var r = expand({ recoAt: 20, carrierAt: 70, execInput: { readModelReady: true, hydrationInFlight: false, catalogue: 'ERROR', error: { code: 'METHOD_REGISTRY_READ_FAILED', message: 'x' }, hasRoutes: true } });
  eq([r.S.at_('REVEAL_RECO=READY') != null, r.S.at_('REVEAL_EXEC=ERROR') != null], [true, true],
    'H9  an Execution ERROR is named rather than blank, beside a successful summary');
  eq([r.reco.frameCount(), r.exec.frameCount()], [1, 1], 'H9a one frame each — an error is not a reason to paint twice');
})();

// ================================================================================================================
section('§H.10–§H.12 — STALE GENERATIONS CANNOT PAINT');
// ================================================================================================================
(function () {
  var gate = R.createPanelGate({ name: 'reco', frame: function (cb) { cb(); }, onReveal: function (s) { revealed.push(s.sku); } });
  var revealed = [];
  var g1 = gate.begin({ sku: 'SKU-A', scopeKey: 's' });
  var g2 = gate.begin({ sku: 'SKU-B', scopeKey: 's' });      // the user switched SKU
  var late = gate.report(g1, { state: 'READY' }, { sku: 'SKU-A' });
  eq(late, { accepted: false, reason: 'STALE_GENERATION' }, 'H10 a response for the PREVIOUS sku is refused by generation');
  gate.report(g2, { state: 'READY' }, null);
  eq(revealed, ['SKU-B'], 'H10a and only the sku actually open is ever painted');
})();
(function () {
  var gate = R.createPanelGate({ name: 'reco', frame: function (cb) { cb(); }, onReveal: function () { painted++; } });
  var painted = 0;
  var g = gate.begin({ sku: 'CO1100-R', scopeKey: 'resus|us|amazon' });
  var res = gate.report(g, { state: 'READY' }, { sku: 'CO1100-R', scopeKey: 'restw|jp|amazon' });
  eq(res, { accepted: false, reason: 'STALE_SCOPE' }, 'H11 a response from a station the user has left is refused by scope');
  eq(painted, 0, 'H11a so a re-Search cannot be painted over by the previous station');
})();
(function () {
  var gate = R.createPanelGate({ name: 'exec', frame: function (cb) { cb(); }, onReveal: function () { painted++; } });
  var painted = 0;
  var g = gate.begin({ sku: 'CO1100-R', scopeKey: 's' });
  gate.abandon();                                            // the user collapsed the row
  var res = gate.report(g, { state: 'READY' }, null);
  eq(res, { accepted: false, reason: 'ABANDONED' }, 'H12 after a collapse a late response has no generation to land in');
  eq([painted, gate.snapshot()], [0, null], 'H12a and nothing re-opens the row the user closed');
})();
(function () {
  // The same defence when the collapse happens BETWEEN settling and the frame that paints.
  var deferred = null, painted = 0;
  var gate = R.createPanelGate({ name: 'exec', frame: function (cb) { deferred = cb; }, onReveal: function () { painted++; } });
  var g = gate.begin({ sku: 'CO1100-R', scopeKey: 's' });
  gate.report(g, { state: 'READY' }, null);
  gate.abandon();
  deferred();
  eq(painted, 0, 'H12b a reveal already scheduled is dropped if the row is collapsed before its frame runs');
})();

// ================================================================================================================
section('§E / §H.13–§H.17 — THE PERFORMANCE CONTRACT, ON THE SHIPPED REGISTRY');
// ================================================================================================================
var ASYNC = [];
ASYNC.push((function () {
  var reads = 0;
  var reg = MR.create({ read: function () { reads++; return Promise.resolve({ success: true, data: {} }); },
    adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
  var SC = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
  var chain = Promise.resolve();
  for (var i = 0; i < 20; i++) chain = chain.then(function () { return reg.ensureLoaded(SC); });
  return chain.then(function () {
    eq([reads, reg.requestCount()], [1, 1], 'H13 twenty expands on a warm scope cost ZERO extra requests (cache hit)');
    eq(R.createPanelGate({}).snapshot(), null, 'H13a and a barrier itself holds no request of any kind');
  });
})());
ASYNC.push((function () {
  var reads = 0;
  var reg = MR.create({ read: function () { reads++; return new Promise(function (r) { setTimeout(function () { r({ success: true, data: {} }); }, 1); }); },
    adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
  var SC = { company: 'ResUS', country: 'US', marketplace: 'Amazon' };
  var ps = []; for (var k = 0; k < 20; k++) ps.push(reg.ensureLoaded(SC));
  return Promise.all(ps).then(function () {
    eq([reads, reg.requestCount()], [1, 1], 'H15 twenty CONCURRENT cold expands share ONE catalogue request — never N+1');
  });
})());
ok(/_irLoadCarrierPlanning_\(\)\.then/.test(code(extractFn(PAGE, '_irRevealBegin_'))),
  'H14 the barrier calls the SAME deduped per-scope loader Search calls — it introduces no new endpoint');
ok(!/KM\.api|getWorkspace|fetch|XMLHttpRequest|getInventoryReplenishmentGap/.test(
    code(extractFn(PAGE, '_irRevealBegin_')) + code(extractFn(PAGE, '_irRevealPumpReco_')) +
    code(extractFn(PAGE, '_irRevealPumpExec_')) + code(extractFn(PAGE, '_irRecoRevealPaint_')) +
    code(extractFn(PAGE, '_irExecRevealPaint_'))),
  'H14a §E.3 nothing in either barrier issues a request of its own — not one new round trip');
ok(!/refreshCacheTables|_irWorkspaceRefresh_|_hydrateAllocationDraftFromDb/.test(
    code(extractFn(PAGE, '_irRevealBegin_')) + code(extractFn(PAGE, '_irRevealPumpReco_')) + code(extractFn(PAGE, '_irRevealPumpExec_'))),
  'H16 §E.5 the barrier never re-runs the allocation hydrate — it only observes the one Search already ran');
(function () {
  var barrier = code(extractFn(PAGE, '_irRevealBegin_')) + code(extractFn(PAGE, '_irRevealPumpReco_')) +
    code(extractFn(PAGE, '_irRevealPumpExec_')) + code(extractFn(PAGE, '_irRecoRevealPaint_')) +
    code(extractFn(PAGE, '_irExecRevealPaint_')) + code(extractFn(PAGE, '_irRevealFrame_')) +
    code(extractFn(CMPSRC, 'createPanelGate'));
  ok(!/setTimeout|setInterval|requestIdleCallback|while\s*\(/.test(barrier),
    'H17 §D.3 no timer, no interval, no polling loop anywhere in the barrier');
  ok(!/await\s/.test(barrier), 'H17a and no sequential await — the two sources are never chained');
  ok(/requestAnimationFrame/.test(code(extractFn(PAGE, '_irRevealFrame_'))),
    'H17b the reveal is scheduled on a render frame, which is what makes it ONE paint');
})();
(function () {
  // §E.6 — reveal time IS max(recommendation, execution). Asserted across an ordering matrix, not once.
  // F1-7N-FB-4G-A1-R1 - RESTATED, and the guarantee got STRONGER. A1's max() was the best a joint barrier can
  // do; per panel the bound is each panel's OWN ready time, which is never later and is usually earlier.
  var cases = [[10, 200], [200, 10], [77, 77], [0, 0], [5, 6], [40, 60000]];
  var okAll = cases.every(function (c) {
    var r = expand({ recoAt: c[0], carrierAt: c[1] });
    return r.S.at_('RECO_PAINTED') === c[0] && r.S.at_('EXEC_PAINTED') === c[1];
  });
  ok(okAll, 'E6  each panel is revealed at its OWN readyAt + one frame, in every ordering — never max() of the pair');
})();
(function () {
  var r = expand({ recoAt: 0, carrierAt: 0 });
  eq([r.S.at_('RECO_PAINTED'), r.S.at_('EXEC_PAINTED')], [0, 0],
    'E10 a fully warm scope reveals both in the SAME frame the panel was inserted — no barrier defeats a cache');
  ok(r.S.at_('SKELETON_IN_DOM') === 0,
    'E7  the skeletons are in the first frame\'s markup and are replaced inside that frame — present, never lingering');
})();

// ================================================================================================================
section('§H.18–§H.19 / §F — WHAT THE SHELL SHOWS AND WHAT IT REFUSES');
// ================================================================================================================
(function () {
  var esc = function (v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
  var f = new Function('escapeReplenHtml', '_irRevealExecSkeletonHtml_',
    extractFn(PAGE, '_irExecPlanCardInnerHtml_') + ' return _irExecPlanCardInnerHtml_;')(esc, function () { return '<div class="ir-skel ir-skel--routes"></div>'; });
  var pending = f('CO1100-R', false), ready = f('CO1100-R', true);
  ok(/ir-skel--routes/.test(pending), 'F1  the pending Execution Plan shows a route-row-shaped skeleton');
  ok(/disabled/.test(pending) && !/addExecutionRoute/.test(pending), 'H18 + Add Route is DISABLED and unwired while the panel is a shell');
  ok(/addExecutionRoute/.test(ready) && !/disabled/.test(ready), 'H18a and fully operable once revealed');
  ok(!/Loading methods/.test(pending), 'F2  §F no "Loading methods…" select is ever shown');
  ok(!/<select/.test(pending) && !/<input/.test(pending), 'F2a and no half-built route controls at all — nothing to mis-edit');
  ok(!/allocation-total-/.test(pending) && /allocation-total-CO1100-R">0</.test(ready),
    'F3  §F the Total is not shown as a fabricated 0 while loading — it appears with the routes it totals');
  ok(/exec-routes-list/.test(ready) && !/exec-routes-list/.test(pending),
    'F3a the routes container itself only exists once there are correct routes to put in it');
})();
(function () {
  var f = new Function('_irRevealRecoSkeletonHtml_', '_irRevealExecSkeletonHtml_', '_irExecPlanCardInnerHtml_',
    extractFn(PAGE, '_irDecisionAreaHtml_') + ' return _irDecisionAreaHtml_;')(
      function () { return '<div class="ir-skel ir-skel--table"></div>'; },
      function () { return '<div class="ir-skel ir-skel--routes"></div>'; },
      function (sku, ready) { return ready ? 'READY' : '<div class="ir-skel ir-skel--routes"></div>'; });
  var html = f('CO1100-R');
  ok(/data-reveal-state="pending"/.test(html), 'F4  the decision area declares its pending state in the first frame');
  ok(/ir-skel--table/.test(html) && /ir-skel--routes/.test(html), 'F5  §F BOTH panels show their own content-shaped skeleton immediately');
  ok(/recommendation-summary-CO1100-R/.test(html) && /execution-plan-CO1100-R/.test(html),
    'F6  and both keep their canonical ids, so every existing owner still finds them');
})();
// F1-7N-FB-4G-A1-R1 - RESTATED for the shape, not the claim: the panels are SIBLING reveal containers now
// (deliberately, so no rule can re-couple them), so each reserves its own height under its own selector.
ok(/\[data-ir-reveal="recommendation"\]\[data-reveal-state="pending"\][^{]*\{[^}]*min-height/.test(CSS),
  'F7  §F the pending Recommendation Summary reserves a base height — the reveal cannot become a layout jump');
ok(/\[data-ir-reveal="execution"\]\[data-reveal-state="pending"\][^{]*\{[^}]*min-height/.test(CSS),
  'F7a §F and so does the pending Execution Plan, under its own selector');
ok(/prefers-reduced-motion/.test(CSS), 'F8  the shimmer is disabled under prefers-reduced-motion');
ok(/ir-reveal__error/.test(CSS) && /role="alert"/.test(code(extractFn(PAGE, '_irRevealErrorHtml_'))),
  'H19 a settled failure is rendered as a named alert — EMPTY/ERROR never leave a permanent skeleton');
ok(/data-reveal-state="pending"/.test(code(extractFn(PAGE, '_irRevealSyncActionAvailability_'))) &&
   /submitReplenishmentPlans/.test(code(extractFn(PAGE, '_irRevealSyncActionAvailability_'))),
  'H18b §F Submit Plan is disabled while any decision area on screen is still a shell');

// ================================================================================================================
section('§H.20 / §D.4 — ONE RENDER TRANSACTION, AND NOTHING PAINTS AROUND IT');
// ================================================================================================================
// F1-7N-FB-4G-A1-R1 - RESTATED. A1's H20 asserted that ONE terminal side schedules NO frame, which is the
// coupling stated as a guarantee. The durable half - a panel is revealed exactly once per generation, and a
// later report cannot paint it again - is what remains, asserted per panel.
(function () {
  var frames = [];
  var gate = R.createPanelGate({ name: 'reco', frame: function (cb) { frames.push(cb); }, onReveal: function (s) { seen.push(s); } });
  var seen = [];
  var g = gate.begin({ sku: 'CO1100-R', scopeKey: 's' });
  eq(frames.length, 0, 'H20 a LOADING panel schedules no frame');
  gate.report(g, { state: 'EMPTY' }, null);
  eq(frames.length, 1, 'H20a its own terminal state schedules exactly one — it does not consult any other panel');
  frames[0]();
  eq([seen.length, seen[0].frameId], [1, 1], 'H20b one callback, one frame id');
  gate.report(g, { state: 'READY' }, null);
  eq([frames.length, seen.length], [1, 1], 'H20c and a later report cannot schedule a second reveal of the same generation');
})();
ok(/data-reveal-state'\)\s*===\s*'pending'\)\s*return;/.test(code(PAGE)),
  'D4  §D.4 the recommendation re-render REFUSES a card still behind the barrier — no early half-reveal');
ok(/onReveal\(snapshot\(\)\)/.test(code(extractFn(CMPSRC, 'createPanelGate'))) &&
   (code(extractFn(CMPSRC, 'createPanelGate')).match(/onReveal\(/g) || []).length === 1,
  'D4a a panel gate has exactly ONE reveal call site — a second would be a second transaction for that panel');

// ================================================================================================================
section('§D / §G — WHAT IS NOT BEHIND THE BARRIER, AND WHAT DID NOT MOVE');
// ================================================================================================================
(function () {
  var toggle = code(extractFn(PAGE, 'toggleReplenRow'));
  ok(/initSalesTrendChart/.test(toggle) && !/initSalesTrendChart/.test(code(extractFn(PAGE, '_irExecRevealPaint_')) + code(extractFn(PAGE, '_irRecoRevealPaint_'))),
    'D2  §D Sales Trend is behind NEITHER barrier — it keeps its own path and is not delayed by either');
  ok(/replen-card--stock/.test(PAGE) && !/replen-card--stock/.test(code(extractFn(PAGE, '_irDecisionAreaHtml_'))),
    'D2a Stock / Forecast / Upcoming Event are outside the reveal container entirely');
  ok(!/initializeShippingAllocation\(sku, skuData\);/.test(toggle),
    'D3  the expand tick no longer seeds the Execution Plan — the barrier owns that, and starts synchronously');
  ok(/_irRevealBegin_\(sku\)/.test(toggle), 'D3a the generation opens in the same synchronous pass as the panel insert');
  ok(/_irRevealAbandon_\(\)/.test(toggle), 'D7  §D.7 every collapse pass abandons the open generation');
})();
ok(/_irRevealAbandon_/.test(code(extractFn(PAGE, 'renderReplenishment'))),
  'D6  §D.6 a table re-render (a new Search included) abandons any pending reveal with the panels it destroys');
(function () {
  // §G — nothing about identity, quantity or persistence moved this round.
  var g = code(PAGE);
  ok(/data-method-persisted/.test(g) && /IRService/.test(g), 'G1  the persisted-method carrier and the canonical service identity are untouched');
  ok(/destinationIdentity/.test(CMPC), 'G2  the destination XOR authority is untouched');
  ok(/data-eta-persisted/.test(g), 'G3  the expected_arrival persistence policy is untouched');
  ok(!/destination_warehouse_code_snapshot/.test(code(extractFn(CMPSRC, 'executionReadiness')) + code(extractFn(CMPSRC, 'recommendationReadiness'))),
    'G4  and no readiness rule reads a legacy snapshot — the A0-R2 closure is not reopened');
})();
eq(CMP.IRWarehouse.destinationIdentity({ destination_warehouse_id: 'WH-1', destination_marketplace: 'Amazon' }).code,
  'ROUTE_DESTINATION_AMBIGUOUS', 'G5  a BOTH row is still refused — this round changed no business rule');
eq(CMP.IRService.canonical('美森海卡'), 'sea_express', 'G6  and sea / sea_express are still distinct services');

// ================================================================================================================
section('§I — DEPLOYMENT IDENTITY');
// ================================================================================================================
// F1-7N-FB-4G-A1-R1 - the tokens are DERIVED from the append-only series, not restated. A1 pinned its own
// literals, which stops being true the moment any later round legitimately rotates them - the
// equality-with-now shape this repository has restated six times. The durable claims are: the whole
// application set moves together, the stylesheet keeps its OWN family, and both are at or after A1.
var APP_TOKEN = RO.currentAppToken();
var CSS_TOKEN = (INDEX.match(/inventory-replenishment\.css\?v=([^"']+)/) || [])[1];
(function () {
  // RESTATED (F1-7N-FC-1A-R1-HF1): this was `=== 18`. The count is not the property — "rotated TOGETHER"
  // is — and the literal made a round that covers one more asset look like a half-updated deployment. Now
  // derived: no entry is left behind on a superseded application token. See _release-order.js staleAppTokenRefs.
  eq(RO.staleAppTokenRefs(INDEX).join(' | '), '',
    'I1  the co-deployed application refs rotated together (' + RO.appTokenRefCount(INDEX) +
    ' on ' + APP_TOKEN + ')');
  ok(RO.tokenAtOrAfter(APP_TOKEN, 'fb4ga1-atomicreveal-20260902'),
    'I1a and it is at or after the round that introduced the reveal owner');
  ok(!new RegExp('fb4ga0r2-destauthority').test(INDEX), 'I2  §I the already-published A0-R2 token is not reused for changed client code');
  ok(new RegExp('inventory-compat\\.js\\?v=' + APP_TOKEN).test(INDEX) &&
     new RegExp('inventory-replenishment\\.js\\?v=' + APP_TOKEN).test(INDEX),
    'I3  both changed page scripts carry it');
  ok(!!CSS_TOKEN && CSS_TOKEN !== APP_TOKEN && /^ir[a-z]+-\d{8}$/.test(CSS_TOKEN),
    'I4  §I the stylesheet is in its OWN token family (' + CSS_TOKEN + ') — never the JS app token');
  ok(!new RegExp('inventory-replenishment\\.css\\?v=' + APP_TOKEN).test(INDEX), 'I4a and the two families are not crossed');
  ok(RO.stampAtOrAfter && typeof RO.stampAtOrAfter === 'function', 'I5  the release-order helper is present');
})();
// I6 - THIS ROUND ADDS NOTHING TO THE APPS SCRIPT SYNC SET, stated durably. Deliberately NOT a working-tree
// diff: `git diff --name-only HEAD` is a statement about whoever edits the repository next, and two
// assertions in this very series had to be restated for exactly that reason. The durable form is that no
// deployed Apps Script file knows anything about this round.
(function () {
  var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
  var GS = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f); });
  var touched = GS.filter(function (f) {
    var src = fs.readFileSync(path.join(GS_DIR, f), 'utf8');
    return /F1-7N-FB-4G-A1|IRPlanningReveal|fb4ga1-atomicreveal|_irReveal/.test(src);
  });
  eq(touched, [], 'I6  no Apps Script file mentions this round, its owner or its token — nothing joins the sync set');
  var stamp = (fs.readFileSync(path.join(GS_DIR, '16_shipping_allocation_handlers.gs'), 'utf8')
    .match(/var SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1];
  ok(RO.stampAtOrAfter(stamp, 'F1-7N-FB-4G-A0-R2'),
    'I6a the allocation owner stamp is at or after A0-R2 and no presentation round has moved it (' + stamp + ')');
})();
ok(!/16_shipping_allocation_handlers|SAD_BUILD_VERSION_/.test(
    code(extractFn(PAGE, '_irRecoRevealPaint_')) + code(extractFn(PAGE, '_irExecRevealPaint_'))),
  'I6b and neither barrier touches a server surface — presentation only');

// ================================================================================================================
section('MUTATIONS — each applied for real, each caught');
// ================================================================================================================
function gateFrom(src) {
  var mod = new Function('var module = { exports: {} }; var window; ' + src + ' return module.exports;')();
  return mod.IRPlanningReveal;
}

mut('M1  the barrier is removed (a LOADING panel is revealed)', function () {
  var m = mutateFn(CMPSRC, 'createPanelGate', 'if (!revealIsTerminal(cur.readiness.state)) return;', '');
  var MR2 = gateFrom(m);
  function run(Rev) {
    var revealed = false;
    var gate = Rev.createPanelGate({ name: 'p', frame: function (cb) { cb(); }, now: function () { return 0; }, onReveal: function () { revealed = true; } });
    var g = gate.begin({ sku: 'X', scopeKey: 's' });
    gate.report(g, { state: 'LOADING' }, null);
    return revealed;
  }
  return run(R) === false && run(MR2) === true;
});

mut('M2  the two panels are re-coupled (one waits for the other)', function () {
  // The mutant withholds the Execution Plan's report until the Recommendation is terminal — a chained await
  // wearing a different hat, and precisely the shape A1 shipped.
  function run(coupled) {
    var S = Sched();
    var reco = R.createPanelGate({ name: 'reco', frame: function (cb) { S.at(S.now(), cb); }, now: S.now, onReveal: function () { S.mark('RECO'); } });
    var exec = R.createPanelGate({ name: 'exec', frame: function (cb) { S.at(S.now(), cb); }, now: S.now, onReveal: function () { S.mark('EXEC'); } });
    var g1 = reco.begin({ sku: 'X', scopeKey: 's' }), g2 = exec.begin({ sku: 'X', scopeKey: 's' });
    S.at(40, function () {
      if (coupled && reco.state() === 'LOADING') return;                        // MUTANT
      exec.report(g2, { state: 'READY' }, null);
    });
    S.at(120, function () { reco.report(g1, { state: 'READY' }, null); if (coupled) exec.report(g2, { state: 'READY' }, null); });
    S.run();
    return S.at_('EXEC');
  }
  return run(false) === 40 && run(true) === 120;
});

mut('M3  the generation token is ignored (a stale response paints)', function () {
  var m = mutateFn(CMPSRC, 'createPanelGate', "if (g !== cur.gen) return 'STALE_GENERATION';", '');
  var MR2 = gateFrom(m);
  function run(Rev) {
    var painted = [];
    var gate = Rev.createPanelGate({ name: 'p', frame: function (cb) { cb(); }, onReveal: function (s) { painted.push(s.sku); } });
    var g1 = gate.begin({ sku: 'SKU-A', scopeKey: 's' });
    gate.begin({ sku: 'SKU-B', scopeKey: 's' });
    gate.report(g1, { state: 'READY' }, null);
    return painted.length;
  }
  return run(R) === 0 && run(MR2) === 1;
});

mut('M4  a legitimate stored 0 is treated as EMPTY', function () {
  var m = mutateFn(PAGE, '_irMatNum', "if (v === '' || v === null || v === undefined) return null;",
    "if (v === '' || v === null || v === undefined || Number(v) === 0) return null;");
  var mutNum = new Function('return ' + extractFn(m, '_irMatNum').replace('function _irMatNum', 'function') + ';')();
  var honestNum = new Function('return ' + extractFn(PAGE, '_irMatNum').replace('function _irMatNum', 'function') + ';')();
  function state(numFn) {
    return new Function('_irUseMaterializedGapRead', '_irMatState', '_irMatNum', '_irRecommendationWorkspaceEnabled',
      '_irRecoLinesForSku', '_irAggregateActionableRecommendedQty',
      extractFn(PAGE, '_irSuggestedQtyState_') + ' return _irSuggestedQtyState_;')(
        function () { return true; },
        { status: 'READY', bySku: { S: { calculation_status: 'READY', d90_suggested_qty: 0 } } },
        numFn, function () { return false; }, function () { return null; }, function () { return { total: 0, actionableCount: 0 }; })({ sku: 'S' });
  }
  return state(honestNum).state === 'READY' && state(mutNum).state === 'NONE';
});

mut('M5  the route is rendered early (a LOADING catalogue counts as ready)', function () {
  var m = mutateFn(CMPSRC, 'executionReadiness', "if (cat !== 'READY') return mk(S.LOADING, '', null);", '');
  var MR2 = gateFrom(m);
  function run(Rev) {
    var S = Sched();
    var gate = Rev.createPanelGate({ name: 'exec', frame: function (cb) { S.at(S.now(), cb); }, now: S.now,
      onReveal: function (s) { S.mark('EXEC=' + s.readiness.state); } });
    var g = gate.begin({ sku: 'X', scopeKey: 's' });
    gate.report(g, Rev.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }), null);
    S.at(120, function () { gate.report(g, Rev.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: true }), null); });
    S.run();
    return { early: S.at_('EXEC=READY') };
  }
  // The mutant paints the plan at t=0 with the catalogue still in flight — the exact half-built route.
  return run(R).early === 120 && run(MR2).early === 0;
});

mut('M6  execution is marked READY before the method catalogue settles', function () {
  var m = mutateFn(CMPSRC, 'executionReadiness', "if (cat !== 'READY') return mk(S.LOADING, '', null);", '');
  var MR2 = gateFrom(m);
  var honest = R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }).state;
  var mutant = MR2.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }).state;
  return honest === 'LOADING' && mutant === 'READY';
});

mut('M7  a typed error is swallowed into EMPTY', function () {
  var m = mutateFn(CMPSRC, 'recommendationReadiness',
    "case 'READ_ERROR': return mk(S.ERROR, classifyReadFailure(input.error), input.error || { code: C.READ_FAILED });",
    "case 'READ_ERROR': return mk(S.EMPTY, '', null);");
  var MR2 = gateFrom(m);
  var h = R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'READ_FAILED' } });
  var x = MR2.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'READ_FAILED' } });
  return h.state === 'ERROR' && h.error && h.error.code === 'READ_FAILED' && x.state === 'EMPTY' && x.error === null;
});

mut('M8  a late response re-opens a collapsed row', function () {
  // The first defence a response arriving after a collapse meets is accept()'s ABANDONED branch. A gate
  // that instead RE-CREATES a generation for it is precisely a gate that re-opens the row the user closed.
  // (Mutating the frame guard away was a broken probe: it left `cur` null and threw, which is not a
  // detection. That path is covered by H12b and M3 instead.)
  var m = mutateFn(CMPSRC, 'createPanelGate', "if (!cur) return S.ABANDONED;", 'if (!cur) { gen = g; cur = blank(g, ctx || {}); }');
  var MR2 = gateFrom(m);
  function run(Rev) {
    var painted = 0;
    var gate = Rev.createPanelGate({ name: 'p', frame: function (cb) { cb(); }, onReveal: function () { painted++; } });
    var g = gate.begin({ sku: 'X', scopeKey: 's' });
    gate.abandon();                                   // the user collapsed the row
    gate.report(g, { state: 'READY' }, { sku: 'X' });
    return painted;
  }
  return run(R) === 0 && run(MR2) === 1;
});

mut('M9  the carrier catalogue is requested per expand instead of once per scope', function () {
  var MRSRC = read('assets/js/core/method-registry.js');
  var m = mutateFn(MRSRC, 'ensureLoaded', 'if (pending[key]) return pending[key];', '');
  var mod = new Function('var module = { exports: {} }; ' + m + ' return module.exports;')();
  function burst(factory) {
    var reads = 0;
    var reg = factory.create({ read: function () { reads++; return new Promise(function (r) { setTimeout(function () { r({ success: true, data: {} }); }, 1); }); },
      adapt: function () { return { getCarrierRateCards: [], getCarrierLeadTimes: [] }; } });
    var SC = { company: 'c', country: 'US', marketplace: 'Amazon' };
    for (var i = 0; i < 5; i++) reg.ensureLoaded(SC);
    return reads;
  }
  return burst(MR) === 1 && burst(mod) === 5;
});

mut('M10 a panel\'s reveal is split into two render transactions', function () {
  var m = mutateFn(CMPSRC, 'createPanelGate',
    'frame(function () {',
    'frame(function () { cur.frameId = ++frames; onReveal(snapshot()); });' + NLC + '      frame(function () {');
  var MR2 = gateFrom(m);
  function frames(Rev) {
    var n = 0;
    var gate = Rev.createPanelGate({ name: 'p', frame: function (cb) { n++; cb(); }, onReveal: function () {} });
    var g = gate.begin({ sku: 'X', scopeKey: 's' });
    gate.report(g, { state: 'READY' }, null);
    return n;
  }
  return frames(R) === 1 && frames(MR2) === 2;
});

// ================================================================================================================
// The two request-count checks are asynchronous. They are AWAITED, not given a timer and hoped for: a
// summary printed before an assertion runs is a green result that proved nothing.
Promise.all(ASYNC).then(function () {
  console.log('\n' + (fail ? 'FAILED' : 'PASSED') + ': ' + pass + ' passed, ' + fail + ' failed');
  console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
  process.exit(fail ? 1 : 0);
})['catch'](function (e) { console.error('SUITE ERROR: ' + (e && e.stack || e)); process.exit(1); });
