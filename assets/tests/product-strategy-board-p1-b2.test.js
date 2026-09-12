// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B2
// THE SITE DECIDES WHAT EXISTS, THE DATA DECIDES HOW MANY CATEGORIES THERE ARE, AND A SIMULATED PRICE
// HAS NOWHERE TO GO.
//
// Three questions this round had to answer, and each one turned out to be a different kind of defect:
//
//   1. WHY DOES THE SCREEN SHOW THREE CATEGORIES? Because the prototype's fixture had three category
//      string literals in a hard-coded MODELS array and is connected to nothing. Not an allowlist, not
//      a cap, not a normalization that merged, not a partial sample — a fixture. Measured by execution
//      below, not by reading the file.
//
//   2. WAS THE MENU EVEN SITE-DERIVED? No. `ADAPTER.categories` was a distinct-category list computed
//      ONCE over every site the fixture knew about. On DE — which sells one category — it offered
//      three, and picking either of the other two produced an empty category card for products that
//      country does not stock. That is the same defect as showing a SKU that is not on the site, one
//      level up, and it is asserted here on the OLD shape being gone as well as the new one working.
//
//   3. CAN A MEETING'S PRICE ESCAPE? Every path is checked: no localStorage, no sessionStorage, no
//      IndexedDB, no cookie, no URL, no DB, no writer — and the canonical value is kept beside the
//      simulated one so a reload has something to restore to.
//
// THE PROTOTYPE'S OWN 170-ODD DOM ASSERTIONS ARE EXECUTED HERE, HEADLESS. They used to be observable
// only by opening the file in a browser, which meant a refactor of the render pipeline could be
// reasoned about but not proved. §H below drives the real page through a DOM shim narrow enough to be
// auditable (the selector shapes the file actually uses, and no others) and reports the page's own
// verdict as this suite's assertions.
//
// Run: node assets/tests/product-strategy-board-p1-b2.test.js
'use strict';

var fs = require('fs'), path = require('path'), vm = require('vm');
var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
function ok(c, l, d) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function mut(label, f) {
  var caught = false;
  try { caught = f() === true; } catch (e) { caught = false; }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}
var H = require('./_psb-harness.js');
var ROOT = H.ROOT, SRC = H.SRC, bare = H.bare, bootPage = H.bootPage;
var selfTestVerdict = H.selfTestVerdict, pipeline = H.pipeline, PAGE_IDS = H.PAGE_IDS;
var P = pipeline();
var S = P.S, C = P.C, CANON = P.canon;
function site(country, marketplace, company) {
  return { company: company || 'Kitchen Mama', country: country, marketplace: marketplace };
}
function board(sel, over) {
  var spec = { rows: CANON, selection: sel };
  Object.keys(over || {}).forEach(function (k) { spec[k] = over[k]; });
  return S.deriveBoardModel(spec);
}
function catValues(m) { return m.categoryOptions.options.map(function (o) { return o.value; }); }

console.log('\nSECTION Z  THE SUITE READS WHAT IT THINKS IT READS');
(function () {
  Object.keys(SRC).forEach(function (k, i) {
    ok(SRC[k].indexOf('\r') < 0,
      'Z' + (i + 1) + ' ' + k + ' was read with normalized line endings');
  });
  // A multi-line anchor of the kind every mutant uses, asserted to match exactly once. If a checkout
  // ever breaks this again THIS says so — instead of six mutants reporting a rule that is intact.
  var probe = '  S.setScenarioOverride = function (overrides, spec) {\n    spec = spec || {};';
  eq(SRC.selectors.split(probe).length - 1, 1,
    'Z7 and a multi-line mutant anchor matches exactly once');
}());

console.log('\n=== §A  THE ROOT CAUSE, MEASURED ===');
// A1 the three categories are three literals in a fixture, and the fixture reads nothing.
(function () {
  var lits = (SRC.fixture.match(/cat: '[^']*'/g) || []).map(function (x) {
    return /cat: '([^']*)'/.exec(x)[1];
  });
  var distinct = [];
  lits.forEach(function (v) { if (distinct.indexOf(v) < 0) distinct.push(v); });
  ok(distinct.length >= 3, 'A1 the categories on screen are string literals in preview-fixture.js',
    distinct);
  ok(SRC.fixture.indexOf('connected_to_db: false') >= 0,
    'A2 and the fixture declares it is connected to no database');
  var b = bare(SRC.fixture) + bare(SRC.selectors) + bare(SRC.prototype);
  ['fetch(', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'sendBeacon', 'google.script',
    'KM.DB'].forEach(function (needle, i) {
    ok(b.indexOf(needle) < 0, 'A3.' + (i + 1) + ' no transport call anywhere: ' + needle);
  });
}());

// A4 THE OLD DEFECT: a cross-site category list. It is gone, and nothing may reintroduce one.
ok(P.F.CATEGORIES === undefined,
  'A4 F.CATEGORIES (distinct category over every site) no longer exists');
ok(P.F.PreviewProductStrategyDataAdapter.categories === undefined,
  'A5 and the adapter publishes no category list of its own');
ok(bare(SRC.prototype).indexOf('ADAPTER.categories') < 0,
  'A6 and no renderer reads one');

// A7 the defect reproduced on the shape that remains: DE sells one category, US sells four.
(function () {
  var us = catValues(board(site('US', 'Amazon')));
  var de = catValues(board(site('DE', 'Amazon')));
  var uk = catValues(board(site('UK', 'Amazon')));
  var wmt = catValues(board(site('US', 'Walmart')));
  ok(us.length !== de.length, 'A7 two sites do not have the same number of categories',
    { us: us.length, de: de.length });
  eq(de.indexOf('Silicone Spatula'), -1,
    'A8 DE is not offered a category it does not sell');
  eq(us.indexOf('Milk Frother'), -1,
    'A9 and the US is not offered the one only DE and UK sell');
  ok(de.indexOf('Milk Frother') >= 0 && uk.indexOf('Milk Frother') >= 0,
    'A10 while the sites that do sell it are offered it');
  ok(wmt.length >= 4 && us.length >= 4,
    'A11 and the count is not three anywhere it is measured', { us: us.length, wmt: wmt.length });
}());

console.log('\n=== §B  SITE IDENTITY AND ELIGIBILITY ===');
(function () {
  var full = S.deriveSiteIdentity(site('US', 'Amazon'));
  eq([full.complete, full.state, full.key, full.scenario_permitted],
    [true, 'COMPLETE_SITE', 'Kitchen Mama|US|Amazon', true], 'B1 three parts make a site');
  var part = S.deriveSiteIdentity({ company: 'Kitchen Mama', country: 'ALL', marketplace: 'Amazon' });
  eq([part.complete, part.state, part.key, part.scenario_permitted, part.scenario_refusal],
    [false, 'AGGREGATE_ACROSS_SITES', null, false,
      'SCENARIO_REQUIRES_A_COMPLETE_SITE_IDENTITY'], 'B2 an ALL is not a site');
  eq(S.deriveSiteIdentity(site('US', 'Amazon')).price_axis_shared, false,
    'B3 a price axis is never shared, and it is published rather than promised');
  eq(S.deriveSiteIdentity({ company: 'A', country: 'ALL', marketplace: 'ALL' }).price_axis_shared,
    false, 'B4 including in the aggregate mode');
}());

// B5 the order of operations is the source's order, and it is published
eq(S.getEligibleProductUniverse({ rows: [], site: site('US', 'Amazon') }).order, [
  'complete or aggregate site identity',
  'marketplace_skus membership on company + country + marketplace',
  'marketplace_sku_status gate',
  'sku_details join by master sku',
  'sku_regional_details presence, which is reported and never used as membership'
], 'B5 membership first, regional last, and the list is the contract');

// B6 THE US EXCLUDES WHAT THE US DOES NOT SELL, and the reason is named per row
(function () {
  var u = S.getEligibleProductUniverse({ rows: CANON, site: site('US', 'Amazon') });
  var frother = u.rows.filter(function (r) { return r.category === 'Milk Frother'; });
  eq(frother.length, 0, 'B6 no DE/UK-only SKU survives the US membership gate');
  var why = u.excluded.filter(function (e) { return /MF8800/.test(e.identity); });
  ok(why.length > 0 && why[0].reason === 'NOT_LISTED_ON_THIS_SITE',
    'B7 and its exclusion carries a reason, not a silence', why[0]);
  ok(u.rows.length > 0 && u.rows.every(function (r) { return r.country === 'US'; }),
    'B8 every surviving row is on the selected country');
  ok(u.rows.every(function (r) { return r.marketplace === 'Amazon'; }),
    'B9 and on the selected marketplace');
}());

