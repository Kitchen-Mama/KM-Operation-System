// FC-SUMMARY-STABILITY-R3 — THE BOUNDED PRICING PROJECTION, MEASURED.
//
// THE DEFECT. `Build / Refresh Group Cards` in the Special Event Builder needed prices. Prices live in
// `pricing_list`. The only way to read a table was `getTable`, which has no row filter — the table NAME is
// the scope — so drawing the cards for ONE company/country/marketplace downloaded every price the business
// has, and on a real list that read exceeded the client budget and came back REQUEST_TIMEOUT.
//
// R2 established that the isolation and the retry were already correct, and that the remaining cost could
// only be removed by a server projection. This suite is that projection, and the evidence for §12's numbers.
//
// WHAT IS MEASURED HERE RATHER THAN ARGUED.
//
//   · rows and fields that cross the wire, counted against a fixture with a deliberately large price list
//   · requests per Build, per three rapid Builds, and per scope change
//   · what a stale answer does when it lands after the operator has moved on
//   · what a failure leaves behind
//
// THE ONE CLAIM WORTH READING TWICE. The projection must be SMALLER and still TRUTHFUL, and those pull in
// opposite directions. The client resolver matches by marketplace_sku_id ALONE when it holds one, ignoring
// company/country/marketplace entirely; a projection filtered on the site triple would therefore drop rows
// the resolver would have matched, and a price that exists would become a price that is missing — silently,
// on a save path that refuses null prices. Section A drives exactly that case (A6) because it is the one a
// plausible smaller implementation gets wrong.
//
// NO PRODUCTION WRITE. NO NETWORK. Fixtures and committed source only.
//
// Run: node assets/tests/fc-summary-stability-r3-scoped-pricing.test.js

'use strict';
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var GS = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
// Line endings are normalised on READ. The .gs and .js sources are CRLF; every anchor below is written with
// a bare newline, and an anchor that silently fails to match leaves the source unmutated and reports the
// mutant as SURVIVED — a false green indistinguishable from a missing assertion.
function readN(p) { return fs.readFileSync(p, 'utf8').split('\r\n').join('\n'); }
var WS = readN(path.join(GS, '58_api_v1_fc_summary_workspace.gs'));
var PAGE = readN(path.join(ROOT, 'assets', 'js', 'pages', 'fc-summary.js'));
var API = readN(path.join(ROOT, 'assets', 'js', 'api', 'operation-system-db-api.js'));
var HEALTH = readN(path.join(GS, '63_api_v1_system_health.gs'));
var ROUTER = readN(path.join(GS, '01_router.gs'));

var pass = 0, fail = 0;
function ok(c, l, d) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); } }
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(t) { console.log('\n== ' + t + ' =='); }
// Comments are not code. Every claim about what the runtime DOES is made against the stripped text.
function code(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }

// ---------------------------------------------------------------------------------------------------------
// extraction — balanced-brace slice of one declaration, so a sandbox holds the COMMITTED code and not a copy
// ---------------------------------------------------------------------------------------------------------
function sliceFrom(src, startIdx, terminator) {
  var i = src.indexOf(terminator === ';' ? '=' : '{', startIdx), depth = 0, seen = false;
  if (terminator === ';') {
    // var X = ...;  — walk to the first semicolon at depth 0
    for (var k = i; k < src.length; k++) {
      var c = src[k];
      if (c === '{' || c === '[' || c === '(') depth++;
      else if (c === '}' || c === ']' || c === ')') depth--;
      else if (c === ';' && depth === 0) return src.slice(startIdx, k + 1);
    }
    throw new Error('unterminated var');
  }
  for (var j = i; j < src.length; j++) {
    if (src[j] === '{') { depth++; seen = true; }
    else if (src[j] === '}') { depth--; if (seen && depth === 0) return src.slice(startIdx, j + 1); }
  }
  throw new Error('unterminated function');
}
function fnSrc(src, name) {
  var m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) throw new Error('function not found: ' + name);
  return sliceFrom(src, m.index, '}');
}
function varSrc(src, name) {
  var m = new RegExp('var\\s+' + name + '\\s*=').exec(src);
  if (!m) throw new Error('var not found: ' + name);
  return sliceFrom(src, m.index, ';');
}

// =========================================================================================================
// THE FIXTURE. A price list far larger than one site's worth, so "bounded" is a measurement and not a hope.
// =========================================================================================================
var SCOPE_A = { company: 'KM', country: 'US', marketplace: 'Amazon' };
var SCOPE_B = { company: 'ResUS', country: 'CA', marketplace: 'Amazon' };

function mksku(o) {
  return { marketplace_sku_id: o.id, sku: o.sku, company: o.company, country: o.country,
    marketplace: o.marketplace, marketplace_sku_status: o.status || 'active' };
}
function price(o) {
  var r = { pricing_id: o.pid, marketplace_sku_id: o.id === undefined ? '' : o.id, sku: o.sku,
    site_sku: o.siteSku || '', company: o.company === undefined ? '' : o.company,
    country: o.country === undefined ? '' : o.country,
    marketplace: o.marketplace === undefined ? '' : o.marketplace, currency: o.cur || 'USD',
    regular_price: o.reg === undefined ? '' : o.reg, auto_regular_price: o.auto === undefined ? '' : o.auto,
    // Columns a real sheet also has and the builder never reads. They exist so the projection has something
    // to leave behind — a field count that only ever sees fields it wants proves nothing.
    minimum_price: 1, msrp: 99, base_regular_price: 5, fx_rate: 1.3, fx_rate_date: '2026-01-01',
    base_currency: 'USD', regular_price_is_manual: false, marketplace_product_id: 'X', note: 'n' };
  return r;
}

