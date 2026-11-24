
























var SHIPMENT_LINE_ALLOCATIONS_HEADERS_ = [
'shipment_line_allocation_id',
'shipment_line_id',
'purchase_order_line_id',
'sku',
'allocated_qty',
'shipped_qty',
'allocation_status',
'created_by', 'created_at', 'updated_at',
'released_by', 'released_at', 'release_reason',
'note'
];


var SLA_ELIGIBLE_PO_STATUS_ = { issued: 1, confirmed: 1, in_production: 1, ready_to_ship: 1, partial_completed: 1, completed: 1 };


function slaNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function slaStr_(v) { return String(v == null ? '' : v).trim(); }
function slaLc_(v) { return slaStr_(v).toLowerCase(); }



function slaFifoCompare_(a, b) {
var da = slaStr_(a.order_date), db = slaStr_(b.order_date);
if (da !== db) return da < db ? -1 : 1;
var pa = slaStr_(a.po_no), pb = slaStr_(b.po_no);
if (pa !== pb) return pa < pb ? -1 : 1;
var la = slaStr_(a.purchase_order_line_id), lb = slaStr_(b.purchase_order_line_id);
return la < lb ? -1 : (la > lb ? 1 : 0);
}



function slaIsEligible_(poLine, scope) {
if (slaLc_(poLine.sku) !== slaLc_(scope.sku)) return false;
// SANDBOX-GATE-1c (Owner rule): factory stock serves any company - the PO line keeps its own company, the shipment keeps its; no company predicate here
// (SKU + factory + status + order_date still gate, the quantity / opening hold / FIFO / Confirm re-validation are unchanged; no cross-company settlement).
if (slaLc_(poLine.factory_id) !== slaLc_(scope.factory_id)) return false;
if (!SLA_ELIGIBLE_PO_STATUS_[slaLc_(poLine.order_status)]) return false;
if (slaStr_(poLine.order_date) === '') return false;
return true;
}



function slaReservedByOthers_(existingAllocations, selfShipmentLineId) {
var m = {};
(existingAllocations || []).forEach(function (a) {
var st = slaLc_(a.allocation_status);


if (st !== 'draft') return;
if (slaStr_(a.shipment_line_id) === slaStr_(selfShipmentLineId)) return;
var k = slaStr_(a.purchase_order_line_id);
m[k] = (m[k] || 0) + slaNum_(a.allocated_qty);
});
return m;
}



function slaOpeningHold_(poLine) {
var oc = slaNum_(poLine && poLine.opening_completed_qty);
if (oc <= 0 || slaStr_(poLine.opening_reconcile_status).toUpperCase() === 'RECONCILED') return 0;
return Math.max(0, oc - slaNum_(poLine.opening_lineage_qty));
}
function slaAvailability_(poLine, reservedByOthers) {
return Math.max(0, slaNum_(poLine.completed_qty) - slaNum_(poLine.shipped_qty) - slaNum_(reservedByOthers) - slaOpeningHold_(poLine));
}

// Historical consumption is not an executed shipment. Only a committed StockPO import's CREATED audit proves this baseline.
function slaFactoryImportConsumed_(ss, lineId, cache) {
var C = cache || {}, S = slaStr_;
function rows(name) {
  if (C[name]) return C[name];
  var sh = ss.getSheetByName(name); if (!sh) return [];
  var v = sh.getDataRange().getValues(), h = (v[0] || []).map(S);
  return (C[name] = v.slice(1).map(function (a) { var r = {}; h.forEach(function (k, i) { r[k] = a[i]; }); return r; }));
}
var ls = rows('purchase_order_lines').filter(function (l) { return S(l.purchase_order_line_id) === lineId; });
if (ls.length !== 1) return { ok: false, error: 'PO_LINE_NOT_UNIQUE' };
var l = ls[0], raw = S(l.opening_shipped_qty);
if (!raw || raw === '0') return { ok: true, qty: 0 };
var hs = rows('purchase_orders').filter(function (h) { return S(h.purchase_order_id) === S(l.purchase_order_id); });
if (hs.length !== 1 || S(hs[0].source_type) !== 'po_factory_import') return { ok: true, qty: 0 };
var bad = { ok: false, error: 'PO_FACTORY_IMPORT_CONSUMED_UNPROVEN' }, n = Number(raw), batch = S(l.import_batch_id);
if (!/^\d+$/.test(raw) || n <= 0 || n > 9007199254740991 || S(hs[0].import_batch_id) !== batch || S(hs[0].company) !== S(l.company) || S(hs[0].warehouse_id) !== S(l.supplier_warehouse_id) || S(l.opening_lineage_qty) !== '0' || S(l.opening_reconcile_status) !== 'RECONCILED') return bad;
var receipts = rows('import_batches').filter(function (r) { return S(r.import_batch_id) === batch; });
if (receipts.length !== 1 || S(receipts[0].domain) !== 'po_factory_stock' || S(receipts[0].mode) !== 'NEW_RECEIPT' || S(receipts[0].status) !== 'COMMITTED') return bad;
if (!C.auditByLine) {
  C.auditByLine = {};
  rows('import_batch_changes').forEach(function (r) { if (S(r.domain) !== 'po_factory_stock' || S(r.entity_table) !== 'purchase_order_lines' || S(r.result) !== 'CREATED') return;
    var k = S(r.import_batch_id) + '|' + S(r.line_id); (C.auditByLine[k] = C.auditByLine[k] || []).push(r); });
}
var audit = C.auditByLine[batch + '|' + lineId] || [];
function value(field) { var a = audit.filter(function (r) { return S(r.field) === field && S(r.entity_id) === S(l.purchase_order_id); }); return a.length === 1 ? S(a[0].after_value) : null; }
var completed = Number(value('completed_qty')), remaining = Number(value('remaining_qty'));
var expected = { purchase_order_id: l.purchase_order_id, purchase_order_line_id: lineId, company: l.company, sku: l.sku,
  supplier_warehouse_id: l.supplier_warehouse_id, ordered_qty: l.ordered_qty, import_batch_id: batch,
  shipped_qty: n, opening_shipped_qty: n, opening_completed_qty: l.opening_completed_qty, opening_lineage_qty: 0, opening_reconcile_status: 'RECONCILED' };
if (Object.keys(expected).some(function (k) { return value(k) !== S(expected[k]); }) || !isFinite(completed) || !isFinite(remaining) || completed - n !== remaining || completed !== Number(l.opening_completed_qty) || Number(l.shipped_qty) < n) return bad;
return { ok: true, qty: n };
}