// B10 CURRENCY DOES NOT DECIDE MEMBERSHIP — a USD price on a non-US listing proves nothing
(function () {
  var rows = CANON.slice();
  var alien = JSON.parse(JSON.stringify(rows.filter(function (r) {
    return r.country === 'DE'; })[0]));
  alien.identity = 'MSK-DE-AMZ-FAKEUSD';
  alien.currency = 'USD';
  var u = S.getEligibleProductUniverse({ rows: rows.concat([alien]), site: site('US', 'Amazon') });
  eq(u.rows.filter(function (r) { return r.identity === 'MSK-DE-AMZ-FAKEUSD'; }).length, 0,
    'B10 a USD price does not put a DE listing on the US site');
  eq(u.currency_decides_membership, false, 'B11 and the universe says so as data');
  eq(u.master_table_decides_membership, false, 'B12 nor does the master table');
}());

// B13 THE STATUS GATE: one excluded, one kept, and include_inactive returns the excluded one
(function () {
  var byDefault = S.getEligibleProductUniverse({ rows: CANON, site: site('US', 'Amazon') });
  var withAll = S.getEligibleProductUniverse({ rows: CANON, site: site('US', 'Amazon'),
    includeInactive: true });
  var inactive = byDefault.excluded.filter(function (e) { return e.reason === 'EXCLUDED_BY_STATUS'; });
  ok(inactive.length > 0, 'B13 something is excluded by status, so the gate is demonstrated');
  ok(withAll.counts.eligible > byDefault.counts.eligible,
    'B14 include_inactive returns it rather than the gate having deleted it',
    { d: byDefault.counts.eligible, a: withAll.counts.eligible });
  var phasing = byDefault.rows.filter(function (r) { return r.source_status === 'phasing_out'; });
  ok(phasing.length > 0, 'B15 and phasing_out is still on sale, so it is present by default');
  eq(byDefault.permitted_statuses, ['active', 'phasing_out'], 'B16 the permitted set is those two');
}());

// B17 AN UNREADABLE STATUS IS NOT "YES"
(function () {
  var r = JSON.parse(JSON.stringify(CANON.filter(function (x) {
    return x.country === 'US' && x.marketplace === 'Amazon'; })[0]));
  r.identity = 'MSK-US-AMZ-BLANKSTATUS';
  r.source_status = '';
  var u = S.getEligibleProductUniverse({ rows: [r], site: site('US', 'Amazon') });
  eq(u.counts.eligible, 0, 'B17 a blank site status does not default to sellable');
  eq(u.excluded[0].reason, 'SITE_STATUS_MISSING', 'B18 and it is named');
  eq(u.dataQuality.status_missing_or_unrecognised.length, 1, 'B19 and reported as Data Quality');
  var r2 = JSON.parse(JSON.stringify(r));
  r2.source_status = 'probably_fine';
  eq(S.getEligibleProductUniverse({ rows: [r2], site: site('US', 'Amazon') }).excluded[0].reason,
    'SITE_STATUS_NOT_RECOGNISED', 'B20 nor does a status outside the shipped vocabulary');
}());

// B21 THE LIVE RESPONSE'S NAME COLLISION IS A NAMED REFUSAL, NOT A MISREAD
(function () {
  var r = JSON.parse(JSON.stringify(CANON[0]));
  r.source_status = ['REGIONAL_DETAILS_MISSING', 'PRICING_SOURCE_MISSING'];
  eq(S.statusStateOf(r, ['active']), 'SITE_STATUS_SHAPE_UNEXPECTED',
    'B21 an array in source_status is refused by shape — this is what catches the adapter swap');
  ok(SRC.selectors.indexOf('marketplace_sku_status') > 0,
    'B22 and the collision is documented where the reader will be');
}());

console.log('\n=== §C  REGIONAL DETAIL: KEPT, REPORTED, AND OFF THE CHART ===');
(function () {
  var u = S.getEligibleProductUniverse({ rows: CANON, site: site('US', 'Walmart') });
  var shears = u.rows.filter(function (r) { return r.category === 'Kitchen Shears'; });
  eq(shears.length, 1, 'C1 a listing with no regional record is STILL in the universe');
  eq(S.regionalStateOf(shears[0]), 'REGIONAL_DETAILS_MISSING', 'C2 and its state is named');
  eq(u.dataQuality.regional_details_missing.length, 1, 'C3 it is reported as Data Quality');
  var flag = u.flagsByIdentity[shears[0].identity];
  eq([flag.chartable, flag.chart_refusals], [false, ['REGIONAL_DETAILS_MISSING']],
    'C4 and it is kept off the price chart, with the reason attached');
  eq(u.chartRows.filter(function (r) { return r.category === 'Kitchen Shears'; }).length, 0,
    'C5 so no chart row carries it');
  eq(u.regional_detail_decides_membership, false,
    'C6 THE POINT: absence of a regional row is not absence from the site');
  ok(u.rows.filter(function (r) { return r.regional !== null; }).length > 0,
    'C7 and the rows that do have one carry the live shape');
  var withReg = u.rows.filter(function (r) { return r.regional !== null; })[0];
  ['regional_detail_id', 'site_sku', 'marketplace_product_id', 'product_url',
    'packaging_regulation', 'language'].forEach(function (k, i) {
    ok(Object.prototype.hasOwnProperty.call(withReg.regional, k),
      'C8.' + (i + 1) + ' regional carries ' + k + ', as 72_ returns it');
  });
}());

// C9 THE SAME MASTER SKU ON TWO MARKETPLACES IS TWO LISTINGS
(function () {
  var both = CANON.filter(function (r) { return r.master_sku === 'SP3120-R'; });
  ok(both.length >= 2, 'C9 one master sku is listed on more than one site', both.length);
  var ids = both.map(function (r) { return r.identity; });
  var siteSkus = both.map(function (r) { return r.site_sku; });
  eq(ids.length, ids.filter(function (v, i) { return ids.indexOf(v) === i; }).length,
    'C10 and each listing has its own identity');
  eq(siteSkus.length, siteSkus.filter(function (v, i) { return siteSkus.indexOf(v) === i; }).length,
    'C11 and its own site_sku, in its own shape', siteSkus);
  var amz = board(site('US', 'Amazon'), { filters: { category: 'Silicone Spatula' } });
  var wmt = board(site('US', 'Walmart'), { filters: { category: 'Silicone Spatula' } });
  var amzSkus = amz.rows.map(function (r) { return r.site_sku; });
  eq(amzSkus.filter(function (s) { return /^WMT-/.test(s); }).length, 0,
    'C12 the Amazon board shows no Walmart site_sku');
  ok(wmt.rows.filter(function (r) { return /^WMT-/.test(r.site_sku); }).length > 0,
    'C13 and the Walmart board shows its own');
}());

console.log('\n=== §D  THE CATEGORY MENU ===');
(function () {
  var m = board(site('US', 'Walmart'));
  var o = m.categoryOptions;
  eq(o.allowlist, null, 'D1 no allowlist');
  eq(o.max_options, null, 'D2 no maximum');
  eq(o.source, 'sku_details.category', 'D3 one authority, and it is the shipped column');
  eq(o.normalization, 'trim only', 'D4 trim is the only normalization');
  eq(o.semantic_merge, false, 'D5 nothing is folded');
  eq(o.blank_becomes_other, false, 'D6 and a blank never becomes "Other"');
  eq(catValues(m), catValues(m).slice().sort(),
    'D7 deterministic ascending order, never the source order');
  ok(o.normalization_review.length === 1
    && o.normalization_review[0].variants.join('|') === 'Silicone Spatula|silicone spatula',
    'D8 two values differing only by case are KEPT AS TWO and reported', o.normalization_review);
  eq(o.blank_count, 1, 'D9 the blank category is counted');
  eq(catValues(m).filter(function (v) { return v === '' || v === null || v === 'Other'; }), [],
    'D10 and it is absent from the menu rather than renamed');
  var blankRow = m.universe.rows.filter(function (r) { return r.category === null; });
  eq(blankRow.length, 1, 'D11 while the SKU itself is KEPT');
  eq(m.universe.dataQuality.category_source_missing.length, 1, 'D12 and reported as Data Quality');
}());

