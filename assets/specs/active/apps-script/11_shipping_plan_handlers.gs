// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 11_shipping_plan_handlers.gs — Weekly Shipping Plan (Decision Layer) writes
// NOTE: All .gs files in this folder share ONE global scope in the Apps
//       Script project. Copy them into the project TOGETHER. No imports.
// Implements docs/planning/WEEKLY_SHIPPING_PLAN_MAPPING_SPEC.md (Draft v1.2)
//   - createShippingPlansBatch : Submit Plan → shipping_plans + shipping_plan_lines
//   - updateShippingPlanStatus : draft/pending_approval/approved/rejected/cancelled flow
//   - updateShippingPlanLineQty: edit approved_qty/carton_qty (Draft only)
// Tables live in the OPERATION DB spreadsheet (getActiveSpreadsheet). If a tab is
// missing it is created with the documented header row (the two NEW Decision-Layer
// tables only — no existing table/field is altered).
// ============================================================

var SHIPPING_PLANS_HEADERS_ = [
  'shipping_plan_id', 'shipping_plan_no', 'plan_name',
  'company', 'country', 'marketplace', 'ship_from', 'destination', 'shipping_method',
  'plan_version', 'parent_shipping_plan_id', 'submit_batch_id', 'batch_status',
  'carrier_id', 'carrier_unit_rate', 'carrier_rate_type',
  'estimated_freight_cost', 'estimated_duty', 'estimated_total_cost', 'currency',
  'status', 'created_by', 'created_at', 'submitted_by', 'submitted_at',
  'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejected_reason',
  'cancelled_by', 'cancelled_at',
  'transferred_to_shipment_at', 'transferred_shipment_id',
  'completed_at', 'completed_by',
  'note', 'source', 'updated_by', 'updated_at'
];

var SHIPPING_PLAN_LINES_HEADERS_ = [
  'shipping_plan_line_id', 'shipping_plan_id', 'sku',
  'requested_qty', 'approved_qty', 'carton_qty', 'units_per_carton',
  'source_page', 'source_reason', 'inventory_snapshot_date', 'note',
  'created_at', 'updated_at',
  'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply',
  'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context',
  // Logistics Decision Snapshot (computed from sku_details carton dims/weights at Submit Plan / Save).
  'carton_cbm', 'cbm', 'gross_weight', 'net_weight'
];

// ---- helpers ------------------------------------------------------

function shippingPlanTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function shippingPlanToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/** Get (or create with the documented header row) a Decision-Layer tab in the operation DB. */
function shippingPlanEnsureSheet_(ss, name, headers) {
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }
  // Tab exists; if it has no header row yet, write one.
  if (sh.getLastRow() < 1 || sh.getLastColumn() < 1) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

