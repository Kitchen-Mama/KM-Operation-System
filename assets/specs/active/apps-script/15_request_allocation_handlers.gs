// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 15_request_allocation_handlers.gs — Request Order second-layer Allocation drafts
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md §3.7 (CANONICAL schema, synced
// with the Live DB header 2026-07-27).
//   - upsertRequestOrderAllocationDraft       : create/update ONE draft header
//   - upsertRequestOrderAllocationDraftLines  : REPLACE the lines of ONE draft (delete same draft_id
//                                               lines then append) — never touches other drafts
//   - submitRequestOrderAllocationDrafts      : mark submitted line(s) + header status
//                                               (submitted / partially_submitted)
// These are PLANNING SCRATCHPADS: they do NOT reserve or deduct stock. Send Request copies eligible
// lines into request_orders / request_order_lines via createRequestOrderDraft (13_).
// Reuses procurement* helpers (procurementEnsureSheet_/procurementAppendByHeader_/procurementFindRow_/
// procurementTimestamp_/procurementNum_) and sheetEnsureColumns_ from the shared global scope. Tables
// auto-create with the documented header (missing-header safe; no existing table/field altered).
//
// CANONICAL SYNC (2026-07-27): headers below MATCH the manually-adjusted Live DB header exactly (name
// + order). Renames vs the previous code header: category→category_snapshot · series→series_snapshot ·
// fc_qty_snapshot→regular_demand_snapshot · site_stock_snapshot→destination_stock_snapshot ·
// third_party_stock_snapshot→third_party_available_qty_snapshot ·
// factory_stock_snapshot→factory_available_qty_snapshot. REMOVED: request_order_allocation_drafts.source_type
// (superseded by generation_type). New writes always use canonical names; the API normalizer keeps a
// read-only legacy fallback. Snapshot columns for calculation output that Engine A / Engine B do NOT yet
// produce are left BLANK (never faked with 0).
// ============================================================

var REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_ = [
  'request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku',
  'category_snapshot', 'series_snapshot', 'status', 'generation_type', 'draft_purpose',
  'calculation_run_id', 'formula_version', 'calculated_at', 'source_data_as_of', 'draft_version',
  'created_by', 'created_at', 'updated_by', 'updated_at', 'submitted_by', 'submitted_at',
  'cancelled_by', 'cancelled_at', 'cancel_reason', 'note'
];

var REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_ = [
  'request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket',
  'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot',
  'third_party_available_qty_snapshot', 'qualified_incoming_snapshot', 'approved_supply_snapshot',
  'factory_available_qty_snapshot', 'target_pct_snapshot', 'calculated_gap_qty_snapshot',
  'recommended_shipping_qty_snapshot', 'residual_production_required_snapshot',
  'reallocation_in_qty_snapshot', 'reallocation_out_qty_snapshot', 'net_order_need_snapshot',
  'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton', 'allocation_method',
  'recommendation_reason', 'recommendation_flags', 'line_status', 'submitted_by', 'submitted_at',
  'note', 'created_at', 'updated_at',
  'user_edited', 'user_edited_by'   // additive (Phase 2C Round 1D) — explicit user-edit provenance (§Persist-Adapter)
];

var RA_STATUSES_ = { draft: 1, site_confirmed: 1, submitted: 1, partially_submitted: 1, cancelled: 1 };
var RA_GENERATION_TYPES_ = { scheduled: 1, manual_refresh: 1, user_created: 1 };
var RA_DRAFT_PURPOSES_ = { regular: 1, emergency: 1 };
var RA_LINE_STATUSES_ = { draft: 1, submitted: 1, cancelled: 1 };

// The line snapshot columns produced by Engine A / Engine B. Written ONLY when the incoming line
// supplies a real value; otherwise left blank (never 0). recommended_qty (system Suggested Order
// snapshot) is included — a user edit updates order_qty, never recommended_qty.
var RA_LINE_SNAPSHOT_FIELDS_ = [
  'regular_demand_snapshot', 'special_event_demand_snapshot', 'destination_stock_snapshot',
  'third_party_available_qty_snapshot', 'qualified_incoming_snapshot', 'approved_supply_snapshot',
  'factory_available_qty_snapshot', 'target_pct_snapshot', 'calculated_gap_qty_snapshot',
  'recommended_shipping_qty_snapshot', 'residual_production_required_snapshot',
  'reallocation_in_qty_snapshot', 'reallocation_out_qty_snapshot', 'net_order_need_snapshot',
  'recommended_qty', 'carton_qty', 'units_per_carton'
];

// Read-only legacy aliases accepted on the incoming line payload → canonical column. New writes always
// use the canonical key; this only keeps a not-yet-migrated caller from silently dropping values.
var RA_LINE_LEGACY_ALIASES_ = {
  fc_qty_snapshot: 'regular_demand_snapshot',
  site_stock_snapshot: 'destination_stock_snapshot',
  third_party_stock_snapshot: 'third_party_available_qty_snapshot',
  factory_stock_snapshot: 'factory_available_qty_snapshot'
};

// Copy legacy alias keys to their canonical name when the canonical key is absent (never overwrites an
// explicitly-provided canonical value).
function raApplyLineAliases_(l) {
  for (var legacy in RA_LINE_LEGACY_ALIASES_) {
    if (!RA_LINE_LEGACY_ALIASES_.hasOwnProperty(legacy)) continue;
    var canon = RA_LINE_LEGACY_ALIASES_[legacy];
    if ((l[canon] == null || l[canon] === '') && l[legacy] != null && l[legacy] !== '') l[canon] = l[legacy];
  }
  return l;
}

// Delete every line row whose request_allocation_draft_id matches (bottom-up so row indices stay
// valid). Used to REPLACE a draft's lines intentionally — never deletes other drafts' lines.
function raDeleteLinesByDraft_(sheet, draftId) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return 0;
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = headers.indexOf('request_allocation_draft_id');
  if (col === -1) return 0;
  var removed = 0;
  for (var i = data.length - 1; i >= 1; i--) {
    if (String(data[i][col]).trim() === draftId) { sheet.deleteRow(i + 1); removed++; }
  }
  return removed;
}

