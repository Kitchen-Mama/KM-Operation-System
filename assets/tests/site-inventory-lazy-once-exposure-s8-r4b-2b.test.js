// S8-R4B-2B — SITE INVENTORY LAZY-ONCE EXPOSURE.
//
// R4B-2 measured the cost of a Site Inventory Search and found it is PER SHEET, not per row. A 6-row table
// costs 1,238 ms; a 3,814-row table costs ~3,000 ms. Nineteen sheets therefore cost 14.4-22.1 s of handler
// time whatever the data holds, and no single table dominates — the top one is 12-20% of the total.
//
// Six of those nineteen feed ONLY the expanded SKU panel. This round reads them lazily, ONCE PER SITE SCOPE,
// and holds them. Three claims, each easy to believe and expensive to be wrong about:
//
//   1. THE FIRST LAYER SHRANK AND LOST NOTHING. 13 + 6 is the same nineteen, disjoint, nothing invented.
//   2. THE SECOND LAYER IS READ ONCE PER SITE, NOT ONCE PER EXPAND. Twenty expands cost zero requests; three
//      concurrent first expands cost ONE; and US -> CA -> US -> CA costs 1, 1, 0, 0 — because the map is keyed
//      by site and an entry is never discarded merely because the operator looked somewhere else.
//   3. "NOT LOADED" IS NEVER RENDERED AS ZERO. adaptInventoryReplenishmentWorkspace maps `(data.shipments ||
//      [])`, so a table the request did not ASK FOR arrives as [] — byte-identical to a site that genuinely
//      has no shipments. Four UI surfaces consumed that [], and one of them is the historical Qty 0 defect
//      this repository has already paid for once.
//
// Run: node assets/tests/site-inventory-lazy-once-exposure-s8-r4b-2b.test.js

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
var PENDING = [];          // assertions that can only settle after a microtask drain
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
function tally(label, r) {
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED (got ' + JSON.stringify(r) + ')'); }
}
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  tally(label, r);
}
// A mutant whose evidence only exists after a microtask drain MUST still be scored on that evidence. Returning
// a placeholder `true` and deferring the real comparison to a separate assertion would count a probe as caught
// for a question it never asked — which is the vacuous mutant SS26 forbids, wearing a passing grade.
function mutAsync(label, f) {
  PENDING.push(Promise.resolve().then(f).then(function (r) { tally(label, r); },
    function (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); }));
}

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }

var PAGE = read('assets/js/pages/inventory-replenishment.js');
var CMPSRC = read('assets/js/utils/inventory-compat.js');
var DBAPI = read('assets/js/api/operation-system-db-api.js');
var G60 = read('assets/specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var RV = require(path.join(ROOT, 'assets/js/utils/inventory-compat.js')).IRPlanningReveal;

var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
var NL = PAGE.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function extractVar(src, name) {
  var m = src.match(new RegExp('var ' + name + ' = (?:\\[[\\s\\S]*?\\]|\\{[\\s\\S]*?\\});'));
  if (!m) throw new Error('var not found: ' + name);
  return m[0];
}
function liftList(src, name) { return new Function(extractVar(src, name) + NL + 'return ' + name + ';')(); }
// Every mutant is anchored INSIDE one named function, and a mutation that does not apply THROWS. A probe that
// silently matched nothing would report a passing grade for an assertion it never made.
function mutateFn(src, name, find, replace) {
  function fix(t) { return String(t).split(CR + LF).join(LF).split(LF).join(NL); }
  find = fix(find); replace = fix(replace);
  var body = extractFn(src, name);
  if (body.indexOf(find) === -1) throw new Error('mutation target absent in ' + name + ': ' + find.slice(0, 60));
  return src.replace(body, body.replace(find, replace));
}
function stripComments(t) {
  var NLC = String.fromCharCode(10);
  return String(t).replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(new RegExp('(^|[^:])\\/\\/[^' + NLC + ']*', 'g'), '$1 ');
}
function tick() { return new Promise(function (r) { setTimeout(r, 0); }); }

// ================================================================================================================
section('A — the two layers: thirteen plus six, disjoint, and together the same nineteen');
// ================================================================================================================
var FIRST13 = liftList(PAGE, 'IR_FIRST_LAYER_TABLES_');
var EXPOSURE6 = liftList(PAGE, 'IR_EXPOSURE_TABLES_');
var GETTER_TABLE = liftList(PAGE, 'IR_EXPOSURE_GETTER_TABLE_');

eq(FIRST13.length, 13, 'A1  FIRST_LAYER_TABLE_COUNT = 13');
eq(EXPOSURE6.length, 6, 'A2  EXPOSURE_TABLE_COUNT = 6');
eq(EXPOSURE6.slice().sort(), ['shipment_lines', 'shipments', 'shipping_allocation_draft_lines',
  'shipping_allocation_drafts', 'shipping_plan_lines', 'shipping_plans'],
  'A3  and they are the approved six, by name');
eq(FIRST13.filter(function (t) { return EXPOSURE6.indexOf(t) !== -1; }), [], 'A4  the layers are DISJOINT');

// The nineteen the server actually serves, read from 60_ rather than restated here.
var SERVER19 = (function () {
  var out = [], re = /\{ name: '([a-z_]+)',([^}]*)\}/g, m;
  var block = G60.slice(G60.indexOf('var SIR_WORKSPACE_TABLES_ = ['));
  block = block.slice(0, block.indexOf('];'));
  while ((m = re.exec(block))) { if (m[2].indexOf('include:') === -1) out.push(m[1]); }
  return out;
})();
eq(SERVER19.length, 19, 'A5  60_ serves nineteen non-include-gated tables');
eq(FIRST13.concat(EXPOSURE6).slice().sort(), SERVER19.slice().sort(),
  'A6  13 + 6 is EXACTLY that nineteen — the split dropped nothing and invented nothing');
eq(Object.keys(GETTER_TABLE).map(function (k) { return GETTER_TABLE[k]; }).sort(), EXPOSURE6.slice().sort(),
  'A7  the getter->table map covers exactly the six, so the accessors and the `only` list cannot drift apart');

// The adapter is what turns an un-asked-for table into []. Pinned, because it is the reason the sentinel exists.
var ADAPTER = DBAPI.slice(DBAPI.indexOf('window.KM.DB.adaptInventoryReplenishmentWorkspace'));
ADAPTER = ADAPTER.slice(0, ADAPTER.indexOf(NL + '};'));
Object.keys(GETTER_TABLE).forEach(function (g) {
  ok(new RegExp(g + ': \\(data\\.' + GETTER_TABLE[g] + ' \\|\\| \\[\\]\\)').test(ADAPTER),
    'A8  adapter maps ' + g + ' with `|| []` — WHICH IS WHY null, not [], is the not-loaded sentinel');
});

