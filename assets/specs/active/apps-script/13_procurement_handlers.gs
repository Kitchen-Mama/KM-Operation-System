// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 13_procurement_handlers.gs — Procurement Layer (Phase 1) writes
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/REQUEST_ORDER_AND_PURCHASE_ORDER_SPEC.md (Phase 1)
//   - createRequestOrderDraft        : create request_orders + request_order_lines (status=draft)
//   - updateRequestOrderStatus       : submit/approve/reject/cancel/done flow
//   - updateRequestOrderLineQty      : edit approved_qty (Draft only)
//   - createPurchaseOrderFromRequest : Approved request → purchase_orders + purchase_order_lines
//   - updatePurchaseOrderStatus      : issue/confirm/start_production/ready_to_ship/complete/cancel
//   - updatePurchaseOrderLine        : edit ordered_qty / unit_cost / note (Draft PO only)
// Immutable Flow: PO copies Request Order but NEVER writes it back (except the one-time
//   request_orders.status = converted_to_po marker set at conversion). Request Order NEVER
//   writes shipments / inventory / factory_stock. Tables auto-created with documented header
//   (missing-header safe; no existing table/field altered). Shares sheetEnsureColumns_ (11_).
// ============================================================

var REQUEST_ORDERS_HEADERS_ = [
  'request_order_id', 'request_order_no', 'request_order_version', 'parent_request_order_id',
  'company', 'supplier_id', 'supplier_name', 'factory_id', 'warehouse_id', 'status',
  'total_sku', 'total_qty', 'total_cartons', 'estimated_amount', 'currency',
  'source', 'source_ref_type', 'source_ref_id',
  'created_by', 'created_at', 'submitted_by', 'submitted_at',
  'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejected_reason',
  'cancelled_by', 'cancelled_at', 'completed_by', 'completed_at',
  'note', 'updated_by', 'updated_at'
];

var REQUEST_ORDER_LINES_HEADERS_ = [
  'request_order_line_id', 'request_order_id', 'sku', 'product_name', 'series',
  // company = the site owner (KM / ResUS / ResTW …) this line's demand belongs to. Each line maps to
  // ONE company; the KM/ResUS/ResTW split in the Draft UI is the set of per-company lines (no separate
  // split-storage table yet — see request_order_line_sources note in the spec).
  'company',
  // Demand bucket is preserved on EVERY line (Request Layer keeps T1/T2/T3 separated; PO Layer may
  // merge later via request_order_po_links). request_month = YYYY-MM the bucket maps to.
  'request_bucket', 'request_month',
  // Decision-layer schedule fields (per tier; written to all lines of the tier at Save). Blank until entered.
  'inspection_date', 'expected_ready_date', 'expected_ship_date',
  'requested_qty', 'approved_qty', 'final_order_qty', 'units_per_carton', 'carton_qty',
  // Snapshots carried from the Order Allocation draft (same sources as 下單系統 table; blank when absent).
  'forecast_qty', 'current_stock', 'on_the_way_qty', 'factory_allocated_qty', 'shortage_qty', 'reallocation_qty',
  'supplier_id', 'supplier_name', 'supplier_sku', 'unit_cost', 'estimated_amount', 'currency',
  'need_reason', 'calculation_method', 'line_status', 'linked_purchase_order_line_id',
  'related_entity_type', 'related_entity_id', 'note', 'created_at', 'updated_at'
];

var PURCHASE_ORDERS_HEADERS_ = [
  'purchase_order_id', 'purchase_order_no', 'po_version', 'parent_purchase_order_id',
  'request_order_id', 'company', 'supplier_id', 'supplier_name', 'factory_id', 'warehouse_id',
  'status', 'currency',
  'total_sku', 'total_qty', 'total_amount', 'expected_ready_date', 'confirmed_ready_date',
  'issued_by', 'issued_at', 'confirmed_by', 'confirmed_at',
  'cancelled_by', 'cancelled_at', 'completed_by', 'completed_at',
  'closure_reason', 'closed_by', 'closed_at',
  'note', 'created_by', 'created_at', 'updated_by', 'updated_at'
];

var PURCHASE_ORDER_LINES_HEADERS_ = [
  'purchase_order_line_id', 'purchase_order_id', 'request_order_line_id',
  'sku', 'product_name', 'series', 'ordered_qty', 'completed_qty', 'shipped_qty', 'remaining_qty',
  'units_per_carton', 'carton_qty', 'supplier_id', 'supplier_sku', 'unit_cost', 'line_amount', 'currency',
  'related_shipment_id', 'note', 'created_at', 'updated_at'
];

// ---- helpers ------------------------------------------------------

function procurementTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function procurementToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function procurementNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

/** Get (or create with the documented header row) a procurement tab in the operation DB. */
function procurementEnsureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  // Ensure any newer columns exist on an already-created tab (uses shared global helper).
  sheetEnsureColumns_(sh, headers);
  return sh;
}

/** Append a row to a sheet using its existing header row (writes only known columns). */
function procurementAppendByHeader_(sheet, obj) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  var row = new Array(headers.length).fill('');
  for (var i = 0; i < headers.length; i++) {
    if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) {
      row[i] = obj[headers[i]];
    }
  }
  sheet.appendRow(row);
}

/** sku -> units_per_carton from sku_details (0 when unavailable). */
function procurementUpcMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName('sku_details');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var skuCol = headers.indexOf('sku');
  var upcCol = headers.indexOf('units_per_carton');
  if (skuCol === -1) return map;
  for (var i = 1; i < data.length; i++) {
    var s = String(data[i][skuCol] || '').trim();
    if (s) map[s] = upcCol !== -1 ? (parseFloat(data[i][upcCol]) || 0) : 0;
  }
  return map;
}

/** sku -> { product_name, series } from sku_details (blank when unavailable). */
function procurementSkuInfoMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName('sku_details');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var cSku = h.indexOf('sku'), cName = h.indexOf('product_name'), cSeries = h.indexOf('series');
  if (cSku === -1) return map;
  for (var i = 1; i < data.length; i++) {
    var s = String(data[i][cSku] || '').trim();
    if (!s) continue;
    map[s] = {
      product_name: cName === -1 ? '' : String(data[i][cName] || '').trim(),
      series: cSeries === -1 ? '' : String(data[i][cSeries] || '').trim()
    };
  }
  return map;
}

