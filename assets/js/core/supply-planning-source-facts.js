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
    req ? req('./supply-planning-incoming-adapters.js') : (root.KMINC || (root.KM && root.KM.incomingAdapters)),
    req ? req('./supply-planning-qualified-incoming.js') : (root.KMQI || (root.KM && root.KM.qualifiedIncoming)),
    req ? req('./supply-planning-allocations.js') : (root.KMALLOC || (root.KM && root.KM.allocations))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.sourceFacts = api; }
})(this, function (CALC, LEDGER, CAND, INC, QI, ALLOC) {
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
  var POOL_TYPES = { FBA: 1, THREE_PL: 1, FACTORY: 1 };
  var DEMAND_TYPES = { REGULAR: 1, SALES_RUN_RATE: 1, SPECIAL_EVENT: 1, SAFETY: 1 };

  // ---- §39.5 lifecycle buckets (tokens owned by supply-planning-ledgers; NOT redefined) ----------
  // §39.5 freezes only the tokens + progression; §39.2/§39.4 explicitly assign the source-status →
  // lifecycleBucket mapping to the ADAPTER (this projector). buildSupplyLedger owns count-once/conflict.
  var ACTIVE_BUCKETS = {
    COMMITTED_PRODUCTION: 1, APPROVED_SHIPPING_PLAN: 1, SHIPPED_IN_TRANSIT: 1,
    DELIVERED_NOT_RECEIVED: 1, RECEIVED_NOT_REFLECTED: 1, CURRENT_STOCK: 1
  };
  var EXCLUDED_BUCKETS = { DRAFT: 1, CANCELLED_INVALID: 1, CORRECTION_REVERSAL: 1 };

  // OMIT sentinels: the lineage is real but is NOT this source's to count (count-once, §30) → surfaced as an
  // issue, never an entry. OMIT_TRANSFERRED = ownership moved down-lineage (PO→shipment, plan→shipment).
  // OMIT_POSTED = closed/posted shipment belongs to the CURRENT_STOCK inventory authority, not the shipment feed.
  // OMIT_RECEIVING_AUTHORITY = a `received` shipment header status defers to the canonical warehouse receiving
  // authority (receivingFacts 'confirmed'); raw status alone never emits RECEIVED_NOT_REFLECTED (F1-3b, SC-11.4-B/
  // SC-11.5: "RECEIVED_NOT_REFLECTED emitted only when a real receiving authority exists").
  var OMIT_TRANSFERRED = 'OMIT_TRANSFERRED', OMIT_POSTED = 'OMIT_POSTED', OMIT_RECEIVING_AUTHORITY = 'OMIT_RECEIVING_AUTHORITY';

  // Production / PO (REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC §1 — the one Canonically written-out status list).
  var PRODUCTION_STATUS_MAP = {
    draft: 'DRAFT',
    issued: 'COMMITTED_PRODUCTION', in_production: 'COMMITTED_PRODUCTION',
    partial_completed: 'COMMITTED_PRODUCTION', completed: 'COMMITTED_PRODUCTION',
    partial_shipped: OMIT_TRANSFERRED, shipped: OMIT_TRANSFERRED,   // Shipment becomes the incoming owner
    closure: 'CANCELLED_INVALID', cancelled: 'CANCELLED_INVALID'
  };
  // Weekly Shipping Plan (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.2A / §9).
  var SHIPPING_PLAN_STATUS_MAP = {
    draft: 'DRAFT', pending_approval: 'DRAFT',
    approved: 'APPROVED_SHIPPING_PLAN',
    cancelled: 'CANCELLED_INVALID',
    completed: OMIT_TRANSFERRED   // transferred to a Shipment (count-once)
  };
  // Shipment header (SHIPMENT_CENTER_SPEC §3/§4/§15.1 + §535 QI allowlist). ready_to_ship = pre-dispatch commit
  // (reserved, NOT yet physically shipped) → APPROVED_SHIPPING_PLAN. F1-3a — SC-11.4-B: arrived → SHIPPED_IN_TRANSIT
  // (in-transit; NOT delivered, NOT received). DELIVERED_NOT_RECEIVED arises ONLY from a canonical delivery-event
  // authority (routeEvents 'delivered'), never inferred from arrived (SC-11.4-C). F1-3b — SC-11.4-B/SC-11.5: a raw
  // `received` header status alone does NOT authorize RECEIVED_NOT_REFLECTED (SHIPMENT_CENTER §535 excludes `received`;
  // OVERSEAS_INBOUND §10.6/§303 make a confirmed Warehouse Receipt the sole receiving authority) → OMIT_RECEIVING_AUTHORITY;
  // RECEIVED_NOT_REFLECTED is emitted only from the canonical receiving authority (receivingFacts 'confirmed').
  var SHIPMENT_STATUS_MAP = {
    draft: 'DRAFT',
    ready_to_ship: 'APPROVED_SHIPPING_PLAN',
    shipped: 'SHIPPED_IN_TRANSIT', in_transit: 'SHIPPED_IN_TRANSIT',
    arrived: 'SHIPPED_IN_TRANSIT',        // F1-3a SC-11.4-B (was DELIVERED_NOT_RECEIVED — that inferred delivery from arrived, violating SC-11.4-C)
    received: OMIT_RECEIVING_AUTHORITY,   // F1-3b SC-11.4-B/SC-11.5 (was RECEIVED_NOT_REFLECTED — raw status never itself a receiving authority)
    closed: OMIT_POSTED,
    cancelled: 'CANCELLED_INVALID'
  };
  // Route/event ledger (SHIPMENT_ROUTE_AND_EVENT_SPEC §5.4; CARRIER_AND_ROUTE_SPEC §6A — spec-only, NOT emitted; fixtures only).
  // F1-3b — SC-11.4-C: `arrived`/`arrived_port` are ARRIVAL milestones (reached port/region), NOT delivery → SHIPPED_IN_TRANSIT;
  // DELIVERED_NOT_RECEIVED comes ONLY from the distinct canonical `delivered` carrier/route event, "never inferred from arrived".
  var ROUTE_EVENT_MAP = {
    arrived: 'SHIPPED_IN_TRANSIT', arrived_port: 'SHIPPED_IN_TRANSIT', delivered: 'DELIVERED_NOT_RECEIVED',
    received: 'RECEIVED_NOT_REFLECTED',
    correction: 'CORRECTION_REVERSAL', reversal: 'CORRECTION_REVERSAL'
  };
  // Warehouse receiving (OVERSEAS_INBOUND_SPEC §10.3/§10.6/§10.7 — NOT emitted; fixtures only). A confirmed
  // receipt not yet posted to the snapshot = RECEIVED_NOT_REFLECTED; a reversing receipt = CORRECTION_REVERSAL.
  var RECEIVING_STATUS_MAP = {
    draft: 'DRAFT', confirmed: 'RECEIVED_NOT_REFLECTED', reversed: 'CORRECTION_REVERSAL'
  };

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
  // Shared CURRENT_STOCK entry builder (§39 CURRENT_STOCK from inventory authority). Used by both the
  // Round 1J current-stock projector AND the Round 1K lifecycle projector — never duplicated.
  function buildCurrentStockEntries(masterSku, company, rows, issues) {
    var entries = [];
    for (var i = 0; i < rows.length; i++) {
      var s = rows[i] || {}, pt = str(s.poolType);
      if (CURRENT_STOCK_POOL_TYPES[pt] !== 1) { issues.push({ i: i, reason: 'UNKNOWN_POOL_TYPE:' + pt }); continue; }
      if (!nonEmpty(s.warehouseId)) { issues.push({ i: i, reason: 'MISSING_WAREHOUSE_ID' }); continue; }
      var qr = readQty(s.quantity);
      if (qr.missing) { issues.push({ i: i, reason: 'MISSING_STOCK_QUANTITY:' + str(s.warehouseId) }); continue; }  // never 0
      entries.push({
        supplyLineageRef: nonEmpty(s.supplyLineageRef) ? str(s.supplyLineageRef) : ('stock:' + pt + ':' + str(s.warehouseId) + ':' + str(masterSku)),
        masterSku: str(masterSku), company: str(company), warehouseId: str(s.warehouseId),
        poolType: pt, lifecycleBucket: 'CURRENT_STOCK', quantity: qr.qty
      });
    }
    return entries;
  }

  function projectCurrentStockSupplyLedger(input) {
    aType(isObj(input), 'projectCurrentStockSupplyLedger: input must be an object');
    aType(nonEmpty(input.masterSku) && nonEmpty(input.company), 'projectCurrentStockSupplyLedger: masterSku/company required');
    var issues = [];
    var entries = buildCurrentStockEntries(input.masterSku, input.company, input.stockRows || [], issues);
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

  // ---- supply-lifecycle projection (Round 1K; §39.5 buckets; buildSupplyLedger owns count-once) --------
  // PURE. Accepts already-resolved canonical source facts, maps each via its TABLE-SPECIFIC status→bucket
  // owner (§39.2/§39.4 assign this to the adapter), and calls the REAL buildSupplyLedger. Shipments reuse the
  // REAL B4-R3/R4/R6 chain (never duplicated). No allocation, no recommendedQty, no Sheet read, no persistence.
  function projectSupplyLifecycle(input) {
    aType(isObj(input), 'projectSupplyLifecycle: input must be an object');
    var entries = [], issues = [];
    function addIssue(domain, i, reason) { issues.push({ domain: domain, i: i, reason: reason }); }

    // Generic explicit-canonical-row projector. Each row carries its OWN identity (§7). fixedBucket, when set,
    // bypasses statusMap (correctionFacts → CORRECTION_REVERSAL). statusKeyField = 'status' | 'eventType'.
    function projectRows(domain, rows, statusMap, statusKeyField, fixedBucket) {
      rows = rows || [];
      aType(Array.isArray(rows), 'projectSupplyLifecycle: input.' + domain + ' must be an array');
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i]; aType(isObj(r), 'projectSupplyLifecycle: input.' + domain + '[' + i + '] must be an object');
        var bucket;
        if (fixedBucket) { bucket = fixedBucket; }
        else {
          var st = str(r[statusKeyField]).toLowerCase();
          if (!st) { addIssue(domain, i, 'MISSING_STATUS'); continue; }
          bucket = statusMap[st];
          if (bucket === undefined) { addIssue(domain, i, 'UNKNOWN_STATUS:' + st); continue; }          // fail-closed
          if (bucket === OMIT_TRANSFERRED) { addIssue(domain, i, 'LINEAGE_TRANSFERRED_DOWNSTREAM:' + st); continue; }
          if (bucket === OMIT_POSTED) { addIssue(domain, i, 'POSTED_TO_CURRENT_STOCK_AUTHORITY:' + st); continue; }
          if (bucket === OMIT_RECEIVING_AUTHORITY) { addIssue(domain, i, 'RECEIVING_AUTHORITY_REQUIRED:' + st); continue; }
        }
        if (!nonEmpty(r.supplyLineageRef)) { addIssue(domain, i, 'MISSING_SUPPLY_LINEAGE_REF'); continue; }
        if (!nonEmpty(r.company)) { addIssue(domain, i, 'MISSING_COMPANY'); continue; }
        if (!nonEmpty(r.masterSku)) { addIssue(domain, i, 'MISSING_MASTER_SKU'); continue; }
        if (!nonEmpty(r.warehouseId)) { addIssue(domain, i, 'MISSING_WAREHOUSE_ID'); continue; }
        var pt = str(r.poolType);
        if (POOL_TYPES[pt] !== 1) { addIssue(domain, i, 'UNKNOWN_POOL_TYPE:' + pt); continue; }
        var qr = readQty(r.quantity);
        if (qr.missing) { addIssue(domain, i, 'MISSING_QUANTITY:' + str(r.supplyLineageRef)); continue; }  // never 0 (NaN/Inf too)
        if (qr.qty < 0) { addIssue(domain, i, 'NEGATIVE_QUANTITY:' + str(r.supplyLineageRef)); continue; }   // fail-closed, no throw
        entries.push({
          supplyLineageRef: str(r.supplyLineageRef), masterSku: str(r.masterSku), company: str(r.company),
          warehouseId: str(r.warehouseId), poolType: pt, lifecycleBucket: bucket, quantity: qr.qty,
          eta: (nonEmpty(r.eta) ? str(r.eta) : null)   // F1-4B-FM3c-1b: additively preserve a canonical row ETA when present (missing stays null; never fabricated)
        });
      }
    }

    // A. Production / PO   B. Approved Shipping Plan   (explicit canonical status rows)
    projectRows('committedProduction', input.committedProduction, PRODUCTION_STATUS_MAP, 'status', null);
    projectRows('approvedShippingPlans', input.approvedShippingPlans, SHIPPING_PLAN_STATUS_MAP, 'status', null);

    // C. Shipment — reuse the REAL B4-R3/R4 candidate/adapter chain + B4-R6 Qualified Incoming authority.
    var shp = input.shipments;
    if (shp !== undefined && shp !== null) {
      aType(isObj(shp) && Array.isArray(shp.shipmentInputs) && isObj(shp.scope),
        'projectSupplyLifecycle: input.shipments requires { shipmentInputs:[], scope:{} }');
      var adapted = adaptIncomingSupplyCandidates({ shipmentInputs: shp.shipmentInputs, scope: shp.scope });
      adapted.issues.forEach(function (x) { addIssue('shipment', x.i, x.reason); });
      var qi = QI.evaluateQualifiedIncoming({
        requiredByDate: shp.requiredByDate,
        kmShipmentResults: adapted.results,
        externalAuthorityResults: shp.externalResults || [],
        postedToCurrentStockLineageKeys: shp.postedToCurrentStockLineageKeys || [],
        activeOtherBucketLineageKeys: shp.activeOtherBucketLineageKeys || []
      });
      for (var k = 0; k < qi.candidateResults.length; k++) {
        var cr = qi.candidateResults[k], c = cr.candidate;
        // Count-once: a lineage already posted to Current Stock (Gate 9) or active in another bucket is NOT the
        // shipment feed's to count. Duplicate/qty conflicts are LEFT for buildSupplyLedger (§18/§26).
        var posted = cr.gateResults && cr.gateResults.NOT_POSTED_TO_CURRENT_STOCK === 'FAIL';
        var otherBucket = (cr.exclusionReasons || []).indexOf('ACTIVE_IN_OTHER_BUCKET') >= 0;
        if (posted || otherBucket) { addIssue('shipment', k, 'COUNT_ONCE_OWNED_ELSEWHERE:' + c.lineageKey); continue; }
        var sst = str(c.status).toLowerCase();
        if (!sst) { addIssue('shipment', k, 'MISSING_STATUS:' + c.lineageKey); continue; }
        var sbucket = SHIPMENT_STATUS_MAP[sst];
        if (sbucket === undefined) { addIssue('shipment', k, 'UNKNOWN_STATUS:' + sst); continue; }        // fail-closed
        if (sbucket === OMIT_POSTED) { addIssue('shipment', k, 'POSTED_TO_CURRENT_STOCK_AUTHORITY:' + sst); continue; }
        if (sbucket === OMIT_RECEIVING_AUTHORITY) { addIssue('shipment', k, 'RECEIVING_AUTHORITY_REQUIRED:' + sst); continue; }
        if (!nonEmpty(c.company)) { addIssue('shipment', k, 'MISSING_COMPANY:' + c.lineageKey); continue; }
        if (!nonEmpty(c.sku)) { addIssue('shipment', k, 'MISSING_MASTER_SKU:' + c.lineageKey); continue; }
        if (!nonEmpty(c.destinationWarehouseId)) { addIssue('shipment', k, 'MISSING_WAREHOUSE_ID:' + c.lineageKey); continue; }
        var spt = 'THREE_PL'; // canonical KM shipments are 3PL-overseas inbound (candidate.supplyDomain KM_3PL_OVERSEAS)
        var sqr = readQty(c.quantityRemaining);
        if (sqr.missing) { addIssue('shipment', k, 'MISSING_QUANTITY:' + c.lineageKey); continue; }        // never 0 (NaN/Inf too)
        if (sqr.qty < 0) { addIssue('shipment', k, 'NEGATIVE_QUANTITY:' + c.lineageKey); continue; }        // fail-closed, no throw
        entries.push({
          supplyLineageRef: str(c.lineageKey), masterSku: str(c.sku), company: str(c.company),
          warehouseId: str(c.destinationWarehouseId), poolType: spt, lifecycleBucket: sbucket, quantity: sqr.qty,
          eta: (nonEmpty(c.eta) ? str(c.eta) : null)   // F1-4B-FM3c-1b: additively preserve the ALREADY-KNOWN canonical shipment ETA (c.eta, the same value KMQI's ETA gate consumed). Missing stays null — never a fabricated/derived date. Fact preservation only; no eligibility/quantity/count-once change.
        });
      }
    }

    // D. Route/event   E. Receiving   (canonical-but-NOT-YET-EMITTED; explicit fixtures only)
    projectRows('routeEvents', input.routeEvents, ROUTE_EVENT_MAP, 'eventType', null);
    projectRows('receivingFacts', input.receivingFacts, RECEIVING_STATUS_MAP, 'status', null);

    // F. Current stock — reuse the Round 1J shared builder (never duplicated).
    if (input.currentStockFacts !== undefined && input.currentStockFacts !== null) {
      aType(Array.isArray(input.currentStockFacts), 'projectSupplyLifecycle: input.currentStockFacts must be an array');
      aType(nonEmpty(input.masterSku) && nonEmpty(input.company), 'projectSupplyLifecycle: masterSku/company required for currentStockFacts');
      var csIssues = [];
      var csEntries = buildCurrentStockEntries(input.masterSku, input.company, input.currentStockFacts, csIssues);
      csIssues.forEach(function (x) { addIssue('currentStock', x.i, x.reason); });
      for (var ce = 0; ce < csEntries.length; ce++) entries.push(csEntries[ce]);
    }

    // G. Correction / reversal — always CORRECTION_REVERSAL (visible, contributes 0).
    projectRows('correctionFacts', input.correctionFacts, null, null, 'CORRECTION_REVERSAL');

    // Final §39 count-once via the REAL builder (never reimplemented).
    var ledger = LEDGER.buildSupplyLedger({ entries: entries });

    // Deterministic output ordering (permutation-invariant).
    var sortedEntries = entries.slice().sort(function (a, b) {
      return cmpStr(a.company, b.company) || cmpStr(a.warehouseId, b.warehouseId) || cmpStr(a.masterSku, b.masterSku)
        || cmpStr(a.poolType, b.poolType) || cmpStr(a.lifecycleBucket, b.lifecycleBucket)
        || cmpStr(a.supplyLineageRef, b.supplyLineageRef) || (a.quantity - b.quantity);
    });
    issues.sort(function (a, b) { return cmpStr(a.domain, b.domain) || (a.i - b.i) || cmpStr(a.reason, b.reason); });
    var lineageSet = {}, lineage = [];
    sortedEntries.forEach(function (e) { if (!lineageSet[e.supplyLineageRef]) { lineageSet[e.supplyLineageRef] = 1; lineage.push(e.supplyLineageRef); } });
    lineage.sort(cmpStr);

    var blocked = ledger.blockedCount > 0;
    var reason = null;
    if (blocked) { for (var p = 0; p < ledger.pools.length; p++) { if (ledger.pools[p].state === 'BLOCKED_CONFLICT') { reason = ledger.pools[p].reason; break; } } }

    return {
      ready: !blocked,
      status: blocked ? 'BLOCKED_CONFLICT' : 'OK',
      reason: reason,
      entries: sortedEntries,
      ledger: ledger,
      issues: issues,
      lineage: lineage,
      sourceDataAsOf: (input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf)
    };
  }

  // ---- allocation-input projection (Round 1L; builds §40 DTOs; calls the REAL allocators) --------------
  // PURE. Consumes REAL Demand/Supply Ledger outputs (quantity authorities, never recomputed) + caller-supplied
  // planning facts (survivalNeedQty/allocationPriority/demandWeight/fulfillmentModel/eligiblePoolTypes/
  // eligibleFactoryWarehouseIds — DB/§22-owned, so REQUIRED explicitly in a Sheet-free round, never fabricated),
  // forms the exact allocator DTOs, and calls allocateOverseasSharedPool / allocateFactoryDeterministic (never
  // reimplemented). No recommendedQty, no Plan Builder, no persistence, no Sheet read.
  var OVERSEAS_POOL_TYPES = { FBA: 1, THREE_PL: 1 };
  var FULFILLMENT_MODELS = { self_fulfilled: 1, platform_fulfilled: 1, hybrid: 1 };
  var SURVIVAL_HORIZON_DAYS = 18; // §20.3/§24.4 frozen survival horizon (cited, not invented)

  function finiteNonNeg(v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null; }
  function isoDateOk(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return false; var mo = +m[2], d = +m[3]; return mo >= 1 && mo <= 12 && d >= 1 && d <= 31; }
  function normalizeIdList(v, validate) {
    if (!Array.isArray(v)) return { ok: false, list: null };
    var seen = {}, out = [];
    for (var i = 0; i < v.length; i++) { var t = str(v[i]); if (validate && validate(t) !== true) return { ok: false, list: null, bad: t }; if (t === '' && !validate) return { ok: false, list: null }; if (!seen[t]) { seen[t] = 1; out.push(t); } }
    out.sort(cmpStr);
    return { ok: true, list: out };
  }

  function projectAllocationInputs(input) {
    aType(isObj(input), 'projectAllocationInputs: input must be an object');
    var identity = input.identity; aType(isObj(identity), 'projectAllocationInputs: input.identity must be an object');
    var company = str(identity.company), country = identity.country == null ? null : str(identity.country), masterSku = str(identity.masterSku);
    aType(nonEmpty(company) && nonEmpty(masterSku), 'projectAllocationInputs: identity.company/masterSku required');
    var demandLedger = input.demandLedger; aType(isObj(demandLedger) && Array.isArray(demandLedger.entries), 'projectAllocationInputs: input.demandLedger.entries required');
    var supplyLedger = input.supplyLedger; aType(isObj(supplyLedger) && Array.isArray(supplyLedger.pools), 'projectAllocationInputs: input.supplyLedger.pools required');
    var receiverFacts = input.receiverFacts == null ? [] : input.receiverFacts;
    var factoryDemandFacts = input.factoryDemandFacts == null ? [] : input.factoryDemandFacts;
    aType(Array.isArray(receiverFacts), 'projectAllocationInputs: input.receiverFacts must be an array');
    aType(Array.isArray(factoryDemandFacts), 'projectAllocationInputs: input.factoryDemandFacts must be an array');

    var issues = [], blockedInputs = [];
    function addIssue(kind, key, reason) { issues.push({ kind: kind, key: key, reason: reason }); }

    // Index Demand Ledger + surface blocked demand (never recomputed; effectiveDemandQty is the authority).
    var demandByKey = {};
    demandLedger.entries.forEach(function (e) {
      demandByKey[e.demandKey] = e;
      if (e.state === 'BLOCKED_CONFLICT') blockedInputs.push({ kind: 'DEMAND', key: e.demandKey, reason: e.reason || 'BLOCKED_CONFLICT' });
    });

    // Split Supply Ledger pools (blocked surfaced+excluded; FBA/THREE_PL vs FACTORY kept separate; no reclassification).
    var overseasPools = [], factoryPools = [];
    supplyLedger.pools.forEach(function (p) {
      if (p.state === 'BLOCKED_CONFLICT') { blockedInputs.push({ kind: 'SUPPLY', key: p.poolKey, reason: p.reason || 'BLOCKED_CONFLICT' }); return; }
      var base = { poolKey: str(p.poolKey), poolType: str(p.poolType), warehouseId: str(p.warehouseId), effectiveSupplyQty: p.effectiveSupplyQty };
      if (p.poolType === 'FACTORY') factoryPools.push(base);
      else if (OVERSEAS_POOL_TYPES[p.poolType] === 1) overseasPools.push(base);
      else addIssue('SUPPLY', str(p.poolKey), 'UNSUPPORTED_POOL_TYPE:' + str(p.poolType));
    });

    // ---- overseas receivers (join by demandKey; planning facts caller-supplied) ----
    var overseasReceivers = [], seenRecv = {}, seenDemO = {};
    for (var ri = 0; ri < receiverFacts.length; ri++) {
      var rf = receiverFacts[ri]; aType(isObj(rf), 'projectAllocationInputs: input.receiverFacts[' + ri + '] must be an object');
      var receiverKey = str(rf.receiverKey), demandKey = str(rf.demandKey);
      if (!nonEmpty(receiverKey)) { addIssue('DEMAND', '@' + ri, 'MISSING_RECEIVER_KEY'); continue; }
      if (!nonEmpty(demandKey)) { addIssue('DEMAND', receiverKey, 'MISSING_DEMAND_KEY'); continue; }
      if (seenRecv[receiverKey]) { addIssue('DEMAND', receiverKey, 'DUPLICATE_RECEIVER_KEY'); continue; }
      if (seenDemO[demandKey]) { addIssue('DEMAND', demandKey, 'DUPLICATE_DEMAND_KEY'); continue; }
      var e = demandByKey[demandKey];
      if (!e) { addIssue('DEMAND', demandKey, 'DEMAND_KEY_NOT_IN_LEDGER'); continue; }
      if (e.state === 'BLOCKED_CONFLICT') { seenRecv[receiverKey] = 1; seenDemO[demandKey] = 1; continue; } // already surfaced
      if (str(e.company) !== company) { addIssue('DEMAND', demandKey, 'COMPANY_SCOPE_MISMATCH'); continue; }
      if (str(e.masterSku) !== masterSku) { addIssue('DEMAND', demandKey, 'MASTER_SKU_SCOPE_MISMATCH'); continue; }
      if (country !== null && e.country != null && str(e.country) !== country) { addIssue('DEMAND', demandKey, 'COUNTRY_SCOPE_MISMATCH'); continue; }
      var mkt = nonEmpty(rf.marketplace) ? str(rf.marketplace) : str(e.marketplace);
      var dest = nonEmpty(rf.destinationWarehouseId) ? str(rf.destinationWarehouseId) : str(e.destinationWarehouseId);
      if (!nonEmpty(mkt)) { addIssue('DEMAND', demandKey, 'MISSING_MARKETPLACE'); continue; }
      if (!nonEmpty(dest)) { addIssue('DEMAND', demandKey, 'MISSING_DESTINATION_WAREHOUSE'); continue; }
      var fm = nonEmpty(rf.fulfillmentModel) ? str(rf.fulfillmentModel) : (identity.fulfillmentModel == null ? '' : str(identity.fulfillmentModel));
      if (FULFILLMENT_MODELS[fm] !== 1) { addIssue('DEMAND', demandKey, 'INVALID_FULFILLMENT_MODEL:' + fm); continue; }
      var survival;
      if (rf.survivalNeedQty !== undefined && rf.survivalNeedQty !== null) { survival = finiteNonNeg(rf.survivalNeedQty); if (survival === null) { addIssue('DEMAND', demandKey, 'INVALID_SURVIVAL_NEED'); continue; } }
      else if (rf.dailyDemand !== undefined && rf.dailyDemand !== null) { var dd = finiteNonNeg(rf.dailyDemand); if (dd === null) { addIssue('DEMAND', demandKey, 'INVALID_DAILY_DEMAND'); continue; } survival = Math.ceil(SURVIVAL_HORIZON_DAYS * dd); } // §20.3/§24.4
      else { addIssue('DEMAND', demandKey, 'MISSING_SURVIVAL_NEED'); continue; }
      var pr = finiteNonNeg(rf.allocationPriority); if (pr === null) { addIssue('DEMAND', demandKey, 'MISSING_OR_INVALID_ALLOCATION_PRIORITY'); continue; }
      var wt = finiteNonNeg(rf.demandWeight); if (wt === null) { addIssue('DEMAND', demandKey, 'MISSING_OR_INVALID_DEMAND_WEIGHT'); continue; }
      var el = normalizeIdList(rf.eligiblePoolTypes, function (t) { return OVERSEAS_POOL_TYPES[t] === 1; });
      if (!el.ok) { addIssue('DEMAND', demandKey, 'INVALID_ELIGIBLE_POOL_TYPES' + (el.bad ? ':' + el.bad : '')); continue; }
      seenRecv[receiverKey] = 1; seenDemO[demandKey] = 1;
      overseasReceivers.push({
        receiverKey: receiverKey, demandKey: demandKey, marketplace: mkt, destinationWarehouseId: dest,
        fulfillmentModel: fm, demandQty: e.effectiveDemandQty, survivalNeedQty: survival,
        allocationPriority: pr, demandWeight: wt, eligiblePoolTypes: el.list
      });
    }

    var overseasInput = null, overseasAllocation = null;
    if (overseasReceivers.length) {
      if (!nonEmpty(country)) { addIssue('DEMAND', '', 'MISSING_COUNTRY_FOR_OVERSEAS_SCOPE'); }
      else {
        overseasInput = { company: company, country: country, masterSku: masterSku, supplyPools: overseasPools, receivers: overseasReceivers };
        overseasAllocation = ALLOC.allocateOverseasSharedPool(overseasInput); // REAL §40 allocator (never reimplemented)
      }
    }

    // ---- factory demands (join by demandKey; caller-supplied eligibility + priority) ----
    var factoryDemands = [], seenDemF = {};
    for (var fi = 0; fi < factoryDemandFacts.length; fi++) {
      var ff = factoryDemandFacts[fi]; aType(isObj(ff), 'projectAllocationInputs: input.factoryDemandFacts[' + fi + '] must be an object');
      var fdKey = str(ff.demandKey);
      if (!nonEmpty(fdKey)) { addIssue('DEMAND', '@' + fi, 'MISSING_DEMAND_KEY'); continue; }
      if (seenDemF[fdKey]) { addIssue('DEMAND', fdKey, 'DUPLICATE_DEMAND_KEY'); continue; }
      var fe = demandByKey[fdKey];
      if (!fe) { addIssue('DEMAND', fdKey, 'DEMAND_KEY_NOT_IN_LEDGER'); continue; }
      if (fe.state === 'BLOCKED_CONFLICT') { seenDemF[fdKey] = 1; continue; }
      if (str(fe.company) !== company) { addIssue('DEMAND', fdKey, 'COMPANY_SCOPE_MISMATCH'); continue; }
      if (str(fe.masterSku) !== masterSku) { addIssue('DEMAND', fdKey, 'MASTER_SKU_SCOPE_MISMATCH'); continue; }
      var fmkt = nonEmpty(ff.marketplace) ? str(ff.marketplace) : str(fe.marketplace);
      var fdest = nonEmpty(ff.destinationWarehouseId) ? str(ff.destinationWarehouseId) : str(fe.destinationWarehouseId);
      var rbd = nonEmpty(ff.requiredByDate) ? str(ff.requiredByDate) : str(fe.requiredByDate);
      if (!nonEmpty(fmkt)) { addIssue('DEMAND', fdKey, 'MISSING_MARKETPLACE'); continue; }
      if (!nonEmpty(fdest)) { addIssue('DEMAND', fdKey, 'MISSING_DESTINATION_WAREHOUSE'); continue; }
      if (!isoDateOk(rbd)) { addIssue('DEMAND', fdKey, 'MISSING_OR_INVALID_REQUIRED_BY_DATE'); continue; }
      var fpr = finiteNonNeg(ff.allocationPriority); if (fpr === null) { addIssue('DEMAND', fdKey, 'MISSING_OR_INVALID_ALLOCATION_PRIORITY'); continue; }
      var few = normalizeIdList(ff.eligibleFactoryWarehouseIds, null);
      if (!few.ok) { addIssue('DEMAND', fdKey, 'INVALID_ELIGIBLE_FACTORY_WAREHOUSES'); continue; }
      seenDemF[fdKey] = 1;
      factoryDemands.push({
        demandKey: fdKey, company: company, marketplace: fmkt, destinationWarehouseId: fdest, requiredByDate: rbd,
        allocationPriority: fpr, demandQty: fe.effectiveDemandQty, eligibleFactoryWarehouseIds: few.list
      });
    }

    var factoryInput = null, factoryAllocation = null;
    if (factoryDemands.length) {
      factoryInput = { masterSku: masterSku, factoryPools: factoryPools, demands: factoryDemands };
      factoryAllocation = ALLOC.allocateFactoryDeterministic(factoryInput); // REAL §35/§40 allocator (never reimplemented)
    }

    // Deterministic ordering.
    issues.sort(function (a, b) { return cmpStr(a.kind, b.kind) || cmpStr(a.key, b.key) || cmpStr(a.reason, b.reason); });
    blockedInputs.sort(function (a, b) { return cmpStr(a.kind, b.kind) || cmpStr(a.key, b.key) || cmpStr(a.reason, b.reason); });
    var lineageSet = {}, lineage = [];
    function addLineage(k) { if (nonEmpty(k) && !lineageSet[k]) { lineageSet[k] = 1; lineage.push(k); } }
    overseasReceivers.forEach(function (r) { addLineage(r.demandKey); });
    factoryDemands.forEach(function (d) { addLineage(d.demandKey); });
    overseasPools.forEach(function (p) { addLineage(p.poolKey); });
    factoryPools.forEach(function (p) { addLineage(p.poolKey); });
    lineage.sort(cmpStr);

    var clean = (issues.length === 0 && blockedInputs.length === 0);
    var reason = blockedInputs.length ? blockedInputs[0].reason : (issues.length ? issues[0].reason : null);
    return {
      ready: clean,
      status: clean ? 'OK' : (blockedInputs.length ? 'BLOCKED_INPUTS_PRESENT' : 'ISSUES_PRESENT'),
      reason: reason,
      issues: issues,
      overseasInput: overseasInput,
      factoryInput: factoryInput,
      overseasAllocation: overseasAllocation,
      factoryAllocation: factoryAllocation,
      blockedInputs: blockedInputs,
      lineage: lineage,
      sourceDataAsOf: (input.sourceDataAsOf === undefined ? null : input.sourceDataAsOf)
    };
  }

  // ---- Weekly Recommendation Facts resolver (Round 1M; §2C.1/§31; calls the named helpers) --------------
  // PURE. Consumes the REAL projectAllocationInputs output + caller Weekly planning facts, derives the Weekly
  // recommendedQty via the named calculateShippingAndResidual FLOOR helper (§31/§2C.1 — never reimplemented) and
  // calculatedGap via calculateGap, and returns deterministic Weekly line facts for the FUTURE Plan Builder.
  // No Monthly carton CEILING, no order_qty, no planned_qty, no Plan Builder call, no persistence, no Sheet read.
  var WEEKLY_LINE_KEY = ['sku', 'site_sku', 'window_code']; // frozen §WEEKLY_SHIPPING grain (persistence repo)
  var KEY_SEP = '';

  function projectAllocationRecords(alloc, source, mode) {
    // returns { byDemand: {demandKey:[records]}, unalloc: {demandKey: qty} }
    var byDemand = {}, unalloc = {};
    if (!alloc) return { byDemand: byDemand, unalloc: unalloc };
    (alloc.allocations || []).forEach(function (a) {
      var k = str(a.demandKey);
      if (!byDemand[k]) byDemand[k] = [];
      byDemand[k].push({
        allocationKey: str(a.allocationKey), sourcePoolKey: str(a.sourcePoolKey), sourcePoolType: str(a.sourcePoolType),
        sourceWarehouseId: str(a.sourceWarehouseId), allocatedQty: a.allocatedQty, allocationSequence: a.allocationSequence,
        allocationReason: str(a.allocationReason), allocationSource: source, allocationMode: mode
      });
    });
    (alloc.unallocatedDemand || []).forEach(function (u) { var k = str(u.demandKey); unalloc[k] = (unalloc[k] || 0) + u.unallocatedQty; });
    return { byDemand: byDemand, unalloc: unalloc };
  }

  function resolveWeeklyRecommendationFacts(input) {
    aType(isObj(input), 'resolveWeeklyRecommendationFacts: input must be an object');
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'resolveWeeklyRecommendationFacts: planningCycle required');
    aType(isObj(input.businessScope), 'resolveWeeklyRecommendationFacts: businessScope required');
    var ap = input.allocationProjection; aType(isObj(ap), 'resolveWeeklyRecommendationFacts: allocationProjection required');
    var facts = input.weeklyPlanningFacts == null ? [] : input.weeklyPlanningFacts;
    aType(Array.isArray(facts), 'resolveWeeklyRecommendationFacts: weeklyPlanningFacts must be an array');
    var planningCycle = str(input.planningCycle);
    var scope = input.businessScope;
    var formulaVersion = input.formulaVersion == null ? null : input.formulaVersion;
    var sourceDataAsOf = input.sourceDataAsOf === undefined ? (ap.sourceDataAsOf === undefined ? null : ap.sourceDataAsOf) : input.sourceDataAsOf;

    var issues = [];
    function addIssue(key, reason) { issues.push({ key: key, reason: reason }); }

    // Index REAL allocation records by demandKey (overseas + factory; kept distinguishable).
    var ov = projectAllocationRecords(ap.overseasAllocation, 'OVERSEAS', ap.overseasAllocation ? ap.overseasAllocation.allocationMode : null);
    var fa = projectAllocationRecords(ap.factoryAllocation, 'FACTORY', 'FACTORY_DETERMINISTIC');
    var blockedDemandKeys = {};
    (ap.blockedInputs || []).forEach(function (b) { if (b.kind === 'DEMAND') blockedDemandKeys[str(b.key)] = str(b.reason); });

    // calculatedGap: caller value OR the named calculateGap owner (never UI fields).
    function resolveGap(f) {
      if (f.calculatedGap !== undefined && f.calculatedGap !== null) {
        return (typeof f.calculatedGap === 'number' && isFinite(f.calculatedGap) && f.calculatedGap >= 0) ? f.calculatedGap : NaN;
      }
      if (f.demand !== undefined && f.destinationCurrentStock !== undefined && f.timelyQualifiedIncoming !== undefined && f.timelyApprovedCommittedSupply !== undefined) {
        try { return CALC.calculateGap({ demand: f.demand, destinationCurrentStock: f.destinationCurrentStock, timelyQualifiedIncoming: f.timelyQualifiedIncoming, timelyApprovedCommittedSupply: f.timelyApprovedCommittedSupply }); }
        catch (e) { return NaN; }
      }
      return undefined; // missing
    }
    function validUpc(v) { return (typeof v === 'number' && isFinite(v) && v > 0 && Math.floor(v) === v); }

    var lines = [], seenLineKey = {};
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i]; aType(isObj(f), 'resolveWeeklyRecommendationFacts: weeklyPlanningFacts[' + i + '] must be an object');
      var recType = nonEmpty(f.recommendationType) ? str(f.recommendationType) : 'WEEKLY_SHIPPING';
      if (recType !== 'WEEKLY_SHIPPING') { addIssue(str(f.demandKey), 'NOT_WEEKLY_RECOMMENDATION_TYPE:' + recType); continue; } // Monthly distinguishable
      var sku = str(f.sku !== undefined ? f.sku : f.masterSku), siteSku = str(f.siteSku), windowCode = str(f.windowCode), demandKey = str(f.demandKey);
      // structural key parts (line-blocking issues, not throws)
      var blockedReason = null;
      if (!nonEmpty(sku)) blockedReason = 'MISSING_SKU';
      else if (!nonEmpty(windowCode)) blockedReason = 'MISSING_WINDOW_CODE';
      else if (windowCode.indexOf(KEY_SEP) !== -1 || siteSku.indexOf(KEY_SEP) !== -1 || sku.indexOf(KEY_SEP) !== -1) blockedReason = 'INVALID_NATURAL_KEY_PART';
      else if (!nonEmpty(demandKey)) blockedReason = 'MISSING_DEMAND_KEY';

      var lineKey = [sku, siteSku, windowCode].join(KEY_SEP);
      if (nonEmpty(sku) && nonEmpty(windowCode) && windowCode.indexOf(KEY_SEP) === -1) {
        if (seenLineKey[lineKey] === 1) throw new RangeError('resolveWeeklyRecommendationFacts: duplicate Weekly line key: ' + sku + '|' + siteSku + '|' + windowCode);
        seenLineKey[lineKey] = 1;
      }

      // gather REAL allocation records for this demand (overseas OR factory)
      var recs = (blockedReason ? [] : (ov.byDemand[demandKey] || []).concat(fa.byDemand[demandKey] || []));
      var unallocatedQty = blockedReason ? 0 : ((ov.unalloc[demandKey] || 0) + (fa.unalloc[demandKey] || 0));
      var totalAllocated = 0; recs.forEach(function (r) { totalAllocated += r.allocatedQty; });
      var breakdown = recs.slice().sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || (a.allocationSequence - b.allocationSequence); });
      var lineMode = null;
      if (recs.length) { lineMode = recs[0].allocationSource === 'OVERSEAS' ? recs[0].allocationMode : 'FACTORY_DETERMINISTIC'; }

      // blocked demand from Ledger/Allocation
      if (!blockedReason && blockedDemandKeys[demandKey]) blockedReason = blockedDemandKeys[demandKey];

      // gap + UPC (line-blocking if missing/invalid)
      var gap = blockedReason ? undefined : resolveGap(f);
      if (!blockedReason) {
        if (gap === undefined) blockedReason = 'MISSING_CALCULATED_GAP';
        else if (typeof gap !== 'number' || isNaN(gap)) blockedReason = 'INVALID_CALCULATED_GAP';
        else if (!validUpc(f.unitsPerCarton)) blockedReason = 'MISSING_OR_INVALID_UNITS_PER_CARTON';
      }

      var recommendedQty = null;
      if (!blockedReason) {
        // Weekly recommendedQty = named FLOOR helper over the ALLOCATED source (never Monthly CEILING).
        var shipRes = CALC.calculateShippingAndResidual({
          calculatedGap: gap, eligibleSourceAvailable: totalAllocated,
          otherLegallyAllocatedTimelySupply: (typeof f.otherLegallyAllocatedTimelySupply === 'number' ? f.otherLegallyAllocatedTimelySupply : 0),
          unitsPerCarton: f.unitsPerCarton
        });
        recommendedQty = shipRes.recommendedShippingQty; // FLOOR to whole cartons; ≤ allocated ≤ gap
      }

      // "single source" = ONE distinct source pool (the allocator may emit >1 record per pool: survival + weighted).
      var poolSet = {}, distinctPools = [];
      breakdown.forEach(function (b) { if (!poolSet[b.sourcePoolKey]) { poolSet[b.sourcePoolKey] = 1; distinctPools.push(b.sourcePoolKey); } });
      var single = (distinctPools.length === 1);
      var lineage = [];
      if (nonEmpty(demandKey)) lineage.push('demand:' + demandKey);
      breakdown.forEach(function (b) { lineage.push('alloc:' + b.allocationKey); });
      lineage.sort(cmpStr);

      var line = {
        lineKey: lineKey,
        recommendationType: 'WEEKLY_SHIPPING',
        planningCycle: planningCycle,
        businessScope: scope,
        company: nonEmpty(f.company) ? str(f.company) : (scope.company == null ? null : str(scope.company)),
        country: nonEmpty(f.country) ? str(f.country) : (scope.country == null ? null : str(scope.country)),
        marketplace: nonEmpty(f.marketplace) ? str(f.marketplace) : (scope.marketplace == null ? null : str(scope.marketplace)),
        masterSku: sku, siteSku: siteSku, destinationWarehouseId: nonEmpty(f.destinationWarehouseId) ? str(f.destinationWarehouseId) : null,
        windowCode: windowCode, demandKey: demandKey,
        calculatedGap: (blockedReason && (gap === undefined || typeof gap !== 'number' || isNaN(gap))) ? null : gap,
        recommendedQty: recommendedQty,
        allocationMode: lineMode,
        allocationBreakdown: breakdown,
        unallocatedQty: unallocatedQty,
        sourcePoolKey: single ? breakdown[0].sourcePoolKey : null,
        sourcePoolType: single ? breakdown[0].sourcePoolType : null,
        sourceWarehouseId: single ? breakdown[0].sourceWarehouseId : null,
        blockedReason: blockedReason,
        formulaVersion: formulaVersion,
        sourceDataAsOf: sourceDataAsOf,
        lineage: lineage
      };
      if (f.liveAnalysis !== undefined) line.liveAnalysis = f.liveAnalysis; // non-authoritative passthrough (§19)
      lines.push(line);
    }

    lines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
    issues.sort(function (a, b) { return cmpStr(a.key, b.key) || cmpStr(a.reason, b.reason); });

    var totalRecommendedQty = 0; lines.forEach(function (l) { if (typeof l.recommendedQty === 'number') totalRecommendedQty += l.recommendedQty; });
    var lineageSet = {}, lineage = [];
    lines.forEach(function (l) { l.lineage.forEach(function (k) { if (!lineageSet[k]) { lineageSet[k] = 1; lineage.push(k); } }); });
    lineage.sort(cmpStr);

    var clean = (issues.length === 0);
    return {
      ready: clean,
      status: clean ? 'OK' : 'ISSUES_PRESENT',
      reason: clean ? null : issues[0].reason,
      issues: issues,
      recommendationType: 'WEEKLY_SHIPPING',
      planningCycle: planningCycle,
      businessScope: scope,
      lines: lines,
      allocationSummary: {
        overseasAllocationMode: ap.overseasAllocation ? ap.overseasAllocation.allocationMode : null,
        factoryPresent: !!ap.factoryAllocation,
        lineCount: lines.length,
        blockedLineCount: lines.filter(function (l) { return l.blockedReason !== null; }).length,
        totalRecommendedQty: totalRecommendedQty
      },
      blockedInputs: (ap.blockedInputs || []).slice(),
      sourceDataAsOf: sourceDataAsOf,
      formulaVersion: formulaVersion,
      lineage: lineage
    };
  }

  // ---- Monthly Recommendation Facts resolver (Round 1N; §12/§14/§32; carton CEILING) -------------------
  // PURE. Consumes the REAL projectAllocationInputs output (factory allocation lineage) + caller Monthly
  // planning facts, derives Net Order Need via the named owner (calculateGap Engine-A remaining need §10 /
  // sumRemainingShortages §12/§32 — or accepted explicit), and the Monthly recommendedQty via the named
  // calculateSuggestedOrderQty carton CEILING helper (§14/§31 — never reimplemented, never Weekly FLOOR).
  // recommendedQty is demand-based (CEILING of Net Order Need), rounded ONCE over the line total; the factory
  // allocation is preserved as lineage only, NOT an order cap. No user order_qty, no Plan Builder, no persist.
  var MONTHLY_LINE_KEY = ['master_sku', 'request_month', 'request_bucket']; // frozen §MONTHLY_ORDER grain (sku in scope)

  function resolveMonthlyRecommendationFacts(input) {
    aType(isObj(input), 'resolveMonthlyRecommendationFacts: input must be an object');
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'resolveMonthlyRecommendationFacts: planningCycle required');
    aType(isObj(input.businessScope), 'resolveMonthlyRecommendationFacts: businessScope required');
    var ap = input.allocationProjection; aType(isObj(ap), 'resolveMonthlyRecommendationFacts: allocationProjection required');
    var facts = input.monthlyPlanningFacts == null ? [] : input.monthlyPlanningFacts;
    aType(Array.isArray(facts), 'resolveMonthlyRecommendationFacts: monthlyPlanningFacts must be an array');
    var planningCycle = str(input.planningCycle);
    var scope = input.businessScope;
    var formulaVersion = input.formulaVersion == null ? null : input.formulaVersion;
    var sourceDataAsOf = input.sourceDataAsOf === undefined ? (ap.sourceDataAsOf === undefined ? null : ap.sourceDataAsOf) : input.sourceDataAsOf;

    var issues = [];
    function addIssue(key, reason) { issues.push({ key: key, reason: reason }); }
    function finiteNonNeg(v) { return (typeof v === 'number' && isFinite(v) && v >= 0) ? v : null; }
    function validUpc(v) { return (typeof v === 'number' && isFinite(v) && v > 0 && Math.floor(v) === v); }

    // REAL factory allocation records by demandKey (Monthly is factory/production sourced; overseas kept out).
    var fa = projectAllocationRecords(ap.factoryAllocation, 'FACTORY', 'FACTORY_DETERMINISTIC');
    var demandByKeyLedger = {};
    if (isObj(input.demandLedger) && Array.isArray(input.demandLedger.entries)) input.demandLedger.entries.forEach(function (e) { demandByKeyLedger[e.demandKey] = e; });
    var blockedDemandKeys = {};
    (ap.blockedInputs || []).forEach(function (b) { if (b.kind === 'DEMAND') blockedDemandKeys[str(b.key)] = str(b.reason); });

    // Net Order Need: explicit OR sumRemainingShortages(§12/§32) OR calculateGap Engine-A remaining need (§10).
    function resolveNeed(f) {
      if (f.netOrderNeed !== undefined && f.netOrderNeed !== null) { var n = finiteNonNeg(f.netOrderNeed); return n === null ? NaN : n; }
      if (Array.isArray(f.remainingShortages)) { try { return CALC.sumRemainingShortages(f.remainingShortages); } catch (e) { return NaN; } }
      if (f.demand !== undefined && f.destinationCurrentStock !== undefined && f.timelyQualifiedIncoming !== undefined && f.timelyApprovedCommittedSupply !== undefined) {
        try { return CALC.calculateGap({ demand: f.demand, destinationCurrentStock: f.destinationCurrentStock, timelyQualifiedIncoming: f.timelyQualifiedIncoming, timelyApprovedCommittedSupply: f.timelyApprovedCommittedSupply }); }
        catch (e) { return NaN; }
      }
      return undefined; // missing
    }

    var lines = [], seenLineKey = {};
    for (var i = 0; i < facts.length; i++) {
      var f = facts[i]; aType(isObj(f), 'resolveMonthlyRecommendationFacts: monthlyPlanningFacts[' + i + '] must be an object');
      var recType = nonEmpty(f.recommendationType) ? str(f.recommendationType) : 'MONTHLY_ORDER';
      if (recType !== 'MONTHLY_ORDER') { addIssue(str(f.demandKey), 'NOT_MONTHLY_RECOMMENDATION_TYPE:' + recType); continue; } // Weekly distinguishable
      var masterSku = str(f.masterSku !== undefined ? f.masterSku : f.sku), requestMonth = str(f.requestMonth), requestBucket = str(f.requestBucket), demandKey = str(f.demandKey);

      var blockedReason = null;
      if (!nonEmpty(masterSku)) blockedReason = 'MISSING_MASTER_SKU';
      else if (!nonEmpty(requestMonth)) blockedReason = 'MISSING_REQUEST_MONTH';
      else if (!nonEmpty(requestBucket)) blockedReason = 'MISSING_REQUEST_BUCKET';
      else if (masterSku.indexOf(KEY_SEP) !== -1 || requestMonth.indexOf(KEY_SEP) !== -1 || requestBucket.indexOf(KEY_SEP) !== -1) blockedReason = 'INVALID_NATURAL_KEY_PART';
      else if (!nonEmpty(demandKey)) blockedReason = 'MISSING_DEMAND_KEY';

      var lineKey = [masterSku, requestMonth, requestBucket].join(KEY_SEP);
      if (nonEmpty(masterSku) && nonEmpty(requestMonth) && nonEmpty(requestBucket) && masterSku.indexOf(KEY_SEP) === -1 && requestMonth.indexOf(KEY_SEP) === -1 && requestBucket.indexOf(KEY_SEP) === -1) {
        if (seenLineKey[lineKey] === 1) throw new RangeError('resolveMonthlyRecommendationFacts: duplicate Monthly line key: ' + masterSku + '|' + requestMonth + '|' + requestBucket);
        seenLineKey[lineKey] = 1;
      }

      // blocked Ledger demand
      if (!blockedReason && blockedDemandKeys[demandKey]) blockedReason = blockedDemandKeys[demandKey];

      // factory allocation lineage (breakdown ONLY — never an order cap; recommendedQty is demand-based)
      var recs = (blockedReason ? [] : (fa.byDemand[demandKey] || []));
      var unallocatedQty = blockedReason ? 0 : (fa.unalloc[demandKey] || 0);
      var breakdown = recs.slice().sort(function (a, b) { return cmpStr(a.sourcePoolKey, b.sourcePoolKey) || (a.allocationSequence - b.allocationSequence); });
      var poolSet = {}, distinctPools = [];
      breakdown.forEach(function (b) { if (!poolSet[b.sourcePoolKey]) { poolSet[b.sourcePoolKey] = 1; distinctPools.push(b.sourcePoolKey); } });
      var single = (distinctPools.length === 1);
      var lineMode = recs.length ? 'FACTORY_DETERMINISTIC' : null;

      // Net Order Need (owner helpers) + carton size
      var need = blockedReason ? undefined : resolveNeed(f);
      var needResolved = (typeof need === 'number' && !isNaN(need));
      if (!blockedReason) {
        if (need === undefined) blockedReason = 'MISSING_NET_ORDER_NEED';
        else if (!needResolved) blockedReason = 'INVALID_NET_ORDER_NEED';
        else if (!validUpc(f.unitsPerCarton)) blockedReason = 'MISSING_OR_INVALID_UNITS_PER_CARTON';
      }

      var recommendedQty = null, cartonQty = null;
      if (!blockedReason) {
        // Monthly recommendedQty = named carton-CEILING helper over Net Order Need (rounded ONCE; never FLOOR).
        recommendedQty = CALC.calculateSuggestedOrderQty({ netOrderNeed: need, unitsPerCarton: f.unitsPerCarton });
        cartonQty = recommendedQty / f.unitsPerCarton; // whole cartons (display fact)
      }

      var eDemand = demandByKeyLedger[demandKey];
      var monthlyDemandQty = null;
      if (eDemand && eDemand.state === 'COUNTED') monthlyDemandQty = eDemand.effectiveDemandQty;
      else if (typeof f.monthlyDemandQty === 'number' && isFinite(f.monthlyDemandQty)) monthlyDemandQty = f.monthlyDemandQty;

      var lineage = [];
      if (nonEmpty(demandKey)) lineage.push('demand:' + demandKey);
      breakdown.forEach(function (b) { lineage.push('alloc:' + b.allocationKey); });
      lineage.sort(cmpStr);

      var line = {
        lineKey: lineKey,
        recommendationType: 'MONTHLY_ORDER',
        planningCycle: planningCycle,
        businessScope: scope,
        company: nonEmpty(f.company) ? str(f.company) : (scope.company == null ? null : str(scope.company)),
        country: nonEmpty(f.country) ? str(f.country) : (scope.country == null ? null : str(scope.country)),
        marketplace: nonEmpty(f.marketplace) ? str(f.marketplace) : (scope.marketplace == null ? null : str(scope.marketplace)),
        masterSku: masterSku, siteSku: str(f.siteSku), destinationWarehouseId: nonEmpty(f.destinationWarehouseId) ? str(f.destinationWarehouseId) : null,
        requestMonth: requestMonth, requestBucket: requestBucket, demandKey: demandKey,
        monthlyDemandQty: monthlyDemandQty,
        netOrderNeed: needResolved ? need : null,
        unitsPerCarton: validUpc(f.unitsPerCarton) ? f.unitsPerCarton : null,
        recommendedQty: recommendedQty,
        cartonQty: cartonQty,
        allocationMode: lineMode,
        allocationBreakdown: breakdown,
        unallocatedQty: unallocatedQty,
        sourcePoolKey: single ? breakdown[0].sourcePoolKey : null,
        sourceWarehouseId: single ? breakdown[0].sourceWarehouseId : null,
        blockedReason: blockedReason,
        formulaVersion: formulaVersion,
        sourceDataAsOf: sourceDataAsOf,
        lineage: lineage
      };
      if (f.liveAnalysis !== undefined) line.liveAnalysis = f.liveAnalysis; // non-authoritative passthrough (§22)
      lines.push(line);
    }

    lines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
    issues.sort(function (a, b) { return cmpStr(a.key, b.key) || cmpStr(a.reason, b.reason); });

    var totalRecommendedQty = 0, totalNetOrderNeed = 0;
    lines.forEach(function (l) { if (typeof l.recommendedQty === 'number') totalRecommendedQty += l.recommendedQty; if (typeof l.netOrderNeed === 'number') totalNetOrderNeed += l.netOrderNeed; });
    var lineageSet = {}, lineage = [];
    lines.forEach(function (l) { l.lineage.forEach(function (k) { if (!lineageSet[k]) { lineageSet[k] = 1; lineage.push(k); } }); });
    lineage.sort(cmpStr);

    var clean = (issues.length === 0);
    return {
      ready: clean,
      status: clean ? 'OK' : 'ISSUES_PRESENT',
      reason: clean ? null : issues[0].reason,
      issues: issues,
      recommendationType: 'MONTHLY_ORDER',
      planningCycle: planningCycle,
      businessScope: scope,
      lines: lines,
      allocationSummary: {
        factoryPresent: !!ap.factoryAllocation,
        lineCount: lines.length,
        blockedLineCount: lines.filter(function (l) { return l.blockedReason !== null; }).length,
        totalNetOrderNeed: totalNetOrderNeed,
        totalRecommendedQty: totalRecommendedQty
      },
      blockedInputs: (ap.blockedInputs || []).slice(),
      sourceDataAsOf: sourceDataAsOf,
      formulaVersion: formulaVersion,
      lineage: lineage
    };
  }

  return {
    READINESS_STATES: (function () { var o = {}; for (var k in READINESS_STATES) o[k] = 1; return o; })(),
    CURRENT_STOCK_POOL_TYPES: (function () { var o = {}; for (var k in CURRENT_STOCK_POOL_TYPES) o[k] = 1; return o; })(),
    DEMAND_TYPES: (function () { var o = {}; for (var k in DEMAND_TYPES) o[k] = 1; return o; })(),
    ACTIVE_LIFECYCLE_BUCKETS: (function () { var o = {}; for (var k in ACTIVE_BUCKETS) o[k] = 1; return o; })(),
    EXCLUDED_LIFECYCLE_BUCKETS: (function () { var o = {}; for (var k in EXCLUDED_BUCKETS) o[k] = 1; return o; })(),
    classifySourceReadiness: classifySourceReadiness,
    resolveSourceIdentity: resolveSourceIdentity,
    projectDemandLedger: projectDemandLedger,
    projectCurrentStockSupplyLedger: projectCurrentStockSupplyLedger,
    adaptIncomingSupplyCandidates: adaptIncomingSupplyCandidates,
    projectSupplyLifecycle: projectSupplyLifecycle,
    projectAllocationInputs: projectAllocationInputs,
    resolveWeeklyRecommendationFacts: resolveWeeklyRecommendationFacts,
    resolveMonthlyRecommendationFacts: resolveMonthlyRecommendationFacts
  };
});
