

















var REQUEST_ORDERS_HEADERS_ = [
'request_order_id', 'request_order_no', 'request_order_version', 'parent_request_order_id',
'company', 'supplier_id', 'supplier_name', 'factory_id', 'warehouse_id',


'request_status',

'tier_group',
'total_sku', 'total_qty', 'total_cartons', 'estimated_amount', 'currency',
'source', 'source_ref_type', 'source_ref_id',
'created_by', 'created_at', 'submitted_by', 'submitted_at',
'approved_by', 'approved_at', 'rejected_by', 'rejected_at', 'rejected_reason',
'cancelled_by', 'cancelled_at', 'completed_by', 'completed_at',
'note', 'updated_by', 'updated_at'
];

var REQUEST_ORDER_LINES_HEADERS_ = [
'request_order_line_id', 'request_order_id', 'sku', 'series',

'company',

'request_bucket', 'request_month',

'inspection_date', 'expected_ready_date', 'expected_ship_date',


'requested_qty', 'approved_qty', 'km_qty', 'resus_qty', 'restw_qty', 'units_per_carton', 'carton_qty', 'shortage_qty',
'supplier_id', 'supplier_name', 'supplier_sku', 'unit_cost', 'estimated_amount', 'currency',


'calculation_method', 'line_status', 'purchase_order_line_id',
'note', 'created_at', 'updated_at'
];





var REQUEST_ORDER_LINE_SOURCES_HEADERS_ = [
'request_order_line_source_id', 'request_order_line_id', 'request_order_id', 'sku',
'company', 'country', 'marketplace', 'site_sku', 'marketplace_product_id',
'tier_type', 'source_month',
'forecast_qty', 'current_stock', 'on_the_way_qty', 'shortage_qty',
'reallocation_qty', 'recommended_qty', 'requested_qty', 'approved_qty',
'allocation_method', 'source_bucket', 'source_priority', 'source_type', 'note',
'created_at', 'updated_at',


'request_allocation_draft_id'
];



var PURCHASE_ORDERS_HEADERS_ = [
'purchase_order_id', 'po_no', 'km_po_no', 'warehouse_id', 'supplier_name',
'order_status', 'order_date', 'deposit_due_date', 'inspection_date', 'expected_completion_date', 'expected_ship_date',
'subtotal_amount', 'deposit_amount', 'balance_amount', 'paid_amount', 'payment_status', 'payment_term_id',
'currency', 'note', 'purchase_order_no', 'po_version', 'parent_purchase_order_id',
'request_order_id', 'company', 'supplier_id', 'factory_id',
'total_sku', 'total_qty', 'total_cartons', 'total_amount',
'supplier_expected_ready_date', 'supplier_confirmed_ready_date', 'request_bucket',
'created_by', 'created_at', 'updated_by', 'updated_at',
'issued_by', 'issued_at', 'confirmed_by', 'confirmed_at',
'cancelled_by', 'cancelled_at', 'completed_by', 'completed_at',
'closure_reason', 'closed_by', 'closed_at'
];


var PURCHASE_ORDER_LINES_HEADERS_ = [
'purchase_order_line_id', 'purchase_order_id', 'request_order_line_id', 'request_order_id', 'request_bucket',
'sku', 'company', 'series', 'factory_item_no', 'factory_item_name',
'supplier_id', 'supplier_name', 'supplier_sku', 'supplier_warehouse_id',
'km_qty', 'resus_qty', 'restw_qty', 'recommended_qty', 'requested_qty', 'approved_qty',
'ordered_qty', 'completed_qty', 'shipped_qty', 'remaining_qty',
'carton_qty', 'units_per_carton', 'unit_cost', 'line_amount', 'currency', 'line_status',
'inspection_date', 'expected_completion_date', 'expected_ship_date',
'related_shipment_id', 'note', 'created_at', 'updated_at'
];



function procurementTimestamp_() {
return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function procurementToday_() {
return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}



function procurementAddBusinessDays_(ymd, n) {
var s = String(ymd == null ? '' : ymd).trim();
var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
if (!m) return '';
var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
if (isNaN(d.getTime())) return '';
var added = 0;
while (added < n) {
d.setDate(d.getDate() + 1);
var dow = d.getDay();
if (dow !== 0 && dow !== 6) added++;
}
return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}



function procurementDateOnly_(v) {
if (v === '' || v == null) return '';
if (Object.prototype.toString.call(v) === '[object Date]') {
return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
var s = String(v).trim();
if (!s) return '';
var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
if (m) return m[1] + '-' + m[2] + '-' + m[3];
var d = new Date(s);
return isNaN(d.getTime()) ? s : Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function procurementNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }


var RO_COMPANIES_ = ['KM', 'ResUS', 'ResTW'];
function procurementCompanyQty_(company, qty) {
var c = String(company || '').trim().toUpperCase();
var out = { km_qty: 0, resus_qty: 0, restw_qty: 0 };
var q = procurementNum_(qty);
if (c.indexOf('RESUS') !== -1 || c === 'RES US') out.resus_qty = q;
else if (c.indexOf('RESTW') !== -1 || c === 'RES TW') out.restw_qty = q;
else if (c === 'KM' || c.indexOf('KITCHEN MAMA') !== -1 || c === 'KITCHENMAMA') out.km_qty = q;

return out;
}


function procurementReqStatus_(ref) {
var rs = ref.col('request_status') !== -1 ? String(ref.vals[ref.col('request_status')]).trim() : '';
if (rs) return rs;
return ref.col('status') !== -1 ? String(ref.vals[ref.col('status')]).trim() : '';
}


function procurementTierGroup_(buckets) {
var hasT1 = false, hasT23 = false;
(buckets || []).forEach(function (b) {
var t = String(b || '').trim().toUpperCase();
if (t === 'T1' || t === '') { if (t === 'T1') hasT1 = true; }
else if (t === 'T2' || t === 'T3') hasT23 = true;
});
if (hasT1 && hasT23) return 'mixed';
if (hasT1) return 'T1';
if (hasT23) return 'T2_T3';
return '';
}






function procurementEnsureSheet_(ss, name, headers) {
return procurementRequireKnownLayoutSc1_(ss, name, headers);
}


function procurementAppendByHeader_(sheet, obj) {
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


function procurementUpcMap_(ss) {
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


function procurementSkuLifecycleMap_(ss) {
var map = {};
var sh = ss.getSheetByName('sku_details');
if (!sh) return map;
var data = sh.getDataRange().getValues();
if (data.length < 2) return map;
var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
var cSku = h.indexOf('sku'), cLc = h.indexOf('lifecycle');
if (cSku === -1) return map;
for (var i = 1; i < data.length; i++) {
var s = String(data[i][cSku] || '').trim();
if (s) map[s.toLowerCase()] = cLc === -1 ? '' : String(data[i][cLc] || '').trim();
}
return map;
}


function procurementFactoryMap_(ss) {
var map = {};
var sh = ss.getSheetByName('warehouses');
if (!sh) return map;
var data = sh.getDataRange().getValues();
if (data.length < 2) return map;
var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
var cId = h.indexOf('warehouse_id'), cFac = h.indexOf('is_factory_warehouse'), cAct = h.indexOf('is_active'), cCo = h.indexOf('company');
if (cId === -1) return map;
function truthy(v) { var t = String(v == null ? '' : v).trim().toLowerCase(); return v === true || t === 'true' || t === 'yes' || t === 'y' || t === '1'; }
function activeFlag(v) { if (v === false) return false; var t = String(v == null ? '' : v).trim().toLowerCase(); return !(t === 'false' || t === 'no' || t === 'n' || t === '0' || t === 'inactive'); }
for (var i = 1; i < data.length; i++) {
var id = String(data[i][cId] || '').trim();
if (!id) continue;
if (map[id.toLowerCase()]) { map[id.toLowerCase()].dup = true; continue; }
map[id.toLowerCase()] = {
warehouseId: id,
isFactory: cFac === -1 ? false : truthy(data[i][cFac]),
isActive: cAct === -1 ? true : activeFlag(data[i][cAct]),
company: cCo === -1 ? '' : String(data[i][cCo] || '').trim()
};
}
return map;
}



var RO_TERMINAL_LIFECYCLE_ = { 'closure': 1, 'discontinued': 1, 'inactive': 1, 'invalid': 1, 'deleted': 1 };







function validateManualRequestOrderDraft_(body, maps) {
body = body || {}; maps = maps || {};
var factoryMap = maps.factoryMap || {}, skuLifecycle = maps.skuLifecycle || {}, upcMap = maps.upcMap || {};


var auto = String(body.source_ref_type || '').trim(), cos = (body.lines || []).map(function (l) { return String((l && l.company) || '').trim(); }).filter(String);
if (!auto || String(body.company || '').trim()) cos.push(String(body.company || '').trim());
for (var k = 0; k < cos.length; k++) if (RO_COMPANIES_.indexOf(cos[k]) < 0) return { ok: false, error: cos[k] ? 'COMPANY_NOT_RECOGNIZED' : 'COMPANY_REQUIRED', detail: cos[k] };

if (auto) return { ok: true };


var r = procurementResolveWarehouseIn_(factoryMap, body.warehouse_id, body.factory_id, 'new');
if (!r.ok) return { ok: false, error: { WAREHOUSE_ID_MISSING: 'FACTORY_REQUIRED', WAREHOUSE_NOT_FOUND: 'FACTORY_NOT_FOUND', NOT_A_FACTORY_WAREHOUSE: 'FACTORY_NOT_FOUND' }[r.reason] || r.reason, detail: r.reason + ' ' + (r.value || '') };
{
var whId = r.warehouse_id, f = factoryMap[whId.toLowerCase()];
}


var lines = body.lines || [], sawLine = false;
for (var i = 0; i < lines.length; i++) {
var l = lines[i] || {};
var sku = String(l.sku || '').trim();
if (!sku) continue;
sawLine = true;
var lc = skuLifecycle[sku.toLowerCase()];
if (lc === undefined) return { ok: false, error: 'SKU_NOT_FOUND', detail: sku };
if (RO_TERMINAL_LIFECYCLE_[String(lc).trim().toLowerCase()] === 1) return { ok: false, error: 'SKU_INACTIVE', detail: sku + ' (' + lc + ')' };
var qty = parseFloat(l.requested_qty);
if (!(qty > 0)) return { ok: false, error: 'REQUESTED_QTY_INVALID', detail: sku };
var upc = parseFloat(l.units_per_carton) || upcMap[sku] || 0;
if (!(upc > 0)) return { ok: false, error: 'UNITS_PER_CARTON_MISSING', detail: sku };
}
if (!sawLine) return { ok: false, error: 'SKU_REQUIRED' };
return { ok: true };
}


function procurementSkuInfoMap_(ss) {
var map = {};
var sh = ss.getSheetByName('sku_details');
if (!sh) return map;
var data = sh.getDataRange().getValues();
if (data.length < 2) return map;
var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
var cSku = h.indexOf('sku'), cName = h.indexOf('product_name'), cSeries = h.indexOf('series');
if (cSku === -1) return map;
for (var i = 1; i < data.length; i++) {
var s = String(data[i][cSku] || '').trim();
if (!s) continue;
map[s] = {
product_name: cName === -1 ? '' : String(data[i][cName] || '').trim(),
series: cSeries === -1 ? '' : String(data[i][cSeries] || '').trim()
};
}
return map;
}






function procSrcNorm_(v) { return String(v == null ? '' : v).trim(); }
function procSrcKey_(sku, company, country, marketplace) {
return procSrcNorm_(sku).toLowerCase() + '|' + procSrcNorm_(company).toLowerCase() + '|' +
procSrcNorm_(country).toLowerCase() + '|' + procSrcNorm_(marketplace).toLowerCase();
}
var PROC_MONTH_KEYS_ = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];


function procurementSourcePriority_(bucket) {
var b = String(bucket || '').trim().toUpperCase();
if (b === 'T1') return 1;
if (b === 'T2') return 2;
if (b === 'T3') return 3;
return '';
}



function procurementMarketplaceSkuMap_(ss) {
var map = {};
var sh = ss.getSheetByName('marketplace_skus');
if (!sh) return map;
var data = sh.getDataRange().getValues();
if (data.length < 2) return map;
var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
var cS = h.indexOf('sku'), cC = h.indexOf('company'), cCo = h.indexOf('country'), cM = h.indexOf('marketplace'),
cSite = h.indexOf('site_sku'), cPid = h.indexOf('marketplace_product_id'), cAsin = h.indexOf('asin');
if (cS === -1) return map;
for (var i = 1; i < data.length; i++) {
var key = procSrcKey_(data[i][cS], cC !== -1 ? data[i][cC] : '', cCo !== -1 ? data[i][cCo] : '', cM !== -1 ? data[i][cM] : '');
if (map[key]) continue;
map[key] = {
site_sku: cSite !== -1 ? procSrcNorm_(data[i][cSite]) : '',
marketplace_product_id: (cPid !== -1 ? procSrcNorm_(data[i][cPid]) : '') || (cAsin !== -1 ? procSrcNorm_(data[i][cAsin]) : '')
};
}
return map;
}











function procurementTargetRuleRows_(ss) {
var sh = ss.getSheetByName('fc_target_rules');
if (!sh) return [];
var data = sh.getDataRange().getValues();
if (!data || data.length < 2) return [];
var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
var out = [];
for (var i = 1; i < data.length; i++) {
var blank = true, o = {};
for (var c = 0; c < h.length; c++) {
if (!h[c]) continue;
o[h[c]] = data[i][c];
if (String(data[i][c]).trim() !== '') blank = false;
}
if (!blank) out.push(o);
}
return out;
}


function procurementTargetPct_(ruleRows, req) {
if (typeof KMPD === 'undefined' || !KMPD || typeof KMPD.resolveTargetRule !== 'function') return null;
return KMPD.resolveTargetRule(ruleRows, req).targetPct;
}





function procurementForecastNext3Map_(ss, targetRuleRows) {
var map = {};
var sh = ss.getSheetByName('fc_regular_forecast');
if (!sh) return map;
var data = sh.getDataRange().getValues();
if (data.length < 2) return map;
var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
var cS = h.indexOf('sku'), cC = h.indexOf('company'), cCo = h.indexOf('country'), cM = h.indexOf('marketplace'),
cYear = h.indexOf('year'), cSeries = h.indexOf('series'), cCat = h.indexOf('category');
if (cS === -1) return map;
var monthCol = PROC_MONTH_KEYS_.map(function (mk) { return h.indexOf(mk); });

var now = new Date();
var yNow = now.getFullYear(), mNow = now.getMonth();
var windows = [];
for (var k = 1; k <= 3; k++) { var mm = mNow + k; windows.push({ year: yNow + Math.floor(mm / 12), mi: ((mm % 12) + 12) % 12 }); }
for (var i = 1; i < data.length; i++) {
var rowYear = cYear !== -1 ? parseInt(String(data[i][cYear]).trim(), 10) : NaN;
var add = 0;
for (var w = 0; w < windows.length; w++) {

if (!isNaN(rowYear) && rowYear !== windows[w].year) continue;
var mc = monthCol[windows[w].mi];
if (mc === -1) continue;


var pct = procurementTargetPct_(targetRuleRows, {
year: String(windows[w].year),
company: cC !== -1 ? data[i][cC] : '',
country: cCo !== -1 ? data[i][cCo] : '',
marketplace: cM !== -1 ? data[i][cM] : '',
category: cCat !== -1 ? data[i][cCat] : '',
series: cSeries !== -1 ? data[i][cSeries] : '',
sku: cS !== -1 ? data[i][cS] : '',
month: windows[w].mi + 1
});



if (pct === null) continue;
add += (parseFloat(data[i][mc]) || 0) * (pct / 100);
}
if (!add) continue;
var key = procSrcKey_(data[i][cS], cC !== -1 ? data[i][cC] : '', cCo !== -1 ? data[i][cCo] : '', cM !== -1 ? data[i][cM] : '');
map[key] = (map[key] || 0) + add;
}
return map;
}





function procurementInventoryStockMaps_(ss) {
var exact = {}, bySku = {}, latestDate = {};
var sh = ss.getSheetByName('amazon_inventory_snapshot');
if (!sh) return { exact: exact, bySku: bySku };
var data = sh.getDataRange().getValues();
if (data.length < 2) return { exact: exact, bySku: bySku };
var h = data[0].map(function (x) { return String(x).trim().toLowerCase(); });
var cS = h.indexOf('sku'), cCo = h.indexOf('country'), cM = h.indexOf('marketplace'),
cQty = h.indexOf('available_qty'), cDate = h.indexOf('snapshot_date');
if (cS === -1 || cQty === -1) return { exact: exact, bySku: bySku };
for (var i = 1; i < data.length; i++) {
var sku = procSrcNorm_(data[i][cS]); if (!sku) continue;
var country = cCo !== -1 ? procSrcNorm_(data[i][cCo]) : '';
var mkt = cM !== -1 ? procSrcNorm_(data[i][cM]) : '';
var date = cDate !== -1 ? procSrcNorm_(data[i][cDate]) : '';
var qty = parseFloat(data[i][cQty]) || 0;
var ek = sku.toLowerCase() + '|' + country.toLowerCase() + '|' + mkt.toLowerCase();

if (latestDate[ek] === undefined || date >= latestDate[ek]) { latestDate[ek] = date; exact[ek] = qty; }
}

Object.keys(exact).forEach(function (ek) { var sku = ek.split('|')[0]; bySku[sku] = (bySku[sku] || 0) + exact[ek]; });
return { exact: exact, bySku: bySku };
}



function procurementCurrentStock_(invMaps, sku, country, marketplace) {
var s = procSrcNorm_(sku); if (!s) return 0;
if (procSrcNorm_(country) && procSrcNorm_(marketplace)) {
var ek = s.toLowerCase() + '|' + procSrcNorm_(country).toLowerCase() + '|' + procSrcNorm_(marketplace).toLowerCase();
return invMaps.exact[ek] || 0;
}
return invMaps.bySku[s.toLowerCase()] || 0;
}








function procShipmentLineQty_(rowVals, cShipQty, cLegacyQty) {
if (cShipQty !== -1) {
var craw = rowVals[cShipQty];
var cBlank = (craw === '' || craw === null || craw === undefined || (typeof craw === 'string' && craw.trim() === ''));
if (!cBlank) {
var cn = parseFloat(craw);
return (isFinite(cn) && cn > 0) ? cn : 0;
}
}
if (cLegacyQty !== -1) {
var lraw = rowVals[cLegacyQty];
var lBlank = (lraw === '' || lraw === null || lraw === undefined || (typeof lraw === 'string' && lraw.trim() === ''));
if (!lBlank) {
var ln = parseFloat(lraw);
return (isFinite(ln) && ln > 0) ? ln : 0;
}
}
return 0;
}






function procShipmentRemainingQty_(rowVals, cShipQty, cLegacyQty, cReceived) {
var shipped = procShipmentLineQty_(rowVals, cShipQty, cLegacyQty);
var received = 0;
if (cReceived !== -1) {
var raw = rowVals[cReceived];
var blank = (raw === '' || raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === ''));
if (!blank) { var n = parseFloat(raw); received = (isFinite(n) && n > 0) ? n : 0; }
}
var remaining = shipped - received;
return remaining > 0 ? remaining : 0;
}










function procShipmentDestId_(rowVals, cDest, cLegacy) {
if (cDest !== -1) {
var d = rowVals[cDest];
var dBlank = (d === '' || d === null || d === undefined || (typeof d === 'string' && d.trim() === ''));
if (!dBlank) return { id: procSrcNorm_(d), legacyFallback: false, missing: false };
}
if (cLegacy !== -1) {
var w = rowVals[cLegacy];
var wBlank = (w === '' || w === null || w === undefined || (typeof w === 'string' && w.trim() === ''));
if (!wBlank) return { id: procSrcNorm_(w), legacyFallback: true, missing: false };
}
return { id: '', legacyFallback: false, missing: true };
}





function procurementOnTheWayMaps_(ss) {
var active = {};
var CLOSED = { completed: 1, received: 1, closed: 1, cancelled: 1, canceled: 1, delivered: 1 };


var KNOWN_ACTIVE = { draft: 1, ready_to_ship: 1, shipped: 1, in_transit: 1, arrived: 1, partially_received: 1, partial_received: 1, stuck: 1, planned: 1 };
var unknownStatus = {};
var shSh = ss.getSheetByName('shipments');
if (shSh) {
var sd = shSh.getDataRange().getValues();
if (sd.length >= 2) {
var sh = sd[0].map(function (x) { return String(x).trim().toLowerCase(); });
var cId = sh.indexOf('shipment_id'), cStatus = sh.indexOf('status'),
cCo = sh.indexOf('country'), cM = sh.indexOf('marketplace'),
cDest = sh.indexOf('destination_warehouse_id'), cWid = sh.indexOf('warehouse_id'), cOrg = sh.indexOf('record_origin'), cSm = sh.indexOf('opening_supply_mode');
if (cId !== -1) {
for (var i = 1; i < sd.length; i++) {
var id = procSrcNorm_(sd[i][cId]); if (!id) continue;
var st = cStatus !== -1 ? String(sd[i][cStatus]).trim().toLowerCase() : '';
if (CLOSED[st]) continue;
if (st && !KNOWN_ACTIVE[st]) { unknownStatus[st] = (unknownStatus[st] || 0) + 1; continue; }
// SHIP-OPEN R4 (Owner rule 4): an Amazon opening record (80_ IMPORT_HISTORICAL + opening_supply_mode DISPLAY_ONLY) is display only - its
// quantity is a cut-off figure, never presented as live on-the-way (the request order's on_the_way_qty). Nothing else here changes.
if (cOrg !== -1 && cSm !== -1 && String(sd[i][cOrg]).trim() === 'IMPORT_HISTORICAL' && String(sd[i][cSm]).trim() !== '' && String(sd[i][cSm]).trim().toUpperCase() !== 'COUNTED') continue;   // R5: only a COUNTED new-model opening record is on the way; r5.4: blank mode / no column = legacy row = counted as before
var dest = procShipmentDestId_(sd[i], cDest, cWid);
active[id] = { country: cCo !== -1 ? procSrcNorm_(sd[i][cCo]) : '', marketplace: cM !== -1 ? procSrcNorm_(sd[i][cM]) : '',
destId: dest.id, destLegacy: dest.legacyFallback, destMissing: dest.missing };
}
}
}
}

var exact = {}, bySku = {}, byDest = {};
var lnSh = ss.getSheetByName('shipment_lines');
if (lnSh) {
var ld = lnSh.getDataRange().getValues();
if (ld.length >= 2) {
var lh = ld[0].map(function (x) { return String(x).trim().toLowerCase(); });
var cSid = lh.indexOf('shipment_id'), cSku = lh.indexOf('sku'), cShipQty = lh.indexOf('shipment_qty'), cLegacyQty = lh.indexOf('qty');
var cReceived = lh.indexOf('shipment_received_qty');
if (cSid !== -1 && cSku !== -1 && (cShipQty !== -1 || cLegacyQty !== -1)) {
for (var j = 1; j < ld.length; j++) {
var sid = procSrcNorm_(ld[j][cSid]);
if (!active[sid]) continue;
if (typeof sc13LineRemoved_ === 'function' && typeof xcoArrRow_ === 'function') { var xcoRm13_ = true; try { xcoRm13_ = sc13LineRemoved_(xcoArrRow_(lh, ld[j])); } catch (eX13_) { xcoRm13_ = true; } if (xcoRm13_) continue; }   // XCO-R15G MAJOR-O1-1
var sku = procSrcNorm_(ld[j][cSku]); if (!sku) continue;
var qty = procShipmentRemainingQty_(ld[j], cShipQty, cLegacyQty, cReceived);
var ap = active[sid];
var ek = sku.toLowerCase() + '|' + ap.country.toLowerCase() + '|' + ap.marketplace.toLowerCase();
exact[ek] = (exact[ek] || 0) + qty;
bySku[sku.toLowerCase()] = (bySku[sku.toLowerCase()] || 0) + qty;
var dk = sku.toLowerCase() + '|' + (ap.destMissing ? '__MISSING_DEST__' : String(ap.destId).toLowerCase());
byDest[dk] = (byDest[dk] || 0) + qty;
}
}
}
}
return { exact: exact, bySku: bySku, byDest: byDest, unknownStatus: unknownStatus };
}


function procurementOnTheWay_(otwMaps, sku, country, marketplace) {
var s = procSrcNorm_(sku); if (!s) return 0;
if (procSrcNorm_(country) && procSrcNorm_(marketplace)) {
var ek = s.toLowerCase() + '|' + procSrcNorm_(country).toLowerCase() + '|' + procSrcNorm_(marketplace).toLowerCase();
if (otwMaps.exact[ek] !== undefined) return otwMaps.exact[ek];
}
return otwMaps.bySku[s.toLowerCase()] || 0;
}


function procurementFindRow_(sheet, idColName, idValue) {
var data = sheet.getDataRange().getValues();
if (data.length < 2) return null;
var headers = data[0].map(function (h) { return String(h).trim(); });
var idCol = headers.indexOf(idColName);
if (idCol === -1) return null;
for (var i = 1; i < data.length; i++) {
if (String(data[i][idCol]).trim() === idValue) {
return {
row: i + 1,
vals: data[i],
headers: headers,
col: function (n) { return headers.indexOf(n); }
};
}
}
return null;
}










function roExecCanonicalString_(company, planningCycle, series, draftIds) {
function s(v) { return String(v == null ? '' : v).trim(); }
var seen = {}, arr = [];
(draftIds || []).forEach(function (d) { var x = s(d); if (x && !seen[x]) { seen[x] = 1; arr.push(x); } });
arr.sort();
return [s(company), s(planningCycle), s(series), arr.join(',')].join('|');
}



function roExecutionKey_(company, planningCycle, series, draftIds) {
var canon = roExecCanonicalString_(company, planningCycle, series, draftIds);
var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canon, Utilities.Charset.UTF_8);
var hex = digest.map(function (b) { return ('0' + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2); }).join('');
return 'ROEXEC-' + hex.substring(0, 32).toUpperCase();
}



function roFindByExecutionKey_(roSheet, srcType, execKey) {
var data = roSheet.getDataRange().getValues();
if (data.length < 2) return [];
var h = data[0].map(function (x) { return String(x).trim(); });
var cType = h.indexOf('source_ref_type'), cId = h.indexOf('source_ref_id'), cStatus = h.indexOf('request_status');
var cRoId = h.indexOf('request_order_id'), cNo = h.indexOf('request_order_no');
if (cType === -1 || cId === -1) return [];
var out = [];
for (var i = 1; i < data.length; i++) {
if (String(data[i][cType]).trim() !== srcType) continue;
if (String(data[i][cId]).trim() !== execKey) continue;
var st = cStatus !== -1 ? String(data[i][cStatus]).trim().toLowerCase() : '';
if (st === 'cancelled') continue;
out.push({ request_order_id: String(data[i][cRoId]).trim(), request_order_no: cNo !== -1 ? String(data[i][cNo]).trim() : '' });
}
return out;
}


function roDeleteRequestOrderById_(ss, roId) {
['request_order_lines', 'request_order_line_sources', 'request_orders'].forEach(function (name) {
var sh = ss.getSheetByName(name); if (!sh) return;
var data = sh.getDataRange().getValues(); if (data.length < 2) return;
var c = data[0].map(function (x) { return String(x).trim(); }).indexOf('request_order_id'); if (c === -1) return;
for (var i = data.length - 1; i >= 1; i--) { if (String(data[i][c]).trim() === roId) sh.deleteRow(i + 1); }
});
}















var RO_EXEC_SOURCE_REF_TYPE_ = 'request_order_allocation_batch';
function handleCreateRequestOrderDraft_(body) {
var lines = (body && body.lines) || [];
if (!lines.length) return jsonResponse_({ success: false, error: 'No lines provided' });
var srcType = String((body && body.source_ref_type) || '').trim();
if (srcType !== RO_EXEC_SOURCE_REF_TYPE_) return roCreateRequestOrderCore_(body, '');


var execKey = roExecutionKey_(body.company, body.planning_cycle, body.series, lines.map(function (l) { return l && l.request_allocation_draft_id; }));
var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
try {
var ssX = SpreadsheetApp.getActiveSpreadsheet();
var roSheetX = procurementEnsureSheet_(ssX, 'request_orders', REQUEST_ORDERS_HEADERS_);
var existing = roFindByExecutionKey_(roSheetX, RO_EXEC_SOURCE_REF_TYPE_, execKey);
if (existing.length === 1) return jsonResponse_({ success: true, data: { request_order_id: existing[0].request_order_id, request_order_no: existing[0].request_order_no, reused: true, execution_key: execKey } });
if (existing.length > 1) return jsonResponse_({ success: false, error: 'REQUEST_ORDER_EXECUTION_DUPLICATE_CONFLICT', stage: 'idempotency', detail: existing.map(function (x) { return x.request_order_no; }).join(',') });
return roCreateRequestOrderCore_(body, execKey);
} finally { try { lock.releaseLock(); } catch (e2) { } }
}



function roCreateRequestOrderCore_(body, execKey) {
var lines = (body && body.lines) || [];
var ss = SpreadsheetApp.getActiveSpreadsheet();
var roSheet = procurementEnsureSheet_(ss, 'request_orders', REQUEST_ORDERS_HEADERS_);
var rolSheet = procurementEnsureSheet_(ss, 'request_order_lines', REQUEST_ORDER_LINES_HEADERS_);
var srcSheet = procurementEnsureSheet_(ss, 'request_order_line_sources', REQUEST_ORDER_LINE_SOURCES_HEADERS_);


try { sheetEnsureColumns_(srcSheet, ['request_allocation_draft_id']); } catch (eCol) { }
var upcMap = procurementUpcMap_(ss);
var infoMap = procurementSkuInfoMap_(ss);



var _roManualCheck = validateManualRequestOrderDraft_(body, {
factoryMap: procurementFactoryMap_(ss), skuLifecycle: procurementSkuLifecycleMap_(ss), upcMap: upcMap
});
if (!_roManualCheck.ok) return jsonResponse_({ success: false, error: _roManualCheck.error, detail: _roManualCheck.detail || '' });


var mskuMap = procurementMarketplaceSkuMap_(ss);
var targetRuleRows = procurementTargetRuleRows_(ss);
var forecastMap = procurementForecastNext3Map_(ss, targetRuleRows);
var invMaps = procurementInventoryStockMaps_(ss);
var otwMaps = procurementOnTheWayMaps_(ss);

var now = procurementTimestamp_();
var today = procurementToday_();
var createdBy = String((body && body.created_by) || 'procurement').trim();
var source = String((body && body.source) || 'manual').trim();
var currency = String((body && body.currency) || '').trim();
var supplierId = String((body && body.supplier_id) || '').trim();
var supplierName = String((body && body.supplier_name) || '').trim();

var DEFAULT_WAREHOUSE_ID = 'WH-TW-CN-FACTORY-YOUXIN';
var roWh = procurementResolveWarehouse_(ss, (body && body.warehouse_id) || (body && body.factory_id ? '' : DEFAULT_WAREHOUSE_ID), body && body.factory_id, 'new');
if (!roWh.ok) return jsonResponse_({ success: false, error: roWh.reason, detail: roWh.value || '' });
var warehouseId = roWh.warehouse_id;

var requestOrderId = 'RO-' + Utilities.getUuid().substring(0, 10).toUpperCase();
var requestOrderNo = 'REQ-' + today.replace(/-/g, '') + '-' + Utilities.getUuid().substring(0, 4).toUpperCase();

var totalQty = 0, totalCartons = 0, estimatedAmount = 0, lineCount = 0;
var distinctSku = {};
var buckets = [];



try {
for (var j = 0; j < lines.length; j++) {
var l = lines[j] || {};
var sku = String(l.sku || '').trim();
if (!sku) continue;
var requested = procurementNum_(l.requested_qty);
var upc = procurementNum_(l.units_per_carton) || upcMap[sku] || 0;
var approved = requested;
var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
var hasUnitCost = (l.unit_cost !== '' && l.unit_cost != null && !isNaN(parseFloat(l.unit_cost)));
var unitCost = hasUnitCost ? parseFloat(l.unit_cost) : '';
var lineAmount = hasUnitCost ? Math.round(approved * unitCost * 100) / 100 : '';
var info = infoMap[sku] || { product_name: '', series: '' };
var company = String(l.company || '').trim();
var bucket = String(l.request_bucket || '').trim();
var month = String(l.request_month || '').trim();
var shortage = (l.shortage_qty !== '' && l.shortage_qty != null && !isNaN(parseFloat(l.shortage_qty))) ? procurementNum_(l.shortage_qty) : '';
var coQty = procurementCompanyQty_(company, approved);
var lineId = 'ROL-' + Utilities.getUuid().substring(0, 10).toUpperCase();
buckets.push(bucket);

procurementAppendByHeader_(rolSheet, {
request_order_line_id: lineId,
request_order_id: requestOrderId,
sku: sku,
series: String(l.series || info.series || '').trim(),
company: company,
request_bucket: bucket,
request_month: month,
inspection_date: String(l.inspection_date || '').trim(),
expected_ready_date: String(l.expected_ready_date || '').trim(),
expected_ship_date: String(l.expected_ship_date || '').trim(),
requested_qty: requested,
approved_qty: approved,
km_qty: coQty.km_qty,
resus_qty: coQty.resus_qty,
restw_qty: coQty.restw_qty,
units_per_carton: upc,
carton_qty: carton,
shortage_qty: shortage,
supplier_id: String(l.supplier_id || supplierId || '').trim(),
supplier_name: String(l.supplier_name || supplierName || '').trim(),
supplier_sku: String(l.supplier_sku || '').trim(),
unit_cost: unitCost,
estimated_amount: lineAmount,
currency: String(l.currency || currency || '').trim(),
calculation_method: String(l.calculation_method || 'manual_order_allocation').trim(),
line_status: String(l.line_status || 'draft').trim(),
purchase_order_line_id: '',
note: String(l.note || '').trim(),
created_at: now,
updated_at: now
});


var country = String(l.country || '').trim();
var marketplace = String(l.marketplace || '').trim();
var identity = mskuMap[procSrcKey_(sku, company, country, marketplace)] || { site_sku: '', marketplace_product_id: '' };
var srcKey = procSrcKey_(sku, company, country, marketplace);

var forecastQty = forecastMap[srcKey] !== undefined ? Math.round(forecastMap[srcKey]) : '';
var currentStock = procurementCurrentStock_(invMaps, sku, country, marketplace);
var onTheWayQty = procurementOnTheWay_(otwMaps, sku, country, marketplace);
var sourceId = 'ROLS-' + Utilities.getUuid().substring(0, 10).toUpperCase();
procurementAppendByHeader_(srcSheet, {
request_order_line_source_id: sourceId,
line_source_id: sourceId,
request_order_line_id: lineId,
request_order_id: requestOrderId,
sku: sku,
company: company,
country: country,
marketplace: marketplace,
site_sku: identity.site_sku,
marketplace_product_id: identity.marketplace_product_id,
tier_type: bucket,
source_month: month,
forecast_qty: forecastQty,
current_stock: currentStock,
on_the_way_qty: onTheWayQty,
shortage_qty: '',
reallocation_qty: '',
recommended_qty: '',
requested_qty: requested,
approved_qty: approved,
allocation_method: 'manual_order_allocation',
source_bucket: bucket,
source_priority: procurementSourcePriority_(bucket),
source_type: 'request_order_draft',


request_allocation_draft_id: String((l.request_allocation_draft_id) || '').trim(),
note: String(l.note || '').trim(),
created_at: now,
updated_at: now
});

totalQty += approved;
totalCartons += carton;
if (hasUnitCost) estimatedAmount += (approved * unitCost);
if (sku) distinctSku[String(sku).toLowerCase()] = 1;
lineCount++;
}

if (!lineCount) return jsonResponse_({ success: false, error: 'No valid lines (each line needs a sku)' });

procurementAppendByHeader_(roSheet, {
request_order_id: requestOrderId,
request_order_no: requestOrderNo,
request_order_version: 1,
parent_request_order_id: requestOrderId,
company: String((body && body.company) || '').trim(),
supplier_id: supplierId,
supplier_name: supplierName,
factory_id: warehouseId,
warehouse_id: warehouseId,
request_status: 'draft',
tier_group: procurementTierGroup_(buckets),
total_sku: Object.keys(distinctSku).length,
total_qty: totalQty,
total_cartons: totalCartons,
estimated_amount: (estimatedAmount > 0 ? Math.round(estimatedAmount * 100) / 100 : ''),
currency: currency,
source: source,
source_ref_type: String((body && body.source_ref_type) || '').trim(),


source_ref_id: String(execKey || (body && body.source_ref_id) || '').trim(),
created_by: createdBy,
created_at: now,
note: String((body && body.note) || '').trim(),
updated_by: createdBy,
updated_at: now
});

return jsonResponse_({ success: true, data: { request_order_id: requestOrderId, request_order_no: requestOrderNo, line_count: lineCount, total_qty: totalQty, execution_key: (execKey || ''), reused: false } });
} catch (writeErr) {


try { roDeleteRequestOrderById_(ss, requestOrderId); } catch (compErr) { }
return jsonResponse_({ success: false, error: 'REQUEST_ORDER_WRITE_FAILED:' + (writeErr && writeErr.message ? writeErr.message : writeErr), stage: 'write', compensated: true });
}
}












function handleUpdateRequestOrderStatus_(body) {
return roLockedMutation_('status', body, function (tx) { return roUpdateStatus_(body, tx); });
}
function roUpdateStatus_(body, tx) {
var roId = String((body && body.request_order_id) || '').trim();
var transition = String((body && body.transition) || '').trim();
var actor = String((body && body.actor) || 'operation-system').trim();
var reason = String((body && body.rejected_reason) || '').trim();
if (!roId) return jsonResponse_({ success: false, error: 'Missing request_order_id', zero_write: true });
var VALID = ['submit', 'approve', 'reject', 'cancel', 'done'];
if (VALID.indexOf(transition) === -1) {
return jsonResponse_({ success: false, error: 'Invalid transition. Valid: ' + VALID.join(', '), zero_write: true });
}
if (transition === 'reject' && !reason) {
return jsonResponse_({ success: false, error: 'rejected_reason is required to reject', zero_write: true });
}

var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName('request_orders');
if (!sheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found', zero_write: true });

roRequireColumns_(sheet, ['request_status', 'tier_group', 'completed_by', 'completed_at', 'updated_by', 'updated_at']);

var ref = procurementFindRow_(sheet, 'request_order_id', roId);
if (!ref) return jsonResponse_({ success: false, error: 'Request order not found: ' + roId, zero_write: true });
var col = ref.col;
var curStatus = procurementReqStatus_(ref);
if ((transition === 'submit' && curStatus === 'draft') || (transition === 'approve' && curStatus === 'pending_approval')) {
var positive = roPositiveLines_(ss, roId);
if (!positive.ok) return jsonResponse_(positive);
}
var now = procurementTimestamp_();
function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(ref.row, c + 1).setValue(value); }

function setStatus(value) { setCell('request_status', value); }

if (transition === 'submit') {
if (curStatus !== 'draft') return jsonResponse_({ success: false, error: 'Only a Draft request can be submitted (current: ' + curStatus + ')', zero_write: true });
var wasRejected = col('rejected_at') !== -1 && String(ref.vals[col('rejected_at')]).trim() !== '';
if (wasRejected) {
var curVer = col('request_order_version') !== -1 ? (parseFloat(ref.vals[col('request_order_version')]) || 1) : 1;
setCell('request_order_version', curVer + 1);
setCell('rejected_by', ''); setCell('rejected_at', ''); setCell('rejected_reason', '');
}
setStatus('pending_approval');
setCell('submitted_by', actor);
setCell('submitted_at', now);
} else if (transition === 'approve') {
if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval request can be approved (current: ' + curStatus + ')', zero_write: true });
setStatus('approved');
setCell('approved_by', actor);
setCell('approved_at', now);
} else if (transition === 'reject') {
if (curStatus !== 'pending_approval') return jsonResponse_({ success: false, error: 'Only a Pending Approval request can be rejected (current: ' + curStatus + ')', zero_write: true });
var verForNote = col('request_order_version') !== -1 ? (parseFloat(ref.vals[col('request_order_version')]) || 1) : 1;
setCell('rejected_by', actor);
setCell('rejected_at', now);
setCell('rejected_reason', reason);
if (col('note') !== -1) {
var existingNote = String(ref.vals[col('note')] || '').trim();
var appended = '[REJECTED v' + verForNote + ' @' + now + '] ' + reason;
setCell('note', existingNote ? (existingNote + '\n' + appended) : appended);
}
setStatus('draft');
} else if (transition === 'cancel') {
if (curStatus !== 'draft' && curStatus !== 'pending_approval') {
return jsonResponse_({ success: false, error: 'Only a Draft or Pending Approval request can be cancelled (current: ' + curStatus + ')', zero_write: true });
}
setStatus('cancelled');
setCell('cancelled_by', actor);
setCell('cancelled_at', now);
} else if (transition === 'done') {
if (curStatus !== 'approved' && curStatus !== 'converted_to_po') {
return jsonResponse_({ success: false, error: 'Only an Approved / Converted request can be marked Done (current: ' + curStatus + ')', zero_write: true });
}
setCell('completed_by', actor);
setCell('completed_at', now);
}


if (transition === 'submit') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'submitted' });
else if (transition === 'approve') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'approved' });
else if (transition === 'reject') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'draft' });
else if (transition === 'cancel') procurementUpdateRequestLines_(ss, roId, { lineStatus: 'cancelled' });