function slaAllocateShipmentLine_(scope, poLinesJoined, existingAllocations) {
var need = slaNum_(scope.shipment_qty);
var reserved = slaReservedByOthers_(existingAllocations, scope.shipment_line_id);
var eligible = (poLinesJoined || [])
.filter(function (p) { return slaIsEligible_(p, scope); })
.map(function (p) { return { po: p, avail: slaAvailability_(p, reserved[slaStr_(p.purchase_order_line_id)] || 0) }; })
.filter(function (e) { return e.avail > 0; });
eligible.sort(function (a, b) { return slaFifoCompare_(a.po, b.po); });
var totalAvail = eligible.reduce(function (s, e) { return s + e.avail; }, 0);

var allocations = [], remaining = need, rank = 0;
for (var i = 0; i < eligible.length && remaining > 0; i++) {
var take = Math.min(remaining, eligible[i].avail);
if (take <= 0) continue;
rank++;
allocations.push({
purchase_order_id: slaStr_(eligible[i].po.purchase_order_id),
purchase_order_line_id: slaStr_(eligible[i].po.purchase_order_line_id),
allocated_qty: take, fifo_rank: rank
});
remaining -= take;
}
if (remaining > 0) {
return { ok: false, error: 'PO_CAPACITY_INSUFFICIENT', shipment_line_id: slaStr_(scope.shipment_line_id),
sku: slaStr_(scope.sku), company: slaStr_(scope.company), factory_id: slaStr_(scope.factory_id),
shipment_qty: need, available_capacity: totalAvail, shortage_qty: need - totalAvail,
eligible_po_lines: eligible.map(function (e) { return { purchase_order_line_id: slaStr_(e.po.purchase_order_line_id), available: e.avail }; }) };
}
return { ok: true, shipment_line_id: slaStr_(scope.shipment_line_id), allocations: allocations,
allocated_total: allocations.reduce(function (s, a) { return s + a.allocated_qty; }, 0) };
}




function slaBuildPlan_(scopes, poLinesJoined, existingAllocations) {
var acc = (existingAllocations || []).slice();
var results = [];
for (var i = 0; i < scopes.length; i++) {
var r = slaAllocateShipmentLine_(scopes[i], poLinesJoined, acc);
if (!r.ok) return { ok: false, failure: r, results: results };
results.push(r);

r.allocations.forEach(function (a) {
acc.push({ shipment_line_id: r.shipment_line_id, purchase_order_line_id: a.purchase_order_line_id,
allocated_qty: a.allocated_qty, allocation_status: 'draft' });
});
}
return { ok: true, results: results };
}







function slaResolveShipmentFactory_(ss, sourceWarehouseId) {

var r = procurementResolveWarehouse_(ss, sourceWarehouseId, '', 'new');
return r.ok ? r.warehouse_id : null;
}



function slaLoadPoLinesJoined_(ss) {
var poSheet = ss.getSheetByName('purchase_orders');
var polSheet = ss.getSheetByName('purchase_order_lines');
if (!poSheet || !polSheet) return [];
var pd = poSheet.getDataRange().getValues(); if (pd.length < 2) return [];
var ph = pd[0].map(function (x) { return slaStr_(x); });
var pById = {};
var cId = ph.indexOf('purchase_order_id'), cNo = ph.indexOf('po_no'), cFac = ph.indexOf('factory_id'), cWh = ph.indexOf('warehouse_id'), fm = procurementFactoryMap_(ss),
cCo = ph.indexOf('company'), cDate = ph.indexOf('order_date'), cStat = ph.indexOf('order_status');
for (var i = 1; i < pd.length; i++) {
var id = slaStr_(pd[i][cId]); if (!id) continue;
var rw = procurementResolveWarehouseIn_(fm, cWh !== -1 ? pd[i][cWh] : '', cFac !== -1 ? pd[i][cFac] : '', 'history');
pById[id] = { po_no: cNo !== -1 ? slaStr_(pd[i][cNo]) : '', factory_id: rw.ok ? rw.warehouse_id : '',
company: cCo !== -1 ? slaStr_(pd[i][cCo]) : '', order_date: cDate !== -1 ? slaStr_(pd[i][cDate]) : '',
order_status: cStat !== -1 ? slaStr_(pd[i][cStat]) : '' };
}
var ld = polSheet.getDataRange().getValues(); if (ld.length < 2) return [];
var lh = ld[0].map(function (x) { return slaStr_(x); });
function lc(n) { return lh.indexOf(n); }
var out = [];
for (var j = 1; j < ld.length; j++) {
var poId = lc('purchase_order_id') !== -1 ? slaStr_(ld[j][lc('purchase_order_id')]) : '';
var hdr = pById[poId] || { po_no: '', factory_id: '', company: '', order_date: '', order_status: '' };
out.push({
purchase_order_line_id: lc('purchase_order_line_id') !== -1 ? slaStr_(ld[j][lc('purchase_order_line_id')]) : '',
purchase_order_id: poId,
po_no: hdr.po_no, order_date: hdr.order_date, order_status: hdr.order_status,
sku: lc('sku') !== -1 ? slaStr_(ld[j][lc('sku')]) : '',
company: lc('company') !== -1 && slaStr_(ld[j][lc('company')]) ? slaStr_(ld[j][lc('company')]) : hdr.company,
factory_id: hdr.factory_id,
completed_qty: lc('completed_qty') !== -1 ? slaNum_(ld[j][lc('completed_qty')]) : 0,
shipped_qty: lc('shipped_qty') !== -1 ? slaNum_(ld[j][lc('shipped_qty')]) : 0,

opening_completed_qty: lc('opening_completed_qty') !== -1 ? slaNum_(ld[j][lc('opening_completed_qty')]) : 0,
opening_shipped_qty: lc('opening_shipped_qty') !== -1 ? slaStr_(ld[j][lc('opening_shipped_qty')]) : '',
opening_lineage_qty: lc('opening_lineage_qty') !== -1 ? slaNum_(ld[j][lc('opening_lineage_qty')]) : 0,
opening_reconcile_status: lc('opening_reconcile_status') !== -1 ? slaStr_(ld[j][lc('opening_reconcile_status')]) : ''
});
}
return out;
}

