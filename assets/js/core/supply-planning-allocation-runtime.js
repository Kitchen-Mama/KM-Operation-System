// Kitchen Mama Operation System — Canonical Allocation RUNTIME (Phase-1, F1-4B-FM7-R2B).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC orchestration of the ALREADY-FROZEN allocation authorities. This module is NOT a second
// allocation engine and NOT a second FC-share/demand formula — it composes the canonical owners:
//   • KMALLOC.allocateFactoryDeterministic / allocateOverseasSharedPool  (the only allocators; §40)
//   • KMAF demandWeight / FC share (upstream; consumed verbatim as the receiver's demandWeight)
//   • KMCALC survival authority (survivalNeedQty = ceil(18 × canonical daily demand); computed upstream)
// It adds exactly the three authorities frozen in FM7-R1 / FM7-R2A that had no runtime owner yet:
//   1. ELIGIBLE-RECEIVER filter (FM7-R2A §9 gap) — exclude inactive marketplaces / marketplace_skus / invalid identity.
//   2. CROSS-COMPANY FACTORY conservation (FM7-R2A USER decision = CROSS_COMPANY_BATCH) — the physical Factory pool
//      identity is warehouse_id + sku (NOT company-scoped); ALL eligible receivers across ALL companies compete for
//      ONE physical pool, allocated ONCE by a single KMALLOC pass, so Σ(factory allocated across companies) ≤ physical
//      available. No reservation ledger, no stock write — conservation comes from ONE deduped pool + ONE competing set
//      + ONE canonical KMALLOC pass.
//   3. POST-ALLOCATION HEALTH projection (NORMAL / RISK / CRITICAL / COMPETITION) derived ONLY from frozen facts
//      (allocatedQty, survivalNeedQty, demandQty, poolSupply, ΣsurvivalNeed) — NO new scoring formula, NO stockout date.
// Overseas remains a company-owned shared pool (KMALLOC.allocateOverseasSharedPool, NORMAL/SHORTAGE as frozen).
// No DB/API/clock/locale/random; same input ⇒ identical output; cartonization stays at the R3D execution boundary
// downstream (this module never rounds cartons).

