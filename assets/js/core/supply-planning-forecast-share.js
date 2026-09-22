// Kitchen Mama Operation System — Canonical FORECAST SHARE owner (FC-SHARE-DUAL-MODEL-R1, KMFCS).
// -----------------------------------------------------------------------------------------------------
// THE ONE place a forecast SHARE is normalized. It exists because a share was being computed in four
// places and two of them disagreed, and because the one an operator could actually see — FC Summary's
// `FC占比` — was a page-local formula with no spec owner, no test, and five independent defects:
//
//   · its key was `company-sku-marketplace`, which DROPS COUNTRY. KM/US/Amazon, KM/CA/Amazon and
//     KM/JP/Amazon collapsed onto one entry, last write won, and all three rows displayed the LAST
//     row's share. Measured on the shipped function: 14.3% / 14.3% / 14.3%, summing to 42.9%.
//   · its denominator was the FILTERED set, so unchecking a marketplace changed every other row's share.
//   · it was computed over the filtered set but displayed one page of 25 at a time.
//   · its numerator was Σ of twelve individually ceiled months of ONE CALENDAR YEAR — not the canonical
//     rolling-window basis any allocator uses.
//   · it rounded to 1dp per row and then validated the UNROUNDED sum, so 33.3×3 = 99.9 never warned.
//
// TWO CONCEPTS, AND THEY ARE NOT INTERCHANGEABLE (FC-SHARE-DUAL-MODEL-R1 §B1):
//
//   companyForecastShare        = site basis ÷ Σ basis of ALL eligible sites of the SAME COMPANY.
//                                 The denominator is company-wide and deliberately NOT company+country:
//                                 this share exists to split a company-constrained quantity among that
//                                 company's own sites, and those sites are in different countries. (§B3)
//
//   eligibleReceiverForecastShare = site basis ÷ Σ basis of the sites eligible to receive A NAMED FACTORY
//                                 SOURCE. Eligibility is NOT decided here — it is delegated verbatim to
//                                 KMFSA's authorized source policy (CN shared cross-company, TW ResUS-only,
//                                 an unknown country fails closed). Without a source there is no such
//                                 share, and this module returns null rather than inventing one.
//
//   allSiteForecastShare        = site basis ÷ Σ basis of EVERY eligible site, all companies. A DIAGNOSTIC
//                                 (§B7). It is deliberately NOT called a global allocation share, because
//                                 a factory pool is never apportioned by it: a TW pool allocated on this
//                                 number would hand ResTW and KM stock the authorized policy gives them
//                                 exactly none of. Nothing downstream may read it as a weight.
//
// BASIS (§B2) = Σ RAW Regular FC over M+1..M+4 — the existing canonical quantity, named
// `KMPCX.forecastShareQty` and described by KMOOP as "the SAME basis §7/KMAF use". Target % rules,
// Special Event FC, effective demand and safety demand are ALL excluded; target rules enter later, at
// §2D Adjusted Regular FC. Annual Total FC is never a weight.
//
// THE ANCHOR IS INJECTED AND THIS MODULE NEVER READS A CLOCK. `resolveAnchor` is typed rather than
// defaulted: a caller with no canonical planning anchor gets ANCHOR_UNAVAILABLE and must show an
// unavailable state, because substituting "this month" would silently make the number a property of the
// viewer's system date, and substituting the selected year's annual total would answer a different
// question in the same column.
//
// MISSING IS NOT ZERO. A site with no FC row for any window month contributes 0 AND is reported, so a
// silent zero can be told apart from a real one. A zero denominator yields NO SHARE — never an equal
// split, never a 100% fallback.
//
// PURE / deterministic: no clock, no RNG, no I/O, no mutation of inputs, JSON-safe. It allocates nothing
// and persists nothing. `fc_regular_forecast.fc_share` is a LEGACY column: empty, not written by any
// writer, read by nothing, and NOT the source of truth for anything here.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-factory-site-allocation.js')
        : (root.KMFSA || (typeof window !== 'undefined' && window.KM && window.KM.factorySiteAllocation))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.forecastShare = api; }
  if (typeof root !== 'undefined' && root) { root.KMFCS = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (FSA) {
  'use strict';

  var VERSION = 'kmfcs-fcshare-dual-model-r1-1';

  // KMFSA is the site-identity and source-policy authority. Borrowing its vocabulary is the whole point:
  // a share keyed differently from the allocation it describes is a share of something else.
  if (!FSA || typeof FSA.siteKey !== 'function' || typeof FSA.forecastWindowMonths !== 'function') {
    throw new Error('KMFCS: KMFSA (supply-planning-factory-site-allocation) is required — site identity, ' +
      'the rolling-window definition and the factory-source policy are owned there, never redefined here.');
  }

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function up(v) { return str(v).toUpperCase(); }
  function low(v) { return str(v).toLowerCase(); }
  function numOr0(v) {
    if (v === '' || v === null || v === undefined) return 0;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (typeof n === 'number' && isFinite(n)) ? n : 0;
  }
  function falsy(v) {
    if (v === false) return true;
    var s = low(v);
    return s === 'false' || s === '0' || s === 'no' || s === 'n';
  }

  var MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  // ---- the anchor ---------------------------------------------------------------------------------------
  // TYPED, never defaulted. There is no clock in this module and no caller may pretend there is one.
  var ANCHOR_VALID_ = 'VALID';
  var ANCHOR_UNAVAILABLE_ = 'ANCHOR_UNAVAILABLE';
  var ANCHOR_INVALID_ = 'ANCHOR_INVALID_FORMAT';

  function resolveAnchor(calculationMonth) {
    var raw = str(calculationMonth);
    if (raw === '') {
      return { month: null, state: ANCHOR_UNAVAILABLE_,
               message: 'no canonical planning anchor was supplied; a forecast share has no window without one' };
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) {
      return { month: null, state: ANCHOR_INVALID_,
               message: 'calculation month must be "YYYY-MM" (got "' + raw + '")' };
    }
    return { month: raw, state: ANCHOR_VALID_, message: '' };
  }

  // ---- forecast basis -----------------------------------------------------------------------------------
  // The index key is KMFSA's, character for character: company identity is alphanumerics-only (the same
  // company is spelled "ResUS" / "Res US" / "RES-US" across sheets), country upper, marketplace lower, and
  // YEAR is part of the key because a rolling window crosses a year boundary.
  function fcKey(company, country, marketplace, sku, year) {
    return FSA.companyKey(company) + '|' + up(country) + '|' + low(marketplace) + '|' + up(sku) + '|' + str(year);
  }
  function fcIndex(forecastRows) {
    var idx = {};
    (forecastRows || []).forEach(function (raw) {
      var r = raw || {};
      var k = fcKey(r.company, r.country, r.marketplace, r.sku, r.year);
      (idx[k] = idx[k] || []).push(r);
    });
    return idx;
  }
  // Σ RAW Regular FC over the window. `matchedMonths` is what separates "forecast is zero" from "there is
  // no forecast row": both weigh 0, and only one of them is a fact about the business.
  function forecastBasis(idx, site, months) {
    var total = 0, matchedMonths = 0;
    for (var i = 0; i < months.length; i++) {
      var mo = months[i];
      var rows = idx[fcKey(site.company, site.country, site.marketplace, site.sku, mo.year)];
      if (!rows || !rows.length) continue;
      var sum = 0;
      for (var j = 0; j < rows.length; j++) { sum += numOr0(rows[j][mo.key]); }
      total += sum; matchedMonths++;
    }
    // A negative forecast is not a share input. It is clamped to 0 and reported by the caller, because a
    // negative weight would produce a share outside [0,1] and quietly inflate every sibling.
    return { qty: total, negative: total < 0, matchedMonths: matchedMonths };
  }

  // ---- site normalization -------------------------------------------------------------------------------
  function normSite(s) {
    s = s || {};
    return {
      marketplaceId: str(s.marketplaceId !== undefined ? s.marketplaceId : s.marketplace_id),
      company: str(s.company), country: str(s.country), marketplace: str(s.marketplace),
      sku: str(s.sku), year: str(s.year)
    };
  }
  function siteIsExplicitlyInactive(s) {
    var v = (s && s.isActive !== undefined) ? s.isActive : (s ? s.is_active : undefined);
    return v === undefined ? false : falsy(v);
  }

  // ---- the projection -----------------------------------------------------------------------------------
  // input = {
  //   sku, calculationMonth,
  //   forecastRows,               // raw fc_regular_forecast rows (jan..dec + company/country/marketplace/sku/year)
  //   sites,                      // OPTIONAL universe (marketplace_skus). Omitted -> the FC rows are the universe.
  //   sourceCountry               // OPTIONAL factory source country. Omitted -> no eligible-receiver share.
  // }
  function project(input) {
    input = input || {};
    var sku = str(input.sku);
    var issues = [];
    function issue(code, ref, message) { issues.push({ code: code, ref: str(ref), message: str(message) }); }

    var anchor = resolveAnchor(input.calculationMonth);
    if (anchor.state !== ANCHOR_VALID_) {
      issue(anchor.state === ANCHOR_INVALID_ ? 'FORECAST_SHARE_ANCHOR_INVALID' : 'FORECAST_SHARE_ANCHOR_UNAVAILABLE',
        sku, anchor.message);
      return {
        sku: sku, anchor: anchor, windowMonths: [], bySite: {},
        denominators: { byCompanyKey: {}, allSites: 0, eligibleReceiver: null },
        eligibleReceiverPolicy: null, issues: issues, version: VERSION
      };
    }
    var months = FSA.forecastWindowMonths(anchor.month);

    // --- the site universe, deduped by CANONICAL identity (never by display text) ---
    var sites = [], seen = {};
    function admit(s, fromFcRow) {
      if (up(s.sku) !== up(sku)) return;
      if (!s.company || !s.country || !s.marketplace) {
        issue('SITE_SCOPE_INCOMPLETE', FSA.siteKey(s),
          'site scope missing company/country/marketplace — excluded from every share denominator');
        return;
      }
      var k = FSA.siteKey(s);
      if (seen[k]) return;
      seen[k] = 1;
      sites.push({ key: k, site: s, fromFcRow: !!fromFcRow });
    }
    if (Array.isArray(input.sites) && input.sites.length) {
      input.sites.forEach(function (raw) {
        if (siteIsExplicitlyInactive(raw)) {
          issue('SITE_INACTIVE', FSA.siteKey(normSite(raw)),
            'marketplace site scope is explicitly inactive — excluded from every share denominator');
          return;
        }
        admit(normSite(raw), false);
      });
    } else {
      (input.forecastRows || []).forEach(function (raw) { admit(normSite(raw), true); });
    }

    var idx = fcIndex(input.forecastRows);
    sites.forEach(function (row) {
      var b = forecastBasis(idx, row.site, months);
      if (b.negative) {
        issue('SITE_FORECAST_NEGATIVE', row.key,
          'Σ Regular FC over the window is negative — clamped to 0 so no share can fall outside [0,1]');
      }
      row.basis = b.negative ? 0 : b.qty;
      row.matchedMonths = b.matchedMonths;
      if (b.matchedMonths === 0) {
        issue('SITE_FORECAST_WINDOW_MISSING', row.key,
          'no Regular FC row for any month of the rolling four-month window — contributes 0, which is NOT a forecast of zero');
      }
    });

    // --- denominators ---
    var byCompanyKey = {}, allSites = 0;
    sites.forEach(function (row) {
      var ck = FSA.companyKey(row.site.company);
      byCompanyKey[ck] = (byCompanyKey[ck] || 0) + row.basis;
      allSites += row.basis;
    });

    // --- eligible receiver set: the SOURCE decides, and KMFSA owns the source policy ---
    var sourceCountry = str(input.sourceCountry);
    var policy = null, eligibleTotal = null, eligibleKeys = null;
    if (sourceCountry) {
      policy = FSA.policyFor(sourceCountry);
      if (!policy) {
        issue('NO_AUTHORIZED_SOURCE_POLICY', sourceCountry,
          'no authorized factory-source policy for country "' + up(sourceCountry) + '" — fail closed, no eligible-receiver share');
      } else {
        eligibleKeys = {}; eligibleTotal = 0;
        sites.forEach(function (row) {
          if (!FSA.isEligibleReceiver(policy, row.site.company)) return;
          eligibleKeys[row.key] = 1; eligibleTotal += row.basis;
        });
      }
    }

    // --- shares. A share that is not defined is null, with a typed reason. Never 0, never an equal split. ---
    function ratio(n, d) {
      if (!(d > 0)) return null;
      var v = n / d;
      if (!isFinite(v) || v < 0) return null;
      return v > 1 ? 1 : v;
    }
    var bySite = {};
    sites.slice().sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); })
      .forEach(function (row) {
        var ck = FSA.companyKey(row.site.company);
        var companyDen = byCompanyKey[ck] || 0;
        var companyShare = ratio(row.basis, companyDen);
        var allShare = ratio(row.basis, allSites);
        var elig = null;
        if (eligibleKeys && eligibleKeys[row.key]) elig = ratio(row.basis, eligibleTotal);

        if (companyShare === null) {
          issue('ZERO_FORECAST_DENOMINATOR', row.key,
            'Σ Regular FC over the window is 0 for company "' + row.site.company + '" — no proportional share is defined (never averaged, never an equal split)');
        }
        bySite[row.key] = {
          siteKey: row.key, site: row.site, forecastQty: row.basis, matchedMonths: row.matchedMonths,
          companyForecastShare: companyShare,
          allSiteForecastShare: allShare,
          eligibleReceiverForecastShare: elig,
          eligibleReceiver: eligibleKeys ? !!eligibleKeys[row.key] : null
        };
      });

    return {
      sku: sku, anchor: anchor,
      windowMonths: months.map(function (m) { return m.label; }),
      bySite: bySite,
      denominators: { byCompanyKey: byCompanyKey, allSites: allSites, eligibleReceiver: eligibleTotal },
      eligibleReceiverPolicy: policy ? policy.label : null,
      sourceCountry: sourceCountry ? up(sourceCountry) : '',
      issues: issues, version: VERSION
    };
  }

  // ---- the display seam ---------------------------------------------------------------------------------
  // FC Summary renders MANY SKUs at once, so it projects per SKU and reads one row's shares back by the
  // canonical site key. Returning nulls (never zeros) keeps "no share is defined" distinguishable from
  // "this site's share is nothing", which is the distinction the old page-local formula destroyed.
  function siteShares(projection, site) {
    var k = FSA.siteKey(normSite(site));
    var e = projection && projection.bySite ? projection.bySite[k] : null;
    if (!e) {
      return { siteKey: k, resolved: false, forecastQty: null,
               companyForecastShare: null, allSiteForecastShare: null, eligibleReceiverForecastShare: null };
    }
    return {
      siteKey: k, resolved: true, forecastQty: e.forecastQty,
      companyForecastShare: e.companyForecastShare,
      allSiteForecastShare: e.allSiteForecastShare,
      eligibleReceiverForecastShare: e.eligibleReceiverForecastShare
    };
  }

  // Display helper. ONE decimal is allowed for display (§B9) — and display rounding is NEVER the thing a
  // 100% invariant is checked against, which is why nothing here sums formatted strings. A null share is
  // an em dash, not "0.0%": the page must not render an undefined share as a real zero.
  function formatShare(v) {
    if (v === null || v === undefined) return '—';
    if (typeof v !== 'number' || !isFinite(v)) return '—';
    return (v * 100).toFixed(1) + '%';
  }

  // The canonical invariant, asserted on DECIMALS at the repository's established epsilon — never on the
  // rounded strings, which legitimately sum to 99.9 for three equal sites.
  var SHARE_TOLERANCE = 1e-9;
  function sumsToOne(values, tolerance) {
    var t = (typeof tolerance === 'number') ? tolerance : SHARE_TOLERANCE;
    var s = 0, n = 0;
    (values || []).forEach(function (v) { if (typeof v === 'number' && isFinite(v)) { s += v; n++; } });
    if (!n) return false;
    return Math.abs(s - 1) <= t;
  }

  return {
    project: project,
    siteShares: siteShares,
    resolveAnchor: resolveAnchor,
    formatShare: formatShare,
    sumsToOne: sumsToOne,
    SHARE_TOLERANCE: SHARE_TOLERANCE,
    ANCHOR_VALID: ANCHOR_VALID_,
    ANCHOR_UNAVAILABLE: ANCHOR_UNAVAILABLE_,
    ANCHOR_INVALID: ANCHOR_INVALID_,
    MONTH_KEYS: MONTH_KEYS,
    VERSION: VERSION
  };
});
