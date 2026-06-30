// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 12_shipment_handlers.gs — Shipment (Execution Layer) writes — EXECUTION COMMIT
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements the Execution Commit defined in:
//   - SUPPLY_CHAIN_ARCHITECTURE_PRINCIPLES.md §3A (Execution Commit) / §4A (Execution Snapshot)
//   - SHIPMENT_CENTER_SPEC.md §2 / §15 (approval creates shipments + shipment_lines = draft)
//   - WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md §12 (Plan → Shipment field copy)
//
//   createShipmentFromApprovedPlan_ : Approved shipping_plan → shipments + shipment_lines (draft)
//                                     COPIES the Decision Snapshot into the Execution Snapshot.
//                                     NEVER recalculates Current Stock / Avg Sales / Days of Supply /
//                                     Suggested Qty / Target Days / FC / Event — all are copied.
//   handleCreateShipmentFromPlan_   : explicit action wrapper (idempotent retry)
//   handleUpdateShipment_           : edit EXECUTION-layer fields only (carrier/container/booking/
//                                     ETD/ETA/tracking/remark/...) — Decision/Execution Snapshot is
//                                     immutable and can NEVER be edited here.
// Tables live in the OPERATION DB spreadsheet. If a tab is missing it is created with the documented
// header row (the two NEW Execution-Layer tables only — no existing table/field is altered).
// ============================================================

var SHIPMENTS_HEADERS_ = [
  'shipment_id', 'shipment_no', 'shipping_plan_id', 'reference_id',
  'warehouse_id', 'warehouse_code',
  'company', 'country', 'marketplace', 'ship_from', 'destination',
  'carrier_id', 'rate_card_id', 'shipping_method', 'status', 'sales_order_id',
  'booking_no', 'tracking_number', 'container_no', 'bl_no', 'invoice_no',
  'etd', 'eta', 'actual_departure_date', 'actual_arrival_date',
  'customs_clearance_date', 'delivered_date',
  'total_qty', 'total_cartons', 'total_cbm', 'total_gross_weight', 'total_net_weight',
  'freight_cost_actual', 'duty_actual', 'currency',
  'note', 'created_by', 'created_at', 'updated_by', 'updated_at'
];

var SHIPMENT_LINES_HEADERS_ = [
  'shipment_line_id', 'shipment_id', 'sku',
  'qty', 'factory_stock_allocation_qty', 'carton_qty', 'carton_no_start', 'carton_no_end',
  'units_per_carton', 'carton_cbm', 'cbm', 'gross_weight', 'net_weight',
  'purchase_order_line_id', 'note', 'created_at', 'updated_at',
  // Execution Snapshot = a verbatim COPY of the Decision Snapshot (ARCHITECTURE §4A). Never recalculated.
  'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply',
  'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context',
  'snapshot_avg_sales_source', 'snapshot_avg_sales_warning'
];

// Execution-layer fields a user MAY edit on a Shipment (everything else — identity, the six-key
// context, totals, and the whole Execution Snapshot — is immutable here).
var SHIPMENT_EDITABLE_FIELDS_ = [
  'carrier_id', 'rate_card_id', 'shipping_method',
  'booking_no', 'tracking_number', 'container_no', 'bl_no', 'invoice_no',
  'etd', 'eta', 'actual_departure_date', 'actual_arrival_date',
  'customs_clearance_date', 'delivered_date',
  'total_cbm', 'total_gross_weight', 'total_net_weight',
  'freight_cost_actual', 'duty_actual', 'currency',
  'warehouse_code', 'reference_id', 'note'
];

function shipmentTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
function shipmentToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function shipmentNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

/** Get (or create with the documented header row) an Execution-Layer tab. */
function shipmentEnsureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

