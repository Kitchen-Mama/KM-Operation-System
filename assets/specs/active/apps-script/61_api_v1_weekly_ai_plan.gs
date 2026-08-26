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

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R6F2F1 — INTERNAL controlled-execution authority. A capability object is MINTED only by the
// internal R6F2F executor (server-side TEMP tooling) and is passed to weeklyAiPlanGenerateK2_ as a dedicated positional
// argument — NEVER through request/body fields (actor/mode/businessScope/checksum/token). It authorizes ONE generation
// while the GLOBAL flag is false, bound to an EXACT (company|country|marketplace|planning_cycle) scope key.
//
// Why a public/frontend request can NEVER manufacture it:
//   (1) The capability is a 6th positional argument. The public router → handleGenerateWeeklyAiPlanDraft_ call site
//       passes only 5 args (…, body); a client cannot inject a 6th argument, and any capability-shaped object placed in
//       `body` arrives as the 5th arg, never as `controlledAuth`.
//   (2) verify() only accepts a nonce present in the closure-private `minted` set, which is populated ONLY by mint().
//       A public API request runs in its own execution that never calls mint() → the set is empty → every hand-built
//       capability fails CAPABILITY_NOT_MINTED_IN_EXECUTION. The nonce is unguessable (Utilities.getUuid) and one-shot.
//   (3) The scope key is re-derived from the ACTUAL request inside the gate and must equal the minted scope key, so a
//       capability can never authorize a different / widened scope.
var WeeklyAiPlanControlledAuthority_ = (function () {
  var minted = {};   // nonce -> scopeKey, private to this IIFE and to the current execution only
  function scopeKey(spec) { var s = (spec && spec.scope) || {}; return [String(s.company || ''), String(s.country || ''), String(s.marketplace || ''), String((spec && spec.planning_cycle) || '')].join('|'); }
  return {
    scopeKey: scopeKey,
    mint: function (spec) { var nonce = Utilities.getUuid(); minted[nonce] = scopeKey(spec); return { __wap_controlled: true, nonce: nonce, spec: spec }; },
    verify: function (cap, liveScopeSpec) {
      if (!cap || cap.__wap_controlled !== true || !cap.nonce) return { ok: false, reason: 'NO_INTERNAL_CAPABILITY' };
      var stored = minted[cap.nonce];
      if (stored === undefined) return { ok: false, reason: 'CAPABILITY_NOT_MINTED_IN_EXECUTION' };
      if (stored !== scopeKey(cap.spec)) return { ok: false, reason: 'CAPABILITY_TAMPERED' };
      var live = scopeKey(liveScopeSpec);
      if (scopeKey(cap.spec) !== live) return { ok: false, reason: 'CAPABILITY_SCOPE_MISMATCH' };
      if (!((liveScopeSpec.scope || {}).marketplace)) return { ok: false, reason: 'CONTROLLED_REQUIRES_EXACT_MARKETPLACE' };
      delete minted[cap.nonce];   // ONE-SHOT — a capability authorizes exactly one generation
      return { ok: true, reason: null };
    }
  };
})();

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

    if (typeof KMWHA === 'undefined' || typeof KMWRB === 'undefined' || typeof KMAF === 'undefined' || typeof KMWRR === 'undefined') {
      return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('WEEKLY_AI_PLAN_NOT_BUNDLED', 'weekly AI plan core not present in bundle (KMWHA/KMWRB/KMAF/KMWRR)')] });
    }

    // F1-7N-FA-3C-R6F2 — generation is STAGED OFF. When INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ is false, run NOTHING
    // (neither the legacy K3 batch NOR the K2 path) — this is the canonical staged-off posture (the frontend also gates
    // the button). When true, generation uses the K2 route-group path (route derivation → K2 partition → atomic write),
    // NEVER the legacy K3 per-marketplace persistence. So generation and manual save share the SAME K2 identity.
    var genEnabled = (typeof inventoryAiPlanDbGenerationEnabled_ === 'function') && inventoryAiPlanDbGenerationEnabled_() === true;
    if (!genEnabled) {
      return jsonResponse_({ success: false, disabled: true, errors: [weeklyAiPlanErr_('INVENTORY_AI_PLAN_DB_GENERATION_DISABLED', 'Inventory AI Plan DB generation is staged OFF (INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = false); zero rows written. Run TEMP_R6F2_PREFLIGHT_INVENTORY_K2_ROUTE_AUTHORITY() before any controlled enablement.')] });
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

    // ---- REAL persistence deps --------------------------------------------------------------------------------
    var deps = weeklyAiPlanPersistenceDeps_(ss);

    // ---- GENERATE via the K2 route-group path: per-source lines → route derivation → K2 partition → ATOMIC
    // Header+Lines write (the SAME endpoint + identity manual save uses). Reached ONLY when the flag is true.
    return weeklyAiPlanGenerateK2_(ss, mapped.request, h, deps, body);
  } catch (e) {
    return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('WEEKLY_AI_PLAN_ERROR', (e && e.message) ? String(e.message) : String(e))] });
  }
}