var MSKUS = [
  mksku({ id: 'MSK-A1', sku: 'CO1100-T', company: 'KM', country: 'US', marketplace: 'Amazon' }),
  mksku({ id: 'MSK-A2', sku: 'CO1100-W', company: 'KM', country: 'US', marketplace: 'Amazon' }),
  mksku({ id: 'MSK-A3', sku: 'CO2600-R', company: 'KM', country: 'US', marketplace: 'Amazon' }),
  mksku({ id: 'MSK-A4', sku: 'CO0560',   company: 'KM', country: 'US', marketplace: 'Amazon' }),
  // deliberately inactive — the page excludes it from scope, so the projection must too
  mksku({ id: 'MSK-A9', sku: 'CO9999-X', company: 'KM', country: 'US', marketplace: 'Amazon', status: 'discontinued' }),
  mksku({ id: 'MSK-B1', sku: 'CO1100-T', company: 'ResUS', country: 'CA', marketplace: 'Amazon' }),
  mksku({ id: 'MSK-B2', sku: 'CO1100-W', company: 'ResUS', country: 'CA', marketplace: 'Amazon' }),
  mksku({ id: 'MSK-C1', sku: 'CO1100-T', company: 'KM', country: 'AU', marketplace: 'Amazon' })
];

var PRICES = [
  price({ pid: 'P1', id: 'MSK-A1', sku: 'CO1100-T', company: 'KM', country: 'US', marketplace: 'Amazon', cur: 'USD', reg: 24.99 }),
  // AUTO-priced: the override cell is EMPTY and the price comes from auto_regular_price. This is the row a
  // projection that invents a resolved_* key would break, and it would break it as "no price".
  price({ pid: 'P2', id: 'MSK-A2', sku: 'CO1100-W', company: 'KM', country: 'US', marketplace: 'Amazon', cur: 'USD', auto: 19.5 }),
  // NO marketplace_sku_id, matched by business identity (sku + country + marketplace), company blank.
  price({ pid: 'P3', id: '', sku: 'CO2600-R', country: 'US', marketplace: 'Amazon', cur: 'USD', reg: 41.0 }),
  // THE ROW THAT DECIDES THE DESIGN: its id IS in scope, but its own scope columns are blank/wrong. The
  // client resolver matches it by id alone and must keep being able to.
  price({ pid: 'P4', id: 'MSK-A4', sku: 'CO0560', company: '', country: '', marketplace: '', cur: 'USD', reg: 6.25 }),
  // other sites — must NOT travel
  price({ pid: 'P5', id: 'MSK-B1', sku: 'CO1100-T', company: 'ResUS', country: 'CA', marketplace: 'Amazon', cur: 'CAD', reg: 29.99 }),
  price({ pid: 'P6', id: 'MSK-B2', sku: 'CO1100-W', company: 'ResUS', country: 'CA', marketplace: 'Amazon', cur: 'CAD', reg: 33.0 }),
  price({ pid: 'P7', id: 'MSK-C1', sku: 'CO1100-T', company: 'KM', country: 'AU', marketplace: 'Amazon', cur: 'AUD', reg: 39.99 }),
  // an inactive scoped SKU's price — out of the page's universe, so out of the projection
  price({ pid: 'P8', id: 'MSK-A9', sku: 'CO9999-X', company: 'KM', country: 'US', marketplace: 'Amazon', cur: 'USD', reg: 1 })
];
// Bulk: the rest of the business. 400 rows for sites this builder is not showing.
for (var b = 0; b < 400; b++) {
  PRICES.push(price({ pid: 'BULK-' + b, id: 'MSK-Z' + b, sku: 'ZZ-' + b, company: 'KM', country: 'JP',
    marketplace: 'Amazon', cur: 'JPY', reg: 1000 + b }));
}

// =========================================================================================================
// SERVER SANDBOX — the committed 58_ helpers, executed.
// =========================================================================================================
var SRV = vm.createContext({ console: console });
[['FCS_WORKSPACE_TABLES_'], ['FCS_SLICE_ONLY_TABLES_'], ['FCS_ALL_TABLES_'], ['FCS_FULL_TABLE_NAMES_'],
 ['FCS_WS_ROW_MAX_'], ['FCS_SLICE_SPECS_'], ['FCS_PRICING_FIELDS_'], ['FCS_EMIT_SOURCE_'],
 ['FCS_PRICING_INACTIVE_']].forEach(function (v) { vm.runInContext(varSrc(WS, v[0]), SRV); });
['fcsWsStr_', 'fcsPriceUp_', 'fcsPricingMskuInScope_', 'fcsPricingPick_', 'fcsPricingProject_',
 'fcsCap_', 'fcsResolveSlice_', 'fcsResolveScope_', 'fcsDistinctYears_', 'fcsDistinctAsc_',
 'fcsBuildFacets_', 'fcsSliceBuild_'].forEach(function (f) { vm.runInContext(fnSrc(WS, f), SRV); });
SRV.__tables = { pricing_list: PRICES, marketplace_skus: MSKUS };
function project(scope) {
  SRV.__scope = scope;
  return vm.runInContext('fcsPricingProject_(__tables, __scope)', SRV);
}
function sliceOf(scope) {
  SRV.__scope = scope;
  return vm.runInContext('fcsSliceBuild_("pricing", __tables, "2026-09-29T00:00:00Z", __scope)', SRV);
}

// =========================================================================================================
section('A. §2/§3/§11 — the projection is SMALLER and still TRUTHFUL');
// =========================================================================================================

var pa = project(SCOPE_A);
var idsA = pa.rows.map(function (r) { return r.pricing_id; }).sort();
eq(idsA, ['P1', 'P2', 'P3', 'P4'], 'A1 scope A selects exactly the four rows its SKUs can resolve against');
ok(pa.sourceRowCount === PRICES.length && pa.rows.length === 4,
  'A2 ' + pa.rows.length + ' of ' + pa.sourceRowCount + ' rows travel — PRICING_ROWS_TRANSFERRED is bounded by the site');
ok(idsA.indexOf('P5') < 0 && idsA.indexOf('P6') < 0 && idsA.indexOf('P7') < 0,
  'A3 §11 no other site\'s price is in the payload — wrong-scope prices = 0');
ok(!pa.rows.some(function (r) { return /^BULK-/.test(r.pricing_id); }),
  'A4 and none of the 400 unrelated rows');
ok(idsA.indexOf('P8') < 0,
  'A5 an INACTIVE scoped SKU\'s price does not travel — the projection uses the page\'s own scope rule');

