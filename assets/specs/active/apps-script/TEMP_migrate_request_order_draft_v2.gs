/**
 * TEMP_migrate_request_order_draft_v2.gs — F1-7N-FA-3C-DRAFT-MODEL-R4 (paste-ready, USER-run migration tooling).
 *
 * PASTE-READY / NOT PERMANENT RUNTIME. The USER pastes these into the bound Apps Script project (which must already
 * have the R4 bundle 90_ synced so KMRDV2 / KMRDV2P are present) and runs them ONCE during the R4 maintenance window
 * to build the flat V2 staging tab — WITHOUT hand-transforming 26 records. After the swap + acceptance they are removed.
 *
 * RUN THESE from the Apps Script Run dropdown (no arguments; the three public entrypoints below do NOT end with
 * `_`, so they appear in the Run menu — the private core ends with `_` and is intentionally hidden):
 *   TEMP_R4_DRY_RUN_RequestOrderDraftV2()          — DRY RUN (execute:false): reads only, logs plan/report, writes NOTHING.
 *   TEMP_R4_EXECUTE_RequestOrderDraftV2()          — EXECUTE (execute:true): writes request_order_allocation_drafts_v2 ONLY.
 *   TEMP_R4_VALIDATE_RequestOrderDraftV2Staging()  — READ-ONLY: independently verify the staging tab before the swap.
 * Run order: DRY RUN → (architect verifies the log) → EXECUTE → VALIDATE. Never jump straight to EXECUTE.
 *
 * Private core (trailing `_`, hidden from the Run menu):
 *   TEMP_migrateRequestOrderDraftV2_({execute})    — build request_order_allocation_drafts_v2 from the legacy tabs.
 *       execute:false (DEFAULT — any missing/omitted opts stays DRY RUN) = reads only, writes NOTHING.
 *       execute:true = write the staging tab ONLY (53 headers + the 26 flat rows). Nothing else.
 *   TEMP_validateRequestOrderDraftV2Staging_()      — READ-ONLY staging validator.
 *
 * SAFETY (enforced in code): it reads only request_order_allocation_drafts + request_order_allocation_draft_lines and
 * writes only request_order_allocation_drafts_v2. It NEVER mutates the legacy tabs, NEVER renames/deletes any tab,
 * NEVER flips the cutover flag, NEVER deploys/syncs. All migration/flatten/classify semantics come from the frozen
 * KMRDV2 / KMRDV2P authority (no second algorithm). The final canonical tab rename stays a USER step.
 */

// ---- USER-runnable public entrypoints (no arguments; visible in the Apps Script Run dropdown) -----------------
// EXECUTE is the ONLY path that can enter a staging write, and it passes execute:true explicitly — so a Run with a
// forgotten argument can never silently fall into an ambiguous mode.
function TEMP_R4_DRY_RUN_RequestOrderDraftV2() { return TEMP_migrateRequestOrderDraftV2_({ execute: false }); }
function TEMP_R4_EXECUTE_RequestOrderDraftV2() { return TEMP_migrateRequestOrderDraftV2_({ execute: true }); }
function TEMP_R4_VALIDATE_RequestOrderDraftV2Staging() { return TEMP_validateRequestOrderDraftV2Staging_(); }
// F1-7N-FA-3C-R4B2 — READ-ONLY per-ID cycle/status authority diagnostic over ALL 26 actionable rows. Writes NOTHING.
function TEMP_R4_AUDIT_ALL_26_RequestOrderDraftV2() { return TEMP_auditAll26RequestOrderDraftV2_(); }

// Accepted R3 shape — the migration HALTs (R4_LIVE_DATA_DRIFT_FROM_R3) if the live set no longer matches.
var TEMP_R4_EXPECT_ = { TOTAL_HEADERS: 124, ACTIONABLE: 26, ALL_ZERO: 98, NEEDS_MANUAL_REVIEW: 0, BLOCKED_CONFLICT: 0,
  ORPHAN_LINES: 0, DUPLICATE_T1: 0, DUPLICATE_T2: 0, DUPLICATE_T3: 0, T4_PRESENT: 0, SUBMITTED: 20 };
var TEMP_V2_STAGING_TAB_ = 'request_order_allocation_drafts_v2';
var TEMP_V2_SOURCE_HEADER_TAB_ = 'request_order_allocation_drafts';
var TEMP_V2_SOURCE_LINE_TAB_ = 'request_order_allocation_draft_lines';
var TEMP_V2_SOURCE_RUN_TAB_ = 'recommendation_calculation_runs';   // R4B2 read-only calc-run join (optional; never written)

