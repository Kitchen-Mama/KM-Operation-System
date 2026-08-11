// ============================================================
// Kitchen Mama Operation System — Apps Script (modularized source mirror)
// 31_shipment_receipt_route_handlers.gs — Shipment Receipt + Route-Progress backend (F1-SHIPMENT-RECEIPT-R1B)
// NOTE: All .gs files in this folder share ONE global scope. Copy them into the project TOGETHER. No imports.
// ------------------------------------------------------------
// This module adds TWO canonical shipment mutation owners on top of the existing shipment writer (12_):
//
//   action `shipment.receipt.update`  → handleUpdateShipmentReceipt_
//       CUMULATIVE receipt against the LIVE column shipment_lines.shipment_received_qty.
//       shipment_qty is IMMUTABLE. remaining_qty = max(shipment_qty - shipment_received_qty, 0) is
//       runtime-derived and NEVER persisted. Monotonic (no decrease), no over-receipt, delta-based,
//       validate-ALL-before-write under one ScriptLock. After persisting, shipments.status is
//       BACKEND-DERIVED (partially_received / received) — the frontend can NEVER author receipt status.
//
//   action `shipment.route.advance`   → handleAdvanceShipmentRoutePoint_
//       The current route point is owned by shipment_routes node statuses (completed | current | planned).
//       There is NO shipments.current_route_node_id — this is the single current-position authority.
//       Forward-only (backward fails closed; no correction owner invented). Moving to the already-current
//       node is an idempotent no-op. After a successful advance EXACTLY ONE node is `current`.
//
// Reuses 12_ helpers (shared scope): shipmentReadSheet_ / shipmentTimestamp_ / shipmentNum_ /
// jsonResponse_ / sheetEnsureColumns_. NO new table, NO schema change (shipment_received_qty already
// exists live), NO inventory posting, NO second shipments CRUD writer (only the derived status cell is set).
// ============================================================

// ---- receipt status vocabulary (Phase-1 freeze, lowercase DB values) ----
var SHIP_RECEIPT_PARTIAL_ = 'partially_received';   // some received, but not every line fully received
var SHIP_RECEIPT_FULL_ = 'received';                // every line: shipment_received_qty == shipment_qty
// `completed` is RESERVED for a future broader closure state and is NEVER used as a synonym for `received`.
// `delivered` semantics are preserved as-is (not reinterpreted here).

// __SHIP_RECEIPT_PURE_START__  (extracted + eval'd verbatim by the R1B test; keep dependency-free / no I/O)

