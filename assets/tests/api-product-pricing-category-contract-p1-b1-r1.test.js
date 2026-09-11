// Kitchen Mama Operation System — PRODUCT-STRATEGY-P1-B1-R1 §5/§6/§7
// THE CATEGORY UNIVERSE IS THE SITE'S, AND IT IS DISCOVERED, NOT DECLARED.
//
// The prototype shows three categories because its fixture has three. That is a property of the fixture and
// of nothing else, and the failure this suite exists to prevent is that number becoming a contract: a
// hard-coded list, a cap of three, a client that decides categories from a master table it happened to
// receive, or a menu built from whatever fitted on the current page.
//
// So the fixture here deliberately carries EIGHT distinct category values across four statuses, one blank,
// one pair that differs only by case, one that differs only by whitespace, one that exists only on another
// site, and one that exists in sku_details with no site row at all. Each of those is a way the menu can be
// wrong, and each is an assertion below and, where it is a rule rather than a shape, a mutant.
//
// Run: node assets/tests/api-product-pricing-category-contract-p1-b1-r1.test.js
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
/** Comments AND string literals out — a file's own prose names everything it promises not to do. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

var GS72 = read('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var ACC = read('assets/js/api/km-product-pricing-workspace.js');
var BARE72 = bare(GS72);

// ===================================================================================================
// FIXTURE — one site with eight category values, and every way a ninth could be invented.
// ===================================================================================================
function msku(id, sku, status, extra) {
  var r = { marketplace_sku_id: id, sku: sku, company: 'KM', country: 'US', marketplace: 'Amazon',
    site_sku: 'KM-' + sku, marketplace_sku_status: status, currency: 'USD' };
  Object.keys(extra || {}).forEach(function (k) { r[k] = extra[k]; });
  return r;
}
/* P1-B3 — THE SITE LISTINGS THIS FIXTURE HAD NO ROWS FOR.
 *
 * It carried `sku_regional_details: []`, which describes a catalogue in which nothing is listed on any
 * marketplace. That was invisible while `analysable` ignored the regional join; now that a product with
 * no Regional Detail is correctly not plottable, an empty regional table makes EVERY count zero and
 * C9a's contrast - two SKUs in a category, one of them plottable - disappears along with the reason it
 * exists. So the fixture gains the rows a real site would have, and CAN-2's missing PRICE remains the
 * one thing that separates the two counts. */
function reg(id, sku) {
  return { regional_detail_id: id, sku: sku, company: 'KM', country: 'US', marketplace: 'Amazon',
    site_sku: 'KM-' + sku, marketplace_product_id: 'B-' + sku, language: 'en' };
}
function price(id, mid, sku, amount) {
  return { pricing_id: id, marketplace_sku_id: mid, sku: sku, country: 'US', marketplace: 'Amazon',
    currency: 'USD', regular_price: amount, minimum_price: 1, msrp: amount + 5,
    price_status: 'active', price_source: 'import' };
}

