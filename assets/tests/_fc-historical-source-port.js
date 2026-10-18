// S8-B3-R3-CP2W — THE HISTORICAL SALES PORT, AND A FIXTURE THAT SPEAKS IT.
//
// WHAT THIS IS NOT. It is not a source, not a client, not a handler and not a feature. It opens no
// connection, names no project, reads no BigQuery and adds nothing to the Apps Script load surface —
// it lives under assets/tests/, which is neither bundled nor deployed. The source contract
// (docs/planning/FC_HISTORICAL_SALES_SOURCE_CONTRACT.md) still carries MISSING_OWNER_INPUT #1 and #3,
// and until those are answered NOTHING may be connected. This file exists so that the day they are
// answered, the two pending features have an interface to be implemented against and a fixture to be
// proved against, instead of starting from a blank page.
//
// WHY A PORT AT ALL. The two pending modes — "last year, same month ACTUAL" and "interval average
// excluding activity, times a growth rate" — differ from today's frozen owner in WINDOW and
// AGGREGATION, not in IDENTITY. The identity rules (company isolation, campaign/event exclusion,
// natural-key uniqueness) are already decided and already implemented in
// assets/js/core/supply-planning-calculations.js. So the thing that is genuinely missing is not a
// calculator: it is a way to ASK FOR DAYS OLDER THAN THE SHEET KEEPS, with enough attestation to tell
// a confirmed zero from a day nobody reported. That is what this port is.
//
// THE TWO FACTS THE PORT EXISTS TO CARRY, both already settled on the record:
//
//   D-S8-B3-62 — `amazon_daily_sales_snapshot` keeps a ROLLING 90 COMPLETED DAYS and prunes
//   (`retentionDays: 90`). It can serve an interval inside ~90 days and can NEVER serve last year's
//   same month. Only BigQuery `Raw Daily Sales` keeps full history, and no request-time read path to
//   it exists.
//
//   §4.2 of the contract — an absent row is MISSING, never 0, unless THREE things hold together: a
//   per-date completion signal, a stated omit-zero rule, and evidence that this scope+SKU was inside
//   that date's reporting coverage. With any one of them missing, the month is REFUSED. That default
//   is the whole reason the port returns an attestation beside the rows rather than rows alone.
'use strict';

var MS_PER_DAY = 86400000;

function isoOf(ms) { return new Date(ms).toISOString().slice(0, 10); }

function parseIso(d, label) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    throw new Error('fcHistoricalSourcePort: ' + label + ' must be an ISO date YYYY-MM-DD (got ' + JSON.stringify(d) + ')');
  }
  var ms = Date.parse(d + 'T00:00:00Z');
  if (isNaN(ms)) throw new Error('fcHistoricalSourcePort: ' + label + ' is not a real date (' + d + ')');
  return ms;
}

// Every calendar date of a month — the ENUMERATION §4.2(1) requires. A total is not an enumeration:
// "30 rows" does not say WHICH 30 of the 30 days, and the two differ exactly when a day is duplicated.
function enumerateMonth(ym) {
  if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) {
    throw new Error('fcHistoricalSourcePort: month must be YYYY-MM (got ' + JSON.stringify(ym) + ')');
  }
  var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7));
  var out = [], ms = Date.UTC(y, m - 1, 1);
  while (new Date(ms).getUTCMonth() === m - 1) { out.push(isoOf(ms)); ms += MS_PER_DAY; }
  return out;
}

function enumerateRange(from, to) {
  var a = parseIso(from, 'from'), b = parseIso(to, 'to');
  if (a > b) throw new Error('fcHistoricalSourcePort: from (' + from + ') is after to (' + to + ')');
  var out = [];
  for (var ms = a; ms <= b; ms += MS_PER_DAY) out.push(isoOf(ms));
  return out;
}