setCell('updated_by', actor);
setCell('updated_at', now);

return jsonResponse_({ success: true, data: { request_order_id: roId, transition: transition } });
}



function procurementUpdateRequestLines_(ss, roId, opts) {
var sh = ss.getSheetByName('request_order_lines');
if (!sh) return;
roRequireColumns_(sh, ['line_status', 'updated_at']);
var data = sh.getDataRange().getValues();
if (data.length < 2) return;
var h = data[0].map(function (x) { return String(x).trim(); });
var roCol = h.indexOf('request_order_id'), lsCol = h.indexOf('line_status'), upCol = h.indexOf('updated_at');
if (roCol === -1) return;
var now = procurementTimestamp_();
for (var i = 1; i < data.length; i++) {
if (String(data[i][roCol]).trim() !== roId) continue;



if (lsCol !== -1 && String(data[i][lsCol]).trim() === 'cancelled') continue;
if (opts.lineStatus && lsCol !== -1) sh.getRange(i + 1, lsCol + 1).setValue(opts.lineStatus);
if (upCol !== -1) sh.getRange(i + 1, upCol + 1).setValue(now);
}
}







function procurementSiteFieldsByCompany_(ss) {
var map = {};
function key(sku, co) { return String(sku || '').trim().toLowerCase() + '|' + String(co || '').trim().toLowerCase(); }
var FIELDS = ['site_sku', 'marketplace_product_id', 'country', 'marketplace', 'warehouse_id', 'ownership_company'];
function ingest(sheetName, aliases) {
var sh = ss.getSheetByName(sheetName); if (!sh) return;
var d = sh.getDataRange().getValues(); if (d.length < 2) return;
var h = d[0].map(function (x) { return String(x).trim().toLowerCase(); });
var ci = {};
Object.keys(aliases).forEach(function (f) {
aliases[f].some(function (a) { var idx = h.indexOf(a); if (idx !== -1) { ci[f] = idx; return true; } return false; });
});
if (ci.sku === undefined || ci.company === undefined) return;
for (var i = 1; i < d.length; i++) {
var sku = String(d[i][ci.sku] || '').trim(), co = String(d[i][ci.company] || '').trim();
if (!sku || !co) continue;
var k = key(sku, co);
var cur = map[k] || (map[k] = { site_sku: '', marketplace_product_id: '', country: '', marketplace: '', warehouse_id: '', ownership_company: '' });
FIELDS.forEach(function (f) { if (!cur[f] && ci[f] !== undefined) { var v = String(d[i][ci[f]] || '').trim(); if (v) cur[f] = v; } });
}
}
ingest('marketplace_skus', { sku: ['sku'], company: ['company'], site_sku: ['site_sku'], marketplace_product_id: ['marketplace_product_id', 'asin'], country: ['country'], marketplace: ['marketplace'], warehouse_id: ['warehouse_id'], ownership_company: ['ownership_company'] });
ingest('sku_regional_details', { sku: ['sku'], company: ['company'], site_sku: ['site_sku'], marketplace_product_id: ['marketplace_product_id', 'asin'], country: ['country'], marketplace: ['marketplace'], warehouse_id: ['warehouse_id'], ownership_company: ['ownership_company'] });
return map;
}














function handleUpdateRequestOrderLineQty_(body) {
return roLockedMutation_('edit', body, function (tx) { return roUpdateLineQty_(body, tx); });
}
function roUpdateLineQty_(body, tx) {
var reqLines = (body && body.lines) || [];
if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var lineSheet = ss.getSheetByName('request_order_lines');
var roSheet = ss.getSheetByName('request_orders');
if (!lineSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found' });
if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });


var roData = roSheet.getDataRange().getValues();
var roHeaders = roData[0].map(function (h) { return String(h).trim(); });
var roIdCol = roHeaders.indexOf('request_order_id');
var roReqStatusCol = roHeaders.indexOf('request_status');
var roStatusCol = roHeaders.indexOf('status');
var statusById = {};
for (var p = 1; p < roData.length; p++) {
if (roIdCol === -1) continue;
var rs = roReqStatusCol !== -1 ? String(roData[p][roReqStatusCol]).trim() : '';
if (!rs && roStatusCol !== -1) rs = String(roData[p][roStatusCol]).trim();
statusById[String(roData[p][roIdCol]).trim()] = rs;
}

var data = lineSheet.getDataRange().getValues();
if (data.length < 2) return jsonResponse_({ success: false, error: 'request_order_lines is empty' });
var headers = data[0].map(function (h) { return String(h).trim(); });
var col = function (n) { return headers.indexOf(n); };
var idCol = col('request_order_line_id');
var roLineIdCol = col('request_order_id');
var approvedCol = col('approved_qty');
var cartonCol = col('carton_qty');
var upcCol = col('units_per_carton');
var unitCostCol = col('unit_cost');
var estCol = col('estimated_amount');
var updatedCol = col('updated_at');
var inspCol = col('inspection_date');
var readyCol = col('expected_ready_date');
var shipCol = col('expected_ship_date');
var noteCol = col('note');
var companyCol = col('company');
var skuCol = col('sku'), bucketCol = col('request_bucket'), monthCol = col('request_month');
var kmCol = col('km_qty'), resusCol = col('resus_qty'), restwCol = col('restw_qty');
var lineStatusCol = col('line_status');
if (idCol === -1) return jsonResponse_({ success: false, error: 'request_order_line_id column not found' });

var rowById = {};
for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };



var seriesCol = col('series'), supIdCol = col('supplier_id'), supNameCol = col('supplier_name'), supSkuCol = col('supplier_sku');
var factItemNoCol = col('factory_item_no'), factItemNameCol = col('factory_item_name'), supWhCol = col('supplier_warehouse_id');
var currencyCol = col('currency'), calcMethodCol = col('calculation_method'), recQtyCol = col('recommended_qty'), reqQtyCol = col('requested_qty');
function findSiblingLine_(roId2, sku2, bucket2) {
for (var k = 1; k < data.length; k++) {
if (roLineIdCol !== -1 && String(data[k][roLineIdCol]).trim() !== roId2) continue;
if (skuCol !== -1 && nl_(data[k][skuCol]) !== nl_(sku2)) continue;
if (bucketCol !== -1 && bucket2 && nl_(data[k][bucketCol]) !== nl_(bucket2)) continue;
if (lineStatusCol !== -1 && nl_(data[k][lineStatusCol]) === 'cancelled') continue;
return data[k];
}
return null;
}

var siteFieldsMap = null;
function siteFieldsFor_(sku2, company2) {
if (siteFieldsMap === null) siteFieldsMap = procurementSiteFieldsByCompany_(ss);
return siteFieldsMap[nl_(sku2) + '|' + nl_(company2)] || null;
}







function nl_(v) { return String(v == null ? '' : v).trim().toLowerCase(); }
var srcSheet = ss.getSheetByName('request_order_line_sources');
var srcByLineId = null, srcApprovedCol = -1, srcUpdatedCol = -1, srcUpdatedCount = 0;


var srcSiblingByKey = null;
var warnings = [];
if (srcSheet) {
var sData = srcSheet.getDataRange().getValues();
if (sData.length >= 2) {
var sH = sData[0].map(function (x) { return String(x).trim(); });
function sc(n) { return sH.indexOf(n); }
var sLineIdCol = sc('request_order_line_id');
var sSkuCol = sc('sku'), sCompanyCol = sc('company'), sTierCol = sc('tier_type'), sBucketCol = sc('source_bucket'), sMonthCol = sc('source_month');
var sSiteSkuCol = sc('site_sku'), sMpidCol = sc('marketplace_product_id'), sCountryCol = sc('country'), sMktCol = sc('marketplace'), sOwnerCol = sc('ownership_company'), sWhCol = sc('warehouse_id');
srcApprovedCol = sc('approved_qty');
srcUpdatedCol = sc('updated_at');
if (sLineIdCol !== -1 && srcApprovedCol !== -1) {
srcByLineId = {};
srcSiblingByKey = {};
for (var si = 1; si < sData.length; si++) {
var lid = String(sData[si][sLineIdCol]).trim();
if (lid) {
(srcByLineId[lid] = srcByLineId[lid] || []).push({
rowIndex: si + 1,
sku: sSkuCol !== -1 ? sData[si][sSkuCol] : '',
company: sCompanyCol !== -1 ? sData[si][sCompanyCol] : '',
tier: sTierCol !== -1 ? sData[si][sTierCol] : (sBucketCol !== -1 ? sData[si][sBucketCol] : ''),
month: sMonthCol !== -1 ? sData[si][sMonthCol] : ''
});
}

var kSku = sSkuCol !== -1 ? nl_(sData[si][sSkuCol]) : '';
var kBucket = sTierCol !== -1 ? nl_(sData[si][sTierCol]) : (sBucketCol !== -1 ? nl_(sData[si][sBucketCol]) : '');
var kCo = sCompanyCol !== -1 ? nl_(sData[si][sCompanyCol]) : '';
if (kSku && kCo) {
var sk = kSku + '|' + kBucket + '|' + kCo;
var cur = srcSiblingByKey[sk] || (srcSiblingByKey[sk] = { site_sku: '', marketplace_product_id: '', country: '', marketplace: '', ownership_company: '', warehouse_id: '' });
function fill_(f, ci2) { if (!cur[f] && ci2 !== -1) { var v = String(sData[si][ci2] || '').trim(); if (v) cur[f] = v; } }
fill_('site_sku', sSiteSkuCol); fill_('marketplace_product_id', sMpidCol); fill_('country', sCountryCol);
fill_('marketplace', sMktCol); fill_('ownership_company', sOwnerCol); fill_('warehouse_id', sWhCol);
}
}
}
}
} else {
warnings.push('request_order_line_sources tab not found — request_order_lines updated only.');
}



function syncLineSourceApproved_(lineId, sku, company, bucket, month, approvedQty) {
if (!srcByLineId) return;
var candidates = srcByLineId[lineId] || [];
if (!candidates.length) { warnings.push('Line ' + lineId + ': no matching request_order_line_sources row (request_order_lines updated; source unchanged).'); return; }

var filtered = candidates.filter(function (cd) {
if (sku && String(cd.sku).trim() && nl_(cd.sku) !== nl_(sku)) return false;
if (company && String(cd.company).trim() && nl_(cd.company) !== nl_(company)) return false;
if (bucket && String(cd.tier).trim() && nl_(cd.tier) !== nl_(bucket)) return false;
return true;
});
if (!filtered.length) filtered = candidates;

if (month) {
var mm = filtered.filter(function (cd) { return String(cd.month).trim() && nl_(cd.month) === nl_(month); });
if (mm.length) filtered = mm;
}
filtered.forEach(function (cd) {
srcSheet.getRange(cd.rowIndex, srcApprovedCol + 1).setValue(approvedQty);
if (srcUpdatedCol !== -1) srcSheet.getRange(cd.rowIndex, srcUpdatedCol + 1).setValue(now);
srcUpdatedCount++;
});
if (filtered.length > 1) {
warnings.push('Line ' + lineId + ': ' + filtered.length + ' source rows matched — each set to approved_qty=' + approvedQty + ' (same company/SKU/tier decision qty; no proportional split).');
}
}

var now = procurementTimestamp_();
var updated = 0, skipped = 0, createdLines = 0;
var affectedRoIds = {};





function createManualAllocLine_(rq) {
var roId = String(rq.request_order_id || '').trim();
var sku = String(rq.sku || '').trim();
var company = String(rq.company || '').trim();
if (!roId || !sku || !company) return null;
if (statusById[roId] !== 'draft') return null;
var approved = parseFloat(rq.approved_qty); if (isNaN(approved) || approved < 0) approved = 0;
if (approved <= 0) return null;
var bucket = String(rq.request_bucket || '').trim();


var sib = findSiblingLine_(roId, sku, bucket);
function sibStr(c) { return (sib && c !== -1) ? String(sib[c] || '').trim() : ''; }
function sibNum(c) { return (sib && c !== -1) ? (parseFloat(sib[c]) || 0) : 0; }


var upc = parseFloat(rq.units_per_carton) || 0;
if (!upc) upc = sibNum(upcCol);
var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
var month = String(rq.request_month || '').trim() || sibStr(monthCol);

var inspection = procurementDateOnly_(String(rq.inspection_date || '').trim() || (sib && inspCol !== -1 ? sib[inspCol] : ''));
var readyDate = procurementDateOnly_(String(rq.expected_ready_date || '').trim() || (sib && readyCol !== -1 ? sib[readyCol] : ''));
var shipDate = procurementDateOnly_(String(rq.expected_ship_date || '').trim() || (sib && shipCol !== -1 ? sib[shipCol] : ''));
var note = String(rq.note || '').trim() || sibStr(noteCol);
var cq = procurementCompanyQty_(company, approved);
var newLineId = 'ROL-' + Utilities.getUuid().substring(0, 10).toUpperCase();
tx.intent('request_order_lines', newLineId);


procurementAppendByHeader_(lineSheet, {
request_order_line_id: newLineId,
request_order_id: roId,
sku: sku,
series: sibStr(seriesCol),
company: company,
request_bucket: bucket,
request_month: month,
inspection_date: inspection,
expected_ready_date: readyDate,
expected_ship_date: shipDate,
requested_qty: 0,
approved_qty: approved,
km_qty: cq.km_qty, resus_qty: cq.resus_qty, restw_qty: cq.restw_qty,
recommended_qty: '',
units_per_carton: upc,
carton_qty: carton,
supplier_id: sibStr(supIdCol),
supplier_name: sibStr(supNameCol),
supplier_sku: sibStr(supSkuCol),
factory_item_no: sibStr(factItemNoCol),
factory_item_name: sibStr(factItemNameCol),
supplier_warehouse_id: sibStr(supWhCol),
unit_cost: sib && unitCostCol !== -1 ? sib[unitCostCol] : '',
currency: sibStr(currencyCol),
calculation_method: sibStr(calcMethodCol) || 'manual_order_allocation',
line_status: 'draft',
note: note,
created_at: now,
updated_at: now
});

if (srcSheet) {


var sf = (srcSiblingByKey && srcSiblingByKey[nl_(sku) + '|' + nl_(bucket) + '|' + nl_(company)]) || null;
if (!sf || !sf.site_sku) {
var mf = siteFieldsFor_(sku, company);
if (mf) {
sf = sf || { site_sku: '', marketplace_product_id: '', country: '', marketplace: '', ownership_company: '', warehouse_id: '' };
['site_sku', 'marketplace_product_id', 'country', 'marketplace', 'ownership_company', 'warehouse_id'].forEach(function (f) { if (!sf[f] && mf[f]) sf[f] = mf[f]; });
}
}
sf = sf || {};
var sid = 'ROLS-' + Utilities.getUuid().substring(0, 10).toUpperCase();
tx.intent('request_order_line_sources', sid);
procurementAppendByHeader_(srcSheet, {
request_order_line_source_id: sid,
line_source_id: sid,
request_order_line_id: newLineId,
request_order_id: roId,
sku: sku,
company: company,
country: sf.country || '',
marketplace: sf.marketplace || '',
ownership_company: sf.ownership_company || '',
warehouse_id: sf.warehouse_id || '',
site_sku: sf.site_sku || '',
marketplace_product_id: sf.marketplace_product_id || '',
tier_type: bucket,
source_month: month,
requested_qty: 0,
approved_qty: approved,
allocation_method: 'manual_order_allocation',
source_bucket: bucket,
source_priority: procurementSourcePriority_(bucket),
source_type: 'manual_reallocation',
created_at: now,
updated_at: now
});
}
return { roId: roId, lineId: newLineId };
}

for (var r = 0; r < reqLines.length; r++) {
var rq = reqLines[r] || {};

if (rq.new_line) {
var np = createManualAllocLine_(rq);
if (np) { createdLines++; updated++; affectedRoIds[np.roId] = true; }
else skipped++;
continue;
}
var lineId = String(rq.request_order_line_id || '').trim();
if (!lineId || !rowById[lineId]) { skipped++; continue; }
var ent = rowById[lineId];
var parentId = roLineIdCol !== -1 ? String(ent.vals[roLineIdCol]).trim() : '';
if (statusById[parentId] !== 'draft') { skipped++; continue; }

if (lineStatusCol !== -1 && String(ent.vals[lineStatusCol]).trim() === 'cancelled') { skipped++; continue; }

if (rq.approved_qty !== undefined) {
var approved = parseFloat(rq.approved_qty); if (isNaN(approved) || approved < 0) approved = 0;
var upc = upcCol !== -1 ? (parseFloat(ent.vals[upcCol]) || 0) : 0;
var carton = (upc > 0) ? Math.ceil(approved / upc) : 0;
if (approvedCol !== -1) lineSheet.getRange(ent.row, approvedCol + 1).setValue(approved);
if (cartonCol !== -1) lineSheet.getRange(ent.row, cartonCol + 1).setValue(carton);
var uc = unitCostCol !== -1 ? parseFloat(ent.vals[unitCostCol]) : NaN;
if (estCol !== -1 && !isNaN(uc)) lineSheet.getRange(ent.row, estCol + 1).setValue(Math.round(approved * uc * 100) / 100);

var lineCompany = companyCol !== -1 ? String(ent.vals[companyCol] || '').trim() : '';
var cq = procurementCompanyQty_(lineCompany, approved);
if (kmCol !== -1) lineSheet.getRange(ent.row, kmCol + 1).setValue(cq.km_qty);
if (resusCol !== -1) lineSheet.getRange(ent.row, resusCol + 1).setValue(cq.resus_qty);
if (restwCol !== -1) lineSheet.getRange(ent.row, restwCol + 1).setValue(cq.restw_qty);

var lineSku = skuCol !== -1 ? String(ent.vals[skuCol] || '').trim() : '';
var lineBucket = bucketCol !== -1 ? String(ent.vals[bucketCol] || '').trim() : '';
var lineMonth = monthCol !== -1 ? String(ent.vals[monthCol] || '').trim() : '';
syncLineSourceApproved_(lineId, lineSku, lineCompany, lineBucket, lineMonth, approved);
}

if (rq.inspection_date !== undefined && inspCol !== -1) lineSheet.getRange(ent.row, inspCol + 1).setValue(String(rq.inspection_date || '').trim());
if (rq.expected_ready_date !== undefined && readyCol !== -1) lineSheet.getRange(ent.row, readyCol + 1).setValue(String(rq.expected_ready_date || '').trim());
if (rq.expected_ship_date !== undefined && shipCol !== -1) lineSheet.getRange(ent.row, shipCol + 1).setValue(String(rq.expected_ship_date || '').trim());
if (rq.note !== undefined && noteCol !== -1) lineSheet.getRange(ent.row, noteCol + 1).setValue(String(rq.note || '').trim());
if (updatedCol !== -1) lineSheet.getRange(ent.row, updatedCol + 1).setValue(now);
if (parentId) affectedRoIds[parentId] = true;
updated++;
}


Object.keys(affectedRoIds).forEach(function (id) { procurementRecalcRequestTotals_(ss, id); });

return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped, created_lines: createdLines, sources_updated: srcUpdatedCount, warnings: warnings } });
}


function procurementRecalcRequestTotals_(ss, requestOrderId) {
var lineSheet = ss.getSheetByName('request_order_lines');
var roSheet = ss.getSheetByName('request_orders');
if (!lineSheet || !roSheet) return;
var data = lineSheet.getDataRange().getValues();
if (data.length < 2) return;
var h = data[0].map(function (x) { return String(x).trim(); });
var roIdCol = h.indexOf('request_order_id'), aCol = h.indexOf('approved_qty'), cCol = h.indexOf('carton_qty'), ucCol = h.indexOf('unit_cost'), lsCol = h.indexOf('line_status'), skCol = h.indexOf('sku');
if (roIdCol === -1) return;
var distinctSku = {}, totalQty = 0, totalCartons = 0, est = 0;
for (var i = 1; i < data.length; i++) {
if (String(data[i][roIdCol]).trim() !== requestOrderId) continue;
if (lsCol !== -1 && String(data[i][lsCol]).trim() === 'cancelled') continue;
var sku = skCol !== -1 ? String(data[i][skCol] || '').trim() : '';
if (sku) distinctSku[sku.toLowerCase()] = 1;
var q = aCol !== -1 ? (parseFloat(data[i][aCol]) || 0) : 0;
totalQty += q;
totalCartons += cCol !== -1 ? (parseFloat(data[i][cCol]) || 0) : 0;
var uc = ucCol !== -1 ? parseFloat(data[i][ucCol]) : NaN;
if (!isNaN(uc)) est += q * uc;
}
var ref = procurementFindRow_(roSheet, 'request_order_id', requestOrderId);
if (!ref) return;
function setCell(name, value) { var c = ref.col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(value); }
setCell('total_sku', Object.keys(distinctSku).length);
setCell('total_qty', totalQty);
setCell('total_cartons', totalCartons);
setCell('estimated_amount', est > 0 ? Math.round(est * 100) / 100 : '');
}












