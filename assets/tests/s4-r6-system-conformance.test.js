/**
 * ==================================================================================================
 * S4-R6 — SYSTEM-WIDE CONFORMANCE
 * ==================================================================================================
 *
 * Every user-visible route carries an EXPLICIT status here. That is the point of the round: S4-R1
 * through R5 each proved something deep about a handful of pages, and a page that was never looked
 * at was indistinguishable in the record from a page that passed.
 *
 * NO VACUOUS PASSES. Two rules are enforced about the evidence itself before any page is judged:
 * the route table must cover every route the RELEASE can reach (C1), and a page recorded as having
 * a clean failure surface must have actually been refused (C2). A count of zero means "measured and
 * zero", never "not measured".
 *
 * WHAT IS AUTHORITATIVE: request counts, dispatch counts, DOM outcomes, listener counts by target
 * class. WHAT IS NOT: milliseconds — the virtual clock freezes while a task runs, which S4-R1
 * measured rather than assumed. Nothing here claims anything about visual fidelity.
 * ==================================================================================================
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const EV = path.join(ROOT, 'docs', 'evidence', 's4-r6-conformance');

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
const INDEX = read('index.html');
const APP = read('assets/js/app.js');

console.log('='.repeat(100));
console.log('S4-R6 — SYSTEM-WIDE ROUTE / FIRST-USEFUL-UI / PERCEIVED-PERFORMANCE CONFORMANCE');
console.log('='.repeat(100));

/* ==================================================================================================
   C — THE EVIDENCE ITSELF, BEFORE ANY PAGE IS JUDGED BY IT
   ================================================================================================== */
section('C. COVERAGE — the census is complete and the measurements are not vacuous');

/* C1 — the route table against the release. Every `showSection('key')` reachable from the sidebar,
   plus the one section whose menu is built at boot, must be in the table or excluded for a stated
   reason. A table that quietly dropped a route would let that route pass by never being asked. */
const menuKeys = [];
const reNav = /showSection\('([a-zA-Z-]+)'\)/g;
let mm;
while ((mm = reNav.exec(INDEX))) if (menuKeys.indexOf(mm[1]) < 0) menuKeys.push(mm[1]);

/* The two Overseas routes are refused BY NAME inside showSection and their markup is disabled — two
   independent gates, so neither is user-visible. Recorded here rather than silently filtered. */
const DISABLED = ['overseas-inbound', 'overseas-outbound'];
const tableKeys = RUN.ROUTES.map(r => r.key);
const uncovered = menuKeys.filter(k => DISABLED.indexOf(k) < 0 && tableKeys.indexOf(k) < 0);
eq(uncovered, [], 'C1  every sidebar route is in the conformance table', uncovered);

