// Kitchen Mama Operation System — KM Shipment Incoming Adapter (B-4 Minimal Runtime, batch B4-R4).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC adapter. Consumes ONE normalized B4-R3 KM Shipment Supply Candidate + a planning scope,
// and produces ONE source-level Shipment Incoming Adapter result. It answers only SOURCE-LEVEL eligibility:
// canonical Shipment status allowlist, scope match, positive quantityRemaining, destination presence and ETA
// presence — plus deterministic source-level exclusion / review reasons and the quantity allowed to PROCEED to
// B4-R6. It is NOT final Qualified Incoming: no Required-By/ETA-late comparison, no cross-source dedup, no
// ownership precedence, no calculateGap, no persistence. No Sheet/DB/API/UI, no clock, no locale, no mutation.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.incomingAdapters = api;
  }
})(this, function () {
  'use strict';

  var ELIGIBLE_STATUSES = { ready_to_ship: 1, shipped: 1, in_transit: 1, arrived: 1 };

  // Deterministic canonical ordering for reason arrays (output is always emitted in this order, unique).
  var EXCLUSION_ORDER = [
    'AUTHORITY_NOT_SUPPORTED', 'SOURCE_TYPE_NOT_SUPPORTED', 'DOMAIN_NOT_SUPPORTED',
    'STATUS_NOT_ELIGIBLE',
    'COMPANY_SCOPE_MISMATCH', 'SKU_SCOPE_MISMATCH', 'DESTINATION_SCOPE_MISMATCH',
    'COUNTRY_SCOPE_MISMATCH', 'MARKETPLACE_SCOPE_MISMATCH',
    'ZERO_REMAINING_QUANTITY', 'INVALID_REMAINING_QUANTITY'
  ];
  var REVIEW_ORDER = ['MISSING_STATUS', 'UNKNOWN_STATUS', 'MISSING_COMPANY', 'MISSING_DESTINATION_IDENTITY', 'MISSING_ETA'];

  var DEFINITE_EXCLUDED_STATUS = {
    EXCLUDED_DRAFT: 1, EXCLUDED_ALREADY_RECEIVED: 1, EXCLUDED_TERMINAL: 1, EXCLUDED_CANCELLED: 1,
    EXCLUDED_LEGACY_STATUS: 1, EXCLUDED_OPERATIONAL_ALERT: 1, EXCLUDED_EVENT_TOKEN: 1
  };

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function optStr(v) { if (v === null || v === undefined) return null; var s = String(v).trim(); return s === '' ? null : s; }
  function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }

  function requireObject(v, name) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new TypeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    }
    return v;
  }
  // Non-string → TypeError; missing/blank → RangeError.
  function requireStringField(v, name) {
    if (v === null || v === undefined) throw new RangeError('adaptKmShipmentIncomingCandidate: ' + name + ' is required (got ' + describe(v) + ')');
    if (typeof v !== 'string') throw new TypeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a string (got ' + describe(v) + ')');
    var t = v.trim();
    if (t === '') throw new RangeError('adaptKmShipmentIncomingCandidate: ' + name + ' must be a non-empty string');
    return t;
  }

  // Status is normalized (trim + lowercase) FOR COMPARISON ONLY; the raw candidate status is never mutated.
  function classifyStatus(raw) {
    if (raw === null || raw === undefined) return 'MISSING_STATUS';
    var s = String(raw).trim().toLowerCase();
    if (s === '') return 'MISSING_STATUS';
    if (ELIGIBLE_STATUSES[s]) return 'ELIGIBLE_INCOMING_STATUS';
    if (s === 'draft') return 'EXCLUDED_DRAFT';
    if (s === 'received') return 'EXCLUDED_ALREADY_RECEIVED';
    if (s === 'closed') return 'EXCLUDED_TERMINAL';
    if (s === 'cancelled' || s === 'canceled') return 'EXCLUDED_CANCELLED';
    if (s === 'planned' || s === 'completed' || s === 'partial_received') return 'EXCLUDED_LEGACY_STATUS';
    if (s === 'stuck') return 'EXCLUDED_OPERATIONAL_ALERT';
    if (s === 'delivered') return 'EXCLUDED_EVENT_TOKEN';
    return 'UNKNOWN_STATUS';
  }

  function orderUnique(order, set) {
    var out = [];
    for (var i = 0; i < order.length; i++) { if (set[order[i]]) out.push(order[i]); }
    return out;
  }

  /**
   * adaptKmShipmentIncomingCandidate({ candidate, scope }) → one fresh source-level Shipment Incoming result.
   * candidate = output of buildKmShipmentSupplyCandidate(...). scope = { company, sku, destinationWarehouseId,
   * country?, marketplace? }. Throws TypeError/RangeError on structural violations; wrong authority/source/domain
   * fail CLOSED via a deterministic exclusion result (not a throw) when the candidate is structurally valid.
   */
  function adaptKmShipmentIncomingCandidate(input) {
    requireObject(input, 'input');
    var candidate = requireObject(input.candidate, 'input.candidate');
    var scope = requireObject(input.scope, 'input.scope');

    // Structural candidate identity (malformed candidate → throw).
    requireStringField(candidate.supplyCandidateId, 'input.candidate.supplyCandidateId');
    requireStringField(candidate.sourceLineRef, 'input.candidate.sourceLineRef');

    // Required scope (blank → RangeError; non-string → TypeError).
    var scCompany = requireStringField(scope.company, 'input.scope.company');
    var scSku = requireStringField(scope.sku, 'input.scope.sku');
    var scDest = requireStringField(scope.destinationWarehouseId, 'input.scope.destinationWarehouseId');
    var scCountry = optStr(scope.country);
    var scMarketplace = optStr(scope.marketplace);

    var exSet = {}, rvSet = {};
    function excl(t) { exSet[t] = 1; }
    function review(t) { rvSet[t] = 1; }

    // Authority / source / domain — fail closed via deterministic exclusion (preferred split, §9).
    var authorityOk = candidate.authorityType === 'KM_CANONICAL';
    var sourceOk = candidate.sourceType === 'KM_SHIPMENT_LINE';
    var domainOk = candidate.supplyDomain === 'KM_3PL_OVERSEAS';
    if (!authorityOk) excl('AUTHORITY_NOT_SUPPORTED');
    if (!sourceOk) excl('SOURCE_TYPE_NOT_SUPPORTED');
    if (!domainOk) excl('DOMAIN_NOT_SUPPORTED');
    var typeAccepted = authorityOk && sourceOk && domainOk;

    // Status (allowlist owner: statusClass).
    var statusClass = classifyStatus(candidate.status);
    var statusEligible = statusClass === 'ELIGIBLE_INCOMING_STATUS';
    if (DEFINITE_EXCLUDED_STATUS[statusClass]) excl('STATUS_NOT_ELIGIBLE');
    if (statusClass === 'MISSING_STATUS') review('MISSING_STATUS');
    if (statusClass === 'UNKNOWN_STATUS') review('UNKNOWN_STATUS');

    // Scope matching (company/sku/country/marketplace case-insensitive; destination exact trimmed id).
    var scopeEligible = true;
    if (candidate.company === null || candidate.company === undefined) { review('MISSING_COMPANY'); scopeEligible = false; }
    else if (normToken(candidate.company) !== normToken(scCompany)) { excl('COMPANY_SCOPE_MISMATCH'); scopeEligible = false; }

    if (normToken(candidate.sku) !== normToken(scSku)) { excl('SKU_SCOPE_MISMATCH'); scopeEligible = false; }

    if (isBlank(candidate.destinationWarehouseId) || candidate.destinationIdentitySource === 'MISSING') { review('MISSING_DESTINATION_IDENTITY'); scopeEligible = false; }
    else if (String(candidate.destinationWarehouseId).trim() !== scDest) { excl('DESTINATION_SCOPE_MISMATCH'); scopeEligible = false; }

    if (scCountry !== null) {
      if (candidate.country === null || candidate.country === undefined || normToken(candidate.country) !== normToken(scCountry)) { excl('COUNTRY_SCOPE_MISMATCH'); scopeEligible = false; }
    }
    if (scMarketplace !== null) {
      if (candidate.marketplace === null || candidate.marketplace === undefined || normToken(candidate.marketplace) !== normToken(scMarketplace)) { excl('MARKETPLACE_SCOPE_MISMATCH'); scopeEligible = false; }
    }

    // Quantity — consume candidate.quantityRemaining ONLY (never recompute from raw qty).
    var qty = candidate.quantityRemaining;
    var quantityEligible = false;
    if (typeof qty !== 'number' || !isFinite(qty)) excl('INVALID_REMAINING_QUANTITY');
    else if (qty > 0) quantityEligible = true;
    else if (qty === 0) excl('ZERO_REMAINING_QUANTITY');
    else excl('INVALID_REMAINING_QUANTITY'); // negative

    // ETA — presence only (never parsed, never compared to Required-By).
    var etaPresent = !isBlank(candidate.eta);
    if (!etaPresent) review('MISSING_ETA');

    var sourceEligible = typeAccepted && statusEligible && scopeEligible && quantityEligible && etaPresent;
    var adapterEligibleQuantity = sourceEligible ? qty : 0;

    return {
      // Fresh shallow snapshot of immutable identity/reference fields (does not expose the input candidate ref).
      candidate: {
        supplyCandidateId: candidate.supplyCandidateId,
        sourceRef: candidate.sourceRef,
        sourceLineRef: candidate.sourceLineRef,
        lineageKey: candidate.lineageKey,
        linkedShipmentId: candidate.linkedShipmentId,
        linkedShipmentLineId: candidate.linkedShipmentLineId,
        sku: candidate.sku,
        status: candidate.status, // raw status retained unchanged
        destinationWarehouseId: candidate.destinationWarehouseId,
        quantityRemaining: candidate.quantityRemaining,
        authorityType: candidate.authorityType,
        sourceType: candidate.sourceType,
        supplyDomain: candidate.supplyDomain
      },
      adapterType: 'KM_SHIPMENT_INCOMING',
      sourceEligible: sourceEligible,
      statusEligible: statusEligible,
      scopeEligible: scopeEligible,
      quantityEligible: quantityEligible,
      etaPresent: etaPresent,
      adapterEligibleQuantity: adapterEligibleQuantity, // proceeds to B4-R6; NOT final Qualified Incoming
      statusClass: statusClass,
      exclusionReasons: orderUnique(EXCLUSION_ORDER, exSet),
      reviewReasons: orderUnique(REVIEW_ORDER, rvSet)
    };
  }

  return { adaptKmShipmentIncomingCandidate: adaptKmShipmentIncomingCandidate };
});