function handleCancelRequestOrderTier_(body) {
return roLockedMutation_('cancel_tier', body, function (tx) { return roCancelTier_(body, tx); });
}
function roCancelTier_(body, tx) {
var ids = (body && body.request_order_line_ids) || [];
if (!ids.length) return jsonResponse_({ success: false, error: 'request_order_line_ids required' });
var actor = String((body && body.actor) || 'operation-system').trim();

var ss = SpreadsheetApp.getActiveSpreadsheet();
var lineSheet = ss.getSheetByName('request_order_lines');
var roSheet = ss.getSheetByName('request_orders');
if (!lineSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found' });
if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found' });
roRequireColumns_(lineSheet, ['line_status', 'updated_at']);
roRequireColumns_(roSheet, ['request_status']);

var data = lineSheet.getDataRange().getValues();
if (data.length < 2) return jsonResponse_({ success: false, error: 'request_order_lines is empty' });
var h = data[0].map(function (x) { return String(x).trim(); });
var idCol = h.indexOf('request_order_line_id'), roCol = h.indexOf('request_order_id'),
lsCol = h.indexOf('line_status'), upCol = h.indexOf('updated_at');
if (idCol === -1 || roCol === -1) return jsonResponse_({ success: false, error: 'required columns not found' });


var roData = roSheet.getDataRange().getValues();
var rh = roData[0].map(function (x) { return String(x).trim(); });
var rIdCol = rh.indexOf('request_order_id'), rReqStatusCol = rh.indexOf('request_status'), rStatusCol = rh.indexOf('status');
var roStatus = {};
for (var p = 1; p < roData.length; p++) {
if (rIdCol === -1) continue;
var rsv = rReqStatusCol !== -1 ? String(roData[p][rReqStatusCol]).trim() : '';
if (!rsv && rStatusCol !== -1) rsv = String(roData[p][rStatusCol]).trim();
roStatus[String(roData[p][rIdCol]).trim()] = rsv;
}

var idSet = {}; ids.forEach(function (x) { idSet[String(x).trim()] = 1; });
var now = procurementTimestamp_();
var cancelled = 0, skipped = 0;
var affectedRoIds = {};
for (var i = 1; i < data.length; i++) {
var lid = String(data[i][idCol]).trim();
if (!idSet[lid]) continue;
var parent = String(data[i][roCol]).trim();
if (roStatus[parent] !== 'draft') { skipped++; continue; }
if (lsCol !== -1) lineSheet.getRange(i + 1, lsCol + 1).setValue('cancelled');
if (upCol !== -1) lineSheet.getRange(i + 1, upCol + 1).setValue(now);
affectedRoIds[parent] = true;
cancelled++;
}


var fresh = lineSheet.getDataRange().getValues();
var fh = fresh[0].map(function (x) { return String(x).trim(); });
var fRo = fh.indexOf('request_order_id'), fLs = fh.indexOf('line_status');
var fullyCancelled = [];
Object.keys(affectedRoIds).forEach(function (roId) {
var total = 0, active = 0;
for (var i = 1; i < fresh.length; i++) {
if (String(fresh[i][fRo]).trim() !== roId) continue;
total++;
if (!(fLs !== -1 && String(fresh[i][fLs]).trim() === 'cancelled')) active++;
}
if (total > 0 && active === 0) {
var ref = procurementFindRow_(roSheet, 'request_order_id', roId);
if (ref) {
function setRo(name, val) { var c = ref.col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(val); }
setRo('request_status', 'cancelled');
setRo('cancelled_by', actor);
setRo('cancelled_at', now);
setRo('updated_by', actor);
setRo('updated_at', now);
fullyCancelled.push(roId);
}
} else {
procurementRecalcRequestTotals_(ss, roId);
}
});

return jsonResponse_({ success: true, data: { cancelled_lines: cancelled, skipped: skipped, cancelled_requests: fullyCancelled } });
}




















function handleCreatePurchaseOrderFromRequest_(body) {
return roLockedMutation_('convert', body, function (tx) { return roCreatePurchaseOrder_(body, tx); });
}

// Explicit conversion setup fills commercial data from the maintained master, never from UI prices.
// Approved Request quantities/sources remain untouched; the selected quote is frozen on the new PO.
var PO_PURCHASE_SETUP_CONTRACT_VERSION_ = 1;
function poResolvePurchaseSetup_(ss, setup, data, lc, groups, today) {
function str(v) { return String(v == null ? '' : v).trim(); }
function fail(code, sku) { return { ok: false, error: code, detail: sku || '', zero_write: true, stage: 'purchase_setup' }; }
if (!setup || typeof setup !== 'object' || Array.isArray(setup)) return fail('PO_PURCHASE_SETUP_INVALID');
var warehouseId = str(setup.warehouse_id), supplierId = str(setup.supplier_id), supplierName = str(setup.supplier_name);
var fw = procurementFactoryMap_(ss)[warehouseId.toLowerCase()];
if (!fw || !fw.isFactory || !fw.isActive) return fail('PO_ACTIVE_FACTORY_REQUIRED');
if (!supplierId && !supplierName) return fail('PO_SUPPLIER_REQUIRED');
var sheet = ss.getSheetByName('supplier_price_list');
if (!sheet) return fail('PO_SUPPLIER_PRICE_MASTER_MISSING');
var grid = sheet.getDataRange().getValues(), headers = (grid[0] || []).map(str);
if (['sku', 'unit_cost', 'currency'].some(function (key) { return headers.indexOf(key) < 0; })) return fail('PO_SUPPLIER_PRICE_COLUMNS_MISSING');
function value(row, key) {
var at = headers.indexOf(key), v = at < 0 ? '' : row[at];
if (key === 'supplier_name' && !str(v)) { at = headers.indexOf('supplier_name_snapshot'); v = at < 0 ? '' : row[at]; }
return v;
}
function date(v) {
if (v === '' || v == null) return '';
var day = procurementDateOnly_(v);
return /^\d{4}-\d{2}-\d{2}$/.test(day) && !isNaN(Date.parse(day)) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day ? day : null;
}
var rows = grid.slice(1).filter(function (row) {
return supplierId ? str(value(row, 'supplier_id')) === supplierId : str(value(row, 'supplier_name')) === supplierName;
});
var identities = {};
rows.forEach(function (row) { identities[JSON.stringify([str(value(row, 'supplier_id')), str(value(row, 'supplier_name'))])] = 1; });
if (Object.keys(identities).length !== 1) return fail('PO_SUPPLIER_IDENTITY_MISSING_OR_AMBIGUOUS');
var identity = JSON.parse(Object.keys(identities)[0]);
if (!identity[1] || (supplierName && supplierName !== identity[1])) return fail('PO_SUPPLIER_IDENTITY_MISMATCH');
var result = { ok: true, warehouseId: fw.warehouseId, supplierId: identity[0], supplierName: identity[1], currency: '', byRow: {}, priceIds: [] };
var members = groups.T1.concat(groups.T2_T3), totalAmount = 0;
for (var i = 0; i < members.length; i++) {
var rowIndex = members[i].rowIndex, sku = str(data[rowIndex][lc('sku')]);
var candidates = [];
for (var j = 0; j < rows.length; j++) {
var r = rows[j];
if (str(value(r, 'sku')) !== sku) continue;
var active = str(value(r, 'is_active')).toLowerCase();
if (active && active !== 'true' && active !== '1' && active !== 'active' && active !== 'yes') continue;
var wh = str(value(r, 'supplier_warehouse_id'));
if (wh && wh !== result.warehouseId) continue;
var from = date(value(r, 'effective_from')), to = date(value(r, 'effective_to'));
if (from === null || to === null || (from && to && from > to)) return fail('PO_SUPPLIER_PRICE_DATE_INVALID', sku);
if ((from && from > today) || (to && to < today)) continue;
candidates.push({ row: r, from: from });
}
if (!candidates.length) return fail('PO_SUPPLIER_PRICE_NOT_FOUND', sku);
candidates.sort(function (a, b) { return b.from.localeCompare(a.from); });
if (candidates.length > 1 && candidates[0].from === candidates[1].from) return fail('PO_SUPPLIER_PRICE_AMBIGUOUS', sku);
var price = candidates[0].row, raw = value(price, 'unit_cost');
var cost = Number(raw), currency = str(value(price, 'currency')).toUpperCase();
if (raw == null || (typeof raw !== 'number' && typeof raw !== 'string') || !/^(?:\d+\.?\d*|\.\d+)$/.test(str(raw)) || !isFinite(cost) || cost < 0 || cost > Number.MAX_SAFE_INTEGER) return fail('PO_SUPPLIER_PRICE_INVALID', sku);
if (!/^[A-Z]{3}$/.test(currency)) return fail('PO_SUPPLIER_CURRENCY_INVALID', sku);
if (result.currency && result.currency !== currency) return fail('PO_SUPPLIER_CURRENCY_CONFLICT', sku);
var amount = Number(data[rowIndex][lc('approved_qty')]) * cost;
if (!isFinite(amount) || amount > Number.MAX_SAFE_INTEGER / 100) return fail('PO_SUPPLIER_AMOUNT_INVALID', sku);
totalAmount += Math.round(amount * 100);
if (!isFinite(totalAmount) || totalAmount > Number.MAX_SAFE_INTEGER) return fail('PO_SUPPLIER_AMOUNT_INVALID', sku);
result.currency = currency;
result.byRow[rowIndex] = { unitCost: cost, currency: currency, supplierSku: str(value(price, 'supplier_sku')) };
var priceId = str(value(price, 'supplier_price_id') || value(price, 'price_id'));
if (priceId && result.priceIds.indexOf(priceId) < 0) result.priceIds.push(priceId);
}
var facts = members.map(function (m) {
var p = result.byRow[m.rowIndex];
return { request_order_line_id: str(data[m.rowIndex][lc('request_order_line_id')]), sku: str(data[m.rowIndex][lc('sku')]),
quantity: Number(data[m.rowIndex][lc('approved_qty')]), supplier_sku: p.supplierSku, unit_cost: p.unitCost, currency: p.currency };
});
result.preview = { warehouse_id: result.warehouseId, supplier_id: result.supplierId, supplier_name: result.supplierName,
currency: result.currency, lines: facts, price_ids: result.priceIds, as_of: today };
result.checksum = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(result.preview), Utilities.Charset.UTF_8)
.map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
return result;
}

function roCreatePurchaseOrder_(body, tx) {
var roId = String((body && body.request_order_id) || '').trim();
var actor = String((body && body.actor) || 'operation-system').trim();
if (!roId) return jsonResponse_({ success: false, error: 'Missing request_order_id', zero_write: true });
if (body.purchase_setup_preview === true && body.purchase_setup === undefined) return jsonResponse_({ success: false, error: 'PO_PURCHASE_SETUP_REQUIRED', zero_write: true });



var ss = SpreadsheetApp.getActiveSpreadsheet();
var roSheet = ss.getSheetByName('request_orders');
var rolSheet = ss.getSheetByName('request_order_lines');
if (!roSheet) return jsonResponse_({ success: false, error: 'request_orders sheet not found', zero_write: true });
if (!rolSheet) return jsonResponse_({ success: false, error: 'request_order_lines sheet not found', zero_write: true });
roRequireColumns_(roSheet, ['request_status']);


var ref = procurementFindRow_(roSheet, 'request_order_id', roId);
if (!ref) return jsonResponse_({ success: false, error: 'Request order not found: ' + roId, zero_write: true });
var col = ref.col;
var curStatus = procurementReqStatus_(ref);


if (curStatus !== 'approved' && curStatus !== 'converted_to_po') {
return jsonResponse_({ success: false, error: 'Only an Approved request can be converted (current: ' + curStatus + ')', zero_write: true });
}

var now = procurementTimestamp_();
var today = procurementToday_();

function roVal(name) { var c = col(name); return c !== -1 ? ref.vals[c] : ''; }
var company = String(roVal('company') || '').trim();
var supplierId = String(roVal('supplier_id') || '').trim();
var supplierName = String(roVal('supplier_name') || '').trim();

var warehouseId = '', factoryId = '';
var currency = String(roVal('currency') || '').trim();



roRequireColumns_(rolSheet, ['purchase_order_line_id']);
var data = rolSheet.getDataRange().getValues();
var positive = roPositiveLines_(ss, roId, data);
if (!positive.ok) return jsonResponse_(positive);
var lh = data[0].map(function (x) { return String(x).trim(); });
function lc(n) { return lh.indexOf(n); }
var poLineIdBackCol = lc('purchase_order_line_id');
var groups = { 'T1': [], 'T2_T3': [] };
for (var i = 1; i < data.length; i++) {
if (lc('request_order_id') === -1 || String(data[i][lc('request_order_id')]).trim() !== roId) continue;
var sku = lc('sku') !== -1 ? String(data[i][lc('sku')]).trim() : '';
if (!sku) continue;

var ls = lc('line_status') !== -1 ? String(data[i][lc('line_status')]).trim().toLowerCase() : '';
if (ls === 'cancelled') continue;
if (!positive.rows[i]) continue;
var bucket = lc('request_bucket') !== -1 ? String(data[i][lc('request_bucket')]).trim().toUpperCase() : '';
var groupKey = (bucket === 'T2' || bucket === 'T3') ? 'T2_T3' : 'T1';
groups[groupKey].push({ rowIndex: i, bucket: (bucket || 'T1') });
}
var expectedGroups = ['T1', 'T2_T3'].filter(function (g) { return groups[g].length; });
if (!expectedGroups.length) {
return jsonResponse_({ success: false, error: 'Request order has no active (non-cancelled) lines to convert', zero_write: true });
}


var det = poFindConversionState_(ss, roId, expectedGroups);


if (det.orphanPoIds.length) {
return jsonResponse_({ success: false, error: 'PO_CREATION_ATOMICITY_GAP', stage: 'detect',
detail: 'purchase_order_lines exist for ' + roId + ' whose purchase_order_id has no header (orphan partial write): ' + det.orphanPoIds.join(',') });
}

if (det.conflict) {
return jsonResponse_({ success: false, error: 'PO_CONVERSION_STATE_INCONSISTENT', stage: 'detect',
detail: 'duplicate/unexpected PO bucket group(s) for ' + roId + ': ' + det.conflictDetail.join('; ') });
}
var completeExisting = det.missingGroups.length === 0;


if (curStatus === 'converted_to_po') {


if (completeExisting) return poReuseResponse_(roId, det, { reused: true });
return jsonResponse_({ success: false, error: 'PO_CONVERSION_STATE_INCONSISTENT', stage: 'status',
detail: 'request is converted_to_po but the canonical PO result is incomplete (missing bucket group(s): ' + det.missingGroups.join(',') + ')' });
}

if (completeExisting) {


if (!(body && body.purchase_setup_preview === true)) poSetRoConverted_(roSheet, ref, actor, now);
return poReuseResponse_(roId, det, { reused: true, repaired: true });
}




var poWh = procurementResolveWarehouse_(ss, body && body.purchase_setup ? body.purchase_setup.warehouse_id : roVal('warehouse_id'),
body && body.purchase_setup ? '' : roVal('factory_id'), 'new');
if (!poWh.ok) return jsonResponse_({ success: false, error: poWh.reason, stage: 'warehouse', detail: poWh.value || '', zero_write: true });
warehouseId = poWh.warehouse_id; factoryId = warehouseId;
var fw = procurementFactoryMap_(ss)[warehouseId.toLowerCase()];
var ctx = { tx: tx, rolSheet: rolSheet, poLineIdBackCol: poLineIdBackCol, data: data, lc: lc,
now: now, today: today, roId: roId, actor: actor, company: company, supplierId: supplierId,
supplierName: supplierName, warehouseId: warehouseId, factoryId: factoryId, currency: currency,
factoryWh: (fw && fw.isFactory && fw.isActive) ? fw.warehouseId : '' };
if (body && body.purchase_setup !== undefined) {
if (det.presentSummaries.length) return jsonResponse_({ success: false, error: 'PO_PARTIAL_CONVERSION_SETUP_CONFLICT', zero_write: true });
var setup = poResolvePurchaseSetup_(ss, body.purchase_setup, data, lc, groups, today);
if (!setup.ok) return jsonResponse_(setup);
if (body.purchase_setup_preview === true) return jsonResponse_({ success: true, data: { purchase_setup_preview: setup.preview, quote_checksum: setup.checksum }, zero_write: true });
if (body.purchase_setup_checksum !== setup.checksum) return jsonResponse_({ success: false, error: 'PO_PURCHASE_SETUP_CHANGED_REVIEW_REQUIRED', zero_write: true, stage: 'purchase_setup' });
ctx.warehouseId = ctx.factoryId = ctx.factoryWh = setup.warehouseId;
ctx.supplierId = setup.supplierId; ctx.supplierName = setup.supplierName; ctx.currency = setup.currency;
ctx.commercialByRow = setup.byRow;
ctx.setupNote = 'Purchase setup confirmed by ' + actor + ' at ' + now + '; supplier_price_list: ' + (setup.priceIds.join(', ') || 'matched supplier/SKU/effective date');
}
var createdSummaries = [];
det.missingGroups.forEach(function (groupKey) {
var summary = poCreateBucketGroup_(ss, ctx, groupKey, groups[groupKey]);
createdSummaries.push(summary);
});


poSetRoConverted_(roSheet, ref, actor, now);

var allPos = det.presentSummaries.concat(createdSummaries)
.sort(function (a, b) { return (a.request_bucket === 'T1' ? 0 : 1) - (b.request_bucket === 'T1' ? 0 : 1); });
return jsonResponse_({ success: true, data: {
request_order_id: roId,
purchase_orders: allPos,
po_count: allPos.length,
purchase_order_id: allPos[0].purchase_order_id,
purchase_order_no: allPos[0].purchase_order_no,
reused: false,
recovered: det.presentSummaries.length > 0
} });

}





function poFindConversionState_(ss, roId, expectedGroups) {
function normGroup(b) { b = String(b || '').trim().toUpperCase(); return (b === 'T2' || b === 'T3' || b === 'T2_T3') ? 'T2_T3' : 'T1'; }
var expected = { 'T1': expectedGroups.indexOf('T1') !== -1, 'T2_T3': expectedGroups.indexOf('T2_T3') !== -1 };
var headersByGroup = { 'T1': [], 'T2_T3': [] };
var headerIds = {};
var poSheet = ss.getSheetByName('purchase_orders');
if (poSheet) {
var pd = poSheet.getDataRange().getValues();
if (pd.length >= 2) {
var ph = pd[0].map(function (x) { return String(x).trim(); });
var cRo = ph.indexOf('request_order_id'), cId = ph.indexOf('purchase_order_id'),
cNo = ph.indexOf('po_no'), cBucket = ph.indexOf('request_bucket'),
cStatus = ph.indexOf('order_status'), cQty = ph.indexOf('total_qty');
for (var i = 1; i < pd.length; i++) {
if (cRo === -1 || String(pd[i][cRo]).trim() !== roId) continue;
var poId = cId !== -1 ? String(pd[i][cId]).trim() : '';
if (poId) headerIds[poId] = 1;
var st = cStatus !== -1 ? String(pd[i][cStatus]).trim().toLowerCase() : '';
if (st === 'cancelled') continue;
var g = normGroup(cBucket !== -1 ? pd[i][cBucket] : 'T1');
var no = cNo !== -1 ? String(pd[i][cNo]).trim() : '';
headersByGroup[g].push({ purchase_order_id: poId, purchase_order_no: no, po_no: no,
request_bucket: g, total_qty: cQty !== -1 ? (parseFloat(pd[i][cQty]) || 0) : 0 });
}
}
}

var orphanPoIds = {};
var polSheet = ss.getSheetByName('purchase_order_lines');
if (polSheet) {
var ld = polSheet.getDataRange().getValues();
if (ld.length >= 2) {
var lhx = ld[0].map(function (x) { return String(x).trim(); });
var cLRo = lhx.indexOf('request_order_id'), cLPo = lhx.indexOf('purchase_order_id');
if (cLRo !== -1 && cLPo !== -1) {
for (var j = 1; j < ld.length; j++) {
if (String(ld[j][cLRo]).trim() !== roId) continue;
var lpo = String(ld[j][cLPo]).trim();
if (lpo && !headerIds[lpo]) orphanPoIds[lpo] = 1;
}
}
}
}
var conflict = false, conflictDetail = [];
// A landed header with missing children/backlinks is not a completed conversion to reuse.
var activePo = Object.create(null), polById = Object.create(null), childCount = Object.create(null), requestLines = Object.create(null), linkErrors = [];
['T1', 'T2_T3'].forEach(function (g) { headersByGroup[g].forEach(function (p) { activePo[p.purchase_order_id] = true; }); });
if (polSheet && ld && lhx) {
var idAt = lhx.indexOf('purchase_order_line_id'), parentAt = lhx.indexOf('purchase_order_id'), requestAt = lhx.indexOf('request_order_line_id');
for (var x = 1; x < ld.length; x++) {
var lineId = idAt >= 0 ? String(ld[x][idAt]).trim() : '', parentId = parentAt >= 0 ? String(ld[x][parentAt]).trim() : '';
if (lineId) { if (polById[lineId]) polById[lineId].duplicate = true; else polById[lineId] = { parent: parentId, requestLine: requestAt >= 0 ? String(ld[x][requestAt]).trim() : '' }; }
if (activePo[parentId]) childCount[parentId] = (childCount[parentId] || 0) + 1;
}
}
var requestSheet = ss.getSheetByName('request_order_lines');
if (requestSheet) {
var requests = requestSheet.getDataRange().getValues(), requestHeaders = requests[0] || [], requestIdAt = requestHeaders.indexOf('request_order_line_id'), roAt = requestHeaders.indexOf('request_order_id'), backAt = requestHeaders.indexOf('purchase_order_line_id');
for (var y = 1; y < requests.length; y++) {
if (roAt < 0 || String(requests[y][roAt]).trim() !== roId) continue;
var rid = requestIdAt >= 0 ? String(requests[y][requestIdAt]).trim() : '', back = backAt >= 0 ? String(requests[y][backAt] || '').trim() : '';
requestLines[rid] = back;
if (back && (!polById[back] || polById[back].duplicate || polById[back].requestLine !== rid)) linkErrors.push('invalid backlink ' + rid);
}
}
Object.keys(activePo).forEach(function (id) { if (!childCount[id]) linkErrors.push('header without lines ' + id); });
Object.keys(polById).forEach(function (id) { var line = polById[id]; if (activePo[line.parent] && (!line.requestLine || requestLines[line.requestLine] !== id || line.duplicate)) linkErrors.push('incomplete line linkage ' + id); });
if (linkErrors.length) { conflict = true; conflictDetail = conflictDetail.concat(linkErrors); }
['T1', 'T2_T3'].forEach(function (g) {
if (headersByGroup[g].length > 1) { conflict = true; conflictDetail.push(g + ' x' + headersByGroup[g].length); }
if (headersByGroup[g].length >= 1 && !expected[g]) { conflict = true; conflictDetail.push('unexpected ' + g); }
});
var presentGroups = [], presentSummaries = [], missingGroups = [];
expectedGroups.forEach(function (g) {
if (headersByGroup[g].length === 1) { presentGroups.push(g); presentSummaries.push(headersByGroup[g][0]); }
else if (headersByGroup[g].length === 0) missingGroups.push(g);

});
return { headersByGroup: headersByGroup, conflict: conflict, conflictDetail: conflictDetail,
orphanPoIds: Object.keys(orphanPoIds), presentGroups: presentGroups, presentSummaries: presentSummaries,
missingGroups: missingGroups };
}



function poCreateBucketGroup_(ss, ctx, groupKey, members) {
var poSheet = procurementEnsureSheet_(ss, 'purchase_orders', PURCHASE_ORDERS_HEADERS_);
var polSheet = procurementEnsureSheet_(ss, 'purchase_order_lines', PURCHASE_ORDER_LINES_HEADERS_);
var data = ctx.data, lc = ctx.lc, now = ctx.now, today = ctx.today, roId = ctx.roId, actor = ctx.actor;
function cellNum(row, name) { return lc(name) !== -1 ? (parseFloat(data[row][lc(name)]) || 0) : 0; }
function cellStr(row, name) { return lc(name) !== -1 ? String(data[row][lc(name)] || '').trim() : ''; }
function cellDate(row, name) { return lc(name) !== -1 ? procurementDateOnly_(data[row][lc(name)]) : ''; }

var purchaseOrderId = 'PO-' + Utilities.getUuid().substring(0, 10).toUpperCase();
ctx.tx.intent('purchase_orders', purchaseOrderId);
var purchaseOrderNo = 'PO-' + today.replace(/-/g, '') + '-' + Utilities.getUuid().substring(0, 4).toUpperCase() + '-' + groupKey;

var totalQty = 0, totalCartons = 0, totalAmount = 0, distinctSku = {};
var s0 = members[0].rowIndex;
var hdrInspection = cellDate(s0, 'inspection_date');
var hdrCompletion = cellDate(s0, 'expected_ready_date');
var hdrShip = cellDate(s0, 'expected_ship_date');

members.forEach(function (m) {
var row = m.rowIndex;
var sku = cellStr(row, 'sku');
var orderedQty = cellNum(row, 'approved_qty');
var upc = cellNum(row, 'units_per_carton');
var carton = lc('carton_qty') !== -1 ? cellNum(row, 'carton_qty') : ((upc > 0) ? Math.ceil(orderedQty / upc) : 0);
var ucRaw = lc('unit_cost') !== -1 ? data[row][lc('unit_cost')] : '';
var commercial = ctx.commercialByRow && ctx.commercialByRow[row];
if (commercial) ucRaw = commercial.unitCost;
var hasUc = (ucRaw !== '' && ucRaw != null && !isNaN(parseFloat(ucRaw)));
var unitCost = hasUc ? parseFloat(ucRaw) : '';
var lineAmount = hasUc ? Math.round(orderedQty * unitCost * 100) / 100 : '';
var poLineId = 'POL-' + Utilities.getUuid().substring(0, 10).toUpperCase();
ctx.tx.intent('purchase_order_lines', poLineId);

procurementAppendByHeader_(polSheet, {
purchase_order_line_id: poLineId,
purchase_order_id: purchaseOrderId,
request_order_line_id: cellStr(row, 'request_order_line_id'),
request_order_id: roId,
request_bucket: m.bucket,
sku: sku,
company: cellStr(row, 'company'),
series: cellStr(row, 'series'),
factory_item_no: cellStr(row, 'factory_item_no'),
factory_item_name: cellStr(row, 'factory_item_name'),
supplier_id: commercial ? ctx.supplierId : (cellStr(row, 'supplier_id') || ctx.supplierId),
supplier_name: commercial ? ctx.supplierName : (cellStr(row, 'supplier_name') || ctx.supplierName),
supplier_sku: commercial ? commercial.supplierSku : cellStr(row, 'supplier_sku'),
supplier_warehouse_id: commercial ? ctx.factoryWh : (cellStr(row, 'supplier_warehouse_id') || ctx.factoryWh),
km_qty: cellNum(row, 'km_qty'),
resus_qty: cellNum(row, 'resus_qty'),
restw_qty: cellNum(row, 'restw_qty'),
recommended_qty: lc('recommended_qty') !== -1 ? cellNum(row, 'recommended_qty') : '',
requested_qty: cellNum(row, 'requested_qty'),
approved_qty: orderedQty,
ordered_qty: orderedQty,
completed_qty: 0,
shipped_qty: 0,
remaining_qty: 0,
carton_qty: carton,
units_per_carton: upc,
unit_cost: unitCost,
line_amount: lineAmount,
currency: commercial ? commercial.currency : (cellStr(row, 'currency') || ctx.currency),
line_status: cellStr(row, 'line_status') || 'draft',
inspection_date: cellDate(row, 'inspection_date'),
expected_completion_date: cellDate(row, 'expected_ready_date'),
expected_ship_date: cellDate(row, 'expected_ship_date'),
related_shipment_id: '',
note: cellStr(row, 'note'),
created_at: now,
updated_at: now
});


if (ctx.poLineIdBackCol !== -1) ctx.rolSheet.getRange(row + 1, ctx.poLineIdBackCol + 1).setValue(poLineId);

totalQty += orderedQty;
totalCartons += carton;
if (hasUc) totalAmount += orderedQty * unitCost;
if (sku) distinctSku[sku.toLowerCase()] = 1;
});

var subtotal = (ctx.commercialByRow || totalAmount > 0) ? Math.round(totalAmount * 100) / 100 : '';
procurementAppendByHeader_(poSheet, {
purchase_order_id: purchaseOrderId,
po_no: purchaseOrderNo,
km_po_no: '',
warehouse_id: ctx.warehouseId,
supplier_name: ctx.supplierName,
order_status: 'draft',
order_date: '',
deposit_due_date: '',
inspection_date: hdrInspection,
expected_completion_date: hdrCompletion,
expected_ship_date: hdrShip,
subtotal_amount: subtotal,
deposit_amount: '',
balance_amount: '',
paid_amount: '',
payment_status: 'unpaid',
payment_term_id: '',
currency: ctx.currency,
note: ctx.setupNote || '',
purchase_order_no: purchaseOrderNo,
po_version: 1,
parent_purchase_order_id: purchaseOrderId,
request_order_id: roId,
company: ctx.company,
supplier_id: ctx.supplierId,
factory_id: ctx.factoryId,
total_sku: Object.keys(distinctSku).length,
total_qty: totalQty,
total_cartons: totalCartons,
total_amount: subtotal,
supplier_expected_ready_date: '',
supplier_confirmed_ready_date: '',
request_bucket: groupKey,
created_by: actor,
created_at: now,
updated_by: actor,
updated_at: now
});

return { purchase_order_id: purchaseOrderId, purchase_order_no: purchaseOrderNo, po_no: purchaseOrderNo,
request_bucket: groupKey, line_count: members.length, total_qty: totalQty };
}


function poSetRoConverted_(roSheet, ref, actor, now) {
roRequireColumns_(roSheet, ['request_status', 'updated_by', 'updated_at']);
function setRo(name, value) { var c = ref.col(name); if (c !== -1) roSheet.getRange(ref.row, c + 1).setValue(value); }
setRo('request_status', 'converted_to_po');
setRo('updated_by', actor);
setRo('updated_at', now);
}


function poReuseResponse_(roId, det, flags) {
var pos = det.presentSummaries.slice()
.sort(function (a, b) { return (a.request_bucket === 'T1' ? 0 : 1) - (b.request_bucket === 'T1' ? 0 : 1); });
var data = { request_order_id: roId, purchase_orders: pos, po_count: pos.length,
purchase_order_id: pos.length ? pos[0].purchase_order_id : '',
purchase_order_no: pos.length ? pos[0].purchase_order_no : '' };
for (var k in flags) if (flags.hasOwnProperty(k)) data[k] = flags[k];
return jsonResponse_({ success: true, data: data });
}




function poDeleteCreatedThisRun_(ss, roId, poIds) {
if (!poIds || !poIds.length) return;
var idset = {}; poIds.forEach(function (x) { if (x) idset[x] = 1; });
var deletedPolIds = {};
var polSheet = ss.getSheetByName('purchase_order_lines');
if (polSheet) {
var ld = polSheet.getDataRange().getValues();
if (ld.length >= 2) {
var lh = ld[0].map(function (x) { return String(x).trim(); });
var cPo = lh.indexOf('purchase_order_id'), cPol = lh.indexOf('purchase_order_line_id');
for (var i = ld.length - 1; i >= 1; i--) {
if (cPo !== -1 && idset[String(ld[i][cPo]).trim()]) {
if (cPol !== -1) deletedPolIds[String(ld[i][cPol]).trim()] = 1;
polSheet.deleteRow(i + 1);
}
}
}
}
var poSheet = ss.getSheetByName('purchase_orders');
if (poSheet) {
var pd = poSheet.getDataRange().getValues();
if (pd.length >= 2) {
var ph = pd[0].map(function (x) { return String(x).trim(); });
var cId = ph.indexOf('purchase_order_id');
for (var j = pd.length - 1; j >= 1; j--) {
if (cId !== -1 && idset[String(pd[j][cId]).trim()]) poSheet.deleteRow(j + 1);
}
}
}
var rolSheet = ss.getSheetByName('request_order_lines');
if (rolSheet) {
var rd = rolSheet.getDataRange().getValues();
if (rd.length >= 2) {
var rh = rd[0].map(function (x) { return String(x).trim(); });
var cRo = rh.indexOf('request_order_id'), cBack = rh.indexOf('purchase_order_line_id');
if (cRo !== -1 && cBack !== -1) {
for (var k = 1; k < rd.length; k++) {
if (String(rd[k][cRo]).trim() !== roId) continue;
if (deletedPolIds[String(rd[k][cBack]).trim()]) rolSheet.getRange(k + 1, cBack + 1).setValue('');
}
}
}
}
}





function procurementResolveWarehouseIn_(map, warehouseId, factoryId, op) {
var w = String(warehouseId || '').trim(), f = String(factoryId || '').trim(), id = w || f, x = map[id.toLowerCase()];
if (!id) return { ok: false, reason: 'WAREHOUSE_ID_MISSING' };
if (!x) return { ok: false, reason: w ? 'WAREHOUSE_NOT_FOUND' : 'FACTORY_ID_ALIAS_UNMAPPED', value: id };
if (x.dup) return { ok: false, reason: 'WAREHOUSE_ID_DUPLICATE', value: id };
if (w && f && map[f.toLowerCase()] !== x) return { ok: false, reason: 'WAREHOUSE_FACTORY_ID_CONFLICT', value: w + ' / ' + f };
if (!x.isFactory) return { ok: false, reason: 'NOT_A_FACTORY_WAREHOUSE', value: id };
if (op === 'new' && !x.isActive) return { ok: false, reason: 'FACTORY_INACTIVE', value: id };
return { ok: true, warehouse_id: x.warehouseId, source: w ? 'warehouse_id' : 'factory_id' };
}
function procurementResolveWarehouse_(ss, w, f, op) { return procurementResolveWarehouseIn_(procurementFactoryMap_(ss), w, f, op); }














