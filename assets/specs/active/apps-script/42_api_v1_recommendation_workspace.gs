/**
 * 42_api_v1_recommendation_workspace.gs
 * Kitchen Mama Operation System — API v1 · Recommendation READ-ONLY Workspace (Phase F1-4B-A).
 *
 * SOURCE MIRROR / NOT DEPLOYED. One canonical read action:
 *   action = "recommendation.workspace.get"   (dispatched from 01_router.gs doPost; a body-carrying READ, no write).
 *
 * Contract — a PURE READ boundary over the ALREADY-COMPLETE recommendation runtime. It authors NO formula:
 *   doPost → 01_router → handleRecommendationWorkspaceGet_(body, io)
 *     → validateRecommendationWorkspaceRequest_   (mandatory scope + destination + calc month + planning cycle;
 *                                                   size <= 100; FAILS before any table read)
 *     → io.openTarget()                            (exact Spreadsheet-ID gate — fail closed)
 *     → KMPS.readCanonicalSnapshots(ss)            (the SAME targeted 11-table reader KMPS already owns; NOT getOperationDb)
 *     → KMPA.assembleProductionRecommendationFacts (KMPCX planning context → KMAF allocation facts → productionRequest)
 *     → KMPS.buildProductionRecommendationSource   (existing demand/supply ledger → allocator → resolver; NO write)
 *     → recommendationWorkspaceBuild_              (map/filter/sort/paginate → bounded View Model)
 *     → canonical envelope { success, data, meta, errors }
 *
 * It NEVER writes a Sheet (no setValues/appendRow/insertRow/deleteRow/clear), NEVER acquires a LockService lock,
 * NEVER creates a Draft / Allocation Draft / Weekly Plan / Request Order / Shipment / reservation / inventory row,
 * NEVER persists a recommendation, and creates/repairs NO sheet or header. It invents NO Coverage / DOS / Projected
 * Inventory / Reason / Status. Missing source is NEVER a fake zero — it is a structured failure or a runtime-blocked
 * line. A legitimate runtime-calculated zero stays a successful zero.
 *
 * Testability: every pure builder is a `function` declaration; the impure orchestrator takes an injectable `io`
 * (now/nextSeq/openTarget) so it runs against fixtures with ZERO SpreadsheetApp. Wall-clock / sequence live ONLY in
 * the io diagnostic layer, never in a pure builder. The runtime is the bundled KMPA / KMPS / KMPCX / KMAF (90_*.gs).
 */

var RECO_WS_SEQ_ = 0;                 // API diagnostic-layer server correlation counter (not business runtime)
var RECO_WS_PAGE_MAX_ = 100;
var RECO_WS_PAGE_DEFAULT_ = 50;

