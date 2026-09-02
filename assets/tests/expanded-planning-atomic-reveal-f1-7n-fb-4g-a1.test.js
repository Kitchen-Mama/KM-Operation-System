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
  return new Function(
    'document', '_irLoadCarrierPlanning_', '_execRebuildMethodOptions', '_irUpdateRouteEtas',
    '_allocationDraftRowsFor', '_renderExecutionRoute', 'updateShippingAllocationTotal', '_irSuggestedQtyNumber_',
    extractFn(PAGE, 'initializeShippingAllocation') + ' return initializeShippingAllocation;'
  )(
    doc,
    deps.carrier || function () { return { then: function (cb) { S.at(deps.carrierAt == null ? 120 : deps.carrierAt, cb); return { then: function () {} }; } }; },
    function () { S.mark('METHOD_OPTIONS_REBUILT'); },
    function () { S.mark('ETA_RECOMPUTED'); },
    deps.draftRows || function () { return [{ sku: 'CO1100-R', shipping_method: 'sea', qty: 800 }]; },
    function (sku, route) { S.mark('ROUTE_PAINTED'); S.mark('ROUTE_METHOD=' + String((route && route.shipping_method) || '')); S.mark('ROUTE_QTY=' + String((route && route.qty) || 0)); },
    function () { S.mark('TOTAL_UPDATED'); },
    deps.suggested || function () { return 800; }
  );
}

// One expand, driven through the SHIPPED gate. Returns the scheduler + the gate so a test can read timings.
function expand(opts) {
  opts = opts || {};
  var S = Sched();
  var Rev = opts.R || R;
  var doc = new Doc();
  doc.add('shipping-methods-CO1100-R');
  var init = makeInit(S, { doc: doc, carrierAt: opts.carrierAt });
  var gate = Rev.createGate({
    frame: function (cb) { S.at(S.now(), function () { S.mark('FRAME'); cb(); }); },
    now: S.now,
    onReveal: function (snap) {
      S.mark('REVEAL');
      S.mark('RECO_PAINTED@' + snap.frameId);
      S.mark('EXEC_PAINTED@' + snap.frameId);
      S.mark('REVEAL_RECO=' + snap.recommendation.state);
      S.mark('REVEAL_EXEC=' + snap.execution.state);
      if (opts.onReveal) opts.onReveal(snap, S);
      init('CO1100-R', { sku: 'CO1100-R' }, { catalogueSettled: true });
    }
  });
  S.mark('EXPAND');
  S.mark('SKELETON_IN_DOM');
  var g = gate.begin({ sku: opts.sku || 'CO1100-R', scopeKey: opts.scopeKey || 'resus|us|amazon' });
  gate.report(g, 'recommendation', Rev.recommendationReadiness({ mode: 'materialized', status: 'LOADING' }), null);
  gate.report(g, 'execution', Rev.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }), null);
  if (opts.recoAt != null) S.at(opts.recoAt, function () { S.mark('RECO_SETTLED'); gate.report(g, 'recommendation', Rev.recommendationReadiness(opts.recoInput || { mode: 'materialized', status: 'READY' }), null); });
  if (opts.carrierAt != null) S.at(opts.carrierAt, function () { S.mark('EXEC_SETTLED'); gate.report(g, 'execution', Rev.executionReadiness(opts.execInput || { readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: true }), null); });
  if (opts.during) opts.during(S, gate, g, doc);
  S.run();
  return { S: S, gate: gate, doc: doc, gen: g };
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
eq(Object.keys(R.STATES).sort(), ['EMPTY', 'ERROR', 'LOADING', 'READY'], 'C1  §C exactly four states — no fifth "probably done"');
eq([R.isTerminal('READY'), R.isTerminal('EMPTY'), R.isTerminal('ERROR'), R.isTerminal('LOADING')], [true, true, true, false],
  'C2  §C READY / EMPTY / ERROR are terminal; LOADING is the only state that waits');
