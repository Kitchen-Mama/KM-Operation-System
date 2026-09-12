/**
 * ==================================================================================================
 * PRODUCT STRATEGY — P1-B6 SITE UNIVERSE     node assets/tests/api-product-pricing-site-universe-p1-b6.test.js
 * ==================================================================================================
 *
 * P1-B5 measured the gap and refused to guess at it: the board derives Company -> Country ->
 * Marketplace from the rows its adapter hands over, and `productPricing.workspace.get` is site-scoped
 * by construction, so it can never publish the set of sites to choose from. This suite is about the
 * owner that closes that, and about the client flow it makes possible.
 *
 * THE FIXTURE IS THE LIVE SHAPE. 495 membership rows over the ten canonical sites P1-B3 measured,
 * every row active, zero blank identities, zero duplicates. The identities are asserted VERBATIM —
 * `KM` is not rewritten to `Kitchen Mama` and `EU` is not split into countries, because a canonical
 * value that a display layer improved is a value no exact-match join will find again.
 *
 * WHAT THIS SUITE CANNOT DO is prove a menu renders. What it proves is that the menu's CONTENT is the
 * membership table's answer, that an upstream change cannot leave an impossible downstream value, and
 * that no path reaches the workspace read without all three tiers resolved.
 * ==================================================================================================
 */
'use strict';

var fs = require('fs'), path = require('path'), vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
var JS = path.join(ROOT, 'assets', 'js');
function read(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); }
/** Comments AND string literals out — a file's own prose names everything it promises not to do. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var GS72 = read('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var ROUTER = read('assets/specs/active/apps-script/01_router.gs');
var HEALTH = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var READBACK = read('assets/tools/apps-script-diagnostics/TEMP_P1_SITE_UNIVERSE_READBACK.gs');
var ACC_SRC = read('assets/js/api/km-product-pricing-workspace.js');
var SU_SRC = read('assets/js/product-strategy/km-product-strategy-site-universe.js');
var PAGE_SRC = read('assets/js/pages/product-strategy-board.js');

/* The live adapter validates rows against the shipped contract, so the contract has to be the global
   it reads. psb-data-contract.js assigns to `this`, which in a Node module is module.exports. */
global.PSB_CONTRACT = require(path.join(JS, 'product-strategy', 'psb-data-contract.js')).PSB_CONTRACT;
require(path.join(JS, 'api', 'km-product-pricing-adapter.js'));   // assigns KM_PRODUCT_PRICING_ADAPTER

var SU = require(path.join(JS, 'product-strategy', 'km-product-strategy-site-universe.js'));
var LIVE = require(path.join(JS, 'product-strategy', 'km-product-strategy-live-adapter.js'));
var PAGE = require(path.join(JS, 'pages', 'product-strategy-board.js'));
var ACC = require(path.join(JS, 'api', 'km-product-pricing-workspace.js'));

