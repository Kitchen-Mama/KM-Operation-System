// Kitchen Mama Operation System — Factory Surplus Reallocation Orchestrator (F1-7N-FA-3A).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC orchestration of the ALREADY-FROZEN §41 Factory Surplus Reallocation contract
// (docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md §41 + §41.5A + §43). This module is NOT a second
// allocator and NOT a second Net-Order-Need formula — it ASSEMBLES the canonical owners:
//   • KMALLOC.allocateFactoryDeterministic   (§35/§40 — the only factory allocator; integer FIFO, pool conserved)
//   • KMCALC.classifyRequiredByWindow         (§27A — the only T1–T4 tier classifier; no second classifier here)
//   • KMCALC.evaluateReallocationEligibility  (§32A — donorRank ≤ receiverRank tier/timing gate, T1–T3 only)
//   • KMCALC.feasibleReallocationQty / applyFeasibleReallocation (§12/§32 — feasible qty + single-consume apply)
//   • KMCALC.sumRemainingShortages            (§12/§14 — the SOLE post-reallocation Net Order Need owner)
//
// SCOPE (frozen): CURRENT FACTORY STOCK only, Phase-1 ANALYSIS-ONLY / PLANNING-ONLY netting (§41.1). It does
// NOT read a DB/API/clock/locale/random, NOT persist, NOT reserve, NOT deduct, NOT move/borrow physical stock,
// NOT transfer ownership, NOT bind a PO/Shipment, and NOT consume Ongoing-PO / COMMITTED_PRODUCTION / In-Transit
// / Overseas facts (those retain their own lifecycle owners — §42 / REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC §3.5).
//
// Actionable tiers = T1/T2/T3 only (§41.5). T4 / out-of-range receivers are VISIBILITY-ONLY: excluded from both
// the initial allocation and reallocation, and excluded from Net Order Need (T4 is never in the Request/PO payload).
//
// Timely-transfer authority (§41.5A, USER-resolved 2026-08-20 Resolution A): for CURRENT FACTORY STOCK the
// §32A tier gate IS the complete timing feasibility; ONLY AFTER evaluateReallocationEligibility → eligible=true,
// timelyTransferableQty = donor remaining releasable surplus AT THE ELIGIBLE SOURCE (explicit pass-through — NOT
// Infinity, NOT lead-time, NOT shipment/carrier/reservation). No route/carrier/lead-time math here.
//
// Integer safety (§43): the initial allocation is §40 integer FIFO and reallocation transfers whole units bounded
// by feasibleReallocationQty — FA-3A introduces NO ratio→unit conversion and never over-allocates a physical pool.
// Same input ⇒ identical output; a fresh result object every call; inputs are never mutated.