var PROC_LOCK_BUSY_ = { success: false, code: 'PO_LOCK_UNAVAILABLE', error: 'Could not acquire lock; please retry.', stage: 'lock', zero_write: true };
var RO_RECOVERY_MARKER_ = '[PROCUREMENT_RECOVERY_REQUIRED]';
function roRequireColumns_(sheet, columns) {
if (!sheet) throw new Error('PROCUREMENT_TABLE_MISSING');
var h = sheet.getDataRange().getValues()[0] || [];
if (columns.some(function (c) { return h.indexOf(c) < 0; })) throw new Error('PROCUREMENT_COLUMNS_MISSING:' + columns.join(','));
}
function roPositiveLines_(ss, id, data) {
var sh = ss.getSheetByName('request_order_lines');
if (!sh) return { success: false, ok: false, code: 'REQUEST_LINES_UNREADABLE', error: 'Request lines cannot be read.', zero_write: true };
data = data || sh.getDataRange().getValues();
var h = data[0] || [], parent = h.indexOf('request_order_id'), sku = h.indexOf('sku'), qty = h.indexOf('approved_qty'), status = h.indexOf('line_status'), rows = {}, count = 0;
if ([parent, sku, qty, status].some(function (c) { return c < 0; })) return { success: false, ok: false, code: 'REQUEST_LINES_UNREADABLE', error: 'Required request line columns are missing.', zero_write: true };
for (var i = 1; i < data.length; i++) {
if (String(data[i][parent]).trim() !== id || String(data[i][status]).trim().toLowerCase() === 'cancelled') continue;
var raw = data[i][qty], n = Number(raw), text = String(raw == null ? '' : raw).trim();
if (!String(data[i][sku] || '').trim() || !text || typeof raw === 'boolean' || !isFinite(n) || n < 0 || Math.floor(n) !== n || n > 9007199254740991) return { success: false, ok: false, code: 'REQUEST_APPROVED_QTY_INVALID', error: 'Every active request line needs a SKU and a known nonnegative whole approved quantity.', row: i + 1, zero_write: true };
if (n > 0) { rows[i] = true; count++; }
}
return count ? { ok: true, rows: rows } : { success: false, ok: false, code: 'REQUEST_NO_POSITIVE_LINES', error: 'At least one active request line must have approved quantity greater than zero.', zero_write: true };
}
function roTxRead_(ss, name, ids, lineIds, optional) {
var sh = ss.getSheetByName(name); if (!sh && optional) return null;
if (!sh) throw new Error('PROCUREMENT_TABLE_MISSING:' + name);
var range = sh.getDataRange(), data = range.getValues(), h = data[0] || [], fx = typeof range.getFormulas === 'function' ? range.getFormulas() : [];
var keys = { request_orders: ['request_order_id'], request_order_lines: ['request_order_line_id'], request_order_line_sources: ['request_order_line_source_id', 'line_source_id'], purchase_orders: ['purchase_order_id'], purchase_order_lines: ['purchase_order_line_id'] }[name];
var keyCols = keys.map(function (k) { return h.indexOf(k); }).filter(function (c) { return c >= 0; }), parent = h.indexOf('request_order_id'), line = h.indexOf('request_order_line_id');
if (!keyCols.length || parent < 0) throw new Error('PROCUREMENT_IDENTITY_COLUMNS_MISSING:' + name);
var rows = [], allIds = Object.create(null), counts = Object.create(null);
function key(r) { for (var i = 0; i < keyCols.length; i++) { var s = String(r[keyCols[i]] || '').trim(); if (s) return s; } return ''; }
function owned(r) { return !!ids[String(r[parent] || '').trim()] || (line >= 0 && !!lineIds[String(r[line] || '').trim()]); }
for (var r = 1; r < data.length; r++) {
var k = key(data[r]); if (k) { allIds[k] = true; counts[k] = (counts[k] || 0) + 1; }
if (owned(data[r])) { if (!k) throw new Error('PROCUREMENT_ROW_ID_MISSING:' + name); rows.push({ key: k, row: r + 1, values: data[r].slice(), formulas: (fx[r] || []).slice() }); }
}
if (rows.some(function (r) { return counts[r.key] !== 1; })) throw new Error('PROCUREMENT_ROW_ID_DUPLICATE:' + name);
return { name: name, sheet: sh, headers: h.slice(), rows: rows, allIds: allIds, key: key, owned: owned };
}
function roTxCapture_(ss, operation, body) {
body = body || {};
var ids = Object.create(null), wanted = Object.create(null), lineIds = Object.create(null);
if (body.request_order_id) ids[String(body.request_order_id).trim()] = true;
(body.lines || []).forEach(function (r) { if (r.new_line && r.request_order_id) ids[String(r.request_order_id).trim()] = true; if (r.request_order_line_id) wanted[String(r.request_order_line_id).trim()] = true; });
(body.request_order_line_ids || []).forEach(function (id) { wanted[String(id).trim()] = true; });
var sh = ss.getSheetByName('request_order_lines'); if (!sh) throw new Error('PROCUREMENT_TABLE_MISSING:request_order_lines');
roRequireColumns_(sh, ['request_order_line_id', 'request_order_id', 'line_status', 'approved_qty', 'updated_at']);
roRequireColumns_(ss.getSheetByName('request_orders'), ['request_order_id', 'request_status', 'updated_by', 'updated_at']);
var data = sh.getDataRange().getValues(), h = data[0] || [], ci = h.indexOf('request_order_line_id'), cp = h.indexOf('request_order_id');
if (ci < 0 || cp < 0) throw new Error('PROCUREMENT_REQUEST_IDENTITY_MISSING');
data.slice(1).forEach(function (r) { if (wanted[String(r[ci]).trim()]) ids[String(r[cp]).trim()] = true; });
data.slice(1).forEach(function (r) { if (ids[String(r[cp]).trim()]) lineIds[String(r[ci]).trim()] = true; });
var names = ['request_orders', 'request_order_lines', 'request_order_line_sources'];
if (operation === 'convert') names = names.concat(['purchase_orders', 'purchase_order_lines']);
var tables = names.map(function (n) { return roTxRead_(ss, n, ids, lineIds, n === 'request_order_line_sources'); }).filter(Boolean), byName = {};
tables.forEach(function (t) { byName[t.name] = t; });
var ro = byName.request_orders, note = ro.headers.indexOf('note');
if (note < 0) throw new Error('PROCUREMENT_COLUMNS_MISSING:request_orders.note');
if (ro.rows.some(function (r) { return String(r.values[note] || '').split('\n').some(function (s) { return s.indexOf(RO_RECOVERY_MARKER_) === 0; }); })) throw new Error('PROCUREMENT_RECOVERY_REQUIRED');
if (operation === 'edit') (body.lines || []).forEach(function (r) {
if (r.approved_qty === undefined) return;
var n = Number(r.approved_qty), s = String(r.approved_qty == null ? '' : r.approved_qty).trim();
if (!s || typeof r.approved_qty === 'boolean' || !isFinite(n) || n < 0 || Math.floor(n) !== n || n > 9007199254740991) throw new Error('REQUEST_APPROVED_QTY_INVALID');
});
return { ss: ss, ids: ids, lineIds: lineIds, tables: tables, byName: byName, intents: {}, intent: function (name, id) {
var t = byName[name]; if (!t || !id || t.allIds[id]) throw new Error('PROCUREMENT_APPEND_ID_CONFLICT:' + name);
var set = this.intents[name] || (this.intents[name] = Object.create(null));
if (set[id]) throw new Error('PROCUREMENT_APPEND_ID_CONFLICT:' + name); set[id] = true;
} };
}
function roTxCellSame_(a, b) {
if (Object.prototype.toString.call(a) === '[object Date]' && Object.prototype.toString.call(b) === '[object Date]') return a.getTime() === b.getTime();
return a === b || ((a == null || a === '') && (b == null || b === ''));
}
function roTxUndo_(tx) {
// A Sheets call may land before throwing; final readback determines compensation.
function attempt(fn) { try { fn(); } catch (e) {} }
// Delete only IDs declared before this operation's append, never unrelated/pre-existing rows.
tx.tables.slice().reverse().forEach(function (old) { attempt(function () {
var current = roTxRead_(tx.ss, old.name, tx.ids, tx.lineIds, false), intended = tx.intents[old.name] || {};
current.rows.slice().reverse().forEach(function (r) { if (intended[r.key] && !old.allIds[r.key]) attempt(function () { current.sheet.deleteRow(r.row); }); });
}); });
tx.tables.forEach(function (old) { attempt(function () {
var current = roTxRead_(tx.ss, old.name, tx.ids, tx.lineIds, false), byId = Object.create(null);
if (old.headers.join('\n') !== current.headers.join('\n')) throw new Error('PROCUREMENT_ROLLBACK_HEADER_CHANGED');
current.rows.forEach(function (r) { byId[r.key] = r; });
old.rows.forEach(function (r) {
var live = byId[r.key]; if (!live) throw new Error('PROCUREMENT_ROLLBACK_ROW_MISSING');
r.values.forEach(function (v, c) {
var formula = r.formulas[c] || '', nowFormula = live.formulas[c] || '';
if (!roTxCellSame_(v, live.values[c]) || formula !== nowFormula) attempt(function () { current.sheet.getRange(live.row, c + 1).setValue(formula || v); });
});
});
}); });
try {
return tx.tables.every(function (old) {
var current = roTxRead_(tx.ss, old.name, tx.ids, tx.lineIds, false), byId = Object.create(null);
if (old.headers.join('\n') !== current.headers.join('\n')) return false;
current.rows.forEach(function (r) { byId[r.key] = r; });
if (Object.keys(tx.intents[old.name] || {}).some(function (id) { return current.allIds[id]; })) return false;
return old.rows.every(function (r) { var live = byId[r.key]; return live && r.values.every(function (v, c) { return roTxCellSame_(v, live.values[c]) && (r.formulas[c] || '') === (live.formulas[c] || ''); }); });
});
} catch (e) { return false; }
}
function roTxMarkRecovery_(tx, operation) {
var ok = true, sheet = tx.ss.getSheetByName('request_orders');
Object.keys(tx.ids).forEach(function (id) { try {
var ref = procurementFindRow_(sheet, 'request_order_id', id), c = ref && ref.col('note');
if (!ref || c < 0) { ok = false; return; }
var note = String(ref.vals[c] || ''), marker = RO_RECOVERY_MARKER_ + ' ' + operation + ' ' + procurementTimestamp_();
sheet.getRange(ref.row, c + 1).setValue(note + (note ? '\n' : '') + marker);
var after = procurementFindRow_(sheet, 'request_order_id', id); if (!after || String(after.vals[c]).indexOf(marker) < 0) ok = false;
} catch (e) { ok = false; } }); return ok;
}
function roLockedMutation_(operation, body, work) {
return procLocked_(function () {
var tx;
try { tx = roTxCapture_(SpreadsheetApp.getActiveSpreadsheet(), operation, body); }
catch (e) { var message = String(e && e.message || e); return jsonResponse_({ success: false, code: message === 'PROCUREMENT_RECOVERY_REQUIRED' || message === 'REQUEST_APPROVED_QTY_INVALID' ? message : 'REQUEST_MUTATION_PRECHECK_FAILED', error: message, zero_write: true }); }
try { return work(tx); }
catch (e) {
var restored = roTxUndo_(tx), marked = restored ? false : roTxMarkRecovery_(tx, operation);
return jsonResponse_({ success: false, code: restored ? 'REQUEST_MUTATION_ROLLED_BACK' : 'PROCUREMENT_RECOVERY_REQUIRED',
error: (operation === 'convert' ? 'PO_CREATION_WRITE_FAILED:' : 'REQUEST_MUTATION_WRITE_FAILED:') + String(e && e.message || e), stage: 'write',
compensated: restored, rollback_verified: restored, retry_safe: restored, requires_owner_review: !restored, recovery_marker_recorded: marked });
}
});
}
function procTakeLock_() { var l = LockService.getScriptLock(); try { if (l.tryLock(30000)) return l; } catch (e) {} return null; }
function procLocked_(fn) { var l = procTakeLock_(); if (!l) return jsonResponse_(PROC_LOCK_BUSY_); try { return fn(); } finally { try { l.releaseLock(); } catch (e) {} } }
// PG12R2 (G-1, Owner batch B r2 2026-11-13): a PO cancel is refused, zero writes, inside the status lock, unless the books PROVE the PO holds nothing:
//   PO_CANCEL_STATE_UNREADABLE   a needed sheet / column is missing, a read fails, a line id is blank or duplicated, an import batch state is not final
//   PO_CANCEL_LINE_COUNTS_INVALID a line's completed / shipped / remaining are not a valid record (not a number, negative, shipped > completed,
//                                remaining != completed - shipped): owner review of the PO line data
//   PO_CANCEL_HAS_RECEIPTS       a line holds quantity, a UI receipt movement (factory_stock_movements purchase_order_receipt -> the line id), or a
//                                COMMITTED import change (import_batch_changes, entity_table purchase_order_lines, line_id = the line id) set its
//                                completed / shipped / remaining above 0
//   PO_CANCEL_HAS_ALLOCATIONS    a shipment_line_allocations row on a line is not ended. A DRAFT allocation is ignored ONLY when it traces uniquely
//                                and completely (allocation -> one shipment_line -> one shipment) to a shipment whose status is cancelled; orphans,
//                                duplicates, blank / unknown statuses, executed allocations and any other shipment still block (Owner rule M-3)
// Every link is an exact id; nothing is matched by SKU, quantity or time. Nothing is zeroed, released or deleted. Reads only. -> null | refusal body
// PG12R3 (review r2 m-a / m-b / m-c / m-e): both import record sheets missing is NOT proof of no import -> UNREADABLE; an allocation with an ended
// status (cancelled / released / void / voided - no writer of this system writes them) is set aside only like a draft, when it traces to a
// cancelled shipment; a PO with any receipt history is never cancelled, even when its counters are 0 now; reads stop at the first certain refusal.
// PG12R3 (M-3, Owner rule; the SAME rule as SCF1 32_ slaDraftOccupancyTrace_ - shipment-cancel/fix-r1/PROPOSALS.md P-1, 74cf45db..., reference
// 32_ b77944bc... :325-384). Used by this PO-cancel guard and by 82_ UPDATE_REMAINING. Classifies ONE draft allocation by its link
//   allocation.shipment_line_id -> exactly ONE shipment_lines row -> its shipment_id -> exactly ONE shipments row -> that row's status:
//   COUNTED  a known live status (draft, ready_to_ship, shipped, in_transit, arrived, received, closed, completed, delivered,
//            partial_received, partially_received, stuck): it occupies the PO line, as before;
//   ORPHAN   cancelled AND no dispatch evidence for that shipment (an executed allocation on any of its lines, a shipment_out movement in
//            factory_stock_movements (related_entity_type shipment) or overseas_inventory_movements (reference_id), a shipment_routes row,
//            a shipment_events row by shipment_id or source_event_id confirm:<id>): it occupies nothing;
//   BLOCKED  anything else, with the reason: ALLOCATION_LINE_ID_MISSING, SHIPMENT_LINE_NOT_FOUND / _DUPLICATED, LINE_SHIPMENT_ID_MISSING,
//            SHIPMENT_NOT_FOUND / _DUPLICATED, SHIPMENT_STATUS_UNKNOWN, CANCELLED_SHIPMENT_HAS_DISPATCH_EVIDENCE, TRACE_SOURCE_UNREADABLE
//            (shipment_lines / shipments missing, or a needed column missing while the sheet has rows), TRACE_EVIDENCE_UNREADABLE (an
//            evidence sheet with rows lacks a needed column). An absent evidence sheet is no evidence (as 22_ csdMovementExists_).
// Headers are compared trimmed and lower-cased. cache: {} per caller (each sheet read at most once). Reads only.
var PO_SHIP_LIVE_STATUS_ = { draft: 1, ready_to_ship: 1, shipped: 1, in_transit: 1, arrived: 1, received: 1, closed: 1, completed: 1, delivered: 1, partial_received: 1, partially_received: 1, stuck: 1 };
function poTraceTbl_(ss, name, cols, opt) {
var sh = ss.getSheetByName(name); if (!sh) return null;
var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return String(x == null ? '' : x).trim().toLowerCase(); }), c = {};
for (var i = 0; i < cols.length; i++) { c[cols[i]] = h.indexOf(cols[i]); if (c[cols[i]] === -1 && d.length > 1) return { bad: name + '.' + cols[i] }; }
(opt || []).forEach(function (n) { c[n] = h.indexOf(n); });
return { rows: d.slice(1), c: c };
}
function poDraftOccupancyTrace_(ss, cache, shipmentLineId) {
function s_(x) { return String(x == null ? '' : x).trim(); }
function B(why, sid) { return { state: 'BLOCKED', shipment_id: sid || '', why: why }; }
if (!cache.base) { cache.base = true;
try { var L = poTraceTbl_(ss, 'shipment_lines', ['shipment_line_id', 'shipment_id']), S = poTraceTbl_(ss, 'shipments', ['shipment_id', 'status']);
if (!L || L.bad || !S || S.bad) cache.err = 'TRACE_SOURCE_UNREADABLE ' + ((L && L.bad) || (S && S.bad) || (!L ? 'shipment_lines' : 'shipments'));
else { cache.L = L; cache.lineBy = {}; cache.shipBy = {};
L.rows.forEach(function (r) { var k = s_(r[L.c.shipment_line_id]); if (k) (cache.lineBy[k] = cache.lineBy[k] || []).push(s_(r[L.c.shipment_id])); });
S.rows.forEach(function (r) { var k = s_(r[S.c.shipment_id]); if (k) (cache.shipBy[k] = cache.shipBy[k] || []).push(s_(r[S.c.status]).toLowerCase()); }); } }
catch (e) { cache.err = 'TRACE_SOURCE_UNREADABLE ' + poRcvMsg_(e); } }
if (cache.err) return B(cache.err);
var lid = s_(shipmentLineId); if (!lid) return B('ALLOCATION_LINE_ID_MISSING');
var ls = cache.lineBy[lid] || []; if (!ls.length) return B('SHIPMENT_LINE_NOT_FOUND ' + lid); if (ls.length > 1) return B('SHIPMENT_LINE_DUPLICATED ' + lid + ' (' + ls.length + ' rows)');
var sid = ls[0]; if (!sid) return B('LINE_SHIPMENT_ID_MISSING ' + lid);
var st = cache.shipBy[sid] || []; if (!st.length) return B('SHIPMENT_NOT_FOUND ' + sid, sid); if (st.length > 1) return B('SHIPMENT_DUPLICATED ' + sid + ' (' + st.length + ' rows)', sid);
if (st[0] === 'cancelled') { var ev = poShipmentDispatchEvidence_(ss, cache, sid);
if (ev.bad) return B('TRACE_EVIDENCE_UNREADABLE ' + ev.bad, sid);
if (ev.why) return B('CANCELLED_SHIPMENT_HAS_DISPATCH_EVIDENCE ' + sid + ' ' + ev.why, sid);
return { state: 'ORPHAN', shipment_id: sid, why: 'shipment ' + sid + ' is cancelled and has no dispatch evidence' }; }
if (st[0] && PO_SHIP_LIVE_STATUS_[st[0]] === 1) return { state: 'COUNTED', shipment_id: sid, why: 'shipment ' + sid + ' is ' + st[0] };
return B('SHIPMENT_STATUS_UNKNOWN ' + sid + ' "' + st[0] + '"', sid);
}
// AD3 C round 3 (review F2): the pre-Confirm executing-carrier record (12_ assignCarrier case b: event_type executing_carrier_assigned,
// source_event_id carrier_exec:<sid>) is NOT dispatch evidence - the same rule as 22_ csdEventExists_. Optional columns: absent = not that event.
function poExecCarrierEventRow_(E, r) { var c = E.c, t = c.event_type === undefined || c.event_type === -1 ? '' : String(r[c.event_type] == null ? '' : r[c.event_type]).trim(), x = c.source_event_id === undefined || c.source_event_id === -1 ? '' : String(r[c.source_event_id] == null ? '' : r[c.source_event_id]).trim(); return t === 'executing_carrier_assigned' || x.indexOf('carrier_exec:') === 0; }
function poShipmentDispatchEvidence_(ss, cache, sid) {   // -> { bad } | { why } | {}; the evidence sheets are read once per cache
function s_(x) { return String(x == null ? '' : x).trim(); }
if (!cache.ev) { cache.ev = {};
try { cache.ev.A = poTraceTbl_(ss, 'shipment_line_allocations', ['shipment_line_id', 'allocation_status']); cache.ev.F = poTraceTbl_(ss, 'factory_stock_movements', ['movement_type', 'related_entity_type', 'related_entity_id']);
cache.ev.O = poTraceTbl_(ss, 'overseas_inventory_movements', ['movement_type', 'reference_id']); cache.ev.R = poTraceTbl_(ss, 'shipment_routes', ['shipment_id']);
cache.ev.E = poTraceTbl_(ss, 'shipment_events', ['shipment_id'], ['source_event_id', 'event_type']); }
catch (e) { cache.ev.err = poRcvMsg_(e); } }
var X = cache.ev; if (X.err) return { bad: 'READ_FAILED ' + X.err };
var bad = [X.A, X.F, X.O, X.R, X.E].filter(function (t) { return t && t.bad; }).map(function (t) { return t.bad; }); if (bad.length) return { bad: bad.join(', ') };
var mine = {}; cache.L.rows.forEach(function (r) { if (s_(r[cache.L.c.shipment_id]) === sid) mine[s_(r[cache.L.c.shipment_line_id])] = 1; });
if (X.A && X.A.rows.some(function (r) { return mine[s_(r[X.A.c.shipment_line_id])] === 1 && s_(r[X.A.c.allocation_status]).toLowerCase() === 'executed'; })) return { why: 'EXECUTED_ALLOCATION' };
if (X.F && X.F.rows.some(function (r) { return s_(r[X.F.c.related_entity_id]) === sid && s_(r[X.F.c.related_entity_type]) === 'shipment' && s_(r[X.F.c.movement_type]) === 'shipment_out'; })) return { why: 'SHIPMENT_OUT_MOVEMENT' };
if (X.O && X.O.rows.some(function (r) { return s_(r[X.O.c.reference_id]) === sid && s_(r[X.O.c.movement_type]) === 'shipment_out'; })) return { why: 'OVERSEAS_SHIPMENT_OUT_MOVEMENT' };
if (X.R && X.R.rows.some(function (r) { return s_(r[X.R.c.shipment_id]) === sid; })) return { why: 'ROUTE_ROW' };
if (X.E && X.E.rows.some(function (r) { if (poExecCarrierEventRow_(X.E, r)) return false; return s_(r[X.E.c.shipment_id]) === sid || (X.E.c.source_event_id !== -1 && s_(r[X.E.c.source_event_id]) === 'confirm:' + sid); })) return { why: 'EVENT_ROW' };
return {};
}
function poCancelGuard_(ss, poId, poNo) {
var lines = {}, invalid = [], recv = [], alloc = [], unread = [], ignored = [];
function s_(x) { return String(x == null ? '' : x).trim(); }
function cnt(x) { if (x === null || x === undefined || String(x).trim() === '') return 0; var n = Number(x); return isFinite(n) ? n : NaN; }
function tbl(name, cols) { var sh = ss.getSheetByName(name); if (!sh) return null; var v = sh.getDataRange().getValues(), h = poRcvHdr_(v), c = {}, miss = [];
cols.forEach(function (k) { c[k] = h.indexOf(k); if (c[k] === -1) miss.push(k); }); return { v: v, c: c, miss: miss }; }
function need(T, name) { if (!T) { unread.push(name + ': sheet missing'); return false; } if (T.miss.length) { unread.push(name + ': column missing ' + T.miss.join(', ')); return false; } return true; }
function done() { return unread.length > 0 || invalid.length > 0 || recv.length > 0; }   // PG12R3 (m-e): a certain refusal needs no further reads
try {
var L = tbl('purchase_order_lines', ['purchase_order_line_id', 'purchase_order_id', 'completed_qty', 'shipped_qty', 'remaining_qty']);
if (need(L, 'purchase_order_lines')) {
var seen = {}, i;
for (i = 1; i < L.v.length; i++) { var sid0 = s_(L.v[i][L.c.purchase_order_line_id]); if (sid0) seen[sid0] = (seen[sid0] || 0) + 1; }
for (i = 1; i < L.v.length; i++) {
if (s_(L.v[i][L.c.purchase_order_id]) !== poId) continue;
var id = s_(L.v[i][L.c.purchase_order_line_id]);
if (!id) { unread.push('purchase_order_lines row ' + (i + 1) + ' of this PO has no purchase_order_line_id'); continue; }
if (seen[id] > 1) { unread.push(id + ': purchase_order_line_id appears ' + seen[id] + ' times'); continue; }
lines[id] = 1;
var cq = cnt(L.v[i][L.c.completed_qty]), sq = cnt(L.v[i][L.c.shipped_qty]), rq = cnt(L.v[i][L.c.remaining_qty]);
var shown = id + ': completed ' + s_(L.v[i][L.c.completed_qty]) + ', shipped ' + s_(L.v[i][L.c.shipped_qty]) + ', remaining ' + s_(L.v[i][L.c.remaining_qty]);
if (isNaN(cq) || isNaN(sq) || isNaN(rq) || cq < 0 || sq < 0 || rq < 0 || sq > cq || rq !== cq - sq) invalid.push(shown);
else if (cq !== 0 || sq !== 0 || rq !== 0) recv.push(shown);
}
}
var M = done() ? null : tbl('factory_stock_movements', ['related_entity_type', 'related_entity_id']);
if (!done() && need(M, 'factory_stock_movements')) { var mId = poRcvHdr_(M.v).indexOf('factory_stock_movement_id');
for (var k = 1; k < M.v.length; k++) { var ml = s_(M.v[k][M.c.related_entity_id]);
if (s_(M.v[k][M.c.related_entity_type]) === 'purchase_order_receipt' && lines[ml] === 1) recv.push(ml + ': UI receipt movement ' + (mId !== -1 ? s_(M.v[k][mId]) : 'row ' + (k + 1))); } }
var IB = done() ? null : tbl('import_batches', ['import_batch_id', 'status']), IC = done() ? null : tbl('import_batch_changes', ['import_batch_id', 'entity_table', 'line_id', 'field', 'after_value']);
if (!done()) {   // PG12R3 (m-a): both sheets missing is not proof of no import - refused like any other missing record
if (need(IB, 'import_batches') && need(IC, 'import_batch_changes')) {
var bst = {};
for (var b = 1; b < IB.v.length; b++) { var bid = s_(IB.v[b][IB.c.import_batch_id]); if (!bid) continue; bst[bid] = bst.hasOwnProperty(bid) ? '#DUPLICATE' : s_(IB.v[b][IB.c.status]).toUpperCase(); }
for (var g = 1; g < IC.v.length; g++) {
if (s_(IC.v[g][IC.c.entity_table]) !== 'purchase_order_lines') continue;
var gl = s_(IC.v[g][IC.c.line_id]); if (lines[gl] !== 1) continue;
var gb = s_(IC.v[g][IC.c.import_batch_id]), gs = bst.hasOwnProperty(gb) ? bst[gb] : '#NOT_FOUND';
if (gs === 'FAILED_ROLLED_BACK') continue;
if (gs !== 'COMMITTED') { unread.push(gl + ': import batch ' + (gb || '(blank)') + ' is ' + gs + ' - its effect on this line is not final'); continue; }
var gf = s_(IC.v[g][IC.c.field]); if (gf !== 'completed_qty' && gf !== 'shipped_qty' && gf !== 'remaining_qty') continue;
var ga = cnt(IC.v[g][IC.c.after_value]);
if (isNaN(ga)) unread.push(gl + ': import change ' + gb + ' ' + gf + ' after ' + s_(IC.v[g][IC.c.after_value]) + ' is not a number');
else if (ga > 0) recv.push(gl + ': import ' + gb + ' set ' + gf + ' to ' + ga);
}
}
}
var A = done() ? null : tbl('shipment_line_allocations', ['purchase_order_line_id', 'allocation_status', 'shipment_line_id']);
if (!done() && need(A, 'shipment_line_allocations')) {
var aId = poRcvHdr_(A.v).indexOf('shipment_line_allocation_id'), tc = {};
for (var a = 1; a < A.v.length; a++) {
var al = s_(A.v[a][A.c.purchase_order_line_id]); if (lines[al] !== 1) continue;
var st = s_(A.v[a][A.c.allocation_status]).toLowerCase();
var an = al + ': allocation ' + (aId !== -1 ? s_(A.v[a][aId]) : 'row ' + (a + 1));
if (st === 'released') continue;   // ended (the shared rule; SCF1 F1 writes it when a shipment is cancelled)
if (st !== 'draft') { alloc.push(an + ' (' + (st || 'blank status') + ')'); continue; }   // executed / cancelled / void / blank / unknown
var tr = poDraftOccupancyTrace_(ss, tc, A.v[a][A.c.shipment_line_id]);   // the shared occupancy rule
if (tr.state === 'ORPHAN') { ignored.push(an + ' (draft of cancelled shipment ' + tr.shipment_id + ', no dispatch evidence)'); continue; }
alloc.push(an + ' (draft; ' + tr.why + ')');
}
}
} catch (e) { unread.push('READ_FAILED ' + poRcvMsg_(e)); }
var code = unread.length ? 'PO_CANCEL_STATE_UNREADABLE' : invalid.length ? 'PO_CANCEL_LINE_COUNTS_INVALID' : recv.length ? 'PO_CANCEL_HAS_RECEIPTS' : alloc.length ? 'PO_CANCEL_HAS_ALLOCATIONS' : '';
if (!code) return null;
var no = s_(poNo), name = 'PO ' + (no || poId) + ' (' + poId + ')';
var why = code === 'PO_CANCEL_STATE_UNREADABLE' ? 'the books that prove it holds nothing could not be read (' + unread.slice(0, 3).join('; ') + '). The missing sheet, column or record must be restored or reviewed by the owner first'
: code === 'PO_CANCEL_LINE_COUNTS_INVALID' ? 'its line quantities are not a valid record (' + invalid.slice(0, 3).join('; ') + '). The PO line data needs an owner review'
: code === 'PO_CANCEL_HAS_RECEIPTS' ? 'it has a receipt history (' + recv.slice(0, 3).join('; ') + '). A PO that has ever received goods is not cancelled, also when its quantities are 0 now; its history stays as recorded'
: 'shipment allocations still draw on it (' + alloc.slice(0, 3).join('; ') + '). Only an allocation that traces to a cancelled shipment is set aside';
return { success: false, code: code, purchase_order_id: poId, po_no: no,
data: { zero_write: true, purchase_order_id: poId, unreadable: unread.slice(0, 20), invalid_lines: invalid.slice(0, 20), received: recv.slice(0, 20), allocations: alloc.slice(0, 20), ignored_allocations: ignored.slice(0, 20) },
error: name + ' cannot be cancelled: ' + why + '. Nothing was changed.', zero_write: true };
}
function handleUpdatePurchaseOrderStatus_(body) {
var poId = String((body && body.purchase_order_id) || '').trim();
var transition = String((body && body.transition) || '').trim();
var actor = String((body && body.actor) || 'operation-system').trim();
if (!poId) return jsonResponse_({ success: false, error: 'Missing purchase_order_id', zero_write: true });
var VALID = ['issue', 'confirm', 'start_production', 'ready_to_ship', 'complete', 'cancel'];
if (VALID.indexOf(transition) === -1) {
return jsonResponse_({ success: false, error: 'Invalid transition. Valid: ' + VALID.join(', '), zero_write: true });
}

var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName('purchase_orders');
if (!sheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found', zero_write: true });
sheetEnsureColumns_(sheet, ['order_status', 'order_date', 'deposit_due_date']);
var recoveryPo = procurementFindRow_(sheet, 'purchase_order_id', poId);
if (recoveryPo && recoveryPo.col('request_order_id') >= 0) {
var recoveryRoSheet = ss.getSheetByName('request_orders'), recoveryRoId = String(recoveryPo.vals[recoveryPo.col('request_order_id')] || '').trim();
var recoveryRo = recoveryRoSheet && recoveryRoId && procurementFindRow_(recoveryRoSheet, 'request_order_id', recoveryRoId);
if (recoveryRo && recoveryRo.col('note') >= 0 && String(recoveryRo.vals[recoveryRo.col('note')] || '').split('\n').some(function (s) { return s.indexOf(RO_RECOVERY_MARKER_) === 0; })) return jsonResponse_({ success: false, code: 'PROCUREMENT_RECOVERY_REQUIRED', error: 'The linked Request requires owner-reviewed recovery before changing this PO status.', requires_owner_review: true, zero_write: true });
}




















var poDocResult = null;
var poPrepared = null, poRendered = null, poOrderDate = '', poDepositDue = '';
var poIssueLock = null;
function poBlocked(res, stage) {
return jsonResponse_({
success: false, stage: 'document_generation', document_stage: stage, purchase_order_id: poId,
error: 'Send PO blocked — the required Purchase Order document could not be produced.',
document_generation: res,
note: 'The PO remains Draft. No status was written and no email was sent.'
});
}
if (transition === 'issue') {



poOrderDate = procurementToday_();
poDepositDue = procurementAddBusinessDays_(poOrderDate, 5);
poIssueLock = LockService.getScriptLock();

try { if (!poIssueLock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock', zero_write: true }); }
catch (eL) { return jsonResponse_({ success: false, error: 'Lock error: ' + (eL && eL.message ? eL.message : eL), stage: 'lock', zero_write: true }); }
try { poPrepared = pcPoPrepareForIssue_(ss, poId, actor, poOrderDate, poDepositDue); }
catch (eP) { poPrepared = { ok: false, reason: 'DOCUMENT_GENERATION_FAILED', message: (eP && eP.message ? String(eP.message) : String(eP)) }; }
finally { try { poIssueLock.releaseLock(); } catch (eR) {} }
if (!poPrepared.ok) return poBlocked(poPrepared, 'prepare');

if (!poPrepared.complete) {
try { poRendered = dgsPoRenderPrepared_(ss, poPrepared); }
catch (eD) { poRendered = { ok: false, reason: 'DOCUMENT_GENERATION_FAILED', message: (eD && eD.message ? String(eD.message) : String(eD)) }; }
if (!poRendered.ok) {
return poBlocked(Object.assign({ ok: false, reason: poRendered.reason, message: poRendered.message || '', document_id: poPrepared.document_id, retryable: true, partial_file_id: poRendered.partial_file_id },
dgsLocked_(poIssueLock, function () { return pcPoMarkAttemptFailed_(ss, poPrepared.document_id, poRendered); })), 'render');
}
}


var poReg = { lock_acquired: false, recorded: false };
try { poReg.lock_acquired = poIssueLock.tryLock(30000); } catch (eL2) { poReg.registry_error = 'Lock error: ' + (eL2 && eL2.message ? eL2.message : eL2); }
if (!poReg.lock_acquired) {
if (poPrepared.complete) return jsonResponse_({ success: false, error: poReg.registry_error || 'Could not acquire lock; please retry.', stage: 'lock' });
return poBlocked(Object.assign({ ok: false, reason: 'LOCK_UNAVAILABLE', retryable: true }, dgsUnregistered_(poPrepared.document_id, poRendered.file, poRendered.folder_id, poReg)), 'finalize');
}
if (poPrepared.complete) {
var poReuse;
try { poReuse = dgsPoReusePrepared_(ss, poPrepared); }
catch (eReuse) { poReuse = { ok: false, reason: 'DOCUMENT_REUSE_UNVERIFIED' }; }
if (!poReuse.ok) {
try { poIssueLock.releaseLock(); } catch (eReuseUnlock) {}
return poBlocked(poReuse, 'finalize');
}
poDocResult = { ok: true, reused: true, generated: 0, document_id: poPrepared.document_id, document_batch_date: poPrepared.document_batch_date };
} else {
var poFin;
try { poFin = dgsPoFinalize_(ss, poPrepared, poRendered, actor); }
catch (eF) {
poFin = { ok: false, reason: 'DOCUMENT_GENERATION_FAILED', message: (eF && eF.message ? String(eF.message) : String(eF)) };

Object.assign(poFin, dgsLocked_(null, function () { return pcPoMarkAttemptFailed_(ss, poPrepared.document_id, { reason: poFin.reason, message: poFin.message, partial_file_id: poRendered.file.file_id + ',' + poRendered.file.pdf_file_id }); }));
}

if (!poFin.ok || poFin.authorizes_issue !== true) {
try { poIssueLock.releaseLock(); } catch (eR2) {}


if (poFin.reason === 'PURCHASE_ORDER_ALREADY_ISSUED') {
return jsonResponse_({
success: true, already_issued: true, purchase_order_id: poId,
data: { purchase_order_id: poId, transition: 'issue', order_status: poFin.order_status, ui_group: 'In Production', email_sent: false },
document_generation: { ok: true, reused: true, current_document_id: poFin.current_document_id, note: poFin.message,
attempt: dgsUnregistered_(poPrepared.document_id, poRendered.file, poRendered.folder_id, { lock_acquired: true, recorded: poFin.recorded, registry_error: poFin.registry_error }) },
note: 'Already sent by another request — no duplicate transition, document or registry row was created.'
});
}
return poBlocked(Object.assign({ ok: false, reason: poFin.reason, message: poFin.message || '', retryable: true, detail: poFin },
dgsUnregistered_(poPrepared.document_id, poRendered.file, poRendered.folder_id, { lock_acquired: true, recorded: !!poFin.recorded, registry_error: poFin.registry_error })), 'finalize');
}
poDocResult = { ok: true, generated: 1, document_id: poFin.document_id, file_name: poFin.file_name,
folder_url: poFin.folder_url, document_batch_date: poPrepared.document_batch_date, checksum: poFin.checksum };
}
}
if (!poIssueLock && !(poIssueLock = procTakeLock_())) return jsonResponse_(PROC_LOCK_BUSY_);
try {

var ref = procurementFindRow_(sheet, 'purchase_order_id', poId);
if (!ref) return jsonResponse_({ success: false, error: 'Purchase order not found: ' + poId, zero_write: transition !== 'issue' });
var col = ref.col;
var blk6_ = poRcvHeaderWriteBlock_(ss, poId, col('updated_at') === -1 ? '' : ref.vals[col('updated_at')]);   // R71 small-6: a status transition never washes out a pending receipt
if (blk6_) return jsonResponse_(blk6_);

var curStatus = col('order_status') !== -1 ? String(ref.vals[col('order_status')]).trim() : '';
if (!curStatus && col('status') !== -1) curStatus = String(ref.vals[col('status')]).trim();
var now = procurementTimestamp_();
var rowV = ref.vals.slice(), lo = rowV.length, hi = -1;
function setCell(name, value) { var c = col(name); if (c !== -1) { rowV[c] = value; lo = Math.min(lo, c); hi = Math.max(hi, c); } }

function setStatus(value) { setCell('order_status', value); }

var EXPECTED_PREV = {
issue: 'draft', confirm: 'issued', start_production: 'confirmed',
ready_to_ship: 'in_production', complete: 'ready_to_ship'
};
if (transition === 'cancel') {
if (curStatus === 'completed' || curStatus === 'cancelled') {
return jsonResponse_({ success: false, error: 'A completed / cancelled PO cannot be cancelled (current: ' + curStatus + ')', zero_write: true });
}
var cg12_ = poCancelGuard_(ss, poId, col('po_no') !== -1 ? ref.vals[col('po_no')] : '');   // PG12R2 (G-1): proven empty, or refused with zero writes (in the lock)
if (cg12_) return jsonResponse_(cg12_);
setStatus('cancelled');
setCell('cancelled_by', actor);
setCell('cancelled_at', now);
} else {
if (curStatus !== EXPECTED_PREV[transition]) {
return jsonResponse_({ success: false, error: 'Transition "' + transition + '" requires status "' + EXPECTED_PREV[transition] + '" (current: ' + curStatus + ')', zero_write: transition !== 'issue' });
}
if (transition === 'issue') {


setStatus('issued'); setCell('issued_by', actor); setCell('issued_at', now);
setCell('order_date', poOrderDate);

setCell('deposit_due_date', poDepositDue);
}
else if (transition === 'confirm') { setStatus('confirmed'); setCell('confirmed_by', actor); setCell('confirmed_at', now); }
else if (transition === 'start_production') { setStatus('in_production'); }
else if (transition === 'ready_to_ship') { setStatus('ready_to_ship'); }
else if (transition === 'complete') { setStatus('completed'); setCell('completed_by', actor); setCell('completed_at', now); }
}




var expReady = (body.supplier_expected_ready_date !== undefined) ? body.supplier_expected_ready_date : body.expected_ready_date;
var confReady = (body.supplier_confirmed_ready_date !== undefined) ? body.supplier_confirmed_ready_date : body.confirmed_ready_date;
if (expReady !== undefined) { setCell('supplier_expected_ready_date', String(expReady || '').trim()); setCell('expected_completion_date', String(expReady || '').trim()); }
if (confReady !== undefined) setCell('supplier_confirmed_ready_date', String(confReady || '').trim());
if (body.note !== undefined && col('note') !== -1) {
var existing = String(ref.vals[col('note')] || '').trim();
var appended = '[' + transition + ' @' + now + ' by ' + actor + '] ' + String(body.note || '').trim();
setCell('note', existing ? (existing + '\n' + appended) : appended);
}

setCell('updated_by', actor);
setCell('updated_at', now);
sheet.getRange(ref.row, lo + 1, 1, hi - lo + 1).setValues([rowV.slice(lo, hi + 1)]);

return jsonResponse_({ success: true, data: {
purchase_order_id: poId, transition: transition,


order_status: (transition === 'issue') ? 'issued' : undefined,
ui_group: (transition === 'issue') ? 'In Production' : undefined,
document_generation: poDocResult || undefined,
email_sent: (transition === 'issue') ? false : undefined
} });
} finally { if (poIssueLock) { try { poIssueLock.releaseLock(); } catch (e4) {} } }
}







function pcPoPrepareForIssue_(ss, poId, actor, orderDate, depositDue) {
var poLines = sfoReadTable_(ss, 'purchase_order_lines', []).filter(function (l) { return String(l.purchase_order_id || '').trim() === String(poId).trim(); });
var po = null, all = sfoReadTable_(ss, 'purchase_orders', []);
for (var i = 0; i < all.length; i++) { if (String(all[i].purchase_order_id || '').trim() === String(poId).trim()) { po = all[i]; break; } }
var skus = poLines.map(function (l) { return l.sku; }), pi = po ? dgsPoIdentity_(ss, po) : {};
return dgsPoPrepare_(ss, poId, {
actor: actor, require_draft: true,
order_date_candidate: orderDate, deposit_due_date_candidate: depositDue, today: orderDate,
factory_name: dgsFactoryName_(ss, pi.ok ? pi.po.warehouse_id : ''), sku_labels: dgsSkuLabels_(ss, skus)
});
}



function pcPoMarkAttemptFailed_(ss, documentId, rendered) {
return dgsUpdateRegistry_(prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_), documentId, {
status: DGS_ROW_FAILED_, updated_at: shipmentTimestamp_(),
note: dgsEncodeNote_(rendered.reason, dgsRetryable_(rendered.reason),
'Drive generation failed' + (rendered.message ? ': ' + rendered.message : '') + '. The PO remains Draft.' + dgsKeptNote_([rendered.partial_file_id], rendered.partial))
});
}











function handleUpdatePurchaseOrderHeader_(body) { return procLocked_(function () { return poHeaderEdit_(body); }); }
function poHeaderEdit_(body) {
var poId = String((body && body.purchase_order_id) || '').trim();
var actor = String((body && body.actor) || 'operation-system').trim();
if (!poId) return jsonResponse_({ success: false, error: 'Missing purchase_order_id' });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var sheet = ss.getSheetByName('purchase_orders');
if (!sheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found' });

sheetEnsureColumns_(sheet, ['inspection_date', 'expected_completion_date', 'expected_ship_date', 'deposit_due_date', 'note',
'deposit_amount', 'balance_amount', 'paid_amount', 'payment_status', 'updated_by', 'updated_at']);

var ref = procurementFindRow_(sheet, 'purchase_order_id', poId);
if (!ref) return jsonResponse_({ success: false, error: 'Purchase order not found: ' + poId });
var col = ref.col;
var blk6h_ = poRcvHeaderWriteBlock_(ss, poId, col('updated_at') === -1 ? '' : ref.vals[col('updated_at')]);   // R71 small-6: a header edit never washes out a pending receipt
if (blk6h_) return jsonResponse_(blk6h_);
var now = procurementTimestamp_();
function setCell(name, value) { var c = col(name); if (c !== -1) sheet.getRange(ref.row, c + 1).setValue(value); }
function numOrBlank(v) { if (v === '' || v == null) return ''; var n = parseFloat(v); return isNaN(n) ? '' : n; }

var applied = [];

['inspection_date', 'expected_completion_date', 'expected_ship_date', 'deposit_due_date'].forEach(function (f) {
if (body[f] !== undefined) { setCell(f, procurementDateOnly_(body[f])); applied.push(f); }
});

['deposit_amount', 'balance_amount', 'paid_amount'].forEach(function (f) {
if (body[f] !== undefined) { setCell(f, numOrBlank(body[f])); applied.push(f); }
});

if (body.payment_status !== undefined) { setCell('payment_status', String(body.payment_status || '').trim()); applied.push('payment_status'); }
if (body.note !== undefined) { setCell('note', String(body.note || '').trim()); applied.push('note'); }

if (!applied.length) return jsonResponse_({ success: false, error: 'No supported header fields provided' });

setCell('updated_by', actor);
setCell('updated_at', now);

return jsonResponse_({ success: true, data: { purchase_order_id: poId, updated_fields: applied } });
}










function handleUpdatePurchaseOrderLine_(body) { return procLocked_(function () { return poLineEdit_(body); }); }
function poLineEdit_(body) {
var reqLines = (body && body.lines) || [];
if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided' });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var lineSheet = ss.getSheetByName('purchase_order_lines');
var poSheet = ss.getSheetByName('purchase_orders');
if (!lineSheet) return jsonResponse_({ success: false, error: 'purchase_order_lines sheet not found' });
if (!poSheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found' });

var poData = poSheet.getDataRange().getValues();
var poHeaders = poData[0].map(function (h) { return String(h).trim(); });
var poIdCol = poHeaders.indexOf('purchase_order_id');
var poOrderStatusCol = poHeaders.indexOf('order_status');
var poStatusCol = poHeaders.indexOf('status');
var statusById = {};
for (var p = 1; p < poData.length; p++) {
if (poIdCol === -1) continue;
var st = poOrderStatusCol !== -1 ? String(poData[p][poOrderStatusCol]).trim() : '';
if (!st && poStatusCol !== -1) st = String(poData[p][poStatusCol]).trim();
statusById[String(poData[p][poIdCol]).trim()] = st;
}

var data = lineSheet.getDataRange().getValues();
if (data.length < 2) return jsonResponse_({ success: false, error: 'purchase_order_lines is empty' });
var headers = data[0].map(function (h) { return String(h).trim(); });
var col = function (n) { return headers.indexOf(n); };
var idCol = col('purchase_order_line_id');
var poLineIdCol = col('purchase_order_id');
var orderedCol = col('ordered_qty');
var completedCol = col('completed_qty');
var shippedCol = col('shipped_qty');
var remainingCol = col('remaining_qty');
var cartonCol = col('carton_qty');
var upcCol = col('units_per_carton');
var unitCostCol = col('unit_cost');
var lineAmountCol = col('line_amount');
var noteCol = col('note');
var updatedCol = col('updated_at');
if (idCol === -1) return jsonResponse_({ success: false, error: 'purchase_order_line_id column not found' });

var rowById = {};
for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };

var now = procurementTimestamp_();
var updated = 0, skipped = 0;
var affectedPoIds = {};
for (var r = 0; r < reqLines.length; r++) {
var rq = reqLines[r] || {};
var lineId = String(rq.purchase_order_line_id || '').trim();
if (!lineId || !rowById[lineId]) { skipped++; continue; }
var ent = rowById[lineId];
var parentId = poLineIdCol !== -1 ? String(ent.vals[poLineIdCol]).trim() : '';
if (statusById[parentId] !== 'draft') { skipped++; continue; }

var ordered = orderedCol !== -1 ? (parseFloat(ent.vals[orderedCol]) || 0) : 0;
if (rq.ordered_qty !== undefined) {
ordered = parseFloat(rq.ordered_qty); if (isNaN(ordered) || ordered < 0) ordered = 0;
if (orderedCol !== -1) lineSheet.getRange(ent.row, orderedCol + 1).setValue(ordered);
var upc = upcCol !== -1 ? (parseFloat(ent.vals[upcCol]) || 0) : 0;
var carton = (upc > 0) ? Math.ceil(ordered / upc) : 0;
if (cartonCol !== -1) lineSheet.getRange(ent.row, cartonCol + 1).setValue(carton);

var shipped = shippedCol !== -1 ? (parseFloat(ent.vals[shippedCol]) || 0) : 0;
var completedNow = completedCol !== -1 ? (parseFloat(ent.vals[completedCol]) || 0) : 0;
if (remainingCol !== -1) lineSheet.getRange(ent.row, remainingCol + 1).setValue(Math.max(0, completedNow - shipped));
}
var unitCost = unitCostCol !== -1 ? parseFloat(ent.vals[unitCostCol]) : NaN;
if (rq.unit_cost !== undefined) {
var hasUc = (rq.unit_cost !== '' && rq.unit_cost != null && !isNaN(parseFloat(rq.unit_cost)));
unitCost = hasUc ? parseFloat(rq.unit_cost) : NaN;
if (unitCostCol !== -1) lineSheet.getRange(ent.row, unitCostCol + 1).setValue(hasUc ? unitCost : '');
}
if (lineAmountCol !== -1) {
lineSheet.getRange(ent.row, lineAmountCol + 1).setValue(!isNaN(unitCost) ? Math.round(ordered * unitCost * 100) / 100 : '');
}
if (rq.note !== undefined && noteCol !== -1) lineSheet.getRange(ent.row, noteCol + 1).setValue(String(rq.note || '').trim());
if (updatedCol !== -1) lineSheet.getRange(ent.row, updatedCol + 1).setValue(now);
if (parentId) affectedPoIds[parentId] = true;
updated++;
}

Object.keys(affectedPoIds).forEach(function (id) { procurementRecalcPoTotals_(ss, id); });

return jsonResponse_({ success: true, data: { updated: updated, skipped: skipped } });
}































var PROC_BUILD_VERSION_ = "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-R15G-SC1R2-SC2-PG12R3-JR4-SO8-AD3";

function poReceiptEvaluateLine_(inp) {
inp = inp || {};
var ordered = Math.round(Number(inp.ordered) || 0);
var completed = Math.round(Number(inp.completed) || 0);
var shipped = Math.round(Number(inp.shipped) || 0);
var sku = String(inp.sku || '').trim();
var wh = String(inp.supplierWarehouseId || '').trim();
var recv = Number(inp.recvQtyRaw);
if (!wh) return { status: 'error', issue: 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED', detail: 'blank supplier_warehouse_id' };
if (!inp.warehouse) return { status: 'error', issue: 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED', detail: 'warehouse not found: ' + wh };
if (inp.warehouse.isActive !== true) return { status: 'error', issue: 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED', detail: 'warehouse inactive: ' + wh };
if (inp.warehouse.isFactory !== true) return { status: 'error', issue: 'PO_RECEIVE_FACTORY_WAREHOUSE_UNRESOLVED', detail: 'not a factory warehouse: ' + wh };
if (!sku) return { status: 'error', issue: 'PO_RECEIVE_SKU_MISSING', detail: 'blank sku on PO line' };
if (isNaN(recv) || recv <= 0) return { status: 'skip', reason: 'INVALID_OR_ZERO_RECEIVE_QTY' };
var maxRecv = ordered - completed;
if (maxRecv <= 0) return { status: 'skip', reason: 'FULLY_RECEIVED' };












if (recv > maxRecv) {
return { status: 'error', issue: 'PO_RECEIPT_EXCEEDS_REMAINING_QTY',
attempted: recv, remaining: maxRecv, excess: recv - maxRecv, ordered: ordered, completed: completed,
detail: 'attempted ' + recv + ', remaining receivable ' + maxRecv + ', excess ' + (recv - maxRecv) };
}
if (inp.alreadyApplied === true) return { status: 'skip_idempotent', recvQty: recv };
var newCompleted = completed + recv;
return {
status: 'apply', recvQty: recv, newCompleted: newCompleted,
newRemaining: Math.max(0, newCompleted - shipped),
notYetReceivedCommittedQty: Math.max(0, ordered - newCompleted),
completedNotShippedQty: Math.max(0, newCompleted - shipped),
shippedQty: Math.min(newCompleted, shipped)
};
}
function poRcvTruthy_(v) {
if (v === true) return true;
var t = String(v == null ? '' : v).trim().toLowerCase();
return t === 'true' || t === 'yes' || t === 'y' || t === '1' || t === 'x';
}













// PO-RECEIPT-13 (local candidate, 2026-11-02): a receipt fault is told apart from the evidence the receipt itself leaves - its keyed
// po_receipt movement (note po=<PO>|key=<key>|q=<qty>), the PO line cells and the factory_stock cell - and a retry is never answered
// "success" while nothing is recorded:
//   (a)  nothing landed                          -> PO_RECEIPT_NOT_RECORDED        zero writes, retry safe
//   (a') landed; every undo re-read and proven   -> PO_RECEIPT_ROLLED_BACK         retry safe
//   (b)  a retry finds only part of the receipt  -> PO_RECEIPT_PARTIALLY_RECORDED  zero writes
//   (c)  a retry finds all of it, proven         -> success, already_recorded     zero writes
//   anything not proven                          -> PO_RECEIPT_OUTCOME_UNKNOWN     no further write
// No sheet, column, Property, movement type or persistent state is added.
function poRcvKey_(v, tz) {
if (Object.prototype.toString.call(v) === '[object Date]') { try { return Utilities.formatDate(v, tz, 'yyyy-MM-dd HH:mm:ss'); } catch (e) { return 'D' + v.getTime(); } }
if (v === null || v === undefined) return '';
return String(v).trim();
}
function poRcvTzs_(ss) {
var out = [];
try { out.push(ss.getSpreadsheetTimeZone()); } catch (e) {}
try { out.push(Session.getScriptTimeZone()); } catch (e) {}
if (!out.length) out.push('UTC');
return out;
}
function poRcvSame_(a, b, tzs) { for (var i = 0; i < tzs.length; i++) if (poRcvKey_(a, tzs[i]) === poRcvKey_(b, tzs[i])) return true; return false; }
function poRcvNum_(v) { var n = parseFloat(v); return isNaN(n) ? 0 : Math.round(n); }
function poRcvMsg_(e) { return String(e && e.message ? e.message : e); }
function poRcvHdr_(vals) { return ((vals && vals[0]) || []).map(function (h) { return String(h).trim(); }); }
function poRcvStockCols_(st) {
var H = poRcvHdr_(st).map(function (h) { return h.toLowerCase(); });
var c = { wh: H.indexOf('warehouse_id'), sku: H.indexOf('sku'), cur: H.indexOf('fac_current_stock'), res: H.indexOf('fac_reserved_stock'),
lt: H.indexOf('last_transaction_at'), up: H.indexOf('updated_at'), id: H.indexOf('factory_stock_id'), cr: H.indexOf('created_at') };
if (c.cur === -1) c.cur = H.indexOf('current_stock');
if (c.res === -1) c.res = H.indexOf('reserved_stock');
return c;
}
function poRcvStockRowsOf_(st, c, wh, sku) {
var out = [];
if (c.wh === -1 || c.sku === -1) return out;
for (var r = 1; r < st.length; r++) if (String(st[r][c.wh] || '').trim() === wh && String(st[r][c.sku] || '').trim() === sku) out.push(r + 1);
return out;
}
// every keyed po_receipt movement of this PO + key, by line: [{ row, id, q, created, before, after, wh, sku }]
function poRcvMarkers_(mv, poId, key) {
var h = poRcvHdr_(mv), out = {};
var t = h.indexOf('related_entity_type'), li = h.indexOf('related_entity_id'), n = h.indexOf('note'), id = h.indexOf('factory_stock_movement_id'),
cr = h.indexOf('created_at'), b = h.indexOf('before_current_stock'), a = h.indexOf('after_current_stock'), w = h.indexOf('warehouse_id'), s = h.indexOf('sku');
if (t === -1 || li === -1 || n === -1) return out;
for (var k = 1; k < mv.length; k++) {
if (String(mv[k][t] || '').trim() !== 'purchase_order_receipt') continue;
var f = String(mv[k][n] || '').split('|'), q = null;
if (f.indexOf('key=' + key) === -1 || f.indexOf('po=' + poId) === -1) continue;
f.forEach(function (x) { if (x.indexOf('q=') === 0) q = Number(x.slice(2)); });
var lid = String(mv[k][li] || '').trim();
(out[lid] = out[lid] || []).push({ row: k + 1, id: id !== -1 ? String(mv[k][id] || '').trim() : '', q: q, created: cr !== -1 ? mv[k][cr] : '',
before: b !== -1 ? mv[k][b] : '', after: a !== -1 ? mv[k][a] : '', wh: w !== -1 ? String(mv[k][w] || '').trim() : '', sku: s !== -1 ? String(mv[k][s] || '').trim() : '' });
}
return out;
}
// R71 (K1, Owner D3): the PO lines that already carry an IN-SYSTEM receipt - a factory_stock_movements row written by this file's receipt
// (related_entity_type 'purchase_order_receipt', related_entity_id = the purchase_order_line_id), the test poRcvGate_ / poRcvKeyGate_ /
// poRcvMarkers_ apply inline. 79_ and 80_ keep such a line's updated_at: those gates compare it with the movement's created_at. Reads only.
function poRcvLinesWithReceipt_(mv) {
var h = poRcvHdr_(mv), t = h.indexOf('related_entity_type'), li = h.indexOf('related_entity_id'), out = {};
if (t === -1 || li === -1) return out;
for (var k = 1; k < mv.length; k++) if (String(mv[k][t] || '').trim() === 'purchase_order_receipt') { var id = String(mv[k][li] || '').trim(); if (id) out[id] = true; }
return out;
}
// A RETRY: a keyed movement counts as RECORDED only when the PO line still carries it (the line's updated_at is the movement's created_at -
// the receipt writes the line before the movement, and an undo restores updated_at first) and the stock ledger runs on from the movement,
// unbroken, to the stock cell. -> { ok: { line: posting }, bad: [why], poLines: { line: 1 } }. Reads only.
function poRcvVerifyKeyed_(ss, lineSheet, stockSheet, mv, markers, poId) {
var tzs = poRcvTzs_(ss), out = { ok: {}, bad: [], poLines: {} }, LD, ST;
var cx12_ = { ss: ss, tzs: tzs };   // PG12R3 (B-0)
try { LD = lineSheet.getDataRange().getValues(); ST = stockSheet.getDataRange().getValues(); }
catch (e) { out.bad.push('READ_FAILED ' + poRcvMsg_(e)); out.readFailed = true; return out; }
var lh = poRcvHdr_(LD), lId = lh.indexOf('purchase_order_line_id'), lPo = lh.indexOf('purchase_order_id'), lUp = lh.indexOf('updated_at');
var lOr = lh.indexOf('ordered_qty'), lCo = lh.indexOf('completed_qty'), allC = true, anyC = false, hasL = false;
for (var i0 = 1; i0 < LD.length; i0++) if (lId !== -1 && (lPo === -1 || String(LD[i0][lPo]).trim() === poId)) {
out.poLines[String(LD[i0][lId]).trim()] = 1; hasL = true;
var cq = lCo !== -1 ? (parseFloat(LD[i0][lCo]) || 0) : 0; if (cq < (lOr !== -1 ? (parseFloat(LD[i0][lOr]) || 0) : 0)) allC = false; if (cq > 0) anyC = true;
}
out.statusFromLines = hasL && allC ? 'completed' : (anyC ? 'partial_completed' : '');   // informational: what the receipt would have set
var sc = poRcvStockCols_(ST), mh = poRcvHdr_(mv), mW = mh.indexOf('warehouse_id'), mS = mh.indexOf('sku'), mB = mh.indexOf('before_current_stock'), mA = mh.indexOf('after_current_stock');
Object.keys(markers).forEach(function (lid) {
var ms = markers[lid];
if (ms.length !== 1) { out.bad.push(lid + ': ' + ms.length + ' keyed movements'); return; }
var m = ms[0], row = -1;
for (var i = 1; i < LD.length; i++) if (lId !== -1 && String(LD[i][lId]).trim() === lid) { row = i; break; }
if (row === -1 || (lPo !== -1 && String(LD[row][lPo]).trim() !== poId)) { out.bad.push(lid + ': PO_LINE_NOT_FOUND'); return; }
// PO13 r3 (review F5b / X8): the line carries this receipt when its updated_at is this movement's created_at - or when it is the created_at
// of a LATER receipt movement on the same line: that later receipt passed the receive gate (F2), which refuses a line whose newest receipt
// movement it does not carry, so this one was carried when the later one was written.
var lt_ = lUp === -1 ? false : poRcvSame_(LD[row][lUp], m.created, tzs);
if (!lt_ && lUp !== -1) { var mt_ = mh.indexOf('related_entity_type'), mi_ = mh.indexOf('related_entity_id'), mc_ = mh.indexOf('created_at');
for (var q_ = m.row; !lt_ && mt_ !== -1 && mi_ !== -1 && mc_ !== -1 && q_ < mv.length; q_++) if (String(mv[q_][mt_] || '').trim() === 'purchase_order_receipt' && String(mv[q_][mi_] || '').trim() === lid && poRcvSame_(LD[row][lUp], mv[q_][mc_], tzs)) lt_ = true; }
lt_ = poRcvLineCarries_(LD[row], lh, mv, m.row - 1, cx12_, lt_);   // PG12R3 (B-0)
if (!lt_) { out.bad.push(lid + ': LINE_DOES_NOT_CARRY_THE_RECEIPT (line updated_at ' + poRcvKey_(lUp === -1 ? '' : LD[row][lUp], tzs[0]) + ', movement created_at ' + poRcvKey_(m.created, tzs[0]) + ')'); return; }
if (m.q === null || !isFinite(m.q) || poRcvNum_(m.after) !== poRcvNum_(m.before) + m.q) { out.bad.push(lid + ': MOVEMENT_IS_NOT_A_RECEIPT_OF_ITS_QTY'); return; }
var run = poRcvNum_(m.after), broken = '';
if (mW === -1 || mS === -1 || mB === -1 || mA === -1) broken = 'ledger columns missing';
for (var k = m.row; !broken && k < mv.length; k++) {
if (String(mv[k][mW] || '').trim() !== m.wh || String(mv[k][mS] || '').trim() !== m.sku) continue;
if (poRcvNum_(mv[k][mB]) !== run) { broken = 'the ledger breaks at movement row ' + (k + 1); break; }
run = poRcvNum_(mv[k][mA]);
}
var srows = sc.cur === -1 ? [] : poRcvStockRowsOf_(ST, sc, m.wh, m.sku);
if (!broken && srows.length !== 1) broken = srows.length + ' stock rows for ' + m.wh + ' / ' + m.sku;
if (!broken && poRcvNum_(ST[srows[0] - 1][sc.cur]) !== run) broken = 'stock cell ' + poRcvNum_(ST[srows[0] - 1][sc.cur]) + ' is not its ledger ' + run;
if (broken) { out.bad.push(lid + ': STOCK_DOES_NOT_CARRY_THE_RECEIPT (' + broken + ')'); return; }
out.ok[lid] = { purchase_order_line_id: lid, warehouse_id: m.wh, sku: m.sku, qty: m.q, movement_id: m.id, before_current_stock: poRcvNum_(m.before), after_current_stock: poRcvNum_(m.after) };
});
return out;
}
// THE CATCH of a receipt (inside the lock). x.intents / x.hdr were recorded BEFORE each write; x.stockPre is factory_stock read before the
// first write. Re-read what the receipt may have written; each cell is untouched / this receipt's / someone else's. Undo only this receipt's:
// header cells, then line cells (updated_at first), then stock, and the keyed movements LAST - so a stopped undo always leaves its movement
// for a retry to find, and that retry sees the restored line and stops. Someone else's value, a second keyed movement, a failed re-read
// -> UNKNOWN before any write. A restore that throws is re-read (it may have landed); a delete that throws is re-searched.
function poRcvRecover_(x) {
var out = { outcome: 'UNKNOWN', left: [], undone: 0 }, tzs = poRcvTzs_(x.ss);
function same(a, b) { return poRcvSame_(a, b, tzs); }
if (!x.intents.length && !x.hdr.length) { out.outcome = 'NOT_RECORDED'; return out; }
function readAll() {
return { LD: x.lineSheet.getDataRange().getValues(), ST: x.stockSheet.getDataRange().getValues(), MV: x.movSheet.getDataRange().getValues(),
PO: x.hdr.length ? x.poSheet.getDataRange().getValues() : null };
}
function plan(S) {
var tasks = [], foreign = [];
function cell(vals, sheet, label, row, c) {
var v = (vals[row - 1] || [])[c.col];
if (same(v, c.prev)) return;
if (!same(v, c.wrote)) { foreign.push('ANOTHER_WRITER ' + label + ' row ' + row + ' col ' + (c.col + 1) + ': ' + poRcvKey_(v, tzs[0]) + ' (this receipt wrote ' + poRcvKey_(c.wrote, tzs[0]) + ', it was ' + poRcvKey_(c.prev, tzs[0]) + ')'); return; }
tasks.push({ kind: 'cell', sheet: sheet, label: label, row: row, col: c.col, prev: c.prev });
}
if (x.hdr.length) {
var ph = poRcvHdr_(S.PO), pid = ph.indexOf('purchase_order_id'), pr = S.PO[x.hdrRow - 1];
if (!pr || pid === -1 || String(pr[pid]).trim() !== x.poId) foreign.push('PO_HEADER_ROW_MOVED row ' + x.hdrRow);
else for (var h = x.hdr.length - 1; h >= 0; h--) cell(S.PO, x.poSheet, 'purchase_orders', x.hdrRow, x.hdr[h]);
}
var lh = poRcvHdr_(S.LD), lId = lh.indexOf('purchase_order_line_id');
for (var i = x.intents.length - 1; i >= 0; i--) {
var it = x.intents[i], lr = S.LD[it.row - 1];
if (!lr || lId === -1 || String(lr[lId]).trim() !== it.lineId) { foreign.push('PO_LINE_ROW_MOVED ' + it.lineId + ' row ' + it.row); continue; }
it.cells.forEach(function (c) { cell(S.LD, x.lineSheet, 'purchase_order_lines', it.row, c); });
}
if (!x.stockPre) foreign.push('NO_STOCK_PRE_READ');
else {
var pc = poRcvStockCols_(x.stockPre), sc = poRcvStockCols_(S.ST), groups = [], gi = {};
if (sc.cur === -1 || sc.wh === -1 || sc.sku === -1) foreign.push('STOCK_COLUMNS_MISSING');
x.intents.forEach(function (it) { var k = it.wh + '||' + it.sku; if (!gi[k]) { gi[k] = { wh: it.wh, sku: it.sku, qs: [] }; groups.push(gi[k]); } gi[k].qs.push(it.q); });
var delRows = [];
for (var g = groups.length - 1; g >= 0 && !foreign.length; g--) {
var G = groups[g], pre = poRcvStockRowsOf_(x.stockPre, pc, G.wh, G.sku), rowsNow = poRcvStockRowsOf_(S.ST, sc, G.wh, G.sku);
var v0 = pre.length ? poRcvNum_(x.stockPre[pre[0] - 1][pc.cur]) : 0, chain = [v0];
G.qs.forEach(function (q) { chain.push(chain[chain.length - 1] + q); });
if (pre.length) {
if (rowsNow.join(',') !== pre.join(',')) { foreign.push('STOCK_ROWS_CHANGED ' + G.wh + ' / ' + G.sku); break; }
var r0 = pre[0], pv = x.stockPre[r0 - 1];
[[sc.up, pc.up], [sc.lt, pc.lt]].forEach(function (cc) { if (cc[0] !== -1 && cc[1] !== -1) cell(S.ST, x.stockSheet, 'factory_stock', r0, { col: cc[0], prev: pv[cc[1]], wrote: x.now }); });
var cur = S.ST[r0 - 1][sc.cur];
if (!same(cur, pv[pc.cur])) {
var at = String(cur).trim() === '' ? -1 : chain.indexOf(poRcvNum_(cur));
if (at < 1) foreign.push('ANOTHER_WRITER factory_stock row ' + r0 + ' current ' + poRcvKey_(cur, tzs[0]) + ' (this receipt moves it along ' + chain.join(' > ') + ')');
else
tasks.push({ kind: 'cell', sheet: x.stockSheet, label: 'factory_stock', row: r0, col: sc.cur, prev: pv[pc.cur] });
}
} else if (rowsNow.length === 1) {
var nr = S.ST[rowsNow[0] - 1];
var mine = chain.indexOf(poRcvNum_(nr[sc.cur])) !== -1 && (sc.res === -1 || poRcvNum_(nr[sc.res]) === 0) && (sc.id === -1 || String(nr[sc.id]).trim() === 'FS-' + G.wh + '-' + G.sku);
if (!mine) { foreign.push('STOCK_ROW_NOT_THIS_RECEIPTS row ' + rowsNow[0] + ' ' + G.wh + ' / ' + G.sku); break; }
delRows.push({ kind: 'stockRow', sheet: x.stockSheet, row: rowsNow[0], wh: G.wh, sku: G.sku });
} else if (rowsNow.length > 1) { foreign.push('STOCK_ROWS_ADDED ' + G.wh + ' / ' + G.sku + ' x' + rowsNow.length); break; }
}
delRows.sort(function (a, b) { return b.row - a.row; }).forEach(function (d) { tasks.push(d); });
}
var M = poRcvMarkers_(S.MV, x.poId, x.key), mine2 = {}, marks = [];
x.intents.forEach(function (it) { mine2[it.lineId] = it; });
Object.keys(M).forEach(function (lid) {
var it = mine2[lid];
if (!it) { foreign.push('KEYED_MOVEMENT_FOR_ANOTHER_LINE ' + lid); return; }
if (M[lid].length !== 1) { foreign.push('KEYED_MOVEMENTS x' + M[lid].length + ' ' + lid); return; }
var m = M[lid][0];
if (m.wh !== it.wh || m.sku !== it.sku || m.q !== it.q) { foreign.push('KEYED_MOVEMENT_NOT_THIS_RECEIPTS ' + lid + ' row ' + m.row); return; }
marks.push({ kind: 'movement', sheet: x.movSheet, row: m.row, id: m.id, lineId: lid });
});
marks.sort(function (a, b) { return b.row - a.row; });
marks.forEach(function (d) { tasks.push(d); });
return { tasks: tasks, foreign: foreign };
}
var S, P;
try { S = readAll(); } catch (eR) { out.left.push('RE_READ_FAILED: ' + poRcvMsg_(eR)); return out; }
P = plan(S);
if (P.foreign.length) { out.left = P.foreign.slice(); return out; }
if (!P.tasks.length) { out.outcome = 'NOT_RECORDED'; return out; }
function stop(why) { out.left.push(why); return out; }
for (var t = 0; t < P.tasks.length; t++) {
var k = P.tasks[t];
if (k.kind === 'cell') {
try { k.sheet.getRange(k.row, k.col + 1).setValue(k.prev); }
catch (eW) {
var v2, okR = false;
try { v2 = k.sheet.getRange(k.row, k.col + 1).getValue(); okR = same(v2, k.prev); } catch (eQ) {}
if (!okR) return stop('RESTORE_FAILED ' + k.label + ' row ' + k.row + ' col ' + (k.col + 1) + ': ' + poRcvMsg_(eW));
}
} else if (k.kind === 'movement') {
var mrow, mhd;
try { mhd = poRcvHdr_(k.sheet.getRange(1, 1, 1, Math.max(1, k.sheet.getLastColumn())).getValues()); mrow = k.sheet.getRange(k.row, 1, 1, mhd.length).getValues()[0]; }
catch (eM) { return stop('MOVEMENT_RE_READ_FAILED row ' + k.row + ': ' + poRcvMsg_(eM)); }
var ic = mhd.indexOf('factory_stock_movement_id'), nc = mhd.indexOf('note');
if (ic === -1 || String(mrow[ic]).trim() !== k.id || nc === -1 || String(mrow[nc]).split('|').indexOf('key=' + x.key) === -1) return stop('MOVEMENT_ROW_MOVED row ' + k.row + ' (' + k.id + ')');
try { k.sheet.deleteRow(k.row); }
catch (eD) {
var still = true;
try { var M2 = poRcvMarkers_(k.sheet.getDataRange().getValues(), x.poId, x.key); still = !!(M2[k.lineId] && M2[k.lineId].length); } catch (eS) {}
if (still) return stop('MOVEMENT_DELETE_FAILED row ' + k.row + ' (' + k.id + '): ' + poRcvMsg_(eD));
}
} else if (k.kind === 'stockRow') {
var sv, scx;
try { var sAll = k.sheet.getDataRange().getValues(); scx = poRcvStockCols_(sAll); sv = sAll[k.row - 1]; }
catch (eS2) { return stop('STOCK_RE_READ_FAILED row ' + k.row + ': ' + poRcvMsg_(eS2)); }
if (!sv || String(sv[scx.wh] || '').trim() !== k.wh || String(sv[scx.sku] || '').trim() !== k.sku) return stop('STOCK_ROW_MOVED row ' + k.row);
try { k.sheet.deleteRow(k.row); }
catch (eD2) {
var left2 = 1;
try { left2 = poRcvStockRowsOf_(k.sheet.getDataRange().getValues(), scx, k.wh, k.sku).length; } catch (eS3) {}
if (left2) return stop('STOCK_ROW_DELETE_FAILED row ' + k.row + ': ' + poRcvMsg_(eD2));
}
}
out.undone++;
}
try { SpreadsheetApp.flush(); } catch (eF) { return stop('FLUSH_FAILED: ' + poRcvMsg_(eF)); }
var S2, P2;
try { S2 = readAll(); } catch (eR2) { return stop('POST_CHECK_READ_FAILED: ' + poRcvMsg_(eR2)); }
P2 = plan(S2);
if (P2.foreign.length || P2.tasks.length) { out.left = P2.foreign.concat(P2.tasks.map(function (q) { return 'NOT_RESTORED ' + (q.label || q.kind) + ' row ' + q.row; })); return out; }
out.outcome = 'ROLLED_BACK';
return out;
}
// PO13 r3 (review F2): the receive gate. -> null | { code, text, why: [] }. Reads only (the caller's in-lock reads are reused).
// PO13 r5 (REVIEW_LAYERS2 L3-1a/b, L3-3): the newest receipt key of this PO (by row; the ledger is append-only) must be carried by EVERY line it
// names (its movements' note lines=...): a named line with no movement of that key, or whose updated_at is not that movement's created_at (in any
// zone), means that receipt was cut off part way. Judged by identity, not by clock order, so a later PO header edit neither hides it nor blocks a
// whole one. A key written before r5 (no lines= in its note) is not judged here: the r4 header order check applies to it. -> null | { judged, bad, why }
// PG12R3 (B-0, Owner batch PG12R3 + B-0 2026-11-13). 'Did UI receipt movement M land on PO line L?' is no longer read from L.updated_at, which
// 82_ / 79_ / 80_ / 13_ line edits also write. Carried when ANY holds (checked 1, 3/4, then 2, so the import record is read only if needed): (1) a LATER UI receipt movement on L exists (it passed this gate, so M was carried);
// (2) a COMMITTED import (import_batch_changes, entity_table purchase_order_lines, line_id = L, field updated_at) wrote L at a stamp strictly
// after M - a legal later write supersedes; r3 82_ refuses to write a line whose receipt is unresolved, so (2) never hides a cut-off made under r3;
// (3) M carries its own marker c0= (L.completed_qty before M; written by r3 receipts): carried iff completed_qty = c0 + q and remaining_qty is
// completed - shipped (the order the receipt writes them); (4) a receipt written before r3 (no c0=) keeps the caller's own r4 / r5 rule.
// Only (4) still looks at updated_at, and only for receipts made before PG12R3. The PO header check (header written LAST) is unchanged.
// poStampAfter_: true when the 'yyyy-MM-dd HH:mm:ss' wall text nowText (script zone, as procurementTimestamp_ / imbNow_ write it) is strictly
// later than the stamp cell cur. A text cell is compared as written; a Date cell (Sheets parsed the written text in the SPREADSHEET zone) is
// turned back into that text with the spreadsheet zone (tzs[0]). Any other text: only 'not the same text' can be said.
function poStampAfter_(nowText, cur, tzs) {
if (cur === null || cur === undefined || String(cur).trim() === '') return true;
var n = String(nowText).trim(), t = poRcvKey_(cur, tzs[0]);   // JR4 (review R3-M1): a Date cell is the stamp text Sheets parsed in the SPREADSHEET zone (13_/82_ write 'yyyy-MM-dd HH:mm:ss' text, no number format); formatting it back in that zone returns the written wall-clock text, which is what is compared with now (12_ editNextStamp_ convention). JR2b script-zone formatting withdrawn.
if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}$/.test(t)) return t !== n;
return n > t;
}
// JR2 (review J-M1): a line stamp 3 s or more AFTER now cannot be overtaken by waiting inside the lock. It is refused at once with its own code,
// retry_safe false, naming each line and its stamp. Nothing is corrected automatically: an owner must review that updated_at cell.
function poStampFutureCut_(sec) { return Utilities.formatDate(new Date(new Date().getTime() + sec * 1000), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss'); }
function poStampScriptTz_() { try { return Session.getScriptTimeZone(); } catch (e) { return 'UTC'; } }
// JR2b (Owner B): what a refused line carries - its stored value as compared (Date cells shown in the script zone), the cell type and both zones.
function poStampLineInfo_(id, v, tzs) { var isD = Object.prototype.toString.call(v) === '[object Date]', st = poStampScriptTz_(), sp = (tzs && tzs.length > 1) ? tzs[0] : st;
return { purchase_order_line_id: id, updated_at: poRcvKey_(v, tzs[0]), read_as: 'wall-clock text in the spreadsheet zone', cell_type: isD ? 'DATE' : 'TEXT', classification: 'STAMP_AHEAD_OF_CLOCK', script_tz: st, spreadsheet_tz: sp }; }
function poStampZoneNote_(bad) { var t = (bad || []).filter(function (b) { return b.script_tz !== b.spreadsheet_tz; })[0];   // JR4 (R3-M1): DATE and TEXT alike
return t ? ' The spreadsheet time zone (' + t.spreadsheet_tz + ') differs from the script time zone (' + t.script_tz + '): every stamp is compared as the wall-clock time the sheet shows, so a time entered or converted in another zone can look ahead. Check that cell before anything else.' : ''; }
function poRcvFutureOut_(poId, idemKey, bad, nowText) {
return jsonResponse_({ success: false, code: 'PO_RECEIPT_LINE_STAMP_IN_FUTURE', stage: 'stamp', purchase_order_id: poId,
data: { zero_write: true, retry_safe: false, classification: 'STAMP_AHEAD_OF_CLOCK', idempotency_key: idemKey, now: nowText, lines: bad },
error: 'PO line ' + bad.map(function (b) { return b.purchase_order_line_id + ' (updated_at ' + b.updated_at + ')'; }).join(', ') + ' carries a time stamp that is not earlier than now (' + nowText + '). A receipt must stamp the line strictly later, so nothing was received. Resending will not help while that stamp is ahead of the clock; an owner must review that updated_at cell. Nothing was corrected automatically.' + poStampZoneNote_(bad), zero_write: true });
}
function poRcvImportStamps_(ctx) {   // line id -> [stamps the COMMITTED imports wrote into its updated_at]; {} when the import record cannot be read
if (ctx.imp) return ctx.imp; ctx.imp = {};
try {
var B = ctx.ss && ctx.ss.getSheetByName('import_batches'), C = ctx.ss && ctx.ss.getSheetByName('import_batch_changes'); if (!B || !C) return ctx.imp;
var bv = B.getDataRange().getValues(), bh = poRcvHdr_(bv), bi = bh.indexOf('import_batch_id'), bs = bh.indexOf('status'), st = {};
var cv = C.getDataRange().getValues(), ch = poRcvHdr_(cv), ci = ch.indexOf('import_batch_id'), ct = ch.indexOf('entity_table'), cl = ch.indexOf('line_id'), cf = ch.indexOf('field'), ca = ch.indexOf('after_value');
if (bi === -1 || bs === -1 || ci === -1 || ct === -1 || cl === -1 || cf === -1 || ca === -1) return ctx.imp;
for (var b = 1; b < bv.length; b++) { var id = String(bv[b][bi] == null ? '' : bv[b][bi]).trim(); if (id) st[id] = st.hasOwnProperty(id) ? '#DUPLICATE' : String(bv[b][bs] == null ? '' : bv[b][bs]).trim().toUpperCase(); }
for (var c = 1; c < cv.length; c++) { if (String(cv[c][ct]).trim() !== 'purchase_order_lines' || String(cv[c][cf]).trim() !== 'updated_at' || st[String(cv[c][ci]).trim()] !== 'COMMITTED') continue;
var l = String(cv[c][cl] == null ? '' : cv[c][cl]).trim(); if (l) (ctx.imp[l] = ctx.imp[l] || []).push(cv[c][ca]); }
} catch (e) { ctx.imp = {}; }
return ctx.imp;
}
function poRcvLineCarries_(row, lh, mv, k, ctx, legacyOk) {
var mh = poRcvHdr_(mv), t = mh.indexOf('related_entity_type'), li = mh.indexOf('related_entity_id'), cr = mh.indexOf('created_at'), n = mh.indexOf('note');
var lid = String(row[lh.indexOf('purchase_order_line_id')] == null ? '' : row[lh.indexOf('purchase_order_line_id')]).trim();
if (k < 1 || t === -1 || li === -1 || cr === -1) return !!legacyOk;
for (var q = k + 1; q < mv.length; q++) if (String(mv[q][t] || '').trim() === 'purchase_order_receipt' && String(mv[q][li] || '').trim() === lid) return true;   // (1)
var f = n === -1 ? [] : String(mv[k][n] || '').split('|'), c0 = null, qq = null, own;
f.forEach(function (x) { if (x.indexOf('c0=') === 0) c0 = Number(x.slice(3)); else if (x.indexOf('q=') === 0) qq = Number(x.slice(2)); });
if (c0 !== null && isFinite(c0) && qq !== null && isFinite(qq)) {   // (3) the receipt's own marker
var cc = lh.indexOf('completed_qty'), rc = lh.indexOf('remaining_qty'), sc = lh.indexOf('shipped_qty');
own = cc !== -1 && poRcvNum_(row[cc]) === c0 + qq && !(rc !== -1 && String(row[rc] == null ? '' : row[rc]).trim() !== '' && poRcvNum_(row[rc]) !== Math.max(0, poRcvNum_(row[cc]) - (sc === -1 ? 0 : poRcvNum_(row[sc]))));
} else own = !!legacyOk;   // (4) a receipt written before PG12R3: the caller's own r4 / r5 rule
if (own) return true;
var stamps = poRcvImportStamps_(ctx)[lid] || [];   // (2), read only when (3) / (4) did not prove it
for (var s = 0; s < stamps.length; s++) if (poStampAfter_(poRcvKey_(stamps[s], ctx.tzs[0]), mv[k][cr], ctx.tzs)) return true;
return false;
}
// PG12R3 (m-5 / M-C): the precondition READ. receivePurchaseOrderLines with mode 'preconditions' answers, for one PO, each line's state as a
// receipt must quote it back (expected_completed_qty, expected_line_updated_at: a Date cell as ISO, text as stored, blank as ''). It reads only
// (no lock, no column provisioning, nothing written) and is the Receive modal's single source in Workspace AND Legacy mode.
function poRcvPreconditionsRead_(poId) {
if (!poId) return { success: false, error: 'Missing purchase_order_id', zero_write: true };
var ss = SpreadsheetApp.getActiveSpreadsheet(), ls = ss.getSheetByName('purchase_order_lines'), ps = ss.getSheetByName('purchase_orders');
if (!ls || !ps) return { success: false, code: 'PO_RECEIPT_PRECONDITIONS_UNREADABLE', error: 'purchase_order_lines / purchase_orders sheet not found', zero_write: true };
var ref = procurementFindRow_(ps, 'purchase_order_id', poId); if (!ref) return { success: false, error: 'Purchase order not found: ' + poId, zero_write: true };
var v = ls.getDataRange().getValues(), h = poRcvHdr_(v), c = function (x) { return h.indexOf(x); };
if (c('purchase_order_line_id') === -1 || c('purchase_order_id') === -1 || c('completed_qty') === -1 || c('updated_at') === -1) return { success: false, code: 'PO_RECEIPT_PRECONDITIONS_UNREADABLE', error: 'purchase_order_lines is missing purchase_order_line_id / purchase_order_id / completed_qty / updated_at', zero_write: true };
function tok(u) { if (u === null || u === undefined || String(u).trim() === '') return ''; return Object.prototype.toString.call(u) === '[object Date]' ? u.toISOString() : String(u).trim(); }
function cell(r, x) { return c(x) === -1 ? '' : v[r][c(x)]; }
var out = [];
for (var r = 1; r < v.length; r++) { if (String(v[r][c('purchase_order_id')]).trim() !== poId) continue;
var cq = v[r][c('completed_qty')], n = (cq === null || cq === undefined || String(cq).trim() === '') ? 0 : Number(cq);
out.push({ purchase_order_line_id: String(v[r][c('purchase_order_line_id')]).trim(), sku: String(cell(r, 'sku')).trim(), ordered_qty: Number(cell(r, 'ordered_qty')) || 0,
completed_qty: isFinite(n) ? n : 0, shipped_qty: Number(cell(r, 'shipped_qty')) || 0, expected_completed_qty: isFinite(n) ? n : String(cq), expected_line_updated_at: tok(v[r][c('updated_at')]) }); }
var sc = ref.col('order_status');
return { success: true, code: 'PO_RECEIPT_PRECONDITIONS', data: { purchase_order_id: poId, po_no: ref.col('po_no') === -1 ? '' : String(ref.vals[ref.col('po_no')]).trim(), order_status: sc === -1 ? '' : String(ref.vals[sc]).trim(), lines: out, zero_write: true } };
}
function poRcvKeyGate_(data, headers, mv, poId, tzs, ss12) {   // PG12R3: ss12 (optional) lets a later import supersede
var cx12_ = { ss: ss12, tzs: tzs };
var H = poRcvHdr_(mv), t = H.indexOf('related_entity_type'), li = H.indexOf('related_entity_id'), cr = H.indexOf('created_at'), n = H.indexOf('note');
var pI = headers.indexOf('purchase_order_id'), lI = headers.indexOf('purchase_order_line_id'), uc = headers.indexOf('updated_at');
if (t === -1 || li === -1 || cr === -1 || n === -1 || pI === -1 || lI === -1 || uc === -1) return null;
var rowOf = {}; for (var j = 1; j < data.length; j++) if (String(data[j][pI] || '').trim() === poId) rowOf[String(data[j][lI] || '').trim()] = j;
var last = -1; for (var k = 1; k < mv.length; k++) if (String(mv[k][t] || '').trim() === 'purchase_order_receipt' && rowOf.hasOwnProperty(String(mv[k][li] || '').trim())) last = k;
if (last === -1) return null;
function fld(row, name) { var f = String(mv[row][n] || '').split('|'); for (var i = 0; i < f.length; i++) if (f[i].indexOf(name + '=') === 0) return f[i].slice(name.length + 1); return null; }
var key = fld(last, 'key'), lines = fld(last, 'lines');
if (key === null || lines === null) return null;
var byLine = {}; for (var k2 = 1; k2 < mv.length; k2++) if (String(mv[k2][t] || '').trim() === 'purchase_order_receipt' && fld(k2, 'key') === key && fld(k2, 'po') === poId) byLine[String(mv[k2][li] || '').trim()] = mv[k2];
var why = [];
lines.split(',').filter(function (x) { return x; }).forEach(function (L) {
var m = byLine[L], r = rowOf[L];
if (!m) why.push(L + ': receipt key ' + key + ' names this line but has no movement on it (cut off before it)');
else if (r === undefined || !poRcvLineCarries_(data[r], headers, mv, mv.indexOf(m), cx12_, poRcvSame_(data[r][uc], m[cr], tzs))) why.push(L + ': the line (' + (r === undefined ? 'missing' : poRcvKey_(data[r][uc], tzs[0])) + ') does not carry receipt key ' + key + ' (' + poRcvKey_(m[cr], tzs[0]) + ')');
});
return { judged: true, bad: why.length > 0, why: why, key: key, createdAt: mv[last][cr] };   // R71 small-5: the newest key and its movement stamp (the header check below)
}
// R71 small-6: the newest receipt key of PO poId whose movement stamp is LATER than the PO header stamp (hdrUp) - the header, the receipt-level commit
// marker, does not carry it. -> null, or { key, createdAt (text), createdAtRaw (the cell), header (text), linesBad (its lines do not carry it either) },
// or { unknown: why } when the books cannot be read. cache = { data, mv } (optional, filled on first read). Reads only. A blank header (legacy) and a
// newest movement without key= / lines= (pre-r5) are not judged, as in r4 / r5.
function poRcvHeaderPending_(ss, poId, hdrUp, cache) {
cache = cache || {};
try {
if (!cache.data) { var ls_ = ss.getSheetByName('purchase_order_lines'); cache.data = ls_ ? ls_.getDataRange().getValues() : []; }
if (!cache.mv) { var ms_ = ss.getSheetByName('factory_stock_movements'); cache.mv = ms_ ? ms_.getDataRange().getValues() : []; }
} catch (eR6_) { return { unknown: 'READ_FAILED ' + poRcvMsg_(eR6_) }; }
if (!cache.data.length || !cache.mv.length) return null;
var tzs = poRcvTzs_(ss), kg = poRcvKeyGate_(cache.data, poRcvHdr_(cache.data), cache.mv, poId, tzs, ss);
if (!kg || !kg.judged || kg.createdAt === undefined) return null;
var hk = poRcvKey_(hdrUp, tzs[0]), mk = poRcvKey_(kg.createdAt, tzs[0]);
if (hk === '' || mk === '' || poRcvSame_(hdrUp, kg.createdAt, tzs) || !(mk > hk)) return null;
return { key: kg.key, createdAt: mk, createdAtRaw: kg.createdAt, header: hk, linesBad: !!kg.bad };
}
// R71 small-6 (Owner decision): every writer of purchase_orders refuses, with zero writes, while poRcvHeaderPending_ holds for that PO - no other
// write may wash out the receipt evidence the header stamp is. -> null, or the refusal body.
function poRcvHeaderWriteBlock_(ss, poId, hdrUp, cache) {
var p = poRcvHeaderPending_(ss, poId, hdrUp, cache); if (!p) return null;
if (p.unknown) return { success: false, code: 'PO_RECEIPT_HEADER_STATE_UNKNOWN', purchase_order_id: poId, data: { zero_write: true, why: p.unknown }, error: 'The receipt evidence of this PO could not be read (' + p.unknown + '). Nothing was changed; try again once it can be read.' };
return { success: false, code: 'PO_RECEIPT_HEADER_PENDING', purchase_order_id: poId, data: { zero_write: true, receipt_key: p.key, receipt_at: p.createdAt, header_at: p.header, lines_carry_it: !p.linesBad },
error: 'Receipt ' + p.key + ' on this PO (' + p.createdAt + ') was cut off before the PO header was written (header ' + p.header + '). Nothing was changed. ' + (p.linesBad ? 'Its lines do not carry it either: the PO needs an Owner-reviewed correction before anything else.' : 'Send that receipt again with the SAME key (receipt key ' + p.key + '): it completes the header; then change this PO.') };
}
function poRcvGate_(ss, data, headers, plans, mv, st, stockSheet, movSheet, poId, hdrUp, opts12) {   // PG12R3: opts12.receiptOnly (82_ UPDATE_REMAINING) skips the stock-books part
var cx12_ = { ss: ss, tzs: poRcvTzs_(ss) };   // PG12R3 (B-0)
var tzs = poRcvTzs_(ss), H = poRcvHdr_(mv), t = H.indexOf('related_entity_type'), li = H.indexOf('related_entity_id'), cr = H.indexOf('created_at'), why = [];
var uc = headers.indexOf('updated_at');
plans.forEach(function (ev) {
if (ev.status !== 'apply' || t === -1 || li === -1 || cr === -1) return;
var last = null;
for (var k = 1; k < mv.length; k++) if (String(mv[k][t] || '').trim() === 'purchase_order_receipt' && String(mv[k][li] || '').trim() === ev.lineId) last = mv[k];
if (!last) return;
var mc = poRcvKey_(last[cr], tzs[0]), lu = uc === -1 ? '' : poRcvKey_(data[ev.row - 1][uc], tzs[0]);
if (!poRcvLineCarries_(data[ev.row - 1], headers, mv, mv.indexOf(last), cx12_, !(mc > lu))) why.push(ev.lineId + ': its newest receipt movement (' + mc + ') is later than the line (' + (lu || 'blank') + ') - an earlier receipt is unresolved');
});
if (why.length) return { code: 'PO_RECEIPT_LINE_UNRESOLVED', text: 'An earlier receipt on this line is not resolved', why: why };
var kg_ = poRcvKeyGate_(data, headers, mv, poId, tzs, ss);
if (kg_ && kg_.bad) return { code: 'PO_RECEIPT_RECEIPT_UNRESOLVED', text: 'An earlier receipt on this PO was cut off part way (a line it names does not carry it)', why: kg_.why };
// R71 small-5 (review R71-FE M-2): the PO header is the receipt-level commit marker (written LAST, after every line, with the movement's own stamp). Every line
// of the newest key carries it, but a header stamp EARLIER than its movement means the header stage was cut: that receipt is not proven complete, so a
// NEW key is refused (zero writes). Its own key is resent through the idempotency path above (unchanged). A blank header stamp (legacy) is not judged, as in r4.
if (kg_ && kg_.judged && !kg_.bad && kg_.createdAt !== undefined) { var hk5_ = poRcvKey_(hdrUp, tzs[0]), mk5_ = poRcvKey_(kg_.createdAt, tzs[0]);
  if (hk5_ !== '' && mk5_ !== '' && !poRcvSame_(hdrUp, kg_.createdAt, tzs) && mk5_ > hk5_) return { code: 'PO_RECEIPT_RECEIPT_UNRESOLVED', text: 'An earlier receipt on this PO was cut off before its PO header was written (the lines carry it, the header does not)', why: [poId + ': receipt key ' + kg_.key + ' (' + mk5_ + ') is later than the PO header (' + hk5_ + ') - send that receipt again with its own key, or set the PO status from the PO screen'] }; }
if (!(typeof kg_ !== 'undefined' && kg_ && kg_.judged)) {   // PO13 r5: the r4 header order check only for a key written before r5
// PO13 r4 (REVIEW_LAYERS L3-1): a receipt is whole only when the PO header's updated_at (written LAST, after every line) carries it. If the newest
// receipt movement of ANY line of this PO is later than the header, an earlier receipt was cut off part way (its other lines and the header not
// written): every receipt on the PO is refused, whatever the key and whichever lines it names. A blank header stamp (legacy) is not judged.
var pI_ = headers.indexOf('purchase_order_id'), lI_ = headers.indexOf('purchase_order_line_id'), hu_ = poRcvKey_(hdrUp, tzs[0]), poLines_ = {}, newest_ = null;
if (pI_ !== -1 && lI_ !== -1 && hu_ !== '' && t !== -1 && li !== -1 && cr !== -1) {
for (var j_ = 1; j_ < data.length; j_++) if (String(data[j_][pI_] || '').trim() === poId) poLines_[String(data[j_][lI_] || '').trim()] = true;
for (var k_ = 1; k_ < mv.length; k_++) if (String(mv[k_][t] || '').trim() === 'purchase_order_receipt' && poLines_[String(mv[k_][li] || '').trim()] === true) newest_ = { c: poRcvKey_(mv[k_][cr], tzs[0]), line: String(mv[k_][li] || '').trim() };   // the NEWEST by row (the ledger is append-only), as the line gate
if (newest_ && newest_.c > hu_) return { code: 'PO_RECEIPT_RECEIPT_UNRESOLVED', text: 'An earlier receipt on this PO was cut off part way (not every line and the PO header carry it)', why: [poId + ': the newest receipt movement (' + newest_.line + ', ' + newest_.c + ') is later than the PO header (' + hu_ + ')'] };
}
}
if (!(opts12 && opts12.receiptOnly) && typeof shipmentReservationBooks_ === 'function' && typeof SHIPMENT_DOMAIN_FACTORY_ !== 'undefined') {
var byWh = {}; plans.forEach(function (ev) { if (ev.status === 'apply') (byWh[ev.warehouseId] = byWh[ev.warehouseId] || []).push(ev.sku); });
Object.keys(byWh).forEach(function (wh) { var b = shipmentReservationBooks_(SHIPMENT_DOMAIN_FACTORY_, { stockSheet: stockSheet, movSheet: movSheet }, wh, byWh[wh], { pre: { st: st, mv: mv } });
if (!b || b.verdict !== 'RECONCILED') why = why.concat((b && b.mismatched) || [], (b && b.unknown) || [], b ? [] : [wh + ' NO_VERDICT']); });
if (why.length) return { code: 'PO_RECEIPT_STOCK_BOOKS_UNKNOWN', text: 'Factory stock of this line is not proven against its ledger', why: why };
}
return null;
}
// PG12R2 (G-2, Owner batch B r2 2026-11-13). THE PRECONDITION: every line a NEW receipt receives (receive_qty > 0, a line of THIS PO) carries what the
// sender read: expected_completed_qty (that line's completed_qty) AND expected_line_updated_at (that line's updated_at as read; '' for a blank cell).
// Every writer of purchase_order_lines.completed_qty stamps updated_at with its own time (13_ receipt - on a second the line does not already hold -
// and 82_ NEW_RECEIPT / UPDATE_REMAINING), so 40 -> 80 -> 40 moves the stamp even when the value returns. Compared in the lock with the line now:
// missing -> PO_RECEIPT_PRECONDITION_MISSING, malformed -> PO_RECEIPT_PRECONDITION_INVALID, different -> PO_RECEIPT_PRECONDITION_STALE (zero writes).
// Lines of another PO and unknown lines are skipped, as before, before anything is judged. The server never re-reads or retries for the sender.
function poRcvStampSame_(cell, sent, tzs) {
var s = String(sent).trim();
if (cell === null || cell === undefined || String(cell).trim() === '') return s === '';
if (Object.prototype.toString.call(cell) === '[object Date]') {
if (/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(Z|[+-][0-9]{2}:?[0-9]{2})$/.test(s)) { var ms = Date.parse(s); return isFinite(ms) && ms === cell.getTime(); }
return poRcvSame_(cell, s, tzs);
}
return String(cell).trim() === s;
}
function poRcvPrecondition_(reqLines, rowById, completedCol, updatedCol, poLineIdCol, poId, idemKey, tzs) {
var missing = [], bad = [], stale = [];
reqLines.forEach(function (rq) {
rq = rq || {}; var q = Number(rq.receive_qty); if (!(isFinite(q) && q > 0)) return;
var id = String(rq.purchase_order_line_id == null ? '' : rq.purchase_order_line_id).trim();
var ent = Object.prototype.hasOwnProperty.call(rowById, id) ? rowById[id] : null;
if (!ent || (poLineIdCol !== -1 && String(ent.vals[poLineIdCol]).trim() !== poId)) return;   // m-3: not a line of this PO -> skipped below, as before
var e = rq.expected_completed_qty, u = rq.expected_line_updated_at, n = NaN;
if (e === undefined || e === null || (typeof e === 'string' && e.trim() === '') || u === undefined || u === null) { missing.push(id); return; }
if (typeof e === 'number') n = e; else if (typeof e === 'string' && /^[0-9]+([.][0-9]+)?$/.test(e.trim())) n = Number(e.trim());
if (!isFinite(n) || n < 0 || typeof u !== 'string' || u.length > 64) { bad.push(id + ' (' + String(e) + ' / ' + String(u).slice(0, 40) + ')'); return; }
var raw = ent.vals[completedCol], cur = (raw === null || raw === undefined || String(raw).trim() === '') ? 0 : Number(raw);
var up = updatedCol === -1 ? undefined : ent.vals[updatedCol];
if (!isFinite(cur) || cur !== n || updatedCol === -1 || !poRcvStampSame_(up, u, tzs)) stale.push({ purchase_order_line_id: id, expected_completed_qty: n, current_completed_qty: isFinite(cur) ? cur : String(raw),
expected_line_updated_at: u, current_line_updated_at: updatedCol === -1 ? '(no updated_at column)' : poRcvKey_(up, tzs[0]) });
});
if (!missing.length && !bad.length && !stale.length) return null;
var code = missing.length ? 'PO_RECEIPT_PRECONDITION_MISSING' : (bad.length ? 'PO_RECEIPT_PRECONDITION_INVALID' : 'PO_RECEIPT_PRECONDITION_STALE');
var msg = missing.length ? 'This receipt does not say which state of the PO line it was entered against (expected_completed_qty / expected_line_updated_at missing on ' + missing.join(', ') + '). Nothing was received. Reload the PO and enter the receipt again.'
: (bad.length ? 'The receipt precondition is malformed (' + bad.join(', ') + '). Nothing was received.'
: 'This PO line changed after the receipt was entered (' + stale.map(function (s) { return s.purchase_order_line_id + ': Completed Qty ' + s.expected_completed_qty + ' when read, ' + s.current_completed_qty + ' now; the line was last written at ' + s.current_line_updated_at + ', after it was read'; }).join('; ') + '). Nothing was received. Reload the PO, check what is already received, and enter a receipt only for what is still due.');
return { success: false, code: code, stage: 'precondition', purchase_order_id: poId,
data: { zero_write: true, retry_safe: false, receipt_key_recorded: false, idempotency_key: idemKey, missing: missing, invalid: bad, stale: stale }, error: msg, zero_write: true };
}
// PG12R2 (m-1): THE REQUEST IDENTITY of a page receipt. A page key has the form PORCV-UI2-<32 hex>-<16 hex>; the last 16 hex are the first 16 of
// sha256(JSON.stringify(['PORCV-UI2', purchase_order_id, lines])) where lines = [[line id, receive_qty, expected_completed_qty, expected_line_updated_at]
// each as String (null when absent)] sorted by line id. A key resent with any other line, quantity or precondition is refused before any read
// (PO_RECEIPT_REQUEST_IDENTITY_MISMATCH); a NEW receipt (key not on the ledger) under any other client key is refused in the lock
// (PO_RECEIPT_REQUEST_IDENTITY_UNBOUND). No state is stored: the key itself carries the content it was minted for. A recorded key keeps its
// unchanged idempotency answer; a request without a key gets a server key, as before.
var PO_RCV_BOUND_KEY_RE_ = /^PORCV-UI2-[0-9a-f]{32}-[0-9a-f]{16}$/;
function poRcvRequestDigest_(poId, reqLines) {
function v_(x) { return x === undefined || x === null ? null : String(x); }
var arr = (reqLines || []).map(function (l) { l = l || {}; return [v_(l.purchase_order_line_id), v_(l.receive_qty), v_(l.expected_completed_qty), v_(l.expected_line_updated_at)]; });
arr.sort(function (a, b) { var x = String(a[0]), y = String(b[0]); return x < y ? -1 : (x > y ? 1 : 0); });
var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(['PORCV-UI2', poId, arr]), Utilities.Charset.UTF_8);
return d.map(function (b) { return ('0' + ((b < 0 ? b + 256 : b)).toString(16)).slice(-2); }).join('').slice(0, 16);
}
function handleReceivePurchaseOrderLines_(body) {
var poId = String((body && body.purchase_order_id) || '').trim();
var reqLines = (body && body.lines) || [];
if (body && body.mode === 'preconditions') return jsonResponse_(poRcvPreconditionsRead_(poId));   // PG12R3: read only
var actor = String((body && body.actor) || 'operation-system').trim();
var idemKey = String((body && body.idempotency_key) || '').trim() || ('PORCV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 12));
// PO13 r6 (REVIEW_FINAL4 K2 / K3): the key is written into the movement note ('|'-separated fields) and matched field by field, so a key with
// '|' (K2: it never matches its own movements) or '|lines=' (K3: it rewrites the line list) is refused before any read or write. The page key
// (PORCV-UI-<hex>) and the server's own (PORCV-<hex>) match.
if (!/^[A-Za-z0-9_-]{1,128}$/.test(idemKey)) return jsonResponse_({ success: false, code: 'PO_RECEIPT_IDEMPOTENCY_KEY_INVALID', error: 'The receipt idempotency_key may contain only letters, digits, "_" and "-" (1 to 128 characters). Nothing was received.', data: { zero_write: true, retry_safe: false }, zero_write: true });
if (!poId) return jsonResponse_({ success: false, error: 'Missing purchase_order_id', zero_write: true });
if (!reqLines.length) return jsonResponse_({ success: false, error: 'No lines provided', zero_write: true });

var seenL = {}, dupL = reqLines.map(function (l) { return String((l && l.purchase_order_line_id) || '').trim(); }).filter(function (i) { return seenL[i] ? true : !(seenL[i] = 1); });
if (dupL.length) return jsonResponse_({ success: false, code: 'PO_RECEIPT_DUPLICATE_LINE', error: 'A line appears more than once in this receipt: ' + dupL.join(', ') + '. Nothing was received.', data: { duplicate_line_ids: dupL, zero_write: true }, zero_write: true });
// PO13 r3 (F5d): receive_qty must be a whole number (21_ rounds the stock delta while the line kept the fraction: line +2.5, stock +3)
var nonInt_ = reqLines.filter(function (l) { var q = Number(l && l.receive_qty); return isFinite(q) && q > 0 && Math.floor(q) !== q; }).map(function (l) { return String(l.purchase_order_line_id || ''); });
if (nonInt_.length) return jsonResponse_({ success: false, code: 'PO_RECEIPT_QTY_NOT_INTEGER', error: 'Receive Qty must be a whole number (' + nonInt_.join(', ') + '). Nothing was received.', data: { lines: nonInt_, zero_write: true }, zero_write: true });
var sentKey12_ = String((body && body.idempotency_key) || '').trim(), bound12_ = PO_RCV_BOUND_KEY_RE_.test(sentKey12_);   // PG12R2 (m-1)
if (bound12_ && poRcvRequestDigest_(poId, reqLines) !== sentKey12_.slice(-16)) return jsonResponse_({ success: false, code: 'PO_RECEIPT_REQUEST_IDENTITY_MISMATCH', stage: 'identity', purchase_order_id: poId,
data: { zero_write: true, retry_safe: false, idempotency_key: idemKey }, error: 'This receipt key was made for other lines, quantities or PO line state than this request carries. Nothing was received. Reload the PO and enter the receipt again.', zero_write: true });

var ss = SpreadsheetApp.getActiveSpreadsheet();
var lineSheet = ss.getSheetByName('purchase_order_lines');
var poSheet = ss.getSheetByName('purchase_orders');
var stockSheet = ss.getSheetByName('factory_stock');
var whSheet = ss.getSheetByName('warehouses');
if (!lineSheet) return jsonResponse_({ success: false, error: 'purchase_order_lines sheet not found', zero_write: true });
if (!poSheet) return jsonResponse_({ success: false, error: 'purchase_orders sheet not found', zero_write: true });
if (!stockSheet) return jsonResponse_({ success: false, error: 'factory_stock sheet not found', zero_write: true });
if (!whSheet) return jsonResponse_({ success: false, error: 'warehouses sheet not found', zero_write: true });

sheetEnsureColumns_(lineSheet, ['completed_qty', 'remaining_qty', 'updated_at']);
sheetEnsureColumns_(poSheet, ['order_status', 'completed_by', 'completed_at', 'updated_by', 'updated_at']);
var MOV_HEADERS = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty', 'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
var movSheet = fcWriteEnsureSheet_(ss, 'factory_stock_movements', MOV_HEADERS);
fcWriteEnsureColumns_(movSheet, MOV_HEADERS);



function poRcvKeyedReceipt_(mv, poId, key) {
var h = (mv[0] || []).map(function (x) { return String(x).trim(); }), out = {};
var t = h.indexOf('related_entity_type'), id = h.indexOf('related_entity_id'), n = h.indexOf('note');
if (t === -1 || id === -1 || n === -1) return out;
for (var k = 1; k < mv.length; k++) {
if (String(mv[k][t] || '').trim() !== 'purchase_order_receipt') continue;
var f = String(mv[k][n] || '').split('|'), q = null;
if (f.indexOf('key=' + key) === -1 || f.indexOf('po=' + poId) === -1) continue;
f.forEach(function (s) { if (s.indexOf('q=') === 0) q = Number(s.slice(2)); });
out[String(mv[k][id] || '').trim()] = q;
}
return out;
}
var poRef = procurementFindRow_(poSheet, 'purchase_order_id', poId);
if (!poRef) return jsonResponse_({ success: false, error: 'Purchase order not found: ' + poId, zero_write: true });
var curStatus = poRef.col('order_status') !== -1 ? String(poRef.vals[poRef.col('order_status')]).trim() : '';
if (!curStatus && poRef.col('status') !== -1) curStatus = String(poRef.vals[poRef.col('status')]).trim();
if (curStatus === 'cancelled') return jsonResponse_({ success: false, error: 'A cancelled PO cannot receive.', zero_write: true });


var whData = whSheet.getDataRange().getValues();
var whH = whData[0].map(function (h) { return String(h).trim(); });
var whIdC = whH.indexOf('warehouse_id'), whActC = whH.indexOf('is_active'), whFacC = whH.indexOf('is_factory_warehouse');
if (whIdC === -1 || whActC === -1 || whFacC === -1) return jsonResponse_({ success: false, error: 'warehouses missing required columns (warehouse_id, is_active, is_factory_warehouse)', zero_write: true });
var warehouseById = {};
for (var w = 1; w < whData.length; w++) {
var wid = String(whData[w][whIdC] || '').trim();
if (wid) warehouseById[wid] = { isActive: poRcvTruthy_(whData[w][whActC]), isFactory: poRcvTruthy_(whData[w][whFacC]) };
}


var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', zero_write: true }); }
catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), zero_write: true }); }

var journal = [], rcvIntents = [], rcvHdr = [], rcvStockPre = null;   // PO-RECEIPT-13: write intents, recorded before each write
try {



var mvAll_ = movSheet.getDataRange().getValues(), keyed = poRcvKeyedReceipt_(mvAll_, poId, idemKey), kIds = Object.keys(keyed);
poRef = procurementFindRow_(poSheet, 'purchase_order_id', poId);
curStatus = poRef && poRef.col('order_status') !== -1 ? String(poRef.vals[poRef.col('order_status')]).trim() : curStatus;
if (kIds.length) {
var reqQ_ = {}; reqLines.forEach(function (q) { reqQ_[String((q && q.purchase_order_line_id) || '').trim()] = Number(q && q.receive_qty); });
var within_ = kIds.every(function (i) { return reqQ_.hasOwnProperty(i) && (keyed[i] === null || keyed[i] === reqQ_[i]); });
var vf_ = within_ ? poRcvVerifyKeyed_(ss, lineSheet, stockSheet, mvAll_, poRcvMarkers_(mvAll_, poId, idemKey), poId) : null;
// R71 small-6 (Owner decision: same-key completion): a resend whose lines and factory stock PROVE they carry exactly this key's request (every keyed line
// verified, no requested line without its movement, the same quantities), on a PO whose header does not carry it (this key is the newest, the header stamp
// earlier than its movement), writes ONLY the missing header: the status the lines imply, then the receipt's own stamp LAST (the commit marker). It never
// touches stock, lines or movements. Anything else (different content, unproven, unreadable, a later key) takes the unchanged path below.
var miss6_ = within_ ? Object.keys(reqQ_).filter(function (i) { return !keyed.hasOwnProperty(i) && reqQ_[i] > 0; }) : ['?'];
var proof6_ = within_ && vf_ && !vf_.readFailed && !vf_.bad.length && !miss6_.length && kIds.every(function (i) { return !!vf_.ok[i]; });
var pend6_ = proof6_ && poRef ? poRcvHeaderPending_(ss, poId, poRef.col('updated_at') === -1 ? '' : poRef.vals[poRef.col('updated_at')], { mv: mvAll_ }) : null;
var qty7_ = !(pend6_ && !pend6_.unknown && pend6_.key === idemKey) ? null : (function () { try {   // R71 small-7 (review m6): the line quantities are this ledger's
  var LD = lineSheet.getDataRange().getValues(), lh = poRcvHdr_(LD), li = lh.indexOf('purchase_order_line_id'), lc = lh.indexOf('completed_qty'), lr = lh.indexOf('remaining_qty'), lsh = lh.indexOf('shipped_qty'), lo = lh.indexOf('opening_completed_qty');
  var mh = poRcvHdr_(mvAll_), mt = mh.indexOf('related_entity_type'), mi = mh.indexOf('related_entity_id'), mn = mh.indexOf('note'), why = [];
  if (li === -1 || lc === -1 || mt === -1 || mi === -1 || mn === -1) return ['columns missing'];
  kIds.forEach(function (id) { var row = null; for (var r = 1; r < LD.length; r++) if (String(LD[r][li]).trim() === id) { row = LD[r]; break; }
    if (!row) { why.push(id + ': line not found'); return; }
    var sum = 0, noQ = 0; for (var k = 1; k < mvAll_.length; k++) { if (String(mvAll_[k][mt] || '').trim() !== 'purchase_order_receipt' || String(mvAll_[k][mi] || '').trim() !== id) continue;
      var q = null; String(mvAll_[k][mn] || '').split('|').forEach(function (f) { if (f.indexOf('q=') === 0) q = Number(f.slice(2)); }); if (q === null || !isFinite(q)) noQ++; else sum += q; }
    var base = lo === -1 ? 0 : poRcvNum_(row[lo]), done = poRcvNum_(row[lc]), shipped = lsh === -1 ? 0 : poRcvNum_(row[lsh]);
    if (noQ) why.push(id + ': ' + noQ + ' receipt movement(s) without q=');
    else if (done !== base + sum) why.push(id + ': completed_qty ' + done + ' is not ' + base + ' + the receipts ' + sum);
    else if (lr !== -1 && String(row[lr] == null ? '' : row[lr]).trim() !== '' && poRcvNum_(row[lr]) !== Math.max(0, done - shipped)) why.push(id + ': remaining_qty ' + poRcvNum_(row[lr]) + ' is not ' + Math.max(0, done - shipped));
  });
  return why; } catch (e7_) { return ['READ_FAILED ' + poRcvMsg_(e7_)]; } })();
if (qty7_ && qty7_.length && !pend6_.linesBad) { lock.releaseLock();
  return jsonResponse_({ success: false, code: 'PO_RECEIPT_OUTCOME_UNKNOWN', stage: 'header_completion_proof', purchase_order_id: poId, data: { idempotency_key: idemKey, unproven: qty7_.slice(0, 20), zero_write: true, retry_safe: false },
    error: 'Receipt ' + idemKey + ' is on the ledger and its PO header was never written, but the PO line quantities are not what its ledger says (' + qty7_.slice(0, 3).join('; ') + '). Nothing was written. Do not receive it again: the PO needs an Owner-reviewed correction.' }); }
if (pend6_ && !pend6_.unknown && pend6_.key === idemKey && !pend6_.linesBad) {
var st6_ = vf_.statusFromLines && vf_.statusFromLines !== curStatus && curStatus !== 'completed' ? vf_.statusFromLines : '', w6_ = [];
var put6_ = function (n, v) { var c = poRef.col(n); if (c !== -1) { poSheet.getRange(poRef.row, c + 1).setValue(v); w6_.push(n); } };
try {
if (st6_) put6_('order_status', st6_);
if (st6_ === 'completed') { put6_('completed_by', actor); put6_('completed_at', pend6_.createdAtRaw); }
put6_('updated_by', actor);
put6_('updated_at', pend6_.createdAtRaw);   // the commit marker LAST: the receipt's own stamp
SpreadsheetApp.flush();
} catch (e6_) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'PO_RECEIPT_OUTCOME_UNKNOWN', stage: 'header_completion', purchase_order_id: poId, data: { idempotency_key: idemKey, header_cells_written: w6_, zero_write: w6_.length === 0, retry_safe: true },
error: 'Completing the PO header of receipt ' + idemKey + ' stopped (' + poRcvMsg_(e6_) + '). Its lines and factory stock already carry it and were not touched. Send the same receipt again with the same key.' }); }
lock.releaseLock();
var recQ6_ = 0; kIds.forEach(function (i) { recQ6_ += vf_.ok[i] ? vf_.ok[i].qty : 0; });
return jsonResponse_({ success: true, code: 'PO_RECEIPT_HEADER_COMPLETED', data: { purchase_order_id: poId, received: 0, skipped: 0, skipped_idempotent: kIds.length, order_status: st6_ || curStatus, idempotency_key: idemKey, factory_stock_posted: 0, factory_postings: [],
already_recorded: true, header_completed: true, header_cells_written: w6_, recorded_lines: kIds.length, recorded_qty: recQ6_, recorded_postings: kIds.map(function (i) { return vf_.ok[i] || null; }) } });
}
lock.releaseLock();
var missing_ = within_ ? Object.keys(reqQ_).filter(function (i) { return !keyed.hasOwnProperty(i) && reqQ_[i] > 0; }) : [];   // PO13 r3 (F5a): a 0-qty line was skipped, not missing
if (!within_ || (!vf_.bad.length && missing_.some(function (i) { return !vf_.poLines[i]; }))) return jsonResponse_({ success: false, code: 'PO_RECEIPT_IDEMPOTENCY_KEY_CONTENT_MISMATCH', data: { idempotency_key: idemKey, posted: keyed, zero_write: true },
error: 'This receipt key was already posted with other lines or quantities. Nothing was received; reload the PO to see what was posted.', zero_write: true });
if (vf_.readFailed) return jsonResponse_({ success: false, code: 'PO_RECEIPT_EVIDENCE_READ_FAILED', stage: 'idempotency', purchase_order_id: poId, data: { idempotency_key: idemKey, zero_write: true, retry_safe: true },
error: 'The evidence of this receipt could not be read (' + vf_.bad.slice(0, 2).join('; ') + '). Nothing was written; send the same receipt again.', zero_write: true });
if (vf_.bad.length) return jsonResponse_({ success: false, code: 'PO_RECEIPT_OUTCOME_UNKNOWN', stage: 'idempotency', purchase_order_id: poId,
data: { idempotency_key: idemKey, posted: keyed, unproven: vf_.bad.slice(0, 20), zero_write: true, retry_safe: false },
error: 'This receipt key has a movement on record, but the PO line or factory stock does not carry it (' + vf_.bad.slice(0, 3).join('; ') + '). Whether it is fully recorded cannot be proven from the books; nothing was written. Do not enter it again under a new receipt: reload the PO to see what is recorded. This release has NO in-app correction for it (an Owner-reviewed correction is not available yet): do not receive this PO again under any key and report it to the owner.' });
if (missing_.length) return jsonResponse_({ success: false, code: 'PO_RECEIPT_PARTIALLY_RECORDED', stage: 'idempotency', purchase_order_id: poId,
data: { idempotency_key: idemKey, recorded: kIds.map(function (i) { return vf_.ok[i]; }), not_recorded_lines: missing_, zero_write: true, retry_safe: false },
error: 'Only part of this receipt is recorded: ' + kIds.join(', ') + ' has its movement and its PO line and factory stock carry it; ' + missing_.join(', ') + ' has no movement on record (if the earlier attempt was cut off, its line or stock may still carry part of it). Nothing was written. Reload the PO to see what is recorded. This release has NO in-app correction for it (an Owner-reviewed correction is not available yet): do not receive this PO again under any key and report it to the owner.' });
var recQty_ = 0; kIds.forEach(function (i) { recQty_ += vf_.ok[i].qty; });
// PO13 r3 (F4): the receipt is on the books but the PO header does not say so (an interrupted header write): never a plain success
if (vf_.statusFromLines && vf_.statusFromLines !== curStatus && curStatus !== 'completed') return jsonResponse_({ success: false, code: 'PO_RECEIPT_RECORDED_STATUS_STALE', stage: 'idempotency', purchase_order_id: poId,
data: { idempotency_key: idemKey, already_recorded: true, recorded_qty: recQty_, order_status: curStatus, order_status_from_lines: vf_.statusFromLines, zero_write: true },
error: 'This receipt is recorded (factory stock and the PO lines carry it), but the PO status is ' + (curStatus || 'blank') + ' while its lines say ' + vf_.statusFromLines + '. Nothing was written. Set the PO status from the PO screen (review), do not receive again.' });
return jsonResponse_({ success: true, code: 'PO_RECEIPT_ALREADY_RECORDED', data: { purchase_order_id: poId, received: 0, skipped: 0, skipped_idempotent: kIds.length, order_status: curStatus, idempotency_key: idemKey, factory_stock_posted: 0, factory_postings: [],
already_recorded: true, recorded_lines: kIds.length, recorded_qty: recQty_, recorded_postings: kIds.map(function (i) { return vf_.ok[i]; }),
order_status_from_lines: vf_.statusFromLines, order_status_consistent: !vf_.statusFromLines || vf_.statusFromLines === curStatus } });
}
if (sentKey12_ && !bound12_) { lock.releaseLock(); return jsonResponse_({ success: false, code: 'PO_RECEIPT_REQUEST_IDENTITY_UNBOUND', stage: 'identity', purchase_order_id: poId,   // PG12R2 (m-1): a new receipt needs a bound key
data: { zero_write: true, retry_safe: false, receipt_key_recorded: false, idempotency_key: idemKey }, error: 'This receipt key is not on record and does not carry the content it was made for. Nothing was received. Reload the PO and enter the receipt again.', zero_write: true }); }
if (!poRef || curStatus === 'cancelled') { lock.releaseLock(); return jsonResponse_({ success: false, error: 'A cancelled PO cannot receive.', zero_write: true }); }

if (!{ issued: 1, confirmed: 1, in_production: 1, ready_to_ship: 1, partial_completed: 1, completed: 1 }[curStatus]) {
lock.releaseLock();
return jsonResponse_({ success: false, code: 'PO_RECEIPT_PO_NOT_ISSUED', data: { order_status: curStatus, zero_write: true },
error: 'Only an issued PO can receive (current: ' + (curStatus || 'blank') + '). Nothing was received.', zero_write: true });
}
var data = lineSheet.getDataRange().getValues();
if (data.length < 2) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'purchase_order_lines is empty', zero_write: true }); }
var headers = data[0].map(function (h) { return String(h).trim(); });
var col = function (n) { return headers.indexOf(n); };
var idCol = col('purchase_order_line_id'), poLineIdCol = col('purchase_order_id'), orderedCol = col('ordered_qty'),
completedCol = col('completed_qty'), shippedCol = col('shipped_qty'), remainingCol = col('remaining_qty'),
updatedCol = col('updated_at'), skuCol = col('sku'), supWhCol = col('supplier_warehouse_id');
if (idCol === -1 || completedCol === -1 || orderedCol === -1 || skuCol === -1 || supWhCol === -1) {
lock.releaseLock(); return jsonResponse_({ success: false, error: 'required line columns not found (need purchase_order_line_id, ordered_qty, completed_qty, sku, supplier_warehouse_id)', zero_write: true });
}
var rowById = {};
for (var i = 1; i < data.length; i++) rowById[String(data[i][idCol]).trim()] = { row: i + 1, vals: data[i] };
var pre12_ = poRcvPrecondition_(reqLines, rowById, completedCol, updatedCol, poLineIdCol, poId, idemKey, poRcvTzs_(ss));   // PG12R2 (G-2): the line must be in the state the receipt was entered against
if (pre12_) { lock.releaseLock(); return jsonResponse_(pre12_); }