var TABLES = {
  marketplace_skus: [
    msku('A1', 'CAN-1',   'active'),
    msku('A2', 'CAN-2',   'active'),
    msku('P1', 'PEEL-1',  'active'),
    msku('S1', 'SPAT-1',  'phasing_out'),        // the ONLY SKU in its category, and it is phasing out
    msku('I1', 'SCALE-1', 'inactive'),           // the ONLY SKU in its category, and it is inactive
    msku('D1', 'TONG-1',  'discontinued'),       // the ONLY SKU in its category, and it is discontinued
    msku('B1', 'BOARD-1', 'active'),             // 'Cutting Board'
    msku('B2', 'BOARD-2', 'active'),             // 'cutting board' — case variant, NOT the same value
    msku('W1', 'WHISK-1', 'active'),             // '  Whisk  '     — trims to 'Whisk'
    msku('L1', 'LADLE-1', 'active'),             // category cell is EMPTY
    // ANOTHER SITE. 'French Press' exists in the DB and is not sold here.
    { marketplace_sku_id: 'Z1', sku: 'PRESS-1', company: 'KM', country: 'DE', marketplace: 'Amazon',
      site_sku: 'KM-DE-PRESS-1', marketplace_sku_status: 'active', currency: 'EUR' }
  ],
  sku_details: [
    { sku: 'CAN-1',   product_name: 'Can Opener 1',  category: 'Electric Can Opener', series: 'CO1100' },
    { sku: 'CAN-2',   product_name: 'Can Opener 2',  category: 'Electric Can Opener', series: 'CO1150' },
    { sku: 'PEEL-1',  product_name: 'Peeler 1',      category: 'Peeler',              series: 'PL2000' },
    { sku: 'SPAT-1',  product_name: 'Spatula 1',     category: 'Silicone Spatula',    series: 'SP3120' },
    { sku: 'SCALE-1', product_name: 'Scale 1',       category: 'Food Scale',          series: 'FS4000' },
    { sku: 'TONG-1',  product_name: 'Tongs 1',       category: 'Cooking Tongs',       series: 'CT5000' },
    { sku: 'BOARD-1', product_name: 'Board 1',       category: 'Cutting Board',       series: 'CB6000' },
    { sku: 'BOARD-2', product_name: 'Board 2',       category: 'cutting board',       series: 'CB6000' },
    { sku: 'WHISK-1', product_name: 'Whisk 1',       category: '  Whisk  ',           series: 'WK7000' },
    // NO CATEGORY. It has a series and a product name, and neither may be promoted into one.
    { sku: 'LADLE-1', product_name: 'Ladle Deluxe',  category: '',                    series: 'LD8000' },
    { sku: 'PRESS-1', product_name: 'French Press',  category: 'French Press',        series: 'FP9000' },
    // A MASTER SKU SOLD NOWHERE AT ALL. Its category must never reach a menu.
    { sku: 'GHOST-1', product_name: 'Never Sold',    category: 'Air Fryer',           series: 'AF0000' }
  ],
  // Every SKU listed on KM/US/Amazon has its Regional Detail. PRESS-1 deliberately does NOT: it is the
  // other-site SKU, and giving it one here would make it look listed on the site under test.
  sku_regional_details: [
    reg('RD1',  'CAN-1'), reg('RD2',  'CAN-2'), reg('RD3', 'PEEL-1'), reg('RD4', 'SPAT-1'),
    reg('RD5',  'SCALE-1'), reg('RD6', 'TONG-1'), reg('RD7', 'BOARD-1'), reg('RD8', 'BOARD-2'),
    reg('RD9',  'WHISK-1'), reg('RD10', 'LADLE-1')
  ],
  pricing_list: [
    price('PR1', 'A1', 'CAN-1',   32.99),
    // CAN-2 has NO price: same category as CAN-1, so the two counts must differ for that category.
    price('PR2', 'P1', 'PEEL-1',  12.99),
    price('PR3', 'S1', 'SPAT-1',   9.99),
    price('PR4', 'I1', 'SCALE-1', 44.99),
    price('PR5', 'D1', 'TONG-1',  15.99),
    price('PR6', 'B1', 'BOARD-1', 21.99),
    price('PR7', 'B2', 'BOARD-2', 22.99),
    price('PR8', 'W1', 'WHISK-1',  7.99),
    price('PR9', 'L1', 'LADLE-1',  6.99)
  ],
  campaigns: [],
  campaign_sku_lines: []
};

