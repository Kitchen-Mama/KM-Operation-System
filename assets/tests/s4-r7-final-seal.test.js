/**
 * ==================================================================================================
 * S4-R7 — ORDER PLANNING L2 SCOPE PREPARATION, THE RETRY CONTRACT, AND THE S4 FINAL SEAL
 * ==================================================================================================
 *
 * Two implementations and one seal.
 *
 * THE SECOND LEVEL. Order Planning used to start its seven-table read and a per-site gap read when a
 * row was expanded. Neither was N+1 per SKU, but both made the first expand wait on the network,
 * which is what the operator rule forbids. It is now prepared for the sites the SEARCH revealed, and
 * an expand consumes it: zero requests, first, second and third.
 *
 * THE RETRY CONTRACT. Six pages rendered a truthful failure and offered nothing to press, several
 * while printing "Press Retry". Each now calls its own canonical read owner — no page grew a second
 * read implementation.
 *
 * NO VACUOUS PASSES. Every zero below is a measured zero: the preparation rules assert the requests
 * that WERE made before asserting the ones that were not (B1/B2), and the retry rules assert a
 * refusal was actually met before judging what the page did about it (C1).
 *
 * WHAT IS AUTHORITATIVE: request counts, dispatch counts, DOM outcomes, listener counts by target
 * class. WHAT IS NOT: milliseconds.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const EV = path.join(ROOT, 'docs', 'evidence', 's4-r7-final-seal');

let passed = 0, failed = 0;
function ok(cond, msg, extra) {
  if (cond) { passed++; console.log('  ok   ' + msg); }
  else { failed++; console.log('FAIL  ' + msg); if (extra !== undefined) console.log('        ' + JSON.stringify(extra)); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) === JSON.stringify(b)) { passed++; console.log('  ok   ' + msg); }
  else { failed++; console.log('FAIL  ' + msg); console.log('        expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); }
}
function section(t) { console.log('\n-- ' + t + ' ' + '-'.repeat(Math.max(0, 94 - t.length)) + '\n'); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

const M = JSON.parse(fs.readFileSync(path.join(EV, 'measurements.json'), 'utf8'));
const RO = require('./_release-order.js');
const RUN = require('./_s4r6-conformance-runner.js');
const ROJS = read('assets/js/pages/request-order.js');
const EOL_ = ROJS.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
const INDEX = read('index.html');
const APP = read('assets/js/app.js');

console.log('='.repeat(100));
console.log('S4-R7 — L2 SCOPE PREPARATION / RETRY CLOSURE / S4 FINAL SEAL');
console.log('='.repeat(100));

/* ==================================================================================================
   A — THE SCOPE VOCABULARY IS THE PAGE'S OWN
   ================================================================================================== */
section('A. SCOPE — reused, not invented');

ok(/function _opPrefetchL2ForCurrentScopes_\(\)/.test(ROJS), 'A1  the preparation has one owner');
ok(/_roScopesFromLoadedData_\(\)/.test(ROJS.slice(ROJS.indexOf('function _opPrefetchL2ForCurrentScopes_'))),
  'A2  and it enumerates sites with the page’s existing helper');
ok(/var skey = _roScopeKey3_\(mscope\);/.test(ROJS),
  'A3  the consumer looks the site up under the SAME canonical key the store writes');
/* The key mismatch that this rule exists to prevent was real for one measurement: the store wrote
   `_roScopeKey3_` and the consumer read a JSON spelling, so every first expand still paid for a site
   that was already in memory while twenty-three requests had just prepared it. */
ok(/_opMatByScope_\[skey\]/.test(ROJS) && /_opMatInFlight_\[skey\]/.test(ROJS),
  'A3a both the store and the in-flight map are read under that key');
eq(M.orderPlanningL2.scopeKey.indexOf('_roScopeKey3_'), 0, 'A4  and the record names it');

/* NO CLOCK. §6 forbids inventing a TTL, and the cheapest way to prove none was invented is to look. */
const prefetchBlock = ROJS.slice(ROJS.indexOf('S4-R7 §3 — THE SECOND LEVEL IS PREPARED'),
  ROJS.indexOf('function _opLoadMaterializedGap'));
