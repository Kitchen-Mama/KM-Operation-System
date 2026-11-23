




























var IMI_BUILD_VERSION_ = "F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-IU2-IU3";
var IMI_SHEET_ = 'Stock';
var IMI_MAX_ROWS_ = 2000, IMI_NOTE_MAX_ = 500, IMI_QTY_MAX_ = 100000000;
var IMI_CUTOFF_NOTE_ = 'Snapshot cutoff = the moment of COMMIT (server clock, script time zone). The figure you import must be the count at that moment; the movement written is (file - system stock at commit).';




var IMI_FACTORY_FIELDS_ = [
{ key: 'row_type', header: 'row_type', role: 'system', type: 'text', modes: ['SET', 'ADD'], hidden: true, db: '(none)', write: 'example = the server skips the row; anything else is data', create: false, update: false },
{ key: 'warehouse_id', header: 'Factory Warehouse ID', role: 'key', type: 'text', required: true, modes: ['SET', 'ADD'], list: 'warehouses', db: 'factory_stock.warehouse_id', ref: 'warehouses.warehouse_id (is_factory_warehouse = TRUE, warehouse_type FACTORY, active)', write: 'identity; must equal the selected factory (scope.warehouse_id)', create: true, update: false },
{ key: 'warehouse_code', header: 'Warehouse Code (ref)', role: 'reference', type: 'text', modes: ['SET', 'ADD'], db: 'warehouses.warehouse_code', write: 'read-only; when filled it must equal the canonical code', create: false, update: false },
{ key: 'sku', header: 'SKU', role: 'key', type: 'text', required: true, modes: ['SET', 'ADD'], list: 'skus', db: 'factory_stock.sku', ref: 'sku_details.sku (exact; never auto-created)', write: 'identity', create: true, update: false },
{ key: 'product_name', header: 'Product Name (ref)', role: 'reference', type: 'text', modes: ['SET', 'ADD'], db: 'sku_details.product_name', write: 'read-only, ignored', create: false, update: false },
{ key: 'current_stock_ref', header: 'Current Stock at Export (ref)', role: 'reference', type: 'integer', modes: ['SET', 'ADD'], db: 'factory_stock.fac_current_stock', write: 'read-only, ignored (row_version proves it is still current)', create: false, update: false },
{ key: 'reserved_ref', header: 'Reserved (ref)', role: 'reference', type: 'integer', modes: ['SET', 'ADD'], db: 'factory_stock.fac_reserved_stock', write: 'read-only; an import never writes reserved', create: false, update: false },
{ key: 'available_ref', header: 'Available (ref)', role: 'derived', type: 'integer', modes: ['SET', 'ADD'], db: 'fac_current_stock - fac_reserved_stock (derived, not stored)', write: 'read-only', create: false, update: false },
{ key: 'current_stock_qty', header: 'Target Current Stock (SET)', role: 'input', type: 'integer >= 0', required: true, modes: ['SET'], db: 'factory_stock.fac_current_stock', write: 'fac_current_stock := value; one factory_stock_movements row movement_type inventory_import, qty = value - before; refused when value < fac_reserved_stock', prefill: 'current fac_current_stock (Update export)', create: true, update: true },
{ key: 'add_qty', header: 'Quantity to Add (ADD)', role: 'input', type: 'integer >= 0', required: true, modes: ['ADD'], db: 'factory_stock.fac_current_stock', write: 'fac_current_stock := before + value (a new key starts at 0); one factory_stock_movements row movement_type inventory_import, qty = +value', prefill: 'NEVER (blank in every export)', create: true, update: true },
{ key: 'note', header: 'Note', role: 'input', type: 'text <= 500', modes: ['SET', 'ADD'], db: 'factory_stock_movements.note', write: 'stored on the movement row only (factory_stock has no note column)', create: true, update: true },
{ key: 'row_version', header: 'row_version', role: 'system', type: 'digest', modes: ['SET', 'ADD'], hidden: true, db: '(digest of warehouse_id, sku, fac_current_stock, fac_reserved_stock at export)', write: 'checked: a stock row that changed since the export is refused (STALE_EXPORT); never written', create: false, update: false }
];
var IMI_OVERSEAS_FIELDS_ = [
{ key: 'row_type', header: 'row_type', role: 'system', type: 'text', modes: ['SET', 'ADD'], hidden: true, db: '(none)', write: 'example = the server skips the row; anything else is data', create: false, update: false },
{ key: 'warehouse_id', header: 'Warehouse ID', role: 'key', type: 'text', required: true, modes: ['SET', 'ADD'], list: 'warehouses', db: 'overseas_inventory_snapshot.warehouse_id', ref: 'warehouses.warehouse_id (active, not a factory, warehouse_type not FBA / RETURN / FACTORY)', write: 'identity; must equal the selected warehouse (scope.warehouse_id)', create: true, update: false },
{ key: 'company', header: 'Company (ref)', role: 'reference', type: 'text', modes: ['SET', 'ADD'], db: 'warehouses.company', write: 'read-only; when filled it must equal the warehouse\'s company', create: false, update: false },
{ key: 'sku', header: 'SKU', role: 'key', type: 'text', required: true, modes: ['SET', 'ADD'], list: 'skus', db: 'overseas_inventory_snapshot.sku', ref: 'sku_details.sku (exact; never auto-created)', write: 'identity', create: true, update: false },
{ key: 'site_sku', header: 'Site SKU (ref)', role: 'reference', type: 'text', modes: ['SET', 'ADD'], db: 'overseas_inventory_snapshot.site_sku', write: 'read-only, never written (a created row leaves it blank, as 05_ and 31_ do)', create: false, update: false },
{ key: 'product_name', header: 'Product Name (ref)', role: 'reference', type: 'text', modes: ['SET', 'ADD'], db: 'sku_details.product_name', write: 'read-only, ignored', create: false, update: false },
{ key: 'available_ref', header: 'Available at Export (ref)', role: 'reference', type: 'integer', modes: ['SET', 'ADD'], db: 'overseas_inventory_snapshot.wh_available_stock (STORED allocatable)', write: 'read-only', create: false, update: false },
{ key: 'reserved_ref', header: 'Reserved (ref)', role: 'reference', type: 'integer', modes: ['SET', 'ADD'], db: 'overseas_inventory_snapshot.wh_reserved_stock', write: 'read-only; an import never writes reserved', create: false, update: false },
{ key: 'available_stock', header: 'Quantity after update - before reserved (SET)', aliases: ['Source Available - GROSS (SET)'], role: 'input', type: 'integer >= 0', modes: ['SET'], db: 'overseas_inventory_snapshot.wh_available_stock', write: 'GROSS: wh_available_stock := value - wh_reserved_stock; refused when value < wh_reserved_stock; a change writes one overseas_inventory_movements row movement_type inventory_import, wh_quantity = after - before. Blank = unchanged', prefill: 'wh_available_stock + wh_reserved_stock (Update export)', create: true, update: true },
{ key: 'damaged_stock', header: 'Damaged (SET)', role: 'input', type: 'integer >= 0', modes: ['SET'], db: 'overseas_inventory_snapshot.wh_damaged_stock', write: 'wh_damaged_stock := value (absolute). Blank = unchanged. Audit only, no movement row', prefill: 'current', create: true, update: true },
{ key: 'on_the_way_qty', header: 'On the Way (SET)', role: 'input', type: 'integer >= 0', modes: ['SET'], db: 'overseas_inventory_snapshot.wh_on_the_way_qty', write: 'wh_on_the_way_qty := value (absolute). Blank = unchanged. Audit only, no movement row', prefill: 'current', create: true, update: true },
{ key: 'on_the_way_eta', header: 'On the Way ETA (SET)', role: 'input', type: 'date yyyy-MM-dd | [CLEAR]', modes: ['SET'], db: 'overseas_inventory_snapshot.wh_on_the_way_eta', write: 'date; [CLEAR] empties it; blank = unchanged', prefill: 'current', create: true, update: true },
{ key: 'add_available_qty', header: 'Quantity to add (ADD)', aliases: ['Available to Add (ADD)'], role: 'input', type: 'integer >= 0', required: true, modes: ['ADD'], db: 'overseas_inventory_snapshot.wh_available_stock', write: 'wh_available_stock := before + value (a new key starts at 0); reserved / damaged / on the way untouched; one overseas_inventory_movements row movement_type inventory_import, wh_quantity = +value', prefill: 'NEVER (blank in every export)', create: true, update: true },
{ key: 'note', header: 'Note', role: 'input', type: 'text <= 500 | [CLEAR]', modes: ['SET', 'ADD'], db: 'SET: overseas_inventory_snapshot.note (+ the movement note); ADD: overseas_inventory_movements.note only', write: 'SET: blank = unchanged, [CLEAR] empties; ADD: movement note', prefill: 'SET: current; ADD: blank', create: true, update: true },
{ key: 'row_version', header: 'row_version', role: 'system', type: 'digest', modes: ['SET', 'ADD'], hidden: true, db: '(digest of warehouse_id, sku and every stock bucket, eta and note at export)', write: 'checked: a row that changed since the export is refused (STALE_EXPORT); never written', create: false, update: false }
];


