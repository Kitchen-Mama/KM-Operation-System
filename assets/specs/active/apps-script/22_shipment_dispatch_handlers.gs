

























































var CSD_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15F2-R15G-AD1B-AD2-AD3-OND1';
var CSD_MOV_TYPE_ = 'shipment_out';


var CSD_EVENT_TYPE_ = 'shipment_confirmed';
var CSD_CONFIRMED_STATUS_ = 'shipped';
var CSD_INTRANSIT_ = 'in_transit';

function csdNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function csdId_(prefix, len) { return prefix + Utilities.getUuid().replace(/-/g, '').substring(0, len || 8).toUpperCase(); }
function csdTruthy_(v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return s === 'true' || s === '1' || s === 'yes' || s === 'y'; }

function csdOffsetDate_(baseYmd, offsetDays) {
var b = String(baseYmd || '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
if (!b || offsetDays === '' || offsetDays == null || isNaN(parseFloat(offsetDays))) return '';
var ms = Date.UTC(+b[1], +b[2] - 1, +b[3]) + Math.round(parseFloat(offsetDays)) * 86400000;
var d = new Date(ms);
return Utilities.formatDate(d, 'UTC', 'yyyy-MM-dd');
}

// A-delta1 C5 (2026-11-21, decision flagged to the Owner): an OVERSEAS-sourced shipment (05_ ovsWarehouseSourceDomain_ = OVERSEAS, e.g. a
// 3PL -> FBA transfer) moves stock that left the factory long ago against its PO lines, so it has no factory PO lineage: 32_
// handleGenerateShipmentLineAllocations_ refuses it (NOT_A_FACTORY_WAREHOUSE) and the Confirm PO-allocation requirement made every overseas
// Shipment Draft impossible to Confirm (SHIPMENT_PO_ALLOCATION_MISSING). With this switch the Confirm of an OVERSEAS source executes no PO
// allocation and touches no purchase_order_lines; the overseas ledger deduction (declared source, in-lock books check) is unchanged. A FACTORY
// source still requires its allocations exactly as before. false = previous behaviour.
// A-delta1 C6: NARROWED - the skip applies only to a server-proven legal 3PL -> FBA transfer for a platform site (csdOverseasTransferEligibility_).
var CSD_OVERSEAS_NO_PO_LINEAGE_ = true;
// A-delta1 C6 r2 (Owner approved 2026-11-21, with conditions): the no-PO-lineage Confirm is NARROW. It applies only when the server's own masters
// (the shipments row as stored, the warehouses and marketplaces sheets; never a request field) prove a legal overseas transfer to the platform:
//   source  = a warehouse row that is active, not a factory, warehouse_type 3PL, with a company equal to the shipment's company;
//   target  = the stored destination warehouse: active, warehouse_type FBA, the shipment's company, the shipment's (canonical) country;
//   site    = the shipment's company / country / marketplace row: platform_fulfilled; or hybrid AND every shipped SKU's marketplace_skus mode is
//             explicitly platform_fulfilled (c6 r2, Owner rule; unresolved / unknown / self -> the PO requirement with a named reason).
// AD3 C: + ONE exact 3PL -> 3PL branch (csdOverseas3plTransferBranch_ below: same company, same country, US only, source != destination).
// Every other combination (3PL -> 3PL outside that branch, a self-fulfilled site, RETURN / FBA / unknown / blank type source, blank or other company, missing
// rows) keeps the PO-allocation requirement exactly as before (SHIPMENT_PO_ALLOCATION_MISSING), and the refusal names the failed condition.
// Read-only; called inside the Confirm lock after the declared-source books / sufficiency checks, before any write.
function csdOverseasTransferEligibility_(ss, shipRow) {
  var S = function (v) { return String(v == null ? '' : v).trim(); }, U = function (v) { return S(v).toUpperCase(); };
  var T = function (v) { return /^(true|yes|y|1)$/i.test(S(v)) || v === true; };
  // c7fix L-D: active = is_active when the column exists, else status === 'active' (05_ ovsReadWarehouseRecord_ order); neither column -> NOT active (fail closed)
  var ACT = function (w) { if (Object.prototype.hasOwnProperty.call(w, 'is_active')) return T(w.is_active); if (Object.prototype.hasOwnProperty.call(w, 'status')) return S(w.status).toLowerCase() === 'active'; return false; };
  // c7fix M-B: the source 3PL must be in the shipment's country (canonical), or in its planning set (12_ shipSetMember15e_, the KMCID definition) - the IR page's COUNTRY_INCOMPATIBLE rule
  var SAMECTRY = function (wc, sc0) { if (C(wc) && C(wc) === C(sc0)) return true; try { return typeof shipSetMember15e_ === 'function' && !!C(sc0) && shipSetMember15e_(C(sc0), C(wc)); } catch (eM) { return false; } };
  var C = function (v) { return (typeof gapCanonCountry_ === 'function') ? gapCanonCountry_(v) : U(v); };
  var read = function (name) { var sh = ss.getSheetByName(name); if (!sh) return null; var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return S(x); }), out = [];
    for (var r = 1; r < d.length; r++) { var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = d[r][c]; out.push(o); } return out; };
  var co = S(shipRow.company), ct = S(shipRow.country), mk = S(shipRow.marketplace), src = S(shipRow.source_warehouse_id), dst = S(shipRow.destination_warehouse_id) || S(shipRow.warehouse_id);
  var res = { eligible: false, reason: null, source_warehouse_id: src, destination_warehouse_id: dst, company: co, country: ct, marketplace: mk };
  var no = function (code) { res.reason = code; return res; };
  if (!co) return no('SHIPMENT_COMPANY_BLANK');
  var whs = read('warehouses'); if (!whs) return no('WAREHOUSE_MASTER_UNREADABLE');
  var one = function (id) { var m = whs.filter(function (w) { return S(w.warehouse_id) === id; }); return m.length === 1 ? m[0] : (m.length ? 'MULTIPLE' : null); };
  var s = one(src);
  if (!s) return no('SOURCE_NOT_IN_MASTER'); if (s === 'MULTIPLE') return no('SOURCE_MASTER_DUPLICATE');
  if (T(s.is_factory_warehouse) || U(s.warehouse_type) === 'FACTORY') return no('SOURCE_IS_FACTORY');
  if (!ACT(s)) return no('SOURCE_INACTIVE');
  if (U(s.warehouse_type) !== '3PL') return no(S(s.warehouse_type) ? 'SOURCE_TYPE_NOT_3PL:' + U(s.warehouse_type) : 'SOURCE_TYPE_BLANK');
  if (!S(s.company)) return no('SOURCE_COMPANY_BLANK');
  if (S(s.company) !== co) return no('SOURCE_COMPANY_MISMATCH');
  if (!SAMECTRY(s.country, ct)) return no('SOURCE_COUNTRY_MISMATCH');   // c7fix M-B
  if (!dst) return no('DESTINATION_BLANK');
  var d = one(dst);
  if (!d) return no('DESTINATION_NOT_IN_MASTER'); if (d === 'MULTIPLE') return no('DESTINATION_MASTER_DUPLICATE');
  if (!ACT(d)) return no('DESTINATION_INACTIVE');
  if (U(d.warehouse_type) === '3PL') return csdOverseas3plTransferBranch_(res, s, d, src, dst, co, ct, C, T, no);   // AD3 C (Owner decision 2): the exact 3PL -> 3PL branch
  if (U(d.warehouse_type) !== 'FBA') return no(S(d.warehouse_type) ? 'DESTINATION_TYPE_NOT_PLATFORM:' + U(d.warehouse_type) : 'DESTINATION_TYPE_BLANK');
  if (S(d.company) !== co) return no(S(d.company) ? 'DESTINATION_COMPANY_MISMATCH' : 'DESTINATION_COMPANY_BLANK');
  if (!ct || C(d.country) !== C(ct)) return no('DESTINATION_COUNTRY_MISMATCH');
  // AD3 C (Owner decisions 3 / 12): a platform destination (FBA, which includes WFS) - the Owner-confirmed LOGICAL platform rows are never a
  // physical ship-to, and a warehouse row that names its platform (warehouses.marketplace, non-blank) must be the shipment site's platform
  // (Amazon / KM Amazon -> amazon; Walmart / KM Walmart -> walmart). A blank warehouses.marketplace keeps the c6 behaviour (not read).
  if (csdLogicalPlatformWarehouse_(dst)) return no('DESTINATION_IS_LOGICAL_PLATFORM');
  if (S(d.marketplace) && csdPlatformFamily_(d.marketplace) !== csdPlatformFamily_(mk)) return no('DESTINATION_PLATFORM_MISMATCH:' + csdPlatformFamily_(d.marketplace) + '!=' + csdPlatformFamily_(mk));
  res.transfer_kind = 'OVERSEAS_3PL_TO_PLATFORM';
  var mks = read('marketplaces'); if (!mks) return no('MARKETPLACE_MASTER_UNREADABLE');
  var m = mks.filter(function (x) { return S(x.company) === co && C(x.country) === C(ct) && S(x.marketplace) === mk; });
  if (m.length !== 1) return no(m.length ? 'MARKETPLACE_DUPLICATE' : 'MARKETPLACE_NOT_FOUND');
  var fm = S(m[0].fulfillment_model).toLowerCase();
  if (fm !== 'platform_fulfilled' && fm !== 'hybrid') return no('SITE_NOT_PLATFORM_FULFILLED:' + (fm || 'blank'));
  if (fm === 'hybrid') {
    // c6 r2 (Owner rule): a hybrid site counts as platform only for SKUs whose marketplace_skus fulfilment mode is EXPLICITLY platform_fulfilled.
    // Read as 42_ recoWsFulfillmentModelBySku_ reads it (company / country / marketplace / sku, trimmed; mode case-folded), but conservatively:
    // a missing, blank, unknown or conflicting (several rows, different modes) mode is UNRESOLVED; self_fulfilled is NOT_PLATFORM. Every shipped
    // SKU (each live line of this shipment) must pass, so one non-platform SKU keeps the PO requirement for the whole shipment.
    var sid = S(shipRow.shipment_id); if (!sid) return no('HYBRID_SKU_MODE_UNRESOLVED:SHIPMENT_ID_BLANK');
    var msk = read('marketplace_skus'); if (!msk) return no('HYBRID_SKU_MODE_UNRESOLVED:MARKETPLACE_SKUS_UNREADABLE');
    var sl = read('shipment_lines'); if (!sl) return no('HYBRID_SKU_MODE_UNRESOLVED:SHIPMENT_LINES_UNREADABLE');
    var skus = [];
    sl.forEach(function (l) { if (S(l.shipment_id) !== sid) return; if (typeof sc13LineRemoved_ === 'function') { try { if (sc13LineRemoved_(l)) return; } catch (eR) {} }
      var k = S(l.sku); if (k && skus.indexOf(k) < 0) skus.push(k); });
    if (!skus.length) return no('HYBRID_SKU_MODE_UNRESOLVED:NO_SHIPPED_SKU');
    res.hybrid_sku_modes = {};
    for (var i = 0; i < skus.length; i++) {
      var modes = [];
      msk.forEach(function (r) { if (S(r.company) !== co || C(r.country) !== C(ct) || S(r.marketplace) !== mk || S(r.sku) !== skus[i]) return;   /* c7fix L-C: country canonical, as the site lookup */ var v = S(r.fulfillment_model).toLowerCase(); if (modes.indexOf(v) < 0) modes.push(v); });
      res.hybrid_sku_modes[skus[i]] = modes.length === 1 ? (modes[0] || 'blank') : (modes.length ? 'CONFLICT:' + modes.join('/') : 'MISSING');
      if (!modes.length) return no('HYBRID_SKU_MODE_UNRESOLVED:' + skus[i] + '=missing');
      if (modes.length > 1) return no('HYBRID_SKU_MODE_UNRESOLVED:' + skus[i] + '=conflict');
      if (modes[0] === 'self_fulfilled') return no('HYBRID_SKU_MODE_NOT_PLATFORM:' + skus[i] + '=self_fulfilled');
      if (modes[0] !== 'platform_fulfilled') return no('HYBRID_SKU_MODE_UNRESOLVED:' + skus[i] + '=' + (modes[0] || 'blank'));
    }
  }
  res.eligible = true; return res;
}
// AD3 C (Owner decision 2, 2026-11-21): the ONE added no-PO-lineage branch - a real same-company overseas 3PL -> 3PL transfer. Exact, never
// "any non-factory source": the caller has already proven the SOURCE (one active warehouses row, not a factory, warehouse_type 3PL, the
// shipment's company, the shipment's country) and that the DESTINATION is one active warehouses row of warehouse_type 3PL. Here:
//   destination != source; destination not flagged a factory; destination company non-blank and EQUAL to the shipment's company (a
//   cross-company overseas transfer is NOT allowed - same address / same carrier is no basis, Owner decision 2); source country ==
//   destination country == shipment country, canonical and EXACT (no planning-set widening); and that country is enabled for the branch.
// Only US is enabled: the Owner approved US. Other countries keep the PO requirement (TRANSFER_COUNTRY_NOT_ENABLED) until the Owner
// enables them - the rule text would be identical, but an EU planning set, VAT/customs and the per-country 3PL masters were not reviewed.
// The site's fulfilment model is NOT read: moving own stock between two own 3PLs does not change who fulfils the site.
// Result: the Confirm executes no PO allocation (factory / PO untouched, the original lineage of the stock is kept), deducts the source
// overseas ledger once (existing shipment_out, in-lock books); the destination receipt (31_) posts the destination overseas ledger once.
var CSD_3PL_TRANSFER_COUNTRIES_ = { US: 1 };
function csdOverseas3plTransferBranch_(res, s, d, src, dst, co, ct, C, T, no) {
  var S = function (v) { return String(v == null ? '' : v).trim(); };
  res.transfer_kind = 'OVERSEAS_3PL_TO_3PL';
  if (dst === src) return no('DESTINATION_EQUALS_SOURCE');
  if (T(d.is_factory_warehouse)) return no('DESTINATION_IS_FACTORY');
  if (!S(d.company)) return no('DESTINATION_COMPANY_BLANK');
  if (S(d.company) !== co) return no('DESTINATION_COMPANY_MISMATCH');
  var cs = C(s.country), cd = C(d.country), cx = C(ct);
  if (!cs || !cd || !cx || cs !== cd || cd !== cx) return no('TRANSFER_COUNTRY_MISMATCH');
  if (CSD_3PL_TRANSFER_COUNTRIES_[cx] !== 1) return no('TRANSFER_COUNTRY_NOT_ENABLED:' + cx);
  res.eligible = true; return res;
}
// AD3 C (Owner decision 12): the Owner-confirmed LOGICAL WFS warehouses (warehouses rows of warehouse_type FBA, active). They name the
// platform destination of a plan; they are never a physical ship-to (the Shipment Draft chooses the actual WFS fulfilment-center row).
var CSD_LOGICAL_PLATFORM_WAREHOUSES_ = { 'WH-RESUS-US-WFS-WALMART': 'Walmart', 'WH-KM-US-WFS-WALMART': 'KM Walmart' };
// AD3 C round 3 (review F4): Confirm refuses a stored destination that is a LOGICAL platform row for EVERY source (factory, overseas, a
// Draft saved before the AD3 Save gate). Read from the saved shipments row only (destination_warehouse_id, else warehouse_id); zero write.
function csdLogicalPlatformGate22_(sc) {
  var wid = String(sc('destination_warehouse_id') || sc('warehouse_id') || '').trim();
  if (!wid || !csdLogicalPlatformWarehouse_(wid)) return null;
  return { success: false, code: 'DESTINATION_IS_LOGICAL_PLATFORM', stage: 'validate', destination_warehouse_id: wid, zero_write: true,
    error: 'Cannot Confirm — ' + wid + ' is a logical platform warehouse (' + CSD_LOGICAL_PLATFORM_WAREHOUSES_[wid] + '), not a physical ship-to. Choose the actual fulfilment-center warehouse on the Shipment Draft. Nothing was written.' };
}
function csdLogicalPlatformWarehouse_(warehouseId) { return Object.prototype.hasOwnProperty.call(CSD_LOGICAL_PLATFORM_WAREHOUSES_, String(warehouseId == null ? '' : warehouseId).trim()); }
// The platform family of a site / warehouse marketplace name: 'Amazon', 'KM Amazon' -> amazon; 'Walmart', 'KM Walmart' -> walmart; else the
// trimmed lower-case name ('' for blank). Used only to compare a platform warehouse with the shipment's site.
function csdPlatformFamily_(name) {
  var n = String(name == null ? '' : name).trim().toLowerCase();
  if (/(^|\s)amazon$/.test(n)) return 'amazon';
  if (/(^|\s)walmart$/.test(n)) return 'walmart';
  return n;
}
function handleConfirmShipmentAndDispatch_(body) {
body = body || {};
var shipmentId = String(body.shipment_id || body.draft_id || '').trim();
var actor = String(body.actor || body.updated_by || 'system_user').trim();
var overrideTemplateId = String(body.route_template_id || '').trim();
if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id', stage: 'input', zero_write: true });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var shipSheet = ss.getSheetByName('shipments');
if (!shipSheet) return jsonResponse_({ success: false, error: 'shipments sheet not found', stage: 'load', zero_write: true });











try {
  var scShip = sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', shipmentId);
  sc13AssertReady_(scShip);
  if (sc13LinkIds_(ss, shipmentId).length) sc13Verify_(ss, scShip);
} catch (scError) { return jsonResponse_({ success: false, stage: 'consolidation', zero_write: true, error: String(scError.message || scError) }); }
var docGate;
try { docGate = dgsShipmentReadiness_(ss, shipmentId, {}); }
catch (eg) { docGate = { ok: false, status: 'BLOCKED', reason: 'DOCUMENT_READINESS_CHECK_FAILED', blockers: [{ reason: 'DOCUMENT_READINESS_CHECK_FAILED', message: (eg && eg.message ? String(eg.message) : String(eg)) }] }; }
if (!docGate.ok) {
return jsonResponse_({
success: false, stage: 'document_readiness', shipment_id: shipmentId,
error: 'Cannot Confirm — required shipment documents are not ready.',
document_readiness: docGate, blockers: docGate.blockers,
note: 'The shipment remains ready_to_ship and shipped_at is blank. Nothing was written and no Drive folder or file was created.', zero_write: true
});
}
// R69+EXTID-CAND3 (local candidate): a FORESEEABLE leaf collision refuses the Confirm here - before the lock and before any write.
var leafPeek;
try { leafPeek = docGate.status==='NOT_REQUIRED' ? dgsNoShipmentDocuments_(shipmentId) : dgsShipmentLeafPeek_(ss, shipmentId); }
catch (ep) { leafPeek = { ok: false, reason: 'SHIPMENT_FOLDER_CHECK_FAILED', message: String(ep && ep.message || ep) }; }
if (!leafPeek.ok) return jsonResponse_({ success: false, stage: 'document_folder', code: leafPeek.reason, shipment_id: shipmentId, document_folder: leafPeek,
error: 'Cannot Confirm - the document folder this shipment would use is not provably its own.',
note: 'The shipment remains ready_to_ship and shipped_at is blank. Nothing was written and no Drive folder or file was created.', zero_write: true });


var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, code: 'LOCK_UNAVAILABLE', error: 'Could not acquire lock; please retry. Nothing was written.', stage: 'lock', zero_write: true }); }   // INT-CAND7 r6 (F-CC-3): typed
catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock', zero_write: true }); }

