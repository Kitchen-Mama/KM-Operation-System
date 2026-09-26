// Kitchen Mama Operation System — PRICING-R3 · FX RECONCILIATION
// =============================================================================================================
// THE ONE THING THIS ROUND DECIDES is what auto_* should contain, and the whole suite is built around the
// ways a reconciliation destroys money: by inverting the rate, by overwriting a price a person negotiated,
// by claiming a blank flag means the system owns the field, by turning a missing base price into zero, by
// rounding at the wrong precision, and by using yesterday's rate because today's was not supplied.
//
//   A  §2 the FX owner and the FROZEN direction — LOCAL = BASE x RATE, never the reciprocal
//   B  §1 the schema audit: every field R3 needs already exists, so R3 invents no column
//   C  §3 rate ingestion: rates are an INPUT with provenance, never a constant and never a guess
//   D  §4 currency mapping: the row's own currency, same-currency identity, unsupported fails closed
//   E  §5 the conversion: independent per field, and missing never becomes zero
//   F  §6 precision: reuse of the frozen table, raw vs rounded, and a deterministic stored value
//   G  §7 THE NON-REGRESSION GATE: auto_* may move, a manual or unclaimed price may not
//   H  §8 the canonical effective resolver, agreed between the server and the browser
//   I  §11 the dry run: the census, and zero writes proven by executing the handler
//   J  §13 the audit: typed change_type, FX provenance, and no row for a cell that did not change
//   K  §14 performance: physical spreadsheet calls at N = 1, 50, 100, 500
//   L  §9/§10 consumers and the Regional Details screen: unchanged, proven by source
//   M  the wiring: route, registry, manifest, contract version, release order
//   N  mutants
//
// Run: node assets/tests/pricing-r3-fx-reconciliation.test.js
// NOTE: no 'use strict' — the .gs source is eval'd.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
var GS01 = readN('assets/specs/active/apps-script/01_router.gs');
var GS63 = readN('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var GS72 = readN('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var GS04 = readN('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var GS03 = readN('assets/specs/active/apps-script/03_master_data_handlers.gs');
var GS20 = readN('assets/specs/active/apps-script/20_campaign_write_handlers.gs');
var GS58 = readN('assets/specs/active/apps-script/58_api_v1_fc_summary_workspace.gs');
var SRP_SRC = readN('assets/js/pages/sku-regional-pricing.js');
var DOC = readN('assets/specs/active/PRICING_DATABASE_MAPPING.md');
var RELORD = require('./_release-order.js');
var SRP = require('../js/pages/sku-regional-pricing.js');

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
function section(n) { console.log('\n== ' + n + ' =='); }

/** Comments AND string literals out: a file's own prose names everything it promises not to do. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

// -------------------------------------------------------------------------------------------------------------
// THE SANDBOX — the shipped .gs is EXECUTED. Physical spreadsheet calls are COUNTED separately from rows, so
// §14's claim is measured on the real handler rather than asserted about its source.
// -------------------------------------------------------------------------------------------------------------
function fakeSheet(name, grid) {
  var g = grid.map(function (r) { return r.slice(); });
  var S = {
    __grid: g, __writes: 0, __rangeWrites: 0, __cellWrites: 0, __reads: 0, __dataRangeReads: 0,
    getName: function () { return name; },
    getLastRow: function () { return g.length; },
    getLastColumn: function () { return g.length ? g[0].length : 0; },
    getDataRange: function () { S.__dataRangeReads++; S.__reads++; return { getValues: function () { return g.map(function (r) { return r.slice(); }); } }; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: function () {
          S.__reads++;
          var out = [];
          for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push((g[r - 1 + i] || [])[c - 1 + j]); out.push(row); }
          return out;
        },
        getValue: function () { S.__reads++; return (g[r - 1] || [])[c - 1]; },
        setValue: function (v) { while (g.length < r) g.push([]); g[r - 1][c - 1] = v; S.__writes++; S.__cellWrites++; },
        setValues: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            while (g.length < r + i) g.push(new Array(g[0].length).fill(''));
            for (var j = 0; j < vals[i].length; j++) g[r - 1 + i][c - 1 + j] = vals[i][j];
          }
          S.__writes++; S.__rangeWrites++;
        }
      };
    }
  };
  return S;
}

var PRICING_HEADER = ['pricing_id', 'marketplace_sku_id', 'sku', 'country', 'marketplace', 'site_sku',
  'marketplace_product_id', 'currency', 'base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp',
  'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
  'regular_price', 'minimum_price', 'msrp',
  'regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual',
  'price_source', 'price_status', 'created_by', 'created_at', 'updated_by', 'updated_at', 'note'];
var LOG_HEADER = ['log_id', 'pricing_id', 'field_name', 'old_value', 'new_value', 'change_type', 'changed_by', 'changed_at', 'change_reason'];

function priceRow(o) { return PRICING_HEADER.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; }); }
function cell(sheet, rowNumber, name) { return sheet.__grid[rowNumber - 1][PRICING_HEADER.indexOf(name)]; }

function makeWorld(src, opts) {
  opts = opts || {};
  var header = opts.legacyPriceHeader
    ? PRICING_HEADER.filter(function (h) { return !/_is_manual$/.test(h); })
    : (opts.noFxColumns ? PRICING_HEADER.filter(function (h) { return h !== 'fx_rate'; }) : PRICING_HEADER);
  var priceSheet = fakeSheet('pricing_list', [header].concat(opts.rows || []));
  var logSheet = fakeSheet('pricing_change_log', [LOG_HEADER]);
  var uuid = 0;
  var S = {
    console: console,
    Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON, isFinite: isFinite, Date: Date,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return { __ss: true }; }, flush: function () { S.__flushed = true; } },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: {
      formatDate: function () { return '2026-09-23 00:00:00'; },
      getUuid: function () { uuid++; return 'uuid-' + uuid + '-0000000000'; }
    },
    LockService: { getScriptLock: function () { return { tryLock: function () { return opts.lockFails !== true; }, releaseLock: function () {} }; } },
    prodRequireSheet_: function (ss, name) {
      if (opts.schemaThrows) { var e = new Error('PRODUCTION_SAFETY:MISSING_REQUIRED_HEADER [' + name + ']'); e.safetyToken = 'MISSING_REQUIRED_HEADER'; throw e; }
      return name === 'pricing_list' ? priceSheet : logSheet;
    },
    prodRequireColumns_: function (sheet, cols) {
      var live = sheet.__grid[0].map(String);
      var missing = cols.filter(function (c) { return live.indexOf(c) === -1; });
      if (missing.length) { var e2 = new Error('PRODUCTION_SAFETY:MISSING_REQUIRED_HEADER ' + missing.join(',')); e2.safetyToken = 'MISSING_REQUIRED_HEADER'; throw e2; }
      return true;
    },
    __price: priceSheet, __log: logSheet, __flushed: false
  };
  vm.createContext(S);
  vm.runInContext(src, S, { filename: '73_api_v1_pricing_write.gs' });
  return S;
}

var W = makeWorld(GS73);
var SPEC = W.PRICING_FIELDS_;
var REG = SPEC[0], MIN = SPEC[1], MSR = SPEC[2];

/** A well-formed one-pair rate table: USD 1 = CAD 1.35, sourced and dated. */
function rates(extra) {
  var base = [{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35, source: 'OPERATOR_INPUT', as_of: '2026-09-23' }];
  return extra ? base.concat(extra) : base;
}
function table(w, entries, runDate) {
  var t = w.pricingBuildRateTable_(entries || rates());
  t.runDate = runDate || '2026-09-23';
  return t;
}

// =============================================================================================================
section('A · §2 THE FX OWNER AND THE FROZEN DIRECTION');
// =============================================================================================================
{
  // OUTCOME B of §2: pricing_list itself owns the applied rate. The audit for outcome C is the negative —
  // there is no rate TABLE and no provider anywhere in this repository, which is why a run's rates arrive
  // with the request instead of being looked up.
  ['fx_rate', 'fx_rate_date'].forEach(function (c) {
    ok(W.PRICING_LIST_HEADERS_.indexOf(c) !== -1, 'A1  pricing_list owns ' + c + ' — the applied rate lives on the row it was applied to');
  });
  ok(/No separate FX DB table for MVP/.test(DOC),
    'A2  and the mapping spec says there is no separate FX table, so this reuses the owner rather than inventing one');

  // THE DIRECTION. A reciprocal is the one arithmetic error that yields a plausible number, so it is frozen
  // in prose AND measured as arithmetic.
  ok(/LOCAL = BASE x FX_RATE/.test(GS73), 'A3  the direction is stated in the source: LOCAL = BASE x FX_RATE');
  eq(W.pricingFxConvert_(29.99, 1.35, 'CAD').value, 40.49,
    'A4  USD 29.99 at 1.35 converts UP to CAD 40.49 — multiplied, never divided');
  ok(W.pricingFxConvert_(29.99, 1.35, 'CAD').value > 29.99,
    'A4b a rate above 1 always produces a LARGER local number; the reciprocal would produce 22.21');

  // The pair key carries direction, so USD>CAD can never satisfy a row needing CAD>USD.
  ok(W.pricingFxPairKey_('USD', 'CAD') !== W.pricingFxPairKey_('CAD', 'USD'),
    'A5  the pair key is directional — one rate never answers both ways');
  var t = table(W);
  ok(W.pricingFxRateFor_(t, 'CAD', 'USD') === null,
    'A5b a USD>CAD rate does not answer a CAD>USD row, even though both currencies are known');

  var env = W.prwEnvelope_(true, {});
  ok(env.meta.build === W.PRW_BUILD_VERSION_, 'A6  the module stamp is reported on every answer');
}

// =============================================================================================================
section('B · §1 THE SCHEMA AUDIT — R3 invents nothing');
// =============================================================================================================
{
  // Every field the reconciliation needs was already in the header contract 04_ has written since the
  // import handler existed. This is the evidence for DB_MIGRATION_REQUIRED = NO beyond PRICING-R2's.
  ['base_currency', 'base_regular_price', 'base_minimum_price', 'base_msrp', 'currency',
   'fx_rate', 'fx_rate_date', 'auto_regular_price', 'auto_minimum_price', 'auto_msrp',
   'regular_price', 'minimum_price', 'msrp'].forEach(function (c) {
    ok(W.PRICING_LIST_HEADERS_.indexOf(c) !== -1, 'B1  pricing_list already carries ' + c);
    ok(GS04.indexOf("'" + c + "'") !== -1, 'B1b and 04_ has written it since row creation: ' + c);
  });
  eq(W.PRICING_FX_COLUMNS_.filter(function (c) { return W.PRICING_LIST_HEADERS_.indexOf(c) === -1; }), [],
    'B2  every column the reconciliation validates is part of the canonical header — none is new');

  // §12 — no column added for convenience. The FX run writes only columns that already existed, plus
  // PRICING-R2's flags which it READS and never writes.
  var newCols = W.PRICING_LIST_HEADERS_.length;
  eq(newCols, PRICING_HEADER.length, 'B3  the header length is unchanged from PRICING-R2 — R3 added no column');

  // §4 of PRICING-R2, re-verified rather than assumed: the master editor still has no base_* price field,
  // so nothing about R3's base prices leaked into sku_details.
  ok(!/base_regular_price/.test(GS03) && !/base_minimum_price/.test(GS03) && !/base_msrp/.test(GS03),
    'B4  03_ (the sku_details editor) still has no base_* price column — none was invented for R3 either');
}

// =============================================================================================================
section('C · §3 RATE INGESTION — an input with provenance, never a constant');
// =============================================================================================================
{
  // NO RATE IS COMPILED IN. The frozen table in this file is PRECISION (decimal places), not prices, and
  // the difference matters: measured on code with strings and comments stripped, nothing that looks like a
  // conversion factor is present.
  var code = bare(GS73);
  var decimalsOnly = Object.keys(W.PRICING_FX_DECIMALS_).every(function (k) {
    return W.PRICING_FX_DECIMALS_[k] === 0 || W.PRICING_FX_DECIMALS_[k] === 2;
  });
  ok(decimalsOnly, 'C1  the only per-currency constant in the file is a DECIMAL COUNT (0 or 2), never a rate');
  ok(!/UrlFetchApp/.test(code), 'C2  no outbound fetch — this file never goes looking for a rate');

  var t = W.pricingBuildRateTable_(rates());
  ok(t.ok && t.byPair['USD>CAD'].rate === 1.35, 'C3  a well-formed rate table indexes by directional pair');
  eq(t.byPair['USD>CAD'].source, 'OPERATOR_INPUT', 'C3b and carries its source');
  eq(t.byPair['USD>CAD'].as_of, '2026-09-23', 'C3c and its as-of date');

  // EVERY ONE OF THESE IS A WAY TO APPLY A NUMBER NOBODY CAN ACCOUNT FOR.
  eq(W.pricingBuildRateTable_([]).errors[0].code, 'FX_RATES_REQUIRED',
    'C4  no rates at all is refused — it never falls back to a previous run');
  eq(W.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35, as_of: '2026-09-23' }]).errors[0].code,
    'FX_SOURCE_REQUIRED', 'C5  a rate with no named source is refused');
  eq(W.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35, source: 'X' }]).errors[0].code,
    'FX_AS_OF_REQUIRED', 'C6  a rate with no as-of date is refused — a stale rate must be visible as stale');
  eq(W.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 'about 1.35', source: 'X', as_of: 'd' }]).errors[0].code,
    'FX_RATE_NOT_NUMERIC', 'C7  a rate that is not a number is refused');
  eq(W.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 0, source: 'X', as_of: 'd' }]).errors[0].code,
    'FX_RATE_NOT_POSITIVE', 'C8  a zero rate is refused — it would convert every price to nothing');
  eq(W.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'USD', rate: 1.02, source: 'X', as_of: 'd' }]).errors[0].code,
    'FX_IDENTITY_RATE_INVALID', 'C9  USD to USD at anything but 1 is refused — it would silently reprice a domestic site');
  eq(W.pricingBuildRateTable_(rates([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.36, source: 'X', as_of: 'd' }])).errors[0].code,
    'FX_PAIR_DUPLICATED', 'C10 one pair supplied twice is refused — both cannot be the rate for this run');
  eq(W.pricingBuildRateTable_(rates([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.36, source: 'X', as_of: 'd' }])).byPair, {},
    'C10b and a refused table indexes NOTHING, so a partial table can never be applied');

  // The run date is supplied, not defaulted — §3 forbids a browser-clock-generated date as much as a rate.
  var w = makeWorld(GS73, { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD', base_regular_price: 10 })] });
  var noDate = w.handlePricingFxReconcile_({ rates: rates() });
  eq(noDate.error, 'RUN_DATE_REQUIRED', 'C11 a run with no run_date is refused');
  eq(w.__price.__writes, 0, 'C11b and wrote nothing');
  ok(noDate.data.required_pairs.length === 1 && noDate.data.required_pairs[0].base_currency === 'USD',
    'C12 the refusal hands back the rate-input TEMPLATE — the pairs this table actually needs');
  eq(noDate.data.required_pairs[0].rate, '', 'C12b with the rate left blank for the operator to fill');

  // An identity pair is never asked for: a domestic site must be reconcilable on a day nobody fetched a
  // currency against itself.
  var w2 = makeWorld(GS73, { rows: [priceRow({ marketplace_sku_id: 'M1', currency: 'USD', base_currency: 'USD', base_regular_price: 10 })] });
  eq(w2.pricingFxRequiredPairs_(w2.prwReadSheet_(w2.__price).rows), [],
    'C13 a same-currency row appears in NO rate template');
}

// =============================================================================================================
section('D · §4 CURRENCY MAPPING');
// =============================================================================================================
{
  // The target currency comes from the pricing row itself, which 72_ already declares the authority. It is
  // never derived from country, and this is the negative that proves it.
  ok(/pricing_list\.currency is the authority/.test(GS72),
    'D1  72_ declares pricing_list.currency the currency authority — R3 reuses that, it does not re-decide it');
  var code = bare(GS73);
  ok(!/\bcountry\b/.test(code.replace(/country: /g, '')),
    'D1b and nothing in the executable source reads `country` to pick a currency');

  var t = table(W);
  var idn = W.pricingFxRateFor_(t, 'USD', 'USD');
  eq(idn.rate, 1, 'D2  base currency equal to local currency resolves to rate 1');
  eq(idn.identity, true, 'D2b flagged as an identity, so the census can count it separately');
  eq(idn.source, 'IDENTITY', 'D2c with no supplied source — nothing was looked up');

  // UNSUPPORTED CURRENCY FAILS CLOSED FOR THE ROW. `CHF` is not in the frozen precision table, so nobody
  // knows how many decimals it stores, and a converted price at the wrong precision is a wrong price.
  eq(W.pricingDecimalsFor_('CHF'), null, 'D3  CHF is outside the frozen precision contract');
  var rowCHF = { currency: 'CHF', base_currency: 'USD', base_regular_price: 10 };
  var p = W.pricingPlanFxRow_(rowCHF, t);
  eq(p.ok, false, 'D4  a CHF row is refused');
  eq(p.skip, 'UNSUPPORTED_CURRENCY', 'D4b as UNSUPPORTED_CURRENCY');
  eq(p.cells, {}, 'D4c and plans NO cell — there is no half-converted row');

  eq(W.pricingPlanFxRow_({ currency: '', base_currency: 'USD' }, t).skip, 'MISSING_LOCAL_CURRENCY', 'D5  a row with no currency is skipped');
  eq(W.pricingPlanFxRow_({ currency: 'CAD', base_currency: '' }, t).skip, 'MISSING_BASE_CURRENCY', 'D6  a row with no base currency is skipped');
  eq(W.pricingPlanFxRow_({ currency: 'EUR', base_currency: 'USD' }, t).skip, 'MISSING_FX_RATE', 'D7  a row whose pair was not supplied is skipped');
  eq(W.pricingPlanFxRow_({ currency: 'EUR', base_currency: 'USD' }, t).pair, 'USD>EUR', 'D7b naming the pair the operator must supply');
}

// =============================================================================================================
section('E · §5 THE CONVERSION — independent per field, and missing never becomes zero');
// =============================================================================================================
{
  var t = table(W);
  // The spec's own example: a present regular, an ABSENT minimum, a present msrp.
  var row = { currency: 'CAD', base_currency: 'USD',
    base_regular_price: 29.99, base_minimum_price: '', base_msrp: 39.99,
    regular_price_is_manual: 'FALSE', minimum_price_is_manual: 'FALSE', msrp_is_manual: 'FALSE' };
  var p = W.pricingPlanFxRow_(row, t);
  eq(p.ok, true, 'E1  a row with one absent base price still converts');
  eq(p.cells.auto_regular_price, 40.49, 'E2  regular converts');
  eq(p.cells.auto_msrp, 53.99, 'E3  msrp converts');
  ok(!Object.prototype.hasOwnProperty.call(p.cells, 'auto_minimum_price'),
    'E4  and the ABSENT minimum produces NO auto value — not 0, and not a write');
  eq(p.fields.minimum_price.reason, 'BASE_MISSING', 'E4b reported as BASE_MISSING rather than converted');
  eq(p.fields.minimum_price.value, null, 'E4c the conversion of a missing base is null');

  // §12 restated as arithmetic: the four things `parseFloat(x) || 0` collapses stay four things.
  eq(W.pricingFxConvert_('', 1.35, 'CAD').value, null, 'E5  blank base -> null');
  eq(W.pricingFxConvert_('NA', 1.35, 'CAD').value, null, 'E5b NA base -> null');
  eq(W.pricingFxConvert_('NA', 1.35, 'CAD').na, true, 'E5c and NA is distinguishable from blank');
  eq(W.pricingFxConvert_(0, 1.35, 'CAD').value, 0, 'E6  a REAL zero base converts to a real zero — 0 is a price');
  eq(W.pricingFxConvert_(0, 1.35, 'CAD').present, true, 'E6b and is present, unlike a blank');
  eq(W.pricingFxConvert_('abc', 1.35, 'CAD').invalid, true, 'E7  a typo is invalid, not a price');
  eq(W.pricingFxConvert_(-5, 1.35, 'CAD').invalid, true, 'E8  a negative base is refused');

  // A field whose base is a typo does not take the other two down with it.
  var p2 = W.pricingPlanFxRow_({ currency: 'CAD', base_currency: 'USD',
    base_regular_price: 'oops', base_minimum_price: 10, base_msrp: 20 }, t);
  eq(p2.ok, true, 'E9  one invalid base does not fail the row');
  eq(p2.fields.regular_price.reason, 'BASE_INVALID', 'E9b that field is skipped with a reason');
  eq(p2.cells.auto_minimum_price, 13.5, 'E9c and the other fields convert normally');
  eq(p2.cells.auto_msrp, 27, 'E9d');

  // A MISSING BASE DOES NOT BLANK AN EXISTING AUTO. This is the decision §5's sentence does not settle:
  // blanking auto_* would, for a field whose flag says AUTO, delete the live price it is serving.
  var p3 = W.pricingPlanFxRow_({ currency: 'CAD', base_currency: 'USD', base_regular_price: '',
    auto_regular_price: 40.49, regular_price: 40.49, regular_price_is_manual: 'FALSE' }, t);
  ok(!Object.prototype.hasOwnProperty.call(p3.cells, 'auto_regular_price'),
    'E10 an absent base leaves an EXISTING auto value alone rather than erasing it');
  ok(!Object.prototype.hasOwnProperty.call(p3.cells, 'regular_price'),
    'E10b so the live price that field serves is not deleted by an empty cell');
  ok(/blanking an auto_\* would/i.test(GS73) || /BASE_MISSING rather than acted on/.test(GS73),
    'E10c and the file records that this was decided rather than overlooked');
}

// =============================================================================================================
section('F · §6 PRECISION — reused, deterministic, and never a price point');
// =============================================================================================================
{
  // REUSED, NOT REDEFINED: PRICING-R2 froze the table and R3 is the round that finally converts against it.
  eq(W.PRICING_FX_DECIMALS_.JPY, 0, 'F1  JPY stores 0 decimals');
  eq(W.PRICING_FX_DECIMALS_.CAD, 2, 'F1b CAD stores 2');
  var t2 = W.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'JPY', rate: 147.238, source: 'S', as_of: 'd' }]);
  var jpy = W.pricingFxConvert_(29.99, 147.238, 'JPY');
  eq(jpy.raw, 29.99 * 147.238, 'F2  FX_RAW_VALUE is the unrounded product');
  eq(jpy.value, Math.round(29.99 * 147.238), 'F3  FX_ROUNDED_VALUE is the raw value at JPY precision — a whole yen');
  ok(jpy.value % 1 === 0, 'F3b and stores no decimal at all');

  var cad = W.pricingFxConvert_(29.99, 1.35, 'CAD');
  eq(cad.value, 40.49, 'F4  CAD rounds to 2 decimals');
  ok(String(cad.value).split('.')[1].length <= 2, 'F4b storing no more than the currency can hold');

  // ROUNDING_OWNER — one function, and it is the one PRICING-R2 froze.
  ok(/pricingRoundFx_/.test(bare(GS73)), 'F5  the rounding owner is pricingRoundFx_');
  var roundHits = (bare(GS73).match(/Math\.round/g) || []).length;
  ok(roundHits <= 3, 'F5b and rounding is not scattered — at most three Math.round in the whole file', roundHits);

  // DETERMINISTIC: the same input always stores the same number.
  var a = W.pricingFxConvert_(19.99, 1.3456, 'CAD').value;
  var b = W.pricingFxConvert_(19.99, 1.3456, 'CAD').value;
  eq(a, b, 'F6  the stored value is deterministic');

  // NO PSYCHOLOGICAL PRICING. A conversion that landed on .99 would be a commercial claim nobody approved.
  var ends = [];
  for (var i = 1; i <= 40; i++) {
    var v = W.pricingFxConvert_(i + 0.5, 1.37, 'CAD').value;
    ends.push(Math.round((v - Math.floor(v)) * 100));
  }
  var allNinetyNine = ends.every(function (e) { return e === 99 || e === 95; });
  ok(!allNinetyNine, 'F7  converted values are not forced to .99 / .95 — this is arithmetic, not price optimization');
  var code = bare(GS73);
  ok(!/0\.99|0\.95|\.99\b/.test(code), 'F7b and no psychological price point appears in the executable source');
}