function slaReadObjects_(sheet) {
var d = sheet.getDataRange().getValues(); if (d.length < 2) return [];
var h = d[0].map(function (x) { return slaStr_(x); });
var out = [];
for (var i = 1; i < d.length; i++) { var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = d[i][c]; out.push(o); }
return out;
}







function handleGenerateShipmentLineAllocations_(body) {
var shipmentId = slaStr_(body && body.shipment_id);
var actor = slaStr_(body && (body.actor || body.updated_by)) || 'system_user';
if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id', zero_write: true });

var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock', zero_write: true }); }
catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock', zero_write: true }); }
try {
var ss = SpreadsheetApp.getActiveSpreadsheet();

var slaSheet = ss.getSheetByName('shipment_line_allocations');
if (!slaSheet) return jsonResponse_({ success: false, error: 'SHIPMENT_LINE_ALLOCATIONS_SCHEMA_MISSING', stage: 'schema', zero_write: true });

var shipSheet = ss.getSheetByName('shipments'), lineSheet = ss.getSheetByName('shipment_lines');
if (!shipSheet || !lineSheet) return jsonResponse_({ success: false, error: 'shipments/shipment_lines sheet not found', stage: 'load', zero_write: true });

var shipments = slaReadObjects_(shipSheet);
var ship = null; for (var i = 0; i < shipments.length; i++) { if (slaStr_(shipments[i].shipment_id) === shipmentId) { ship = shipments[i]; break; } }
if (!ship) return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId, stage: 'load', zero_write: true });

sc13AssertReady_(ship);
var company = slaStr_(ship.company);
var factoryId = slaResolveShipmentFactory_(ss, ship.source_warehouse_id);
if (!company) return jsonResponse_({ success: false, error: 'SHIPMENT_COMPANY_AUTHORITY_GAP', stage: 'attribution', shipment_id: shipmentId, zero_write: true });
if (!factoryId) return jsonResponse_({ success: false, error: 'SHIPMENT_FACTORY_ATTRIBUTION_GAP', stage: 'attribution', shipment_id: shipmentId, source_warehouse_id: slaStr_(ship.source_warehouse_id), reason: procurementResolveWarehouse_(ss, ship.source_warehouse_id, '', 'new').reason, zero_write: true });

var lines = slaReadObjects_(lineSheet).filter(function (l) { return slaStr_(l.shipment_id) === shipmentId && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); });   // XCO-R15G H2
// R14-F1 (review M-1): allocations are generated only BEFORE dispatch. A second Confirm (another tab / origin / profile) on a dispatched
// shipment must not add draft allocations that consume PO capacity. Inside the lock, before the first write.
// R14-F1c (Owner correction 1): an unreadable status, or any evidence source absent / missing a required column (12_ f1cEvidenceSchemaGap_),
// is NOT "no evidence": refused zero_write before anything is read as absent.
var f1cGap_; try { f1cGap_ = (typeof f1cEvidenceSchemaGap_ === 'function') ? f1cEvidenceSchemaGap_(ss) : ['f1cEvidenceSchemaGap_']; } catch (eF1c_) { f1cGap_ = ['EVIDENCE_SCHEMA_READ_FAILED']; }
if (!Object.prototype.hasOwnProperty.call(ship, 'status')) f1cGap_.push('shipments.status');
if (f1cGap_.length) return jsonResponse_({ success: false, error: 'SHIPMENT_DISPATCH_STATE_UNKNOWN', code: 'SHIPMENT_DISPATCH_STATE_UNKNOWN', stage: 'state', shipment_id: shipmentId, missing: f1cGap_.slice(0, 20), zero_write: true,
  message: 'A dispatch evidence source is absent or missing a required column; no PO allocation was prepared. Nothing was written.' });
var f1Pre_ = (typeof SHIPMENT_PRE_DISPATCH_STATUSES_ !== 'undefined' && SHIPMENT_PRE_DISPATCH_STATUSES_) || ['draft', 'ready_to_ship'], f1St_ = slaLc_(ship.status), f1Ids_ = {};
// SCF1 (2026-11-13, F3): a cancelled shipment never gets a PO allocation again (its draft would occupy PO capacity). Zero write.
if (f1St_ === 'cancelled') return jsonResponse_({ success: false, error: 'SHIPMENT_CANCELLED', code: 'SHIPMENT_CANCELLED', stage: 'state', shipment_id: shipmentId, status: f1St_, zero_write: true,
  message: 'This shipment is cancelled; no PO allocation is prepared for it. Nothing was written.' });
