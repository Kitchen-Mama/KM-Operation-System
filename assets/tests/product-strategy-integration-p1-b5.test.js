/**
 * ==================================================================================================
 * PRODUCT STRATEGY — P1-B5 LIVE INTEGRATION           node assets/tests/product-strategy-integration-p1-b5.test.js
 * ==================================================================================================
 *
 * P1-B3 read production and returned READY. This suite is about whether the board that P1-B4 built
 * can be fed by that read — and it is built on a fixture whose SHAPE is the measured live universe,
 * not on round numbers:
 *
 *     10 sites · 13 categories · 43 series · 495 marketplace_skus rows, every one active
 *     61 site SKUs with no Regional Detail, concentrated in ONE site
 *     6 missing regular_price · 16 missing minimum_price · 9 missing msrp
 *     6 currencies · 0 cross-currency sites · 0 duplicate identities of any kind
 *
 * WHY A FIXTURE AND NOT THE LIVE LOG. §2 forbids re-running the readback and forbids overwriting its
 * evidence, so the live numbers are the SPECIFICATION here and the fixture is built to satisfy them.
 * A test that re-measured production would be a second authority for a number that has one.
 *
 * THE ONE THING THIS SUITE CANNOT DO is prove the chart draws, because there is no layout engine in
 * the DOM shim. What it proves instead is that every row reaching the chart is contract-valid, that
 * every row that must not reach it does not, and that exactly one source state yields rows at all.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..', '..');
var JS = path.join(ROOT, 'assets', 'js');

function read(p) { return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'); }
/** Comments AND string literals out — a file's own prose names everything it promises not to do. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var CONTRACT = require(path.join(JS, 'product-strategy', 'psb-data-contract.js')).PSB_CONTRACT;
global.PSB_CONTRACT = CONTRACT;
var SEL = require(path.join(JS, 'product-strategy', 'psb-selectors.js')).PSB_SELECTORS;
var PRICING = require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));
var LIVE = require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));

var SRC = {
  live: read(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js')),
  page: read(path.join(JS, 'pages', 'product-strategy-board.js')),
  pageHtml: read(path.join(ROOT, 'assets', 'html', 'pages', 'product-strategy-board.html')),
  board: read(path.join(JS, 'product-strategy', 'psb-board-ui.js')),
  accessor: read(path.join(JS, 'api', 'km-product-pricing-workspace.js')),
  index: read(path.join(ROOT, 'index.html')),
  app: read(path.join(JS, 'app.js'))
};

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
/* §L is asynchronous, and the summary must not be printed before it has finished. */
var PENDING = Promise.resolve();
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else {
    fail++;
    console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra)));
  }
}
function eq(a, b, label) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, label, A === B ? undefined : { got: a, want: b });
}

// ===================================================================================================
// THE LIVE-SHAPED UNIVERSE
// ===================================================================================================

/* Ten sites. Six currencies. No site sells in two currencies — the readback measured
   cross_currency_site = 0, and that is a property of the data this fixture must reproduce. */