// =============================================================================================================
section('G · §7 THE NON-REGRESSION GATE — auto may move, an owned or unclaimed price may not');
// =============================================================================================================
{
  var t = table(W);

  // THE SPEC'S OWN EXAMPLE, executed. Regular is manual at 34.99; minimum and msrp are explicitly auto.
  var row = { currency: 'CAD', base_currency: 'USD',
    base_regular_price: 29.99, base_minimum_price: 20, base_msrp: 39.99,
    auto_regular_price: 38, auto_minimum_price: 26, auto_msrp: 50,
    regular_price: 34.99, minimum_price: '', msrp: '',
    regular_price_is_manual: 'TRUE', minimum_price_is_manual: 'FALSE', msrp_is_manual: 'FALSE' };
  var p = W.pricingPlanFxRow_(row, t);

  eq(p.cells.auto_regular_price, 40.49, 'G1  auto_regular_price IS refreshed although the field is manual — it is the system REFERENCE');
  ok(!Object.prototype.hasOwnProperty.call(p.cells, 'regular_price'),
    'G2  and regular_price is NOT planned — 34.99 stands exactly as the operator left it');
  eq(p.cells.auto_minimum_price, 27, 'G3  minimum auto converts');
  // PRICING-R4G §6 — AND NO OVERRIDE COLUMN IS WRITTEN, for this field or any other. R3 wrote the
  // effective minimum here because a FALSE field was DEFINED to equal auto_*, so leaving it behind broke
  // an invariant. There is no such invariant now: this field has no override, so it RESOLVES through
  // auto_* on every read and the reconciliation's job ends when auto_* is right.
  ok(!Object.prototype.hasOwnProperty.call(p.cells, 'minimum_price'),
    'G3b and the minimum OVERRIDE is not written — it is blank, so the row resolves through auto');
  eq(p.cells.auto_msrp, 53.99, 'G4  msrp auto converts');
  ok(!Object.prototype.hasOwnProperty.call(p.cells, 'msrp'),
    'G4b nor the msrp override');
  eq(Object.keys(p.cells).filter(function (k) { return /^(regular_price|minimum_price|msrp)$/.test(k); }), [],
    'G4c FX_WRITES_MANUAL_OVERRIDE_COUNT = 0 — measured over the whole planned row, not field by field');

  // A MANUAL REGULAR MUST NOT FREEZE ITS SIBLINGS. The property survives the contract change; what proves
  // it changed from "the sibling was written" to "the sibling's DISPLAYED price moves", which is the thing
  // the operator actually cares about and is now reached without a write.
  ok(p.fields.minimum_price.resolved_follows === true && p.fields.msrp.resolved_follows === true,
    'G5  a manual Regular does not lock Minimum or MSRP — their resolved prices follow the new auto');
  ok(p.fields.regular_price.resolved_follows === false,
    'G5a while the manual Regular does not follow, because an override is exactly what stops it');

  // UNKNOWN IS NOT AUTO, AND IT IS NOT MANUAL EITHER. Every legacy row is in this state.
  var legacy = { currency: 'CAD', base_currency: 'USD', base_regular_price: 29.99,
    auto_regular_price: 38, regular_price: 34.99, regular_price_is_manual: '' };
  var pl = W.pricingPlanFxRow_(legacy, t);
  eq(pl.cells.auto_regular_price, 40.49, 'G6  a row with an UNKNOWN flag still gets its auto REFERENCE refreshed');
  ok(!Object.prototype.hasOwnProperty.call(pl.cells, 'regular_price'),
    'G7  and its effective price is NOT touched — nobody has said the system owns it');
  eq(pl.fields.regular_price.authority, 'UNKNOWN', 'G7b the authority is reported as UNKNOWN, not resolved');

  // AUTO_REFERENCE_REFRESH IS NOT AUTHORITY_CLASSIFICATION — the run NEVER writes a flag. This is the
  // single most important negative in the suite: a run that wrote FALSE into every blank flag would
  // classify the entire price book in one call.
  [REG, MIN, MSR].forEach(function (s) {
    ok(!Object.prototype.hasOwnProperty.call(p.cells, s.flag), 'G8  no ownership flag is written: ' + s.flag);
    ok(!Object.prototype.hasOwnProperty.call(pl.cells, s.flag), 'G8b not even over a blank one: ' + s.flag);
  });
  var code = bare(GS73);
  var fxSection = code.slice(code.indexOf('function pricingPlanFxRow_'));
  ok(!/pricingWriteFlag_/.test(fxSection),
    'G9  pricingWriteFlag_ is not called anywhere in the reconciliation — the flags are read-only to FX');
  ok(!/price_source/.test(fxSection),
    'G9b and the legacy row-level column is not written either');

  // THE PRE-WRITE AUDIT — a second opinion, taken from the raw flag cell rather than from the plan.
  var w = makeWorld(GS73, { rows: [
    priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD',
      base_regular_price: 29.99, auto_regular_price: 38, regular_price: 34.99, regular_price_is_manual: 'TRUE' })] });
  var st = w.prwReadSheet_(w.__price);
  var batch = w.pricingPlanFxBatch_(st.rows, table(w));
  var build = w.pricingFxBuildColumns_(st, batch.plans);
  eq(build.violations, [], 'G10 the pre-write audit finds no violation on a clean plan');
  var effCol = build.columns.filter(function (c) { return c.name === 'regular_price'; });
  eq(effCol.length, 0, 'G10b and regular_price is not even among the columns to be written');
}