lines.forEach(function (l) { f1Ids_[slaStr_(l.shipment_line_id)] = 1; });
// JR2 (review J-m4): a cancel of THIS shipment that stopped part way (CANCEL_ROLLBACK_UNVERIFIED) leaves its drafts released (with or without the cancel reason) while
// the shipment is still pre-dispatch. No new PO allocation is prepared until that cancel is finished (Cancel again releases nothing twice). Zero write.
var jr2Half_ = slaReadObjects_(slaSheet).filter(function (a) { return f1Ids_[slaStr_(a.shipment_line_id)] && slaLc_(a.allocation_status) === 'released'; });   // JR2b (J-m4): any released row of a not-cancelled shipment (an interrupted undo may have restored release_reason but not the status)
// JR4 (review R3-m3): a cancel leaves a trace, else owner review (never "press Cancel"). JR5 (review R4 NOTE): the trace is bound to what 12_ F1
// writes (12_:1803, in this order: allocation_status, released_by, released_at, release_reason = 'shipment_draft_cancelled[:reason]', updated_at;
// its journal undo restores in reverse): a release_reason that starts with shipment_draft_cancelled, OR a blank release_reason with released_by /
// released_at present (a cancel or an undo stopped between those cells), OR this shipment's reservation_release movement. A hand-typed reason is no trace.
var jr4Trace_ = jr2Half_.some(function (a) { var rr = slaStr_(a.release_reason); return rr.indexOf('shipment_draft_cancelled') === 0 || (rr === '' && (slaStr_(a.released_by) !== '' || slaStr_(a.released_at) !== '')); });
if (jr2Half_.length && !jr4Trace_) { var jr4Mv_ = ss.getSheetByName('factory_stock_movements'); if (jr4Mv_) { var jr4V_ = jr4Mv_.getDataRange().getValues(), jr4H_ = (jr4V_[0] || []).map(function (x) { return slaLc_(x); }), jr4T_ = jr4H_.indexOf('movement_type'), jr4E_ = jr4H_.indexOf('related_entity_id');
  if (jr4T_ !== -1 && jr4E_ !== -1) for (var jr4R_ = 1; jr4R_ < jr4V_.length; jr4R_++) if (slaLc_(jr4V_[jr4R_][jr4T_]) === 'reservation_release' && slaStr_(jr4V_[jr4R_][jr4E_]) === shipmentId) { jr4Trace_ = true; break; } } }
if (jr2Half_.length && !jr4Trace_) return jsonResponse_({ success: false, error: 'SHIPMENT_ALLOCATION_STATE_INCONSISTENT', code: 'SHIPMENT_ALLOCATION_STATE_INCONSISTENT', stage: 'state', shipment_id: shipmentId, zero_write: true,
  released_allocations: jr2Half_.map(function (a) { return slaStr_(a.shipment_line_allocation_id); }).slice(0, 50),
  message: 'PO allocations of this shipment are marked released, but nothing shows that this shipment was ever cancelled (no release trace on the rows, no reservation release of this shipment). The system does not write that state. No new PO allocation was prepared and nothing was written. Do not cancel or re-allocate this shipment: ask the owner to review its allocation rows.' });
if (jr2Half_.length) return jsonResponse_({ success: false, error: 'SHIPMENT_CANCEL_INCOMPLETE', code: 'SHIPMENT_CANCEL_INCOMPLETE', stage: 'state', shipment_id: shipmentId, zero_write: true,
  released_allocations: jr2Half_.map(function (a) { return slaStr_(a.shipment_line_allocation_id); }).slice(0, 50),
  message: 'An earlier cancel of this shipment stopped part way: its PO allocations are already released. No new PO allocation was prepared. Press Cancel again to finish the cancel; it releases nothing twice. Nothing was written.' });
var f1Exec_ = slaReadObjects_(slaSheet).some(function (a) { return slaLc_(a.allocation_status) === 'executed' && f1Ids_[slaStr_(a.shipment_line_id)]; });
var f1Mov_ = null; try { f1Mov_ = (typeof csdMovementExists_ === 'function') ? !!csdMovementExists_(ss, shipmentId) : null; } catch (eF1_) { f1Mov_ = null; }
if (f1Mov_ === null) return jsonResponse_({ success: false, error: 'SHIPMENT_DISPATCH_STATE_UNKNOWN', code: 'SHIPMENT_DISPATCH_STATE_UNKNOWN', stage: 'state', shipment_id: shipmentId, zero_write: true });
if ((typeof csdIsDispatchedStatus_ === 'function' ? csdIsDispatchedStatus_(f1St_) : f1Pre_.indexOf(f1St_) < 0) || f1Exec_ || f1Mov_) return jsonResponse_({ success: false, error: 'SHIPMENT_NOT_PRE_DISPATCH', code: 'SHIPMENT_NOT_PRE_DISPATCH', stage: 'state', shipment_id: shipmentId, status: f1St_,
  evidence: { executed_allocation: f1Exec_, shipment_out: f1Mov_ }, zero_write: true, message: 'This shipment is not before dispatch; no PO allocation was prepared. Nothing was written.' });
var xcoM32_ = {}, scopes = lines.map(function (l) {
var sourceCompany = (typeof xcoLinkMemo_ === 'function' ? xcoLinkMemo_ : function (f) { return f(); })(function () { return sc13LinkForPlan_(ss, slaStr_(ship.shipping_plan_id)) ? sc13Source_(ss, l, ship).company : company; }, xcoM32_);   /* XCO-R15G MINOR-7 */
return { shipment_line_id: slaStr_(l.shipment_line_id), sku: slaStr_(l.sku), company: sourceCompany,
factory_id: factoryId, shipment_qty: slaNum_(l.shipment_qty) };
}).filter(function (s) { return s.shipment_line_id && s.sku && s.shipment_qty > 0; });
if (!scopes.length) return jsonResponse_({ success: false, error: 'Shipment has no allocatable lines', stage: 'load', zero_write: true });

var poLines = slaLoadPoLinesJoined_(ss);
var allAlloc = slaReadObjects_(slaSheet);

var selfLineIds = {}; scopes.forEach(function (s) { selfLineIds[s.shipment_line_id] = 1; });
var externalAlloc = allAlloc.filter(function (a) {
return !(slaLc_(a.allocation_status) === 'draft' && selfLineIds[slaStr_(a.shipment_line_id)]);
});