// D13 COUNTS ARE THE UNIVERSE, NOT THE PAGE
(function () {
  var m = board(site('US', 'Amazon'));
  var opt = m.categoryOptions.options.filter(function (o) {
    return o.value === 'Electric Can Opener'; })[0];
  var actual = m.universe.rows.filter(function (r) {
    return r.category === 'Electric Can Opener'; }).length;
  eq(opt.siteSkuCount, actual, 'D13 siteSkuCount is every eligible row of that category');
  var chartable = m.universe.rows.filter(function (r) {
    return r.category === 'Electric Can Opener'
      && m.universe.flagsByIdentity[r.identity].chartable; }).length;
  eq(opt.analysableSiteSkuCount, chartable, 'D14 and analysable is the ones that can be plotted');
  ok(opt.siteSkuCount > opt.analysableSiteSkuCount,
    'D15 which are different numbers here, so the distinction is exercised');
}());

// D16 SELF-EXCLUDING: a dimension is not narrowed by its own filter
(function () {
  var all = catValues(board(site('US', 'Amazon')));
  var picked = catValues(board(site('US', 'Amazon'),
    { filters: { category: 'Silicone Spatula' } }));
  eq(picked, all, 'D16 picking a category does not collapse the category menu to it');
  var bySeries = catValues(board(site('US', 'Amazon'), { filters: { series: 'Spatula' } }));
  ok(bySeries.length < all.length,
    'D17 but the OTHER dimension does narrow it, so every option still leads to a row',
    { all: all.length, bySeries: bySeries.length });
}());

// D18 A FOURTH AND A FIFTH CATEGORY APPEAR WITH NO CODE CHANGE
(function () {
  var base = catValues(board(site('US', 'Amazon')));
  var extra = [];
  ['Pressure Cooker', 'Zester'].forEach(function (name, i) {
    var r = JSON.parse(JSON.stringify(CANON.filter(function (x) {
      return x.country === 'US' && x.marketplace === 'Amazon' && x.category; })[0]));
    r.identity = 'MSK-US-AMZ-NEWCAT' + i;
    r.master_sku = 'NEW' + i;
    r.site_sku = 'NEW' + i + '-US';
    r.category = name;
    extra.push(r);
  });
  var grown = S.deriveBoardModel({ rows: CANON.concat(extra), selection: site('US', 'Amazon') })
    .categoryOptions.options.map(function (o) { return o.value; });
  eq(grown.length, base.length + 2, 'D18 two new category values, two new menu entries');
  ok(grown.indexOf('Pressure Cooker') >= 0 && grown.indexOf('Zester') >= 0,
    'D19 and they are the ones that were added', grown);
  eq(grown, grown.slice().sort(), 'D20 still sorted, so the new ones did not land at the end');
}());

// D21 ALIAS NORMALIZATION IS THE ONLY MERGE, AND ONLY FOR DECLARED PAIRS
(function () {
  eq(S.ALIASES, {}, 'D21 no alias is declared by default');
  eq(S.canonicalCategory('Electric  Can   Opener', { 'electric can opener': 'Electric Can Opener' }),
    'Electric Can Opener', 'D22 a declared alias resolves, case and spacing folded in the LOOKUP');
  eq(S.canonicalCategory('Something Else', { 'electric can opener': 'Electric Can Opener' }),
    'Something Else', 'D23 an undeclared value is returned unchanged, never nearest-matched');
  eq(S.canonicalCategory('   ', {}), null, 'D24 and a blank is null, not a bucket');
}());

console.log('\n=== §E  THE SCENARIO OVERLAY ===');
(function () {
  var us = site('US', 'Amazon');
  var f = { category: 'Silicone Spatula' };
  var base = board(us, { filters: f, thresholdC: 800 });
  function ladder(m) {
    return m.architecture.panels[0].plotted.map(function (n) { return n._regular_c; });
  }
  eq(base.scenario.active, false, 'E1 no scenario by default');
  eq(base.scenario.storage, 'IN_MEMORY_ONLY', 'E2 and the only storage there is is memory');
  eq(base.scenario.survives_reload, false, 'E3 which is published as not surviving a reload');

  var pct = S.setScenarioOverride({}, { site: us, series: 'Spatula',
    field: 'everyday_scenario_price', mode: 'PERCENT', value: -15 });
  var sim = board(us, { filters: f, thresholdC: 800, overrides: pct });
  eq(Object.keys(pct), ['Kitchen Mama|US|Amazon'],
    'E4 the override is keyed by the SITE first');
  eq(Object.keys(pct['Kitchen Mama|US|Amazon']), ['Spatula'], 'E5 then the series');
  eq(Object.keys(pct['Kitchen Mama|US|Amazon'].Spatula), ['everyday_scenario_price'],
    'E6 then the price field — the shape the brief specifies');

  // THE LADDER MOVES AND KEEPS ITS SHAPE. This is the assertion the first implementation failed.
  var b = ladder(base), s2 = ladder(sim);
  eq(s2.length, b.length, 'E7 the same products are on the axis');
  ok(s2.every(function (v, i) { return v < b[i]; }), 'E8 every one of them moved down', { b: b, s: s2 });
  eq(s2.length, s2.filter(function (v, i) { return i === 0 || v > s2[i - 1]; }).length,
    'E9 AND THE LADDER IS STILL A LADDER — a series override is not one number for every rung',
    s2);
  ok(sim.architecture.scenario_nodes.length === b.length,
    'E10 every affected node is marked as simulated');

  // the canonical value is kept
  var n0 = sim.architecture.panels[0].plotted[0];
  eq(n0._canonical.regular_c, base.architecture.panels[0].plotted[0]._regular_c,
    'E11 the canonical price is kept beside the simulated one');
  eq(n0._scenario.fields.everyday_scenario_price.mode, 'PERCENT', 'E12 with the mode recorded');
  eq(n0._scenario.fields.everyday_scenario_price.input, '-15', 'E13 and the operator input kept');
  eq(n0._scenario.label, 'Scenario · Unsaved', 'E14 and a visible label saying it is unsaved');
  eq(n0._scenario.values_are, 'SIMULATED_IN_MEMORY', 'E15 and its values named as simulated');

  // AN EVERYDAY LADDER MAY NOT BE FLATTENED
  eq(S.scenarioModeRefusal('everyday_scenario_price', 'ABSOLUTE'),
    'EVERYDAY_ABSOLUTE_AT_SERIES_SCOPE_WOULD_FLATTEN_THE_LADDER',
    'E16 one number for a whole everyday ladder is refused by name');
  eq(S.setScenarioOverride({}, { site: us, series: 'Spatula',
    field: 'everyday_scenario_price', mode: 'ABSOLUTE', value: '9.99' }), {},
    'E17 and the refused edit stores nothing at all');
  eq(S.scenarioModeRefusal('proposed_scenario_price', 'ABSOLUTE'), null,
    'E18 while a series-wide PROMOTION price is one number, and is allowed');

  // THE DERIVED METRICS MOVE WITH IT
  var promo = S.setScenarioOverride({}, { site: us, series: 'Spatula',
    field: 'proposed_scenario_price', mode: 'ABSOLUTE', value: '12.99' });
  var pm = board(us, { filters: f, thresholdC: 800, overrides: promo });
  function risks(m) { return m.architecture.findings.filter(function (x) {
    return x.cls === 'RISK'; }).length; }
  ok(risks(pm) > risks(base),
    'E19 a series-wide promotion creates cannibalisation findings that were not there',
    { base: risks(base), promo: risks(pm) });
  ok(pm.architecture.findings.filter(function (x) { return x.scenario_driven === true; }).length > 0,
    'E20 and the findings it caused say they are scenario-driven');

  // IT CANNOT LEAVE THE SITE
  eq(board(site('DE', 'Amazon'), { overrides: pct }).architecture.scenario_nodes, [],
    'E21 a US scenario does not touch the DE ladder');
  eq(board(site('US', 'Walmart'), { overrides: pct }).architecture.scenario_nodes, [],
    'E22 nor the other marketplace of the same country');

  // IT CANNOT LEAVE THE SERIES
  var other = board(us, { filters: { category: 'Electric Can Opener' }, overrides: pct });
  eq(other.architecture.scenario_nodes, [],
    'E23 and a Spatula scenario does not touch the Can Opener ladder');

  // THE AGGREGATE MODE REFUSES ONE
  var agg = board({ company: 'Kitchen Mama', country: 'ALL', marketplace: 'ALL' },
    { overrides: pct });
  eq([agg.scenario.permitted, agg.scenario.refusal],
    [false, 'SCENARIO_REQUIRES_A_COMPLETE_SITE_IDENTITY'],
    'E24 no scenario without a site, because a price needs a currency');
  ok(agg.architecture.currencies.length > 1,
    'E25 and the aggregate splits into one axis per currency rather than pooling',
    agg.architecture.currencies);
}());