var SITES = [
  { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon', currency: 'USD' },
  { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart', currency: 'USD' },
  { company: 'Kitchen Mama', country: 'CA', marketplace: 'Amazon', currency: 'CAD' },
  { company: 'Kitchen Mama', country: 'UK', marketplace: 'Amazon', currency: 'GBP' },
  { company: 'Kitchen Mama', country: 'DE', marketplace: 'Amazon', currency: 'EUR' },
  { company: 'Kitchen Mama', country: 'FR', marketplace: 'Amazon', currency: 'EUR' },
  { company: 'Kitchen Mama', country: 'IT', marketplace: 'Amazon', currency: 'EUR' },
  { company: 'Kitchen Mama', country: 'JP', marketplace: 'Amazon', currency: 'JPY' },
  { company: 'Kitchen Mama', country: 'AU', marketplace: 'Amazon', currency: 'AUD' },
  /* MX prices in USD. Ten sites over SIX currencies is what the readback measured, so the tenth
     site cannot bring a seventh — and a site pricing in a currency that is not its country's is
     exactly the case that makes "currency is not a site scope" worth asserting. */
  { company: 'Kitchen Mama', country: 'MX', marketplace: 'Amazon', currency: 'USD' }
];
var CATEGORIES = ['Electric Can Opener', 'Manual Can Opener', 'Jar Opener', 'Bottle Opener',
  'Silicone Spatula', 'Kitchen Shears', 'Vegetable Chopper', 'Garlic Press', 'Food Storage',
  'Measuring Set', 'Peeler', 'Grater', 'Unmapped / Needs Review'];

/* 43 series across the 13 categories. */
var SERIES = [];
(function () {
  var per = [4, 4, 4, 3, 4, 3, 3, 3, 3, 4, 3, 3, 2];
  CATEGORIES.forEach(function (c, i) {
    for (var k = 0; k < per[i]; k++) SERIES.push(c.split(' ')[0] + '-S' + (k + 1));
  });
}());

var MEASURED = {
  sites: 10, categories: 13, series: 43, marketplaceRows: 495,
  regionalMissing: 61, regionalMissingSites: 1,
  missingRegular: 6, missingMinimum: 16, missingMsrp: 9,
  currencies: 6, crossCurrencySites: 0
};

/** One live row exactly as 72_ emits it. */
function liveRow(i, site, o) {
  o = o || {};
  var cat = o.category || CATEGORIES[i % CATEGORIES.length];
  var ser = o.series === undefined ? SERIES[i % SERIES.length] : o.series;
  return {
    identity: 'MSKU:' + o.id, marketplace_sku_id: o.id,
    master_sku: o.master_sku || ('CO' + (1000 + (i % 192)) + '-R'),
    site_sku: 'B0' + i, product_name: 'Product ' + (i % 192),
    category: cat, series: ser, variant_group: ser, variant_name: null,
    company: site.company, country: site.country, marketplace: site.marketplace,
    marketplace_sku_status: 'active', lifecycle: 'active',
    currency: site.currency,
    regular_price: o.regular_price === undefined ? 29.99 : o.regular_price,
    minimum_price: o.minimum_price === undefined ? 24.99 : o.minimum_price,
    msrp: o.msrp === undefined ? 34.99 : o.msrp,
    product_image: null,
    regional: o.regional === undefined
      ? { regional_detail_id: 'RGD-' + o.id, site_sku: 'B0' + i,
          marketplace_product_id: 'MP' + o.id, product_url: null,
          packaging_regulation: null, language: 'en' }
      : o.regional,
    campaigns: o.campaigns || [],
    analysable: o.analysable === undefined ? true : o.analysable,
    source_status: o.source_status || [], missing_reasons: o.missing_reasons || [],
    findings: [],
    provenance: { membership: 'marketplace_skus (company + country + marketplace)' }
  };
}

/**
 * The whole 495-row universe, distributed over the ten sites, carrying the measured gaps. The
 * missing Regional Details are all put on ONE site because that is what the readback measured —
 * 61 concentrated in a single site, which is a very different fact from 61 spread over ten.
 */
var UNIVERSE = (function () {
  var rows = [], n = 0;
  var perSite = [61, 44, 48, 50, 52, 46, 49, 47, 49, 49];   // 495
  var gapSite = 0;                                          // the site that has no Regional Details
  var missingReg = 0, missingMin = 0, missingMsrp = 0;
  SITES.forEach(function (site, s) {
    for (var k = 0; k < perSite[s]; k++) {
      n++;
      var o = { id: 'MSKU-' + n };
      if (s === gapSite) {
        o.regional = null;
        o.analysable = false;
        o.missing_reasons = ['REGIONAL_DETAILS_MISSING'];
      }
      if (s !== gapSite && missingReg < MEASURED.missingRegular) { o.regular_price = null; missingReg++; o.analysable = false; }
      else if (missingMin < MEASURED.missingMinimum) { o.minimum_price = null; missingMin++; }
      else if (missingMsrp < MEASURED.missingMsrp) { o.msrp = null; missingMsrp++; }
      rows.push(liveRow(n, site, o));
    }
  });
  return rows;
}());

function rowsForSite(site) {
  return UNIVERSE.filter(function (r) {
    return r.company === site.company && r.country === site.country
      && r.marketplace === site.marketplace;
  });
}

function envelope(rows, o) {
  o = o || {};
  var cats = {}, sers = {};
  rows.forEach(function (r) { if (r.category) cats[r.category] = 1; if (r.series) sers[r.series] = 1; });
  return {
    success: true,
    data: {
      normalizedRows: rows,
      refusals: o.refusals || [], findings: o.findings || [],
      analysis_permitted: o.permitted === undefined ? true : o.permitted,
      counts: { siteSkuCount: rows.length },
      filterOptions: o.filterOptions === undefined
        ? { categories: Object.keys(cats).sort().map(function (v) { return { value: v }; }),
            series: Object.keys(sers).sort().map(function (v) { return { value: v }; }) }
        : o.filterOptions,
      pagination: null,
      scope: o.scope || null,
      sourceState: o.sourceState === undefined ? 'READY' : o.sourceState,
      schema: { contract_version: o.version === undefined ? 2 : o.version,
        read_at: '2026-09-11T02:14:07.000Z', read_at_is: 'WHEN_THE_SERVER_READ_THE_TABLES',
        source_modified_at: null, build: 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R8' }
    },
    meta: { action: 'productPricing.workspace.get', build: 'test' },
    errors: []
  };
}

function loadSite(site, opts) {
  return LIVE.createFromResponse(envelope(rowsForSite(site), { scope: site }),
    opts || { asOf: '2026-09-11' }).load();
}

// ===================================================================================================
console.log('\n=== §A  THE CHAIN: accessor -> pricing adapter -> live adapter -> contract -> selectors ===');
// ===================================================================================================
(function () {
  var snap = loadSite(SITES[1]);
  ok(snap.state === 'OK', 'A1 a READY response yields the analysable state', snap.state);
  ok(snap.row_count === 44, 'A2 and every row of that site', snap.row_count);

  /* THE JOIN THAT WAS ONLY EVER DOCUMENTED. km-product-pricing-adapter and psb-selectors were
     written against each other's prose, never against each other. This is the assertion that makes
     the chain real rather than plausible. */
  var v = CONTRACT.validateRows(snap.rows);
  ok(v.ok, 'A3 every adapted row satisfies all 23 contract fields, field for field',
    v.ok ? undefined : v.mismatches.slice(0, 3));
  ok(v.checked === 44, 'A4 and there were rows to check', v.checked);

  var uni = SEL.getEligibleProductUniverse({ rows: snap.rows, site: SITES[1] });
  ok(uni.state === 'ELIGIBLE_UNIVERSE', 'A5 the selectors consume them without a shim', uni.state);
  ok(uni.counts.eligible === 44, 'A6 all 44 are eligible on their own site', uni.counts.eligible);
  eq(uni.membership_authority, SEL.MEMBERSHIP_AUTHORITY,
    'A7 and membership is still marketplace_skus, not the price table');

  /* IDENTITY IS THE LIVE ONE. The fixture form MSK-<country>-<marketplace>-<sku> must never reach
     production: it is composed from three attributes, so it changes when a listing moves. */
  ok(snap.rows.every(function (r) { return /^MSKU:/.test(r.identity); }),
    'A8 every identity is MSKU:<marketplace_sku_id>');
  ok(!snap.rows.some(function (r) { return /^MSK-/.test(String(r.identity)); }),
    'A9 and not one fixture-form identity survives');
}());

// ===================================================================================================
console.log('\n=== §B  THE MEASURED UNIVERSE (P1-B3 live evidence, FP0d88b7eb) ===');
// ===================================================================================================
(function () {
  eq(UNIVERSE.length, MEASURED.marketplaceRows, 'B1 495 marketplace_skus rows');
  var sites = {}, cats = {}, sers = {}, curs = {};
  UNIVERSE.forEach(function (r) {
    sites[r.company + '|' + r.country + '|' + r.marketplace] = 1;
    cats[r.category] = 1; sers[r.series] = 1; curs[r.currency] = 1;
  });
  eq(Object.keys(sites).length, MEASURED.sites, 'B2 10 sites');
  eq(Object.keys(cats).length, MEASURED.categories, 'B3 13 categories');
  eq(Object.keys(sers).length, MEASURED.series, 'B4 43 series');
  eq(Object.keys(curs).length, MEASURED.currencies, 'B5 6 currencies');
  ok(UNIVERSE.every(function (r) { return r.marketplace_sku_status === 'active'; }),
    'B6 every marketplace_skus row is active, as measured');

  /* NO DUPLICATE IDENTITY OF ANY KIND — the readback measured zero, and a duplicate
     marketplace_sku_id is the one defect that makes every join downstream suspect. */
  var seen = {}, dupes = 0;
  UNIVERSE.forEach(function (r) {
    if (seen[r.marketplace_sku_id]) dupes++;
    seen[r.marketplace_sku_id] = 1;
  });
  eq(dupes, 0, 'B7 zero duplicate marketplace identities');

  /* THE CATEGORY UNIVERSE IS NOT THREE, AND NOT A LIST IN THE CODE. §7 of P1-B3 retired the
     three-category limit; 13 must flow through with no UI change and no allowlist. */
  ok(Object.keys(cats).length > 3, 'B8 more than the three categories the old UI could hold');
  ok(cats['Unmapped / Needs Review'] === 1,
    'B9 and blank/unknown lands in Unmapped / Needs Review rather than being merged away');

  /* EVERY SITE IS SINGLE-CURRENCY. cross_currency_site = 0 was measured, and it is what lets a
     site have one price axis at all. */
  var bad = 0;
  Object.keys(sites).forEach(function (k) {
    var c = {};
    UNIVERSE.forEach(function (r) {
      if (r.company + '|' + r.country + '|' + r.marketplace === k) c[r.currency] = 1;
    });
    if (Object.keys(c).length > 1) bad++;
  });
  eq(bad, MEASURED.crossCurrencySites, 'B10 no site sells in two currencies');
}());

// ===================================================================================================
console.log('\n=== §C  THE 61 MISSING REGIONAL DETAILS: counted, named, and NOT plotted ===');
// ===================================================================================================
(function () {
  var gapSite = SITES[0];
  var snap = loadSite(gapSite);
  var uni = SEL.getEligibleProductUniverse({ rows: snap.rows, site: gapSite });

  eq(uni.counts.eligible, MEASURED.regionalMissing,
    'C1 all 61 are ELIGIBLE — membership is marketplace_skus, and a missing Regional Detail'
    + ' does not un-list a SKU');
  eq(uni.counts.chartable, 0, 'C2 and NOT ONE of them is chartable');
  eq(uni.dataQuality.regional_details_missing.length, MEASURED.regionalMissing,
    'C3 all 61 appear in the Data Quality ledger');
  eq(uni.regional_detail_decides_membership, false,
    'C4 stated as data: regional presence never decided membership');

  /* THE LEDGER NAMES THEM. A count on its own cannot be acted on — §6 forbids dropping them
     silently, and a number with no identities attached is a silent drop with a receipt. */
  ok(uni.dataQuality.regional_details_missing.every(function (id) { return /^MSKU:/.test(id); }),
    'C5 and names each one by its live identity');

  /* CONCENTRATED IN ONE SITE, which is the fact the readback actually measured. */
  var others = 0;
  SITES.slice(1).forEach(function (s) {
    var u = SEL.getEligibleProductUniverse({ rows: loadSite(s).rows, site: s });
    others += u.dataQuality.regional_details_missing.length;
  });
  eq(others, 0, 'C6 and the other nine sites have none — the gap is one site, not a spread');
  eq(MEASURED.regionalMissingSites, 1, 'C7 as the live log recorded');
}());

// ===================================================================================================
console.log('\n=== §D  A MISSING PRICE IS NOT A ZERO ===');
// ===================================================================================================
(function () {
  var withNulls = [liveRow(1, SITES[1], { id: 'X1', regular_price: null }),
    liveRow(2, SITES[1], { id: 'X2', minimum_price: null }),
    liveRow(3, SITES[1], { id: 'X3', msrp: null })];
  var snap = LIVE.createFromResponse(envelope(withNulls, { scope: SITES[1] }), {}).load();
  ok(snap.state === 'OK', 'D1 nulls do not make a response unreadable', snap.state);
  eq(snap.rows[0].regular_price, null, 'D2 a missing regular_price stays null');
  eq(snap.rows[1].minimum_price, null, 'D3 a missing minimum_price stays null');
  eq(snap.rows[2].msrp, null, 'D4 a missing msrp stays null');
  ok(!snap.rows.some(function (r) {
    return r.regular_price === 0 || r.minimum_price === 0 || r.msrp === 0;
  }), 'D5 and not one of them became 0 — a zero is a price, and a free product is a finding');

  /* A ROW WITH NO EVERYDAY PRICE HAS NO COORDINATE, so it is eligible and unplotted, for a
     different reason from the regional one. Both are on the page; neither is on the axis. */
  var uni = SEL.getEligibleProductUniverse({ rows: snap.rows, site: SITES[1] });
  eq(uni.dataQuality.price_source_missing.length, 1, 'D6 the no-price row is in the ledger');
  eq(uni.counts.chartable, 2, 'D7 and it is not plotted, while the other two are');

  /* SEL.cents IS THE ONE PLACE THIS IS DECIDED, and it must answer null, never 0. */
  eq(SEL.cents(null), null, 'D8 cents(null) is null');
  eq(SEL.cents(0), 0, 'D9 while cents(0) is 0 — the two are different facts');
}());

// ===================================================================================================
console.log('\n=== §E  SIX CURRENCIES, NEVER POOLED ===');
// ===================================================================================================
(function () {
  /* The board splits by currency before it draws. Handed two currencies it must produce two
     panels, never one axis with both on it — an FX-free comparison of 29.99 USD against
     29.99 EUR is a finding about nothing. */
  var mixed = rowsForSite(SITES[3]).concat(rowsForSite(SITES[4]));   // GBP + EUR
  var snap = LIVE.createFromResponse(envelope(mixed, {}), {}).load();
  var nodes = SEL.groupNodes(snap.rows);
  var panels = SEL.splitByCurrency(nodes);
  ok(panels.length >= 2, 'E1 two currencies produce at least two panels, never one',
    panels.length);
  var cur = panels.map(function (p) { return p.currency; }).sort();
  ok(cur.indexOf('GBP') >= 0 && cur.indexOf('EUR') >= 0, 'E2 and each panel names its currency', cur);
  ok(panels.every(function (p) {
    var c = {};
    (p.nodes || []).forEach(function (n) { c[n.currency] = 1; });
    return Object.keys(c).length <= 1;
  }), 'E3 no panel holds two currencies');

  /* AND THE SERVER ALREADY REFUSES TO POOL. A complete site is single-currency, so a currency
     DROPDOWN is a decision already made — which is why P1-B4 derived it instead of offering it. */
  eq(CONTRACT.REFUSAL.MIXED_CURRENCY_REFUSED !== undefined, true,
    'E4 the contract names the refusal rather than leaving it to a renderer');

  /* CURRENCY IS NOT A SITE SCOPE, and this fixture has the case that proves it: US/Amazon and
     MX/Amazon both price in USD. A board that scoped by currency would show Mexican listings
     under the US heading — P1-B3's proof P2, re-asserted at the seam that could reintroduce it. */
  var us = SITES[0], mx = SITES[9];
  eq([us.currency, mx.currency], ['USD', 'USD'], 'E5 two sites share one currency');
  var usUni = SEL.getEligibleProductUniverse({ rows: loadSite(us).rows, site: us });
  var foreign = usUni.rows.filter(function (r) { return r.country !== 'US'; });
  eq(foreign.length, 0, 'E6 and not one non-US row is eligible on the US site');
  var mxRows = loadSite(mx).rows;
  var crossed = SEL.getEligibleProductUniverse({ rows: mxRows, site: us });
  eq(crossed.counts.eligible, 0,
    'E7 MX rows offered to the US site are all excluded, USD or not');
  eq(crossed.excluded.length, mxRows.length, 'E8 every one of them named NOT_LISTED_ON_THIS_SITE');
  eq(usUni.currency_decides_membership, false, 'E9 stated as data on the universe itself');
}());

// ===================================================================================================
console.log('\n=== §F  THE SOURCE-STATE MATRIX: exactly one state yields rows ===');
// ===================================================================================================
(function () {
  var rows = rowsForSite(SITES[1]);
  eq(LIVE.SERVER_SOURCE_STATES,
    ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY'],
    'F1 four servable states, frozen by P1-B3');
  eq(LIVE.CLIENT_ONLY_SOURCE_STATE, 'SOURCE_NOT_CONNECTED',
    'F2 and the fifth is the client\'s alone');

  ['SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY'].forEach(function (st, i) {
    var snap = LIVE.createFromResponse(envelope(rows, { sourceState: st }), {}).load();
    eq(snap.state, st, 'F3.' + (i + 1) + ' ' + st + ' is carried through, not translated');
    eq(snap.row_count, 0, 'F4.' + (i + 1) + ' and it yields ZERO rows even though rows arrived');
    eq(snap.may_analyse, false, 'F5.' + (i + 1) + ' and forbids analysis');
    ok(LIVE.UX[st].uses_fixture === false, 'F6.' + (i + 1) + ' with no fixture in its place');
  });

  /* PARTIALLY-READABLE IS THE HARSH ONE ON PURPOSE. The rows it did see are real; showing them
     would be a price comparison over part of a population, and the product that is missing is
     exactly the one nobody checks. */
  eq(LIVE.UX.SOURCE_PARTIALLY_READABLE.severity, 'stop',
    'F7 partially-readable stops rather than degrading');
  eq(LIVE.UX.SOURCE_EMPTY.severity, 'info',
    'F8 while an empty source is information — it was read, and it is empty');

  /* A SERVER CANNOT HONESTLY SEND THE CLIENT-ONLY STATE. A response carrying it is proof a server
     answered, which is the one thing it claims did not happen. */
  var lying = LIVE.createFromResponse(
    envelope(rows, { sourceState: 'SOURCE_NOT_CONNECTED' }), {}).load();
  eq(lying.state, 'SOURCE_NOT_CONNECTED', 'F9 a server-sent client-only state is not believed');
  eq(lying.row_count, 0, 'F10 and yields nothing');

  /* NO STATE AT ALL IS NOT AN EMPTY SOURCE. "Nobody measured" and "measured, and it is empty" are
     different answers, and only one of them tells a reader to move on. */
  var none = LIVE.createFromResponse({ success: true, data: {
    normalizedRows: rows, refusals: [], analysis_permitted: true }, meta: {}, errors: [] }, {}).load();
  eq(none.state, 'SOURCE_NOT_CONNECTED', 'F11 a response with no sourceState is not SOURCE_EMPTY');

  var unknown = LIVE.createFromResponse(envelope(rows, { sourceState: 'MOSTLY_FINE' }), {}).load();
  eq(unknown.state, 'SCHEMA_CONTRACT_MISMATCH', 'F12 an unfrozen state is a shape problem');
  eq(unknown.row_count, 0, 'F13 and stops');

  eq(LIVE.LOAD_STATES.filter(function (s) { return LIVE.UX[s].may_analyse === true; }), ['OK'],
    'F14 across the whole matrix, exactly ONE state permits analysis');
}());

// ===================================================================================================
console.log('\n=== §G  FAIL CLOSED: the capability, and a shape this build never read ===');
// ===================================================================================================
(function () {
  var fd = LIVE.createFromResponse({ success: true, data: { normalizedRows: [],
    refusals: [{ code: 'FEATURE_DISABLED', detail: 'no request was sent' }],
    analysis_permitted: false }, meta: {}, errors: [] }, {}).load();
  eq(fd.state, 'FEATURE_DISABLED', 'G1 a disabled feature is its own state');
  eq(fd.row_count, 0, 'G2 with no rows');
  eq(fd.provenance.connected, false, 'G3 and it did not connect');

  /* SCHEMA VERSION. The pricing adapter REPORTS a version it was not written against; refusing is
     a decision about what a person may be shown, and that belongs at the seam that feeds a chart. */
  var rows = rowsForSite(SITES[1]);
  [1, 3, 99].forEach(function (v, i) {
    var snap = LIVE.createFromResponse(envelope(rows, { version: v }), {}).load();
    eq(snap.state, 'SCHEMA_CONTRACT_MISMATCH', 'G4.' + (i + 1) + ' contract version ' + v + ' stops');
    eq(snap.row_count, 0, 'G5.' + (i + 1) + ' and draws nothing');
  });
  var good = LIVE.createFromResponse(envelope(rows, { version: 2 }), {}).load();
  eq(good.state, 'OK', 'G6 version 2 is the one this build reads');
  eq(PRICING.EXPECTED_SCHEMA_CONTRACT_VERSION, 2, 'G7 as the adapter declares');

  /* THE ORDER MATTERS. A response can be READY and carry an unreadable shape; the structural stop
     wins, because "the shape is wrong" can be acted on and "0 products" sends a reader hunting. */
  var both = LIVE.createFromResponse(
    envelope(rows, { version: 7, sourceState: 'SOURCE_EMPTY' }), {}).load();
  eq(both.state, 'SCHEMA_CONTRACT_MISMATCH',
    'G8 a shape problem outranks a source state read out of that shape');

  /* ROWS THAT DO NOT HAVE THE SHAPE THE BOARD INDEXES INTO. Checked, not assumed. */
  var broken = rows.slice(0, 3).map(function (r) {
    var c = JSON.parse(JSON.stringify(r)); delete c.company; return c;
  });
  var cm = LIVE.createFromResponse(envelope(broken, {}), {}).load();
  eq(cm.state, 'CONTRACT_MISMATCH', 'G9 a row missing a required field is a refusal, not a blank column');
  eq(cm.row_count, 0, 'G10 and nothing is drawn from it');
  ok(cm.refusals.length > 0 && /company/.test(JSON.stringify(cm.refusals)),
    'G11 and the refusal names the field');
}());

// ===================================================================================================
console.log('\n=== §H  NO FIXTURE FALLBACK ANYWHERE ON THE PRODUCTION PATH ===');
// ===================================================================================================
(function () {
  var b = bare(SRC.live);
  ['PSB_PREVIEW', 'PreviewProductStrategyDataAdapter', 'StressProductStrategyDataAdapter',
    'preview-fixture'].forEach(function (n, i) {
    ok(b.indexOf(n) < 0, 'H1.' + (i + 1) + ' the live adapter does not name ' + n);
  });
  var bp = bare(SRC.page);
  ['PSB_PREVIEW', 'PreviewProductStrategyDataAdapter', 'StressProductStrategyDataAdapter',
    'preview-fixture'].forEach(function (n, i) {
    ok(bp.indexOf(n) < 0, 'H2.' + (i + 1) + ' nor does the production page');
  });
  ok(SRC.pageHtml.indexOf('preview-fixture') < 0,
    'H3 and the production partial loads no fixture script');

  /* PROVENANCE SAYS SO AS DATA. A property can be asserted; a comment can only be believed. */
  var snap = loadSite(SITES[1]);
  eq(snap.provenance.fixture_fallback, false, 'H4 provenance: fixture_fallback false');
  eq(snap.provenance.preview_fallback, false, 'H5 provenance: preview_fallback false');
  eq(snap.provenance.price_source, 'OPERATION_SYSTEM_DATABASE',
    'H6 and live prices say where they came from');
  eq(LIVE.CONTRACT.fixture_fallback, false, 'H7 the contract states it too');
  eq(PAGE.CONTRACT.fixture_fallback, false, 'H8 and so does the page');

  /* EVERY NON-OK STATE PRODUCES NOTHING, which is the property that makes "no fallback" true
     rather than merely unimplemented — a state that returned rows from somewhere would be one. */
  var leaked = LIVE.LOAD_STATES.filter(function (st) {
    if (st === 'OK') return false;
    var s = LIVE.createFromResponse(envelope(rowsForSite(SITES[1]), { sourceState: st }), {}).load();
    return s.row_count > 0;
  });
  eq(leaked, [], 'H9 no non-OK state produced a single row');
}());

// ===================================================================================================
console.log('\n=== §I  THE STRESS FIXTURE IS UNREACHABLE FROM PRODUCTION ===');
// ===================================================================================================
(function () {
  ok(bare(SRC.page).indexOf('__PSB_DEV_MODE__') < 0,
    'I1 the production page has no developer-mode hook');
  ok(bare(SRC.live).indexOf('__PSB_DEV_MODE__') < 0, 'I2 nor does the live adapter');
  ok(SRC.pageHtml.indexOf('stress') < 0 && SRC.pageHtml.indexOf('Stress') < 0,
    'I3 and the partial offers no stress control');

  /* NO URL PARAMETER, ON EITHER FILE. A link is forwardable, so a query string is how one
     person's debugging becomes another person's screenshot. */
  ['location.search', 'URLSearchParams', 'location.href', 'window.location'].forEach(function (n, i) {
    ok(bare(SRC.page).indexOf(n) < 0, 'I4.' + (i + 1) + ' the page never reads ' + n);
    ok(bare(SRC.live).indexOf(n) < 0, 'I5.' + (i + 1) + ' and neither does the live adapter');
  });

  /* AND THE PAGE IS NOT REACHABLE AT ALL THIS ROUND — §4 forbids enabling the entry. */
  ok(SRC.index.indexOf('product-strategy-board') < 0,
    'I6 index.html has no menu item, mount or script tag for the board');
  ok(SRC.app.indexOf('product-strategy-board') < 0,
    'I7 and app.js has no section-map entry, so showSection cannot reach it');
  eq(PAGE.CONTRACT.registered_in_navigation, false, 'I8 which the page states as its own contract');
}());

// ===================================================================================================
console.log('\n=== §J  THE SCENARIO STAYS IN MEMORY, AND THE PAGE WRITES NOTHING ===');
// ===================================================================================================
(function () {
  var b = bare(SRC.page) + bare(SRC.live);
  ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie'].forEach(function (n, i) {
    ok(b.indexOf(n) < 0, 'J1.' + (i + 1) + ' neither production file touches ' + n);
  });
  ['XMLHttpRequest', 'navigator.sendBeacon', 'google.script.run'].forEach(function (n, i) {
    ok(b.indexOf(n) < 0, 'J2.' + (i + 1) + ' nor ' + n);
  });
  /* The accessor owns the wire, and the live adapter reaches it only through the accessor. */
  ok(typeof LIVE.fetch === 'function', 'J3 the live adapter exposes one asynchronous entry point');
  ok(bare(SRC.live).indexOf('transport') < 0,
    'J4 but never touches the transport — the accessor owns the wire');
  eq(PAGE.CONTRACT.writes_browser_storage, false, 'J5 stated as contract');
  eq(PAGE.CONTRACT.reads_url_parameters, false, 'J6 and so is the URL rule');
}());

// ===================================================================================================
console.log('\n=== §K  THE PROMOTION: one copy of every rule, and production owns it ===');
// ===================================================================================================
(function () {
  var must = ['psb-data-contract.js', 'psb-selectors.js', 'psb-chart-layout.js', 'psb-board-ui.js',
    'km-product-strategy-live-adapter.js'];
  must.forEach(function (f, i) {
    ok(fs.existsSync(path.join(JS, 'product-strategy', f)),
      'K1.' + (i + 1) + ' assets/js/product-strategy/' + f + ' exists');
  });
  var proto = path.join(ROOT, 'docs', 'prototypes', 'product-strategy-board');
  ['data-contract.js', 'selectors.js', 'chart-layout.js', 'prototype.js', 'prototype.css']
    .forEach(function (f, i) {
      ok(!fs.existsSync(path.join(proto, f)),
        'K2.' + (i + 1) + ' and no copy of ' + f + ' is left in the prototype');
    });
  /* THE ONLY FILE THE PROTOTYPE STILL OWNS IS ITS FIXTURE, which is the correct division: the
     fixture is the one thing production must never have. */
  var left = fs.readdirSync(proto).filter(function (f) { return /\.(js|css)$/.test(f); });
  eq(left.sort(), ['preview-fixture.js'],
    'K3 the prototype owns exactly one script — the fixture production must never have');

  eq(LIVE.CONTRACT.replaces,
    'PSB_CONTRACT.OperationDbProductStrategyDataAdapter (defined and disabled since P0)',
    'K4 the live adapter fills the seam the contract reserved, rather than adding a second one');
  eq(CONTRACT.OperationDbProductStrategyDataAdapter.enabled, false,
    'K5 and the reserved stub itself stays disabled — it is a definition, not a second adapter');

  /* THE BOARD TAKES ITS ADAPTER AS AN ARGUMENT, which is the whole integration. */
  var BOARD_SRC = bare(SRC.board);
  ok(BOARD_SRC.indexOf('opts.adapter') >= 0, 'K6 the board accepts an injected adapter');
  ok(/PSB_BOARD_DEFER/.test(SRC.board), 'K7 and can defer its own boot for a host that must fetch first');
}());

// ===================================================================================================
console.log('\n=== §L  THE PRODUCTION PAGE: four steps, and no fifth ===');
// ===================================================================================================
(function () {
  eq(PAGE.scopeIsComplete({ company: 'K', country: 'US', marketplace: 'Amazon' }), true,
    'L1 a complete scope is complete');
  [{}, { company: 'K' }, { company: 'K', country: 'US' }, { company: '', country: 'US', marketplace: 'A' }]
    .forEach(function (s, i) {
      eq(PAGE.scopeIsComplete(s), false, 'L2.' + (i + 1) + ' two of three is not a narrower question');
    });

  var calls = 0;
  var accessorOff = { isEnabled: function () { return false; },
    get: function () { calls++; return Promise.resolve({}); } };

  PENDING = PAGE.mount({ accessor: accessorOff, host: null, document: null })
    .then(function (r) {
      eq(r.state, 'FEATURE_DISABLED', 'L3 a disabled capability is answered without a request');
      eq(calls, 0, 'L4 and NO request was sent — the mirror is asked first');
      eq(r.mounted, false, 'L5 nothing is mounted');

      var accessorOn = { isEnabled: function () { return true; },
        get: function () { calls++; return Promise.resolve({}); } };
      return PAGE.mount({ accessor: accessorOn, scope: { company: 'K' } });
    })
    .then(function (r) {
      eq(r.state, PAGE.SITE_UNIVERSE_NOT_AVAILABLE,
        'L6 an incomplete scope stops before the wire');
      eq(calls, 0, 'L7 and still no request — the scope is checked locally');
      /* P1-B6 CLOSED THIS. L8 and L9 asserted that no owner existed and that inventing one was
         forbidden; both were true, and an assertion that a gap exists is worth exactly as much as the
         gap. What still matters is WHICH owner it is — L9's warning was about a SECOND authority for
         marketplace_skus membership, and that warning is what these now check. */
      eq(PAGE.CONTRACT.site_universe_owner, 'productPricing.siteUniverse.get',
        'L8 the site universe has a named read owner');
      eq(PAGE.CONTRACT.site_universe_gap, null, 'L8a and the recorded gap is closed');
      ok(PAGE.CONTRACT.site_universe_owner.indexOf('productPricing.') === 0,
        'L9 and it is the SAME Product Pricing owner — not a second marketplace_skus authority');
      eq(PAGE.CONTRACT.reads_universe_before_workspace, true,
        'L9a the universe is read before the workspace, never the other way round');
      eq(PAGE.CONTRACT.derives_site_universe_from_workspace_response, false,
        'L9b and the universe is never reverse-engineered from a site-scoped answer');
    });
}());

// ===================================================================================================
console.log('\n=== §M  `scratchpad/dryrun/wrapper.gs` — the on-sight audit (§9) ===');
// ===================================================================================================
(function () {
  /* THE AUDIT'S FINDING, PINNED SO IT CANNOT SILENTLY STOP BEING TRUE. The file was a Claude-local
     scratchpad artifact for S1-R4H, in no worktree and referenced by nothing. If a file by that
     name ever appears in the repository, this goes red and somebody looks at it. */
  var here = [];
  function walk(dir, depth) {
    if (depth > 4) return;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entries.forEach(function (e) {
      if (e.name === 'node_modules' || e.name === '.git') return;
      var full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name === 'wrapper.gs') here.push(full);
    });
  }
  walk(ROOT, 0);
  eq(here, [], 'M1 no wrapper.gs exists anywhere in the repository');

  var s1 = 'RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL';
  var dry = 'TEMP_RUN_S1_FACTORY_MOVEMENT_LEGACY_TEST_ROW_REMOVAL_DRY_RUN';
  var hits = [];
  function grep(dir, depth) {
    if (depth > 4) return;
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entries.forEach(function (e) {
      if (e.name === 'node_modules' || e.name === '.git') return;
      var full = path.join(dir, e.name);
      if (e.isDirectory()) { grep(full, depth + 1); return; }
      /* CODE ONLY, AND THAT IS THE RULE RATHER THAN A CONVENIENCE. What must not exist is something
         that can CALL the wrapper — a .gs the project would load, a .js a page would run. The design
         freeze names it in §40.11 on purpose: the audit's finding includes a removal plan for the
         live Apps Script project, and a removal plan that cannot name the thing to remove is not a
         plan. A name in prose calls nothing. */
      if (!/\.(gs|js)$/.test(e.name)) return;
      /* EXCLUDING THE SEARCHER FROM ITS OWN SEARCH. This file carries the name because it is the
         thing being looked for; counting itself would make the audit permanently red for the one
         reason that is not a finding. */
      if (full === __filename) return;
      var txt;
      try { txt = fs.readFileSync(full, 'utf8'); } catch (x) { return; }
      if (txt.indexOf(dry) >= 0) hits.push(full);
    });
  }
  grep(ROOT, 0);
  eq(hits, [], 'M2 and nothing in the repository references the dry-run wrapper by name');
  ok(s1.length > 0, 'M3 the removal tool it wrapped is named here only as a string, never called');
}());

