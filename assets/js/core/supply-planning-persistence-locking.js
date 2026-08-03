// Kitchen Mama Operation System — Recommendation Persistence LOCKING / optimistic-concurrency boundary
// (Phase 2C, Round 1E). ----------------------------------------------------------------------------------
// PURE / DETERMINISTIC orchestrator of the frozen §Persist-Adapter PA-9/PA-10 boundary in
// docs/planning/RECOMMENDATION_RUNTIME_IMPLEMENTATION_SPEC.md. It realises the exact race-safe write flow:
//   readiness → (pure calc happens OUTSIDE the lock) → acquire ScriptLock → reload Active-Draft context +
//   snapshot UNDER the lock → revalidate {draft_version, userEditFingerprint} → applyPersistencePlan →
//   COMPLETED → release (in finally, exactly once after acquisition).
//
// This module DOES NOT import Apps Script globals and DOES NOT duplicate any repository algorithm — the lock
// primitive, the Sheet I/O, the fingerprint hash and the plan application are all supplied as INJECTED
// dependencies (deps.*). The Apps Script wrapper (23_recommendation_persistence_repository.gs) wires those
// deps to LockService + the KMPR repository module; Node tests wire them to a fake lock + a fake sheet set.
//
// NOT in scope (Round 1E §19): NO Scheduler, NO Trigger, NO no-arg runners, NO calc engine, NO Submit, NO
// Request writer, NO Weekly-Plan promotion, NO API/UI, NO deploy/migration, NO B-6/B-8. No clock / no random /
// no locale here: determinism is a hard invariant (same dependency results ⇒ identical result DTO).

