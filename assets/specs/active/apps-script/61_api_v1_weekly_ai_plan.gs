/**
 * 61_api_v1_weekly_ai_plan.gs — WEEKLY AI PLAN live backend generation owner (F1-7N-D-2b).
 * ---------------------------------------------------------------------------------------------------------------
 * The ONE live Apps Script owner behind the `weeklyAiPlan.generate` action + the future Monday scheduler (D-4).
 * It is a THIN I/O shell: it HARVESTS canonical facts from existing owners, hands them to the PURE, Node-verified
 * core (KMWHA harvest-map → KMWRB (company,country) batch → per-marketplace K3 persistence via the frozen
 * orchestrator + C1 semantics), and returns a bounded envelope. It re-derives NO business value.
 *
 * USER-frozen authority (F1-7N-D-2b-PRE): generation universe = (company,country) BATCH; §7 demandWeight basis =
 * FORECAST_DRIVEN forecastShareQty, normalized ONCE across the whole universe by a SINGLE KMAF.projectAllocationFacts
 * call; persistence stays marketplace-grain K3 (allocation universe != persistence identity). A manual invocation
 * from any marketplace page triggers the COMPLETE (company,country) batch — `currentMarketplace` is readback context
 * only and MUST NOT narrow the allocation universe. Count-once: each shared pool is allocated exactly once across all
 * marketplace drafts (enforced by KMWRB running one allocation per SKU then fanning out).
 *
 * Reused owners (NO second engine): gapCalcResolveContext_ (cycle) · handleRecommendationWorkspaceGet_ (per-market
 * horizons + site identity) · KMPCX.resolveForecastWeight (§7 forecastShareQty) · KMAF.projectAllocationFacts (ONE
 * multi-site §7 call) · gapOpReadSupplyPoolFacts_ (pools) · recGenUpcBySku_ (UPC) · gapReadObjects_ (warehouses) ·
 * KMPR/KMPL (repository + LockService) mirrored from 24_. Persists ONLY shipping_allocation_drafts / _lines. Creates
 * NO Request Order / PO / shipment; reserves NO stock; emits NO carrier/rate/lead-time/ETA/cost.
 *
 * LIVE-VERIFY: the harvest (weeklyAiPlanHarvest_ / weeklyAiPlanBuildKmafReceivers_) is Apps-Script-runtime only and is
 * NOT covered by the Node suites (which verify KMWHA/KMWRB/KMAF-§7). It is the primary target of the D-2b live smoke.
 */

// Frozen factory identity (F1-7N-D-2b-PRE / §35A.7): exact warehouse_id only — never country/company/name/token.
var WEEKLY_AI_PLAN_FACTORY_IDENTITY_ = { CN_YOUXIN: 'WH-TW-CN-FACTORY-YOUXIN', TW_SHENGYI: 'WH-TW-TW-FACTORY-RES' };
var WEEKLY_AI_PLAN_SOURCE_PAGE_ = 'inventory_replenishment';

function weeklyAiPlanStr_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function weeklyAiPlanErr_(code, message, extra) { var e = { code: code, message: message || code }; if (extra) for (var k in extra) e[k] = extra[k]; return e; }

/**
 * Router handler for `weeklyAiPlan.generate`.
 * body = { action, company, country, planningCycle?, mode?, confirmRegenerateOverUserEdits?,
 *          currentMarketplace?/requestedMarketplace? (readback-only), actor? }
 * Returns jsonResponse_({ success, data, errors }).
 */