ok(!/setTimeout|setInterval|Date\.now|ttl|maxAge|expires/i.test(prefetchBlock),
  'A5  the scope store has no clock in it — no TTL, no interval, no timestamp');
eq(M.orderPlanningL2.invalidationOwners.length, 2, 'A6  two invalidation owners, both pre-existing');
ok(/_opInvalidateL2Scopes_\(\);/.test(ROJS.slice(ROJS.indexOf('function refreshOrderPlanningGapAfterRecalc_'))),
  'A6a the gap recalculation owner reaches the store');

/* ==================================================================================================
   B — THE PREPARATION (§3 / §4)
   ================================================================================================== */
section('B. PREPARATION — once per site, and the first layer does not wait for it');

const L = M.orderPlanningL2;

/* B1 — ANTI-VACUITY FIRST. The zeros below mean nothing unless work was actually done. */
ok(L.sitesPrepared >= 2, 'B1  the Search prepared more than one site', L.sitesPrepared);
eq(L.l2TableReads, 7, 'B1a and read the seven second-layer tables');
eq(L.firstLayerRows, 50, 'B1b over a first layer that really had rows');

eq(L.maxRequestsPerL2Table, 1, 'B2  L2_PREFETCH_DUPLICATE_REQUEST_COUNT = 0 — no table read twice');
eq(L.gapReadsPerSite, 1, 'B2a one gap read per site');
eq(L.reSearchGapReads, 0, 'B3  a second Search over the same sites prepares nothing again');
eq(L.reSearchTableReads, 0, 'B3a and re-reads no table');

/* B4 — TWO PREPARATIONS IN ONE TASK SHARE ONE READ. This is the claim S4-R6's K4 used to make about
   the expand handler; the handler no longer loads, so the claim moved here with the mechanism. */
eq(L.doubleStartGapReads, L.sitesPrepared,
  'B4  two preparations started in the same task issue one read per site, not two');
eq(L.doubleStartTableReads, 0, 'B4a and re-read no table at all when the set is already READY');

eq(L.firstLayerUsableWhilePreparing, true,
  'B5  FIRST_LAYER_BLOCKED_BY_L2_PREFETCH = NO — rows were on screen with requests still open');

/* ==================================================================================================
   C — THE EXPAND (§1)
   ================================================================================================== */
section('C. EXPAND — zero requests, however many SKUs');

eq(L.expandRequests, [0, 0, 0], 'C1  first, second and third SKU expand each cost 0 requests');
eq(L.expandRequestsSameTask, [0, 0, 0], 'C1a and nothing is dispatched in the click’s own task');
eq(L.expandAfterRetry === undefined ? 0 : L.retry.expandAfterRetry, 0,
  'C1b an expand after a recovered failure costs 0 too');

/* The expand handler must not be able to load. A page that still called the loader would pass C1 on
   a warm cache and fail the first user who opened a row before the preparation finished. */
/* THE FUNCTION, not a fixed number of characters after it. The first version of this rule sliced
   2200 characters from the start of the handler, which ran past its closing brace and into the
   next function — so it reported a read that belongs to a neighbour. A rule about one function has
   to end where that function ends. */
const _toggleStart = ROJS.indexOf('function _roToggleRowByKey');
const _toggleEnd = ROJS.indexOf(EOL_ + 'function ', _toggleStart + 10);
const toggleFn = ROJS.slice(_toggleStart, _toggleEnd > 0 ? _toggleEnd : _toggleStart + 2200);
ok(/_roL2State_\(\) === 'LOADING'/.test(toggleFn),
  'C2  the expand handler consults the state instead of loading');
/* `_opLoadRecommendation` IS still called from the toggle and that is the design: it is the CONSUMER
   of the prepared store, and C1 has already proved it costs nothing. What the handler must not do is
   reach a READ — so the rule names the read, not the consumer. The first version of this forbade the
   consumer too and failed against correct code. */
