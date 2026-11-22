

























var SHIP_RECEIPT_PARTIAL_ = 'partially_received';
var SHIP_RECEIPT_FULL_ = 'received';






function shipReceiptNum_(v) {
if (v === '' || v == null) return 0;
var n = parseFloat(v);
return isFinite(n) ? n : 0;
}






function shipReceiptValidateLine_(oldReceived, requested, shippedQty) {
var reqRaw = parseFloat(requested);
if (!isFinite(reqRaw)) return { ok: false, code: 'INVALID_QTY', delta: 0 };
if (typeof requested === 'number' ? Math.floor(requested) !== requested : !/^\s*[+-]?\d+\s*$/.test(String(requested))) return { ok: false, code: 'INVALID_QTY', delta: 0 };   // R71-RCV-1c (review m1): a cumulative receipt is a whole number
var old = shipReceiptNum_(oldReceived);
var shipped = shipReceiptNum_(shippedQty);
if (reqRaw < 0) return { ok: false, code: 'INVALID_QTY', delta: 0 };
if (reqRaw < old) return { ok: false, code: 'RECEIPT_BACKWARD', delta: reqRaw - old };
if (reqRaw > shipped) return { ok: false, code: 'RECEIPT_OVER', delta: reqRaw - old };
return { ok: true, code: 'OK', delta: reqRaw - old };
}







function shipDeriveReceiptStatus_(lines) {
var list = lines || [];
if (!list.length) return { status: '', reason: 'no_lines' };
var anyReceived = false, allFull = true;
for (var i = 0; i < list.length; i++) {
var shipped = shipReceiptNum_(list[i].shippedQty);
var recv = shipReceiptNum_(list[i].received);
if (recv > 0) anyReceived = true;
if (recv < shipped) allFull = false;
}
if (!anyReceived) return { status: '', reason: 'none_received' };
if (allFull) return { status: SHIP_RECEIPT_FULL_, reason: 'all_full' };
return { status: SHIP_RECEIPT_PARTIAL_, reason: 'partial' };
}










function shipRouteResolveMove_(nodes, targetId) {
var list = (nodes || []).slice().sort(function (a, b) { return a.seq - b.seq; });
var target = null;
for (var i = 0; i < list.length; i++) { if (String(list[i].id) === String(targetId)) { target = list[i]; break; } }
if (!target) return { ok: false, code: 'NODE_NOT_IN_ROUTE' };
var current = null;
for (var c = 0; c < list.length; c++) { if (String(list[c].status).trim().toLowerCase() === 'current') { current = list[c]; break; } }
var currentSeq = current ? current.seq : -Infinity;
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







function shipReceivingCapableNodeId_(nodes) {
var list = (nodes || []).slice().sort(function (a, b) { return a.seq - b.seq; });
if (!list.length) return '';
var rx = /warehouse|receiv|arriv|deliver|destination|fba|fulfil|\bfc\b/i;
var semantic = '';
for (var i = 0; i < list.length; i++) {
var hay = String(list[i].nodeType || '') + ' ' + String(list[i].nodeCode || '') + ' ' + String(list[i].plannedEventType || '');
if (rx.test(hay)) semantic = list[i].id;
}
if (semantic) return semantic;
return list[list.length - 1].id;
}





function shipReceiptMovementRef_(shipmentLineId, cumulativeReceived) {
return String(shipmentLineId) + ':' + String(Math.round(shipReceiptNum_(cumulativeReceived)));
}





// A-delta1 C4 D-B1 (Owner default 2026-11-21; ONE switch): the receipt reads the destination's warehouse_type, so 05_ overseasImportWarehouseIssue_
// (OVS_EXEC_WH_TYPES_ = FBA / RETURN / FACTORY) applies. A platform (FBA) destination records the receipt quantities and statuses exactly as
// before but posts NOTHING to overseas_inventory_snapshot / overseas_inventory_movements (its sellable stock comes only from the platform report).
// false = the AD1 behaviour (type not read: an FBA destination was posted into the overseas ledger).
var SHIP_RECEIPT_TYPED_DESTINATION_ = true;
function shipReceiptPostingDecision_(destWarehouseId, whIssue) {
if (!destWarehouseId) return 'SKIP_NO_DESTINATION';
if (whIssue === 'WAREHOUSE_PLATFORM') return 'SKIP_PLATFORM';   // C4 D-B1
if (whIssue === null || whIssue === undefined) return 'POST';
if (whIssue === 'WAREHOUSE_NOT_FOUND') return 'SKIP_NOT_MANAGED';
if (whIssue === 'WAREHOUSE_INACTIVE') return 'SKIP_INACTIVE';
if (whIssue === 'WAREHOUSE_NOT_OVERSEAS') return 'SKIP_FACTORY';
return 'SKIP_INELIGIBLE';
}





function shipReceiptLastPostedCumulative_(refs, shipmentLineId) {
var max = 0;
(refs || []).forEach(function (ref) {
var s = String(ref); var i = s.lastIndexOf(':'); if (i <= 0) return;
if (s.slice(0, i) !== String(shipmentLineId)) return;
var n = parseFloat(s.slice(i + 1)); if (isFinite(n) && n > max) max = n;
});
return max;
}



function shipReceiptPostAmount_(currentReceived, lastPosted) {
return Math.max(shipReceiptNum_(currentReceived) - shipReceiptNum_(lastPosted), 0);
}








function shipEventNextSequence_(existingSeqs) {
var max = 0;
(existingSeqs || []).forEach(function (s) { var n = parseFloat(s); if (isFinite(n) && n > max) max = n; });
return max + 1;
}




function shipLifecycleEventType_(derivedStatus) {
var s = String(derivedStatus == null ? '' : derivedStatus).trim().toLowerCase();
if (s === SHIP_RECEIPT_PARTIAL_) return 'partial_receipt';
if (s === SHIP_RECEIPT_FULL_) return 'received';
return '';
}




function shipRouteEventSourceId_(shipmentId, shipmentRouteId) { return 'route:' + String(shipmentId) + ':' + String(shipmentRouteId); }
function shipReceiptEventSourceId_(shipmentId, eventType) { return 'receipt-' + (eventType === 'received' ? 'received' : 'partial') + ':' + String(shipmentId); }



function shipEventShouldAppend_(existingSourceIds, sourceId) {
if (!sourceId) return false;
return (existingSourceIds || []).indexOf(String(sourceId)) < 0;
}




function shipEtaValidate_(v) {
var s = String(v == null ? '' : v).trim();
var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
if (!m) return { ok: false, value: '', code: 'INVALID_ETA' };
var y = +m[1], mo = +m[2], d = +m[3];
if (mo < 1 || mo > 12 || d < 1) return { ok: false, value: '', code: 'INVALID_ETA' };
var dim = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
if (d > dim[mo - 1]) return { ok: false, value: '', code: 'INVALID_ETA' };
return { ok: true, value: s, code: 'OK' };
}


























function shipEtaDateOnly_(v, tz) {
if (v === '' || v === null || v === undefined) return '';
if (Object.prototype.toString.call(v) === '[object Date]') {
if (isNaN(v.getTime())) return '';
if (typeof Utilities === 'undefined') return '';
var zone = tz || (typeof Session !== 'undefined' ? Session.getScriptTimeZone() : null);
if (!zone) return '';
return Utilities.formatDate(v, zone, 'yyyy-MM-dd');
}
var s = String(v).trim();
if (!s) return '';
var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
return m ? (m[1] + '-' + m[2] + '-' + m[3]) : '';
}














var SHIP_PROMOTE_FROM_ = 'shipped';
var SHIP_PROMOTE_TO_ = 'in_transit';
var SHIP_PROMOTE_TERMINAL_ = { arrived: 1, received: 1, partial_received: 1, partially_received: 1, completed: 1, closed: 1, cancelled: 1, in_transit: 1 };
function shipPromoteOnProgress_(ctx) {
ctx = ctx || {};
var cur = String(ctx.current_status == null ? '' : ctx.current_status).trim().toLowerCase();
var moveCode = String(ctx.move_code == null ? '' : ctx.move_code).trim().toUpperCase();
var originSeq = parseFloat(ctx.origin_sequence_no), targetSeq = parseFloat(ctx.target_sequence_no);
if (moveCode !== 'ADVANCED') return { promote: false, reason: 'NO_FORWARD_MOVEMENT', from: cur, to: cur };
if (SHIP_PROMOTE_TERMINAL_[cur]) return { promote: false, reason: cur === SHIP_PROMOTE_TO_ ? 'ALREADY_IN_TRANSIT' : 'TERMINAL_OR_LATER_STATUS', from: cur, to: cur };
if (cur !== SHIP_PROMOTE_FROM_) return { promote: false, reason: 'NOT_IN_SHIPPED_STATE', from: cur, to: cur };
if (!isFinite(originSeq) || !isFinite(targetSeq)) return { promote: false, reason: 'ROUTE_SEQUENCE_UNRESOLVED', from: cur, to: cur };
if (targetSeq <= originSeq) return { promote: false, reason: 'STILL_AT_ORIGIN', from: cur, to: cur };
return { promote: true, reason: 'FIRST_PROGRESS_BEYOND_ORIGIN', from: cur, to: SHIP_PROMOTE_TO_ };
}





var SHIP_EVENT_HEADERS_ = ['shipment_event_id', 'shipment_id', 'shipment_route_id', 'event_sequence', 'event_time', 'event_type', 'event_status', 'location_name', 'country', 'city', 'latitude', 'longitude', 'source', 'source_event_id', 'raw_status', 'note', 'created_by', 'created_at', 'updated_by', 'updated_at'];






function shipAppendLifecycleEvent_(ss, ev) {
try {
var sheet = fcWriteEnsureSheet_(ss, 'shipment_events', SHIP_EVENT_HEADERS_);
fcWriteEnsureColumns_(sheet, SHIP_EVENT_HEADERS_);
var rd = shipmentReadSheet_(sheet);
var cSid = rd.col('source_event_id'), cShip = rd.col('shipment_id'), cSeq = rd.col('event_sequence');
var existingSourceIds = [], seqs = [];
for (var i = 1; i < rd.rows.length; i++) {
if (cShip === -1 || String(rd.rows[i][cShip]).trim() !== String(ev.shipment_id)) continue;
if (cSeq !== -1) seqs.push(rd.rows[i][cSeq]);
if (cSid !== -1) existingSourceIds.push(String(rd.rows[i][cSid]).trim());
}
if (!shipEventShouldAppend_(existingSourceIds, ev.source_event_id)) {
return { appended: false, idempotent: true, event_type: ev.event_type, source_event_id: ev.source_event_id };
}
var seq = shipEventNextSequence_(seqs);
fcWriteAppendByHeader_(sheet, {
shipment_event_id: 'SEV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8),
shipment_id: ev.shipment_id, shipment_route_id: ev.shipment_route_id || '',
event_sequence: seq, event_time: ev.now, event_type: ev.event_type, event_status: ev.event_status || '',
location_name: ev.location_name || '', country: ev.country || '', city: ev.city || '',
latitude: (ev.latitude === undefined || ev.latitude === null) ? '' : ev.latitude,
longitude: (ev.longitude === undefined || ev.longitude === null) ? '' : ev.longitude,
source: 'system', source_event_id: ev.source_event_id, raw_status: ev.raw_status || '',
note: ev.note || '', created_by: ev.actor || 'system_user', created_at: ev.now,
updated_by: ev.actor || 'system_user', updated_at: ev.now
});
return { appended: true, idempotent: false, event_type: ev.event_type, source_event_id: ev.source_event_id, event_sequence: seq };
} catch (e) {
return { appended: false, idempotent: false, error: String(e && e.message ? e.message : e), event_type: ev.event_type };
}
}






// R71-RCV-1 (local candidate, 2026-11-03, Owner D1 - REVIEW_FINAL4 L4-1b): THE RECEIPT IS LEDGER-FIRST AND ROLLS FORWARD. Under the one lock:
// books gate -> per line the ledger row (reference 'line:cumulative') -> its stock write -> the receipt lines -> the status -> the lifecycle
// event. Nothing is undone: an interruption anywhere leaves a ledger that the next resend of THIS shipment proves and completes
// (PENDING_RECEIPT_POSTING, 05_ ovsReceiptPendingScan_); every other stock writer refuses such a key and names the shipment.
// (Replaces the RCV31 r1-r3 posting: lines first, movement + cell, a failure undone - whose undone failure froze the key, L4-1b.)
// R71-RCV-1c (review REVIEW_R71_RCV_1B B1 / M1 / m1 / I3): the 81_ XLSX imports (overseas and factory) run the CH7-2 books gate on every
// key they write; the chain check refuses a DELTA row after the top receipt row that does not start from its after-value; a receipt
// quantity is an integer.
// R71-RCV-1b (review REVIEW_R71_RCV M1 / m2): the chain check narrowed to the stacked-on-pending signature; a zero-quantity reference row
// counts as posted only as an Owner IN_STOCK marker.
//
// The facts of one receipt in ONE read of each sheet: the destination and whether this release posts to it, the stock and ledger values,
// this shipment's receipt references per line, and the proven posted cumulative per line (its highest reference, or opening_received_qty).
function shipReceiptLedgerFacts_(ss, shipmentId, shipSheet, ls, byId, destOverride) {   // XCO-R15G D1: destOverride = a line group's own warehouse
var F = { dest: '', decision: 'SKIP_NO_DESTINATION', st: null, mv: null, refs: {}, count: {}, posted: {}, opening: {}, lineCount: {} };
var T = function (v) { return String(v == null ? '' : v).trim(); };
var lId = ls.col('shipment_line_id'), lSh = ls.col('shipment_id'), lOp = ls.col('opening_received_qty');
for (var r = 1; r < ls.rows.length; r++) { var id0 = T(ls.rows[r][lId]); if (!id0) continue; F.lineCount[id0] = (F.lineCount[id0] || 0) + 1;
if (lOp !== -1 && byId[id0] && T(ls.rows[r][lSh]) === shipmentId) F.opening[id0] = shipReceiptNum_(ls.rows[r][lOp]); }
var sm = shipSheet.getDataRange().getValues(), H = (sm[0] || []).map(T);
var iId = H.indexOf('shipment_id'), iDest = H.indexOf('destination_warehouse_id'), iWh = H.indexOf('warehouse_id');
if (destOverride !== undefined) F.dest = T(destOverride); else for (var s = 1; s < sm.length; s++) if (iId !== -1 && T(sm[s][iId]) === shipmentId) { F.dest = iDest !== -1 ? T(sm[s][iDest]) : ''; if (!F.dest && iWh !== -1) F.dest = T(sm[s][iWh]); break; }
if (!F.dest) return F;
var whSheet = ss.getSheetByName('warehouses'), whRec = null;
if (whSheet) { var wr = shipmentReadSheet_(whSheet), wId = wr.col('warehouse_id'), wAct = wr.col('is_active'), wFac = wr.col('is_factory_warehouse'), wSt = wr.col('status'), wTy = wr.col('warehouse_type');   // C4 D-B1
for (var w0 = 1; w0 < wr.rows.length; w0++) { if (T(wr.rows[w0][wId]) !== F.dest) continue;
whRec = { isActive: wAct !== -1 ? overseasImportTruthy_(wr.rows[w0][wAct]) : (wSt !== -1 ? (T(wr.rows[w0][wSt]).toLowerCase() === 'active') : true), isFactory: wFac !== -1 ? overseasImportTruthy_(wr.rows[w0][wFac]) : false, type: (SHIP_RECEIPT_TYPED_DESTINATION_ && wTy !== -1) ? T(wr.rows[w0][wTy]) : '' }; break; } }
var whIss31_ = overseasImportWarehouseIssue_(whRec); if (whIss31_ === 'WAREHOUSE_NOT_OVERSEAS' && whRec && !whRec.isFactory && String(whRec.type || '').trim().toUpperCase() === 'FBA') whIss31_ = 'WAREHOUSE_PLATFORM';   // C4 D-B1
F.decision = shipReceiptPostingDecision_(F.dest, whIss31_);
var snapSheet = ss.getSheetByName('overseas_inventory_snapshot'), movSheet = ss.getSheetByName('overseas_inventory_movements');
if (snapSheet) F.st = snapSheet.getDataRange().getValues();
if (movSheet) F.mv = movSheet.getDataRange().getValues();
if (F.mv) { var mh = (F.mv[0] || []).map(T), cT = mh.indexOf('reference_type'), cR = mh.indexOf('reference_id'), cW = mh.indexOf('warehouse_id'), cS = mh.indexOf('sku'), cQ = mh.indexOf('wh_quantity'), cA = mh.indexOf('wh_after_available_stock'), cN = mh.indexOf('note'), cB = mh.indexOf('wh_before_available_stock');
for (var m = 1; m < F.mv.length; m++) { if (cT === -1 || cR === -1 || T(F.mv[m][cT]) !== 'shipment_receipt') continue;
var ref = T(F.mv[m][cR]); F.count[ref] = (F.count[ref] || 0) + 1; var c = ref.lastIndexOf(':'); if (c <= 0) continue; var lid = ref.slice(0, c); if (!byId[lid]) continue;
var cum = parseFloat(ref.slice(c + 1)); if (!isFinite(cum)) continue;
(F.refs[lid] = F.refs[lid] || []).push({ m: m, row: m + 1, ref: ref, cum: cum, wh: cW !== -1 ? T(F.mv[m][cW]) : '', sku: cS !== -1 ? T(F.mv[m][cS]) : '', qty: cQ !== -1 ? shipReceiptNum_(F.mv[m][cQ]) : 0,
after: cA !== -1 ? F.mv[m][cA] : '', before: cB !== -1 ? F.mv[m][cB] : '', qtyRaw: cQ !== -1 ? F.mv[m][cQ] : '', note: cN !== -1 ? T(F.mv[m][cN]) : '' }); } }
Object.keys(byId).forEach(function (lid) { F.posted[lid] = Math.max(shipReceiptLastPostedCumulative_((F.refs[lid] || []).map(function (x) { return x.ref; }), lid), F.opening[lid] || 0); });
return F;
}
// RCV31 r3 (REVIEW_LAYERS2 F-2), kept for the LEGACY shape: -> [why] for every line of this shipment whose SAVED cumulative (before this
// request) is not proven posted to the destination (no shipment_receipt reference for it at that cumulative, no opening_received_qty
// covering it) - received before the posting feature, while the destination was unmanaged, or by a pre-R71 posting that failed and was
// undone. Posting it now cannot be proven to be THIS receipt's. Only when the destination is one this release posts to. (R71 never makes
// this shape: its receipt lines are written only after their ledger row.) Reads only (the facts).
function shipReceiptUnpostedLines_(F, byId) {
if (F.decision !== 'POST') return null;
var out = [];
Object.keys(byId).forEach(function (lid) { var saved = shipReceiptNum_(byId[lid].oldReceived); if (!(saved > 0)) return;
var posted = F.posted[lid] || 0;
if (posted < saved) out.push(lid + ' (' + (byId[lid].sku || '') + '): saved received ' + saved + ', proven posted ' + posted); });
return out.length ? out : null;
}
// A pending row (05_) may be completed by THIS receipt only when it provably is this shipment's: its line is a line of this shipment (one
// shipment_lines row with that id), on this line's key, its note names this shipment and line, its reference is on one row only, it is
// the line's highest reference, within the shipped quantity, and its quantity is exactly its cumulative minus the line's earlier posted
// cumulative. -> '' (proven) | why not
function shipReceiptPendingOwnership_(pd, shipmentId, F, byId) {
var lid = pd.line_id, rec = byId[lid];
if (!rec) return 'line ' + lid + ' is not a line of this shipment';
if (rec.sku !== pd.sku || pd.warehouse_id !== F.dest) return 'the row is on ' + pd.key + ', the line on ' + F.dest + '||' + rec.sku;
if ((F.lineCount[lid] || 0) !== 1) return 'line id ' + lid + ' is on ' + (F.lineCount[lid] || 0) + ' shipment_lines rows';
if (pd.shipment_id !== shipmentId || pd.note_line_id !== lid) return 'the row note names shipment ' + (pd.shipment_id || '(none)') + ' line ' + (pd.note_line_id || '(none)');
if ((F.count[pd.reference_id] || 0) !== 1) return 'reference ' + pd.reference_id + ' is on ' + (F.count[pd.reference_id] || 0) + ' rows';
var others = (F.refs[lid] || []).filter(function (x) { return x.ref !== pd.reference_id; });
if (others.some(function (x) { return x.cum >= pd.cumulative; })) return 'the line already has a receipt row at or above ' + pd.cumulative;
if (pd.cumulative > rec.shippedQty) return 'cumulative ' + pd.cumulative + ' is over the shipped ' + rec.shippedQty;
var prev = Math.max(F.opening[lid] || 0, others.reduce(function (a, x) { return Math.max(a, x.cum); }, 0));
if (pd.qty !== pd.cumulative - prev) return 'quantity ' + pd.qty + ' is not ' + pd.cumulative + ' - ' + prev;
return '';
}
// THE BOOKS GATE (zero writes), every SKU of this shipment's lines (RCV31 r2 L4-2): a key reconciles by the CH7-2 rule (adjBooksGate_),
// or is PENDING with a row this shipment provably owns (then this receipt completes it first); anything else refuses. Plus the ledger of
// this shipment's lines must be unambiguous: each reference on one row, on the line's own key, a zero-quantity reference row only as an Owner
// IN_STOCK marker (R71-RCV-1b, review m2), and a line's highest receipt row must not be followed by a row that starts from that receipt's
// BEFORE-value (R71-RCV-1b, review M1: exactly the signature of a writer stacked on a receipt that never reached stock; any other break -
// a re-baselining count after a drift - is the ordinary books rule's business, as in base).
// -> { refuse: [why] | null, pending: { sku: pending facts } }. Reads only (the facts).
function shipReceiptBooksGate_(shipmentId, F, byId) {
var out = [], pend = {}, seen = {};
if (!F.dest || !F.st || !F.mv) return { refuse: null, pending: pend };
var T = function (v) { return String(v == null ? '' : v).trim(); };
Object.keys(byId).forEach(function (lid) { var sku = (byId[lid] || {}).sku; if (!sku || seen[sku]) return; seen[sku] = 1;
var pd = ovsReceiptPendingOf_(F.st, F.mv, F.dest, sku);
if (pd) {
var why = shipReceiptPendingOwnership_(pd, shipmentId, F, byId);
if (why) { out.push(ovsReceiptPendingText_(pd) + ' - NOT provable as this shipment\'s own receipt (' + why + ')'); return; }
pend[sku] = pd; return;
}
var w = adjBooksGate_(true, F.st, F.mv, F.dest, sku); if (w) out.push(w);
});
var mh = (F.mv[0] || []).map(T), cW = mh.indexOf('warehouse_id'), cS = mh.indexOf('sku'), cB = mh.indexOf('wh_before_available_stock'), cMT = mh.indexOf('movement_type'), cNT = mh.indexOf('note');
Object.keys(byId).forEach(function (lid) { var xs = F.refs[lid] || [], top = null;
xs.forEach(function (x) {
if (F.count[x.ref] > 1) out.push('RECEIPT_LEDGER_AMBIGUOUS reference ' + x.ref + ' is on ' + F.count[x.ref] + ' movement rows');
else if (x.wh !== F.dest || x.sku !== byId[lid].sku) out.push('RECEIPT_LEDGER_AMBIGUOUS reference ' + x.ref + ' is on ' + x.wh + '||' + x.sku + ', this line is ' + F.dest + '||' + byId[lid].sku);
else if (shipmentBooksInt_(x.qtyRaw) === 0 && !/ \| OWNER_REPAIR IN_STOCK digest [0-9a-f]{16} saved /.test(x.note)) out.push('RECEIPT_LEDGER_AMBIGUOUS reference ' + x.ref + ' (movement row ' + x.row + ') is a zero-quantity receipt row that is not an Owner IN_STOCK marker: it cannot be counted as posted');
if (!top || x.cum > top.cum) top = x; });
if (!top || cB === -1 || cW === -1 || cS === -1) return;
for (var j = top.m + 1; j < F.mv.length; j++) { if (T(F.mv[j][cW]) !== top.wh || T(F.mv[j][cS]) !== top.sku) continue;
var b = shipmentBooksInt_(F.mv[j][cB]), a = shipmentBooksInt_(top.after), tb = shipmentBooksInt_(top.before);
if (b !== null && a !== null && tb !== null && a !== tb && b === tb) out.push('RECEIPT_LEDGER_BROKEN the row after ' + top.ref + ' (movement row ' + (j + 1) + ') starts at that receipt\'s BEFORE-value ' + b + ', not at its after-value ' + a + ': it was written on top of a receipt that never reached stock');
if (b !== null && a !== null && tb !== null && b !== a && b !== tb && !shipReceiptIsCountRow_(cMT !== -1 ? T(F.mv[j][cMT]) : '', cNT !== -1 ? T(F.mv[j][cNT]) : '')) out.push('RECEIPT_LEDGER_BROKEN the row after ' + top.ref + ' (movement row ' + (j + 1) + ') is a DELTA from ' + b + ', not from that receipt\'s after-value ' + a + ': the receipt is not proven in stock (only a stock COUNT may re-baseline a key)');
break; }
});
var u = []; out.forEach(function (x) { if (u.indexOf(x) < 0) u.push(x); });
return { refuse: u.length ? u : null, pending: pend };
}
// R71-RCV-1c (review REVIEW_R71_RCV_1B B1 line 2): a COUNT row re-baselines a key (a legacy snapshot_import, or an inventory_import that
// is not an ADD - the 05_ batch import and the 81_ SET import write absolute values); every other movement is a delta from the cell.
function shipReceiptIsCountRow_(type, note) { return type === 'snapshot_import' || (type === 'inventory_import' && !/^import ADD /.test(String(note || ''))); }
// The typed answer of a receipt that stopped part way (never success:true; nothing is undone - the next resend completes it).
// JR5 (review R4-m1): the version this receipt claimed on a version-less row (empty = none); reset at the start of every receipt request.
var SHIP_RCV_CLAIM_31_ = '';
function shipReceiptIncomplete_(shipmentId, stage, why, data) {
var d = { shipment_id: shipmentId, stage: stage, zero_write: false, retry_safe: true, nothing_undone: true };
Object.keys(data || {}).forEach(function (k) { d[k] = data[k]; });
if (SHIP_RCV_CLAIM_31_) { d.version_claimed = SHIP_RCV_CLAIM_31_; d.current_updated_at = SHIP_RCV_CLAIM_31_; d.resend_needs_version = true;   // JR5 (review R4-m1)
return { success: false, code: 'SHIPMENT_RECEIPT_INCOMPLETE', data: d, error: 'The receipt stopped at ' + stage + ' (' + why + '). Nothing was undone: what it wrote is in the movement ledger and proves itself. This shipment had no readable version, so this receipt gave it one (' + SHIP_RCV_CLAIM_31_ + ') before its first write: a resend without that version is refused. Reload the shipment, then send the same cumulative quantities again: it completes the rest and never posts twice. Until then a stock writer on a key whose ledger row is not yet in stock is refused (PENDING_RECEIPT_POSTING).' }; }
return { success: false, code: 'SHIPMENT_RECEIPT_INCOMPLETE', data: d,
error: 'The receipt stopped at ' + stage + ' (' + why + '). Nothing was undone: what it wrote is in the movement ledger and proves itself. Send the SAME receipt (the same cumulative quantities) again: it completes the rest and never posts twice. Until then a stock writer on a key whose ledger row is not yet in stock is refused (PENDING_RECEIPT_POSTING).' };
}
function handleUpdateShipmentReceipt_(body) {
body = body || {};
var b0 = (body.payload && typeof body.payload === 'object') ? body.payload : body;
var shipmentId = String(b0.shipment_id || b0.shipmentId || '').trim();
var actor = String(b0.actor || b0.updated_by || 'system_user').trim();
var submitted = b0.lines || b0.receiptLines || [];
if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id', code: 'INPUT', zero_write: true });
if (!submitted.length) return jsonResponse_({ success: false, error: 'No receipt lines submitted', code: 'INPUT', zero_write: true });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var lineSheet = ss.getSheetByName('shipment_lines');
if (!lineSheet) return jsonResponse_({ success: false, error: 'shipment_lines sheet not found', code: 'LOAD', zero_write: true });
var shipSheet = ss.getSheetByName('shipments');
if (!shipSheet) return jsonResponse_({ success: false, error: 'shipments sheet not found', code: 'LOAD', zero_write: true });

var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', code: 'LOCK', zero_write: true }); }
catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), code: 'LOCK', zero_write: true }); }