/** Append a row using the sheet's existing header row (writes only known columns). */
function shipmentAppendByHeader_(sheet, obj) {
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

/** Read a sheet as {headers, rows(values), colIndex(name)}. */
function shipmentReadSheet_(sheet) {
  var data = sheet.getDataRange().getValues();
  var headers = (data[0] || []).map(function (h) { return String(h).trim(); });
  return {
    headers: headers,
    rows: data,
    col: function (n) { return headers.indexOf(n); }
  };
}

// ---- Execution Commit: Approved shipping_plan → shipments + shipment_lines (draft) ----

/**
 * Creates the Shipment Draft for an APPROVED shipping_plan. Idempotent: if a shipment already
 * exists for the plan, it is returned without creating a duplicate. Copies the plan header context
 * and copies each line's Decision Snapshot into the Execution Snapshot (no recalculation).
 * Returns { created, shipment_id, shipment_no, line_count, reason }.
 */
function createShipmentFromApprovedPlan_(ss, planId, actor) {
  planId = String(planId || '').trim();
  if (!planId) return { created: false, reason: 'missing_plan_id' };
  actor = String(actor || 'system_user').trim();

  var planSheet = ss.getSheetByName('shipping_plans');
  var planLineSheet = ss.getSheetByName('shipping_plan_lines');
  if (!planSheet) return { created: false, reason: 'shipping_plans_not_found' };
  if (!planLineSheet) return { created: false, reason: 'shipping_plan_lines_not_found' };

  // Locate the plan row.
  var p = shipmentReadSheet_(planSheet);
  var pIdCol = p.col('shipping_plan_id');
  if (pIdCol === -1) return { created: false, reason: 'plan_id_column_missing' };
  var planRow = null, planRowIndex = -1;
  for (var i = 1; i < p.rows.length; i++) {
    if (String(p.rows[i][pIdCol]).trim() === planId) { planRow = p.rows[i]; planRowIndex = i + 1; break; }
  }
  if (!planRow) return { created: false, reason: 'plan_not_found' };
  var pv = function (name) { var c = p.col(name); return c === -1 ? '' : planRow[c]; };
  if (String(pv('status')).trim() !== 'approved') {
    return { created: false, reason: 'plan_not_approved' };
  }

  var shipmentSheet = shipmentEnsureSheet_(ss, 'shipments', SHIPMENTS_HEADERS_);
  var shipmentLineSheet = shipmentEnsureSheet_(ss, 'shipment_lines', SHIPMENT_LINES_HEADERS_);

  // Idempotency: one Shipment Draft per approved plan (Phase 1). Skip if one already exists.
  var s = shipmentReadSheet_(shipmentSheet);
  var sPlanCol = s.col('shipping_plan_id');
  var sIdCol = s.col('shipment_id');
  if (sPlanCol !== -1) {
    for (var r = 1; r < s.rows.length; r++) {
      if (String(s.rows[r][sPlanCol]).trim() === planId) {
        return { created: false, reason: 'already_exists', shipment_id: (sIdCol !== -1 ? String(s.rows[r][sIdCol]).trim() : '') };
      }
    }
  }

  // Collect the plan's lines.
  var pl = shipmentReadSheet_(planLineSheet);
  var plPlanCol = pl.col('shipping_plan_id');
  var planLines = [];
  for (var k = 1; k < pl.rows.length; k++) {
    if (plPlanCol !== -1 && String(pl.rows[k][plPlanCol]).trim() === planId) planLines.push(pl.rows[k]);
  }
  var plv = function (rowVals, name) { var c = pl.col(name); return c === -1 ? '' : rowVals[c]; };

  var now = shipmentTimestamp_();
  var today = shipmentToday_();
  var shipmentId = 'SH-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  var shipmentNo = 'SHP-' + today.replace(/-/g, '') + '-' + shipmentId.substring(3, 7);

  // Totals are COPIED / summed from the plan lines (not recalculated from live inventory).
  var totalQty = 0, totalCartons = 0, totalCbm = 0, totalGross = 0, totalNet = 0;
  for (var t = 0; t < planLines.length; t++) {
    totalQty += shipmentNum_(plv(planLines[t], 'approved_qty'));
    totalCartons += shipmentNum_(plv(planLines[t], 'carton_qty'));
    totalCbm += shipmentNum_(plv(planLines[t], 'cbm'));
    totalGross += shipmentNum_(plv(planLines[t], 'gross_weight'));
    totalNet += shipmentNum_(plv(planLines[t], 'net_weight'));
  }

  // Header: copy the six-key context + carrier from the plan (WEEKLY §12).
  shipmentAppendByHeader_(shipmentSheet, {
    shipment_id: shipmentId,
    shipment_no: shipmentNo,
    shipping_plan_id: planId,
    company: pv('company'),
    country: pv('country'),
    marketplace: pv('marketplace'),
    ship_from: pv('ship_from'),
    destination: pv('destination'),
    shipping_method: pv('shipping_method'),
    carrier_id: pv('carrier_id'),
    currency: pv('currency'),
    status: 'draft',
    total_qty: totalQty,
    total_cartons: totalCartons,
    total_cbm: shipmentNum_(Math.round(totalCbm * 10000) / 10000),
    total_gross_weight: shipmentNum_(Math.round(totalGross * 1000) / 1000),
    total_net_weight: shipmentNum_(Math.round(totalNet * 1000) / 1000),
    created_by: actor,
    created_at: now,
    updated_by: actor,
    updated_at: now
  });

  // Lines: qty = approved_qty; copy carton/units; COPY the Decision Snapshot → Execution Snapshot.
  var lineCount = 0;
  for (var j = 0; j < planLines.length; j++) {
    var lr = planLines[j];
    shipmentAppendByHeader_(shipmentLineSheet, {
      shipment_line_id: 'SHL-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
      shipment_id: shipmentId,
      sku: plv(lr, 'sku'),
      qty: shipmentNum_(plv(lr, 'approved_qty')),
      carton_qty: shipmentNum_(plv(lr, 'carton_qty')),
      units_per_carton: shipmentNum_(plv(lr, 'units_per_carton')),
      // Logistics: COPIED from the plan line (Execution Snapshot — never recalculated).
      carton_cbm: (plv(lr, 'carton_cbm') === '' || plv(lr, 'carton_cbm') == null) ? '' : plv(lr, 'carton_cbm'),
      cbm: (plv(lr, 'cbm') === '' || plv(lr, 'cbm') == null) ? '' : plv(lr, 'cbm'),
      gross_weight: (plv(lr, 'gross_weight') === '' || plv(lr, 'gross_weight') == null) ? '' : plv(lr, 'gross_weight'),
      net_weight: (plv(lr, 'net_weight') === '' || plv(lr, 'net_weight') == null) ? '' : plv(lr, 'net_weight'),
      note: plv(lr, 'note'),
      created_at: now,
      updated_at: now,
      // Execution Snapshot — verbatim copy of the line's Decision Snapshot (ARCHITECTURE §4A).
      snapshot_current_stock: plv(lr, 'snapshot_current_stock'),
      snapshot_avg_sales_per_day: plv(lr, 'snapshot_avg_sales_per_day'),
      snapshot_days_of_supply: plv(lr, 'snapshot_days_of_supply'),
      snapshot_suggested_qty: plv(lr, 'snapshot_suggested_qty'),
      snapshot_target_days: plv(lr, 'snapshot_target_days'),
      snapshot_fc_context: plv(lr, 'snapshot_fc_context'),
      snapshot_event_context: plv(lr, 'snapshot_event_context'),
      snapshot_avg_sales_source: plv(lr, 'snapshot_avg_sales_source'),
      snapshot_avg_sales_warning: plv(lr, 'snapshot_avg_sales_warning')
    });
    lineCount++;
  }

  // Decision-Layer HANDOFF metadata (NOT a Decision Snapshot change — Immutable Flow preserved):
  // mark the plan as transferred so the Weekly Shipping Plan UI hides it by default. The plan row and
  // its lines (and their Decision Snapshot) are NOT deleted or mutated. setValue skips columns absent
  // from the live sheet, so this is non-blocking until the two new headers are added.
  function setPlanCell_(name, value) { var c = p.col(name); if (c !== -1 && planRowIndex !== -1) planSheet.getRange(planRowIndex, c + 1).setValue(value); }
  setPlanCell_('transferred_to_shipment_at', now);
  setPlanCell_('transferred_shipment_id', shipmentId);
  setPlanCell_('updated_at', now);

  return { created: true, shipment_id: shipmentId, shipment_no: shipmentNo, line_count: lineCount };
}

/** Explicit action wrapper (idempotent retry of the Execution Commit). */
function handleCreateShipmentFromPlan_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var actor = String((body && (body.created_by || body.actor)) || 'system_user').trim();
  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result;
  try {
    result = createShipmentFromApprovedPlan_(ss, planId, actor);
  } catch (e) {
    return jsonResponse_({ success: false, error: String(e && e.message ? e.message : e) });
  }
  if (result && result.created === false && result.reason && result.reason !== 'already_exists') {
    return jsonResponse_({ success: false, error: 'Could not create shipment: ' + result.reason, data: result });
  }
  return jsonResponse_({ success: true, data: result });
}

