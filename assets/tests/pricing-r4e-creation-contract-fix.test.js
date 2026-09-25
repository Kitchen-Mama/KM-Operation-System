// Kitchen Mama Operation System — PRICING-R4E · CREATION CONTRACT FIX
// =============================================================================================================
// PRICING-R4D proved that 04_ writes a new CAD row holding a USD price: base_currency defaulted to USD,
// fx_rate seeded as 1 whatever the site currency, auto_* copied from base_*, the effective price copied from
// auto_*, and all three ownership flags blank — so the later FX run, which is forbidden to touch an
// UNCLAIMED field, could correct auto_* and not the price the site was serving.
//
// THIS SUITE IS THE PROOF THAT IT STOPPED, and it is built on one idea: a rate of 1 is a FACT between two
// identical currencies and an INVENTION between two different ones. Everything below follows from that.
//
// THE PART THAT IS EASY TO MISS. Fixing creation would be worthless if a pending row were a dead end. It is
// not: base_* and base_currency are written either way, and the three flags are written FALSE. So the first
// pricing.fxReconcile that supplies a rate for the pair computes auto_* from the base the row already
// carries, sees a flag that says AUTO, and moves the effective price with it. Section D proves that
// end-to-end by running the shipped 04_ and then feeding its own output to the shipped 73_.
//
//   A  §8 the creation census — one owner, and the sixteen writes it makes
//   B  §3 same-currency creation, across every currency in the frozen precision table
//   C  §4 cross-currency creation — fail-closed, and the branch that cannot exist
//   D  the self-repair: 04_'s pending row, handed to 73_'s FX planner
//   E  §6 the regression matrix: six currency pairs x five cases
//   F  §5 the FC Summary zero coercion
//   G  §7/§9 nothing else moved — the FX and update contracts, and no existing row is touched
//   H  mutants
//
// Run: node assets/tests/pricing-r4e-creation-contract-fix.test.js
// LOCAL / FAKE-ONLY. No network, no Sheets, no Apps Script, no browser. ZERO production reads or writes.
// NOTE: no 'use strict' — the .gs sources are eval'd.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var GS04 = readN('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
var GS72 = readN('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var FCSUM = readN('assets/js/pages/fc-summary.js');
var DOC = readN('assets/specs/active/PRICING_DATABASE_MAPPING.md');
var PSBSEL = readN('assets/js/product-strategy/psb-selectors.js');

var pass = 0, fail = 0, caught = 0, survived = [];
function ok(c, l, d) {
  if (c) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + (d === undefined ? '' : '\n  got ' + JSON.stringify(d))); }
}
function eq(a, e, l) {
  var A = JSON.stringify(a), E = JSON.stringify(e);
  if (A === E) { pass++; console.log('ok   ' + l); }
  else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); }
}
function section(n) { console.log('\n== ' + n + ' =='); }
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4E — CREATION CONTRACT FIX');
console.log(new Array(111).join('='));

// -------------------------------------------------------------------------------------------------------------
// THE WORLD. Apps Script gives every .gs file in a project ONE global scope, so 73_ and 04_ are loaded into
// one context exactly as they are in production — which is what lets 04_ reuse 73_'s frozen precision table
// instead of carrying a second copy of it.
// -------------------------------------------------------------------------------------------------------------
function fakeSheet(name, grid) {
  var g = grid.map(function (r) { return r.slice(); });
  var S = {
    __grid: g, __appends: [], __writes: 0,
    getName: function () { return name; },
    getLastRow: function () { return g.length; },
    getLastColumn: function () { return g.length ? g[0].length : 0; },
    getDataRange: function () { return { getValues: function () { return g.map(function (r) { return r.slice(); }); } }; },
    appendRow: function (r) { g.push(r.slice()); S.__appends.push(r.slice()); S.__writes++; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: function () {
          var o = [];
          for (var i = 0; i < nr; i++) { var q = []; for (var j = 0; j < nc; j++) q.push((g[r - 1 + i] || [])[c - 1 + j]); o.push(q); }
          return o;
        },
        getValue: function () { return (g[r - 1] || [])[c - 1]; },
        setValue: function (v) { while (g.length < r) g.push([]); g[r - 1][c - 1] = v; S.__writes++; },
        setValues: function (v) {
          for (var i = 0; i < v.length; i++) {
            while (g.length < r + i) g.push(new Array(g[0].length).fill(''));
            for (var j = 0; j < v[i].length; j++) g[r - 1 + i][c - 1 + j] = v[i][j];
          }
          S.__writes++;
        }
      };
    }
  };
  return S;
}

var PR_HEADER = ['pricing_id', 'marketplace_sku_id', 'marketplace_id', 'company', 'sku', 'country', 'marketplace',
  'site_sku', 'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price', 'base_minimum_price',
  'base_msrp', 'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
  'regular_price', 'minimum_price', 'msrp',
  'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual',
  'price_source', 'price_status', 'created_by', 'created_at', 'updated_by', 'updated_at', 'note'];
var MP_HEADER = ['marketplace_sku_id', 'marketplace_id', 'company', 'country', 'marketplace', 'sku', 'site_sku',
  'marketplace_product_id', 'currency', 'marketplace_sku_status', 'replenishment_model', 'fulfillment_model',
  'launch_date', 'product_url', 'created_at', 'updated_at'];
var SD_HEADER = ['sku', 'category', 'series', 'selling_price', 'minimum_price', 'msrp', 'base_currency', 'amz_asin'];
var FC_HEADER = ['forecast_id', 'year', 'company', 'country', 'marketplace', 'sku', 'category', 'series',
  'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'total_fc', 'fc_share',
  'forecast_status', 'source', 'created_at', 'updated_at'];

