// Kitchen Mama Operation System — Canonical SHIPMENT-LINE incoming source (F1-SHIPMENT-INCOMING-R7C).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC. The ONE owner of shipment INCOMING physical truth + receiver attribution, shared by
// BOTH Planning qualification paths so they can never derive shipment quantity/receiver identity from different
// physical sources:
//   • WAREHOUSE_REPLENISHMENT — supply-planning-source-projection.js builds the KMSF shipment inputs from here.
//   • MARKETPLACE_ORDER_NEED  — the recommendation workspace feeds KMDR line-grain candidates built here.
//
// Physical grain = shipment_lines (NEVER the shipment header). remaining = MAX(0, shipment_qty −
// shipment_received_qty), owned by the R4 authority buildKmShipmentSupplyCandidate (reused verbatim — no second
// remaining calculator, no wh_on_the_way, no live FC Share, no destination-text parsing). Receiver attribution
// is FROZEN at dispatch via shipment_lines.shipping_plan_line_id → shipping_plan_lines → shipping_plans
// (company/country/marketplace); present-but-unresolvable lineage and header-MULTI-without-lineage FAIL CLOSED.
//
// No Sheet/DB/API/UI, no clock, no locale, no mutation, no persistence, no new table.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-supply-candidates.js') : (root.KMCAND || (root.KM && root.KM.supplyCandidates))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.shipmentLineSource = api; }
})(this, function (CAND) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }
  function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  // tolerant getter: snake_case primary, camelCase fallback (source-projection passes snake; a caller may pass camel)
  function g(o, snake, camel) { if (has(o, snake)) return o[snake]; if (camel && has(o, camel)) return o[camel]; return undefined; }

  // A marketplace value is "merged / non-specific" when blank or a combined-shipment sentinel. A combined SHIPMENT
  // header carries MULTI; each underlying single-marketplace PLAN header still carries its specific marketplace.
  function isMergedMarketplace(m) { var s = str(m).toLowerCase(); return s === '' || /multi|merged|mixed|combined/.test(s); }
  function isSpecificReceiver(company, country, marketplace) {
    return nonEmpty(company) && nonEmpty(country) && nonEmpty(marketplace) && !isMergedMarketplace(marketplace);
  }

  // ==========================================================================================================
  // resolveShipmentLineReceiver — ONE pure receiver-resolution owner. Authority order:
  //   1. FROZEN dispatch lineage: shipping_plan_line_id → shipping_plan_lines → shipping_plans{company,country,
  //      marketplace}. SKU consistency validated (mismatch → fail closed). Present-but-unresolvable → fail closed
  //      (NEVER a header fallback for a populated lineage).
  //   2. Historical blank lineage + a valid SPECIFIC (non-MULTI) shipment header → header fallback.
  //   3. Otherwise → UNRESOLVED (SHIPMENT_RECEIVER_LINEAGE_UNRESOLVED).
  // input = { shipmentLine, shipment, shippingPlanLineById, shippingPlanById }
  // returns { status:'RESOLVED'|'UNRESOLVED', source, reason, company, country, marketplace }
  // ==========================================================================================================
  function resolveShipmentLineReceiver(input) {
    input = input || {};
    var line = input.shipmentLine || {}, shipment = input.shipment || {};
    var planLineById = input.shippingPlanLineById || {}, planById = input.shippingPlanById || {};
    function resolved(source, co, cy, mk) { return { status: 'RESOLVED', source: source, reason: null, company: co, country: cy, marketplace: mk }; }
    function unresolved(reason) { return { status: 'UNRESOLVED', source: 'UNRESOLVED', reason: reason, company: '', country: '', marketplace: '' }; }

    var planLineId = str(g(line, 'shipping_plan_line_id', 'shippingPlanLineId'));
    if (planLineId) {
      var pl = planLineById[planLineId];
      if (!pl) return unresolved('LINEAGE_PLAN_LINE_NOT_FOUND');                       // present but dangling → fail closed
      var plSku = str(g(pl, 'sku', 'sku')), lnSku = str(g(line, 'sku', 'sku'));
      if (plSku && lnSku && plSku !== lnSku) return unresolved('LINEAGE_SKU_MISMATCH'); // never silently remap
      var plan = planById[str(g(pl, 'shipping_plan_id', 'shippingPlanId'))];
      if (!plan) return unresolved('LINEAGE_PLAN_NOT_FOUND');
      var co = str(g(plan, 'company', 'company')), cy = str(g(plan, 'country', 'country')), mk = str(g(plan, 'marketplace', 'marketplace'));
      if (!isSpecificReceiver(co, cy, mk)) return unresolved('LINEAGE_RECEIVER_NOT_SPECIFIC');
      return resolved('FROZEN_SHIPPING_PLAN_LINE', co, cy, mk);
    }

    // Priority 2 — historical blank lineage + specific (non-MULTI) header.
    var hco = str(g(shipment, 'company', 'company')), hcy = str(g(shipment, 'country', 'country')), hmk = str(g(shipment, 'marketplace', 'marketplace'));
    if (isSpecificReceiver(hco, hcy, hmk)) return resolved('SHIPMENT_HEADER', hco, hcy, hmk);
    return unresolved('HEADER_MULTI_OR_MISSING');                                       // MULTI header w/o lineage → fail closed
  }

  function indexBy(rows, snake, camel) {
    var m = {};
    (rows || []).forEach(function (r) { if (!isObj(r)) return; var k = str(g(r, snake, camel)); if (k && !m[k]) m[k] = r; });
    return m;
  }

  // ==========================================================================================================
  // buildShipmentLineCandidates — ONE canonical line-grain assembly (indexes built ONCE; O(n) over the inputs).
  //   input = { shipmentLines:[], shipments:[], shippingPlanLines:[], shippingPlans:[] } (arrays of row-objects)
  //   Optionally accepts pre-built indexes: { shipmentById, shippingPlanLineById, shippingPlanById }.
  //   returns {
  //     shipmentInputs: [{ shipment, line }],   // raw B4-R3 inputs for KMSF (WAREHOUSE path) — receiver on shipment
  //     candidates:     [{ candidate, resolution, shipmentStatus, headerScope }],  // built DTOs (MARKETPLACE path)
  //     issues:         [{ i, reason }]
  //   }
  // A shipment_line whose parent shipment is missing, or that cannot mint a candidate, fails closed as an issue.
  // ==========================================================================================================
  function buildShipmentLineCandidates(input) {
    input = input || {};
    var lines = input.shipmentLines || [];
    var shipmentById = input.shipmentById || indexBy(input.shipments, 'shipment_id', 'shipmentId');
    var planLineById = input.shippingPlanLineById || indexBy(input.shippingPlanLines, 'shipping_plan_line_id', 'shippingPlanLineId');
    var planById = input.shippingPlanById || indexBy(input.shippingPlans, 'shipping_plan_id', 'shippingPlanId');

    var shipmentInputs = [], candidates = [], issues = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i]; if (!isObj(ln)) { issues.push({ i: i, reason: 'MALFORMED_LINE' }); continue; }
      var shipmentId = str(g(ln, 'shipment_id', 'shipmentId'));
      var shipment = shipmentById[shipmentId];
      if (!shipment) { issues.push({ i: i, reason: 'SHIPMENT_NOT_FOUND:' + shipmentId }); continue; }

      var rcv = resolveShipmentLineReceiver({ shipmentLine: ln, shipment: shipment, shippingPlanLineById: planLineById, shippingPlanById: planById });

      // Raw B4-R3 input — receiver identity from the resolver (NOT the raw header); '' when UNRESOLVED (downstream
      // scope-match/identity then fails closed). Destination warehouse is carried but is NEVER the receiver identity.
      var shipObj = {
        shipmentId: nonEmpty(shipmentId) ? shipmentId : undefined,
        company: nonEmpty(rcv.company) ? rcv.company : undefined,
        country: nonEmpty(rcv.country) ? rcv.country : undefined,
        marketplace: nonEmpty(rcv.marketplace) ? rcv.marketplace : undefined,
        destinationWarehouseId: nonEmpty(g(shipment, 'destination_warehouse_id', 'destinationWarehouseId')) ? str(g(shipment, 'destination_warehouse_id', 'destinationWarehouseId')) : undefined,
        legacyWarehouseId: nonEmpty(g(shipment, 'warehouse_id', 'warehouseId')) ? str(g(shipment, 'warehouse_id', 'warehouseId')) : undefined,
        eta: has(shipment, 'eta') ? shipment.eta : g(shipment, 'eta', 'eta'),
        status: has(shipment, 'status') ? shipment.status : g(shipment, 'status', 'status'),
        sourceUpdatedAt: nonEmpty(g(shipment, 'source_data_as_of', 'sourceUpdatedAt')) ? str(g(shipment, 'source_data_as_of', 'sourceUpdatedAt')) : undefined
      };
      var lineObj = {
        shipmentLineId: nonEmpty(g(ln, 'shipment_line_id', 'shipmentLineId')) ? str(g(ln, 'shipment_line_id', 'shipmentLineId')) : undefined,
        sku: nonEmpty(g(ln, 'sku', 'sku')) ? str(g(ln, 'sku', 'sku')) : undefined,
        shipmentQty: has(ln, 'shipment_qty') ? ln.shipment_qty : g(ln, 'shipment_qty', 'shipmentQty'),
        legacyQty: has(ln, 'qty') ? ln.qty : g(ln, 'qty', 'legacyQty'),
        shipmentReceivedQty: has(ln, 'shipment_received_qty') ? ln.shipment_received_qty : g(ln, 'shipment_received_qty', 'shipmentReceivedQty'),
        siteSku: nonEmpty(g(ln, 'site_sku', 'siteSku')) ? str(g(ln, 'site_sku', 'siteSku')) : undefined,
        shippingPlanLineId: nonEmpty(g(ln, 'shipping_plan_line_id', 'shippingPlanLineId')) ? str(g(ln, 'shipping_plan_line_id', 'shippingPlanLineId')) : undefined
      };

      var shipInput = { shipment: shipObj, line: lineObj };
      var built = null;
      try { built = CAND.buildKmShipmentSupplyCandidate(shipInput); }
      catch (e) { issues.push({ i: i, reason: 'ADAPT_FAILED:' + (e && e.message ? e.message : e) }); continue; }

      // decorate the DTO with the resolver verdict (used by the MARKETPLACE adapter + parity assertions)
      built.receiverResolutionSource = rcv.source;
      built.receiverResolutionStatus = rcv.status;
      built.receiverResolutionReason = rcv.reason;

      shipmentInputs.push(shipInput);
      candidates.push({
        candidate: built, resolution: rcv, shipmentStatus: str(g(shipment, 'status', 'status')),
        headerScope: { company: str(g(shipment, 'company', 'company')), country: str(g(shipment, 'country', 'country')), marketplace: str(g(shipment, 'marketplace', 'marketplace')) }
      });
    }
    return { shipmentInputs: shipmentInputs, candidates: candidates, issues: issues };
  }

  // ONE bounded adapter: canonical candidate DTO → the KMDR marketplace-incoming candidate shape. Sets
  // destinationType='MARKETPLACE' (the receiver IS a marketplace via frozen lineage) so KMDR resolves receiver by
  // company/country/marketplace and does NOT treat the shipment's destination warehouse as a non-marketplace
  // exclusion. quantity = the R4 remaining (KMDR/KMQI must NOT re-derive physical qty). UNRESOLVED → blank
  // marketplace → KMDR identity fails closed (no invented split). No second quantity engine.
  function toMarketplaceIncomingCandidate(entry) {
    var c = (entry && entry.candidate) || {};
    return {
      destinationType: 'MARKETPLACE',
      company: str(c.company), country: str(c.country), marketplace: str(c.marketplace),
      sku: str(c.sku), status: c.status, eta: c.eta,
      quantity: c.quantityRemaining, quantityRemaining: c.quantityRemaining,
      ref: str(c.sourceLineRef), shipmentId: str(c.linkedShipmentId), lineageKey: str(c.lineageKey),
      supplyCandidateId: str(c.supplyCandidateId), shipmentLineId: str(c.linkedShipmentLineId),
      shippingPlanLineId: str(c.linkedShippingPlanLineId),
      receiverResolutionStatus: c.receiverResolutionStatus, receiverResolutionSource: c.receiverResolutionSource
    };
  }

  return {
    resolveShipmentLineReceiver: resolveShipmentLineReceiver,
    buildShipmentLineCandidates: buildShipmentLineCandidates,
    toMarketplaceIncomingCandidate: toMarketplaceIncomingCandidate,
    isSpecificReceiver: isSpecificReceiver,
    isMergedMarketplace: isMergedMarketplace
  };
});
