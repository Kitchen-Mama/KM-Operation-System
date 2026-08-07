// Kitchen Mama Operation System — Unified Destination-Node Recommendation Core Runtime (Phase F1-4B-FM1).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC unified core that resolves ONE recommendation for a canonical DestinationNode, dispatching
// by destinationType to the EXISTING frozen owners — it authors NO new business formula:
//
//   MARKETPLACE (Amazon / platform-fulfilled)  → MARKETPLACE_ORDER_NEED
//     demand = marketplace Regular FC (via the frozen KMPCX planning context, warehouseId=null, no pool decomposition)
//     stock  = amazon_inventory_snapshot.available_qty ONLY (marketplace-level; explicit 0 stays 0; missing ≠ 0)
//     incoming = ONLY source-proven marketplace incoming (identity resolved to a unique active marketplaces row),
//                counted through the EXISTING KMQI count-once lifecycle; unresolved active incoming is NEVER a fake
//                zero — it forces incomingCompleteness = PARTIAL and BLOCKS the canonical recommendedQty
//     gap    = KMCALC.calculateGap (frozen 4-scalar owner)
//     recommendedQty = KMCALC.calculateSuggestedOrderQty — the frozen Monthly carton-CEILING order-need owner
//                (NEVER the Weekly pool allocator; no fabricated Amazon warehouse)
//
//   WAREHOUSE (overseas)                        → WAREHOUSE_REPLENISHMENT
//     demand = marketplace demand fanned to this warehouse by the frozen configured ratio
//              (KM.demandAllocation.resolveScopeWarehouseDemandFacts — largest-remainder, conserved, never pooled)
//     gap    = KMCALC.calculateGap over THIS warehouse's own stock/incoming (never pooled across warehouses)
//     recommendedQty = KMCALC.calculateShippingAndResidual — the frozen Weekly FLOOR resolver, capped by the
//                caller-supplied allocated source availability (frozen allocator-cap rule)
//
// Reuses (never reimplements): KM.demandAllocation (destination identity + fanout), KMPCX (planning context),
// KMCALC (gap / Monthly CEILING / Weekly FLOOR), KMQI (Qualified-Incoming count-once). No clock / RNG / locale;
// no SpreadsheetApp / getOperationDb / DB / persistence / Sheet write. Input never mutated; MISSING is never a
// silent 0 (only an explicit source 0 is 0); JSON-safe deterministic output.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-demand-allocation.js') : (root.KM && root.KM.demandAllocation),
    req ? req('./supply-planning-planning-context.js') : (root.KMPCX || (root.KM && root.KM.planningContext)),
    req ? req('./supply-planning-calculations.js') : (root.KMCALC || (root.KM && root.KM.core && root.KM.core.supplyPlanningCalculations)),
    req ? req('./supply-planning-qualified-incoming.js') : (root.KMQI || (root.KM && root.KM.qualifiedIncoming))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.destinationRuntime = api; }
})(this, function (DA, KMPCX, CALC, QI) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function s(v) { return String(v === undefined || v === null ? '' : v).trim(); }
  function eqv(a, b) { return s(a).toLowerCase() === s(b).toLowerCase(); }
  function nonEmpty(v) { return s(v).length > 0; }
  function has(o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); }
  function cmpStr(a, b) { a = s(a); b = s(b); return a < b ? -1 : a > b ? 1 : 0; }
  function iss(code, message, field) { return { code: code, message: message, field: field === undefined ? null : field }; }
  // finite number, else null (MISSING). Explicit 0 → 0. Negative rejected (→ null, fail-closed upstream).
  function qtyNum(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return (isFinite(n) && n >= 0) ? n : null; }
  function validUpc(v) { return (typeof v === 'number' && isFinite(v) && v > 0 && v % 1 === 0); }

  // ACTIVE incoming lifecycle statuses (source-proven, still in flight). Frozen SHIPMENT lifecycle vocabulary
  // (SHIPMENT_CENTER_SPEC): draft/cancelled/received/closed are NOT active-in-flight incoming.
  var ACTIVE_INCOMING_STATUS = { shipped: 1, in_transit: 1, arrived: 1, ready_to_ship: 1, approved: 1 };

  // ================================ §3 destination normalizer (single owner, re-exported) ====================
  function normalizeRecommendationDestination(input, authorities) {
    return DA.normalizeRecommendationDestination(input, authorities);
  }

  // ================================ §5.2 MARKETPLACE current stock (amazon_inventory_snapshot only) ==========
  // Reads ONLY amazon_inventory_snapshot.available_qty for the (country, marketplace, sku) scope. Overseas /
  // factory rows (any row carrying a warehouse identity, or lacking an available_qty field) are excluded. Explicit
  // 0 stays 0; no matching row = missing (null), NEVER a fabricated 0; >1 distinct value = canonical conflict.
  function resolveMarketplaceCurrentStock(input) {
    input = input || {}; var scope = input.scope || {}; var issues = [];
    if (input.rows === undefined || input.rows === null) {
      return { ready: false, qty: null, missing: true, conflict: false, issues: [iss('MARKETPLACE_STOCK_SOURCE_UNAVAILABLE', 'amazon inventory source not provided (missing ≠ 0)')] };
    }
    var rows = Array.isArray(input.rows) ? input.rows : [];
    var country = s(scope.country), marketplace = s(scope.marketplace), sku = s(scope.sku);
    var vals = {}, matched = 0;
    rows.forEach(function (r) {
      if (!isObj(r)) return;
      // exclude anything that is not the amazon FBA marketplace-level source (has a warehouse identity → overseas/factory)
      if (nonEmpty(r.warehouseId) || nonEmpty(r.warehouse_id)) return;
      var hasAvail = has(r, 'availableQty') || has(r, 'available_qty');
      if (!hasAvail) return;
      if (!(eqv(r.country, country) && eqv(r.marketplace, marketplace) && eqv(r.sku, sku))) return;
      var raw = has(r, 'availableQty') ? r.availableQty : r.available_qty;
      var q = qtyNum(raw);
      if (q === null) return; // an unreadable available_qty is not a zero
      matched++;
      vals[String(q)] = q;
    });
    var distinct = Object.keys(vals);
    if (matched === 0) return { ready: false, qty: null, missing: true, conflict: false, issues: [] };
    if (distinct.length > 1) return { ready: false, qty: null, missing: false, conflict: true, issues: [iss('MARKETPLACE_STOCK_CONFLICT', 'conflicting amazon available_qty for ' + [country, marketplace, sku].join('/') + ': ' + distinct.join(','))] };
    return { ready: true, qty: vals[distinct[0]], missing: false, conflict: false, issues: issues };
  }

  // ================================ §5.3 MARKETPLACE incoming identity resolver (pure) =======================
  // Attempts EXACT resolution of each incoming candidate to a unique active marketplaces row via source-proven
  // fields only (company + country + marketplace code). MULTI / blank / ambiguous → UNRESOLVED. A warehouse-destined
  // row (destination_warehouse_id, non-MARKETPLACE) → NOT_MARKETPLACE (never counted as marketplace incoming).
  // A row resolving to a DIFFERENT marketplace than the request scope → NOT_MARKETPLACE + SCOPE_MISMATCH (excluded,
  // not relevant to this scope). Returns one { resolutionStatus, marketplaceId, issueCode } per candidate.
  function resolveMarketplaceIncomingIdentity(input) {
    input = input || {}; var scope = input.scope || {}; var marketplaces = input.marketplaces;
    var scopeMktId = s(scope.marketplaceId || scope.destinationRefId);
    var cands = Array.isArray(input.candidates) ? input.candidates : [];
    return cands.map(function (c) {
      c = c || {};
      var destType = s(c.destinationType).toUpperCase();
      var candMktId = s(c.marketplaceId);
      var whId = s(c.destinationWarehouseId || c.destination_warehouse_id);
      // Warehouse-destined and NOT explicitly a marketplace destination → not marketplace incoming.
      if (destType !== 'MARKETPLACE' && !candMktId && whId) return { resolutionStatus: 'NOT_MARKETPLACE', marketplaceId: null, issueCode: null };
      var mkt = s(c.marketplace);
      if (eqv(mkt, 'MULTI') || !nonEmpty(mkt) && !candMktId) return { resolutionStatus: 'UNRESOLVED', marketplaceId: null, issueCode: 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED' };
      // Reuse the ONE destination identity owner (exact unique active marketplaces resolution).
      var nd = DA.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: s(c.company), country: s(c.country), marketplace: mkt, marketplaceId: candMktId || undefined }, { marketplaces: marketplaces });
      if (!nd.ok) {
        var code = (nd.issues && nd.issues[0] && nd.issues[0].code) || 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED';
        if (code === 'MARKETPLACE_DESTINATION_CONFLICT') return { resolutionStatus: 'UNRESOLVED', marketplaceId: null, issueCode: 'MARKETPLACE_INCOMING_IDENTITY_CONFLICT' };
        return { resolutionStatus: 'UNRESOLVED', marketplaceId: null, issueCode: 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED' };
      }
      var resolvedId = nd.destination.marketplaceId;
      if (scopeMktId && resolvedId !== scopeMktId) return { resolutionStatus: 'NOT_MARKETPLACE', marketplaceId: resolvedId, issueCode: 'MARKETPLACE_INCOMING_SCOPE_MISMATCH' };
      return { resolutionStatus: 'RESOLVED', marketplaceId: resolvedId, issueCode: null };
    });
  }

  // Adapter: a RESOLVED marketplace incoming candidate → the KM_SHIPMENT_INCOMING result shape the FROZEN KMQI
  // count-once evaluator consumes. This is an identity/shape adapter (authorized §D-F1-4B-FM1-4) — it duplicates
  // NO Qualified-Incoming gate logic; the ten-gate / count-once / late-risk / external decisions stay in KMQI.
  function _toKmIncomingResult(c, marketplaceId, idx) {
    var q = qtyNum(has(c, 'quantity') ? c.quantity : c.quantityRemaining);
    var status = s(c.status).toLowerCase();
    var statusEligible = ACTIVE_INCOMING_STATUS[status] === 1;
    var statusClass = statusEligible ? 'ELIGIBLE_INCOMING_STATUS' : (status ? 'STATUS_NOT_ELIGIBLE' : 'MISSING_STATUS');
    var eta = s(c.eta);
    var ref = s(c.ref || c.shipmentId || c.lineageKey || c.supplyCandidateId) || ('mkt-inc-' + idx);
    return {
      adapterType: 'KM_SHIPMENT_INCOMING', sourceEligible: true, statusEligible: statusEligible, statusClass: statusClass,
      quantityEligible: (typeof q === 'number' && q > 0), etaPresent: nonEmpty(eta),
      adapterEligibleQuantity: (statusEligible && typeof q === 'number' && q > 0) ? q : 0,
      exclusionReasons: [], reviewReasons: [],
      candidate: {
        lineageKey: s(c.lineageKey) || ref, supplyCandidateId: s(c.supplyCandidateId) || ref, sourceLineRef: s(c.sourceLineRef) || ref,
        company: s(c.company), country: s(c.country), marketplace: s(c.marketplace), sku: s(c.sku),
        destinationWarehouseId: marketplaceId, destinationIdentitySource: 'RESOLVED_MARKETPLACE',
        status: status, eta: eta, quantityRemaining: (typeof q === 'number' ? q : null), linkedShipmentId: s(c.linkedShipmentId) || ''
      }
    };
  }

  // ================================ §5.3+§5.4 confirmed marketplace incoming + completeness ===================
  // Sums ONLY RESOLVED (this-scope) incoming through the frozen KMQI count-once lifecycle. Unresolved ACTIVE
  // potentially-relevant rows are NEVER a confirmed zero — they set incomingCompleteness = PARTIAL (block canonical).
  // candidates === undefined/null → source UNAVAILABLE (block); candidates === [] → COMPLETE (known-empty, confirmed 0 legit).
  function resolveMarketplaceQualifiedIncoming(input) {
    input = input || {}; var issues = [];
    if (input.candidates === undefined || input.candidates === null) {
      return { confirmedQualifiedIncomingQty: null, incomingCompleteness: 'UNAVAILABLE', unresolvedIncomingCount: 0, unresolvedIncomingRefs: [], issues: [iss('MARKETPLACE_INCOMING_SOURCE_UNAVAILABLE', 'marketplace incoming source not provided (missing ≠ 0)')], perCandidate: [] };
    }
    var cands = Array.isArray(input.candidates) ? input.candidates : [];
    var identity = resolveMarketplaceIncomingIdentity({ candidates: cands, marketplaces: input.marketplaces, scope: input.scope || {} });
    var resolvedResults = [], unresolvedRefs = [];
    identity.forEach(function (r, i) {
      var c = cands[i] || {};
      if (r.issueCode) issues.push(iss(r.issueCode, 'incoming candidate ' + (s(c.ref || c.shipmentId) || ('@' + i)) + ' → ' + r.resolutionStatus, 'marketplace'));
      if (r.resolutionStatus === 'RESOLVED') {
        resolvedResults.push(_toKmIncomingResult(c, r.marketplaceId, i));
      } else if (r.resolutionStatus === 'UNRESOLVED') {
        // only ACTIVE in-flight unresolved rows are "potentially relevant" (a cancelled/draft row cannot cover demand)
        if (ACTIVE_INCOMING_STATUS[s(c.status).toLowerCase()] === 1) unresolvedRefs.push(s(c.ref || c.shipmentId || c.lineageKey) || ('@' + i));
      }
    });
    unresolvedRefs.sort(cmpStr);

    var confirmed = 0, qiEvents = [];
    if (resolvedResults.length) {
      if (!nonEmpty(input.requiredByDate)) { issues.push(iss('MISSING_REQUIRED_BY_DATE', 'requiredByDate required to evaluate marketplace Qualified Incoming')); return { confirmedQualifiedIncomingQty: null, incomingCompleteness: 'UNAVAILABLE', unresolvedIncomingCount: unresolvedRefs.length, unresolvedIncomingRefs: unresolvedRefs, issues: issues, perCandidate: identity, qualifiedEvents: [] }; }
      var qi = QI.evaluateQualifiedIncoming({ requiredByDate: s(input.requiredByDate), kmShipmentResults: resolvedResults, externalAuthorityResults: input.externalIncomingResults || [] });
      confirmed = qi.qualifiedIncomingQuantity; // late-risk stays visible + non-covering (NOT in confirmed)
      qiEvents = (qi && qi.qualifiedEvents) ? qi.qualifiedEvents : [];   // F1-4B-FM3c-1 additive event surfacing
    } else if (input.externalIncomingResults && input.externalIncomingResults.length) {
      // external observed evidence is quarantined (§38) — never confirmed; evaluated only to surface diagnostics
      QI.evaluateQualifiedIncoming({ requiredByDate: s(input.requiredByDate) || '2000-01-01', kmShipmentResults: [], externalAuthorityResults: input.externalIncomingResults });
    }

    var completeness = unresolvedRefs.length > 0 ? 'PARTIAL' : 'COMPLETE';
    return {
      confirmedQualifiedIncomingQty: confirmed, incomingCompleteness: completeness,
      unresolvedIncomingCount: unresolvedRefs.length, unresolvedIncomingRefs: unresolvedRefs, issues: issues, perCandidate: identity,
      qualifiedEvents: qiEvents   // F1-4B-FM3c-1 additive: ETA-dated qualified events (empty on UNAVAILABLE / no resolved candidates)
    };
  }

  // ================================ §5.1/§6 MARKETPLACE demand (frozen KMPCX planning context) ================
  // demand = Σ Regular FC over M+1..M+4 via the EXISTING KMPCX planning context with a MARKETPLACE node
  // (warehouseId=null; no warehouse eligibility, no source-pool decomposition). Reuses the frozen forecast owner.
  function resolveMarketplaceDemand(input) {
    input = input || {}; var dest = input.destination || {};
    var pcx = KMPCX.resolveRecommendationPlanningContext({
      calculationMonth: input.calculationMonth, planningCycle: input.planningCycle, recommendationType: 'MONTHLY_ORDER',
      marketplaces: input.marketplaces || [], warehouses: input.warehouses || [],
      receivers: [{
        company: dest.company, country: dest.country, marketplace: dest.marketplace, sku: s(input.sku), siteSku: s(input.siteSku),
        destination: dest, regularForecastByMonth: input.regularForecastByMonth, specialEventFacts: input.specialEventFacts || []
      }]
    });
    if (!pcx.ready || !pcx.contexts.length) return { ready: false, qty: null, context: null, issues: pcx.issues || [] };
    return { ready: true, qty: pcx.contexts[0].forecastShareQty, context: pcx.contexts[0], issues: [] };
  }

  // ================================ §6 MARKETPLACE order-need (frozen Monthly CEILING resolver) ===============
  function resolveMarketplaceRecommendation(input) {
    input = input || {}; var issues = [], mode = 'MARKETPLACE_ORDER_NEED';
    var completeness = s(input.incomingCompleteness).toUpperCase() || 'COMPLETE';
    var demand = qtyNum(input.demandQty), stock = qtyNum(input.currentStockQty);
    var confirmed = qtyNum(input.confirmedQualifiedIncomingQty); if (confirmed === null) confirmed = 0; // confirmed source-proven only
    var approved = qtyNum(input.approvedCommittedSupplyQty); if (approved === null) approved = 0;
    var upc = input.unitsPerCarton;
    function out(gap, prov, blocked, reason) { return { recommendationMode: mode, calculatedGap: gap, recommendedQty: (blocked ? null : prov), provisionalOrderNeed: prov, blocked: blocked, blockedReason: reason, incomingCompleteness: completeness, issues: issues }; }
    if (demand === null) { issues.push(iss('MISSING_MARKETPLACE_DEMAND', 'marketplace Regular-FC demand missing (missing ≠ 0)')); return out(null, null, true, 'MISSING_MARKETPLACE_DEMAND'); }
    if (stock === null) { issues.push(iss('MARKETPLACE_STOCK_MISSING', 'marketplace current stock missing (missing ≠ 0)')); return out(null, null, true, 'MARKETPLACE_STOCK_MISSING'); }
    if (!validUpc(upc)) { issues.push(iss('MISSING_OR_INVALID_UNITS_PER_CARTON', 'units_per_carton must be a positive integer')); return out(null, null, true, 'MISSING_OR_INVALID_UNITS_PER_CARTON'); }
    var gap, prov;
    try { gap = CALC.calculateGap({ demand: demand, destinationCurrentStock: stock, timelyQualifiedIncoming: confirmed, timelyApprovedCommittedSupply: approved }); }
    catch (e) { issues.push(iss('GAP_INPUT_INVALID', String(e && e.message || e))); return out(null, null, true, 'GAP_INPUT_INVALID'); }
    try { prov = CALC.calculateSuggestedOrderQty({ netOrderNeed: gap, unitsPerCarton: upc }); }  // frozen Monthly carton CEILING
    catch (e) { issues.push(iss('ORDER_NEED_INPUT_INVALID', String(e && e.message || e))); return out(gap, null, true, 'ORDER_NEED_INPUT_INVALID'); }
    if (completeness === 'PARTIAL' || completeness === 'UNAVAILABLE') return out(gap, prov, true, 'INCOMING_COMPLETENESS_' + completeness); // provisional only; canonical blocked
    return out(gap, prov, false, null); // COMPLETE → recommendedQty is canonical (= provisionalOrderNeed)
  }

  // ================================ §7 WAREHOUSE replenishment (frozen Weekly FLOOR resolver) =================
  function resolveWarehouseRecommendation(input) {
    input = input || {}; var issues = [], mode = 'WAREHOUSE_REPLENISHMENT', node = input.destinationNode || null;
    var demand = qtyNum(input.allocatedForecastQty), sales = qtyNum(input.allocatedSalesQty), stock = qtyNum(input.currentStockQty);
    var incoming = qtyNum(input.qualifiedIncomingQty), supply = qtyNum(input.allocatedSupplyQty);
    var approved = qtyNum(input.approvedCommittedSupplyQty); if (approved === null) approved = 0;
    var other = qtyNum(input.otherLegallyAllocatedTimelySupply); if (other === null) other = 0;
    var upc = input.unitsPerCarton;
    function out(gap, rec, resid, blocked, reason) {
      return { recommendationMode: mode, destinationNode: node, allocatedForecastQty: demand, allocatedSalesQty: sales, currentStockQty: stock, qualifiedIncomingQty: incoming, calculatedGap: gap, allocatedSupplyQty: supply, recommendedQty: rec, residualShortageQty: resid, blocked: blocked, blockedReason: reason, issues: issues };
    }
    if (demand === null) { issues.push(iss('MISSING_WAREHOUSE_DEMAND', 'allocated warehouse Forecast demand missing (missing ≠ 0)')); return out(null, null, null, true, 'MISSING_WAREHOUSE_DEMAND'); }
    if (stock === null) { issues.push(iss('MISSING_WAREHOUSE_STOCK', 'warehouse current stock missing (missing ≠ 0)')); return out(null, null, null, true, 'MISSING_WAREHOUSE_STOCK'); }
    if (incoming === null) { issues.push(iss('MISSING_WAREHOUSE_INCOMING', 'warehouse Qualified Incoming missing (missing ≠ 0)')); return out(null, null, null, true, 'MISSING_WAREHOUSE_INCOMING'); }
    if (supply === null) { issues.push(iss('MISSING_ALLOCATED_SUPPLY', 'allocated source availability missing (missing ≠ 0)')); return out(null, null, null, true, 'MISSING_ALLOCATED_SUPPLY'); }
    if (!validUpc(upc)) { issues.push(iss('MISSING_OR_INVALID_UNITS_PER_CARTON', 'units_per_carton must be a positive integer')); return out(null, null, null, true, 'MISSING_OR_INVALID_UNITS_PER_CARTON'); }
    var gap, ship;
    try { gap = CALC.calculateGap({ demand: demand, destinationCurrentStock: stock, timelyQualifiedIncoming: incoming, timelyApprovedCommittedSupply: approved }); }
    catch (e) { issues.push(iss('GAP_INPUT_INVALID', String(e && e.message || e))); return out(null, null, null, true, 'GAP_INPUT_INVALID'); }
    try { ship = CALC.calculateShippingAndResidual({ calculatedGap: gap, eligibleSourceAvailable: supply, otherLegallyAllocatedTimelySupply: other, unitsPerCarton: upc }); } // frozen Weekly FLOOR, allocator-capped
    catch (e) { issues.push(iss('SHIPPING_INPUT_INVALID', String(e && e.message || e))); return out(gap, null, null, true, 'SHIPPING_INPUT_INVALID'); }
    return out(gap, ship.recommendedShippingQty, ship.residualProductionRequired, false, null);
  }

  // ================================ §8 unified core entry point ==============================================
  function _whById(warehouses) { var m = {}; (Array.isArray(warehouses) ? warehouses : []).forEach(function (w) { var id = s(w.warehouse_id || w.warehouseId); if (id && !m[id]) m[id] = w; }); return m; }
  function resolveUnifiedDestinationRecommendation(rawSnapshots, request, options) {
    rawSnapshots = rawSnapshots || {}; request = request || {}; options = options || {};
    var scope = request.scope || {};
    var meta = { deterministic: true, calculationMonth: s(request.calculationMonth) || null, planningCycle: s(request.planningCycle) || null, sourceDataAsOf: request.sourceDataAsOf == null ? null : s(request.sourceDataAsOf), formulaVersion: request.formulaVersion == null ? null : s(request.formulaVersion), recommendationType: s(request.recommendationType) || null };
    var authorities = { marketplaces: rawSnapshots.marketplaces || options.marketplaces || [], warehouses: rawSnapshots.warehouses || options.warehouses || [] };
    var din = request.destination || {};
    var normInput = {
      destinationType: din.destinationType, company: nonEmpty(din.company) ? din.company : scope.company,
      country: nonEmpty(din.country) ? din.country : scope.country, marketplace: nonEmpty(din.marketplace) ? din.marketplace : scope.marketplace,
      marketplaceId: din.marketplaceId, warehouseId: din.warehouseId, destinationWarehouseId: din.destinationWarehouseId, destinationRefId: din.destinationRefId
    };
    var nd = DA.normalizeRecommendationDestination(normInput, authorities);
    if (!nd.ok) return { ready: false, destination: null, recommendationMode: null, line: null, issues: nd.issues, meta: meta };
    var dest = nd.destination;

    if (dest.destinationType === 'MARKETPLACE') {
      var demandQty;
      if (has(options, 'marketplaceDemandQty')) { demandQty = options.marketplaceDemandQty; }
      else {
        var dres = resolveMarketplaceDemand({ destination: dest, calculationMonth: request.calculationMonth, planningCycle: request.planningCycle, marketplaces: authorities.marketplaces, warehouses: authorities.warehouses, sku: scope.sku, siteSku: options.siteSku, regularForecastByMonth: options.regularForecastByMonth, specialEventFacts: options.specialEventFacts });
        if (!dres.ready) return { ready: false, destination: dest, recommendationMode: 'MARKETPLACE_ORDER_NEED', line: null, issues: dres.issues, meta: meta };
        demandQty = dres.qty;
      }
      var stockRes = resolveMarketplaceCurrentStock({ rows: (rawSnapshots.amazonInventory !== undefined ? rawSnapshots.amazonInventory : options.amazonInventory), scope: { country: dest.country, marketplace: dest.marketplace, sku: scope.sku } });
      var qir = resolveMarketplaceQualifiedIncoming({ candidates: (rawSnapshots.marketplaceIncomingCandidates !== undefined ? rawSnapshots.marketplaceIncomingCandidates : options.marketplaceIncomingCandidates), marketplaces: authorities.marketplaces, scope: dest, requiredByDate: options.requiredByDate || request.requiredByDate, externalIncomingResults: options.externalIncomingResults });
      var mrec = resolveMarketplaceRecommendation({ demandQty: demandQty, currentStockQty: stockRes.qty, confirmedQualifiedIncomingQty: qir.confirmedQualifiedIncomingQty, incomingCompleteness: qir.incomingCompleteness, approvedCommittedSupplyQty: options.approvedCommittedSupplyQty, unitsPerCarton: options.unitsPerCarton });
      var mline = { destination: dest, recommendationMode: mrec.recommendationMode, calculatedGap: mrec.calculatedGap, recommendedQty: mrec.recommendedQty, provisionalOrderNeed: mrec.provisionalOrderNeed, blocked: mrec.blocked, blockedReason: mrec.blockedReason, incomingCompleteness: mrec.incomingCompleteness, currentStockQty: stockRes.qty, confirmedQualifiedIncomingQty: qir.confirmedQualifiedIncomingQty, unresolvedIncomingCount: qir.unresolvedIncomingCount, unresolvedIncomingRefs: qir.unresolvedIncomingRefs, qualifiedEvents: qir.qualifiedEvents || [] };
      var mIssues = (mrec.issues || []).concat(stockRes.issues || []).concat(qir.issues || []);
      return { ready: !mrec.blocked, destination: dest, recommendationMode: 'MARKETPLACE_ORDER_NEED', line: mline, issues: mIssues, meta: meta };
    }

    // WAREHOUSE — fan marketplace demand to this warehouse by the frozen configured ratio, then Weekly FLOOR leg.
    var whId = dest.warehouseId;
    var fan = DA.resolveScopeWarehouseDemandFacts({
      scope: { company: dest.company, country: dest.country, marketplace: dest.marketplace, marketplaceId: dest.marketplaceId },
      allocationRules: rawSnapshots.allocationRules || options.allocationRules || [], warehousesById: _whById(authorities.warehouses),
      effectiveDate: s(request.calculationMonth), marketplaceForecastQty: options.marketplaceForecastQty, marketplaceSalesQty: options.marketplaceSalesQty
    });
    if (!fan.ready) return { ready: false, destination: dest, recommendationMode: 'WAREHOUSE_REPLENISHMENT', line: null, issues: fan.issues, meta: meta };
    var leg = fan.warehouses.filter(function (w) { return w.warehouseId === whId; })[0];
    if (!leg) return { ready: false, destination: dest, recommendationMode: 'WAREHOUSE_REPLENISHMENT', line: null, issues: [iss('DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'no active allocation rule for requested destination warehouse: ' + whId)], meta: meta };
    var perWh = (isObj(options.perWarehouseSupply) && options.perWarehouseSupply[whId]) || options.warehouseSupplyFacts || {};
    var wrec = resolveWarehouseRecommendation({
      destinationNode: dest, allocatedForecastQty: leg.allocatedForecastQty, allocatedSalesQty: leg.allocatedSalesQty,
      currentStockQty: perWh.currentStockQty, qualifiedIncomingQty: perWh.qualifiedIncomingQty, allocatedSupplyQty: perWh.allocatedSupplyQty,
      approvedCommittedSupplyQty: perWh.approvedCommittedSupplyQty, otherLegallyAllocatedTimelySupply: perWh.otherLegallyAllocatedTimelySupply, unitsPerCarton: options.unitsPerCarton
    });
    return { ready: !wrec.blocked, destination: dest, recommendationMode: 'WAREHOUSE_REPLENISHMENT', line: wrec, issues: wrec.issues || [], meta: meta };
  }

  // ================================ Canonical response-line normalizer (F1-4B-FM1-T §9) =====================
  // The unified runtime is the ONE owner of final line normalization + stable identity. Produces the additive
  // destination-identity response line for BOTH a MARKETPLACE order-need result and a WAREHOUSE (frozen KMPS) line.
  // Stable recommendationLineId = mode | company | country | marketplace | sku | siteSku | destinationKey (NEVER a
  // row index / array position / label / SKU-alone). Callers dedupe by this id (duplicate ⇒ structured conflict).
  function _numOrNull(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function recommendationLineId(mode, company, country, marketplace, sku, siteSku, destinationKey) {
    return [s(mode), s(company), s(country), s(marketplace), s(sku), s(siteSku), s(destinationKey)].join('|');
  }
  function buildRecommendationLine(input) {
    input = input || {}; var d = input.destination || {};
    var mode = s(input.recommendationMode);
    var company = s(d.company) || s(input.company), country = s(d.country) || s(input.country), marketplace = s(d.marketplace) || s(input.marketplace);
    var sku = s(input.sku), siteSku = s(input.siteSku);
    var destinationKey = s(d.destinationKey) || DA.destinationKey(d);
    return {
      recommendationLineId: recommendationLineId(mode, company, country, marketplace, sku, siteSku, destinationKey),
      recommendationMode: mode || null,
      company: company || null, country: country || null, marketplace: marketplace || null, marketplaceId: d.marketplaceId || null,
      sku: sku || null, siteSku: siteSku || null,
      destinationType: d.destinationType || null, destinationRefId: d.destinationRefId || null, destinationKey: destinationKey || null,
      destinationCode: d.destinationCode || null, destinationLabel: d.destinationLabel || null, warehouseId: d.warehouseId || null,
      allocatedForecastQty: _numOrNull(input.allocatedForecastQty), allocatedSalesQty: _numOrNull(input.allocatedSalesQty),
      currentStockQty: _numOrNull(input.currentStockQty), qualifiedIncomingQty: _numOrNull(input.qualifiedIncomingQty),
      incomingCompleteness: input.incomingCompleteness == null ? null : s(input.incomingCompleteness),
      calculatedGap: _numOrNull(input.calculatedGap), allocatedSupplyQty: _numOrNull(input.allocatedSupplyQty),
      recommendedQty: _numOrNull(input.recommendedQty), provisionalOrderNeed: _numOrNull(input.provisionalOrderNeed),
      residualShortageQty: _numOrNull(input.residualShortageQty),
      blocked: input.blocked === true, blockedReason: input.blocked === true ? (s(input.blockedReason) || null) : null,
      formulaVersion: input.formulaVersion == null ? null : s(input.formulaVersion),
      sourceDataAsOf: input.sourceDataAsOf == null ? null : s(input.sourceDataAsOf),
      diagnostics: (input.diagnostics && typeof input.diagnostics === 'object') ? input.diagnostics : { issues: [] }
    };
  }

  return {
    normalizeRecommendationDestination: normalizeRecommendationDestination,
    buildRecommendationLine: buildRecommendationLine,
    recommendationLineId: recommendationLineId,
    resolveMarketplaceCurrentStock: resolveMarketplaceCurrentStock,
    resolveMarketplaceIncomingIdentity: resolveMarketplaceIncomingIdentity,
    resolveMarketplaceQualifiedIncoming: resolveMarketplaceQualifiedIncoming,
    resolveMarketplaceDemand: resolveMarketplaceDemand,
    resolveMarketplaceRecommendation: resolveMarketplaceRecommendation,
    resolveWarehouseRecommendation: resolveWarehouseRecommendation,
    resolveUnifiedDestinationRecommendation: resolveUnifiedDestinationRecommendation
  };
});
