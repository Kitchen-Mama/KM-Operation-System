// Kitchen Mama Operation System — WEEKLY AI Plan recommendation-draft persistence adapter (F1-7N-C1).
// -----------------------------------------------------------------------------
// The SMALLEST canonical bridge from the frozen F1-7N-B pure source-allocation builder into the EXISTING
// Recommendation Persistence runtime — introducing NO second persistence engine, NO new formula, NO schema.
//
//   buildWeeklySourceAllocation (F1-7N-B, §35A)            [PURE allocation + FLOOR + residual — authoritative]
//        → resolveWeeklyRecommendationFacts result (b.weeklyFacts)
//        → bridgeRecommendationFactsToPlan (KMBRIDGE)      [camelCase→snake_case natural key; threads
//                                                           allocationBreakdown + unitsPerCarton into lineage]
//        → deps.computeFacts payload  { lines:[plan-builder facts], ready, formulaVersion, sourceDataAsOf }
//        → runRecommendationGeneration (KMORCH)            [K3 Active lookup · Plan Builder per-source fan-out ·
//                                                           Persistence Core · Persistence Plan Builder · LOCKED apply]
//        → shipping_allocation_drafts / shipping_allocation_draft_lines
//
// This adapter RECALCULATES NOTHING (Gap / Overseas / CN / TW / carton FLOOR / unresolved need all come verbatim
// from F1-7N-B). It does NOT persist directly — the injected deps (repository loadActiveContext/loadPriorSnapshot +
// LockService-protected lockedApply) own all I/O, so this module is PURE (Node-testable with fakes; the Apps Script
// wrapper + F1-7N-D will inject the real KMPR/KMPL deps). It writes ONLY the WEEKLY_SHIPPING draft tables via the
// existing owner; it emits NO carrier/rate/lead-time/ETA/cost, creates NO Request Order / PO, reserves NO stock.
// K3 Active identity (no recommendation_group_no) is enforced by the reused orchestrator + repository (F1-7N-C0).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-weekly-source-allocation.js') : (root.KMWSA || (root.KM && root.KM.weeklySourceAllocation)),
    req ? req('./supply-planning-plan-bridge.js') : (root.KMBRIDGE || (root.KM && root.KM.planBridge)),
    req ? req('./supply-planning-recommendation-orchestrator.js') : (root.KMORCH || (root.KM && root.KM.recommendationOrchestrator))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.weeklyRecommendationDraft = api; }
})(this, function (WSA, BRIDGE, ORCH) {
  'use strict';

  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function aType(c, m) { if (!c) throw new TypeError('weeklyRecommendationDraft: ' + m); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }

  // weeklyComputeFacts(builderInput, opts) — run F1-7N-B (§35A) then bridge its resolver facts into the Plan-Builder
  // line shape the orchestrator's computeFacts contract expects. Returns { lines, ready, reason, formulaVersion,
  // sourceDataAsOf, weekly, bridgeMetadata }. opts.mode/opts.calculationRunId only satisfy the bridge's own
  // validation — the orchestrator re-derives mode + calculationRunId itself (this payload's values are not persisted).
  function weeklyComputeFacts(builderInput, opts) {
    aType(isObj(builderInput), 'builderInput must be an object');
    opts = opts || {};
    var b = WSA.buildWeeklySourceAllocation(builderInput);                         // §35A: authoritative, never recomputed here
    var bridged = BRIDGE.bridgeRecommendationFactsToPlan({
      recommendationFacts: b.weeklyFacts,                                          // EXACT resolveWeeklyRecommendationFacts output
      mode: opts.mode || 'SCHEDULED_REFRESH',
      calculationRunId: opts.calculationRunId || 'PENDING'
    });
    return {
      lines: bridged.lines,
      ready: b.weeklyFacts.ready !== false,
      reason: b.weeklyFacts.reason == null ? null : b.weeklyFacts.reason,
      formulaVersion: bridged.formulaVersion,
      sourceDataAsOf: bridged.sourceDataAsOf,
      weekly: b,                                                                   // full F1-7N-B result (sourcePriority, unresolved, issues)
      bridgeMetadata: bridged.metadata
    };
  }

  // persistWeeklyRecommendationDraft(input, deps) — the reusable core owner F1-7N-D (manual UI + scheduler parity)
  // and the Apps Script wrapper will call. It composes the §35A computeFacts and delegates the ENTIRE locked persist
  // to the existing KMORCH.runRecommendationGeneration (no reimplementation of lookup/lock/upsert/user-edit/terminal).
  //   input = { builderInput, mode?, planningCycle, businessScope, confirmRegenerateOverUserEdits?, actor?, now? }
  //           planningCycle + businessScope = the K3 orchestrator identity (businessScope carries source_page).
  //   deps  = { loadActiveContext(query), loadPriorSnapshot?(draftId), lockedApply(plan, token, opts) }  // repo + lock
  function persistWeeklyRecommendationDraft(input, deps) {
    aType(isObj(input), 'input must be an object');
    aType(isObj(input.builderInput), 'input.builderInput required');
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'input.planningCycle required');
    aType(isObj(input.businessScope), 'input.businessScope required (K3 scope incl. source_page)');
    aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/lockedApply required');
    // Fail closed on a cycle mismatch between the K3 identity and the allocation builder input.
    if (typeof input.builderInput.planningCycle === 'string' && input.builderInput.planningCycle.length > 0) {
      aType(str(input.builderInput.planningCycle) === str(input.planningCycle), 'planningCycle mismatch: builderInput ' + input.builderInput.planningCycle + ' vs identity ' + input.planningCycle);
    }
    var mode = input.mode || 'SCHEDULED_REFRESH';
    var computeFacts = function (/* query */) { return weeklyComputeFacts(input.builderInput, { mode: mode }); };
    return ORCH.runRecommendationGeneration({
      recommendationType: 'WEEKLY_SHIPPING',
      mode: mode,
      planningCycle: input.planningCycle,
      businessScope: input.businessScope,
      confirmRegenerateOverUserEdits: input.confirmRegenerateOverUserEdits === true,
      actor: input.actor,
      now: input.now
    }, {
      loadActiveContext: deps.loadActiveContext,
      loadPriorSnapshot: deps.loadPriorSnapshot,
      computeFacts: computeFacts,
      lockedApply: deps.lockedApply
    });
  }

  return {
    weeklyComputeFacts: weeklyComputeFacts,
    persistWeeklyRecommendationDraft: persistWeeklyRecommendationDraft,
    _version: 'f1-7n-c1-r1'
  };
});
