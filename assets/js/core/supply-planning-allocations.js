// Kitchen Mama Operation System — Allocation pure runtime (Phase 2B, Round 10B).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC implementation of the frozen §40 public contract in
// docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md (v4.7). Two allocators only:
//   • allocateOverseasSharedPool({ company, country, masterSku, supplyPools, receivers })
//       — §20/§24 overseas shared-pool allocation: NORMAL / PROTECTED / SHORTAGE mode selection
//         (§24.5/§24.6/§24.7), 18-day survival protection (§20.3/§24.4), deterministic largest-remainder
//         (§24.7), and FBA-vs-THREE_PL lane separation with NO cross-type fallback (§23.6/§24.9) — #7/#8/#9/#10/#11
//   • allocateFactoryDeterministic({ masterSku, factoryPools, demands })
//       — §35 factory FIFO by Required-By across companies, each factory unit allocated once — #19
//
// The allocator DISTRIBUTES; it never persists, reserves, deducts, rounds cartons, or executes business (§40.2).
// It consumes an explicit AllocationInput DTO projected from immutable §39 Ledger effective quantities and never
// writes back into any input object (§40.3). Local remaining* is allocator-internal and never exposed (§40.7/§40.15).
// No DB/API/clock/locale/random; same input ⇒ identical output; a fresh result object every call.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.allocations = api;
  }
})(this, function () {
  'use strict';

  var POOL_TYPES_OVERSEAS = { THREE_PL: 1, FBA: 1 };
  var FULFILLMENT_MODELS = { self_fulfilled: 1, platform_fulfilled: 1, hybrid: 1 };
  var LEDGER_STATES = { COUNTED: 1, BLOCKED_CONFLICT: 1 };
  var MODE_SEVERITY = { NORMAL_ALLOCATION: 0, PROTECTED_REALLOCATION: 1, SHORTAGE_ALLOCATION: 2 };

  // ---- helpers --------------------------------------------------------------
  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('supplyPlanningAllocations: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonEmptyString(v, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (v.trim() === '') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a non-empty string');
    return v;
  }
  function requireEnum(v, set, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (set[v] !== 1) throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a supported token (got "' + v + '")');
    return v;
  }
  function requireQty(v, name) {
    if (typeof v !== 'number') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a number (got ' + describe(v) + ')');
    if (!isFinite(v)) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be finite (got ' + v + ')');
    if (v < 0) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be non-negative (got ' + v + ')');
    return v;
  }
  function optNullableString(v, name) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string or null (got ' + describe(v) + ')');
    return v;
  }
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function isRealCalendarDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= dim[m - 1];
  }
  function requireStrictIsoDate(v, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a "YYYY-MM-DD" string (got ' + describe(v) + ')');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) throw new RangeError('supplyPlanningAllocations: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
    if (!isRealCalendarDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))) {
      throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a real calendar date ("' + v + '")');
    }
    return v;
  }
  function optState(v, name) {
    if (v === undefined || v === null) return 'COUNTED';
    if (typeof v !== 'string') throw new TypeError('supplyPlanningAllocations: ' + name + ' must be a string state (got ' + describe(v) + ')');
    if (LEDGER_STATES[v] !== 1) throw new RangeError('supplyPlanningAllocations: ' + name + ' is not a supported Ledger state (got "' + v + '")');
    return v;
  }

  // Deterministic weight distribution with per-item caps and cap-overflow redistribution.
  // Real proportional rounds resolve capping; the final no-cap round distributes integer leftovers
  // one unit at a time in `leftoverCmp` order. Returns integer allocations that conserve the pool.
  function distributeByWeightCapped(pool, items, leftoverCmp) {
    var alloc = {}; items.forEach(function (it) { alloc[it.key] = 0; });
    var remaining = pool;
    var guard = 0;
    while (remaining > 0 && guard++ < 100000) {
      var active = items.filter(function (it) { return it.weight > 0 && alloc[it.key] < it.cap; });
      if (active.length === 0) break;
      var sumW = 0; active.forEach(function (it) { sumW += it.weight; });
      if (sumW <= 0) break;
      var entries = active.map(function (it) { return { it: it, raw: remaining * it.weight / sumW }; });
      var cappedThisRound = false;
      entries.forEach(function (e) {
        var room = e.it.cap - alloc[e.it.key];
        var fl = Math.floor(e.raw);
        if (fl >= room) { e.give = room; cappedThisRound = true; }
        else { e.give = fl; }
      });
      entries.forEach(function (e) { alloc[e.it.key] += e.give; remaining -= e.give; });
      if (cappedThisRound) continue; // freed capacity → redistribute in the next round
      // final integer leftover distribution (leftover < number of active receivers)
      var cands = entries.slice().sort(leftoverCmp);
      var pass = 0;
      while (remaining > 0 && pass++ < 100000) {
        var gaveAny = false;
        for (var k = 0; k < cands.length && remaining > 0; k++) {
          var c = cands[k];
          if (alloc[c.it.key] < c.it.cap) { alloc[c.it.key] += 1; remaining -= 1; gaveAny = true; }
        }
        if (!gaveAny) break;
      }
      break;
    }
    return { alloc: alloc, unused: remaining < 0 ? 0 : remaining };
  }

  // ============================ OVERSEAS =====================================
  function allocateOverseasSharedPool(input) {
    var root = requireObject(input, 'input');
    var company = requireNonEmptyString(root.company, 'input.company');
    var country = requireNonEmptyString(root.country, 'input.country');
    var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
    var supplyPools = requireArray(root.supplyPools, 'input.supplyPools');
    var receivers = requireArray(root.receivers, 'input.receivers');

    var blockedInputs = [];
    var poolSeen = {};
    var pools = [];
    supplyPools.forEach(function (p, i) {
      var ctx = 'input.supplyPools[' + i + ']';
      requireObject(p, ctx);
      var poolKey = requireNonEmptyString(p.poolKey, ctx + '.poolKey');
      var state = optState(p.state, ctx + '.state');
      if (poolSeen[poolKey]) throw new RangeError('supplyPlanningAllocations: duplicate poolKey "' + poolKey + '"');
      poolSeen[poolKey] = 1;
      if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'SUPPLY', key: poolKey, reason: typeof p.reason === 'string' ? p.reason : 'BLOCKED_CONFLICT' }); return; }
      var poolType = requireEnum(p.poolType, POOL_TYPES_OVERSEAS, ctx + '.poolType');
      var warehouseId = requireNonEmptyString(p.warehouseId, ctx + '.warehouseId');
      var effectiveSupplyQty = requireQty(p.effectiveSupplyQty, ctx + '.effectiveSupplyQty');
      pools.push({ poolKey: poolKey, poolType: poolType, warehouseId: warehouseId, effectiveSupplyQty: effectiveSupplyQty, remaining: effectiveSupplyQty });
    });

    var recvSeen = {}, demandSeen = {};
    var recvs = [];
    receivers.forEach(function (r, i) {
      var ctx = 'input.receivers[' + i + ']';
      requireObject(r, ctx);
      var receiverKey = requireNonEmptyString(r.receiverKey, ctx + '.receiverKey');
      var demandKey = requireNonEmptyString(r.demandKey, ctx + '.demandKey');
      var state = optState(r.state, ctx + '.state');
      if (recvSeen[receiverKey]) throw new RangeError('supplyPlanningAllocations: duplicate receiverKey "' + receiverKey + '"');
      recvSeen[receiverKey] = 1;
      if (demandSeen[demandKey]) throw new RangeError('supplyPlanningAllocations: duplicate demandKey "' + demandKey + '"');
      demandSeen[demandKey] = 1;
      if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'DEMAND', key: demandKey, reason: typeof r.reason === 'string' ? r.reason : 'BLOCKED_CONFLICT' }); return; }
      var marketplace = requireNonEmptyString(r.marketplace, ctx + '.marketplace');
      var destinationWarehouseId = requireNonEmptyString(r.destinationWarehouseId, ctx + '.destinationWarehouseId');
      var fulfillmentModel = requireEnum(r.fulfillmentModel, FULFILLMENT_MODELS, ctx + '.fulfillmentModel');
      var demandQty = requireQty(r.demandQty, ctx + '.demandQty');
      var survivalNeedQty = requireQty(r.survivalNeedQty, ctx + '.survivalNeedQty');
      var allocationPriority = requireQty(r.allocationPriority, ctx + '.allocationPriority');
      var demandWeight = requireQty(r.demandWeight, ctx + '.demandWeight');
      var eligiblePoolTypes = requireArray(r.eligiblePoolTypes, ctx + '.eligiblePoolTypes').map(function (t, j) {
        return requireEnum(t, POOL_TYPES_OVERSEAS, ctx + '.eligiblePoolTypes[' + j + ']');
      });
      recvs.push({ receiverKey: receiverKey, demandKey: demandKey, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
        fulfillmentModel: fulfillmentModel, demandQty: demandQty, survivalNeedQty: survivalNeedQty,
        allocationPriority: allocationPriority, demandWeight: demandWeight, eligiblePoolTypes: eligiblePoolTypes });
    });

    var allocations = []; var seq = { n: 0 };
    var unallocatedDemand = [];
    var laneModes = [];

    // deterministic overseas receiver order (§40.13): priority desc → weight desc → marketplace asc → receiverKey asc
    function recvOrder(a, b) {
      return (b.allocationPriority - a.allocationPriority) || (b.demandWeight - a.demandWeight)
        || cmpStr(a.marketplace, b.marketplace) || cmpStr(a.receiverKey, b.receiverKey);
    }

    ['FBA', 'THREE_PL'].forEach(function (lane) {
      var lanePools = pools.filter(function (p) { return p.poolType === lane; }).sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); });
      var laneRecvs = recvs.filter(function (r) { return r.eligiblePoolTypes.indexOf(lane) !== -1; });
      if (laneRecvs.length === 0) return;
      var poolSupply = 0; lanePools.forEach(function (p) { poolSupply += p.remaining; });
      var sumSurvival = 0; laneRecvs.forEach(function (r) { sumSurvival += Math.min(r.survivalNeedQty, r.demandQty); });

      var mode, finalAlloc = {}, survivalAlloc = {};
      if (poolSupply < sumSurvival) {
        mode = 'SHORTAGE_ALLOCATION';
        // §24.7 weighted-survival largest remainder; leftover order: priority desc → unmet-survival desc → mp → key
        var items = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: Math.min(r.survivalNeedQty, r.demandQty) * Math.max(r.allocationPriority, 1), cap: r.demandQty, r: r }; });
        var res = distributeByWeightCapped(poolSupply, items, function (a, b) {
          var ra = a.it.r, rb = b.it.r;
          return (rb.allocationPriority - ra.allocationPriority)
            || ((rb.survivalNeedQty) - (ra.survivalNeedQty))
            || cmpStr(ra.marketplace, rb.marketplace) || cmpStr(ra.receiverKey, rb.receiverKey);
        });
        laneRecvs.forEach(function (r) { finalAlloc[r.receiverKey] = res.alloc[r.receiverKey] || 0; survivalAlloc[r.receiverKey] = finalAlloc[r.receiverKey]; });
      } else {
        // NORMAL vs PROTECTED diagnostic = pure-weight split of the whole pool (§40.5)
        var wItems = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: r.demandWeight, cap: r.demandQty, r: r }; });
        var prov = distributeByWeightCapped(poolSupply, wItems, function (a, b) {
          return (b.it.r.allocationPriority - a.it.r.allocationPriority) || cmpStr(a.it.r.marketplace, b.it.r.marketplace) || cmpStr(a.it.r.receiverKey, b.it.r.receiverKey);
        });
        var allSafe = laneRecvs.every(function (r) { return (prov.alloc[r.receiverKey] || 0) >= Math.min(r.survivalNeedQty, r.demandQty); });
        mode = allSafe ? 'NORMAL_ALLOCATION' : 'PROTECTED_REALLOCATION';
        // actual allocation = survival-first, then weighted distribution of the remaining pool
        var remainingPool = poolSupply;
        laneRecvs.forEach(function (r) { var sv = Math.min(r.survivalNeedQty, r.demandQty, remainingPool); survivalAlloc[r.receiverKey] = sv; remainingPool -= sv; });
        var wItems2 = laneRecvs.map(function (r) { return { key: r.receiverKey, weight: r.demandWeight, cap: r.demandQty - survivalAlloc[r.receiverKey], r: r }; });
        var wres = distributeByWeightCapped(remainingPool, wItems2, function (a, b) {
          return (b.it.r.allocationPriority - a.it.r.allocationPriority) || cmpStr(a.it.r.marketplace, b.it.r.marketplace) || cmpStr(a.it.r.receiverKey, b.it.r.receiverKey);
        });
        laneRecvs.forEach(function (r) { finalAlloc[r.receiverKey] = survivalAlloc[r.receiverKey] + (wres.alloc[r.receiverKey] || 0); });
      }
      laneModes.push(mode);

      // Assign each receiver's allocation to source pools (ascending poolKey), splitting survival vs weighted reason.
      var ordered = laneRecvs.slice().sort(recvOrder);
      function reserveReason(r, baseReason) { return (lane === 'THREE_PL' && r.fulfillmentModel === 'platform_fulfilled') ? 'THREE_PL_REPLENISHMENT_RESERVE' : baseReason; }
      function assign(r, qty, reason) {
        var need = qty;
        for (var pi = 0; pi < lanePools.length && need > 0; pi++) {
          var p = lanePools[pi];
          if (p.remaining <= 0) continue;
          var take = Math.min(need, p.remaining);
          if (take <= 0) continue;
          p.remaining -= take; need -= take;
          allocations.push({
            allocationKey: 'OVERSEAS_SHARED_POOL|' + p.poolKey + '|' + r.demandKey + '|' + seq.n,
            allocationType: 'OVERSEAS_SHARED_POOL', sourcePoolKey: p.poolKey, sourcePoolType: p.poolType, sourceWarehouseId: p.warehouseId,
            masterSku: masterSku, company: company, country: country, marketplace: r.marketplace, destinationWarehouseId: r.destinationWarehouseId,
            demandKey: r.demandKey, allocatedQty: take, allocationSequence: seq.n, allocationReason: reason
          });
          seq.n += 1;
        }
      }
      var survReasonBase = mode === 'PROTECTED_REALLOCATION' ? 'PROTECTION_REALLOCATION' : (mode === 'SHORTAGE_ALLOCATION' ? 'SHORTAGE_LARGEST_REMAINDER' : 'SURVIVAL_18D');
      if (mode !== 'SHORTAGE_ALLOCATION') {
        ordered.forEach(function (r) { if (survivalAlloc[r.receiverKey] > 0) assign(r, survivalAlloc[r.receiverKey], reserveReason(r, survReasonBase)); });
        ordered.forEach(function (r) { var w = finalAlloc[r.receiverKey] - survivalAlloc[r.receiverKey]; if (w > 0) assign(r, w, reserveReason(r, 'WEIGHTED_REMAINDER')); });
      } else {
        ordered.forEach(function (r) { if (finalAlloc[r.receiverKey] > 0) assign(r, finalAlloc[r.receiverKey], reserveReason(r, 'SHORTAGE_LARGEST_REMAINDER')); });
      }

      // unallocated demand per receiver in this lane
      ordered.forEach(function (r) {
        var unmet = r.demandQty - finalAlloc[r.receiverKey];
        if (unmet > 0) {
          var reason = mode === 'SHORTAGE_ALLOCATION' ? 'SHORTAGE_UNMET'
            : (survivalAlloc[r.receiverKey] < Math.min(r.survivalNeedQty, r.demandQty) ? 'PROTECTION_FLOOR_BLOCKED' : 'DEMAND_UNMET');
          unallocatedDemand.push({ demandKey: r.demandKey, company: company, country: country, marketplace: r.marketplace,
            destinationWarehouseId: r.destinationWarehouseId, poolType: lane, unallocatedQty: unmet, allocationReason: reason });
        }
      });
    });

    // eligible totals: per lane demand counted (a both-lane receiver counts per lane it participates in)
    var totalDemandQty = 0;
    ['FBA', 'THREE_PL'].forEach(function (lane) {
      recvs.forEach(function (r) { if (r.eligiblePoolTypes.indexOf(lane) !== -1) totalDemandQty += r.demandQty; });
    });
    var totalSupplyQty = 0; pools.forEach(function (p) { totalSupplyQty += p.effectiveSupplyQty; });

    var unusedSupply = pools.slice().sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); })
      .filter(function (p) { return p.remaining > 0; })
      .map(function (p) { return { poolKey: p.poolKey, poolType: p.poolType, warehouseId: p.warehouseId, unusedQty: p.remaining }; });

    allocations.sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || cmpStr(a.demandKey, b.demandKey) || (a.allocationSequence - b.allocationSequence); });
    unallocatedDemand.sort(function (a, b) { return cmpStr(a.demandKey, b.demandKey) || cmpStr(a.poolType, b.poolType); });

    var totalAllocatedQty = 0; allocations.forEach(function (a) { totalAllocatedQty += a.allocatedQty; });
    var totalUnallocatedDemandQty = 0; unallocatedDemand.forEach(function (u) { totalUnallocatedDemandQty += u.unallocatedQty; });
    var totalUnusedSupplyQty = 0; unusedSupply.forEach(function (u) { totalUnusedSupplyQty += u.unusedQty; });

    var allocationMode = laneModes.length
      ? laneModes.reduce(function (acc, m) { return MODE_SEVERITY[m] > MODE_SEVERITY[acc] ? m : acc; }, 'NORMAL_ALLOCATION')
      : 'NORMAL_ALLOCATION';

    verifyConservation(totalAllocatedQty, totalUnallocatedDemandQty, totalDemandQty, totalUnusedSupplyQty, totalSupplyQty);

    return {
      allocationType: 'OVERSEAS_SHARED_POOL', allocationMode: allocationMode,
      allocations: allocations, unallocatedDemand: unallocatedDemand, unusedSupply: unusedSupply, blockedInputs: blockedInputs,
      totalDemandQty: totalDemandQty, totalSupplyQty: totalSupplyQty, totalAllocatedQty: totalAllocatedQty,
      totalUnallocatedDemandQty: totalUnallocatedDemandQty, totalUnusedSupplyQty: totalUnusedSupplyQty
    };
  }

  // ============================ FACTORY ======================================
  function allocateFactoryDeterministic(input) {
    var root = requireObject(input, 'input');
    var masterSku = requireNonEmptyString(root.masterSku, 'input.masterSku');
    var factoryPools = requireArray(root.factoryPools, 'input.factoryPools');
    var demands = requireArray(root.demands, 'input.demands');

    var blockedInputs = [];
    var poolSeen = {}; var pools = []; var poolByKey = {};
    factoryPools.forEach(function (p, i) {
      var ctx = 'input.factoryPools[' + i + ']';
      requireObject(p, ctx);
      var poolKey = requireNonEmptyString(p.poolKey, ctx + '.poolKey');
      var state = optState(p.state, ctx + '.state');
      if (poolSeen[poolKey]) throw new RangeError('supplyPlanningAllocations: duplicate poolKey "' + poolKey + '"');
      poolSeen[poolKey] = 1;
      if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'SUPPLY', key: poolKey, reason: typeof p.reason === 'string' ? p.reason : 'BLOCKED_CONFLICT' }); return; }
      var poolType = requireEnum(p.poolType, { FACTORY: 1 }, ctx + '.poolType');
      var warehouseId = requireNonEmptyString(p.warehouseId, ctx + '.warehouseId');
      var effectiveSupplyQty = requireQty(p.effectiveSupplyQty, ctx + '.effectiveSupplyQty');
      var rec = { poolKey: poolKey, poolType: poolType, warehouseId: warehouseId, effectiveSupplyQty: effectiveSupplyQty, remaining: effectiveSupplyQty };
      pools.push(rec); poolByKey[poolKey] = rec;
    });

    var demandSeen = {}; var dems = [];
    demands.forEach(function (dd, i) {
      var ctx = 'input.demands[' + i + ']';
      requireObject(dd, ctx);
      var demandKey = requireNonEmptyString(dd.demandKey, ctx + '.demandKey');
      var state = optState(dd.state, ctx + '.state');
      if (demandSeen[demandKey]) throw new RangeError('supplyPlanningAllocations: duplicate demandKey "' + demandKey + '"');
      demandSeen[demandKey] = 1;
      if (state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'DEMAND', key: demandKey, reason: typeof dd.reason === 'string' ? dd.reason : 'BLOCKED_CONFLICT' }); return; }
      var comp = requireNonEmptyString(dd.company, ctx + '.company');
      var marketplace = requireNonEmptyString(dd.marketplace, ctx + '.marketplace');
      var destinationWarehouseId = requireNonEmptyString(dd.destinationWarehouseId, ctx + '.destinationWarehouseId');
      var requiredByDate = requireStrictIsoDate(dd.requiredByDate, ctx + '.requiredByDate');
      var allocationPriority = requireQty(dd.allocationPriority, ctx + '.allocationPriority');
      var demandQty = requireQty(dd.demandQty, ctx + '.demandQty');
      var eligibleFactoryWarehouseIds = requireArray(dd.eligibleFactoryWarehouseIds, ctx + '.eligibleFactoryWarehouseIds').map(function (w, j) {
        return requireNonEmptyString(w, ctx + '.eligibleFactoryWarehouseIds[' + j + ']');
      });
      dems.push({ demandKey: demandKey, company: comp, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
        requiredByDate: requiredByDate, allocationPriority: allocationPriority, demandQty: demandQty, remaining: demandQty,
        eligibleFactoryWarehouseIds: eligibleFactoryWarehouseIds });
    });

    // §35 demand order: requiredByDate asc → priority desc → company asc → marketplace asc → destination asc → demandKey asc
    var ordered = dems.slice().sort(function (a, b) {
      return cmpStr(a.requiredByDate, b.requiredByDate) || (b.allocationPriority - a.allocationPriority)
        || cmpStr(a.company, b.company) || cmpStr(a.marketplace, b.marketplace)
        || cmpStr(a.destinationWarehouseId, b.destinationWarehouseId) || cmpStr(a.demandKey, b.demandKey);
    });
    var sortedPoolKeys = pools.map(function (p) { return p.poolKey; }).sort(cmpStr);

    var allocations = []; var seqn = 0;
    ordered.forEach(function (d) {
      for (var pi = 0; pi < sortedPoolKeys.length && d.remaining > 0; pi++) {
        var p = poolByKey[sortedPoolKeys[pi]];
        if (d.eligibleFactoryWarehouseIds.indexOf(p.warehouseId) === -1) continue;
        if (p.remaining <= 0) continue;
        var take = Math.min(d.remaining, p.remaining);
        if (take <= 0) continue;
        p.remaining -= take; d.remaining -= take;
        allocations.push({
          allocationKey: 'FACTORY_DETERMINISTIC|' + p.poolKey + '|' + d.demandKey + '|' + seqn,
          allocationType: 'FACTORY_DETERMINISTIC', sourcePoolKey: p.poolKey, sourcePoolType: p.poolType, sourceWarehouseId: p.warehouseId,
          masterSku: masterSku, company: d.company, country: null, marketplace: d.marketplace, destinationWarehouseId: d.destinationWarehouseId,
          demandKey: d.demandKey, allocatedQty: take, allocationSequence: seqn, allocationReason: 'FACTORY_FIFO'
        });
        seqn += 1;
      }
    });

    var unallocatedDemand = ordered.filter(function (d) { return d.remaining > 0; }).map(function (d) {
      return { demandKey: d.demandKey, company: d.company, country: null, marketplace: d.marketplace,
        destinationWarehouseId: d.destinationWarehouseId, poolType: 'FACTORY', unallocatedQty: d.remaining, allocationReason: 'FACTORY_SUPPLY_EXHAUSTED' };
    }).sort(function (a, b) { return cmpStr(a.demandKey, b.demandKey); });

    var unusedSupply = pools.slice().sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); })
      .filter(function (p) { return p.remaining > 0; })
      .map(function (p) { return { poolKey: p.poolKey, poolType: p.poolType, warehouseId: p.warehouseId, unusedQty: p.remaining }; });

    allocations.sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || cmpStr(a.demandKey, b.demandKey) || (a.allocationSequence - b.allocationSequence); });

    var totalDemandQty = 0; dems.forEach(function (d) { totalDemandQty += d.demandQty; });
    var totalSupplyQty = 0; pools.forEach(function (p) { totalSupplyQty += p.effectiveSupplyQty; });
    var totalAllocatedQty = 0; allocations.forEach(function (a) { totalAllocatedQty += a.allocatedQty; });
    var totalUnallocatedDemandQty = 0; unallocatedDemand.forEach(function (u) { totalUnallocatedDemandQty += u.unallocatedQty; });
    var totalUnusedSupplyQty = 0; unusedSupply.forEach(function (u) { totalUnusedSupplyQty += u.unusedQty; });

    verifyConservation(totalAllocatedQty, totalUnallocatedDemandQty, totalDemandQty, totalUnusedSupplyQty, totalSupplyQty);

    return {
      allocationType: 'FACTORY_DETERMINISTIC',
      allocations: allocations, unallocatedDemand: unallocatedDemand, unusedSupply: unusedSupply, blockedInputs: blockedInputs,
      totalDemandQty: totalDemandQty, totalSupplyQty: totalSupplyQty, totalAllocatedQty: totalAllocatedQty,
      totalUnallocatedDemandQty: totalUnallocatedDemandQty, totalUnusedSupplyQty: totalUnusedSupplyQty
    };
  }

  // Defensive conservation guard (§40.11/§40.14). Must never fire in correct code.
  function verifyConservation(alloc, unallocDemand, totalDemand, unusedSupply, totalSupply) {
    if (alloc + unallocDemand !== totalDemand) {
      throw new RangeError('supplyPlanningAllocations: demand conservation violated (' + alloc + ' + ' + unallocDemand + ' != ' + totalDemand + ')');
    }
    if (alloc + unusedSupply !== totalSupply) {
      throw new RangeError('supplyPlanningAllocations: supply conservation violated (' + alloc + ' + ' + unusedSupply + ' != ' + totalSupply + ')');
    }
  }

  return { allocateOverseasSharedPool: allocateOverseasSharedPool, allocateFactoryDeterministic: allocateFactoryDeterministic };
});
