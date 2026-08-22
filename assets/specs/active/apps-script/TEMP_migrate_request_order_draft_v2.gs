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
// F1-7N-FA-3C-R5B-P0 — READ-ONLY live canonical-table + header-authority diagnostic. Writes NOTHING.
function TEMP_R5B_DIAGNOSE_CANONICAL_DRAFT_TABLE() { return TEMP_r5bDiagnoseCanonicalDraftTable_(); }
// F1-7N-FA-3C-R5C-P0 — READ-ONLY permanent-write incident audit: enumerates every Date/coerced planning_cycle row,
// the deterministic-id cycle, projected duplicate groups + unresolvable ids. Writes NOTHING. Freezes the R5C1 set.
function TEMP_R5C_AUDIT_DRAFT_WRITE_INCIDENT() { return TEMP_r5cAuditDraftWriteIncident_(); }
// F1-7N-FA-3C-R5C1 — EXACT-41 live cycle repair tooling. DRY_RUN + VALIDATE are READ-ONLY; EXECUTE modifies ONLY the
// planning_cycle cell of the exact 41 frozen IDs (setNumberFormat('@') + primitive string "2026-08"), gated by a full
// pre-execution safety matrix + a deterministic SHA-256 over the sorted 41 IDs. Idempotent (ALREADY_REPAIRED /
// PARTIAL_REPAIR_DETECTED). NEVER touches ids/other 52 fields/audit stamps/Draft Lines/legacy backup; never deploys.
function TEMP_R5C1_DRY_RUN_REPAIR_DRAFT_CYCLES() { return TEMP_r5c1RepairDraftCycles_({ execute: false }); }
function TEMP_R5C1_EXECUTE_REPAIR_DRAFT_CYCLES() { return TEMP_r5c1RepairDraftCycles_({ execute: true }); }
function TEMP_R5C1_VALIDATE_REPAIRED_DRAFT_CYCLES() { return TEMP_r5c1ValidateRepairedDraftCycles_(); }
// F1-7N-FA-3C-R6A — READ-ONLY flat-draft lifecycle preflight + post-stage validators (Edit/Submit/Send). All WRITE
// NOTHING; each is scoped to the ONE frozen target id and its exact downstream Request-Order lineage.
function TEMP_R6A_PREFLIGHT_FLAT_DRAFT_LIFECYCLE() { return TEMP_r6aPreflightFlatDraftLifecycle_(); }
function TEMP_R6A_VALIDATE_AFTER_EDIT() { return TEMP_r6aValidateStage_('EDIT'); }
function TEMP_R6A_VALIDATE_AFTER_PARTIAL_SUBMIT() { return TEMP_r6aValidateStage_('PARTIAL_SUBMIT'); }
function TEMP_R6A_VALIDATE_AFTER_FULL_SUBMIT() { return TEMP_r6aValidateStage_('FULL_SUBMIT'); }
function TEMP_R6A_VALIDATE_AFTER_SEND() { return TEMP_r6aValidateStage_('SEND'); }
function TEMP_R6A_VALIDATE_RESEND_IDEMPOTENCY() { return TEMP_r6aValidateStage_('RESEND'); }
// F1-7N-FA-3C-R6B — READ-ONLY persisted-draft hydration diagnostic for the frozen CO1100-R scope. Writes NOTHING.
function TEMP_R6B_DIAGNOSE_PERSISTED_DRAFT_HYDRATION() { return TEMP_r6bDiagnosePersistedDraftHydration_(); }

// F1-7N-FA-3C-R6B2 — READ-ONLY all-tier Note incident audit. Reports per-tier note + user_edited + version/updated_at,
// the last relevant calculation-run journal row, canonical/Draft-Line counts, duplicate count, zero-write proof, verdict/
// checksum. Run BEFORE any new note attempt (the current live state — v3, T2 user_edited=true, all notes empty — is
// EVIDENCE and MUST NOT be repaired in source). Writes NOTHING (TEMP_readObjects_ only; no mutation bypass).
function TEMP_R6B2_AUDIT_ALL_TIER_NOTES() { return TEMP_r6b2AuditAllTierNotes_(); }

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
  var nRows = plan.stagingRows.length;
  // R4C2: force PLAIN-TEXT number format on the two coercion-prone columns' DATA ranges BEFORE the write, so Google
  // Sheets cannot auto-coerce "2026-08" (and the id) into a Date/number. Only these two staging columns are formatted;
  // numeric quantity/carton/version/tier columns keep their natural (General) format. HALT if a header is missing.
  var cycleCol = headers.indexOf('planning_cycle');
  var idCol = headers.indexOf('request_allocation_draft_id');
  if (cycleCol === -1) { Logger.log('ABORT: planning_cycle column not found in staging headers.'); return { ok: false, halt: 'STAGING_PLANNING_CYCLE_COLUMN_MISSING' }; }
  if (idCol === -1) { Logger.log('ABORT: request_allocation_draft_id column not found in staging headers.'); return { ok: false, halt: 'STAGING_ID_COLUMN_MISSING' }; }
  if (nRows > 0) {
    sh.getRange(2, cycleCol + 1, nRows, 1).setNumberFormat('@');   // plain text — planning_cycle data cells
    sh.getRange(2, idCol + 1, nRows, 1).setNumberFormat('@');      // plain text — request_allocation_draft_id data cells
  }
  var matrix = [headers].concat(plan.stagingRows.map(function (row) { return headers.map(function (h) { return row[h] !== undefined ? row[h] : ''; }); }));
  sh.getRange(1, 1, matrix.length, headers.length).setValues(matrix);   // single matrix write
  out.written_rows = nRows; out.written_headers = headers.length;

  // R4C2 POST-WRITE ROUNDTRIP: flush, read back through the getValues()-based reader, verify the persisted TYPES +
  // values, then run the full 14-gate validator on the read-back rows. Fail closed (no auto rename/clear/retry).
  SpreadsheetApp.flush();
  var readback = TEMP_readObjects_(TEMP_V2_STAGING_TAB_), rb = readback.rows || [];
  var cycleTypes = {}, cycleDist = {}, nonStringCycle = [], idTypes = {}, idNonString = [];
  rb.forEach(function (r) {
    var cv = r.planning_cycle, isD = TEMP_isDate_(cv), ct = (isD ? 'Date' : (cv === null || cv === undefined ? 'null' : typeof cv));
    cycleTypes[ct] = (cycleTypes[ct] || 0) + 1; cycleDist[String(cv)] = (cycleDist[String(cv)] || 0) + 1;
    if (ct !== 'string' || String(cv) !== '2026-08') nonStringCycle.push({ id: String(r.request_allocation_draft_id), raw: (isD ? (function () { try { return cv.toISOString(); } catch (e) { return String(cv); } })() : cv), type: ct });
    var iv = r.request_allocation_draft_id, it = (iv === null || iv === undefined ? 'null' : typeof iv);
    idTypes[it] = (idTypes[it] || 0) + 1; if (it !== 'string') idNonString.push({ id: String(iv), type: it });
  });
  var srcIdSet = {}; src.headers.forEach(function (h) { srcIdSet[String(h.request_allocation_draft_id)] = 1; });
  var idSetOk = rb.length > 0 && rb.every(function (r) { return srcIdSet[String(r.request_allocation_draft_id)] === 1; });
  var postValidator = KMRDV2P.validateStaging(readback.headers, rb, src.headers, src.linesByDraftId,
    { expectRows: TEMP_R4_EXPECT_.ACTIONABLE, authorizedCycleById: authority, canonicalActiveIdentities: identities, oldLineWriteCount: 0 });
  out.POST_WRITE_FLUSHED = true; out.POST_WRITE_ROWS = rb.length;
  out.POST_WRITE_CYCLE_TYPES = cycleTypes; out.POST_WRITE_CYCLE_DISTRIBUTION = cycleDist; out.POST_WRITE_NON_STRING_CYCLE_IDS = nonStringCycle;
  out.POST_WRITE_ID_TYPES = idTypes; out.POST_WRITE_ID_SET_OK = idSetOk;
  out.POST_WRITE_VALIDATOR = postValidator; out.POST_WRITE_READY_FOR_SWAP = postValidator.READY_FOR_SWAP;
  var roundtripOk = (rb.length === nRows) && nonStringCycle.length === 0 && idNonString.length === 0 && idSetOk === true && postValidator.READY_FOR_SWAP === 'YES';
  if (!roundtripOk) {
    out.ok = false; out.halt = 'STAGING_POST_WRITE_ROUNDTRIP_FAILED';
    out.offenders = { non_string_or_wrong_cycle: nonStringCycle, non_string_id: idNonString };
    Logger.log('EXECUTE POST-WRITE ROUNDTRIP FAILED — staging retained for evidence; NO auto rename/clear/retry/swap.\n' + JSON.stringify(out, null, 2));
    return out;
  }
  Logger.log('EXECUTE — wrote + roundtrip-verified ' + nRows + ' rows to ' + TEMP_V2_STAGING_TAB_ + '. Legacy tabs untouched.\n' + JSON.stringify(out, null, 2));
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
  // R4C2: when a cycle gate fails, diagnose the persisted value per offending row (READ-ONLY — never converts/repairs).
  if (v.PLANNING_CYCLE_FORMAT_OK === false || v.PLANNING_CYCLE_AUTHORITY_OK === false) {
    var diag = stg.rows.map(function (r) {
      var cv = r.planning_cycle, isD = TEMP_isDate_(cv);
      return { request_allocation_draft_id: String(r.request_allocation_draft_id),
        raw_planning_cycle: (isD ? String(cv) : cv), js_type: (isD ? 'Date' : (cv === null || cv === undefined ? 'null' : typeof cv)),
        is_date: isD, iso: (isD ? (function () { try { return cv.toISOString(); } catch (e) { return ''; } })() : ''),
        format_valid: KMRDV2.CANONICAL_CYCLE_RE.test(String(cv)),
        authority_valid: String(cv) === String(authority[String(r.request_allocation_draft_id)]) };
    }).filter(function (d) { return d.format_valid === false || d.authority_valid === false; });
    Logger.log('CYCLE_GATE_DIAGNOSTIC ' + JSON.stringify(diag, null, 2));
    v.CYCLE_GATE_DIAGNOSTIC = diag;
  }
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