// ================================================================================================================
section('B — the first-layer request asks for thirteen sheets and reaches no exposure table');
// ================================================================================================================
ok(/var _wsPayload = \{ recentWindow: true, only: IR_FIRST_LAYER_TABLES_\.slice\(\) \};/.test(PAGE),
  'B1  the primary read names its thirteen explicitly');
var C60 = (function () {
  var sb = { console: console, Date: Date, Math: Math, JSON: JSON, String: String, Number: Number, Object: Object,
    Array: Array, isNaN: isNaN, isFinite: isFinite, parseFloat: parseFloat, parseInt: parseInt, Error: Error,
    RegExp: RegExp, Boolean: Boolean };
  sb.global = sb;
  var c = vm.createContext(sb);
  vm.runInContext(G60, c, { filename: '60' });
  return c;
})();
var H60 = vm.runInContext('handleInventoryReplenishmentWorkspaceGet_', C60);
function io60(reads) {
  var t = { v: 0 };
  return { now: function () { t.v += 100; return t.v; }, nextSeq: function () { return 1; },
    openTarget: function () { return {}; },
    readTable: function (ss, n) { if (reads) reads.push(n); return [{ sku: 'S0', country: 'US', marketplace: 'Amazon' }]; } };
}
var firstReads = []; H60({ payload: { recentWindow: true, only: FIRST13 } }, io60(firstReads));
eq(firstReads.slice().sort(), FIRST13.slice().sort(), 'B2  the server reads EXACTLY those thirteen');
eq(firstReads.filter(function (t) { return EXPOSURE6.indexOf(t) !== -1; }), [],
  'B3  FIRST_LAYER_EXPOSURE_TABLE_READ_COUNT = 0');
var expReads = []; H60({ payload: { recentWindow: true, only: EXPOSURE6 } }, io60(expReads));
eq(expReads.slice().sort(), EXPOSURE6.slice().sort(), 'B4  and EXACTLY the six for the exposure read');

// ================================================================================================================
section('C — the lazy state machine, EXECUTED');
// ================================================================================================================
// The six exposure getter names, shaped as the real adapter shapes them. A7/A8 tie this stub to the shipped
// adapter by name, so a getter renamed there fails there rather than passing here on a private fiction.
function adaptStub(data) {
  var out = {};
  Object.keys(GETTER_TABLE).forEach(function (g) { out[g] = (data && data[GETTER_TABLE[g]]) || []; });
  return out;
}
var MARKETPLACES = [
  { marketplaceId: 'MKT-RESUS-US-AMAZON', company: 'ResUS', country: 'US', marketplace: 'Amazon' },
  { marketplaceId: 'MKT-RESTW-CA-AMAZON', company: 'ResTW', country: 'CA', marketplace: 'Amazon' },
  { marketplaceId: 'MKT-RESTW-JP-AMAZON', company: 'ResTW', country: 'JP', marketplace: 'Amazon' }
];
var EXPOSURE_ROWS = {
  shipments: [{ shipmentId: 'S1' }], shipment_lines: [{ shipmentLineId: 'L1', shipmentId: 'S1' }],
  shipping_plans: [{ shippingPlanId: 'P1', company: 'ResUS', country: 'US', marketplace: 'Amazon' }],
  shipping_plan_lines: [{ shippingPlanLineId: 'PL1', shippingPlanId: 'P1' }],
  shipping_allocation_drafts: [{ allocationDraftId: 'D1' }],
  shipping_allocation_draft_lines: [{ allocationDraftLineId: 'DL1', allocationDraftId: 'D1' }]
};
var LIFTED = ['IR_FIRST_LAYER_TABLES_', 'IR_EXPOSURE_TABLES_', 'IR_EXPOSURE_GETTER_TABLE_', 'IR_EXPOSURE_STATES_'];
var LIFTED_FNS = ['_irWsGet', '_irExposureScopeKey_', '_irExposureSite_', '_irExposureActiveEntry_', '_irExposureStateForRender_',
  '_irExposureGet_', '_irBuildExposureIndexes_', '_irEnsureExposureLoaded_', '_irOnExposureSettled_',
  '_irInvalidateExposureForKey_', '_irInvalidateActiveExposure_', '_irExposureRefresh_',
  '_irExposureStateOf_', '_irShipCardInnerHtml_', '_irRepaintExposureCard_'];
function lazySrc(P) {
  return LIFTED.map(function (v) { return extractVar(P, v); })
    .concat(['var _irExposureByScope = {}; var _irExposureSeq = 0; var _irReadModel = null;'])
    .concat(LIFTED_FNS.map(function (f) { return extractFn(P, f); })).join(NL);
}
// `pageSrc` lets a mutant be driven through the SAME harness as the shipped code.
function build(opt, pageSrc) {
  opt = opt || {};
  var calls = [], pending = [], indexBuilds = { n: 0 }, repaints = [];
  var attempt = { n: 0 }, failTimes = opt.failTimes || 0;
  var win = opt.noApi ? { KM: { DB: { adaptInventoryReplenishmentWorkspace: adaptStub } } } : { KM: {
    api: { getWorkspace: function (name, payload) {
      calls.push({ name: name, payload: JSON.parse(JSON.stringify(payload || {})) });
      attempt.n++;
      var env = (attempt.n <= failTimes)
        ? { success: false, errors: [{ code: 'REQUEST_TIMEOUT', message: 'read timeout after 45000 ms' }] }
        : { success: true, data: EXPOSURE_ROWS };
      if (opt.manual) return new Promise(function (r) { pending.push(function () { r(env); }); });
      return Promise.resolve(env);
    } },
    DB: { adaptInventoryReplenishmentWorkspace: adaptStub }
  } };
  var st = { applied: null };
  var f = new Function('window', 'document', '_irSearch', '_irRegistry', '_irEffectiveWorkspace', '_irNowMs_',
    '_irBuildShipmentRemainingByReceiver', '_irRevealSkuData_', '_irHydrateDraftForAppliedScope_',
    '_irRevealPumpExec_', '_irRevealPumpReco_', '_irEsc_', 'currentExpandedRow',
    lazySrc(pageSrc || PAGE) + NL +
    'return { ensure:_irEnsureExposureLoaded_, state:_irExposureStateForRender_, get:_irExposureGet_,' +
    ' key:_irExposureScopeKey_, entry:_irExposureActiveEntry_, refresh:_irExposureRefresh_,' +
    ' map:function(){return _irExposureByScope;}, card:_irShipCardInnerHtml_ };');
  var api = f(win, { getElementById: function () { return null; } }, st,
    { model: { getMarketplaces: MARKETPLACES } },
    function () { return !opt.legacy; }, function () { return 1; },
    function () { indexBuilds.n++; return { BUILT: indexBuilds.n }; },
    function () { return null; },
    function () { repaints.push('hydrate'); }, function () { repaints.push('exec'); },
    function () { repaints.push('reco'); }, function (v) { return String(v); }, '');
  return { api: api, calls: calls, pending: pending, indexBuilds: indexBuilds, repaints: repaints,
    site: function (id) { st.applied = { country: '', marketplaceId: id }; } };
}