// ===================================================================================================
// HARNESS — identical in shape to the P1-B1 suite: a vm with an injectable io that COUNTS opens/reads.
// ===================================================================================================
var IO_SRC = [
  'var __LOG = { opens: 0, reads: [] };',
  'var __OPTS = {};',
  'var __IO = {',
  '  now: function () { return 1000; },',
  '  nextSeq: function () { return 7; },',
  '  flagEnabled: function () { return __OPTS.flag === true; },',
  '  openTarget: function () { __LOG.opens++; return { __ss: true }; },',
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
  // ONLY `console` — see the P1-B1 suite: passing host built-ins crosses realms and breaks instanceof.
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
  var body = { requestId: 'REQ-C000001', payload: payload || {} };
  var env = vm.runInContext('JSON.parse(JSON.stringify(handleProductPricingWorkspaceGet_('
    + JSON.stringify(body) + ', __IO)))', ctx);
  env.__log = vm.runInContext('JSON.parse(JSON.stringify(__LOG))', ctx);
  return env;
}
function site(over) {
  var p = { scope: { company: 'KM', country: 'US', marketplace: 'Amazon' } };
  Object.keys(over || {}).forEach(function (k) { p[k] = over[k]; });
  return p;
}
function cats(env) {
  return (env.data.filterOptions.categories || []).map(function (c) { return c.value; });
}
function catRow(env, v) {
  var hit = null;
  (env.data.filterOptions.categories || []).forEach(function (c) { if (c.value === v) hit = c; });
  return hit;
}
function codes(list) { return (list || []).map(function (r) { return r.code; }); }
function findingOf(env, code) {
  var hit = null;
  (env.data.findings || []).forEach(function (f) { if (f.code === code) hit = f; });
  return hit;
}

console.log('=== PRODUCT-STRATEGY-P1-B1-R1 — the dynamic Category contract ===\n');

var D = run(site());                                       // the default site read
var INC = run(site({ filters: { include_inactive: true } }));   // the same site, inactive included

// ---- 1 THE UNIVERSE IS DISCOVERED ----------------------------------------------------------------
eq(cats(D),
  ['Cutting Board', 'Electric Can Opener', 'Peeler', 'Silicone Spatula', 'Whisk', 'cutting board'],
  'C1  six categories, discovered from the site — not three, and not a declared list');
ok(cats(D).length >= 6, 'C1a and the count is the fixture\'s, so a cap of three would fail here',
  cats(D).length);
eq(cats(INC).length, 8, 'C1b with inactive included the site has eight');

// ---- 2 THE SOURCE IS sku_details.category, AND NOTHING ELSE --------------------------------------
eq(D.data.filterOptions.provenance.category_source, 'sku_details.category',
  'C2  the response NAMES the authority it read');
ok(BARE72.indexOf('PPW_CATEGORY_SOURCE_') > 0 && /PPW_CATEGORY_SOURCE_\s*=\s*$/m.test('') === false,
  'C2a and the module declares it as a constant rather than spelling it inline');
eq(D.data.filterOptions.provenance.inferred_from, [],
  'C2b nothing was inferred to produce it');
eq(D.data.filterOptions.provenance.allowlist, null,
  'C2c there is no category allowlist');
eq(D.data.filterOptions.provenance.max_options, null,
  'C2d and no bound on how many categories a site may have');

// ---- 3 MEMBERSHIP FIRST. A category with no site SKU is not a category HERE. ----------------------
ok(cats(D).indexOf('French Press') === -1,
  'C3  a category sold only on another site does not appear', cats(D));
ok(cats(INC).indexOf('French Press') === -1,
  'C3a and include_inactive does not smuggle it in either', cats(INC));
ok(cats(D).indexOf('Air Fryer') === -1,
  'C3b the GHOST master SKU\'s category — a complete sku_details row, sold nowhere — never appears');
ok(JSON.stringify(D.data.filterOptions).indexOf('Air Fryer') === -1,
  'C3c and it is nowhere in the options object at all');
eq(D.data.filtersApplied.applied_after_membership, ['category', 'series'],
  'C3d the response states that category narrows AFTER membership');

// ---- 4 THE STATUS LADDER DECIDES WHAT IS ON THE MENU ----------------------------------------------
ok(cats(D).indexOf('Electric Can Opener') !== -1, 'C4  an active category appears');
ok(cats(D).indexOf('Silicone Spatula') !== -1,
  'C4a a category whose only SKU is phasing_out appears BY DEFAULT — it is still on sale');
ok(cats(D).indexOf('Food Scale') === -1,
  'C4b a category whose only SKU is inactive does NOT appear by default');
