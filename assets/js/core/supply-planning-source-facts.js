// Kitchen Mama Operation System — Production SOURCE-FACTS reader, CLEAN SLICE (Phase 2C, Round 1J).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC read-only bridge from canonical source rows → the frozen pure-runtime inputs, for the
// subset of the Source-Facts Reader contract whose derivation is UNAMBIGUOUSLY Canonically owned and safely
// test-verifiable now (Round 1J decomposition — the allocation-input projector + Weekly/Monthly recommendedQty
// assembly + Apps Script reader + locked-orchestrator integration are frozen in the §Source-Facts CONTRACT and
// deferred to the following implementation round).
//
// This module REUSES the frozen runtime — it never reimplements it:
//   • readiness  → supply-planning-calculations.js `classifyPlanningDataState` (§34A)
//   • demand     → supply-planning-ledgers.js `buildDemandLedger` (§39)
//   • supply     → supply-planning-ledgers.js `buildSupplyLedger` (§39)  [CURRENT_STOCK from inventory authority]
//   • incoming   → supply-planning-supply-candidates.js + supply-planning-incoming-adapters.js (B4-R3/R4)
//
// Invariants: read-only; JSON-safe; deterministic (no clock/random/locale); MISSING is never silently 0 (only an
// explicit source value of 0 yields 0); identity ambiguity BLOCKS (never first/latest); no persistence; never
// writes a decision value. No Sheet/Range objects.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations)),
    req ? req('./supply-planning-ledgers.js') : (root.KMLEDGER || (root.KM && root.KM.ledgers)),
    req ? req('./supply-planning-supply-candidates.js') : (root.KMCAND || (root.KM && root.KM.supplyCandidates)),
    req ? req('./supply-planning-incoming-adapters.js') : (root.KMINC || (root.KM && root.KM.incomingAdapters))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceFacts = api; }
})(this, function (CALC, LEDGER, CAND, INC) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function str(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function nonEmpty(v) { return str(v).length > 0; }
  // MISSING vs ZERO: return {qty:number, missing:bool}. Only an explicit finite value (incl. 0) is a quantity.
  function readQty(v) {
    if (v === undefined || v === null || v === '') return { qty: null, missing: true };
    var n = Number(v); if (!isFinite(n)) return { qty: null, missing: true, invalid: true };
    return { qty: n, missing: false };
  }

  // Readiness vocabulary (Round 1J §11). §34A owns OK/MISSING_SNAPSHOT/MISSING_FORECAST/MISSING_SALES_BASIS/
  // STALE_SNAPSHOT; identity/duplicate states are owned here (source-adapter layer).
  var READINESS_STATES = {
    OK: 1, STALE_SNAPSHOT: 1, MISSING_SNAPSHOT: 1, MISSING_FORECAST: 1, MISSING_SALES_BASIS: 1,
    IDENTITY_CONFLICT: 1, DUPLICATE_SOURCE: 1, BLOCKED_CONFLICT: 1, SOURCE_NOT_AVAILABLE: 1
  };
  var CURRENT_STOCK_POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };
  var DEMAND_TYPES = { REGULAR: 1, SALES_RUN_RATE: 1, SPECIAL_EVENT: 1, SAFETY: 1 };

  // ---- readiness (§34A reuse; never reimplemented) --------------------------
  function classifySourceReadiness(input) {
    aType(isObj(input), 'classifySourceReadiness: input must be an object');
    var r = CALC.classifyPlanningDataState(input);   // §34A frozen classifier
    return { ready: r.calculationAllowed === true, status: r.state, reason: r.state === 'OK' ? null : r.state };
  }

  // ---- identity resolution (deterministic; ambiguity BLOCKS) ----------------
  // input = { rawScope:{company,country,marketplace,sku}, marketplaceSkuRows:[], skuDetailRows:[],
  //           warehouseRows:[], destinationWarehouseId?, sourceWarehouseId? }
  function resolveSourceIdentity(input) {
    aType(isObj(input) && isObj(input.rawScope), 'resolveSourceIdentity: input.rawScope required');
    var q = input.rawScope, issues = [];
    var company = str(q.company), country = str(q.country), marketplace = str(q.marketplace), masterSku = str(q.sku);
    function block(status, reason) { return { status: status, reason: reason, identity: null, issues: issues.concat([reason]) }; }
    if (!nonEmpty(masterSku)) return block('BLOCKED_CONFLICT', 'MISSING_MASTER_SKU');
    if (!nonEmpty(company)) return block('BLOCKED_CONFLICT', 'MISSING_COMPANY');

    // master SKU existence (no display-name identity; exact id)
    var skuRows = (input.skuDetailRows || []).filter(function (r) { return str(r.sku) === masterSku; });
    if (skuRows.length === 0) return block('SOURCE_NOT_AVAILABLE', 'MASTER_SKU_NOT_FOUND:' + masterSku);
    if (skuRows.length > 1) return block('DUPLICATE_SOURCE', 'DUPLICATE_MASTER_SKU:' + masterSku);

    // marketplace SKU resolution: exactly one row for (company,country,marketplace,sku)
    var msRows = (input.marketplaceSkuRows || []).filter(function (r) {
      return str(r.company) === company && str(r.country) === country && str(r.marketplace) === marketplace && str(r.sku) === masterSku;
    });
    var marketplaceSkuId = null, siteSku = null, fulfillmentModel = null;
    if (msRows.length > 1) return block('IDENTITY_CONFLICT', 'DUPLICATE_MARKETPLACE_SKU:' + [company, country, marketplace, masterSku].join('|'));
    if (msRows.length === 1) {
      marketplaceSkuId = str(msRows[0].marketplace_sku_id) || null;
      siteSku = str(msRows[0].site_sku) || null;
      fulfillmentModel = str(msRows[0].fulfillment_model) || null;   // §24.1 SKU-level; null → unresolved (deferred projector decides)
    } else { issues.push('MARKETPLACE_SKU_NOT_FOUND:' + [company, country, marketplace, masterSku].join('|')); }

    // warehouse identity = warehouse_id ONLY (never warehouse_code); resolve destination if supplied
    var destinationWarehouseId = nonEmpty(input.destinationWarehouseId) ? str(input.destinationWarehouseId) : null;
    var sourceWarehouseId = nonEmpty(input.sourceWarehouseId) ? str(input.sourceWarehouseId) : null;
    if (destinationWarehouseId && (input.warehouseRows || []).length) {
      var wh = (input.warehouseRows || []).filter(function (r) { return str(r.warehouse_id) === destinationWarehouseId; });
      if (wh.length === 0) issues.push('DESTINATION_WAREHOUSE_NOT_FOUND:' + destinationWarehouseId);
      else if (wh.length > 1) return block('DUPLICATE_SOURCE', 'DUPLICATE_WAREHOUSE_ID:' + destinationWarehouseId);
    }

    return {
      status: 'RESOLVED', reason: null,
      identity: {
        masterSku: masterSku, marketplaceSkuId: marketplaceSkuId, company: company, country: country || null,
        marketplace: marketplace || null, siteSku: siteSku, fulfillmentModel: fulfillmentModel,
        destinationWarehouseId: destinationWarehouseId, sourceWarehouseId: sourceWarehouseId
      },
      issues: issues
    };
  }

  // ---- demand-ledger projection (§39 reuse; missing≠zero) --------------------
  // input = { masterSku, company, country, marketplace, destinationWarehouseId, planningCycle,
  //           demandRows:[{ demandType, sourceRef, requiredByDate, quantity, eventId? }] }
  function projectDemandLedger(input) {
    aType(isObj(input), 'projectDemandLedger: input must be an object');
    aType(nonEmpty(input.masterSku) && nonEmpty(input.company) && nonEmpty(input.destinationWarehouseId) && nonEmpty(input.planningCycle), 'projectDemandLedger: masterSku/company/destinationWarehouseId/planningCycle required');
    var rows = input.demandRows || [], entries = [], issues = [];
    for (var i = 0; i < rows.length; i++) {
      var d = rows[i] || {}, dt = str(d.demandType);
      if (DEMAND_TYPES[dt] !== 1) { issues.push({ i: i, reason: 'UNKNOWN_DEMAND_TYPE:' + dt }); continue; }
      var qr = readQty(d.quantity);
      if (qr.missing) { issues.push({ i: i, reason: 'MISSING_DEMAND_QUANTITY:' + str(d.sourceRef) }); continue; }  // never 0
      var entry = {
        demandType: dt, masterSku: str(input.masterSku), company: str(input.company),
        country: input.country == null ? null : str(input.country), marketplace: input.marketplace == null ? null : str(input.marketplace),
        destinationWarehouseId: str(input.destinationWarehouseId), planningCycle: str(input.planningCycle),
        requiredByDate: str(d.requiredByDate), sourceRef: str(d.sourceRef), quantity: qr.qty
      };
      if (dt === 'SPECIAL_EVENT') entry.eventId = str(d.eventId);   // §39 count-once identity
      entries.push(entry);
    }
    var ledger = LEDGER.buildDemandLedger({ entries: entries });   // §39 frozen builder (validates + count-once)
    return { entries: entries, ledger: ledger, issues: issues };
  }

  // ---- current-stock supply-ledger projection (§39 reuse; CURRENT_STOCK) -----
  // input = { masterSku, company, stockRows:[{ poolType, warehouseId, quantity, supplyLineageRef }] }
  // Inventory tables are the CURRENT_STOCK authority (§24.2/§24.3/§17); incoming/in-transit supply lifecycle
  // mapping is the deferred allocation-input projector, NOT invented here.
  function projectCurrentStockSupplyLedger(input) {
    aType(isObj(input), 'projectCurrentStockSupplyLedger: input must be an object');
    aType(nonEmpty(input.masterSku) && nonEmpty(input.company), 'projectCurrentStockSupplyLedger: masterSku/company required');
    var rows = input.stockRows || [], entries = [], issues = [];
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i] || {}, pt = str(s.poolType);
      if (CURRENT_STOCK_POOL_TYPES[pt] !== 1) { issues.push({ i: i, reason: 'UNKNOWN_POOL_TYPE:' + pt }); continue; }
      if (!nonEmpty(s.warehouseId)) { issues.push({ i: i, reason: 'MISSING_WAREHOUSE_ID' }); continue; }
      var qr = readQty(s.quantity);
      if (qr.missing) { issues.push({ i: i, reason: 'MISSING_STOCK_QUANTITY:' + str(s.warehouseId) }); continue; }  // never 0
      entries.push({
        supplyLineageRef: nonEmpty(s.supplyLineageRef) ? str(s.supplyLineageRef) : ('stock:' + pt + ':' + str(s.warehouseId) + ':' + str(input.masterSku)),
        masterSku: str(input.masterSku), company: str(input.company), warehouseId: str(s.warehouseId),
        poolType: pt, lifecycleBucket: 'CURRENT_STOCK', quantity: qr.qty
      });
    }
    var ledger = LEDGER.buildSupplyLedger({ entries: entries });   // §39 frozen builder (physical count-once)
    return { entries: entries, ledger: ledger, issues: issues };
  }

  // ---- incoming candidate adaptation (B4-R3/R4 reuse; NO lifecycle invention)-
  // input = { shipmentInputs:[{ shipment:{...}, line:{...} }], scope:{...} }
  function adaptIncomingSupplyCandidates(input) {
    aType(isObj(input) && Array.isArray(input.shipmentInputs), 'adaptIncomingSupplyCandidates: input.shipmentInputs[] required');
    aType(isObj(input.scope), 'adaptIncomingSupplyCandidates: input.scope required');
    var results = [], issues = [];
    for (var i = 0; i < input.shipmentInputs.length; i++) {
      try {
        var candidate = CAND.buildKmShipmentSupplyCandidate(input.shipmentInputs[i]);  // B4-R3 (accepts raw cells)
        results.push(INC.adaptKmShipmentIncomingCandidate({ candidate: candidate, scope: input.scope }));  // B4-R4
      } catch (e) { issues.push({ i: i, reason: 'ADAPT_FAILED:' + (e && e.message ? e.message : e) }); }
    }
    return { results: results, issues: issues };
  }

  return {
    READINESS_STATES: (function () { var o = {}; for (var k in READINESS_STATES) o[k] = 1; return o; })(),
    CURRENT_STOCK_POOL_TYPES: (function () { var o = {}; for (var k in CURRENT_STOCK_POOL_TYPES) o[k] = 1; return o; })(),
    DEMAND_TYPES: (function () { var o = {}; for (var k in DEMAND_TYPES) o[k] = 1; return o; })(),
    classifySourceReadiness: classifySourceReadiness,
    resolveSourceIdentity: resolveSourceIdentity,
    projectDemandLedger: projectDemandLedger,
    projectCurrentStockSupplyLedger: projectCurrentStockSupplyLedger,
    adaptIncomingSupplyCandidates: adaptIncomingSupplyCandidates
  };
});
