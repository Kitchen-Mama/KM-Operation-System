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
// F1-7N-FA-3C-R4B4 — READ-ONLY live active-scope TOKEN diagnostic for the SIX frozen active source keys. Reads ONLY
// order_planning_gap + marketplace_skus; exposes every raw live marketplace token; simulates active-lookup reuse with
// the REAL KMRDV2P.loadActiveFlat / scopeMatches_ equality. Writes NOTHING; applies no silent normalization/aliasing.
function TEMP_R4_AUDIT_ACTIVE_SCOPE_TOKENS_RequestOrderDraftV2() { return TEMP_auditActiveScopeTokens_(); }

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

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R4B4 — LIVE ACTIVE-SCOPE TOKEN DIAGNOSTIC (strictly READ-ONLY)
// ----------------------------------------------------------------------------------------------------------------
// Reads ONLY order_planning_gap + marketplace_skus. For each of the SIX architect-frozen active source keys it:
//   (1) finds every order_planning_gap candidate by company+country+sku (marketplace NOT filtered → all raw tokens
//       exposed), projecting each candidate into the CURRENT flat-V2 AI-Plan query scope (byte-equivalent to
//       recGenBuildGapDraftBody_ 47_:225-227, or that pure function itself when present & facts-ready);
//   (2) finds every marketplace_skus master candidate by country+master-sku (company optional per the tab's own
//       country+marketplace+sku uniqueness), exposing every raw marketplace token;
//   (3) simulates reuse with the REAL KMRDV2P.loadActiveFlat / scopeMatches_ (exact trim-only, case-sensitive) —
//       never case-folding, trimming-equivalence, aliasing, or a marketplace map.
// It NEVER writes, inserts, renames, clears, deletes, mutates the legacy/line/staging tabs, flips the flag, or
// deploys. If either required tab is absent it reports and HALTs without creating it.
var TEMP_V2_GAP_TAB_ = 'order_planning_gap';
var TEMP_V2_MARKETPLACE_SKUS_TAB_ = 'marketplace_skus';

// The SIX exact post-normalization active source keys (R4B4 architect input). planning_cycle is the canonical
// YYYY-MM FIELD (independent of the legacy id string). id #6 (RD) is embedded BYTE-FOR-BYTE — never re-minted.
var TEMP_R4B4_ACTIVE_KEYS_ = [
  { seq: 1, id: 'RAD-A92D17B1-8', planning_cycle: '2026-07', company: 'ResUS', country: 'US', marketplace: 'Amazon',     sku: 'CO1200-O', draft_purpose: 'regular', status: 'draft' },
  { seq: 2, id: 'RAD-3A0A8227-F', planning_cycle: '2026-07', company: 'ResTW', country: 'CA', marketplace: 'Amazon',     sku: 'CO1200-O', draft_purpose: 'regular', status: 'draft' },
  { seq: 3, id: 'RAD-06053044-1', planning_cycle: '2026-07', company: 'KM',    country: 'US', marketplace: 'KM Walmart', sku: 'CO1200-O', draft_purpose: 'regular', status: 'draft' },
  { seq: 4, id: 'RAD-72ABD506-3', planning_cycle: '2026-07', company: 'ResUS', country: 'US', marketplace: 'Amazon',     sku: 'CO5600-R', draft_purpose: 'regular', status: 'draft' },
  { seq: 5, id: 'RAD-17DC0322-0', planning_cycle: '2026-07', company: 'ResUS', country: 'US', marketplace: 'Amazon',     sku: 'CO5600-W', draft_purpose: 'regular', status: 'draft' },
  { seq: 6, id: 'RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R', planning_cycle: '2026-08', company: 'ResUS', country: 'US', marketplace: 'Amazon', sku: 'SP5120-R', draft_purpose: 'regular', status: 'draft' }
];

function TEMP_str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function TEMP_ciEq_(a, b) { return TEMP_str_(a).toLowerCase() === TEMP_str_(b).toLowerCase(); }

// Project ONE order_planning_gap row into the CURRENT flat-V2 AI-Plan query scope. Prefers the proven-pure
// recGenBuildGapDraftBody_ (47_) when present AND facts-ready; otherwise falls back to the byte-equivalent scope
// shape (verbatim company/country/marketplace/sku + calculation_month + draft_purpose 'regular' — 47_:225-227).
// Read-only either way (recGenBuildGapDraftBody_ is inside the __GAPDRAFT_PURE__ block; no DB, no write).
function TEMP_projectAiQueryScope_(gapRow) {
  var s = { company: gapRow.company, country: gapRow.country, marketplace: gapRow.marketplace, sku: gapRow.sku };
  if (typeof recGenBuildGapDraftBody_ === 'function') {
    try {
      var b = recGenBuildGapDraftBody_(s, gapRow, null, { draft_purpose: 'regular' });
      if (b && b.ok && b.body) return { planningCycle: b.body.planningCycle, businessScope: b.body.businessScope, via: 'recGenBuildGapDraftBody_' };
    } catch (e) { /* facts-not-ready is unrelated to scope tokens → fall through to the scope-only projection */ }
  }
  return { planningCycle: TEMP_str_(gapRow.calculation_month),
    businessScope: { company: s.company, country: s.country, marketplace: s.marketplace, sku: s.sku, draft_purpose: 'regular' },
    via: 'byte_equivalent_scope_projection' };
}