var T = [];

// ---- C1 the key is the SITE, never the SKU
(function () {
  var h = build();
  h.site('MKT-RESUS-US-AMAZON');
  eq(h.api.key(), 'ResUS|US|MKT-RESUS-US-AMAZON', 'C1  EXPOSURE_CACHE_KEY = company|country|marketplace_id');
  h.site('MKT-RESTW-CA-AMAZON');
  eq(h.api.key(), 'ResTW|CA|MKT-RESTW-CA-AMAZON', 'C1a a different site is a different key');
  ok(!/sku/i.test(extractFn(PAGE, '_irExposureScopeKey_').replace(/\/\/[^\n]*/g, '')),
    'C1b and SKU appears nowhere in the key builder');
})();

// ---- C2 first exposure: ONE request, six tables, this site only
T.push((async function () {
  var h = build();
  h.site('MKT-RESUS-US-AMAZON');
  eq(h.api.state(), 'NOT_LOADED', 'C2  before any expand the entry is NOT_LOADED');
  eq(h.api.get('getShipments'), null, 'C2a and every exposure getter answers NULL, never []');
  await h.api.ensure();
  eq(h.calls.length, 1, 'C2b FIRST_EXPOSURE_REQUEST_COUNT = 1');
  eq(h.calls[0].name, 'inventoryReplenishment', 'C2c through the EXISTING canonical action — no new action');
  eq(h.calls[0].payload.only.slice().sort(), EXPOSURE6.slice().sort(), 'C2d with an exposure-only `only` list');
  eq(h.calls[0].payload.recentWindow, true, 'C2e and the same recentWindow opt-in');
  // S8-R4B-2D REVERSED THIS, AND THE REVERSAL IS THE ROUND. C2f asserted the request carried no scope,
  // which was TRUE and was the defect: a per-site cache key in front of an all-site read is not a per-site
  // read. The claim is kept in the only form that still means something — no SKU, because a per-SKU identity
  // would reintroduce the N+1 this file exists to prevent — and the site is now REQUIRED.
  eq(h.calls[0].payload.siteScope, { company: 'ResUS', country: 'US', marketplace: 'Amazon' },
    'C2f and the SITE — company/country/marketplace, the triple the six tables actually store');
  ok(!/"sku"/.test(JSON.stringify(h.calls[0].payload)),
    'C2f1 and still no SKU anywhere in it — the identity is the site, not the row');
  eq(h.api.state(), 'READY', 'C2g the entry is READY');
  eq(h.api.get('getShipments').length, 1, 'C2h and the getters now answer with rows');
  eq(h.indexBuilds.n, 1, 'C2i the joins were built ONCE');
})());

// ---- C3 single flight
T.push((async function () {
  var h = build({ manual: true });
  h.site('MKT-RESUS-US-AMAZON');
  var a = h.api.ensure(), b = h.api.ensure(), c = h.api.ensure();
  eq(h.calls.length, 1, 'C3  CONCURRENT_FIRST_EXPAND_REQUEST_COUNT = 1 — three expands, ONE request');
  eq(h.api.state(), 'LOADING', 'C3a while it is in flight the state is LOADING, not NOT_LOADED');
  eq(h.api.get('getShipments'), null, 'C3b and a LOADING entry still answers NULL — never a half-built model');
  h.pending.forEach(function (r) { r(); });
  var r = await Promise.all([a, b, c]);
  eq(h.calls.length, 1, 'C3c and still ONE after all three settle');
  ok(r[0] === r[1] && r[1] === r[2], 'C3d all three consumers joined the SAME entry');
  eq(h.indexBuilds.n, 1, 'C3e with the joins built once for all of them');
})());

// ---- C4 ready reuse: 20 expands, zero requests
T.push((async function () {
  var h = build();
  h.site('MKT-RESUS-US-AMAZON');
  await h.api.ensure();
  h.calls.length = 0;
  for (var i = 0; i < 20; i++) { await h.api.ensure(); }
  eq(h.calls.length, 0, 'C4  PER_SKU_EXPAND_REQUEST_AFTER_READY = 0 — twenty expands, ZERO requests');
  eq(h.indexBuilds.n, 1, 'C4a and the joins were NOT rebuilt per expand');
})());

// ---- C5 per-site map: US -> CA -> US -> CA = 1, 1, 0, 0
T.push((async function () {
  var h = build();
  h.site('MKT-RESUS-US-AMAZON'); await h.api.ensure();
  eq(h.calls.length, 1, 'C5  US_FIRST_EXPOSURE_REQUEST_COUNT = 1');
  h.site('MKT-RESTW-CA-AMAZON'); await h.api.ensure();
  eq(h.calls.length, 2, 'C5a CA_FIRST_EXPOSURE_REQUEST_COUNT = 1');
  h.site('MKT-RESUS-US-AMAZON'); await h.api.ensure();
  eq(h.calls.length, 2, 'C5b RETURN_US_REQUEST_COUNT = 0 — the US entry was never discarded');
  h.site('MKT-RESTW-CA-AMAZON'); await h.api.ensure();
  eq(h.calls.length, 2, 'C5c RETURN_CA_REQUEST_COUNT = 0');
  eq(Object.keys(h.api.map()).sort(), ['ResTW|CA|MKT-RESTW-CA-AMAZON', 'ResUS|US|MKT-RESUS-US-AMAZON'],
    'C5d two entries held, BOTH valid — a site switch invalidates nothing');
  eq(Object.keys(h.api.map()).indexOf('ResTW|JP|MKT-RESTW-JP-AMAZON'), -1,
    'C5e CROSS_SITE_PREFETCH_COUNT = 0 — JP was never visited and was never loaded');
})());

