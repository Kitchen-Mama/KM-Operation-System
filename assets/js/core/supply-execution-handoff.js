// Kitchen Mama Operation System — Canonical Recommendation → Execution handoff owner (KMREX) — F1-4B-FM6-R2.
// =============================================================================================================
// ONE pure, deterministic Phase-1 execution-DRAFT owner. It RECEIVES a KMREC recommendation DTO (the single
// recommendation authority) plus ALREADY-RESOLVED eligible source availabilities, and produces an EXECUTION DRAFT
// DTO (source→destination allocation lines + covered/uncovered). It owns NO gap formula, invokes NO KMHP/KMTPP/
// KMCALC/KMALLOC/KMMSA, reads NO sheet, and PERSISTS NOTHING. It only ALLOCATES the recommended quantity across the
// caller-supplied eligible sources using the FROZEN Phase-1 fill order, and FORMATS the result. No Date.now / no RNG.
//
// FROZEN Phase-1 execution authority (F1-4B-FM6-R2 §1) — INVENTORY REPLENISHMENT:
//   The Inventory gap (D18/D30/D45/D90) is unchanged and is computed from Site Stock + qualified incoming ONLY —
//   Factory / Overseas NEVER reduce the gap. They participate ONLY here, AFTER KMREC produces recommendedQty R:
//     overseasAllocated      = min(R, eligibleOverseasAvailable)
//     remainingAfterOverseas = max(0, R - overseasAllocated)
//     factoryAllocated       = min(remainingAfterOverseas, eligibleFactoryAvailable)
//     uncoveredQty           = max(0, R - overseasAllocated - factoryAllocated)
//   Invariant: overseasAllocated + factoryAllocated + uncoveredQty = R; Σ(lines) = allocatedQty; each line ≤ its
//   eligible availability. A stored 0 available is a real 0 (no line); a MISSING (null) availability is NOT 0 — it
//   is surfaced in unresolvedSources and never fabricated into a "0 available" line.
//
// ORDER PLANNING (§2): NO second allocator. The shared-pool / company-isolated / KMMSA-KMALLOC allocation already
// ran inside gap materialization (tN_suggested), so KMREX PASSES THROUGH the KMREC per-tier T1–T4 verbatim and the
// FROZEN actionable total (SUM_T1_T3_RAW_GAP_CARTONIZE_ONCE); T4 stays forward-visibility only. Manual Order Qty is
// never touched (KMREX is pure and returns draft values only).
//
// HARD BOUNDARY (§12): DRAFT generation ONLY — never a PO / shipment / stock deduction / forecast / gap / final write.
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.core = window.KM.core || {}; window.KM.core.executionHandoff = api; window.KMREX = api; }
  return api;
})(this, function () {
  'use strict';

  var SOURCE_TYPE = { OVERSEAS: 'OVERSEAS_THREE_PL', FACTORY: 'FACTORY', ORDER_TIER: 'ORDER_TIER' };
  var STATUS = { ACTION: 'ACTION', PARTIAL: 'PARTIAL', NO_ACTION: 'NO_ACTION', BLOCKED: 'BLOCKED' };
  var OP_ACTIONABLE_TIERS = ['T1', 'T2', 'T3'];   // T4 = forward visibility only (never an execution line)

  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  // MISSING vs ZERO: '' / null / undefined → null (never coerced to 0); a finite value (incl. 0) → that value.
  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function businessKey(rec) { return [str(rec.company), str(rec.country), str(rec.marketplace), str(rec.sku)].join('||'); }
  function lineage(rec) {
    return {
      recommendationId: str(rec.recommendationId) || (str(rec.product) + ':' + businessKey(rec)),
      product: str(rec.product) || null, businessKey: businessKey(rec), sku: str(rec.sku) || null,
      sourceFingerprint: (rec.sourceFingerprint != null ? String(rec.sourceFingerprint) : null),
      sourceCalculatedAt: (rec.sourceCalculatedAt != null ? String(rec.sourceCalculatedAt) : null)
    };
  }

  // INVENTORY (§1) — fill recommendedQty from eligible Overseas → Factory → uncovered. `availability` is the
  // ALREADY-RESOLVED per-scope eligible supply for THIS recommendation (the multi-receiver shared-pool COMPETITION
  // that decides how much of a physical pool this scope may see is the caller's frozen authority — NOT done here).
  //   availability: { overseasAvailable, factoryAvailable, overseasSourceId?, factorySourceId?,
  //                   overseasWarehouseId?, factoryWarehouseId?, destinationType?, destinationId? }
  function allocateInventoryExecution(rec, availability, opts) {
    if (!rec) return null;
    opts = opts || {}; availability = availability || {};
    var base = lineage(rec);
    var now = (opts.now != null ? String(opts.now) : null);
    function shell(status, R, allocated, uncovered, lines, unresolved) {
      return {
        recommendationId: base.recommendationId, product: base.product, businessKey: base.businessKey, sku: base.sku,
        recommendedQty: R, executionLines: lines || [], allocatedQty: allocated, uncoveredQty: uncovered,
        unresolvedSources: unresolved || [], primaryWindow: (rec.primaryWindow != null ? String(rec.primaryWindow) : null),
        sourceFingerprint: base.sourceFingerprint, sourceCalculatedAt: base.sourceCalculatedAt, status: status, generatedAt: now
      };
    }
    if (str(rec.status) === 'BLOCKED') return shell(STATUS.BLOCKED, null, null, null, [], []);   // §10 no fabricated allocation
    var R = num(rec.suggestedQty);
    if (str(rec.status) !== 'READY' || R == null || R <= 0) return shell(STATUS.NO_ACTION, R, 0, 0, [], []);   // §10 no positive lines
    // resolved availabilities: null = UNRESOLVED (surfaced, never treated as a real 0); finite (incl. 0) = known.
    var ovAvail = num(availability.overseasAvailable), facAvail = num(availability.factoryAvailable);
    var ov = (ovAvail != null && ovAvail > 0) ? ovAvail : 0;
    var fac = (facAvail != null && facAvail > 0) ? facAvail : 0;
    var overseasAllocated = Math.min(R, ov);
    var factoryAllocated = Math.min(Math.max(0, R - overseasAllocated), fac);
    var uncoveredQty = Math.max(0, R - overseasAllocated - factoryAllocated);
    var lines = [];
    if (overseasAllocated > 0) lines.push({ sourceType: SOURCE_TYPE.OVERSEAS, sourceId: (availability.overseasSourceId != null ? availability.overseasSourceId : null), sourceWarehouseId: (availability.overseasWarehouseId != null ? availability.overseasWarehouseId : null), destinationType: str(availability.destinationType) || 'MARKETPLACE', destinationId: (availability.destinationId != null ? availability.destinationId : null), allocatedQty: overseasAllocated, eligibilityReason: 'OVERSEAS_ELIGIBLE_AVAILABLE', sourceAvailableQty: ovAvail });
    if (factoryAllocated > 0) lines.push({ sourceType: SOURCE_TYPE.FACTORY, sourceId: (availability.factorySourceId != null ? availability.factorySourceId : null), sourceWarehouseId: (availability.factoryWarehouseId != null ? availability.factoryWarehouseId : null), destinationType: str(availability.destinationType) || 'MARKETPLACE', destinationId: (availability.destinationId != null ? availability.destinationId : null), allocatedQty: factoryAllocated, eligibilityReason: 'FACTORY_ELIGIBLE_AVAILABLE', sourceAvailableQty: facAvail });
    var unresolved = [];
    if (ovAvail == null) unresolved.push('OVERSEAS');   // §4 missing availability != zero
    if (facAvail == null) unresolved.push('FACTORY');
    var allocatedQty = overseasAllocated + factoryAllocated;
    return shell(uncoveredQty === 0 ? STATUS.ACTION : STATUS.PARTIAL, R, allocatedQty, uncoveredQty, lines, unresolved);
  }

  // ORDER PLANNING (§2) — passthrough of the KMREC per-tier T1–T4 + frozen actionable total. NO re-allocation.
  function buildOrderPlanningExecution(rec, opts) {
    if (!rec) return null;
    opts = opts || {};
    var base = lineage(rec);
    var now = (opts.now != null ? String(opts.now) : null);
    var tiers = (rec.tiers || []).map(function (t) { return { tier: str(t.tier), month: (t.month != null ? String(t.month) : null), gapQty: num(t.gapQty), suggestedQty: num(t.suggestedQty) }; });
    var dto = {
      recommendationId: base.recommendationId, product: base.product, businessKey: base.businessKey, sku: base.sku,
      tiers: tiers,
      actionableTierCount: (rec.actionableTierCount != null ? rec.actionableTierCount : OP_ACTIONABLE_TIERS.length),
      actionableGapQty: num(rec.actionableGapQty),
      totalRecommendedQty: num(rec.totalRecommendedQty),
      totalAuthority: (rec.totalAuthority != null ? String(rec.totalAuthority) : null),
      forwardVisibility: rec.forwardVisibility || null,
      executionLines: [], allocatedQty: null,
      sourceFingerprint: base.sourceFingerprint, sourceCalculatedAt: base.sourceCalculatedAt,
      status: STATUS.BLOCKED, generatedAt: now
    };
    if (str(rec.status) === 'BLOCKED') { dto.status = STATUS.BLOCKED; return dto; }
    if (str(rec.status) !== 'READY') { dto.status = STATUS.NO_ACTION; return dto; }
    // actionable draft lines = T1–T3 stored suggested (verbatim; the frozen shared-pool allocation already produced
    // these during gap materialization). T4 is forward visibility only — NEVER an execution line.
    var lines = [], allocated = 0;
    tiers.forEach(function (t) {
      if (OP_ACTIONABLE_TIERS.indexOf(t.tier) !== -1 && typeof t.suggestedQty === 'number' && t.suggestedQty > 0) {
        lines.push({ sourceType: SOURCE_TYPE.ORDER_TIER, tier: t.tier, month: t.month, destinationType: 'ORDER_PLAN', allocatedQty: t.suggestedQty, eligibilityReason: 'ORDER_TIER_ACTIONABLE', sourceAvailableQty: null });
        allocated += t.suggestedQty;
      }
    });
    dto.executionLines = lines; dto.allocatedQty = allocated;
    dto.status = (lines.length > 0 || (typeof dto.totalRecommendedQty === 'number' && dto.totalRecommendedQty > 0)) ? STATUS.ACTION : STATUS.NO_ACTION;
    return dto;
  }

  return {
    SOURCE_TYPE: SOURCE_TYPE, STATUS: STATUS, OP_ACTIONABLE_TIERS: OP_ACTIONABLE_TIERS.slice(),
    businessKey: businessKey,
    allocateInventoryExecution: allocateInventoryExecution,
    buildOrderPlanningExecution: buildOrderPlanningExecution,
    VERSION: 'kmrex-fm6r2-1'
  };
});
