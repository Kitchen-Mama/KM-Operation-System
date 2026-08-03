/**
 * 25_recommendation_user_edit.gs
 * Kitchen Mama Operation System — LOCKED Recommendation User-Decision-Edit boundary (Phase 2C, Round 1H).
 *
 * SOURCE MIRROR / NOT DEPLOYED. Thin Apps Script wrapper that runs the FOCUSED user-decision-edit command by
 * delegating ENTIRELY to the generated bundle (90_generated_supply_planning_bundle.gs): KMUE.runUserDecisionEdit
 * (locked flow) + KMPR.applyUserDecisionEdits (targeted natural-key edit) + LockService + a keyed-delta write.
 * No algorithm here. This is the canonical write boundary the legacy 15_ line route now adapts into (order_qty
 * edits) and it is SEPARATE from engine generation (24_ generateRecommendationDraftLocked) and from Submit.
 *
 * Also exposes a READ-ONLY concurrency-token getter (getRecommendationDraftToken) so clients can obtain the
 * {draft_version, userEditFingerprint} token required by every edit write (§14).
 */

function rueBundle_() {
  if (typeof KMUE === 'undefined' || typeof KMPR === 'undefined') {
    throw new Error('Recommendation bundle (KMUE/KMPR) is not present in this Apps Script project — Round 1H is a ' +
      'source mirror; the generated bundle 90_generated_supply_planning_bundle.gs must be loaded. No algorithm here.');
  }
}

// READ-ONLY: return the concurrency token + status for a Draft so the client can send it back on an edit (§14).
function handleGetRecommendationDraftToken_(body) {
  rueBundle_();
  var type = body && body.recommendationType;
  if (!KMPR.TABLES[type]) return jsonResponse_({ success: false, error: 'unknown recommendationType' });
  var draftId = String((body && body.draftId) || '').trim();
  if (!draftId) return jsonResponse_({ success: false, error: 'draftId required' });
  var ss = SpreadsheetApp.getActiveSpreadsheet(), cfg = KMPR.TABLES[type];
  var b = rprBuildSheetSet_(ss, [cfg.header, cfg.lines, KMPR.RUN_JOURNAL_TABLE]);
  var snap = KMPR.loadDraftSnapshot(b.set, draftId, type);
  if (!snap.draft) return jsonResponse_({ success: false, error: 'DRAFT_NOT_FOUND' });
  var token = KMPR.computeExpectedToken(snap.draft.draft_version, (snap.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
  return jsonResponse_({ success: true, data: { recommendationType: type, draftId: draftId, status: snap.draft.status, expectedToken: token } });
}

// LOCKED user decision edit (canonical). Body: { recommendationType, draftId, edits:[{naturalKey, fields,
// recommendedSnapshot?}], reconcile?, allowInsert?, expectedToken, actor? }.
function handleUpdateRecommendationDecisionLocked_(body) {
  rueBundle_();
  var type = body && body.recommendationType;
  if (!KMPR.TABLES[type]) return jsonResponse_({ success: false, error: 'unknown recommendationType', stage: 'input' });
  var draftId = String((body && body.draftId) || '').trim();
  if (!draftId) return jsonResponse_({ success: false, error: 'draftId required', stage: 'input' });
  var ss = SpreadsheetApp.getActiveSpreadsheet(), cfg = KMPR.TABLES[type], tables = [cfg.header, cfg.lines, KMPR.RUN_JOURNAL_TABLE];
  var linesSheet = procurementEnsureSheet_(ss, cfg.lines, RPR_TABLE_HEADERS_[cfg.lines]);
  sheetEnsureColumns_(linesSheet, KMPR.LINE_ADDITIVE_HEADERS);
  var lock = LockService.getScriptLock(), built = null;
  var command = {
    recommendationType: type, draftId: draftId, edits: (body && body.edits) || [],
    reconcile: body && body.reconcile === true, allowInsert: body && body.allowInsert === true,
    expectedToken: body && body.expectedToken, actor: String((body && (body.actor || body.updated_by)) || 'user'), now: procurementTimestamp_()
  };
  var deps = {
    acquireLock: function () { return lock.tryLock(30000); },   // 30s — established project convention
    releaseLock: function () { lock.releaseLock(); },
    reloadSnapshot: function () { built = rprBuildSheetSet_(ss, tables); return KMPR.loadDraftSnapshot(built.set, draftId, type); },
    recomputeToken: function (snap) {
      var dv = snap.draft ? snap.draft.draft_version : 1;
      return KMPR.computeExpectedToken(dv, (snap.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
    },
    applyEdits: function (cmd) {
      var before = {};
      for (var i = 0; i < tables.length; i++) before[tables[i]] = built.set[tables[i]].rows.map(function (r) { return r.slice(); });
      var r = KMPR.applyUserDecisionEdits(built.set, cmd, { now: cmd.now, actor: cmd.actor });
      if (r.status === 'APPLIED') { rpoKeyedDeltaWrite_(built.meta, built.set, before, tables); }  // keyed-delta only (24_ helper)
      return r;
    }
  };
  var result = KMUE.runUserDecisionEdit(command, deps);
  return jsonResponse_({ success: result.success, data: result });
}