var now = procurementTimestamp_();



var plans = [], skipped = 0;
for (var r = 0; r < reqLines.length; r++) {
var rq = reqLines[r] || {};
var lineId = String(rq.purchase_order_line_id || '').trim();
if (!lineId || !rowById[lineId]) { skipped++; continue; }
var ent = rowById[lineId];
if (poLineIdCol !== -1 && String(ent.vals[poLineIdCol]).trim() !== poId) { skipped++; continue; }
var whId = String(ent.vals[supWhCol] || '').trim();
var ev = poReceiptEvaluateLine_({
ordered: ent.vals[orderedCol], completed: ent.vals[completedCol],
shipped: shippedCol !== -1 ? ent.vals[shippedCol] : 0,
sku: ent.vals[skuCol], supplierWarehouseId: whId,
warehouse: warehouseById[whId] || null,
recvQtyRaw: rq.receive_qty
});
if (ev.status === 'error') {




lock.releaseLock();
return jsonResponse_({
success: false, code: ev.issue, issue: ev.issue, purchase_order_line_id: lineId,
data: {
purchase_order_line_id: lineId, issue: ev.issue,
attempted_qty: (ev.attempted === undefined ? null : ev.attempted),
remaining_qty: (ev.remaining === undefined ? null : ev.remaining),
excess_qty: (ev.excess === undefined ? null : ev.excess),
ordered_qty: (ev.ordered === undefined ? null : ev.ordered),
completed_qty: (ev.completed === undefined ? null : ev.completed),
zero_write: true
},
error: 'Receive blocked: ' + ev.issue + (ev.detail ? ' (' + ev.detail + ')' : '') +
'. Nothing was received: factory stock, the movement ledger and the PO line are all unchanged.', zero_write: true
});
}
ev.lineId = lineId; ev.row = ent.row; ev.sku = String(ent.vals[skuCol] || '').trim(); ev.warehouseId = whId;
plans.push(ev);
}

