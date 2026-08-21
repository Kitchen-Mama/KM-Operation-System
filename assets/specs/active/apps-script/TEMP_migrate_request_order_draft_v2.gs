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
  var authority = (opts && opts.authorizedCycleById) || TEMP_R4C_AUTHORIZED_CYCLE_BY_ID_;   // R4C: explicit per-ID cycle map
  var src = TEMP_buildSource_();
  var plan = KMRDV2P.planMigration(src.headers, src.linesByDraftId, { expect: TEMP_R4_EXPECT_, authorizedCycleById: authority });
  if (!plan.ok) { Logger.log('MIGRATION HALTED: ' + plan.halt + '\n' + JSON.stringify(plan.drift || plan, null, 2)); return plan; }

  // sample source->target mappings (1 active RD / 1 active RAD / 1 submitted RD / 1 submitted RAD when available)
  function fam(id) { return /^RD::/.test(id) ? 'RD' : (/^RAD-/.test(id) ? 'RAD' : 'OTHER'); }
  var samples = {}; plan.stagingRows.forEach(function (r) {
    var key = (String(r.status) === 'submitted' ? 'SUBMITTED_' : 'ACTIVE_') + fam(r.request_allocation_draft_id);
    if (!samples[key]) samples[key] = { id: r.request_allocation_draft_id, status: r.status, planning_cycle: r.planning_cycle, sku: r.sku, t1_order_qty: r.t1_order_qty, t2_order_qty: r.t2_order_qty, t3_order_qty: r.t3_order_qty };
  });
  // R4C dry-run closure: preview every validator gate + the exact normalized distributions + the six canonical
  // active identities, entirely read-only (no staging is created in dry-run).
  var identities = TEMP_r4cCanonicalActiveIdentities_();
  var gatePrecheck = KMRDV2P.validateStaging(plan.stagingHeaders, plan.stagingRows, src.headers, src.linesByDraftId,
    { expectRows: TEMP_R4_EXPECT_.ACTIONABLE, authorizedCycleById: authority, canonicalActiveIdentities: identities, oldLineWriteCount: 0 });
  var out = { mode: execute ? 'EXECUTE' : 'DRY_RUN', SOURCE_HEADERS: src.headers.length, SOURCE_LINES: src.lineTab.rows.length,
    report: plan.report, normalization_counts: plan.report.NORMALIZATION_COUNTS, normalized_distributions: plan.report.NORMALIZED_DISTRIBUTIONS,
    gate_precheck: gatePrecheck, canonical_active_identities: identities, authorized_id_count: Object.keys(authority).length,
    samples: samples, staging_tab: TEMP_V2_STAGING_TAB_, zero_write_confirmed: !execute };

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

