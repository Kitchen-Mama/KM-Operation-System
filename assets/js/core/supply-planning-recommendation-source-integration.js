// Kitchen Mama Operation System — Recommendation ORCHESTRATOR ↔ SOURCE READER integration (Phase 2C, Round 1Q).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC wiring that REPLACES the `SOURCE_READER_PENDING` stub: it composes the Round 1P Source
// Reader with the frozen Ledger / Allocation-Input / Weekly-Monthly Resolver / Bridge runtimes into the exact
// `computeFacts(query)` seam the locked Recommendation Orchestrator already injects
// (`runRecommendationGeneration(input, { computeFacts, ... })`). It REIMPLEMENTS NOTHING — every stage is the
// real frozen module, called in order:
//
//   caller-supplied source input
//     → readWeeklyRecommendationSource / readMonthlyRecommendationSource   (KMSR — the ONLY reader; §1P)
//     → buildDemandLedger / buildSupplyLedger                              (KMLEDGER — §39)
//     → resolveDemandKeys                                                  (KMSR — Ledger-owned key, never recomputed)
//     → projectAllocationInputs                                           (KMSF — §40)
//     → resolveWeeklyRecommendation / resolveMonthlyRecommendation        (KMSF — §31/§14)
//     → bridgeRecommendationFactsToPlan                                   (KMBRIDGE — Plan-Builder-ready lines)
//   → the Orchestrator's own Plan Builder → Core → Persistence Plan Builder → LOCKED apply (unchanged).
//
// This module owns NO business logic: no mapping/normalize/identity/demandKey (Reader-owned), no Gap / Net Order
// Need / recommendedQty (Resolver-owned), no allocation (Allocator-owned), no persistence. It routes by
// recommendationType and NEVER calls the other reader, NEVER fabricates a missing source, NEVER silences Reader
// issues, NEVER turns MISSING into 0, NEVER supplies sourceDataAsOf/formulaVersion/planningCycle itself, and uses
// no clock / random / locale / SpreadsheetApp / LockService / Cache. Reader-thrown TypeError / RangeError
// (invalid enum, duplicate line identity, ambiguous demandRef, unresolved identity, structural failure) are NOT
// caught here — they propagate fail-closed. Insufficient valid input → ready:false (Orchestrator BLOCKS; never a
// blank-but-successful plan).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-source-reader.js') : (root.KMSR || (root.KM && root.KM.sourceReader)),
    req ? req('./supply-planning-ledgers.js') : (root.KMLEDGER || (root.KM && root.KM.ledgers)),
    req ? req('./supply-planning-source-facts.js') : (root.KMSF || (root.KM && root.KM.sourceFacts)),
    req ? req('./supply-planning-plan-bridge.js') : (root.KMBRIDGE || (root.KM && root.KM.planBridge))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.recommendationSourceIntegration = api; }
})(this, function (KMSR_D, KMLEDGER_D, KMSF_D, KMBRIDGE_D) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }

  // recommendationType → the ONE reader + the allocation-fact / planning-fact / resolver binding. No second reader.
  var ROUTES = {
    WEEKLY_SHIPPING: { readFn: 'readWeeklyRecommendationSource', allocKey: 'receiverFacts', factsKey: 'weeklyPlanningFacts', resolveFn: 'resolveWeeklyRecommendationFacts' },
    MONTHLY_ORDER: { readFn: 'readMonthlyRecommendationSource', allocKey: 'factoryDemandFacts', factsKey: 'monthlyPlanningFacts', resolveFn: 'resolveMonthlyRecommendationFacts' }
  };

  function selectReaderName(recommendationType) {
    var r = ROUTES[recommendationType];
    aRange(!!r, 'recommendation source integration: unsupported recommendationType: ' + recommendationType);
    return r.readFn;
  }

  function makeIntegration(overrides) {
    var KMSR = (overrides && overrides.KMSR) || KMSR_D;
    var KMLEDGER = (overrides && overrides.KMLEDGER) || KMLEDGER_D;
    var KMSF = (overrides && overrides.KMSF) || KMSF_D;
    var KMBRIDGE = (overrides && overrides.KMBRIDGE) || KMBRIDGE_D;

    // Full source→facts pipeline. Returns a rich, testable integration result (the Orchestrator itself consumes
    // only the computeFacts-shaped subset). Reader errors propagate; nothing is fabricated.
    function resolveRecommendationFactsFromSource(sourceInput, opts) {
      aType(isObj(sourceInput), 'resolveRecommendationFactsFromSource: sourceInput must be an object');
      opts = opts || {};
      var type = opts.recommendationType != null ? str(opts.recommendationType) : str(sourceInput.recommendationType);
      var route = ROUTES[type];
      aRange(!!route, 'resolveRecommendationFactsFromSource: unsupported recommendationType: ' + type);

      // 1) Source Reader (the ONLY reader; the other route is never called).
      var dto = KMSR[route.readFn](sourceInput);

      // 2) Ledgers (frozen §39 — count-once owned by the Ledger).
      var demandLedger = KMLEDGER.buildDemandLedger(dto.demandLedgerInput);
      var supplyLedger = KMLEDGER.buildSupplyLedger(dto.supplyLedgerInput);

      // 3) demandKey identity link (Ledger-EMITTED key; never recomputed here).
      var linked = KMSR.resolveDemandKeys(dto, demandLedger);

      // 4) Allocation input projection (frozen §40 — real allocators).
      var apInput = { identity: dto.identity, demandLedger: demandLedger, supplyLedger: supplyLedger };
      apInput[route.allocKey] = linked[route.allocKey];
      var allocationInput = KMSF.projectAllocationInputs(apInput);

      // 5) Weekly / Monthly recommendation resolver (frozen §31/§14).
      var resolverInput = {
        planningCycle: dto.planningCycle, businessScope: dto.businessScope,
        allocationProjection: allocationInput, formulaVersion: dto.formulaVersion,
        sourceDataAsOf: dto.sourceDataAsOf, demandLedger: demandLedger
      };
      resolverInput[route.factsKey] = linked[route.factsKey];
      var resolverResult = KMSF[route.resolveFn](resolverInput);

      // 6) Bridge → Plan-Builder-ready lines (mode/runId are Orchestrator-owned; only lines/version propagate).
      var bridgeResult = KMBRIDGE.bridgeRecommendationFactsToPlan({
        recommendationFacts: resolverResult,
        mode: opts.mode != null ? opts.mode : 'SCHEDULED_REFRESH',
        calculationRunId: opts.calculationRunId != null ? opts.calculationRunId : 'PENDING',
        draftVersion: opts.draftVersion != null ? opts.draftVersion : 1
      });

      // Aggregate every stage's issues — Reader issues are NEVER cleared; nothing is silently dropped.
      var sourceIssues = [];
      (dto.issues || []).forEach(function (x) { sourceIssues.push({ stage: 'reader', domain: x.domain, i: x.i, reason: x.reason }); });
      (allocationInput.issues || []).forEach(function (x) { sourceIssues.push({ stage: 'allocation', kind: x.kind, key: x.key, reason: x.reason }); });
      (allocationInput.blockedInputs || []).forEach(function (x) { sourceIssues.push({ stage: 'allocationBlocked', kind: x.kind, key: x.key, reason: x.reason }); });
      (resolverResult.issues || []).forEach(function (x) { sourceIssues.push({ stage: 'resolver', key: x.key, reason: x.reason }); });
      ((bridgeResult.metadata && bridgeResult.metadata.unmappableBlockedLines) || []).forEach(function (x) { sourceIssues.push({ stage: 'bridge', reason: x.blockedReason }); });

      var lines = bridgeResult.lines;
      // ready = the resolver was clean AND at least one recommendation line survives. Insufficient valid input
      // (all rows excluded) → NOT ready → Orchestrator BLOCKS (no blank-but-successful plan). No fallback.
      var ready = resolverResult.ready === true && lines.length > 0;
      var reason = resolverResult.ready !== true
        ? (resolverResult.reason || 'SOURCE_ISSUES_PRESENT')
        : (lines.length > 0 ? null : 'NO_RECOMMENDATION_LINES');

      return {
        recommendationType: type,
        planningCycle: dto.planningCycle,
        businessScope: dto.businessScope,
        formulaVersion: bridgeResult.formulaVersion,
        sourceDataAsOf: bridgeResult.sourceDataAsOf,
        sourceIssues: sourceIssues,
        ledgerResult: { demandLedger: demandLedger, supplyLedger: supplyLedger },
        allocationInput: allocationInput,
        resolverResult: resolverResult,
        bridgeResult: bridgeResult,
        lines: lines,
        ready: ready,
        reason: reason
      };
    }

    // Adapt to the Orchestrator's injected `deps.computeFacts(query)` seam. Routes by the query's recommendationType
    // (the value the Orchestrator already validated). Returns ONLY the computeFacts-shaped subset the Orchestrator
    // consumes ({ lines, ready, reason, formulaVersion, sourceDataAsOf }) + sourceIssues for visibility.
    function createComputeFacts(sourceInput, opts) {
      opts = opts || {};
      return function computeFacts(query) {
        var type = (query && query.recommendationType != null) ? query.recommendationType : opts.recommendationType;
        var full = resolveRecommendationFactsFromSource(sourceInput, {
          recommendationType: type, mode: opts.mode, calculationRunId: opts.calculationRunId, draftVersion: opts.draftVersion
        });
        return {
          lines: full.lines, ready: full.ready, reason: full.reason,
          formulaVersion: full.formulaVersion, sourceDataAsOf: full.sourceDataAsOf,
          sourceIssues: full.sourceIssues
        };
      };
    }

    return {
      selectReaderName: selectReaderName,
      resolveRecommendationFactsFromSource: resolveRecommendationFactsFromSource,
      createComputeFacts: createComputeFacts
    };
  }

  var DEFAULT = makeIntegration(null);

  return {
    ROUTES: (function () { var o = {}; for (var t in ROUTES) { o[t] = {}; for (var k in ROUTES[t]) o[t][k] = ROUTES[t][k]; } return o; })(),
    selectReaderName: selectReaderName,
    createRecommendationSourceIntegration: makeIntegration,
    resolveRecommendationFactsFromSource: DEFAULT.resolveRecommendationFactsFromSource,
    createComputeFacts: DEFAULT.createComputeFacts
  };
});