// --------------------------------------------------------------------------------------------------------
// PURE helpers (deterministic; no clock / no Spreadsheet / no formula)
// --------------------------------------------------------------------------------------------------------
function recoWsStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function recoWsNum_(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
function recoWsIsObj_(x) { return x && typeof x === 'object' && !Array.isArray(x); }

function recoWsRequestId_(provided, io) {
  var p = recoWsStr_(provided);
  if (/^REQ-[A-Za-z0-9_-]{1,40}$/.test(p)) return p;
  var seq = (io && typeof io.nextSeq === 'function') ? io.nextSeq() : 0;
  return 'REQ-S' + ('000000' + seq).slice(-6);
}
function recoWsEnvelope_(ok, data, errors, meta) {
  var m = { apiVersion: '1', source: 'recommendation.workspace.get', workspace: 'recommendation', mode: 'WORKSPACE', cached: false };
  if (meta) { for (var k in meta) m[k] = meta[k]; }
  return { success: !!ok, data: ok ? (data === undefined ? null : data) : null, meta: m, errors: ok ? [] : (errors || []) };
}
function recoWsErr_(code, message, details) { return { code: code, message: String(message == null ? code : message), details: (details === undefined ? null : details) }; }

// F1-4B-FM1-T: SCOPE-ONLY request validation. The client owns ONLY the business scope + filters + pagination; the
// SERVER owns destination expansion (MARKETPLACE vs WAREHOUSE) and the calculation context (month/cycle). A legacy
// destinationWarehouseId / calculationMonth / planningCycle is accepted as DEPRECATED compatibility input, recorded
// on the result, and NEVER used to drive fanout in scope-only mode (no dual execution). Runs BEFORE any table read.
function validateRecommendationWorkspaceRequest_(payload) {
  payload = recoWsIsObj_(payload) ? payload : {};
  var scope = recoWsIsObj_(payload.scope) ? payload.scope : {};
  var company = recoWsStr_(scope.company), country = recoWsStr_(scope.country), marketplace = recoWsStr_(scope.marketplace);
  if (!company || !country || !marketplace) return { ok: false, error: recoWsErr_('VALIDATION_FAILED', 'scope.company/country/marketplace are mandatory (no implicit first company/marketplace)', { scope: scope }) };
  if (recoWsIsObj_(payload.filters) && payload.filters.demandDriver && recoWsStr_(payload.filters.demandDriver).toUpperCase() !== 'FORECAST') {
    return { ok: false, error: recoWsErr_('UNSUPPORTED_PHASE1_DEMAND_DRIVER', 'Phase-1 demandDriver is FORECAST only; no client override') };
  }
  var filters = recoWsIsObj_(payload.filters) ? payload.filters : {};
  var pg = recoWsIsObj_(payload.pagination) ? payload.pagination : {};
  var size = recoWsNum_(pg.size); size = (size && size > 0) ? Math.min(Math.floor(size), RECO_WS_PAGE_MAX_) : RECO_WS_PAGE_DEFAULT_;
  var page = recoWsNum_(pg.page); page = (page && page > 0) ? Math.floor(page) : 1;
  return {
    ok: true,
    scope: { company: company, country: country, marketplace: marketplace, sku: recoWsStr_(scope.sku) || recoWsStr_(filters.sku) || null, siteSku: recoWsStr_(scope.siteSku) || recoWsStr_(filters.siteSku) || null },
    filters: { sku: recoWsStr_(scope.sku) || recoWsStr_(filters.sku) || null, siteSku: recoWsStr_(scope.siteSku) || recoWsStr_(filters.siteSku) || null, category: recoWsStr_(filters.category) || null, series: recoWsStr_(filters.series) || null },
    page: page, size: size, include: recoWsIsObj_(payload.include) ? payload.include : {},
    formulaVersion: recoWsStr_(payload.formulaVersion) || null, sourceDataAsOf: recoWsStr_(payload.sourceDataAsOf) || null,
    deprecatedCompat: { destinationWarehouseId: recoWsStr_(payload.destinationWarehouseId) || null, calculationMonth: recoWsStr_(payload.calculationMonth) || null, planningCycle: recoWsStr_(payload.planningCycle) || null }
  };
}

// F1-4B-FM1-T calculation-month authority — the SERVER owns the calc context via an injected configuration value
// (io.configMonth() → Script Property RECOMMENDATION_CALCULATION_MONTH). NO browser clock, NO server clock, NO
// current-month / latest-forecast fallback. Missing → NOT_CONFIGURED; malformed → INVALID. planningCycle = RECO-{YYYY-MM}.
function recoWsResolveCalcContext_(io) {
  var raw = recoWsStr_((io && typeof io.configMonth === 'function') ? io.configMonth() : '');
  if (!raw) return { ok: false, error: recoWsErr_('RECOMMENDATION_CALCULATION_MONTH_NOT_CONFIGURED', 'RECOMMENDATION_CALCULATION_MONTH is not configured (no clock fallback)') };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(raw)) return { ok: false, error: recoWsErr_('RECOMMENDATION_CALCULATION_MONTH_INVALID', 'RECOMMENDATION_CALCULATION_MONTH must be YYYY-MM (got "' + raw + '")') };
  return { ok: true, calculationMonth: raw, planningCycle: 'RECO-' + raw };
}