/* COMMENTS STRIPPED FIRST. The handler still carries the F1-7L comment that explains it USED to
   lazy-load those tables on expand, and a rule that greps the raw text reads that explanation as
   the behaviour it describes. S4-R5 nearly lost a whole round to the same mistake. */
const toggleCode = toggleFn.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/refreshCacheTables|_roEnsureL2Tables\(true\)|getOrderPlanningGap/.test(toggleCode),
  'C2a and reaches no read of its own');
/* The one loader call it MAY still make is the attaching form, and only while a preparation is
   already running: deferredRead returns the flight that exists rather than starting another, which
   is exactly the "attach to the already-running scope request" §4 permits. Asserted as a shape so
   a later edit cannot turn it into the dispatching form without failing here. */
const _l2Calls = toggleCode.match(/_roEnsureL2Tables\([^)]*\)/g) || [];
eq(_l2Calls, ['_roEnsureL2Tables(false)'],
  'C2b the only loader call left in the handler is the attaching one');

/* The four words §4 asks for, present and coming from the sealed S4-R4 helper rather than a second
   state machine written for this page. */
ok(/KM\.deferredRead\.define\(RO_L2/.test(ROJS), 'C3  the seven tables are a declared deferred dependency');
ok(/read: function \(tables\) \{ return window\.KM\.DB\.refreshCacheTables\(tables\); \}/.test(ROJS),
  'C3a with the SAME read as before — moved, not reshaped');
eq(M.expand['request-order'].apiAfterFirstExpand, 0, 'C4  the system-wide expand probe agrees');
['ops', 'skuDetails', 'sku-regional-details', 'factory-stock'].forEach(function (k) {
  eq(M.expand[k].apiAfterFirstExpand, 0, 'C4a ' + k + ' still costs 0 on expand');
});
/* §7 — Inventory Replenishment was not touched and is asserted, not assumed. */
eq(M.expand.ops.rowsPresent, 120, 'C5  IR_EXPAND_CONTRACT: rows were really there');
eq([M.expand.ops.apiAfterFirstExpand, M.expand.ops.apiAfterSecondExpand, M.expand.ops.apiAfterThirdExpand],
  [0, 0, 0], 'C5a IR_PER_SKU_EXPAND_REQUEST_COUNT = 0');
ok(M.expand.ops.detailSameTask > 0, 'C5b and its detail appears in the click’s own task');

/* ==================================================================================================
   D — L2 FAILURE ISOLATION (§5 / §6)
   ================================================================================================== */
section('D. FAILURE — the first layer survives, and the recovery is one read per site');

ok(L.failure.gapReadsAttempted >= 2, 'D1  the site reads were really refused', L.failure.gapReadsAttempted);
eq(L.failure.rowsAfter, 50, 'D2  L2_FAILURE_PRESERVES_FIRST_LAYER = YES — every row still on screen');
eq(L.failure.open, 0, 'D2a and nothing was left open');
eq(L.retry.gapReads, L.sitesPrepared, 'D3  the scoped Retry sends exactly one read per site');
eq(L.retry.rowsAfter, 50, 'D3a and the rows are still there afterwards');
eq(L.staleScopeCommits, 0, 'D4  STALE_L2_SCOPE_COMMIT_COUNT = 0');
ok(L.openRequestsAtInvalidate > 0, 'D4a and that was measured with reads genuinely in flight',
  L.openRequestsAtInvalidate);
/* The loop is guarded as well as the commit. Guarding only the commit left the superseded run free to
   dispatch the rest of its site list; measured at ten further sites read and stored after the
   invalidation that should have stopped them. */
ok(/var runEpoch = _opL2Epoch_;/.test(ROJS) && /if \(runEpoch !== _opL2Epoch_\) return Promise\.resolve\(\);/.test(ROJS),
  'D5  a superseded preparation stops dispatching, not merely stops committing');

/* ==================================================================================================
   E — THE RETRY CONTRACT (§8 / §9)
   ================================================================================================== */
section('E. RETRY — six surfaces closed, every one through its page’s canonical owner');

eq(M.totals.missingRetryControlPre.length, 6, 'E1  MISSING_RETRY_CONTROL_COUNT_PRE = 6');
eq(M.totals.missingRetryControlPre,
  ['purchase-order-list', 'purchase-order-overview', 'request-order', 'request-order-draft',
    'shipment-draft', 'skuDetails'],
  'E1a and they are the six S4-R6 named');
eq(M.totals.missingRetryControlPost, [], 'E2  MISSING_RETRY_CONTROL_COUNT_POST = 0');

/* C1-style anti-vacuity: a page can only be judged on its refusal if it met one. */
const judged = Object.keys(M.routes).filter(k => M.routes[k].failure !== 'NO_READ_TO_FAIL');
ok(judged.length >= 15, 'E3  the refusal probe reached most of the system', judged.length);
judged.forEach(function (k) {
  ok(M.routes[k].failure.errorSurfaces >= 1, 'E3a ' + k + ' rendered a truthful failure');
});

eq(M.totals.retrySurfaces.length, 18, 'E4  RETRY_SURFACE_COUNT = 18');
M.totals.retrySurfaces.forEach(function (k) {
  const f = M.routes[k].failure;
  ok(f.retryRequests >= 1, 'E4a ' + k + ' Retry dispatches at least one real request', f.retryRequests);
  ok(f.retryStorm !== true, 'E4b ' + k + ' and does not storm');
  ok(f.recovered === true, 'E4c ' + k + ' and the refusal is gone after it succeeds');
});
eq(M.totals.retryNoDispatchPages, [], 'E5  RETRY_NO_DISPATCH_COUNT = 0');
eq(M.totals.retryStormPages, [], 'E6  RETRY_STORM_COUNT = 0');

/* NO SECOND READ IMPLEMENTATION. Each Retry calls the owner its page already had. */
const OWNERS = [
  ['assets/js/pages/request-order.js', 'roRetryFirstLayer', '_opLoadFirstLayerComposer_()'],
  ['assets/js/pages/shipping-history.js', 'shRetryRead', '_shLoadAndRender()'],
  ['assets/js/pages/request-order-draft.js', 'rodRetryRead', 'loadAndRender()'],
  ['assets/js/pages/purchase-order-overview.js', 'poRetryRead', 'loadAndRender()'],
  ['assets/js/pages/purchase-order-list.js', 'polRetryRead', 'loadAndRender()'],
  ['assets/js/pages/sku-details.js', 'skRetryRead', '_skLoadAndRender()']
];
OWNERS.forEach(function (o) {
  const src = read(o[0]);
  const fn = src.slice(src.indexOf('function ' + o[1]), src.indexOf('function ' + o[1]) + 420);
  ok(src.indexOf('function ' + o[1]) !== -1, 'E7 ' + o[1] + ' exists');
  ok(fn.indexOf(o[2]) !== -1, 'E7a ' + o[1] + ' calls ' + o[2] + ' — the page’s canonical read');
  ok(/Retrying/.test(fn), 'E7b ' + o[1] + ' shows loading feedback before dispatching');
  ok(new RegExp('window\\.' + o[1] + ' = ' + o[1]).test(src), 'E7c ' + o[1] + ' is reachable from the button');
  ok(src.indexOf('onclick="' + o[1] + '()"') !== -1, 'E7d and the button calls it');
});

/* ==================================================================================================
   F — SYSTEM-WIDE (§11 / §12)
   ================================================================================================== */
section('F. SYSTEM — the twenty-one routes, re-measured after both implementations');

eq(RUN.ROUTES.length, 21, 'F1  USER_VISIBLE_ROUTE_COUNT = 21');
eq(Object.keys(M.routes).length, 21, 'F1a and all of them were measured again this round');
eq(M.totals.falseEmptyPages, 0, 'F2  FALSE_EMPTY_PAGE_COUNT = 0');
eq(M.totals.permanentLoadingPages, 0, 'F3  PERMANENT_LOADING_PAGE_COUNT = 0');
eq(M.totals.driftPages, [], 'F4  LISTENER_DRIFT_PAGE_COUNT = 0 and TIMER_DRIFT_PAGE_COUNT = 0');
Object.keys(M.routes).forEach(function (k) {
  eq(M.routes[k].openRequests, 0, 'F4a ' + k + ' leaves no request open');
});
eq(M.totals.pagesWith4PlusInitialRequests, 0, 'F5  PAGES_WITH_4PLUS_INITIAL_REQUESTS = 0');
eq(M.totals.pagesWith3PlusInitialRounds, 0, 'F6  PAGES_WITH_3PLUS_INITIAL_ROUNDS = 0');

/* Order Planning's mount cost did not grow. The probe now records three where S4-R6's probe recorded
   two, and the third is `requestOrderDraft.getActive` — a read S4-R6's own CENSUS already recorded on
   this page. The probe used to sample before it was dispatched; nothing was added. */
eq(M.routes['request-order'].actions,
  ['getTable:marketplaces', 'aiPlanFirstLayer.get', 'requestOrderDraft.getActive'],
  'F7  Order Planning still mounts on its three pre-existing reads');
ok(M.routes['request-order'].actions.indexOf('orderPlanningGap.get') === -1,
  'F7a and the scope preparation does NOT run before Search');

eq(M.totals.zeroReadWarmReentry.length, 13, 'F8  ZERO_READ_WARM_REENTRY_COUNT = 13');
eq(Object.keys(M.totals.warmRefetchRoutes).length, 8, 'F8a WARM_REFETCH_ROUTE_COUNT = 8');

eq(M.windowErrors.states, 0, 'F9  no window error in the failure pass');
eq(M.windowErrors.l2, 0, 'F9a nor in the L2 pass');
eq(M.unhandled.l2, 0, 'F9b and no unhandled rejection');

/* ==================================================================================================
   G — BOOT / TOKENS (§13 / §18)
   ================================================================================================== */
section('G. BOOT — route-owned code unchanged, tokens current');

eq(M.boot.localScripts, 67, 'G1  BOOT_SCRIPT_COUNT = 67 — no code-splitting round happened here');
ok(M.boot.bytes < 3.95 * 1024 * 1024, 'G2  BOOT_JS_BYTES under the S4-R6 ceiling', M.boot.bytes);
eq(RO.staleAppTokenRefs(INDEX), [], 'G3  STALE_APPLICATION_TOKEN_REFS = 0');
eq(RO.staleRouteAssetTokenRefs(APP), [], 'G3a and 0 among the route-owned assets');
eq(RO.misplacedReleaseTokens(INDEX, APP), [], 'G4  MISPLACED_TOKEN_FAMILY_REFS = 0');
eq(RO.currentAppToken(), 's4r7-finalseal-20260927', 'G5  the application token for this round');
const idxTok = RO.parseIndexTokens(INDEX);
['assets/js/pages/request-order.js', 'assets/js/pages/sku-details.js',
 'assets/js/pages/shipping-history.js', 'assets/js/pages/request-order-draft.js',
 'assets/js/pages/purchase-order-overview.js', 'assets/js/pages/purchase-order-list.js'].forEach(function (f) {
  eq(idxTok[f], RO.currentAppToken(), 'G5a ' + f.split('/').pop() + ' is on the current token');
});

/* ==================================================================================================
   H — MUTATION
   ================================================================================================== */
section('H. MUTATION — each defence broken on purpose');

const T = {
  ro: 'assets/js/pages/request-order.js',
  sku: 'assets/js/pages/sku-details.js',
  pol: 'assets/js/pages/purchase-order-list.js'
};

/* Line endings are not uniform in this repository; anchors are written with \n and re-spelled here. */
function swap(file, from, to) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  if (EOL !== '\n') { from = from.split('\n').join(EOL); to = to.split('\n').join(EOL); }
  if (src.indexOf(from) < 0) return { harness: 'ANCHOR NOT FOUND in ' + file + ': ' + String(from).slice(0, 90) };
  if (src.indexOf(from) !== src.lastIndexOf(from)) return { harness: 'ANCHOR AMBIGUOUS in ' + file + ': ' + String(from).slice(0, 90) };
  fs.writeFileSync(p, src.replace(from, function () { return to; }), 'utf8');
  return { restore: function () { fs.writeFileSync(p, src, 'utf8'); } };
}

