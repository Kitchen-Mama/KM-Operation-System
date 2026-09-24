/**
 * TEMP — PRICING-R4D §5 — EFFECTIVE PRICE AUTHORITY CENSUS. READ ONLY.
 *
 * PASTE INTO THE APPS SCRIPT PROJECT -> RUN -> REPORT -> REMOVE.
 * Repository-only operator tool. NOT a release file and never synced as one.
 *
 *     TEMP_PRICING_R4D_CENSUS()      // reads pricing_list. Writes NOTHING, takes no lock.
 *
 * WHY THIS EXISTS RATHER THAN TEMP_PRICING_R3_PRODUCTION_CENSUS. That one counts what an FX run would
 * have to work FROM — currencies, pairs, base availability, rate state. This one answers a different
 * question and the two must not be merged: for each of the three effective price fields, WHERE DID THE
 * NUMBER CURRENTLY IN IT COME FROM, and does its ownership flag agree?
 *
 * THE DISTINCTION THAT MATTERS, and it is why the buckets are not the four the task named:
 *
 *   base == auto   on a row seeded by 04_ with fx_rate = 1, the base value and the auto value are the
 *                  SAME NUMBER. "effective == base" and "effective == auto" are then indistinguishable,
 *                  and a census that reported either one would be inventing a provenance it cannot see.
 *                  Those rows get their own bucket: EFF_EQ_BASE_AND_AUTO.
 *   base != auto   an FX run has moved auto away from base. NOW "effective == base" is evidence, and it
 *                  is the signature PRICING-R4D exists for: EFF_EQ_BASE_ONLY.
 *
 * A row in EFF_EQ_BASE_ONLY on a cross-currency site is a price being served in the wrong currency's
 * magnitude. That number, per country / marketplace / currency, is what this tool is for.
 *
 * NOTHING IS CLASSIFIED AND NOTHING IS PROPOSED. Equality is the only inference made, it is made on
 * numbers rather than on formatted text, and a row whose cells cannot be read as numbers is counted as
 * unreadable rather than guessed at.
 *
 * ZERO WRITES. No setValue, no setValues, no appendRow, no LockService, no UrlFetchApp.
 */

var TEMP_PR4D_TAB_ = 'pricing_list';

/** The three bands, each with its base / auto / effective / flag column. Mirrors 73_'s PRICING_FIELDS_. */
var TEMP_PR4D_FIELDS_ = [
  { label: 'REGULAR', base: 'base_regular_price', auto: 'auto_regular_price', field: 'regular_price', flag: 'regular_price_is_manual' },
  { label: 'MINIMUM', base: 'base_minimum_price', auto: 'auto_minimum_price', field: 'minimum_price', flag: 'minimum_price_is_manual' },
  { label: 'MSRP', base: 'base_msrp', auto: 'auto_msrp', field: 'msrp', flag: 'msrp_is_manual' }
];

function tempPr4dStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

/** Blank, NA and "not a number" are three different facts and are never collapsed into one. */
function tempPr4dNum_(v) {
  var s = tempPr4dStr_(v);
  if (s === '') return { present: false, na: false, invalid: false, value: null };
  if (s.toUpperCase() === 'NA' || s.toUpperCase() === 'N/A') return { present: false, na: true, invalid: false, value: null };
  var n = Number(s);
  if (!isFinite(n)) return { present: false, na: false, invalid: true, value: null };
  return { present: true, na: false, invalid: false, value: n };
}

/** Three-state, matching the deployed pricingReadFlag_ exactly. Blank is UNKNOWN, never false. */
function tempPr4dFlag_(v) {
  if (v === true) return 'MANUAL';
  if (v === false) return 'AUTO';
  var s = tempPr4dStr_(v).toUpperCase();
  if (s === '') return 'UNKNOWN';
  if (s === 'TRUE' || s === '1' || s === 'YES' || s === 'Y' || s === 'MANUAL') return 'MANUAL';
  if (s === 'FALSE' || s === '0' || s === 'NO' || s === 'N' || s === 'AUTO') return 'AUTO';
  return 'UNKNOWN';
}