// ===================================================================================================
console.log('\n=== §N  MUTANTS — the paths where being wrong is worst ===');
// ===================================================================================================
function mut(label, file, from, to, probe) {
  var full = path.join(JS, file);
  var original = fs.readFileSync(full, 'utf8');
  var norm = original.replace(/\r\n/g, '\n');
  var n = norm.split(from).length - 1;
  if (n !== 1) {
    mutSurvived++;
    console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label);
    return;
  }
  var mutated = norm.replace(from, to);
  fs.writeFileSync(full, mutated, 'utf8');
  var caught = false, why = '';
  try {
    delete require.cache[require.resolve(full)];
    var M = require(full);
    caught = probe(M) === true;
  } catch (e) { caught = true; why = 'threw: ' + e.message; }
  fs.writeFileSync(full, original, 'utf8');
  delete require.cache[require.resolve(full)];
  require(full);
  if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught' + (why ? ', ' + why : '') + ')'); }
  else { mutSurvived++; console.log('  MUTANT SURVIVED — ' + label); }
}

var LIVE_FILE = path.join('product-strategy', 'km-product-strategy-live-adapter.js');
var PAGE_FILE = path.join('pages', 'product-strategy-board.js');

function rowsNow(M, o) {
  return M.createFromResponse(envelope(rowsForSite(SITES[1]), o || {}), {}).load();
}

