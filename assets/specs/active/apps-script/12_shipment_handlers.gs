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
  'shipment_id', 'shipment_no', 'external_shipment_id', 'shipping_plan_id', 'reference_id',
  'warehouse_id', 'warehouse_code',
  'company', 'country', 'marketplace', 'ship_from', 'destination',
  'carrier_id', 'rate_card_id', 'shipping_method', 'last_mile_delivery', 'shipping_method_label', 'shipments_customs_type', 'shipments_customs_type_label', 'status', 'sales_order_id',
  'booking_no', 'tracking_number', 'container_no', 'bl_no', 'invoice_no',
  'etd', 'eta', 'actual_departure_date', 'actual_arrival_date',
  'customs_clearance_date', 'delivered_date',
  // Quantity totals — CANONICAL renamed columns (2026-07 DB rename). Legacy total_qty / total_cartons /
  // total_cbm are RETIRED (read-fallback only; never re-ensured). Weights keep their original names.
  'shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm', 'total_gross_weight', 'total_net_weight',
  'freight_cost_actual', 'duty_actual', 'currency',
  // Ship / Done lifecycle metadata (Shipment Draft workspace).
  'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',
  'note', 'created_by', 'created_at', 'updated_by', 'updated_at'
];

// NOTE: shipment_lines.shipment_carton_cbm = LINE-TOTAL CBM (m³) for the whole line/SKU quantity —
// NOT per-carton. gross_weight / net_weight are likewise LINE totals. The per-carton × carton-qty
// multiplication happens once UPSTREAM (shipping_plan_lines.cbm) or once at Execution Commit; the
// header shipment_total_cbm = Σ shipment_carton_cbm (never re-multiplied). Legacy carton_cbm (old
// per-carton column) is read-fallback only and is never written/ensured.
var SHIPMENT_LINES_HEADERS_ = [
  'shipment_line_id', 'shipment_id', 'sku',
  // shipment_qty = CANONICAL renamed column (was qty; legacy read-fallback only).
  // shipment_carton_qty = CANONICAL renamed column (was carton_qty; legacy read-fallback only).
  // shipment_carton_cbm = CANONICAL renamed column (was carton_cbm; now LINE-TOTAL, legacy fallback only).
  'shipment_qty', 'factory_stock_allocation_qty', 'shipment_carton_qty', 'carton_no_start', 'carton_no_end',
  'units_per_carton', 'shipment_carton_cbm', 'gross_weight', 'net_weight',
  'purchase_order_line_id', 'note', 'created_at', 'updated_at',
  // Execution Snapshot = a verbatim COPY of the Decision Snapshot (ARCHITECTURE §4A). Never recalculated.
  'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply',
  'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context',
  'snapshot_avg_sales_source', 'snapshot_avg_sales_warning'
];

// Execution-layer fields a user MAY edit on a Shipment (everything else — identity, the six-key
// context, totals, and the whole Execution Snapshot — is immutable here).
var SHIPMENT_EDITABLE_FIELDS_ = [
  'external_shipment_id',
  'carrier_id', 'rate_card_id', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type',
  'booking_no', 'tracking_number', 'container_no', 'bl_no', 'invoice_no',
  'etd', 'eta', 'actual_departure_date', 'actual_arrival_date',
  'customs_clearance_date', 'delivered_date',
  'shipment_total_cbm', 'shipment_total_gross_weight', 'shipment_total_net_weight',
  'freight_cost_actual', 'duty_actual', 'currency',
  // Warehouse Picker (SHIPMENT_CENTER_SPEC §22.0): warehouse_id is the DESTINATION warehouse identity
  // chosen from the Warehouse Master; warehouse_code is the code SNAPSHOT copied from that same row by
  // the frontend picker (never free-typed, never inferred from destination text). Both persist together.
  // TEMPORARY SEMANTIC (inbound-first, task item 9): these = the destination warehouse. Explicit
  // origin_warehouse_id / destination_warehouse_id arrive with Warehouse Outbound via a planned migration.
  'warehouse_id', 'warehouse_code', 'reference_id', 'note'
];

function shipmentTimestamp_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
function shipmentToday_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function shipmentNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }

// Read carrier_rate_cards.shipping_method_label for a rate_card_id (READ-ONLY; never modifies the
// carrier tables). Returns '' when the table / column / row / value is absent — the caller then
// applies the fallback. carrier_rate_cards.shipping_method_label is populated by the Carrier module
// (out of scope here); this resolver is ready for it and safe before it exists.
function shipmentRateCardLabel_(ss, rateCardId) {
  return shipmentRateCardField_(ss, rateCardId, 'shipping_method_label');
}