var rollback = [];
// INT-CAND7 r4 (review B7R3): the undo is CHECKED and VALUE-PROVEN (12_ shipmentCheckedReplay_). Identity: a movement row = the id this Confirm
// captured for it (in write order); a route / event row = the id recorded at its append; an allocation row = the shipment_line_allocation_id
// AND shipment_line_id 32_ recorded for the flipped row (F-R3-1); a PO line = its purchase_order_line_id; the shipment = shipment_id; a stock
// row = this Confirm's key. Value: the stock deltas, the setShip values (journaled BEFORE the write), the plan's allocation / PO values.
// Order: stock, movement, route, event, allocation and PO undone first, the shipment row LAST (its status is the commit marker).
var undoIds_, undoSeq_, cfKeys_, cfDom_;
function undoAll() {
var flips = {}, pols = {}, C = (slaPlan && slaPlan.cols) || {};
try { ((slaPlan && slaPlan.allocFlips) || []).forEach(function (f) { flips[f.row] = f; }); ((slaPlan && slaPlan.poReconcile) || []).forEach(function (rc) { pols[rc.row] = rc; }); } catch (eP) {}
var doms = {}; if (cfDom_) doms[cfDom_.domain] = cfDom_;
function tr(v) { return String(v == null ? '' : v).trim(); }
return shipmentCheckedReplay_(rollback, { owner: shipmentId, keys: cfKeys_ || {}, doms: doms, seq: undoSeq_ || [], lastSheets: ['shipments'],
identify: function (name, H, v, e) {
if (name === 'shipment_line_allocations') { var f = flips[e.row], ai = H.indexOf('shipment_line_allocation_id'), li = H.indexOf('shipment_line_id'); return (f && f.id && ai !== -1 && li !== -1 && tr(v[ai]) === f.id && tr(v[li]) === f.lid) ? true : 'NOT_AN_ALLOCATION_THIS_CONFIRM_FLIPPED'; }
if (name === 'purchase_order_lines') { var rc = pols[e.row], pc = H.indexOf('purchase_order_line_id'); return (rc && pc !== -1 && tr(v[pc]) === tr(rc.pol)) ? true : 'NOT_A_PO_LINE_THIS_CONFIRM_RECONCILED'; }
return null; },
expect: function (name, H, v, e) {
if (name === 'shipment_line_allocations') return e.col === C.aStat ? shipmentCellKey_('executed') : (e.col === C.aUpd ? 'META' : null);
if (name === 'purchase_order_lines') { var rc = pols[e.row]; if (!rc) return null; return e.col === C.pShip ? shipmentCellKey_(rc.newShipped) : (e.col === C.pRem ? shipmentCellKey_(rc.newRemaining) : null); }
return undefined; },
preflight: function () { var why = [];
// route / event rows of this shipment that this Confirm did not journal = an append that landed unseen (or an earlier Confirm's leftover)
[['shipment_routes', 'shipment_route_id'], ['shipment_events', 'shipment_event_id']].forEach(function (x) { var sh = ss.getSheetByName(x[0]); if (!sh) return;
var tb = shipmentReadSheet_(sh), sc2 = tb.col('shipment_id'), ic = tb.col(x[1]), mine = {}; rollback.forEach(function (e) { if (e.kind === 'row' && e.sheet === sh && e.id) mine[String(e.id)] = 1; });
var et3_ = x[0] === 'shipment_events' ? tb.col('event_type') : -1;   // AD3 A (REVIEW_AD3 F2a): B's pre-Confirm executing-carrier record is not this Confirm's leftover
for (var r = 1; sc2 !== -1 && r < tb.rows.length; r++) if (tr(tb.rows[r][sc2]) === shipmentId && !mine[tr(tb.rows[r][ic])] && !(et3_ !== -1 && tr(tb.rows[r][et3_]).toLowerCase() === 'executing_carrier_assigned')) why.push('LANDED_UNJOURNALED_ROW ' + x[0] + ' row ' + (r + 1)); });
// allocation / PO cells this Confirm planned that hold the planned value without a journal entry = a write that landed unseen
function jr(sh, r, c) { for (var i = 0; i < rollback.length; i++) { var e = rollback[i]; if (e.kind === 'cell' && e.sheet === sh && e.row === r && e.col === c) return true; } return false; }
var aSh = ss.getSheetByName('shipment_line_allocations'), pSh = ss.getSheetByName('purchase_order_lines');
if (aSh && C.aStat !== undefined) { var ad = aSh.getDataRange().getValues(); Object.keys(flips).forEach(function (rw) { var r = Number(rw); if (!jr(aSh, r, C.aStat) && ad[r - 1] && tr(ad[r - 1][C.aStat]).toLowerCase() === 'executed') why.push('LANDED_UNJOURNALED_CELL shipment_line_allocations row ' + r); }); }
if (pSh && C.pShip !== undefined) { var pd = pSh.getDataRange().getValues(); Object.keys(pols).forEach(function (rw) { var r = Number(rw), rc = pols[rw]; if (!jr(pSh, r, C.pShip) && pd[r - 1] && shipmentCellKey_(pd[r - 1][C.pShip]) === shipmentCellKey_(rc.newShipped) && shipmentCellKey_(rc.newShipped) !== shipmentCellKey_(rc.prevShipped)) why.push('LANDED_UNJOURNALED_CELL purchase_order_lines row ' + r); }); }
// INT-CAND7 r5 (F-R4-2): remaining_qty too (32_ now journals before each write; this only catches a writer outside this Confirm)
if (pSh && pd && C.pRem !== undefined && C.pRem !== -1) Object.keys(pols).forEach(function (rw) { var r = Number(rw), rc = pols[rw]; if (!jr(pSh, r, C.pRem) && pd[r - 1] && shipmentCellKey_(pd[r - 1][C.pRem]) === shipmentCellKey_(rc.newRemaining) && shipmentCellKey_(rc.newRemaining) !== shipmentCellKey_(rc.prevRemaining)) why.push('LANDED_UNJOURNALED_CELL purchase_order_lines remaining_qty row ' + r); });
return why; } });
}

try {

var scLocked = sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', shipmentId);
sc13AssertReady_(scLocked);
if (sc13LinkIds_(ss, shipmentId).length) sc13Verify_(ss, scLocked);
sheetEnsureColumns_(shipSheet, ['status', 'shipped_at', 'shipped_by', 'actual_departure_date', 'updated_at', 'updated_by']);
var s = shipmentReadSheet_(shipSheet);
var idCol = s.col('shipment_id');
if (idCol === -1) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'shipment_id column not found', stage: 'load', zero_write: true }); }
var row = -1;
for (var i = 1; i < s.rows.length; i++) { if (String(s.rows[i][idCol]).trim() === shipmentId) { row = i + 1; break; } }
if (row === -1) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId, stage: 'load', zero_write: true }); }
var rv = s.rows[row - 1];
function sc(name) { var c = s.col(name); return c === -1 ? '' : String(rv[c] == null ? '' : rv[c]).trim(); }
var curStatus = sc('status').toLowerCase();











if (curStatus === 'cancelled') {
lock.releaseLock();
return jsonResponse_({ success: false, code: 'SHIPMENT_CANCELLED', stage: 'load', shipment_id: shipmentId,
error: 'Cannot Confirm: this Shipment Draft was cancelled. Its factory stock reservation has already ' +
'been released and the units may now be committed elsewhere. Nothing was written. Create a new ' +
'Shipment Draft from the approved plan instead.', zero_write: true });
}





if (sc('record_origin') === 'IMPORT_HISTORICAL') {
lock.releaseLock();
return jsonResponse_({ success: false, code: 'SHIPMENT_HISTORICAL_RECORD', stage: 'load', shipment_id: shipmentId,
error: 'Cannot Confirm: this shipment is an imported historical (opening) record - it was dispatched before this system and is ' +
'never dispatched again here. Nothing was written.', zero_write: true });
}


var existingRoutes = csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', shipmentId);
var existingEvents = csdEventExists_(ss, shipmentId);
var existingMovement = csdMovementExists_(ss, shipmentId);