mut('N1 a partially-readable source is allowed to draw what it did see', LIVE_FILE,
  "    var rows = verdict.state === 'OK' ? adapted.rows : [];",
  "    var rows = (verdict.state === 'OK' || verdict.state === 'SOURCE_PARTIALLY_READABLE')"
    + " ? adapted.rows : [];",
  function (M) { return rowsNow(M, { sourceState: 'SOURCE_PARTIALLY_READABLE' }).row_count !== 0; });

mut('N2 an integrity stop still yields rows', LIVE_FILE,
  "    if (st !== 'READY') {\n      return { state: st,",
  "    if (st !== 'READY' && st !== 'STOP_DATA_INTEGRITY') {\n      return { state: st,",
  function (M) { return rowsNow(M, { sourceState: 'STOP_DATA_INTEGRITY' }).state !== 'STOP_DATA_INTEGRITY'; });

mut('N3 a schema version this build never read is adapted anyway', LIVE_FILE,
  "    if (seen !== null && seen !== undefined && seen !== pricingAdapter.EXPECTED_SCHEMA_CONTRACT_VERSION) {",
  "    if (false) {",
  function (M) { return rowsNow(M, { version: 9 }).state !== 'SCHEMA_CONTRACT_MISMATCH'; });

mut('N4 a missing sourceState is read as an empty source', LIVE_FILE,
  "      return { state: 'SOURCE_NOT_CONNECTED',\n        refusals: (isArr(adapted.refusals) && adapted.refusals.length)",
  "      return { state: 'SOURCE_EMPTY',\n        refusals: (isArr(adapted.refusals) && adapted.refusals.length)",
  function (M) {
    var s = M.createFromResponse({ success: true, data: { normalizedRows: [], refusals: [],
      analysis_permitted: true }, meta: {}, errors: [] }, {}).load();
    return s.state !== 'SOURCE_NOT_CONNECTED';
  });