ok(cats(D).indexOf('Cooking Tongs') === -1,
  'C4c nor does one whose only SKU is discontinued');
ok(cats(INC).indexOf('Food Scale') !== -1 && cats(INC).indexOf('Cooking Tongs') !== -1,
  'C4d and include_inactive=true brings both back', cats(INC));

// ---- 5 BLANK IS ABSENT, NEVER 'Other' -------------------------------------------------------------
var blank = findingOf(D, 'CATEGORY_SOURCE_MISSING');
ok(!!blank, 'C5  a blank category is REPORTED as CATEGORY_SOURCE_MISSING', codes(D.data.findings));
eq(blank && blank.evidence.rows, 1, 'C5a with the number of site SKUs it affects');
eq(blank && blank.evidence.renamed_to_other, false, 'C5b and it says so: nothing was renamed');
ok(cats(D).indexOf('Other') === -1 && cats(D).indexOf('') === -1,
  'C5c there is no Other bucket and no empty-string option', cats(D));
ok(BARE72.indexOf("'Other'") === -1 && BARE72.indexOf('"Other"') === -1,
  'C5d and the module never mints the word at all');
var ladle = null;
D.data.normalizedRows.forEach(function (r) { if (r.marketplace_sku_id === 'L1') ladle = r; });
eq(ladle && ladle.category, null, 'C5e the SKU is still returned, carrying category null');

// ---- 6 TRIM ONLY. NO SEMANTIC MERGE. --------------------------------------------------------------
ok(cats(D).indexOf('Whisk') !== -1, 'C6  a value with surrounding whitespace is TRIMMED');
ok(cats(D).indexOf('  Whisk  ') === -1, 'C6a and the untrimmed form is not also an option');
ok(cats(D).indexOf('Cutting Board') !== -1 && cats(D).indexOf('cutting board') !== -1,
  'C6b two spellings that differ only by case stay TWO options — this read does not merge them');
var norm = findingOf(D, 'CATEGORY_NORMALIZATION_REVIEW_REQUIRED');
ok(!!norm, 'C6c and the disagreement is REPORTED for an operator to settle',
  codes(D.data.findings));
eq(norm && norm.evidence.merged, false, 'C6d stating that nothing was merged');
eq(norm && norm.evidence.groups[0].variants, ['Cutting Board', 'cutting board'],
  'C6e naming both variants');
eq(D.data.filterOptions.provenance.semantic_merge, false,
  'C6f and the provenance says the same thing');
eq(D.data.filterOptions.provenance.normalization,
  'trim only; exact-value de-duplication; deterministic ascending sort',
  'C6g the normalization performed is stated exactly');

// ---- 7 NO GUESSING FROM series, product_name OR THE SKU STRING -----------------------------------
// LADLE-1 has series 'LD8000' and product_name 'Ladle Deluxe' and NO category. If any of the three were
// a fallback, one of these strings would be a category.
['LD8000', 'Ladle Deluxe', 'Ladle', 'LADLE'].forEach(function (v, i) {
  ok(cats(D).indexOf(v) === -1, 'C7.' + (i + 1) + ' `' + v + '` is not a category', cats(D));
});
eq(D.data.filterOptions.provenance.series_source, 'sku_details.series',
  'C7a series has its own named source, kept separate from category');
ok(cats(D).indexOf('CO1100') === -1 && cats(D).indexOf('CB6000') === -1,
  'C7b no series value leaked into the category list');

// ---- 8 EXACT DE-DUPLICATION AND A DETERMINISTIC ORDER --------------------------------------------
var seen = {}, dupes = [];
cats(D).forEach(function (v) { if (seen[v]) dupes.push(v); seen[v] = 1; });
eq(dupes, [], 'C8  identical values appear exactly once');
eq(cats(D), cats(D).slice().sort(), 'C8a and the order is a deterministic ascending sort');
eq(cats(run(site())), cats(D), 'C8b the same request twice gives the same order');

