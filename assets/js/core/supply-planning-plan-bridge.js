// Kitchen Mama Operation System — Recommendation Facts → Plan Builder BRIDGE (Phase 2C, Round 1O).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC schema translation ONLY. Converts the RESOLVED Weekly / Monthly recommendation facts
// (produced by `supply-planning-source-facts.js` → resolveWeeklyRecommendationFacts /
// resolveMonthlyRecommendationFacts) into the exact input shape the existing Plan Builder
// (`supply-planning-plan-builder.js` → buildRecommendation) accepts, WITHOUT recomputing any business value.
//
// FROZEN boundary (RRIS §Source-Facts Round 1M/1N Plan-Builder-compatibility notes; REQ_PO / WEEKLY grain):
//   • NO recalculation of calculatedGap / netOrderNeed / recommendedQty; NO re-run of Allocation.
//   • NO Persistence, NO Sheet/DB/API read, NO orchestrator, NO Scheduler / Trigger, NO PO / Request writer.
//   • Line identity is REMAPPED mechanically camelCase → the persistence-repo snake_case natural-key columns
//     (Weekly: masterSku/siteSku/windowCode → sku/site_sku/window_code;
//      Monthly: requestMonth/requestBucket → request_month/request_bucket; masterSku validated against scope.sku).
//   • `blockedReason !== null` → Plan Builder `blocked = true` + `reason`; a valid zero recommendedQty stays 0;
//     a missing/null recommendedQty stays null (never fabricated 0).
//   • Run-level `mode` / `calculationRunId` / `draftVersion` are CALLER / orchestrator / persistence owned —
//     NEVER generated here (no clock, no random ID). `recommendationType` / `planningCycle` / `businessScope` /
//     `formulaVersion` / `sourceDataAsOf` come from — and are propagated verbatim out of — the resolved facts.
//   • A resolver line whose Plan Builder natural key would be incomplete (structurally-blocked identity, e.g.
//     MISSING_SKU / empty site_sku) CANNOT be a Plan Builder line; it is surfaced as DATA in
//     metadata.unmappableBlockedLines (never thrown, never silently dropped). Business-blocked lines that DO
//     carry a full natural key are emitted as Plan Builder blocked line facts.
//   • Allocation breakdown + full runtime lineage + preserved calc values (calculatedGap / netOrderNeed /
//     cartonQty / unallocatedQty …) are kept in NON-authoritative bridge metadata — never re-persisted as
//     authority, never used as Plan Builder natural identity.
//
// Determinism is a hard invariant: no clock / no random / no locale; input never mutated; fresh output;
// permutation-invariant (lines sorted by mapped natural key); duplicate mapped key fails closed.

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.planBridge = api; }
})(this, function () {
  'use strict';

  var SEP = String.fromCharCode(1); // reserved natural-key separator (mirrors Plan Builder / Source-Facts)
  // Supported execution intents — a faithful mirror of Plan Builder MODE_TO_GENERATION_TYPE (not a new rule).
  var SUPPORTED_MODES = { SCHEDULED_REFRESH: 1, MANUAL_REGENERATE: 1 };
  var SUPPORTED_TYPES = { WEEKLY_SHIPPING: 1, MONTHLY_ORDER: 1 };
  // Per recommendation type: the ordered Plan Builder natural-key columns + which resolver (camelCase) field
  // supplies each. SINGLE SOURCE OF TRUTH for the mechanical remap (matches persistence-repository TABLES grain).
  var LINE_KEY_MAP = {
    WEEKLY_SHIPPING: [
      { col: 'sku', from: 'masterSku' },
      { col: 'site_sku', from: 'siteSku' },
      { col: 'window_code', from: 'windowCode' }
    ],
    MONTHLY_ORDER: [
      { col: 'request_month', from: 'requestMonth' },
      { col: 'request_bucket', from: 'requestBucket' }
    ]
  };

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
  function nonEmptyStr(v) { return typeof v === 'string' && v.length > 0; }
  function str(v) { return String(v === undefined || v === null ? '' : v); }

  // A non-empty natural-key part free of the reserved separator (mirrors Plan Builder buildLineKey rules).
  function validKeyPart(v) { var s = str(v); return s.length > 0 && s.indexOf(SEP) === -1; }

  // Compare a run-level scope value against a line value; a genuine conflict fails closed (structural).
  function scopeAgrees(scopeVal, lineVal) {
    if (scopeVal === undefined || scopeVal === null) return true;   // scope does not constrain this axis
    if (lineVal === undefined || lineVal === null) return true;     // line does not assert this axis
    return str(scopeVal) === str(lineVal);
  }

  // ---- public: bridge resolved facts → Plan Builder-compatible input -----------------------------------
  // input = { recommendationFacts, mode, calculationRunId, draftVersion?, recommendationType? }
  // recommendationFacts = the EXACT output of resolveWeeklyRecommendationFacts / resolveMonthlyRecommendationFacts.
  function bridgeRecommendationFactsToPlan(input) {
    aType(isObj(input), 'bridgeRecommendationFactsToPlan: input must be an object');
    var facts = input.recommendationFacts;
    aType(isObj(facts), 'bridgeRecommendationFactsToPlan: recommendationFacts must be an object');
    aType(Array.isArray(facts.lines), 'bridgeRecommendationFactsToPlan: recommendationFacts.lines must be an array');

    // --- recommendation type (from facts; supported set only) ---
    var type = facts.recommendationType;
    aRange(SUPPORTED_TYPES[type] === 1, 'bridgeRecommendationFactsToPlan: unsupported recommendationType: ' + type);
    if (input.recommendationType !== undefined && input.recommendationType !== null) {
      aRange(str(input.recommendationType) === str(type),
        'bridgeRecommendationFactsToPlan: recommendationType mismatch (input ' + input.recommendationType + ' vs facts ' + type + ')');
    }

    // --- run-level ownership (facts-owned propagated; caller-owned required, never generated) ---
    aType(nonEmptyStr(facts.planningCycle), 'bridgeRecommendationFactsToPlan: planningCycle required (facts)');
    aType(isObj(facts.businessScope), 'bridgeRecommendationFactsToPlan: businessScope required (facts)');
    aType(nonEmptyStr(input.mode), 'bridgeRecommendationFactsToPlan: mode required (caller-owned)');
    aRange(SUPPORTED_MODES[input.mode] === 1, 'bridgeRecommendationFactsToPlan: unsupported mode: ' + input.mode);
    aType(nonEmptyStr(input.calculationRunId), 'bridgeRecommendationFactsToPlan: calculationRunId required (caller-owned)');
    var draftVersion = null;
    if (input.draftVersion !== undefined && input.draftVersion !== null) {
      aRange(isFiniteNum(input.draftVersion) && input.draftVersion > 0 && Math.floor(input.draftVersion) === input.draftVersion,
        'bridgeRecommendationFactsToPlan: invalid draftVersion (must be a positive integer): ' + input.draftVersion);
      draftVersion = input.draftVersion;
    }
    var planningCycle = str(facts.planningCycle);
    var scope = facts.businessScope;
    var formulaVersion = facts.formulaVersion === undefined ? null : facts.formulaVersion;
    var sourceDataAsOf = facts.sourceDataAsOf === undefined ? null : facts.sourceDataAsOf;

    var keyMap = LINE_KEY_MAP[type];

    var mappable = [];          // { mappedKey, planFact, meta }
    var unmappable = [];        // { blockedReason, partialIdentity, demandKey }
    var seen = {};

    for (var i = 0; i < facts.lines.length; i++) {
      var line = facts.lines[i];
      aType(isObj(line), 'bridgeRecommendationFactsToPlan: recommendationFacts.lines[' + i + '] must be an object');
      var blocked = (line.blockedReason !== undefined && line.blockedReason !== null);

      // --- scope agreement (fail closed on a genuine conflict) ---
      aRange(scopeAgrees(scope.company, line.company), 'bridgeRecommendationFactsToPlan: line company conflicts with scope: ' + line.company);
      aRange(scopeAgrees(scope.country, line.country), 'bridgeRecommendationFactsToPlan: line country conflicts with scope: ' + line.country);
      aRange(scopeAgrees(scope.marketplace, line.marketplace), 'bridgeRecommendationFactsToPlan: line marketplace conflicts with scope: ' + line.marketplace);
      if (type === 'MONTHLY_ORDER') {
        aRange(scopeAgrees(scope.sku, line.masterSku), 'bridgeRecommendationFactsToPlan: line masterSku conflicts with scope.sku: ' + line.masterSku);
      }

      // --- mechanical natural-key remap ---
      var nk = {}, parts = [], complete = true;
      for (var k = 0; k < keyMap.length; k++) {
        var v = str(line[keyMap[k].from]);
        nk[keyMap[k].col] = v;
        if (!validKeyPart(v)) complete = false;
        parts.push(v);
      }

      // preserved (non-authoritative) per-line metadata — verbatim, no recompute
      var meta = {
        recommendationType: type,
        demandKey: line.demandKey === undefined ? null : line.demandKey,
        recommendedQty: line.recommendedQty === undefined ? null : line.recommendedQty,
        unallocatedQty: line.unallocatedQty === undefined ? null : line.unallocatedQty,
        allocationMode: line.allocationMode === undefined ? null : line.allocationMode,
        allocationBreakdown: Array.isArray(line.allocationBreakdown) ? line.allocationBreakdown.slice() : [],
        sourcePoolKey: line.sourcePoolKey === undefined ? null : line.sourcePoolKey,
        sourceWarehouseId: line.sourceWarehouseId === undefined ? null : line.sourceWarehouseId,
        lineage: Array.isArray(line.lineage) ? line.lineage.slice() : [],
        blockedReason: blocked ? line.blockedReason : null
      };
      if (type === 'WEEKLY_SHIPPING') {
        meta.calculatedGap = line.calculatedGap === undefined ? null : line.calculatedGap;
        meta.sourcePoolType = line.sourcePoolType === undefined ? null : line.sourcePoolType;
      } else {
        meta.netOrderNeed = line.netOrderNeed === undefined ? null : line.netOrderNeed;
        meta.cartonQty = line.cartonQty === undefined ? null : line.cartonQty;
        meta.monthlyDemandQty = line.monthlyDemandQty === undefined ? null : line.monthlyDemandQty;
        meta.unitsPerCarton = line.unitsPerCarton === undefined ? null : line.unitsPerCarton;
      }
      if (line.liveAnalysis !== undefined) meta.liveAnalysis = line.liveAnalysis; // non-authoritative echo only

      if (!complete) {
        // No valid Plan Builder natural key → data, never a Plan Builder line, never thrown.
        unmappable.push({
          blockedReason: blocked ? str(line.blockedReason) : 'INCOMPLETE_NATURAL_KEY',
          partialIdentity: nk,
          demandKey: line.demandKey === undefined ? null : line.demandKey
        });
        continue;
      }

      var mappedKey = parts.join(SEP);
      aRange(seen[mappedKey] !== 1, 'bridgeRecommendationFactsToPlan: duplicate mapped Plan Builder line key: ' + parts.join('|'));
      seen[mappedKey] = 1;

      // Plan Builder line fact — runtime-only lineage carried in the OBJECT slot Plan Builder accepts.
      var lineageObj = {
        demandKey: line.demandKey === undefined ? null : line.demandKey,
        allocationMode: line.allocationMode === undefined ? null : line.allocationMode,
        sourcePoolKey: line.sourcePoolKey === undefined ? null : line.sourcePoolKey,
        sourceWarehouseId: line.sourceWarehouseId === undefined ? null : line.sourceWarehouseId,
        keys: Array.isArray(line.lineage) ? line.lineage.slice() : []
      };
      var planFact = {};
      for (var c = 0; c < keyMap.length; c++) planFact[keyMap[c].col] = nk[keyMap[c].col];
      if (blocked) {
        planFact.blocked = true;
        planFact.reason = str(line.blockedReason);
        planFact.recommendedQty = null; // stays null — never a fabricated 0
      } else {
        aType(isFiniteNum(line.recommendedQty), 'bridgeRecommendationFactsToPlan: non-blocked line recommendedQty must be a number');
        aRange(line.recommendedQty >= 0, 'bridgeRecommendationFactsToPlan: recommendedQty must be finite ≥ 0');
        planFact.blocked = false;
        planFact.recommendedQty = line.recommendedQty; // preserved verbatim — no round/floor/ceiling/clamp
      }
      if (line.demandKey !== undefined && str(line.demandKey).length > 0) planFact.demandKey = line.demandKey;
      planFact.lineage = lineageObj;

      mappable.push({ mappedKey: mappedKey, planFact: planFact, meta: meta });
    }

    // deterministic stable ordering by mapped natural key (independent of input order)
    mappable.sort(function (a, b) { return cmpStr(a.mappedKey, b.mappedKey); });
    unmappable.sort(function (a, b) {
      return cmpStr(a.blockedReason, b.blockedReason) || cmpStr(str(a.demandKey), str(b.demandKey));
    });

    var lines = [], lineMetaByKey = {};
    mappable.forEach(function (m) { lines.push(m.planFact); lineMetaByKey[m.mappedKey] = m.meta; });

    return {
      recommendationType: type,
      mode: input.mode,
      planningCycle: planningCycle,
      businessScope: scope,
      calculationRunId: input.calculationRunId,
      formulaVersion: formulaVersion,
      sourceDataAsOf: sourceDataAsOf,
      draftVersion: draftVersion,
      lines: lines,
      lineage: Array.isArray(facts.lineage) ? facts.lineage.slice() : [],
      metadata: {
        lineMetaByKey: lineMetaByKey,
        unmappableBlockedLines: unmappable,
        blockedInputs: Array.isArray(facts.blockedInputs) ? facts.blockedInputs.slice() : [],
        allocationSummary: isObj(facts.allocationSummary) ? facts.allocationSummary : null,
        mappedLineCount: lines.length,
        unmappableLineCount: unmappable.length
      }
    };
  }

  return {
    SEP: SEP,
    SUPPORTED_MODES: (function () { var o = {}; for (var k in SUPPORTED_MODES) o[k] = 1; return o; })(),
    SUPPORTED_TYPES: (function () { var o = {}; for (var k in SUPPORTED_TYPES) o[k] = 1; return o; })(),
    LINE_KEY_MAP: (function () { var o = {}; for (var t in LINE_KEY_MAP) o[t] = LINE_KEY_MAP[t].map(function (m) { return { col: m.col, from: m.from }; }); return o; })(),
    bridgeRecommendationFactsToPlan: bridgeRecommendationFactsToPlan
  };
});