// Read an arbitrary carrier_rate_cards column for a rate_card_id (READ-ONLY). Returns '' when the
// table / column / row / value is absent. Shared by the label + customs_type snapshot resolvers.
function shipmentRateCardField_(ss, rateCardId, fieldName) {
  var id = String(rateCardId || '').trim();
  if (!id) return '';
  var sh = ss.getSheetByName('carrier_rate_cards');
  if (!sh) return '';
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return '';
  var h = data[0].map(function (x) { return String(x).trim(); });
  var idc = h.indexOf('rate_card_id'), fc = h.indexOf(fieldName);
  if (idc === -1 || fc === -1) return '';
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idc]).trim() === id) return String(data[i][fc] == null ? '' : data[i][fc]).trim();
  }
  return '';
}

// Resolve the Shipment shipments_customs_type SNAPSHOT value. Priority: (1) a value already on the
// plan/body, (2) carrier_rate_cards.customs_type by rate_card_id (the Rate Card SOURCE field — its name
// is unchanged). Blank when nothing is available (nullable). Result is stored on shipments.shipments_customs_type.
function shipmentCustomsType_(ss, rateCardId, presetCustomsType) {
  var v = String(presetCustomsType || '').trim();
  if (v) return v;
  return shipmentRateCardField_(ss, rateCardId, 'customs_type');
}

// Resolve the Shipment shipments_customs_type_label SNAPSHOT — the localized (中文) display Label frozen
// at creation. Mirrors shipmentMethodLabel_ EXACTLY. Priority: (1) a label already on the plan/body,
// (2) carrier_rate_cards.customs_type_label by rate_card_id (the Carrier module populates it), (3) FALLBACK
// = the canonical enum→Label map for the resolved customs_type. Blank when nothing is available (nullable).
// Documents read ONLY this label; they must never translate the enum themselves.
function shipmentCustomsTypeLabel_(ss, rateCardId, presetLabel, customsType) {
  var lbl = String(presetLabel || '').trim();
  if (!lbl) lbl = shipmentRateCardField_(ss, rateCardId, 'customs_type_label');
  if (lbl) return lbl;
  return customsTypeLabel_(customsType);   // canonical enum→Label fallback (shared global; see 17_carrier_handlers.gs)
}

// Resolve the Shipment display label (SNAPSHOT). Priority: (1) a label already on the plan/body,
// (2) carrier_rate_cards.shipping_method_label by rate_card_id, (3) FALLBACK = shipping_method + '_' +
// last_mile_delivery (compat only; leading/trailing '_' trimmed). Blank when nothing is available.
function shipmentMethodLabel_(ss, rateCardId, presetLabel, shippingMethod, lastMile) {
  var lbl = String(presetLabel || '').trim();
  if (!lbl) lbl = shipmentRateCardLabel_(ss, rateCardId);
  if (lbl) return lbl;
  var sm = String(shippingMethod || '').trim();
  var lm = String(lastMile || '').trim();
  if (!sm && !lm) return '';
  return (sm + '_' + lm).replace(/^_+|_+$/g, '');   // fallback: Sea_Parcel
}

/** Marketplace short code for the external_shipment_id default (unknown -> first 3 chars uppercased). */
var SHIPMENT_MARKETPLACE_ABBREV_ = {
  amazon: 'AMZ', walmart: 'WMT', shopify: 'SHP', ebay: 'EBY', target: 'TGT', wayfair: 'WYF'
};
function shipmentMarketplaceAbbrev_(marketplace) {
  var m = String(marketplace == null ? '' : marketplace).trim();
  if (!m) return '';
  var key = m.toLowerCase();
  if (SHIPMENT_MARKETPLACE_ABBREV_[key]) return SHIPMENT_MARKETPLACE_ABBREV_[key];
  return m.toUpperCase().replace(/[^A-Z0-9]+/g, '').substring(0, 3);
}

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

/**
 * Find an existing shipment for a shipping_plan_id. Robust to the column name used to record the
 * plan reference (shipping_plan_id / source_shipping_plan_id / plan_id). Returns the shipment_id
 * (or '' when none). Lets Weekly Shipping Plan Done detect the Execution Commit even when the
 * plan's own transferred_shipment_id column was never persisted. Shared global scope (used by 11_).
 */
