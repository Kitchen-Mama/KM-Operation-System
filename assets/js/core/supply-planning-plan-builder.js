// Kitchen Mama Operation System — Recommendation production PLAN BUILDER (Phase 2C, Round 1G).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC projection of already-RESOLVED recommendation facts (produced by the calculation /
// line-runtime / ledger / allocation runtime) into the exact command shape the Persistence Core
// (`supply-planning-persistence.js` → generateRecommendationDraft) accepts, PLUS the per-line detail map the
// Persistence Plan Builder (`supply-planning-persistence-plan-builder.js`) needs to emit a PA-7 diff.
//
// This module owns the RECOMMENDATION-SNAPSHOT projection only. It is bound by the FROZEN Analysis / Snapshot /
// Decision boundary (Round 1F-R, RRIS §Persist-Adapter / REQ_PO §12.13 / WEEKLY §2A):
//   • LIVE ANALYSIS (gap / shortage / coverage / days_of_supply / live suggested_qty / risk) is NEVER persisted
//     as business authority — this module refuses to carry those keys into any persisted row.
//   • RECOMMENDATION SNAPSHOT (`recommended_qty` + calc lineage) is the only quantity this builder emits; it is
//     immutable within a draft_version and belongs to one Draft version.
//   • USER DECISION (`planned_qty` / `order_qty`) is NOT set here — the Persistence Core initializes it from the
//     recommendation snapshot and PRESERVES any prior user edit; the Plan Builder never overwrites a decision.
//   • BUSINESS COMMITMENT (Submit / Send Request / PO / Shipment) is out of scope and never triggered.
//
// It references `supply-planning-persistence-repository.js` (TABLES) as the SINGLE SOURCE OF TRUTH for the
// per-type natural-key grain — no grain is redefined here. No clock / no random: determinism is a hard invariant.