function TEMP_validateRequestOrderDraftV2Staging_(opts) {
  TEMP_r4Bundle_();
  var authority = (opts && opts.authorizedCycleById) || TEMP_R4C_AUTHORIZED_CYCLE_BY_ID_;
  var stg = TEMP_readObjects_(TEMP_V2_STAGING_TAB_);
  if (!stg.present) { Logger.log('staging tab absent'); return { READY_FOR_SWAP: 'NO', reason: 'STAGING_ABSENT' }; }
  var src = TEMP_buildSource_();
  var v = KMRDV2P.validateStaging(stg.headers, stg.rows, src.headers, src.linesByDraftId,
    { expectRows: TEMP_R4_EXPECT_.ACTIONABLE, authorizedCycleById: authority, canonicalActiveIdentities: TEMP_r4cCanonicalActiveIdentities_(), oldLineWriteCount: 0 });
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
// F1-7N-FA-3C-DRAFT-MODEL-R4B4/R4B5 — LIVE ACTIVE-SCOPE TOKEN + PRODUCTION-CYCLE-TRANSPORT DIAGNOSTIC (READ-ONLY)
// ----------------------------------------------------------------------------------------------------------------
// R4B5 correction (supersedes the R4B4 verdict logic): MARKETPLACE IS PART OF THE NATURAL KEY. Candidate selection
// matches company+country+sku+CANONICAL MIGRATED marketplace (all exact) — so a SKU sold on several marketplaces is
// NOT ambiguous; ONLY ≥2 candidates matching the COMPLETE canonical scope are ambiguous. Token-scope match,
// current-query eligibility (calculation_status), and would-be reuse are reported SEPARATELY (a BLOCKED row can
// still carry the correct future identity). The production cycle transport is traced explicitly: a Date-typed
// calculation_month is stringified by r4e2Str_ (47_:174) → normalizePlanningCycleMonthly REJECTS it, so production
// does NOT canonicalize the Date — a RUNTIME_DATE_CYCLE_TRANSPORT_DEFECT surfaced per row (project-tz month IS
// 2026-08, never the UTC-July slice). Reads ONLY order_planning_gap + marketplace_skus; writes NOTHING. The ONLY
// marketplace mapping is the two frozen source→migrated entries below, applied to the LEGACY input — NOT a global alias.
var TEMP_V2_GAP_TAB_ = 'order_planning_gap';
var TEMP_V2_MARKETPLACE_SKUS_TAB_ = 'marketplace_skus';
var TEMP_R4B5_EXPECTED_CYCLE_ = '2026-08';   // architect-frozen historical migration cycle for ALL six rows
// Frozen source→migrated marketplace map — applies ONLY to this known legacy migration input (NOT a global alias).
var TEMP_R4B5_MKT_MAP_ = { 'Amazon': 'Amazon', 'KM Walmart': 'Walmart' };

// R4C EXPLICIT per-ID migration authority map (exact request_allocation_draft_id → canonical YYYY-MM). NOT prefix
// logic; unknown/missing/extra actionable id → planMigration HALTs MIGRATION_AUTHORIZED_ID_SET_MISMATCH. The whole
// authorized cohort maps to 2026-08 (the frozen historical migration cycle). The 6 architect-confirmed ids (5 active
// RAD + the sole RD) are seeded below; the remaining 20 SUBMITTED RAD ids from the R4B2 log MUST be pasted here (each
// → '2026-08') before a LIVE dry-run/execute can pass — until then the migration fail-closes on the 20 unknown ids.
var TEMP_R4C_AUTHORIZED_CYCLE_BY_ID_ = {
  'RAD-A92D17B1-8': '2026-08',
  'RAD-3A0A8227-F': '2026-08',
  'RAD-06053044-1': '2026-08',
  'RAD-72ABD506-3': '2026-08',
  'RAD-17DC0322-0': '2026-08',
  'RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R': '2026-08'
  // <<< USER: paste the 20 submitted RAD ids from the R4B2 DIAG log here, each mapped to '2026-08' >>>
};
// The SIX frozen canonical ACTIVE identities (R4B5) — migrated marketplace + canonical 2026-08 — for ACTIVE_SCOPE_REUSABLE.
function TEMP_r4cCanonicalActiveIdentities_() {
  return TEMP_R4B4_ACTIVE_KEYS_.map(function (k) {
    return { company: k.company, country: k.country, marketplace: k.migrated_marketplace, sku: k.sku, draft_purpose: k.draft_purpose, planning_cycle: k.planning_cycle };
  });
}

// The SIX post-normalization active keys (R4B5 architect input). planning_cycle = frozen canonical 2026-08.
// source_marketplace = the LEGACY token; migrated_marketplace = the canonical token after the frozen map. id #6 (RD)
// is embedded BYTE-FOR-BYTE — never re-minted (its legacy cycle text + scopeKey ordering are preserved verbatim).
var TEMP_R4B4_ACTIVE_KEYS_ = [
  { seq: 1, id: 'RAD-A92D17B1-8', planning_cycle: '2026-08', company: 'ResUS', country: 'US', source_marketplace: 'Amazon',     migrated_marketplace: 'Amazon',  sku: 'CO1200-O', draft_purpose: 'regular', status: 'draft' },
  { seq: 2, id: 'RAD-3A0A8227-F', planning_cycle: '2026-08', company: 'ResTW', country: 'CA', source_marketplace: 'Amazon',     migrated_marketplace: 'Amazon',  sku: 'CO1200-O', draft_purpose: 'regular', status: 'draft' },
  { seq: 3, id: 'RAD-06053044-1', planning_cycle: '2026-08', company: 'KM',    country: 'US', source_marketplace: 'KM Walmart', migrated_marketplace: 'Walmart', sku: 'CO1200-O', draft_purpose: 'regular', status: 'draft' },
  { seq: 4, id: 'RAD-72ABD506-3', planning_cycle: '2026-08', company: 'ResUS', country: 'US', source_marketplace: 'Amazon',     migrated_marketplace: 'Amazon',  sku: 'CO5600-R', draft_purpose: 'regular', status: 'draft' },
  { seq: 5, id: 'RAD-17DC0322-0', planning_cycle: '2026-08', company: 'ResUS', country: 'US', source_marketplace: 'Amazon',     migrated_marketplace: 'Amazon',  sku: 'CO5600-W', draft_purpose: 'regular', status: 'draft' },
  { seq: 6, id: 'RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R', planning_cycle: '2026-08', company: 'ResUS', country: 'US', source_marketplace: 'Amazon', migrated_marketplace: 'Amazon', sku: 'SP5120-R', draft_purpose: 'regular', status: 'draft' }
];

function TEMP_str_(v) { return String(v === undefined || v === null ? '' : v).trim(); }
function TEMP_ciEq_(a, b) { return TEMP_str_(a).toLowerCase() === TEMP_str_(b).toLowerCase(); }
function TEMP_projectTz_() { try { return SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || 'Etc/GMT'; } catch (e) { return 'Etc/GMT'; } }

// Project-timezone calendar month of a raw calculation_month → { ok, cycle, via, note }. A Date OBJECT uses
// Utilities.formatDate in the PROJECT timezone (so 2026-08-01 00:00 Asia/Taipei → 2026-08, NEVER the UTC-July slice);
// a bare YYYY-MM string is already canonical; an ISO/datetime string is re-parsed in the project tz. Never a clock.
function TEMP_projectTzCycle_(raw, tz) {
  if (TEMP_isDate_(raw)) { try { return { ok: true, cycle: Utilities.formatDate(raw, tz, 'yyyy-MM'), via: 'formatDate(project_tz)' }; } catch (e) { return { ok: false, cycle: null, via: 'formatDate_error', note: String(e && e.message || e) }; } }
  var s = TEMP_str_(raw);
  var m = /^(\d{4})-(\d{1,2})$/.exec(s);
  if (m) { var mo = Number(m[2]); if (mo >= 1 && mo <= 12) return { ok: true, cycle: m[1] + '-' + TEMP_pad2_(mo), via: 'already_canonical' }; return { ok: false, cycle: null, via: 'month_out_of_range' }; }
  var iso = /^(\d{4})-(\d{2})-(\d{2})[T ]/.exec(s);
  if (iso) { try { return { ok: true, cycle: Utilities.formatDate(new Date(s), tz, 'yyyy-MM'), via: 'iso_string_reparsed(project_tz)', note: 'naive UTC slice would give ' + iso[1] + '-' + iso[2] + ' — NOT authoritative' }; } catch (e2) { return { ok: false, cycle: null, via: 'iso_parse_error' }; } }
  return { ok: false, cycle: null, via: 'unrecognized' };
}

// The ACTUAL production query cycle for a gap row. Prefers the proven-pure production projector recGenBuildGapDraftBody_
// (47_) so this is REAL production behavior, NOT a re-implementation; falls back to String(calculation_month) — which
// is EXACTLY what production's r4e2Str_ (47_:174) does — only when that function is absent (an isolated harness).
function TEMP_actualProductionQueryCycle_(gapRow) {
  var scope = { company: gapRow.company, country: gapRow.country, marketplace: gapRow.marketplace, sku: gapRow.sku };
  if (typeof recGenBuildGapDraftBody_ === 'function') {
    try { var b = recGenBuildGapDraftBody_(scope, gapRow, null, { draft_purpose: 'regular' }); if (b && b.ok && b.body) return { value: b.body.planningCycle, via: 'recGenBuildGapDraftBody_' }; } catch (e) { /* facts-not-ready ≠ the cycle question */ }
  }
  return { value: TEMP_str_(gapRow.calculation_month), via: 'String(calculation_month)==r4e2Str_(47_:174)' };
}
function TEMP_normalizesTo_(value, expected) { try { return KMRDV2.normalizePlanningCycleMonthly(value) === expected; } catch (e) { return false; } }

// Build the SINGLE proposed migrated V2 row (canonical V2_HEADERS order) for one key using the MIGRATED marketplace,
// wrapped as a KMRDV2P sheetSet, so the REAL KMRDV2P.loadActiveFlat can decide REUSE against a canonical query.
function TEMP_migratedSheetSetFor_(key) {
  var o = {}; KMRDV2.V2_HEADERS.forEach(function (h) { o[h] = ''; });
  o.request_allocation_draft_id = key.id; o.planning_cycle = key.planning_cycle;
  o.company = key.company; o.country = key.country; o.marketplace = key.migrated_marketplace; o.sku = key.sku;
  o.draft_purpose = key.draft_purpose; o.status = key.status;
  var row = KMRDV2.V2_HEADERS.map(function (h) { return o[h]; });
  var set = {}; set[KMRDV2P.HEADER_TABLE] = { headers: KMRDV2.V2_HEADERS.slice(), rows: [row] };
  return set;
}
// Would the migrated row be REUSED if the AI Plan queried it with the CANONICAL cycle (2026-08) + canonical migrated
// scope? Independent of the live transport defect — answers "reusable once the R4C seam lands". Uses REAL loadActiveFlat.
function TEMP_reusableIfQueried_(key) {
  try {
    var res = KMRDV2P.loadActiveFlat(TEMP_migratedSheetSetFor_(key), { recommendationType: 'MONTHLY_ORDER', planningCycle: TEMP_R4B5_EXPECTED_CYCLE_,
      businessScope: { company: key.company, country: key.country, marketplace: key.migrated_marketplace, sku: key.sku, draft_purpose: key.draft_purpose } });
    return res.status === 'REUSE';
  } catch (e) { return false; }
}

function TEMP_auditOneActiveScopeKey_(key, gapRows, mpsRows, tz) {
  // frozen legacy→migrated marketplace map check (must resolve to the migrated token; unknown legacy → flag)
  var mappedFromSource = TEMP_R4B5_MKT_MAP_[TEMP_str_(key.source_marketplace)];
  var mapKnown = (mappedFromSource !== undefined);
  var tokenMappingApplied = mapKnown && (TEMP_str_(key.source_marketplace) !== TEMP_str_(key.migrated_marketplace));

  // company+country+sku net (case-insensitive) purely to EXPOSE every raw marketplace token; the FULL canonical-scope
  // exact set additionally requires trim-exact company/country/sku AND marketplace === migrated marketplace. Marketplace
  // is part of the key, so other-marketplace rows for the same SKU are correctly excluded (NOT ambiguity).
  var allSkuGap = [], exactGap = [];
  gapRows.forEach(function (r, idx) {
    if (!(TEMP_ciEq_(r.company, key.company) && TEMP_ciEq_(r.country, key.country) && TEMP_ciEq_(r.sku, key.sku))) return;
    var pc = TEMP_projectTzCycle_(r.calculation_month, tz);
    var apc = TEMP_actualProductionQueryCycle_(r);
    var cand = {
      rowNumber: idx + 2, raw_marketplace: r.marketplace, trimmed_marketplace: TEMP_str_(r.marketplace),
      raw_gap_cycle_value: r.calculation_month, raw_gap_cycle_type: (TEMP_isDate_(r.calculation_month) ? 'Date' : (r.calculation_month === null || r.calculation_month === undefined ? 'null' : typeof r.calculation_month)),
      gap_cycle_in_project_timezone: pc.cycle, gap_cycle_tz_via: pc.via, gap_cycle_tz_note: pc.note || '',
      actual_production_query_cycle: apc.value, production_projection_via: apc.via,
      production_cycle_equal: TEMP_normalizesTo_(apc.value, TEMP_R4B5_EXPECTED_CYCLE_),
      project_tz_cycle_equal: (pc.cycle === TEMP_R4B5_EXPECTED_CYCLE_),
      calculation_status: TEMP_str_(r.calculation_status)
    };
    allSkuGap.push(cand);
    var fullExact = TEMP_str_(r.company) === TEMP_str_(key.company) && TEMP_str_(r.country) === TEMP_str_(key.country) &&
      TEMP_str_(r.sku) === TEMP_str_(key.sku) && TEMP_str_(r.marketplace) === TEMP_str_(key.migrated_marketplace);
    if (fullExact) exactGap.push(cand);
  });

  // FULL canonical-scope master candidates (company+country+sku ci net; marketplace === migrated marketplace exact).
  var exactMaster = [];
  mpsRows.forEach(function (r, idx) {
    if (!(TEMP_ciEq_(r.company, key.company) && TEMP_ciEq_(r.country, key.country) && TEMP_ciEq_(r.sku, key.sku))) return;
    if (TEMP_str_(r.marketplace) !== TEMP_str_(key.migrated_marketplace)) return;
    exactMaster.push({ rowNumber: idx + 2, raw_marketplace: r.marketplace, marketplace_sku_status: TEMP_str_(r.marketplace_sku_status), site_sku: r.site_sku });
  });

  var tokenScopeMatch = exactGap.length >= 1;                                   // company+country+sku+migrated-marketplace present
  var currentQueryEligible = exactGap.some(function (c) { return c.calculation_status.toUpperCase() === 'READY'; });
  var multipleExact = exactGap.length > 1;
  var reusableIfQueried = tokenScopeMatch && !multipleExact && TEMP_reusableIfQueried_(key);
  // cycle-transport defect: the true project-tz month IS canonical 2026-08 but production stringifies it non-canonically.
  var cycleTransportDefect = exactGap.some(function (c) { return c.project_tz_cycle_equal === true && c.production_cycle_equal === false; });

  var classification;
  if (!tokenScopeMatch) classification = 'NO_EXACT_CANDIDATE';
  else if (multipleExact) classification = 'MULTIPLE_EXACT_CANDIDATES';
  else if (cycleTransportDefect) classification = 'CYCLE_TRANSPORT_DEFECT';
  else if (!currentQueryEligible) classification = 'BLOCKED_BUT_SCOPE_MATCH';
  else classification = 'EXACT_SCOPE_MATCH';

  var mismatch = [];
  if (!tokenScopeMatch) mismatch.push('marketplace/company/country/sku (no full canonical-scope candidate)');
  else if (cycleTransportDefect) mismatch.push('planning_cycle (production transport defect — scope tokens match)');

  var e0 = exactGap[0] || null;
  var reason;
  if (!tokenScopeMatch) reason = 'no gap row matches the FULL canonical scope company+country+sku+' + key.migrated_marketplace + ' (other-marketplace rows for this SKU are correctly excluded, not ambiguous)';
  else if (multipleExact) reason = exactGap.length + ' gap rows match the COMPLETE canonical scope → genuine ambiguity';
  else if (cycleTransportDefect) reason = 'scope tokens match exactly; project-tz month IS ' + TEMP_R4B5_EXPECTED_CYCLE_ + ' but production stringifies the Date to "' + e0.actual_production_query_cycle + '" → R4C runtime transport seam 47_:225';
  else if (!currentQueryEligible) reason = 'exact scope + cycle identity correct, but calculation_status is not READY (currently blocked; future identity still valid)';
  else reason = 'exact full-scope match, READY, production cycle canonical → reusable';

  return {
    seq: key.seq, source_id: key.id, id_family: TEMP_idFamily_(key.id),
    proposed_migrated_key: { planning_cycle: key.planning_cycle, company: key.company, country: key.country, marketplace: key.migrated_marketplace, sku: key.sku, draft_purpose: key.draft_purpose, status: key.status },
    SOURCE_MARKETPLACE: key.source_marketplace, MIGRATED_MARKETPLACE: key.migrated_marketplace,
    marketplace_map_known: mapKnown, TOKEN_MAPPING_APPLIED: tokenMappingApplied, mapped_to: (mapKnown ? mappedFromSource : null),
    RAW_GAP_CYCLE_VALUE: (e0 ? e0.raw_gap_cycle_value : (allSkuGap[0] ? allSkuGap[0].raw_gap_cycle_value : null)),
    RAW_GAP_CYCLE_TYPE: (e0 ? e0.raw_gap_cycle_type : (allSkuGap[0] ? allSkuGap[0].raw_gap_cycle_type : 'none')),
    GAP_CYCLE_IN_PROJECT_TIMEZONE: (e0 ? e0.gap_cycle_in_project_timezone : null),
    ACTUAL_PRODUCTION_QUERY_CYCLE: (e0 ? e0.actual_production_query_cycle : null),
    EXPECTED_CANONICAL_CYCLE: TEMP_R4B5_EXPECTED_CYCLE_,
    PRODUCTION_CYCLE_EQUAL: (e0 ? e0.production_cycle_equal : false),
    EXACT_GAP_MARKETPLACE_CANDIDATES: exactGap.length, EXACT_MASTER_MARKETPLACE_CANDIDATES: exactMaster.length,
    all_sku_gap_marketplace_tokens: allSkuGap.map(function (c) { return c.trimmed_marketplace; }),
    exact_gap_candidates: exactGap, exact_master_candidates: exactMaster,
    TOKEN_SCOPE_MATCH: tokenScopeMatch, CURRENT_QUERY_ELIGIBLE: currentQueryEligible,
    ACTIVE_LOOKUP_REUSABLE_IF_QUERIED: reusableIfQueried,
    CYCLE_TRANSPORT_DEFECT: cycleTransportDefect, MULTIPLE_EXACT_CANDIDATES: multipleExact,
    mismatch_fields: mismatch, classification: classification, reason: reason
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
  var tz = TEMP_projectTz_();
  var rows = [], seenId = {}, dup = 0;
  TEMP_R4B4_ACTIVE_KEYS_.forEach(function (k) { if (seenId[k.id]) dup++; seenId[k.id] = 1; });
  TEMP_R4B4_ACTIVE_KEYS_.forEach(function (k, i) {
    var rec = TEMP_auditOneActiveScopeKey_(k, gap.rows, mps.rows, tz);
    rows.push(rec);
    Logger.log('ACTIVE_SCOPE_ROW_' + TEMP_pad2_(i + 1) + '_OF_06 ' + JSON.stringify(rec));
  });

  function cnt(pred) { return rows.filter(pred).length; }
  var summary = {
    EXPECTED_ROWS: 6, DIAGNOSTIC_ROWS: rows.length, UNIQUE_SOURCE_IDS: Object.keys(seenId).length,
    MISSING_ROWS: 6 - rows.length, DUPLICATE_SOURCE_IDS: dup, PROJECT_TIMEZONE: tz,
    GAP_TAB_PRESENT: true, MARKETPLACE_SKUS_TAB_PRESENT: true,
    EXACT_SCOPE_MATCH: cnt(function (r) { return r.classification === 'EXACT_SCOPE_MATCH'; }),
    BLOCKED_BUT_SCOPE_MATCH: cnt(function (r) { return r.classification === 'BLOCKED_BUT_SCOPE_MATCH'; }),
    CYCLE_TRANSPORT_DEFECT: cnt(function (r) { return r.CYCLE_TRANSPORT_DEFECT === true; }),
    TOKEN_MAPPING_APPLIED: cnt(function (r) { return r.TOKEN_MAPPING_APPLIED === true; }),
    NO_EXACT_CANDIDATE: cnt(function (r) { return r.classification === 'NO_EXACT_CANDIDATE'; }),
    MULTIPLE_EXACT_CANDIDATES: cnt(function (r) { return r.MULTIPLE_EXACT_CANDIDATES === true; }),
    TOKEN_SCOPE_MATCH_ROWS: cnt(function (r) { return r.TOKEN_SCOPE_MATCH === true; }),
    REUSABLE_IF_QUERIED_ROWS: cnt(function (r) { return r.ACTIVE_LOOKUP_REUSABLE_IF_QUERIED === true; }),
    NON_REUSABLE_ROWS: cnt(function (r) { return r.ACTIVE_LOOKUP_REUSABLE_IF_QUERIED !== true; }),
    // completeness only — NOT an execute authorization. YES iff all six resolve to exactly one intended identity
    // (token scope matches, ≤1 exact candidate each, marketplace map known for the legacy token).
    READY_FOR_R4C_SCOPE_DECISION: (rows.length === 6 && dup === 0 &&
      rows.every(function (r) { return r.TOKEN_SCOPE_MATCH === true && r.MULTIPLE_EXACT_CANDIDATES === false && r.marketplace_map_known === true; })) ? 'YES' : 'NO'
  };
  var conflicts = rows.filter(function (r) { return r.MULTIPLE_EXACT_CANDIDATES === true || r.TOKEN_SCOPE_MATCH === false || r.marketplace_map_known === false; })
    .map(function (r) { return { seq: r.seq, source_id: r.source_id, classification: r.classification, reason: r.reason }; });
  Logger.log('ACTIVE_SCOPE_DIAG_SUMMARY ' + JSON.stringify(summary, null, 2));
  Logger.log('ACTIVE_SCOPE_TOKEN_MAP ' + JSON.stringify(TEMP_R4B5_MKT_MAP_, null, 2));
  Logger.log('ACTIVE_SCOPE_CONFLICTS ' + JSON.stringify(conflicts, null, 2));
  Logger.log('ACTIVE_SCOPE_CHECKSUM ' + JSON.stringify({ EXPECTED_ROWS: 6, DIAGNOSTIC_ROWS: rows.length, UNIQUE_SOURCE_IDS: Object.keys(seenId).length, MISSING_ROWS: 6 - rows.length, GAP_TAB_PRESENT: true, MARKETPLACE_SKUS_TAB_PRESENT: true }));
  return { summary: summary, rows: rows, tokenMap: TEMP_R4B5_MKT_MAP_, conflicts: conflicts };
}
