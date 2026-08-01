// Kitchen Mama Operation System — Normalized KM Shipment Supply Candidate (B-4 Minimal Runtime, batch B4-R3).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC builder. Given ONE KM Shipment header + ONE Shipment line, it produces one normalized
// Runtime input object ("supply candidate"). It is NOT Qualified Incoming, NOT a persisted Supply Ledger row,
// NOT a recommendation, NOT a planning-admission decision, NOT a deduplicated result, NOT a status-qualified
// result, and NOT an inventory balance. It performs only: strict input validation, canonical source
// normalization, deterministic identity construction, quantity normalization (B4-R1 semantics), destination
// normalization (B4-R2 semantics), source/lineage metadata, KM-canonical authority classification, and
// source-completeness review flags. No Sheet/DB/API/UI access, no clock, no locale, no mutation, no persistence.
// Qualification, status allowlist, ETA/Required-By, dedup, and calculateGap integration are LATER batches.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.supplyCandidates = api;
  }
})(this, function () {
  'use strict';

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }

  function isBlank(v) {
    return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }

  // Optional string: null/undefined/blank/whitespace → null; otherwise trimmed string (case preserved, no parse).
  function optStr(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    return s === '' ? null : s;
  }

  // Required stable-identity field: non-string → TypeError; missing/blank → RangeError (cannot mint a stable id).
  // Trimmed to match the canonical source normalization (procSrcNorm_ = String(v).trim()); NEVER lowercased.
  function requireIdField(v, name) {
    if (v === null || v === undefined) {
      throw new RangeError('buildKmShipmentSupplyCandidate: ' + name + ' is required (got ' + describe(v) + ')');
    }
    if (typeof v !== 'string') {
      throw new TypeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a string (got ' + describe(v) + ')');
    }
    var t = v.trim();
    if (t === '') {
      throw new RangeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a non-empty string');
    }
    return t;
  }

  function requireObject(v, name) {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) {
      throw new TypeError('buildKmShipmentSupplyCandidate: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    }
    return v;
  }

  // B4-R1 quantity semantics reproduced purely. Canonical shipmentQty is primary; legacy qty is fallback ONLY
  // when the canonical value is absent/blank. Canonical 0 is a valid zero. A present-but-malformed or negative
  // value resolves to 0 and is flagged invalid (never falls back, never summed). Returns { value: >=0, invalid }.
  function resolveQuantity(canon, legacy) {
    if (!isBlank(canon)) {
      var n = parseFloat(canon);
      if (isFinite(n) && n >= 0) return { value: n, invalid: false };
      return { value: 0, invalid: true };
    }
    if (!isBlank(legacy)) {
      var m = parseFloat(legacy);
      if (isFinite(m) && m >= 0) return { value: m, invalid: false };
      return { value: 0, invalid: true };
    }
    return { value: 0, invalid: false }; // both absent/blank → missing quantity source, not "invalid"
  }

  // B4-R2 destination semantics reproduced purely. Canonical destination_warehouse_id is primary; legacy
  // warehouse_id is fallback ONLY when canonical is absent/blank. warehouse_code / name / address / display text
  // and origin/source warehouse are NEVER identity (not passed in). String id "0" is preserved. Missing → null.
  function resolveDestination(canon, legacy) {
    if (!isBlank(canon)) return { id: String(canon).trim(), source: 'CANONICAL_DESTINATION_WAREHOUSE_ID' };
    if (!isBlank(legacy)) return { id: String(legacy).trim(), source: 'LEGACY_WAREHOUSE_ID_FALLBACK' };
    return { id: null, source: 'MISSING' };
  }

  /**
   * buildKmShipmentSupplyCandidate(input) → one fresh, immutable, normalized KM Shipment supply candidate.
   * input = { shipment: {...}, line: {...} } (one Shipment header + one Shipment line).
   * Throws TypeError for structural violations; RangeError when a stable identity cannot be minted.
   */
  function buildKmShipmentSupplyCandidate(input) {
    requireObject(input, 'input');
    var shipment = requireObject(input.shipment, 'input.shipment');
    var line = requireObject(input.line, 'input.line');

    // Stable identity fields (required).
    var shipmentId = requireIdField(shipment.shipmentId, 'input.shipment.shipmentId');
    var shipmentLineId = requireIdField(line.shipmentLineId, 'input.line.shipmentLineId');
    var sku = requireIdField(line.sku, 'input.line.sku');

    // Optional business/source fields (case preserved, not parsed, not clock-evaluated).
    var company = optStr(shipment.company);
    var country = optStr(shipment.country);
    var marketplace = optStr(shipment.marketplace);
    var eta = optStr(shipment.eta);
    var sourceUpdatedAt = optStr(shipment.sourceUpdatedAt);
    var status = optStr(shipment.status);
    var siteSku = optStr(line.siteSku);
    var purchaseOrderLineId = optStr(line.purchaseOrderLineId);
    var shippingPlanLineId = optStr(line.shippingPlanLineId);

    // Quantity (B4-R1) and destination (B4-R2).
    var q = resolveQuantity(line.shipmentQty, line.legacyQty);
    var dest = resolveDestination(shipment.destinationWarehouseId, shipment.legacyWarehouseId);

    // Deterministic stable identities — only from immutable shipment + line ids (NO status/eta/qty/label/date).
    var sourceRef = 'shipment:' + shipmentId;
    var sourceLineRef = 'shipment:' + shipmentId + ':' + shipmentLineId;
    var supplyCandidateId = sourceLineRef;
    var lineageKey = sourceLineRef;

    // Source-completeness review flags only (NOT business qualification). Fixed, deterministic order; unique.
    var reviewFlags = [];
    if (company === null) reviewFlags.push('MISSING_COMPANY');
    if (dest.source === 'MISSING') reviewFlags.push('MISSING_DESTINATION_IDENTITY');
    if (q.invalid) reviewFlags.push('INVALID_QUANTITY');
    if (eta === null) reviewFlags.push('MISSING_ETA');
    if (status === null) reviewFlags.push('MISSING_STATUS');

    return {
      supplyCandidateId: supplyCandidateId,
      supplyDomain: 'KM_3PL_OVERSEAS',
      supplyStage: 'FORMAL_SHIPMENT',
      authorityType: 'KM_CANONICAL',
      sourceType: 'KM_SHIPMENT_LINE',
      sourceRef: sourceRef,
      sourceLineRef: sourceLineRef,
      lineageKey: lineageKey,
      company: company,
      country: country,
      marketplace: marketplace,
      sku: sku,
      siteSku: siteSku,
      destinationWarehouseId: dest.id,
      destinationIdentitySource: dest.source,
      quantityOriginal: q.value,
      quantityRemaining: q.value, // B4-R3 does NOT subtract received/cancelled/allocated/consumed (later batches)
      eta: eta,
      sourceUpdatedAt: sourceUpdatedAt,
      status: status, // raw status preserved (trimmed); status interpretation is B4-R4
      linkedShipmentId: shipmentId,
      linkedShipmentLineId: shipmentLineId,
      linkedPurchaseOrderLineId: purchaseOrderLineId,
      linkedShippingPlanLineId: shippingPlanLineId,
      reviewFlags: reviewFlags
    };
  }

  return { buildKmShipmentSupplyCandidate: buildKmShipmentSupplyCandidate };
});