/** Find the sheet row (1-indexed) whose id column matches; returns { row, vals, headers, col } or null. */
function procurementFindRow_(sheet, idColName, idValue) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var idCol = headers.indexOf(idColName);
  if (idCol === -1) return null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === idValue) {
      return {
        row: i + 1,
        vals: data[i],
        headers: headers,
        col: function (n) { return headers.indexOf(n); }
      };
    }
  }
  return null;
}

// ---- createRequestOrderDraft --------------------------------------

/**
 * Create ONE Request Order Draft (Procurement Planning Draft) + its lines. Body:
 *   { company?, supplier_id?, supplier_name?, factory_id?, warehouse_id?, source?, currency?,
 *     note?, created_by?, source_ref_type?, source_ref_id?,
 *     lines: [ { sku, product_name?, series?, requested_qty, units_per_carton?, supplier_id?,
 *                supplier_name?, supplier_sku?, unit_cost?, currency?, need_reason?,
 *                related_entity_type?, related_entity_id? } ] }
 * status=draft, request_order_version=1, parent=self. approved_qty defaults to requested_qty.
 */
function handleCreateRequestOrderDraft_(body) {
  var lines = (body && body.lines) || [];
  if (!lines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roSheet = procurementEnsureSheet_(ss, 'request_orders', REQUEST_ORDERS_HEADERS_);
  var rolSheet = procurementEnsureSheet_(ss, 'request_order_lines', REQUEST_ORDER_LINES_HEADERS_);
  var upcMap = procurementUpcMap_(ss);
  var infoMap = procurementSkuInfoMap_(ss);

  var now = procurementTimestamp_();
  var today = procurementToday_();
  var createdBy = String((body && body.created_by) || 'procurement').trim();
  var source = String((body && body.source) || 'manual').trim();
  var currency = String((body && body.currency) || '').trim();
  var supplierId = String((body && body.supplier_id) || '').trim();
  var supplierName = String((body && body.supplier_name) || '').trim();

  var requestOrderId = 'RO-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  var requestOrderNo = 'REQ-' + today.replace(/-/g, '') + '-' + Utilities.getUuid().substring(0, 4).toUpperCase();

  var totalQty = 0, totalCartons = 0, estimatedAmount = 0, lineCount = 0;

  for (var j = 0; j < lines.length; j++) {
    var l = lines[j] || {};
    var sku = String(l.sku || '').trim();
    if (!sku) continue;
    var requested = procurementNum_(l.requested_qty);
    var upc = procurementNum_(l.units_per_carton) || upcMap[sku] || 0;
    var approved = requested; // draft: approved defaults to requested
    var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
    var hasUnitCost = (l.unit_cost !== '' && l.unit_cost != null && !isNaN(parseFloat(l.unit_cost)));
    var unitCost = hasUnitCost ? parseFloat(l.unit_cost) : '';
    var lineAmount = hasUnitCost ? Math.round(approved * unitCost * 100) / 100 : '';
    var info = infoMap[sku] || { product_name: '', series: '' };

    function snap(v) { return (v !== '' && v != null && !isNaN(parseFloat(v))) ? procurementNum_(v) : ''; }
    procurementAppendByHeader_(rolSheet, {
      request_order_line_id: 'ROL-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
      request_order_id: requestOrderId,
      sku: sku,
      product_name: String(l.product_name || info.product_name || '').trim(),
      series: String(l.series || info.series || '').trim(),
      company: String(l.company || '').trim(),                               // site owner (KM/ResUS/ResTW …)
      request_bucket: String(l.request_bucket || '').trim(),                 // T1 / T2 / T3 preserved
      request_month: String(l.request_month || '').trim(),
      inspection_date: String(l.inspection_date || '').trim(),
      expected_ready_date: String(l.expected_ready_date || '').trim(),
      expected_ship_date: String(l.expected_ship_date || '').trim(),
      requested_qty: requested,
      approved_qty: approved,
      final_order_qty: '',                                                   // locked at submit/approve
      units_per_carton: upc,
      carton_qty: carton,
      forecast_qty: snap(l.forecast_qty),                                    // ← draft fc_qty_snapshot
      current_stock: snap(l.current_stock),                                  // ← draft site/current stock snapshot
      on_the_way_qty: snap(l.on_the_way_qty),                                // future shipment overview (blank now)
      factory_allocated_qty: snap(l.factory_allocated_qty),                  // allocation engine (blank now)
      shortage_qty: snap(l.shortage_qty),                                    // calc result (blank now — no formula)
      reallocation_qty: snap(l.reallocation_qty),                            // cross-site suggestion (blank now)
      supplier_id: String(l.supplier_id || supplierId || '').trim(),
      supplier_name: String(l.supplier_name || supplierName || '').trim(),
      supplier_sku: String(l.supplier_sku || '').trim(),
      unit_cost: unitCost,
      estimated_amount: lineAmount,
      currency: String(l.currency || currency || '').trim(),
      need_reason: String(l.need_reason || '').trim(),
      calculation_method: String(l.calculation_method || 'manual_order_allocation').trim(),
      line_status: String(l.line_status || 'draft').trim(),
      linked_purchase_order_line_id: '',                                     // blank until PO created
      related_entity_type: String(l.related_entity_type || '').trim(),
      related_entity_id: String(l.related_entity_id || '').trim(),
      note: String(l.note || '').trim(),
      created_at: now,
      updated_at: now
    });
    totalQty += approved;
    totalCartons += carton;
    if (hasUnitCost) estimatedAmount += (approved * unitCost);
    lineCount++;
  }

  if (!lineCount) return jsonResponse_({ success: false, error: 'No valid lines (each line needs a sku)' });

  procurementAppendByHeader_(roSheet, {
    request_order_id: requestOrderId,
    request_order_no: requestOrderNo,
    request_order_version: 1,
    parent_request_order_id: requestOrderId, // MVP: parent = self
    company: String((body && body.company) || '').trim(),
    supplier_id: supplierId,
    supplier_name: supplierName,
    factory_id: String((body && body.factory_id) || '').trim(),
    warehouse_id: String((body && body.warehouse_id) || '').trim(),
    status: 'draft',
    total_sku: lineCount,
    total_qty: totalQty,
    total_cartons: totalCartons,
    estimated_amount: (estimatedAmount > 0 ? Math.round(estimatedAmount * 100) / 100 : ''),
    currency: currency,
    source: source,
    source_ref_type: String((body && body.source_ref_type) || '').trim(),
    source_ref_id: String((body && body.source_ref_id) || '').trim(),
    created_by: createdBy,
    created_at: now,
    note: String((body && body.note) || '').trim(),
    updated_by: createdBy,
    updated_at: now
  });

  return jsonResponse_({ success: true, data: { request_order_id: requestOrderId, request_order_no: requestOrderNo, line_count: lineCount, total_qty: totalQty } });
}

// ---- updateRequestOrderStatus -------------------------------------

/**
 * Request Order status transitions (header-based lookup by request_order_id):
 *   submit  : draft -> pending_approval (if previously rejected: version +1, clear rejected_*)
 *   approve : pending_approval -> approved
 *   reject  : pending_approval -> draft (rejected_* recorded; reason appended to note; reason required)
 *   cancel  : draft|pending_approval -> cancelled (SOFT — row + lines preserved)
 *   done    : approved|converted_to_po -> sets completed_by/at (visual hide; status unchanged; no delete)
 * Actor fields are placeholder identities (MVP) — never block the flow.
 */
function handleUpdateRequestOrderStatus_(body) {
  var roId = String((body && body.request_order_id) || '').trim();
  var transition = String((body && body.transition) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  var reason = String((body && body.rejected_reason) || '').trim();
  if (!roId) return jsonResponse_({ success: false, error: 'Missing request_order_id' });
  var VALID = ['submit', 'approve', 'reject', 'cancel', 'done'];
  if (VALID.indexOf(transition) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid transition. Valid: ' + VALID.join(', ') });
  }
  if (transition === 'reject' && !reason) {
    return jsonResponse_({ success: false, error: 'rejected_reason is required to reject' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('request_orders');
  if (!sheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });
  sheetEnsureColumns_(sheet, ['completed_by', 'completed_at', 'updated_by', 'updated_at']);

  var ref = procurementFindRow_(sheet, 'request_order_id', roId);
  if (!ref) return jsonResponse_({ success: false, error: 'Request order not found: ' + roId });
  var col = ref.col;
  var curStatus = col('status') !== -1 ? String(ref.vals[col('status')]).trim() : '';
  var now = procurementTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(ref.row, c + 1).setValue(value); }

  if (transition === 'submit') {
    if (curStatus !== 'draft') return jsonResponse_({ success: false, error: 'Only a Draft request can be submitted (current: ' + curStatus + ')' });
    var wasRejected = col('rejected_at') !== -1 && String(ref.vals[col('rejected_at')]).trim() !== '';
    if (wasRejected) {
      var curVer = col('request_order_version') !== -1 ? (parseFloat(ref.vals[col('request_order_version')]) || 1) : 1;
      setCell('request_order_version', curVer + 1);
      setCell('rejected_by', ''); setCell('rejected_at', ''); setCell('rejected_reason', '');
    }
    setCell('status', 'pending_approval');
    setCell('submitted_by', actor);
    setCell('submitted_at', now);
  } else if (transition === 'approve') {
    if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval request can be approved (current: ' + curStatus + ')' });
    setCell('status', 'approved');
    setCell('approved_by', actor);
    setCell('approved_at', now);
  } else if (transition === 'reject') {
    if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval request can be rejected (current: ' + curStatus + ')' });
    var verForNote = col('request_order_version') !== -1 ? (parseFloat(ref.vals[col('request_order_version')]) || 1) : 1;
    setCell('rejected_by', actor);
    setCell('rejected_at', now);
    setCell('rejected_reason', reason);
    if (col('note') !== -1) {
      var existingNote = String(ref.vals[col('note')] || '').trim();
      var appended = '[REJECTED v' + verForNote + ' @' + now + '] ' + reason;
      setCell('note', existingNote ? (existingNote + '\n' + appended) : appended);
    }
    setCell('status', 'draft');
  } else if (transition === 'cancel') {
    if (curStatus !== 'draft' && curStatus !== 'pending_approval') {
      return jsonResponse_({ success: false, error: 'Only a Draft or Pending Approval request can be cancelled (current: ' + curStatus + ')' });
    }
    setCell('status', 'cancelled');
    setCell('cancelled_by', actor);
    setCell('cancelled_at', now);
  } else if (transition === 'done') {
    if (curStatus !== 'approved' && curStatus !== 'converted_to_po') {
      return jsonResponse_({ success: false, error: 'Only an Approved / Converted request can be marked Done (current: ' + curStatus + ')' });
    }
    setCell('completed_by', actor);
    setCell('completed_at', now);
  }

  // Propagate line_status + final_order_qty (locked = approved_qty on submit/approve; cleared on reject).
  if (transition === 'submit') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'submitted', lockFinal: true });
  else if (transition === 'approve') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'approved', lockFinal: true });
  else if (transition === 'reject') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'draft', clearFinal: true });
  else if (transition === 'cancel') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'cancelled' });

  setCell('updated_by', actor);
  setCell('updated_at', now);

  return jsonResponse_({ success: true, data: { request_order_id: roId, transition: transition } });
}