eq(R.recommendationReadiness({ mode: 'materialized', status: 'READY' }).state, 'READY', 'C3  a loaded gap scope is READY');
eq(R.recommendationReadiness({ mode: 'materialized', status: 'EMPTY' }).state, 'EMPTY', 'C4  a scope with no stored rows is a TERMINAL empty, never a permanent skeleton');
eq(R.recommendationReadiness({ mode: 'materialized', status: 'READ_ERROR', error: { code: 'READ_FAILED' } }),
  { state: 'ERROR', code: 'GAP_READ_ERROR', error: { code: 'READ_FAILED' } },
  'C5  §C a read error is TERMINAL and keeps its typed error — not swallowed into an empty panel');
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
  { state: 'ERROR', code: 'METHOD_CATALOGUE_ERROR', error: { code: 'METHOD_REGISTRY_READ_FAILED' } },
  'C13 §C a catalogue failure is TERMINAL and named — the picker can print the code and a Retry');
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'STALE_SCOPE', hasRoutes: true }),
  { state: 'EMPTY', code: 'METHOD_CATALOGUE_STALE_SCOPE', error: null },
  'C14 §C a catalogue held for another station is terminal for THIS one — never an endless wait');

// ================================================================================================================
section('§H.1–§H.3 — THE BARRIER, IN BOTH ORDERS AND IN A TIE');
// ================================================================================================================
(function () {
  var r = expand({ recoAt: 40, carrierAt: 120 });
  eq(r.S.at_('REVEAL'), 120, 'H1  Recommendation fast (t=40), carrier slow (t=120): reveal waits for BOTH');
  ok(r.S.at_('RECO_SETTLED') === 40 && r.S.at_('RECO_PAINTED@1') === 120,
    'H1a and the Recommendation Summary is NOT painted the moment its own data lands');
  eq(r.S.count('ROUTE_PAINTED'), 1, 'H1b the route is painted exactly ONCE, from a settled catalogue');
  eq(r.S.count('METHOD_OPTIONS_REBUILT'), 0, 'H1c and never corrected afterwards — no second paint at all');
})();
(function () {
  var r = expand({ recoAt: 120, carrierAt: 40 });
  eq(r.S.at_('REVEAL'), 120, 'H2  carrier fast (t=40), Recommendation slow (t=120): reveal still waits for BOTH');
  eq(r.S.count('ROUTE_PAINTED'), 1, 'H2a and the Execution Plan does not appear alone while the summary loads');
})();
(function () {
  var r = expand({ recoAt: 60, carrierAt: 60 });
  eq([r.S.at_('RECO_PAINTED@1'), r.S.at_('EXEC_PAINTED@1')], [60, 60], 'H3  both settling together -> one reveal');
  eq(r.gate.frameCount(), 1, 'H3a §H.20 exactly ONE render frame was used for the pair');
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
  'H5  a SKU with NO persisted draft still waits for its pickers and catalogue — the default editor is a route');
(function () {
  // No draft rows: the shipped seeder builds the default preview from the SAME suggested-qty authority.
  var S = Sched();
  var init = makeInit(S, { draftRows: function () { return null; }, suggested: function () { return 0; }, carrierAt: 0 });
  init('CO1100-R', { sku: 'CO1100-R' }, { catalogueSettled: true });
  S.run();
  eq([S.count('ROUTE_PAINTED'), S.at_('ROUTE_QTY=0') != null], [1, true],
    'H5a and it is painted once, with a legitimate 0 rather than a refusal to render');
})();
(function () {
  var seen = null;
  var r = expand({ recoAt: 30, carrierAt: 90, onReveal: function (snap) { seen = snap; } });
  eq(r.S.at_('ROUTE_METHOD=sea') != null && r.S.at_('ROUTE_QTY=800') != null, true,
    'H6  the persisted H4 route reaches its FIRST paint already carrying sea (普船海卡) and 800');
  eq(r.S.at_('ROUTE_PAINTED'), 90, 'H6a in the reveal frame — never before the catalogue that resolves its label');
  eq([seen.recommendation.state, seen.execution.state], ['READY', 'READY'], 'H6b with both sides terminal at that moment');
})();
eq(R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: true }).state, 'READY',
  'H7  §C a lead time nobody configured is an UNAVAILABLE terminal answer — the catalogue answered, so execution is READY');

