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
function handleUpsertRequestOrderAllocationDraft_(body) {
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
function handleUpsertRequestOrderAllocationDraftLines_(body) {
  var draftId = String((body && body.request_allocation_draft_id) || '').trim();
  if (!draftId) return jsonResponse_({ success: false, error: 'request_allocation_draft_id required' });
  var lines = (body && body.lines) || [];

  var actor = String((body && body.updated_by) || (body && body.actor) || 'request-order').trim();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'request_order_allocation_draft_lines', REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_);

  // Natural-key upsert (request_allocation_draft_id + request_month + request_bucket) — replaces the prior
  // delete+replace (Phase 2C Round 1D, §Persist-Adapter). Preserves rows; supersedes removed ones (never
  // deletes); persists explicit user-edit provenance. Canonical/tested logic mirror:
  // assets/js/core/supply-planning-persistence-repository.js (fake-sheet verified).
  var now = procurementTimestamp_();
  var data = sh.getDataRange().getValues();
  var H = data[0].map(function (h) { return String(h).trim(); });
  var cD = H.indexOf('request_allocation_draft_id'), cM = H.indexOf('request_month'), cB = H.indexOf('request_bucket'),
      cS = H.indexOf('line_status'), cUE = H.indexOf('user_edited');
  function raFindLineRow_(month, bucket) {
    for (var r = 1; r < data.length; r++) {
      if (String(data[r][cD]).trim() === draftId && String(data[r][cM]).trim() === String(month) && String(data[r][cB]).trim() === String(bucket)) return r;
    }
    return -1;
  }
  var seen = {}, count = 0;
  for (var i = 0; i < lines.length; i++) {
    var l = raApplyLineAliases_(lines[i] || {});
    var bucket = String(l.request_bucket || '').trim();
    if (bucket === 'T4') continue;   // T4 is visibility-only — never a draft-line order commitment
    var month = String(l.request_month || '').trim();
    var lineStatus = String(l.line_status || 'draft').trim();
    if (!RA_LINE_STATUSES_[lineStatus] && ['active', 'blocked', 'superseded', 'superseded_user_review'].indexOf(lineStatus) === -1) lineStatus = 'draft';
    // Explicit user-edit provenance ONLY — never inferred by order_qty != recommended_qty (§Persist-Adapter PA-13).
    var userEdited = (l.user_edited === true || String(l.user_edited).toUpperCase() === 'TRUE');
    seen[month + '|' + bucket] = 1;

    var rowObj = {
      request_allocation_draft_id: draftId,
      request_month: month,
      request_bucket: bucket,
      order_qty: procurementNum_(l.order_qty),   // exact — never re-rounded (partial-carton preserved)
      allocation_method: String(l.allocation_method || '').trim(),
      recommendation_reason: String(l.recommendation_reason || '').trim(),
      recommendation_flags: String(l.recommendation_flags || '').trim(),
      line_status: lineStatus,
      user_edited: userEdited ? 'TRUE' : 'FALSE',
      user_edited_by: userEdited ? actor : '',
      updated_at: now
    };
    RA_LINE_SNAPSHOT_FIELDS_.forEach(function (f) {
      if (l[f] != null && l[f] !== '') rowObj[f] = procurementNum_(l[f]);
    });

    var existing = raFindLineRow_(month, bucket);
    if (existing === -1) {
      rowObj.request_allocation_line_id = 'RAL-' + Utilities.getUuid().substring(0, 10).toUpperCase();
      rowObj.submitted_by = '';
      rowObj.submitted_at = '';
      rowObj.note = String(l.note || '').trim();
      rowObj.created_at = now;
      procurementAppendByHeader_(sh, rowObj);
    } else {
      var row = data[existing].slice();
      Object.keys(rowObj).forEach(function (k) { var c = H.indexOf(k); if (c !== -1) row[c] = rowObj[k]; });
      if (String(l.note || '').trim() !== '') { var cN = H.indexOf('note'); if (cN !== -1) row[cN] = String(l.note).trim(); }
      sh.getRange(existing + 1, 1, 1, row.length).setValues([row]);
      data[existing] = row;
    }
    count++;
  }
  // Supersede rows removed from the incoming set — never hard-delete; terminal rows are untouched.
  var superseded = 0;
  for (var r2 = 1; r2 < data.length; r2++) {
    if (String(data[r2][cD]).trim() !== draftId) continue;
    if (seen[String(data[r2][cM]).trim() + '|' + String(data[r2][cB]).trim()]) continue;
    var st = String(data[r2][cS]).trim();
    if (['submitted', 'cancelled', 'superseded', 'superseded_user_review'].indexOf(st) !== -1) continue;
    var wasEdited = cUE !== -1 && String(data[r2][cUE]).toUpperCase() === 'TRUE';
    if (cS !== -1) sh.getRange(r2 + 1, cS + 1).setValue(wasEdited ? 'superseded_user_review' : 'superseded');
    superseded++;
  }
  return jsonResponse_({ success: true, data: { request_allocation_draft_id: draftId, line_count: count, superseded: superseded } });
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