// Source-proven per-SKU supply context from the projection's lifecycle-bucketed rows (KMPS.supplySourceEntries).
// currentStockQty = Σ CURRENT_STOCK; qualifiedIncomingQty = Σ SHIPPED_IN_TRANSIT (F1-3 in-transit bucket). NOT invented.
function recoWsSupplyBySku_(supplySourceEntries) {
  var by = {};
  (supplySourceEntries || []).forEach(function (e) {
    var sku = recoWsStr_(e.sku); if (!sku) return;
    if (!by[sku]) by[sku] = { currentStockQty: 0, qualifiedIncomingQty: 0 };
    var q = recoWsNum_(e.quantity); if (q === null) return;
    var bucket = recoWsStr_(e.lifecycle_bucket);
    if (bucket === 'CURRENT_STOCK') by[sku].currentStockQty += q;
    else if (bucket === 'SHIPPED_IN_TRANSIT') by[sku].qualifiedIncomingQty += q;
  });
  return by;
}
// calculatedGap per SKU from the productionRequest planning facts (KMPA attached it via the frozen calculateGap owner).
function recoWsGapBySku_(planningFacts) {
  var by = {};
  (planningFacts || []).forEach(function (f) { var sku = recoWsStr_(f.sku || f.masterSku); if (sku && by[sku] === undefined && typeof f.calculatedGap === 'number') by[sku] = f.calculatedGap; });
  return by;
}

// ---- F1-4B-FM1-T pure transport helpers (row-object views + destination expansion; NO SpreadsheetApp) ----------
var RECO_WS_MONTH_ABBR_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
function recoWsToRowObjects_(snap) {
  if (!recoWsIsObj_(snap) || !Array.isArray(snap.headers) || !Array.isArray(snap.rows)) return [];
  var h = snap.headers.map(function (x) { return recoWsStr_(x); });
  return snap.rows.map(function (r) { var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = r[c]; return o; });
}
function recoWsUpcBySku_(skuRows) { var m = {}; (skuRows || []).forEach(function (r) { var s = recoWsStr_(r.sku); if (s && m[s] === undefined) m[s] = recoWsNum_(r.units_per_carton); }); return m; }
function recoWsSiteSkuBySku_(mskRows, scope) {
  var m = {};
  (mskRows || []).forEach(function (r) {
    if (recoWsStr_(r.company) !== scope.company || recoWsStr_(r.country) !== scope.country || recoWsStr_(r.marketplace) !== scope.marketplace) return;
    var s = recoWsStr_(r.sku); if (s && m[s] === undefined) m[s] = recoWsStr_(r.site_sku) || null;
  });
  return m;
}
// Fulfillment authority: the scope's canonical marketplaces row. platform_fulfilled → MARKETPLACE; self_fulfilled →
// WAREHOUSE; hybrid/blank/unknown → null (transport returns DESTINATION_AUTHORITY_UNRESOLVED — never guessed).
function recoWsResolveFulfillment_(mktRows, scope) {
  var rows = (mktRows || []).filter(function (r) { return recoWsStr_(r.company) === scope.company && recoWsStr_(r.country) === scope.country && recoWsStr_(r.marketplace) === scope.marketplace; });
  if (!rows.length) return { mode: null, row: null };
  var active = rows.filter(function (r) { var st = recoWsStr_(r.status).toLowerCase(); return st === 'active' || r.status === true || st === ''; });
  var pick = active.length ? active[0] : rows[0];
  var fm = recoWsStr_(pick.fulfillment_model).toLowerCase();
  if (fm === 'platform_fulfilled') return { mode: 'MARKETPLACE', row: pick };
  if (fm === 'self_fulfilled') return { mode: 'WAREHOUSE', row: pick };
  return { mode: null, row: pick };
}
// Σ Regular FC per month over M+1..M+4 for one sku+scope (month-abbrev columns + year). MISSING month → omitted
// (KMPCX then emits MISSING_FORECAST_WEIGHT_SOURCE → a blocked line, never a fake 0). Conflicting values → omitted.
function recoWsRegularForecastByMonth_(fcRows, scope, sku, months) {
  var out = {};
  (months || []).forEach(function (ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(ym); if (!m) return;
    var year = Number(m[1]), abbr = RECO_WS_MONTH_ABBR_[Number(m[2]) - 1], vals = {};
    (fcRows || []).forEach(function (r) {
      if (recoWsStr_(r.company) !== scope.company || recoWsStr_(r.country) !== scope.country || recoWsStr_(r.marketplace) !== scope.marketplace || recoWsStr_(r.sku) !== sku) return;
      if (Number(r.year) !== year) return;
      var v = r[abbr]; if (v !== '' && v !== null && v !== undefined && isFinite(Number(v))) vals[String(Number(v))] = Number(v);
    });
    var keys = Object.keys(vals);
    if (keys.length === 1) out[ym] = vals[keys[0]];
  });
  return out;
}

