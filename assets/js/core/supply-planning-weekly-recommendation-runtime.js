// Kitchen Mama Operation System — WEEKLY AI PLAN generation-pipeline core (F1-7N-D-1).
// -----------------------------------------------------------------------------
// The ONE canonical Weekly AI Plan generation owner's PURE brain. Both the manual AI Plan action and the Monday
// scheduler (wired in later slices D-2/D-3/D-4) call this ONE function so there is never a parallel calculation path:
//
//   generateWeeklyShippingRecommendationDraft(request, deps)
//     → assembleWeeklySourceAllocationInput(...)   (F1-7N-D0-B — §35A.7 lane projection / survival-once / weight
//                                                    conservation / demandKey / factory-identity fail-closed)
//     → buildWeeklySourceAllocation(...)           (F1-7N-B — Overseas→CN→TW→unresolved; carton FLOOR) [for summary]
//     → persistWeeklyRecommendationDraft(...)       (F1-7N-C1 → runRecommendationGeneration; K3 identity, LockService,
//                                                    natural-key upsert, user-edit protection, terminal conflict)
//     → bounded result DTO
//
// It RE-DERIVES NO business formula and introduces NO second engine: the canonical facts (horizons, survivalNeedQty,
// §7 demandWeight, fulfillmentModel, eligiblePoolTypes, pools, UPC, sourceDataAsOf) are harvested by the Apps Script
// I/O shell (F1-7N-D-2) from the existing headless owners (KMHP / KMPA / KMAF / KMSF / gapOpReadSupplyPoolFacts_ /
// recGenUpcBySku_ / gapCalcResolveContext_) and passed in as `request.lanes` / pools / config. This module is PURE:
// no I/O, no clock/random, no DB/Sheet, no PropertiesService/CacheService, no persistence of its own — the injected
// `deps` (KMPR repository + KMPL LockService-protected lockedApply) own all writes. It creates NO Request Order / PO /
// shipment, reserves NO stock, emits NO carrier/rate/lead-time/ETA/cost. WEEKLY writes ONLY the shipping-allocation
// draft tables, exclusively through the F1-7N-C1 owner. Fail-closed: a bad scope or bad factory-identity config
// returns BLOCKED_INPUT and NEVER persists.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-weekly-input-assembler.js') : (root.KMWIA || (root.KM && root.KM.weeklyInputAssembler)),
    req ? req('./supply-planning-weekly-source-allocation.js') : (root.KMWSA || (root.KM && root.KM.weeklySourceAllocation)),
    req ? req('./supply-planning-weekly-recommendation-draft.js') : (root.KMWRD || (root.KM && root.KM.weeklyRecommendationDraft))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyRecommendationRuntime = api; }
})(this, function (WIA, WSA, WRD) {
  'use strict';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function aType(c, m) { if (!c) throw new TypeError('weeklyRecommendationRuntime: ' + m); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function nonEmpty(v) { return str(v).length > 0; }
  function assign(target, src) { var o = {}, k; for (k in target) if (target.hasOwnProperty(k)) o[k] = target[k]; for (k in src) if (src.hasOwnProperty(k)) o[k] = src[k]; return o; }

  var DEFAULT_FORMULA_VERSION = 'WEEKLY_AI_PLAN_V1';

  // Bounded result envelope — NEVER a raw canonical snapshot. The Apps Script handler wraps this in jsonResponse_.
  function result(fields) {
    var base = {
      success: false, recommendationType: 'WEEKLY_SHIPPING', planningCycle: null, businessScope: null,
      draftId: null, draftVersion: null, status: null, reason: null,
      generatedLineCount: 0, blockedLineCount: 0, recommendedQtyTotal: 0, unresolvedProductionNeedQty: 0,
      sourcePrioritySummary: null, issues: [], ready: false, sourceDataAsOf: null, formulaVersion: DEFAULT_FORMULA_VERSION
    };
    if (fields) for (var k in fields) if (fields.hasOwnProperty(k)) base[k] = fields[k];
    return base;
  }

  // generateWeeklyShippingRecommendationDraft(request, deps) — the single generation owner (manual + scheduler share it).
  //   request = {
  //     planningCycle, businessScope:{company,country,marketplace,source_page}, masterSku,
  //     mode?, confirmRegenerateOverUserEdits?, actor?, now?,
  //     sourceDataAsOf?, formulaVersion?,                         // provenance (carried; never a clock)
  //     factoryIdentityConfig:{CN_YOUXIN, TW_SHENGYI}, warehousesById,
  //     overseasSupplyPools[], factoryPools[],
  //     lanes[]                                                   // assembler lane shape (harvested by the .gs shell)
  //   }
  //   deps = { loadActiveContext(query), loadPriorSnapshot?(draftId), lockedApply(plan, token, opts) }  // KMPR + KMPL
  function generateWeeklyShippingRecommendationDraft(request, deps) {
    aType(isObj(request), 'request must be an object');
    aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/lockedApply required');

    var scope = isObj(request.businessScope) ? request.businessScope : {};
    var formulaVersion = nonEmpty(request.formulaVersion) ? str(request.formulaVersion) : DEFAULT_FORMULA_VERSION;
    var sourceDataAsOf = request.sourceDataAsOf === undefined ? null : request.sourceDataAsOf;
    var provenance = { planningCycle: nonEmpty(request.planningCycle) ? str(request.planningCycle) : null, businessScope: scope, sourceDataAsOf: sourceDataAsOf, formulaVersion: formulaVersion };

    // ---- 1. Scope validation (fail closed; NO persist) ----------------------------------------------------------
    var missing = [];
    ['company', 'country', 'marketplace', 'source_page'].forEach(function (k) { if (!nonEmpty(scope[k])) missing.push('businessScope.' + k); });
    if (!nonEmpty(request.planningCycle)) missing.push('planningCycle');
    if (!nonEmpty(request.masterSku)) missing.push('masterSku');
    if (missing.length) {
      return result(assign(provenance, { status: 'BLOCKED_INPUT', reason: 'MISSING_SCOPE:' + missing.join(','), issues: missing.map(function (m) { return { kind: 'INPUT', reason: 'MISSING:' + m }; }) }));
    }

    // ---- 2. Assemble the F1-7N-B DTO (fail-closed factory identity / lane validation; NO persist on !ready) ------
    var asm;
    try {
      asm = WIA.assembleWeeklySourceAllocationInput({
        planningCycle: request.planningCycle, businessScope: scope, masterSku: request.masterSku,
        formulaVersion: formulaVersion, sourceDataAsOf: sourceDataAsOf,
        factoryIdentityConfig: request.factoryIdentityConfig, warehousesById: request.warehousesById,
        overseasSupplyPools: request.overseasSupplyPools || [], factoryPools: request.factoryPools || [],
        lanes: request.lanes || []
      });
    } catch (e) {
      return result(assign(provenance, { status: 'BLOCKED_INPUT', reason: 'ASSEMBLER_ERROR:' + (e && e.message ? e.message : e), issues: [{ kind: 'INPUT', reason: 'ASSEMBLER_ERROR' }] }));
    }
    if (!asm.ready) {
      return result(assign(provenance, { status: 'BLOCKED_INPUT', reason: (asm.issues && asm.issues[0] && asm.issues[0].reason) || 'ASSEMBLER_NOT_READY', issues: asm.issues || [], ready: false }));
    }

    // ---- 3. Deterministic summary from the frozen builder (pure; the persist path recomputes it identically) -----
    var built = WSA.buildWeeklySourceAllocation(asm.builderInput);
    var lines = built.lines || [];
    var blocked = 0, recTotal = 0;
    lines.forEach(function (l) {
      if (l.blockedReason) blocked++;
      if (typeof l.recommendedQty === 'number') recTotal += l.recommendedQty;
    });
    var sp = built.sourcePriority || {};

    // ---- 4. Persist through the ONLY write path (F1-7N-C1 → orchestrator → LockService) --------------------------
    var persistRes;
    try {
      persistRes = WRD.persistWeeklyRecommendationDraft({
        builderInput: asm.builderInput, mode: request.mode, planningCycle: request.planningCycle,
        businessScope: scope, confirmRegenerateOverUserEdits: request.confirmRegenerateOverUserEdits === true,
        actor: request.actor, now: request.now
      }, { loadActiveContext: deps.loadActiveContext, loadPriorSnapshot: deps.loadPriorSnapshot, lockedApply: deps.lockedApply });
    } catch (e) {
      return result(assign(provenance, {
        status: 'PERSISTENCE_ERROR', reason: (e && e.message ? e.message : String(e)),
        generatedLineCount: lines.length, blockedLineCount: blocked, recommendedQtyTotal: recTotal,
        unresolvedProductionNeedQty: sp.unresolvedProductionNeedQty || 0, sourcePrioritySummary: sp,
        issues: (asm.issues || []).concat(built.issues || []), ready: true
      }));
    }

    // ---- 5. Bounded result DTO --------------------------------------------------------------------------------
    var okStatus = persistRes && persistRes.status === 'COMPLETED';
    return result(assign(provenance, {
      success: !!okStatus,
      status: (persistRes && persistRes.status) || 'FAILED',
      reason: okStatus ? null : (persistRes && persistRes.reason) || 'PERSISTENCE_FAILED',
      draftId: persistRes ? persistRes.draftId : null,
      draftVersion: persistRes ? persistRes.draftVersion : null,
      generatedLineCount: lines.length,
      blockedLineCount: blocked,
      recommendedQtyTotal: recTotal,
      unresolvedProductionNeedQty: sp.unresolvedProductionNeedQty || 0,
      sourcePrioritySummary: sp,
      issues: (asm.issues || []).concat(built.issues || []),
      ready: true
    }));
  }

  return {
    generateWeeklyShippingRecommendationDraft: generateWeeklyShippingRecommendationDraft,
    _version: 'f1-7n-d-1-r1'
  };
});
