// Kitchen Mama Operation System — Factory Surplus Reallocation Orchestrator (F1-7N-FA-3A / FA-3B1).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC §41 Factory Surplus Reallocation. Two public entry points share ONE §41 core:
//   • projectSurplusReallocation(input)            — STANDALONE model: runs its own §35/§40 initial allocation
//                                                    (KMALLOC.allocateFactoryDeterministic) then §41.
//   • reallocatePreallocatedFactorySupply(input)   — ARCHITECTURE-A adapter (FA-3B1): accepts factory coverage
//                                                    ALREADY allocated upstream (KMMSA/KMAR) via
//                                                    `initialAllocationBySource`, and runs §41 ONLY — it NEVER
//                                                    calls allocateFactoryDeterministic (no second §40 allocation).
// Both terminate in the SAME frozen §41 logic (_runReallocation) — no formula duplication, no forked math.
//
// Assembles the canonical owners:
//   • KMALLOC.allocateFactoryDeterministic  (§35/§40 — STANDALONE path only; the adapter path never touches it)
//   • KMCALC.classifyRequiredByWindow        (§27A — the only T1–T4 tier classifier)
//   • KMCALC.evaluateReallocationEligibility (§32A — donorRank ≤ receiverRank tier/timing gate, T1–T3 only)
//   • KMCALC.feasibleReallocationQty / applyFeasibleReallocation (§12/§32)
//   • KMCALC.sumRemainingShortages           (§12 — pure primitive; NOT the LIVE monthly Net Order Need owner,
//                                             which is KMTPP.projectTimePhasedSupply, §44)
//
// SCOPE (§41/§44): CURRENT FACTORY STOCK, ANALYSIS-ONLY / PLANNING-ONLY. No DB/API/clock/random/persistence/
// reservation/physical mutation/ownership transfer. Same input ⇒ identical output; input never mutated.
// Timely-transfer authority = §41.5A (tier gate; timelyTransferableQty = donor remaining releasable surplus).
// Integer safety = §43 (no ratio→unit conversion; whole-unit transfers). Actionable tiers = T1/T2/T3 only.

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
  function requireIntQty(v, name) {
    requireQty(v, name);
    if (Math.floor(v) !== v) throw new RangeError('KMFSR: ' + name + ' must be a whole number (got ' + v + ')');
    return v;
  }
  function tierRank(tier) { return tier === 'T1' ? 1 : (tier === 'T2' ? 2 : (tier === 'T3' ? 3 : 0)); }

  // ---- shared receiver normalization (identical for both entry points) ------
  // Validates the FA-3A-common fields + classifies the tier via the frozen §27A classifier (which also
  // strict-validates calculationDate + requiredByDate). Carries the raw receiver for mode-specific reads.
  function normalizeReceivers(receiversIn, calculationDate) {
    var recSeen = {};
    return requireArray(receiversIn, 'input.receivers').map(function (r, i) {
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
        demandKey: demandKey, receiverKey: receiverKey, ctx: ctx, raw: r,
        requiredByDate: r.requiredByDate, allocationPriority: r.allocationPriority,
        projectedRequirementQty: projectedRequirementQty,
        eligibleFactoryWarehouseIds: eligibleWh,
        tier: tier, actionable: tierRank(tier) > 0
      };
    });
  }

  // ===========================================================================
  // SHARED §41 CORE — Phases 4–10. Given normalized receivers + the ALREADY-ATTRIBUTED per-receiver factory
  // coverage (bySource + initialQtyBy) + physical-pool totals, runs protect → releasable-surplus → legal
  // source-aware reallocation → output. This is the SINGLE §41 implementation both entry points use — the only
  // thing that differs upstream is HOW bySource/initialQtyBy/totals were produced (§40 allocation vs preallocated).
  // ===========================================================================
  function runReallocation(masterSku, calculationDate, receivers, actionable, bySource, initialQtyBy, totalsIn) {
    // §41.9(1): Σ initial factory allocation ≤ physical factory supply.
    if (totalsIn.totalInitialAllocatedQty > totalsIn.totalFactorySupplyQty) {
      throw new RangeError('KMFSR: initial allocation exceeded physical supply (' + totalsIn.totalInitialAllocatedQty + ' > ' + totalsIn.totalFactorySupplyQty + ')');
    }

    // ---- PHASE 4 + 5 — protected / releasable-surplus (source-aware, integer, no ratio §43.8) ----
    var facts = {};
    var sourceSurplusRemaining = {};
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
          releasableSurplusQty: f.releasableSurplusQty,
          reallocatedInQty: f.reallocatedInQty,
          reallocatedOutQty: f.reallocatedOutQty,
          remainingShortageQty: f.remainingShortageQty,
          netOrderNeed: f.actionable ? f.remainingShortageQty : 0,
          coverageReason: coverageReason,
          sourceBreakdown: sourceBreakdown
        };
      });

    // §12 pure primitive over actionable shortages (NOT the live monthly Net Order Need owner — that is KMTPP, §44).
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
        totalFactorySupplyQty: totalsIn.totalFactorySupplyQty,
        totalInitialAllocatedQty: totalsIn.totalInitialAllocatedQty,
        totalReleasableSurplusQty: totalReleasableSurplusQty,
        totalReallocatedQty: totalReallocatedQty,
        totalUnusedFactorySupplyQty: totalsIn.totalUnusedFactorySupplyQty
      }
    };
  }

  // ---- public: projectSurplusReallocation (STANDALONE — runs its own §40 initial allocation) ----------------
  // input = { masterSku, calculationDate, factoryPools:[§40 pool DTO], receivers:[{ demandKey, receiverKey?,
  //   company, marketplace, destinationWarehouseId, requiredByDate, allocationPriority, demandQty,
  //   projectedRequirementQty, eligibleFactoryWarehouseIds, state? }] }
  function projectSurplusReallocation(input) {
    var root = requireObject(input, 'input');
    var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
    var calculationDate = requireNonEmptyString(root.calculationDate, 'input.calculationDate');
    var factoryPools = requireArray(root.factoryPools, 'input.factoryPools');
    var receivers = normalizeReceivers(root.receivers, calculationDate);
    var actionable = receivers.filter(function (r) { return r.actionable; });

    // PHASE 3 — canonical initial allocation (§35/§40; pool conserved; ACTIONABLE demands only).
    var poolsForAlloc = factoryPools.map(function (p) {
      if (!isObject(p)) return p; // let the allocator raise the precise TypeError
      var o = {}; for (var k in p) { if (Object.prototype.hasOwnProperty.call(p, k)) o[k] = p[k]; } return o;
    });
    var initial = KMALLOC.allocateFactoryDeterministic({
      masterSku: masterSku, factoryPools: poolsForAlloc,
      demands: actionable.map(function (r) {
        var d = r.raw;
        return {
          demandKey: r.demandKey, company: d.company, marketplace: d.marketplace,
          destinationWarehouseId: d.destinationWarehouseId, requiredByDate: r.requiredByDate,
          allocationPriority: r.allocationPriority, demandQty: d.demandQty,
          eligibleFactoryWarehouseIds: r.eligibleFactoryWarehouseIds.slice(), state: d.state
        };
      })
    });

    var bySource = {}, initialQtyBy = {};
    actionable.forEach(function (r) { bySource[r.demandKey] = {}; initialQtyBy[r.demandKey] = 0; });
    initial.allocations.forEach(function (a) {
      if (!Object.prototype.hasOwnProperty.call(bySource, a.demandKey)) return;
      bySource[a.demandKey][a.sourceWarehouseId] = (bySource[a.demandKey][a.sourceWarehouseId] || 0) + a.allocatedQty;
      initialQtyBy[a.demandKey] += a.allocatedQty;
    });

    return runReallocation(masterSku, calculationDate, receivers, actionable, bySource, initialQtyBy, {
      totalFactorySupplyQty: initial.totalSupplyQty,
      totalInitialAllocatedQty: initial.totalAllocatedQty,
      totalUnusedFactorySupplyQty: initial.totalUnusedSupplyQty
    });
  }

  // ---- public: reallocatePreallocatedFactorySupply (ARCHITECTURE-A adapter — FA-3B1; NO §40 allocation) -----
  // The initial monthly factory allocation is ALREADY performed upstream by the canonical owners (KMMSA/KMAR).
  // This entry point runs ONLY §41 surplus reallocation over that preallocated, source-attributed coverage —
  // it NEVER calls allocateFactoryDeterministic.
  // input = { masterSku, calculationDate, unusedFactorySupplyQty?, receivers:[{ demandKey, receiverKey?,
  //   requiredByDate, allocationPriority, projectedRequirementQty, eligibleFactoryWarehouseIds,
  //   initialAllocationBySource: { <warehouseId>: <non-negative integer qty> } }] }
  //   initialAllocationBySource = the per-receiver factory coverage attributed by the upstream Architecture-A
  //   allocation, at source-warehouse grain. Empty/absent for a receiver that received no factory coverage.
  function reallocatePreallocatedFactorySupply(input) {
    var root = requireObject(input, 'input');
    var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
    var calculationDate = requireNonEmptyString(root.calculationDate, 'input.calculationDate');
    var unusedFactorySupplyQty = (root.unusedFactorySupplyQty === undefined || root.unusedFactorySupplyQty === null)
      ? 0 : requireIntQty(root.unusedFactorySupplyQty, 'input.unusedFactorySupplyQty');
    var receivers = normalizeReceivers(root.receivers, calculationDate);
    var actionable = receivers.filter(function (r) { return r.actionable; });

    // Build the per-receiver source-attributed factory coverage DIRECTLY from the preallocated input.
    // NO allocateFactoryDeterministic call on this path (§44.2 — no second §40 allocation).
    var bySource = {}, initialQtyBy = {}, totalInitialAllocatedQty = 0;
    receivers.forEach(function (r) {
      var raw = r.raw;
      var srcRaw = raw.initialAllocationBySource;
      var normalized = {}, sum = 0;
      if (srcRaw !== undefined && srcRaw !== null) {
        requireObject(srcRaw, r.ctx + '.initialAllocationBySource');
        Object.keys(srcRaw).forEach(function (wh) {
          requireNonEmptyString(wh, r.ctx + '.initialAllocationBySource key');
          var q = requireIntQty(srcRaw[wh], r.ctx + '.initialAllocationBySource["' + wh + '"]');
          if (q > 0) { normalized[wh] = q; sum += q; }
        });
      }
      if (!r.actionable) {
        // T4 / out-of-range: excluded from §41 (visibility-only). Preallocated factory coverage here signals an
        // upstream inconsistency (Architecture A should not allocate factory to a non-actionable tier) → fail closed.
        if (sum > 0) throw new RangeError('KMFSR: initialAllocationBySource present for non-actionable receiver "' + r.demandKey + '" (tier ' + r.tier + ')');
        return;
      }
      bySource[r.demandKey] = normalized;
      initialQtyBy[r.demandKey] = sum;
      totalInitialAllocatedQty += sum;
    });

    return runReallocation(masterSku, calculationDate, receivers, actionable, bySource, initialQtyBy, {
      totalFactorySupplyQty: totalInitialAllocatedQty + unusedFactorySupplyQty,
      totalInitialAllocatedQty: totalInitialAllocatedQty,
      totalUnusedFactorySupplyQty: unusedFactorySupplyQty   // caller-declared physical residual (§43.6) — never donor surplus
    });
  }

  return {
    projectSurplusReallocation: projectSurplusReallocation,
    reallocatePreallocatedFactorySupply: reallocatePreallocatedFactorySupply
  };
});