// ---- upsertRequestOrderAllocationDraft ----------------------------
/**
 * Create or update ONE allocation-draft header. Body:
 *   { request_allocation_draft_id?, planning_cycle?, company?, country?, marketplace?, sku?,
 *     category_snapshot?, series_snapshot?, status?, generation_type?, draft_purpose?, draft_version?,
 *     created_by?, note? }   (legacy category/series accepted as read-only alias)
 * status defaults to draft (one of draft/site_confirmed/submitted/partially_submitted/cancelled).
 * generation_type defaults to user_created (scheduled/manual_refresh/user_created).
 * draft_purpose defaults to regular (regular/emergency). draft_version defaults to 1.
 * Calculation-provenance columns (calculation_run_id/formula_version/calculated_at/source_data_as_of)
 * are written ONLY when the body supplies a real value — never faked.
 * Returns { request_allocation_draft_id }.
 */
// F1-7N-FA-3C-R6A1 — Flat V2 cutover AUTHORITY SELECTOR for request_order_allocation_drafts. Under the cutover the
// live canonical tab is the 53-column Flat V2 schema (KMRDV2.V2_HEADERS), which EXCLUDES the retired category_snapshot/
// series_snapshot — so validating that tab against the legacy 26-col REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_ makes
// KMSAFE report those two legacy-expected columns MISSING → PRODUCTION_SAFETY:HEADER_MISSING (the observed Send
// failure). Select the V2 authority BEFORE any prodRequireSheet_ (mirrors the sibling loader 23_ rprReadTable_). The
// header upsert writes ONLY by header NAME (procurementAppendByHeader_/setCol), so category_snapshot/series_snapshot
// simply drop against the V2 tab (never required, never written) and NO request_order_allocation_draft_lines row is
// touched. flag=false → byte-identical legacy authority (the legacy line engine path, unchanged). A genuinely non-V2
// live schema STILL fails closed (V2_HEADERS columns missing). No silent fallback to the legacy engine while flag=true.
function raDraftsHeadersAuthority_() {
  if (typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function' && requestOrderDraftV2FlatCutoverEnabled_()
      && typeof KMRDV2 !== 'undefined' && KMRDV2 && Array.isArray(KMRDV2.V2_HEADERS)) {
    return KMRDV2.V2_HEADERS;
  }
  return REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_;
}

// Round 1H enforcement: the PUBLIC header route now acquires the ScriptLock + terminal-guards an existing
// header before delegating to the (private) single-keyed-row upsert core. No unlocked/terminal-bypass path.
function handleUpsertRequestOrderAllocationDraft_(body) {
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
  try {
    var ss0 = SpreadsheetApp.getActiveSpreadsheet();
    var id0 = String((body && body.request_allocation_draft_id) || '').trim();
    if (id0) {
      var sh0 = procurementEnsureSheet_(ss0, 'request_order_allocation_drafts', raDraftsHeadersAuthority_());
      var f0 = procurementFindRow_(sh0, 'request_allocation_draft_id', id0);
      if (f0) {
        var cS0 = f0.col('status');
        var st0 = cS0 !== -1 ? String(sh0.getRange(f0.row, cS0 + 1).getValue()).trim().toLowerCase() : '';
        if (st0 === 'submitted' || st0 === 'cancelled') return jsonResponse_({ success: false, error: 'IMMUTABLE_TERMINAL_STATUS:' + st0, stage: 'terminal' });
      }
      // F1-4B-FM6-R4E4 §9 — OPTIMISTIC LOCK on a lifecycle transition (e.g. Send Request confirming an existing
      // draft: draft → site_confirmed). When the caller supplies expectedToken it must match the CURRENT canonical
      // token (draft_version + user-edit fingerprint) — otherwise a newer user/system edit happened and we FAIL
      // CLOSED (never a last-write-wins confirm). Additive/optional: callers that omit expectedToken are unaffected.
      if (body && body.expectedToken != null) {
        var tv = raVerifyDraftToken_(id0, body.expectedToken);
        if (!tv.ok) return jsonResponse_({ success: false, error: tv.error, stage: 'concurrency' });
      }
    }
    return raUpsertDraftHeaderCore_(body);
  } finally { try { lock.releaseLock(); } catch (e2) { /* best-effort release */ } }
}