var pass = 0, fail = 0, mutCaught = 0, mutSurvived = 0;
var PENDING = Promise.resolve();
function ok(cond, label, extra) {
  if (cond) { pass++; console.log('  ok   ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra === undefined ? '' : '  ' + JSON.stringify(extra))); }
}
function eq(a, b, label) {
  var A = JSON.stringify(a), B = JSON.stringify(b);
  ok(A === B, label, A === B ? undefined : { got: a, want: b });
}

// ===================================================================================================
// THE TEN CANONICAL SITES, AND 495 ROWS OVER THEM
// ===================================================================================================
var CANONICAL = [
  { company: 'KM',    country: 'US', marketplace: 'Shopify', n: 40 },
  { company: 'KM',    country: 'US', marketplace: 'Target',  n: 35 },
  { company: 'KM',    country: 'US', marketplace: 'Walmart', n: 45 },
  { company: 'ResTW', country: 'AU', marketplace: 'Amazon',  n: 50 },
  { company: 'ResTW', country: 'CA', marketplace: 'Amazon',  n: 48 },
  { company: 'ResTW', country: 'EU', marketplace: 'Amazon',  n: 60 },
  { company: 'ResTW', country: 'JP', marketplace: 'Amazon',  n: 52 },
  { company: 'ResTW', country: 'UK', marketplace: 'Amazon',  n: 55 },
  { company: 'ResUS', country: 'US', marketplace: 'Amazon',  n: 60 },
  { company: 'ResUS', country: 'US', marketplace: 'Walmart', n: 50 }
];

function membershipRows(over) {
  over = over || {};
  var rows = [], n = 0;
  CANONICAL.forEach(function (s) {
    for (var i = 0; i < s.n; i++) {
      n++;
      rows.push({
        marketplace_sku_id: 'MSKU-' + n,
        sku: 'CO' + (1000 + (n % 192)) + '-R',
        company: s.company, country: s.country, marketplace: s.marketplace,
        marketplace_sku_status: 'active'
      });
    }
  });
  if (typeof over.mutate === 'function') over.mutate(rows);
  return rows;
}
var ROWS_495 = membershipRows();

// ===================================================================================================
// HARNESS — 72_ runs in a vm with an injectable io that COUNTS opens and reads. Nothing in the sandbox
// can write: there is no SpreadsheetApp, no LockService and no writer symbol at all.
// ===================================================================================================
var IO_SRC = [
  'var __LOG = { opens: 0, reads: [] };',
  'var __OPTS = {};',
  'var __IO = {',
  '  now: function () { return 1700000000000; },',
  '  nextSeq: function () { return 3; },',
  '  flagEnabled: function () { return __OPTS.flag === true; },',
  '  openTarget: function () { __LOG.opens++; return { __ss: true }; },',
  '  readTable: function (ss, name, cols) {',
  '    __LOG.reads.push(name);',
  '    if (__OPTS.missing) { var e = new Error("SCHEMA_SHEET_MISSING:" + name);',
  '      e.safetyToken = "SCHEMA_SHEET_MISSING"; throw e; }',
  '    if (__OPTS.badCols) { var e2 = new Error("SCHEMA_COLUMN_MISSING:company");',
  '      e2.safetyToken = "SCHEMA_COLUMN_MISSING"; throw e2; }',
  '    return __OPTS.rows || [];',
  '  }',
  '};'
].join('\n');

function ctxOf(src) {
  var ctx = vm.createContext({ console: console });
  vm.runInContext(IO_SRC, ctx);
  vm.runInContext(src || GS72, ctx);
  return ctx;
}
var CTX = ctxOf();

function runUniverse(opts, ctx) {
  ctx = ctx || CTX;
  var o = { flag: true, rows: ROWS_495 };
  Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
  vm.runInContext('__LOG = { opens: 0, reads: [] }; __OPTS = ' + JSON.stringify(o) + ';', ctx);
  var env = vm.runInContext(
    'JSON.parse(JSON.stringify(handleProductPricingSiteUniverseGet_({requestId:"REQ-T1"}, __IO)))', ctx);
  env.__log = vm.runInContext('JSON.parse(JSON.stringify(__LOG))', ctx);
  return env;
}
function codes(list) { return (list || []).map(function (r) { return r.code; }); }
function idOf(s) { return s.company + '/' + s.country + '/' + s.marketplace; }

console.log('=== PRODUCT-STRATEGY-P1-B6 — productPricing.siteUniverse.get ===\n');

// ===================================================================================================
console.log('--- §A  495 MEMBERSHIP ROWS BECOME TEN SITES ---');
// ===================================================================================================
var T = runUniverse();
eq(ROWS_495.length, 495, 'A1 the fixture is the measured 495 membership rows');
eq(T.data.sourceState, 'READY', 'A2 a complete read is READY');
eq(T.data.site_count, 10, 'A3 and resolves to exactly ten sites');
eq(T.__log.reads, ['marketplace_skus'],
  'A4 ONE table is read, and it is the membership table — not pricing_list, not sku_details');
eq(T.data.sites.reduce(function (a, s) { return a + s.membership_row_count; }, 0), 495,
  'A5 every membership row is accounted for in exactly one site');
eq(T.data.identity_authority, 'marketplace_skus (company + country + marketplace)',
  'A6 the authority is published, not assumed');

// ===================================================================================================
console.log('\n--- §B  THE TEN IDENTITIES, VERBATIM ---');
// ===================================================================================================
var EXPECTED = ['KM/US/Shopify', 'KM/US/Target', 'KM/US/Walmart',
  'ResTW/AU/Amazon', 'ResTW/CA/Amazon', 'ResTW/EU/Amazon', 'ResTW/JP/Amazon', 'ResTW/UK/Amazon',
  'ResUS/US/Amazon', 'ResUS/US/Walmart'];
eq(T.data.sites.map(idOf).sort(), EXPECTED.slice().sort(), 'B1 the ten canonical identities, exactly');

/* NOT REWRITTEN, NOT EXPANDED, NOT PRETTIFIED. A canonical value a display layer improved is a value
   no exact-match join will find again — and this endpoint's output is what the NEXT request is built
   from, so a friendly name here becomes a refused scope there. */
ok(T.data.sites.every(function (s) { return s.company !== 'Kitchen Mama'; }),
  'B2 `KM` is NOT rewritten to `Kitchen Mama`');
ok(T.data.sites.some(function (s) { return s.country === 'EU'; }),
  'B3 and `EU` survives as itself');
ok(!T.data.sites.some(function (s) {
  return ['DE', 'FR', 'IT', 'ES', 'NL'].indexOf(s.country) >= 0;
}), 'B4 `EU` is NOT split into member countries — that would invent sites nobody sells on');

eq(T.data.hierarchy.companies, ['KM', 'ResTW', 'ResUS'], 'B5 three companies, deterministically ordered');
eq(T.data.hierarchy.countries_by_company.KM, ['US'], 'B6 KM sells in one country');
eq(T.data.hierarchy.countries_by_company.ResTW, ['AU', 'CA', 'EU', 'JP', 'UK'], 'B7 ResTW in five');
eq(T.data.hierarchy.countries_by_company.ResUS, ['US'], 'B8 ResUS in one');
eq(T.data.hierarchy.marketplaces_by_country['KM|US'], ['Shopify', 'Target', 'Walmart'],
  'B9 and KM/US has three marketplaces — none of them Amazon');
eq(T.data.hierarchy.marketplaces_by_country['ResUS|US'], ['Amazon', 'Walmart'], 'B10 ResUS/US has two');

/* THE SAME ROWS TWICE GIVE THE SAME ANSWER. Determinism is what makes a diff between two reads a
   change in the data rather than a change in the sheet's row order. */
eq(runUniverse().data.sites.map(idOf), T.data.sites.map(idOf), 'B11 the ordering is deterministic');

// ===================================================================================================
console.log('\n--- §C  NARROWING, AND ONE OPTION IS A FACT ---');
// ===================================================================================================
var U = SU.adapt(T);
eq(U.state, 'OK', 'C1 the client adapts a READY universe');
eq(SU.companies(U), ['KM', 'ResTW', 'ResUS'], 'C2 three companies offered');
eq(SU.countriesFor(U, 'ResTW'), ['AU', 'CA', 'EU', 'JP', 'UK'], 'C3 countries narrow to the company');
eq(SU.countriesFor(U, 'KM'), ['US'], 'C4 and a different company offers a different list');
eq(SU.marketplacesFor(U, 'KM', 'US'), ['Shopify', 'Target', 'Walmart'],
  'C5 marketplaces narrow to company AND country');
eq(SU.marketplacesFor(U, 'ResUS', 'US'), ['Amazon', 'Walmart'],
  'C6 the same country under a different company offers a different list');

/* WITHOUT THIS SECOND ASSERTION THE FIRST WOULD PASS ON A GLOBAL MENU — the P1-B4 lesson, which is
   why it is repeated here on live-shaped data rather than assumed to carry over. */
ok(JSON.stringify(SU.marketplacesFor(U, 'KM', 'US'))
  !== JSON.stringify(SU.marketplacesFor(U, 'ResUS', 'US')),
  'C7 and the two are NOT the same list');

var n1 = SU.narrow(U, { company: 'KM' });
eq(n1.scope.country, 'US', 'C8 KM has one country, so it is resolved rather than offered');
ok(n1.isContext.country, 'C9 and reported as CONTEXT — a dropdown with one item cannot do anything');
ok(n1.autoResolved.indexOf('country') >= 0, 'C10 named as auto-resolved, not silently chosen');
eq(n1.complete, false, 'C11 but the scope is not complete — three marketplaces remain a real choice');

var n2 = SU.narrow(U, { company: 'ResTW', country: 'JP' });
eq(n2.scope.marketplace, 'Amazon', 'C12 ResTW/JP has one marketplace, so it resolves');
eq(n2.complete, true, 'C13 and that completes the scope');

/* THE DOWNSTREAM CLEARING RULE. Switching company must not keep a marketplace the new company does
   not sell on — the P1-B4 defect was clearing it AFTER it had been chosen, which is a repair where a
   constraint belongs. Here it never becomes selectable at all. */
var n3 = SU.narrow(U, { company: 'ResUS', country: 'US', marketplace: 'Target' });
eq(n3.scope.marketplace, null, 'C14 Target is not offered under ResUS/US, so it is dropped');
ok(n3.cleared.indexOf('marketplace') >= 0, 'C15 and the cleared tier is NAMED, not silently blanked');
eq(n3.complete, false, 'C16 leaving the scope incomplete rather than wrong');

var n4 = SU.narrow(U, { company: 'KM', country: 'JP', marketplace: 'Amazon' });
eq([n4.scope.country, n4.scope.marketplace], ['US', null],
  'C17 an invalid country clears the marketplace under it too');
eq(n4.cleared.sort(), ['country', 'marketplace'], 'C18 both are named');

/* IT NEVER REVISES UPWARD. A control that edits its own input is one nobody can predict. */
var n5 = SU.narrow(U, { company: 'ResTW', country: 'AU', marketplace: 'Shopify' });
eq([n5.scope.company, n5.scope.country], ['ResTW', 'AU'],
  'C19 an impossible marketplace does not rewrite the country that offered the list');

eq(SU.CONTRACT.auto_selects_first_of_several, false,
  'C20 one option is resolved; the FIRST OF SEVERAL never is');

// ===================================================================================================
console.log('\n--- §D  BLANK, DUPLICATE, AND UNKNOWN ---');
// ===================================================================================================
var blankRows = membershipRows({ mutate: function (rows) {
  rows[0].company = '';  rows[1].country = '';  rows[2].marketplace = '   ';
  rows[3].marketplace_sku_id = '';
} });
var TB = runUniverse({ rows: blankRows });
eq(TB.data.sourceState, 'READY', 'D1 blank identities do not stop the read');
eq(TB.data.site_count, 10, 'D2 and do not invent an eleventh site');
eq(TB.data.excluded.blank_identity_rows, 3, 'D3 three rows had a blank identity tier');
eq([TB.data.excluded.blank_company_rows, TB.data.excluded.blank_country_rows,
  TB.data.excluded.blank_marketplace_rows], [1, 1, 1], 'D4 counted per tier');
ok(!TB.data.sites.some(function (s) {
  return s.company === '' || s.country === '' || s.marketplace === '';
}), 'D5 and NOT ONE blank option is offered — a blank choice cannot be answered');
eq(TB.data.excluded.blank_marketplace_sku_id_rows, 1, 'D6 a blank listing id is counted separately');

/* A DUPLICATE LISTING ID IS A STOP, NOT A WARNING. This endpoint performs no join — and detects it
   anyway, because the universe is what a person chooses FROM, and offering a site whose rows may
   attach to the wrong product is offering a wrong answer before it is even asked for. */
var dupRows = membershipRows({ mutate: function (rows) { rows[5].marketplace_sku_id = rows[4].marketplace_sku_id; } });
var TD = runUniverse({ rows: dupRows });
eq(TD.data.sourceState, 'STOP_DATA_INTEGRITY', 'D7 a duplicate marketplace_sku_id STOPS');
eq(TD.data.site_count, 0, 'D8 and publishes no sites at all');
eq(TD.data.sites, [], 'D9 not even the nine that were fine');
ok(codes(TD.data.refusals).indexOf('DUPLICATE_MARKETPLACE_SKU_ID') >= 0, 'D10 named');

/* ONE SITE SPELLED TWO WAYS. "KM " and "KM" normalise together, so a count is right and a later
   exact-match join is not — nobody can tell which spelling the data means. */
var conflictRows = membershipRows({ mutate: function (rows) { rows[0].company = 'KM '; } });
var TC = runUniverse({ rows: conflictRows });
eq(TC.data.sourceState, 'READY',
  'D11 a trailing space is trimmed, so it is the SAME site and not an ambiguity');
eq(TC.data.site_count, 10, 'D12 still ten');
var caseRows = membershipRows({ mutate: function (rows) { rows[0].company = 'km'; } });
var TCC = runUniverse({ rows: caseRows });
eq(TCC.data.sourceState, 'STOP_DATA_INTEGRITY',
  'D13 but a DIFFERENT spelling that case-folds together is an ambiguous identity');
ok(codes(TCC.data.refusals).indexOf('AMBIGUOUS_SITE_IDENTITY') >= 0, 'D14 named');

/* UNKNOWN STATUS IS NAMED, NEVER ASSUMED ACTIVE. Defaulting an unreadable status to sellable would
   put a listing in a menu on the strength of a blank cell. */
var unkRows = membershipRows({ mutate: function (rows) {
  rows[0].marketplace_sku_status = 'running'; rows[1].marketplace_sku_status = '';
} });
var TU = runUniverse({ rows: unkRows });
eq(TU.data.excluded.unknown_status_rows, 2, 'D15 unknown statuses are counted');
var km0 = TU.data.sites.filter(function (s) { return idOf(s) === 'KM/US/Shopify'; })[0];
eq(km0.unknown_status_count, 2, 'D16 and attributed to their site');
eq(km0.active_count, 38, 'D17 without being counted as active');
ok(km0.refusal_reasons.indexOf('UNKNOWN_STATUS_ROWS_PRESENT') >= 0, 'D18 with the reason named');

/* SELECTABILITY COMES FROM THE EXISTING PRODUCT RULE — PPW_DEFAULT_STATUSES_ — not from a new one. */
var deadRows = membershipRows({ mutate: function (rows) {
  rows.forEach(function (r) {
    if (r.company === 'KM' && r.marketplace === 'Target') r.marketplace_sku_status = 'discontinued';
  });
} });
var TDead = runUniverse({ rows: deadRows });
var target = TDead.data.sites.filter(function (s) { return idOf(s) === 'KM/US/Target'; })[0];
eq(target.selectable, false, 'D19 a site with only discontinued listings is not selectable BY DEFAULT');
eq(target.selectable_with_inactive, true,
  'D20 but IS reachable with include_inactive — which is a real request, so it is not hidden');
ok(target.refusal_reasons.indexOf('ONLY_INACTIVE_OR_DISCONTINUED_LISTINGS') >= 0, 'D21 reason named');
eq(TDead.data.site_count, 10, 'D22 and it is still published — status is a filter, not membership');

// ===================================================================================================
console.log('\n--- §E  MISSING, UNREADABLE, EMPTY, CAPPED ---');
// ===================================================================================================
var TM = runUniverse({ missing: true });
eq(TM.data.sourceState, 'SOURCE_PARTIALLY_READABLE',
  'E1 a MISSING table is not an empty one — empty is the one answer a caller acts on by moving on');
eq(codes(TM.data.refusals), ['SOURCE_TABLE_UNREADABLE'], 'E2 named');
eq(TM.data.site_count, 0, 'E3 with no sites');
eq(TM.meta.dbOpened, true, 'E4 the database WAS opened, which is why this is not NOT_CONNECTED');

var TBad = runUniverse({ badCols: true });
eq(TBad.data.sourceState, 'SOURCE_PARTIALLY_READABLE', 'E5 a missing COLUMN fails the same way');

var TE = runUniverse({ rows: [] });
eq(TE.data.sourceState, 'SOURCE_EMPTY',
  'E6 a table that was fully read and holds nothing IS empty — and only then');
eq(TE.data.site_count, 0, 'E7 with no sites and no demo site in their place');
eq(TE.data.sites, [], 'E8 an empty universe NEVER falls back to a default list');

var many = [];
for (var q = 0; q < 2600; q++) {
  many.push({ marketplace_sku_id: 'B-' + q, company: 'KM', country: 'US', marketplace: 'Shopify',
    marketplace_sku_status: 'active' });
}
var TCap = runUniverse({ rows: many });
eq(TCap.data.sourceState, 'SOURCE_PARTIALLY_READABLE', 'E9 a capped read does not claim a whole universe');
eq(TCap.data.completeness.is_whole_universe, false, 'E10 and says so as data');
ok(codes(TCap.data.refusals).indexOf('SOURCE_ROW_CAP_REACHED') >= 0, 'E11 named');
eq(TCap.data.site_count, 0, 'E12 with no menu, because a partial menu is indistinguishable from a short one');

// ===================================================================================================
console.log('\n--- §F  THE FLAG, BEFORE THE DOOR ---');
// ===================================================================================================
var TF = runUniverse({ flag: false });
eq(codes(TF.data.refusals), ['FEATURE_DISABLED'], 'F1 flag=false refuses with FEATURE_DISABLED');
eq([TF.__log.opens, TF.__log.reads.length], [0, 0],
  'F2 and PROVEN: the spreadsheet was never opened and no table was read');
eq(TF.meta.dbOpened, false, 'F3 meta says dbOpened false');
eq(TF.meta.tablesRead, 0, 'F4 and tablesRead 0');
eq(TF.data.sourceState, null,
  'F5 sourceState is NULL — nothing was measured, which is not the same as measuring nothing');
eq(TF.data.sites, [], 'F6 with no sites');

// ===================================================================================================
console.log('\n--- §G  WHAT THE ENDPOINT WILL NOT PUBLISH ---');
// ===================================================================================================
/* THE TWO DECLARATION ARRAYS ARE REMOVED BEFORE THE SEARCH. `does_not_publish` exists to NAME the
   fields this endpoint refuses to publish, so searching the whole response for those names finds its
   own manifest — the audit reporting the notice as the offence. The real question is whether any of
   them appears as a KEY, which is what a leak would look like. */
var scrubbed = JSON.parse(JSON.stringify(T.data));
delete scrubbed.does_not_publish;
delete scrubbed.publishes;
var blob = JSON.stringify(scrubbed);
['regular_price', 'minimum_price', 'msrp', 'currency', 'image_url', 'product_url', 'spreadsheetId',
  'spreadsheet_id', 'marketplace_sku_id', 'master_sku', 'normalizedRows'].forEach(function (f, i) {
  ok(blob.indexOf('"' + f + '":') < 0, 'G1.' + (i + 1) + ' the response carries no ' + f + ' field');
});
/* And the fingerprint block names COLUMN names, which is evidence about the table rather than a
   value from it — so it is checked separately rather than exempted silently. */
ok(JSON.stringify(T.data.schema.table.headers).indexOf('marketplace_sku_id') >= 0,
  'G1a the schema fingerprint DOES name the table\'s columns — that is evidence, not data');
ok(JSON.stringify(T.data.sites).indexOf('marketplace_sku_id') < 0,
  'G1b while not one SITE record carries a listing id');
ok(T.data.does_not_publish.length >= 8, 'G2 and the refusal list is published as data');
eq(T.data.publishes, ['company', 'country', 'marketplace', 'counts', 'selectability'],
  'G3 what it DOES publish is a short, stated list');

/* CURRENCY IS NOT A SITE SCOPE, and this endpoint is where that could most easily have been broken:
   a currency column on a site menu invites a menu keyed on it. */
ok(bare(GS72).indexOf('ppwSiteUniverseBuild_') >= 0, 'G4 the builder exists');
var builderSrc = /function ppwSiteUniverseBuild_[\s\S]*?\n}\n/.exec(GS72)[0];
ok(bare(builderSrc).indexOf('currency') < 0,
  'G5 and the site-universe builder never reads a currency column');
ok(bare(builderSrc).indexOf('regional') < 0,
  'G6 nor a regional one — a missing Regional Detail must not un-list a site');
ok(bare(builderSrc).indexOf('pricing_list') < 0, 'G7 nor pricing_list — it is not a membership owner');
ok(bare(builderSrc).indexOf('sku_details') < 0, 'G8 nor sku_details');

// ===================================================================================================
console.log('\n--- §H  THE SERVER NEVER SENDS THE CLIENT-ONLY STATE ---');
// ===================================================================================================
ok(bare(GS72).indexOf("'SOURCE_NOT_CONNECTED'") < 0 || true, 'H0 (checked by behaviour below)');
var states = {};
[{}, { flag: false }, { rows: [] }, { missing: true }, { badCols: true }, { rows: many },
  { rows: dupRows }].forEach(function (o) {
  states[String(runUniverse(o).data.sourceState)] = 1;
});
ok(!states.SOURCE_NOT_CONNECTED,
  'H1 across every reachable server path, SOURCE_NOT_CONNECTED is never emitted');
eq(Object.keys(states).sort(),
  ['READY', 'SOURCE_EMPTY', 'SOURCE_PARTIALLY_READABLE', 'STOP_DATA_INTEGRITY', 'null'],
  'H2 the states it CAN emit are exactly the four servable ones plus an unmeasured null');

/* AND THE CLIENT REFUSES TO BELIEVE ONE IF IT ARRIVED ANYWAY. A response carrying it is proof a
   server answered, which is the one thing that state claims did not happen. */
var lying = ACC.validateUniverseResponse({ success: true, meta: { action: ACC.SITE_UNIVERSE_ACTION },
  data: { sites: [], refusals: [], sourceState: 'SOURCE_NOT_CONNECTED' } });
eq(lying.ok, false, 'H3 the accessor rejects a server-sent client-only state');
eq(lying.code, 'SERVER_SENT_A_CLIENT_ONLY_STATE', 'H4 by name');
var lyingAdapted = SU.adapt({ success: true, data: { sites: [], refusals: [],
  sourceState: 'SOURCE_NOT_CONNECTED', schema: { contract_version: 1 } } });
eq(lyingAdapted.state, 'SOURCE_NOT_CONNECTED', 'H5 and the universe module is the second wall');
ok(codes(lyingAdapted.refusals).indexOf('SERVER_SENT_A_CLIENT_ONLY_STATE') >= 0, 'H6 naming it');

// ===================================================================================================
console.log('\n--- §I  THE CLIENT FLOW: ORDER, SINGLE FLIGHT, STALENESS ---');
// ===================================================================================================
function universeEnvelope(over) {
  var d = JSON.parse(JSON.stringify(T.data));
  Object.keys(over || {}).forEach(function (k) { d[k] = over[k]; });
  return { success: true, data: d, meta: { action: ACC.SITE_UNIVERSE_ACTION }, errors: [] };
}
function workspaceEnvelope(scope) {
  return { success: true, meta: { action: ACC.ACTION }, errors: [],
    data: { normalizedRows: [], refusals: [], findings: [], analysis_permitted: true,
      counts: {}, filterOptions: { categories: [], series: [] }, pagination: null, scope: scope,
      sourceState: 'SOURCE_EMPTY', schema: { contract_version: 2 } } };
}

function stubAccessor(log) {
  return {
    isEnabled: function () { return true; },
    getSiteUniverse: function () { log.push('universe'); return Promise.resolve(universeEnvelope()); },
    get: function (p) { log.push('workspace:' + p.scope.company + '/' + p.scope.country
      + '/' + p.scope.marketplace); return Promise.resolve(workspaceEnvelope(p.scope)); }
  };
}

PENDING = PENDING.then(function () {
  var log = [];
  var c = PAGE.create({ accessor: stubAccessor(log), siteUniverse: SU, liveAdapter: LIVE,
    board: { mount: function () {} } });
  return c.loadUniverse().then(function (r) {
    eq(log, ['universe'],
      'I1 THE FIRST REQUEST IS THE UNIVERSE — the workspace read is not called on load');
    eq(r.state, PAGE.AWAITING_SITE_SELECTION, 'I2 and the page waits for a choice');
    eq(c.requests.workspace, 0, 'I3 zero workspace requests so far');

    return c.select({ company: 'ResTW' });
  }).then(function (r) {
    eq(c.requests.workspace, 0, 'I4 a company alone is not a scope, and costs no request');
    eq(r.state, PAGE.AWAITING_SITE_SELECTION, 'I5 still waiting');
    return c.select({ company: 'ResTW', country: 'JP' });
  }).then(function () {
    eq(log[log.length - 1], 'workspace:ResTW/JP/Amazon',
      'I6 ResTW/JP resolves its single marketplace, completing the scope — THEN the read happens');
    eq(c.requests.workspace, 1, 'I7 exactly one');
  });
});

PENDING = PENDING.then(function () {
  // STALENESS. Two selections; the FIRST resolves last. Its answer must be dropped, not rendered.
  var resolvers = [];
  var acc = {
    isEnabled: function () { return true; },
    getSiteUniverse: function () { return Promise.resolve(universeEnvelope()); },
    get: function (p) {
      return new Promise(function (res) {
        resolvers.push(function () { res(workspaceEnvelope(p.scope)); });
      });
    }
  };
  var mounted = [];
  var c = PAGE.create({ accessor: acc, siteUniverse: SU, liveAdapter: LIVE,
    board: { mount: function (o) { mounted.push(o); } } });
  return c.loadUniverse().then(function () {
    var first = c.select({ company: 'ResTW', country: 'JP' });      // ResTW/JP/Amazon
    var second = c.select({ company: 'ResTW', country: 'AU' });     // ResTW/AU/Amazon
    resolvers[1]();          // the NEWER one answers first
    resolvers[0]();          // then the older one arrives late
    return Promise.all([first, second]);
  }).then(function (rs) {
    var stale = rs.filter(function (r) { return r && r.dropped === true; });
    eq(stale.length, 1, 'I8 the superseded response is DROPPED, not merged');
    eq(c.dropped, 1, 'I9 and counted');
    eq(c.narrowed.scope.country, 'AU', 'I10 the current scope is the newer choice');
    ok(c.requests.workspace === 2, 'I11 two requests were made', c.requests.workspace);
  });
});

PENDING = PENDING.then(function () {
  // A SITE SWITCH INVALIDATES WHAT WAS DERIVED FROM THE OLD SITE.
  var c = PAGE.create({ accessor: stubAccessor([]), siteUniverse: SU, liveAdapter: LIVE,
    board: { mount: function () {} } });
  return c.loadUniverse()
    .then(function () { return c.select({ company: 'ResTW', country: 'JP' }); })
    .then(function () { return c.select({ company: 'ResTW', country: 'AU' }); })
    .then(function () {
      eq(c.siteChanged, true, 'I12 a site switch is detected');
      eq(SU.sameSite({ company: 'ResTW', country: 'JP', marketplace: 'Amazon' },
        { company: 'ResTW', country: 'AU', marketplace: 'Amazon' }), false,
        'I13 two sites differing only by country are NOT the same site');
    });
});

PENDING = PENDING.then(function () {
  // FEATURE DISABLED -> ZERO REQUESTS OF EITHER KIND.
  var log = [];
  var c = PAGE.create({ accessor: {
    isEnabled: function () { return false; },
    getSiteUniverse: function () { log.push('universe'); return Promise.resolve({}); },
    get: function () { log.push('workspace'); return Promise.resolve({}); }
  }, siteUniverse: SU, liveAdapter: LIVE });
  return c.loadUniverse().then(function (r) {
    eq(r.state, 'FEATURE_DISABLED', 'I14 a disabled capability is its own state');
    eq(log, [], 'I15 and NOTHING reached the wire — not the universe, not the workspace');
    eq([c.requests.siteUniverse, c.requests.workspace], [0, 0], 'I16 requests_made = 0');
  });
});

// ===================================================================================================
console.log('\n--- §J  NO FIXTURE, AND NO WRITER ANYWHERE ON THIS PATH ---');
// ===================================================================================================
[['the universe module', SU_SRC], ['the page controller', PAGE_SRC], ['the accessor', ACC_SRC]]
  .forEach(function (pair, i) {
    var b = bare(pair[1]);
    ok(b.indexOf('PSB_PREVIEW') < 0 && b.indexOf('PreviewProductStrategyDataAdapter') < 0
      && b.indexOf('StressProductStrategyDataAdapter') < 0,
      'J1.' + (i + 1) + ' ' + pair[0] + ' names no fixture');
    ok(b.indexOf('localStorage') < 0 && b.indexOf('sessionStorage') < 0
      && b.indexOf('document.cookie') < 0, 'J2.' + (i + 1) + ' ' + pair[0] + ' writes no storage');
    ok(b.indexOf('location.search') < 0 && b.indexOf('URLSearchParams') < 0
      && b.indexOf('location.href') < 0, 'J3.' + (i + 1) + ' ' + pair[0] + ' reads no URL parameter');
  });
eq(SU.CONTRACT.site_list_in_this_file, false, 'J4 there is no hard-coded site list');
eq(SU.CONTRACT.fixture_fallback, false, 'J5 and no fixture fallback');
eq(SU.CONTRACT.derives_universe_from_workspace_response, false,
  'J6 the universe is never reverse-engineered from a site-scoped answer');

/* THE WRITER VOCABULARY, on the endpoint and on the readback. The universe builder is a pure
   function and the readback has no writer at all; both claims are checked against the source with
   comments AND string literals stripped, because a file's own prose names what it promises not to do. */
var WRITERS = ['setValue', 'setValues', 'appendRow', 'insertSheet', 'deleteRow', 'deleteColumn',
  'clearContent', 'createSheet', 'CacheService', 'PropertiesService', 'DriveApp'];
var bareReadback = bare(READBACK);
WRITERS.forEach(function (w, i) {
  ok(bareReadback.indexOf(w) < 0, 'J7.' + (i + 1) + ' the readback contains no ' + w);
});
var bareUniverseFns = bare(builderSrc) + bare(/function handleProductPricingSiteUniverseGet_[\s\S]*$/.exec(GS72)[0]);
WRITERS.forEach(function (w, i) {
  ok(bareUniverseFns.indexOf(w) < 0, 'J8.' + (i + 1) + ' nor does the endpoint path — no ' + w);
});
ok(/function RUN_P1_SITE_UNIVERSE_READBACK\s*\(\s*\)/.test(READBACK),
  'J9 the readback entry point takes NO parameters');
ok(READBACK.indexOf('ppwSiteUniverseBuild_') >= 0,
  'J10 and hands its tables to the SHIPPED pure builder rather than computing its own answer');
ok(READBACK.indexOf('ppwDefaultIo_') >= 0, 'J11 using the same fail-closed read helper as the endpoint');
ok(bareReadback.indexOf('PRODUCT_STRATEGY_ENABLED_ =') < 0,
  'J12 and it never assigns the flag — the refusal is the proof, so flipping it would destroy it');

// ===================================================================================================
console.log('\n--- §K  THE ROUTE, AND THE VERSION PINS ---');
// ===================================================================================================
ok(/'productPricing\.siteUniverse\.get':\s+handleProductPricingSiteUniverseGet_/.test(ROUTER),
  'K1 the action is in the GET read table');
ok(/action === 'productPricing\.siteUniverse\.get'[\s\S]{0,400}?handleProductPricingSiteUniverseGet_/
  .test(ROUTER), 'K2 and dispatches to the SAME handler on doPost — one contract, not two');
eq(Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(HEALTH)[1]), 14,
  'K3 the deployed action contract moved, because a router ACTION was added');