var stage31_ = '';
SHIP_RCV_CLAIM_31_ = '';   // JR5 (review R4-m1)
try {

sheetEnsureColumns_(lineSheet, ['shipment_received_qty']);
var ls = shipmentReadSheet_(lineSheet);
var lIdCol = ls.col('shipment_line_id');
var lShipCol = ls.col('shipment_id');
var lQtyCol = ls.col('shipment_qty'); if (lQtyCol === -1) lQtyCol = ls.col('qty');
var lRecvCol = ls.col('shipment_received_qty');
var lUpdCol = ls.col('updated_at');
if (lIdCol === -1 || lShipCol === -1 || lRecvCol === -1) {
lock.releaseLock();
return jsonResponse_({ success: false, error: 'shipment_lines is missing a required column (shipment_line_id / shipment_id / shipment_received_qty).', code: 'CONTRACT', zero_write: true });
}


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
if (!Object.keys(byId).length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment has no lines: ' + shipmentId, code: 'NO_LINES', zero_write: true }); }


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
return jsonResponse_({ success: false, error: 'Receipt rejected — one or more lines are invalid; no receipt was written.', code: 'RECEIPT_VALIDATION_FAILED', invalid_lines: invalid, zero_write: true });
}


// R71-RCV-1: the facts (one read of each sheet), then every refusal BEFORE the first write - zero writes
var xcoG31_ = (typeof xcoLinkMemo_ === 'function' ? xcoLinkMemo_ : function (f) { return f(); })(function () { return xcoReceiptGroups_(ss, shipmentId, shipSheet, ls, byId, plan); });   /* XCO-R15G MINOR-7 */   // XCO-R15G D1: one facts set per line destination
if (xcoG31_.refuse) { lock.releaseLock(); return jsonResponse_(xcoG31_.refuse); }
var F31 = xcoG31_.groups[0].F;
var rcvGate31_ = xcoReceiptGate_(shipmentId, xcoG31_);
if (rcvGate31_.refuse) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'SHIPMENT_RECEIPT_BOOKS_UNKNOWN', data: { shipment_id: shipmentId, zero_write: true, retry_safe: false, unproven: rcvGate31_.refuse.slice(0, 20) },
error: 'The overseas stock of this receipt\'s destination is not proven against its movement ledger (' + rcvGate31_.refuse.slice(0, 3).join('; ') + '). Nothing was written: posting on top of it would hide the difference. A PENDING_RECEIPT_POSTING of ANOTHER shipment is completed by resending THAT shipment\'s receipt; any other difference has NO in-app correction: do not receive this shipment again and report it to the owner.' }); }
var below31_ = [];
plan.forEach(function (p) { var F31 = xcoG31_.F[p.slid]; if (F31.decision !== 'POST') return; var P = F31.posted[p.slid] || 0; if (p.newReceived < P) below31_.push(xcoG31_.multi ? { shipment_line_id: p.slid, requested: p.newReceived, posted: P, resend_cumulative: P, warehouse_id: F31.dest } : { shipment_line_id: p.slid, requested: p.newReceived, posted: P, resend_cumulative: P }); });   // XCO-R15G D1: each line against its own warehouse
if (below31_.length) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'RECEIPT_BELOW_POSTED', data: { shipment_id: shipmentId, zero_write: true, retry_safe: true, below_posted: below31_.slice(0, 20) },
error: 'The cumulative received sent is below what overseas stock already holds for ' + below31_.slice(0, 3).map(function (x) { return x.shipment_line_id + ' (sent ' + x.requested + ', posted ' + x.posted + ')'; }).join('; ') + '. Nothing was written. A receipt is cumulative: send it again with at least the posted cumulative (' + below31_.slice(0, 3).map(function (x) { return x.shipment_line_id + ' = ' + x.resend_cumulative; }).join(', ') + ').', zero_write: true }); }
var rcvUnposted31_ = xcoReceiptUnposted_(xcoG31_);   // XCO-R15G D1: every group   // RCV31 r3 (F-2): the legacy shape, kept
if (rcvUnposted31_) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'SHIPMENT_RECEIPT_POSTING_UNKNOWN', data: { shipment_id: shipmentId, zero_write: true, retry_safe: false, unposted_lines: rcvUnposted31_.slice(0, 20) },
error: 'A saved receipt on this shipment is not proven posted to overseas stock (' + rcvUnposted31_.slice(0, 3).join('; ') + '). Nothing was written: posting it now could count stock twice. This release has NO in-app correction for it (an Owner-reviewed correction is not available yet): do not receive this shipment again and report it to the owner.' }); }

