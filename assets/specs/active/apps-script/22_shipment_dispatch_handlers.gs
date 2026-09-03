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
//   5) create ONE real initial shipment_event (shipment_confirmed) — never future/planned events
//   6) finalize the shipment: status = shipped + shipped_at/by
//
// F1-7N-FB-1 LIFECYCLE CORRECTION. Confirm Shipment previously meant "physically departed": it set
// status = in_transit and wrote a `departed_origin` event. Those are two DIFFERENT business facts, and the
// frozen model separates them:
//   Confirm Shipment  -> status = shipped   + event `shipment_confirmed`  (formal hand-over, map-visible)
//   first real progress beyond the origin -> status = in_transit (event-derived, 31_shipPromoteOnProgress_)
// `departed_origin` is therefore NO LONGER written as a confirmation marker — overloading it with two
// meanings is exactly what made the manual "Advance -> In Transit" button necessary. `received` remains
// owned solely by the formal receiving/inventory workflow (31_), never by map progress.
// Idempotent: a second Confirm on the same shipment_id is a no-op (returns already_confirmed) — never
// double-deducts stock / double-writes route / double-writes event. NO DB schema is normalized here;
// shipment_routes is one-row-per-node (no route header, no shipment_route_node_id) per the schema audit.
// ============================================================