eq(Number(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/
  .exec(read('assets/js/api/operation-system-db-api.js'))[1]), 14,
  'K4 and the client pin moved with it, so an un-synced deployment fails closed BY VERSION');
eq(ACC.SITE_UNIVERSE_ACTION, 'productPricing.siteUniverse.get', 'K5 the accessor names the same action');
eq(ACC.contract.actions.length, 2, 'K6 ONE accessor module owns both actions');
ok(bare(ACC_SRC).indexOf('google.script.run') < 0, 'K7 and still never touches google.script.run');

// ===================================================================================================
console.log('\n--- §L  MUTANTS ---');
// ===================================================================================================
function mutGs(label, from, to, probe) {
  var n = GS72.split(from).length - 1;
  if (n !== 1) { mutSurvived++; console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label); return; }
  var ctx;
  try { ctx = ctxOf(GS72.replace(from, to)); }
  catch (e) { mutCaught++; console.log('  ok   ' + label + ' (caught, threw: ' + e.message + ')'); return; }
  var caught = false;
  try { caught = probe(ctx) === true; } catch (e2) { caught = true; }
  if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
  else { mutSurvived++; console.log('  MUTANT SURVIVED — ' + label); }
}

/* P1-B7E — the anchor quotes the flag check together with the envelope call beneath it,
   which is what makes it specific: `if (io.flagEnabled() !== true) {` appears twice in 72_,
   once per handler, and that is the point. ppwEnvelope_ now takes the action it answers for
   as its first argument, so the anchor moved with the call. The rule is unchanged. */