// INT-CAND7 r4 / r5 (F-R3-5, F-R4-4, F-R4-5): dispatch evidence under a NOT-dispatched status, or a dispatched status whose dispatch is not
// complete in the rows, is neither a fresh Confirm nor a finished one - refuse, read-only, nothing written, nothing deducted again
var csdDispSt_ = csdIsDispatchedStatus_(curStatus);
if (!csdDispSt_ && (existingRoutes > 0 || existingEvents || existingMovement)) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'DISPATCH_STATE_INCONSISTENT', stage: 'idempotency', shipment_id: shipmentId,
data: { status: curStatus, route_nodes_existing: existingRoutes, events_existing: !!existingEvents, movement_existing: !!existingMovement },
error: 'This shipment reads "' + curStatus + '" but dispatch evidence already exists (stock movement / route / event rows): it is neither a fresh Confirm nor a finished one. Nothing was written and nothing was deducted. Review its stock, movement, route and event rows before any further action.' }); }
if (csdDispSt_ || existingRoutes > 0 || existingEvents || existingMovement) {
var dcs_ = csdDispatchConsistency_(ss, shipmentId, existingRoutes, existingEvents, existingMovement);
if (!dcs_.ok) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'DISPATCH_STATE_INCONSISTENT', stage: 'idempotency', shipment_id: shipmentId,
data: { status: curStatus, route_nodes_existing: existingRoutes, events_existing: !!existingEvents, movement_existing: !!existingMovement, not_complete: dcs_.why.slice(0, 20) },
error: 'This shipment reads "' + curStatus + '" but its dispatch is not complete in the rows (' + dcs_.why.slice(0, 5).join('; ') + '): it is neither a fresh Confirm nor a finished one. Nothing was written and nothing was deducted. Review its stock, movement, route, event, allocation and PO-line rows before any further action.' }); }
lock.releaseLock();
return jsonResponse_({ success: true, already_confirmed: true, data: { shipment_id: shipmentId, status: sc('status') || curStatus, route_nodes_existing: existingRoutes, document_generation: docGate.status==='NOT_REQUIRED'?dgsNoShipmentDocuments_(shipmentId):undefined, note: 'Shipment already confirmed/dispatched — no changes made (idempotent).' } });
}


if (typeof editP1Gate15f2_ !== 'function' || typeof editTokSame_ !== 'function') { lock.releaseLock(); return jsonResponse_({ success: false, zero_write: true, code: 'DEPLOYMENT_HALF_SYNCED', stage: 'edit_conflict', shipment_id: shipmentId, error: 'This deployment is half updated (22_ needs the R15F2 12_). Nothing was written.' }); } var p1d_ = editP1Gate15f2_(s.col('updated_at') === -1 ? undefined : rv[s.col('updated_at')], body.expected_updated_at); if (!p1d_ && String(body.expected_updated_at == null ? '' : body.expected_updated_at).trim() !== '' && editTokSame_(rv[s.col('updated_at')], body.expected_updated_at) !== 'SAME') p1d_ = { code: 'EDIT_CONFLICT', stage: 'edit_conflict', error: 'EDIT_CONFLICT: this shipment was changed after your Save (another tab or user). Nothing was dispatched and nothing was written. Reload it, review, then Confirm again.', data: { current_updated_at: editTok_(rv[s.col('updated_at')]) } }; if (p1d_) { lock.releaseLock(); return jsonResponse_(Object.assign({ success: false, zero_write: true, shipment_id: shipmentId }, p1d_)); }   /* R15F2 P1 (GAP-2) */ var lineSheet = ss.getSheetByName('shipment_lines');
if (!lineSheet) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'shipment_lines sheet not found', stage: 'validate', zero_write: true }); }
var ls = shipmentReadSheet_(lineSheet);
var lShip = ls.col('shipment_id'), lSku = ls.col('sku');
var lQtyCol = ls.col('shipment_qty'); if (lQtyCol === -1) lQtyCol = ls.col('qty');
var lines = [];
for (var li = 1; li < ls.rows.length; li++) {
if (String(ls.rows[li][lShip]).trim() !== shipmentId) continue;
if (typeof sc13RowRemoved_ === 'function' && sc13RowRemoved_(ls, ls.rows[li])) continue;   // XCO-R15G O-1   // XCO-R15G H2: a removed line never ships
var sku = String(ls.rows[li][lSku] || '').trim();
var qty = Math.round(csdNum_(ls.rows[li][lQtyCol]));
lines.push({ sku: sku, qty: qty });
}
if (!lines.length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Shipment has no lines.', stage: 'validate', zero_write: true }); }
for (var lx = 0; lx < lines.length; lx++) { if (!lines[lx].sku || lines[lx].qty <= 0) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Every shipment line must have a SKU and shipped quantity > 0.', stage: 'validate', zero_write: true }); } }


var missing = [];
if (!sc('external_shipment_id')) missing.push('Shipment ID (external)');
if (!sc('reference_id')) missing.push('Reference ID');
if (!sc('warehouse_code')) missing.push('Warehouse Code');
if (!sc('carrier_id') && !csdCarrierToBeAssigned3_(sc)) missing.push('Carrier');   // AD3 A (Owner 8): a blank carrier passes ONLY with the saved explicit to-be-assigned marker; the route stage then allows manual logistics only
if (!sc('shipping_method')) missing.push('Shipping Method');
if (!sc('etd')) missing.push('ETD');
if (!sc('eta') && String(body.route_mode == null ? '' : body.route_mode).trim().toUpperCase() !== 'MANUAL') missing.push('ETA');   // AD3 A (Owner supplement 3): a missing ETA never blocks the explicit manual logistics flow (ETA stays blank = undetermined; nothing is invented)
if (csdNum_(sc('shipment_total_qty')) <= 0 && csdNum_(sc('total_qty')) <= 0) missing.push('Total Qty');
if (missing.length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Cannot Confirm — missing required fields: ' + missing.join(', '), stage: 'validate', zero_write: true }); }
// A-DELTA1 c2 item 4: the destination passes the ONE destination-type rule (12_) before anything else is resolved - zero write otherwise.
var dt22_ = csdDestTypeGate22_(ss, sc); if (dt22_) { lock.releaseLock(); return jsonResponse_(dt22_); }
var lp22_ = csdLogicalPlatformGate22_(sc); if (lp22_) { lock.releaseLock(); return jsonResponse_(lp22_); }   // AD3 C round 3 (review F4): every source
var cartonChk = shipmentValidateCartons_(ss, shipmentId, true);
if (!cartonChk.ok) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Cannot Confirm — ' + cartonChk.error, stage: 'validate', zero_write: true }); }


// AD3 A (Owner rule 6): route_mode '' (template) | 'MANUAL' = the user's EXPLICIT manual logistics fallback; never chosen by the server
var routeMode3_ = String(body.route_mode == null ? '' : body.route_mode).trim().toUpperCase();
if (routeMode3_ && routeMode3_ !== 'MANUAL' && routeMode3_ !== 'TEMPLATE') { lock.releaseLock(); return jsonResponse_({ success: false, code: 'ROUTE_MODE_INVALID', error: 'Cannot Confirm - route_mode must be blank or MANUAL (got ' + routeMode3_ + '). Nothing was written.', stage: 'route_template', zero_write: true }); }
if (routeMode3_ === 'MANUAL' && overrideTemplateId) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'ROUTE_MODE_CONFLICT', error: 'Cannot Confirm - choose either a route template or manual logistics, not both. Nothing was written.', stage: 'route_template', zero_write: true }); }
var tplRes = csdResolveTemplate_(ss, sc, overrideTemplateId), templateId = '', tplNodes = [], manual3_ = null;
if (tplRes.ok) { templateId = tplRes.templateId; tplNodes = csdTemplateNodes_(ss, templateId);
  if (tplNodes.length < 2) tplRes = { ok: false, code: 'ROUTE_TEMPLATE_NODES_INSUFFICIENT', error: 'Route Template "' + templateId + '" needs at least a start and end node (found ' + tplNodes.length + ').' };
  else { var dtc3_ = csdDomesticTerminalCheck3_(ss, sc, csdBindDestinationPlaceholder_(ss, sc, tplNodes).nodes);   // AD3 A: a domestic snapshot must end at the saved destination
    if (!dtc3_.ok) tplRes = { ok: false, code: 'ROUTE_TEMPLATE_TERMINAL_NOT_DESTINATION', error: 'ROUTE_TEMPLATE_TERMINAL_NOT_DESTINATION: route template ' + templateId + ' does not end at this domestic shipment\'s saved destination (' + dtc3_.why + ') - it is not applicable.' }; } }
if (tplRes.ok && routeMode3_ === 'MANUAL') { lock.releaseLock(); return jsonResponse_({ success: false, code: 'ROUTE_MANUAL_NOT_ALLOWED_TEMPLATE_APPLIES', route_template_id: templateId, error: 'Cannot Confirm with manual logistics - route template ' + templateId + ' applies to this shipment; manual logistics is only the fallback when no route applies. Nothing was written.', stage: 'route_template', zero_write: true }); }
if (!tplRes.ok) {
  var elig3_ = CSD_MANUAL_ELIGIBLE_[tplRes.code] === 1, mp3_ = elig3_ ? csdManualRouteNodes3_(ss, sc) : null;
  if (routeMode3_ !== 'MANUAL' || !elig3_ || !mp3_.ok) { lock.releaseLock();
    var avail3_ = !!(elig3_ && mp3_ && mp3_.ok);
    return jsonResponse_({ success: false, code: (avail3_ && routeMode3_ !== 'MANUAL') ? 'ROUTE_TEMPLATE_NOT_FOUND_MANUAL_AVAILABLE' : ((routeMode3_ === 'MANUAL' && mp3_ && !mp3_.ok) ? mp3_.code : (tplRes.code || 'ROUTE_TEMPLATE_UNRESOLVED')),
      error: tplRes.error + (avail3_ ? ' No route template applies: manual logistics (no route) can be chosen explicitly for this shipment.' : ''), stage: 'route_template', zero_write: true,
      manual_fallback: { available: avail3_, route_mode: 'MANUAL', resolver_code: tplRes.code || '', resolver_error: tplRes.error, reason: avail3_ ? '' : (elig3_ ? mp3_.code : 'ROUTE_MANUAL_NOT_ALLOWED_FOR_' + (tplRes.code || 'UNRESOLVED')), missing_field: (mp3_ && !mp3_.ok) ? mp3_.missing_field : '' } }); }
  manual3_ = mp3_; templateId = manual3_.templateId; tplNodes = manual3_.nodes;
}
var destBind_ = manual3_ ? { nodes: tplNodes, binding: { applied: false, reason: 'MANUAL_ROUTE', source: '' } } : csdBindDestinationPlaceholder_(ss, sc, tplNodes); tplNodes = destBind_.nodes;   // A-delta2 R (Owner rule 4): per-shipment copy; the template is never rebound
var srcBind3_ = manual3_ ? { nodes: tplNodes, binding: { applied: false, reason: 'MANUAL_ROUTE', source: '' } } : csdBindSourcePickup3_(ss, sc, tplNodes); tplNodes = srcBind3_.nodes;   // AD3 A: the pickup node bound to the real source (copy)


























var srcWarehouseId = sc('source_warehouse_id');
if (!srcWarehouseId) {
lock.releaseLock();
return jsonResponse_({ success: false, code: 'SHIPMENT_SOURCE_WAREHOUSE_MISSING', stage: 'source',
shipment_id: shipmentId,
error: 'Cannot Confirm - this Shipment declares no source warehouse, and dispatch consumes only the '
+ 'declared source. Nothing was written.', zero_write: true });
}
var srcRec = null;
try {
srcRec = (typeof ovsReadWarehouseRecord_ === 'function') ? ovsReadWarehouseRecord_(ss, srcWarehouseId) : null;
} catch (eSrcRec) { srcRec = null; }






var srcKnown = !!srcRec;
var srcDomain = (typeof shipmentSourceDomain_ === 'function')
? shipmentSourceDomain_(ss, srcWarehouseId) : 'FACTORY';
if(docGate.status==='NOT_REQUIRED'&&(srcDomain!=='OVERSEAS'||docGate.source_warehouse_id!==srcWarehouseId)){
lock.releaseLock();return jsonResponse_({success:false,code:'DOCUMENT_SOURCE_CHANGED',stage:'source',zero_write:true,error:'The source warehouse changed during Confirm. Reload and confirm again. Nothing was written.'});
}
var srcSheets = (typeof shipmentDomainSheets_ === 'function') ? shipmentDomainSheets_(ss, srcDomain) : null;




if (!srcSheets && srcDomain !== 'OVERSEAS') {
var fallbackStock_ = ss.getSheetByName('factory_stock');
if (fallbackStock_) srcSheets = { domain: 'FACTORY', stockSheet: fallbackStock_, movSheet: null };
}
if (!srcSheets || !srcSheets.stockSheet) {
lock.releaseLock();
return jsonResponse_({ success: false, code: 'DISPATCH_SOURCE_DOMAIN_UNAVAILABLE', stage: 'stock',
shipment_id: shipmentId, source_warehouse_id: srcWarehouseId, source_domain: srcDomain,
error: 'Cannot Confirm - the ' + srcDomain + ' inventory tables this source needs are not present in '
+ 'this deployment. Nothing was written.', zero_write: true });
}


