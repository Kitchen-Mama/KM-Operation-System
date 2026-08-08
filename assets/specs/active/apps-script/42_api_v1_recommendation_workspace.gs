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
    // F1-4B-FM5-R2b: additive, server-internal per-receiver Overseas/Factory allocation injected by the Order Planning
    // materialization batch (never client-driven; absent for a normal read → Site-Stock-only monthly opening).
    supplyAllocationByReceiver: recoWsIsObj_(payload.supplyAllocationByReceiver) ? payload.supplyAllocationByReceiver : null,
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

// F1-4B-FM4a calculation-DAY authority — a SEPARATE server-owned Script Property RECOMMENDATION_CALCULATION_DATE
// (YYYY-MM-DD) anchoring the day-horizon (D18/D30/D45/D90) projection. NO browser/server clock, NO new Date(), and
// NEVER derived from RECOMMENDATION_CALCULATION_MONTH. Missing/malformed → fail closed (canonical codes). This is
// ADDITIVE: it gates ONLY line.horizons; the existing monthly/OP response is unaffected when it is absent.
function recoWsResolveCalcDate_(io) {
  var raw = recoWsStr_((io && typeof io.configDate === 'function') ? io.configDate() : '');
  if (!raw) return { ok: false, error: recoWsErr_('RECOMMENDATION_CALCULATION_DATE_NOT_CONFIGURED', 'RECOMMENDATION_CALCULATION_DATE is not configured (no clock fallback)') };
  if (!/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(raw)) return { ok: false, error: recoWsErr_('RECOMMENDATION_CALCULATION_DATE_INVALID', 'RECOMMENDATION_CALCULATION_DATE must be YYYY-MM-DD (got "' + raw + '")') };
  return { ok: true, calculationDate: raw };
}
// Months (YYYY-MM) the day-horizon window spans: calcDate's month through (calcDate + maxDays)'s month, inclusive.
// Read-scope only (which FC months to fetch); the canonical daily-distribution ÷ days-in-month lives in KMHP.
function recoWsHorizonWindowMonths_(calcDate, maxDays) {
  var y = +calcDate.slice(0, 4), m = +calcDate.slice(5, 7), d = +calcDate.slice(8, 10);
  function leap(Y) { return (Y % 4 === 0 && Y % 100 !== 0) || (Y % 400 === 0); }
  function dim(Y, M) { return [31, leap(Y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][M - 1]; }
  function key(Y, M) { return Y + '-' + (M < 10 ? '0' : '') + M; }
  var seen = {}, out = []; function add(Y, M) { var k = key(Y, M); if (!seen[k]) { seen[k] = 1; out.push(k); } }
  add(y, m);
  for (var i = 0; i < maxDays; i++) { d++; if (d > dim(y, m)) { d = 1; m++; if (m > 12) { m = 1; y++; } } add(y, m); }
  return out;
}
// F1-4B-FM5-R4UI-R3 — resolve the SKU's canonical Planning Model from marketplace_skus.replenishment_model
// (00_config VALID_REPLENISHMENT_MODELS_ = sales_driven | forecast_driven; the master-data writer defaults new rows
// to 'sales_driven'). scope+sku exact. A blank cell → 'sales_driven' (the DB default); any OTHER non-empty value is
// returned verbatim so KMHP fails closed (PLANNING_MODEL_UNKNOWN) rather than this layer guessing a mode.
function recoWsResolvePlanningModel_(snaps, scope, sku) {
  var rows = recoWsToRowObjects_(snaps.marketplaceSkus);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (recoWsStr_(r.sku) !== sku) continue;
    if (recoWsStr_(r.company) !== '' && recoWsStr_(r.company) !== scope.company) continue;
    if (recoWsStr_(r.country) !== scope.country || recoWsStr_(r.marketplace) !== scope.marketplace) continue;
    var m = recoWsStr_(r.replenishment_model);
    return m === '' ? 'sales_driven' : m;
  }
  return 'sales_driven';
}

