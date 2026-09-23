/**
 * TEMP — PRICING-R3-EXECUTION-R1 §5 — PRODUCTION PRICING CENSUS. READ ONLY.
 *
 * PASTE INTO THE APPS SCRIPT PROJECT -> RUN -> REPORT -> REMOVE.
 * Repository-only operator tool. NOT a release file and never synced as one.
 *
 *     TEMP_PRICING_R3_CENSUS()      // reads pricing_list. Writes NOTHING, takes no lock.
 *
 * WHY THIS EXISTS RATHER THAN A dry_run CALL. pricing.fxReconcile's dry run answers most of this, but it
 * cannot run until rates are supplied — and the rates that have to be supplied are the CURRENCY PAIRS this
 * census is what tells you. Asking for rates first and counting second would mean guessing which currencies
 * are live, and a guessed pair list is how a reconciliation quietly skips a whole marketplace.
 *
 * It also reports one number the shipped handler does not: rows where `currency != base_currency` and
 * `fx_rate == 1`. That is the population PRICING-R3 exists for. 04_ seeds every auto-created row with
 * fx_rate = 1 and auto_* copied straight from the base prices, whatever the site currency is, and nothing
 * has recomputed them since — so on those rows the system reference value is the base number wearing the
 * local currency's label. Counting them BEFORE any reconciliation is what makes the effect of the run
 * measurable afterwards.
 *
 * Every count here is a count. Nothing is classified, nothing is proposed, nothing is written.
 */

var TEMP_PR3C_TAB_ = 'pricing_list';