function handleGenerateWeeklyAiPlanDraft_(body) {
  try {
    body = body || {};
    var company = weeklyAiPlanStr_(body.company);
    var country = weeklyAiPlanStr_(body.country);
    var mode = weeklyAiPlanStr_(body.mode) || 'MANUAL_REGENERATE';
    if (mode !== 'MANUAL_REGENERATE' && mode !== 'SCHEDULED_REFRESH') return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('INVALID_MODE', 'mode must be MANUAL_REGENERATE|SCHEDULED_REFRESH')] });
    if (!company || !country) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('INVALID_SCOPE', 'company + country required (generation universe is company,country)')] });

    if (typeof KMWHA === 'undefined' || typeof KMWRB === 'undefined' || typeof KMAF === 'undefined') {
      return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('WEEKLY_AI_PLAN_NOT_BUNDLED', 'weekly AI plan core not present in bundle')] });
    }

    var ss = SpreadsheetApp.openById(prodExpectedDbId_());
    if (typeof prodAssertDbTarget_ === 'function') prodAssertDbTarget_(ss, prodExpectedDbId_()); // S0-5 exact-ID gate

    var planningCycle = weeklyAiPlanStr_(body.planningCycle);
    if (!planningCycle) {
      var ctx = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
      if (ctx && ctx.ok) planningCycle = ctx.planningCycle;
    }
    if (!planningCycle) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('PLANNING_CYCLE_UNRESOLVED', 'could not resolve canonical planning cycle')] });

    // ---- HARVEST canonical facts (LIVE-VERIFY) --------------------------------------------------------------
    var h = weeklyAiPlanHarvest_(ss, { company: company, country: country, planningCycle: planningCycle });
    if (!h.ok) return jsonResponse_({ success: false, errors: h.errors || [weeklyAiPlanErr_('HARVEST_FAILED', 'fact harvest failed')] });

    // ---- MAP → (company,country) batch request (PURE, Node-verified) ---------------------------------------
    var mapped = KMWHA.mapWeeklyHarvestToBatchRequest({
      planningCycle: planningCycle,
      businessScope: { company: company, country: country, source_page: WEEKLY_AI_PLAN_SOURCE_PAGE_ },
      mode: mode, confirmRegenerateOverUserEdits: body.confirmRegenerateOverUserEdits === true,
      actor: weeklyAiPlanStr_(body.actor) || 'user', now: procurementTimestamp_(),
      sourceDataAsOf: h.sourceDataAsOf, formulaVersion: 'WEEKLY_AI_PLAN_V1',
      factoryIdentityConfig: WEEKLY_AI_PLAN_FACTORY_IDENTITY_, warehousesById: h.warehousesById,
      kmaf: h.kmaf, horizonsByDemandRef: h.horizonsByDemandRef, poolsBySku: h.poolsBySku
    });
    if (!mapped.ready) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('HARVEST_NOT_READY', 'canonical §7 facts not ready (fail closed)', { issues: mapped.issues })] });

    // ---- REAL persistence deps (mirror 24_ rpoGenerateRecommendationDraftLockedResult_) --------------------
    var deps = weeklyAiPlanPersistenceDeps_(ss);

    // ---- GENERATE (PURE, Node-verified): shared pool once → per-marketplace K3 drafts ----------------------
    var res = KMWRB.generateWeeklyShippingRecommendationBatch(mapped.request, deps);

    var success = res && (res.status === 'COMPLETED' || res.status === 'PARTIAL') && (res.marketplaceCount > 0);
    return jsonResponse_({
      success: !!(res && res.success),
      data: {
        status: res.status, planningCycle: res.planningCycle, businessScope: res.businessScope,
        currentMarketplace: weeklyAiPlanStr_(body.currentMarketplace || body.requestedMarketplace) || null, // readback context only
        skuCount: res.skuCount, marketplaceCount: res.marketplaceCount,
        marketplaceResults: res.marketplaceResults, recommendedQtyTotal: res.recommendedQtyTotal,
        unresolvedProductionNeedQty: res.unresolvedProductionNeedQty,
        formulaVersion: res.formulaVersion, sourceDataAsOf: res.sourceDataAsOf, issues: res.issues
      },
      errors: (res && res.success) ? [] : [weeklyAiPlanErr_(res ? res.status : 'GENERATION_FAILED', res ? res.reason : 'weekly AI plan generation failed')]
    });
  } catch (e) {
    return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('WEEKLY_AI_PLAN_ERROR', (e && e.message) ? String(e.message) : String(e))] });
  }
}

/**
 * Harvest all canonical facts for the (company,country) universe. Returns
 * { ok, errors?, kmaf, horizonsByDemandRef, poolsBySku, warehousesById, sourceDataAsOf }.
 * LIVE-VERIFY: reuses existing owners only; assembles ONE multi-site KMAF receiver set (FORECAST_DRIVEN).
 */