// F1-4B-FM5-R4UI-R3a — marshal the CANONICAL contamination-day facts into the run-rate owner. The owner (§22)
// excludes campaign/event SELLING days from the NORMAL-day window; it consumes:
//   • campaigns: [{ status, start, end, skuLines:[{ marketplaceSkuId, sku }] }]  (campaigns + campaign_sku_lines)
//   • events:    [{ sku, status, marketplaceId, company, country, marketplace, start, end }]  (fc_special_events)
// This layer INVENTS no contamination definition — it only shapes existing rows; the owner OWNS the match/exclude
// logic (marketplace_sku_id identity for campaigns; sku + marketplace_id-authoritative / composite for events) and
// its own ambiguous-identity fail-fast. Availability is differentiated (§3): a MISSING campaigns/campaign_sku_lines
// or fc_special_events sheet is source-UNAVAILABLE (never silently "no contamination"); a PRESENT-but-empty source
// is the legitimate "zero contaminated days"; an ambiguous identity (owner throw) is a distinct conflict. Returns
// { ok:true, campaigns, events } or { ok:false, reason }.
function recoWsBuildContaminationFacts_(snaps, scope, sku, mSkuId) {
  // (B) source availability — the sheets must be PRESENT (readCanonicalSnapshots omits the key when the sheet is
  // absent). A present-but-empty sheet is (A) "zero contaminated days" and is kept, never conflated with (B).
  if (!recoWsIsObj_(snaps.campaigns) || !recoWsIsObj_(snaps.campaignSkuLines) || !recoWsIsObj_(snaps.fcSpecialEvents)) {
    return { ok: false, reason: 'CONTAMINATION_SOURCE_UNAVAILABLE' };
  }
  var linesByCampaign = {};
  recoWsToRowObjects_(snaps.campaignSkuLines).forEach(function (r) {
    var cid = recoWsStr_(r.campaign_id); if (!cid) return;
    (linesByCampaign[cid] = linesByCampaign[cid] || []).push({ marketplaceSkuId: recoWsStr_(r.marketplace_sku_id) || null, sku: recoWsStr_(r.sku) });
  });
  var campaigns = [];
  recoWsToRowObjects_(snaps.campaigns).forEach(function (c) {
    var cid = recoWsStr_(c.campaign_id); if (!cid) return;
    var lines = linesByCampaign[cid] || [];
    // Only campaigns that TOUCH this SKU (by our marketplace_sku_id or the master sku) are relevant. Their FULL
    // line set is passed so the owner can apply its own identity guard (a master-sku line missing marketplace_sku_id
    // → owner throws → treated as an ambiguous conflict upstream, never silently dropped).
    var touches = lines.some(function (ln) { return (mSkuId && ln.marketplaceSkuId === mSkuId) || (ln.sku && recoWsStr_(ln.sku) === sku); });
    if (!touches) return;
    campaigns.push({ status: recoWsStr_(c.status), start: recoWsStr_(c.start_date), end: recoWsStr_(c.end_date), skuLines: lines });
  });
  var events = [];
  recoWsToRowObjects_(snaps.fcSpecialEvents).forEach(function (r) {
    if (recoWsStr_(r.sku) !== sku) return;
    events.push({ sku: recoWsStr_(r.sku), status: recoWsStr_(r.status), marketplaceId: recoWsStr_(r.marketplace_id) || null,
      company: recoWsStr_(r.company), country: recoWsStr_(r.country), marketplace: recoWsStr_(r.marketplace),
      start: recoWsStr_(r.event_start_date) || recoWsStr_(r.eventStartDate), end: recoWsStr_(r.event_end_date) || recoWsStr_(r.eventEndDate) });
  });
  return { ok: true, campaigns: campaigns, events: events };
}