// =============================================================================================================
section('H · §8 THE CANONICAL EFFECTIVE RESOLVER — one rule, two runtimes');
// =============================================================================================================
{
  // THE RULE PRICING-R2 FROZE, REUSED VERBATIM: the EFFECTIVE value is the STORED field. auto_* sits beside
  // it and is never resolved from it — because for an UNKNOWN row that substitution would be a
  // reclassification carried out through the screen instead of through the schema.
  // PRICING-R4G — TWO ROWS OF THIS TABLE CHANGED, AND THEY ARE THE WHOLE ROUND. A blank override now
  // resolves to auto whatever the flag says, because the blank cell ITSELF is the statement that no
  // override exists. Nothing else moved: a stored value still wins, a real zero is still a price, and the
  // authority column is unchanged throughout — the flag is still READ, it just no longer decides.
  var TRUTH = [
    // flag,      stored,  auto,  expected value, expected authority
    ['TRUE',        34.99,  40.49, 34.99, 'MANUAL'],
    ['FALSE',       40.49,  40.49, 40.49, 'AUTO'],
    ['',            34.99,  40.49, 34.99, 'UNKNOWN'],   // the legacy row: its override stands, untouched
    ['',               '',  40.49, 40.49, 'UNKNOWN'],   // CHANGED — no override, so auto answers
    ['TRUE',           '',  40.49, 40.49, 'MANUAL'],    // CHANGED — a claim with no value is not a value
    ['FALSE',          '',  40.49, 40.49, 'AUTO'],      // unchanged, and now it is the general case
    ['FALSE',           0,  40.49,     0, 'AUTO'],      // a real zero is a price, not a missing value
    ['',                0,  40.49,     0, 'UNKNOWN']
  ];
  TRUTH.forEach(function (c, i) {
    var row = { regular_price: c[1], auto_regular_price: c[2], regular_price_is_manual: c[0] };
    var r = W.pricingResolveEffective_(row, REG);
    eq([r.value, r.authority], [c[3], c[4]], 'H1.' + i + ' server resolver: flag=' + JSON.stringify(c[0]) + ' stored=' + JSON.stringify(c[1]));
  });

  // THE BROWSER AGREES, CASE FOR CASE. Two runtimes, one rule — and the agreement is measured rather than
  // assumed, because a resolver that disagrees with the screen beside it is a second pricing authority.
  TRUTH.forEach(function (c, i) {
    var browserRow = { raw: { regular_price: c[1], auto_regular_price: c[2], regular_price_is_manual: c[0] } };
    var spec = SRP.FIELDS[0];
    var v = SRP.fieldView(browserRow, spec);
    var serverRow = { regular_price: c[1], auto_regular_price: c[2], regular_price_is_manual: c[0] };
    var s = W.pricingResolveEffective_(serverRow, REG);
    eq(v.owner, s.authority, 'H2.' + i + ' browser and server agree on AUTHORITY');
    // PRICING-R4G — AND NOW ON THE PRICE ITSELF, case for case. Under R3 the two deliberately differed:
    // the browser showed the stored cell and the server substituted in one defined case, so the comparison
    // had to model the difference. The models have converged, so the comparison is a plain equality — and
    // that is a much stronger check, because there is nothing left for it to excuse.
    eq(v.resolved, s.value, 'H2b.' + i + ' browser and server RESOLVE to the same price');
    eq(v.override, c[1] === '' || c[1] === null ? null : c[1],
      'H2c.' + i + ' and the browser still reports the raw override separately');
  });

  ok(/USER OVERRIDES/.test(SRP_SRC), 'H3  the browser module states the rule it is implementing');

  // PRICING-R4G — `writable_by_fx` IS GONE, and its absence is the assertion. It named the one thing the
  // resolver was consulted for; after §6 an FX run writes no override column under any authority, so a
  // property claiming a field was "writable by FX" could only mislead whoever read it next.
  // bare(), not the raw source: the resolver's own comment NAMES the removed property so a reader can
  // find out what happened to it, and a substring search reads that explanation as the thing itself.
  ok(!/writable_by_fx/.test(bare(GS73)),
    'H4  writable_by_fx is gone — FX writes no override, so nothing is writable by it');
  ok(/`writable_by_fx` is gone with it/.test(GS73),
    'H4a and the file says where it went, so the stamp is not a silent deletion');
  eq([W.pricingResolveEffective_({ regular_price_is_manual: 'FALSE' }, REG).authority,
    W.pricingResolveEffective_({ regular_price_is_manual: 'TRUE' }, REG).authority,
    W.pricingResolveEffective_({ regular_price_is_manual: '' }, REG).authority],
    ['AUTO', 'MANUAL', 'UNKNOWN'],
    'H4b the authority is still REPORTED in all three states — the editor shows it; nothing decides on it');
}