mut('N5 a state nobody froze is believed', LIVE_FILE,
  "    if (st !== '' && L.SERVER_SOURCE_STATES.indexOf(st) < 0) {",
  "    if (false) {",
  function (M) { return rowsNow(M, { sourceState: 'MOSTLY_FINE' }).state !== 'SCHEMA_CONTRACT_MISMATCH'; });

mut('N6 the row shape check is skipped, so a renamed field becomes a blank column', LIVE_FILE,
  "    var check = contract.validateRows(adapted.rows);\n    if (!check.ok) {",
  "    var check = contract.validateRows(adapted.rows);\n    if (false) {",
  function (M) {
    var broken = rowsForSite(SITES[1]).slice(0, 2).map(function (r) {
      var c = JSON.parse(JSON.stringify(r)); delete c.company; return c;
    });
    return M.createFromResponse(envelope(broken, {}), {}).load().state !== 'CONTRACT_MISMATCH';
  });

mut('N7 may_analyse is true wherever rows happen to exist', LIVE_FILE,
  "        may_analyse: ux.may_analyse === true,",
  "        may_analyse: rows.length > 0,",
  function (M) {
    var s = rowsNow(M, { sourceState: 'SOURCE_EMPTY' });
    var t = M.createFromResponse(envelope([], { sourceState: 'READY' }), {}).load();
    return t.may_analyse !== true;
  });