// F1-4B-FM5-R4UI-R3 (+R3a) — Sales-Driven canonical run-rate via the FROZEN KMCALC.normalizedAvgSalesPerDay owner
// (§22: latest ≤30 confirmed NORMAL days inside the 90 completed-day window ÷ actual normal-day count, campaign/event
// selling days EXCLUDED (R3a); <3 normal days → weekly_7d ÷ 7). This layer creates NO second averaging engine — it
// only marshals the owner's inputs. Returns { ok:true, avgSalesPerDay, source, warning } or a differentiated
// { ok:false, reason } → the caller fail-closes to a truthful BLOCKED (never a silent forecast substitution, never a
// fabricated 0, never a thrown scope failure). company is stamped from the resolved scope (amazon_daily_sales_snapshot
// carries no company column; one scope = one company); channel is derived from the scoped rows and MUST be
// unambiguous; marketplaceId is resolved from the marketplaces registry (required by the owner for ID-bearing events).
// Reasons (§3): SALES_BASIS_UNAVAILABLE = no scoped daily-sales history · SALES_BASIS_AMBIGUOUS = ambiguous channel
// or an owner identity conflict · CONTAMINATION_SOURCE_UNAVAILABLE = a contamination source sheet is missing.
function recoWsResolveSalesRate_(snaps, scope, sku, calcDate) {
  if (typeof KMCALC === 'undefined' || !KMCALC || typeof KMCALC.normalizedAvgSalesPerDay !== 'function') return { ok: false, reason: 'SALES_RUNTIME_UNAVAILABLE' };
  if (!calcDate) return { ok: false, reason: 'CALCULATION_DATE_NOT_CONFIGURED' };
  var daily = recoWsToRowObjects_(snaps.amazonDailySalesSnapshot).filter(function (r) {
    return recoWsStr_(r.sku) === sku && recoWsStr_(r.country) === scope.country && recoWsStr_(r.marketplace) === scope.marketplace;
  });
  if (!daily.length) return { ok: false, reason: 'SALES_BASIS_UNAVAILABLE' };
  var chSet = {}; daily.forEach(function (r) { chSet[recoWsStr_(r.channel)] = 1; });
  var chKeys = Object.keys(chSet);
  if (chKeys.length !== 1) return { ok: false, reason: 'SALES_BASIS_AMBIGUOUS' };   // 0 or ambiguous channel → fail closed (conflict)
  var channel = chKeys[0];
  var weekly = recoWsToRowObjects_(snaps.amazonWeeklySalesSnapshot).filter(function (r) {
    return recoWsStr_(r.sku) === sku && recoWsStr_(r.country) === scope.country && recoWsStr_(r.marketplace) === scope.marketplace && recoWsStr_(r.channel) === channel;
  });
  var weekly7d = 0;
  if (weekly.length) {
    weekly.sort(function (a, b) { return recoWsCmp_(recoWsStr_(a.week_end_date), recoWsStr_(b.week_end_date)); });
    var wv = recoWsNum_(weekly[weekly.length - 1].sales_units_7d); weekly7d = (wv === null || wv < 0) ? 0 : wv;   // latest week; the <3-day fallback rung only
  }
  var dailySales = daily.map(function (r) {
    return { date: recoWsStr_(r.snapshot_date), sku: sku, units: recoWsNum_(r.sales_units), company: scope.company, country: scope.country, marketplace: scope.marketplace, channel: channel };
  });
  var mSkuId = null, mskRows = recoWsToRowObjects_(snaps.marketplaceSkus);
  for (var i = 0; i < mskRows.length; i++) { var mr = mskRows[i]; if (recoWsStr_(mr.sku) === sku && recoWsStr_(mr.country) === scope.country && recoWsStr_(mr.marketplace) === scope.marketplace) { mSkuId = recoWsStr_(mr.marketplace_sku_id) || null; break; } }
  // scope marketplace_id — the owner treats an event's marketplace_id as AUTHORITATIVE and fail-fasts on an
  // ID-bearing event when the scope marketplace_id is unresolved, so resolve it from the marketplaces registry.
  var scopeMktId = null;
  recoWsToRowObjects_(snaps.marketplaces).forEach(function (m) { if (scopeMktId) return; if (recoWsStr_(m.company) === scope.company && recoWsStr_(m.country) === scope.country && recoWsStr_(m.marketplace) === scope.marketplace) scopeMktId = recoWsStr_(m.marketplace_id) || null; });
  // R3a — real contamination facts (never []). A missing source fail-closes distinctly (never silent no-contamination).
  var contam = recoWsBuildContaminationFacts_(snaps, scope, sku, mSkuId);
  if (!contam.ok) return { ok: false, reason: contam.reason };
  try {
    var res = KMCALC.normalizedAvgSalesPerDay({
      calcDate: calcDate,
      scope: { sku: sku, country: scope.country, marketplace: scope.marketplace, channel: channel, company: scope.company, marketplaceId: scopeMktId, marketplaceSkuId: mSkuId },
      weekly7d: weekly7d, dailySales: dailySales, campaigns: contam.campaigns, events: contam.events
    });
    var v = (res && typeof res.avgSalesPerDay === 'number' && isFinite(res.avgSalesPerDay) && res.avgSalesPerDay >= 0) ? res.avgSalesPerDay : null;
    if (v === null) return { ok: false, reason: 'SALES_BASIS_UNAVAILABLE' };
    return { ok: true, avgSalesPerDay: v, source: res.source, warning: res.warning, normalDayCount: res.normalDayCount, excludedDates: res.excludedDates };
  } catch (e) { return { ok: false, reason: 'SALES_BASIS_AMBIGUOUS' }; }   // owner identity conflict (§3 case C)
}