function TEMP_r4Bundle_() {
  if (typeof KMRDV2 === 'undefined' || typeof KMRDV2P === 'undefined') {
    throw new Error('R4 migration needs the V2 bundle (KMRDV2/KMRDV2P) — sync 90_generated_supply_planning_bundle.gs first.');
  }
}
function TEMP_readObjects_(name) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return { present: false, headers: [], rows: [] };
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 1) return { present: true, headers: [], rows: [] };
  var headers = values[0].map(function (h) { return String(h).trim(); }), rows = [];
  for (var r = 1; r < values.length; r++) {
    var o = {}, blank = true;
    for (var c = 0; c < headers.length; c++) { o[headers[c]] = values[r][c]; if (String(values[r][c]).trim() !== '') blank = false; }
    if (!blank) rows.push(o);
  }
  return { present: true, headers: headers, rows: rows };
}
function TEMP_buildSource_() {
  var H = TEMP_readObjects_(TEMP_V2_SOURCE_HEADER_TAB_), L = TEMP_readObjects_(TEMP_V2_SOURCE_LINE_TAB_);
  var lbd = {};
  L.rows.forEach(function (l) { var id = String(l.request_allocation_draft_id || '').trim(); (lbd[id] = lbd[id] || []).push(l); });
  return { headers: H.rows, headerTab: H, lineTab: L, linesByDraftId: lbd };
}

function TEMP_migrateRequestOrderDraftV2_(opts) {
  TEMP_r4Bundle_();
  var execute = !!(opts && opts.execute === true);   // DEFAULT dry-run
  var src = TEMP_buildSource_();
  var plan = KMRDV2P.planMigration(src.headers, src.linesByDraftId, { expect: TEMP_R4_EXPECT_ });
  if (!plan.ok) { Logger.log('MIGRATION HALTED: ' + plan.halt + '\n' + JSON.stringify(plan.drift || plan, null, 2)); return plan; }

  // sample source->target mappings (1 active RD / 1 active RAD / 1 submitted RD / 1 submitted RAD when available)
  function fam(id) { return /^RD::/.test(id) ? 'RD' : (/^RAD-/.test(id) ? 'RAD' : 'OTHER'); }
  var samples = {}; plan.stagingRows.forEach(function (r) {
    var key = (String(r.status) === 'submitted' ? 'SUBMITTED_' : 'ACTIVE_') + fam(r.request_allocation_draft_id);
    if (!samples[key]) samples[key] = { id: r.request_allocation_draft_id, status: r.status, planning_cycle: r.planning_cycle, sku: r.sku, t1_order_qty: r.t1_order_qty, t2_order_qty: r.t2_order_qty, t3_order_qty: r.t3_order_qty };
  });
  var out = { mode: execute ? 'EXECUTE' : 'DRY_RUN', SOURCE_HEADERS: src.headers.length, SOURCE_LINES: src.lineTab.rows.length,
    report: plan.report, samples: samples, staging_tab: TEMP_V2_STAGING_TAB_ };

  if (!execute) { Logger.log('DRY RUN — no mutation.\n' + JSON.stringify(out, null, 2)); return out; }

  // EXECUTE: write the staging tab ONLY. Fail closed if it already exists non-empty / wrong schema.
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existing = ss.getSheetByName(TEMP_V2_STAGING_TAB_);
  if (existing) {
    var ev = existing.getDataRange().getValues();
    var emptyOrHeaderOnly = ev.length <= 1;
    var headerMatches = ev.length >= 1 && ev[0].map(function (x) { return String(x).trim(); }).join('|') === plan.stagingHeaders.join('|');
    if (!(emptyOrHeaderOnly && (ev.length === 0 || headerMatches))) {
      Logger.log('ABORT: ' + TEMP_V2_STAGING_TAB_ + ' already exists with data/other schema. Remove or rename it first.');
      return { ok: false, halt: 'STAGING_TAB_NOT_EMPTY' };
    }
    existing.clear();
  }
  var sh = existing || ss.insertSheet(TEMP_V2_STAGING_TAB_);
  var headers = plan.stagingHeaders;
  var matrix = [headers].concat(plan.stagingRows.map(function (row) { return headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; }); }));
  sh.getRange(1, 1, matrix.length, headers.length).setValues(matrix);
  out.written_rows = plan.stagingRows.length; out.written_headers = headers.length;
  Logger.log('EXECUTE — wrote ' + plan.stagingRows.length + ' rows to ' + TEMP_V2_STAGING_TAB_ + '. Legacy tabs untouched.\n' + JSON.stringify(out, null, 2));
  return out;
}

