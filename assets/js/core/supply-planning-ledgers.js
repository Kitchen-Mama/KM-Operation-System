// Kitchen Mama Operation System — Demand / Supply Ledger pure runtime (Phase 2B, Round 9B).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC implementation of the frozen §39 public contract in
// docs/planning/SUPPLY_PLANNING_CALCULATION_RULES.md (v4.6). Two builders only:
//   • buildDemandLedger({ entries }) — §25.1 demand grain + §27/§29E-event stable-eventId count-once (#27)
//   • buildSupplyLedger({ entries }) — §25.2 supply grain + §30 lifecycle count-once (#15/#16/#17) +
//     §23 physical-pool de-duplication with Marketplace excluded (#32) + §24.9 FBA-vs-3PL separation (#10/#11)
//
// The Ledger NORMALIZES; it never allocates. It owns ONLY deterministic preparation (validation, lifecycle
// count-once, physical-pool dedup, event-identity count-once, stable ordering, immutable count-once effective
// quantities). It reads no DB/API, uses no clock/locale, maps no external status, acquires no events, and
// performs NO allocation / carton rounding / persistence (§39.2). `remaining*` consumption fields are the
// future allocator's, never the Ledger's (§39.7). Same input ⇒ identical output; input never mutated;
// a fresh result object every call.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') {
    window.KM = window.KM || {};
    window.KM.ledgers = api;
  }
})(this, function () {
  'use strict';

  // ---- frozen enum tokens (§39.3 / §39.4 / §39.5) ---------------------------
  var DEMAND_TYPES = { REGULAR: 1, SALES_RUN_RATE: 1, SPECIAL_EVENT: 1, SAFETY: 1 };
  var POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };
  // Active lifecycle buckets contribute to effectiveSupplyQty; excluded buckets are visible but contribute 0.
  var ACTIVE_BUCKETS = {
    COMMITTED_PRODUCTION: 1, APPROVED_SHIPPING_PLAN: 1, SHIPPED_IN_TRANSIT: 1,
    DELIVERED_NOT_RECEIVED: 1, RECEIVED_NOT_REFLECTED: 1, CURRENT_STOCK: 1
  };
  var EXCLUDED_BUCKETS = { DRAFT: 1, CANCELLED_INVALID: 1, CORRECTION_REVERSAL: 1 };
  var LIFECYCLE_BUCKETS = {};
  (function () { var k; for (k in ACTIVE_BUCKETS) LIFECYCLE_BUCKETS[k] = 1; for (k in EXCLUDED_BUCKETS) LIFECYCLE_BUCKETS[k] = 1; })();

  var SEP = ''; // non-printable key separator (never appears in canonical identities)

  // ---- helpers --------------------------------------------------------------
  function describe(v) { return v === null ? 'null' : (Array.isArray(v) ? 'array' : typeof v); }
  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  function requireObject(v, name) {
    if (!isObject(v)) throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a non-null, non-array object (got ' + describe(v) + ')');
    return v;
  }
  function requireArray(v, name) {
    if (!Array.isArray(v)) throw new TypeError('supplyPlanningLedgers: ' + name + ' must be an array (got ' + describe(v) + ')');
    return v;
  }
  function requireNonEmptyString(v, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (v.trim() === '') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a non-empty string');
    return v;
  }
  // string | null provenance field: undefined/null → null; string ok; anything else → TypeError (no coercion).
  function optNullableString(v, name) {
    if (v === undefined || v === null) return null;
    if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string or null (got ' + describe(v) + ')');
    return v;
  }
  // enum: non-string → TypeError; string-but-not-a-token → RangeError (§39.10).
  function requireEnum(v, set, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a string (got ' + describe(v) + ')');
    if (set[v] !== 1) throw new RangeError('supplyPlanningLedgers: ' + name + ' is not a supported token (got "' + v + '")');
    return v;
  }
  // quantity: non-number → TypeError; NaN/Infinity/negative → RangeError. 0 is valid. No coercion.
  function requireQty(v, name) {
    if (typeof v !== 'number') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a number (got ' + describe(v) + ')');
    if (!isFinite(v)) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be finite (got ' + v + ')');
    if (v < 0) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be non-negative (got ' + v + ')');
    return v;
  }
  // strict real YYYY-MM-DD (§27A.7 contract, replicated non-divergently): non-string → TypeError;
  // non-strict 4-2-2 or non-real-calendar → RangeError. No Date constructor, no clock, no locale.
  function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0); }
  function isRealCalendarDate(y, m, d) {
    if (m < 1 || m > 12 || d < 1) return false;
    var dim = [31, (isLeap(y) ? 29 : 28), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= dim[m - 1];
  }
  function requireStrictIsoDate(v, name) {
    if (typeof v !== 'string') throw new TypeError('supplyPlanningLedgers: ' + name + ' must be a "YYYY-MM-DD" string (got ' + describe(v) + ')');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) throw new RangeError('supplyPlanningLedgers: ' + name + ' must be strict YYYY-MM-DD (got "' + v + '")');
    if (!isRealCalendarDate(parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10))) {
      throw new RangeError('supplyPlanningLedgers: ' + name + ' is not a real calendar date ("' + v + '")');
    }
    return v;
  }

  /**
   * buildDemandLedger({ entries }) → immutable §25.1 Demand Ledger.
   * Count-once by demandKey (SPECIAL_EVENT → …+eventId; else …+demandType+sourceRef); marketplace never in the key.
   * Same key + identical quantity → counted once; same key + differing quantity → one BLOCKED_CONFLICT (qty 0).
   * `remainingUnmetQty` is NOT emitted (allocator-owned, §39.7).
   */
  function buildDemandLedger(input) {
    var root = requireObject(input, 'input');
    var entries = requireArray(root.entries, 'input.entries');

    var normalized = entries.map(function (e, i) {
      var ctx = 'input.entries[' + i + ']';
      requireObject(e, ctx);
      var demandType = requireEnum(e.demandType, DEMAND_TYPES, ctx + '.demandType');
      var masterSku = requireNonEmptyString(e.masterSku, ctx + '.masterSku');
      var company = requireNonEmptyString(e.company, ctx + '.company');
      var country = optNullableString(e.country, ctx + '.country');
      var marketplace = optNullableString(e.marketplace, ctx + '.marketplace');
      var destinationWarehouseId = requireNonEmptyString(e.destinationWarehouseId, ctx + '.destinationWarehouseId');
      var planningCycle = requireNonEmptyString(e.planningCycle, ctx + '.planningCycle');
      var requiredByDate = requireStrictIsoDate(e.requiredByDate, ctx + '.requiredByDate');
      var sourceRef = requireNonEmptyString(e.sourceRef, ctx + '.sourceRef');
      var quantity = requireQty(e.quantity, ctx + '.quantity');
      var isEvent = demandType === 'SPECIAL_EVENT';
      var eventId = isEvent ? requireNonEmptyString(e.eventId, ctx + '.eventId') : null;
      var demandKey = isEvent
        ? [company, destinationWarehouseId, masterSku, planningCycle, eventId].join(SEP)
        : [company, destinationWarehouseId, masterSku, planningCycle, demandType, sourceRef].join(SEP);
      return {
        demandKey: demandKey, demandType: demandType, masterSku: masterSku, company: company,
        country: country, marketplace: marketplace, destinationWarehouseId: destinationWarehouseId,
        planningCycle: planningCycle, requiredByDate: requiredByDate, eventId: eventId, quantity: quantity, _i: i
      };
    });

    var groups = {}; var order = [];
    normalized.forEach(function (n) {
      if (!groups[n.demandKey]) { groups[n.demandKey] = []; order.push(n.demandKey); }
      groups[n.demandKey].push(n);
    });

    var outEntries = []; var blockedCount = 0;
    order.forEach(function (key) {
      var rows = groups[key];
      var qtySet = {}; rows.forEach(function (r) { qtySet[r.quantity] = 1; });
      // representative for descriptive fields = stable-first row (earliest requiredByDate, then input index)
      var rep = rows.slice().sort(function (a, b) { return cmpStr(a.requiredByDate, b.requiredByDate) || (a._i - b._i); })[0];
      var isEvent = rep.demandType === 'SPECIAL_EVENT';
      var out = {
        demandKey: rep.demandKey, demandType: rep.demandType, masterSku: rep.masterSku, company: rep.company,
        country: rep.country, marketplace: rep.marketplace, destinationWarehouseId: rep.destinationWarehouseId,
        planningCycle: rep.planningCycle, requiredByDate: rep.requiredByDate, eventId: rep.eventId,
        effectiveDemandQty: 0, state: 'COUNTED', reason: null
      };
      if (Object.keys(qtySet).length > 1) {
        blockedCount++;
        out.effectiveDemandQty = 0;
        out.state = 'BLOCKED_CONFLICT';
        out.reason = isEvent ? 'DEMAND_EVENT_QTY_CONFLICT' : 'DEMAND_SOURCE_QTY_CONFLICT';
      } else {
        out.effectiveDemandQty = rep.quantity;
      }
      outEntries.push(out);
    });

    outEntries.sort(function (a, b) {
      return cmpStr(a.requiredByDate, b.requiredByDate) || cmpStr(a.demandType, b.demandType) || cmpStr(a.demandKey, b.demandKey);
    });

    var total = 0;
    outEntries.forEach(function (e) { if (e.state === 'COUNTED') total += e.effectiveDemandQty; });

    return { ledgerType: 'DEMAND_LEDGER', entries: outEntries, totalEffectiveDemandQty: total, blockedCount: blockedCount };
  }

  /**
   * buildSupplyLedger({ entries }) → immutable §25.2 Supply Ledger of physical pools.
   * Physical pool key = company + warehouseId + masterSku + poolType (Marketplace/site_sku excluded, §23.1/§39.6).
   * Count-once identity = supplyLineageRef (the stable physical-quantity identity):
   *   • same lineage in >1 (poolKey,bucket)      → SUPPLY_LINEAGE_CONFLICT (lifecycle integrity, §30/#17)
   *   • same lineage, one (poolKey,bucket), diff qty → PHYSICAL_POOL_QTY_CONFLICT (snapshot integrity, #32)
   *   • distinct lineages in one (poolKey,bucket)  → summed (distinct physical quantities)
   * effectiveSupplyQty sums NON-excluded buckets only; a pool touched by any conflict is fail-closed BLOCKED (0).
   * `remainingUnconsumedQty` is NOT emitted (allocator-owned, §39.7).
   */
  function buildSupplyLedger(input) {
    var root = requireObject(input, 'input');
    var entries = requireArray(root.entries, 'input.entries');

    var normalized = entries.map(function (e, i) {
      var ctx = 'input.entries[' + i + ']';
      requireObject(e, ctx);
      var supplyLineageRef = requireNonEmptyString(e.supplyLineageRef, ctx + '.supplyLineageRef');
      var masterSku = requireNonEmptyString(e.masterSku, ctx + '.masterSku');
      var company = requireNonEmptyString(e.company, ctx + '.company');
      var warehouseId = requireNonEmptyString(e.warehouseId, ctx + '.warehouseId');
      var poolType = requireEnum(e.poolType, POOL_TYPES, ctx + '.poolType');
      var lifecycleBucket = requireEnum(e.lifecycleBucket, LIFECYCLE_BUCKETS, ctx + '.lifecycleBucket');
      var quantity = requireQty(e.quantity, ctx + '.quantity');
      var poolKey = [company, warehouseId, masterSku, poolType].join('|');
      return {
        supplyLineageRef: supplyLineageRef, masterSku: masterSku, company: company, warehouseId: warehouseId,
        poolType: poolType, lifecycleBucket: lifecycleBucket, quantity: quantity, poolKey: poolKey, _i: i
      };
    });

    // 1. exact-duplicate removal (same lineage + pool + bucket + quantity → one)
    var seenExact = {}; var deduped = [];
    normalized.forEach(function (n) {
      var sig = [n.supplyLineageRef, n.poolKey, n.lifecycleBucket, n.quantity].join(SEP);
      if (!seenExact[sig]) { seenExact[sig] = 1; deduped.push(n); }
    });

    // 2. lineage-level resolution (count-once identity = supplyLineageRef)
    var lineGroups = {}; var lineOrder = [];
    deduped.forEach(function (n) {
      if (!lineGroups[n.supplyLineageRef]) { lineGroups[n.supplyLineageRef] = []; lineOrder.push(n.supplyLineageRef); }
      lineGroups[n.supplyLineageRef].push(n);
    });
    var lineageRes = {};
    lineOrder.forEach(function (ref) {
      var rows = lineGroups[ref];
      var pbSet = {}; var pbOrder = []; var qtySet = {}; var touchedSet = {}; var touched = [];
      rows.forEach(function (r) {
        var pb = r.poolKey + SEP + r.lifecycleBucket;
        if (!pbSet[pb]) { pbSet[pb] = r; pbOrder.push(pb); }
        qtySet[r.quantity] = 1;
        if (!touchedSet[r.poolKey]) { touchedSet[r.poolKey] = 1; touched.push(r.poolKey); }
      });
      if (pbOrder.length > 1) {
        lineageRes[ref] = { status: 'BLOCKED', reason: 'SUPPLY_LINEAGE_CONFLICT', touched: touched };
      } else if (Object.keys(qtySet).length > 1) {
        lineageRes[ref] = { status: 'BLOCKED', reason: 'PHYSICAL_POOL_QTY_CONFLICT', touched: touched };
      } else {
        var one = pbSet[pbOrder[0]];
        lineageRes[ref] = { status: 'COUNTED', poolKey: one.poolKey, bucket: one.lifecycleBucket, quantity: one.quantity, touched: touched };
      }
    });

    // 3. assemble pools (fail-closed: a pool touched by any blocked lineage is BLOCKED_CONFLICT)
    var poolMeta = {}; var poolOrder = [];
    deduped.forEach(function (n) { if (!poolMeta[n.poolKey]) { poolMeta[n.poolKey] = n; poolOrder.push(n.poolKey); } });

    var pools = []; var blockedCount = 0;
    poolOrder.forEach(function (pk) {
      var meta = poolMeta[pk];
      var counted = []; var blockedReasons = []; var refSet = {}; var refs = [];
      lineOrder.forEach(function (ref) {
        var res = lineageRes[ref];
        if (res.touched.indexOf(pk) === -1) return;
        if (!refSet[ref]) { refSet[ref] = 1; refs.push(ref); }
        if (res.status === 'BLOCKED') blockedReasons.push(res.reason);
        else counted.push(res);
      });
      refs.sort(cmpStr);
      var base = { poolKey: pk, company: meta.company, warehouseId: meta.warehouseId, masterSku: meta.masterSku, poolType: meta.poolType };
      if (blockedReasons.length) {
        blockedCount++;
        base.byLifecycleBucket = {};
        base.effectiveSupplyQty = 0;
        base.lineageRefs = refs;
        base.state = 'BLOCKED_CONFLICT';
        base.reason = blockedReasons.indexOf('SUPPLY_LINEAGE_CONFLICT') !== -1 ? 'SUPPLY_LINEAGE_CONFLICT' : 'PHYSICAL_POOL_QTY_CONFLICT';
      } else {
        var byBucket = {}; var eff = 0;
        counted.forEach(function (c) { byBucket[c.bucket] = (byBucket[c.bucket] || 0) + c.quantity; });
        Object.keys(byBucket).forEach(function (b) { if (ACTIVE_BUCKETS[b] === 1) eff += byBucket[b]; });
        base.byLifecycleBucket = byBucket;
        base.effectiveSupplyQty = eff;
        base.lineageRefs = refs;
        base.state = 'COUNTED';
        base.reason = null;
      }
      pools.push(base);
    });

    pools.sort(function (a, b) { return cmpStr(a.poolKey, b.poolKey); });

    var total = 0;
    pools.forEach(function (p) { if (p.state === 'COUNTED') total += p.effectiveSupplyQty; });

    return { ledgerType: 'SUPPLY_LEDGER', pools: pools, totalEffectiveSupplyQty: total, blockedCount: blockedCount };
  }

  return { buildDemandLedger: buildDemandLedger, buildSupplyLedger: buildSupplyLedger };
});