// ---- 9 THE COUNTS ARE THE UNIVERSE, NOT THE PAGE -------------------------------------------------
var CAN = catRow(D, 'Electric Can Opener');
eq(CAN && CAN.siteSkuCount, 2, 'C9  a category counts every site SKU in it');
eq(CAN && CAN.analysableSiteSkuCount, 1,
  'C9a and counts separately how many of those can actually be plotted — CAN-2 has no price');
var P1 = run(site({ page: { limit: 1 } }));
eq(P1.data.normalizedRows.length, 1, 'C9b a page size of one returns one row …');
eq(cats(P1), cats(D), 'C9c … and the SAME six categories — options are not built from the page');
eq(catRow(P1, 'Electric Can Opener').siteSkuCount, 2,
  'C9d with the full-universe count, not the one row on this page');
ok(catRow(P1, 'Electric Can Opener').siteSkuCount !== P1.data.pagination.returned,
  'C9e which is a different number from the page count, as it must be');
eq(D.data.filterOptions.provenance.page_size_independent, true,
  'C9f and the response states the independence');
eq(D.data.filterOptions.provenance.counts_are,
  'the whole scope/filter universe, NOT the current page', 'C9g in words as well');

// ---- 10 THE FILTER RUNS AFTER MEMBERSHIP, AND THE MENU DOES NOT COLLAPSE -------------------------
var F = run(site({ filters: { category: 'Electric Can Opener' } }));
eq(F.data.normalizedRows.map(function (r) { return r.marketplace_sku_id; }), ['A1', 'A2'],
  'C10  a category filter narrows the rows');
eq(F.data.filtersApplied.category, 'Electric Can Opener', 'C10a and the applied filter is echoed back');
eq(cats(F), cats(D),
  'C10b while the category menu still lists all six — a menu that collapses to your own choice is unusable');
eq(F.data.filterOptions.provenance.self_excluding, true, 'C10c which the provenance states');
var FS = run(site({ filters: { series: 'CB6000' } }));
eq(cats(FS), ['Cutting Board', 'cutting board'],
  'C10d the OTHER dimension does narrow it, so every option shown still leads to a row');
var FGHOST = run(site({ filters: { category: 'Air Fryer' } }));
eq(FGHOST.data.normalizedRows, [],
  'C10e filtering by a category no site SKU has returns nothing — it cannot reach into sku_details');
eq(FGHOST.data.counts.siteSkuCount, 0, 'C10f and says zero, having measured it');

// ---- 11 A DIFFERENT SITE IS A DIFFERENT UNIVERSE --------------------------------------------------
var DE = run({ scope: { company: 'KM', country: 'DE', marketplace: 'Amazon' } });
eq(cats(DE), ['French Press'], 'C11  changing the site changes the category universe');
ok(cats(DE).indexOf('Electric Can Opener') === -1,
  'C11a and nothing from the previous site survives the change', cats(DE));
eq(catRow(DE, 'French Press').siteSkuCount, 1, 'C11b with its own counts');

// ---- 12 AN UNPROVABLE UNIVERSE PUBLISHES NO MENU --------------------------------------------------
var many = [];
for (var i = 0; i < 50001; i++) { many.push(msku('BULK' + i, 'BULK-' + i, 'active')); }
var CAP = run(site(), { tables: { marketplace_skus: many, sku_details: TABLES.sku_details,
  sku_regional_details: [], pricing_list: [], campaigns: [], campaign_sku_lines: [] } });
ok(codes(CAP.data.refusals).indexOf('CAPPED_RESULT') !== -1,
  'C12  a capped source is a CAPPED_RESULT refusal', codes(CAP.data.refusals));
eq(CAP.data.analysis_permitted, false, 'C12a analysis_permitted is false');
eq(CAP.data.filterOptions, null,
  'C12b and filterOptions is NULL — a menu that looks complete over a truncated universe is a lie');
var OFF = run(site(), { flag: false });
eq(OFF.data.filterOptions, null, 'C12c a refused request carries null options, not an empty list');
eq(OFF.data.counts.siteSkuCount, null, 'C12d beside null counts, for the same reason');