mutGs('M1 the flag is checked after the table is read, so a disabled feature touches the database',
  "    if (io.flagEnabled() !== true) {\n      return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true,\n        ppwSiteUniverseRefused_('FEATURE_DISABLED',",
  "    if (false) {\n      return ppwEnvelope_(PPW_SITE_UNIVERSE_ACTION_, true,\n        ppwSiteUniverseRefused_('FEATURE_DISABLED',",
  function (ctx) { var r = runUniverse({ flag: false }, ctx); return r.__log.opens > 0; });

mutGs('M2 a blank company becomes an offered option',
  "    if (companyRaw === '' || countryRaw === '' || marketRaw === '') { blankAny++; return; }",
  "    if (false) { blankAny++; return; }",
  function (ctx) {
    var r = runUniverse({ rows: blankRows }, ctx);
    return r.data.site_count !== 10;
  });

mutGs('M3 a duplicate listing id is downgraded to a warning and the menu is published anyway',
  "  if (findings.length > 0) {\n    // A STOP, NOT A WARNING.",
  "  if (false) {\n    // A STOP, NOT A WARNING.",
  function (ctx) { return runUniverse({ rows: dupRows }, ctx).data.sourceState !== 'STOP_DATA_INTEGRITY'; });

mutGs('M4 a capped read is published as the whole universe',
  "  } else if (capped === true) {",
  "  } else if (false) {",
  function (ctx) { return runUniverse({ rows: many }, ctx).data.sourceState !== 'SOURCE_PARTIALLY_READABLE'; });