function imiTable_(ss, name) {
var sh = ss.getSheetByName(name); if (!sh) return null;
var d = sh.getDataRange().getValues(), H = (d[0] || []).map(function (h) { return imbStr_(h).toLowerCase(); });
return { sheet: sh, H: H, rows: d.slice(1), col: function () { for (var i = 0; i < arguments.length; i++) { var c = H.indexOf(arguments[i]); if (c !== -1) return c; } return -1; } };
}
function imiNum_(v) { var n = parseFloat(v); return isFinite(n) ? Math.round(n) : 0; }
function imiDay_(v) { if (v instanceof Date) return imbDate_(v) || ''; return imbStr_(v); }
function imiTruthy_(v) { return factoryImportTruthy_(v); }
function imiWarehouses_(ss) {
var t = imiTable_(ss, 'warehouses'), out = {};
if (!t) return null;
var iId = t.col('warehouse_id'), iCode = t.col('warehouse_code'), iName = t.col('warehouse_name'), iAct = t.col('is_active'), iFac = t.col('is_factory_warehouse');
var iType = t.col('warehouse_type'), iSt = t.col('status'), iCo = t.col('company'), iCty = t.col('country');
if (iId === -1) return null;
t.rows.forEach(function (r) {
var id = imbStr_(r[iId]); if (!id || out[id]) return;
out[id] = { warehouseId: id, warehouseCode: iCode >= 0 ? imbStr_(r[iCode]) : '', name: iName >= 0 ? imbStr_(r[iName]) : '',
isActive: iAct >= 0 ? imiTruthy_(r[iAct]) : (iSt >= 0 ? imbLc_(r[iSt]) === 'active' : true), isFactory: iFac >= 0 ? imiTruthy_(r[iFac]) : false,
type: iType >= 0 ? imbStr_(r[iType]) : '', company: iCo >= 0 ? imbStr_(r[iCo]) : '', country: iCty >= 0 ? imbStr_(r[iCty]) : '' };
});
return out;
}
function imiSkus_(ss) {
var t = imiTable_(ss, 'sku_details'), out = Object.create(null);
if (!t || t.col('sku') === -1) return null;
var rows = t.rows.map(function (r) { var o = {}; t.H.forEach(function (h, i) { o[h] = r[i]; }); return o; });
skuInventoryReadRows_(ss, rows).forEach(function (r) { var s = imbStr_(r.sku); if (s && !out[s]) out[s] = { name: imbStr_(r.product_name), status: imbStr_(r.status || r.product_status), masterSku: imbStr_(r.inventory_master_sku) || s }; });
return out;
}
function imiSkuList_(skus) { return Object.keys(skus).sort().map(function (s) { return { value: s, label: skus[s].name || s, status: skus[s].status || '' }; }); }
function imiColumns_(fields, mode) {
return fields.filter(function (f) { return f.modes.indexOf(mode) >= 0; }).map(function (f) {
var kind = f.role === 'key' || (f.role === 'input' && f.required) ? 'required' : (f.role === 'input' ? 'editable' : 'locked');
if (f.key === 'available_stock' || f.key === 'add_available_qty') kind = 'business';
return { key: f.key, header: f.header, aliases: f.aliases || [], kind: kind, role: f.role, type: f.type, required: !!f.required, list: f.list || '', db: f.db, comment: f.write, hidden: !!f.hidden };
});
}
function imiContract_(domain, fields) {
return { domain: domain, fields: fields.map(function (f) { return Object.assign({}, f); }) };
}
function imiNoTemplate_(code, msg) { var e = new Error(msg); e.importCode = code; return e; }

function imiRowIssue_(rec, field, code, msg, value) { imbIssue_(rec.issues, IMI_SHEET_, rec.row, field, code, msg, value); }
function imiQty_(rec, cell, field, required) {
if (cell.absent || cell.blank) { if (required) imiRowIssue_(rec, field, 'QTY_REQUIRED', field + ' is required (blank is not 0)'); return { supplied: false }; }
if (cell.clear) { imiRowIssue_(rec, field, 'QTY_INVALID', field + ' cannot be cleared; write 0 for zero', cell.value); return { supplied: false }; }
var n = imbInt_(cell.value);
if (n === null || n < 0) { imiRowIssue_(rec, field, 'QTY_INVALID', field + ' must be a whole number >= 0 (no decimals, no sign)', cell.value); return { supplied: false }; }
if (n > IMI_QTY_MAX_) { imiRowIssue_(rec, field, 'QTY_TOO_LARGE', field + ' is over ' + IMI_QTY_MAX_, cell.value); return { supplied: false }; }
return { supplied: true, value: n };
}
function imiBlank_(c) { return c.absent || c.blank; }
function imiCounts_(prev) {
var c = { create: 0, update: 0, unchanged: 0, reject: 0 };
prev.forEach(function (p) { if (p.status === 'REJECT') c.reject++; else if (p.status === 'CREATE') c.create++; else if (p.status === 'UPDATE') c.update++; else c.unchanged++; });
return c;
}