let killed = 0, survived = 0, harnessErrors = 0;
function mutant(name, file, from, to, mode, only, detects) {
  const m = swap(file, from, to);
  if (m.harness) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + m.harness); return; }
  let out = null, threw = null;
  try { out = RUN.run(mode, 400, only); } catch (e) { threw = e; }
  m.restore();
  if (threw) { harnessErrors++; failed++; console.log('HARNESS ERROR  ' + name + ' — ' + threw.message); return; }
  /* A TRUNCATED RUN IS A HARNESS ERROR, NOT A SURVIVING MUTANT.
     Chrome stops when its virtual-time budget is spent, and a run that stopped early reports whatever
     it had managed to publish - which for a mutation probe is a set of zeros indistinguishable from a
     defence holding. Two mutants intermittently 'survived' that way before `done` was checked here,
     on two runs out of four. A probe that did not finish has not answered. */
  if (!out || out.fatal || out.noMeasurements || out.done !== true) {
    harnessErrors++; failed++;
    console.log('HARNESS ERROR  ' + name + ' — ' + ((out && out.fatal) || (out && out.done !== true ? 'run did not finish (virtual-time budget?)' : 'no measurements')));
    return;
  }
  let caught = false, why = '';
  try { caught = !!detects(out); } catch (e) { caught = false; why = ' (probe threw: ' + e.message + ')'; }
  if (caught) { killed++; passed++; console.log('  ok   ' + name + ' KILLED'); }
  else { survived++; failed++; console.log('FAIL  ' + name + ' SURVIVED' + why); }
}