// MARKETPLACE expansion → one canonical response line via the unified runtime (order-need; no source-pool allocator).
function recoWsExpandMarketplace_(read, scope, sku, siteSku, calc, vmeta) {
  var snaps = read.snapshots || {};
  var mktRows = recoWsToRowObjects_(snaps.marketplaces), whRows = recoWsToRowObjects_(snaps.warehouses);
  var amazonRows = recoWsToRowObjects_(snaps.amazonInventorySnapshot);
  var shipmentRows = recoWsToRowObjects_(snaps.shipments).filter(function (r) { return recoWsStr_(r.company) === scope.company && recoWsStr_(r.country) === scope.country; });
  var fcRows = recoWsToRowObjects_(snaps.fcRegularForecast);
  var upc = recoWsUpcBySku_(recoWsToRowObjects_(snaps.skuDetails))[sku];
  var nd = KMDR.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: scope.company, country: scope.country, marketplace: scope.marketplace }, { marketplaces: mktRows });
  if (!nd.ok) {
    var code = (nd.issues && nd.issues[0] && nd.issues[0].code) || 'DESTINATION_AUTHORITY_UNRESOLVED';
    return KMDR.buildRecommendationLine({ destination: { destinationType: 'MARKETPLACE', company: scope.company, country: scope.country, marketplace: scope.marketplace, destinationRefId: null, destinationKey: 'MARKETPLACE||' + scope.company + '||' + scope.country + '||' + scope.marketplace + '||' }, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku, blocked: true, blockedReason: code, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf, diagnostics: { issues: [{ code: code, message: (nd.issues && nd.issues[0] && nd.issues[0].message) || '' }] } });
  }
  var months = (typeof KMPCX !== 'undefined' && KMPCX._forecastWeightMonths) ? KMPCX._forecastWeightMonths(calc.calculationMonth) : [];
  var fcByMonth = recoWsRegularForecastByMonth_(fcRows, scope, sku, months);
  var demandQty = 0, haveAll = months.length === 4; months.forEach(function (mm) { if (fcByMonth[mm] == null) haveAll = false; else demandQty += fcByMonth[mm]; });
  var requiredBy = (months[0] || calc.calculationMonth) + '-01';
  var res = KMDR.resolveUnifiedDestinationRecommendation(
    { marketplaces: mktRows, warehouses: whRows, amazonInventory: amazonRows, marketplaceIncomingCandidates: shipmentRows },
    { recommendationType: 'MONTHLY_ORDER', scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku }, destination: { destinationType: 'MARKETPLACE' }, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf },
    { regularForecastByMonth: fcByMonth, unitsPerCarton: upc, requiredByDate: requiredBy }
  );
  var L = res.line || {};
  var partial = L.incomingCompleteness === 'PARTIAL' || L.incomingCompleteness === 'UNAVAILABLE';
  var blockedReason = L.blocked ? (partial ? 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED' : (recoWsStr_(L.blockedReason) || null)) : null;
  return KMDR.buildRecommendationLine({
    destination: nd.destination, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku,
    allocatedForecastQty: haveAll ? demandQty : (demandQty > 0 ? demandQty : null),
    currentStockQty: L.currentStockQty, qualifiedIncomingQty: L.confirmedQualifiedIncomingQty, incomingCompleteness: L.incomingCompleteness,
    calculatedGap: L.calculatedGap, recommendedQty: L.recommendedQty, provisionalOrderNeed: L.provisionalOrderNeed,
    blocked: L.blocked === true, blockedReason: blockedReason, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf,
    diagnostics: { issues: (res.issues || []).map(function (x) { return { code: x.code, message: x.message }; }) }
  });
}

