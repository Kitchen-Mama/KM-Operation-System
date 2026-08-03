// Kitchen Mama Operation System — Recommendation USER DECISION EDIT (locked) command (Phase 2C, Round 1H).
// -----------------------------------------------------------------------------
// PURE / DETERMINISTIC orchestrator for the FOCUSED user-decision-edit command (edit planned_qty / order_qty /
// carton / method / note / ETA on an existing Recommendation Draft). It is deliberately SEPARATE from engine
// generation (a simple quantity edit must NEVER be mapped to a full recalculation): it does NOT build a
// PersistencePlan, does NOT create a calculation run, and does NOT change draft_version.
//
// It enforces the canonical write boundary shared with the generation path: acquire ScriptLock → reload the
// Draft + lines UNDER the lock → terminal-status guard (submitted/cancelled block ALL) → optimistic-token
// revalidation → targeted natural-key edit via KMPR.applyUserDecisionEdits (allowlisted decision fields +
// explicit user_edited/user_edited_by; recommended_qty snapshot + lineage preserved; terminal lines never
// touched) → release in finally (exactly once after acquisition). The lock primitive + Sheet I/O are INJECTED
// (deps.*): the Apps Script wrapper wires LockService + the KMPR bundle + a keyed-delta write; Node tests wire a
// fake lock + fake sheet. Shares KMPR's SINGLE terminal-status helper — no terminal token list is duplicated.
// No clock / no random. Result DTO shares the frozen vocabulary { COMPLETED | LOCK_UNAVAILABLE | CONFLICT |
// BLOCKED_CONFLICT | FAILED }.

(function (root, factory) {
  'use strict';
  var req = (typeof require !== 'undefined') ? require : null;
  var api = factory(req ? req('./supply-planning-persistence-repository.js') : (root.KMPR || (root.KM && root.KM.persistenceRepository)));
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (typeof window !== 'undefined') { window.KM = window.KM || {}; window.KM.userEdit = api; }
})(this, function (KMPR) {
  'use strict';

  function isObj(x) { return x && typeof x === 'object' && !Array.isArray(x); }
  function aType(c, m) { if (!c) throw new TypeError(m); }
  function cmpStr(a, b) { return a < b ? -1 : (a > b ? 1 : 0); }
  function errMsg(e) { return (e && e.message !== undefined && e.message !== null) ? String(e.message) : String(e); }
  function tokenEq(a, b) { return !!a && !!b && String(a.draft_version) === String(b.draft_version) && String(a.userEditFingerprint) === String(b.userEditFingerprint); }

  var STATUS = { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' };
  var REQUIRED_DEPS = ['acquireLock', 'releaseLock', 'reloadSnapshot', 'recomputeToken', 'applyEdits'];

  // runUserDecisionEdit(command, deps)
  //   command = { recommendationType, draftId, edits:[{naturalKey, fields, recommendedSnapshot?}], reconcile?,
  //               expectedToken:{draft_version,userEditFingerprint}, actor?, now? }
  //   deps = { acquireLock():bool, releaseLock(), reloadSnapshot():{draft,lines}, recomputeToken(snap):token,
  //            applyEdits(command):{status,counts}, audit? }
  function runUserDecisionEdit(command, deps) {
    aType(isObj(command), 'command must be an object');
    aType(KMPR.TABLES[command.recommendationType], 'unknown recommendationType');
    aType(typeof command.draftId === 'string' && command.draftId.length > 0, 'command.draftId required');
    aType(Array.isArray(command.edits) && command.edits.length > 0, 'command.edits must be a non-empty array');
    aType(isObj(command.expectedToken) && command.expectedToken.draft_version !== undefined && typeof command.expectedToken.userEditFingerprint === 'string', 'command.expectedToken required (pre-edit)');
    aType(isObj(deps), 'deps required');
    REQUIRED_DEPS.forEach(function (fn) { aType(typeof deps[fn] === 'function', 'deps.' + fn + ' required'); });

    var issues = [];
    var draftId = command.draftId, expected = command.expectedToken;
    function audit(ev) { if (typeof deps.audit === 'function') { try { deps.audit(ev); } catch (ae) { issues.push('AUDIT_FAILED:' + errMsg(ae)); } } }
    function dto(status, extra) {
      var d = { success: status === STATUS.COMPLETED, status: status, reason: null, draftId: draftId, applied: false, conflict: false, counts: null, issues: [] };
      if (extra) for (var k in extra) if (extra.hasOwnProperty(k)) d[k] = extra[k];
      return d;
    }
    function finish(d) { d.issues = issues.slice().sort(cmpStr); audit({ event: 'user_decision_edit_result', status: d.status, reason: d.reason, draftId: draftId }); return d; }

    // acquire (outside try: no release if not acquired)
    var acquired = false, acqErr = null;
    try { acquired = deps.acquireLock() === true; } catch (e) { acqErr = e; }
    if (acqErr) return finish(dto(STATUS.LOCK_UNAVAILABLE, { reason: 'LOCK_ERROR:' + errMsg(acqErr) }));
    if (!acquired) return finish(dto(STATUS.LOCK_UNAVAILABLE, { reason: 'LOCK_UNAVAILABLE' }));

    var result = null;
    try {
      var snap = deps.reloadSnapshot();
      if (!snap || !snap.draft) { result = dto(STATUS.CONFLICT, { reason: 'DRAFT_NOT_FOUND', conflict: true }); }
      else if (KMPR.isTerminalDraftStatus(snap.draft.status)) { result = dto(STATUS.BLOCKED_CONFLICT, { reason: 'IMMUTABLE_TERMINAL_STATUS:' + String(snap.draft.status).trim().toLowerCase(), conflict: true }); }
      else {
        var live = deps.recomputeToken(snap);
        if (!tokenEq(live, expected)) { result = dto(STATUS.CONFLICT, { reason: 'CONCURRENCY_TOKEN_MISMATCH', conflict: true, expectedToken: expected, liveToken: live }); }
        else {
          var r = deps.applyEdits(command);
          if (r && r.status === 'APPLIED') { result = dto(STATUS.COMPLETED, { reason: null, applied: r.counts || true, counts: r.counts || null }); }
          else if (r && (r.status === 'DUPLICATE_LINE_KEY' || r.status === 'INVALID_EDIT_FIELD' || r.status === 'LINE_NOT_FOUND')) { result = dto(STATUS.CONFLICT, { reason: r.reason || r.status, conflict: true, counts: r.counts || null }); }
          else { result = dto(STATUS.FAILED, { reason: (r && (r.reason || r.status)) || 'APPLY_EDITS_FAILED' }); }
        }
      }
    } catch (e2) {
      result = dto(STATUS.FAILED, { reason: 'EXCEPTION:' + errMsg(e2) });
    } finally {
      try { deps.releaseLock(); } catch (re) { issues.push('RELEASE_FAILED:' + errMsg(re)); }
    }
    if (!result) result = dto(STATUS.FAILED, { reason: 'NO_RESULT' });
    return finish(result);
  }

  return {
    STATUS: { COMPLETED: 'COMPLETED', LOCK_UNAVAILABLE: 'LOCK_UNAVAILABLE', CONFLICT: 'CONFLICT', BLOCKED_CONFLICT: 'BLOCKED_CONFLICT', FAILED: 'FAILED' },
    REQUIRED_DEPS: REQUIRED_DEPS.slice(),
    runUserDecisionEdit: runUserDecisionEdit
  };
});
