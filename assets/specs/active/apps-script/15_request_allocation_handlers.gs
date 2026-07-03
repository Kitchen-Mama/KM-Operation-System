// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 15_request_allocation_handlers.gs — Request Order second-layer Allocation drafts
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md §3.7.
//   - upsertRequestOrderAllocationDraft       : create/update ONE draft header
//   - upsertRequestOrderAllocationDraftLines  : REPLACE the lines of ONE draft (delete same draft_id
//                                               lines then append) — never touches other drafts
//   - submitRequestOrderAllocationDrafts      : mark drafts submitted (submitted_by/at)
// These are PLANNING SCRATCHPADS: they do NOT reserve or deduct stock. Send Request copies eligible
// lines into request_orders / request_order_lines via createRequestOrderDraft (13_).
// Reuses procurement* helpers (procurementEnsureSheet_/procurementAppendByHeader_/procurementFindRow_/
// procurementTimestamp_) and sheetEnsureColumns_ from the shared global scope. Tables auto-create with
// the documented header (missing-header safe; no existing table/field altered).
// ============================================================

var REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_ = [
  'request_allocation_draft_id', 'planning_cycle', 'company', 'country', 'marketplace', 'sku',
  'category', 'series', 'status', 'source_type',
  'created_by', 'created_at', 'updated_by', 'updated_at', 'submitted_by', 'submitted_at', 'note'
];

var REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_ = [
  'request_allocation_line_id', 'request_allocation_draft_id', 'request_month', 'request_bucket',
  'recommended_qty', 'order_qty', 'carton_qty', 'units_per_carton',
  'factory_stock_snapshot', 'site_stock_snapshot', 'third_party_stock_snapshot',
  'fc_qty_snapshot', 'target_pct_snapshot', 'allocation_method', 'note', 'created_at', 'updated_at'
];

var RA_STATUSES_ = { draft: 1, site_confirmed: 1, submitted: 1, cancelled: 1 };

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
 *     category?, series?, status?, source_type?, created_by?, note? }
 * status defaults to draft; must be one of draft/site_confirmed/submitted/cancelled.
 * Returns { request_allocation_draft_id }.
 */
function handleUpsertRequestOrderAllocationDraft_(body) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'request_order_allocation_drafts', REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_);
  var now = procurementTimestamp_();
  var actor = String((body && body.created_by) || 'request-order').trim();
  var status = String((body && body.status) || 'draft').trim();
  if (!RA_STATUSES_[status]) status = 'draft';

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
    category: String((body && body.category) || '').trim(),
    series: String((body && body.series) || '').trim(),
    status: status,
    source_type: String((body && body.source_type) || 'manual').trim(),
    created_by: actor,
    created_at: now,
    updated_by: actor,
    updated_at: now,
    note: String((body && body.note) || '').trim()
  });
  return jsonResponse_({ success: true, data: { request_allocation_draft_id: id, created: true } });
}

// ---- upsertRequestOrderAllocationDraftLines -----------------------
/**
 * REPLACE the lines of ONE draft. Body:
 *   { request_allocation_draft_id, lines: [ { request_month, request_bucket, order_qty,
 *     recommended_qty?, carton_qty?, units_per_carton?, factory_stock_snapshot?, site_stock_snapshot?,
 *     third_party_stock_snapshot?, fc_qty_snapshot?, target_pct_snapshot?, allocation_method?, note? } ] }
 * Deletes existing lines for that draft_id, then appends the provided lines. Returns { line_count }.
 */
function handleUpsertRequestOrderAllocationDraftLines_(body) {
  var draftId = String((body && body.request_allocation_draft_id) || '').trim();
  if (!draftId) return jsonResponse_({ success: false, error: 'request_allocation_draft_id required' });
  var lines = (body && body.lines) || [];

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'request_order_allocation_draft_lines', REQUEST_ORDER_ALLOCATION_DRAFT_LINES_HEADERS_);
  raDeleteLinesByDraft_(sh, draftId);   // replace this draft's lines only

  var now = procurementTimestamp_();
  var count = 0;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i] || {};
    procurementAppendByHeader_(sh, {
      request_allocation_line_id: 'RAL-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
      request_allocation_draft_id: draftId,
      request_month: String(l.request_month || '').trim(),
      request_bucket: String(l.request_bucket || '').trim(),
      recommended_qty: (l.recommended_qty != null && l.recommended_qty !== '') ? procurementNum_(l.recommended_qty) : '',
      order_qty: procurementNum_(l.order_qty),
      carton_qty: (l.carton_qty != null && l.carton_qty !== '') ? procurementNum_(l.carton_qty) : '',
      units_per_carton: (l.units_per_carton != null && l.units_per_carton !== '') ? procurementNum_(l.units_per_carton) : '',
      factory_stock_snapshot: (l.factory_stock_snapshot != null && l.factory_stock_snapshot !== '') ? procurementNum_(l.factory_stock_snapshot) : '',
      site_stock_snapshot: (l.site_stock_snapshot != null && l.site_stock_snapshot !== '') ? procurementNum_(l.site_stock_snapshot) : '',
      third_party_stock_snapshot: (l.third_party_stock_snapshot != null && l.third_party_stock_snapshot !== '') ? procurementNum_(l.third_party_stock_snapshot) : '',
      fc_qty_snapshot: (l.fc_qty_snapshot != null && l.fc_qty_snapshot !== '') ? procurementNum_(l.fc_qty_snapshot) : '',
      target_pct_snapshot: (l.target_pct_snapshot != null && l.target_pct_snapshot !== '') ? procurementNum_(l.target_pct_snapshot) : '',
      allocation_method: String(l.allocation_method || '').trim(),
      note: String(l.note || '').trim(),
      created_at: now,
      updated_at: now
    });
    count++;
  }
  return jsonResponse_({ success: true, data: { request_allocation_draft_id: draftId, line_count: count } });
}

// ---- submitRequestOrderAllocationDrafts ---------------------------
/**
 * Mark drafts submitted. Body: { draft_ids: [ ... ], submitted_by? }.
 * Sets status=submitted + submitted_by/at + updated_by/at for each found id. Never deletes rows.
 */
function handleSubmitRequestOrderAllocationDrafts_(body) {
  var ids = (body && body.draft_ids) || [];
  if (!ids.length) return jsonResponse_({ success: false, error: 'draft_ids required' });
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = procurementEnsureSheet_(ss, 'request_order_allocation_drafts', REQUEST_ORDER_ALLOCATION_DRAFTS_HEADERS_);
  var now = procurementTimestamp_();
  var actor = String((body && body.submitted_by) || 'request-order').trim();
  var n = 0;
  for (var i = 0; i < ids.length; i++) {
    var id = String(ids[i] || '').trim();
    if (!id) continue;
    var found = procurementFindRow_(sh, 'request_allocation_draft_id', id);
    if (!found) continue;
    function setCol(name, val) { var c = found.col(name); if (c !== -1) sh.getRange(found.row, c + 1).setValue(val); }
    setCol('status', 'submitted');
    setCol('submitted_by', actor);
    setCol('submitted_at', now);
    setCol('updated_by', actor);
    setCol('updated_at', now);
    n++;
  }
  return jsonResponse_({ success: true, data: { submitted: n } });
}
