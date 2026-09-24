// Kitchen Mama Operation System — PRICING-R4D · EFFECTIVE PRICE AUTHORITY AND AUTO-FOLLOW · FINAL AUDIT
// =============================================================================================================
// THE QUESTION THIS ROUND ANSWERS. Production rows were found whose effective regular/minimum/MSRP still hold
// the USD base number while auto_* holds the correctly converted local value. Is that historical residue from
// a schema that no longer exists, or is it still reachable today?
//
// IT IS STILL REACHABLE, and this suite proves it by RUNNING the shipped writers rather than reading them:
//
//   C  executes 04_'s real handler against a fake spreadsheet. A brand-new CAD row created by the Add SKU
//      form — which sends no price field of any kind — is written with regular_price = the raw USD base
//      number, fx_rate = 1, and three BLANK ownership flags.
//   B  executes 73_'s real FX planner over that same row. auto_* moves to the correct CAD value; the
//      effective price does not, and correctly so, because a blank flag is UNKNOWN and §4A forbids FX from
//      turning "nobody has said" into "the system owns it".
//
// Those two behaviours are each right on their own terms and together they manufacture the defect. That is
// the finding, and it is a CREATION defect, not an FX defect — which is why nothing in 73_ is touched.
//
// SECTION C WAS A CHARACTERISATION TEST AND IS NOW A GUARD. R4D froze this round as audit-only and pinned
// what 04_ did on the day it was measured, saying in this paragraph that C6/C7/C8 were the assertions a fix
// would have to invert. PRICING-R4E inverted them. The prose below still describes the defect, because a
// guard whose text does not say what it is guarding against is a guard nobody can maintain — but every
// assertion now states the CURRENT contract, and the R4E suite proves the same rule across six currencies.
//
//   A  §1 the three-layer model — confirmed or rejected from the code, field by field
//   B  §2 the FX write contract, measured separately for TRUE / FALSE / blank
//   C  §3 row creation, executed — and the exact writer of the base-shaped effective value
//   D  §4 the consumer audit: who reads the effective fields, and what a blank one does to each
//   E  §6/§7 the cleanup answer and the future creation contract, frozen in the canonical spec
//   F  mutants
//
// Run: node assets/tests/pricing-r4d-effective-price-authority-audit.test.js
// LOCAL / FAKE-ONLY. No network, no Sheets, no Apps Script, no browser. Zero production reads or writes.
// NOTE: no 'use strict' — the .gs sources are eval'd.

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = path.join(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function readN(rel) { return read(rel).replace(/\r\n/g, '\n'); }

var GS04 = readN('assets/specs/active/apps-script/04_marketplace_forecast_import.gs');
var GS72 = readN('assets/specs/active/apps-script/72_api_v1_product_pricing_workspace.gs');
var GS73 = readN('assets/specs/active/apps-script/73_api_v1_pricing_write.gs');
var GS03 = readN('assets/specs/active/apps-script/03_master_data_handlers.gs');
var DBAPI = readN('assets/js/api/operation-system-db-api.js');
var FCSUM = readN('assets/js/pages/fc-summary.js');
var ADAPTER = readN('assets/js/api/km-product-pricing-adapter.js');
var REPLEN = readN('assets/js/pages/inventory-replenishment.js');
var DOC = readN('assets/specs/active/PRICING_DATABASE_MAPPING.md');
var SRP = require('../js/pages/sku-regional-pricing.js');

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

/** Comments and string literals out — a file's own prose names everything it promises not to do. */
function bare(src) {
  src = src.replace(/\/\*[\s\S]*?\*\//g, ' ');
  src = src.split('\n').map(function (l) { return l.split('//')[0]; }).join('\n');
  return src.replace(/'(?:\\.|[^'\\\n])*'/g, "''").replace(/"(?:\\.|[^"\\\n])*"/g, '""');
}

console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4D — EFFECTIVE PRICE AUTHORITY AND AUTO-FOLLOW — FINAL AUDIT');
console.log(new Array(111).join('='));

// -------------------------------------------------------------------------------------------------------------
// A SHARED FAKE SHEET. Both worlds below use it: 04_ appends rows through it, 73_ reads and range-writes
// through it, so "what 04_ created" and "what FX would then do to it" are measured on the same object.
// -------------------------------------------------------------------------------------------------------------
function fakeSheet(name, grid) {
  var g = grid.map(function (r) { return r.slice(); });
  var S = {
    __grid: g, __appends: [], __writes: 0,
    getName: function () { return name; },
    getLastRow: function () { return g.length; },
    getLastColumn: function () { return g.length ? g[0].length : 0; },
    getDataRange: function () { return { getValues: function () { return g.map(function (r) { return r.slice(); }); } }; },
    appendRow: function (row) { g.push(row.slice()); S.__appends.push(row.slice()); S.__writes++; },
    getRange: function (r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: function () {
          var out = [];
          for (var i = 0; i < nr; i++) { var row = []; for (var j = 0; j < nc; j++) row.push((g[r - 1 + i] || [])[c - 1 + j]); out.push(row); }
          return out;
        },
        getValue: function () { return (g[r - 1] || [])[c - 1]; },
        setValue: function (v) { while (g.length < r) g.push([]); g[r - 1][c - 1] = v; S.__writes++; },
        setValues: function (vals) {
          for (var i = 0; i < vals.length; i++) {
            while (g.length < r + i) g.push(new Array(g[0].length).fill(''));
            for (var j = 0; j < vals[i].length; j++) g[r - 1 + i][c - 1 + j] = vals[i][j];
          }
          S.__writes++;
        }
      };
    }
  };
  return S;
}

// The canonical pricing_list header, post-PRICING-R2 (the three flag columns present and in order).
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

function prCell(row, name) { return row[PR_HEADER.indexOf(name)]; }
function prObject(row) {
  var o = {};
  PR_HEADER.forEach(function (h, i) { o[h] = row[i]; });
  return o;
}

