// Kitchen Mama Operation System — FX1 — THE FX RATE BOOK CONTRACT.
//
// PURE. No DOM, no SpreadsheetApp, no clock, no network, no I/O of any kind. Every function here takes
// its inputs and returns a decision. `now` is always a PARAMETER, never read from a clock, so an
// effective-period decision is reproducible and a test cannot pass because of what day it is.
//
// WHY THIS FILE EXISTS, AND WHY IT IS NOT IN assets/js/core/.
//
// `pricing.fxReconcile` (73_) already converts prices correctly and already refuses almost everything
// that should be refused. What it does NOT have is a place to KEEP a rate: PRICING_DATABASE_MAPPING §10
// recorded "No separate FX DB table for MVP", so the rates for a run arrive with the request and are
// re-typed, by a person, every time. This is the missing half — a rate BOOK that can be maintained,
// reviewed and audited between runs, with every rule the reconciliation already enforces stated once,
// here, instead of a second time in a page.
//
// It lives under assets/tests/ ON PURPOSE. `assets/js/core/` is compiled verbatim into
// 90_generated_supply_planning_bundle.gs and therefore into the Apps Script load surface, which has 58
// bytes of headroom. Nothing about FX may spend the IR budget. This is the same shape FC used in CP2W:
// the interface and its fixtures are built and proven first, and the production source is connected in a
// later round once the backend change list below has been approved.
//
// WHAT THIS FILE DOES NOT DO: it writes nothing, it prices nothing, and it does not convert. Conversion
// stays in 73_, which is the ONE writer of pricing_list, and that invariant is the whole reason the
// field-level ownership flags can be trusted. This file produces the `rates: [...]` array that
// pricing.fxReconcile already accepts, so adopting it changes no write path at all.
'use strict';

// The frozen storage precision from 73_ (PRICING_FX_DECIMALS_). A currency absent from this map is one
// the converter FAILS CLOSED on (UNSUPPORTED_CURRENCY), so the book must refuse it at entry rather than
// let an operator maintain a rate that can never be applied.
var SUPPORTED_CURRENCIES = ['AUD', 'CAD', 'EUR', 'GBP', 'JPY', 'KRW', 'TWD', 'USD'];

var STATUS = { ACTIVE: 'active', INACTIVE: 'inactive' };

function str(v) { return String(v == null ? '' : v).trim(); }
function upper(v) { return str(v).toUpperCase(); }
function isYmd(v) { return /^\d{4}-\d{2}-\d{2}$/.test(str(v)); }
function pairKey(base, quote) { return upper(base) + '>' + upper(quote); }
function supported(c) { return SUPPORTED_CURRENCIES.indexOf(upper(c)) !== -1; }