// Build the additive per-destination day-horizon projection via the frozen KMHP owner. Returns null (→ line.horizons
// absent → materialized BLOCKED) when unavailable (KMHP not bundled, calc-DATE not configured, opening unavailable, a
// covered month's FC missing on the forecast path, or the Sales-Driven basis unresolvable) — never a fabricated
// horizon. incomingEvents = the SAME ETA-dated events used by monthlyProjection.
// F1-4B-FM5-R4UI-R3 — the Planning Model split lives HERE: forecast_driven → Target%-adjusted regular FC ÷ real days
// (Authority E, unchanged); sales_driven → the canonical §22 run-rate (avgSalesPerDay), NO regular FC and NO Target%.
// Special-event prep-dated demand (Authority F) is additive in BOTH paths (count-once). demandMode + avgSalesPerDay
// are caller-resolved and passed to KMHP verbatim; an unknown model fails closed inside KMHP (PLANNING_MODEL_UNKNOWN).
function recoWsBuildHorizons_(calc, fcRows, tgtRows, evtRows, skuMeta, scope, sku, openingSupplyQty, incomingEvents, unitsPerCarton, destination, demandMode, avgSalesPerDay) {
  if (typeof KMHP === 'undefined' || !KMHP || typeof KMHP.projectHorizons !== 'function') return null;
  if (!calc || !calc.calculationDate) return null;
  var mode = (demandMode === 'sales_driven' || demandMode === 'forecast_driven') ? demandMode : 'forecast_driven';
  var winMonths = recoWsHorizonWindowMonths_(calc.calculationDate, 90);
  var hFc = {}, specialEventDemands = [];
  if (typeof KMPD !== 'undefined' && KMPD && typeof KMPD.adjustedRegularFc === 'function') {
    // Forecast-Driven base demand (Authority E). Skipped by KMHP under sales_driven, but the special-event preps
    // (Authority F) are model-agnostic and additive in BOTH paths, so they are always resolved from the ONE owner.
    if (mode === 'forecast_driven') winMonths.forEach(function (ym) { var a = KMPD.adjustedRegularFc(fcRows, tgtRows, skuMeta, scope, sku, ym); if (a) hFc[ym] = a.adjusted; });
    specialEventDemands = KMPD.scopedSpecialEventPreps(evtRows, scope, sku);
  } else if (mode === 'forecast_driven') {
    hFc = recoWsRegularForecastByMonth_(fcRows, scope, sku, winMonths);   // fallback: raw (KMPD absent)
  }
  var hr = KMHP.projectHorizons({ destination: destination || null, calculationDate: calc.calculationDate,
    openingSupplyQty: openingSupplyQty, regularFcByMonth: hFc, specialEventDemands: specialEventDemands,
    incomingEvents: incomingEvents || [], unitsPerCarton: unitsPerCarton,
    demandMode: mode, avgSalesPerDay: (mode === 'sales_driven' ? avgSalesPerDay : null) });
  return (hr && hr.ready) ? hr.horizons : null;
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

// ---- F1-4B-FM3c-2 canonical monthly-projection transport (server/runtime owned; delegates ALL math) ----------
// Tiers T1..T4 = M+1..M+4 (the frozen KMPCX window); each tier's checkpoint/required-by = the tier month's first
// calendar day (YYYY-MM-01) — an allowed derivation from the frozen monthly window (NO clock, NO day-horizon).
var RECO_WS_TIERS_ = ['T1', 'T2', 'T3', 'T4'];

// One warehouse's OWN opening supply = Σ CURRENT_STOCK supplyRows for that warehouse_id. Missing (zero rows) →
// null (UNKNOWN), never a fabricated 0; an explicit 0-qty row is a truthful 0. Per-warehouse (never pooled).
function recoWsWarehouseOpeningStock_(supplySourceEntries, warehouseId) {
  var sum = 0, found = false;
  (supplySourceEntries || []).forEach(function (e) {
    if (recoWsStr_(e.lifecycle_bucket) !== 'CURRENT_STOCK') return;
    if (recoWsStr_(e.warehouse_id) !== warehouseId) return;
    var q = recoWsNum_(e.quantity); if (q === null) return;
    sum += q; found = true;
  });
  return found ? sum : null;
}

// F1-4B-FM5-R2b (§7) — PURE Order Planning OPENING-SUPPLY composition owner. It ADDS source-proven canonical
// quantities into the SINGLE KMTPP opening supply: Site Stock (frozen MARKETPLACE Site Stock owner, Authority A)
// + allocated eligible Overseas + allocated eligible Factory. It contains NO allocation math — the distribution is
// the frozen KMMSA/KMALLOC's (§4/§5/§6); this helper only sums already-decided quantities. Missing Site Stock
// (null) → null opening (KMTPP then fails closed; missing ≠ 0). An explicit 0 stays 0. Overseas/Factory absent
// (no injected allocation) → 0 each, so opening == Site Stock and the monthly projection is byte-identical to the
// pre-R2b behaviour (fully additive / backward-compatible). Returns the auditable composition facts (§7).
function recoWsComposeOpeningSupply_(siteStockQty, allocatedOverseasQty, allocatedFactoryQty) {
  var site = recoWsNum_(siteStockQty);
  var ov = recoWsNum_(allocatedOverseasQty); if (ov === null) ov = 0;
  var fc = recoWsNum_(allocatedFactoryQty); if (fc === null) fc = 0;
  var opening = (site === null) ? null : (site + ov + fc);
  return { siteStockQty: site, allocatedOverseasQty: ov, allocatedFactoryQty: fc, openingSupplyQty: opening };
}

// Build the additive per-tier monthlyProjection for ONE canonical destination by delegating EVERY chronological
// balance/carry-forward/count-once decision to the frozen KMTPP owner and EVERY per-tier carton suggestion to the
// frozen KMCALC Monthly-CEIL owner. Returns null (→ line.monthlyProjection simply absent) when it cannot be built
// TRUTHFULLY: KMTPP not bundled, no 4-month window, a missing forecast month, or KMTPP itself not ready (e.g.
// opening supply unavailable). NEVER fabricates a number and NEVER re-implements gap/ceil math here.
//   months          : ['YYYY-MM' × 4] (M+1..M+4)
//   openingSupplyQty : canonical destination opening stock (number ≥0, or null → UNKNOWN → KMTPP fails closed)
//   demandByMonth    : { 'YYYY-MM': qty } — must contain all 4 tier months (missing → truthful block, not 0)
//   incomingEvents   : [{ incomingId, eta, qty, sourceType }] — already count-once, ETA-dated (marketplace
//                      line.qualifiedEvents OR the warehouse-filtered warehouseQualifiedEvents; never reconstructed)
//   unitsPerCarton   : canonical UPC for the carton owner (missing/invalid → suggestedOrderQty null + honest)
//   destination      : canonical destination object (diagnostic passthrough into KMTPP)
function recoWsBuildMonthlyProjection_(months, openingSupplyQty, demandByMonth, incomingEvents, unitsPerCarton, destination, preT1Demand, preT1Date) {
  if (typeof KMTPP === 'undefined' || !KMTPP || typeof KMTPP.projectTimePhasedSupply !== 'function') return null;
  if (!Array.isArray(months) || months.length !== 4) return null;
  var demandEvents = [], i;
  // F1-4B-FM3f-1 (Authority D): PRE-T1 current-month remaining demand consumed BEFORE T1 — a tier=null event dated
  // at the current-month end (< T1 month-01), so KMTPP carries it forward into T1's opening. It is NOT a writable
  // tier (never appears in the T1–T4 monthlyProjection array), only reduces the supply entering T1.
  if (preT1Demand != null && isFinite(Number(preT1Demand)) && Number(preT1Demand) > 0 && recoWsStr_(preT1Date)) {
    demandEvents.push({ demandId: 'PRE-T1', date: recoWsStr_(preT1Date), qty: Number(preT1Demand), demandType: 'CURRENT_MONTH_REMAINING', month: recoWsStr_(preT1Date).slice(0, 7), tier: null });
  }
  for (i = 0; i < 4; i++) {
    var ym = months[i], q = demandByMonth ? demandByMonth[ym] : undefined;
    if (q === null || q === undefined || !isFinite(Number(q))) return null;   // missing forecast month → truthful block (never coerced to 0)
    demandEvents.push({ demandId: 'DMD-' + RECO_WS_TIERS_[i] + '-' + ym, date: ym + '-01', qty: Number(q), demandType: 'PLANNING_DEMAND', month: ym, tier: RECO_WS_TIERS_[i] });
  }
  var tierByMonth = {}; for (i = 0; i < 4; i++) tierByMonth[months[i]] = RECO_WS_TIERS_[i];
  var inEvents = (incomingEvents || []).map(function (e) {
    var eta = recoWsStr_(e.eta), ym2 = eta.slice(0, 7);
    return { incomingId: recoWsStr_(e.incomingId) || null, availableDate: eta, qty: recoWsNum_(e.qty),
      sourceType: recoWsStr_(e.sourceType) || null, tier: (tierByMonth[ym2] || null) };   // tier from ETA month only (else null → still carried by balance)
  });
  var proj = KMTPP.projectTimePhasedSupply({ destination: destination || null, openingSupplyQty: openingSupplyQty, demandEvents: demandEvents, incomingEvents: inEvents });
  if (!proj || proj.ready !== true) return null;   // opening unavailable / invalid input → no fabricated monthly numbers
  return (proj.monthlyProjection || []).map(function (r) {
    // destinationGapQty = shortage after OPENING_DESTINATION_STOCK + QUALIFIED_INCOMING (KMTPP remainingGapQty).
    // overseas/factory source coverage is the within-request Commit-2 slice → 0 here, so residualOrderNeedQty ==
    // destinationGapQty for now. suggestedOrderQty = cartonized RESIDUAL NEW ORDER NEED (F1-4B-FM3f-1 §10).
    var destinationGapQty = r.remainingGapQty;
    var overseasCoveredQty = 0, factoryCoveredQty = 0;
    var residualOrderNeedQty = (typeof destinationGapQty === 'number' && isFinite(destinationGapQty)) ? Math.max(0, destinationGapQty - overseasCoveredQty - factoryCoveredQty) : destinationGapQty;
    var sug = null;
    if (typeof residualOrderNeedQty === 'number' && isFinite(residualOrderNeedQty)) {
      if (residualOrderNeedQty <= 0) sug = 0;
      else if (typeof unitsPerCarton === 'number' && isFinite(unitsPerCarton) && unitsPerCarton > 0 && Math.floor(unitsPerCarton) === unitsPerCarton) {
        try { sug = KMCALC.calculateSuggestedOrderQty({ netOrderNeed: residualOrderNeedQty, unitsPerCarton: unitsPerCarton }); } catch (e) { sug = null; }
      } else sug = null;
    }
    return { tier: r.tier, month: r.month,
      openingSupplyQty: r.openingSupplyQty, openingDestinationSupplyQty: r.openingSupplyQty,
      incomingAddedQty: r.incomingAddedQty, qualifiedIncomingQty: r.incomingAddedQty,
      demandQty: r.demandQty, coveredQty: r.coveredQty, remainingSupplyQty: r.remainingSupplyQty,
      destinationGapQty: destinationGapQty, overseasCoveredQty: overseasCoveredQty, factoryCoveredQty: factoryCoveredQty,
      remainingGapQty: r.remainingGapQty, residualOrderNeedQty: residualOrderNeedQty, suggestedOrderQty: sug };
  });
}

// MARKETPLACE expansion → one canonical response line via the unified runtime (order-need; no source-pool allocator).
// F1-4B-FM5-R2b: `supplyAllocationByReceiver` (optional, additive) carries the batch-decided per-receiver Overseas +
// Factory allocation (keyed by the canonical KMMSA receiver key). When absent the monthly opening supply is Site
// Stock only — byte-identical to the pre-R2b behaviour. The allocation is COMPOSED into the monthly opening supply
// ONLY (order planning); the Inventory day-horizon (D18/D30/D45/D90) opening stays Site-Stock-only (§18 unchanged).
function recoWsExpandMarketplace_(read, scope, sku, siteSku, calc, vmeta, supplyAllocationByReceiver) {
  var snaps = read.snapshots || {};
  var mktRows = recoWsToRowObjects_(snaps.marketplaces), whRows = recoWsToRowObjects_(snaps.warehouses);
  var amazonRows = recoWsToRowObjects_(snaps.amazonInventorySnapshot);
  var shipmentRows = recoWsToRowObjects_(snaps.shipments).filter(function (r) { return recoWsStr_(r.company) === scope.company && recoWsStr_(r.country) === scope.country; });
  var fcRows = recoWsToRowObjects_(snaps.fcRegularForecast);
  var skuDetailRows = recoWsToRowObjects_(snaps.skuDetails);
  var upc = recoWsUpcBySku_(skuDetailRows)[sku];
  var skuRow = null; for (var si = 0; si < skuDetailRows.length; si++) { if (recoWsStr_(skuDetailRows[si].sku) === sku) { skuRow = skuDetailRows[si]; break; } }
  var skuMeta = { sku: sku, series: skuRow ? recoWsStr_(skuRow.series) : '', category: skuRow ? recoWsStr_(skuRow.category) : '', company: scope.company };
  var tgtRows = recoWsToRowObjects_(snaps.fcTargetRules);
  var evtRows = recoWsToRowObjects_(snaps.fcSpecialEvents).filter(function (r) { return recoWsStr_(r.company) === '' || recoWsStr_(r.company) === scope.company; });
  var nd = KMDR.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: scope.company, country: scope.country, marketplace: scope.marketplace }, { marketplaces: mktRows });
  if (!nd.ok) {
    var code = (nd.issues && nd.issues[0] && nd.issues[0].code) || 'DESTINATION_AUTHORITY_UNRESOLVED';
    return KMDR.buildRecommendationLine({ destination: { destinationType: 'MARKETPLACE', company: scope.company, country: scope.country, marketplace: scope.marketplace, destinationRefId: null, destinationKey: 'MARKETPLACE||' + scope.company + '||' + scope.country + '||' + scope.marketplace + '||' }, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku, blocked: true, blockedReason: code, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf, diagnostics: { issues: [{ code: code, message: (nd.issues && nd.issues[0] && nd.issues[0].message) || '' }] } });
  }
  var months = (typeof KMPCX !== 'undefined' && KMPCX._forecastWeightMonths) ? KMPCX._forecastWeightMonths(calc.calculationMonth) : [];
  // F1-4B-FM3f-1 (Authorities E+F): canonical planning demand = Target%-adjusted regular FC + special-event FC,
  // from the ONE KMPD owner (never page-side FC×Target). Fallback to raw FC only if KMPD is somehow unbundled.
  var useKMPD = (typeof KMPD !== 'undefined' && KMPD && typeof KMPD.planningDemandByMonth === 'function');
  var pdmMap = useKMPD ? KMPD.planningDemandByMonth({ fcRegularRows: fcRows, fcTargetRuleRows: tgtRows, fcSpecialEventRows: evtRows, scope: scope, sku: sku, skuMeta: skuMeta, months: months }) : null;
  var rawFcByMonth = recoWsRegularForecastByMonth_(fcRows, scope, sku, months);
  var demandByMonth = {}, demandQty = 0, haveAll = months.length === 4;
  months.forEach(function (mm) {
    var d = useKMPD ? (pdmMap[mm] ? pdmMap[mm].demand : undefined) : rawFcByMonth[mm];
    if (d === null || d === undefined) { haveAll = false; return; }
    demandByMonth[mm] = d; demandQty += d;
  });
  var requiredBy = (months[0] || calc.calculationMonth) + '-01';
  var res = KMDR.resolveUnifiedDestinationRecommendation(
    { marketplaces: mktRows, warehouses: whRows, amazonInventory: amazonRows, marketplaceIncomingCandidates: shipmentRows },
    { recommendationType: 'MONTHLY_ORDER', scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku }, destination: { destinationType: 'MARKETPLACE' }, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf },
    { regularForecastByMonth: demandByMonth, unitsPerCarton: upc, requiredByDate: requiredBy }
  );
  var L = res.line || {};
  var partial = L.incomingCompleteness === 'PARTIAL' || L.incomingCompleteness === 'UNAVAILABLE';
  var blockedReason = L.blocked ? (partial ? 'MARKETPLACE_INCOMING_IDENTITY_UNRESOLVED' : (recoWsStr_(L.blockedReason) || null)) : null;
  var mLine = KMDR.buildRecommendationLine({
    destination: nd.destination, recommendationMode: 'MARKETPLACE_ORDER_NEED', sku: sku, siteSku: siteSku,
    allocatedForecastQty: haveAll ? demandQty : (demandQty > 0 ? demandQty : null),
    currentStockQty: L.currentStockQty, qualifiedIncomingQty: L.confirmedQualifiedIncomingQty, incomingCompleteness: L.incomingCompleteness,
    calculatedGap: L.calculatedGap, recommendedQty: L.recommendedQty, provisionalOrderNeed: L.provisionalOrderNeed,
    blocked: L.blocked === true, blockedReason: blockedReason, formulaVersion: vmeta.formulaVersion, sourceDataAsOf: vmeta.sourceDataAsOf,
    diagnostics: { issues: (res.issues || []).map(function (x) { return { code: x.code, message: x.message }; }) }
  });
  // F1-4B-FM3c-2 + FM3f-1: additive per-tier monthly projection. Opening = canonical Site Stock (currentStockQty,
  // now available+transfer+processing, Authority A); demand = adjusted regular + special (E+F); PRE-T1 current-month
  // remaining consumed first (D); incoming = FM3c-1 line.qualifiedEvents. destinationGap/residualOrderNeed additive.
  var mIncoming = (L.qualifiedEvents || []).map(function (e) { return { incomingId: e.incomingId, eta: e.eta, qty: e.eligibleQty, sourceType: e.sourceType }; });
  var cmr = (useKMPD && calc.calculationDate) ? KMPD.currentMonthRemainingDemand({ calculationDate: calc.calculationDate, fcRegularRows: fcRows, fcTargetRuleRows: tgtRows, fcSpecialEventRows: evtRows, scope: scope, sku: sku, skuMeta: skuMeta }) : null;
  var preT1Demand = (cmr && cmr.ready) ? Math.round(cmr.demand) : null;   // rounded once at emission (KMPD carries full precision)
  var preT1Date = (cmr && cmr.ready) ? cmr.requiredByDate : null;
  // F1-4B-FM5-R2b (§1/§7): opening ORDER-PLANNING supply = Site Stock + allocated eligible Overseas + allocated
  // eligible Factory (composed once, counted once — the Overseas/Factory allocation is OPENING planning supply,
  // NOT ETA-phased incoming; incoming lineage stays separate in mIncoming). The allocation is the batch-decided,
  // conserved KMMSA result keyed by the canonical receiver key; absent → 0/0 → opening == Site Stock (pre-R2b).
  var siteStockQty = recoWsNum_(L.currentStockQty);
  var rKey = (typeof KMMSA !== 'undefined' && KMMSA && typeof KMMSA.receiverKeyOf === 'function')
    ? KMMSA.receiverKeyOf({ company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: sku }) : null;
  var rAlloc = (recoWsIsObj_(supplyAllocationByReceiver) && rKey && recoWsIsObj_(supplyAllocationByReceiver[rKey])) ? supplyAllocationByReceiver[rKey] : null;
  var composition = recoWsComposeOpeningSupply_(siteStockQty, rAlloc ? rAlloc.overseasCoveredQty : 0, rAlloc ? rAlloc.factoryCoveredQty : 0);
  var mProj = recoWsBuildMonthlyProjection_(months, composition.openingSupplyQty, (haveAll ? demandByMonth : null), mIncoming, upc, nd.destination, preT1Demand, preT1Date);
  if (mProj) { mLine.monthlyProjection = mProj; mLine.openingSupplyComposition = composition; }   // §7 auditable opening-supply facts
  if (cmr && cmr.ready) mLine.currentMonthRemaining = { requiredByDate: cmr.requiredByDate, month: cmr.ym, remainingDays: cmr.remainingDays, demandQty: Math.round(cmr.demand) };   // PRE-T1 audit (not a writable tier)
  // F1-4B-FM4a + FM3f-1 + FM5-R4UI-R3: additive day-horizon projection on Site Stock opening. Demand authority now
  // splits on the SKU's canonical Planning Model — sales_driven consumes the §22 run-rate (NOT regular FC / Target%),
  // forecast_driven keeps the adjusted-regular+special demand. A Sales-Driven SKU whose run-rate cannot be resolved
  // fail-closes (no horizons → materialized BLOCKED), never silently reverting to the forecast path.
  var planModel = recoWsResolvePlanningModel_(snaps, scope, sku);
  var salesRate = null;
  if (planModel === 'sales_driven') { var sr = recoWsResolveSalesRate_(snaps, scope, sku, calc.calculationDate); salesRate = sr.ok ? sr.avgSalesPerDay : null; }
  var mHz = (planModel === 'sales_driven' && salesRate === null) ? null
    : recoWsBuildHorizons_(calc, fcRows, tgtRows, evtRows, skuMeta, scope, sku, recoWsNum_(L.currentStockQty), mIncoming, upc, nd.destination, planModel, salesRate);
  if (mHz) mLine.horizons = mHz;
  return mLine;
}