// =============================================================================================================
section('I · §11 THE DRY RUN — the census, and zero writes proven by executing');
// =============================================================================================================
{
  var rows = [
    // a manual regular with two auto siblings, converting
    priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD',
      base_regular_price: 29.99, base_minimum_price: 20, base_msrp: 39.99,
      auto_regular_price: 38, auto_minimum_price: 26, auto_msrp: 50,
      regular_price: 34.99, minimum_price: 26, msrp: 50,
      regular_price_is_manual: 'TRUE', minimum_price_is_manual: 'FALSE', msrp_is_manual: 'FALSE' }),
    // a same-currency row
    priceRow({ pricing_id: 'P2', marketplace_sku_id: 'M2', currency: 'USD', base_currency: 'USD',
      base_regular_price: 29.99, regular_price_is_manual: 'FALSE' }),
    // a legacy row: every flag blank
    priceRow({ pricing_id: 'P3', marketplace_sku_id: 'M3', currency: 'CAD', base_currency: 'USD',
      base_regular_price: 10, regular_price: 12 }),
    // an unsupported currency
    priceRow({ pricing_id: 'P4', marketplace_sku_id: 'M4', currency: 'CHF', base_currency: 'USD', base_regular_price: 10 }),
    // a pair nobody supplied
    priceRow({ pricing_id: 'P5', marketplace_sku_id: 'M5', currency: 'EUR', base_currency: 'USD', base_regular_price: 10 }),
    // a duplicate identity
    priceRow({ pricing_id: 'P6', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD', base_regular_price: 10 })
  ];
  var w = makeWorld(GS73, { rows: rows });
  var res = w.handlePricingFxReconcile_({ dry_run: true, run_date: '2026-09-23', rates: rates() });

  ok(res.success, 'I1  the dry run succeeds');
  eq(res.data.dry_run, true, 'I1b and reports itself as a dry run');
  eq(w.__price.__writes, 0, 'I2  ZERO physical writes to pricing_list');
  eq(w.__log.__writes, 0, 'I2b ZERO rows in the change log');

  var c = res.data.census;
  eq(c.PRICING_ROWS_TOTAL, 6, 'I3  PRICING_ROWS_TOTAL');
  eq(c.SAME_CURRENCY_ROWS, 1, 'I4  SAME_CURRENCY_ROWS');
  eq(c.FX_CONVERTIBLE_ROWS, 2, 'I5  FX_CONVERTIBLE_ROWS');
  eq(c.UNSUPPORTED_CURRENCY_ROWS, 1, 'I6  UNSUPPORTED_CURRENCY_ROWS');
  eq(c.MISSING_FX_RATE_ROWS, 1, 'I7  MISSING_FX_RATE_ROWS');
  eq(c.DUPLICATE_IDENTITY_ROWS, 1, 'I8  DUPLICATE_IDENTITY_ROWS');
  // Five of six: P1 has all three flags set. The DUPLICATE row is counted too — the census describes the
  // TABLE, and a row the run cannot write is still a row whose owner nobody recorded.
  eq(c.UNKNOWN_AUTHORITY_ROWS, 5, 'I9  UNKNOWN_AUTHORITY_ROWS counts every row with any blank flag, skipped ones included');
  eq(c.MANUAL_REGULAR_PRESERVED, 1, 'I10 MANUAL_REGULAR_PRESERVED');
  eq(res.data.manual_fields_overwritten, 0, 'I11 manual_fields_overwritten = 0');
  eq(c.BASE_REGULAR_PRESENT, 6, 'I12 BASE_REGULAR_PRESENT counts every row, including skipped ones');
  eq(c.BASE_MINIMUM_PRESENT, 1, 'I12b BASE_MINIMUM_PRESENT');

  // BOTH halves of a duplicate identity are skipped: converting the first would hide the duplicate.
  var dupSkips = res.data.skipped.filter(function (s) { return s.reason === 'DUPLICATE_IDENTITY'; });
  eq(dupSkips.length, 1, 'I13 the second row of a duplicated identity is skipped');
  ok(dupSkips[0].first_seen_row, 'I13b naming the row it collides with');

  // THE REAL RUN APPLIES EXACTLY WHAT THE DRY RUN COUNTED. Same builder, same summary shape.
  var w2 = makeWorld(GS73, { rows: rows });
  var real = w2.handlePricingFxReconcile_({ dry_run: false, run_date: '2026-09-23', rates: rates(), changed_by: 'op' });
  ok(real.success, 'I14 the real run succeeds');
  eq(real.data.census, res.data.census, 'I15 and its census is identical to the dry run that preceded it');
  eq(real.data.manual_fields_overwritten, 0, 'I16 manual_fields_overwritten = 0 on the real run too');

  // THE MANUAL PRICE SURVIVED, READ BACK OFF THE SHEET.
  eq(cell(w2.__price, 2, 'regular_price'), 34.99, 'I17 the manual regular price is still 34.99 after the run');
  eq(cell(w2.__price, 2, 'auto_regular_price'), 40.49, 'I18 while its auto REFERENCE was refreshed to 40.49');
  eq(cell(w2.__price, 2, 'regular_price_is_manual'), 'TRUE', 'I19 and its flag is untouched');
  eq(cell(w2.__price, 4, 'regular_price'), 12, 'I20 the LEGACY row keeps its price — an unknown owner is not the system');
  eq(cell(w2.__price, 4, 'auto_regular_price'), 13.5, 'I21 with its auto reference refreshed');
  eq(cell(w2.__price, 4, 'regular_price_is_manual'), '', 'I22 and its flag still blank — nothing was classified');
  // PRICING-R4G §6 — the AUTO minimum's OVERRIDE CELL IS UNTOUCHED. It held 26 before the run and holds
  // 26 after, because an FX run writes no override column. What the site displays did move: the cell is
  // not blank here, so this row is one an operator would clear with Use Auto Price if they wanted it to
  // track. The row below is the one that proves tracking works.
  eq(cell(w2.__price, 2, 'minimum_price'), 26, 'I23 the minimum OVERRIDE is left exactly as it was found');
  eq(cell(w2.__price, 2, 'auto_minimum_price'), 27, 'I23a while its auto reference moved to the new rate');
  eq(cell(w2.__price, 5, 'auto_regular_price'), '', 'I24 the CHF row was not converted at all');
  eq(cell(w2.__price, 5, 'fx_rate'), '', 'I24b and got no rate stamped on it');
  eq(cell(w2.__price, 3, 'fx_rate'), 1, 'I25 the same-currency row recorded rate 1');

  // DRY RUN IS THE DEFAULT. A forgotten parameter must count, never reprice.
  var w3 = makeWorld(GS73, { rows: rows });
  var def = w3.handlePricingFxReconcile_({ run_date: '2026-09-23', rates: rates() });
  eq(def.data.dry_run, true, 'I26 omitting dry_run gives a DRY RUN');
  eq(w3.__price.__writes, 0, 'I26b which wrote nothing');

  // RULE S0-2 — a pre-migration sheet refuses with zero mutation. This is the state every project is in.
  var w4 = makeWorld(GS73, { legacyPriceHeader: true, rows: [] });
  var ref = w4.handlePricingFxReconcile_({ dry_run: false, run_date: '2026-09-23', rates: rates() });
  eq(ref.success, false, 'I27 a pricing_list without the ownership flags refuses');
  eq(ref.error, 'MISSING_REQUIRED_HEADER', 'I27b with the production-safety token');
  eq(w4.__price.__writes, 0, 'I27c having written nothing');
}