var CREATED_AT = '2026-09-24';

/**
 * Create ONE marketplace SKU through the shipped importer and hand back the pricing row it appended.
 *
 * `noSeventyThree` drops 73_ from the world so the PRECISION_AUTHORITY_UNAVAILABLE branch can be measured
 * rather than assumed — it is the one fail-closed case that depends on how the project is deployed.
 */
function createRow(opts) {
  opts = opts || {};
  var base = opts.base || { selling: 29.99, minimum: 24.99, msrp: 39.99 };
  var sdRow = ['KM-100', 'Openers', 'Core', base.selling, base.minimum, base.msrp,
    opts.masterBaseCurrency === undefined ? 'USD' : opts.masterBaseCurrency, 'B0TEST'];
  var sd = fakeSheet('sku_details', [SD_HEADER, sdRow]);
  var mp = fakeSheet('marketplace_skus', [MP_HEADER]);
  var pr = fakeSheet('pricing_list', [opts.header || PR_HEADER]);
  var fc = fakeSheet('fc_regular_forecast', [FC_HEADER]);
  var sheets = { sku_details: sd, marketplace_skus: mp, pricing_list: pr, fc_regular_forecast: fc };
  var uuid = 0;
  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON,
    isFinite: isFinite, Date: Date, parseFloat: parseFloat, parseInt: parseInt, isNaN: isNaN, RegExp: RegExp,
    SpreadsheetApp: {
      getActiveSpreadsheet: function () { return { getSheetByName: function (n) { return sheets[n] || null; } }; },
      flush: function () {}
    },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: { formatDate: function () { return CREATED_AT; }, getUuid: function () { uuid++; return 'u' + uuid + '-abcdefgh'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    Logger: { log: function () {} },
    jsonResponse_: function (o) { return o; },
    skuRegionalLookup_: function () { return null; },
    skuRegionalSyncIdentity_: function () { return null; }
  };
  vm.createContext(S);
  if (!opts.noSeventyThree) vm.runInContext(GS73, S, { filename: '73_api_v1_pricing_write.gs' });
  vm.runInContext(GS04, S, { filename: '04_marketplace_forecast_import.gs' });

  var importRow = {
    sku: 'KM-100', company: 'KM', country: 'X', marketplace: 'Amazon', marketplace_id: 'MK',
    site_sku: 'SS', currency: opts.currency, marketplace_product_id: 'B0', product_url: 'https://e.com/x',
    marketplace_sku_status: 'Active', replenishment_model: 'FBA', launch_date: '2026-01-01'
  };
  if (opts.importRow) Object.keys(opts.importRow).forEach(function (k) { importRow[k] = opts.importRow[k]; });

  var res = S.handleImportMarketplaceSkusBatch_({
    rows: [importRow], options: { priceStatusDefault: 'draft', forecastStatusDefault: 'draft' }
  });
  var appended = pr.__appends[0];
  var o = null;
  if (appended) { o = {}; (opts.header || PR_HEADER).forEach(function (h, i) { o[h] = appended[i]; }); }
  return { res: res, row: o, world: S, skuDetails: sd, result: res && res.data && res.data.results && res.data.results[0] };
}

/** 73_'s planners, on their own, for the self-repair proof. */
var W73 = (function () {
  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON,
    isFinite: isFinite, Date: Date, RegExp: RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return {}; }, flush: function () {} },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: { formatDate: function () { return CREATED_AT; }, getUuid: function () { return 'u'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } }
  };
  vm.createContext(S);
  vm.runInContext(GS73, S, { filename: '73_api_v1_pricing_write.gs' });
  return S;
}());
function rateTable(base, quote, rate) {
  var t = W73.pricingBuildRateTable_([{ base_currency: base, quote_currency: quote, rate: rate,
    source: 'OPERATOR_INPUT', as_of: CREATED_AT }]);
  t.runDate = CREATED_AT;
  return t;
}

// =============================================================================================================
section('A · §8 THE CREATION CENSUS — ONE OWNER');
// =============================================================================================================
{
  var gsDir = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
  var creators = fs.readdirSync(gsDir).filter(function (f) { return /\.gs$/.test(f); })
    .filter(function (f) { return /prSheet\.appendRow/.test(bare(fs.readFileSync(path.join(gsDir, f), 'utf8'))); });
  eq(creators, ['04_marketplace_forecast_import.gs'],
    'A1  PRICING_LIST_CREATOR_COUNT = 1 · PRICING_LIST_CREATOR_OWNER = 04_marketplace_forecast_import.gs');
  eq((bare(GS04).match(/prSheet\.appendRow/g) || []).length, 1,
    'A1b and it appends in exactly ONE place, so the contract below has one implementation');

  // §8 — nothing in the frontend creates a row either. The one API that reaches this handler is the import.
  var jsDir = path.join(ROOT, 'assets', 'js');
  var fe = [];
  (function walk(d) {
    fs.readdirSync(d).forEach(function (f) {
      var p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) return walk(p);
      if (!/\.js$/.test(f)) return;
      var s = bare(fs.readFileSync(p, 'utf8'));
      if (/appendRow|insertPricingRow|createPricingRow/.test(s)) fe.push(path.relative(ROOT, p).replace(/\\/g, '/'));
    });
  }(jsDir));
  eq(fe, [], 'A2  no frontend file creates a pricing row');
  ok(/it does NOT create marketplace_skus \/ pricing_list/.test(readN('assets/specs/active/apps-script/03_master_data_handlers.gs')),
    'A2b and the master-data endpoint still states that it creates none');

  // The rule is a PURE function, so everything below can be measured without a spreadsheet.
  ok(/function pricingNewRowPlan_\(baseCurrency, localCurrency, base, asOf\)/.test(GS04),
    'A3  the creation rule is one pure function — pricingNewRowPlan_');
  var planSrc = GS04.slice(GS04.indexOf('function pricingNewRowPlan_'), GS04.indexOf('function handleImportMarketplaceSkusBatch_'));
  ok(!/SpreadsheetApp|getRange|appendRow|new Date\(\)/.test(planSrc),
    'A3b which takes no sheet and no clock — the as-of date is passed in');
}