/** The bucket names, declared once so the report and the tallies cannot drift apart. */
var TEMP_PR4D_BUCKETS_ = [
  'UNKNOWN__EFF_EQ_BASE_AND_AUTO',      // indistinguishable: fx_rate = 1 seed, or an identity-currency row
  'UNKNOWN__EFF_EQ_BASE_ONLY',          // THE SIGNATURE: auto has moved, the effective price has not
  'UNKNOWN__EFF_EQ_AUTO_ONLY',          // tracking the system value without anyone having said so
  'UNKNOWN__EFF_DIFFERS_FROM_BOTH',     // a real price of unknown provenance — the one to ask about
  'UNKNOWN__NOTHING_TO_COMPARE',        // no base and no auto on the row
  'AUTO__EFF_EQ_AUTO',                  // the invariant holds
  'AUTO__EFF_NE_AUTO',                  // the invariant is broken — FX has not been run since something moved
  'MANUAL__EFF_PRESENT',                // a person's price, as intended
  'MANUAL__EFF_BLANK',                  // claimed by a person and empty: a contradiction, reported not fixed
  'EFF_BLANK__AUTO_AVAILABLE',          // recoverable by mode AUTO
  'EFF_BLANK__AUTO_UNAVAILABLE',        // NOT recoverable: pricing.update refuses AUTO with no auto value
  'EFF_NA',                             // deliberately none — finished, not a gap
  'UNREADABLE'                          // a cell that is neither number, blank nor NA
];

function tempPr4dNewTally_() {
  var t = {};
  TEMP_PR4D_BUCKETS_.forEach(function (b) { t[b] = 0; });
  return t;
}

/** Classify ONE field of ONE row. Pure. Returns a bucket name from the frozen list above. */
function tempPr4dClassify_(row, spec) {
  var eff = tempPr4dNum_(row[spec.field]);
  var auto = tempPr4dNum_(row[spec.auto]);
  var base = tempPr4dNum_(row[spec.base]);
  var authority = tempPr4dFlag_(row[spec.flag]);

  if (eff.invalid || auto.invalid || base.invalid) return 'UNREADABLE';
  if (eff.na) return 'EFF_NA';

  if (!eff.present) {
    if (authority === 'MANUAL') return 'MANUAL__EFF_BLANK';
    return auto.present ? 'EFF_BLANK__AUTO_AVAILABLE' : 'EFF_BLANK__AUTO_UNAVAILABLE';
  }

  if (authority === 'MANUAL') return 'MANUAL__EFF_PRESENT';
  if (authority === 'AUTO') return auto.present && auto.value === eff.value ? 'AUTO__EFF_EQ_AUTO' : 'AUTO__EFF_NE_AUTO';

  // UNKNOWN — the population this round is about.
  var eqBase = base.present && base.value === eff.value;
  var eqAuto = auto.present && auto.value === eff.value;
  if (eqBase && eqAuto) return 'UNKNOWN__EFF_EQ_BASE_AND_AUTO';
  if (eqBase) return 'UNKNOWN__EFF_EQ_BASE_ONLY';
  if (eqAuto) return 'UNKNOWN__EFF_EQ_AUTO_ONLY';
  if (!base.present && !auto.present) return 'UNKNOWN__NOTHING_TO_COMPARE';
  return 'UNKNOWN__EFF_DIFFERS_FROM_BOTH';
}