// E26 THE THREE RESETS ARE THREE DIFFERENT QUESTIONS
(function () {
  var us = site('US', 'Amazon'), de = site('DE', 'Amazon');
  var o = {};
  o = S.setScenarioOverride(o, { site: us, series: 'Spatula',
    field: 'proposed_scenario_price', value: '9.99' });
  o = S.setScenarioOverride(o, { site: us, series: 'Can Opener',
    field: 'proposed_scenario_price', value: '19.99' });
  o = S.setScenarioOverride(o, { site: de, series: 'Can Opener',
    field: 'proposed_scenario_price', value: '17.99' });
  eq(S.scenarioCount(o), 3, 'E26 three overrides across two sites');
  var a = S.resetScenarioOverrides(o, { scope: 'series', site: us, series: 'Spatula' });
  eq(S.scenarioCount(a), 2, 'E27 reset this Series removes exactly one');
  ok(a['Kitchen Mama|US|Amazon']['Can Opener'] && a['Kitchen Mama|DE|Amazon'],
    'E28 and leaves the other series and the other site alone');
  var b = S.resetScenarioOverrides(o, { scope: 'site', site: us });
  eq(Object.keys(b), ['Kitchen Mama|DE|Amazon'], 'E29 reset current site removes only this site');
  eq(S.resetScenarioOverrides(o, { scope: 'all' }), {}, 'E30 reset all removes everything');
  eq(S.resetScenarioOverrides(o, { scope: 'evrything', site: us }), o,
    'E31 an unrecognised scope resets NOTHING — a typo must not clear the board');
  eq(S.scenarioCount(o), 3, 'E32 and none of those four calls mutated the input');
}());

// E33 A RELOAD IS A NEW EMPTY OBJECT, AND THE SOURCE VALUES COME BACK
(function () {
  var us = site('US', 'Amazon');
  var o = S.setScenarioOverride({}, { site: us, series: 'Spatula',
    field: 'everyday_scenario_price', mode: 'DELTA', value: '-5.00' });
  var withScenario = board(us, { filters: { category: 'Silicone Spatula' }, overrides: o });
  var afterReload = board(us, { filters: { category: 'Silicone Spatula' }, overrides: {} });
  var simulated = withScenario.architecture.panels[0].plotted.map(function (n) {
    return n._regular_c; });
  var restored = afterReload.architecture.panels[0].plotted.map(function (n) {
    return n._regular_c; });
  var canonical = withScenario.architecture.panels[0].plotted.map(function (n) {
    return n._canonical.regular_c; });
  ok(JSON.stringify(simulated) !== JSON.stringify(restored), 'E33 the simulation did change the board');
  eq(restored, canonical, 'E34 and a reload restores exactly the canonical values');
  eq(afterReload.scenario.override_count, 0, 'E35 with no override left behind');
}());

// E36 AN UNUSABLE INPUT CLEARS RATHER THAN STORES A NULL
(function () {
  var us = site('US', 'Amazon');
  var o = S.setScenarioOverride({}, { site: us, series: 'Spatula',
    field: 'proposed_scenario_price', value: '9.99' });
  eq(S.scenarioCount(S.setScenarioOverride(o, { site: us, series: 'Spatula',
    field: 'proposed_scenario_price', value: '' })), 0, 'E36 a blank clears the override');
  eq(S.scenarioCount(S.setScenarioOverride(o, { site: us, series: 'Spatula',
    field: 'proposed_scenario_price', value: '0' })), 0, 'E37 so does a zero price');
  eq(S.scenarioCount(S.setScenarioOverride(o, { site: us, series: 'Spatula',
    field: 'proposed_scenario_price', value: 'abc' })), 0, 'E38 and so does a non-number');
  eq(S.resolveScenarioValue({ mode: 'PERCENT', value: -200 }, 1000), null,
    'E39 an adjustment that lands at or below zero is not a price');
  eq(S.resolveScenarioValue({ mode: 'PERCENT', value: -10 }, null), null,
    'E40 and a percentage of a price that does not exist is unanswerable, not zero');
}());

// E41 NO PERSISTENCE ANYWHERE, CHECKED ON SOURCE TEXT WITH LITERALS STRIPPED
(function () {
  var b = bare(SRC.selectors) + bare(SRC.prototype) + bare(SRC.fixture) + bare(SRC.contract);
  ['localStorage', 'sessionStorage', 'indexedDB', 'openDatabase', 'document.cookie',
    'history.pushState', 'location.hash', 'location.search'].forEach(function (needle, i) {
    ok(b.indexOf(needle) < 0, 'E41.' + (i + 1) + ' no ' + needle + ' in any prototype source');
  });
  var w = bare(SRC.selectors);
  ['upsert', 'submit', 'save', 'export', 'Submit', 'writeRow'].forEach(function (needle, i) {
    ok(w.indexOf(needle) < 0, 'E42.' + (i + 1) + ' and the pipeline has no ' + needle);
  });
}());

console.log('\n=== §F  THE PIPELINE IS ONE ORDER, IN ONE PLACE ===');
eq(board(site('US', 'Amazon')).pipeline, ['deriveSiteIdentity', 'getEligibleProductUniverse',
  'deriveCategoryOptions', 'applyDimensionFilters', 'applyScenarioPriceOverlay',
  'derivePriceArchitecture'], 'F1 the stages, published in order');
(function () {
  // F2 the renderer holds no second copy of a rule: every moved function is one delegation
  var b = bare(SRC.prototype);
  ['groupNodes', 'splitByCurrency', 'analyse', 'tierOf', 'sellInterval', 'priceSignature'].forEach(
    function (name, i) {
      var re = new RegExp('function ' + name + '\\([^)]*\\) \\{ return SEL\\.' + name + '\\(');
      ok(re.test(SRC.prototype), 'F2.' + (i + 1) + ' ' + name + ' is a delegation, not a copy');
    });
  ok(b.indexOf('CLASS = SEL.CLASS') > 0, 'F3 even the finding vocabulary comes from the pipeline');
  ok(/if \(!SEL\) throw new Error/.test(SRC.prototype),
    'F4 and an absent pipeline is a broken build, not a reason to guess');
}());
(function () {
  // F5 currency never pools, in any state
  var agg = board({ company: 'Kitchen Mama', country: 'ALL', marketplace: 'ALL' });
  var perPanel = {};
  agg.architecture.panels.forEach(function (p) {
    p.plotted.concat(p.notPlotted).forEach(function (n) {
      (perPanel[p.currency] = perPanel[p.currency] || {})[n.currency] = 1;
    });
  });
  var mixed = Object.keys(perPanel).filter(function (c) {
    return Object.keys(perPanel[c]).length !== 1; });
  eq(mixed, [], 'F5 no panel contains two currencies');
  eq(agg.architecture.fx_applied, false, 'F6 and nothing was converted to make that true');
  eq(agg.architecture.price_axis_per_currency, true, 'F7 one axis per currency, published');
}());

console.log('\n=== §G  EVERY DERIVED NUMBER IS RECOMPUTED, NOT HIDDEN ===');
(function () {
  var us = site('US', 'Amazon');
  var wide = board(us, { filters: { category: 'Silicone Spatula' }, thresholdC: 100 });
  var narrow = board(us, { filters: { category: 'Silicone Spatula' }, thresholdC: 100000 });
  ok(wide.architecture.findings.filter(function (f) { return f.kind === 'PRICE_GAP'; }).length
    > narrow.architecture.findings.filter(function (f) { return f.kind === 'PRICE_GAP'; }).length,
    'G1 the gap count follows the threshold');
  var deCount = board(site('DE', 'Amazon')).universe.counts.eligible;
  var usCount = board(us).universe.counts.eligible;
  ok(deCount !== usCount, 'G2 and the eligible count follows the site', { de: deCount, us: usCount });
  // G3 the counts add up, so nothing was hidden rather than excluded
  var u = board(us).universe;
  eq(u.counts.canonical, u.counts.after_site + u.counts.excluded
    - (u.counts.after_site - u.counts.eligible),
    'G3 canonical = on-site + excluded, with the status drop inside the excluded list');
  ok(u.counts.chartable <= u.counts.eligible, 'G4 chartable is never more than eligible');
}());

