// Kitchen Mama Operation System — Ongoing-Order (unshipped PO) Site Projection (F1-7N-FA-3B0).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC projection of the §42 Ongoing-Order supply type into per-site planning facts. This is
// NOT a physical writer, NOT an allocator of §40/§41 factory stock, NOT a Net Order Need owner. It ASSEMBLES
// already-canonical facts:
//   • purchase_order_lines quantities (ordered/completed/shipped) — the lifecycle partition (§42, FA-3B0-PRE)
//   • request_order_line_sources.requested_qty — immutable A1 site provenance (append-only source of truth)
//   • monthly per-site Regular-FC basis (KMPCX.forecastShareQty = Σ Regular FC over M+1..M+4; the SAME basis
//     §7/KMAF use for monthly allocation) — A2 within-company share basis; consumed as an INJECTED fact.
//
// Lifecycle (post FA-3B0-PRE handoff — received qty is now physical Factory Stock):
//   notYetReceivedCommittedQty = MAX(0, ordered − completed)   ← the ONLY quantity this module projects
//   completedNotShippedQty     = MAX(0, completed − shipped)   ← already physical Factory Stock (diagnostic only)
//   shippedLifecycleQty        = MIN(completed, shipped)        ← Shipment / In-Transit (diagnostic only)
// Count-once: ordered = notYetReceived + completedNotShipped + shipped. completed/shipped units NEVER appear in
// the Ongoing site allocations.
//
// Site share:
//   A1 (ordered == requested): shares = source.requested_qty ÷ Σ source.requested_qty (original immutable lineage),
//      applied to notYetReceivedCommittedQty even under partial receipt (no physical site reservation exists).
//   A2 (ordered != requested): shares = siteFcBasis ÷ Σ SAME-COMPANY siteFcBasis (monthly Regular-FC assembly).
// Integer conversion is §43: allocatedQty_i = FLOOR(available × ratio_i); Σ ratio ≤ 1 (else fail closed);
// Σ allocatedQty ≤ available; residual retained (never largest-remainder / +1 / reassigned).
//
// Single-company PO line (re-proven FA-3B0): exactly one of km/resus/restw = ordered_qty → the committed qty
// belongs entirely to purchase_order_lines.company; A1/A2 never cross company.
// No DB/API/clock/random/persistence/mutation; same input ⇒ identical output; input never mutated; JSON-safe.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.core = window.KM.core || {};
    window.KM.core.supplyPlanningOngoingOrderProjection = api;
    window.KMOOP = api; // reserved namespace of record (§42.2)
  }
})(this, function () {
  'use strict';

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function requireObject(v, name) { if (!isObject(v)) throw new TypeError('KMOOP: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')'); return v; }
  function requireArray(v, name) { if (!Array.isArray(v)) throw new TypeError('KMOOP: ' + name + ' must be an array (got ' + describe(v) + ')'); return v; }
  function s(v) { return String(v == null ? '' : v).trim(); }
  function intQty(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? Math.round(n) : NaN; }
  function receiverKey(company, country, marketplace, siteSku) { return [s(company), s(country), s(marketplace), s(siteSku)].join('||'); }

  // §43 physical/committed-supply integer conversion. items = [{ key, ratio, ...meta }]; ratios decimal (not
  // truncated). Fails closed if Σ ratio > 1.0 (+ tiny epsilon). allocatedQty = FLOOR(available × ratio); residual
  // retained; Σ allocated ≤ available guaranteed. NO ROUND/CEIL/largest-remainder/redistribution/+1.
  function floorAllocateByRatio_(availableQty, items) {
    var sumR = 0; items.forEach(function (it) { sumR += it.ratio; });
    if (sumR > 1 + 1e-9) return { ok: false, issue: 'RATIO_TOTAL_EXCEEDS_100', ratioTotal: sumR };
    var allocations = items.map(function (it) { return { key: it.key, ratio: it.ratio, allocatedQty: Math.floor(availableQty * it.ratio), meta: it.meta }; });
    var sumQ = 0; allocations.forEach(function (a) { sumQ += a.allocatedQty; });
    return { ok: true, allocations: allocations, residual: availableQty - sumQ, ratioTotal: sumR };
  }

  function projectOngoingOrderSupply(input) {
    var root = requireObject(input, 'input');
    var poLines = requireArray(root.purchaseOrderLines, 'input.purchaseOrderLines');
    var requestSourceFacts = requireArray(root.requestSourceFacts || [], 'input.requestSourceFacts');
    var monthlySiteFcFacts = requireArray(root.monthlySiteFcFacts || [], 'input.monthlySiteFcFacts');

    // Index A1 provenance by request_order_line_id and A2 basis by company.
    var sourcesByRol = {};
    requestSourceFacts.forEach(function (r) {
      var rol = s(r.requestOrderLineId);
      if (!rol) return;
      (sourcesByRol[rol] = sourcesByRol[rol] || []).push({
        company: s(r.company), country: s(r.country), marketplace: s(r.marketplace), siteSku: s(r.siteSku),
        requestedQty: intQty(r.requestedQty)
      });
    });
    var fcByCompany = {};
    monthlySiteFcFacts.forEach(function (f) {
      var co = s(f.company);
      if (!co) return;
      (fcByCompany[co] = fcByCompany[co] || []).push({
        company: co, country: s(f.country), marketplace: s(f.marketplace), siteSku: s(f.siteSku),
        siteFcBasis: Number(f.siteFcBasis)
      });
    });

    var outLines = poLines.map(function (pl, i) {
      var ctx = 'input.purchaseOrderLines[' + i + ']';
      requireObject(pl, ctx);
      var poLineId = s(pl.purchaseOrderLineId);
      var poId = s(pl.purchaseOrderId);
      var masterSku = s(pl.masterSku || pl.sku);
      var company = s(pl.company);
      var orderedQty = intQty(pl.orderedQty);
      var requestedQty = intQty(pl.requestedQty);
      var completedQty = intQty(pl.completedQty);
      var shippedQty = intQty(pl.shippedQty);
      var requestOrderLineId = s(pl.requestOrderLineId);
      var issues = [];

      function line(mode, allocs, residual, notYetReceived, completedNotShipped, shipped) {
        return {
          purchaseOrderLineId: poLineId, purchaseOrderId: poId, masterSku: masterSku, company: company,
          orderedQty: isNaN(orderedQty) ? null : orderedQty, requestedQty: isNaN(requestedQty) ? null : requestedQty,
          completedQty: isNaN(completedQty) ? null : completedQty, shippedQty: isNaN(shippedQty) ? null : shippedQty,
          notYetReceivedCommittedQty: notYetReceived, completedNotShippedQty: completedNotShipped, shippedLifecycleQty: shipped,
          allocationMode: mode, siteAllocations: allocs, unallocatedResidualQty: residual, issues: issues
        };
      }

      // ---- lifecycle validation (fail closed; never fabricate) ----
      if (isNaN(orderedQty) || isNaN(completedQty) || isNaN(shippedQty) || orderedQty < 0 || completedQty < 0 || shippedQty < 0) {
        issues.push({ code: 'INVALID_LIFECYCLE_QTY', detail: 'ordered/completed/shipped must be non-negative numbers' });
        return line('BLOCKED', [], 0, 0, 0, 0);
      }
      if (completedQty > orderedQty) { issues.push({ code: 'COMPLETED_EXCEEDS_ORDERED', detail: completedQty + ' > ' + orderedQty }); return line('BLOCKED', [], 0, 0, 0, 0); }
      if (shippedQty > completedQty) { issues.push({ code: 'SHIPPED_EXCEEDS_COMPLETED', detail: shippedQty + ' > ' + completedQty }); return line('BLOCKED', [], 0, 0, 0, 0); }

      var notYetReceived = Math.max(0, orderedQty - completedQty);
      var completedNotShipped = Math.max(0, completedQty - shippedQty);
      var shippedLifecycle = Math.min(completedQty, shippedQty);

      // A1 vs A2 predicate: immutable PO snapshot ordered_qty == requested_qty.
      var isA1 = !isNaN(requestedQty) && orderedQty === requestedQty;
      var mode = isA1 ? 'REQUEST_SOURCE_LINEAGE' : 'COMPANY_MONTHLY_FC_SHARE';

      if (notYetReceived === 0) return line(mode, [], 0, notYetReceived, completedNotShipped, shippedLifecycle);

      var items = [], reason;
      if (isA1) {
        reason = 'A1_ORIGINAL_REQUEST_SHARE';
        var srcs = (sourcesByRol[requestOrderLineId] || []).slice();
        if (!srcs.length) { issues.push({ code: 'A1_NO_REQUEST_SOURCES', detail: 'no request_order_line_sources for requestOrderLineId=' + requestOrderLineId }); return line(mode, [], notYetReceived, notYetReceived, completedNotShipped, shippedLifecycle); }
        var crossCo = srcs.filter(function (x) { return x.company !== company; });
        if (crossCo.length) { issues.push({ code: 'A1_CROSS_COMPANY_SOURCE', detail: 'source company != PO line company ' + company }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
        var total = 0, bad = false; srcs.forEach(function (x) { if (isNaN(x.requestedQty) || x.requestedQty < 0) bad = true; else total += x.requestedQty; });
        if (bad) { issues.push({ code: 'A1_INVALID_SOURCE_QTY' }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
        if (total !== requestedQty) { issues.push({ code: 'A1_SOURCE_TOTAL_MISMATCH', detail: 'Σ source.requested_qty ' + total + ' != PO requested_qty ' + requestedQty }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
        if (total === 0) { return line(mode, [], notYetReceived, notYetReceived, completedNotShipped, shippedLifecycle); }
        srcs.sort(function (a, b) { return cmpStr(a.company, b.company) || cmpStr(a.country, b.country) || cmpStr(a.marketplace, b.marketplace) || cmpStr(a.siteSku, b.siteSku); });
        items = srcs.map(function (x) { return { key: receiverKey(x.company, x.country, x.marketplace, x.siteSku), ratio: x.requestedQty / total, meta: x }; });
      } else {
        reason = 'A2_COMPANY_MONTHLY_FC_SHARE';
        var sites = (fcByCompany[company] || []).slice();  // SAME-COMPANY ONLY (never cross-company)
        if (!sites.length) { issues.push({ code: 'A2_NO_ELIGIBLE_SITES', detail: 'no monthly FC sites for company ' + company }); return line(mode, [], notYetReceived, notYetReceived, completedNotShipped, shippedLifecycle); }
        var badFc = sites.filter(function (x) { return !(typeof x.siteFcBasis === 'number' && isFinite(x.siteFcBasis) && x.siteFcBasis >= 0); });
        if (badFc.length) { issues.push({ code: 'A2_INVALID_FC_BASIS' }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
        var companyFc = 0; sites.forEach(function (x) { companyFc += x.siteFcBasis; });
        if (companyFc === 0) { issues.push({ code: 'A2_ZERO_FC_DENOMINATOR', detail: 'Σ same-company siteFcBasis = 0' }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
        sites.sort(function (a, b) { return cmpStr(a.company, b.company) || cmpStr(a.country, b.country) || cmpStr(a.marketplace, b.marketplace) || cmpStr(a.siteSku, b.siteSku); });
        items = sites.map(function (x) { return { key: receiverKey(x.company, x.country, x.marketplace, x.siteSku), ratio: x.siteFcBasis / companyFc, meta: x }; });
      }

      var alloc = floorAllocateByRatio_(notYetReceived, items);
      if (!alloc.ok) { issues.push({ code: alloc.issue, detail: 'Σ ratio = ' + alloc.ratioTotal + ' > 1.0' }); return line('BLOCKED', [], 0, notYetReceived, completedNotShipped, shippedLifecycle); }
      var siteAllocations = alloc.allocations.map(function (a) {
        return {
          receiverKey: a.key, company: a.meta.company, country: a.meta.country, marketplace: a.meta.marketplace, siteSku: a.meta.siteSku,
          share: a.ratio, allocatedQty: a.allocatedQty, sourceReason: reason
        };
      });
      return line(mode, siteAllocations, alloc.residual, notYetReceived, completedNotShipped, shippedLifecycle);
    }).sort(function (a, b) { return cmpStr(a.purchaseOrderLineId, b.purchaseOrderLineId); });

    var totalNotYetReceived = 0, totalSiteAllocated = 0, totalResidual = 0, blockedLines = 0;
    outLines.forEach(function (l) {
      totalNotYetReceived += l.notYetReceivedCommittedQty;
      l.siteAllocations.forEach(function (a) { totalSiteAllocated += a.allocatedQty; });
      totalResidual += l.unallocatedResidualQty;
      if (l.allocationMode === 'BLOCKED') blockedLines++;
    });

    return {
      lines: outLines,
      totals: {
        totalNotYetReceivedCommittedQty: totalNotYetReceived,
        totalSiteAllocatedQty: totalSiteAllocated,
        totalUnallocatedResidualQty: totalResidual,
        blockedLines: blockedLines
      }
    };
  }

  return { projectOngoingOrderSupply: projectOngoingOrderSupply };
});