(function (root, factory) {
  'use strict';
  var api = factory(
    (typeof require !== 'undefined') ? require('./supply-planning-allocations.js') : (root.KM && root.KM.allocations)
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.allocationRuntime = api; }
})(this, function (ALLOC) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  // Reuse the existing master-data "plannable status" vocabulary (mirrors the Add-SKU active filter): a blank status
  // is treated as active (legacy rows); these tokens are inactive/non-plannable and exclude the receiver.
  var INACTIVE_STATUS = { inactive: 1, cancelled: 1, canceled: 1, archived: 1, closed: 1, draft: 1, disabled: 1, paused: 1 };
  function isPlannableStatus(s) { var t = str(s).trim().toLowerCase(); return t === '' || INACTIVE_STATUS[t] !== 1; }

  // ---- 1. ELIGIBLE RECEIVER FILTER (FM7-R2A §9) --------------------------------
  // Exactly ONE caller-side eligibility gate before allocation. Returns eligible receivers + excluded {receiver, reason}
  // diagnostics. NEVER silently assigns demandWeight to an invalid receiver. Reuses master-data status fields only.
  function receiverExclusionReason(r) {
    if (!isObj(r)) return 'INVALID_RECEIVER';
    if (!isPlannableStatus(r.marketplaceStatus)) return 'MARKETPLACE_INACTIVE';
    if (!isPlannableStatus(r.marketplaceSkuStatus)) return 'MARKETPLACE_SKU_INACTIVE';
    if (!str(r.company) || !str(r.marketplace) || !(str(r.sku) || str(r.masterSku))) return 'INVALID_PLANNING_IDENTITY';
    if (num(r.demandQty) === null) return 'DEMAND_AUTHORITY_UNRESOLVED';   // no canonical demand → not a competitor
    if (r.fulfillmentIncompatible === true) return 'FULFILLMENT_INCOMPATIBLE';
    return null;
  }
  function filterEligibleReceivers(receivers) {
    var eligible = [], excluded = [];
    (Array.isArray(receivers) ? receivers : []).forEach(function (r) {
      var reason = receiverExclusionReason(r);
      if (reason) excluded.push({ receiver: r, reason: reason }); else eligible.push(r);
    });
    // deterministic order (no insertion / RNG dependence)
    excluded.sort(function (a, b) { return cmpStr(str(a.receiver && a.receiver.receiverKey), str(b.receiver && b.receiver.receiverKey)) || cmpStr(a.reason, b.reason); });
    return { eligible: eligible, excluded: excluded };
  }

  // ---- 2. CROSS-COMPANY FACTORY CONSERVATION -----------------------------------
  // Collect the physical Factory pool ONCE (deduped by poolKey = warehouse_id+sku; a physical quantity is NEVER
  // counted per-company) and the union of ALL companies' factory demands, then run ONE canonical KMALLOC pass. The
  // frozen §35 allocator conserves the pool across companies (per-pool `remaining` + verifyConservation), so the same
  // physical unit is handed to at most one receiver regardless of company. Input = the per-company factory inputs
  // exactly as KMSF.projectAllocationInputs already produces them: [{ company, factoryPools:[...], demands:[...] }].
  function allocateFactoryCrossCompany(masterSku, perCompanyFactoryInputs) {
    var poolByKey = {}, pools = [], demands = [], demandSeen = {};
    (Array.isArray(perCompanyFactoryInputs) ? perCompanyFactoryInputs : []).forEach(function (inp) {
      if (!isObj(inp)) return;
      (inp.factoryPools || []).forEach(function (p) {
        var k = str(p && p.poolKey);
        if (!k) return;
        if (!poolByKey[k]) { poolByKey[k] = p; pools.push(p); }   // SAME physical pool across companies → counted once (conservation)
      });
      (inp.demands || []).forEach(function (d) {
        var dk = str(d && d.demandKey);
        if (!dk) return;
        if (demandSeen[dk]) throw new RangeError('allocateFactoryCrossCompany: duplicate demandKey across companies: ' + dk);
        demandSeen[dk] = 1; demands.push(d);
      });
    });
    // ONE competing universe, ONE physical pool, ONE KMALLOC pass → cross-company conserved.
    return ALLOC.allocateFactoryDeterministic({ masterSku: str(masterSku), factoryPools: pools, demands: demands });
  }

  // Overseas stays company-owned: run the frozen KMALLOC overseas allocator per company input (NORMAL/SHORTAGE mode
  // is selected inside KMALLOC by poolSupply vs Σsurvival — never re-decided here).
  function allocateOverseas(overseasInput) { return ALLOC.allocateOverseasSharedPool(overseasInput); }

  // ---- 3. POST-ALLOCATION HEALTH (frozen facts only; no new formula, no stockout date) -----
  // COMPETITION is a POOL condition; CRITICAL is a RECEIVER condition — never conflated.
  //   CRITICAL : allocatedQty < survivalFloor (canonical allocation cannot protect the 18-day survival requirement)
  //   RISK     : survivalFloor ≤ allocatedQty < demandQty (survival protected, but not fully supplied to demand)
  //   NORMAL   : allocatedQty ≥ demandQty (fully supplied)
  //   competition (pool flag) : poolSupply < Σ survivalNeed
  // requiresExpediteReview = CRITICAL OR COMPETITION (review flag ONLY — never selects Air/Ocean).
  function projectHealth(input) {
    var f = isObj(input) ? input : {};
    var allocatedQty = num(f.allocatedQty) || 0;
    var demandQty = num(f.demandQty) || 0;
    var survivalNeedQty = num(f.survivalNeedQty) || 0;
    var poolSupply = num(f.poolSupply);
    var sumSurvivalNeed = num(f.sumSurvivalNeed);
    var survivalFloor = Math.min(survivalNeedQty, demandQty);
    var competition = (poolSupply !== null && sumSurvivalNeed !== null) ? (poolSupply < sumSurvivalNeed) : false;
    var survivalShortfallQty = Math.max(0, survivalFloor - allocatedQty);
    var healthState;
    if (allocatedQty < survivalFloor) healthState = 'CRITICAL';
    else if (allocatedQty < demandQty) healthState = 'RISK';
    else healthState = 'NORMAL';
    var requiresExpediteReview = (healthState === 'CRITICAL') || competition;
    return {
      healthState: healthState, survivalNeedQty: survivalNeedQty, allocatedQty: allocatedQty,
      survivalShortfallQty: survivalShortfallQty, competition: competition, requiresExpediteReview: requiresExpediteReview
    };
  }

  return {
    // eligibility
    filterEligibleReceivers: filterEligibleReceivers,
    receiverExclusionReason: receiverExclusionReason,
    isPlannableStatus: isPlannableStatus,
    // allocation orchestration (reuses KMALLOC — no second engine)
    allocateFactoryCrossCompany: allocateFactoryCrossCompany,
    allocateOverseas: allocateOverseas,
    // health projection
    projectHealth: projectHealth
  };
});