// WAREHOUSE expansion → one canonical line per configured warehouse. Demand is fanned per month by the FROZEN ratio;
// each warehouse runs the FROZEN KMPA→KMPS Weekly path (real source-pool allocator) — the transport NEVER
// reconstructs allocatedSupplyQty. Rule/warehouse problems fail closed as blocked lines with canonical tokens.
function recoWsExpandWarehouse_(read, ss, scope, sku, siteSku, calc, vmeta) {
  var snaps = read.snapshots || {}, lines = [];
  var whRows = recoWsToRowObjects_(snaps.warehouses), ruleRows = recoWsToRowObjects_(snaps.replenishmentDemandAllocationRules), fcRows = recoWsToRowObjects_(snaps.fcRegularForecast);
  var whById = {}; whRows.forEach(function (w) { var id = recoWsStr_(w.warehouse_id); if (id) whById[id] = w; });
  var scopeObj = { company: scope.company, country: scope.country, marketplace: scope.marketplace };
  var active = KMDA.readActiveAllocationRules(ruleRows, scopeObj, calc.calculationMonth);
  var ruleset = KMDA.validateAllocationRules(active, scopeObj, whById);
  if (!ruleset.ok) {
    var iss = (ruleset.issues && ruleset.issues[0]) || { code: 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED' };
    lines.push(KMDR.buildRecommendationLine({ destination: { destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace, destinationRefId: null, warehouseId: null, destinationKey: 'WAREHOUSE||' + scope.company + '||' + scope.country + '||' + scope.marketplace + '||' }, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku, blocked: true, blockedReason: iss.code, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf, diagnostics: { issues: [{ code: iss.code, message: iss.message || '' }] } }));
    return { lines: lines };
  }
  var months = (typeof KMPCX !== 'undefined' && KMPCX._forecastWeightMonths) ? KMPCX._forecastWeightMonths(calc.calculationMonth) : [];
  var fcByMonth = recoWsRegularForecastByMonth_(fcRows, scope, sku, months);
  var override = {}; ruleset.warehouses.forEach(function (w) { override[w.warehouseId] = {}; });
  months.forEach(function (mm) {
    var fcMonth = fcByMonth[mm]; if (fcMonth == null) return;
    var split = KMDA.allocateMarketplaceDemand(fcMonth, ruleset, 'forecast');
    if (split && split.ready) ruleset.warehouses.forEach(function (w) { if (split.byKey && split.byKey[w.warehouseId] != null) override[w.warehouseId][mm] = split.byKey[w.warehouseId]; });
  });
  ruleset.warehouses.forEach(function (w) {
    var nd = KMDR.normalizeRecommendationDestination({ destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace, warehouseId: w.warehouseId }, { warehouses: whRows });
    var node = nd.ok ? nd.destination : { destinationType: 'WAREHOUSE', company: scope.company, country: scope.country, marketplace: scope.marketplace, destinationRefId: w.warehouseId, warehouseId: w.warehouseId, destinationKey: 'WAREHOUSE||' + scope.company + '||' + scope.country + '||' + scope.marketplace + '||' + w.warehouseId };
    var allocatedForecast = 0, cnt = 0; for (var k in override[w.warehouseId]) { allocatedForecast += override[w.warehouseId][k]; cnt++; }
    if (!nd.ok) { lines.push(KMDR.buildRecommendationLine({ destination: node, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku, allocatedForecastQty: cnt ? allocatedForecast : null, blocked: true, blockedReason: (nd.issues && nd.issues[0] && nd.issues[0].code) || 'DESTINATION_WAREHOUSE_INVALID', formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf })); return; }
    var skuReq = { recommendationType: 'WEEKLY_SHIPPING', company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku, destinationWarehouseId: w.warehouseId, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, regularForecastByMonthOverride: override[w.warehouseId], formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf };
    var assembled = KMPA.assembleProductionRecommendationFacts(read, skuReq);
    if (!assembled.ready) { var a0 = (assembled.issues && assembled.issues[0]) || { code: 'RECOMMENDATION_RUNTIME_BLOCKED' }; lines.push(KMDR.buildRecommendationLine({ destination: node, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku, allocatedForecastQty: cnt ? allocatedForecast : null, blocked: true, blockedReason: a0.code, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf, diagnostics: { issues: [{ code: a0.code, message: a0.message || '' }] } })); return; }
    var pr = assembled.productionRequest; pr.preReadSnapshots = read.snapshots;
    var src = KMPS.buildProductionRecommendationSource(ss, pr);
    if (src.ready !== true) { var s0 = (src.issues && src.issues[0]) || {}; var code = s0.code || s0.reason || 'RECOMMENDATION_RUNTIME_BLOCKED'; lines.push(KMDR.buildRecommendationLine({ destination: node, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku, allocatedForecastQty: cnt ? allocatedForecast : null, blocked: true, blockedReason: code, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf, diagnostics: { issues: [{ code: code, message: s0.reason || s0.message || '' }] } })); return; }
    var supply = recoWsSupplyBySku_(src.supplySourceEntries)[sku] || { currentStockQty: 0, qualifiedIncomingQty: 0 };
    var gap = recoWsGapBySku_(pr.planningFacts)[sku]; if (gap === undefined) gap = null;
    var wline = null; (src.lines || []).forEach(function (l) { if (!wline && recoWsStr_(l.masterSku || l.sku) === sku) wline = l; }); if (!wline) wline = (src.lines || [])[0] || null;
    var allocatedSupply = 0; if (wline && wline.allocationBreakdown) wline.allocationBreakdown.forEach(function (b) { if (typeof b.allocatedQty === 'number') allocatedSupply += b.allocatedQty; });
    lines.push(KMDR.buildRecommendationLine({
      destination: node, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku,
      allocatedForecastQty: cnt ? allocatedForecast : null, currentStockQty: supply.currentStockQty, qualifiedIncomingQty: supply.qualifiedIncomingQty, incomingCompleteness: 'COMPLETE',
      calculatedGap: gap, allocatedSupplyQty: wline ? allocatedSupply : null, recommendedQty: (wline && typeof wline.recommendedQty === 'number') ? wline.recommendedQty : null,
      residualShortageQty: (wline && typeof wline.unallocatedQty === 'number') ? wline.unallocatedQty : null,
      blocked: !!(wline && wline.blockedReason), blockedReason: wline ? wline.blockedReason : null,
      formulaVersion: src.formulaVersion || vmeta.formulaVersion, sourceDataAsOf: src.sourceDataAsOf || vmeta.sourceDataAsOf
    }));
  });
  return { lines: lines };
}

function recoWsFilterLines_(lines, filters) {
  return lines.filter(function (l) {
    if (filters.sku && l.sku !== filters.sku) return false;
    if (filters.siteSku && l.siteSku !== filters.siteSku) return false;
    return true;
  });
}
// Stable canonical tie-break: company → country → marketplace → sku → siteSku → destinationWarehouseId.
function recoWsSortLines_(lines, scope) {
  var copy = lines.slice();
  copy.sort(function (a, b) {
    return recoWsCmp_(scope.company, scope.company) || recoWsCmp_(scope.country, scope.country) || recoWsCmp_(scope.marketplace, scope.marketplace) ||
      recoWsCmp_(a.sku, b.sku) || recoWsCmp_(a.siteSku, b.siteSku) || recoWsCmp_(a.destinationWarehouseId, b.destinationWarehouseId);
  });
  return copy;
}
function recoWsCmp_(a, b) { a = recoWsStr_(a); b = recoWsStr_(b); return a < b ? -1 : a > b ? 1 : 0; }
function recoWsPaginate_(rows, page, size) {
  var total = rows.length, totalPages = size > 0 ? Math.ceil(total / size) : 0, start = (page - 1) * size;
  return { items: (start >= 0 && start < total) ? rows.slice(start, start + size) : [], page: page, size: size, total: total, totalPages: totalPages };
}

// PURE — distinct SKUs in scope from the marketplace_skus snapshot ({headers, rows}); optional exact SKU filter.
// The recommendation runtime is per-SKU (the shipment lifecycle scope carries one masterSku), so the endpoint
// resolves the SKU set here and runs the runtime once per SKU (ONE request, an internal loop — never per-SKU HTTP).
function recoWsScopeSkus_(mskSnapshot, scope, skuFilter) {
  if (!recoWsIsObj_(mskSnapshot) || !Array.isArray(mskSnapshot.headers) || !Array.isArray(mskSnapshot.rows)) return [];
  var h = mskSnapshot.headers.map(function (x) { return recoWsStr_(x); });
  var iSku = h.indexOf('sku'), iCo = h.indexOf('company'), iCn = h.indexOf('country'), iMk = h.indexOf('marketplace');
  if (iSku < 0) return [];
  var seen = {}, out = [];
  mskSnapshot.rows.forEach(function (r) {
    if (iCo >= 0 && recoWsStr_(r[iCo]) !== scope.company) return;
    if (iCn >= 0 && recoWsStr_(r[iCn]) !== scope.country) return;
    if (iMk >= 0 && recoWsStr_(r[iMk]) !== scope.marketplace) return;
    var sku = recoWsStr_(r[iSku]); if (!sku) return;
    if (skuFilter && sku !== skuFilter) return;
    if (!seen[sku]) { seen[sku] = 1; out.push(sku); }
  });
  out.sort(recoWsCmp_);
  return out;
}

// PURE View-Model builder: validated request + canonical destination lines → bounded page-oriented response.
// Stable sort by recommendationMode → sku → siteSku → destinationKey (never row index / array position / label).
function recommendationWorkspaceBuild_(v, calc, lines) {
  var filtered = recoWsFilterLines_(lines, v.filters);
  var sorted = filtered.slice().sort(function (a, b) {
    return recoWsCmp_(a.recommendationMode, b.recommendationMode) || recoWsCmp_(a.sku, b.sku) || recoWsCmp_(a.siteSku, b.siteSku) || recoWsCmp_(a.destinationKey, b.destinationKey);
  });
  var pageRes = recoWsPaginate_(sorted, v.page, v.size);
  return {
    scope: { company: v.scope.company, country: v.scope.country, marketplace: v.scope.marketplace, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle },
    lines: pageRes.items,
    pagination: { page: pageRes.page, size: pageRes.size, total: pageRes.total, totalPages: pageRes.totalPages },
    dataVersion: { formulaVersion: v.formulaVersion, sourceDataAsOf: v.sourceDataAsOf }
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb / never writes.
// --------------------------------------------------------------------------------------------------------
function recommendationWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },                            // API diagnostic layer only
    nextSeq: function () { RECO_WS_SEQ_++; return RECO_WS_SEQ_; },
    // F1-4B-FM1-T calculation-month configuration authority (Script Property; NO clock). Injectable in tests.
    configMonth: function () { try { return PropertiesService.getScriptProperties().getProperty('RECOMMENDATION_CALCULATION_MONTH'); } catch (e) { return null; } },
    openTarget: function () {
      var id = prodExpectedDbId_();
      if (!id) throw prodSchemaError_('WRONG_SPREADSHEET_TARGET', '', null);
      var ss = SpreadsheetApp.openById(id);
      prodAssertDbTarget_(ss, id);                                       // exact-ID gate (fail closed) before any read
      return ss;
    }
  };
}