// --------------------------------------------------------------------------------------------------
// ENTRY VALIDATION
// --------------------------------------------------------------------------------------------------
// An entry is:
//   { base_currency, quote_currency, rate, source, as_of, effective_from, effective_to, status,
//     version, changed_by, changed_at, note }
//
// effective_to is OPTIONAL and an empty one means OPEN-ENDED. That is a real state — "this is the rate
// until somebody says otherwise" — and it must not be confused with a missing field.
function validateEntry(e) {
  var errors = [];
  e = e || {};
  var base = upper(e.base_currency), quote = upper(e.quote_currency);

  if (!base || !quote) {
    errors.push({ code: 'FX_PAIR_INCOMPLETE', detail: 'base_currency and quote_currency are both required.' });
  } else {
    if (!supported(base)) errors.push({ code: 'FX_CURRENCY_UNSUPPORTED', field: 'base_currency', value: base,
      detail: base + ' is not in the frozen precision contract, so a price in it could never be written at a known precision.' });
    if (!supported(quote)) errors.push({ code: 'FX_CURRENCY_UNSUPPORTED', field: 'quote_currency', value: quote,
      detail: quote + ' is not in the frozen precision contract, so a price in it could never be written at a known precision.' });
  }

  // THE RATE. Must be a positive finite number. Zero is not "no rate" — it would convert every price to
  // nothing — and a negative one is not a rate at all.
  var raw = e.rate;
  var n = (raw === '' || raw === null || raw === undefined) ? NaN : Number(raw);
  if (!isFinite(n)) {
    errors.push({ code: 'FX_RATE_NOT_NUMERIC', detail: 'rate must be a number; got ' + JSON.stringify(str(raw)) + '.' });
  } else if (!(n > 0)) {
    errors.push({ code: 'FX_RATE_NOT_POSITIVE', detail: 'A rate must be greater than zero; got ' + n + '.' });
  } else if (base && base === quote && n !== 1) {
    // SAME CURRENCY IS AN IDENTITY, NOT A CONVERSION. Accepting 1.02 here would silently reprice an
    // entire domestic site by 2%, and every number on the screen would still look like a price.
    errors.push({ code: 'FX_IDENTITY_RATE_INVALID',
      detail: base + ' to ' + quote + ' is the same currency; the only valid rate is 1, not ' + n + '.' });
  }

  if (!str(e.source)) errors.push({ code: 'FX_SOURCE_REQUIRED',
    detail: 'A rate with no named source cannot be audited or reproduced.' });
  if (!isYmd(e.as_of)) errors.push({ code: 'FX_AS_OF_REQUIRED',
    detail: 'A rate needs an as-of date in YYYY-MM-DD, or a stale rate cannot be told from a fresh one.' });

  if (!isYmd(e.effective_from)) errors.push({ code: 'FX_EFFECTIVE_FROM_REQUIRED',
    detail: 'effective_from is required in YYYY-MM-DD. A rate with no start cannot be scheduled or superseded.' });
  if (str(e.effective_to) && !isYmd(e.effective_to)) errors.push({ code: 'FX_EFFECTIVE_TO_INVALID',
    detail: 'effective_to must be YYYY-MM-DD when present. Leave it EMPTY for open-ended, which is a state, not a gap.' });
  if (isYmd(e.effective_from) && isYmd(e.effective_to) && str(e.effective_to) < str(e.effective_from)) {
    errors.push({ code: 'FX_EFFECTIVE_RANGE_INVERTED',
      detail: 'effective_to ' + str(e.effective_to) + ' is before effective_from ' + str(e.effective_from) + '.' });
  }

  var st = str(e.status).toLowerCase();
  if (st !== STATUS.ACTIVE && st !== STATUS.INACTIVE) {
    errors.push({ code: 'FX_STATUS_INVALID',
      detail: 'status must be exactly "active" or "inactive"; got ' + JSON.stringify(str(e.status)) + '. A blank is not "active".' });
  }

  var v = Number(e.version);
  if (!isFinite(v) || v < 1 || Math.floor(v) !== v) {
    errors.push({ code: 'FX_VERSION_INVALID', detail: 'version must be a whole number of at least 1.' });
  }

  return { ok: errors.length === 0, errors: errors, pair: (base && quote) ? pairKey(base, quote) : null };
}

// --------------------------------------------------------------------------------------------------
// BOOK VALIDATION — the rules that are about the SET rather than one entry
// --------------------------------------------------------------------------------------------------
function overlaps(a, b) {
  var aFrom = str(a.effective_from), aTo = str(a.effective_to) || '9999-12-31';
  var bFrom = str(b.effective_from), bTo = str(b.effective_to) || '9999-12-31';
  return aFrom <= bTo && bFrom <= aTo;
}

function validateBook(entries) {
  var errors = [], seen = {};
  var list = entries || [];
  list.forEach(function (e, i) {
    var r = validateEntry(e);
    r.errors.forEach(function (err) { errors.push({ index: i, code: err.code, detail: err.detail, field: err.field }); });
    if (!r.ok || !r.pair) return;
    // TWO ACTIVE RATES FOR ONE PAIR OVER ONE DAY IS NOT A CONFLICT TO RESOLVE LATER — it is a book that
    // cannot answer the question it exists to answer, and resolving it by order would make the answer
    // depend on row position.
    if (str(e.status).toLowerCase() !== STATUS.ACTIVE) return;
    (seen[r.pair] = seen[r.pair] || []).forEach(function (prev) {
      if (overlaps(prev.e, e)) {
        errors.push({ index: i, code: 'FX_EFFECTIVE_PERIOD_OVERLAP', pair: r.pair,
          detail: 'Two ACTIVE rates for ' + r.pair + ' cover the same day (rows ' + prev.i + ' and ' + i + ').' });
      }
    });
    seen[r.pair].push({ i: i, e: e });
  });
  return { ok: errors.length === 0, errors: errors };
}