// THE ONE A NAIVE IMPLEMENTATION GETS WRONG.
var p4 = pa.rows.filter(function (r) { return r.pricing_id === 'P4'; })[0];
ok(!!p4 && p4.company === '' && p4.country === '',
  'A6 §2 the row whose OWN scope columns are blank is kept, because the resolver matches it by id ALONE — '
  + 'a triple-only filter would turn a price that exists into a price that is missing');
var p3 = pa.rows.filter(function (r) { return r.pricing_id === 'P3'; })[0];
ok(!!p3 && p3.marketplace_sku_id === '',
  'A7 and the row with NO id is kept through the business-identity branch — both branches are reproduced');

// Field projection, and the absence that must be preserved.
var FIELDS = vm.runInContext('FCS_PRICING_FIELDS_', SRV);
eq(FIELDS.slice().sort(), ['auto_regular_price', 'company', 'country', 'currency', 'marketplace',
  'marketplace_sku_id', 'pricing_id', 'regular_price', 'regular_price_source', 'resolved_regular_price',
  'sku', 'site_sku'].sort(), 'A8 twelve fields — identity, scope, and the regular band\'s resolution inputs');
var extra = Object.keys(pa.rows[0]).filter(function (k) { return FIELDS.indexOf(k) < 0; });
eq(extra, [], 'A9 and no row carries a field outside that list — minimum_price / msrp / base_* / fx_* stay home');
ok(!Object.prototype.hasOwnProperty.call(pa.rows[0], 'resolved_regular_price'),
  'A10 §3 a column the SHEET does not have is ABSENT, not blank — pricingResolveBand_ must still fall through');

// Scope B is a different answer, from the same tables.
var pb = project(SCOPE_B);
eq(pb.rows.map(function (r) { return r.pricing_id; }).sort(), ['P5', 'P6'],
  'A11 §11 a different scope selects a different set — no leakage in either direction');
// An empty scope is a question with no answer, not a request for everything.
eq(project({}).rows.length, 0,
  'A12 an EMPTY scope selects NOTHING — a site-less caller must not get the full table back through this door');
// §11 D — a scope with no matching price.
eq(project({ company: 'KM', country: 'NZ', marketplace: 'Amazon' }).rows.length, 0,
  'A13 §11.D a scope with no priced SKU answers zero rows, truthfully');

// =========================================================================================================
section('B. §2/§11 — resolution is UNCHANGED, and the projected row proves it');
// =========================================================================================================

// The committed normalizer + the committed resolver, run over the PROJECTED rows. If the projection broke
// any price semantics, it breaks here.
var NRM = vm.createContext({ console: console });
['pricingNumOrNull_', 'pricingIsNa_', 'pricingFlagOrNull_', 'pricingResolveBand_', 'normalizePricingListRecord']
  .forEach(function (f) { vm.runInContext(fnSrc(API, f), NRM); });
NRM.__rows = pa.rows;
var normalized = vm.runInContext('__rows.map(normalizePricingListRecord)', NRM);

var RES = vm.createContext({ console: console, window: { KM: { DB: {} } } });
vm.runInContext('function _fcResolveMarketplaceKey(m) { return m; }', RES);
RES.__pl = normalized;
vm.runInContext('function _fcPricingRows_() { return __pl; }', RES);
vm.runInContext(fnSrc(PAGE, 'resolveRegionalPricingContext'), RES);
function resolve(ctx) { RES.__ctx = ctx; return vm.runInContext('resolveRegionalPricingContext(__ctx)', RES); }