// Build the SINGLE proposed migrated V2 row (in canonical V2_HEADERS order) for one frozen key, wrapped as a
// KMRDV2P sheetSet, so KMRDV2P.loadActiveFlat can decide REUSE/CREATE/BLOCKED_CONFLICT against a live query.
function TEMP_migratedSheetSetFor_(key) {
  var o = {}; KMRDV2.V2_HEADERS.forEach(function (h) { o[h] = ''; });
  o.request_allocation_draft_id = key.id; o.planning_cycle = key.planning_cycle;
  o.company = key.company; o.country = key.country; o.marketplace = key.marketplace; o.sku = key.sku;
  o.draft_purpose = key.draft_purpose; o.status = key.status;
  var row = KMRDV2.V2_HEADERS.map(function (h) { return o[h]; });
  var set = {}; set[KMRDV2P.HEADER_TABLE] = { headers: KMRDV2.V2_HEADERS.slice(), rows: [row] };
  return set;
}
// Authoritative reuse verdict via the REAL persistence lookup (exact scopeMatches_ semantics; cycle normalized).
function TEMP_simReuse_(key, queryCycle, queryScope) {
  try {
    var res = KMRDV2P.loadActiveFlat(TEMP_migratedSheetSetFor_(key), { recommendationType: 'MONTHLY_ORDER', planningCycle: queryCycle, businessScope: queryScope });
    return res.status;   // REUSE (exact match) | CREATE (no match) | BLOCKED_CONFLICT
  } catch (e) { return 'CYCLE_UNNORMALIZABLE'; }
}
// Field-level diff mirroring scopeMatches_ exactly (cycle normalized on both sides; other fields trim-exact).
function TEMP_scopeFieldDiff_(key, aiQueryKey) {
  var diffs = [], kc, qc;
  try { kc = KMRDV2.normalizePlanningCycleMonthly(key.planning_cycle); } catch (e) { kc = '<<' + TEMP_str_(key.planning_cycle) + '>>'; }
  try { qc = KMRDV2.normalizePlanningCycleMonthly(aiQueryKey.planning_cycle); } catch (e2) { qc = '<<' + TEMP_str_(aiQueryKey.planning_cycle) + '>>'; }
  if (kc !== qc) diffs.push('planning_cycle');
  ['company', 'country', 'marketplace', 'sku', 'draft_purpose'].forEach(function (f) { if (TEMP_str_(key[f]) !== TEMP_str_(aiQueryKey[f])) diffs.push(f); });
  return diffs;
}