/** Set line_status / final_order_qty on all request_order_lines of a request. opts:
 *   { lineStatus?, lockFinal? (final=approved_qty), clearFinal? }. Missing columns are skipped. */
function procurementUpdateRequestLines_(ss, roId, opts) {
  var sh = ss.getSheetByName('request_order_lines');
  if (!sh) return;
  sheetEnsureColumns_(sh, ['line_status', 'final_order_qty', 'updated_at']);
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return;
  var h = data[0].map(function (x) { return String(x).trim(); });
  var roCol = h.indexOf('request_order_id'), lsCol = h.indexOf('line_status'),
      apCol = h.indexOf('approved_qty'), foCol = h.indexOf('final_order_qty'), upCol = h.indexOf('updated_at');
  if (roCol === -1) return;
  var now = procurementTimestamp_();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][roCol]).trim() !== roId) continue;
    if (opts.lineStatus && lsCol !== -1) sh.getRange(i + 1, lsCol + 1).setValue(opts.lineStatus);
    if (opts.lockFinal && foCol !== -1) sh.getRange(i + 1, foCol + 1).setValue(apCol !== -1 ? (parseFloat(data[i][apCol]) || 0) : '');
    if (opts.clearFinal && foCol !== -1) sh.getRange(i + 1, foCol + 1).setValue('');
    if (upCol !== -1) sh.getRange(i + 1, upCol + 1).setValue(now);
  }
}