// the target cumulative of EVERY line: the sent one, else the saved one raised to what the ledger already proves posted (a resend after
// an interruption at the lines write completes them); never above the shipped quantity
// N1 r2 (2026-11-13): inside the lock, after every existing read-only refusal and BEFORE the first write. (a) the ONE shipments row; (b) a
// resend of a receipt that is already FULLY recorded is answered REPLAYED with zero writes, before the other gates (it writes nothing, so it
// needs no version); (c) the dispatch gate (status and dispatch evidence must agree); (d) the version gate on EVERY request that may write,
// a completion included - there is no version-free path (r2: the binding of a version-free completion to the original receipt is not
// provable without a persisted receipt key); (e) the scope gate: a request never rolls forward a line it does not carry.
var n1Ship_ = n1ReceiptShipFacts_(shipSheet, shipmentId);
if (n1Ship_.refuse) { lock.releaseLock(); return jsonResponse_(n1Ship_.refuse); }
var n1Og_ = n1ReceiptOpeningGate_(shipmentId, n1Ship_);   // SHIP-OPEN R5: before the replay path too (review r4-m3)
if (n1Og_) { lock.releaseLock(); return jsonResponse_(n1Og_); }
var n1New_ = plan.some(function (p) { return p.delta > 0; });
if (!n1New_) { var n1Rp_ = n1ReceiptReplay_(ss, shipmentId, xcoG31_, byId, plan, ls, n1Ship_); if (n1Rp_) { lock.releaseLock(); return jsonResponse_(n1Rp_); } }
var n1Dg_ = n1ReceiptDispatchGate_(ss, shipmentId, n1Ship_, ls);
if (n1Dg_) { lock.releaseLock(); return jsonResponse_(n1Dg_); }
var n1Vg_ = n1ReceiptVersionGate_(n1Ship_, b0.expected_updated_at, shipmentId);
if (n1Vg_) { lock.releaseLock(); return jsonResponse_(n1Vg_); }
var n1Sg_ = n1ReceiptScopeGate_(shipmentId, xcoG31_, byId, plan);
if (n1Sg_) { lock.releaseLock(); return jsonResponse_(n1Sg_); }
var want31_ = {}; plan.forEach(function (p) { want31_[p.slid] = p.newReceived; });
var targets31_ = Object.keys(byId).map(function (lid) { var S = byId[lid].oldReceived, P = xcoG31_.F[lid].decision === 'POST' ? (xcoG31_.F[lid].posted[lid] || 0) : 0;   /* XCO-R15G D1 */
return { lid: lid, sku: byId[lid].sku, rowIdx: byId[lid].rowIdx, saved: S, target: want31_[lid] !== undefined ? want31_[lid] : Math.max(S, Math.min(P, byId[lid].shippedQty)) }; });
var now = shipmentTimestamp_();
// JR5 (review R4-m1): a token-less receipt reaches here only when the row has NO readable version (n1ReceiptVersionGate_ / editP1Gate15f2_).
// It claims the version NOW - inside the lock, after every gate, before its first stock or line write - so a request that dies later still
// leaves a readable version: any other token-less request is then refused EDIT_TOKEN_REQUIRED (zero write). STATUS stamps strictly later.
if (String(b0.expected_updated_at == null ? '' : b0.expected_updated_at).trim() === '') {
stage31_ = 'VERSION_CLAIM';
var shC31_ = shipmentReadSheet_(shipSheet), cId31_ = shC31_.col('shipment_id'), cUp31_ = shC31_.col('updated_at');
if (cUp31_ !== -1) for (var yC31_ = 1; yC31_ < shC31_.rows.length; yC31_++) if (String(shC31_.rows[yC31_][cId31_]).trim() === shipmentId) { var claim31_ = editNextStamp_(now, [shC31_.rows[yC31_][cUp31_]]); shipSheet.getRange(yC31_ + 1, cUp31_ + 1).setValue(claim31_); SHIP_RCV_CLAIM_31_ = claim31_; break; }
SpreadsheetApp.flush();
}
var applied = 0, idempotent = 0;
var writeLines31_ = function () {
stage31_ = 'LINES'; applied = 0; idempotent = 0;
targets31_.forEach(function (t) {
if (t.target > t.saved) { lineSheet.getRange(t.rowIdx, lRecvCol + 1).setValue(t.target); if (lUpdCol !== -1) lineSheet.getRange(t.rowIdx, lUpdCol + 1).setValue(now); t.saved = t.target; applied++; }
else if (want31_[t.lid] !== undefined) idempotent++;
});
SpreadsheetApp.flush();
};
stage31_ = 'POSTING';
var posting = xcoReceiptPost_(ss, shipmentId, xcoG31_, targets31_, actor, now);   // XCO-R15G D1: group by group, 31_'s own posting
if (posting && posting.status === 'POSTING_INCOMPLETE') { lock.releaseLock(); return jsonResponse_(shipReceiptIncomplete_(shipmentId, 'POSTING_' + posting.stage, posting.error, { posting: posting, failed_line: posting.failed_line, receipt_lines_recorded: false })); }
writeLines31_();


var ls2 = shipmentReadSheet_(lineSheet);
var q2 = ls2.col('shipment_qty'); if (q2 === -1) q2 = ls2.col('qty');
var r2 = ls2.col('shipment_received_qty');
var sid2 = ls2.col('shipment_id');
var authoritative = [], resultLines = [];
for (var x = 1; x < ls2.rows.length; x++) {
if (String(ls2.rows[x][sid2]).trim() !== shipmentId) continue;
if (typeof sc13RowRemoved_ === 'function' && sc13RowRemoved_(ls2, ls2.rows[x])) continue;   // XCO-R15G H2: a removed line is not part of the receipt status
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


stage31_ = 'STATUS';
var statusWritten = '';
if (derived.status) {
var sh = shipmentReadSheet_(shipSheet);
var sIdCol = sh.col('shipment_id'), sStatusCol = sh.col('status');
var sUpdAt = sh.col('updated_at'), sUpdBy = sh.col('updated_by');
var shipRow = -1;
for (var y = 1; y < sh.rows.length; y++) { if (String(sh.rows[y][sIdCol]).trim() === shipmentId) { shipRow = y + 1; break; } }
if (shipRow !== -1 && sStatusCol !== -1) {
shipSheet.getRange(shipRow, sStatusCol + 1).setValue(derived.status);
if (sUpdAt !== -1) shipSheet.getRange(shipRow, sUpdAt + 1).setValue(editNextStamp_(now, [sh.rows[shipRow - 1][sUpdAt]]));   // R71 small-3 (review m1)
if (sUpdBy !== -1) shipSheet.getRange(shipRow, sUpdBy + 1).setValue(actor);
statusWritten = derived.status;
SpreadsheetApp.flush();
}
}


stage31_ = 'EVENT';
var lifecycleEvent = null;
var evType = shipLifecycleEventType_(derived.status);
if (evType) {
lifecycleEvent = shipAppendLifecycleEvent_(ss, {
shipment_id: shipmentId, shipment_route_id: '',
event_type: evType, event_status: (evType === 'received' ? SHIP_RECEIPT_FULL_ : SHIP_RECEIPT_PARTIAL_),
source_event_id: shipReceiptEventSourceId_(shipmentId, evType),
raw_status: (evType === 'received' ? 'SHIPMENT RECEIVED' : 'SHIPMENT PARTIALLY RECEIVED'),
note: 'Lifecycle event derived from cumulative receipt.', actor: actor, now: now
});
}
if (lifecycleEvent && lifecycleEvent.error) { lock.releaseLock(); return jsonResponse_(shipReceiptIncomplete_(shipmentId, 'EVENT', lifecycleEvent.error, { posting: posting, receipt_lines_recorded: true, status: statusWritten || null, lines: resultLines, lifecycle_event: lifecycleEvent })); }
stage31_ = '';
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
lines: resultLines,
lifecycle_event: lifecycleEvent
}
});
} catch (err) {
try { lock.releaseLock(); } catch (e) {}
if (stage31_) return jsonResponse_(shipReceiptIncomplete_(shipmentId, stage31_, String(err && err.message ? err.message : err), {}));
return jsonResponse_({ success: false, error: 'Receipt update failed: ' + (err && err.message ? err.message : err), code: 'WRITE' });
}
}
var SHIP_RECEIPT_OVS_MOV_HEADERS_ = [
'movement_id', 'movement_date', 'warehouse_id', 'sku', 'site_sku',
'movement_type', 'movement_scope', 'from_stock_type', 'to_stock_type',
'wh_quantity', 'wh_quantity_before', 'wh_quantity_after',
'wh_before_physical_stock', 'wh_after_physical_stock',
'wh_before_reserved_stock', 'wh_after_reserved_stock',
'wh_before_available_stock', 'wh_after_available_stock',
'reference_type', 'reference_id', 'source_module', 'created_by', 'created_at', 'note'
];





