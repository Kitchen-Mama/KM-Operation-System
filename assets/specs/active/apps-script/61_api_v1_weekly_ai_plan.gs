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
    // §E.2 — the client sends IDENTITY and its EXPECTED lineage/quantity; it never sends a quantity that is
    // taken as true. `expectedDemand` is optional: absent means "no expectation to reconcile", present means
    // every entry must AGREE with the canonical row or the run refuses.
    var expectedBySite = weeklyAiPlanExpectedDemand_(body, company, country);
    var h = weeklyAiPlanHarvest_(ss, { company: company, country: country, planningCycle: planningCycle }, expectedBySite);
    if (!h.ok) return jsonResponse_({ success: false, errors: h.errors || [weeklyAiPlanErr_('HARVEST_FAILED', 'fact harvest failed')] });

    // ---- MAP → (company,country) batch request (PURE, Node-verified) ---------------------------------------
    var mapped = KMWHA.mapWeeklyHarvestToBatchRequest({
      planningCycle: planningCycle,
      businessScope: { company: company, country: country, source_page: WEEKLY_AI_PLAN_SOURCE_PAGE_ },
      mode: mode, confirmRegenerateOverUserEdits: body.confirmRegenerateOverUserEdits === true,
      actor: weeklyAiPlanStr_(body.actor) || 'user', now: procurementTimestamp_(),
      sourceDataAsOf: h.sourceDataAsOf, formulaVersion: 'WEEKLY_AI_PLAN_V1',
      // §D — the harvest's own per-site drops, so the readiness result can name WHICH site and WHY
      // instead of only that the universe came out empty.
      errors: Array.isArray(h.errors) ? h.errors : [],
      factoryIdentityConfig: WEEKLY_AI_PLAN_FACTORY_IDENTITY_, warehousesById: h.warehousesById,
      kmaf: h.kmaf, horizonsByDemandRef: h.horizonsByDemandRef, poolsBySku: h.poolsBySku
    });
    // F1-7N-FC-1B-E3-R1 §D — the typed readiness answer, in the ONE place the browser can read it.
    //
    // Two separate defects were hiding behind this line. The first is that `mapped.issues` was EMPTY for the
    // live shape (fixed at the mapper). The second is that `weeklyAiPlanErr_` puts every extra field at the
    // error's TOP level, and _kmWeeklyCommand_ preserves only `code`, `message` and `details` — so even a
    // full issues array would not have reached the page. It is nested under `details` now, and the message
    // itself names the first blocking issue instead of restating the generic code.
    if (!mapped.ready) {
      // F1-7N-FC-1B-E3-R4 §G — before this is reported as a failure, ask whether it IS one.
      var _nd = weeklyAiPlanNoDemandVerdict_(h, mapped);
      if (_nd.noDemand) {
        return jsonResponse_({
          success: true,
          data: {
            code: 'NO_REPLENISHMENT_REQUIRED',
            message: 'No replenishment is required for this scope.',
            planning_cycle: planningCycle,
            scope: { company: company, country: country, marketplace: weeklyAiPlanStr_(body.currentMarketplace) },
            site_count: h.site_count == null ? null : h.site_count,
            receiver_count: _nd.receiverCount,
            requested_qty: 0, allocated_qty: 0, route_count: 0, routes: [],
            // The page's existing zero-result classifier reads these two. A new success shape that the
            // client cannot recognise would be reported as a generic failure, which is the opposite of
            // the point; `status` and `zero_result` keep it on the path that already works.
            status: 'COMPLETED', zero_result: true, job_status: 'NO_DEMAND',
            header_created: false, line_created: false, db_writes: 0,
            demand_basis_total: _nd.basisTotal, canonical_demand_total: _nd.gapTotal,
            source_data_as_of: weeklyAiPlanStr_(h.sourceDataAsOf),
            forecast_normalization: h.forecast_normalization || null
          },
          errors: []
        });
      }
      var _rdIssues = Array.isArray(mapped.issues) ? mapped.issues : [];
      var _rdFirst = _rdIssues.filter(function (i) { return i && i.blocking !== false; })[0] || _rdIssues[0] || null;
      var _rdMsg = _rdFirst
        ? ('canonical facts not ready: ' + _rdFirst.code + (_rdFirst.field ? ' (' + _rdFirst.field + ')' : '') +
           (_rdFirst.actual ? ' — ' + _rdFirst.actual : ''))
        : 'canonical §7 facts not ready (fail closed)';
      return jsonResponse_({
        success: false,
        errors: [weeklyAiPlanErr_('HARVEST_NOT_READY', _rdMsg, {
          details: {
            stage: 'READINESS',
            readiness_reason: mapped.reason || null,
            issues: _rdIssues,
            warnings: Array.isArray(mapped.warnings) ? mapped.warnings : [],
            predicates: Array.isArray(mapped.predicates) ? mapped.predicates : [],
            harvest: { ok: h.ok === true, site_count: h.site_count == null ? null : h.site_count,
              receiver_count: h.receiver_count == null ? null : h.receiver_count,
              source_data_as_of: weeklyAiPlanStr_(h.sourceDataAsOf) },
            // §G — why this was NOT treated as an empty group. Without it, "you said zero demand is fine,
            // so why is this red" has no answer but a re-read of the source.
            no_demand_verdict: { no_demand: false, reason: _nd.reason, receiver_count: _nd.receiverCount,
              demand_basis_total: _nd.basisTotal, canonical_demand_total: _nd.gapTotal,
              positive_gap_refs: _nd.positiveGapRefs.slice(0, 20) },
            planning_cycle: planningCycle,
            scope: { company: company, country: country, marketplace: weeklyAiPlanStr_(body.currentMarketplace) },
            db_writes: 0
          }
        })]
      });
    }

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
// F1-7N-FC-1B-E3-R1 — 61_ owns the harvest, the readiness decision and the generation, and it carried NO
// build stamp: it was the one file in this chain whose sync state the deployment manifest could not report, so
// "the deployment answers HARVEST_NOT_READY with no issues" and "the deployment predates the fix" were the same
// observation. Stamped and registered in 63_'s manifest.
var WAP_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1';

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
  // F1-7N-FC-1B-E3-R4-A2-R1 §9 — THE FLAG SAYS "GENERATION IS ON". IT DOES NOT SAY "FOR EVERYTHING".
  //
  // The global flag is the only switch this path had, and it is far too blunt to turn on for a trial: flipping
  // it authorizes materialization for every company, country, marketplace and SKU at once, so the first
  // controlled run and a 495-scope production write are the same gesture. The allowlist splits those apart.
  // It is SERVER-OWNED config beside the flag itself, so no request payload and no browser can widen it, and
  // widening it is a deployment with a diff.
  //
  // IT GATES AT THE WRITER, not at the harvest. A census, a dry run and a readiness report must still be able
  // to SEE every scope — refusing to look is not safety, it is blindness. What must be narrow is what gets
  // WRITTEN, and this is the last point before that.
  //
  // Lines outside the allowlist are DROPPED and COUNTED, never silently included and never silently ignored:
  // if nothing survives, the run refuses with a typed code rather than reporting a successful plan for zero
  // routes, because those two mean opposite things to whoever pressed the button.
  if (flagTrue) {
    var _gateOn = (typeof inventoryAiPlanScopeEnabled_ === 'function');
    if (!_gateOn) {
      return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('AI_PLAN_SCOPE_GUARD_UNAVAILABLE',
        'the activation allowlist is not present in this deployment; generation is refused rather than run unguarded')] });
    }
    var _kept = {}, _keptCount = 0, _excluded = [];
    for (var _mk in byMkt) {
      if (!Object.prototype.hasOwnProperty.call(byMkt, _mk)) continue;
      var _in = byMkt[_mk].filter(function (a) {
        var okScope = inventoryAiPlanScopeEnabled_(scope0.company, scope0.country, _mk, a && a.sku);
        if (!okScope) _excluded.push({ marketplace: _mk, sku: weeklyAiPlanStr_(a && a.sku) });
        return okScope;
      });
      if (_in.length) { _kept[_mk] = _in; _keptCount += _in.length; }
    }
    if (!_keptCount) {
      return jsonResponse_({ success: false, errors: [weeklyAiPlanErr_('AI_PLAN_SCOPE_NOT_ENABLED',
        'no line in this run is inside the controlled activation allowlist; zero rows written',
        { scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt || null },
          excluded_count: _excluded.length, excluded_sample: _excluded.slice(0, 10),
          allowlist: (typeof inventoryAiPlanActivationAllowlist_ === 'function') ? inventoryAiPlanActivationAllowlist_() : null,
          db_writes: 0 })] });
    }
    byMkt = _kept;
    // Carried out with the result so a partial run is visible rather than inferred from a smaller number.
    harvest = harvest || {};
    harvest.scope_guard = { enforced: true, kept_lines: _keptCount, excluded_lines: _excluded.length,
      excluded_sample: _excluded.slice(0, 10) };
  }
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

  // ==========================================================================================================
  // ADDENDUM §A/§B — TWO PASSES, WITH THE GATE BETWEEN THEM.
  //
  // FB-4C built each marketplace's plan and wrote it in the SAME loop, so the first row was committed before
  // anything had looked at the lifecycle schema or at what the operator had already decided. The plan builder
  // (KMWRR.buildK2GenerationPlan) is pure, so the loop splits cleanly: PASS 1 computes every group and writes
  // nothing; the gate then runs on the complete set of proposed identities; PASS 2 writes only what survived.
  // This is what makes "zero writes" a structural property rather than a claim - there is no code path from a
  // gate refusal to a write.
  // ==========================================================================================================

  // ---- PASS 1: compute every group. ZERO WRITES. ----
  var planned = [];                                  // { marketplace, groupNo, header, lines, identity_key }
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
      // R6F2G (C) — stamp the authoritative lineage onto the header before the atomic write. These fields are EXCLUDED
      // from the REUSE fingerprint (SAD_K2_HEADER_FP_/LINE_FP_), so a committed group still REUSEs (zero writes) here.
      g.header.calculation_run_id = lineage.calculation_run_id;
      g.header.formula_version = lineage.formula_version;
      g.header.calculated_at = lineage.calculated_at;
      g.header.source_data_as_of = lineage.source_data_as_of;
      // FB-4C §D — provenance for the lifecycle. `generation_run_id` marks WHICH run owns this row; without it
      // no later run can tell its own rows from the ones it is replacing.
      g.header.generation_run_id = generationRunId;
      planned.push({
        marketplace: M, groupNo: g.groupNo, header: g.header, lines: g.lines,
        identity_key: (typeof sadK2GroupKey_ === 'function') ? sadK2GroupKey_(g.header) : '',
        recommended_total: (g.lines || []).reduce(function (a, l) { return a + (Number(l.recommended_qty) || 0); }, 0)
      });
    });
  });

  // ---- THE GATE. Reads only. Anything that fails here returns BEFORE the first write. ----
  var activeRows = [], activeHeaders = [];
  try {
    var _hs = ss.getSheetByName('shipping_allocation_drafts');
    if (_hs) {
      var _d = _hs.getDataRange().getValues();
      if (_d && _d.length > 1) {
        activeHeaders = _d[0].map(function (h) { return String(h == null ? '' : h).trim(); });
        for (var _r = 1; _r < _d.length; _r++) {
          var _o = { __row: _r + 1 };
          for (var _c = 0; _c < activeHeaders.length; _c++) if (activeHeaders[_c]) _o[activeHeaders[_c]] = _d[_r][_c];
          var _st = String(_o.status == null ? '' : _o.status).trim().toLowerCase();
          // "Active" = not terminal. The named terminal set is the authority; an expired/submitted/cancelled row
          // holds no identity and must never suppress a fresh recommendation.
          var _term = (typeof SAD_TERMINAL_STATUSES_ !== 'undefined') ? SAD_TERMINAL_STATUSES_ : { submitted: 1, cancelled: 1, expired: 1 };
          if (!_term[_st]) activeRows.push(_o);
        }
      }
    }
  } catch (eRead) { activeRows = []; }

  // §B — per-identity precedence, computed on the FULL proposed set before anything is written.
  var precedence = (typeof aiplManualPrecedence_ === 'function')
    ? aiplManualPrecedence_(activeRows, planned.map(function (pl) {
        var held = null;
        for (var i = 0; i < activeRows.length; i++) {
          if ((typeof sadK2GroupKey_ === 'function' ? sadK2GroupKey_(activeRows[i]) : '') === pl.identity_key) { held = activeRows[i]; break; }
        }
        return { identity_key: pl.identity_key, recommendation: pl.recommended_total,
                 persisted_user_qty: held ? (held.__persisted_user_qty != null ? held.__persisted_user_qty : null) : null };
      }), function (r) { return (typeof sadK2GroupKey_ === 'function') ? sadK2GroupKey_(r) : ''; })
    : planned.map(function (pl) { return { identity_key: pl.identity_key, decision: 'PROCEED' }; });

  var decisionByKey = {};
  precedence.forEach(function (d) { decisionByKey[d.identity_key] = d; });
  var collisions = precedence.filter(function (d) { return d.decision === 'ACTIVE_SOURCE_IDENTITY_COLLISION'; });
  var suppressed = precedence.filter(function (d) { return d.decision === 'SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT'; });

  // §A/§H — the schema/activation gate. Placed HERE: after the run id is minted (the gate requires one) and
  // before the first write. On refusal the whole command stops with zero writes and the complete diagnosis.
  if (typeof aiplActivationGate_ === 'function' && typeof aiplReadActivationFacts_ === 'function') {
    var facts = aiplReadActivationFacts_(ss, { generation_run_id: generationRunId, identity_collisions: collisions });
    var gate = aiplActivationGate_(facts);
    if (!gate.ready) {
      return jsonResponse_({
        success: false, zero_write: true,
        errors: [gate.error],
        data: {
          mode: 'K2_ROUTE_GROUP', job_status: 'BLOCKED_SCHEMA_NOT_READY',
          planningCycle: request.planningCycle, businessScope: scope0,
          generation_run_id: generationRunId, execution_key: executionKey,
          created_headers: 0, updated_headers: 0, created_lines: 0, updated_lines: 0,
          expired_headers: 0, expired_lines: 0, active_count: 0, expired_count: 0,
          zero_result: false, groups: [], blocked: [],
          lifecycle: { ran: false, reason: gate.error.code, expired_headers: 0, expired_lines: 0 },
          schema_gate: gate.error
        }
      });
    }
  } else {
    // The lifecycle module is not in the deployed project. That is a MIXED DEPLOYMENT, not a reason to proceed:
    // without it nothing would expire and the run would leave two active plans - exactly the state §A forbids.
    return jsonResponse_({
      success: false, zero_write: true,
      errors: [weeklyAiPlanErr_('AI_PLAN_LIFECYCLE_SCHEMA_NOT_READY',
        'the AI Plan lifecycle module (69_api_v1_ai_plan_lifecycle.gs) is not present in this Apps Script project, so no run may write: it would create a new draft while leaving the previous one active.',
        { missing_table: [], missing_columns: [], invalid_status_authority: [],
          expected_migration_version: 'FB4C-AI-LIFECYCLE-1', zero_write: true,
          created_headers: 0, created_lines: 0, expired_headers: 0, expired_lines: 0,
          next_action: 'Sync 69_api_v1_ai_plan_lifecycle.gs into the Apps Script project and publish a new deployment version.' })],
      data: { job_status: 'BLOCKED_LIFECYCLE_MODULE_MISSING', created_headers: 0, created_lines: 0, expired_headers: 0, expired_lines: 0, groups: [] }
    });
  }

  // ---- PASS 2: write. Only identities the gate and precedence allow. ----
  planned.forEach(function (pl) {
    var d = decisionByKey[pl.identity_key] || { decision: 'PROCEED' };
    // §B — an active manual Execution Plan is the binding decision: no parallel AI draft, no overwrite. The run
    // continues for every other identity, and the suppression is REPORTED with what the AI would have proposed.
    if (d.decision === 'SUPPRESSED_BY_ACTIVE_MANUAL_DRAFT' || d.decision === 'ACTIVE_SOURCE_IDENTITY_COLLISION') {
      groupsWritten.push({
        marketplace: pl.marketplace, groupNo: pl.groupNo, outcome: d.decision,
        allocation_draft_id: (d.manual_identity && d.manual_identity.allocation_draft_id) || null,
        draft_version: null, line_count: 0, ok: true, suppressed: true,
        created: false, updated: false, blocks_run: false,
        identity_key: pl.identity_key, precedence: d, error: null
      });
      return;
    }
    // G — each K2 group is INDIVIDUALLY atomic (one lock inside the atomic endpoint). The overall job reports a
    // truthful per-group outcome; whole-job success is claimed ONLY when every group committed. A retry uses the
    // SAME deterministic identity (SADH-K2-…) so a committed group REUSEs (zero writes), never duplicates.
    var resp = weeklyAiPlanParseResp_(handleUpsertShippingAllocationDraftAtomic_({ header: pl.header, lines: pl.lines, enforce_k2_grouping: true }));
    var dd = (resp && resp.data) ? resp.data : {};
    var outcome = resp && resp.success ? (resp.reused ? 'REUSED' : (dd.outcome || 'CREATED')) : ((dd && dd.reason) ? dd.reason : (resp && /COMMITTED_UNVERIFIED/.test(resp.error || '') ? 'COMMITTED_UNVERIFIED' : (resp && /RECONCILIATION_REQUIRED/.test(resp.error || '') ? 'RECONCILIATION_REQUIRED' : 'BLOCKED')));
    if (resp && resp.success) anyOk = true; else anyFail = true;
    groupsWritten.push({ marketplace: pl.marketplace, groupNo: pl.groupNo, outcome: outcome, allocation_draft_id: dd.allocation_draft_id || null, draft_version: dd.draft_version || null, line_count: dd.line_count || 0, ok: !!(resp && resp.success), identity_key: pl.identity_key, error: (resp && !resp.success) ? resp.error : null });
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
  // ADDENDUM §B — a SUPPRESSED group is neither a success nor a failure of this run: the operator already
  // decided that identity, so it contributes no write and must not turn a clean run into PARTIAL. A run whose
  // every group was suppressed still succeeded - it correctly wrote nothing.
  var writtenGroups = groupsWritten.filter(function (g) { return !g.suppressed; });
  var jobStatus = writtenGroups.length === 0
    ? (blockedTotal.length ? 'ALL_BLOCKED' : (groupsWritten.length ? 'ALL_SUPPRESSED_BY_MANUAL' : 'NO_DEMAND'))
    : (anyFail ? (anyOk ? 'PARTIAL' : 'FAILED') : 'COMPLETED');

  // F1-7N-FB-4C §E — A ZERO-RESULT RUN IS A SUCCESSFUL RUN. Computing no recommendations is a real answer about
  // the world ("nothing needs shipping this cycle"), not a failure, and it must still replace the previous
  // proposal — otherwise last week's plan silently stays active and looks like this week's advice. It writes NO
  // empty header and NO empty line. ALL_BLOCKED is NOT this case: something went wrong there, so nothing expires.
  var zeroResult = (jobStatus === 'NO_DEMAND');
  // ALL_SUPPRESSED_BY_MANUAL is a SUCCESSFUL run with nothing to write: every identity it would have proposed is
  // already held by a binding operator decision. It still supersedes older AI drafts of the same scope, because
  // "the operator has this covered" is as real an answer about the world as a fresh recommendation.
  var allSuppressed = (jobStatus === 'ALL_SUPPRESSED_BY_MANUAL');
  var runSucceeded = zeroResult || allSuppressed || (anyOk && !anyFail);

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

  var activeCount = writtenGroups.filter(function (g) { return g.ok; }).length;
  return jsonResponse_({
    success: runSucceeded,
    data: {
      mode: 'K2_ROUTE_GROUP', job_status: jobStatus, planningCycle: request.planningCycle, businessScope: scope0,
      // §G — the projection the frontend needs to refresh honestly.
      generation_run_id: generationRunId, execution_key: executionKey,
      scope: { company: scope0.company, country: scope0.country, marketplace: requestedMkt || null, planning_cycle: request.planningCycle },
      created_headers: writtenGroups.filter(function (g) { return g.ok && g.outcome === 'CREATED'; }).length,
      updated_headers: writtenGroups.filter(function (g) { return g.ok && (g.outcome === 'UPDATED' || g.outcome === 'REGENERATED' || g.outcome === 'REUSED'); }).length,
      created_lines: writtenGroups.filter(function (g) { return g.ok && g.outcome === 'CREATED'; }).reduce(function (a, g) { return a + (g.line_count || 0); }, 0),
      updated_lines: writtenGroups.filter(function (g) { return g.ok && g.outcome !== 'CREATED'; }).reduce(function (a, g) { return a + (g.line_count || 0); }, 0),
      expired_headers: lifecycle.expired_headers, expired_lines: lifecycle.expired_lines,
      active_count: activeCount, expired_count: lifecycle.expired_headers, zero_result: zeroResult,
      // ADDENDUM §B/§G — precedence is REPORTED, not implied. A caller must be able to tell "the AI had nothing
      // to say" from "the AI had something to say and the operator's decision outranked it", and to see the
      // recommendation that was withheld next to the quantity that was kept.
      all_suppressed_by_manual: allSuppressed,
      suppressed_count: suppressed.length,
      suppressed_by_active_manual_draft: suppressed,
      identity_collision_count: collisions.length,
      active_source_identity_collisions: collisions,
      schema_gate: { ready: true, migration_version: (typeof AIPL_MIGRATION_VERSION_ !== 'undefined') ? AIPL_MIGRATION_VERSION_ : null },
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
function weeklyAiPlanHarvest_(ss, scope, expectedBySite) {
  var errors = [];
  // §E — the planning date this run belongs to, resolved from the SERVER's frozen planning config exactly
  // as 43_ resolves it when it materializes. Never a browser clock, never "now".
  var _cc = (typeof gapCalcResolveContext_ === 'function') ? gapCalcResolveContext_('INVENTORY') : null;
  var calcDateForDemand = (_cc && _cc.ok) ? _cc.calculationDate : null;
  // Pools + warehouses (headless readers, exact shapes per audit).
  var poolFacts = (typeof gapOpReadSupplyPoolFacts_ === 'function') ? gapOpReadSupplyPoolFacts_(ss) : null;
  if (!poolFacts) return { ok: false, errors: [weeklyAiPlanErr_('SUPPLY_POOL_FACTS_UNAVAILABLE', 'gapOpReadSupplyPoolFacts_ unavailable')] };
  var upcBySku = (typeof recGenUpcBySku_ === 'function') ? recGenUpcBySku_(ss) : {};
  var warehousesById = weeklyAiPlanWarehousesById_(ss);

  // Enumerate the eligible (marketplace, sku, destination) universe + per-site horizons via the recommendation
  // workspace (per marketplace). Each WAREHOUSE line carries sku, siteSku, warehouseId, horizons[].
  // F1-7N-FC-1B-E3-R4 §E — the canonical demand snapshot, read ONCE for the whole universe. A read or
  // schema failure here is FATAL: without it there is no authority for any quantity, and recomputing one is
  // exactly the divergence this closes.
  var canonical = weeklyAiPlanCanonicalDemand_(ss, scope, calcDateForDemand);
  if (!canonical.ok) {
    // §3 — the freshness verdict is carried out verbatim. "Not due yet" and "overdue" and "mid-write" are
    // three different operational situations and they must not arrive as one generic unavailability.
    return { ok: false, errors: [weeklyAiPlanErr_('CANONICAL_DEMAND_UNAVAILABLE',
      'the materialized demand snapshot could not be used: ' + canonical.reason,
      { table: WAP_GAP_TABLE_, reason: canonical.reason,
        freshness: canonical.freshness || null, schedule: canonical.schedule || null,
        distinct_dates: canonical.distinctDates || [] })] };
  }
  var sites = weeklyAiPlanEnumerateSites_(ss, scope, upcBySku, errors, canonical, expectedBySite); // [{ marketplace, sku, siteSku, destinationWarehouseId, cumulativeGapByWindow, requiredByByWindow, fulfillmentModel, allocationPriority, unitsPerCarton, sourceDataAsOf }]
  // F1-7N-FC-1B-E3-R1 §D — `errors` IS CARRIED OUT. Every non-fatal drop this function makes lands in
  // that array (WORKSPACE_NOT_OK / WORKSPACE_THREW per marketplace, FORECAST_SHARE_INCOMPLETE per site) and both
  // SUCCESS returns used to discard it. When every site was dropped, the consequence was exact and total: zero
  // receivers → KMAF ready:false with issues:[] → mapper ready:false with issues:[] → a bare
  // HARVEST_NOT_READY. The reason was known at THIS line and thrown away three lines later.
  if (!sites.length) return { ok: true, errors: errors, site_count: 0, kmaf: { ready: true, receiverFacts: [], planningFacts: [] }, horizonsByDemandRef: {}, poolsBySku: weeklyAiPlanPoolsBySku_(poolFacts, scope), warehousesById: warehousesById, sourceDataAsOf: weeklyAiPlanSourceAsOf_(sites) };

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
  built.horizonRows.forEach(function (r) { horizonsByDemandRef[r.demandRef] = { cumulativeGapByWindow: r.cumulativeGapByWindow,
    requiredByByWindow: r.requiredByByWindow, demandLineage: r.demandLineage || null, liveGapByWindow: r.liveGapByWindow || null }; });

  return {
    ok: true, kmaf: kmaf, horizonsByDemandRef: horizonsByDemandRef,
    poolsBySku: weeklyAiPlanPoolsBySku_(poolFacts, scope), warehousesById: warehousesById,
    sourceDataAsOf: built.sourceDataAsOf,
    // §D — the diagnostics this function collected. `errors` is the per-site drop list the mapper turns
    // into typed readiness issues; the counts are what make "every site was dropped" readable as one number.
    errors: errors, site_count: sites.length, receiver_count: (built.receivers || []).length,
    // §G — the receivers themselves, so the no-demand verdict can read each basis rather than infer one
    // from an error code. Diagnostic only: nothing downstream allocates from this field.
    builtReceivers: built.receivers || [],
    // §1 — the normalization audit, so a report can state how many months were real, how many were an
    // explicit zero, and how many were defaulted — without re-deriving any of it.
    forecast_normalization: built.forecastNormalization || null,
    // §3 — which run was adopted and why, so the report never has to infer it.
    snapshot_freshness: canonical.freshness || null,
    accepted_snapshot_date: canonical.acceptedDate || null,
    gap_schedule: canonical.schedule || null,
    gap_job_state: canonical.jobState || null,
    snapshot_distinct_dates: canonical.distinctDates || []
  };
}

/**
 * §E.2 — normalize the caller's declared expectation into { 'company|country|marketplace|sku': {WINDOW: qty} }.
 * The DOM is not a source of truth and this does not make it one: these values are only ever COMPARED against
 * the canonical row, never substituted for it, and a disagreement refuses rather than choosing.
 */
function weeklyAiPlanExpectedDemand_(body, company, country) {
  var list = (body && Array.isArray(body.expectedDemand)) ? body.expectedDemand : null;
  if (!list || !list.length) return null;
  var out = {};
  for (var i = 0; i < list.length; i++) {
    var e = list[i] || {};
    var mk = weeklyAiPlanStr_(e.marketplace), sku = weeklyAiPlanStr_(e.sku);
    if (!mk || !sku) continue;
    var key = company + '|' + country + '|' + mk + '|' + sku;
    var byWin = {};
    var src = (e.suggestedByWindow && typeof e.suggestedByWindow === 'object') ? e.suggestedByWindow : {};
    for (var w in src) { if (Object.prototype.hasOwnProperty.call(src, w)) byWin[w] = src[w]; }
    out[key] = byWin;
  }
  return out;
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
 * F1-7N-FC-1B-E3-R4 §G — IS THIS A GROUP WITH NOTHING TO REPLENISH, OR A GROUP WE FAILED TO READ?
 *
 * KMAF is a frozen contract and it is RIGHT: when a group's total demand basis is zero there is no
 * proportional share, and it refuses to invent one (DEMAND_WEIGHT_UNRESOLVED). What was wrong was the
 * CONSEQUENCE. "Every site here needs nothing this week" was reaching the operator as a red failure
 * indistinguishable from a broken read, and the honest answer to it is zero routes.
 *
 * So the decision is made HERE, by the consumer, on the DATA — never on the error code alone, because a
 * no-demand success that can swallow a real allocator error is worse than the refusal it replaces. Every one
 * of these must hold:
 *
 *   1. There is a universe to speak about (receivers were built). An empty universe already has its own
 *      answer further up and is not this case.
 *   2. The harvest dropped NOTHING. A site we could not read is not a site that needs nothing, and
 *      `errors` is exactly the list of sites the harvest declined to carry.
 *   3. EVERY blocking issue is DEMAND_WEIGHT_UNRESOLVED. One other issue and this is a different problem.
 *   4. EVERY receiver's demand basis is a RESOLVED, finite, non-negative number. An unresolved basis is
 *      unknown, and unknown is not zero — the same rule KMFCN applies to a forecast month.
 *   5. Their total is exactly zero.
 *   6. And the CANONICAL demand agrees: no horizon anywhere in the group carries a positive gap. This is
 *      the one that matters most. The basis is the SHARE WEIGHT, not the quantity; a group whose forecast
 *      weight is zero but whose materialized Suggested Qty is positive has real demand and an unresolvable
 *      share, which is precisely the error §G says must stay an error.
 *
 * Returns { noDemand: bool, reason, receiverCount, basisTotal, gapTotal, positiveGapRefs[] }.
 */
function weeklyAiPlanNoDemandVerdict_(h, mapped) {
  var out = { noDemand: false, reason: null, receiverCount: 0, basisTotal: 0, gapTotal: 0, positiveGapRefs: [] };
  var kmaf = (h && h.kmaf) || {};
  var receivers = Array.isArray(h && h.builtReceivers) ? h.builtReceivers : [];
  out.receiverCount = receivers.length;
  if (!receivers.length) { out.reason = 'NO_RECEIVERS_BUILT'; return out; }
  if (Array.isArray(h.errors) && h.errors.length) { out.reason = 'HARVEST_DROPPED_SITES'; return out; }

  // (3) every blocking issue is the zero-total one, from BOTH layers.
  var issues = (Array.isArray(kmaf.issues) ? kmaf.issues : [])
    .concat(Array.isArray(mapped && mapped.issues) ? mapped.issues : []);
  var blocking = issues.filter(function (i) { return i && i.blocking !== false; });
  if (!blocking.length) { out.reason = 'NOT_A_DEMAND_WEIGHT_REFUSAL'; return out; }
  // READ THE ENGINE CODE, NOT THE MAPPED ONE. KMWHA maps DEMAND_WEIGHT_UNRESOLVED to the readiness code
  // SUGGESTED_QTY_UNRESOLVED — and so does DAILY_DEMAND_UNRESOLVED, WEIGHT_BASIS_UNRESOLVED,
  // MISSING_FORECAST_WEIGHT_SOURCE and FORECAST_BASIS_UNRESOLVED. Matching on the mapped code would accept
  // five different faults as "this group needs nothing", which is precisely the swallow §G forbids. The
  // mapper preserves `engine_code`; an issue that carries neither an engine code nor a recognizable engine
  // code of its own is not understood, and what is not understood does not become a success.
  for (var i = 0; i < blocking.length; i++) {
    var eng = weeklyAiPlanStr_(blocking[i].engine_code) || weeklyAiPlanStr_(blocking[i].code);
    if (eng !== 'DEMAND_WEIGHT_UNRESOLVED') { out.reason = 'OTHER_BLOCKING_ISSUE:' + (eng || 'UNNAMED'); return out; }
  }

  // (4)+(5) every basis resolved, finite, non-negative, and summing to exactly zero.
  for (var r = 0; r < receivers.length; r++) {
    var fb = receivers[r] && receivers[r].forecastBasis;
    var b = fb ? fb.forecastShareQty : undefined;
    if (typeof b !== 'number' || !isFinite(b) || b < 0) { out.reason = 'BASIS_UNRESOLVED'; return out; }
    out.basisTotal += b;
  }
  if (out.basisTotal !== 0) { out.reason = 'BASIS_TOTAL_NONZERO'; return out; }

  // (6) the CANONICAL demand must agree. A positive gap anywhere means this group is not empty.
  var horizons = (h && h.horizonsByDemandRef) || {};
  for (var ref in horizons) {
    if (!Object.prototype.hasOwnProperty.call(horizons, ref)) continue;
    var byWin = (horizons[ref] && horizons[ref].cumulativeGapByWindow) || {};
    for (var w in byWin) {
      if (!Object.prototype.hasOwnProperty.call(byWin, w)) continue;
      var q = Number(byWin[w]);
      if (!isFinite(q)) { out.reason = 'CANONICAL_DEMAND_UNRESOLVED'; return out; }
      if (q > 0) { out.gapTotal += q; if (out.positiveGapRefs.indexOf(ref) === -1) out.positiveGapRefs.push(ref); }
    }
  }
  if (out.positiveGapRefs.length) { out.reason = 'POSITIVE_CANONICAL_DEMAND_WITH_UNRESOLVED_WEIGHT'; return out; }

  out.noDemand = true;
  out.reason = 'NO_REPLENISHMENT_REQUIRED';
  return out;
}

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
/**
 * F1-7N-FC-1B-E3-R4 §E — THE EXECUTION DEMAND SNAPSHOT, AND WHY IT HAD TO CHANGE.
 *
 * The screen's Suggested Qty is a MATERIALIZED row: 43_ writes inventory_replenishment_gap and the page reads
 * d90_suggested_qty out of it. The AI Plan was reading something else. It calls the recommendation workspace
 * (42_), and 42_ is NOT a read facade over that table — it RECOMPUTES, live, through the frozen KMHP horizon
 * owner. Same engine, two evaluations at two different moments, and nothing compared them.
 *
 * For one round that difference was invisible because both sides agreed. It is not a property of the system
 * that they will: the snapshot is by definition older than the live recomputation, and any input that moved in
 * between — a shipment received, a forecast edited, a snapshot re-imported — separates them. The operator
 * approves 520 on the screen and the plan allocates whatever the engine says at generation time.
 *
 * So the authority is now stated instead of assumed. THE MATERIALIZED ROW IS THE DEMAND. The live workspace
 * still supplies STRUCTURE — which destinations exist, which windows a site has, what date each window is
 * required by — because none of that is a quantity. Every QUANTITY comes from the snapshot.
 *
 * This is a read gate of the same shape KMFCN uses for the forecast, and for the same reason: a zero is only
 * honest when the system looked. A missing table, a missing header, an absent row, a BLOCKED calculation or a
 * snapshot computed for a different planning date are all UNKNOWN, and unknown never becomes a quantity.
 *
 * Returns { ok, reason, bySite: { 'company|country|marketplace|sku': {...} }, rowCount, lineage }.
 */
var WAP_GAP_TABLE_ = 'inventory_replenishment_gap';
var WAP_GAP_REQUIRED_COLS_ = ['company', 'country', 'marketplace', 'sku', 'calculation_status', 'calculation_date',
  'd18_suggested_qty', 'd30_suggested_qty', 'd45_suggested_qty', 'd90_suggested_qty'];
var WAP_GAP_WINDOW_COL_ = { D18: 'd18_suggested_qty', D30: 'd30_suggested_qty', D45: 'd45_suggested_qty', D90: 'd90_suggested_qty' };

/**
 * F1-7N-FC-1B-E3-R4-A2-R1 §3 — READ THE SCHEDULE THIS DEPLOYMENT ACTUALLY RUNS ON.
 *
 * Not a constant. 45_ owns the automation configuration and a deployment can change its own hours, so the
 * freshness rule reads the EFFECTIVE config for the Inventory Gap job and falls back to the declared default
 * only when the stored config cannot be read. Hard-coding 13:30 here would make the rule silently wrong for
 * any deployment that moved it, which is the same class of mistake as hard-coding today's date.
 */
function weeklyAiPlanGapSchedule_() {
  var out = { hour: 13, minute: 30, enabled: true, source: 'DECLARED_DEFAULT',
    driftMinutes: 15, completionBudgetMinutes: 240 };
  try {
    if (typeof AUTOMATION_JOBS_ !== 'undefined' && AUTOMATION_JOBS_) {
      for (var i = 0; i < AUTOMATION_JOBS_.length; i++) {
        if (AUTOMATION_JOBS_[i].key === 'inventoryGap' && AUTOMATION_JOBS_[i].defaults) {
          out.hour = AUTOMATION_JOBS_[i].defaults.hour;
          out.minute = AUTOMATION_JOBS_[i].defaults.minute;
          out.enabled = AUTOMATION_JOBS_[i].defaults.enabled === true;
        }
      }
    }
    // The STORED config wins over the declared default when it exists.
    if (typeof automationReadConfig_ === 'function' && typeof automationDefaultIo_ === 'function') {
      var cfg = automationReadConfig_(automationDefaultIo_());
      var c = cfg && cfg.inventoryGap;
      if (c && typeof c.hour === 'number' && typeof c.minute === 'number') {
        out.hour = c.hour; out.minute = c.minute; out.enabled = c.enabled === true;
        out.source = 'EFFECTIVE_CONFIG';
      }
    }
  } catch (e) { out.source = 'DECLARED_DEFAULT_AFTER_ERROR'; }
  return out;
}

/**
 * §3 — the Inventory Gap job's own account of itself, when it can be read. CORROBORATION ONLY: a job
 * reporting FAILED is evidence, and a job reporting nothing is not evidence of success.
 */
function weeklyAiPlanGapJobState_() {
  try {
    if (typeof GAP_JOB_PROP_KEYS_ === 'undefined') return null;
    var raw = PropertiesService.getScriptProperties().getProperty(GAP_JOB_PROP_KEYS_.INVENTORY);
    if (!raw) return null;
    var st = JSON.parse(raw);
    if (!st) return null;
    // §3 — THE STORED STAMP IS ALREADY A TAIPEI WALL-CLOCK STRING, so it is READ, not re-interpreted.
    //
    // My first version did `new Date(st.startedAt).getTime()`, which is wrong twice over. It constructs a Date
    // from a string whose zone is implicit, so the runtime would resolve "2026-09-04 09:00:00" against the
    // SERVER's zone rather than Asia/Taipei and could land on the wrong business day — the exact class of
    // mistake this feature has been correcting all round. And it constructs a date object inside 61_, which the
    // E3-R1 no-fabricated-timestamp guard forbids for good reason.
    //
    // The business DATE is all this needs, and the first ten characters of the stamp already are it.
    var startedDate = weeklyAiPlanStr_(st.startedAt).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedDate)) startedDate = null;
    return { status: weeklyAiPlanStr_(st.status), runId: weeklyAiPlanStr_(st.runId),
      startedAtDate: startedDate, startedAt: weeklyAiPlanStr_(st.startedAt) || null,
      scopesProcessed: st.scopesProcessed, scopesTotal: st.scopesTotal, product: 'INVENTORY' };
  } catch (e) { return null; }
}

function weeklyAiPlanCanonicalDemand_(ss, scope, calcDate) {
  var out = { ok: false, reason: null, bySite: {}, byKeyDate: {}, dateIndex: {}, distinctDates: [],
    rowCount: 0, calculationDate: calcDate || null, acceptedDate: null, freshness: null,
    freshnessState: null, schedule: null, jobState: null };
  var sh;
  try { sh = ss.getSheetByName(WAP_GAP_TABLE_); }
  catch (e) { out.reason = 'CANONICAL_DEMAND_READ_FAILED'; return out; }
  // A MISSING table and an EMPTY one mean opposite things, and gapReadObjects_ returns [] for both. Ask the
  // sheet directly, or a deployment fault becomes a plan for nothing.
  if (!sh) { out.reason = 'CANONICAL_DEMAND_TABLE_MISSING'; return out; }
  var headers;
  try { headers = (sh.getLastRow() > 0) ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return weeklyAiPlanStr_(h); }) : []; }
  catch (e2) { out.reason = 'CANONICAL_DEMAND_READ_FAILED'; return out; }
  for (var c = 0; c < WAP_GAP_REQUIRED_COLS_.length; c++) {
    if (headers.indexOf(WAP_GAP_REQUIRED_COLS_[c]) === -1) {
      out.reason = 'CANONICAL_DEMAND_HEADER_MISSING:' + WAP_GAP_REQUIRED_COLS_[c];
      return out;
    }
  }
  var rows = (typeof gapReadObjects_ === 'function') ? (gapReadObjects_(ss, WAP_GAP_TABLE_) || []) : [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (weeklyAiPlanStr_(r.company) !== scope.company || weeklyAiPlanStr_(r.country) !== scope.country) continue;
    var key = weeklyAiPlanStr_(r.company) + '|' + weeklyAiPlanStr_(r.country) + '|'
      + weeklyAiPlanStr_(r.marketplace) + '|' + weeklyAiPlanStr_(r.sku);
    var rec = {
      company: weeklyAiPlanStr_(r.company), country: weeklyAiPlanStr_(r.country),
      marketplace: weeklyAiPlanStr_(r.marketplace), sku: weeklyAiPlanStr_(r.sku),
      calculation_status: weeklyAiPlanStr_(r.calculation_status),
      calculation_date: weeklyAiPlanStr_(r.calculation_date),
      calculated_at: weeklyAiPlanStr_(r.calculated_at), updated_at: weeklyAiPlanStr_(r.updated_at),
      note: weeklyAiPlanStr_(r.note), source_table: WAP_GAP_TABLE_, suggestedByWindow: {}, duplicate: false
    };
    for (var w in WAP_GAP_WINDOW_COL_) {
      if (!Object.prototype.hasOwnProperty.call(WAP_GAP_WINDOW_COL_, w)) continue;
      var raw = r[WAP_GAP_WINDOW_COL_[w]];
      var v = (raw === '' || raw === null || raw === undefined) ? null : Number(raw);
      rec.suggestedByWindow[w] = (v !== null && isFinite(v)) ? v : null;
    }
    // §3 — every row is kept, KEYED BY (site, calculation_date). R4 collapsed the table to one row per
    // site and then compared that row's date to today, which is how a complete 2026-09-03 snapshot came to be
    // reported as STALE at 10:41 on 2026-09-04 — three hours before today's run is even due. The dates are
    // now collected first and the SCHEDULE decides which one is current.
    var dk = key + '@' + rec.calculation_date;
    if (out.byKeyDate[dk]) { out.byKeyDate[dk].duplicate = true; continue; }
    out.byKeyDate[dk] = rec;
    if (!out.dateIndex[rec.calculation_date]) {
      out.dateIndex[rec.calculation_date] = { date: rec.calculation_date, status: rec.calculation_status,
        rowCount: 0, planningCycle: 'RECO-' + rec.calculation_date.slice(0, 7) };
    }
    out.dateIndex[rec.calculation_date].rowCount++;
    // ONE BLOCKED SITE DOES NOT POISON THE RUN. My first version carried the WORST status seen forward, which
    // meant a single BLOCKED SKU made the whole date "not a complete snapshot" and refused every other site on
    // it — the opposite of what the comment beside it claimed, and a much broader block than intended. A run
    // that produced usable rows IS a run; the per-site gate below is what refuses the blocked site, by itself.
    // A date is only NO_COMPLETE_SNAPSHOT when NOTHING on it is READY.
    if (rec.calculation_status === 'READY') out.dateIndex[rec.calculation_date].status = 'READY';
    else if (out.dateIndex[rec.calculation_date].status !== 'READY') {
      out.dateIndex[rec.calculation_date].status = rec.calculation_status;
    }
    out.rowCount++;
  }

  // ---- §3 THE FRESHNESS DECISION, and it is about the SCHEDULE, not the calendar --------------------------
  var dates = [];
  for (var dkey in out.dateIndex) { if (Object.prototype.hasOwnProperty.call(out.dateIndex, dkey)) dates.push(out.dateIndex[dkey]); }
  out.distinctDates = dates.map(function (d) { return d.date; }).sort();
  if (typeof KMSNF === 'undefined' || !KMSNF || typeof KMSNF.assess !== 'function') {
    out.reason = 'SNAPSHOT_FRESHNESS_AUTHORITY_UNAVAILABLE';
    return out;
  }
  // Only the LATEST date is offered to the authority. Older complete runs are history, not candidates, and
  // offering two would make "mixed rows" indistinguishable from "we kept last week's as well".
  var latest = out.distinctDates.length ? out.distinctDates[out.distinctDates.length - 1] : null;
  // But a scope carrying rows from MORE THAN ONE date is exactly the partial-write case, and the authority has
  // to see both to say so. 43_ upserts row by row with no atomic publication, so this is the only observable
  // form a half-finished run takes.
  var offered = dates.filter(function (d) { return d.date === latest || out.distinctDates.length > 1; });
  out.schedule = weeklyAiPlanGapSchedule_();
  out.jobState = weeklyAiPlanGapJobState_();
  // §3 — THE CLOCK HAS EXACTLY ONE OWNER, and if it is absent this refuses rather than inventing one.
  //
  // My first version fell back to constructing a clock here. That is precisely the fabrication the E3-R1
  // no-fabricated-timestamp guard exists to prevent, and it would have been worse than a refusal: a
  // deployment missing the canonical planning-context owner would have silently planned against a clock
  // nobody governs, in whatever zone the runtime happened to be in.
  if (typeof gapCalcNowMs_ !== 'function') {
    out.reason = 'PLANNING_CLOCK_AUTHORITY_UNAVAILABLE';
    return out;
  }
  var fresh = KMSNF.assess({
    nowMs: gapCalcNowMs_(),
    utcOffsetMinutes: (typeof GAP_CALC_UTC_OFFSET_MIN_ !== 'undefined') ? GAP_CALC_UTC_OFFSET_MIN_ : 480,
    schedule: out.schedule,
    snapshotDates: offered,
    expectedPlanningCycle: scope.planningCycle,
    jobState: out.jobState
  });
  out.freshness = fresh;
  out.freshnessState = fresh.state;
  if (!fresh.ok) { out.reason = fresh.state; return out; }
  out.acceptedDate = fresh.acceptedDate;
  // The accepted date, and ONLY it, becomes the site map. Nothing from another run can reach the allocator.
  for (var k2 in out.byKeyDate) {
    if (!Object.prototype.hasOwnProperty.call(out.byKeyDate, k2)) continue;
    var r2 = out.byKeyDate[k2];
    if (r2.calculation_date !== out.acceptedDate) continue;
    var sk = r2.company + '|' + r2.country + '|' + r2.marketplace + '|' + r2.sku;
    if (out.bySite[sk] && out.bySite[sk] !== r2) { out.bySite[sk].duplicate = true; continue; }
    out.bySite[sk] = r2;
  }
  out.ok = true;
  return out;
}

/**
 * §E — accept or refuse ONE site's canonical demand. Typed, and never silently picks a side.
 * Returns { ok, code, lineage, suggestedByWindow } .
 */
function weeklyAiPlanAcceptCanonicalDemand_(snapshot, site, scope, calcDate, expectedBySite) {
  // §4 — the run the SCHEDULE selected, not the calendar date this process happens to be running on.
  var acceptedDate = (snapshot && snapshot.acceptedDate) || null;
  var key = scope.company + '|' + scope.country + '|' + site.marketplace + '|' + site.sku;
  var rec = snapshot.bySite[key];
  if (!rec) return { ok: false, code: 'CANONICAL_DEMAND_ROW_MISSING', key: key };
  if (rec.duplicate) return { ok: false, code: 'CANONICAL_DEMAND_DUPLICATE_ROWS', key: key };
  if (rec.calculation_status !== 'READY') {
    return { ok: false, code: 'CANONICAL_DEMAND_NOT_READY', key: key,
      status: rec.calculation_status || '(blank)', note: rec.note || null };
  }
  // F1-7N-FC-1B-E3-R4-A2-R1 §4 — THE DATE COMPARISON IS GONE, AND IT WAS THE DEFECT.
  //
  // R4 compared this row's calculation_date to TODAY and called any difference STALE. The Inventory Gap
  // materialization is a daily 13:30 Asia/Taipei automation, so that rule declared every scope in the database
  // stale from midnight until the afternoon — and at 10:41 on 2026-09-04 it refused a complete, successful
  // 2026-09-03 snapshot, which was the newest thing that had ever existed.
  //
  // Which date is CURRENT is now decided once, for the whole scope, by KMSNF against the real schedule, and the
  // caller has already narrowed `bySite` to the accepted run. What remains here is the check that the row
  // actually belongs to that run — a genuine lineage assertion rather than a comparison with a wall clock.
  if (acceptedDate && rec.calculation_date && rec.calculation_date !== acceptedDate) {
    return { ok: false, code: 'CANONICAL_DEMAND_LINEAGE_MISMATCH', key: key,
      snapshotDate: rec.calculation_date, acceptedDate: acceptedDate };
  }
  if (!rec.calculation_date) return { ok: false, code: 'CANONICAL_DEMAND_LINEAGE_MISSING', key: key };
  // Every window this site actually has must carry a resolved quantity.
  var out = {};
  for (var w in site.cumulativeGapByWindow) {
    if (!Object.prototype.hasOwnProperty.call(site.cumulativeGapByWindow, w)) continue;
    var v = rec.suggestedByWindow[w];
    if (v === null || v === undefined) return { ok: false, code: 'CANONICAL_DEMAND_WINDOW_UNRESOLVED', key: key, window: w };
    if (v < 0) return { ok: false, code: 'CANONICAL_DEMAND_INVALID', key: key, window: w, value: v };
    out[w] = v;
  }
  // §E.8 — the CLIENT's expectation, when it sent one. A mismatch is a CONFLICT and neither side wins:
  // the screen the operator approved and the row the server holds disagree, and allocating either one would
  // be allocating a number nobody has seen together.
  if (expectedBySite && Object.prototype.hasOwnProperty.call(expectedBySite, key)) {
    var exp = expectedBySite[key];
    for (var w2 in exp) {
      if (!Object.prototype.hasOwnProperty.call(exp, w2)) continue;
      var e = Number(exp[w2]);
      if (!isFinite(e)) return { ok: false, code: 'EXPECTED_DEMAND_INVALID', key: key, window: w2 };
      if (out[w2] !== undefined && out[w2] !== e) {
        return { ok: false, code: 'EXPECTED_DEMAND_CONFLICT', key: key, window: w2, expected: e, canonical: out[w2] };
      }
    }
  }
  return { ok: true, suggestedByWindow: out, lineage: {
    company: rec.company, country: rec.country, marketplace: rec.marketplace, sku: rec.sku,
    planning_cycle: scope.planningCycle, calculation_status: rec.calculation_status,
    calculation_date: rec.calculation_date, calculated_at: rec.calculated_at || null,
    updated_at: rec.updated_at || null, source_table: rec.source_table, source_reason: 'MATERIALIZED_SNAPSHOT',
    // §3 — WHY this run was the current one, carried with the quantity. "Accepted a snapshot dated
    // yesterday" is only defensible if the reason travels with it.
    freshness_state: (snapshot && snapshot.freshnessState) || null,
    accepted_snapshot_date: acceptedDate,
    schedule_source: (snapshot && snapshot.schedule && snapshot.schedule.source) || null,
    gap_run_id: (snapshot && snapshot.jobState && snapshot.jobState.runId) || null } };
}

function weeklyAiPlanEnumerateSites_(ss, scope, upcBySku, errors, canonical, expectedBySite) {
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
        // STRUCTURE from the live workspace: which windows this site has, and when each is required by.
        // Those are not quantities and the snapshot does not carry them.
        line.horizons.forEach(function (h) { var wc = weeklyAiPlanStr_(h.windowCode); if (wc) { cum[wc] = h.gapQty; reqBy[wc] = h.requiredByDate; } });
        var _site = {
          marketplace: marketplace, sku: weeklyAiPlanStr_(line.sku), siteSku: weeklyAiPlanStr_(line.siteSku),
          destinationWarehouseId: dest, destinationType: d.destinationType, cumulativeGapByWindow: cum, requiredByByWindow: reqBy,
          fulfillmentModel: weeklyAiPlanStr_(line.fulfillmentModel), allocationPriority: prByMkt[marketplace],
          unitsPerCarton: (upcBySku || {})[weeklyAiPlanStr_(line.sku)], sourceDataAsOf: line.sourceDataAsOf || null
        };
        // §E — QUANTITY from the materialized snapshot, or this site does not enter the plan. The live
        // number is kept beside it as `liveGapByWindow` for diagnosis; nothing allocates from it.
        if (canonical) {
          var _acc = weeklyAiPlanAcceptCanonicalDemand_(canonical, _site, scope, canonical.calculationDate, expectedBySite);
          if (!_acc.ok) {
            errors.push(weeklyAiPlanErr_(_acc.code, 'canonical demand snapshot refused for ' + _acc.key,
              { marketplace: marketplace, sku: _site.sku, detail: _acc }));
            continue;
          }
          _site.liveGapByWindow = cum;
          _site.cumulativeGapByWindow = _acc.suggestedByWindow;
          _site.demandLineage = _acc.lineage;
        }
        sites.push(_site);
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
/**
 * F1-7N-FC-1B-E3-R3-R1 §1/§3 — THE READ CONTEXT FOR THE FORECAST TABLE.
 *
 * KMFCN is allowed to read an absent month as zero ONLY when the system demonstrably looked and found nothing.
 * `gapReadObjects_` cannot supply that: it returns [] for a sheet that is MISSING and for one that is merely
 * EMPTY, and those two mean opposite things. A missing table read as "every month is zero" would turn a
 * deployment fault into a silent plan for nothing, which is the exact failure the zero-default must not create.
 * So the tab and its header row are inspected directly (read-only) and the result is passed as context.
 */
function weeklyAiPlanForecastReadContext_(ss) {
  try {
    var sh = ss.getSheetByName('fc_regular_forecast');
    if (!sh) return { readSucceeded: true, tableMissing: true, schemaValid: false, headers: [] };
    if (sh.getLastColumn() < 1) return { readSucceeded: true, tableMissing: false, schemaValid: false, headers: [] };
    var hdr = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
      .map(function (h) { return weeklyAiPlanStr_(h).toLowerCase(); });
    return { readSucceeded: true, tableMissing: false, schemaValid: true, headers: hdr };
  } catch (e) {
    // A THROW IS NOT AN EMPTY TABLE. The outcome is unknown, and unknown never becomes zero.
    return { readSucceeded: false, readOutcomeUnknown: true, transportFailed: true, headers: [] };
  }
}

function weeklyAiPlanBuildKmafReceivers_(ss, scope, sites, upcBySku, errors) {
  var calcMonth = weeklyAiPlanStr_(scope.planningCycle).slice(5);
  var months = (typeof KMPCX !== 'undefined' && KMPCX && typeof KMPCX._forecastWeightMonths === 'function') ? KMPCX._forecastWeightMonths(calcMonth) : null;
  if (!months || months.length < 2) { errors.push(weeklyAiPlanErr_('FORECAST_MONTHS_UNRESOLVED', 'KMPCX._forecastWeightMonths unavailable')); return { fatal: true }; }
  var fcRows = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'fc_regular_forecast') : [];
  var warehouses = (typeof gapReadObjects_ === 'function') ? gapReadObjects_(ss, 'warehouses') : [];

  var receivers = [], horizonRows = [], sourceDataAsOf = null;
  // F1-7N-FC-1B-E3-R3-R1 §1/§3 — ONE READING OF AN ABSENT FORECAST MONTH, AND IT IS ZERO.
  //
  // WHAT THIS REPLACES, AND WHY IT WAS WRONG. The §7 basis used to require all four months to be PRESENT and
  // dropped the whole site otherwise (`FORECAST_SHARE_INCOMPLETE`). At a year boundary that is every site: the
  // window for RECO-2026-09 is 2026-10..2027-01 and nobody had created the 2027 base rows, so all 495 active
  // scopes were dropped, the receiver universe was empty, and the AI Plan answered HARVEST_NOT_READY.
  //
  // The same absence was ALREADY being read the opposite way by the same table's other consumer: the
  // recommendation workspace skips a month it cannot resolve and carries on, which is how Site Inventory
  // showed a materialized Suggested Qty of 520 for a SKU with no 2027 row. One fact, two readings, and the
  // Shipping side's was the one that stopped the work.
  //
  // KMFCN is now the only authority for that reading, shared with every other consumer, and it keeps the
  // distinction the old code could not make: `recoWsRegularForecastByMonth_` discards a CONFLICTING duplicate
  // exactly as it discards a missing row, so a genuine data conflict was indistinguishable from a year
  // boundary. KMFCN returns 0 for the three absences and REFUSES a conflict, an invalid value, a missing
  // table, a missing header, an incomplete scope and any unknown read outcome.
  var fcCtx = weeklyAiPlanForecastReadContext_(ss);
  var fcNorm = { explicit_zero: 0, default_zero_blank: 0, default_zero_missing_year: 0, actual: 0 };
  for (var i = 0; i < sites.length; i++) {
    var st = sites[i];
    var demandRef = [scope.company, scope.country, st.marketplace, st.sku, st.destinationWarehouseId].join('|');
    var fcScope = { company: scope.company, country: scope.country, marketplace: st.marketplace };
    var win = KMFCN.normalizeWindow({ context: fcCtx, scope: fcScope, sku: st.sku, months: months,
      matchingRows: KMFCN.rowsForScope(fcRows, fcScope, st.sku) });
    if (!win.ok) {
      // STILL A HARD BLOCK, and now it says WHICH of the eight refusals it is instead of one word that covered
      // a year boundary and a corrupt table alike.
      errors.push(weeklyAiPlanErr_('FORECAST_BASIS_UNRESOLVED', 'forecast month cannot be resolved: ' + win.reason,
        { demandRef: demandRef, reason: win.reason, months: (win.issues || []).map(function (x) { return x.month; }) }));
      continue;
    }
    fcNorm.actual += win.counters.actual_count;
    fcNorm.explicit_zero += win.counters.explicit_zero_count;
    fcNorm.default_zero_blank += win.counters.default_zero_blank_count;
    fcNorm.default_zero_missing_year += win.counters.default_zero_missing_year_count;
    var shareSum = win.basis;
    var b0 = win.values[months[0]], b1 = win.values[months[1]];
    receivers.push({
      receiverKey: demandRef, demandRef: demandRef, demandKey: demandRef, demandDriver: 'FORECAST_DRIVEN',
      company: scope.company, country: scope.country, marketplace: st.marketplace, sku: st.sku, masterSku: st.sku, siteSku: st.siteSku,
      fulfillmentModel: st.fulfillmentModel, allocationPriority: st.allocationPriority, unitsPerCarton: (upcBySku || {})[st.sku],
      windowCode: scope.planningCycle, destinationWarehouseId: st.destinationWarehouseId,
      forecastBasis: { forecastShareQty: shareSum, forecastMonth1: { month: months[0], baseForecast: b0 }, forecastMonth2: { month: months[1], baseForecast: b1 }, targetRules: {}, specialEventDemand: 0 }
    });
    // F1-7N-FC-1B-E3-R4 §E.10 — the lineage travels WITH the quantity. A route that can name the snapshot
    // row it came from can be reconciled later; one that cannot is a number with no provenance, which is
    // the state this round exists to end.
    horizonRows.push({ demandRef: demandRef, cumulativeGapByWindow: st.cumulativeGapByWindow,
      requiredByByWindow: st.requiredByByWindow, demandLineage: st.demandLineage || null,
      liveGapByWindow: st.liveGapByWindow || null });
    if (!sourceDataAsOf && st.sourceDataAsOf) sourceDataAsOf = st.sourceDataAsOf;
  }
  // §1 — EVERY DEFAULT-TO-ZERO IS COUNTED AND CARRIED OUT. A zero that nobody can account for is the
  // thing this contract exists to prevent, so the three provenances are reported separately from the actuals.
  return { fatal: false, receivers: receivers, kmafWarehouses: warehouses, horizonRows: horizonRows,
    calculationDate: calcMonth + '-01', sourceDataAsOf: sourceDataAsOf, forecastNormalization: fcNorm };
}