// =============================================================================================================
section('J · §13 THE AUDIT — typed, provenanced, and silent about what did not change');
// =============================================================================================================
{
  var w = makeWorld(GS73, { rows: [
    priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD',
      base_regular_price: 29.99, base_minimum_price: 20,
      auto_regular_price: 40.49,            // ALREADY correct — must produce no log row
      auto_minimum_price: 26,               // will move to 27
      regular_price: 40.49, minimum_price: 26,
      regular_price_is_manual: 'FALSE', minimum_price_is_manual: 'FALSE' })] });
  var r = w.handlePricingFxReconcile_({ dry_run: false, run_date: '2026-09-23', rates: rates(), changed_by: 'op' });
  ok(r.success, 'J1  the run succeeds');

  var logRows = w.__log.__grid.slice(1);
  var fields = logRows.map(function (l) { return l[LOG_HEADER.indexOf('field_name')]; }).sort();
  // PRICING-R4G — ONE log row, not two. R3 logged the auto that moved AND the effective that followed it,
  // because both were writes. Only one is a write now, and the audit log records writes: a displayed price
  // that changed because its auto reference moved leaves no row here, and should not, because no cell was
  // touched and there is nothing to undo.
  eq(fields, ['auto_minimum_price'],
    'J2  exactly one log row: the auto value that moved. Nothing followed it into a cell.');
  ok(fields.indexOf('auto_regular_price') === -1,
    'J3  the auto value that was ALREADY correct produced NO log row — an unchanged cell is not a change');

  var types = logRows.map(function (l) { return l[LOG_HEADER.indexOf('change_type')]; });
  ok(types.every(function (t) { return t === 'AUTO_FX_REFRESH'; }),
    'J4  every row is typed AUTO_FX_REFRESH — the token PRICING-R2 froze, reused rather than renamed');
  ok(W.PRICING_CHANGE_TYPES_.indexOf('AUTO_FX_REFRESH') !== -1, 'J4b and it is in the frozen vocabulary');

  // §13 — enough to reconstruct the run without joining anything.
  var reason = logRows[0][LOG_HEADER.indexOf('change_reason')];
  ok(/2026-09-23/.test(reason), 'J5  the log carries the RUN DATE');
  ok(/USD>CAD/.test(reason), 'J5b the CURRENCY PAIR');
  ok(/@1\.35/.test(reason), 'J5c the RATE');
  ok(/src=OPERATOR_INPUT/.test(reason), 'J5d and the SOURCE');
  eq(logRows[0][LOG_HEADER.indexOf('old_value')], '26', 'J6  with the old value');
  eq(logRows[0][LOG_HEADER.indexOf('new_value')], '27', 'J6b and the new one');
  eq(logRows[0][LOG_HEADER.indexOf('changed_by')], 'op', 'J7  and who ran it');

  // A run that changes nothing writes no audit at all.
  var w2 = makeWorld(GS73, { rows: [
    priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD',
      base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 40.49,
      regular_price_is_manual: 'FALSE', fx_rate: 1.35, fx_rate_date: '2026-09-23' })] });
  w2.handlePricingFxReconcile_({ dry_run: false, run_date: '2026-09-23', rates: rates() });
  eq(w2.__log.__grid.length - 1, 0, 'J8  a run that moves nothing writes no log rows');
}

// =============================================================================================================
section('K · §14 PERFORMANCE — physical calls scale with COLUMNS, not with SKUs');
// =============================================================================================================
{
  function runN(n) {
    var rows = [];
    for (var i = 0; i < n; i++) {
      rows.push(priceRow({ pricing_id: 'P' + i, marketplace_sku_id: 'M' + i, currency: 'CAD', base_currency: 'USD',
        base_regular_price: 10 + i, base_minimum_price: 5 + i, base_msrp: 20 + i,
        regular_price_is_manual: 'FALSE', minimum_price_is_manual: 'FALSE', msrp_is_manual: 'FALSE' }));
    }
    var w = makeWorld(GS73, { rows: rows });
    var r = w.handlePricingFxReconcile_({ dry_run: false, run_date: '2026-09-23', rates: rates(), changed_by: 'op' });
    return { w: w, r: r, rangeWrites: w.__price.__rangeWrites, cellWrites: w.__price.__cellWrites,
      dataRangeReads: w.__price.__dataRangeReads, logWrites: w.__log.__rangeWrites };
  }
  var m = {};
  [1, 50, 100, 500].forEach(function (n) { m[n] = runN(n); });

  [1, 50, 100, 500].forEach(function (n) {
    eq(m[n].cellWrites, 0, 'K1.' + n + '  N=' + n + ': ZERO per-cell writes');
    eq(m[n].dataRangeReads, 1, 'K2.' + n + '  N=' + n + ': the sheet is read ONCE, never once per row');
    eq(m[n].logWrites, 1, 'K3.' + n + '  N=' + n + ': the whole audit is ONE range write');
  });
  // THE PROPERTY, not a magic number: the cost of N=500 equals the cost of N=1.
  eq(m[500].rangeWrites, m[1].rangeWrites,
    'K4  500 rows cost exactly as many range writes as 1 row — the cost is bounded by COLUMNS');
  ok(m[1].rangeWrites <= 12, 'K4b and that constant is small', m[1].rangeWrites);
  ok(m[500].r.success && m[500].r.data.rows_written === 500, 'K5  and all 500 rows were actually written');
  eq(cell(m[500].w.__price, 501, 'auto_regular_price'), Math.round((10 + 499) * 1.35 * 100) / 100,
    'K6  including the last one, converted correctly');

  // The runaway guard exists and is not a page-sized ceiling.
  ok(W.PRW_FX_MAX_ROWS_ >= 10000, 'K7  the row guard is a runaway guard, not a batch size', W.PRW_FX_MAX_ROWS_);
}