// ---- updateShipment: edit EXECUTION-layer fields only ----

/**
 * Edit execution-layer fields on a shipment (header-based row lookup by shipment_id).
 * Only fields in SHIPMENT_EDITABLE_FIELDS_ (+ status) are writable; the Execution Snapshot
 * and the six-key context can NEVER be modified here. Body:
 *   { shipment_id, <editable field>: value, ..., status?, actor? }
 */
function handleUpdateShipment_(body) {
  var shipmentId = String((body && body.shipment_id) || '').trim();
  var actor = String((body && (body.updated_by || body.actor)) || 'system_user').trim();
  if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('shipments');
  if (!sheet) return jsonResponse_({ success: false, error: 'shipments sheet not found' });

  var s = shipmentReadSheet_(sheet);
  var idCol = s.col('shipment_id');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipment_id column not found' });

  var targetRow = -1;
  for (var i = 1; i < s.rows.length; i++) {
    if (String(s.rows[i][idCol]).trim() === shipmentId) { targetRow = i + 1; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId });

  function setCell(name, value) { var c = s.col(name); if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(value); }

  var changed = 0;
  for (var f = 0; f < SHIPMENT_EDITABLE_FIELDS_.length; f++) {
    var fld = SHIPMENT_EDITABLE_FIELDS_[f];
    if (body.hasOwnProperty(fld)) { setCell(fld, body[fld]); changed++; }
  }
  // Optional execution status advance (draft → planned → ready_to_ship → ...). Snapshot stays frozen.
  if (body.hasOwnProperty('status') && String(body.status).trim() !== '') {
    setCell('status', String(body.status).trim());
    changed++;
  }

  var now = shipmentTimestamp_();
  setCell('updated_by', actor);
  setCell('updated_at', now);

  return jsonResponse_({ success: true, data: { shipment_id: shipmentId, fields_updated: changed } });
}