// SCF1 (2026-11-13, Owner rule 4): a draft of ANOTHER shipment occupies PO capacity unless it traces uniquely and completely to a validly
// cancelled shipment (a legacy orphan). An untraceable draft on a PO line this request could use is BLOCKED - never counted, never ignored.
var scfTr_ = slaDraftOccupancyTrace_(ss, externalAlloc, allAlloc, scopes, poLines);
if (scfTr_.blocked.length) return jsonResponse_({ success: false, error: 'PO_OCCUPANCY_TRACE_BLOCKED', code: 'PO_OCCUPANCY_TRACE_BLOCKED', stage: 'occupancy', shipment_id: shipmentId, zero_write: true,
  detail: { blocked_count: scfTr_.blocked.length, blocked: scfTr_.blocked.slice(0, 50) },
  message: 'A draft PO allocation on a PO line this shipment could use cannot be traced uniquely to a live or a validly cancelled shipment (' + scfTr_.blocked.slice(0, 3).map(function (b) { return (b.shipment_line_allocation_id || b.shipment_line_id || '?') + ': ' + b.reason; }).join('; ') + '). It is neither counted nor ignored, so no PO allocation was prepared. Nothing was written. Review those allocation rows first.' });
externalAlloc = scfTr_.counted;
var plan = slaBuildPlan_(scopes, poLines, externalAlloc);
if (!plan.ok) return jsonResponse_({ success: false, error: plan.failure.error, stage: 'capacity', detail: plan.failure, zero_write: true });


var d = slaSheet.getDataRange().getValues();
var h = d[0].map(function (x) { return slaStr_(x); });
var cLine = h.indexOf('shipment_line_id'), cStat = h.indexOf('allocation_status');
if (cLine !== -1 && cStat !== -1) {
for (var r = d.length - 1; r >= 1; r--) {
if (slaLc_(d[r][cStat]) === 'draft' && selfLineIds[slaStr_(d[r][cLine])]) slaSheet.deleteRow(r + 1);
}
}
var now = procurementTimestamp_();
var skuByLine = {}; scopes.forEach(function (s) { skuByLine[s.shipment_line_id] = s.sku; });
var persisted = [];
plan.results.forEach(function (res) {
res.allocations.forEach(function (a) {



var sla = { shipment_line_allocation_id: 'SLA-' + Utilities.getUuid().substring(0, 10).toUpperCase(),
shipment_line_id: res.shipment_line_id, purchase_order_line_id: a.purchase_order_line_id,
sku: skuByLine[res.shipment_line_id] || '', allocated_qty: a.allocated_qty, allocation_status: 'draft',
created_by: actor, created_at: now, updated_at: now };
procurementAppendByHeader_(slaSheet, sla);
persisted.push({ shipment_line_id: res.shipment_line_id, purchase_order_line_id: a.purchase_order_line_id, allocated_qty: a.allocated_qty, fifo_rank: a.fifo_rank });
});
});

return jsonResponse_({ success: true, data: { shipment_id: shipmentId, company: company, factory_id: factoryId,
allocations: persisted, line_count: scopes.length, shipped_qty_changed: false,
  legacy_orphan_drafts_not_counted: scfTr_.orphans.length, legacy_orphan_drafts: scfTr_.orphans.slice(0, 50) } });   // SCF1 (Owner rule 4)
} finally { try { lock.releaseLock(); } catch (e2) { } }
}










// SCF1 (2026-11-13, Owner rule 4) - which DRAFT allocations of OTHER shipments occupy PO capacity. Read-only.
// A draft on a PO line this request could use (eligible for one of its scopes) is classified by its link
//   allocation.shipment_line_id -> exactly ONE shipment_lines row -> its shipment_id -> exactly ONE shipments row -> that row's status:
//   * a known live status (pre-dispatch, dispatched, stuck)                         -> COUNTED (as before);
//   * 'cancelled' AND no dispatch evidence for that shipment                         -> LEGACY ORPHAN: NOT counted (reported in .orphans);
//     evidence = an executed allocation on any of its lines, a shipment_out movement in either ledger, a route row or an event row;
//   * anything else - a blank allocation line id, no / two+ shipment_lines rows, a blank shipment id on the line, no / two+ shipments rows,
//     a blank or unknown status, a cancelled shipment WITH dispatch evidence, an unreadable source or column -> BLOCKED (in .blocked).
// Drafts on PO lines this request cannot use, and non-draft rows, pass through unchanged (slaReservedByOthers_ counts only 'draft').
function slaDraftOccupancyTrace_(ss, allocs, allAlloc, scopes, poLines) {
var out = { counted: [], blocked: [], orphans: [] }, rel = {}, cand = [];
(poLines || []).forEach(function (p) { if ((scopes || []).some(function (s) { return slaIsEligible_(p, s); })) rel[slaStr_(p.purchase_order_line_id)] = 1; });
var KNOWN_ = ['draft', 'executed', 'released'];   // JR4 decision table: only statuses a writer produces - draft (32_ generate), executed (32_ Confirm, 80_ historical), released (12_ F1); blank / cancelled / canceled / void / voided / unknown -> refuse
(allocs || []).forEach(function (a) { var st = slaLc_(a.allocation_status), onRel = rel[slaStr_(a.purchase_order_line_id)];
  if (st === 'draft' && onRel) cand.push(a);
  else if (onRel && KNOWN_.indexOf(st) < 0) blk(a, 'ALLOCATION_STATUS_UNKNOWN "' + slaStr_(a.allocation_status) + '"');   // JR2 (J-m1): blank / unknown status -> refuse (82_ PFI_ALLOCATION_UNKNOWN)
  else out.counted.push(a); });
if (!cand.length) return out;   // blocked rows (JR2 J-m1) are already in out.blocked
function blk(a, why) { out.blocked.push({ shipment_line_allocation_id: slaStr_(a.shipment_line_allocation_id), shipment_line_id: slaStr_(a.shipment_line_id), purchase_order_line_id: slaStr_(a.purchase_order_line_id), allocated_qty: slaNum_(a.allocated_qty), reason: why }); }
function tbl(name, cols, opt) { var sh = ss.getSheetByName(name); if (!sh) return null; var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return slaLc_(x); }), c = {};
for (var i = 0; i < cols.length; i++) { c[cols[i]] = h.indexOf(cols[i]); if (c[cols[i]] === -1 && d.length > 1) return { bad: name + '.' + cols[i] }; }
(opt || []).forEach(function (n) { c[n] = h.indexOf(n); }); return { rows: d.slice(1), c: c }; }
var L = tbl('shipment_lines', ['shipment_line_id', 'shipment_id']), S = tbl('shipments', ['shipment_id', 'status']);
if (!L || L.bad || !S || S.bad) { var why0 = 'TRACE_SOURCE_UNREADABLE ' + ((L && L.bad) || (S && S.bad) || (!L ? 'shipment_lines' : 'shipments')); cand.forEach(function (a) { blk(a, why0); }); return out; }
var LIVE = ((typeof SHIPMENT_PRE_DISPATCH_STATUSES_ !== 'undefined' && SHIPMENT_PRE_DISPATCH_STATUSES_) || ['draft', 'ready_to_ship'])
  .concat((typeof SHIPMENT_DISPATCHED_STATUSES_ !== 'undefined' && SHIPMENT_DISPATCHED_STATUSES_) || ['shipped', 'in_transit', 'arrived', 'received', 'closed', 'completed', 'delivered', 'partial_received', 'partially_received']).concat(['stuck']);