console.log('\n=== §H  THE REAL PAGE, RENDERED AND DRIVEN HEADLESS ===');
(function () {
  var p = bootPage(null);
  ok(p.thrown === null, 'H1 the page boots with no exception',
    p.thrown && (p.thrown.message + ' :: ' + String(p.thrown.stack).split('\n')[1]));
  if (p.thrown) return;
  var v = selfTestVerdict(p);
  console.log('     (the page reported ' + v.badge + ' across ' + v.total + ' of its own assertions)');
  ok(v.total > 150, 'H2 the page ran its own assertions, and there are still ~170 of them', v.total);
  eq(v.bad.map(function (b) { return b.text; }), [],
    'H3 EVERY ONE OF THE PAGE\'S OWN DOM ASSERTIONS PASSES');
  ok(/^self-test \d+\/\d+$/.test(v.badge) && v.badge.indexOf('/' + v.total) > 0,
    'H4 and the badge a person sees reports the same total', v.badge);

  var doc = p.dom.document;
  // ---- the site ring exists and is not gated behind the category ----
  // P1-B2A renamed the container when the scope became three tiers on the Operation System's own
  // filter contract. The rule is unchanged: the site is the FIRST thing on the page.
  ok(!!doc.getElementById('scopeSite'), 'H5 the site is the first ring on the page');
  /* P1-B4 — THE RULE IS THE ORDER OF THE FIELDS, not the order of the containers.
     This compared `#scope`'s first child, which was a proxy for "the site comes before the category"
     while the scope was a stack of tiers. It is now one command bar, so the proxy names the bar and
     the rule has to be asked of the ladder itself: company, country and marketplace, then category,
     then series — because each one decides what the next can offer. */
  eq(doc.getElementById('cmdBar').childNodes[0].id, 'scopeSite',
    'H5a and the primary row is the first thing in the bar');
  var order = doc.querySelectorAll('#scopeFields .cmd-field').map(function (f) {
    var c = f.querySelector('select, .cmd-context-value, .catbtn.is-more');
    return String((c && (c.id || c.getAttribute('data-context-for'))) || '')
      .replace(/Context$/, '');
  });
  eq(order.slice(0, 3), ['fCompany', 'fCountry', 'fMarketplace'],
    'H5b the site ladder is first, in company -> country -> marketplace order', order);
  ok(order.indexOf('fSeries') === order.length - 1,
    'H5c and Series is last — it narrows inside everything above it', order);
  eq(doc.getElementById('fCountry').disabled, false,
    'H6 and it is never disabled — the site cannot be chosen after the thing it decides');
  eq(doc.getElementById('siteState').getAttribute('data-site-state'), 'COMPLETE_SITE',
    'H7 the page opens on a complete site identity, not on an aggregate');

  // ---- the category menu on the page is the site's ----
  /* P1-B4 — THE OPTIONS ARE MENU ROWS NOW. The command bar asks the category control for its menu
     shape, so `#catBar` holds one trigger and the options are in `#catMenu`. Opening it is part of
     reading them, and the menu is closed again so the assertion leaves the page as it found it. */
  function catButtons() {
    var more = doc.getElementById('catMore');
    var wasOpen = more && more.getAttribute('aria-expanded') === 'true';
    if (more && !wasOpen) more.click();
    var out = doc.querySelectorAll('#catMenu .catmenu-item').map(function (b) {
      return b.getAttribute('data-category');
    }).filter(function (c) { return c !== 'ALL'; });
    var again = doc.getElementById('catMore');
    if (again && !wasOpen && again.getAttribute('aria-expanded') === 'true') again.click();
    return out;
  }
  var usCats = catButtons();
  /* SET EQUALITY, AND THE ORDER IS A SEPARATE RULE. This compared the on-screen order against the
     pipeline's alphabetical order, which happened to agree while the control was a row of chips. The
     menu orders by SIZE — busiest first, P1-B2A's deliberate choice and the reason the control is
     usable with forty categories — so comparing the two as sequences asserted alphabetical ordering
     by accident. The claim here is that the OPTIONS are the site's; the order is its own assertion. */
  eq(usCats.slice().sort(), catValues(board(site('US', 'Amazon'))).slice().sort(),
    'H8 the options on screen are exactly the pipeline\'s options for this site');
  function menuCountOf(cat) {
    var more = doc.getElementById('catMore');
    var wasOpen = more && more.getAttribute('aria-expanded') === 'true';
    if (more && !wasOpen) more.click();
    var hit = doc.querySelectorAll('#catMenu .catmenu-item').filter(function (n) {
      return n.getAttribute('data-category') === cat;
    })[0];
    var txt = String((hit && hit.textContent) || '');
    var again = doc.getElementById('catMore');
    if (again && !wasOpen && again.getAttribute('aria-expanded') === 'true') again.click();
    var m = /\((\d+)\)/.exec(txt);
    return m ? Number(m[1]) : null;
  }
  var usCounts = usCats.map(menuCountOf);
  ok(usCounts.every(function (n) { return n !== null; }),
    'H8a every option carries its listing count, which is part of choosing one', usCounts);
  var descending = true;
  for (var ci = 1; ci < usCounts.length; ci++) {
    if (usCounts[ci] > usCounts[ci - 1]) descending = false;
  }
  ok(descending, 'H8b and the menu is ordered busiest-first, not alphabetically', usCounts);
  ok(usCats.length !== 3, 'H9 and the number on screen is no longer three', usCats);

  // ---- CHANGE THE COUNTRY, AND NOTHING OF THE OLD SITE SURVIVES ----
  var sel = doc.getElementById('fCountry');
  sel.value = 'DE';
  sel.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  var deCats = catButtons();
  eq(deCats, catValues(board(site('DE', 'Amazon'))),
    'H10 the menu is rebuilt from the new site');
  eq(deCats.indexOf('Silicone Spatula'), -1,
    'H11 and no longer offers a category DE does not sell');
  var rows = doc.querySelectorAll('#overviewTable tbody tr');
  ok(rows.length === deCats.length,
    'H12 the overview table has one row per category of the NEW site', rows.length);
  var pageText = doc.body.textContent;
  eq(pageText.indexOf('SP3120-US'), -1, 'H13 and no US site_sku is left anywhere on the page');
  ok(pageText.indexOf('Milk Frother') > 0, 'H14 while what DE does sell is there');

  // ---- and back again, with no residue the other way ----
  sel.value = 'US';
  sel.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  eq(catButtons(), usCats, 'H15 going back restores the US menu exactly');
  eq(doc.body.textContent.indexOf('Milk Frother'), -1,
    'H16 and the DE-only product does not linger');
}());