var stockSheet = (srcDomain === 'OVERSEAS') ? null : srcSheets.stockSheet;
var needBySku = {}; lines.forEach(function (l) { needBySku[l.sku] = (needBySku[l.sku] || 0) + l.qty; });
// INT-CAND8 (I1, spec r2 F8): the books of the keys this Confirm deducts, inside the lock, BEFORE the declared-source sufficiency refusal
var dbSheets = srcDomain === 'OVERSEAS' ? srcSheets : { domain: srcDomain, stockSheet: srcSheets.stockSheet, movSheet: ss.getSheetByName('factory_stock_movements') };
var dbBooks = shipmentReservationBooks_(srcDomain, dbSheets, srcWarehouseId, Object.keys(needBySku), { absentLedgerIsEmpty: srcDomain !== 'OVERSEAS' });   // spec r3 A5
if (dbBooks.verdict === 'RECONCILED') { var dbT_ = shipmentCancelBooks_(ss, shipmentId, srcWarehouseId); if (dbT_.verdict !== 'RECONCILED') dbBooks = dbT_; }   // INT-CAND8 r5: + every key the shipment touches (spec r5)
if (dbBooks.verdict !== 'RECONCILED') { lock.releaseLock(); return jsonResponse_({ success: false, code: dbBooks.verdict, stage: 'reservation_books', shipment_id: shipmentId,
source_warehouse_id: srcWarehouseId, source_domain: srcDomain, data: { keys_checked: dbBooks.keys, keys_mismatched: dbBooks.mismatched, keys_unknown: dbBooks.unknown },
error: shipmentBooksMessage_(dbBooks, 'Confirm Shipment & Dispatch'),
note: 'The shipment remains ready_to_ship and shipped_at is blank. Nothing was written and no Drive folder or file was created.' }); }
var deductPlan = [];
var stockErrors = [];
Object.keys(needBySku).forEach(function (sku) {
var need = needBySku[sku];
var supply = csdDeclaredSourceSupply_(srcDomain, srcSheets, srcWarehouseId, sku, shipmentId);
if (supply.qty < need) {
stockErrors.push(sku + ' (need ' + need + ', ' + supply.basis + ' ' + supply.qty + ' at '
+ srcWarehouseId + ')');
return;
}
deductPlan.push({ sku: sku, warehouseId: srcWarehouseId, take: need });
});
if (stockErrors.length) {
lock.releaseLock();
return jsonResponse_({ success: false, code: 'DECLARED_SOURCE_INSUFFICIENT', stage: 'stock',
shipment_id: shipmentId, source_warehouse_id: srcWarehouseId, source_domain: srcDomain,
source_warehouse_known: srcKnown, shortages: stockErrors,
error: 'Cannot Confirm - the declared source ' + srcWarehouseId + ' cannot fulfil: '
+ stockErrors.join('; ') + '. Nothing was deducted by this Confirm. Another warehouse holding this SKU is NOT '
+ 'used automatically - moving the source is a separate, authorized decision.', zero_write: true });
}






var csdOvs_ = (srcDomain === 'OVERSEAS' && CSD_OVERSEAS_NO_PO_LINEAGE_) ? csdOverseasTransferEligibility_(ss, { company: sc('company'), country: sc('country'), marketplace: sc('marketplace'), source_warehouse_id: srcWarehouseId, destination_warehouse_id: sc('destination_warehouse_id'), warehouse_id: sc('warehouse_id'), shipment_id: shipmentId }) : null;   // A-delta1 C6
var slaPlan = (csdOvs_ && csdOvs_.eligible === true) ? { ok: true, cols: {}, allocFlips: [], poReconcile: [], already_executed: false, overseas_no_po_lineage: true } : slaPrepareExecution_(ss, shipmentId);   // A-delta1 C5
if (!slaPlan.ok) { lock.releaseLock(); return jsonResponse_({ success: false, error: slaPlan.error, stage: 'po_allocation', detail: slaPlan.detail || null, shipment_id: shipmentId, zero_write: true, overseas_transfer_check: csdOvs_ }); }   // C6: names why an overseas source still needs PO allocations


var vGate = docGate.status==='NOT_REQUIRED' ? Object.assign(dgsNoShipmentDocuments_(shipmentId),{built:null,blockers:[],documents:0}) : dgsFrozenValueGate_(ss, shipmentId);
if (!vGate.ok) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'DOCUMENT_FROZEN_VALUE_INVALID', stage: 'document_values', shipment_id: shipmentId, error: 'Cannot Confirm \u2014 a document this shipment will produce is missing a required value.', blockers: vGate.blockers, note: 'The shipment remains ready_to_ship and shipped_at is blank. Nothing was written and no Drive folder or file was created.', zero_write: true }); }


var now = shipmentTimestamp_();
var today = shipmentToday_();


var MOV_HEADERS = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty', 'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
var movSheet = fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV_HEADERS);
fcWriteEnsureColumns_(movSheet, MOV_HEADERS);
var movementsCreated = 0;
var reservationReleased = 0;



var heldByKey = factoryStockOwnerReservedTx_(movSheet, FSTX_RESERVATION_OWNER_TYPE_, shipmentId);













var ovsSheets_ = (srcDomain === 'OVERSEAS') ? srcSheets : null;
var ovsSnap_ = ovsSheets_ ? ovsSheets_.stockSheet : null;
var ovsMov_ = ovsSheets_ ? ovsSheets_.movSheet : null;
var ovsHeldByKey_ = (ovsMov_ && typeof ovsOwnerReservedTx_ === 'function')
? ovsOwnerReservedTx_(ovsMov_, OVSTX_RESERVATION_OWNER_TYPE_, shipmentId) : {};

// INT-CAND7 r4: the start snapshot of the source stock sheet and the ledger's start mark, for the undo's preflight (one read)
cfDom_ = { domain: srcDomain === 'OVERSEAS' ? SHIPMENT_DOMAIN_OVERSEAS_ : SHIPMENT_DOMAIN_FACTORY_, stock: srcDomain === 'OVERSEAS' ? ovsSnap_ : stockSheet, mov: srcDomain === 'OVERSEAS' ? ovsMov_ : movSheet };
cfDom_.stockData = cfDom_.stock.getDataRange().getValues(); cfDom_.movStart = cfDom_.mov.getLastRow(); cfDom_.movIds = shipmentMovIdSet_(cfDom_.mov); cfKeys_ = {};   // INT-CAND7 r5: + the start ledger id set
deductPlan.forEach(function (d) {
var key = d.warehouseId + '||' + d.sku;

if (srcDomain === 'OVERSEAS') {
var heldO = Math.max(0, Math.round(ovsHeldByKey_[key] || 0));
var giveO = Math.min(heldO, d.take);
ovsHeldByKey_[key] = heldO - giveO;
if (giveO > 0) {
cfKeys_[key] = { domain: SHIPMENT_DOMAIN_OVERSEAS_, res: -giveO, avail: 0 };   // INT-CAND7 r4: this key's deltas, recorded BEFORE the write
var ocR_ = ovsConsumeReservationTx_({
snapSheet: ovsSnap_, movSheet: ovsMov_, warehouseId: d.warehouseId, sku: d.sku, qty: giveO,
ownerType: OVSTX_RESERVATION_OWNER_TYPE_, ownerId: shipmentId, journal: rollback,
now: now, movementDate: today, createdBy: actor,
note: 'Shipment dispatch | overseas reservation consumed ' + giveO
});
if (ocR_ && ocR_.movementId) { undoIds_ = undoIds_ || {}; undoIds_[String(ocR_.movementId)] = 1; undoSeq_ = undoSeq_ || []; undoSeq_.push({ sheet: ovsMov_, id: String(ocR_.movementId) }); }   // INT-CAND7 r3/r4
reservationReleased += giveO;
movementsCreated++;
}
return;
}
var held = Math.max(0, Math.round(heldByKey[key] || 0));
var give = Math.min(held, d.take);
heldByKey[key] = held - give;


cfKeys_[key] = { domain: SHIPMENT_DOMAIN_FACTORY_, cur: -d.take, res: -give };   // INT-CAND7 r4: this key's deltas, recorded BEFORE the write
var dlR_ = factoryStockApplyDeltaTx_({
stockSheet: stockSheet, movSheet: movSheet, warehouseId: d.warehouseId, sku: d.sku,
deltaQty: -d.take, reservedDelta: -give, journal: rollback, now: now, movementDate: today,
movementType: CSD_MOV_TYPE_, relatedEntityType: 'shipment', relatedEntityId: shipmentId,
note: 'Shipment dispatch deduction' + (give > 0 ? (' | reservation released ' + give) : ''),
createdBy: actor
});
if (dlR_ && dlR_.movementId) { undoIds_ = undoIds_ || {}; undoIds_[String(dlR_.movementId)] = 1; undoSeq_ = undoSeq_ || []; undoSeq_.push({ sheet: movSheet, id: String(dlR_.movementId) }); }   // INT-CAND7 r3/r4
reservationReleased += give;
movementsCreated++;
});


var ROUTE_HEADERS = ['shipment_route_id', 'shipment_id', 'route_template_id', 'route_template_node_id', 'sequence_no', 'node_type', 'node_code', 'location_ref_type', 'location_ref_id', 'location_name', 'country', 'region', 'city', 'latitude', 'longitude', 'transport_mode', 'planned_event_type', 'planned_arrival_date', 'planned_departure_date', 'actual_arrival_date', 'actual_departure_date', 'status', 'created_at', 'updated_at'];
var routeSheet = fcWriteEnsureSheet_(ss, 'shipment_routes', ROUTE_HEADERS);
fcWriteEnsureColumns_(routeSheet, ROUTE_HEADERS);
var etd = sc('etd');
var routeIdByOrigin = null, originNode = null;
var routeNodesCreated = 0;
for (var ni = 0; ni < tplNodes.length; ni++) {
var tn = tplNodes[ni];
var status = manual3_ ? (ni === 0 ? 'completed' : 'planned') : ((tplNodes.length === 1) ? 'current' : (ni === 0 ? 'completed' : (ni === 1 ? 'current' : 'planned')));   // AD3 A: a manual destination stays planned until a manual arrival report
var srid = csdId_('SRN-', 8);
var lat = (tn.latitude === '' || tn.latitude == null) ? '' : (isNaN(parseFloat(tn.latitude)) ? '' : parseFloat(tn.latitude));
var lng = (tn.longitude === '' || tn.longitude == null) ? '' : (isNaN(parseFloat(tn.longitude)) ? '' : parseFloat(tn.longitude));
if ((lat === '' ) !== (lng === '')) { lat = ''; lng = ''; }
fcWriteAppendByHeader_(routeSheet, {
shipment_route_id: srid, shipment_id: shipmentId, route_template_id: templateId, route_template_node_id: tn.nodeId,
sequence_no: tn.seq, node_type: tn.nodeType, node_code: tn.nodeCode,
location_ref_type: tn.locationRefType ? tn.locationRefType : (tn.logisticsLocationId ? 'logistics_location' : ''), location_ref_id: tn.locationRefType ? tn.locationRefId : (tn.logisticsLocationId || ''),
location_name: tn.locationName, country: tn.country, region: tn.region, city: tn.city, latitude: lat, longitude: lng,
transport_mode: tn.transportMode, planned_event_type: tn.plannedEventType,
planned_arrival_date: csdOffsetDate_(etd, tn.offsetDays), planned_departure_date: '',
actual_arrival_date: (ni === 0 && !manual3_ ? today : ''), actual_departure_date: (ni === 0 && !manual3_ ? today : ''),   // AD3 A: manual = no date
status: status, created_at: now, updated_at: now
});
rollback.push({ kind: 'row', sheet: routeSheet, row: routeSheet.getLastRow(), id: srid, idCol: 'shipment_route_id' });
routeNodesCreated++;
if (ni === 0) { originNode = tn; routeIdByOrigin = srid; }
}


var EVENT_HEADERS = ['shipment_event_id', 'shipment_id', 'shipment_route_id', 'event_sequence', 'event_time', 'event_type', 'event_status', 'location_name', 'country', 'city', 'latitude', 'longitude', 'source', 'source_event_id', 'raw_status', 'note', 'created_by', 'created_at', 'updated_by', 'updated_at'];
var eventSheet = fcWriteEnsureSheet_(ss, 'shipment_events', EVENT_HEADERS);
fcWriteEnsureColumns_(eventSheet, EVENT_HEADERS);
var oLat = originNode && originNode.latitude !== '' && originNode.latitude != null && !isNaN(parseFloat(originNode.latitude)) ? parseFloat(originNode.latitude) : '';
var oLng = originNode && originNode.longitude !== '' && originNode.longitude != null && !isNaN(parseFloat(originNode.longitude)) ? parseFloat(originNode.longitude) : '';
if ((oLat === '') !== (oLng === '')) { oLat = ''; oLng = ''; }
var sevId_ = csdId_('SEV-', 8), evSeq3_ = 1;   // AD3 A (REVIEW_AD3 F2b): next event_sequence of this shipment (B's pre-Confirm executing-carrier record may hold 1)
(function () { var t = shipmentReadSheet_(eventSheet), cS = t.col('shipment_id'), cQ = t.col('event_sequence'), mx = 0; for (var r = 1; cS !== -1 && cQ !== -1 && r < t.rows.length; r++) if (String(t.rows[r][cS]).trim() === shipmentId) { var q = Number(t.rows[r][cQ]); if (isFinite(q) && q > mx) mx = q; } evSeq3_ = Math.floor(mx) + 1; })();
fcWriteAppendByHeader_(eventSheet, {
shipment_event_id: sevId_, shipment_id: shipmentId, shipment_route_id: routeIdByOrigin,
event_sequence: evSeq3_, event_time: now, event_type: CSD_EVENT_TYPE_, event_status: 'completed',
location_name: (originNode && originNode.locationName) || sc('ship_from'), country: (originNode && originNode.country) || '', city: (originNode && originNode.city) || '',
latitude: oLat, longitude: oLng, source: 'system', source_event_id: 'confirm:' + shipmentId,
raw_status: manual3_ ? 'SHIPMENT CONFIRMED / MANUAL LOGISTICS (NO ROUTE TEMPLATE)' : 'SHIPMENT CONFIRMED / DEPARTED ORIGIN', note: manual3_ ? ('Initial event created by Confirm Shipment. Manual logistics (route_mode MANUAL) chosen by ' + actor + ': no route template applied (' + (tplRes.code || '') + '); 2-node snapshot ' + manual3_.info.origin_warehouse_id + ' -> ' + manual3_.info.destination_warehouse_id + '.').slice(0, 500) : 'Initial event created by Confirm Shipment.',
created_by: actor, created_at: now, updated_by: actor, updated_at: now
});
rollback.push({ kind: 'row', sheet: eventSheet, row: eventSheet.getLastRow(), id: sevId_, idCol: 'shipment_event_id' });






