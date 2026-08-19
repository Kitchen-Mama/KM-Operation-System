// Kitchen Mama Operation System — WEEKLY AI PLAN backend fact assembler (F1-7N-D0-B).
// -----------------------------------------------------------------------------
// The SMALLEST bounded, PURE adapter that turns already-resolved canonical planning facts into the EXACT input DTO
// consumed by the frozen F1-7N-B builder `buildWeeklySourceAllocation(...)`. It realizes the USER-frozen §35A.7 /
// WA-9 authority (F1-7N-D0-A) as runtime code:
//   • cumulative horizon shortage → INCREMENTAL need   incremental(n)=max(0, cum(n) − runningMax(cum(1..n−1)))
//   • 18-day SURVIVAL applied ONCE per (sku+destination) lane — full on the earliest incremental>0 window, else 0
//   • §7 site demandWeight CONSERVED across windows       Σ(window weight) == canonical site weight (∝ incremental)
//   • canonical demandKey = {sku}|{destinationWarehouseId}|{windowCode}  — identical on facts/receivers/demands
//   • factory identity resolved by EXACT warehouse_id only (CN_YOUXIN / TW_SHENGYI) — fail-closed, never inferred
//
// It RE-DERIVES NO business formula: the Gap/horizon shortage, the canonical survivalNeedQty (ceil(18×dailyDemand)),
// the §7 demandWeight, fulfillmentModel, eligiblePoolTypes, supply pools, UPC and source_data_as_of are all INPUTS
// resolved upstream by the existing canonical owners (42_ recommendation-workspace horizons · gapOpReadSupplyPoolFacts_ ·
// KMAF.projectAllocationFacts / KMSF.projectAllocationInputs · sku_details/recGenUpcBySku_ · maxAsOf). This module only
// PROJECTS/CONSERVES/KEYS/VALIDATES them into the B DTO. It is PURE: no I/O, no clock/random, no DB/Sheet, no
// PropertiesService/CacheService, no persistence, no reservation, no Request/PO — inputs are never mutated. It emits
// NO carrier/rate/lead-time/ETA/cost. The Apps Script I/O shell that harvests the canonical facts and pipes
// assembleWeeklySourceAllocationInput → buildWeeklySourceAllocation → (later) persistWeeklyRecommendationDraft is the
// NEXT runtime slice (F1-7N-D) — NOT this round.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyInputAssembler = api; }
})(this, function () {
  'use strict';

  var WINDOW_ORDER = ['D18', 'D30', 'D45', 'D90'];   // frozen horizon order (§35A.7); NOT re-derived here
  var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';
  var LINEKEY_SEP = '|';                             // internal dedup-key separator (printable; NOT a NUL byte)

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function aType(c, m) { if (!c) throw new TypeError('weeklyInputAssembler: ' + m); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function nonEmpty(v) { return str(v).length > 0; }
  function isTrue(v) { return v === true || v === 'TRUE' || v === 'true'; }
  function num0(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function shallowClone(o) { var n = {}; for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) n[k] = o[k]; return n; }

  // §35A.7 canonical demandKey — the ONE weekly demand identity used everywhere.
  function weeklyDemandKey(sku, destinationWarehouseId, windowCode) {
    return [str(sku), str(destinationWarehouseId), str(windowCode)].join('|');
  }

  // §35A.7 cumulative → incremental projection. incremental(n) = max(0, cum(n) − runningMax(cum(1..n−1))).
  function incrementalNeeds(cumulative) {
    var out = [], runMax = 0;
    for (var i = 0; i < cumulative.length; i++) {
      var g = Math.max(0, num0(cumulative[i]));
      out.push(Math.max(0, g - runMax));
      if (g > runMax) runMax = g;
    }
    return out;
  }

  // §35A.7 factory identity — EXACT full warehouse_id match ONLY (never country/company/name/code/token).
  function resolveWeeklyFactoryIdentity(warehouseId, config) {
    var wh = str(warehouseId);
    if (config && str(config.CN_YOUXIN) === wh && wh !== '') return 'CN_YOUXIN';
    if (config && str(config.TW_SHENGYI) === wh && wh !== '') return 'TW_SHENGYI';
    return 'UNKNOWN';
  }

  // Fail-closed validation of the configured factory identity rows against the warehouses master.
  function validateFactoryConfig(config, warehousesById) {
    aType(isObj(config), 'factoryIdentityConfig required');
    var whById = warehousesById || {};
    var idents = ['CN_YOUXIN', 'TW_SHENGYI'], wids = {};
    for (var i = 0; i < idents.length; i++) {
      var ident = idents[i], wid = str(config[ident]);
      if (!nonEmpty(wid)) return { ok: false, reason: 'FACTORY_IDENTITY_UNCONFIGURED:' + ident };
      if (wids[wid]) return { ok: false, reason: 'FACTORY_IDENTITY_OVERLAP:' + wid };
      wids[wid] = ident;
      var row = whById[wid];
      if (!row) return { ok: false, reason: 'FACTORY_WAREHOUSE_MISSING:' + wid };
      if (str(row.warehouse_type) !== 'FACTORY') return { ok: false, reason: 'FACTORY_WAREHOUSE_NOT_FACTORY_TYPE:' + wid };
      if (!isTrue(row.is_factory_warehouse)) return { ok: false, reason: 'FACTORY_WAREHOUSE_FLAG_FALSE:' + wid };
      if (!isTrue(row.is_active)) return { ok: false, reason: 'FACTORY_WAREHOUSE_INACTIVE:' + wid };
    }
    return { ok: true };
  }

  // assembleWeeklySourceAllocationInput(input) — build the F1-7N-B DTO for ONE masterSku scope.
  //
  // input = {
  //   planningCycle, businessScope, masterSku,
  //   formulaVersion?,                        // default WEEKLY_AI_PLAN_V1
  //   sourceDataAsOf?,                        // canonical maxAsOf(...) — carried verbatim, never a clock
  //   factoryIdentityConfig: { CN_YOUXIN: warehouse_id, TW_SHENGYI: warehouse_id },
  //   warehousesById: { [warehouse_id]: { warehouse_type, is_factory_warehouse, is_active, ... } },
  //   overseasSupplyPools: [ { poolKey, poolType, warehouseId, effectiveSupplyQty } ],   // gapOpReadSupplyPoolFacts_
  //   factoryPools:        [ { poolKey, poolType:'FACTORY', warehouseId, effectiveSupplyQty } ],
  //   lanes: [ {                                 // one per sku(+siteSku)+destinationWarehouseId; canonical facts resolved
  //     sku?, siteSku, destinationWarehouseId, marketplace, company, country,
  //     cumulativeGapByWindow: { D18, D30, D45, D90 },   // horizons[].gapQty (canonical; unchanged)
  //     requiredByByWindow?:   { D18, D30, D45, D90 },
  //     unitsPerCarton,                                  // sku_details (invalid → B blocks the line)
  //     survivalNeedQty,        // ceil(18×canonicalDailyDemand)  — KMSF/KMCALC authority (site lane)
  //     demandWeight,           // §7 canonical site share        — KMAF authority
  //     fulfillmentModel,       // marketplace_skus                — KMSF resolveSource
  //     eligiblePoolTypes,      // §24 / KMAF._eligiblePoolTypesFor
  //     allocationPriority
  //   } ]
  // }
  //
  // Returns { ready, issues, builderInput, cumulativeByLane }. ready=false (builderInput=null) only on a HARD
  // fail-closed condition (invalid factory identity config). Lanes with no active incremental demand, or with a
  // missing destination, are excluded with an issue token (non-fatal for the other lanes).
  function assembleWeeklySourceAllocationInput(input) {
    aType(isObj(input), 'input must be an object');
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
    aType(isObj(input.businessScope), 'businessScope required');
    var masterSku = str(input.masterSku);
    aType(nonEmpty(masterSku), 'masterSku required');
    aType(Array.isArray(input.lanes), 'lanes must be an array');

    var issues = [];
    var formulaVersion = nonEmpty(input.formulaVersion) ? str(input.formulaVersion) : DEFAULT_FORMULA_VERSION;
    var sourceDataAsOf = input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf;

    // ---- Factory identity: fail-closed validation (HARD block) --------------------------------------------------
    var cfg = input.factoryIdentityConfig;
    var fv = validateFactoryConfig(cfg, input.warehousesById);
    if (!fv.ok) {
      return { ready: false, issues: [{ kind: 'FACTORY_IDENTITY', reason: fv.reason }], builderInput: null, cumulativeByLane: [] };
    }
    var cnId = str(cfg.CN_YOUXIN), twId = str(cfg.TW_SHENGYI);
    var eligibleFactoryWarehouseIds = [cnId, twId].sort();

    // Only the two CONFIGURED factory pools may be sourced. Any pool on an unclassified factory warehouse is EXCLUDED
    // (never silently classified) — recorded as an informational issue, not fabricated and not consumed.
    var cnPools = [], twPools = [];
    (input.factoryPools || []).forEach(function (p) {
      var id = resolveWeeklyFactoryIdentity(p.warehouseId, cfg);
      if (id === 'CN_YOUXIN') cnPools.push(shallowClone(p));
      else if (id === 'TW_SHENGYI') twPools.push(shallowClone(p));
      else issues.push({ kind: 'SUPPLY', key: str(p.poolKey), reason: 'UNCONFIGURED_FACTORY_POOL_EXCLUDED:' + str(p.warehouseId) });
    });
    // Represent BOTH configured factory identities as a pool ROW so F1-7N-B's sequential CN→TW residual chain is
    // well-formed even when a factory has no eligible stock. A zero-quantity placeholder contributes NO supply (never
    // fabricated) and mirrors the canonical "CN pool qty 0 → TW fills the residual" representation; without a CN pool
    // row the frozen builder cannot forward the residual to the TW pass.
    if (cnPools.length === 0) cnPools.push({ poolKey: 'FC:' + cnId, poolType: 'FACTORY', warehouseId: cnId, effectiveSupplyQty: 0 });
    if (twPools.length === 0) twPools.push({ poolKey: 'FC:' + twId, poolType: 'FACTORY', warehouseId: twId, effectiveSupplyQty: 0 });
    var factoryPools = cnPools.concat(twPools);
    var overseasSupplyPools = (input.overseasSupplyPools || []).map(shallowClone);

    // ---- Per-lane projection: cumulative → incremental; survival-once; weight conservation; demandKey ------------
    var receivers = [], demands = [], weeklyPlanningFacts = [], cumulativeByLane = [], seenLineKey = {};
    for (var li = 0; li < input.lanes.length; li++) {
      var lane = input.lanes[li];
      aType(isObj(lane), 'lanes[' + li + '] must be an object');
      var laneSku = nonEmpty(lane.sku) ? str(lane.sku) : masterSku;
      var siteSku = str(lane.siteSku);
      var dest = str(lane.destinationWarehouseId);
      var cumByWin = lane.cumulativeGapByWindow || {};
      var reqBy = lane.requiredByByWindow || {};

      var cum = WINDOW_ORDER.map(function (w) { return Math.max(0, num0(cumByWin[w])); });
      var inc = incrementalNeeds(cum);
      cumulativeByLane.push({ siteSku: siteSku, destinationWarehouseId: dest, cumulative: cum, incremental: inc });

      var activeIdx = [];
      for (var wi = 0; wi < WINDOW_ORDER.length; wi++) { if (inc[wi] > 0) activeIdx.push(wi); }
      if (activeIdx.length === 0) { continue; } // no incremental demand this lane — nothing to ship

      // Missing destination → cannot physically ship: fail-closed (exclude, issue). Never allocate to an unknown dest.
      if (!nonEmpty(dest)) { issues.push({ kind: 'DEMAND', key: laneSku + '|' + siteSku, reason: 'MISSING_DESTINATION_WAREHOUSE' }); continue; }

      var earliest = activeIdx[0];
      var totalInc = 0; activeIdx.forEach(function (i) { totalInc += inc[i]; });
      var canonicalWeight = num0(lane.demandWeight);
      var laneSurvival = num0(lane.survivalNeedQty);
      var priority = num0(lane.allocationPriority);
      var eligiblePoolTypes = Array.isArray(lane.eligiblePoolTypes) ? lane.eligiblePoolTypes.slice() : [];

      for (var a = 0; a < activeIdx.length; a++) {
        var idx = activeIdx[a];
        var windowCode = WINDOW_ORDER[idx];
        var demandQty = inc[idx];
        var demandKey = weeklyDemandKey(laneSku, dest, windowCode);
        // Weekly resolver line identity = sku|siteSku|windowCode (must be unique) — fail-closed on collision.
        var lk = [laneSku, siteSku, windowCode].join(LINEKEY_SEP);
        if (seenLineKey[lk]) { issues.push({ kind: 'DEMAND', key: demandKey, reason: 'DUPLICATE_WEEKLY_LINE_KEY' }); continue; }
        seenLineKey[lk] = 1;

        var survivalNeedQty = (idx === earliest) ? laneSurvival : 0;   // §35A.7 survival-once
        var demandWeight = totalInc > 0 ? (canonicalWeight * demandQty / totalInc) : 0; // §35A.7 weight conservation

        receivers.push({
          receiverKey: 'WR|' + demandKey, demandKey: demandKey, marketplace: str(lane.marketplace),
          destinationWarehouseId: dest, fulfillmentModel: str(lane.fulfillmentModel),
          demandQty: demandQty, survivalNeedQty: survivalNeedQty, allocationPriority: priority,
          demandWeight: demandWeight, eligiblePoolTypes: eligiblePoolTypes.slice()
        });
        demands.push({
          demandKey: demandKey, company: str(lane.company), marketplace: str(lane.marketplace),
          destinationWarehouseId: dest, requiredByDate: str(reqBy[windowCode]), allocationPriority: priority,
          demandQty: demandQty, eligibleFactoryWarehouseIds: eligibleFactoryWarehouseIds.slice()
        });
        weeklyPlanningFacts.push({
          recommendationType: 'WEEKLY_SHIPPING', sku: laneSku, siteSku: siteSku, windowCode: windowCode,
          marketplace: str(lane.marketplace),  // carried so a (company,country) batch run can fan lines out per K3 marketplace
          demandKey: demandKey, destinationWarehouseId: dest, requiredByDate: str(reqBy[windowCode]),
          calculatedGap: demandQty,            // §35A.7 DTO alias at the B boundary: calculatedGap := incrementalNeedQty
          cumulativeGapQty: cum[idx],          // canonical cumulative preserved (resolver ignores it)
          unitsPerCarton: lane.unitsPerCarton, // invalid/missing → B resolver blocks the line (never defaulted)
          allocationPriority: priority
        });
      }
    }

    var overseasInput = {
      company: str(input.businessScope.company), country: str(input.businessScope.country),
      masterSku: masterSku, supplyPools: overseasSupplyPools, receivers: receivers
    };
    var factory = {
      factoryPools: factoryPools, demands: demands,
      cnYouxinWarehouseIds: [cnId], twShengyiWarehouseIds: [twId]
    };

    var builderInput = {
      planningCycle: str(input.planningCycle), businessScope: input.businessScope, masterSku: masterSku,
      formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf,
      overseasInput: overseasInput, factory: factory, weeklyPlanningFacts: weeklyPlanningFacts
    };

    issues.sort(function (x, y) {
      return (x.kind < y.kind ? -1 : x.kind > y.kind ? 1 : 0) || (x.key < y.key ? -1 : x.key > y.key ? 1 : 0) || (x.reason < y.reason ? -1 : x.reason > y.reason ? 1 : 0);
    });
    return { ready: true, issues: issues, builderInput: builderInput, cumulativeByLane: cumulativeByLane };
  }

  return {
    assembleWeeklySourceAllocationInput: assembleWeeklySourceAllocationInput,
    resolveWeeklyFactoryIdentity: resolveWeeklyFactoryIdentity,
    validateFactoryConfig: validateFactoryConfig,
    incrementalNeeds: incrementalNeeds,
    weeklyDemandKey: weeklyDemandKey,
    WINDOW_ORDER: WINDOW_ORDER.slice(),
    _version: 'f1-7n-d0-b-r1'
  };
});