function TEMP_validateRequestOrderDraftV2Staging_() {
  TEMP_r4Bundle_();
  var stg = TEMP_readObjects_(TEMP_V2_STAGING_TAB_);
  if (!stg.present) { Logger.log('staging tab absent'); return { READY_FOR_SWAP: 'NO', reason: 'STAGING_ABSENT' }; }
  var src = TEMP_buildSource_();
  var v = KMRDV2P.validateStaging(stg.headers, stg.rows, src.headers, src.linesByDraftId, { expectRows: TEMP_R4_EXPECT_.ACTIONABLE });
  Logger.log(JSON.stringify(v, null, 2));
  return v;
}

// ---- R4B2 READ-ONLY diagnostic helpers -----------------------------------------------------------------------
var TEMP_MONTH3_ = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function TEMP_pad2_(n) { return (n < 10 ? '0' + n : String(n)); }
function TEMP_isDate_(v) { return Object.prototype.toString.call(v) === '[object Date]' || (v && typeof v === 'object' && typeof v.getMonth === 'function' && typeof v.getFullYear === 'function'); }
// Deterministic classification of ONE raw planning_cycle value — parses ONLY from the stored value, never the clock.
// Returns { rawType, isDate, iso, classification, proposedCycle|null, note }. Ambiguous/invalid → *_UNRESOLVED / EVIDENCE_CONFLICT.
function TEMP_classifyCycle_(raw) {
  var out = { rawType: (raw === null ? 'null' : typeof raw), isDate: false, iso: '', classification: 'INVALID_UNRESOLVED', proposedCycle: null, note: '' };
  if (raw === null || raw === undefined || raw === '') { out.classification = 'INVALID_UNRESOLVED'; out.note = 'blank'; return out; }
  if (TEMP_isDate_(raw)) {
    out.isDate = true; out.rawType = 'Date';
    // A Date OBJECT's calendar month is timezone-dependent (getMonth local vs getUTCMonth) — a midnight boundary can
    // straddle two months. That is genuinely AMBIGUOUS from the value alone, so R4B2 does NOT auto-propose a month
    // for a Date OBJECT; it records both interpretations for the architect. (R4C will resolve with an explicit tz.)
    try { out.iso = raw.toISOString(); } catch (e) { out.iso = ''; }
    var loc = TEMP_pad2_((raw.getMonth ? raw.getMonth() : 0) + 1), locY = raw.getFullYear ? raw.getFullYear() : 0;
    var utc = TEMP_pad2_((raw.getUTCMonth ? raw.getUTCMonth() : 0) + 1), utcY = raw.getUTCFullYear ? raw.getUTCFullYear() : 0;
    if (locY === utcY && loc === utc) { out.classification = 'DATE_PARSE_APPROVED'; out.proposedCycle = locY + '-' + loc; out.note = 'Date object, month unambiguous across tz'; }
    else { out.classification = 'EVIDENCE_CONFLICT'; out.note = 'Date object month is timezone-ambiguous: local=' + locY + '-' + loc + ' utc=' + utcY + '-' + utc; }
    return out;
  }
  if (typeof raw === 'number') {
    if (raw >= 1900 && raw <= 2999 && Math.floor(raw) === raw) { out.classification = 'YEAR_ONLY_UNRESOLVED'; out.note = 'numeric year only; month lost'; }
    else { out.classification = 'INVALID_UNRESOLVED'; out.note = 'unrecognized numeric'; }
    return out;
  }
  var s = String(raw).trim();
  var mYm = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (mYm) { var mo = Number(mYm[2]); if (mo >= 1 && mo <= 12) { out.classification = 'CANONICAL_ALREADY'; out.proposedCycle = mYm[1] + '-' + TEMP_pad2_(mo); } else { out.classification = 'INVALID_UNRESOLVED'; out.note = 'month out of range'; } return out; }
  var mIso = /^(\d{4})-(\d{2})-\d{2}/.exec(s);
  if (mIso) { out.classification = 'DATE_PARSE_APPROVED'; out.proposedCycle = mIso[1] + '-' + mIso[2]; out.iso = s; out.note = 'ISO date string'; return out; }
  // localized Date string e.g. "Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)" — literal month-name + year tokens.
  var mLoc = /\b([A-Za-z]{3})[a-z]*\s+\d{1,2}\s+(\d{4})\b/.exec(s) || /\b([A-Za-z]{3})[a-z]*\s+(\d{4})\b/.exec(s);
  if (mLoc && TEMP_MONTH3_[mLoc[1].toLowerCase()]) { out.classification = 'DATE_PARSE_APPROVED'; out.proposedCycle = mLoc[2] + '-' + TEMP_pad2_(TEMP_MONTH3_[mLoc[1].toLowerCase()]); out.note = 'localized Date string (literal month-name token)'; return out; }
  if (/^\d{4}$/.test(s)) { out.classification = 'YEAR_ONLY_UNRESOLVED'; out.note = 'year-only string; month lost'; return out; }
  out.classification = 'INVALID_UNRESOLVED'; out.note = 'unrecognized string'; return out;
}
function TEMP_idFamily_(id) { var s = String(id || ''); return /^RD::/.test(s) ? 'RD' : (/^RAD-/.test(s) ? 'RAD' : 'OTHER'); }
function TEMP_canonStatus_(raw) {   // D1: site_confirmed→draft; submitted/cancelled verbatim; else UNKNOWN (would HALT in R4C)
  var s = String(raw || '').trim();
  if (s === 'submitted' || s === 'cancelled' || s === 'draft' || s === 'partially_submitted') return s;
  if (s === 'site_confirmed') return 'draft';
  return 'UNKNOWN_STATUS_HALT';
}