// §9 — verify a client-held optimistic-lock token against the CURRENT canonical draft token, reusing the EXISTING
// authority (KMPR.computeExpectedToken over the draft snapshot — the same token getRecommendationDraftToken emits and
// the locked line-edit writer enforces). No new token scheme. Fails closed when the bundle/draft is unavailable.
function raVerifyDraftToken_(draftId, expectedToken) {
  if (expectedToken == null) return { ok: true };
  if (typeof KMPR === 'undefined' || !KMPR.TABLES || !KMPR.TABLES['MONTHLY_ORDER']) return { ok: false, error: 'CONCURRENCY_TOKEN_UNAVAILABLE' };
  var cfg = KMPR.TABLES['MONTHLY_ORDER'];
  var b = rprBuildSheetSet_(SpreadsheetApp.getActiveSpreadsheet(), [cfg.header, cfg.lines, KMPR.RUN_JOURNAL_TABLE]);
  var snap = KMPR.loadDraftSnapshot(b.set, draftId, 'MONTHLY_ORDER');
  if (!snap || !snap.draft) return { ok: false, error: 'DRAFT_NOT_FOUND' };
  var cur = KMPR.computeExpectedToken(snap.draft.draft_version, (snap.lines || []).map(function (l) { return { lineKey: l.lineKey, userQty: l.userQty, userEdited: l.userEdited }; }));
  var okMatch = String(cur.draft_version) === String(expectedToken.draft_version) && String(cur.userEditFingerprint) === String(expectedToken.userEditFingerprint);
  return okMatch ? { ok: true } : { ok: false, error: 'CONCURRENCY_TOKEN_MISMATCH' };
}

// Private single-keyed-row header upsert core (reached ONLY under lock via the public handler above).
function raUpsertDraftHeaderCore_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'request_order_allocation_drafts', raDraftsHeadersAuthority_());
  var now = procurementTimestamp_();
  var actor = String((body && body.created_by) || 'request-order').trim();
  var status = String((body && body.status) || 'draft').trim();
  if (!RA_STATUSES_[status]) status = 'draft';
  var genType = String((body && body.generation_type) || 'user_created').trim();
  if (!RA_GENERATION_TYPES_[genType]) genType = 'user_created';
  var purpose = String((body && body.draft_purpose) || 'regular').trim();
  if (!RA_DRAFT_PURPOSES_[purpose]) purpose = 'regular';
  var draftVersion = String((body && body.draft_version) || '1').trim();
  var categorySnap = String((body && (body.category_snapshot != null ? body.category_snapshot : body.category)) || '').trim();
  var seriesSnap = String((body && (body.series_snapshot != null ? body.series_snapshot : body.series)) || '').trim();

  var id = String((body && body.request_allocation_draft_id) || '').trim();
  if (id) {
    var found = procurementFindRow_(sh, 'request_allocation_draft_id', id);
    if (found) {
      function setCol(name, val) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(val); }
      setCol('status', status);
      if (body && body.note != null) setCol('note', String(body.note));
      setCol('updated_by', actor);
      setCol('updated_at', now);
      return jsonResponse_({ success: true, data: { request_allocation_draft_id: id, updated: true } });
    }
  }
  if (!id) id = 'RAD-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  procurementAppendByHeader_(sh, {
    request_allocation_draft_id: id,
    planning_cycle: String((body && body.planning_cycle) || '').trim(),
    company: String((body && body.company) || '').trim(),
    country: String((body && body.country) || '').trim(),
    marketplace: String((body && body.marketplace) || '').trim(),
    sku: String((body && body.sku) || '').trim(),
    category_snapshot: categorySnap,
    series_snapshot: seriesSnap,
    status: status,
    generation_type: genType,
    draft_purpose: purpose,
    // Calculation provenance — blank unless the caller supplies a real value (no fabricated data).
    calculation_run_id: String((body && body.calculation_run_id) || '').trim(),
    formula_version: String((body && body.formula_version) || '').trim(),
    calculated_at: String((body && body.calculated_at) || '').trim(),
    source_data_as_of: String((body && body.source_data_as_of) || '').trim(),
    draft_version: draftVersion,
    created_by: actor,
    created_at: now,
    updated_by: actor,
    updated_at: now,
    submitted_by: '',
    submitted_at: '',
    cancelled_by: '',
    cancelled_at: '',
    cancel_reason: '',
    note: String((body && body.note) || '').trim()
  });
  return jsonResponse_({ success: true, data: { request_allocation_draft_id: id, created: true } });
}

