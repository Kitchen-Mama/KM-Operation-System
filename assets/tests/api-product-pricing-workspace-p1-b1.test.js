// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B1
// The site-scoped bounded read owner: productPricing.workspace.get (72_).
//
// THE ONE THING THIS ACTION DECIDES is which SKUs exist on a site, and the whole suite is built around the
// ways that decision can be got wrong: inferred from the master table, widened by a client, leaked across a
// company that shares a marketplace name, or answered with another site's regional row. Every one of those
// is a test here and a mutant below.
//
// Run: node assets/tests/api-product-pricing-workspace-p1-b1.test.js
// NOTE: no 'use strict' — the .gs source is eval'd into module scope.

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
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'); }

/** Comments AND string literals out. A file's own disclaimers name every API it promises not to use, so a
 *  scan that counts them is measuring the promise instead of the code. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  src = src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  return src;
}
function extractFn(src, name) {
  var sig = 'function ' + name + '(';
  var i = src.indexOf(sig);
  if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) {
    var ch = src[i];
    if (ch === '{') { depth++; started = true; }
    else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); }
  }
  throw new Error('unbalanced fn: ' + name);
}

var GS72 = read('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var GS59 = read('assets/specs/active/apps-script/59_api_v1_sku_details_workspace.gs');
var GS00 = read('assets/specs/active/apps-script/00_config.gs');
var GS01 = read('assets/specs/active/apps-script/01_router.gs');
var GS63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var ACC = read('assets/js/api/km-product-pricing-workspace.js');
var INDEX = read('index.html');
var BARE72 = bare(GS72), BARE_ACC = bare(ACC);

// ===================================================================================================
// FIXTURE — one site, plus every neighbour that must NOT leak into it.
// ===================================================================================================
var SCOPE = { company: 'KM', country: 'US', marketplace: 'Amazon' };

var TABLES = {
  marketplace_skus: [
    { marketplace_sku_id: 'M1', sku: 'CO1100-R',  company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-CO1100-R', marketplace_sku_status: 'active',       currency: 'USD' },
    { marketplace_sku_id: 'M2', sku: 'CO1150-R',  company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-CO1150-R', marketplace_sku_status: 'phasing_out',  currency: 'USD' },
    { marketplace_sku_id: 'M3', sku: 'CO2600-B',  company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-CO2600-B', marketplace_sku_status: 'inactive',     currency: 'USD' },
    { marketplace_sku_id: 'M4', sku: 'CO5600-RB', company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-CO5600',   marketplace_sku_status: 'discontinued', currency: 'USD' },
    { marketplace_sku_id: 'M5', sku: 'SP3120-R',  company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-SP3120-R', marketplace_sku_status: 'active',       currency: 'USD' },
    { marketplace_sku_id: 'M6', sku: 'MO5600-R',  company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-MO5600-R', marketplace_sku_status: 'active',       currency: 'EUR' },
    { marketplace_sku_id: 'M7', sku: 'DUP-A',     company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-DUP-A',    marketplace_sku_status: 'active',       currency: 'USD' },
    { marketplace_sku_id: 'M8', sku: 'TWOPRICE',  company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-TWOPRICE', marketplace_sku_status: 'active',       currency: 'USD' },
    // THE NEIGHBOURS. Same master SKU, different company / country / marketplace — none may appear.
    { marketplace_sku_id: 'X1', sku: 'CO1100-R',  company: 'ResUS', country: 'US', marketplace: 'Amazon',  site_sku: 'RES-CO1100-R', marketplace_sku_status: 'active', currency: 'USD' },
    { marketplace_sku_id: 'X2', sku: 'CO1100-R',  company: 'KM',    country: 'DE', marketplace: 'Amazon',  site_sku: 'KM-DE-CO1100', marketplace_sku_status: 'active', currency: 'EUR' },
    { marketplace_sku_id: 'X3', sku: 'CO1100-R',  company: 'KM',    country: 'US', marketplace: 'Walmart', site_sku: 'KM-WM-CO1100', marketplace_sku_status: 'active', currency: 'USD' }
  ],
  sku_details: [
    { sku: 'CO1100-R',  product_name: 'Electric Can Opener 1100', category: 'Electric Can Opener', series: 'CO1100', lifecycle: 'Running in the Market', image_url: 'assets/img/products/CO1100-R.jpg' },
    { sku: 'CO1150-R',  product_name: 'Electric Can Opener 1150', category: 'Electric Can Opener', series: 'CO1150', lifecycle: 'Phasing Out',           image_url: 'assets/img/products/CO1150-R.jpg' },
    { sku: 'CO2600-B',  product_name: 'Electric Can Opener 2600', category: 'Electric Can Opener', series: 'CO2600', lifecycle: 'Closure',               image_url: '' },
    { sku: 'CO5600-RB', product_name: 'Electric Can Opener 5600', category: 'Electric Can Opener', series: 'CO5600', lifecycle: 'Closure',               image_url: '' },
    { sku: 'SP3120-R',  product_name: 'Silicone Spatula 3120',    category: 'Silicone Spatula',    series: 'SP3120', lifecycle: 'Running in the Market', image_url: '' },
    { sku: 'MO5600-R',  product_name: 'Manual Can Opener 5600',   category: 'Manual Can Opener',   series: '',       lifecycle: 'Running in the Market', image_url: '' },
    { sku: 'DUP-A',     product_name: 'Duplicate Regional',       category: 'Electric Can Opener', series: 'DUP',    lifecycle: 'Running in the Market', image_url: '' },
    { sku: 'TWOPRICE',  product_name: 'Two Pricing Rows',         category: 'Electric Can Opener', series: 'TWO',    lifecycle: 'Running in the Market', image_url: '' },
    // A MASTER SKU WITH NO SITE ROW ANYWHERE. It exists, it has a category, and it must never be a row.
    { sku: 'GHOST-1',   product_name: 'Never Sold Anywhere',      category: 'Electric Can Opener', series: 'CO1100', lifecycle: 'Upcoming SKU',          image_url: 'assets/img/products/GHOST.jpg' }
  ],
  sku_regional_details: [
    { regional_detail_id: 'R1', sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-CO1100-R', marketplace_product_id: 'B0001', product_url: 'https://x/1', language: 'en' },
    // CO1150-R has a regional row for GERMANY only. It must be REPORTED and never used here.
    { regional_detail_id: 'R2', sku: 'CO1150-R', company: 'KM', country: 'DE', marketplace: 'Amazon', site_sku: 'KM-DE-CO1150', marketplace_product_id: 'B0002', product_url: 'https://x/2', language: 'de' },
    { regional_detail_id: 'R3', sku: 'DUP-A',    company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-DUP-A', marketplace_product_id: 'B0003' },
    { regional_detail_id: 'R4', sku: 'DUP-A',    company: 'KM', country: 'US', marketplace: 'Amazon', site_sku: 'KM-DUP-A-2', marketplace_product_id: 'B0004' }
  ],
  pricing_list: [
    // price_status 'draft' on the FIRST row on purpose: this round filters on price_status not at all.
    { pricing_id: 'P1', marketplace_sku_id: 'M1', sku: 'CO1100-R',  country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 32.99, minimum_price: 24.99, msrp: 39.99, price_status: 'draft',  price_source: 'manual_override' },
    { pricing_id: 'P2', marketplace_sku_id: 'M2', sku: 'CO1150-R',  country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 29.99, minimum_price: 22.99, msrp: 34.99, price_status: 'active', price_source: 'import' },
    { pricing_id: 'P3', marketplace_sku_id: 'M3', sku: 'CO2600-B',  country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 27.99, minimum_price: 20.99, msrp: 32.99, price_status: 'active', price_source: 'import' },
    { pricing_id: 'P4', marketplace_sku_id: 'M4', sku: 'CO5600-RB', country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 24.99, minimum_price: 18.99, msrp: 29.99, price_status: 'active', price_source: 'import' },
    { pricing_id: 'P6', marketplace_sku_id: 'M6', sku: 'MO5600-R',  country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 21.99, minimum_price: 16.99, msrp: 24.99, price_status: 'active', price_source: 'import' },
    { pricing_id: 'P7', marketplace_sku_id: 'M7', sku: 'DUP-A',     country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 19.99, minimum_price: 14.99, msrp: 22.99, price_status: 'active', price_source: 'import' },
    { pricing_id: 'P8a', marketplace_sku_id: 'M8', sku: 'TWOPRICE', country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 11.11, minimum_price: 9.99,  msrp: 12.99, price_status: 'active', price_source: 'import' },
    { pricing_id: 'P8b', marketplace_sku_id: 'M8', sku: 'TWOPRICE', country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 88.88, minimum_price: 9.99,  msrp: 99.99, price_status: 'active', price_source: 'import' },
    // A NEIGHBOUR'S PRICE, on the same (country, marketplace, sku) as M1. A join that used those three
    // columns instead of the id could return THIS row for KM's CO1100-R.
    { pricing_id: 'PX1', marketplace_sku_id: 'X1', sku: 'CO1100-R', country: 'US', marketplace: 'Amazon', currency: 'USD', regular_price: 111.11, minimum_price: 99.99, msrp: 129.99, price_status: 'active', price_source: 'import' }
  ],
  campaigns: [
    { campaign_id: 'C1', company: 'KM',    marketplace_id: 'MK1', campaign_name: 'Prime Day', country: 'US', marketplace: 'Amazon', status: 'active',    start_date: '2026-07-01', end_date: '2026-07-03' },
    { campaign_id: 'C2', company: 'KM',    marketplace_id: 'MK1', campaign_name: 'Back to School', country: 'US', marketplace: 'Amazon', status: 'planned', start_date: '2026-08-01', end_date: '2026-08-15' },
    { campaign_id: 'C3', company: 'ResUS', marketplace_id: 'MK2', campaign_name: 'Res Sale', country: 'US', marketplace: 'Amazon', status: 'active',    start_date: '2026-07-01', end_date: '2026-07-03' }
  ],
  campaign_sku_lines: [
    { campaign_sku_line_id: 'L1', campaign_id: 'C1', marketplace_sku_id: 'M1', sku: 'CO1100-R', promo_price: 24.99, regular_price: 32.99, price_units: 'USD', discount_percent: 24, line_status: 'confirmed' },
    { campaign_sku_line_id: 'L2', campaign_id: 'C2', marketplace_sku_id: 'M1', sku: 'CO1100-R', promo_price: 27.99, regular_price: 32.99, price_units: 'USD', discount_percent: 15, line_status: 'planned' },
    { campaign_sku_line_id: 'L3', campaign_id: 'C1', marketplace_sku_id: 'M2', sku: 'CO1150-R', promo_price: 22.99, regular_price: 29.99, price_units: 'USD', discount_percent: 23, line_status: 'confirmed' },
    // OUT OF SCOPE — a ResUS campaign touching a KM-looking SKU. Dropped, and counted.
    { campaign_sku_line_id: 'L4', campaign_id: 'C3', marketplace_sku_id: 'X1', sku: 'CO1100-R', promo_price: 9.99,  regular_price: 111.11, price_units: 'USD', discount_percent: 91, line_status: 'confirmed' },
    // ORPHAN — names a campaign that does not exist. Counted, never guessed at.
    { campaign_sku_line_id: 'L5', campaign_id: 'GONE', marketplace_sku_id: 'M5', sku: 'SP3120-R', promo_price: 1.00, regular_price: 2.00, price_units: 'USD', line_status: 'confirmed' }
  ]
};

// ===================================================================================================
// HARNESS — the handler runs inside a vm with an injectable io that COUNTS opens and reads. Nothing in
// the sandbox can write: there is no SpreadsheetApp, no LockService and no writer symbol at all.
// ===================================================================================================
var IO_SRC = [
  'var __LOG = { opens: 0, reads: [] };',
  'var __OPTS = {};',
  'var __IO = {',
  '  now: function () { return 1000; },',
  '  nextSeq: function () { return 7; },',
  '  flagEnabled: function () { return __OPTS.flag === true; },',
  '  openTarget: function () {',
  '    __LOG.opens++;',
  '    if (__OPTS.throwOpen) { var e = new Error("WRONG_SPREADSHEET_TARGET");',
  '      e.safetyToken = "WRONG_SPREADSHEET_TARGET"; throw e; }',
  '    return { __ss: true };',
  '  },',
  '  readTable: function (ss, name, cols) {',
  '    __LOG.reads.push(name);',
  '    var T = __OPTS.tables || __TABLES;',
  '    if (!Object.prototype.hasOwnProperty.call(T, name)) {',
  '      var e = new Error("SCHEMA_SHEET_MISSING:" + name);',
  '      e.safetyToken = "SCHEMA_SHEET_MISSING"; throw e; }',
  '    return T[name];',
  '  }',
  '};'
].join('\n');

function ctxOf(src) {
  // ONLY `console`. vm.createContext already supplies a COMPLETE set of standard globals, and passing the
  // host's would cross realms: `[] instanceof Array` would then compare a context array against the HOST
  // constructor and answer false — breaking the handler's own array checks inside the harness only, which
  // is the worst kind of test failure because the code under test is correct.
  var ctx = vm.createContext({ console: console });
  vm.runInContext('var __TABLES = ' + JSON.stringify(TABLES) + ';', ctx);
  vm.runInContext(IO_SRC, ctx);
  vm.runInContext(src || GS72, ctx);
  return ctx;
}
var CTX = ctxOf();

function run(payload, opts, ctx) {
  ctx = ctx || CTX;
  var o = { flag: true };
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  vm.runInContext('__LOG = { opens: 0, reads: [] }; __OPTS = ' + JSON.stringify(o) + ';', ctx);
  var body = { requestId: 'REQ-T000001', payload: payload || {} };
  var env = vm.runInContext('JSON.parse(JSON.stringify(handleProductPricingWorkspaceGet_('
    + JSON.stringify(body) + ', __IO)))', ctx);
  env.__log = vm.runInContext('JSON.parse(JSON.stringify(__LOG))', ctx);
  return env;
}
function rowsOf(env) { return env.data.normalizedRows; }
function idsOf(env) { return rowsOf(env).map(function (r) { return r.marketplace_sku_id; }); }
function rowOf(env, id) {
  var hit = null;
  rowsOf(env).forEach(function (r) { if (r.marketplace_sku_id === id) hit = r; });
  return hit;
}
function codes(list) { return (list || []).map(function (r) { return r.code; }); }
function full(over) {
  var p = { scope: { company: 'KM', country: 'US', marketplace: 'Amazon' } };
  Object.keys(over || {}).forEach(function (k) { p[k] = over[k]; });
  return p;
}

console.log('=== PRODUCT-STRATEGY-P1-B1 — productPricing.workspace.get ===\n');

// ---- 1 THE FLAG IS BEFORE THE DOOR ---------------------------------------------------------------
var T1 = run(full(), { flag: false });
eq(codes(T1.data.refusals), ['FEATURE_DISABLED'], '1  flag=false refuses with FEATURE_DISABLED');
eq([T1.__log.opens, T1.__log.reads.length], [0, 0],
  '1a and PROVEN: the spreadsheet was never opened and no table was read');
eq(T1.data.normalizedRows.length, 0, '1b with zero rows');
eq(T1.data.analysis_permitted, false, '1c and analysis_permitted false, so success cannot read as usable');
eq(T1.data.counts.siteSkuCount, null,
  '1d counts are NULL, not 0 — a count nobody took must stay distinguishable from a real empty site');
eq(T1.meta.db_writes, 0, '1e meta declares zero writes');

// ---- 2..6 SCOPE IS REQUIRED, WHOLE, AND COSTS NOTHING TO REFUSE ----------------------------------
[['company', { country: 'US', marketplace: 'Amazon' }],
 ['country', { company: 'KM', marketplace: 'Amazon' }],
 ['marketplace', { company: 'KM', country: 'US' }]].forEach(function (c, i) {
  var r = run({ scope: c[1] });
  eq(codes(r.data.refusals), ['SCOPE_INCOMPLETE'], '2.' + (i + 1) + ' scope missing ' + c[0] + ' → SCOPE_INCOMPLETE');
  eq([r.__log.opens, r.__log.reads.length], [0, 0],
    '2.' + (i + 1) + 'a and it is refused before the spreadsheet is opened');
  eq(r.data.refusals[0].subject, [c[0]], '2.' + (i + 1) + 'b naming the part that is missing');
});
var T5 = run({});
eq(codes(T5.data.refusals), ['SCOPE_INCOMPLETE'], '5  an empty scope is refused');
eq(T5.data.normalizedRows.length, 0, '5a and does NOT return the full universe');
eq(T5.data.refusals[0].subject, ['company', 'country', 'marketplace'], '5b naming all three');
var T5b = run({ scope: { company: '  ', country: '\t', marketplace: '' } });
eq(codes(T5b.data.refusals), ['SCOPE_INCOMPLETE'], '5c whitespace is not a scope');

var OK1 = run(full());
eq(OK1.data.refusals, [], '6  a complete scope is answered', OK1.data.refusals);
eq(OK1.__log.reads, ['marketplace_skus', 'sku_details', 'sku_regional_details', 'pricing_list'],
  '6a reading exactly the four tables the default include asks for — campaigns is opt-in');
eq(OK1.__log.opens, 1, '6b opening the target once');

// ---- 7..8 MEMBERSHIP ------------------------------------------------------------------------------
eq(idsOf(OK1), ['M1', 'M2', 'M5', 'M6', 'M7', 'M8'],
  '7  only in-scope, on-sale marketplace_sku_ids become rows');
ok(idsOf(OK1).indexOf('X1') === -1 && idsOf(OK1).indexOf('X2') === -1 && idsOf(OK1).indexOf('X3') === -1,
  '7a no neighbouring company, country or marketplace leaks in');
ok(JSON.stringify(rowsOf(OK1)).indexOf('GHOST-1') === -1,
  '7b a master SKU with no marketplace_skus row NEVER appears, however complete its sku_details row');
eq(OK1.data.membership.authority, 'marketplace_skus', '7c membership names its authority');
eq(OK1.data.membership.resolved_server_side, true, '7d and says it was resolved server-side');
eq(OK1.data.membership.inferred_from, [], '7e inferring membership from nothing at all');
// A CLIENT CANNOT WIDEN IT: the only membership input is the scope, and the scope narrows.
var T8 = run(full({ filters: { category: 'Electric Can Opener' } }));
ok(idsOf(T8).length < idsOf(OK1).length && idsOf(T8).every(function (id) {
  return idsOf(OK1).indexOf(id) !== -1; }),
  '8  a filter can only ever narrow the membership set, never widen it');

// ---- 9..15 THE FOUR STATUSES ----------------------------------------------------------------------
eq(rowOf(OK1, 'M1').marketplace_sku_status, 'active', '9  active is included by default');
eq(rowOf(OK1, 'M2').marketplace_sku_status, 'phasing_out',
  '10 phasing_out is included by default AND keeps its exact status string');
eq(rowOf(OK1, 'M3'), null, '11 inactive is excluded by default');
eq(rowOf(OK1, 'M4'), null, '12 discontinued is excluded by default');
var T13 = run(full({ filters: { include_inactive: true } }));
eq(idsOf(T13), ['M1', 'M2', 'M3', 'M4', 'M5', 'M6', 'M7', 'M8'],
  '13 include_inactive=true admits inactive and discontinued');
eq([rowOf(T13, 'M3').marketplace_sku_status, rowOf(T13, 'M4').marketplace_sku_status],
  ['inactive', 'discontinued'], '13a each keeping its own exact value — never squashed into a boolean');
eq([T13.data.counts.activeSiteSkuCount, T13.data.counts.phasingOutSiteSkuCount,
  T13.data.counts.inactiveSiteSkuCount, T13.data.counts.discontinuedSiteSkuCount], [5, 1, 1, 1],
  '13b and the four statuses are counted apart');
var T14 = run(full({ filters: { statuses: ['active', 'running'] } }));
eq(codes(T14.data.refusals), ['UNKNOWN_STATUS_VALUE'],
  '14 an unknown status FAILS CLOSED — there is no `running` site status');
eq([T14.__log.opens, T14.__log.reads.length], [0, 0], '14a before any read');
eq(T14.data.refusals[0].subject, ['running'], '14b naming the value it does not know');
eq(rowOf(OK1, 'M2').lifecycle, 'Phasing Out',
  '15 lifecycle is carried for display …');
eq(OK1.data.membership.lifecycle_participates, false,
  '15a … and declared NOT to participate in membership');
ok(rowOf(OK1, 'M1').lifecycle === 'Running in the Market' && rowOf(OK1, 'M1').marketplace_sku_status === 'active',
  '15b the master lifecycle and the site status are two different answers on one row');

// ---- 16..19 REGIONAL, ON THE FOUR-PART IDENTITY ---------------------------------------------------
eq(rowOf(OK1, 'M1').regional.regional_detail_id, 'R1',
  '16 regional joins on sku + company + country + marketplace');
eq(rowOf(OK1, 'M1').provenance.regional,
  'sku_regional_details by sku + company + country + marketplace', '16a and says so');
var m2 = rowOf(OK1, 'M2');
eq(m2.regional, null, '17 a SKU with no regional row for THIS site keeps null …');
ok(m2.source_status.indexOf('REGIONAL_DETAILS_MISSING') !== -1, '17a … is flagged …');
ok(idsOf(OK1).indexOf('M2') !== -1, '17b … and is NOT dropped from the site');
eq(OK1.data.counts.regionalMissingCount, 4,
  '17c and the misses are counted — M7 is AMBIGUOUS, which is a different answer from MISSING');
eq(codes(m2.findings), ['CONTRACT_MISMATCH'],
  '18 its German regional row is REPORTED as a contract mismatch …');
eq(m2.findings[0].evidence, [{ company: 'KM', country: 'DE', marketplace: 'Amazon' }],
  '18a … with the site it actually belongs to …');
eq(m2.regional, null, '18b … and is never used as a fallback');
var m7 = rowOf(OK1, 'M7');
eq(codes(m7.findings), ['AMBIGUOUS_SITE_IDENTITY'],
  '19 two regional rows on one exact site identity → AMBIGUOUS_SITE_IDENTITY');
eq(m7.regional, null, '19a and no first-match is taken');
eq(m7.analysable, false, '19b the row is kept out of the analysis set');

// ---- 20..24 PRICING -------------------------------------------------------------------------------
eq(rowOf(OK1, 'M1').regular_price, 32.99,
  '20 pricing joins on marketplace_sku_id — NOT the neighbour row at 111.11 that shares country+marketplace+sku');
eq(rowOf(OK1, 'M1').provenance.pricing, 'pricing_list by marketplace_sku_id', '20a and says so');
var m5 = rowOf(OK1, 'M5');
eq([m5.regular_price, m5.minimum_price, m5.msrp, m5.currency], [null, null, null, null],
  '21 a SKU with no pricing row gets nulls, never zeros');
eq(m5.analysable, false, '21a and cannot be plotted');
ok(m5.source_status.indexOf('PRICING_SOURCE_MISSING') !== -1, '21b flagged as the source being missing');
ok(idsOf(OK1).indexOf('M5') !== -1, '21c while remaining a site SKU');
eq([OK1.data.counts.siteSkuCount, OK1.data.counts.pricingMissingCount,
  OK1.data.counts.analysableSiteSkuCount], [6, 1, 3],
  '21d siteSkuCount includes it and analysableSiteSkuCount does not — the two disagree visibly');
eq(rowOf(OK1, 'M6').currency, 'USD',
  '22 pricing_list.currency is the authority (marketplace_skus says EUR)');
eq(codes(rowOf(OK1, 'M6').findings), ['CURRENCY_SOURCE_CONFLICT'],
  '23 and the disagreement is a visible finding, not a silent overwrite');
eq(rowOf(OK1, 'M6').findings[0].evidence, { pricing_list: 'USD', marketplace_skus: 'EUR' },
  '23a carrying both values');
eq(OK1.data.provenance.fx_conversion, false, '23b with no FX conversion anywhere');
eq(rowOf(OK1, 'M1').provenance.price_status_raw, 'draft',
  '24 price_status is carried through …');
ok(rowOf(OK1, 'M1').analysable === true,
  '24a … and filters nothing: a `draft` row with a valid price is still analysable');
eq(OK1.data.provenance.price_status_filtering, false, '24b declared as not filtered on');
var m8 = rowOf(OK1, 'M8');
eq(codes(m8.findings), ['AMBIGUOUS_PRICING_SOURCE'],
  '24c two pricing rows for one id → AMBIGUOUS_PRICING_SOURCE');
eq([m8.regular_price, m8.analysable], [null, false],
  '24d and neither the last row nor the highest price is used');

// ---- 25..28 CAMPAIGNS ------------------------------------------------------------------------------
eq(OK1.__log.reads.indexOf('campaigns'), -1, '25 include.campaigns defaults false → campaigns not read');
eq(OK1.__log.reads.indexOf('campaign_sku_lines'), -1, '25a nor campaign_sku_lines');
eq(rowOf(OK1, 'M1').campaigns, [], '25b and the array is empty rather than invented');
var T26 = run(full({ include: { campaigns: true } }));
eq(T26.__log.reads, ['marketplace_skus', 'sku_details', 'sku_regional_details', 'pricing_list',
  'campaign_sku_lines', 'campaigns'], '26 include.campaigns=true reads exactly the two extra tables');
var c1 = rowOf(T26, 'M1').campaigns;
eq(c1.length, 2, '28 a SKU in two campaigns returns BOTH — no arbitrary winner');
eq(c1.map(function (c) { return c.campaign_id; }), ['C1', 'C2'], '28a bounded and identified');
eq([c1[0].promo_price, c1[0].start_date, c1[0].end_date], [24.99, '2026-07-01', '2026-07-03'],
  '28b the official deal price and window come from the persisted columns');
// Asserted on the campaign arrays themselves: 'C3' also turns up inside the scope-identity hash, and a
// substring search over the whole payload would have been passing for the wrong reason.
var allCampaignIds = [];
rowsOf(T26).forEach(function (r) {
  r.campaigns.forEach(function (c) { allCampaignIds.push(c.campaign_id); });
});
eq(allCampaignIds.indexOf('C3'), -1,
  '27 a campaign belonging to another company on the same country+marketplace is dropped');
eq(T26.data.provenance.campaign_scope.out_of_scope_lines_dropped, 1, '27a and the drop is counted');
eq(T26.data.provenance.campaign_scope.orphan_lines, 1,
  '27b a line naming a campaign that does not exist is counted, never guessed at');
eq(c1[0].scope_checks.map(function (s) { return s.column + ':' + s.matches; }),
  ['company:true', 'country:true', 'marketplace:true'],
  '27c the campaign scope is checked column by column');

// ---- 29..31 FILTERS AND VARIANTS ------------------------------------------------------------------
eq(idsOf(T8), ['M1', 'M2', 'M7', 'M8'], '29 category narrows AFTER membership');
eq(T8.data.filtersApplied.applied_after_membership, ['category', 'series'],
  '29a and the response says which filters are applied after it');
var T30 = run(full({ filters: { series: 'CO1100' } }));
eq(idsOf(T30), ['M1'], '30 series narrows after membership too');
ok(JSON.stringify(rowsOf(T30)).indexOf('GHOST-1') === -1,
  '30a and GHOST-1, which shares that series, still never appears');
eq(rowOf(OK1, 'M1').variant_group, 'CO1100', '31 variant_group comes from sku_details.series …');
eq(rowOf(OK1, 'M1').provenance.variant_group_source, 'sku_details.series', '31a named in provenance …');
eq(rowOf(OK1, 'M1').variant_name, null, '31b variant_name is null — no authoritative column exists');
var m6 = rowOf(OK1, 'M6');
eq(m6.variant_group, null, '31c a blank series yields null, never a slice of the SKU string');
ok(m6.missing_reasons.indexOf('VARIANT_GROUPING_SOURCE_MISSING') !== -1, '31d and says so');
ok(idsOf(OK1).indexOf('M6') !== -1, '31e a missing variant field never excludes a site SKU');

// ---- 32..35 BOUNDS, PAGINATION AND COUNTS ---------------------------------------------------------
var bigTables = JSON.parse(JSON.stringify(TABLES));
for (var i = 0; i < 50001; i++) {
  bigTables.sku_details.push({ sku: 'BULK-' + i, product_name: 'x', category: 'c', series: 's' });
}
var T32 = run(full(), { tables: bigTables });
eq(codes(T32.data.refusals), ['CAPPED_RESULT'], '32 a capped source refuses with CAPPED_RESULT');
eq(T32.data.refusals[0].subject, ['sku_details'], '32a naming the table that overflowed');
eq(T32.data.capped.skuDetails, true, '32b the cap is reported per source');
eq(T32.data.analysis_permitted, false, '32c and the answer is not offered as analytics-ready');
var T33a = run(full({ page: { limit: 2 } }));
var T33b = run(full({ page: { limit: 2, cursor: T33a.data.pagination.nextCursor } }));
eq(idsOf(T33a), ['M1', 'M2'], '33 the first page is deterministic (marketplace_sku_id ascending)');
eq(idsOf(T33b), ['M5', 'M6'], '33a and the second continues it without overlap or gap');
eq(run(full({ page: { limit: 2 } })).data.pagination.nextCursor, T33a.data.pagination.nextCursor,
  '33b the same request yields the same cursor');
eq(T33a.data.pagination.sort, 'marketplace_sku_id ascending', '33c the sort is declared');
var T34 = run(full({ filters: { category: 'Electric Can Opener' },
  page: { limit: 2, cursor: T33a.data.pagination.nextCursor } }));
eq(codes(T34.data.refusals), ['CURSOR_SCOPE_MISMATCH'],
  '34 a cursor issued for another filter set is REFUSED, not silently reused');
var T34b = run({ scope: { company: 'ResUS', country: 'US', marketplace: 'Amazon' },
  page: { limit: 2, cursor: T33a.data.pagination.nextCursor } });
eq(codes(T34b.data.refusals), ['CURSOR_SCOPE_MISMATCH'], '34a and so is one issued for another SITE');
eq([T33a.data.counts.siteSkuCount, T33a.data.pagination.returned, T33a.data.pagination.total],
  [6, 2, 6], '35 counts are TOTALS; only pagination.returned describes the page');
var T35 = run(full({ page: { limit: 5000 } }));
eq(codes(T35.data.refusals), ['PAGE_LIMIT_EXCEEDS_MAXIMUM'], '35a the hard maximum is enforced');
eq(run(full()).data.pagination.limit, 200, '35b with a bounded default');

// ---- A REAL EMPTY SITE IS NOT A REFUSAL -----------------------------------------------------------
var T36 = run({ scope: { company: 'KM', country: 'JP', marketplace: 'Rakuten' } });
eq([T36.data.refusals, T36.data.counts.siteSkuCount, T36.data.analysis_permitted], [[], 0, true],
  '36 a site that genuinely sells nothing answers 0 with NO refusal — distinct from every refusal above');

// ---- 36..38 THE SOURCE ITSELF ----------------------------------------------------------------------
['setValue', 'setValues', 'appendRow', 'appendRows', 'insertRow', 'insertRows', 'deleteRow', 'deleteRows',
 'clearContent', 'createSheet', 'insertSheet', 'LockService', 'getOperationDb', 'DriveApp', 'UrlFetchApp',
 'SpreadsheetApp.flush'].forEach(function (api, i) {
  eq(BARE72.indexOf(api), -1, '37.' + (i + 1) + ' 72_ real code contains no ' + api);
});
ok(/SpreadsheetApp\.openById\(id\)/.test(GS72), '37a it opens only by the exact production id');
ok(/prodAssertDbTarget_\(ss, id\)/.test(GS72), '37b and asserts the target');
eq((GS72.match(/prodRequireSheet_/g) || []).length, 1,
  '37c a missing sheet fails closed through the shared gate — it is never created');
['localStorage', 'sessionStorage', 'indexedDB', 'google.script', 'XMLHttpRequest', 'fetch(', 'document.',
 'PreviewProductStrategyDataAdapter'].forEach(function (api, i) {
  eq(BARE_ACC.indexOf(api), -1, '38.' + (i + 1) + ' the accessor real code contains no ' + api);
});
var ACCMOD = require('../js/api/km-product-pricing-workspace.js');
// R1 §6 — the four category promises join the contract, and the comparison stays EXACT on purpose: this
// assertion's job is to notice a key being removed or quietly flipped, which a subset check would not.
eq(ACCMOD.contract, { caches: false, stores: false, previewFallback: false,
  categoryVocabulary: null, categorySource: 'server', categoryLimit: null,
  derivesCategoriesFromMasterData: false,
  callerMayChooseAction: false,
  failsClosedWithoutCapability: true }, '38a and declares that contract as data');
eq(ACCMOD.isEnabled(), false, '38b the capability mirror defaults FALSE');
eq(ACCMOD.setCapability({ product_strategy_enabled: 'yes' }), false,
  '38c only a literal true raises it');
eq(ACCMOD.setCapability({ product_strategy_enabled: true }), true, '38d which a server payload can do');
ACCMOD.setCapability({});
eq(ACCMOD.isEnabled(), false, '38e and an unreadable payload puts it back');
eq(ACCMOD.buildPayload({ scope: { company: 'KM', country: 'US', marketplace: 'Amazon' },
  spreadsheetId: 'EVIL', action: 'getOperationDb' }).spreadsheetId, undefined,
  '38f the payload builder forwards only named fields — a caller cannot smuggle a spreadsheet id');
eq(ACCMOD.validateParams({ scope: { company: 'KM', country: 'US' } }).code, 'SCOPE_INCOMPLETE',
  '38g and it refuses an incomplete scope locally, with the server\'s own code');
eq(INDEX.indexOf('km-product-pricing-workspace'), -1,
  '38h PRODUCTION VISIBILITY IS ZERO: index.html does not load the accessor');
eq(INDEX.indexOf('Product Strategy'), -1, '38i and there is no Product Strategy nav entry');
eq(INDEX.indexOf('productPricing'), -1, '38j nor any reference to the action');

// ---- 39..40 skuDetails.workspace.get IS UNCHANGED --------------------------------------------------
// BEFORE == AFTER, proved by EXECUTING the shipped builder rather than by reading its source.
eval(GS59);
var SKD_FIXTURE = {
  sku_details: [{ sku: 'GA0450', product_name: 'Can Opener', category: 'Kitchen', series: 'Pro' },
    { sku: 'GA0451', product_name: 'Jar Opener', category: 'Kitchen', series: 'Lite' }],
  tax_referral_rates: [{ tax_rate_id: 'T1', series: 'Pro' }],
  tax_rate_components: [{ tax_component_id: 'TC1', tax_rate_id: 'T1' }],
  marketplace_skus: [{ marketplace_sku_id: 'M1', sku: 'GA0450', company: 'KM', country: 'US',
    marketplace: 'Amazon', marketplace_sku_status: 'active' }],
  sku_regional_details: [{ regional_detail_id: 'R1', sku: 'GA0450', company: 'KM', country: 'US',
    marketplace: 'Amazon' }]
};
var SKD_EXPECTED_NO_SCOPE = {
  summary: { skuDetailsCount: 2, taxReferralRateCount: 1, taxRateComponentCount: 1 },
  skuDetails: SKD_FIXTURE.sku_details,
  taxReferralRates: SKD_FIXTURE.tax_referral_rates,
  taxRateComponents: SKD_FIXTURE.tax_rate_components,
  capped: { skuDetails: false, taxReferralRates: false, taxRateComponents: false },
  counts: { skuDetails: 2, taxReferralRates: 1, taxRateComponents: 1 }
};
eq(skdWorkspaceBuild_(SKD_FIXTURE, {}), SKD_EXPECTED_NO_SCOPE,
  '39 skuDetails.workspace.get with no scope returns the FROZEN response, byte for byte');
// AND A SCOPE CHANGES NOTHING, because it has none. If a later round adds one, this line turns red.
eq(skdWorkspaceBuild_(SKD_FIXTURE, { scope: { company: 'KM', country: 'US', marketplace: 'Amazon' } }),
  SKD_EXPECTED_NO_SCOPE,
  '39a and passing a scope changes NOTHING — the site scope did not grow into the shared owner');
var SKD_REG = skdWorkspaceBuild_(SKD_FIXTURE, { include: { regional: true } });
eq([SKD_REG.marketplaceSkus.length, SKD_REG.skuRegionalDetails.length, SKD_REG.counts.marketplaceSkus],
  [1, 1, 1], '39b include.regional still returns the full regional pair');
eq(bare(GS59).indexOf('payload.scope'), -1, '39c 59_ real code never reads payload.scope');
eq(bare(GS59).indexOf('productStrategyEnabled_'), -1, '39d and is not gated on the new flag');
eq((GS59.match(/var SKD_WS_ROW_MAX_ = 50000;/g) || []).length, 1, '39e its cap is untouched');
eq((GS59.match(/var SKD_WORKSPACE_TABLES_ = \[/g) || []).length, 1, '39f its table list is untouched');
eq((GS59.match(/var SKD_BUILD_VERSION_ = 'F1-7N-FB-4C-R1';/g) || []).length, 1,
  '40 and its build stamp did not move, because its behaviour did not');

// ---- 41..43 FLAG, ROUTER AND WRITES ----------------------------------------------------------------
eq((GS00.match(/var PRODUCT_STRATEGY_ENABLED_ = false;/g) || []).length, 1,
  '41 00_config.gs declares the flag once, false');
eq((GS00.match(/function productStrategyEnabled_\(\)/g) || []).length, 1, '41a with one resolver');
// On REAL CODE: the comment names both superseded flags in the sentence explaining that they are
// superseded, and a file's record of what it replaced is not a declaration of it.
eq(bare(GS00).indexOf('PRODUCT_STRATEGY_BOARD_ENABLED_'), -1,
  '41b the superseded §13.2 name is declared nowhere');
eq(bare(GS00).indexOf('PRODUCT_PRICING_WORKSPACE_ENABLED_'), -1, '41c nor the superseded §28.4 name');
ok(/product_strategy_enabled: \(typeof productStrategyEnabled_ === 'function'\)/.test(GS63),
  '41d system.health reads the value from that one resolver');
ok(/inventory_ai_plan_db_generation_enabled:/.test(GS63), '41e without disturbing the existing capability');
eq(BARE_ACC.indexOf('PRODUCT_STRATEGY_ENABLED_'), -1,
  '41f and the client holds a mirror, never the flag itself');
eq((GS01.match(/'productPricing\.workspace\.get':\s+handleProductPricingWorkspaceGet_/g) || []).length, 1,
  '42 the router exposes the exact action once on GET');
eq((GS01.match(/action === 'productPricing\.workspace\.get'/g) || []).length, 1,
  '42a and once on POST, to the SAME handler');
eq(GS01.indexOf('productPricing.workspace.set'), -1, '42b no write twin exists');
eq((bare(GS01).match(/handleProductPricingWorkspaceGet_/g) || []).length, 2,
  '42c the handler is named exactly twice in real code — the two dispatches and nothing else');
var WRITE_SYMBOLS = ['setValue', 'setValues', 'appendRow', 'insertRow', 'deleteRow', 'clearContent',
  'createSheet', 'insertSheet', 'getRange'];
var found = WRITE_SYMBOLS.filter(function (s) { return BARE72.indexOf(s) !== -1; });
eq(found, [], '43 the handler reaches no write primitive and no getRange at all');
eq(run(full()).meta.db_writes, 0, '43a and every answer declares zero writes');

// ===================================================================================================
// MUTANTS — each one is a way the site scope could have leaked, written as the change that would do it.
// ===================================================================================================
console.log('\n--- mutants ---');
function swap(a, b) {
  var n = GS72.split(a).length - 1;
  if (n !== 1) throw new Error('anchor count ' + n + ' :: ' + a.slice(0, 70));
  return GS72.split(a).join(b);
}
function m(src, payload, opts) { return run(payload, opts, ctxOf(src)); }

mut('M1 the scope becomes optional, so an unscoped read answers with every site', function () {
  var s = swap("  ['company', 'country', 'marketplace'].forEach(function (k) { if (scope[k] === '') missing.push(k); });",
    "  ['company'].forEach(function (k) { if (scope[k] === '') missing.push(k); });");
  // THE HARM IS ANSWERING AT ALL. A half scope resolves no membership either, so the tell is not a bigger
  // row set — it is a request that should have been refused coming back as an analysable answer.
  var bad = m(s, { scope: { company: 'KM' } });
  return codes(run({ scope: { company: 'KM' } }).data.refusals)[0] === 'SCOPE_INCOMPLETE'
    && bad.data.refusals.length === 0 && bad.data.analysis_permitted === true;
});

mut('M2 membership is left to the client, so every company on the marketplace comes back', function () {
  // Drop the company comparison — the exact leak marketplace_skus carries `company` to prevent.
  var s = swap("    if (ppwLower_(r.company) !== wantedCompany) return;", '    ;');
  var bad = m(s, full());
  return idsOf(run(full())).indexOf('X1') === -1 && idsOf(bad).indexOf('X1') !== -1;
});

mut('M3 phasing_out is dropped from the default, hiding SKUs that are still on sale', function () {
  var s = swap("var PPW_DEFAULT_STATUSES_ = ['active', 'phasing_out'];",
    "var PPW_DEFAULT_STATUSES_ = ['active'];");
  var bad = m(s, full());
  return rowOf(run(full()), 'M2') !== null && rowOf(bad, 'M2') === null;
});

mut('M3b phasing_out is squashed into active, so the count cannot tell them apart', function () {
  var s = swap("  var KEY = { active: 'activeSiteSkuCount', phasing_out: 'phasingOutSiteSkuCount',",
    "  var KEY = { active: 'activeSiteSkuCount', phasing_out: 'activeSiteSkuCount',");
  var bad = m(s, full());
  return run(full()).data.counts.phasingOutSiteSkuCount === 1
    && run(full()).data.counts.activeSiteSkuCount === 5
    && bad.data.counts.phasingOutSiteSkuCount === 0 && bad.data.counts.activeSiteSkuCount === 6;
});

mut('M4 lifecycle becomes the membership gate, so the master table decides what a site sells', function () {
  var s = swap("    if (statuses.indexOf(status) === -1) { excludedByStatus++; return; }",
    "    if (statuses.indexOf(status) === -1 && ppwLower_(r.lifecycle) !== 'running in the market') { excludedByStatus++; return; }");
  var t = JSON.parse(JSON.stringify(TABLES));
  t.marketplace_skus[2].lifecycle = 'Running in the Market';   // an inactive site SKU, "running" as a product
  var bad = m(s, full(), { tables: t });
  return rowOf(run(full(), { tables: t }), 'M3') === null && rowOf(bad, 'M3') !== null;
});

mut('M5 the regional join loses one of its four parts, so another country answers for this one', function () {
  // BOTH HALVES, because the key and the same-site test must agree or the join simply misses instead of
  // mis-matching. Dropping `country` from both is the whole mutation, and three-of-four is not a near miss
  // — it is a different site.
  var s1 = swap("      && ppwLower_(r.country) === wantedCountry\n      && ppwLower_(r.marketplace) === wantedMarketplace;",
    "      && ppwLower_(r.marketplace) === wantedMarketplace;");
  var KEYA = "  return ppwLower_(sku) + '||' + ppwLower_(company) + '||' + ppwLower_(country) + '||'\n"
    + "    + ppwLower_(marketplace);";
  if (s1.split(KEYA).length - 1 !== 1) throw new Error('key anchor');
  var s = s1.split(KEYA).join("  return ppwLower_(sku) + '||' + ppwLower_(company) + '||' + ppwLower_(marketplace);");
  var bad = m(s, full());
  return rowOf(run(full()), 'M2').regional === null
    && rowOf(bad, 'M2').regional !== null
    && rowOf(bad, 'M2').regional.regional_detail_id === 'R2';
});

mut('M6 pricing joins on sku instead of the id, so a neighbour company sets this one\'s price', function () {
  var s = swap("    var id = ppwStr_(r.marketplace_sku_id);\n    if (id === '') return;\n    if (!m[id]) m[id] = [];\n    m[id].push(r);",
    "    var id = ppwStr_(r.sku);\n    if (id === '') return;\n    if (!m[id]) m[id] = [];\n    m[id].push(r);");
  // With a sku-keyed index, M1's lookup by 'M1' finds nothing and CO1100-R's two rows collide.
  var bad = m(s, full());
  return rowOf(run(full()), 'M1').regular_price === 32.99 && rowOf(bad, 'M1').regular_price === null;
});

mut('M7 a currency conflict is resolved silently in favour of the site row', function () {
  var s = swap("        findings.push({ code: 'CURRENCY_SOURCE_CONFLICT',",
    "        currency = siteCurrency; findings.push({ code: 'IGNORED_CURRENCY_SOURCE_CONFLICT',");
  var bad = m(s, full());
  return codes(rowOf(run(full()), 'M6').findings)[0] === 'CURRENCY_SOURCE_CONFLICT'
    && rowOf(bad, 'M6').currency === 'EUR'
    && codes(rowOf(bad, 'M6').findings).indexOf('CURRENCY_SOURCE_CONFLICT') === -1;
});

mut('M8 a missing price becomes zero, putting an unpriced SKU at the bottom of the ladder', function () {
  // The absent-ROW branch, not the absent-VALUE one: M5 has no pricing_list row at all, and a zero here is
  // a coordinate — the cheapest thing on the site, invented out of an absence.
  var s = swap("    regular_price: price ? ppwNum_(price.regular_price) : null,",
    "    regular_price: price ? ppwNum_(price.regular_price) : 0,");
  var bad = m(s, full());
  return rowOf(run(full()), 'M5').regular_price === null && rowOf(bad, 'M5').regular_price === 0;
});

mut('M9 a capped source is handed over as a complete, analytics-ready answer', function () {
  var s = swap("    refusals.push(ppwRefusal_('CAPPED_RESULT',", "    findings.push(ppwRefusal_('CAPPED_RESULT',");
  var big = JSON.parse(JSON.stringify(TABLES));
  for (var i = 0; i < 50001; i++) big.sku_details.push({ sku: 'B-' + i, product_name: 'x' });
  var bad = m(s, full(), { tables: big });
  return codes(run(full(), { tables: big }).data.refusals)[0] === 'CAPPED_RESULT'
    && bad.data.refusals.length === 0 && bad.data.analysis_permitted === true;
});

mut('M10 the flag is checked after the read, so a disabled feature still touches the database', function () {
  var s = swap("    if (io.flagEnabled() !== true) {", "    if (false) {");
  var bad = m(s, full(), { flag: false });
  var clean = run(full(), { flag: false });
  return clean.__log.opens === 0 && clean.__log.reads.length === 0
    && bad.__log.opens === 1 && bad.__log.reads.length > 0;
});

mut('M11 a writer reaches the read path', function () {
  var s = swap("  var data = ppwWorkspaceBuild_(tables, req);",
    "  ss.getSheetByName('marketplace_skus').getRange(1, 1).setValue('x');\n    var data = ppwWorkspaceBuild_(tables, req);");
  return bare(GS72).indexOf('setValue') === -1 && bare(s).indexOf('setValue') !== -1;
});

mut('M12 a preview fallback is introduced on the failure path', function () {
  var s = swap("      preview_fallback: false\n    }\n  };\n}\n\n/** The answer a refused request gets",
    "      preview_fallback: true\n    }\n  };\n}\n\n/** The answer a refused request gets");
  var bad = m(s, full());
  return run(full()).data.provenance.preview_fallback === false
    && bad.data.provenance.preview_fallback === true;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
process.exit(fail ? 1 : 0);