/** Append a row to a sheet using its existing header row (writes only known columns). */
function shippingPlanAppendByHeader_(sheet, obj) {
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
function shippingPlanUpcMap_(ss) {
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

function shippingPlanNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

function shippingPlanRound_(v, d) { var f = Math.pow(10, d); return Math.round((parseFloat(v) || 0) * f) / f; }

/**
 * sku -> logistics record from sku_details:
 *   { cartonL, cartonW, cartonH, cartonDimUnit, cartonWeight, itemWeight, upc }
 * Used to compute the shipping_plan_lines logistics snapshot (cbm / gross_weight / net_weight).
 */
function shippingPlanSkuLogisticsMap_(ss) {
  var map = {};
  var sh = ss.getSheetByName('sku_details');
  if (!sh) return map;
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return map;
  var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
  function ix(n) { return h.indexOf(n); }
  var cSku = ix('sku');
  if (cSku === -1) return map;
  var cL = ix('carton_length'), cW = ix('carton_width'), cH = ix('carton_height'),
      cDU = ix('carton_dimension_unit'), cWt = ix('carton_weight'), iWt = ix('item_weight'), cUpc = ix('units_per_carton');
  for (var i = 1; i < data.length; i++) {
    var s = String(data[i][cSku] || '').trim();
    if (!s) continue;
    map[s] = {
      cartonL: cL === -1 ? 0 : (parseFloat(data[i][cL]) || 0),
      cartonW: cW === -1 ? 0 : (parseFloat(data[i][cW]) || 0),
      cartonH: cH === -1 ? 0 : (parseFloat(data[i][cH]) || 0),
      cartonDimUnit: cDU === -1 ? '' : String(data[i][cDU] || '').trim().toLowerCase(),
      cartonWeight: cWt === -1 ? 0 : (parseFloat(data[i][cWt]) || 0),
      itemWeight: iWt === -1 ? 0 : (parseFloat(data[i][iWt]) || 0),
      upc: cUpc === -1 ? 0 : (parseFloat(data[i][cUpc]) || 0)
    };
  }
  return map;
}

/**
 * Logistics snapshot for one line (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §5.4; SKU_DETAILS_LOGISTICS_SPEC §4):
 *   carton_cbm = L*W*H/1,000,000  (cm only; other units deferred → 0)
 *   cbm        = carton_qty * carton_cbm
 *   gross_weight = carton_qty * carton_weight
 *   net_weight   = approved_qty * item_weight
 * Returns blanks when no sku_details logistics row exists (never fabricates).
 */
function shippingPlanLineLogistics_(logi, approvedQty, cartonQty) {
  if (!logi) return { carton_cbm: '', cbm: '', gross_weight: '', net_weight: '' };
  var unit = logi.cartonDimUnit || 'cm';
  var cartonCbm = (unit === 'cm' || unit === '') ? (logi.cartonL * logi.cartonW * logi.cartonH) / 1000000 : 0;
  cartonCbm = shippingPlanRound_(cartonCbm, 6);
  return {
    carton_cbm: cartonCbm,
    cbm: shippingPlanRound_(cartonQty * cartonCbm, 4),
    gross_weight: shippingPlanRound_(cartonQty * (logi.cartonWeight || 0), 3),
    net_weight: shippingPlanRound_(approvedQty * (logi.itemWeight || 0), 3)
  };
}

/**
 * Company resolution maps for shipping_plans.company (WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §3.3).
 * Source priority is applied by the caller: marketplaces (country+marketplace) →
 * marketplace_skus (country+marketplace+sku) → payload company → blank (with warning).
 * Returns { bySku: { 'country||marketplace||sku': company }, byMarket: { 'country||marketplace': company } }.
 */
function shippingPlanCompanyMaps_(ss) {
  var bySku = {}, byMarket = {};
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }

  var mpSku = ss.getSheetByName('marketplace_skus');
  if (mpSku) {
    var d = mpSku.getDataRange().getValues();
    if (d.length >= 2) {
      var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cCol = h.indexOf('company'), coCol = h.indexOf('country'), mCol = h.indexOf('marketplace'), sCol = h.indexOf('sku');
      if (cCol !== -1 && coCol !== -1 && mCol !== -1 && sCol !== -1) {
        for (var i = 1; i < d.length; i++) {
          var comp = String(d[i][cCol] || '').trim();
          if (!comp) continue;
          bySku[lc(d[i][coCol]) + '||' + lc(d[i][mCol]) + '||' + lc(d[i][sCol])] = comp;
        }
      }
    }
  }

  var mp = ss.getSheetByName('marketplaces');
  if (mp) {
    var d2 = mp.getDataRange().getValues();
    if (d2.length >= 2) {
      var h2 = d2[0].map(function (x) { return String(x).trim().toLowerCase(); });
      var cCol2 = h2.indexOf('company'), coCol2 = h2.indexOf('country'), mCol2 = h2.indexOf('marketplace');
      if (cCol2 !== -1 && coCol2 !== -1 && mCol2 !== -1) {
        for (var k = 1; k < d2.length; k++) {
          var comp2 = String(d2[k][cCol2] || '').trim();
          if (!comp2) continue;
          var key2 = lc(d2[k][coCol2]) + '||' + lc(d2[k][mCol2]);
          if (!byMarket[key2]) byMarket[key2] = comp2;
        }
      }
    }
  }
  return { bySku: bySku, byMarket: byMarket };
}

/** Resolve a line's company per spec §3.3 priority (marketplaces → marketplace_skus → payload → blank). */
function shippingPlanResolveCompany_(maps, country, marketplace, sku, payloadCompany) {
  function lc(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
  var pc = String(payloadCompany == null ? '' : payloadCompany).trim();
  if (pc === '--') pc = '';
  // 1) marketplaces by country+marketplace (PRIMARY — company is marketplace-level ownership)
  var m = maps.byMarket[lc(country) + '||' + lc(marketplace)];
  if (m) return m;
  // 2) marketplace_skus by country+marketplace+sku (fallback)
  var s = maps.bySku[lc(country) + '||' + lc(marketplace) + '||' + lc(sku)];
  if (s) return s;
  // 3) payload company if already resolved by the frontend
  if (pc) return pc;
  // 4) blank — log a warning so the unresolved gap is visible
  Logger.log('[createShippingPlansBatch] company unresolved for country=' + country + ' marketplace=' + marketplace + ' sku=' + sku);
  return '';
}

// ---- createShippingPlansBatch -------------------------------------

/**
 * Submit Plan write. Groups lines by the six-value key
 *   company + country + marketplace + ship_from + destination + shipping_method
 * (six-all-identical → one shipping_plan). All plans in this call share one submit_batch_id.
 * Creates shipping_plans (status=draft, plan_version=1, parent=self, batch_status=open) +
 * shipping_plan_lines (approved_qty=requested_qty, carton_qty, snapshots).
 */
function handleCreateShippingPlansBatch_(body) {
  var lines = (body && body.lines) || [];
  if (!lines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var source = String((body && body.source) || 'inventory_replenishment_submit_plan').trim();
  var createdBy = String((body && body.created_by) || 'inventory_replenishment').trim();

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var planSheet = shippingPlanEnsureSheet_(ss, 'shipping_plans', SHIPPING_PLANS_HEADERS_);
  var lineSheet = shippingPlanEnsureSheet_(ss, 'shipping_plan_lines', SHIPPING_PLAN_LINES_HEADERS_);
  var upcMap = shippingPlanUpcMap_(ss);
  var companyMaps = shippingPlanCompanyMaps_(ss);
  var logisticsMap = shippingPlanSkuLogisticsMap_(ss);

  var now = shippingPlanTimestamp_();
  var today = shippingPlanToday_();
  var submitBatchId = 'SB-' + Utilities.getUuid().substring(0, 12);

  // Group by the six-value key.
  var groups = {};
  var order = [];
  for (var i = 0; i < lines.length; i++) {
    var ln = lines[i] || {};
    var country = String(ln.country || '').trim();
    var marketplace = String(ln.marketplace || '').trim();
    var shipFrom = String(ln.ship_from || '').trim();
    var destination = String(ln.destination || '').trim();
    var method = String(ln.shipping_method || '').trim();
    var sku = String(ln.sku || '').trim();
    if (!sku) continue;
    // Resolve company from marketplace context (never leave it blank when a source exists).
    var company = shippingPlanResolveCompany_(companyMaps, country, marketplace, sku, ln.company);
    var key = [company, country, marketplace, shipFrom, destination, method].join('||');
    if (!groups[key]) { groups[key] = { meta: { company: company, country: country, marketplace: marketplace, ship_from: shipFrom, destination: destination, shipping_method: method }, lines: [] }; order.push(key); }
    groups[key].lines.push(ln);
  }

  var created = [];
  var totalLines = 0;

  for (var g = 0; g < order.length; g++) {
    var grp = groups[order[g]];
    var meta = grp.meta;
    var planId = 'SP-' + Utilities.getUuid().substring(0, 10).toUpperCase();
    var planNo = 'WSP-' + today.replace(/-/g, '') + '-' + (g + 1);
    var planName = [meta.company, meta.country, meta.marketplace, meta.shipping_method, today].filter(String).join(' / ');

    shippingPlanAppendByHeader_(planSheet, {
      shipping_plan_id: planId,
      shipping_plan_no: planNo,
      plan_name: planName,
      company: meta.company,
      country: meta.country,
      marketplace: meta.marketplace,
      ship_from: meta.ship_from,
      destination: meta.destination,
      shipping_method: meta.shipping_method,
      plan_version: 1,
      parent_shipping_plan_id: planId, // MVP: parent = self
      submit_batch_id: submitBatchId,
      batch_status: 'open',
      currency: '',
      status: 'draft',
      created_by: createdBy,
      created_at: now,
      note: '',
      source: source,
      updated_by: createdBy,
      updated_at: now
    });

    for (var j = 0; j < grp.lines.length; j++) {
      var l = grp.lines[j];
      var sku2 = String(l.sku || '').trim();
      var requested = shippingPlanNum_(l.requested_qty);
      var upc = shippingPlanNum_(l.units_per_carton) || upcMap[sku2] || 0;
      var approved = requested;
      var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
      var logi = shippingPlanLineLogistics_(logisticsMap[sku2], approved, carton);

      shippingPlanAppendByHeader_(lineSheet, {
        shipping_plan_line_id: 'SPL-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
        shipping_plan_id: planId,
        sku: sku2,
        requested_qty: requested,
        approved_qty: approved,
        carton_qty: carton,
        units_per_carton: upc,
        source_page: String(l.source_page || 'inventory_replenishment').trim(),
        source_reason: String(l.source_reason || 'manual_submit').trim(),
        inventory_snapshot_date: String(l.inventory_snapshot_date || '').trim(),
        note: '',
        created_at: now,
        updated_at: now,
        snapshot_current_stock: shippingPlanNum_(l.snapshot_current_stock),
        snapshot_avg_sales_per_day: shippingPlanNum_(l.snapshot_avg_sales_per_day),
        snapshot_days_of_supply: (l.snapshot_days_of_supply === '' || l.snapshot_days_of_supply == null) ? '' : l.snapshot_days_of_supply,
        snapshot_suggested_qty: shippingPlanNum_(l.snapshot_suggested_qty),
        snapshot_target_days: shippingPlanNum_(l.snapshot_target_days),
        snapshot_fc_context: (l.snapshot_fc_context == null) ? '' : l.snapshot_fc_context,
        snapshot_event_context: (l.snapshot_event_context == null) ? '' : l.snapshot_event_context,
        carton_cbm: logi.carton_cbm,
        cbm: logi.cbm,
        gross_weight: logi.gross_weight,
        net_weight: logi.net_weight
      });
      totalLines++;
    }

    created.push({ shipping_plan_id: planId, shipping_plan_no: planNo, shipping_method: meta.shipping_method, line_count: grp.lines.length });
  }

  return jsonResponse_({ success: true, data: { submit_batch_id: submitBatchId, plan_count: created.length, line_count: totalLines, plans: created } });
}

// ---- updateShippingPlanStatus -------------------------------------

/**
 * Status transitions on shipping_plans (header-based row lookup by shipping_plan_id):
 *   submit  : draft -> pending_approval (if previously rejected, plan_version +1, clear rejected_*)
 *   approve : pending_approval -> approved
 *   reject  : pending_approval -> draft (rejected_* recorded; reason appended to note)
 *   cancel  : draft|pending_approval -> cancelled (SOFT cancel — row + lines preserved)
 * Actor fields are placeholder identities for MVP (see WEEKLY_SHIPPING_PLAN_MAPPING_SPEC §13A);
 * a future Role & Permission module replaces them with real user identity.
 */
function handleUpdateShippingPlanStatus_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var transition = String((body && body.transition) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  var reason = String((body && body.rejected_reason) || '').trim();
  // Placeholder actor identities (MVP) — never block the flow if absent.
  var submittedBy = String((body && (body.submitted_by || body.updated_by)) || actor || 'system_user').trim();
  var cancelledBy = String((body && (body.cancelled_by || body.updated_by)) || actor || 'system_user').trim();
  var rejectedBy  = String((body && (body.rejected_by || body.updated_by)) || actor || 'system_user').trim();
  var approvedBy  = String((body && (body.approved_by || body.updated_by)) || actor || 'system_user').trim();
  var updatedBy   = String((body && body.updated_by) || actor || 'system_user').trim();

  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id' });
  var VALID_TRANSITIONS = ['submit', 'approve', 'reject', 'cancel'];
  if (VALID_TRANSITIONS.indexOf(transition) === -1) {
    return jsonResponse_({ success: false, error: 'Invalid transition. Valid: ' + VALID_TRANSITIONS.join(', ') });
  }
  if (transition === 'reject' && !reason) {
    return jsonResponse_({ success: false, error: 'rejected_reason is required to reject' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('shipping_plans');
  if (!sheet) return jsonResponse_({ success: false, error: 'shipping_plans sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'shipping_plans is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };

  var idCol = col('shipping_plan_id');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipping_plan_id column not found' });

  var targetRow = -1, rowVals = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === planId) { targetRow = i + 1; rowVals = data[i]; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipping plan not found: ' + planId });

  var curStatus = col('status') !== -1 ? String(rowVals[col('status')]).trim() : '';
  var now = shippingPlanTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(value); }

  if (transition === 'submit') {
    if (curStatus !== 'draft') return jsonResponse_({ success: false, error: 'Only a Draft plan can be submitted (current: ' + curStatus + ')' });
    // Resubmit after a prior rejection bumps the decision revision and clears the rejection marker.
    var wasRejected = col('rejected_at') !== -1 && String(rowVals[col('rejected_at')]).trim() !== '';
    if (wasRejected) {
      var curVer = col('plan_version') !== -1 ? (parseFloat(rowVals[col('plan_version')]) || 1) : 1;
      setCell('plan_version', curVer + 1);
      setCell('rejected_by', ''); setCell('rejected_at', ''); setCell('rejected_reason', '');
    }
    setCell('status', 'pending_approval');
    setCell('submitted_by', submittedBy);
    setCell('submitted_at', now);
  } else if (transition === 'approve') {
    if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval plan can be approved (current: ' + curStatus + ')' });
    setCell('status', 'approved');
    setCell('approved_by', approvedBy);
    setCell('approved_at', now);
  } else if (transition === 'reject') {
    if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval plan can be rejected (current: ' + curStatus + ')' });
    var verForNote = col('plan_version') !== -1 ? (parseFloat(rowVals[col('plan_version')]) || 1) : 1;
    setCell('rejected_by', rejectedBy);
    setCell('rejected_at', now);
    setCell('rejected_reason', reason);
    // Append the reason to the note history (preserve existing notes).
    if (col('note') !== -1) {
      var existingNote = String(rowVals[col('note')] || '').trim();
      var appended = '[REJECTED v' + verForNote + ' @' + now + '] ' + reason;
      setCell('note', existingNote ? (existingNote + '\n' + appended) : appended);
    }
    setCell('status', 'draft'); // returns to Draft (editable again); resubmit will bump plan_version
  } else if (transition === 'cancel') {
    // SOFT cancel: allowed from Draft or Pending Approval; row + lines are NEVER deleted.
    if (curStatus !== 'draft' && curStatus !== 'pending_approval') {
      return jsonResponse_({ success: false, error: 'Only a Draft or Pending Approval plan can be cancelled (current: ' + curStatus + ')' });
    }
    setCell('status', 'cancelled');
    setCell('cancelled_by', cancelledBy);
    setCell('cancelled_at', now);
  }

  setCell('updated_by', updatedBy);
  setCell('updated_at', now);

  // EXECUTION COMMIT: approving a plan creates its Shipment Draft (shipments + shipment_lines),
  // copying the Decision Snapshot into the Execution Snapshot (SHIPMENT_CENTER_SPEC §15 step 10;
  // ARCHITECTURE §3A/§4A). Idempotent. A failure here does NOT roll back the approval — the
  // explicit createShipmentFromPlan action can retry.
  var shipmentResult = null;
  if (transition === 'approve') {
    try {
      shipmentResult = createShipmentFromApprovedPlan_(ss, planId, approvedBy);
    } catch (e) {
      shipmentResult = { created: false, error: String(e && e.message ? e.message : e) };
    }
  }

  return jsonResponse_({ success: true, data: { shipping_plan_id: planId, transition: transition, shipment: shipmentResult } });
}

// ---- updateShippingPlanLineQty ------------------------------------

/**
 * Edit approved_qty on shipping_plan_lines (Draft only). Recomputes carton_qty from
 * units_per_carton. Body: { lines: [ { shipping_plan_line_id, approved_qty } ] }.
 * Lines whose parent plan is not Draft are skipped (reported).
 */
function handleUpdateShippingPlanLineQty_(body) {
  var reqLines = (body && body.lines) || [];
  if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('shipping_plan_lines');
  var planSheet = ss.getSheetByName('shipping_plans');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'shipping_plan_lines sheet not found' });
  if (!planSheet) return jsonResponse_({ success: false, error: 'shipping_plans sheet not found' });

  // plan_id -> status
  var planData = planSheet.getDataRange().getValues();
  var planHeaders = planData[0].map(function (h) { return String(h).trim(); });
  var pIdCol = planHeaders.indexOf('shipping_plan_id');
  var pStatusCol = planHeaders.indexOf('status');
  var statusById = {};
  for (var p = 1; p < planData.length; p++) {
    if (pIdCol !== -1) statusById[String(planData[p][pIdCol]).trim()] = pStatusCol !== -1 ? String(planData[p][pStatusCol]).trim() : '';
  }

  var data = lineSheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'shipping_plan_lines is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('shipping_plan_line_id');
  var planIdCol = col('shipping_plan_id');
  var skuCol = col('sku');
  var approvedCol = col('approved_qty');
  var cartonCol = col('carton_qty');
  var upcCol = col('units_per_carton');
  var cartonCbmCol = col('carton_cbm');
  var cbmCol = col('cbm');
  var grossCol = col('gross_weight');
  var netCol = col('net_weight');
  var updatedCol = col('updated_at');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipping_plan_line_id column not found' });

  // sku -> logistics, to recompute the line logistics snapshot on a qty edit (Save).
  var logisticsMap = shippingPlanSkuLogisticsMap_(ss);

  // index line id -> sheet row
  var rowById = {};
  for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };

  var now = shippingPlanTimestamp_();
  var updated = 0, skipped = 0;
  for (var r = 0; r < reqLines.length; r++) {
    var rq = reqLines[r] || {};
    var lineId = String(rq.shipping_plan_line_id || '').trim();
    if (!lineId || !rowById[lineId]) { skipped++; continue; }
    var ref = rowById[lineId];
    var parentId = planIdCol !== -1 ? String(ref.vals[planIdCol]).trim() : '';
    if (statusById[parentId] !== 'draft') { skipped++; continue; } // editable only in Draft
    var approved = parseFloat(rq.approved_qty); if (isNaN(approved) || approved < 0) approved = 0;
    var upc = upcCol !== -1 ? (parseFloat(ref.vals[upcCol]) || 0) : 0;
    var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
    if (approvedCol !== -1) lineSheet.getRange(ref.row, approvedCol + 1).setValue(approved);
    if (cartonCol !== -1) lineSheet.getRange(ref.row, cartonCol + 1).setValue(carton);
    // Recompute the logistics Decision Snapshot (cbm / gross_weight / net_weight) on Save.
    var skuVal = skuCol !== -1 ? String(ref.vals[skuCol] || '').trim() : '';
    var logi = shippingPlanLineLogistics_(logisticsMap[skuVal], approved, carton);
    if (cartonCbmCol !== -1) lineSheet.getRange(ref.row, cartonCbmCol + 1).setValue(logi.carton_cbm);
    if (cbmCol !== -1) lineSheet.getRange(ref.row, cbmCol + 1).setValue(logi.cbm);
    if (grossCol !== -1) lineSheet.getRange(ref.row, grossCol + 1).setValue(logi.gross_weight);
    if (netCol !== -1) lineSheet.getRange(ref.row, netCol + 1).setValue(logi.net_weight);
    if (updatedCol !== -1) lineSheet.getRange(ref.row, updatedCol + 1).setValue(now);
    updated++;
  }

  return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped } });
}