var IMI_FACTORY_MOV_REQUIRED_ = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty', 'related_entity_type', 'related_entity_id',
'before_current_stock', 'after_current_stock', 'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];
function imiFactoryRowVersion_(wh, sku, st) { return imbDigestOf_({ warehouse_id: wh, sku: sku, current: st ? st.current : '', reserved: st ? st.reserved : '', exists: st ? 1 : 0 }, ['warehouse_id', 'sku', 'current', 'reserved', 'exists']); }

function imiFactoryRead_(ss) {
var issues = [], stock = imiTable_(ss, 'factory_stock'), mov = imiTable_(ss, 'factory_stock_movements');
if (!stock) issues.push({ code: 'IMPORT_TABLE_MISSING', field: 'factory_stock', message: 'the factory_stock sheet is missing' });
if (!mov) issues.push({ code: 'IMPORT_TABLE_MISSING', field: 'factory_stock_movements', message: 'the factory_stock_movements sheet is missing - this import never creates it' });
var idx = {}, dup = {}, ci = {};
if (stock) {
ci = { wh: stock.col('warehouse_id'), sku: stock.col('sku'), cur: stock.col('fac_current_stock', 'current_stock'), res: stock.col('fac_reserved_stock', 'reserved_stock'), id: stock.col('factory_stock_id') };
['wh', 'sku', 'cur', 'res'].forEach(function (k) { if (ci[k] === -1) issues.push({ code: 'IMPORT_COLUMN_MISSING', field: 'factory_stock.' + { wh: 'warehouse_id', sku: 'sku', cur: 'fac_current_stock', res: 'fac_reserved_stock' }[k], message: 'factory_stock lacks a required column' }); });
if (!issues.length) stock.rows.forEach(function (r) {
var wh = imbStr_(r[ci.wh]), sku = imbStr_(r[ci.sku]); if (!wh || !sku) return;
var k = wh + '||' + sku;
if (idx[k]) { dup[k] = true; return; }
idx[k] = { current: imiNum_(r[ci.cur]), reserved: imiNum_(r[ci.res]), id: ci.id >= 0 ? imbStr_(r[ci.id]) : '' };
});
}
if (mov) IMI_FACTORY_MOV_REQUIRED_.forEach(function (h) { if (mov.H.indexOf(h) === -1) issues.push({ code: 'IMPORT_COLUMN_MISSING', field: 'factory_stock_movements.' + h, message: 'factory_stock_movements lacks a required column - this import never adds it' }); });
return { issues: issues, idx: idx, dup: dup, st: stock ? [stock.H].concat(stock.rows) : null, mv: mov ? [mov.H].concat(mov.rows) : null };   // R71-RCV-1c (review M1): the raw sheets for the books gate
}
function imiFactoryScope_(scope, whs) {
var selWh = imbStr_(scope && scope.warehouse_id);
if (!selWh) return { code: 'IMPORT_SCOPE_REQUIRED', message: 'select ONE factory (scope.warehouse_id) - one file = one factory' };
var g = factoryImportScopeCheck_([], { warehouse_id: selWh, warehouse_code: scope.warehouse_code }, whs);
if (!g.ok) return { code: 'IMPORT_SCOPE_INVALID', message: g.message };
return { ok: true, wh: selWh, rec: whs[selWh] };
}
function imiFactoryTemplate_(ss, o) {
var mode = o.mode, whs = imiWarehouses_(ss), skus = imiSkus_(ss);
if (!whs || !skus) throw imiNoTemplate_('IMPORT_MASTER_UNREADABLE', 'warehouses / sku_details cannot be read');
var sc = imiFactoryScope_(o.scope || {}, whs); if (!sc.ok) throw imiNoTemplate_(sc.code, sc.message);
var rd = imiFactoryRead_(ss); if (rd.issues.length) throw imiNoTemplate_(rd.issues[0].code, rd.issues.map(function (i) { return i.field; }).join(', ') + ': ' + rd.issues[0].message);
var rows = [];
if (o.include_data) Object.keys(rd.idx).filter(function (k) { return k.split('||')[0] === sc.wh; }).sort().forEach(function (k) {
var st = rd.idx[k], sku = k.split('||')[1], r = {};
r.row_type = ''; r.warehouse_id = sc.wh; r.warehouse_code = sc.rec.warehouseCode; r.sku = sku; r.product_name = skus[sku] ? skus[sku].name : '';
r.current_stock_ref = st.current; r.reserved_ref = st.reserved; r.available_ref = st.current - st.reserved;
if (mode === 'SET') r.current_stock_qty = st.current; else r.add_qty = '';
r.note = ''; r.row_version = imiFactoryRowVersion_(sc.wh, sku, st);
rows.push(r);
});
var ex = { row_type: 'example', warehouse_id: sc.wh, sku: 'EXAMPLE-SKU', note: 'example row - skipped' };
ex[mode === 'SET' ? 'current_stock_qty' : 'add_qty'] = 0;
return { sheets: [{ name: IMI_SHEET_, columns: imiColumns_(IMI_FACTORY_FIELDS_, mode), rows: rows, example_row: ex }],
lists: { warehouses: [{ value: sc.wh, label: (sc.rec.name || sc.wh) + (sc.rec.warehouseCode ? ' (' + sc.rec.warehouseCode + ')' : ''), status: sc.rec.isActive ? 'active' : 'inactive' }], skus: imiSkuList_(skus) },
scope: { warehouse_id: sc.wh }, scope_label: 'Factory ' + (sc.rec.name || sc.wh) + ' [' + sc.wh + '] - ' + (o.include_data ? 'ALL ' + rows.length + ' stock rows of this factory (complete, not a page)' : 'blank import file'),
row_counts: { Stock: rows.length }, complete: !!o.include_data, contract: imiContract_('factory_inventory', IMI_FACTORY_FIELDS_),
notes: [
mode === 'SET' ? 'MODE SET: Target Current Stock -> factory_stock.fac_current_stock := value; movement inventory_import qty = value - current. A target below Reserved is refused.'
: 'MODE ADD: Quantity to Add -> factory_stock.fac_current_stock := current + value (a new SKU starts at 0); movement inventory_import qty = +value. The input column is NEVER prefilled; Current Stock is a read-only reference.',
'Reserved (fac_reserved_stock) is never written by an import. Available = Current - Reserved (derived).',
'Rows not in the file are not changed or zeroed. Blank is not 0: a blank quantity on an exported row means "no change"; on a new row it is refused.',
'row_version proves the stock row has not changed since this export; if it has, the row is refused (STALE_EXPORT) - export again.',
IMI_CUTOFF_NOTE_,
'Rows with row_type = example are skipped. Warehouse and SKU must already exist; nothing is auto-created.'] };
}
function imiFactoryValidate_(ss, req) {
var mode = req.mode, issues = [], whs = imiWarehouses_(ss), skus = imiSkus_(ss);
var empty = function () { return { issues: issues, plan: null, preview: { counts: { create: 0, update: 0, unchanged: 0, reject: 0 }, rows: [] }, state: {} }; };
if (!whs || !skus) { imbIssue_(issues, '', 0, 'warehouses/sku_details', 'IMPORT_MASTER_UNREADABLE', 'the warehouse or SKU master cannot be read - nothing can be validated'); return empty(); }
var sc = imiFactoryScope_(req.scope || {}, whs);
if (!sc.ok) { imbIssue_(issues, '', 0, 'scope.warehouse_id', sc.code, sc.message, req.scope && req.scope.warehouse_id); return empty(); }
var rd = imiFactoryRead_(ss);
if (rd.issues.length) { rd.issues.forEach(function (i) { imbIssue_(issues, '', 0, i.field, i.code, i.message); }); return empty(); }
var inKey = mode === 'SET' ? 'current_stock_qty' : 'add_qty', otherKey = mode === 'SET' ? 'add_qty' : 'current_stock_qty';
var recs = [], skipped = { example: 0, blank: 0, unknown_sku: 0, rows: [] }, byKey = {};
(req.sheets[IMI_SHEET_] || []).forEach(function (r) {
if (imbLc_(r.row_type) === 'example') { skipped.example += 1; return; }
var whC = imbCell_(r, 'warehouse_id'), skC = imbCell_(r, 'sku'), qC = imbCell_(r, inKey), oC = imbCell_(r, otherKey), nC = imbCell_(r, 'note'), rvC = imbCell_(r, 'row_version'), cdC = imbCell_(r, 'warehouse_code');
if (imiBlank_(whC) && imiBlank_(skC) && imiBlank_(qC) && imiBlank_(oC)) { skipped.blank++; return; }
var rec = { row: r.__row, issues: [], wh: imbStr_(whC.value), sku: imbStr_(skC.value), rv: imiBlank_(rvC) ? '' : imbStr_(rvC.value), note: imiBlank_(nC) || nC.clear ? '' : String(nC.value) };
if (!rec.wh) imiRowIssue_(rec, 'warehouse_id', 'WAREHOUSE_ID_REQUIRED', 'warehouse_id is required');
else if (!whs[rec.wh]) imiRowIssue_(rec, 'warehouse_id', 'WAREHOUSE_NOT_FOUND', 'no such warehouse (never auto-created)', rec.wh);
else if (rec.wh !== sc.wh) imiRowIssue_(rec, 'warehouse_id', 'ROW_OUT_OF_SCOPE', 'this file imports factory ' + sc.wh + ' only; the row names ' + rec.wh + (whs[rec.wh].isFactory ? '' : ' (not a factory - Overseas stock is imported on the Overseas page)'), rec.wh);
if (!imiBlank_(cdC) && whs[rec.wh] && whs[rec.wh].warehouseCode && imbLc_(cdC.value) !== imbLc_(whs[rec.wh].warehouseCode)) imiRowIssue_(rec, 'warehouse_code', 'WAREHOUSE_CODE_MISMATCH', 'warehouse_code does not match ' + rec.wh + ' (' + whs[rec.wh].warehouseCode + ')', cdC.value);
if (!rec.sku) imiRowIssue_(rec, 'sku', 'SKU_REQUIRED', 'sku is required');
else if (!skus[rec.sku]) {
if (!rec.issues.length) { skipped.unknown_sku++; skipped.rows.push({ row: rec.row, sku: rec.sku, code: 'SKU_NOT_FOUND' }); return; }
imiRowIssue_(rec, 'sku', 'SKU_NOT_FOUND', 'no registered inventory SKU (never auto-created)', rec.sku);
}
if (!imiBlank_(oC)) imiRowIssue_(rec, otherKey, 'MODE_COLUMN_MISMATCH', otherKey + ' belongs to mode ' + (mode === 'SET' ? 'ADD' : 'SET') + '; this batch is ' + mode + ' - leave it blank or choose the other mode', oC.value);
var q = imiQty_(rec, qC, inKey, !rec.rv);
rec.q = q.supplied ? q.value : null;
if (rec.note.length > IMI_NOTE_MAX_) imiRowIssue_(rec, 'note', 'NOTE_TOO_LONG', 'note is over ' + IMI_NOTE_MAX_ + ' characters');
rec.key = rec.wh && rec.sku ? rec.wh + '||' + rec.sku : '';
if (rec.key) { if (byKey[rec.key]) { imiRowIssue_(rec, 'sku', 'DUPLICATE_KEY', 'the same warehouse_id + sku is on row ' + byKey[rec.key].row, rec.sku); imiRowIssue_(byKey[rec.key], 'sku', 'DUPLICATE_KEY', 'the same warehouse_id + sku is on row ' + rec.row, rec.sku); } else byKey[rec.key] = rec; }
if (rec.key && rd.dup[rec.key]) imiRowIssue_(rec, 'sku', 'DB_DUPLICATE_KEY', 'factory_stock holds this warehouse_id + sku more than once - fix the data first', rec.sku);
recs.push(rec);
});
if (!recs.length && skipped.unknown_sku) imbIssue_(issues, IMI_SHEET_, 0, 'sku', 'NO_APPLICABLE_SKUS', 'Unknown SKUs were skipped; no stock will be written.');
var state = { domain: 'factory_inventory', scope: sc.wh, keys: {}, sku_mappings: {}, skipped_unknown_skus: skipped.rows }, items = [], prev = [];
recs.forEach(function (rec) {
if (skus[rec.sku]) state.sku_mappings[rec.sku] = skus[rec.sku].masterSku;
var st = rec.key ? rd.idx[rec.key] || null : null;
if (rec.key) state.keys[rec.key] = st ? { exists: true, current: st.current, reserved: st.reserved } : { exists: false };
if (rec.rv && rec.key && rec.rv !== imiFactoryRowVersion_(rec.wh, rec.sku, st)) imiRowIssue_(rec, 'row_version', 'STALE_EXPORT', 'this stock row changed after the file was exported (now current ' + (st ? st.current : 'no row') + ') - export again', rec.rv);
var before = st ? st.current : 0, reserved = st ? st.reserved : 0, after = null;
if (rec.q !== null) after = mode === 'SET' ? rec.q : before + rec.q;
if (mode === 'SET' && after !== null && after < reserved) imiRowIssue_(rec, inKey, 'SET_BELOW_RESERVED', 'target ' + after + ' is below the reserved ' + reserved + ' - a SET never releases a reservation; reduce it on the shipment first or import at least ' + reserved, rec.q);
// R71-RCV-1c (review REVIEW_R71_RCV_1B M1): the factory import, the same CH7-2 rule (fac_current_stock == the newest after_current_stock).
if (!rec.issues.length && after !== null && after !== before && rd.st && rd.mv) { var bk71f_ = adjBooksGate_(false, rd.st, rd.mv, rec.wh, rec.sku); if (bk71f_) imiRowIssue_(rec, 'sku', 'FACTORY_IMPORT_BOOKS_UNKNOWN', 'the factory stock of this key does not equal its movement ledger (' + bk71f_ + '): importing over it would hide the difference. Nothing in this file was written - remove this row (the key needs the owner\'s review) and send the file again', rec.sku); }
var status = rec.issues.length ? 'REJECT' : (after === null ? 'NOT_SUPPLIED' : (after === before ? 'UNCHANGED' : (st ? 'UPDATE' : 'CREATE')));
prev.push({ row: rec.row, warehouse_id: rec.wh, sku: rec.sku, status: status, mode: mode, input: rec.q, before_current: st ? before : null, reserved: reserved, before_available: st ? before - reserved : null,
after_current: after, after_available: after === null ? null : after - reserved, delta: after === null ? 0 : after - before, movement_qty: status === 'CREATE' || status === 'UPDATE' ? after - before : 0,
issues: rec.issues.map(function (i) { return i.code; }) });
issues = issues.concat(rec.issues);
if (status === 'CREATE' || status === 'UPDATE') items.push({ row: rec.row, warehouse_id: rec.wh, sku: rec.sku, exists: !!st, before: before, reserved: reserved, after: after, delta: after - before, note: rec.note,
entity_id: st && st.id ? st.id : 'FS-' + rec.wh + '-' + rec.sku });
});
var inScope = Object.keys(rd.idx).filter(function (k) { return k.split('||')[0] === sc.wh; });
var counts = imiCounts_(prev);
counts.skipped = skipped.unknown_sku;
return { issues: issues, plan: { mode: mode, items: items }, state: state,
preview: { counts: counts, rows: prev, skipped: skipped,
impacts: { factory_stock: { create: counts.create, update: counts.update, reserved_changed: 0 }, factory_stock_movements: { append: items.length, movement_type: 'inventory_import', related_entity_type: 'factory_inventory_import', related_entity_id: '<this import_batch_id>' },
total_delta: items.reduce(function (s, i) { return s + i.delta; }, 0),
snapshot: { mode: mode, cutoff: IMI_CUTOFF_NOTE_, coverage: { warehouse_id: sc.wh, keys_in_file: recs.length, stock_rows_in_scope: inScope.length, stock_rows_not_in_file_unchanged: inScope.filter(function (k) { return !byKey[k]; }).length } } } } };
}
// Match StockPO's landed-append compensation when a Sheets call writes and then throws.
function imiApplyTx_(sheets, journal, apply) {
var before = sheets.map(function (sh) { return sh.getLastRow(); });
try { return apply(); } catch (error) {
sheets.forEach(function (sh, i) {
var covered = journal.entries.some(function (e) { return e.sheet && e.sheet.getName() === sh.getName() && (e.kind === 'row' || e.kind === 'rows') && e.row > before[i]; });
if (!covered) imbJournalLanded_(journal.entries, sh, before[i], 1);
});
throw error;
}
}
function imiFactoryApply_(ss, plan, ctx) {
var stockSheet = ss.getSheetByName('factory_stock'), movSheet = ss.getSheetByName('factory_stock_movements');
var res = { created: 0, updated: 0, movements: 0, total_delta: 0, movement_ids: [] };
(plan && plan.items || []).forEach(function (p) {
var r = imiApplyTx_([stockSheet, movSheet], ctx.journal, function () { return factoryInventoryImportApplyTx_({ stockSheet: stockSheet, movSheet: movSheet, warehouseId: p.warehouse_id, sku: p.sku, expect: { exists: p.exists, current: p.before, reserved: p.reserved },
afterCurrent: p.after, batchId: ctx.batch_id, journal: ctx.journal.entries, now: ctx.now, movementDate: String(ctx.now).slice(0, 10), createdBy: ctx.actor,
note: 'import ' + ctx.mode + ' ' + ctx.batch_id + (p.note ? ' | ' + p.note : '') }); });
if (!r.applied) return;
if (r.created) res.created++; else res.updated++;
res.movements++; res.total_delta += r.delta; res.movement_ids.push(r.movementId);
ctx.journal.change({ entity_table: 'factory_stock', entity_id: p.entity_id, line_id: p.warehouse_id + '||' + p.sku, field: 'fac_current_stock', before: p.exists ? r.beforeCurrent : '', after: r.afterCurrent, movement_id: r.movementId });
});
return { result: res };
}
function imbFactoryInventoryDomain_() {
return { domain: 'factory_inventory', schema_version: 'FACTORY_INVENTORY-IMPORT-1', modes: ['SET', 'ADD'], sheets: [IMI_SHEET_], maxRows: IMI_MAX_ROWS_,
fields: IMI_FACTORY_FIELDS_, build: IMI_BUILD_VERSION_,
template: imiFactoryTemplate_, validate: imiFactoryValidate_, apply: imiFactoryApply_ };
}