var lineBy = {}, shipBy = {};
L.rows.forEach(function (r) { var k = slaStr_(r[L.c.shipment_line_id]); if (k) (lineBy[k] = lineBy[k] || []).push(slaStr_(r[L.c.shipment_id])); });
S.rows.forEach(function (r) { var k = slaStr_(r[S.c.shipment_id]); if (k) (shipBy[k] = shipBy[k] || []).push(slaLc_(r[S.c.status])); });
var traced = [];
cand.forEach(function (a) {
var lid = slaStr_(a.shipment_line_id); if (!lid) return blk(a, 'ALLOCATION_LINE_ID_MISSING');
var ls = lineBy[lid] || []; if (!ls.length) return blk(a, 'SHIPMENT_LINE_NOT_FOUND ' + lid); if (ls.length > 1) return blk(a, 'SHIPMENT_LINE_DUPLICATED ' + lid + ' (' + ls.length + ' rows)');
var sid = ls[0]; if (!sid) return blk(a, 'LINE_SHIPMENT_ID_MISSING ' + lid);
var st = shipBy[sid] || []; if (!st.length) return blk(a, 'SHIPMENT_NOT_FOUND ' + sid); if (st.length > 1) return blk(a, 'SHIPMENT_DUPLICATED ' + sid + ' (' + st.length + ' rows)');
if (st[0] === 'cancelled') { traced.push({ a: a, sid: sid }); return; }
if (st[0] && LIVE.indexOf(st[0]) >= 0) { out.counted.push(a); return; }
blk(a, 'SHIPMENT_STATUS_UNKNOWN ' + sid + ' "' + st[0] + '"'); });
if (!traced.length) return out;
var sids = {}, linesOf = {}, ev = {}, bad = [];
traced.forEach(function (t) { sids[t.sid] = 1; });
L.rows.forEach(function (r) { var s = slaStr_(r[L.c.shipment_id]); if (sids[s]) linesOf[slaStr_(r[L.c.shipment_line_id])] = s; });
(allAlloc || []).forEach(function (x) { var s = linesOf[slaStr_(x.shipment_line_id)]; if (s && slaLc_(x.allocation_status) === 'executed') ev[s] = ev[s] || 'EXECUTED_ALLOCATION'; });
var F = tbl('factory_stock_movements', ['movement_type', 'related_entity_type', 'related_entity_id']), O = tbl('overseas_inventory_movements', ['movement_type', 'reference_id']),
  R = tbl('shipment_routes', ['shipment_id']), E = tbl('shipment_events', ['shipment_id'], ['source_event_id', 'event_type']);
[F, O, R, E].forEach(function (t) { if (t && t.bad) bad.push(t.bad); });
if (F && !F.bad) F.rows.forEach(function (r) { var s = slaStr_(r[F.c.related_entity_id]); if (sids[s] && slaStr_(r[F.c.related_entity_type]) === 'shipment' && slaStr_(r[F.c.movement_type]) === 'shipment_out') ev[s] = ev[s] || 'SHIPMENT_OUT_MOVEMENT'; });
if (O && !O.bad) O.rows.forEach(function (r) { var s = slaStr_(r[O.c.reference_id]); if (sids[s] && slaStr_(r[O.c.movement_type]) === 'shipment_out') ev[s] = ev[s] || 'OVERSEAS_SHIPMENT_OUT_MOVEMENT'; });
if (R && !R.bad) R.rows.forEach(function (r) { var s = slaStr_(r[R.c.shipment_id]); if (sids[s]) ev[s] = ev[s] || 'ROUTE_ROW'; });
if (E && !E.bad) E.rows.forEach(function (r) { var s = slaStr_(r[E.c.shipment_id]), x = E.c.source_event_id === -1 ? '' : slaStr_(r[E.c.source_event_id]); if ((E.c.event_type !== undefined && E.c.event_type !== -1 && slaStr_(r[E.c.event_type]) === 'executing_carrier_assigned') || x.indexOf('carrier_exec:') === 0) return;   /* AD3 C round 3 (review F2): the pre-Confirm executing-carrier record is not dispatch evidence (as 22_ csdEventExists_) */ if (sids[s]) ev[s] = ev[s] || 'EVENT_ROW'; if (x.indexOf('confirm:') === 0 && sids[x.slice(8)]) ev[x.slice(8)] = ev[x.slice(8)] || 'EVENT_ROW'; });
traced.forEach(function (t) {
if (bad.length) return blk(t.a, 'TRACE_EVIDENCE_UNREADABLE ' + bad.join(', '));
if (ev[t.sid]) return blk(t.a, 'CANCELLED_SHIPMENT_HAS_DISPATCH_EVIDENCE ' + t.sid + ' ' + ev[t.sid]);
out.orphans.push({ shipment_line_allocation_id: slaStr_(t.a.shipment_line_allocation_id), shipment_line_id: slaStr_(t.a.shipment_line_id), shipment_id: t.sid, purchase_order_line_id: slaStr_(t.a.purchase_order_line_id), allocated_qty: slaNum_(t.a.allocated_qty) }); });
return out;
}