// R71-RCV-1: the overseas posting, LEDGER FIRST. targets = [{ lid, sku, target }] for every line; pending = { sku: facts } the gate proved
// this shipment's. (1) every pending row is completed first - its stock write only, the ledger row is already there - so nothing is ever
// appended on top of a pending key; (2) per line with target > posted: the ledger row (reference 'line:target', note 'shipment S line L')
// then the stock cell (or the auto-created row) and its stamps. A failure stops here, undoes NOTHING and answers POSTING_INCOMPLETE with
// the stage: every landed state is a ledger the next resend proves (a row whose stock is missing is PENDING; a landed cell reconciles).
function shipReceiptPostToOverseas_(ss, shipmentId, F, pending, targets, actor, now) {
var posting = { status: F.decision, warehouse_id: F.dest, lines: [] }, stage = 'PREPARE', lineId = '';
if (F.decision !== 'POST') return posting;
try {
var snapSheet = ss.getSheetByName('overseas_inventory_snapshot');
if (!snapSheet || !F.st) { posting.status = 'SKIP_NO_OVERSEAS_TABLE'; return posting; }
var sh = (F.st[0] || []).map(function (h) { return String(h).trim(); });
var snWh = sh.indexOf('warehouse_id'), snSku = sh.indexOf('sku'), snAvail = sh.indexOf('wh_available_stock'); if (snAvail === -1) snAvail = sh.indexOf('available_stock');
var snUpd = sh.indexOf('updated_at'), snLastMov = sh.indexOf('last_movement_at');
if (snWh === -1 || snSku === -1 || snAvail === -1) { posting.status = 'SKIP_NO_AVAILABLE_COLUMN'; return posting; }
var movSheet = fcWriteEnsureSheet_(ss, 'overseas_inventory_movements', SHIP_RECEIPT_OVS_MOV_HEADERS_);
fcWriteEnsureColumns_(movSheet, SHIP_RECEIPT_OVS_MOV_HEADERS_);
var bySku = {};
for (var s0 = 1; s0 < F.st.length; s0++) { if (String(F.st[s0][snWh] || '').trim() !== F.dest) continue; bySku[String(F.st[s0][snSku] || '').trim()] = { rowIdx: s0 + 1, avail: shipReceiptNum_(F.st[s0][snAvail]) }; }
var stock = function (sku, after) {   // the stock write of a ledger row already on the sheet
stage = 'STOCK';
var rec = bySku[sku], row = rec ? rec.rowIdx : 0, created = false;
if (rec) snapSheet.getRange(row, snAvail + 1).setValue(after);
else {
var newId = 'OISN-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
shipmentAppendByHeader_(snapSheet, { snapshot_id: newId, overseas_inventory_id: newId, snapshot_date: (typeof shipmentToday_ === 'function' ? shipmentToday_() : now),
warehouse_id: F.dest, sku: sku, wh_available_stock: after, wh_reserved_stock: 0, wh_damaged_stock: 0, wh_on_the_way_qty: 0,
available_stock: after, reserved_stock: 0, damaged_stock: 0, on_the_way_qty: 0,
created_at: now, updated_at: now, note: 'auto-created by shipment receipt ' + shipmentId });
created = true; row = snapSheet.getLastRow();
var got = snapSheet.getRange(row, 1, 1, sh.length).getValues()[0] || [];
if (String(got[snWh] || '').trim() !== F.dest || String(got[snSku] || '').trim() !== sku) throw new Error('the auto-created stock row of ' + F.dest + '||' + sku + ' is not the last row');
}
if (snUpd !== -1) snapSheet.getRange(row, snUpd + 1).setValue(now);
if (snLastMov !== -1) snapSheet.getRange(row, snLastMov + 1).setValue(now);
SpreadsheetApp.flush();
bySku[sku] = { rowIdx: row, avail: after };
return created;
};
var postedCount = 0;
Object.keys(pending || {}).forEach(function (sku) {   // (1) roll forward
var pd = pending[sku]; lineId = pd.line_id;
var c = stock(sku, pd.after);
posting.lines.push({ sku: sku, warehouse_id: F.dest, delta: pd.qty, before_available: pd.before, after_available: pd.after, reference_id: pd.reference_id, movement_id: pd.movement_id, idempotent: false, rolled_forward: true, row_created: c });
postedCount++;
});
targets.forEach(function (t) {   // (2) ledger first
lineId = t.lid;
var P = F.posted[t.lid] || 0, amt = shipReceiptPostAmount_(t.target, P), ref = shipReceiptMovementRef_(t.lid, t.target);
if (amt <= 0) { posting.lines.push({ sku: t.sku, warehouse_id: F.dest, delta: 0, reference_id: ref, idempotent: true }); return; }
var rec = bySku[t.sku], before = rec ? rec.avail : 0, after = before + amt, movId = 'OVMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
stage = 'LEDGER';
shipmentAppendByHeader_(movSheet, {
movement_id: movId,
movement_date: (typeof shipmentToday_ === 'function' ? shipmentToday_() : now),
warehouse_id: F.dest, sku: t.sku, movement_type: 'shipment_receipt', movement_scope: 'available_stock',
from_stock_type: '', to_stock_type: 'available',
wh_quantity: amt, wh_quantity_before: before, wh_quantity_after: after,
wh_before_available_stock: before, wh_after_available_stock: after,
reference_type: 'shipment_receipt', reference_id: ref, source_module: 'shipment_receipt',
created_by: actor, created_at: now, note: 'shipment ' + shipmentId + ' line ' + t.lid
});
F.posted[t.lid] = t.target; F.count[ref] = 1;
var c = stock(t.sku, after);
posting.lines.push({ sku: t.sku, warehouse_id: F.dest, delta: amt, before_available: before, after_available: after, reference_id: ref, movement_id: movId, idempotent: false, row_created: c });
postedCount++;
});
posting.status = postedCount > 0 ? 'POSTED' : 'POSTED_IDEMPOTENT';
return posting;
} catch (postErr) {
posting.status = 'POSTING_INCOMPLETE'; posting.stage = stage; posting.failed_line = lineId;
posting.error = String(postErr && postErr.message ? postErr.message : postErr);
return posting;
}
}
// A-DELTA1 P0-1 (Owner 2026-11-21, final A UAT): shipments.status becomes the canonical `arrived` when - and only when - the route is advanced
// (or re-confirmed) to the shipment's TRUE destination node. Same rule as the map's glmArrivalNode_ (global-logistics-map.js): every
// sequence_no a positive number with ONE maximum; that terminal node current/completed (read BACK from shipment_routes after the move);
// not a transit gateway; its exact lineage reaches the shipment's destination warehouse (location_ref_type warehouse = destination, or the
// referenced / template logistics_locations row's warehouse_id). Never a label, a node name, `max sequence` alone or an event text.
// Written only from shipped / in_transit, only when no line has any received quantity, never on an imported record that is not COUNTED
// (DISPLAY_ONLY keeps in_transit: 80_ shiDisplayEditable_ display maintenance stays open). Never `delivered` / `completed`; quantities, stock,
// supply mode, receipt and the ledger are not touched. Inside the route lock; success is reported from a read-back of the row.
var SHIP_ARRIVAL_GATEWAY_RE_ = /port|airport|air_?cargo|seaport|harbou?r|vessel|customs|clearance|bonded|border|frontier|rail|railway|truck_?terminal|motor_?carrier|cross_?dock|terminal|hub|transship|tranship|sort_?center|sortation|consolidation|parcel|courier|carrier_?facility|centroid|waypoint|midpoint|transit_?point|gateway/i;   // = global-logistics-map.js GATEWAY_NODE_RE
var SHIP_ARRIVAL_STATUS_ = 'arrived';
var SHIP_ARRIVAL_FROM_ = { shipped: 1, in_transit: 1 };
function shipArrivalNodeClass_(st) { st = String(st == null ? '' : st).trim().toLowerCase(); if (/exception|delay|hold|problem|stuck|fail/.test(st)) return 'exception'; if (/current|in_progress|active|transit|ongoing/.test(st)) return 'current'; if (/complete|done|departed|arrived|received|cleared|delivered/.test(st)) return 'completed'; return 'planned'; }
// PURE. nodes: [{ id, seq, status, locationRefType, locationRefId, routeTemplateNodeId, nodeType, nodeCode, plannedEventType }]; locById: { id: row };
// owners: { warehouse: { id: [rows] }, factory: { id: [rows] } }; tpl: { route_template_node_id: [rows] }. Mirrors glmArrivalNode_ + glmNodeLocation_.
// A-delta2 R (Owner rule 4): whCount (optional) = function (warehouse_id) -> number of warehouses rows; used only by the placeholder resolution below.
function shipArrivalVerdict_(nodes, dest, locById, owners, tpl, whCount) {
  nodes = nodes || []; dest = String(dest == null ? '' : dest).trim(); locById = locById || {}; owners = owners || { warehouse: {}, factory: {} }; tpl = tpl || {};
  if (!nodes.length) return { arrived: false, code: 'NO_ROUTE' };
  var maxSeq = -Infinity, cnt = 0, t = null;
  for (var i = 0; i < nodes.length; i++) { var sq = Number(nodes[i].seq); if (nodes[i].seq === '' || nodes[i].seq === null || !isFinite(sq) || sq <= 0) return { arrived: false, code: 'ROUTE_ORDER_UNVERIFIED' };
    if (sq > maxSeq) { maxSeq = sq; cnt = 1; t = nodes[i]; } else if (sq === maxSeq) cnt++; }
  if (cnt !== 1) return { arrived: false, code: 'ROUTE_ORDER_UNVERIFIED' };
  var node = { id: String(t.id || ''), sequence_no: maxSeq, status: String(t.status || ''), location_ref_type: String(t.locationRefType || ''), location_ref_id: String(t.locationRefId || ''), route_template_node_id: String(t.routeTemplateNodeId || '') };
  var cls = shipArrivalNodeClass_(t.status);
  if (cls !== 'current' && cls !== 'completed') return { arrived: false, code: 'NOT_AT_LAST_NODE', terminal_node: node };
  if (SHIP_ARRIVAL_GATEWAY_RE_.test(String(t.nodeType || '') + ' ' + String(t.nodeCode || '') + ' ' + String(t.plannedEventType || ''))) return { arrived: false, code: 'LAST_NODE_IS_GATEWAY', terminal_node: node };
  if (!dest) return { arrived: false, code: 'DESTINATION_WAREHOUSE_MISSING', terminal_node: node, missing_field: 'shipments.destination_warehouse_id / warehouse_id' };
  var tp = String(t.locationRefType || '').trim().toLowerCase(), ref = String(t.locationRefId || '').trim(), loc = null, via = '', miss = '', placeholderOk = false;
  if (ref) {
    if (!tp || tp === 'logistics_location') { loc = locById[ref] || null; via = 'LOCATION_REF'; if (!loc) miss = 'logistics_locations.logistics_location_id = ' + ref; }
    else if (tp === 'warehouse' || tp === 'factory') { var m = (owners[tp] || {})[ref] || []; if (m.length === 1) { loc = m[0]; via = 'LOCATION_REF_' + tp.toUpperCase(); } else miss = m.length ? 'logistics_locations: more than one row for ' + tp + ' ' + ref : 'logistics_locations.' + tp + '_id = ' + ref; }
    else miss = 'shipment_routes.location_ref_type (' + tp + ' is not a known type)';
  } else if (t.routeTemplateNodeId) {
    var tn = tpl[String(t.routeTemplateNodeId)] || [];
    if (tn.length !== 1) miss = tn.length ? 'shipment_route_template_nodes: more than one row ' + t.routeTemplateNodeId : 'shipment_route_template_nodes row ' + t.routeTemplateNodeId;
    else if (String(tn[0].logistics_location_id || '').trim()) { loc = locById[String(tn[0].logistics_location_id).trim()] || null; via = 'TEMPLATE_NODE_LOCATION'; if (!loc) miss = 'logistics_locations.logistics_location_id = ' + tn[0].logistics_location_id; }
    else { var ph = shipArrivalPlaceholder_(tn[0], tpl, dest, owners, whCount);   // A-delta2 R: an OLD snapshot whose terminal is the template's destination placeholder
      if (ph.ok) { loc = ph.loc; via = 'TEMPLATE_DESTINATION_PLACEHOLDER'; placeholderOk = true; } else miss = ph.miss || ('shipment_route_template_nodes.logistics_location_id (template node ' + t.routeTemplateNodeId + ')'); }
  } else miss = 'shipment_routes.location_ref_id (and no route_template_node_id)';
  var mapped = loc ? String(loc.warehouse_id == null ? '' : loc.warehouse_id).trim() : '';
  if (placeholderOk && !loc) mapped = dest;   // placeholder bound through the warehouses row (no logistics_locations row for it)
  node.mapped_warehouse_id = (tp === 'warehouse' && ref) ? ref : mapped; node.resolved_via = via;
  var ok = (tp === 'warehouse' && ref === dest) || (!!loc && mapped === dest) || (placeholderOk && mapped === dest);
  if (!ok) return { arrived: false, code: 'LAST_NODE_NOT_DESTINATION', terminal_node: node, destination_warehouse_id: dest, missing_field: miss || ('logistics_locations.warehouse_id = ' + dest + ' for the last route node') };
  return { arrived: true, code: 'AT_DESTINATION', terminal_node: node, destination_warehouse_id: dest };
}
// A-delta2 R (Owner rule 4, 2026-11-21) PURE. A route terminal with NO reference of its own (blank location_ref_id) whose route_template_node_id is ONE
// template row flagged is_destination_placeholder resolves to the shipment's formal destination warehouse only when: that row has no reference of
// its own (logistics_location_id / location_ref_id), it is not a gateway, it is the ONLY placeholder of its template, every node of its template
// has a positive sequence and it holds the single maximum, and the destination is exactly one logistics_locations row (warehouse_id) - or, with
// none, exactly one warehouses row. Two location rows refuse. Never a name or a label. = global-logistics-map.js glmPlaceholderLoc_.
function shipArrivalPlaceholder_(tn, tpl, dest, owners, whCount) {
  var s = function (v) { return String(v == null ? '' : v).trim(); }, truthy = function (v) { var x = s(v).toLowerCase(); return v === true || x === 'true' || x === '1' || x === 'yes' || x === 'y'; };
  var id = s(tn.route_template_node_id);
  if (!truthy(tn.is_destination_placeholder)) return { ok: false };
  if (s(tn.logistics_location_id) || s(tn.location_ref_id)) return { ok: false, miss: 'shipment_route_template_nodes ' + id + ' carries its own reference' };
  if (SHIP_ARRIVAL_GATEWAY_RE_.test(s(tn.node_type) + ' ' + s(tn.node_code) + ' ' + s(tn.planned_event_type))) return { ok: false, miss: 'shipment_route_template_nodes ' + id + ' is a transit gateway' };
  var tid = s(tn.route_template_id); if (!tid) return { ok: false, miss: 'shipment_route_template_nodes.route_template_id (' + id + ')' };
  var maxSeq = -Infinity, cnt = 0, phN = 0, bad = false, mine = Number(tn.node_sequence);
  Object.keys(tpl || {}).forEach(function (k) { (tpl[k] || []).forEach(function (r) { if (s(r.route_template_id) !== tid) return;
    var q = Number(r.node_sequence); if (s(r.node_sequence) === '' || !isFinite(q) || q <= 0) { bad = true; return; }
    if (q > maxSeq) { maxSeq = q; cnt = 1; } else if (q === maxSeq) cnt++;
    if (truthy(r.is_destination_placeholder)) phN++; }); });
  if (bad || cnt !== 1 || mine !== maxSeq) return { ok: false, miss: 'shipment_route_template_nodes: ' + id + ' is not the single last node of ' + tid };
  if (phN !== 1) return { ok: false, miss: 'shipment_route_template_nodes: ' + tid + ' has ' + phN + ' destination placeholders' };
  if (!dest) return { ok: false, miss: 'shipments.destination_warehouse_id' };
  var m = ((owners || {}).warehouse || {})[dest] || [];
  if (m.length > 1) return { ok: false, miss: 'logistics_locations: more than one row for warehouse ' + dest };
  if (m.length === 1) return { ok: true, loc: m[0] };
  var n = typeof whCount === 'function' ? whCount(dest) : 0;
  return n === 1 ? { ok: true, loc: null } : { ok: false, miss: n > 1 ? 'warehouses: more than one row ' + dest : 'logistics_locations.warehouse_id / warehouses row = ' + dest };
}
// PURE. facts: { status, origin, supplyMode, receivedAny }. Whether a verified arrival may be persisted as status `arrived`.
function shipArrivalPersistDecision_(verdict, facts) {
  facts = facts || {}; var st = String(facts.status == null ? '' : facts.status).trim().toLowerCase();
  if (!verdict || !verdict.arrived) return { persist: false, reason: (verdict && verdict.code) || 'NOT_ARRIVED', from: st, to: st };
  if (st === SHIP_ARRIVAL_STATUS_) return { persist: false, reason: 'ALREADY_ARRIVED', from: st, to: st };
  if (!SHIP_ARRIVAL_FROM_[st]) return { persist: false, reason: 'STATUS_NOT_SHIPPED_OR_IN_TRANSIT', from: st, to: st };
  if (String(facts.origin || '').trim() === 'IMPORT_HISTORICAL' && String(facts.supplyMode || '').trim().toUpperCase() !== 'COUNTED') return { persist: false, reason: 'IMPORT_NOT_COUNTED_DISPLAY_ONLY_KEPT', from: st, to: st };
  if (facts.receivedAny) return { persist: false, reason: 'RECEIPT_ALREADY_STARTED', from: st, to: st };
  return { persist: true, reason: 'AT_DESTINATION', from: st, to: SHIP_ARRIVAL_STATUS_ };
}
function shipArrivalRows_(ss, name) { var sh = ss.getSheetByName(name); return sh ? shipmentReadSheet_(sh) : null; }
// Inside the caller's lock, AFTER its route writes were flushed: reads everything BACK, decides, writes at most status + updated_at + updated_by,
// then reads the row again. Any failure leaves the route as written and returns persisted:false with its reason (never a fake arrival).
function shipArrivalApply_(ss, shipmentId, actor, now) {
  var rs = shipArrivalRows_(ss, 'shipment_routes'); if (!rs) return { arrived: false, persisted: false, code: 'ROUTE_NOT_READ' };
  var c = function (n) { return rs.col(n); }, nodes = [];
  for (var r = 1; r < rs.rows.length; r++) { var w = rs.rows[r]; if (String(w[c('shipment_id')]).trim() !== shipmentId) continue;
    var g = function (n) { var k = c(n); return k === -1 ? '' : w[k]; };
    nodes.push({ id: String(g('route_template_node_id') || g('shipment_route_id') || '').trim(), seq: g('sequence_no'), status: String(g('status') || '').trim(), locationRefType: String(g('location_ref_type') || '').trim(), locationRefId: String(g('location_ref_id') || '').trim(),
      routeTemplateNodeId: String(g('route_template_node_id') || '').trim(), nodeType: String(g('node_type') || ''), nodeCode: String(g('node_code') || ''), plannedEventType: String(g('planned_event_type') || '') }); }
  var sp = shipArrivalRows_(ss, 'shipments'); if (!sp) return { arrived: false, persisted: false, code: 'SHIPMENT_NOT_READ' };
  var sId = sp.col('shipment_id'), sSt = sp.col('status'), row = -1, rv = null;
  for (var y = 1; y < sp.rows.length; y++) if (String(sp.rows[y][sId]).trim() === shipmentId) { if (row !== -1) return { arrived: false, persisted: false, code: 'SHIPMENT_ROW_AMBIGUOUS' }; row = y + 1; rv = sp.rows[y]; }
  if (row === -1 || sSt === -1) return { arrived: false, persisted: false, code: 'SHIPMENT_NOT_FOUND' };
  var sv = function (n) { var k = sp.col(n); return k === -1 ? '' : String(rv[k] == null ? '' : rv[k]).trim(); };
  var dest = sv('destination_warehouse_id') || sv('warehouse_id');
  var lr = shipArrivalRows_(ss, 'logistics_locations'), locById = {}, owners = { warehouse: {}, factory: {} };
  if (lr) for (var a = 1; a < lr.rows.length; a++) { var o = {}; lr.headers.forEach(function (hd, i) { o[String(hd).trim()] = lr.rows[a][i]; });
    var lid = String(o.logistics_location_id == null ? '' : o.logistics_location_id).trim(); if (lid) locById[lid] = o;
    var wid = String(o.warehouse_id == null ? '' : o.warehouse_id).trim(), fid = String(o.factory_id == null ? '' : o.factory_id).trim();
    if (wid) (owners.warehouse[wid] = owners.warehouse[wid] || []).push(o); if (fid) (owners.factory[fid] = owners.factory[fid] || []).push(o); }
  var tr = shipArrivalRows_(ss, 'shipment_route_template_nodes'), tpl = {};
  if (tr) for (var b = 1; b < tr.rows.length; b++) { var q = {}; tr.headers.forEach(function (hd, i) { q[String(hd).trim()] = tr.rows[b][i]; }); var tid = String(q.route_template_node_id == null ? '' : q.route_template_node_id).trim(); if (tid) (tpl[tid] = tpl[tid] || []).push(q); }
  var whMemo = null, whCount = function (id) { if (whMemo === null) { whMemo = {}; var wr = shipArrivalRows_(ss, 'warehouses'), wi = wr ? wr.col('warehouse_id') : -1; if (wr && wi !== -1) for (var e = 1; e < wr.rows.length; e++) { var k = String(wr.rows[e][wi] == null ? '' : wr.rows[e][wi]).trim(); if (k) whMemo[k] = (whMemo[k] || 0) + 1; } } return whMemo[id] || 0; };   // A-delta2 R: read only when the placeholder needs it
  var verdict = shipArrivalVerdict_(nodes, dest, locById, owners, tpl, whCount);
  var receivedAny = false, ls = shipArrivalRows_(ss, 'shipment_lines');
  if (ls) { var lS = ls.col('shipment_id'), lR = ls.col('shipment_received_qty');
    for (var x = 1; x < ls.rows.length; x++) { if (String(ls.rows[x][lS]).trim() !== shipmentId) continue; if (typeof sc13RowRemoved_ === 'function' && sc13RowRemoved_(ls, ls.rows[x])) continue; if (lR !== -1 && shipReceiptNum_(ls.rows[x][lR]) > 0) { receivedAny = true; break; } } }
  var d = shipArrivalPersistDecision_(verdict, { status: sv('status'), origin: sv('record_origin'), supplyMode: sv('opening_supply_mode'), receivedAny: receivedAny });
  var out = { arrived: !!verdict.arrived, code: verdict.code, persisted: false, reason: d.reason, from: d.from, to: d.from, terminal_node: verdict.terminal_node || null, destination_warehouse_id: dest, missing_field: verdict.missing_field || '' };
  if (!d.persist) { out.status_after = d.from; return out; }
  var shipSheet = ss.getSheetByName('shipments'), uC = sp.col('updated_at'), bC = sp.col('updated_by');
  // version first, status last: a stop in between leaves a bumped version with the old status (a stale tab is refused; a retry settles it),
  // never a changed status under an old version
  var stamp = uC !== -1 ? editNextStamp_(now, [rv[uC]]) : null;
  if (uC !== -1) shipSheet.getRange(row, uC + 1).setValue(stamp);
  if (bC !== -1) shipSheet.getRange(row, bC + 1).setValue(actor);
  shipSheet.getRange(row, sSt + 1).setValue(SHIP_ARRIVAL_STATUS_);
  SpreadsheetApp.flush();
  var back = shipmentReadSheet_(shipSheet), bS = back.col('status'), bI = back.col('shipment_id'), stNow = '', upNow = '';
  for (var z = 1; z < back.rows.length; z++) if (String(back.rows[z][bI]).trim() === shipmentId) { stNow = String(back.rows[z][bS] || '').trim().toLowerCase(); upNow = uC === -1 ? '' : back.rows[z][back.col('updated_at')]; break; }
  out.persisted = stNow === SHIP_ARRIVAL_STATUS_; out.to = stNow; out.status_after = stNow; out.updated_at = upNow; if (!out.persisted) out.reason = 'ARRIVAL_READBACK_MISMATCH';
  return out;
}
// ---- AD3 A (Owner rules 6 / 7, 2026-11-21): MANUAL POSITION REPORT on a manual logistics snapshot (route_template_id MANUAL, 2 rows written by
// 22_ Confirm route_mode MANUAL or 87_ ROUTE_INIT route_mode MANUAL). Kinds: IN_TRANSIT (origin completed, destination planned, shipped -> in_transit)
// and ARRIVED_AT_DESTINATION (destination row current, then the EXISTING arrival rule shipArrivalApply_ decides `arrived` from a read-back).
// Under the script lock, everything re-read; one event per operation_id (source 'manual', source_event_id manual:<shipment>:<operation_id>,
// event_time = the reported time, created_by = the operator, note = kind / time / operator / bound destination / reason). A retry with the same
// operation_id writes nothing again (only the convergent status / arrival settle). Never touches lines, stock, ledger, receipt, destination or type.
var SHIP_MANUAL_ROUTE_ID_ = 'MANUAL', SHIP_MANUAL_NODE_ORIGIN_ = 'MANUAL:ORIGIN', SHIP_MANUAL_NODE_DEST_ = 'MANUAL:DESTINATION';
var SHIP_MANUAL_KINDS_ = { IN_TRANSIT: 'MANUAL POSITION: IN TRANSIT', ARRIVED_AT_DESTINATION: 'MANUAL POSITION: ARRIVED AT DESTINATION WAREHOUSE' };
var SHIP_MANUAL_OPEN_ = { shipped: 1, in_transit: 1, arrived: 1 };   // stuck / received / partially_received / closed / cancelled / draft states never change here
var SHIP_MANUAL_FORBIDDEN_ = ['warehouse_type', 'destination_type', 'destination_warehouse_type', 'shipment_type', 'route_mode', 'route_template_id', 'route_template_node_id', 'shipment_route_id', 'location_ref_type', 'location_ref_id', 'latitude', 'longitude', 'status'];
function shipManualTime_(v) {   // 'yyyy-MM-dd HH:mm' | 'yyyy-MM-dd' -> 'yyyy-MM-dd HH:mm:00' | ''
  var m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[ T]([0-9]{2}):([0-9]{2}))?$/.exec(String(v == null ? '' : v).trim()); if (!m) return '';
  var y = +m[1], mo = +m[2], d = +m[3], hh = m[4] === undefined ? 0 : +m[4], mi = m[5] === undefined ? 0 : +m[5];
  var dim = [31, ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (mo < 1 || mo > 12 || d < 1 || d > dim[mo - 1] || hh > 23 || mi > 59) return '';
  return m[1] + '-' + m[2] + '-' + m[3] + ' ' + (m[4] === undefined ? '00' : m[4]) + ':' + (m[5] === undefined ? '00' : m[5]) + ':00';
}
function shipManualPositionReport_(b0) {
  var sid = String(b0.shipment_id || b0.shipmentId || '').trim(), actor = String(b0.actor || b0.updated_by || 'system_user').trim();
  var no = function (code, msg, extra) { return jsonResponse_(Object.assign({ success: false, code: code, zero_write: true, shipment_id: sid, error: msg + ' Nothing was written.' }, extra || {})); };
  var kind = String(b0.manual_report == null ? '' : b0.manual_report).trim().toUpperCase();
  if (!SHIP_MANUAL_KINDS_[kind]) return no('MANUAL_REPORT_INVALID', 'manual_report must be IN_TRANSIT or ARRIVED_AT_DESTINATION.');
  var bad = SHIP_MANUAL_FORBIDDEN_.filter(function (k) { return b0[k] != null && String(b0[k]).trim() !== ''; });
  if (bad.length) return no('MANUAL_REPORT_FIELD_NOT_ALLOWED', 'A manual position report cannot set ' + bad.join(', ') + ' - the route, destination and type are the server-saved ones.', { fields: bad });
  var op = String(b0.operation_id == null ? '' : b0.operation_id).trim();
  if (!/^[A-Za-z0-9:_.-]{8,80}$/.test(op)) return no('MANUAL_REPORT_OPERATION_ID_REQUIRED', 'operation_id (8-80 characters: letters, digits, : _ . -) is required so a retry never writes twice.');
  var at = shipManualTime_(b0.report_time);
  if (!at) return no('MANUAL_REPORT_TIME_INVALID', 'report_time must be yyyy-MM-dd HH:mm (or yyyy-MM-dd) in the project time zone.');
  var now = shipmentTimestamp_();
  if (at.slice(0, 16) > String(now).slice(0, 16)) return no('MANUAL_REPORT_TIME_IN_FUTURE', 'report_time ' + at.slice(0, 16) + ' is later than now (' + String(now).slice(0, 16) + ').');
  var reason = String(b0.reason == null ? '' : b0.reason).trim();
  if (reason.length < 2 || reason.length > 200) return no('MANUAL_REPORT_REASON_REQUIRED', 'Say why / where the report comes from (2-200 characters), e.g. the forwarder message or the warehouse confirmation.');
  if (/\[SC13_/.test(reason)) return no('MANUAL_REPORT_REASON_REQUIRED', 'The reason text may not contain a system marker [SC13_...].');
  var ss = SpreadsheetApp.getActiveSpreadsheet(), routeSheet = ss.getSheetByName('shipment_routes'), shipSheet = ss.getSheetByName('shipments');
  if (!routeSheet) return no('ROUTE_NOT_SNAPSHOTTED', 'shipment_routes sheet not found.');
  if (!shipSheet) return no('SHIPMENT_NOT_FOUND', 'shipments sheet not found.');
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return no('LOCK', 'Could not acquire lock; please retry.'); } catch (eL) { return no('LOCK', 'Lock error: ' + (eL && eL.message ? eL.message : eL)); }
  try {
    var T = function (v) { return String(v == null ? '' : v).trim(); };
    // ---- re-read inside the lock: shipment ----
    var sp = shipmentReadSheet_(shipSheet), sI = sp.col('shipment_id'), sS = sp.col('status'), row = -1, rv = null;
    for (var y = 1; y < sp.rows.length; y++) if (T(sp.rows[y][sI]) === sid) { if (row !== -1) { lock.releaseLock(); return no('SHIPMENT_NOT_FOUND', 'Shipment ' + sid + ' appears more than once.'); } row = y + 1; rv = sp.rows[y]; }
    if (row === -1 || sS === -1) { lock.releaseLock(); return no('SHIPMENT_NOT_FOUND', 'Shipment not found: ' + sid + '.'); }
    var sv = function (n) { var k = sp.col(n); return k === -1 ? '' : T(rv[k]); };
    var st = sv('status').toLowerCase(), dest = sv('destination_warehouse_id') || sv('warehouse_id'), src = sv('source_warehouse_id');
    var reqDest = T(b0.destination_warehouse_id) || T(b0.warehouse_id);
    if (reqDest && reqDest !== dest) { lock.releaseLock(); return no('MANUAL_REPORT_DESTINATION_MISMATCH', 'The request names destination ' + reqDest + ' but the saved destination is ' + (dest || '(blank)') + '; a report never changes the destination.'); }
    if (!dest) { lock.releaseLock(); return no('MANUAL_ROUTE_INVALID', 'The shipment has no saved destination warehouse.', { missing_field: 'shipments.destination_warehouse_id' }); }
    var tok = T(b0.expected_updated_at), uC = sp.col('updated_at');
    var tokStale = !!(tok && uC !== -1 && typeof editTokSame_ === 'function' && editTokSame_(rv[uC], tok) !== 'SAME');   // decided after the operation id: a retry of an applied report is idempotent, not a conflict
    // ---- route rows: exactly the 2 manual rows bound to the saved source / destination ----
    var rs = shipmentReadSheet_(routeSheet), rc = function (n) { return rs.col(n); }, mine = [];
    if (rc('shipment_id') === -1 || rc('status') === -1) { lock.releaseLock(); return no('ROUTE_NOT_SNAPSHOTTED', 'shipment_routes is missing shipment_id / status.'); }
    for (var r = 1; r < rs.rows.length; r++) { var w = rs.rows[r]; if (T(w[rc('shipment_id')]) !== sid) continue; var g = function (n) { var k = rc(n); return k === -1 ? '' : T(w[k]); };
      mine.push({ rowIdx: r + 1, srid: g('shipment_route_id'), tplId: g('route_template_id'), nodeId: g('route_template_node_id'), seq: Number(g('sequence_no')), status: g('status').toLowerCase(), refType: g('location_ref_type').toLowerCase(), refId: g('location_ref_id'),
        locationName: g('location_name'), country: g('country'), city: g('city'), latitude: rc('latitude') === -1 ? '' : w[rc('latitude')], longitude: rc('longitude') === -1 ? '' : w[rc('longitude')] }); }
    if (!mine.length) { lock.releaseLock(); return no('ROUTE_NOT_SNAPSHOTTED', 'Shipment has no route rows: ' + sid + '.'); }
    if (!mine.some(function (n) { return n.tplId === SHIP_MANUAL_ROUTE_ID_; })) { lock.releaseLock(); return no('ROUTE_NOT_MANUAL', 'This shipment has a route template snapshot - use the normal Update Position.'); }
    var o = mine.filter(function (n) { return n.nodeId === SHIP_MANUAL_NODE_ORIGIN_; }), dn = mine.filter(function (n) { return n.nodeId === SHIP_MANUAL_NODE_DEST_; });
    var why = mine.length !== 2 ? 'ROUTE_ROWS_NOT_2' : (mine.some(function (n) { return n.tplId !== SHIP_MANUAL_ROUTE_ID_; }) ? 'ROUTE_MIXED' : (o.length !== 1 || dn.length !== 1 ? 'MANUAL_NODES_NOT_UNIQUE' : (o[0].seq !== 1 || dn[0].seq !== 2 ? 'MANUAL_SEQUENCE' :
      (dn[0].refType !== 'warehouse' || dn[0].refId !== dest ? 'DESTINATION_ROW_NOT_BOUND_TO_SAVED_DESTINATION' : (o[0].refType !== 'warehouse' || !src || o[0].refId !== src ? 'ORIGIN_ROW_NOT_BOUND_TO_SAVED_SOURCE' : '')))));
    if (why) { lock.releaseLock(); return no('MANUAL_ROUTE_INVALID', 'The manual route rows of this shipment are not the 2-node snapshot bound to its saved source and destination (' + why + ').', { reason: why }); }
    o = o[0]; dn = dn[0];
    if (mine.some(function (n) { return /^SRI-/.test(n.srid); })) { var pr = typeof rtiImportedTrackingProof_ === 'function' ? rtiImportedTrackingProof_(ss, sid) : { ok: false, why: 'ROUTE_INIT_PROOF_ABSENT' };
      if (!pr.ok) { lock.releaseLock(); return no('ROUTE_INIT_NOT_COMMITTED', 'The imported manual route is not proven by a COMMITTED import batch (' + pr.why + ').'); } }
    // ---- events: the operation id ----
    var evSheet = fcWriteEnsureSheet_(ss, 'shipment_events', SHIP_EVENT_HEADERS_); fcWriteEnsureColumns_(evSheet, SHIP_EVENT_HEADERS_);
    var ev = shipmentReadSheet_(evSheet), eS = ev.col('shipment_id'), eQ = ev.col('event_sequence'), eSrc = ev.col('source_event_id'), eRaw = ev.col('raw_status'), eId = ev.col('shipment_event_id'), seqs = [], prior = null, opRef = 'manual:' + sid + ':' + op;
    for (var e = 1; e < ev.rows.length; e++) { if (T(ev.rows[e][eS]) !== sid) continue; if (eQ !== -1) seqs.push(ev.rows[e][eQ]); if (eSrc !== -1 && T(ev.rows[e][eSrc]) === opRef) prior = { raw: eRaw === -1 ? '' : T(ev.rows[e][eRaw]), id: eId === -1 ? '' : T(ev.rows[e][eId]), at: ev.col('event_time') === -1 ? '' : T(ev.rows[e][ev.col('event_time')]), note: ev.col('note') === -1 ? '' : T(ev.rows[e][ev.col('note')]), by: ev.col('created_by') === -1 ? '' : T(ev.rows[e][ev.col('created_by')]) }; }
    if (prior && prior.raw !== SHIP_MANUAL_KINDS_[kind]) { lock.releaseLock(); return no('MANUAL_REPORT_OPERATION_ID_REUSED', 'operation_id ' + op + ' was already used for another report (' + prior.raw + ').'); }
    if (!prior && tokStale) { lock.releaseLock(); return no('EDIT_CONFLICT', 'EDIT_CONFLICT: this shipment was changed after your page read it. Reload and report again.', { data: { current_updated_at: typeof editTok_ === 'function' ? editTok_(rv[uC]) : '' } }); }
    // ---- shipment facts ----
    var displayOnly = sv('record_origin') === 'IMPORT_HISTORICAL' && sv('opening_supply_mode').toUpperCase() !== 'COUNTED';
    var receivedAny = false, ls = shipArrivalRows_(ss, 'shipment_lines');
    if (ls) { var lS = ls.col('shipment_id'), lR = ls.col('shipment_received_qty'); for (var x = 1; x < ls.rows.length; x++) { if (T(ls.rows[x][lS]) !== sid) continue; if (typeof sc13RowRemoved_ === 'function' && sc13RowRemoved_(ls, ls.rows[x])) continue; if (lR !== -1 && shipReceiptNum_(ls.rows[x][lR]) > 0) { receivedAny = true; break; } } }
    // Owner supplement 2: a retry of an operation that is already recorded returns ITS completed result even after the shipment moved on (receiving,
    // received, closed ...): zero writes, never a second arrival, never a status refusal for the same operation
    if (prior && (!SHIP_MANUAL_OPEN_[st] || receivedAny)) { lock.releaseLock(); return jsonResponse_({ success: true, data: { shipment_id: sid, manual_report: kind, operation_id: op, idempotent: true, already_recorded: true, writes: 0,
      recorded: { shipment_event_id: prior.id, source_event_id: opRef, report_time: prior.at, reported_by: prior.by, note: prior.note, raw_status: prior.raw }, status_now: st, destination_warehouse_id: dest,
      arrival: { arrived: kind === 'ARRIVED_AT_DESTINATION', persisted: false, reason: 'OPERATION_ALREADY_RECORDED', status_after: st } } }); }
    if (!SHIP_MANUAL_OPEN_[st]) { lock.releaseLock(); return no('MANUAL_REPORT_STATUS_NOT_OPEN', 'Status "' + (st || '(blank)') + '" is not open for a position report (only shipped / in_transit / arrived).', { status: st }); }
    if (receivedAny) { lock.releaseLock(); return no('RECEIPT_ALREADY_STARTED', 'A receipt has started on this shipment; its position is no longer reported.'); }
    if (kind === 'ARRIVED_AT_DESTINATION' && displayOnly) { lock.releaseLock(); return no('MANUAL_ARRIVAL_DISPLAY_ONLY', 'This imported record is display-only (not counted): it is never marked arrived or received in this system.'); }
    var destCurrent = /current|completed/.test(dn.status);
    if (kind === 'IN_TRANSIT' && !prior && (destCurrent || st === 'arrived')) { lock.releaseLock(); return no('MANUAL_REPORT_BACKWARD', 'The shipment is already reported at its destination; a position never moves backwards.'); }
    // ---- writes (convergent; the event once per operation id) ----
    var setRow = function (n, val) { if (n.status === val) return false; routeSheet.getRange(n.rowIdx, rc('status') + 1).setValue(val); if (rc('updated_at') !== -1) routeSheet.getRange(n.rowIdx, rc('updated_at') + 1).setValue(now); n.status = val; return true; };
    var nodeWrites = 0;
    if (kind === 'IN_TRANSIT') { if (!destCurrent && setRow(o, 'completed')) nodeWrites++; }
    else { if (setRow(o, 'completed')) nodeWrites++; if (!destCurrent && setRow(dn, 'current')) nodeWrites++; }
    if (nodeWrites) SpreadsheetApp.flush();
    var promotion = { promoted: false, reason: 'NOT_APPLICABLE', from: st, to: st };
    if (kind === 'IN_TRANSIT' && st === SHIP_PROMOTE_FROM_ && displayOnly) promotion.reason = 'DISPLAY_ONLY_STATUS_KEPT';   // REVIEW_AD3 minor 1: display position maintenance only, never a status write
    else if (kind === 'IN_TRANSIT' && st === SHIP_PROMOTE_FROM_) {
      var bC = sp.col('updated_by');
      if (uC !== -1) shipSheet.getRange(row, uC + 1).setValue(editNextStamp_(now, [rv[uC]]));
      if (bC !== -1) shipSheet.getRange(row, bC + 1).setValue(actor);
      shipSheet.getRange(row, sS + 1).setValue(SHIP_PROMOTE_TO_); SpreadsheetApp.flush();
      promotion = { promoted: true, reason: 'MANUAL_IN_TRANSIT_REPORTED', from: st, to: SHIP_PROMOTE_TO_ };
    } else if (kind === 'IN_TRANSIT') promotion.reason = st === SHIP_PROMOTE_TO_ ? 'ALREADY_IN_TRANSIT' : 'NOT_IN_SHIPPED_STATE';
    var routeEvent = { appended: false, idempotent: !!prior, source_event_id: opRef, shipment_event_id: prior ? prior.id : '' };
    if (!prior && kind === 'ARRIVED_AT_DESTINATION' && destCurrent && st === SHIP_ARRIVAL_STATUS_) routeEvent.reason = 'ALREADY_ARRIVED';   // a second arrival report adds no second arrival event
    else if (!prior) {
      var tn = kind === 'IN_TRANSIT' ? o : dn, okC = typeof rtiCoordOk_ === 'function' ? rtiCoordOk_(tn.latitude, tn.longitude) : false, sevId = 'SEV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8).toUpperCase(), seq = shipEventNextSequence_(seqs);
      fcWriteAppendByHeader_(evSheet, { shipment_event_id: sevId, shipment_id: sid, shipment_route_id: tn.srid, event_sequence: seq, event_time: at,
        event_type: kind === 'IN_TRANSIT' ? 'manual_in_transit' : 'route_node_reached', event_status: kind === 'IN_TRANSIT' ? 'in_transit' : 'current',
        location_name: kind === 'IN_TRANSIT' ? '' : tn.locationName, country: kind === 'IN_TRANSIT' ? '' : tn.country, city: kind === 'IN_TRANSIT' ? '' : tn.city,
        latitude: (kind !== 'IN_TRANSIT' && okC) ? Number(tn.latitude) : '', longitude: (kind !== 'IN_TRANSIT' && okC) ? Number(tn.longitude) : '',
        source: 'manual', source_event_id: opRef, raw_status: SHIP_MANUAL_KINDS_[kind],
        note: ('Manual position ' + kind + ' reported ' + at.slice(0, 16) + ' by ' + actor + ' | destination ' + dest + ' | ' + reason).slice(0, 500),
        created_by: actor, created_at: now, updated_by: actor, updated_at: now });
      SpreadsheetApp.flush();
      routeEvent = { appended: true, idempotent: false, source_event_id: opRef, shipment_event_id: sevId, event_sequence: seq };
    }
    var arrival = { arrived: false, persisted: false, code: 'NOT_EVALUATED' };
    if (kind === 'ARRIVED_AT_DESTINATION') { try { arrival = shipArrivalApply_(ss, sid, actor, now); } catch (eA) { arrival = { arrived: false, persisted: false, code: 'ARRIVAL_WRITE_FAILED', reason: 'ARRIVAL_WRITE_FAILED', error: String(eA && eA.message ? eA.message : eA) }; } }
    lock.releaseLock();
    return jsonResponse_({ success: true, data: { shipment_id: sid, manual_report: kind, operation_id: op, idempotent: !!prior, report_time: at, route_mode: 'MANUAL', destination_warehouse_id: dest,
      lifecycle_promotion: promotion, arrival: arrival, route_event: routeEvent, route_rows_written: nodeWrites,
      nodes: [o, dn].map(function (n) { return { route_template_node_id: n.nodeId, shipment_route_id: n.srid, sequence_no: n.seq, status: n.status }; }) } });
  } catch (err) {
    try { lock.releaseLock(); } catch (e2) {}
    return jsonResponse_({ success: false, code: 'WRITE', shipment_id: sid, error: 'Manual position report failed: ' + (err && err.message ? err.message : err) + '. A retry with the same operation_id is safe (it never writes the event twice).' });
  }
}
function handleAdvanceShipmentRoutePoint_(body) {
body = body || {};
var b0 = (body.payload && typeof body.payload === 'object') ? body.payload : body;
var shipmentId = String(b0.shipment_id || b0.shipmentId || '').trim();
var actor = String(b0.actor || b0.updated_by || 'system_user').trim();
var targetTemplateNode = String(b0.route_template_node_id || b0.routeTemplateNodeId || '').trim();
var targetRouteId = String(b0.shipment_route_id || b0.shipmentRouteId || '').trim();
if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id', code: 'INPUT' });
if (b0.manual_report != null && String(b0.manual_report).trim() !== '') return shipManualPositionReport_(b0);   // AD3 A (Owner rule 6): the manual position report on a MANUAL snapshot
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
var rLocName = rs.col('location_name'), rCountry = rs.col('country'), rCity = rs.col('city'), rLat = rs.col('latitude'), rLng = rs.col('longitude');
if (rShipCol === -1 || rSeqCol === -1 || rStatusCol === -1) {
lock.releaseLock();
return jsonResponse_({ success: false, error: 'shipment_routes is missing required columns (shipment_id / sequence_no / status).', code: 'CONTRACT' });
}


var nodes = [];
for (var r = 1; r < rs.rows.length; r++) {
if (String(rs.rows[r][rShipCol]).trim() !== shipmentId) continue;
var tid = rNodeCol !== -1 ? String(rs.rows[r][rNodeCol] || '').trim() : '';
var srid = rIdCol !== -1 ? String(rs.rows[r][rIdCol] || '').trim() : '';
nodes.push({
id: targetTemplateNode ? tid : srid,
routeTemplateNodeId: tid, shipmentRouteId: srid, routeTemplateId: rs.col('route_template_id') !== -1 ? String(rs.rows[r][rs.col('route_template_id')] || '').trim() : '',   // AD3 A
seq: Math.round(shipReceiptNum_(rs.rows[r][rSeqCol])),
status: String(rs.rows[r][rStatusCol] || '').trim(),
locationName: rLocName !== -1 ? String(rs.rows[r][rLocName] || '').trim() : '',
country: rCountry !== -1 ? String(rs.rows[r][rCountry] || '').trim() : '',
city: rCity !== -1 ? String(rs.rows[r][rCity] || '').trim() : '',
latitude: rLat !== -1 ? rs.rows[r][rLat] : '',
longitude: rLng !== -1 ? rs.rows[r][rLng] : '',
rowIdx: r + 1
});
}
if (!nodes.length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment has no route nodes: ' + shipmentId, code: 'ROUTE_NOT_SNAPSHOTTED' }); }
// AD3 A: a MANUAL snapshot moves only through the manual report (operator / report time / reason / operation id recorded); zero write here
if (nodes.some(function (n) { return n.routeTemplateId === SHIP_MANUAL_ROUTE_ID_; })) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'ROUTE_MANUAL_REPORT_REQUIRED', zero_write: true, shipment_id: shipmentId, error: 'This shipment uses manual logistics (no route template): report its position with the manual report (in transit / arrived at destination warehouse). Nothing was written.' }); }
// A2 b5 (REVIEW_A2 m-7): an imported-tracking (SRI-) route moves only when a COMMITTED import proves it - the receipt gate's own proof; zero write otherwise
if (nodes.some(function (n) { return /^SRI-/.test(String(n.shipmentRouteId || '')); })) { var rtiAdv_ = typeof rtiImportedTrackingProof_ === 'function' ? rtiImportedTrackingProof_(ss, shipmentId) : { ok: false, why: 'ROUTE_INIT_PROOF_ABSENT' };
  if (!rtiAdv_.ok) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'ROUTE_INIT_NOT_COMMITTED', zero_write: true, shipment_id: shipmentId, error: '此單的匯入追蹤路線尚未由已完成（COMMITTED）的匯入批次證實（' + rtiAdv_.why + '）：不能更新位置。請先處理該匯入批次。未寫入。' }); } }