// WAREHOUSE expansion → one canonical line per configured warehouse. Demand is fanned per month by the FROZEN ratio;
// each warehouse runs the FROZEN KMPA→KMPS Weekly path (real source-pool allocator) — the transport NEVER
// reconstructs allocatedSupplyQty. Rule/warehouse problems fail closed as blocked lines with canonical tokens.
function recoWsExpandWarehouse_(read, ss, scope, sku, siteSku, calc, vmeta) {
  var snaps = read.snapshots || {}, lines = [];
  var whRows = recoWsToRowObjects_(snaps.warehouses), ruleRows = recoWsToRowObjects_(snaps.replenishmentDemandAllocationRules), fcRows = recoWsToRowObjects_(snaps.fcRegularForecast);
  var skuDetailRowsW = recoWsToRowObjects_(snaps.skuDetails);
  var upc = recoWsUpcBySku_(skuDetailRowsW)[sku];   // F1-4B-FM3c-2: carton owner input (per-tier suggestedOrderQty)
  var skuRowW = null; for (var swi = 0; swi < skuDetailRowsW.length; swi++) { if (recoWsStr_(skuDetailRowsW[swi].sku) === sku) { skuRowW = skuDetailRowsW[swi]; break; } }
  var skuMetaW = { sku: sku, series: skuRowW ? recoWsStr_(skuRowW.series) : '', category: skuRowW ? recoWsStr_(skuRowW.category) : '', company: scope.company };
  var tgtRowsW = recoWsToRowObjects_(snaps.fcTargetRules);
  var evtRowsW = recoWsToRowObjects_(snaps.fcSpecialEvents).filter(function (r) { return recoWsStr_(r.company) === '' || recoWsStr_(r.company) === scope.company; });
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
  // F1-4B-FM5-R4UI-R3 — resolve the SKU's Planning Model + (Sales-Driven) canonical run-rate ONCE per SKU; the
  // per-warehouse horizons below all share it (the model is a marketplace-SKU attribute, not per-warehouse).
  var whPlanModel = recoWsResolvePlanningModel_(snaps, scope, sku);
  var whSalesRate = null;
  if (whPlanModel === 'sales_driven') { var wsr = recoWsResolveSalesRate_(snaps, scope, sku, calc.calculationDate); whSalesRate = wsr.ok ? wsr.avgSalesPerDay : null; }
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
    var wLine = KMDR.buildRecommendationLine({
      destination: node, recommendationMode: 'WAREHOUSE_REPLENISHMENT', sku: sku, siteSku: siteSku,
      allocatedForecastQty: cnt ? allocatedForecast : null, currentStockQty: supply.currentStockQty, qualifiedIncomingQty: supply.qualifiedIncomingQty, incomingCompleteness: 'COMPLETE',
      calculatedGap: gap, allocatedSupplyQty: wline ? allocatedSupply : null, recommendedQty: (wline && typeof wline.recommendedQty === 'number') ? wline.recommendedQty : null,
      residualShortageQty: (wline && typeof wline.unallocatedQty === 'number') ? wline.unallocatedQty : null,
      blocked: !!(wline && wline.blockedReason), blockedReason: wline ? wline.blockedReason : null,
      formulaVersion: src.formulaVersion || vmeta.formulaVersion, sourceDataAsOf: src.sourceDataAsOf || vmeta.sourceDataAsOf
    });
    // F1-4B-FM3c-2: additive per-warehouse monthly projection — ONE independent KMTPP call per warehouse. Opening =
    // this warehouse's OWN CURRENT_STOCK (never pooled); demand = the per-warehouse monthly split (override); incoming =
    // ONLY the warehouseQualifiedEvents whose warehouseId === this warehouse (FM3c-1b; strictly isolated, count-once).
    var whIncoming = (src.warehouseQualifiedEvents || []).filter(function (e) { return recoWsStr_(e.warehouseId) === w.warehouseId; })
      .map(function (e) { return { incomingId: e.incomingId, eta: e.eta, qty: e.eligibleQty, sourceType: e.sourceType }; });
    var whOpening = recoWsWarehouseOpeningStock_(src.supplySourceEntries, w.warehouseId);
    var wProj = recoWsBuildMonthlyProjection_(months, whOpening, override[w.warehouseId], whIncoming, upc, node);
    if (wProj) wLine.monthlyProjection = wProj;
    // F1-4B-FM4a: additive per-warehouse day-horizon projection (opening = this warehouse's OWN stock; incoming =
    // ONLY this warehouse's warehouseQualifiedEvents — same isolation as monthlyProjection; never pooled).
    var wHz = (whPlanModel === 'sales_driven' && whSalesRate === null) ? null
      : recoWsBuildHorizons_(calc, fcRows, tgtRowsW, evtRowsW, skuMetaW, scope, sku, whOpening, whIncoming, upc, node, whPlanModel, whSalesRate);
    if (wHz) wLine.horizons = wHz;
    lines.push(wLine);
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
    // F1-4B-FM4a calculation-DATE authority for day horizons (Script Property; NO clock). Injectable in tests.
    configDate: function () { try { return PropertiesService.getScriptProperties().getProperty('RECOMMENDATION_CALCULATION_DATE'); } catch (e) { return null; } },
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
    var cdRes = recoWsResolveCalcDate_(io);                                   // F1-4B-FM4a day-horizon anchor (ADDITIVE; absent → line.horizons omitted, OP unaffected)
    calc.calculationDate = cdRes.ok ? cdRes.calculationDate : null;

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
      if (ful.mode === 'MARKETPLACE') produced = [recoWsExpandMarketplace_(read, v.scope, sku, siteSku, calc, vmeta, v.supplyAllocationByReceiver)];
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
    return recoWsEnvelope_(true, vm, [], { requestId: reqId, serverDurationMs: (io.now() - t0), tablesRead: tablesRead, sourceReadCount: 1, calculationMonth: calc.calculationMonth, planningCycle: calc.planningCycle, calculationDate: calc.calculationDate, conflicts: issues.length });
  } catch (e) {
    var code = (e && (e.safetyToken || e.apiCode || e.validationCode)) || 'INTERNAL_ERROR';
    return recoWsEnvelope_(false, null, [recoWsErr_(code, String(e && e.message || e), (e && e.schemaDetail) || null)], { requestId: reqId, serverDurationMs: (io.now() - t0) });
  }
}