function weeklyAiPlanHarvest_(ss, scope) {
  var errors = [];
  // Pools + warehouses (headless readers, exact shapes per audit).
  var poolFacts = (typeof gapOpReadSupplyPoolFacts_ === 'function') ? gapOpReadSupplyPoolFacts_(ss) : null;
  if (!poolFacts) return { ok: false, errors: [weeklyAiPlanErr_('SUPPLY_POOL_FACTS_UNAVAILABLE', 'gapOpReadSupplyPoolFacts_ unavailable')] };
  var upcBySku = (typeof recGenUpcBySku_ === 'function') ? recGenUpcBySku_(ss) : {};
  var warehousesById = weeklyAiPlanWarehousesById_(ss);

  // Enumerate the eligible (marketplace, sku, destination) universe + per-site horizons via the recommendation
  // workspace (per marketplace). Each WAREHOUSE line carries sku, siteSku, warehouseId, horizons[].
  var sites = weeklyAiPlanEnumerateSites_(ss, scope, upcBySku, errors); // [{ marketplace, sku, siteSku, destinationWarehouseId, cumulativeGapByWindow, requiredByByWindow, fulfillmentModel, allocationPriority, unitsPerCarton, sourceDataAsOf }]
  if (!sites.length) return { ok: true, kmaf: { ready: true, receiverFacts: [], planningFacts: [] }, horizonsByDemandRef: {}, poolsBySku: weeklyAiPlanPoolsBySku_(poolFacts, scope), warehousesById: warehousesById, sourceDataAsOf: weeklyAiPlanSourceAsOf_(sites) };

  // Build ONE multi-site KMAF receiver set (FORECAST_DRIVEN; §7 forecastShareQty basis) so demandWeight normalizes
  // ONCE across the whole (company,country) universe. demandRef encodes (marketplace|sku|destination) for join-back.
  var built = weeklyAiPlanBuildKmafReceivers_(ss, scope, sites, upcBySku, errors);
  if (built.fatal) return { ok: false, errors: errors };

  var kmaf;
  try {
    kmaf = KMAF.projectAllocationFacts({
      recommendationType: 'WEEKLY_SHIPPING', planningCycle: scope.planningCycle,
      businessScope: { company: scope.company, country: scope.country },
      calculationDate: built.calculationDate, receivers: built.receivers, warehouses: built.kmafWarehouses
    });
  } catch (e) {
    return { ok: false, errors: [weeklyAiPlanErr_('KMAF_THREW', (e && e.message) ? String(e.message) : String(e))] };
  }

  // horizons keyed by the SAME demandRef the KMAF receiver used.
  var horizonsByDemandRef = {};
  built.horizonRows.forEach(function (r) { horizonsByDemandRef[r.demandRef] = { cumulativeGapByWindow: r.cumulativeGapByWindow, requiredByByWindow: r.requiredByByWindow }; });

  return {
    ok: true, kmaf: kmaf, horizonsByDemandRef: horizonsByDemandRef,
    poolsBySku: weeklyAiPlanPoolsBySku_(poolFacts, scope), warehousesById: warehousesById,
    sourceDataAsOf: built.sourceDataAsOf
  };
}

/** Index raw `warehouses` rows by warehouse_id with the raw columns KMWHA.validateFactoryConfig needs. */
function weeklyAiPlanWarehousesById_(ss) {
  var out = {};
  if (typeof gapReadObjects_ !== 'function') return out;
  var rows = gapReadObjects_(ss, 'warehouses') || [];
  rows.forEach(function (r) {
    var id = weeklyAiPlanStr_(r.warehouse_id);
    if (!id) return;
    out[id] = { warehouse_id: id, warehouse_type: weeklyAiPlanStr_(r.warehouse_type), is_factory_warehouse: r.is_factory_warehouse, is_active: r.is_active, country: weeklyAiPlanStr_(r.country) };
  });
  return out;
}