// =============================================================================================================
section('B · §3 SAME-CURRENCY CREATION');
// =============================================================================================================
{
  // Every currency in the frozen precision contract, as its own base and its own site currency.
  [['USD', 2], ['CAD', 2], ['EUR', 2], ['GBP', 2], ['AUD', 2], ['JPY', 0]].forEach(function (pair) {
    var cur = pair[0], dp = pair[1];
    var c = createRow({ currency: cur, masterBaseCurrency: cur,
      base: { selling: dp ? 29.99 : 3200, minimum: dp ? 24.99 : 2900, msrp: dp ? 39.99 : 3900 } });
    eq(c.row.fx_rate, 1, 'B1  ' + cur + ' -> ' + cur + ': rate 1 — a fact about two identical currencies');
    eq(c.row.fx_rate_date, CREATED_AT, 'B1b ' + cur + ' with the creation date recorded beside it');
    eq(c.row.auto_regular_price, dp ? 29.99 : 3200, 'B2  ' + cur + ': auto_* is the base at this currency\'s precision');
    // PRICING-R4G §7 — NEW_ROW_MANUAL_OVERRIDE_INITIALIZATION = BLANK, in every currency. R4E initialised
    // the override from auto, which made every system-created row indistinguishable from one a person had
    // priced. The row still DISPLAYS the auto value; it just does not claim someone chose it.
    eq(c.row.regular_price, '', 'B3  ' + cur + ': the manual override initialises BLANK');
    eq(W73.pricingResolveEffective_(c.row, W73.PRICING_FIELDS_[0]).value, c.row.auto_regular_price,
      'B3a ' + cur + ': and the row RESOLVES to the auto value, which is what the site charges');
    eq([c.row.regular_price_is_manual, c.row.minimum_price_is_manual, c.row.msrp_is_manual],
      ['FALSE', 'FALSE', 'FALSE'], 'B4  ' + cur + ': ownership is FALSE — determinable, so it is recorded');
    eq(c.row.price_status, 'draft', 'B5  ' + cur + ': a complete row keeps the caller\'s status');
  });

  // §3 — ROUNDED. The precision table is 73_'s and is reused rather than copied.
  var jp = createRow({ currency: 'JPY', masterBaseCurrency: 'JPY', base: { selling: 3200.4, minimum: 2900, msrp: 3900 } });
  eq(jp.row.auto_regular_price, 3200, 'B6  a JPY master price of 3200.4 stores as a whole yen');
  eq(jp.row.regular_price, '', 'B6b and the override is blank, so there is no second copy to round differently');
  eq(W73.pricingResolveEffective_(jp.row, W73.PRICING_FIELDS_[0]).value, 3200,
    'B6c while the row resolves to the SAME rounded number — one rounding, one answer');
  var us = createRow({ currency: 'USD', masterBaseCurrency: 'USD', base: { selling: 29.999, minimum: 24.99, msrp: 39.99 } });
  eq(us.row.auto_regular_price, 30, 'B6c a USD master price of 29.999 stores at 2 decimals');
  ok(/typeof pricingRoundFx_ !== 'function'/.test(GS04),
    'B7  the rounder is 73_\'s, and its absence is handled rather than worked around');
  ok(bare(GS04).indexOf('Math.round') === -1,
    'B7b 04_ contains no rounding arithmetic of its own — one authority for precision, not two');

  // ... and when 73_ is NOT in the project, the row is pending rather than rounded by an invented rule.
  var noRounder = createRow({ currency: 'USD', masterBaseCurrency: 'USD', noSeventyThree: true });
  eq(noRounder.row.fx_rate, '', 'B8  with 73_ absent the row is PENDING, not rounded by a second rule');
  eq(noRounder.row.price_status, 'pending_fx', 'B8b marked pending_fx');
  ok(/PRECISION_AUTHORITY_UNAVAILABLE/.test(String(noRounder.row.note)),
    'B8c naming the deployment condition that caused it');

  // §6 case E — every base blank. The rate is still a fact; the prices are still absent.
  var blank = createRow({ currency: 'USD', masterBaseCurrency: 'USD', base: { selling: '', minimum: '', msrp: '' } });
  eq(blank.row.fx_rate, 1, 'B9  all bases blank: the rate is still 1 — it is about currencies, not prices');
  eq([blank.row.auto_regular_price, blank.row.regular_price], ['', ''],
    'B9b BLANK_BASE_NEVER_BECOMES_ZERO — blank in, blank out');
  eq([blank.row.minimum_price, blank.row.msrp], ['', ''], 'B9c for every band');
  eq([blank.row.regular_price_is_manual, blank.row.msrp_is_manual], ['FALSE', 'FALSE'],
    'B9d and ownership is still determinable: the system owns a field nobody has priced');

  // §6 case D — ONE blank base field. The other two are unaffected.
  var one = createRow({ currency: 'USD', masterBaseCurrency: 'USD', base: { selling: 29.99, minimum: '', msrp: 39.99 } });
  eq([one.row.auto_regular_price, one.row.auto_minimum_price, one.row.auto_msrp], [29.99, '', 39.99],
    'B10 one blank base leaves ONE blank auto — fields are independent');
  eq([one.row.regular_price, one.row.minimum_price, one.row.msrp], ['', '', ''],
    'B10b and three blank overrides, because a created row has none — never a zero either');
  eq(W73.PRICING_FIELDS_.map(function (sp) { return W73.pricingResolveEffective_(one.row, sp).value; }),
    [29.99, null, 39.99],
    'B10c while the RESOLVED prices are 29.99 / Not Set / 39.99 — the blank band stays Not Set, not 0');

  // A base that is present but is not a number is a DATA FAULT, reported rather than coerced. Number('') is
  // 0, and that coercion is the whole reason this contract exists.
  var junk = createRow({ currency: 'USD', masterBaseCurrency: 'USD', base: { selling: 'n/a', minimum: 24.99, msrp: 39.99 } });
  eq(junk.row.regular_price, '', 'B11 a non-numeric base price produces a BLANK override, never 0');
  ok(/not readable as a price/.test(String(junk.row.note)), 'B11b and is reported on the row');
  eq(W73.pricingResolveEffective_(junk.row, W73.PRICING_FIELDS_[0]).value, null,
    'B11c and the band RESOLVES to null — no auto was computed, so there is nothing to fall back to');
  eq([junk.row.auto_minimum_price, W73.pricingResolveEffective_(junk.row, W73.PRICING_FIELDS_[1]).value],
    [24.99, 24.99], 'B11d while its siblings are unaffected and resolve normally');
}