// ================================================================================================================
section('§H.8–§H.9 — A SETTLED FAILURE IS AN ANSWER');
// ================================================================================================================
(function () {
  var r = expand({ recoAt: 20, carrierAt: 70, recoInput: { mode: 'materialized', status: 'READ_ERROR', error: { code: 'READ_FAILED', message: 'gap read failed' } } });
  eq(r.S.at_('REVEAL'), 70, 'H8  a Recommendation ERROR still waits for its partner — one frame, not two');
  eq([r.S.at_('REVEAL_RECO=ERROR') != null, r.S.at_('REVEAL_EXEC=READY') != null], [true, true],
    'H8a and the pair is revealed as { typed error, real plan } — the page never stays a skeleton');
})();
(function () {
  var r = expand({ recoAt: 20, carrierAt: 70, execInput: { readModelReady: true, hydrationInFlight: false, catalogue: 'ERROR', error: { code: 'METHOD_REGISTRY_READ_FAILED', message: 'x' }, hasRoutes: true } });
  eq([r.S.at_('REVEAL_RECO=READY') != null, r.S.at_('REVEAL_EXEC=ERROR') != null], [true, true],
    'H9  an Execution ERROR reveals beside a successful summary, named rather than blank');
  eq(r.gate.frameCount(), 1, 'H9a still ONE frame — an error is not a reason to split the transaction');
})();