// ================================================================================================================
// F1-7N-FA-3C-R6F2 — K2 route-group generation (reached ONLY when INVENTORY_AI_PLAN_DB_GENERATION_ENABLED_ = true).
// per-source lines (KMWRB.buildWeeklySourceLines) → route derivation + K2 partition (KMWRR, per marketplace) →
// ATOMIC Header+Lines write (handleUpsertShippingAllocationDraftAtomic_ — the SAME endpoint + K2 identity manual save
// uses) → readback summary. Route authorities (carrier_rate_cards + carrier_lead_times) are harvested here (the
// legacy K3 harvest did NOT load them). The per-source-line → allocatedLine assembly (window/required-by join +
// destination) is defensive: any line whose route cannot be resolved BLOCKS that group (no header/lines), and the
// read-only TEMP_R6F2_PREFLIGHT reports resolution/availability counts BEFORE any controlled live run.
// ================================================================================================================
function weeklyAiPlanReadCarrierAuthorities_(ss) {
  // F1-7N-FA-3C-R6F2B → R6F2C FIX: gapReadObjects_ returns a BARE ARRAY of row objects (not { rows: [...] }). The
  // prior `(o && o.rows) ? o.rows : []` therefore silently discarded EVERY carrier row (an array has no `.rows`),
  // feeding KMWRR an empty rateCards/leadTimes set → ROUTE_METHOD_UNRESOLVED for every line while the diagnostic
  // (which reads via TEMP_readObjects_ → { rows }) saw the full set. Accept both shapes so the transport can never
  // diverge from the diagnostic again.
  function rows(name) {
    try {
      var o = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, name) : null;
      return Array.isArray(o) ? o : ((o && Array.isArray(o.rows)) ? o.rows : []);
    } catch (e) { return []; }
  }
  return { rateCards: rows('carrier_rate_cards'), leadTimes: rows('carrier_lead_times') };
}
function weeklyAiPlanShipDate_(harvest) {
  var v = harvest && harvest.sourceDataAsOf ? String(harvest.sourceDataAsOf) : '';
  var m = v.match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : '';
}
// Map the per-source WSA lines → KMWRR allocatedLines. Confirmed fact fields: masterSku, marketplace,
// sourceWarehouseId, recommendedQty, unitsPerCarton, demandKey. window/required_by joined from horizonsByDemandRef;
// destination resolved via KMWHA.resolveWorkspaceLineDestination when available, else the line's own dest fields.
// F1-7N-FA-3C-R6F2C — CANONICAL destination classification for a WSA line. The prior code called
// KMWHA.resolveWorkspaceLineDestination(l) with the WRONG field names (it reads warehouseId/destinationRefId/
// marketplaceId/destinationType; the WSA line has destinationWarehouseId/marketplace/country) and then read the
// result via `d.destinationKind` (the resolver returns `destinationType`), so it ALWAYS fell back to a WAREHOUSE
// default carrying l.destinationWarehouseId — which for platform_fulfilled/FBA lines is a MARKETPLACE_ID, never a
// real warehouse (→ concrete=0/logical=0/missing=176). We classify at the adapter from the signals the WSA line
// actually carries: `destinationWarehouseId` is a concrete WAREHOUSE only if it is a genuine ACTIVE warehouse in the
// harvested index; otherwise, if a canonical marketplace token exists, it is a LOGICAL MARKETPLACE; otherwise BLOCK.
// A string that merely looks like a warehouse id is NEVER auto-resolved — it must match an active warehouse row.
function weeklyAiPlanWhActive_(w) {
  if (!w) return false;
  var a = String(w.is_active == null ? '' : w.is_active).trim().toLowerCase();
  return !(a === 'false' || a === 'no' || a === '0' || w.is_active === false);
}
function weeklyAiPlanClassifyDestination_(l, whById) {
  function s(v) { return String(v == null ? '' : v).trim(); }
  var ref = s(l.destinationWarehouseId), mkt = s(l.marketplace), country = s(l.country);
  if (ref) {
    var w = whById[ref];
    if (w && weeklyAiPlanWhActive_(w)) return { kind: 'WAREHOUSE', warehouse_id: ref, country: country || s(w.country), matched_by: 'active_warehouse_id' };
  }
  if (mkt) return { kind: 'MARKETPLACE', marketplace: mkt, marketplace_ref: ref, country: country, matched_by: 'marketplace_token' };
  return { kind: '', reason: 'DESTINATION_UNRESOLVED' };
}
function weeklyAiPlanK2AllocatedLines_(lines, harvest) {
  var horizons = (harvest && harvest.horizonsByDemandRef) || {};
  var whById = (harvest && harvest.warehousesById) || {};
  function s(v) { return String(v == null ? '' : v).trim(); }
  var out = [];
  (lines || []).forEach(function (l) {
    if (!l || s(l.blockedReason)) return;                              // blocked upstream → no line
    var qty = (typeof l.recommendedQty === 'number') ? l.recommendedQty : Number(l.recommendedQty);
    if (!isFinite(qty) || qty <= 0) return;                           // zero recommendation → no line
    var dk = s(l.demandKey);
    var hz = horizons[dk] || null;
    // primary (earliest) window from the horizon's requiredByByWindow, if present
    var windowCode = '', requiredBy = '';
    if (hz && hz.requiredByByWindow) {
      var wins = Object.keys(hz.requiredByByWindow).sort(function (a, b) { return String(hz.requiredByByWindow[a]) < String(hz.requiredByByWindow[b]) ? -1 : 1; });
      if (wins.length) { windowCode = wins[0]; requiredBy = String(hz.requiredByByWindow[wins[0]]); }
    }
    // CANONICAL destination classification (concrete active warehouse | logical marketplace | BLOCK).
    var destination = weeklyAiPlanClassifyDestination_(l, whById);
    // SOURCE: single-pool → concrete id; multi-pool (breakdown has ≥1 concrete source but no single winner) is a
    // TRUTHFUL distinct block (never guessed). F1-7N-FA-3C-R6F2C (F): a deterministic per-source whole-carton split
    // from allocationBreakdown is possible but changes the generated line grain (floored shipped qty), so it is
    // DEFERRED to a controlled generation round; here the line is fail-closed as ROUTE_SOURCE_MULTI_POOL_UNRESOLVED.
    var srcId = s(l.sourceWarehouseId), srcWh = whById[srcId] || {};
    var bd = Array.isArray(l.allocationBreakdown) ? l.allocationBreakdown : [];
    var multiPool = !srcId && bd.some(function (b) { return s(b.sourceWarehouseId) !== ''; });
    out.push({
      sku: s(l.masterSku), site_sku: s(l.siteSku || l.site_sku), window_code: windowCode,
      window_start_date: '', window_end_date: '', required_by_date: requiredBy,
      source_warehouse_id: srcId, source_warehouse_code_snapshot: s(srcWh.warehouse_code),
      source_multi_pool: multiPool ? true : false,
      planned_qty: qty, recommended_qty: qty, units_per_carton: (l.unitsPerCarton != null ? l.unitsPerCarton : ''),
      marketplace: s(l.marketplace), destination: destination
    });
  });
  return out;
}
function weeklyAiPlanParseResp_(resp) { try { return JSON.parse(resp && resp.getContent ? resp.getContent() : (typeof resp === 'string' ? resp : '{}')); } catch (e) { return { success: false, parse_error: true }; } }