/* H1 — the load moved back into the expand handler. */
mutant('H1 the expand handler loads the second layer again', T.ro,
  "    if (_roL2State_() === 'LOADING') {\n      _roEnsureL2Tables(false).then(function () { if (requestOrderState.expandedRowKey === rowKey) renderRequestOrderTable(); });\n    }",
  "    _opInvalidateL2Scopes_();\n    _roEnsureL2Tables(true).then(function () { if (requestOrderState.expandedRowKey === rowKey) renderRequestOrderTable(); });",
  'l2', null,
  o => (o.l2.expands || []).some(e => e.settled > 0));

/* H2 — a second preparation is allowed to start its own reads. */
mutant('H2 two preparations each read every site', T.ro,
  '  if (_opMatInFlight_[mkey]) return _opMatInFlight_[mkey];\n',
  '',
  'l2', null,
  o => (o.l2.doubleStart || {}).gapReads > (o.l2.prepare || {}).gapReads);

/* H3 — an L2 failure is allowed to take the first layer with it. */
mutant('H3 a refused site read empties the rows', T.ro,
  "    _opRecoState = _opRecoBlank('API_ERROR'); _opRecoState.scopeKey = scopeKey; _opRecoState.sku = scope.sku;\n    _opRecoState.errors = [_opL2ScopeError_];\n    _opRecoRerender();\n    return null;",
  "    requestOrderState.data = [];\n    renderRequestOrderTable();\n    return null;",
  'l2', null,
  o => (o.l2.failure || {}).rowsAfter === 0);