// ---- upsertRequestOrderAllocationDraftLines -----------------------
/**
 * REPLACE the lines of ONE draft. Body:
 *   { request_allocation_draft_id, lines: [ { request_month, request_bucket, order_qty, recommended_qty?,
 *     carton_qty?, units_per_carton?, regular_demand_snapshot?, special_event_demand_snapshot?,
 *     destination_stock_snapshot?, third_party_available_qty_snapshot?, qualified_incoming_snapshot?,
 *     approved_supply_snapshot?, factory_available_qty_snapshot?, target_pct_snapshot?,
 *     calculated_gap_qty_snapshot?, recommended_shipping_qty_snapshot?,
 *     residual_production_required_snapshot?, reallocation_in_qty_snapshot?,
 *     reallocation_out_qty_snapshot?, net_order_need_snapshot?, allocation_method?, recommendation_reason?,
 *     recommendation_flags?, line_status?, note? } ] }
 * QUANTITY PROTECTION (§3.7 / spec §C): order_qty = user input (drives the Request Order Draft);
 *   recommended_qty = system Suggested Order snapshot — kept separate, never overwritten by order_qty.
 *   carton_qty is passed through as-is (an explicit user partial-carton qty is NOT re-CEILINGed here).
 * Snapshot columns are written ONLY when a real value is supplied (blank otherwise — never faked 0).
 * request_bucket is T1/T2/T3 only; T4 is visibility-only and must never be written here.
 * New lines start line_status = draft. Legacy snapshot aliases are accepted read-only.
 * Deletes existing lines for that draft_id, then appends the provided lines. Returns { line_count }.
 */
// Round 1H ENFORCEMENT: this PUBLIC route is now a thin compatibility ADAPTER that maps the legacy batch payload
// into the canonical LOCKED user-decision-edit command (allowInsert + reconcile) handled by 25_ (KMUE + KMPR +
// LockService + keyed-delta). No unlocked Sheet write remains behind this route. Order_qty is preserved exactly
// (partial carton), recommended_qty snapshot is preserved on UPDATE, provenance is explicit, terminal lines are
// never touched, removed lines supersede (never delete). Requires body.expectedToken (§14) — fails closed
// (CONFLICT) without it. The prior unlocked delete/upsert body is RETIRED (its canonical, tested equivalent is
// KMPR.applyUserDecisionEdits). T4 remains visibility-only and is dropped here.
function handleUpsertRequestOrderAllocationDraftLines_(body) {
  var draftId = String((body && body.request_allocation_draft_id) || '').trim();
  if (!draftId) return jsonResponse_({ success: false, error: 'request_allocation_draft_id required' });
  var lines = (body && body.lines) || [];
  var edits = [];
  for (var i = 0; i < lines.length; i++) {
    var l = raApplyLineAliases_(lines[i] || {});
    var bucket = String(l.request_bucket || '').trim();
    if (bucket === 'T4') continue;   // T4 is visibility-only — never a draft-line order commitment
    var fields = { order_qty: procurementNum_(l.order_qty) };
    if (l.carton_qty != null && l.carton_qty !== '') fields.carton_qty = procurementNum_(l.carton_qty);
    if (l.allocation_method != null && String(l.allocation_method).trim() !== '') fields.allocation_method = String(l.allocation_method).trim();
    if (l.note != null && String(l.note).trim() !== '') fields.note = String(l.note).trim();
    var snap = {};
    RA_LINE_SNAPSHOT_FIELDS_.forEach(function (f) { if (l[f] != null && l[f] !== '') snap[f] = procurementNum_(l[f]); });
    edits.push({ naturalKey: { request_month: String(l.request_month || '').trim(), request_bucket: bucket }, fields: fields, recommendedSnapshot: snap });
  }
  return handleUpdateRecommendationDecisionLocked_({
    recommendationType: 'MONTHLY_ORDER', draftId: draftId, edits: edits, reconcile: true, allowInsert: true,
    expectedToken: (body && body.expectedToken), actor: String((body && body.updated_by) || (body && body.actor) || 'request-order').trim()
  });
}

// ---- submitRequestOrderAllocationDrafts ---------------------------
/**
 * Mark drafts submitted. Body: { draft_ids: [ ... ], submitted_by?, submit_buckets?: ['T1', ...] }.
 * Per draft: submit the eligible lines (all lines, or only those whose request_bucket is in
 * submit_buckets when provided) — set line_status=submitted + submitted_by/at on each. Then derive the
 * HEADER status from the lines: every non-cancelled line submitted → submitted; a mix of submitted and
 * draft → partially_submitted; none submitted → header status unchanged. Header submitted_by/at are set
 * only when the header becomes fully submitted. Never deletes rows.
 */