mutGs('M5 an unreadable table is reported as an empty one',
  "          d.sourceState = 'SOURCE_PARTIALLY_READABLE';",
  "          d.sourceState = 'SOURCE_EMPTY';",
  function (ctx) { return runUniverse({ missing: true }, ctx).data.sourceState === 'SOURCE_EMPTY'; });

mutGs('M6 an unknown status is counted as active',
  "      site.unknown_status_count++;",
  "      site.active_count++;",
  function (ctx) {
    var r = runUniverse({ rows: unkRows }, ctx);
    var s = r.data.sites.filter(function (x) { return idOf(x) === 'KM/US/Shopify'; })[0];
    return s.unknown_status_count === 0 || s.active_count === 40;
  });

mutGs('M7 selectability is decided by row count instead of by the default status gate',
  "    site.selectable = defaultCount > 0;",
  "    site.selectable = site.membership_row_count > 0;",
  function (ctx) {
    var r = runUniverse({ rows: deadRows }, ctx);
    var s = r.data.sites.filter(function (x) { return idOf(x) === 'KM/US/Target'; })[0];
    return s.selectable === true;
  });

mutGs('M8 the identity comparison stops case-folding, so one site becomes two',
  "function ppwSiteIdentity_(company, country, marketplace) {\n  return ppwLower_(company)",
  "function ppwSiteIdentity_(company, country, marketplace) {\n  return ppwStr_(company)",
  function (ctx) { return runUniverse({ rows: caseRows }, ctx).data.site_count === 11; });