/** Reshape gapOpReadSupplyPoolFacts_ into { [sku]: { overseasSupplyPools[], factoryPools[] } } for the scope. */
function weeklyAiPlanPoolsBySku_(poolFacts, scope) {
  var out = {}, canonCountry = (typeof gapCanonCountry_ === 'function') ? gapCanonCountry_(scope.country) : scope.country;
  var factoryBySku = poolFacts.factoryPoolsBySku || {};
  for (var sku in factoryBySku) { if (factoryBySku.hasOwnProperty(sku)) { out[sku] = out[sku] || { overseasSupplyPools: [], factoryPools: [] }; out[sku].factoryPools = factoryBySku[sku]; } }
  var overseasByKey = poolFacts.overseasPoolsByKey || {};
  for (var key in overseasByKey) {
    if (!overseasByKey.hasOwnProperty(key)) continue;
    var parts = key.split('||'); // company||canonicalCountry||sku
    if (parts.length !== 3 || parts[0] !== scope.company || parts[1] !== canonCountry) continue;
    var s = parts[2]; out[s] = out[s] || { overseasSupplyPools: [], factoryPools: [] }; out[s].overseasSupplyPools = overseasByKey[key];
  }
  return out;
}

function weeklyAiPlanSourceAsOf_(sites) { for (var i = 0; i < sites.length; i++) if (sites[i] && sites[i].sourceDataAsOf) return sites[i].sourceDataAsOf; return null; }

/**
 * Build real persistence deps (KMPR repository + KMPL LockService apply) for WEEKLY_SHIPPING — a faithful mirror of
 * 24_ rpoGenerateRecommendationDraftLockedResult_, only with type fixed to WEEKLY_SHIPPING.
 */