var received = 0, skippedIdem = 0, factoryPosted = 0;
var newCompletedById = {};
var postings = [];
// PO13 r3 (review F1): the WRITE ORDER per line is now  keyed movement -> stock -> line (completed, remaining, updated_at LAST). The keyed
// movement is the first thing that lands, so every landed state carries the key and a retry can classify it; the line's updated_at is the
// commit marker. The VALUES written are the ones 21_ factoryStockApplyDeltaTx_ wrote (same movement row, same stock cells, same created row);
// 13_ writes them itself because the shared helper writes the stock before the movement. One read (factory_stock) before the first write.
if (plans.some(function (p) { return p.status === 'apply'; })) {
rcvStockPre = stockSheet.getDataRange().getValues();
// PO13 r3 (review F2): a zero-write gate - a line whose newest keyed receipt movement it does not carry (an unresolved earlier receipt), or
// a stock key whose books are not proven (chain r7's shipmentReservationBooks_), is refused before any write, whatever the key.
var rcvHdrUp_ = (function () { var c = poRef && poRef.col ? poRef.col('updated_at') : -1; return c === -1 || !poRef.vals ? '' : poRef.vals[c]; })();   // PO13 r4 (L3-1)
var rcvGate_ = poRcvGate_(ss, data, headers, plans, mvAll_, rcvStockPre, stockSheet, movSheet, poId, rcvHdrUp_);
if (rcvGate_) { lock.releaseLock(); return jsonResponse_({ success: false, code: rcvGate_.code, stage: 'gate', purchase_order_id: poId, data: { zero_write: true, retry_safe: false, unresolved: rcvGate_.why.slice(0, 20), idempotency_key: idemKey },
error: rcvGate_.text + ' (' + rcvGate_.why.slice(0, 3).join('; ') + '). Nothing was received. Reload the PO and Factory Stock to see it. This release has NO in-app correction for it (an Owner-reviewed correction is not available yet): do not receive this PO again under any key and report it to the owner.' }); }
// PO13 r3 (review F3): the commit marker must be unique - if a line's updated_at already holds this second, wait for the next one
// PO13 r4 (REVIEW_LAYERS L3-2): Sheets stores the stamp as a Date read in the SPREADSHEET zone, so compare in every zone (poRcvSame_), and wait
// also when the PO header (the receipt-level marker) already holds this second
var tzsW_ = poRcvTzs_(ss);
// PG12R3 (G-2): every line this receipt writes gets a stamp STRICTLY later than the one it holds, so (completed_qty, updated_at) changes on every
// completed write (82_ does the same) and 40 -> 80 -> 40 inside one second still moves the precondition. No later second -> refused, zero writes.
var lateOk12_ = function () { return !plans.some(function (p) { return p.status === 'apply' && updatedCol !== -1 && !poStampAfter_(now, data[p.row - 1][updatedCol], tzsW_); }); };
var futLines12_ = function (cut) { return plans.filter(function (p) { return p.status === 'apply' && updatedCol !== -1 && !poStampAfter_(cut, data[p.row - 1][updatedCol], tzsW_); }).map(function (p) { return poStampLineInfo_(p.lineId, data[p.row - 1][updatedCol], tzsW_); }); };   // JR2b (Owner B)
var fut12_ = futLines12_(poStampFutureCut_(3)); if (fut12_.length) { lock.releaseLock(); return poRcvFutureOut_(poId, idemKey, fut12_, now); }   // JR2 (J-M1): refused at once, no lock-held wait
for (var ss_ = 0; ss_ < 3 && ((typeof rcvHdrUp_ !== 'undefined' && poRcvSame_(rcvHdrUp_, now, tzsW_)) || !lateOk12_()); ss_++) { Utilities.sleep(1000); now = procurementTimestamp_(); }
if (!lateOk12_()) { lock.releaseLock(); return poRcvFutureOut_(poId, idemKey, futLines12_(now), now); }   // JR2 (J-M1): was PO_RECEIPT_CLOCK_NOT_ADVANCED, retry_safe true
}
var rSc_ = rcvStockPre ? poRcvStockCols_(rcvStockPre) : null, rRun_ = {};
var rcvLines_ = plans.filter(function (p) { return p.status === 'apply'; }).map(function (p) { return p.lineId; }).join(',');   // PO13 r5: the key's line list
plans.forEach(function (ev) {
if (ev.status === 'skip_idempotent') { skippedIdem++; return; }
if (ev.status !== 'apply') { skipped++; return; }
var sk = ev.warehouseId + '||' + ev.sku, R = rRun_[sk];
if (!R) {
var pr = poRcvStockRowsOf_(rcvStockPre, rSc_, ev.warehouseId, ev.sku);
R = pr.length ? { row: pr[0], cur: Math.round(parseFloat(rcvStockPre[pr[0] - 1][rSc_.cur]) || 0), res: Math.round(parseFloat(rcvStockPre[pr[0] - 1][rSc_.res]) || 0), created: false } : { row: 0, cur: 0, res: 0, created: true };
rRun_[sk] = R;
}
var beforeCurrent = R.cur, afterCurrent = R.cur + Math.round(Number(ev.recvQty)), beforeReserved = R.res;
if (rSc_.wh === -1 || rSc_.sku === -1 || rSc_.cur === -1 || rSc_.res === -1) throw new Error('factoryStockApplyDeltaTx_: factory_stock missing required columns');
if (afterCurrent - beforeReserved < 0) throw new Error('factoryStockApplyDeltaTx_: resulting available_factory_stock would be negative (current ' + afterCurrent + ' - reserved ' + beforeReserved + ')');
rcvIntents.push({ lineId: ev.lineId, row: ev.row, wh: ev.warehouseId, sku: ev.sku, q: ev.recvQty, cells: [
updatedCol !== -1 ? { col: updatedCol, prev: data[ev.row - 1][updatedCol], wrote: now } : null,
remainingCol !== -1 ? { col: remainingCol, prev: data[ev.row - 1][remainingCol], wrote: ev.newRemaining } : null,
{ col: completedCol, prev: data[ev.row - 1][completedCol], wrote: ev.newCompleted }].filter(function (c) { return c; }) });
// 1. the keyed movement FIRST (the row 21_ wrote, field for field)
var movementId = 'FSMV-' + Utilities.getUuid().replace(/-/g, '').substring(0, 8);
fcWriteAppendByHeader_(movSheet, {
factory_stock_movement_id: movementId, movement_date: now, sku: ev.sku, warehouse_id: ev.warehouseId,
movement_type: 'po_receipt', qty: afterCurrent - beforeCurrent, related_entity_type: 'purchase_order_receipt', related_entity_id: ev.lineId,
before_current_stock: beforeCurrent, after_current_stock: afterCurrent, before_reserved_stock: beforeReserved, after_reserved_stock: beforeReserved,
note: 'po_receipt|po=' + poId + '|key=' + idemKey + '|q=' + ev.recvQty + '|lines=' + rcvLines_ + '|c0=' + (ev.newCompleted - ev.recvQty), created_by: actor, created_at: now
});
// 2. the stock (a new key: the row 21_ created, then the cells)
if (R.created && !R.row) {
var nrow = new Array(rcvStockPre[0].length).fill('');
nrow[rSc_.wh] = ev.warehouseId; nrow[rSc_.sku] = ev.sku; nrow[rSc_.cur] = 0; nrow[rSc_.res] = 0;
if (rSc_.id !== -1) nrow[rSc_.id] = 'FS-' + ev.warehouseId + '-' + ev.sku;
if (rSc_.cr !== -1) nrow[rSc_.cr] = now;
if (rSc_.up !== -1) nrow[rSc_.up] = now;
stockSheet.appendRow(nrow);
R.row = stockSheet.getLastRow();
}
stockSheet.getRange(R.row, rSc_.cur + 1).setValue(afterCurrent);
if (rSc_.lt !== -1) stockSheet.getRange(R.row, rSc_.lt + 1).setValue(now);
if (rSc_.up !== -1) stockSheet.getRange(R.row, rSc_.up + 1).setValue(now);
R.cur = afterCurrent;
// 3. the line - updated_at LAST (the commit marker)
lineSheet.getRange(ev.row, completedCol + 1).setValue(ev.newCompleted);
if (remainingCol !== -1) lineSheet.getRange(ev.row, remainingCol + 1).setValue(ev.newRemaining);
if (updatedCol !== -1) lineSheet.getRange(ev.row, updatedCol + 1).setValue(now);
SpreadsheetApp.flush();
newCompletedById[ev.lineId] = ev.newCompleted;
received++; factoryPosted += ev.recvQty;
postings.push({ purchase_order_line_id: ev.lineId, warehouse_id: ev.warehouseId, sku: ev.sku, qty: ev.recvQty, movement_id: movementId, before_current_stock: beforeCurrent, after_current_stock: afterCurrent });
});