// =============================================================================================================
section('C · §4 CROSS-CURRENCY CREATION — FAIL-CLOSED');
// =============================================================================================================
{
  ['CAD', 'EUR', 'GBP', 'AUD', 'JPY'].forEach(function (cur) {
    var c = createRow({ currency: cur, masterBaseCurrency: 'USD' });
    eq(c.row.fx_rate, '', 'C1  USD -> ' + cur + ': NO_INVENTED_FX_RATE_1 — no rate is written at all');
    eq(c.row.fx_rate_date, '', 'C1b ' + cur + ': and no date, because no conversion happened');
    eq([c.row.auto_regular_price, c.row.auto_minimum_price, c.row.auto_msrp], ['', '', ''],
      'C2  ' + cur + ': NO_RAW_BASE_AS_LOCAL_AUTO — auto_* is blank, not the USD number relabelled');
    eq([c.row.regular_price, c.row.minimum_price, c.row.msrp], ['', '', ''],
      'C3  ' + cur + ': NO_RAW_BASE_AS_LOCAL_EFFECTIVE — the effective price is blank');
    eq([c.row.base_regular_price, c.row.base_minimum_price, c.row.base_msrp], [29.99, 24.99, 39.99],
      'C4  ' + cur + ': base_* IS written — this is what makes the row repairable');
    eq(c.row.base_currency, 'USD', 'C4b ' + cur + ': with the base currency it is denominated in');
    eq([c.row.regular_price_is_manual, c.row.minimum_price_is_manual, c.row.msrp_is_manual],
      ['FALSE', 'FALSE', 'FALSE'], 'C5  ' + cur + ': NEW_ROW_UNKNOWN_AUTHORITY_COUNT = 0 — FALSE, not blank');
    eq(c.row.price_status, 'pending_fx', 'C6  ' + cur + ': PENDING_FX is on the row, in a column');
    ok(/NO_CANONICAL_FX_RATE/.test(String(c.row.note)), 'C6b ' + cur + ': with the reason stated');
    ok(/pricing\.fxReconcile/.test(String(c.row.note)), 'C6c and the action that completes it');
    eq(c.result.pricing_pending_fx, 'NO_CANONICAL_FX_RATE',
      'C7  ' + cur + ': and the import RESULT says so, so it is not discovered later off a chart');
    ok(/PENDING_FX/.test(String(c.result.message)), 'C7b in the row\'s own message');
  });

  // §4 — THE "CANONICAL FX AVAILABLE" BRANCH DOES NOT EXIST, and that is a finding rather than an omission.
  ok(/no FX provider in this repository and\s*\n?\s*no rate table in the database/.test(DOC.replace(/\s+/g, ' ')) ||
     /no FX provider in this repository/.test(DOC),
    'C8  the spec states there is no FX provider and no rate table');
  var allGs = fs.readdirSync(path.join(ROOT, 'assets', 'specs', 'active', 'apps-script'))
    .filter(function (f) { return /\.gs$/.test(f); });
  var rateSources = allGs.filter(function (f) {
    var s = bare(readN('assets/specs/active/apps-script/' + f));
    return /getFxRate|fetchFxRate|fx_rates|FX_RATE_TABLE/.test(s);
  });
  eq(rateSources, [], 'C8b and no file anywhere offers one — the branch is unreachable by construction');
  ok(bare(GS04).indexOf('UrlFetchApp') === -1,
    'C8c 04_ looks nothing up: a rate compiled in would be a business fact frozen into a deployment');

  // The other fail-closed reasons, each measured rather than described.
  eq(createRow({ currency: 'CHF', masterBaseCurrency: 'CHF' }).row.price_status, 'pending_fx',
    'C9  a currency outside the frozen precision table fails closed');
  ok(/UNSUPPORTED_CURRENCY/.test(String(createRow({ currency: 'CHF', masterBaseCurrency: 'CHF' }).row.note)),
    'C9b as UNSUPPORTED_CURRENCY — never converted at a guessed precision');
  var noBase = createRow({ currency: 'USD', masterBaseCurrency: '', importRow: { base_currency: '' } });
  eq(noBase.row.base_currency, 'USD', 'C10 with no base currency anywhere, USD is the LAST resort');
  ok(noBase.row.fx_rate === 1, 'C10b and the row completes, because USD == USD is then a fact');
}

