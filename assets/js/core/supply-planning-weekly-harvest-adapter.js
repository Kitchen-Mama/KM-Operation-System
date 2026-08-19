// Kitchen Mama Operation System — WEEKLY AI PLAN harvest→batch-request adapter (F1-7N-D-2b).
// -----------------------------------------------------------------------------
// PURE join/mapping brain for the D-2b Apps Script harvest owner. It turns the RAW canonical facts the .gs shell
// fetches — the result of ONE multi-site KMAF.projectAllocationFacts call (per-site §7 demandWeight, FORECAST_DRIVEN),
// per-site horizons, per-SKU supply pools, factory-identity config — into the exact `request` the (company,country)
// BATCH owner KMWRB.generateWeeklyShippingRecommendationBatch(request, deps) consumes.
//
//   ONE KMAF call across the WHOLE (company,country) universe → receiverFacts (Σ demandWeight == 1) + planningFacts
//   → join receiverFact ↔ planningFact by demandRef (receiverFact carries NO sku; planningFact does)
//   → per site: demandWeight (KMAF §7 site share, verbatim), survivalNeedQty = ceil(18 × dailyDemand) [frozen 18],
//               horizons cumulativeGapByWindow / requiredByByWindow (from the workspace, per site), unitsPerCarton
//   → group lanes by masterSku (+ that SKU's overseas/factory pools) → KMWRB request
//
// It RE-DERIVES NO business value: demandWeight is KMAF's §7 forecast-share output consumed verbatim; survivalNeedQty
// reuses the frozen ceil(18×dailyDemand); the window split + shared-pool allocation happen downstream in KMWIA/B. It
// is PURE: no I/O, no clock/random, no DB/Sheet, inputs never mutated. Fail-closed: if the single KMAF call is not
// ready (any receiver issue → the whole universe is ready:false, no partial success), the request is refused.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyHarvestAdapter = api; }
})(this, function () {
  'use strict';

  var SURVIVAL_HORIZON_DAYS = 18;                 // §20.3/§24.4 frozen survival horizon (reused, not re-invented)
  var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function aType(c, m) { if (!c) throw new TypeError('weeklyHarvestAdapter: ' + m); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function nonEmpty(v) { return str(v).length > 0; }
  function num(v) { var n = Number(v); return isFinite(n) ? n : null; }

  // mapWeeklyHarvestToBatchRequest(harvest) → { ready, issues, request }
  //   harvest = {
  //     planningCycle, businessScope:{company,country,source_page}, mode?, confirmRegenerateOverUserEdits?, actor?, now?,
  //     sourceDataAsOf?, formulaVersion?, factoryIdentityConfig, warehousesById,
  //     kmaf: { ready, issues?, receiverFacts:[ {demandRef, marketplace, destinationWarehouseId, fulfillmentModel,
  //                                              dailyDemand, allocationPriority, demandWeight, eligiblePoolTypes} ],
  //             planningFacts:[ {demandRef, sku, siteSku, unitsPerCarton} ] },     // ONE multi-site §7 call
  //     horizonsByDemandRef: { [demandRef]: { cumulativeGapByWindow:{D18,D30,D45,D90}, requiredByByWindow? } },
  //     poolsBySku: { [sku]: { overseasSupplyPools:[], factoryPools:[] } }
  //   }
  function mapWeeklyHarvestToBatchRequest(harvest) {
    aType(isObj(harvest), 'harvest must be an object');
    var scope = isObj(harvest.businessScope) ? harvest.businessScope : {};
    var issues = [];
    var formulaVersion = nonEmpty(harvest.formulaVersion) ? str(harvest.formulaVersion) : DEFAULT_FORMULA_VERSION;
    var sourceDataAsOf = harvest.sourceDataAsOf === undefined ? null : harvest.sourceDataAsOf;

    var kmaf = harvest.kmaf;
    // Fail-closed: the single (company,country) §7 call is all-or-nothing (any receiver issue → ready:false). A
    // partial universe would corrupt the §7 denominator, so the whole batch is refused.
    if (!isObj(kmaf) || kmaf.ready === false || !Array.isArray(kmaf.receiverFacts)) {
      return { ready: false, issues: (isObj(kmaf) && Array.isArray(kmaf.issues) ? kmaf.issues.slice() : [{ kind: 'KMAF', reason: 'KMAF_NOT_READY' }]), request: null };
    }

    // planningFacts index (recovers sku / siteSku / unitsPerCarton — absent on receiverFact) by demandRef.
    var pfByRef = {};
    (kmaf.planningFacts || []).forEach(function (pf) { if (nonEmpty(pf.demandRef)) pfByRef[str(pf.demandRef)] = pf; });

    var horizonsByRef = isObj(harvest.horizonsByDemandRef) ? harvest.horizonsByDemandRef : {};
    var poolsBySku = isObj(harvest.poolsBySku) ? harvest.poolsBySku : {};

    var bySku = {}, skuOrder = [];
    for (var i = 0; i < kmaf.receiverFacts.length; i++) {
      var rf = kmaf.receiverFacts[i];
      var ref = str(rf.demandRef);
      var pf = pfByRef[ref];
      if (!pf) { issues.push({ kind: 'JOIN', reason: 'RECEIVER_WITHOUT_PLANNING_FACT:' + ref }); continue; }
      var sku = nonEmpty(pf.masterSku) ? str(pf.masterSku) : str(pf.sku);
      var dest = str(rf.destinationWarehouseId);
      var mkt = str(rf.marketplace);
      var h = horizonsByRef[ref];
      // A site KMAF included but with no horizon shortage → no weekly demand for it; skip (not an error).
      if (!isObj(h) || !isObj(h.cumulativeGapByWindow)) { continue; }
      var dd = num(rf.dailyDemand);
      var survival = (dd === null) ? 0 : Math.ceil(SURVIVAL_HORIZON_DAYS * dd);   // frozen ceil(18×dailyDemand)

      var lane = {
        siteSku: str(pf.siteSku), destinationWarehouseId: dest, marketplace: mkt,
        company: str(scope.company), country: str(scope.country),
        cumulativeGapByWindow: h.cumulativeGapByWindow,
        requiredByByWindow: isObj(h.requiredByByWindow) ? h.requiredByByWindow : {},
        unitsPerCarton: pf.unitsPerCarton,
        survivalNeedQty: survival,
        demandWeight: num(rf.demandWeight) === null ? 0 : num(rf.demandWeight),   // §7 site share, verbatim from KMAF
        fulfillmentModel: str(rf.fulfillmentModel),
        eligiblePoolTypes: Array.isArray(rf.eligiblePoolTypes) ? rf.eligiblePoolTypes.slice() : [],
        allocationPriority: num(rf.allocationPriority) === null ? 0 : num(rf.allocationPriority)
      };
      if (!bySku[sku]) { bySku[sku] = []; skuOrder.push(sku); }
      bySku[sku].push(lane);
    }

    skuOrder.sort();
    var skus = skuOrder.map(function (sku) {
      var pools = isObj(poolsBySku[sku]) ? poolsBySku[sku] : {};
      return {
        masterSku: sku,
        overseasSupplyPools: Array.isArray(pools.overseasSupplyPools) ? pools.overseasSupplyPools : [],
        factoryPools: Array.isArray(pools.factoryPools) ? pools.factoryPools : [],
        lanes: bySku[sku]
      };
    });

    var request = {
      planningCycle: str(harvest.planningCycle),
      businessScope: { company: str(scope.company), country: str(scope.country), source_page: str(scope.source_page) },
      mode: harvest.mode, confirmRegenerateOverUserEdits: harvest.confirmRegenerateOverUserEdits === true,
      actor: harvest.actor, now: harvest.now,
      sourceDataAsOf: sourceDataAsOf, formulaVersion: formulaVersion,
      factoryIdentityConfig: harvest.factoryIdentityConfig, warehousesById: harvest.warehousesById,
      skus: skus
    };

    issues.sort(function (a, b) { return (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0); });
    return { ready: true, issues: issues, request: request };
  }

  return {
    mapWeeklyHarvestToBatchRequest: mapWeeklyHarvestToBatchRequest,
    SURVIVAL_HORIZON_DAYS: SURVIVAL_HORIZON_DAYS,
    _version: 'f1-7n-d-2b-r1'
  };
});