// F1-7N-FA-3C-R6F2G (C) / R6F2G2 (B,C) — authoritative GAP-INV run lineage for a K2 CREATE/REGENERATE. Reads the SAME
// production authority the gap job writes (the GAP_JOB_INVENTORY script property; 46_ gap-materialization job), never a
// fresh clock or a fabricated value. A K2 header MUST stamp calculation_run_id from a DONE GAP-INV run whose planning
// cycle equals the request; a MONTHLY_ORDER run is NEVER used; a missing / non-DONE / wrong-prefix / wrong-cycle run
// BLOCKS before ANY write (zero rows).
// R6F2G2 SEMANTIC FREEZE — two DISTINCT concepts, both from the SAME GAP run but different fields:
//   calculated_at     = st.finishedAt — the wall-clock TIMESTAMP the GAP calculation FINISHED (completion).
//   source_data_as_of = st.calculationDate — the GAP run's FROZEN calculation/input cutoff DATE (server Taipei calendar
//                       date resolved at run execution, NOT a browser clock, NOT current time; 43_:27,251,255). This is
//                       the business-data cutoff the calc consumed. It is persisted on the run and reproducible across
//                       reads without rerunning GAP. It is deliberately NOT the harvest's sourceDataAsOf (which is
//                       sourced from the recommendation-workspace line and is blank for scopes whose lines omit it).
// A blank cutoff BLOCKS before write (never a silent blank, never current time).
function weeklyAiPlanResolveGapRunLineage_(planningCycle, harvest, request) {
  var raw = null;
  try { raw = PropertiesService.getScriptProperties().getProperty('GAP_JOB_INVENTORY'); } catch (e0) { raw = null; }
  if (!raw) return { ok: false, reason: 'LINEAGE_GAP_RUN_UNRESOLVED' };
  var st = null; try { st = JSON.parse(raw); } catch (ep) { st = null; }
  if (!st) return { ok: false, reason: 'LINEAGE_GAP_RUN_UNPARSEABLE' };
  if (String(st.product || '').toUpperCase() !== 'INVENTORY') return { ok: false, reason: 'LINEAGE_RUN_NOT_INVENTORY' };   // MONTHLY_ORDER etc. never used
  var runId = String(st.runId || '').trim();
  if (!/^GAP-INV-/.test(runId)) return { ok: false, reason: 'LINEAGE_RUN_ID_PREFIX_INVALID' };
  if (String(st.status || '').toUpperCase() !== 'DONE') return { ok: false, reason: 'LINEAGE_GAP_RUN_NOT_DONE' };
  var cyc = String(planningCycle || '').trim();
  if (cyc && String(st.planningCycle || '').trim() !== cyc) return { ok: false, reason: 'LINEAGE_RUN_CYCLE_MISMATCH' };
  var sourceDataAsOf = String(st.calculationDate || '').trim();   // R6F2G2: the frozen input cutoff DATE for THIS run
  if (!sourceDataAsOf) return { ok: false, reason: 'LINEAGE_SOURCE_DATA_AS_OF_UNAVAILABLE' };   // block, never silent blank
  return {
    ok: true, run_id: runId,
    calculation_run_id: runId,
    calculated_at: String(st.finishedAt || '').trim(),
    source_data_as_of: sourceDataAsOf,
    formula_version: String((request && request.formulaVersion) || 'WEEKLY_AI_PLAN_V1').trim(),
    planning_cycle: String(st.planningCycle || '').trim()
  };
}