// =============================================================================================================
section('D · THE SELF-REPAIR — 04_\'s PENDING ROW, HANDED TO 73_');
// =============================================================================================================
{
  // This is the claim the whole design rests on: a pending row is not a dead end, and no migration is
  // needed to finish it. The row below is the REAL output of the shipped importer.
  var created = createRow({ currency: 'CAD', masterBaseCurrency: 'USD' }).row;

  var plan = W73.pricingPlanFxRow_({
    currency: created.currency, base_currency: created.base_currency,
    base_regular_price: created.base_regular_price,
    base_minimum_price: created.base_minimum_price,
    base_msrp: created.base_msrp,
    auto_regular_price: created.auto_regular_price,
    regular_price: created.regular_price,
    regular_price_is_manual: created.regular_price_is_manual,
    minimum_price_is_manual: created.minimum_price_is_manual,
    msrp_is_manual: created.msrp_is_manual
  }, rateTable('USD', 'CAD', 1.35));

  eq(plan.ok, true, 'D1  the first FX run converts the pending row');
  eq(plan.cells.auto_regular_price, 40.49, 'D2  auto_* is computed from the base the row already carried');
  // PRICING-R4G — the repair happens with NO write to the override column. The row was created with a
  // blank override, so the instant auto_regular_price holds a number the row resolves to it.
  ok(!Object.prototype.hasOwnProperty.call(plan.cells, 'regular_price'),
    'D3  AND no override is written — §6 forbids it, and there is nothing to keep in step anyway');
  eq(W73.pricingResolveEffective_({ regular_price: '', auto_regular_price: plan.cells.auto_regular_price,
    regular_price_is_manual: created.regular_price_is_manual }, W73.PRICING_FIELDS_[0]).value, 40.49,
    'D3a the row nevertheless RESOLVES to 40.49 — which is the whole self-repair, reached by reading');
  eq(plan.fields.regular_price.authority, 'AUTO', 'D3b reported as AUTO, not as UNKNOWN');
  eq(plan.cells.fx_rate, 1.35, 'D4  with the rate recorded on the row');
  ok(!Object.prototype.hasOwnProperty.call(plan.cells, 'regular_price_is_manual'),
    'D5  and no flag is written by the FX run — it did not have to be, which is the point');

  // THE COUNTERFACTUAL, and it is what R4D measured: the SAME row with blank flags cannot be repaired.
  var legacy = W73.pricingPlanFxRow_({
    currency: 'CAD', base_currency: 'USD', base_regular_price: 29.99, base_minimum_price: '', base_msrp: '',
    auto_regular_price: 29.99, regular_price: 29.99, regular_price_is_manual: ''
  }, rateTable('USD', 'CAD', 1.35));
  eq(legacy.cells.auto_regular_price, 40.49, 'D6  a LEGACY row still gets its auto value corrected');
  ok(!Object.prototype.hasOwnProperty.call(legacy.cells, 'regular_price'),
    'D6b and its effective price still cannot be — which is exactly why R4F exists and R4E is not enough');
  eq(legacy.fields.regular_price.authority, 'UNKNOWN',
    'D6c EXISTING_PRICING_ROWS_WRITTEN = 0: this round changed creation, not history');
}