var prevStatus = s.col('status') === -1 ? '' : rv[s.col('status')];
var prevShippedAt = s.col('shipped_at') === -1 ? '' : rv[s.col('shipped_at')];
var prevShippedBy = s.col('shipped_by') === -1 ? '' : rv[s.col('shipped_by')];
var prevActDep = s.col('actual_departure_date') === -1 ? '' : rv[s.col('actual_departure_date')];
function setShip(name, val, prev) { var c = s.col(name); if (c !== -1) { rollback.push({ kind: 'cell', sheet: shipSheet, row: row, col: c, prev: prev, wrote: val, meta: /_at$/.test(name) }); shipSheet.getRange(row, c + 1).setValue(val); } }   // INT-CAND7 r4: journaled BEFORE the write (r5: a timestamp = meta)
setShip('status', CSD_CONFIRMED_STATUS_, prevStatus);

if (vGate && vGate.built && typeof sfoSnapshotDigest_ === 'function' && s.col('final_output_validated_digest') !== -1) setShip('final_output_validated_digest', sfoSnapshotDigest_(vGate.built, shipmentId), rv[s.col('final_output_validated_digest')]);
if (!String(prevShippedAt || '').trim()) { setShip('shipped_at', now, prevShippedAt); setShip('shipped_by', actor, prevShippedBy); }
if (s.col('updated_at') !== -1) setShip('updated_at', editNextStamp_(now, [rv[s.col('updated_at')]]), rv[s.col('updated_at')]);   /* R71 small-3 (review m1) */   // INT-CAND7 r4 (F-R3-11): journaled too
if (s.col('updated_by') !== -1) setShip('updated_by', actor, rv[s.col('updated_by')]);
SpreadsheetApp.flush();



var slaExec = slaApplyExecution_(ss, slaPlan, actor, now, rollback);
SpreadsheetApp.flush();

lock.releaseLock();









var shippedAtFinal = String(prevShippedAt || '').trim() || now;
var docResult = { ok: false, reason: 'NOT_ATTEMPTED' };
try { docResult = vGate.status==='NOT_REQUIRED' ? dgsNoShipmentDocuments_(shipmentId) : dgsGenerateShipmentDocuments_(ss, shipmentId, actor, { prebuilt: vGate.built }); }
catch (ed) { docResult = { ok: false, reason: 'DOCUMENT_GENERATION_FAILED', message: (ed && ed.message ? String(ed.message) : String(ed)) }; }

return jsonResponse_({
success: true,
data: {
shipment_id: shipmentId, status: CSD_CONFIRMED_STATUS_, route_template_id: templateId, destination_binding: destBind_.binding,
route_mode: manual3_ ? 'MANUAL' : 'TEMPLATE', source_binding: srcBind3_.binding, manual_route: manual3_ ? manual3_.info : undefined,   // AD3 A
eta_estimate: (function () { try { return csdDomesticLeadEstimate3_(ss, sc); } catch (eE) { return { status: 'UNDETERMINED', reason: 'ESTIMATE_READ_FAILED', written: false }; } })(),   // AD3 A: read-only, never written
route_nodes_created: routeNodesCreated, events_created: 1, stock_movements_created: movementsCreated,
factory_reservation_released: reservationReleased,
po_allocations_executed: slaExec.executed_allocations, po_lines_reconciled: slaExec.reconciled_po_lines,
shipped_at: shippedAtFinal,



document_generation: {
status: docResult.status==='NOT_REQUIRED' ? 'NOT_REQUIRED' : (docResult.ok && !docResult.failed && !docResult.configuration_required ? 'READY' : 'RETRY_REQUIRED'),
registry: 'generated_documents', retry_safe: docResult.status!=='NOT_REQUIRED',
expected: docResult.expected || 0, generated: docResult.generated || 0, reused: docResult.reused || 0,
failed: docResult.failed || 0, configuration_required: docResult.configuration_required || 0,
folder_url: docResult.folder_url || '', folder_name: docResult.folder_name || '',
destination_bucket: docResult.destination_bucket || '', reason: docResult.ok ? '' : (docResult.reason || ''),
results: docResult.results || [],
message: docResult.ok && !docResult.failed && !docResult.configuration_required ? '' : 'Shipment was confirmed successfully, but one or more documents were not generated. The shipment remains Shipped. Retry document generation.'
},
document_readiness: docGate ? { status: docGate.status, manifest: docGate.manifest } : null,
warnings: tplRes.warnings || []
}
});
} catch (err) {
var undoR_ = undoAll();
// INT-CAND7 r5 (F-R4-6): the stop text from facts - the status as it reads now, not the phase
var stNow_ = ''; if (!undoR_.complete) { try { stNow_ = (row > 0 && s && s.col('status') !== -1) ? String(shipSheet.getRange(row, s.col('status') + 1).getValue()).trim() : '(not read)'; } catch (eS_) { stNow_ = '(unreadable)'; } }
try { lock.releaseLock(); } catch (e) {}
if (!undoR_.complete) return jsonResponse_({ success: false, code: 'CONFIRM_ROLLBACK_UNVERIFIED', stage: 'write_rollback_stopped', shipment_id: shipmentId, data: { stopped_at: undoR_.phase, left: undoR_.left.slice(0, 20), undone: undoR_.done.slice(0, 40) },
error: 'Confirm Shipment failed (' + (err && err.message ? err.message : err) + ') and its rollback STOPPED (' + undoR_.phase + ': ' + undoR_.left.slice(0, 3).join('; ') + '). ' + undoR_.done.length + ' undo step(s) were verified; everything else is KEPT. The shipment status now reads "' + stNow_ + '". A repeated Confirm re-checks the dispatch from the rows (status, shipment_out movement, routes, events, allocations, PO lines) and refuses while they disagree; it never answers success over a partly kept dispatch. A stock cell listed above as not proven is NOT detected by that check: do not Confirm again until the shipment, its stock, movement, route, event, allocation and PO rows are reviewed.' });
return jsonResponse_({ success: false, error: 'Confirm Shipment failed and was rolled back: ' + (err && err.message ? err.message : err), stage: 'write_rolled_back', shipment_id: shipmentId });
}
}


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
if (shc !== -1 && String(d[i][shc]).trim() === shipmentId && !(h.indexOf('event_type') !== -1 && String(d[i][h.indexOf('event_type')]).trim().toLowerCase() === 'executing_carrier_assigned')) return true;   // AD3 A (B v1.2 sec.12): B's executing-carrier record is not dispatch evidence
}
return false;
}











// INT-CAND7 r6 (review CHAIN5 CH5-1): dispatch evidence = a shipment_out of this shipment in EITHER ledger - factory (related_entity_id) or
// overseas (reference_id). Every evidence check (the Confirm first gate, cancel, reuse, Done) calls this one.
function csdMovementExists_(ss, shipmentId) {
if (csdFactoryMovementExists_(ss, shipmentId)) return true;
var so = ss.getSheetByName('overseas_inventory_movements'); if (!so) return false;
var v = so.getDataRange().getValues(); if (v.length < 2) return false;
var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); }), tc = h.indexOf('movement_type'), rc = h.indexOf('reference_id');
if (tc === -1 || rc === -1) return false;
for (var i = 1; i < v.length; i++) if (String(v[i][tc]).trim() === 'shipment_out' && String(v[i][rc]).trim() === String(shipmentId).trim()) return true;
return false;
}
function csdFactoryMovementExists_(ss, shipmentId) {   // INT-CAND7 r6: the factory-only reader (unchanged body)
var sh = ss.getSheetByName('factory_stock_movements'); if (!sh) return false;
var d = sh.getDataRange().getValues(); if (d.length < 2) return false;
var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
var tc = h.indexOf('related_entity_type'), ic = h.indexOf('related_entity_id'), mc = h.indexOf('movement_type');
if (tc === -1 || ic === -1) return false;
for (var i = 1; i < d.length; i++) {
if (String(d[i][tc]).trim() !== 'shipment') continue;
if (String(d[i][ic]).trim() !== shipmentId) continue;



if (mc === -1) return true;
if (String(d[i][mc]).trim() === CSD_MOV_TYPE_) return true;
}
return false;
}


// INT-CAND7 r5 (F-R4-5): the dispatched statuses = 12_ SHIPMENT_DISPATCHED_STATUSES_ (shipped .. partially_received) + stuck (13_ active)
function csdIsDispatchedStatus_(st) { st = String(st || '').trim().toLowerCase(); var L0 = (typeof SHIPMENT_DISPATCHED_STATUSES_ !== 'undefined' && SHIPMENT_DISPATCHED_STATUSES_) ? SHIPMENT_DISPATCHED_STATUSES_ : [];
return st === CSD_CONFIRMED_STATUS_ || st === CSD_INTRANSIT_ || st === 'stuck' || L0.indexOf(st) >= 0; }
// INT-CAND7 r5 (F-R4-4): a repeated Confirm on a dispatched status: is the dispatch complete IN THE ROWS? Read-only. -> { ok, why[] }
function csdDispatchConsistency_(ss, shipmentId, routes, events, movF) {
var why = [], T = function (v) { return String(v == null ? '' : v).trim(); }, N = function (v) { var x = Number(v); return isFinite(x) ? Math.round(x) : 0; };
function rd(name) { var sh = ss.getSheetByName(name); if (!sh) return null; var v = sh.getDataRange().getValues(); var h = (v[0] || []).map(function (x) { return T(x).toLowerCase(); }); return { h: h, rows: v.slice(1), c: function (n) { return h.indexOf(n); } }; }
try {
var movO = false, om = rd('overseas_inventory_movements');
if (!movF && om) { var oT = om.c('movement_type'), oR = om.c('reference_id'); for (var i = 0; oT !== -1 && oR !== -1 && i < om.rows.length; i++) if (T(om.rows[i][oT]) === 'shipment_out' && T(om.rows[i][oR]) === shipmentId) { movO = true; break; } }
if (!movF && !movO) why.push('NO_SHIPMENT_OUT_MOVEMENT');
if (!(routes > 0)) why.push('NO_ROUTE_ROWS');
if (!events) why.push('NO_EVENT_ROW');
var ln = rd('shipment_lines'), lids = {}; if (ln) { var lS = ln.c('shipment_id'), lI = ln.c('shipment_line_id'); for (var a = 0; lS !== -1 && lI !== -1 && a < ln.rows.length; a++) if (T(ln.rows[a][lS]) === shipmentId) lids[T(ln.rows[a][lI])] = 1; }
var al = rd('shipment_line_allocations');
if (al && Object.keys(lids).length) { var aL = al.c('shipment_line_id'), aP = al.c('purchase_order_line_id'), aS = al.c('allocation_status'), aQ = al.c('allocated_qty'), mine = 0, exe = 0, pols = {}, exBy = {};
for (var b = 0; aL !== -1 && aS !== -1 && b < al.rows.length; b++) { var st = T(al.rows[b][aS]).toLowerCase(), p = aP === -1 ? '' : T(al.rows[b][aP]);
if (st === 'executed' && p) exBy[p] = (exBy[p] || 0) + N(aQ === -1 ? 0 : al.rows[b][aQ]);
if (!lids[T(al.rows[b][aL])] || (st !== 'draft' && st !== 'executed')) continue; mine++; if (st === 'executed') exe++; if (p) pols[p] = 1; }
if (mine && exe !== mine) why.push('ALLOCATIONS_NOT_EXECUTED ' + exe + '/' + mine);
var po = rd('purchase_order_lines');
if (po && Object.keys(pols).length) { var pI = po.c('purchase_order_line_id'), pC = po.c('completed_qty'), pS = po.c('shipped_qty'), pR = po.c('remaining_qty');
for (var c = 0; pI !== -1 && pS !== -1 && c < po.rows.length; c++) { var id = T(po.rows[c][pI]); if (!pols[id]) continue; var sh = N(po.rows[c][pS]);
if (sh < (exBy[id] || 0)) why.push('PO_LINE_NOT_RECONCILED ' + id + ' shipped ' + sh + ' executed ' + (exBy[id] || 0));   // INT-CAND7 r6 (CH5-7): only a shortfall is this dispatch's
else if (sh === (exBy[id] || 0) && pR !== -1 && pC !== -1 && T(po.rows[c][pR]) !== '' && N(po.rows[c][pR]) !== Math.max(0, N(po.rows[c][pC]) - sh)) why.push('PO_LINE_REMAINING_INCONSISTENT ' + id + ' remaining ' + N(po.rows[c][pR]) + ' completed ' + N(po.rows[c][pC]) + ' shipped ' + sh); } } }
} catch (eD) { why.push('DISPATCH_STATE_READ_FAILED: ' + String(eD && eD.message ? eD.message : eD)); }
return { ok: !why.length, why: why };
}