// ---- updateRequestOrderLineQty ------------------------------------

/**
 * Edit approved_qty on request_order_lines (Draft only). Recomputes carton_qty + estimated_amount.
 * Body: { lines: [ { request_order_line_id, approved_qty } ] }. Lines whose parent request is not
 * Draft are skipped (reported). Recomputes the parent header totals afterward.
 */
function handleUpdateRequestOrderLineQty_(body) {
  var reqLines = (body && body.lines) || [];
  if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('request_order_lines');
  var roSheet = ss.getSheetByName('request_orders');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found' });
  if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });

  // request_order_id -> status
  var roData = roSheet.getDataRange().getValues();
  var roHeaders = roData[0].map(function (h) { return String(h).trim(); });
  var roIdCol = roHeaders.indexOf('request_order_id');
  var roStatusCol = roHeaders.indexOf('status');
  var statusById = {};
  for (var p = 1; p < roData.length; p++) {
    if (roIdCol !== -1) statusById[String(roData[p][roIdCol]).trim()] = roStatusCol !== -1 ? String(roData[p][roStatusCol]).trim() : '';
  }

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'request_order_lines is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('request_order_line_id');
  var roLineIdCol = col('request_order_id');
  var approvedCol = col('approved_qty');
  var cartonCol = col('carton_qty');
  var upcCol = col('units_per_carton');
  var unitCostCol = col('unit_cost');
  var estCol = col('estimated_amount');
  var updatedCol = col('updated_at');
  var inspCol = col('inspection_date');
  var readyCol = col('expected_ready_date');
  var shipCol = col('expected_ship_date');
  var noteCol = col('note');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'request_order_line_id column not found' });

  var rowById = {};
  for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };

  var now = procurementTimestamp_();
  var updated = 0, skipped = 0;
  var affectedRoIds = {};
  for (var r = 0; r < reqLines.length; r++) {
    var rq = reqLines[r] || {};
    var lineId = String(rq.request_order_line_id || '').trim();
    if (!lineId || !rowById[lineId]) { skipped++; continue; }
    var ent = rowById[lineId];
    var parentId = roLineIdCol !== -1 ? String(ent.vals[roLineIdCol]).trim() : '';
    if (statusById[parentId] !== 'draft') { skipped++; continue; }
    // approved_qty is optional now (a line may be updated only for schedule/note).
    if (rq.approved_qty !== undefined) {
      var approved = parseFloat(rq.approved_qty); if (isNaN(approved) || approved < 0) approved = 0;
      var upc = upcCol !== -1 ? (parseFloat(ent.vals[upcCol]) || 0) : 0;
      var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
      if (approvedCol !== -1) lineSheet.getRange(ent.row, approvedCol + 1).setValue(approved);
      if (cartonCol !== -1) lineSheet.getRange(ent.row, cartonCol + 1).setValue(carton);
      var uc = unitCostCol !== -1 ? parseFloat(ent.vals[unitCostCol]) : NaN;
      if (estCol !== -1 && !isNaN(uc)) lineSheet.getRange(ent.row, estCol + 1).setValue(Math.round(approved * uc * 100) / 100);
    }
    // Optional decision-layer schedule fields + note (per tier → applied to each tier line).
    if (rq.inspection_date !== undefined && inspCol !== -1) lineSheet.getRange(ent.row, inspCol + 1).setValue(String(rq.inspection_date || '').trim());
    if (rq.expected_ready_date !== undefined && readyCol !== -1) lineSheet.getRange(ent.row, readyCol + 1).setValue(String(rq.expected_ready_date || '').trim());
    if (rq.expected_ship_date !== undefined && shipCol !== -1) lineSheet.getRange(ent.row, shipCol + 1).setValue(String(rq.expected_ship_date || '').trim());
    if (rq.note !== undefined && noteCol !== -1) lineSheet.getRange(ent.row, noteCol + 1).setValue(String(rq.note || '').trim());
    if (updatedCol !== -1) lineSheet.getRange(ent.row, updatedCol + 1).setValue(now);
    if (parentId) affectedRoIds[parentId] = true;
    updated++;
  }

  // Recompute header totals for affected requests.
  Object.keys(affectedRoIds).forEach(function (id) { procurementRecalcRequestTotals_(ss, id); });

  return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped } });
}

/** Recompute request_orders totals (total_sku / total_qty / total_cartons / estimated_amount) from its lines. */
function procurementRecalcRequestTotals_(ss, requestOrderId) {
  var lineSheet = ss.getSheetByName('request_order_lines');
  var roSheet = ss.getSheetByName('request_orders');
  if (!lineSheet || !roSheet) return;
  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return;
  var h = data[0].map(function (x) { return String(x).trim(); });
  var roIdCol = h.indexOf('request_order_id'), aCol = h.indexOf('approved_qty'), cCol = h.indexOf('carton_qty'), ucCol = h.indexOf('unit_cost'), lsCol = h.indexOf('line_status');
  if (roIdCol === -1) return;
  var totalSku = 0, totalQty = 0, totalCartons = 0, est = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][roIdCol]).trim() !== requestOrderId) continue;
    if (lsCol !== -1 && String(data[i][lsCol]).trim() === 'cancelled') continue;   // exclude cancelled lines
    totalSku++;
    var q = aCol !== -1 ? (parseFloat(data[i][aCol]) || 0) : 0;
    totalQty += q;
    totalCartons += cCol !== -1 ? (parseFloat(data[i][cCol]) || 0) : 0;
    var uc = ucCol !== -1 ? parseFloat(data[i][ucCol]) : NaN;
    if (!isNaN(uc)) est += q * uc;
  }
  var ref = procurementFindRow_(roSheet, 'request_order_id', requestOrderId);
  if (!ref) return;
  function setCell(name, value) { var c = ref.col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(value); }
  setCell('total_sku', totalSku);
  setCell('total_qty', totalQty);
  setCell('total_cartons', totalCartons);
  setCell('estimated_amount', est > 0 ? Math.round(est * 100) / 100 : '');
}

// ---- cancelRequestOrderTier ---------------------------------------

/**
 * Cancel a tier/block of a Request Order Draft by STATUS (soft — never hard-deletes). Body:
 *   { request_order_line_ids: [ ... ], actor? }.
 * Sets line_status = 'cancelled' + updated_at on each line (Draft parent only). If, afterwards, EVERY
 * line of a parent request is cancelled, the request header transitions status = 'cancelled'
 * (+ cancelled_by/at). Header totals are recomputed (cancelled lines excluded). Rows are preserved.
 * NOTE: request_order_line_sources is spec-only (not implemented) — its status is not updated here;
 * documented as a follow-up.
 */
