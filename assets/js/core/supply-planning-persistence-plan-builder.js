// Kitchen Mama Operation System — Recommendation PERSISTENCE PLAN BUILDER (Phase 2C, Round 1G).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC bridge that converts a Persistence-Core StoreSlice transition (prev → next) into the
// exact FROZEN PA-7 `PersistencePlan` (RRIS §Persist-Adapter) consumed by the production repository
// (`supply-planning-persistence-repository.js` applyPersistencePlan) and the locking orchestrator
// (`supply-planning-persistence-locking.js`). It is the missing StoreSlice → PersistencePlan glue named as the
// Round 1F-R C3 blocker. It recomputes NO business formula — it only diffs two StoreSlices by frozen natural key.
//
// Boundary (frozen): recommended_qty is written as an immutable per-version SNAPSHOT; the decision column
// (planned_qty / order_qty) carries the Core's already-merged user quantity (user edits preserved by the Core +
// repository — this bridge never overwrites a decision, never stamps user_edited=TRUE, never Submits). No Sheet /
// Range object may appear in the plan. No clock / no random. expectedToken is captured from the PRIOR persisted
// snapshot by the caller and passed through verbatim (never synthesized from the next StoreSlice).

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)),
    req ? req('./supply-planning-plan-builder.js') : (root.KMPB || (root.KM && root.KM.planBuilder))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistencePlanBuilder = api; }
})(this, function (REPO, PB) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function str(v) { return String(v === undefined || v === null ? '' : v); }
  function clone(o) { var r = {}; for (var k in o) if (o.hasOwnProperty(k)) r[k] = o[k]; return r; }

  // Core line-status → repository line_status (targetLineStatus) mapping.
  var STATUS_MAP = { ACTIVE: 'active', BLOCKED: 'blocked', SUPERSEDED: 'superseded', SUPERSEDED_USER_REVIEW: 'superseded_user_review' };

  function typeCfg(type) { aRange(REPO && REPO.TABLES && REPO.TABLES[type], 'unknown recommendationType: ' + type); return REPO.TABLES[type]; }
  function indexByKey(lines) { var m = {}; (lines || []).forEach(function (l) { m[l.lineKey] = l; }); return m; }

  // Build the header row from identity + scope + generation_type + run lineage (no Sheet refs, no live analysis).
  function buildHeaderRow(type, cfg, draftId, scope, generationType, calcRunId, formulaVersion, sourceDataAsOf, draftVersion) {
    var row = {}; row[cfg.headerId] = draftId;
    cfg.scope.forEach(function (c) { row[c] = scope[c] === undefined || scope[c] === null ? '' : scope[c]; });
    row.status = 'draft';
    row.generation_type = generationType;
    row.calculation_run_id = calcRunId;
    row.formula_version = formulaVersion === undefined || formulaVersion === null ? '' : formulaVersion;
    row.source_data_as_of = sourceDataAsOf === undefined || sourceDataAsOf === null ? '' : sourceDataAsOf;
    row.draft_version = draftVersion;
    return row;
  }

  // buildPersistencePlan(args) → frozen PA-7 plan
  function buildPersistencePlan(args) {
    aType(isObj(args), 'args must be an object');
    var type = args.recommendationType, cfg = typeCfg(type);
    aType(isObj(args.identity) && typeof args.identity.draftId === 'string' && args.identity.draftId.length > 0, 'identity.draftId required');
    aType(isObj(args.nextStore) && Array.isArray(args.nextStore.lines) && Array.isArray(args.nextStore.drafts), 'nextStore StoreSlice required');
    var prevStore = isObj(args.prevStore) ? args.prevStore : { drafts: [], lines: [], runs: [] };
    aType(isObj(args.coreResult), 'coreResult required');
    aType(isObj(args.command), 'command required');
    aType(isObj(args.lineDetails), 'lineDetails required');
    aType(typeof args.generationType === 'string' && args.generationType.length > 0, 'generationType required');
    // expectedToken MUST come from the PRIOR persisted snapshot (captured pre-calculation) — never synthesized here.
    aType(isObj(args.expectedToken) && args.expectedToken.draft_version !== undefined && typeof args.expectedToken.userEditFingerprint === 'string', 'expectedToken (pre-calculation) required');

    var draftId = args.identity.draftId;
    var scope = isObj(args.command.businessScope) ? args.command.businessScope : {};
    var scopeWithCycle = clone(scope); if (args.command.planningCycle !== undefined) scopeWithCycle.planning_cycle = args.command.planningCycle;
    var businessScopeKey = args.identity.businessScopeKey || REPO.buildBusinessScopeKey(type, scopeWithCycle);
    var calcRunId = args.coreResult.calculationRunId || args.command.calculationRunId;
    var draftVersion = args.coreResult.draftVersion;
    aType(calcRunId, 'calculationRunId required (coreResult/command)');
    aType(draftVersion !== undefined, 'draftVersion required (coreResult)');

    // header op: INSERT when the draft did not exist in the prior persisted state; else UPDATE.
    var prevDraftExists = (prevStore.drafts || []).some(function (d) { return String(d.draftId) === String(draftId); });
    var headerOp = {
      op: prevDraftExists ? 'UPDATE' : 'INSERT',
      naturalKey: (function () { var k = {}; k[cfg.headerId] = draftId; return k; })(),
      row: buildHeaderRow(type, cfg, draftId, scopeWithCycle, args.generationType, calcRunId, args.command.formulaVersion, args.command.sourceDataAsOf, draftVersion)
    };

    var prevByKey = indexByKey(prevStore.lines.filter(function (l) { return String(l.draftId) === String(draftId); }));
    var nextLines = args.nextStore.lines.filter(function (l) { return String(l.draftId) === String(draftId); }).slice();
    nextLines.sort(function (a, b) { return cmpStr(str(a.lineKey), str(b.lineKey)); });

    var lineOps = [], lineageOps = [];
    nextLines.forEach(function (nl) {
      var lineKey = nl.lineKey;
      var nkComponents = PB.splitLineKey(type, lineKey);
      var naturalKey = clone(nkComponents); naturalKey[cfg.lineDraftId] = draftId;
      var nextStatus = nl.lineStatus;
      var prev = prevByKey[lineKey];

      if (nextStatus === 'SUPERSEDED' || nextStatus === 'SUPERSEDED_USER_REVIEW') {
        // emit SUPERSEDE only on the transition (idempotent: skip if already superseded in the prior state)
        if (prev && (prev.lineStatus === 'SUPERSEDED' || prev.lineStatus === 'SUPERSEDED_USER_REVIEW')) return;
        lineOps.push({ op: 'SUPERSEDE', naturalKey: naturalKey, targetLineStatus: STATUS_MAP[nextStatus] });
        return;
      }
      // ACTIVE or BLOCKED → INSERT (new) or UPDATE (existing)
      var detail = args.lineDetails[lineKey] || { row: {} };
      var blocked = nextStatus === 'BLOCKED';
      var row = clone(isObj(detail.row) ? detail.row : {});
      // frozen boundary: recommended_qty is the immutable snapshot; blocked lines carry NO fabricated qty.
      if (!blocked) {
        row.recommended_qty = (nl.recommendedQty === undefined || nl.recommendedQty === null) ? '' : nl.recommendedQty;
        if (nl.userQty !== undefined && nl.userQty !== null) row[cfg.userQty] = nl.userQty; // decision column (Core-merged, edits preserved)
      } else {
        row.recommended_qty = '';   // explicit blank — never 0
        if (detail.reason) row.recommendation_flags = row.recommendation_flags !== undefined ? row.recommendation_flags : detail.reason;
      }
      var op = prev && prev.lineStatus !== 'SUPERSEDED' && prev.lineStatus !== 'SUPERSEDED_USER_REVIEW' ? 'UPDATE' : (prev ? 'UPDATE' : 'INSERT');
      var lineOp = { op: op, naturalKey: naturalKey, row: row, targetLineStatus: blocked ? 'blocked' : 'active' };
      // on a system refresh over a user-edited line, do NOT overwrite the decision column (repository preserves).
      if (op === 'UPDATE' && prev && prev.userEdited === true) lineOp.preserveUserQty = true;
      lineOps.push(lineOp);
      lineageOps.push({ naturalKey: naturalKey });
    });

    // totals: taken from the Core-computed draft totals (single quantity authority) — no second computation here.
    var nextDraft = args.nextStore.drafts.filter(function (d) { return String(d.draftId) === String(draftId); })[0];
    var t = (nextDraft && nextDraft.totals) || {};
    var totals = {
      totalRecommendedQty: t.totalRecommendedQty || 0, totalUserQty: t.totalUserQty || 0,
      activeLineCount: t.activeLineCount || 0, blockedCount: t.blockedCount || 0, supersededCount: t.supersededCount || 0
    };

    var counts = args.coreResult.counts || {};
    var auditEvents = [{
      event: 'recommendation_draft_persisted', op: args.coreResult.action, recommendationType: type,
      draftId: draftId, calculationRunId: calcRunId, draftVersion: draftVersion, generationType: args.generationType,
      inserted: counts.created || 0, updated: counts.updated || 0, superseded: counts.superseded || 0,
      blocked: counts.blocked || 0, skipped: counts.skipped || 0
    }];

    var plan = {
      recommendationType: type,
      sourceTables: { header: cfg.header, lines: cfg.lines },
      draftId: draftId,
      activeKey: args.identity.activeKey || (type + '::' + businessScopeKey),
      calculationRunId: calcRunId,
      draftVersion: draftVersion,
      expectedToken: args.expectedToken,
      runMeta: {
        planning_cycle: args.command.planningCycle, business_scope_key: businessScopeKey,
        formulaVersion: args.command.formulaVersion, sourceDataAsOf: args.command.sourceDataAsOf, action: args.coreResult.action
      },
      headerOp: headerOp,
      lineOps: lineOps,
      lineageOps: lineageOps,
      totals: totals,
      stages: REPO.STAGES.slice(),
      auditEvents: auditEvents
    };
    // fail-closed: the plan must satisfy the frozen PA-7 validator before it is ever handed to the repository.
    REPO.validatePersistencePlan(plan);
    return plan;
  }

  return {
    STATUS_MAP: (function () { var o = {}; for (var k in STATUS_MAP) o[k] = STATUS_MAP[k]; return o; })(),
    buildPersistencePlan: buildPersistencePlan
  };
});