// Numeric coercion for receipt math: blank / null / non-finite → 0 (historical-row normalization).
function shipReceiptNum_(v) {
  if (v === '' || v == null) return 0;
  var n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

// Validate ONE cumulative receipt against its persisted value + shipped qty. Returns { ok, code, delta }.
//   requested not a finite number      → INVALID_QTY
//   requested < previously received     → RECEIPT_BACKWARD (monotonic; fail closed, no reversal owner)
//   requested > shipment_qty            → RECEIPT_OVER
//   otherwise ok, delta = requested - old (0 = idempotent no-op).
function shipReceiptValidateLine_(oldReceived, requested, shippedQty) {
  var reqRaw = parseFloat(requested);
  if (!isFinite(reqRaw)) return { ok: false, code: 'INVALID_QTY', delta: 0 };
  var old = shipReceiptNum_(oldReceived);
  var shipped = shipReceiptNum_(shippedQty);
  if (reqRaw < 0) return { ok: false, code: 'INVALID_QTY', delta: 0 };
  if (reqRaw < old) return { ok: false, code: 'RECEIPT_BACKWARD', delta: reqRaw - old };
  if (reqRaw > shipped) return { ok: false, code: 'RECEIPT_OVER', delta: reqRaw - old };
  return { ok: true, code: 'OK', delta: reqRaw - old };
}

// Derive shipment receipt status from the AUTHORITATIVE full line set. lines = [{ shippedQty, received }].
//   0 lines                         → { status:'', reason:'no_lines' }   (retain existing lifecycle)
//   every line received == 0        → { status:'', reason:'none_received' } (retain existing lifecycle;
//                                        final route point ALONE must never force a receipt status)
//   every line received >= shipped  → { status:'received' }
//   otherwise (some receipt exists) → { status:'partially_received' }
function shipDeriveReceiptStatus_(lines) {
  var list = lines || [];
  if (!list.length) return { status: '', reason: 'no_lines' };
  var anyReceived = false, allFull = true;
  for (var i = 0; i < list.length; i++) {
    var shipped = shipReceiptNum_(list[i].shippedQty);
    var recv = shipReceiptNum_(list[i].received);
    if (recv > 0) anyReceived = true;
    if (recv < shipped) allFull = false;   // a line is "full" when received >= its shipped qty
  }
  if (!anyReceived) return { status: '', reason: 'none_received' };
  if (allFull) return { status: SHIP_RECEIPT_FULL_, reason: 'all_full' };
  return { status: SHIP_RECEIPT_PARTIAL_, reason: 'partial' };
}

// Resolve a route-point advance over the shipment's OWN snapshotted nodes (canonical identities only).
// nodes = [{ id, seq, status }] (id = a canonical node identity; seq = sequence_no; status current/…).
// targetId must match one node's id. Returns:
//   { ok:false, code:'NODE_NOT_IN_ROUTE' }                 target not in this shipment's route
//   { ok:false, code:'ROUTE_BACKWARD' }                    target seq < current seq (fail closed)
//   { ok:true,  code:'IDEMPOTENT', changed:[], desired }   target == current node (no-op)
//   { ok:true,  code:'ADVANCED', changed:[{id,status}], desired, targetSeq }
// desired = the full intended status list (earlier=completed, target=current, later=planned) — used to
// assert the exactly-one-current invariant. changed = only the nodes whose status actually differs.
function shipRouteResolveMove_(nodes, targetId) {
  var list = (nodes || []).slice().sort(function (a, b) { return a.seq - b.seq; });
  var target = null;
  for (var i = 0; i < list.length; i++) { if (String(list[i].id) === String(targetId)) { target = list[i]; break; } }
  if (!target) return { ok: false, code: 'NODE_NOT_IN_ROUTE' };
  var current = null;
  for (var c = 0; c < list.length; c++) { if (String(list[c].status).trim().toLowerCase() === 'current') { current = list[c]; break; } }
  var currentSeq = current ? current.seq : -Infinity;   // no current node yet → any target is a forward set
  if (target.seq < currentSeq) return { ok: false, code: 'ROUTE_BACKWARD' };
  var desired = list.map(function (n) {
    var st = (n.seq < target.seq) ? 'completed' : (n.seq === target.seq ? 'current' : 'planned');
    return { id: n.id, seq: n.seq, status: st };
  });
  if (target.seq === currentSeq) return { ok: true, code: 'IDEMPOTENT', changed: [], desired: desired, targetSeq: target.seq };
  var changed = [];
  for (var d = 0; d < desired.length; d++) {
    var was = String(list[d].status).trim().toLowerCase();
    if (was !== desired[d].status) changed.push({ id: desired[d].id, status: desired[d].status });
  }
  return { ok: true, code: 'ADVANCED', changed: changed, desired: desired, targetSeq: target.seq };
}

// Deterministic receiving-capable node = the destination/terminal node of the shipment's route. Primary
// rule is STRUCTURAL (highest sequence_no) so it never depends on an unfrozen node_type vocabulary; a
// node whose type/code/event clearly reads as warehouse/receiving/arrival/delivery is preferred when the
// LAST such node exists (still deterministic). nodes = [{ id, seq, nodeType, nodeCode, plannedEventType }].
// Returns the node id, or '' when there are no nodes. Used ONLY to hint the frontend receiving UI — the
// receipt command itself is NEVER gated on route position (receipt is a separate physical fact).
function shipReceivingCapableNodeId_(nodes) {
  var list = (nodes || []).slice().sort(function (a, b) { return a.seq - b.seq; });
  if (!list.length) return '';
  var rx = /warehouse|receiv|arriv|deliver|destination|fba|fulfil|\bfc\b/i;
  var semantic = '';
  for (var i = 0; i < list.length; i++) {
    var hay = String(list[i].nodeType || '') + ' ' + String(list[i].nodeCode || '') + ' ' + String(list[i].plannedEventType || '');
    if (rx.test(hay)) semantic = list[i].id;   // keep the LAST semantic match (closest to destination)
  }
  if (semantic) return semantic;
  return list[list.length - 1].id;   // structural fallback: terminal node
}

// ---- Overseas destination inventory posting (F1-SHIPMENT-RECEIPT-R3-REVISED) — pure decision helpers ----

// Deterministic exactly-once movement identity for a receipt posting: shipment_line_id + ':' + cumulative.
// The cumulative received level is encoded so a repeat of the SAME cumulative is a proven no-op (§7).
function shipReceiptMovementRef_(shipmentLineId, cumulativeReceived) {
  return String(shipmentLineId) + ':' + String(Math.round(shipReceiptNum_(cumulativeReceived)));
}

// Decide whether a receipt posts to LOCAL overseas inventory. Reuses the EXISTING canonical Overseas
// eligibility (active + non-factory) via overseasImportWarehouseIssue_ — invents NO new warehouse-type
// model. Platform/FBA/WMS + blank + factory + inactive + unknown all SKIP (receipt still succeeds — §0.B/§9);
// ONLY an eligible managed-Overseas warehouse POSTs.
function shipReceiptPostingDecision_(destWarehouseId, whIssue) {
  if (!destWarehouseId) return 'SKIP_NO_DESTINATION';   // platform / no managed destination → not an error
  if (whIssue === null || whIssue === undefined) return 'POST';
  if (whIssue === 'WAREHOUSE_NOT_FOUND') return 'SKIP_NOT_MANAGED';   // e.g. platform-managed (not a warehouses row)
  if (whIssue === 'WAREHOUSE_INACTIVE') return 'SKIP_INACTIVE';
  if (whIssue === 'WAREHOUSE_NOT_OVERSEAS') return 'SKIP_FACTORY';    // never credit a Factory warehouse (§13)
  return 'SKIP_INELIGIBLE';
}

// Highest cumulative already posted to inventory for a line, read from the movement ledger's reference_ids
// (each = shipment_line_id + ':' + cumulative). 0 when none. This makes posting reconcile against the LEDGER
// (not the in-request delta), so a crash between the received_qty write and the inventory write is repaired
// exactly-once on the next call. refs = reference_id strings of reference_type='shipment_receipt' movements.
function shipReceiptLastPostedCumulative_(refs, shipmentLineId) {
  var max = 0;
  (refs || []).forEach(function (ref) {
    var s = String(ref); var i = s.lastIndexOf(':'); if (i <= 0) return;
    if (s.slice(0, i) !== String(shipmentLineId)) return;
    var n = parseFloat(s.slice(i + 1)); if (isFinite(n) && n > max) max = n;
  });
  return max;
}

// The amount to post now = currentCumulativeReceived - lastPostedCumulative (never negative). Receipt
// posts the DELTA only, reconciled through the ledger (never the cumulative total, never shipment_qty).
function shipReceiptPostAmount_(currentReceived, lastPosted) {
  return Math.max(shipReceiptNum_(currentReceived) - shipReceiptNum_(lastPosted), 0);
}

// __SHIP_RECEIPT_PURE_END__

// ============================================================
// action `shipment.receipt.update` — cumulative receipt writer + backend status derivation.
// Body: { shipment_id, lines: [ { shipment_line_id, shipment_received_qty } ], actor? }.
// The submitted quantity is CUMULATIVE (NOT "receive this many now"). Validate-ALL-before-write.
// ============================================================
function handleUpdateShipmentReceipt_(body) {
  body = body || {};
  var b0 = (body.payload && typeof body.payload === 'object') ? body.payload : body;
  var shipmentId = String(b0.shipment_id || b0.shipmentId || '').trim();
  var actor = String(b0.actor || b0.updated_by || 'system_user').trim();
  var submitted = b0.lines || b0.receiptLines || [];
  if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id', code: 'INPUT' });
  if (!submitted.length) return jsonResponse_({ success: false, error: 'No receipt lines submitted', code: 'INPUT' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var lineSheet = ss.getSheetByName('shipment_lines');
  if (!lineSheet) return jsonResponse_({ success: false, error: 'shipment_lines sheet not found', code: 'LOAD' });
  var shipSheet = ss.getSheetByName('shipments');
  if (!shipSheet) return jsonResponse_({ success: false, error: 'shipments sheet not found', code: 'LOAD' });

  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', code: 'LOCK' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), code: 'LOCK' }); }

  try {
    // shipment_received_qty already exists in the LIVE DB; ensure is additive/no-op safety for predating tabs.
    sheetEnsureColumns_(lineSheet, ['shipment_received_qty']);
    var ls = shipmentReadSheet_(lineSheet);
    var lIdCol = ls.col('shipment_line_id');
    var lShipCol = ls.col('shipment_id');
    var lQtyCol = ls.col('shipment_qty'); if (lQtyCol === -1) lQtyCol = ls.col('qty');
    var lRecvCol = ls.col('shipment_received_qty');
    var lUpdCol = ls.col('updated_at');
    if (lIdCol === -1 || lShipCol === -1 || lRecvCol === -1) {
      lock.releaseLock();
      return jsonResponse_({ success: false, error: 'shipment_lines is missing a required column (shipment_line_id / shipment_id / shipment_received_qty).', code: 'CONTRACT' });
    }

    // Index THIS shipment's lines only (a submitted line not here is foreign/unknown → LINE_NOT_FOUND).
    var byId = {};
    for (var r = 1; r < ls.rows.length; r++) {
      if (String(ls.rows[r][lShipCol]).trim() !== shipmentId) continue;
      var lid = String(ls.rows[r][lIdCol]).trim();
      byId[lid] = {
        rowIdx: r + 1,
        sku: String(ls.rows[r][ls.col('sku')] || '').trim(),
        shippedQty: shipReceiptNum_(ls.rows[r][lQtyCol]),
        oldReceived: shipReceiptNum_(ls.rows[r][lRecvCol])
      };
    }
    if (!Object.keys(byId).length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment has no lines: ' + shipmentId, code: 'NO_LINES' }); }

    // ---- VALIDATE ALL before any write (fail closed on the first invalid set) ----
    var plan = [], invalid = [];
    for (var i = 0; i < submitted.length; i++) {
      var sl = submitted[i] || {};
      var slid = String(sl.shipment_line_id || sl.shipmentLineId || '').trim();
      if (!slid) { invalid.push({ shipment_line_id: '', code: 'INPUT' }); continue; }
      var rec = byId[slid];
      if (!rec) { invalid.push({ shipment_line_id: slid, code: 'LINE_NOT_FOUND' }); continue; }
      var requested = (sl.shipment_received_qty != null) ? sl.shipment_received_qty : sl.shipmentReceivedQty;
      var v = shipReceiptValidateLine_(rec.oldReceived, requested, rec.shippedQty);
      if (!v.ok) { invalid.push({ shipment_line_id: slid, code: v.code, shipped: rec.shippedQty, previous: rec.oldReceived, requested: requested }); continue; }
      plan.push({ slid: slid, rowIdx: rec.rowIdx, newReceived: rec.oldReceived + v.delta, delta: v.delta });
    }
    if (invalid.length) {
      lock.releaseLock();
      return jsonResponse_({ success: false, error: 'Receipt rejected — one or more lines are invalid; no receipt was written.', code: 'RECEIPT_VALIDATION_FAILED', invalid_lines: invalid });
    }

    // ---- APPLY (delta > 0 only; delta == 0 is an idempotent no-op) ----
    var now = shipmentTimestamp_();
    var applied = 0, idempotent = 0;
    for (var p = 0; p < plan.length; p++) {
      if (plan[p].delta > 0) {
        lineSheet.getRange(plan[p].rowIdx, lRecvCol + 1).setValue(plan[p].newReceived);
        if (lUpdCol !== -1) lineSheet.getRange(plan[p].rowIdx, lUpdCol + 1).setValue(now);
        applied++;
      } else {
        idempotent++;
      }
    }
    SpreadsheetApp.flush();

    // ---- DERIVE status from the AUTHORITATIVE full line set (re-read; never trust the frontend) ----
    var ls2 = shipmentReadSheet_(lineSheet);
    var q2 = ls2.col('shipment_qty'); if (q2 === -1) q2 = ls2.col('qty');
    var r2 = ls2.col('shipment_received_qty');
    var sid2 = ls2.col('shipment_id');
    var authoritative = [], resultLines = [];
    for (var x = 1; x < ls2.rows.length; x++) {
      if (String(ls2.rows[x][sid2]).trim() !== shipmentId) continue;
      var shipped = shipReceiptNum_(ls2.rows[x][q2]);
      var received = shipReceiptNum_(ls2.rows[x][r2]);
      authoritative.push({ shippedQty: shipped, received: received });
      resultLines.push({
        shipment_line_id: String(ls2.rows[x][ls2.col('shipment_line_id')] || '').trim(),
        sku: String(ls2.rows[x][ls2.col('sku')] || '').trim(),
        shipment_qty: shipped, shipment_received_qty: received, remaining_qty: Math.max(shipped - received, 0)
      });
    }
    var derived = shipDeriveReceiptStatus_(authoritative);

    // ---- Persist the DERIVED status on the shipments row (derived-status cell only; NOT a CRUD writer) ----
    var statusWritten = '';
    if (derived.status) {
      var sh = shipmentReadSheet_(shipSheet);
      var sIdCol = sh.col('shipment_id'), sStatusCol = sh.col('status');
      var sUpdAt = sh.col('updated_at'), sUpdBy = sh.col('updated_by');
      var shipRow = -1;
      for (var y = 1; y < sh.rows.length; y++) { if (String(sh.rows[y][sIdCol]).trim() === shipmentId) { shipRow = y + 1; break; } }
      if (shipRow !== -1 && sStatusCol !== -1) {
        shipSheet.getRange(shipRow, sStatusCol + 1).setValue(derived.status);
        if (sUpdAt !== -1) shipSheet.getRange(shipRow, sUpdAt + 1).setValue(now);
        if (sUpdBy !== -1) shipSheet.getRange(shipRow, sUpdBy + 1).setValue(actor);
        statusWritten = derived.status;
        SpreadsheetApp.flush();
      }
    }

    // ---- Managed-Overseas destination inventory posting (F1-SHIPMENT-RECEIPT-R3-REVISED) ----
    // Platform/FBA/WMS, blank, factory, inactive, unknown destinations → receipt succeeds, NO local
    // inventory mutation (§0.B/§9). Managed Overseas → wh_available_stock += (currentReceived −
    // lastPostedCumulative), reconciled EXACTLY-ONCE through overseas_inventory_movements
    // (reference_type='shipment_receipt', reference_id=SL:cumulative). wh_on_the_way_qty is intentionally
    // NOT touched (OVERSEAS_ON_THE_WAY_DOUBLE_COUNT_RISK — see completion report). Factory never credited (§13).
    var posting = shipReceiptPostToOverseas_(ss, shipmentId, shipSheet, resultLines, actor, now);

    lock.releaseLock();
    return jsonResponse_({
      success: true,
      data: {
        posting: posting,
        shipment_id: shipmentId,
        status: statusWritten || null,
        status_derived: derived.status || null,
        status_reason: derived.reason,
        lines_applied: applied, lines_idempotent: idempotent,
        lines: resultLines
      }
    });
  } catch (err) {
    try { lock.releaseLock(); } catch (e) {}
    return jsonResponse_({ success: false, error: 'Receipt update failed: ' + (err && err.message ? err.message : err), code: 'WRITE' });
  }
}

// Canonical overseas_inventory_movements header (mirrors 05_'s OVS_MOV_HEADERS; shared additive contract).
var SHIP_RECEIPT_OVS_MOV_HEADERS_ = [
  'movement_id', 'movement_date', 'warehouse_id', 'sku', 'site_sku',
  'movement_type', 'movement_scope', 'from_stock_type', 'to_stock_type',
  'wh_quantity', 'wh_quantity_before', 'wh_quantity_after',
  'wh_before_physical_stock', 'wh_after_physical_stock',
  'wh_before_reserved_stock', 'wh_after_reserved_stock',
  'wh_before_available_stock', 'wh_after_available_stock',
  'reference_type', 'reference_id', 'source_module', 'created_by', 'created_at', 'note'
];

// Post confirmed receipt quantities to LOCAL overseas inventory (available bucket), reconciled exactly-once
// through the movement ledger. Runs INSIDE the receipt handler's ScriptLock (§6 — one transaction boundary;
// no second frontend API, no second inventory writer). Returns a posting summary; NEVER throws to the caller
// (a posting failure leaves the received_qty persisted and is repaired by ledger reconciliation on retry).
function shipReceiptPostToOverseas_(ss, shipmentId, shipSheet, resultLines, actor, now) {
  var posting = { status: 'SKIP_NO_DESTINATION', warehouse_id: '', lines: [] };
  try {
    // Resolve the canonical destination warehouse identity (NEVER from display text / warehouse_code).
    var sm = shipmentReadSheet_(shipSheet);
    var mId = sm.col('shipment_id'), mDest = sm.col('destination_warehouse_id'), mWid = sm.col('warehouse_id');
    var drow = -1;
    for (var d0 = 1; d0 < sm.rows.length; d0++) { if (String(sm.rows[d0][mId]).trim() === shipmentId) { drow = d0; break; } }
    var destWhId = (drow !== -1 && mDest !== -1) ? String(sm.rows[drow][mDest] || '').trim() : '';
    if (!destWhId && drow !== -1 && mWid !== -1) destWhId = String(sm.rows[drow][mWid] || '').trim();   // transitional compat
    posting.warehouse_id = destWhId;

    // Classify the destination via the EXISTING canonical Overseas eligibility (active + non-factory).
    var whIssue = null;
    if (destWhId) {
      var whSheet = ss.getSheetByName('warehouses');
      var whRec = null;
      if (whSheet) {
        var wr = shipmentReadSheet_(whSheet);
        var wId = wr.col('warehouse_id'), wAct = wr.col('is_active'), wFac = wr.col('is_factory_warehouse'), wSt = wr.col('status');
        for (var w0 = 1; w0 < wr.rows.length; w0++) {
          if (String(wr.rows[w0][wId] || '').trim() !== destWhId) continue;
          whRec = {
            isActive: wAct !== -1 ? overseasImportTruthy_(wr.rows[w0][wAct]) : (wSt !== -1 ? (String(wr.rows[w0][wSt] || '').trim().toLowerCase() === 'active') : true),
            isFactory: wFac !== -1 ? overseasImportTruthy_(wr.rows[w0][wFac]) : false
          };
          break;
        }
      }
      whIssue = overseasImportWarehouseIssue_(whRec);
    }
    var decision = shipReceiptPostingDecision_(destWhId, whIssue);
    posting.status = decision;
    if (decision !== 'POST') return posting;   // platform / factory / inactive / unknown → receipt succeeds, no posting

    var snapSheet = ss.getSheetByName('overseas_inventory_snapshot');
    if (!snapSheet) { posting.status = 'SKIP_NO_OVERSEAS_TABLE'; return posting; }
    var movSheet = fcWriteEnsureSheet_(ss, 'overseas_inventory_movements', SHIP_RECEIPT_OVS_MOV_HEADERS_);
    fcWriteEnsureColumns_(movSheet, SHIP_RECEIPT_OVS_MOV_HEADERS_);

    // Ledger: reference_ids of prior shipment_receipt movements (the exactly-once authority).
    var mv = shipmentReadSheet_(movSheet);
    var mvType = mv.col('reference_type'), mvRef = mv.col('reference_id');
    var postedRefs = [];
    for (var m0 = 1; m0 < mv.rows.length; m0++) {
      if (mvType !== -1 && String(mv.rows[m0][mvType]).trim() === 'shipment_receipt' && mvRef !== -1) postedRefs.push(String(mv.rows[m0][mvRef]).trim());
    }

    // Snapshot index (this destination only). available bucket = wh_available_stock (legacy available_stock).
    var snap = shipmentReadSheet_(snapSheet);
    var snWh = snap.col('warehouse_id'), snSku = snap.col('sku');
    var snAvail = snap.col('wh_available_stock'); if (snAvail === -1) snAvail = snap.col('available_stock');
    var snUpd = snap.col('updated_at'), snLastMov = snap.col('last_movement_at');
    if (snWh === -1 || snSku === -1 || snAvail === -1) { posting.status = 'SKIP_NO_AVAILABLE_COLUMN'; return posting; }
    var bySku = {};
    for (var s0 = 1; s0 < snap.rows.length; s0++) {
      if (String(snap.rows[s0][snWh] || '').trim() !== destWhId) continue;
      bySku[String(snap.rows[s0][snSku] || '').trim()] = { rowIdx: s0 + 1, avail: shipReceiptNum_(snap.rows[s0][snAvail]) };
    }

    var postedCount = 0;
    for (var rl = 0; rl < resultLines.length; rl++) {
      var lineId = resultLines[rl].shipment_line_id;
      var sku = resultLines[rl].sku;
      var cumReceived = shipReceiptNum_(resultLines[rl].shipment_received_qty);
      var ref = shipReceiptMovementRef_(lineId, cumReceived);
      if (postedRefs.indexOf(ref) !== -1) { posting.lines.push({ sku: sku, warehouse_id: destWhId, delta: 0, reference_id: ref, idempotent: true }); continue; }
      var lastPosted = shipReceiptLastPostedCumulative_(postedRefs, lineId);
      var postAmt = shipReceiptPostAmount_(cumReceived, lastPosted);
      if (postAmt <= 0) { posting.lines.push({ sku: sku, warehouse_id: destWhId, delta: 0, reference_id: ref, idempotent: true }); continue; }

      var rec = bySku[sku];
      var before, after, targetRow, created = false;
      if (rec) { before = rec.avail; after = before + postAmt; targetRow = rec.rowIdx; snapSheet.getRange(targetRow, snAvail + 1).setValue(after); }
      else {
        // §0.D — create the canonical row (available = delta; other qty default 0; site_sku NOT invented).
        before = 0; after = postAmt; created = true;
        var newId = 'OISN-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
        var obj = { snapshot_id: newId, overseas_inventory_id: newId, snapshot_date: (typeof shipmentToday_ === 'function' ? shipmentToday_() : now),
          warehouse_id: destWhId, sku: sku, wh_available_stock: after, wh_reserved_stock: 0, wh_damaged_stock: 0, wh_on_the_way_qty: 0,
          available_stock: after, reserved_stock: 0, damaged_stock: 0, on_the_way_qty: 0,
          created_at: now, updated_at: now, note: 'auto-created by shipment receipt ' + shipmentId };
        shipmentAppendByHeader_(snapSheet, obj);
        var snap2 = shipmentReadSheet_(snapSheet);
        for (var s1 = snap2.rows.length - 1; s1 >= 1; s1--) {
          if (String(snap2.rows[s1][snap2.col('warehouse_id')] || '').trim() === destWhId && String(snap2.rows[s1][snap2.col('sku')] || '').trim() === sku) { targetRow = s1 + 1; break; }
        }
      }
      if (snUpd !== -1 && targetRow) snapSheet.getRange(targetRow, snUpd + 1).setValue(now);
      if (snLastMov !== -1 && targetRow) snapSheet.getRange(targetRow, snLastMov + 1).setValue(now);
      SpreadsheetApp.flush();

      // Append the ledger row AFTER the balance write; on failure, revert the balance (05_ compensation
      // pattern) so no ledger row + reverted balance = as-if-not-posted → clean retry (no double / no loss).
      try {
        shipmentAppendByHeader_(movSheet, {
          movement_id: 'OVMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8),
          movement_date: (typeof shipmentToday_ === 'function' ? shipmentToday_() : now),
          warehouse_id: destWhId, sku: sku, movement_type: 'shipment_receipt', movement_scope: 'available_stock',
          from_stock_type: '', to_stock_type: 'available',
          wh_quantity: postAmt, wh_quantity_before: before, wh_quantity_after: after,
          wh_before_available_stock: before, wh_after_available_stock: after,
          reference_type: 'shipment_receipt', reference_id: ref, source_module: 'shipment_receipt',
          created_by: actor, created_at: now, note: 'shipment ' + shipmentId + ' line ' + lineId
        });
      } catch (movErr) {
        try { snapSheet.getRange(targetRow, snAvail + 1).setValue(created ? 0 : before); SpreadsheetApp.flush(); } catch (e2) {}
        posting.status = 'POSTING_ERROR'; posting.error = String(movErr && movErr.message ? movErr.message : movErr);
        return posting;
      }
      postedRefs.push(ref);
      if (rec) rec.avail = after; else bySku[sku] = { rowIdx: targetRow, avail: after };
      posting.lines.push({ sku: sku, warehouse_id: destWhId, delta: postAmt, before_available: before, after_available: after, reference_id: ref, idempotent: false, row_created: created });
      postedCount++;
    }
    posting.status = postedCount > 0 ? 'POSTED' : 'POSTED_IDEMPOTENT';
    return posting;
  } catch (postErr) {
    posting.status = 'POSTING_ERROR'; posting.error = String(postErr && postErr.message ? postErr.message : postErr);
    return posting;
  }
}

// ============================================================
// action `shipment.route.advance` — set the current route point on shipment_routes (forward-only).
// Body: { shipment_id, route_template_node_id? | shipment_route_id?, actor? }.
// ============================================================
function handleAdvanceShipmentRoutePoint_(body) {
  body = body || {};
  var b0 = (body.payload && typeof body.payload === 'object') ? body.payload : body;
  var shipmentId = String(b0.shipment_id || b0.shipmentId || '').trim();
  var actor = String(b0.actor || b0.updated_by || 'system_user').trim();
  var targetTemplateNode = String(b0.route_template_node_id || b0.routeTemplateNodeId || '').trim();
  var targetRouteId = String(b0.shipment_route_id || b0.shipmentRouteId || '').trim();
  if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id', code: 'INPUT' });
  if (!targetTemplateNode && !targetRouteId) return jsonResponse_({ success: false, error: 'Missing route_template_node_id', code: 'INPUT' });

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var routeSheet = ss.getSheetByName('shipment_routes');
  if (!routeSheet) return jsonResponse_({ success: false, error: 'shipment_routes sheet not found — shipment has no snapshotted route.', code: 'ROUTE_NOT_SNAPSHOTTED' });

  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', code: 'LOCK' }); }
  catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), code: 'LOCK' }); }

  try {
    var rs = shipmentReadSheet_(routeSheet);
    var rIdCol = rs.col('shipment_route_id');
    var rShipCol = rs.col('shipment_id');
    var rNodeCol = rs.col('route_template_node_id');
    var rSeqCol = rs.col('sequence_no');
    var rStatusCol = rs.col('status');
    var rUpdCol = rs.col('updated_at');
    if (rShipCol === -1 || rSeqCol === -1 || rStatusCol === -1) {
      lock.releaseLock();
      return jsonResponse_({ success: false, error: 'shipment_routes is missing required columns (shipment_id / sequence_no / status).', code: 'CONTRACT' });
    }

    // Collect THIS shipment's nodes. id = the identity we match on (template node id preferred, else route id).
    var nodes = [];
    for (var r = 1; r < rs.rows.length; r++) {
      if (String(rs.rows[r][rShipCol]).trim() !== shipmentId) continue;
      var tid = rNodeCol !== -1 ? String(rs.rows[r][rNodeCol] || '').trim() : '';
      var srid = rIdCol !== -1 ? String(rs.rows[r][rIdCol] || '').trim() : '';
      nodes.push({
        id: targetTemplateNode ? tid : srid,
        routeTemplateNodeId: tid, shipmentRouteId: srid,
        seq: Math.round(shipReceiptNum_(rs.rows[r][rSeqCol])),
        status: String(rs.rows[r][rStatusCol] || '').trim(),
        rowIdx: r + 1
      });
    }
    if (!nodes.length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment has no route nodes: ' + shipmentId, code: 'ROUTE_NOT_SNAPSHOTTED' }); }

    var targetId = targetTemplateNode || targetRouteId;
    var move = shipRouteResolveMove_(nodes, targetId);
    if (!move.ok) {
      lock.releaseLock();
      var msg = move.code === 'ROUTE_BACKWARD'
        ? 'Cannot move the shipment backwards along its route (no correction workflow exists). Request rejected.'
        : 'The selected route point is not part of this shipment\'s route.';
      return jsonResponse_({ success: false, error: msg, code: move.code });
    }

    // Assert the exactly-one-current invariant on the intended result BEFORE writing.
    var currentCount = move.desired.filter(function (n) { return n.status === 'current'; }).length;
    if (currentCount !== 1) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Route update aborted — it would not leave exactly one current node.', code: 'INVARIANT' }); }

    var now = shipmentTimestamp_();
    if (move.code === 'ADVANCED' && move.changed.length) {
      var byRow = {}; nodes.forEach(function (n) { byRow[String(n.id)] = n; });
      for (var c = 0; c < move.changed.length; c++) {
        var nd = byRow[String(move.changed[c].id)];
        if (!nd) continue;
        routeSheet.getRange(nd.rowIdx, rStatusCol + 1).setValue(move.changed[c].status);
        if (rUpdCol !== -1) routeSheet.getRange(nd.rowIdx, rUpdCol + 1).setValue(now);
      }
      SpreadsheetApp.flush();
    }

    var summary = move.desired.map(function (n) {
      var src = null; for (var k = 0; k < nodes.length; k++) { if (String(nodes[k].id) === String(n.id)) { src = nodes[k]; break; } }
      return { route_template_node_id: src ? src.routeTemplateNodeId : '', shipment_route_id: src ? src.shipmentRouteId : '', sequence_no: n.seq, status: n.status };
    });
    lock.releaseLock();
    return jsonResponse_({
      success: true,
      data: {
        shipment_id: shipmentId,
        idempotent: move.code === 'IDEMPOTENT',
        current_sequence_no: move.targetSeq,
        current_route_template_node_id: targetTemplateNode || (summary.filter(function (n) { return n.status === 'current'; })[0] || {}).route_template_node_id || '',
        nodes: summary
      }
    });
  } catch (err) {
    try { lock.releaseLock(); } catch (e) {}
    return jsonResponse_({ success: false, error: 'Route advance failed: ' + (err && err.message ? err.message : err), code: 'WRITE' });
  }
}