function handleCancelRequestOrderTier_(body) {
  var ids = (body && body.request_order_line_ids) || [];
  if (!ids.length) return jsonResponse_({ success: false, error: 'request_order_line_ids required' });
  var actor = String((body && body.actor) || 'operation-system').trim();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('request_order_lines');
  var roSheet = ss.getSheetByName('request_orders');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found' });
  if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });
  sheetEnsureColumns_(lineSheet, ['line_status', 'updated_at']);

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'request_order_lines is empty' });
  var h = data[0].map(function (x) { return String(x).trim(); });
  var idCol = h.indexOf('request_order_line_id'), roCol = h.indexOf('request_order_id'),
      lsCol = h.indexOf('line_status'), upCol = h.indexOf('updated_at');
  if (idCol === -1 || roCol === -1) return jsonResponse_({ success: false, error: 'required columns not found' });

  // request_order_id -> status (Draft-only cancellation).
  var roData = roSheet.getDataRange().getValues();
  var rh = roData[0].map(function (x) { return String(x).trim(); });
  var rIdCol = rh.indexOf('request_order_id'), rStatusCol = rh.indexOf('status');
  var roStatus = {};
  for (var p = 1; p < roData.length; p++) { if (rIdCol !== -1) roStatus[String(roData[p][rIdCol]).trim()] = rStatusCol !== -1 ? String(roData[p][rStatusCol]).trim() : ''; }

  var idSet = {}; ids.forEach(function (x) { idSet[String(x).trim()] = 1; });
  var now = procurementTimestamp_();
  var cancelled = 0, skipped = 0;
  var affectedRoIds = {};
  for (var i = 1; i < data.length; i++) {
    var lid = String(data[i][idCol]).trim();
    if (!idSet[lid]) continue;
    var parent = String(data[i][roCol]).trim();
    if (roStatus[parent] !== 'draft') { skipped++; continue; }   // only Draft lines cancellable here
    if (lsCol !== -1) lineSheet.getRange(i + 1, lsCol + 1).setValue('cancelled');
    if (upCol !== -1) lineSheet.getRange(i + 1, upCol + 1).setValue(now);
    affectedRoIds[parent] = true;
    cancelled++;
  }

  // If a parent request now has NO active (non-cancelled) line, cancel the whole request.
  var fresh = lineSheet.getDataRange().getValues();
  var fh = fresh[0].map(function (x) { return String(x).trim(); });
  var fRo = fh.indexOf('request_order_id'), fLs = fh.indexOf('line_status');
  var fullyCancelled = [];
  Object.keys(affectedRoIds).forEach(function (roId) {
    var total = 0, active = 0;
    for (var i = 1; i < fresh.length; i++) {
      if (String(fresh[i][fRo]).trim() !== roId) continue;
      total++;
      if (!(fLs !== -1 && String(fresh[i][fLs]).trim() === 'cancelled')) active++;
    }
    if (total > 0 && active === 0) {
      var ref = procurementFindRow_(roSheet, 'request_order_id', roId);
      if (ref) {
        function setRo(name, val) { var c = ref.col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(val); }
        setRo('status', 'cancelled');
        setRo('cancelled_by', actor);
        setRo('cancelled_at', now);
        setRo('updated_by', actor);
        setRo('updated_at', now);
        fullyCancelled.push(roId);
      }
    } else {
      procurementRecalcRequestTotals_(ss, roId);   // recompute totals excluding the cancelled lines
    }
  });

  return jsonResponse_({ success: true, data: { cancelled_lines: cancelled, skipped: skipped, cancelled_requests: fullyCancelled } });
}

// ---- createPurchaseOrderFromRequest -------------------------------

/**
 * Convert an APPROVED Request Order into a Purchase Order (Procurement Commitment). Body:
 *   { request_order_id, actor? }.
 * Creates purchase_orders (status=draft) + purchase_order_lines (copied from request_order_lines:
 *   approved_qty -> ordered_qty, unit_cost, line_amount, carton_qty, ...). Sets the SOURCE request's
 *   status = converted_to_po (the request recording its own conversion — the ONLY write back, per
 *   Immutable Flow). Idempotency: a request already converted_to_po is rejected.
 */
