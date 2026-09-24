/**
 * TEMP — PRICING-R3-FX-DRY-RUN-ANOMALY-REVIEW-R1 — FX PLAN DECOMPOSITION. READ ONLY.
 *
 * PASTE INTO THE APPS SCRIPT PROJECT -> RUN -> REPORT -> REMOVE.
 * Repository-only operator tool. NOT a release file and never synced as one.
 *
 *     TEMP_PRICING_R3_FX_DECOMPOSE()     // reads pricing_list. Writes NOTHING, takes no lock.
 *
 * THE QUESTION. A dry run reported AUTO_REGULAR_WOULD_UPDATE = 194, AUTO_MINIMUM = 197, AUTO_MSRP = 194
 * against FX_CONVERTIBLE_ROWS = 193. A per-field count cannot exceed the number of rows being converted,
 * so the excess must come from somewhere the word "convertible" does not cover — and the only other
 * population is the 302 SAME-CURRENCY rows, which are planned through a synthesised identity rate of 1
 * rather than skipped. This tool decomposes each count into CROSS_CURRENCY + SAME_CURRENCY_IDENTITY and
 * says, per row, what made each identity row move.
 *
 * WHY IT CALLS THE DEPLOYED PLANNER INSTEAD OF RECOMPUTING. A decomposition that is computed a second way
 * proves nothing: if it disagrees with the dry run, the disagreement is as likely to be in the instrument
 * as in the subject, and there is no third opinion to break the tie. So the parts here are produced by the
 * SAME pricingPlanFxRow_ call that produced the total being explained, over rows read by the SAME
 * prwReadSheet_. Only the bucketing is new. If 73_ is not loaded this tool refuses to run rather than
 * falling back to a copy of its arithmetic.
 *
 * Every count here is a count. Nothing is classified, nothing is proposed, nothing is written.
 */

var TEMP_PR3D_TAB_ = 'pricing_list';

// THE FROZEN, OPERATOR-APPROVED SNAPSHOT, reproduced value for value. It is the same input the reviewed
// dry run used; a decomposition run against different rates would describe a different plan.
var TEMP_PR3D_RUN_DATE_ = '2026-09-24';
var TEMP_PR3D_FX_SNAPSHOT_ = [
  { base_currency: 'USD', quote_currency: 'AUD', rate: 1.42197, source: 'Wise mid-market', as_of: '2026-09-24' },
  { base_currency: 'USD', quote_currency: 'CAD', rate: 1.41095, source: 'Wise mid-market', as_of: '2026-09-24' },
  { base_currency: 'USD', quote_currency: 'EUR', rate: 0.878851, source: 'Wise mid-market', as_of: '2026-09-24' },
  { base_currency: 'USD', quote_currency: 'GBP', rate: 0.755715, source: 'Wise mid-market', as_of: '2026-09-24' },
  { base_currency: 'USD', quote_currency: 'JPY', rate: 157.915, source: 'Wise mid-market', as_of: '2026-09-24' }
];

// WHAT THE REVIEWED DRY RUN REPORTED. These are not an expectation about what is correct — they are a
// record of the envelope being explained, so that if the table has moved since, the tool says the
// decomposition describes a DIFFERENT plan instead of quietly explaining the wrong numbers.
var TEMP_PR3D_ENVELOPE_ = {
  PRICING_ROWS_TOTAL: 495, SAME_CURRENCY_ROWS: 302, FX_CONVERTIBLE_ROWS: 193,
  rows_planned: 495, rows_changed: 495, skipped_count: 0, log_rows: 585,
  AUTO_REGULAR_WOULD_UPDATE: 194, AUTO_MINIMUM_WOULD_UPDATE: 197, AUTO_MSRP_WOULD_UPDATE: 194,
  EFFECTIVE_REGULAR_WOULD_FOLLOW: 0, EFFECTIVE_MINIMUM_WOULD_FOLLOW: 0, EFFECTIVE_MSRP_WOULD_FOLLOW: 0
};

var TEMP_PR3D_MAX_SAMPLES_ = 25;

function tempPr3dStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }

/**
 * Why ONE identity row's auto_* moved. The distinction matters to the operator: a blank auto being filled
 * for the first time and a stale auto being corrected are both legitimate, but "auto held a number that is
 * neither the old base nor the new one" is the only one that says something was wrong before this run.
 */
function tempPr3dIdentityCause_(storedAuto, baseValue, target) {
  if (storedAuto.invalid) return 'AUTO_INVALID';        // a non-numeric auto cell
  if (storedAuto.na) return 'AUTO_NA';                  // explicitly not applicable
  if (!storedAuto.present) return 'AUTO_BLANK';         // first fill, not a refresh
  if (storedAuto.value === baseValue) return 'BASE_NOT_ROUNDED';  // auto mirrors a base the currency cannot hold
  return 'AUTO_STALE';                                  // auto disagrees with base for some older reason
}

function TEMP_PRICING_R3_FX_DECOMPOSE() {
  var out = [];
  function p(s) { out.push(String(s)); }
  function rule() { p(new Array(101).join('-')); }
  function pad(s, n) { s = String(s); while (s.length < n) s += ' '; return s; }
  function done() { Logger.log(out.join('\n')); return out.join('\n'); }

  p('TEMP PRICING-R3 FX PLAN DECOMPOSITION — READ ONLY');
  p('generated_at (script clock): ' + new Date().toISOString());
  p('run_date used for the plan  : ' + TEMP_PR3D_RUN_DATE_);
  rule();

  // THE AUTHORITY GATE. Every number below has to come from the deployed code, so a missing symbol is a
  // hard stop rather than a reason to reimplement it here.
  var missing = [];
  if (typeof prwReadSheet_ !== 'function') missing.push('prwReadSheet_');
  if (typeof pricingBuildRateTable_ !== 'function') missing.push('pricingBuildRateTable_');
  if (typeof pricingPlanFxRow_ !== 'function') missing.push('pricingPlanFxRow_');
  if (typeof pricingReadNumber_ !== 'function') missing.push('pricingReadNumber_');
  if (typeof pricingRoundFx_ !== 'function') missing.push('pricingRoundFx_');
  if (typeof pricingStr_ !== 'function') missing.push('pricingStr_');
  if (typeof PRICING_FIELDS_ === 'undefined') missing.push('PRICING_FIELDS_');
  if (typeof PRICING_FX_DECIMALS_ === 'undefined') missing.push('PRICING_FX_DECIMALS_');
  if (missing.length) {
    p('AUTHORITY_NOT_LOADED — sync 73_api_v1_pricing_write.gs and SAVE first.');
    missing.forEach(function (n) { p('  missing: ' + n); });
    p('This tool will not substitute its own arithmetic for the planner it is supposed to be explaining.');
    p('BLOCKED'); return done();
  }
  p('planner authority: pricingPlanFxRow_ from the deployed 73_ (this tool recomputes nothing)');
  rule();

  var table = pricingBuildRateTable_(TEMP_PR3D_FX_SNAPSHOT_);
  if (!table.ok) {
    p('FX_SNAPSHOT_REJECTED by the deployed builder:');
    table.errors.forEach(function (e) { p('  ' + e.code + '  ' + (e.pair || '') + '  ' + (e.detail || '')); });
    p('BLOCKED'); return done();
  }
  table.runDate = TEMP_PR3D_RUN_DATE_;
  p('FX_PAIRS_SUPPLIED               = ' + table.pairs.join(', '));
  p('  (USD>USD is deliberately absent; the planner synthesises it as an identity)');
  rule();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TEMP_PR3D_TAB_);
  if (!sh) { p('BLOCKED — ' + TEMP_PR3D_TAB_ + ' is not present.'); return done(); }
  var state = prwReadSheet_(sh);

  var LBL = { regular_price: 'REGULAR', minimum_price: 'MINIMUM', msrp: 'MSRP' };
  var split = {}, cause = {}, autoCensus = {}, blankBaseStaleAuto = {}, crossNoMove = {};
  PRICING_FIELDS_.forEach(function (s) {
    split[s.field] = { CROSS: 0, IDENTITY: 0 };
    cause[s.field] = {};
    autoCensus[s.field] = { existing: 0, blank: 0 };
    blankBaseStaleAuto[s.field] = 0;
    crossNoMove[s.field] = {};
  });

  var rowsPlanned = 0, rowsChanged = 0, skipped = 0, sameCurrency = 0, crossCurrency = 0;
  var logAuto = 0, logEffective = 0, effectiveFollowed = 0;
  var writeKeys = {}, flagKeysInWriteSet = [], effectiveKeysInWriteSet = [];
  var identityTargetMismatch = [], samples = [], fxRate1Post = 0;
  var seen = {}, skipReasons = {};

  // THE BLANK-BASE CENSUS RUNS OVER EVERY DATA ROW, before any guard. "Does a row whose base price is blank
  // still carry an auto price" is a question about the table, not about what this run may write to it, and
  // a duplicate or unidentified row is still a row someone reads a price off.
  state.rows.forEach(function (r) {
    PRICING_FIELDS_.forEach(function (s) {
      var b = pricingReadNumber_(r.values[s.base]);
      var a = pricingReadNumber_(r.values[s.auto]);
      if (a.present) autoCensus[s.field].existing++; else autoCensus[s.field].blank++;
      if (!b.present && a.present) blankBaseStaleAuto[s.field]++;
    });
  });

  state.rows.forEach(function (r) {
    var v = r.values;
    var id = tempPr3dStr_(v.marketplace_sku_id);
    // The same two guards pricingPlanFxBatch_ applies, in the same order, so the row SET being decomposed
    // is the row set that was planned. A decomposition over a different population explains nothing.
    if (!id) { skipped++; skipReasons.IDENTITY_MISSING = (skipReasons.IDENTITY_MISSING || 0) + 1; return; }
    if (seen[id]) { skipped++; skipReasons.DUPLICATE_IDENTITY = (skipReasons.DUPLICATE_IDENTITY || 0) + 1; return; }
    seen[id] = r.rowNumber;

    var plan = pricingPlanFxRow_(v, table);
    if (!plan.ok) { skipped++; skipReasons[plan.skip] = (skipReasons[plan.skip] || 0) + 1; return; }

    rowsPlanned++;
    if (plan.changed) rowsChanged++;
    if (plan.identity) sameCurrency++; else crossCurrency++;
    if (plan.cells.fx_rate === 1) fxRate1Post++;

    Object.keys(plan.cells).forEach(function (k) { writeKeys[k] = 1; });
    plan.logs.forEach(function (lg) {
      if (lg.field_name.indexOf('auto_') === 0) logAuto++; else logEffective++;
    });

    var localCurrency = pricingStr_(v.currency).toUpperCase();

    PRICING_FIELDS_.forEach(function (s) {
      var f = plan.fields[s.field];
      if (!f) return;
      if (f.effective_changed) effectiveFollowed++;
      if (!f.auto_changed) {
        if (!plan.identity) crossNoMove[s.field][f.reason || 'AUTO_ALREADY_CURRENT'] =
          (crossNoMove[s.field][f.reason || 'AUTO_ALREADY_CURRENT'] || 0) + 1;
        return;
      }
      split[s.field][plan.identity ? 'IDENTITY' : 'CROSS']++;
      if (!plan.identity) return;

      // THE CLAIM UNDER TEST, row by row: an identity row's projected auto is the base price rounded to the
      // local currency's precision and nothing else. Proved against pricingRoundFx_ rather than against a
      // multiplication written here, because "times one" is exactly the step a bug would also get right.
      var b = pricingReadNumber_(v[s.base]);
      var target = pricingRoundFx_(b.value, localCurrency);
      if (f.value !== target) {
        identityTargetMismatch.push({ row: r.rowNumber, sku: tempPr3dStr_(v.sku), field: s.field,
          base: b.value, planned: f.value, rounded_base: target });
      }
      var storedAuto = pricingReadNumber_(v[s.auto]);
      var why = tempPr3dIdentityCause_(storedAuto, b.value, f.value);
      cause[s.field][why] = (cause[s.field][why] || 0) + 1;
      if (samples.length < TEMP_PR3D_MAX_SAMPLES_) {
        samples.push({ row: r.rowNumber, sku: tempPr3dStr_(v.sku), currency: localCurrency,
          field: s.field, base: tempPr3dStr_(v[s.base]), old_auto: tempPr3dStr_(v[s.auto]),
          new_auto: f.value, why: why });
      }
    });
  });

  // The write set is read off the plans, not asserted from the handler's report, so "no effective price and
  // no ownership flag is written" is measured on the thing that would actually be written.
  var FLAGS = {}, EFFECTIVE = {};
  PRICING_FIELDS_.forEach(function (s) { FLAGS[s.flag] = 1; EFFECTIVE[s.field] = 1; });
  Object.keys(writeKeys).forEach(function (k) {
    if (FLAGS[k]) flagKeysInWriteSet.push(k);
    if (EFFECTIVE[k]) effectiveKeysInWriteSet.push(k);
  });

  rule();
  p('1 · THE PLAN, RECOUNTED FROM THE SAME PLANNER');
  rule();
  var envOk = (rowsPlanned === TEMP_PR3D_ENVELOPE_.rows_planned)
    && (rowsChanged === TEMP_PR3D_ENVELOPE_.rows_changed)
    && (sameCurrency === TEMP_PR3D_ENVELOPE_.SAME_CURRENCY_ROWS)
    && (crossCurrency === TEMP_PR3D_ENVELOPE_.FX_CONVERTIBLE_ROWS);
  p('rows_planned                    = ' + rowsPlanned + '   (envelope ' + TEMP_PR3D_ENVELOPE_.rows_planned + ')');
  p('rows_changed                    = ' + rowsChanged + '   (envelope ' + TEMP_PR3D_ENVELOPE_.rows_changed + ')');
  p('skipped_count                   = ' + skipped + '   (envelope ' + TEMP_PR3D_ENVELOPE_.skipped_count + ')');
  Object.keys(skipReasons).forEach(function (k) { p('  skipped ' + k + ' = ' + skipReasons[k]); });
  p('SAME_CURRENCY_ROWS              = ' + sameCurrency + '   (envelope ' + TEMP_PR3D_ENVELOPE_.SAME_CURRENCY_ROWS + ')');
  p('FX_CONVERTIBLE_ROWS             = ' + crossCurrency + '   (envelope ' + TEMP_PR3D_ENVELOPE_.FX_CONVERTIBLE_ROWS + ')');
  p('ENVELOPE_STILL_DESCRIBES_TABLE  = ' + (envOk ? 'YES' : 'NO — the table has moved; the decomposition below describes the CURRENT plan'));

  rule();
  p('2 · THE DECOMPOSITION');
  rule();
  var sumsMatch = true;
  PRICING_FIELDS_.forEach(function (s) {
    var key = 'AUTO_' + LBL[s.field] + '_WOULD_UPDATE';
    var tot = split[s.field].CROSS + split[s.field].IDENTITY;
    var expected = TEMP_PR3D_ENVELOPE_[key];
    if (tot !== expected) sumsMatch = false;
    p(pad(key, 32) + '= ' + tot + '   (envelope ' + expected + (tot === expected ? '' : '  <<< DIFFERS') + ')');
    p('  CROSS_CURRENCY                = ' + split[s.field].CROSS);
    p('  SAME_CURRENCY_IDENTITY        = ' + split[s.field].IDENTITY);
    var cs = Object.keys(cause[s.field]).sort();
    if (cs.length) {
      p('  why the identity rows moved:');
      cs.forEach(function (w) { p('    ' + pad(w, 20) + ' ' + cause[s.field][w]); });
    }
    var cn = Object.keys(crossNoMove[s.field]).sort();
    if (cn.length) {
      p('  cross-currency rows that did NOT move:');
      cn.forEach(function (w) { p('    ' + pad(w, 20) + ' ' + crossNoMove[s.field][w]); });
    }
  });
  p('DECOMPOSITION_SUMS_MATCH        = ' + (sumsMatch ? 'YES' : 'NO'));

  rule();
  p('3 · EVERY IDENTITY CHANGE IS THE ROUNDED BASE, NOT AN UNRELATED MUTATION');
  rule();
  p('IDENTITY_TARGET_MISMATCHES      = ' + identityTargetMismatch.length);
  identityTargetMismatch.slice(0, TEMP_PR3D_MAX_SAMPLES_).forEach(function (m) {
    p('  row ' + m.row + '  ' + m.sku + '  ' + m.field + '  base=' + m.base
      + '  planned=' + m.planned + '  ROUND(base)=' + m.rounded_base);
  });
  p('IDENTITY_AUTO_EQUALS_ROUNDED_BASE = ' + (identityTargetMismatch.length === 0 ? 'YES' : 'NO'));
  if (samples.length) {
    p('sample identity changes (first ' + samples.length + '):');
    samples.forEach(function (s) {
      p('  row ' + pad(s.row, 5) + pad(s.sku, 14) + pad(s.currency, 5) + pad(s.field, 15)
        + 'base=' + pad(s.base, 12) + 'auto ' + pad(s.old_auto === '' ? '(blank)' : s.old_auto, 12)
        + '-> ' + pad(s.new_auto, 12) + s.why);
    });
  }

  rule();
  p('4 · THE LOG PROJECTION');
  rule();
  var autoSum = 0;
  PRICING_FIELDS_.forEach(function (s) { autoSum += split[s.field].CROSS + split[s.field].IDENTITY; });
  p('log rows from auto_* changes    = ' + logAuto);
  p('log rows from effective changes = ' + logEffective);
  p('sum of AUTO_*_WOULD_UPDATE      = ' + autoSum);
  p('envelope log_rows               = ' + TEMP_PR3D_ENVELOPE_.log_rows);
  p('LOG_ROWS_EQUALS_AUTO_SUM        = ' + ((logAuto === autoSum && logEffective === 0) ? 'YES' : 'NO'));

  rule();
  p('5 · THE WRITE SET');
  rule();
  p('columns_to_write                = ' + Object.keys(writeKeys).sort().join(', '));
  p('EFFECTIVE_IN_WRITE_SET          = ' + (effectiveKeysInWriteSet.length ? effectiveKeysInWriteSet.join(', ') : 'NONE'));
  p('FLAG_IN_WRITE_SET               = ' + (flagKeysInWriteSet.length ? flagKeysInWriteSet.join(', ') : 'NONE'));
  p('EFFECTIVE_*_WOULD_FOLLOW (all)  = ' + effectiveFollowed);
  p('FX_RATE_1_POST                  = ' + fxRate1Post + '   (rows left at rate 1 — every one an identity)');

  rule();
  p('6 · BLANK BASE WITH A STALE AUTO STILL IN THE CELL');
  rule();
  p('The planner does not blank an auto whose base has gone away — a blank base is BASE_MISSING and the row');
  p('is left exactly as it stands. So an auto value beside a blank base survives this run untouched.');
  PRICING_FIELDS_.forEach(function (s) {
    p(pad('BASE_' + LBL[s.field] + '_BLANK_WITH_AUTO_NONBLANK', 40) + '= ' + blankBaseStaleAuto[s.field]);
  });
  var anyStale = PRICING_FIELDS_.some(function (s) { return blankBaseStaleAuto[s.field] > 0; });
  p('BLANK_BASE_STALE_AUTO_PRESENT   = ' + (anyStale ? 'YES' : 'NO'));
  p('(measured only — nothing is cleaned here)');

  rule();
  p('7 · THE AUTO REFERENCE CENSUS');
  rule();
  PRICING_FIELDS_.forEach(function (s) {
    p(pad('AUTO_' + LBL[s.field] + '_EXISTING', 32) + '= ' + autoCensus[s.field].existing
      + '   ' + pad('AUTO_' + LBL[s.field] + '_BLANK', 24) + '= ' + autoCensus[s.field].blank);
  });

  rule();
  p('DB_WRITES                       = 0');
  p('PRICING_CHANGE_LOG_ROWS_WRITTEN = 0');
  p('FX_EXECUTION_AUTHORIZED         = NO');
  rule();
  return done();
}