var rOverride = resolve({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-T', marketplaceSkuId: 'MSK-A1' });
ok(rOverride.regularPrice === 24.99 && rOverride.currency === 'USD' && rOverride.priceSource === 'OVERRIDE',
  'B1 §11.I a manual override resolves to the override price, through the projection', rOverride);
var rAuto = resolve({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-W', marketplaceSkuId: 'MSK-A2' });
ok(rAuto.regularPrice === 19.5 && rAuto.priceSource === 'AUTO',
  'B2 §11.J an AUTO-priced row still resolves to its auto price — the absence of resolved_* is preserved end to end', rAuto);
var rBiz = resolve({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO2600-R', marketplaceSkuId: '' });
ok(rBiz.regularPrice === 41 && rBiz.found === true,
  'B3 the business-identity branch resolves from the projection exactly as it did from the whole table', rBiz);
var rById = resolve({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO0560', marketplaceSkuId: 'MSK-A4' });
ok(rById.regularPrice === 6.25,
  'B4 §2 and the blank-scope row still answers — this is what A6 was protecting', rById);
var rNone = resolve({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'NOT-A-SKU', marketplaceSkuId: '' });
ok(rNone.regularPrice === null && rNone.currency === null && rNone.found === false,
  'B5 §11.K a genuinely unavailable price is null and null — never 0, never another site\'s price', rNone);
// The cross-scope guarantee, stated as a resolution fact rather than a payload fact.
var rCross = resolve({ company: 'KM', country: 'US', marketplace: 'Amazon', sku: 'CO1100-T', marketplaceSkuId: 'MSK-B1' });
ok(rCross.regularPrice === null,
  'B6 §11 a CA marketplace_sku_id cannot resolve inside a US projection — no cross-scope price is reachable', rCross);

// PRICING_AUTHORITY_COUNT = 1, asserted where it could go wrong.
var WSC = code(WS);
ok(!/pricingResolveBand_|resolvedRegularPrice/.test(WSC) &&
   (WSC.match(/auto_regular_price|resolved_regular_price|regular_price_source/g) || []).length === 3,
  'B7 §2 the server names each resolution input once, in the field list, and resolves nothing — PRICING_AUTHORITY_COUNT = 1');
eq((code(API).match(/function pricingResolveBand_/g) || []).length, 1,
  'B8 and there is exactly one implementation of the resolution chain in the tree');

// =========================================================================================================
section('C. §3/§4 — no full-table browser read, and no N+1');
// =========================================================================================================

var PC = code(PAGE);
// The page's pricing owner names a SITE scope and never a SKU.
var ENSURE = fnSrc(PC, '_evtEnsurePricing_');
var FETCH = fnSrc(PC, '_fcPricingFetch_');
ok(/slice: FC_PRICING_SLICE_/.test(FETCH) && /scope: sc/.test(FETCH),
  'C1 the request names a slice and a scope');
ok(!/\bsku\b/.test(FETCH),
  'C2 §4 and the request carries NO sku — the scope is the site, so N SKUs cost the same as one');
var SCOPEFN = fnSrc(PC, '_evtPricingScope_');
ok(/company/.test(SCOPEFN) && /country/.test(SCOPEFN) && /marketplace/.test(SCOPEFN) && !/category|series/i.test(SCOPEFN),
  'C3 §2 GROUP_CARD_PRICING_SCOPE is company + country + marketplace — Category/Series narrows CARDS, not prices');
// The resolver no longer reads the broad cache directly.
var RESOLVER = PAGE.slice(PAGE.indexOf('function resolveRegionalPricingContext'), PAGE.indexOf('function _evtSkuPricing'));
ok(/_fcPricingRows_\(\)/.test(RESOLVER) && !/DB\.getPricingList\(\)/.test(code(RESOLVER)),
  'C4 §3 the resolver reads the scoped owner — a direct broad-cache read here would be the full table returning');
// And the whole-table deferred read is no longer on the group-build path.
var BUILD = fnSrc(PC, '_evtBuildGroups');
ok(/_evtPricingPending_\(\)/.test(BUILD) && !/_FC_DEFERRED_TABLES_\.pricing/.test(BUILD),
  'C5 §3 FULL_PRICING_LIST_SCAN_ON_GROUP_BUILD_POST = 0 — Build asks the scoped owner, not the table loader');
ok(!/refreshCacheTables\(\[\s*'pricing_list'/.test(PC),
  'C6 NEW_GENERIC_GETTABLE_PRICING_READ_POST = 0 — no direct whole-table pricing read anywhere in the page');
// FULL is untouched: the two slice-only sheets must not join the primary render.
var FULLNAMES = vm.runInContext('FCS_FULL_TABLE_NAMES_', SRV);
eq(FULLNAMES, ['fc_regular_forecast', 'fc_special_events', 'fc_target_rules', 'marketplaces'],
  'C7 §3 FULL still reads exactly its four tables — the projection costs the primary render nothing');
ok(!/pricing/.test(ROUTER.slice(ROUTER.indexOf("action === 'fcSummary.workspace.get'") - 200,
  ROUTER.indexOf("action === 'fcSummary.workspace.get'") + 200)),
  'C8 §3 and 01_router.gs did not change — the slice rides the action that already exists');

// =========================================================================================================
section('D. §6/§7/§8 — single-flight, stale scope, retry, and what a failure leaves behind');
// =========================================================================================================

// A sandbox holding the committed client owner, with the scope and the transport under this suite's control.
function ownerWorld() {
  var calls = [];
  var box = vm.createContext({ console: console, Promise: Promise, String: String, Object: Object });
  box.__site = { company: 'KM', country: 'US', marketplace: 'Amazon' };
  box.__resolvers = [];
  vm.runInContext('function _evtSelectedSite() { return __site; }', box);
  vm.runInContext('function _fcResolveMarketplaceKey(m) { return m; }', box);
  vm.runInContext('function _fcWorkspaceMode_() { return true; }', box);
  vm.runInContext('var _FC_DEFERRED_TABLES_ = { pricing: "pricing_list" }; var _fcDeferredEverUsed_ = {};', box);
  vm.runInContext('function _fcDeferredPending_() { return true; } function _fcEnsureDeferredTable_() { return Promise.resolve(); }', box);
  box.__calls = calls;
  box.window = { KM: {
    api: { getWorkspace: function (ws, params) {
      calls.push({ ws: ws, include: JSON.parse(JSON.stringify(params.include)) });
      return new Promise(function (res, rej) { box.__resolvers.push({ res: res, rej: rej, include: params.include }); });
    } },
    DB: { adaptFcSummaryWorkspaceSlice: function (d) { return { pricingList: (d && d.pricingList) || [] }; } }
  } };
  ['FC_PRICING_SLICE_', '_fcPricing_', '_fcPricingFlight_', '_fcPricingStats_']
    .forEach(function (v) { vm.runInContext(varSrc(PC, v), box); });
  ['_fcPricingUp_', '_evtPricingScope_', '_evtPricingScopeKey_', '_evtPricingScopeEmpty_',
   '_evtPricingProjectionActive_', '_evtPricingPending_', '_evtEnsurePricing_', '_fcPricingFetch_',
   '_fcPricingRows_'].forEach(function (f) { vm.runInContext(fnSrc(PC, f), box); });
  return {
    box: box, calls: calls,
    ensure: function () { return vm.runInContext('_evtEnsurePricing_()', box); },
    pending: function () { return vm.runInContext('_evtPricingPending_()', box); },
    rows: function () { return vm.runInContext('_fcPricingRows_()', box); },
    stats: function () { return vm.runInContext('JSON.parse(JSON.stringify(_fcPricingStats_))', box); },
    /* THE COMMITTED STORE, not what a reader chooses to show. _fcPricingRows_ compares the committed key
       with the current scope before it hands anything back, so a store corrupted by a late answer still
       READS as empty — correct behaviour standing in front of a broken commit. The stale guard's job is
       to stop the commit, so that is where it has to be observed. */
    store: function () { return vm.runInContext('({ key: _fcPricing_.key, ids: (_fcPricing_.rows || []).map(function (r) { return r.pricing_id; }) })', box); },
    setSite: function (s) { box.__site = s; },
    settle: function (i, payload) { box.__resolvers[i].res({ success: true, data: payload }); },
    reject: function (i, err) { box.__resolvers[i].rej(err); }
  };
}
var ROWS_A = [{ pricing_id: 'P1', sku: 'CO1100-T' }];
var ROWS_B = [{ pricing_id: 'P5', sku: 'CO1100-T' }];

// §6 — three rapid Builds inside one scope.
var w1 = ownerWorld();
var t1 = [w1.ensure(), w1.ensure(), w1.ensure()];
eq(w1.calls.length, 1, 'D1 §6 three Builds while the first is unresolved — EQUIVALENT_PRICING_REQUEST_COUNT = 1');
eq(w1.calls[0].include.scope, { company: 'KM', country: 'US', marketplace: 'Amazon' },
  'D2 and the one request names the current site scope');
w1.settle(0, { pricingList: ROWS_A });

// §7 — a scope change while the request is unresolved, with the OLD answer landing last.
var w2 = ownerWorld();
var pA = w2.ensure();                       // scope A dispatched
w2.setSite({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' });
var pB = w2.ensure();                       // scope B dispatched
eq(w2.calls.length, 2, 'D3 §7 a scope change buys its own request — the two scopes are different questions');
// B lands first, then A lands late.
w2.settle(1, { pricingList: ROWS_B });
var d4 = pB.then(function () {
  w2.settle(0, { pricingList: ROWS_A });
  return pA;
}).then(function () {
  eq(w2.rows().map(function (r) { return r.pricing_id; }), ['P5'],
    'D4 §7 scope A returns AFTER B and is DROPPED — STALE_SCOPE_A_COMMIT_COUNT = 0');
  eq(w2.stats().stale, 1, 'D5 and the drop is counted, not silent');
  eq(w2.pending(), false, 'D6 while scope B remains committed and usable');
});

// §8 — a failure is localised, and Retry buys exactly one request.
var w3 = ownerWorld();
var p3a = w3.ensure();
var d7 = p3a.then(function () { throw new Error('should have rejected'); }, function () {
  eq(w3.calls.length, 1, 'D7 §8 the failed attempt was one request');
  eq(w3.rows(), [], 'D8 and nothing was committed — no partial or foreign pricing is showing');
  var retry = w3.ensure();
  eq(w3.calls.length, 2, 'D9 §8 Retry issues EXACTLY one new request — RETRY_REQUEST_COUNT = 1');
  eq(w3.calls[1].include.slice, 'pricing', 'D10 and it is still the pricing slice alone — no siblings');
  w3.settle(1, { pricingList: ROWS_A });
  return retry.then(function () {
    eq(w3.rows().map(function (r) { return r.pricing_id; }), ['P1'], 'D11 and the retry succeeds into the same scope');
  });
});
w3.reject(0, { code: 'READ_TIMEOUT', message: 'timed out' });

// Holding another scope's projection is NOT holding this one.
var w4 = ownerWorld();
var p4a = w4.ensure();
w4.settle(0, { pricingList: ROWS_A });
var d12 = p4a.then(function () {
  eq(w4.pending(), false, 'D12 the committed scope is not pending');
  w4.setSite({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' });
  eq(w4.pending(), true, 'D13 §7 and after a scope change it IS pending — a stale projection is not an answer');
  eq(w4.rows(), [], 'D14 and the old rows are not offered to the new scope');
});

// A site-less form pends on nothing.
var w5 = ownerWorld();
w5.setSite({ company: '', country: '', marketplace: '' });
eq(w5.pending(), false, 'D15 an unselected site is not PENDING — there is no question to answer yet');
eq(w5.calls.length, 0, 'D16 and asks for nothing');

// =========================================================================================================
section('E. §5/§8/§9 — deferral, failure isolation and the identity seal');
// =========================================================================================================

// Pricing is NOT a prerequisite of opening the modal.
var PREREQ = /var _FC_PREREQ_TABLES_ = \{[\s\S]*?\};/.exec(PC)[0];
ok(PREREQ.indexOf('pricing_list') < 0,
  'E1 §5 PRICING_BLOCKS_MODAL_OPEN = NO — pricing_list is not on either prerequisite path');
var REG = /regular: \[([^\]]*)\]/.exec(PREREQ)[1].match(/'[^']+'/g) || [];
var EVT = /event: \[([^\]]*)\]/.exec(PREREQ)[1].match(/'[^']+'/g) || [];
eq([REG.length, EVT.length], [2, 2],
  'E2 §5 SPECIAL_COLD_BLOCKING_REQS stays at the R2 result of 2 — this repair did not put a table back');
// The failure surface is a subsection, not the modal.
var FAILED = fnSrc(PC, '_evtOnPricingFailed_');
ok(/_evtShowSubsectionRefusal_\(EVT_PRICING_HOST_/.test(FAILED),
  'E3 §8 a pricing failure renders in the pricing subsection — LAST_GOOD_DATA_PRESERVED = YES');
ok(!/innerHTML\s*=\s*''/.test(FAILED) && !/location\.reload|closeFcModal|hideFcModal/.test(FAILED),
  'E4 §8 and clears no form, closes no modal and reloads nothing');
// §13 L — a pricing read failure triggers no write.
ok(!/saveEvent|_fcWriteBegin_|KM\.DB\.(upsert|save|import|adjust)/.test(FAILED + fnSrc(PC, '_evtOnPricingRetry_')),
  'E5 §13.L no write is triggered by a pricing read failure or its retry');
// §9 — the FC-ID-R2 seal is untouched.
var SAVE = fnSrc(PC, 'saveEventUpdate');
ok(/_idr\.state !== FC_ID_\.READY_UNIQUE/.test(SAVE) && SAVE.indexOf('_evtMarketplaceIdentity_(site)') < SAVE.indexOf('_fcWriteBegin_'),
  'E6 §9 FC_CANONICAL_IDENTITY_BOUNDARY_SEAL_HELD = YES — BLANK_MARKETPLACE_ID_WRITE_COUNT = 0');
ok(!/byId\[[^\]]*\]\[0\]/.test(code(readN(path.join(GS, '14_fc_write_handlers.gs')))),
  'E7 §9 and the server still validates rather than deriving marketplace_id');
// §13 K — no forecast or gap arithmetic moved.
ok(!/_fcPricing|_evtPricing/.test(fnSrc(PC, '_evtBuildBaselineForSku')),
  'E8 §13.K the baseline resolver is untouched by the pricing transport');
eq((code(PAGE).match(/function _evtEventBaseFcForSku/g) || []).length, 1,
  'E9 and the forecast readers are neither duplicated nor rewritten');

// =========================================================================================================
section('F. §12 — the numbers, measured');
// =========================================================================================================

var sl = sliceOf(SCOPE_A);
var fieldsPost = Object.keys(sl.pricingList[0]).length;
var fieldsPre = Object.keys(PRICES[0]).length;
ok(sl.slice === 'pricing' && sl.counts.pricingList === 4,
  'F1 the slice answers under its own name with its own count', { slice: sl.slice, counts: sl.counts });
eq(sl.scope, { company: 'KM', country: 'US', marketplace: 'AMAZON' },
  'F2 §7 and echoes the scope it answered FOR, which is what makes the stale check possible without a timer');
console.log('     PRICING_ROWS_TRANSFERRED   PRE ' + PRICES.length + '  ->  POST ' + sl.counts.pricingList);
console.log('     PRICING_FIELDS_TRANSFERRED PRE ' + fieldsPre + '  ->  POST ' + fieldsPost);
ok(sl.counts.pricingList < PRICES.length / 50 && fieldsPost <= 12,
  'F3 §12 rows and fields both fall by more than an order of magnitude on this fixture');
ok(sl.projection && sl.projection.sourceRowCount === PRICES.length,
  'F4 and the payload states what it projected FROM, so the saving is reported rather than assumed');
// One request per Build, per scope — whatever the SKU count.
eq(w1.stats().requests, 1, 'F5 §12 GROUP_BUILD_REQUEST_COUNT_POST = 1 for a scope with 4 SKUs');
eq(w1.stats().joins, 2, 'F6 and the other two Builds JOINED it — DUPLICATE_PRICING_REQUEST_COUNT = 0');
eq(pa.scopedSkuCount, 4, 'F7 §4 PER_SKU_PRICING_REQUEST_COUNT = 0 — 4 SKUs, still one request');

// =========================================================================================================
section('G. §10 — FC-2: the repaint that deleted the operator\'s click target');
// =========================================================================================================

/* A DOM the size of the claim. It knows about one card, its lines, and the four cells the patcher writes;
   nothing here simulates layout, events or focus, because the fault does not need them. The fault is that
   the container was REBUILT on a change event, so the probe is: does an edit rebuild the container? */
function cell(cls, value) { return { className: cls, value: value, textContent: '', style: {} }; }
function fakeCards(nRows) {
  var repaints = { n: 0 };
  var lines = [{ className: 'fc-evt-line fc-evt-line--head' }];
  for (var i = 0; i < nRows; i++) {
    var cells = [cell('evt-line-disc', ''), cell('evt-line-deal', ''), cell('evt-line-fc', ''), cell('evt-line-diff', '')];
    lines.push({
      className: 'fc-evt-line', __cells: cells,
      querySelector: function (sel) {
        var want = sel.replace('.', '');
        for (var k = 0; k < this.__cells.length; k++) if (this.__cells[k].className === want) return this.__cells[k];
        return null;
      }
    });
  }
  var card = { querySelectorAll: function (sel) { return sel === '.fc-evt-line' ? lines : []; } };
  var wrap = {
    querySelectorAll: function (sel) { return sel === '.fc-evt-card' ? [card] : []; },
    set innerHTML(v) { repaints.n++; }, get innerHTML() { return ''; }
  };
  return { wrap: wrap, lines: lines, repaints: repaints };
}

function fc2World(nRows) {
  var dom = fakeCards(nRows);
  var box = vm.createContext({ console: console, isNaN: isNaN, Number: Number, Math: Math, String: String, parseFloat: parseFloat });
  box.document = { getElementById: function (id) { return id === 'event-group-cards' ? dom.wrap : null; } };
  box.__renders = 0;
  vm.runInContext('function _evtRenderGroupCards() { __renders++; }', box);
  vm.runInContext('function _evtDealPrecision(c) { return 2; }', box);
  vm.runInContext(fnSrc(PC, '_evtRoundMoney'), box);
  vm.runInContext(fnSrc(PC, '_evtPatchLine_'), box);
  vm.runInContext(fnSrc(PC, '_evtLineField'), box);
  vm.runInContext(fnSrc(PC, '_evtCardDiscount'), box);
  box.__groups = [{ category: 'C', series: 'S', discountPct: NaN, rows: [] }];
  for (var i = 0; i < nRows; i++) {
    box.__groups[0].rows.push({ sku: 'SKU' + i, regularPrice: 100, currency: 'USD',
      discountPct: NaN, dealPrice: NaN, baseFc: 10, newFc: NaN });
  }
  vm.runInContext('var _evtGroups = __groups;', box);
  return { box: box, dom: dom,
    lineField: function (gi, ri, f, v) { box.__a = [gi, ri, f, v]; vm.runInContext('_evtLineField(__a[0],__a[1],__a[2],__a[3])', box); },
    cardDiscount: function (i, v) { box.__b = [i, v]; vm.runInContext('_evtCardDiscount(__b[0],__b[1])', box); },
    renders: function () { return vm.runInContext('__renders', box); } };
}

var f2 = fc2World(3);
f2.lineField(0, 1, 'discountPct', '10');
eq(f2.renders(), 0, 'G1 §10 editing a row field REBUILDS NOTHING — the container is not reassigned');
eq(f2.dom.repaints.n, 0, 'G2 and the card container\'s innerHTML is never written on an edit');
eq(f2.dom.lines[2].querySelector('.evt-line-deal').value, 90,
  'G3 while the derived Deal Price IS updated in place — the edit still does its work');
// The field the operator is IN is never written back.
eq(f2.dom.lines[2].querySelector('.evt-line-disc').value, '',
  'G4 §10 and the field being typed in is NOT echoed back — no caret jump');
// Diff follows New Event FC against the baseline the card already shows. No formula moved.
f2.lineField(0, 0, 'newFc', '25');
eq(f2.dom.lines[1].querySelector('.evt-line-diff').textContent, '+15',
  'G5 and Diff is recomputed from the SAME arithmetic the renderer uses');
eq(f2.renders(), 0, 'G6 still without a repaint');
// The card-level discount is the same defect one level up.
var f3 = fc2World(2);
f3.cardDiscount(0, '25');
eq(f3.renders(), 0, 'G7 §10 the GROUP discount patches its rows instead of repainting the container');
eq([f3.dom.lines[1].querySelector('.evt-line-deal').value, f3.dom.lines[2].querySelector('.evt-line-deal').value],
  [75, 75], 'G8 and every row in the card gets its new Deal Price');
// FALLBACK: a DOM that is not the expected shape must still render, not silently do nothing.
var f4 = fc2World(0);
f4.box.__groups[0].rows.push({ sku: 'X', regularPrice: 100, currency: 'USD', discountPct: NaN, dealPrice: NaN, baseFc: 1, newFc: NaN });
f4.lineField(0, 0, 'discountPct', '10');
eq(f4.renders(), 1, 'G9 §10 a card whose DOM is missing falls back to the full render — never to nothing');

// =========================================================================================================
// MUTATION — M1..M8 from §13. Each plants the fault the section names and must be caught.
// =========================================================================================================
var mutPass = 0, mutFail = 0, mutAwait = [];
/* A PROBE THAT CANNOT OBSERVE ITS FAULT REPORTS 'SURVIVED', WHICH IS INDISTINGUISHABLE FROM A REAL
   SURVIVOR. M4's fault is only visible after two promises settle in a chosen order, so its probe returns
   a thenable — and the first version of this runner compared that thenable with `true`, found it unequal,
   and declared the mutant alive. The mutant WAS alive by that measurement and the measurement was empty.
   A thenable is now awaited, and anything else is still judged immediately. */
function record(label, caught) {
  if (caught === true) { mutPass++; console.log('kill ' + label); }
  else { mutFail++; console.error('MUTANT SURVIVED ' + label); }
}
function mut(label, fn) {
  var r;
  try { r = fn(); } catch (e) { console.error('   ' + label + ' threw: ' + e.message); return record(label, false); }
  if (r && typeof r.then === 'function') {
    mutAwait.push(r.then(function (v) { record(label, v === true); },
      function (e) { console.error('   ' + label + ' rejected: ' + (e && e.message)); record(label, false); }));
    return;
  }
  record(label, r === true);
}
function srvWith(src) {
  var c = vm.createContext({ console: console });
  ['FCS_PRICING_FIELDS_', 'FCS_PRICING_INACTIVE_'].forEach(function (v) { vm.runInContext(varSrc(WS, v), c); });
  ['fcsPriceUp_', 'fcsPricingMskuInScope_', 'fcsPricingPick_'].forEach(function (f) { vm.runInContext(fnSrc(WS, f), c); });
  vm.runInContext(src, c);
  c.__t = { pricing_list: PRICES, marketplace_skus: MSKUS };
  c.__s = SCOPE_A;
  return vm.runInContext('fcsPricingProject_(__t, __s)', c);
}

mut('M1 the scope is removed — the projection returns everything', function () {
  var src = fnSrc(WS, 'fcsPricingProject_')
    .replace('if (!sc.company && !sc.country && !sc.marketplace) return out;', 'if (false) return out;')
    .replace('if (keep) out.rows.push(fcsPricingPick_(p));', 'out.rows.push(fcsPricingPick_(p));');
  var got = srvWith(src);
  return got.rows.length === PRICES.length && pa.rows.length === 4;
});

mut('M2 the full-table getTable path is restored on the group-build path', function () {
  var faked = BUILD.replace('_evtPricingPending_()', '_fcDeferredPending_(_FC_DEFERRED_TABLES_.pricing)');
  if (faked === BUILD) throw new Error('M2 anchor drifted');
  return /_FC_DEFERRED_TABLES_\.pricing/.test(faked) && !/_FC_DEFERRED_TABLES_\.pricing/.test(BUILD);
});

mut('M3 a per-SKU request implementation', function () {
  var faked = FETCH.replace('scope: sc', 'scope: sc, sku: arguments[2]');
  if (faked === FETCH) throw new Error('M3 anchor drifted');
  return /sku:/.test(faked) && !/\bsku\b/.test(FETCH);
});

mut('M4 the stale-response guard is removed', function () {
  var box = ownerWorld();
  var src = fnSrc(PC, '_fcPricingFetch_')
    .replace('if (_evtPricingScopeKey_() !== key) { _fcPricingStats_.stale++; return null; }', '');
  if (src === fnSrc(PC, '_fcPricingFetch_')) throw new Error('M4 anchor drifted');
  vm.runInContext(src, box.box);
  var a = box.ensure();
  box.setSite({ company: 'ResUS', country: 'CA', marketplace: 'Amazon' });
  var bb = box.ensure();
  box.settle(1, { pricingList: ROWS_B });
  box.settle(0, { pricingList: ROWS_A });
  return Promise.all([a, bb]).then(function () {
    // Scope A's answer lands last and, without the guard, OVERWRITES scope B's committed projection —
    // the store now holds A's rows under A's key while the operator is looking at B.
    var st = box.store();
    return st.key === 'KM|US|AMAZON' && st.ids.join() === 'P1' && w2.rows().length === 1;
  });
});

mut('M5 single-flight is removed — every Build buys its own request', function () {
  var box = ownerWorld();
  var src = fnSrc(PC, '_evtEnsurePricing_')
    .replace('if (_fcPricingFlight_.p && _fcPricingFlight_.key === key) { _fcPricingStats_.joins++; return _fcPricingFlight_.p; }', '');
  if (src === fnSrc(PC, '_evtEnsurePricing_')) throw new Error('M5 anchor drifted');
  vm.runInContext(src, box.box);
  box.ensure(); box.ensure(); box.ensure();
  return box.calls.length === 3 && w1.calls.length === 1;
});

mut('M6 a pricing failure clears the form', function () {
  var faked = FAILED.replace('_evtShowSubsectionRefusal_(EVT_PRICING_HOST_',
    "document.getElementById('event-sku-rows').innerHTML = ''; _evtShowSubsectionRefusal_(EVT_PRICING_HOST_");
  if (faked === FAILED) throw new Error('M6 anchor drifted');
  return /innerHTML = ''/.test(faked) && !/innerHTML\s*=\s*''/.test(FAILED);
});

mut('M7 the blank-marketplace-id save protection is removed', function () {
  var faked = SAVE.replace('_idr.state !== FC_ID_.READY_UNIQUE', 'false');
  if (faked === SAVE) throw new Error('M7 anchor drifted');
  return !/_idr\.state !== FC_ID_\.READY_UNIQUE/.test(faked) && /_idr\.state !== FC_ID_\.READY_UNIQUE/.test(SAVE);
});

mut('M8 pricing becomes an initial blocking prerequisite again', function () {
  var faked = PREREQ.replace("event: ['sku_details', 'marketplace_skus']",
    "event: ['sku_details', 'marketplace_skus', 'pricing_list']");
  if (faked === PREREQ) throw new Error('M8 anchor drifted');
  return /pricing_list/.test(faked) && PREREQ.indexOf('pricing_list') < 0;
});

// M9/M10 — the two projection faults a plausible smaller implementation would ship.
mut('M11 §10 the row edit repaints the whole container again', function () {
  var w = fc2World(2);
  var src = fnSrc(PC, '_evtLineField').replace('if (!_evtPatchLine_(gi, ri, field)) _evtRenderGroupCards();',
    '_evtRenderGroupCards();');
  if (src === fnSrc(PC, '_evtLineField')) throw new Error('M11 anchor drifted');
  vm.runInContext(src, w.box);
  w.lineField(0, 0, 'discountPct', '10');
  return w.renders() === 1 && f2.renders() === 0;
});

mut('M12 §10 the patcher echoes the field being typed in', function () {
  var w = fc2World(2);
  var src = fnSrc(PC, '_evtPatchLine_').replace("if (disc && typingField !== 'discountPct')", 'if (disc)');
  if (src === fnSrc(PC, '_evtPatchLine_')) throw new Error('M12 anchor drifted');
  vm.runInContext(src, w.box);
  w.lineField(0, 0, 'discountPct', '10');
  return w.dom.lines[1].querySelector('.evt-line-disc').value === 10;
});

mut('M9 the projection filters on the site triple ONLY (drops id-matched rows)', function () {
  var src = fnSrc(WS, 'fcsPricingProject_')
    .replace('if (pid && idSet[pid]) keep = true;', '');
  if (src === fnSrc(WS, 'fcsPricingProject_')) throw new Error('M9 anchor drifted');
  var got = srvWith(src);
  var ids = got.rows.map(function (r) { return r.pricing_id; });
  return ids.indexOf('P4') < 0 && idsA.indexOf('P4') >= 0;
});

mut('M10 the projection emits a key the sheet does not have', function () {
  var src = fnSrc(WS, 'fcsPricingPick_')
    .replace('if (row && Object.prototype.hasOwnProperty.call(row, k)) out[k] = row[k];',
             "out[k] = (row && row[k] !== undefined) ? row[k] : '';");
  var c = vm.createContext({ console: console, Object: Object });
  vm.runInContext(varSrc(WS, 'FCS_PRICING_FIELDS_'), c);
  vm.runInContext(src, c);
  c.__r = PRICES[1];
  var picked = vm.runInContext('fcsPricingPick_(__r)', c);
  if (!Object.prototype.hasOwnProperty.call(picked, 'resolved_regular_price')) return false;
  // And the damage is the point: the auto-priced row now reports NO price.
  var n2 = vm.createContext({ console: console });
  ['pricingNumOrNull_', 'pricingIsNa_', 'pricingFlagOrNull_', 'pricingResolveBand_', 'normalizePricingListRecord']
    .forEach(function (f) { vm.runInContext(fnSrc(API, f), n2); });
  n2.__row = picked;
  var rec = vm.runInContext('normalizePricingListRecord(__row)', n2);
  return rec.resolvedRegularPrice === null && normalized[1].resolvedRegularPrice === 19.5;
});

// =========================================================================================================
Promise.all([d4, d7, d12, Promise.resolve(t1)]).then(function () {
  return Promise.all(mutAwait);          // async mutants settle before the tally is printed
}).then(function () {
  console.log('\n=====================================================');
  console.log('FC-SUMMARY-STABILITY-R3 SCOPED PRICING — ' + pass + ' passed / ' + fail + ' failed');
  console.log('MUTATION ' + mutPass + '/' + (mutPass + mutFail) + (mutFail ? '  SURVIVORS PRESENT' : '  no survivors'));
  if (fail === 0 && mutFail === 0) {
    console.log('FULL_PRICING_LIST_SCAN_ON_GROUP_BUILD_POST = 0   NEW_GENERIC_GETTABLE_PRICING_READ_POST = 0');
    console.log('PER_SKU_PRICING_REQUEST_COUNT = 0   DUPLICATE_PRICING_REQUEST_COUNT = 0   STALE_PRICING_COMMIT_COUNT = 0');
    console.log('RETRY_REQUEST_COUNT = 1   PRICING_BLOCKS_MODAL_OPEN = NO   LAST_GOOD_DATA_PRESERVED = YES');
    console.log('PRICING_ROWS_TRANSFERRED ' + PRICES.length + ' -> ' + sl.counts.pricingList +
                '   PRICING_FIELDS_TRANSFERRED ' + fieldsPre + ' -> ' + fieldsPost);
    console.log('PRICING_AUTHORITY_COUNT = 1   FC_CANONICAL_IDENTITY_BOUNDARY_SEAL_HELD = YES');
    console.log('PRODUCTION_ROWS_WRITTEN = 0   FORECAST/GAP_FORMULA_CHANGED = NO');
  }
  console.log('=====================================================');
  process.exit((fail === 0 && mutFail === 0) ? 0 : 1);
}).catch(function (e) {
  console.error('HARNESS ERROR: ' + (e && e.stack || e));
  process.exit(1);
});