// =============================================================================================================
section('E · §6 THE REGRESSION MATRIX');
// =============================================================================================================
{
  // Six pairs x the five cases §6 names, asserted as ONE table so a gap is visible rather than implied.
  var PAIRS = [['USD', 'USD'], ['USD', 'CAD'], ['USD', 'EUR'], ['USD', 'GBP'], ['USD', 'AUD'], ['USD', 'JPY']];
  var CASES = [
    { id: 'A', name: 'full base', base: { selling: 29.99, minimum: 24.99, msrp: 39.99 } },
    { id: 'D', name: 'one blank base field', base: { selling: 29.99, minimum: '', msrp: 39.99 } },
    { id: 'E', name: 'all base fields blank', base: { selling: '', minimum: '', msrp: '' } }
  ];
  var violations = [];
  PAIRS.forEach(function (p) {
    var baseCur = p[0], localCur = p[1], same = baseCur === localCur;
    CASES.forEach(function (c) {
      var r = createRow({ currency: localCur, masterBaseCurrency: baseCur, base: c.base }).row;
      var tag = baseCur + '->' + localCur + ' case ' + c.id;
      // NO_INVENTED_CROSS_CURRENCY_RATE_1
      if (!same && r.fx_rate === 1) violations.push(tag + ' : invented rate 1');
      if (same && r.fx_rate !== 1) violations.push(tag + ' : same-currency row has no rate');
      // NO_RAW_BASE_AS_LOCAL_AUTO / _EFFECTIVE — on a cross-currency row nothing may be seeded at all.
      if (!same && (r.auto_regular_price !== '' || r.regular_price !== '')) violations.push(tag + ' : seeded across currencies');
      // BLANK_BASE_NEVER_BECOMES_ZERO
      ['regular', 'minimum', 'msrp'].forEach(function (band) {
        var bk = band === 'msrp' ? 'base_msrp' : 'base_' + band + '_price';
        var ek = band === 'msrp' ? 'msrp' : band + '_price';
        var ak = band === 'msrp' ? 'auto_msrp' : 'auto_' + band + '_price';
        if (String(r[bk]).trim() === '' && (r[ek] === 0 || r[ak] === 0)) violations.push(tag + ' ' + band + ' : blank became 0');
      });
      // NEW_ROW_UNKNOWN_AUTHORITY_COUNT = 0
      if (r.regular_price_is_manual !== 'FALSE' || r.minimum_price_is_manual !== 'FALSE' || r.msrp_is_manual !== 'FALSE') {
        violations.push(tag + ' : ownership left UNKNOWN');
      }
    });
  });
  eq(violations, [], 'E1  six currency pairs x three base shapes — every §6 assertion holds');

  // Case B — a cross-currency row WITH a canonical rate. §4's other branch, and the honest answer about it.
  ok(true, 'E2  §6 case B (cross-currency with a canonical rate) is UNREACHABLE at creation — see C8/C8b. ' +
    'The rate arrives later, through pricing.fxReconcile, and section D proves that path end to end.');

  // Case C is every cross-currency case above: no canonical rate, fail-closed.
  var cases = PAIRS.filter(function (p) { return p[0] !== p[1]; }).map(function (p) {
    return createRow({ currency: p[1], masterBaseCurrency: p[0] }).row.price_status;
  });
  eq(cases, ['pending_fx', 'pending_fx', 'pending_fx', 'pending_fx', 'pending_fx'],
    'E3  §6 case C — every cross-currency creation without a rate is PENDING_FX');

  // The import branch is unchanged: a file that supplies prices is a statement by a person about a file,
  // and this round does not decide that person meant to own them.
  var imported = createRow({ currency: 'CAD', masterBaseCurrency: 'USD',
    importRow: { base_regular_price: 40.49, regular_price: 40.49, base_currency: 'CAD', fx_rate: 1 } });
  eq(imported.row.regular_price, 40.49, 'E4  an import row that supplies prices is still written verbatim');
  eq([imported.row.regular_price_is_manual, imported.row.msrp_is_manual], ['', ''],
    'E4b and its ownership is left BLANK — the file did not say who owns those numbers');
  eq(imported.row.price_source, 'import', 'E4c on the import branch, which this round did not touch');
}