function TEMP_auditOneActiveScopeKey_(key, gapRows, mpsRows) {
  // (1) order_planning_gap candidates by company+country+sku (case-insensitive net; marketplace NOT filtered).
  var gapCands = [];
  gapRows.forEach(function (r, idx) {
    if (!(TEMP_ciEq_(r.company, key.company) && TEMP_ciEq_(r.country, key.country) && TEMP_ciEq_(r.sku, key.sku))) return;
    var proj = TEMP_projectAiQueryScope_(r);
    var aiKey = { planning_cycle: proj.planningCycle, company: proj.businessScope.company, country: proj.businessScope.country, marketplace: proj.businessScope.marketplace, sku: proj.businessScope.sku, draft_purpose: proj.businessScope.draft_purpose };
    gapCands.push({
      rowNumber: idx + 2, projectionVia: proj.via,
      raw: { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, calculation_month: r.calculation_month, calculation_status: r.calculation_status },
      trimmed: { company: TEMP_str_(r.company), country: TEMP_str_(r.country), marketplace: TEMP_str_(r.marketplace), sku: TEMP_str_(r.sku) },
      current_ai_query_key: aiKey,
      marketplace_exact: TEMP_str_(r.marketplace) === TEMP_str_(key.marketplace),
      marketplace_ci: TEMP_ciEq_(r.marketplace, key.marketplace),
      scope_field_diff: TEMP_scopeFieldDiff_(key, aiKey),
      reuse: TEMP_simReuse_(key, proj.planningCycle, proj.businessScope)
    });
  });
  // (2) marketplace_skus master candidates by company+country+master-sku (per the task's identity keys; marketplace
  //     NOT filtered → every raw master token exposed). A country+sku hit whose company differs is reported too so a
  //     company-token mismatch is never hidden, but it does NOT feed the authoritative master-token set.
  var mpsCands = [];
  mpsRows.forEach(function (r, idx) {
    if (!(TEMP_ciEq_(r.country, key.country) && TEMP_ciEq_(r.sku, key.sku))) return;
    mpsCands.push({
      rowNumber: idx + 2,
      raw: { company: r.company, country: r.country, marketplace: r.marketplace, sku: r.sku, site_sku: r.site_sku, marketplace_sku_status: r.marketplace_sku_status },
      companyMatch: TEMP_ciEq_(r.company, key.company),
      marketplace_exact: TEMP_str_(r.marketplace) === TEMP_str_(key.marketplace),
      marketplace_ci: TEMP_ciEq_(r.marketplace, key.marketplace)
    });
  });
  // authoritative master identity = the company+country+sku subset (the task's three master keys).
  var mpsIdentity = mpsCands.filter(function (c) { return c.companyMatch; });
  var masterTokens = {}; mpsIdentity.forEach(function (c) { var t = TEMP_str_(c.raw.marketplace); if (t) masterTokens[t] = (masterTokens[t] || 0) + 1; });
  var distinctMaster = Object.keys(masterTokens);

  // (3) verdict — fail closed; never claim reusable when the live candidate is missing/ambiguous/case-only.
  var exactReuse = gapCands.filter(function (c) { return c.reuse === 'REUSE'; });
  var ciOnly = gapCands.filter(function (c) { return c.marketplace_ci && !c.marketplace_exact; });
  var verdict, reusable, reason;
  if (gapCands.length === 0) { verdict = 'NO_LIVE_CANDIDATE'; reusable = 'NO'; reason = 'no order_planning_gap row for company+country+sku'; }
  else if (exactReuse.length === 1) { verdict = 'EXACT_MATCH'; reusable = 'YES'; reason = 'unique exact scopeMatches_ REUSE'; }
  else if (exactReuse.length > 1) { verdict = 'AMBIGUOUS_CANDIDATE'; reusable = 'NO'; reason = exactReuse.length + ' gap rows each REUSE (duplicate-active hazard)'; }
  else if (ciOnly.length > 0) { verdict = 'TOKEN_MAPPING_REQUIRED'; reusable = 'NO'; reason = 'marketplace matches only case/format-insensitively; scopeMatches_ is exact trim-only, case-sensitive'; }
  else { verdict = 'NO_LIVE_CANDIDATE'; reusable = 'NO'; reason = 'gap rows exist for company+country+sku but NO marketplace token matches (exact or case-insensitive)'; }

  // Proposed one-time legacy marketplace mapping — ONLY when master proves EXACTLY ONE token that differs from the
  // legacy token. This is a PROPOSAL for architect R4C review; the diagnostic never applies it.
  var proposedMapping = null;
  if (distinctMaster.length === 1 && distinctMaster[0] !== TEMP_str_(key.marketplace)) {
    proposedMapping = { from: TEMP_str_(key.marketplace), to: distinctMaster[0], evidence: 'marketplace_skus proves exactly one token for country+sku', masterRowCount: masterTokens[distinctMaster[0]] };
  }
  var representative = exactReuse[0] || ciOnly[0] || gapCands[0] || null;
  return {
    seq: key.seq, source_id: key.id, id_family: TEMP_idFamily_(key.id),
    proposed_migrated_key: { planning_cycle: key.planning_cycle, company: key.company, country: key.country, marketplace: key.marketplace, sku: key.sku, draft_purpose: key.draft_purpose, status: key.status },
    gap_candidate_count: gapCands.length, master_candidate_count: mpsCands.length,
    gap_candidates: gapCands, master_candidates: mpsCands,
    distinct_master_marketplace_tokens: distinctMaster, distinct_master_token_conflict: distinctMaster.length > 1,
    representative_field_diff: representative ? representative.scope_field_diff : ['<<no live candidate>>'],
    proposed_marketplace_mapping: proposedMapping,
    verdict: verdict, reusable_by_active_lookup: reusable, reason: reason
  };
}