// ---- C6 explicit refresh: this site only
T.push((async function () {
  var h = build();
  h.site('MKT-RESUS-US-AMAZON'); await h.api.ensure();
  h.site('MKT-RESTW-CA-AMAZON'); await h.api.ensure();
  h.site('MKT-RESUS-US-AMAZON');
  h.api.refresh(null, 'SKU-A');
  await tick(); await tick();
  eq(h.calls.length, 3, 'C6  INVALIDATION_ON_EXPLICIT_REFRESH = the affected site re-reads — exactly one request');
  eq(h.api.state(), 'READY', 'C6a and settles READY again');
  h.site('MKT-RESTW-CA-AMAZON');
  eq(h.api.state(), 'READY', 'C6b GLOBAL_CACHE_CLEAR_ON_REFRESH = NO — the OTHER site is still READY');
  await h.api.ensure();
  eq(h.calls.length, 3, 'C6c and costs no request');
})());

// ---- C7 failure semantics
T.push((async function () {
  var h = build({ failTimes: 1 });
  h.site('MKT-RESUS-US-AMAZON');
  await h.api.ensure();
  eq(h.api.state(), 'FAILED', 'C7  a failed read settles FAILED');
  eq(h.api.get('getShipments'), null, 'C7a NOT an empty READY model — the getters still answer NULL');
  eq(h.api.entry().error.code, 'REQUEST_TIMEOUT', 'C7b and the REAL code is kept, not flattened');
  h.calls.length = 0;
  for (var i = 0; i < 10; i++) { await h.api.ensure(); }
  eq(h.calls.length, 0, 'C7c ten further renders issue ZERO requests — no auto-retry loop');
  h.api.refresh(null, 'SKU-A');
  await tick(); await tick();
  eq(h.calls.length, 1, 'C7d ONE explicit retry issues exactly ONE request');
  eq(h.api.state(), 'READY', 'C7e FAILED -> LOADING -> READY');
  h.calls.length = 0;
  await h.api.ensure(); await h.api.ensure();
  eq(h.calls.length, 0, 'C7f and once READY, later expands are zero network again');
})());

// ---- C8 route away / return. The lifecycle half is proved in E; this is the behavioural half.
T.push((async function () {
  var h = build();
  h.site('MKT-RESUS-US-AMAZON'); await h.api.ensure();
  h.calls.length = 0;
  await h.api.ensure();
  eq(h.calls.length, 0, 'C8  ROUTE_RETURN_REQUEST_COUNT = 0 while the module lifecycle holds the map');
})());

// ---- C9 a late answer for a scope the operator left repaints nothing
T.push((async function () {
  var h = build({ manual: true });
  h.site('MKT-RESUS-US-AMAZON');
  var p = h.api.ensure();
  h.site('MKT-RESTW-CA-AMAZON');
  h.pending.forEach(function (r) { r(); });
  await p;
  eq(h.repaints, [], 'C9  a late answer whose scope has moved on repaints NOTHING');
})());

// ---- C10 an unavailable workspace API settles FAILED rather than waiting forever
T.push((async function () {
  var h = build({ noApi: true });
  h.site('MKT-RESUS-US-AMAZON');
  await h.api.ensure();
  eq(h.api.state(), 'FAILED', 'C10 a missing workspace API settles FAILED, not NOT_LOADED');
  eq(h.api.entry().error.code, 'WORKSPACE_UNAVAILABLE', 'C10a with the real reason');
  eq(h.calls.length, 0, 'C10b and it issued no request, because there was nothing to issue it through');
  // NOT_LOADED is what holds the Execution Plan in its skeleton, so this distinction is the difference
  // between a named failure with a Retry and a spinner nothing was ever going to settle.
  eq(RV.executionReadiness({ readModelReady: true, hydrationInFlight: false, catalogue: 'READY',
    hasRoutes: false, exposureState: h.api.state(), exposureError: h.api.entry().error }).state, 'ERROR',
    'C10c and the Execution Plan reports an ERROR instead of spinning forever');
})());

var recFn = new Function('skuData', extractFn(PAGE, '_recSummaryRows') + NL + 'return _recSummaryRows(skuData);');
var LIVE = (function () {
  var s = PAGE.slice(PAGE.indexOf('function _getCloudReplenishmentData'));
  return s.slice(0, s.indexOf(NL + 'function '));
})();
var UNMOUNT = (function () {
  var s = PAGE.slice(PAGE.indexOf("KM.lifecycle.register('ops-section'"));
  s = s.slice(s.indexOf('unmount'));
  return s.slice(0, 4000);
})();

