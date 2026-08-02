// Kitchen Mama Operation System — Minimal Supply-Planning Line Runtime (B-4 Minimal Runtime, batch B4-R7).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC one-line orchestrator. For ONE exact planning line (company + Master SKU +
// destinationWarehouseId + Required-By window) it connects the VERIFIED B4-R6 Qualified-Incoming engine to the
// EXISTING canonical calculateGap() — nothing more. It CALLS the real evaluateQualifiedIncoming and the real
// calculateGap; it copies NO arithmetic and defines NO second gap formula.
//
// STRICT WIRING: the ONLY B4-R6 quantity that enters calculateGap is qualifiedIncomingResult.qualifiedIncomingQuantity,
// passed exactly as calculateGap.timelyQualifiedIncoming. Late Risk, Review, Excluded and every external observed
// quantity remain VISIBLE in the breakdown but contribute ZERO to the gap. Demand, destinationCurrentStock,
// timelyApprovedCommittedSupply and timelyQualifiedIncoming are each applied EXACTLY ONCE (by calculateGap).
//
// BOUNDARY: it reads no Sheet/DB/API, builds no B4-R3 candidates, reruns no B4-R4/B4-R5, decides no demand /
// committed-supply / recommendation quantity, does no carton rounding / allocation, persists nothing, installs no
// scheduler. The caller supplies already-built, already-scoped B4-R4 / B4-R5 results and the four numeric line
// quantities. No clock, no locale, no mutation.