function TEMP_auditActiveScopeTokens_() {
  TEMP_r4Bundle_();
  var gap = TEMP_readObjects_(TEMP_V2_GAP_TAB_), mps = TEMP_readObjects_(TEMP_V2_MARKETPLACE_SKUS_TAB_);
  if (!gap.present || !mps.present) {
    var halt = { halt: 'REQUIRED_TAB_ABSENT', GAP_TAB_PRESENT: gap.present, MARKETPLACE_SKUS_TAB_PRESENT: mps.present, READY_FOR_R4C_SCOPE_DECISION: 'NO' };
    Logger.log('ACTIVE_SCOPE_DIAG HALTED — required tab absent (no tab created): ' + JSON.stringify(halt));
    return halt;
  }
  var rows = [], seenId = {}, dup = 0;
  TEMP_R4B4_ACTIVE_KEYS_.forEach(function (k) { if (seenId[k.id]) dup++; seenId[k.id] = 1; });
  TEMP_R4B4_ACTIVE_KEYS_.forEach(function (k, i) {
    var rec = TEMP_auditOneActiveScopeKey_(k, gap.rows, mps.rows);
    rows.push(rec);
    Logger.log('ACTIVE_SCOPE_ROW_' + TEMP_pad2_(i + 1) + '_OF_06 ' + JSON.stringify(rec));
  });

  function count(v) { return rows.filter(function (r) { return r.verdict === v; }).length; }
  var reusableRows = rows.filter(function (r) { return r.reusable_by_active_lookup === 'YES'; }).length;
  var conflictRows = rows.filter(function (r) { return r.verdict === 'AMBIGUOUS_CANDIDATE' || r.distinct_master_token_conflict; });

  var tokenMap = {};
  rows.forEach(function (r) {
    var legacy = TEMP_str_(r.proposed_migrated_key.marketplace);
    if (!tokenMap[legacy]) tokenMap[legacy] = { legacy_token: legacy, gap_tokens: {}, master_tokens: {}, proposed_mapping: null };
    r.gap_candidates.forEach(function (c) { var t = TEMP_str_(c.raw.marketplace); if (t) tokenMap[legacy].gap_tokens[t] = 1; });
    (r.distinct_master_marketplace_tokens || []).forEach(function (t) { if (t) tokenMap[legacy].master_tokens[t] = 1; });
    if (r.proposed_marketplace_mapping) tokenMap[legacy].proposed_mapping = r.proposed_marketplace_mapping;
  });
  var tokenMapArr = Object.keys(tokenMap).map(function (k) { var e = tokenMap[k]; return { legacy_token: e.legacy_token, gap_tokens: Object.keys(e.gap_tokens), master_tokens: Object.keys(e.master_tokens), proposed_mapping: e.proposed_mapping }; });

  var summary = {
    EXPECTED_ROWS: 6, DIAGNOSTIC_ROWS: rows.length, UNIQUE_SOURCE_IDS: Object.keys(seenId).length,
    MISSING_ROWS: 6 - rows.length, GAP_TAB_PRESENT: true, MARKETPLACE_SKUS_TAB_PRESENT: true,
    EXACT_MATCH: count('EXACT_MATCH'), TOKEN_MAPPING_REQUIRED: count('TOKEN_MAPPING_REQUIRED'),
    NO_LIVE_CANDIDATE: count('NO_LIVE_CANDIDATE'), AMBIGUOUS_CANDIDATE: count('AMBIGUOUS_CANDIDATE'),
    REUSABLE_ROWS: reusableRows, NON_REUSABLE_ROWS: rows.length - reusableRows, CONFLICT_ROWS: conflictRows.length,
    DUPLICATE_SOURCE_IDS: dup,
    READY_FOR_R4C_SCOPE_DECISION: (rows.length === 6 && dup === 0) ? 'YES' : 'NO'   // completeness only — NOT an execute authorization
  };
  Logger.log('ACTIVE_SCOPE_DIAG_SUMMARY ' + JSON.stringify(summary, null, 2));
  Logger.log('ACTIVE_SCOPE_TOKEN_MAP ' + JSON.stringify(tokenMapArr, null, 2));
  Logger.log('ACTIVE_SCOPE_CONFLICTS ' + JSON.stringify(conflictRows.map(function (r) { return { seq: r.seq, source_id: r.source_id, verdict: r.verdict, reason: r.reason, distinct_master_token_conflict: r.distinct_master_token_conflict, distinct_master_marketplace_tokens: r.distinct_master_marketplace_tokens }; }), null, 2));
  Logger.log('ACTIVE_SCOPE_CHECKSUM ' + JSON.stringify({ EXPECTED_ROWS: 6, DIAGNOSTIC_ROWS: rows.length, UNIQUE_SOURCE_IDS: Object.keys(seenId).length, MISSING_ROWS: 6 - rows.length, GAP_TAB_PRESENT: true, MARKETPLACE_SKUS_TAB_PRESENT: true }));
  return { summary: summary, rows: rows, tokenMap: tokenMapArr, conflicts: conflictRows };
}
