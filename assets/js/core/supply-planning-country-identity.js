// Kitchen Mama Operation System — Canonical Country Identity owner (F1-4B-FM5-R1b).
// -----------------------------------------------------------------------------
// The ONE server/runtime authority for country IDENTITY matching. It exists because the DB stores the same
// market under two spellings — the domain/scope uses `UK`, while `amazon_inventory_snapshot` stores the ISO code
// `GB`. The Inventory frontend already resolves this via IRCountry (assets/js/utils/inventory-compat.js,
// SAME_MARKET_ALIAS = { UK:[UK,GB], GB:[UK,GB] }); this module mirrors that FROZEN authority for the runtime so
// there is exactly ONE convention on BOTH sides of every canonical identity comparison — never a scattered
// `country === 'UK' || country === 'GB'` special case.
//
// Deterministic canonical code = the ISO value GB (IRCountry documents "GB is the ISO code for the United
// Kingdom"), applied identically to both operands. PURE / deterministic: no clock, no RNG, no I/O, no mutation.
// It NEVER rewrites stored DB values — identity resolution only.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.countryIdentity = api; }
  if (typeof root !== 'undefined' && root) { root.KMCID = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function up(v) { return String(v === undefined || v === null ? '' : v).trim().toUpperCase(); }

  // Frozen same-market spelling aliases (mirror of IRCountry.SAME_MARKET_ALIAS). GB is the ISO code; UK is the
  // domain spelling — the SAME single market. NO EU aggregation here (identity only, never a market group sum).
  var SAME_MARKET_ALIAS = { 'UK': ['UK', 'GB'], 'GB': ['UK', 'GB'] };
  // Deterministic canonical representation, used identically on BOTH operands of a comparison.
  var CANON = { 'UK': 'GB', 'GB': 'GB' };

  // canonicalCountryCode('UK') → 'GB'; canonicalCountryCode('GB') → 'GB'; any other code → itself (uppercased).
  function canonicalCountryCode(v) { var c = up(v); return CANON[c] || c; }
  // The raw source values that belong to a scope country's single market (alias-aware; [] for blank).
  function aliasMembers(country) { var c = up(country); return SAME_MARKET_ALIAS[c] ? SAME_MARKET_ALIAS[c].slice() : (c ? [c] : []); }
  // True when two country codes are the SAME market. Blank on either side → false (callers keep their own guard).
  // Exact-country codes are unchanged (US↔US); only a frozen same-market alias (UK↔GB) resolves equal.
  function countryMatches(a, b) { var A = up(a), B = up(b); if (!A || !B) return false; return canonicalCountryCode(A) === canonicalCountryCode(B); }

  return {
    canonicalCountryCode: canonicalCountryCode,
    countryMatches: countryMatches,
    aliasMembers: aliasMembers,
    SAME_MARKET_ALIAS: { 'UK': ['UK', 'GB'], 'GB': ['UK', 'GB'] },
    VERSION: 'kmcid-fm5r1b-1'
  };
});