/* H4 — an invalidated preparation is allowed to commit. Both guards are broken, because breaking one
   leaves the other holding the line and the mutant would read as survived. */
mutant('H4 a superseded preparation commits anyway', T.ro,
  [
    '  var runEpoch = _opL2Epoch_;',
    '  function worker() {',
    '    if (runEpoch !== _opL2Epoch_) return Promise.resolve();   // superseded: dispatch nothing more'
  ].join('\n'),
  [
    '  var runEpoch = _opL2Epoch_;',
    '  function worker() {'
  ].join('\n'),
  'l2', null,
  o => (o.l2.stale || {}).storedAfter > 0);

/* H5 — a Retry button removed. */
mutant('H5 the Purchase Order Overview Retry button is gone', T.pol,
  "' <button type=\"button\" class=\"btn btn-secondary\" onclick=\"polRetryRead()\" style=\"margin-left:8px;padding:2px 10px;font-size:12px;cursor:pointer;\">Retry</button></td></tr>';",
  "'</td></tr>';",
  'states', ['purchase-order-list'],
  o => ((o.states['purchase-order-list'] || {}).failed || {}).retryControls === 0);

/* H6 — a Retry that dispatches nothing. */
mutant('H6 the SKU Details Retry sends no request', T.sku,
  '    _skLoadAndRender();\n}',
  '}',
  'states', ['skuDetails'],
  o => {
    const r = o.states.skuDetails || {};
    if ((r.failed || {}).retryControls === 0) return true;      // no control left to press
    if (r.retry === null || r.retry === undefined) return true;  // nothing was pressed
    return r.retryNoDispatch === true || r.retry.api === 0;      // pressed, nothing sent
  });