function slaPrepareExecution_(ss, shipmentId) {
var slaSheet = ss.getSheetByName('shipment_line_allocations');
if (!slaSheet) return { ok: false, error: 'SHIPMENT_LINE_ALLOCATIONS_SCHEMA_MISSING' };
var lineSheet = ss.getSheetByName('shipment_lines'), polSheet = ss.getSheetByName('purchase_order_lines');
if (!lineSheet || !polSheet) return { ok: false, error: 'shipment_lines/purchase_order_lines sheet not found' };


var ld = lineSheet.getDataRange().getValues(); if (ld.length < 2) return { ok: false, error: 'Shipment has no lines' };
var lh = ld[0].map(slaStr_);
var lLine = lh.indexOf('shipment_line_id'), lShip = lh.indexOf('shipment_id');
var lQty = lh.indexOf('shipment_qty'); if (lQty === -1) lQty = lh.indexOf('qty');
var qtyByLine = {}, lineIds = {};
for (var i = 1; i < ld.length; i++) {
if (slaStr_(ld[i][lShip]) !== shipmentId) continue;
if (typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(xcoArrRow_(lh, ld[i]))) continue;   // XCO-R15G O-1   // XCO-R15G H2
var lid = slaStr_(ld[i][lLine]); if (!lid) continue;
qtyByLine[lid] = slaNum_(ld[i][lQty]); lineIds[lid] = 1;
}
if (!Object.keys(lineIds).length) return { ok: false, error: 'Shipment has no lines' };


var ad = slaSheet.getDataRange().getValues(); var ah = ad[0].map(slaStr_);
var aIdC = ah.indexOf('shipment_line_allocation_id');   // INT-CAND7 r4 (F-R3-1): the flipped row's identity for a checked undo
var aLine = ah.indexOf('shipment_line_id'), aPol = ah.indexOf('purchase_order_line_id'),
aQty = ah.indexOf('allocated_qty'), aStat = ah.indexOf('allocation_status'), aUpd = ah.indexOf('updated_at');
if (aStat === -1 || aQty === -1 || aPol === -1 || aLine === -1) return { ok: false, error: 'SHIPMENT_LINE_ALLOCATIONS_SCHEMA_MISSING' };
var thisAlloc = [], executedByPolOthers = {};
for (var r = 1; r < ad.length; r++) {
var lid2 = slaStr_(ad[r][aLine]), pol = slaStr_(ad[r][aPol]), q = slaNum_(ad[r][aQty]), st = slaLc_(ad[r][aStat]);
if (lineIds[lid2]) thisAlloc.push({ row: r + 1, lid: lid2, pol: pol, qty: q, status: st, id: aIdC === -1 ? '' : slaStr_(ad[r][aIdC]), prevStat: ad[r][aStat], prevUpd: aUpd === -1 ? '' : ad[r][aUpd] });   // INT-CAND7 r5: the prior raw values (F-R4-2)
else if (st === 'executed') executedByPolOthers[pol] = (executedByPolOthers[pol] || 0) + q;
}


var sumByLine = {};
thisAlloc.forEach(function (a) { if (a.status === 'draft' || a.status === 'executed') sumByLine[a.lid] = (sumByLine[a.lid] || 0) + a.qty; });
var missing = [], mismatch = [];
Object.keys(qtyByLine).forEach(function (lid) {
if (qtyByLine[lid] <= 0) return;
if (!(lid in sumByLine)) missing.push(lid);
else if (sumByLine[lid] !== qtyByLine[lid]) mismatch.push({ shipment_line_id: lid, shipment_qty: qtyByLine[lid], allocated: sumByLine[lid] });
});
if (missing.length) return { ok: false, error: 'SHIPMENT_PO_ALLOCATION_MISSING', detail: { shipment_line_ids: missing } };
if (mismatch.length) return { ok: false, error: 'SHIPMENT_PO_ALLOCATION_QTY_MISMATCH', detail: { lines: mismatch } };


var scShip = sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', shipmentId);
sc13AssertReady_(scShip);
if (sc13LinkIds_(ss, shipmentId).length) {
  var scProof = sc13Verify_(ss, scShip), scPo = slaLoadPoLinesJoined_(ss), scFactory = slaResolveShipmentFactory_(ss, scShip.source_warehouse_id);
  thisAlloc.forEach(function (a) {
    if (a.status !== 'draft' && a.status !== 'executed') return;
    var line = sc13One_(scProof.lines, 'shipment_line_id', a.lid), owner = sc13Source_(ss, line, scShip);
    var po = sc13One_(scPo, 'purchase_order_line_id', a.pol);
    if (slaLc_(po.sku) !== slaLc_(line.sku) || slaLc_(po.factory_id) !== slaLc_(scFactory)) sc13Fail_('CONSOLIDATION_PO_OWNER_MISMATCH');
  });
}
var thisByPol = {}, thisExecutedByPol = {};
thisAlloc.forEach(function (a) {
if (a.status === 'draft' || a.status === 'executed') thisByPol[a.pol] = (thisByPol[a.pol] || 0) + a.qty;
if (a.status === 'executed') thisExecutedByPol[a.pol] = (thisExecutedByPol[a.pol] || 0) + a.qty;
});


var pd = polSheet.getDataRange().getValues(); var ph = pd[0].map(slaStr_);
var pPol = ph.indexOf('purchase_order_line_id'), pComp = ph.indexOf('completed_qty'),
pShip = ph.indexOf('shipped_qty'), pRem = ph.indexOf('remaining_qty');
var polRow = {};
var pOc = ph.indexOf('opening_completed_qty'), pOl = ph.indexOf('opening_lineage_qty'), pOs = ph.indexOf('opening_reconcile_status');
for (var p = 1; p < pd.length; p++) { var id = slaStr_(pd[p][pPol]); if (id) polRow[id] = { row: p + 1, completed: slaNum_(pd[p][pComp]), shipped: pShip !== -1 ? slaNum_(pd[p][pShip]) : 0, remaining: pRem !== -1 ? slaNum_(pd[p][pRem]) : 0, rawShip: pShip !== -1 ? pd[p][pShip] : '', rawRem: pRem !== -1 ? pd[p][pRem] : '',
hold: slaOpeningHold_({ opening_completed_qty: pOc !== -1 ? pd[p][pOc] : 0, opening_lineage_qty: pOl !== -1 ? pd[p][pOl] : 0, opening_reconcile_status: pOs !== -1 ? pd[p][pOs] : '' }) }; }

var poReconcile = [];
var consumedCache = {};
var pols = Object.keys(thisByPol);
for (var k = 0; k < pols.length; k++) {
var polId = pols[k], pr = polRow[polId];
if (!pr) return { ok: false, error: 'PO_LINE_NOT_FOUND', detail: { purchase_order_line_id: polId } };
var others = executedByPolOthers[polId] || 0;


var executedAll = others + (thisExecutedByPol[polId] || 0);
var baseline = slaFactoryImportConsumed_(ss, polId, consumedCache);
if (!baseline.ok) return { ok: false, error: baseline.error, detail: { purchase_order_line_id: polId } };
if (pr.shipped !== baseline.qty + executedAll) {
return { ok: false, error: 'PO_SHIPPED_QTY_LEGACY_BASELINE_UNRESOLVED', detail: { purchase_order_line_id: polId, persisted_shipped_qty: pr.shipped, executed_allocation_sum: executedAll } };
}
var newShipped = baseline.qty + others + thisByPol[polId];


if (pr.hold > 0 && newShipped > pr.completed - pr.hold) return { ok: false, error: 'PO_OPENING_PENDING_RECONCILIATION', detail: { purchase_order_line_id: polId, completed_qty: pr.completed, opening_held_qty: pr.hold, would_be_shipped: newShipped } };
if (newShipped > pr.completed) return { ok: false, error: 'PO_CAPACITY_CHANGED_BEFORE_DISPATCH', detail: { purchase_order_line_id: polId, completed_qty: pr.completed, would_be_shipped: newShipped } };
poReconcile.push({ row: pr.row, pol: polId, completed: pr.completed, newShipped: newShipped, newRemaining: Math.max(0, pr.completed - newShipped), prevShipped: pr.shipped, prevRemaining: pr.remaining, prevShipRaw: pr.rawShip, prevRemRaw: pr.rawRem });
}

var allocFlips = thisAlloc.filter(function (a) { return a.status === 'draft'; }).map(function (a) { return { row: a.row, lid: a.lid, id: a.id, prevStat: a.prevStat, prevUpd: a.prevUpd }; });
return { ok: true, cols: { aStat: aStat, aUpd: aUpd, pShip: pShip, pRem: pRem }, allocFlips: allocFlips, poReconcile: poReconcile, already_executed: allocFlips.length === 0 };
}