function tempPr3cStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function tempPr3cNum_(v) {
  var s = tempPr3cStr_(v);
  if (s === '') return { present: false, na: false, value: null, invalid: false };
  if (s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return { present: false, na: true, value: null, invalid: false };
  var n = Number(s);
  if (!isFinite(n)) return { present: false, na: false, value: null, invalid: true };
  return { present: true, na: false, value: n, invalid: false };
}
/** Three-state, matching the deployed pricingReadFlag_ exactly. Blank is UNKNOWN, never false. */
function tempPr3cFlag_(v) {
  if (v === true) return 'MANUAL';
  if (v === false) return 'AUTO';
  var s = tempPr3cStr_(v).toUpperCase();
  if (s === '') return 'UNKNOWN';
  if (s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'MANUAL') return 'MANUAL';
  if (s === 'FALSE' || s === '0' || s === 'NO' || s === 'N' || s === 'AUTO') return 'AUTO';
  return 'UNKNOWN';
}

function TEMP_PRICING_R3_CENSUS() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R3 PRODUCTION CENSUS — READ ONLY');
  p('generated_at (script clock): ' + new Date().toISOString());
  rule();

  // Precision authority from the deployed 73_, never a copy here.
  var DECIMALS = (typeof PRICING_FX_DECIMALS_ !== 'undefined') ? PRICING_FX_DECIMALS_ : null;
  if (!DECIMALS) {
    p('AUTHORITY_NOT_LOADED: PRICING_FX_DECIMALS_ — sync 73_ and SAVE first.');
    p('BLOCKED'); return done();
  }
  p('supported currencies (frozen precision contract, from the deployed 73_):');
  Object.keys(DECIMALS).forEach(function (c) { p('  ' + c + ' = ' + DECIMALS[c] + ' decimals'); });
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TEMP_PR3C_TAB_);
  if (!sh) { p('BLOCKED — ' + TEMP_PR3C_TAB_ + ' is not present.'); return done(); }

  var grid = sh.getDataRange().getValues();
  var header = (grid[0] || []).map(function (h) { return tempPr3cStr_(h).toLowerCase(); });
  function col(n) { return header.indexOf(n); }
  function cell(row, n) { var c = col(n); return c === -1 ? '' : row[c]; }

  var FIELDS = [
    { f: 'regular_price', a: 'auto_regular_price', b: 'base_regular_price', g: 'regular_price_is_manual', L: 'REGULAR' },
    { f: 'minimum_price', a: 'auto_minimum_price', b: 'base_minimum_price', g: 'minimum_price_is_manual', L: 'MINIMUM' },
    { f: 'msrp', a: 'auto_msrp', b: 'base_msrp', g: 'msrp_is_manual', L: 'MSRP' }
  ];
  var flagsPresent = FIELDS.every(function (s) { return col(s.g) !== -1; });
  p('ownership flag columns present: ' + (flagsPresent ? 'YES' : 'NO — the §1 migration has not been run'));
  if (!flagsPresent) p('  (every row is reported UNKNOWN below, which is what a missing column means)');
  rule();

  var c = {
    PRICING_ROWS_TOTAL: 0, SAME_CURRENCY_ROWS: 0, FX_CONVERTIBLE_ROWS: 0,
    UNKNOWN_AUTHORITY_ROWS: 0,
    MISSING_BASE_CURRENCY_ROWS: 0, MISSING_LOCAL_CURRENCY_ROWS: 0,
    MISSING_BASE_REGULAR_ROWS: 0, MISSING_BASE_MINIMUM_ROWS: 0, MISSING_BASE_MSRP_ROWS: 0,
    DUPLICATE_PRICING_IDENTITY_ROWS: 0, INVALID_ROWS: 0,
    UNSUPPORTED_CURRENCY_ROWS: 0, IDENTITY_MISSING_ROWS: 0,
    CROSS_CURRENCY_FX_RATE_1_PRE: 0
  };
  var authority = { REGULAR: { MANUAL: 0, AUTO: 0, UNKNOWN: 0 }, MINIMUM: { MANUAL: 0, AUTO: 0, UNKNOWN: 0 }, MSRP: { MANUAL: 0, AUTO: 0, UNKNOWN: 0 } };
  var localCurrencies = {}, baseCurrencies = {}, pairs = {}, unsupported = {};
  var seen = {}, dupes = [], invalid = [], crossOnes = [];

  for (var r = 1; r < grid.length; r++) {
    var row = grid[r];
    c.PRICING_ROWS_TOTAL++;
    var id = tempPr3cStr_(cell(row, 'marketplace_sku_id'));
    var pid = tempPr3cStr_(cell(row, 'pricing_id'));
    var loc = tempPr3cStr_(cell(row, 'currency')).toUpperCase();
    var base = tempPr3cStr_(cell(row, 'base_currency')).toUpperCase();

    if (!id) { c.IDENTITY_MISSING_ROWS++; }
    else if (seen[id]) { c.DUPLICATE_PRICING_IDENTITY_ROWS++; dupes.push('row ' + (r + 1) + ' msku=' + id + ' (first at row ' + seen[id] + ')'); }
    else seen[id] = r + 1;

    if (!loc) c.MISSING_LOCAL_CURRENCY_ROWS++; else localCurrencies[loc] = (localCurrencies[loc] || 0) + 1;
    if (!base) c.MISSING_BASE_CURRENCY_ROWS++; else baseCurrencies[base] = (baseCurrencies[base] || 0) + 1;

    if (loc && !Object.prototype.hasOwnProperty.call(DECIMALS, loc)) {
      c.UNSUPPORTED_CURRENCY_ROWS++; unsupported[loc] = (unsupported[loc] || 0) + 1;
    }
    if (loc && base) {
      if (loc === base) c.SAME_CURRENCY_ROWS++;
      else { c.FX_CONVERTIBLE_ROWS++; pairs[base + '>' + loc] = (pairs[base + '>' + loc] || 0) + 1; }
    }

    // THE POPULATION R3 EXISTS FOR: a converted site still carrying the seeded identity rate.
    var fx = tempPr3cNum_(cell(row, 'fx_rate'));
    if (loc && base && loc !== base && fx.present && fx.value === 1) {
      c.CROSS_CURRENCY_FX_RATE_1_PRE++;
      if (crossOnes.length < 25) crossOnes.push('row ' + (r + 1) + '  ' + pid + '  ' + base + '>' + loc + '  sku=' + tempPr3cStr_(cell(row, 'sku')));
    }

    var rowInvalid = false, rowUnknown = false;
    FIELDS.forEach(function (s) {
      var b = tempPr3cNum_(cell(row, s.b));
      if (!b.present) {
        if (s.L === 'REGULAR') c.MISSING_BASE_REGULAR_ROWS++;
        else if (s.L === 'MINIMUM') c.MISSING_BASE_MINIMUM_ROWS++;
        else c.MISSING_BASE_MSRP_ROWS++;
      }
      if (b.invalid) rowInvalid = true;
      var a = tempPr3cNum_(cell(row, s.a));
      if (a.invalid) rowInvalid = true;
      var e = tempPr3cNum_(cell(row, s.f));
      if (e.invalid) rowInvalid = true;
      var auth = flagsPresent ? tempPr3cFlag_(cell(row, s.g)) : 'UNKNOWN';
      authority[s.L][auth]++;
      if (auth === 'UNKNOWN') rowUnknown = true;
    });
    if (rowInvalid) { c.INVALID_ROWS++; if (invalid.length < 25) invalid.push('row ' + (r + 1) + '  ' + pid); }
    if (rowUnknown) c.UNKNOWN_AUTHORITY_ROWS++;
  }

  p('PRICING_ROWS_TOTAL              = ' + c.PRICING_ROWS_TOTAL);
  p('SAME_CURRENCY_ROWS              = ' + c.SAME_CURRENCY_ROWS);
  p('FX_CONVERTIBLE_ROWS             = ' + c.FX_CONVERTIBLE_ROWS);
  p('UNKNOWN_AUTHORITY_ROWS          = ' + c.UNKNOWN_AUTHORITY_ROWS);
  rule();
  p('AUTHORITY PER FIELD (three-state; blank = UNKNOWN, never false)');
  ['REGULAR', 'MINIMUM', 'MSRP'].forEach(function (L) {
    p('  ' + L + ':  MANUAL=' + authority[L].MANUAL + '  AUTO=' + authority[L].AUTO + '  UNKNOWN=' + authority[L].UNKNOWN);
  });
  rule();
  p('SUPPORTED_CURRENCIES (live, local) :');
  Object.keys(localCurrencies).sort().forEach(function (k) {
    p('  ' + k + '  rows=' + localCurrencies[k] + (Object.prototype.hasOwnProperty.call(DECIMALS, k) ? '  [' + DECIMALS[k] + 'dp]' : '  *** NOT IN THE FROZEN PRECISION CONTRACT ***'));
  });
  p('BASE_CURRENCIES :');
  Object.keys(baseCurrencies).sort().forEach(function (k) { p('  ' + k + '  rows=' + baseCurrencies[k]); });
  p('CURRENCY_PAIRS_REQUIRED (base>local, same-currency excluded — an identity needs no rate) :');
  var pk = Object.keys(pairs).sort();
  if (!pk.length) p('  (none)');
  pk.forEach(function (k) { p('  ' + k + '  rows=' + pairs[k]); });
  rule();
  p('MISSING_BASE_CURRENCY_ROWS      = ' + c.MISSING_BASE_CURRENCY_ROWS);
  p('MISSING_LOCAL_CURRENCY_ROWS     = ' + c.MISSING_LOCAL_CURRENCY_ROWS);
  p('MISSING_BASE_REGULAR_ROWS       = ' + c.MISSING_BASE_REGULAR_ROWS);
  p('MISSING_BASE_MINIMUM_ROWS       = ' + c.MISSING_BASE_MINIMUM_ROWS);
  p('MISSING_BASE_MSRP_ROWS          = ' + c.MISSING_BASE_MSRP_ROWS);
  p('UNSUPPORTED_CURRENCY_ROWS       = ' + c.UNSUPPORTED_CURRENCY_ROWS);
  Object.keys(unsupported).sort().forEach(function (k) { p('    ' + k + ' : ' + unsupported[k] + ' rows — these FAIL CLOSED and are skipped, never converted at a guessed precision'); });
  p('IDENTITY_MISSING_ROWS           = ' + c.IDENTITY_MISSING_ROWS);
  p('DUPLICATE_PRICING_IDENTITY_ROWS = ' + c.DUPLICATE_PRICING_IDENTITY_ROWS);
  dupes.slice(0, 25).forEach(function (d) { p('    ' + d); });
  p('INVALID_ROWS                    = ' + c.INVALID_ROWS + '  (a price/FX cell that is neither a number, blank nor NA)');
  invalid.forEach(function (d) { p('    ' + d); });
  rule();
  p('CROSS_CURRENCY_FX_RATE_1_PRE    = ' + c.CROSS_CURRENCY_FX_RATE_1_PRE);
  p('  Rows whose local currency differs from their base currency and that still carry fx_rate = 1.');
  p('  This is the population PRICING-R3 exists for: 04_ seeds every auto-created row that way and nothing');
  p('  has recomputed it since, so their auto_* is the base number wearing the local currency label.');
  crossOnes.forEach(function (d) { p('    ' + d); });
  rule();
  p('CENSUS COMPLETE — ZERO WRITES, no lock taken.');
  p('Next: supply exactly the CURRENCY_PAIRS_REQUIRED above to pricing.fxReconcile with dry_run omitted');
  p('(dry run is the default). Do not supply a rate for a pair this census did not list.');
  return done();
}