function handleCreatePurchaseOrderFromRequest_(body) {
  var roId = String((body && body.request_order_id) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  if (!roId) return jsonResponse_({ success: false, error: 'Missing request_order_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roSheet = ss.getSheetByName('request_orders');
  var rolSheet = ss.getSheetByName('request_order_lines');
  if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });
  if (!rolSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found' });

  var ref = procurementFindRow_(roSheet, 'request_order_id', roId);
  if (!ref) return jsonResponse_({ success: false, error: 'Request order not found: ' + roId });
  var col = ref.col;
  var curStatus = col('status') !== -1 ? String(ref.vals[col('status')]).trim() : '';
  if (curStatus === 'converted_to_po') return jsonResponse_({ success: false, error: 'Request order already converted to a Purchase Order' });
  if (curStatus !== 'approved') return jsonResponse_({ success: false, error: 'Only an Approved request can be converted (current: ' + curStatus + ')' });

  var poSheet = procurementEnsureSheet_(ss, 'purchase_orders', PURCHASE_ORDERS_HEADERS_);
  var polSheet = procurementEnsureSheet_(ss, 'purchase_order_lines', PURCHASE_ORDER_LINES_HEADERS_);

  var now = procurementTimestamp_();
  var today = procurementToday_();
  var purchaseOrderId = 'PO-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  var purchaseOrderNo = 'PO-' + today.replace(/-/g, '') + '-' + Utilities.getUuid().substring(0, 4).toUpperCase();

  function roVal(name) { var c = col(name); return c !== -1 ? ref.vals[c] : ''; }
  var company = String(roVal('company') || '').trim();
  var supplierId = String(roVal('supplier_id') || '').trim();
  var supplierName = String(roVal('supplier_name') || '').trim();
  var factoryId = String(roVal('factory_id') || '').trim();       // copied for the PO List Factory column
  var warehouseId = String(roVal('warehouse_id') || '').trim();
  var currency = String(roVal('currency') || '').trim();

  // Copy the request lines into PO lines.
  var data = rolSheet.getDataRange().getValues();
  var lh = data[0].map(function (x) { return String(x).trim(); });
  function lc(n) { return lh.indexOf(n); }
  var totalQty = 0, totalAmount = 0, lineCount = 0;
  for (var i = 1; i < data.length; i++) {
    if (lc('request_order_id') === -1 || String(data[i][lc('request_order_id')]).trim() !== roId) continue;
    var sku = lc('sku') !== -1 ? String(data[i][lc('sku')]).trim() : '';
    if (!sku) continue;
    var orderedQty = lc('approved_qty') !== -1 ? (parseFloat(data[i][lc('approved_qty')]) || 0) : 0;
    var upc = lc('units_per_carton') !== -1 ? (parseFloat(data[i][lc('units_per_carton')]) || 0) : 0;
    var carton = lc('carton_qty') !== -1 ? (parseFloat(data[i][lc('carton_qty')]) || 0) : ((upc > 0) ? Math.ceil(orderedQty / upc) : 0);
    var ucRaw = lc('unit_cost') !== -1 ? data[i][lc('unit_cost')] : '';
    var hasUc = (ucRaw !== '' && ucRaw != null && !isNaN(parseFloat(ucRaw)));
    var unitCost = hasUc ? parseFloat(ucRaw) : '';
    var lineAmount = hasUc ? Math.round(orderedQty * unitCost * 100) / 100 : '';

    procurementAppendByHeader_(polSheet, {
      purchase_order_line_id: 'POL-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
      purchase_order_id: purchaseOrderId,
      request_order_line_id: lc('request_order_line_id') !== -1 ? String(data[i][lc('request_order_line_id')]).trim() : '',
      sku: sku,
      product_name: lc('product_name') !== -1 ? String(data[i][lc('product_name')]).trim() : '',
      series: lc('series') !== -1 ? String(data[i][lc('series')]).trim() : '',
      ordered_qty: orderedQty,
      completed_qty: 0,
      shipped_qty: 0,
      remaining_qty: orderedQty,
      units_per_carton: upc,
      carton_qty: carton,
      supplier_id: lc('supplier_id') !== -1 ? String(data[i][lc('supplier_id')]).trim() : supplierId,
      supplier_sku: lc('supplier_sku') !== -1 ? String(data[i][lc('supplier_sku')]).trim() : '',
      unit_cost: unitCost,
      line_amount: lineAmount,
      currency: lc('currency') !== -1 ? String(data[i][lc('currency')]).trim() : currency,
      related_shipment_id: '',
      note: '',
      created_at: now,
      updated_at: now
    });
    totalQty += orderedQty;
    if (hasUc) totalAmount += orderedQty * unitCost;
    lineCount++;
  }

  if (!lineCount) return jsonResponse_({ success: false, error: 'Request order has no lines to convert' });

  procurementAppendByHeader_(poSheet, {
    purchase_order_id: purchaseOrderId,
    purchase_order_no: purchaseOrderNo,
    po_version: 1,
    parent_purchase_order_id: purchaseOrderId,
    request_order_id: roId,
    company: company,
    supplier_id: supplierId,
    supplier_name: supplierName,
    factory_id: factoryId,
    warehouse_id: warehouseId,
    status: 'draft',
    currency: currency,
    total_sku: lineCount,
    total_qty: totalQty,
    total_amount: (totalAmount > 0 ? Math.round(totalAmount * 100) / 100 : ''),
    note: '',
    created_by: actor,
    created_at: now,
    updated_by: actor,
    updated_at: now
  });

  // The request records its OWN conversion (the only write back to request_orders).
  sheetEnsureColumns_(roSheet, ['updated_by', 'updated_at']);
  function setRo(name, value) { var c = col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(value); }
  setRo('status', 'converted_to_po');
  setRo('updated_by', actor);
  setRo('updated_at', now);

  return jsonResponse_({ success: true, data: { purchase_order_id: purchaseOrderId, purchase_order_no: purchaseOrderNo, request_order_id: roId, line_count: lineCount, total_qty: totalQty } });
}

// ---- updatePurchaseOrderStatus ------------------------------------

/**
 * Purchase Order status transitions (header-based lookup by purchase_order_id):
 *   issue           : draft -> issued (issued_by/at)
 *   confirm         : issued -> confirmed (confirmed_by/at; optional confirmed_ready_date)
 *   start_production: confirmed -> in_production
 *   ready_to_ship   : in_production -> ready_to_ship
 *   complete        : ready_to_ship -> completed (completed_by/at)
 *   cancel          : any non-completed -> cancelled
 * Optional fields accepted on any transition: expected_ready_date, confirmed_ready_date, note.
 */
function handleUpdatePurchaseOrderStatus_(body) {
  var poId = String((body && body.purchase_order_id) || '').trim();
  var transition = String((body && body.transition) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  if (!poId) return jsonResponse_({ success: false, error: 'Missing purchase_order_id' });
  var VALID = ['issue', 'confirm', 'start_production', 'ready_to_ship', 'complete', 'cancel'];
  if (VALID.indexOf(transition) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid transition. Valid: ' + VALID.join(', ') });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('purchase_orders');
  if (!sheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found' });

  var ref = procurementFindRow_(sheet, 'purchase_order_id', poId);
  if (!ref) return jsonResponse_({ success: false, error: 'Purchase order not found: ' + poId });
  var col = ref.col;
  var curStatus = col('status') !== -1 ? String(ref.vals[col('status')]).trim() : '';
  var now = procurementTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(ref.row, c + 1).setValue(value); }

  var EXPECTED_PREV = {
    issue: 'draft', confirm: 'issued', start_production: 'confirmed',
    ready_to_ship: 'in_production', complete: 'ready_to_ship'
  };
  if (transition === 'cancel') {
    if (curStatus === 'completed' || curStatus === 'cancelled') {
      return jsonResponse_({ success: false, error: 'A completed / cancelled PO cannot be cancelled (current: ' + curStatus + ')' });
    }
    setCell('status', 'cancelled');
    setCell('cancelled_by', actor);
    setCell('cancelled_at', now);
  } else {
    if (curStatus !== EXPECTED_PREV[transition]) {
      return jsonResponse_({ success: false, error: 'Transition "' + transition + '" requires status "' + EXPECTED_PREV[transition] + '" (current: ' + curStatus + ')' });
    }
    if (transition === 'issue') { setCell('status', 'issued'); setCell('issued_by', actor); setCell('issued_at', now); }
    else if (transition === 'confirm') { setCell('status', 'confirmed'); setCell('confirmed_by', actor); setCell('confirmed_at', now); }
    else if (transition === 'start_production') { setCell('status', 'in_production'); }
    else if (transition === 'ready_to_ship') { setCell('status', 'ready_to_ship'); }
    else if (transition === 'complete') { setCell('status', 'completed'); setCell('completed_by', actor); setCell('completed_at', now); }
  }

  // Optional field updates (accepted on any transition).
  if (body.expected_ready_date !== undefined) setCell('expected_ready_date', String(body.expected_ready_date || '').trim());
  if (body.confirmed_ready_date !== undefined) setCell('confirmed_ready_date', String(body.confirmed_ready_date || '').trim());
  if (body.note !== undefined && col('note') !== -1) {
    var existing = String(ref.vals[col('note')] || '').trim();
    var appended = '[' + transition + ' @' + now + ' by ' + actor + '] ' + String(body.note || '').trim();
    setCell('note', existing ? (existing + '\n' + appended) : appended);
  }

  setCell('updated_by', actor);
  setCell('updated_at', now);

  return jsonResponse_({ success: true, data: { purchase_order_id: poId, transition: transition } });
}

// ---- updatePurchaseOrderLine --------------------------------------

/**
 * Edit purchase_order_lines fields (Draft PO only). Body:
 *   { lines: [ { purchase_order_line_id, ordered_qty?, unit_cost?, note? } ] }.
 * Recomputes carton_qty (from units_per_carton), line_amount (ordered × unit_cost),
 * remaining_qty (ordered − shipped). Lines whose parent PO is not Draft are skipped (reported).
 * Recomputes the parent PO header totals afterward.
 */
function handleUpdatePurchaseOrderLine_(body) {
  var reqLines = (body && body.lines) || [];
  if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('purchase_order_lines');
  var poSheet = ss.getSheetByName('purchase_orders');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'purchase_order_lines sheet not found' });
  if (!poSheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found' });

  var poData = poSheet.getDataRange().getValues();
  var poHeaders = poData[0].map(function (h) { return String(h).trim(); });
  var poIdCol = poHeaders.indexOf('purchase_order_id');
  var poStatusCol = poHeaders.indexOf('status');
  var statusById = {};
  for (var p = 1; p < poData.length; p++) {
    if (poIdCol !== -1) statusById[String(poData[p][poIdCol]).trim()] = poStatusCol !== -1 ? String(poData[p][poStatusCol]).trim() : '';
  }

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'purchase_order_lines is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('purchase_order_line_id');
  var poLineIdCol = col('purchase_order_id');
  var orderedCol = col('ordered_qty');
  var shippedCol = col('shipped_qty');
  var remainingCol = col('remaining_qty');
  var cartonCol = col('carton_qty');
  var upcCol = col('units_per_carton');
  var unitCostCol = col('unit_cost');
  var lineAmountCol = col('line_amount');
  var noteCol = col('note');
  var updatedCol = col('updated_at');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'purchase_order_line_id column not found' });

  var rowById = {};
  for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };

  var now = procurementTimestamp_();
  var updated = 0, skipped = 0;
  var affectedPoIds = {};
  for (var r = 0; r < reqLines.length; r++) {
    var rq = reqLines[r] || {};
    var lineId = String(rq.purchase_order_line_id || '').trim();
    if (!lineId || !rowById[lineId]) { skipped++; continue; }
    var ent = rowById[lineId];
    var parentId = poLineIdCol !== -1 ? String(ent.vals[poLineIdCol]).trim() : '';
    if (statusById[parentId] !== 'draft') { skipped++; continue; } // editable only in Draft PO

    var ordered = orderedCol !== -1 ? (parseFloat(ent.vals[orderedCol]) || 0) : 0;
    if (rq.ordered_qty !== undefined) {
      ordered = parseFloat(rq.ordered_qty); if (isNaN(ordered) || ordered < 0) ordered = 0;
      if (orderedCol !== -1) lineSheet.getRange(ent.row, orderedCol + 1).setValue(ordered);
      var upc = upcCol !== -1 ? (parseFloat(ent.vals[upcCol]) || 0) : 0;
      var carton = (upc > 0) ? Math.ceil(ordered / upc) : 0;
      if (cartonCol !== -1) lineSheet.getRange(ent.row, cartonCol + 1).setValue(carton);
      var shipped = shippedCol !== -1 ? (parseFloat(ent.vals[shippedCol]) || 0) : 0;
      if (remainingCol !== -1) lineSheet.getRange(ent.row, remainingCol + 1).setValue(ordered - shipped);
    }
    var unitCost = unitCostCol !== -1 ? parseFloat(ent.vals[unitCostCol]) : NaN;
    if (rq.unit_cost !== undefined) {
      var hasUc = (rq.unit_cost !== '' && rq.unit_cost != null && !isNaN(parseFloat(rq.unit_cost)));
      unitCost = hasUc ? parseFloat(rq.unit_cost) : NaN;
      if (unitCostCol !== -1) lineSheet.getRange(ent.row, unitCostCol + 1).setValue(hasUc ? unitCost : '');
    }
    if (lineAmountCol !== -1) {
      lineSheet.getRange(ent.row, lineAmountCol + 1).setValue(!isNaN(unitCost) ? Math.round(ordered * unitCost * 100) / 100 : '');
    }
    if (rq.note !== undefined && noteCol !== -1) lineSheet.getRange(ent.row, noteCol + 1).setValue(String(rq.note || '').trim());
    if (updatedCol !== -1) lineSheet.getRange(ent.row, updatedCol + 1).setValue(now);
    if (parentId) affectedPoIds[parentId] = true;
    updated++;
  }

  Object.keys(affectedPoIds).forEach(function (id) { procurementRecalcPoTotals_(ss, id); });

  return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped } });
}