ok(/if \(section === 'overseas-inbound' \|\| section === 'overseas-outbound'\) \{/.test(APP),
  'C1a and the two excluded routes are still refused by name in showSection');
ok(/menu-item--disabled/.test(INDEX), 'C1b and still disabled in the markup');

/* The two routes reached by their own helper rather than by showSection, and the staged one. */
['shipment-draft', 'shipment-overview'].forEach(function (k) {
  const r = RUN.ROUTES.filter(x => x.key === k)[0];
  ok(!!r && !!r.via, 'C1c ' + k + ' is entered through its own helper, and the table says so');
});
ok(/mountStagedMenus\(\)/.test(APP) && tableKeys.indexOf('product-strategy') !== -1,
  'C1d Product Strategy is menu-reachable at boot and is in the table');

eq(M.routeCount, RUN.ROUTES.length, 'C2  the measurements cover every route in the table');
eq(RUN.ROUTES.length, 21, 'C2a  USER_VISIBLE_ROUTE_COUNT = 21');

/* C3 — ANTI-VACUITY. A route reported with a clean failure surface must have been refused: at least
   one request must have been issued while the refusal was armed. Otherwise "no false empty" would be
   a fact about a page that was never asked a hard question. */
const withReads = Object.keys(M.routes).filter(k => M.routes[k].failure !== 'NO_READ_TO_FAIL');
ok(withReads.length >= 15, 'C3  the failure probe reached most of the system', withReads.length);
const unrefused = withReads.filter(k => !(M.routes[k].failure.errorSurfaces >= 0));
eq(unrefused, [], 'C3a and every one of them recorded a failure reading', unrefused);

/* C4 — and the routes that read nothing on entry are named, not merely absent. */
const noRead = Object.keys(M.routes).filter(k => M.routes[k].failure === 'NO_READ_TO_FAIL');
eq(noRead.sort(), ['forecast', 'shipment-overview', 'supplychain'],
  'C4  the three routes that issue no read on entry are named');
noRead.forEach(function (k) {
  eq(M.routes[k].initialRequests, 0, 'C4a ' + k + ' really does issue no initial request');
});

/* ==================================================================================================
   D — REQUEST ROUND-TRIP CENSUS (§9)
   ================================================================================================== */
section('D. NETWORK — initial requests and sequential rounds, per route');

eq(M.totals.pagesWith4PlusInitialRequests, 0, 'D1  PAGES_WITH_4PLUS_INITIAL_REQUESTS = 0');
eq(M.totals.pagesWith3PlusInitialRounds, 0, 'D2  PAGES_WITH_3PLUS_INITIAL_ROUNDS = 0');

/* The two three-request pages, named, with the reason they are not a defect: the scoped reader's
   concurrency bound is 2, so three tables are two rounds BY DESIGN. That bound is a deliberate
   pressure control and §13 forbids widening it for speed. */
const three = Object.keys(M.routes).filter(k => M.routes[k].initialRequests === 3);
eq(three.sort(), ['factory-stock', 'sku-handbook'], 'D3  the two three-table pages are named', three);
ok(/var KM_SCOPED_READ_CONCURRENCY_ = 2;/.test(read('assets/js/api/operation-system-db-api.js')),
  'D3a and the bound that makes them two rounds is still 2');
three.forEach(function (k) {
  eq(M.routes[k].initialRounds, 2, 'D3b ' + k + ' pays two rounds, not three');
});

/* ROUNDS ARE ONLY MEANINGFUL AT A NON-ZERO SERVER TIME. At serverMs 0 every request settles before
   the next is sent, so the round heuristic counts requests. The census that answers §9 was taken at
   400, and this rule keeps that from being forgotten. */
eq(M.serverMs.probe, 400, 'D4  the round census was taken at a server time where rounds exist');

/* ==================================================================================================
   E — LIFECYCLE (§7)
   ================================================================================================== */
section('E. LIFECYCLE — listener and timer drift, measured marginally');

const driftRoutes = Object.keys(M.driftAfter);
eq(driftRoutes.length, 21, 'E1  every route was driven through three mount/unmount cycles');
const drifting = driftRoutes.filter(k => M.driftAfter[k] !== 0);
eq(drifting, [], 'E2  LISTENER_DRIFT_PAGE_COUNT = 0', drifting);
eq(M.totals.driftRoutesAfter, 0, 'E2a  and the total agrees');
eq(M.totals.permanentLoadingAfter, 0, 'E3  PERMANENT_LOADING_PAGE_COUNT = 0');

/* The two that drifted BEFORE this round, kept as the evidence that E2 is not vacuous: a rule that
   has never seen a failure is a rule nobody has tested. */
eq(Object.keys(M.driftBefore).sort(), ['request-order', 'sku-handbook'],
  'E4  and the two routes that DID drift before the repair are on the record');
eq(M.driftBefore['request-order'].listenerDrift, 4, 'E4a Order Planning added 4 live listeners per visit');
eq(M.driftBefore['sku-handbook'].listenerDrift, 1, 'E4b SKU Handbook added 1');

Object.keys(M.routes).forEach(function (k) {
  eq(M.routes[k].openRequests, 0, 'E5 ' + k + ' leaves no request open');
  eq(M.routes[k].intervalDrift, 0, 'E5a ' + k + ' TIMER_DRIFT = 0');
});

/* ==================================================================================================
   F — ERROR TRUTH (§7)
   ================================================================================================== */
section('F. ERROR TRUTH — failure is never empty, and Retry is real');

eq(M.totals.falseEmptyAfter, 0, 'F1  FALSE_EMPTY_PAGE_COUNT = 0');
eq(M.totals.silentFailureAfter, [], 'F2  no page fails silently — every refused read has a surface');

/* Not vacuous: three pages DID fail silently before this round, and two of those rendered something
   a user would read as data. */
eq(M.totals.silentFailureBefore.sort(), ['campaign-risk', 'carrier-rate-card', 'sku-handbook'],
  'F3  the three pages that were silent before the repair are named');
ok(M.totals.falseEmptyBefore >= 2, 'F3a and at least two of them showed an empty state instead of a failure',
  M.totals.falseEmptyBefore);

/* Every Retry that exists issues at least one real request and clears the refusal. RETRY_NO_DISPATCH
   is the rule; a page WITHOUT a Retry is a separate, recorded gap (F5) and not a dispatch failure. */
const withRetry = Object.keys(M.routes).filter(k =>
  M.routes[k].failure !== 'NO_READ_TO_FAIL' && M.routes[k].failure.retryControls > 0);
ok(withRetry.length >= 10, 'F4  most refused pages offer a Retry', withRetry.length);
withRetry.forEach(function (k) {
  ok(M.routes[k].failure.retryRequests >= 1, 'F4a ' + k + ' Retry dispatches a real request',
    M.routes[k].failure.retryRequests);
  ok(M.routes[k].failure.retryRequests <= 6, 'F4b ' + k + ' and does not storm',
    M.routes[k].failure.retryRequests);
  ok(M.routes[k].failure.recovered === true, 'F4c ' + k + ' and the refusal is gone afterwards');
});

/* F5 — THE OPEN GAP, ASSERTED SO IT CANNOT QUIETLY GROW. Six pages render a truthful failure and no
   Retry control, several while advising the operator to "Press Retry". They are recoverable — all
   six re-read on route re-entry — so this is P2, not a lie. The set is CLOSED: a seventh page losing
   its Retry fails here. */
eq(M.totals.noRetryControlAfter.slice().sort(),
  ['purchase-order-list', 'purchase-order-overview', 'request-order', 'request-order-draft',
    'shipment-draft', 'skuDetails'],
  'F5  the six pages with a truthful failure and no in-page Retry are a closed, recorded set');
M.totals.noRetryControlAfter.forEach(function (k) {
  ok(M.routes[k].failure.errorSurfaces >= 1, 'F5a ' + k + ' does at least say the read failed');
});

/* ==================================================================================================
   G — EXPANDABLE WORKSPACES (§6 / §1A)
   ================================================================================================== */
section('G. EXPANDABLE WORKSPACES — the operator rule, measured on real clicks');

const X = M.expand;
const measured = Object.keys(X).filter(k => !X[k].skipped);
eq(measured.sort(), ['factory-stock', 'ops', 'request-order', 'sku-regional-details', 'skuDetails'],
  'G1  five of the six workspaces render rows in this world and were exercised', measured);
eq(X['request-order-draft'].skipped, 'no rows in this world',
  'G1a and the sixth says so rather than reporting a zero it did not measure');

/* THE RULE: expanding one SKU must not cost a request for THAT SKU. Four workspaces cost nothing at
   all; Order Planning costs a per-SCOPE read, which is bounded by the number of company/country/
   marketplace scopes on screen and not by the number of SKUs. Both satisfy "no N+1 per SKU"; only
   the first satisfies "the first expand does not block on the network". */
['skuDetails', 'sku-regional-details', 'ops', 'factory-stock'].forEach(function (k) {
  eq(X[k].apiAfterFirstExpand, 0, 'G2 ' + k + ' first expand costs 0 requests');
  eq(X[k].apiAfterSecondExpand, 0, 'G2a ' + k + ' second expand costs 0');
  eq(X[k].apiAfterThirdExpand, 0, 'G2b ' + k + ' third expand costs 0');
});
eq(X.ops.rowsPresent, 120, 'G3  Site Inventory really had rows to expand');
ok(X.ops.detailSameTask > 0, 'G3a and its detail exists in the SAME TASK as the click — no network wait');

/* Order Planning, stated exactly rather than kindly. */
eq(X['request-order'].apiAfterSecondExpand, 0,
  'G4  Order Planning: a second SKU in the SAME scope costs 0 — PER_SKU_EXPAND_REQUEST_COUNT = 0');
eq(X['request-order'].apiAfterThirdExpand, 1,
  'G4a  a SKU in a NEW scope costs exactly one scope read — not one per SKU');
eq(Object.keys(X['request-order'].byActionThirdExpand), ['orderPlanningGap.get'],
  'G4b  and that read is the per-scope materialized gap');
ok(X['request-order'].apiAfterFirstExpand === 8,
  'G4c  while the FIRST expand on the page costs 8 — the §12 decision item, recorded not hidden',
  X['request-order'].apiAfterFirstExpand);

/* The per-scope cache is what makes G4 true, so it is asserted at the source too: a cache keyed by
   the SKU would turn the same measurement into N+1. */
const ROJS = read('assets/js/pages/request-order.js');
ok(/_opMatCache = \{ key: mkey, bySku: bySku \}/.test(ROJS),
  'G5  the materialized gap is cached per company+country+marketplace, keyed rows by SKU');
ok(/var mscope = \{ company: scope\.company, country: scope\.country, marketplace: scope\.marketplace \};/.test(ROJS),
  'G5a  and the cache key deliberately excludes the SKU');

/* ==================================================================================================
   H — WARM RE-ENTRY (§11)
   ================================================================================================== */
section('H. WARM RE-ENTRY — re-derived, and deliberately not optimised');

eq(M.totals.zeroReadWarmReentry.length, 13, 'H1  ZERO_READ_WARM_REENTRY_COUNT = 13');
eq(Object.keys(M.totals.warmRefetchRoutes).length, 8, 'H2  WARM_REFETCH_ROUTE_COUNT = 8');
eq(M.totals.zeroReadWarmReentry.length + Object.keys(M.totals.warmRefetchRoutes).length, 21,
  'H2a  and the two account for every route');
/* §11 says not to remove a read merely to improve the number, and that UNKNOWN means no change.
   Every one of the eight re-reads business state another page can write, so none was touched. */
Object.keys(M.totals.warmRefetchRoutes).forEach(function (k) {
  ok(M.totals.warmRefetchRoutes[k] >= 1, 'H3 ' + k + ' re-reads on warm re-entry and was left alone');
});

/* ==================================================================================================
   I — BOOT (§8)
   ================================================================================================== */
section('I. BOOT — what is left, and why it stays');

eq(M.boot.localScripts, 67, 'I1  BOOT_SCRIPT_COUNT = 67');
ok(M.boot.bytes < 3.95 * 1024 * 1024, 'I2  BOOT_JS_BYTES is under 3.95 MB', M.boot.bytes);
/* A CEILING, not a frozen number. The repairs in this round add bytes to four page modules, and a
   rule that pinned an exact total would have to be edited by every future round that fixes anything
   — which is how a number stops being checked and starts being updated. */

const big = M.boot.over200KB.map(x => x.file);
eq(big.sort(), ['assets/js/api/operation-system-db-api.js', 'assets/js/pages/fc-summary.js',
  'assets/js/pages/request-order.js'],
  'I3  the three remaining assets over 200 KB are named', big);
/* None of them moves this round, and the reasons are different for each:
   · operation-system-db-api.js is shared infrastructure — §8 says so explicitly.
   · fc-summary.js and request-order.js are route-owned by ownership but NOT by reachability: both
     are reached from pages other than their own route. Establishing that is a measurement, not an
     assumption, and this round did not take it. UNKNOWN is not authorization. */
ok(/operation-system-db-api\.js/.test(INDEX), 'I3a  the shared API layer stays at boot');
ok(RO.staleAppTokenRefs(INDEX).length === 0, 'I4  STALE_APPLICATION_TOKEN_REFS = 0');
eq(RO.staleRouteAssetTokenRefs(APP), [], 'I4a  and 0 among the route-owned assets');
eq(RO.misplacedReleaseTokens(INDEX, APP), [], 'I5  MISPLACED_TOKEN_FAMILY_REFS = 0');

/* Every file this round changed carries the new token, and the new token is new. */
eq(RO.currentAppToken(), 's4r6-conformance-20260927', 'I6  the application token for this round');
const idxTok = RO.parseIndexTokens(INDEX);
['assets/js/pages/request-order.js', 'assets/js/pages/sku-handbook.js',
 'assets/js/pages/carrier-rate-card.js', 'assets/js/pages/campaign-risk.js',
 'assets/js/pages/automation-schedule.js', 'assets/css/pages/automation-schedule.css',
 'assets/css/pages/carrier-rate-card.css'].forEach(function (f) {
  eq(idxTok[f], RO.currentAppToken(), 'I6a ' + f.split('/').pop() + ' is on the current token');
});

/* THE UNSTYLED REFUSAL, WHICH THIS PROJECT HAS SHIPPED BEFORE. Two of the repairs introduce new
   state classes; a class with no rule renders a refusal nobody can see. */
const CSS_AUTO = read('assets/css/pages/automation-schedule.css');
const CSS_CRC = read('assets/css/pages/carrier-rate-card.css');
ok(/\.auto-sched-error\s*\{/.test(CSS_AUTO), 'I7  .auto-sched-error has a rule');
ok(/\.auto-sched-empty\s*\{/.test(CSS_AUTO), 'I7a .auto-sched-empty has a rule');
ok(/\.crc-note--error\s*\{/.test(CSS_CRC), 'I7b .crc-note--error has a rule');

/* ==================================================================================================
   J — WHAT THIS ROUND WAS FORBIDDEN TO DO (§13)
   ================================================================================================== */
section('J. NO-GO — nothing was introduced that §13 forbids');

const REPAIRED = ['assets/js/pages/request-order.js', 'assets/js/pages/sku-handbook.js',
  'assets/js/pages/carrier-rate-card.js', 'assets/js/pages/campaign-risk.js',
  'assets/js/pages/automation-schedule.js'];
REPAIRED.forEach(function (f) {
  const src = read(f);
  const name = f.split('/').pop();
  ok(!/serviceWorker|navigator\.serviceWorker/.test(src), 'J1 ' + name + ' introduces no service worker');
  ok(!/localStorage\.setItem\([^)]*ttl|maxAge|expiresAt/i.test(src), 'J2 ' + name + ' introduces no TTL cache');
  ok(!/<link[^>]+rel=["\']prefetch|rel=["\']preload/.test(src), 'J3 ' + name + ' introduces no speculative prefetch');
});
/* The repairs must not have changed WHAT is read. A new table or a new action in a page this round
   touched would be a first-load change, and §1D reserves that for the operator. */
eq(M.routes['carrier-rate-card'].actions, ['getTable:carrier_rate_cards', 'getTable:carriers'],
  'J4  Carrier Rate Card still reads exactly the two tables S4-R4 left it with');
eq(M.routes['campaign-risk'].actions, ['getTable:marketplace_skus'],
  'J4a Promotion Risk still reads the one critical table S4-R4 left it with');
eq(M.routes['sku-handbook'].actions,
  ['getTable:sku_details', 'getTable:product_features', 'getTable:sku_handbook_summaries'],
  'J4b SKU Handbook still reads its three');
eq(M.routes['automation'].actions, ['automationSchedule.get'], 'J4c Automation still reads its one');

/* §12's DO-NOT-TOUCH list, for the items a page this round edited could have reached. */
ok(/var _CRC_LT = 'carrierRateCard\.leadTimes';/.test(read('assets/js/pages/carrier-rate-card.js')),
  'J5  the S4-R4 carrier deferred read is untouched');
ok(/CR_SCOPE/.test(read('assets/js/pages/campaign-risk.js')),
  'J5a and the S4-R4 promotion-risk deferred scope is untouched');
eq(M.windowErrors.states, 0, 'J6  no window error in the failure pass');
eq(M.unhandled.states, 0, 'J6a no unhandled rejection either');
eq(M.windowErrors.drift, 0, 'J6b nor in the lifecycle pass');

/* ==================================================================================================
   K — MUTATION
   ================================================================================================== */
section('K. MUTATION — each repair broken on purpose');

const T = {
  ro: 'assets/js/pages/request-order.js',
  skuh: 'assets/js/pages/sku-handbook.js',
  crc: 'assets/js/pages/carrier-rate-card.js',
  cr: 'assets/js/pages/campaign-risk.js',
  auto: 'assets/js/pages/automation-schedule.js'
};

/* LINE ENDINGS ARE NOT UNIFORM IN THIS REPOSITORY, and a mutation harness that ignores that reports
   every multi-line anchor as missing — which is a HARNESS ERROR, not a surviving mutant, but it takes
   a run to find out. The anchors below are written with plain \n and re-spelled here in whatever the
   target file actually uses. */
function swap(file, from, to) {
  const p = path.join(ROOT, file);
  const src = fs.readFileSync(p, 'utf8');
  const EOL = src.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  if (EOL !== '\n') {
    from = from.split('\n').join(EOL);
    to = to.split('\n').join(EOL);
  }
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
  if (!out || out.fatal || out.noMeasurements) {
    harnessErrors++; failed++;
    console.log('HARNESS ERROR  ' + name + ' — ' + ((out && out.fatal) || 'no measurements'));
    return;
  }
  let caught = false, why = '';
  try { caught = !!detects(out); } catch (e) { caught = false; why = ' (probe threw: ' + e.message + ')'; }
  if (caught) { killed++; passed++; console.log('  ok   ' + name + ' KILLED'); }
  else { survived++; failed++; console.log('FAIL  ' + name + ' SURVIVED' + why); }
}

/* --- the three listener guards. Drift is measured marginally, so a mutant has to make the page add
   listeners on EVERY visit — which is exactly what removing an idempotence guard does. ------------ */
mutant('K1 the dropdown panels are re-bound on every render', T.ro,
  '    if (panel._roPanelClickBound) return;\n    panel._roPanelClickBound = true;\n',
  '',
  'drift', ['request-order'],
  o => (o.drift['request-order'] || {}).listenerDrift >= 3);

mutant('K2 the scroll sync is re-bound on every render', T.ro,
  '  if (scrollCol._roScrollSyncBound) return;\n  scrollCol._roScrollSyncBound = true;\n',
  '',
  'drift', ['request-order'],
  o => (o.drift['request-order'] || {}).listenerDrift >= 1);

mutant('K3 the handbook search box is re-bound on every mount', T.skuh,
  'if (searchInput && !searchInput._skuhSearchBound) {\n        searchInput._skuhSearchBound = true;',
  'if (searchInput) {',
  'drift', ['sku-handbook'],
  o => (o.drift['sku-handbook'] || {}).listenerDrift >= 1);

/* --- the in-flight guard. Only a race can see it, which is what l2race is for. ------------------- */
mutant('K4 two expands inside the load window each start the whole second-layer read', T.ro,
  '  if (_roL2Flight && !force) return _roL2Flight;\n',
  '',
  'l2race', null,
  o => (o.l2race || {}).maxPerL2Table >= 2);

/* --- the four error-truth repairs. ------------------------------------------------------------- */
mutant('K5 the promotion-risk refusal is checked after the no-scope state again', T.cr,
  "    if (_crViewState === 'error') { msg('Could not load promotion data. <button type=\"button\" class=\"cr-btn cr-btn--small\" onclick=\"crReload()\">Retry</button>', 'cr-empty-state--error'); return; }\n    // STATE 1 — no site scope selected yet (guided empty state; no SKU query is run).\n    if (!crScopeReady()) { msg('Select a country and marketplace to view promotion risk.'); return; }",
  "    if (!crScopeReady()) { msg('Select a country and marketplace to view promotion risk.'); return; }\n    if (_crViewState === 'error') { msg('Could not load promotion data. <button type=\"button\" class=\"cr-btn cr-btn--small\" onclick=\"crReload()\">Retry</button>', 'cr-empty-state--error'); return; }",
  'states', ['campaign-risk'],
  o => {
    const r = o.states['campaign-risk'] || {};
    return (r.failed || {}).errorBoxes === 0 || r.falseEmpty === true;
  });

mutant('K6 the carrier primary read swallows its failure again', T.crc,
  '                .catch(function (err) { _crcPrimaryError = err || { message: \'read failed\' }; _crcInit(); _crcRenderPrimaryError(); });',
  '                .catch(function () { _crcInit(); });',
  'states', ['carrier-rate-card'],
  o => ((o.states['carrier-rate-card'] || {}).failed || {}).errorBoxes === 0);

mutant('K7 the handbook renders its demo SKUs over a failed read again', T.skuh,
  "    if (_skuhReadState === 'FAILED') { renderSkuHandbookFilters(); _skuhRenderReadFailure_(); return; }\n",
  '',
  'states', ['sku-handbook'],
  o => ((o.states['sku-handbook'] || {}).failed || {}).errorBoxes === 0);

/* THIS MUTANT TOOK TWO CORRECTIONS AND BOTH ARE WORTH RECORDING, because each produced a SURVIVING
   mutant that was really an inert one — the failure mode that makes a mutation score a lie.

   FIRST: the replacement text referred to `host`, a variable the repair had removed from this
   function. The mutated `.then` handler threw a ReferenceError, the rejection landed in `.catch`,
   and `.catch` rendered the CORRECT refusal. The planted defect repaired itself.

   SECOND, and the reason the obvious retarget to `.catch` also failed: this read does NOT reject on
   a transport refusal. `_kmGapRead_` RESOLVES with `{ success: false, error }`, so the branch a
   refused automation read actually takes is the `else` inside `.then`. Measured by hand rather than
   reasoned about, after the second survival. */
mutant('K8 automation dresses its failure as a loading message again', T.auto,
  "        _autoSchedState('FAILED', '<strong>Could not load automation schedules.</strong><br>' +\n          _autoSchedEsc(_autoSchedReason(null, res)) +\n          '<br>This is a read failure, not a proven-empty schedule list. ',\n          '<button type=\"button\" class=\"btn btn-secondary\" onclick=\"autoSchedRetry()\" style=\"margin-top:8px;\">Retry</button>');",
  "        var _h = el('auto-sched-cards');\n        if (_h) _h.innerHTML = '<div class=\"auto-sched-loading\">Could not load automation schedules.</div>';",
  'states', ['automation'],
  o => {
    const r = o.states.automation || {};
    return (r.failed || {}).retryControls === 0 || r.permanentLoading > 0;
  });

console.log('\n  mutants: ' + killed + ' killed, ' + survived + ' survived, ' + harnessErrors + ' harness errors');
ok(survived === 0 && harnessErrors === 0, 'K  every planted defect was caught');

/* ==================================================================================================
   L — THE RUNNER SAYS WHAT IT DOES NOT CLAIM
   ================================================================================================== */
section('L. HONESTY — the instrument states its own limits');

const RSRC = read('assets/tests/_s4r6-conformance-runner.js');
ok(/WHAT THIS RUNNER DOES NOT CLAIM/.test(RSRC), 'L1  the runner records what it does not measure');
ok(/milliseconds|MILLISECONDS/.test(RSRC), 'L1a including that milliseconds are not authoritative');
ok(/unknown route key/.test(RSRC), 'L2  and a narrowed run refuses an unknown key rather than passing on nothing');

/* ================================================================================================== */
console.log('\n' + '='.repeat(100));
console.log('S4-R6 SYSTEM CONFORMANCE: ' + passed + ' passed, ' + failed + ' failed');
console.log('='.repeat(100));
process.exit(failed === 0 ? 0 : 1);
