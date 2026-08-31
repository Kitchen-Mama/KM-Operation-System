// Kitchen Mama Operation System — Canonical FACTORY SITE ALLOCATION owner (F1-7N-FB-4E-R4B-R1, KMFSA).
// -----------------------------------------------------------------------------------------------------
// THE ONE authority that turns a PHYSICAL factory pool into PER-SITE factory availability. It exists because
// three surfaces each carried their own factory number and none of them allocated anything:
//
//   · Site Inventory  (inventory-replenishment.js IR.factoryByCountry) — S current_stock per country, per SKU
//   · Order Planning  (request-order.js _buildRequestOrderRowsFromDb)  — S current_stock across ALL factories
//   · Order Planning  (56_api_v1_ai_plan_first_layer.gs, the LIVE one) — S current_stock across ALL factories
//
// Every one of them showed the COMPLETE physical quantity under EVERY marketplace scope, which is the live
// defect: one pool displayed N times as if each site owned all of it. This module replaces all three with one
// projection, so a change of rule can never again be half-applied.
//
// AUTHORIZED SOURCE POLICY (F1-7N-FB-4E-R4B-R1 §1 — the business decision that resolved the R4B §B gate):
//
//   CN factory source -> SHARED across all eligible active marketplace site scopes; the eligible receiver set may
//                        span KM / ResUS / ResTW, and the denominator is CROSS-COMPANY.
//   TW factory source -> eligible ONLY for active ResUS marketplace site scopes; KM and ResTW receive ZERO.
//
// This is an explicit FACTORY-SOURCE policy. It narrowly supersedes, for TW only, the former default that factory
// warehouses are shared across KM / ResUS / ResTW (which remains the default wherever no explicit source policy
// exists — i.e. CN, and any future factory country until one is authorized). It is NOT modelled as a company
// mismatch, a warehouse-id rule or a user-authorization rule: eligibility is a property of the SOURCE, decided
// here and nowhere else, and no warehouse-access mapping is invented (none exists).
//
// WEIGHT = the FROZEN rolling future four-month Regular FC window (M+1..M+4), the same window the recommendation
// planning context uses. Special Event FC is NEVER folded in. MISSING is not 0 — a site with no FC row for the
// window contributes 0 weight AND is reported, so a silent zero can be told apart from a real zero.
//
// PURE / deterministic: no clock (the calculation month is injected), no RNG, no I/O, no mutation of inputs. It
// allocates NOTHING in the database: it creates no allocation row, no reservation, no movement, and is safe to
// run inside a read.
//
// GRAIN. One pool = ONE physical factory warehouse x ONE master SKU (the frozen FACTORY pool identity
// FACTORY_SHARED | source_factory_warehouse_id | masterSku | FACTORY). Pools are allocated SEPARATELY and a
// site's displayed quantity is the SUM of its shares. Two factories in the same country never merge into one
// denominator, so a site can never be allocated the same unit twice.
//
// AVAILABLE QUANTITY. The runtime already defines the canonical allocatable factory quantity — Factory Inventory
// computes available_factory_stock = MAX(current_stock - reserved_stock, 0) (assets/js/pages/factory-stock.js).
// This module uses THAT, never raw current_stock, so Site Inventory can no longer show more than Factory
// Inventory says exists.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.factorySiteAllocation = api; }
  if (typeof root !== 'undefined' && root) { root.KMFSA = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var VERSION = 'kmfsa-fb4e-r4b-r1-1';

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function up(v) { return str(v).toUpperCase(); }
  function low(v) { return str(v).toLowerCase(); }
  function numOr0(v) {
    if (v === '' || v === null || v === undefined) return 0;
    var n = typeof v === 'number' ? v : parseFloat(v);
    return (typeof n === 'number' && isFinite(n)) ? n : 0;
  }
  // Company IDENTITY key. The same company is spelled "ResUS" / "Res US" / "RES-US" across sheets, so identity is
  // compared on alphanumerics only. It NEVER rewrites a stored value — resolution only (same rule as KMCID).
  function companyKey(v) { return up(v).replace(/[^A-Z0-9]+/g, ''); }
  var RESUS_KEY = 'RESUS';

  // ---- the authorized factory-source policy table -------------------------------------------------------------
  // receiverCompanyKeys === null  -> every eligible active site scope (shared; cross-company denominator)
  // receiverCompanyKeys === [..]  -> ONLY those companies; every other company is allocated exactly 0
  // A factory country ABSENT from this table is NOT allocated at all (fail closed, typed) — a new factory country
  // is a business decision, not a default.
  var FACTORY_SOURCE_POLICY = {
    CN: { receiverCompanyKeys: null, label: 'SHARED_ALL_ELIGIBLE' },
    TW: { receiverCompanyKeys: [RESUS_KEY], label: 'RESUS_ONLY' }
  };
  function policyFor(countryCode) {
    var c = up(countryCode);
    return Object.prototype.hasOwnProperty.call(FACTORY_SOURCE_POLICY, c) ? FACTORY_SOURCE_POLICY[c] : null;
  }
  function isEligibleReceiver(policy, siteCompany) {
    if (!policy) return false;
    if (policy.receiverCompanyKeys === null) return true;
    var k = companyKey(siteCompany);
    for (var i = 0; i < policy.receiverCompanyKeys.length; i++) { if (policy.receiverCompanyKeys[i] === k) return true; }
    return false;
  }

  // ---- the frozen rolling future four-month window ------------------------------------------------------------
  var MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  // calculationMonth "YYYY-MM" -> the four months M+1..M+4 as [{ year:'YYYY', key:'jan', label:'YYYY-MM' }].
  // Throws on a malformed month: the window anchor is injected by the caller and is never guessed from a clock.
  function forecastWindowMonths(calculationMonth) {
    var m = /^(\d{4})-(\d{1,2})$/.exec(str(calculationMonth));
    if (!m) throw new Error('INVALID_CALCULATION_MONTH: expected YYYY-MM, got "' + str(calculationMonth) + '"');
    var y = Number(m[1]), mo = Number(m[2]);
    if (mo < 1 || mo > 12) throw new Error('INVALID_CALCULATION_MONTH: month out of range in "' + str(calculationMonth) + '"');
    var out = [];
    for (var i = 1; i <= 4; i++) {
      var idx = (mo - 1) + i, yy = y + Math.floor(idx / 12), mm = idx % 12;
      out.push({ year: String(yy), key: MONTH_KEYS[mm], label: String(yy) + '-' + (mm + 1 < 10 ? '0' : '') + String(mm + 1) });
    }
    return out;
  }

  // ---- canonical site identity --------------------------------------------------------------------------------
  // IMMUTABLE identity, and the deterministic tie-break for equal rounding remainders. marketplace_id is the real
  // site identity (the same marketplace NAME belongs to two companies), so it is preferred; the composite key is
  // the fallback for a row that predates the id. Display text is never the identity.
  function siteKey(site) {
    var id = str(site && site.marketplaceId);
    if (id) return 'MKT:' + id;
    return 'CCM:' + up(site && site.company) + '|' + up(site && site.country) + '|' + low(site && site.marketplace);
  }

  // ---- input normalization (accepts BOTH the browser camelCase shape and raw snake_case sheet objects) ---------
  function normFactoryRow(r) {
    r = r || {};
    var cur = (r.currentStock !== undefined) ? r.currentStock : (r.fac_current_stock !== undefined ? r.fac_current_stock : r.current_stock);
    var res = (r.reservedStock !== undefined) ? r.reservedStock : (r.fac_reserved_stock !== undefined ? r.fac_reserved_stock : r.reserved_stock);
    return {
      sku: str(r.sku),
      warehouseId: str(r.warehouseId !== undefined ? r.warehouseId : r.warehouse_id),
      currentStock: numOr0(cur),
      reservedStock: numOr0(res)
    };
  }
  function truthy(v) {
    if (v === true) return true;
    var s = low(v);
    return s === 'true' || s === '1' || s === 'yes' || s === 'y';
  }
  function falsy(v) {
    if (v === false) return true;
    var s = low(v);
    return s === 'false' || s === '0' || s === 'no' || s === 'n';
  }
  function normWarehouse(w) {
    w = w || {};
    var fac = (w.isFactoryWarehouse !== undefined) ? w.isFactoryWarehouse : w.is_factory_warehouse;
    var act = (w.isActive !== undefined) ? w.isActive : w.is_active;
    return {
      warehouseId: str(w.warehouseId !== undefined ? w.warehouseId : w.warehouse_id),
      company: str(w.company),
      country: str(w.country),
      warehouseName: str(w.warehouseName !== undefined ? w.warehouseName : w.warehouse_name),
      isFactory: truthy(fac),
      // Tri-state: only an EXPLICIT false excludes. A blank is_active on a factory row must not silently delete a
      // real physical pool from the picture — it is reported instead (INACTIVE is explicit, unknown is not).
      isInactive: falsy(act)
    };
  }
  function normSite(s) {
    s = s || {};
    return {
      marketplaceId: str(s.marketplaceId !== undefined ? s.marketplaceId : s.marketplace_id),
      company: str(s.company),
      country: str(s.country),
      marketplace: str(s.marketplace),
      sku: str(s.sku)
    };
  }
  function normFcRow(r) {
    r = r || {};
    var out = {
      year: str(r.year), company: str(r.company), country: str(r.country),
      marketplace: str(r.marketplace), sku: str(r.sku)
    };
    for (var i = 0; i < MONTH_KEYS.length; i++) { var k = MONTH_KEYS[i]; out[k] = numOr0(r[k]); }
    return out;
  }

  // ---- forecast weight ----------------------------------------------------------------------------------------
  // S Regular FC over M+1..M+4 for ONE site scope. Keyed on company|country|marketplace|sku: company is part of
  // the key because KM/US/Amazon and ResUS/US/Amazon are DIFFERENT sites that share a country and a marketplace
  // name, and merging them would inflate one company's weight with the other's demand.
  function fcIndex(fcRows) {
    var idx = {};
    (fcRows || []).forEach(function (raw) {
      var r = normFcRow(raw);
      var k = companyKey(r.company) + '|' + up(r.country) + '|' + low(r.marketplace) + '|' + up(r.sku) + '|' + r.year;
      (idx[k] = idx[k] || []).push(r);
    });
    return idx;
  }
  function forecastWeight(idx, site, months) {
    var base = companyKey(site.company) + '|' + up(site.country) + '|' + low(site.marketplace) + '|' + up(site.sku) + '|';
    var total = 0, matchedMonths = 0;
    for (var i = 0; i < months.length; i++) {
      var mo = months[i], rows = idx[base + mo.year];
      if (!rows || !rows.length) continue;
      var sum = 0;
      for (var j = 0; j < rows.length; j++) { sum += numOr0(rows[j][mo.key]); }
      total += sum; matchedMonths++;
    }
    return { qty: total, matchedMonths: matchedMonths, windowMonths: months.length };
  }

  // ---- deterministic integer allocation (largest remainder) ---------------------------------------------------
  // S allocations === available whenever the denominator is > 0 (exact conservation, no unit invented or lost);
  // remainders are awarded largest-first and equal remainders are broken by the IMMUTABLE canonical site key, so
  // the same inputs always produce byte-identical output regardless of input order.
  function largestRemainder(available, weighted) {
    var out = {};
    var i;
    // Keys are emitted in CANONICAL SITE ORDER, not in caller order, so the result object is byte-identical
    // however the caller happened to sort its inputs. Determinism that depends on argument order is not
    // determinism, and a serialized comparison is exactly how that difference shows up.
    var ordered = weighted.slice().sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); });
    for (i = 0; i < ordered.length; i++) out[ordered[i].key] = 0;
    var sumW = 0;
    for (i = 0; i < weighted.length; i++) sumW += weighted[i].weight;
    if (!(available > 0) || !(sumW > 0) || !weighted.length) return { byKey: out, allocated: 0 };
    var rows = [];
    for (i = 0; i < weighted.length; i++) {
      var raw = available * weighted[i].weight / sumW;
      var fl = Math.floor(raw);
      rows.push({ key: weighted[i].key, floor: fl, frac: raw - fl });
      out[weighted[i].key] = fl;
    }
    var assigned = 0;
    for (i = 0; i < rows.length; i++) assigned += rows[i].floor;
    var remainder = available - assigned;
    rows.sort(function (a, b) {
      if (b.frac !== a.frac) return b.frac - a.frac;                 // (1) largest remainder
      return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);           // (2) immutable canonical scope identity
    });
    for (i = 0; i < rows.length && remainder > 0; i++) { out[rows[i].key] += 1; remainder -= 1; }
    var allocated = 0;
    for (i = 0; i < weighted.length; i++) allocated += out[weighted[i].key];
    return { byKey: out, allocated: allocated };
  }

  // ---- the projection -----------------------------------------------------------------------------------------
  // input = { sku, factoryRows, warehouses, sites, forecastRows, calculationMonth }
  //   sites = the candidate marketplace site scopes for this SKU (marketplace_skus rows). The caller supplies the
  //           universe; this module decides ELIGIBILITY per pool from the source policy, never from the caller.
  function project(input) {
    input = input || {};
    var sku = str(input.sku);
    var months = forecastWindowMonths(input.calculationMonth);
    var issues = [];
    function issue(code, ref, message) { issues.push({ code: code, ref: str(ref), message: str(message) }); }

    var whById = {};
    (input.warehouses || []).forEach(function (raw) { var w = normWarehouse(raw); if (w.warehouseId) whById[w.warehouseId] = w; });

    var sites = [];
    var seenSite = {};
    (input.sites || []).forEach(function (raw) {
      var s = normSite(raw);
      if (up(s.sku) !== up(sku)) return;
      if (!s.company || !s.country || !s.marketplace) { issue('SITE_SCOPE_INCOMPLETE', siteKey(s), 'site scope missing company/country/marketplace — excluded from every eligible receiver set'); return; }
      var k = siteKey(s);
      if (seenSite[k]) return;                      // dedupe by canonical identity (never by display text)
      seenSite[k] = 1;
      sites.push({ key: k, site: s });
    });

    var idx = fcIndex(input.forecastRows);
    sites.forEach(function (row) {
      var w = forecastWeight(idx, row.site, months);
      row.weight = w.qty; row.fcMatchedMonths = w.matchedMonths;
      if (w.matchedMonths === 0) issue('SITE_FORECAST_WINDOW_MISSING', row.key, 'no Regular FC row for any month of the rolling four-month window — contributes weight 0');
    });

    // one pool per PHYSICAL factory warehouse x this SKU
    var poolByWh = {};
    (input.factoryRows || []).forEach(function (raw) {
      var f = normFactoryRow(raw);
      if (up(f.sku) !== up(sku)) return;
      if (!f.warehouseId) { issue('FACTORY_ROW_WITHOUT_WAREHOUSE', f.sku, 'factory_stock row carries no warehouse_id — cannot resolve a source country, excluded'); return; }
      var p = poolByWh[f.warehouseId] || (poolByWh[f.warehouseId] = { warehouseId: f.warehouseId, currentQty: 0, reservedQty: 0 });
      p.currentQty += f.currentStock; p.reservedQty += f.reservedStock;
    });

    var pools = Object.keys(poolByWh).sort().map(function (id) {
      var p = poolByWh[id], wh = whById[id] || null;
      // CANONICAL allocatable quantity — the same MAX(current - reserved, 0) Factory Inventory displays.
      p.availableQty = Math.max(p.currentQty - p.reservedQty, 0);
      p.warehouseName = wh ? (wh.warehouseName || id) : id;
      p.sourceCountry = wh ? up(wh.country) : '';
      p.allocations = {}; p.allocated = 0; p.eligibleSiteKeys = []; p.denominator = 0;
      p.unallocated = p.availableQty; p.unallocatedReason = ''; p.policy = '';

      if (!wh) { p.unallocatedReason = 'FACTORY_WAREHOUSE_UNKNOWN'; issue('FACTORY_WAREHOUSE_UNKNOWN', id, 'no warehouses row for this factory warehouse_id — source country unresolved, nothing allocated'); return p; }
      if (!wh.isFactory) { p.unallocatedReason = 'NOT_A_FACTORY_WAREHOUSE'; issue('NOT_A_FACTORY_WAREHOUSE', id, 'factory_stock row points at a warehouse that is not flagged is_factory_warehouse'); return p; }
      if (wh.isInactive) { p.unallocatedReason = 'FACTORY_WAREHOUSE_INACTIVE'; issue('FACTORY_WAREHOUSE_INACTIVE', id, 'factory warehouse is explicitly inactive — its stock is not allocated to any site'); return p; }
      var policy = policyFor(p.sourceCountry);
      if (!policy) { p.unallocatedReason = 'NO_AUTHORIZED_SOURCE_POLICY'; issue('NO_AUTHORIZED_SOURCE_POLICY', id, 'no authorized factory-source policy for country "' + p.sourceCountry + '" — fail closed, nothing allocated'); return p; }
      p.policy = policy.label;

      var eligible = sites.filter(function (row) { return isEligibleReceiver(policy, row.site.company); });
      p.eligibleSiteKeys = eligible.map(function (r) { return r.key; });
      if (!eligible.length) { p.unallocatedReason = 'NO_ELIGIBLE_RECEIVER'; return p; }

      var weighted = eligible.map(function (r) { return { key: r.key, weight: Math.max(r.weight, 0) }; });
      p.denominator = weighted.reduce(function (a, x) { return a + x.weight; }, 0);
      if (!(p.denominator > 0)) {
        // EXPLICIT: zero denominator allocates ZERO — never an arbitrary equal split and never a 100% fallback.
        eligible.forEach(function (r) { p.allocations[r.key] = 0; });
        p.unallocatedReason = 'ZERO_FORECAST_DENOMINATOR';
        return p;
      }
      if (!(p.availableQty > 0)) { eligible.forEach(function (r) { p.allocations[r.key] = 0; }); p.unallocatedReason = 'NO_AVAILABLE_STOCK'; return p; }

      var res = largestRemainder(p.availableQty, weighted);
      p.allocations = res.byKey; p.allocated = res.allocated;
      p.unallocated = p.availableQty - res.allocated;
      if (p.unallocated > 0) p.unallocatedReason = 'ROUNDING_REMAINDER';
      return p;
    });

    var bySite = {}, byCountry = {};
    // Same reason as largestRemainder: canonical site order, never input order.
    sites.slice().sort(function (a, b) { return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0); })
      .forEach(function (row) { bySite[row.key] = { site: row.site, total: 0, byCountry: {}, forecastWeight: row.weight }; });
    var totalAvail = 0, totalAlloc = 0;
    pools.forEach(function (p) {
      totalAvail += p.availableQty; totalAlloc += p.allocated;
      var c = p.sourceCountry || 'UNKNOWN';
      var bc = byCountry[c] || (byCountry[c] = { available: 0, allocated: 0, unallocated: 0 });
      bc.available += p.availableQty; bc.allocated += p.allocated; bc.unallocated += p.unallocated;
      Object.keys(p.allocations).forEach(function (k) {
        var q = p.allocations[k]; if (!bySite[k]) return;
        bySite[k].total += q;
        bySite[k].byCountry[c] = (bySite[k].byCountry[c] || 0) + q;
      });
    });

    return {
      sku: sku, calculationMonth: str(input.calculationMonth),
      windowMonths: months.map(function (m) { return m.label; }),
      pools: pools, bySite: bySite, byCountry: byCountry,
      totals: { available: totalAvail, allocated: totalAlloc, unallocated: totalAvail - totalAlloc },
      issues: issues, version: VERSION
    };
  }

  // ---- the display seam both pages call ------------------------------------------------------------------------
  // ONE site's factory availability, split by source country. This is what Site Inventory's CN / TW columns and
  // Order Planning's Factory Stock column render — the SAME number from the SAME projection, so the two pages can
  // no longer disagree. Returns zeros (never the physical total) when the site is not an eligible receiver.
  function siteFactoryAvailability(projection, site) {
    var k = siteKey(normSite(site));
    var e = projection && projection.bySite ? projection.bySite[k] : null;
    var byCountry = (e && e.byCountry) || {};
    return {
      siteKey: k, total: (e ? e.total : 0),
      cn: byCountry.CN || 0, tw: byCountry.TW || 0,
      byCountry: byCountry, resolved: !!e
    };
  }

  return {
    project: project,
    siteFactoryAvailability: siteFactoryAvailability,
    siteKey: siteKey, companyKey: companyKey,
    forecastWindowMonths: forecastWindowMonths,
    policyFor: policyFor, isEligibleReceiver: isEligibleReceiver,
    largestRemainder: largestRemainder,
    FACTORY_SOURCE_POLICY: FACTORY_SOURCE_POLICY,
    VERSION: VERSION
  };
});