function handleSubmitRequestOrderAllocationDrafts_(body) {
  var ids = (body && body.draft_ids) || [];
  if (!ids.length) return jsonResponse_({ success: false, error: 'draft_ids required' });
  // F1-7N-FA-3C-R2b-3 — MONTHLY flat V2 submit (cutover-gated, DEFAULT OFF). Per draft: KMRDV2.applySubmit over the
  // flat tiers (submit_buckets, or every submittable tier), header re-derived by KMRDV2.deriveHeaderStatus, persisted
  // as ONE flat row via the shared lock/token/journal. NO Draft-Line row is touched. Legacy line path stays live when off.
  if (typeof requestOrderDraftV2FlatCutoverEnabled_ === 'function' && requestOrderDraftV2FlatCutoverEnabled_() && typeof KMRDV2P !== 'undefined' && typeof rpoSubmitMonthlyFlatResult_ === 'function') {
    var vActor = String((body && body.submitted_by) || 'request-order').trim();
    var vBuckets = (body && body.submit_buckets) || null;
    var vN = 0, vResults = [];
    for (var vi = 0; vi < ids.length; vi++) {
      var vid = String(ids[vi] || '').trim(); if (!vid) continue;
      var vr = rpoSubmitMonthlyFlatResult_(vid, vBuckets, vActor);
      vResults.push({ draftId: vid, success: vr.success, outcome: vr.outcome, headerStatus: vr.headerStatus });
      if (vr && vr.wrote) vN++;
    }
    return jsonResponse_({ success: true, data: { submitted: vN, model: 'flat_v2', results: vResults } });
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'request_order_allocation_drafts', REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_);
  var lsh = procurementEnsureSheet_(ss, 'request_order_allocation_draft_lines', REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_);
  var now = procurementTimestamp_();
  var actor = String((body && body.submitted_by) || 'request-order').trim();
  var buckets = (body && body.submit_buckets) || null;
  var bucketSet = null;
  if (buckets && buckets.length) { bucketSet = {}; for (var b = 0; b < buckets.length; b++) bucketSet[String(buckets[b]).trim()] = 1; }

  var n = 0;
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i] || '').trim();
    if (!id) continue;
    var found = procurementFindRow_(sh, 'request_allocation_draft_id', id);
    if (!found) continue;

    var counts = raSubmitLinesByDraft_(lsh, id, bucketSet, actor, now);   // { submitted, remainingDraft, total }
    function setCol(name, val) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(val); }
    var headerStatus;
    if (counts.submitted > 0 && counts.remainingDraft === 0) headerStatus = 'submitted';
    else if (counts.submitted > 0 && counts.remainingDraft > 0) headerStatus = 'partially_submitted';
    else headerStatus = null;   // nothing submitted → leave header status as-is

    if (headerStatus) {
      setCol('status', headerStatus);
      if (headerStatus === 'submitted') { setCol('submitted_by', actor); setCol('submitted_at', now); }
      setCol('updated_by', actor);
      setCol('updated_at', now);
      n++;
    }
  }
  return jsonResponse_({ success: true, data: { submitted: n } });
}

// Set line_status=submitted (+ submitted_by/at + updated_at) on the eligible lines of ONE draft and
// return the submitted / remaining-draft / total counts (cancelled lines excluded from the tallies).
function raSubmitLinesByDraft_(sheet, draftId, bucketSet, actor, now) {
  var out = { submitted: 0, remainingDraft: 0, total: 0 };
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return out;
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var cDraft = headers.indexOf('request_allocation_draft_id');
  var cBucket = headers.indexOf('request_bucket');
  var cStatus = headers.indexOf('line_status');
  var cSubBy = headers.indexOf('submitted_by');
  var cSubAt = headers.indexOf('submitted_at');
  var cUpd = headers.indexOf('updated_at');
  if (cDraft === -1 || cStatus === -1) return out;

  for (var r = 1; r < data.length; r++) {
    if (String(data[r][cDraft]).trim() !== draftId) continue;
    var cur = String(data[r][cStatus]).trim();
    if (cur === 'cancelled') continue;
    out.total++;
    var bk = cBucket !== -1 ? String(data[r][cBucket]).trim() : '';
    var eligible = !bucketSet || bucketSet[bk];
    if (eligible) {
      sheet.getRange(r + 1, cStatus + 1).setValue('submitted');
      if (cSubBy !== -1) sheet.getRange(r + 1, cSubBy + 1).setValue(actor);
      if (cSubAt !== -1) sheet.getRange(r + 1, cSubAt + 1).setValue(now);
      if (cUpd !== -1) sheet.getRange(r + 1, cUpd + 1).setValue(now);
      out.submitted++;
    } else if (cur !== 'submitted') {
      out.remainingDraft++;
    }
  }
  return out;
}

