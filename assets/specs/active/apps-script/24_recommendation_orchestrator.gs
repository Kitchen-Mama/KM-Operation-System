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
function rpoValidateSchema_(ss, recommendationType) {
  var expectedId = (typeof RECOMMENDATION_TARGET_SPREADSHEET_ID_ !== 'undefined') ? RECOMMENDATION_TARGET_SPREADSHEET_ID_ : '';
  // F1-7N-FA-3C-PRE3-R3 — scope the authorized-schema gate to the tables THIS type writes (+ run journal). Without a
  // type it still validates all authorized tables (unchanged). This stops an unrelated WEEKLY_SHIPPING
  // (shipping_allocation_*) schema from hard-gating a MONTHLY_ORDER request-order draft that never touches it.
  return KMPW.assertAuthorizedSchemasReady(ss, { expectedSpreadsheetId: expectedId, recommendationType: recommendationType });   // throws if not provisioned/valid
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
  // F1-7N-FA-3C-R2b-2 — MONTHLY_ORDER flat V2 cutover dispatch (DEFAULT OFF). When the cutover flag is on (R4 only),
  // MONTHLY_ORDER routes through the KMRDV2/KMRDV2P flat SHAPE ADAPTER (ONE 53-col row, no child lines) reusing the
  // SAME shared governance (LockService + recommendation_calculation_runs journal + optimistic token). WEEKLY_SHIPPING
  // and the flag-off MONTHLY line path are byte-identical to before this round.
  if (type === 'MONTHLY_ORDER' && typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function' && requestOrderDraftV2FlatCutoverEnabled_()) {
    return rpoGenerateMonthlyFlatResult_(body, opts);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // Production Safety Round S0: fail closed BEFORE any lock/write if the target Spreadsheet is wrong or any
  // authorized table schema is missing/blank/malformed. Never creates or repairs a Sheet (RULE S0-2/S0-5).
  if (!(opts && opts.skipSchemaValidation === true)) {
    try { rpoValidateSchema_(ss, type); }
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

// F1-7N-FA-3C-R2b-2 — MONTHLY_ORDER flat V2 locked generate core (cutover-gated; see rpoGenerateRecommendationDraft-
// LockedResult_). Mirrors the line path's governance EXACTLY — validate the flat V2 schema, resolve facts, then run
// LockService + optimistic token + recommendation_calculation_runs journal + keyed-delta write — but persists ONE
// flat 53-col request_order_allocation_drafts row via the KMRDV2P SHAPE ADAPTER and NEVER touches the child-line
// table. WEEKLY_SHIPPING never reaches here. No algorithm is authored here — shape/lifecycle delegate to KMRDV2(P).
function rpoFlatBundle_() {
  if (typeof KMRDV2 === 'undefined' || typeof KMRDV2P === 'undefined') {
    throw new Error('MONTHLY_ORDER flat V2 bundle (KMRDV2/KMRDV2P) is not present — 90_generated_supply_planning_bundle.gs must be loaded.');
  }
}
// Shared MONTHLY flat helpers (reused by generation 24_, edit/token 25_, submit 15_ — one governance path, no forks).
function rpoFlatTables_() { return [KMRDV2P.HEADER_TABLE, KMPR.RUN_JOURNAL_TABLE]; }
function rpoFlatSchemaGate_(ss) {   // Production Safety S0 — flat V2 authorized-table set (53-col drafts + run journal only); throws fail-closed.
  var expectedId = (typeof RECOMMENDATION_TARGET_SPREADSHEET_ID_ !== 'undefined') ? RECOMMENDATION_TARGET_SPREADSHEET_ID_ : '';
  return KMPW.assertAuthorizedSchemasReady(ss, { expectedSpreadsheetId: expectedId, tableSpecsOverride: KMRDV2P.v2TableSpecs() });
}
function rpoFlatLoadActive_(ss, query) { var b = rprBuildSheetSet_(ss, [KMRDV2P.HEADER_TABLE]); return KMRDV2P.loadActiveFlat(b.set, query); }
function rpoFlatLoadById_(ss, draftId) { var b = rprBuildSheetSet_(ss, [KMRDV2P.HEADER_TABLE]); return KMRDV2P.loadFlatById(b.set, draftId); }
function rpoFlatTokenForDraft_(ss, draftId) { var b = rprBuildSheetSet_(ss, [KMRDV2P.HEADER_TABLE]); return KMRDV2P.tokenForDraft(b.set, draftId); }
// The ONE flat locked-apply: LockService → reload flat set UNDER the lock → KMRDV2P.applyFlat (single row + shared
// run journal, NO child lines) → keyed-delta write-back. Mirrors the line engine's governance exactly.
// F1-7N-FA-3C-R5C-P0 — TRUTHFUL WRITE-RESULT SEMANTICS. Attach an explicit writeOutcome to the applyFlat result so a
// COMMITTED-but-unverified write (post-write roundtrip failed) is NEVER reported as a clean success and NEVER as a
// silent GENERATION_FAILED: WRITE_NOT_STARTED (no lock / nothing persisted) · WRITE_REJECTED (token/dup conflict, no
// write) · WRITE_COMMITTED_VERIFIED (row written + id/cycle roundtrip-verified) · WRITE_COMMITTED_READBACK_FAILED
// (row committed but readback failed → surface the committed id + requiresReconciliation; blind retry is prohibited,
// the deterministic id keeps a re-run idempotent). The keyed-delta writer performs the id/cycle text-format + roundtrip.
function rpoFlatLockedApply_(ss, plan, expectedToken, opts) {
  var tables = rpoFlatTables_();
  var lock = LockService.getScriptLock();
  var got = lock.tryLock(30000);
  if (!got) return { runStatus: 'FAILED', wrote: false, reason: 'LOCK_NOT_ACQUIRED', writeOutcome: 'WRITE_NOT_STARTED' };
  try {
    var built = rprBuildSheetSet_(ss, tables);
    var before = {}; for (var i = 0; i < tables.length; i++) before[tables[i]] = built.set[tables[i]].rows.map(function (r) { return r.slice(); });
    var resR = KMRDV2P.applyFlat(built.set, plan, expectedToken, opts || {});
    if (resR && resR.wrote === true && resR.runStatus === 'COMPLETED') {
      var wres = rpoKeyedDeltaWrite_(built.meta, built.set, before, tables);
      if (wres && wres.verified === false) {
        resR.writeOutcome = 'WRITE_COMMITTED_READBACK_FAILED';
        resR.requiresReconciliation = true;
        resR.committedDraftId = plan.draftId;
        resR.readbackFailures = wres.readbackFailures || [];
      } else {
        resR.writeOutcome = 'WRITE_COMMITTED_VERIFIED';
        resR.committedDraftId = plan.draftId;
      }
    } else if (resR && resR.conflict) {
      resR.writeOutcome = 'WRITE_REJECTED';
    } else if (resR) {
      resR.writeOutcome = resR.writeOutcome || 'WRITE_NOT_STARTED';
    }
    return resR;
  } finally { lock.releaseLock(); }
}
// deps object shared by generateMonthlyFlat / editMonthlyFlat / submitMonthlyFlat / cancelMonthlyFlat.
function rpoFlatDeps_(ss, body) {
  return {
    loadActiveContext: function (q) { return rpoFlatLoadActive_(ss, q); },
    loadById: function (id) { return rpoFlatLoadById_(ss, id); },
    computeFacts: function () { return rpoResolveFacts_(body || {}); },
    lockedApply: function (plan, expectedToken, o) { return rpoFlatLockedApply_(ss, plan, expectedToken, o); }
  };
}
function rpoGenerateMonthlyFlatResult_(body, opts) {
  rpoBundle_(); rpoFlatBundle_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!(opts && opts.skipSchemaValidation === true)) {
    try { rpoFlatSchemaGate_(ss); }
    catch (e) { return { success: false, error: (e && e.message) || 'RECOMMENDATION_SCHEMA_NOT_READY', stage: 'schema_validation', schemaValidation: (e && e.schemaValidation) || null, resultShape: 'FLAT_V2' }; }
  }
  var result = KMRDV2P.generateMonthlyFlat({
    recommendationType: 'MONTHLY_ORDER', mode: body.mode, action: body.action, planningCycle: body.planningCycle,
    businessScope: body.businessScope, generationType: body.generationType,
    confirmRegenerateOverUserEdits: body.confirmRegenerateOverUserEdits === true,
    actor: (body.actor || body.updated_by || 'system'), now: procurementTimestamp_()
  }, rpoFlatDeps_(ss, body));
  // F1-7N-FA-3C-R5C-P0 — mark the FLAT V2 result shape (no data.status/coreAction; carries outcome/action/wrote and,
  // on a post-write roundtrip failure, result.writeOutcome). The per-SKU batch summarizer (recGenSummarizeDraftResult_)
  // routes on this marker so a committed flat write is classified truthfully (CREATED/…), never GENERATION_FAILED.
  if (result && typeof result === 'object') result.resultShape = 'FLAT_V2';
  return { success: result.success, data: result };
}
// Cutover-gated flat EDIT + SUBMIT + CANCEL locked cores (used by the 25_/15_ handlers when MONTHLY + cutover ON).
function rpoEditMonthlyFlatResult_(body) {
  rpoBundle_(); rpoFlatBundle_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { rpoFlatSchemaGate_(ss); } catch (e) { return { success: false, error: (e && e.message) || 'RECOMMENDATION_SCHEMA_NOT_READY', stage: 'schema_validation' }; }
  return KMRDV2P.editMonthlyFlat({
    draftId: String((body && body.draftId) || '').trim(), edits: (body && body.edits) || [],
    expectedToken: body && body.expectedToken, actor: String((body && (body.actor || body.updated_by)) || 'user'), now: procurementTimestamp_()
  }, rpoFlatDeps_(ss, body));
}
function rpoSubmitMonthlyFlatResult_(draftId, buckets, actor) {
  rpoBundle_(); rpoFlatBundle_();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { rpoFlatSchemaGate_(ss); } catch (e) { return { success: false, error: (e && e.message) || 'RECOMMENDATION_SCHEMA_NOT_READY', stage: 'schema_validation' }; }
  return KMRDV2P.submitMonthlyFlat({ draftId: String(draftId || '').trim(), buckets: buckets || null, actor: actor || 'request-order', now: procurementTimestamp_() }, rpoFlatDeps_(ss, {}));
}

// KEYED-DELTA write-back (§25): write ONLY the rows that changed + rows appended, via targeted setValues. Never
// a full-table rewrite. Preserves row order; unrelated rows are not touched.
// F1-7N-FA-3C-R5C-P0 — PERMANENT TEXT-FORMAT WRITE FIX. The flat V2 drafts table's request_allocation_draft_id and
// planning_cycle are STRING identity/cycle fields; a General-format cell coerces the canonical string "2026-08" into
// a Date (the R5C partial-commit incident: rows committed with planning_cycle as a Date). For ONLY the V2 drafts
// table under cutover=ON, force plain-text "@" on ONLY those two columns of ONLY the cells being written (updates +
// appends) BEFORE setValues, then flush + roundtrip-verify. Every other column (numeric qty/carton/version/tier) keeps
// its natural format; the legacy line path and every other table are byte-identical (isV2 stays false). No apostrophe
// prefixes; the primitive canonical string is written and verified to persist byte-verbatim.
function rpoKeyedDeltaWrite_(meta, set, before, tableNames) {
  var writeResult = { verified: true, table: null, committedDraftIds: [], readbackFailures: [] };
  var flatOn = (typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function') && requestOrderDraftV2FlatCutoverEnabled_() === true;
  var V2TABLE = (typeof KMRDV2P !== 'undefined' && KMRDV2P) ? KMRDV2P.HEADER_TABLE : null;
  for (var i = 0; i < tableNames.length; i++) {
    var name = tableNames[i], sh = meta[name], t = set[name], width = t.headers.length;
    var delta = KMORCH.computeKeyedDeltaWrites(before[name], t.rows);
    var isV2 = flatOn && V2TABLE && name === V2TABLE;
    var idCol = -1, cycleCol = -1;
    if (isV2) {
      idCol = t.headers.indexOf('request_allocation_draft_id');
      cycleCol = t.headers.indexOf('planning_cycle');
      if (idCol === -1 || cycleCol === -1) { isV2 = false; writeResult.verified = false; writeResult.table = name; writeResult.readbackFailures.push({ reason: 'V2_ID_OR_CYCLE_COLUMN_MISSING' }); }
    }
    for (var u = 0; u < delta.updates.length; u++) {
      var rowIdx1 = delta.updates[u].rowIndex + 2;
      if (isV2) { sh.getRange(rowIdx1, idCol + 1, 1, 1).setNumberFormat('@'); sh.getRange(rowIdx1, cycleCol + 1, 1, 1).setNumberFormat('@'); }
      sh.getRange(rowIdx1, 1, 1, width).setValues([delta.updates[u].values]);
    }
    if (delta.appends.length) {
      var appendStart1 = before[name].length + 2;
      if (isV2) { sh.getRange(appendStart1, idCol + 1, delta.appends.length, 1).setNumberFormat('@'); sh.getRange(appendStart1, cycleCol + 1, delta.appends.length, 1).setNumberFormat('@'); }
      sh.getRange(appendStart1, 1, delta.appends.length, width).setValues(delta.appends);
    }
    // POST-WRITE ROUNDTRIP (V2 only): flush, re-read the written id/cycle cells, require id byte-verbatim + cycle a
    // primitive canonical YYYY-MM string equal to the intended value. A committed row that fails readback is surfaced
    // (verified=false + committed ids) so the caller reports WRITE_COMMITTED_READBACK_FAILED — never a clean success,
    // never a silent GENERATION_FAILED. The write already committed; the deterministic id keeps a re-run idempotent.
    if (isV2 && (delta.updates.length || delta.appends.length)) {
      writeResult.table = name;
      try { SpreadsheetApp.flush(); } catch (e) {}
      rpoFlatVerifyWrittenRows_(sh, idCol, cycleCol, before[name].length, delta, writeResult);
    }
  }
  return writeResult;
}
// R5C-P0 post-write roundtrip verifier for the flat V2 drafts table — reads back ONLY the written id/cycle cells.
function rpoFlatVerifyWrittenRows_(sh, idCol, cycleCol, beforeCount, delta, writeResult) {
  var CANON = /^\d{4}-(0[1-9]|1[0-2])$/;
  function isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]'; }
  function checkRow_(rowIdx1, intendedId, intendedCycle) {
    var idCell = sh.getRange(rowIdx1, idCol + 1, 1, 1).getValues()[0][0];
    var cyCell = sh.getRange(rowIdx1, cycleCol + 1, 1, 1).getValues()[0][0];
    var idOk = (typeof idCell === 'string') && idCell === String(intendedId);
    var cyOk = (typeof cyCell === 'string') && CANON.test(cyCell) && cyCell === String(intendedCycle);
    if (idOk && cyOk) { writeResult.committedDraftIds.push(String(intendedId)); return; }
    writeResult.verified = false;
    writeResult.readbackFailures.push({
      draftId: String(intendedId), intendedCycle: String(intendedCycle),
      idType: (idCell === null || idCell === undefined) ? 'null' : (isDate_(idCell) ? 'Date' : typeof idCell),
      cycleType: (cyCell === null || cyCell === undefined) ? 'null' : (isDate_(cyCell) ? 'Date' : typeof cyCell),
      cycleRaw: isDate_(cyCell) ? (function () { try { return cyCell.toISOString(); } catch (e) { return String(cyCell); } })() : cyCell
    });
  }
  for (var u = 0; u < delta.updates.length; u++) { var vals = delta.updates[u].values; checkRow_(delta.updates[u].rowIndex + 2, vals[idCol], vals[cycleCol]); }
  for (var a = 0; a < delta.appends.length; a++) { checkRow_(beforeCount + 2 + a, delta.appends[a][idCol], delta.appends[a][cycleCol]); }
  return writeResult;
}