// ------------------------------------------------------------------------------------------------
// THE PORT CONTRACT — declared, so a future implementation is measured against a statement rather
// than against whatever the first implementation happened to do.
// ------------------------------------------------------------------------------------------------
var PORT_CONTRACT = {
  method: 'readDailySales',
  request: {
    scope: ['company', 'country', 'marketplace', 'channel', 'sku'],   // all REQUIRED, none inferred
    optional: ['marketplaceSkuId', 'marketplaceId'],                  // needed only to resolve exclusions
    from: 'YYYY-MM-DD (inclusive)',
    to: 'YYYY-MM-DD (inclusive)'
  },
  // The row shape is NOT a new invention: it is exactly what supply-planning-calculations.js already
  // requires of `dailySales`, so the frozen identity machinery can consume the port's output
  // unchanged. A port that returned a different shape would force a translation layer, and a
  // translation layer is where company isolation goes to die.
  row: ['date', 'sku', 'units', 'company', 'country', 'marketplace', 'channel'],
  // Per MONTH, because §4.2 refuses per month. Not per request: a request spanning two months may be
  // answerable for one of them and refused for the other, and collapsing that to one verdict would
  // either refuse a good month or publish a bad one.
  attestation: {
    completionSignal: ['PRESENT', 'ABSENT', 'UNKNOWN'],       // §4.2(a)
    omitZeroRule: ['OMITS_ZERO', 'EMITS_ZERO', 'UNKNOWN'],    // §4.2(b)
    scopeCoverage: ['COVERED', 'NOT_COVERED', 'UNKNOWN']      // §4.2(c)
  },
  refusals: [
    'FC_HIST_SCOPE_INCOMPLETE',      // a required scope field is absent — never guessed from another
    'FC_HIST_MONTH_NOT_ATTESTED',    // the three ingredients do not hold → the month is refused
    'FC_HIST_DUPLICATE_NATURAL_KEY', // two rows on one (date, scope) — no last-write-wins
    'FC_HIST_AMBIGUOUS_COMPANY'      // one source key resolving to two companies
  ]
};

var REQUIRED_SCOPE = PORT_CONTRACT.request.scope;

function assertScope(scope) {
  if (scope == null || typeof scope !== 'object') {
    throw new Error('FC_HIST_SCOPE_INCOMPLETE: scope must be an object carrying ' + REQUIRED_SCOPE.join(', '));
  }
  REQUIRED_SCOPE.forEach(function (k) {
    if (typeof scope[k] !== 'string' || scope[k] === '') {
      throw new Error('FC_HIST_SCOPE_INCOMPLETE: scope.' + k + ' is required and is never inferred '
        + '(company is NOT a column of the daily snapshot and may not be derived from country/marketplace/channel)');
    }
  });
}

// §4.2, encoded. ALL THREE or MISSING — and MISSING refuses the month rather than contributing a 0.
//
// Deliberately NOT encoded: the EMITS_ZERO branch. The contract observes that "zero rows are always
// emitted" would answer all three questions at once, but it does not say what an ABSENT row then
// means for the denominator, and the honest reading is that it means the SKU was outside that day's
// coverage — which is a different fact from "sold nothing" and is MISSING_OWNER_INPUT #3's territory.
// So this resolver refuses it rather than choosing. Fail-closed is the documented default.
function absentDateVerdict(att) {
  if (!att || typeof att !== 'object') return 'MISSING';
  if (att.completionSignal === 'PRESENT' && att.omitZeroRule === 'OMITS_ZERO' && att.scopeCoverage === 'COVERED') {
    return 'CONFIRMED_ZERO';
  }
  return 'MISSING';
}

function monthOf(isoDate) { return isoDate.slice(0, 7); }

// ------------------------------------------------------------------------------------------------
// A FIXTURE THAT SPEAKS THE PORT. In-memory, deterministic, no I/O.
// ------------------------------------------------------------------------------------------------
function makeFixturePort(spec) {
  var rows = (spec && spec.rows) || [];
  var byMonth = (spec && spec.attestation) || {};
  var calls = [];
  return {
    calls: calls,
    readDailySales: function (req) {
      req = req || {};
      assertScope(req.scope);
      var span = enumerateRange(req.from, req.to);
      var inSpan = {};
      span.forEach(function (d) { inSpan[d] = 1; });
      calls.push({ from: req.from, to: req.to, scope: req.scope });
      // The port returns EVERY row whose SOURCE dimensions match, of ANY company — the company filter
      // belongs to the consumer, which is also where the ambiguity check lives. A port that filtered
      // by company itself would hide exactly the collision that makes a company-less source unusable.
      var out = rows.filter(function (r) {
        return inSpan[r.date] && r.sku === req.scope.sku && r.country === req.scope.country
          && r.marketplace === req.scope.marketplace && r.channel === req.scope.channel;
      }).map(function (r) {
        return { date: r.date, sku: r.sku, units: r.units, company: r.company,
          country: r.country, marketplace: r.marketplace, channel: r.channel };
      });
      var att = {};
      span.forEach(function (d) {
        var m = monthOf(d);
        if (!att[m]) {
          att[m] = byMonth[m] || { completionSignal: 'UNKNOWN', omitZeroRule: 'UNKNOWN', scopeCoverage: 'UNKNOWN' };
        }
      });
      return { rows: out, attestation: { byMonth: att } };
    }
  };
}

module.exports = {
  PORT_CONTRACT: PORT_CONTRACT,
  REQUIRED_SCOPE: REQUIRED_SCOPE,
  assertScope: assertScope,
  absentDateVerdict: absentDateVerdict,
  enumerateMonth: enumerateMonth,
  enumerateRange: enumerateRange,
  makeFixturePort: makeFixturePort,
  monthOf: monthOf
};