// The public entrypoint's body — reads ONLY the legacy tabs (+ run journal for the join). Writes NOTHING.
function TEMP_auditAll26RequestOrderDraftV2_() {
  TEMP_r4Bundle_();
  var src = TEMP_buildSource_();
  var plan = KMRDV2P.planMigration(src.headers, src.linesByDraftId, { expect: TEMP_R4_EXPECT_ });
  if (!plan.ok) { Logger.log('AUDIT HALTED (drift/shape): ' + plan.halt + '\n' + JSON.stringify(plan.drift || plan, null, 2)); return { halt: plan.halt, drift: plan.drift || null, summary: plan.summary || null }; }

  // exact 26 migrated ids (deterministic selection) → map back to the RAW legacy header (preserves JS type/Date).
  var migratedIds = plan.stagingRows.map(function (r) { return String(r.request_allocation_draft_id); });
  var headerById = {}; src.headers.forEach(function (h) { headerById[String(h.request_allocation_draft_id)] = h; });
  var runs = TEMP_readObjects_(TEMP_V2_SOURCE_RUN_TAB_ || 'recommendation_calculation_runs');
  var runsById = {}; if (runs.present) runs.rows.forEach(function (r) { var id = String(r.calculation_run_id || ''); (runsById[id] = runsById[id] || []).push(r); });

  var rows = [], seen = {}, dup = 0;
  var cls = { CANONICAL_ALREADY: 0, DATE_PARSE_APPROVED: 0, YEAR_ONLY_UNRESOLVED: 0, INVALID_UNRESOLVED: 0, EVIDENCE_CONFLICT: 0 };
  var statusCounts = {}, unresolvedIds = [], activeUnresolved = 0, submittedUnresolved = 0;
  migratedIds.forEach(function (id, i) {
    if (seen[id]) dup++; seen[id] = 1;
    var h = headerById[id] || {}, lines = src.linesByDraftId[id] || [], byB = {};
    lines.forEach(function (l) { byB[String(l.request_bucket).toUpperCase()] = l; });
    var cyc = TEMP_classifyCycle_(h.planning_cycle);
    var rawStatus = String(h.status || '').trim(), canonStatus = TEMP_canonStatus_(rawStatus);
    cls[cyc.classification] = (cls[cyc.classification] || 0) + 1;
    statusCounts[rawStatus || '(blank)'] = (statusCounts[rawStatus || '(blank)'] || 0) + 1;
    var unresolvedCycle = (cyc.classification === 'YEAR_ONLY_UNRESOLVED' || cyc.classification === 'INVALID_UNRESOLVED' || cyc.classification === 'EVIDENCE_CONFLICT');
    var isActive = (canonStatus === 'draft' || canonStatus === 'partially_submitted');
    if (unresolvedCycle) { unresolvedIds.push({ id: id, status: rawStatus, rawCycle: h.planning_cycle, rawType: cyc.rawType, classification: cyc.classification }); if (isActive) activeUnresolved++; else submittedUnresolved++; }
    // calc-run join (read-only, exact id)
    var runId = String(h.calculation_run_id || ''), runJoin = { calculation_run_id: runId, matched: 0, runPlanningCycle: null, note: '' };
    if (runId && runsById[runId]) { runJoin.matched = runsById[runId].length; var r0 = runsById[runId][0]; runJoin.runPlanningCycle = (r0.planning_cycle === undefined ? null : r0.planning_cycle); if (runJoin.matched > 1) runJoin.note = 'MULTIPLE_RUN_MATCH_CONFLICT'; }
    var rec = {
      seq: i + 1, request_allocation_draft_id: id, idFamily: TEMP_idFamily_(id),
      raw_planning_cycle: h.planning_cycle, raw_planning_cycle_type: cyc.rawType, isDate: cyc.isDate, iso: cyc.iso,
      raw_status: rawStatus, proposed_status: canonStatus,
      company: h.company, country: h.country, marketplace: h.marketplace, sku: h.sku, draft_purpose: h.draft_purpose,
      calculation_run_id: runId, created_at: h.created_at, updated_at: h.updated_at, submitted_at: h.submitted_at,
      T1: { month: (byB.T1 || {}).request_month, qty: (byB.T1 || {}).order_qty }, T2: { month: (byB.T2 || {}).request_month, qty: (byB.T2 || {}).order_qty }, T3: { month: (byB.T3 || {}).request_month, qty: (byB.T3 || {}).order_qty },
      calc_run_join: runJoin,
      cycle_evidence: { header_planning_cycle: { value: h.planning_cycle, source: 'HEADER' }, calc_run_planning_cycle: { value: runJoin.runPlanningCycle, source: 'RUN_JOURNAL' }, tier_months: { T1: (byB.T1 || {}).request_month, T2: (byB.T2 || {}).request_month, T3: (byB.T3 || {}).request_month, source: 'TIER_INFORMATIONAL_NOT_AUTHORITY' } },
      proposed_cycle: cyc.proposedCycle, cycle_classification: cyc.classification, cycle_note: cyc.note,
      risk: (unresolvedCycle ? (isActive ? 'ACTIVE_DUPLICATE_RISK' : 'TERMINAL_HISTORY_NONCANONICAL') : 'NONE')
    };
    rows.push(rec);
    Logger.log('DIAG_ROW_' + TEMP_pad2_(i + 1) + '_OF_26 ' + JSON.stringify(rec));
  });

  var summary = {
    SOURCE_HEADERS: src.headers.length, SOURCE_LINES: src.lineTab.rows.length, ACTIONABLE_ROWS: plan.report.ACTIONABLE,
    DIAGNOSTIC_ROWS: rows.length, UNIQUE_IDS: Object.keys(seen).length, MISSING_DIAGNOSTIC_ROWS: plan.report.ACTIONABLE - rows.length,
    DUPLICATE_DIAGNOSTIC_IDS: dup, STATUS_COUNTS: statusCounts, CYCLE_CLASS_COUNTS: cls,
    CANONICAL_ALREADY: cls.CANONICAL_ALREADY, DATE_PARSE_APPROVED: cls.DATE_PARSE_APPROVED, YEAR_ONLY_UNRESOLVED: cls.YEAR_ONLY_UNRESOLVED,
    INVALID_UNRESOLVED: cls.INVALID_UNRESOLVED, EVIDENCE_CONFLICT: cls.EVIDENCE_CONFLICT,
    ACTIVE_UNRESOLVED: activeUnresolved, SUBMITTED_UNRESOLVED: submittedUnresolved,
    UNRESOLVED_IDS: unresolvedIds.map(function (u) { return u.id; }),
    READY_FOR_R4C_DECISION: (rows.length === plan.report.ACTIONABLE && dup === 0) ? 'YES' : 'NO'
  };
  Logger.log('DIAG_SUMMARY ' + JSON.stringify(summary, null, 2));
  Logger.log('DIAG_UNRESOLVED_BLOCK ' + JSON.stringify(unresolvedIds, null, 2));
  Logger.log('DIAG_CHECKSUM ' + JSON.stringify({ ACTIONABLE: plan.report.ACTIONABLE, DIAGNOSTIC_ROWS: rows.length, UNIQUE_IDS: Object.keys(seen).length, MISSING_DIAGNOSTIC_ROWS: summary.MISSING_DIAGNOSTIC_ROWS, DUPLICATE_DIAGNOSTIC_IDS: dup }));
  return { summary: summary, rows: rows, unresolved: unresolvedIds };
}
