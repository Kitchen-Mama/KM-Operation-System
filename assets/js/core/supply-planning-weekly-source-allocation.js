// Kitchen Mama Operation System — WEEKLY AI PLAN pure source-allocation builder (F1-7N-B).
// -----------------------------------------------------------------------------
// Realizes the frozen §35A WEEKLY_SHIPPING SOURCE-PRIORITY axis
//   Overseas  →  Factory CN_YOUXIN  →  Factory TW_SHENGYI  →  unresolved production/order need
// as a PURE deterministic COMPOSITION over the frozen §40 allocation primitives + the frozen Round-1M weekly facts
// resolver. It NEVER reimplements or re-orders those primitives:
//   • Overseas   → supply-planning-allocations.js `allocateOverseasSharedPool` (§20/§24/§40 — 18-day protection etc.)
//   • Factory    → supply-planning-allocations.js `allocateFactoryDeterministic` (§35/§40 — ascending-poolKey, UNCHANGED)
//   • FLOOR+lines → supply-planning-source-facts.js `resolveWeeklyRecommendationFacts` (§31/§2C.1 shipping FLOOR)
//
// CN_YOUXIN > TW_SHENGYI is realized by SEQUENTIAL SOURCE PASSES (CN-only pools over the overseas residual, then
// TW-only pools over the CN residual) — never by touching `allocateFactoryDeterministic`'s internal source order.
// Demand ordering (§35: Required-By → allocation_priority → stable keys) stays owned by the primitives and is NOT
// re-ordered here — source priority is a strictly separate axis (§35A.1).
//
// Invariants: PURE — no I/O, no clock/random/locale, no DB/Sheet, no persistence, no reservation/deduction, no
// Request/PO creation. Inputs are never mutated (fresh residual demands + shallow line clones). MISSING is never
// silently 0. A physical pool is never consumed >100% (each primitive conserves; each pool is offered to exactly one
// pass). This slice produces ONLY the pure WEEKLY_SHIPPING recommendation result for the later F1-7N-C persistence
// adapter — it persists nothing and emits NO carrier/rate/lead-time/ETA/cost (WA-6 logistics boundary).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-allocations.js') : (root.KMALLOC || (root.KM && root.KM.allocations)),
    req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklySourceAllocation = api; }
})(this, function (ALLOC, SF) {
  'use strict';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function aType(c, m) { if (!c) throw new TypeError('weeklySourceAllocation: ' + m); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function setOf(list) { var s = {}; (Array.isArray(list) ? list : []).forEach(function (x) { if (x != null && str(x) !== '') s[str(x)] = 1; }); return s; }
  function sumAllocated(recs) { var t = 0; (recs || []).forEach(function (a) { t += (typeof a.allocatedQty === 'number' ? a.allocatedQty : 0); }); return t; }
  function shallowClone(o) { var n = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; return n; }
  function emptyFactoryResult() { return { allocationType: 'FACTORY_DETERMINISTIC', allocations: [], unallocatedDemand: [], unusedSupply: [], blockedInputs: [] }; }

  // Build the residual demand list for the NEXT source pass. residualMap: demandKey -> qty the upstream source could
  // NOT cover. A demand absent from the map was fully covered upstream (residual 0 → omitted). A demand with no
  // upstream source at all is passed with its full demandQty (residualMap simply won't contain its key). demandQty>0
  // only (a 0/blocked residual never enters a downstream pass) — each fresh demand preserves the §35 ordering inputs.
  function residualDemands(baseDemands, residualMap, hasUpstream) {
    var out = [];
    (baseDemands || []).forEach(function (d) {
      var key = str(d.demandKey);
      var q;
      if (Object.prototype.hasOwnProperty.call(residualMap, key)) q = residualMap[key];
      else q = hasUpstream[key] ? 0 : d.demandQty;   // upstream saw it + no residual entry ⇒ fully covered ⇒ 0
      if (typeof q === 'number' && q > 0) {
        var nd = shallowClone(d);
        nd.demandQty = q;
        out.push(nd);
      }
    });
    return out;
  }

  // buildWeeklySourceAllocation(input) — the ONE bounded public builder for the WEEKLY_SHIPPING source axis.
  //
  // input = {
  //   planningCycle: string, businessScope: object, formulaVersion?, sourceDataAsOf?,
  //   masterSku: string,                                   // required for the factory passes (§40 primitive input)
  //   overseasInput?: { company, country, masterSku, supplyPools[], receivers[] } | null,   // allocateOverseasSharedPool input
  //   factory?: {
  //     factoryPools: [{ poolKey, poolType:'FACTORY', warehouseId, effectiveSupplyQty }],
  //     demands:      [{ demandKey, company, marketplace, destinationWarehouseId, requiredByDate,
  //                      allocationPriority, demandQty, eligibleFactoryWarehouseIds[] }],
  //     cnYouxinWarehouseIds: [ids...],                     // §35A factory-source identity (caller-supplied; not invented)
  //     twShengyiWarehouseIds: [ids...]
  //   } | null,
  //   weeklyPlanningFacts: [ ...resolveWeeklyRecommendationFacts facts (sku, siteSku, windowCode, demandKey,
  //                          calculatedGap|gap-inputs, unitsPerCarton, ...) ]
  // }
  function buildWeeklySourceAllocation(input) {
    aType(isObj(input), 'input must be an object');
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
    aType(isObj(input.businessScope), 'businessScope required');
    var masterSku = str(input.masterSku);
    var weeklyPlanningFacts = input.weeklyPlanningFacts == null ? [] : input.weeklyPlanningFacts;
    aType(Array.isArray(weeklyPlanningFacts), 'weeklyPlanningFacts must be an array');

    var issues = [];

    // ---- PASS 1: OVERSEAS (full destination need) — frozen allocator, UNCHANGED --------------------------------
    var overseasAllocation = null;
    var overseasResidualByDemand = {};   // demandKey -> qty overseas could NOT cover
    var overseasSeen = {};               // demandKey -> 1 (present in the overseas pass)
    if (input.overseasInput != null) {
      aType(isObj(input.overseasInput), 'overseasInput must be an object or null');
      overseasAllocation = ALLOC.allocateOverseasSharedPool(input.overseasInput);   // §20/§24/§40 (never reimplemented)
      var ovAllocByDemand = {};
      (overseasAllocation.allocations || []).forEach(function (a) { var k = str(a.demandKey); ovAllocByDemand[k] = (ovAllocByDemand[k] || 0) + a.allocatedQty; });
      (input.overseasInput.receivers || []).forEach(function (r) {
        var k = str(r.demandKey); overseasSeen[k] = 1;
        var residual = (typeof r.demandQty === 'number' ? r.demandQty : 0) - (ovAllocByDemand[k] || 0);
        overseasResidualByDemand[k] = residual > 0 ? residual : 0;
      });
    }

    // ---- PASS 2 + 3: FACTORY CN_YOUXIN then TW_SHENGYI (over the residual) — sequential frozen-allocator passes ---
    var factoryAllocation = null, cnAlloc = emptyFactoryResult(), twAlloc = emptyFactoryResult();
    if (input.factory != null) {
      aType(isObj(input.factory), 'factory must be an object or null');
      aType(masterSku.length > 0, 'masterSku required when factory passes are present');
      var f = input.factory;
      var cnIds = setOf(f.cnYouxinWarehouseIds), twIds = setOf(f.twShengyiWarehouseIds);

      // Partition pools by factory identity. An unclassified factory warehouse is fail-closed (surfaced + EXCLUDED —
      // never silently consumed and never fabricated); its stock simply never enters a pass. Overlap CN∩TW is invalid.
      var cnPools = [], twPools = [];
      (f.factoryPools || []).forEach(function (p) {
        var wh = str(p.warehouseId);
        var inCn = cnIds[wh] === 1, inTw = twIds[wh] === 1;
        if (inCn && inTw) { issues.push({ kind: 'SUPPLY', key: str(p.poolKey), reason: 'FACTORY_WAREHOUSE_CLASSIFIED_BOTH_CN_AND_TW:' + wh }); return; }
        if (inCn) cnPools.push(p);
        else if (inTw) twPools.push(p);
        else issues.push({ kind: 'SUPPLY', key: str(p.poolKey), reason: 'UNCLASSIFIED_FACTORY_WAREHOUSE:' + wh });
      });

      // CN pass over the overseas residual.
      var cnDemands = residualDemands(f.demands || [], overseasResidualByDemand, overseasSeen);
      if (cnPools.length && cnDemands.length) cnAlloc = ALLOC.allocateFactoryDeterministic({ masterSku: masterSku, factoryPools: cnPools, demands: cnDemands });

      // TW pass over the CN residual (demands that entered the CN pass, reduced by what CN covered).
      var cnResidualMap = {}, cnSeen = {};
      cnDemands.forEach(function (d) { cnSeen[str(d.demandKey)] = 1; });
      (cnAlloc.unallocatedDemand || []).forEach(function (u) { cnResidualMap[str(u.demandKey)] = u.unallocatedQty; });
      var twDemands = residualDemands(cnDemands, cnResidualMap, cnSeen);
      if (twPools.length && twDemands.length) twAlloc = ALLOC.allocateFactoryDeterministic({ masterSku: masterSku, factoryPools: twPools, demands: twDemands });

      // Merge CN + TW into ONE factoryAllocation the resolver consumes (allocations concat; final residual = TW's).
      // allocationKeys stay unique across passes (poolKey differs CN vs TW). unusedSupply/blockedInputs concatenated.
      factoryAllocation = {
        allocationType: 'FACTORY_DETERMINISTIC',
        allocations: (cnAlloc.allocations || []).concat(twAlloc.allocations || []),
        unallocatedDemand: (twAlloc.unallocatedDemand || []).slice(),
        unusedSupply: (cnAlloc.unusedSupply || []).concat(twAlloc.unusedSupply || []),
        blockedInputs: (cnAlloc.blockedInputs || []).concat(twAlloc.blockedInputs || [])
      };
    }

    // ---- ASSEMBLE PROJECTION + RESOLVE WEEKLY LINES (frozen resolver: FLOOR, source identity, blocked) -----------
    var allocationProjection = {
      overseasAllocation: overseasAllocation,
      factoryAllocation: factoryAllocation,
      blockedInputs: ((overseasAllocation && overseasAllocation.blockedInputs) || []).concat((factoryAllocation && factoryAllocation.blockedInputs) || []),
      sourceDataAsOf: input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf
    };
    var weekly = SF.resolveWeeklyRecommendationFacts({
      planningCycle: input.planningCycle,
      businessScope: input.businessScope,
      allocationProjection: allocationProjection,
      weeklyPlanningFacts: weeklyPlanningFacts,
      formulaVersion: input.formulaVersion,
      sourceDataAsOf: input.sourceDataAsOf
    });

    // ---- ANNOTATE: unresolved production/order need (§35A step 4) + frozen §35A.WA-4 source-stage tokens ----------
    // unresolvedProductionNeedQty = calculatedGap − recommendedQty (the FLOORed shipping qty). A partial-carton source
    // remainder does NOT satisfy the gap (task §6/§7): Gap 100, source 95, UPC 24 → recommended 72 → residual 28 (NOT 5).
    var cnWh = setOf(input.factory ? input.factory.cnYouxinWarehouseIds : []);
    var twWh = setOf(input.factory ? input.factory.twShengyiWarehouseIds : []);
    var lines = (weekly.lines || []).map(function (l) {
      var out = shallowClone(l);
      var residual = null;
      if (!l.blockedReason && typeof l.calculatedGap === 'number' && typeof l.recommendedQty === 'number') {
        residual = l.calculatedGap - l.recommendedQty;
        if (residual < 0) residual = 0;
      }
      out.unresolvedProductionNeedQty = residual;   // null when blocked / gap or recommended missing
      var stages = {};
      (l.allocationBreakdown || []).forEach(function (b) {
        if (b.sourcePoolType && b.sourcePoolType !== 'FACTORY') stages.SOURCE_OVERSEAS = 1;
        else if (cnWh[str(b.sourceWarehouseId)] === 1) stages.SOURCE_FACTORY_CN_YOUXIN = 1;
        else if (twWh[str(b.sourceWarehouseId)] === 1) stages.SOURCE_FACTORY_TW_SHENGYI = 1;
      });
      if (residual !== null && residual > 0) stages.UNRESOLVED_PRODUCTION_NEED = 1;
      out.sourceStages = Object.keys(stages).sort();
      return out;
    });

    var unresolvedTotal = 0;
    lines.forEach(function (l) { if (typeof l.unresolvedProductionNeedQty === 'number') unresolvedTotal += l.unresolvedProductionNeedQty; });
    issues.sort(function (a, b) { return (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0) || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0); });

    return {
      recommendationType: 'WEEKLY_SHIPPING',
      planningCycle: str(input.planningCycle),
      businessScope: input.businessScope,
      allocationProjection: allocationProjection,
      lines: lines,
      weeklyFacts: weekly,                              // full frozen-resolver result (issues, allocationSummary, lineage)
      sourcePriority: {
        overseasAllocatedQty: sumAllocated(overseasAllocation ? overseasAllocation.allocations : []),
        cnAllocatedQty: sumAllocated(cnAlloc.allocations),
        twAllocatedQty: sumAllocated(twAlloc.allocations),
        unresolvedProductionNeedQty: unresolvedTotal
      },
      issues: issues,                                  // builder-level issues (pool classification); resolver issues stay in weeklyFacts
      ready: (weekly.ready !== false) && issues.length === 0
    };
  }

  return { buildWeeklySourceAllocation: buildWeeklySourceAllocation, _version: 'f1-7n-b-r1' };
});