if (!received && !skippedIdem) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'No receivable quantity applied (receive_qty must be > 0 and <= remaining).', zero_write: true }); }



if (received) {
var allComplete = true, anyCompleted = false, hasLine = false;
for (var j = 1; j < data.length; j++) {
if (poLineIdCol !== -1 && String(data[j][poLineIdCol]).trim() !== poId) continue;
hasLine = true;
var lid = String(data[j][idCol]).trim();
var ord = parseFloat(data[j][orderedCol]) || 0;
var comp = newCompletedById.hasOwnProperty(lid) ? newCompletedById[lid] : (parseFloat(data[j][completedCol]) || 0);
if (comp < ord) allComplete = false;
if (comp > 0) anyCompleted = true;
}
function setPoCell(name, value) { var c = poRef.col(name); if (c !== -1) { rcvHdr.push({ col: c, prev: poRef.vals[c], wrote: value }); poSheet.getRange(poRef.row, c + 1).setValue(value); } }
if (hasLine && allComplete) { setPoCell('order_status', 'completed'); setPoCell('completed_by', actor); setPoCell('completed_at', now); curStatus = 'completed'; }
else if (anyCompleted) { setPoCell('order_status', 'partial_completed'); curStatus = 'partial_completed'; }
setPoCell('updated_by', actor); setPoCell('updated_at', now);
SpreadsheetApp.flush();
}