var targetId = targetTemplateNode || targetRouteId;
var move = shipRouteResolveMove_(nodes, targetId);
if (!move.ok) {
lock.releaseLock();
var msg = move.code === 'ROUTE_BACKWARD'
? 'Cannot move the shipment backwards along its route (no correction workflow exists). Request rejected.'
: 'The selected route point is not part of this shipment\'s route.';
return jsonResponse_({ success: false, error: msg, code: move.code });
}


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





var routeEvent = null;
if (move.code === 'ADVANCED') {
var tgt = null;
for (var t = 0; t < nodes.length; t++) { if (String(nodes[t].id) === String(targetId)) { tgt = nodes[t]; break; } }
if (tgt && tgt.shipmentRouteId) {
routeEvent = shipAppendLifecycleEvent_(ss, {
shipment_id: shipmentId, shipment_route_id: tgt.shipmentRouteId,
event_type: 'route_node_reached', event_status: 'current',
source_event_id: shipRouteEventSourceId_(shipmentId, tgt.shipmentRouteId),
location_name: tgt.locationName, country: tgt.country, city: tgt.city, latitude: tgt.latitude, longitude: tgt.longitude,
raw_status: 'ROUTE NODE REACHED', note: 'Route advanced to node #' + tgt.seq + '.', actor: actor, now: now
});
}
}