// A-DELTA1 c2 item 4: Confirm's use of the ONE destination-type rule (owner 12_ shipDestinationTypeRule_). The destination is the saved
// destination_warehouse_id (or warehouse_id); a row without either is left to the existing Warehouse Code / route gates. null = allowed.
function csdDestTypeGate22_(ss, sc) {
  var wid = String(sc('destination_warehouse_id') || sc('warehouse_id') || '').trim(); if (!wid) return null;
  var no = function (code, type) { return { success: false, code: code, error: 'Cannot Confirm \u2014 the destination warehouse ' + wid + (type ? ' (type ' + type + ')' : '') + ' is not a legal shipment destination (' + code + '). Nothing was written.', stage: 'validate', destination_warehouse_id: wid, warehouse_type: type || '', zero_write: true }; };
  if (typeof shipDestinationTypeRule_ !== 'function' || typeof shipDestinationWarehouseFacts_ !== 'function') return no('ROUTE_DESTINATION_TYPE_RULE_UNAVAILABLE', '');
  var f = shipDestinationWarehouseFacts_(ss, wid);
  if (!f.readable || !f.hasTypeColumn || !f.unique) return no('ROUTE_DESTINATION_TYPE_UNKNOWN', f.type || '');
  var v = shipDestinationTypeRule_(f.type, f.isFactory);
  return v.ok ? null : no('ROUTE_' + v.code, v.type);
}
// Shipping coverage is independent of the frozen four-market forecast/inventory planning set.
// EU membership: https://eur-lex.europa.eu/EN/legal-content/glossary/member-states.html
function csdShipmentDestinationCountryOk_(warehouseCountry, shipmentCountry) {
var wc = String(warehouseCountry || '').trim().toUpperCase(), rc = String(shipmentCountry || '').trim().toUpperCase();
if (!wc || !rc) return false;
if (wc === rc) return true;
if (rc === 'EU') return 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ').indexOf(wc) !== -1;
var set = csdPlanningSet15e_(rc);
return !!(set && set.indexOf(wc) !== -1);
}
function csdRouteDestination16_(ss, sc) {
var wid = String(sc('destination_warehouse_id') || sc('warehouse_id') || '').trim();
if (!wid) return { ok: false, error: 'ROUTE_DESTINATION_WAREHOUSE_REQUIRED' };
var sh = ss.getSheetByName('warehouses');
if (!sh) return { ok: false, error: 'ROUTE_WAREHOUSES_MISSING' };
var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (v) { return String(v).trim().toLowerCase(); });
var ic = h.indexOf('warehouse_id'), cc = h.indexOf('country'), rc = h.indexOf('logistics_region');
if (ic === -1 || cc === -1) return { ok: false, error: 'ROUTE_WAREHOUSE_HEADERS_MISSING' };
var hits = d.slice(1).filter(function (r) { return String(r[ic] || '').trim() === wid; });
if (hits.length !== 1) return { ok: false, error: 'ROUTE_DESTINATION_WAREHOUSE_NOT_UNIQUE' };
var r = hits[0], country = String(r[cc] || '').trim().toUpperCase();
if (!csdShipmentDestinationCountryOk_(country, sc('country'))) return { ok: false, error: 'ROUTE_DESTINATION_COUNTRY_MISMATCH' };
var wc = h.indexOf('warehouse_code'), savedCode = String(sc('warehouse_code') || '').trim();
if (savedCode && (wc === -1 || savedCode.toUpperCase() !== String(r[wc] || '').trim().toUpperCase())) return { ok: false, error: 'ROUTE_DESTINATION_CODE_MISMATCH' };
return { ok: true, warehouseId: wid, region: rc === -1 ? '' : String(r[rc] || '').trim().toUpperCase(), country: country };   // R15C-EU: the warehouse's authoritative country
}

// A-delta2 R: the source warehouse's master country (ONE warehouses row, a legal 2-letter code) or '' when unknown. Read only.
function csdSourceCountry_(ss, sc) {
var sid = String(sc('source_warehouse_id') || '').trim(); if (!sid) return '';
var sh = ss.getSheetByName('warehouses'); if (!sh) return '';
var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (v) { return String(v).trim().toLowerCase(); }), ic = h.indexOf('warehouse_id'), cc = h.indexOf('country');
if (ic === -1 || cc === -1) return '';
var hits = d.slice(1).filter(function (r) { return String(r[ic] || '').trim() === sid; });
var c0 = hits.length === 1 ? String(hits[0][cc] || '').trim().toUpperCase() : '';
return /^[A-Z]{2}$/.test(c0) ? c0 : '';
}
function csdResolveTemplate_(ss, sc, overrideId, opts) {   // AD3 A: opts.skipOrigin = 87_ ROUTE_INIT diagnostic pass only (its D1 rule names the origin reason); Confirm never passes it
var sh = ss.getSheetByName('shipment_route_templates');
if (!sh) return { ok: false, code: 'ROUTE_TEMPLATE_NOT_FOUND', error: 'shipment_route_templates sheet not found - cannot resolve a route.' };
var d = sh.getDataRange().getValues(); if (d.length < 2) return { ok: false, code: 'ROUTE_TEMPLATE_NOT_FOUND', error: 'No route templates exist to resolve.' };
var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
function c(n) { return h.indexOf(n); }
function val(r, col) { return col === -1 ? '' : String(r[col] == null ? '' : r[col]).trim(); }
var idc = c('route_template_id'), dcc = c('destination_country'), carc = c('carrier_id'), tt = c('transit_type'), lm = c('last_mile_delivery'), act = c('is_active');
if (idc === -1 || dcc === -1 || carc === -1 || tt === -1 || lm === -1 || act === -1) return { ok: false, code: 'ROUTE_TEMPLATE_HEADERS_MISSING', error: 'ROUTE_TEMPLATE_HEADERS_MISSING' };
var rows = d.slice(1).filter(function (r) { return !!val(r, idc); });
var setDest15e = csdPlanningSet15e_(String(sc('country') || '').trim()) ? (function () { try { return csdRouteDestination16_(ss, sc); } catch (e) { return { ok: false, error: 'ROUTE_DESTINATION_READ_FAILED' }; } })() : null;   // R15C-EU
if (setDest15e && !setDest15e.ok) return { ok: false, code: setDest15e.error, error: setDest15e.error };
var setCode15e = setDest15e ? String(sc('country') || '').trim().toUpperCase() : '';
var destCountry = setDest15e ? setDest15e.country : String(sc('country') || '').trim(), carrier = String(sc('carrier_id') || '').trim(), method = String(sc('shipping_method') || '').trim().toLowerCase(), lastMile = String(sc('last_mile_delivery') || '').trim().toLowerCase();
// AD3 A (Owner 8): no carrier = no template (a blank carrier never matches every carrier's templates); the carrier-to-be-assigned shipment may only take
// the explicit manual fallback (ROUTE_CARRIER_TO_BE_ASSIGNED is manual-eligible; Confirm reaches it only with the saved marker)
if (!carrier) return { ok: false, code: 'ROUTE_CARRIER_TO_BE_ASSIGNED', error: 'ROUTE_CARRIER_TO_BE_ASSIGNED: the shipment has no carrier - no route template is chosen for it.' };
var cand = rows.filter(function (r) {
if (val(r, act) && !csdTruthy_(r[act])) return false;
if (destCountry && val(r, dcc).toUpperCase() !== destCountry.toUpperCase() && !(setCode15e && val(r, dcc).toUpperCase() === setCode15e)) return false;   // R15C-EU
if (carrier && val(r, carc) && val(r, carc).toUpperCase() !== carrier.toUpperCase()) return false;
return true;
});
// AD3 A (Owner rule 5, 2026-11-21): ORIGIN FIRST. When the shipment names a source warehouse, a template is a candidate only when its
// origin_country equals that warehouse's master country (ONE warehouses row, a legal 2-letter code - csdSourceCountry_); a blank template origin
// never fits. So a domestic shipment (source country = destination country) only meets domestic templates and a CN-source shipment never meets a
// domestic one. Source named but its country unproven -> ROUTE_SOURCE_COUNTRY_UNKNOWN. A blank source keeps the previous rule (Confirm refuses it
// later with SHIPMENT_SOURCE_WAREHOUSE_MISSING; the region fallback below keeps its own AD2 origin rule). A templates sheet WITHOUT an
// origin_country column (legacy / synthetic worlds) keeps the previous rule too; the real master has the column.
var oc3_ = c('origin_country'), sid3_ = String(sc('source_warehouse_id') || '').trim();
if (sid3_ && oc3_ !== -1 && cand.length && !(opts && opts.skipOrigin)) {
  var src3_ = csdSourceCountry_(ss, sc);
  if (!src3_) return { ok: false, code: 'ROUTE_SOURCE_COUNTRY_UNKNOWN', error: 'ROUTE_SOURCE_COUNTRY_UNKNOWN: the source warehouse ' + sid3_ + ' is not ONE warehouses row with a legal 2-letter country - no template origin can be proven.' };
  cand = cand.filter(function (r) { return val(r, oc3_).toUpperCase() === src3_; });
}
if (method) {
var n2 = cand.filter(function (r) { return val(r, tt).toLowerCase() === method; });
cand = n2.length ? n2 : cand.filter(function (r) { return val(r, tt) === ''; });
}
// A-delta2 R (Owner rule 2): last mile is a STRICT match once the shipment has one - a template declaring a different last mile is never used
// (was: narrowed only when 2+ candidates and an exact one existed, so a lone wrong-last-mile template routed). Exact wins over a blank (any) one.
// Runs after the method filter so a blank-last-mile template of the right method is not lost to an exact-last-mile one of the wrong method.
if (lastMile) { cand = cand.filter(function (r) { return !val(r, lm) || val(r, lm).toLowerCase() === lastMile; }); var n1 = cand.filter(function (r) { return val(r, lm).toLowerCase() === lastMile; }); if (n1.length) cand = n1; }
if (setCode15e) { var own15e = cand.filter(function (r) { return val(r, dcc).toUpperCase() === String(destCountry).toUpperCase(); }); if (own15e.length) cand = own15e; }   // R15C-EU: after carrier / method, the member country's own templates win over a set-wide one
// Regional identity comes only from the saved destination warehouse, never a caller's region or a ZIP guess.
var dr = c('destination_region'), dw = c('destination_warehouse_id');
var scoped = cand.some(function (r) { return !!(val(r, dr) || val(r, dw)); });
if (scoped) {
var dest;
try { dest = csdRouteDestination16_(ss, sc); }
catch (e) { return { ok: false, code: 'ROUTE_DESTINATION_READ_FAILED', error: 'ROUTE_DESTINATION_READ_FAILED' }; }
if (!dest.ok) return { ok: false, code: dest.error, error: dest.error };
// A-delta2 R (Owner rule 3): a blank warehouse region drops the regional templates and keeps exact-warehouse / country-wide ones; it refuses
// (REGION_REQUIRED) only when no non-regional template applies (was: refused whenever any regional template existed).
if (!dest.region && cand.some(function (r) { return !!val(r, dr); })) {
  var nonReg = cand.filter(function (r) { return !val(r, dr) && (!val(r, dw) || val(r, dw) === dest.warehouseId) && !!val(r, carc) && !!val(r, tt); });   // r3b (REVIEW_AD2 F7): no blank carrier / transit wildcard in the fallback
  // this fallback never borrows a template of ANOTHER origin: a declared origin_country must equal the source warehouse's master country when that
  // country is known (e.g. a domestic 3PL -> FBA transfer is not given a CN international template here; b3 refused these with REGION_REQUIRED).
  // r3 (REVIEW_AD2 F1): an UNPROVEN source country (blank id, duplicate warehouses row, blank / non-2-letter code) keeps only origin-blank
  // templates; none left -> ROUTE_SOURCE_COUNTRY_UNKNOWN (zero write at Confirm). Fallback branch only; every other path is b3.
  if (!nonReg.length) return { ok: false, code: 'ROUTE_DESTINATION_REGION_REQUIRED', error: 'ROUTE_DESTINATION_REGION_REQUIRED: check warehouses.logistics_region for the saved destination.' };
  var srcC = csdSourceCountry_(ss, sc), oc = c('origin_country');
  if (oc !== -1) nonReg = nonReg.filter(function (r) { return !val(r, oc) || (!!srcC && val(r, oc).toUpperCase() === srcC); });
  if (!nonReg.length) return srcC ? { ok: false, code: 'ROUTE_DESTINATION_REGION_REQUIRED', error: 'ROUTE_DESTINATION_REGION_REQUIRED: check warehouses.logistics_region for the saved destination.' }
    : { ok: false, code: 'ROUTE_SOURCE_COUNTRY_UNKNOWN', error: 'ROUTE_SOURCE_COUNTRY_UNKNOWN: the saved destination has no logistics_region and the source warehouse\'s country (warehouses.country of source_warehouse_id) is not ONE legal 2-letter code - no country-wide template of a declared origin is used.' };
  cand = nonReg;
}
// R15d r2 (review REVIEW_R16_ROUTE m-2): a region no route template of this destination country declares is a data error - refused, never routed
// through the nationwide template. A declared region without a template for THIS carrier / method still falls back to the nationwide one.
if (dest.region && cand.some(function (r) { return !!val(r, dr); })) { var known16 = {}; rows.forEach(function (r) { if (val(r, dr) && (!destCountry || val(r, dcc).toUpperCase() === destCountry.toUpperCase())) known16[val(r, dr).toUpperCase()] = 1; });
  if (!known16[dest.region]) return { ok: false, code: 'ROUTE_DESTINATION_REGION_UNKNOWN', error: 'ROUTE_DESTINATION_REGION_UNKNOWN: warehouses.logistics_region of the saved destination is not a region any route template of this country declares.' }; }
cand = cand.filter(function (r) {
return (!val(r, dw) || val(r, dw) === dest.warehouseId) && (!val(r, dr) || val(r, dr).toUpperCase() === dest.region);
});
// Exact warehouse, then exact region, then an explicitly country-wide template. Ties still refuse.
var rank = -1;
cand.forEach(function (r) { rank = Math.max(rank, val(r, dw) ? 2 : val(r, dr) ? 1 : 0); });
cand = cand.filter(function (r) { return (val(r, dw) ? 2 : val(r, dr) ? 1 : 0) === rank; });
}
if (overrideId) {
var selected = cand.filter(function (r) { return val(r, idc) === overrideId; });
if (selected.length !== 1) return { ok: false, code: 'ROUTE_TEMPLATE_OVERRIDE_NOT_APPLICABLE_OR_NOT_UNIQUE', error: 'ROUTE_TEMPLATE_OVERRIDE_NOT_APPLICABLE_OR_NOT_UNIQUE' };
cand = selected;
}
if (!cand.length) return { ok: false, code: 'ROUTE_TEMPLATE_NOT_FOUND', error: 'No active route template matches the saved destination, carrier and method.' };
if (cand.length > 1) return { ok: false, code: 'ROUTE_TEMPLATE_AMBIGUOUS', error: 'Multiple route templates match (' + cand.length + ') - please specify route_template_id.' };
return { ok: true, templateId: val(cand[0], idc), warnings: [] };
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
logisticsLocationId: c('logistics_location_id') === -1 ? '' : String(d[i][c('logistics_location_id')] || '').trim(),
isDestinationPlaceholder: c('is_destination_placeholder') === -1 ? false : csdTruthy_(d[i][c('is_destination_placeholder')]),   // A-delta2 R (Owner rule 4)
tplRefType: c('location_ref_type') === -1 ? '' : String(d[i][c('location_ref_type')] || '').trim(), tplRefId: c('location_ref_id') === -1 ? '' : String(d[i][c('location_ref_id')] || '').trim()
});
}
out.sort(function (a, b) { return a.seq - b.seq; });
return out;
}
// A-delta2 R (Owner rule 4, 2026-11-21): the per-shipment binding of a template's destination placeholder in a NEW route snapshot. The shared
// template is never changed: a COPY of the nodes is returned. Binds only when exactly one node is flagged is_destination_placeholder, it is the
// single maximum sequence, it carries no reference of its own (logistics_location_id / location_ref_*), it is not a transit gateway, and the
// shipment's server-saved destination (destination_warehouse_id, fallback warehouse_id) is ONE warehouses row with at most ONE logistics_locations
// row. Then the terminal gets location_ref_type 'warehouse' + location_ref_id = that warehouse, name / country from the trusted row (logistics_locations
// row when it exists, else the warehouses row) and coordinates only when that row has valid ones (blank = Coordinate Pending). Otherwise the nodes
// are returned unchanged (previous behaviour) with the reason. Reads only.
function csdBindDestinationPlaceholder_(ss, sc, nodes) {
var out = (nodes || []).map(function (n) { var o = {}; for (var k in n) if (Object.prototype.hasOwnProperty.call(n, k)) o[k] = n[k]; return o; });
var res = { nodes: out, binding: { applied: false, reason: '', source: '' } };
function no(why) { res.binding.reason = why; return res; }
var ph = out.filter(function (n) { return n.isDestinationPlaceholder; });
if (!ph.length) return no('NO_PLACEHOLDER');
if (ph.length !== 1) return no('PLACEHOLDER_NOT_UNIQUE');
var t = ph[0], maxSeq = -Infinity, cnt = 0;
out.forEach(function (n) { if (n.seq > maxSeq) { maxSeq = n.seq; cnt = 1; } else if (n.seq === maxSeq) cnt++; });
if (cnt !== 1 || t.seq !== maxSeq || !(t.seq > 0)) return no('PLACEHOLDER_NOT_UNIQUE_TERMINAL');
if (t.logisticsLocationId || t.tplRefId) return no('PLACEHOLDER_HAS_OWN_REFERENCE');
if (typeof SHIP_ARRIVAL_GATEWAY_RE_ === 'undefined') return no('GATEWAY_RULE_UNAVAILABLE');
if (SHIP_ARRIVAL_GATEWAY_RE_.test(String(t.nodeType || '') + ' ' + String(t.nodeCode || '') + ' ' + String(t.plannedEventType || ''))) return no('PLACEHOLDER_IS_GATEWAY');
var wid = String(sc('destination_warehouse_id') || sc('warehouse_id') || '').trim();
if (!wid) return no('DESTINATION_WAREHOUSE_MISSING');
function rows(name) { var sh = ss.getSheetByName(name); if (!sh) return null; var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return String(x).trim().toLowerCase(); }), o = [];
  for (var i = 1; i < d.length; i++) { var r = {}; for (var j = 0; j < h.length; j++) if (h[j]) r[h[j]] = d[i][j]; o.push(r); } return { h: h, rows: o }; }