// =============================================================================================================
section('L · §9/§10 CONSUMERS AND THE SCREEN — unchanged, and proven as a negative');
// =============================================================================================================
{
  // §9 — R2 reported no consumer reads auto_* or a flag. R3 is the round that could have changed that, so
  // the census is re-taken against the source rather than carried forward on trust.
  // 04_ is deliberately NOT in this list, and the reason is the distinction §9 turns on: it NAMES auto_*
  // because it CREATES the pricing row and seeds those columns once, which is not a reader resolving a
  // price from a reference value. It gets the assertion that actually applies to it, below.
  // PRICING-R4G — 72_ LEFT THIS LIST, and leaving it is the whole R4G round rather than an exception to
  // R3. The check below asks "did anybody grow a private fallback beside the canonical resolver", and that
  // is still exactly the right question for every file in it. 72_ no longer answers it, because it now
  // CALLS the canonical resolver — which is the opposite of a private fallback and is asserted as such at
  // L2 below. The other three are untouched and the negative still holds for them.
  var CONSUMERS = [
    ['58_ FC Summary workspace', GS58],
    ['20_ campaign write handlers', GS20],
    ['03_ master data handlers', GS03]
  ];
  CONSUMERS.forEach(function (c) {
    var code = bare(c[1]);
    ok(!/auto_regular_price|auto_minimum_price|auto_msrp/.test(code),
      'L1  ' + c[0] + ' does not read auto_* — no consumer gained a fallback');
    ok(!/regular_price_is_manual|minimum_price_is_manual|msrp_is_manual/.test(code),
      'L1b ' + c[0] + ' does not read an ownership flag — ownership never sits between a reader and a price');
  });
  // 04_ — THE ROW CREATOR. What matters for §9 is that it never RESOLVES a price from auto_*.
  //
  // R3 deliberately left the creator alone: its MVP fallback wrote fx_rate = 1 and copied the base prices
  // into auto_* whatever the site currency was, and R3's position was that this is the stale reference a
  // reconciliation exists to rebuild — reconcile over it rather than grow a second FX implementation inside
  // the importer. PRICING-R4D then measured what that actually cost: the same fallback copied auto_* into
  // the EFFECTIVE price and left the ownership flags blank, so the reconciliation could rebuild the
  // reference and was forbidden to repair the price the site was serving. PRICING-R4E fixed the creator.
  //
  // R3's own claim is unaffected and is what this now asserts: the importer still performs NO conversion.
  // It writes rate 1 only where the currencies are identical — which is not FX — and fails closed otherwise.
  ok(!/fxRate = 1;/.test(GS04),
    'L1c 04_ no longer seeds fx_rate = 1 unconditionally — PRICING-R4E closed that at the creator');
  ok(/if \(b !== l\) \{ out\.reason = 'NO_CANONICAL_FX_RATE'; return out; \}/.test(GS04),
    'L1c1 a cross-currency row is created with no rate at all, rather than with an invented one');
  ok(!/\* *rate|rate *\*/.test(bare(GS04)),
    'L1c2 and the importer still performs NO conversion — there is no second FX implementation in it');
  ok(GS04.indexOf('PRICING-R3') === -1, 'L1d and R3 itself still did not touch the creator — R4E did');
  // AND THIS ONE STILL COVERS 72_, because it is the check that survives the change: `manual || auto`
  // written out by hand is forbidden in every file, INCLUDING the one that now resolves properly. Calling
  // pricingResolveEffective_ is not this pattern; reimplementing it beside the call would be.
  var fallback = /(regular_price|minimum_price|msrp)\s*\|\|\s*\w*[Aa]uto/;
  [['72_', GS72], ['58_', GS58], ['20_', GS20], ['04_', GS04], ['03_', GS03]].forEach(function (c) {
    ok(!fallback.test(bare(c[1])),
      'L1e ' + c[0] + ' contains no effective-to-auto fallback expression — nobody reinvented manual || auto');
  });

  // PRICING-R4G — THE CUTOVER R3 SAID WAS NOT NEEDED. R3's position was that 72_ could stay as it was
  // because the field consumers read was the field the reconciliation maintained. R4G ended that: the
  // reconciliation maintains auto_* and maintains nothing else, so a transport projecting the override
  // cell projects a field FX no longer touches — which is correct for an override and wrong for a price.
  ok(/regular_price: price \? bands\.regular_price\.resolved : null/.test(GS72),
    'L2  72_ projects the RESOLVED price, and the resolution is done by the canonical server resolver');
  ok(/pricingResolveEffective_\(priceRow, spec\)/.test(GS72),
    'L2a by CALLING it — there is no second copy of the rule in the read owner');
  ok(/resolved_regular_price:/.test(GS72) && /auto_regular_price:/.test(GS72) && /override_regular_price:/.test(GS72),
    'L2b and it publishes all three layers separately, so no consumer has to guess which one it holds');
  ok(GS72.indexOf('PRICING-R3') === -1, 'L2b and 72_ was not touched by this round at all');

  // §10 — the Regional Details screen already shows everything R3 requires, so nothing was duplicated to
  // satisfy the requirement.
  ok(/FX Rate/.test(SRP_SRC) && /FX Date/.test(SRP_SRC) && /Currency/.test(SRP_SRC),
    'L3  the screen shows Currency, FX Rate and FX Date');
  SRP.FIELDS.forEach(function (s) {
    ok(SRP_SRC.indexOf(s.label) !== -1, 'L3b and names ' + s.label);
  });
  ok(/srd-own--unknown|OWNER_UNKNOWN/.test(SRP_SRC), 'L4  with a distinct state for an unclaimed field');
  ok(SRP_SRC.indexOf('PRICING-R3') === -1, 'L5  and the browser was not changed by this round — §8 reuses R2\'s rule verbatim');
}

