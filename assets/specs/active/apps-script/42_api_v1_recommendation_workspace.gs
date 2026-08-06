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

// Request validation — mandatory scope + destination + calc month + planning cycle; page size bounded. Runs BEFORE
// any table read; returns { ok:true, request } or { ok:false, error }. No implicit company/site/warehouse/month.
function validateRecommendationWorkspaceRequest_(payload) {
  payload = recoWsIsObj_(payload) ? payload : {};
  var scope = recoWsIsObj_(payload.scope) ? payload.scope : {};
  var company = recoWsStr_(scope.company), country = recoWsStr_(scope.country), marketplace = recoWsStr_(scope.marketplace);
  var dest = recoWsStr_(payload.destinationWarehouseId);
  var calcMonth = recoWsStr_(payload.calculationMonth), planningCycle = recoWsStr_(payload.planningCycle);
  if (!company || !country || !marketplace) return { ok: false, error: recoWsErr_('VALIDATION_FAILED', 'scope.company/country/marketplace are mandatory (no implicit first company/marketplace)', { scope: scope }) };
  if (!dest) return { ok: false, error: recoWsErr_('MISSING_DESTINATION_WAREHOUSE', 'destinationWarehouseId is mandatory (no automatic destination selection)') };
  if (!/^\d{4}-\d{2}$/.test(calcMonth)) return { ok: false, error: recoWsErr_('MISSING_CALCULATION_MONTH', 'calculationMonth ("YYYY-MM") is mandatory (no browser/current-month inference)') };
  if (!planningCycle) return { ok: false, error: recoWsErr_('MISSING_PLANNING_CYCLE', 'planningCycle is mandatory') };
  if (recoWsIsObj_(payload.filters) && payload.filters.demandDriver && recoWsStr_(payload.filters.demandDriver).toUpperCase() !== 'FORECAST') {
    return { ok: false, error: recoWsErr_('UNSUPPORTED_PHASE1_DEMAND_DRIVER', 'Phase-1 demandDriver is FORECAST only; no client override') };
  }
  var filters = recoWsIsObj_(payload.filters) ? payload.filters : {};
  var pg = recoWsIsObj_(payload.pagination) ? payload.pagination : {};
  var size = recoWsNum_(pg.size); size = (size && size > 0) ? Math.min(Math.floor(size), RECO_WS_PAGE_MAX_) : RECO_WS_PAGE_DEFAULT_;
  var page = recoWsNum_(pg.page); page = (page && page > 0) ? Math.floor(page) : 1;
  return {
    ok: true,
    request: {
      recommendationType: 'WEEKLY_SHIPPING', company: company, country: country, marketplace: marketplace,
      sku: recoWsStr_(filters.sku) || null, destinationWarehouseId: dest, calculationMonth: calcMonth, planningCycle: planningCycle,
      formulaVersion: recoWsStr_(payload.formulaVersion) || null, sourceDataAsOf: recoWsStr_(payload.sourceDataAsOf) || null
    },
    filters: { sku: recoWsStr_(filters.sku) || null, siteSku: recoWsStr_(filters.siteSku) || null, category: recoWsStr_(filters.category) || null, series: recoWsStr_(filters.series) || null },
    page: page, size: size, include: recoWsIsObj_(payload.include) ? payload.include : {}
  };
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

// Map one bridge/resolver line → response line. Only source-proven runtime outputs; NEVER invents coverage/DOS/etc.
function recoWsMapLine_(line, ctx) {
  var sku = recoWsStr_(line.sku || line.masterSku);
  var supply = ctx.supplyBySku[sku] || { currentStockQty: 0, qualifiedIncomingQty: 0 };
  var gap = (ctx.gapBySku[sku] === undefined) ? null : ctx.gapBySku[sku];
  return {
    sku: sku, siteSku: recoWsStr_(line.site_sku || line.siteSku),
    destinationWarehouseId: ctx.destinationWarehouseId,
    currentStockQty: supply.currentStockQty, qualifiedIncomingQty: supply.qualifiedIncomingQty,
    calculatedGap: gap,
    recommendedQty: (typeof line.recommendedQty === 'number') ? line.recommendedQty : null,
    blocked: line.blocked === true, blockedReason: line.blocked === true ? (recoWsStr_(line.reason) || null) : null,
    formulaVersion: ctx.formulaVersion, sourceDataAsOf: ctx.sourceDataAsOf,
    diagnostics: { issues: [] }
  };
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

// PURE View-Model builder: validated request + AGGREGATED per-SKU runtime output → bounded page-oriented response.
function recommendationWorkspaceBuild_(v, aggregated) {
  var ctx = {
    destinationWarehouseId: v.request.destinationWarehouseId,
    supplyBySku: recoWsSupplyBySku_(aggregated.supplySourceEntries),
    gapBySku: recoWsGapBySku_(aggregated.planningFacts),
    formulaVersion: aggregated.formulaVersion || v.request.formulaVersion || null,
    sourceDataAsOf: aggregated.sourceDataAsOf || v.request.sourceDataAsOf || null
  };
  var mapped = (aggregated.lines || []).map(function (l) { return recoWsMapLine_(l, ctx); });
  var filtered = recoWsFilterLines_(mapped, v.filters);
  var sorted = recoWsSortLines_(filtered, v.request);
  var pageRes = recoWsPaginate_(sorted, v.page, v.size);
  return {
    scope: { company: v.request.company, country: v.request.country, marketplace: v.request.marketplace, destinationWarehouseId: v.request.destinationWarehouseId, calculationMonth: v.request.calculationMonth, planningCycle: v.request.planningCycle },
    lines: pageRes.items,
    pagination: { page: pageRes.page, size: pageRes.size, total: pageRes.total, totalPages: pageRes.totalPages },
    dataVersion: { formulaVersion: ctx.formulaVersion, sourceDataAsOf: ctx.sourceDataAsOf }
  };
}

// --------------------------------------------------------------------------------------------------------
// IMPURE orchestrator — injectable io (default = live Apps Script). NEVER calls getOperationDb / never writes.
// --------------------------------------------------------------------------------------------------------
function recommendationWorkspaceDefaultIo_() {
  return {
    now: function () { return Date.now(); },                            // API diagnostic layer only
    nextSeq: function () { RECO_WS_SEQ_++; return RECO_WS_SEQ_; },
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
  var metaBase = { requestId: reqId };
  try {
    if (typeof KMPA === 'undefined' || typeof KMPS === 'undefined') {
      return recoWsEnvelope_(false, null, [recoWsErr_('RECOMMENDATION_RUNTIME_BLOCKED', 'recommendation runtime bundle (KMPA/KMPS) not present')], { requestId: reqId, serverDurationMs: (io.now() - t0) });
    }
    var v = validateRecommendationWorkspaceRequest_(body && body.payload);
    if (!v.ok) return recoWsEnvelope_(false, null, [v.error], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: 0 });  // fail BEFORE any read

    var ss = io.openTarget();                                            // exact-ID validated / fail closed
    var read = KMPS.readCanonicalSnapshots(ss, null);                    // targeted canonical tables ONCE (never getOperationDb)
    var tablesRead = read && read.snapshots ? Object.keys(read.snapshots).length : 0;

    var scopeSkus = recoWsScopeSkus_(read.snapshots && read.snapshots.marketplaceSkus, v.request, null);
    if (!scopeSkus.length) return recoWsEnvelope_(false, null, [recoWsErr_('MISSING_SKU_MAPPING', 'no marketplace_skus row for the scope (company/country/marketplace)')], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead });
    // Optional SKU filter narrows which in-scope SKUs to compute; a filter that matches nothing → successful empty page.
    var skus = v.request.sku ? scopeSkus.filter(function (s) { return s === v.request.sku; }) : scopeSkus;

    // Per-SKU runtime (the shipment lifecycle scope is single-master-SKU). Aggregate lines; collect per-SKU issues.
    var agg = { lines: [], supplySourceEntries: [], planningFacts: [], formulaVersion: null, sourceDataAsOf: null };
    var issues = [];
    for (var i = 0; i < skus.length; i++) {
      var skuReq = {}; for (var k in v.request) skuReq[k] = v.request[k]; skuReq.sku = skus[i];
      var assembled = KMPA.assembleProductionRecommendationFacts(read, skuReq);
      if (!assembled.ready) { (assembled.issues || []).forEach(function (x) { issues.push(recoWsErr_(x.code, x.message, x.details)); }); continue; }
      var src = KMPS.buildProductionRecommendationSource(ss, assembled.productionRequest);
      if (src.ready !== true) { (src.issues || []).forEach(function (x) { issues.push(recoWsErr_(x.code || x.reason || 'RECOMMENDATION_RUNTIME_BLOCKED', x.reason || x.message || 'runtime blocked', null)); }); continue; }
      (src.lines || []).forEach(function (l) { agg.lines.push(l); });
      (src.supplySourceEntries || []).forEach(function (e) { agg.supplySourceEntries.push(e); });
      (assembled.productionRequest.planningFacts || []).forEach(function (f) { agg.planningFacts.push(f); });
      if (agg.formulaVersion === null) agg.formulaVersion = src.formulaVersion || null;
      if (agg.sourceDataAsOf === null) agg.sourceDataAsOf = src.sourceDataAsOf || null;
    }
    // No lines produced AND blocking issues present → structured failure (never a fake-zero success).
    if (!agg.lines.length && issues.length) {
      return recoWsEnvelope_(false, null, issues, { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead });
    }
    var vm = recommendationWorkspaceBuild_(v, agg);
    return recoWsEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'INTERNAL_ERROR';
    return recoWsEnvelope_(false, null, [recoWsErr_(code, String(e && e.message || e), (e && e.schemaDetail) || null)], { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