// ============================================================================================================
// F1-7N-FB-3C §B — THE USER-AUTHORIZED DRAFT-CREATION BOUNDARY.
// ------------------------------------------------------------------------------------------------------------
// THE BUSINESS DECISION THAT MADE THIS NECESSARY, stated before the code because it CHANGES A STANDING RULE.
// Until FB-3C the rule was "AI Plan remains the draft-creation boundary" (R4E4/R6B). FB-3B then retired the
// R4E5B path that created a draft inside the Send transition, which was correct on its own terms but left a real
// hole: a user who typed a quantity onto a SKU with no persisted draft wrote NOTHING AT ALL —
// _roSaveTierEditToCanonicalDraft_ returned early — and that SKU was then unsendable, because Send consumes
// persisted drafts only. The user has resolved this:
//
//     AI Plan is an INITIAL/DEFAULT draft source. It is NOT the exclusive draft-creation boundary.
//     A DELIBERATE USER QUANTITY EDIT is ALSO an authorized canonical draft-creation/update boundary.
//
// That is the smallest possible extension, and it is recorded in
// docs/planning/REQUEST_ORDER_ALLOCATION_DRAFT_CREATION_BOUNDARY.md — not only here in runtime.
//
// WHAT THIS HANDLER IS AND IS NOT. It is a COMPOSITION of two existing canonical writers, in this order:
//   1. KMRDV2P.generateMonthlyFlat via 24_ rpoGenerateMonthlyFlatResult_  — the canonical CREATE. It mints the
//      canonical identity through KMRDV2.draftId, honours the manual non-actionable gate (AI may never create an
//      all-zero draft; a MANUAL create may), writes ONE flat 53-column row under the shared ScriptLock +
//      optimistic token + run journal, and roundtrip-verifies the id/cycle text format.
//   2. KMRDV2P.editMonthlyFlat via 24_ rpoEditMonthlyFlatResult_ — the canonical QUANTITY WRITE, under the
//      optimistic token, stamping user_edited and never touching recommended_qty.
// It authors no row, no id, no schema and no arithmetic of its own. In particular it NEVER mints a
// 'RAD-M-…' identity: the id always comes from the canonical KMRDV2 projection, so it is
// 'RD::MONTHLY_ORDER::<cycle>::company=..|country=..|draft_purpose=..|marketplace=..|sku=..' by construction.
//
// AND IT ALWAYS READS BACK. A create-then-edit sequence that reports success without re-reading the row is the
// same false-persistence class of bug FB-2A fixed on the Site Inventory side. The persisted tier quantity is
// re-read and compared to the requested value; a mismatch is ALLOCATION_DRAFT_QUANTITY_NOT_VERIFIED and the page
// keeps the route visibly UNSAVED, which blocks Send.
//
// ZERO IS A REAL DECISION (§B.7). order_qty = 0 is accepted and persisted as 0. It is NOT a delete and NOT a
// cancel: the draft stays active, the tier keeps its month, and the canonical zero-quantity rule then excludes
// that tier from the Send workset (rosBuildWorkset_ counts it as tier_zero_or_blank_qty). The operator can raise
// it again later without re-creating anything.
// ============================================================================================================

var RAEE_TIERS_ = { T1: 1, T2: 1, T3: 1 };   // T4 is visibility-only and is never an order commitment

// Resolve the ACTIVE flat draft for one exact business scope + cycle, using the EXISTING resolver so this
// handler cannot disagree with the generation path about what "active" means.
function raeeLoadActive_(ss, cycle, scope) {
  return rpoFlatLoadActive_(ss, { recommendationType: 'MONTHLY_ORDER', planningCycle: cycle,
    businessScope: { company: scope.company, country: scope.country, marketplace: scope.marketplace,
      sku: scope.sku, draft_purpose: scope.draft_purpose } });
}

// Read the persisted tier quantity back from the canonical flat DTO. Returns null when the tier is absent, so an
// absent tier can never be reported as a verified 0.
function raeePersistedTierQty_(dto, tier) {
  var tiers = (dto && dto.tiers) || [];
  for (var i = 0; i < tiers.length; i++) {
    if (String(tiers[i].tier).toUpperCase() !== String(tier).toUpperCase()) continue;
    var q = tiers[i].orderQty;
    return (q === null || q === undefined || q === '') ? null : Number(q);
  }
  return null;
}

/**
 * requestOrder.allocationDraft.ensureAndEdit
 *
 * body.payload:
 *   { planning_cycle: 'YYYY-MM',
 *     scope: { company, country, marketplace, sku, draft_purpose? },
 *     tier: 'T1'|'T2'|'T3', request_month: 'YYYY-MM',
 *     order_qty: number (>= 0),      // 0 is a real, persisted decision — see §B.7
 *     note?: string, units_per_carton?: number, actor?: string }
 *
 * Returns { request_allocation_draft_id, created, updated, persisted_order_qty, verified, draft_version,
 *           canonical_identity, generation_type }.
 */
