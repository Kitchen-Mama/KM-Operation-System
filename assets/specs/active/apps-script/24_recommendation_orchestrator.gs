/**
 * 24_recommendation_orchestrator.gs
 * Kitchen Mama Operation System — LOCKED Recommendation Generation orchestration entry point (Phase 2C, Round 1G).
 *
 * SOURCE MIRROR / NOT DEPLOYED. Thin Apps Script wrapper that runs the production recommendation-generation
 * bridge end-to-end by delegating ENTIRELY to the generated bundle (90_generated_supply_planning_bundle.gs):
 *   Plan Builder (KMPB) → Persistence Core (KMPC) → Persistence Plan Builder (KMPPB) → LockService + optimistic
 *   concurrency (KMPL) → keyed-delta repository apply (KMPR). No algorithm is authored here — the canonical logic
 *   lives in assets/js/core/*.js and is ported by assets/tools/build-apps-script-bundle.js.
 *
 * This route is the ONLY lock-enforced recommendation persistence write. It NEVER Submits / Sends Request /
 * creates a Weekly Plan or PO / mutates a terminal (submitted/cancelled) Draft. Legacy 15_/16_ unlocked writers
 * remain for compatibility; enforcing the locked path everywhere is a later round. Scheduler / Trigger are NOT
 * implemented here — this is a request-driven, callable entry point only.
 *
 * The write-back is KEYED-DELTA (only changed + appended rows via targeted setValues) — it NEVER uses the
 * full-table 23_ rprWriteBack_ helper (which stays reachable only from the unlocked source-mirror path).
 */

// Guard: every bundle namespace the orchestrator needs must be present (fails closed when the bundle is absent).
function rpoBundle_() {
  if (typeof KMORCH === 'undefined' || typeof KMPR === 'undefined' || typeof KMPL === 'undefined' ||
      typeof KMPB === 'undefined' || typeof KMPPB === 'undefined' || typeof KMPC === 'undefined') {
    throw new Error('Recommendation bundle (KMORCH/KMPR/KMPL/KMPB/KMPPB/KMPC) is not present in this Apps Script ' +
      'project — Round 1G is a source mirror; the generated bundle 90_generated_supply_planning_bundle.gs must be ' +
      'loaded into the project. No algorithm is duplicated in this file.');
  }
}

// Ensure additive line-provenance columns + the run-journal table exist (ADDITIVE only; never reorders/deletes).
function rpoEnsureSchema_(ss, type) {
  var cfg = KMPR.TABLES[type];
  procurementEnsureSheet_(ss, cfg.header, RPR_TABLE_HEADERS_[cfg.header]);
  var linesSheet = procurementEnsureSheet_(ss, cfg.lines, RPR_TABLE_HEADERS_[cfg.lines]);
  sheetEnsureColumns_(linesSheet, KMPR.LINE_ADDITIVE_HEADERS);            // user_edited, user_edited_by (idempotent)
  procurementEnsureSheet_(ss, KMPR.RUN_JOURNAL_TABLE, RECOMMENDATION_CALCULATION_RUNS_HEADERS_);
}

// Production source-fact reader — PENDING (§22). Until the calc/ledger/allocation → resolved-facts reader is
// wired, resolved facts must be supplied by the caller (preview/generate) via body.facts; otherwise the run
// BLOCKS with SOURCE_READER_PENDING. It NEVER fabricates data (no zero-filled draft).
function rpoResolveFacts_(body) {
  if (body && body.facts && body.facts.lines) {
    return { lines: body.facts.lines, ready: body.facts.ready !== false, reason: body.facts.reason,
      formulaVersion: body.facts.formulaVersion, sourceDataAsOf: body.facts.sourceDataAsOf };
  }
  return { lines: [], ready: false, reason: 'SOURCE_READER_PENDING' };
}

// Router action: generateRecommendationDraftLocked.
function handleGenerateRecommendationDraftLocked_(body) {
  rpoBundle_();
  var type = body && body.recommendationType;
  if (!KMPR.TABLES[type]) return jsonResponse_({ success: false, error: 'unknown recommendationType', stage: 'input' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  rpoEnsureSchema_(ss, type);
  var cfg = KMPR.TABLES[type], tables = [cfg.header, cfg.lines, KMPR.RUN_JOURNAL_TABLE];
  var query = { recommendationType: type, planningCycle: body.planningCycle, businessScope: body.businessScope };

  var deps = {
    loadActiveContext: function (q) { var b = rprBuildSheetSet_(ss, [cfg.header]); return KMPR.loadActiveDraftContext(b.set, q); },
    loadPriorSnapshot: function (id) { var b = rprBuildSheetSet_(ss, tables); return KMPR.loadDraftSnapshot(b.set, id, type); },
    computeFacts: function () { return rpoResolveFacts_(body); },
    lockedApply: function (plan, expectedToken, opts) {
      var lock = LockService.getScriptLock();
      var d2 = {
        validatePlan: function (p) { return KMPR.validatePersistencePlan(p); },
        acquireLock: function () { return lock.tryLock(30000); },     // 30s — established project convention
        releaseLock: function () { lock.releaseLock(); },
        loadActiveDraftContext: function () { var b = rprBuildSheetSet_(ss, [cfg.header]); return KMPR.loadActiveDraftContext(b.set, query); },
        reloadSnapshot: function () { d2._built = rprBuildSheetSet_(ss, tables); return KMPR.loadDraftSnapshot(d2._built.set, plan.draftId, type); },
        recomputeToken: function (snap) {
          var dv = snap.draft ? snap.draft.draft_version : plan.draftVersion;
          return KMPR.computeExpectedToken(dv, (snap.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
        },
        applyPlan: function (tok, o) {
          var built = d2._built;                                     // reloaded UNDER the lock (never the pre-lock read)
          var before = {};
          for (var i = 0; i < tables.length; i++) before[tables[i]] = built.set[tables[i]].rows.map(function (r) { return r.slice(); });
          var resR = KMPR.applyPersistencePlan(built.set, plan, tok, o || opts || {});
          if (!resR.conflict && resR.runStatus !== 'FAILED') { rpoKeyedDeltaWrite_(built.meta, built.set, before, tables); }
          return resR;
        }
      };
      return KMPL.executeLockedPersistence({ plan: plan, expectedToken: expectedToken, opts: opts, generationType: opts.generationType, deps: d2 });
    }
  };

  var result = KMORCH.runRecommendationGeneration({
    recommendationType: type, mode: body.mode, planningCycle: body.planningCycle, businessScope: body.businessScope,
    confirmRegenerateOverUserEdits: body.confirmRegenerateOverUserEdits === true,
    actor: (body.actor || body.updated_by || 'system'), now: procurementTimestamp_()
  }, deps);
  return jsonResponse_({ success: result.success, data: result });
}

// KEYED-DELTA write-back (§25): write ONLY the rows that changed + rows appended, via targeted setValues. Never
// a full-table rewrite. Preserves row order; unrelated rows are not touched.
function rpoKeyedDeltaWrite_(meta, set, before, tableNames) {
  for (var i = 0; i < tableNames.length; i++) {
    var name = tableNames[i], sh = meta[name], t = set[name], width = t.headers.length;
    var delta = KMORCH.computeKeyedDeltaWrites(before[name], t.rows);
    for (var u = 0; u < delta.updates.length; u++) {
      sh.getRange(delta.updates[u].rowIndex + 2, 1, 1, width).setValues([delta.updates[u].values]);
    }
    if (delta.appends.length) { sh.getRange(before[name].length + 2, 1, delta.appends.length, width).setValues(delta.appends); }
  }
}