// ---- 13 THE ACCESSOR SHIPS NO CATEGORY VOCABULARY -------------------------------------------------
['Electric Can Opener', 'Manual Can Opener', 'Silicone Spatula', 'Food Scale', 'Cutting Board',
  'Cooking Tongs', 'Air Fryer'].forEach(function (v, i) {
  ok(ACC.indexOf(v) === -1, 'C13.' + (i + 1) + ' the accessor does not spell `' + v + '`');
});
ok(ACC.indexOf('categories') !== -1,
  'C13a it knows the FIELD exists — it validates the response shape — without knowing any value');
ok(bare(ACC).indexOf('sku_details') === -1,
  'C13b and it never names the master table: the universe is resolved on the server');

console.log('');

// ===================================================================================================
// MUTANTS — each is a way the menu becomes wrong, applied to the real source and re-run.
// ===================================================================================================
function withSrc(mutated) { return ctxOf(mutated); }
function swap(src, a, b) {
  if (src.indexOf(a) === -1) throw new Error('mutation target absent: ' + a);
  return src.split(a).join(b);
}

mut('M1 categories are built from the whole of sku_details instead of the site universe', function () {
  var m = swap(GS72, "var catOpt = ppwFilterOptions_(catBase, 'category');",
    "var catOpt = ppwFilterOptions_(rowsOf('sku_details').map(function (r) {\n"
    + "    return { category: r.category, series: r.series, analysable: false }; }), 'category');");
  var bad = run(site(), {}, withSrc(m));
  // The tell is not merely "more categories": it is that a category NOBODY SELLS HERE is offered.
  return cats(D).indexOf('Air Fryer') === -1 && cats(bad).indexOf('Air Fryer') !== -1;
});

mut('M2 the membership gate moves AFTER the category derivation', function () {
  // `survived` is the post-membership, post-status universe. The mutant fills it from EVERY
  // marketplace_skus row instead, i.e. it derives the menu before the site gate has run. The lookup is
  // inlined rather than using skuIdx, which `var` hoisting would leave undefined at this point.
  var m = swap(GS72, '  var survived = [], all = [];', [
    '  var survived = [], all = [];',
    '  rowsOf("marketplace_skus").forEach(function (mr) {',
    '    var hit = null;',
    '    rowsOf("sku_details").forEach(function (d) {',
    '      if (ppwStr_(d.sku) === ppwStr_(mr.sku)) hit = d; });',
    '    survived.push({ category: hit ? hit.category : null, series: hit ? hit.series : null,',
    '      analysable: false });',
    '  });'
  ].join('\n'));
  var bad = run(site(), {}, withSrc(m));
  return cats(D).indexOf('French Press') === -1 && cats(bad).indexOf('French Press') !== -1;
});

mut('M3 phasing_out is dropped from the default statuses', function () {
  var m = swap(GS72, "var PPW_DEFAULT_STATUSES_ = ['active', 'phasing_out'];",
    "var PPW_DEFAULT_STATUSES_ = ['active'];");
  var bad = run(site(), {}, withSrc(m));
  return cats(D).indexOf('Silicone Spatula') !== -1 && cats(bad).indexOf('Silicone Spatula') === -1;
});

mut('M4 inactive is included by default', function () {
  var m = swap(GS72, "var PPW_DEFAULT_STATUSES_ = ['active', 'phasing_out'];",
    "var PPW_DEFAULT_STATUSES_ = ['active', 'phasing_out', 'inactive', 'discontinued'];");
  var bad = run(site(), {}, withSrc(m));
  return cats(D).indexOf('Food Scale') === -1 && cats(bad).indexOf('Food Scale') !== -1;
});

mut('M5 a blank category falls back to series', function () {
  var m = swap(GS72, "    var v = ppwStr_(r[key]);            // TRIM is the only normalization performed",
    "    var v = ppwStr_(r[key]) || ppwStr_(r.series);");
  var bad = run(site(), {}, withSrc(m));
  return cats(D).indexOf('LD8000') === -1 && cats(bad).indexOf('LD8000') !== -1;
});