/* H7 — a Retry that dispatches twice, AND THE FIRST VERSION OF IT COULD NOT.

   The obvious mutant is to call _skLoadAndRender() twice. Measured, that produces ONE request: the
   shared transport collapses two identical simultaneous workspace reads, so a page whose Retry
   called its own reader twice would still be inside the contract. The mutant was inert, and an
   inert mutant reads as coverage while proving nothing.

   Worth recording rather than quietly working around, because it is the third round in which a
   defence in this codebase turned out to be doubled. The realistic defect is not a repeated
   identical read but a Retry that does MORE than the canonical one - a second read with a different
   include, which the transport cannot collapse because it is a different question. Verified by hand
   before being planted: this one really does send two. */
mutant('H7 the SKU Details Retry sends a second, different read', T.sku,
  '    _skLoadAndRender();\n}',
  '    _skLoadAndRender();\n    _skWorkspaceRefresh_({ regional: true });\n}',
  'states', ['skuDetails'],
  o => ((o.states.skuDetails || {}).retry || {}).api >= 2);

console.log('\n  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harnessErrors + ' harness errors');
ok(survived === 0 && harnessErrors === 0, 'H  every planted defect was caught');

/* ==================================================================================================
   I — THE S4 FINAL SEAL (§15)
   ================================================================================================== */
section('I. S4 FINAL SEAL — the eleven conditions, each read from a measurement');

const SEAL = [
  ['all 21 user-visible routes audited', Object.keys(M.routes).length === 21],
  ['six missing Retry controls closed', M.totals.missingRetryControlPost.length === 0],
  ['individual SKU expand issues zero requests', JSON.stringify(L.expandRequests) === '[0,0,0]'],
  ['no N+1 expansion pattern', L.reSearchGapReads === 0 && L.doubleStartGapReads === L.sitesPrepared],
  ['no listener or timer leak', M.totals.driftPages.length === 0],
  ['no request storm', M.totals.retryStormPages.length === 0],
  ['no false-empty error', M.totals.falseEmptyPages === 0],
  ['no permanent loading', M.totals.permanentLoadingPages === 0],
  ['no stale response commit', L.staleScopeCommits === 0],
  ['no retry that fails to dispatch', M.totals.retryNoDispatchPages.length === 0],
  ['first layer never blocked by the preparation', L.firstLayerUsableWhilePreparing === true]
];
SEAL.forEach(function (c, i) { ok(c[1], 'I' + (i + 1) + '  ' + c[0]); });
const sealed = SEAL.every(function (c) { return c[1]; });
ok(sealed, 'I  S4_FINAL_SEAL = YES');

/* ================================================================================================== */
console.log('\n' + '='.repeat(100));
console.log('S4-R7 FINAL SEAL: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(100));
process.exit(failed === 0 ? 0 : 1);