// ---- completeShippingPlan (Decision Layer Completion) -------------

/**
 * Mark an Approved + transferred Weekly Shipping Plan as COMPLETED (Decision Layer finished its job;
 * the Execution Layer has taken over). Writes ONLY completed_at / completed_by (+ updated_*).
 * Body: { shipping_plan_id, actor? }.
 * Guards: plan must be status=approved AND already transferred to a Shipment Draft
 *         (transferred_shipment_id OR transferred_to_shipment_at present).
 * Does NOT touch shipments / shipment_lines / Decision Snapshot / Execution Snapshot. No row delete.
 */
function handleCompleteShippingPlan_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var actor = String((body && (body.completed_by || body.actor)) || 'system_user').trim();
  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('shipping_plans');
  if (!sheet) return jsonResponse_({ success: false, error: 'shipping_plans sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'shipping_plans is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var col = function (n) { return headers.indexOf(n); };
  var idCol = col('shipping_plan_id');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipping_plan_id column not found' });

  var targetRow = -1, rowVals = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === planId) { targetRow = i + 1; rowVals = data[i]; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipping plan not found: ' + planId });

  var curStatus = col('status') !== -1 ? String(rowVals[col('status')]).trim() : '';
  if (curStatus !== 'approved') {
    return jsonResponse_({ success: false, error: 'Only an Approved plan can be completed (current: ' + curStatus + ')' });
  }
  var transferredId = col('transferred_shipment_id') !== -1 ? String(rowVals[col('transferred_shipment_id')]).trim() : '';
  var transferredAt = col('transferred_to_shipment_at') !== -1 ? String(rowVals[col('transferred_to_shipment_at')]).trim() : '';
  if (!transferredId && !transferredAt) {
    return jsonResponse_({ success: false, error: 'Plan has not been transferred to a Shipment Draft yet (Execution Commit required before Done).' });
  }

  var now = shippingPlanTimestamp_();
  function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(value); }
  setCell('completed_at', now);
  setCell('completed_by', actor);
  setCell('updated_by', actor);
  setCell('updated_at', now);

  return jsonResponse_({ success: true, data: { shipping_plan_id: planId, completed_at: now, completed_by: actor } });
}