Promise.all(T).then(function () {
  // ==============================================================================================================
  section('D — "not loaded" is never rendered as zero (the four false-empty surfaces)');
  // ==============================================================================================================
  var h = build();
  h.site('MKT-RESUS-US-AMAZON');

  // #1 — the Shipping Shipment card.
  var cardCold = h.api.card('SKU-A', { exposureState: 'NOT_LOADED' });
  ok(!/>0</.test(cardCold), 'D1  FALSE-EMPTY #1: an unread shipment family prints NO zero in the card');
  ok(/&hellip;/.test(cardCold), 'D1a it prints a pending mark instead');
  var cardEmpty = h.api.card('SKU-A', { exposureState: 'READY', within18days: 0, within30days: 0,
    within45days: 0, within45plus: 0, shipOverdue: 0 });
  ok(/Within 18 days<\/span><span class="replen-card__value">0</.test(cardEmpty),
    'D1b while a READY site with genuinely nothing incoming still prints a truthful 0');
  var cardReal = h.api.card('SKU-A', { exposureState: 'READY', within18days: 350, shipOverdue: 20 });
  ok(/>350</.test(cardReal) && /Overdue/.test(cardReal), 'D1c and real numbers render as themselves');
  var cardFail = h.api.card('SKU-A', { exposureState: 'FAILED' });
  ok(/role="alert"/.test(cardFail) && /_irExposureRefresh_\(event, 'SKU-A'\)/.test(cardFail),
    'D1d a FAILED read is a named failure with a Retry, never an empty card');
  ok(!/>0</.test(cardFail), 'D1e with no fabricated zero anywhere in it');

  // #2 — the row builder default.
  ok(/var shipRemainByReceiver = null;/.test(LIVE),
    'D2  FALSE-EMPTY #2: the projection is NULL until READY, never {} — a {} makes every lookup miss and every row zero');
  ok(/within18days: shipRem \? shipRem\.d0_18 : null/.test(LIVE),
    'D2a and the DTO carries null, not 0, when it has not been read');
  ok(/var shipRem = shipRemainByReceiver/.test(LIVE),
    'D2b the zeroed default object is reached only THROUGH a non-null projection');
  ok(/exposureState: _irExpState,/.test(LIVE),
    'D2c and every row declares the state it was built under, so no consumer has to guess');

  // #3 — the Recommendation Summary.
  var recSrc = extractFn(PAGE, '_recSummaryRows');
  ok(/draftLines === null &&/.test(recSrc),
    'D3  FALSE-EMPTY #3: null drafts are branched BEFORE the "not generated" state');
  ok(/Loading the stored recommendation/.test(recFn({ exposureState: 'NOT_LOADED', _recDraftLines: null })),
    'D3a an unread site says it is loading');
  ok(/could not be read/.test(recFn({ exposureState: 'FAILED', _recDraftLines: null })),
    'D3b a failed read says so, with a Retry');
  ok(/No recommendation generated/.test(recFn({ exposureState: 'READY', _recDraftLines: [], suggestedQty: 0 })),
    'D3c a READY site with no stored draft keeps its honest "not generated" — the claim it is entitled to make');
  ok(!/No recommendation generated/.test(recFn({ exposureState: 'NOT_LOADED', _recDraftLines: null })),
    'D3d which is NEVER said about a table nobody has read');
  ok(!/getWorkspace|_irEnsureExposureLoaded_/.test(recSrc),
    'D3e and no request is issued merely to decide this label');

  // #4 — the Execution Plan editor: the historical Qty 0 defect.
  function er(st, extra) {
    var i = { readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: false, exposureState: st };
    if (extra) Object.keys(extra).forEach(function (k) { i[k] = extra[k]; });
    return RV.executionReadiness(i).state;
  }
  eq(er('NOT_LOADED'), 'LOADING', 'D4  FALSE-EMPTY #4: an unread draft table holds the Execution Plan in its SKELETON');
  eq(er('LOADING'), 'LOADING', 'D4a as does one in flight');
  eq(er('FAILED', { exposureError: { code: 'REQUEST_TIMEOUT' } }), 'ERROR',
    'D4b a failed one is a NAMED error, never an empty plan');
  eq(er('READY'), 'EMPTY', 'D4c and only a READY site may say the plan is empty');
  eq(er('LEGACY', { hasRoutes: true }), 'READY', 'D4d Legacy mode (broad cache, all nineteen present) is unchanged');
  var hyd = extractFn(PAGE, '_hydrateAllocationDraftFromDb');
  ok(/if \(drafts === null \|\| lines === null\) return false;/.test(hyd),
    'D4e the hydrate REFUSES a null source instead of `|| []`-ing it into an empty one');
  ok(!/_irWsGet\('getShippingAllocationDrafts'\) \|\| \[\]/.test(hyd),
    'D4f the `|| []` that made an unread table look empty is gone');
  ok(!/parseInt\(\s*skuData\.suggestedQty\s*\)/.test(extractFn(PAGE, 'initializeShippingAllocation')),
    'D4g QTY_ZERO_REGRESSION_REACHABLE = NO — the editor seeds no quantity at all');

  // ==============================================================================================================
  section('E — what did NOT change');
  // ==============================================================================================================
  var sug = extractFn(PAGE, '_irSuggestedQtyState_');
  eq(Object.keys(GETTER_TABLE).filter(function (g) { return sug.indexOf(g) !== -1; }), [],
    'E1  Suggested Qty reads NO exposure getter — it resolves through the materialised gap state');
  ok(/onTheWay: 0,/.test(LIVE), 'E2  On the Way is still the literal 0 it has always been (pending mapping)');

  // S8-R4B-2D REVERSED E3, AND THE PARAGRAPH IS KEPT RATHER THAN DELETED. R4B-2B's claim was true of
  // R4B-2B: lazy-once needed no backend change, because `only` was already deployed. The OPERATOR then
  // required that the second layer return only the ACTIVE site's rows, and the deployed handler has no scope
  // parameter at all - so the finding did not become wrong, its premise was replaced. What this assertion
  // must still pin is the half that has not changed: the ACTION, which is the thing a release is expensive
  // about.
  // S8-R4D-C — AND AN EXACT STAMP PIN EXPIRES THE NEXT TIME 60_ CHANGES, WHICH IT JUST DID
  // (R43, the redundant-header-read removal). The fact E3 defends is not 'the stamp is the R42 literal'
  // but 'this file carries the siteScope contract, so it is at R42 OR LATER' — pinned at BOTH
  // ends: a pre-R42 copy is rejected, and a later release is not a failure. The ACTION is pinned
  // separately below, and that is the half a release is expensive about.
  var _ro60 = require(path.join(ROOT, 'assets/tests/_release-order.js'));
  var _s60 = /SIR_BUILD_VERSION_ = '([^']+)'/.exec(G60)[1];
  ok(_ro60.stampAtOrAfter(_s60, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R42'),
    'E3  BACKEND_RELEASE_REQUIRED = YES as of S8-R4B-2D — 60_ carries the siteScope contract,'
    + ' so its stamp is R42 or later (is ' + _s60 + ')');
  ok(!_ro60.stampAtOrAfter('F1-7N-FC-1B-E3-R4-A2-R1-R6-R5', _s60),
    'E3a and the floor is a real floor — the pre-siteScope stamp 60_ held before R42 does not'
    + ' reach it');
  ok(/if \(onlySet && !onlySet\[spec\.name\]\) continue;/.test(G60),
    'E3a the `only` contract R4B-2B used was already shipped and is untouched');
  ok(/action: 'inventoryReplenishment\.workspace\.get'/.test(G60) && !/SIR_NEW_ACTION|newAction/.test(G60),
    'E3b and NO ACTION WAS ADDED — the scope is an optional payload field on the action that already existed, '
    + 'which is why the action-contract version does not move');

  var LAZY = lazySrc(PAGE);
  ok(!/localStorage|sessionStorage|indexedDB|IndexedDB/.test(LAZY),
    'E4  PERSISTENT_HARD_RELOAD_CACHE_INTRODUCED = NO');
  ok(!/CacheService/.test(LAZY), 'E4a SERVER_CACHE_INTRODUCED = NO');
  ok(!/gapJob\.status\.get/.test(LAZY), 'E4b and the exposure read starts no job');

  ok(UNMOUNT.indexOf('_irExposureByScope') === -1,
    'E5  the ops-section unmount does not touch the exposure map — which is WHY route-return is free');
  ok(UNMOUNT.indexOf('_irReadModel') === -1, 'E5a exactly as it already does not touch the read model');

  // S8-R4B-2B — THE SETTLE MUST NOT REPAINT THE TABLE. renderReplenishment() sets currentExpandedRow = null
  // and abandons both reveal generations, so a lazy read that repainted the table would CLOSE the very row
  // whose expand asked for it: open a SKU, wait, watch it vanish. Nothing on the collapsed row depends on
  // these six tables, so there is nothing in the table to repaint in the first place.
  var SETTLE = extractFn(PAGE, '_irOnExposureSettled_');
  ok(/_irHydrateDraftForAppliedScope_\(\{ skipRerender: true \}\)/.test(SETTLE),
    'E7  the lazy settle hydrates WITHOUT re-rendering the table');
  // The claim is about CODE. The reasoning above this line in the page NAMES renderReplenishment(), which is
  // the whole point of writing it down — so the probe reads the body with its comments removed.
  ok(!/renderReplenishment\(\)/.test(stripComments(SETTLE)), 'E7a and never calls renderReplenishment itself');
  ok(/if \(!\(opts && opts\.skipRerender\)\) \{ try \{ renderReplenishment\(\); \}/.test(
      extractFn(PAGE, '_irHydrateDraftForAppliedScope_')),
    'E7b while every OTHER caller of the hydrate keeps the repaint it has always had');
  ok(/_irRepaintExposureCard_\(sku\)/.test(SETTLE) && /_irRepaintRecoCard_\(sku\)/.test(SETTLE) &&
     /_irRevealPumpExec_\(\)/.test(SETTLE),
    'E7c the three SECOND-LAYER surfaces are repainted instead, and only those');
  ok(/data-reveal-state'\) !== 'ready'/.test(extractFn(PAGE, '_irRepaintRecoCard_')),
    'E7d and a panel still in its skeleton is left to its own gate — no second render transaction');

  var aw = extractFn(PAGE, '_irAfterWrite');
  ok(/_irInvalidateActiveExposure_\(\)/.test(aw),
    'E6  this page\'s own successful write invalidates the ACTIVE site entry');
  ok(!/Object\.keys\(_irExposureByScope\)/.test(aw),
    'E6a and ONLY that one — a write to US does not discard what is known about CA');

  // ==============================================================================================================
  section('F — mutation coverage');
  // ==============================================================================================================
  mut('M1  the six exposure tables are returned to the FIRST-LAYER read', function () {
    var m = PAGE.replace(extractVar(PAGE, 'IR_FIRST_LAYER_TABLES_'),
      'var IR_FIRST_LAYER_TABLES_ = ' + JSON.stringify(FIRST13.concat(EXPOSURE6)) + ';');
    var r = []; H60({ payload: { recentWindow: true, only: liftList(m, 'IR_FIRST_LAYER_TABLES_') } }, io60(r));
    return firstReads.filter(function (t) { return EXPOSURE6.indexOf(t) !== -1; }).length === 0 &&
      r.filter(function (t) { return EXPOSURE6.indexOf(t) !== -1; }).length === 6;
  });
  mut('M2  one of the six is dropped from the EXPOSURE read', function () {
    var m = PAGE.replace(extractVar(PAGE, 'IR_EXPOSURE_TABLES_'),
      'var IR_EXPOSURE_TABLES_ = ' + JSON.stringify(EXPOSURE6.slice(0, 5)) + ';');
    var mutated = liftList(m, 'IR_EXPOSURE_TABLES_');
    return FIRST13.concat(EXPOSURE6).length === SERVER19.length &&
      FIRST13.concat(mutated).length !== SERVER19.length;
  });
  mut('M3  the cache key gains the SKU (one read per expand — the N+1 this round removes)', function () {
    var m = mutateFn(PAGE, '_irExposureScopeKey_', "a.marketplaceId].join('|');", "a.marketplaceId, a.sku || ''].join('|');");
    var hm = build({}, m), hs = build({});
    hm.site('MKT-RESUS-US-AMAZON'); hs.site('MKT-RESUS-US-AMAZON');
    return hs.api.key() === 'ResUS|US|MKT-RESUS-US-AMAZON' && hm.api.key() === 'ResUS|US|MKT-RESUS-US-AMAZON|';
  });
  mutAsync('M4  a site switch CLEARS every other site (US -> CA -> US costs a second US read)', function () {
    var m = mutateFn(PAGE, '_irEnsureExposureLoaded_', '    var e = _irExposureByScope[key];',
      '    Object.keys(_irExposureByScope).forEach(function (k) { if (k !== key) delete _irExposureByScope[k]; });' +
      NL + '    var e = _irExposureByScope[key];');
    function run(h) {
      h.site('MKT-RESUS-US-AMAZON');
      return h.api.ensure()
        .then(function () { h.site('MKT-RESTW-CA-AMAZON'); return h.api.ensure(); })
        .then(function () { h.site('MKT-RESUS-US-AMAZON'); return h.api.ensure(); })
        .then(function () { return h.calls.length; });
    }
    return Promise.all([run(build({})), run(build({}, m))]).then(function (r) {
      eq(r, [2, 3], 'M4a the shipped code costs 2 requests where the mutant costs 3');
      return r[0] === 2 && r[1] === 3;
    });
  });
  mutAsync('M5  a READY entry still issues a network request', function () {
    var m = mutateFn(PAGE, '_irEnsureExposureLoaded_',
      '        if (e.state === IR_EXPOSURE_STATES_.READY) return Promise.resolve(e);', '');
    function run(h) {
      h.site('MKT-RESUS-US-AMAZON');
      return h.api.ensure().then(function () { h.calls.length = 0; return h.api.ensure(); })
        .then(function () { return h.calls.length; });
    }
    return Promise.all([run(build({})), run(build({}, m))]).then(function (r) {
      eq(r, [0, 1], 'M5a a second expand costs the shipped code 0 and the mutant 1');
      return r[0] === 0 && r[1] === 1;
    });
  });
  mut('M6  a LOADING entry starts a SECOND request instead of joining the first', function () {
    var m = mutateFn(PAGE, '_irEnsureExposureLoaded_',
      '        if (e.state === IR_EXPOSURE_STATES_.LOADING) return e.promise;', '');
    var hm = build({ manual: true }, m), hs = build({ manual: true });
    hm.site('MKT-RESUS-US-AMAZON'); hm.api.ensure(); hm.api.ensure();
    hs.site('MKT-RESUS-US-AMAZON'); hs.api.ensure(); hs.api.ensure();
    return hs.calls.length === 1 && hm.calls.length === 2;
  });
  mutAsync('M7  a FAILED entry auto-retries on every render', function () {
    var m = mutateFn(PAGE, '_irEnsureExposureLoaded_',
      '        if (e.state === IR_EXPOSURE_STATES_.FAILED && !(opts && opts.retry)) return Promise.resolve(e);', '');
    function run(h) {
      h.site('MKT-RESUS-US-AMAZON');
      return h.api.ensure().then(function () { return h.api.ensure(); })
        .then(function () { return h.api.ensure(); }).then(function () { return h.calls.length; });
    }
    return Promise.all([run(build({ failTimes: 99 })), run(build({ failTimes: 99 }, m))]).then(function (r) {
      eq(r, [1, 3], 'M7a one failed read stays one request; the mutant storms');
      return r[0] === 1 && r[1] === 3;
    });
  });
  mutAsync('M8  a FAILED read installs an EMPTY model as READY', function () {
    var m = mutateFn(PAGE, '_irEnsureExposureLoaded_', '            entry.state = IR_EXPOSURE_STATES_.FAILED;',
      '            entry.state = IR_EXPOSURE_STATES_.READY; entry.model = {};');
    var hm = build({ failTimes: 99 }, m), hs = build({ failTimes: 99 });
    hm.site('MKT-RESUS-US-AMAZON'); hs.site('MKT-RESUS-US-AMAZON');
    return Promise.all([hs.api.ensure(), hm.api.ensure()]).then(function () {
      var r = [hs.api.state(), hm.api.state()];
      eq(r, ['FAILED', 'READY'],
        'M8a the mutant calls a failed read READY, which is exactly the lie this state exists to prevent');
      return r[0] === 'FAILED' && r[1] === 'READY' && hs.api.get('getShipments') === null;
    });
  });
  mut('M9  the sentinel returns [] instead of null, so NOT_LOADED becomes a loaded-empty table', function () {
    var m = mutateFn(PAGE, '_irExposureGet_',
      '    if (!e || e.state !== IR_EXPOSURE_STATES_.READY || !e.model) return null;',
      '    if (!e || e.state !== IR_EXPOSURE_STATES_.READY || !e.model) return [];');
    var hm = build({}, m), hs = build({});
    hm.site('MKT-RESUS-US-AMAZON'); hs.site('MKT-RESUS-US-AMAZON');
    return hs.api.get('getShipments') === null && Array.isArray(hm.api.get('getShipments'));
  });
  mut('M10 NOT_LOADED is rendered as a zero in the Shipping Shipment card', function () {
    var m = mutateFn(PAGE, '_irShipCardInnerHtml_',
      '    if (state === IR_EXPOSURE_STATES_.NOT_LOADED || state === IR_EXPOSURE_STATES_.LOADING) {',
      '    if (false) {');
    var hm = build({}, m);
    hm.site('MKT-RESUS-US-AMAZON');
    return !/>0</.test(h.api.card('SKU-A', { exposureState: 'NOT_LOADED' })) &&
      />0</.test(hm.api.card('SKU-A', { exposureState: 'NOT_LOADED' }));
  });
  mut('M11 NOT_LOADED is rendered as "not generated" in the Recommendation Summary', function () {
    var m = mutateFn(PAGE, '_recSummaryRows', '    if (draftLines === null &&', '    if (false &&');
    var mf = new Function('skuData', extractFn(m, '_recSummaryRows') + NL + 'return _recSummaryRows(skuData);');
    var arg = { exposureState: 'NOT_LOADED', _recDraftLines: null, suggestedQty: 0 };
    return !/No recommendation generated/.test(recFn(arg)) && /No recommendation generated/.test(mf(arg));
  });
  mut('M12 the Execution Plan paints before the draft table is read (the Qty 0 road)', function () {
    var m = CMPSRC.replace("    if (exposure === 'LOADING' || exposure === 'NOT_LOADED') return mk(S.LOADING, '', null);", '');
    var mod = { exports: {} }; new Function('module', 'exports', m)(mod, mod.exports);
    var inp = { readModelReady: true, hydrationInFlight: false, catalogue: 'READY', hasRoutes: false, exposureState: 'NOT_LOADED' };
    return RV.executionReadiness(inp).state === 'LOADING' &&
      mod.exports.IRPlanningReveal.executionReadiness(inp).state === 'EMPTY';
  });
  mut('M13 the hydrate launders a null draft source back into an empty one', function () {
    var m = mutateFn(PAGE, '_hydrateAllocationDraftFromDb',
      '        if (drafts === null || lines === null) return false;', '');
    return /if \(drafts === null \|\| lines === null\) return false;/.test(extractFn(PAGE, '_hydrateAllocationDraftFromDb')) &&
      !/if \(drafts === null \|\| lines === null\) return false;/.test(extractFn(m, '_hydrateAllocationDraftFromDb'));
  });
  mut('M14 route-return clears the cache (the unmount starts dropping the map)', function () {
    var m = PAGE.replace('            _removeLegacyBodyAllocPanel();', '            _irExposureByScope = {};');
    var mu = m.slice(m.indexOf("KM.lifecycle.register('ops-section'"));
    mu = mu.slice(mu.indexOf('unmount'));
    return UNMOUNT.indexOf('_irExposureByScope') === -1 && m.indexOf('_irExposureByScope = {};') !== -1;
  });
  mutAsync('M15 explicit refresh clears EVERY site instead of the affected one', function () {
    var m = mutateFn(PAGE, '_irExposureRefresh_', '    _irInvalidateActiveExposure_();',
      '    Object.keys(_irExposureByScope).forEach(function (k) { delete _irExposureByScope[k]; });');
    function run(h) {
      h.site('MKT-RESUS-US-AMAZON');
      return h.api.ensure()
        .then(function () { h.site('MKT-RESTW-CA-AMAZON'); return h.api.ensure(); })
        .then(function () { h.site('MKT-RESUS-US-AMAZON'); h.api.refresh(null, 'X'); return tick(); })
        .then(tick).then(function () { h.site('MKT-RESTW-CA-AMAZON'); return h.api.state(); });
    }
    return Promise.all([run(build({})), run(build({}, m))]).then(function (r) {
      eq(r, ['READY', 'NOT_LOADED'], 'M15a the shipped refresh leaves CA READY; the mutant wipes it');
      return r[0] === 'READY' && r[1] === 'NOT_LOADED';
    });
  });
  mutAsync('M16 explicit refresh fails to clear the affected site (Refresh becomes a no-op)', function () {
    var m = mutateFn(PAGE, '_irExposureRefresh_', '    _irInvalidateActiveExposure_();', '');
    function run(h) {
      h.site('MKT-RESUS-US-AMAZON');
      return h.api.ensure().then(function () { h.api.refresh(null, 'X'); return tick(); })
        .then(tick).then(function () { return h.calls.length; });
    }
    return Promise.all([run(build({})), run(build({}, m))]).then(function (r) {
      eq(r, [2, 1], 'M16a the shipped refresh re-reads the affected site; the mutant does nothing');
      return r[0] === 2 && r[1] === 1;
    });
  });
  mutAsync('M19 the lazy settle repaints the whole table (which closes the row that asked for it)', function () {
    var m = mutateFn(PAGE, '_irOnExposureSettled_',
      '_irHydrateDraftForAppliedScope_({ skipRerender: true })', '_irHydrateDraftForAppliedScope_()');
    // The proof is structural: skipRerender is the ONLY thing standing between this settle and the
    // currentExpandedRow = null inside renderReplenishment().
    var shipped = extractFn(PAGE, '_irOnExposureSettled_');
    var mutated = extractFn(m, '_irOnExposureSettled_');
    return Promise.resolve(/skipRerender: true/.test(shipped) && !/skipRerender: true/.test(mutated) &&
      /if \(!\(opts && opts\.skipRerender\)\) \{ try \{ renderReplenishment\(\);/.test(
        extractFn(PAGE, '_irHydrateDraftForAppliedScope_')));
  });
  mutAsync('M20 an unavailable workspace API leaves the entry NOT_LOADED (a spinner nothing settles)', function () {
    var m = mutateFn(PAGE, '_irEnsureExposureLoaded_',
      '        _irExposureByScope[key] = { key: key, state: IR_EXPOSURE_STATES_.FAILED, promise: null, model: null,' + NL +
      '            indexes: null, loadedAt: 0, generation: ++_irExposureSeq,' + NL +
      "            error: { code: 'WORKSPACE_UNAVAILABLE', message: 'Inventory Replenishment Workspace API unavailable.' } };" + NL +
      '        _irOnExposureSettled_(key);' + NL +
      '        return Promise.resolve(_irExposureByScope[key]);',
      '        return Promise.resolve(null);');
    function run(h) { h.site('MKT-RESUS-US-AMAZON'); return h.api.ensure().then(function () { return h.api.state(); }); }
    return Promise.all([run(build({ noApi: true })), run(build({ noApi: true }, m))]).then(function (r) {
      eq(r, ['FAILED', 'NOT_LOADED'], 'M20a the shipped code names the failure; the mutant waits forever');
      return r[0] === 'FAILED' && r[1] === 'NOT_LOADED';
    });
  });
  mut('M17 a cross-site prefetch is introduced', function () {
    var m = mutateFn(PAGE, '_irEnsureExposureLoaded_', '    return entry.promise;',
      "    try { _irWsGet('getMarketplaces').forEach(function () { window.KM.api.getWorkspace('inventoryReplenishment', { only: IR_EXPOSURE_TABLES_.slice() }); }); } catch (e) {}" +
      NL + '    return entry.promise;');
    var hm = build({ manual: true }, m), hs = build({ manual: true });
    hm.site('MKT-RESUS-US-AMAZON'); hs.site('MKT-RESUS-US-AMAZON');
    hm.api.ensure(); hs.api.ensure();
    return hs.calls.length === 1 && hm.calls.length === 4;
  });
  mutAsync('M18 a late answer for a scope the operator left still repaints the screen', function () {
    var m = mutateFn(PAGE, '_irOnExposureSettled_',
      '    if (key !== _irExposureScopeKey_()) return;', '    if (false) return;');
    function run(h) {
      h.site('MKT-RESUS-US-AMAZON');
      var p = h.api.ensure();
      h.site('MKT-RESTW-CA-AMAZON');
      h.pending.forEach(function (r) { r(); });
      return p.then(function () { return h.repaints.length; });
    }
    return Promise.all([run(build({ manual: true })), run(build({ manual: true }, m))]).then(function (r) {
      eq([r[0], r[1] > 0], [0, true], 'M18a the shipped code repaints nothing; the mutant paints into a scope that is gone');
      return r[0] === 0 && r[1] > 0;
    });
  });

  // ------------------------------------------------------------------------------------------------------
  // VACUITY. mutateFn throws when its target is absent, so a probe cannot silently match nothing — but that
  // only holds if the targets really are there. Each one is asserted present in the SHIPPED source, exactly
  // once, so a mutant can never be scored against a line that has moved.
  // ------------------------------------------------------------------------------------------------------
  [['_irEnsureExposureLoaded_', 'if (e.state === IR_EXPOSURE_STATES_.READY) return Promise.resolve(e);'],
   ['_irEnsureExposureLoaded_', 'if (e.state === IR_EXPOSURE_STATES_.LOADING) return e.promise;'],
   ['_irEnsureExposureLoaded_', 'if (e.state === IR_EXPOSURE_STATES_.FAILED && !(opts && opts.retry)) return Promise.resolve(e);'],
   ['_irEnsureExposureLoaded_', 'entry.state = IR_EXPOSURE_STATES_.FAILED;'],
   ['_irExposureGet_', 'if (!e || e.state !== IR_EXPOSURE_STATES_.READY || !e.model) return null;'],
   ['_irOnExposureSettled_', 'if (key !== _irExposureScopeKey_()) return;'],
   ['_irExposureRefresh_', '_irInvalidateActiveExposure_();'],
   ['_irShipCardInnerHtml_', 'if (state === IR_EXPOSURE_STATES_.NOT_LOADED || state === IR_EXPOSURE_STATES_.LOADING) {'],
   ['_recSummaryRows', 'if (draftLines === null &&'],
   ['_hydrateAllocationDraftFromDb', 'if (drafts === null || lines === null) return false;']
  ].forEach(function (p) {
    var body = extractFn(PAGE, p[0]).split(CR + LF).join(LF);
    var find = p[1].split(CR + LF).join(LF);
    var n = body.split(find).length - 1;
    eq(n, 1, 'V   mutation target present exactly once in ' + p[0] + ': ' + find.slice(0, 48));
  });
  ok(CMPSRC.split("if (exposure === 'LOADING' || exposure === 'NOT_LOADED') return mk(S.LOADING, '', null);").length - 1 === 1,
    'V   and the executionReadiness exposure gate is present exactly once');

  return Promise.all(PENDING);
}).then(function () {
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
  if (fail) process.exit(1);
}).catch(function (e) {
  console.error('HARNESS ERROR: ' + (e && (e.stack || e.message) || e));
  process.exit(1);
});