var promotion = { promoted: false, reason: 'NOT_EVALUATED', from: '', to: '' };
try {
var originSeq = null;
for (var oi = 0; oi < nodes.length; oi++) { if (originSeq === null || nodes[oi].seq < originSeq) originSeq = nodes[oi].seq; }
var tgtNode = null;
for (var ti = 0; ti < nodes.length; ti++) { if (String(nodes[ti].id) === String(targetId)) { tgtNode = nodes[ti]; break; } }
var shipSheetP = ss.getSheetByName('shipments');
var sp = shipSheetP ? shipmentReadSheet_(shipSheetP) : null;
var spStatusCol = sp ? sp.col('status') : -1, spIdCol = sp ? sp.col('shipment_id') : -1, spRow = -1, curShipStatus = '';
if (sp && spIdCol !== -1) {
for (var pr = 1; pr < sp.rows.length; pr++) {
if (String(sp.rows[pr][spIdCol]).trim() === shipmentId) { spRow = pr + 1; curShipStatus = spStatusCol === -1 ? '' : String(sp.rows[pr][spStatusCol] || '').trim(); break; }
}
}
var decision = shipPromoteOnProgress_({
current_status: curShipStatus, move_code: move.code,
origin_sequence_no: originSeq, target_sequence_no: tgtNode ? tgtNode.seq : null
});
promotion = { promoted: false, reason: decision.reason, from: decision.from, to: decision.to };
if (decision.promote && spRow !== -1 && spStatusCol !== -1) {
shipSheetP.getRange(spRow, spStatusCol + 1).setValue(SHIP_PROMOTE_TO_);
var pDep = sp.col('actual_departure_date');

if (pDep !== -1 && !String(sp.rows[spRow - 1][pDep] || '').trim()) shipSheetP.getRange(spRow, pDep + 1).setValue(String(now).substring(0, 10));
var pUpd = sp.col('updated_at'); if (pUpd !== -1) shipSheetP.getRange(spRow, pUpd + 1).setValue(editNextStamp_(now, [sp.rows[spRow - 1][pUpd]]));   // R71 small-3 (review m1)
var pUpdBy = sp.col('updated_by'); if (pUpdBy !== -1) shipSheetP.getRange(spRow, pUpdBy + 1).setValue(actor);
SpreadsheetApp.flush();
promotion.promoted = true;
}
} catch (promoErr) {

promotion = { promoted: false, reason: 'PROMOTION_WRITE_FAILED', from: promotion.from, to: promotion.to, error: String(promoErr && promoErr.message ? promoErr.message : promoErr) };
}

// A-DELTA1 P0-1: after the route (and any shipped -> in_transit promotion) is written - ADVANCED or IDEMPOTENT, so a retry of the last node
// can still settle it - decide `arrived` from a read-back, inside this lock. A failure here never undoes the route and never claims arrival.
var arrival = { arrived: false, persisted: false, code: 'NOT_EVALUATED' };
var c3Last_ = -Infinity, c3N_ = 0, c3Tgt_ = null; nodes.forEach(function (n0) { if (n0.seq > c3Last_) { c3Last_ = n0.seq; c3N_ = 1; } else if (n0.seq === c3Last_) c3N_++; if (String(n0.id) === String(targetId)) c3Tgt_ = n0.seq; });   // A-delta1 C3 (REVIEW_AD1 L-1)
if (!(c3N_ === 1 && c3Tgt_ === c3Last_)) arrival = { arrived: false, persisted: false, code: c3N_ !== 1 ? 'ROUTE_ORDER_UNVERIFIED' : 'NOT_AT_LAST_NODE', skipped_read: true };   // not the single last node: no arrival read inside the lock
else try { arrival = shipArrivalApply_(ss, shipmentId, actor, now); }
catch (arrErr) { arrival = { arrived: false, persisted: false, code: 'ARRIVAL_WRITE_FAILED', reason: 'ARRIVAL_WRITE_FAILED', error: String(arrErr && arrErr.message ? arrErr.message : arrErr) }; }
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
lifecycle_promotion: promotion,
arrival: arrival,   // A-DELTA1 P0-1
nodes: summary,
route_event: routeEvent
}
});
} catch (err) {
try { lock.releaseLock(); } catch (e) {}
return jsonResponse_({ success: false, error: 'Route advance failed: ' + (err && err.message ? err.message : err), code: 'WRITE' });
}
}



























var SHIP_ETA_TZ_CONTRACT_ = 'Session.getScriptTimeZone() — the single date authority used by 02_ formatValue_, 11_, 12_ and 13_ procurementDateOnly_; a named business timezone, never UTC';

function handleUpdateShipmentEta_(body) {
body = body || {};
var b0 = (body.payload && typeof body.payload === 'object') ? body.payload : body;
var shipmentId = String(b0.shipment_id || b0.shipmentId || '').trim();
var actor = String(b0.actor || b0.updated_by || 'system_user').trim();
var rawEta = (b0.eta != null ? b0.eta : b0.ETA);
var etaCheck = shipEtaValidate_(rawEta);


if (!shipmentId) return jsonResponse_({ success: false, error: 'shipment_id is required (the INTERNAL shipments.shipment_id).', code: 'SHIPMENT_ID_REQUIRED', zero_write: true });
if (!etaCheck.ok) return jsonResponse_({ success: false, error: 'ETA must be a valid calendar date in YYYY-MM-DD form.', code: 'ETA_INVALID', zero_write: true, received: String(rawEta == null ? '' : rawEta) });

var intended = etaCheck.value;
var ss = SpreadsheetApp.getActiveSpreadsheet();
var shipSheet = ss.getSheetByName('shipments');
if (!shipSheet) return jsonResponse_({ success: false, error: 'shipments sheet not found', code: 'LOAD', zero_write: true });

var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry. Nothing was written.', code: 'LOCK', zero_write: true }); }
catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), code: 'LOCK', zero_write: true }); }

try {
var sh = shipmentReadSheet_(shipSheet);
var sIdCol = sh.col('shipment_id'), sEtaCol = sh.col('eta');
var sUpdAt = sh.col('updated_at'), sUpdBy = sh.col('updated_by'), sStatus = sh.col('status');
if (sIdCol === -1) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'shipments is missing the shipment_id column.', code: 'ETA_HEADER_MISSING', missing_header: 'shipment_id', zero_write: true }); }
if (sEtaCol === -1) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'shipments is missing the eta column, so there is nowhere to store an ETA.', code: 'ETA_HEADER_MISSING', missing_header: 'eta', zero_write: true }); }



var matches = [];
for (var i = 1; i < sh.rows.length; i++) { if (String(sh.rows[i][sIdCol]).trim() === shipmentId) matches.push(i + 1); }
if (matches.length === 0) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId + '. This action takes the INTERNAL shipment_id, not external_shipment_id or shipment_no.', code: 'SHIPMENT_NOT_FOUND', zero_write: true }); }
if (matches.length > 1) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'More than one shipments row carries this shipment_id (' + matches.length + '); refusing to guess which one to update.', code: 'SHIPMENT_IDENTITY_AMBIGUOUS', matched_rows: matches.length, zero_write: true }); }
var row = matches[0];


var beforeEta = shipEtaDateOnly_(sh.rows[row - 1][sEtaCol]);
var beforeStatus = sStatus !== -1 ? String(sh.rows[row - 1][sStatus] || '').trim() : '';
// A final3 b9 (REVIEW_AFINAL3 MAJOR-1 / checklist M01): the map ETA write carries the shipments.updated_at it was entered against
// (expected_updated_at) and is checked by the SAME rule every other shipment writer uses: 12_ editP1Gate15f2_ + editTokSame_ (as 31_
// n1ReceiptVersionGate_ for receipts and 22_:232 for Confirm). A resend of the value already stored answers UNCHANGED with zero writes
// BEFORE the gate, so a lost answer re-sent with the old token never becomes a conflict and nothing is written twice. A stale, token-less
// (row has a readable version) or unreadable token is refused with zero writes. Writes stay eta / updated_at / updated_by only.
if (beforeEta === intended) {
lock.releaseLock();
return jsonResponse_({ success: true, data: { shipment_id: shipmentId, eta: beforeEta, eta_intended: intended, eta_before: beforeEta, changed: false, outcome: 'UNCHANGED', zero_write: true, read_after_write: true, rows_matched: 1, timezone_contract: SHIP_ETA_TZ_CONTRACT_, status: beforeStatus, status_unchanged: true, current_position_unchanged: true, shipment_events_appended: 0 } });
}
if (typeof editP1Gate15f2_ !== 'function' || typeof editTokSame_ !== 'function') { lock.releaseLock(); return jsonResponse_({ success: false, code: 'DEPLOYMENT_HALF_SYNCED', zero_write: true, shipment_id: shipmentId, error: '未儲存：伺服器版本不完整（31_ 需要 12_ 的版本檢查）。沒有寫入。' }); }
var tokEta_ = b0.expected_updated_at == null ? '' : String(b0.expected_updated_at).trim(), cellEta_ = sUpdAt !== -1 ? sh.rows[row - 1][sUpdAt] : undefined;
var gEta_ = editP1Gate15f2_(cellEta_, tokEta_);
if (!gEta_ && tokEta_ !== '' && editTokSame_(cellEta_, tokEta_) !== 'SAME') gEta_ = { code: 'EDIT_CONFLICT', error: '未儲存：此單在你開啟後已被修改。沒有寫入。請重新整理後再改 ETA。', data: { current_updated_at: editTok_(cellEta_) } };
if (gEta_) { lock.releaseLock(); return jsonResponse_({ success: false, code: gEta_.code, zero_write: true, stage: 'edit_conflict', shipment_id: shipmentId, error: gEta_.error, data: Object.assign({ shipment_id: shipmentId, zero_write: true, current_eta: beforeEta }, gEta_.data || {}) }); }

var now = shipmentTimestamp_();
shipSheet.getRange(row, sEtaCol + 1).setValue(intended);
var etaStamp_ = sUpdAt !== -1 ? editNextStamp_(now, [sh.rows[row - 1][sUpdAt]]) : now;   // R71 small-3 (review m1): written and answered as the same value
if (sUpdAt !== -1) shipSheet.getRange(row, sUpdAt + 1).setValue(etaStamp_);
if (sUpdBy !== -1) shipSheet.getRange(row, sUpdBy + 1).setValue(actor);
SpreadsheetApp.flush();