(function (root, factory) {
  'use strict';
  var deps;
  if (typeof module !== 'undefined' && module.exports) {
    deps = {
      evaluateQualifiedIncoming: require('./supply-planning-qualified-incoming.js').evaluateQualifiedIncoming,
      calculateGap: require('./supply-planning-calculations.js').calculateGap
    };
    module.exports = factory(deps);
  } else {
    root.KM = root.KM || {};
    var km = root.KM;
    deps = {
      evaluateQualifiedIncoming: km.qualifiedIncoming && km.qualifiedIncoming.evaluateQualifiedIncoming,
      calculateGap: km.core && km.core.supplyPlanningCalculations && km.core.supplyPlanningCalculations.calculateGap
    };
    km.lineRuntime = factory(deps);
  }
})(this, function (deps) {
  'use strict';

  var evaluateQualifiedIncoming = deps && deps.evaluateQualifiedIncoming;
  var calculateGap = deps && deps.calculateGap;

  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isBlank(v) { return v === '' || v === null || v === undefined || (typeof v === 'string' && v.trim() === ''); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function normToken(v) { return String(v === null || v === undefined ? '' : v).trim().toLowerCase(); }
  function optStr(v) { if (v === null || v === undefined) return null; var s = String(v).trim(); return s === '' ? null : s; }

  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('runSupplyPlanningLine: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonBlankString(v, name) {
    if (v === null || v === undefined) throw new RangeError('runSupplyPlanningLine: ' + name + ' is required (got ' + describe(v) + ')');
    if (typeof v !== 'string') throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (v.trim() === '') throw new RangeError('runSupplyPlanningLine: ' + name + ' must be a non-empty string');
    return v.trim();
  }
  // Numeric line quantity: non-number → TypeError; NaN/Infinity/negative → RangeError. No numeric-string coercion.
  // (calculateGap re-validates the same four values; this fails early with precise, testable error types.)
  function requireQty(v, name) {
    if (typeof v !== 'number') throw new TypeError('runSupplyPlanningLine: ' + name + ' must be a number (got ' + describe(v) + ')');
    if (!isFinite(v)) throw new RangeError('runSupplyPlanningLine: ' + name + ' must be finite (got ' + v + ')');
    if (v < 0) throw new RangeError('runSupplyPlanningLine: ' + name + ' must be non-negative (got ' + v + ')');
    return v;
  }

  // A candidate value violates scope ONLY when it is PRESENT and differs from the declared scope value. A blank/
  // missing candidate value is NOT a scope mismatch — it flows to B4-R6 as a REVIEW row (never silently dropped).
  function scopeConflict(candVal, scopeVal, exact) {
    if (isBlank(candVal)) return false;
    return exact ? (String(candVal).trim() !== String(scopeVal).trim()) : (normToken(candVal) !== normToken(scopeVal));
  }

  /**
   * runSupplyPlanningLine(input) → one fresh, traceable Supply-Planning Line result. Orchestrates, in order:
   * validate → scope-consistency gate → evaluateQualifiedIncoming → wire qualifiedIncomingQuantity → calculateGap.
   * Consumes already-built B4-R4 / B4-R5 adapter results and four caller-supplied numeric quantities; reads no source.
   */
  function runSupplyPlanningLine(input) {
    if (typeof evaluateQualifiedIncoming !== 'function' || typeof calculateGap !== 'function') {
      throw new Error('runSupplyPlanningLine: required dependencies (evaluateQualifiedIncoming, calculateGap) are not available');
    }

    // 1. Structural validation of input + lineScope.
    requireObject(input, 'input');
    var lineScope = requireObject(input.lineScope, 'input.lineScope');
    var scCompany = requireNonBlankString(lineScope.company, 'input.lineScope.company');
    var scSku = requireNonBlankString(lineScope.sku, 'input.lineScope.sku');
    var scDest = requireNonBlankString(lineScope.destinationWarehouseId, 'input.lineScope.destinationWarehouseId');
    var scCountry = optStr(lineScope.country);
    var scMarketplace = optStr(lineScope.marketplace);

    var demand = requireQty(input.demand, 'input.demand');
    var destinationCurrentStock = requireQty(input.destinationCurrentStock, 'input.destinationCurrentStock');
    var timelyApprovedCommittedSupply = requireQty(input.timelyApprovedCommittedSupply, 'input.timelyApprovedCommittedSupply');

    var kmShipmentResults = requireArray(input.kmShipmentResults, 'input.kmShipmentResults');
    var externalAuthorityResults = input.externalAuthorityResults === undefined || input.externalAuthorityResults === null
      ? [] : requireArray(input.externalAuthorityResults, 'input.externalAuthorityResults');
    var postedToCurrentStockLineageKeys = input.postedToCurrentStockLineageKeys === undefined || input.postedToCurrentStockLineageKeys === null
      ? [] : requireArray(input.postedToCurrentStockLineageKeys, 'input.postedToCurrentStockLineageKeys');
    var activeOtherBucketLineageKeys = input.activeOtherBucketLineageKeys === undefined || input.activeOtherBucketLineageKeys === null
      ? [] : requireArray(input.activeOtherBucketLineageKeys, 'input.activeOtherBucketLineageKeys');

    // 2. Scope-consistency gate — every KM candidate must be compatible with the declared line (fail closed on a
    // real mismatch; a mismatched candidate is NEVER silently dropped, and companies/SKUs/destinations never merge).
    kmShipmentResults.forEach(function (r, i) {
      requireObject(r, 'input.kmShipmentResults[' + i + ']');
      var c = requireObject(r.candidate, 'input.kmShipmentResults[' + i + '].candidate');
      if (scopeConflict(c.company, scCompany, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] company out of line scope (dimension=company)');
      if (scopeConflict(c.sku, scSku, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] sku out of line scope (dimension=sku)');
      if (scopeConflict(c.destinationWarehouseId, scDest, true)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] destinationWarehouseId out of line scope (dimension=destinationWarehouseId)');
      if (scCountry !== null && scopeConflict(c.country, scCountry, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] country out of line scope (dimension=country)');
      if (scMarketplace !== null && scopeConflict(c.marketplace, scMarketplace, false)) throw new RangeError('runSupplyPlanningLine: kmShipmentResults[' + i + '] marketplace out of line scope (dimension=marketplace)');
    });

    // 3. Qualified Incoming engine (B4-R6) — the sole owner of the ten gates, dedup, Required-By, external zero.
    var qualifiedIncomingResult = evaluateQualifiedIncoming({
      requiredByDate: input.requiredByDate,
      kmShipmentResults: kmShipmentResults,
      externalAuthorityResults: externalAuthorityResults,
      postedToCurrentStockLineageKeys: postedToCurrentStockLineageKeys,
      activeOtherBucketLineageKeys: activeOtherBucketLineageKeys
    });

    // 4. Extract ONLY the timely qualified quantity (never Late/Review/Excluded/external observed).
    var timelyQualifiedIncoming = qualifiedIncomingResult.qualifiedIncomingQuantity;

    // 5. Existing canonical gap — each supply term deducted EXACTLY ONCE, floored at 0 (formula owned upstream).
    var calculatedGap = calculateGap({
      demand: demand,
      destinationCurrentStock: destinationCurrentStock,
      timelyQualifiedIncoming: timelyQualifiedIncoming,
      timelyApprovedCommittedSupply: timelyApprovedCommittedSupply
    });

    // 6. One fresh, isolated, traceable line result. The full B4-R6 trace (candidateResults / gateResults / reasons /
    // externalResults) is returned unchanged for downstream visibility; the breakdown/summary are fresh projections.
    return {
      runtimeType: 'SUPPLY_PLANNING_LINE',
      lineScope: { company: scCompany, sku: scSku, destinationWarehouseId: scDest, country: scCountry, marketplace: scMarketplace },
      requiredByDate: qualifiedIncomingResult.requiredByDate,
      demand: demand,
      destinationCurrentStock: destinationCurrentStock,
      timelyApprovedCommittedSupply: timelyApprovedCommittedSupply,
      timelyQualifiedIncoming: timelyQualifiedIncoming,
      calculatedGap: calculatedGap,
      qualifiedIncomingResult: qualifiedIncomingResult, // full fresh B4-R6 trace (not mutated, not reclassified)
      incomingBreakdown: {
        timelyQualifiedIncoming: timelyQualifiedIncoming,
        lateRiskQuantity: qualifiedIncomingResult.lateRiskQuantity,
        excludedIncomingQuantity: qualifiedIncomingResult.excludedIncomingQuantity,
        reviewIncomingQuantity: qualifiedIncomingResult.reviewIncomingQuantity,
        externalObservedQuantity: qualifiedIncomingResult.externalObservedQuantity
      },
      sourceSummary: {
        kmCandidateCount: qualifiedIncomingResult.kmCandidateCount,
        deduplicatedKmCandidateCount: qualifiedIncomingResult.deduplicatedKmCandidateCount,
        externalObservationCount: qualifiedIncomingResult.externalObservationCount,
        linkedExternalEvidenceCount: qualifiedIncomingResult.linkedExternalEvidenceCount,
        quarantinedExternalCount: qualifiedIncomingResult.quarantinedExternalCount,
        adoptedExternalCount: qualifiedIncomingResult.adoptedExternalCount,
        adoptionPendingCount: qualifiedIncomingResult.adoptionPendingCount
      }
    };
  }

  return { runSupplyPlanningLine: runSupplyPlanningLine };
});
