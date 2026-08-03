// Kitchen Mama Operation System — Recommendation ORCHESTRATOR bridge (Phase 2C, Round 1G).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC glue that runs the production recommendation generation flow end-to-end, tying together
// the already-frozen pure modules WITHOUT reimplementing any of them:
//   validate → active-draft + terminal guard → capture expectedToken (PRE-calc) → resolve source facts (injected)
//   → Plan Builder (KMPB) → Persistence Core (KMPC) → Persistence Plan Builder (KMPPB) → LOCKED repository apply.
// The lock primitive + Sheet I/O are INJECTED (deps.*): the Apps Script wrapper wires them to LockService + the
// KMPR/KMPL bundle; Node tests wire them to a fake lock + fake sheet. This module NEVER Submits / Sends Request /
// creates a Weekly Plan or PO / mutates a terminal Draft. No clock / no random.
//
// Identity is canonicalized on the Persistence Core's deterministic draftId (`KMPC.resolveActiveDraft`), and a
// prior persisted Draft is reconstructed into a Core StoreSlice by CORE-REPLAY (so all ids are Core-correct and
// this module copies no id formula). A repo Active Draft whose id is not the Core-canonical id is a FOREIGN /
// legacy draft and is refused (adopt-required) rather than silently duplicated.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(
    req ? req('./supply-planning-persistence.js') : (root.KMPC || (root.KM && root.KM.persistence)),
    req ? req('./supply-planning-plan-builder.js') : (root.KMPB || (root.KM && root.KM.planBuilder)),
    req ? req('./supply-planning-persistence-plan-builder.js') : (root.KMPPB || (root.KM && root.KM.persistencePlanBuilder)),
    req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository))
  );
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.recommendationOrchestrator = api; }
})(this, function (KMPC, KMPB, KMPPB, KMPR) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function aRange(c, m) { if (!c) throw new RangeError(m); }
  function num(v) { if (v === '' || v === null || v === undefined) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function isBool(v) { return v === true || v === 'TRUE' || v === 'true'; }

  var TERMINAL = { submitted: 1, cancelled: 1 };
  var REPO_STATUS_TO_CORE = { active: 'ACTIVE', blocked: 'BLOCKED', superseded: 'SUPERSEDED', superseded_user_review: 'SUPERSEDED_USER_REVIEW', '': 'ACTIVE', draft: 'ACTIVE' };

  function res(status, extra) {
    var d = { status: status, success: status === 'COMPLETED', reason: null, draftId: null, calculationRunId: null, draftVersion: null, generationType: null, coreAction: null, lock: null, wrote: status === 'COMPLETED' };
    if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
    return d;
  }

  // Reconstruct a prior persisted Draft into a Core StoreSlice by REPLAYING it through the Core (ids stay
  // Core-correct). Only non-superseded (active/blocked) lines seed the base; prior user edits are re-applied so a
  // scheduled refresh preserves them and a removed edited line supersedes to _user_review.
  function storeSliceFromRepoSnapshot(snapshot, type, planningCycle, businessScope) {
    if (!snapshot || !snapshot.draft) return KMPC.createStore();
    var base = [];
    (snapshot.lines || []).forEach(function (l) {
      var st = String(l.lineStatus || '').trim();
      if (st === 'superseded' || st === 'superseded_user_review') return;
      var raw = l.raw || {};
      var lineKey = KMPB.buildLineKey(type, raw);
      if (st === 'blocked') { base.push({ lineKey: lineKey, lineState: 'BLOCKED', reason: String(raw.recommendation_flags || raw.recommendation_reason || 'BLOCKED') }); }
      else { base.push({ lineKey: lineKey, recommendedQty: num(raw.recommended_qty) === null ? 0 : num(raw.recommended_qty), lineState: 'OK' }); }
    });
    var g0 = KMPC.generateRecommendationDraft(KMPC.createStore(), {
      recommendationType: type, mode: 'SCHEDULED_REFRESH', planningCycle: planningCycle, businessScope: businessScope, recommendedLines: base
    });
    var store = g0.store, draftId = g0.result.draftId, cfg = KMPR.TABLES[type];
    // re-apply prior user edits (explicit provenance only — never inferred)
    (snapshot.lines || []).forEach(function (l) {
      var st = String(l.lineStatus || '').trim();
      if (st === 'superseded' || st === 'superseded_user_review') return;
      if (!isBool(l.userEdited)) return;
      var raw = l.raw || {}; var q = num(raw[cfg.userQty]);
      if (q !== null) { try { KMPC.applyUserEdit(store, { draftId: draftId, lineKey: KMPB.buildLineKey(type, raw), userQty: q, actor: String(raw.user_edited_by || 'user') }); } catch (e) { /* line absent (blocked) — skip */ } }
    });
    // carry the true persisted version so a refresh/regenerate versions correctly
    var d = store.drafts[0]; if (d) d.draftVersion = num(snapshot.draft.draft_version) === null ? d.draftVersion : num(snapshot.draft.draft_version);
    return store;
  }

  // Pure keyed-delta write planner for the Apps Script wrapper: given the sheet rows BEFORE and AFTER the pure
  // repository apply, return ONLY the changed rows (targeted updates) + appended rows — never a full-table rewrite.
  function computeKeyedDeltaWrites(before, after) {
    aType(Array.isArray(before) && Array.isArray(after), 'before/after must be arrays');
    var updates = [], appends = [];
    for (var i = 0; i < before.length && i < after.length; i++) {
      if (JSON.stringify(before[i]) !== JSON.stringify(after[i])) updates.push({ rowIndex: i, values: after[i] });
    }
    for (var j = before.length; j < after.length; j++) appends.push(after[j]);
    return { updates: updates, appends: appends, unchanged: before.length - updates.length };
  }

  // runRecommendationGeneration(input, deps) — the production bridge (locked write path).
  //   input = { recommendationType, mode, planningCycle, businessScope, confirmRegenerateOverUserEdits?, actor?, now? }
  //   deps  = { loadActiveContext(query), loadPriorSnapshot(draftId), computeFacts(query), lockedApply(plan, token, opts) }
  function runRecommendationGeneration(input, deps) {
    aType(isObj(input), 'input must be an object');
    var type = input.recommendationType;
    aRange(KMPR.TABLES[type], 'unknown recommendationType: ' + type);
    aRange(input.mode === 'SCHEDULED_REFRESH' || input.mode === 'MANUAL_REGENERATE', 'unsupported mode: ' + input.mode);
    aType(typeof input.planningCycle === 'string' && input.planningCycle.length > 0, 'planningCycle required');
    aType(isObj(input.businessScope), 'businessScope required');
    aType(isObj(deps) && typeof deps.loadActiveContext === 'function' && typeof deps.computeFacts === 'function' && typeof deps.lockedApply === 'function', 'deps.loadActiveContext/computeFacts/lockedApply required');
    var query = { recommendationType: type, planningCycle: input.planningCycle, businessScope: input.businessScope };

    // Core-canonical identity (deterministic, independent of the sheet).
    var canonical = KMPC.resolveActiveDraft(KMPC.createStore(), query); // {status:'CREATE', activeKey, draftId}
    var canonicalDraftId = canonical.draftId, activeKey = canonical.activeKey;

    // Active-draft lookup on the persisted sheet + fail-closed duplicate/foreign guard (scope-level).
    var active = deps.loadActiveContext(query);
    if (isObj(active) && active.status === 'BLOCKED_CONFLICT') return res('BLOCKED_CONFLICT', { reason: 'DUPLICATE_ACTIVE_DRAFT', draftId: canonicalDraftId, matchCount: active.matchCount });
    if (isObj(active) && active.status === 'REUSE' && String(active.draftId) !== String(canonicalDraftId)) return res('BLOCKED_CONFLICT', { reason: 'FOREIGN_DRAFT_ADOPT_REQUIRED', draftId: canonicalDraftId, foundDraftId: active.draftId });

    // Load the CANONICAL-id snapshot ALWAYS (even if the scope lookup said CREATE) so a terminal (submitted/
    // cancelled) draft occupying the canonical id is never silently mutated by a header UPSERT (fail-closed).
    var priorSnapshot = typeof deps.loadPriorSnapshot === 'function' ? deps.loadPriorSnapshot(canonicalDraftId) : null;
    var priorDraft = priorSnapshot && priorSnapshot.draft ? priorSnapshot.draft : null;
    if (priorDraft && TERMINAL[String(priorDraft.status || '').trim().toLowerCase()] === 1) {
      return res('BLOCKED_CONFLICT', { reason: 'IMMUTABLE_TERMINAL_STATUS:' + String(priorDraft.status).trim().toLowerCase(), draftId: canonicalDraftId });
    }
    var reuse = !!priorDraft;
    var priorVersion = priorSnapshot && priorSnapshot.draft ? (num(priorSnapshot.draft.draft_version) === null ? 1 : num(priorSnapshot.draft.draft_version)) : 1;
    var priorTokenLines = priorSnapshot ? (priorSnapshot.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }) : [];
    var expectedToken = KMPR.computeExpectedToken(priorVersion, priorTokenLines);

    // Resolve source facts (INJECTED). Missing/unready source → blocked result, NEVER fabricated zero.
    var facts = deps.computeFacts(query);
    aType(isObj(facts) && Array.isArray(facts.lines), 'computeFacts must return { lines:[...] }');
    if (facts.ready === false) return res('BLOCKED_CONFLICT', { reason: 'SOURCE_NOT_READY:' + (facts.reason || 'UNKNOWN'), draftId: canonicalDraftId });

    // Plan Builder → recommendation command + detail map (recommendation snapshot only; live analysis excluded).
    var built = KMPB.buildRecommendation({
      recommendationType: type, mode: input.mode, planningCycle: input.planningCycle, businessScope: input.businessScope,
      calculationRunId: 'PENDING', formulaVersion: facts.formulaVersion, sourceDataAsOf: facts.sourceDataAsOf, draftVersion: 1, lines: facts.lines
    });
    built.command.confirmRegenerateOverUserEdits = input.confirmRegenerateOverUserEdits === true;

    // Prior store (Core-replay) + Persistence Core generate.
    var priorStore = reuse && priorSnapshot ? storeSliceFromRepoSnapshot(priorSnapshot, type, input.planningCycle, input.businessScope) : KMPC.createStore();
    var gen = KMPC.generateRecommendationDraft(priorStore, built.command);
    if (gen.result.status === 'BLOCKED') return res('BLOCKED_CONFLICT', { reason: gen.result.reason, draftId: canonicalDraftId, draftVersion: gen.result.draftVersion, generationType: built.generationType, coreAction: 'BLOCKED' });

    // Persistence Plan Builder → PA-7 diff.
    var plan = KMPPB.buildPersistencePlan({
      recommendationType: type, identity: { draftId: gen.result.draftId, activeKey: activeKey, businessScopeKey: KMPR.buildBusinessScopeKey(type, withCycle(input.planningCycle, input.businessScope)) },
      prevStore: priorStore, nextStore: gen.store, coreResult: gen.result, command: built.command, lineDetails: built.lineDetails,
      generationType: built.generationType, expectedToken: expectedToken, actor: input.actor || 'system', now: input.now || ''
    });

    // LOCKED apply (injected). The plan is NEVER applied outside this call.
    var lock = deps.lockedApply(plan, expectedToken, { actor: input.actor || 'system', now: input.now || '', generationType: built.generationType, recommendationType: type, draftId: gen.result.draftId });
    var okStatus = lock && lock.status === 'COMPLETED';
    return res(okStatus ? 'COMPLETED' : (lock && lock.status) || 'FAILED', {
      reason: okStatus ? null : (lock && lock.reason) || 'LOCKED_APPLY_FAILED',
      draftId: gen.result.draftId, calculationRunId: gen.result.calculationRunId, draftVersion: gen.result.draftVersion,
      generationType: built.generationType, coreAction: gen.result.action, lock: lock, wrote: okStatus
    });
  }

  function withCycle(cycle, scope) { var o = {}; for (var k in scope) o[k] = scope[k]; o.planning_cycle = cycle; return o; }

  return {
    TERMINAL: { submitted: 1, cancelled: 1 },
    storeSliceFromRepoSnapshot: storeSliceFromRepoSnapshot,
    computeKeyedDeltaWrites: computeKeyedDeltaWrites,
    runRecommendationGeneration: runRecommendationGeneration
  };
});