// --------------------------------------------------------------------------------------------------
// RESOLUTION — which rate applies to this pair on this day
// --------------------------------------------------------------------------------------------------
// IT NEVER INVERTS. If the book holds USD>CAD and the caller asks for CAD>USD, the answer is NOT_FOUND.
// 73_ froze the direction for the reason that matters: LOCAL = BASE x RATE, and a reciprocal is the one
// arithmetic error that yields a plausible number rather than an obvious one — USD 29.99 at an inverted
// 1.35 becomes 22.21, and nothing on the screen looks wrong.
function resolveRate(book, base, quote, onDate) {
  var b = upper(base), q = upper(quote), day = str(onDate);
  if (!isYmd(day)) return { ok: false, reason: 'DATE_REQUIRED' };
  if (!b || !q) return { ok: false, reason: 'PAIR_INCOMPLETE' };

  // The identity is NOT stored and must never need to be: it is what "the same currency" means, and 73_
  // already treats it as a rate of 1 with no supplied entry.
  if (b === q) return { ok: true, identity: true, rate: 1, source: 'identity', as_of: day, pair: pairKey(b, q) };

  var hits = (book || []).filter(function (e) {
    if (upper(e.base_currency) !== b || upper(e.quote_currency) !== q) return false;
    if (str(e.status).toLowerCase() !== STATUS.ACTIVE) return false;
    if (!isYmd(e.effective_from) || day < str(e.effective_from)) return false;
    if (str(e.effective_to) && day > str(e.effective_to)) return false;
    return true;
  });
  if (!hits.length) {
    var inverseExists = (book || []).some(function (e) {
      return upper(e.base_currency) === q && upper(e.quote_currency) === b;
    });
    return { ok: false, reason: inverseExists ? 'ONLY_INVERSE_EXISTS' : 'NOT_FOUND', pair: pairKey(b, q),
      detail: inverseExists
        ? 'The book holds ' + pairKey(q, b) + ' and NOT ' + pairKey(b, q) + '. The direction is frozen and this is never inverted automatically: LOCAL = BASE x RATE, and a reciprocal produces a plausible wrong price rather than an obvious one. Maintain the pair in the direction it is used.'
        : 'No ACTIVE rate for ' + pairKey(b, q) + ' covers ' + day + '.' };
  }
  if (hits.length > 1) {
    return { ok: false, reason: 'AMBIGUOUS', pair: pairKey(b, q), count: hits.length,
      detail: 'The book has ' + hits.length + ' ACTIVE rates for ' + pairKey(b, q) + ' on ' + day + '. Resolving by row order would make the answer depend on position.' };
  }
  var h = hits[0];
  return { ok: true, identity: false, rate: Number(h.rate), source: str(h.source), as_of: str(h.as_of),
    pair: pairKey(b, q), version: Number(h.version) };
}

// --------------------------------------------------------------------------------------------------
// THE HANDOFF — build exactly the `rates` array pricing.fxReconcile already accepts
// --------------------------------------------------------------------------------------------------
// `requiredPairs` is what a dry-run reconciliation REPORTS as needed (73_'s pricingFxRequiredPairs_), so
// the two ends agree on the question. Pairs the book cannot answer are returned as `missing` and are NOT
// quietly dropped: a run assembled from a book with a hole in it must be visibly short, because 73_ will
// skip exactly those rows as MISSING_FX_RATE and the operator has to know which ones before they run.
function buildReconcileRates(book, requiredPairs, onDate) {
  var rates = [], missing = [];
  (requiredPairs || []).forEach(function (p) {
    var r = resolveRate(book, p.base_currency, p.quote_currency, onDate);
    if (!r.ok) { missing.push({ pair: pairKey(p.base_currency, p.quote_currency), reason: r.reason, detail: r.detail }); return; }
    if (r.identity) return;   // 73_ needs no supplied entry for an identity pair
    rates.push({ base_currency: upper(p.base_currency), quote_currency: upper(p.quote_currency),
      rate: r.rate, source: r.source, as_of: r.as_of });
  });
  return { rates: rates, missing: missing, complete: missing.length === 0 };
}

