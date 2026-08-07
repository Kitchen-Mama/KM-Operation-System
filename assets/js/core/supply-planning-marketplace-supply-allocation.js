// Kitchen Mama Operation System — MARKETPLACE-receiver monthly supply-allocation ADAPTER (F1-4B-FM5-R2A).
// -----------------------------------------------------------------------------
// The FROZEN "marketplace receiver allocation contract" (model b). It lets a platform_fulfilled MARKETPLACE be a
// MONTHLY_ORDER demand receiver of the eligible Overseas / Factory shared pools — WITHOUT a destination warehouse
// and WITHOUT any allocation arithmetic of its own. It is a thin DTO adapter: it normalizes marketplace receiver
// facts + caller-supplied (lineage-net) pools into the EXISTING frozen allocator DTOs, invokes KMALLOC, and reads
// each receiver's allocated quantity back. ALL distribution math (survival/weight/largest-remainder/FIFO/lane
// separation/conservation) stays in KMALLOC.allocateOverseasSharedPool / allocateFactoryDeterministic (§20/§24/§35).
//
// FROZEN DECISIONS (D-F1-4B-FM5-R2A):
//   1. Receiver identity = company/country/marketplace/sku. The allocator-required `destinationWarehouseId` field
//      carries the canonical RECEIVER KEY (an identity label) — NEVER a physical warehouse and NEVER a
//      marketplace→warehouse mapping (§3/§18). It is only echoed back as an output label.
//   2. MONTHLY protection mapping: survivalNeedQty defaults 0 (18-day survival protection is a WEEKLY concept, not
//      monthly order planning) and demandWeight defaults to demandQty (proportional split). A caller MAY override
//      both when a frozen value exists — the adapter passes them through unchanged.
//   3. Waterfall order (frozen FM3f-1: Destination Stock → Qualified Incoming → Overseas → Factory → Residual):
//      overseas is allocated first; the factory demand for each receiver = max(0, demandQty − allocatedOverseas).
//      This is demand-input normalization (which layer is asked to cover what), NOT allocation math.
//   4. Company isolation: every receiver + pool in one call MUST share the company (cross-company → BLOCKED); no
//      cross-company pooling (§6). The caller partitions the competing receiver set by company + sku + pool.
//   5. eligiblePoolTypes defaults to [THREE_PL, FBA]; a caller may restrict per frozen eligibility.
//   6. Country identity uses the canonical KMCID owner (UK ≡ GB) when composing receiver keys / grouping.
//
// Lineage / no-double-count (§2): the caller supplies pools that are ALREADY lineage-net (quantities transitioned
// to SHIPPED_IN_TRANSIT are excluded upstream via the canonical source-fact lifecycle); the adapter never re-derives
// duplication by qty guessing. PURE / deterministic: no clock, RNG, I/O, or mutation.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-allocations.js') : (root.KMALLOC || (root.KM && root.KM.allocations)),
    req ? req('./supply-planning-country-identity.js') : (root.KMCID || (root.KM && root.KM.countryIdentity))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.marketplaceSupplyAllocation = api; }
  if (typeof root !== 'undefined' && root) { root.KMMSA = api; }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ALLOC, CID) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function qty(v) { var n = Number(v); return (typeof v === 'number' && isFinite(n) && n >= 0) ? n : null; }
  function canonCountry(v) { return (CID && typeof CID.canonicalCountryCode === 'function') ? CID.canonicalCountryCode(v) : s(v).toUpperCase(); }

  // Canonical receiver key = company | canonicalCountry | marketplace | sku (identity label; NOT a warehouse).
  function receiverKeyOf(r) { return [s(r.company), canonCountry(r.country), s(r.marketplace), s(r.sku || r.masterSku)].join('||'); }

  // allocateMarketplaceReceiverSupply(input) → per-receiver allocated overseas + factory (reuses KMALLOC only).
  //   input = { company, masterSku,
  //             overseasPools: [{ poolKey, poolType:'FBA'|'THREE_PL', warehouseId, effectiveSupplyQty }],  // lineage-net
  //             factoryPools:  [{ poolKey, warehouseId, effectiveSupplyQty }],                              // lineage-net
  //             eligibleFactoryWarehouseIds: [ ... ],
  //             receivers: [{ company, country, marketplace, sku, demandQty, allocationPriority, requiredByDate,
  //                           survivalNeedQty?, demandWeight?, eligiblePoolTypes? }] }
  function allocateMarketplaceReceiverSupply(input) {
    var root = input || {};
    var issues = [];
    var company = s(root.company);
    var masterSku = s(root.masterSku);
    if (!company) return blocked('COMPANY_REQUIRED', 'input.company required');
    if (!masterSku) return blocked('MASTER_SKU_REQUIRED', 'input.masterSku required');
    var receivers = Array.isArray(root.receivers) ? root.receivers : [];
    if (!receivers.length) return blocked('NO_RECEIVERS', 'at least one marketplace receiver required');

    // §6 company isolation — every receiver must belong to this company (no cross-company pooling).
    for (var ci = 0; ci < receivers.length; ci++) {
      if (s(receivers[ci].company) !== company) return blocked('CROSS_COMPANY_POOL_FORBIDDEN', 'receiver company mismatch: ' + s(receivers[ci].company) + ' != ' + company);
    }

    // ---- normalize receivers → deterministic keys (dedup guard) ----
    var norm = [], keySeen = {};
    for (var i = 0; i < receivers.length; i++) {
      var r = receivers[i] || {};
      var d = qty(r.demandQty);
      if (d === null) return blocked('RECEIVER_DEMAND_INVALID', 'demandQty missing/invalid for ' + s(r.marketplace));
      var pr = qty(r.allocationPriority); if (pr === null) pr = 0;
      var key = receiverKeyOf(Object.assign({ masterSku: masterSku }, r));
      if (keySeen[key]) return blocked('RECEIVER_IDENTITY_CONFLICT', 'duplicate receiver ' + key);
      keySeen[key] = 1;
      norm.push({ key: key, company: company, country: s(r.country), marketplace: s(r.marketplace), sku: s(r.sku) || masterSku,
        demandQty: d, allocationPriority: pr, requiredByDate: s(r.requiredByDate),
        survivalNeedQty: (qty(r.survivalNeedQty) === null ? 0 : qty(r.survivalNeedQty)),   // MONTHLY default 0 (decision 2)
        demandWeight: (qty(r.demandWeight) === null ? d : qty(r.demandWeight)),            // MONTHLY default = demandQty
        eligiblePoolTypes: (Array.isArray(r.eligiblePoolTypes) && r.eligiblePoolTypes.length) ? r.eligiblePoolTypes.slice() : ['THREE_PL', 'FBA'] });
    }

    var byReceiver = {};
    norm.forEach(function (r) { byReceiver[r.key] = { allocatedOverseasQty: 0, allocatedFactoryQty: 0 }; });

    // ---- OVERSEAS (KMALLOC.allocateOverseasSharedPool) ----
    var overseasResult = null;
    var overseasPools = Array.isArray(root.overseasPools) ? root.overseasPools : [];
    if (overseasPools.length) {
      var ovReceivers = norm.map(function (r) {
        return { receiverKey: r.key, demandKey: r.key, marketplace: r.marketplace || r.key, destinationWarehouseId: r.key /* receiver-identity label, NEVER a warehouse */,
          fulfillmentModel: 'platform_fulfilled', demandQty: r.demandQty, survivalNeedQty: Math.min(r.survivalNeedQty, r.demandQty),
          allocationPriority: r.allocationPriority, demandWeight: r.demandWeight, eligiblePoolTypes: r.eligiblePoolTypes };
      });
      try {
        overseasResult = ALLOC.allocateOverseasSharedPool({ company: company, country: canonCountry(norm[0].country) || 'NA', masterSku: masterSku,
          supplyPools: overseasPools.map(function (p, idx) { return { poolKey: s(p.poolKey) || ('OV' + idx), poolType: s(p.poolType), warehouseId: s(p.warehouseId) || ('OVW' + idx), effectiveSupplyQty: qty(p.effectiveSupplyQty) || 0 }; }),
          receivers: ovReceivers });
      } catch (e) { return blocked('OVERSEAS_ALLOCATION_INPUT_INVALID', e && e.message ? String(e.message) : String(e)); }
      (overseasResult.allocations || []).forEach(function (a) { if (byReceiver[a.demandKey]) byReceiver[a.demandKey].allocatedOverseasQty += (a.allocatedQty || 0); });
    }

    // ---- FACTORY (KMALLOC.allocateFactoryDeterministic) — demand = residual after overseas (waterfall, decision 3) ----
    var factoryResult = null;
    var factoryPools = Array.isArray(root.factoryPools) ? root.factoryPools : [];
    var eligibleFactoryIds = Array.isArray(root.eligibleFactoryWarehouseIds) ? root.eligibleFactoryWarehouseIds.map(s).filter(Boolean) : [];
    if (factoryPools.length) {
      if (!eligibleFactoryIds.length) return blocked('FACTORY_ELIGIBILITY_UNRESOLVED', 'eligibleFactoryWarehouseIds required for factory allocation');
      var factoryDemands = [];
      for (var fi = 0; fi < norm.length; fi++) {
        var fr = norm[fi];
        var residual = Math.max(0, fr.demandQty - byReceiver[fr.key].allocatedOverseasQty);
        if (!fr.requiredByDate) return blocked('MISSING_REQUIRED_BY_DATE', 'requiredByDate required for factory FIFO on ' + fr.marketplace);
        factoryDemands.push({ demandKey: fr.key, company: company, marketplace: fr.marketplace || fr.key, destinationWarehouseId: fr.key /* identity label */,
          requiredByDate: fr.requiredByDate, allocationPriority: fr.allocationPriority, demandQty: residual, eligibleFactoryWarehouseIds: eligibleFactoryIds.slice() });
      }
      try {
        factoryResult = ALLOC.allocateFactoryDeterministic({ masterSku: masterSku,
          factoryPools: factoryPools.map(function (p, idx) { return { poolKey: s(p.poolKey) || ('FC' + idx), poolType: 'FACTORY', warehouseId: s(p.warehouseId) || ('FCW' + idx), effectiveSupplyQty: qty(p.effectiveSupplyQty) || 0 }; }),
          demands: factoryDemands });
      } catch (e2) { return blocked('FACTORY_ALLOCATION_INPUT_INVALID', e2 && e2.message ? String(e2.message) : String(e2)); }
      (factoryResult.allocations || []).forEach(function (a) { if (byReceiver[a.demandKey]) byReceiver[a.demandKey].allocatedFactoryQty += (a.allocatedQty || 0); });
    }

    return { ready: true, company: company, masterSku: masterSku, byReceiver: byReceiver,
      overseas: overseasResult, factory: factoryResult, issues: issues, blocked: false, VERSION: 'kmmsa-fm5r2a-1' };

    function blocked(code, message) {
      return { ready: false, blocked: true, byReceiver: {}, overseas: null, factory: null, issues: [{ code: code, message: message || code }], VERSION: 'kmmsa-fm5r2a-1' };
    }
  }

  return { allocateMarketplaceReceiverSupply: allocateMarketplaceReceiverSupply, receiverKeyOf: receiverKeyOf, VERSION: 'kmmsa-fm5r2a-1' };
});
