// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 22_shipment_dispatch_handlers.gs — Confirm Shipment & Dispatch orchestration (single command)
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER.
// ------------------------------------------------------------
// action `confirmShipmentAndDispatch` — the SINGLE backend command for "Confirm Shipment / 確認發貨".
// It orchestrates, under one ScriptLock, with staged-write + compensating rollback and idempotency:
//   1) validate the (draft) shipment + lines
//   2) resolve the route template (explicit id, else unique match by destination + carrier + method)
//   3) snapshot shipment_routes (one row per template node)
//   4) deduct factory_stock (current_stock) + write factory_stock_movements   (AUTHORIZED 2026-07-24)
//   5) create ONE real initial shipment_event (departed_origin) — never future/planned events
//   6) finalize the shipment: status = in_transit + actual_departure_date + shipped_at/by
// Idempotent: a second Confirm on the same shipment_id is a no-op (returns already_confirmed) — never
// double-deducts stock / double-writes route / double-writes event. NO DB schema is normalized here;
// shipment_routes is one-row-per-node (no route header, no shipment_route_node_id) per the schema audit.
// ============================================================

var CSD_MOV_TYPE_ = 'shipment_out';                 // factory_stock_movements.movement_type for dispatch
var CSD_EVENT_TYPE_ = 'departed_origin';            // the single real initial event at Confirm
var CSD_INTRANSIT_ = 'in_transit';

function csdNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function csdId_(prefix, len) { return prefix + Utilities.getUuid().replace(/-/g, '').substring(0, len || 8).toUpperCase(); }
function csdTruthy_(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || s === 'y'; }
// A date-only string N days after an ETD base (cumulative offset). '' when base/offset missing (no fabrication).
function csdOffsetDate_(baseYmd, offsetDays) {
  var b = String(baseYmd || '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!b || offsetDays === '' || offsetDays == null || isNaN(parseFloat(offsetDays))) return '';
  var ms = Date.UTC(+b[1], +b[2] - 1, +b[3]) + Math.round(parseFloat(offsetDays)) * 86400000;
  var d = new Date(ms);
  return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

function handleConfirmShipmentAndDispatch_(body) {
  body = body || {};
  var shipmentId = String(body.shipment_id || body.draft_id || '').trim();
  var actor = String(body.actor || body.updated_by || 'system_user').trim();
  var overrideTemplateId = String(body.route_template_id || '').trim();
  if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id', stage: 'input' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var shipSheet = ss.getSheetByName('shipments');
  if (!shipSheet) return jsonResponse_({ success: false, error: 'shipments sheet not found', stage: 'load' });

  // ---------- LOCK ----------
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }

  var rollback = [];   // stack of {kind:'cell'|'row', sheet, row, col, prev}
  function undoAll() {
    for (var i = rollback.length - 1; i >= 0; i--) {
      var r = rollback[i];
      try {
        if (r.kind === 'cell') r.sheet.getRange(r.row, r.col + 1).setValue(r.prev);
        else if (r.kind === 'row') r.sheet.deleteRow(r.row);
      } catch (e) { /* best-effort compensation */ }
    }
    try { SpreadsheetApp.flush(); } catch (e) {}
  }

  try {
    // ---------- LOAD shipment ----------
    sheetEnsureColumns_(shipSheet, ['status', 'shipped_at', 'shipped_by', 'actual_departure_date', 'updated_at', 'updated_by']);
    var s = shipmentReadSheet_(shipSheet);
    var idCol = s.col('shipment_id');
    if (idCol === -1) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'shipment_id column not found', stage: 'load' }); }
    var row = -1;
    for (var i = 1; i < s.rows.length; i++) { if (String(s.rows[i][idCol]).trim() === shipmentId) { row = i + 1; break; } }
    if (row === -1) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId, stage: 'load' }); }
    var rv = s.rows[row - 1];
    function sc(name) { var c = s.col(name); return c === -1 ? '' : String(rv[c] == null ? '' : rv[c]).trim(); }
    var curStatus = sc('status').toLowerCase();

    // ---------- IDEMPOTENCY: already dispatched? ----------
    var existingRoutes = csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', shipmentId);
    var existingEvents = csdEventExists_(ss, shipmentId);
    var existingMovement = csdMovementExists_(ss, shipmentId);
    if (curStatus === CSD_INTRANSIT_ || curStatus === 'arrived' || curStatus === 'received' || curStatus === 'completed' || curStatus === 'closed' || existingRoutes > 0 || existingEvents || existingMovement) {
      lock.releaseLock();
      return jsonResponse_({ success: true, already_confirmed: true, data: { shipment_id: shipmentId, status: sc('status') || curStatus, route_nodes_existing: existingRoutes, note: 'Shipment already confirmed/dispatched — no changes made (idempotent).' } });
    }

    // ---------- VALIDATE lines ----------
    var lineSheet = ss.getSheetByName('shipment_lines');
    if (!lineSheet) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'shipment_lines sheet not found', stage: 'validate' }); }
    var ls = shipmentReadSheet_(lineSheet);
    var lShip = ls.col('shipment_id'), lSku = ls.col('sku');
    var lQtyCol = ls.col('shipment_qty'); if (lQtyCol === -1) lQtyCol = ls.col('qty');
    var lines = [];
    for (var li = 1; li < ls.rows.length; li++) {
      if (String(ls.rows[li][lShip]).trim() !== shipmentId) continue;
      var sku = String(ls.rows[li][lSku] || '').trim();
      var qty = Math.round(csdNum_(ls.rows[li][lQtyCol]));
      lines.push({ sku: sku, qty: qty });
    }
    if (!lines.length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment has no lines.', stage: 'validate' }); }
    for (var lx = 0; lx < lines.length; lx++) { if (!lines[lx].sku || lines[lx].qty <= 0) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Every shipment line must have a SKU and shipped quantity > 0.', stage: 'validate' }); } }

    // ---------- VALIDATE required execution fields (mirrors the Ship gate) ----------
    var missing = [];
    if (!sc('external_shipment_id')) missing.push('Shipment ID (external)');
    if (!sc('reference_id')) missing.push('Reference ID');
    if (!sc('warehouse_code')) missing.push('Warehouse Code');
    if (!sc('carrier_id')) missing.push('Carrier');
    if (!sc('shipping_method') && !sc('shipping_method_label')) missing.push('Shipping Method');
    if (!sc('etd')) missing.push('ETD');
    if (!sc('eta')) missing.push('ETA');
    if (csdNum_(sc('shipment_total_qty')) <= 0 && csdNum_(sc('total_qty')) <= 0) missing.push('Total Qty');
    if (missing.length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Cannot Confirm — missing required fields: ' + missing.join(', '), stage: 'validate' }); }
    var cartonChk = shipmentValidateCartons_(ss, shipmentId, true);
    if (!cartonChk.ok) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Cannot Confirm — ' + cartonChk.error, stage: 'validate' }); }

    // ---------- RESOLVE route template ----------
    var tplRes = csdResolveTemplate_(ss, sc, overrideTemplateId);
    if (!tplRes.ok) { lock.releaseLock(); return jsonResponse_({ success: false, error: tplRes.error, stage: 'route_template' }); }
    var templateId = tplRes.templateId;
    var tplNodes = csdTemplateNodes_(ss, templateId);
    if (tplNodes.length < 2) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Route Template "' + templateId + '" needs at least a start and end node (found ' + tplNodes.length + ').', stage: 'route_template' }); }

    // ---------- VALIDATE factory stock sufficiency (per SKU) BEFORE any write ----------
    var stockSheet = ss.getSheetByName('factory_stock');
    if (!stockSheet) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'factory_stock sheet not found', stage: 'stock' }); }
    var stk = csdLoadFactoryStock_(stockSheet);   // {rows, headers, curCol, resCol, whCol, skuCol, sheet}
    var needBySku = {}; lines.forEach(function (l) { needBySku[l.sku] = (needBySku[l.sku] || 0) + l.qty; });
    var deductPlan = [];  // [{rowIdx, sku, warehouseId, beforeCurrent, beforeReserved, take}]
    var stockErrors = [];
    Object.keys(needBySku).forEach(function (sku) {
      var need = needBySku[sku];
      var cand = stk.rows.filter(function (rr) { return String(rr.vals[stk.skuCol] || '').trim() === sku; })
        .sort(function (a, b) { return String(a.vals[stk.whCol]).localeCompare(String(b.vals[stk.whCol])); });
      var avail = cand.reduce(function (a, rr) { return a + Math.max(0, Math.round(csdNum_(rr.vals[stk.curCol]))); }, 0);
      if (avail < need) { stockErrors.push(sku + ' (need ' + need + ', available ' + avail + ')'); return; }
      var remaining = need;
      for (var ci = 0; ci < cand.length && remaining > 0; ci++) {
        var cur = Math.max(0, Math.round(csdNum_(cand[ci].vals[stk.curCol])));
        if (cur <= 0) continue;
        var take = Math.min(cur, remaining);
        deductPlan.push({ rowIdx: cand[ci].rowIdx, sku: sku, warehouseId: String(cand[ci].vals[stk.whCol]).trim(), beforeCurrent: Math.round(csdNum_(cand[ci].vals[stk.curCol])), beforeReserved: Math.round(csdNum_(cand[ci].vals[stk.resCol])), take: take });
        remaining -= take;
      }
    });
    if (stockErrors.length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Insufficient factory stock for: ' + stockErrors.join('; ') + '. No stock was deducted.', stage: 'stock' }); }

    // ============ ALL VALIDATION PASSED — begin staged writes ============
    var now = shipmentTimestamp_();
    var today = shipmentToday_();

    // 1) Factory stock deduction (current_stock) + movements.
    var MOV_HEADERS = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty', 'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
    var movSheet = fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV_HEADERS);
    fcWriteEnsureColumns_(movSheet, MOV_HEADERS);
    var movementsCreated = 0;
    deductPlan.forEach(function (d) {
      var afterCurrent = d.beforeCurrent - d.take;
      // update the factory_stock current cell (reserved untouched)
      var prev = stk.sheet.getRange(d.rowIdx, stk.curCol + 1).getValue();
      stk.sheet.getRange(d.rowIdx, stk.curCol + 1).setValue(afterCurrent);
      rollback.push({ kind: 'cell', sheet: stk.sheet, row: d.rowIdx, col: stk.curCol, prev: prev });
      SpreadsheetApp.flush();
      fcWriteAppendByHeader_(movSheet, {
        factory_stock_movement_id: csdId_('FSMV-', 8), movement_date: today, sku: d.sku, warehouse_id: d.warehouseId,
        movement_type: CSD_MOV_TYPE_, qty: -d.take, related_entity_type: 'shipment', related_entity_id: shipmentId,
        before_current_stock: d.beforeCurrent, after_current_stock: afterCurrent, before_reserved_stock: d.beforeReserved, after_reserved_stock: d.beforeReserved,
        note: 'Shipment dispatch deduction', created_by: actor, created_at: now
      });
      rollback.push({ kind: 'row', sheet: movSheet, row: movSheet.getLastRow() });
      movementsCreated++;
    });

    // 2) shipment_routes snapshot (one row per template node).
    var ROUTE_HEADERS = ['shipment_route_id', 'shipment_id', 'route_template_id', 'route_template_node_id', 'sequence_no', 'node_type', 'node_code', 'location_ref_type', 'location_ref_id', 'location_name', 'country', 'region', 'city', 'latitude', 'longitude', 'transport_mode', 'planned_event_type', 'planned_arrival_date', 'planned_departure_date', 'actual_arrival_date', 'actual_departure_date', 'status', 'created_at', 'updated_at'];
    var routeSheet = fcWriteEnsureSheet_(ss, 'shipment_routes', ROUTE_HEADERS);
    fcWriteEnsureColumns_(routeSheet, ROUTE_HEADERS);
    var etd = sc('etd');
    var routeIdByOrigin = null, originNode = null;
    var routeNodesCreated = 0;
    for (var ni = 0; ni < tplNodes.length; ni++) {
      var tn = tplNodes[ni];
      var status = (tplNodes.length === 1) ? 'current' : (ni === 0 ? 'completed' : (ni === 1 ? 'current' : 'planned'));
      var srid = csdId_('SRN-', 8);
      var lat = (tn.latitude === '' || tn.latitude == null) ? '' : (isNaN(parseFloat(tn.latitude)) ? '' : parseFloat(tn.latitude));
      var lng = (tn.longitude === '' || tn.longitude == null) ? '' : (isNaN(parseFloat(tn.longitude)) ? '' : parseFloat(tn.longitude));
      if ((lat === '' ) !== (lng === '')) { lat = ''; lng = ''; }   // both-or-neither (never 0,0)
      fcWriteAppendByHeader_(routeSheet, {
        shipment_route_id: srid, shipment_id: shipmentId, route_template_id: templateId, route_template_node_id: tn.nodeId,
        sequence_no: tn.seq, node_type: tn.nodeType, node_code: tn.nodeCode,
        location_ref_type: tn.logisticsLocationId ? 'logistics_location' : '', location_ref_id: tn.logisticsLocationId || '',
        location_name: tn.locationName, country: tn.country, region: tn.region, city: tn.city, latitude: lat, longitude: lng,
        transport_mode: tn.transportMode, planned_event_type: tn.plannedEventType,
        planned_arrival_date: csdOffsetDate_(etd, tn.offsetDays), planned_departure_date: '',
        actual_arrival_date: (ni === 0 ? today : ''), actual_departure_date: (ni === 0 ? today : ''),
        status: status, created_at: now, updated_at: now
      });
      rollback.push({ kind: 'row', sheet: routeSheet, row: routeSheet.getLastRow() });
      routeNodesCreated++;
      if (ni === 0) { originNode = tn; routeIdByOrigin = srid; }
    }

    // 3) ONE real initial shipment_event (departed_origin at origin). No future/planned events.
    var EVENT_HEADERS = ['shipment_event_id', 'shipment_id', 'shipment_route_id', 'event_sequence', 'event_time', 'event_type', 'event_status', 'location_name', 'country', 'city', 'latitude', 'longitude', 'source', 'source_event_id', 'raw_status', 'note', 'created_by', 'created_at', 'updated_by', 'updated_at'];
    var eventSheet = fcWriteEnsureSheet_(ss, 'shipment_events', EVENT_HEADERS);
    fcWriteEnsureColumns_(eventSheet, EVENT_HEADERS);
    var oLat = originNode && originNode.latitude !== '' && originNode.latitude != null && !isNaN(parseFloat(originNode.latitude)) ? parseFloat(originNode.latitude) : '';
    var oLng = originNode && originNode.longitude !== '' && originNode.longitude != null && !isNaN(parseFloat(originNode.longitude)) ? parseFloat(originNode.longitude) : '';
    if ((oLat === '') !== (oLng === '')) { oLat = ''; oLng = ''; }
    fcWriteAppendByHeader_(eventSheet, {
      shipment_event_id: csdId_('SEV-', 8), shipment_id: shipmentId, shipment_route_id: routeIdByOrigin,
      event_sequence: 1, event_time: now, event_type: CSD_EVENT_TYPE_, event_status: 'completed',
      location_name: (originNode && originNode.locationName) || sc('ship_from'), country: (originNode && originNode.country) || '', city: (originNode && originNode.city) || '',
      latitude: oLat, longitude: oLng, source: 'system', source_event_id: 'confirm:' + shipmentId,
      raw_status: 'SHIPMENT CONFIRMED / DEPARTED ORIGIN', note: 'Initial event created by Confirm Shipment.',
      created_by: actor, created_at: now, updated_by: actor, updated_at: now
    });
    rollback.push({ kind: 'row', sheet: eventSheet, row: eventSheet.getLastRow() });

    // 4) Finalize the shipment (status = in_transit; canonical shipped_at / actual_departure_date).
    var prevStatus = s.col('status') === -1 ? '' : rv[s.col('status')];
    var prevShippedAt = s.col('shipped_at') === -1 ? '' : rv[s.col('shipped_at')];
    var prevShippedBy = s.col('shipped_by') === -1 ? '' : rv[s.col('shipped_by')];
    var prevActDep = s.col('actual_departure_date') === -1 ? '' : rv[s.col('actual_departure_date')];
    function setShip(name, val, prev) { var c = s.col(name); if (c !== -1) { shipSheet.getRange(row, c + 1).setValue(val); rollback.push({ kind: 'cell', sheet: shipSheet, row: row, col: c, prev: prev }); } }
    setShip('status', CSD_INTRANSIT_, prevStatus);
    if (!String(prevShippedAt || '').trim()) { setShip('shipped_at', now, prevShippedAt); setShip('shipped_by', actor, prevShippedBy); }
    if (!String(prevActDep || '').trim()) setShip('actual_departure_date', today, prevActDep);
    var uc = s.col('updated_at'); if (uc !== -1) shipSheet.getRange(row, uc + 1).setValue(now);
    var ub = s.col('updated_by'); if (ub !== -1) shipSheet.getRange(row, ub + 1).setValue(actor);
    SpreadsheetApp.flush();

    lock.releaseLock();
    return jsonResponse_({
      success: true,
      data: {
        shipment_id: shipmentId, status: CSD_INTRANSIT_, route_template_id: templateId,
        route_nodes_created: routeNodesCreated, events_created: 1, stock_movements_created: movementsCreated,
        actual_departure_date: today, warnings: tplRes.warnings || []
      }
    });
  } catch (err) {
    undoAll();
    try { lock.releaseLock(); } catch (e) {}
    return jsonResponse_({ success: false, error: 'Confirm Shipment failed and was rolled back: ' + (err && err.message ? err.message : err), stage: 'write_rolled_back', shipment_id: shipmentId });
  }
}