function s(v) { return String(v == null ? '' : v).trim(); }
var W = rows('warehouses'); if (!W || W.h.indexOf('warehouse_id') === -1) return no('WAREHOUSES_UNREADABLE');
var wh = W.rows.filter(function (r) { return s(r.warehouse_id) === wid; });
if (wh.length !== 1) return no(wh.length ? 'DESTINATION_WAREHOUSE_NOT_UNIQUE' : 'DESTINATION_WAREHOUSE_NOT_IN_MASTER');
var L = rows('logistics_locations'), locs = (L && L.h.indexOf('warehouse_id') !== -1) ? L.rows.filter(function (r) { return s(r.warehouse_id) === wid; }) : [];
if (locs.length > 1) return no('DESTINATION_LOCATION_NOT_UNIQUE');
var src = locs.length ? locs[0] : wh[0];
function num(v) { if (v === '' || v == null) return null; var x = typeof v === 'number' ? v : parseFloat(String(v).trim()); return isFinite(x) ? x : null; }
var la = num(src.latitude), lo = num(src.longitude), okC = la !== null && lo !== null && la >= -90 && la <= 90 && lo >= -180 && lo <= 180 && !(la === 0 && lo === 0);
t.locationRefType = 'warehouse'; t.locationRefId = wid;
t.locationName = s(locs.length ? src.location_name : src.warehouse_name) || s(wh[0].warehouse_name) || t.locationName;
t.country = s(src.country).toUpperCase() || s(wh[0].country).toUpperCase() || t.country;
if (locs.length) { if (s(src.region)) t.region = s(src.region); if (s(src.city)) t.city = s(src.city); }
t.latitude = okC ? la : ''; t.longitude = okC ? lo : '';
res.binding = { applied: true, reason: 'TEMPLATE_DESTINATION_PLACEHOLDER', source: locs.length ? 'logistics_locations:' + s(src.logistics_location_id) : 'warehouses:' + wid, node_id: t.nodeId, warehouse_id: wid, coordinates: okC ? 'MASTER' : 'PENDING' };
return res;
}
// ---- AD3 A (Owner rules 5 / 6, 2026-11-21): source pickup binding + the manual logistics snapshot. Reads only; the template is never changed. ----
var CSD_MANUAL_ROUTE_ID_ = 'MANUAL', CSD_MANUAL_NODE_ORIGIN_ = 'MANUAL:ORIGIN', CSD_MANUAL_NODE_DEST_ = 'MANUAL:DESTINATION';
// resolver codes for which no template applies (the explicit manual fallback may be offered); every other refusal keeps refusing
// Owner 8 / Author B v1.2 sec.11: the EXPLICIT "carrier to be assigned" marker = B's server-owned shipments.rate_card_version tba1|...|digest, validated
// ONLY by B's 12_ reader shipCarrierTbaState_(row) (bound to the shipment_id). sc = the row re-read under the caller's lock. B's reader absent (half
// sync) -> NOT to-be-assigned (fail closed). Note text / any other column is never read.
function csdCarrierToBeAssigned3_(sc) {
  if (String(sc('carrier_id') || '').trim()) return false;
  if (typeof shipCarrierTbaState_ !== 'function') return false;
  try { var t = shipCarrierTbaState_({ shipment_id: String(sc('shipment_id') || '').trim(), carrier_id: '', rate_card_version: sc('rate_card_version') }); return !!(t && t.to_be_assigned === true); } catch (e) { return false; }
}
// a legal carrier: ONE carriers row, active (is_active truthy / status active, or no such column). -> { ok, why }
function csdCarrierLegal3_(ss, id) {
  id = String(id == null ? '' : id).trim(); if (!id) return { ok: false, why: 'CARRIER_BLANK' };
  var sh = ss.getSheetByName('carriers'); if (!sh) return { ok: false, why: 'CARRIERS_UNREADABLE' };
  var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return String(x).trim().toLowerCase(); }), ic = h.indexOf('carrier_id'), ac = h.indexOf('is_active'), stc = h.indexOf('status');
  if (ic === -1) return { ok: false, why: 'CARRIERS_UNREADABLE' };
  var hits = d.slice(1).filter(function (r) { return String(r[ic] == null ? '' : r[ic]).trim() === id; });
  if (hits.length !== 1) return { ok: false, why: hits.length ? 'CARRIER_NOT_UNIQUE' : 'CARRIER_UNKNOWN' };
  var a = ac === -1 ? '' : String(hits[0][ac] == null ? '' : hits[0][ac]).trim(), st = stc === -1 ? '' : String(hits[0][stc] == null ? '' : hits[0][stc]).trim().toLowerCase();
  if ((a !== '' && !csdTruthy_(a)) || (st !== '' && st !== 'active')) return { ok: false, why: 'CARRIER_INACTIVE' };
  return { ok: true, why: '' };
}
// ---- AD3 A (Owner supplement 3): DOMESTIC lead-time ESTIMATE, read-only, never written (no ETA is set, a manual ETA / actual event is never touched,
// supply / DoS never read it). carrier_lead_times rows: is_active TRUE, same carrier / method / last mile, origin = destination = the shipment's proven
// domestic country, lead_time_basis warehouse_processing_start, calendar_type calendar_days. Regions = warehouses.logistics_region of the ACTUAL source
// and destination: both must be known (else UNDETERMINED - never a same-region default); equal -> the same-region row (exact region pair, else the
// country baseline row with blank regions); different -> the exact DIRECTED row only. Day 0 = warehouse processing start: the days are returned as they
// are (pickup / pallet time is never added again), no date is computed. -> { status: 'ESTIMATED' | 'UNDETERMINED', reason, days, lead_time_id, ... }
function csdDomesticLeadEstimate3_(ss, sc) {
  var out = function (st, why, x) { return Object.assign({ status: st, reason: why, basis: 'warehouse_processing_start', written: false }, x || {}); };
  var sid = String(sc('source_warehouse_id') || '').trim(), did = String(sc('destination_warehouse_id') || sc('warehouse_id') || '').trim();
  var car = String(sc('carrier_id') || '').trim(), m = String(sc('shipping_method') || '').trim().toLowerCase(), lm = String(sc('last_mile_delivery') || '').trim().toLowerCase();
  if (!car) return out('UNDETERMINED', 'CARRIER_TO_BE_ASSIGNED');
  if (!m || !lm) return out('UNDETERMINED', 'SERVICE_INCOMPLETE');
  function whRow(id) { var sh = ss.getSheetByName('warehouses'); if (!sh || !id) return null; var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return String(x).trim().toLowerCase(); }), ic = h.indexOf('warehouse_id');
    var hits = ic === -1 ? [] : d.slice(1).filter(function (r) { return String(r[ic] == null ? '' : r[ic]).trim() === id; }); if (hits.length !== 1) return null;
    var g = function (k) { var c = h.indexOf(k); return c === -1 ? '' : String(hits[0][c] == null ? '' : hits[0][c]).trim().toUpperCase(); }; return { country: g('country'), region: g('logistics_region') }; }
  var S = whRow(sid), D = whRow(did);
  if (!S || !D || !S.country || !D.country) return out('UNDETERMINED', 'WAREHOUSE_COUNTRY_UNPROVEN');
  if (S.country !== D.country) return out('UNDETERMINED', 'NOT_DOMESTIC');
  if (!S.region || !D.region) return out('UNDETERMINED', 'REGION_UNKNOWN', { missing_field: 'warehouses.logistics_region of ' + (!S.region ? sid : did) });
  var sh = ss.getSheetByName('carrier_lead_times'); if (!sh) return out('UNDETERMINED', 'NO_LEAD_TIME_TABLE');
  var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return String(x).trim().toLowerCase(); }), U = function (r, k) { var c = h.indexOf(k); return c === -1 ? '' : String(r[c] == null ? '' : r[c]).trim(); };
  var rows = d.slice(1).filter(function (r) { return U(r, 'lead_time_id') && (U(r, 'is_active') === '' || csdTruthy_(U(r, 'is_active'))) && U(r, 'carrier_id').toUpperCase() === car.toUpperCase() && U(r, 'shipping_method').toLowerCase() === m && U(r, 'last_mile_delivery').toLowerCase() === lm
    && U(r, 'origin_country').toUpperCase() === S.country && U(r, 'destination_country').toUpperCase() === D.country && U(r, 'lead_time_basis').toLowerCase() === 'warehouse_processing_start' && U(r, 'calendar_type').toLowerCase() === 'calendar_days'; });
  var pick;
  if (S.region === D.region) { pick = rows.filter(function (r) { return U(r, 'origin_region').toUpperCase() === S.region && U(r, 'destination_region').toUpperCase() === D.region; });
    if (!pick.length) pick = rows.filter(function (r) { return !U(r, 'origin_region') && !U(r, 'destination_region'); }); }
  else pick = rows.filter(function (r) { return U(r, 'origin_region').toUpperCase() === S.region && U(r, 'destination_region').toUpperCase() === D.region; });
  if (!pick.length) return out('UNDETERMINED', S.region === D.region ? 'NO_SAME_REGION_ROW' : 'NO_DIRECTED_ROW', { origin_region: S.region, destination_region: D.region });
  var vals = {}; pick.forEach(function (r) { vals[U(r, 'avg_days')] = 1; });
  var k = Object.keys(vals); if (k.length !== 1 || !(Number(k[0]) > 0)) return out('UNDETERMINED', k.length !== 1 ? 'LEAD_TIME_AMBIGUOUS' : 'LEAD_TIME_HAS_NO_AVG_DAYS', { rows: pick.length });
  return out('ESTIMATED', '', { days: Number(k[0]), lead_time_id: U(pick[0], 'lead_time_id'), calendar: 'calendar_days', origin_region: S.region, destination_region: D.region, rows: pick.length,
    note: 'Owner estimate: total calendar days from warehouse processing start (operations included); not added to any pickup / pallet time; no ETA is written.' });
}
var CSD_MANUAL_ELIGIBLE_ = { ROUTE_CARRIER_TO_BE_ASSIGNED: 1, ROUTE_TEMPLATE_TERMINAL_NOT_DESTINATION: 1, ROUTE_TEMPLATE_NOT_FOUND: 1, ROUTE_DESTINATION_REGION_REQUIRED: 1, ROUTE_DESTINATION_REGION_UNKNOWN: 1, ROUTE_SOURCE_COUNTRY_UNKNOWN: 1, ROUTE_TEMPLATE_NODES_INSUFFICIENT: 1 };
// ONE warehouses row -> its display facts: name / country from its ONE logistics_locations row (else the warehouses row), region / city only from
// that location row, coordinates only when that location row has valid ones (blank = Coordinate Pending). Two location rows: the warehouses row,
// no coordinate. -> { ok, why, warehouse_id, name, country, region, city, latitude, longitude, coordinates, source, locations }
function csdWarehouseFacts3_(ss, wid) {
  wid = String(wid == null ? '' : wid).trim(); if (!wid) return { ok: false, why: 'WAREHOUSE_ID_BLANK' };
  function s(v) { return String(v == null ? '' : v).trim(); }
  function rows(name) { var sh = ss.getSheetByName(name); if (!sh) return null; var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return String(x).trim().toLowerCase(); }), o = [];
    for (var i = 1; i < d.length; i++) { var r = {}; for (var j = 0; j < h.length; j++) if (h[j]) r[h[j]] = d[i][j]; o.push(r); } return { h: h, rows: o }; }
  var W = rows('warehouses'); if (!W || W.h.indexOf('warehouse_id') === -1) return { ok: false, why: 'WAREHOUSES_UNREADABLE' };
  var wh = W.rows.filter(function (r) { return s(r.warehouse_id) === wid; });
  if (wh.length !== 1) return { ok: false, why: wh.length ? 'WAREHOUSE_NOT_UNIQUE' : 'WAREHOUSE_NOT_IN_MASTER' };
  var L = rows('logistics_locations'), locs = (L && L.h.indexOf('warehouse_id') !== -1) ? L.rows.filter(function (r) { return s(r.warehouse_id) === wid; }) : [];
  var loc = locs.length === 1 ? locs[0] : null;
  function num(v) { if (v === '' || v == null) return null; var x = typeof v === 'number' ? v : parseFloat(String(v).trim()); return isFinite(x) ? x : null; }
  var la = loc ? num(loc.latitude) : null, lo = loc ? num(loc.longitude) : null, okC = la !== null && lo !== null && la >= -90 && la <= 90 && lo >= -180 && lo <= 180 && !(la === 0 && lo === 0);
  return { ok: true, warehouse_id: wid, name: (loc ? s(loc.location_name) : '') || s(wh[0].warehouse_name) || wid, country: (loc ? s(loc.country).toUpperCase() : '') || s(wh[0].country).toUpperCase(),
    region: loc ? s(loc.region) : '', city: loc ? s(loc.city) : '', latitude: okC ? la : '', longitude: okC ? lo : '', coordinates: okC ? 'MASTER' : 'PENDING',
    source: loc ? 'logistics_locations:' + s(loc.logistics_location_id) : 'warehouses:' + wid, locations: locs.length };
}
// The template has no source-placeholder column: the FIRST node is bound to the shipment's real source warehouse (per shipment, on a COPY) only
// when it is unambiguous: the single minimum positive sequence, node_type 'pickup' or node_code SOURCE_*, no reference or coordinate of its own,
// not a destination placeholder, not a transit gateway, its declared country (if any) = the source's master country, and the source is ONE
// warehouses row with at most ONE logistics_locations row. Otherwise the nodes are unchanged and the reason is returned.
function csdBindSourcePickup3_(ss, sc, nodes) {
  var out = (nodes || []).map(function (n) { var o = {}; for (var k in n) if (Object.prototype.hasOwnProperty.call(n, k)) o[k] = n[k]; return o; });
  var res = { nodes: out, binding: { applied: false, reason: '', source: '' } };
  function no(why) { res.binding.reason = why; return res; }
  if (!out.length) return no('NO_NODES');
  var t = null, minSeq = Infinity, cnt = 0;
  out.forEach(function (n) { if (n.seq < minSeq) { minSeq = n.seq; cnt = 1; t = n; } else if (n.seq === minSeq) cnt++; });
  if (cnt !== 1 || !(minSeq > 0)) return no('PICKUP_NOT_UNIQUE_FIRST');
  if (!/^pickup$/i.test(String(t.nodeType || '').trim()) && !/^SOURCE[_-]/i.test(String(t.nodeCode || '').trim())) return no('FIRST_NODE_NOT_PICKUP');
  if (t.isDestinationPlaceholder) return no('FIRST_NODE_IS_DESTINATION_PLACEHOLDER');
  if (t.logisticsLocationId || t.tplRefId || t.locationRefId) return no('PICKUP_HAS_OWN_REFERENCE');
  if (String(t.latitude == null ? '' : t.latitude).trim() !== '' || String(t.longitude == null ? '' : t.longitude).trim() !== '') return no('PICKUP_HAS_OWN_COORDINATES');
  if (typeof SHIP_ARRIVAL_GATEWAY_RE_ !== 'undefined' && SHIP_ARRIVAL_GATEWAY_RE_.test(String(t.nodeType || '') + ' ' + String(t.nodeCode || '') + ' ' + String(t.plannedEventType || ''))) return no('PICKUP_IS_GATEWAY');
  var sid = String(sc('source_warehouse_id') || '').trim(); if (!sid) return no('SOURCE_WAREHOUSE_MISSING');
  var f = csdWarehouseFacts3_(ss, sid); if (!f.ok) return no('SOURCE_' + f.why);
  // domestic shipments only (source and destination master countries equal): an international template's pickup (e.g. "Shenzhen Pickup") keeps the c2 snapshot
  var did3 = String(sc('destination_warehouse_id') || sc('warehouse_id') || '').trim(), fd3 = did3 ? csdWarehouseFacts3_(ss, did3) : { ok: false };
  if (!fd3.ok || !f.country || fd3.country !== f.country) return no('NOT_DOMESTIC');
  if (f.locations > 1) return no('SOURCE_LOCATION_NOT_UNIQUE');
  if (String(t.country || '').trim() && f.country && String(t.country).trim().toUpperCase() !== f.country) return no('PICKUP_COUNTRY_CONTRADICTS_SOURCE');
  t.locationRefType = 'warehouse'; t.locationRefId = sid; t.locationName = f.name; t.country = f.country || t.country;
  if (f.region) t.region = f.region; if (f.city) t.city = f.city; t.latitude = f.latitude; t.longitude = f.longitude;
  res.binding = { applied: true, reason: 'TEMPLATE_SOURCE_PICKUP', source: f.source, node_id: t.nodeId, warehouse_id: sid, coordinates: f.coordinates };
  return res;
}
// DOMESTIC terminal rule (Author C coordination: 3PL -> 3PL / 3PL -> FBA / WFS are domestic): when the source and destination warehouses are in the SAME
// country (both master-proven), the snapshot's terminal (single max sequence, after the per-shipment bindings) must be bound to the saved destination:
// location_ref_type warehouse = destination, or a logistics_locations row whose warehouse_id = destination. A fixed terminal of another warehouse (e.g.
// an FBA node) or an unbound terminal makes the template NOT applicable (ROUTE_TEMPLATE_TERMINAL_NOT_DESTINATION - manual fallback offered).
// International shipments keep the previous rule. -> { ok, domestic, why }
function csdDomesticTerminalCheck3_(ss, sc, nodes) {
  var srcC = csdSourceCountry_(ss, sc), did = String(sc('destination_warehouse_id') || sc('warehouse_id') || '').trim(), fd = did ? csdWarehouseFacts3_(ss, did) : { ok: false };
  if (!srcC || !fd.ok || !fd.country || srcC !== fd.country) return { ok: true, domestic: false, why: '' };
  var t = null, maxSeq = -Infinity, cnt = 0; (nodes || []).forEach(function (n) { if (n.seq > maxSeq) { maxSeq = n.seq; cnt = 1; t = n; } else if (n.seq === maxSeq) cnt++; });
  if (!t || cnt !== 1) return { ok: false, domestic: true, why: 'TERMINAL_NOT_UNIQUE' };
  var tp = String(t.locationRefType || '').trim().toLowerCase(), ref = String(t.locationRefId || '').trim(), lid = String(t.logisticsLocationId || '').trim();
  if (tp === 'warehouse' && ref) return ref === did ? { ok: true, domestic: true, why: '' } : { ok: false, domestic: true, why: 'TERMINAL_IS_WAREHOUSE_' + ref };
  var locId = (tp === 'logistics_location' || !tp) && ref ? ref : lid;
  if (!locId) return { ok: false, domestic: true, why: 'TERMINAL_UNBOUND' };
  var sh = ss.getSheetByName('logistics_locations'), d = sh ? sh.getDataRange().getValues() : [], h = (d[0] || []).map(function (x) { return String(x).trim().toLowerCase(); }), ic = h.indexOf('logistics_location_id'), wc = h.indexOf('warehouse_id');
  var hits = ic === -1 ? [] : d.slice(1).filter(function (r) { return String(r[ic] == null ? '' : r[ic]).trim() === locId; });
  if (hits.length !== 1 || wc === -1) return { ok: false, domestic: true, why: 'TERMINAL_LOCATION_UNRESOLVED_' + locId };
  var w = String(hits[0][wc] == null ? '' : hits[0][wc]).trim();
  return w === did ? { ok: true, domestic: true, why: '' } : { ok: false, domestic: true, why: 'TERMINAL_IS_' + (w ? 'WAREHOUSE_' + w : 'LOCATION_' + locId) };
}
// The MANUAL logistics snapshot (no route template): exactly 2 nodes - origin bound to the shipment's real source warehouse, destination bound to
// the server-saved destination (destination_warehouse_id, fallback warehouse_id, which must pass the same destination check as the resolver:
// ONE warehouses row, its country = the shipment's, its code = the saved Warehouse Code). No intermediate node, no date, no coordinate that the
// master does not prove. -> { ok, nodes, templateId: 'MANUAL', info } | { ok: false, code, missing_field }
function csdManualRouteNodes3_(ss, sc) {
  var sid = String(sc('source_warehouse_id') || '').trim(), did = String(sc('destination_warehouse_id') || sc('warehouse_id') || '').trim();
  if (!sid) return { ok: false, code: 'ROUTE_MANUAL_SOURCE_UNRESOLVED', missing_field: 'shipments.source_warehouse_id' };
  var fs = csdWarehouseFacts3_(ss, sid);
  if (!fs.ok) return { ok: false, code: 'ROUTE_MANUAL_SOURCE_UNRESOLVED', missing_field: 'warehouses row ' + sid + ' (' + fs.why + ')' };
  if (!did) return { ok: false, code: 'ROUTE_MANUAL_DESTINATION_UNRESOLVED', missing_field: 'shipments.destination_warehouse_id' };
  var dc; try { dc = csdRouteDestination16_(ss, sc); } catch (e) { dc = { ok: false, error: 'ROUTE_DESTINATION_READ_FAILED' }; }
  if (!dc.ok) return { ok: false, code: 'ROUTE_MANUAL_DESTINATION_UNRESOLVED', missing_field: dc.error + ' (' + did + ')' };
  if (did === sid) return { ok: false, code: 'ROUTE_MANUAL_SOURCE_EQUALS_DESTINATION', missing_field: 'shipments.source_warehouse_id = destination ' + did };
  var fd = csdWarehouseFacts3_(ss, did);
  if (!fd.ok) return { ok: false, code: 'ROUTE_MANUAL_DESTINATION_UNRESOLVED', missing_field: 'warehouses row ' + did + ' (' + fd.why + ')' };
  function mk(seq, id, type, code, ev, f) { return { nodeId: id, seq: seq, nodeType: type, nodeCode: code, country: f.country, region: f.region, city: f.city, latitude: f.latitude, longitude: f.longitude, locationName: f.name,
    plannedEventType: ev, offsetDays: '', transportMode: '', logisticsLocationId: '', isDestinationPlaceholder: false, tplRefType: '', tplRefId: '', locationRefType: 'warehouse', locationRefId: f.warehouse_id }; }
  return { ok: true, templateId: CSD_MANUAL_ROUTE_ID_, nodes: [mk(1, CSD_MANUAL_NODE_ORIGIN_, 'origin', 'MANUAL_ORIGIN', 'departed', fs), mk(2, CSD_MANUAL_NODE_DEST_, 'destination', 'MANUAL_DESTINATION', 'delivered', fd)],
    info: { origin_warehouse_id: sid, destination_warehouse_id: did, coordinates: { origin: fs.coordinates, destination: fd.coordinates }, origin_source: fs.source, destination_source: fd.source } };
}