(function (root, factory) {
  'use strict';
  var api = factory(
    (typeof require !== 'undefined') ? require('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.planBuilder = api; }
})(this, function (REPO) {
  'use strict';

  var SEP = '';
  // Core execution intent (mode) → persisted generation_type. Two SEPARATE axes with an explicit mapping.
  var MODE_TO_GENERATION_TYPE = { SCHEDULED_REFRESH: 'scheduled', MANUAL_REGENERATE: 'manual_refresh' };
  // Live-analysis keys that must NEVER appear in a persisted recommendation/decision row (frozen boundary A).
  var LIVE_ANALYSIS_FORBIDDEN = {
    gap: 1, calculated_gap: 1, shortage: 1, shortage_qty: 1, coverage: 1, coverage_status: 1,
    days_of_supply: 1, suggested_qty: 1, uncovered_qty: 1, risk: 1, risk_label: 1, current_risk: 1
  };

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function typeCfg(type) { aRange(REPO && REPO.TABLES && REPO.TABLES[type], 'unknown recommendationType: ' + type); return REPO.TABLES[type]; }

  // ---- deterministic reversible line-key codec (Core StoreSlice domain) ------
  // lineKey = the type's natural-key column VALUES joined by SEP; reversible so the Persistence Plan Builder can
  // reconstruct a structured naturalKey for a SUPERSEDED line that is no longer present in the current command.
  function buildLineKey(type, obj) {
    var cfg = typeCfg(type);
    return cfg.lineKey.map(function (c) {
      var v = str(obj[c]);
      aRange(v.length > 0, 'line natural-key part missing/blank: ' + c);
      aRange(v.indexOf(SEP) === -1, 'line natural-key part must not contain the reserved separator: ' + c);
      return v;
    }).join(SEP);
  }
  function splitLineKey(type, key) {
    var cfg = typeCfg(type);
    var parts = String(key).split(SEP);
    aRange(parts.length === cfg.lineKey.length, 'lineKey arity mismatch for ' + type);
    var o = {}; cfg.lineKey.forEach(function (c, i) { o[c] = parts[i]; });
    return o;
  }

  function mapGenerationType(mode) {
    aRange(MODE_TO_GENERATION_TYPE[mode] !== undefined, 'unsupported mode → generation_type: ' + mode);
    return MODE_TO_GENERATION_TYPE[mode];
  }

  function assertNoLiveAnalysisAuthority(row, where) {
    if (!row) return;
    Object.keys(row).forEach(function (k) {
      aRange(LIVE_ANALYSIS_FORBIDDEN[k] !== 1, 'live-analysis field may not be persisted as authority (' + where + '): ' + k);
    });
  }

  // ---- shared line projection ------------------------------------------------
  // Returns { commandLine, detail } for one resolved line fact. Blocked lines carry NO fabricated quantity.
  function projectLine(type, cfg, f, idx) {
    aType(isObj(f), 'lines[' + idx + '] must be an object');
    // natural-key components must all be present (from the resolved facts)
    var nkObj = {}; cfg.lineKey.forEach(function (c) { nkObj[c] = f[c]; });
    var lineKey = buildLineKey(type, nkObj);
    var blocked = f.blocked === true;
    if (blocked) {
      aType(typeof f.reason === 'string' && f.reason.length > 0, 'lines[' + idx + '] blocked requires a reason token');
    } else {
      aType(typeof f.recommendedQty === 'number', 'lines[' + idx + '].recommendedQty must be a number');
      aRange(isFinite(f.recommendedQty) && f.recommendedQty >= 0, 'lines[' + idx + '].recommendedQty must be finite ≥ 0');
    }
    // extra (non-core) persisted snapshot columns for this type — validated against the live-analysis boundary
    var extraRow = isObj(f.snapshotRow) ? f.snapshotRow : {};
    assertNoLiveAnalysisAuthority(extraRow, type + ' snapshotRow');
    // partial-carton exact value is preserved verbatim — never re-rounded (REQ_PO §37)
    var commandLine = { lineKey: lineKey, recommendedQty: blocked ? null : f.recommendedQty, lineState: blocked ? 'BLOCKED' : 'OK' };
    if (blocked) commandLine.reason = f.reason;
    if (f.demandKey !== undefined) commandLine.demandKey = f.demandKey;
    var detail = {
      lineKey: lineKey,
      naturalKey: nkObj,                              // structured (without the header id; Plan Builder adds it)
      row: extraRow,                                  // extra snapshot columns only (recommended_qty/decision added downstream)
      targetLineStatus: blocked ? 'blocked' : undefined,
      lineage: isObj(f.lineage) ? f.lineage : {},     // runtime-only lineage (demandKey/allocationKey/sourcePoolKey/…)
      blocked: blocked, reason: blocked ? f.reason : null
    };
    return { commandLine: commandLine, detail: detail };
  }

  // ---- public: build a recommendation command + detail map -------------------
  // input = { recommendationType, mode, planningCycle, businessScope, calculationRunId, formulaVersion,
  //           sourceDataAsOf, draftVersion, lines:[ resolved line facts ] }
  function buildRecommendation(input) {
    aType(isObj(input), 'input must be an object');
    var type = input.recommendationType;
    var cfg = typeCfg(type);
    var generationType = mapGenerationType(input.mode);
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
    aType(isObj(input.businessScope), 'businessScope required');
    aType(typeof input.calculationRunId === 'string' && input.calculationRunId.length > 0, 'calculationRunId required');
    aType(Array.isArray(input.lines), 'lines must be an array');

    var seen = {}, commandLines = [], detailByKey = {};
    input.lines.forEach(function (f, i) {
      var p = projectLine(type, cfg, f, i);
      aRange(seen[p.commandLine.lineKey] !== 1, 'duplicate line natural key: ' + p.commandLine.lineKey);
      seen[p.commandLine.lineKey] = 1;
      commandLines.push(p.commandLine);
      detailByKey[p.commandLine.lineKey] = p.detail;
    });
    // stable ordering by lineKey (deterministic; independent of input order) — for BOTH the command lines and
    // the lineDetails key-insertion order, so the whole output serializes byte-identically regardless of input order.
    commandLines.sort(function (a, b) { return cmpStr(a.lineKey, b.lineKey); });
    var lineDetails = {};
    commandLines.forEach(function (l) { lineDetails[l.lineKey] = detailByKey[l.lineKey]; });

    var command = {
      recommendationType: type, mode: input.mode, planningCycle: input.planningCycle,
      businessScope: input.businessScope, recommendedLines: commandLines,
      calculationRunId: input.calculationRunId,
      formulaVersion: input.formulaVersion !== undefined ? input.formulaVersion : null,
      sourceDataAsOf: input.sourceDataAsOf !== undefined ? input.sourceDataAsOf : null
    };
    return {
      command: command,
      lineDetails: lineDetails,
      generationType: generationType,
      recommendationType: type,
      userQtyColumn: cfg.userQty
    };
  }

  return {
    SEP: SEP,
    MODE_TO_GENERATION_TYPE: (function () { var o = {}; for (var k in MODE_TO_GENERATION_TYPE) o[k] = MODE_TO_GENERATION_TYPE[k]; return o; })(),
    LIVE_ANALYSIS_FORBIDDEN: (function () { var o = {}; for (var k in LIVE_ANALYSIS_FORBIDDEN) o[k] = 1; return o; })(),
    mapGenerationType: mapGenerationType,
    buildLineKey: buildLineKey,
    splitLineKey: splitLineKey,
    assertNoLiveAnalysisAuthority: assertNoLiveAnalysisAuthority,
    buildRecommendation: buildRecommendation
  };
});
