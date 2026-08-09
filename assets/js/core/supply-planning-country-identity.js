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

  // Sales-SOURCE region membership (F1-4B-FM5-R4UI-R5D). EU is a planning/marketplace REGION, NOT a country alias
  // (EU ≠ DE/FR/IT/ES) — its members are the eligible SOURCE countries for a Sales basis. This MIRRORS the FROZEN
  // frontend authority IRCountry.SALES_AGG (assets/js/utils/inventory-compat.js): Amazon EU sales roll up the four
  // DISTINCT markets IT+DE+ES+FR, summed at the same grain, Amazon-only, with NO legacy country='EU' fallback.
  // The set is taken verbatim from that authority — NOT guessed. Any non-region country returns its own single
  // market (alias-aware; US→[US], UK→[GB]). INVENTORY / WAREHOUSE country identity is UNCHANGED — this is sales
  // source membership only (never a market group sum for identity), consistent with this module's "no EU
  // aggregation for identity" contract above.
  var EU_SALES_SOURCE_ = { 'EU': ['IT', 'DE', 'ES', 'FR'] };
  // → { members:[canonical source-country codes], aggregate:bool }. aggregate=true ONLY for a region that rolls up
  // multiple distinct source markets (EU under Amazon); single markets → aggregate:false, members = the alias set.
  function _uniq(a) { var seen = {}, out = []; a.forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } }); return out; }
  function sourceCountriesForScope(country, marketplace) {
    var c = up(country), isAmazon = up(marketplace) === 'AMAZON';
    if (isAmazon && EU_SALES_SOURCE_[c]) return { members: _uniq(EU_SALES_SOURCE_[c].map(canonicalCountryCode)), aggregate: true };
    return { members: _uniq(aliasMembers(c).map(canonicalCountryCode)), aggregate: false };   // UK/GB → ['GB'] (deduped)
  }

  return {
    canonicalCountryCode: canonicalCountryCode,
    countryMatches: countryMatches,
    aliasMembers: aliasMembers,
    sourceCountriesForScope: sourceCountriesForScope,
    SAME_MARKET_ALIAS: { 'UK': ['UK', 'GB'], 'GB': ['UK', 'GB'] },
    EU_SALES_SOURCE: { 'EU': ['IT', 'DE', 'ES', 'FR'] },
    VERSION: 'kmcid-fm5r5d-eu-1'
  };
});