function slaApplyExecution_(ss, plan, actor, now, rollback) {
// INT-CAND7 r5 (review B7R4 F-R4-2): every cell is journaled BEFORE its write; prev = the value slaPrepareExecution_ read (same lock),
// wrote = the planned value (updated_at: meta, identity only). A write that lands and then throws is therefore always on the journal.
var slaSheet = ss.getSheetByName('shipment_line_allocations'), polSheet = ss.getSheetByName('purchase_order_lines');
var c = plan.cols;
plan.allocFlips.forEach(function (f) {
if (rollback) rollback.push({ kind: 'cell', sheet: slaSheet, row: f.row, col: c.aStat, prev: f.prevStat, wrote: 'executed' });
slaSheet.getRange(f.row, c.aStat + 1).setValue('executed');
if (c.aUpd !== -1) { if (rollback) rollback.push({ kind: 'cell', sheet: slaSheet, row: f.row, col: c.aUpd, prev: f.prevUpd, wrote: now, meta: true }); slaSheet.getRange(f.row, c.aUpd + 1).setValue(now); }
});
plan.poReconcile.forEach(function (rc) {
if (rollback) rollback.push({ kind: 'cell', sheet: polSheet, row: rc.row, col: c.pShip, prev: rc.prevShipRaw, wrote: rc.newShipped });
polSheet.getRange(rc.row, c.pShip + 1).setValue(rc.newShipped);
if (c.pRem !== -1) { if (rollback) rollback.push({ kind: 'cell', sheet: polSheet, row: rc.row, col: c.pRem, prev: rc.prevRemRaw, wrote: rc.newRemaining }); polSheet.getRange(rc.row, c.pRem + 1).setValue(rc.newRemaining); }
});
return { executed_allocations: plan.allocFlips.length, reconciled_po_lines: plan.poReconcile.length };
}

// XCO-R15G H2: 32_ allocation skips removed lines (sc13LineRemoved_, 12_).
// XCO-R15G-32 (xco-r15g-impl): patched

// XCO-R15G O-1 (32_): the raw-row form of the shared predicate.
// XCO-R15G-32B-O1 (xco-r15g-impl): patched

// XCO-R15G MINOR-7: the per-line source company shares one read of each sheet.
// XCO-R15G-MEMO-32 (xco-r15g-impl): patched

var SLA_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R72-AD3';   // PGSC1N1: new module stamp (registration per build-production-profile.cjs:37,42,43)
