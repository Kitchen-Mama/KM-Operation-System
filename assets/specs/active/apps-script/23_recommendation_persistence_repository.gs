/**
 * 23_recommendation_persistence_repository.gs
 * Kitchen Mama Operation System — Recommendation Persistence production REPOSITORY (Phase 2C, Round 1D).
 *
 * SOURCE MIRROR / NOT DEPLOYED. Thin Apps Script adapter over the CANONICAL, fake-sheet TEST-VERIFIED pure
 * module `assets/js/core/supply-planning-persistence-repository.js` (Node tests:
 * assets/tests/supply-planning-persistence-repository.test.js, 74 assertions). The algorithm (Active-Draft
 * reader, snapshot reader, incomplete-run reader, PersistencePlan validation + application, {draft_version,
 * userEditFingerprint} token, natural-key upsert, run-stage journal, idempotent replay) is authored ONCE in
 * that .js module and is NOT duplicated here — this file only (a) defines the additive schema and (b) does
 * Sheet I/O: read rows into the plain { headers, rows } "sheet set" the pure module consumes, delegate, and
 * write the mutated tables back. In the Apps Script project the pure module is provided as a deploy-time port
 * exposed on the global `KMPR` namespace (that port is NOT created in Round 1D — deploy is out of scope).
 *
 * Round 1D implements Slice 1 (schema + readers + plan validation/application + run journal). It does NOT
 * implement: LockService (next round), Scheduler/Trigger, the recommendation calc engine, the B-5 Request
 * writer, Weekly-Plan promotion, or Submit. WITHOUT LockService, applyPersistencePlan is NOT race-safe.
 */

// ---- additive / new schema (Round 1D §Persist-Adapter PA-5/PA-6) ------------
var RECOMMENDATION_CALCULATION_RUNS_HEADERS_ = [
  'calculation_run_id', 'recommendation_type', 'draft_id', 'planning_cycle', 'business_scope_key',
  'draft_version', 'run_status', 'current_stage', 'formula_version', 'source_data_as_of',
  'started_by', 'started_at', 'completed_by', 'completed_at', 'error_summary', 'attempt_count'
];
// Additive line-table columns (also appended in 15_/16_ header arrays); ensured via sheetEnsureColumns_.
var RECOMMENDATION_LINE_ADDITIVE_HEADERS_ = ['user_edited', 'user_edited_by'];

var RPR_TABLE_HEADERS_ = {
  'shipping_allocation_drafts': (typeof SHIPPING_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined') ? SHIPPING_ALLOCATION_DRAFTS_HEADERS_ : null,
  'shipping_allocation_draft_lines': (typeof SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ !== 'undefined') ? SHIPPING_ALLOCATION_DRAFT_LINES_HEADERS_ : null,
  'request_order_allocation_drafts': (typeof REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_ !== 'undefined') ? REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_ : null,
  'request_order_allocation_draft_lines': (typeof REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_ !== 'undefined') ? REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_ : null,
  'recommendation_calculation_runs': RECOMMENDATION_CALCULATION_RUNS_HEADERS_
};

function rprPureModule_() {
  if (typeof KMPR === 'undefined') {
    throw new Error('Recommendation persistence pure module (KMPR) is not present in this Apps Script project ' +
      '— Round 1D is a source mirror; deploy-time port of supply-planning-persistence-repository.js is pending.');
  }
  return KMPR;
}

// Read a Sheet into the pure module's { headers, rows } shape (deterministic row order preserved).
function rprReadTable_(ss, name) {
  var headers = RPR_TABLE_HEADERS_[name];
  if (!headers) throw new Error('unknown recommendation table: ' + name);
  var sh = procurementEnsureSheet_(ss, name, headers);
  sheetEnsureColumns_(sh, headers);   // additive ensure (never reorders/removes)
  var values = sh.getDataRange().getValues();
  var head = (values[0] || headers).map(function (h) { return String(h).trim(); });
  return { sheet: sh, headers: head, rows: values.slice(1) };
}
function rprBuildSheetSet_(ss, tableNames) {
  var set = {}, meta = {};
  for (var i = 0; i < tableNames.length; i++) {
    var t = rprReadTable_(ss, tableNames[i]);
    set[tableNames[i]] = { headers: t.headers, rows: t.rows.map(function (r) { return r.slice(); }) };
    meta[tableNames[i]] = t.sheet;
  }
  return { set: set, meta: meta };
}
// Write mutated tables back (full-table setValues — a source-mirror simplification; a keyed delta write is a
// future optimization). Terminal rows are never removed because the pure module only supersedes (never deletes).
function rprWriteBack_(meta, set, tableNames) {
  for (var i = 0; i < tableNames.length; i++) {
    var name = tableNames[i], sh = meta[name], t = set[name];
    var out = [t.headers].concat(t.rows);
    sh.getRange(1, 1, out.length, t.headers.length).setValues(out);
  }
}

// ---- repository public operations (contract PA-2) --------------------------
function loadActiveDraftContext(query) {
  var K = rprPureModule_(), ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = K.TABLES[query.recommendationType]; if (!cfg) return jsonResponse_({ success: false, error: 'unknown recommendationType' });
  var built = rprBuildSheetSet_(ss, [cfg.header]);
  return jsonResponse_({ success: true, data: K.loadActiveDraftContext(built.set, query) });
}
function loadDraftSnapshot(draftId, recommendationType) {
  var K = rprPureModule_(), ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = K.TABLES[recommendationType]; if (!cfg) return jsonResponse_({ success: false, error: 'unknown recommendationType' });
  var built = rprBuildSheetSet_(ss, [cfg.header, cfg.lines, K.RUN_JOURNAL_TABLE]);
  return jsonResponse_({ success: true, data: K.loadDraftSnapshot(built.set, draftId, recommendationType) });
}
function loadIncompleteRun(draftId) {
  var K = rprPureModule_(), ss = SpreadsheetApp.getActiveSpreadsheet();
  var built = rprBuildSheetSet_(ss, [K.RUN_JOURNAL_TABLE]);
  return jsonResponse_({ success: true, data: K.loadIncompleteRun(built.set, draftId) });
}
function applyPersistencePlan(plan, expectedToken, opts) {
  var K = rprPureModule_(), ss = SpreadsheetApp.getActiveSpreadsheet();
  var cfg = K.TABLES[plan && plan.recommendationType]; if (!cfg) return jsonResponse_({ success: false, error: 'unknown recommendationType' });
  var tables = [cfg.header, cfg.lines, K.RUN_JOURNAL_TABLE];
  var built = rprBuildSheetSet_(ss, tables);
  // NOTE: no LockService yet (Round 1D) — this read→apply→write is NOT race-safe. LockService = next round.
  var result = K.applyPersistencePlan(built.set, plan, expectedToken, opts || {});
  if (!result.conflict && result.runStatus !== 'FAILED') { rprWriteBack_(built.meta, built.set, tables); }
  return jsonResponse_({ success: !result.conflict && result.runStatus !== 'FAILED', data: result });
}