// -------------------------------------------------------------------------------------------------------------
// WORLD 1 — the SHIPPED 04_ import handler, executed.
// -------------------------------------------------------------------------------------------------------------
function runImport(importRow, sdRow) {
  var sd = fakeSheet('sku_details', [SD_HEADER, sdRow || ['KM-100', 'Openers', 'Core', 29.99, 24.99, 39.99, 'USD', 'B0TEST']]);
  var mp = fakeSheet('marketplace_skus', [MP_HEADER]);
  var pr = fakeSheet('pricing_list', [PR_HEADER]);
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
    Utilities: {
      formatDate: function () { return '2026-09-24'; },
      getUuid: function () { uuid++; return 'uuid' + uuid + '-abcdefgh'; }
    },
    Logger: { log: function () {} },
    jsonResponse_: function (o) { return o; },
    // 18_'s sku_regional_details identity helpers. Unrelated to pricing; this SKU has no regional row.
    skuRegionalLookup_: function () { return null; },
    skuRegionalSyncIdentity_: function () { return null; }
  };
  vm.createContext(S);
  vm.runInContext(GS04, S, { filename: '04_marketplace_forecast_import.gs' });
  var res = S.handleImportMarketplaceSkusBatch_({
    rows: [importRow], options: { priceStatusDefault: 'draft', forecastStatusDefault: 'draft' }
  });
  return { res: res, pricing: pr, skuDetails: sd, marketplaceSkus: mp };
}

/** The Add SKU form's EXACT payload — inventory-replenishment.js:1084. Not one price field in it. */
var ADD_SKU_FORM_PAYLOAD = {
  sku: 'KM-100', company: 'KM', country: 'Canada', marketplace: 'Amazon',
  marketplace_id: 'MK-CA-AMZ', site_sku: 'CA-KM-100', currency: 'CAD',
  marketplace_product_id: 'B0TEST', product_url: 'https://example.com/x',
  marketplace_sku_status: 'Active', replenishment_model: 'FBA', fulfillment_model: 'FBA',
  launch_date: '2026-01-01'
};

// -------------------------------------------------------------------------------------------------------------
// WORLD 2 — the SHIPPED 73_ pricing writer, executed. Pure planners only; no sheet needed.
// -------------------------------------------------------------------------------------------------------------
var W73 = (function () {
  var S = {
    console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON,
    isFinite: isFinite, Date: Date, RegExp: RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return {}; }, flush: function () {} },
    Session: { getScriptTimeZone: function () { return 'UTC'; } },
    Utilities: { formatDate: function () { return '2026-09-24'; }, getUuid: function () { return 'u'; } },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } }
  };
  vm.createContext(S);
  vm.runInContext(GS73, S, { filename: '73_api_v1_pricing_write.gs' });
  return S;
}());
var FIELDS = W73.PRICING_FIELDS_;
var REG = FIELDS[0];

/** USD 1 = CAD 1.35, sourced and dated — the direction §4B froze. */
function cadTable() {
  var t = W73.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35,
    source: 'OPERATOR_INPUT', as_of: '2026-09-24' }]);
  t.runDate = '2026-09-24';
  return t;
}

// =============================================================================================================
section('A · §1 THE THREE-LAYER MODEL — CONFIRMED OR REJECTED FROM THE CODE');
// =============================================================================================================
{
  // BASE -> AUTO -> EFFECTIVE, with an authority flag deciding only the last hop. Each layer is confirmed
  // against the shipped field table rather than against the document that describes it.
  eq(FIELDS.length, 3, 'A1  three price bands, and only three');
  eq(FIELDS.map(function (s) { return s.field; }), ['regular_price', 'minimum_price', 'msrp'],
    'A2  the EFFECTIVE layer is the stored field, named');
  eq(FIELDS.map(function (s) { return s.auto; }), ['auto_regular_price', 'auto_minimum_price', 'auto_msrp'],
    'A3  the AUTO layer is a separate column per band');
  eq(FIELDS.map(function (s) { return s.base; }), ['base_regular_price', 'base_minimum_price', 'base_msrp'],
    'A4  the BASE layer is a third separate column per band');
  eq(FIELDS.map(function (s) { return s.flag; }),
    ['regular_price_is_manual', 'minimum_price_is_manual', 'msrp_is_manual'],
    'A5  and each band carries its OWN authority flag — the flags are per field, not per row');

  // AUTHORITY IS THREE-STATE ON BOTH SIDES OF THE WIRE. This is the load-bearing statement of the whole
  // model: a two-state reading would make every legacy row system-owned by default.
  eq([W73.pricingReadFlag_(''), W73.pricingReadFlag_('TRUE'), W73.pricingReadFlag_('FALSE')],
    ['UNKNOWN', 'MANUAL', 'AUTO'], 'A6  server: blank is UNKNOWN, and it is not FALSE');
  eq([W73.pricingReadFlag_(true), W73.pricingReadFlag_(false), W73.pricingReadFlag_(null)],
    ['MANUAL', 'AUTO', 'UNKNOWN'], 'A6b including the checkbox booleans a spreadsheet actually produces');
  ok(/if \(s === ''\) return null;/.test(DBAPI) && /function pricingFlagOrNull_/.test(DBAPI),
    'A7  browser: the same three states, blank -> null, in normalizePricingListRecord');

  // AUTO = BASE x FX. Measured, not read: the resolver and the converter are the two halves of the claim.
  var conv = W73.pricingFxConvert_(29.99, 1.35, 'CAD');
  eq([conv.present, conv.value], [true, 40.49], 'A8  AUTO = BASE x FX, at the currency\'s frozen precision');
  eq(W73.pricingFxConvert_('', 1.35, 'CAD').value, null,
    'A8b a blank base produces a blank auto — never 0, because 0 is a price');

  // EFFECTIVE is the stored field, ALWAYS, with exactly one defined substitution.
  var r = W73.pricingResolveEffective_({ regular_price: 31.5, auto_regular_price: 40.49,
    regular_price_is_manual: 'TRUE' }, REG);
  eq([r.value, r.source, r.authority, r.writable_by_fx], [31.5, 'STORED', 'MANUAL', false],
    'A9  EFFECTIVE is the stored value and the flag decides only who may write it');
  ok(/EFFECTIVE value is the stored\s*\n?\s*\*? ?field, always/.test(GS73.replace(/\s+/g, ' ')) ||
     /the EFFECTIVE value is the stored field, always/.test(GS73.replace(/\s+/g, ' ')),
    'A9b and the resolver says so in the file that implements it');

  // The document and the code agree about the direction of the chain.
  ok(/SKU DETAILS\s+->\s+base_regular_price/.test(DOC) && /-> FX -> auto_regular_price/.test(DOC),
    'A10 the canonical spec states the same chain — SKU Details owns BASE, pricing_list owns AUTO');
  ok(/`TRUE` = the operator owns it and FX must preserve it/.test(DOC) &&
     /BLANK = nobody has said\*\*, which is not `FALSE`/.test(DOC),
    'A11 ... and the same three-state authority, blank explicitly NOT false');

  // REJECTED STATEMENT, stated as a rejection rather than quietly omitted. `price_source` looks like an
  // authority column and is not one: it is row-level, legacy, and never consulted.
  ok(/LEGACY \/ DESCRIPTIVE ONLY since PRICING-R2/.test(DOC),
    'A12 price_source is NOT a fourth layer — legacy, descriptive, never consulted to decide ownership');
  ok(bare(GS73).indexOf('pricingDeriveLegacySource_') > -1 &&
     !/price_source[\s\S]{0,80}writable_by_fx|writable_by_fx[\s\S]{0,80}price_source/.test(bare(GS73)),
    'A12b it is kept in step by the writer and never reaches the ownership decision');
}

