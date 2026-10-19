// Kitchen Mama Operation System — FX1 — FX RATE BOOK FIXTURES.
//
// PURE DATA. Nothing here is read by production code and nothing here is a production rate.
'use strict';

// --------------------------------------------------------------------------------------------------
// THE SITE UNIVERSE, from the P1-B6 production readback recorded in DEPLOYMENT_RELEASE_LOG.md:
//
//   KM/US/Shopify 101 · KM/US/Target 19 · KM/US/Walmart 64 · ResTW/AU/Amazon 35 · ResTW/CA/Amazon 51 ·
//   ResTW/EU/Amazon 39 · ResTW/JP/Amazon 26 · ResTW/UK/Amazon 42 · ResUS/US/Amazon 100 ·
//   ResUS/US/Walmart 18
//
// Six countries, six local currencies. With base_currency USD — which is what every pricing fixture in
// this repository carries — that is FIVE non-identity pairs and four identity sites.
//
// THIS IS THE EXPECTED SET, NOT THE MEASURED ONE, and the difference matters. `base_currency` is a
// PER-ROW column in pricing_list, not a global setting, so the only authoritative answer comes from the
// database. 73_ already computes it: a `pricing.fxReconcile` with `dry_run: true` and no rates returns
// `required_pairs` and writes nothing. Run that first and reconcile it against this list.
var EXPECTED_PAIRS = [
  { base_currency: 'USD', quote_currency: 'AUD', sites: ['ResTW/AU/Amazon'], decimals: 2 },
  { base_currency: 'USD', quote_currency: 'CAD', sites: ['ResTW/CA/Amazon'], decimals: 2 },
  { base_currency: 'USD', quote_currency: 'EUR', sites: ['ResTW/EU/Amazon'], decimals: 2 },
  { base_currency: 'USD', quote_currency: 'GBP', sites: ['ResTW/UK/Amazon'], decimals: 2 },
  { base_currency: 'USD', quote_currency: 'JPY', sites: ['ResTW/JP/Amazon'], decimals: 0 }
];

// The four US sites are USD>USD. They need NO stored rate: the identity is what "the same currency"
// means and both 73_ and the contract resolve it to 1 without an entry.
var IDENTITY_SITES = ['KM/US/Shopify', 'KM/US/Target', 'KM/US/Walmart', 'ResUS/US/Amazon', 'ResUS/US/Walmart'];

// --------------------------------------------------------------------------------------------------
// THE INITIAL BOOK IS A TEMPLATE, AND IT IS DELIBERATELY INCOMPLETE.
//
// Every structural field is filled — pair, direction, effective_from, status, version, and the SOURCE
// the Owner has to stand behind. `rate` and `as_of` are EMPTY, and the suite asserts that this template
// FAILS validation for exactly that reason.
//
// That is the point. A rate is a business fact with a date on it. Writing a plausible number here would
// put a figure nobody checked into a file, where it would be correct on the day it was typed and wrong
// every day after — the failure 73_ names when it says "a rate hard-coded into a source file would be a
// business fact frozen into a deployment". The template cannot be shipped by accident because it cannot
// pass its own validation until a person supplies the number and the date they read it on.
//
// SOURCE is a placeholder for the Owner's decision, not a recommendation. Whatever is chosen has to be
// a source somebody can re-open on the as-of date and see the same number: a central bank daily
// reference, the rate the payment processor actually settled at, or the rate the marketplace itself
// publishes. Those three disagree, and which one is right is a commercial decision, not a technical one.
var INITIAL_BOOK_TEMPLATE = EXPECTED_PAIRS.map(function (p) {
  return {
    base_currency: p.base_currency, quote_currency: p.quote_currency,
    rate: '',                       // OWNER SUPPLIES
    source: 'TBD-OFFICIAL-SOURCE',  // OWNER DECIDES — see above
    as_of: '',                      // OWNER SUPPLIES, the date the rate was read
    effective_from: '', effective_to: '', status: 'active', version: 1,
    changed_by: '', changed_at: '', note: 'FX1 template row — not a rate.'
  };
});

// --------------------------------------------------------------------------------------------------
// AN ILLUSTRATIVE, COMPLETE BOOK — for exercising behaviour only. The numbers are round on purpose so
// nobody mistakes them for a quotation.
var EXAMPLE_BOOK = [
  { base_currency: 'USD', quote_currency: 'CAD', rate: 1.35, source: 'example-reference', as_of: '2026-10-01',
    effective_from: '2026-10-01', effective_to: '2026-10-31', status: 'active', version: 3,
    changed_by: 'ops', changed_at: '2026-10-01T09:00:00Z', note: '' },
  { base_currency: 'USD', quote_currency: 'CAD', rate: 1.40, source: 'example-reference', as_of: '2026-11-01',
    effective_from: '2026-11-01', effective_to: '', status: 'active', version: 1,
    changed_by: 'ops', changed_at: '2026-11-01T09:00:00Z', note: 'open-ended successor' },
  { base_currency: 'USD', quote_currency: 'EUR', rate: 0.90, source: 'example-reference', as_of: '2026-10-01',
    effective_from: '2026-10-01', effective_to: '', status: 'active', version: 1,
    changed_by: 'ops', changed_at: '2026-10-01T09:00:00Z', note: '' },
  { base_currency: 'USD', quote_currency: 'JPY', rate: 150, source: 'example-reference', as_of: '2026-10-01',
    effective_from: '2026-10-01', effective_to: '', status: 'active', version: 1,
    changed_by: 'ops', changed_at: '2026-10-01T09:00:00Z', note: 'zero-decimal currency' },
  // RETIRED, NOT DELETED. An inactive row keeps the history a change log points at.
  { base_currency: 'USD', quote_currency: 'GBP', rate: 0.78, source: 'example-reference', as_of: '2026-09-01',
    effective_from: '2026-09-01', effective_to: '', status: 'inactive', version: 2,
    changed_by: 'ops', changed_at: '2026-10-01T09:00:00Z', note: 'superseded, kept for audit' }
];

module.exports = {
  EXPECTED_PAIRS: EXPECTED_PAIRS, IDENTITY_SITES: IDENTITY_SITES,
  INITIAL_BOOK_TEMPLATE: INITIAL_BOOK_TEMPLATE, EXAMPLE_BOOK: EXAMPLE_BOOK
};