// F1-7N-FC-1A §F — STOCK MUTATION IS NO LONGER IMPLEMENTED HERE.
//
// Step 4 below used to be this file's OWN factory_stock writer: an inline setValue(afterCurrent) plus its own
// fcWriteAppendByHeader_ movement append, with its own compensating rollback. That made TWO stock-mutation
// implementations in the repository while 21_'s comment claimed there was one, which is exactly the condition
// the FC-0A audit measured and this round closes. Dispatch now calls factoryStockApplyDeltaTx_ (21_), the same
// primitive PO receipt and Factory Inventory Adjustment call, and it passes BOTH deltas in ONE call so the
// current-stock deduction and the reservation release land in a SINGLE movement row that cannot half-apply.
// 21_'s journal entries are the same {kind:'cell'|'row'} shape as this file's `rollback` stack, so the shared
// core's writes unwind through the SAME compensation path as everything else here.
// F1-7N-FC-1A §J DEPLOYMENT STAMP, AND THE WORST PARTIAL SYNC IN THIS ROUND.
//
// A 22_ one round behind still works. It answers the action, it deducts the stock, it writes its movement, it
// returns success — using its own OLD inline implementation, which knows nothing about reservations and
// therefore never RELEASES one. Every dispatch would then leave its reservation held forever: available stock
// would drift permanently downward, and the only visible symptom would be shipments refused for insufficient
// stock that is physically present. Nothing except a declared build can distinguish that from a healthy
// deployment, which is why this stamp exists and is registered in 63_'s module manifest.
var CSD_BUILD_VERSION_ = 'F1-7N-FC-1A';
var CSD_MOV_TYPE_ = 'shipment_out';                 // factory_stock_movements.movement_type for dispatch
// F1-7N-FB-1 — the confirmation lifecycle event. Distinct from `departed_origin` (physical departure) so the
// two facts can never be conflated. Registered in the canonical vocabulary alongside the existing types.
var CSD_EVENT_TYPE_ = 'shipment_confirmed';         // the single real initial event at Confirm
var CSD_CONFIRMED_STATUS_ = 'shipped';              // Confirm ends at `shipped` — NEVER in_transit
var CSD_INTRANSIT_ = 'in_transit';                  // reached only by event-derived promotion (31_)

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

  // ---------- F1-7N-FB-1B (D1) PRE-DISPATCH DOCUMENT READINESS GATE ----------
  // Deterministic, knowable-in-advance document failures BLOCK the transition. Run BEFORE the lock because it
  // is strictly read-only (39_/38_ resolution + non-mutating Drive probes: it opens configured identities and
  // reads their metadata, and creates NO folder, NO probe file and NO copy). A BLOCKED verdict leaves the
  // shipment at ready_to_ship with a blank shipped_at and nothing else touched.
  // What it can prove here is identity + template configuration + Drive reachability. Per-field completeness
  // against the finalized snapshot is genuinely a POST-dispatch fact (the snapshot needs EXECUTED allocations),
  // which is why a field failure is a recoverable D2 document failure and never an un-shipping event.
  // There is deliberately NO bypass parameter: the gate is a hard precondition, so no caller can opt out of it.
  // A readiness check that itself fails is treated as BLOCKED, never as permission to proceed.
  var docGate;
  try { docGate = dgsShipmentReadiness_(ss, shipmentId, {}); }
  catch (eg) { docGate = { ok: false, status: 'BLOCKED', reason: 'DOCUMENT_READINESS_CHECK_FAILED', blockers: [{ reason: 'DOCUMENT_READINESS_CHECK_FAILED', message: (eg && eg.message ? String(eg.message) : String(eg)) }] }; }
  if (!docGate.ok) {
    return jsonResponse_({
      success: false, stage: 'document_readiness', shipment_id: shipmentId,
      error: 'Cannot Confirm — required shipment documents are not ready.',
      document_readiness: docGate, blockers: docGate.blockers,
      note: 'The shipment remains ready_to_ship and shipped_at is blank. Nothing was written and no Drive folder or file was created.'
    });
  }

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

    // ---------- F1-7N-FC-1A-R1 §J — A CANCELLED SHIPMENT IS NOT DISPATCHABLE. ----------
    //
    // The already-confirmed guard below lists the POST-DISPATCH statuses, and `cancelled` is correctly absent
    // from it: a cancellation is not a confirmation. But that meant a cancelled draft fell through every guard
    // and DEDUCTED FACTORY STOCK — for a shipment whose reservation had already been released and whose
    // units another site may already have reserved. Measured before this guard existed: current 1000 -> 200 on
    // a cancelled shipment, with a shipment_out movement to match.
    //
    // This is a REFUSAL rather than an idempotent success, and the distinction matters: answering
    // `already_confirmed` for a cancelled shipment would tell the operator it shipped.
    if (curStatus === 'cancelled') {
      lock.releaseLock();
      return jsonResponse_({ success: false, code: 'SHIPMENT_CANCELLED', stage: 'load', shipment_id: shipmentId,
        error: 'Cannot Confirm: this Shipment Draft was cancelled. Its factory stock reservation has already ' +
          'been released and the units may now be committed elsewhere. Nothing was written. Create a new ' +
          'Shipment Draft from the approved plan instead.' });
    }

    // ---------- IDEMPOTENCY: already dispatched? ----------
    var existingRoutes = csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', shipmentId);
    var existingEvents = csdEventExists_(ss, shipmentId);
    var existingMovement = csdMovementExists_(ss, shipmentId);
    // F1-7N-FB-1: Confirm now ends at `shipped`, so `shipped` joins the already-confirmed guard. The route/
    // event/movement checks below already covered it, but the status check must be explicit, not incidental.
    if (curStatus === CSD_CONFIRMED_STATUS_ || curStatus === CSD_INTRANSIT_ || curStatus === 'arrived' || curStatus === 'received' || curStatus === 'completed' || curStatus === 'closed' || existingRoutes > 0 || existingEvents || existingMovement) {
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
    if (!sc('shipping_method')) missing.push('Shipping Method');   // CODE only (shipping_method_label retired 2026-07-28)
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

    // ---------- F1-5B-SHIP-R3B — VALIDATE + PLAN canonical PO allocation execution (before any write) ----------
    // Reuses the ONE R3A allocation authority (32_) — no second FIFO here. Fail closed (no partial dispatch): every
    // qty>0 shipment line must have a draft allocation set summing to shipment_qty; capacity is revalidated inside
    // this lock; legacy shipped_qty drift is surfaced, never guessed. shipped_qty is reconciled (never incremented).
    var slaPlan = slaPrepareExecution_(ss, shipmentId);
    if (!slaPlan.ok) { lock.releaseLock(); return jsonResponse_({ success: false, error: slaPlan.error, stage: 'po_allocation', detail: slaPlan.detail || null, shipment_id: shipmentId }); }

    // ============ ALL VALIDATION PA§ED — begin staged writes ============
    var now = shipmentTimestamp_();
    var today = shipmentToday_();

    // 1) Factory stock deduction (current_stock) + movements.
    var MOV_HEADERS = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty', 'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
    var movSheet = fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV_HEADERS);
    fcWriteEnsureColumns_(movSheet, MOV_HEADERS);
    var movementsCreated = 0;
    var reservationReleased = 0;
    // THIS SHIPMENT's own reservation ledger, read ONCE inside the lock. A dispatch releases only what it
    // itself reserved at Shipment Draft creation, per (warehouse_id, sku), so it can never release another
    // shipment's hold and can never drive fac_reserved_stock negative.
    var heldByKey = factoryStockOwnerReservedTx_(movSheet, FSTX_RESERVATION_OWNER_TYPE_, shipmentId);
    deductPlan.forEach(function (d) {
      var key = d.warehouseId + '||' + d.sku;
      var held = Math.max(0, Math.round(heldByKey[key] || 0));
      var give = Math.min(held, d.take);       // release at most what is actually held here
      heldByKey[key] = held - give;            // so two rows for the same key cannot release it twice
      // ONE call, ONE movement row: current -= take AND reserved -= give together. Writing them as two
      // separate facts is what would allow a dispatch to deduct the units while keeping them reserved.
      factoryStockApplyDeltaTx_({
        stockSheet: stk.sheet, movSheet: movSheet, warehouseId: d.warehouseId, sku: d.sku,
        deltaQty: -d.take, reservedDelta: -give, journal: rollback, now: now, movementDate: today,
        movementType: CSD_MOV_TYPE_, relatedEntityType: 'shipment', relatedEntityId: shipmentId,
        note: 'Shipment dispatch deduction' + (give > 0 ? (' | reservation released ' + give) : ''),
        createdBy: actor
      });
      reservationReleased += give;
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

    // 4) Finalize the shipment. F1-7N-FB-1: status = `shipped` (formal hand-over), NOT in_transit.
    //    shipped_at is stamped ONCE and is thereafter immutable — it is the sole source of the document
    //    folder's yyyyMMdd, so a later retry must reuse the original date. actual_departure_date is NOT set
    //    here any more: Confirm no longer asserts physical departure. It is stamped by the first real
    //    progress event (31_), which is also what promotes the shipment to in_transit.
    var prevStatus = s.col('status') === -1 ? '' : rv[s.col('status')];
    var prevShippedAt = s.col('shipped_at') === -1 ? '' : rv[s.col('shipped_at')];
    var prevShippedBy = s.col('shipped_by') === -1 ? '' : rv[s.col('shipped_by')];
    var prevActDep = s.col('actual_departure_date') === -1 ? '' : rv[s.col('actual_departure_date')];
    function setShip(name, val, prev) { var c = s.col(name); if (c !== -1) { shipSheet.getRange(row, c + 1).setValue(val); rollback.push({ kind: 'cell', sheet: shipSheet, row: row, col: c, prev: prev }); } }
    setShip('status', CSD_CONFIRMED_STATUS_, prevStatus);
    if (!String(prevShippedAt || '').trim()) { setShip('shipped_at', now, prevShippedAt); setShip('shipped_by', actor, prevShippedBy); }
    var uc = s.col('updated_at'); if (uc !== -1) shipSheet.getRange(row, uc + 1).setValue(now);
    var ub = s.col('updated_by'); if (ub !== -1) shipSheet.getRange(row, ub + 1).setValue(actor);
    SpreadsheetApp.flush();

    // 5) F1-5B-SHIP-R3B — EXECUTE PO allocations (draft → executed) + reconcile purchase_order_lines.shipped_qty /
    // remaining_qty, under the SAME rollback stack (all-or-nothing with factory stock + shipment lifecycle §6).
    var slaExec = slaApplyExecution_(ss, slaPlan, actor, now, rollback);
    SpreadsheetApp.flush();

    lock.releaseLock();

    // ---------- F1-7N-FB-1B (D2) POST-DISPATCH DOCUMENT ORCHESTRATION ----------
    // The physical dispatch is COMMITTED and the lock is RELEASED before any Drive work begins, so slow
    // rendering can never hold the global lock and an Apps Script timeout can never strand a half-applied
    // transaction. The final snapshot is finalized here (once, idempotently, by the existing 34_ owner) because
    // it needs the allocations that were just EXECUTED above; documents are then rendered from it.
    // A failure here is recoverable, never reversible: the shipment stays `shipped`, shipped_at keeps the value
    // just written, and stock/allocation/route/event results stay truthful. The failure is recorded as a
    // retryable generated_documents row and surfaced to the user as a retry prompt.
    var shippedAtFinal = String(prevShippedAt || '').trim() || now;
    var docResult = { ok: false, reason: 'NOT_ATTEMPTED' };
    try { docResult = dgsGenerateShipmentDocuments_(ss, shipmentId, actor, {}); }
    catch (ed) { docResult = { ok: false, reason: 'DOCUMENT_GENERATION_FAILED', message: (ed && ed.message ? String(ed.message) : String(ed)) }; }

    return jsonResponse_({
      success: true,
      data: {
        shipment_id: shipmentId, status: CSD_CONFIRMED_STATUS_, route_template_id: templateId,
        route_nodes_created: routeNodesCreated, events_created: 1, stock_movements_created: movementsCreated,
        factory_reservation_released: reservationReleased,
        po_allocations_executed: slaExec.executed_allocations, po_lines_reconciled: slaExec.reconciled_po_lines,
        shipped_at: shippedAtFinal,
        // F1-7N-FB-1B (D2) — the shipment transaction is COMMITTED at this point. Document generation is a
        // trailing, separately retryable concern: a Drive/render failure reports a document status and NEVER
        // rolls the confirmed shipment back. The UI must not claim files exist until the registry says so.
        document_generation: {
          status: docResult.ok ? 'READY' : 'RETRY_REQUIRED',
          registry: 'generated_documents', retry_safe: true,
          expected: docResult.expected || 0, generated: docResult.generated || 0, reused: docResult.reused || 0,
          failed: docResult.failed || 0, configuration_required: docResult.configuration_required || 0,
          folder_url: docResult.folder_url || '', folder_name: docResult.folder_name || '',
          destination_bucket: docResult.destination_bucket || '', reason: docResult.ok ? '' : (docResult.reason || ''),
          results: docResult.results || [],
          message: docResult.ok ? '' : 'Shipment was confirmed successfully, but one or more documents were not generated. The shipment remains Shipped. Retry document generation.'
        },
        document_readiness: docGate ? { status: docGate.status, manifest: docGate.manifest } : null,
        warnings: tplRes.warnings || []
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
// F1-7N-FC-1A §E THE MOVEMENT TYPE IS PART OF THIS QUESTION, AND LEAVING IT OUT BROKE EVERYTHING.
//
// This guard asks "has this shipment already been dispatched?" and used to answer yes for ANY
// factory_stock_movements row referencing the shipment. That was harmless while the only shipment-owned
// movement type was shipment_out. It stopped being harmless the moment reservations became real: from
// FC-1A onward EVERY reserved shipment carries a reservation_acquire row referencing itself from the
// instant its Shipment Draft is created. So every reserved shipment reported already_confirmed and could
// NEVER be confirmed — nothing would ship at all.
//
// The fix is to ask the question that was always meant: is there a DEDUCTION for this shipment? A
// reservation is a claim on units; only shipment_out is evidence they left.
function csdMovementExists_(ss, shipmentId) {
  var sh = ss.getSheetByName('factory_stock_movements'); if (!sh) return false;
  var d = sh.getDataRange().getValues(); if (d.length < 2) return false;
  var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
  var tc = h.indexOf('related_entity_type'), ic = h.indexOf('related_entity_id'), mc = h.indexOf('movement_type');
  if (tc === -1 || ic === -1) return false;
  for (var i = 1; i < d.length; i++) {
    if (String(d[i][tc]).trim() !== 'shipment') continue;
    if (String(d[i][ic]).trim() !== shipmentId) continue;
    // A deployment whose movements tab predates the movement_type column cannot distinguish the two, and
    // there the OLD behaviour is still the safe one: treat any shipment-owned movement as a dispatch rather
    // than risk a double deduction.
    if (mc === -1) return true;
    if (String(d[i][mc]).trim() === CSD_MOV_TYPE_) return true;
  }
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