function TEMP_PRICING_R4D_CENSUS() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R4D EFFECTIVE PRICE AUTHORITY CENSUS — READ ONLY');
  p('generated_at (script clock): ' + new Date().toISOString());
  p('PRODUCTION_WRITE_AUTHORIZED = NO. This function writes nothing and takes no lock.');
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TEMP_PR4D_TAB_);
  if (!sh) { p('BLOCKED — ' + TEMP_PR4D_TAB_ + ' is not present.'); return done(); }

  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) { p('BLOCKED — ' + TEMP_PR4D_TAB_ + ' has no data rows.'); return done(); }

  var headers = values[0].map(function (h) { return String(h).trim(); });
  function col(n) { return headers.indexOf(n); }

  // Which columns exist at all. A missing flag column is reported, never silently read as blank -> UNKNOWN
  // without saying so, because "the column is absent" and "the cell is empty" are different findings.
  var missing = [];
  ['currency', 'base_currency'].concat(
    TEMP_PR4D_FIELDS_.reduce(function (a, s) { return a.concat([s.base, s.auto, s.field, s.flag]); }, [])
  ).forEach(function (n) { if (col(n) === -1) missing.push(n); });
  p('columns absent from the live sheet: ' + (missing.length ? missing.join(', ') : '(none)'));
  if (missing.length) {
    p('  Every absent column is read as blank below. If the three *_is_manual columns are among them, the');
    p('  §1 migration has not been run and EVERY row is UNKNOWN by construction rather than by evidence.');
  }
  rule();

  function cell(r, name) { var i = col(name); return i === -1 ? '' : r[i]; }

  var total = 0, crossCurrency = 0, sameCurrency = 0, unknownCurrency = 0;
  var byField = {};
  TEMP_PR4D_FIELDS_.forEach(function (s) { byField[s.label] = tempPr4dNewTally_(); });

  // The three breakdowns §5 asks for, each keyed on the row's own cells.
  var byCountry = {}, byMarketplace = {}, byCurrency = {};
  function bump(map, key, bucket) {
    var k = key || '(blank)';
    if (!map[k]) map[k] = { rows: 0, base_only: 0, base_and_auto: 0, auto_ne: 0, manual: 0, blank: 0 };
    return map[k];
  }

  // The rows worth naming individually: a base-shaped effective price on a cross-currency site.
  var suspects = [];

  for (var i = 1; i < values.length; i++) {
    var raw = values[i];
    var row = {};
    headers.forEach(function (h, j) { row[h] = raw[j]; });

    var id = tempPr4dStr_(row.marketplace_sku_id) || tempPr4dStr_(row.pricing_id) || ('row ' + (i + 1));
    var localCur = tempPr4dStr_(row.currency).toUpperCase();
    var baseCur = tempPr4dStr_(row.base_currency).toUpperCase();
    var country = tempPr4dStr_(row.country);
    var marketplace = tempPr4dStr_(row.marketplace);

    total++;
    var cross = false;
    if (!localCur || !baseCur) unknownCurrency++;
    else if (localCur === baseCur) sameCurrency++;
    else { crossCurrency++; cross = true; }

    var cCountry = bump(byCountry, country);
    var cMarket = bump(byMarketplace, marketplace);
    var cCurrency = bump(byCurrency, localCur);
    cCountry.rows++; cMarket.rows++; cCurrency.rows++;

    TEMP_PR4D_FIELDS_.forEach(function (spec) {
      var b = tempPr4dClassify_(row, spec);
      byField[spec.label][b]++;

      [cCountry, cMarket, cCurrency].forEach(function (agg) {
        if (b === 'UNKNOWN__EFF_EQ_BASE_ONLY') agg.base_only++;
        else if (b === 'UNKNOWN__EFF_EQ_BASE_AND_AUTO') agg.base_and_auto++;
        else if (b === 'AUTO__EFF_NE_AUTO') agg.auto_ne++;
        else if (b === 'MANUAL__EFF_PRESENT') agg.manual++;
        else if (b === 'EFF_BLANK__AUTO_AVAILABLE' || b === 'EFF_BLANK__AUTO_UNAVAILABLE') agg.blank++;
      });

      if (cross && b === 'UNKNOWN__EFF_EQ_BASE_ONLY' && suspects.length < 200) {
        suspects.push(id + '  ' + country + '/' + marketplace + '  ' + spec.label +
          '  ' + baseCur + ' ' + tempPr4dStr_(row[spec.base]) +
          '  -> effective ' + localCur + ' ' + tempPr4dStr_(row[spec.field]) +
          '  (auto ' + localCur + ' ' + tempPr4dStr_(row[spec.auto]) + ')');
      }
    });
  }

  p('PRICING_ROWS_TOTAL              = ' + total);
  p('CROSS_CURRENCY_ROWS             = ' + crossCurrency);
  p('SAME_CURRENCY_ROWS              = ' + sameCurrency);
  p('CURRENCY_UNRESOLVED_ROWS        = ' + unknownCurrency);
  rule();

  p('PER-FIELD CLASSIFICATION — every row is in exactly one bucket per field');
  TEMP_PR4D_FIELDS_.forEach(function (spec) {
    p('');
    p('  ' + spec.label + '  (' + spec.field + ')');
    TEMP_PR4D_BUCKETS_.forEach(function (b) {
      p('    ' + b + new Array(Math.max(2, 34 - b.length)).join(' ') + ' = ' + byField[spec.label][b]);
    });
  });
  rule();

  p('READ THE THREE UNKNOWN BUCKETS TOGETHER — they answer different questions');
  p('  EFF_EQ_BASE_AND_AUTO   base and auto are the SAME NUMBER, so provenance is not observable. This is');
  p('                         the 04_ seed (fx_rate = 1) and every identity-currency row. Not a defect by');
  p('                         itself; on a CROSS-CURRENCY row it means FX has never run.');
  p('  EFF_EQ_BASE_ONLY       auto has moved and the effective price has not. On a cross-currency row this');
  p('                         is a price being served at the base currency magnitude. THE R4D POPULATION.');
  p('  EFF_DIFFERS_FROM_BOTH  a real price that matches neither. Equally well explained by an operator edit');
  p('                         made before the flags existed and by an auto value refreshed afterwards, so it');
  p('                         is counted and NOT classified. These are the rows to ask a person about.');
  rule();

  function dump(title, map) {
    p(title);
    Object.keys(map).sort().forEach(function (k) {
      var a = map[k];
      p('    ' + k + new Array(Math.max(2, 26 - k.length)).join(' ') +
        'rows=' + a.rows +
        '  eff_eq_base_only=' + a.base_only +
        '  eff_eq_base_and_auto=' + a.base_and_auto +
        '  auto_invariant_broken=' + a.auto_ne +
        '  manual=' + a.manual +
        '  blank=' + a.blank);
    });
    p('');
  }
  p('BREAKDOWN — counts are FIELD counts (three per row), except rows= which counts rows');
  p('');
  dump('  BY COUNTRY', byCountry);
  dump('  BY MARKETPLACE', byMarketplace);
  dump('  BY CURRENCY (pricing_list.currency)', byCurrency);
  rule();

  p('CROSS-CURRENCY ROWS WHOSE EFFECTIVE PRICE STILL EQUALS THE BASE PRICE (first 200)');
  p('  These are the identities to review. Each line is one FIELD of one row.');
  if (!suspects.length) p('    (none)');
  suspects.forEach(function (s) { p('    ' + s); });
  rule();

  p('WHAT THIS CENSUS DOES NOT SAY');
  p('  It does not say which rows may be repaired. A row in EFF_EQ_BASE_ONLY with a blank flag has no');
  p('  recorded owner, and PRICING-R2 §4A forbids inferring one — including inferring it from the fact');
  p('  that the number happens to equal the base price. Classification is an operator decision, taken per');
  p('  row or in reviewed batches through pricing.update, and this tool exists to size that decision.');
  p('  It also does not recommend blanking anything: PRICING_DATABASE_MAPPING §4D answers that with NO.');
  rule();
  p('CENSUS COMPLETE — ZERO WRITES, no lock taken.');
  return done();
}