// ---- H17 THE SCENARIO, DRIVEN THROUGH THE REAL CONTROLS ----
(function () {
  var p = bootPage(null);
  if (p.thrown) { ok(false, 'H17 page boot (scenario run)', String(p.thrown)); return; }
  var doc = p.dom.document;
  function fire(id, value) {
    var n = doc.getElementById(id);
    if (value !== undefined) n.value = value;
    n.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
    return n;
  }
  ok(!!doc.getElementById('scenarioPanel'), 'H17 the scenario panel is on the page');
  /* P1-B2A collapsed the form to keep the chart above the fold. Open it the way a person would
     before driving it: a test that reaches controls nobody can see is testing a different page. */
  if (doc.getElementById('meetingToggle').getAttribute('aria-expanded') === 'false') {
    doc.getElementById('meetingToggle').click();
  }
  eq(doc.getElementById('scenarioPanel').getAttribute('data-permitted'), 'true',
    'H18 and it is available on a complete site');
  eq(doc.getElementById('scenarioBadge').textContent, 'No scenario',
    'H19 with nothing simulated to begin with');

  // pick the Spatula series, an everyday percentage scenario, and simulate.
  // P1-B2A renamed the control: the mode enum is no longer on screen, an "Adjustment" sentence is.
  fire('scSeries', 'Spatula');
  fire('scField', 'everyday_scenario_price');
  fire('scAdjust', 'by_percent');
  fire('scValue', '-15');
  doc.getElementById('scApply').click();
  eq(doc.getElementById('scenarioBadge').textContent, 'Scenario · Unsaved',
    'H20 the badge says the board is showing simulated values');
  eq(doc.getElementById('scenarioPanel').getAttribute('data-active'), 'true',
    'H21 and the panel marks itself active');
  // P1-B2A moved the CONTRACT NAME behind the `?` and left the SENTENCE on the surface. The rule it
  // was testing is unchanged — the page still says where a simulated value lives — but it now says it
  // in words, because a person in a meeting should not have to read an identifier to learn that
  // nothing is being saved.
  ok(doc.getElementById('scenarioNote').textContent.indexOf('held in this page only') > 0,
    'H22 and says on screen where the value lives',
    doc.getElementById('scenarioNote').textContent);
  ok(doc.getElementById('scenarioNote').textContent.indexOf('IN_MEMORY_ONLY') < 0,
    'H22a without making a reader parse the contract name to find that out');

  // THE EVERYDAY-ABSOLUTE COMBINATION IS NOT EVEN OFFERED. P1-B2A removes it from the Adjustment
  // menu for the everyday field rather than accepting it and refusing afterwards — a control that
  // cannot express the mistake is better than one that explains it.
  var adjOpts = doc.getElementById('scAdjust').childNodes.map(function (o) {
    return o.getAttribute('value');
  });
  eq(adjOpts.indexOf('set'), -1,
    'H23 "Set price" is not offered for the everyday ladder — the flattening combination is absent');
  ok(adjOpts.indexOf('by_percent') >= 0 && adjOpts.indexOf('by_amount') >= 0,
    'H24 while the two that preserve the ladder are', adjOpts);

  // reset all, and the badge goes back
  doc.getElementById('scResetAll').click();
  eq(doc.getElementById('scenarioBadge').textContent, 'No scenario',
    'H25 reset all clears the board');
  eq(doc.getElementById('scenarioPanel').getAttribute('data-active'), 'false',
    'H26 and the panel is no longer active');
}());

// ---- H27 THE AGGREGATE SCOPE REFUSES A SCENARIO ON THE PAGE ----
(function () {
  var p = bootPage(null);
  if (p.thrown) { ok(false, 'H27 page boot (aggregate run)', String(p.thrown)); return; }
  var doc = p.dom.document;
  var sel = doc.getElementById('fCountry');
  sel.value = 'ALL';
  sel.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  eq(doc.getElementById('scenarioPanel').getAttribute('data-permitted'), 'false',
    'H27 the aggregate scope offers no scenario controls');
  ok(!!doc.getElementById('scenarioRefusal'), 'H28 and says why on screen');
  eq(doc.getElementById('scenarioPanel').querySelectorAll('#scApply').length, 0,
    'H29 there is no Simulate button to press');
}());

// ---- H30 index.html carries exactly the four local scripts, and the pipeline is one of them ----
(function () {
  PAGE_IDS.forEach(function (id, i) {
    ok(SRC.index.indexOf('id="' + id + '"') > 0,
      'H30.' + (i + 1) + ' the page really has #' + id + ' (the shim cannot drift from it)');
  });
  var scripts = (SRC.index.match(/<script src="([^"]+)"><\/script>/g) || []).map(function (t) {
    return /src="([^"]+)"/.exec(t)[1];
  });
  /* FIVE SINCE P1-B2C, AND SINCE P1-B5 THREE OF THEM ARE NOT LOCAL — that is the promotion.
     data-contract, chart-layout and selectors are production modules now, loaded by this page AND
     by the production board from ONE copy. Asserting the path, not just the filename, is what makes
     a silent fork visible: a prototype that quietly grew its own selectors.js beside index.html
     would still satisfy a filename-only check while drifting from the rules production ships. */
  eq(scripts, ['../../../assets/js/product-strategy/psb-data-contract.js',
    '../../../assets/js/product-strategy/psb-chart-layout.js',
    '../../../assets/js/product-strategy/psb-selectors.js',
    'preview-fixture.js',
    '../../../assets/js/product-strategy/psb-board-ui.js'],
    'H31 four promoted production modules and one local fixture, in dependency order');
  ok(scripts.filter(function (x) { return x.indexOf('assets/js/product-strategy/') >= 0; }).length === 4,
    'H31a the contract, the engine, the selectors AND the board are loaded from production');
  eq(scripts.filter(function (x) { return x.indexOf('/') < 0; }), ['preview-fixture.js'],
    'H31b the ONLY file the prototype still owns is its fixture — everything else it shares');
  ok(scripts.indexOf('selectors.js') < 0 && scripts.indexOf('data-contract.js') < 0
    && scripts.indexOf('chart-layout.js') < 0 && scripts.indexOf('prototype.js') < 0,
    'H31c and no local copy of a promoted module is loaded beside the promoted one');
  /* P1-B8A - two: the prototype-only token shim, then the board sheet. What matters is that both
     are LOCAL and that neither is base.css or components.css, which this page cannot load. */
  var protoSheets = SRC.index.match(/<link rel="stylesheet"[^>]*>/g) || [];
  eq(protoSheets.length, 2, 'H32 two local stylesheets');
  ok(/prototype-tokens\.css/.test(protoSheets[0] || ''), 'H32a the token shim first');
  ok(/product-strategy-board\.css/.test(protoSheets[1] || ''), 'H32b the board sheet second');
  ok(protoSheets.every(function (t) { return !/^https?:|\/\//.test((t.match(/href="([^"]+)"/) || [])[1] || ''); }),
    'H32c and neither is remote');
  ok(SRC.index.indexOf('http://') < 0 && SRC.index.indexOf('https://') < 0,
    'H33 and no remote host of any kind');
}());

console.log('\n=== §I  THE DATA QUALITY LEDGER, AND WHAT A PRINTED PAGE SAYS ===');
(function () {
  var p = bootPage(null);
  if (p.thrown) { ok(false, 'I0 page boot (quality run)', String(p.thrown)); return; }
  var doc = p.dom.document;
  // go to the site that actually has the gaps, then to the Data Quality page
  var sel = doc.getElementById('fMarketplace');
  sel.value = 'Walmart';
  sel.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  var nav = doc.querySelectorAll('.navbtn').filter(function (b) {
    return b.textContent.indexOf('Data Quality') >= 0;
  });
  ok(nav.length === 1, 'I1 the Data Quality page is reachable from the sidebar');
  nav[0].click();

  ok(!!doc.getElementById('eligibilityCard'),
    'I2 and it carries the site-eligibility diagnostic');
  function stage(name) {
    var tr = doc.querySelectorAll('#eligibilityTable tbody tr[data-stage="' + name + '"]');
    return tr.length ? Number(tr[0].querySelectorAll('.num')[0].textContent) : null;
  }
  var u = board(site('US', 'Walmart')).universe;
  eq(stage('canonical'), u.counts.canonical, 'I3 the ledger shows the canonical count');
  eq(stage('on this site'), u.counts.after_site, 'I4 what membership kept');
  eq(stage('past the status gate'), u.counts.after_status, 'I5 what the status gate kept');
  eq(stage('eligible'), u.counts.eligible, 'I6 what the board shows');
  eq(stage('plottable'), u.counts.chartable, 'I7 and what can actually be plotted');
  ok(stage('eligible') > stage('plottable'),
    'I8 which are different numbers here, so "listed but not plotted" is visible');

  function bucket(name) {
    var r = doc.querySelectorAll('#dqBuckets .dqrow[data-bucket="' + name + '"]');
    return r.length ? Number(r[0].getAttribute('data-count')) : null;
  }
  eq(bucket('regional_details_missing'), 1,
    'I9 THE MISSING-MAPPING DIAGNOSTIC: the listing with no regional record is SEEN here');
  eq(bucket('category_source_missing'), 1, 'I10 and so is the one with no category');
  eq(bucket('status_missing_or_unrecognised'), 0,
    'I11 while a bucket with nothing in it still reports its zero');
  var text = doc.getElementById('eligibilityCard').textContent;
  ok(text.indexOf('KS6600') > 0,
    'I12 and the affected identity is named, not just counted');
  ok(text.indexOf('never renamed "Other"') > 0,
    'I13 with the rule that a blank category is not a bucket stated where it applies');

  // AND IT IS NOT ON THE PRICE CHART
  var m = board(site('US', 'Walmart'), { filters: { category: 'Kitchen Shears' } });
  eq(m.architecture.panels.length ? m.architecture.panels[0].plotted.length : 0, 0,
    'I14 the same listing is on no price axis');
}());