mut('M6 the option list is capped at the first three', function () {
  var m = swap(GS72, '  return { options: order.map(function (v) { return seen[v]; }), blank_count: blank };',
    '  return { options: order.slice(0, 3).map(function (v) { return seen[v]; }), blank_count: blank };');
  var bad = run(site(), {}, withSrc(m));
  return cats(D).length === 6 && cats(bad).length === 3;
});

mut('M7 the options are built from the current page instead of the whole universe', function () {
  var m = swap(GS72, "  var catOpt = ppwFilterOptions_(catBase, 'category');",
    "  var catOpt = ppwFilterOptions_(all.slice(req.page.offset,\n"
    + "    req.page.offset + req.page.limit), 'category');");
  var ctx = withSrc(m);
  var badFull = run(site(), {}, ctx), badPage = run(site({ page: { limit: 1 } }), {}, ctx);
  // On a full page the mutant is invisible. It is the SMALL page that exposes it, which is exactly why
  // C9c runs at limit 1 rather than trusting the default.
  return cats(badFull).length === cats(D).length
    && cats(badPage).length < cats(D).length && cats(P1).length === cats(D).length;
});

mut('M8 the category values are lower-cased, silently merging two spellings', function () {
  var m = swap(GS72, "    var v = ppwStr_(r[key]);            // TRIM is the only normalization performed",
    "    var v = ppwStr_(r[key]).toLowerCase();");
  var bad = run(site(), {}, withSrc(m));
  return cats(D).indexOf('Cutting Board') !== -1 && cats(bad).indexOf('Cutting Board') === -1
    && cats(bad).indexOf('cutting board') !== -1;
});

mut('M9 a blank category is bucketed as Other', function () {
  var m = swap(GS72, "    if (v === '') { blank++; return; }  "
    + '// blank is ABSENT, never a bucket and never renamed',
    "    if (v === '') { blank++; v = 'Other'; }");
  var bad = run(site(), {}, withSrc(m));
  return cats(D).indexOf('Other') === -1 && cats(bad).indexOf('Other') !== -1;
});

mut('M10 a capped source still publishes a category menu', function () {
  var m = swap(GS72, '    filterOptions: !permitted ? null : {', '    filterOptions: {');
  var ctx = withSrc(m);
  var bad = run(site(), { tables: { marketplace_skus: many, sku_details: TABLES.sku_details,
    sku_regional_details: [], pricing_list: [], campaigns: [], campaign_sku_lines: [] } }, ctx);
  return CAP.data.filterOptions === null && bad.data.filterOptions !== null;
});

mut('M11 the category filter is applied case-insensitively, merging what the menu keeps apart', function () {
  var m = swap(GS72,
    "    if (filters.category !== null && ppwStr_(row.category) !== ppwStr_(filters.category)) return;",
    "    if (filters.category !== null && ppwLower_(row.category) !== ppwLower_(filters.category)) return;");
  var clean = run(site({ filters: { category: 'Cutting Board' } }));
  var bad = run(site({ filters: { category: 'Cutting Board' } }), {}, withSrc(m));
  // Two options in the menu must mean two different selections. The mutant makes them one.
  return clean.data.normalizedRows.length === 1 && bad.data.normalizedRows.length === 2;
});

mut('M12 the category menu is narrowed by the category filter itself, so it collapses', function () {
  // `all` is the fully filtered set; `catBase` is deliberately NOT narrowed by the category filter.
  // Building the menu from `all` makes every selection the last one an operator can make.
  var m = swap(GS72, '  var catOpt = ppwFilterOptions_(catBase, \'category\');',
    '  var catOpt = ppwFilterOptions_(all, \'category\');');
  var picked = site({ filters: { category: 'Electric Can Opener' } });
  var clean = run(picked), bad = run(picked, {}, withSrc(m));
  return cats(clean).length === 6 && cats(bad).length === 1;
});

console.log('\npassed ' + pass + '  failed ' + fail
  + '  |  mutants caught ' + mutCaught + '  survived ' + mutSurvived);
process.exit(fail ? 1 : 0);
