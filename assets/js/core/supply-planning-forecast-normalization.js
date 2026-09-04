// ================================================================================================================
// KMFCN — CANONICAL FORECAST MONTH NORMALIZATION (F1-7N-FC-1B-E3-R3-R1 §1)
// ----------------------------------------------------------------------------------------------------------------
// THE ONE PLACE THAT DECIDES WHAT AN ABSENT FORECAST MONTH MEANS.
//
// The rule, set by the user and frozen here:
//
//   • a month holding an explicit numeric 0        → 0   (EXPLICIT_ZERO)
//   • a month whose cell is blank                  → 0   (DEFAULT_ZERO_BLANK_MONTH)
//   • a month whose YEAR ROW does not exist yet    → 0   (DEFAULT_ZERO_MISSING_YEAR)
//   • a month holding a valid number               → that number (ACTUAL)
//
// None of those three zeros may block Inventory Summary, Shipping AI Plan or Ordering. They are all the same
// statement — "nothing is forecast for that month" — and a forecast of nothing is a fact, not an absence of one.
//
// WHAT STILL BLOCKS, and the distinction is the whole point of this module: a zero is only legitimate when the
// system actually LOOKED and found nothing. If the read failed, the table or a required header is gone, the
// scope identity is incomplete, a value is present but not a number, or two rows disagree, then nothing is
// known about that month and defaulting it to 0 would be inventing data. Those cases are refused, by code:
//
//   REQUEST_TIMEOUT · TRANSPORT_FAILURE · TABLE_MISSING · REQUIRED_HEADER_MISSING · SCOPE_IDENTITY_INCOMPLETE ·
//   INVALID_NUMERIC_VALUE · DUPLICATE_CONFLICTING_ROWS · READ_OUTCOME_UNKNOWN
//
// WHY THIS IS A SHARED MODULE AND NOT A LOCAL HELPER. The same absent month was already being read two ways by
// two consumers of the SAME table. Inventory Summary skips a month it cannot resolve and carries on (its basis
// loop adds nothing for it; its per-month override loop `return`s), which is how the screen showed a Suggested
// Qty of 520 for a SKU with no 2027 row at all. The weekly Shipping AI Plan treated the identical absence as
// FORECAST_SHARE_INCOMPLETE and dropped the whole site, which zeroed the receiver universe and produced
// HARVEST_NOT_READY. One fact, two opposite readings, and the divergence was invisible because neither side
// named what it was doing. A single authority is what stops that recurring.
//
// DUPLICATE POLICY IS INHERITED, NOT INVENTED. The shipped selection rule (42_ recoWsRegularForecastByMonth_)
// keeps a month only when the matching rows carry EXACTLY ONE distinct finite value — so rows that agree are
// already tolerated and rows that disagree are already discarded. This module keeps both halves and only makes
// the second one SAY so: agreeing duplicates resolve to their single value, disagreeing ones raise
// DUPLICATE_CONFLICTING_ROWS instead of silently becoming an absence. No merge is invented here.
//
// THIS MODULE NEVER WRITES. It is runtime normalization, not a migration: the zeros it produces are used for the
// calculation in flight and are never persisted back to fc_regular_forecast.
// ================================================================================================================
(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = mod;
  if (root) root.KMFCN = mod;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // The provenance of a resolved month. Every value carries one, so an audit can always answer "where did this
  // number come from" without re-deriving it.
  var PROVENANCE = {
    ACTUAL: 'ACTUAL',
    EXPLICIT_ZERO: 'EXPLICIT_ZERO',
    DEFAULT_ZERO_BLANK_MONTH: 'DEFAULT_ZERO_BLANK_MONTH',
    DEFAULT_ZERO_MISSING_YEAR: 'DEFAULT_ZERO_MISSING_YEAR'
  };
  // The refusals. A month that resolves to one of these has NO value — it is not zero, it is unknown.
  var BLOCK = {
    REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
    TRANSPORT_FAILURE: 'TRANSPORT_FAILURE',
    TABLE_MISSING: 'TABLE_MISSING',
    REQUIRED_HEADER_MISSING: 'REQUIRED_HEADER_MISSING',
    SCOPE_IDENTITY_INCOMPLETE: 'SCOPE_IDENTITY_INCOMPLETE',
    INVALID_NUMERIC_VALUE: 'INVALID_NUMERIC_VALUE',
    DUPLICATE_CONFLICTING_ROWS: 'DUPLICATE_CONFLICTING_ROWS',
    READ_OUTCOME_UNKNOWN: 'READ_OUTCOME_UNKNOWN'
  };
  var BLOCK_CODES = Object.keys(BLOCK).map(function (k) { return BLOCK[k]; });
  var MONTH_ABBR = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  var REQUIRED_HEADERS = ['year', 'company', 'country', 'marketplace', 'sku'];

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function isBlank(v) { return v === '' || v === null || v === undefined; }

  /**
   * The READ CONTEXT gate — the half of the contract that keeps a zero honest. It answers ONE question: did the
   * system successfully look? Everything downstream may only default to zero once this says yes.
   *
   * `readSucceeded !== true` is deliberately NOT the same as `readSucceeded === false`: an undefined outcome is
   * READ_OUTCOME_UNKNOWN, because a caller that forgot to say is not a caller that observed success.
   */
  function checkContext(ctx) {
    ctx = ctx || {};
    if (ctx.readOutcomeUnknown === true) return BLOCK.READ_OUTCOME_UNKNOWN;
    if (ctx.timedOut === true) return BLOCK.REQUEST_TIMEOUT;
    if (ctx.transportFailed === true) return BLOCK.TRANSPORT_FAILURE;
    if (ctx.readSucceeded !== true) return BLOCK.READ_OUTCOME_UNKNOWN;
    if (ctx.tableMissing === true) return BLOCK.TABLE_MISSING;
    if (ctx.schemaValid === false) return BLOCK.REQUIRED_HEADER_MISSING;
    if (Array.isArray(ctx.headers) && ctx.headers.length) {
      var lower = ctx.headers.map(function (h) { return str(h).toLowerCase(); });
      for (var i = 0; i < REQUIRED_HEADERS.length; i++) {
        if (lower.indexOf(REQUIRED_HEADERS[i]) === -1) return BLOCK.REQUIRED_HEADER_MISSING;
      }
    }
    if (ctx.scopeValid === false) return BLOCK.SCOPE_IDENTITY_INCOMPLETE;
    return null;
  }

  /** A scope is usable only when every dimension the business key needs is present. */
  function scopeComplete(scope, sku) {
    scope = scope || {};
    return !!(str(scope.company) && str(scope.country) && str(scope.marketplace) && str(sku));
  }

  /**
   * ONE MONTH. `matchingRows` are the rows already filtered to this scope + sku (any year); the year is taken
   * from `month` so the caller never has to pre-partition by year and cannot get that split wrong.
   *
   * Returns { ok, value, provenance, code, rowCount, distinctCount }.
   */
  function normalizeMonth(input) {
    input = input || {};
    var ctx = input.context || {};
    var blocked = checkContext(ctx);
    if (blocked) return { ok: false, value: null, provenance: null, code: blocked, rowCount: 0, distinctCount: 0 };
    if (!scopeComplete(input.scope, input.sku)) {
      return { ok: false, value: null, provenance: null, code: BLOCK.SCOPE_IDENTITY_INCOMPLETE, rowCount: 0, distinctCount: 0 };
    }
    var m = /^(\d{4})-(\d{2})$/.exec(str(input.month));
    if (!m) return { ok: false, value: null, provenance: null, code: BLOCK.SCOPE_IDENTITY_INCOMPLETE, rowCount: 0, distinctCount: 0 };
    var year = Number(m[1]), abbr = MONTH_ABBR[Number(m[2]) - 1];
    if (!abbr) return { ok: false, value: null, provenance: null, code: BLOCK.SCOPE_IDENTITY_INCOMPLETE, rowCount: 0, distinctCount: 0 };

    var rows = (input.matchingRows || []).filter(function (r) { return r && Number(r.year) === year; });
    if (!rows.length) {
      // NO ROW FOR THE YEAR. The read succeeded and this scope simply has no row for that year yet — the
      // everyday shape at a year boundary, before anyone has created next year's base rows. Nothing is
      // forecast, so the forecast is zero. This is the case that used to stop the whole allocation.
      return { ok: true, value: 0, provenance: PROVENANCE.DEFAULT_ZERO_MISSING_YEAR, code: null, rowCount: 0, distinctCount: 0 };
    }
    var distinct = {}, blanks = 0, invalid = 0;
    rows.forEach(function (r) {
      var v = r[abbr];
      if (isBlank(v)) { blanks++; return; }
      var n = Number(v);
      // A value that is PRESENT but not a number is never a zero. Somebody typed something, and what they
      // meant is unknown — which is exactly the state that must not be guessed.
      if (typeof v === 'boolean' || !isFinite(n)) { invalid++; return; }
      distinct[String(n)] = n;
    });
    if (invalid > 0) {
      return { ok: false, value: null, provenance: null, code: BLOCK.INVALID_NUMERIC_VALUE, rowCount: rows.length, distinctCount: Object.keys(distinct).length };
    }
    var keys = Object.keys(distinct);
    if (keys.length > 1) {
      // Two rows for one business key that DISAGREE. No tool may pick a winner, and the shipped reader was
      // already discarding these — it just did it silently, so they looked like an absence.
      return { ok: false, value: null, provenance: null, code: BLOCK.DUPLICATE_CONFLICTING_ROWS, rowCount: rows.length, distinctCount: keys.length };
    }
    if (!keys.length) {
      // The row exists and the cell is blank. Same meaning as a missing row: nothing is forecast.
      return { ok: true, value: 0, provenance: PROVENANCE.DEFAULT_ZERO_BLANK_MONTH, code: null, rowCount: rows.length, distinctCount: 0, blankCells: blanks };
    }
    var value = distinct[keys[0]];
    return { ok: true, value: value, provenance: value === 0 ? PROVENANCE.EXPLICIT_ZERO : PROVENANCE.ACTUAL,
      code: null, rowCount: rows.length, distinctCount: 1 };
  }

  /**
   * A WHOLE WINDOW (the §7 rolling four months, or any month list). Returns the per-month results, their sum as
   * the weight `basis`, and the audit counters §1 requires.
   *
   * `ok` is false as soon as ANY month is refused: a basis summed over months where one is unknown is not a
   * basis, it is a smaller number that looks like one.
   */
  function normalizeWindow(input) {
    input = input || {};
    var months = input.months || [];
    var out = { ok: true, basis: 0, values: {}, months: [], issues: [],
      counters: { actual_count: 0, explicit_zero_count: 0, default_zero_blank_count: 0, default_zero_missing_year_count: 0 } };
    if (!months.length) {
      out.ok = false;
      out.issues.push({ month: null, code: BLOCK.SCOPE_IDENTITY_INCOMPLETE, message: 'no forecast window supplied' });
      return out;
    }
    for (var i = 0; i < months.length; i++) {
      var r = normalizeMonth({ context: input.context, scope: input.scope, sku: input.sku,
        month: months[i], matchingRows: input.matchingRows });
      r.month = months[i];
      out.months.push(r);
      if (!r.ok) {
        out.ok = false;
        out.issues.push({ month: months[i], code: r.code, message: 'forecast month cannot be resolved: ' + r.code });
        continue;
      }
      out.values[months[i]] = r.value;
      out.basis += r.value;
      if (r.provenance === PROVENANCE.ACTUAL) out.counters.actual_count++;
      else if (r.provenance === PROVENANCE.EXPLICIT_ZERO) out.counters.explicit_zero_count++;
      else if (r.provenance === PROVENANCE.DEFAULT_ZERO_BLANK_MONTH) out.counters.default_zero_blank_count++;
      else if (r.provenance === PROVENANCE.DEFAULT_ZERO_MISSING_YEAR) out.counters.default_zero_missing_year_count++;
    }
    if (!out.ok) { out.basis = null; out.reason = out.issues[0].code; }
    return out;
  }

  /** Filter raw fc_regular_forecast rows to one scope + sku. Kept here so every caller matches identically. */
  function rowsForScope(rows, scope, sku) {
    scope = scope || {};
    var co = str(scope.company), cn = str(scope.country), mp = str(scope.marketplace), sk = str(sku);
    return (rows || []).filter(function (r) {
      return r && str(r.company) === co && str(r.country) === cn && str(r.marketplace) === mp && str(r.sku) === sk;
    });
  }

  return {
    PROVENANCE: PROVENANCE,
    BLOCK: BLOCK,
    BLOCK_CODES: BLOCK_CODES,
    MONTH_ABBR: MONTH_ABBR,
    REQUIRED_HEADERS: REQUIRED_HEADERS,
    normalizeMonth: normalizeMonth,
    normalizeWindow: normalizeWindow,
    rowsForScope: rowsForScope,
    _version: 'f1-7n-fc-1b-e3-r3-r1-forecast-normalization'
  };
}));