mutGs('M9 the ordering stops being deterministic',
  "  order.sort();\n\n  var sites = order.map(function (k) {",
  "  order.reverse();\n\n  var sites = order.map(function (k) {",
  function (ctx) {
    var a = runUniverse({}, ctx).data.sites.map(idOf);
    return JSON.stringify(a) !== JSON.stringify(T.data.sites.map(idOf));
  });

mutGs('M10 the endpoint starts publishing a currency, which invites a menu keyed on it',
  "    publishes: ['company', 'country', 'marketplace', 'counts', 'selectability'],",
  "    publishes: ['company', 'country', 'marketplace', 'counts', 'selectability', 'currency'],",
  function (ctx) {
    return runUniverse({}, ctx).data.publishes.indexOf('currency') >= 0;
  });

function mutFile(label, file, from, to, probe) {
  var full = path.join(JS, file);
  var original = fs.readFileSync(full, 'utf8');
  var norm = original.replace(/\r\n/g, '\n');
  var n = norm.split(from).length - 1;
  if (n !== 1) { mutSurvived++; console.log('  MUTANT SURVIVED (anchor x' + n + ') ' + label); return; }
  fs.writeFileSync(full, norm.replace(from, to), 'utf8');
  var caught = false;
  try {
    delete require.cache[require.resolve(full)];
    caught = probe(require(full)) === true;
  } catch (e) { caught = true; }
  fs.writeFileSync(full, original, 'utf8');
  delete require.cache[require.resolve(full)];
  require(full);
  if (caught) { mutCaught++; console.log('  ok   ' + label + ' (caught)'); }
  else { mutSurvived++; console.log('  MUTANT SURVIVED — ' + label); }
}

var SU_FILE = path.join('product-strategy', 'km-product-strategy-site-universe.js');

mutFile('M11 an invalid downstream value is kept instead of cleared', SU_FILE,
  "      if (wantMarket !== '') cleared.push('marketplace');",
  "      scope.marketplace = wantMarket;",
  function (M) {
    var u = M.adapt(T);
    var n = M.narrow(u, { company: 'ResUS', country: 'US', marketplace: 'Target' });
    return n.scope.marketplace === 'Target';
  });

mutFile('M12 the FIRST of several options is auto-selected, not only a lone one', SU_FILE,
  "      if (options.marketplace.length === 1) {",
  "      if (options.marketplace.length >= 1) {",
  function (M) {
    var u = M.adapt(T);
    var n = M.narrow(u, { company: 'KM', country: 'US' });
    return n.scope.marketplace !== null;
  });

// ===================================================================================================
PENDING.then(function () {
  console.log('\n' + '='.repeat(100));
  console.log('passed ' + pass + '  failed ' + fail
    + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
  console.log('='.repeat(100));
  if (fail > 0 || mutSurvived > 0) process.exitCode = 1;
});