var afterRaw = shipSheet.getRange(row, sEtaCol + 1).getValue();
var persisted = shipEtaDateOnly_(afterRaw);
var afterStatus = sStatus !== -1 ? String(shipSheet.getRange(row, sStatus + 1).getValue() || '').trim() : '';
lock.releaseLock();

if (!persisted) {
return jsonResponse_({ success: false, code: 'ETA_WRITE_NOT_ACKNOWLEDGED',
error: 'The ETA cell could not be read back after the write, so persistence is NOT confirmed. Re-open the shipment and check the stored ETA before retrying.',
shipment_id: shipmentId, intended_eta: intended, persisted_eta: '', zero_write: false });
}
if (persisted !== intended) {
return jsonResponse_({ success: false, code: 'ETA_READBACK_MISMATCH',
error: 'The stored ETA (' + persisted + ') is not the ETA that was sent (' + intended + '). The row was written but does not hold the intended calendar date — do NOT retry blindly; inspect the shipments row.',
shipment_id: shipmentId, intended_eta: intended, persisted_eta: persisted,
timezone_contract: SHIP_ETA_TZ_CONTRACT_, zero_write: false });
}

return jsonResponse_({ success: true, data: {
shipment_id: shipmentId,
eta: persisted,
eta_intended: intended,
eta_before: beforeEta,
changed: beforeEta !== persisted,
read_after_write: true,
rows_matched: 1,
timezone_contract: SHIP_ETA_TZ_CONTRACT_,
status: afterStatus,
status_unchanged: beforeStatus === afterStatus,
current_position_unchanged: true,
shipment_events_appended: 0,
updated_at: etaStamp_, updated_by: actor
} });
} catch (err) {
try { lock.releaseLock(); } catch (e) {}
return jsonResponse_({ success: false, error: 'ETA update failed: ' + (err && err.message ? err.message : err), code: 'WRITE' });
}
}

// ===== XCO-R15G (31_): per-destination receipt of a consolidated draft =====
function xcoRcvNo_(shipmentId, code, why, more, text) {
  var d = { shipment_id: shipmentId, zero_write: true, retry_safe: false };
  Object.keys(more || {}).forEach(function (k) { d[k] = more[k]; });
  return { success: false, code: code, data: d, zero_write: true, error: text + ' (' + why + '). Nothing was written.' };
}
function xcoReceiptGroups_(ss, shipmentId, shipSheet, ls, byId, plan) {
  var rmv = xcoReceiptRemoved_(ls, byId, plan, shipmentId); if (rmv) return { refuse: rmv };   // XCO-R15G H2 (batch 2): lifts RECEIPT_LINE_REMOVED_NOT_SUPPORTED
  var n;
  try { n = xcoLinkCount_(ss, shipmentId); }
  catch (e) { return { refuse: xcoRcvNo_(shipmentId, 'RECEIPT_LINE_LINEAGE_MISSING', String(e && e.message || e), {}, 'The Shipping Plans linked to this shipment could not be proven, so the receiving warehouse of its lines is unknown') }; }
  var Fm = {};
  if (n < 2) {
    var F = shipReceiptLedgerFacts_(ss, shipmentId, shipSheet, ls, byId);
    Object.keys(byId).forEach(function (l) { Fm[l] = F; });
    return { multi: false, links: n, groups: [{ dest: F.dest, byId: byId, F: F }], F: Fm };
  }
  var ship = sc13One_(sc13Read_(ss, 'shipments', ['shipment_id']).rows, 'shipment_id', shipmentId);
  var lt = sc13Read_(ss, 'shipment_lines', ['shipment_line_id', 'shipment_id', 'shipping_plan_line_id', 'shipment_qty', 'sku', 'note']).rows
    .filter(function (l) { return sc13Str_(l.shipment_id) === shipmentId; });
  var bad = [], removed = [], byDest = {}, order = [];
  Object.keys(byId).forEach(function (lid) {
    var rows = lt.filter(function (l) { return sc13Str_(l.shipment_line_id) === lid; });
    if (rows.length !== 1) { bad.push(lid + ': on ' + rows.length + ' shipment_lines rows'); return; }
    if (sc13LineRemoved_(rows[0])) { removed.push(lid); return; }
    var src;
    try { src = sc13SourceStrict_(ss, rows[0], ship); } catch (e) { bad.push(lid + ': ' + String(e && e.message || e)); return; }
    if (!byDest[src.dest]) { byDest[src.dest] = {}; order.push(src.dest); }
    byDest[src.dest][lid] = byId[lid];
  });
  if (removed.length) return { refuse: xcoRcvNo_(shipmentId, 'RECEIPT_LINE_REMOVED_NOT_SUPPORTED', removed.slice(0, 20).join(', '), { lines: removed.slice(0, 20) }, 'A line of this consolidated shipment is marked removed; its receipt is not supported in this release') };
  if (bad.length) return { refuse: xcoRcvNo_(shipmentId, 'RECEIPT_LINE_LINEAGE_MISSING', bad.slice(0, 3).join('; '), { links: n, lines: bad.slice(0, 20) },
    'This shipment carries ' + n + ' Shipping Plans. The receiving warehouse of each line comes ONLY from that line\'s own lineage, and it is not proven for ' + bad.length + ' line(s); the header warehouse is never used in its place. Do not receive it again; report it to the owner') };
  var groups = order.map(function (dest) { return { dest: dest, byId: byDest[dest], F: shipReceiptLedgerFacts_(ss, shipmentId, shipSheet, ls, byDest[dest], dest) }; });
  var inel = groups.filter(function (g) { return g.F.decision !== 'POST' && g.F.decision !== 'SKIP_PLATFORM'; });   // C4 D-B1: a platform group is received without a ledger row, as a single-destination receipt
  if (inel.length) return { refuse: xcoRcvNo_(shipmentId, 'RECEIPT_LINE_DESTINATION_INELIGIBLE', inel.map(function (g) { return g.dest + ' ' + g.F.decision; }).join('; '),
    { warehouses: inel.map(function (g) { return { warehouse_id: g.dest, decision: g.F.decision }; }) }, 'A line of this consolidated shipment is bound to a warehouse this release does not post receipts to (not found, inactive or a factory)') };
  groups.forEach(function (g) { Object.keys(g.byId).forEach(function (l) { Fm[l] = g.F; }); });
  return { multi: true, links: n, groups: groups, F: Fm };
}
function xcoReceiptGate_(shipmentId, G) {
  var out = [];
  G.groups.forEach(function (g) { g.gate = shipReceiptBooksGate_(shipmentId, g.F, g.byId); (g.gate.refuse || []).forEach(function (w) { out.push(G.multi ? 'warehouse ' + g.dest + ': ' + w : w); }); });
  return { refuse: out.length ? out : null, pending: G.groups[0].gate.pending };
}
function xcoReceiptUnposted_(G) {
  var out = [];
  G.groups.forEach(function (g) { (shipReceiptUnpostedLines_(g.F, g.byId) || []).forEach(function (w) { out.push(G.multi ? 'warehouse ' + g.dest + ': ' + w : w); }); });
  return out.length ? out : null;
}
function xcoReceiptPost_(ss, shipmentId, G, targets, actor, now) {
  if (!G.multi) { var g0 = G.groups[0]; return shipReceiptPostToOverseas_(ss, shipmentId, g0.F, g0.gate.pending, targets, actor, now); }
  var all = { status: 'POSTED_IDEMPOTENT', multi_destination: true, groups: [], lines: [] }, any = false;
  for (var i = 0; i < G.groups.length; i++) {
    var g = G.groups[i], tg = targets.filter(function (t) { return !!g.byId[t.lid]; });
    var p = shipReceiptPostToOverseas_(ss, shipmentId, g.F, g.gate.pending, tg, actor, now);
    all.groups.push({ warehouse_id: g.dest, status: p.status, lines: (p.lines || []).length });
    all.lines = all.lines.concat(p.lines || []);
    if (p.status === 'POSTING_INCOMPLETE') { all.status = 'POSTING_INCOMPLETE'; all.stage = p.stage; all.error = 'warehouse ' + g.dest + ': ' + p.error; all.failed_line = p.failed_line; all.warehouse_id = g.dest; return all; }
    if (p.status === 'POSTED') any = true;
  }
  if (any) all.status = 'POSTED';
  return all;
}
// XCO-R15G-31 (xco-r15g-impl): patched