(function () {
  var p = bootPage(null);
  if (p.thrown) { ok(false, 'I15 page boot (print run)', String(p.thrown)); return; }
  var doc = p.dom.document;
  eq(doc.getElementById('scenarioPrintMark'), null,
    'I15 with no scenario there is no scenario mark to print');
  ok(String(doc.body.className).indexOf('has-scenario') < 0,
    'I16 and the page does not claim one');

  function fire(id, value) {
    var n = doc.getElementById(id);
    if (value !== undefined) n.value = value;
    n.dispatchEvent(new p.dom.Event('change', { bubbles: true }));
  }
  if (doc.getElementById('meetingToggle').getAttribute('aria-expanded') === 'false') {
    doc.getElementById('meetingToggle').click();
  }
  fire('scSeries', 'Spatula');
  fire('scField', 'proposed_scenario_price');
  fire('scAdjust', 'set');
  fire('scValue', '12.99');
  doc.getElementById('scApply').click();

  var mark = doc.getElementById('scenarioPrintMark');
  ok(!!mark, 'I17 a scenario puts an undismissable mark in the banner');
  eq(mark.parentNode.id, 'banner', 'I18 inside the banner, which prints on the first page');
  ok(mark.textContent.indexOf('SCENARIO') === 0, 'I19 and it opens with the word');
  ok(mark.textContent.indexOf('not prices the company charges') > 0,
    'I20 says what the numbers are not');
  ok(mark.textContent.indexOf('Kitchen Mama|US|Amazon') > 0, 'I21 names the site they belong to');
  ok(mark.textContent.indexOf('disappear when this page is reloaded') > 0,
    'I22 and that they do not survive a reload');
  ok(String(doc.body.className).indexOf('has-scenario') >= 0,
    'I23 and the page marks itself so the stylesheet can too');
  // the preview notice is untouched
  eq(doc.getElementById('notice').textContent,
    'Preview data — not connected to Operation System Database',
    'I24 while the original preview notice is unchanged and still first');

  // the stylesheet keeps both of them on paper
  var printBlock = /@media print \{([\s\S]*?)\n\}/.exec(SRC.css);
  ok(!!printBlock, 'I25 the stylesheet has a print block');
  ok(printBlock[1].indexOf('.badge-scenario') > 0,
    'I26 which explicitly keeps the scenario mark visible');
  /* P1-B8A — THESE TWO NOW MATCH THE RULE, NOT THE SELECTOR TEXT. They used to compare a whole
     selector list character for character, so scoping the stylesheet to `.psb-page` broke them while
     the behaviour they exist to protect was completely untouched. A probe that a prefix can break is
     a probe that will be "fixed" by whoever is in a hurry, by deleting it. What matters is that the
     scenario mark is forced ON for print and its controls are forced OFF; the prefix is not. */
  ok(/\.scenario,[^{]*\.badge-scenario\s*\{[^}]*display:\s*block\s*!important/.test(printBlock[1]),
    'I27 against its own hide-the-chrome rules');
  ok(/\.scenario-row,[^{]*\.scenario-resets\s*\{[^}]*display:\s*none\s*!important/.test(printBlock[1]),
    'I28 while the controls themselves do not print — a printed input is not an input');

  // reset, and the mark goes with it
  doc.getElementById('scResetAll').click();
  eq(doc.getElementById('scenarioPrintMark'), null, 'I29 reset removes the mark');
  ok(String(doc.body.className).indexOf('has-scenario') < 0, 'I30 and the body class with it');
}());

console.log('\n=== MUTANTS ===');
function withSel(mutate) {
  var ctx = vm.createContext({ console: { log: function () {}, error: function () {} } });
  vm.runInContext(SRC.contract, ctx);
  vm.runInContext(mutate(SRC.selectors), ctx);
  vm.runInContext(SRC.fixture, ctx);
  var F = vm.runInContext('PSB_PREVIEW', ctx);
  return { S: vm.runInContext('PSB_SELECTORS', ctx),
    canon: F.PreviewProductStrategyDataAdapter.loadCanonical().rows };
}
function swap(a, b) {
  return function (src) {
    var n = src.split(a).length - 1;
    if (n !== 1) throw new Error('mutant anchor ' + n + 'x: ' + a.slice(0, 60));
    return src.replace(a, b);
  };
}

mut('M1 membership stops consulting the country, so the US shows what the US does not sell',
  function () {
    // THE DEFECT THIS WHOLE ROUND EXISTS TO PREVENT.
    var m = withSel(swap(
      "    if (!isAll(site.country) && str(row.country) !== str(site.country)) return false;",
      '    if (false) return false;'));
    function frothers(h) {
      return h.S.getEligibleProductUniverse({ rows: h.canon,
        site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' } })
        .rows.filter(function (r) { return r.category === 'Milk Frother'; }).length;
    }
    return frothers(P) === 0 && frothers(m) > 0;
  });

mut('M2 the category menu is built before membership, so DE is offered what DE does not sell',
  function () {
    var m = withSel(swap('  S.deriveCategoryOptions = function (universe, otherFilters) {\n'
      + '    var rows = universe.rows || [];',
      '  S.deriveCategoryOptions = function (universe, otherFilters) {\n'
      + '    var rows = (universe.allRowsForTest || universe.rows) || [];'));
    // the mutant needs the pre-membership set to be reachable; prove the CLEAN one is not
    var clean = P.S.deriveCategoryOptions(P.S.getEligibleProductUniverse({ rows: P.canon,
      site: { company: 'Kitchen Mama', country: 'DE', marketplace: 'Amazon' } }), {});
    var u = m.S.getEligibleProductUniverse({ rows: m.canon,
      site: { company: 'Kitchen Mama', country: 'DE', marketplace: 'Amazon' } });
    u.allRowsForTest = m.canon;
    var bad = m.S.deriveCategoryOptions(u, {});
    return clean.options.length === 2 && bad.options.length > clean.options.length;
  });

mut('M3 a missing regional record removes the listing instead of reporting it', function () {
  var m = withSel(swap('      var chartRefusals = S.chartRefusalsFor(row);',
    "      if (regional === 'REGIONAL_DETAILS_MISSING') return;\n"
      + '      var chartRefusals = S.chartRefusalsFor(row);'));
  function shears(h) {
    return h.S.getEligibleProductUniverse({ rows: h.canon,
      site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart' } })
      .rows.filter(function (r) { return r.category === 'Kitchen Shears'; }).length;
  }
  // Clean: kept AND reported AND off the chart. Mutant: gone, which reads as "not sold here".
  return shears(P) === 1 && shears(m) === 0;
});

mut('M4 a missing regional record is plotted anyway, so an undescribed listing gets a coordinate',
  function () {
    // AIMED AT THE AXIS, NOT AT THE LEDGER. The first version of this asserted on `universe.chartRows`
    // — a list the pipeline published and nothing downstream read, so the real chart drew the row while
    // the assertion passed. §I14 found that; this now measures the plotted nodes themselves.
    var m = withSel(swap(
      "    if (S.regionalStateOf(row) === 'REGIONAL_DETAILS_MISSING') out.push('REGIONAL_DETAILS_MISSING');",
      '    if (false) out.push(0);'));
    function plotted(h) {
      var mo = h.S.deriveBoardModel({ rows: h.canon,
        selection: { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart' },
        filters: { category: 'Kitchen Shears' } });
      return mo.architecture.panels.length ? mo.architecture.panels[0].plotted.length : 0;
    }
    function listed(h) {
      var mo = h.S.deriveBoardModel({ rows: h.canon,
        selection: { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart' },
        filters: { category: 'Kitchen Shears' } });
      return mo.rows.length;
    }
    // Clean: listed, not plotted. Mutant: plotted. Both keep the row, so this cannot pass by deletion.
    return listed(P) === 1 && plotted(P) === 0 && listed(m) === 1 && plotted(m) === 1;
  });

mut('M5 an unreadable site status defaults to sellable', function () {
  var m = withSel(swap(
    "    if (raw === '') return 'SITE_STATUS_MISSING';",
    "    if (raw === '') return 'PERMITTED';"));
  var row = JSON.parse(JSON.stringify(P.canon[0]));
  row.source_status = '';
  function eligible(h) {
    return h.S.getEligibleProductUniverse({ rows: [row],
      site: { company: row.company, country: row.country, marketplace: row.marketplace } })
      .counts.eligible;
  }
  return eligible(P) === 0 && eligible(m) === 1;
});

mut('M6 the category menu folds case, so two business categories behave as one', function () {
  var m = withSel(swap("      var v = str(r[key]);\n      if (v === '') {",
    "      var v = str(r[key]).toLowerCase();\n      if (v === '') {"));
  function opts(h) {
    var u = h.S.getEligibleProductUniverse({ rows: h.canon,
      site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart' } });
    return h.S.deriveCategoryOptions(u, {}).options.map(function (o) { return o.value; });
  }
  var clean = opts(P), bad = opts(m);
  return clean.indexOf('Silicone Spatula') >= 0 && clean.indexOf('silicone spatula') >= 0
    && bad.indexOf('Silicone Spatula') < 0;
});

mut('M7 a blank category becomes a bucket instead of a reported gap', function () {
  // AIMED AT THE OUTCOME, NOT THE FIRST LINE OF THE BRANCH. The first attempt assigned 'Other' above
  // the branch's own `return`, so the bucket was never reachable and the mutant went green while the
  // rule it was meant to test was untouched. It has to remove the return.
  var m = withSel(swap("        blank++;\n        blankIds.push(str(r.identity));\n        return;\n      }",
    "        blank++;\n        blankIds.push(str(r.identity));\n        v = 'Other';\n      }"));
  function opts(h) {
    var u = h.S.getEligibleProductUniverse({ rows: h.canon,
      site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart' } });
    return h.S.deriveCategoryOptions(u, {}).options.map(function (o) { return o.value; });
  }
  return opts(P).indexOf('Other') < 0 && opts(m).indexOf('Other') >= 0;
});

mut('M8 the menu is ordered by whatever the source happened to return', function () {
  var m = withSel(swap('    order.sort();\n    return {\n      options:',
    '    return {\n      options:'));
  function opts(h) {
    var u = h.S.getEligibleProductUniverse({ rows: h.canon,
      site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Walmart' } });
    return h.S.deriveCategoryOptions(u, {}).options.map(function (o) { return o.value; });
  }
  var clean = opts(P), bad = opts(m);
  return JSON.stringify(clean) === JSON.stringify(clean.slice().sort())
    && JSON.stringify(bad) !== JSON.stringify(bad.slice().sort());
});

mut('M9 a cap is introduced, so a site with many categories silently shows some of them',
  function () {
    var m = withSel(swap('      options: order.map(function (v) { return seen[v]; }),',
      '      options: order.slice(0, 3).map(function (v) { return seen[v]; }),'));
    function n(h) {
      var u = h.S.getEligibleProductUniverse({ rows: h.canon,
        site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' } });
      return h.S.deriveCategoryOptions(u, {}).options.length;
    }
    return n(P) === 4 && n(m) === 3;
  });

mut('M10 a series override becomes one number for every rung, flattening the ladder', function () {
  // THE FIRST IMPLEMENTATION OF THIS FEATURE, and it did not error — it deleted the structure the board
  // exists to show. Aimed at the multiplicand: a PERCENT that is a percentage of a CONSTANT rather than
  // of each row's own price gives every rung the same answer. (Forcing the ABSOLUTE branch instead was
  // the first attempt and it survived: S.cents('-15') is negative, so the override was dropped
  // altogether and the ladder stayed intact for the wrong reason.)
  var m = withSel(swap('      out = Math.round(canonicalC * (1 + pct / 100));',
    '      out = Math.round(1000 * (1 + pct / 100));'));
  function ladder(h) {
    var o = {};
    o['Kitchen Mama|US|Amazon'] = { Spatula: { everyday_scenario_price:
      { mode: 'PERCENT', value: '-15' } } };
    return h.S.deriveBoardModel({ rows: h.canon,
      selection: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' },
      filters: { category: 'Silicone Spatula' }, overrides: o, thresholdC: 800 })
      .architecture.panels[0].plotted.map(function (n) { return n._regular_c; });
  }
  function isLadder(a) {
    return a.length > 1 && a.every(function (v, i) { return i === 0 || v > a[i - 1]; });
  }
  return isLadder(ladder(P)) && !isLadder(ladder(m));
});

mut('M11 the scenario key drops the site, so one number reprices two currencies', function () {
  var m = withSel(swap("    return s.complete ? s.key : null;",
    "    return s.complete ? 'ANY_SITE' : 'ANY_SITE';"));
  function deTouched(h) {
    var o = h.S.setScenarioOverride({}, {
      site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' },
      series: 'Can Opener', field: 'proposed_scenario_price', value: '9.99' });
    return h.S.deriveBoardModel({ rows: h.canon,
      selection: { company: 'Kitchen Mama', country: 'DE', marketplace: 'Amazon' },
      filters: { category: 'Electric Can Opener' }, overrides: o })
      .architecture.scenario_nodes.length;
  }
  return deTouched(P) === 0 && deTouched(m) > 0;
});

mut('M12 the canonical price is overwritten, so a reload has nothing to restore to', function () {
  var m = withSel(swap('    o._canonical = {\n      regular_c: canonicalRegular,',
    '    o._canonical = {\n      regular_c: o._regular_c,'));
  function kept(h) {
    var o = {};
    o['Kitchen Mama|US|Amazon'] = { Spatula: { everyday_scenario_price:
      { mode: 'PERCENT', value: '-50' } } };
    var n = h.S.deriveBoardModel({ rows: h.canon,
      selection: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' },
      filters: { category: 'Silicone Spatula' }, overrides: o })
      .architecture.panels[0].plotted[0];
    return n._canonical.regular_c !== n._regular_c;
  }
  return kept(P) === true && kept(m) === false;
});

mut('M13 an unrecognised reset scope clears everything', function () {
  var m = withSel(swap("    if (scope === 'all') return {};",
    "    if (scope !== 'series' && scope !== 'site') return {};"));
  function typo(h) {
    var o = h.S.setScenarioOverride({}, {
      site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' },
      series: 'Spatula', field: 'proposed_scenario_price', value: '9.99' });
    return h.S.scenarioCount(h.S.resetScenarioOverrides(o, { scope: 'evrything' }));
  }
  return typo(P) === 1 && typo(m) === 0;
});

mut('M14 an aggregate scope is allowed to hold a scenario', function () {
  var m = withSel(swap('      scenario_permitted: complete,',
    '      scenario_permitted: true,'));
  function permitted(h) {
    return h.S.deriveSiteIdentity({ company: 'Kitchen Mama', country: 'ALL', marketplace: 'ALL' })
      .scenario_permitted;
  }
  return permitted(P) === false && permitted(m) === true;
});

mut('M15 a percentage of a non-existent price becomes zero rather than unanswerable', function () {
  var m = withSel(swap('    if (canonicalC === null || canonicalC === undefined) return null;',
    '    if (canonicalC === null || canonicalC === undefined) canonicalC = 0;'));
  return P.S.resolveScenarioValue({ mode: 'DELTA', value: '5.00' }, null) === null
    && m.S.resolveScenarioValue({ mode: 'DELTA', value: '5.00' }, null) === 500;
});

mut('M16 setScenarioOverride mutates the object it was handed', function () {
  var m = withSel(swap('  S.setScenarioOverride = function (overrides, spec) {\n'
    + '    spec = spec || {};\n    var next = cloneOverrides(overrides);',
    '  S.setScenarioOverride = function (overrides, spec) {\n'
    + '    spec = spec || {};\n    var next = overrides || {};'));
  function immutable(h) {
    var before = {};
    h.S.setScenarioOverride(before, {
      site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' },
      series: 'Spatula', field: 'proposed_scenario_price', value: '9.99' });
    return Object.keys(before).length === 0;
  }
  return immutable(P) === true && immutable(m) === false;
});

mut('M17 the site status is read from the field the LIVE response uses for something else',
  function () {
    var m = withSel(swap("  S.STATUS_FIELD = 'source_status';",
      "  S.STATUS_FIELD = 'marketplace_sku_status';"));
    function eligible(h) {
      return h.S.getEligibleProductUniverse({ rows: h.canon,
        site: { company: 'Kitchen Mama', country: 'US', marketplace: 'Amazon' } }).counts.eligible;
    }
    // The prototype contract carries the value under source_status; reading the other name finds
    // nothing on every row, and a gate that excludes everything is as wrong as one that excludes
    // nothing — the difference is that this one looks like a site with no products.
    return eligible(P) > 0 && eligible(m) === 0;
  });

console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL')
  + ' — passed ' + pass + ', failed ' + fail
  + ', mutants caught ' + mutCaught + ', survived ' + mutSurvived);
if (fail !== 0) process.exit(1);