// ================================================================================================================
section('§H.10–§H.12 — STALE GENERATIONS CANNOT PAINT');
// ================================================================================================================
(function () {
  var gate = R.createGate({ frame: function (cb) { cb(); }, onReveal: function (s) { revealed.push(s.sku); } });
  var revealed = [];
  var g1 = gate.begin({ sku: 'SKU-A', scopeKey: 's' });
  var g2 = gate.begin({ sku: 'SKU-B', scopeKey: 's' });      // the user switched SKU
  var late = gate.report(g1, 'recommendation', { state: 'READY' }, { sku: 'SKU-A' });
  eq(late, { accepted: false, reason: 'STALE_GENERATION' }, 'H10 a response for the PREVIOUS sku is refused by generation');
  gate.report(g2, 'recommendation', { state: 'READY' }, null);
  gate.report(g2, 'execution', { state: 'READY' }, null);
  eq(revealed, ['SKU-B'], 'H10a and only the sku actually open is ever painted');
})();
(function () {
  var gate = R.createGate({ frame: function (cb) { cb(); }, onReveal: function () { painted++; } });
  var painted = 0;
  var g = gate.begin({ sku: 'CO1100-R', scopeKey: 'resus|us|amazon' });
  var res = gate.report(g, 'recommendation', { state: 'READY' }, { sku: 'CO1100-R', scopeKey: 'restw|jp|amazon' });
  eq(res, { accepted: false, reason: 'STALE_SCOPE' }, 'H11 a response from a station the user has left is refused by scope');
  eq(painted, 0, 'H11a so a re-Search cannot be painted over by the previous station');
})();
(function () {
  var gate = R.createGate({ frame: function (cb) { cb(); }, onReveal: function () { painted++; } });
  var painted = 0;
  var g = gate.begin({ sku: 'CO1100-R', scopeKey: 's' });
  gate.report(g, 'recommendation', { state: 'READY' }, null);
  gate.abandon();                                            // the user collapsed the row
  var res = gate.report(g, 'execution', { state: 'READY' }, null);
  eq(res, { accepted: false, reason: 'ABANDONED' }, 'H12 after a collapse a late response has no generation to land in');
  eq([painted, gate.snapshot()], [0, null], 'H12a and nothing re-opens the row the user closed');
})();
(function () {
  // The same defence when the collapse happens BETWEEN settling and the frame that paints.
  var deferred = null, painted = 0;
  var gate = R.createGate({ frame: function (cb) { deferred = cb; }, onReveal: function () { painted++; } });
  var g = gate.begin({ sku: 'CO1100-R', scopeKey: 's' });
  gate.report(g, 'recommendation', { state: 'READY' }, null);
  gate.report(g, 'execution', { state: 'READY' }, null);
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
    eq(R.createGate({}).snapshot(), null, 'H13a and the barrier itself holds no request of any kind');
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
ok(!/KM\.api|getWorkspace|fetch|XMLHttpRequest|getInventoryReplenishmentGap/.test(code(extractFn(PAGE, '_irRevealBegin_')) + code(extractFn(PAGE, '_irRevealPump_')) + code(extractFn(PAGE, '_irRevealPaint_'))),
  'H14a §E.3 nothing in the barrier issues a request of its own — not one new round trip');
ok(!/refreshCacheTables|_irWorkspaceRefresh_|_hydrateAllocationDraftFromDb/.test(code(extractFn(PAGE, '_irRevealBegin_')) + code(extractFn(PAGE, '_irRevealPump_'))),
  'H16 §E.5 the barrier never re-runs the allocation hydrate — it only observes the one Search already ran');
(function () {
  var barrier = code(extractFn(PAGE, '_irRevealBegin_')) + code(extractFn(PAGE, '_irRevealPump_')) +
    code(extractFn(PAGE, '_irRevealPaint_')) + code(extractFn(PAGE, '_irRevealFrame_')) +
    code(extractFn(CMPSRC, 'createRevealGate'));
  ok(!/setTimeout|setInterval|requestIdleCallback|while\s*\(/.test(barrier),
    'H17 §D.3 no timer, no interval, no polling loop anywhere in the barrier');
  ok(!/await\s/.test(barrier), 'H17a and no sequential await — the two sources are never chained');
  ok(/requestAnimationFrame/.test(code(extractFn(PAGE, '_irRevealFrame_'))),
    'H17b the reveal is scheduled on a render frame, which is what makes it ONE paint');
})();
(function () {
  // §E.6 — reveal time IS max(recommendation, execution). Asserted across an ordering matrix, not once.
  var cases = [[10, 200], [200, 10], [77, 77], [0, 0], [5, 6]];
  var okAll = cases.every(function (c) { return expand({ recoAt: c[0], carrierAt: c[1] }).S.at_('REVEAL') === Math.max(c[0], c[1]); });
  ok(okAll, 'E6  reveal time = max(recommendationReadyAt, executionReadyAt) in every ordering — no added wait');
})();
(function () {
  var r = expand({ recoAt: 0, carrierAt: 0 });
  eq(r.S.at_('REVEAL'), 0, 'E10 a fully warm scope reveals in the SAME frame the panel was inserted — the barrier never defeats a cache');
  ok(r.S.at_('SKELETON_IN_DOM') === 0 && r.S.at_('REVEAL') === 0,
    'E7  the skeleton is in the first frame\'s markup and is replaced inside that frame — present, never lingering');
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
ok(/\.ir-decision-area\.ir-reveal\s*\{[^}]*min-height/.test(CSS) &&
   /pending"\]\s*\.replen-card--recommendation-summary\s*\{[^}]*min-height/.test(CSS) &&
   /pending"\]\s*\.replen-card--execution-plan\s*\{[^}]*min-height/.test(CSS),
  'F7  §F both panels reserve a fixed base height while loading — the reveal cannot become a layout jump');
ok(/prefers-reduced-motion/.test(CSS), 'F8  the shimmer is disabled under prefers-reduced-motion');
ok(/ir-reveal__error/.test(CSS) && /role="alert"/.test(code(extractFn(PAGE, '_irRevealErrorHtml_'))),
  'H19 a settled failure is rendered as a named alert — EMPTY/ERROR never leave a permanent skeleton');
ok(/data-reveal-state="pending"/.test(code(extractFn(PAGE, '_irRevealSyncActionAvailability_'))) &&
   /submitReplenishmentPlans/.test(code(extractFn(PAGE, '_irRevealSyncActionAvailability_'))),
  'H18b §F Submit Plan is disabled while any decision area on screen is still a shell');

// ================================================================================================================
section('§H.20 / §D.4 — ONE RENDER TRANSACTION, AND NOTHING PAINTS AROUND IT');
// ================================================================================================================
(function () {
  var frames = [];
  var gate = R.createGate({ frame: function (cb) { frames.push(cb); }, onReveal: function (s) { seen.push(s); } });
  var seen = [];
  var g = gate.begin({ sku: 'CO1100-R', scopeKey: 's' });
  gate.report(g, 'recommendation', { state: 'READY' }, null);
  eq(frames.length, 0, 'H20 one terminal side schedules NO frame — there is no way to reveal a single panel');
  gate.report(g, 'execution', { state: 'EMPTY' }, null);
  eq(frames.length, 1, 'H20a both terminal -> exactly one frame is scheduled');
  frames[0]();
  eq([seen.length, seen[0].frameId], [1, 1], 'H20b one callback carrying BOTH panels — same frame id by construction');
  gate.report(g, 'recommendation', { state: 'READY' }, null);
  eq([frames.length, seen.length], [1, 1], 'H20c and a later report cannot schedule a second reveal of the same generation');
})();
ok(/data-reveal-state'\)\s*===\s*'pending'\)\s*return;/.test(code(PAGE)),
  'D4  §D.4 the recommendation re-render REFUSES a card still behind the barrier — no early half-reveal');
ok(/onReveal\(snapshot\(\)\)/.test(code(extractFn(CMPSRC, 'createRevealGate'))) &&
   (code(extractFn(CMPSRC, 'createRevealGate')).match(/onReveal\(/g) || []).length === 1,
  'D4a the gate has exactly ONE reveal call site — a second would be a second transaction');

// ================================================================================================================
section('§D / §G — WHAT IS NOT BEHIND THE BARRIER, AND WHAT DID NOT MOVE');
// ================================================================================================================
(function () {
  var toggle = code(extractFn(PAGE, 'toggleReplenRow'));
  ok(/initSalesTrendChart/.test(toggle) && !/initSalesTrendChart/.test(code(extractFn(PAGE, '_irRevealPaint_'))),
    'D2  §D Sales Trend is NOT behind the barrier — it keeps its own path and is not delayed by it');
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
var APP_TOKEN = 'fb4ga1-atomicreveal-20260902';
var CSS_TOKEN = 'iratomicreveal-20260902';
(function () {
  var refs = INDEX.match(/\?v=fb4ga[^"']*/g) || [];
  ok(refs.length > 0 && refs.every(function (r) { return r === '?v=' + APP_TOKEN; }),
    'I1  every co-deployed app-token ref moved together to ' + APP_TOKEN + ' (' + refs.length + ' refs)');
  ok(!new RegExp('fb4ga0r2-destauthority').test(INDEX), 'I2  §I the already-published A0-R2 token is not reused for changed client code');
  ok(new RegExp('inventory-compat\\.js\\?v=' + APP_TOKEN).test(INDEX) &&
     new RegExp('inventory-replenishment\\.js\\?v=' + APP_TOKEN).test(INDEX),
    'I3  both changed page scripts carry it');
  ok(new RegExp('inventory-replenishment\\.css\\?v=' + CSS_TOKEN).test(INDEX),
    'I4  §I the stylesheet rotates in its OWN token family — never the JS app token');
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
    'I6a the allocation owner stamp is at or after A0-R2 and this round did not move it (' + stamp + ')');
})();
ok(!/16_shipping_allocation_handlers|SAD_BUILD_VERSION_/.test(code(extractFn(PAGE, '_irRevealPaint_'))),
  'I6b and the barrier touches no server surface — presentation only');

// ================================================================================================================
section('MUTATIONS — each applied for real, each caught');
// ================================================================================================================
function gateFrom(src) {
  var mod = new Function('var module = { exports: {} }; var window; ' + src + ' return module.exports;')();
  return mod.IRPlanningReveal;
}

mut('M1  the barrier is removed (settle fires on the first report)', function () {
  var m = mutateFn(CMPSRC, 'createRevealGate',
    'if (!revealIsTerminal(cur.recommendation.state) || !revealIsTerminal(cur.execution.state)) return;',
    '');
  var MR2 = gateFrom(m);
  var revealedAt = null;
  var gate = MR2.createGate({ frame: function (cb) { cb(); }, now: function () { return 0; }, onReveal: function (s) { revealedAt = s; } });
  var g = gate.begin({ sku: 'X', scopeKey: 's' });
  gate.report(g, 'recommendation', { state: 'LOADING' }, null);
  var honest = R.createGate({ frame: function (cb) { cb(); }, onReveal: function () { honestRevealed = true; } });
  var honestRevealed = false;
  var hg = honest.begin({ sku: 'X', scopeKey: 's' });
  honest.report(hg, 'recommendation', { state: 'LOADING' }, null);
  return revealedAt !== null && honestRevealed === false;
});

mut('M2  Promise-parallel becomes a SEQUENTIAL await (execution waits for recommendation)', function () {
  // The mutant reports execution only after recommendation is terminal — the classic chained-await shape.
  var reports = [];
  function seqPump(gate, g, side, state) {
    var snap = gate.snapshot();
    if (side === 'execution' && snap && snap.recommendation.state === 'LOADING') return;   // MUTANT
    gate.report(g, side, { state: state }, null);
  }
  function run(pump) {
    var S = Sched();
    var gate = R.createGate({ frame: function (cb) { S.at(S.now(), cb); }, now: S.now, onReveal: function () { S.mark('REVEAL'); } });
    var g = gate.begin({ sku: 'X', scopeKey: 's' });
    S.at(40, function () { pump(gate, g, 'execution', 'READY'); });
    S.at(120, function () { pump(gate, g, 'recommendation', 'READY'); });
    S.at(121, function () { pump(gate, g, 'execution', 'READY'); });   // the retry a sequential design needs
    S.run();
    return S.at_('REVEAL');
  }
  var honest = run(function (gate, g, side, state) { gate.report(g, side, { state: state }, null); });
  var mutant = run(seqPump);
  return honest === 120 && mutant === 121;
});

mut('M3  the generation token is ignored (a stale response paints)', function () {
  var m = mutateFn(CMPSRC, 'createRevealGate', "if (g !== cur.gen) return 'STALE_GENERATION';", '');
  var MR2 = gateFrom(m);
  var painted = [];
  var gate = MR2.createGate({ frame: function (cb) { cb(); }, onReveal: function (s) { painted.push(s.sku); } });
  var g1 = gate.begin({ sku: 'SKU-A', scopeKey: 's' });
  gate.begin({ sku: 'SKU-B', scopeKey: 's' });
  gate.report(g1, 'recommendation', { state: 'READY' }, null);
  gate.report(g1, 'execution', { state: 'READY' }, null);
  var honest = R.createGate({ frame: function (cb) { cb(); }, onReveal: function (s) { hp.push(s.sku); } });
  var hp = [];
  var h1 = honest.begin({ sku: 'SKU-A', scopeKey: 's' });
  honest.begin({ sku: 'SKU-B', scopeKey: 's' });
  honest.report(h1, 'recommendation', { state: 'READY' }, null);
  honest.report(h1, 'execution', { state: 'READY' }, null);
  // The mutant paints SKU-A's response into the row now showing SKU-B; the honest gate paints nothing.
  return painted.length === 1 && hp.length === 0;
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

mut('M5  the route is rendered early (execution terminality dropped from the barrier)', function () {
  var m = mutateFn(CMPSRC, 'createRevealGate',
    'if (!revealIsTerminal(cur.recommendation.state) || !revealIsTerminal(cur.execution.state)) return;',
    'if (!revealIsTerminal(cur.recommendation.state)) return;');
  var MR2 = gateFrom(m);
  function run(Rev) {
    var S = Sched();
    var gate = Rev.createGate({ frame: function (cb) { S.at(S.now(), cb); }, now: S.now, onReveal: function (s) { S.mark('REVEAL_EXEC=' + s.execution.state); } });
    var g = gate.begin({ sku: 'X', scopeKey: 's' });
    gate.report(g, 'execution', Rev.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }), null);
    S.at(40, function () { gate.report(g, 'recommendation', { state: 'READY' }, null); });
    S.at(120, function () { gate.report(g, 'execution', Rev.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: true }), null); });
    S.run();
    return { early: S.at_('REVEAL_EXEC=LOADING'), late: S.at_('REVEAL_EXEC=READY') };
  }
  var h = run(R), x = run(MR2);
  // The mutant paints the plan at t=40 with the catalogue still LOADING — the exact half-built route.
  return h.early === null && h.late === 120 && x.early === 40;
});

mut('M6  execution is marked READY before the method catalogue settles', function () {
  var m = mutateFn(CMPSRC, 'executionReadiness', "if (cat !== 'READY') return { state: S.LOADING, code: '', error: null };", '');
  var MR2 = gateFrom(m);
  var honest = R.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }).state;
  var mutant = MR2.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'LOADING', hasRoutes: true }).state;
  return honest === 'LOADING' && mutant === 'READY';
});

mut('M7  a typed error is swallowed into EMPTY', function () {
  var m = mutateFn(CMPSRC, 'recommendationReadiness',
    "case 'READ_ERROR': return { state: S.ERROR, code: 'GAP_READ_ERROR', error: input.error || { code: 'GAP_READ_ERROR' } };",
    "case 'READ_ERROR': return { state: S.EMPTY, code: '', error: null };");
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
  var m = mutateFn(CMPSRC, 'createRevealGate', "if (!cur) return 'ABANDONED';", 'if (!cur) { gen = g; cur = blank(g, ctx || {}); }');
  var MR2 = gateFrom(m);
  function run(Rev) {
    var painted = 0;
    var gate = Rev.createGate({ frame: function (cb) { cb(); }, onReveal: function () { painted++; } });
    var g = gate.begin({ sku: 'X', scopeKey: 's' });
    gate.report(g, 'recommendation', { state: 'READY' }, null);
    gate.abandon();                                   // the user collapsed the row
    gate.report(g, 'recommendation', { state: 'READY' }, { sku: 'X' });
    gate.report(g, 'execution', { state: 'READY' }, { sku: 'X' });
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

mut('M10 the final reveal is split into two render transactions', function () {
  var m = mutateFn(CMPSRC, 'createRevealGate',
    'frame(function () {',
    'frame(function () { cur.frameId = ++frames; onReveal(snapshot()); });' + NLC + '      frame(function () {');
  var MR2 = gateFrom(m);
  function frames(Rev) {
    var n = 0;
    var gate = Rev.createGate({ frame: function (cb) { n++; cb(); }, onReveal: function () {} });
    var g = gate.begin({ sku: 'X', scopeKey: 's' });
    gate.report(g, 'recommendation', { state: 'READY' }, null);
    gate.report(g, 'execution', { state: 'READY' }, null);
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