// =============================================================================================================
section('M · THE WIRING');
// =============================================================================================================
{
  // PRICING-R4E — the release took its sub-round id when 04_ joined the same unshipped set.
  var R22 = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R24';

  // ROUTED, and from the WRITE half only — a reconciliation must not be reachable by a pasted URL.
  var routerCode = bare(GS01);
  eq((routerCode.match(/handlePricingFxReconcile_/g) || []).length, 1,
    'M1  the router calls the FX handler exactly once');
  ok(!/'pricing\.fxReconcile':/.test(GS01), 'M1b and it is not in the GET read table');
  ok(/pricing\.fxReconcile/.test(GS01), 'M1c the action is named in the router');

  // ONE WRITER INTO pricing_list — the invariant PRICING-R2 established and R3 had to not break.
  var writers = ['01_router.gs', '73_api_v1_pricing_write.gs'];
  ok(/handlePricingFxReconcile_/.test(GS73), 'M2  the handler lives in 73_, the existing write owner');
  ok(!/handlePricingFxReconcile_/.test(GS72) && !/handlePricingFxReconcile_/.test(GS04),
    'M2b and nowhere else — pricing_list keeps ONE writer');

  // REGISTRY + MANIFEST.
  // M3 — RESTATED. The first version put pricing.fxReconcile in SYS_REQUIRED_ACTIONS_, which contradicted
  // 63_'s own rule for that list (the actions PAGES depend on) and its own rule for the version beside it
  // (bump whenever the list changes). The action is published instead by the two facts that do not require
  // a page to depend on it, and this asserts BOTH the presence and the deliberate absence.
  ok(!/action: 'pricing\.fxReconcile'/.test(GS63),
    'M3  pricing.fxReconcile is NOT in SYS_REQUIRED_ACTIONS_ — no page depends on a reconciliation');
  ok(/handlePricingFxReconcile_/.test(GS73) && /pricing\.fxReconcile/.test(GS01),
    'M3a it is routed and handled all the same');
  ok(/PRICING-R3 — pricing\.fxReconcile is DELIBERATELY ABSENT/.test(GS63),
    'M3b and 63_ records why it is absent, so a later round does not "fix" it by adding it');
  // S3-R10 — AT OR AFTER, not EXACTLY. These three owners are the ones PRICING-R4E moved, and the claim was
  // that it moved them — not that no release may ever move them again. Pinned exactly, the assertion forbade
  // the next release from touching the pricing writer, its route or the manifest that carries both, which is
  // the same file set any pricing change must move. S3-R10 moved all three to R25, and the ordering in
  // _release-order.js is what makes "after" a fact rather than a string comparison.
  [['PRW_BUILD_VERSION_', '73_'], ['RTR_BUILD_VERSION_', '01_'], ['SYS_BUILD_VERSION_', '63_']].forEach(function (o) {
    var row = new RegExp("symbol: '" + o[0] + "', expected: '([^']+)'").exec(GS63);
    ok(!!row && RELORD.stampAtOrAfter(row[1], R22),
      'M4  ' + o[1] + ' manifest row expects R22 or later', row && row[1]);
  });

  // DECLARED == EXPECTED, for every owner this round moved. A partial sync stays visible.
  [['73_', GS73, /var PRW_BUILD_VERSION_ = '([^']+)'/, 'PRW_BUILD_VERSION_'],
   ['01_', GS01, /var RTR_BUILD_VERSION_ = '([^']+)'/, 'RTR_BUILD_VERSION_'],
   ['63_', GS63, /var SYS_BUILD_VERSION_ = '([^']+)'/, 'SYS_BUILD_VERSION_']].forEach(function (o) {
    var declared = (o[1].match(o[2]) || [])[1];
    ok(RELORD.stampAtOrAfter(declared, R22), 'M5  ' + o[0] + ' declares R22 or later', declared);
    ok(GS63.indexOf("symbol: '" + o[3] + "', expected: '" + declared + "'") > 0,
      'M5b ' + o[0] + ' declares exactly what the manifest expects');
  });

  // THE RELEASE and THE ACTION CONTRACT both move; the REQUIRED-ACTION LIST deliberately does not.
  // S3-R10 — AT OR AFTER. "the release is R22" was true of PRICING-R4E and is not a property of the tree
  // forever; the next Apps Script release necessarily moves it, and §17 of every round since has required a
  // new release id whenever a server file changes. What stays true is that the release never goes backwards.
  var _rel = (/var SYS_DEPLOYMENT_RELEASE_ = '([^']+)'/.exec(GS63) || [])[1];
  ok(!!_rel && RELORD.stampAtOrAfter(_rel, R22), 'M6  the release is R22 or later', _rel);
  // S3-R10 — A FLOOR, for the reason pricing-r2's own L7 gives: the contract may only RISE, and PRICING-R3's
  // claim was that it moved for a real reason, not that it would be 16 forever. The evidence for the claim is
  // the route it was raised for still being routed (M7a), not the number standing still.
  ok(Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(GS63)[1]) >= 16,
    'M7  the action contract is at or above the version a ROUTE addition raised it to');
  ok(GS01.indexOf("pricing.fxReconcile") > 0,
    'M7a because the route it was raised for is still routed');
  // S3-R10 — RE-EXPRESSED. PRICING-R3's claim was its own RESTRAINT: it did not add its action to the list
  // because no page calls a whole-table reconciliation. That claim is about pricing.fxReconcile, and it is
  // still true and still checkable. Pinning the VERSION instead made it a claim about every future round, and
  // S3-R10 added pricing.write.status, which a page genuinely does call.
  ok(GS63.indexOf("{ action: 'pricing.fxReconcile'") < 0,
    'M8  pricing.fxReconcile is still absent from SYS_REQUIRED_ACTIONS_ — no PAGE depends on a reconciliation');
  // The reason is recorded where the number is, so a later round reading '13 looks stale' finds the
  // argument rather than re-deciding it. (The earlier spelling of this probe matched a registry entry that
  // has since been removed for exactly the reason the comment gives — it was reading the symptom.)
  ok(/no page calls pricing.fxReconcile/.test(GS63),
    'M8b and the file records WHY, next to the number it explains');

  // THE CLIENT PIN MOVES WITH THE CONTRACT, although the frontend calls nothing new. In this repository
  // the pin and the deployed contract are a MATCHED PAIR, not a minimum — a pin below the contract would
  // make a frontend and backend that shipped together indistinguishable from two that did not — so the
  // round costs a frontend deploy, and the ordering constraint that comes with it.
  var DBAPI = readN('assets/js/api/operation-system-db-api.js');
  var _pin = Number(/var KM_EXPECTED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(DBAPI)[1]);
  var _contract = Number(/var SYS_DEPLOYED_ACTION_CONTRACT_VERSION_ = (\d+)/.exec(GS63)[1]);
  eq(_pin, _contract, 'M9  the client pin AGREES with the deployed contract — neither side drifts alone');
  // S3-R10 — a floor, for the same reason as M7. M9 above is the invariant that matters and is untouched:
  // the two numbers agree, so neither side can drift alone.
  ok(_pin >= 16, 'M9a and both are at or above the version this round moved them to', _pin);
  // THE ORDERING THIS CREATES, which is the operational cost of the line above: a frontend published ahead
  // of the Apps Script sync pins 16 against a deployment still declaring 15 and refuses EVERY page.
  ok(/deployed_action_contract_version < KM_EXPECTED_ACTION_CONTRACT_VERSION_/.test(DBAPI),
    'M9b the client refuses a deployment older than its pin — so Apps Script syncs FIRST, frontend SECOND');
  // MEASURED ON CODE. The pin comment above now explains WHY the frontend gained no fxReconcile call, and
  // the word sits three lines from the constant — so the raw-text version of this assertion matched its own
  // explanation of the thing it was looking for. With comments and string literals out, what is left is a
  // call site, and there is none.
  ok(!/fxReconcile/.test(bare(DBAPI)),
    'M9c and there is still no browser CALLER for the reconciliation — it is an operator action');
  ok(/fxReconcile/.test(DBAPI),
    'M9d while the file does explain in prose why its pin moved without a new call');

  // RELEASE ORDER — appended, never reordered.
  var stamps = RELORD.OWNER_STAMPS;
  // S3-R10 — APPEND-ONLY is the claim; "R22 is last" is only how it looked on the day. Asserted as the two
  // facts that survive: R22 is still present, and nothing was inserted before it.
  ok(stamps.indexOf(R22) >= 0, 'M10 R22 is still in the owner-stamp order — append-only, never rewritten');
  ok(RELORD.stampAtOrAfter(stamps[stamps.length - 1], R22),
    'M10a and everything after it was APPENDED, so the order still ends at or beyond R22',
    stamps[stamps.length - 1]);
  ok(RELORD.stampAtOrAfter(R22, 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R21'), 'M10b and sorts after R21');
  eq(stamps.filter(function (s) { return s === R22; }).length, 1, 'M10c appearing exactly once');

  // THE DOC.
  ok(/AUTO_FX_REFRESH/.test(DOC), 'M11 the mapping spec documents the FX change type');
  ok(/PRICING-R3/.test(DOC), 'M11b and records this round');
}

// =============================================================================================================
section('N · MUTANTS');
// =============================================================================================================
function nl(src, t) { return src.indexOf('\r\n') !== -1 ? t.split('\n').join('\r\n') : t; }
function faulted(src, from, to, tag) {
  var a = nl(src, from), b = nl(src, to);
  if (src.indexOf(a) === -1) throw new Error(tag + ' anchor drifted — the mutant would inject nothing');
  return src.split(a).join(b);
}
function mut(label, from, to, probe) {
  var caught = false;
  try {
    var src = faulted(GS73, from, to, label);
    if (src === GS73) throw new Error(label + ' changed nothing');
    caught = probe(makeWorld(src)) === true;
  } catch (e) {
    if (/anchor drifted|changed nothing/.test(e.message)) { fail++; console.error('FAIL ' + label + ' — ' + e.message); return; }
    caught = true;
  }
  if (caught) { mutCaught++; console.log('ok   ' + label + ' (caught)'); }
  else { mutSurvived++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

// N1 — THE RECIPROCAL. The error that produces a plausible number instead of an obvious one.
mut('N1  the FX direction is inverted (BASE / RATE instead of BASE x RATE)',
  '  var raw = b.value * rate;',
  '  var raw = b.value / rate;',
  function (w) { return w.pricingFxConvert_(29.99, 1.35, 'CAD').value !== 40.49; });

// N2 — a manual price is overwritten by the converted value.
// N2 — THE FOLLOW COMES BACK. Under R3 this mutant read "the effective price follows auto regardless of
// who owns the field" and the guard was the ownership flag. PRICING-R4G removed the follow entirely, so
// the mutant is now the branch itself returning: an FX run that writes an override column at all, for a
// field whose owner is irrelevant because no owner may be written by a reconciliation.
mut('N2  the FX run writes the manual override column again',
  '    if (!eff.override_is_na && eff.override === null) view.resolved_follows = true;',
  '    if (!eff.override_is_na && eff.override === null) { view.resolved_follows = true; }\n    res.cells[spec.field] = conv.value;',
  function (w) {
    var p = w.pricingPlanFxRow_({ currency: 'CAD', base_currency: 'USD', base_regular_price: 29.99,
      regular_price: 34.99, regular_price_is_manual: 'TRUE' }, table(w));
    return Object.prototype.hasOwnProperty.call(p.cells, 'regular_price');
  });

// N3 — the resolver's fallback gated on the flag again. This is the R4G change being UNDONE, and what it
// costs is precise: every row an operator cleared with Use Auto Price stops resolving and shows Not Set,
// while every legacy UNKNOWN row is unaffected — so it would look like a partial, intermittent outage.
mut('N3  the auto fallback is gated on the ownership flag again',
  "  else if (auto.present) { value = auto.value; source = 'AUTO'; }",
  "  else if (auto.present && authority === PRICING_OWNER_AUTO_) { value = auto.value; source = 'AUTO'; }",
  function (w) {
    var r = w.pricingResolveEffective_({ regular_price: '', auto_regular_price: 40.49,
      regular_price_is_manual: '' }, w.PRICING_FIELDS_[0]);
    return r.value === null;
  });

// N4 — a missing base price becomes zero, which publishes a free product.
mut('N4  a missing base price converts to 0 instead of nothing',
  "  if (!b.present) return { present: false, invalid: false, na: b.na, raw: null, value: null };",
  "  if (!b.present) return { present: true, invalid: false, na: b.na, raw: 0, value: 0 };",
  function (w) {
    var p = w.pricingPlanFxRow_({ currency: 'CAD', base_currency: 'USD', base_regular_price: '',
      regular_price_is_manual: 'FALSE' }, table(w));
    return p.cells.auto_regular_price === 0;
  });

// N5 — the frozen precision is ignored and JPY stores decimals.
mut('N5  the converted value is stored at the wrong currency precision',
  '  var rounded = pricingRoundFx_(raw, localCurrency);',
  '  var rounded = raw;',
  function (w) { return w.pricingFxConvert_(29.99, 147.238, 'JPY').value % 1 !== 0; });

// N6 — an unsupported currency is converted at some default precision instead of failing closed.
/* N6 — RE-DRIVEN. The first version supplied no USD>CHF rate, so removing the precision guard simply fell
   through to the MISSING_FX_RATE guard below it and the row was refused anyway: a real fault, caught for a
   reason that had nothing to do with it, and reported as a survivor. The rate is now supplied, which leaves
   the frozen precision contract as the only thing standing between an unknown currency and a stored price. */
mut('N6  an unsupported currency is converted instead of refused',
  "    res.ok = false; res.skip = 'UNSUPPORTED_CURRENCY'; res.currency = localCurrency; return res;",
  "    res.currency = localCurrency;",
  function (w) {
    var t = table(w, [{ base_currency: 'USD', quote_currency: 'CHF', rate: 0.88, source: 'S', as_of: 'd' }]);
    var p = w.pricingPlanFxRow_({ currency: 'CHF', base_currency: 'USD', base_regular_price: 10 }, t);
    return p.ok === true;
  });

// N7 — the same-currency path silently accepts a rate that is not 1.
mut('N7  a same-currency pair accepts a rate other than 1',
  '    if (base === quote && r.value !== 1) {',
  '    if (false) {',
  function (w) {
    return w.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'USD', rate: 1.02, source: 'S', as_of: 'd' }]).ok === true;
  });