function handleRecommendationWorkspaceGet_(body, io) {
  io = io || recommendationWorkspaceDefaultIo_();
  var t0 = io.now();
  var reqId = recoWsRequestId_(body && body.requestId, io);
  try {
    if (typeof KMPA === 'undefined' || typeof KMPS === 'undefined' || typeof KMDR === 'undefined' || typeof KMDA === 'undefined') {
      return recoWsEnvelope_(false, null, [recoWsErr_('RECOMMENDATION_RUNTIME_BLOCKED', 'recommendation runtime bundle (KMPA/KMPS/KMDR/KMDA) not present')], { requestId: reqId, serverDurationMs: (io.now() - t0) });
    }
    var v = validateRecommendationWorkspaceRequest_(body && body.payload);   // scope-only; fails BEFORE any read
    if (!v.ok) return recoWsEnvelope_(false, null, [v.error], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, sourceReadCount: 0 });
    var calc = recoWsResolveCalcContext_(io);                                // server-owned month/cycle (no clock)
    if (!calc.ok) return recoWsEnvelope_(false, null, [calc.error], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0, sourceReadCount: 0, calculationMonth: null, planningCycle: null });

    var ss = io.openTarget();                                                // exact-ID validated / fail closed
    var read = KMPS.readCanonicalSnapshots(ss, null);                        // ONE targeted read per request (never getOperationDb)
    var tablesRead = read && read.snapshots ? Object.keys(read.snapshots).length : 0;
    var snaps = read.snapshots || {};

    var scopeSkus = recoWsScopeSkus_(snaps.marketplaceSkus, v.scope, v.scope.sku || null);
    if (!scopeSkus.length) return recoWsEnvelope_(false, null, [recoWsErr_('MISSING_SKU_MAPPING', 'no marketplace_skus row for the scope (company/country/marketplace)')], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead, sourceReadCount: 1, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle });
    var siteSkuBySku = recoWsSiteSkuBySku_(recoWsToRowObjects_(snaps.marketplaceSkus), v.scope);
    var ful = recoWsResolveFulfillment_(recoWsToRowObjects_(snaps.marketplaces), v.scope);
    var vmeta = { formulaVersion: v.formulaVersion, sourceDataAsOf: v.sourceDataAsOf };

    // Server destination expansion → unified runtime per SKU × destination. Dedup by stable line identity.
    var lines = [], seen = {}, issues = [];
    for (var i = 0; i < scopeSkus.length; i++) {
      var sku = scopeSkus[i], siteSku = siteSkuBySku[sku] || null, produced;
      if (ful.mode === 'MARKETPLACE') produced = [recoWsExpandMarketplace_(read, v.scope, sku, siteSku, calc, vmeta)];
      else if (ful.mode === 'WAREHOUSE') produced = recoWsExpandWarehouse_(read, ss, v.scope, sku, siteSku, calc, vmeta).lines;
      else produced = [KMDR.buildRecommendationLine({ destination: { destinationType: null, company: v.scope.company, country: v.scope.country, marketplace: v.scope.marketplace, destinationKey: 'UNRESOLVED||' + v.scope.company + '||' + v.scope.country + '||' + v.scope.marketplace + '||' + sku }, recommendationMode: 'UNRESOLVED', sku: sku, siteSku: siteSku, blocked: true, blockedReason: 'DESTINATION_AUTHORITY_UNRESOLVED', formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf })];
      for (var p = 0; p < produced.length; p++) {
        var ln = produced[p]; if (!ln) continue;
        if (seen[ln.recommendationLineId]) { issues.push(recoWsErr_('RECOMMENDATION_LINE_IDENTITY_CONFLICT', 'duplicate recommendation line identity: ' + ln.recommendationLineId)); continue; }
        seen[ln.recommendationLineId] = 1; lines.push(ln);
      }
    }
    if (!lines.length && issues.length) return recoWsEnvelope_(false, null, issues, { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead, sourceReadCount: 1, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle });

    var vm = recommendationWorkspaceBuild_(v, calc, lines);
    return recoWsEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead, sourceReadCount: 1, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, conflicts: issues.length });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'INTERNAL_ERROR';
    return recoWsEnvelope_(false, null, [recoWsErr_(code, String(e && e.message || e), (e && e.schemaDetail) || null)], { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