(function (root, factory) {
  'use strict';
  var api = factory(
    (typeof require !== 'undefined') ? require('./supply-planning-allocations.js') : (root.KM && root.KM.allocations),
    (typeof require !== 'undefined') ? require('./supply-planning-calculations.js') : (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations)
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.core = window.KM.core || {};
    window.KM.core.supplyPlanningSurplusReallocation = api;
    window.KMFSR = api; // reserved namespace of record (§41.2)
  }
})(this, function (KMALLOC, KMCALC) {
  'use strict';

  if (!KMALLOC || typeof KMALLOC.allocateFactoryDeterministic !== 'function') {
    throw new Error('KMFSR: KMALLOC.allocateFactoryDeterministic dependency is missing');
  }
  if (!KMCALC || typeof KMCALC.classifyRequiredByWindow !== 'function' ||
      typeof KMCALC.evaluateReallocationEligibility !== 'function' ||
      typeof KMCALC.feasibleReallocationQty !== 'function' ||
      typeof KMCALC.applyFeasibleReallocation !== 'function' ||
      typeof KMCALC.sumRemainingShortages !== 'function') {
    throw new Error('KMFSR: KMCALC reallocation/net-order-need dependencies are missing');
  }

  // ---- helpers --------------------------------------------------------------
  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('KMFSR: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('KMFSR: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonEmptyString(v, name) {
    if (typeof v !== 'string' || v.trim() === '') throw new TypeError('KMFSR: ' + name + ' must be a non-empty string (got ' + describe(v) + ')');
    return v;
  }
  function requireQty(v, name) {
    if (typeof v !== 'number') throw new TypeError('KMFSR: ' + name + ' must be a number (got ' + describe(v) + ')');
    if (!isFinite(v)) throw new RangeError('KMFSR: ' + name + ' must be finite (got ' + v + ')');
    if (v < 0) throw new RangeError('KMFSR: ' + name + ' must be non-negative (got ' + v + ')');
    return v;
  }
  function tierRank(tier) { return tier === 'T1' ? 1 : (tier === 'T2' ? 2 : (tier === 'T3' ? 3 : 0)); }

  // ---- public: projectSurplusReallocation -----------------------------------
  // input = {
  //   masterSku: string,
  //   calculationDate: 'YYYY-MM-DD',                       // REQUIRED, explicit; §41.5A never from clock
  //   factoryPools: [ { poolKey, poolType:'FACTORY', warehouseId, effectiveSupplyQty, state? } ],  // §40 DTO
  //   receivers: [ {
  //     demandKey, receiverKey?, company, marketplace, destinationWarehouseId,
  //     requiredByDate: 'YYYY-MM-DD', allocationPriority, demandQty,           // demandQty = §40 initial claim
  //     projectedRequirementQty,                                              // actionable T1–T3 protected need
  //     eligibleFactoryWarehouseIds: [ string ], state?
  //   } ]
  // }
  function projectSurplusReallocation(input) {
    var root = requireObject(input, 'input');
    var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
    var calculationDate = requireNonEmptyString(root.calculationDate, 'input.calculationDate');
    var factoryPools = requireArray(root.factoryPools, 'input.factoryPools');
    var receiversIn = requireArray(root.receivers, 'input.receivers');

    // Validate + normalize FA-3A-specific fields; classify each receiver's tier via the EXISTING §27A classifier
    // (which also strict-validates calculationDate + requiredByDate). The §40 fields are (re)validated by the
    // frozen allocator when the actionable demand reaches it.
    var recSeen = {};
    var receivers = receiversIn.map(function (r, i) {
      var ctx = 'input.receivers[' + i + ']';
      requireObject(r, ctx);
      var demandKey = requireNonEmptyString(r.demandKey, ctx + '.demandKey');
      if (recSeen[demandKey]) throw new RangeError('KMFSR: duplicate demandKey "' + demandKey + '"');
      recSeen[demandKey] = 1;
      var receiverKey = (r.receiverKey === undefined || r.receiverKey === null) ? demandKey : requireNonEmptyString(r.receiverKey, ctx + '.receiverKey');
      var projectedRequirementQty = requireQty(r.projectedRequirementQty, ctx + '.projectedRequirementQty');
      var eligibleWh = requireArray(r.eligibleFactoryWarehouseIds, ctx + '.eligibleFactoryWarehouseIds').map(function (w, j) {
        return requireNonEmptyString(w, ctx + '.eligibleFactoryWarehouseIds[' + j + ']');
      });
      var cls = KMCALC.classifyRequiredByWindow({ calculationDate: calculationDate, requiredByDate: r.requiredByDate });
      var tier = cls.engineB.tier;
      return {
        demandKey: demandKey, receiverKey: receiverKey,
        requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
        projectedRequirementQty: projectedRequirementQty,
        eligibleFactoryWarehouseIds: eligibleWh,
        tier: tier, actionable: tierRank(tier) > 0,
        demand: {
          demandKey: demandKey, company: r.company, marketplace: r.marketplace,
          destinationWarehouseId: r.destinationWarehouseId, requiredByDate: r.requiredByDate,
          allocationPriority: r.allocationPriority, demandQty: r.demandQty,
          eligibleFactoryWarehouseIds: eligibleWh.slice(), state: r.state
        }
      };
    });

    var actionable = receivers.filter(function (r) { return r.actionable; });

    // ---- PHASE 3 — canonical initial allocation (§35/§40; pool conserved; ACTIONABLE demands only) ----
    var poolsForAlloc = factoryPools.map(function (p) {
      if (!isObject(p)) return p; // let the allocator raise the precise TypeError
      var o = {}; for (var k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k]; } return o;
    });
    var initial = KMALLOC.allocateFactoryDeterministic({
      masterSku: masterSku, factoryPools: poolsForAlloc, demands: actionable.map(function (r) { return r.demand; })
    });
    // §41.9(1): Σ initial factory allocation ≤ physical factory supply (defensive; §40 already conserves).
    if (initial.totalAllocatedQty > initial.totalSupplyQty) {
      throw new RangeError('KMFSR: initial allocation exceeded physical supply (' + initial.totalAllocatedQty + ' > ' + initial.totalSupplyQty + ')');
    }

    // Per-receiver initial attribution at source-warehouse grain (Phase 5).
    var bySource = {};      // demandKey -> { warehouseId -> qty }
    var initialQtyBy = {};  // demandKey -> total
    actionable.forEach(function (r) { bySource[r.demandKey] = {}; initialQtyBy[r.demandKey] = 0; });
    initial.allocations.forEach(function (a) {
      if (!Object.prototype.hasOwnProperty.call(bySource, a.demandKey)) return;
      bySource[a.demandKey][a.sourceWarehouseId] = (bySource[a.demandKey][a.sourceWarehouseId] || 0) + a.allocatedQty;
      initialQtyBy[a.demandKey] += a.allocatedQty;
    });

    // ---- PHASE 4 + 5 — protected / releasable-surplus (source-aware, integer, no ratio §43.8) ----
    var facts = {};
    var sourceSurplusRemaining = {}; // donorDemandKey -> { warehouseId -> releasable remaining }
    actionable.forEach(function (r) {
      var initialQty = initialQtyBy[r.demandKey];
      var projReq = r.projectedRequirementQty;
      var protectedFactoryQty = Math.min(initialQty, projReq);
      var releasableSurplusQty = Math.max(0, initialQty - protectedFactoryQty);
      var preTransferRemainingShortageQty = Math.max(0, projReq - initialQty);

      var whKeys = Object.keys(bySource[r.demandKey]).sort(cmpStr);
      var protectRemaining = protectedFactoryQty;
      var srcSurplus = {};
      whKeys.forEach(function (wh) {
        var q = bySource[r.demandKey][wh];
        var consume = Math.min(q, protectRemaining);
        protectRemaining -= consume;
        var surplusHere = q - consume;
        if (surplusHere > 0) srcSurplus[wh] = surplusHere;
      });
      sourceSurplusRemaining[r.demandKey] = srcSurplus;

      facts[r.demandKey] = {
        demandKey: r.demandKey, receiverKey: r.receiverKey, tier: r.tier, actionable: true,
        requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
        eligibleFactoryWarehouseIds: r.eligibleFactoryWarehouseIds,
        initialFactoryAllocationQty: initialQty,
        protectedFactoryQty: protectedFactoryQty,
        releasableSurplusQty: releasableSurplusQty,
        preTransferRemainingShortageQty: preTransferRemainingShortageQty,
        remainingShortageQty: preTransferRemainingShortageQty,
        reallocatedInQty: 0, reallocatedOutQty: 0,
        sourceInitial: bySource[r.demandKey]
      };
    });
    // visibility-only facts for non-actionable (T4 / out-of-range) receivers (§41.5)
    receivers.filter(function (r) { return !r.actionable; }).forEach(function (r) {
      facts[r.demandKey] = {
        demandKey: r.demandKey, receiverKey: r.receiverKey, tier: r.tier, actionable: false,
        requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
        eligibleFactoryWarehouseIds: r.eligibleFactoryWarehouseIds,
        initialFactoryAllocationQty: 0, protectedFactoryQty: 0, releasableSurplusQty: 0,
        preTransferRemainingShortageQty: 0, remainingShortageQty: 0,
        reallocatedInQty: 0, reallocatedOutQty: 0, sourceInitial: {}
      };
    });

    // ---- PHASE 6–9 — legal source-aware reallocation (§32A gate + §12 feasible qty) ----
    var receiverOrder = actionable.slice().sort(function (a, b) {
      return cmpStr(a.requiredByDate, b.requiredByDate) || (b.allocationPriority - a.allocationPriority) || cmpStr(a.demandKey, b.demandKey);
    });
    var donorOrder = actionable.slice().sort(function (a, b) {
      return cmpStr(a.requiredByDate, b.requiredByDate) || cmpStr(a.demandKey, b.demandKey);
    });
    var transferLedger = [];

    receiverOrder.forEach(function (recv) {
      var rf = facts[recv.demandKey];
      if (rf.remainingShortageQty <= 0) return;

      for (var di = 0; di < donorOrder.length && rf.remainingShortageQty > 0; di++) {
        var donor = donorOrder[di];
        if (donor.demandKey === recv.demandKey) continue;   // no self-donation
        var df = facts[donor.demandKey];
        if (df.releasableSurplusQty <= 0) continue;

        // §32A tier/timing gate — SOLE timing authority for CURRENT FACTORY STOCK (§41.5A).
        var elig = KMCALC.evaluateReallocationEligibility({
          calculationDate: calculationDate,
          donor: { masterSku: masterSku, requiredByDate: donor.requiredByDate },
          receiver: { masterSku: masterSku, requiredByDate: recv.requiredByDate }
        });
        if (!elig.eligible) continue;   // T2→T1, T3→T1, T4, out-of-range → 0 transfer

        var srcSurplus = sourceSurplusRemaining[donor.demandKey];
        var whKeys = Object.keys(srcSurplus).sort(cmpStr);
        for (var wi = 0; wi < whKeys.length && rf.remainingShortageQty > 0; wi++) {
          var wh = whKeys[wi];
          var avail = srcSurplus[wh];
          if (avail <= 0) continue;
          if (recv.eligibleFactoryWarehouseIds.indexOf(wh) === -1) continue; // source/destination eligibility

          // §41.5A: timelyTransferableQty = donor remaining releasable surplus at this eligible source.
          var applied = KMCALC.applyFeasibleReallocation({
            receiverRemainingShortage: rf.remainingShortageQty,
            donorRemainingSurplus: avail,
            timelyTransferableQty: avail
          });
          var qty = applied.reallocatedQty;
          if (qty <= 0) continue;

          rf.remainingShortageQty = applied.receiverRemainingShortage;
          srcSurplus[wh] = applied.donorRemainingSurplus;
          df.releasableSurplusQty -= qty;
          df.reallocatedOutQty += qty;
          rf.reallocatedInQty += qty;

          transferLedger.push({
            sourceWarehouseId: wh,
            donorDemandKey: donor.demandKey,
            receiverDemandKey: recv.demandKey,
            qty: qty,
            donorTier: elig.donor.tier,
            receiverTier: elig.receiver.tier,
            reason: 'FACTORY_SURPLUS_REALLOCATION'
          });
        }
      }
    });

    // ---- PHASE 10 — output (§41 frozen receiver facts + ledger + Net Order Need) ----
    transferLedger.sort(function (a, b) {
      return cmpStr(a.receiverDemandKey, b.receiverDemandKey) || cmpStr(a.donorDemandKey, b.donorDemandKey) || cmpStr(a.sourceWarehouseId, b.sourceWarehouseId);
    });

    var outReceivers = receivers.map(function (r) { return facts[r.demandKey]; })
      .sort(function (a, b) { return cmpStr(a.demandKey, b.demandKey); })
      .map(function (f) {
        var sourceBreakdown = Object.keys(f.sourceInitial).sort(cmpStr).map(function (wh) {
          return { warehouseId: wh, initialAllocatedQty: f.sourceInitial[wh] };
        });
        var coverageReason;
        if (!f.actionable) {
          coverageReason = 'NON_ACTIONABLE_VISIBILITY_ONLY';
        } else if (f.initialFactoryAllocationQty === 0 && f.preTransferRemainingShortageQty === 0) {
          coverageReason = 'NO_REQUIREMENT';
        } else if (f.reallocatedOutQty > 0) {
          coverageReason = 'DONOR_SURPLUS_RELEASED';
        } else if (f.preTransferRemainingShortageQty === 0) {
          coverageReason = 'FACTORY_INITIAL_COVERED';
        } else if (f.reallocatedInQty > 0 && f.remainingShortageQty === 0) {
          coverageReason = 'SURPLUS_REALLOCATION_COVERED';
        } else if (f.reallocatedInQty > 0 && f.remainingShortageQty > 0) {
          coverageReason = 'SURPLUS_REALLOCATION_PARTIAL';
        } else {
          coverageReason = 'SHORTAGE_REMAINS';
        }
        return {
          demandKey: f.demandKey,
          receiverKey: f.receiverKey,
          tier: f.tier,
          actionable: f.actionable,
          initialFactoryAllocationQty: f.initialFactoryAllocationQty,
          protectedFactoryQty: f.protectedFactoryQty,
          releasableSurplusQty: f.releasableSurplusQty, // remaining releasable AFTER outbound transfers
          reallocatedInQty: f.reallocatedInQty,
          reallocatedOutQty: f.reallocatedOutQty,
          remainingShortageQty: f.remainingShortageQty,
          netOrderNeed: f.actionable ? f.remainingShortageQty : 0, // T4/out-of-range never in Request/PO payload
          coverageReason: coverageReason,
          sourceBreakdown: sourceBreakdown
        };
      });

    // §41.7 — the SOLE Net Order Need owner; actionable T1–T3 shortages only.
    var totalNetOrderNeed = KMCALC.sumRemainingShortages(
      outReceivers.filter(function (f) { return f.actionable; }).map(function (f) { return f.remainingShortageQty; })
    );

    var totalReallocatedQty = 0; transferLedger.forEach(function (t) { totalReallocatedQty += t.qty; });
    var totalReleasableSurplusQty = 0; outReceivers.forEach(function (f) { totalReleasableSurplusQty += (f.releasableSurplusQty + f.reallocatedOutQty); });

    return {
      masterSku: masterSku,
      calculationDate: calculationDate,
      receivers: outReceivers,
      transferLedger: transferLedger,
      totalNetOrderNeed: totalNetOrderNeed,
      totals: {
        totalFactorySupplyQty: initial.totalSupplyQty,
        totalInitialAllocatedQty: initial.totalAllocatedQty,
        totalReleasableSurplusQty: totalReleasableSurplusQty,       // pre-transfer releasable surplus (analysis)
        totalReallocatedQty: totalReallocatedQty,
        totalUnusedFactorySupplyQty: initial.totalUnusedSupplyQty   // UNALLOCATED PHYSICAL RESIDUAL (§43.6) — never donor surplus
      }
    };
  }

  return { projectSurplusReallocation: projectSurplusReallocation };
});