/** Recompute purchase_orders totals (total_sku / total_qty / total_amount) from its lines. */
function procurementRecalcPoTotals_(ss, purchaseOrderId) {
  var lineSheet = ss.getSheetByName('purchase_order_lines');
  var poSheet = ss.getSheetByName('purchase_orders');
  if (!lineSheet || !poSheet) return;
  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return;
  var h = data[0].map(function (x) { return String(x).trim(); });
  var poIdCol = h.indexOf('purchase_order_id'), oCol = h.indexOf('ordered_qty'), ucCol = h.indexOf('unit_cost');
  if (poIdCol === -1) return;
  var totalSku = 0, totalQty = 0, totalAmount = 0;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][poIdCol]).trim() !== purchaseOrderId) continue;
    totalSku++;
    var q = oCol !== -1 ? (parseFloat(data[i][oCol]) || 0) : 0;
    totalQty += q;
    var uc = ucCol !== -1 ? parseFloat(data[i][ucCol]) : NaN;
    if (!isNaN(uc)) totalAmount += q * uc;
  }
  var ref = procurementFindRow_(poSheet, 'purchase_order_id', purchaseOrderId);
  if (!ref) return;
  function setCell(name, value) { var c = ref.col(name); if (c !== -1) poSheet.getRange(ref.row, c + 1).setValue(value); }
  setCell('total_sku', totalSku);
  setCell('total_qty', totalQty);
  setCell('total_amount', totalAmount > 0 ? Math.round(totalAmount * 100) / 100 : '');
}