(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.persistenceLocking = api; }
})(this, function () {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function errMsg(e) { return (e && e.message !== undefined && e.message !== null) ? String(e.message) : String(e); }
  // trivial equality of the frozen token shape (NOT a repository algorithm — the fingerprint hash itself is
  // computed behind deps.recomputeToken; here we only compare two already-computed {draft_version, fp} pairs).
  function tokenEq(a, b) {
    return !!a && !!b && String(a.draft_version) === String(b.draft_version) &&
      String(a.userEditFingerprint) === String(b.userEditFingerprint);
  }

  // Frozen, minimal, non-overlapping status vocabulary (Round 1E §9).
  var STATUS = {
    COMPLETED: 'COMPLETED',            // applied, run reached COMPLETED
    LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', // could not acquire the ScriptLock (zero writes)
    CONFLICT: 'CONFLICT',              // token mismatch / terminal / missing-or-existing identity (zero writes)
    BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', // >1 Active Draft under lock (zero writes)
    FAILED: 'FAILED'                   // structural/repository failure or exception (zero or partial writes)
  };
  var REQUIRED_DEPS = ['acquireLock', 'releaseLock', 'loadActiveDraftContext', 'reloadSnapshot', 'recomputeToken', 'applyPlan'];

  // executeLockedPersistence(command)
  //   command = {
  //     plan,               // the deterministic PersistencePlan (PA-7) produced OUTSIDE the lock
  //     expectedToken,      // {draft_version, userEditFingerprint} captured at calculation time (PA-9)
  //     generationType,     // 'SCHEDULED_REFRESH' | 'MANUAL_REGENERATE' (informational; carried into conflict DTO)
  //     opts,               // {actor, now, ...} forwarded verbatim to deps.applyPlan
  //     deps: {
  //       acquireLock(): boolean,          // true ⇒ acquired; may throw
  //       releaseLock(): void,             // may throw (reported, never hides the primary result)
  //       loadActiveDraftContext(): {status:'CREATE'|'REUSE'|'BLOCKED_CONFLICT', draftId?, matchCount?},
  //       reloadSnapshot(): {draft, lines, runs},   // reloaded UNDER the lock — never the pre-lock snapshot
  //       recomputeToken(snapshot): {draft_version, userEditFingerprint},
  //       applyPlan(expectedToken, opts): repositoryResult,  // KMPR.applyPersistencePlan bound to the reloaded set
  //       validatePlan?(plan): void,       // optional structural guard (throws) run BEFORE the lock
  //       audit?(event): void              // optional side-effect hook; failures are reported, never fatal
  //     }
  //   }
  function executeLockedPersistence(command) {
    aType(isObj(command), 'command must be an object');
    var plan = command.plan, expectedToken = command.expectedToken, deps = command.deps, opts = command.opts || {};
    var generationType = command.generationType || 'SCHEDULED_REFRESH';
    aType(isObj(deps), 'command.deps must be an object');
    REQUIRED_DEPS.forEach(function (fn) { aType(typeof deps[fn] === 'function', 'command.deps.' + fn + ' must be a function'); });
    aType(isObj(plan), 'command.plan must be an object');
    aType(typeof plan.draftId === 'string' && plan.draftId.length > 0, 'plan.draftId required');
    aType(typeof plan.calculationRunId === 'string' && plan.calculationRunId.length > 0, 'plan.calculationRunId required');
    aType(isObj(plan.headerOp) && (plan.headerOp.op === 'INSERT' || plan.headerOp.op === 'UPDATE'), 'plan.headerOp.op must be INSERT|UPDATE');
    aType(isObj(expectedToken) && expectedToken.draft_version !== undefined && typeof expectedToken.userEditFingerprint === 'string', 'command.expectedToken invalid');
    // Structural plan validation runs BEFORE acquiring the lock (a throw here needs no release — §14 invariant).
    if (typeof deps.validatePlan === 'function') deps.validatePlan(plan);

    var issues = [];
    var draftId = plan.draftId, calcRunId = plan.calculationRunId;
    var draftVersion = (plan.draftVersion === undefined ? null : plan.draftVersion);
    function audit(ev) { if (typeof deps.audit === 'function') { try { deps.audit(ev); } catch (ae) { issues.push('AUDIT_FAILED:' + errMsg(ae)); } } }
    function dto(status, extra) {
      var d = {
        success: status === STATUS.COMPLETED, status: status, stage: null, reason: null,
        draftId: draftId, calculationRunId: calcRunId, draftVersion: draftVersion,
        applied: false, conflict: false, issues: []
      };
      if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
      return d;
    }
    function finish(d) { d.issues = issues.slice().sort(cmpStr); audit({ event: 'locked_persistence_result', status: d.status, reason: d.reason, draftId: draftId }); return d; }

    // ---- ACQUIRE (outside the try: if acquisition fails there is nothing to release — §14) ----------------
    var acquired = false, acqErr = null;
    try { acquired = deps.acquireLock() === true; } catch (e) { acqErr = e; }
    if (acqErr) return finish(dto(STATUS.LOCK_UNAVAILABLE, { stage: 'lock', reason: 'LOCK_ERROR:' + errMsg(acqErr) }));
    if (!acquired) return finish(dto(STATUS.LOCK_UNAVAILABLE, { stage: 'lock', reason: 'LOCK_UNAVAILABLE' }));

    // ---- CRITICAL SECTION (release happens exactly once in finally) --------------------------------------
    var result = null, stage = 'revalidate';
    try {
      // 1) reload Active-Draft context + duplicate-active RE-check under the lock (never trust the pre-read).
      var active = deps.loadActiveDraftContext();
      var op = plan.headerOp.op;
      if (isObj(active) && active.status === 'BLOCKED_CONFLICT') {
        result = dto(STATUS.BLOCKED_CONFLICT, { stage: stage, reason: 'DUPLICATE_ACTIVE_DRAFT', conflict: true, matchCount: active.matchCount });
      } else if (isObj(active) && active.status === 'CREATE' && op === 'UPDATE') {
        // the Draft the plan means to update has disappeared (cancelled/deleted by a racer) — do not re-create it.
        result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_MISSING', conflict: true });
      } else if (isObj(active) && active.status === 'REUSE' && op === 'INSERT') {
        // a Draft now exists but the plan wants to INSERT a fresh one — a racer created it first.
        result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_ALREADY_EXISTS', conflict: true });
      } else if (isObj(active) && active.status === 'REUSE' && String(active.draftId) !== String(draftId)) {
        // the surviving Active Draft is not the one this plan targets — identity drift.
        result = dto(STATUS.CONFLICT, { stage: stage, reason: 'ACTIVE_DRAFT_IDENTITY_MISMATCH', conflict: true });
      } else {
        // 2) reload the Draft snapshot UNDER the lock + terminal-status guard (submitted/cancelled = immutable).
        var snap = deps.reloadSnapshot();
        var st = (snap && snap.draft) ? String(snap.draft.status === undefined || snap.draft.status === null ? '' : snap.draft.status).trim().toLowerCase() : '';
        if (st === 'submitted' || st === 'cancelled') {
          result = dto(STATUS.CONFLICT, { stage: stage, reason: 'IMMUTABLE_TERMINAL_STATUS:' + st, conflict: true });
        } else {
          // 3) recompute the optimistic token from the reloaded snapshot and compare to the plan's captured token.
          var liveToken = deps.recomputeToken(snap);
          if (!tokenEq(liveToken, expectedToken)) {
            result = dto(STATUS.CONFLICT, { stage: stage, reason: 'CONCURRENCY_TOKEN_MISMATCH', conflict: true, expectedToken: expectedToken, liveToken: liveToken, generationType: generationType });
          } else {
            // 4) APPLY only after a successful revalidation — using the reloaded (under-lock) state.
            stage = 'apply';
            var repo = deps.applyPlan(expectedToken, opts);
            result = mapApply(repo, dto);
          }
        }
      }
    } catch (e) {
      // primary business exception during reload / token / apply — reported honestly, never converted to success.
      result = dto(STATUS.FAILED, { stage: stage, reason: 'EXCEPTION:' + errMsg(e) });
    } finally {
      try { deps.releaseLock(); } catch (re) { issues.push('RELEASE_FAILED:' + errMsg(re)); }
    }
    if (!result) result = dto(STATUS.FAILED, { stage: stage, reason: 'NO_RESULT' });
    return finish(result);
  }

  // Map the repository result (KMPR.applyPersistencePlan) into the frozen lock-result DTO. PARTIAL/FAILED are
  // reported honestly (success:false); a repository CONFLICT stays a CONFLICT; only COMPLETED is a success.
  function mapApply(repo, dto) {
    if (!isObj(repo)) return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_NO_RESULT' });
    var rs = repo.runStatus;
    if (rs === 'COMPLETED') return dto('COMPLETED', { stage: 'apply', reason: null, applied: (repo.applied !== undefined && repo.applied !== null) ? repo.applied : true, conflict: false });
    if (repo.conflict === true || rs === 'CONFLICT') return dto('CONFLICT', { stage: 'apply', reason: repo.reason || 'TOKEN_MISMATCH', conflict: true, applied: false, liveToken: repo.live, expectedToken: repo.expected });
    if (rs === 'PARTIAL') return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_PARTIAL', partial: true, applied: (repo.applied !== undefined && repo.applied !== null) ? repo.applied : false });
    return dto('FAILED', { stage: 'apply', reason: 'REPOSITORY_' + (rs || 'UNKNOWN') + (repo.reason ? (':' + repo.reason) : ''), applied: false });
  }

  return {
    STATUS: { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' },
    REQUIRED_DEPS: REQUIRED_DEPS.slice(),
    executeLockedPersistence: executeLockedPersistence
  };
});