// --------------------------------------------------------------------------------------------------
// EDITING — optimistic concurrency and the change record
// --------------------------------------------------------------------------------------------------
// A SAVE CARRIES THE VERSION IT READ. Two operators maintaining the same pair from two tabs is the
// ordinary case, not the exotic one, and last-write-wins would silently discard a rate somebody checked
// against a bank page. A stale save is REFUSED and told what it is holding.
function applyEdit(book, edit, actor, atIso) {
  var list = (book || []).slice();
  var e = edit || {};
  var idx = -1;
  for (var i = 0; i < list.length; i++) {
    if (upper(list[i].base_currency) === upper(e.base_currency)
      && upper(list[i].quote_currency) === upper(e.quote_currency)
      && str(list[i].effective_from) === str(e.effective_from)) { idx = i; break; }
  }
  if (idx === -1) {
    // A NEW period for this pair. Its version starts at 1; `base_version` must be absent or 0.
    var vIn = Number(e.base_version || 0);
    if (vIn) return { ok: false, code: 'FX_VERSION_CONFLICT', detail: 'No stored rate for ' + pairKey(e.base_currency, e.quote_currency) + ' from ' + str(e.effective_from) + ', but the save claims version ' + vIn + '. It was deleted or never existed.' };
    var created = {
      base_currency: upper(e.base_currency), quote_currency: upper(e.quote_currency),
      rate: e.rate, source: str(e.source), as_of: str(e.as_of),
      effective_from: str(e.effective_from), effective_to: str(e.effective_to),
      status: str(e.status).toLowerCase() || STATUS.ACTIVE, version: 1,
      changed_by: str(actor), changed_at: str(atIso), note: str(e.note)
    };
    var vr = validateEntry(created);
    if (!vr.ok) return { ok: false, code: 'FX_ENTRY_INVALID', errors: vr.errors };
    list.push(created);
    return { ok: true, book: list, change: changeRecord('CREATE', null, created, actor, atIso) };
  }
  var cur = list[idx];
  if (Number(e.base_version) !== Number(cur.version)) {
    return { ok: false, code: 'FX_VERSION_CONFLICT', stored_version: Number(cur.version),
      supplied_version: Number(e.base_version),
      detail: 'This rate has moved to version ' + cur.version + ' since it was read at version '
        + str(e.base_version) + '. Nothing was changed. Re-read it and decide against the current value.' };
  }
  var next = {
    base_currency: cur.base_currency, quote_currency: cur.quote_currency,
    rate: (e.rate === undefined ? cur.rate : e.rate),
    source: (e.source === undefined ? cur.source : str(e.source)),
    as_of: (e.as_of === undefined ? cur.as_of : str(e.as_of)),
    effective_from: cur.effective_from,
    effective_to: (e.effective_to === undefined ? cur.effective_to : str(e.effective_to)),
    status: (e.status === undefined ? cur.status : str(e.status).toLowerCase()),
    version: Number(cur.version) + 1,
    changed_by: str(actor), changed_at: str(atIso), note: str(e.note)
  };
  var vr2 = validateEntry(next);
  if (!vr2.ok) return { ok: false, code: 'FX_ENTRY_INVALID', errors: vr2.errors };
  list[idx] = next;
  return { ok: true, book: list, change: changeRecord('UPDATE', cur, next, actor, atIso) };
}

// EVERY FIELD THAT MOVED, BEFORE AND AFTER. A change log that records only the new value cannot answer
// the question it is kept for — what was it before, and who changed it.
var LOGGED_FIELDS = ['rate', 'source', 'as_of', 'effective_from', 'effective_to', 'status'];
function changeRecord(type, before, after, actor, atIso) {
  var fields = [];
  LOGGED_FIELDS.forEach(function (f) {
    var b = before ? str(before[f]) : '';
    var a = str(after[f]);
    if (b !== a) fields.push({ field: f, from: before ? b : null, to: a });
  });
  return {
    change_type: type, pair: pairKey(after.base_currency, after.quote_currency),
    effective_from: str(after.effective_from),
    from_version: before ? Number(before.version) : null, to_version: Number(after.version),
    changed_by: str(actor), changed_at: str(atIso), fields: fields
  };
}

module.exports = {
  SUPPORTED_CURRENCIES: SUPPORTED_CURRENCIES, STATUS: STATUS,
  pairKey: pairKey, validateEntry: validateEntry, validateBook: validateBook,
  resolveRate: resolveRate, buildReconcileRates: buildReconcileRates,
  applyEdit: applyEdit, changeRecord: changeRecord
};