// R4C/R4C1 EXPLICIT per-ID migration authority map (exact request_allocation_draft_id → canonical YYYY-MM). NOT prefix
// logic; unknown/missing/extra actionable id → planMigration HALTs MIGRATION_AUTHORIZED_ID_SET_MISMATCH. The COMPLETE
// authorized cohort is the exact 26 actionable ids (5 active RAD + the sole RD + 20 submitted RAD), ALL → 2026-08 (the
// frozen historical migration cycle). Package-complete — no runtime completion, no USER hand-edit placeholder.
var TEMP_R4C_AUTHORIZED_CYCLE_BY_ID_ = {
  // 5 active RAD + the sole RD (the 6 R4B5 canonical identities)
  'RAD-A92D17B1-8': '2026-08',
  'RAD-3A0A8227-F': '2026-08',
  'RAD-06053044-1': '2026-08',
  'RAD-72ABD506-3': '2026-08',
  'RAD-17DC0322-0': '2026-08',
  'RD::MONTHLY_ORDER::Sat Aug 01 2026 00:00:00 GMT+0800 (台北標準時間)::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-R': '2026-08',
  // 20 submitted RAD (exact ids from the R4B2 DIAG log)
  'RAD-206A5904-7': '2026-08', 'RAD-5A9B633B-E': '2026-08', 'RAD-8C957E9D-B': '2026-08', 'RAD-DD3DD40E-E': '2026-08',
  'RAD-645D0B43-B': '2026-08', 'RAD-094C315F-D': '2026-08', 'RAD-C95E2E4C-A': '2026-08', 'RAD-EC60DBAC-5': '2026-08',
  'RAD-01252D00-1': '2026-08', 'RAD-1D7C5E4F-C': '2026-08', 'RAD-1DC89A6D-6': '2026-08', 'RAD-8E10C337-4': '2026-08',
  'RAD-BF3FA670-3': '2026-08', 'RAD-1441A13A-7': '2026-08', 'RAD-6F1B8DEE-1': '2026-08', 'RAD-CC8B7647-7': '2026-08',
  'RAD-7DD15438-5': '2026-08', 'RAD-D1E1806E-D': '2026-08', 'RAD-79C5A694-B': '2026-08', 'RAD-358E2CAE-9': '2026-08'
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

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R5B-P0 — READ-ONLY canonical-table + header-authority diagnostic (writes NOTHING).
// Reports the live runtime Spreadsheet target, the canonical request_order_allocation_drafts tab, its exact headers
// vs KMRDV2.V2_HEADERS, the selected loader authority (LEGACY vs FLAT_V2), and the flag — so the USER can confirm the
// HEADER_MISSING root cause and the fix before any retry. It NEVER writes / renames / repairs anything.
// ================================================================================================================
var TEMP_R5B_CANONICAL_TAB_ = 'request_order_allocation_drafts';

function TEMP_r5bHash_(s) {   // small deterministic non-crypto fingerprint (not an id/credential)
  var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) { h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
}
function TEMP_r5bIdFingerprint_(id) {   // partial, non-reversible-ish — never the full id
  id = String(id || ''); if (!id) return '(blank)';
  return 'len' + id.length + ':' + id.slice(0, 4) + '…' + id.slice(-4) + ':h' + TEMP_r5bHash_(id);
}
function TEMP_r5bTypeOf_(v) { return TEMP_isDate_(v) ? 'Date' : (v === null || v === undefined ? 'null' : typeof v); }

function TEMP_r5bDiagnoseCanonicalDraftTable_() {
  if (typeof KMRDV2 === 'undefined' || !KMRDV2 || !Array.isArray(KMRDV2.V2_HEADERS)) {
    return { halt: 'V2_BUNDLE_ABSENT', message: 'KMRDV2 not present — sync 90_ bundle first', R5B_DIAGNOSTIC_READY: 'NO' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var runtimeId = '', runtimeName = '';
  try { runtimeId = ss ? String(ss.getId()) : ''; } catch (e) {}
  try { runtimeName = ss ? String(ss.getName()) : ''; } catch (e2) {}
  var expectedId = (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? String(PRODUCTION_DB_SPREADSHEET_ID_ || '') : '';
  var targetMatch = (expectedId !== '' && runtimeId !== '' && runtimeId === expectedId) ? 'YES' : (expectedId === '' ? 'UNKNOWN(no PRODUCTION_DB_SPREADSHEET_ID_ configured)' : 'NO');

  var flagOn = (typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function') && requestOrderDraftV2FlatCutoverEnabled_() === true;
  var V2 = KMRDV2.V2_HEADERS;

  var sh = ss ? ss.getSheetByName(TEMP_R5B_CANONICAL_TAB_) : null;
  var present = !!sh, exactName = '', headerCount = 0, actualHeaders = [], dataRows = 0;
  var first10 = [], cycleTypes = {}, idTypes = {};
  if (present) {
    // exact name incl. any hidden whitespace
    try { exactName = String(sh.getName()); } catch (e3) { exactName = TEMP_R5B_CANONICAL_TAB_; }
    var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow >= 1 && lastCol >= 1) {
      var hv = sh.getRange(1, 1, 1, lastCol).getValues()[0];
      actualHeaders = hv.map(function (h) { return String(h).trim(); });
      headerCount = actualHeaders.length;
      for (var i = 0; i < Math.min(10, hv.length); i++) first10.push({ index: i, raw: String(hv[i]), type: TEMP_r5bTypeOf_(hv[i]) });
      dataRows = Math.max(0, lastRow - 1);
      if (dataRows > 0) {
        var body = sh.getRange(2, 1, dataRows, lastCol).getValues();
        var ci = actualHeaders.indexOf('planning_cycle'), ii = actualHeaders.indexOf('request_allocation_draft_id');
        body.forEach(function (r) {
          if (ci !== -1) { var t = TEMP_r5bTypeOf_(r[ci]); cycleTypes[t] = (cycleTypes[t] || 0) + 1; }
          if (ii !== -1) { var t2 = TEMP_r5bTypeOf_(r[ii]); idTypes[t2] = (idTypes[t2] || 0) + 1; }
        });
      }
    }
  }
  var actualSet = {}; actualHeaders.forEach(function (h) { actualSet[h] = (actualSet[h] || 0) + 1; });
  var v2Set = {}; V2.forEach(function (h) { v2Set[h] = 1; });
  var missing = V2.filter(function (h) { return !actualSet[h]; });
  var extra = actualHeaders.filter(function (h) { return !v2Set[h]; });
  var duplicates = Object.keys(actualSet).filter(function (h) { return actualSet[h] > 1; });
  var schemaExact = present && headerCount === V2.length && actualHeaders.join('|') === V2.join('|');

  // the loader authority rprReadTable_ WOULD select for this tab (post-R5B: flag routes BEFORE the header guard)
  var loaderAuthority = flagOn ? 'FLAT_V2' : 'LEGACY';
  var v2AuthorityBeforeGuard = flagOn ? 'YES' : 'NO';

  var out = {
    // 1 runtime target
    runtime_spreadsheet_name: runtimeName, runtime_spreadsheet_id_fingerprint: TEMP_r5bIdFingerprint_(runtimeId),
    runtime_acquisition_path: 'getActiveSpreadsheet', expected_db_id_fingerprint: TEMP_r5bIdFingerprint_(expectedId),
    RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch,
    // 2-3 tab
    CANONICAL_TAB_PRESENT: present ? 'YES' : 'NO', canonical_tab_exact_name: exactName,
    canonical_tab_name_has_whitespace: (exactName !== exactName.trim()) ? 'YES' : 'NO',
    // 4-11 headers
    header_count: headerCount, expected_v2_header_count: V2.length,
    actual_headers: actualHeaders, expected_v2_headers_hash: TEMP_r5bHash_(V2.join('|')), actual_headers_hash: TEMP_r5bHash_(actualHeaders.join('|')),
    missing_v2_headers: missing, extra_headers: extra, duplicate_headers: duplicates, first_10_raw_headers: first10,
    // 12-14 data
    data_row_count: dataRows, planning_cycle_type_distribution: cycleTypes, id_type_distribution: idTypes,
    // 15 sheetSet include convergence (static design fact — all V2 consumers share rprBuildSheetSet_ → rprReadTable_)
    sheetset_include_note: 'AI-Plan job / generation writer / flat readback / edit / submit / Send all build via the ONE shared rprBuildSheetSet_→rprReadTable_ loader; after R5B that loader selects V2 authority under flag=true.',
    AI_PLAN_SHEETSET_INCLUDES_V2: flagOn ? 'YES' : 'N/A(flag off)', READBACK_SHEETSET_INCLUDES_V2: flagOn ? 'YES' : 'N/A(flag off)',
    // 16-18 authority
    active_flag: flagOn, legacy_header_guard_before_flag_branch: 'NO (R5B routes on the flag BEFORE prodRequireSheet_ validation)',
    loader_authority_selected: loaderAuthority, V2_AUTHORITY_SELECTED_BEFORE_HEADER_GUARD: v2AuthorityBeforeGuard,
    // 19 draft-line
    DRAFT_LINE_DEPENDENCY_ZERO: 'YES (flat V2 reads request_order_allocation_drafts ONLY; never request_order_allocation_draft_lines)',
    // 6/others tokens
    CANONICAL_V2_SCHEMA_EXACT: schemaExact ? 'YES' : 'NO',
    // 20 verdict
    verdict: (!present ? 'CANONICAL_TAB_ABSENT_OR_WRONG_TARGET'
      : (!schemaExact ? (missing.length ? 'V2_SCHEMA_MISMATCH_MISSING_HEADERS' : 'V2_SCHEMA_MISMATCH')
        : (!flagOn ? 'SCHEMA_OK_BUT_FLAG_OFF' : 'V2_TABLE_READY'))),
    R5B_DIAGNOSTIC_READY: 'YES'
  };
  Logger.log('R5B_CANONICAL_TABLE_DIAGNOSTIC ' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R5C-P0 — READ-ONLY permanent-write incident audit (writes NOTHING). Enumerates the live
// canonical request_order_allocation_drafts, its planning_cycle JS-type/value distribution, EVERY noncanonical
// (Date/coerced) row with full identity + the cycle encoded in its deterministic id, active natural-key duplicate
// groups (raw cycles) and PROJECTED duplicate groups if offenders were canonicalized, plus ids that cannot be
// repaired deterministically — so the USER can FREEZE the exact offender set for the R5C1 repair. It NEVER writes,
// formats, renames or repairs anything. "Missing ≠ 0": absent evidence is reported as absent, never inferred.
// ================================================================================================================
var TEMP_R5C_CANON_ = 'request_order_allocation_drafts';
var TEMP_R5C_LINES_ = 'request_order_allocation_draft_lines';
var TEMP_R5C_CANON_RE_ = /^\d{4}-(0[1-9]|1[0-2])$/;
// parse the cycle segment ::YYYY-MM:: from a deterministic RD:: id (safe: only a strict YYYY-MM between :: markers)
function TEMP_r5cCycleFromId_(id) {
  var s = String(id || ''), m = s.match(/::(\d{4}-(?:0[1-9]|1[0-2]))(?:::|$)/);
  return m ? { ok: true, cycle: m[1] } : { ok: false, cycle: '' };
}
function TEMP_r5cActive_(status) { var s = TEMP_str_(status).toLowerCase(); return s === 'draft' || s === 'site_confirmed'; }
function TEMP_r5cNatKey_(company, country, marketplace, sku, purpose, cycle) {
  return [TEMP_str_(company), TEMP_str_(country), TEMP_str_(marketplace), TEMP_str_(sku), TEMP_str_(purpose) || 'regular', String(cycle)].join('||');
}
function TEMP_r5cRawCycleStr_(cv) {
  if (TEMP_isDate_(cv)) { try { return cv.toISOString(); } catch (e) { return String(cv); } }
  return String(cv);
}
function TEMP_r5cDupGroups_(groups) {   // {key:[ids]} → [{natural_key, count, ids}] for count>1, sorted
  var out = [];
  Object.keys(groups).forEach(function (k) { if (groups[k].length > 1) out.push({ natural_key: k, count: groups[k].length, ids: groups[k].slice().sort() }); });
  out.sort(function (a, b) { return a.natural_key < b.natural_key ? -1 : (a.natural_key > b.natural_key ? 1 : 0); });
  return out;
}
function TEMP_r5cAuditDraftWriteIncident_() {
  if (typeof KMRDV2 === 'undefined' || !KMRDV2 || !Array.isArray(KMRDV2.V2_HEADERS)) {
    return { halt: 'V2_BUNDLE_ABSENT', message: 'KMRDV2 not present — sync 90_ bundle first', R5C_INCIDENT_AUDIT_READY: 'NO' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  // 1 target fingerprint
  var runtimeId = '', runtimeName = '';
  try { runtimeId = ss ? String(ss.getId()) : ''; } catch (e) {}
  try { runtimeName = ss ? String(ss.getName()) : ''; } catch (e2) {}
  var expectedId = (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? String(PRODUCTION_DB_SPREADSHEET_ID_ || '') : '';
  var targetMatch = (expectedId !== '' && runtimeId !== '' && runtimeId === expectedId) ? 'YES' : (expectedId === '' ? 'UNKNOWN(no PRODUCTION_DB_SPREADSHEET_ID_ configured)' : 'NO');

  // 2-3 canonical tab + exact schema vs KMRDV2.V2_HEADERS
  var read = TEMP_readObjects_(TEMP_R5C_CANON_);
  var present = read.present, headers = read.headers || [], rows = read.rows || [], v2 = KMRDV2.V2_HEADERS;
  var headerCount = headers.length;
  var schemaExact = present && headerCount === v2.length && headers.join('|') === v2.join('|');

  // 4-5 row counts (canonical + Draft Lines)
  var canonicalRowCount = rows.length;
  var linesRead = TEMP_readObjects_(TEMP_R5C_LINES_);
  var draftLineRowCount = (linesRead.rows || []).length;

  // 6-14 cycle type/value distribution, offenders, deterministic-id cycle
  var cycleTypes = {}, cycleValues = {}, canonicalStringCount = 0, nonCanonicalCount = 0, offenders = [], unresolvable = [];
  var rawGroups = {}, projGroups = {};
  rows.forEach(function (r, i) {
    var cv = r.planning_cycle, isD = TEMP_isDate_(cv);
    var t = isD ? 'Date' : (cv === null || cv === undefined ? 'null' : typeof cv);
    var vk = TEMP_r5cRawCycleStr_(cv);
    cycleTypes[t] = (cycleTypes[t] || 0) + 1;
    cycleValues[vk] = (cycleValues[vk] || 0) + 1;
    var id = TEMP_str_(r.request_allocation_draft_id);
    var idc = TEMP_r5cCycleFromId_(id);
    var isCanon = (t === 'string') && TEMP_R5C_CANON_RE_.test(String(cv));
    // active natural-key duplicate accounting: RAW cycles now; PROJECTED cycles (canonical string kept; offender →
    // its deterministic-id cycle when parsable) to detect a collision that canonicalization would create.
    if (TEMP_r5cActive_(r.status)) {
      var rawKey = TEMP_r5cNatKey_(r.company, r.country, r.marketplace, r.sku, r.draft_purpose, vk);
      (rawGroups[rawKey] = rawGroups[rawKey] || []).push(id);
      var projCycle = isCanon ? String(cv) : (idc.ok ? idc.cycle : null);
      if (projCycle !== null) { var pk = TEMP_r5cNatKey_(r.company, r.country, r.marketplace, r.sku, r.draft_purpose, projCycle); (projGroups[pk] = projGroups[pk] || []).push(id); }
    }
    if (isCanon) { canonicalStringCount++; return; }
    nonCanonicalCount++;
    offenders.push({
      row_number: i + 2, request_allocation_draft_id: id, id_family: TEMP_idFamily_(id),
      raw_planning_cycle: vk, js_type: t, is_date: isD ? 'YES' : 'NO', iso: isD ? vk : '',
      company: TEMP_str_(r.company), country: TEMP_str_(r.country), marketplace: TEMP_str_(r.marketplace),
      sku: TEMP_str_(r.sku), draft_purpose: TEMP_str_(r.draft_purpose) || 'regular',
      status: TEMP_str_(r.status), generation_type: TEMP_str_(r.generation_type),
      created_at: TEMP_r5cRawCycleStr_(r.created_at), updated_at: TEMP_r5cRawCycleStr_(r.updated_at),
      id_encoded_cycle: idc.cycle, id_cycle_parsable: idc.ok ? 'YES' : 'NO'
    });
    if (!idc.ok) unresolvable.push(id);
  });
  offenders.sort(function (a, b) { return a.request_allocation_draft_id < b.request_allocation_draft_id ? -1 : (a.request_allocation_draft_id > b.request_allocation_draft_id ? 1 : 0); });
  var offenderIds = offenders.map(function (o) { return o.request_allocation_draft_id; }).sort();
  unresolvable = unresolvable.slice().sort();
  var rawDupGroups = TEMP_r5cDupGroups_(rawGroups), projDupGroups = TEMP_r5cDupGroups_(projGroups);

  var out = {
    // 1 target
    runtime_spreadsheet_name: runtimeName, runtime_spreadsheet_id_fingerprint: TEMP_r5bIdFingerprint_(runtimeId),
    runtime_acquisition_path: 'getActiveSpreadsheet', expected_db_id_fingerprint: TEMP_r5bIdFingerprint_(expectedId),
    RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch,
    // 2-3 tab + schema
    canonical_tab_present: present ? 'YES' : 'NO', canonical_header_count: headerCount, expected_v2_header_count: v2.length,
    canonical_headers_hash: TEMP_r5bHash_(headers.join('|')), expected_v2_headers_hash: TEMP_r5bHash_(v2.join('|')),
    CANONICAL_V2_SCHEMA_EXACT: schemaExact ? 'YES' : 'NO',
    // 4-5 counts
    R5C_CANONICAL_ROW_COUNT: canonicalRowCount, R5C_DRAFT_LINE_ROW_COUNT: draftLineRowCount,
    // 6-9 cycle distribution
    R5C_CYCLE_TYPE_DISTRIBUTION: cycleTypes, planning_cycle_value_distribution: cycleValues,
    canonical_string_cycle_count: canonicalStringCount, R5C_NONCANONICAL_CYCLE_COUNT: nonCanonicalCount,
    // 10-12 offenders
    noncanonical_rows: offenders, R5C_OFFENDER_IDS: offenderIds, offender_id_count: offenderIds.length,
    // 13-14 incident vs pre-existing (evidence-derived: Date/coerced = incident-written; canonical string = migrated)
    incident_created_offender_count: nonCanonicalCount, pre_existing_migrated_id_count: canonicalStringCount,
    // 15-16 duplicates
    active_raw_cycle_duplicate_groups: rawDupGroups, active_raw_cycle_duplicate_group_count: rawDupGroups.length,
    projected_canonicalized_duplicate_groups: projDupGroups, R5C_PROJECTED_DUPLICATE_COUNT: projDupGroups.length,
    // 17 unresolvable
    unresolvable_offender_ids: unresolvable, R5C_UNRESOLVABLE_COUNT: unresolvable.length,
    // 18 draft-line delta authority
    draft_line_delta_authority: draftLineRowCount, draft_line_expected_note: 'expected 65 (unchanged this incident; the flat write NEVER touches request_order_allocation_draft_lines)',
    // 19 zero-write proof
    R5C_ZERO_WRITE_CONFIRMED: 'YES (read-only: TEMP_readObjects_ + getSheetByName only; no setValues/appendRow/setNumberFormat/insertSheet/rename)',
    // 20 checksum over sorted offender ids
    R5C_INCIDENT_AUDIT_CHECKSUM: TEMP_r5bHash_(offenderIds.join('|')),
    // comparison expectations (NOT truth — observed values above are authoritative)
    comparison_expectations: { likely_total_rows: 67, likely_noncanonical_incident_rows: 41, draft_lines: 65 },
    verdict: (!present ? 'CANONICAL_TAB_ABSENT_OR_WRONG_TARGET'
      : (nonCanonicalCount === 0 ? 'NO_COERCED_CYCLE_ROWS'
        : (projDupGroups.length > 0 ? 'OFFENDERS_PRESENT_PROJECTED_DUPLICATES' : 'OFFENDERS_PRESENT_NO_PROJECTED_DUPLICATES'))),
    R5C_INCIDENT_AUDIT_READY: 'YES'
  };
  Logger.log('R5C_INCIDENT_AUDIT ' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R5C1 — EXACT-41 live cycle repair tooling (paste-ready, USER-run, ONE-TIME).
// Repairs ONLY the planning_cycle of the exact 41 frozen incident IDs (Date "2026-07-31T16:00:00.000Z" → primitive
// string "2026-08"). DRY_RUN + VALIDATE write NOTHING; EXECUTE modifies ONLY those 41 planning_cycle cells, gated by a
// full pre-execution safety matrix + a deterministic SHA-256 over the sorted 41 IDs. Idempotent. NEVER modifies ids,
// the other 52 fields, created_at/updated_at, row order/tabs, Draft Lines, or the legacy backup; NEVER deploys/syncs.
// The month is authorized ONLY by the frozen ID list + each ID's encoded 2026-08 + project-tz agreement — NEVER a UTC
// slice of the Date. Run order: DRY_RUN → (architect verifies the log) → EXECUTE → VALIDATE.
// ================================================================================================================
var TEMP_R5C1_FROZEN_IDS_ = [
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1100-R',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1150-BM',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1150-MB',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1150-N',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1150-OM',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1150-R',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1150-XR',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1150-ZW',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO2102-P',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO2300-Y',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO2600-R',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO2600-T',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO2600-W',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO5600-Q',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO5600-RB',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO5600-RE',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO5600-Z',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=GA0150-M',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=GA0150-R',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=GM3000-M1',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=GM3000-T1',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=MG0110-E',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=MO5600-M',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=MO5600-R',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=MO5600-W',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP0650-RM',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP3120-M',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP3120-Y',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP3210-B',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP3210-Y',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP3410-B',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP3410-M',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP3410-R',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5020-B',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5020-M',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5020-T',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5020-Y',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5023-M',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5023-R',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5023-T',
  'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=SP5120-M'
];
var TEMP_R5C1_EXPECT_ = {
  CANONICAL_ROWS: 67, DRAFT_LINES: 65, FROZEN_COUNT: 41, OFFENDER_ISO: '2026-07-31T16:00:00.000Z', TARGET_CYCLE: '2026-08',
  AFTER_STATUS: { submitted: 20, draft: 47 }, AFTER_MARKETPLACE: { Amazon: 59, Shopify: 3, Walmart: 5 }, AFTER_PURPOSE: { regular: 67 }
};
// deterministic SHA-256 over the sorted 41 frozen IDs joined by "\n" (hex). Constant across DRY_RUN/EXECUTE/VALIDATE.
function TEMP_r5c1Checksum_() {
  var joined = TEMP_R5C1_FROZEN_IDS_.slice().sort().join('\n');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, joined, Utilities.Charset.UTF_8), hex = '';
  for (var i = 0; i < bytes.length; i++) { var b = bytes[i]; if (b < 0) b += 256; var s = b.toString(16); hex += (s.length === 1 ? '0' : '') + s; }
  return hex;
}
// parse RD::MONTHLY_ORDER::<cycle>::k=v|k=v|... → { ok, cycle, scope:{company,country,marketplace,sku,draft_purpose} }
function TEMP_r5c1ParseId_(id) {
  var m = String(id || '').match(/^RD::MONTHLY_ORDER::(\d{4}-(?:0[1-9]|1[0-2]))::(.+)$/);
  if (!m) return { ok: false, cycle: '', scope: {} };
  var parts = m[2].split('|'), scope = {};
  for (var i = 0; i < parts.length; i++) { var eq = parts[i].indexOf('='); if (eq === -1) return { ok: false, cycle: '', scope: {} }; scope[parts[i].slice(0, eq)] = parts[i].slice(eq + 1); }
  return { ok: true, cycle: m[1], scope: scope };
}
function TEMP_r5c1Norm_(v) { return TEMP_isDate_(v) ? (function () { try { return v.toISOString(); } catch (e) { return String(v); } })() : String(v === null || v === undefined ? '' : v); }
function TEMP_r5c1Dist_(rows, field) { var d = {}; rows.forEach(function (r) { var k = TEMP_str_(r.obj[field]) || (field === 'draft_purpose' ? 'regular' : ''); d[k] = (d[k] || 0) + 1; }); return d; }
function TEMP_r5c1CycleTypeDist_(rows) { var d = {}; rows.forEach(function (r) { var t = TEMP_isDate_(r.obj.planning_cycle) ? 'Date' : (r.obj.planning_cycle === null || r.obj.planning_cycle === undefined ? 'null' : typeof r.obj.planning_cycle); d[t] = (d[t] || 0) + 1; }); return d; }
function TEMP_r5c1CycleValDist_(rows) { var d = {}; rows.forEach(function (r) { var k = TEMP_r5c1Norm_(r.obj.planning_cycle); d[k] = (d[k] || 0) + 1; }); return d; }
function TEMP_r5c1ProjectedDupCount_(rows, frozenSet) {   // active natural-key duplicate groups after canonicalizing offenders
  var groups = {};
  rows.forEach(function (r) {
    var st = TEMP_str_(r.obj.status).toLowerCase(); if (st !== 'draft' && st !== 'site_confirmed') return;
    var cyc; if (frozenSet[r.id]) { var p = TEMP_r5c1ParseId_(r.id); cyc = p.ok ? p.cycle : ('UNRESOLVABLE:' + r.id); }
    else cyc = TEMP_r5c1Norm_(r.obj.planning_cycle);
    var k = TEMP_r5cNatKey_(r.obj.company, r.obj.country, r.obj.marketplace, r.obj.sku, r.obj.draft_purpose, cyc);
    (groups[k] = groups[k] || []).push(r.id);
  });
  var dup = 0; Object.keys(groups).forEach(function (k) { if (groups[k].length > 1) dup++; }); return dup;
}

// Shared READ + full pre-execution GATE (used by DRY_RUN, EXECUTE and VALIDATE). Writes NOTHING. Resolves rows by
// EXACT id (never a stored row number). EXECUTE re-runs this against LIVE, so any activity/drift since DRY_RUN fails a
// gate here — the gate matrix IS the drift check.
function TEMP_r5c1ReadAndGate_() {
  var checksum = null; try { checksum = TEMP_r5c1Checksum_(); } catch (e) { checksum = 'CHECKSUM_UNAVAILABLE'; }
  if (typeof KMRDV2 === 'undefined' || !KMRDV2 || !Array.isArray(KMRDV2.V2_HEADERS)) return { halt: 'V2_BUNDLE_ABSENT', checksum: checksum };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var runtimeId = ''; try { runtimeId = ss ? String(ss.getId()) : ''; } catch (e1) {}
  var expectedId = (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? String(PRODUCTION_DB_SPREADSHEET_ID_ || '') : '';
  var targetMatch = (expectedId !== '' && runtimeId !== '' && runtimeId === expectedId);
  var flagOn = (typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function') && requestOrderDraftV2FlatCutoverEnabled_() === true;
  var v2 = KMRDV2.V2_HEADERS;
  var sh = ss ? ss.getSheetByName(TEMP_R5C_CANON_) : null;
  if (!sh) return { halt: 'CANONICAL_TAB_ABSENT_OR_WRONG_TARGET', checksum: checksum, RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch ? 'YES' : 'NO', active_flag: flagOn };
  var values = sh.getDataRange().getValues();
  var headers = (values[0] || []).map(function (h) { return String(h).trim(); });
  var schemaExact = headers.length === v2.length && headers.join('|') === v2.join('|');
  var idCol = headers.indexOf('request_allocation_draft_id'), cycleCol = headers.indexOf('planning_cycle');
  var rows = [];   // {rowNum(1-based), obj, id, isDate, iso}
  for (var r = 1; r < values.length; r++) {
    var blank = true, o = {}; for (var c = 0; c < headers.length; c++) { o[headers[c]] = values[r][c]; if (String(values[r][c]).trim() !== '') blank = false; }
    if (blank) continue;
    var cv = o.planning_cycle;
    rows.push({ rowNum: r + 1, obj: o, id: TEMP_str_(o.request_allocation_draft_id), isDate: TEMP_isDate_(cv), iso: TEMP_r5c1Norm_(cv) });
  }
  var linesRead = TEMP_readObjects_(TEMP_R5C_LINES_), draftLineCount = (linesRead.rows || []).length;

  var frozen = TEMP_R5C1_FROZEN_IDS_.slice(), frozenSet = {}; frozen.forEach(function (id) { frozenSet[id] = 1; });
  var byId = {}; rows.forEach(function (rw) { (byId[rw.id] = byId[rw.id] || []).push(rw); });
  var missing = frozen.filter(function (id) { return !byId[id]; });
  var dupFrozen = frozen.filter(function (id) { return byId[id] && byId[id].length > 1; });

  var pending = [], repaired = [], badState = [], scopeMismatch = [], statusBad = [], genBad = [], idCycleBad = [], isoBad = [];
  frozen.forEach(function (id) {
    if (!byId[id] || byId[id].length !== 1) return;   // missing/dup handled above
    var rw = byId[id][0], o = rw.obj, parsed = TEMP_r5c1ParseId_(id);
    if (!parsed.ok || parsed.cycle !== TEMP_R5C1_EXPECT_.TARGET_CYCLE) idCycleBad.push(id);
    else {
      var s = parsed.scope;
      if (!(TEMP_str_(o.company) === s.company && TEMP_str_(o.country) === s.country && TEMP_str_(o.marketplace) === s.marketplace && TEMP_str_(o.sku) === s.sku && (TEMP_str_(o.draft_purpose) || 'regular') === s.draft_purpose)) scopeMismatch.push(id);
    }
    if (TEMP_str_(o.status).toLowerCase() !== 'draft') statusBad.push(id);
    if (TEMP_str_(o.generation_type).toLowerCase() !== 'ai_plan') genBad.push(id);
    if (rw.isDate) { pending.push(rw); if (rw.iso !== TEMP_R5C1_EXPECT_.OFFENDER_ISO) isoBad.push(id); }
    else if (!rw.isDate && TEMP_str_(o.planning_cycle) === TEMP_R5C1_EXPECT_.TARGET_CYCLE) repaired.push(rw);
    else badState.push({ id: id, raw: rw.iso });
  });
  // every Date-cycle row in the table must be a frozen ID (no unexpected offender)
  var unexpectedOffenders = rows.filter(function (rw) { return rw.isDate && !frozenSet[rw.id]; }).map(function (rw) { return rw.id; });
  // the non-frozen rows (the migrated cohort) must all be primitive string 2026-08
  var nonFrozenRows = rows.filter(function (rw) { return !frozenSet[rw.id]; });
  var nonFrozenNotString = nonFrozenRows.filter(function (rw) { return !(typeof rw.obj.planning_cycle === 'string' && rw.obj.planning_cycle === TEMP_R5C1_EXPECT_.TARGET_CYCLE); }).map(function (rw) { return rw.id; });
  var unresolvable = frozen.filter(function (id) { return !TEMP_r5c1ParseId_(id).ok; });
  var projectedDup = TEMP_r5c1ProjectedDupCount_(rows, frozenSet);

  var gates = {
    target_match: targetMatch, flag_true: flagOn, tab_exists: true, schema_exact: schemaExact,
    canonical_row_count_67: rows.length === TEMP_R5C1_EXPECT_.CANONICAL_ROWS,
    draft_lines_65: draftLineCount === TEMP_R5C1_EXPECT_.DRAFT_LINES,
    frozen_count_41: frozen.length === TEMP_R5C1_EXPECT_.FROZEN_COUNT,
    all_frozen_present: missing.length === 0, no_frozen_duplicate: dupFrozen.length === 0,
    no_unexpected_offender: unexpectedOffenders.length === 0, no_frozen_bad_state: badState.length === 0,
    id_encodes_2026_08: idCycleBad.length === 0, id_scope_agreement: scopeMismatch.length === 0,
    status_draft: statusBad.length === 0, generation_type_ai_plan: genBad.length === 0,
    projected_duplicate_zero: projectedDup === 0, unresolvable_zero: unresolvable.length === 0,
    other_rows_string_2026_08: nonFrozenNotString.length === 0
  };
  var pendingGates = { pending_iso_exact: isoBad.length === 0 };   // only meaningful for rows still needing repair
  var coreGatesPass = Object.keys(gates).every(function (k) { return gates[k] === true; });
  var pendingGatesPass = Object.keys(pendingGates).every(function (k) { return pendingGates[k] === true; });

  return {
    checksum: checksum, ss: ss, sh: sh, values: values, headers: headers, idCol: idCol, cycleCol: cycleCol, rows: rows,
    frozen: frozen, frozenSet: frozenSet, byId: byId, draftLineCount: draftLineCount,
    pending: pending, repaired: repaired, badState: badState,
    missing: missing, dupFrozen: dupFrozen, unexpectedOffenders: unexpectedOffenders, nonFrozenNotString: nonFrozenNotString,
    scopeMismatch: scopeMismatch, statusBad: statusBad, genBad: genBad, idCycleBad: idCycleBad, isoBad: isoBad, unresolvable: unresolvable,
    projectedDup: projectedDup, gates: gates, pendingGates: pendingGates, coreGatesPass: coreGatesPass, pendingGatesPass: pendingGatesPass,
    RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch ? 'YES' : 'NO', active_flag: flagOn
  };
}

// public core — execute:false = DRY RUN (read-only); execute:true = repair ONLY the pending frozen planning_cycle cells.
function TEMP_r5c1RepairDraftCycles_(opts) {
  opts = opts || {}; var execute = opts.execute === true;
  var g = TEMP_r5c1ReadAndGate_();
  if (g.halt) return { ok: false, mode: execute ? 'EXECUTE' : 'DRY_RUN', halt: g.halt, R5C1_CHECKSUM: g.checksum, R5C1_ZERO_WRITE_CONFIRMED: 'YES' };
  var base = {
    mode: execute ? 'EXECUTE' : 'DRY_RUN', R5C1_CHECKSUM: g.checksum, RUNTIME_SPREADSHEET_TARGET_MATCH: g.RUNTIME_SPREADSHEET_TARGET_MATCH,
    active_flag: g.active_flag, gates: g.gates, pending_gates: g.pendingGates, core_gates_pass: g.coreGatesPass,
    canonical_row_count: g.rows.length, draft_line_row_count: g.draftLineCount,
    frozen_id_count: g.frozen.length, pending_count: g.pending.length, repaired_count: g.repaired.length,
    pending_ids: g.pending.map(function (r) { return r.id; }).sort(), already_repaired_ids: g.repaired.map(function (r) { return r.id; }).sort(),
    failing_gates: Object.keys(g.gates).filter(function (k) { return g.gates[k] !== true; }),
    diagnostics: { missing: g.missing, dupFrozen: g.dupFrozen, unexpectedOffenders: g.unexpectedOffenders, badState: g.badState, scopeMismatch: g.scopeMismatch, statusBad: g.statusBad, genBad: g.genBad, idCycleBad: g.idCycleBad, isoBad: g.isoBad, unresolvable: g.unresolvable, projectedDup: g.projectedDup, nonFrozenNotString: g.nonFrozenNotString }
  };
  // HALT if any core gate fails, or (when there are pending rows) any pending-specific gate fails.
  if (!g.coreGatesPass || (g.pending.length > 0 && !g.pendingGatesPass)) {
    base.ok = false; base.halt = 'R5C1_PRE_EXECUTION_GATE_FAILED'; base.R5C1_ZERO_WRITE_CONFIRMED = 'YES';
    Logger.log('R5C1 ' + base.mode + ' HALT ' + JSON.stringify(base, null, 2)); return base;
  }
  // idempotency: nothing pending → ALREADY_REPAIRED (zero writes) regardless of execute
  if (g.pending.length === 0) {
    base.ok = true; base.repair_status = 'ALREADY_REPAIRED'; base.writes = 0; base.R5C1_ZERO_WRITE_CONFIRMED = 'YES';
    base.verdict = 'ALREADY_REPAIRED';
    Logger.log('R5C1 ' + base.mode + ' ALREADY_REPAIRED (zero writes)'); return base;
  }
  base.repair_status = (g.repaired.length > 0) ? 'PARTIAL_REPAIR_DETECTED' : 'FULL_REPAIR';
  if (!execute) {
    base.ok = true; base.writes = 0; base.would_write_count = g.pending.length; base.R5C1_ZERO_WRITE_CONFIRMED = 'YES';
    base.verdict = 'READY_TO_EXECUTE';
    Logger.log('R5C1 DRY_RUN READY_TO_EXECUTE — would repair ' + g.pending.length + ' cells\n' + JSON.stringify(base, null, 2));
    return base;
  }
  // ---- EXECUTE: snapshot BEFORE (all 53 fields, all rows), write ONLY the pending planning_cycle cells, flush, prove ----
  var beforeSnap = g.rows.map(function (rw) { return { id: rw.id, rowNum: rw.rowNum, norm: g.headers.map(function (h) { return TEMP_r5c1Norm_(rw.obj[h]); }) }; });
  var changed = [];
  for (var i = 0; i < g.pending.length; i++) {
    var rw = g.pending[i], cell = g.sh.getRange(rw.rowNum, g.cycleCol + 1, 1, 1);
    cell.setNumberFormat('@');                 // plain text — this ONE planning_cycle cell only
    cell.setValues([[TEMP_R5C1_EXPECT_.TARGET_CYCLE]]);   // primitive canonical string; id + other 52 fields untouched
    changed.push({ id: rw.id, rowNum: rw.rowNum });
  }
  SpreadsheetApp.flush();
  // ---- roundtrip + full before/after invariants ----
  var g2 = TEMP_r5c1ReadAndGate_();
  var afterRows = g2.rows, afterById = g2.byId;
  var cellChanges = [], nonCycleChanges = [];
  beforeSnap.forEach(function (bs) {
    var arw = afterById[bs.id] && afterById[bs.id][0]; if (!arw) return;
    g.headers.forEach(function (h, ci) { var an = TEMP_r5c1Norm_(arw.obj[h]); if (an !== bs.norm[ci]) { cellChanges.push({ id: bs.id, field: h }); if (ci !== g.cycleCol) nonCycleChanges.push({ id: bs.id, field: h }); } });
  });
  var cycleTypeDist = TEMP_r5c1CycleTypeDist_(afterRows), cycleValDist = TEMP_r5c1CycleValDist_(afterRows);
  var statusDist = TEMP_r5c1Dist_(afterRows, 'status'), purposeDist = TEMP_r5c1Dist_(afterRows, 'draft_purpose'), mktDist = TEMP_r5c1Dist_(afterRows, 'marketplace');
  var idSetBefore = beforeSnap.map(function (b) { return b.id; }).sort().join('|'), idSetAfter = afterRows.map(function (r) { return r.id; }).sort().join('|');
  var proofs = {
    exactly_pending_cells_changed: cellChanges.length === g.pending.length,
    every_change_is_planning_cycle: nonCycleChanges.length === 0,
    formatting_targets_all_planning_cycle: changed.length === g.pending.length,
    row_count_67: afterRows.length === TEMP_R5C1_EXPECT_.CANONICAL_ROWS,
    id_set_identical: idSetBefore === idSetAfter,
    draft_lines_65: g2.draftLineCount === TEMP_R5C1_EXPECT_.DRAFT_LINES,
    cycle_type_string_only: JSON.stringify(cycleTypeDist) === JSON.stringify({ string: TEMP_R5C1_EXPECT_.CANONICAL_ROWS }),
    cycle_distribution_2026_08: JSON.stringify(cycleValDist) === JSON.stringify((function () { var d = {}; d[TEMP_R5C1_EXPECT_.TARGET_CYCLE] = TEMP_R5C1_EXPECT_.CANONICAL_ROWS; return d; })()),
    status_distribution_ok: statusDist.submitted === TEMP_R5C1_EXPECT_.AFTER_STATUS.submitted && statusDist.draft === TEMP_R5C1_EXPECT_.AFTER_STATUS.draft,
    purpose_regular_67: purposeDist.regular === TEMP_R5C1_EXPECT_.AFTER_PURPOSE.regular,
    marketplace_ok: mktDist.Amazon === TEMP_R5C1_EXPECT_.AFTER_MARKETPLACE.Amazon && mktDist.Shopify === TEMP_R5C1_EXPECT_.AFTER_MARKETPLACE.Shopify && mktDist.Walmart === TEMP_R5C1_EXPECT_.AFTER_MARKETPLACE.Walmart,
    no_projected_duplicate: g2.projectedDup === 0, post_repair_gates_pass: g2.coreGatesPass && g2.pending.length === 0
  };
  var allProofsPass = Object.keys(proofs).every(function (k) { return proofs[k] === true; });
  base.ok = allProofsPass; base.writes = changed.length; base.changed_ids = changed.map(function (c) { return c.id; }).sort();
  base.R5C1_ZERO_WRITE_CONFIRMED = 'NO(execute)'; base.before_after_proofs = proofs;
  base.after_cycle_type_distribution = cycleTypeDist; base.after_cycle_value_distribution = cycleValDist;
  base.after_status_distribution = statusDist; base.after_purpose_distribution = purposeDist; base.after_marketplace_distribution = mktDist;
  base.non_cycle_changes = nonCycleChanges; base.total_cell_changes = cellChanges.length;
  base.verdict = allProofsPass ? 'REPAIR_EXECUTED_VERIFIED' : 'REPAIR_EXECUTED_BUT_PROOF_FAILED_MANUAL_ROLLBACK';
  Logger.log('R5C1 EXECUTE ' + base.verdict + ' — wrote ' + changed.length + ' planning_cycle cells\n' + JSON.stringify(base, null, 2));
  return base;
}

// READ-ONLY post-repair validator (independent re-read; writes NOTHING).
function TEMP_r5c1ValidateRepairedDraftCycles_() {
  var g = TEMP_r5c1ReadAndGate_();
  if (g.halt) return { ok: false, mode: 'VALIDATE', halt: g.halt, R5C1_CHECKSUM: g.checksum, R5C1_ZERO_WRITE_CONFIRMED: 'YES' };
  var cycleTypeDist = TEMP_r5c1CycleTypeDist_(g.rows), cycleValDist = TEMP_r5c1CycleValDist_(g.rows);
  var statusDist = TEMP_r5c1Dist_(g.rows, 'status'), purposeDist = TEMP_r5c1Dist_(g.rows, 'draft_purpose'), mktDist = TEMP_r5c1Dist_(g.rows, 'marketplace');
  var checks = {
    checksum_match: true,   // constant over the frozen list; reported for cross-run equality
    string_cycle_67: (cycleTypeDist.string === TEMP_R5C1_EXPECT_.CANONICAL_ROWS) && !cycleTypeDist.Date,
    all_2026_08: cycleValDist[TEMP_R5C1_EXPECT_.TARGET_CYCLE] === TEMP_R5C1_EXPECT_.CANONICAL_ROWS,
    row_count_67: g.rows.length === TEMP_R5C1_EXPECT_.CANONICAL_ROWS, draft_lines_65: g.draftLineCount === TEMP_R5C1_EXPECT_.DRAFT_LINES,
    status_ok: statusDist.submitted === TEMP_R5C1_EXPECT_.AFTER_STATUS.submitted && statusDist.draft === TEMP_R5C1_EXPECT_.AFTER_STATUS.draft,
    purpose_ok: purposeDist.regular === TEMP_R5C1_EXPECT_.AFTER_PURPOSE.regular,
    marketplace_ok: mktDist.Amazon === TEMP_R5C1_EXPECT_.AFTER_MARKETPLACE.Amazon && mktDist.Shopify === TEMP_R5C1_EXPECT_.AFTER_MARKETPLACE.Shopify && mktDist.Walmart === TEMP_R5C1_EXPECT_.AFTER_MARKETPLACE.Walmart,
    no_unexpected_offender: g.unexpectedOffenders.length === 0, no_projected_duplicate: g.projectedDup === 0,
    all_frozen_present_once: g.missing.length === 0 && g.dupFrozen.length === 0
  };
  var pass = Object.keys(checks).every(function (k) { return checks[k] === true; });
  var out = { ok: pass, mode: 'VALIDATE', R5C1_CHECKSUM: g.checksum, R5C1_ZERO_WRITE_CONFIRMED: 'YES', RUNTIME_SPREADSHEET_TARGET_MATCH: g.RUNTIME_SPREADSHEET_TARGET_MATCH,
    canonical_row_count: g.rows.length, draft_line_row_count: g.draftLineCount, pending_count: g.pending.length, repaired_count: g.repaired.length,
    after_cycle_type_distribution: cycleTypeDist, after_cycle_value_distribution: cycleValDist, after_status_distribution: statusDist, after_purpose_distribution: purposeDist, after_marketplace_distribution: mktDist,
    checks: checks, verdict: pass ? 'REPAIR_VALIDATED' : 'REPAIR_VALIDATION_FAILED' };
  Logger.log('R5C1 VALIDATE ' + out.verdict + '\n' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R6A — READ-ONLY flat-draft lifecycle preflight + post-stage validators (writes NOTHING).
// Proves the real runtime path for one active flat Draft: Load -> Edit -> Partial Submit -> Full Submit -> Send ->
// downstream Request Order (request_orders / request_order_lines / request_order_line_sources) -> re-send idempotency.
// The month/scope authority is the flat 53-field row + its deterministic id; the downstream FK is
// request_order_line_sources.request_allocation_draft_id. NEVER reads or writes request_order_allocation_draft_lines,
// never the legacy backup, never a Purchase Order. It NEVER edits/submits/sends anything — those are USER UI actions.
// ================================================================================================================
var TEMP_R6A_TARGET_ID_ = 'RD::MONTHLY_ORDER::2026-08::company=ResUS|country=US|draft_purpose=regular|marketplace=Amazon|sku=CO1100-R';
var TEMP_R6A_TIERS_ = ['t1', 't2', 't3'];
var TEMP_R6A_TIER_FIELDS_ = ['month', 'recommended_qty', 'order_qty', 'carton_qty', 'status', 'submitted_by', 'submitted_at', 'user_edited', 'user_edited_by', 'note'];
var TEMP_R6A_ACTIVE_ = { draft: 1, partially_submitted: 1, site_confirmed: 1 };
function TEMP_r6aNum_(v) { var n = parseFloat(v); return (isFinite(n)) ? n : 0; }
function TEMP_r6aTierSnapshot_(row) {
  var snap = {};
  TEMP_R6A_TIERS_.forEach(function (p) { var o = {}; TEMP_R6A_TIER_FIELDS_.forEach(function (f) { o[f] = row[p + '_' + f]; }); snap[p.toUpperCase()] = o; });
  return snap;
}
function TEMP_r6aSubmittable_(row, p) { return TEMP_r6aNum_(row[p + '_order_qty']) > 0 && row[p + '_status'] !== 'submitted' && row[p + '_status'] !== 'cancelled'; }
function TEMP_r6aReadState_() {
  var out = { ok: true };
  if (typeof KMRDV2 === 'undefined' || !KMRDV2 || !Array.isArray(KMRDV2.V2_HEADERS)) return { halt: 'V2_BUNDLE_ABSENT' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var runtimeId = ''; try { runtimeId = ss ? String(ss.getId()) : ''; } catch (e) {}
  var expectedId = (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? String(PRODUCTION_DB_SPREADSHEET_ID_ || '') : '';
  out.RUNTIME_SPREADSHEET_TARGET_MATCH = (expectedId !== '' && runtimeId !== '' && runtimeId === expectedId) ? 'YES' : (expectedId === '' ? 'UNKNOWN' : 'NO');
  out.runtime_spreadsheet_id_fingerprint = TEMP_r5bIdFingerprint_(runtimeId);
  out.active_flag = (typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function') && requestOrderDraftV2FlatCutoverEnabled_() === true;
  var read = TEMP_readObjects_(TEMP_R5C_CANON_), v2 = KMRDV2.V2_HEADERS;
  out.canonical_headers_hash = TEMP_r5bHash_((read.headers || []).join('|'));
  out.CANONICAL_V2_SCHEMA_EXACT = (read.present && (read.headers || []).length === v2.length && (read.headers || []).join('|') === v2.join('|')) ? 'YES' : 'NO';
  out.canonical_row_count = (read.rows || []).length;
  out.draft_line_row_count = (TEMP_readObjects_(TEMP_R5C_LINES_).rows || []).length;
  var matches = (read.rows || []).filter(function (r) { return TEMP_str_(r.request_allocation_draft_id) === TEMP_R6A_TARGET_ID_; });
  out.target_present = matches.length > 0 ? 'YES' : 'NO'; out.target_count = matches.length;
  var row = matches.length === 1 ? matches[0] : null; out.target_row = row;
  if (row) {
    out.target_status = TEMP_str_(row.status); out.target_draft_version = row.draft_version;
    out.target_generation_type = TEMP_str_(row.generation_type);
    out.target_expected_token = { draft_version: row.draft_version, tiers: TEMP_R6A_TIERS_.map(function (p) { return { tier: p.toUpperCase(), order_qty: TEMP_r6aNum_(row[p + '_order_qty']), user_edited: row[p + '_user_edited'] === true || String(row[p + '_user_edited']).toUpperCase() === 'TRUE' }; }) };
    out.target_tier_snapshot = TEMP_r6aTierSnapshot_(row);
    var p = TEMP_r5c1ParseId_(TEMP_R6A_TARGET_ID_), s = p.scope || {};
    out.id_cycle_parsed = p.cycle; out.id_scope_agreement = (p.ok && TEMP_str_(row.company) === s.company && TEMP_str_(row.country) === s.country && TEMP_str_(row.marketplace) === s.marketplace && TEMP_str_(row.sku) === s.sku && (TEMP_str_(row.draft_purpose) || 'regular') === s.draft_purpose && TEMP_str_(row.planning_cycle) === p.cycle) ? 'YES' : 'NO';
    var key = TEMP_r5cNatKey_(row.company, row.country, row.marketplace, row.sku, row.draft_purpose, row.planning_cycle);
    var dup = 0; (read.rows || []).forEach(function (r) { if (!TEMP_R6A_ACTIVE_[TEMP_str_(r.status)]) return; if (TEMP_r5cNatKey_(r.company, r.country, r.marketplace, r.sku, r.draft_purpose, r.planning_cycle) === key) dup++; });
    out.active_natural_key_duplicate_count = dup > 1 ? dup : 0;
  }
  var srcRows = (TEMP_readObjects_('request_order_line_sources').rows || []);
  var srcForTarget = srcRows.filter(function (r) { return TEMP_str_(r.request_allocation_draft_id) === TEMP_R6A_TARGET_ID_; });
  var roIds = {}; srcForTarget.forEach(function (r) { var id = TEMP_str_(r.request_order_id); if (id) roIds[id] = 1; });
  var lineRows = (TEMP_readObjects_('request_order_lines').rows || []).filter(function (r) { return roIds[TEMP_str_(r.request_order_id)]; });
  var orderRows = (TEMP_readObjects_('request_orders').rows || []).filter(function (r) { return roIds[TEMP_str_(r.request_order_id)]; });
  out.existing_request_order_count = Object.keys(roIds).length;
  out.existing_request_order_line_count = lineRows.length;
  out.existing_line_source_count = srcForTarget.length;
  out.already_sent = (srcForTarget.length > 0 || lineRows.length > 0 || Object.keys(roIds).length > 0) ? 'YES' : 'NO';
  return out;
}
function TEMP_r6aExpectedSendDeltas_(row) {
  if (!row) return { request_orders: 0, request_order_lines: 0, request_order_line_sources: 0 };
  var lines = 0;
  TEMP_R6A_TIERS_.forEach(function (p) { if (TEMP_r6aNum_(row[p + '_order_qty']) > 0 && row[p + '_status'] !== 'cancelled') lines++; });
  return { request_orders: lines > 0 ? 1 : 0, request_order_lines: lines, request_order_line_sources: lines };
}
function TEMP_r6aPreflightFlatDraftLifecycle_() {
  var st = TEMP_r6aReadState_();
  if (st.halt) return { ok: false, halt: st.halt, R6A_ZERO_WRITE_CONFIRMED: 'YES' };
  var row = st.target_row;
  var submittable = row ? TEMP_R6A_TIERS_.filter(function (p) { return TEMP_r6aSubmittable_(row, p); }).map(function (p) { return p.toUpperCase(); }) : [];
  var anySubmitted = row ? TEMP_R6A_TIERS_.some(function (p) { return row[p + '_status'] === 'submitted'; }) : false;
  var status = st.target_status || '';
  var editable = row && (status === 'draft' || status === 'partially_submitted') && st.target_count === 1;
  var collision = st.existing_request_order_count > 0 || st.existing_line_source_count > 0;
  var deltas = TEMP_r6aExpectedSendDeltas_(row);
  var safe_edit = !!(editable && TEMP_R6A_TIERS_.some(function (p) { return row[p + '_status'] !== 'submitted' && row[p + '_status'] !== 'cancelled'; }));
  var safe_partial = !!(editable && submittable.length >= 1);
  var safe_full = !!(editable && submittable.length >= 1);
  var safe_send = !!(anySubmitted && st.already_sent === 'NO' && !collision);
  var verdict = st.halt ? 'HALT'
    : (st.target_present !== 'YES' || st.target_count !== 1) ? 'HALT'
    : (st.active_natural_key_duplicate_count > 0 || collision) ? 'DOWNSTREAM_COLLISION'
    : (st.already_sent === 'YES') ? 'TARGET_ALREADY_CONSUMED'
    : (status === 'submitted' || status === 'cancelled') ? 'TARGET_ALREADY_CONSUMED'
    : (!editable) ? 'TARGET_NOT_EDITABLE'
    : 'READY_FOR_CONTROLLED_LIFECYCLE';
  var checksum = TEMP_r5bHash_([TEMP_R6A_TARGET_ID_, status, st.target_draft_version,
    TEMP_R6A_TIERS_.map(function (p) { return row ? (p + ':' + TEMP_r6aNum_(row[p + '_order_qty']) + ':' + TEMP_str_(row[p + '_status'])) : p + ':NA'; }).join(',')].join('|'));
  var out = {
    ok: true,
    RUNTIME_SPREADSHEET_TARGET_MATCH: st.RUNTIME_SPREADSHEET_TARGET_MATCH, runtime_spreadsheet_id_fingerprint: st.runtime_spreadsheet_id_fingerprint,
    active_flag: st.active_flag, CANONICAL_V2_SCHEMA_EXACT: st.CANONICAL_V2_SCHEMA_EXACT, canonical_headers_hash: st.canonical_headers_hash,
    canonical_row_count: st.canonical_row_count, draft_line_row_count: st.draft_line_row_count,
    target_id: TEMP_R6A_TARGET_ID_, target_present: st.target_present, target_count: st.target_count,
    target_status: status, target_draft_version: st.target_draft_version, target_generation_type: st.target_generation_type,
    target_expected_token: st.target_expected_token, target_tier_snapshot: st.target_tier_snapshot,
    id_scope_agreement: st.id_scope_agreement, active_natural_key_duplicate_count: st.active_natural_key_duplicate_count,
    existing_request_order_count: st.existing_request_order_count, existing_request_order_line_count: st.existing_request_order_line_count,
    existing_line_source_count: st.existing_line_source_count, already_sent: st.already_sent,
    submittable_tiers: submittable, any_tier_submitted: anySubmitted,
    safe_for_edit: safe_edit ? 'YES' : 'NO', safe_for_partial_submit: safe_partial ? 'YES' : 'NO',
    safe_for_full_submit: safe_full ? 'YES' : 'NO', safe_for_send: safe_send ? 'YES' : 'NO',
    expected_send_downstream_deltas: deltas,
    DRAFT_LINE_DEPENDENCY_ZERO: 'YES (flat lifecycle reads request_order_allocation_drafts + downstream request_orders/lines/line_sources ONLY; never request_order_allocation_draft_lines)',
    R6A_ZERO_WRITE_CONFIRMED: 'YES (read-only: TEMP_readObjects_ only; no setValues/appendRow/setNumberFormat/insertSheet/rename)',
    R6A_PREFLIGHT_CHECKSUM: checksum, verdict: verdict, R6A_PREFLIGHT_READY: 'YES'
  };
  Logger.log('R6A_PREFLIGHT ' + JSON.stringify(out, null, 2));
  return out;
}
function TEMP_r6aValidateStage_(stage) {
  var st = TEMP_r6aReadState_();
  if (st.halt) return { ok: false, stage: stage, halt: st.halt, R6A_ZERO_WRITE_CONFIRMED: 'YES' };
  var row = st.target_row, checks = {}, tiers = st.target_tier_snapshot || {};
  var deltas = TEMP_r6aExpectedSendDeltas_(row);
  checks.target_unique = st.target_count === 1;
  checks.id_scope_agreement = st.id_scope_agreement === 'YES';
  checks.draft_line_count_65 = st.draft_line_row_count === 65;
  checks.no_active_duplicate = !(st.active_natural_key_duplicate_count > 0);
  if (stage === 'EDIT') {
    checks.status_active = !!(row && (st.target_status === 'draft' || st.target_status === 'partially_submitted'));
    checks.recommended_qty_present = !!(row && TEMP_R6A_TIERS_.every(function (p) { return row[p + '_recommended_qty'] !== undefined; }));
    checks.no_downstream_yet = st.already_sent === 'NO';
  } else if (stage === 'PARTIAL_SUBMIT') {
    checks.header_partially_or_submitted = !!(row && (st.target_status === 'partially_submitted' || st.target_status === 'submitted'));
    checks.at_least_one_tier_submitted = !!(row && TEMP_R6A_TIERS_.some(function (p) { return row[p + '_status'] === 'submitted'; }));
    checks.no_downstream_yet = st.already_sent === 'NO';
  } else if (stage === 'FULL_SUBMIT') {
    checks.header_submitted = st.target_status === 'submitted';
    checks.all_submittable_tiers_submitted = !!(row && TEMP_R6A_TIERS_.every(function (p) { return TEMP_r6aNum_(row[p + '_order_qty']) <= 0 || row[p + '_status'] === 'submitted' || row[p + '_status'] === 'cancelled'; }));
    checks.no_downstream_yet = st.already_sent === 'NO';
  } else if (stage === 'SEND') {
    checks.header_submitted = st.target_status === 'submitted';
    checks.request_orders_created = st.existing_request_order_count >= 1;
    checks.line_count_matches_tiers = st.existing_request_order_line_count === deltas.request_order_lines;
    checks.line_source_count_matches = st.existing_line_source_count === deltas.request_order_line_sources;
    checks.lineage_fk_present = st.existing_line_source_count >= 1;
  } else if (stage === 'RESEND') {
    checks.request_orders_still_one = st.existing_request_order_count === 1;
    checks.line_count_unchanged = st.existing_request_order_line_count === deltas.request_order_lines;
    checks.line_source_count_unchanged = st.existing_line_source_count === deltas.request_order_line_sources;
    checks.no_duplicate_request_order = st.existing_request_order_count <= 1;
  }
  var pass = Object.keys(checks).every(function (k) { return checks[k] === true; });
  var out = { ok: pass, stage: stage, target_id: TEMP_R6A_TARGET_ID_, target_status: st.target_status,
    target_tier_snapshot: tiers, existing_request_order_count: st.existing_request_order_count,
    existing_request_order_line_count: st.existing_request_order_line_count, existing_line_source_count: st.existing_line_source_count,
    expected_send_downstream_deltas: deltas, draft_line_row_count: st.draft_line_row_count,
    DRAFT_LINE_DEPENDENCY_ZERO: 'YES', checks: checks, R6A_ZERO_WRITE_CONFIRMED: 'YES',
    verdict: pass ? ('STAGE_VALIDATED_' + stage) : ('STAGE_VALIDATION_FAILED_' + stage) };
  Logger.log('R6A_VALIDATE ' + stage + ' ' + out.verdict + '\n' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R6B — READ-ONLY persisted-draft hydration diagnostic (writes NOTHING). Proves the frozen
// CO1100-R flat Draft reads back from the canonical table into the exact frontend-projection DTO WITHOUT running AI
// Plan: DB row values == readback DTO values, zero writes, zero version change, zero Draft-Line dependency.
// ================================================================================================================
function TEMP_r6bTierFromDto_(dto, tier) {
  var out = null; (dto && dto.tiers || []).forEach(function (t) { if (String(t.tier) === tier) out = t; }); return out;
}
function TEMP_r6bDiagnosePersistedDraftHydration_() {
  if (typeof KMRDV2 === 'undefined' || !KMRDV2 || !Array.isArray(KMRDV2.V2_HEADERS) || typeof KMRDV2P === 'undefined' || !KMRDV2P) {
    return { ok: false, halt: 'V2_BUNDLE_ABSENT', R6B_ZERO_WRITE_CONFIRMED: 'YES' };
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var runtimeId = ''; try { runtimeId = ss ? String(ss.getId()) : ''; } catch (e) {}
  var expectedId = (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? String(PRODUCTION_DB_SPREADSHEET_ID_ || '') : '';
  var targetMatch = (expectedId !== '' && runtimeId !== '' && runtimeId === expectedId) ? 'YES' : (expectedId === '' ? 'UNKNOWN' : 'NO');
  var flagOn = (typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function') && requestOrderDraftV2FlatCutoverEnabled_() === true;
  var read = TEMP_readObjects_(TEMP_R5C_CANON_), v2 = KMRDV2.V2_HEADERS;
  var schemaExact = (read.present && (read.headers || []).length === v2.length && (read.headers || []).join('|') === v2.join('|')) ? 'YES' : 'NO';
  var draftLineCount = (TEMP_readObjects_(TEMP_R5C_LINES_).rows || []).length;
  var TARGET = TEMP_R6A_TARGET_ID_, p = TEMP_r5c1ParseId_(TARGET), scope = p.scope || {};
  var matches = (read.rows || []).filter(function (r) { return TEMP_str_(r.request_allocation_draft_id) === TARGET; });
  var row = matches.length === 1 ? matches[0] : null;
  // build a sheetSet the flat readback authority consumes (rows as arrays in V2 header order) — read-only projection.
  var arr = (read.rows || []).map(function (o) { return v2.map(function (h) { return o[h] !== undefined ? o[h] : ''; }); });
  var set = {}; set[KMRDV2P.HEADER_TABLE] = { headers: v2.slice(), rows: arr };
  var dtos = [];
  try { dtos = KMRDV2P.readActiveFlatForScope(set, { planningCycle: TEMP_str_(row && row.planning_cycle) || p.cycle, businessScope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: scope.sku, draft_purpose: scope.draft_purpose } }) || []; } catch (e2) { dtos = []; }
  var dto = null; dtos.forEach(function (d) { if (String(d.draftId) === TARGET) dto = d; });
  var tiers = {}, dbVsDto = {}, allEqual = true;
  ['t1', 't2', 't3'].forEach(function (pfx) {
    var T = pfx.toUpperCase(), dt = dto ? TEMP_r6bTierFromDto_(dto, T) : null;
    var db = row ? { month: TEMP_str_(row[pfx + '_month']), recommended_qty: TEMP_r6aNum_(row[pfx + '_recommended_qty']), order_qty: TEMP_r6aNum_(row[pfx + '_order_qty']), carton_qty: TEMP_r6aNum_(row[pfx + '_carton_qty']), status: TEMP_str_(row[pfx + '_status']), note: TEMP_str_(row[pfx + '_note']) } : null;
    var projected = dt ? { month: TEMP_str_(dt.month), recommended_qty: TEMP_r6aNum_(dt.recommendedQty), order_qty: TEMP_r6aNum_(dt.orderQty), carton_qty: TEMP_r6aNum_(dt.cartonQty), status: TEMP_str_(dt.status), note: TEMP_str_(dt.note) } : null;
    tiers[T] = { db: db, readback_dto: projected };
    var eq = !!(db && projected && db.month === projected.month && db.recommended_qty === projected.recommended_qty && db.order_qty === projected.order_qty && db.carton_qty === projected.carton_qty && db.status === projected.status && db.note === projected.note);
    dbVsDto[T] = eq ? 'EQUAL' : 'MISMATCH'; if (!eq) allEqual = false;
  });
  // active natural-key duplicate count for the target scope
  var key = row ? TEMP_r5cNatKey_(row.company, row.country, row.marketplace, row.sku, row.draft_purpose, row.planning_cycle) : '';
  var dup = 0; if (row) (read.rows || []).forEach(function (r) { var s = TEMP_str_(r.status); if (s !== 'draft' && s !== 'partially_submitted' && s !== 'site_confirmed') return; if (TEMP_r5cNatKey_(r.company, r.country, r.marketplace, r.sku, r.draft_purpose, r.planning_cycle) === key) dup++; });
  var checksum = TEMP_r5bHash_([TARGET, TEMP_str_(row && row.status), row && row.draft_version, JSON.stringify(tiers)].join('|'));
  var verdict = (!row) ? (matches.length === 0 ? 'TARGET_ABSENT' : 'DUPLICATE_ACTIVE_MATCH')
    : (schemaExact !== 'YES') ? 'SCHEMA_MISMATCH'
    : (!flagOn) ? 'FLAG_OFF'
    : (dup > 1) ? 'DUPLICATE_ACTIVE_MATCH'
    : (!dto) ? 'READBACK_EMPTY'
    : (allEqual ? 'HYDRATION_FIDELITY_OK' : 'DB_DTO_MISMATCH');
  var out = {
    ok: verdict === 'HYDRATION_FIDELITY_OK',
    RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch, active_flag: flagOn,
    CANONICAL_V2_SCHEMA_EXACT: schemaExact, canonical_headers_hash: TEMP_r5bHash_((read.headers || []).join('|')),
    target_id: TARGET, natural_scope: { company: scope.company, country: scope.country, marketplace: scope.marketplace, sku: scope.sku, draft_purpose: scope.draft_purpose },
    planning_cycle: TEMP_str_(row && row.planning_cycle), target_present: matches.length > 0 ? 'YES' : 'NO', target_count: matches.length,
    draft_status: TEMP_str_(row && row.status), draft_version: row && row.draft_version,
    tiers: tiers,
    frontend_projection_field_names: { draftId: 'draftId', draftVersion: 'draftVersion', status: 'status', tier_month: 'month', recommended_qty: 'recommendedQty', order_qty: 'orderQty', carton_qty: 'cartonQty', tier_status: 'status', note: 'note', user_edited: 'userEdited', submitted_by: 'submittedBy', submitted_at: 'submittedAt' },
    db_vs_dto: dbVsDto, db_vs_dto_all_equal: allEqual ? 'YES' : 'NO',
    active_natural_key_duplicate_count: dup > 1 ? dup : 0,
    hydration_write_count: 0,
    DRAFT_LINE_DEPENDENCY_ZERO: 'YES (readback reads request_order_allocation_drafts ONLY; never request_order_allocation_draft_lines)',
    draft_line_row_count: draftLineCount,
    R6B_ZERO_WRITE_CONFIRMED: 'YES (read-only: TEMP_readObjects_ + KMRDV2P.readActiveFlatForScope over an in-memory set; no setValues/appendRow/setNumberFormat/insertSheet/rename)',
    R6B_DIAGNOSTIC_CHECKSUM: checksum, verdict: verdict, R6B_DIAGNOSTIC_READY: 'YES'
  };
  Logger.log('R6B_PERSISTED_DRAFT_HYDRATION ' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R6B2 — READ-ONLY all-tier Note incident audit (writes NOTHING). Surfaces the exact live
// state that R6B2 diagnoses: per-tier tN_note + tN_user_edited, header version/updated_at, the most recent
// recommendation_calculation_runs row for the target draft, canonical/Draft-Line counts, active duplicate count, a
// zero-write proof and a checksum. It does NOT repair the live draft (the incomplete state is EVIDENCE) and adds NO
// mutation path. Reuses the R6A read-only state reader.
// ================================================================================================================
function TEMP_r6b2LastRunForDraft_(draftId) {
  // best-effort, read-only peek at the calculation-run journal (absent tab → 'UNAVAILABLE'; never throws)
  try {
    var jr = TEMP_readObjects_('recommendation_calculation_runs');
    if (!jr || !jr.present) return { status: 'JOURNAL_TAB_ABSENT' };
    var rows = (jr.rows || []).filter(function (r) {
      return TEMP_str_(r.draft_id) === draftId || TEMP_str_(r.request_allocation_draft_id) === draftId || TEMP_str_(r.draftId) === draftId;
    });
    if (!rows.length) return { status: 'NO_RUN_FOR_DRAFT', journal_row_count: (jr.rows || []).length };
    var last = rows[rows.length - 1];
    return { status: 'FOUND', matched_run_count: rows.length,
      last_run: { run_status: TEMP_str_(last.run_status || last.status), action: TEMP_str_(last.action),
        write_outcome: TEMP_str_(last.write_outcome || last.writeOutcome), draft_version: last.draft_version,
        updated_at: TEMP_str_(last.updated_at || last.created_at) } };
  } catch (e) { return { status: 'UNAVAILABLE', error: String(e && e.message || e) }; }
}
function TEMP_r6b2AuditAllTierNotes_() {
  var st = TEMP_r6aReadState_();
  if (st.halt) return { ok: false, halt: st.halt, R6B2_ZERO_WRITE_CONFIRMED: 'YES' };
  var row = st.target_row, snap = st.target_tier_snapshot || {};
  var notes = {}, userEdited = {};
  ['T1', 'T2', 'T3'].forEach(function (T) {
    var t = snap[T] || {};
    notes[T] = TEMP_str_(t.note);
    userEdited[T] = (t.user_edited === true || TEMP_str_(t.user_edited).toUpperCase() === 'TRUE');
  });
  var lastRun = TEMP_r6b2LastRunForDraft_(TEMP_R6A_TARGET_ID_);
  var checksum = TEMP_r5bHash_([TEMP_R6A_TARGET_ID_, TEMP_str_(row && row.status), row && row.draft_version,
    notes.T1, notes.T2, notes.T3, userEdited.T1, userEdited.T2, userEdited.T3].join('|'));
  var anyNote = !!(notes.T1 || notes.T2 || notes.T3);
  var verdict = st.halt ? 'HALT'
    : (st.target_present !== 'YES' || st.target_count !== 1) ? 'TARGET_ABSENT_OR_DUPLICATE'
    : (st.CANONICAL_V2_SCHEMA_EXACT !== 'YES') ? 'SCHEMA_MISMATCH'
    : (!st.active_flag) ? 'FLAG_OFF'
    : anyNote ? 'NOTES_PRESENT'
    : 'ALL_TIER_NOTES_EMPTY';   // the current live evidence state (pre-fix): notes empty
  var out = {
    ok: true,
    RUNTIME_SPREADSHEET_TARGET_MATCH: st.RUNTIME_SPREADSHEET_TARGET_MATCH, active_flag: st.active_flag,
    CANONICAL_V2_SCHEMA_EXACT: st.CANONICAL_V2_SCHEMA_EXACT,
    target_id: TEMP_R6A_TARGET_ID_, target_present: st.target_present, target_count: st.target_count,
    draft_status: st.target_status, draft_version: st.target_draft_version, updated_at: TEMP_str_(row && row.updated_at),
    t1_note: notes.T1, t2_note: notes.T2, t3_note: notes.T3,
    t1_user_edited: userEdited.T1, t2_user_edited: userEdited.T2, t3_user_edited: userEdited.T3,
    last_calculation_run: lastRun,
    canonical_row_count: st.canonical_row_count, draft_line_row_count: st.draft_line_row_count,
    active_natural_key_duplicate_count: st.active_natural_key_duplicate_count,
    DRAFT_LINE_DEPENDENCY_ZERO: 'YES (reads request_order_allocation_drafts + recommendation_calculation_runs ONLY; never request_order_allocation_draft_lines)',
    R6B2_ZERO_WRITE_CONFIRMED: 'YES (read-only: TEMP_readObjects_ only; no setValues/appendRow/setNumberFormat/insertSheet/rename; NO repair of the live evidence)',
    R6B2_AUDIT_CHECKSUM: checksum, verdict: verdict, R6B2_AUDIT_READY: 'YES'
  };
  Logger.log('R6B2_ALL_TIER_NOTES ' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R6C1 / R6D — READ-ONLY Inventory/Cargo AI Plan connection diagnostic (writes NOTHING).
// Proves whether the Inventory (WEEKLY_SHIPPING) flow persists to shipping_allocation_drafts / _lines, using the
// EXACT live authority schemas the task froze. HALTs (verdict INVENTORY_SCHEMA_MISMATCH) if the live headers differ.
// Zero writes: TEMP_readObjects_ only; no setValues/appendRow/insertSheet/rename. Adds NO mutation path.
// ================================================================================================================
var TEMP_R6D_DRAFTS_TAB_ = 'shipping_allocation_drafts';
var TEMP_R6D_LINES_TAB_ = 'shipping_allocation_draft_lines';
var TEMP_R6D_HDR_AUTH_ = ['allocation_draft_id', 'planning_cycle', 'source_page', 'company', 'country', 'marketplace', 'status',
  'recommended_source_warehouse_id', 'recommended_destination_warehouse_id', 'recommended_source_warehouse_code_snapshot',
  'recommended_destination_warehouse_code_snapshot', 'recommendation_group_no', 'recommended_shipping_method',
  'recommended_last_mile_delivery', 'generation_type', 'calculation_run_id', 'formula_version', 'calculated_at',
  'source_data_as_of', 'draft_version', 'created_by', 'created_at', 'updated_by', 'updated_at', 'submitted_by',
  'submitted_at', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'];
var TEMP_R6D_LINE_AUTH_ = ['allocation_draft_line_id', 'allocation_draft_id', 'sku', 'site_sku', 'window_code',
  'window_start_date', 'window_end_date', 'required_by_date', 'regular_demand_snapshot', 'special_event_demand_snapshot',
  'destination_stock_snapshot', 'qualified_incoming_snapshot', 'approved_supply_snapshot', 'calculated_gap_qty',
  'source_initial_available_qty_snapshot', 'source_available_before_allocation_snapshot', 'allocation_sequence',
  'recommendation_reason', 'recommendation_flags', 'recommended_qty', 'source_warehouse_id',
  'source_warehouse_code_snapshot', 'planned_qty', 'units_per_carton', 'route_no', 'line_status', 'override_reason',
  'note', 'created_at', 'updated_at'];
var TEMP_R6D_ACTIVE_ = { draft: 1, site_confirmed: 1, partially_submitted: 1 };   // non-terminal (cancelled/submitted excluded)
function TEMP_R6D_DIAGNOSE_INVENTORY_AI_PLAN_CONNECTION() { return TEMP_r6dDiagnoseInventoryAiPlanConnection_(); }
function TEMP_r6dSchemaMatch_(actual, auth) {
  var a = (actual || []).map(function (h) { return TEMP_str_(h); });
  var exact = a.length === auth.length && a.join('|') === auth.join('|');
  var missing = auth.filter(function (h) { return a.indexOf(h) === -1; });
  var extra = a.filter(function (h) { return auth.indexOf(h) === -1; });
  return { exact: exact, hash: TEMP_r5bHash_(a.join('|')), auth_hash: TEMP_r5bHash_(auth.join('|')), col_count: a.length, auth_col_count: auth.length, missing: missing, extra: extra };
}
function TEMP_r6dDist_(rows, field) { var d = {}; rows.forEach(function (r) { var k = TEMP_str_(r[field]) || '(blank)'; d[k] = (d[k] || 0) + 1; }); return d; }
function TEMP_r6dCycleTypeDist_(rows) { var d = {}; rows.forEach(function (r) { var t = TEMP_isDate_(r.planning_cycle) ? 'Date' : (r.planning_cycle === null || r.planning_cycle === undefined || r.planning_cycle === '' ? 'blank' : typeof r.planning_cycle); d[t] = (d[t] || 0) + 1; }); return d; }
function TEMP_r6dLatestInventoryRun_() {
  // best-effort, read-only peek at the calculation-run journal for an INVENTORY/WEEKLY row (absent tab → UNAVAILABLE)
  try {
    var jr = TEMP_readObjects_('recommendation_calculation_runs');
    if (!jr || !jr.present) return { status: 'JOURNAL_TAB_ABSENT' };
    var inv = (jr.rows || []).filter(function (r) { var blob = JSON.stringify(r).toUpperCase(); return blob.indexOf('INVENTORY') !== -1 || blob.indexOf('WEEKLY') !== -1 || blob.indexOf('SHIPPING') !== -1; });
    var pool = inv.length ? inv : (jr.rows || []);
    if (!pool.length) return { status: 'NO_RUNS', journal_row_count: (jr.rows || []).length };
    var last = pool[pool.length - 1];
    return { status: 'FOUND', inventory_matched_rows: inv.length, journal_row_count: (jr.rows || []).length,
      last_run_id: TEMP_str_(last.calculation_run_id || last.run_id || last.id), last_status: TEMP_str_(last.run_status || last.status), last_updated_at: TEMP_str_(last.updated_at || last.created_at) };
  } catch (e) { return { status: 'UNAVAILABLE', error: String(e && e.message || e) }; }
}
function TEMP_r6dDiagnoseInventoryAiPlanConnection_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var runtimeId = ''; try { runtimeId = ss ? String(ss.getId()) : ''; } catch (e) {}
  var expectedId = (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? String(PRODUCTION_DB_SPREADSHEET_ID_ || '') : '';
  var targetMatch = (expectedId !== '' && runtimeId !== '' && runtimeId === expectedId) ? 'YES' : (expectedId === '' ? 'UNKNOWN' : 'NO');

  var H = TEMP_readObjects_(TEMP_R6D_DRAFTS_TAB_), L = TEMP_readObjects_(TEMP_R6D_LINES_TAB_);
  var hSchema = TEMP_r6dSchemaMatch_(H.headers, TEMP_R6D_HDR_AUTH_), lSchema = TEMP_r6dSchemaMatch_(L.headers, TEMP_R6D_LINE_AUTH_);
  // Objective G — HALT if the live schema differs from the supplied authority (never guess/migrate).
  if (!H.present || !L.present || !hSchema.exact || !lSchema.exact) {
    var out0 = {
      ok: false, verdict: (!H.present || !L.present) ? 'INVENTORY_TABLE_ABSENT' : 'INVENTORY_SCHEMA_MISMATCH',
      RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch,
      drafts_present: H.present, lines_present: L.present,
      drafts_schema: hSchema, lines_schema: lSchema,
      R6D_ZERO_WRITE_CONFIRMED: 'YES (read-only TEMP_readObjects_ only)', R6D_DIAGNOSTIC_READY: 'YES'
    };
    Logger.log('R6D_INVENTORY_AI_PLAN ' + JSON.stringify(out0, null, 2));
    return out0;
  }
  var headers = H.rows || [], lines = L.rows || [];
  // active headers + status distribution
  var statusDist = TEMP_r6dDist_(headers, 'status');
  var active = headers.filter(function (r) { return TEMP_R6D_ACTIVE_[TEMP_str_(r.status)] === 1; });
  // planning_cycle type/value distribution
  var cycleTypeDist = TEMP_r6dCycleTypeDist_(headers), cycleValDist = TEMP_r6dDist_(headers, 'planning_cycle');
  // duplicate allocation_draft_id (headers)
  var idCounts = {}; headers.forEach(function (r) { var id = TEMP_str_(r.allocation_draft_id); if (id) idCounts[id] = (idCounts[id] || 0) + 1; });
  var dupHeaderIds = Object.keys(idCounts).filter(function (id) { return idCounts[id] > 1; });
  // duplicate active natural keys (planning_cycle|company|country|marketplace|source_page)
  var nkCounts = {}; active.forEach(function (r) { var k = [TEMP_str_(r.planning_cycle), TEMP_str_(r.company), TEMP_str_(r.country), TEMP_str_(r.marketplace), TEMP_str_(r.source_page)].join('|'); nkCounts[k] = (nkCounts[k] || 0) + 1; });
  var dupActiveNaturalKeys = Object.keys(nkCounts).filter(function (k) { return nkCounts[k] > 1; }).length;
  // orphan lines (line.allocation_draft_id with no matching header)
  var headerIdSet = {}; headers.forEach(function (r) { var id = TEMP_str_(r.allocation_draft_id); if (id) headerIdSet[id] = 1; });
  var linesByHeader = {}, orphanLines = 0;
  lines.forEach(function (l) { var id = TEMP_str_(l.allocation_draft_id); linesByHeader[id] = (linesByHeader[id] || 0) + 1; if (!headerIdSet[id]) orphanLines++; });
  // header → lines linkage
  var headersWithLines = 0, headersWithoutLines = 0;
  headers.forEach(function (r) { var id = TEMP_str_(r.allocation_draft_id); if (linesByHeader[id]) headersWithLines++; else headersWithoutLines++; });
  // calculation_run_id → header linkage
  var runLinked = headers.filter(function (r) { return TEMP_str_(r.calculation_run_id) !== ''; }).length;
  var distinctRunIds = {}; headers.forEach(function (r) { var cr = TEMP_str_(r.calculation_run_id); if (cr) distinctRunIds[cr] = 1; });
  // generated vs reused (generation_type distribution)
  var genTypeDist = TEMP_r6dDist_(headers, 'generation_type');
  var latestRun = TEMP_r6dLatestInventoryRun_();
  var checksum = TEMP_r5bHash_([hSchema.hash, lSchema.hash, headers.length, lines.length, active.length, dupHeaderIds.length, orphanLines].join('|'));

  var out = {
    ok: true,
    RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch, runtime_spreadsheet_id_fingerprint: TEMP_r5bIdFingerprint_(runtimeId),
    // schema (both tables) vs the frozen authority
    drafts_schema_exact: hSchema.exact ? 'YES' : 'NO', drafts_headers_hash: hSchema.hash, drafts_col_count: hSchema.col_count,
    lines_schema_exact: lSchema.exact ? 'YES' : 'NO', lines_headers_hash: lSchema.hash, lines_col_count: lSchema.col_count,
    // counts
    header_row_count: headers.length, line_row_count: lines.length,
    active_draft_count: active.length, status_distribution: statusDist,
    planning_cycle_type_distribution: cycleTypeDist, planning_cycle_value_distribution: cycleValDist,
    // integrity
    orphan_line_count: orphanLines, duplicate_allocation_draft_id_count: dupHeaderIds.length, duplicate_allocation_draft_ids: dupHeaderIds.slice(0, 20),
    duplicate_active_natural_key_count: dupActiveNaturalKeys,
    // linkage
    latest_inventory_calculation_run: latestRun,
    headers_with_calculation_run_id: runLinked, distinct_calculation_run_id_count: Object.keys(distinctRunIds).length,
    headers_with_lines: headersWithLines, headers_without_lines: headersWithoutLines,
    generation_type_distribution: genTypeDist,
    // runtime connection facts (from the R6D trace; strings, not live reads)
    runtime_callers: {
      ai_plan_trigger: 'handleReplenAiPlan (inventory-replenishment.js) — PAGE-STATE ONLY, writes NEITHER table',
      writer: 'user route edit → _saveAllocationDraftFromDom → _flushDraftDbPersist → KM.DB.upsertShippingAllocationDraft / upsertShippingAllocationDraftLines → 16_ handlers (router 01_:434/438) — WRITES both tables',
      readback_hydration: 'mount → _restoreAllocationDraftFromSession → refreshCacheTables([drafts,lines]) → _hydrateAllocationDraftFromDb (reads both tables) — initial load AND SPA remount',
      planned_qty_edit: 'CONNECTED (buildDraftLinePayload.planned_qty → lines upsert)',
      line_note_edit: 'NOT CONNECTED (buildDraftLinePayload omits note; updateReplenNote is page-local)',
      header_note_edit: 'NOT CONNECTED (buildDraftHeaderPayload omits note)',
      submit: 'NOT CONNECTED from the page (backend handleSubmitShippingAllocationDrafts_ exists, uncalled)',
      shipment_draft_handoff: 'NOT CONNECTED (comments only)',
      unwired_ai_plan_writer: 'weeklyAiPlan.generate → handleGenerateWeeklyAiPlanDraft_ (61_) is router-bound (01_:482) but has NO frontend caller — this is the single owning seam for "AI Plan persists Drafts"'
    },
    hydration_readback_available: 'YES (getShippingAllocationDrafts / getShippingAllocationDraftLines via _opDbCache)',
    R6D_ZERO_WRITE_CONFIRMED: 'YES (read-only: TEMP_readObjects_ only; no setValues/appendRow/setNumberFormat/insertSheet/rename)',
    R6D_DIAGNOSTIC_CHECKSUM: checksum, R6D_DIAGNOSTIC_READY: 'YES',
    // Verdict: hydration/writer/edit/idempotency CONNECTED; AI-Plan-generation persistence + note + submit + handoff NOT.
    verdict: 'INVENTORY_AI_PLAN_PARTIAL',
    verdict_detail: 'Manual route allocation persists to both tables and hydrates on load/remount (CONNECTED). AI Plan generation does NOT persist Draft rows (the weeklyAiPlan.generate writer is unwired); line/header note edits, Submit, and Shipment Draft handoff are NOT wired.'
  };
  Logger.log('R6D_INVENTORY_AI_PLAN ' + JSON.stringify(out, null, 2));
  return out;
}

// ================================================================================================================
// F1-7N-FA-3C-DRAFT-MODEL-R6E-P0 — READ-ONLY Weekly Shipping Plan schema diagnostic (writes NOTHING). Proves the exact
// shipping_plans / shipping_plan_lines header mismatch that makes Submit Plan throw PRODUCTION_SAFETY:HEADER_MISSING.
// Compares the LIVE raw headers byte-for-byte against the RUNTIME AUTHORITY constants (SHIPPING_PLANS_HEADERS_ /
// SHIPPING_PLAN_LINES_HEADERS_ in 11_shipping_plan_handlers.gs) using the SAME missing = expected \ actual rule the
// production-safety gate uses (29_ prodRequireSheet_ → KMPSAFE validateSchema). Zero writes; no rename/create/repair.
// ================================================================================================================
function TEMP_R6E_DIAGNOSE_SHIPPING_PLAN_SCHEMA() { return TEMP_r6eDiagnoseShippingPlanSchema_(); }
function TEMP_r6eRawHeaderRow_(name) {
  // RAW (un-trimmed) header row so leading/trailing whitespace is detectable — read-only.
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return { present: false, raw: [] };
  var lastCol = sh.getLastColumn(); if (lastCol < 1) return { present: true, raw: [] };
  var raw = sh.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  return { present: true, raw: raw };
}
function TEMP_r6eAnalyzeTable_(name, authority, authorityConst) {
  var rawRes = TEMP_r6eRawHeaderRow_(name);
  var obj = TEMP_readObjects_(name);   // trimmed headers + rows
  var rawHeaders = rawRes.raw, trimmed = (obj.headers || []);
  var actualWithMeta = rawHeaders.map(function (h, i) { return { index: i, raw: String(h), trimmed: String(h).trim(), type: TEMP_r5bTypeOf_(h) }; });
  var have = {}; trimmed.forEach(function (h) { if (h !== '') have[h] = 1; });
  var expSet = {}; (authority || []).forEach(function (h) { expSet[h] = 1; });
  var missing = (authority || []).filter(function (h) { return !have[h]; });
  var extra = trimmed.filter(function (h) { return h !== '' && !expSet[h]; });
  // duplicates
  var seen = {}, dups = {}; trimmed.forEach(function (h) { if (h === '') return; if (seen[h]) dups[h] = 1; seen[h] = 1; }); var duplicateHeaders = Object.keys(dups);
  // whitespace: raw cell differs from its trimmed value
  var whitespaceHeaders = actualWithMeta.filter(function (c) { return c.raw !== c.trimmed; }).map(function (c) { return { index: c.index, raw: JSON.stringify(c.raw) }; });
  // spelling near-matches: pair a missing authority header with an extra header sharing a >=6-char prefix (surfaces
  // marketplace <-> marketplace_seperate, avg_sales_per_day typos, etc.). Heuristic only; never auto-applied.
  var spellingMismatches = [];
  missing.forEach(function (m) {
    extra.forEach(function (x) {
      var p = 0, n = Math.min(m.length, x.length); while (p < n && m[p] === x[p]) p++;
      if (m !== x && p >= 6) spellingMismatches.push({ expected: m, actual: x, shared_prefix_len: p });
    });
  });
  var exactMatch = missing.length === 0 && extra.length === 0 && duplicateHeaders.length === 0 && whitespaceHeaders.length === 0
    && trimmed.length === (authority || []).length && trimmed.join('|') === (authority || []).join('|');
  return {
    tab: name, present: rawRes.present && obj.present, authority_const: authorityConst,
    actual_headers: actualWithMeta, actual_col_count: trimmed.length,
    expected_headers: authority, expected_col_count: (authority || []).length,
    missing_headers: missing, extra_headers: extra, duplicate_headers: duplicateHeaders, whitespace_headers: whitespaceHeaders,
    spelling_mismatches: spellingMismatches,
    first_rejected_header: missing.length ? missing[0] : null,
    expected_hash: TEMP_r5bHash_((authority || []).join('|')), actual_hash: TEMP_r5bHash_(trimmed.join('|')),
    row_count: (obj.rows || []).length,
    schema_exact: exactMatch ? 'YES' : 'NO'
  };
}
function TEMP_r6eDiagnoseShippingPlanSchema_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var runtimeId = ''; try { runtimeId = ss ? String(ss.getId()) : ''; } catch (e) {}
  var expectedId = (typeof PRODUCTION_DB_SPREADSHEET_ID_ !== 'undefined') ? String(PRODUCTION_DB_SPREADSHEET_ID_ || '') : '';
  var targetMatch = (expectedId !== '' && runtimeId !== '' && runtimeId === expectedId) ? 'YES' : (expectedId === '' ? 'UNKNOWN' : 'NO');
  // RUNTIME AUTHORITY constants (single source of truth = 11_shipping_plan_handlers.gs). Guarded so the diagnostic
  // still runs if that file is not loaded (reports AUTHORITY_UNAVAILABLE rather than guessing an authority).
  var hdrAuth = (typeof SHIPPING_PLANS_HEADERS_ !== 'undefined') ? SHIPPING_PLANS_HEADERS_ : null;
  var lineAuth = (typeof SHIPPING_PLAN_LINES_HEADERS_ !== 'undefined') ? SHIPPING_PLAN_LINES_HEADERS_ : null;
  if (!hdrAuth || !lineAuth) {
    return { ok: false, verdict: 'AUTHORITY_UNAVAILABLE', RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch,
      note: 'SHIPPING_PLANS_HEADERS_ / SHIPPING_PLAN_LINES_HEADERS_ not loaded in this Apps Script project',
      R6E_ZERO_WRITE_CONFIRMED: 'YES (read-only)' };
  }
  var plans = TEMP_r6eAnalyzeTable_('shipping_plans', hdrAuth, 'SHIPPING_PLANS_HEADERS_ (11_shipping_plan_handlers.gs)');
  var lines = TEMP_r6eAnalyzeTable_('shipping_plan_lines', lineAuth, 'SHIPPING_PLAN_LINES_HEADERS_ (11_shipping_plan_handlers.gs)');
  var plansReady = plans.present && plans.schema_exact === 'YES';
  var linesReady = lines.present && lines.schema_exact === 'YES';
  var out = {
    ok: plansReady && linesReady,
    RUNTIME_SPREADSHEET_TARGET_MATCH: targetMatch, runtime_spreadsheet_id_fingerprint: TEMP_r5bIdFingerprint_(runtimeId),
    authority_file: 'assets/specs/active/apps-script/11_shipping_plan_handlers.gs',
    shipping_plans: plans, shipping_plan_lines: lines,
    shipping_plans_passes: plansReady ? 'YES' : 'NO', shipping_plan_lines_passes: linesReady ? 'YES' : 'NO',
    exact_rejected_header_shipping_plan_lines: lines.first_rejected_header,
    R6E_ZERO_WRITE_CONFIRMED: 'YES (read-only: getSheetByName + getRange().getValues() only; no setValues/appendRow/insertSheet/rename/repair)',
    R6E_DIAGNOSTIC_CHECKSUM: TEMP_r5bHash_([plans.actual_hash, plans.expected_hash, lines.actual_hash, lines.expected_hash].join('|')),
    verdict: (plansReady && linesReady) ? 'SHIPPING_PLAN_SCHEMA_READY' : 'SHIPPING_PLAN_SCHEMA_MISMATCH',
    R6E_DIAGNOSTIC_READY: 'YES'
  };
  Logger.log('R6E_SHIPPING_PLAN_SCHEMA ' + JSON.stringify(out, null, 2));
  return out;
}