// =============================================================================================================
section('F · §5 THE FC SUMMARY ZERO COERCION');
// =============================================================================================================
{
  ok(FCSUM.indexOf('function _evtRegularPrice(') === -1,
    'F1  FC_MISSING_PRICE_AS_ZERO_POST = NO — the wrapper that returned 0 for a missing price is gone');
  // Measured on CODE: the comment that replaced the function quotes the expression it removed, and an
  // assertion that cannot tell a quotation from the thing itself is not measuring anything.
  ok(!/regularPrice == null \? 0/.test(bare(FCSUM)),
    'F1b and no other expression in the file turns a missing price into zero');
  ok(/PRICING-R4E §5 — _evtRegularPrice IS GONE/.test(FCSUM),
    'F1c with the removal recorded where the function was, so it is not re-added by habit');

  // The LIVE path never had the defect, and still does not: null is MISSING.
  ok(/if \(pr\.regularPrice == null\) \{[\s\S]{0,260}priceState = 'missing_price'/.test(FCSUM),
    'F2  a missing price sets priceState = missing_price');
  ok(/placeholder = 'Missing Regular Price'/.test(FCSUM),
    'F2b and the input stays blank with a placeholder that says so');
  // §5 — genuinely numeric prices are untouched, including a real zero.
  // PRICING-R4G §11 — the lookup now reads the RESOLVED price, and the guard around it is untouched:
  // blank, non-numeric and non-positive all still produce null, and a real numeric price still passes
  // through unchanged. What moved is WHICH field is read, not what is done with the number.
  ok(/out\.regularPrice = \(resolvedPrice === '' \|\| resolvedPrice == null \|\| isNaN\(num\) \|\| num <= 0\) \? null : num;/.test(FCSUM),
    'F3  and the guard itself is unchanged — FC calculations for numeric prices are not touched');
  ok(/var resolvedPrice = row\.resolvedRegularPrice;/.test(FCSUM),
    'F3a while the field it guards is the resolved price, not the raw override cell');
}

// =============================================================================================================
section('G · §7/§9 NOTHING ELSE MOVED');
// =============================================================================================================
{
  // FX_CONTRACT_UNCHANGED — the three authority states behave exactly as R4D measured them.
  function row(flag, effective) {
    return { currency: 'CAD', base_currency: 'USD', base_regular_price: 29.99, base_minimum_price: '',
      base_msrp: '', auto_regular_price: 22.10, regular_price: effective, regular_price_is_manual: flag };
  }
  var T = W73.pricingPlanFxRow_(row('TRUE', 34.99), rateTable('USD', 'CAD', 1.35));
  var F = W73.pricingPlanFxRow_(row('FALSE', 22.10), rateTable('USD', 'CAD', 1.35));
  var U = W73.pricingPlanFxRow_(row('', 29.99), rateTable('USD', 'CAD', 1.35));
  eq([T.cells.auto_regular_price, Object.prototype.hasOwnProperty.call(T.cells, 'regular_price')],
    [40.49, false], 'G1  FX_CONTRACT_UNCHANGED — TRUE: auto refreshes, the effective price is preserved');
  eq([F.cells.auto_regular_price, Object.prototype.hasOwnProperty.call(F.cells, 'regular_price')],
    [40.49, false],
    'G1b PRICING-R4G — FALSE: auto refreshes and NO override is written. §6 applies to every authority.');
  eq([U.cells.auto_regular_price, Object.prototype.hasOwnProperty.call(U.cells, 'regular_price')],
    [40.49, false], 'G1c blank: auto refreshes, the effective price is preserved');
  [T, F, U].forEach(function (p, i) {
    eq(Object.keys(p.cells).filter(function (k) { return /_is_manual$/.test(k) || /^base_/.test(k); }), [],
      'G1d and neither a flag nor a base price is written in state ' + ['TRUE', 'FALSE', 'blank'][i]);
  });

  // PRICING_UPDATE_CONTRACT_UNCHANGED — the three modes and their refusals.
  eq(W73.PRICING_MODES_, ['NO_CHANGE', 'MANUAL', 'AUTO'], 'G2  PRICING_UPDATE_CONTRACT_UNCHANGED — three modes');
  var spec = W73.PRICING_FIELDS_[0];
  eq(W73.pricingPlanField_({ regular_price: 10, auto_regular_price: 9, regular_price_is_manual: '' },
    spec, 'NO_CHANGE', '', 'USD').changed, false, 'G2b NO_CHANGE still writes nothing');
  // PRICING-R4G §4 — AUTO IS NO LONGER REFUSED HERE, and this is the assertion R4E flagged as the one a
  // later round would have to invert. Clearing an override needs no auto value to copy, and a pending_fx
  // row — which R4E itself creates, by the hundred — has no other repair.
  var _autoOnPending = W73.pricingPlanField_({ regular_price: 10, auto_regular_price: '', regular_price_is_manual: '' },
    spec, 'AUTO', '', 'USD');
  eq([_autoOnPending.error, _autoOnPending.cells.regular_price], [null, ''],
    'G2c AUTO CLEARS with no auto value — the repair for exactly the rows this file creates');
  eq([W73.pricingReadFlag_(''), W73.pricingReadFlag_('TRUE'), W73.pricingReadFlag_('FALSE')],
    ['UNKNOWN', 'MANUAL', 'AUTO'], 'G2d and blank is still UNKNOWN on read — the schema did not move');

  // §7 — NO EXISTING ROW IS TOUCHED. 04_ only ever APPENDS a pricing row; it never rewrites one.
  // THREE in-place writes exist on this sheet and all three are in one block: the canonical product id,
  // and the two audit columns that record who touched it. Counted on the raw source, because bare() eats
  // the column names — they can only ever appear as string literals.
  var prWrites = GS04.match(/prSheet\.getRange\(/g) || [];
  eq(prWrites.length, 3,
    'G3  EXISTING_PRICING_ROWS_WRITTEN = 0 for prices — the only in-place writes are the product id and its audit pair');
  var writeCols = GS04.match(/prSheet\.getRange\(prRef\.row, ([^)]*(?:\([^)]*\))?[^)]*)\)/g) || [];
  eq(writeCols.length, 3, 'G3a and all three address a row this import already matched');
  var syncBlock = GS04.slice(GS04.indexOf('Sync resolved ASIN'), GS04.indexOf('results.push({'));
  ok(!/base_|auto_|regular_price|minimum_price|msrp|_is_manual|fx_rate/.test(syncBlock.replace(/marketplace_product_id/g, '')),
    'G3b and that sync touches no price, no flag and no rate');

  // DB_MIGRATION_REQUIRED = NO. Every column written already exists in the canonical header.
  ['regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual', 'price_status', 'fx_rate']
    .forEach(function (c) {
      ok(W73.PRICING_LIST_HEADERS_.indexOf(c) !== -1, 'G4  DB_MIGRATION_REQUIRED = NO — ' + c + ' is an existing column');
    });
  ok(/pending_fx/.test(GS04) && W73.PRICING_LIST_HEADERS_.indexOf('price_status') !== -1,
    'G4b PENDING_FX rides in price_status — a value, not a column');

  // ... and that value is safe because no consumer filters or translates that column.
  ok(/price_status_filtering: false/.test(GS72), 'G5  72_ does not filter on price_status');
  ok(/counted under that value, byte\s*\n?\s*\* for byte/.test(PSBSEL) || /byte\s+for byte/.test(PSBSEL),
    'G5b and the board counts its values byte for byte, so a new one is one more bucket');
  ok(bare(GS72).indexOf("price_status ===") === -1,
    'G5c no server-side branch compares price_status to a literal');

  // The spec records the shipped contract.
  ok(/## 4E\. Pricing Row Creation Contract \(PRICING-R4E — SHIPPED\)/.test(DOC),
    'G6  the canonical spec carries the contract — no parallel spec was created');
  ok(/IMPLEMENTED by PRICING-R4E/.test(DOC), 'G6b and R4D\'s open §7 is marked implemented rather than left open');
}