function csdDeclaredSourceSupply_(domain, sheets, warehouseId, sku, shipmentId) {
var wid = String(warehouseId == null ? '' : warehouseId).trim();
var s = String(sku == null ? '' : sku).trim();
if (domain === 'OVERSEAS') {
if (!sheets || !sheets.movSheet || typeof ovsOwnerReservedTx_ !== 'function') {
return { qty: 0, basis: 'overseas reservation unreadable;' };
}
var held = ovsOwnerReservedTx_(sheets.movSheet, OVSTX_RESERVATION_OWNER_TYPE_, shipmentId) || {};
return { qty: Math.max(0, Math.round(held[wid + '||' + s] || 0)),
basis: 'reserved for this shipment' };
}
if (!sheets || !sheets.stockSheet || typeof factoryStockReadBalanceTx_ !== 'function') {
return { qty: 0, basis: 'factory stock unreadable;' };
}
var b = factoryStockReadBalanceTx_(sheets.stockSheet, wid, s);
return { qty: Math.max(0, Math.round(Number(b && b.current) || 0)), basis: 'current stock' };
}







// R15F2-P1-22 (sbx-r15f2 step 27): patched
// R15F2-STAMPS (sbx-r15f2 step 23): patched

// R15C-EU-22 (sbx-r15c-eu): patched
// R15C-EU: the members of a planning set, from the ONE server definition (KMCID, generated 90_ bundle). null = not a set (or a bundle without it).
function csdPlanningSet15e_(code) { try { return (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.planningSetMembers === 'function') ? KMCID.planningSetMembers(code) : null; } catch (e) { return null; } }

// XCO-R15G H2: 22_ dispatch skips removed lines (sc13LineRemoved_, 12_).
// XCO-R15G-22 (xco-r15g-impl): patched

// XCO-R15G O-1 (22_): the row form of the shared predicate (note + line_status).
// XCO-R15G-22B-O1 (xco-r15g-impl): patched
// R15G-STAMPS (final candidate): patched