// N8 — a row is converted with the rate for the WRONG pair (direction ignored).
mut('N8  the rate lookup ignores direction, so a CAD>USD rate answers a USD>CAD row',
  "  return pricingStr_(base).toUpperCase() + '>' + pricingStr_(quote).toUpperCase();",
  "  return [pricingStr_(base).toUpperCase(), pricingStr_(quote).toUpperCase()].sort().join('>');",
  function (w) {
    var t = w.pricingBuildRateTable_([{ base_currency: 'CAD', quote_currency: 'USD', rate: 0.74, source: 'S', as_of: 'd' }]);
    return w.pricingFxRateFor_(t, 'USD', 'CAD') !== null;
  });

// N9 — the reconciliation starts writing ownership flags, classifying what nobody classified.
mut('N9  the FX run writes an ownership flag',
  "      res.cells[spec.auto] = conv.value;",
  "      res.cells[spec.auto] = conv.value; res.cells[spec.flag] = pricingWriteFlag_(false);",
  function (w) {
    var p = w.pricingPlanFxRow_({ currency: 'CAD', base_currency: 'USD', base_regular_price: 10,
      minimum_price_is_manual: 'FALSE', regular_price_is_manual: 'FALSE' }, table(w));
    return Object.prototype.hasOwnProperty.call(p.cells, 'regular_price_is_manual');
  });

// N10 — the pre-write audit is removed, so a defective column build can reach the sheet.
mut('N10 the pre-write manual-overwrite audit is disabled',
  '      if (Object.prototype.hasOwnProperty.call(effectiveNames, name)) {',
  '      if (false) {',
  function (w) {
    // Drive it from a WORLD where the planner is also wrong, so the audit is the only thing left. Note the
    // flag says AUTO here: under R3 that alone made the write legal and this fixture would have proved
    // nothing. Under R4G no flag makes it legal, which is what lets the fixture be this simple.
    var st = { col: function (n) { return n === 'regular_price' ? 17 : -1; },
      rows: [{ rowNumber: 2, values: { regular_price: 34.99, regular_price_is_manual: 'FALSE' } }] };
    var plans = [{ rowNumber: 2, changed: true, cells: { regular_price: 40.49 } }];
    return w.pricingFxBuildColumns_(st, plans).violations.length === 0;
  });

// N11 — dry run stops being the default, so a forgotten parameter reprices the table.
mut('N11 dry_run is no longer the default',
  '  var wantsWrite = body.dry_run === false || pricingStr_(body.dry_run).toLowerCase() === \'false\';',
  '  var wantsWrite = body.dry_run !== true;',
  function (w) {
    var ww = makeWorld(faulted(GS73,
      '  var wantsWrite = body.dry_run === false || pricingStr_(body.dry_run).toLowerCase() === \'false\';',
      '  var wantsWrite = body.dry_run !== true;', 'N11'),
      { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD',
        base_regular_price: 10, regular_price_is_manual: 'FALSE' })] });
    ww.handlePricingFxReconcile_({ run_date: '2026-09-23', rates: rates() });
    return ww.__price.__writes > 0;
  });

// N12 — the run date defaults to the server clock instead of being supplied.
mut('N12 run_date defaults instead of being required',
  "  var runDate = pricingStr_(body.run_date);",
  "  var runDate = pricingStr_(body.run_date) || '2026-01-01';",
  function (w) {
    var ww = makeWorld(faulted(GS73, "  var runDate = pricingStr_(body.run_date);",
      "  var runDate = pricingStr_(body.run_date) || '2026-01-01';", 'N12'),
      { rows: [priceRow({ marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD', base_regular_price: 10 })] });
    return ww.handlePricingFxReconcile_({ rates: rates() }).error !== 'RUN_DATE_REQUIRED';
  });

// N13 — a rate with no provenance is accepted, so nobody can reproduce the run.
mut('N13 a rate with no source is accepted',
  '    if (!source) {',
  '    if (false) {',
  function (w) {
    return w.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35, as_of: 'd' }]).ok === true;
  });

// N14 — an unchanged auto value produces a log row, so the audit fills with noise.
mut('N14 an unchanged auto value is logged as a change',
  '    if (autoMoved) {',
  '    if (true) {',
  function (w) {
    var ww = makeWorld(faulted(GS73, '    if (autoMoved) {', '    if (true) {', 'N14'),
      { rows: [priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD',
        base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 40.49,
        regular_price_is_manual: 'FALSE' })] });
    ww.handlePricingFxReconcile_({ dry_run: false, run_date: '2026-09-23', rates: rates() });
    return ww.__log.__grid.length - 1 > 0;
  });

// N15 — the per-column write regresses to per-cell, which is the cost failure §14 names.
mut('N15 the reconciliation writes cell by cell instead of by column',
  '        priceSheet.getRange(2, c.columnIndex, build.rowCount, 1).setValues(c.values);',
  '        for (var zi = 0; zi < c.values.length; zi++) priceSheet.getRange(2 + zi, c.columnIndex).setValue(c.values[zi][0]);',
  function (w) {
    var rows = [];
    for (var i = 0; i < 20; i++) rows.push(priceRow({ pricing_id: 'P' + i, marketplace_sku_id: 'M' + i,
      currency: 'CAD', base_currency: 'USD', base_regular_price: 10 + i, regular_price_is_manual: 'FALSE' }));
    var ww = makeWorld(faulted(GS73,
      '        priceSheet.getRange(2, c.columnIndex, build.rowCount, 1).setValues(c.values);',
      '        for (var zi = 0; zi < c.values.length; zi++) priceSheet.getRange(2 + zi, c.columnIndex).setValue(c.values[zi][0]);',
      'N15'), { rows: rows });
    ww.handlePricingFxReconcile_({ dry_run: false, run_date: '2026-09-23', rates: rates() });
    return ww.__price.__cellWrites > 0;
  });

// N16 — a duplicated identity is converted anyway, hiding the duplicate behind a successful run.
/* N16 — REWRITTEN. The first version inserted a line above a return statement that still executed, so it changed
   nothing observable and could not have failed. It now removes the duplicate guard itself. */
mut('N16 a duplicate marketplace_sku_id is reconciled instead of skipped',
  '    if (seen[id]) {',
  '    if (false) {',
  function (w) {
    var ww = makeWorld(faulted(GS73, '    if (seen[id]) {', '    if (false) {', 'N16'),
      { rows: [
        priceRow({ pricing_id: 'P1', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD', base_regular_price: 10 }),
        priceRow({ pricing_id: 'P2', marketplace_sku_id: 'M1', currency: 'CAD', base_currency: 'USD', base_regular_price: 20 })] });
    var r = ww.handlePricingFxReconcile_({ dry_run: true, run_date: '2026-09-23', rates: rates() });
    // The skip must still be recorded; a mutant that converts the duplicate leaves no skip for it.
    return r.data.skipped.filter(function (s) { return s.reason === 'DUPLICATE_IDENTITY'; }).length === 0;
  });

// =============================================================================================================
console.log('\n' + pass + ' passed / ' + fail + ' failed   ·   ' + (mutCaught + mutSurvived) + ' mutants, ' + mutSurvived + ' survived');
process.exit(fail === 0 ? 0 : 1);