// =============================================================================================================
section('H · MUTANTS');
// =============================================================================================================
{
  function mutant(id, why, anchor, repl, probe) {
    if (GS04.indexOf(anchor) === -1) {
      fail++; console.error('HARNESS ERROR ' + id + ' — anchor not found: ' + anchor.slice(0, 70)); return;
    }
    if (GS04.split(anchor).length - 1 !== 1) {
      fail++; console.error('HARNESS ERROR ' + id + ' — anchor is not unique'); return;
    }
    var mutated = GS04.replace(anchor, function () { return repl; });
    var got;
    try {
      var saved = GS04;
      GS04 = mutated;                    // createRow reads the module-level GS04
      try { got = probe(); } finally { GS04 = saved; }
    } catch (e) { got = true; }
    if (got) { caught++; pass++; console.log('ok   ' + id + '  ' + why + ' (caught)'); }
    else { survived.push(id); fail++; console.error('FAIL ' + id + '  ' + why + ' SURVIVED'); }
  }

  // M1 — the defect itself, restored. C1/E1 stand in its way.
  mutant('M1', 'a cross-currency row is given rate 1 again',
    "  if (b !== l) { out.reason = 'NO_CANONICAL_FX_RATE'; return out; }",
    '  if (false) { return out; }',
    function () { return createRow({ currency: 'CAD', masterBaseCurrency: 'USD' }).row.fx_rate === 1; });

  // M2 — PRICING-R4G — THE SEEDING COMES BACK. R4E's mutant asked whether the seeded override came from
  // the rounded auto or the raw base, which was the right question while a row WAS seeded. Nothing is
  // seeded now, so the hazard is the assignment returning at all: a system-created row that arrives
  // holding an override is indistinguishable, a week later, from one a person priced by hand.
  mutant('M2', 'creation seeds the manual override from the computed auto value again',
    '    out.auto[k] = r;',
    '    out.auto[k] = r;\n    out.override[k] = r;',
    function () {
      return createRow({ currency: 'USD', masterBaseCurrency: 'USD' }).row.regular_price !== '';
    });

  // M3 — a blank base becomes zero. B9b/B10b and the §6 matrix stand in its way.
  mutant('M3', 'a blank base price becomes 0',
    "    if (str === '') return;                       // a blank base leaves a blank auto, and the override too",
    "    if (str === '') { out.auto[k] = 0; out.override[k] = 0; return; }",
    function () {
      var r = createRow({ currency: 'USD', masterBaseCurrency: 'USD', base: { selling: '', minimum: '', msrp: '' } }).row;
      // Either column becoming 0 is the defect: a zero auto resolves to a zero PRICE just as surely as a
      // zero override is one, which is the reason the probe watches both.
      return r.regular_price === 0 || r.auto_regular_price === 0;
    });

  // M4 — ownership is left blank at creation, which is what made the old rows unrepairable.
  mutant('M4', 'the ownership flags are left blank at creation',
    "    flag: 'FALSE', unreadable: [] };",
    "    flag: '', unreadable: [] };",
    function () { return createRow({ currency: 'USD', masterBaseCurrency: 'USD' }).row.regular_price_is_manual !== 'FALSE'; });

  // M5 — the master base_currency is ignored again. C3e in the R4D suite and C4b here stand in its way.
  mutant('M5', 'the master row base_currency is overruled by the USD constant',
    "        baseCurrency = baseCurFromMaster || baseCurFromFile || 'USD';",
    "        baseCurrency = 'USD';",
    function () { return createRow({ currency: 'EUR', masterBaseCurrency: 'EUR' }).row.base_currency !== 'EUR'; });

  // M6 — a pending row stops carrying its base, which would make it unrepairable and the fix pointless.
  mutant('M6', 'a pending row is created without its base prices',
    "        baseRegular = (sdRef.sellingPrice !== undefined ? sdRef.sellingPrice : '');",
    "        baseRegular = '';",
    function () { return createRow({ currency: 'CAD', masterBaseCurrency: 'USD' }).row.base_regular_price !== 29.99; });

  // M7 — the pending state stops being visible anywhere a machine can read it.
  mutant('M7', 'a pending row is not marked pending_fx',
    '          priceStatus = PRICING_CREATE_PENDING_STATUS_;',
    '          priceStatus = priceStatusDefault;',
    function () { return createRow({ currency: 'CAD', masterBaseCurrency: 'USD' }).row.price_status !== 'pending_fx'; });

  // M8 — an unsupported currency is converted at a guessed precision instead of failing closed.
  mutant('M8', 'an unsupported currency is accepted at a guessed precision',
    "  if (pricingDecimalsFor_(l) === null) { out.reason = 'UNSUPPORTED_CURRENCY'; return out; }",
    '  if (false) { return out; }',
    function () { return createRow({ currency: 'CHF', masterBaseCurrency: 'CHF' }).row.price_status !== 'pending_fx'; });

  // M9 — the import result stops reporting the pending row, so it is discovered later off a chart.
  mutant('M9', 'the import result does not report a pending pricing row',
    '      pricing_pending_fx: pricePending || \'\'',
    "      pricing_pending_fx: ''",
    function () { return createRow({ currency: 'CAD', masterBaseCurrency: 'USD' }).result.pricing_pending_fx !== 'NO_CANONICAL_FX_RATE'; });
}

// =============================================================================================================
console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4E CREATION CONTRACT FIX — passed ' + pass + '  failed ' + fail +
  '  mutants caught ' + caught + (survived.length ? '  SURVIVED: ' + survived.join(', ') : ''));
console.log('PRICING_LIST_CREATOR_COUNT = 1 · NO_INVENTED_FX_RATE_1 = YES · NEW_ROW_AUTHORITY = FALSE');
console.log('NEW_NON_USD_EFFECTIVE_CAN_RECEIVE_RAW_BASE = NO · EXISTING_PRICING_ROWS_WRITTEN = 0');
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
console.log(new Array(111).join('='));
process.exit(fail ? 1 : 0);