function weeklyAiPlanPersistenceDeps_(ss) {
  var type = 'WEEKLY_SHIPPING';
  var cfg = KMPR.TABLES[type], tables = [cfg.header, cfg.lines, KMPR.RUN_JOURNAL_TABLE];
  return {
    loadActiveContext: function (q) { var b = rprBuildSheetSet_(ss, [cfg.header]); return KMPR.loadActiveDraftContext(b.set, q); },
    loadPriorSnapshot: function (id) { var b = rprBuildSheetSet_(ss, tables); return KMPR.loadDraftSnapshot(b.set, id, type); },
    lockedApply: function (plan, expectedToken, opts) {
      var lock = LockService.getScriptLock();
      var d2 = {
        validatePlan: function (p) { return KMPR.validatePersistencePlan(p); },
        acquireLock: function () { return lock.tryLock(30000); },
        releaseLock: function () { lock.releaseLock(); },
        loadActiveDraftContext: function () { var b = rprBuildSheetSet_(ss, [cfg.header]); return KMPR.loadActiveDraftContext(b.set, { recommendationType: type, planningCycle: plan.planningCycle, businessScope: plan.businessScope }); },
        reloadSnapshot: function () { d2._built = rprBuildSheetSet_(ss, tables); return KMPR.loadDraftSnapshot(d2._built.set, plan.draftId, type); },
        recomputeToken: function (snap) {
          var dv = snap.draft ? snap.draft.draft_version : plan.draftVersion;
          return KMPR.computeExpectedToken(dv, (snap.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
        },
        applyPlan: function (tok, o) {
          var built = d2._built, before = {};
          for (var i = 0; i < tables.length; i++) before[tables[i]] = built.set[tables[i]].rows.map(function (r) { return r.slice(); });
          var resR = KMPR.applyPersistencePlan(built.set, plan, tok, o || opts || {});
          if (!resR.conflict && resR.runStatus !== 'FAILED') { rpoKeyedDeltaWrite_(built.meta, built.set, before, tables); }
          return resR;
        }
      };
      return KMPL.executeLockedPersistence({ plan: plan, expectedToken: expectedToken, opts: opts, generationType: opts.generationType, deps: d2 });
    }
  };
}

/**
 * Enumerate all (marketplace, sku, destination) shipping sites for the (company,country) universe, each with per-window
 * horizons, via the recommendation workspace (per marketplace). BOTH destination topologies are included via the frozen
 * canonical destination authority (F1-7N-D-2c): WAREHOUSE lines carry warehouse_id (self_fulfilled/3PL); MARKETPLACE
 * lines carry the LOGICAL marketplace_id destination (platform_fulfilled/FBA) — resolved by KMWHA.resolveWorkspaceLineDestination
 * (reuses KMDR). Only lines with NO resolved canonical destination (DESTINATION_AUTHORITY_UNRESOLVED) are skipped.
 * LIVE-VERIFY (Apps-Script-runtime only).
 */
function weeklyAiPlanEnumerateSites_(ss, scope, upcBySku, errors) {
  var sites = [];
  var calcMonth = weeklyAiPlanStr_(scope.planningCycle).slice(5); // RECO-YYYY-MM → YYYY-MM
  var calcCtx = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
  var calcDate = (calcCtx && calcCtx.ok) ? calcCtx.calculationDate : (calcMonth + '-01');
  // io bound to THIS ss + resolved calc context (default io would open its own DB + need Script Properties).
  var io = {
    now: function () { return (typeof Date !== 'undefined' && Date.now) ? Date.now() : 0; },
    nextSeq: function () { return 0; },
    configMonth: function () { return calcMonth; },
    configDate: function () { return calcDate; },
    openTarget: function () { return ss; }
  };

  // Distinct marketplaces for the scope + the per-(marketplace,sku) join fields not on the workspace line.
  var scopes = (typeof gapEnumerateScopes_ === 'function') ? gapEnumerateScopes_(ss) : [];
  var marketplaces = {}, mList = [];
  scopes.forEach(function (s) { if (weeklyAiPlanStr_(s.company) === scope.company && weeklyAiPlanStr_(s.country) === scope.country) { var m = weeklyAiPlanStr_(s.marketplace); if (m && !marketplaces[m]) { marketplaces[m] = 1; mList.push(m); } } });
  if (!mList.length) return sites;

  var mkts = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'marketplaces') : [];
  var prByMkt = {}; mkts.forEach(function (r) { prByMkt[weeklyAiPlanStr_(r.marketplace)] = r.allocation_priority; });

  for (var mi = 0; mi < mList.length; mi++) {
    var marketplace = mList[mi];
    var page = 1, totalPages = 1;
    do {
      var resp;
      try { resp = handleRecommendationWorkspaceGet_({ payload: { scope: { company: scope.company, country: scope.country, marketplace: marketplace }, pagination: { page: page, size: 100 } } }, io); }
      catch (e) { errors.push(weeklyAiPlanErr_('WORKSPACE_THREW', (e && e.message) ? String(e.message) : String(e), { marketplace: marketplace })); break; }
      if (!resp || !resp.success || !resp.data) { errors.push(weeklyAiPlanErr_('WORKSPACE_NOT_OK', 'recommendation workspace not ok', { marketplace: marketplace, errors: resp && resp.errors })); break; }
      var lines = resp.data.lines || [];
      var pg = resp.data.pagination || {}; totalPages = pg.totalPages || 1;
      for (var li = 0; li < lines.length; li++) {
        var line = lines[li];
        // Canonical ALLOCATION destination reference (F1-7N-D-2c): WAREHOUSE → warehouse_id (self_fulfilled/3PL,
        // unchanged); MARKETPLACE → marketplace_id (platform_fulfilled/FBA LOGICAL node — never a fabricated Amazon
        // warehouse; final Amazon FC stays downstream). PURE, Node-verified resolver (KMWHA) reusing the frozen KMDR
        // classification; fail-closed skip when the line has no resolved canonical destination.
        var d = KMWHA.resolveWorkspaceLineDestination(line);
        var dest = weeklyAiPlanStr_(d.destinationRef);
        if (!dest) continue; // DESTINATION_AUTHORITY_UNRESOLVED — no canonical destination
        if (!Array.isArray(line.horizons) || !line.horizons.length) continue; // no per-window shortage structure
        var cum = {}, reqBy = {};
        line.horizons.forEach(function (h) { var wc = weeklyAiPlanStr_(h.windowCode); if (wc) { cum[wc] = h.gapQty; reqBy[wc] = h.requiredByDate; } });
        sites.push({
          marketplace: marketplace, sku: weeklyAiPlanStr_(line.sku), siteSku: weeklyAiPlanStr_(line.siteSku),
          destinationWarehouseId: dest, destinationType: d.destinationType, cumulativeGapByWindow: cum, requiredByByWindow: reqBy,
          fulfillmentModel: weeklyAiPlanStr_(line.fulfillmentModel), allocationPriority: prByMkt[marketplace],
          unitsPerCarton: (upcBySku || {})[weeklyAiPlanStr_(line.sku)], sourceDataAsOf: line.sourceDataAsOf || null
        });
      }
      page++;
    } while (page <= totalPages);
  }
  return sites;
}

/**
 * Build ONE multi-site FORECAST_DRIVEN KMAF receiver set (so §7 demandWeight normalizes once across the whole
 * (company,country) universe) + the matching horizon rows keyed by the SAME demandRef. §7 basis = forecastShareQty =
 * Σ Regular FC over M+1..M+4 (reused via recoWsRegularForecastByMonth_ + KMPCX._forecastWeightMonths — the internal
 * resolveForecastWeight/buildRegularForecastByMonth are NOT globally callable). LIVE-VERIFY.
 */
function weeklyAiPlanBuildKmafReceivers_(ss, scope, sites, upcBySku, errors) {
  var calcMonth = weeklyAiPlanStr_(scope.planningCycle).slice(5);
  var months = (typeof KMPCX !== 'undefined' && KMPCX && typeof KMPCX._forecastWeightMonths === 'function') ? KMPCX._forecastWeightMonths(calcMonth) : null;
  if (!months || months.length < 2) { errors.push(weeklyAiPlanErr_('FORECAST_MONTHS_UNRESOLVED', 'KMPCX._forecastWeightMonths unavailable')); return { fatal: true }; }
  var fcRows = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'fc_regular_forecast') : [];
  var warehouses = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'warehouses') : [];

  var receivers = [], horizonRows = [], sourceDataAsOf = null;
  for (var i = 0; i < sites.length; i++) {
    var st = sites[i];
    var demandRef = [scope.company, scope.country, st.marketplace, st.sku, st.destinationWarehouseId].join('|');
    var fcMap = (typeof recoWsRegularForecastByMonth_ === 'function') ? recoWsRegularForecastByMonth_(fcRows, { company: scope.company, country: scope.country, marketplace: st.marketplace }, st.sku, months) : {};
    // §7 basis needs all four covered months present; else the receiver has no canonical basis → block it (never fake 0).
    var complete = true, shareSum = 0;
    for (var k = 0; k < months.length; k++) { var v = Number(fcMap[months[k]]); if (!isFinite(v)) { complete = false; break; } shareSum += v; }
    var b0 = Number(fcMap[months[0]]), b1 = Number(fcMap[months[1]]);
    if (!complete || !isFinite(b0) || !isFinite(b1)) { errors.push(weeklyAiPlanErr_('FORECAST_SHARE_INCOMPLETE', 'missing regular forecast month', { demandRef: demandRef })); continue; }
    receivers.push({
      receiverKey: demandRef, demandRef: demandRef, demandKey: demandRef, demandDriver: 'FORECAST_DRIVEN',
      company: scope.company, country: scope.country, marketplace: st.marketplace, sku: st.sku, masterSku: st.sku, siteSku: st.siteSku,
      fulfillmentModel: st.fulfillmentModel, allocationPriority: st.allocationPriority, unitsPerCarton: (upcBySku || {})[st.sku],
      windowCode: scope.planningCycle, destinationWarehouseId: st.destinationWarehouseId,
      forecastBasis: { forecastShareQty: shareSum, forecastMonth1: { month: months[0], baseForecast: b0 }, forecastMonth2: { month: months[1], baseForecast: b1 }, targetRules: {}, specialEventDemand: 0 }
    });
    horizonRows.push({ demandRef: demandRef, cumulativeGapByWindow: st.cumulativeGapByWindow, requiredByByWindow: st.requiredByByWindow });
    if (!sourceDataAsOf && st.sourceDataAsOf) sourceDataAsOf = st.sourceDataAsOf;
  }
  return { fatal: false, receivers: receivers, kmafWarehouses: warehouses, horizonRows: horizonRows, calculationDate: calcMonth + '-01', sourceDataAsOf: sourceDataAsOf };
}