lock.releaseLock();
return jsonResponse_({ success: true, data: { purchase_order_id: poId, received: received, skipped: skipped, skipped_idempotent: skippedIdem, order_status: curStatus, idempotency_key: idemKey, factory_stock_posted: factoryPosted, factory_postings: postings } });
} catch (err) {
var rcvR_ = { outcome: 'UNKNOWN', left: [], undone: 0 };
try { rcvR_ = poRcvRecover_({ ss: ss, lineSheet: lineSheet, stockSheet: stockSheet, movSheet: movSheet, poSheet: poSheet, poId: poId, key: idemKey,
intents: rcvIntents, hdr: rcvHdr, hdrRow: poRef ? poRef.row : -1, stockPre: rcvStockPre, now: now }); }
catch (eRc) { rcvR_ = { outcome: 'UNKNOWN', left: ['RECOVERY_THREW: ' + poRcvMsg_(eRc)], undone: 0 }; }
try { lock.releaseLock(); } catch (e2) {}
var em_ = (err && err.message ? err.message : err);
if (rcvR_.outcome === 'NOT_RECORDED' || rcvR_.outcome === 'ROLLED_BACK') return jsonResponse_({ success: false, code: 'PO_RECEIPT_' + rcvR_.outcome,
error: 'Receive failed and was rolled back (no partial handoff' + (rcvR_.outcome === 'NOT_RECORDED' ? '; nothing had been written' : '; every undo was re-read and proven') + '): ' + em_,
stage: 'write_rolled_back', purchase_order_id: poId, data: { idempotency_key: idemKey, retry_safe: true, undone: rcvR_.undone } });
return jsonResponse_({ success: false, code: 'PO_RECEIPT_OUTCOME_UNKNOWN', stage: 'outcome_unknown', purchase_order_id: poId,
data: { idempotency_key: idemKey, retry_safe: false, undone: rcvR_.undone, left: rcvR_.left.slice(0, 20) },
error: 'Receive failed (' + em_ + ') and what it left could not be proven (' + rcvR_.left.slice(0, 3).join('; ') + '). Part of this receipt may be recorded. Nothing more was written. Do not enter it again under a new receipt: reload the PO to see what is recorded. This release has NO in-app correction for it (an Owner-reviewed correction is not available yet): do not receive this PO again under any key and report it to the owner.' });
}
}


function procurementRecalcPoTotals_(ss, purchaseOrderId) {
var lineSheet = ss.getSheetByName('purchase_order_lines');
var poSheet = ss.getSheetByName('purchase_orders');
if (!lineSheet || !poSheet) return;
var data = lineSheet.getDataRange().getValues();
if (data.length < 2) return;
var h = data[0].map(function (x) { return String(x).trim(); });
var poIdCol = h.indexOf('purchase_order_id'), oCol = h.indexOf('ordered_qty'), ucCol = h.indexOf('unit_cost'), skuCol = h.indexOf('sku'), ctnCol = h.indexOf('carton_qty');
if (poIdCol === -1) return;
var distinctSku = {}, totalQty = 0, totalCartons = 0, totalAmount = 0;
for (var i = 1; i < data.length; i++) {
if (String(data[i][poIdCol]).trim() !== purchaseOrderId) continue;
var sku = skuCol !== -1 ? String(data[i][skuCol] || '').trim() : '';
if (sku) distinctSku[sku.toLowerCase()] = 1;
var q = oCol !== -1 ? (parseFloat(data[i][oCol]) || 0) : 0;
totalQty += q;
totalCartons += ctnCol !== -1 ? (parseFloat(data[i][ctnCol]) || 0) : 0;
var uc = ucCol !== -1 ? parseFloat(data[i][ucCol]) : NaN;
if (!isNaN(uc)) totalAmount += q * uc;
}
var ref = procurementFindRow_(poSheet, 'purchase_order_id', purchaseOrderId);
if (!ref) return;
if (poRcvHeaderWriteBlock_(ss, purchaseOrderId, ref.col('updated_at') === -1 ? '' : ref.vals[ref.col('updated_at')])) return;   // R71 small-6: no header write while a receipt is pending (its only caller, poLineEdit_, is draft-only)
function setCell(name, value) { var c = ref.col(name); if (c !== -1) poSheet.getRange(ref.row, c + 1).setValue(value); }
var amt = totalAmount > 0 ? Math.round(totalAmount * 100) / 100 : '';
setCell('total_sku', Object.keys(distinctSku).length);
setCell('total_qty', totalQty);
setCell('total_cartons', totalCartons);
setCell('total_amount', amt);
setCell('subtotal_amount', amt);
}










function seedProcurementSampleData() {
var ss = SpreadsheetApp.getActiveSpreadsheet();
var roSheet = procurementEnsureSheet_(ss, 'request_orders', REQUEST_ORDERS_HEADERS_);
var rolSheet = procurementEnsureSheet_(ss, 'request_order_lines', REQUEST_ORDER_LINES_HEADERS_);
var poSheet = procurementEnsureSheet_(ss, 'purchase_orders', PURCHASE_ORDERS_HEADERS_);
var polSheet = procurementEnsureSheet_(ss, 'purchase_order_lines', PURCHASE_ORDER_LINES_HEADERS_);

var now = procurementTimestamp_();
var today = procurementToday_();
var roId = 'RO-SAMPLE-' + Utilities.getUuid().substring(0, 6).toUpperCase();
var poId = 'PO-SAMPLE-' + Utilities.getUuid().substring(0, 6).toUpperCase();


var srcSheet = procurementEnsureSheet_(ss, 'request_order_line_sources', REQUEST_ORDER_LINE_SOURCES_HEADERS_);
procurementAppendByHeader_(roSheet, {
request_order_id: roId, request_order_no: 'REQ-' + today.replace(/-/g, '') + '-SMPL',
request_order_version: 1, parent_request_order_id: roId,
company: 'ResTW', supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin',
factory_id: 'CN_YOUXIN', warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', request_status: 'approved', tier_group: 'T1',
total_sku: 2, total_qty: 900, total_cartons: 0, estimated_amount: 2250, currency: 'USD',
source: 'manual', created_by: 'sample', created_at: now, submitted_by: 'sample', submitted_at: now,
approved_by: 'sample', approved_at: now, note: 'Sample seed', updated_by: 'sample', updated_at: now
});
procurementAppendByHeader_(rolSheet, {
request_order_line_id: 'ROL-SMPL-1', request_order_id: roId, sku: 'CO1100-R',
series: 'CO1100', company: 'ResTW', request_bucket: 'T1', request_month: today.substring(0, 7),
requested_qty: 500, approved_qty: 500, km_qty: 0, resus_qty: 0, restw_qty: 500, units_per_carton: 40, carton_qty: 13,
supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin', supplier_sku: 'YX-CO1100R',
unit_cost: 2.5, estimated_amount: 1250, currency: 'USD', calculation_method: 'manual_order_allocation',
line_status: 'approved', created_at: now, updated_at: now
});
procurementAppendByHeader_(rolSheet, {
request_order_line_id: 'ROL-SMPL-2', request_order_id: roId, sku: 'CO1150-S',
series: 'CO1150', company: 'ResTW', request_bucket: 'T1', request_month: today.substring(0, 7),
requested_qty: 400, approved_qty: 400, km_qty: 0, resus_qty: 0, restw_qty: 400, units_per_carton: 40, carton_qty: 10,
supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin', supplier_sku: 'YX-CO1150S',
unit_cost: 2.5, estimated_amount: 1000, currency: 'USD', calculation_method: 'manual_order_allocation',
line_status: 'approved', created_at: now, updated_at: now
});
procurementAppendByHeader_(srcSheet, {
line_source_id: 'ROLS-SMPL-1', request_order_line_id: 'ROL-SMPL-1', request_order_id: roId, sku: 'CO1100-R',
company: 'ResTW', country: 'US', marketplace: 'amazon', tier_type: 'T1', source_month: today.substring(0, 7),
requested_qty: 500, approved_qty: 500, shortage_qty: '', source_type: 'manual_order_allocation', note: 'Sample seed',
created_at: now, updated_at: now
});
procurementAppendByHeader_(srcSheet, {
line_source_id: 'ROLS-SMPL-2', request_order_line_id: 'ROL-SMPL-2', request_order_id: roId, sku: 'CO1150-S',
company: 'ResTW', country: 'US', marketplace: 'amazon', tier_type: 'T1', source_month: today.substring(0, 7),
requested_qty: 400, approved_qty: 400, shortage_qty: '', source_type: 'manual_order_allocation', note: 'Sample seed',
created_at: now, updated_at: now
});


procurementAppendByHeader_(poSheet, {
purchase_order_id: poId, po_no: 'PO-' + today.replace(/-/g, '') + '-SMPL-T1', km_po_no: '',
purchase_order_no: 'PO-' + today.replace(/-/g, '') + '-SMPL-T1',
po_version: 1, parent_purchase_order_id: poId, request_order_id: roId, request_bucket: 'T1',
company: 'ResTW', supplier_id: 'SUP-YOUXIN', supplier_name: 'Dongguan Youxin',
factory_id: 'CN_YOUXIN', warehouse_id: '', order_status: 'in_production', currency: 'USD',
total_sku: 2, total_qty: 900, total_amount: 2250, subtotal_amount: 2250,
expected_completion_date: today, supplier_expected_ready_date: today, payment_status: 'unpaid',
note: 'Sample seed', created_by: 'sample', created_at: now, updated_by: 'sample', updated_at: now
});
procurementAppendByHeader_(polSheet, {
purchase_order_line_id: 'POL-SMPL-1', purchase_order_id: poId, request_order_line_id: 'ROL-SMPL-1',
request_order_id: roId, request_bucket: 'T1', sku: 'CO1100-R', company: 'ResTW', series: 'CO1100',
km_qty: 0, resus_qty: 0, restw_qty: 500, requested_qty: 500, approved_qty: 500,
ordered_qty: 500, completed_qty: 300, shipped_qty: 0, remaining_qty: 300,
units_per_carton: 40, carton_qty: 13, supplier_id: 'SUP-YOUXIN', supplier_sku: 'YX-CO1100R',
unit_cost: 2.5, line_amount: 1250, currency: 'USD', line_status: 'approved', created_at: now, updated_at: now
});
procurementAppendByHeader_(polSheet, {
purchase_order_line_id: 'POL-SMPL-2', purchase_order_id: poId, request_order_line_id: 'ROL-SMPL-2',
request_order_id: roId, request_bucket: 'T1', sku: 'CO1150-S', company: 'ResTW', series: 'CO1150',
km_qty: 0, resus_qty: 0, restw_qty: 400, requested_qty: 400, approved_qty: 400,
ordered_qty: 400, completed_qty: 400, shipped_qty: 100, remaining_qty: 300,
units_per_carton: 40, carton_qty: 10, supplier_id: 'SUP-YOUXIN', supplier_sku: 'YX-CO1150S',
unit_cost: 2.5, line_amount: 1000, currency: 'USD', line_status: 'approved', created_at: now, updated_at: now
});

return jsonResponse_({ success: true, data: { request_order_id: roId, purchase_order_id: poId, note: 'Sample procurement data created.' } });
}

// XCO-R15G MAJOR-O1-1 (13_): in-transit skips removed / invalid-status lines (shared 12_ predicate).
// XCO-R15G-13 (xco-r15g-impl): patched
// R15G-STAMPS (final candidate): patched


var PROC_PHYSICAL_LAYOUTS_SC1_ = {
  "purchase_orders": [
    [
      "purchase_order_id",
      "po_no",
      "km_po_no",
      "warehouse_id",
      "supplier_name",
      "order_status",
      "order_date",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "subtotal_amount",
      "deposit_amount",
      "deposit_due_date",
      "balance_amount",
      "paid_amount",
      "payment_status",
      "payment_term_id",
      "currency",
      "note",
      "purchase_order_no",
      "po_version",
      "parent_purchase_order_id",
      "request_order_id",
      "request_bucket",
      "company",
      "supplier_id",
      "factory_id",
      "total_sku",
      "total_qty",
      "total_cartons",
      "total_amount",
      "supplier_expected_ready_date",
      "supplier_confirmed_ready_date",
      "created_by",
      "created_at",
      "updated_by",
      "updated_at",
      "issued_by",
      "issued_at",
      "confirmed_by",
      "confirmed_at",
      "cancelled_by",
      "cancelled_at",
      "completed_by",
      "completed_at",
      "closure_reason",
      "closed_by",
      "closed_at"
    ],
    [
      "purchase_order_id",
      "po_no",
      "km_po_no",
      "warehouse_id",
      "supplier_name",
      "order_status",
      "order_date",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "subtotal_amount",
      "deposit_amount",
      "deposit_due_date",
      "balance_amount",
      "paid_amount",
      "payment_status",
      "payment_term_id",
      "currency",
      "note",
      "purchase_order_no",
      "po_version",
      "parent_purchase_order_id",
      "request_order_id",
      "request_bucket",
      "company",
      "supplier_id",
      "factory_id",
      "total_sku",
      "total_qty",
      "total_cartons",
      "total_amount",
      "supplier_expected_ready_date",
      "supplier_confirmed_ready_date",
      "created_by",
      "created_at",
      "updated_by",
      "updated_at",
      "issued_by",
      "issued_at",
      "confirmed_by",
      "confirmed_at",
      "cancelled_by",
      "cancelled_at",
      "completed_by",
      "completed_at",
      "closure_reason",
      "closed_by",
      "closed_at",
      "source_type"
    ],
    [
      "purchase_order_id",
      "po_no",
      "km_po_no",
      "warehouse_id",
      "supplier_name",
      "order_status",
      "order_date",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "subtotal_amount",
      "deposit_amount",
      "deposit_due_date",
      "balance_amount",
      "paid_amount",
      "payment_status",
      "payment_term_id",
      "currency",
      "note",
      "purchase_order_no",
      "po_version",
      "parent_purchase_order_id",
      "request_order_id",
      "request_bucket",
      "company",
      "supplier_id",
      "factory_id",
      "total_sku",
      "total_qty",
      "total_cartons",
      "total_amount",
      "supplier_expected_ready_date",
      "supplier_confirmed_ready_date",
      "created_by",
      "created_at",
      "updated_by",
      "updated_at",
      "issued_by",
      "issued_at",
      "confirmed_by",
      "confirmed_at",
      "cancelled_by",
      "cancelled_at",
      "completed_by",
      "completed_at",
      "closure_reason",
      "closed_by",
      "closed_at",
      "source_type",
      "import_batch_id"
    ]
  ],
  "purchase_order_lines": [
    [
      "purchase_order_line_id",
      "purchase_order_id",
      "series",
      "sku",
      "factory_item_no",
      "factory_item_name",
      "km_qty",
      "resus_qty",
      "restw_qty",
      "ordered_qty",
      "completed_qty",
      "shipped_qty",
      "remaining_qty",
      "carton_qty",
      "units_per_carton",
      "unit_cost",
      "currency",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "actual_completion_date",
      "line_status",
      "note",
      "supplier_id",
      "supplier_sku",
      "line_amount",
      "related_shipment_id",
      "request_order_id",
      "request_order_line_id",
      "request_bucket",
      "company",
      "supplier_name",
      "supplier_warehouse_id",
      "recommended_qty",
      "requested_qty",
      "approved_qty",
      "created_at",
      "updated_at"
    ],
    [
      "purchase_order_line_id",
      "purchase_order_id",
      "series",
      "sku",
      "factory_item_no",
      "factory_item_name",
      "km_qty",
      "resus_qty",
      "restw_qty",
      "ordered_qty",
      "completed_qty",
      "shipped_qty",
      "remaining_qty",
      "carton_qty",
      "units_per_carton",
      "unit_cost",
      "currency",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "actual_completion_date",
      "line_status",
      "note",
      "supplier_id",
      "supplier_sku",
      "line_amount",
      "related_shipment_id",
      "request_order_id",
      "request_order_line_id",
      "request_bucket",
      "company",
      "supplier_name",
      "supplier_warehouse_id",
      "recommended_qty",
      "requested_qty",
      "approved_qty",
      "created_at",
      "updated_at",
      "import_batch_id"
    ],
    [
      "purchase_order_line_id",
      "purchase_order_id",
      "series",
      "sku",
      "factory_item_no",
      "factory_item_name",
      "km_qty",
      "resus_qty",
      "restw_qty",
      "ordered_qty",
      "completed_qty",
      "shipped_qty",
      "remaining_qty",
      "carton_qty",
      "units_per_carton",
      "unit_cost",
      "currency",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "actual_completion_date",
      "line_status",
      "note",
      "supplier_id",
      "supplier_sku",
      "line_amount",
      "related_shipment_id",
      "request_order_id",
      "request_order_line_id",
      "request_bucket",
      "company",
      "supplier_name",
      "supplier_warehouse_id",
      "recommended_qty",
      "requested_qty",
      "approved_qty",
      "created_at",
      "updated_at",
      "import_batch_id",
      "opening_completed_qty"
    ],
    [
      "purchase_order_line_id",
      "purchase_order_id",
      "series",
      "sku",
      "factory_item_no",
      "factory_item_name",
      "km_qty",
      "resus_qty",
      "restw_qty",
      "ordered_qty",
      "completed_qty",
      "shipped_qty",
      "remaining_qty",
      "carton_qty",
      "units_per_carton",
      "unit_cost",
      "currency",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "actual_completion_date",
      "line_status",
      "note",
      "supplier_id",
      "supplier_sku",
      "line_amount",
      "related_shipment_id",
      "request_order_id",
      "request_order_line_id",
      "request_bucket",
      "company",
      "supplier_name",
      "supplier_warehouse_id",
      "recommended_qty",
      "requested_qty",
      "approved_qty",
      "created_at",
      "updated_at",
      "import_batch_id",
      "opening_completed_qty",
      "opening_shipped_qty"
    ],
    [
      "purchase_order_line_id",
      "purchase_order_id",
      "series",
      "sku",
      "factory_item_no",
      "factory_item_name",
      "km_qty",
      "resus_qty",
      "restw_qty",
      "ordered_qty",
      "completed_qty",
      "shipped_qty",
      "remaining_qty",
      "carton_qty",
      "units_per_carton",
      "unit_cost",
      "currency",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "actual_completion_date",
      "line_status",
      "note",
      "supplier_id",
      "supplier_sku",
      "line_amount",
      "related_shipment_id",
      "request_order_id",
      "request_order_line_id",
      "request_bucket",
      "company",
      "supplier_name",
      "supplier_warehouse_id",
      "recommended_qty",
      "requested_qty",
      "approved_qty",
      "created_at",
      "updated_at",
      "import_batch_id",
      "opening_completed_qty",
      "opening_shipped_qty",
      "opening_lineage_qty"
    ],
    [
      "purchase_order_line_id",
      "purchase_order_id",
      "series",
      "sku",
      "factory_item_no",
      "factory_item_name",
      "km_qty",
      "resus_qty",
      "restw_qty",
      "ordered_qty",
      "completed_qty",
      "shipped_qty",
      "remaining_qty",
      "carton_qty",
      "units_per_carton",
      "unit_cost",
      "currency",
      "inspection_date",
      "expected_completion_date",
      "expected_ship_date",
      "actual_completion_date",
      "line_status",
      "note",
      "supplier_id",
      "supplier_sku",
      "line_amount",
      "related_shipment_id",
      "request_order_id",
      "request_order_line_id",
      "request_bucket",
      "company",
      "supplier_name",
      "supplier_warehouse_id",
      "recommended_qty",
      "requested_qty",
      "approved_qty",
      "created_at",
      "updated_at",
      "import_batch_id",
      "opening_completed_qty",
      "opening_shipped_qty",
      "opening_lineage_qty",
      "opening_reconcile_status"
    ]
  ],
  "request_orders": [
    [
      "request_order_id",
      "request_order_no",
      "request_batch_id",
      "request_scope",
      "source_calculation_run_id",
      "request_date",
      "tier_group",
      "converted_purchase_order_id",
      "parent_request_order_id",
      "company",
      "supplier_id",
      "supplier_name",
      "factory_id",
      "warehouse_id",
      "request_status",
      "total_sku",
      "total_qty",
      "total_cartons",
      "estimated_amount",
      "currency",
      "request_order_version",
      "source",
      "source_ref_type",
      "source_ref_id",
      "created_by",
      "created_at",
      "submitted_by",
      "submitted_at",
      "updated_by",
      "updated_at",
      "rejected_by",
      "rejected_at",
      "rejected_reason",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason",
      "approved_by",
      "approved_at",
      "completed_by",
      "completed_at",
      "note"
    ]
  ],
  "request_order_lines": [
    [
      "request_order_line_id",
      "request_order_id",
      "sku",
      "tier_type",
      "series",
      "supplier_id",
      "supplier_name",
      "supplier_sku",
      "estimated_amount",
      "factory_item_no",
      "factory_item_name",
      "supplier_warehouse_id",
      "km_qty",
      "resus_qty",
      "restw_qty",
      "recommended_qty",
      "requested_qty",
      "approved_qty",
      "shortage_qty",
      "reallocation_qty",
      "carton_qty",
      "units_per_carton",
      "unit_cost",
      "currency",
      "calculation_method",
      "line_status",
      "inspection_date",
      "expected_ready_date",
      "expected_ship_date",
      "linked_purchase_order_line_id",
      "note",
      "created_at",
      "updated_at",
      "cancelled_by",
      "cancelled_at",
      "cancel_reason",
      "company",
      "request_bucket",
      "request_month",
      "purchase_order_line_id"
    ]
  ],
  "request_order_line_sources": [
    [
      "request_order_line_source_id",
      "request_order_line_id",
      "tier_type",
      "request_allocation_draft_id",
      "company",
      "country",
      "marketplace",
      "ownership_company",
      "warehouse_id",
      "site_sku",
      "forecast_qty",
      "current_stock",
      "on_the_way_qty",
      "factory_allocated_qty",
      "shortage_qty",
      "reallocation_qty",
      "recommended_qty",
      "requested_qty",
      "approved_qty",
      "allocation_method",
      "source_bucket",
      "source_month",
      "source_priority",
      "note",
      "created_at",
      "updated_at",
      "line_source_id",
      "request_order_id",
      "sku",
      "source_type",
      "marketplace_product_id"
    ]
  ],
  "request_order_site_confirmations": [
    [
      "confirmation_id",
      "planning_cycle",
      "planning_month",
      "company",
      "country",
      "marketplace",
      "series",
      "status",
      "confirmed_by",
      "confirmed_at",
      "note",
      "created_at",
      "updated_at",
      "site_confirmation_id",
      "bucket"
    ]
  ]
};

// SC1: only pinned physical layouts of this module's two tables are compatible.
function procurementRequireKnownLayoutSc1_(ss, name, required) {
  var layouts = PROC_PHYSICAL_LAYOUTS_SC1_[name];
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