function weeklyAiPlanGenerateK2_(ss, request, harvest, deps, body, controlledAuth) {
  var src = KMWRB.buildWeeklySourceLines(request);
  if (!src.ok) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_(src.status || 'BLOCKED_INPUT', src.reason || 'source lines blocked')] });
  var carriers = weeklyAiPlanReadCarrierAuthorities_(ss);
  var shipDate = weeklyAiPlanShipDate_(harvest);
  var scope0 = request.businessScope || {};
  var allocated = weeklyAiPlanK2AllocatedLines_(src.lines, harvest);
  // group by marketplace (each K2 group is within one marketplace); route dims further split within.
  var byMkt = {};
  allocated.forEach(function (a) { var m = String(a.marketplace || '').trim(); (byMkt[m] = byMkt[m] || []).push(a); });
  // F1-7N-FA-3C-R6F2D (F) — EXACT marketplace scoping for a controlled run. When the request names a marketplace, the
  // run generates ONLY that marketplace (never fans out / never ALL_SITES); the applied scope MUST equal the requested
  // scope or the run fails closed (no out-of-scope rows). An aggregated company/country run (no marketplace) keeps the
  // legacy fan-out but is NOT the controlled-run path.
  var requestedMkt = String(scope0.marketplace != null ? scope0.marketplace : '').trim();
  if (requestedMkt) {
    if (/^all(_sites)?$/i.test(requestedMkt)) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('SCOPE_ALL_SITES_FORBIDDEN', 'a controlled run must target exactly one marketplace, never ALL_SITES')] });
    if (!byMkt[requestedMkt]) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('REQUESTED_SCOPE_EMPTY', 'requested marketplace produced no allocated lines: ' + requestedMkt)] });
    var only = {}; only[requestedMkt] = byMkt[requestedMkt]; byMkt = only;   // fail-closed: never generate outside the frozen marketplace
  }
  // F1-7N-FA-3C-R6F2F1 — IMMEDIATE BACKEND GATE. Generation proceeds ONLY when the GLOBAL flag is true (normal
  // production) OR an INTERNAL controlled capability authorizes THIS exact scope while the flag is false. Every other
  // flag-false invocation is blocked with a typed CONTROLLED_GENERATION_UNAUTHORIZED (zero writes). The public handler
  // gates the flag BEFORE reaching here, and never passes controlledAuth — so no public/frontend request can pass.
  var flagTrue = (typeof inventoryAiPlanDbGenerationEnabled_ === 'function') && inventoryAiPlanDbGenerationEnabled_() === true;
  if (!flagTrue) {
    var liveScopeSpec = { scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt }, planning_cycle: request.planningCycle };
    var authRes = (typeof WeeklyAiPlanControlledAuthority_ !== 'undefined') ? WeeklyAiPlanControlledAuthority_.verify(controlledAuth, liveScopeSpec) : { ok: false, reason: 'AUTHORITY_MODULE_MISSING' };
    if (!authRes.ok) return jsonResponse_({ success: false, disabled: true, errors: [weeklyAiPlanErr_('CONTROLLED_GENERATION_UNAUTHORIZED', 'global flag is false and no valid INTERNAL controlled authority for this exact scope (' + authRes.reason + '); zero rows written', { auth_reason: authRes.reason })] });
  }
  // F1-7N-FA-3C-R6F2G (C) — resolve + BLOCK on the authoritative GAP-INV run lineage BEFORE any write. A K2 header must
  // carry the DONE GAP-INV run id (cycle-matched) as calculation_run_id; without it the run fails closed (zero rows).
  var lineage = weeklyAiPlanResolveGapRunLineage_(request.planningCycle, harvest, request);
  if (!lineage.ok) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_(lineage.reason, 'K2 generation blocked: authoritative GAP-INV run lineage unavailable or mismatched (' + lineage.reason + '); zero rows written', { planning_cycle: request.planningCycle })] });

  var groupsWritten = [], blockedTotal = [], conservationAll = [], anyOk = false, anyFail = false;

  // DELIBERATELY PLACED AFTER THE AUTHORIZATION GATE REGION. The gate above authorizes ONLY from the internal
  // controlled capability via verify(); a standing regression test asserts that region reads NO `body.` field,
  // because anything it reads from the request is something a caller could try to authorize itself with. The run
  // id is identity, not authorization — but it does read the body, so it belongs outside that region rather than
  // weakening the invariant that protects it.
  // F1-7N-FB-4C §E Stage 1 — THE IMMUTABLE GENERATION RUN ID. Minted ONCE, before any write, and stamped on
  // every header this run touches. It is what makes "rows of an OLDER run" a decidable question later, and what
  // makes a retry idempotent: the caller's execution key derives the same id, so a repeat run REUSEs its own
  // committed rows instead of creating a second current run.
  var executionKey = weeklyAiPlanStr_(body && (body.execution_key || body.executionKey)) ||
    ('AIPLAN-' + sadFnv1a_([request.planningCycle, scope0.company, scope0.country, requestedMkt, lineage.calculation_run_id].join('|')).toUpperCase());
  var generationRunId = 'AIRUN-' + sadFnv1a_(executionKey).toUpperCase();

  Object.keys(byMkt).sort().forEach(function (M) {
    var plan = KMWRR.buildK2GenerationPlan({
      scope: { planning_cycle: request.planningCycle, company: scope0.company, country: scope0.country, marketplace: M, source_page: scope0.source_page },
      allocatedLines: byMkt[M], warehousesById: harvest.warehousesById,
      rateCards: carriers.rateCards, leadTimes: carriers.leadTimes, shipDate: shipDate,
      authorizedBySkuWindow: (function () { var a = {}; byMkt[M].forEach(function (x) { var k = String(x.sku).toLowerCase() + '|' + String(x.window_code).toLowerCase(); a[k] = (a[k] || 0) + (Number(x.planned_qty) || 0); }); return a; })(),
      sourceCeilingById: {}
    });
    plan.blocked.forEach(function (b) { blockedTotal.push({ marketplace: M, block: b.block }); });
    conservationAll.push({ marketplace: M, conserved: plan.conservation.conserved });
    plan.groups.forEach(function (g) {
      // G — each K2 group is INDIVIDUALLY atomic (one lock inside the atomic endpoint). The overall job reports a
      // truthful per-group outcome; whole-job success is claimed ONLY when every group committed. A retry uses the
      // SAME deterministic identity (SADH-K2-…) so a committed group REUSEs (zero writes), never duplicates.
      // R6F2G (C) — stamp the authoritative lineage onto the header before the atomic write. These fields are EXCLUDED
      // from the REUSE fingerprint (SAD_K2_HEADER_FP_/LINE_FP_), so a committed group still REUSEs (zero writes) here.
      g.header.calculation_run_id = lineage.calculation_run_id;
      g.header.formula_version = lineage.formula_version;
      g.header.calculated_at = lineage.calculated_at;
      g.header.source_data_as_of = lineage.source_data_as_of;
      // FB-4C §D — provenance for the lifecycle. `generation_run_id` marks WHICH run owns this row; without it
      // no later run can tell its own rows from the ones it is replacing.
      g.header.generation_run_id = generationRunId;
      var resp = weeklyAiPlanParseResp_(handleUpsertShippingAllocationDraftAtomic_({ header: g.header, lines: g.lines, enforce_k2_grouping: true }));
      var d = (resp && resp.data) ? resp.data : {};
      var outcome = resp && resp.success ? (resp.reused ? 'REUSED' : (d.outcome || 'CREATED')) : ((d && d.reason) ? d.reason : (resp && /COMMITTED_UNVERIFIED/.test(resp.error || '') ? 'COMMITTED_UNVERIFIED' : (resp && /RECONCILIATION_REQUIRED/.test(resp.error || '') ? 'RECONCILIATION_REQUIRED' : 'BLOCKED')));
      if (resp && resp.success) anyOk = true; else anyFail = true;
      groupsWritten.push({ marketplace: M, groupNo: g.groupNo, outcome: outcome, allocation_draft_id: d.allocation_draft_id || null, draft_version: d.draft_version || null, line_count: d.line_count || 0, ok: !!(resp && resp.success), error: (resp && !resp.success) ? resp.error : null });
    });
  });
  var outcomeCounts = {};
  groupsWritten.forEach(function (g) { outcomeCounts[g.outcome] = (outcomeCounts[g.outcome] || 0) + 1; });
  // F1-7N-FA-3C-R6F2D (F) — applied scope MUST equal the requested scope. The applied marketplaces = the ones actually
  // generated; on a controlled (marketplace-scoped) run this must be exactly the requested marketplace (no widening).
  var appliedMkts = {}; groupsWritten.forEach(function (g) { appliedMkts[String(g.marketplace || '')] = 1; }); blockedTotal.forEach(function (b) { appliedMkts[String(b.marketplace || '')] = 1; });
  var appliedList = Object.keys(appliedMkts).filter(function (m) { return m !== ''; }).sort();
  var scopeEqual = requestedMkt ? (appliedList.length <= 1 && (appliedList.length === 0 || appliedList[0] === requestedMkt)) : true;
  if (requestedMkt && !scopeEqual) return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('APPLIED_SCOPE_WIDENED', 'applied scope ' + JSON.stringify(appliedList) + ' != requested marketplace ' + requestedMkt + ' — refused (no out-of-scope rows)')] });
  // job-level status: COMPLETED only if every group ok; else PARTIAL (never claim whole-job success on partial commit).
  var jobStatus = groupsWritten.length === 0 ? (blockedTotal.length ? 'ALL_BLOCKED' : 'NO_DEMAND') : (anyFail ? (anyOk ? 'PARTIAL' : 'FAILED') : 'COMPLETED');

  // F1-7N-FB-4C §E — A ZERO-RESULT RUN IS A SUCCESSFUL RUN. Computing no recommendations is a real answer about
  // the world ("nothing needs shipping this cycle"), not a failure, and it must still replace the previous
  // proposal — otherwise last week's plan silently stays active and looks like this week's advice. It writes NO
  // empty header and NO empty line. ALL_BLOCKED is NOT this case: something went wrong there, so nothing expires.
  var zeroResult = (jobStatus === 'NO_DEMAND');
  var runSucceeded = zeroResult || (anyOk && !anyFail);

  // §E Stage 3 steps 5-7 — EXPIRE ONLY AFTER THE CURRENT RUN IS COMMITTED AND VERIFIED. A failed or partial run
  // expires NOTHING, so the operator is never left without an active plan because a replacement half-landed.
  var lifecycle = { attempted: false, ok: null, expired_headers: 0, expired_lines: 0, reason: null, verification: null, manifest: null };
  if (runSucceeded) {
    if (typeof aiplExpireSupersededDrafts_ !== 'function') {
      lifecycle.reason = 'AI_PLAN_LIFECYCLE_MODULE_MISSING';
    } else {
      lifecycle.attempted = true;
      var committedIds = groupsWritten.filter(function (g) { return g.ok && g.allocation_draft_id; })
        .map(function (g) { return String(g.allocation_draft_id); });
      var expScopes = requestedMkt ? [requestedMkt] : appliedList;
      var agg = { ok: true, expired_headers: 0, expired_lines: 0, verification: [], manifest: [], blockers: [] };
      expScopes.forEach(function (M) {
        var r = aiplExpireSupersededDrafts_(ss, {
          scope: { company: scope0.company, country: scope0.country, marketplace: M,
            planning_cycle: request.planningCycle, source_page: WEEKLY_AI_PLAN_SOURCE_PAGE_ },
          generation_run_id: generationRunId, committed_ids: committedIds,
          actor: weeklyAiPlanStr_(body && body.actor) || 'inventory-ai-plan'
        });
        if (!r.ok) agg.ok = false;
        agg.expired_headers += r.expired_headers || 0;
        agg.expired_lines += r.expired_lines || 0;
        if (r.verification) agg.verification.push({ marketplace: M, verification: r.verification });
        if (r.manifest) agg.manifest.push({ marketplace: M, checksum: r.manifest.checksum, expire_count: r.manifest.expire_count, preserve_count: r.manifest.preserve_count });
        if (r.blockers && r.blockers.length) agg.blockers.push({ marketplace: M, blockers: r.blockers });
      });
      lifecycle.ok = agg.ok;
      lifecycle.expired_headers = agg.expired_headers;
      lifecycle.expired_lines = agg.expired_lines;
      lifecycle.verification = agg.verification;
      lifecycle.manifest = agg.manifest;
      if (!agg.ok) lifecycle.reason = agg.blockers.length ? 'EXPIRATION_BLOCKED' : 'EXPIRATION_VERIFICATION_FAILED';
      if (agg.blockers.length) lifecycle.blockers = agg.blockers;
    }
  } else {
    lifecycle.reason = 'RUN_NOT_SUCCESSFUL_NOTHING_EXPIRED';
  }

  var activeCount = groupsWritten.filter(function (g) { return g.ok; }).length;
  return jsonResponse_({
    success: runSucceeded,
    data: {
      mode: 'K2_ROUTE_GROUP', job_status: jobStatus, planningCycle: request.planningCycle, businessScope: scope0,
      // §G — the projection the frontend needs to refresh honestly.
      generation_run_id: generationRunId, execution_key: executionKey,
      scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt || null, planning_cycle: request.planningCycle },
      created_headers: groupsWritten.filter(function (g) { return g.ok && g.outcome === 'CREATED'; }).length,
      updated_headers: groupsWritten.filter(function (g) { return g.ok && (g.outcome === 'UPDATED' || g.outcome === 'REGENERATED' || g.outcome === 'REUSED'); }).length,
      created_lines: groupsWritten.filter(function (g) { return g.ok && g.outcome === 'CREATED'; }).reduce(function (a, g) { return a + (g.line_count || 0); }, 0),
      updated_lines: groupsWritten.filter(function (g) { return g.ok && g.outcome !== 'CREATED'; }).reduce(function (a, g) { return a + (g.line_count || 0); }, 0),
      expired_headers: lifecycle.expired_headers, expired_lines: lifecycle.expired_lines,
      active_count: activeCount, expired_count: lifecycle.expired_headers, zero_result: zeroResult,
      verification: { lifecycle_ok: lifecycle.ok, lifecycle_reason: lifecycle.reason, detail: lifecycle.verification, manifest: lifecycle.manifest },
      lifecycle: lifecycle,
      requested_scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt || 'ALL_MARKETPLACES(company/country fan-out)' },
      applied_scope: { company: scope0.company, country: scope0.country, marketplaces: appliedList }, applied_equals_requested: scopeEqual ? 'YES' : 'NO',
      groups_written: groupsWritten.length, per_group_outcome_counts: outcomeCounts, groups: groupsWritten,
      blocked_count: blockedTotal.length, blocked: blockedTotal,
      conservation: conservationAll, skuCount: src.skuCount, unresolvedProductionNeedQty: src.unresolvedTotal,
      atomicity_note: 'Each K2 group is atomic under its own lock; the job is NOT a single all-or-nothing transaction across groups — a PARTIAL job is reported truthfully per group, and a retry REUSEs committed groups by deterministic identity (no duplicates). Superseded AI drafts are expired ONLY after this run has committed and verified.'
    },
    errors: (anyFail ? [weeklyAiPlanErr_('K2_GENERATION_PARTIAL', 'one or more K2 groups did not commit; see data.groups (per-group outcome)')] : [])
      .concat(lifecycle.attempted && lifecycle.ok === false
        ? [weeklyAiPlanErr_('AI_PLAN_EXPIRATION_INCOMPLETE', 'the current run committed, but superseded drafts were not fully expired; the previous plan may still be active. See data.lifecycle.', { reason: lifecycle.reason })]
        : [])
  });
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