// ---- helpers ----
function csdCountRowsFor_(ss, sheetName, keyCol, keyVal) {
  var sh = ss.getSheetByName(sheetName); if (!sh) return 0;
  var d = sh.getDataRange().getValues(); if (d.length < 2) return 0;
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var c = h.indexOf(keyCol); if (c === -1) return 0;
  var n = 0; for (var i = 1; i < d.length; i++) { if (String(d[i][c]).trim() === keyVal) n++; } return n;
}
function csdEventExists_(ss, shipmentId) {
  var sh = ss.getSheetByName('shipment_events'); if (!sh) return false;
  var d = sh.getDataRange().getValues(); if (d.length < 2) return false;
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var sidc = h.indexOf('source_event_id'), shc = h.indexOf('shipment_id');
  for (var i = 1; i < d.length; i++) {
    if (sidc !== -1 && String(d[i][sidc]).trim() === ('confirm:' + shipmentId)) return true;
    if (shc !== -1 && String(d[i][shc]).trim() === shipmentId) return true;
  }
  return false;
}
function csdMovementExists_(ss, shipmentId) {
  var sh = ss.getSheetByName('factory_stock_movements'); if (!sh) return false;
  var d = sh.getDataRange().getValues(); if (d.length < 2) return false;
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var tc = h.indexOf('related_entity_type'), ic = h.indexOf('related_entity_id');
  if (tc === -1 || ic === -1) return false;
  for (var i = 1; i < d.length; i++) { if (String(d[i][tc]).trim() === 'shipment' && String(d[i][ic]).trim() === shipmentId) return true; }
  return false;
}
// Resolve the route template: explicit id (validated) OR unique active match by destination_country +
// carrier_id, narrowed by last_mile_delivery / transit_type when present. 0 or >1 → error.
function csdResolveTemplate_(ss, sc, overrideId) {
  var sh = ss.getSheetByName('shipment_route_templates');
  if (!sh) return { ok: false, error: 'shipment_route_templates sheet not found — cannot resolve a route.' };
  var d = sh.getDataRange().getValues(); if (d.length < 2) return { ok: false, error: 'No route templates exist to resolve.' };
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  function c(n) { return h.indexOf(n); }
  var idc = c('route_template_id'), dcc = c('destination_country'), carc = c('carrier_id'), tt = c('transit_type'), lm = c('last_mile_delivery'), act = c('is_active');
  var rows = [];
  for (var i = 1; i < d.length; i++) { rows.push(d[i]); }
  if (overrideId) {
    var hit = rows.filter(function (r) { return String(r[idc]).trim() === overrideId; });
    if (!hit.length) return { ok: false, error: 'route_template_id "' + overrideId + '" not found.' };
    return { ok: true, templateId: overrideId, warnings: [] };
  }
  var destCountry = sc('country'), carrier = sc('carrier_id'), method = (sc('shipping_method') || '').toLowerCase(), lastMile = (sc('last_mile_delivery') || '').toLowerCase();
  var cand = rows.filter(function (r) {
    if (act !== -1 && String(r[act]).trim() && !csdTruthy_(r[act])) return false;
    if (dcc !== -1 && destCountry && String(r[dcc]).trim().toUpperCase() !== destCountry.toUpperCase()) return false;
    if (carc !== -1 && carrier && String(r[carc]).trim() && String(r[carc]).trim().toUpperCase() !== carrier.toUpperCase()) return false;
    return true;
  });
  if (cand.length > 1 && lm !== -1 && lastMile) { var n1 = cand.filter(function (r) { return String(r[lm]).trim().toLowerCase() === lastMile; }); if (n1.length) cand = n1; }
  if (cand.length > 1 && tt !== -1 && method) { var n2 = cand.filter(function (r) { return String(r[tt]).trim().toLowerCase() === method || method.indexOf(String(r[tt]).trim().toLowerCase()) >= 0; }); if (n2.length) cand = n2; }
  if (cand.length === 0) return { ok: false, error: 'No active route template matches destination "' + destCountry + '" + carrier "' + carrier + '" + method. Select a Route Template explicitly.' };
  if (cand.length > 1) return { ok: false, error: 'Multiple route templates match (' + cand.length + ') — please specify route_template_id.' };
  return { ok: true, templateId: String(cand[0][idc]).trim(), warnings: [] };
}
function csdTemplateNodes_(ss, templateId) {
  var sh = ss.getSheetByName('shipment_route_template_nodes'); if (!sh) return [];
  var d = sh.getDataRange().getValues(); if (d.length < 2) return [];
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  function c(n) { return h.indexOf(n); }
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (String(d[i][c('route_template_id')]).trim() !== templateId) continue;
    out.push({
      nodeId: String(d[i][c('route_template_node_id')] || '').trim(), seq: Math.round(csdNum_(d[i][c('node_sequence')])),
      nodeType: String(d[i][c('node_type')] || '').trim(), nodeCode: String(d[i][c('node_code')] || '').trim(),
      country: String(d[i][c('country')] || '').trim(), region: c('region') === -1 ? '' : String(d[i][c('region')] || '').trim(), city: String(d[i][c('city')] || '').trim(),
      latitude: c('latitude') === -1 ? '' : d[i][c('latitude')], longitude: c('longitude') === -1 ? '' : d[i][c('longitude')],
      locationName: (c('node_name') !== -1 ? String(d[i][c('node_name')] || '').trim() : '') || String(d[i][c('node_code')] || '').trim(),
      plannedEventType: c('planned_event_type') === -1 ? '' : String(d[i][c('planned_event_type')] || '').trim(),
      offsetDays: c('default_offset_days') === -1 ? '' : d[i][c('default_offset_days')],
      transportMode: c('transport_mode_to_next') === -1 ? '' : String(d[i][c('transport_mode_to_next')] || '').trim(),
      logisticsLocationId: c('logistics_location_id') === -1 ? '' : String(d[i][c('logistics_location_id')] || '').trim()
    });
  }
  out.sort(function (a, b) { return a.seq - b.seq; });
  return out;
}
function csdLoadFactoryStock_(stockSheet) {
  var d = stockSheet.getDataRange().getValues();
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var curCol = h.indexOf('fac_current_stock'); if (curCol === -1) curCol = h.indexOf('current_stock');
  var resCol = h.indexOf('fac_reserved_stock'); if (resCol === -1) resCol = h.indexOf('reserved_stock');
  var rows = [];
  for (var i = 1; i < d.length; i++) rows.push({ rowIdx: i + 1, vals: d[i] });
  return { sheet: stockSheet, rows: rows, headers: h, curCol: curCol, resCol: resCol, whCol: h.indexOf('warehouse_id'), skuCol: h.indexOf('sku') };
}
