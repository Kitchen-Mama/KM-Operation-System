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
      typeof KMPB === 'undefined' || typeof KMPPB === 'undefined' || typeof KMPC === 'undefined' ||
      typeof KMPS === 'undefined' || typeof KMSP === 'undefined' || typeof KMPW === 'undefined') {
    throw new Error('Recommendation bundle (KMORCH/KMPR/KMPL/KMPB/KMPPB/KMPC) is not present in this Apps Script ' +
      'project — Round 1G is a source mirror; the generated bundle 90_generated_supply_planning_bundle.gs must be ' +
      'loaded into the project. No algorithm is duplicated in this file.');
  }
}

// Production Safety Round S0 (RULE S0-2 / RULE S0-5, §8-B/§9): VALIDATE the authorized schemas — never create or
// repair. Enforces the exact configured Spreadsheet-ID gate, then validates all five authorized tables read-only
// via the bundled KMPW/KMSAFE. Throws fail-closed (RECOMMENDATION_SCHEMA_NOT_READY / WRONG_SPREADSHEET_TARGET) so
// the generate path performs ZERO mutation when the target is wrong or any table is missing/blank/malformed. The
// old auto-creating ensure helpers are INTENTIONALLY removed from this path (validate, never repair).
function rpoValidateSchema_(ss) {
  var expectedId = (typeof RECOMMENDATION_TARGET_SPREADSHEET_ID_ !== 'undefined') ? RECOMMENDATION_TARGET_SPREADSHEET_ID_ : '';
  return KMPW.assertAuthorizedSchemasReady(ss, { expectedSpreadsheetId: expectedId });   // throws if not provisioned/valid
}

// Production source-fact reader — WIRED (Round 1S-P2). Resolved facts come from the bundled read-only production
// source path: canonical Sheets → KMPS.readCanonicalSnapshots → KMSP Projection Runtime → KMSRP Production Reader
// → Reader/Integration/Ledger/Allocation/Resolver/Bridge. Caller-supplied `body.facts` still short-circuits
// (preview/manual). READ-ONLY: no write is invoked here — the historical `SOURCE_READER_PENDING` stub is replaced;
// it BLOCKS fail-closed (never fabricates data) only when the projection itself reports not-ready.
function rpoResolveFacts_(body) {
  if (body && body.facts && body.facts.lines) {
    return { lines: body.facts.lines, ready: body.facts.ready !== false, reason: body.facts.reason,
      formulaVersion: body.facts.formulaVersion, sourceDataAsOf: body.facts.sourceDataAsOf };
  }
  return KMPS.resolveProductionFacts(SpreadsheetApp.getActiveSpreadsheet(), body);   // bundled pure runtime; no formula here
}

// Router action: generateRecommendationDraftLocked. Thin wrapper — the compute returns a PLAIN result object so
// other backend owners (F1-4B-FM6-R4E2-B2 resumable scope job) can call it per SKU and introspect the outcome;
// only this public handler wraps it in the ContentService envelope (jsonResponse_ is opaque to backend callers).
function handleGenerateRecommendationDraftLocked_(body) {
  return jsonResponse_(rpoGenerateRecommendationDraftLockedResult_(body));
}

// PLAIN-result core of the locked generate path — returns { success, data|error, stage? } (NOT jsonResponse_).
// opts.skipSchemaValidation: a scope job validates the authorized schemas ONCE per continuation, then skips the
// per-SKU revalidation (the tables cannot change mid-continuation). Behavior is otherwise byte-identical to the
// single-SKU call; no algorithm here — delegates to KMPW.
function rpoGenerateRecommendationDraftLockedResult_(body, opts) {
  rpoBundle_();
  var type = body && body.recommendationType;
  if (!KMPR.TABLES[type]) return { success: false, error: 'unknown recommendationType', stage: 'input' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Production Safety Round S0: fail closed BEFORE any lock/write if the target Spreadsheet is wrong or any
  // authorized table schema is missing/blank/malformed. Never creates or repairs a Sheet (RULE S0-2/S0-5).
  if (!(opts && opts.skipSchemaValidation === true)) {
    try { rpoValidateSchema_(ss); }
    catch (e) { return { success: false, error: (e && e.message) || 'RECOMMENDATION_SCHEMA_NOT_READY', stage: 'schema_validation', schemaValidation: (e && e.schemaValidation) || null }; }
  }
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

  // Delegate to the bundled production writer composition (KMPW) — the SAME entry the Round 1S-P3 tests exercise
  // (KMPW wraps KMORCH.runRecommendationGeneration + labels the persistence outcome). No algorithm is authored here.
  var result = KMPW.persistProductionRecommendation({
    recommendationType: type, mode: body.mode, planningCycle: body.planningCycle, businessScope: body.businessScope,
    confirmRegenerateOverUserEdits: body.confirmRegenerateOverUserEdits === true,
    actor: (body.actor || body.updated_by || 'system'), now: procurementTimestamp_()
  }, deps);
  return { success: result.success, data: result };
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