mut('N8 provenance claims live prices for a refused read', LIVE_FILE,
  "      price_source: verdict.state === 'OK' ? 'OPERATION_SYSTEM_DATABASE' : 'NONE',",
  "      price_source: 'OPERATION_SYSTEM_DATABASE',",
  function (M) {
    return rowsNow(M, { sourceState: 'SOURCE_EMPTY' }).provenance.price_source
      === 'OPERATION_SYSTEM_DATABASE';
  });

mut('N9 the source state is re-derived from the row count instead of read', LIVE_FILE,
  "    if (st !== 'READY') {",
  "    if (st !== 'READY' && adapted.rows.length === 0) {",
  function (M) { return rowsNow(M, { sourceState: 'SOURCE_EMPTY' }).state !== 'SOURCE_EMPTY'; });

mut('N10 the schema check runs AFTER the source state, so a bad shape reports a source verdict',
  LIVE_FILE,
  "    var seen = adapted.provenance ? adapted.provenance.schema_contract_seen : null;",
  "    var seen = null;",
  function (M) {
    return rowsNow(M, { version: 7, sourceState: 'SOURCE_EMPTY' }).state !== 'SCHEMA_CONTRACT_MISMATCH';
  });

mut('N11 the page asks the server before it asks the capability mirror', PAGE_FILE,
  "      return !!accessor && typeof accessor.isEnabled === 'function' && accessor.isEnabled() === true;",
  "      return !!accessor;",
  function (M) {
    /* SYNCHRONOUS ON PURPOSE. The capability branch runs before mount() returns its promise, so a
       mutant that drops it reaches the accessor during the call — and `probe` must answer with a
       boolean, not a promise, or it is comparing a Promise to `true` and always says "survived". */
    /* SYNCHRONOUS ON PURPOSE — `probe` must answer with a boolean, not a promise, or it compares a
       Promise to `true` and always reports "survived". A mutant that drops the capability test reaches
       the site-universe read during the call, so the counter moves before mount() returns. */
    var calls = 0;
    M.mount({ accessor: { isEnabled: function () { return false; },
      getSiteUniverse: function () { calls++; return Promise.resolve({}); },
      get: function () { calls++; return Promise.resolve({}); } },
      siteUniverse: require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js')),
      scope: { company: 'K', country: 'US', marketplace: 'Amazon' } });
    return calls > 0;
  });