// ---- Connection test / sample data (Part 5) -----------------------
/**
 * One-off validation helper. Run manually from the Apps Script editor to (1) auto-create the four
 * procurement tabs with their documented headers and (2) insert ONE sample Request Order (approved)
 * + ONE sample Purchase Order (in_production) with lines, so Request Order Draft / PO Overview /
 * PO List show real rows. Idempotent-ish: appends a fresh sample each run (delete rows to reset).
 * NOT wired to any action/trigger — purely a manual connection test. No factory-stock / shipment
 * side effects.
 */
function seedProcurementSampleData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var roSheet  = procurementEnsureSheet_(ss, 'request_orders', REQUEST_ORDERS_HEADERS_);
  var rolSheet = procurementEnsureSheet_(ss, 'request_order_lines', REQUEST_ORDER_LINES_HEADERS_);
  var poSheet  = procurementEnsureSheet_(ss, 'purchase_orders', PURCHASE_ORDERS_HEADERS_);
  var polSheet = procurementEnsureSheet_(ss, 'purchase_order_lines', PURCHASE_ORDER_LINES_HEADERS_);

  var now = procurementTimestamp_();
  var today = procurementToday_();
  var roId = 'RO-SAMPLE-' + Utilities.getUuid().substring(0, 6).toUpperCase();
  var poId = 'PO-SAMPLE-' + Utilities.getUuid().substring(0, 6).toUpperCase();

  // Request Order (approved) — appears on Request Order Draft under Approved (Convert to PO ready).
  procurementAppendByHeader_(roSheet, {
    request_order_id: roId, request_order_no: 'REQ-' + today.replace(/-/g, '') + '-SMPL',
    request_order_version: 1, parent_request_order_id: roId,
    company: 'ResTW', supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin',
    factory_id: 'CN_YOUXIN', warehouse_id: '', status: 'approved',
    total_sku: 2, total_qty: 900, total_cartons: 0, estimated_amount: 2250, currency: 'USD',
    source: 'manual', created_by: 'sample', created_at: now, submitted_by: 'sample', submitted_at: now,
    approved_by: 'sample', approved_at: now, note: 'Sample seed', updated_by: 'sample', updated_at: now
  });
  procurementAppendByHeader_(rolSheet, {
    request_order_line_id: 'ROL-SMPL-1', request_order_id: roId, sku: 'CO1100-R', product_name: 'Can Opener Red',
    series: 'CO1100', requested_qty: 500, approved_qty: 500, units_per_carton: 40, carton_qty: 13,
    supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin', supplier_sku: 'YX-CO1100R',
    unit_cost: 2.5, estimated_amount: 1250, currency: 'USD', need_reason: 'Sample', created_at: now, updated_at: now
  });
  procurementAppendByHeader_(rolSheet, {
    request_order_line_id: 'ROL-SMPL-2', request_order_id: roId, sku: 'CO1150-S', product_name: 'Can Opener Silver',
    series: 'CO1150', requested_qty: 400, approved_qty: 400, units_per_carton: 40, carton_qty: 10,
    supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin', supplier_sku: 'YX-CO1150S',
    unit_cost: 2.5, estimated_amount: 1000, currency: 'USD', need_reason: 'Sample', created_at: now, updated_at: now
  });

  // Purchase Order (in_production) — appears on PO Overview + PO List with production/shipment qtys.
  procurementAppendByHeader_(poSheet, {
    purchase_order_id: poId, purchase_order_no: 'PO-' + today.replace(/-/g, '') + '-SMPL',
    po_version: 1, parent_purchase_order_id: poId, request_order_id: roId,
    company: 'ResTW', supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin',
    factory_id: 'CN_YOUXIN', warehouse_id: '', status: 'in_production', currency: 'USD',
    total_sku: 2, total_qty: 900, total_amount: 2250, expected_ready_date: today,
    note: 'Sample seed', created_by: 'sample', created_at: now, updated_by: 'sample', updated_at: now
  });
  procurementAppendByHeader_(polSheet, {
    purchase_order_line_id: 'POL-SMPL-1', purchase_order_id: poId, request_order_line_id: 'ROL-SMPL-1',
    sku: 'CO1100-R', product_name: 'Can Opener Red', series: 'CO1100',
    ordered_qty: 500, completed_qty: 300, shipped_qty: 0, remaining_qty: 500,
    units_per_carton: 40, carton_qty: 13, supplier_id: 'SUP-YOUXIN', supplier_sku: 'YX-CO1100R',
    unit_cost: 2.5, line_amount: 1250, currency: 'USD', created_at: now, updated_at: now
  });
  procurementAppendByHeader_(polSheet, {
    purchase_order_line_id: 'POL-SMPL-2', purchase_order_id: poId, request_order_line_id: 'ROL-SMPL-2',
    sku: 'CO1150-S', product_name: 'Can Opener Silver', series: 'CO1150',
    ordered_qty: 400, completed_qty: 400, shipped_qty: 100, remaining_qty: 300,
    units_per_carton: 40, carton_qty: 10, supplier_id: 'SUP-YOUXIN', supplier_sku: 'YX-CO1150S',
    unit_cost: 2.5, line_amount: 1000, currency: 'USD', created_at: now, updated_at: now
  });

  return jsonResponse_({ success: true, data: { request_order_id: roId, purchase_order_id: poId, note: 'Sample procurement data created.' } });
}