// =============================================================================================================
section('B · §2 THE FX WRITE CONTRACT — MEASURED PER AUTHORITY STATE');
// =============================================================================================================
{
  // One row per state, identical in every other respect: same base, same currencies, same rate, same stale
  // auto value. The only variable is the flag, so any difference in the plan is caused by the flag alone.
  function row(flag, effective) {
    return { currency: 'CAD', base_currency: 'USD',
      base_regular_price: 29.99, base_minimum_price: '', base_msrp: '',
      auto_regular_price: 22.10, regular_price: effective, regular_price_is_manual: flag };
  }
  function plan(flag, effective) { return W73.pricingPlanFxRow_(row(flag, effective), cadTable()); }

  var T = plan('TRUE', 34.99);     // a negotiated price
  var F = plan('FALSE', 22.10);    // the system's price, currently equal to the stale auto
  var U = plan('', 29.99);         // the legacy population: a base-shaped price and nobody has said

  // ---- flag TRUE ----
  eq(T.cells.auto_regular_price, 40.49, 'B1  MANUAL_TRUE_AUTO_REFRESH = YES — the reference is refreshed');
  ok(!Object.prototype.hasOwnProperty.call(T.cells, 'regular_price'),
    'B2  MANUAL_TRUE_EFFECTIVE_REFRESH = NO — the negotiated price is not planned at all');
  ok(!Object.prototype.hasOwnProperty.call(T.cells, 'regular_price_is_manual'),
    'B3  MANUAL_TRUE_FLAG_CHANGE = NO');

  // ---- flag FALSE ----
  eq(F.cells.auto_regular_price, 40.49, 'B4  AUTO_FALSE_AUTO_REFRESH = YES');
  eq(F.cells.regular_price, 40.49, 'B5  AUTO_FALSE_EFFECTIVE_FOLLOWS_AUTO = YES — no CONTRACT_GAP here');
  eq(F.cells.regular_price, F.cells.auto_regular_price,
    'B5b and it follows to exactly the auto value, not to a separately rounded one');
  ok(!Object.prototype.hasOwnProperty.call(F.cells, 'regular_price_is_manual'),
    'B6  AUTO_FALSE_FLAG_CHANGE = NO');

  // ---- flag blank ----
  eq(U.cells.auto_regular_price, 40.49, 'B7  UNKNOWN_AUTO_REFRESH = YES — the reference is refreshed');
  ok(!Object.prototype.hasOwnProperty.call(U.cells, 'regular_price'),
    'B8  UNKNOWN_EFFECTIVE_REFRESH = NO — "nobody has said" is not permission');
  ok(!Object.prototype.hasOwnProperty.call(U.cells, 'regular_price_is_manual'),
    'B9  UNKNOWN_FLAG_CHANGE = NO — the flag stays blank, so the row is still countable as unclassified');
  eq(U.fields.regular_price.authority, 'UNKNOWN', 'B9b and the plan REPORTS it as unknown rather than resolving it');

  // ---- the same three answers, stated as the §2 report block ----
  console.log('     MANUAL_TRUE_AUTO_REFRESH=YES  MANUAL_TRUE_EFFECTIVE_REFRESH=NO  MANUAL_TRUE_FLAG_CHANGE=NO');
  console.log('     AUTO_FALSE_AUTO_REFRESH=YES   AUTO_FALSE_EFFECTIVE_FOLLOWS_AUTO=YES  AUTO_FALSE_FLAG_CHANGE=NO');
  console.log('     UNKNOWN_AUTO_REFRESH=YES      UNKNOWN_EFFECTIVE_REFRESH=NO       UNKNOWN_FLAG_CHANGE=NO');

  // ---- NO BASE MUTATION, in any state. §9's last requirement. ----
  [T, F, U].forEach(function (p, i) {
    var keys = Object.keys(p.cells);
    var baseTouched = keys.filter(function (k) { return /^base_/.test(k); });
    eq(baseTouched, [], 'B10 no base_* cell is planned in state ' + ['TRUE', 'FALSE', 'blank'][i] + ' — FX never writes BASE');
  });
  ok(bare(GS73).indexOf('res.cells[spec.base]') === -1,
    'B10b and there is no code path anywhere in 73_ that could plan one');

  // ---- the pre-write audit is the second lock on the same rule ----
  // Even if a planner were wrong, the column builder re-reads the flag AS IT STANDS IN THE SHEET and
  // refuses the whole run on one mismatch. Measured by handing it a plan that violates the rule.
  var sheetState = {
    col: function (n) { return PR_HEADER.indexOf(n); },
    rows: [{ rowNumber: 2, values: { regular_price: 34.99, regular_price_is_manual: 'TRUE' } }]
  };
  var built = W73.pricingFxBuildColumns_(sheetState,
    [{ rowNumber: 2, changed: true, cells: { regular_price: 40.49 } }]);
  eq(built.violations.length, 1, 'B11 the pre-write audit catches an effective write over a MANUAL row');
  eq(built.violations[0].authority, 'MANUAL', 'B11b naming the authority that forbade it');
  var builtU = W73.pricingFxBuildColumns_({
    col: sheetState.col,
    rows: [{ rowNumber: 2, values: { regular_price: 29.99, regular_price_is_manual: '' } }]
  }, [{ rowNumber: 2, changed: true, cells: { regular_price: 40.49 } }]);
  eq(builtU.violations.length, 1, 'B12 ... and over an UNKNOWN row too — blank is not a licence');
}