function shipmentFindForPlan_(ss, planId) {
  planId = String(planId || '').trim();
  if (!planId) return '';
  var sheet = ss.getSheetByName('shipments');
  if (!sheet) return '';
  var s = shipmentReadSheet_(sheet);
  var idCol = s.col('shipment_id');
  var refCols = ['shipping_plan_id', 'source_shipping_plan_id', 'plan_id']
    .map(function (n) { return s.col(n); }).filter(function (c) { return c !== -1; });
  if (!refCols.length) return '';
  for (var r = 1; r < s.rows.length; r++) {
    for (var c = 0; c < refCols.length; c++) {
      if (String(s.rows[r][refCols[c]]).trim() === planId) {
        return idCol !== -1 ? String(s.rows[r][idCol]).trim() : 'MATCH';
      }
    }
  }
  return '';
}

/**
 * Validate the carton-number ranges (carton_no_start / carton_no_end) for a shipment's lines.
 * Rules: integers only; start <= end; ranges must not overlap within the same shipment.
 * When requireComplete is true, EVERY line must have both start and end (Ship gate).
 * Returns { ok, error }.
 */
function shipmentValidateCartons_(ss, shipmentId, requireComplete) {
  var sheet = ss.getSheetByName('shipment_lines');
  if (!sheet) return { ok: true };
  var s = shipmentReadSheet_(sheet);
  var idCol = s.col('shipment_id');
  var startCol = s.col('carton_no_start');
  var endCol = s.col('carton_no_end');
  var skuCol = s.col('sku');
  if (idCol === -1) return { ok: true };
  var ranges = [];
  for (var r = 1; r < s.rows.length; r++) {
    if (String(s.rows[r][idCol]).trim() !== String(shipmentId).trim()) continue;
    var sku = skuCol !== -1 ? String(s.rows[r][skuCol] || '').trim() : ('line ' + r);
    var rawStart = startCol !== -1 ? String(s.rows[r][startCol] == null ? '' : s.rows[r][startCol]).trim() : '';
    var rawEnd = endCol !== -1 ? String(s.rows[r][endCol] == null ? '' : s.rows[r][endCol]).trim() : '';
    if (rawStart === '' && rawEnd === '') {
      if (requireComplete) return { ok: false, error: 'Carton No. required for SKU ' + sku };
      continue;
    }
    if (rawStart === '' || rawEnd === '') {
      return { ok: false, error: 'Both Carton No. Start and End are required for SKU ' + sku };
    }
    var st = parseInt(rawStart, 10), en = parseInt(rawEnd, 10);
    if (isNaN(st) || isNaN(en) || String(st) !== rawStart || String(en) !== rawEnd) {
      return { ok: false, error: 'Carton No. must be whole numbers for SKU ' + sku };
    }
    if (st > en) return { ok: false, error: 'Carton No. Start must be <= End for SKU ' + sku };
    ranges.push({ sku: sku, start: st, end: en });
  }
  for (var i = 0; i < ranges.length; i++) {
    for (var j = i + 1; j < ranges.length; j++) {
      if (ranges[i].start <= ranges[j].end && ranges[j].start <= ranges[i].end) {
        return { ok: false, error: 'Carton No. ranges overlap: ' + ranges[i].sku + ' (' + ranges[i].start + '-' + ranges[i].end + ') and ' + ranges[j].sku + ' (' + ranges[j].start + '-' + ranges[j].end + ')' };
      }
    }
  }
  return { ok: true };
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
  // Auto-add columns on tabs that predate them (no manual migration). Includes the CANONICAL renamed
  // quantity totals + shipments_customs_type snapshot so appendByHeader can write them. Retired legacy columns
  // (total_qty / total_cartons / total_cbm / carton_qty) are intentionally NOT ensured here.
  sheetEnsureColumns_(shipmentSheet, ['external_shipment_id', 'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',
    'last_mile_delivery', 'shipping_method_label', 'shipments_customs_type', 'shipments_customs_type_label', 'booking_no', 'note',
    'shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm',
    'shipment_total_gross_weight', 'shipment_total_net_weight']);
  sheetEnsureColumns_(shipmentLineSheet, ['carton_no_start', 'carton_no_end', 'shipment_carton_qty', 'shipment_qty', 'shipment_carton_cbm']);
  sheetEnsureColumns_(planSheet, ['transferred_to_shipment_at', 'transferred_shipment_id']);

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
  // Plan carton qty — CANONICAL shipping_plan_lines.plan_carton_qty with legacy carton_qty read-fallback.
  var planCartonQty = function (rowVals) {
    var v = plv(rowVals, 'plan_carton_qty');
    if (v === '' || v == null) v = plv(rowVals, 'carton_qty');
    return v;
  };

  var now = shipmentTimestamp_();
  var today = shipmentToday_();
  var shipmentId = 'SH-' + Utilities.getUuid().substring(0, 10).toUpperCase();
  var shipmentNo = 'SHP-' + today.replace(/-/g, '') + '-' + shipmentId.substring(3, 7);

  // Default external shipment id: COMPANY-MKT-YYMMDD-## (user-overridable later).
  //   Company abbrev = company uppercased, non-alphanumerics removed (e.g. "Res US" -> "RESUS").
  //   Marketplace abbrev = known short code (Amazon->AMZ, Walmart->WMT, ...) else first 3 chars.
  //   YYMMDD = today; ## = 2-digit serial per company+marketplace+country that day.
  function normSeg_(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]+/g, ''); }
  var companyAbbrev = normSeg_(pv('company'));
  var marketplaceAbbrev = shipmentMarketplaceAbbrev_(pv('marketplace'));
  var yymmdd = today.replace(/-/g, '').substring(2); // YYYYMMDD -> YYMMDD
  var extPrefix = [companyAbbrev, marketplaceAbbrev, yymmdd].filter(String).join('-');
  var extCol = s.col('external_shipment_id');
  var extSerial = 1;
  if (extCol !== -1) {
    for (var e = 1; e < s.rows.length; e++) {
      if (String(s.rows[e][extCol] || '').indexOf(extPrefix + '-') === 0) extSerial++;
    }
  }
  var externalShipmentId = extPrefix + '-' + ('0' + extSerial).slice(-2);

  // sku -> logistics (for per-carton CBM fallback when the plan line has none).
  var logisticsMap = (typeof shippingPlanSkuLogisticsMap_ === 'function') ? shippingPlanSkuLogisticsMap_(ss) : {};
  // PER-CARTON CBM (L×W×H/1e6) — plan carton_cbm, else computed from sku_details carton dims (cm only).
  function cartonCbmFor_(rowVals) {
    var v = plv(rowVals, 'carton_cbm');
    if (v !== '' && v != null) return shipmentNum_(v);
    var sku = String(plv(rowVals, 'sku') || '').trim();
    var logi = logisticsMap[sku];
    if (!logi) return '';
    var unit = logi.cartonDimUnit || 'cm';
    if (unit !== 'cm' && unit !== '') return '';
    var cbm = (logi.cartonL * logi.cartonW * logi.cartonH) / 1000000;
    return Math.round(cbm * 1000000) / 1000000;
  }
  // LINE-TOTAL CBM for shipment_lines.shipment_carton_cbm. The plan already stores a line-total under
  // `shipping_plan_lines.cbm` (= carton_qty × per-carton carton_cbm, computed once upstream) — copy it
  // directly. Fallback (plan line-total blank): per-carton × carton-qty, multiplied EXACTLY ONCE here.
  function lineCbmFor_(rowVals) {
    var lineTotal = plv(rowVals, 'cbm');
    if (lineTotal !== '' && lineTotal != null) return shipmentNum_(lineTotal);
    var perCarton = shipmentNum_(cartonCbmFor_(rowVals));
    if (!perCarton) return '';
    return Math.round(perCarton * shipmentNum_(planCartonQty(rowVals)) * 10000) / 10000;
  }

  // Totals are COPIED / summed from the plan lines (not recalculated from live inventory).
  // shipment_total_cbm = Σ(line-total CBM) — the line already holds its total; NEVER re-multiply by cartons.
  var totalQty = 0, totalCartons = 0, totalCbm = 0, totalGross = 0, totalNet = 0;
  for (var t = 0; t < planLines.length; t++) {
    totalQty += shipmentNum_(plv(planLines[t], 'approved_qty'));
    totalCartons += shipmentNum_(planCartonQty(planLines[t]));
    totalCbm += shipmentNum_(lineCbmFor_(planLines[t]));
    totalGross += shipmentNum_(plv(planLines[t], 'gross_weight'));
    totalNet += shipmentNum_(plv(planLines[t], 'net_weight'));
  }

  // Shipping method SNAPSHOT: copy the localized display label from the Carrier Rate Card at creation
  // (B). Once copied it is NOT auto-resynced (except a rate-card change while still Draft — see update).
  // Fallback = shipping_method + '_' + last_mile_delivery when no label is available (C).
  var pRateCardId = pv('rate_card_id');
  var pShipMethod = pv('shipping_method');
  var pLastMile = pv('last_mile_delivery');
  var pMethodLabel = shipmentMethodLabel_(ss, pRateCardId, pv('shipping_method_label'), pShipMethod, pLastMile);
  // Customs type SNAPSHOT: prefill from the plan's Carrier Rate Card at creation (user-confirmable
  // while Draft via updateShipment). Blank/nullable when no rate card / value is available.
  var pCustomsType = shipmentCustomsType_(ss, pRateCardId, pv('customs_type'));
  // Customs type LABEL SNAPSHOT — mirrors shipping_method_label. Source: carrier_rate_cards.customs_type_label
  // (fallback = canonical enum→Label map for pCustomsType). Frozen after creation; documents read this only.
  var pCustomsTypeLabel = shipmentCustomsTypeLabel_(ss, pRateCardId, pv('customs_type_label'), pCustomsType);

  // Header: copy the six-key context + carrier from the plan (WEEKLY §12).
  shipmentAppendByHeader_(shipmentSheet, {
    shipment_id: shipmentId,
    shipment_no: shipmentNo,
    external_shipment_id: externalShipmentId,
    shipping_plan_id: planId,
    company: pv('company'),
    country: pv('country'),
    marketplace: pv('marketplace'),
    ship_from: pv('ship_from'),
    destination: pv('destination'),
    shipping_method: pShipMethod,
    last_mile_delivery: pLastMile,
    shipping_method_label: pMethodLabel,   // localized display SNAPSHOT (frozen after creation)
    shipments_customs_type: pCustomsType,  // customs method SNAPSHOT (prefilled; editable while Draft)
    shipments_customs_type_label: pCustomsTypeLabel,  // customs Label SNAPSHOT (中文; frozen; documents read this)
    carrier_id: pv('carrier_id'),
    rate_card_id: pRateCardId,
    currency: pv('currency'),
    status: 'draft',
    shipment_total_qty: totalQty,
    shipment_total_cartons: totalCartons,
    shipment_total_cbm: shipmentNum_(Math.round(totalCbm * 10000) / 10000),
    shipment_total_gross_weight: shipmentNum_(Math.round(totalGross * 1000) / 1000),
    shipment_total_net_weight: shipmentNum_(Math.round(totalNet * 1000) / 1000),
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
      shipment_qty: shipmentNum_(plv(lr, 'approved_qty')),
      shipment_carton_qty: shipmentNum_(planCartonQty(lr)),
      units_per_carton: shipmentNum_(plv(lr, 'units_per_carton')),
      // Logistics: COPIED from the plan line (Execution Snapshot — never recalculated).
      // shipment_carton_cbm = LINE-TOTAL CBM (plan line-total `cbm`; per-carton × cartons once as fallback).
      shipment_carton_cbm: lineCbmFor_(lr),
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

// ---- Central Shipment totals recalculation (snapshot) ----

/**
 * Recompute + persist the Shipment header snapshot totals from the shipment's OWN lines
 * (`shipment_lines`), NOT from live inventory. Canonical formulas (E):
 *   shipment_total_qty          = Σ shipment_lines.shipment_qty      (legacy `qty` read-fallback)
 *   shipment_total_cartons      = Σ shipment_lines.shipment_carton_qty (legacy `carton_qty` fallback)
 *   shipment_total_cbm          = Σ shipment_lines.shipment_carton_cbm — LINE-TOTAL summed DIRECTLY (no × cartons)
 *   shipment_total_gross_weight = Σ shipment_lines.gross_weight
 *   shipment_total_net_weight   = Σ shipment_lines.net_weight
 * shipment_carton_cbm / gross_weight / net_weight are LINE TOTALS read AS STORED and summed directly.
 * Legacy per-carton `carton_cbm` (old writer) is converted ONCE (× shipment_carton_qty) for historical
 * rows only — a compatibility read, never a rewrite. Additive column ensure; never re-creates retired
 * legacy total columns. Missing tab/row/column safe (no-op).
 */
function shipmentRecalcTotals_(ss, shipmentId) {
  var lineSheet = ss.getSheetByName('shipment_lines');
  var shipSheet = ss.getSheetByName('shipments');
  if (!lineSheet || !shipSheet) return;
  var ls = shipmentReadSheet_(lineSheet);
  var lIdCol = ls.col('shipment_id');
  if (lIdCol === -1) return;
  var qtyCol = ls.col('shipment_qty'), qtyLegacyCol = ls.col('qty');
  var ctnCol = ls.col('shipment_carton_qty'), ctnLegacyCol = ls.col('carton_qty');
  var cbmCol = ls.col('shipment_carton_cbm'), cbmLegacyCol = ls.col('carton_cbm');
  var grossCol = ls.col('gross_weight'), netCol = ls.col('net_weight');
  function fallbackNum_(row, primaryCol, legacyCol) {
    var v = (primaryCol !== -1) ? row[primaryCol] : '';
    if ((v === '' || v == null) && legacyCol !== -1) v = row[legacyCol];   // legacy read-fallback (old rows)
    return shipmentNum_(v);
  }
  var tQty = 0, tCtn = 0, tCbm = 0, tGross = 0, tNet = 0;
  for (var i = 1; i < ls.rows.length; i++) {
    if (String(ls.rows[i][lIdCol]).trim() !== String(shipmentId).trim()) continue;
    var ctn = fallbackNum_(ls.rows[i], ctnCol, ctnLegacyCol);
    tQty += fallbackNum_(ls.rows[i], qtyCol, qtyLegacyCol);
    tCtn += ctn;
    // Canonical shipment_carton_cbm = LINE-TOTAL → sum directly. If only the legacy per-carton
    // carton_cbm exists (historical row), convert ONCE (× cartons) — never treat per-carton as a total.
    var cbmVal = (cbmCol !== -1) ? ls.rows[i][cbmCol] : '';
    if (cbmVal === '' || cbmVal == null) cbmVal = shipmentNum_(cbmLegacyCol === -1 ? 0 : ls.rows[i][cbmLegacyCol]) * ctn;
    tCbm += shipmentNum_(cbmVal);
    tGross += shipmentNum_(grossCol === -1 ? 0 : ls.rows[i][grossCol]);
    tNet += shipmentNum_(netCol === -1 ? 0 : ls.rows[i][netCol]);
  }
  sheetEnsureColumns_(shipSheet, ['shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm',
    'shipment_total_gross_weight', 'shipment_total_net_weight']);
  var sh = shipmentReadSheet_(shipSheet);   // re-read AFTER ensure so new column indices resolve
  var idCol = sh.col('shipment_id');
  if (idCol === -1) return;
  var row = -1;
  for (var r = 1; r < sh.rows.length; r++) {
    if (String(sh.rows[r][idCol]).trim() === String(shipmentId).trim()) { row = r + 1; break; }
  }
  if (row === -1) return;
  function setTotal_(name, val) { var c = sh.col(name); if (c !== -1) shipSheet.getRange(row, c + 1).setValue(val); }
  setTotal_('shipment_total_qty', tQty);
  setTotal_('shipment_total_cartons', tCtn);
  setTotal_('shipment_total_cbm', shipmentNum_(Math.round(tCbm * 10000) / 10000));
  setTotal_('shipment_total_gross_weight', shipmentNum_(Math.round(tGross * 1000) / 1000));
  setTotal_('shipment_total_net_weight', shipmentNum_(Math.round(tNet * 1000) / 1000));
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

  // Auto-add columns on tabs that predate them.
  sheetEnsureColumns_(sheet, ['external_shipment_id', 'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',
    'last_mile_delivery', 'shipping_method_label', 'shipments_customs_type', 'shipments_customs_type_label', 'booking_no', 'note',
    'shipment_total_gross_weight', 'shipment_total_net_weight']);

  var s = shipmentReadSheet_(sheet);
  var idCol = s.col('shipment_id');
  if (idCol === -1) return jsonResponse_({ success: false, error: 'shipment_id column not found' });

  var targetRow = -1;
  for (var i = 1; i < s.rows.length; i++) {
    if (String(s.rows[i][idCol]).trim() === shipmentId) { targetRow = i + 1; break; }
  }
  if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId });

  var rowVals = s.rows[targetRow - 1] || [];
  function setCell(name, value) { var c = s.col(name); if (c !== -1) sheet.getRange(targetRow, c + 1).setValue(value); }
  // Merged value = body override if present, else the current row value.
  function mv(name) {
    if (body.hasOwnProperty(name) && String(body[name]).trim() !== '') return String(body[name]).trim();
    var c = s.col(name); return c === -1 ? '' : String(rowVals[c] == null ? '' : rowVals[c]).trim();
  }
  function mnum(name) { var v = parseFloat(mv(name)); return isNaN(v) ? 0 : v; }

  var newStatus = (body.hasOwnProperty('status') && String(body.status).trim() !== '') ? String(body.status).trim() : '';
  var curStatus = (function () { var c = s.col('status'); return c === -1 ? '' : String(rowVals[c] || '').trim(); })();

  var now = shipmentTimestamp_();

  // Write editable fields FIRST so the Ship gate below validates the just-saved carton numbers.
  var changed = 0;
  for (var f = 0; f < SHIPMENT_EDITABLE_FIELDS_.length; f++) {
    var fld = SHIPMENT_EDITABLE_FIELDS_[f];
    if (body.hasOwnProperty(fld)) { setCell(fld, body[fld]); changed++; }
  }

  // B — re-copy the display label from the (possibly changed) Carrier Rate Card ONLY while still Draft
  // (pre-confirmation). After Draft the snapshot is frozen and NEVER auto-resynced. `shipping_method_label`
  // is a derived snapshot, so it is not directly editable — it is recomputed here.
  if (curStatus === 'draft' &&
      (body.hasOwnProperty('rate_card_id') || body.hasOwnProperty('shipping_method') || body.hasOwnProperty('last_mile_delivery'))) {
    function curVal_(name) { var c = s.col(name); return c === -1 ? '' : String(rowVals[c] == null ? '' : rowVals[c]).trim(); }
    var uRateCardId = body.hasOwnProperty('rate_card_id') ? String(body.rate_card_id || '').trim() : curVal_('rate_card_id');
    var uShipMethod = body.hasOwnProperty('shipping_method') ? String(body.shipping_method || '').trim() : curVal_('shipping_method');
    var uLastMile = body.hasOwnProperty('last_mile_delivery') ? String(body.last_mile_delivery || '').trim() : curVal_('last_mile_delivery');
    setCell('shipping_method_label', shipmentMethodLabel_(ss, uRateCardId, '', uShipMethod, uLastMile));
    changed++;
  }

  // B (customs) — re-derive the customs Label SNAPSHOT ONLY while still Draft, when the customs enum or the
  // Rate Card changes. Mirrors shipping_method_label: the label is derived, never directly editable. After
  // Draft it is frozen and never auto-resynced. Documents read shipments_customs_type_label only.
  if (curStatus === 'draft' &&
      (body.hasOwnProperty('rate_card_id') || body.hasOwnProperty('shipments_customs_type'))) {
    function curVal2_(name) { var c = s.col(name); return c === -1 ? '' : String(rowVals[c] == null ? '' : rowVals[c]).trim(); }
    var uRateCardId2 = body.hasOwnProperty('rate_card_id') ? String(body.rate_card_id || '').trim() : curVal2_('rate_card_id');
    var uCustomsType = body.hasOwnProperty('shipments_customs_type') ? String(body.shipments_customs_type || '').trim() : curVal2_('shipments_customs_type');
    setCell('shipments_customs_type_label', shipmentCustomsTypeLabel_(ss, uRateCardId2, '', uCustomsType));
    changed++;
  }

  // Optional: update editable shipment_line fields (carton_no_start / carton_no_end — numeric).
  var linesUpdated = 0;
  if (body.lines && body.lines.length) {
    var lineSheet0 = ss.getSheetByName('shipment_lines');
    if (lineSheet0) {
      sheetEnsureColumns_(lineSheet0, ['carton_no_start', 'carton_no_end']);
      var ls0 = shipmentReadSheet_(lineSheet0);
      var lIdCol0 = ls0.col('shipment_line_id');
      var lStartCol0 = ls0.col('carton_no_start');
      var lEndCol0 = ls0.col('carton_no_end');
      var lUpdCol0 = ls0.col('updated_at');
      if (lIdCol0 !== -1) {
        var rowByLineId0 = {};
        for (var q = 1; q < ls0.rows.length; q++) rowByLineId0[String(ls0.rows[q][lIdCol0]).trim()] = q + 1;
        for (var b = 0; b < body.lines.length; b++) {
          var bl = body.lines[b] || {};
          var lid = String(bl.shipment_line_id || '').trim();
          var rowIdx = rowByLineId0[lid];
          if (!rowIdx) continue;
          function numOrBlank_(v) { if (v === '' || v == null) return ''; var n = parseInt(v, 10); return isNaN(n) ? '' : n; }
          if (bl.hasOwnProperty('carton_no_start') && lStartCol0 !== -1) lineSheet0.getRange(rowIdx, lStartCol0 + 1).setValue(numOrBlank_(bl.carton_no_start));
          if (bl.hasOwnProperty('carton_no_end') && lEndCol0 !== -1) lineSheet0.getRange(rowIdx, lEndCol0 + 1).setValue(numOrBlank_(bl.carton_no_end));
          if (lUpdCol0 !== -1) lineSheet0.getRange(rowIdx, lUpdCol0 + 1).setValue(now);
          linesUpdated++;
        }
      }
    }
  }

  // Carton-number integrity (any save/advance): integers, start<=end, no overlap within the shipment.
  var cartonCheck = shipmentValidateCartons_(ss, shipmentId, false);
  if (!cartonCheck.ok) {
    return jsonResponse_({ success: false, error: cartonCheck.error });
  }

  // Ship gate: before marking a shipment `shipped`, required execution data must be complete
  // (SHIPMENT_CENTER_SPEC §5B). Required: external_shipment_id, reference_id, warehouse_code,
  // ETD, ETA + every line has a Carton No. range (integers, non-overlapping).
  if (newStatus === 'shipped' && curStatus !== 'shipped') {
    var missing = [];
    if (!mv('external_shipment_id')) missing.push('Shipment ID (external)');
    if (!mv('reference_id')) missing.push('Reference ID');
    if (!mv('warehouse_code')) missing.push('Warehouse Code');
    if (!mv('etd')) missing.push('ETD');
    if (!mv('eta')) missing.push('ETA');
    // CANONICAL shipment_total_qty with legacy total_qty read-fallback (old rows).
    if (mnum('shipment_total_qty') <= 0 && mnum('total_qty') <= 0) missing.push('Total Qty');
    if (missing.length) {
      return jsonResponse_({ success: false, error: 'Cannot Ship — missing required fields: ' + missing.join(', ') });
    }
    var shipCarton = shipmentValidateCartons_(ss, shipmentId, true);
    if (!shipCarton.ok) {
      return jsonResponse_({ success: false, error: 'Cannot Ship — ' + shipCarton.error });
    }
  }

  // Return to Draft (Phase-2 placeholder, no permissions yet): a revision reason is appended to
  // the note history (append-only) when a Ready to Ship shipment is sent back to Draft to edit.
  if (body.hasOwnProperty('revision_reason') && String(body.revision_reason).trim()) {
    var reasonText = String(body.revision_reason).trim();
    var noteC = s.col('note');
    var existingNote = noteC === -1 ? '' : String(rowVals[noteC] == null ? '' : rowVals[noteC]).trim();
    var appended = '[RETURN TO DRAFT @' + now + ' by ' + actor + '] ' + reasonText;
    setCell('note', existingNote ? (existingNote + '\n' + appended) : appended);
    changed++;
  }

  // Status advance. Snapshot stays frozen. Marking `shipped` stamps shipped_at / shipped_by once.
  if (newStatus) {
    setCell('status', newStatus);
    changed++;
    if (newStatus === 'shipped' && curStatus !== 'shipped') {
      setCell('shipped_at', now);
      setCell('shipped_by', actor);
    }
  }

  // Done (Shipment Draft workspace): hide from the Draft page. NOT a status change; NOT a delete.
  // The shipment stays fully visible in Shipment Overview.
  if (body.hasOwnProperty('hidden_from_draft') && body.hidden_from_draft) {
    setCell('hidden_from_draft_at', now);
    setCell('hidden_from_draft_by', actor);
    changed++;
  }

  setCell('updated_by', actor);
  setCell('updated_at', now);

  // Recalculate the header snapshot totals from the shipment's lines whenever any line changed
  // (B/E). A header-only edit (no line change) is left untouched so a manual actuals override sticks.
  if (linesUpdated > 0) {
    shipmentRecalcTotals_(ss, shipmentId);
  }

  return jsonResponse_({ success: true, data: { shipment_id: shipmentId, fields_updated: changed, lines_updated: linesUpdated, status: newStatus || curStatus } });
}
