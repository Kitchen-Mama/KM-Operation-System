




























var SHIPMENTS_HEADERS_ = [
'shipment_id', 'shipment_no', 'shipping_plan_id', 'external_shipment_id', 'reference_id',
'source_warehouse_id', 'warehouse_code', 'company', 'country', 'marketplace',
'ship_from', 'destination', 'destination_warehouse_id', 'destination_type',
'carrier_id', 'rate_card_id', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type', 'import_duty_treatment', 'status', 'sales_order_id',
'booking_no', 'master_tracking_number', 'tracking_number', 'container_no', 'bl_no', 'invoice_no',
'etd', 'eta', 'is_cross_dock', 'temperature_requirement', 'hazmat_flag',
'actual_departure_date', 'actual_arrival_date', 'customs_clearance_date', 'delivered_date',


'shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm', 'shipment_total_gross_weight', 'shipment_total_net_weight',

'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost',
'freight_cost_actual', 'duty_actual', 'total_cost_actual', 'currency', 'note',
'created_by', 'created_at', 'updated_at',

'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',

'warehouse_id', 'total_gross_weight', 'total_net_weight', 'updated_by'
];






var SHIPMENT_LINES_HEADERS_ = [
'shipment_line_id', 'shipment_id', 'sku',



'shipment_qty', 'factory_stock_allocation_qty', 'shipment_carton_qty', 'carton_no_start', 'carton_no_end',
'units_per_carton', 'shipment_carton_cbm', 'gross_weight', 'net_weight',
'purchase_order_line_id',




'shipping_plan_line_id',
'note', 'created_at', 'updated_at',

'snapshot_current_stock', 'snapshot_avg_sales_per_day', 'snapshot_days_of_supply',
'snapshot_suggested_qty', 'snapshot_target_days', 'snapshot_fc_context', 'snapshot_event_context',
'snapshot_avg_sales_source', 'snapshot_avg_sales_warning',





'shipment_received_qty'
];



var SHIPMENT_EDITABLE_FIELDS_ = [
'external_shipment_id',
'carrier_id', 'rate_card_id', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type', 'import_duty_treatment',
'booking_no', 'master_tracking_number', 'tracking_number', 'container_no', 'bl_no', 'invoice_no',
'etd', 'eta', 'is_cross_dock', 'temperature_requirement', 'hazmat_flag',
'actual_departure_date', 'actual_arrival_date', 'customs_clearance_date', 'delivered_date',
'shipment_total_cbm', 'shipment_total_gross_weight', 'shipment_total_net_weight',
'freight_cost_actual', 'duty_actual', 'total_cost_actual', 'currency',




'source_warehouse_id', 'destination_warehouse_id', 'destination_type', 'warehouse_id', 'warehouse_code', 'reference_id', 'note'
];

function shipmentTimestamp_() {
return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}
function shipmentToday_() {
return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
function shipmentNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }



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




function shipmentCustomsType_(ss, rateCardId, presetCustomsType) {
var v = String(presetCustomsType || '').trim();
if (v) return v;
return shipmentRateCardField_(ss, rateCardId, 'customs_type');
}







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




function shipmentEnsureSheet_(ss, name, headers) {
return shipmentRequireKnownLayoutSc1_(ss, name, headers);
}


function shipmentAppendByHeader_(sheet, obj) {
var lastCol = sheet.getLastColumn();
var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
var row = new Array(headers.length).fill('');
var xcoSn_ = (sheet && typeof sheet.getName === 'function') ? sheet.getName() : '';   // XCO-R15G O-1: a new row never leaves the status blank
if (xcoSn_ === 'shipment_lines' && headers.indexOf('line_status') >= 0 && (obj.line_status === undefined || obj.line_status === null || obj.line_status === '')) obj = Object.assign({}, obj, { line_status: 'active' });
if (xcoSn_ === 'shipment_plan_links' && headers.indexOf('link_status') >= 0 && (obj.link_status === undefined || obj.link_status === null || obj.link_status === '')) obj = Object.assign({}, obj, { link_status: 'active' });
for (var i = 0; i < headers.length; i++) {
if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) {
row[i] = obj[headers[i]];
}
}
sheet.appendRow(row);
}


function shipmentReadSheet_(sheet) {
var data = sheet.getDataRange().getValues();
var headers = (data[0] || []).map(function (h) { return String(h).trim(); });
return {
headers: headers,
rows: data,
col: function (n) { return headers.indexOf(n); }
};
}



















var SHIPMENT_FOR_PLAN_EXISTS_ = 'EXISTS';
var SHIPMENT_FOR_PLAN_ABSENT_ = 'ABSENT';
var SHIPMENT_FOR_PLAN_UNKNOWN_ = 'UNKNOWN';


var SHIPMENT_PLAN_REF_COLUMNS_ = ['shipping_plan_id', 'source_shipping_plan_id', 'plan_id'];







function shipmentStateForPlan_(ss, planId) {
planId = String(planId || '').trim();
if (!planId) return { state: SHIPMENT_FOR_PLAN_UNKNOWN_, shipment_id: '', reason: 'NO_PLAN_ID' };
try {
var sheet = ss.getSheetByName('shipments');
if (!sheet) return { state: SHIPMENT_FOR_PLAN_UNKNOWN_, shipment_id: '', reason: 'SHIPMENTS_SHEET_ABSENT' };
var s = shipmentReadSheet_(sheet);
var idCol = s.col('shipment_id');
var refCols = SHIPMENT_PLAN_REF_COLUMNS_
.map(function (n) { return s.col(n); }).filter(function (c) { return c !== -1; });
if (!refCols.length) {
return { state: SHIPMENT_FOR_PLAN_UNKNOWN_, shipment_id: '', reason: 'NO_PLAN_REFERENCE_COLUMN' };
}
for (var r = 1; r < s.rows.length; r++) {
for (var c = 0; c < refCols.length; c++) {
if (String(s.rows[r][refCols[c]]).trim() === planId) {
return { state: SHIPMENT_FOR_PLAN_EXISTS_,
shipment_id: idCol !== -1 ? String(s.rows[r][idCol]).trim() : 'MATCH', reason: '' };
}
}
}
return { state: SHIPMENT_FOR_PLAN_ABSENT_, shipment_id: '', reason: '' };
} catch (e) {
return { state: SHIPMENT_FOR_PLAN_UNKNOWN_, shipment_id: '',
reason: 'SHIPMENTS_READ_FAILED:' + String(e && e.message ? e.message : e) };
}
}







function shipmentFindForPlan_(ss, planId) {
var st = shipmentStateForPlan_(ss, planId);
return st.state === SHIPMENT_FOR_PLAN_EXISTS_ ? st.shipment_id : '';
}








function shipmentValidateCartons_(ss, shipmentId, requireComplete) {
try { if (typeof mcpShipment_ === 'function' && mcpShipment_(ss, shipmentId)) return {ok:true, numbering:'PACKING_BLOCK_SEQUENCE'}; }
catch (e) { return {ok:false,error:e.code || String(e.message || e)}; }
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











function shipmentExactRateAndCost_(ss, ctx) {
var out = { rateCardId: '', rateReview: false, splitRequired: false, currency: '',
estimatedFreightCost: '', estimatedDuty: '', estimatedCustomsFee: '', estimatedTotalCost: '', estimatedUnitCost: '' };
try {
var carrierId = String(ctx.carrierId || '').trim();
if (!carrierId) return out;
if (typeof shippingMatchRateCards_ !== 'function') return out;
var battery = shippingBatteryClass_(ss, (ctx.lines || []).map(function (l) { return l.sku; }));
var isMulti = String(ctx.marketplace || '').trim().toUpperCase() === 'MULTI';
var candidates = shippingMatchRateCards_(ss, {
originCountry: String(ctx.originCountry == null ? '' : ctx.originCountry).trim(), destinationCountry: ctx.country, shippingMethod: ctx.shippingMethod,   // WK1 r3 (D-6): the caller's origin (Weekly passes the plan's)
lastMile: ctx.lastMile, batteryType: battery, quoteDate: ctx.quoteDate,
marketplace: isMulti ? 'MULTI' : ctx.marketplace,
destinationWarehouseCode: ctx.destinationWarehouseCode
, destinationCity: ctx.destinationCity, destinationPostalCode: ctx.destinationPostalCode
}, true).filter(function (rc) { return String(rc.carrier_id || '').trim() === carrierId; });



if (isMulti) {
var whole = candidates.filter(function (c) { return String(c.marketplace || '').trim() === ''; });
if (whole.length) { candidates = whole; }
else if (candidates.length) { out.splitRequired = true; out.rateReview = true; return out; }
}
var rc = null;
if (ctx.planRateCardId) rc = candidates.filter(function (c) { return String(c.rate_card_id || '').trim() === String(ctx.planRateCardId).trim(); })[0] || null;
if (!rc) rc = candidates[0] || null;
if (!rc) { out.rateReview = true; return out; }
var freight = shippingFreight_(rc, { grossWeightKg: ctx.grossWeightKg, cbm: ctx.cbm, cartons: ctx.cartons });
if (freight.freight === '') { out.rateReview = true; out.costUnknown = freight.unknown || 'measure'; return out; }   // R15C-AGL: unknown measure -> NOT priced (never 0)
var customsFee = shippingCustomsFee_(rc);
var treat = String(rc.import_duty_treatment || '').trim();   // R15F2 duty (i), Owner 2026-11-09: the SELECTED card's own value only - a plan / shipment value left by an earlier card is never used (blank = unknown, not priced)
var tax = shippingTaxQuote_(ss, ctx.lines, treat, ctx.country, ctx.quoteDate, { originCountry: ctx.originCountry || rc.origin_country, freightCurrency: rc.currency, includePortTax: true });
var duty = tax.known ? tax.amount : '';
var split = tax.known && tax.currency !== String(rc.currency || '').trim().toUpperCase();
var total = !tax.known || split ? '' : freight.freight + customsFee + duty;   // R15C-AGL: an undetermined duty leaves the total undetermined
if (duty === '') out.costUnknown = 'duty';
out.taxReason = tax.reason; out.estimatedDutyCurrency = tax.currency; out.splitCurrency = split; out.taxQuote = tax;
out.rateCardId = String(rc.rate_card_id || '').trim();
out.currency = String(rc.currency || '').trim().toUpperCase();
if (!/^[A-Z]{3}$/.test(out.currency)) out.costUnknown = 'currency';
out.estimatedFreightCost = freight.freight;
out.estimatedDuty = duty;
out.estimatedCustomsFee = customsFee;
out.estimatedTotalCost = (total === '') ? '' : Math.round(total * 100) / 100;
out.estimatedUnitCost = (total !== '' && shipmentNum_(ctx.totalQty) > 0) ? Math.round((total / shipmentNum_(ctx.totalQty)) * 10000) / 10000 : '';
return out;
} catch (e) { out.rateReview = true; return out; }
}












var SHIPMENT_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1G-R15F2-R15G-S2-TAX1-CP1-SC1R2-SCF1-N01-AD1B-AD3-AD4-DW1-DW2-MC1-REVIEW1';









// INT-CAND4 (local candidate): what a pre-dispatch draft of `planId` lacks, read-only. [] = complete. Lineage: every plan line of the
// plan's owners has exactly one shipment line of `sid` and no shipment line points elsewhere; stock: the source domain's ledger holds,
// for owner `sid`, at least each SKU's line quantity. A missing ledger is a gap. Never ensures, creates or writes a sheet.
function shipmentDraftGaps_(ss, planId, sid, shipRow, s, planLineSheet) {
var gaps = [], owners = {};
(typeof shippingPlanEffectiveOwnerIds_ === 'function' ? shippingPlanEffectiveOwnerIds_(ss, planId) : [planId]).forEach(function (x) { owners[String(x).trim()] = 1; });
var scLinkedPlans = sc13LinkIds_(ss, String(sid || '').trim());
if (scLinkedPlans.length) {
  if (scLinkedPlans.indexOf(String(planId || '').trim()) < 0) return ['CONSOLIDATION_PLAN_LINK_MISSING'];
  owners = {}; scLinkedPlans.forEach(function (id) { owners[id] = 1; });
}
var pl = shipmentReadSheet_(planLineSheet), want = {}, nWant = 0;
for (var a = 1; a < pl.rows.length; a++) { if (owners[String(pl.rows[a][pl.col('shipping_plan_id')]).trim()]) { var wid = String(pl.rows[a][pl.col('shipping_plan_line_id')] || '').trim(); if (wid) { want[wid] = 0; nWant++; } } }
var lnSheet = ss.getSheetByName('shipment_lines'); if (!lnSheet) return ['SHIPMENT_LINES_SHEET_MISSING'];
var ln = shipmentReadSheet_(lnSheet), need = {}, nLines = 0;
for (var b = 1; b < ln.rows.length; b++) {
if (String(ln.rows[b][ln.col('shipment_id')]).trim() !== sid) continue; nLines++;
var pli = String(ln.rows[b][ln.col('shipping_plan_line_id')] || '').trim();
if (Object.prototype.hasOwnProperty.call(want, pli)) want[pli]++; else gaps.push('LINE_FOREIGN:' + (pli || '(blank)'));
var sku = String(ln.rows[b][ln.col('sku')] || '').trim(), q = Math.round(shipmentNum_(ln.rows[b][ln.col('shipment_qty')]));
if (sku && q > 0) need[sku] = (need[sku] || 0) + q;
}
if (!nLines) gaps.push('NO_LINES');
Object.keys(want).forEach(function (k) { if (want[k] === 0) gaps.push('LINE_MISSING:' + k); else if (want[k] > 1) gaps.push('LINE_DUPLICATED:' + k); });
if (!nWant) gaps.push('PLAN_HAS_NO_LINES');
var skus = Object.keys(need);
if (skus.length) {
var wh = String(shipRow[s.col('source_warehouse_id')] || '').trim(), dom = shipmentSourceDomain_(ss, wh), ovs = dom === SHIPMENT_DOMAIN_OVERSEAS_;
var mov = ss.getSheetByName(ovs ? 'overseas_inventory_movements' : 'factory_stock_movements');
if (!wh || !mov) gaps.push('RESERVATION_LEDGER_MISSING');
else {
var held = ovs ? ovsOwnerReservedTx_(mov, OVSTX_RESERVATION_OWNER_TYPE_, sid) : factoryStockOwnerReservedTx_(mov, FSTX_RESERVATION_OWNER_TYPE_, sid);
skus.forEach(function (k) { var h = held[wh + '||' + k] || 0; if (h < need[k]) gaps.push('RESERVATION_SHORT:' + k + ' held ' + h + ' of ' + need[k]); });
}
}
return gaps;
}

function createShipmentFromApprovedPlan_(ss, planId, actor, cspOpts_) {   // R71 small-4: cspOpts_.planJustStamped = the approve stamped this plan row in this request
planId = String(planId || '').trim();
if (!planId) return { created: false, reason: 'missing_plan_id' };
actor = String(actor || 'system_user').trim();

var planSheet = ss.getSheetByName('shipping_plans');
var planLineSheet = ss.getSheetByName('shipping_plan_lines');
if (!planSheet) return { created: false, reason: 'shipping_plans_not_found' };
if (!planLineSheet) return { created: false, reason: 'shipping_plan_lines_not_found' };


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



var planParentRef = String(pv('parent_shipping_plan_id') || '').trim();
if (planParentRef && planParentRef !== planId) {
return { created: false, reason: 'is_combined_child', parent_shipping_plan_id: planParentRef };
}

var dgCsp_ = shipDestinationDraftGate_(ss, { company: pv('company'), country: pv('country'), marketplace: pv('marketplace'), source_warehouse_id: pv('source_warehouse_id'), destination_warehouse_id: pv('destination_warehouse_id') });
if (dgCsp_) return { created: false, reason: dgCsp_.code, detail: dgCsp_.reason, overseas_transfer_check: dgCsp_.check || null };   // AD3-B (Author C request): no Draft / no reservation for a destination Confirm refuses
var shipmentSheet = shipmentEnsureSheet_(ss, 'shipments', SHIPMENTS_HEADERS_);
var shipmentLineSheet = shipmentEnsureSheet_(ss, 'shipment_lines', SHIPMENT_LINES_HEADERS_);



sheetEnsureColumns_(shipmentSheet, ['external_shipment_id', 'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',
'last_mile_delivery', 'shipments_customs_type', 'booking_no', 'note',
'shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm',
'shipment_total_gross_weight', 'shipment_total_net_weight',

'source_warehouse_id', 'destination_warehouse_id', 'destination_type', 'import_duty_treatment',
'master_tracking_number', 'is_cross_dock', 'temperature_requirement', 'hazmat_flag',
'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost',
'total_cost_actual']);
sheetEnsureColumns_(shipmentLineSheet, ['carton_no_start', 'carton_no_end', 'shipment_carton_qty', 'shipment_qty', 'shipment_carton_cbm', 'shipping_plan_line_id']);
sheetEnsureColumns_(planSheet, ['transferred_to_shipment_at', 'transferred_shipment_id']);







var fcLock = null;
try { fcLock = LockService.getScriptLock(); if (!fcLock.tryLock(30000)) return { created: false, reason: 'LOCK_UNAVAILABLE' }; }
catch (eLock) { return { created: false, reason: 'LOCK_ERROR', error: String(eLock && eLock.message ? eLock.message : eLock) }; }
function fcUnlock_() { try { if (fcLock) fcLock.releaseLock(); } catch (e) {} }


var sc13Outcome;
try {
  var sc13Fresh = sc13One_(sc13Read_(ss, 'shipping_plans', []).rows, 'shipping_plan_id', planId);
  if (p.headers.some(function (h, i) { return shipRcCanon_(planRow[i]) !== shipRcCanon_(sc13Fresh[h]); })) throw new Error('CONSOLIDATION_PLAN_CHANGED_BEFORE_LOCK');
  sc13Outcome = sc13TryLocked_(ss, planId, actor);
}
catch (sc13Error) { fcUnlock_(); return { created: false, reason: String(sc13Error.message || sc13Error), zero_write: true }; }
if (sc13Outcome) { fcUnlock_(); return sc13Outcome; }
var fcJournal = [];
function fcJournalRow_(sheet) { fcJournal.push({ kind: 'row', sheet: sheet, row: sheet.getLastRow() }); }


var s = shipmentReadSheet_(shipmentSheet);
var sPlanCol = s.col('shipping_plan_id');
var sIdCol = s.col('shipment_id');
var sStatusCol = s.col('status');
if (sPlanCol !== -1) {
for (var r = 1; r < s.rows.length; r++) {
if (String(s.rows[r][sPlanCol]).trim() !== planId) continue;







var rowStatus = sStatusCol === -1 ? '' : String(s.rows[r][sStatusCol] || '').trim().toLowerCase();
if (rowStatus === SHIPMENT_CANCELLED_STATUS_) continue;
// INT-CAND4 (local candidate): a PRE-DISPATCH shipment this plan already owns is reused only when it is provably complete; a half-made
// draft (a write that landed and then threw, an execution ended midway) is QUARANTINED - typed refusal, nothing written, nothing resent.
var exSid = sIdCol !== -1 ? String(s.rows[r][sIdCol]).trim() : '';
if (SHIPMENT_DISPATCHED_STATUSES_.indexOf(rowStatus) < 0) {
var exGaps;
try { exGaps = shipmentDraftGaps_(ss, planId, exSid, s.rows[r], s, planLineSheet); }
catch (eGap) { fcUnlock_(); return { created: false, reason: 'SHIPMENT_DRAFT_CHECK_FAILED', shipment_id: exSid, shipping_plan_id: planId, error: String(eGap && eGap.message ? eGap.message : eGap) }; }
if (exGaps.length) { fcUnlock_(); return { created: false, reason: 'SHIPMENT_DRAFT_INCOMPLETE', shipment_id: exSid, shipping_plan_id: planId, gaps: exGaps.slice(0, 20),
message: 'Shipment ' + exSid + ' exists for this plan but is not complete (' + exGaps.slice(0, 5).join('; ') + '). It is quarantined: nothing was written and nothing is retried automatically. ' + shipmentReservationReviewText_() + ' Cancel Shipment Draft is the way out only once that review shows the stock cells of its keys agree with the ledger.' }; }
}
// INT-CAND8 r5 (fail-closed, spec r5): an existing draft is re-used only when (any status) its dispatch state is consistent in the rows
// (INT-CAND7 r5 22_ csdDispatchConsistency_) and (pre-dispatch) the reservation books of every key it touches agree - never REUSED over a
// half-kept dispatch or disagreeing books. Read-only; nothing written on a refusal.
var exRt_ = 0, exEv_ = false, exMv_ = false, exDs_ = csdIsDispatchedStatus_(rowStatus), exDc_ = null;
try { exRt_ = csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', exSid); exEv_ = csdEventExists_(ss, exSid); exMv_ = csdMovementExists_(ss, exSid); }   // INT-CAND8 r6 (CH5-6): never throws
catch (eRd_) { fcUnlock_(); return { created: false, reason: 'DISPATCH_STATE_UNKNOWN', shipment_id: exSid, shipping_plan_id: planId, observed: ['DISPATCH_EVIDENCE_READ_FAILED: ' + String(eRd_ && eRd_.message ? eRd_.message : eRd_)],
message: 'Shipment ' + exSid + ' exists for this plan but its dispatch rows could not be READ, so it was not re-used. Nothing was written. This may be a transient read error: it may be retried once the rows can be read (it is checked again).' }; }
if (!exDs_ && (exRt_ > 0 || exEv_ || exMv_)) exDc_ = { ok: false, why: ['DISPATCH_EVIDENCE_UNDER_STATUS ' + rowStatus] }; else if (exDs_) exDc_ = csdDispatchConsistency_(ss, exSid, exRt_, exEv_, exMv_);
if (exDc_ && !exDc_.ok) { fcUnlock_(); return { created: false, reason: 'DISPATCH_STATE_INCONSISTENT', shipment_id: exSid, shipping_plan_id: planId, observed: exDc_.why.slice(0, 20),
message: 'Shipment ' + exSid + ' exists for this plan but its dispatch is not consistent in the rows (' + exDc_.why.slice(0, 3).join('; ') + '). Nothing was written and nothing was re-used. Review it first.' }; }
if (!exDs_) { var exBk_ = shipmentCancelBooks_(ss, exSid, s.col('source_warehouse_id') !== -1 ? String(s.rows[r][s.col('source_warehouse_id')] || '').trim() : '');
if (exBk_.verdict !== 'RECONCILED') { fcUnlock_(); return { created: false, reason: exBk_.verdict, shipment_id: exSid, shipping_plan_id: planId, keys_checked: exBk_.keys, keys_mismatched: exBk_.mismatched, keys_unknown: exBk_.unknown,
message: shipmentBooksMessage_(exBk_, 'Re-using the existing Shipment Draft ' + exSid) }; } }
fcUnlock_();
// INT-CAND7 (local candidate): read-only - a complete draft reused while the plan row does not name it (the creation that made it stopped
// before the plan's transferred_* cells were written). Reported only; nothing is written here.
var exRe = { created: false, reason: 'already_exists', shipment_id: exSid };
if (SHIPMENT_DISPATCHED_STATUSES_.indexOf(rowStatus) < 0) { var exTc = p.col('transferred_shipment_id'); if ((exTc === -1 ? '' : String(planRow[exTc] == null ? '' : planRow[exTc]).trim()) !== exSid) exRe.plan_transfer_missing = true; }
return exRe;
}
}




// INT-CAND8 r5 (review R4R3 F-R3-2, fail-closed): a LIVE shipment that names this plan only through a legacy plan column
// (source_shipping_plan_id / plan_id) is not re-used (create / retry match shipping_plan_id only) - so a new draft would be a SECOND shipment
// for the plan while that one keeps its reservation. Refuse, nothing written. Plans without such a link are unaffected.
var lgIds_ = [], lgSt_ = s.col('status'), lgCols_ = ['source_shipping_plan_id', 'plan_id'].map(function (n) { return s.col(n); }).filter(function (c) { return c !== -1; });
for (var lg = 1; lgCols_.length && lg < s.rows.length; lg++) {
if (sPlanCol !== -1 && String(s.rows[lg][sPlanCol]).trim() !== '') continue;   // INT-CAND8 r6 (CH5-8): a row naming ANY plan in shipping_plan_id is not a legacy-only link
if (lgSt_ !== -1 && String(s.rows[lg][lgSt_]).trim().toLowerCase() === SHIPMENT_CANCELLED_STATUS_) continue;
if (lgCols_.some(function (c) { return String(s.rows[lg][c]).trim() === planId; })) lgIds_.push(sIdCol !== -1 ? String(s.rows[lg][sIdCol]).trim() : 'row ' + (lg + 1)); }
if (lgIds_.length) { fcUnlock_(); return { created: false, reason: 'LEGACY_LINKED_SHIPMENT_EXISTS', shipping_plan_id: planId, legacy_linked_shipment_ids: lgIds_.slice(0, 20),
message: 'A live shipment (' + lgIds_.slice(0, 5).join(', ') + ') is linked to plan ' + planId + ' only through a legacy plan column. It is not re-used, so a new Shipment Draft would be a second shipment for this plan while that one keeps its reservation. Refused before any write; nothing was written. Review the legacy-linked shipment first.' }; }
var ownerIds = {};
(typeof shippingPlanEffectiveOwnerIds_ === 'function' ? shippingPlanEffectiveOwnerIds_(ss, planId) : [planId]).forEach(function (x) { ownerIds[String(x).trim()] = 1; });
var pl = shipmentReadSheet_(planLineSheet);
var plPlanCol = pl.col('shipping_plan_id');
var planLines = [];
for (var k = 1; k < pl.rows.length; k++) {
if (plPlanCol !== -1 && ownerIds[String(pl.rows[k][plPlanCol]).trim()]) planLines.push(pl.rows[k]);
}
var plv = function (rowVals, name) { var c = pl.col(name); return c === -1 ? '' : rowVals[c]; };

var planCartonQty = function (rowVals) {
var v = plv(rowVals, 'plan_carton_qty');
if (v === '' || v == null) v = plv(rowVals, 'carton_qty');
return v;
};
try {
  if (typeof mcpLayout_ === 'function') mcpLayout_(planLines.map(function (row) { var o={};pl.headers.forEach(function (h,i) {o[h]=row[i];});return o; }), 'plan');
} catch (packingError) { fcUnlock_();return {created:false,reason:packingError.code || 'MIXED_PACKING_INVALID',message:String(packingError.message)}; }






var srcWarehouseId = String(pv('source_warehouse_id') || '').trim();
var needBySku = {}, needSkus = [], rsPre = {}, rsMeta = {}, rsMovIds = {}, rsLineIds = [];   // INT-CAND7: + metadata before, ledger / line ids written
for (var nq = 0; nq < planLines.length; nq++) {
var nSku = String(plv(planLines[nq], 'sku') || '').trim();
var nQty = Math.round(shipmentNum_(plv(planLines[nq], 'approved_qty')));
if (!nSku || nQty <= 0) continue;
if (needBySku[nSku] === undefined) { needBySku[nSku] = 0; needSkus.push(nSku); }
needBySku[nSku] += nQty;
}


var srcDomain = shipmentSourceDomain_(ss, srcWarehouseId);
var srcSheets = null;
var fcStockSheet = ss.getSheetByName('factory_stock');
var FC_MOV_HEADERS_ = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
var fcMovSheet = null;
if (needSkus.length) {


if (!srcWarehouseId) { fcUnlock_(); return { created: false, reason: 'SOURCE_WAREHOUSE_REQUIRED_FOR_RESERVATION', shipping_plan_id: planId }; }
srcSheets = shipmentDomainSheets_(ss, srcDomain);
if (!srcSheets) {
fcUnlock_();
return { created: false, reason: srcDomain === SHIPMENT_DOMAIN_OVERSEAS_
? 'overseas_inventory_snapshot_not_found' : 'factory_stock_not_found' };
}
if (srcDomain === SHIPMENT_DOMAIN_FACTORY_) {
fcMovSheet = fcWriteEnsureSheet_(ss, 'factory_stock_movements', FC_MOV_HEADERS_);
fcWriteEnsureColumns_(fcMovSheet, FC_MOV_HEADERS_);
srcSheets.movSheet = fcMovSheet;
}
// INT-CAND8 (I1, spec r2 F8): the books of the keys this draft would reserve, inside fcLock, BEFORE the shortfall refusal (an inflated
// reserved cell lowers 'available', so a later check would report 'insufficient stock' instead of the books)
var bkC = shipmentReservationBooks_(srcDomain, srcSheets, srcWarehouseId, needSkus);
if (bkC.verdict !== 'RECONCILED') { fcUnlock_(); return { created: false, reason: bkC.verdict, shipping_plan_id: planId, source_warehouse_id: srcWarehouseId, source_domain: srcDomain,
keys_checked: bkC.keys, keys_mismatched: bkC.mismatched, keys_unknown: bkC.unknown, message: shipmentBooksMessage_(bkC, 'Creating the Shipment Draft') }; }
var shortfalls = [];
// INT-CAND7: ONE read of the stock sheet serves every key's balance (the same 21_ / 05_ parsers, through a read-only view) and the metadata
var rsStock = srcSheets.stockSheet.getDataRange().getValues(), rsView = shipmentStockView_(srcSheets, rsStock);
rsMeta = shipmentStockMeta_(srcDomain, rsStock, srcWarehouseId, needSkus);
for (var ns = 0; ns < needSkus.length; ns++) {
var bal = shipmentDomainAvailable_(srcDomain, rsView, srcWarehouseId, needSkus[ns]);
rsPre[needSkus[ns]] = { reserved: bal.reserved, available: bal.available };   // INT-CAND5: the balance before any reservation (read already made)
if (bal.available < needBySku[needSkus[ns]]) {
shortfalls.push({ sku: needSkus[ns], warehouse_id: srcWarehouseId, need: needBySku[needSkus[ns]],
available: bal.available, current: bal.current, reserved: bal.reserved });
}
}
if (shortfalls.length) {
fcUnlock_();


var shortLabel = srcDomain === SHIPMENT_DOMAIN_OVERSEAS_ ? 'overseas' : 'factory';
return { created: false,
reason: srcDomain === SHIPMENT_DOMAIN_OVERSEAS_ ? 'INSUFFICIENT_OVERSEAS_STOCK' : 'INSUFFICIENT_FACTORY_STOCK',
shipping_plan_id: planId, source_domain: srcDomain,
source_warehouse_id: srcWarehouseId, shortfalls: shortfalls,
message: 'Insufficient available ' + shortLabel + ' stock at ' + srcWarehouseId + ' for: ' + shortfalls.map(function (x) {
return x.sku + ' (need ' + x.need + ', available ' + x.available + ')'; }).join('; ') +
'. No Shipment Draft was created and nothing was reserved.' };
}
}

var now = shipmentTimestamp_();
var today = shipmentToday_();
var shipmentId = 'SH-' + Utilities.getUuid().substring(0, 10).toUpperCase();
// R69+SHIPNO-CAND1 (local candidate): shipment_no = SHP-yyyymmdd-NNNN - a per-day serial chosen below, inside fcLock (no random part).
var shipmentNoPrefix = 'SHP-' + today.replace(/-/g, '') + '-';





function normSeg_(v) { return String(v == null ? '' : v).trim().toUpperCase().replace(/[^A-Z0-9]+/g, ''); }
var companyAbbrev = normSeg_(pv('company'));
var marketplaceAbbrev = shipmentMarketplaceAbbrev_(pv('marketplace'));
var yymmdd = today.replace(/-/g, '').substring(2);
var extPrefix = [companyAbbrev, marketplaceAbbrev, yymmdd].filter(String).join('-');
var extCol = s.col('external_shipment_id');
// R69+EXTID-CAND3 (local candidate): the serial passes the highest existing one; at least two digits, never truncated.
// A deleted row can still let an id come back - the documents step (39_ dgsShipmentLeafOwnership_) refuses the old leaf.
var extSerial = 1, extMax = 0;
if (extCol !== -1) {
for (var e = 1; e < s.rows.length; e++) {
var extV = String(s.rows[e][extCol] || '');
if (extV.indexOf(extPrefix + '-') === 0) { extSerial++; var extN = parseInt(extV.slice(extPrefix.length + 1), 10); if (extN > extMax) extMax = extN; }
}
}
// CAND3: ids issued to a CONFIRMED shipment stay taken when its row is gone - 34_ snapshots keep external_shipment_id.
var extSnapSh = ss.getSheetByName('shipment_final_output_snapshots');
if (extSnapSh && extSnapSh.getLastRow() > 1 && extSnapSh.getLastColumn() > 0) {
var extSnapCol = extSnapSh.getRange(1, 1, 1, extSnapSh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }).indexOf('external_shipment_id');
if (extSnapCol !== -1) extSnapSh.getRange(2, extSnapCol + 1, extSnapSh.getLastRow() - 1, 1).getValues().forEach(function (r) {
var sv = String(r[0] || ''); if (sv.indexOf(extPrefix + '-') === 0) { var sn = parseInt(sv.slice(extPrefix.length + 1), 10); if (sn > extMax) extMax = sn; }
});
}
extSerial = Math.max(extSerial, extMax + 1);
var externalShipmentId = extPrefix + '-' + (extSerial < 10 ? '0' + extSerial : String(extSerial));
// R69+SHIPNO-CAND1: the serial passes the highest same-day serial on a shipments row (read above, inside fcLock) and in the 34_
// snapshot history; at least four digits, never truncated. A legacy random suffix counts only when it is all digits.
function shipNoSerial_(v) { v = String(v == null ? '' : v).trim().toUpperCase(); if (v.indexOf(shipmentNoPrefix) !== 0) return 0; v = v.slice(shipmentNoPrefix.length); return /^[0-9]+$/.test(v) ? parseInt(v, 10) : 0; }
var shipNoCol = s.col('shipment_no'), shipNoMax = 0;
for (var snI = 1; shipNoCol !== -1 && snI < s.rows.length; snI++) shipNoMax = Math.max(shipNoMax, shipNoSerial_(s.rows[snI][shipNoCol]));
if (extSnapSh && extSnapSh.getLastRow() > 1 && extSnapSh.getLastColumn() > 0) {
var snSnapCol = extSnapSh.getRange(1, 1, 1, extSnapSh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); }).indexOf('shipment_no');
if (snSnapCol !== -1) extSnapSh.getRange(2, snSnapCol + 1, extSnapSh.getLastRow() - 1, 1).getValues().forEach(function (r) { shipNoMax = Math.max(shipNoMax, shipNoSerial_(r[0])); });
}
var shipmentNo = shipmentNoPrefix + (shipNoMax + 1 < 1000 ? ('000' + (shipNoMax + 1)).slice(-4) : String(shipNoMax + 1));


var logisticsMap = (typeof shippingPlanSkuLogisticsMap_ === 'function') ? shippingPlanSkuLogisticsMap_(ss) : {};

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



function lineCbmFor_(rowVals) {
var lineTotal = plv(rowVals, 'cbm');
if (lineTotal !== '' && lineTotal != null) return shipmentNum_(lineTotal);
var perCarton = shipmentNum_(cartonCbmFor_(rowVals));
if (!perCarton) return '';
return Math.round(perCarton * shipmentNum_(planCartonQty(rowVals)) * 10000) / 10000;
}



var totalQty = 0, totalCartons = 0, totalCbm = 0, totalGross = 0, totalNet = 0, cbmUnknown = false, grossUnknown = false;
for (var t = 0; t < planLines.length; t++) {
totalQty += shipmentNum_(plv(planLines[t], 'approved_qty'));
totalCartons += shipmentNum_(planCartonQty(planLines[t]));
if (shipMeasureKnown15c_(lineCbmFor_(planLines[t]))) totalCbm += shipmentNum_(lineCbmFor_(planLines[t])); else cbmUnknown = true;   // R15C-AGL
if (shipMeasureKnown15c_(plv(planLines[t], 'gross_weight'))) totalGross += shipmentNum_(plv(planLines[t], 'gross_weight')); else grossUnknown = true;
totalNet += shipmentNum_(plv(planLines[t], 'net_weight'));
}




var pRateCardId = pv('rate_card_id');
var pShipMethod = pv('shipping_method');
var pLastMile = pv('last_mile_delivery');



var pCustomsType = shipmentCustomsType_(ss, pRateCardId, pv('customs_type'));


var pImportDutyTreatment = String(pv('import_duty_treatment') || '').trim();







var exact = shipmentExactRateAndCost_(ss, {
planRateCardId: pRateCardId,
carrierId: String(pv('carrier_id') || '').trim(),
country: pv('country'),
marketplace: pv('marketplace'),
shippingMethod: pShipMethod,
lastMile: pLastMile,
importDutyTreatment: pImportDutyTreatment,
destinationWarehouseCode: '',
quoteDate: today,
grossWeightKg: grossUnknown ? '' : totalGross,
cbm: cbmUnknown ? '' : totalCbm,
cartons: totalCartons,
totalQty: totalQty,
lines: planLines.map(function (lr) { return { sku: String(plv(lr, 'sku') || '').trim(), qty: shipmentNum_(plv(lr, 'approved_qty')) }; })
});
var rateReviewNote = exact.splitRequired
? ('[RATE REVIEW — SPLIT SHIPMENT @' + now + '] Combined (MULTI-marketplace) shipment has no single carrier_rate_card that applies to the whole shipment (only per-marketplace cards exist). Split the shipment by marketplace — do NOT average/merge rate cards. Estimated Cost = Not Applied; carrier NOT auto-switched.')
: (exact.rateReview && exact.costUnknown ? ('[RATE REVIEW @' + now + '] Shipment ' + exact.costUnknown + ' is unknown - Estimated Cost = Not Applied (never priced as 0); fill it, then choose the rate card.') : exact.rateReview ? ('[RATE REVIEW @' + now + '] No exact carrier_rate_card matched the shipment route — Estimated Cost = Not Applied; resolve a rate card before Approve/Ship (carrier NOT auto-switched).') : '');


// R69+SHIPNO-CAND1: pre-write uniqueness - a FRESH read of shipments (still inside fcLock) right before the append. A row holding
// this number already (a writer that does not take the lock, a manual edit) refuses: nothing has been written yet.
var snTaken = -1;
try { var snU = shipmentReadSheet_(shipmentSheet), snUCol = snU.col('shipment_no'); snTaken = 0; for (var snJ = 1; snUCol !== -1 && snJ < snU.rows.length; snJ++) if (String(snU.rows[snJ][snUCol] == null ? '' : snU.rows[snJ][snUCol]).trim().toUpperCase() === shipmentNo) snTaken++; }
catch (eSn) { fcUnlock_(); return { created: false, reason: 'SHIPMENT_NO_CHECK_FAILED', shipment_no: shipmentNo, shipping_plan_id: planId, error: String(eSn && eSn.message ? eSn.message : eSn) }; }
if (snTaken) { fcUnlock_(); return { created: false, reason: 'SHIPMENT_NO_NOT_UNIQUE', shipment_no: shipmentNo, shipping_plan_id: planId,
message: 'Shipment No. ' + shipmentNo + ' is already on a shipments row. No Shipment Draft was created and nothing was written; retry to take the next number.' }; }
shipmentAppendByHeader_(shipmentSheet, {
shipment_id: shipmentId,
shipment_no: shipmentNo,
external_shipment_id: externalShipmentId,
shipping_plan_id: planId,
company: pv('company'),
country: pv('country'),
marketplace: pv('marketplace'),
ship_from: pv('ship_from'),
source_warehouse_id: pv('source_warehouse_id'),
destination: pv('destination'),
destination_warehouse_id: pv('destination_warehouse_id'),
destination_type: pv('destination_type'),
shipping_method: pShipMethod,
last_mile_delivery: pLastMile,
shipments_customs_type: pCustomsType,
import_duty_treatment: pImportDutyTreatment,
carrier_id: pv('carrier_id'),
rate_card_id: exact.rateCardId || '',
currency: exact.currency || pv('currency'),
status: 'draft',
shipment_total_qty: totalQty,
shipment_total_cartons: totalCartons,
shipment_total_cbm: cbmUnknown ? '' : shipmentNum_(Math.round(totalCbm * 10000) / 10000),   // R15C-AGL: unknown stays blank
shipment_total_gross_weight: grossUnknown ? '' : shipmentNum_(Math.round(totalGross * 1000) / 1000),
shipment_total_net_weight: shipmentNum_(Math.round(totalNet * 1000) / 1000),
estimated_freight_cost: exact.estimatedFreightCost,
estimated_duty: exact.estimatedDuty, estimated_duty_currency: exact.estimatedDutyCurrency || '',
estimated_customs_fee: exact.estimatedCustomsFee,
estimated_total_cost: exact.estimatedTotalCost,
estimated_unit_cost: exact.estimatedUnitCost,
note: rateReviewNote,
created_by: actor,
created_at: now,
updated_by: actor,
updated_at: now
});
fcJournalRow_(shipmentSheet);


var lineCount = 0;
for (var j = 0; j < planLines.length; j++) {
var lr = planLines[j];
var rsLineId = 'SHL-' + Utilities.getUuid().substring(0, 10).toUpperCase(); rsLineIds.push(rsLineId);   // INT-CAND7: the identity a rollback requires
shipmentAppendByHeader_(shipmentLineSheet, {
shipment_line_id: rsLineId,
shipment_id: shipmentId,
sku: plv(lr, 'sku'),
shipment_qty: shipmentNum_(plv(lr, 'approved_qty')),


shipping_plan_line_id: plv(lr, 'shipping_plan_line_id'),
shipment_carton_qty: shipmentNum_(planCartonQty(lr)),
units_per_carton: shipmentNum_(plv(lr, 'units_per_carton')),


shipment_carton_cbm: lineCbmFor_(lr),
gross_weight: (plv(lr, 'gross_weight') === '' || plv(lr, 'gross_weight') == null) ? '' : plv(lr, 'gross_weight'),
net_weight: (plv(lr, 'net_weight') === '' || plv(lr, 'net_weight') == null) ? '' : plv(lr, 'net_weight'),
note: plv(lr, 'note'),
created_at: now,
updated_at: now,

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
fcJournalRow_(shipmentLineSheet);
lineCount++;
}






var reservationSummary = [];
// INT-CAND7: the ledger's last row BEFORE this creation's first reservation write (prior-state evidence for a rollback; one getLastRow)
var rsMovStart = (needSkus.length && srcSheets && srcSheets.movSheet) ? srcSheets.movSheet.getLastRow() : 0;
if (needSkus.length) {
try {
for (var ra = 0; ra < needSkus.length; ra++) {
var acq = shipmentDomainAcquire_(srcDomain, srcSheets, {
warehouseId: srcWarehouseId, sku: needSkus[ra], qty: needBySku[needSkus[ra]], ownerId: shipmentId,
journal: fcJournal, now: now, movementDate: today, createdBy: actor,
note: 'Reserved for Shipment Draft ' + shipmentId + ' (shipping plan ' + planId + ')'
});
rsMovIds[needSkus[ra]] = acq.movementId || '';   // INT-CAND7: the ledger row's own id, the identity a rollback requires
reservationSummary.push({ sku: needSkus[ra], warehouse_id: srcWarehouseId, source_domain: srcDomain,
reserved_qty: needBySku[needSkus[ra]], applied: acq.applied, reason: acq.reason });
}
} catch (eRes) {
// INT-CAND5 (local candidate): decide BEFORE touching anything whether the journal covers every write that landed. A write that landed and
// then threw before it was journaled cannot be undone by the journal: rolling back would delete the draft and leave its reservation behind.
// INT-CAND7: the stock row's metadata cells count as landed writes too (F2); the rollback itself is staged and identity-checked (F1).
var rsPr = null, rsWhy = [], rsDom = srcDomain === SHIPMENT_DOMAIN_OVERSEAS_ ? 'overseas' : 'factory', rsErr = String(eRes && eRes.message ? eRes.message : eRes);
try { rsPr = shipmentReservationProbe_(srcDomain, srcSheets, srcWarehouseId, needSkus, shipmentId, fcJournal); } catch (ePr) { rsWhy.push('PROBE_FAILED: ' + String(ePr && ePr.message ? ePr.message : ePr)); }
if (rsPr) {
if (rsPr.unjournaled.length) rsWhy.push('LEDGER_ROW_NOT_JOURNALED rows ' + rsPr.unjournaled.join(','));
needSkus.forEach(function (k) { var c = rsPr.cells[k], b = rsPre[k] || {}, mb = rsMeta[k] || {}; if (!c) { rsWhy.push('STOCK_ROW_NOT_FOUND:' + k); return; }
if (!c.resCovered && c.res !== b.reserved) rsWhy.push('RESERVED_CELL_NOT_JOURNALED:' + k + ' ' + b.reserved + '->' + c.res);
if (c.availCol !== -1 && !c.availCovered && c.avail !== b.available) rsWhy.push('AVAILABLE_CELL_NOT_JOURNALED:' + k + ' ' + b.available + '->' + c.avail);
c.meta.forEach(function (m) { if (!m.covered && m.val !== mb[m.name]) rsWhy.push('META_CELL_NOT_JOURNALED:' + k + ' ' + m.name + ' ' + mb[m.name] + '->' + m.val); });
});
}
if (rsWhy.length) {
fcUnlock_();
return { created: false, reason: 'RESERVATION_OUTCOME_UNKNOWN', shipment_id: shipmentId, shipment_no: shipmentNo, shipping_plan_id: planId,
source_warehouse_id: srcWarehouseId, source_domain: srcDomain, observed: rsWhy.slice(0, 20), held: rsPr ? rsPr.held : null, reservations_before_error: reservationSummary, draft_kept: true,
error: rsErr,
message: 'Reserving ' + rsDom + ' stock for Shipment ' + shipmentNo + ' failed after a write had already landed (' + rsWhy.slice(0, 3).join('; ') + '). Nothing was rolled back and nothing was retried: the draft, its lines and every write that landed are kept together; creating the draft again only re-checks it (read-only). ' + shipmentReservationReviewText_() };
}
var rsRb = shipmentStagedRollback_(ss, { domain: srcDomain, sheets: srcSheets, wh: srcWarehouseId, skus: needSkus, need: needBySku, sid: shipmentId, shipmentNo: shipmentNo,
journal: fcJournal, pre: rsPre, meta: rsMeta, probe: rsPr, movIds: rsMovIds, lineIds: rsLineIds, movStart: rsMovStart, headerSheet: shipmentSheet, lineSheet: shipmentLineSheet });
fcUnlock_();
if (!rsRb.verified) return { created: false, reason: 'RESERVATION_ROLLBACK_UNVERIFIED', shipment_id: shipmentId, shipment_no: shipmentNo, shipping_plan_id: planId,
source_warehouse_id: srcWarehouseId, source_domain: srcDomain, rollback_phase: rsRb.phase, rollback_stopped: rsRb.stopped, stock_restored: rsRb.stockRestored, draft_kept: rsRb.draftKept,
left: rsRb.left.slice(0, 20), error: rsErr,
message: 'Reserving ' + rsDom + ' stock failed and the rollback could not be proven complete (' + rsRb.left.slice(0, 3).join('; ') + '). ' + (rsRb.stockRestored
? 'The stock cells and ledger rows of this creation were restored and verified by a fresh read; ' + (rsRb.draftKept ? 'Shipment ' + shipmentNo + ' is still on the sheet. ' : 'what is left of the draft is named above. ')
: 'Shipment ' + shipmentNo + ', its lines and every stock or ledger write not proven undone are KEPT (nothing more was deleted once a check failed). ') + 'Nothing was retried. ' + shipmentReservationReviewText_() };
return { created: false, reason: 'RESERVATION_FAILED', shipping_plan_id: planId, verified: true,
source_warehouse_id: srcWarehouseId,
error: rsErr,
message: 'The Shipment Draft could not reserve ' + rsDom + ' stock and was rolled back. Nothing was created ' +
'and no stock was reserved (checked by a fresh read). The approved plan remains recoverable.' };
}
}





function setPlanCell_(name, value) {
var c = p.col(name);
if (c === -1 || planRowIndex === -1) return;
fcJournal.push({ kind: 'cell', sheet: planSheet, row: planRowIndex, col: c, prev: planRow[c] });
planSheet.getRange(planRowIndex, c + 1).setValue(value);
}
setPlanCell_('transferred_to_shipment_at', now);
setPlanCell_('transferred_shipment_id', shipmentId);
setPlanCell_('updated_at', (cspOpts_ && cspOpts_.planJustStamped ? editKeepStamp_ : editNextStamp_)(now, [planRow && p.col('updated_at') !== -1 ? planRow[p.col('updated_at')] : '']));   // R71 small-4 (re-review D.keep): keep only inside the approve (this request just stamped the row); the standalone retry bumps strictly

try {
  if (sc13Policy_().mode !== 'SEPARATE') {
    sc13RegisterLocked_(ss, shipmentId, planId, actor, now);
  }
} catch (sc13LinkError) {
  fcUnlock_(); return { created: false, reason: 'CONSOLIDATION_REGISTRATION_UNKNOWN', outcome: 'UNKNOWN', shipment_id: shipmentId,
    shipping_plan_id: planId, zero_write: false, retry_safe: false, error: String(sc13LinkError.message || sc13LinkError) };
}
fcUnlock_();
return { created: true, shipment_id: shipmentId, shipment_no: shipmentNo, line_count: lineCount,
source_warehouse_id: srcWarehouseId, factory_reservations: reservationSummary };
}













var SHIPMENT_DOMAIN_FACTORY_ = 'FACTORY';
var SHIPMENT_DOMAIN_OVERSEAS_ = 'OVERSEAS';


function shipmentSourceDomain_(ss, warehouseId) {
if (typeof ovsReadWarehouseRecord_ !== 'function' || typeof ovsWarehouseSourceDomain_ !== 'function') {
return SHIPMENT_DOMAIN_FACTORY_;
}
try {
var rec = ovsReadWarehouseRecord_(ss, warehouseId);
if (!rec) return SHIPMENT_DOMAIN_FACTORY_;
return ovsWarehouseSourceDomain_(rec) === SHIPMENT_DOMAIN_OVERSEAS_
? SHIPMENT_DOMAIN_OVERSEAS_ : SHIPMENT_DOMAIN_FACTORY_;
} catch (e) { return SHIPMENT_DOMAIN_FACTORY_; }
}


function shipmentDomainSheets_(ss, domain) {
if (domain === SHIPMENT_DOMAIN_OVERSEAS_) {
var snap = ss.getSheetByName('overseas_inventory_snapshot');
if (!snap) return null;
var mov = (typeof fcWriteEnsureSheet_ === 'function')
? fcWriteEnsureSheet_(ss, 'overseas_inventory_movements', OVS_MOVEMENT_HEADERS_FOR_SHIPMENT_)
: ss.getSheetByName('overseas_inventory_movements');
if (!mov) return null;
return { domain: domain, stockSheet: snap, movSheet: mov };
}
var stk = ss.getSheetByName('factory_stock');
if (!stk) return null;
return { domain: domain, stockSheet: stk, movSheet: null };
}


var OVS_MOVEMENT_HEADERS_FOR_SHIPMENT_ = [
'movement_id', 'movement_date', 'warehouse_id', 'sku', 'site_sku',
'movement_type', 'movement_scope', 'from_stock_type', 'to_stock_type',
'wh_quantity', 'wh_quantity_before', 'wh_quantity_after',
'wh_before_physical_stock', 'wh_after_physical_stock',
'wh_before_reserved_stock', 'wh_after_reserved_stock',
'wh_before_available_stock', 'wh_after_available_stock',
'reference_type', 'reference_id', 'source_module', 'created_by', 'created_at', 'note'
];







function shipmentDomainAvailable_(domain, sheets, warehouseId, sku) {
if (domain === SHIPMENT_DOMAIN_OVERSEAS_) {
var b = ovsStockReadBalanceTx_(sheets.stockSheet, warehouseId, sku);
return { available: ovsAllocatableTx_(b), current: '', reserved: b.reserved, found: b.found };
}
var f = factoryStockReadBalanceTx_(sheets.stockSheet, warehouseId, sku);
return { available: f.available, current: f.current, reserved: f.reserved, found: f.found };
}

function shipmentDomainHeld_(domain, sheets, shipmentId) {
if (domain === SHIPMENT_DOMAIN_OVERSEAS_) {
return ovsOwnerReservedTx_(sheets.movSheet, OVSTX_RESERVATION_OWNER_TYPE_, shipmentId);
}
return factoryStockOwnerReservedTx_(sheets.movSheet, FSTX_RESERVATION_OWNER_TYPE_, shipmentId);
}

// INT-CAND5 (local candidate): read-only, failure path only. For each needed key: the stock row's reserved cell (and the overseas
// available cell), and whether the journal covers it; every ledger row owned by `sid` that the journal does not cover; the held sums.
function shipmentReservationProbe_(domain, sheets, wh, skus, sid, journal) {
var ovs = domain === SHIPMENT_DOMAIN_OVERSEAS_, st = sheets.stockSheet.getDataRange().getValues(), hd = (st[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
var whC, skC, resC, avC = -1;
if (ovs) { var oc = ovsStockColsTx_(st[0]); whC = oc.wh; skC = oc.sku; resC = oc.res; avC = oc.avail; }
else { whC = hd.indexOf('warehouse_id'); skC = hd.indexOf('sku'); resC = hd.indexOf('fac_reserved_stock'); if (resC === -1) resC = hd.indexOf('reserved_stock'); }
if (whC === -1 || skC === -1 || resC === -1) throw new Error('STOCK_COLUMNS_MISSING');
function cov(sheet, row, col) { for (var i = 0; i < journal.length; i++) { var j = journal[i]; if (j.kind === 'cell' && j.sheet === sheet && j.row === row && j.col === col) return true; } return false; }
var mc = shipmentStockMetaCols_(domain, st[0]), cells = {};   // INT-CAND7 (F2): the metadata cells, and whether the journal covers them
skus.forEach(function (k) { for (var r = 1; r < st.length; r++) { if (String(st[r][whC] || '').trim() === wh && String(st[r][skC] || '').trim() === k) {
cells[k] = { row: r + 1, res: Math.round(parseFloat(st[r][resC]) || 0), resCovered: cov(sheets.stockSheet, r + 1, resC), availCol: avC,
avail: avC === -1 ? null : Math.round(parseFloat(st[r][avC]) || 0), availCovered: avC === -1 ? true : cov(sheets.stockSheet, r + 1, avC),
meta: mc.map(function (m) { return { name: m.name, col: m.col, val: shipmentCellKey_(st[r][m.col]), covered: cov(sheets.stockSheet, r + 1, m.col) }; }) }; return; } } });
var mv = sheets.movSheet.getDataRange().getValues(), mh = (mv[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
var idC = mh.indexOf(ovs ? 'reference_id' : 'related_entity_id'); if (idC === -1) throw new Error('LEDGER_OWNER_COLUMN_MISSING');
// INT-CAND7: coverage by COUNT - every ledger append of this creation journals exactly one row entry, so the shipment's own rows can exceed
// the journal's row entries only when an append landed without its entry; a row shifted by another writer is no longer mistaken for one.
var jr = {}, jn = 0; journal.forEach(function (j) { if (j.kind === 'row' && j.sheet === sheets.movSheet) { jr[j.row] = 1; jn++; } });
var own = []; for (var m = 1; m < mv.length; m++) if (String(mv[m][idC] || '').trim() === sid) own.push(m + 1);
var un = []; if (own.length > jn) { un = own.filter(function (x) { return !jr[x]; }); if (!un.length) un = own.slice(); }
return { cells: cells, unjournaled: un, owned: own, held: shipmentDomainHeld_(domain, sheets, sid) };
}

// INT-CAND5 (local candidate): after a journal rollback, what is still left (fresh read). [] = proven back to the state before the draft:
// no header and no line of `sid`, no ledger holding for it, and every needed key's reserved / available equal to the balance read before.
function shipmentRollbackLeft_(ss, domain, sheets, wh, skus, sid, pre) {
var left = [], sh = ss.getSheetByName('shipments'), ln = ss.getSheetByName('shipment_lines');
[[sh, 'HEADER'], [ln, 'LINE']].forEach(function (x) { if (!x[0]) return; var t = shipmentReadSheet_(x[0]), c = t.col('shipment_id'); for (var r = 1; c !== -1 && r < t.rows.length; r++) if (String(t.rows[r][c]).trim() === sid) left.push(x[1] + '_LEFT row ' + (r + 1)); });
var held = shipmentDomainHeld_(domain, sheets, sid); Object.keys(held).forEach(function (k) { if (held[k]) left.push('LEDGER_HOLDS ' + k + ' ' + held[k]); });
skus.forEach(function (k) { var b = shipmentDomainAvailable_(domain, sheets, wh, k), p = pre[k] || {}; if (b.reserved !== p.reserved || b.available !== p.available) left.push('BALANCE_NOT_RESTORED ' + k + ' reserved ' + b.reserved + ' (before ' + p.reserved + '), available ' + b.available + ' (before ' + p.available + ')'); });
return left;
}

// INT-CAND7 (local candidate): what every reservation failure message says instead of 'cancel and create again'.
function shipmentReservationReviewText_() {
return 'Do not cancel and create the draft again as a fix: Cancel Shipment Draft releases only what the reservation ledger holds; it does not correct a reserved / available stock cell that differs from the ledger, and a new draft would reserve on top of that difference. ' +
'Review this shipment with the read-only reservation reconcile first (TEMP_RRC_RUN for factory stock; it does not cover overseas stock - there compare overseas_inventory_snapshot with overseas_inventory_movements for this shipment by hand) before any further action.';
}

// INT-CAND7: a cell value as a comparable key (a Date by its time, anything else by its text).
function shipmentCellKey_(v) { return Object.prototype.toString.call(v) === '[object Date]' ? 'D' + v.getTime() : String(v == null ? '' : v); }

// INT-CAND7: the stock row's metadata cells a reservation writes besides reserved / available.
function shipmentStockMetaCols_(domain, headerRow) {
var H = (headerRow || []).map(function (h) { return String(h).trim().toLowerCase(); }), out = [];
function add(name, i) { if (i !== -1) out.push({ name: name, col: i }); }
if (domain === SHIPMENT_DOMAIN_OVERSEAS_) { add('last_movement_at', H.indexOf('last_movement_at')); add('updated_at', H.indexOf('updated_at')); return out; }
var cur = H.indexOf('fac_current_stock'); if (cur === -1) cur = H.indexOf('current_stock');
add('fac_current_stock', cur); add('last_transaction_at', H.indexOf('last_transaction_at')); add('updated_at', H.indexOf('updated_at'));
return out;
}

// INT-CAND7: { sku: { metadata name: value key } } for this warehouse's keys, from an already-read stock matrix.
function shipmentStockMeta_(domain, data, wh, skus) {
var mc = shipmentStockMetaCols_(domain, data[0]), C = shipmentStockKeyCols_(domain, data[0]), out = {};
if (C.wh === -1 || C.sku === -1) return out;
for (var r = 1; r < data.length; r++) { var k = String(data[r][C.sku] || '').trim();
if (String(data[r][C.wh] || '').trim() !== wh || skus.indexOf(k) < 0 || out[k]) continue;
out[k] = {}; mc.forEach(function (m) { out[k][m.name] = shipmentCellKey_(data[r][m.col]); }); }
return out;
}

// INT-CAND7: the stock key columns of either domain.
function shipmentStockKeyCols_(domain, headerRow) {
if (domain === SHIPMENT_DOMAIN_OVERSEAS_) { var o = ovsStockColsTx_(headerRow); return { wh: o.wh, sku: o.sku, res: o.res, avail: o.avail, cur: -1 }; }
var H = (headerRow || []).map(function (h) { return String(h).trim().toLowerCase(); });
var res = H.indexOf('fac_reserved_stock'); if (res === -1) res = H.indexOf('reserved_stock');
var cur = H.indexOf('fac_current_stock'); if (cur === -1) cur = H.indexOf('current_stock');
return { wh: H.indexOf('warehouse_id'), sku: H.indexOf('sku'), res: res, avail: -1, cur: cur };
}

// INT-CAND7: a read-only view of a stock matrix already read, for the 21_ / 05_ balance parsers (they only call getDataRange().getValues()).
function shipmentStockView_(sheets, data) {
return { domain: sheets.domain, movSheet: sheets.movSheet, stockSheet: { getDataRange: function () { return { getValues: function () { return data; } }; } } };
}

// INT-CAND7: the reservation ledger columns of either domain.
function shipmentLedgerCols_(ovs, headerRow) {
var H = (headerRow || []).map(function (h) { return String(h).trim().toLowerCase(); });
var q = ovs ? H.indexOf('wh_quantity') : H.indexOf('qty'); if (ovs && q === -1) q = H.indexOf('quantity');
var c = { owner: H.indexOf(ovs ? 'reference_id' : 'related_entity_id'), id: H.indexOf(ovs ? 'movement_id' : 'factory_stock_movement_id'), type: H.indexOf('movement_type'),
qty: q, wh: H.indexOf('warehouse_id'), sku: H.indexOf('sku'), width: H.length };
c.missing = ['owner', 'id', 'type', 'qty', 'wh', 'sku'].filter(function (n) { return c[n] === -1; }).join(',');
return c;
}

// INT-CAND7: '' when a ledger row is provably the acquire THIS creation wrote for `sku`, else what does not match.
function shipmentLedgerRowMismatch_(row, lc, o, sku) {
var acq = o.domain === SHIPMENT_DOMAIN_OVERSEAS_ ? OVSTX_MOV_RESERVE_ACQUIRE_ : FSTX_MOV_RESERVE_ACQUIRE_, want = String(o.movIds[sku] || '');
if (String(row[lc.owner] || '').trim() !== o.sid) return 'OWNER';
if (String(row[lc.wh] || '').trim() !== o.wh || o.skus.indexOf(sku) < 0) return 'KEY';
if (String(row[lc.type] || '').trim() !== acq) return 'TYPE';
if (Math.round(parseFloat(row[lc.qty]) || 0) !== Math.round(Number(o.need[sku]) || 0)) return 'QTY';
if (!want) return 'MOVEMENT_ID_NOT_CAPTURED';
if (String(row[lc.id] || '').trim() !== want) return 'MOVEMENT_ID';
return '';
}

// INT-CAND7: the value THIS creation wrote into a journaled stock cell (null = cannot be known): reserved = before + need; overseas
// available = before - need; factory current = unchanged; metadata = the value the probe read right after the failure (inside the lock).
function shipmentWrittenValue_(o, sc, j, sku) {
var n = Math.round(Number(o.need[sku]) || 0), prev = Math.round(parseFloat(j.prev) || 0);
if (j.col === sc.res) return String(prev + n);
if (j.col === sc.avail) return String(prev - n);
if (j.col === sc.cur) return shipmentCellKey_(j.prev);
var c = o.probe && o.probe.cells[sku]; if (!c) return null;
for (var i = 0; i < c.meta.length; i++) if (c.meta[i].col === j.col) return c.meta[i].val;
return null;
}

// INT-CAND7: the first data row (1-based) holding `value` in column `col`, or -1. A fresh read.
function shipmentRowOfValue_(sheet, col, value) {
var d = sheet.getDataRange().getValues(); for (var r = 1; r < d.length; r++) if (String(d[r][col] == null ? '' : d[r][col]).trim() === value) return r + 1; return -1;
}

// INT-CAND7: after phase A, what is still not back (fresh read): a ledger row of the shipment, a key whose reserved / available or
// metadata differs from the values read before the reservation. [] = phase A verified.
function shipmentPhaseALeft_(o) {
var left = [], sh = o.sheets, ovs = o.domain === SHIPMENT_DOMAIN_OVERSEAS_;
try {
var mv = sh.movSheet.getDataRange().getValues(), lc = shipmentLedgerCols_(ovs, mv[0]);
for (var m = 1; m < mv.length; m++) if (String(mv[m][lc.owner] || '').trim() === o.sid) left.push('LEDGER_ROW_LEFT row ' + (m + 1) + ' ' + String(mv[m][lc.sku] || '').trim());
for (var mi = Math.max(1, o.movStart || 0); mi < mv.length; mi++) { var ow = String(mv[mi][lc.owner] || '').trim(), mk = String(mv[mi][lc.sku] || '').trim();
if (ow !== o.sid && String(mv[mi][lc.wh] || '').trim() === o.wh && o.skus.indexOf(mk) >= 0) left.push('INTERVENING_LEDGER_WRITE row ' + (mi + 1) + ' ' + mk + ' owner ' + ow); }
var st = sh.stockSheet.getDataRange().getValues(), view = shipmentStockView_(sh, st), meta = shipmentStockMeta_(o.domain, st, o.wh, o.skus);
o.skus.forEach(function (k) { var b = shipmentDomainAvailable_(o.domain, view, o.wh, k), p = o.pre[k] || {};
if (b.reserved !== p.reserved || b.available !== p.available) left.push('BALANCE_NOT_RESTORED ' + k + ' reserved ' + b.reserved + ' (before ' + p.reserved + '), available ' + b.available + ' (before ' + p.available + ')');
var pm = o.meta[k] || {}, nm = meta[k] || {}; Object.keys(pm).forEach(function (n) { if (nm[n] !== pm[n]) left.push('META_NOT_RESTORED ' + k + ' ' + n + ' ' + nm[n] + ' (before ' + pm[n] + ')'); }); });
} catch (e) { left.push('VERIFY_READ_FAILED: ' + String(e && e.message ? e.message : e)); }
return left;
}

// INT-CAND7 (local candidate): the STAGED rollback of ONE failed creation. Phase A (stock + ledger) must be verified by a fresh read before
// phase B (lines, then the header) may start; every target is proven before any write, re-read before its write, and checked after a
// delete; any evidence of another writer STOPS the rollback (no guessing, no further deletes). Not atomic: Apps Script has no
// check-and-delete, and the script lock excludes only writers that take the same lock (see INT_CAND7.md).
// -> { verified, phase, stopped, stockRestored, draftKept, left }
function shipmentStagedRollback_(ss, o) {
var out = { verified: false, phase: 'NOT_STARTED', stopped: false, stockRestored: false, draftKept: true, left: [] };
var ovs = o.domain === SHIPMENT_DOMAIN_OVERSEAS_, sh = o.sheets;
function msg(e) { return String(e && e.message ? e.message : e); }
function stop(why) { out.stopped = true; out.left = out.left.concat(why); return false; }
// 0. every journal entry is classified BEFORE anything is touched; an entry this rollback does not own stops it
var cells = [], jMov = [], jHdr = [], jLin = [], other = [];
o.journal.forEach(function (j) {
if (j.kind === 'cell' && j.sheet === sh.stockSheet) cells.push(j);
else if (j.kind === 'row' && j.sheet === sh.movSheet) jMov.push(j.row);
else if (j.kind === 'row' && j.sheet === o.headerSheet) jHdr.push(j.row);
else if (j.kind === 'row' && j.sheet === o.lineSheet) jLin.push(j.row);
else { var nm = ''; try { nm = j.sheet.getName(); } catch (eN) {} other.push('JOURNAL_ENTRY_NOT_HANDLED ' + j.kind + ' ' + nm + ' row ' + j.row); }
});
if (other.length) { stop(other); return out; }
function phaseA() {
out.phase = 'A_STOCK_AND_LEDGER';
var mv, st;
try { mv = sh.movSheet.getDataRange().getValues(); st = sh.stockSheet.getDataRange().getValues(); } catch (eR) { return stop(['ROLLBACK_READ_FAILED: ' + msg(eR)]); }
var lc = shipmentLedgerCols_(ovs, mv[0]), sc = shipmentStockKeyCols_(o.domain, st[0]), bad = [], rows = [], perKey = {};
if (lc.missing) return stop(['LEDGER_COLUMNS_MISSING ' + lc.missing]);
if (sc.wh === -1 || sc.sku === -1 || sc.res === -1) return stop(['STOCK_COLUMNS_MISSING']);
// A0 prove every ledger target: owner + key + type + qty + the movement id this creation wrote; at most one per key
for (var m = 1; m < mv.length; m++) { if (String(mv[m][lc.owner] || '').trim() !== o.sid) continue;
var sk = String(mv[m][lc.sku] || '').trim(), why = shipmentLedgerRowMismatch_(mv[m], lc, o, sk);
perKey[sk] = (perKey[sk] || 0) + 1; if (perKey[sk] > 1) why = why || 'MORE_THAN_ONE_ROW_FOR_KEY';
if (why) bad.push('LEDGER_ROW_NOT_PROVEN row ' + (m + 1) + ' ' + sk + ': ' + why); else rows.push({ row: m + 1, sku: sk, id: String(mv[m][lc.id] || '').trim() }); }
// A0 prior-state evidence: a ledger row on one of OUR keys appended after this creation's first reservation write by anyone else = another
// writer in the window (an A->B->A on a cell cannot be seen by value alone) -> STOP, lineage kept
for (var mi = Math.max(1, o.movStart || 0); mi < mv.length; mi++) { var ow = String(mv[mi][lc.owner] || '').trim(), mk = String(mv[mi][lc.sku] || '').trim();
if (ow !== o.sid && String(mv[mi][lc.wh] || '').trim() === o.wh && o.skus.indexOf(mk) >= 0) bad.push('INTERVENING_LEDGER_WRITE row ' + (mi + 1) + ' ' + mk + ' owner ' + ow); }
// A0 prove every stock cell: a row of this warehouse / key, holding its prior value (nothing to undo) or exactly what this creation wrote
var plan = [];
for (var i = cells.length - 1; i >= 0; i--) { var j = cells[i], rv = st[j.row - 1] || null, k = rv ? String(rv[sc.sku] || '').trim() : '';
if (!rv || String(rv[sc.wh] || '').trim() !== o.wh || o.skus.indexOf(k) < 0) { bad.push('STOCK_ROW_NOT_PROVEN row ' + j.row); continue; }
if (!o.probe || !o.probe.cells[k] || o.probe.cells[k].row !== j.row) { bad.push('STOCK_ROW_NOT_THE_JOURNALED_KEY row ' + j.row + ' ' + k + ' (the key was found at row ' + (o.probe && o.probe.cells[k] ? o.probe.cells[k].row : '?') + ')'); continue; }   // INT-CAND7 r3 (F-B7-1): bound to its key
var now0 = shipmentCellKey_(rv[j.col]), prev = shipmentCellKey_(j.prev), wrote = shipmentWrittenValue_(o, sc, j, k);
if (now0 === prev) continue;
if (wrote === null || now0 !== wrote) { bad.push('STOCK_CELL_CHANGED_BY_ANOTHER_WRITER ' + k + ' row ' + j.row + ' col ' + (j.col + 1) + ': now ' + now0 + ', this creation wrote ' + wrote + ', before ' + prev); continue; }
plan.push({ j: j, k: k, wrote: wrote }); }
if (bad.length) return stop(bad);
// A1 ledger rows newest first: re-read right before the delete, then the movement id must be gone
rows.sort(function (a, b) { return b.row - a.row; });
var failedKeys = {};
for (var x = 0; x < rows.length; x++) { var R = rows[x];
var cur;
try { cur = sh.movSheet.getRange(R.row, 1, 1, lc.width).getValues()[0]; } catch (eQ) { return stop(['LEDGER_REREAD_FAILED row ' + R.row + ': ' + msg(eQ)]); }
if (String(cur[lc.owner] || '').trim() !== o.sid || String(cur[lc.id] || '').trim() !== R.id) return stop(['LEDGER_ROW_MOVED_BEFORE_DELETE row ' + R.row + ' (movement ' + R.id + ' is no longer there; nothing deleted)']);
// INT-CAND7 r3 (F-B7-2): a delete that throws is classified by re-searching the movement id - it may have landed
var lr0 = -1; try { lr0 = sh.movSheet.getLastRow(); } catch (eL0) {}
var dE = null; try { sh.movSheet.deleteRow(R.row); } catch (eD) { dE = eD; }
if (dE) { var gL = -2; try { gL = shipmentRowOfValue_(sh.movSheet, lc.id, R.id); } catch (eS) { return stop(['LEDGER_DELETE_OUTCOME_UNKNOWN row ' + R.row + ' ' + R.sku + ' (' + msg(dE) + '; the re-read failed: ' + msg(eS) + ')']); }
if (gL === R.row && lr0 !== -1 && sh.movSheet.getLastRow() === lr0 - 1) return stop(['A_ROW_WAS_DELETED_BUT_NOT_OURS row ' + R.row + ' ' + R.sku + ' (ours is still there, the sheet is one row shorter)']);   // INT-CAND7 r4 (F-R3-9)
if (gL === R.row) { failedKeys[R.sku] = 1; out.left.push('LEDGER_DELETE_OUTCOME_UNKNOWN row ' + R.row + ' ' + R.sku + ' (the delete threw and ours is still there: either nothing was deleted, or a row another writer inserted here during the delete was deleted instead - indistinguishable): ' + msg(dE)); continue; }
if (gL !== -1) return stop(['LEDGER_DELETE_OUTCOME_UNKNOWN row ' + R.row + ' ' + R.sku + ' (movement ' + R.id + ' is now at row ' + gL + ')']);
out.left.push('LEDGER_DELETE_LANDED_THEN_THREW row ' + R.row + ' ' + R.sku + ' (movement ' + R.id + ' is gone: treated as deleted): ' + msg(dE)); continue; }
var still = -1; try { still = shipmentRowOfValue_(sh.movSheet, lc.id, R.id); } catch (eA) { return stop(['LEDGER_AFTER_DELETE_READ_FAILED: ' + msg(eA)]); }
if (still !== -1) return stop(['LEDGER_ROW_SHIFTED_DURING_DELETE: row ' + R.row + ' was deleted but movement ' + R.id + ' is now at row ' + still + ' - the deleted row belonged to another writer']);
}
// A2 cells: re-read right before the restore; restored only while equal to what this creation wrote. A key whose ledger row could not
// be removed keeps its cells too, so that key's cell and ledger still agree.
var kept = {};
for (var y = 0; y < plan.length; y++) { var P = plan[y];
if (failedKeys[P.k]) { kept[P.k] = 1; continue; }
// INT-CAND7 r3 (F-B7-1): the WHOLE row is re-read; its warehouse + sku must still be the journaled key (a row shifted onto another key with
// equal values is never overwritten), and the cell must still hold what this creation wrote
var c1, rw1;
try { rw1 = sh.stockSheet.getRange(P.j.row, 1, 1, st[0].length).getValues()[0]; c1 = shipmentCellKey_(rw1[P.j.col]); } catch (eC) { return stop(['STOCK_REREAD_FAILED ' + P.k + ': ' + msg(eC)]); }
if (String(rw1[sc.wh] || '').trim() !== o.wh || String(rw1[sc.sku] || '').trim() !== P.k) return stop(['STOCK_ROW_MOVED_BEFORE_RESTORE row ' + P.j.row + ' (expected ' + o.wh + '||' + P.k + ', found ' + String(rw1[sc.wh] || '') + '||' + String(rw1[sc.sku] || '') + '; not overwritten)']);
if (c1 !== P.wrote) return stop(['STOCK_CELL_CHANGED_BY_ANOTHER_WRITER ' + P.k + ' row ' + P.j.row + ' col ' + (P.j.col + 1) + ': now ' + c1 + ', this creation wrote ' + P.wrote + ' (not overwritten)']);
try { sh.stockSheet.getRange(P.j.row, P.j.col + 1).setValue(P.j.prev); } catch (eW) {
var c2 = null; try { c2 = shipmentCellKey_(sh.stockSheet.getRange(P.j.row, P.j.col + 1).getValue()); } catch (eQ) {}
if (c2 !== shipmentCellKey_(P.j.prev)) out.left.push('STOCK_CELL_RESTORE_FAILED ' + P.k + ' col ' + (P.j.col + 1) + ': ' + msg(eW) + (P.j.col === sc.res ? ' - CELL_ABOVE_LEDGER ' + o.wh + '||' + P.k + ' (its ledger row was already removed: an unattributed reservation - review with the read-only reconcile)' : ''));
}
// INT-CAND7 r4 (F-R3-8): the row key re-read AFTER the restore - a row that moved inside the write window means a foreign cell may have been written
var rw2; try { rw2 = sh.stockSheet.getRange(P.j.row, 1, 1, st[0].length).getValues()[0]; } catch (eA2) { return stop(['AFTER_RESTORE_READ_FAILED row ' + P.j.row + ': ' + msg(eA2)]); }
if (String(rw2[sc.wh] || '').trim() !== o.wh || String(rw2[sc.sku] || '').trim() !== P.k) return stop(['FOREIGN_CELL_MAY_HAVE_BEEN_WRITTEN row ' + P.j.row + ' col ' + (P.j.col + 1) + ' (value ' + shipmentCellKey_(P.j.prev) + '): the row now holds ' + String(rw2[sc.wh] || '') + '||' + String(rw2[sc.sku] || '')]);
}
Object.keys(kept).forEach(function (k) { out.left.push('KEPT_WITH_ITS_LEDGER_ROW ' + k + ' (its ledger row could not be removed, so its cells were not restored: cell and ledger still agree)'); });
try { SpreadsheetApp.flush(); } catch (eF) { out.left.push('FLUSH_FAILED: ' + msg(eF)); }
// A3 a fresh read must prove it
var va = shipmentPhaseALeft_(o);
if (va.length) { out.left = out.left.concat(va); return false; }
out.stockRestored = true; out.left = []; return true;
}
function phaseB() {
out.phase = 'B_LINES_AND_HEADER';
var lt, ht;
try { lt = shipmentReadSheet_(o.lineSheet); ht = shipmentReadSheet_(o.headerSheet); } catch (eR) { return stop(['DRAFT_READ_FAILED: ' + msg(eR)]); }
var lS = lt.col('shipment_id'), lI = lt.col('shipment_line_id'), hS = ht.col('shipment_id'), hN = ht.col('shipment_no'), bad = [], lines = [], hdr = [];
if (lS === -1 || lI === -1 || hS === -1 || hN === -1) return stop(['DRAFT_ID_COLUMNS_MISSING']);
// B0 prove every target: each line carries one of THIS creation's line ids, exactly one header carries this id AND number
for (var r = 1; r < lt.rows.length; r++) { if (String(lt.rows[r][lS] || '').trim() !== o.sid) continue; var li = String(lt.rows[r][lI] || '').trim();
if (o.lineIds.indexOf(li) < 0) bad.push('LINE_ROW_NOT_PROVEN row ' + (r + 1) + ' ' + li); else lines.push({ row: r + 1, id: li }); }
for (var h = 1; h < ht.rows.length; h++) { if (String(ht.rows[h][hS] || '').trim() !== o.sid) continue;
if (String(ht.rows[h][hN] || '').trim().toUpperCase() !== String(o.shipmentNo || '').trim().toUpperCase()) bad.push('HEADER_ROW_NOT_PROVEN row ' + (h + 1)); else hdr.push({ row: h + 1, id: o.sid }); }
if (hdr.length > 1) bad.push('MORE_THAN_ONE_HEADER ' + hdr.length);
if (bad.length) return stop(bad);
function del(sheet, idCol, t, label) {
t.sort(function (a, b) { return b.row - a.row; });
for (var q = 0; q < t.length; q++) {
var v;
try { v = String(sheet.getRange(t[q].row, idCol + 1).getValue() || '').trim(); } catch (eQ) { return stop([label + '_LEFT row ' + t[q].row + ' (REREAD_FAILED: ' + msg(eQ) + ')']); }
if (v !== t[q].id) return stop([label + '_ROW_MOVED_BEFORE_DELETE row ' + t[q].row + ' (nothing deleted)']);
var lr2 = -1; try { lr2 = sheet.getLastRow(); } catch (eL2) {}
var dE2 = null; try { sheet.deleteRow(t[q].row); } catch (eD) { dE2 = eD; }
if (dE2) { var g0 = -2; try { g0 = shipmentRowOfValue_(sheet, idCol, t[q].id); } catch (eS) { return stop([label + '_DELETE_OUTCOME_UNKNOWN row ' + t[q].row + ' (' + msg(dE2) + '; the re-read failed: ' + msg(eS) + ')']); }
if (g0 === t[q].row && lr2 !== -1 && sheet.getLastRow() === lr2 - 1) return stop([label + '_A_ROW_WAS_DELETED_BUT_NOT_OURS row ' + t[q].row + ' (ours is still there, the sheet is one row shorter)']);   // INT-CAND7 r4 (F-R3-9)
if (g0 === t[q].row) return stop([label + '_LEFT row ' + t[q].row + ' (DELETE_OUTCOME_UNKNOWN: the delete threw and ours is still there - either nothing was deleted, or a row another writer inserted here during the delete was deleted instead: ' + msg(dE2) + ')']);
if (g0 !== -1) return stop([label + '_DELETE_OUTCOME_UNKNOWN row ' + t[q].row + ' (now at row ' + g0 + ')']);
out.left.push(label + '_GONE_AFTER_ERROR row ' + t[q].row + ' (' + msg(dE2) + ')'); continue; }   // INT-CAND7 r3 (F-B7-6)
var still = -1; try { still = shipmentRowOfValue_(sheet, idCol, t[q].id); } catch (eA) { return stop([label + '_AFTER_DELETE_READ_FAILED: ' + msg(eA)]); }
if (still !== -1 && label === 'LINE') return stop(['LINE_ROW_SHIFTED_DURING_DELETE: row ' + t[q].row + ' was deleted but line ' + t[q].id + ' is now at row ' + still + ' - the deleted row belonged to another writer']);
if (still !== -1) return stop(['HEADER_ROW_SHIFTED_DURING_DELETE: row ' + t[q].row + ' was deleted but the header is now at row ' + still + ' - the deleted row belonged to another writer']);
}
return true;
}
if (!del(o.lineSheet, lI, lines, 'LINE')) { out.left.push('HEADER_KEPT (the lines could not all be removed)'); return false; }
if (!del(o.headerSheet, hS, hdr, 'HEADER')) return false;
var fin; try { fin = shipmentRollbackLeft_(ss, o.domain, sh, o.wh, o.skus, o.sid, o.pre); } catch (eV) { fin = ['VERIFY_READ_FAILED: ' + msg(eV)]; }
if (fin.length) { out.left = out.left.concat(fin); return false; }
return true;
}
if (phaseA() && phaseB()) out.verified = true;
try { out.draftKept = shipmentRowOfValue_(o.headerSheet, shipmentReadSheet_(o.headerSheet).col('shipment_id'), o.sid) !== -1; } catch (eK) { out.draftKept = true; }
return out;
}

// INT-CAND7 r4 (review B7R3 F-R3-1..F-R3-6): a CHECKED, VALUE-PROVEN replay for the rollback paths that are not staged (cancel, the factory
// source change, Confirm & Dispatch). Not a staged rollback, not atomic (INT_CAND7_R4.md). Before ANY write a read-only preflight: a write of
// this operation that landed but was never journaled, or another writer's ledger row on one of its keys after its start mark -> STOP, nothing
// undone. Then cells (except o.lastSheets), rows, and the o.lastSheets cells LAST (the shipment status = the commit marker).
//   a cell: row re-read and proven this operation's; prior value -> skipped; EXACTLY the value this operation wrote -> restored, then the row
//           re-read again (still this operation's, else FOREIGN_CELL_MAY_HAVE_BEEN_WRITTEN); anything else -> STOP (not overwritten);
//   a row:  bound to its OWN id; re-read and proven; deleted; then its id must be gone AND the sheet one row shorter, else STOP.
// -> { complete, left, done, phase }
var SHIPMENT_OWNER_COL_ = { shipments: 'shipment_id', shipment_lines: 'shipment_id', factory_stock_movements: 'related_entity_id', overseas_inventory_movements: 'reference_id', shipment_routes: 'shipment_id', shipment_events: 'shipment_id' };
var SHIPMENT_MOV_ID_COLS_ = { factory_stock_movements: 'factory_stock_movement_id', overseas_inventory_movements: 'movement_id' };
// INT-CAND7 r5 (F-R4-8): the movement ids present at an operation's start (read once, in its lock); the preflight identifies later rows by id
function shipmentMovIdSet_(sh) { var v = sh.getDataRange().getValues(), h = (v[0] || []).map(function (x) { return String(x).trim().toLowerCase(); }), ic = h.indexOf(SHIPMENT_MOV_ID_COLS_[sh.getName()]), o = {};
for (var r = 1; ic !== -1 && r < v.length; r++) { var id = String(v[r][ic] == null ? '' : v[r][ic]).trim(); if (id) o[id] = 1; } return ic === -1 ? null : o; }
function shipmentCheckedReplay_(journal, o) {
var out = { complete: false, left: [], done: [], phase: 'PREFLIGHT' }, hc = [];
function msg(e) { return String(e && e.message ? e.message : e); }
function nm(sh) { try { return sh.getName(); } catch (e) { return '?'; } }
function width(sh) { return Math.max(1, sh.getLastColumn()); }
function hdr(sh) { for (var i = 0; i < hc.length; i++) if (hc[i].s === sh) return hc[i].h; var h = sh.getRange(1, 1, 1, width(sh)).getValues()[0].map(function (x) { return String(x).trim().toLowerCase(); }); hc.push({ s: sh, h: h }); return h; }
function hrow(r) { return (r || []).map(function (x) { return String(x).trim().toLowerCase(); }); }
function rowOf(sh, r) { return sh.getRange(r, 1, 1, width(sh)).getValues()[0]; }
function K(v) { return shipmentCellKey_(v); }
function t(v) { return String(v == null ? '' : v).trim(); }
journal = journal || [];
// bind every movement row entry to its own id, in write order (o.seq); route / event entries already carry { id, idCol }
var seqBy = {}, seqIds = {}; (o.seq || []).forEach(function (x) { var n = nm(x.sheet); (seqBy[n] = seqBy[n] || []).push(String(x.id)); seqIds[String(x.id)] = 1; });
var used = {}; journal.forEach(function (e) { if (e.kind !== 'row' || e.id) return; var n = nm(e.sheet); if (!SHIPMENT_MOV_ID_COLS_[n]) return; var q = used[n] || 0; used[n] = q + 1; if (q < (seqBy[n] || []).length) { e.id = seqBy[n][q]; e.idCol = SHIPMENT_MOV_ID_COLS_[n]; } });
function cellJournaled(sh, r, c) { for (var i = 0; i < journal.length; i++) { var e = journal[i]; if (e.kind === 'cell' && e.sheet === sh && e.row === r && e.col === c) return true; } return false; }
function ident(sh, H, v, e) {
var n = nm(sh);
if (o.identify) { var x = o.identify(n, H, v, e); if (x === true) return ''; if (typeof x === 'string') return x; }
if (n === 'shipping_plans') { var pc = H.indexOf('shipping_plan_id'); return (pc !== -1 && ((o.planId && t(v[pc]) === o.planId) || (o.planIds && o.planIds.indexOf(t(v[pc])) >= 0))) ? '' : 'NOT_THIS_PLAN';   /* XCO-R15G H1: the other linked Plans this cancel journaled */ }
if (n === 'shipment_plan_links') { var lkc = H.indexOf('shipment_id'); return (lkc !== -1 && t(v[lkc]) === o.owner) ? '' : 'NOT_THIS_SHIPMENT_LINK'; }   // XCO-R15G O-1
var oc = SHIPMENT_OWNER_COL_[n];
if (oc) { var ci = H.indexOf(oc); if (ci === -1 || t(v[ci]) !== o.owner) return 'OWNER_IS_NOT_THIS_OPERATION'; }
else { var w = H.indexOf('warehouse_id'), s = H.indexOf('sku'); if (w === -1 || s === -1) return 'NO_IDENTITY_FOR_THIS_SHEET'; if (!(o.keys || {})[t(v[w]) + '||' + t(v[s])]) return 'STOCK_KEY_IS_NOT_THIS_OPERATION'; }
if (e.kind === 'row') { if (!e.id || !e.idCol) return 'ROW_NOT_BOUND_TO_ITS_ID'; var ic = H.indexOf(e.idCol); if (ic === -1 || t(v[ic]) !== String(e.id)) return 'ROW_IS_NOT_THE_ONE_WRITTEN (expected ' + e.idCol + ' ' + e.id + ')'; }
return '';
}
// the value this operation wrote into a cell: a string key, 'META' (a timestamp: no value proof, identity only), or null (cannot be proven)
function wrote(e, H, v, n) {
if (e.meta) return 'META';   // INT-CAND7 r5: a timestamp (Sheets may coerce it): identity only
if (e.wrote !== undefined) return K(e.wrote);
if (o.expect) { var x = o.expect(n, H, v, e); if (x !== undefined) return x; }
var w = H.indexOf('warehouse_id'), s = H.indexOf('sku'); if (w === -1 || s === -1) return null;
var spec = (o.keys || {})[t(v[w]) + '||' + t(v[s])]; if (!spec || typeof spec !== 'object') return null;
var c = H[e.col], p = Math.round(parseFloat(e.prev) || 0);
if (c === 'fac_reserved_stock' || c === 'wh_reserved_stock' || c === 'reserved_stock') return String(p + (spec.res || 0));
if (c === 'fac_current_stock' || c === 'current_stock') return String(p + (spec.cur || 0));
if (c === 'wh_available_stock' || c === 'available_stock') return String(p + (spec.avail || 0));
if (c === 'last_transaction_at' || c === 'last_movement_at' || c === 'updated_at') return 'META';
return null;
}
function stop(why) { out.left.push(why); return false; }
// ---- PREFLIGHT (read-only, before ANY write)
var why = [], adopt = [], rowKey_ = {}, rk_ = {}, dk_ = {}, idKey_ = {}, pendRes_ = [];
Object.keys(o.doms || {}).forEach(function (D) { var d = o.doms[D];
try {
// (a) the operation's stock rows: every cell that differs from the start snapshot must be journaled (else a write landed unseen)
var st = d.stock.getDataRange().getValues(), H0 = hrow(d.stockData[0]), Hn = hrow(st[0]), w0 = H0.indexOf('warehouse_id'), s0 = H0.indexOf('sku'), wn = Hn.indexOf('warehouse_id'), sn = Hn.indexOf('sku');
Object.keys(o.keys || {}).forEach(function (k) { if ((o.keys[k] || {}).domain !== D) return;
var r0 = -1, rn = -1; for (var a = 1; a < d.stockData.length; a++) if (t(d.stockData[a][w0]) + '||' + t(d.stockData[a][s0]) === k) { r0 = a; break; }
for (var b = 1; b < st.length; b++) if (t(st[b][wn]) + '||' + t(st[b][sn]) === k) { rn = b; break; }
if (r0 === -1 || rn === -1 || r0 !== rn) { why.push('STOCK_ROW_NOT_WHERE_IT_WAS ' + k + ' (start row ' + (r0 + 1) + ', now ' + (rn + 1) + ')'); return; }
rowKey_[nm(d.stock) + '#' + (rn + 1)] = k;
// INT-CAND7 r5 (F-R4-1): a landed cell this operation never journaled is ADOPTED when its value is provable - exactly the start value plus
// this operation's recorded delta for the key (a timestamp column: by row identity) - and undone like the rest; anything else STOPS.
for (var c = 0; c < Hn.length; c++) { if (K(st[rn][c]) === K(d.stockData[r0][c]) || cellJournaled(d.stock, rn + 1, c)) continue;
var pe_ = { kind: 'cell', sheet: d.stock, row: rn + 1, col: c, prev: d.stockData[r0][c], adopted: true }, xw_ = wrote(pe_, Hn, st[rn], nm(d.stock));
if (xw_ === 'META') { pe_.meta = true; adopt.push(pe_); continue; }
if (xw_ !== null && xw_ === K(st[rn][c])) { pe_.wrote = st[rn][c]; if (/reserved/.test(String(Hn[c]))) { pe_.key = k; pe_.hn = Hn[c]; pendRes_.push(pe_); } else adopt.push(pe_); continue; }   // r6 (CH5-5): a reserved cell needs a ledger proof
why.push('LANDED_UNJOURNALED_CELL ' + k + ' ' + Hn[c] + ' ' + K(d.stockData[r0][c]) + '->' + K(st[rn][c]) + (xw_ === null ? ' (no proof of what this operation wrote)' : ' (this operation would have written ' + xw_ + ': not provable as its own)')); }
});
// (b) ledger rows after the start mark on the operation's keys: its own (a captured id) or STOP
var mv = d.mov.getDataRange().getValues(), mh = hrow(mv[0]), mn = nm(d.mov), oc = mh.indexOf(SHIPMENT_OWNER_COL_[mn]), ic = mh.indexOf(SHIPMENT_MOV_ID_COLS_[mn]), wc = mh.indexOf('warehouse_id'), sc = mh.indexOf('sku');
// INT-CAND7 r5 (F-R4-8): a row present at the start (by id) is never this operation's; a blank id falls back to the start mark
for (var m = d.movIds ? 1 : Math.max(1, d.movStart || 0); m < mv.length; m++) { var id_ = t(mv[m][ic]); if (d.movIds && (id_ ? d.movIds[id_] : m < (d.movStart || 0))) continue;
var mk = t(mv[m][wc]) + '||' + t(mv[m][sc]); if (id_) idKey_[id_] = mk; if (!(o.keys || {})[mk]) continue;
if (t(mv[m][oc]) === o.owner) { if (!seqIds[t(mv[m][ic])]) why.push('LANDED_UNJOURNALED_LEDGER_ROW ' + mn + ' row ' + (m + 1) + ' ' + mk + ' (this operation wrote it; its id was never seen)'); }
else why.push('INTERVENING_LEDGER_WRITE ' + mn + ' row ' + (m + 1) + ' ' + mk + ' owner ' + t(mv[m][oc])); }
// INT-CAND7 r6 (review CHAIN5 CH5-5): a landed reserved cell is this operation's only when a ledger row of THIS operation (its own id) for
// that key exists after the start; an equal-valued cell with no such row may be another writer's edit - STOP, as round 4 did
pendRes_.forEach(function (pe) { if (pe.sheet !== d.stock || pe.done_) return; pe.done_ = true; var own = Object.keys(idKey_).some(function (id) { return idKey_[id] === pe.key && seqIds[id]; });
if (own) adopt.push(pe); else why.push('LANDED_UNJOURNALED_CELL ' + pe.key + ' ' + pe.hn + ' ' + K(pe.prev) + '->' + K(pe.wrote) + ' (a reserved cell with no ledger row of this operation: not provably ours, not adopted)'); });
} catch (eP) { why.push('PREFLIGHT_READ_FAILED ' + D + ': ' + msg(eP)); }
});
if (o.preflight) why = why.concat(o.preflight() || []);
if (why.length) { out.left = why.slice(0, 20); return out; }
for (var ad_ = 0; ad_ < adopt.length; ad_++) { journal.push(adopt[ad_]); (out.adopted = out.adopted || []).push(nm(adopt[ad_].sheet) + ' row ' + adopt[ad_].row + ' col ' + (adopt[ad_].col + 1) + ' ' + K(adopt[ad_].prev) + '<-' + (adopt[ad_].meta ? 'META' : K(adopt[ad_].wrote))); }
// ---- the undo, in this order: cells (not last sheets), rows, last-sheet cells
// INT-CAND7 r5 (F-R4-3): by direction - a key this operation ACQUIRED on: its row first, then its cell (cells2, after the rows); every other
// cell before the rows (a release / shipment_out: cell first, then row); a stop leaves each reserved cell at or above its ledger
var cells1 = [], rows = [], cells2 = [], cells3 = [], last = o.lastSheets || [];
function acqRow_(e) { var k = rowKey_[nm(e.sheet) + '#' + e.row], sp = k ? (o.keys || {})[k] : null; return !!(sp && typeof sp === 'object' && (sp.res || 0) > 0); }
for (var i = journal.length - 1; i >= 0; i--) { var e = journal[i];
if (e.kind === 'cell') (last.indexOf(nm(e.sheet)) >= 0 ? cells3 : (acqRow_(e) ? cells2 : cells1)).push(e);
else if (e.kind === 'row') rows.push(e);
else { out.left.push('JOURNAL_ENTRY_NOT_HANDLED ' + e.kind + ' ' + nm(e.sheet) + ' row ' + e.row); return out; } }
function doCell(e) {
var sh = e.sheet, at = nm(sh) + ' row ' + e.row + ' col ' + (e.col + 1), H, v;
try { H = hdr(sh); v = rowOf(sh, e.row); } catch (eR) { return stop('READ_FAILED ' + at + ': ' + msg(eR)); }
var w1 = ident(sh, H, v, e); if (w1) return stop('NOT_PROVEN ' + at + ': ' + w1);
var now0 = K(v[e.col]), prev = K(e.prev);
if (now0 === prev) return true;
var wv = wrote(e, H, v, nm(sh));
if (wv === null) return stop('VALUE_NOT_PROVEN ' + at + ': no proof of what this operation wrote there (now ' + now0 + ', before ' + prev + '; not overwritten)');
if (wv !== 'META' && now0 !== wv) return stop('CELL_CHANGED_BY_ANOTHER_WRITER ' + at + ': now ' + now0 + ', this operation wrote ' + wv + ', before ' + prev + ' (not overwritten)');
try { sh.getRange(e.row, e.col + 1).setValue(e.prev); } catch (eW) {
var c1 = null; try { c1 = K(sh.getRange(e.row, e.col + 1).getValue()); } catch (eQ) {}
if (c1 !== prev) return stop('CELL_RESTORE_FAILED ' + at + ': ' + msg(eW)); }
var v2; try { v2 = rowOf(sh, e.row); } catch (eA) { return stop('AFTER_RESTORE_READ_FAILED ' + at + ': ' + msg(eA)); }
var w2 = ident(sh, H, v2, e); if (w2) return stop('FOREIGN_CELL_MAY_HAVE_BEEN_WRITTEN ' + at + ' (value ' + prev + '): the row changed during the restore (' + w2 + ')');
out.done.push('restored ' + at); var kk_ = rowKey_[nm(sh) + '#' + e.row]; if (kk_ && /reserved/.test(String(H[e.col] || ''))) rk_[kk_] = 1; return true;
}
function doRow(e) {
var sh = e.sheet, at = nm(sh) + ' row ' + e.row, H, v;
try { H = hdr(sh); v = rowOf(sh, e.row); } catch (eR) { return stop('READ_FAILED ' + at + ': ' + msg(eR)); }
var w1 = ident(sh, H, v, e); if (w1) return stop('NOT_PROVEN ' + at + ': ' + w1);
var ic2 = H.indexOf(e.idCol), n0 = -1; try { n0 = sh.getLastRow(); } catch (eN) { return stop('READ_FAILED ' + at + ': ' + msg(eN)); }
var dE = null; try { sh.deleteRow(e.row); } catch (eD) { dE = eD; }
var g = -2, n1 = -1; try { g = shipmentRowOfValue_(sh, ic2, String(e.id)); n1 = sh.getLastRow(); } catch (eS) { return stop('ROW_DELETE_OUTCOME_UNKNOWN ' + at + ' (the re-read failed: ' + msg(eS) + ')'); }
if (dE) {
if (g === -1 && n1 === n0 - 1) { out.done.push('deleted (landed, then threw) ' + at); dkey_(e); return true; }
if (g === e.row && n1 === n0) return stop('ROW_DELETE_OUTCOME_UNKNOWN ' + at + ': the delete threw and ours is still there - either nothing was deleted, or a row another writer inserted here during the delete was deleted instead (indistinguishable): ' + msg(dE));
if (g !== -1 && n1 === n0 - 1) return stop('A_ROW_WAS_DELETED_BUT_NOT_OURS ' + at + ' (ours is now at row ' + g + ')');
return stop('ROW_DELETE_OUTCOME_UNKNOWN ' + at + ': ' + msg(dE)); }
if (g !== -1 || n1 !== n0 - 1) return stop('ROW_SHIFTED_DURING_DELETE ' + at + ': ' + (g !== -1 ? 'ours is still at row ' + g + ' - the row deleted was another writer\'s' : 'the sheet did not shrink by one'));
out.done.push('deleted ' + at); dkey_(e); return true;
}
function dkey_(e) { if (e.id) dk_[String(e.id)] = 1; }
// INT-CAND7 r5 (F-R4-7): a stop names every key it leaves with the reserved cell above its ledger
function lab_() { Object.keys(o.keys || {}).forEach(function (k) { var sp = o.keys[k], r = (sp && typeof sp === 'object') ? (sp.res || 0) : 0;
var rowsK = journal.filter(function (x) { return x.kind === 'row' && x.id && idKey_[String(x.id)] === k; }), kept = rowsK.filter(function (x) { return !dk_[String(x.id)]; }).length;
var cellK = journal.some(function (x) { return x.kind === 'cell' && rowKey_[nm(x.sheet) + '#' + x.row] === k && /reserved/.test(String(hdr(x.sheet)[x.col] || '')); });
if (r < 0 && cellK && !rk_[k] && kept === 0 && rowsK.length === 0) out.left.push('CELL_BELOW_LEDGER ' + k + ' (its release row was never written; its reserved cell is not restored): the reservation-books check blocks this key until it is reviewed');   // r7 (CH6-9)
if ((r < 0 && rk_[k] && kept > 0) || (r > 0 && cellK && !rk_[k] && kept === 0)) out.left.push('CELL_ABOVE_LEDGER ' + k + (r < 0 ? ' (its reserved cell is restored; its ledger row is kept)' : ' (its acquire row is gone; its reserved cell is not restored)') + ': that quantity stays reserved until reviewed'); });
return out; }
out.phase = 'CELLS'; for (var a1 = 0; a1 < cells1.length; a1++) if (!doCell(cells1[a1])) return lab_();
out.phase = 'ROWS'; for (var a2 = 0; a2 < rows.length; a2++) if (!doRow(rows[a2])) return lab_();
out.phase = 'CELLS_AFTER_ROWS'; for (var a4 = 0; a4 < cells2.length; a4++) if (!doCell(cells2[a4])) return lab_();
out.phase = 'LAST'; for (var a3 = 0; a3 < cells3.length; a3++) if (!doCell(cells3[a3])) return lab_();
try { SpreadsheetApp.flush(); } catch (eF) { out.left.push('FLUSH_FAILED: ' + msg(eF)); return out; }
out.phase = 'DONE'; out.complete = true; return out;
}

// INT-CAND8 (local candidate, I1 - I1_RECONCILE_SPEC.r2.md): the reservation books of the operation's OWN stock keys. Read-only; run inside
// the caller's lock before its first business write. The RAW rows are validated first (section 3), derived is computed here (section 2);
// FACTORY is cross-checked with 21_ factoryStockReconcileReservations_ on the rows that passed. Missing evidence is UNKNOWN, never 0.
var SHIPMENT_BOOKS_MISMATCH_ = 'RESERVATION_BOOKS_MISMATCH', SHIPMENT_BOOKS_UNKNOWN_ = 'RESERVATION_BOOKS_UNKNOWN';
// strict integer (spec r2 F11): a finite integer number, or a string ^[+-]?digits$ after trim; anything else (blank, '24abc', 23.6) -> null
function shipmentBooksInt_(v) { if (typeof v === 'number') return (isFinite(v) && Math.floor(v) === v) ? v : null; var s = String(v == null ? '' : v).trim(); return /^[+-]?\d+$/.test(s) ? parseInt(s, 10) : null; }
function shipmentReservationBooks_(domain, sheets, wh, skus, opts) { try { return shipmentReservationBooksRaw_(domain,sheets,wh,skus,opts); } catch (eG) { return { verdict: SHIPMENT_BOOKS_UNKNOWN_, domain: domain, warehouse_id: String(wh || '').trim(), keys: [], mismatched: [], unknown: [String(wh || '').trim() + ' GUARD_THREW: ' + String(eG && eG.message ? eG.message : eG)] }; } }   // INT-CAND8 r5: never throws
function shipmentReservationBooksRaw_(domain, sheets, wh, skus, opts) {   // opts.absentLedgerIsEmpty: P4 factory only (spec r3 A5)
wh = String(wh || '').trim();
var out = { verdict: 'RECONCILED', domain: domain, warehouse_id: wh, keys: [], mismatched: [], unknown: [] }, want = {};
(skus || []).forEach(function (k) { k = String(k == null ? '' : k).trim(); if (k) want[k] = 1; });
function unk(k, why) { out.unknown.push(wh + '||' + k + ' ' + why); }
function fin() { out.verdict = out.mismatched.length ? SHIPMENT_BOOKS_MISMATCH_ : (out.unknown.length ? SHIPMENT_BOOKS_UNKNOWN_ : 'RECONCILED'); return out; }
var list = Object.keys(want).sort();
if (!list.length) return fin();
out.keys = list.map(function (k) { return wh + '||' + k; });
var noLedger = !!(sheets && sheets.stockSheet && !sheets.movSheet && opts && opts.absentLedgerIsEmpty);
if (!sheets || !sheets.stockSheet || (!sheets.movSheet && !noLedger)) { list.forEach(function (k) { unk(k, 'BOOK_SHEETS_MISSING'); }); return fin(); }
var st, mv;
try { if (opts && opts.pre) { if (opts.pre.err) throw opts.pre.err; st = opts.pre.st; mv = opts.pre.mv; }   // F-I1-1: read once by shipmentReservationBooksKeys_
else { st = sheets.stockSheet.getDataRange().getValues(); mv = noLedger ? [[]] : sheets.movSheet.getDataRange().getValues(); } }
catch (eR) { list.forEach(function (k) { unk(k, 'READ_FAILED: ' + String(eR && eR.message ? eR.message : eR)); }); return fin(); }
function hdr(row) { return (row || []).map(function (h) { return String(h).trim().toLowerCase(); }); }
function blank(v) { return v == null || String(v).trim() === ''; }
function pick(H, a, b) { var i = H.indexOf(a); return i !== -1 ? i : H.indexOf(b); }   // by HEADER, as the writers resolve it
var ovs = domain === SHIPMENT_DOMAIN_OVERSEAS_, sh = hdr(st[0]), mh = hdr(mv[0]);
var sW = sh.indexOf('warehouse_id'), sS = sh.indexOf('sku'), sR = ovs ? pick(sh, 'wh_reserved_stock', 'reserved_stock') : pick(sh, 'fac_reserved_stock', 'reserved_stock');
var mT = mh.indexOf('movement_type'), mW = mh.indexOf('warehouse_id'), mS = mh.indexOf('sku'), mQ = ovs ? pick(mh, 'wh_quantity', 'quantity') : mh.indexOf('qty');
var mB = mh.indexOf(ovs ? 'wh_before_reserved_stock' : 'before_reserved_stock'), mA = mh.indexOf(ovs ? 'wh_after_reserved_stock' : 'after_reserved_stock'), mSc = mh.indexOf('movement_scope');
var missing = [];
if (sW === -1 || sS === -1 || sR === -1) missing.push('STOCK');
if (!noLedger && (mT === -1 || mW === -1 || mS === -1 || mQ === -1 || (ovs ? mSc === -1 : (mB === -1 || mA === -1)))) missing.push('LEDGER');
if (!ovs && typeof factoryStockReconcileReservations_ !== 'function') missing.push('RECONCILER');
if (missing.length) { list.forEach(function (k) { unk(k, 'EVIDENCE_COLUMNS_MISSING ' + missing.join(',')); }); return fin(); }
var known = ovs ? OVSTX_MOVEMENT_TYPES_ : FSTX_MOVEMENT_TYPES_, ACQ = ovs ? OVSTX_MOV_RESERVE_ACQUIRE_ : FSTX_MOV_RESERVE_ACQUIRE_, REL = ovs ? OVSTX_MOV_RESERVE_RELEASE_ : FSTX_MOV_RESERVE_RELEASE_;
var OUTT = ovs ? OVSTX_MOV_SHIPMENT_OUT_ : FSTX_MOV_SHIPMENT_OUT_, axis = [ACQ, REL, OUTT];
var stockRows = {}, movRows = {}, bad = {}, derivedBy = {}, unscoped = [], seen = {}, lastAv_ = {}, anyAv_ = {}, sAv_ = ovs ? pick(sh, 'wh_available_stock', 'available_stock') : -1, mAv_ = ovs ? mh.indexOf('wh_after_available_stock') : -1, lastCu_ = {}, anyCu_ = {}, sCu_ = ovs ? -1 : pick(sh, 'fac_current_stock', 'current_stock'), mCu_ = ovs ? -1 : mh.indexOf('after_current_stock');   // INT-CAND8 r7 (CH6-1 / 3.5)
list.forEach(function (k) { stockRows[k] = []; movRows[k] = []; bad[k] = []; derivedBy[k] = 0; });
for (var r = 1; r < st.length; r++) { var k1 = String(st[r][sS] || '').trim(); if (String(st[r][sW] || '').trim() === wh && want[k1]) stockRows[k1].push(st[r]); }
for (var m = 1; m < mv.length; m++) {
var t = String(mv[m][mT] || '').trim(), mw = String(mv[m][mW] || '').trim(), mk = String(mv[m][mS] || '').trim();
if (axis.indexOf(t) >= 0 && (!mw || !mk)) { unscoped.push(m + 1); continue; }   // rule 7: cannot be scoped to a key
if (mw !== wh || !want[mk]) continue;
seen[mk] = (seen[mk] || 0) + 1; if (mAv_ !== -1) { if (blank(mv[m][mAv_])) lastAv_[mk] = 'BLANK'; else { lastAv_[mk] = shipmentBooksInt_(mv[m][mAv_]); anyAv_[mk] = 1; } } if (mCu_ !== -1) { if (blank(mv[m][mCu_])) lastCu_[mk] = 'BLANK'; else { lastCu_[mk] = shipmentBooksInt_(mv[m][mCu_]); anyCu_[mk] = 1; } }   // INT-CAND8 r7: the newest movement of the key (sheet order)
var B = bad[mk], row = mv[m], at = ' row ' + (m + 1);
if (known.indexOf(t) < 0) { B.push('UNKNOWN_MOVEMENT_TYPE' + at + ' "' + t + '"'); continue; }
if (axis.indexOf(t) >= 0) {
var q = shipmentBooksInt_(row[mQ]);
if (q === null) { B.push('RESERVED_AXIS_QTY_NOT_A_NUMBER' + at); continue; }
if (ovs && String(row[mSc] || '').trim() !== 'reserved_stock') { B.push('RESERVED_AXIS_SCOPE' + at); continue; }
if ((t === ACQ && q <= 0) || (t === REL && q >= 0) || (ovs && t === OUTT && q >= 0)) { B.push('SIGN_VIOLATION' + at + ' ' + t + ' ' + q); continue; }
if (!ovs && t === OUTT) {
var b0 = shipmentBooksInt_(row[mB]), a0 = shipmentBooksInt_(row[mA]);
if (b0 === null || a0 === null || a0 > b0) { B.push('SHIPMENT_OUT_RESERVED_SNAPSHOT_INVALID' + at); continue; } derivedBy[mk] -= (b0 - a0);
} else derivedBy[mk] += q;
} else if (!(blank(row[mB]) && blank(row[mA]))) {   // rule 6: a non-axis row must not move the reserved snapshot
var nb = shipmentBooksInt_(row[mB]), na = shipmentBooksInt_(row[mA]); if (nb === null || na === null) B.push('RESERVED_SNAPSHOT_INVALID' + at); else if (nb !== na) B.push('UNMODELLED_RESERVED_CHANGE' + at + ' ' + t + ' ' + nb + '->' + na);
}
movRows[mk].push(row);
}
list.forEach(function (k) {
if (ovs && typeof ovsReceiptPendingOf_ === 'function') { var pd71_ = ovsReceiptPendingOf_(st, mv, wh, k); if (pd71_) unk(k, ovsReceiptPendingText_(pd71_)); }   // R71-RCV-1: names the shipment; the key's verdict below is unchanged (a pending key never reconciles)
if (unscoped.length) { unk(k, 'UNSCOPED_RESERVED_AXIS_ROW rows ' + unscoped.slice(0, 5).join(',')); return; }
if (!stockRows[k].length && !seen[k]) return;   // spec r3 A4: no stock row AND no ledger row = consistent and empty (the shortfall refusal answers it)
if (stockRows[k].length !== 1) { unk(k, stockRows[k].length ? 'DUPLICATE_STOCK_ROWS ' + stockRows[k].length : 'NO_STOCK_ROW'); return; }
if (!noLedger && (ovs ? (sAv_ === -1 || mAv_ === -1) : (sCu_ === -1 || mCu_ === -1))) {   /* run 2: P4 'no ledger sheet = empty ledger' (spec r3 A5) has no movement to compare */ unk(k, 'EVIDENCE_COLUMNS_MISSING ' + (ovs ? 'wh_available_stock / wh_after_available_stock' : 'fac_current_stock / after_current_stock')); return; }   // INT-CAND8 r8 (CH7-5): missing = UNKNOWN, never off
var stored = shipmentBooksInt_(stockRows[k][0][sR]);
if (stored === null) { unk(k, 'STORED_RESERVED_NOT_A_NUMBER'); return; }
if (bad[k].length) { unk(k, bad[k].slice(0, 3).join('; ')); return; }
var derived = derivedBy[k];
if (!ovs) {   // the cross-check: 21_ on the rows that passed
var so = {}; sh.forEach(function (n, i) { so[n] = stockRows[k][0][i]; });
var mo = movRows[k].map(function (x) { var o = {}; mh.forEach(function (n, i) { o[n] = x[i]; }); return o; });
var rec = factoryStockReconcileReservations_([so], mo), rr = ((rec && rec.rows) || []).filter(function (z) { return z.warehouse_id === wh && z.sku === k; })[0];
if (!rr || rr.derived_reserved !== derived || rr.stored_reserved !== stored) { unk(k, 'RECONCILER_DISAGREES guard ' + stored + '/' + derived + ' 21_ ' + (rr ? rr.stored_reserved + '/' + rr.derived_reserved : 'no row')); return; }
}
if (stored !== derived) out.mismatched.push(wh + '||' + k + ' stored ' + stored + ' ledger ' + derived);
if (ovs && sAv_ !== -1 && anyAv_[k]) { if (lastAv_[k] === 'BLANK' || lastAv_[k] === null) unk(k, 'AVAILABLE_NOT_PROVABLE (the newest movement carries no integer after-available)'); else { var av_ = shipmentBooksInt_(stockRows[k][0][sAv_]); if (av_ === null) unk(k, 'AVAILABLE_NOT_A_NUMBER'); else if (av_ !== lastAv_[k]) out.mismatched.push(wh + '||' + k + ' available ' + av_ + ' newest movement after-available ' + lastAv_[k]); } }
if (!ovs && sCu_ !== -1 && anyCu_[k]) { if (lastCu_[k] === 'BLANK' || lastCu_[k] === null) unk(k, 'CURRENT_NOT_PROVABLE (the newest movement carries no integer after-current)'); else { var cu_ = shipmentBooksInt_(stockRows[k][0][sCu_]); if (cu_ === null) unk(k, 'CURRENT_NOT_A_NUMBER'); else if (cu_ !== lastCu_[k]) out.mismatched.push(wh + '||' + k + ' current ' + cu_ + ' newest movement after-current ' + lastCu_[k]); } }
});
return fin();
}

// INT-CAND8 round 4 (review F-I1-1): every (warehouse, sku) key of ONE domain with ONE read of its stock sheet and ONE of its ledger.
// byWh = { warehouse_id: [sku, ...] }. The per-key rules are shipmentReservationBooks_'s, unchanged; a failed read is UNKNOWN for every key.
function shipmentReservationBooksKeys_(domain, sheets, byWh, opts) { try { return shipmentReservationBooksKeysRaw_(domain,sheets,byWh,opts); } catch (eG) { return { verdict: SHIPMENT_BOOKS_UNKNOWN_, domain: domain, keys: [], mismatched: [], unknown: [domain + ' GUARD_THREW: ' + String(eG && eG.message ? eG.message : eG)] }; } }   // INT-CAND8 r5: never throws
function shipmentReservationBooksKeysRaw_(domain, sheets, byWh, opts) {
var all = { verdict: 'RECONCILED', domain: domain, keys: [], mismatched: [], unknown: [] }, whs = Object.keys(byWh || {}).sort(), pre = null;
var any = whs.some(function (w) { return (byWh[w] || []).some(function (k) { return String(k == null ? '' : k).trim() !== ''; }); });
var noLedger = !!(sheets && sheets.stockSheet && !sheets.movSheet && opts && opts.absentLedgerIsEmpty);
if (any && sheets && sheets.stockSheet && (sheets.movSheet || noLedger)) { pre = {}; try { pre.st = sheets.stockSheet.getDataRange().getValues(); pre.mv = noLedger ? [[]] : sheets.movSheet.getDataRange().getValues(); } catch (eP) { pre.err = eP; } }
whs.forEach(function (w) { var o = {}; if (opts) Object.keys(opts).forEach(function (p) { o[p] = opts[p]; }); if (pre) o.pre = pre;
var b = shipmentReservationBooks_(domain, sheets, w, byWh[w], o); all.keys = all.keys.concat(b.keys); all.mismatched = all.mismatched.concat(b.mismatched); all.unknown = all.unknown.concat(b.unknown); });
all.verdict = all.mismatched.length ? SHIPMENT_BOOKS_MISMATCH_ : (all.unknown.length ? SHIPMENT_BOOKS_UNKNOWN_ : 'RECONCILED');
return all;
}

// INT-CAND8 (I1): the refusal text - the keys, zero writes, nothing corrected, other keys unaffected.
function shipmentBooksMessage_(b, op) {
var parts = [];
if (b.mismatched.length) parts.push('the reservation books of these stock keys disagree (stored reserved vs the ledger): ' + b.mismatched.slice(0, 10).join('; '));
if (b.unknown.length) parts.push('the reservation books of these stock keys cannot be confirmed: ' + b.unknown.slice(0, 10).join('; '));
if (!b.mismatched.length && b.unknown.length && b.unknown.every(function (u) { return /READ_FAILED|GUARD_THREW/.test(String(u)); })) return op + ' refused before any write: ' + parts.join('. Also ') + '. The books could not be READ, so they were not confirmed; nothing was written and nothing was corrected. This may be a transient read error: the operation may be retried once the books can be read (it is checked again).';
return op + ' refused before any write: ' + parts.join('. Also ') + '. Nothing was written and nothing was corrected. Only these keys are blocked; every other key works as before. ' +
'Do not retry: it is refused the same way until the books agree. Review the keys with the read-only reservation reconcile (TEMP_RRC_RUN for factory stock; overseas by hand).';
}

// INT-CAND8 (I1, spec r2 F2): the books a CANCEL would touch - every key the shipment HOLDS in either ledger (exactly what the release sweep
// releases), read inside the caller's lock. Round 5 (fail-closed): every key the shipment TOUCHES - any reservation row of it (sum 0 included) + its line SKUs at its source.
function shipmentCancelBooks_(ss, shipmentId, srcWarehouseId) { try { return shipmentCancelBooksRaw_(ss,shipmentId,srcWarehouseId); } catch (eG) { return { verdict: SHIPMENT_BOOKS_UNKNOWN_, keys: [], mismatched: [], unknown: ['GUARD_THREW: ' + String(eG && eG.message ? eG.message : eG)] }; } }   // INT-CAND8 r5: never throws
function shipmentCancelBooksRaw_(ss, shipmentId, srcWarehouseId) {
var all = { verdict: 'RECONCILED', keys: [], mismatched: [], unknown: [] };
var srcDomain = shipmentSourceDomain_(ss, srcWarehouseId), lineSkus = []; try { var ln = ss.getSheetByName('shipment_lines'); if (ln) { var lt = shipmentReadSheet_(ln), ic = lt.col('shipment_id'), kc = lt.col('sku'); for (var r = 1; ic !== -1 && kc !== -1 && r < lt.rows.length; r++) if (String(lt.rows[r][ic]).trim() === shipmentId) lineSkus.push(String(lt.rows[r][kc] || '').trim()); } } catch (eL) {}
[[SHIPMENT_DOMAIN_FACTORY_, 'factory_stock', 'factory_stock_movements'], [SHIPMENT_DOMAIN_OVERSEAS_, 'overseas_inventory_snapshot', 'overseas_inventory_movements']].forEach(function (d) {
var sheets = { domain: d[0], stockSheet: ss.getSheetByName(d[1]), movSheet: ss.getSheetByName(d[2]) }, byWh = {};
if (d[0] === srcDomain && srcWarehouseId) lineSkus.forEach(function (k) { (byWh[srcWarehouseId] = byWh[srcWarehouseId] || []).push(k); });
if (!sheets.stockSheet || !sheets.movSheet) return;   // the sweep skips such a domain too: nothing there can be released
var held; try { held = shipmentDomainHeld_(d[0], sheets, shipmentId); } catch (eH) { all.unknown.push(d[0] + ' HELD_READ_FAILED: ' + String(eH && eH.message ? eH.message : eH)); return; }
Object.keys(held).forEach(function (key) { var p = key.split('||'); if (Math.round(held[key] || 0) > 0 && p[0] !== String(srcWarehouseId || '').trim()) all.unknown.push(key + ' HOLD_AWAY_FROM_SOURCE (' + d[0] + ' reservation ' + Math.round(held[key]) + ' while the shipment names ' + (String(srcWarehouseId || '').trim() || '(no source)') + ')'); });   // INT-CAND8 r8 (CH7-1)
Object.keys(held).forEach(function (key) { var p = key.split('||'); (byWh[p[0]] = byWh[p[0]] || []).push(p[1]); });   // INT-CAND8 r5: every key it has a row on (spec r5), not only > 0
if (typeof lineSkus !== 'undefined') Object.keys(byWh).forEach(function (w) { lineSkus.forEach(function (k) { if (byWh[w].indexOf(k) < 0) byWh[w].push(k); }); });   // INT-CAND8 r7 (CH6-4): the line SKUs at EVERY warehouse where it has a row
var b = shipmentReservationBooksKeys_(d[0], sheets, byWh);   // round 4 (F-I1-1): one read of each sheet per domain, not per warehouse
all.keys = all.keys.concat(b.keys); all.mismatched = all.mismatched.concat(b.mismatched); all.unknown = all.unknown.concat(b.unknown);
});
all.verdict = all.mismatched.length ? SHIPMENT_BOOKS_MISMATCH_ : (all.unknown.length ? SHIPMENT_BOOKS_UNKNOWN_ : 'RECONCILED');
return all;
}

function shipmentDomainAcquire_(domain, sheets, p) {
if (domain === SHIPMENT_DOMAIN_OVERSEAS_) {
return ovsAcquireReservationTx_({
snapSheet: sheets.stockSheet, movSheet: sheets.movSheet, warehouseId: p.warehouseId, sku: p.sku,
qty: p.qty, ownerType: OVSTX_RESERVATION_OWNER_TYPE_, ownerId: p.ownerId, journal: p.journal,
now: p.now, movementDate: p.movementDate, createdBy: p.createdBy, note: p.note });
}
return factoryStockAcquireReservationTx_({
stockSheet: sheets.stockSheet, movSheet: sheets.movSheet, warehouseId: p.warehouseId, sku: p.sku,
qty: p.qty, ownerType: FSTX_RESERVATION_OWNER_TYPE_, ownerId: p.ownerId, journal: p.journal,
now: p.now, movementDate: p.movementDate, createdBy: p.createdBy, note: p.note });
}

function shipmentDomainRelease_(domain, sheets, p) {
if (domain === SHIPMENT_DOMAIN_OVERSEAS_) {
return ovsReleaseReservationTx_({
snapSheet: sheets.stockSheet, movSheet: sheets.movSheet, warehouseId: p.warehouseId, sku: p.sku,
qty: p.qty, ownerType: OVSTX_RESERVATION_OWNER_TYPE_, ownerId: p.ownerId, journal: p.journal,
now: p.now, movementDate: p.movementDate, createdBy: p.createdBy, releaseReason: p.releaseReason });
}
return factoryStockReleaseReservationTx_({
stockSheet: sheets.stockSheet, movSheet: sheets.movSheet, warehouseId: p.warehouseId, sku: p.sku,
qty: p.qty, ownerType: FSTX_RESERVATION_OWNER_TYPE_, ownerId: p.ownerId, journal: p.journal,
now: p.now, movementDate: p.movementDate, createdBy: p.createdBy, releaseReason: p.releaseReason });
}


















function handleCreateShipmentFromPlan_(body) {
var planId = String((body && body.shipping_plan_id) || '').trim();
var actor = String((body && (body.created_by || body.actor)) || 'system_user').trim();
if (!planId) return jsonResponse_({ success: false, error: 'Missing shipping_plan_id', code: 'MISSING_SHIPPING_PLAN_ID', zero_write: true });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var result;
try {
result = createShipmentFromApprovedPlan_(ss, planId, actor);
} catch (e) {
return jsonResponse_({ success: false, code: 'SHIPMENT_CREATION_FAILED', shipping_plan_id: planId,
error: String(e && e.message ? e.message : e) });
}
if (result && result.created === false && result.reason && result.reason !== 'already_exists') {
return jsonResponse_({ success: false, code: String(result.reason).toUpperCase(), shipping_plan_id: planId,
error: (result.message || ('Could not create shipment: ' + result.reason)), data: result });
}
var reused = !!(result && result.created === false && result.reason === 'already_exists');
return jsonResponse_({ success: true, data: Object.assign({}, result, {
outcome: reused ? 'REUSED' : 'CREATED',
shipping_plan_id: planId,
approval_status_changed: false
}) });
}

































var SHIPMENT_CANCELLED_STATUS_ = 'cancelled';

var SHIPMENT_DISPATCHED_STATUSES_ = ['shipped', 'in_transit', 'arrived', 'received', 'closed', 'completed', 'delivered', 'partial_received', 'partially_received'];

var SHIPMENT_PRE_DISPATCH_STATUSES_ = ['draft', 'ready_to_ship'];











function shipmentCancelReviewPlans_(ss, ids, shipmentId) {
  var unique=ids.filter(function(id,i,a){return id&&a.indexOf(id)===i;}),out={rows:[],sheet:null,headers:[]};
  if(!unique.length)return out;
  var sheet=ss.getSheetByName('shipping_plans');if(!sheet)throw Error('CANCEL_PLAN_REVIEW_UNREADABLE');
  var t=shipmentReadSheet_(sheet),ic=t.col('shipping_plan_id'),sc=t.col('status');
  if(ic<0||sc<0||t.col('updated_at')<0)throw Error('CANCEL_PLAN_REVIEW_SCHEMA_MISSING');
  unique.forEach(function(id){var matches=[];for(var i=1;i<t.rows.length;i++)if(String(t.rows[i][ic]||'').trim()===id)matches.push({row:i+1,values:t.rows[i],id:id});
    if(matches.length!==1)throw Error('CANCEL_PLAN_REVIEW_NOT_UNIQUE:'+id);
    var hit=matches[0],status=String(hit.values[sc]||'').trim(),tc=t.col('transferred_shipment_id'),transfer=tc<0?'':String(hit.values[tc]||'').trim();
    if(['approved','completed'].indexOf(status)<0||transfer&&transfer!==shipmentId)throw Error('CANCEL_PLAN_REVIEW_STATE_CHANGED:'+id);
    out.rows.push(hit);
  });out.sheet=sheet;out.headers=t.headers;return out;
}
function handleCancelShipmentDraft_(body) {
body = body || {};
var shipmentId = String(body.shipment_id || body.draft_id || '').trim();
var actor = String(body.actor || body.cancelled_by || body.updated_by || 'system_user').trim();
var reason = String(body.reason || body.cancel_reason || '').trim();
var expectedStatus = String(body.expected_status || '').trim().toLowerCase();
if (!shipmentId) return scfCancelOut_({ success: false, zero_write: true, code: 'MISSING_SHIPMENT_ID', error: 'Missing shipment_id' });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var shipSheet = ss.getSheetByName('shipments');
if (!shipSheet) return scfCancelOut_({ success: false, zero_write: true, code: 'SHIPMENTS_SHEET_NOT_FOUND', error: 'shipments sheet not found' });



var lock = null;
try { lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return scfCancelOut_({ success: false, zero_write: true, code: 'LOCK_UNAVAILABLE', error: 'Could not acquire lock; please retry.' }); }
catch (eL) { return scfCancelOut_({ success: false, zero_write: true, code: 'LOCK_ERROR', error: String(eL && eL.message ? eL.message : eL) }); }
function unlock_() { }   // R71 (C): the lock is released once, by the finally of the outer try below - on every exit, a throw included
var cxWriteStage_ = false;   // R71 (C): true from the first statement that may write
try {
sheetEnsureColumns_(shipSheet, ['status', 'cancelled_by', 'cancelled_at', 'cancel_reason', 'updated_at', 'updated_by']);
var sh = shipmentReadSheet_(shipSheet);
var idCol = sh.col('shipment_id');
if (idCol === -1) { unlock_(); return scfCancelOut_({ success: false, zero_write: true, code: 'SHIPMENT_ID_COLUMN_MISSING', error: 'shipment_id column not found' }); }
var row = -1;
for (var i = 1; i < sh.rows.length; i++) { if (String(sh.rows[i][idCol]).trim() === shipmentId) { row = i + 1; break; } }
if (row === -1) { unlock_(); return scfCancelOut_({ success: false, zero_write: true, code: 'SHIPMENT_NOT_FOUND', error: 'Shipment not found: ' + shipmentId }); }
var rv = sh.rows[row - 1];
function sc(name) { var c = sh.col(name); return c === -1 ? '' : String(rv[c] == null ? '' : rv[c]).trim(); }
var curStatus = sc('status').toLowerCase();
var planId = sc('shipping_plan_id');
var srcWarehouseId = sc('source_warehouse_id');



if (curStatus === SHIPMENT_CANCELLED_STATUS_) {
unlock_();
return jsonResponse_({ success: true, data: {
outcome: 'REUSED', shipment_id: shipmentId, shipping_plan_id: planId, status: SHIPMENT_CANCELLED_STATUS_,
already_cancelled: true, reservation_released: 0, movements_written: 0,
cancelled_by: sc('cancelled_by'), cancelled_at: sc('cancelled_at'), cancel_reason: sc('cancel_reason'),
note: 'This Shipment Draft was already cancelled. Nothing was written and no reservation was released twice.'
} });
}



var p1c_ = editP1Gate15f2_(sh.col('updated_at') === -1 ? undefined : rv[sh.col('updated_at')], body.expected_updated_at); if (!p1c_ && String(body.expected_updated_at == null ? '' : body.expected_updated_at).trim() !== '' && sh.col('updated_at') !== -1 && editTokSame_(rv[sh.col('updated_at')], body.expected_updated_at) !== 'SAME') p1c_ = { code: 'EDIT_CONFLICT', stage: 'edit_conflict', error: 'EDIT_CONFLICT: this shipment was changed since this cancel was sent. Nothing was cancelled. Reload it, then decide again.', data: { current_updated_at: editTok_(rv[sh.col('updated_at')]) } }; if (p1c_) { unlock_(); return scfCancelOut_(Object.assign({ success: false, zero_write: true, shipment_id: shipmentId }, p1c_)); }   /* R15F2 P1 (cancel has no other version check) */ if (expectedStatus && expectedStatus !== curStatus) {
unlock_();
return scfCancelOut_({ success: false, zero_write: true, code: 'SHIPMENT_STATUS_CHANGED', shipment_id: shipmentId,
data: { expected_status: expectedStatus, actual_status: curStatus },
error: 'This shipment is now "' + curStatus + '", not "' + expectedStatus + '". Reload and try again. Nothing was changed.' });
}



if (SHIPMENT_DISPATCHED_STATUSES_.indexOf(curStatus) !== -1) {
unlock_();
return scfCancelOut_({ success: false, zero_write: true, code: 'SHIPMENT_ALREADY_DISPATCHED', shipment_id: shipmentId,
data: { status: curStatus },
error: 'Cannot cancel: this shipment is "' + curStatus + '". A dispatched shipment is cancelled by a ' +
'reversal, never by a draft cancellation. Nothing was changed.' });
}
var hasStockMovement = false, hasRoutes = false, hasEvents = false;   // INT-CAND7 r7 (CH6-8): never throws
try { hasStockMovement = (typeof csdMovementExists_ === 'function') ? csdMovementExists_(ss, shipmentId) : false;
hasRoutes = (typeof csdCountRowsFor_ === 'function') ? csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', shipmentId) > 0 : false;
hasEvents = (typeof csdEventExists_ === 'function') ? csdEventExists_(ss, shipmentId) : false; }
catch (eEv_) { unlock_(); return scfCancelOut_({ success: false, zero_write: true, code: 'DISPATCH_STATE_UNKNOWN', shipment_id: shipmentId, data: { error: String(eEv_ && eEv_.message ? eEv_.message : eEv_) },
error: 'The dispatch rows of this shipment could not be READ, so the cancel was not attempted. Nothing was written. It may be retried once the rows can be read (it is checked again).' }); }
if (hasStockMovement || hasRoutes || hasEvents) {
unlock_();
return scfCancelOut_({ success: false, zero_write: true, code: 'SHIPMENT_ALREADY_DISPATCHED', shipment_id: shipmentId,
data: { status: curStatus, stock_movement: hasStockMovement, route_rows: hasRoutes, events: hasEvents },
error: 'Cannot cancel: this shipment already has dispatch evidence (stock movement / route / event), so ' +
'it has physically shipped even though its status reads "' + curStatus + '". Nothing was changed.' });
}
if (SHIPMENT_PRE_DISPATCH_STATUSES_.indexOf(curStatus) === -1) {

unlock_();
return scfCancelOut_({ success: false, zero_write: true, code: 'SHIPMENT_STATUS_NOT_CANCELLABLE', shipment_id: shipmentId,
data: { status: curStatus, cancellable_from: SHIPMENT_PRE_DISPATCH_STATUSES_ },
error: 'Cannot cancel a shipment in status "' + curStatus + '". Cancellable only from: ' +
SHIPMENT_PRE_DISPATCH_STATUSES_.join(', ') + '. Nothing was changed.' });
}


// INT-CAND8 (I1, spec r2 F2): the books of every key this cancel would release, inside the lock, before the first release
var cbBooks = shipmentCancelBooks_(ss, shipmentId, srcWarehouseId);
if (cbBooks.verdict !== 'RECONCILED') { unlock_(); return scfCancelOut_({ success: false, zero_write: true, code: cbBooks.verdict, shipment_id: shipmentId,
data: { keys_checked: cbBooks.keys, keys_mismatched: cbBooks.mismatched, keys_unknown: cbBooks.unknown, reservation_released: 0, movements_written: 0 },
error: shipmentBooksMessage_(cbBooks, 'Cancel Shipment Draft') }); }
var journal = [];
var released = 0, movementsWritten = 0, releases = [];
var xcoCx_ = xcoCancelPrepare_(ss, shipmentId, planId);   // XCO-R15G H1: every linked Plan, read and proven BEFORE the first write
if (xcoCx_.refuse) { unlock_(); return scfCancelOut_(xcoCx_.refuse); }
var reviewPlans_;
try { reviewPlans_=shipmentCancelReviewPlans_(ss,[planId].concat(xcoCx_.others||[]),shipmentId); }
catch(eReview){return scfCancelOut_({success:false,zero_write:true,code:'CANCEL_PLAN_REVIEW_UNPROVEN',error:String(eReview.message||eReview)});}
var scfAl_ = shipCancelAllocPrepare_(ss, shipmentId);   // SCF1 (F1): this shipment's draft PO allocations, read and proven BEFORE the first write
if (scfAl_.refuse) { unlock_(); return scfCancelOut_(scfAl_.refuse); }
cxWriteStage_ = true;
try {






var now0 = shipmentTimestamp_();
var domainSweep_ = [
{ domain: SHIPMENT_DOMAIN_FACTORY_, stock: ss.getSheetByName('factory_stock'), mov: ss.getSheetByName('factory_stock_movements') },
{ domain: SHIPMENT_DOMAIN_OVERSEAS_, stock: ss.getSheetByName('overseas_inventory_snapshot'), mov: ss.getSheetByName('overseas_inventory_movements') }
];
domainSweep_.forEach(function (d) {
if (!d.stock || !d.mov) return;
var sheetsD = { domain: d.domain, stockSheet: d.stock, movSheet: d.mov };
var held = shipmentDomainHeld_(d.domain, sheetsD, shipmentId);
cxKeys_ = cxKeys_ || {}; cxDom_ = cxDom_ || {}; var cxAny_ = false; Object.keys(held).forEach(function (hk) { var g = Math.round(held[hk] || 0); if (g <= 0) return; cxAny_ = true; cxKeys_[hk] = d.domain === SHIPMENT_DOMAIN_OVERSEAS_ ? { domain: d.domain, res: -g, avail: g } : { domain: d.domain, res: -g, cur: 0 }; });
if (cxAny_) cxDom_[d.domain] = { stock: d.stock, mov: d.mov, stockData: d.stock.getDataRange().getValues(), movStart: d.mov.getLastRow(), movIds: shipmentMovIdSet_(d.mov) };   // INT-CAND7 r4 / r5: the keys, their deltas, the start snapshot, mark and ledger id set
Object.keys(held).sort().forEach(function (key) {
var qty = Math.round(held[key] || 0);
if (qty <= 0) return;
var parts = key.split('||');
var rel = shipmentDomainRelease_(d.domain, sheetsD, {
warehouseId: parts[0], sku: parts[1], qty: qty, ownerId: shipmentId, journal: journal, now: now0,
createdBy: actor, releaseReason: 'shipment_draft_cancelled' + (reason ? (':' + reason) : '')
});
if (rel.applied) { released += rel.released; movementsWritten++; }
if (rel && rel.movementId) { cxIds_ = cxIds_ || {}; cxIds_[String(rel.movementId)] = 1; cxSeq_ = cxSeq_ || []; cxSeq_.push({ sheet: d.mov, id: String(rel.movementId) }); }   // INT-CAND7 r3/r4: the movement this cancel wrote, in order
releases.push({ warehouse_id: parts[0], sku: parts[1], source_domain: d.domain,
released_qty: rel.released, reason: rel.reason });
});
});

var now = shipmentTimestamp_();
function setShip_(name, value) {
var c = sh.col(name);
if (c === -1) return;
journal.push({ kind: 'cell', sheet: shipSheet, row: row, col: c, prev: rv[c], wrote: value, meta: /_at$/.test(name) });   // INT-CAND7 r4: journaled BEFORE the write, with the value (r5: a timestamp = meta)
shipSheet.getRange(row, c + 1).setValue(value);
}
var allocReleased_ = 0, allocIds_ = [];   // SCF1 (F1): this shipment's DRAFT PO allocations -> 'released' (never deleted); every cell journaled BEFORE its write
if (scfAl_.sheet) scfAl_.rows.forEach(function (a) {
[['allocation_status', 'released', false], ['released_by', actor, false], ['released_at', now, true], ['release_reason', 'shipment_draft_cancelled' + (reason ? (':' + reason) : ''), false], ['updated_at', now, true]].forEach(function (kv) {
var c = scfAl_.cols[kv[0]]; if (c === -1) return;
journal.push({ kind: 'cell', sheet: scfAl_.sheet, row: a.row, col: c, prev: a.prev[kv[0]], wrote: kv[1], meta: kv[2] });
scfAl_.sheet.getRange(a.row, c + 1).setValue(kv[1]);
});
allocReleased_++; allocIds_.push(a.id);
});
setShip_('status', SHIPMENT_CANCELLED_STATUS_);
setShip_('cancelled_by', actor);
setShip_('cancelled_at', now);
setShip_('cancel_reason', reason);
setShip_('updated_by', actor);
setShip_('updated_at', editNextStamp_(now, [sh.col('updated_at') === -1 ? '' : rv[sh.col('updated_at')]]));   // R71 small-3 (review m1)






var planCleared = reviewPlans_.rows.length>0;
reviewPlans_.rows.forEach(function(p){
  var values={status:'pending_approval',transferred_shipment_id:'',transferred_to_shipment_at:'',approved_by:'',approved_at:'',completed_by:'',completed_at:'',updated_by:actor,
    updated_at:editNextStamp_(now,[p.values[reviewPlans_.headers.indexOf('updated_at')]])};
  Object.keys(values).forEach(function(name){var c=reviewPlans_.headers.indexOf(name);if(c<0)return;
    journal.push({kind:'cell',sheet:reviewPlans_.sheet,row:p.row,col:c,prev:p.values[c],wrote:values[name],meta:/_at$/.test(name)});
    reviewPlans_.sheet.getRange(p.row,c+1).setValue(values[name]);
  });
});
SpreadsheetApp.flush();

xcoCx_.reviewReturned=true;
xcoCancelApply_(xcoCx_, journal, now, setShip_, sc('note'));   // linked Plan handoffs were returned above; preserve the link cancellation audit
SpreadsheetApp.flush();
reviewPlans_.rows.forEach(function(p){
  var saved=reviewPlans_.sheet.getRange(p.row,1,1,reviewPlans_.headers.length).getValues()[0];
  ['status','transferred_shipment_id','transferred_to_shipment_at','approved_by','approved_at','completed_by','completed_at'].forEach(function(name){
    var c=reviewPlans_.headers.indexOf(name);if(c<0)return;
    if(String(saved[c]||'')!==(name==='status'?'pending_approval':''))throw Error('CANCEL_PLAN_REVIEW_READBACK_FAILED:'+p.id+':'+name);
  });
});
unlock_();
return jsonResponse_({ success: true, data: {
outcome: 'CANCELLED', shipment_id: shipmentId, shipping_plan_id: planId,
status: SHIPMENT_CANCELLED_STATUS_, source_warehouse_id: srcWarehouseId,
reservation_released: released, movements_written: movementsWritten, releases: releases,
allocations_released: allocReleased_, allocation_ids_released: allocIds_.slice(0, 50), po_counters_changed: false,   // SCF1 (F1)
current_stock_changed: false,
plan_handoff_cleared: planCleared, linked_plans_cleared: (xcoCx_ && xcoCx_.others) ? xcoCx_.others.slice() : [],
plan_execution_commit: planCleared ? 'PENDING_APPROVAL' : '', plans_returned_to_pending: reviewPlans_.rows.map(function(p){return p.id;}),
cancelled_by: actor, cancelled_at: now, cancel_reason: reason,
note: 'The reservation was released and current stock was NOT deducted. Linked Shipping Plans returned to Pending Approval and require approval again.'
} });
} catch (e) {
// INT-CAND7 r3 (F-B7-4): a CHECKED replay - stop and keep on any doubt; never 'unchanged' unless every undo was proven
var cxKeys_, cxIds_, cxDom_, cxSeq_;
var cxR = shipmentCheckedReplay_(journal, { owner: shipmentId, planId: planId, planIds: (typeof xcoCx_ !== 'undefined' && xcoCx_ && xcoCx_.others) ? xcoCx_.others : [], keys: cxKeys_ || {}, doms: cxDom_ || {}, seq: cxSeq_ || [], lastSheets: ['shipments', 'shipping_plans'],
identify: function (n, H, v, e) { if (n !== 'shipment_line_allocations') return null; var f = (typeof scfAl_ !== 'undefined' && scfAl_ && scfAl_.byRow) ? scfAl_.byRow[e.row] : null, ai = H.indexOf('shipment_line_allocation_id'), li = H.indexOf('shipment_line_id');   // SCF1 (F1)
return (f && ai !== -1 && li !== -1 && String(v[ai] == null ? '' : v[ai]).trim() === f.id && String(v[li] == null ? '' : v[li]).trim() === f.lid) ? true : 'NOT_AN_ALLOCATION_THIS_CANCEL_RELEASED'; } });
unlock_();
if (!cxR.complete) return scfCancelOut_({ success: false, zero_write: false, code: 'CANCEL_ROLLBACK_UNVERIFIED', shipment_id: shipmentId, stage: 'write_rollback_stopped', data: { stopped_at: cxR.phase, left: cxR.left.slice(0, 20), undone: cxR.done.slice(0, 40) },
error: 'Cancellation failed (' + String(e && e.message ? e.message : e) + ') and its rollback STOPPED (' + cxR.phase + ': ' + cxR.left.slice(0, 3).join('; ') + '). ' + cxR.done.length + ' undo step(s) were verified; everything else is KEPT as it is now. ' +
'Each released key is undone cell first, then its ledger row; the shipment status and the plan cells LAST (the status is the commit marker), so a stop leaves the status as the cancel left it. A key named CELL_ABOVE_LEDGER keeps that quantity reserved until it is reviewed; a key named CELL_BELOW_LEDGER has less reserved than its ledger and the reservation-books check blocks it until it is reviewed. ' + shipmentReservationReviewText_() });
return scfCancelOut_({ success: false, zero_write: false, code: 'CANCEL_ROLLED_BACK', shipment_id: shipmentId, stage: 'write_rolled_back',
error: 'Cancellation failed and was rolled back: ' + String(e && e.message ? e.message : e) +
'. Every undo step was checked (its row, its own id or key, and the value this cancel had written) and verified afterwards; timestamps are restored by row identity only.' });
}
} catch (eCx_) {
// R71 (C): an unexpected throw after the lock (a missing header, a read, the books message, the checked replay itself). zero_write is
// claimed only when nothing could have been written: the write stage was never entered and nothing is journaled.
var cxN_ = journal && journal.length ? journal.length : 0, cxZ_ = !cxWriteStage_ && cxN_ === 0, cxL_ = [];
try { (journal || []).slice(0, 40).forEach(function (j) { cxL_.push({ kind: j.kind || '', sheet: j.sheet && typeof j.sheet.getName === 'function' ? j.sheet.getName() : '', row: j.row, col: j.col == null ? '' : j.col + 1 }); }); } catch (eJ_) {}
return scfCancelOut_({ success: false, code: 'SHIPMENT_CANCEL_FAILED', zero_write: cxZ_, shipment_id: shipmentId, stage: cxZ_ ? 'before_any_write' : 'after_writes_started',
data: { journal_entries: cxN_, written: cxL_, reservation_released: cxZ_ ? 0 : null, movements_written: cxZ_ ? 0 : null },
error: 'Cancellation stopped with an error (' + String(eCx_ && eCx_.message ? eCx_.message : eCx_) + '). ' + (cxZ_ ? 'Nothing was written; it may be retried once the cause is fixed.' : 'Writes may have landed and their rollback did not finish (' + cxN_ + ' journaled step(s), listed in data.written; a write that landed and threw before it was journaled is not listed). Review the shipment and its reservation books before anything else; do not retry blindly.') });
} finally { try { if (lock) lock.releaseLock(); } catch (eRl_) { /* only the lock taken above */ } }
}
















// SCF1 (2026-11-13, shipment-cancel fix F4): a cancel REFUSAL carries its zero-write proof inside data as well. The page's command layer keeps
// json.data as the error details and drops top-level fields, so a top-level zero_write alone never reached the page. Pre-write refusals say
// zero_write: true; a rollback (verified or stopped) says false; SHIPMENT_CANCEL_FAILED keeps its own computed value.
function scfCancelOut_(o) {
if (o && o.success === false) { o.zero_write = o.zero_write === true; o.data = Object.assign({}, (o.data && typeof o.data === 'object') ? o.data : {}, { zero_write: o.zero_write }); }
return jsonResponse_(o);
}
// SCF1 (2026-11-13, shipment-cancel fix F1): THIS shipment's PO allocations, read inside the cancel's lock BEFORE the first write. Read-only.
// - an EXECUTED allocation on one of its lines is dispatch evidence -> SHIPMENT_ALREADY_DISPATCHED (Owner rule 3);
// - a status outside {draft, executed, released, cancelled, void, voided} on its lines -> CANCEL_ALLOCATION_STATUS_UNKNOWN;
// - a draft with a blank or repeated shipment_line_allocation_id, or a blank line id on the shipment -> CANCEL_ALLOCATION_IDENTITY_UNPROVEN;
// - an absent column it must read or write -> CANCEL_ALLOCATIONS_UNREADABLE. Every refusal is zero-write.
// Only rows still 'draft' are returned, so a retry after a stopped rollback releases only what is still draft (exactly once).
function shipCancelAllocPrepare_(ss, shipmentId) {
var out = { sheet: null, rows: [], cols: {}, byRow: {} };
function T(v) { return String(v == null ? '' : v).trim(); }
function no(code, why, extra) { return { refuse: { success: false, code: code, zero_write: true, shipment_id: shipmentId, stage: 'allocations',
data: Object.assign({ why: why, reservation_released: 0, movements_written: 0, allocations_released: 0 }, extra || {}),
error: 'Cannot cancel: ' + why + '. Nothing was written.' } }; }
var aSh = ss.getSheetByName('shipment_line_allocations'); if (!aSh) return out;
var lSh = ss.getSheetByName('shipment_lines'), mine = {}, nMine = 0;
if (lSh) { var ln = shipmentReadSheet_(lSh), lS = ln.col('shipment_id'), lI = ln.col('shipment_line_id');
if (ln.rows.length > 1 && (lS === -1 || lI === -1)) return no('CANCEL_ALLOCATIONS_UNREADABLE', 'shipment_lines has no shipment_id / shipment_line_id column');
for (var i = 1; i < ln.rows.length; i++) { if (T(ln.rows[i][lS]) !== shipmentId) continue; var lid = T(ln.rows[i][lI]);
if (!lid) return no('CANCEL_ALLOCATION_IDENTITY_UNPROVEN', 'a line of this shipment has a blank shipment_line_id, so its allocations cannot be identified'); mine[lid] = 1; nMine++; } }
if (!nMine) return out;
var al = shipmentReadSheet_(aSh), cS = al.col('allocation_status'), cL = al.col('shipment_line_id'), cI = al.col('shipment_line_allocation_id');
if (al.rows.length > 1 && (cS === -1 || cL === -1 || cI === -1)) return no('CANCEL_ALLOCATIONS_UNREADABLE', 'shipment_line_allocations has no allocation_status / shipment_line_id / shipment_line_allocation_id column');
var ENDED = ['released', 'cancelled', 'void', 'voided'], seen = {}, exec = [], odd = [];
for (var r = 1; r < al.rows.length; r++) { if (!mine[T(al.rows[r][cL])]) continue;
var st = T(al.rows[r][cS]).toLowerCase(), id = T(al.rows[r][cI]);
if (st === 'executed') { exec.push(id || ('row ' + (r + 1))); continue; }
if (ENDED.indexOf(st) >= 0) continue;
if (st !== 'draft') { odd.push((id || ('row ' + (r + 1))) + ' "' + st + '"'); continue; }
if (!id || seen[id]) return no('CANCEL_ALLOCATION_IDENTITY_UNPROVEN', 'a draft allocation of this shipment has a ' + (id ? 'repeated shipment_line_allocation_id (' + id + ')' : 'blank shipment_line_allocation_id (row ' + (r + 1) + ')'));
seen[id] = 1; out.rows.push({ row: r + 1, id: id, lid: T(al.rows[r][cL]) }); }
if (exec.length) return no('SHIPMENT_ALREADY_DISPATCHED', 'an allocation of this shipment is already EXECUTED (' + exec.slice(0, 5).join(', ') + '), so it has dispatched; a dispatched shipment is cancelled by a reversal, never by a draft cancellation', { executed_allocations: exec.slice(0, 20) });
if (odd.length) return no('CANCEL_ALLOCATION_STATUS_UNKNOWN', 'an allocation of this shipment has a status this cancel does not know (' + odd.slice(0, 5).join(', ') + ')', { allocations: odd.slice(0, 20) });
if (!out.rows.length) return out;
var miss = ['released_by', 'released_at', 'release_reason'].filter(function (n) { return al.col(n) === -1; });
if (miss.length) return no('CANCEL_ALLOCATIONS_UNREADABLE', 'shipment_line_allocations has no ' + miss.join(' / ') + ' column, so a release cannot be recorded');
['allocation_status', 'released_by', 'released_at', 'release_reason', 'updated_at'].forEach(function (n) { out.cols[n] = al.col(n); });
out.rows.forEach(function (x) { var v = al.rows[x.row - 1]; x.prev = {}; Object.keys(out.cols).forEach(function (n) { x.prev[n] = out.cols[n] === -1 ? '' : v[out.cols[n]]; }); out.byRow[x.row] = x; });
out.sheet = aSh; return out;
}
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
if ((v === '' || v == null) && legacyCol !== -1) v = row[legacyCol];
return shipmentNum_(v);
}
var tQty = 0, tCtn = 0, tCbm = 0, tGross = 0, tNet = 0, cbmU = false, grossU = false;   // R15C-AGL
for (var i = 1; i < ls.rows.length; i++) {
if (String(ls.rows[i][lIdCol]).trim() !== String(shipmentId).trim() || sc13RowRemoved_(ls, ls.rows[i])) continue;   // XCO-R15G H2
var ctn = fallbackNum_(ls.rows[i], ctnCol, ctnLegacyCol);
tQty += fallbackNum_(ls.rows[i], qtyCol, qtyLegacyCol);
tCtn += ctn;


var cbmVal = (cbmCol !== -1) ? ls.rows[i][cbmCol] : '';
if (cbmVal === '' || cbmVal == null) cbmVal = (cbmLegacyCol === -1 || !shipMeasureKnown15c_(ls.rows[i][cbmLegacyCol])) ? '' : shipmentNum_(ls.rows[i][cbmLegacyCol]) * ctn;   // R15C-AGL
if (shipMeasureKnown15c_(cbmVal)) tCbm += shipmentNum_(cbmVal); else cbmU = true;
var gv15c = grossCol === -1 ? '' : ls.rows[i][grossCol]; if (shipMeasureKnown15c_(gv15c)) tGross += shipmentNum_(gv15c); else grossU = true;
tNet += shipmentNum_(netCol === -1 ? 0 : ls.rows[i][netCol]);
}
sheetEnsureColumns_(shipSheet, ['shipment_total_qty', 'shipment_total_cartons', 'shipment_total_cbm',
'shipment_total_gross_weight', 'shipment_total_net_weight']);
var sh = shipmentReadSheet_(shipSheet);
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
setTotal_('shipment_total_cbm', cbmU ? '' : shipmentNum_(Math.round(tCbm * 10000) / 10000));   // R15C-AGL: unknown stays blank
setTotal_('shipment_total_gross_weight', grossU ? '' : shipmentNum_(Math.round(tGross * 1000) / 1000));
setTotal_('shipment_total_net_weight', shipmentNum_(Math.round(tNet * 1000) / 1000));
}










// Read-only request view: every table is loaded once for ONE options request, never shared with a write.
function shipRateReadView_(ss) {
var tables = {};
return { getSheetByName: function (name) {
if (Object.prototype.hasOwnProperty.call(tables, name)) return tables[name];
var sh = ss.getSheetByName(name); if (!sh) return (tables[name] = null);
var values = null;
function data() { return values || (values = sh.getDataRange().getValues()); }
function clone(rows) { return rows.map(function (r) { return r.map(function (v) { return v instanceof Date ? new Date(v.getTime()) : v; }); }); }
return (tables[name] = {
getName: function () { return name; }, getLastColumn: function () { return sh.getLastColumn(); }, getLastRow: function () { return sh.getLastRow(); },
getDataRange: function () { return { getValues: function () { return clone(data()); } }; },
getRange: function (row, col, nr, nc) { if (!(row > 0 && col > 0 && nr > 0 && nc > 0)) throw new Error('READ_RANGE_UNSUPPORTED'); return { getValues: function () { return clone(data().slice(row - 1, row - 1 + nr).map(function (r) { return r.slice(col - 1, col - 1 + nc); })); } }; }
});
}, getId: function () { return ss.getId(); }, getSpreadsheetTimeZone: function () { return ss.getSpreadsheetTimeZone(); } };
}
function shipRateDestination_(ss, v) {
var S = function (x) { return String(x == null ? '' : x).trim(); }, wid = S(v.destination_warehouse_id || v.warehouse_id), code = S(v.warehouse_code);
var key = [wid, code, S(v.country)].join('|');
if (v.__rateDestination && v.__rateDestination.key === key) return v.__rateDestination;
var result = { key: key, code: code, city: '', postal: '' };
if (!wid && !code) return result;
var sh = ss.getSheetByName('warehouses'); if (!sh) throw new Error('RATE_DESTINATION_TABLE_UNAVAILABLE');
var s = shipmentReadSheet_(sh), rows = s.rows.slice(1).filter(function (r) { return wid ? S(r[s.col('warehouse_id')]) === wid : S(r[s.col('warehouse_code')]).toLowerCase() === code.toLowerCase(); });
if (rows.length !== 1) throw new Error('RATE_DESTINATION_NOT_UNIQUE');
var r = rows[0], country = S(r[s.col('country')]);
if (country && S(v.country) && country.toLowerCase() !== S(v.country).toLowerCase() && !shipSetMember15e_(S(v.country), country)) throw new Error('RATE_DESTINATION_COUNTRY_MISMATCH');   // R15C-EU: a planning set admits its member warehouses only
result.country = country || S(v.country);   // R15C-EU: the warehouse's authoritative country prices, cards and times the shipment
result.code = S(r[s.col('warehouse_code')]) || code;
result.city = S(r[s.col('city')]); result.postal = S(r[s.col('postal_code')]);
if ((!result.city || !result.postal) && typeof partyResolveConsignee_ === 'function' && typeof partyReadLogisticsLocations_ === 'function') {
var p = partyResolveConsignee_(partyReadLogisticsLocations_(ss), v, null);
if (p && p.ok) {
if (S(p.consignee.country) && S(v.country) && S(p.consignee.country).toLowerCase() !== S(v.country).toLowerCase() && !shipSetMember15e_(S(v.country), S(p.consignee.country))) throw new Error('RATE_DESTINATION_COUNTRY_MISMATCH');   // R15C-EU
result.city = result.city || S(p.consignee.city); result.postal = result.postal || S(p.consignee.postal_code);
}
}
v.__rateDestination = result; return result;
}
var SHIP_UNPRICED_COST_FIELDS_ = ['estimated_duty_currency', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost'];
// R15c-P0 r2 (handoff §4, review m-1): the readback compares the TIME field by what the sheet stores. A Date cell is formatted in the SPREADSHEET
// time zone and must equal the written 'yyyy-MM-dd HH:mm:ss' string; a string cell must equal it exactly (editTok_ normalised). Anything else
// (empty, invalid, no sheet zone) is NOT the same - the readback refuses. Every other field stays an exact shipRcCanon_ compare.
var SHIP_UNPRICED_TIME_FIELDS_ = ['updated_at'];
function shipRcTimeSame_(cell, wrote) {
  var w = String(wrote == null ? '' : wrote).trim(); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(w)) return false;
  if (cell !== null && typeof cell === 'object' && typeof cell.getTime === 'function') {
    if (isNaN(cell.getTime())) return false;
    var tz = ''; try { tz = String(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || ''); } catch (e) { tz = ''; } if (!tz) return false;
    return Utilities.formatDate(cell, tz, 'yyyy-MM-dd HH:mm:ss') === w;
  }
  return editTok_(cell) === w;
}
function shipUnpricedMeta_(value) {
var m = /^unpriced1\|([^|]+)\|([0-9a-f]{24})$/.exec(String(value || ''));
if (!m) return null;
try { var a = JSON.parse(decodeURIComponent(m[1])); return a && typeof a.reason === 'string' && a.reason.trim() && typeof a.actor === 'string' && a.actor && typeof a.at === 'string' && a.at && typeof a.label === 'string' && a.label ? a : null; } catch (e) { return null; }
}
function shipUnpricedReceipt_(v, audit) {
var text = encodeURIComponent(JSON.stringify(audit));
var keys = SHIP_RC_SEL_FIELDS_.concat(['source_warehouse_id', 'destination_warehouse_id', 'warehouse_id']);
var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([text].concat(keys.map(function (k) { return shipRcCanon_(v[k]); }))), Utilities.Charset.UTF_8);
return 'unpriced1|' + text + '|' + digest.slice(0, 12).map(function (x) { return ((x & 255) + 256).toString(16).slice(1); }).join('');
}
function shipServiceLabel_(ss, v) {
// Resolve service text independently of price eligibility. Never select a quote here.
var sh = ss.getSheetByName('carrier_rate_cards');
if (!sh) return '';
var t = shipmentReadSheet_(sh), country = typeof sfoDestCountry15g_ === 'function' ? sfoDestCountry15g_(ss, v) : v.country;
var labels = [];
t.rows.slice(1).forEach(function (row) {
var r = {}; t.headers.forEach(function (k, i) { r[k] = row[i]; });
var text = String(r.shipping_method_label || '').trim();
if (!text || ['carrier_id','shipping_method','last_mile_delivery'].some(function (k) { return String(r[k] || '').trim().toLowerCase() !== String(v[k] || '').trim().toLowerCase(); })) return;
if (r.destination_country && String(r.destination_country).trim().toUpperCase() !== String(country || '').trim().toUpperCase()) return;
if (!shippingRateActive_(r, shipmentTimestamp_().slice(0, 10))) return;
if (labels.indexOf(text) < 0) labels.push(text);
});
return labels.length === 1 ? labels[0] : '';
}
function shipUnpricedEligibility_(ss, v, lines, day, mode) {   // R15e (4): mode '' | 'card_not_applied'
// AD3-B (Owner decisions 4 + 8): the explicit "skip quote, cost pending" decision is no longer Sandbox-only - a missing quote is never the only blocker.
if (/^pending/.test(String(v.rate_card_version || ''))) return { allowed: false, reason: 'SELECTION_OUTCOME_NEEDS_REVIEW' };
if (!String(v.carrier_id || '').trim() || !String(v.shipping_method || '').trim() || !String(v.country || '').trim() || !String(v.warehouse_code || '').trim()) return { allowed: false, reason: 'COMPLETE_SHIPMENT_FIRST' };
if (!lines.length || lines.some(function (l) { return !l.sku || !(Number(l.qty) > 0); })) return { allowed: false, reason: 'SHIPMENT_LINES_INVALID' };
var cs = ss.getSheetByName('carriers'), rateSheet = ss.getSheetByName('carrier_rate_cards'); if (!cs || !rateSheet) throw new Error('RATE_SOURCE_UNAVAILABLE');
var rateCols = shipmentReadSheet_(rateSheet);
if (['rate_card_id', 'carrier_id', 'destination_country', 'shipping_method', 'last_mile_delivery', 'status', 'effective_from', 'effective_to', 'battery_type', 'destination_warehouse_code', 'destination_city', 'destination_postal_code_start', 'destination_postal_code_end', 'marketplace', 'customs_type'].some(function (k) { return rateCols.col(k) < 0; })) throw new Error('RATE_SOURCE_COLUMNS_UNAVAILABLE');
var sr = shipmentReadSheet_(cs), carrier = sr.rows.slice(1).filter(function (r) { return String(r[sr.col('carrier_id')] || '').trim() === String(v.carrier_id).trim(); });
if (carrier.length !== 1) return { allowed: false, reason: 'CARRIER_NOT_UNIQUE' };
if ((sr.col('status') >= 0 && /^(inactive|disabled)$/i.test(String(carrier[0][sr.col('status')] || '').trim())) || (sr.col('is_active') >= 0 && /^(false|0|no)$/i.test(String(carrier[0][sr.col('is_active')]).trim()))) return { allowed: false, reason: 'CARRIER_INACTIVE' };
var battery = shipBatteryClass_(ss, lines.map(function (l) { return l.sku; }));
if (battery.unclassified.length) return { allowed: false, reason: 'RATE_CARD_BATTERY_UNCLASSIFIED' };
if (battery.cls === 'lithium_battery') return { allowed: false, reason: 'LITHIUM_CARRIER_CLEARANCE_REQUIRED' };
var laneIds = shipRateCardLane_(ss, v, lines, day).filter(function (rc) { return String(rc.carrier_id || '').trim() === String(v.carrier_id).trim(); }).map(function (rc) { return String(rc.rate_card_id || '').trim(); }).sort();   // R15e (4)
if (laneIds.some(function (id) { return !id; }) || laneIds.some(function (id, i) { return i > 0 && laneIds[i - 1] === id; })) return { allowed: false, reason: 'APPLICABLE_CARD_IDS_UNREADABLE' };
if (laneIds.length && mode !== 'card_not_applied') return { allowed: false, reason: 'APPLICABLE_RATE_AVAILABLE', cards: laneIds };
if (!laneIds.length && mode === 'card_not_applied') return { allowed: false, reason: 'NO_CARD_TO_LEAVE_UNAPPLIED' };
var label = shipServiceLabel_(ss, v) || ({ sea: 'Sea', sea_express: 'Sea Express', air: 'Air', truck: 'Truck', courier: 'Courier', express: 'Express' })[String(v.shipping_method).trim().toLowerCase()];
if (!label) return { allowed: false, reason: 'SHIPPING_METHOD_LABEL_UNRESOLVED' };
return laneIds.length ? { allowed: true, reason: 'CARD_NOT_APPLIED', label: label, cards: laneIds } : { allowed: true, reason: 'NO_APPLICABLE_RATE', label: label };   // R15e (4)
}
// Temporary operating policy: a proven absence of an applicable quote needs no manual exception.
function shipNoRatePolicy_(ss, v, lines, day) {
  if (String(v.rate_card_id || '').trim() || String(v.rate_card_version || '').trim() || SHIP_UNPRICED_COST_FIELDS_.some(function (k) { return String(v[k] == null ? '' : v[k]).trim() !== ''; })) return { allowed: false };
  if (['draft', 'ready_to_ship'].indexOf(String(v.status || '').trim().toLowerCase()) < 0) return { allowed: false };
  var e = shipUnpricedEligibility_(ss, v, lines, day);
  return e.allowed === true && e.reason === 'NO_APPLICABLE_RATE' ? { allowed: true, label: e.label, policy: 'NO_RATE_COST_PENDING_V1' } : { allowed: false };
}
function shipUnpricedValid_(ss, v, lines, day) {
var audit = shipUnpricedMeta_(v.rate_card_version);
if (!audit || String(v.rate_card_id || '').trim() || SHIP_UNPRICED_COST_FIELDS_.some(function (k) { return String(v[k] == null ? '' : v[k]).trim() !== ''; })) return false;
if (shipUnpricedReceipt_(v, audit) !== String(v.rate_card_version) || audit.lines !== shipUnpricedLines_(lines)) return false;
if (SHIPMENT_DISPATCHED_STATUSES_.indexOf(String(v.status || '').trim().toLowerCase()) >= 0) return true;
if (['draft', 'ready_to_ship'].indexOf(String(v.status || '').trim().toLowerCase()) < 0) return false;
var e4 = shipUnpricedEligibility_(ss, v, lines, day, audit.basis === 'CARD_NOT_APPLIED' ? 'card_not_applied' : '');   // R15e (4): valid only while the facts of the decision still hold
return e4.allowed === true && (audit.basis === 'CARD_NOT_APPLIED' ? JSON.stringify(e4.cards) === JSON.stringify(audit.cards || null) : (audit.basis === undefined || audit.basis === 'NO_APPLICABLE_RATE'));
}
function shipUnpricedLines_(lines) { return JSON.stringify(lines.map(function (l) { return [String(l.sku || ''), Number(l.qty)]; }).sort(function (a, b) { return JSON.stringify(a).localeCompare(JSON.stringify(b)); })); }
function shipApproveUnpriced_(body) {
var sid = String(body.shipment_id || '').trim(), reason = String(body.reason || '').trim(), actor = String(body.actor || body.updated_by || '').trim().slice(0, 100) || 'phase1-unattributed';   // AD3-B: the DECLARED operator (anonymous web app: client_declared, not verified)
if (!sid || body.acknowledge_unpriced !== true || !reason || reason.length > 500 || !actor || actor.length > 100 || !String(body.expected_updated_at || '').trim() || !body.hasOwnProperty('expected_current_rate_card_id') || !body.hasOwnProperty('expected_rate_card_version')) return shipRcNo_('UNPRICED_ACKNOWLEDGEMENT_REQUIRED');
var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return shipRcNo_('LOCK_TIMEOUT'); } catch (e) { return shipRcNo_('LOCK_TIMEOUT'); }
try {
var ss = SpreadsheetApp.getActiveSpreadsheet(), r = shipRow_(ss, sid);
if (!r || r.dup) return shipRcNo_(r ? 'SHIPMENT_DUPLICATED' : 'SHIPMENT_NOT_FOUND');
var v = r.v, st = String(v.status || '').trim().toLowerCase();
if (['draft', 'ready_to_ship'].indexOf(st) < 0) return shipRcNo_('SHIPMENT_NOT_EDITABLE');
if (editTokSame_(v.updated_at, body.expected_updated_at) !== 'SAME' || String(v.rate_card_id || '') !== String(body.expected_current_rate_card_id || '') || String(v.rate_card_version || '') !== String(body.expected_rate_card_version || '')) return shipRcNo_('EDIT_CONFLICT');
var required = ['rate_card_id', 'rate_card_version', 'carrier_id', 'updated_at', 'updated_by'].concat(SHIP_UNPRICED_COST_FIELDS_);
if (required.some(function (k) { return r.s.col(k) < 0; })) return shipRcNo_('UNPRICED_NOT_PERSISTABLE');
if (String(body.carrier_id || '').trim() !== String(v.carrier_id || '').trim()) return shipRcNo_('UNPRICED_CARRIER_CHANGE_NOT_ALLOWED');
if (body.recover_unpriced !== true && shipUnpricedMeta_(v.rate_card_version) && shipUnpricedValid_(ss, v, shipRcLines_(ss, sid), shipmentTimestamp_().slice(0, 10))) return shipRcNo_('UNPRICED_ALREADY_APPROVED');   // R15e (3)
var target = Object.assign({}, v);
if (body.recover_unpriced === true) {
if (String(v.rate_card_version || '') !== 'pending-unpriced') return shipRcNo_('UNPRICED_RECOVERY_NOT_APPLICABLE');
target.rate_card_version = '';
}
var mode4 = body.unpriced_mode === undefined || body.unpriced_mode === '' ? '' : body.unpriced_mode === 'card_not_applied' ? 'card_not_applied' : null;   // R15e (4)
if (mode4 === null) return shipRcNo_('UNPRICED_MODE_UNKNOWN');
if (mode4 && (body.acknowledge_card_not_applied !== true || !Array.isArray(body.listed_card_ids))) return shipRcNo_('UNPRICED_ACKNOWLEDGEMENT_REQUIRED');
var day = shipmentTimestamp_().slice(0, 10), check = shipUnpricedEligibility_(ss, target, shipRcLines_(ss, sid), day, mode4);
if (!check.allowed) return shipRcNo_(check.reason, check.cards ? { cards: check.cards } : undefined);
if (mode4 && JSON.stringify(body.listed_card_ids.map(function (x) { return String(x || '').trim(); }).sort()) !== JSON.stringify(check.cards)) return shipRcNo_('CARD_SET_CHANGED', { cards: check.cards });
var who4 = shipAuditIdentity_(body, 'shipment.selectRateCard.unpriced_release'), audit = { reason: reason, actor: actor, actor_source: 'client_declared', reported_operator_verified: false, server_principal: who4.server_principal, principal_basis: who4.principal_basis, operation_id: String(body.operation_id || '').trim().slice(0, 80), at: shipmentTimestamp_(), label: check.label, lines: shipUnpricedLines_(shipRcLines_(ss, sid)), basis: check.reason, cards: check.cards }, changes = { rate_card_id: '', carrier_id: target.carrier_id, updated_by: actor, updated_at: editNextStamp_(shipmentTimestamp_(), [v.updated_at]) };
SHIP_UNPRICED_COST_FIELDS_.forEach(function (k) { changes[k] = ''; });
var n = 0, put = function (k, value) { n++; r.sheet.getRange(r.row, r.s.col(k) + 1).setValue(value); };
function back() { SpreadsheetApp.flush(); var row = r.sheet.getRange(r.row, 1, 1, r.s.headers.length).getValues()[0], obj = {}; r.s.headers.forEach(function (k, i) { obj[k] = row[i]; }); return obj; }
try {
put('rate_card_version', 'pending-unpriced');
Object.keys(changes).forEach(function (k) { put(k, changes[k]); });
var b = back();
if (String(b.shipment_id).trim() !== sid || String(b.rate_card_version) !== 'pending-unpriced' || Object.keys(changes).some(function (k) { return SHIP_UNPRICED_TIME_FIELDS_.indexOf(k) >= 0 ? !shipRcTimeSame_(b[k], changes[k]) : shipRcCanon_(b[k]) !== shipRcCanon_(changes[k]); })) throw new Error('UNPRICED_WRITE_UNVERIFIED');   // R15c-P0
put('rate_card_version', shipUnpricedReceipt_(b, audit)); b = back();
if (!shipUnpricedValid_(ss, b, shipRcLines_(ss, sid), day)) throw new Error('UNPRICED_WRITE_UNVERIFIED');
return jsonResponse_({ success: true, verified: true, shipment_id: sid, state: 'UNPRICED_APPROVED', quote_state: 'COST_PENDING', audit: { actor: audit.actor, actor_source: audit.actor_source, at: audit.at, reason: audit.reason, basis: audit.basis }, updated_at: b.updated_at, writes: n });
} catch (eW) { return jsonResponse_({ success: false, code: 'UNPRICED_WRITE_UNVERIFIED', error: 'Reload and check the shipment. Nothing was resent.', zero_write: n === 0, outcome: 'UNKNOWN' }); }
} finally { try { lock.releaseLock(); } catch (eR) {} }
}
var SHIP_RC_VERSION_FIELDS_ = ['rate_card_id', 'carrier_id', 'origin_country', 'origin_city', 'destination_country', 'destination_city', 'destination_postal_code_start', 'destination_postal_code_end',
'destination_warehouse_code', 'marketplace', 'shipping_method', 'last_mile_delivery', 'shipping_method_label', 'charge_type', 'charge_unit', 'dim_divisor', 'min_box_weight', 'min_box_weight_unit',
'weight_tier', 'weight_tier_unit', 'currency', 'unit_rate', 'min_charge', 'fuel_surcharge', 'customs_fee', 'doc_fee', 'transit_type', 'battery_type', 'customs_type', 'import_duty_treatment',
'effective_from', 'effective_to', 'status', 'updated_at'];
function shipRateCardVersion_(rc) {
var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(SHIP_RC_VERSION_FIELDS_.map(function (k) { var v = rc[k]; return v instanceof Date ? v.toISOString() : String(v == null ? '' : v).trim(); })), Utilities.Charset.UTF_8);
return 'rcv1:' + d.slice(0, 12).map(function (b) { return ((b & 255) + 256).toString(16).slice(1); }).join('');
}
function shipRow_(ss, sid) {
var sh = ss.getSheetByName('shipments'), s = sh && shipmentReadSheet_(sh), i, o = null;
for (i = 1; s && i < s.rows.length; i++) if (String(s.rows[i][s.col('shipment_id')]).trim() === sid) { if (o) return { dup: true }; o = { row: i + 1, sheet: sh, s: s, v: {} }; s.headers.forEach(function (h, c) { o.v[h] = s.rows[i][c]; }); }
if (o && !o.dup) sc13AssertReady_(o.v);
return o;
}
function shipRcLines_(ss, sid) { var sh = ss.getSheetByName('shipment_lines'), s = sh && shipmentReadSheet_(sh), out = [], i; for (i = 1; s && i < s.rows.length; i++) if (String(s.rows[i][s.col('shipment_id')]).trim() === sid && !sc13RowRemoved_(s, s.rows[i])) out.push({ sku: String(s.rows[i][s.col('sku')] || '').trim(), qty: shipmentNum_(s.rows[i][s.col('shipment_qty')]) }); return out; }


function shipBatteryClass_(ss, skus) {
var sh = ss.getSheetByName('sku_details'), s = sh && shipmentReadSheet_(sh), un = [], li = false;
(skus || []).forEach(function (k) {
var rows = [], i, kind; k = String(k || '').trim();
for (i = 1; s && s.col('sku') >= 0 && i < s.rows.length; i++) if (String(s.rows[i][s.col('sku')] || '').trim() === k) rows.push(s.rows[i][s.col('battery_type')]);
kind = rows.length === 1 && s.col('battery_type') >= 0 ? kmBatteryKind_(String(rows[0] == null ? '' : rows[0])) : null;
if (!kind) un.push(k); else if (kind === 'lithium_battery' || kind === 'rechargeable_lithium') li = true;
});
return { cls: li ? 'lithium_battery' : '', unclassified: un };
}
function shipRateCardLane_(ss, v, lines, day) {
var mk = String(v.marketplace || '').trim(), multi = mk.toUpperCase() === 'MULTI', bc = shipBatteryClass_(ss, lines.map(function (l) { return l.sku; }));
if (bc.unclassified.length) return [];
var c = shippingMatchRateCards_(ss, { destinationCountry: shipRateCountry15e_(ss, v), shippingMethod: v.shipping_method, lastMile: v.last_mile_delivery, customsType: v.shipments_customs_type,
marketplace: multi ? 'MULTI' : mk, destinationWarehouseCode: shipRateDestination_(ss, v).code,
destinationCity: shipRateDestination_(ss, v).city, destinationPostalCode: shipRateDestination_(ss, v).postal, batteryType: bc.cls, quoteDate: day }, true);
return multi ? c.filter(function (x) { return String(x.marketplace || '').trim() === ''; }) : c;
}


var SHIP_RC_SEL_FIELDS_ = ['shipment_id', 'rate_card_id', 'carrier_id', 'country', 'marketplace', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type', 'warehouse_code', 'import_duty_treatment',
'shipment_total_gross_weight', 'shipment_total_cbm', 'shipment_total_cartons', 'shipment_total_qty', 'currency', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost'];
function shipRcCanon_(x) { if (x instanceof Date) return x.toISOString(); var s = String(x == null ? '' : x).trim(); return s !== '' && isFinite(Number(s)) ? String(Number(s)) : s.toLowerCase(); }
function shipRcReceipt_(v, ver) {
var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify([ver].concat(v.estimated_duty_currency ? ['duty_currency:' + String(v.estimated_duty_currency).toUpperCase(), 'duty_date:' + shippingTaxDay_(SpreadsheetApp.getActiveSpreadsheet(), v.etd || v.actual_departure_date || v.created_at)] : []).concat(SHIP_RC_SEL_FIELDS_.map(function (k) { return shipRcCanon_(v[k]); }))), Utilities.Charset.UTF_8);
return ver + '|sel1:' + d.slice(0, 12).map(function (b) { return ((b & 255) + 256).toString(16).slice(1); }).join('');
}
function shipRcMarker_(m) {
m = String(m == null ? '' : m).trim(); var p = /^pending\|(rcv1:[0-9a-f]{24})$/.exec(m), c = /^(rcv1:[0-9a-f]{24})\|sel1:[0-9a-f]{24}$/.exec(m);
return p ? { state: 'PENDING', ver: p[1] } : c ? { state: 'COMPLETE', ver: c[1] } : { state: m ? 'UNREADABLE' : 'NONE', ver: '' };
}
function shipRcStillOnLane16_(ss, v, ln, cur, ver, today) {
  if (['draft', 'ready_to_ship'].indexOf(String(v.status || '').toLowerCase()) >= 0 && !v.estimated_duty_currency) return false;
  var d16 = ''; try { d16 = typeof sfoDay_ === 'function' ? String(sfoDay_(v.actual_departure_date) || '').slice(0, 10) : ''; } catch (e) { d16 = ''; } d16 = d16 || today;
  return shipRateCardLane_(ss, v, ln, d16).some(function (c4) { return String(c4.rate_card_id || '').trim() === cur && shipRateCardVersion_(c4) === ver && (typeof shippingRateActive_ !== 'function' || shippingRateActive_(c4, d16)) && String(c4.shipping_method_label || '').trim() !== ''; });
}
function shipRcNo_(code, more) { return jsonResponse_(Object.assign({ success: false, error: code, code: code, zero_write: true }, more || {})); }
function handleShipmentRateCardOptions_(body) {
var sid = String((body && body.shipment_id) || '').trim(), ss = shipRateReadView_(SpreadsheetApp.getActiveSpreadsheet()), r, v, day = shipmentTimestamp_().slice(0, 10);
if (!sid) return shipRcNo_('SHIPMENT_ID_REQUIRED');
if (!(r = shipRow_(ss, sid)) || r.dup) return shipRcNo_(r ? 'SHIPMENT_DUPLICATED' : 'SHIPMENT_NOT_FOUND');
v = r.v; var allM = !!(body && body.all_methods === true);   // SANDBOX-GATE-1f: carrier -> method across the lane's methods
if (!allM && !String(v.shipping_method || '').trim()) return shipRcNo_('SHIPMENT_METHOD_REQUIRED');
var st = String(v.status || '').trim().toLowerCase(), names = {}, cs = ss.getSheetByName('carriers'), q = cs && shipmentReadSheet_(cs), i;
for (i = 1; q && i < q.rows.length; i++) names[String(q.rows[i][q.col('carrier_id')]).trim()] = String(q.rows[i][q.col('carrier_name')] || '').trim();
var ln = shipRcLines_(ss, sid), bu = shipBatteryClass_(ss, ln.map(function (l) { return l.sku; })).unclassified;
if (bu.length) return shipRcNo_('RATE_CARD_BATTERY_UNCLASSIFIED', { lines: bu.length, correction: 'SKU Details > Battery Type (one row per SKU, a known code)' });
var org1g = shipOriginCountry1g_(ss, v.source_warehouse_id || v.ship_from);   // SANDBOX-GATE-1g
var cards = shipRateCardLane_(ss, allM ? Object.assign({}, v, { shipping_method: '', last_mile_delivery: '' }) : v, ln, day), cur = String(v.rate_card_id || '').trim(), curV = r.s.col('rate_card_version') < 0 ? '' : String(v.rate_card_version || '').trim();
var unpriced = shipUnpricedEligibility_(ss, v, ln, day);
var base4 = curV === 'pending-unpriced' ? Object.assign({}, v, { rate_card_version: '' }) : v, e04 = curV === 'pending-unpriced' ? shipUnpricedEligibility_(ss, base4, ln, day) : unpriced;   // R15e (4)
var cna4 = e04.reason === 'APPLICABLE_RATE_AVAILABLE' ? shipUnpricedEligibility_(ss, base4, ln, day, 'card_not_applied') : null, meta4 = shipUnpricedMeta_(curV);
return jsonResponse_({ success: true, shipment_id: sid, quote_date: day, editable: SHIPMENT_DISPATCHED_STATUSES_.indexOf(st) < 0 && st !== 'cancelled', persistable: r.s.col('rate_card_version') >= 0 && r.s.col('estimated_duty_currency') >= 0,
service_vocabulary: shipServiceVocabulary_(ss), service: shipSvcStateOf_(ss, v),   /* AD3-B */
customs_applicable: shipCustomsApplicability_(ss, v, { allow_planned_destination: true }).applicable !== false,
unpriced_approval: { enabled: true /* AD3-B: all environments */, available: unpriced.allowed, reason: unpriced.reason, recoverable: curV === 'pending-unpriced', label: unpriced.label || '', card_not_applied: cna4 ? { available: cna4.allowed === true, cards: cna4.cards || e04.cards || [], reason: cna4.reason, label: cna4.label || '' } : null, carrier_id: String(v.carrier_id || ''), carriers: Object.keys(names).map(function (id) { return { id: id, name: names[id] || id }; }), expected_updated_at: editTok_(v.updated_at), expected_rate_card_version: curV, expected_current_rate_card_id: cur },
current: (function () { var k = shipRcMarker_(curV), ok = k.state === 'COMPLETE' && shipRcReceipt_(v, k.ver) === curV && shipRcStillOnLane16_(ss, v, ln, cur, k.ver, day);   // R15e U23 (+ REVIEW_R15E_FINAL m-5: 34_'s rule)
var lt1g = shipLt1g_(ss, v.carrier_id, v.shipping_method, v.last_mile_delivery, org1g, shipRateCountry15e_(ss, v));   // R15C-EU
var st4 = shipUnpricedValid_(ss, v, ln, day) ? 'UNPRICED_APPROVED' : shipNoRatePolicy_(ss, v, ln, day).allowed ? 'COST_PENDING_AUTO' : !cur ? 'NONE' : ok ? 'COMPLETE' : k.state === 'COMPLETE' ? 'STALE' : k.state;
return { unpriced_basis: meta4 ? (meta4.basis || 'NO_APPLICABLE_RATE') : '', lead_time: lt1g, eta_check: shipEtaCheck1g_(v, lt1g), rate_card_id: cur, rate_card_version: k.ver, chosen: !!(cur && ok), state: st4, quote_state: ({ UNPRICED_APPROVED: 'COST_PENDING', COMPLETE: 'QUOTE_SELECTED', STALE: 'QUOTE_STALE', NONE: 'NO_QUOTE' })[st4] || st4 /* AD3-B */, audit: meta4 ? { actor: meta4.actor, actor_source: meta4.actor_source || 'unattributed', at: meta4.at, reason: meta4.reason } : null }; })(),
options: cards.map(function (c) { return { rate_card_id: String(c.rate_card_id || '').trim(), rate_card_version: shipRateCardVersion_(c), carrier_id: String(c.carrier_id || '').trim(), carrier_name: names[String(c.carrier_id || '').trim()] || '',
shipping_method_label: String(c.shipping_method_label || '').trim(), shipping_method: String(c.shipping_method || '').trim(), last_mile_delivery: String(c.last_mile_delivery || '').trim(),
customs_type: String(c.customs_type || '').trim(), currency: String(c.currency || '').trim(), charge_type: String(c.charge_type || '').trim(), unit_rate: c.unit_rate, min_charge: c.min_charge, charge_unit: String(c.charge_unit || '').trim(), fuel_surcharge: c.fuel_surcharge, customs_fee: c.customs_fee, quote: shRcOptionQuote15c_(ss, v, c, ln, day),   /* AGL02-12 */
effective_from: String(c.effective_from || '').trim(), effective_to: String(c.effective_to || '').trim(),
lead_time: shipLt1g_(ss, c.carrier_id, c.shipping_method, c.last_mile_delivery, org1g, shipRateCountry15e_(ss, v)) }; }) });   /* R15C-EU */
}
function handleShipmentSelectRateCard_(body) {
if (body && body.unpriced_release === true) return shipApproveUnpriced_(body);
var sid = String((body && body.shipment_id) || '').trim(), id = String((body && body.rate_card_id) || '').trim(), ver = String((body && body.rate_card_version) || '').trim();
var actor = String((body && (body.actor || body.updated_by)) || 'system_user').trim();
if (!sid || !id || !ver || !body.hasOwnProperty('expected_current_rate_card_id')) return shipRcNo_('RATE_CARD_SELECTION_INCOMPLETE');
var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return shipRcNo_('LOCK_TIMEOUT', { retryable: true }); } catch (e) { return shipRcNo_('LOCK_TIMEOUT', { retryable: true }); }
try {
var ss = SpreadsheetApp.getActiveSpreadsheet(), r = shipRow_(ss, sid), v, st, cur, rows, rc, lines, day = shipmentTimestamp_().slice(0, 10), cost;
if (!r || r.dup) return shipRcNo_(r ? 'SHIPMENT_DUPLICATED' : 'SHIPMENT_NOT_FOUND');
if (r.s.col('estimated_duty_currency') < 0) return shipRcNo_('DUTY_CURRENCY_COLUMN_REQUIRED', { needs: 'shipments.estimated_duty_currency' });
if (r.s.col('rate_card_version') < 0) return shipRcNo_('RATE_CARD_SELECTION_NOT_PERSISTABLE', { needs: 'shipments.rate_card_version (DB-16i)' });
v = r.v; st = String(v.status || '').trim().toLowerCase(); cur = String(v.rate_card_id || '').trim();
if (SHIPMENT_DISPATCHED_STATUSES_.indexOf(st) >= 0 || st === 'cancelled') return shipRcNo_('SHIPMENT_NOT_EDITABLE', { status: st });
var mk = shipRcMarker_(v.rate_card_version);
if (cur === id && mk.state === 'COMPLETE' && mk.ver === ver && shipRcReceipt_(v, ver) === String(v.rate_card_version).trim()) return jsonResponse_({ success: true, already_selected: true, verified: true, shipment_id: sid, rate_card_id: id, rate_card_version: ver, writes: 0 });
if (String(body.expected_current_rate_card_id || '').trim() !== cur && !(mk.state === 'PENDING' && mk.ver === ver)) return shipRcNo_('RATE_CARD_SELECTION_CONFLICT', { current_rate_card_id: cur });
if (!String(v.shipping_method || '').trim()) return shipRcNo_('SHIPMENT_METHOD_REQUIRED');
rows = shippingReadRateCards_(ss).filter(function (x) { return String(x.rate_card_id || '').trim() === id; });
if (rows.length !== 1) return shipRcNo_(rows.length ? 'RATE_CARD_DUPLICATED' : 'RATE_CARD_NOT_FOUND');
rc = rows[0];
if (shipRateCardVersion_(rc) !== ver) return shipRcNo_('RATE_CARD_CHANGED', { correction: 'reload the options and choose again' });
var mSw = (body.allow_method_change === true) && (String(rc.shipping_method || '').trim().toLowerCase() !== String(v.shipping_method || '').trim().toLowerCase() || String(rc.last_mile_delivery || '').trim() !== String(v.last_mile_delivery || '').trim());   // SANDBOX-GATE-1f
if (mSw) v = Object.assign({}, v, { shipping_method: String(rc.shipping_method || '').trim(), last_mile_delivery: String(rc.last_mile_delivery || '').trim() });
if (!String(rc.shipping_method_label || '').trim()) return shipRcNo_('RATE_CARD_LABEL_BLANK');
lines = shipRcLines_(ss, sid);
if (shipBatteryClass_(ss, lines.map(function (l) { return l.sku; })).unclassified.length) return shipRcNo_('RATE_CARD_BATTERY_UNCLASSIFIED');
if (!shipRateCardLane_(ss, v, lines, day).some(function (x) { return String(x.rate_card_id || '').trim() === id; })) return shipRcNo_('RATE_CARD_NOT_APPLICABLE');
day = shippingTaxDay_(ss, v.etd || v.actual_departure_date || v.created_at) || day;
cost = shipmentExactRateAndCost_(ss, { planRateCardId: id, carrierId: String(rc.carrier_id || '').trim(), country: shipRateCountry15e_(ss, v), marketplace: v.marketplace, shippingMethod: v.shipping_method,
lastMile: v.last_mile_delivery, importDutyTreatment: String(v.import_duty_treatment || '').trim(), destinationWarehouseCode: shipRateDestination_(ss, v).code,
destinationCity: shipRateDestination_(ss, v).city, destinationPostalCode: shipRateDestination_(ss, v).postal, quoteDate: day,
grossWeightKg: v.shipment_total_gross_weight, cbm: v.shipment_total_cbm, cartons: v.shipment_total_cartons,   /* R15C-AGL: raw - blank stays unknown */ totalQty: shipmentNum_(v.shipment_total_qty), lines: lines });
if (cost.rateCardId !== id || !shippingQuoteComplete_(cost)) return shipRcNo_('RATE_CARD_COST_UNRESOLVED', { cost_unknown: cost.costUnknown || '', tax_reason: cost.taxReason || '' });
var xcoRc_ = xcoRateCardLock_(ss, sid, r.v, rc, mSw); if (xcoRc_) return shipRcNo_(xcoRc_.code, xcoRc_);   // XCO-R15G B1-MAJOR-2: the merge key is locked here too   // R15C-AGL: same rule as the Weekly Save (11_)
var w = { carrier_id: String(rc.carrier_id || '').trim(), rate_card_id: id, rate_card_version: ver, currency: cost.currency, estimated_freight_cost: cost.estimatedFreightCost, estimated_duty: cost.estimatedDuty, estimated_duty_currency: cost.estimatedDutyCurrency,
estimated_customs_fee: cost.estimatedCustomsFee, estimated_total_cost: cost.estimatedTotalCost, estimated_unit_cost: cost.estimatedUnitCost, updated_by: actor,
/* SANDBOX-GATE-1f: the card's method, in the SAME selection */ shipping_method: String(v.shipping_method || '').trim(), last_mile_delivery: String(v.last_mile_delivery || '').trim(), updated_at: editNextStamp_(shipmentTimestamp_(), [v.updated_at]) }, n = 0;   // R71 small-3 (review m1)


delete w.rate_card_version;
var put = function (k, x) { n++; r.sheet.getRange(r.row, r.s.col(k) + 1).setValue(x); }, rec, b;   // R71 zw-2 (review F-1): n counts every ATTEMPTED cell write BEFORE it is made - an attempt is possibly written, so zero_write (n === 0) is claimed only when no write was attempted
var back = function () { SpreadsheetApp.flush(); var a = r.sheet.getRange(r.row, 1, 1, r.s.headers.length).getValues()[0], o = {}; r.s.headers.forEach(function (h, c) { o[h] = a[c]; }); return o; };
var half = function (code, e) { return jsonResponse_({ success: false, error: code, code: code, zero_write: n === 0, writes: n, outcome: 'SELECTION_INCOMPLETE', detail: e ? String((e && e.message) || e).slice(0, 160) : '',
correction: 'choose the same card again - Confirm refuses this shipment until the choice completes' }); };
try {
put('rate_card_version', 'pending|' + ver);
Object.keys(w).forEach(function (k) { if (r.s.col(k) >= 0) put(k, w[k]); });
b = back();
if (String(b.shipment_id).trim() !== sid || String(b.rate_card_version).trim() !== 'pending|' + ver || Object.keys(w).some(function (k) { return k !== 'updated_at' && k !== 'updated_by' && r.s.col(k) >= 0 && shipRcCanon_(b[k]) !== shipRcCanon_(w[k]); })) return half('RATE_CARD_SELECTION_UNVERIFIED');
put('rate_card_version', rec = shipRcReceipt_(b, ver));
b = back();
if (String(b.rate_card_version).trim() !== rec || shipRcReceipt_(b, ver) !== rec) return half('RATE_CARD_SELECTION_UNVERIFIED');
} catch (e) { return half('RATE_CARD_SELECTION_INTERRUPTED', e); }
return jsonResponse_({ success: true, verified: true, shipment_id: sid, rate_card_id: id, rate_card_version: ver, carrier_id: w.carrier_id, shipping_method_label: String(rc.shipping_method_label).trim(), estimated_total_cost: w.estimated_total_cost, currency: w.currency, writes: n });
} finally { try { lock.releaseLock(); } catch (e) {} }
}
// INT-CAND8 r8 (CH7-4): every shipment update (fields, status, source) under ONE script lock, the row read under it.
function handleUpdateShipment_(body) {
var lk_ = null, got_ = false, sid_ = String((body && body.shipment_id) || '').trim();
try { lk_ = LockService.getScriptLock(); got_ = lk_.tryLock(30000); } catch (eL_) { return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_ERROR', shipment_id: sid_, error: 'Lock error: ' + String(eL_ && eL_.message ? eL_.message : eL_) }); }
if (!got_) return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_UNAVAILABLE', shipment_id: sid_, error: 'Another change is in progress, so this shipment update could not start. Nothing was written. Reload, then try again.' });
SHIP_EDIT_WROTE_ = false; SHIP_EDIT_TOKEN_IGNORED_ = '';   // INT-CAND9 r8: per request
var out_ = null, thrown_ = null;
try { try { out_ = shipUpdateShipmentCore_(body); } catch (eU_) { thrown_ = eU_; }
return shipEditFinish_(sid_, out_, thrown_); }
finally { try { lk_.releaseLock(); } catch (eR_) { /* only the lock taken above */ } }
}
// R14-F1c (Owner correction 1): READ-ONLY schema check of every dispatch-evidence source the 12_ / 32_ guards rely on. Returns the list
// of what is absent or missing ('' = complete). It reads header rows only, creates nothing, and does not change csdMovementExists_ (22_):
// the guards call it only after this check has proved both movement tables and their type / reference columns are present.
// Header matching follows each reader: shipment_lines / allocations as 12_ / 32_ read them (trimmed); the movement tables as 22_ reads
// them (trimmed + lower-cased).
function f1cEvidenceSchemaGap_(ss) {
var need = [['shipment_lines', ['shipment_id', 'shipment_line_id'], false], ['shipment_line_allocations', ['shipment_line_id', 'allocation_status'], false],
  ['factory_stock_movements', ['related_entity_type', 'related_entity_id', 'movement_type'], true], ['overseas_inventory_movements', ['movement_type', 'reference_id'], true]], gap = [];
for (var i = 0; i < need.length; i++) {
  var sh = ss.getSheetByName(need[i][0]); if (!sh) { gap.push(need[i][0]); continue; }
  var n = sh.getLastColumn(), h = n > 0 ? sh.getRange(1, 1, 1, n).getValues()[0].map(function (x) { var t = String(x == null ? '' : x).trim(); return need[i][2] ? t.toLowerCase() : t; }) : [];
  for (var j = 0; j < need[i][1].length; j++) if (h.indexOf(need[i][1][j]) === -1) gap.push(need[i][0] + '.' + need[i][1][j]);
}
if (typeof csdMovementExists_ !== 'function') gap.push('csdMovementExists_');
return gap;
}
// N01 (A final2, 2026-11-20): the Destination Warehouse alias. shipments.destination_warehouse_id is the CANONICAL destination; warehouse_id
// is its legacy read alias (+ warehouse_code snapshot). A plan-made Draft carries the canonical destination and NO alias, and the page posted
// warehouse_id '' on Save - which this handler mirrored over destination_warehouse_id (the Draft lost its destination). Decided here, BEFORE
// any write (a refusal writes nothing):
//   alias and destination both absent                       -> destination unchanged
//   blank alias ('' / spaces) and destination absent         -> destination unchanged, alias columns not written (a blank alias never clears)
//   destination present ('' included)                       -> explicit; '' = an explicit clear (the page sends it only for the blank option)
//   alias and destination both non-blank and different      -> SHIPMENT_DESTINATION_ALIAS_CONFLICT (no fallback picks one)
//   a CHANGED non-blank destination (alias or explicit) must be exactly one warehouses row, not inactive, not a factory, and in the
//   shipment's company / country when both sides carry the value (the page picker's own eligibility rule, now also on the server).
// No back-fill: only the row being saved is touched; nothing repairs Drafts that are not saved.
// A-DELTA1 c2 item 4 (Owner 2026-11-21, approved scope): ONE destination-type rule for every entry that sets or commits a shipment / plan
// destination (12_ destination edit, 16_ Shipping Plan Submit, 22_ Confirm). All sites may ship to a legal 3PL; FBA keeps its existing
// legal paths (allowed here; its own protections - planning To exclusion, the Amazon-only FBA picker group, 80_ shiSupplyModeOf_ - are
// unchanged); FACTORY (type or flag), RETURN and blank / any other spelling are refused, never mapped or guessed. Same codes as 80_.
var SHIP_DEST_TYPE_ALLOWED_ = { '3PL': 1, 'FBA': 1 };
function shipDestinationTypeRule_(warehouseType, isFactoryFlag) {
  var raw = String(warehouseType == null ? '' : warehouseType).trim(), t = raw.toUpperCase();
  if (isFactoryFlag === true || t === 'FACTORY') return { ok: false, code: 'DESTINATION_IS_FACTORY', type: raw };
  if (SHIP_DEST_TYPE_ALLOWED_[t] === 1) return { ok: true, code: '', type: t };
  if (t === 'RETURN') return { ok: false, code: 'DESTINATION_TYPE_NOT_ALLOWED', type: raw };
  return { ok: false, code: 'DESTINATION_TYPE_UNKNOWN', type: raw };
}
// Reads ONE warehouses row by exact id (the same lookup the callers already make). { found, unique, type, isFactory, hasTypeColumn }.
function shipDestinationWarehouseFacts_(ss, warehouseId) {
  var id = String(warehouseId == null ? '' : warehouseId).trim(), sh = ss && ss.getSheetByName ? ss.getSheetByName('warehouses') : null;
  if (!id || !sh) return { found: false, unique: false, readable: !!sh };
  var v = sh.getDataRange().getValues(), hd = (v[0] || []).map(function (x) { return String(x).trim().toLowerCase(); }), ci = hd.indexOf('warehouse_id'), ti = hd.indexOf('warehouse_type'), fi = hd.indexOf('is_factory_warehouse');
  if (ci === -1) return { found: false, unique: false, readable: false };
  var rows = []; for (var i = 1; i < v.length; i++) if (String(v[i][ci] == null ? '' : v[i][ci]).trim() === id) rows.push(v[i]);
  var r = rows[0] || [], fl = fi === -1 ? '' : String(r[fi] == null ? '' : r[fi]).trim().toLowerCase();
  return { found: rows.length > 0, unique: rows.length === 1, readable: true, hasTypeColumn: ti !== -1, type: ti === -1 ? '' : String(r[ti] == null ? '' : r[ti]).trim(), isFactory: fl === 'true' || fl === 'yes' || fl === 'y' || fl === '1' };
}
function shipDestAliasN01_(ss, s, rowVals, body) {
  var str = function (v) { return String(v == null ? '' : v).trim(); }, own = function (k) { return Object.prototype.hasOwnProperty.call(body || {}, k); };
  var hasW = own('warehouse_id'), hasD = own('destination_warehouse_id'), w = hasW ? str(body.warehouse_id) : '', d = hasD ? str(body.destination_warehouse_id) : '';
  var col = function (n) { var c = s.col(n); return c === -1 ? '' : str(rowVals[c]); }, cur = col('destination_warehouse_id');
  var no = function (code, msg, more) { return { refuse: Object.assign({ code: code, destination_warehouse_id_current: cur, error: msg + ' Nothing was written.' }, more || {}) }; };
  if (hasW && hasD && w !== '' && d !== '' && w !== d) return no('SHIPMENT_DESTINATION_ALIAS_CONFLICT', 'warehouse_id (' + w + ') and destination_warehouse_id (' + d + ') name different warehouses in one request.', { warehouse_id: w, destination_warehouse_id: d });
  var out = { mirror: !hasD && hasW && w !== '', skipAlias: !hasD && hasW && w === '' && cur !== '', target: hasD ? d : (hasW && w !== '' ? w : null) };
  if (out.target === null || out.target === '' || out.target === cur) return out;
  var sh = ss.getSheetByName('warehouses'); if (!sh) return no('SHIPMENT_DESTINATION_UNVERIFIABLE', 'The warehouses table cannot be read, so the new destination cannot be checked.');
  var v = sh.getDataRange().getValues(), h = (v[0] || []).map(function (x) { return str(x); }), ci = h.indexOf('warehouse_id');
  if (ci === -1) return no('SHIPMENT_DESTINATION_UNVERIFIABLE', 'The warehouses table has no warehouse_id column.');
  var rows = []; for (var i = 1; i < v.length; i++) if (str(v[i][ci]) === out.target) rows.push(v[i]);
  var g = function (r, n) { var k = h.indexOf(n); return k === -1 ? '' : str(r[k]); };
  var bool = function (x) { x = String(x).toLowerCase(); return (x === 'true' || x === 'yes' || x === 'y' || x === '1') ? true : (x === 'false' || x === 'no' || x === 'n' || x === '0') ? false : null; };
  if (!rows.length) return no('SHIPMENT_DESTINATION_UNKNOWN', 'There is no warehouse ' + out.target + '.', { requested: out.target });
  if (rows.length > 1) return no('SHIPMENT_DESTINATION_AMBIGUOUS', 'Warehouse ' + out.target + ' appears more than once in the master - fix the master first.', { requested: out.target });
  var r = rows[0];
  if (bool(g(r, 'is_active')) === false) return no('SHIPMENT_DESTINATION_INACTIVE', 'Warehouse ' + out.target + ' is inactive.', { requested: out.target });
  if (bool(g(r, 'is_factory_warehouse')) === true) return no('SHIPMENT_DESTINATION_IS_FACTORY', 'A shipment destination cannot be a factory warehouse.', { requested: out.target });
  var tk12_ = h.indexOf('warehouse_type'); if (tk12_ === -1) return no('SHIPMENT_DESTINATION_UNVERIFIABLE', 'The warehouses table has no warehouse_type column, so the destination type cannot be checked.', { requested: out.target });   // A-DELTA1 c2 item 4
  var dt12_ = shipDestinationTypeRule_(g(r, 'warehouse_type'), false); if (!dt12_.ok) return no('SHIPMENT_' + dt12_.code, 'Warehouse ' + out.target + ' (type ' + (dt12_.type || 'blank') + ') is not a legal shipment destination: all sites may ship to a 3PL; FBA keeps its own paths; FACTORY, RETURN and unknown types are refused.', { requested: out.target, warehouse_type: dt12_.type });   // A-DELTA1 c2 item 4
  var co = col('company'), wc = g(r, 'company'); if (co && wc && co.toLowerCase() !== wc.toLowerCase()) return no('SHIPMENT_DESTINATION_COMPANY_MISMATCH', 'Warehouse ' + out.target + ' belongs to ' + wc + ', the shipment to ' + co + '.', { requested: out.target });
  var cn = col('country'), wn = g(r, 'country'); if (cn && wn && cn.toLowerCase() !== wn.toLowerCase() && !shipSetMember15e_(cn, wn)) return no('SHIPMENT_DESTINATION_COUNTRY_MISMATCH', 'Warehouse ' + out.target + ' is in ' + wn + ', the shipment is for ' + cn + '.', { requested: out.target });
  return out;
}
function shipUpdateShipmentCore_(body) {   // INT-CAND8 r8 (CH7-4): only ever called by handleUpdateShipment_, which holds the script lock
var shipmentId = String((body && body.shipment_id) || '').trim();
if (body && (body.hasOwnProperty('rate_card_id') || body.hasOwnProperty('rate_card_version'))) return shipRcNo_('RATE_CARD_SELECT_REQUIRED', { use: 'shipment.selectRateCard' });
var actor = String((body && (body.updated_by || body.actor)) || 'system_user').trim();
if (!shipmentId) return jsonResponse_({ success: false, error: 'Missing shipment_id' });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName('shipments');
if (!sheet) return jsonResponse_({ success: false, error: 'shipments sheet not found' });


sheetEnsureColumns_(sheet, ['external_shipment_id', 'shipped_at', 'shipped_by', 'hidden_from_draft_at', 'hidden_from_draft_by',
'last_mile_delivery', 'shipments_customs_type', 'booking_no', 'note',
'shipment_total_gross_weight', 'shipment_total_net_weight',

'source_warehouse_id', 'destination_warehouse_id', 'destination_type', 'import_duty_treatment',
'master_tracking_number', 'is_cross_dock', 'temperature_requirement', 'hazmat_flag', 'total_cost_actual']);

var s = shipmentReadSheet_(sheet);
var idCol = s.col('shipment_id');
if (idCol === -1) return jsonResponse_({ success: false, error: 'shipment_id column not found' });

var targetRow = -1;
for (var i = 1; i < s.rows.length; i++) {
if (String(s.rows[i][idCol]).trim() === shipmentId) { targetRow = i + 1; break; }
}
if (targetRow === -1) return jsonResponse_({ success: false, error: 'Shipment not found: ' + shipmentId });

var rowVals = s.rows[targetRow - 1] || [];
try {
  var packing = typeof mcpShipment_ === 'function' ? mcpShipment_(ss, shipmentId) : null;
  if (packing && body.lines && body.lines.length) return shipRcNo_('MIXED_CARTON_NUMBERING_AUTOMATIC', {error:'Mixed shipment carton numbers follow the saved packing groups. No fields were changed.'});
} catch (packingError) { return shipRcNo_(packingError.code || 'MIXED_PACKING_INVALID', {error:String(packingError.message)}); }
var p1u_ = editP1Gate15f2_(s.col('updated_at') === -1 ? undefined : rowVals[s.col('updated_at')], body && body.expected_updated_at); if (p1u_) return jsonResponse_(Object.assign({ success: false, zero_write: true, shipment_id: shipmentId }, p1u_));   /* R15F2 P1 */ if (body && body.expected_updated_at != null && String(body.expected_updated_at).trim() !== '') {   // INT-CAND8 r8 (edit conflict): the optimistic token, read under the lock
var ucE_ = s.col('updated_at'), curTok_ = ucE_ === -1 ? '' : editTok_(rowVals[ucE_]), expTok_ = editTok_(body.expected_updated_at);
if (ucE_ !== -1 && editTokSame_(rowVals[ucE_], body.expected_updated_at) === 'DIFF') {   /* INT-CAND9 r8 (CH8-1): epoch seconds; unparsable / coarse = ignored (run 1: a line comment here swallowed the rest of the line) */ var curRow_ = editRowObj_(s.headers, rowVals), diff_ = Object.keys(body).filter(function (k) { return k !== 'updated_at' && k !== 'expected_updated_at' && Object.prototype.hasOwnProperty.call(curRow_, k) && editTok_(body[k]) !== curRow_[k]; }).slice(0, 12);
return jsonResponse_({ success: false, code: 'EDIT_CONFLICT', zero_write: true, shipment_id: shipmentId, data: { expected_updated_at: expTok_, current_updated_at: curTok_, current: curRow_, fields_differing: diff_.map(function (k) { return { field: k, yours: String(body[k] == null ? '' : body[k]), current: curRow_[k] }; }) },
error: 'EDIT_CONFLICT: this shipment was changed by someone else (last saved ' + (curTok_ || 'unknown') + '; your copy is from ' + expTok_ + '). Nothing was saved. Reload it to see the current values' + (diff_.length ? ' (they differ in: ' + diff_.join(', ') + ')' : '') + ', then make your change again.' }); } }
function setCell(name, value) { if (name === 'note') value = sc13KeepMarkers_(s.col('note') < 0 ? '' : rowVals[s.col('note')], value); var c = s.col(name); if (c !== -1) { if (name !== 'updated_at') SHIP_EDIT_WROTE_ = true; sheet.getRange(targetRow, c + 1).setValue(value); } }   // INT-CAND9 r8 (CH8-4): a field write is about to land

function mv(name) {
if (body.hasOwnProperty(name) && String(body[name]).trim() !== '') return String(body[name]).trim();
var c = s.col(name); return c === -1 ? '' : String(rowVals[c] == null ? '' : rowVals[c]).trim();
}
function mnum(name) { var v = parseFloat(mv(name)); return isNaN(v) ? 0 : v; }

var newStatus = (body.hasOwnProperty('status') && String(body.status).trim() !== '') ? String(body.status).trim() : '';
sc13AssertReady_({ note: s.col('note') < 0 ? '' : rowVals[s.col('note')] });
var curStatus = (function () { var c = s.col('status'); return c === -1 ? '' : String(rowVals[c] || '').trim(); })();
// R14-F1 (review M-1): a dispatched shipment (or one with dispatch evidence) keeps only the post-ship operations the contract keeps -
// the lifecycle status advance (SHIPMENT_CENTER_SPEC.md:272) and Done (hidden_from_draft; :325 'Shipped - fields read-only'). A second
// Confirm's Save from another tab / origin is refused here with zero writes instead of writing over the shipped row.
var f1Disp_ = csdIsDispatchedStatus_(curStatus), f1Ev_ = false;
// R14-F1c (Owner correction 1): an unreadable status, or any evidence source absent / missing a required column, is NOT "no evidence".
if (s.col('status') === -1) return shipRcNo_('SHIPMENT_DISPATCH_STATE_UNKNOWN', { shipment_id: shipmentId, missing: ['shipments.status'], error: 'The shipment status cannot be read. Nothing was written.' });
if (!f1Disp_) { var f1cGap_; try { f1cGap_ = f1cEvidenceSchemaGap_(ss); } catch (eF1c_) { f1cGap_ = ['EVIDENCE_SCHEMA_READ_FAILED']; }
  if (f1cGap_.length) return shipRcNo_('SHIPMENT_DISPATCH_STATE_UNKNOWN', { shipment_id: shipmentId, status: curStatus, missing: f1cGap_.slice(0, 20), error: 'A dispatch evidence source is absent or missing a required column. Nothing was written.' }); }
// R14-F1b (review m-3): the SAME dispatch-evidence rule as 32_ - an executed allocation on one of this shipment's lines OR a shipment_out
if (!f1Disp_) { try {
  var f1bL_ = ss.getSheetByName('shipment_lines'), f1bA_ = ss.getSheetByName('shipment_line_allocations'), f1bIds_ = {}, f1bExec_ = false;
  if (f1bL_) { var f1bLv_ = f1bL_.getDataRange().getValues(), f1bLh_ = f1bLv_[0].map(function (x) { return String(x).trim(); }), f1bLs_ = f1bLh_.indexOf('shipment_id'), f1bLi_ = f1bLh_.indexOf('shipment_line_id');
    if (f1bLv_.length > 1 && (f1bLs_ === -1 || f1bLi_ === -1)) throw new Error('SHIPMENT_LINES_COLUMNS');
    for (var f1bi_ = 1; f1bi_ < f1bLv_.length; f1bi_++) if (String(f1bLv_[f1bi_][f1bLs_]).trim() === shipmentId) f1bIds_[String(f1bLv_[f1bi_][f1bLi_]).trim()] = 1; }
  if (f1bA_ && Object.keys(f1bIds_).length) { var f1bAv_ = f1bA_.getDataRange().getValues(), f1bAh_ = f1bAv_[0].map(function (x) { return String(x).trim(); }), f1bAl_ = f1bAh_.indexOf('shipment_line_id'), f1bAs_ = f1bAh_.indexOf('allocation_status');
    if (f1bAv_.length > 1 && (f1bAl_ === -1 || f1bAs_ === -1)) throw new Error('ALLOCATION_COLUMNS');
    for (var f1bj_ = 1; f1bj_ < f1bAv_.length; f1bj_++) if (f1bIds_[String(f1bAv_[f1bj_][f1bAl_]).trim()] && String(f1bAv_[f1bj_][f1bAs_]).trim().toLowerCase() === 'executed') { f1bExec_ = true; break; } }
  f1Ev_ = f1bExec_ || !!csdMovementExists_(ss, shipmentId);
} catch (eF1_) { return shipRcNo_('SHIPMENT_DISPATCH_STATE_UNKNOWN', { shipment_id: shipmentId, status: curStatus, error: 'The dispatch evidence could not be read. Nothing was written.' }); } }
if (f1Disp_ || f1Ev_) { var f1Ok_ = { action: 1, shipment_id: 1, status: 1, hidden_from_draft: 1, actor: 1, updated_by: 1, expected_updated_at: 1 }, f1Bad_ = Object.keys(body || {}).filter(function (k) { return !f1Ok_[k]; });
  if (f1Bad_.length) return shipRcNo_('SHIPMENT_FROZEN_AFTER_DISPATCH', { shipment_id: shipmentId, status: curStatus, dispatch_evidence: f1Ev_, fields: f1Bad_.slice(0, 20),
    error: 'This shipment is already dispatched; its fields are read-only (only the status advance and Done are allowed). Nothing was written.' });
  // R14-F1b (review m-4): nothing allowed to change (empty / meta-only / the same status, no Done) -> refused, updated_at never bumped
  var f1bSt_ = body && body.hasOwnProperty('status') ? String(body.status == null ? '' : body.status).trim().toLowerCase() : '', f1bDone_ = !!(body && body.hidden_from_draft);
  if (!f1bDone_ && (f1bSt_ === '' || f1bSt_ === String(curStatus).trim().toLowerCase())) return shipRcNo_('SHIPMENT_NO_ALLOWED_CHANGE', { shipment_id: shipmentId, status: curStatus, dispatch_evidence: f1Ev_,
    error: 'This shipment is already dispatched and the request changes nothing it may change (status advance or Done). Nothing was written.' }); }
if (csdIsDispatchedStatus_(curStatus) && ['carrier_id', 'shipping_method', 'last_mile_delivery', 'shipments_customs_type'].some(function (k) {
var c = s.col(k); return body.hasOwnProperty(k) && String(body[k] == null ? '' : body[k]).trim() !== (c === -1 ? '' : String(rowVals[c] == null ? '' : rowVals[c]).trim()); })) return shipRcNo_('SHIPMENT_TRANSPORT_FROZEN', { status: curStatus });
if (csdIsDispatchedStatus_(newStatus) && !csdIsDispatchedStatus_(curStatus))   /* INT-CAND9 r9 (CH9-1 / CH9-2): 22_'s dispatched set, incl. stuck */ return shipRcNo_('USE_CONFIRM_SHIPMENT', { status: curStatus,
correction: 'Confirm Shipment dispatches (rate card, documents, stock) - updateShipment cannot' });


if (newStatus && SHIPMENT_DISPATCHED_STATUSES_.indexOf(newStatus.toLowerCase()) < 0 && (function () { var c = s.col('record_origin'); return c !== -1 && String(rowVals[c] == null ? '' : rowVals[c]).trim() === 'IMPORT_HISTORICAL'; })())
return shipRcNo_('SHIPMENT_HISTORICAL_STATUS_LOCKED', { status: curStatus, requested: newStatus,
correction: 'An imported historical shipment stays dispatched; a receipt moves it to received (shipment.receipt.update)' });
var dt15c_ = shipDatesCheck15c_(body, s, rowVals); if (dt15c_) return shipRcNo_(dt15c_.code, dt15c_);   /* AGL02-12: a changed ETA / ETD is a real date and ETA >= ETD; nothing written otherwise */
var csl_ = curStatus.toLowerCase(), nsl_ = newStatus.toLowerCase();   // INT-CAND8 r8 (CH7-4): the transitions allowed from the current status (12_'s own status sets)
if (csl_ === 'cancelled') return shipRcNo_('SHIPMENT_NOT_EDITABLE', { shipment_id: shipmentId, status: curStatus, error: 'This shipment is cancelled; it can no longer be changed. Nothing was written.' });
var n01_ = shipDestAliasN01_(ss, s, rowVals, body); if (n01_.refuse) return shipRcNo_(n01_.refuse.code, Object.assign({ shipment_id: shipmentId }, n01_.refuse));   // N01 (A final2): decided before any write
var xcoKl_ = xcoKeyLock_(ss, shipmentId, s, rowVals, body);   // XCO-R15G A2: the consolidation key of a 2+ Plan draft is locked
if (xcoKl_ && xcoKl_.refuse) return shipRcNo_(xcoKl_.refuse.code, xcoKl_.refuse);
if (newStatus && nsl_ !== csl_) {
if ({ arrived: 1, received: 1, partially_received: 1, partial_received: 1 }[nsl_]) return shipRcNo_('SHIPMENT_STATUS_SET_BY_ROUTE_OR_RECEIPT', { shipment_id: shipmentId, status: curStatus, requested: newStatus, error: 'This status is set only by the system: arrived by Update Position at the proven destination (31_), partially_received / received by the receipt. Nothing was written.' });   /* A-delta1 C3 (REVIEW_AD1 M-5): no API path writes arrived / received without route proof or a receipt */
if (csdIsDispatchedStatus_(csl_) && !csdIsDispatchedStatus_(nsl_))   /* INT-CAND9 r8 (CH8-2): 22_'s dispatched set, incl. stuck */ return shipRcNo_('STATUS_TRANSITION_NOT_ALLOWED', { shipment_id: shipmentId, status: curStatus, requested: newStatus, error: 'This shipment is ' + curStatus + ' (dispatched); it cannot go back to ' + newStatus + '. Nothing was written.' });
}
var svcAd3_ = shipSvcSaveGate_(ss, s, rowVals, body);   // AD3-B (Owner 8/9/10): carrier exists + active, method / last mile in the server vocabulary, SPD/LTL, TO_BE_ASSIGNED - zero write on refusal
if (svcAd3_.refuse) return shipRcNo_(svcAd3_.refuse.code, Object.assign({ shipment_id: shipmentId }, svcAd3_.refuse));
Object.keys(svcAd3_.set).forEach(function (k) { body[k] = svcAd3_.set[k]; });
var dstAd3_ = (body.hasOwnProperty('destination_warehouse_id') && String(body.destination_warehouse_id == null ? '' : body.destination_warehouse_id).trim()) ? String(body.destination_warehouse_id).trim() : (body.hasOwnProperty('warehouse_id') && String(body.warehouse_id == null ? '' : body.warehouse_id).trim()) ? String(body.warehouse_id).trim() : '';
var rvAd3_ = function (k) { var c = s.col(k); return c === -1 ? '' : String(rowVals[c] == null ? '' : rowVals[c]).trim(); };
if (dstAd3_ && dstAd3_ !== (rvAd3_('destination_warehouse_id') || rvAd3_('warehouse_id'))) {   // AD3-B (Author C request): logical WFS / wrong platform / 3PL -> 3PL outside C's branch - zero write
  var dgAd3_ = shipDestinationDraftGate_(ss, { company: rvAd3_('company'), country: rvAd3_('country'), marketplace: rvAd3_('marketplace'), source_warehouse_id: body.hasOwnProperty('source_warehouse_id') ? String(body.source_warehouse_id == null ? '' : body.source_warehouse_id).trim() : rvAd3_('source_warehouse_id'), destination_warehouse_id: dstAd3_ });
  if (dgAd3_) return shipRcNo_(dgAd3_.code, { shipment_id: shipmentId, reason: dgAd3_.reason, overseas_transfer_check: dgAd3_.check || null, error: dgAd3_.reason + ': this destination cannot be the ship-to of this shipment (Confirm would refuse it). Nothing was written.' });
}

var now = shipmentTimestamp_();
















var srcCol_ = s.col('source_warehouse_id');
var curSrc_ = srcCol_ === -1 ? '' : String(rowVals[srcCol_] == null ? '' : rowVals[srcCol_]).trim();
var wantSrc_ = body.hasOwnProperty('source_warehouse_id') ? String(body.source_warehouse_id == null ? '' : body.source_warehouse_id).trim() : null;
var reservationMoved_ = null;
if (wantSrc_ !== null && wantSrc_ !== curSrc_) {
// INT-CAND8 r7 (3.4): ONE script lock for the whole source change - the hold read, the checks, the moves and the field write; the
// shipment row is re-read under it (its source and status must still be what was read before the lock). Every exit releases it.
var lkS_ = null; try { lkS_ = shipEditHeldLock_(); if (!lkS_.tryLock(30000)) return jsonResponse_({ success: false, code: 'LOCK_UNAVAILABLE', shipment_id: shipmentId, error: 'Could not acquire lock; please retry. Nothing was written.' }); }
catch (eLS_) { return jsonResponse_({ success: false, code: 'LOCK_ERROR', shipment_id: shipmentId, error: String(eLS_ && eLS_.message ? eLS_.message : eLS_) }); }
try { var rr_ = shipmentReadSheet_(sheet), rv2_ = rr_.rows[targetRow - 1] || [], rs_ = rr_.col('source_warehouse_id'), rt_ = rr_.col('status'), ri_ = rr_.col('shipment_id');
if ((ri_ !== -1 && String(rv2_[ri_]).trim() !== shipmentId) || (rs_ !== -1 ? String(rv2_[rs_] == null ? '' : rv2_[rs_]).trim() : '') !== curSrc_ || (rt_ !== -1 ? String(rv2_[rt_] || '').trim() : '') !== curStatus) { try { lkS_.releaseLock(); } catch (e) {}
return jsonResponse_({ success: false, code: 'SHIPMENT_CHANGED_SINCE_READ', shipment_id: shipmentId, error: 'This shipment changed while the source change was being prepared (another user). Nothing was written. Reload it and try again.' }); } }
catch (eRR_) { try { lkS_.releaseLock(); } catch (e) {} return jsonResponse_({ success: false, code: 'SOURCE_CHANGE_STATE_UNKNOWN', shipment_id: shipmentId, error: 'The shipment row could not be re-read under the lock. Nothing was written; it may be retried once it can be read.' }); }
var stkSheet_ = ss.getSheetByName('factory_stock');
var movSheet_ = ss.getSheetByName('factory_stock_movements');
var held_ = {}; try { held_ = (stkSheet_ && movSheet_) ? factoryStockOwnerReservedTx_(movSheet_, FSTX_RESERVATION_OWNER_TYPE_, shipmentId) : {}; }   // INT-CAND8 r7 (3.4): the hold read is under the one lock now - a read error is UNKNOWN, the lock released
catch (eHR_) { try { lkS_.releaseLock(); } catch (e) {} return jsonResponse_({ success: false, code: SHIPMENT_BOOKS_UNKNOWN_, shipment_id: shipmentId, data: { keys_checked: [], keys_mismatched: [], keys_unknown: ['HOLD_READ_FAILED: ' + String(eHR_ && eHR_.message ? eHR_.message : eHR_)] }, error: 'The reservation of this Shipment Draft could not be read under the lock. Nothing was written; it may be retried once it can be read.' }); }
var moveList_ = [];
for (var hk_ in held_) {
if (!Object.prototype.hasOwnProperty.call(held_, hk_)) continue;
var parts_ = hk_.split('||');
if (parts_[0] !== curSrc_) continue;
var q_ = Math.round(held_[hk_] || 0);
if (q_ > 0) moveList_.push({ sku: parts_[1], qty: q_ });
}
// INT-CAND8 r6 (review CHAIN5 CH5-4): a source change with NO hold to move at the current source is still a next operation: under the lock,
// every key the shipment touches (either domain) must agree, else refuse with zero writes. (Only the guard is locked; the field update that
// follows is the existing unlocked field write - no stock is written on this path.)
if (!moveList_.length) { var lkE_ = null;
try { lkE_ = lkS_; }   // INT-CAND8 r7 (3.4): the one lock
catch (eLE_) { return jsonResponse_({ success: false, code: 'LOCK_ERROR', shipment_id: shipmentId, error: String(eLE_ && eLE_.message ? eLE_.message : eLE_) }); }
// INT-CAND8 r7 (review CHAIN6 CH6-2 / CH6-3; cf. the reviewer's FD4): inside the lock - a dispatched or half-dispatched shipment is never
// re-sourced, and neither is a shipment holding an OVERSEAS reservation (an overseas source change moves no hold, so it would be left behind)
var scX_ = []; try {
if (csdIsDispatchedStatus_(curStatus) || csdMovementExists_(ss, shipmentId) || csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', shipmentId) > 0 || csdEventExists_(ss, shipmentId)) scX_.push('DISPATCH_EVIDENCE status ' + curStatus);
var ovM_ = ss.getSheetByName('overseas_inventory_movements'), ovH_ = ovM_ ? (ovsOwnerReservedTx_(ovM_, OVSTX_RESERVATION_OWNER_TYPE_, shipmentId) || {}) : {}; if (Object.keys(ovH_).some(function (k) { return Math.round(ovH_[k] || 0) > 0; })) scX_.push('OVERSEAS_HOLD_NOT_MOVABLE (to ' + shipmentSourceDomain_(ss, wantSrc_) + ')');
} catch (eX_) { scX_.push('READ_FAILED: ' + String(eX_ && eX_.message ? eX_.message : eX_)); }
if (scX_.length) { try { lkE_.releaseLock(); } catch (e) {} var scU_ = scX_.some(function (x) { return /^READ_FAILED/.test(x); }); return jsonResponse_({ success: false, code: scU_ ? 'SOURCE_CHANGE_STATE_UNKNOWN' : 'SOURCE_CHANGE_NOT_ALLOWED', shipment_id: shipmentId, data: { why: scX_ }, error: 'The source warehouse was not changed (' + scX_.join('; ') + '). ' + (scU_ ? 'The dispatch / hold rows could not be READ: nothing was written; it may be retried once they can be read (it is checked again).' : 'A dispatched or half-dispatched shipment is never re-sourced, and a shipment holding an overseas reservation keeps its source. Nothing was written. Review the shipment first; do not cancel it as a repair unless its reservation books are confirmed consistent (the cancel re-checks them and refuses otherwise).') }); }
var ebk_ = shipmentCancelBooks_(ss, shipmentId, curSrc_);
if (ebk_.verdict !== 'RECONCILED') { try { lkE_.releaseLock(); } catch (e) {} return jsonResponse_({ success: false, code: ebk_.verdict, shipment_id: shipmentId, data: { keys_checked: ebk_.keys, keys_mismatched: ebk_.mismatched, keys_unknown: ebk_.unknown },
error: shipmentBooksMessage_(ebk_, 'Changing the Shipment Draft source warehouse') }); }
try { setCell('source_warehouse_id', wantSrc_); } catch (eSF_) { var sfL_ = null; try { var rrF_ = shipmentReadSheet_(sheet), cF_ = rrF_.col('source_warehouse_id'); sfL_ = cF_ === -1 ? null : String(rrF_.rows[targetRow - 1][cF_] == null ? '' : rrF_.rows[targetRow - 1][cF_]).trim(); } catch (eF2_) { sfL_ = null; }   // INT-CAND8 r8 (CH7-1)
if (sfL_ !== wantSrc_) { try { lkE_.releaseLock(); } catch (e) {} return jsonResponse_({ success: false, code: sfL_ === null ? 'SOURCE_CHANGE_STATE_UNKNOWN' : 'SOURCE_FIELD_WRITE_FAILED', shipment_id: shipmentId, data: { source_now: sfL_ },
error: sfL_ === null ? 'The source warehouse field write failed and the field could not be re-read, so whether it changed is UNKNOWN. No reservation was moved. Reload the shipment before any further action.' : 'The source warehouse field could not be written (' + String(eSF_ && eSF_.message ? eSF_.message : eSF_) + '). Nothing was changed (no reservation was moved, the source is still ' + sfL_ + '). It may be retried.' }); } }
var srcInLock_ = true;   // INT-CAND8 r8 (CH7-1): the field write is checked
try { lkE_.releaseLock(); } catch (e) {} }
if (moveList_.length) {
if (!wantSrc_) {
try { lkS_.releaseLock(); } catch (e) {}
return jsonResponse_({ success: false, code: 'SOURCE_WAREHOUSE_REQUIRED_FOR_RESERVATION', shipment_id: shipmentId,
error: 'This Shipment Draft holds a factory stock reservation at ' + curSrc_ + ', so its source warehouse ' +
'cannot be cleared. Nothing was changed.' });
}
var lockU_ = null;
try { lockU_ = lkS_; }   // INT-CAND8 r7 (3.4): the one lock
catch (eLU_) { return jsonResponse_({ success: false, code: 'LOCK_ERROR', error: String(eLU_ && eLU_.message ? eLU_.message : eLU_) }); }
// INT-CAND8 r7 (review CHAIN6 CH6-2 / CH6-3; cf. the reviewer's FD4): inside the lock - a dispatched or half-dispatched shipment is never
// re-sourced, and neither is a shipment holding an OVERSEAS reservation (an overseas source change moves no hold, so it would be left behind)
var scX_ = []; try {
if (csdIsDispatchedStatus_(curStatus) || csdMovementExists_(ss, shipmentId) || csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', shipmentId) > 0 || csdEventExists_(ss, shipmentId)) scX_.push('DISPATCH_EVIDENCE status ' + curStatus);
var ovM_ = ss.getSheetByName('overseas_inventory_movements'), ovH_ = ovM_ ? (ovsOwnerReservedTx_(ovM_, OVSTX_RESERVATION_OWNER_TYPE_, shipmentId) || {}) : {}; if (Object.keys(ovH_).some(function (k) { return Math.round(ovH_[k] || 0) > 0; })) scX_.push('OVERSEAS_HOLD_NOT_MOVABLE (to ' + shipmentSourceDomain_(ss, wantSrc_) + ')');
} catch (eX_) { scX_.push('READ_FAILED: ' + String(eX_ && eX_.message ? eX_.message : eX_)); }
if (scX_.length) { try { lockU_.releaseLock(); } catch (e) {} var scU_ = scX_.some(function (x) { return /^READ_FAILED/.test(x); }); return jsonResponse_({ success: false, code: scU_ ? 'SOURCE_CHANGE_STATE_UNKNOWN' : 'SOURCE_CHANGE_NOT_ALLOWED', shipment_id: shipmentId, data: { why: scX_ }, error: 'The source warehouse was not changed (' + scX_.join('; ') + '). ' + (scU_ ? 'The dispatch / hold rows could not be READ: nothing was written; it may be retried once they can be read (it is checked again).' : 'A dispatched or half-dispatched shipment is never re-sourced, and a shipment holding an overseas reservation keeps its source. Nothing was written. Review the shipment first; do not cancel it as a repair unless its reservation books are confirmed consistent (the cancel re-checks them and refuses otherwise).') }); }







var curDomain_ = shipmentSourceDomain_(ss, curSrc_);
var newDomain_ = shipmentSourceDomain_(ss, wantSrc_);
if (curDomain_ !== newDomain_) {
try { lockU_.releaseLock(); } catch (e) {}
return jsonResponse_({ success: false, code: 'CROSS_DOMAIN_SOURCE_CHANGE_NOT_SUPPORTED',
shipment_id: shipmentId,
data: { from_warehouse_id: curSrc_, from_domain: curDomain_, to_warehouse_id: wantSrc_, to_domain: newDomain_ },
error: 'This Shipment Draft is sourced from a ' + curDomain_ + ' warehouse and ' + wantSrc_ +
' is ' + newDomain_ + '. Moving a reservation between inventory domains is not a source change; ' +
'review it first; cancel the draft only once its reservation books are confirmed consistent (the cancel re-checks them and refuses otherwise), never as a repair of a stopped or UNKNOWN draft. Nothing was changed.' });
}
var domSheets_ = shipmentDomainSheets_(ss, newDomain_);
if (!domSheets_) {
try { lockU_.releaseLock(); } catch (e) {}
return jsonResponse_({ success: false, code: 'SOURCE_DOMAIN_TABLES_NOT_FOUND', shipment_id: shipmentId,
error: 'The inventory tables for the ' + newDomain_ + ' domain were not found. Nothing was changed.' });
}
if (newDomain_ === SHIPMENT_DOMAIN_FACTORY_) { domSheets_.stockSheet = stkSheet_; domSheets_.movSheet = movSheet_; }
// INT-CAND8 (I1, spec r2 F7 / F8): a FACTORY source change releases at the old source and reserves at the new one. Its keys are re-derived
// INSIDE lockU_ from the factory ledger (the pre-lock moveList_ is only a hint); a hold that changed since that read is UNKNOWN. Both keys'
// books are checked BEFORE the new-source shortfall refusal. (An overseas source change moves no hold - spec r2 F3; not handled here.)
var scHeld_ = {}, scSkus_ = [], scDrift_ = [], scReadErr_ = '';
try { scHeld_ = factoryStockOwnerReservedTx_(movSheet_, FSTX_RESERVATION_OWNER_TYPE_, shipmentId); } catch (eSH_) { scReadErr_ = 'HELD_READ_FAILED: ' + String(eSH_ && eSH_.message ? eSH_.message : eSH_); }
if (scReadErr_) { try { lockU_.releaseLock(); } catch (e) {}   // round 4 (review F-I1-3): an unreadable hold is UNKNOWN, not the race code
var scU_ = { verdict: SHIPMENT_BOOKS_UNKNOWN_, keys: [], mismatched: [], unknown: [curSrc_ + ' ' + scReadErr_] };
return jsonResponse_({ success: false, code: SHIPMENT_BOOKS_UNKNOWN_, shipment_id: shipmentId, data: { keys_checked: [], keys_mismatched: [], keys_unknown: scU_.unknown },
error: shipmentBooksMessage_(scU_, 'Changing the Shipment Draft source warehouse') }); }
Object.keys(scHeld_).forEach(function (k) { var p = k.split('||'), q = Math.round(scHeld_[k] || 0); if (p[0] === curSrc_ && q > 0) scSkus_.push(p[1]); });
var scPre_ = moveList_.map(function (x) { return x.sku + ':' + x.qty; }).sort().join(','), scIn_ = scSkus_.map(function (k) { return k + ':' + Math.round(scHeld_[curSrc_ + '||' + k] || 0); }).sort().join(',');
if (scPre_ !== scIn_) scDrift_.push('HOLD_CHANGED_SINCE_READ (read before the lock ' + scPre_ + ', inside it ' + scIn_ + ')');
if (scDrift_.some(function (x) { return /^HOLD_CHANGED_SINCE_READ/.test(x); })) { try { lockU_.releaseLock(); } catch (e) {}   // round 4: before any book read
return jsonResponse_({ success: false, code: 'SOURCE_CHANGE_HOLD_CHANGED', shipment_id: shipmentId, data: { observed: scDrift_ }, error: 'This Shipment Draft\'s reservation changed while the source change was being prepared (' + scDrift_.join('; ') + '). Nothing was changed. Reload the shipment and try again.' }); }   // spec r3 B4
var scBw_ = {}; scBw_[curSrc_] = scSkus_.slice(); scBw_[wantSrc_] = (scBw_[wantSrc_] || []).concat(scSkus_);   // round 4 (F-I1-1): old + new keys, one read each
var scB_ = shipmentReservationBooksKeys_(newDomain_, domSheets_, scBw_);
if (!scDrift_.length && scB_.verdict === 'RECONCILED') { var scT_ = shipmentCancelBooks_(ss, shipmentId, curSrc_); if (scT_.verdict !== 'RECONCILED') scB_ = scT_; }   // INT-CAND8 r5: + every key the shipment touches (spec r5)
if (scDrift_.length || scB_.verdict !== 'RECONCILED') { try { lockU_.releaseLock(); } catch (e) {}
if (scDrift_.length) { scB_.unknown = scDrift_.concat(scB_.unknown); if (scB_.verdict === 'RECONCILED') scB_.verdict = SHIPMENT_BOOKS_UNKNOWN_; }
return jsonResponse_({ success: false, code: scB_.verdict, shipment_id: shipmentId, data: { keys_checked: scB_.keys, keys_mismatched: scB_.mismatched, keys_unknown: scB_.unknown },
error: shipmentBooksMessage_(scB_, 'Changing the Shipment Draft source warehouse') }); }
var shortNew_ = [];
for (var mv_ = 0; mv_ < moveList_.length; mv_++) {
var balNew_ = shipmentDomainAvailable_(newDomain_, domSheets_, wantSrc_, moveList_[mv_].sku);
if (balNew_.available < moveList_[mv_].qty) {
shortNew_.push({ sku: moveList_[mv_].sku, warehouse_id: wantSrc_, need: moveList_[mv_].qty,
available: balNew_.available, current: balNew_.current, reserved: balNew_.reserved });
}
}
if (shortNew_.length) {
try { lockU_.releaseLock(); } catch (e) {}
return jsonResponse_({ success: false,
code: newDomain_ === SHIPMENT_DOMAIN_OVERSEAS_ ? 'INSUFFICIENT_OVERSEAS_STOCK_AT_NEW_SOURCE'
: 'INSUFFICIENT_FACTORY_STOCK_AT_NEW_SOURCE',
shipment_id: shipmentId,
data: { from_warehouse_id: curSrc_, to_warehouse_id: wantSrc_, source_domain: newDomain_, shortfalls: shortNew_ },
error: 'Cannot move this Shipment Draft to ' + wantSrc_ + ': insufficient available ' +
(newDomain_ === SHIPMENT_DOMAIN_OVERSEAS_ ? 'overseas' : 'factory') + ' stock for ' +
shortNew_.map(function (x) { return x.sku + ' (need ' + x.need + ', available ' + x.available + ')'; }).join('; ') +
'. The source warehouse was NOT changed and the existing reservation at ' + curSrc_ + ' is untouched.' });
}
var mvSnap_ = stkSheet_.getDataRange().getValues(), mvStart_ = movSheet_.getLastRow(), mvStartIds_ = shipmentMovIdSet_(movSheet_);   // INT-CAND7 r5 / r6 (CH5-3): the start ledger id set, under its OWN name (mvIds_ collects the ids written)   // INT-CAND7 r4: the start snapshot and mark
var jU_ = [];
try {
for (var mw_ = 0; mw_ < moveList_.length; mw_++) {
var mvR1_ = shipmentDomainRelease_(newDomain_, domSheets_, {
warehouseId: curSrc_, sku: moveList_[mw_].sku, qty: moveList_[mw_].qty, ownerId: shipmentId,
journal: jU_, now: now, createdBy: actor, releaseReason: 'source_warehouse_changed_to_' + wantSrc_
});
if (mvR1_ && mvR1_.movementId) { mvIds_ = mvIds_ || {}; mvIds_[String(mvR1_.movementId)] = 1; mvSeq_ = mvSeq_ || []; mvSeq_.push({ sheet: movSheet_, id: String(mvR1_.movementId) }); }   // INT-CAND7 r3/r4
var mvA1_ = shipmentDomainAcquire_(newDomain_, domSheets_, {
warehouseId: wantSrc_, sku: moveList_[mw_].sku, qty: moveList_[mw_].qty, ownerId: shipmentId,
journal: jU_, now: now, createdBy: actor,
note: 'Reservation moved from ' + curSrc_ + ' for shipment ' + shipmentId
});
if (mvA1_ && mvA1_.movementId) { mvIds_ = mvIds_ || {}; mvIds_[String(mvA1_.movementId)] = 1; mvSeq_ = mvSeq_ || []; mvSeq_.push({ sheet: movSheet_, id: String(mvA1_.movementId) }); }   // INT-CAND7 r3/r4
}
var sfTry_ = 1; setCell('source_warehouse_id', wantSrc_);   // INT-CAND8 r8 (CH7-1): the field write is part of the move: a failure rolls the moves back
} catch (eMv_) {
if (typeof sfTry_ !== 'undefined' && sfTry_) { var sfNow_ = null; try { var rrS_ = shipmentReadSheet_(sheet), cS_ = rrS_.col('source_warehouse_id'); sfNow_ = cS_ === -1 ? null : String(rrS_.rows[targetRow - 1][cS_] == null ? '' : rrS_.rows[targetRow - 1][cS_]).trim(); } catch (eS2_) { sfNow_ = null; }
if (sfNow_ === wantSrc_) eMv_ = null; }
var sfUnk_ = typeof sfTry_ !== 'undefined' && !!sfTry_ && sfNow_ === null;   // INT-CAND9 r8 (CH8-3): the field write may have landed and could not be re-read   // the write landed and only its answer was lost: every move done and the field agrees - a success
if (eMv_) {
// INT-CAND7 r3 (F-B7-4): a CHECKED replay over this change's two keys per SKU and the movements it wrote
var mvIds_, mvSeq_, mvKeys_ = {}; moveList_.forEach(function (x) { mvKeys_[curSrc_ + '||' + x.sku] = { domain: SHIPMENT_DOMAIN_FACTORY_, res: -x.qty, cur: 0 }; mvKeys_[wantSrc_ + '||' + x.sku] = { domain: SHIPMENT_DOMAIN_FACTORY_, res: x.qty, cur: 0 }; });
var mvRb_ = shipmentCheckedReplay_(jU_, { owner: shipmentId, keys: mvKeys_, seq: mvSeq_ || [], doms: { FACTORY: { stock: stkSheet_, mov: movSheet_, stockData: mvSnap_, movStart: mvStart_, movIds: mvStartIds_ } } });
try { lockU_.releaseLock(); } catch (e) {}
if (!mvRb_.complete) return jsonResponse_({ success: false, code: 'RESERVATION_MOVE_ROLLBACK_UNVERIFIED', shipment_id: shipmentId, data: { left: mvRb_.left.slice(0, 20) },
error: 'The source warehouse change failed (' + String(eMv_ && eMv_.message ? eMv_.message : eMv_) + ') and its rollback stopped before it could be proven complete (' + mvRb_.left.slice(0, 3).join('; ') + '). ' +
'The writes it could not prove are KEPT: the reservation may be partly moved. The undo restores the old source cell first, then its release row; at the new source the acquire row first, then its cell; a key named CELL_ABOVE_LEDGER keeps that quantity reserved until it is reviewed, and a key named CELL_BELOW_LEDGER is blocked by the reservation-books check until it is reviewed. ' + shipmentReservationReviewText_() });
if (sfUnk_) return jsonResponse_({ success: false, code: 'SOURCE_CHANGE_STATE_UNKNOWN', shipment_id: shipmentId, data: { holds: 'rolled back to ' + curSrc_, source_field: 'UNKNOWN (may name ' + wantSrc_ + ')' },
error: 'The source warehouse change failed (' + String(eMv_ && eMv_.message ? eMv_.message : eMv_) + '). The reservation was moved back to ' + curSrc_ + ' (every undo step verified), but the source field write may have landed and could not be re-read, so the shipment may name ' + wantSrc_ + '. The next operations refuse while the field and the reservation disagree. Reload and review the shipment.' });
return jsonResponse_({ success: false, code: 'RESERVATION_MOVE_FAILED', shipment_id: shipmentId,
error: 'The source warehouse change was rolled back: ' + String(eMv_ && eMv_.message ? eMv_.message : eMv_) +
'. Every undo step was checked (its row, its own id or key, and the value this change had written) and verified afterwards; the source warehouse was not changed. Timestamps are restored by row identity only.' });
}
}
var srcInLock_ = true;   // INT-CAND8 r8 (CH7-1): written inside the move try above
try { lockU_.releaseLock(); } catch (e) {}
reservationMoved_ = { from_warehouse_id: curSrc_, to_warehouse_id: wantSrc_, moved: moveList_ };
}
}


if (xcoKl_ && xcoKl_.assign) xcoAssignWrite_(ss, shipmentId, xcoKl_.assign, setCell);   // XCO-R15G A2: the Owner's first whole-draft assignment
var changed = 0;
for (var f = 0; f < SHIPMENT_EDITABLE_FIELDS_.length; f++) {
var fld = SHIPMENT_EDITABLE_FIELDS_[f];
if (body.hasOwnProperty(fld)) { if ((fld === 'warehouse_id' || fld === 'warehouse_code') && n01_.skipAlias) continue;   /* N01: an ignored blank alias writes nothing */ if (fld === 'source_warehouse_id' && typeof srcInLock_ !== 'undefined' && srcInLock_) { changed++; continue; } setCell(fld, body[fld]); changed++; }   // r7: written in the lock already
}



if (typeof svcAd3_.marker === 'string') { setCell('rate_card_version', svcAd3_.marker); changed++; }   // AD3-B: the server-owned to-be-assigned marker (written / cleared only here and by assignCarrier)
if (n01_.mirror) {   // N01 (A final2): only a NON-BLANK alias (destination absent) is mirrored; a blank alias never clears destination_warehouse_id
setCell('destination_warehouse_id', body.warehouse_id);
}







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


var cartonCheck = shipmentValidateCartons_(ss, shipmentId, false);
if (!cartonCheck.ok) {
return jsonResponse_({ success: false, error: cartonCheck.error });
}




if (newStatus === 'shipped' && curStatus !== 'shipped') {
var missing = [];
if (!mv('external_shipment_id')) missing.push('Shipment ID (external)');
if (!mv('reference_id')) missing.push('Reference ID');
if (!mv('warehouse_code')) missing.push('Warehouse Code');
if (!mv('etd')) missing.push('ETD');
if (!mv('eta')) missing.push('ETA');

if (mnum('shipment_total_qty') <= 0 && mnum('total_qty') <= 0) missing.push('Total Qty');
if (missing.length) {
return jsonResponse_({ success: false, error: 'Cannot Ship — missing required fields: ' + missing.join(', ') });
}
var shipCarton = shipmentValidateCartons_(ss, shipmentId, true);
if (!shipCarton.ok) {
return jsonResponse_({ success: false, error: 'Cannot Ship — ' + shipCarton.error });
}
}



if (body.hasOwnProperty('revision_reason') && String(body.revision_reason).trim()) {
var reasonText = String(body.revision_reason).trim();
var noteC = s.col('note');
var existingNote = noteC === -1 ? '' : String(rowVals[noteC] == null ? '' : rowVals[noteC]).trim();
var appended = '[RETURN TO DRAFT @' + now + ' by ' + actor + '] ' + reasonText;
setCell('note', existingNote ? (existingNote + '\n' + appended) : appended);
changed++;
}











if (newStatus) {
var _uKnown = SHIPMENT_PRE_DISPATCH_STATUSES_.concat(SHIPMENT_DISPATCHED_STATUSES_).concat(['stuck']);
if (String(newStatus).trim().toLowerCase() === SHIPMENT_CANCELLED_STATUS_) {
return jsonResponse_({ success: false, code: 'USE_CANCEL_SHIPMENT_DRAFT', shipment_id: shipmentId,
error: 'updateShipment cannot cancel a shipment: cancelling must also release the factory stock ' +
'reservation, atomically. Use the cancelShipmentDraft action. Nothing was changed.' });
}
if (_uKnown.indexOf(String(newStatus).trim().toLowerCase()) === -1) {
return jsonResponse_({ success: false, code: 'UNKNOWN_SHIPMENT_STATUS', shipment_id: shipmentId,
data: { requested: newStatus, known: _uKnown },
error: 'Unknown shipment status "' + newStatus + '". Nothing was changed.' });
}
}


if (newStatus) {
setCell('status', newStatus);
changed++;
if (newStatus === 'shipped' && curStatus !== 'shipped') {
setCell('shipped_at', now);
setCell('shipped_by', actor);
}
}



if (body.hasOwnProperty('hidden_from_draft') && body.hidden_from_draft) {
setCell('hidden_from_draft_at', now);
setCell('hidden_from_draft_by', actor);
changed++;
}

setCell('updated_by', actor);
var p1Stamp_ = editNextStamp_(now, [s.col('updated_at') === -1 ? '' : rowVals[s.col('updated_at')]]); setCell('updated_at', p1Stamp_);   // R71 (D4); R15F2 step 29: the stamp is kept for the answer



if (linesUpdated > 0) {
shipmentRecalcTotals_(ss, shipmentId);
}

return jsonResponse_({ success: true, data: { shipment_id: shipmentId, fields_updated: changed, lines_updated: linesUpdated, status: newStatus || curStatus, updated_at: (typeof p1Stamp_ !== 'undefined' && s.col('updated_at') !== -1) ? editTokWritten15f2_(p1Stamp_) : '', service: shipSvcStateOf_(ss, { shipment_id: shipmentId, rate_card_version: typeof svcAd3_.marker === 'string' ? svcAd3_.marker : (s.col('rate_card_version') < 0 ? '' : rowVals[s.col('rate_card_version')]), carrier_id: body.hasOwnProperty('carrier_id') ? body.carrier_id : (s.col('carrier_id') < 0 ? '' : rowVals[s.col('carrier_id')]), shipping_method: body.hasOwnProperty('shipping_method') ? body.shipping_method : (s.col('shipping_method') < 0 ? '' : rowVals[s.col('shipping_method')]), last_mile_delivery: body.hasOwnProperty('last_mile_delivery') ? body.last_mile_delivery : (s.col('last_mile_delivery') < 0 ? '' : rowVals[s.col('last_mile_delivery')]) }) } });   // R15F2 step 29: the version this Save wrote; AD3-B: + service
}






















function shipmentInvertedCustomsLabels_() {
var inv = {};
var src = (typeof CUSTOMS_TYPE_LABELS_ !== 'undefined') ? CUSTOMS_TYPE_LABELS_ : {};
for (var code in src) {
if (!src.hasOwnProperty(code)) continue;
var lbl = String(src[code] == null ? '' : src[code]).trim();
if (!lbl) continue;
if (inv.hasOwnProperty(lbl) && inv[lbl] !== code) inv[lbl] = '__AMBIGUOUS__'; else inv[lbl] = code;
}
return inv;
}

function shipmentRetireOneLabelCol_(ss, p, dryRun) {
var out = { table: p.table, label_col: p.labelCol, code_col: p.codeCol, status: '', backfilled: 0, affected_rows: [], deleted: false };
var sh = ss.getSheetByName(p.table);
if (!sh) { out.status = 'table_missing'; return out; }
var data = sh.getDataRange().getValues();
if (!data.length) { out.status = 'empty'; return out; }
var headers = data[0].map(function (h) { return String(h).trim(); });
var lc = headers.indexOf(p.labelCol);
if (lc === -1) { out.status = 'already_retired'; return out; }
var cc = headers.indexOf(p.codeCol);
for (var i = 1; i < data.length; i++) {
var label = String(data[i][lc] == null ? '' : data[i][lc]).trim();
var code = cc !== -1 ? String(data[i][cc] == null ? '' : data[i][cc]).trim() : '';
if (!label || code) continue;
if (p.dict && Object.prototype.hasOwnProperty.call(p.dict, label)) {
var mapped = p.dict[label];
if (mapped === '__AMBIGUOUS__') { out.affected_rows.push({ row: i + 1, label: label, reason: 'label maps to multiple codes' }); continue; }
if (cc !== -1 && !dryRun) sh.getRange(i + 1, cc + 1).setValue(mapped);
out.backfilled++;
} else {
out.affected_rows.push({ row: i + 1, label: label, reason: 'code blank and no 1:1 label→code mapping' });
}
}
if (out.affected_rows.length) { out.status = 'blocked_needs_review'; return out; }
if (dryRun) { out.status = 'ready_to_delete'; return out; }
sh.deleteColumn(lc + 1);
out.deleted = true; out.status = 'deleted';
return out;
}


function handleRetireShipmentLabelColumns_(body) {
body = body || {};
var dryRun = !!body.dry_run;
var ss = SpreadsheetApp.getActiveSpreadsheet();
var invCustoms = shipmentInvertedCustomsLabels_();
var plan = [
{ table: 'shipping_plans', labelCol: 'shipping_method_label', codeCol: 'shipping_method', dict: null },
{ table: 'shipping_plans', labelCol: 'customs_type_label', codeCol: 'customs_type', dict: invCustoms },
{ table: 'shipments', labelCol: 'shipping_method_label', codeCol: 'shipping_method', dict: null },
{ table: 'shipments', labelCol: 'shipments_customs_type_label', codeCol: 'shipments_customs_type', dict: invCustoms }
];
var report = [];
for (var i = 0; i < plan.length; i++) report.push(shipmentRetireOneLabelCol_(ss, plan[i], dryRun));
var blocked = report.filter(function (r) { return r.status === 'blocked_needs_review'; }).length;
return jsonResponse_({ success: true, data: { dry_run: dryRun, blocked_columns: blocked, columns: report } });
}

// INT-CAND8 r8 (CH7-4 / edit conflict) helpers - no state
function shipEditHeldLock_() { return { tryLock: function () { return true; }, waitLock: function () {}, hasLock: function () { return true; }, releaseLock: function () {} }; }   // the lock handleUpdateShipment_ already holds
function editTok_(v) { if (v === null || v === undefined) return ''; if (Object.prototype.toString.call(v) === '[object Date]' || (typeof v === 'object' && typeof v.getTime === 'function')) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
var t = String(v).trim(); if (/^\d{4}-\d{2}-\d{2}T/.test(t)) { var d = new Date(t); if (!isNaN(d.getTime())) return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); } return t; }   // the token at second precision, as shipmentTimestamp_ writes it
function editRowObj_(headers, row) { var o = {}; (headers || []).forEach(function (h, i) { if (h) o[h] = editTok_((row || [])[i]); }); return o; }

// INT-CAND9 r8 (CH8-1): the edit token compared as EPOCH SECONDS; anything unparsable or coarser than a second is IGNORED (r7 behaviour)
var SHIP_EDIT_TOKEN_IGNORED_ = '', SHIP_EDIT_WROTE_ = false;
function editEpochs_(v) {
  if (v === null || v === undefined) return { ok: false, why: 'EMPTY' };
  if (Object.prototype.toString.call(v) === '[object Date]' || (typeof v === 'object' && typeof v.getTime === 'function')) { var t0 = v.getTime(); return isNaN(t0) ? { ok: false, why: 'INVALID_DATE' } : { ok: true, secs: [Math.floor(t0 / 1000)] }; }
  var s = String(v).trim(); if (!s) return { ok: false, why: 'EMPTY' };
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, why: 'DATE_ONLY' };
  var m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) { if (m[4] === undefined) return { ok: false, why: 'MINUTE_ONLY' }; var w = m[1] + ' ' + m[2] + ':' + m[3] + ':' + m[4], out = [];
    [Session.getScriptTimeZone(), SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone()].forEach(function (tz) { try { var d = Utilities.parseDate(w, tz, 'yyyy-MM-dd HH:mm:ss'); if (d && !isNaN(d.getTime())) out.push(Math.floor(d.getTime() / 1000)); } catch (e) {} });
    return out.length ? { ok: true, secs: out } : { ok: false, why: 'UNPARSABLE' }; }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(s) || /\d{2}:\d{2}:\d{2} GMT[+-]\d{4}/.test(s)) { var d2 = new Date(s); if (!isNaN(d2.getTime())) return { ok: true, secs: [Math.floor(d2.getTime() / 1000)] }; }
  return { ok: false, why: 'UNPARSABLE' }; }
function editTokSame_(cell, tok) { var a = editEpochs_(cell), b = editEpochs_(tok); if (!a.ok || !b.ok) { SHIP_EDIT_TOKEN_IGNORED_ = (SHIP_EDIT_TOKEN_IGNORED_ ? SHIP_EDIT_TOKEN_IGNORED_ + '; ' : '') + 'row ' + (a.ok ? 'ok' : a.why) + ' / token ' + (b.ok ? 'ok' : b.why); return 'IGNORED'; }
  return editTokOne15f2_(cell, tok); }   // R15F2: one instant per side (script zone only for a wall clock) - the former either-zone match let a stale token through
// R71 (D4): the updated_at a token-bearing write puts on a row - strictly later (epoch seconds, as editTokSame_ compares) than every current
// stamp it replaces: `now` itself when it already is, else the newest current + 1 s, in the same yyyy-MM-dd HH:mm:ss script-time-zone format.
// A cell that is not a parsable second is not judged (its token is IGNORED by editTokSame_ anyway). Only shipping_plans / shipping_plan_lines
// / shipments rows are ever passed here - never purchase_order_lines (13_'s receipt evidence).
function editNextStamp_(now, cells) {
  var n = editEpochs_(now), top = null; if (!n.ok) return now;
  var tz_ = null; try { tz_ = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); } catch (eTz_) { tz_ = null; }
  // R71 small-3 (review M1): Sheets stores a written 'yyyy-MM-dd HH:mm:ss' as a Date read in the SPREADSHEET time zone. That Date's wall clock in the
  // spreadsheet zone is the string that was written - the script-zone frame `now` is in - so a Date cell is compared as that wall string, never as its
  // epoch (which is off by the zone difference: +8 h each write with a UTC sheet, no bump at all with a Tokyo sheet).
  (cells || []).forEach(function (c) { if (tz_ && c && typeof c === 'object' && typeof c.getTime === 'function') { if (isNaN(c.getTime())) return; c = Utilities.formatDate(c, tz_, 'yyyy-MM-dd HH:mm:ss'); }
    var e = editEpochs_(c); if (e.ok && (top === null || e.secs[0] > top)) top = e.secs[0]; });
  if (top === null || n.secs[0] > top) return now;
  return Utilities.formatDate(new Date((top + 1) * 1000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
// R71 small-3 (review m1): the stamp for a writer whose row THIS request has just stamped through editNextStamp_ (no token was issued in between):
// never earlier than the current stamp, and no further bump - `now` when it is later, else the current stamp itself (same frame and format).
function editKeepStamp_(now, cells) { var nx = editNextStamp_(now, cells); if (nx === now) return now; var e = editEpochs_(nx); return e.ok ? Utilities.formatDate(new Date((e.secs[0] - 1) * 1000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss') : now; }
function editTagIgnored_(out) { if (!SHIP_EDIT_TOKEN_IGNORED_ || !out || typeof out.getContent !== 'function') return out; try { var j = JSON.parse(out.getContent()); j.token_ignored = SHIP_EDIT_TOKEN_IGNORED_; return jsonResponse_(j); } catch (e) { return out; } }
// INT-CAND9 r8 (CH8-4 / CH8-6): an answer that refuses or fails AFTER a shipment field was written moves updated_at and says what may have landed
function shipEditFinish_(sid, out, thrown) {
  var j = null; if (out) { try { j = JSON.parse(out.getContent()); } catch (e) { return out; } }
  if (thrown) j = { success: false, code: 'SHIPMENT_UPDATE_FAILED', shipment_id: sid, error: 'The shipment update stopped with an error (' + String(thrown && thrown.message ? thrown.message : thrown) + '). Fields written before the error are kept; no reservation is left half-moved by it (a source move rolls back or completes inside its own step).' };
  var changed = !!thrown;
  if (j && j.success === false && SHIP_EDIT_WROTE_) { var bumped = false;
    try { var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('shipments'), r = shipmentReadSheet_(sh), ic = r.col('shipment_id'), uc = r.col('updated_at'); for (var i = 1; ic !== -1 && i < r.rows.length; i++) if (String(r.rows[i][ic]).trim() === sid) { if (uc !== -1) { sh.getRange(i + 1, uc + 1).setValue(editNextStamp_(shipmentTimestamp_(), [r.rows[i][uc]])); bumped = true;   /* R71 (D4) */ } break; } } catch (eB) { bumped = false; }
    j.writes_may_have_landed = true; j.updated_at_moved = bumped;
    j.error = String(j.error || '').replace(/ ?Nothing was (changed|written|saved)[^.]*\./g, '').replace(/ ?Nothing was changed \([^)]*\)\./g, '').trim() + ' Fields of this request may already have been written before it stopped' + (bumped ? ' (updated_at was moved, so every other open copy of this shipment must reload before saving)' : '') + '. Reload the shipment and review it before retrying.';
    changed = true; }
  if (j && SHIP_EDIT_TOKEN_IGNORED_) { j.token_ignored = SHIP_EDIT_TOKEN_IGNORED_; changed = true; }
  return changed ? jsonResponse_(j) : out; }

// ============================================================================================================
// SANDBOX-GATE-1g — LEAD TIME follows the carrier / method (read-only; nothing is stored, nothing is rewritten).
// carrier_lead_times rows of THIS carrier, matched with KMRA's own rule (method key, origin / destination axis, last mile when given).
// Exactly one avg_days value -> MATCHED; no row, no avg_days, or two different avg_days -> UNKNOWN with the reason. A lead time is
// therefore always the one for the carrier / method on the screen: an old one cannot survive a change because nothing keeps it.
// ============================================================================================================
function shipOriginCountry1g_(ss, whId) {
  var id = String(whId == null ? '' : whId).trim(), sh = ss.getSheetByName('warehouses'); if (!id || !sh) return '';
  var w = shippingPlanReadObjects_(sh).filter(function (r) { return String(r.warehouse_id || '').trim() === id; })[0];
  return w ? String(w.country || '').trim() : '';
}
function shipLt1g_(ss, carrierId, method, lastMile, originCountry, destCountry) {
  function S(v) { return String(v == null ? '' : v).trim(); }
  var Km = (typeof KMRA !== 'undefined' && KMRA) ? KMRA : null;
  var q = { originCountry: S(originCountry), destinationCountry: S(destCountry), lastMile: S(lastMile) }, base = { origin_country: q.originCountry, destination_country: q.destinationCountry };
  if (!Km) return Object.assign({ state: 'UNKNOWN', reason: 'KMRA_UNAVAILABLE' }, base);
  // The rate-card token sea_express and the lead-time label Sea Express name the same service, not Sea.
  function methodKey(value) { var token = S(value).toLowerCase(); return Km.canonicalMethodKey(token === 'sea_express' ? 'sea express' : token); }
  var c = S(carrierId).toLowerCase(), key = methodKey(method);
  if (!c) return Object.assign({ state: 'UNKNOWN', reason: 'NO_CARRIER' }, base);
  if (!key) return Object.assign({ state: 'UNKNOWN', reason: 'NO_METHOD' }, base);
  var sh = ss.getSheetByName('carrier_lead_times'); if (!sh) return Object.assign({ state: 'UNKNOWN', reason: 'NO_LEAD_TIME_TABLE' }, base);
  var rows = shippingPlanReadObjects_(sh).filter(function (r) { return S(r.carrier_id).toLowerCase() === c && shipLtActive_(r); })   // AD3-B: an inactive lead time never answers an ETA
    .map(function (r) { var n = Km.normalizeLeadTime(r); n.methodKey = methodKey(n.shippingMethod); n.__id = S(r.lead_time_id); return n; })
    .filter(function (lt) { return lt.methodKey === key && Km.axisOk(lt.originCountry, q.originCountry) && Km.axisOk(lt.destinationCountry, q.destinationCountry) && (q.lastMile === '' || Km.axisOk(lt.lastMileDelivery, q.lastMile)); });
  if (!rows.length) return Object.assign({ state: 'UNKNOWN', reason: 'NO_LEAD_TIME_FOR_THIS_CARRIER_METHOD_LANE' }, base);
  var avg = rows.filter(function (r) { return isFinite(r.avgDays); }), seen = {};
  avg.forEach(function (r) { seen[String(r.avgDays)] = 1; });
  if (!avg.length) return Object.assign({ state: 'UNKNOWN', reason: 'LEAD_TIME_HAS_NO_AVG_DAYS' }, base);
  if (Object.keys(seen).length > 1) return Object.assign({ state: 'UNKNOWN', reason: 'LEAD_TIME_AMBIGUOUS', rows: avg.length }, base);
  var r0 = avg[0];
  return Object.assign({ state: 'MATCHED', days: r0.avgDays, min_days: isFinite(r0.minDays) ? r0.minDays : '', max_days: isFinite(r0.maxDays) ? r0.maxDays : '', lead_time_id: r0.__id }, base);
}
// AD3-B (coordinator / Author A finding): a carrier_lead_times row is ACTIVE unless is_active is FALSE / 0 / no / n (blank = active, the existing
// behaviour) or status is inactive / disabled. Used by every 11_ / 12_ lead-time reader (service options, ETA lead time). The service CAPABILITY
// (shipCarrierServices_) deliberately still reads inactive rows: there they are the Owner's service declaration, never a lead time.
function shipLtActive_(r) {
  if (/^(inactive|disabled)$/i.test(String(r && r.status == null ? '' : r.status).trim())) return false;
  var a = r ? r.is_active : ''; if (a === false) return false;
  return !/^(false|0|no|n)$/i.test(String(a == null ? '' : a).trim());
}
function shipEtaCheck1g_(v, lt) {
  function ymd(x) { if (x instanceof Date && !isNaN(x)) { try { return Utilities.formatDate(x, Session.getScriptTimeZone(), 'yyyy-MM-dd'); } catch (e) { return x.toISOString().slice(0, 10); } } var s = String(x == null ? '' : x).trim(); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''; }
  var etd = ymd(v.etd), eta = ymd(v.eta);
  if (!lt || lt.state !== 'MATCHED') return { state: 'LEAD_TIME_UNKNOWN', etd: etd, eta: eta };
  if (!etd) return { state: 'NO_ETD', eta: eta, days: lt.days };
  var p = etd.split('-'), exp = new Date(Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]) + Number(lt.days))).toISOString().slice(0, 10);
  if (!eta) return { state: 'NO_ETA', etd: etd, expected_eta: exp, days: lt.days };
  return { state: eta === exp ? 'MATCHES' : 'DIFFERS', etd: etd, eta: eta, expected_eta: exp, days: lt.days };
}

// R13: called only while the existing shipment creation ScriptLock is held.
var SC13_POLICY_KEY_ = 'KM_SHIPMENT_CONSOLIDATION_V1';
var SC13_MODES_ = ['SEPARATE', 'SAME_COMPANY', 'CROSS_COMPANY'];
var SC13_LINK_HEADERS_ = ['shipment_plan_link_id', 'shipment_id', 'shipping_plan_id', 'created_at', 'created_by'];
function sc13Str_(x) { return String(x == null ? '' : x).trim(); }
function sc13Fail_(code) { throw new Error(code); }
function sc13Read_(ss, name, required) {
  if (XCO_READ_MEMO_) return xcoReadMemo_(ss, name, required);   /* XCO-R15G MINOR-7: scoped read memo (read-only phases only) */
  var sh = ss.getSheetByName(name);
  if (!sh) sc13Fail_('CONSOLIDATION_TABLE_MISSING:' + name);
  var d = sh.getDataRange().getValues(), h = (d[0] || []).map(sc13Str_);
  if (h.some(function (k, i) { return k && h.indexOf(k) !== i; })) sc13Fail_('CONSOLIDATION_DUPLICATE_HEADER:' + name);
  (required || []).forEach(function (k) { if (h.indexOf(k) < 0) sc13Fail_('CONSOLIDATION_COLUMN_MISSING:' + name + '.' + k); });
  return { sheet: sh, headers: h, rows: d.slice(1).map(function (r, i) {
    var o = { __row: i + 2 }; h.forEach(function (k, j) { if (k) o[k] = r[j]; }); return o;
  }) };
}
function sc13One_(rows, key, value) {
  var a = rows.filter(function (r) { return sc13Str_(r[key]) === sc13Str_(value); });
  if (a.length !== 1) sc13Fail_('CONSOLIDATION_ID_NOT_UNIQUE:' + key);
  return a[0];
}
function sc13Set_(table, row, key, value) {
  var c = table.headers.indexOf(key); if (c < 0) sc13Fail_('CONSOLIDATION_COLUMN_MISSING:' + key);
  table.sheet.getRange(row.__row, c + 1).setValue(value); row[key] = value;
}
function sc13Policy_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SC13_POLICY_KEY_);
  if (!raw) return { mode: 'SEPARATE', version: 0 };
  var p; try { p = JSON.parse(raw); } catch (e) { sc13Fail_('CONSOLIDATION_POLICY_UNREADABLE'); }
  if (SC13_MODES_.indexOf(p.mode) < 0 || !Number.isSafeInteger(p.version) || p.version < 1) sc13Fail_('CONSOLIDATION_POLICY_INVALID');
  return p;
}
function handleShipmentConsolidationPolicy_(body) {
  body = body || {};
  var enabled = (typeof RTR_SANDBOX_GATE_ !== 'undefined' && RTR_SANDBOX_GATE_.env === 'KM_SANDBOX') ||
    (typeof RTR_PRODUCTION_PROFILE_ !== 'undefined' && RTR_PRODUCTION_PROFILE_.environment === 'KM_PRODUCTION');
  if (!enabled) return jsonResponse_({ success: false, zero_write: true, code: 'ENVIRONMENT_NOT_ENABLED' });
  if (body.command === 'read') return jsonResponse_({ success: true, policy: sc13Policy_() });
  if (body.command !== 'save' || SC13_MODES_.indexOf(body.mode) < 0 || !Number.isSafeInteger(body.expected_version) || !sc13Str_(body.actor) || !sc13Str_(body.reason)) {
    return jsonResponse_({ success: false, zero_write: true, code: 'POLICY_INPUT_REQUIRED' });
  }
  var lock = LockService.getScriptLock(), attempted = false;
  if (!lock.tryLock(30000)) return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_UNAVAILABLE' });
  try {
    var old = sc13Policy_();
    if (old.version !== body.expected_version) return jsonResponse_({ success: false, zero_write: true, code: 'POLICY_EDIT_CONFLICT', policy: old });
    var next = { mode: body.mode, version: old.version + 1, updated_at: shipmentTimestamp_(),
      actor: sc13Str_(body.actor).slice(0, 100), reason: sc13Str_(body.reason).slice(0, 500) };
    attempted = true; PropertiesService.getScriptProperties().setProperty(SC13_POLICY_KEY_, JSON.stringify(next));
    if (JSON.stringify(sc13Policy_()) !== JSON.stringify(next)) sc13Fail_('POLICY_READBACK_FAILED');
    return jsonResponse_({ success: true, policy: next });
  } catch (e) { return jsonResponse_({ success: false, outcome: attempted ? 'UNKNOWN' : 'REFUSED', zero_write: !attempted, code: String(e.message || e) }); }
  finally { lock.releaseLock(); }
}
function handleShipmentConsolidationPolicyGet_() { return handleShipmentConsolidationPolicy_({ command: 'read' }); }
function handleShipmentConsolidationPolicySave_(body) { return handleShipmentConsolidationPolicy_(Object.assign({}, body || {}, { command: 'save' })); }
function sc13Pending_(ship) { return /(?:^|\n)\[SC13_PENDING:/.test(sc13Str_(ship.note)); }
function sc13AssertReady_(ship) { if (sc13Pending_(ship)) sc13Fail_('CONSOLIDATION_OUTCOME_UNKNOWN'); }
function sc13PublicNote_(note) { return String(note == null ? '' : note).replace(/(?:^|\n)\[SC13_[A-Z_]+:[^\]\r\n]*\]/g, '').trim(); }   // XCO-R15G MAJOR-C: every SC13 marker
function sc13KeepMarkers_(before, next) {
  if (/\[SC13_/.test(String(next))) sc13Fail_('CONSOLIDATION_RESERVED_NOTE_MARKER');
  var markers = String(before || '').match(/\[SC13_[A-Z_]+:[^\]\r\n]*\]/g) || [];   // XCO-R15G MAJOR-C: an edit keeps EVERY SC13 marker (CANCELLED / UNLINKED / ASSIGN / REMOVED too)
  return sc13PublicNote_(next) + (markers.length ? '\n' + markers.join('\n') : '');
}
function sc13Source_(ss, line, ship) {
  var pl = sc13One_(sc13Read_(ss, 'shipping_plan_lines', ['shipping_plan_line_id', 'shipping_plan_id', 'sku', 'approved_qty']).rows,
    'shipping_plan_line_id', line.shipping_plan_line_id);
  var p = sc13One_(sc13Read_(ss, 'shipping_plans', ['shipping_plan_id', 'company', 'country', 'marketplace', 'destination_warehouse_id']).rows, 'shipping_plan_id', pl.shipping_plan_id);   // XCO-R15G A3: dest
  var qty = Number(line.shipment_qty);
  if (!sc13Str_(p.company) || !Number.isSafeInteger(qty) || qty <= 0 || Number(pl.approved_qty) !== qty || sc13Str_(line.sku) !== sc13Str_(pl.sku)) sc13Fail_('CONSOLIDATION_LINEAGE_MISMATCH');
  var source = { plan_id: sc13Str_(p.shipping_plan_id), plan_line_id: sc13Str_(pl.shipping_plan_line_id),
    company: sc13Str_(p.company), country: sc13Str_(p.country), marketplace: sc13Str_(pl.marketplace || p.marketplace),
    site_sku: sc13Str_(pl.site_sku), sku: sc13Str_(pl.sku), qty: qty };
  if (!source.marketplace || source.marketplace === 'MULTI') sc13Fail_('CONSOLIDATION_LINE_MARKETPLACE_UNKNOWN');
  var m = sc13Str_(line.note).match(/(?:^|\n)\[SC13_SOURCE:([^\]]+)\]/);
  if (m) {
    var frozen; try { frozen = JSON.parse(decodeURIComponent(m[1])); } catch (e) { sc13Fail_('CONSOLIDATION_LINEAGE_UNREADABLE'); }
    if (frozen && frozen.v === 2) return xcoSourceV2Check_(source, frozen, p, ship);   // XCO-R15G A3: v2 (dest + sig)
    if (JSON.stringify(source) !== JSON.stringify(frozen)) sc13Fail_('CONSOLIDATION_SOURCE_CHANGED');
    return source;   // XCO-R15G: a legacy v1 marker reads as before (no dest); sc13SourceStrict_ refuses it
  } else if (sc13Str_(ship.shipping_plan_id) !== source.plan_id) sc13Fail_('CONSOLIDATION_FROZEN_SOURCE_MISSING');
  return xcoSourceV2_(source, p.destination_warehouse_id, ship);   // XCO-R15G A3: what a writer freezes is v2
}
function sc13LinkIds_(ss, sid) {
  var t = sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_), ships = sc13ShipIndex_(ss), seen = {}, ids = [];
  t.rows.forEach(function (r) {
    var p = sc13Str_(r.shipping_plan_id), s = sc13Str_(r.shipment_id);
    if (!p || !s) sc13Fail_('CONSOLIDATION_PLAN_LINK_CONFLICT');
    if (sc13LinkEnded_(ships[s], p, r)) return;   // XCO-R15G H2: ended per link ROW (a Plan can be linked again to the same draft)   // XCO-R15G H1: an ended link row is history, never live
    if (seen[p]) sc13Fail_('CONSOLIDATION_PLAN_LINK_CONFLICT');
    seen[p] = s; if (s === sid) ids.push(p);
  });
  return ids;
}
function sc13LinkForPlan_(ss, pid) {
  var sh = ss.getSheetByName('shipment_plan_links'); if (!sh) return '';
  var ships = sc13ShipIndex_(ss);
  var t = sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_), a = t.rows.filter(function (r) { return sc13Str_(r.shipping_plan_id) === pid && !sc13LinkEnded_(ships[sc13Str_(r.shipment_id)], pid, r); });
  if (a.length > 1) sc13Fail_('CONSOLIDATION_PLAN_LINK_CONFLICT');
  return a.length ? sc13Str_(a[0].shipment_id) : '';
}
function sc13Link_(ss, sid, pid, actor, now) {
  var other = sc13LinkForPlan_(ss, pid);
  if (other) { if (other !== sid) sc13Fail_('CONSOLIDATION_PLAN_LINK_CONFLICT'); return; }
  var t = sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_);
  shipmentAppendByHeader_(t.sheet, { shipment_plan_link_id: 'SPLK-' + Utilities.getUuid(), shipment_id: sid,
    shipping_plan_id: pid, created_at: now, created_by: actor });
  if (sc13LinkForPlan_(ss, pid) !== sid) sc13Fail_('CONSOLIDATION_LINK_READBACK_FAILED');
}
function sc13Key_(x, plan) {
  var k = ['source_warehouse_id', 'destination_warehouse_id', 'country', 'carrier_id', 'shipping_method', 'last_mile_delivery'];
  var values = k.map(function (n) { return sc13Str_(x[n]); });
  values.push(sc13Str_(x[plan ? 'customs_type' : 'shipments_customs_type']));
  values.push(sc13Str_(x.import_duty_treatment));
  // Country or a marketplace label alone is not a physical destination.
  if (values.slice(0, 7).some(function (v) { return !v; })) return '';
  return JSON.stringify(values.concat(['temperature_requirement', 'hazmat_flag', 'is_cross_dock'].map(function (key) { return sc13Str_(x[key]); })));
}
function sc13SameParties_(ss, companies) {
  if (sc13Policy_().mode === 'CROSS_COMPANY') return;   // XCO-R15G G1 (Owner: parties never block; aeaa05c0 MINOR-1): the documents use only the HEADER company's parties
  var entities = partyReadCompanyLegalEntities_(ss), keys = [], when = Date.now();
  companies.forEach(function (company) {
    var p = partyResolveShipmentShipper_(entities, { company: company }, when), s = partyResolveSellerOfRecord_(entities, { company: company }, when);
    if (!p.ok || !s.ok) sc13Fail_('CONSOLIDATION_DOCUMENT_PARTY_UNKNOWN');
    function identity(e) {
      return ['legal_name', 'country', 'address_line_1', 'address_line_2', 'city', 'state_or_region', 'postal_code', 'tax_or_business_id']
        .map(function (k) { return sc13Str_(e[k]); });
    }
    if (!p.shipper.legal_name || !p.shipper.tax_or_business_id) sc13Fail_('CONSOLIDATION_DOCUMENT_PARTY_UNKNOWN');
    keys.push(JSON.stringify([identity(p.shipper), identity(s.seller_of_record)]));
  });
  if (keys.some(function (k) { return k !== keys[0]; })) sc13Fail_('CONSOLIDATION_DOCUMENT_PARTY_DECISION_REQUIRED');
}
function sc13Verify_(ss, ship) {
  sc13AssertReady_(ship);
  var sid = sc13Str_(ship.shipment_id), ids = sc13LinkIds_(ss, sid);
  if (!ids.length) sc13Fail_('CONSOLIDATION_LINK_MISSING');
  var lines = sc13Read_(ss, 'shipment_lines', ['shipment_line_id', 'shipment_id', 'shipping_plan_line_id', 'shipment_qty', 'sku', 'note']).rows
    .filter(function (l) { return sc13Str_(l.shipment_id) === sid && !sc13LineRemoved_(l); });   // XCO-R15G H2: a removed line is history
  if (typeof mcpLayout_ === 'function') mcpLayout_(lines, 'shipment');
  var seen = {}, need = {}, companies = [];
  lines.forEach(function (l) {
    var src = sc13Source_(ss, l, ship);
    if (ids.indexOf(src.plan_id) < 0 || seen[src.plan_line_id]) sc13Fail_('CONSOLIDATION_LINEAGE_MISMATCH');
    seen[src.plan_line_id] = 1; need[src.sku] = (need[src.sku] || 0) + src.qty;
    if (companies.indexOf(src.company) < 0) companies.push(src.company);
  });
  sc13Read_(ss, 'shipping_plan_lines', ['shipping_plan_id', 'shipping_plan_line_id']).rows.forEach(function (pl) {
    if (ids.indexOf(sc13Str_(pl.shipping_plan_id)) >= 0 && !seen[sc13Str_(pl.shipping_plan_line_id)]) sc13Fail_('CONSOLIDATION_PLAN_LINE_MISSING');
  });
  var plans = sc13Read_(ss, 'shipping_plans', ['shipping_plan_id', 'transferred_shipment_id', 'status']).rows;
  ids.forEach(function (id) {
    var p = sc13One_(plans, 'shipping_plan_id', id);
    if (['approved', 'completed'].indexOf(sc13Str_(p.status)) < 0 || sc13Str_(p.transferred_shipment_id) !== sid) sc13Fail_('CONSOLIDATION_PLAN_TRANSFER_MISMATCH');
  });
  var qty = Object.keys(need).reduce(function (sum, sku) { return sum + need[sku]; }, 0);
  if (!qty || Number(ship.shipment_total_qty) !== qty) sc13Fail_('CONSOLIDATION_TOTAL_MISMATCH');
  if (companies.length > 1) sc13SameParties_(ss, companies);
  return { lines: lines, need: need, companies: companies, plans: ids };
}
function sc13RegisterLocked_(ss, sid, pid, actor, now) {
  var t = sc13Read_(ss, 'shipments', ['note']), s = sc13One_(t.rows, 'shipment_id', sid), note = sc13Str_(s.note);
  var lt = sc13Read_(ss, 'shipment_lines', ['shipment_id', 'shipping_plan_line_id', 'note']);
  sc13Set_(t, s, 'note', note + '\n[SC13_PENDING:register-' + pid + ']');
  lt.rows.filter(function (l) { return sc13Str_(l.shipment_id) === sid; }).forEach(function (l) {
    sc13Set_(lt, l, 'note', sc13Str_(l.note) + '\n[SC13_SOURCE:' + encodeURIComponent(JSON.stringify(sc13Source_(ss, l, s))) + ']');
  });
  sc13Link_(ss, sid, pid, actor, now);
  var fresh = sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', sid); fresh.note = note; sc13Verify_(ss, fresh);
  sc13Set_(t, s, 'note', note + '\n[SC13_DONE:register-' + pid + ']');
}
function sc13Prepare_(ss, planId, policy) {
  var ps = sc13Read_(ss, 'shipping_plans', ['shipping_plan_id', 'company', 'status', 'updated_at', 'transferred_shipment_id', 'transferred_to_shipment_at']);
  var p = sc13One_(ps.rows, 'shipping_plan_id', planId);
  if (sc13Str_(p.status) !== 'approved') sc13Fail_('CONSOLIDATION_PLAN_NOT_APPROVED');
  var ships = sc13Read_(ss, 'shipments', ['shipment_id', 'shipping_plan_id', 'note', 'status', 'updated_at', 'updated_by', 'shipment_total_qty']);
  var linked = sc13LinkForPlan_(ss, planId);
  if (linked) {
    var owned = sc13One_(ships.rows, 'shipment_id', linked);
    var proof = sc13Verify_(ss, owned);
    if (csdIsDispatchedStatus_(owned.status)) {
      var dispatched = csdDispatchConsistency_(ss, linked, csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', linked), csdEventExists_(ss, linked), csdMovementExists_(ss, linked));
      if (!dispatched.ok) sc13Fail_('CONSOLIDATION_DISPATCH_STATE_INCONSISTENT');
    } else {
      if (['draft', 'ready_to_ship'].indexOf(sc13Str_(owned.status)) < 0) sc13Fail_('CONSOLIDATION_SHIPMENT_NOT_REUSABLE');
      if (csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', linked) || csdEventExists_(ss, linked) || csdMovementExists_(ss, linked)) sc13Fail_('CONSOLIDATION_DISPATCH_STATE_INCONSISTENT');
      var wh = sc13Str_(owned.source_warehouse_id), domain = shipmentSourceDomain_(ss, wh), overseas = domain === SHIPMENT_DOMAIN_OVERSEAS_;
      var sheets = { stockSheet: ss.getSheetByName(overseas ? 'overseas_inventory_snapshot' : 'factory_stock'), movSheet: ss.getSheetByName(overseas ? 'overseas_inventory_movements' : 'factory_stock_movements') };
      var held = shipmentDomainHeld_(domain, sheets, linked), keys = Object.keys(proof.need);
      var books = shipmentCancelBooks_(ss, linked, wh);
      if (books.verdict !== 'RECONCILED' || keys.some(function (sku) { return Number(held[wh + '||' + sku] || 0) !== proof.need[sku]; }) ||
          Object.keys(held).some(function (key) { return Number(held[key]) > 0 && (key.indexOf(wh + '||') !== 0 || !proof.need[key.slice((wh + '||').length)]); })) sc13Fail_('CONSOLIDATION_RESERVATION_MISMATCH');
    }
    if (sc13Str_(p.transferred_shipment_id) !== linked) sc13Fail_('CONSOLIDATION_PLAN_TRANSFER_INCOMPLETE');
    return { handled: true, result: { created: false, reason: 'already_exists', shipment_id: linked } };
  }
  if (policy.mode === 'SEPARATE') return { handled: false };
  sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_);
  var samePlan = ships.rows.filter(function (s) { return sc13Str_(s.shipping_plan_id) === planId && sc13Str_(s.status) !== 'cancelled'; });
  if (samePlan.length > 1) sc13Fail_('CONSOLIDATION_LEGACY_PLAN_NOT_UNIQUE');
  if (samePlan.length === 1) return { handled: false };
  if (sc13Str_(p.transferred_shipment_id)) sc13Fail_('CONSOLIDATION_LEGACY_TRANSFER_REVIEW_REQUIRED');
  var xcdV_ = policy.mode === 'CROSS_COMPANY' ? xcdValidate_(ss) : null;   // XCO-R15G A1: re-validated inside the lock, every time
  var key = xcdMergeKey_(p, true, policy, xcdV_);
  if (!key) return { handled: false };
  var candidates = ships.rows.filter(function (s) {
    return sc13Str_(s.status) === 'draft' && xcdMergeKey_(s, false, policy, xcdV_) === key && sc13LinkIds_(ss, sc13Str_(s.shipment_id)).length > 0 &&   // XCO-R15G A1
      ((policy.mode === 'CROSS_COMPANY' && xcoFactoryOrigin_(ss, p)) || sc13Str_(s.company) === sc13Str_(p.company));   // XCO-R15G O-2 (Owner, closed): cross-company only from a factory origin
  });
  if (candidates.length > 1) sc13Fail_('CONSOLIDATION_TARGET_AMBIGUOUS');
  if (!candidates.length) return { handled: false };
  var ship = candidates[0]; sc13AssertReady_(ship);
  // Old drafts require an explicit migration; never infer a many-plan ownership from a legacy header.
  var v = sc13Verify_(ss, ship);
  xcoMergeDestCheck_(ss, ship, v.lines, xcdV_);   // XCO-R15G B1-MAJOR-1 (a): every line agrees with the draft destination, or no merge
  var companies = v.companies.slice(); if (companies.indexOf(sc13Str_(p.company)) < 0) companies.push(sc13Str_(p.company));
  if (companies.length > 1) sc13SameParties_(ss, companies);
  var pls = sc13Read_(ss, 'shipping_plan_lines', ['shipping_plan_id', 'shipping_plan_line_id', 'sku', 'approved_qty']);
  var incoming = pls.rows.filter(function (r) { return sc13Str_(r.shipping_plan_id) === planId; });
  if (!incoming.length) sc13Fail_('CONSOLIDATION_PLAN_HAS_NO_LINES');
  if (typeof mcpLayout_ === 'function') mcpLayout_(incoming, 'plan');
  if (sc13Str_(p.parent_shipping_plan_id) && sc13Str_(p.parent_shipping_plan_id) !== sc13Str_(p.shipping_plan_id)) sc13Fail_('CONSOLIDATION_COMBINED_PLAN_REVIEW_REQUIRED');
  return { handled: true, plan: p, planTable: ps, ship: ship, shipTable: ships, before: v, incoming: incoming, policy: policy };
}
function sc13MergeLocked_(ss, prepared, actor) {
  var p = prepared.plan, ship = prepared.ship, sid = sc13Str_(ship.shipment_id), pid = sc13Str_(p.shipping_plan_id);
  var lt = sc13Read_(ss, 'shipment_lines', ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'shipping_plan_line_id', 'note']);
  ['shipment_carton_qty', 'units_per_carton', 'shipment_carton_cbm', 'gross_weight', 'net_weight', 'created_at', 'updated_at'].forEach(function (k) {
    if (lt.headers.indexOf(k) < 0) sc13Fail_('CONSOLIDATION_COLUMN_MISSING:shipment_lines.' + k);
  });
  ['shipment_total_cartons', 'shipment_total_cbm', 'shipment_total_gross_weight', 'shipment_total_net_weight', 'rate_card_id', 'rate_card_version',
    'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost'].forEach(function (k) {
    if (prepared.shipTable.headers.indexOf(k) < 0) sc13Fail_('CONSOLIDATION_COLUMN_MISSING:shipments.' + k);
  });
  var wh = sc13Str_(ship.source_warehouse_id), dom = shipmentSourceDomain_(ss, wh);
  var overseas = dom === SHIPMENT_DOMAIN_OVERSEAS_;
  var sheets = { domain: dom, stockSheet: ss.getSheetByName(overseas ? 'overseas_inventory_snapshot' : 'factory_stock'),
    movSheet: ss.getSheetByName(overseas ? 'overseas_inventory_movements' : 'factory_stock_movements') };
  if (!sheets.stockSheet || !sheets.movSheet) sc13Fail_('CONSOLIDATION_RESERVATION_TABLE_MISSING');
  var need = Object.assign({}, prepared.before.need), now = shipmentTimestamp_(), journal = [];
  var newLines = prepared.incoming.map(function (pl) {
    var qty = Number(pl.approved_qty), cartons = Number(pl.plan_carton_qty === '' || pl.plan_carton_qty == null ? pl.carton_qty : pl.plan_carton_qty);
    if (!Number.isSafeInteger(qty) || qty <= 0 || !Number.isFinite(cartons) || cartons <= 0) sc13Fail_('CONSOLIDATION_BAD_QUANTITY');
    var l = { shipment_line_id: 'SHL-' + Utilities.getUuid(), shipment_id: sid, sku: pl.sku,
      shipment_qty: qty, shipment_carton_qty: cartons, units_per_carton: pl.units_per_carton,
      shipment_carton_cbm: pl.cbm, gross_weight: pl.gross_weight, net_weight: pl.net_weight,
      shipping_plan_line_id: pl.shipping_plan_line_id, note: sc13Str_(pl.note), created_at: now, updated_at: now };
    var src = sc13Source_(ss, l, { shipping_plan_id: pid, shipment_id: sid });   // XCO-R15G A3: the sig binds the shipment
    l.note += '\n[SC13_SOURCE:' + encodeURIComponent(JSON.stringify(src)) + ']';
    Object.keys(pl).forEach(function (k) { if (k.indexOf('snapshot_') === 0) l[k] = pl[k]; });
    need[src.sku] = (need[src.sku] || 0) + qty; return l;
  });
  var skus = Object.keys(need), books = shipmentReservationBooks_(dom, sheets, wh, skus);
  if (books.verdict !== 'RECONCILED') sc13Fail_('CONSOLIDATION_RESERVATION_BOOKS_NOT_RECONCILED');
  var held = shipmentDomainHeld_(dom, sheets, sid);
  Object.keys(held).forEach(function (k) {
    if (Number(held[k]) > 0 && (k.indexOf(wh + '||') !== 0 || !prepared.before.need[k.slice((wh + '||').length)])) sc13Fail_('CONSOLIDATION_FOREIGN_HOLD');
  });
  skus.forEach(function (sku) {
    if (Number(held[wh + '||' + sku] || 0) !== Number(prepared.before.need[sku] || 0)) sc13Fail_('CONSOLIDATION_RESERVATION_MISMATCH');
    var b = shipmentDomainAvailable_(dom, sheets, wh, sku);
    if (Number(b.available) < need[sku] - (prepared.before.need[sku] || 0)) sc13Fail_('CONSOLIDATION_INSUFFICIENT_STOCK');
  });
  if (csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', sid) || csdEventExists_(ss, sid) || csdMovementExists_(ss, sid)) sc13Fail_('CONSOLIDATION_DISPATCH_EVIDENCE_PRESENT');
  var note = sc13Str_(ship.note), op = 'SC13-' + Utilities.getUuid(), begun = false;
  try { sc13Set_(prepared.shipTable, ship, 'note', note + '\n[SC13_PENDING:' + op + ']'); }
  catch (markerError) {
    var unchanged = false;
    try { unchanged = sc13Str_(sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', sid).note) === note; } catch (readError) {}
    return { created: false, reason: unchanged ? 'CONSOLIDATION_MARKER_NOT_WRITTEN' : 'CONSOLIDATION_OUTCOME_UNKNOWN',
      outcome: unchanged ? 'REFUSED' : 'UNKNOWN', zero_write: unchanged, retry_safe: unchanged, shipment_id: sid, operation_id: op };
  }
  try {
    // This durable marker is the quarantine gate for every downstream writer. Never auto-rollback partial Sheets writes.
    begun = true;
    prepared.before.lines.forEach(function (l) {
      if (!/\[SC13_SOURCE:/.test(sc13Str_(l.note))) sc13Set_(lt, l, 'note', sc13Str_(l.note) + '\n[SC13_SOURCE:' + encodeURIComponent(JSON.stringify(sc13Source_(ss, l, ship))) + ']');
    });
    newLines.forEach(function (l) { shipmentAppendByHeader_(lt.sheet, l); });
    skus.forEach(function (sku) {
      shipmentDomainAcquire_(dom, sheets, { warehouseId: wh, sku: sku, qty: need[sku], ownerId: sid, journal: journal,
        now: now, movementDate: shipmentToday_(), createdBy: actor, note: 'Consolidation ' + op + ' / plan ' + pid });
    });
    sc13Link_(ss, sid, pid, actor, now);
    var all = prepared.before.lines.concat(newLines);
    function total(k) { return all.some(function (l) { return l[k] === '' || l[k] == null || !isFinite(Number(l[k])); }) ? '' : all.reduce(function (n, l) { return n + Number(l[k]); }, 0); }
    var fields = { shipment_total_qty: total('shipment_qty'), shipment_total_cartons: total('shipment_carton_qty'),
      shipment_total_cbm: total('shipment_carton_cbm'), shipment_total_gross_weight: total('gross_weight'), shipment_total_net_weight: total('net_weight'),
      rate_card_id: '', rate_card_version: '', estimated_freight_cost: '', estimated_duty: '', estimated_duty_currency: '', estimated_customs_fee: '', estimated_total_cost: '', estimated_unit_cost: '',
      updated_by: actor, updated_at: editNextStamp_(now, [ship.updated_at]) };
    if (prepared.shipTable.headers.indexOf('estimated_duty_currency') < 0) delete fields.estimated_duty_currency;
    Object.keys(fields).forEach(function (k) { sc13Set_(prepared.shipTable, ship, k, fields[k]); });
    sc13Set_(prepared.planTable, p, 'transferred_shipment_id', sid);
    sc13Set_(prepared.planTable, p, 'transferred_to_shipment_at', now);
    sc13Set_(prepared.planTable, p, 'updated_at', editNextStamp_(now, [p.updated_at]));
    SpreadsheetApp.flush();
    var fresh = sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', sid);
    fresh.note = note; var proof = sc13Verify_(ss, fresh);
    var after = shipmentDomainHeld_(dom, sheets, sid), bk = shipmentReservationBooks_(dom, sheets, wh, skus);
    if (bk.verdict !== 'RECONCILED' || skus.some(function (sku) { return Number(after[wh + '||' + sku] || 0) !== need[sku] || proof.need[sku] !== need[sku]; })) sc13Fail_('CONSOLIDATION_READBACK_FAILED');
    sc13Set_(prepared.shipTable, ship, 'note', note + '\n[SC13_DONE:' + op + ':' + pid + ']');
    var done = sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', sid); sc13AssertReady_(done);
    return { created: true, consolidated: true, shipment_id: sid, shipment_no: ship.shipment_no, shipping_plan_id: pid, line_count: newLines.length, needs_repricing: true };
  } catch (e) {
    return { created: false, reason: 'CONSOLIDATION_OUTCOME_UNKNOWN', outcome: 'UNKNOWN', shipment_id: sid, shipping_plan_id: pid,
      operation_id: op, zero_write: !begun, error: String(e && e.message || e), retry_safe: false };
  }
}
function sc13TryLocked_(ss, pid, actor) {
  var policy = sc13Policy_(), ready = sc13Prepare_(ss, pid, policy);
  if (ready.result) return ready.result;
  if (!ready.handled) return null;
  return sc13MergeLocked_(ss, ready, actor);
}

// AD4 (Owner 2026-11-22): customs applies to cross-border legs only. NOT applicable only when the server PROVES, from the warehouses master and the
// saved plan / shipment row, a same-company transfer from an ACTIVE overseas 3PL to an ACTIVE real destination in the SAME physical country:
// 3PL -> platform warehouse (FBA type; never the logical platform rows) or the approved 3PL -> 3PL countries (22_ CSD_3PL_TRANSFER_COUNTRIES_).
// Factory sources, another country, an unknown / blank / planning-group country (EU), another company, inactive / unknown / duplicate warehouses
// keep customs applicable. Read-only; grants nothing else (no PO / stock / document rule depends on it).
function shipCustomsApplicability_(ss, row, opts) {
  var S = function (v) { return String(v == null ? '' : v).trim(); }, U = function (v) { return S(v).toUpperCase(); }, T = function (v) { return v === true || /^(true|yes|y|1)$/i.test(S(v)); };
  var yes = function (why) { return { applicable: true, reason: why }; };
  try {
    var co = S(row && row.company), src = S(row && row.source_warehouse_id), dst = S(row && row.destination_warehouse_id) || S(row && row.warehouse_id);
    if (!co || !src) return yes('NOT_PROVEN_BLANK_IDENTITY'); if (src === dst) return yes('SOURCE_EQUALS_DESTINATION');
    var sh = ss.getSheetByName('warehouses'); if (!sh) return yes('WAREHOUSE_MASTER_UNREADABLE');
    var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return S(x); }), rows = [];
    for (var r = 1; r < d.length; r++) { var o = {}; for (var c = 0; c < h.length; c++) o[h[c]] = d[r][c]; if (S(o.warehouse_id) === src || S(o.warehouse_id) === dst) rows.push(o); }
    var one = function (id) { var m = rows.filter(function (w) { return S(w.warehouse_id) === id; }); return m.length === 1 ? m[0] : null; }, s = one(src), t = dst ? one(dst) : null;
    // Planning can prove a domestic Amazon lane before an FC is selected. Dispatch still requires the actual warehouse.
    if (!dst && opts && opts.allow_planned_destination === true && s && S(row.destination_type).toLowerCase() === 'marketplace' && S(row.destination).toLowerCase() === 'amazon' && S(row.marketplace).toLowerCase() === 'amazon') {
      var msh = ss.getSheetByName('marketplaces'), md = msh && msh.getDataRange().getValues(), mh = md && md[0], matches = [];
      var physical = function (v) { return typeof KMCID !== 'undefined' && typeof KMCID.canonicalCountryCode === 'function' ? KMCID.canonicalCountryCode(U(v)) : U(v); };
      for (var mi = 1; md && mi < md.length; mi++) { var mo = {}; mh.forEach(function (k, j) { mo[S(k)] = md[mi][j]; }); if (S(mo.company) === co && physical(mo.country) === physical(s.country) && S(mo.marketplace).toLowerCase() === 'amazon') matches.push(mo); }
      if (matches.length === 1 && !/^(inactive|disabled)$/i.test(S(matches[0].status)) && !/^(false|0|no)$/i.test(S(matches[0].is_active))) t = { company: co, country: s.country, warehouse_type: 'FBA', marketplace: 'Amazon', is_active: true, __planned: true };
    }
    if (!dst && !t) return yes('NOT_PROVEN_BLANK_IDENTITY');
    if (!s || !t) return yes('WAREHOUSE_NOT_UNIQUE_IN_MASTER');
    var act = function (w) { if (Object.prototype.hasOwnProperty.call(w, 'is_active')) return T(w.is_active); if (Object.prototype.hasOwnProperty.call(w, 'status')) return S(w.status).toLowerCase() === 'active'; return false; };
    if (!act(s) || !act(t)) return yes('WAREHOUSE_INACTIVE');
    if (T(s.is_factory_warehouse) || U(s.warehouse_type) !== '3PL') return yes('SOURCE_NOT_OVERSEAS_3PL');
    if (S(s.company) !== co || S(t.company) !== co) return yes('COMPANY_MISMATCH');
    var cs = U(s.country), ct = U(t.country);
    if (!/^[A-Z]{2}$/.test(cs) || cs !== ct) return yes('NOT_SAME_COUNTRY');
    if (typeof KMCID === 'undefined' || !KMCID || typeof KMCID.planningSetMembers !== 'function' || typeof KMCID.canonicalCountryCode !== 'function') return yes('COUNTRY_AUTHORITY_UNAVAILABLE_OR_GROUP');
    if (cs === 'EU' || KMCID.planningSetMembers(cs)) return yes('PLANNING_GROUP_NOT_A_COUNTRY');
    cs = KMCID.canonicalCountryCode(cs); ct = KMCID.canonicalCountryCode(ct);
    // Only the physical markets supported by this release; unknown codes never waive a requirement.
    if (['US', 'CA', 'GB', 'DE', 'AU', 'JP', 'FR', 'ES', 'IT'].indexOf(cs) < 0) return yes('PHYSICAL_COUNTRY_NOT_SUPPORTED');
    var scope = U(row.country);
    if (!scope || (KMCID.canonicalCountryCode(scope) !== ct && !(KMCID.planningSetMembers(scope) || []).some(function (x) { return KMCID.canonicalCountryCode(x) === ct; }))) return yes('SAVED_COUNTRY_MISMATCH');
    var tt = U(t.warehouse_type);
    if (T(t.is_factory_warehouse)) return yes('DESTINATION_IS_FACTORY');
    if (tt === 'FBA') {
      if (!t.__planned && (typeof csdLogicalPlatformWarehouse_ !== 'function' || csdLogicalPlatformWarehouse_(dst))) return yes('DESTINATION_LOGICAL_OR_UNVERIFIED');
      if (S(t.marketplace) && (typeof csdPlatformFamily_ !== 'function' || csdPlatformFamily_(t.marketplace) !== csdPlatformFamily_(row.marketplace))) return yes('DESTINATION_PLATFORM_MISMATCH');
    }
    else if (tt === '3PL') { if (typeof CSD_3PL_TRANSFER_COUNTRIES_ === 'undefined' || !CSD_3PL_TRANSFER_COUNTRIES_ || CSD_3PL_TRANSFER_COUNTRIES_[cs] !== 1) return yes('TRANSFER_COUNTRY_NOT_ENABLED'); }
    else return yes('DESTINATION_TYPE_NOT_ELIGIBLE');
    return { applicable: false, reason: 'DOMESTIC_OVERSEAS_TRANSFER', country: cs, source_warehouse_id: src, destination_warehouse_id: dst, destination_type: tt };
  } catch (e) { return yes('NOT_PROVEN_ERROR'); }
}
function sc13PlanLaneOptions_(ss, plan) {
  var cxa4 = shipCustomsApplicability_(ss, plan, { allow_planned_destination: true });
  var warehouses = sc13Read_(ss, 'warehouses', ['warehouse_id', 'country', 'warehouse_name']).rows;
  var options = warehouses.filter(function (w) {
    return sc13Str_(w.country).toUpperCase() === sc13Str_(plan.country).toUpperCase() &&
      sc13Str_(w.warehouse_id) !== sc13Str_(plan.source_warehouse_id) &&
      !/^(false|0|no|inactive)$/i.test(sc13Str_(w.is_active)) && !/^(inactive|disabled)$/i.test(sc13Str_(w.status));
  }).map(function (w) { return { id: sc13Str_(w.warehouse_id), label: sc13Str_(w.warehouse_name) || sc13Str_(w.warehouse_code) }; });
  var customs = {}, cards = sc13Read_(ss, 'carrier_rate_cards', ['customs_type']).rows;
  cards.forEach(function (r) { var code = sc13Str_(r.customs_type); if (code && !customs[code]) customs[code] = sc13Str_(r.customs_type_label) || code; });
  return { destination_warehouse_id: sc13Str_(plan.destination_warehouse_id), customs_type: sc13Str_(plan.customs_type), destinations: options,
    customs_applicable: cxa4.applicable !== false, customs_basis: cxa4.applicable === false ? { reason: cxa4.reason, country: cxa4.country, destination_type: cxa4.destination_type } : null,   // AD4
    customs: cxa4.applicable === false ? [] : Object.keys(customs).sort().map(function (k) { return { id: k, label: customs[k] }; }) };
}
function sc13SavePlanLane_(body) {
  var allowed = ['action', 'shipping_plan_id', 'save_lane', 'destination_warehouse_id', 'customs_type', 'expected_updated_at', 'actor'];
  if (Object.keys(body).some(function (k) { return allowed.indexOf(k) < 0; }) || !sc13Str_(body.shipping_plan_id) || !sc13Str_(body.expected_updated_at) || !sc13Str_(body.actor)) return spRcNo_('PLAN_LANE_INPUT_REQUIRED');
  var lock = LockService.getScriptLock(); if (!lock.tryLock(30000)) return spRcNo_('LOCK_UNAVAILABLE');
  var attempted = false;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), table = sc13Read_(ss, 'shipping_plans', ['shipping_plan_id', 'status', 'updated_at', 'carrier_rate_type']);
    var p = sc13One_(table.rows, 'shipping_plan_id', body.shipping_plan_id);
    if (sc13Str_(p.status) !== 'draft') return spRcNo_('SHIPPING_PLAN_NOT_EDITABLE');
    if (editTokSame_(p.updated_at, body.expected_updated_at) !== 'SAME') return spRcNo_('EDIT_CONFLICT');
    if (sc13Str_(p.carrier_rate_type).indexOf(SP_RC_PENDING_1G_) === 0) return spRcNo_('PLAN_LANE_PREVIOUS_WRITE_UNKNOWN');
    var choices = sc13PlanLaneOptions_(ss, p);
    var d = choices.destinations.filter(function (o) { return o.id === sc13Str_(body.destination_warehouse_id); });
    if (d.length !== 1) return spRcNo_('PLAN_LANE_NOT_VALID');
    // Re-evaluate the chosen destination, not the old saved lane.
    var proposed = Object.assign({}, p, { destination_warehouse_id: d[0].id });
    var customsCheck = spRcWk1Customs_(ss, proposed, { customs_type: body.customs_type });
    if (!customsCheck.ok) return spRcNo_(customsCheck.code);
    var w = { destination_warehouse_id: d[0].id, destination_type: 'warehouse', destination: d[0].label, customs_type: customsCheck.asked ? customsCheck.customs_type : sc13Str_(p.customs_type),
      carrier_unit_rate: '', estimated_freight_cost: '', estimated_duty: '', estimated_duty_currency: '', estimated_customs_fee: '', estimated_total_cost: '',
      updated_by: sc13Str_(body.actor), updated_at: editNextStamp_(shipmentTimestamp_(), [p.updated_at]) };
    if (table.headers.indexOf('rate_card_id') >= 0) w.rate_card_id = '';
    if (table.headers.indexOf('estimated_unit_cost') >= 0) w.estimated_unit_cost = '';
    if (Object.keys(w).some(function (k) { return table.headers.indexOf(k) < 0; })) return spRcNo_('PLAN_LANE_COLUMNS_MISSING');
    attempted = true; sc13Set_(table, p, 'carrier_rate_type', SP_RC_PENDING_1G_ + 'LANE');
    Object.keys(w).forEach(function (k) { sc13Set_(table, p, k, w[k]); });
    SpreadsheetApp.flush(); var back = sc13One_(sc13Read_(ss, 'shipping_plans', []).rows, 'shipping_plan_id', p.shipping_plan_id);
    if (Object.keys(w).some(function (k) { return shipRcCanon_(back[k]) !== shipRcCanon_(w[k]); })) sc13Fail_('PLAN_LANE_READBACK_FAILED');
    sc13Set_(table, p, 'carrier_rate_type', '');
    return jsonResponse_({ success: true, verified: true, needs_repricing: true, updated_at: editTokWritten15f2_(w.updated_at) });   // R15F2: as a read would return it
  } catch (e) { return jsonResponse_({ success: false, zero_write: !attempted, outcome: attempted ? 'UNKNOWN' : 'REFUSED', code: String(e.message || e) }); }
  finally { lock.releaseLock(); }
}

// AGL02-12 (sbx-r15c-agl): patched
// AGL02-12: the estimate THIS shipment would get from card c, exactly as handleShipmentSelectRateCard_ computes it (same function, same raw totals,
// same destination). Read-only. priced only when the server determined a total; an undetermined total is never shown as 0.
function shRcOptionQuote15c_(ss, v, c, ln, day) {
  try {
    var id = String(c.rate_card_id || '').trim(), d = shipRateDestination_(ss, v);
    day = shippingTaxDay_(ss, v.etd || v.actual_departure_date || v.created_at) || day;
    var q = shipmentExactRateAndCost_(ss, { planRateCardId: id, carrierId: String(c.carrier_id || '').trim(), country: shipRateCountry15e_(ss, v), marketplace: v.marketplace,   // R15G-EU: the real destination country, as Select
      shippingMethod: String(c.shipping_method || '').trim(), lastMile: String(c.last_mile_delivery || '').trim(), importDutyTreatment: String(v.import_duty_treatment || '').trim(),
      destinationWarehouseCode: d.code, destinationCity: d.city, destinationPostalCode: d.postal, quoteDate: day,
      grossWeightKg: v.shipment_total_gross_weight, cbm: v.shipment_total_cbm, cartons: v.shipment_total_cartons, totalQty: shipmentNum_(v.shipment_total_qty), lines: ln });
    var priced = q.rateCardId === id && shippingQuoteComplete_(q);
    return { priced: priced, currency: q.currency || String(c.currency || '').trim(), freight: priced ? q.estimatedFreightCost : '', duty: priced ? q.estimatedDuty : '', customs_fee: priced ? q.estimatedCustomsFee : '',
      duty_currency: q.estimatedDutyCurrency || '', split_currency: !!q.splitCurrency, tax_reason: q.taxReason || '', tax: q.taxQuote, total: priced ? q.estimatedTotalCost : '', cost_unknown: q.costUnknown || '', basis: { cbm: v.shipment_total_cbm, gross_weight: v.shipment_total_gross_weight, cartons: v.shipment_total_cartons } };
  } catch (e) { return { priced: false, total: '', error: 'QUOTE_UNAVAILABLE' }; }
}
// AGL02-12: a stored cell (a Date, or text) as a yyyy-MM-dd day in the spreadsheet time zone; a request value must already be yyyy-MM-dd and a real day.
function shipDay15c_(v, fromRequest) {
  if (v === null || v === undefined || String(v).trim() === '') return { blank: true };
  if (!fromRequest && Object.prototype.toString.call(v) === '[object Date]') { if (isNaN(v.getTime())) return { bad: true }; var tz = ''; try { tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone(); } catch (e) {} return { day: Utilities.formatDate(v, tz || Session.getScriptTimeZone(), 'yyyy-MM-dd') }; }
  var s = String(v).trim(), m = fromRequest ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (!m) return { bad: true };
  var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return { bad: true };
  return { day: m[1] + '-' + m[2] + '-' + m[3] };
}
function shipDatesCheck15c_(body, s, rowVals) {
  var cur = function (k) { var c = s.col(k); return c === -1 ? '' : rowVals[c]; }, changed = {}, eff = {};
  ['etd', 'eta'].forEach(function (k) {
    var stored = shipDay15c_(cur(k), false);
    if (body && Object.prototype.hasOwnProperty.call(body, k)) { var asked = shipDay15c_(body[k], true); eff[k] = asked; changed[k] = (asked.day || '') !== (stored.day || '') || !!asked.bad; }
    else eff[k] = stored;
  });
  if (!changed.etd && !changed.eta) return null;
  if (changed.eta && eff.eta.bad) return { code: 'ETA_INVALID', field: 'eta', error: 'ETA must be a real calendar date (YYYY-MM-DD). Nothing was written.' };
  if (changed.etd && eff.etd.bad) return { code: 'ETD_INVALID', field: 'etd', error: 'ETD must be a real calendar date (YYYY-MM-DD). Nothing was written.' };
  if (eff.eta.day && eff.etd.day && eff.eta.day < eff.etd.day) return { code: 'SHIPMENT_DATES_CONTRADICT', field: 'eta', etd: eff.etd.day, eta: eff.eta.day, error: 'ETA ' + eff.eta.day + ' is before ETD ' + eff.etd.day + '. Nothing was written.' };
  return null;
}

// AGL-CBM-12 (sbx-r15c-agl): patched
// AGL-CBM-12: a blank / non-numeric value is UNKNOWN, never 0 (the same rule as 17_ shippingMeasureKnown_ in sbx-r15c-agl2; kept local so 12_ stands alone).
function shipMeasureKnown15c_(v) { if (v === '' || v == null) return false; var n = parseFloat(v); return !isNaN(n) && isFinite(n); }
// R15F2-12 (sbx-r15f2 step 21): patched
// R15F2 (B2): the instants whose wall clock in zone tz is exactly w - none in a DST gap, two in a repeated hour (steps of 30 min, 1 h and 2 h checked).
function editWallSecs15f2_(w, tz) {
  var out = [], d = null; try { d = Utilities.parseDate(w, tz, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { d = null; }
  if (!d || isNaN(d.getTime())) return out; var b = Math.floor(d.getTime() / 1000);
  [0, -1800, 1800, -3600, 3600, -7200, 7200].forEach(function (k) { var s = b + k; if (out.indexOf(s) >= 0) return; try { if (Utilities.formatDate(new Date(s * 1000), tz, 'yyyy-MM-dd HH:mm:ss') === w) out.push(s); } catch (e2) {} });
  return out; }
// R15F2 (B2): ONE instant for a version value, or not ok (then the two sides are never SAME).
function editOneSec15f2_(v) {
  if (v !== null && v !== undefined && (Object.prototype.toString.call(v) === '[object Date]' || (typeof v === 'object' && typeof v.getTime === 'function'))) { var t0 = v.getTime(); return isNaN(t0) ? { ok: false, why: 'INVALID_DATE' } : { ok: true, sec: Math.floor(t0 / 1000) }; }
  var s = String(v == null ? '' : v).trim(), m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(s);
  if (m) { var tz = ''; try { tz = String(Session.getScriptTimeZone() || ''); } catch (e) { tz = ''; } if (!tz) return { ok: false, why: 'NO_SCRIPT_ZONE' };
    var c = editWallSecs15f2_(m[1] + ' ' + m[2] + ':' + m[3] + ':' + m[4], tz); return c.length === 1 ? { ok: true, sec: c[0] } : { ok: false, why: c.length ? 'WALL_CLOCK_REPEATED' : 'WALL_CLOCK_NOT_IN_ZONE' }; }
  var e3 = editEpochs_(v); return (e3.ok && e3.secs.length === 1) ? { ok: true, sec: e3.secs[0] } : { ok: false, why: 'NOT_ONE_INSTANT' }; }
var SHIP_EDIT_TOKEN_NOT_ONE_ = '';   // R15F2: why the last comparison could not name one instant (diagnostic only; the result is DIFF = refused)
function editTokOne15f2_(cell, tok) {
  var a = editOneSec15f2_(cell), b = editOneSec15f2_(tok);
  if (!a.ok || !b.ok) { if ((a.why === 'WALL_CLOCK_REPEATED' || b.why === 'WALL_CLOCK_REPEATED') && editSameWallSameZone15f2_(cell, tok)) return 'SAME';   /* R15F2 step 25 */ SHIP_EDIT_TOKEN_NOT_ONE_ = 'row ' + (a.ok ? 'ok' : a.why) + ' / token ' + (b.ok ? 'ok' : b.why); return 'DIFF'; }
  return a.sec === b.sec ? 'SAME' : 'DIFF'; }
// R15F2 (B2): the token a WRITE response returns for a written wall string w - the instant Sheets stores (w read in the SHEET zone) shown in the
// script frame, exactly what a fresh read returns. Same zones: w itself. Zones unreadable, or not ONE instant in the sheet zone (DST gap / repeated hour): '' = NO new token (the page keeps its
// earlier token, so its next write is refused as a conflict and re-reads). tz probe run 2: returning w there let 57 stale copies match - fixed.
function editTokWritten15f2_(w) {
  var s = String(w == null ? '' : w).trim(); if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return editTok_(w);
  var st = '', sh = ''; try { st = String(Session.getScriptTimeZone() || ''); sh = String(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || ''); } catch (e) { return ''; }
  if (!st || !sh || st === sh) return s; var c = editWallSecs15f2_(s, sh); return c.length === 1 ? Utilities.formatDate(new Date(c[0] * 1000), st, 'yyyy-MM-dd HH:mm:ss') : ''; }
// R15F2-P1-12 (sbx-r15f2 step 25): patched
// R15F2 step 25 (DST): a REPEATED-hour wall clock, script zone == sheet zone: the wall string IS the version (editNextStamp_ keeps it strictly
// increasing per row), so the cell's wall string equal to the token's is SAME. Any other case: false (the caller then refuses).
function editSameWallSameZone15f2_(cell, tok) {
  var st = '', sh = ''; try { st = String(Session.getScriptTimeZone() || ''); sh = String(SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone() || ''); } catch (e) { return false; }
  if (!st || st !== sh) return false;
  var w = function (v) { if (v !== null && v !== undefined && typeof v === 'object' && typeof v.getTime === 'function') return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, st, 'yyyy-MM-dd HH:mm:ss'); var s = String(v == null ? '' : v).trim().replace('T', ' '); return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s) ? s : ''; };
  var a = w(cell), b = w(tok); return !!a && a === b; }
// R15F2 step 25 (P1): the version gate of a MODIFY of an existing row - null = go on (the editTokSame_ check that follows decides), else the refusal.
function editP1Gate15f2_(cell, tok) {
  var t = String(tok == null ? '' : tok).trim(), rowVer = (cell === undefined) ? { ok: false, why: 'NO_COLUMN' } : editEpochs_(cell), cur = (cell === undefined) ? '' : editTok_(cell); if (cell === undefined) return { code: 'EDIT_VERSION_COLUMN_MISSING', stage: 'edit_conflict', error: 'Not saved: this sheet has no updated_at column, so no change can be checked against later changes. Nothing was written. Ask the Owner to check the sheet.', data: { current_updated_at: '' } };   // R15F2 step 29 (P1-1): refuse, never backfill
  if (t === '') return rowVer.ok ? { code: 'EDIT_TOKEN_REQUIRED', stage: 'edit_conflict', error: 'Not saved: this change carried no version of the row, so it cannot be checked against later changes. Nothing was written. Reload, then make your change again.', data: { current_updated_at: cur } } : null;
  if (!editEpochs_(t).ok) return { code: 'EDIT_TOKEN_UNREADABLE', stage: 'edit_conflict', error: 'Not saved: the version this change carried cannot be read. Nothing was written. Reload, then make your change again.', data: { current_updated_at: cur } };
  if (!rowVer.ok) return { code: 'EDIT_CONFLICT', stage: 'edit_conflict', error: 'EDIT_CONFLICT: the row has no readable version now, but this change carried one. Nothing was written. Reload, then make your change again.', data: { current_updated_at: cur } };
  return null; }
// R15F2-P1B-12 (sbx-r15f2 step 29): patched
// R15F2-STAMPS (sbx-r15f2 step 23): patched

// R15C-EU-12 (sbx-r15c-eu): patched
// R15C-EU: is `country` a member of the planning set `setCode` (KMCID.planningSetMembers - the ONE server definition, from the 90_ bundle)?
function shipSetMember15e_(setCode, country) { try { var m = (typeof KMCID !== 'undefined' && KMCID && typeof KMCID.planningSetMembers === 'function') ? KMCID.planningSetMembers(setCode) : null; return !!(m && m.indexOf(String(country || '').trim().toUpperCase()) !== -1); } catch (e) { return false; } }
// R15C-EU: the country a shipment is priced / carded / timed by: its destination warehouse's authoritative country when it has one, else its own.
function shipRateCountry15e_(ss, v) { var d = shipRateDestination_(ss, v); return String((d && d.country) || v.country || '').trim(); }

// R15G-EU-12Q (sbx-r15g-eu): patched

// ===== XCO-R15G (12_): lineage v2, ended links, key lock, cancel of every linked Plan =====
var XCO_SIG_FIELDS_ = ['v', 'plan_id', 'plan_line_id', 'company', 'country', 'marketplace', 'site_sku', 'sku', 'qty', 'dest'];
function xcoSig_(o, sid) {
  var text = XCO_SIG_FIELDS_.map(function (k) { return String(o[k] == null ? '' : o[k]); }).concat([String(sid)]).join('\u001f');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length < 2 ? '0' + h : h; }).join('').slice(0, 16);
}
function xcoMarkerOf_(note) {
  var m = sc13Str_(note).match(/(?:^|\n)\[SC13_SOURCE:([^\]]+)\]/);
  if (!m) return null;
  try { var o = JSON.parse(decodeURIComponent(m[1])); return o && typeof o === 'object' ? o : { unreadable: true }; } catch (e) { return { unreadable: true }; }
}
function xcoSourceV2_(base, dest, ship) {
  var sid = sc13Str_(ship && ship.shipment_id);
  if (!sid) sc13Fail_('CONSOLIDATION_LINEAGE_SHIPMENT_UNKNOWN');
  var o = { v: 2, plan_id: base.plan_id, plan_line_id: base.plan_line_id, company: base.company, country: base.country, marketplace: base.marketplace,
    site_sku: base.site_sku, sku: base.sku, qty: base.qty, dest: sc13Str_(dest) };
  o.sig = xcoSig_(o, sid);
  return o;
}
function xcoSourceV2Check_(base, frozen, plan, ship) {
  var sid = sc13Str_(ship && ship.shipment_id);
  if (!sid) sc13Fail_('CONSOLIDATION_LINEAGE_SHIPMENT_UNKNOWN');
  if (typeof frozen.sig !== 'string' || frozen.sig !== xcoSig_(frozen, sid)) sc13Fail_('CONSOLIDATION_LINEAGE_TAMPERED');
  var want = xcoSourceV2_(base, plan.destination_warehouse_id, ship);
  if (JSON.stringify(want) !== JSON.stringify(frozen)) sc13Fail_('CONSOLIDATION_SOURCE_CHANGED');
  return want;
}
function xcoFactoryOrigin_(ss, plan) { return shipmentSourceDomain_(ss, sc13Str_(plan && plan.source_warehouse_id)) === SHIPMENT_DOMAIN_FACTORY_; }
// The ONE "removed line" predicate (O-1 note scheme). Every reader that must skip a removed line calls this (aeaa05c0 MINOR-6).
function sc13LineRemoved_(line) {   // XCO-R15G O-1: column OR note; an illegal status is refused, never active
  var marked = /(?:^|\n)\[SC13_REMOVED:/.test(sc13Str_(line && line.note));
  if (line && Object.prototype.hasOwnProperty.call(line, 'line_status')) { var st = sc13Str_(line.line_status); if (['', 'active', 'removed'].indexOf(st) < 0) sc13Fail_('LINE_STATUS_INVALID'); if (st === 'removed') return true; }
  return marked;
}
function xcoAssignedDest_(line, ship) {
  var a = sc13Str_(line && line.note).match(/\[SC13_ASSIGN:[^\]\r\n]*\]/g) || [];
  if (!a.length) return '';   // XCO-R15G B1-MAJOR-1: the LAST assignment record is the line's destination
  var d = ''; try { d = decodeURIComponent(a[a.length - 1].slice('[SC13_ASSIGN:'.length).split(':')[0]); } catch (e) { return ''; }
  var hd = sc13Str_(ship && ship.destination_warehouse_id);
  return d && d === hd ? d : '';
}
// The ONE strict lineage reader (receipt, incoming, import): a v2 marker that re-derives and re-signs, with a destination. Never the header.
function sc13SourceStrict_(ss, line, ship) {
  if (sc13LineRemoved_(line)) sc13Fail_('CONSOLIDATION_LINE_REMOVED');
  var mk = xcoMarkerOf_(line && line.note);
  if (!mk) sc13Fail_('CONSOLIDATION_LINEAGE_MISSING');
  if (mk.unreadable) sc13Fail_('CONSOLIDATION_LINEAGE_UNREADABLE');
  if (mk.v !== 2) sc13Fail_('CONSOLIDATION_LINEAGE_LEGACY');
  var src = sc13Source_(ss, line, ship), dest = xcoEffectiveDest_(src, line, ship);   // XCO-R15G B1-MAJOR-1
  if (!dest) sc13Fail_('CONSOLIDATION_LINEAGE_DEST_MISSING');
  return Object.assign({}, src, { dest: dest });
}
function sc13LinkEnded_(ship, pid, linkRow) {   // XCO-R15G H2: linkRow -> an UNLINKED marker ends only the link row it names
  if (linkRow && Object.prototype.hasOwnProperty.call(linkRow, 'link_status')) {   // XCO-R15G O-1: column OR note; illegal refused
    var lst = sc13Str_(linkRow.link_status); if (['', 'active', 'unlinked', 'cancelled'].indexOf(lst) < 0) sc13Fail_('LINK_STATUS_INVALID');
    if (lst === 'unlinked' || lst === 'cancelled' || sc13Str_(linkRow.ended_at)) return true;
  }
  if (!ship) return false;
  var n = sc13Str_(ship.note);
  return sc13Str_(ship.status).toLowerCase() === 'cancelled' || /(?:^|\n)\[SC13_CANCELLED:/.test(n) || n.indexOf('[SC13_UNLINKED:' + sc13Str_(pid) + ':' + (linkRow ? sc13Str_(linkRow.shipment_plan_link_id) + ':' : '')) >= 0;
}
function sc13ShipIndex_(ss) {
  var m = {};
  sc13Read_(ss, 'shipments', ['shipment_id']).rows.forEach(function (r) { var k = sc13Str_(r.shipment_id); if (k && !m[k]) m[k] = r; });
  return m;
}
// -> the number of LIVE plan links of a shipment (0 when the links table is absent); throws when the links cannot be proven
function xcoLinkCount_(ss, sid) {   // XCO-R15G B1-MAJOR-4: "ever merged", never only the live link count
  if (!ss.getSheetByName('shipment_plan_links')) return 0;
  var live = sc13LinkIds_(ss, sid).length, ever = {};
  sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_).rows.forEach(function (r) { if (sc13Str_(r.shipment_id) === sid) ever[sc13Str_(r.shipping_plan_id)] = 1; });
  var n = Math.max(live, Object.keys(ever).length);
  if (n >= 2) return n;
  var ships = sc13Read_(ss, 'shipments', ['shipment_id']).rows.filter(function (s) { return sc13Str_(s.shipment_id) === sid; }), hp = ships.length === 1 ? sc13Str_(ships[0].shipping_plan_id) : '';
  var foreign = sc13Read_(ss, 'shipment_lines', ['shipment_id', 'note']).rows.some(function (l) { if (sc13Str_(l.shipment_id) !== sid) return false; var mk = xcoMarkerOf_(l.note); return !!(mk && !mk.unreadable && sc13Str_(mk.plan_id) && sc13Str_(mk.plan_id) !== hp); });
  return foreign ? 2 : n;
}
// The consolidation-key fields of a shipment row, DERIVED from sc13Key_ (a field is a key field when changing it changes the key).
function sc13KeyFields_() {
  var probe = SHIPMENT_EDITABLE_FIELDS_.concat(['country']), base = {}, out = [];
  probe.forEach(function (k) { base[k] = 'x'; });
  var k0 = sc13Key_(base, false);
  probe.forEach(function (k) { var o = Object.assign({}, base); o[k] = 'y'; if (sc13Key_(o, false) !== k0 && out.indexOf(k) < 0) out.push(k); });
  return out;
}
function xcoKeyLock_(ss, sid, s, rowVals, body) {
  body = body || {};
  if (!ss.getSheetByName('shipment_plan_links')) return null;
  var ids;
  try { ids = sc13LinkIds_(ss, sid); }
  catch (e) { return { refuse: { code: 'CONSOLIDATION_LINK_UNREADABLE', shipment_id: sid, error: 'The plan links of this shipment could not be proven (' + String(e && e.message || e) + '). Nothing was written.' } }; }
  if (ids.length < 2 && xcoLinkCount_(ss, sid) < 2) return xcoSingleDestChange_(ss, sid, s, rowVals, body);   // XCO-R15G B1-MAJOR-1 (b)
  var cur = {}; s.headers.forEach(function (h, i) { if (h) cur[h] = rowVals[i]; });
  var keyF = sc13KeyFields_(), changes = [];
  Object.keys(body).forEach(function (k) {
    if (keyF.indexOf(k) < 0 && k !== 'warehouse_id') return;
    if (k === 'warehouse_id' && !sc13Str_(body[k])) return;   // N01 (A final2): a blank alias is not a destination change
    var against = k === 'warehouse_id' ? cur.destination_warehouse_id : cur[k];
    if (sc13Str_(body[k]) !== sc13Str_(against)) changes.push(k);
  });
  if (!changes.length) return null;
  var destOnly = changes.every(function (k) { return k === 'destination_warehouse_id' || k === 'warehouse_id'; });
  if (!sc13Str_(cur.destination_warehouse_id) && destOnly) {
    var a = xcoFirstAssign_(ss, sid, body);
    return a.refuse ? a : { assign: a };
  }
  return { refuse: { code: 'CONSOLIDATED_DRAFT_KEY_FIELD_LOCKED', shipment_id: sid, fields: changes, linked_plans: ids.length,
    error: 'This Shipment Draft carries ' + ids.length + ' Shipping Plans, so a field of its consolidation key (' + changes.join(', ') + ') cannot change. Nothing was written.' } };
}
function xcoFirstAssign_(ss, sid, body) {
  var own = function (k) { return Object.prototype.hasOwnProperty.call(body, k); };
  var d = sc13Str_(own('destination_warehouse_id') ? body.destination_warehouse_id : body.warehouse_id);
  function no(why) { return { refuse: { code: 'CONSOLIDATED_DRAFT_KEY_FIELD_LOCKED', shipment_id: sid, fields: ['destination_warehouse_id'], reason: why,
    error: 'The destination of this consolidated draft cannot be set this way (' + why + '). Only the FIRST assignment of one warehouse to the whole draft is allowed. Nothing was written.' } }; }
  if (!d) return no('ASSIGNMENT_BLANK');
  if (own('destination_warehouse_id') && own('warehouse_id') && sc13Str_(body.warehouse_id) !== d) return no('ASSIGNMENT_ALIAS_DIFFERS');
  var lines = sc13Read_(ss, 'shipment_lines', ['shipment_id', 'note']).rows.filter(function (l) { return sc13Str_(l.shipment_id) === sid && !sc13LineRemoved_(l); });
  if (!lines.length) return no('ASSIGNMENT_NO_LINES');
  if (lines.some(function (l) { var mk = xcoMarkerOf_(l.note); return !mk || mk.unreadable || mk.v !== 2 || sc13Str_(mk.dest) !== '' || /\[SC13_ASSIGN:/.test(sc13Str_(l.note)); })) return no('ASSIGNMENT_NOT_FIRST');
  var w = sc13Read_(ss, 'warehouses', ['warehouse_id']).rows.filter(function (r) { return sc13Str_(r.warehouse_id) === d; });
  if (w.length !== 1 || /^(false|0|no|inactive)$/i.test(sc13Str_(w[0].is_active))) return no('ASSIGNMENT_WAREHOUSE_INVALID');
  return { dest: d, op: 'SC13A-' + Utilities.getUuid(), lines: lines.length };
}
function xcoAssignWrite_(ss, sid, a, setCell) {
  var lt = sc13Read_(ss, 'shipment_lines', ['shipment_id', 'note']), at = shipmentTimestamp_();
  lt.rows.filter(function (l) { return sc13Str_(l.shipment_id) === sid && !sc13LineRemoved_(l); }).forEach(function (l) {
    sc13Set_(lt, l, 'note', sc13Str_(l.note) + '\n[SC13_ASSIGN:' + encodeURIComponent(a.dest) + ':' + a.op + ':' + at + ']');
  });
  if (!a.reassign) ['rate_card_id', 'rate_card_version', 'estimated_freight_cost', 'estimated_duty', 'estimated_customs_fee', 'estimated_total_cost', 'estimated_unit_cost'].forEach(function (k) { setCell(k, ''); });   // XCO-R15G B1-MAJOR-1: a never-merged draft's own edit keeps its pricing behaviour
}
function xcoCancelPrepare_(ss, sid, headerPlanId) {
  var out = { ids: [], others: [], rows: [], table: null };
  if (!ss.getSheetByName('shipment_plan_links')) return out;
  try {
    out.ids = sc13LinkIds_(ss, sid);
    out.links = xcoLinkRowsOf_(ss, sid);   // XCO-R15G O-1: the live link rows this cancel ends
    out.others = out.ids.filter(function (p) { return p !== sc13Str_(headerPlanId); });
    if (!out.others.length) return out;
    out.table = sc13Read_(ss, 'shipping_plans', ['shipping_plan_id', 'transferred_shipment_id', 'transferred_to_shipment_at', 'updated_at']);
    out.others.forEach(function (p) {
      var r = sc13One_(out.table.rows, 'shipping_plan_id', p);
      if (sc13Str_(r.transferred_shipment_id) !== sid) sc13Fail_('CONSOLIDATION_PLAN_TRANSFER_MISMATCH:' + p);
      out.rows.push(r);
    });
    return out;
  } catch (e) {
    return { refuse: { success: false, code: 'CONSOLIDATION_CANCEL_LINKS_UNPROVEN', zero_write: true, shipment_id: sid,
      data: { error: String(e && e.message || e), reservation_released: 0, movements_written: 0 },
      error: 'The Shipping Plans linked to this draft could not be proven (' + String(e && e.message || e) + '), so the cancel was not attempted. Nothing was written.' } };
  }
}
function xcoCancelApply_(cx, journal, now, setShip_, note) {
  if (!cx || !cx.ids.length) return;
  var t = cx.table;
  (cx.reviewReturned?[]:cx.rows).forEach(function (r) {
    ['transferred_shipment_id', 'transferred_to_shipment_at'].forEach(function (k) {
      var c = t.headers.indexOf(k);
      journal.push({ kind: 'cell', sheet: t.sheet, row: r.__row, col: c, prev: r[k], wrote: '' });
      t.sheet.getRange(r.__row, c + 1).setValue('');
    });
    var cu = t.headers.indexOf('updated_at'), st = editNextStamp_(now, [r.updated_at]);
    journal.push({ kind: 'cell', sheet: t.sheet, row: r.__row, col: cu, prev: r.updated_at, wrote: st, meta: true });
    t.sheet.getRange(r.__row, cu + 1).setValue(st);
  });
  if (cx.links && cx.links.rows.length) cx.links.rows.forEach(function (r) { [['link_status', 'cancelled'], ['ended_at', now]].forEach(function (kv) {   // XCO-R15G O-1
    var c = cx.links.table.headers.indexOf(kv[0]); if (c < 0) return;
    journal.push({ kind: 'cell', sheet: cx.links.table.sheet, row: r.__row, col: c, prev: r[kv[0]], wrote: kv[1], meta: kv[0] === 'ended_at' });
    cx.links.table.sheet.getRange(r.__row, c + 1).setValue(kv[1]); }); });
  setShip_('note', sc13Str_(note) + '\n[SC13_CANCELLED:SC13X-' + Utilities.getUuid() + ':' + cx.ids.join(',') + ']');
}
// XCO-R15G-12 (xco-r15g-impl): patched

// ===== XCO-R15G batch 2 (12_): shared destinations (A1), remove one Plan (H2) =====
var XCD_SHARED_DESTINATIONS_V1_ = [
  { shared_destination_id: 'XCD-US-AMZLGS-1', enabled: true, country: 'US', warehouse_type: '3PL',
    members: ['WH-RESUS-US-3PL-AMZLGS', 'WH-KM-US-3PL-AMZLGS'], confirmed: 'Owner 2026-11-06 item VI; O-3 approved 2026-11-09' },
  { shared_destination_id: 'XCD-US-WINIT-1', enabled: true, country: 'US', warehouse_type: '3PL',
    members: ['WH-RESUS-US-3PL-WINIT', 'WH-KM-US-3PL-WINIT'], confirmed: 'Owner 2026-11-09: the same physical receiving address (Owner knowledge; not verified live - xcdValidate_ guards at run time)' }
];
function xcdActive_(w) { var a = sc13Str_(w.is_active).toLowerCase(); if (a) return a === 'true' || a === '1' || a === 'yes'; return sc13Str_(w.status).toLowerCase() === 'active'; }
// -> { valid: { id: { members } }, issues: [{ id, issues }] } for the ENABLED entries only. A defect disables that entry.
function xcdValidate_(ss) {
  var entries = (XCD_SHARED_DESTINATIONS_V1_ || []).filter(function (e) { return e && e.enabled === true; });
  var wh = sc13Read_(ss, 'warehouses', ['warehouse_id']).rows, seen = {}, out = { valid: {}, issues: [] };
  entries.forEach(function (e) { var once = {}; (e.members || []).forEach(function (m) { m = sc13Str_(m); if (!m || once[m]) return; once[m] = 1; seen[m] = (seen[m] || 0) + 1; }); });
  entries.forEach(function (e) {
    var id = sc13Str_(e.shared_destination_id), bad = [], members = (e.members || []).map(sc13Str_), companies = {}, regions = {}, inEntry = {};
    if (!id) bad.push('ENTRY_ID_MISSING');
    if (members.length < 2) bad.push('ENTRY_NEEDS_TWO_MEMBERS');
    members.forEach(function (m) {
      if (!m) { bad.push('MEMBER_BLANK'); return; }
      if (inEntry[m]) { bad.push('MEMBER_DUPLICATED'); return; }
      inEntry[m] = 1;
      if (seen[m] > 1) bad.push('MEMBER_IN_TWO_ENTRIES');
      var rows = wh.filter(function (w) { return sc13Str_(w.warehouse_id) === m; });
      if (rows.length !== 1) { bad.push(rows.length ? 'MEMBER_DUPLICATED_ROW' : 'MEMBER_NOT_FOUND'); return; }
      var w = rows[0];
      if (!xcdActive_(w)) bad.push('MEMBER_INACTIVE');
      if (/^(true|1|yes)$/i.test(sc13Str_(w.is_factory_warehouse)) || sc13Str_(w.warehouse_type).toLowerCase() === 'factory') bad.push('MEMBER_IS_FACTORY');
      if (sc13Str_(w.country).toUpperCase() !== sc13Str_(e.country).toUpperCase()) bad.push('MEMBER_COUNTRY_MISMATCH');
      if (sc13Str_(w.warehouse_type).toUpperCase() !== sc13Str_(e.warehouse_type).toUpperCase()) bad.push('MEMBER_TYPE_MISMATCH');
      var co = sc13Str_(w.company); if (!co) bad.push('MEMBER_COMPANY_MISSING'); else if (companies[co]) bad.push('TWO_MEMBERS_SAME_COMPANY'); companies[co] = 1;
      regions[sc13Str_(w.logistics_region)] = 1;
    });
    if (Object.keys(regions).length > 1) bad.push('MEMBER_REGION_MISMATCH');
    if (bad.length) out.issues.push({ id: id, issues: bad }); else out.valid[id] = { members: members };
  });
  return out;
}
function xcdDestIdentity_(wid, v) {
  var w = sc13Str_(wid); if (!w || !v) return w;
  var ids = Object.keys(v.valid).filter(function (id) { return v.valid[id].members.indexOf(w) >= 0; });
  return ids.length === 1 ? 'XCD:' + ids[0] : w;
}
// The merge-target key: sc13Key_ itself, with ONLY the destination replaced by its shared identity in CROSS_COMPANY mode.
function xcdMergeKey_(x, plan, policy, v) {
  if (!policy || policy.mode !== 'CROSS_COMPANY' || !v) return sc13Key_(x, plan);
  var d = sc13Str_(x.destination_warehouse_id), id = xcdDestIdentity_(d, v);
  if (id === d) return sc13Key_(x, plan);
  var y = {}; Object.keys(x).forEach(function (k) { y[k] = x[k]; }); y.destination_warehouse_id = id;
  return sc13Key_(y, plan);
}
function sc13RowRemoved_(ls, row) { if (!ls || typeof ls.col !== 'function') return false; var o = {}, c = ls.col('note'), s = ls.col('line_status'); if (c !== -1) o.note = row[c]; if (s !== -1) o.line_status = row[s]; return sc13LineRemoved_(o); }   // XCO-R15G O-1
function handleShipmentRemovePlanFromConsolidated_(body) {
  body = body || {};
  var sid = sc13Str_(body.shipment_id), pid = sc13Str_(body.shipping_plan_id), actor = sc13Str_(body.actor || body.updated_by) || 'system_user';
  if (!sid || !pid || !sc13Str_(body.expected_updated_at)) return jsonResponse_({ success: false, zero_write: true, code: 'REMOVE_PLAN_INPUT_REQUIRED', error: 'shipment_id, shipping_plan_id and expected_updated_at are required. Nothing was written.' });
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return jsonResponse_({ success: false, zero_write: true, code: 'LOCK_UNAVAILABLE', error: 'Another change is in progress. Nothing was written.' });
  try { return jsonResponse_(xcoRemovePlanLocked_(SpreadsheetApp.getActiveSpreadsheet(), sid, pid, actor, body)); }
  catch (e) { return jsonResponse_({ success: false, zero_write: true, outcome: 'REFUSED', code: String(e && e.message || e), error: 'Refused before any write (' + String(e && e.message || e) + '). Nothing was written.' }); }
  finally { try { lock.releaseLock(); } catch (eR) {} }
}
function xcoRemoveNo_(code, more) { var o = { success: false, zero_write: true, outcome: 'REFUSED', code: code, error: code + '. Nothing was written.' }; Object.keys(more || {}).forEach(function (k) { o[k] = more[k]; }); return o; }
function xcoRemovePlanLocked_(ss, sid, pid, actor, body) {
  var st = sc13Read_(ss, 'shipments', ['shipment_id', 'shipping_plan_id', 'status', 'note', 'updated_at', 'source_warehouse_id']);
  var ship = sc13One_(st.rows, 'shipment_id', sid), note = sc13Str_(ship.note);
  if (note.indexOf('[SC13_UNLINKED:' + pid + ':') >= 0 && !sc13Pending_(ship) && sc13LinkIds_(ss, sid).indexOf(pid) < 0) return { success: true, outcome: 'REUSED', zero_write: true, shipment_id: sid, shipping_plan_id: pid };
  sc13AssertReady_(ship);
  var tok = editTokSame_(ship.updated_at, body.expected_updated_at);
  if (tok === 'DIFF' || (tok !== 'SAME' && sc13Str_(ship.updated_at) !== sc13Str_(body.expected_updated_at))) return xcoRemoveNo_('EDIT_CONFLICT', { shipment_id: sid, current_updated_at: sc13Str_(ship.updated_at) });
  if (['draft', 'ready_to_ship'].indexOf(sc13Str_(ship.status).toLowerCase()) < 0) return xcoRemoveNo_('REMOVE_PLAN_STATUS_NOT_ALLOWED', { status: sc13Str_(ship.status) });
  if (csdCountRowsFor_(ss, 'shipment_routes', 'shipment_id', sid) || csdEventExists_(ss, sid) || csdMovementExists_(ss, sid)) return xcoRemoveNo_('REMOVE_PLAN_DISPATCH_EVIDENCE');
  var ids = sc13LinkIds_(ss, sid);
  if (ids.indexOf(pid) < 0) return xcoRemoveNo_('REMOVE_PLAN_NOT_LINKED');
  if (ids.length < 2) return xcoRemoveNo_('REMOVE_PLAN_NOT_CONSOLIDATED');
  if (pid === sc13Str_(ship.shipping_plan_id)) return xcoRemoveNo_('REMOVE_PLAN_IS_HEADER_PLAN', { correction: 'cancel the whole draft instead (cancelShipmentDraft)' });
  var lrows = sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_).rows.filter(function (k) { return sc13Str_(k.shipment_id) === sid && sc13Str_(k.shipping_plan_id) === pid && !sc13LinkEnded_(ship, pid, k); });
  if (lrows.length !== 1) return xcoRemoveNo_('REMOVE_PLAN_LINK_NOT_UNIQUE');
  var linkId = sc13Str_(lrows[0].shipment_plan_link_id);
  var proof = sc13Verify_(ss, ship);
  var lt =sc13Read_(ss, 'shipment_lines', ['shipment_line_id', 'shipment_id', 'shipping_plan_line_id', 'shipment_qty', 'sku', 'note']);
  var mine = lt.rows.filter(function (l) { return sc13Str_(l.shipment_id) === sid && !sc13LineRemoved_(l) && sc13Source_(ss, l, ship).plan_id === pid; });
  if (!mine.length) return xcoRemoveNo_('REMOVE_PLAN_HAS_NO_LINES');
  var al = ss.getSheetByName('shipment_line_allocations');
  if (al) { var mineIds = {}; mine.forEach(function (l) { mineIds[sc13Str_(l.shipment_line_id)] = 1; });
    var live = sc13Read_(ss, 'shipment_line_allocations', ['shipment_line_id', 'allocation_status']).rows.filter(function (a) { return mineIds[sc13Str_(a.shipment_line_id)] && ['cancelled', 'released', 'void', 'voided'].indexOf(sc13Str_(a.allocation_status).toLowerCase()) < 0; });
    if (live.length) return xcoRemoveNo_('REMOVE_PLAN_ALLOCATION_PRESENT', { allocations: live.length }); }
  var wh = sc13Str_(ship.source_warehouse_id), dom = shipmentSourceDomain_(ss, wh), overseas = dom === SHIPMENT_DOMAIN_OVERSEAS_;
  var sheets = { domain: dom, stockSheet: ss.getSheetByName(overseas ? 'overseas_inventory_snapshot' : 'factory_stock'), movSheet: ss.getSheetByName(overseas ? 'overseas_inventory_movements' : 'factory_stock_movements') };
  if (!sheets.stockSheet || !sheets.movSheet) return xcoRemoveNo_('REMOVE_PLAN_RESERVATION_TABLE_MISSING');
  var books = shipmentCancelBooks_(ss, sid, wh);
  if (books.verdict !== 'RECONCILED') return xcoRemoveNo_(books.verdict, { keys_mismatched: books.mismatched, keys_unknown: books.unknown });
  var held = shipmentDomainHeld_(dom, sheets, sid), drop = {}, keep = {};
  Object.keys(proof.need).forEach(function (sku) { if (Number(held[wh + '||' + sku] || 0) !== proof.need[sku]) sc13Fail_('REMOVE_PLAN_RESERVATION_MISMATCH'); keep[sku] = proof.need[sku]; });
  Object.keys(held).forEach(function (k) { if (Number(held[k]) > 0 && (k.indexOf(wh + '||') !== 0 || !proof.need[k.slice((wh + '||').length)])) sc13Fail_('REMOVE_PLAN_FOREIGN_HOLD'); });
  mine.forEach(function (l) { var sku = sc13Str_(l.sku), q = Number(l.shipment_qty); drop[sku] = (drop[sku] || 0) + q; keep[sku] = (keep[sku] || 0) - q; });
  var pt = sc13Read_(ss, 'shipping_plans', ['shipping_plan_id', 'transferred_shipment_id', 'transferred_to_shipment_at', 'updated_at']), p = sc13One_(pt.rows, 'shipping_plan_id', pid);
  if (sc13Str_(p.transferred_shipment_id) !== sid) return xcoRemoveNo_('CONSOLIDATION_PLAN_TRANSFER_MISMATCH');
  var op = 'SC13R-' + Utilities.getUuid(), now = shipmentTimestamp_(), journal = [];
  try { sc13Set_(st, ship, 'note', note + '\n[SC13_PENDING:remove-' + op + ']'); }
  catch (markerError) {
    var unchanged = false; try { unchanged = sc13Str_(sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', sid).note) === note; } catch (eR) {}
    return { success: false, outcome: unchanged ? 'REFUSED' : 'UNKNOWN', zero_write: unchanged, retry_safe: unchanged, code: unchanged ? 'REMOVE_PLAN_MARKER_NOT_WRITTEN' : 'CONSOLIDATION_OUTCOME_UNKNOWN', operation_id: op };
  }
  try {
    var released = 0;
    Object.keys(drop).sort().forEach(function (sku) {
      var r = shipmentDomainRelease_(dom, sheets, { warehouseId: wh, sku: sku, qty: drop[sku], ownerId: sid, journal: journal, now: now, movementDate: shipmentToday_(), createdBy: actor, releaseReason: 'consolidation_plan_removed:' + pid });
      if (!r || !r.applied || Number(r.released) !== drop[sku]) sc13Fail_('REMOVE_PLAN_RELEASE_NOT_APPLIED:' + sku);
      released += Number(r.released);
    });
    mine.forEach(function (l) { sc13Set_(lt, l, 'note', sc13Str_(l.note) + '\n[SC13_REMOVED:' + op + ':' + now + ']'); });
    if (lt.headers.indexOf('line_status') >= 0) mine.forEach(function (l) { sc13Set_(lt, l, 'line_status', 'removed'); });   // XCO-R15G O-1
    var lkT = sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_), lkR = sc13One_(lkT.rows, 'shipment_plan_link_id', linkId);
    if (lkT.headers.indexOf('link_status') >= 0) sc13Set_(lkT, lkR, 'link_status', 'unlinked');
    if (lkT.headers.indexOf('ended_at') >= 0) sc13Set_(lkT, lkR, 'ended_at', now);
    sc13Set_(pt, p, 'transferred_shipment_id', ''); sc13Set_(pt, p, 'transferred_to_shipment_at', ''); sc13Set_(pt, p, 'updated_at', editNextStamp_(now, [p.updated_at]));
    var unlinked = note + '\n[SC13_UNLINKED:' + pid + ':' + linkId + ':' + op + ':' + now + ']';
    sc13Set_(st, ship, 'note', unlinked + '\n[SC13_PENDING:remove-' + op + ']');
    var live2 = sc13Read_(ss, 'shipment_lines', []).rows.filter(function (l) { return sc13Str_(l.shipment_id) === sid && !sc13LineRemoved_(l); });
    function total(k) { return live2.some(function (l) { return l[k] === '' || l[k] == null || !isFinite(Number(l[k])); }) ? '' : live2.reduce(function (n, l) { return n + Number(l[k]); }, 0); }
    var full = sc13Read_(ss, 'shipments', []), srow = sc13One_(full.rows, 'shipment_id', sid);
    var fields = { shipment_total_qty: total('shipment_qty'), shipment_total_cartons: total('shipment_carton_qty'), shipment_total_cbm: total('shipment_carton_cbm'),
      shipment_total_gross_weight: total('gross_weight'), shipment_total_net_weight: total('net_weight'), rate_card_id: '', rate_card_version: '', estimated_freight_cost: '',
      estimated_duty: '', estimated_duty_currency: '', estimated_customs_fee: '', estimated_total_cost: '', estimated_unit_cost: '', updated_by: actor, updated_at: editNextStamp_(now, [srow.updated_at]) };
    Object.keys(fields).forEach(function (k) { if (full.headers.indexOf(k) >= 0) sc13Set_(full, srow, k, fields[k]); });
    SpreadsheetApp.flush();
    var fresh = sc13One_(sc13Read_(ss, 'shipments', []).rows, 'shipment_id', sid); fresh.note = unlinked;
    var proof2 = sc13Verify_(ss, fresh), after = shipmentDomainHeld_(dom, sheets, sid), bk = shipmentCancelBooks_(ss, sid, wh);
    if (bk.verdict !== 'RECONCILED' || Object.keys(keep).some(function (sku) { return Number(after[wh + '||' + sku] || 0) !== keep[sku] || Number(proof2.need[sku] || 0) !== keep[sku]; }) || sc13LinkIds_(ss, sid).indexOf(pid) >= 0 || !xcoRemoveReadback_(ss, sid, linkId, mine)) sc13Fail_('REMOVE_PLAN_READBACK_FAILED');
    sc13Set_(full, srow, 'note', unlinked + '\n[SC13_DONE:remove-' + op + ':' + pid + ']');
    return { success: true, outcome: 'REMOVED', shipment_id: sid, shipping_plan_id: pid, operation_id: op, lines_removed: mine.length, reservation_released: released,
      shipment_total_qty: fields.shipment_total_qty, needs_repricing: true };
  } catch (e) {
    return { success: false, outcome: 'UNKNOWN', zero_write: false, retry_safe: false, code: 'CONSOLIDATION_OUTCOME_UNKNOWN', shipment_id: sid, shipping_plan_id: pid, operation_id: op,
      error: 'The removal stopped after its first write (' + String(e && e.message || e) + '). The draft is quarantined ([SC13_PENDING]); nothing is undone automatically. Do not resend; read it back and report it to the owner.' };
  }
}
// XCO-R15G-12B (xco-r15g-impl): patched

// ===== XCO-R15G batch-1 review fixes (12_) =====
// The effective destination of a line: its LAST [SC13_ASSIGN] (which must equal the draft destination), else its v2 marker dest.
function xcoEffectiveDest_(src, line, ship) {
  var has = /\[SC13_ASSIGN:/.test(sc13Str_(line && line.note));
  if (!has) return sc13Str_(src && src.dest);
  var a = xcoAssignedDest_(line, ship);
  if (!a) sc13Fail_('CONSOLIDATION_LINE_DEST_CONTRADICTS_SHIPMENT');
  return a;
}
// A destination change on a draft that has never been merged: every live line records it (original lineage kept).
function xcoSingleDestChange_(ss, sid, s, rowVals, body) {
  var own = function (k) { return Object.prototype.hasOwnProperty.call(body || {}, k); };
  if (!own('destination_warehouse_id') && !own('warehouse_id')) return null;
  var d = sc13Str_(own('destination_warehouse_id') ? body.destination_warehouse_id : body.warehouse_id), c = s.col('destination_warehouse_id'), cur = c < 0 ? '' : sc13Str_(rowVals[c]);
  if (!d || d === cur) return null;
  var marked = sc13Read_(ss, 'shipment_lines', ['shipment_id', 'note']).rows.some(function (l) { return sc13Str_(l.shipment_id) === sid && !sc13LineRemoved_(l) && !!xcoMarkerOf_(l.note); });
  return marked ? { assign: { dest: d, op: 'SC13A-' + Utilities.getUuid(), reassign: true } } : null;
}
// Before a merge: each live line's effective destination has the draft destination's identity (A1 identity in CROSS_COMPANY, else exact).
function xcoMergeDestCheck_(ss, ship, lines, v) {
  var id = function (w) { return typeof xcdDestIdentity_ === 'function' ? xcdDestIdentity_(w, v) : sc13Str_(w); };
  var hd = id(ship.destination_warehouse_id);
  (lines || []).forEach(function (l) {
    var mk = xcoMarkerOf_(l.note);
    if (mk && (mk.unreadable || mk.v !== 2)) sc13Fail_('CONSOLIDATION_LINEAGE_LEGACY');
    var src = sc13Source_(ss, l, ship), eff = xcoEffectiveDest_(src, l, ship);
    if (!eff || id(eff) !== hd) sc13Fail_('CONSOLIDATION_LINE_DEST_CONTRADICTS_SHIPMENT');
  });
}
// selectRateCard on a merged draft: the card may not change the carrier, and no method / last-mile switch.
function xcoRateCardLock_(ss, sid, cur, rc, methodSwitch) {
  var n = 0; try { n = xcoLinkCount_(ss, sid); } catch (e) { return { code: 'CONSOLIDATION_LINK_UNREADABLE', shipment_id: sid }; }
  if (n < 2) return null;
  var f = [];
  if (sc13Str_(rc.carrier_id) !== sc13Str_(cur.carrier_id)) f.push('carrier_id');
  if (methodSwitch) f.push('shipping_method', 'last_mile_delivery');
  return f.length ? { code: 'CONSOLIDATED_DRAFT_KEY_FIELD_LOCKED', shipment_id: sid, fields: f, linked_plans: n, error: 'This Shipment Draft carries ' + n + ' Shipping Plans; the selected card would change ' + f.join(', ') + ' of its consolidation key. Choose a card of the same carrier and method. Nothing was written.' } : null;
}
// XCO-R15G-12C (xco-r15g-impl): patched

// ===== XCO-R15G O-1 (12_) =====
function xcoArrRow_(headers, arr) { var o = {}, c = headers.indexOf('note'), s = headers.indexOf('line_status'); if (c !== -1) o.note = arr[c]; if (s !== -1) o.line_status = arr[s]; return o; }
function xcoLinkRowsOf_(ss, sid) {
  var t = sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_), ships = sc13ShipIndex_(ss);
  return { table: t, rows: t.rows.filter(function (r) { return sc13Str_(r.shipment_id) === sid && !sc13LinkEnded_(ships[sid], sc13Str_(r.shipping_plan_id), r); }) };
}
function xcoRemoveReadback_(ss, sid, linkId, mine) {
  var lt = sc13Read_(ss, 'shipment_lines', ['shipment_line_id']), ids = {}; mine.forEach(function (l) { ids[sc13Str_(l.shipment_line_id)] = 1; });
  if (lt.rows.filter(function (l) { return ids[sc13Str_(l.shipment_line_id)]; }).some(function (l) { return !sc13LineRemoved_(l) || (lt.headers.indexOf('line_status') >= 0 && sc13Str_(l.line_status) !== 'removed'); })) return false;
  var k = sc13Read_(ss, 'shipment_plan_links', SC13_LINK_HEADERS_), r = sc13One_(k.rows, 'shipment_plan_link_id', linkId);
  if (k.headers.indexOf('link_status') >= 0 && (sc13Str_(r.link_status) !== 'unlinked' || !sc13Str_(r.ended_at))) return false;
  return true;
}
// XCO-R15G-12D-O1 (xco-r15g-impl): patched

// XCO-R15G MINOR-7: the scoped read memo (null outside a scope).
var XCO_READ_MEMO_ = null;
function xcoReadMemo_(ss, name, required) {
  var m = XCO_READ_MEMO_;
  if (!Object.prototype.hasOwnProperty.call(m, name)) { XCO_READ_MEMO_ = null; try { m[name] = sc13Read_(ss, name, []); } finally { XCO_READ_MEMO_ = m; } }
  var t = m[name];
  (required || []).forEach(function (k) { if (t.headers.indexOf(k) < 0) sc13Fail_('CONSOLIDATION_COLUMN_MISSING:' + name + '.' + k); });
  return { sheet: t.sheet, headers: t.headers.slice(), rows: t.rows.map(function (o) { return Object.assign({}, o); }) };
}
function xcoLinkMemo_(fn, shared) {
  if (XCO_READ_MEMO_) return fn();
  XCO_READ_MEMO_ = shared || {};
  try { return fn(); } finally { XCO_READ_MEMO_ = null; }
}
// XCO-R15G-MEMO-12 r2 (xco-r15g-impl): patched

// CODEX-S2: local, in-lock, pre-write EXACT read reuse; never retained across calls.
function shipWriteReadStage_(realSs, names) {
  var active = true, wrappers = Object.create(null), caches = [];
  function close() { active = false; caches.forEach(function (c) { Object.keys(c).forEach(function (k) { delete c[k]; }); }); }
  if (typeof Proxy !== 'function') return { ss: realSs, real: realSs, close: close };
  function copy(v) {
    if (Array.isArray(v)) return v.map(copy);
    return Object.prototype.toString.call(v) === '[object Date]' ? new Date(v.getTime()) : v;
  }
  function wrapSheet(real, name) {
    var cache = Object.create(null), allowed = names.indexOf(name) >= 0;
    caches.push(cache);
    function range(realRange, key) {
      return new Proxy({}, { get: function (_, property) {
        if (property === 'getValues' || property === 'getValue') return function () {
          var k = key && property + ':' + key;
          if (!active || !allowed || !k || arguments.length) return realRange[property].apply(realRange, arguments);
          if (!Object.prototype.hasOwnProperty.call(cache, k)) cache[k] = copy(realRange[property]());
          return copy(cache[k]);
        };
        var value = realRange[property];
        if (typeof value !== 'function') return value;
        return function () { close(); return value.apply(realRange, arguments); };
      } });
    }
    var metadata = { getLastRow: 1, getLastColumn: 1, getName: 1, getSheetId: 1, getMaxRows: 1, getMaxColumns: 1 };
    return new Proxy({}, { get: function (_, property) {
      if (property === 'getDataRange') return function () { return range(real.getDataRange(), 'FULL'); };
      if (property === 'getRange') return function () {
        var args = Array.prototype.slice.call(arguments), key = null;
        if (args.length >= 2 && args.length <= 4 && args.every(function (n) { return typeof n === 'number' && n > 0 && n === Math.floor(n); })) key = args.join(',');
        return range(real.getRange.apply(real, args), key);
      };
      var value = real[property];
      if (typeof value !== 'function') return value;
      return function () { if (!metadata[property]) close(); return value.apply(real, arguments); };
    } });
  }
  return { real: realSs, close: close, ss: new Proxy({}, { get: function (_, property) {
    if (property === 'getSheetByName') return function (name) {
      var real = realSs.getSheetByName(name);
      if (!real || !active) return real;
      if (!wrappers[name]) wrappers[name] = wrapSheet(real, name);
      return wrappers[name];
    };
    var value = realSs[property], metadata = { getId: 1, getName: 1, getUrl: 1, getSpreadsheetTimeZone: 1 };
    if (typeof value !== 'function') return value;
    return function () { if (!metadata[property]) close(); return value.apply(realSs, arguments); };
  } }) };
}
// R15G-STAMPS (final candidate): patched

// CODEX-TAX-SPLIT-1: local candidate, Owner fractional rates and separate currencies.

// ============================================================================================================
// AD3-B (Owner decisions 8 / 9 / 10, 2026-11-21) - SERVICE IDENTIFICATION WITHOUT RATE CARDS.
// One server vocabulary: the canonical method / last-mile tokens (the four / two the real master uses) plus every token an ACTIVE master row
// names (rate cards, lead times, route templates), and the domestic delivery types SPD / LTL as an input shortcut onto (method, last mile).
// Carriers come from the carriers master only (active, unique id) - never from rate cards. Booking channel (carrier_id) and delivery type
// are separate dimensions; delivery_type is not stored. Nothing here selects a card, a quote, a price or a currency.
// ============================================================================================================
var SHIP_SVC_METHODS_ = ['air', 'sea', 'sea_express', 'truck'];
var SHIP_SVC_LAST_MILES_ = ['parcel', 'truck'];
var SHIP_SVC_DELIVERY_TYPES_ = [{ value: 'SPD', shipping_method: 'truck', last_mile_delivery: 'parcel', scope: 'DOMESTIC' }, { value: 'LTL', shipping_method: 'truck', last_mile_delivery: 'truck', scope: 'DOMESTIC' }];
function shipSvcStr_(v) { return String(v == null ? '' : v).trim(); }
function shipSvcRows_(ss, name) {
  var sh = ss && ss.getSheetByName(name); if (!sh) return null;
  var d = sh.getDataRange().getValues(); if (!d.length) return [];
  var h = d[0].map(function (x) { return shipSvcStr_(x); }), out = [];
  for (var i = 1; i < d.length; i++) { var o = {}; h.forEach(function (k, j) { if (k) o[k] = d[i][j]; }); out.push(o); }
  return out;
}
// the same reading as shipUnpricedEligibility_: status inactive / disabled, or is_active false / 0 / no -> inactive; blank = active
function shipSvcActive_(r) {
  if (/^(inactive|disabled|retired|archived)$/i.test(shipSvcStr_(r.status))) return false;
  if (Object.prototype.hasOwnProperty.call(r, 'is_active')) { var a = r.is_active; if (a === false) return false; if (/^(false|0|no|n)$/i.test(shipSvcStr_(a))) return false; }
  return true;
}
function shipServiceVocabulary_(ss) {
  var m = SHIP_SVC_METHODS_.slice(), l = SHIP_SVC_LAST_MILES_.slice(), ok = function (t) { return /^[a-z0-9_]{1,40}$/.test(t); };
  var add = function (list, t) { t = shipSvcStr_(t); if (ok(t) && list.indexOf(t) < 0) list.push(t); };
  [['carrier_rate_cards', 'shipping_method'], ['carrier_lead_times', 'shipping_method'], ['shipment_route_templates', 'transit_type']].forEach(function (p) {
    (shipSvcRows_(ss, p[0]) || []).forEach(function (r) { if (!shipSvcActive_(r)) return; add(m, r[p[1]]); add(l, r.last_mile_delivery); }); });
  var cars = {}, order = [], capCache = {};
  (shipSvcRows_(ss, 'carriers') || []).forEach(function (r) { var id = shipSvcStr_(r.carrier_id); if (!id) return; if (!cars[id]) { cars[id] = { n: 0, row: r }; order.push(id); } cars[id].n++; });
  return { version: 'SVC-VOCAB-1', shipping_method: m.map(function (t) { return { value: t }; }), last_mile_delivery: l.map(function (t) { return { value: t }; }),
    delivery_type: SHIP_SVC_DELIVERY_TYPES_.map(function (d) { return { value: d.value, shipping_method: d.shipping_method, last_mile_delivery: d.last_mile_delivery, scope: d.scope }; }),
    carriers: order.filter(function (id) { return cars[id].n === 1 && shipSvcActive_(cars[id].row); }).map(function (id) { var cap = shipCarrierServices_(ss, id, '', '', capCache); return { carrier_id: id, carrier_name: shipSvcStr_(cars[id].row.carrier_name) || id, booking_channel: SHIP_BOOKING_CHANNEL_CARRIERS_[id] === 1, services_known: cap.known, services: cap.services.map(function (x) { return { shipping_method: x.shipping_method, last_mile_delivery: x.last_mile_delivery }; }) }; }) };
}
function shipSvcInVocab_(vocab, key, t) { t = shipSvcStr_(t); return !!t && (vocab[key] || []).some(function (x) { return x.value === t; }); }
// -> { ok, state, code } ; state ASSIGNED | TO_BE_ASSIGNED | CARRIER_UNKNOWN | CARRIER_NOT_UNIQUE | CARRIER_INACTIVE | CARRIER_TABLE_UNAVAILABLE
function shipCarrierCheck_(ss, id) {
  id = shipSvcStr_(id); if (!id) return { ok: false, state: 'TO_BE_ASSIGNED', code: 'CARRIER_TO_BE_ASSIGNED' };
  var rows = shipSvcRows_(ss, 'carriers'); if (!rows) return { ok: false, state: 'CARRIER_TABLE_UNAVAILABLE', code: 'CARRIER_TABLE_UNAVAILABLE' };
  var hit = rows.filter(function (r) { return shipSvcStr_(r.carrier_id) === id; });
  if (!hit.length) return { ok: false, state: 'CARRIER_UNKNOWN', code: 'SHIPMENT_CARRIER_UNKNOWN' };
  if (hit.length > 1) return { ok: false, state: 'CARRIER_NOT_UNIQUE', code: 'SHIPMENT_CARRIER_NOT_UNIQUE' };
  if (!shipSvcActive_(hit[0])) return { ok: false, state: 'CARRIER_INACTIVE', code: 'SHIPMENT_CARRIER_INACTIVE' };
  return { ok: true, state: 'ASSIGNED', code: '', carrier_name: shipSvcStr_(hit[0].carrier_name) };
}
function shipSvcStateOf_(ss, v) {
  var m = shipSvcStr_(v && v.shipping_method), l = shipSvcStr_(v && v.last_mile_delivery), dt = SHIP_SVC_DELIVERY_TYPES_.filter(function (d) { return d.shipping_method === m && d.last_mile_delivery === l; })[0];
  var cc; try { cc = shipCarrierCheck_(ss, v && v.carrier_id); } catch (e) { cc = { state: 'CARRIER_TABLE_UNAVAILABLE' }; }
  var tba = v && Object.prototype.hasOwnProperty.call(v, 'rate_card_version') && v.shipment_id !== undefined ? shipCarrierTbaState_(v) : null;
  var ex = null; try { ex = v && v.shipment_id && SHIP_BOOKING_CHANNEL_CARRIERS_[shipSvcStr_(v.carrier_id)] === 1 ? shipExecutingCarrierOf_(ss, v.shipment_id) : null; } catch (eX) { ex = null; }
  return { booking_channel: SHIP_BOOKING_CHANNEL_CARRIERS_[shipSvcStr_(v && v.carrier_id)] === 1, executing_carrier: ex ? { carrier_id: ex.executing_carrier_id, operation_id: ex.operation_id, recorded_at: ex.recorded_at } : null, executing_carrier_state: SHIP_BOOKING_CHANNEL_CARRIERS_[shipSvcStr_(v && v.carrier_id)] === 1 ? (ex ? 'RECORDED' : 'PENDING') : 'NOT_APPLICABLE',
    carrier_id: shipSvcStr_(v && v.carrier_id), carrier_state: cc.state === 'TO_BE_ASSIGNED' && tba ? (tba.to_be_assigned ? 'TO_BE_ASSIGNED' : 'CARRIER_MISSING') : cc.state, carrier_assignment: tba && tba.to_be_assigned ? { state: 'TO_BE_ASSIGNED', actor: tba.audit.actor, at: tba.audit.at, reason: tba.audit.reason } : null, shipping_method: m, last_mile_delivery: l,
    delivery_type_candidate: dt ? dt.value : '' };   // a candidate only: SPD / LTL apply to a DOMESTIC leg; the tuple alone does not prove domestic
}
// the Draft Save gate (12_ updateShipment, before any write). Only a CHANGED value is judged. -> { refuse } | { set: { field: value } }
function shipSvcSaveGate_(ss, s, rowVals, body) {
  var cur = function (k) { var c = s.col(k); return c === -1 ? '' : shipSvcStr_(rowVals[c]); };
  var has = function (k) { return !!body && Object.prototype.hasOwnProperty.call(body, k); }, val = function (k) { return shipSvcStr_(body[k]); };
  var set = {}, vocab = null, V = function () { return vocab || (vocab = shipServiceVocabulary_(ss)); };
  var no = function (code, msg, extra) { return { refuse: Object.assign({ code: code, error: code + ': ' + msg + ' Nothing was written.' }, extra || {}) }; };
  var marker; // undefined = rate_card_version untouched; a string = the value this Save writes there (server-owned column)
  if (has('carrier_assignment') && val('carrier_assignment') !== '') {
    if (val('carrier_assignment') !== 'TO_BE_ASSIGNED') return no('CARRIER_ASSIGNMENT_UNKNOWN', 'carrier_assignment accepts only TO_BE_ASSIGNED.');
    if (has('carrier_id') && val('carrier_id') !== '') return no('CARRIER_ASSIGNMENT_CONFLICT', 'a carrier id and "to be assigned" were sent together.');
    if (cur('rate_card_id') || (cur('rate_card_version') && !shipCarrierTbaMeta_(cur('rate_card_version')))) return no('CARRIER_CLEAR_WITH_SELECTED_QUOTE', 'a rate card or a freight-pending approval is recorded on this shipment; its carrier is not cleared.', { rate_card_id: cur('rate_card_id') });
    var why = val('carrier_assignment_reason'); if (!why || why.length > 500) return no('CARRIER_ASSIGNMENT_REASON_REQUIRED', 'a reason (1..500 characters) is required for "carrier to be assigned".');
    if (s.col('rate_card_version') < 0) return no('CARRIER_ASSIGNMENT_NOT_PERSISTABLE', 'shipments.rate_card_version (DB-16i) is missing - the to-be-assigned marker cannot be stored.');
    set.carrier_id = '';
    var who0 = shipAuditIdentity_(body, 'updateShipment.carrier_assignment');
    marker = shipCarrierTbaMarker_(cur('shipment_id'), { state: 'TO_BE_ASSIGNED', actor: who0.reported_operator || 'phase1-unattributed', actor_source: 'client_declared', reported_operator_verified: false, server_principal: who0.server_principal, principal_basis: who0.principal_basis, at: who0.received_at, reason: why });
  } else if (has('carrier_id') && val('carrier_id') !== '' && shipCarrierTbaMeta_(cur('rate_card_version'))) marker = '';   // a carrier filled by Save ends the to-be-assigned state
  if (has('carrier_id') && val('carrier_id') !== '' && val('carrier_id') !== cur('carrier_id')) {
    var cc = shipCarrierCheck_(ss, val('carrier_id'));
    if (!cc.ok) return no(cc.code, 'carrier ' + val('carrier_id') + ' is not a usable carrier (' + cc.state + ' in the carriers master). Choose an active carrier, or "to be assigned".', { carrier_id: val('carrier_id'), carrier_state: cc.state });
  }
  var dt = has('delivery_type') ? val('delivery_type').toUpperCase() : '';
  if (dt) {
    var d = V().delivery_type.filter(function (x) { return x.value === dt; })[0];
    if (!d) return no('DELIVERY_TYPE_UNKNOWN', 'delivery_type ' + dt + ' is not SPD or LTL.');
    var src = has('source_warehouse_id') ? val('source_warehouse_id') : cur('source_warehouse_id');
    var dst = (has('destination_warehouse_id') && val('destination_warehouse_id')) ? val('destination_warehouse_id') : (has('warehouse_id') && val('warehouse_id')) ? val('warehouse_id') : (cur('destination_warehouse_id') || cur('warehouse_id'));
    var oc = shipSvcStr_(shipOriginCountry1g_(ss, src)).toUpperCase(), dc = shipSvcStr_(shipOriginCountry1g_(ss, dst)).toUpperCase();
    if (!oc || !dc) return no('DELIVERY_TYPE_COUNTRY_UNKNOWN', 'SPD / LTL is a domestic delivery type; the ' + (!oc ? 'source' : 'destination') + ' warehouse country is unknown.', { missing_field: !oc ? 'source_warehouse_id.country' : 'destination_warehouse_id.country' });
    if (oc !== dc) return no('DELIVERY_TYPE_DOMESTIC_ONLY', 'SPD / LTL is a domestic delivery type; this shipment goes ' + oc + ' -> ' + dc + '. Choose the method and last mile instead.');
    if ((has('shipping_method') && val('shipping_method') && val('shipping_method') !== d.shipping_method) || (has('last_mile_delivery') && val('last_mile_delivery') && val('last_mile_delivery') !== d.last_mile_delivery))
      return no('DELIVERY_TYPE_CONFLICT', dt + ' means ' + d.shipping_method + ' + ' + d.last_mile_delivery + '; the request also names another method / last mile.');
    set.shipping_method = d.shipping_method; set.last_mile_delivery = d.last_mile_delivery;
  }
  var pairs = [['shipping_method', 'SHIPPING_METHOD_NOT_IN_VOCABULARY'], ['last_mile_delivery', 'LAST_MILE_NOT_IN_VOCABULARY']];
  for (var i = 0; i < pairs.length; i++) { var k = pairs[i][0], want = Object.prototype.hasOwnProperty.call(set, k) ? set[k] : (has(k) ? val(k) : null);
    if (want !== null && want !== '' && want !== cur(k) && !shipSvcInVocab_(V(), k, want)) return no(pairs[i][1], k + ' "' + want + '" is not in the server vocabulary (' + V()[k].map(function (x) { return x.value; }).join(', ') + ').', { field: k, value: want }); }
  // AD3-B (Owner supplement 1): a changed carrier / method / last mile must be a service the carrier's own master rows declare (BestWay = LTL only)
  var eff = function (k) { return Object.prototype.hasOwnProperty.call(set, k) ? shipSvcStr_(set[k]) : (has(k) ? val(k) : cur(k)); };
  var c1 = eff('carrier_id'), m1 = eff('shipping_method'), l1 = eff('last_mile_delivery');
  if (c1 && m1 && l1 && (c1 !== cur('carrier_id') || m1 !== cur('shipping_method') || l1 !== cur('last_mile_delivery'))) {
    var src1 = has('source_warehouse_id') ? val('source_warehouse_id') : cur('source_warehouse_id');
    var dst1 = (has('destination_warehouse_id') && val('destination_warehouse_id')) ? val('destination_warehouse_id') : (has('warehouse_id') && val('warehouse_id')) ? val('warehouse_id') : (cur('destination_warehouse_id') || cur('warehouse_id'));
    var cap1 = shipSvcCapabilityCheck_(ss, c1, m1, l1, shipOriginCountry1g_(ss, src1), shipOriginCountry1g_(ss, dst1) || cur('country'));
    if (cap1) return no(cap1.code, cap1.message + '.', { carrier_id: c1, shipping_method: m1, last_mile_delivery: l1, allowed: cap1.allowed });
  }
  return { set: set, marker: marker };
}
// AD3-B (coordinator / Author A, Owner 8): the TO-BE-ASSIGNED marker. Stored in the EXISTING server-owned column shipments.rate_card_version
// (no client path writes it: updateShipment refuses the key with RATE_CARD_SELECT_REQUIRED, 80_ lists it in SHI_NOT_IMPORTABLE_; only the
// 12_ selection / deferral writers, Draft creation and the XCO merge write it). A shipment without a carrier has no card and cannot carry a
// freight-pending approval (COMPLETE_SHIPMENT_FIRST), so the column is free while the carrier is blank. Format:
//   tba1|<encodeURIComponent(JSON {state:'TO_BE_ASSIGNED', actor, actor_source, at, reason})>|<24 hex = sha256(text, shipment_id) first 12 bytes>
// The digest binds the marker to ITS shipment (a copied marker is invalid). Readers call shipCarrierTbaState_(v) (or shipCarrierTbaMeta_).
function shipCarrierTbaDigest_(text, sid) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(['tba1', text, shipSvcStr_(sid)]), Utilities.Charset.UTF_8);
  return d.slice(0, 12).map(function (x) { return ((x & 255) + 256).toString(16).slice(1); }).join('');
}
function shipCarrierTbaMarker_(sid, audit) { var t = encodeURIComponent(JSON.stringify(audit)); return 'tba1|' + t + '|' + shipCarrierTbaDigest_(t, sid); }
// parse only (no shipment binding): -> audit | null
function shipCarrierTbaMeta_(value) {
  var m = /^tba1\|([^|]+)\|([0-9a-f]{24})$/.exec(shipSvcStr_(value)); if (!m) return null;
  try { var a = JSON.parse(decodeURIComponent(m[1])); return a && a.state === 'TO_BE_ASSIGNED' && typeof a.actor === 'string' && a.actor && typeof a.at === 'string' && a.at && typeof a.reason === 'string' && a.reason ? a : null; } catch (e) { return null; }
}
// THE reader for Confirm (22_): true only when the saved row has a blank carrier AND a valid marker bound to this shipment_id. -> { to_be_assigned, audit, reason }
function shipCarrierTbaState_(v) {
  var raw = shipSvcStr_(v && v.rate_card_version), a = shipCarrierTbaMeta_(raw);
  if (!a) return { to_be_assigned: false, audit: null, reason: raw ? 'NO_VALID_MARKER' : 'NO_MARKER' };
  if (shipSvcStr_(v.carrier_id)) return { to_be_assigned: false, audit: a, reason: 'CARRIER_PRESENT' };
  var m = /^tba1\|([^|]+)\|([0-9a-f]{24})$/.exec(raw);
  if (shipCarrierTbaDigest_(m[1], v.shipment_id) !== m[2]) return { to_be_assigned: false, audit: null, reason: 'MARKER_NOT_BOUND_TO_SHIPMENT' };
  return { to_be_assigned: true, audit: a, reason: '' };
}
function handleShipmentServiceVocabulary_(body) { return jsonResponse_({ success: true, service_vocabulary: shipServiceVocabulary_(shipRateReadView_(SpreadsheetApp.getActiveSpreadsheet())) }); }
// AD3-B (Owner supplement 3): what the server knows about WHO calls. The web app runs as the deployer for anonymous callers, so there is no
// per-person identity: Session.getActiveUser() is '' for them (recorded when it is not), the Sandbox router only proves that the caller holds
// the ONE shared Sandbox credential (km_ct), Production has no caller gate at all. The browser's operator name is recorded as
// reported_operator, flagged unverified, and is NEVER used for a permission decision.
function shipAuditIdentity_(body, action) {
  var em = ''; try { em = shipSvcStr_(Session.getActiveUser().getEmail()); } catch (e) { em = ''; }
  // round 5 (review-ad3 PROD_WRITE_GATE): both routers require the SHARED-PASSWORD session (01_ paSessionCheck_, 84_) before any action; the
  // Sandbox router adds the shared caller token. Both prove knowledge of a shared secret, never WHO the caller is.
  var pw = typeof paSessionCheck_ === 'function', sbx = (typeof RTR_SANDBOX_GATE_ !== 'undefined' && RTR_SANDBOX_GATE_ && RTR_SANDBOX_GATE_.env === 'KM_SANDBOX');
  var gate = pw && sbx ? 'SHARED_PASSWORD_SESSION_AND_SANDBOX_CALLER_TOKEN' : pw ? 'SHARED_PASSWORD_SESSION' : sbx ? 'SANDBOX_SHARED_CALLER_CREDENTIAL' : 'NONE_ANONYMOUS_WEB_APP';
  return { action: action, server_principal: em, principal_basis: em ? 'APPS_SCRIPT_ACTIVE_USER' : gate,
    reported_operator: shipSvcStr_(body && (body.actor || body.updated_by)).slice(0, 100), reported_operator_verified: false, received_at: shipmentTimestamp_() };
}
// AD3-B (Owner supplement 1): the SERVICE CAPABILITY of a carrier = every (method, last mile) its own master rows name - carrier_rate_cards,
// carrier_lead_times, shipment_route_templates (transit_type) and carrier_service_schedules - whatever their active flag (an inactive owner-estimate
// lead time or a disabled template is still the Owner's declaration of what that carrier does; activation only governs ETA / route use), scoped by
// origin / destination country when known (blank row country = any; a row naming a planning set covers its members). No row at all = capability
// unknown (refused for an explicit service). BestWay = LTL only comes from its rows (Codex: 7 owner_estimate lead times + 1 template, truck/truck US).
function shipCarrierServices_(ss, carrierId, oc, dc, cache) {   // cache (optional): { sheetName: rows } read once by the caller
  var car = shipSvcStr_(carrierId), O = shipSvcStr_(oc).toUpperCase(), D = shipSvcStr_(dc).toUpperCase(), out = {}, any = false;
  var rowsOf = function (n) { return (cache && cache[n]) || (cache ? (cache[n] = shipSvcRows_(ss, n) || []) : (shipSvcRows_(ss, n) || [])); };
  // AD3-B round 3 (coordinator): inactive rows are a DECLARED capability only for a ZERO-card carrier (no active rate card); a carrier with an
  // active card is judged on its ACTIVE rows only (cards: shipSvcActive_; lead times: shipLtActive_; templates / schedules: is_active / status).
  var zeroCard = !rowsOf('carrier_rate_cards').some(function (r) { return shipSvcStr_(r.carrier_id) === car && shipSvcActive_(r); });
  var live = function (n, r) { return n === 'carrier_lead_times' ? shipLtActive_(r) : shipSvcActive_(r); };
  // AD3-B round 4: PHYSICAL countries only. A planning group (e.g. EU) is never a transport country and never widens a lane; a DOMESTIC lane
  // (origin = destination) needs a row naming exactly that country on BOTH ends (a blank row country never grants a domestic service).
  var isSet = function (c) { try { return typeof csdPlanningSet15e_ === 'function' && !!csdPlanningSet15e_(c); } catch (e) { return false; } };
  var dom = !!O && O === D;
  var inC = function (rowC, want) { var r = shipSvcStr_(rowC).toUpperCase(); if (r && isSet(r)) return false; if (!r) return !dom; return !want || r === want; };
  [['carrier_rate_cards', 'shipping_method', 'rate_card_id'], ['carrier_lead_times', 'shipping_method', 'lead_time_id'], ['shipment_route_templates', 'transit_type', 'route_template_id'], ['carrier_service_schedules', 'shipping_method', 'service_schedule_id']].forEach(function (p) {
    rowsOf(p[0]).forEach(function (r) {
      if (shipSvcStr_(r.carrier_id) !== car || (!zeroCard && !live(p[0], r))) return; var m = shipSvcStr_(r[p[1]]), l = shipSvcStr_(r.last_mile_delivery); if (!m || !l) return; any = true;
      if (!inC(r.origin_country, O) || !inC(r.destination_country, D)) return;
      var k = m + '|' + l; (out[k] = out[k] || { shipping_method: m, last_mile_delivery: l, basis: [] }).basis.length < 5 && out[k].basis.push(p[0] + ':' + shipSvcStr_(r[p[2]])); }); });
  return { known: any, zero_card: zeroCard, basis: zeroCard ? 'DECLARED_ROWS_INCL_INACTIVE' : 'ACTIVE_ROWS', services: Object.keys(out).sort().map(function (k) { return out[k]; }) };
}
function shipSvcCapabilityCheck_(ss, carrierId, m, l, oc, dc) {
  var cap = shipCarrierServices_(ss, carrierId, oc, dc), list = cap.services.map(function (x) { return x.shipping_method + ' + ' + x.last_mile_delivery; });
  if (!cap.known) return { code: 'CARRIER_SERVICE_CAPABILITY_UNKNOWN', message: 'carrier ' + carrierId + ' has no service row (rate card, lead time, route template or schedule) in the master - its allowed services are unknown', allowed: [] };
  if (!cap.services.some(function (x) { return x.shipping_method === shipSvcStr_(m) && x.last_mile_delivery === shipSvcStr_(l); }))
    return { code: 'SERVICE_NOT_OFFERED_BY_CARRIER', message: 'carrier ' + carrierId + ' does not offer ' + m + ' + ' + l + (oc || dc ? ' for ' + (oc || '?') + ' -> ' + (dc || '?') : '') + ' (offered: ' + (list.join('; ') || 'none for this lane') + ')', allowed: cap.services };
  return null;
}
// AD3-B (Owner 8 + supplement 2): LATER carrier assignment, separate from the transport-field lock. Two cases, decided from the SAVED row:
//  (a) carrier_id blank AND a valid to-be-assigned marker -> fill carrier_id, clear the marker (status draft / ready_to_ship / dispatched, not terminal);
//  (b) carrier_id = a BOOKING CHANNEL (SHIP_BOOKING_CHANNEL_CARRIERS_) -> carrier_id is NEVER overwritten; the EXECUTING carrier is recorded as one
//      structured shipment_events row (event_type executing_carrier_assigned, raw_status = the carrier id, source_event_id carrier_exec:<shipment>,
//      note = server JSON). Only after dispatch: before Confirm any event row counts as dispatch evidence (22_ csdEventExists_).
// Both: legal active carrier, company of the request = shipment company, operation_id, lock + re-read, never overwrite an assigned value,
// idempotent (same carrier -> already_assigned, 0 writes; the stored operation_id / audit returned).
var SHIP_ASSIGN_BLOCKED_STATUSES_ = ['cancelled', 'closed', 'received', 'completed', 'partially_received', 'partial_received', 'delivered'];   // round 7 (review): receiving / delivered states too
var SHIP_BOOKING_CHANNEL_CARRIERS_ = { CAR_AMAZON_PARTNERED: 1 };   // Codex carrierNotes: booking-channel alias (NOT the executing carrier); no master column says it
var SHIP_EXEC_EVENT_TYPE_ = 'executing_carrier_assigned';
// AD3-B round 3: true when the deployed 22_ dispatch-evidence reader skips this event type (AD3 A). Read from its source text so a half-synced
// deployment (old 22_) refuses a pre-Confirm record instead of freezing the Draft.
function shipExecEventIgnoredByDispatch_() { try { return typeof csdEventExists_ === 'function' && String(csdEventExists_).indexOf(SHIP_EXEC_EVENT_TYPE_) >= 0; } catch (e) { return false; } }
function shipExecutingCarrierOf_(ss, sid) {
  var rows = (shipSvcRows_(ss, 'shipment_events') || []).filter(function (e) { return shipSvcStr_(e.shipment_id) === shipSvcStr_(sid) && shipSvcStr_(e.event_type) === SHIP_EXEC_EVENT_TYPE_ && shipSvcStr_(e.source_event_id) === 'carrier_exec:' + shipSvcStr_(sid); });
  if (!rows.length) return null;
  var a = {}; try { a = JSON.parse(String(rows[0].note || '{}')) || {}; } catch (e) { a = {}; }
  return { executing_carrier_id: shipSvcStr_(rows[0].raw_status), shipment_event_id: shipSvcStr_(rows[0].shipment_event_id), recorded_at: shipSvcStr_(rows[0].created_at), operation_id: shipSvcStr_(a.operation_id), booking_channel: shipSvcStr_(a.booking_channel), audit: a, duplicated: rows.length > 1 };
}
function handleShipmentAssignCarrier_(body) {
  var sid = shipSvcStr_(body && body.shipment_id), id = shipSvcStr_(body && body.carrier_id), reason = shipSvcStr_(body && body.reason), op = shipSvcStr_(body && body.operation_id), co = shipSvcStr_(body && body.company);
  if (!sid || !id || !co || !reason || reason.length > 500 || !/^[A-Za-z0-9_.:-]{6,80}$/.test(op) || !shipSvcStr_(body && body.expected_updated_at)) return shipRcNo_('CARRIER_ASSIGN_INCOMPLETE', { correction: 'shipment_id, company, carrier_id, reason (1..500), operation_id (6..80 of A-Z a-z 0-9 _ . : -) and expected_updated_at are required' });
  var lock = LockService.getScriptLock();
  try { if (!lock.tryLock(30000)) return shipRcNo_('LOCK_TIMEOUT', { retryable: true }); } catch (e) { return shipRcNo_('LOCK_TIMEOUT', { retryable: true }); }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet(), r = shipRow_(ss, sid);
    if (!r || r.dup) return shipRcNo_(r ? 'SHIPMENT_DUPLICATED' : 'SHIPMENT_NOT_FOUND');
    var v = r.v, st = shipSvcStr_(v.status).toLowerCase(), now0 = shipSvcStr_(v.carrier_id), who = shipAuditIdentity_(body, 'shipment.assignCarrier');
    if (shipSvcStr_(v.company) !== co) return shipRcNo_('SHIPMENT_COMPANY_MISMATCH', { company: shipSvcStr_(v.company) });
    if (['carrier_id', 'updated_at', 'note'].some(function (k) { return r.s.col(k) < 0; })) return shipRcNo_('CARRIER_ASSIGN_NOT_PERSISTABLE', { needs: 'shipments.carrier_id / updated_at / note' });
    var bookingCase = !!(now0 && SHIP_BOOKING_CHANNEL_CARRIERS_[now0] === 1);
    // ---- idempotent answers first (a retry after a lost answer re-reads, never writes again)
    if (!bookingCase && now0 === id) return jsonResponse_({ success: true, already_assigned: true, verified: true, case: 'FILL_BLANK_CARRIER', shipment_id: sid, carrier_id: id, carrier_state: 'ASSIGNED', writes: 0 });
    if (bookingCase) { var ex0 = shipExecutingCarrierOf_(ss, sid);
      if (ex0 && ex0.executing_carrier_id === id) return jsonResponse_({ success: true, already_assigned: true, verified: true, case: 'EXECUTING_CARRIER', shipment_id: sid, booking_channel: now0, executing_carrier: ex0, writes: 0 });
      if (ex0) return shipRcNo_('EXECUTING_CARRIER_ALREADY_ASSIGNED', { executing_carrier: ex0, correction: 'an executing carrier already recorded is never replaced here' }); }
    if (editTokSame_(v.updated_at, body.expected_updated_at) !== 'SAME') return shipRcNo_('EDIT_CONFLICT', { current_updated_at: editTok_(v.updated_at) });
    if (SHIP_ASSIGN_BLOCKED_STATUSES_.indexOf(st) >= 0) return shipRcNo_('SHIPMENT_NOT_ASSIGNABLE', { status: st });
    var cc = shipCarrierCheck_(ss, id); if (!cc.ok) return shipRcNo_(cc.code, { carrier_id: id, carrier_state: cc.state });
    var at = who.received_at, n = 0;
    if (!bookingCase) {
      if (now0) return shipRcNo_('CARRIER_ALREADY_ASSIGNED', { carrier_id: now0, correction: 'a carrier already on the shipment is never replaced here' });
      var tba = shipCarrierTbaState_(v); if (!tba.to_be_assigned) return shipRcNo_('CARRIER_NOT_MARKED_TO_BE_ASSIGNED', { reason_code: tba.reason, correction: 'save the shipment as "carrier to be assigned" first, or choose the carrier in the Draft' });
      var line = '[CARRIER_ASSIGNED @' + at + ' op ' + op + ' principal ' + (who.server_principal || who.principal_basis) + ' reported_operator ' + (who.reported_operator || '-') + ' (unverified)] ' + id + ' | reason: ' + reason.replace(/[\r\n]+/g, ' ');
      var noteNew = shipSvcStr_(v.note) ? (String(v.note) + '\n' + line) : line, stamp = editNextStamp_(at, [v.updated_at]);
      var put = function (k, value) { n++; r.sheet.getRange(r.row, r.s.col(k) + 1).setValue(value); };
      try {
        put('carrier_id', id); put('note', noteNew); if (r.s.col('rate_card_version') >= 0) put('rate_card_version', ''); if (r.s.col('updated_by') >= 0) put('updated_by', who.reported_operator || 'phase1-unattributed'); put('updated_at', stamp);
        SpreadsheetApp.flush();
        var b = r.sheet.getRange(r.row, 1, 1, r.s.headers.length).getValues()[0], g = function (k) { return b[r.s.col(k)]; };
        if (shipSvcStr_(g('shipment_id')) !== sid || shipSvcStr_(g('carrier_id')) !== id || String(g('note')).indexOf(line) < 0 || (r.s.col('rate_card_version') >= 0 && shipSvcStr_(g('rate_card_version')) !== '')) throw new Error('CARRIER_ASSIGN_UNVERIFIED');
      } catch (eW) { return jsonResponse_({ success: false, code: 'CARRIER_ASSIGN_UNVERIFIED', error: 'Reload and check the shipment. Nothing was resent.', zero_write: n === 0, outcome: n === 0 ? 'NOT_WRITTEN' : 'UNKNOWN' }); }
      return jsonResponse_({ success: true, verified: true, case: 'FILL_BLANK_CARRIER', operation_id: op, shipment_id: sid, carrier_id: id, carrier_name: cc.carrier_name, carrier_state: 'ASSIGNED', audit: who, updated_at: editTokWritten15f2_(stamp), writes: n });
    }
    // ---- (b) booking channel: record the executing carrier, never touch carrier_id
    if (SHIP_BOOKING_CHANNEL_CARRIERS_[id] === 1 || id === now0) return shipRcNo_('EXECUTING_CARRIER_IS_BOOKING_CHANNEL', { carrier_id: id });
    if (SHIPMENT_DISPATCHED_STATUSES_.indexOf(st) < 0 && st !== 'stuck' && !shipExecEventIgnoredByDispatch_()) return shipRcNo_('DEPLOYMENT_HALF_SYNCED', { status: st, needs: '22_ csdEventExists_ ignoring event_type ' + SHIP_EXEC_EVENT_TYPE_ + ' (AD3 A)', correction: 'before Confirm this event would read as dispatch evidence on this deployment; nothing was written' });   // AD3-B round 3: Drafts allowed once 22_ ignores the event type
    if (typeof shipAppendLifecycleEvent_ !== 'function') return shipRcNo_('DEPLOYMENT_HALF_SYNCED', { needs: '31_ shipAppendLifecycleEvent_' });
    var audit = { operation_id: op, booking_channel: now0, executing_carrier_id: id, reason: reason, action: who.action, server_principal: who.server_principal, principal_basis: who.principal_basis, reported_operator: who.reported_operator, reported_operator_verified: false, received_at: at };
    var res = shipAppendLifecycleEvent_(ss, { shipment_id: sid, now: at, event_type: SHIP_EXEC_EVENT_TYPE_, event_status: 'recorded', source_event_id: 'carrier_exec:' + sid, raw_status: id, note: JSON.stringify(audit), actor: 'assignCarrier:' + op });
    SpreadsheetApp.flush();
    var ex1 = shipExecutingCarrierOf_(ss, sid);
    if (!ex1 || ex1.executing_carrier_id !== id || ex1.operation_id !== op) return jsonResponse_({ success: false, code: 'CARRIER_ASSIGN_UNVERIFIED', error: 'Reload and check the shipment. Nothing was resent.', zero_write: !res || res.appended !== true, outcome: 'UNKNOWN', data: { append: res } });
    return jsonResponse_({ success: true, verified: true, case: 'EXECUTING_CARRIER', operation_id: op, shipment_id: sid, booking_channel: now0, carrier_id: now0, executing_carrier: ex1, carrier_state: 'ASSIGNED', audit: audit, writes: res.appended ? 1 : 0 });
  } finally { try { lock.releaseLock(); } catch (eR) {} }
}
// AD3-B-12 (joint-a-delta3 b): patched
// AD3-B (coordinator request from Author C, Owner decisions 2 / 12): the DESTINATION gate of a Draft, decided before any write and before any
// reservation. It never copies C's rules: it calls the 22_ helpers (guarded by typeof; absent = not judged here, Confirm still judges).
//   - a LOGICAL platform warehouse (the two WFS rows) is never a ship-to -> DESTINATION_IS_LOGICAL_PLATFORM
//   - an FBA row naming another platform than the shipment's site -> DESTINATION_PLATFORM_MISMATCH:<wh>!=<site> (site MULTI / blank: not judged)
//   - an OVERSEAS (non-factory) source to a 3PL destination must pass C's exact 3PL -> 3PL branch (csdOverseasTransferEligibility_), else its
//     reason (TRANSFER_COUNTRY_NOT_ENABLED:<C>, DESTINATION_COMPANY_MISMATCH, ...) - so no stock is reserved for a Draft Confirm will refuse.
// fact = { company, country, marketplace, source_warehouse_id, destination_warehouse_id }. -> null | { code, reason, check }
function shipDestinationDraftGate_(ss, fact) {
  var S = shipSvcStr_, dst = S(fact.destination_warehouse_id), src = S(fact.source_warehouse_id), mk = S(fact.marketplace);
  if (!dst) return null;
  if (typeof csdLogicalPlatformWarehouse_ === 'function' && csdLogicalPlatformWarehouse_(dst)) return { code: 'DESTINATION_IS_LOGICAL_PLATFORM', reason: 'DESTINATION_IS_LOGICAL_PLATFORM' };
  var whs = shipSvcRows_(ss, 'warehouses') || [], d = whs.filter(function (w) { return S(w.warehouse_id) === dst; });
  if (d.length !== 1) return null;   // unknown / duplicate destination: the existing destination rules answer
  var ty = S(d[0].warehouse_type).toUpperCase();
  if (ty === 'FBA' && S(d[0].marketplace) && mk && !/multi/i.test(mk) && typeof csdPlatformFamily_ === 'function' && csdPlatformFamily_(d[0].marketplace) !== csdPlatformFamily_(mk)) {
    var r0 = 'DESTINATION_PLATFORM_MISMATCH:' + csdPlatformFamily_(d[0].marketplace) + '!=' + csdPlatformFamily_(mk); return { code: 'DESTINATION_PLATFORM_MISMATCH', reason: r0 }; }
  if (ty === '3PL' && src && typeof csdOverseasTransferEligibility_ === 'function' && typeof csdOverseas3plTransferBranch_ === 'function' /* C's AD3 22_ only */ && shipmentSourceDomain_(ss, src) === SHIPMENT_DOMAIN_OVERSEAS_) {
    var res = csdOverseasTransferEligibility_(ss, { shipment_id: '', company: fact.company, country: fact.country, marketplace: mk, source_warehouse_id: src, destination_warehouse_id: dst });
    if (!res.eligible) return { code: String(res.reason || 'TRANSFER_NOT_ELIGIBLE').split(':')[0], reason: String(res.reason || 'TRANSFER_NOT_ELIGIBLE'), check: res };
  }
  return null;
}


var SHIPMENT_PHYSICAL_LAYOUTS_SC1_ = {
  "shipments": [
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by",
      "cancelled_at"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason",
      "estimated_duty_currency"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason",
      "estimated_duty_currency",
      "record_origin"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason",
      "estimated_duty_currency",
      "record_origin",
      "opening_as_of"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason",
      "estimated_duty_currency",
      "record_origin",
      "opening_as_of",
      "import_batch_id"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason",
      "estimated_duty_currency",
      "record_origin",
      "opening_as_of",
      "import_batch_id",
      "opening_supply_mode"
    ],
    [
      "shipment_id",
      "shipment_no",
      "shipping_plan_id",
      "external_shipment_id",
      "reference_id",
      "source_warehouse_id",
      "warehouse_code",
      "company",
      "country",
      "marketplace",
      "ship_from",
      "destination",
      "destination_warehouse_id",
      "destination_type",
      "carrier_id",
      "rate_card_id",
      "import_duty_treatment",
      "shipping_method",
      "last_mile_delivery",
      "shipments_customs_type",
      "status",
      "sales_order_id",
      "booking_no",
      "master_tracking_number",
      "tracking_number",
      "container_no",
      "bl_no",
      "invoice_no",
      "etd",
      "eta",
      "is_cross_dock",
      "temperature_requirement",
      "hazmat_flag",
      "actual_departure_date",
      "actual_arrival_date",
      "customs_clearance_date",
      "delivered_date",
      "shipment_total_qty",
      "shipment_total_cartons",
      "shipment_total_cbm",
      "shipment_total_gross_weight",
      "shipment_total_net_weight",
      "estimated_freight_cost",
      "estimated_duty",
      "estimated_customs_fee",
      "estimated_total_cost",
      "estimated_unit_cost",
      "freight_cost_actual",
      "duty_actual",
      "total_cost_actual",
      "currency",
      "note",
      "created_by",
      "created_at",
      "updated_at",
      "shipped_at",
      "shipped_by",
      "hidden_from_draft_at",
      "hidden_from_draft_by",
      "warehouse_id",
      "total_gross_weight",
      "total_net_weight",
      "updated_by",
      "rate_card_version",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason",
      "estimated_duty_currency",
      "record_origin",
      "opening_as_of",
      "import_batch_id",
      "opening_supply_mode",
      "final_output_validated_digest"
    ]
  ],
  "shipment_lines": [
    [
      "shipment_line_id",
      "shipment_id",
      "shipping_plan_line_id",
      "sku",
      "expiration_date",
      "inventory_status",
      "source_inventory_location_id",
      "source_outbound_line_id",
      "source_inbound_line_id",
      "shipment_qty",
      "shipment_received_qty",
      "factory_stock_allocation_qty",
      "shipment_carton_qty",
      "carton_no_start",
      "carton_no_end",
      "units_per_carton",
      "shipment_carton_cbm",
      "gross_weight",
      "net_weight",
      "purchase_order_line_id",
      "note",
      "created_at",
      "updated_at",
      "snapshot_current_stock",
      "snapshot_avg_sales_per_day",
      "snapshot_days_of_supply",
      "snapshot_suggested_qty",
      "snapshot_target_days",
      "snapshot_fc_context",
      "snapshot_event_context",
      "snapshot_avg_sales_source",
      "snapshot_avg_sales_warning"
    ],
    [
      "shipment_line_id",
      "shipment_id",
      "shipping_plan_line_id",
      "sku",
      "expiration_date",
      "inventory_status",
      "source_inventory_location_id",
      "source_outbound_line_id",
      "source_inbound_line_id",
      "shipment_qty",
      "shipment_received_qty",
      "factory_stock_allocation_qty",
      "shipment_carton_qty",
      "carton_no_start",
      "carton_no_end",
      "units_per_carton",
      "shipment_carton_cbm",
      "gross_weight",
      "net_weight",
      "purchase_order_line_id",
      "note",
      "created_at",
      "updated_at",
      "snapshot_current_stock",
      "snapshot_avg_sales_per_day",
      "snapshot_days_of_supply",
      "snapshot_suggested_qty",
      "snapshot_target_days",
      "snapshot_fc_context",
      "snapshot_event_context",
      "snapshot_avg_sales_source",
      "snapshot_avg_sales_warning",
      "line_status"
    ],
    [
      "shipment_line_id",
      "shipment_id",
      "shipping_plan_line_id",
      "sku",
      "expiration_date",
      "inventory_status",
      "source_inventory_location_id",
      "source_outbound_line_id",
      "source_inbound_line_id",
      "shipment_qty",
      "shipment_received_qty",
      "factory_stock_allocation_qty",
      "shipment_carton_qty",
      "carton_no_start",
      "carton_no_end",
      "units_per_carton",
      "shipment_carton_cbm",
      "gross_weight",
      "net_weight",
      "purchase_order_line_id",
      "note",
      "created_at",
      "updated_at",
      "snapshot_current_stock",
      "snapshot_avg_sales_per_day",
      "snapshot_days_of_supply",
      "snapshot_suggested_qty",
      "snapshot_target_days",
      "snapshot_fc_context",
      "snapshot_event_context",
      "snapshot_avg_sales_source",
      "snapshot_avg_sales_warning",
      "line_status",
      "opening_received_qty"
    ],
    [
      "shipment_line_id",
      "shipment_id",
      "shipping_plan_line_id",
      "sku",
      "expiration_date",
      "inventory_status",
      "source_inventory_location_id",
      "source_outbound_line_id",
      "source_inbound_line_id",
      "shipment_qty",
      "shipment_received_qty",
      "factory_stock_allocation_qty",
      "shipment_carton_qty",
      "carton_no_start",
      "carton_no_end",
      "units_per_carton",
      "shipment_carton_cbm",
      "gross_weight",
      "net_weight",
      "purchase_order_line_id",
      "note",
      "created_at",
      "updated_at",
      "snapshot_current_stock",
      "snapshot_avg_sales_per_day",
      "snapshot_days_of_supply",
      "snapshot_suggested_qty",
      "snapshot_target_days",
      "snapshot_fc_context",
      "snapshot_event_context",
      "snapshot_avg_sales_source",
      "snapshot_avg_sales_warning",
      "line_status",
      "opening_received_qty",
      "import_batch_id"
    ]
  ]
};

// SC1: only pinned physical layouts of this module's two tables are compatible.
function shipmentRequireKnownLayoutSc1_(ss, name, required) {
  var layouts = SHIPMENT_PHYSICAL_LAYOUTS_SC1_[name];
  if (!layouts) return prodRequireSheet_(ss, name, required);
  prodAssertDbTarget_(ss);
  var sheet = ss.getSheetByName(name);
  if (!sheet) throw prodSchemaError_('SCHEMA_NOT_PROVISIONED', name, null);
  var width = sheet.getLastColumn();
  if (sheet.getLastRow() < 1 || width < 1) throw prodSchemaError_('HEADER_MISSING', name, null);
  var actual = sheet.getRange(1, 1, 1, width).getValues()[0].map(function (h) { return String(h).trim(); });
  var report = prodSafetyBundle_().classifySchemaMismatch({
    exists: true, actualHeaders: actual, expectedHeaders: required || [], extraColumnsPolicy: 'ALLOW'
  });
  if (report.valid) return sheet;
  if (report.schemaStatus !== 'HEADER_ORDER_MISMATCH') throw prodSchemaError_(report.schemaStatus, name, report);
  var known = layouts.some(function (headers) {
    return headers.length === actual.length && headers.every(function (header, i) { return header === actual[i]; });
  });
  if (!known) throw prodSchemaError_('HEADER_ORDER_MISMATCH', name, { known_physical_layout: false });
  return sheet;
}
