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
      var sh0 = procurementEnsureSheet_(ss0, 'request_order_allocation_drafts', REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_);
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
  var sh = procurementEnsureSheet_(ss, 'request_order_allocation_drafts', REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_);
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