function handleRequestOrderAllocationDraftEnsureAndEdit_(body) {
  var payload = (body && body.payload) || body || {};
  var scopeIn = payload.scope || {};
  var scope = {
    company: String(scopeIn.company == null ? '' : scopeIn.company).trim(),
    country: String(scopeIn.country == null ? '' : scopeIn.country).trim(),
    marketplace: String(scopeIn.marketplace == null ? '' : scopeIn.marketplace).trim(),
    sku: String(scopeIn.sku == null ? '' : scopeIn.sku).trim(),
    draft_purpose: String(scopeIn.draft_purpose == null ? '' : scopeIn.draft_purpose).trim() || 'regular'
  };
  var tier = String(payload.tier == null ? '' : payload.tier).trim().toUpperCase();
  var month = String(payload.request_month == null ? '' : payload.request_month).trim();
  var actor = String(payload.actor == null ? '' : payload.actor).trim() || 'request-order';

  // ---- validate BEFORE touching anything. Every refusal is a named zero-write. ----------------------------
  if (!scope.company || !scope.country || !scope.marketplace || !scope.sku) {
    return jsonResponse_({ success: false, error: 'INVALID_SCOPE', code: 'INVALID_SCOPE', zero_write: true,
      message: 'company + country + marketplace + sku are required to address a canonical allocation draft.' });
  }
  if (!RAEE_TIERS_[tier]) {
    return jsonResponse_({ success: false, error: 'INVALID_TIER', code: 'INVALID_TIER', zero_write: true,
      message: 'tier must be T1, T2 or T3. T4 is visibility-only and is never an order commitment.' });
  }
  var qty = Number(payload.order_qty);
  if (!isFinite(qty) || qty < 0) {
    return jsonResponse_({ success: false, error: 'INVALID_ORDER_QTY', code: 'INVALID_ORDER_QTY', zero_write: true,
      message: 'order_qty must be a finite number >= 0. A blank is not a decision; 0 IS a decision and persists as 0.' });
  }
  var cycle;
  try { rpoFlatBundle_(); cycle = KMRDV2.normalizePlanningCycleMonthly(payload.planning_cycle); }
  catch (e) {
    return jsonResponse_({ success: false, error: 'INVALID_PLANNING_CYCLE', code: 'INVALID_PLANNING_CYCLE', zero_write: true,
      message: 'planning_cycle must be exactly YYYY-MM (the current-run authority). ' + String(e && e.message || e) });
  }
  if (!month) month = cycle;   // the tier month defaults to the cycle rather than being invented per tier

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  try { rpoFlatSchemaGate_(ss); }
  catch (se) {
    return jsonResponse_({ success: false, error: (se && se.message) || 'RECOMMENDATION_SCHEMA_NOT_READY',
      code: 'RECOMMENDATION_SCHEMA_NOT_READY', stage: 'schema_validation', zero_write: true });
  }

  // ---- STEP 1 · does a canonical active draft already exist for this exact scope + cycle? -----------------
  var active = raeeLoadActive_(ss, cycle, scope);
  if (active && active.status === 'BLOCKED_CONFLICT') {
    return jsonResponse_({ success: false, error: 'BLOCKED_CONFLICT', code: 'BLOCKED_CONFLICT', zero_write: true,
      stage: 'active', message: 'More than one active allocation draft exists for this scope, so which one to edit is a business decision. Nothing was written.',
      data: { match_count: active.matchCount || null } });
  }
  var existed = !!(active && active.draft);
  var draftId = existed ? String((active.draft.request_allocation_draft_id || '')).trim() : '';

  // ---- STEP 2 · CREATE through the canonical generation path when it does not exist -----------------------
  // §B.2. facts are supplied explicitly so a manual create needs NO materialized gap row: the user's edit is the
  // authority, recommended_qty stays 0 (the AI default was never produced for this tier), and the manual
  // non-actionable gate permits an all-zero create. generation_type is user_created so provenance stays honest.
  var created = false;
  if (!existed) {
    var gen = rpoGenerateMonthlyFlatResult_({
      recommendationType: 'MONTHLY_ORDER', mode: 'manual', action: 'create',
      planningCycle: cycle, businessScope: scope, generationType: 'user_created', actor: actor,
      facts: { ready: true, formulaVersion: 'USER_MANUAL_ORDER', sourceDataAsOf: '',
        lines: [{ request_bucket: tier, request_month: month, recommended_qty: 0,
          units_per_carton: (payload.units_per_carton == null ? '' : payload.units_per_carton) }] }
    });
    var gd = (gen && gen.data) || {};
    if (!gen || gen.success !== true) {
      return jsonResponse_({ success: false, error: String(gd.error || gen && gen.error || 'ALLOCATION_DRAFT_CREATE_FAILED'),
        code: 'ALLOCATION_DRAFT_CREATE_FAILED', stage: String(gd.stage || ''), zero_write: true,
        message: 'The canonical allocation draft could not be created, so the quantity was NOT persisted. The value stays UNSAVED on screen.' });
    }
    draftId = String(gd.draftId || gd.committedDraftId || '').trim();
    created = true;
    if (gd.writeOutcome === 'WRITE_COMMITTED_READBACK_FAILED') {
      // The row committed but its own roundtrip failed. Report it truthfully rather than continuing to edit a
      // row we cannot prove exists; the deterministic id keeps a re-run idempotent.
      return jsonResponse_({ success: false, error: 'ALLOCATION_DRAFT_CREATE_UNVERIFIED',
        code: 'ALLOCATION_DRAFT_CREATE_UNVERIFIED', stage: 'create_readback', zero_write: false,
        message: 'The allocation draft was committed but could not be read back, so the quantity was not applied. Reload to reconcile before retrying.',
        data: { request_allocation_draft_id: draftId, requires_reconciliation: true } });
    }
  }
  if (!draftId) {
    return jsonResponse_({ success: false, error: 'ALLOCATION_DRAFT_ID_UNRESOLVED', code: 'ALLOCATION_DRAFT_ID_UNRESOLVED',
      zero_write: true, message: 'No canonical allocation draft id could be resolved for this scope.' });
  }

  // ---- STEP 3 · persist the USER QUANTITY through the canonical locked edit writer ------------------------
  // §B.1 — for an existing draft this is the ONLY path taken, so an existing AI-generated draft is UPDATED in
  // place and never replaced. recommended_qty is untouched by the edit writer by contract.
  var tok = rpoFlatTokenForDraft_(ss, draftId);
  var edit = rpoEditMonthlyFlatResult_({
    draftId: draftId,
    edits: [{ naturalKey: { request_month: month, request_bucket: tier },
      fields: (payload.note == null ? { order_qty: qty } : { order_qty: qty, note: String(payload.note) }) }],
    expectedToken: (tok && tok.expectedToken) || tok || null,
    actor: actor
  });
  if (!edit || edit.success !== true) {
    return jsonResponse_({ success: false, error: String((edit && (edit.error || edit.reason)) || 'ALLOCATION_DRAFT_QUANTITY_WRITE_FAILED'),
      code: 'ALLOCATION_DRAFT_QUANTITY_WRITE_FAILED', stage: String((edit && edit.stage) || 'edit'),
      zero_write: !created,
      message: 'The quantity could not be persisted' + (created ? ' (the draft row itself was created).' : '.') + ' The value stays UNSAVED on screen and Send stays blocked.',
      data: { request_allocation_draft_id: draftId, draft_created: created } });
  }

  // ---- STEP 4 · READ IT BACK. A writer's success flag is not persistence proof. --------------------------
  var after = rpoFlatLoadById_(ss, draftId);
  var dto = (after && (after.draft || after.dto || after)) || null;
  var persisted = raeePersistedTierQty_(dto, tier);
  if (persisted === null || Number(persisted) !== Number(qty)) {
    return jsonResponse_({ success: false, error: 'ALLOCATION_DRAFT_QUANTITY_NOT_VERIFIED',
      code: 'ALLOCATION_DRAFT_QUANTITY_NOT_VERIFIED', stage: 'readback', zero_write: false,
      message: 'The quantity was written but the read-back does not match, so it is NOT treated as saved. Reload to see the persisted value before retrying.',
      data: { request_allocation_draft_id: draftId, intended_order_qty: qty,
        persisted_order_qty: persisted, draft_created: created, requires_reconciliation: true } });
  }

  return jsonResponse_({ success: true, data: {
    request_allocation_draft_id: draftId,
    created: created, updated: !created,
    persisted_order_qty: Number(persisted),
    verified: true,
    tier: tier, request_month: month, planning_cycle: cycle,
    draft_version: (dto && dto.draftVersion != null) ? dto.draftVersion : null,
    status: (dto && dto.status) || '',
    generation_type: (dto && dto.generationType) || '',
    // §B.5 — proof, on the wire, that no RAD-M identity was minted. The client asserts this.
    canonical_identity: /^RD::MONTHLY_ORDER::\d{4}-\d{2}::/.test(draftId),
    // §B.7 — a persisted 0 is saved AND excluded from Send by the canonical zero-quantity rule.
    sendable_tier: Number(persisted) > 0,
    zero_quantity_rule: Number(persisted) > 0
      ? 'This tier carries a positive quantity and will be included in the next Send.'
      : 'A persisted 0 is a saved decision: the draft stays active and this tier is EXCLUDED from the Send workset until it is positive again.'
  } });
}
