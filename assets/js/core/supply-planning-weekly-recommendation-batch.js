// Kitchen Mama Operation System — WEEKLY AI PLAN (company,country) BATCH generation core (F1-7N-D-2a).
// -----------------------------------------------------------------------------
// The canonical Weekly AI Plan generation owner for the USER-frozen (company,country) BATCH scope grain. The overseas
// pool is shared across marketplaces (key company||country||sku) and §35A.7/WA-9 requires the §7 demandWeight to be
// normalized ONCE across the whole (company,country) site universe — so generation cannot be per-marketplace. This
// core rations each SKU's shared pool ONCE and fans the result out to per-marketplace K3 drafts:
//
//   for each masterSku in (company,country):
//     KMWIA.assembleWeeklySourceAllocationInput({businessScope:{company,country}, ...})   [all marketplaces' lanes]
//     → KMWSA.buildWeeklySourceAllocation(...)   [overseas pool rationed ONCE across all sites of the sku]
//   group ALL resulting lines by marketplace
//   for each marketplace M:
//     KMBRIDGE.bridgeRecommendationFactsToPlan(M-filtered facts)
//     → KMORCH.runRecommendationGeneration({businessScope:{company,country,marketplace:M,source_page}}, deps)
//         [K3 identity + LockService + natural-key upsert + user-edit protection + terminal conflict — all C1/ORCH]
//     → one shipping_allocation_drafts / _lines K3 draft per marketplace
//
// It RE-DERIVES NO business formula and adds NO second persistence engine: it reuses the frozen assembler (D0-B),
// builder (B), bridge, and orchestrator. PURE: injected `deps` (KMPR repository + KMPL LockService apply) own all
// writes; WEEKLY writes ONLY the shipping-allocation draft tables; no Request Order/PO/shipment, no reservation, no
// carrier/rate/lead-time/ETA/cost. The `demandWeight` per lane is HARVESTED upstream (D-2b .gs shell calls KMAF once
// across the full multi-site receiver set); this core consumes it verbatim. Fail-closed: bad scope / invalid factory
// identity → BLOCKED_INPUT, NO persist.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-weekly-input-assembler.js') : (root.KMWIA || (root.KM && root.KM.weeklyInputAssembler)),
    req ? req('./supply-planning-weekly-source-allocation.js') : (root.KMWSA || (root.KM && root.KM.weeklySourceAllocation)),
    req ? req('./supply-planning-plan-bridge.js') : (root.KMBRIDGE || (root.KM && root.KM.planBridge)),
    req ? req('./supply-planning-recommendation-orchestrator.js') : (root.KMORCH || (root.KM && root.KM.recommendationOrchestrator))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyRecommendationBatch = api; }
})(this, function (WIA, WSA, BRIDGE, ORCH) {
  'use strict';

  var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function aType(c, m) { if (!c) throw new TypeError('weeklyRecommendationBatch: ' + m); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function nonEmpty(v) { return str(v).length > 0; }
  function cmp(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }

  // generateWeeklyShippingRecommendationBatch(request, deps)
  //   request = {
  //     planningCycle, businessScope:{company,country,source_page}, mode?, confirmRegenerateOverUserEdits?,
  //     actor?, now?, sourceDataAsOf?, formulaVersion?,
  //     factoryIdentityConfig:{CN_YOUXIN,TW_SHENGYI}, warehousesById,
  //     skus:[ { masterSku, overseasSupplyPools[], factoryPools[], lanes[] } ]   // lanes carry marketplace + §7 demandWeight
  //   }
  //   deps = { loadActiveContext(query), loadPriorSnapshot?(draftId), lockedApply(plan, token, opts) }  // KMPR + KMPL
  // F1-7N-FA-3C-R6F2 — steps 1-3 EXTRACTED as a behavior-preserving pure helper so BOTH the frozen per-marketplace
  // K3 batch AND the new K2 route-group generation path reuse the SAME per-source line production (shared pool
  // rationed ONCE per sku). Returns { ok, status?, reason?, issues, lines, skuCount, unresolvedTotal, meta }.
  function buildWeeklySourceLines(request) {
    aType(isObj(request), 'request must be an object');
    var scope = isObj(request.businessScope) ? request.businessScope : {};
    var company = str(scope.company), country = str(scope.country), sourcePage = str(scope.source_page);
    var planningCycle = str(request.planningCycle);
    var mode = nonEmpty(request.mode) ? str(request.mode) : 'SCHEDULED_REFRESH';
    var formulaVersion = nonEmpty(request.formulaVersion) ? str(request.formulaVersion) : DEFAULT_FORMULA_VERSION;
    var sourceDataAsOf = request.sourceDataAsOf === undefined ? null : request.sourceDataAsOf;
    var meta = { company: company, country: country, sourcePage: sourcePage, planningCycle: planningCycle, mode: mode, formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf };

    // ---- 1. Scope validation (fail closed; NO persist) --------------------------------------------------------
    var missing = [];
    if (!nonEmpty(company)) missing.push('businessScope.company');
    if (!nonEmpty(country)) missing.push('businessScope.country');
    if (!nonEmpty(sourcePage)) missing.push('businessScope.source_page');
    if (!nonEmpty(planningCycle)) missing.push('planningCycle');
    if (!Array.isArray(request.skus) || request.skus.length === 0) missing.push('skus');
    if (missing.length) return { ok: false, status: 'BLOCKED_INPUT', reason: 'MISSING_SCOPE:' + missing.join(','), issues: [], lines: [], skuCount: 0, unresolvedTotal: 0, meta: meta };

    // ---- 2. Factory identity: validate ONCE (fail-closed HARD block for the whole batch) ----------------------
    var fv = WIA.validateFactoryConfig(request.factoryIdentityConfig, request.warehousesById);
    if (!fv.ok) return { ok: false, status: 'BLOCKED_INPUT', reason: fv.reason, issues: [{ kind: 'FACTORY_IDENTITY', reason: fv.reason }], lines: [], skuCount: 0, unresolvedTotal: 0, meta: meta };

    // ---- 3. Per masterSku: assemble + build ONCE across all marketplaces (shared pool rationed once) ----------
    var issues = [], allLines = [], unresolvedTotal = 0, skuCount = 0;
    var skus = request.skus.slice().sort(function (a, b) { return cmp(str(a.masterSku), str(b.masterSku)); });
    for (var si = 0; si < skus.length; si++) {
      var s = skus[si];
      if (!isObj(s) || !nonEmpty(s.masterSku)) { issues.push({ kind: 'INPUT', reason: 'INVALID_SKU_ENTRY:' + si }); continue; }
      var asm;
      try {
        asm = WIA.assembleWeeklySourceAllocationInput({
          planningCycle: planningCycle, businessScope: { company: company, country: country }, masterSku: s.masterSku,
          formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf,
          factoryIdentityConfig: request.factoryIdentityConfig, warehousesById: request.warehousesById,
          overseasSupplyPools: s.overseasSupplyPools || [], factoryPools: s.factoryPools || [], lanes: s.lanes || []
        });
      } catch (e) { issues.push({ kind: 'SKU', reason: 'ASSEMBLER_ERROR:' + s.masterSku }); continue; }
      if (!asm.ready) { issues.push({ kind: 'SKU', reason: (asm.issues && asm.issues[0] && asm.issues[0].reason) || 'ASSEMBLER_NOT_READY', key: str(s.masterSku) }); continue; }
      if (asm.issues && asm.issues.length) asm.issues.forEach(function (x) { issues.push(x); });
      var built = WSA.buildWeeklySourceAllocation(asm.builderInput);   // overseas pool rationed ONCE across the sku's sites
      skuCount++;
      (built.weeklyFacts && built.weeklyFacts.lines ? built.weeklyFacts.lines : []).forEach(function (l) { allLines.push(l); });
      var sp = built.sourcePriority || {};
      if (typeof sp.unresolvedProductionNeedQty === 'number') unresolvedTotal += sp.unresolvedProductionNeedQty;
    }
    return { ok: true, issues: issues, lines: allLines, skuCount: skuCount, unresolvedTotal: unresolvedTotal, meta: meta };
  }

  function generateWeeklyShippingRecommendationBatch(request, deps) {
    aType(isObj(request), 'request must be an object');
    aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/lockedApply required');

    var scope = isObj(request.businessScope) ? request.businessScope : {};
    var company = str(scope.company), country = str(scope.country), sourcePage = str(scope.source_page);
    var planningCycle = str(request.planningCycle);
    var mode = nonEmpty(request.mode) ? str(request.mode) : 'SCHEDULED_REFRESH';
    var formulaVersion = nonEmpty(request.formulaVersion) ? str(request.formulaVersion) : DEFAULT_FORMULA_VERSION;
    var sourceDataAsOf = request.sourceDataAsOf === undefined ? null : request.sourceDataAsOf;

    function envelope(fields) {
      var base = {
        success: false, recommendationType: 'WEEKLY_SHIPPING', planningCycle: planningCycle,
        businessScope: { company: company, country: country, source_page: sourcePage },
        status: null, reason: null, marketplaceResults: [], skuCount: 0, marketplaceCount: 0,
        recommendedQtyTotal: 0, unresolvedProductionNeedQty: 0, issues: [], formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf
      };
      if (fields) for (var k in fields) if (fields.hasOwnProperty(k)) base[k] = fields[k];
      return base;
    }

    // ---- 1-3. Scope + factory identity + per-source lines (extracted; K2 path reuses the SAME production) -------
    var srcRes = buildWeeklySourceLines(request);
    if (!srcRes.ok) return envelope({ status: srcRes.status, reason: srcRes.reason, issues: srcRes.issues || [] });
    var issues = srcRes.issues, allLines = srcRes.lines, recTotal = 0, unresolvedTotal = srcRes.unresolvedTotal, skuCount = srcRes.skuCount;

    // ---- 4. Group lines by marketplace (the K3 fan-out axis) -----------------------------------------------------
    var byMkt = {};
    allLines.forEach(function (l) {
      var m = str(l.marketplace);
      if (!nonEmpty(m)) { issues.push({ kind: 'LINE', reason: 'LINE_MISSING_MARKETPLACE:' + str(l.demandKey) }); return; }
      if (!byMkt[m]) byMkt[m] = [];
      byMkt[m].push(l);
      if (typeof l.recommendedQty === 'number') recTotal += l.recommendedQty;
    });
    var marketplaces = Object.keys(byMkt).sort(cmp);

    // ---- 5. Fan out: persist ONE K3 draft per marketplace via the frozen bridge + orchestrator ------------------
    var marketplaceResults = [], anyPersist = false, allOk = marketplaces.length > 0;
    for (var mi = 0; mi < marketplaces.length; mi++) {
      var M = marketplaces[mi];
      var mScope = { company: company, country: country, marketplace: M, source_page: sourcePage };
      var mLines = byMkt[M];
      var factsM = {
        recommendationType: 'WEEKLY_SHIPPING', planningCycle: planningCycle, businessScope: mScope,
        formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf,
        lines: mLines, lineage: [], blockedInputs: [], allocationSummary: null
      };
      var res, bridged;
      try {
        bridged = BRIDGE.bridgeRecommendationFactsToPlan({ recommendationFacts: factsM, mode: mode, calculationRunId: 'PENDING' });
        var computeFacts = (function (b) { return function () { return { lines: b.lines, ready: true, formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf }; }; })(bridged);
        res = ORCH.runRecommendationGeneration({
          recommendationType: 'WEEKLY_SHIPPING', mode: mode, planningCycle: planningCycle, businessScope: mScope,
          confirmRegenerateOverUserEdits: request.confirmRegenerateOverUserEdits === true, actor: request.actor, now: request.now
        }, { loadActiveContext: deps.loadActiveContext, loadPriorSnapshot: deps.loadPriorSnapshot, computeFacts: computeFacts, lockedApply: deps.lockedApply });
      } catch (e) {
        marketplaceResults.push({ marketplace: M, success: false, status: 'GENERATION_ERROR', reason: (e && e.message ? e.message : String(e)), draftId: null, draftVersion: null, lineCount: mLines.length });
        allOk = false; continue;
      }
      var okM = res && res.status === 'COMPLETED';
      if (okM) anyPersist = true; else allOk = false;
      marketplaceResults.push({
        marketplace: M, success: !!okM, status: (res && res.status) || 'FAILED', reason: okM ? null : (res && res.reason) || 'PERSISTENCE_FAILED',
        draftId: res ? res.draftId : null, draftVersion: res ? res.draftVersion : null, lineCount: mLines.length
      });
    }

    issues.sort(function (x, y) { return cmp(str(x.kind), str(y.kind)) || cmp(str(x.reason), str(y.reason)); });
    return envelope({
      success: allOk && marketplaces.length > 0,
      status: marketplaces.length === 0 ? 'NO_DEMAND' : (allOk ? 'COMPLETED' : (anyPersist ? 'PARTIAL' : 'FAILED')),
      marketplaceResults: marketplaceResults, skuCount: skuCount, marketplaceCount: marketplaces.length,
      recommendedQtyTotal: recTotal, unresolvedProductionNeedQty: unresolvedTotal, issues: issues
    });
  }

  return {
    generateWeeklyShippingRecommendationBatch: generateWeeklyShippingRecommendationBatch,
    buildWeeklySourceLines: buildWeeklySourceLines,   // F1-7N-FA-3C-R6F2 — per-source lines (K2 path reuses this)
    _version: 'f1-7n-d-2a-r1'
  };
});