// XCO-R15G H2 (batch 2): a removed line is never received. Sent in this receipt -> RECEIPT_LINE_REMOVED (zero write); otherwise it leaves byId
// before the facts, so it is never posted, re-targeted or counted. Any link count (a removal can leave a 1-link draft).
// N1 (2026-11-13) helpers. All READ-ONLY; every refusal is zero-write and carries zero_write in data as well.
// A final4 (Owner 2026-11-20 P0, lead-approved): READ-ONLY receipt diagnostic for ONE shipment of ONE company (01_ shipment.receipt.diagnose,
// a POST read). It evaluates the SAME 31_ receipt gates the writer uses - n1ReceiptShipFacts_ (a), n1ReceiptOpeningGate_ (SHIP-OPEN),
// n1ReceiptDispatchGate_ (c) with 22_ csdDispatchConsistency_ / csdMovementExists_ / csdEventExists_ - and returns their verdict. No lock, no
// write, no flush, no append: every helper it calls only reads sheets. A shipment of another company (or an unknown id) answers the same
// SHIPMENT_NOT_FOUND_FOR_COMPANY with no data. The answer holds allowlisted fields only (no endpoint, token, payload, note text or other rows).
// A missing shipment_out movement is never repaired here: repair_preview only lists what a repair would have to write and its stock impact.
function rcvDiagStr_(v) { return v == null ? '' : String(v).trim(); }
function handleShipmentReceiptDiagnose_(body) {
  body = body || {};
  var b0 = (body.payload && typeof body.payload === 'object') ? body.payload : body;
  var sid = rcvDiagStr_(b0.shipment_id), company = rcvDiagStr_(b0.company);
  var base = { success: false, read_only: true, zero_write: true };
  if (!sid) return Object.assign(base, { code: 'SHIPMENT_ID_REQUIRED', error: 'shipment_id is required. Nothing was read.' });
  if (!company) return Object.assign(base, { code: 'COMPANY_REQUIRED', error: 'company is required (the diagnostic is company-scoped). Nothing was read.' });
  if (typeof n1ReceiptShipFacts_ !== 'function' || typeof n1ReceiptDispatchGate_ !== 'function' || typeof csdMovementExists_ !== 'function' || typeof csdCountRowsFor_ !== 'function' || typeof csdEventExists_ !== 'function')
    return Object.assign(base, { code: 'DEPLOYMENT_HALF_SYNCED', error: 'the receipt diagnostic needs 31_ and 22_ of the same release.' });
  var ss = SpreadsheetApp.getActiveSpreadsheet(), shipSheet = ss.getSheetByName('shipments'), lineSheet = ss.getSheetByName('shipment_lines');
  if (!shipSheet || !lineSheet) return Object.assign(base, { code: 'LOAD', error: 'shipments / shipment_lines not found.' });
  var sh = shipmentReadSheet_(shipSheet), cId = sh.col('shipment_id'), cCo = sh.col('company'), hit = [];
  for (var i = 1; i < sh.rows.length; i++) if (rcvDiagStr_(sh.rows[i][cId]) === sid) hit.push(sh.rows[i]);
  if (!hit.length || cCo === -1 || hit.some(function (r) { return rcvDiagStr_(r[cCo]) !== company; }))
    return Object.assign(base, { code: 'SHIPMENT_NOT_FOUND_FOR_COMPANY', error: 'No shipment ' + sid + ' of company ' + company + '. Nothing is returned.' });
  var g = function (r, k) { var c = sh.col(k); return c === -1 ? '' : rcvDiagStr_(r[c]); }, row = hit[0];
  var ids = [sid, g(row, 'shipment_no'), g(row, 'external_shipment_id')], note = g(row, 'note');
  var marker = ids.filter(function (x) { return /^(DEMO|TEST|UAT|SAMPLE)[-_]/i.test(x); })[0] || (/\[(DEMO|TEST|UAT)[^\]]*\]/i.test(note) ? 'note marker' : '');
  var out = { kind: 'KM_SHIPMENT_RECEIPT_DIAG_V1', read_only: true, shipment_id: sid, external_shipment_id: g(row, 'external_shipment_id'), shipment_no: g(row, 'shipment_no'), company: company,
    status: g(row, 'status'), record_origin: g(row, 'record_origin') || 'SYSTEM', opening_supply_mode: g(row, 'opening_supply_mode'), import_batch_present: !!g(row, 'import_batch_id'),
    source_warehouse_id: g(row, 'source_warehouse_id'), destination_warehouse_id: g(row, 'destination_warehouse_id') || g(row, 'warehouse_id'),
    demo_or_test_marker: marker ? { present: true, matched: marker === 'note marker' ? 'note' : marker } : { present: false }, rows_with_this_id: hit.length };
  var ls = shipmentReadSheet_(lineSheet), lS = ls.col('shipment_id'), lQ = ls.col('shipment_qty') !== -1 ? ls.col('shipment_qty') : ls.col('qty'), lR = ls.col('shipment_received_qty'), lK = ls.col('sku'), lines = [];
  for (var x = 1; x < ls.rows.length; x++) { if (rcvDiagStr_(ls.rows[x][lS]) !== sid) continue; if (typeof sc13RowRemoved_ === 'function') { try { if (sc13RowRemoved_(ls, ls.rows[x])) continue; } catch (eR) {} }
    lines.push({ sku: lK === -1 ? '' : rcvDiagStr_(ls.rows[x][lK]), shipment_qty: shipReceiptNum_(ls.rows[x][lQ]), received: lR === -1 ? 0 : shipReceiptNum_(ls.rows[x][lR]) }); }
  out.lines = { count: lines.length, full: lines.filter(function (l) { return l.received >= l.shipment_qty; }).length, remaining_total: lines.reduce(function (s, l) { return s + Math.max(l.shipment_qty - l.received, 0); }, 0) };
  var mov = false, routes = 0, events = false, al = { executed: 0, draft: 0, ended: 0, other: 0 };
  try { mov = !!csdMovementExists_(ss, sid); routes = csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', sid); events = !!csdEventExists_(ss, sid);
    var aSh = ss.getSheetByName('shipment_line_allocations'), lid = {}, lI = ls.col('shipment_line_id');
    for (var y = 1; y < ls.rows.length; y++) if (rcvDiagStr_(ls.rows[y][lS]) === sid) lid[rcvDiagStr_(ls.rows[y][lI])] = 1;
    if (aSh) { var a = shipmentReadSheet_(aSh), aL = a.col('shipment_line_id'), aS = a.col('allocation_status');
      for (var k = 1; aL !== -1 && aS !== -1 && k < a.rows.length; k++) { if (!lid[rcvDiagStr_(a.rows[k][aL])]) continue; var s = rcvDiagStr_(a.rows[k][aS]).toLowerCase();
        if (s === 'executed') al.executed++; else if (s === 'draft') al.draft++; else if (['released', 'cancelled', 'void', 'voided'].indexOf(s) >= 0) al.ended++; else al.other++; } }
  } catch (eE) { out.evidence_error = 'DISPATCH_EVIDENCE_UNREADABLE'; }
  out.dispatch_evidence = { shipment_out_movement: mov, route_rows: routes, event_rows: events, allocations: al };
  var facts = n1ReceiptShipFacts_(shipSheet, sid), verdict = null;
  if (facts.refuse) verdict = facts.refuse;
  else { verdict = (typeof n1ReceiptOpeningGate_ === 'function' ? n1ReceiptOpeningGate_(sid, facts) : null) || n1ReceiptDispatchGate_(ss, sid, facts, ls); }
  out.receipt_allowed_by_existing_rules = !verdict;
  out.refusal = verdict ? { code: verdict.code, why: (verdict.data && verdict.data.why) || '', not_consistent: ((verdict.data && verdict.data.not_consistent) || []).slice(0, 20) } : null;
  out.dispatch_commit_state = out.record_origin === 'IMPORT_HISTORICAL' ? 'IMPORTED_NO_CONFIRM_EXPECTED' : (mov && routes > 0 && events ? 'DISPATCH_EVIDENCE_COMPLETE' : 'DISPATCH_EVIDENCE_INCOMPLETE');
  if (out.refusal && /NO_SHIPMENT_OUT_MOVEMENT/.test(out.refusal.not_consistent.join(' ') + ' ' + out.refusal.why) && out.record_origin !== 'IMPORT_HISTORICAL')
    out.repair_preview = { written: false, approval_needed: 'Owner', would_write: 'one shipment_out movement per line at the source warehouse (the dispatch that is missing), only after the Owner confirms this shipment really left',
      source_warehouse_id: out.source_warehouse_id, lines: lines.map(function (l) { return { sku: l.sku, qty: l.shipment_qty }; }).slice(0, 50),
      stock_impact: 'source warehouse stock would go DOWN by these quantities; if the goods never left, the right fix is to cancel / re-confirm the shipment instead' };
  return { success: true, read_only: true, zero_write: true, data: out };
}
function n1RcvNo_(shipmentId, code, why, extra) {
  return { success: false, code: code, zero_write: true, shipment_id: shipmentId,
    data: Object.assign({ shipment_id: shipmentId, zero_write: true, retry_safe: false, why: why }, extra || {}),
    error: 'Receipt refused (' + code + '): ' + why + '. Nothing was written.' };
}
// (a) the shipments row of this receipt: exactly one, with a status column -> { status, origin, updatedAtCell (undefined = no column) }
function n1ReceiptShipFacts_(shipSheet, shipmentId) {
  var sh = shipmentReadSheet_(shipSheet), iId = sh.col('shipment_id'), iSt = sh.col('status'), iOr = sh.col('record_origin'), iUp = sh.col('updated_at'), iSm = sh.col('opening_supply_mode'), rows = [];
  if (iId === -1 || iSt === -1) return { refuse: n1RcvNo_(shipmentId, 'DISPATCH_STATE_UNKNOWN', 'shipments has no shipment_id / status column') };
  for (var r = 1; r < sh.rows.length; r++) if (String(sh.rows[r][iId]).trim() === shipmentId) rows.push(sh.rows[r]);
  if (rows.length !== 1) return { refuse: n1RcvNo_(shipmentId, rows.length ? 'SHIPMENT_ROW_AMBIGUOUS' : 'SHIPMENT_NOT_FOUND', rows.length + ' shipments rows carry this shipment_id') };
  var v = rows[0];
  return { status: String(v[iSt] == null ? '' : v[iSt]).trim().toLowerCase(), origin: iOr === -1 ? '' : String(v[iOr] == null ? '' : v[iOr]).trim(), supplyMode: iSm === -1 ? '' : String(v[iSm] == null ? '' : v[iSm]).trim().toUpperCase(), updatedAtCell: iUp === -1 ? undefined : v[iUp] };
}
// (b) a resend of an already fully recorded receipt -> REPLAYED (the recorded cumulative values, zero writes), or null (not settled: go on).
// Settled = no submitted line adds quantity, no line write pending (the ledger is not above the saved cumulative), nothing to post (no pending
// row of a group, every posting group has posted >= saved), the derived status is non-empty and equals the stored status, and its lifecycle
// event exists. All from the facts the handler already read (xcoReceiptGroups_ / xcoReceiptGate_) plus one read of shipment_events.
function n1ReceiptReplay_(ss, shipmentId, G, byId, plan, ls, facts) {
  if (!plan.length || plan.some(function (p) { return p.delta !== 0; })) return null;
  for (var gi = 0; gi < G.groups.length; gi++) { var g = G.groups[gi];
    if (g.gate && g.gate.pending && Object.keys(g.gate.pending).length) return null;
    var lids = Object.keys(g.byId);
    for (var li = 0; li < lids.length; li++) { var lid = lids[li], S = shipReceiptNum_(byId[lid].oldReceived), P = g.F.decision === 'POST' ? (g.F.posted[lid] || 0) : 0;
      if (Math.max(S, Math.min(P, byId[lid].shippedQty)) !== S) return null;
      if (g.F.decision === 'POST' && P < S) return null; } }
  var q = ls.col('shipment_qty'); if (q === -1) q = ls.col('qty');
  var rq = ls.col('shipment_received_qty'), sc = ls.col('shipment_id'), auth = [];
  for (var x = 1; x < ls.rows.length; x++) { if (String(ls.rows[x][sc]).trim() !== shipmentId) continue; if (typeof sc13RowRemoved_ === 'function' && sc13RowRemoved_(ls, ls.rows[x])) continue;
    auth.push({ shippedQty: shipReceiptNum_(ls.rows[x][q]), received: shipReceiptNum_(ls.rows[x][rq]) }); }
  var d = shipDeriveReceiptStatus_(auth);
  if (!d.status || d.status !== facts.status) return null;
  var evType = shipLifecycleEventType_(d.status), src = evType ? shipReceiptEventSourceId_(shipmentId, evType) : '';
  if (evType) { var es = ss.getSheetByName('shipment_events'); if (!es) return null; var e = shipmentReadSheet_(es), cS = e.col('shipment_id'), cX = e.col('source_event_id'); if (cS === -1 || cX === -1) return null;
    var seen = false; for (var k = 1; k < e.rows.length; k++) if (String(e.rows[k][cS]).trim() === shipmentId && String(e.rows[k][cX]).trim() === src) { seen = true; break; }
    if (!seen) return null; }
  return { success: true, data: { outcome: 'REPLAYED', replayed: true, zero_write: true, shipment_id: shipmentId, status: facts.status, status_derived: d.status, status_reason: d.reason,
    lines_applied: 0, lines_idempotent: plan.length, posting: { status: 'POSTED_IDEMPOTENT', lines: [] },
    lines: plan.map(function (p) { return { shipment_line_id: p.slid, shipment_qty: byId[p.slid].shippedQty, shipment_received_qty: shipReceiptNum_(byId[p.slid].oldReceived), remaining_qty: Math.max(byId[p.slid].shippedQty - shipReceiptNum_(byId[p.slid].oldReceived), 0) }; }),
    note: 'This receipt is already recorded exactly as sent (the same cumulative quantities, posted, status and event in place). Nothing was written and nothing was posted again.' } };
}
// (c) the dispatch gate: status and dispatch evidence must agree; unknown or contradictory -> typed refusal. Evidence = a shipment_out in either
// ledger (22_ csdMovementExists_), route rows, event rows (csdEventExists_), the allocations of its lines. A system shipment in a dispatched
// status must pass 22_ csdDispatchConsistency_ (movement + routes + event + every allocation executed + PO lines reconciled). An imported
// historical one (record_origin IMPORT_HISTORICAL, never Confirmed here - 22_:203) must carry NO shipment_out, NO route and no live allocation.
// SHIP-OPEN R4/R5 (Owner rule 4, review M3 / r4-m3, Owner r5 item 4): an opening record (80_ IMPORT_HISTORICAL) is receivable ONLY when
// its opening_supply_mode is COUNTED (an overseas 3PL record of a COMMITTED import). DISPLAY_ONLY (Amazon) is shown only; any other value
// (PENDING:* while its import is still being written, or blank) is not a finished record. Zero write, before every other gate.
function n1ReceiptOpeningGate_(shipmentId, facts) {
  if (facts.origin !== 'IMPORT_HISTORICAL' || facts.supplyMode === 'COUNTED' || facts.supplyMode === '') return null;   // r5.4: blank mode = LEGACY historical row -> the base gates only (dispatch evidence + opening_received_qty increment)
  if (facts.supplyMode === 'DISPLAY_ONLY') return n1RcvNo_(shipmentId, 'SHIPMENT_OPENING_DISPLAY_ONLY', 'this is an Amazon opening record (display only): it is not received in this system - the Amazon stock comes only from the Amazon report import');
  return n1RcvNo_(shipmentId, 'SHIPMENT_OPENING_NOT_COMMITTED', 'this opening record is not finished (opening_supply_mode ' + (facts.supplyMode || 'blank') + ') - its import batch has not committed; it is not received');
}
function n1ReceiptDispatchGate_(ss, shipmentId, facts, ls) {
  var st = facts.status, hist = facts.origin === 'IMPORT_HISTORICAL', routes, events, mov, al = { executed: 0, draft: 0, ended: 0, other: [] };
  try {
    if (typeof csdIsDispatchedStatus_ !== 'function' || typeof csdDispatchConsistency_ !== 'function' || typeof csdMovementExists_ !== 'function') throw new Error('22_ dispatch readers absent (half-synced deployment)');
    routes = csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', shipmentId); events = !!csdEventExists_(ss, shipmentId); mov = !!csdMovementExists_(ss, shipmentId);
    var lid = {}, lI = ls.col('shipment_line_id'), lS = ls.col('shipment_id');
    for (var r = 1; r < ls.rows.length; r++) if (String(ls.rows[r][lS]).trim() === shipmentId) lid[String(ls.rows[r][lI]).trim()] = 1;
    var aSh = ss.getSheetByName('shipment_line_allocations');
    if (aSh) { var a = shipmentReadSheet_(aSh), aL = a.col('shipment_line_id'), aS = a.col('allocation_status');
      if (a.rows.length > 1 && (aL === -1 || aS === -1)) throw new Error('shipment_line_allocations has no shipment_line_id / allocation_status column');
      for (var k = 1; k < a.rows.length; k++) { if (!lid[String(a.rows[k][aL]).trim()]) continue; var s = String(a.rows[k][aS] == null ? '' : a.rows[k][aS]).trim().toLowerCase();
        if (s === 'executed') al.executed++; else if (s === 'draft') al.draft++; else if (['released', 'cancelled', 'void', 'voided'].indexOf(s) >= 0) al.ended++; else al.other.push(s || '(blank)'); } }
  } catch (e) { return n1RcvNo_(shipmentId, 'DISPATCH_STATE_UNKNOWN', 'the dispatch evidence could not be read (' + String(e && e.message ? e.message : e) + ')'); }
  var ev = { status: st, record_origin: facts.origin || '', shipment_out: mov, route_rows: routes, event_rows: events, allocations: { executed: al.executed, draft: al.draft, ended: al.ended, unknown: al.other.slice(0, 10) } };
  var any = mov || routes > 0 || events || al.executed > 0;
  if (al.other.length) return n1RcvNo_(shipmentId, 'DISPATCH_STATE_UNKNOWN', 'an allocation of this shipment has a status the receipt does not know (' + al.other.slice(0, 3).join(', ') + ')', { evidence: ev });
  if (st === 'cancelled') return n1RcvNo_(shipmentId, any ? 'DISPATCH_STATE_INCONSISTENT' : 'SHIPMENT_CANCELLED', any ? 'the shipment reads cancelled but carries dispatch evidence' : 'the shipment is cancelled; a cancelled shipment is never received', { evidence: ev });
  if (st === 'draft' || st === 'ready_to_ship') return n1RcvNo_(shipmentId, any ? 'DISPATCH_STATE_INCONSISTENT' : 'SHIPMENT_NOT_DISPATCHED', any ? 'the shipment reads "' + st + '" but carries dispatch evidence' : 'the shipment is "' + st + '": it has not been dispatched (Confirm Shipment & Dispatch first)', { evidence: ev });
  if (!csdIsDispatchedStatus_(st)) return n1RcvNo_(shipmentId, 'SHIPMENT_STATUS_UNKNOWN', 'the shipment status "' + st + '" is not a known dispatched status', { evidence: ev });
  if (hist) {
    // STAGE 2 ROUTE_INIT (87_): route rows on an imported record are accepted ONLY when they are the audited imported-tracking snapshot of a
    // COMMITTED import (rtiImportedTrackingProof_); anything else - or 87_ absent (half-synced) - stays ROUTE_ROWS_ON_HISTORICAL
    var rtiP_ = routes > 0 ? (typeof rtiImportedTrackingProof_ === 'function' ? rtiImportedTrackingProof_(ss, shipmentId) : { ok: false, why: 'ROUTE_INIT_PROOF_ABSENT' }) : null; if (rtiP_) ev.imported_tracking = rtiP_.ok ? 'PROVEN' : rtiP_.why;
    var hw = []; if (mov) hw.push('SHIPMENT_OUT_ON_HISTORICAL'); if (routes > 0 && !(rtiP_ && rtiP_.ok)) hw.push('ROUTE_ROWS_ON_HISTORICAL'); if (al.draft > 0) hw.push('DRAFT_ALLOCATION_ON_HISTORICAL');
    return hw.length ? n1RcvNo_(shipmentId, 'DISPATCH_STATE_INCONSISTENT', 'an imported historical shipment carries ' + hw.join(', '), { evidence: ev, not_consistent: hw }) : null;
  }
  var dc = csdDispatchConsistency_(ss, shipmentId, routes, events, mov);
  return dc.ok ? null : n1RcvNo_(shipmentId, 'DISPATCH_STATE_INCONSISTENT', 'the shipment reads "' + st + '" but its dispatch is not complete in the rows (' + dc.why.slice(0, 3).join('; ') + ')', { evidence: ev, not_consistent: dc.why.slice(0, 20) });
}
// (d) the version gate (12_ editP1Gate15f2_ + editTokSame_, the rule 22_:232 applies to Confirm): the shipments.updated_at this receipt was
// entered against. A missing token (while the row has a readable version), an unreadable token or a changed row -> refused, zero write.
// A row WITHOUT a readable version (blank or date-only legacy updated_at) accepts ONE token-less receipt (editP1Gate15f2_ R15F2 rule, as every
// 12_ edit). JR5 (review R4-m1): that receipt claims the version (writes updated_at) BEFORE its first stock / line write, so every later receipt
// needs the version even when the first one stopped part way: a second token-less request is refused EDIT_TOKEN_REQUIRED, zero write
// (joint-r5 r5-cases R4M1-*, N-I). No lost update; the stopped receipt completes by a resend WITH the claimed version.
function n1ReceiptVersionGate_(facts, tok, shipmentId) {
  if (typeof editP1Gate15f2_ !== 'function' || typeof editTokSame_ !== 'function') return n1RcvNo_(shipmentId, 'DEPLOYMENT_HALF_SYNCED', '31_ needs the R15F2 12_ version helpers');
  var p = editP1Gate15f2_(facts.updatedAtCell, tok);
  if (!p && String(tok == null ? '' : tok).trim() !== '' && editTokSame_(facts.updatedAtCell, tok) !== 'SAME') p = { code: 'EDIT_CONFLICT', error: 'EDIT_CONFLICT: this shipment was changed after this receipt was entered (another tab, user or action). Nothing was received or posted. Reload it, check the received quantities, then enter the receipt again.', data: { current_updated_at: editTok_(facts.updatedAtCell) } };
  if (!p) return null;
  return { success: false, code: p.code, zero_write: true, shipment_id: shipmentId, stage: 'edit_conflict', data: Object.assign({ shipment_id: shipmentId, zero_write: true, retry_safe: false }, p.data || {}), error: p.error };
}
// (e) N1 r2 scope gate: the handler's roll-forward (targets31_) raises a line NOT in this request to the cumulative its ledger already proves
// posted, and the posting first completes any PENDING ledger row (05_) of the shipment's keys. Neither is bound to THIS request: a line it does
// not carry is another receipt's. Refused (zero write) when any line outside the request would be raised, or a pending row names a line outside
// it - the resend of THAT receipt (its own lines) completes it.
function n1ReceiptScopeGate_(shipmentId, G, byId, plan) {
  var mine = {}, out = [];
  plan.forEach(function (p) { mine[p.slid] = 1; });
  (G.groups || []).forEach(function (g) {
    Object.keys(g.byId).forEach(function (lid) { if (mine[lid]) return;
      var S = shipReceiptNum_(byId[lid].oldReceived), P = g.F.decision === 'POST' ? (g.F.posted[lid] || 0) : 0;
      if (Math.max(S, Math.min(P, byId[lid].shippedQty)) !== S) out.push(lid + ' (saved ' + S + ', ledger posted ' + P + ')'); });
    var pend = (g.gate && g.gate.pending) || {};
    Object.keys(pend).forEach(function (sku) { var pd = pend[sku]; if (pd && !mine[pd.line_id]) out.push((pd.line_id || '?') + ' (pending ledger row ' + (pd.reference_id || '') + ')'); });
  });
  return out.length ? n1RcvNo_(shipmentId, 'RECEIPT_SCOPE_UNBOUND', 'a line that is NOT in this receipt has an unfinished receipt in the ledger (' + out.slice(0, 3).join('; ') + '); this receipt may not complete it. Send that line\'s own receipt (the same cumulative) to complete it', { lines: out.slice(0, 20) }) : null;
}
function xcoReceiptRemoved_(ls, byId, plan, shipmentId) {
  if (typeof sc13RowRemoved_ !== 'function') return null;
  var lIdC = ls.col('shipment_line_id'), lShC = ls.col('shipment_id'), gone = [];
  for (var r = 1; r < ls.rows.length; r++) { if (String(ls.rows[r][lShC]).trim() !== shipmentId) continue; var lid = String(ls.rows[r][lIdC]).trim(); if (byId[lid] && sc13RowRemoved_(ls, ls.rows[r])) gone.push(lid); }
  var sent = gone.filter(function (lid) { return (plan || []).some(function (p) { return p.slid === lid; }); });
  if (sent.length) return xcoRcvNo_(shipmentId, 'RECEIPT_LINE_REMOVED', sent.slice(0, 20).join(', '), { lines: sent.slice(0, 20) }, 'A line in this receipt was removed from its consolidated draft and is never received');
  gone.forEach(function (lid) { delete byId[lid]; });
  return null;
}
// XCO-R15G-31B (xco-r15g-impl): patched

// XCO-R15G MINOR-7: the receipt lineage grouping shares one read of each sheet.
// XCO-R15G-MEMO-31 (xco-r15g-impl): patched

var SHIP_RECEIPT_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-SO8-AFINAL4-A2ROUTE-AD1B-AD2-AD3';   // SHIP-OPEN R4: + the display-only opening refusal   // PGSC1N1: new module stamp (registration per build-production-profile.cjs:37,42,43)
