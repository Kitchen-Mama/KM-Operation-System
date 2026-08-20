// Kitchen Mama Operation System — Ongoing-Order Live Runtime chain (KMOOR) — F1-7N-FA-3B3a.
// =============================================================================================================
// PURE / DETERMINISTIC single-authority Ongoing-PO supply chain for the LIVE Architecture-A monthly runtime:
//
//   RAW purchase_order_lines
//     → KMSF.projectSupplyLifecycle  (LIFECYCLE / COUNT-ONCE admission authority; committedProduction bucket)
//     → KMOOP.projectOngoingOrderSupply (SITE-ALLOCATION authority; A1 request-source share / A2 company FC share)
//     → KMOTA.projectOngoingOrderIncoming (PHASE-1 future-factory availability-date authority)
//     → per-receiver KMTPP incoming facts (the caller injects them into the ONE existing KMTPP incoming list)
//
// There is exactly ONE Ongoing-PO runtime path. KMOOP does NOT independently establish lifecycle eligibility from
// a second raw-PO read: this module admits the not-yet-received committed quantity through KMSF FIRST, then bounds
// KMOOP's allocatable total to the KMSF-admitted quantity (hard invariant, asserted per lineage).
//
// FROZEN lifecycle (post FA-3B0-PRE), quantity-partitioned and count-once:
//   notYetReceivedCommittedQty = MAX(0, ordered_qty − completed_qty)   ← the ONLY qty admitted as ONGOING
//   received (completed) qty  → Factory Current Stock authority (NOT ongoing)
//   shipped qty (⊆ completed) → Shipment / In-Transit authority (NOT ongoing; excluded by the arithmetic)
// KMSF admission uses its EXISTING canonical vocabulary: the committed-production quantity is presented under the
// COMMITTED_PRODUCTION bucket (status token 'in_production'); KMSF owns field-level count-once admission (dedup by
// supplyLineageRef, DRAFT/CANCELLED exclusion, zero/negative/missing-field fail-closed). Because the admitted qty
// is MAX(0, ordered−completed), received and shipped units can never appear here → count-once holds. (A canonical
// line-grain PO production status is not available in planning reads; the frozen quantity partition is the
// authority — no invented status vocabulary. A later slice may add status-driven OMIT once such a field exists.)
//
// PHASE-1 timing: availableDate = purchase_order_lines.expected_completion_date VERBATIM (future factory
// availability, NOT a destination/shipment ETA), owned behind KMOTA.resolveOngoingAvailableDate_. Blank/invalid →
// ONGOING_ORDER_ETA_UNRESOLVED → the lineage is still admitted/counted but contributes ZERO timed incoming.
//
// No DB/API/clock/random/persistence/mutation. Same input ⇒ identical output. Inputs never mutated. JSON-safe.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts)),
    req ? req('./supply-planning-ongoing-order-projection.js') : (root.KMOOP || (root.KM && root.KM.core && root.KM.core.supplyPlanningOngoingOrderProjection)),
    req ? req('./supply-planning-ongoing-order-tpp-adapter.js') : (root.KMOTA || (root.KM && root.KM.core && root.KM.core.supplyPlanningOngoingOrderTppAdapter))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.core = window.KM.core || {};
    window.KM.core.supplyPlanningOngoingOrderRuntime = api;
    window.KMOOR = api; // reserved namespace of record (§42.6)
  }
})(this, function (KMSF, KMOOP, KMOTA) {
  'use strict';

  var SOURCE_TYPE = 'ONGOING_ORDER';
  var TIERS = ['T1', 'T2', 'T3', 'T4'];

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function s(v) { return String(v == null ? '' : v).trim(); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function intOr(v) { var n = Number(v); return (typeof n === 'number' && isFinite(n)) ? Math.round(n) : NaN; }
  function requireArray(v, name) { if (!Array.isArray(v)) throw new TypeError('KMOOR: ' + name + ' must be an array'); return v; }
  function requireObject(v, name) { if (!isObj(v)) throw new TypeError('KMOOR: ' + name + ' must be a non-null, non-array object'); return v; }

  function tierByMonthOf(months) {
    var m = {}; (months || []).forEach(function (ym, i) { if (i < 4 && s(ym)) m[s(ym)] = TIERS[i]; }); return m;
  }

  // Map ONE raw purchase_order_lines row → the normalized fields this chain consumes (canonical column names).
  function normalizePoRow_(r) {
    return {
      poLineId: s(r.purchase_order_line_id), poId: s(r.purchase_order_id),
      requestOrderLineId: s(r.request_order_line_id), company: s(r.company), sku: s(r.sku),
      supplierWarehouseId: s(r.supplier_warehouse_id),
      orderedQty: intOr(r.ordered_qty), completedQty: intOr(r.completed_qty), shippedQty: intOr(r.shipped_qty),
      requestedQty: intOr(r.requested_qty), expectedCompletionDate: s(r.expected_completion_date)
    };
  }

  // input = {
  //   masterSku, company,                          // the SKU + company slice to project (required)
  //   purchaseOrderLines: [raw purchase_order_lines rows],
  //   requestOrderLineSources: [raw request_order_line_sources rows],   // A1 provenance
  //   monthlySiteFcFacts: [{ company, country, marketplace, siteSku, siteFcBasis }],  // A2 basis (caller-assembled)
  //   months: ['YYYY-MM' x4]                        // frozen KMPCX window → tierByMonth
  // }
  // → { ready, byReceiver: { receiverKey: [ { incomingId, eta, qty, sourceType } ] }, admittedByLineage, issues, totals }
  function projectOngoingIncomingForSku(input) {
    var root = requireObject(input, 'input');
    var masterSku = s(root.masterSku), company = s(root.company);
    var poRows = requireArray(root.purchaseOrderLines || [], 'input.purchaseOrderLines');
    var reqSrcRows = requireArray(root.requestOrderLineSources || [], 'input.requestOrderLineSources');
    var monthlySiteFcFacts = requireArray(root.monthlySiteFcFacts || [], 'input.monthlySiteFcFacts');
    var months = requireArray(root.months || [], 'input.months');
    var issues = [];
    if (!masterSku || !company) throw new TypeError('KMOOR: input.masterSku and input.company are required');

    // 1) Slice raw PO lines to THIS company+sku and normalize.
    var lines = poRows.map(normalizePoRow_).filter(function (p) { return p.company === company && p.sku === masterSku && p.poLineId; });

    // 2) KMSF lifecycle admission — present the frozen not-yet-received committed qty under COMMITTED_PRODUCTION.
    var committedRows = [], skuByLineage = {}, poRowByLineage = {};
    lines.forEach(function (p) {
      poRowByLineage[p.poLineId] = p; skuByLineage[p.poLineId] = p.sku;
      if (isNaN(p.orderedQty) || isNaN(p.completedQty)) { issues.push({ stage: 'KMOOR', code: 'INVALID_LIFECYCLE_QTY', poLineId: p.poLineId }); return; }
      var notYetReceived = Math.max(0, p.orderedQty - p.completedQty);
      if (notYetReceived <= 0) return;   // fully received/shipped → Factory Current authority, not ongoing
      if (!p.supplierWarehouseId) { issues.push({ stage: 'KMOOR', code: 'ONGOING_ORDER_FACTORY_WAREHOUSE_UNRESOLVED', poLineId: p.poLineId }); return; }
      committedRows.push({
        supplyLineageRef: p.poLineId, company: p.company, masterSku: p.sku, warehouseId: p.supplierWarehouseId,
        poolType: 'FACTORY', status: 'in_production', quantity: notYetReceived
      });
    });

    var admittedByLineage = {};
    if (committedRows.length) {
      var lc = KMSF.projectSupplyLifecycle({ committedProduction: committedRows });
      (lc.issues || []).forEach(function (x) { if (x.domain === 'committedProduction') issues.push({ stage: 'KMSF', code: x.reason, i: x.i }); });
      (lc.entries || []).forEach(function (e) {
        if (e.lifecycleBucket === 'COMMITTED_PRODUCTION') admittedByLineage[e.supplyLineageRef] = (admittedByLineage[e.supplyLineageRef] || 0) + e.quantity;
      });
    }

    // 3) KMOOP site allocation — ONLY over KMSF-admitted lineages; allocatable total BOUNDED by admitted qty.
    var admittedLines = lines.filter(function (p) { return Object.prototype.hasOwnProperty.call(admittedByLineage, p.poLineId); });
    var kmoopPoLines = admittedLines.map(function (p) {
      return {
        purchaseOrderLineId: p.poLineId, purchaseOrderId: p.poId, sku: p.sku, company: p.company,
        orderedQty: p.orderedQty, requestedQty: p.requestedQty, completedQty: p.completedQty, shippedQty: p.shippedQty,
        requestOrderLineId: p.requestOrderLineId
      };
    });
    var requestSourceFacts = reqSrcRows.map(function (r) {
      return { requestOrderLineId: s(r.request_order_line_id), company: s(r.company), country: s(r.country),
        marketplace: s(r.marketplace), siteSku: s(r.site_sku), requestedQty: intOr(r.requested_qty) };
    });

    var byReceiver = {};
    if (kmoopPoLines.length) {
      var kmoop = KMOOP.projectOngoingOrderSupply({ purchaseOrderLines: kmoopPoLines, requestSourceFacts: requestSourceFacts, monthlySiteFcFacts: monthlySiteFcFacts });
      // Single-authority invariant: KMOOP's notYetReceived MUST equal the KMSF-admitted qty for every lineage.
      (kmoop.lines || []).forEach(function (l) {
        var admitted = admittedByLineage[l.purchaseOrderLineId];
        if (admitted !== undefined && l.notYetReceivedCommittedQty !== admitted) {
          issues.push({ stage: 'KMOOR', code: 'ONGOING_ADMITTED_QTY_MISMATCH', poLineId: l.purchaseOrderLineId, admitted: admitted, kmoop: l.notYetReceivedCommittedQty });
        }
        (l.issues || []).forEach(function (x) { issues.push({ stage: 'KMOOP', code: x.code, poLineId: l.purchaseOrderLineId }); });
      });

      // 4) KMOTA timing — availableDate = expected_completion_date (Phase-1), tier via the frozen tierByMonth window.
      var poLineTiming = admittedLines.map(function (p) { return { purchaseOrderLineId: p.poLineId, expectedCompletionDate: p.expectedCompletionDate }; });
      var kmota = KMOTA.projectOngoingOrderIncoming({ ongoingProjection: kmoop, poLineTiming: poLineTiming, tierByMonth: tierByMonthOf(months) });
      (kmota.issues || []).forEach(function (x) { issues.push({ stage: 'KMOTA', code: x.code, poLineId: x.purchaseOrderLineId }); });

      // 5) Group into per-receiver KMTPP incoming facts (eta = availableDate; tier is derived by the live KMTPP
      //    caller from the eta month via the SAME tierByMonth — do not pre-bake tier into the injected event).
      kmota.incomingEvents.forEach(function (ev) {
        var rk = s(ev.receiverKey);
        (byReceiver[rk] = byReceiver[rk] || []).push({ incomingId: s(ev.incomingId), eta: s(ev.availableDate), qty: ev.qty, sourceType: SOURCE_TYPE });
      });
      Object.keys(byReceiver).forEach(function (rk) { byReceiver[rk].sort(function (a, b) { return cmpStr(a.incomingId, b.incomingId); }); });
    }

    var totalAdmitted = 0, k; for (k in admittedByLineage) if (Object.prototype.hasOwnProperty.call(admittedByLineage, k)) totalAdmitted += admittedByLineage[k];
    var totalIncoming = 0, receiverCount = 0;
    Object.keys(byReceiver).forEach(function (rk) { receiverCount++; byReceiver[rk].forEach(function (e) { totalIncoming += e.qty; }); });

    return {
      ready: true, byReceiver: byReceiver, admittedByLineage: admittedByLineage, issues: issues,
      totals: { admittedLineages: Object.keys(admittedByLineage).length, totalAdmittedQty: totalAdmitted, receiverCount: receiverCount, totalTimedIncomingQty: totalIncoming }
    };
  }

  return { projectOngoingIncomingForSku: projectOngoingIncomingForSku, SOURCE_TYPE: SOURCE_TYPE, VERSION: 'kmoor-fa3b3a-1' };
});