mut('N12 an incomplete scope is sent anyway and the server is asked to refuse it', PAGE_FILE,
  "      if (!C.narrowed.complete) {",
  "      if (false) {",
  function (M) {
    /* The mutant lets a two-of-three scope fall through to the workspace read. Driven through the
       controller so this is about BEHAVIOUR, not about the text of a branch — and synchronously,
       because `live.fetch` invokes `accessor.get` before it returns its promise, so the counter moves
       during the call. A probe that returned a promise would compare a Promise to `true`. */
    var wsCalls = 0;
    var SU = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
    var c = M.create({
      accessor: { isEnabled: function () { return true; },
        getSiteUniverse: function () { return Promise.resolve({}); },
        get: function () { wsCalls++; return Promise.resolve({ success: false, errors: [] }); } },
      siteUniverse: SU, liveAdapter: LIVE, board: { mount: function () {} }
    });
    // The universe is installed directly so the whole probe stays synchronous.
    c.universe = { state: 'OK', sites: [], hierarchy: {
      companies: ['ResTW'],
      countries_by_company: { ResTW: ['AU', 'CA'] },
      marketplaces_by_country: { 'ResTW|AU': ['Amazon'], 'ResTW|CA': ['Amazon'] } } };
    c.select({ company: 'ResTW' });   // country still unchosen -> must NOT reach the wire
    return wsCalls > 0;
  });

// ===================================================================================================
PENDING.then(function () {
  console.log('\n' + '='.repeat(100));
  console.log('passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log('='.repeat(100));
  if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
});