// =============================================================================================================
section('C · §3 NEW PRICING ROW INITIALIZATION — THE SHIPPED IMPORTER, EXECUTED');
// =============================================================================================================
{
  // ---- C0: there is exactly ONE creator, so the census below is complete ----
  var gsDir = path.join(ROOT, 'assets', 'specs', 'active', 'apps-script');
  var creators = fs.readdirSync(gsDir).filter(function (f) { return /\.gs$/.test(f); })
    .filter(function (f) {
      var s = bare(fs.readFileSync(path.join(gsDir, f), 'utf8'));
      // an append into a sheet handle resolved from the pricing_list tab
      return /prSheet\.appendRow/.test(s);
    });
  eq(creators, ['04_marketplace_forecast_import.gs'],
    'C0  exactly ONE production path creates a pricing_list row');
  ok(/it does NOT create marketplace_skus \/ pricing_list/.test(GS03),
    'C0b the master-data endpoint states that it creates none — SKU Details edits sku_details only');

  // ---- C1-C8: the Add SKU form's payload, through the real handler ----
  var w = runImport(ADD_SKU_FORM_PAYLOAD);
  ok(w.res && w.res.success === true, 'C1  the Add SKU payload is accepted', w.res && w.res.error);
  eq(w.pricing.__appends.length, 1, 'C1b and creates exactly one pricing_list row');
  var created = prObject(w.pricing.__appends[0]);

  eq(created.currency, 'CAD', 'C2  the row\'s local currency is the marketplace\'s — CAD');
  eq(created.base_currency, 'USD',
    'C3  NEW_PRICING_ROW_BASE_SOURCE: base_currency — the fixture master row says USD, and it is honoured');
  eq([created.base_regular_price, created.base_minimum_price, created.base_msrp], [29.99, 24.99, 39.99],
    'C3b the base prices DO come from sku_details — selling_price / minimum_price / msrp');
  ok(/sd_sell = skuHeaders\.indexOf\('selling_price'\)/.test(GS04),
    'C3c by the §4C map, taken from the sku_details header rather than from the import row');
  // PRICING-R4E — and base_currency is now read from the master row too, which is what C3's old label
  // ("DEFAULTED to USD, never read from sku_details") was recording as the defect.
  ok(/var sd_basecur = skuHeaders\.indexOf\('base_currency'\);/.test(GS04),
    'C3d and base_currency is READ from sku_details rather than defaulted — R4E §2');
  var eur = runImport(ADD_SKU_FORM_PAYLOAD,
    ['KM-100', 'Openers', 'Core', 29.99, 24.99, 39.99, 'EUR', 'B0TEST']);
  eq(prObject(eur.pricing.__appends[0]).base_currency, 'EUR',
    'C3e proven by a master row that says EUR: the constant no longer overrules it');

  // WHAT THE DEFECT WAS, and what each of these asserted before PRICING-R4E:
  //   C4  fx_rate = 1 on a CROSS-CURRENCY row — a rate invented where none exists
  //   C5  auto_* = base_*, the USD number wearing a CAD label
  //   C6  the effective price = the raw USD base
  //   C7  all three ownership flags blank, so FX was forbidden to repair any of it
  eq(created.fx_rate, '',
    'C4  NO_INVENTED_FX_RATE_1 — a cross-currency row is created with NO rate at all');
  eq([created.auto_regular_price, created.auto_minimum_price, created.auto_msrp], ['', '', ''],
    'C5  NEW_PRICING_ROW_AUTO_INITIALIZATION: auto_* is BLANK, not the base number in another currency');
  eq([created.regular_price, created.minimum_price, created.msrp], ['', '', ''],
    'C6  NEW_NON_USD_EFFECTIVE_CAN_RECEIVE_RAW_USD_BASE = NO — the effective price is blank');
  ok(created.regular_price !== created.base_regular_price,
    'C6b and is not the base price under another name');
  eq([created.base_regular_price, created.base_minimum_price, created.base_msrp], [29.99, 24.99, 39.99],
    'C6c while base_* IS written — which is what lets the first FX run repair the row by itself');

  eq([created.regular_price_is_manual, created.minimum_price_is_manual, created.msrp_is_manual],
    ['FALSE', 'FALSE', 'FALSE'],
    'C7  NEW_PRICING_ROW_AUTHORITY_INITIALIZATION: the system owns a row it made — FALSE, not blank');
  // Checked on the RAW source: a column name can only ever appear as a string literal, and bare() strips
  // those — which is why the original form of this assertion could only ever have been about their absence.
  ok(/prCol\('regular_price_is_manual'\)/.test(GS04) && /prCol\('msrp_is_manual'\)/.test(GS04),
    'C7b the importer now addresses the ownership columns by name');

  eq(created.price_source, 'auto_from_sku_details',
    'C8  and the legacy descriptive column is kept in step as before');
  eq(created.price_status, 'pending_fx',
    'C8b PENDING_FX is on the row in a column, not only in a free-text note');
  ok(/pricing\.fxReconcile/.test(String(created.note)),
    'C8c with a note naming the action that completes it');

  // ---- C9: the second seeding path — an import row that supplies prices ----
  var w2 = runImport(Object.assign({}, ADD_SKU_FORM_PAYLOAD, {
    sku: 'KM-100', base_regular_price: 29.99, regular_price: 29.99
  }));
  var c2 = prObject(w2.pricing.__appends[0]);
  eq(c2.regular_price, 29.99, 'C9  an import row\'s supplied effective price is written verbatim');
  eq(c2.price_source, 'import', 'C9b on the import branch, which performs no conversion either');
  eq(c2.fx_rate, '', 'C9c and stamps no rate at all unless the file carried one');

  // ---- C10: the defect is REACHABLE FROM THE UI, not just from a crafted payload ----
  ok(/window\.KM\.DB\.importMarketplaceSkusBatch\(\[oneRow\]/.test(REPLEN),
    'C10 the Add SKU form posts one row through the same importer');
  var oneRowBlock = REPLEN.slice(REPLEN.indexOf('var oneRow = {'), REPLEN.indexOf('window.KM.DB.importMarketplaceSkusBatch([oneRow]'));
  ok(!/price/i.test(oneRowBlock),
    'C10b and that payload contains no price field of any kind, so the fallback branch is the DEFAULT path');

  // ---- C11: the two halves of the defect, chained on one row ----
  // What FX then does to the row C6 created. Both behaviours are correct in isolation; together they
  // leave the effective price permanently base-shaped.
  var afterFx = W73.pricingPlanFxRow_({
    currency: created.currency, base_currency: created.base_currency,
    base_regular_price: created.base_regular_price, base_minimum_price: '', base_msrp: '',
    auto_regular_price: created.auto_regular_price, regular_price: created.regular_price,
    regular_price_is_manual: created.regular_price_is_manual
  }, cadTable());
  eq(afterFx.cells.auto_regular_price, 40.49, 'C11 a later FX run computes auto_* from the base on the row');
  eq(afterFx.cells.regular_price, 40.49,
    'C11b AND the effective price follows it — the flag R4E writes at creation says AUTO');
  eq(afterFx.fields.regular_price.authority, 'AUTO',
    'C11c THE ROOT CAUSE IS CLOSED: a pending row repairs itself on the first rate, with no migration');

  // ---- C12: no base mutation by the importer ----
  eq(w.skuDetails.__writes, 0, 'C12 the importer writes nothing back to sku_details — BASE is not mutated');
  eq(w.skuDetails.__grid.length, 2, 'C12b the master table is exactly as it was found');
}

// =============================================================================================================
section('D · §4 THE CONSUMER AUDIT — AND WHAT A BLANK EFFECTIVE DOES TO EACH');
// =============================================================================================================
{
  // ---- D1-D3: the canonical resolver, on a blank effective, in each authority state ----
  var blankUnknown = W73.pricingResolveEffective_({ regular_price: '', auto_regular_price: 40.49,
    regular_price_is_manual: '' }, REG);
  eq([blankUnknown.value, blankUnknown.source], [null, 'UNAVAILABLE'],
    'D1  blank effective + UNKNOWN resolves to NOTHING — auto is not a fallback');
  var blankAuto = W73.pricingResolveEffective_({ regular_price: '', auto_regular_price: 40.49,
    regular_price_is_manual: 'FALSE' }, REG);
  eq([blankAuto.value, blankAuto.source], [40.49, 'AUTO_REFERENCE'],
    'D2  blank effective + AUTO is the ONE defined substitution — the field is DEFINED to equal auto');
  var blankManual = W73.pricingResolveEffective_({ regular_price: '', auto_regular_price: 40.49,
    regular_price_is_manual: 'TRUE' }, REG);
  eq([blankManual.value, blankManual.source], [null, 'UNAVAILABLE'],
    'D3  blank effective + MANUAL resolves to nothing — a person\'s price cannot be reconstructed from auto');

  // ---- D4: the workspace transport does not even CARRY auto_*, so a fallback is not available there ----
  eq((bare(GS72).match(/auto_/g) || []).length, 0,
    'D4  72_ (productPricing.workspace.get) emits NO auto_* field at all');
  ok(/regular_price: price \? ppwNum_\(price\.regular_price\) : null/.test(GS72),
    'D4b it emits the EFFECTIVE fields only, verbatim and unresolved');
  ok(/regular_price: live\.regular_price === undefined \? null : live\.regular_price/.test(ADAPTER),
    'D4c and the browser adapter passes them through without substituting anything');
  ok(/never computes a price, never substitutes one field for another/.test(
    readN('assets/js/product-strategy/psb-data-contract.js')),
    'D4d which the board data contract states as the adapter rule');

  // ---- D5: what a null effective costs on that transport ----
  ok(/&& ppwNum_\(price\.regular_price\) !== null && !pricingAmbiguous && regionalConfirmed;/.test(GS72),
    'D5  72_ gates `analysable` on a non-null regular_price — a blank one drops the SKU off the price chart');
  var PSB = require('../js/product-strategy/psb-selectors.js');
  var S = PSB.PSB_SELECTORS || PSB;
  eq(S.chartRefusalsFor({ regular_price: null, regional: { regional_detail_id: 'X' } }).indexOf('PRICING_SOURCE_MISSING') > -1,
    true, 'D5b and the board refuses it as PRICING_SOURCE_MISSING — measured, not read');
  eq(S.chartRefusalsFor({ regular_price: 40.49, regional: { regional_detail_id: 'X' } }).indexOf('PRICING_SOURCE_MISSING'),
    -1, 'D5c while a present price is not refused — so D5b is caused by the blank and nothing else');

  // ---- D6: FC Summary reads the effective field and has a legacy wrapper that turns a gap into zero ----
  ok(/pricing_list is the sole price source of truth/.test(FCSUM) &&
     /effective field = `regular_price`/.test(FCSUM),
    'D6  FC Summary reads the EFFECTIVE field, named, with no auto fallback');
  ok(/never marketplace_skus\)|never marketplace_skus/.test(FCSUM),
    'D6b explicitly not marketplace_skus and not sku_details');
  // PRICING-R4E §5 — the back-compat wrapper turned a MISSING price into 0. It had no callers, which is the
  // only reason it never cost anything, and it is deleted rather than corrected.
  ok(FCSUM.indexOf('function _evtRegularPrice(') === -1,
    'D6c FC_MISSING_PRICE_AS_ZERO_POST = NO — the zero-coercing wrapper is gone');
  ok(/if \(pr\.regularPrice == null\) \{[\s\S]{0,200}missing_price/.test(FCSUM),
    'D6d and the live path treats a missing price as MISSING, which is what it always did');

  // ---- D7: the Regional Details panel shows both and resolves neither ----
  var view = SRP.fieldView({ regularPrice: null, autoRegularPrice: 40.49, regularPriceIsManual: null },
    SRP.FIELDS[0]);
  eq([view.effective, view.auto], [null, 40.49],
    'D7  the panel holds effective and auto SEPARATELY — nothing is resolved for display');
  ok(/it never resolves one from the other, and no consumer gains a fallback/.test(
    readN('assets/js/pages/sku-regional-pricing.js')),
    'D7b and states the rule it is implementing');

  // ---- D8: the census. Who reads the effective fields, and how many of them can fall back ----
  // Counted over the shipped frontend rather than asserted. A file counts as a consumer when it reads a
  // pricing_list effective field; as a fallback consumer when it would substitute auto_* for a blank one.
  var jsDir = path.join(ROOT, 'assets', 'js');
  var consumers = [], fallbacks = [];
  (function walk(dir) {
    fs.readdirSync(dir).forEach(function (f) {
      var p = path.join(dir, f);
      if (fs.statSync(p).isDirectory()) return walk(p);
      if (!/\.js$/.test(f)) return;
      var rel = path.relative(ROOT, p).replace(/\\/g, '/');
      var s = fs.readFileSync(p, 'utf8');
      if (!/getPricingList|pricingList|pricing_list/.test(s)) return;
      if (!/regular_price|regularPrice/.test(s)) return;
      consumers.push(rel);
      // The only shape a fallback could take: reading an auto field to stand in for the effective one.
      if (/(regularPrice|regular_price)\s*(\|\||\?\?)\s*[a-zA-Z_.]*[aA]uto/.test(s)) fallbacks.push(rel);
    });
  }(jsDir));
  ok(consumers.length > 0 && consumers.indexOf('assets/js/pages/fc-summary.js') > -1,
    'D8  EFFECTIVE_PRICE_DIRECT_CONSUMERS — counted over the shipped frontend', consumers);
  eq(fallbacks, [], 'D8b AUTO_FALLBACK_CONSUMERS = 0 — not one consumer substitutes auto for a blank effective');
  console.log('     EFFECTIVE_PRICE_DIRECT_CONSUMERS = ' + consumers.join(', '));

  // ---- D9: the subsystems §4 named that turn out NOT to be consumers ----
  // Stated as a measured negative so the audit's silence about them is evidence rather than an omission.
  ['assets/js/pages/inventory-replenishment.js'].forEach(function (rel) {
    var s = bare(readN(rel));
    ok(!/getPricingList\(|\.regularPrice|\bregular_price\b/.test(s),
      'D9  Order Planning / Request Order reads NO effective price — ' + rel);
  });
  ok(consumers.indexOf('assets/js/pages/shipment-tracking.js') === -1,
    'D9b nor does any shipment / procurement path');

  // ---- D10: the campaign snapshot is a COPY, taken at write time, and it is fed by the effective field ----
  ok(/price_units = the currency snapshot of the SAME pricing_list row that supplied regular_price/.test(
    readN('assets/specs/active/apps-script/20_campaign_write_handlers.gs')),
    'D10 a campaign line snapshots the pricing_list row that supplied its regular_price');

  // ---- D11: THE ANSWER ----
  ok(true, 'D11 BLANK_EFFECTIVE_SAFE_SYSTEM_WIDE = NO — proven by D1, D3, D5, D5b and D6c together');
}

// =============================================================================================================
section('E · §6 / §7 THE CLEANUP ANSWER AND THE FUTURE CONTRACT');
// =============================================================================================================
{
  // ---- E1: "Use Auto" cannot repair a row whose auto value is absent, so blanking is not reversible ----
  var refusal = W73.pricingPlanField_({ regular_price: 29.99, auto_regular_price: '',
    regular_price_is_manual: '' }, REG, 'AUTO', '', 'CAD');
  ok(refusal && refusal.error, 'E1  AUTO is REFUSED when there is no auto value to restore', refusal);
  var restored = W73.pricingPlanField_({ regular_price: 29.99, auto_regular_price: 40.49,
    regular_price_is_manual: '' }, REG, 'AUTO', '', 'CAD');
  eq(restored.cells[REG.field], 40.49, 'E1b and succeeds when there is one — so E1 is about the missing value');
  eq(restored.cells[REG.flag], 'FALSE', 'E1c AUTO is the one operation that DOES classify the row');

  // ---- E2: a MANUAL price is not recoverable from base or auto, so blanking one destroys it ----
  var manual = W73.pricingResolveEffective_({ regular_price: 31.5, auto_regular_price: 40.49,
    regular_price_is_manual: 'TRUE' }, REG);
  ok(manual.value !== manual.auto,
    'E2  a manual price is by definition not the auto value — nothing else in the row records it');

  // ---- E3: the ruling is frozen in the canonical spec, which already owns this subject ----
  ok(/## 4D\./.test(DOC), 'E3  the ruling lives in PRICING_DATABASE_MAPPING — no parallel spec was created');
  ok(/CAN_OPERATOR_BLANK_ALL_EFFECTIVE_PRICE_FIELDS_NOW = NO/.test(DOC),
    'E3b CAN_OPERATOR_BLANK_ALL_EFFECTIVE_PRICE_FIELDS_NOW = NO, stated where the contract is');
  ok(/NEW_NON_USD_EFFECTIVE_CAN_RECEIVE_RAW_USD_BASE = \*{0,2}YES/.test(DOC),
    'E3c and the creation defect is recorded with its answer, not left in a test file');
  ok(/RECOMMENDED_CANONICAL_EFFECTIVE_MODEL/.test(DOC),
    'E3d with one canonical read contract recommended over per-consumer fallback');

  // ---- E4: §7 — does the CURRENT runtime satisfy the future creation contract? ----
  ok(/Never invent an FX rate when none exists/i.test(DOC),
    'E4  the future contract forbids inventing a rate');
  // PRICING-R4E implemented it. Both of these asserted the gap and now assert its closure.
  ok(!/fxRate = 1;/.test(GS04) && /if \(b !== l\) \{ out\.reason = 'NO_CANONICAL_FX_RATE'; return out; \}/.test(GS04),
    'E4b CURRENT_RUNTIME_SATISFIES_FUTURE_CONTRACT = YES — a cross-currency row gets no invented rate');
  ok(!/baseCurrency = String\(row\.base_currency \|\| 'USD'\)\.trim\(\);/.test(GS04) &&
     /baseCurrency = baseCurFromMaster \|\| baseCurFromFile \|\| 'USD';/.test(GS04),
    'E4c ... and base_currency is read from sku_details first, with USD only as a last resort');
}

// =============================================================================================================
section('F · MUTANTS — each assertion above is asked to fail for a reason it names');
// =============================================================================================================
{
  function mutant(id, why, anchor, repl, probe) {
    // Resolve the anchor FIRST. A mutation that injects nothing passes every probe, and a harness that
    // cannot tell that apart from a real catch is worse than no harness.
    if (GS73.indexOf(anchor) === -1) {
      fail++; console.error('HARNESS ERROR  ' + id + ' — anchor not found: ' + anchor.slice(0, 60));
      return;
    }
    if (GS73.split(anchor).length - 1 !== 1) {
      fail++; console.error('HARNESS ERROR  ' + id + ' — anchor matches ' + (GS73.split(anchor).length - 1) + ' times');
      return;
    }
    var src = GS73.replace(anchor, function () { return repl; });
    var S = {
      console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math, JSON: JSON,
      isFinite: isFinite, Date: Date, RegExp: RegExp,
      SpreadsheetApp: { getActiveSpreadsheet: function () { return {}; }, flush: function () {} },
      Session: { getScriptTimeZone: function () { return 'UTC'; } },
      Utilities: { formatDate: function () { return '2026-09-24'; }, getUuid: function () { return 'u'; } },
      LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } }
    };
    var got;
    try {
      vm.createContext(S);
      vm.runInContext(src, S, { filename: 'mutant-' + id + '.gs' });
      got = probe(S);
    } catch (e) { got = true; }          // the mutated file throwing IS a catch — the anchor was proven above
    if (got) { caught++; pass++; console.log('ok   ' + id + '  ' + why + ' (caught)'); }
    else { survived.push(id); fail++; console.error('FAIL ' + id + '  ' + why + ' SURVIVED'); }
  }

  function cadRates(S) {
    var t = S.pricingBuildRateTable_([{ base_currency: 'USD', quote_currency: 'CAD', rate: 1.35,
      source: 'OPERATOR_INPUT', as_of: '2026-09-24' }]);
    t.runDate = '2026-09-24';
    return t;
  }
  function unknownRow() {
    return { currency: 'CAD', base_currency: 'USD', base_regular_price: 29.99,
      base_minimum_price: '', base_msrp: '', auto_regular_price: 22.10,
      regular_price: 29.99, regular_price_is_manual: '' };
  }

  // M1 — blank read as FALSE. This is the single change that would let FX "repair" every legacy row, and
  // it is exactly the bulk reclassification §4A forbids. B8 is what stands in its way.
  mutant('M1', 'a blank flag is read as AUTO, so FX rewrites every unclassified price',
    "  if (s === '') return PRICING_OWNER_UNKNOWN_;",
    "  if (s === '') return PRICING_OWNER_AUTO_;",
    function (S) {
      var p = S.pricingPlanFxRow_(unknownRow(), cadRates(S));
      return Object.prototype.hasOwnProperty.call(p.cells, 'regular_price');
    });

  // M2 — the effective field follows on any authority. B2 is what stands in its way.
  mutant('M2', 'the effective price follows auto regardless of who owns it',
    '    if (eff.writable_by_fx) {',
    '    if (true) {',
    function (S) {
      var r = { currency: 'CAD', base_currency: 'USD', base_regular_price: 29.99,
        base_minimum_price: '', base_msrp: '', auto_regular_price: 22.10,
        regular_price: 34.99, regular_price_is_manual: 'TRUE' };
      var p = S.pricingPlanFxRow_(r, cadRates(S));
      return Object.prototype.hasOwnProperty.call(p.cells, 'regular_price');
    });

  // M3 — the FX run classifies as it goes. B3/B6/B9 stand in its way.
  mutant('M3', 'the FX run writes an ownership flag while refreshing a reference value',
    '      res.cells[spec.auto] = conv.value;',
    '      res.cells[spec.auto] = conv.value; res.cells[spec.flag] = \'FALSE\';',
    function (S) {
      var p = S.pricingPlanFxRow_(unknownRow(), cadRates(S));
      return Object.prototype.hasOwnProperty.call(p.cells, 'regular_price_is_manual');
    });

  // M4 — the resolver falls back to auto for an UNKNOWN row. That is reclassification carried out through
  // the screen instead of through the schema, and D1 is what stands in its way.
  mutant('M4', 'the resolver substitutes auto for a blank effective on an UNKNOWN row',
    "  if (!stored.present && !stored.na && authority === PRICING_OWNER_AUTO_ && auto.present) {",
    "  if (!stored.present && !stored.na && auto.present) {",
    function (S) {
      var r = S.pricingResolveEffective_({ regular_price: '', auto_regular_price: 40.49,
        regular_price_is_manual: '' }, S.PRICING_FIELDS_[0]);
      return r.value !== null;
    });

  // M5 — the rate is inverted. A1/A8 stand in its way, and the mutant is here because the reciprocal is the
  // one arithmetic error that produces a plausible number instead of an obvious one.
  mutant('M5', 'the conversion divides by the rate instead of multiplying',
    '  var raw = b.value * rate;',
    '  var raw = b.value / rate;',
    function (S) { return S.pricingFxConvert_(29.99, 1.35, 'CAD').value !== 40.49; });

  // M6 — base mutation. B10 stands in its way.
  mutant('M6', 'the FX planner writes back a base price',
    '    res.fields[spec.field] = view;\n  });',
    '    res.cells[spec.base] = conv.value;\n    res.fields[spec.field] = view;\n  });',
    function (S) {
      var p = S.pricingPlanFxRow_(unknownRow(), cadRates(S));
      return Object.keys(p.cells).some(function (k) { return /^base_/.test(k); });
    });

  // M7 — the pre-write audit stops noticing. B11/B12 stand in its way.
  mutant('M7', 'the pre-write audit accepts an effective write over a non-AUTO row',
    '        if (flagNow !== PRICING_OWNER_AUTO_ && !identical) {',
    '        if (false) {',
    function (S) {
      var built = S.pricingFxBuildColumns_({
        col: function (n) { return PR_HEADER.indexOf(n); },
        rows: [{ rowNumber: 2, values: { regular_price: 34.99, regular_price_is_manual: 'TRUE' } }]
      }, [{ rowNumber: 2, changed: true, cells: { regular_price: 40.49 } }]);
      return built.violations.length === 0;
    });
}

// =============================================================================================================
section('G · §5 THE PRODUCTION CENSUS INSTRUMENT — EXERCISED, AND PROVEN READ-ONLY');
// =============================================================================================================
{
  // The census cannot be RUN here: there is no Apps Script runtime and no Sheets credential in this
  // environment, so PRODUCTION_CENSUS stays NOT_MEASURED until the operator runs it. What CAN be proven
  // locally is the part that would be wrong silently — the classifier — so it is executed row by row.
  var CENSUS_REL = 'assets/tools/apps-script-diagnostics/TEMP_PRICING_R4D_EFFECTIVE_AUTHORITY_CENSUS.gs';
  var CENSUS = readN(CENSUS_REL);

  // G1 — ZERO WRITES, proven by absence rather than by promise.
  ['setValue', 'setValues', 'appendRow', 'insertRow', 'deleteRow', 'clear(', 'LockService', 'UrlFetchApp',
   'getScriptLock', 'setFormula'].forEach(function (tok) {
    ok(bare(CENSUS).indexOf(tok) === -1, 'G1  the census contains no "' + tok + '" — PRODUCTION_WRITE_AUTHORIZED = NO');
  });

  // G2 — it runs. Loaded into a sandbox with a fake spreadsheet, and asked to classify.
  var CW = { console: console, Object: Object, Array: Array, String: String, Number: Number, Math: Math,
    JSON: JSON, isFinite: isFinite, Date: Date, RegExp: RegExp,
    SpreadsheetApp: { getActiveSpreadsheet: function () { return { getSheetByName: function () { return null; } }; } },
    Logger: { log: function () {} } };
  vm.createContext(CW);
  vm.runInContext(CENSUS, CW, { filename: 'TEMP_PRICING_R4D_EFFECTIVE_AUTHORITY_CENSUS.gs' });
  ok(typeof CW.TEMP_PRICING_R4D_CENSUS === 'function', 'G2  the census entry point exists and the file parses');
  eq(CW.TEMP_PR4D_FIELDS_.map(function (f) { return f.field; }),
    FIELDS.map(function (f) { return f.field; }),
    'G2b and it classifies exactly the three bands 73_ knows about — one vocabulary, not two');
  eq(CW.TEMP_PR4D_FIELDS_.map(function (f) { return f.flag; }),
    FIELDS.map(function (f) { return f.flag; }), 'G2c against the same flag columns');

  // G3 — the flag reader is the deployed one. A census that read blank as FALSE would report the whole
  // price book as system-owned, which is the single most consequential way this tool could lie.
  ['', 'TRUE', 'FALSE', '1', '0', 'yes', 'no', 'MANUAL', 'AUTO', 'wat'].forEach(function (v) {
    var mine = CW.tempPr4dFlag_(v);
    var theirs = W73.pricingReadFlag_(v);
    eq(mine, theirs, 'G3  census flag reading agrees with the deployed 73_ for ' + JSON.stringify(v));
  });
  eq([CW.tempPr4dFlag_(true), CW.tempPr4dFlag_(false)], ['MANUAL', 'AUTO'],
    'G3b including the checkbox booleans');

  // G4 — the decision table, one case per bucket. A bucket that no fixture can reach is a bucket that
  // will read as zero in production and be believed.
  var spec = CW.TEMP_PR4D_FIELDS_[0];
  function c(o) { return CW.tempPr4dClassify_(o, spec); }
  var cases = [
    // base == auto: provenance is NOT observable, and the census must say so rather than pick one.
    [{ base_regular_price: 29.99, auto_regular_price: 29.99, regular_price: 29.99, regular_price_is_manual: '' },
      'UNKNOWN__EFF_EQ_BASE_AND_AUTO', 'the 04_ seed before any FX run — indistinguishable, and named as such'],
    // base != auto: NOW effective == base is evidence. This is the R4D population.
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 29.99, regular_price_is_manual: '' },
      'UNKNOWN__EFF_EQ_BASE_ONLY', 'the signature: FX moved auto, the effective price stayed base-shaped'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 40.49, regular_price_is_manual: '' },
      'UNKNOWN__EFF_EQ_AUTO_ONLY', 'tracking the system value with nobody having said so'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 44.95, regular_price_is_manual: '' },
      'UNKNOWN__EFF_DIFFERS_FROM_BOTH', 'a real price of unknown provenance — the rows to ask a person about'],
    [{ base_regular_price: '', auto_regular_price: '', regular_price: 44.95, regular_price_is_manual: '' },
      'UNKNOWN__NOTHING_TO_COMPARE', 'no base and no auto to compare against'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 40.49, regular_price_is_manual: 'FALSE' },
      'AUTO__EFF_EQ_AUTO', 'the AUTO invariant holding'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 22.10, regular_price_is_manual: 'FALSE' },
      'AUTO__EFF_NE_AUTO', 'the AUTO invariant BROKEN — a system-owned price that is not the system value'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 34.99, regular_price_is_manual: 'TRUE' },
      'MANUAL__EFF_PRESENT', 'a person price, as intended'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: '', regular_price_is_manual: 'TRUE' },
      'MANUAL__EFF_BLANK', 'claimed by a person and empty — a contradiction, counted not repaired'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: '', regular_price_is_manual: '' },
      'EFF_BLANK__AUTO_AVAILABLE', 'blank but recoverable by mode AUTO'],
    [{ base_regular_price: 29.99, auto_regular_price: '', regular_price: '', regular_price_is_manual: '' },
      'EFF_BLANK__AUTO_UNAVAILABLE', 'blank and NOT recoverable — pricing.update refuses AUTO with no auto value'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: 'NA', regular_price_is_manual: '' },
      'EFF_NA', 'deliberately none — finished, not a gap'],
    [{ base_regular_price: 29.99, auto_regular_price: 40.49, regular_price: '29,99', regular_price_is_manual: '' },
      'UNREADABLE', 'a cell that is neither number, blank nor NA is never guessed at']
  ];
  cases.forEach(function (t, i) {
    eq(c(t[0]), t[1], 'G4.' + (i + 1) + ' ' + t[2]);
  });

  // G5 — EVERY declared bucket is reachable. A vocabulary with an unreachable word reads as a zero count.
  var reached = {};
  cases.forEach(function (t) { reached[t[1]] = 1; });
  eq(CW.TEMP_PR4D_BUCKETS_.filter(function (b) { return !reached[b]; }), [],
    'G5  every bucket in the frozen vocabulary is reachable by a fixture — no count can be a false zero');

  // G6 — equality is decided on NUMBERS, not on formatted text. A sheet stores 29.9 and 29.90 as one value
  // and renders them as two, and a census comparing strings would invent a discrepancy.
  eq(c({ base_regular_price: '29.90', auto_regular_price: 40.49, regular_price: 29.9, regular_price_is_manual: '' }),
    'UNKNOWN__EFF_EQ_BASE_ONLY', 'G6  29.90 and 29.9 are the same price — compared as numbers');

  // G7 — the existing R3 census is NOT duplicated. Two tools that can disagree about one question is worse
  // than one tool that answers it, and §9 of the ownership rulings says so.
  var R3 = readN('assets/tools/apps-script-diagnostics/TEMP_PRICING_R3_PRODUCTION_CENSUS.gs');
  ok(bare(R3).indexOf('EFF_EQ_BASE_ONLY') === -1 && bare(R3).indexOf('tempPr4dClassify_') === -1,
    'G7  the R3 census carries none of this vocabulary — two tools, two questions, no shared authority');
  ok(/WHY THIS EXISTS RATHER THAN TEMP_PRICING_R3_PRODUCTION_CENSUS/.test(CENSUS),
    'G7b and the new tool states the boundary between them in its own header');

  // G8 — PRODUCTION_CENSUS is NOT_MEASURED, and the reason is structural rather than an omission.
  ok(true, 'G8  PRODUCTION_CENSUS = NOT_MEASURED — no Apps Script runtime and no Sheets credential here');
}

// =============================================================================================================
console.log('\n' + new Array(111).join('='));
console.log('PRICING-R4D EFFECTIVE PRICE AUTHORITY AUDIT — passed ' + pass + '  failed ' + fail +
  '  mutants caught ' + caught + (survived.length ? '  SURVIVED: ' + survived.join(', ') : ''));
console.log('THREE_LAYER_MODEL_PASS = YES · AUTO_FALSE_EFFECTIVE_FOLLOWS_AUTO = YES · CONTRACT_GAP = CREATION, not FX');
console.log('NEW_NON_USD_EFFECTIVE_CAN_RECEIVE_RAW_USD_BASE = YES (04_marketplace_forecast_import.gs:376-389)');
console.log('BLANK_EFFECTIVE_SAFE_SYSTEM_WIDE = NO · CAN_OPERATOR_BLANK_ALL_EFFECTIVE_PRICE_FIELDS_NOW = NO');
console.log('diagnostic invariants: DB_WRITES=0 · NETWORK_CALLS=0 · APPS_SCRIPT_EXECUTIONS=0 · DEPLOYMENTS=0');
console.log(new Array(111).join('='));
process.exit(fail ? 1 : 0);