// ---- appendShippingPlanNote ---------------------------------------

/**
 * Append a note to shipping_plans.note (append-only history). Body: { shipping_plan_id, note, actor? }.
 * - Preserves all existing notes (never overwrites).
 * - Never touches rejected_reason (that remains the formal rejection field).
 */
function handleAppendShippingPlanNote_(body) {
  var planId = String((body && body.shipping_plan_id) || '').trim();
  var note = String((body && body.note) || '').trim();
  var actor = String((body && body.actor) || 'operation-system').trim();
  if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id' });
  if (!note) return jsonResponse_({ success: false, error: 'note is required' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('shipping_plans');
  if (!sheet) return jsonResponse_({ success: false, error: 'shipping_plans sheet not found' });

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return jsonResponse_({ success: false, error: 'shipping_plans is empty' });
  var headers = data[0].map(function (h) { return String(h).trim(); });
  var idCol = headers.indexOf('shipping_plan_id');
  var noteCol = headers.indexOf('note');
  var updatedCol = headers.indexOf('updated_at');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipping_plan_id column not found' });
  if (noteCol === -1) return jsonResponse_({ success: false, error: 'note column not found' });

  var targetRow = -1, rowVals = null;
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]).trim() === planId) { targetRow = i + 1; rowVals = data[i]; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipping plan not found: ' + planId });

  var now = shippingPlanTimestamp_();
  var existing = String(rowVals[noteCol] || '').trim();
  var appended = '[NOTE @' + now + ' by ' + actor + '] ' + note;
  sheet.getRange(targetRow, noteCol + 1).setValue(existing ? (existing + '\n' + appended) : appended);
  if (updatedCol !== -1) sheet.getRange(targetRow, updatedCol + 1).setValue(now);

  return jsonResponse_({ success: true, data: { shipping_plan_id: planId } });
}