var IMI_OVS_MOV_REQUIRED_ = ['movement_id', 'movement_date', 'warehouse_id', 'sku', 'movement_type', 'movement_scope', 'to_stock_type', 'wh_quantity', 'wh_quantity_before', 'wh_quantity_after',
'wh_before_available_stock', 'wh_after_available_stock', 'wh_before_reserved_stock', 'wh_after_reserved_stock', 'reference_type', 'reference_id', 'source_module', 'created_by', 'created_at', 'note'];
var IMI_OVS_BUCKETS_ = { available: 'wh_available_stock', reserved: 'wh_reserved_stock', damaged: 'wh_damaged_stock', otw: 'wh_on_the_way_qty', eta: 'wh_on_the_way_eta', note: 'note' };
function imiOverseasRowVersion_(wh, sku, st) {
var o = { warehouse_id: wh, sku: sku, exists: st ? 1 : 0 };
['available', 'reserved', 'damaged', 'otw', 'eta', 'note'].forEach(function (k) { o[k] = st ? st[k] : ''; });
return imbDigestOf_(o, ['warehouse_id', 'sku', 'exists', 'available', 'reserved', 'damaged', 'otw', 'eta', 'note']);
}
function imiOverseasRead_(ss) {
var issues = [], snap = imiTable_(ss, 'overseas_inventory_snapshot'), mov = imiTable_(ss, 'overseas_inventory_movements');
if (!snap) issues.push({ code: 'IMPORT_TABLE_MISSING', field: 'overseas_inventory_snapshot', message: 'the overseas_inventory_snapshot sheet is missing' });
if (!mov) issues.push({ code: 'IMPORT_TABLE_MISSING', field: 'overseas_inventory_movements', message: 'the overseas_inventory_movements sheet is missing - this import never creates it' });
var idx = {}, dup = {};
if (snap) {
var ci = { wh: snap.col('warehouse_id'), sku: snap.col('sku'), id: snap.col('overseas_inventory_id', 'snapshot_id'), site: snap.col('site_sku'), available: snap.col('wh_available_stock', 'available_stock'),
reserved: snap.col('wh_reserved_stock', 'reserved_stock'), damaged: snap.col('wh_damaged_stock', 'damaged_stock'), otw: snap.col('wh_on_the_way_qty', 'on_the_way_qty'), eta: snap.col('wh_on_the_way_eta', 'on_the_way_eta'),
note: snap.col('note'), created: snap.col('created_at'), updated: snap.col('updated_at') };
Object.keys(ci).forEach(function (k) { if (ci[k] === -1 && k !== 'site') issues.push({ code: 'IMPORT_COLUMN_MISSING', field: 'overseas_inventory_snapshot.' + (IMI_OVS_BUCKETS_[k] || { wh: 'warehouse_id', sku: 'sku', id: 'overseas_inventory_id', created: 'created_at', updated: 'updated_at' }[k]), message: 'overseas_inventory_snapshot lacks a required column - this import never adds it' }); });
if (!issues.length) snap.rows.forEach(function (r) {
var wh = imbStr_(r[ci.wh]), sku = imbStr_(r[ci.sku]); if (!wh || !sku) return;
var k = wh + '||' + sku;
if (idx[k]) { dup[k] = true; return; }
idx[k] = { id: imbStr_(r[ci.id]), site_sku: ci.site >= 0 ? imbStr_(r[ci.site]) : '', available: imiNum_(r[ci.available]), reserved: imiNum_(r[ci.reserved]), damaged: imiNum_(r[ci.damaged]),
otw: imiNum_(r[ci.otw]), eta: imiDay_(r[ci.eta]), note: imbStr_(r[ci.note]) };
});
}
if (mov) IMI_OVS_MOV_REQUIRED_.forEach(function (h) { if (mov.H.indexOf(h) === -1) issues.push({ code: 'IMPORT_COLUMN_MISSING', field: 'overseas_inventory_movements.' + h, message: 'overseas_inventory_movements lacks a required column - this import never adds it' }); });
return { issues: issues, idx: idx, dup: dup, st: snap ? [snap.H].concat(snap.rows) : null, mv: mov ? [mov.H].concat(mov.rows) : null,
pend: (snap && mov && typeof ovsReceiptPendingScan_ === 'function') ? ovsReceiptPendingScan_([snap.H].concat(snap.rows), [mov.H].concat(mov.rows), null) : {} };   // R71-RCV-1 / -1c
}
function imiOverseasScope_(scope, whs) {
scope = scope || {};
var selWh = imbStr_(scope.warehouse_id);
if (!selWh) return { code: 'IMPORT_SCOPE_REQUIRED', message: 'select ONE overseas warehouse (scope.warehouse_id) - one file = one warehouse' };
var g = overseasImportScopeCheck_([], scope, whs);
if (!g.ok) return { code: 'IMPORT_SCOPE_INVALID', message: g.message };
return { ok: true, wh: selWh, rec: whs[selWh] };
}
function imiOverseasTemplate_(ss, o) {
var mode = o.mode, whs = imiWarehouses_(ss), skus = imiSkus_(ss);
if (!whs || !skus) throw imiNoTemplate_('IMPORT_MASTER_UNREADABLE', 'warehouses / sku_details cannot be read');
var sc = imiOverseasScope_(o.scope || {}, whs); if (!sc.ok) throw imiNoTemplate_(sc.code, sc.message);
var rd = imiOverseasRead_(ss); if (rd.issues.length) throw imiNoTemplate_(rd.issues[0].code, rd.issues.map(function (i) { return i.field; }).join(', ') + ': ' + rd.issues[0].message);
var rows = [];
if (o.include_data) Object.keys(rd.idx).filter(function (k) { return k.split('||')[0] === sc.wh; }).sort().forEach(function (k) {
var st = rd.idx[k], sku = k.split('||')[1], r = {};
r.row_type = ''; r.warehouse_id = sc.wh; r.company = sc.rec.company; r.sku = sku; r.site_sku = st.site_sku; r.product_name = skus[sku] ? skus[sku].name : '';
r.available_ref = st.available; r.reserved_ref = st.reserved;
if (mode === 'SET') { r.available_stock = st.available + st.reserved; r.damaged_stock = st.damaged; r.on_the_way_qty = st.otw; r.on_the_way_eta = st.eta; r.note = st.note; }
else { r.add_available_qty = ''; r.note = ''; }
r.row_version = imiOverseasRowVersion_(sc.wh, sku, st);
rows.push(r);
});
var ex = { row_type: 'example', warehouse_id: sc.wh, sku: 'EXAMPLE-SKU', note: 'example row - skipped' };
ex[mode === 'SET' ? 'available_stock' : 'add_available_qty'] = 0;
return { sheets: [{ name: IMI_SHEET_, columns: imiColumns_(IMI_OVERSEAS_FIELDS_, mode), rows: rows, example_row: ex }],
lists: { warehouses: [{ value: sc.wh, label: (sc.rec.name || sc.wh) + ' - ' + sc.rec.company + ' / ' + sc.rec.country, status: sc.rec.isActive ? 'active' : 'inactive' }], skus: imiSkuList_(skus) },
scope: { warehouse_id: sc.wh, company: sc.rec.company, country: sc.rec.country },
scope_label: 'Overseas ' + (sc.rec.name || sc.wh) + ' [' + sc.wh + '] - company ' + sc.rec.company + ' / ' + sc.rec.country + ' - ' + (o.include_data ? 'ALL ' + rows.length + ' snapshot rows of this warehouse (complete, not a page)' : 'blank import file'),
row_counts: { Stock: rows.length }, complete: !!o.include_data, contract: imiContract_('overseas_inventory', IMI_OVERSEAS_FIELDS_),
notes: [
mode === 'SET' ? 'MODE SET (GROSS): Source Available is the 3PL figure BEFORE this system\'s reservation; wh_available_stock := value - wh_reserved_stock, refused when value < Reserved. Damaged / On the Way / ETA / Note are absolute; blank = unchanged, [CLEAR] empties ETA / Note.'
: 'MODE ADD: Available to Add -> wh_available_stock := current + value (a new SKU starts at 0); Reserved, Damaged and On the Way are not touched. The input column is NEVER prefilled; Available is a read-only reference.',
'Every change of wh_available_stock writes one overseas_inventory_movements row (movement_type inventory_import, reference = this batch). Damaged / On the Way / ETA / Note changes are recorded in the batch audit only.',
'Reserved (wh_reserved_stock) is never written by an import. Rows not in the file are not changed or zeroed.',
'row_version proves the snapshot row has not changed since this export; if it has, the row is refused (STALE_EXPORT) - export again.',
IMI_CUTOFF_NOTE_,
'Rows with row_type = example are skipped. Unknown SKUs are listed as skipped and never written or auto-created. Known SKUs still require a valid warehouse, version and reconciled stock.'] };
}
function imiOverseasValidate_(ss, req) {
var mode = req.mode, issues = [], whs = imiWarehouses_(ss), skus = imiSkus_(ss);
var empty = function () { return { issues: issues, plan: null, preview: { counts: { create: 0, update: 0, unchanged: 0, reject: 0 }, rows: [] }, state: {} }; };
if (!whs || !skus) { imbIssue_(issues, '', 0, 'warehouses/sku_details', 'IMPORT_MASTER_UNREADABLE', 'the warehouse or SKU master cannot be read - nothing can be validated'); return empty(); }
var sc = imiOverseasScope_(req.scope || {}, whs);
if (!sc.ok) { imbIssue_(issues, '', 0, 'scope', sc.code, sc.message, req.scope && req.scope.warehouse_id); return empty(); }
var rd = imiOverseasRead_(ss);
if (rd.issues.length) { rd.issues.forEach(function (i) { imbIssue_(issues, '', 0, i.field, i.code, i.message); }); return empty(); }
var SETC = ['available_stock', 'damaged_stock', 'on_the_way_qty', 'on_the_way_eta'], ADDC = ['add_available_qty'];
var recs = [], skipped = { example: 0, blank: 0, unknown_sku: 0, rows: [] }, byKey = {};
(req.sheets[IMI_SHEET_] || []).forEach(function (r) {
if (imbLc_(r.row_type) === 'example') { skipped.example++; return; }
var c = {}; ['warehouse_id', 'sku', 'company', 'note', 'row_version'].concat(SETC, ADDC).forEach(function (k) { c[k] = imbCell_(r, k); });
var allBlank = ['warehouse_id', 'sku'].concat(SETC, ADDC).every(function (k) { return imiBlank_(c[k]); });
if (allBlank) { skipped.blank++; return; }
var rec = { row: r.__row, issues: [], wh: imbStr_(c.warehouse_id.value), sku: imbStr_(c.sku.value), rv: imiBlank_(c.row_version) ? '' : imbStr_(c.row_version.value), v: {} };
var whRec = rec.wh ? whs[rec.wh] : null;
if (!rec.wh) imiRowIssue_(rec, 'warehouse_id', 'WAREHOUSE_ID_REQUIRED', 'warehouse_id is required');
else if (!whRec) imiRowIssue_(rec, 'warehouse_id', 'WAREHOUSE_NOT_FOUND', 'no such warehouse (never auto-created)', rec.wh);
else if (rec.wh !== sc.wh) imiRowIssue_(rec, 'warehouse_id', 'ROW_OUT_OF_SCOPE', 'this file imports ' + sc.wh + ' (company ' + sc.rec.company + ') only; the row names ' + rec.wh + ' (company ' + (whRec.company || '?') + (overseasImportWarehouseIssue_(whRec) ? ', not an Overseas/3PL warehouse' : '') + ')', rec.wh);
if (!imiBlank_(c.company) && whRec && whRec.company && imbLc_(c.company.value) !== imbLc_(whRec.company)) imiRowIssue_(rec, 'company', 'COMPANY_MISMATCH', 'the row says company ' + c.company.value + ' but ' + rec.wh + ' belongs to ' + whRec.company, c.company.value);
if (!rec.sku) imiRowIssue_(rec, 'sku', 'SKU_REQUIRED', 'sku is required');
else if (!skus[rec.sku]) {
    if (!rec.issues.length) {
        skipped.unknown_sku++;
        skipped.rows.push({ row: rec.row, sku: rec.sku, code: 'SKU_NOT_FOUND' });
        return;
    }
    imiRowIssue_(rec, 'sku', 'SKU_NOT_FOUND', 'no such SKU in sku_details (never auto-created)', rec.sku);
}
(mode === 'SET' ? ADDC : SETC).forEach(function (k) { if (!imiBlank_(c[k])) imiRowIssue_(rec, k, 'MODE_COLUMN_MISMATCH', k + ' belongs to mode ' + (mode === 'SET' ? 'ADD' : 'SET') + '; this batch is ' + mode + (mode === 'ADD' ? ' (ADD changes Available only - see the Owner question on Damaged / On the Way)' : '') + ' - leave it blank', c[k].value); });
if (mode === 'ADD') {
var a = imiQty_(rec, c.add_available_qty, 'add_available_qty', !rec.rv); if (a.supplied) rec.v.add = a.value;
} else {
['available_stock', 'damaged_stock', 'on_the_way_qty'].forEach(function (k) { var q = imiQty_(rec, c[k], k, false); if (q.supplied) rec.v[k] = q.value; });
var e = c.on_the_way_eta;
if (!imiBlank_(e)) { if (e.clear) rec.v.eta = ''; else { var d = imbDate_(e.value); if (d === null) imiRowIssue_(rec, 'on_the_way_eta', 'ETA_INVALID', 'on_the_way_eta must be a real date yyyy-MM-dd, or [CLEAR]', e.value); else rec.v.eta = d; } }
if (!rec.rv && !Object.keys(rec.v).length && !rec.issues.length && imiBlank_(c.note)) imiRowIssue_(rec, 'available_stock', 'NOTHING_SUPPLIED', 'a new row must state at least one quantity (blank is not 0)');
}
var n = c.note;
rec.noteText = imiBlank_(n) || n.clear ? '' : String(n.value);
if (mode === 'SET' && !imiBlank_(n)) rec.v.note = n.clear ? '' : String(n.value);
if (rec.noteText.length > IMI_NOTE_MAX_) imiRowIssue_(rec, 'note', 'NOTE_TOO_LONG', 'note is over ' + IMI_NOTE_MAX_ + ' characters');
rec.key = rec.wh && rec.sku ? rec.wh + '||' + rec.sku : '';
if (rec.key) { if (byKey[rec.key]) { imiRowIssue_(rec, 'sku', 'DUPLICATE_KEY', 'the same warehouse_id + sku is on row ' + byKey[rec.key].row, rec.sku); imiRowIssue_(byKey[rec.key], 'sku', 'DUPLICATE_KEY', 'the same warehouse_id + sku is on row ' + rec.row, rec.sku); } else byKey[rec.key] = rec; }
if (rec.key && rd.dup[rec.key]) imiRowIssue_(rec, 'sku', 'DB_DUPLICATE_KEY', 'overseas_inventory_snapshot holds this warehouse_id + sku more than once - fix the data first', rec.sku);
if (rec.key && rd.pend && rd.pend[rec.key]) imiRowIssue_(rec, 'sku', 'PENDING_RECEIPT_POSTING', ovsReceiptPendingText_(rd.pend[rec.key]), rec.sku);   // R71-RCV-1: never stacks on a receipt not yet in stock
recs.push(rec);
});
if (!recs.length && skipped.unknown_sku) imbIssue_(issues, IMI_SHEET_, 0, 'sku', 'NO_APPLICABLE_SKUS', 'No recognized SKUs to process. Unknown SKUs were skipped; no stock will be written.');
var state = { domain: 'overseas_inventory', scope: sc.wh, keys: {}, sku_mappings: {}, skipped_unknown_skus: skipped.rows }, items = [], prev = [];
recs.forEach(function (rec) {
if (skus[rec.sku]) state.sku_mappings[rec.sku] = skus[rec.sku].masterSku;
var st = rec.key ? rd.idx[rec.key] || null : null;
if (rec.key) state.keys[rec.key] = st ? { exists: true, available: st.available, reserved: st.reserved, damaged: st.damaged, otw: st.otw, eta: st.eta, note: st.note } : { exists: false };
if (rec.rv && rec.key && rec.rv !== imiOverseasRowVersion_(rec.wh, rec.sku, st)) imiRowIssue_(rec, 'row_version', 'STALE_EXPORT', 'this snapshot row changed after the file was exported (now available ' + (st ? st.available : 'no row') + ', reserved ' + (st ? st.reserved : 0) + ') - export again', rec.rv);
var cur = st || { available: 0, reserved: 0, damaged: 0, otw: 0, eta: '', note: '' }, set = {}, input = null;
if (mode === 'ADD') {
if (rec.v.add !== undefined) { input = rec.v.add; if (rec.v.add !== 0) set.wh_available_stock = cur.available + rec.v.add; }
} else {
if (rec.v.available_stock !== undefined) {
input = rec.v.available_stock;
if (rec.v.available_stock < cur.reserved) imiRowIssue_(rec, 'available_stock', 'IMPORT_RESERVATION_EXCEEDS_SOURCE_AVAILABLE', 'source available ' + rec.v.available_stock + ' is less than the reservation this system already holds (' + cur.reserved + ') - nothing on this row can be imported', rec.v.available_stock);
else if (rec.v.available_stock - cur.reserved !== cur.available) set.wh_available_stock = rec.v.available_stock - cur.reserved;
}
if (rec.v.damaged_stock !== undefined && rec.v.damaged_stock !== cur.damaged) set.wh_damaged_stock = rec.v.damaged_stock;
if (rec.v.on_the_way_qty !== undefined && rec.v.on_the_way_qty !== cur.otw) set.wh_on_the_way_qty = rec.v.on_the_way_qty;
if (rec.v.eta !== undefined && rec.v.eta !== cur.eta) set.wh_on_the_way_eta = rec.v.eta;
if (rec.v.note !== undefined && rec.v.note !== cur.note) set.note = rec.v.note;
}
var changes = Object.keys(set), supplied = Object.keys(rec.v).length > 0;

var createWorthy = changes.some(function (f) { return f === 'note' || f === 'wh_on_the_way_eta' ? set[f] !== '' : Number(set[f]) > 0; });
// R71-RCV-1c (review REVIEW_R71_RCV_1B B1): every key this file would CREATE / UPDATE must reconcile by the CH7-2 rule (the cell equals the
// newest movement's after-available; 21_ adjBooksGate_), as the 05_ batch import's impBooksGate_ does - else an off-ledger edit is
// imported over, and a receipt not yet in stock becomes a silent shortage. 78_ re-evaluates inside the lock, so this holds at commit too.
if (!rec.issues.length && supplied && changes.length && (st || createWorthy) && rd.st && rd.mv) { var bk71_ = adjBooksGate_(true, rd.st, rd.mv, rec.wh, rec.sku); if (bk71_) imiRowIssue_(rec, 'sku', 'OVERSEAS_IMPORT_BOOKS_UNKNOWN', 'the overseas stock of this key does not equal its movement ledger (' + bk71_ + '): importing over it would hide the difference. Nothing in this file was written - remove this row (the key needs the owner\'s review) and send the file again', rec.sku); }
var status = rec.issues.length ? 'REJECT' : (!supplied ? 'NOT_SUPPLIED' : (!changes.length || (!st && !createWorthy) ? 'UNCHANGED' : (st ? 'UPDATE' : 'CREATE')));
var afterAvail = set.hasOwnProperty('wh_available_stock') ? set.wh_available_stock : cur.available;
prev.push({ row: rec.row, warehouse_id: rec.wh, sku: rec.sku, status: status, mode: mode, input: input, before: st ? { available: cur.available, reserved: cur.reserved, damaged: cur.damaged, on_the_way: cur.otw, eta: cur.eta, note: cur.note } : null,
after: status === 'CREATE' || status === 'UPDATE' ? { available: afterAvail, reserved: cur.reserved, damaged: set.hasOwnProperty('wh_damaged_stock') ? set.wh_damaged_stock : cur.damaged, on_the_way: set.hasOwnProperty('wh_on_the_way_qty') ? set.wh_on_the_way_qty : cur.otw,
eta: set.hasOwnProperty('wh_on_the_way_eta') ? set.wh_on_the_way_eta : cur.eta, note: set.hasOwnProperty('note') ? set.note : cur.note } : null,
changed_fields: status === 'CREATE' || status === 'UPDATE' ? changes : [], available_delta: status === 'CREATE' || status === 'UPDATE' ? afterAvail - cur.available : 0,
source_gross_after: status === 'CREATE' || status === 'UPDATE' ? afterAvail + cur.reserved : null, issues: rec.issues.map(function (i) { return i.code; }) });
issues = issues.concat(rec.issues);
if (status === 'CREATE' || status === 'UPDATE') items.push({ row: rec.row, warehouse_id: rec.wh, sku: rec.sku, exists: !!st, expect: { exists: !!st, available: cur.available, reserved: cur.reserved }, set: set,
available_delta: afterAvail - cur.available, note: rec.noteText });
});
var inScope = Object.keys(rd.idx).filter(function (k) { return k.split('||')[0] === sc.wh; });
var counts = imiCounts_(prev);
counts.skipped = skipped.unknown_sku;
return { issues: issues, plan: { mode: mode, items: items }, state: state,
preview: { counts: counts, rows: prev, skipped: skipped,
impacts: { overseas_inventory_snapshot: { create: counts.create, update: counts.update, reserved_changed: 0 },
overseas_inventory_movements: { append: items.filter(function (i) { return i.available_delta !== 0; }).length, movement_type: 'inventory_import', reference_type: 'overseas_inventory_import', reference_id: '<this import_batch_id>' },
total_available_delta: items.reduce(function (s, i) { return s + i.available_delta; }, 0),
snapshot: { mode: mode, semantic: mode === 'SET' ? 'GROSS: wh_available_stock = source - reserved' : 'ADD: wh_available_stock += value', cutoff: IMI_CUTOFF_NOTE_,
coverage: { warehouse_id: sc.wh, company: sc.rec.company, keys_in_file: recs.length, snapshot_rows_in_scope: inScope.length, snapshot_rows_not_in_file_unchanged: inScope.filter(function (k) { return !byKey[k]; }).length } } } } };
}
function imiOverseasApply_(ss, plan, ctx) {
var snapSheet = ss.getSheetByName('overseas_inventory_snapshot'), movSheet = ss.getSheetByName('overseas_inventory_movements');
var res = { created: 0, updated: 0, movements: 0, total_available_delta: 0, movement_ids: [] };
(plan && plan.items || []).forEach(function (p) {
var r = imiApplyTx_([snapSheet, movSheet], ctx.journal, function () { return ovsInventoryImportApplyTx_({ snapSheet: snapSheet, movSheet: movSheet, warehouseId: p.warehouse_id, sku: p.sku, expect: p.expect, set: p.set, batchId: ctx.batch_id,
journal: ctx.journal.entries, now: ctx.now, movementDate: String(ctx.now).slice(0, 10), createdBy: ctx.actor, note: 'import ' + ctx.mode + ' ' + ctx.batch_id + (p.note ? ' | ' + p.note : '') }); });
if (r.created) res.created++; else res.updated++;
if (r.movementId) { res.movements++; res.movement_ids.push(r.movementId); }
res.total_available_delta += r.afterAvailable - r.beforeAvailable;
r.changed.forEach(function (c) {
ctx.journal.change({ entity_table: 'overseas_inventory_snapshot', entity_id: r.overseasInventoryId, line_id: p.warehouse_id + '||' + p.sku, field: c.field, before: r.created ? '' : (c.before instanceof Date ? imiDay_(c.before) : c.before), after: c.after,
movement_id: c.field === 'wh_available_stock' ? r.movementId : '' });
});
});
return { result: res };
}
function imbOverseasInventoryDomain_() {
return { domain: 'overseas_inventory', schema_version: 'OVERSEAS_INVENTORY-IMPORT-1', modes: ['SET', 'ADD'], sheets: [IMI_SHEET_], maxRows: IMI_MAX_ROWS_,
fields: IMI_OVERSEAS_FIELDS_, build: IMI_BUILD_VERSION_,
template: imiOverseasTemplate_, validate: imiOverseasValidate_, apply: imiOverseasApply_ };
}
