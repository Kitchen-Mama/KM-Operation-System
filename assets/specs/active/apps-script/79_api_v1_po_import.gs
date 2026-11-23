


































var PMI_SCHEMA_VERSION_ = 'PURCHASE_ORDER-IMPORT-1';
var PMI_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-AF1';
var PMI_H_ = 'Header', PMI_L_ = 'Lines';
var PMI_SOURCE_TYPE_ = 'historical_import';
var PMI_OPENING_COLUMNS_ = ['opening_completed_qty', 'opening_shipped_qty', 'opening_lineage_qty', 'opening_reconcile_status'];
var PMI_NEW_COLUMNS_ = { purchase_orders: ['source_type', 'import_batch_id'], purchase_order_lines: ['import_batch_id'].concat(PMI_OPENING_COLUMNS_) };
var PMI_OPENING_PENDING_ = 'PENDING', PMI_OPENING_RECONCILED_ = 'RECONCILED', PMI_RECONCILE_ = 'RECONCILE_OPENING';
var PMI_PAYMENT_STATUS_ = ['unpaid', 'partial', 'paid'];
var PMI_MARK_ = 'historical_import:';





var PMI_STATUSES_ = [
{ value: 'draft', label: 'Draft', import: 'ALLOWED', qty: 'ZERO', order_date: 'FORBIDDEN', factory: 'ACTIVE', ongoing: 'NOT_SUPPLY (named ONGOING_PO_DRAFT)', fifo: false },
{ value: 'issued', label: 'Issued / Sent', import: 'ALLOWED', qty: 'ZERO', order_date: 'REQUIRED', factory: 'ACTIVE', ongoing: 'OPEN', fifo: true },
{ value: 'confirmed', label: 'Supplier Confirmed', import: 'ALLOWED', qty: 'ZERO', order_date: 'REQUIRED', factory: 'ACTIVE', ongoing: 'OPEN', fifo: true },
{ value: 'in_production', label: 'In Production', import: 'ALLOWED', qty: 'ZERO', order_date: 'REQUIRED', factory: 'ACTIVE', ongoing: 'OPEN', fifo: true },
{ value: 'ready_to_ship', label: 'Ready to Ship', import: 'ALLOWED', qty: 'ZERO', order_date: 'REQUIRED', factory: 'ACTIVE', ongoing: 'OPEN', fifo: true },
{ value: 'partial_completed', label: 'Partial Completed', import: 'ALLOWED', qty: 'PARTIAL', order_date: 'REQUIRED', factory: 'ACTIVE', ongoing: 'OPEN', fifo: false },
{ value: 'completed', label: 'Completed', import: 'ALLOWED', qty: 'FULL', order_date: 'REQUIRED', factory: 'HISTORY', ongoing: 'SHUT', fifo: true },
{ value: 'cancelled', label: 'Cancelled', import: 'ALLOWED', qty: 'ANY', order_date: 'OPTIONAL', factory: 'HISTORY', ongoing: 'SHUT', fifo: false },
{ value: 'closure', label: 'Closure', import: 'ALLOWED', qty: 'ANY', order_date: 'REQUIRED', factory: 'HISTORY', ongoing: 'SHUT', fifo: false, needs: 'closure_reason' },
{ value: 'partial_shipped', label: 'Partial Shipped', import: 'BLOCKED', blocked: 'PO_STATUS_BLOCKED_SHIPPED_LINEAGE', why: 'no server writer; shipped_qty needs executed shipment_line_allocations (32_) - import it through the Shipment import, never as a PO number' },
{ value: 'shipped', label: 'Shipped', import: 'BLOCKED', blocked: 'PO_STATUS_BLOCKED_SHIPPED_LINEAGE', why: 'no server writer; shipped_qty needs executed shipment_line_allocations (32_) - import it through the Shipment import, never as a PO number' }
];

var PMI_ALIASES_ = { 'issued/sent': 'issued', 'issued_/_sent': 'issued', 'issued_sent': 'issued', 'sent': 'issued', 'supplier_confirmed': 'confirmed',
'canceled': 'cancelled', 'closed': 'closure', 'partially_shipped': 'partial_shipped' };
var PMI_NOT_A_STATUS_ = { ongoing: 'PO_STATUS_ONGOING_NOT_A_STATUS', in_transit: 'PO_STATUS_UNKNOWN' };





var PMI_FIELDS_ = [

{ sheet: 'Header', key: 'purchase_order_id', table: 'purchase_orders', type: 'text', kind: 'key', add: 'NO', update: 'KEY', note: 'system id; ADD_NEW derives it' },
{ sheet: 'Header', key: 'row_version', table: null, type: 'text', kind: 'version', add: 'NO', update: 'VERSION', note: 'server digest of the current row' },
{ sheet: 'Header', key: 'company', table: 'purchase_orders', type: 'enum', list: 'companies', kind: 'identity', add: 'REQUIRED', update: 'READONLY', refuse: 'PO_COMPANY_CHANGE_REFUSED' },
{ sheet: 'Header', key: 'po_no', table: 'purchase_orders', type: 'text', kind: 'identity', add: 'REQUIRED', update: 'READONLY', refuse: 'PO_NO_CHANGE_REFUSED', note: '(company, po_no) is the external key; purchase_order_no mirrors it' },
{ sheet: 'Header', key: 'km_po_no', table: 'purchase_orders', type: 'text', kind: 'editable', add: 'OPTIONAL', update: 'DRAFT', clear: true },
{ sheet: 'Header', key: 'order_status', table: 'purchase_orders', type: 'enum', list: 'order_status', kind: 'state', add: 'REQUIRED', update: 'READONLY', refuse: 'PO_STATUS_CHANGE_NOT_IMPORTABLE', note: 'never the retired `status` column; changes go through Send PO / Receive / Cancel' },
{ sheet: 'Header', key: 'warehouse_id', table: 'purchase_orders', type: 'enum', list: 'factories', kind: 'identity', add: 'REQUIRED', update: 'DRAFT', refuse: 'PO_FACTORY_CHANGE_REFUSED', note: 'factory_id mirrors it' },
{ sheet: 'Header', key: 'supplier_id', table: 'purchase_orders', type: 'enum', list: 'suppliers', kind: 'snapshot', add: 'OPTIONAL', update: 'READONLY' },
{ sheet: 'Header', key: 'supplier_name', table: 'purchase_orders', type: 'text', kind: 'snapshot', add: 'OPTIONAL', update: 'READONLY', note: 'derived from supplier_id when the supplier authority knows it' },
{ sheet: 'Header', key: 'currency', table: 'purchase_orders', type: 'enum', list: 'currencies', kind: 'snapshot', add: 'REQUIRED', update: 'READONLY' },
{ sheet: 'Header', key: 'order_date', table: 'purchase_orders', type: 'date', kind: 'state', add: 'COND', rule: 'by status: REQUIRED / FORBIDDEN (draft) / OPTIONAL (cancelled)', update: 'READONLY' },
{ sheet: 'Header', key: 'deposit_due_date', table: 'purchase_orders', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'LIVE', clear: true },
{ sheet: 'Header', key: 'inspection_date', table: 'purchase_orders', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'LIVE', clear: true },
{ sheet: 'Header', key: 'expected_completion_date', table: 'purchase_orders', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'LIVE', clear: true },
{ sheet: 'Header', key: 'expected_ship_date', table: 'purchase_orders', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'LIVE', clear: true },

{ sheet: 'Header', key: 'supplier_expected_ready_date', table: 'purchase_orders', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'DRAFT', refuse: 'PO_SUPPLIER_DATE_BY_TRANSITION_ONLY', clear: true },
{ sheet: 'Header', key: 'supplier_confirmed_ready_date', table: 'purchase_orders', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'DRAFT', refuse: 'PO_SUPPLIER_DATE_BY_TRANSITION_ONLY', clear: true },
{ sheet: 'Header', key: 'deposit_amount', table: 'purchase_orders', type: 'money', kind: 'editable', add: 'OPTIONAL', update: 'ANY', clear: true },
{ sheet: 'Header', key: 'balance_amount', table: 'purchase_orders', type: 'money', kind: 'editable', add: 'OPTIONAL', update: 'ANY', clear: true },
{ sheet: 'Header', key: 'paid_amount', table: 'purchase_orders', type: 'money', kind: 'editable', add: 'OPTIONAL', update: 'ANY', clear: true },
{ sheet: 'Header', key: 'payment_status', table: 'purchase_orders', type: 'enum', list: 'payment_status', kind: 'editable', add: 'OPTIONAL', update: 'ANY', clear: true },
{ sheet: 'Header', key: 'payment_term_id', table: 'purchase_orders', type: 'text', list: 'payment_terms', kind: 'editable', add: 'OPTIONAL', update: 'READONLY', note: 'NO payment_terms master exists: a typed value is NOT written as an id (named PAYMENT_TERM_UNVERIFIED_NOT_WRITTEN) until one does' },
{ sheet: 'Header', key: 'note', table: 'purchase_orders', type: 'text', kind: 'editable', add: 'OPTIONAL', update: 'ANY', clear: true },
{ sheet: 'Header', key: 'closure_reason', table: 'purchase_orders', type: 'text', kind: 'state', add: 'COND', rule: 'REQUIRED for closure, refused otherwise', update: 'READONLY' },
{ sheet: 'Header', key: 'total_sku', table: 'purchase_orders', type: 'int', kind: 'derived', add: 'NO', update: 'READONLY' },
{ sheet: 'Header', key: 'total_qty', table: 'purchase_orders', type: 'int', kind: 'derived', add: 'NO', update: 'READONLY' },
{ sheet: 'Header', key: 'total_cartons', table: 'purchase_orders', type: 'int', kind: 'derived', add: 'NO', update: 'READONLY' },
{ sheet: 'Header', key: 'total_amount', table: 'purchase_orders', type: 'money', kind: 'derived', add: 'NO', update: 'READONLY' },
{ sheet: 'Header', key: 'request_order_id', table: 'purchase_orders', type: 'text', kind: 'lineage', add: 'NO', update: 'READONLY', refuse: 'PO_LINEAGE_NOT_IMPORTABLE' },
{ sheet: 'Header', key: 'source_type', table: 'purchase_orders', type: 'text', kind: 'system', add: 'NO', update: 'READONLY', optionalColumn: true },

{ sheet: 'Lines', key: 'purchase_order_line_id', table: 'purchase_order_lines', type: 'text', kind: 'key', add: 'NO', update: 'KEY', note: 'system id; ADD_NEW derives it' },
{ sheet: 'Lines', key: 'purchase_order_id', table: 'purchase_order_lines', type: 'text', kind: 'link', add: 'NO', update: 'LINK', refuse: 'PO_LINE_PARENT_MISMATCH' },
{ sheet: 'Lines', key: 'row_version', table: null, type: 'text', kind: 'version', add: 'NO', update: 'VERSION' },
{ sheet: 'Lines', key: 'company', table: 'purchase_order_lines', type: 'enum', list: 'companies', kind: 'link', add: 'REQUIRED', update: 'READONLY', refuse: 'PO_COMPANY_CHANGE_REFUSED', note: 'with po_no, links the line to its Header row; a PO line is single-company' },
{ sheet: 'Lines', key: 'po_no', table: null, type: 'text', kind: 'link', add: 'REQUIRED', update: 'READONLY', refuse: 'PO_NO_CHANGE_REFUSED', note: 'the Header link (not a line column)' },
{ sheet: 'Lines', key: 'sku', table: 'purchase_order_lines', type: 'enum', list: 'skus', kind: 'identity', add: 'REQUIRED', update: 'READONLY', refuse: 'PO_SKU_CHANGE_REFUSED' },
{ sheet: 'Lines', key: 'series', table: 'purchase_order_lines', type: 'text', kind: 'derived', add: 'VALIDATE', update: 'READONLY', note: 'from sku_details' },
{ sheet: 'Lines', key: 'units_per_carton', table: 'purchase_order_lines', type: 'int', kind: 'derived', add: 'VALIDATE', update: 'READONLY', note: 'from sku_details' },
{ sheet: 'Lines', key: 'supplier_warehouse_id', table: 'purchase_order_lines', type: 'enum', list: 'factories', kind: 'identity', add: 'OPTIONAL', update: 'DRAFT', refuse: 'PO_FACTORY_CHANGE_REFUSED', note: 'blank = the Header warehouse_id (the 13_ create rule)' },
{ sheet: 'Lines', key: 'supplier_sku', table: 'purchase_order_lines', type: 'text', kind: 'snapshot', add: 'OPTIONAL', update: 'READONLY' },
{ sheet: 'Lines', key: 'factory_item_no', table: 'purchase_order_lines', type: 'text', kind: 'snapshot', add: 'OPTIONAL', update: 'READONLY' },
{ sheet: 'Lines', key: 'factory_item_name', table: 'purchase_order_lines', type: 'text', kind: 'snapshot', add: 'OPTIONAL', update: 'READONLY' },
{ sheet: 'Lines', key: 'ordered_qty', table: 'purchase_order_lines', type: 'int', kind: 'editable', add: 'REQUIRED', update: 'DRAFT' },
{ sheet: 'Lines', key: 'completed_qty', table: 'purchase_order_lines', type: 'int', kind: 'counter', add: 'REQUIRED', update: 'READONLY', refuse: 'PO_COUNTER_NOT_IMPORTABLE', note: 'the receipt counter (only 13_ Receive writes it live); ADD_NEW records the historical total, posting no stock' },
{ sheet: 'Lines', key: 'shipped_qty', table: 'purchase_order_lines', type: 'int', kind: 'counter', add: 'NO', update: 'READONLY', refuse: 'PO_COUNTER_NOT_IMPORTABLE', note: 'only 32_ dispatch writes it (= executed allocations)' },
{ sheet: 'Lines', key: 'opening_shipped_qty', table: 'purchase_order_lines', type: 'int', kind: 'opening', add: 'OPTIONAL', update: 'READONLY', refuse: 'PO_OPENING_NOT_UPDATABLE', exportIfColumn: true, note: 'of completed_qty, the units already shipped before the as-of day (blank = not known: the received units stay held out of shipment FIFO); a declaration to be proven by the Shipment import, never a shipped_qty' },
{ sheet: 'Lines', key: 'opening_completed_qty', table: 'purchase_order_lines', type: 'int', kind: 'opening', add: 'NO', update: 'READONLY', refuse: 'PO_OPENING_NOT_UPDATABLE', exportIfColumn: true, note: 'the received units at the cut-off (system)' },
{ sheet: 'Lines', key: 'opening_lineage_qty', table: 'purchase_order_lines', type: 'int', kind: 'opening', add: 'NO', update: 'READONLY', refuse: 'PO_OPENING_NOT_UPDATABLE', exportIfColumn: true, note: 'the historical shipment lineage proven by the Shipment import (system)' },
{ sheet: 'Lines', key: 'opening_reconcile_status', table: 'purchase_order_lines', type: 'text', kind: 'opening', add: 'NO', update: 'READONLY', refuse: 'PO_OPENING_NOT_UPDATABLE', exportIfColumn: true, note: 'PENDING (held out of shipment FIFO) | RECONCILED (system)' },
{ sheet: 'Lines', key: 'remaining_qty', table: 'purchase_order_lines', type: 'int', kind: 'derived', add: 'NO', update: 'READONLY', refuse: 'PO_COUNTER_NOT_IMPORTABLE', note: 'available-to-ship = completed - shipped' },
{ sheet: 'Lines', key: 'carton_qty', table: 'purchase_order_lines', type: 'int', kind: 'derived', add: 'NO', update: 'READONLY' },
{ sheet: 'Lines', key: 'unit_cost', table: 'purchase_order_lines', type: 'money', kind: 'editable', add: 'OPTIONAL', update: 'DRAFT' },
{ sheet: 'Lines', key: 'line_amount', table: 'purchase_order_lines', type: 'money', kind: 'derived', add: 'NO', update: 'READONLY' },
{ sheet: 'Lines', key: 'currency', table: 'purchase_order_lines', type: 'enum', list: 'currencies', kind: 'snapshot', add: 'OPTIONAL', update: 'READONLY', note: 'must equal the Header currency' },

{ sheet: 'Lines', key: 'inspection_date', table: 'purchase_order_lines', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'DRAFT', refuse: 'PO_LINE_EDIT_DRAFT_ONLY', clear: true },
{ sheet: 'Lines', key: 'expected_completion_date', table: 'purchase_order_lines', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'DRAFT', refuse: 'PO_LINE_EDIT_DRAFT_ONLY', clear: true, note: 'the Ongoing ETA' },
{ sheet: 'Lines', key: 'expected_ship_date', table: 'purchase_order_lines', type: 'date', kind: 'editable', add: 'OPTIONAL', update: 'DRAFT', refuse: 'PO_LINE_EDIT_DRAFT_ONLY', clear: true },
{ sheet: 'Lines', key: 'note', table: 'purchase_order_lines', type: 'text', kind: 'editable', add: 'OPTIONAL', update: 'DRAFT', refuse: 'PO_LINE_EDIT_DRAFT_ONLY', clear: true },
{ sheet: 'Lines', key: 'request_order_line_id', table: 'purchase_order_lines', type: 'text', kind: 'lineage', add: 'NO', update: 'READONLY', refuse: 'PO_LINEAGE_NOT_IMPORTABLE' }
];

var PMI_NAMED_REFUSALS_ = { status: 'PO_RETIRED_COLUMN', expected_ready_date: 'PO_RETIRED_COLUMN', confirmed_ready_date: 'PO_RETIRED_COLUMN', product_name: 'PO_RETIRED_COLUMN',
related_shipment_id: 'PO_RETIRED_COLUMN', request_order_id: 'PO_LINEAGE_NOT_IMPORTABLE', request_order_line_id: 'PO_LINEAGE_NOT_IMPORTABLE', request_bucket: 'PO_LINEAGE_NOT_IMPORTABLE',
requested_qty: 'PO_LINEAGE_NOT_IMPORTABLE', approved_qty: 'PO_LINEAGE_NOT_IMPORTABLE', recommended_qty: 'PO_LINEAGE_NOT_IMPORTABLE', km_qty: 'PO_DERIVED_NOT_IMPORTABLE',
resus_qty: 'PO_DERIVED_NOT_IMPORTABLE', restw_qty: 'PO_DERIVED_NOT_IMPORTABLE', remaining_qty: 'PO_COUNTER_NOT_IMPORTABLE', factory_id: 'PO_DERIVED_NOT_IMPORTABLE',
purchase_order_no: 'PO_DERIVED_NOT_IMPORTABLE', po_version: 'PO_DERIVED_NOT_IMPORTABLE', parent_purchase_order_id: 'PO_DERIVED_NOT_IMPORTABLE', subtotal_amount: 'PO_DERIVED_NOT_IMPORTABLE',
total_sku: 'PO_DERIVED_NOT_IMPORTABLE', total_qty: 'PO_DERIVED_NOT_IMPORTABLE', total_cartons: 'PO_DERIVED_NOT_IMPORTABLE', total_amount: 'PO_DERIVED_NOT_IMPORTABLE',
carton_qty: 'PO_DERIVED_NOT_IMPORTABLE', line_amount: 'PO_DERIVED_NOT_IMPORTABLE', line_status: 'PO_DERIVED_NOT_IMPORTABLE', created_by: 'PO_SYSTEM_COLUMN', created_at: 'PO_SYSTEM_COLUMN',
updated_by: 'PO_SYSTEM_COLUMN', updated_at: 'PO_SYSTEM_COLUMN', issued_by: 'PO_SYSTEM_COLUMN', issued_at: 'PO_SYSTEM_COLUMN', confirmed_by: 'PO_SYSTEM_COLUMN', confirmed_at: 'PO_SYSTEM_COLUMN',
cancelled_by: 'PO_SYSTEM_COLUMN', cancelled_at: 'PO_SYSTEM_COLUMN', completed_by: 'PO_SYSTEM_COLUMN', completed_at: 'PO_SYSTEM_COLUMN', closed_by: 'PO_SYSTEM_COLUMN', closed_at: 'PO_SYSTEM_COLUMN',
import_batch_id: 'PO_SYSTEM_COLUMN', source_type: 'PO_SYSTEM_COLUMN', purchase_order_id: 'PO_ID_NOT_IN_ADD_NEW', purchase_order_line_id: 'PO_ID_NOT_IN_ADD_NEW', row_version: 'PO_ID_NOT_IN_ADD_NEW',
opening_completed_qty: 'PO_SYSTEM_COLUMN', opening_lineage_qty: 'PO_SYSTEM_COLUMN', opening_reconcile_status: 'PO_SYSTEM_COLUMN' };


function pmiS_(v) { return v === null || v === undefined ? '' : (v instanceof Date ? pmiDay_(v) : String(v).trim()); }
function pmiDay_(v) {
if (v === '' || v === null || v === undefined) return '';
if (v instanceof Date) return isNaN(v.getTime()) ? '' : Utilities.formatDate(v, Session.getScriptTimeZone ? Session.getScriptTimeZone() : 'Asia/Taipei', 'yyyy-MM-dd');
var s = String(v).trim(), m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? m[1] + '-' + m[2] + '-' + m[3] : s;
}
function pmiField_(sheet, key) { for (var i = 0; i < PMI_FIELDS_.length; i++) if (PMI_FIELDS_[i].sheet === sheet && PMI_FIELDS_[i].key === key) return PMI_FIELDS_[i]; return null; }
function pmiFields_(sheet, mode) { return PMI_FIELDS_.filter(function (f) { return f.sheet === sheet && (mode === 'UPDATE' ? true : f.add !== 'NO'); }); }
function pmiStatusDef_(v) { for (var i = 0; i < PMI_STATUSES_.length; i++) if (PMI_STATUSES_[i].value === v) return PMI_STATUSES_[i]; return null; }

function pmiStatus_(raw) {
var t = pmiS_(raw).toLowerCase().replace(/[\s-]+/g, '_');
if (!t) return { code: 'PO_STATUS_REQUIRED' };
if (PMI_NOT_A_STATUS_[t]) return { code: PMI_NOT_A_STATUS_[t] };
var v = PMI_ALIASES_[t] || t, d = pmiStatusDef_(v);
if (!d) return { code: 'PO_STATUS_UNKNOWN' };
if (d.import === 'BLOCKED') return { code: d.blocked, why: d.why, value: v };
return { value: v, alias: pmiS_(raw) !== v ? pmiS_(raw) : '' };
}

function pmiDigAdd_(a, b) { var r = '', c = 0, i = a.length - 1, j = b.length - 1; while (i >= 0 || j >= 0 || c) { var s = (i >= 0 ? +a[i--] : 0) + (j >= 0 ? +b[j--] : 0) + c; r = (s % 10) + r; c = s >= 10 ? 1 : 0; } return r.replace(/^0+(?=\d)/, '') || '0'; }
function pmiDigMul_(a, b) {
var r = []; for (var k = 0; k < a.length + b.length; k++) r.push(0);
for (var i = a.length - 1; i >= 0; i--) for (var j = b.length - 1; j >= 0; j--) { var p = (+a[i]) * (+b[j]) + r[i + j + 1]; r[i + j + 1] = p % 10; r[i + j] += Math.floor(p / 10); }
return r.join('').replace(/^0+(?=\d)/, '') || '0';
}
function pmiScaled_(money, scale) { var m = /^(\d+)(?:\.(\d+))?$/.exec(String(money)); if (!m) return null; var f = (m[2] || ''); while (f.length < scale) f += '0'; return (m[1] + f.slice(0, scale)).replace(/^0+(?=\d)/, '') || '0'; }

function pmiUnscale_(dig, scale, out) {
var d = dig; while (d.length <= scale) d = '0' + d;
if (out < scale) { var keep = d.slice(0, d.length - (scale - out)), drop = d.slice(d.length - (scale - out)); if (+drop[0] >= 5) keep = pmiDigAdd_(keep, '1'); d = keep; scale = out; while (d.length <= scale) d = '0' + d; }
var ip = d.slice(0, d.length - scale).replace(/^0+(?=\d)/, ''), fp = d.slice(d.length - scale).replace(/0+$/, '');
return fp ? ip + '.' + fp : ip;
}
function pmiCanonMoney_(v) {
if (v === '' || v === null || v === undefined) return '';
var s = typeof v === 'number' ? (isFinite(v) ? String(v) : '') : imbMoney_(v);
if (s === null || s === '' || /e/i.test(s)) return null;
var neg = s.charAt(0) === '-'; if (neg) s = s.slice(1);
var m = /^(\d+)(?:\.(\d+))?$/.exec(s); if (!m) return null;
var ip = m[1].replace(/^0+(?=\d)/, ''), fp = (m[2] || '').replace(/0+$/, '');
var out = fp ? ip + '.' + fp : ip; return neg && out !== '0' ? '-' + out : out;
}
function pmiDecimals_(canon) { var i = canon.indexOf('.'); return i < 0 ? 0 : canon.length - i - 1; }
function pmiCurrencyDecimals_(cur) { return typeof PRICING_FX_DECIMALS_ !== 'undefined' && Object.prototype.hasOwnProperty.call(PRICING_FX_DECIMALS_, cur) ? PRICING_FX_DECIMALS_[cur] : null; }
function pmiCurrencies_() { return typeof PRICING_FX_DECIMALS_ !== 'undefined' ? Object.keys(PRICING_FX_DECIMALS_) : []; }
function pmiCompanies_() { return typeof RO_COMPANIES_ !== 'undefined' ? RO_COMPANIES_.slice() : []; }


function pmiTable_(ss, name) {
var sh = ss.getSheetByName(name); if (!sh) return null;
var d = sh.getDataRange().getValues(), h = (d[0] || []).map(function (x) { return String(x).trim(); }), rows = [];
for (var i = 1; i < d.length; i++) { var o = { __r: i + 1 }, any = false; for (var c = 0; c < h.length; c++) { if (h[c]) { o[h[c]] = d[i][c]; if (d[i][c] !== '' && d[i][c] !== null) any = true; } } if (any) rows.push(o); }
return { name: name, sheet: sh, headers: h, rows: rows, col: function (k) { return h.indexOf(k); } };
}
function pmiDigest_(row, headers) { return imbDigestOf_(row, headers.filter(function (k) { return !!k; })); }

function pmiMasters_(ss, issues, inventoryIdentities) {
var T = { po: pmiTable_(ss, 'purchase_orders'), pol: pmiTable_(ss, 'purchase_order_lines'), wh: pmiTable_(ss, 'warehouses'), sku: pmiTable_(ss, 'sku_details'),
msk: pmiTable_(ss, 'marketplace_skus'), sup: pmiTable_(ss, 'supplier_price_list') };
['po', 'pol', 'wh', 'sku', 'msk'].forEach(function (k) { if (!T[k]) imbIssue_(issues, '', 0, '', 'PO_MASTER_UNREADABLE', 'the ' + { po: 'purchase_orders', pol: 'purchase_order_lines', wh: 'warehouses', sku: 'sku_details', msk: 'marketplace_skus' }[k] + ' sheet cannot be read - nothing can be checked against it'); });
if (issues.length) return null;
if (inventoryIdentities) T.sku.rows = skuInventoryReadRows_(ss, T.sku.rows);
var M = { ss: ss, T: T, fmap: procurementFactoryMap_(ss), whName: {}, sku: {}, skuLc: {}, sup: null, registered: {} };
T.wh.rows.forEach(function (r) { var id = pmiS_(r.warehouse_id); if (id) M.whName[id.toLowerCase()] = pmiS_(r.warehouse_name); });
T.sku.rows.forEach(function (r) { var s = pmiS_(r.sku); if (!s) return; var e = { sku: s, series: pmiS_(r.series), upc: parseFloat(r.units_per_carton) || 0, name: pmiS_(r.product_name), status: pmiS_(r.product_status || r.status), dup: !!M.sku[s] };
if (M.sku[s]) M.sku[s].dup = true; else M.sku[s] = e; (M.skuLc[s.toLowerCase()] = M.skuLc[s.toLowerCase()] || []).push(s); });
T.msk.rows.forEach(function (r) { var c = pmiS_(r.company); if (c) M.registered[c] = 1; });
if (T.sup && T.sup.col('supplier_id') >= 0) {
M.sup = {};
T.sup.rows.forEach(function (r) { var id = pmiS_(r.supplier_id); if (!id) return; var on = !/^(false|no|n|0|inactive)$/i.test(pmiS_(r.is_active)); var e = M.sup[id];
if (!e) M.sup[id] = { id: id, name: pmiS_(r.supplier_name), active: on, names: [pmiS_(r.supplier_name)] }; else { e.active = e.active || on; if (e.names.indexOf(pmiS_(r.supplier_name)) < 0) e.names.push(pmiS_(r.supplier_name)); } });
}
return M;
}
function pmiLists_(M) {
var co = pmiCompanies_().map(function (c) { return { value: c, label: c, status: M.registered[c] ? 'active' : 'not_registered_in_marketplace_skus' }; });
var fac = M.T.wh.rows.filter(function (r) { var x = M.fmap[pmiS_(r.warehouse_id).toLowerCase()]; return x && x.isFactory && !x.dup; })
.map(function (r) { var x = M.fmap[pmiS_(r.warehouse_id).toLowerCase()]; return { value: x.warehouseId, label: pmiS_(r.warehouse_name) || x.warehouseId, status: x.isActive ? 'active' : 'inactive_history_only' }; });
var skus = Object.keys(M.sku).sort().map(function (s) { var e = M.sku[s]; return { value: s, label: e.name || e.series || s, status: e.dup ? 'ambiguous_duplicate' : (e.status || 'active') }; });
var sup = M.sup ? Object.keys(M.sup).sort().map(function (k) { var e = M.sup[k]; return { value: e.id, label: e.names.length > 1 ? e.names.join(' / ') : e.name, status: e.active ? 'active' : 'inactive_history_only' }; }) : [];
return { companies: co, factories: fac, skus: skus, suppliers: sup, currencies: pmiCurrencies_().map(function (c) { return { value: c, label: c + ' (' + pmiCurrencyDecimals_(c) + ' decimals)', status: 'active' }; }),
payment_status: PMI_PAYMENT_STATUS_.map(function (p) { return { value: p, label: p, status: 'active' }; }), payment_terms: [],
order_status: PMI_STATUSES_.map(function (s) { return { value: s.value, label: s.label, status: s.import === 'ALLOWED' ? 'allowed' : 'blocked:' + s.blocked }; }) };
}







function pmiOpeningNum_(v) { var n = parseFloat(v); return isFinite(n) ? n : 0; }
function pmiOpeningDecide_(ss, polRows, cands) {
var res = { status: {}, reason: {}, cover: {} }, byKey = {}, inBatch = {};
cands.forEach(function (c) {
inBatch[c.id] = 1; res.status[c.id] = PMI_OPENING_PENDING_;
if (c.od === '' || c.od === null || c.od === undefined) res.reason[c.id] = 'OPENING_DECLARATION_MISSING';
else if (c.lineage < c.od) res.reason[c.id] = 'OPENING_LINEAGE_SHORT';
else if (c.lineage > c.od) res.reason[c.id] = 'OPENING_LINEAGE_OVER';
else if (!pmiS_(c.wh)) res.reason[c.id] = 'OPENING_WAREHOUSE_UNRESOLVED';
else { var k = pmiS_(c.wh) + '|' + pmiS_(c.sku); (byKey[k] = byKey[k] || []).push(c); }
});
var keys = Object.keys(byKey).sort(); if (!keys.length) return res;
var st = pmiTable_(ss, 'factory_stock'), stock = {};
if (st) { var cCur = st.col('fac_current_stock') >= 0 ? 'fac_current_stock' : 'current_stock'; st.rows.forEach(function (r) { var k = pmiS_(r.warehouse_id) + '|' + pmiS_(r.sku); if (byKey[k]) (stock[k] = stock[k] || []).push(pmiOpeningNum_(r[cCur])); }); }
keys.forEach(function (k) {
var claimed = 0;
byKey[k].forEach(function (c) { claimed += Math.max(0, c.completed - c.shipped); });
(polRows || []).forEach(function (l) {
if (inBatch[pmiS_(l.purchase_order_line_id)] || pmiS_(l.supplier_warehouse_id) + '|' + pmiS_(l.sku) !== k) return;
if (pmiS_(l.opening_reconcile_status).toUpperCase() === PMI_OPENING_RECONCILED_) claimed += Math.max(0, pmiOpeningNum_(l.completed_qty) - pmiOpeningNum_(l.shipped_qty));
});
var rows = stock[k] || [], amb = rows.length > 1, s = rows.length === 1 ? rows[0] : 0, ok = !!st && !amb && claimed <= s;
res.cover[k] = { claimed_at_factory: claimed, factory_stock: !st ? 'UNREADABLE' : amb ? 'AMBIGUOUS' : s, covered: ok };
byKey[k].forEach(function (c) { if (ok) res.status[c.id] = PMI_OPENING_RECONCILED_; else res.reason[c.id] = !st ? 'OPENING_STOCK_UNREADABLE' : amb ? 'OPENING_STOCK_AMBIGUOUS' : 'OPENING_STOCK_NOT_COVERED'; });
});
return res;
}
var PMI_OPENING_REASON_TEXT_ = {
OPENING_DECLARATION_MISSING: 'how many of the received units already shipped is not declared (opening_shipped_qty)',
OPENING_LINEAGE_SHORT: 'the Shipment import has proven less than the declared shipped units - import the remaining historical shipments of this PO line',
OPENING_LINEAGE_OVER: 'the proven shipment lineage is more than the declaration',
OPENING_WAREHOUSE_UNRESOLVED: 'the line has no receiving factory warehouse',
OPENING_STOCK_NOT_COVERED: 'the factory stock does not cover what the reconciled lines say is still at the factory - import or correct the factory stock first',
OPENING_STOCK_AMBIGUOUS: 'factory_stock holds this warehouse + sku more than once',
OPENING_STOCK_UNREADABLE: 'the factory_stock sheet cannot be read'
};


var PMI_SCOPE_KEYS_ =['company', 'warehouse_id', 'order_status', 'order_date_from', 'order_date_to', 'purchase_order_ids', 'as_of_date'];

function pmiPaymentTermWarning_(sheet, row) {
return { sheet: sheet, row: row, code: 'PAYMENT_TERM_UNVERIFIED_NOT_WRITTEN', message: 'payment_term_id was NOT written: no payment_terms master exists to verify it - keep the terms in note until one does' };
}
function pmiScope_(scope) {
scope = scope || {}; var bad = Object.keys(scope).filter(function (k) { return PMI_SCOPE_KEYS_.indexOf(k) < 0; });
var st = scope.order_status ? [].concat(scope.order_status).map(function (s) { return pmiS_(s).toLowerCase(); }) : null;
var ids = scope.purchase_order_ids ? [].concat(scope.purchase_order_ids).map(pmiS_) : null;
return { bad: bad, company: pmiS_(scope.company), wh: pmiS_(scope.warehouse_id).toLowerCase(), st: st, from: pmiS_(scope.order_date_from), to: pmiS_(scope.order_date_to), ids: ids, asOf: pmiS_(scope.as_of_date) };
}
function pmiInScope_(po, sc) {
var st = pmiS_(po.order_status || po.status).toLowerCase(), day = pmiDay_(po.order_date);
if (sc.company && pmiS_(po.company) !== sc.company) return false;
if (sc.wh && pmiS_(po.warehouse_id).toLowerCase() !== sc.wh) return false;
if (sc.st && sc.st.indexOf(st) < 0) return false;
if (sc.from && (!day || day < sc.from)) return false;
if (sc.to && (!day || day > sc.to)) return false;
if (sc.ids && sc.ids.indexOf(pmiS_(po.purchase_order_id)) < 0) return false;
return true;
}
function pmiScopeLabel_(sc) {
var p = []; if (sc.company) p.push('company=' + sc.company); if (sc.wh) p.push('factory=' + sc.wh); if (sc.st) p.push('status=' + sc.st.join('|'));
if (sc.from || sc.to) p.push('order_date ' + (sc.from || '...') + '..' + (sc.to || '...')); if (sc.ids) p.push(sc.ids.length + ' named PO(s)');
return p.length ? p.join('; ') : 'ALL purchase orders (no filter)';
}


function pmiOut_(f, v) {
if (f.type === 'date') return pmiDay_(v);
if (f.type === 'money') { var c = pmiCanonMoney_(v); return c === null ? pmiS_(v) : c; }
if (f.type === 'int') { if (v === '' || v === null || v === undefined) return ''; var n = Number(v); return isFinite(n) ? n : pmiS_(v); }
return pmiS_(v);
}

function pmiCur_(f, v) { var o = pmiOut_(f, v); return typeof o === 'number' ? String(o) : o; }

function pmiParse_(f, raw, ctx) {
var s = typeof raw === 'number' ? String(raw) : pmiS_(raw);
if (f.type === 'date') { var d = imbDate_(raw); return d ? { ok: true, value: d, cmp: d } : { ok: false, code: 'PO_DATE_INVALID', message: f.key + ' must be a real day yyyy-MM-dd' }; }
if (f.type === 'int') { var n = typeof raw === 'number' ? (Math.floor(raw) === raw ? raw : null) : imbInt_(s); return n === null || n < 0 ? { ok: false, code: 'PO_QTY_INVALID', message: f.key + ' must be a whole number >= 0' } : { ok: true, value: n, cmp: String(n) }; }
if (f.type === 'money') {
var c = pmiCanonMoney_(raw);
if (c === null) return { ok: false, code: 'PO_AMOUNT_INVALID', message: f.key + ': a decimal amount with at most 4 decimals' };
if (c.charAt(0) === '-') return { ok: false, code: 'PO_AMOUNT_NEGATIVE', message: f.key + ' cannot be negative' };
var dec = f.key === 'unit_cost' ? 4 : (ctx && ctx.currency ? pmiCurrencyDecimals_(ctx.currency) : 4);
if (dec !== null && pmiDecimals_(c) > dec) return { ok: false, code: 'PO_AMOUNT_DECIMALS', message: f.key + ' ' + c + ' has more decimals than ' + (f.key === 'unit_cost' ? 'a unit cost (4)' : (ctx.currency + ' (' + dec + ')')) };
return { ok: true, value: Number(c), cmp: c };
}
if (f.type === 'enum' && f.list === 'payment_status') { var p = s.toLowerCase(); return PMI_PAYMENT_STATUS_.indexOf(p) < 0 ? { ok: false, code: 'PO_PAYMENT_STATUS_UNKNOWN', message: 'payment_status: ' + PMI_PAYMENT_STATUS_.join(' / ') } : { ok: true, value: p, cmp: p }; }
if (f.type === 'enum' && f.list === 'currencies') { var u = s.toUpperCase(); return pmiCurrencyDecimals_(u) === null ? { ok: false, code: 'PO_CURRENCY_UNKNOWN', message: 'currency: one of ' + pmiCurrencies_().join(' / ') } : { ok: true, value: u, cmp: u }; }
if (s.length > 500) return { ok: false, code: 'PO_TEXT_TOO_LONG', message: f.key + ': at most 500 characters' };
return { ok: true, value: s, cmp: s };
}
function pmiCompany_(raw) {
var s = pmiS_(raw), all = pmiCompanies_();
if (!s) return { code: 'PO_REQUIRED' };
if (all.indexOf(s) >= 0) return { value: s };
var ci = all.filter(function (c) { return c.toLowerCase() === s.toLowerCase(); });
return { code: ci.length ? 'PO_COMPANY_SPELLING' : 'PO_COMPANY_UNKNOWN', expected: ci[0] || all.join(' / ') };
}
function pmiFactory_(M, raw, def) {
var r = procurementResolveWarehouseIn_(M.fmap, raw, '', def && def.factory === 'ACTIVE' ? 'new' : 'history');
return r.ok ? r : { ok: false, code: 'PO_FACTORY_' + r.reason, value: r.value || pmiS_(raw) };
}
function pmiColumnsCheck_(issues, req, mode) {
[PMI_H_, PMI_L_].forEach(function (sn) {
var seen = {};
(req.sheets[sn] || []).forEach(function (r) {
Object.keys(r).forEach(function (k) {
if (k === '__row' || seen[k]) return; seen[k] = 1;
var f = pmiField_(sn, k);
if (f && (mode === 'UPDATE' || f.add !== 'NO')) return;
if (mode === 'ADD_NEW' && k === 'shipped_qty' && sn === PMI_L_) return;
if (f && f.optionalColumn) return;
imbIssue_(issues, sn, r.__row, k, PMI_NAMED_REFUSALS_[k] || 'PO_COLUMN_NOT_ACCEPTED', k + ' is not accepted in a ' + mode + ' file' + (PMI_NAMED_REFUSALS_[k] ? ' (' + PMI_NAMED_REFUSALS_[k] + ')' : ''));
});
});
});
}




function pmiColumns_(sheet, mode, M) {
var T0 = M && M.T ? (sheet === PMI_H_ ? M.T.po : M.T.pol) : null, hdrCols = T0 ? T0.headers : [];
return pmiFields_(sheet, mode).filter(function (f) { return !((f.optionalColumn || f.exportIfColumn) && hdrCols.indexOf(f.key) < 0); }).map(function (f) {
var editable = mode === 'ADD_NEW' ? f.add !== 'VALIDATE' : ['ANY', 'LIVE', 'DRAFT'].indexOf(f.update) >= 0;
return { key: f.key, header: f.key, kind: f.kind, type: f.type, required: mode === 'ADD_NEW' ? (f.add === 'REQUIRED' ? true : f.add === 'COND' ? f.rule : false) : (f.update === 'KEY' || f.update === 'VERSION'),
list: f.list || null, editable: editable, update_policy: mode === 'UPDATE' ? f.update : null, clearable: !!f.clear, hidden: f.key === 'row_version',
comment: (f.table ? f.table + '.' + f.key : 'file link') + (f.note ? ' - ' + f.note : '') + (mode === 'UPDATE' && !editable ? ' (read-only here)' : '') };
});
}
function pmiTemplate_(ss, o) {
o = o || {}; var mode = o.mode, issues = [], M = pmiMasters_(ss, issues);
if (!M) { var e = new Error(issues.map(function (i) { return i.message; }).join('; ')); e.importCode = 'PO_MASTER_UNREADABLE'; throw e; }
var sc = pmiScope_(o.scope);
if (sc.bad.length) { var e2 = new Error('unknown scope key(s): ' + sc.bad.join(', ') + ' - allowed: ' + PMI_SCOPE_KEYS_.join(', ')); e2.importCode = 'PO_SCOPE_INVALID'; throw e2; }
if (mode === PMI_RECONCILE_) return pmiReconcileTemplate_(M, sc, !!o.include_data);
var hRows = [], lRows = [];
if (mode === 'UPDATE' && o.include_data) {
var hFields = pmiColumns_(PMI_H_, 'UPDATE', M), lFields = pmiColumns_(PMI_L_, 'UPDATE', M), poNo = {};
var pos = M.T.po.rows.filter(function (p) { return pmiS_(p.purchase_order_id) && pmiInScope_(p, sc); }), ids = {};
pos.forEach(function (p) {
var id = pmiS_(p.purchase_order_id); ids[id] = 1; poNo[id] = pmiS_(p.po_no);
var r = {}; hFields.forEach(function (c) { r[c.key] = c.key === 'row_version' ? pmiDigest_(p, M.T.po.headers) : pmiOut_(pmiField_(PMI_H_, c.key), p[c.key]); }); hRows.push(r);
});
M.T.pol.rows.forEach(function (l) {
var pid = pmiS_(l.purchase_order_id); if (!ids[pid]) return;
var r = {}; lFields.forEach(function (c) { r[c.key] = c.key === 'row_version' ? pmiDigest_(l, M.T.pol.headers) : c.key === 'po_no' ? poNo[pid] : pmiOut_(pmiField_(PMI_L_, c.key), l[c.key]); }); lRows.push(r);
});
}
return { sheets: [{ name: PMI_H_, columns: pmiColumns_(PMI_H_, mode, M), rows: hRows }, { name: PMI_L_, columns: pmiColumns_(PMI_L_, mode, M), rows: lRows }],
lists: pmiLists_(M), scope: o.scope || {}, scope_label: mode === 'UPDATE' ? pmiScopeLabel_(sc) : 'new purchase orders (opening / historical record)',
row_counts: { Header: hRows.length, Lines: lRows.length }, dictionary_version: PMI_SCHEMA_VERSION_,
notes: mode === 'ADD_NEW' ? [
'Add New creates NEW purchase orders only: (company, po_no) must not exist yet. One Header row per PO; its Lines rows repeat company + po_no.',
'This is an opening / historical record: no Send PO, no Receive, no document, no e-mail, no factory stock and no movement. completed_qty is the units already received - they must already be in the factory stock snapshot (scope.as_of_date).',
'Status rules: draft / issued / confirmed / in_production / ready_to_ship: nothing received; partial_completed: some received; completed: every line fully received; cancelled: any; closure: needs closure_reason; partial_shipped / shipped: BLOCKED (shipped quantities need the Shipment lineage).',
'Example (not data): Header company=ResUS, po_no=F-1001, order_status=partial_completed, warehouse_id=<factory>, currency=USD, order_date=2026-09-01; Lines company=ResUS, po_no=F-1001, sku=<sku>, ordered_qty=500, completed_qty=100.'
] : [
'Update changes ONLY the editable cells of the rows in this file, matched by purchase_order_id / purchase_order_line_id. Rows and POs not in the file are untouched; nothing is deleted.',
'Leave read-only cells as exported. A blank over a value is refused - type [CLEAR] to clear a clearable field. row_version proves the row is still the one exported.',
'Status, company, factory (after draft), received / shipped quantities and RO lineage are never changed by a file: use Send PO / Receive / Cancel.'
] };
}




function pmiValidate_(ss, req) {
var issues = [], warnings = [], M = pmiMasters_(ss, issues, req._pfiQuantityOnly === true);
if (!M) return { issues: issues, plan: null, state: { masters: 'UNREADABLE' }, preview: { counts: { create: 0, update: 0, unchanged: 0, reject: 0 }, rows: [], warnings: [] } };
var sc = pmiScope_(req.scope);
if (sc.bad.length) imbIssue_(issues, '', 0, 'scope', 'PO_SCOPE_INVALID', 'unknown scope key(s): ' + sc.bad.join(', '));
if (req.mode !== PMI_RECONCILE_) pmiColumnsCheck_(issues, req, req.mode);
var out = req.mode === 'ADD_NEW' ? pmiValidateAdd_(M, req, sc, issues, warnings) : req.mode === PMI_RECONCILE_ ? pmiValidateReconcile_(M, req, sc, issues, warnings) : pmiValidateUpdate_(M, req, sc, issues, warnings);
var rej = {}; issues.forEach(function (i) { if (i.sheet) rej[i.sheet + '#' + i.row] = 1; });
out.preview.rows.forEach(function (r) { if (rej[r.sheet + '#' + r.row]) r.action = 'reject'; });
var cnt = { create: 0, update: 0, unchanged: 0, reject: Object.keys(rej).length };
out.preview.rows.forEach(function (r) { if (cnt[r.action] !== undefined && r.action !== 'reject') cnt[r.action]++; });
out.preview.counts = cnt;
out.preview.warnings = warnings;
return { issues: issues, plan: issues.length ? null : out.plan, state: out.state, preview: out.preview };
}


function pmiValidateAdd_(M, req, sc, issues, warnings) {
var T = M.T, plan = { mode: 'ADD_NEW', appends: [], cells: [] }, prev = { counts: { create: 0, update: 0, unchanged: 0, reject: 0 }, rows: [],
impacts: { purchase_orders: { create: 0 }, purchase_order_lines: { create: 0 }, ongoing_unreceived_added: 0, draft_qty_not_supply: 0, fifo_available_added: 0,
factory_stock_change: 0, factory_stock_movements: 0, documents: 0, emails: 0, status_transitions: 0 } };
var state = { mode: 'ADD_NEW', as_of: sc.asOf, po_headers: T.po.headers, pol_headers: T.pol.headers, keys: {}, po_no_other: {}, ids: {}, wh: {}, sku: {}, sup: {}, reg: M.registered };
if (!imbDate_(sc.asOf)) imbIssue_(issues, '', 0, 'scope.as_of_date', 'PO_AS_OF_DATE_REQUIRED', 'Add New is an opening record: scope.as_of_date (yyyy-MM-dd) states the day the received quantities are counted up to - the factory stock snapshot must already contain them', sc.asOf);

[['purchase_orders', T.po, PURCHASE_ORDERS_HEADERS_], ['purchase_order_lines', T.pol, PURCHASE_ORDER_LINES_HEADERS_]].forEach(function (x) {
var miss = x[2].concat(PMI_NEW_COLUMNS_[x[0]]).filter(function (c) { return x[1].headers.indexOf(c) < 0; });
if (miss.length) imbIssue_(issues, '', 0, x[0], 'PO_IMPORT_SCHEMA_COLUMN_MISSING', x[0] + ' lacks ' + miss.join(', ') + ' - an approved migration adds them; nothing is created here', miss.join(','));
});

var dbKey = {}, dbNo = {}, dbIds = {};
T.po.rows.forEach(function (p) { var k = (pmiS_(p.company) + '|' + pmiS_(p.po_no)).toLowerCase(), n = pmiS_(p.po_no).toLowerCase(); if (pmiS_(p.po_no)) { (dbKey[k] = dbKey[k] || []).push(pmiS_(p.purchase_order_id)); (dbNo[n] = dbNo[n] || []).push(pmiS_(p.company)); } dbIds[pmiS_(p.purchase_order_id)] = 1; });
T.pol.rows.forEach(function (l) { dbIds[pmiS_(l.purchase_order_line_id)] = 1; });
var heads = {}, order = [], fileNo = {};
(req.sheets[PMI_H_] || []).forEach(function (r) {
var row = r.__row, e = { row: row, raw: r, ok: true, lines: [] };
function bad(field, code, msg, v) { imbIssue_(issues, PMI_H_, row, field, code, msg, v); e.ok = false; }
Object.keys(r).forEach(function (k) { if (imbCell_(r, k).clear) bad(k, 'PO_CLEAR_NOT_IN_ADD', '[CLEAR] has no meaning in a new PO - leave the cell blank'); });
var co = pmiCompany_(r.company);
if (co.code) bad('company', co.code === 'PO_REQUIRED' ? 'PO_REQUIRED' : co.code, co.code === 'PO_REQUIRED' ? 'company is required' : 'company must be exactly one of ' + pmiCompanies_().join(' / ') + (co.code === 'PO_COMPANY_SPELLING' ? ' (did you mean ' + co.expected + '?)' : ''), r.company);
e.company = co.value || pmiS_(r.company);
e.po_no = pmiS_(r.po_no);
if (!e.po_no) bad('po_no', 'PO_REQUIRED', 'po_no is required (the PO number as issued)');
else if (e.po_no.length > 80) bad('po_no', 'PO_TEXT_TOO_LONG', 'po_no: at most 80 characters');
var st = pmiStatus_(r.order_status);
if (st.code) bad('order_status', st.code, st.code === 'PO_STATUS_ONGOING_NOT_A_STATUS' ? 'Ongoing is a planning set, not a PO status - choose the real status (issued, in_production, partial_completed ...)' :
st.code === 'PO_STATUS_UNKNOWN' ? 'unknown status - one of ' + PMI_STATUSES_.filter(function (s) { return s.import === 'ALLOWED'; }).map(function (s) { return s.value; }).join(' / ') : st.code === 'PO_STATUS_REQUIRED' ? 'order_status is required' : (st.value + ' is BLOCKED: ' + st.why), r.order_status);
else if (st.alias) warnings.push({ sheet: PMI_H_, row: row, code: 'PO_STATUS_ALIAS_MAPPED', message: '"' + st.alias + '" read as ' + st.value });
e.def = st.value ? pmiStatusDef_(st.value) : null; e.status = st.value || '';
if (sc.company && e.company !== sc.company) bad('company', 'PO_OUT_OF_SCOPE', 'this import is scoped to company ' + sc.company, e.company);
if (co.value && !M.registered[co.value]) warnings.push({ sheet: PMI_H_, row: row, code: 'PO_COMPANY_NOT_REGISTERED', message: co.value + ' has no marketplace_skus row: Ongoing lists its unreceived units under REVIEW (UNKNOWN_COMPANY), at no site' });
var fac = pmiFactory_(M, r.warehouse_id, e.def);
state.wh[pmiS_(r.warehouse_id).toLowerCase()] = M.fmap[pmiS_(r.warehouse_id).toLowerCase()] || null;
if (!pmiS_(r.warehouse_id)) bad('warehouse_id', 'PO_REQUIRED', 'warehouse_id (the factory) is required');
else if (!fac.ok) bad('warehouse_id', fac.code, 'the factory must be one warehouses row with is_factory_warehouse' + (e.def && e.def.factory === 'ACTIVE' ? ' and is_active (a ' + e.status + ' PO can still receive)' : '') + ' - never a name or a code', fac.value);
e.wh = fac.ok ? fac.warehouse_id : '';
var cur = pmiParse_({ key: 'currency', type: 'enum', list: 'currencies' }, r.currency);
if (!pmiS_(r.currency)) { if (req._pfiQuantityOnly !== true) bad('currency', 'PO_REQUIRED', 'currency is required'); } else if (!cur.ok) bad('currency', cur.code, cur.message, r.currency);
e.currency = cur.ok ? cur.value : '';

var sid = pmiS_(r.supplier_id), sname = pmiS_(r.supplier_name);
if (sid && M.sup) {
var se = M.sup[sid]; state.sup[sid] = se || null;
if (!se) bad('supplier_id', 'PO_SUPPLIER_UNKNOWN', 'supplier_id is not in supplier_price_list', sid);
else {
if (!se.active && e.def && e.def.factory === 'ACTIVE') bad('supplier_id', 'PO_SUPPLIER_INACTIVE', 'an inactive supplier is accepted only as the history of a completed / cancelled / closed PO', sid);
if (se.names.length > 1 && !sname) bad('supplier_name', 'PO_SUPPLIER_NAME_AMBIGUOUS', 'supplier_price_list holds several names for ' + sid + ': ' + se.names.join(' / ') + ' - type the one this PO used');
else if (sname && se.names.indexOf(sname) < 0) bad('supplier_name', 'PO_SUPPLIER_NAME_MISMATCH', 'supplier_name must be ' + se.names.join(' / ') + ' for ' + sid, sname);
if (!sname) sname = se.name;
}
} else if (sid && !M.sup) warnings.push({ sheet: PMI_H_, row: row, code: 'PO_SUPPLIER_AUTHORITY_ABSENT', message: 'no supplier_price_list: supplier_id ' + sid + ' is kept as a snapshot, unchecked' });
e.supplier_id = sid; e.supplier_name = sname;

var od = imbCell_(r, 'order_date'), odv = '';
if (!od.absent && !od.blank) { var p0 = pmiParse_({ key: 'order_date', type: 'date' }, r.order_date); if (!p0.ok) bad('order_date', p0.code, p0.message, r.order_date); else odv = p0.value; }
if (e.def && e.def.order_date === 'REQUIRED' && !odv && (od.absent || od.blank)) bad('order_date', 'PO_ORDER_DATE_REQUIRED', 'a ' + e.status + ' PO needs its order_date (Send PO day) - without it the PO can never supply a shipment (32_ FIFO)');
if (e.def && e.def.order_date === 'FORBIDDEN' && odv) bad('order_date', 'PO_DRAFT_ORDER_DATE_NOT_ALLOWED', 'a draft has no order_date: Send PO stamps it', odv);
if (odv && sc.asOf && imbDate_(sc.asOf) && odv > sc.asOf) bad('order_date', 'PO_ORDER_DATE_AFTER_AS_OF', 'order_date is after the opening day ' + sc.asOf, odv);
e.order_date = odv;
var cr = pmiS_(r.closure_reason);
if (e.status === 'closure' && !cr) bad('closure_reason', 'PO_CLOSURE_REASON_REQUIRED', 'a closure PO needs closure_reason (why its remainder will never arrive)');
if (e.status && e.status !== 'closure' && cr) bad('closure_reason', 'PO_CLOSURE_REASON_NOT_ALLOWED', 'closure_reason belongs to a closure PO only', cr);
e.closure_reason = cr;
e.vals = {};
['km_po_no', 'deposit_due_date', 'inspection_date', 'expected_completion_date', 'expected_ship_date', 'supplier_expected_ready_date', 'supplier_confirmed_ready_date',
'deposit_amount', 'balance_amount', 'paid_amount', 'payment_status', 'payment_term_id', 'note'].forEach(function (k) {
var c = imbCell_(r, k); if (c.absent || c.blank || c.clear) { e.vals[k] = ''; return; }
var p = pmiParse_(pmiField_(PMI_H_, k), r[k], { currency: e.currency }); if (!p.ok) { bad(k, p.code, p.message, r[k]); return; } e.vals[k] = p.value;
});
if (e.vals.payment_term_id !== '') { warnings.push(pmiPaymentTermWarning_(PMI_H_, row)); e.vals.payment_term_id = ''; }
if (!e.po_no || co.code) { order.push(e); return; }
var key = (e.company + '|' + e.po_no).toLowerCase(); e.key = key;
state.keys[key] = dbKey[key] || [];
if (heads[key]) { bad('po_no', 'PO_DUPLICATE_IN_FILE', 'company ' + e.company + ' + po_no ' + e.po_no + ' is already Header row ' + heads[key].row, e.po_no); order.push(e); return; }
heads[key] = e; order.push(e);
if (dbKey[key]) bad('po_no', 'PO_NO_EXISTS', 'company ' + e.company + ' already has po_no ' + e.po_no + ' (' + dbKey[key].join(', ') + ') - Add New never touches an existing PO; use Update', e.po_no);
var others = (dbNo[e.po_no.toLowerCase()] || []).filter(function (c) { return c.toLowerCase() !== e.company.toLowerCase(); });
state.po_no_other[e.po_no.toLowerCase()] = others;
(fileNo[e.po_no.toLowerCase()] = fileNo[e.po_no.toLowerCase()] || []).push(e);
if (others.length) warnings.push({ sheet: PMI_H_, row: row, code: 'PO_NO_SHARED_ACROSS_COMPANIES', message: 'po_no ' + e.po_no + ' also exists for ' + others.join(', ') + ': a different PO (company + po_no is the identity); Update addresses it by purchase_order_id only' });
e.id = 'PO-' + imbSha_('PMI|' + req.id + '|' + key).slice(0, 10).toUpperCase();
state.ids[e.id] = !!dbIds[e.id];
if (dbIds[e.id]) bad('po_no', 'PO_ID_COLLISION', 'the derived purchase_order_id ' + e.id + ' already exists - use another import_batch_id', e.id);
});
Object.keys(fileNo).forEach(function (n) { if (fileNo[n].length > 1) fileNo[n].forEach(function (e) { warnings.push({ sheet: PMI_H_, row: e.row, code: 'PO_NO_SHARED_ACROSS_COMPANIES', message: 'po_no ' + e.po_no + ' appears for ' + fileNo[n].map(function (x) { return x.company; }).join(' + ') + ' in this file: separate POs, one per company' }); }); });

(req.sheets[PMI_L_] || []).forEach(function (r) {
var row = r.__row, L = { row: row, ok: true };
function bad(field, code, msg, v) { imbIssue_(issues, PMI_L_, row, field, code, msg, v); L.ok = false; }
Object.keys(r).forEach(function (k) { if (imbCell_(r, k).clear) bad(k, 'PO_CLEAR_NOT_IN_ADD', '[CLEAR] has no meaning in a new line - leave the cell blank'); });
var co = pmiCompany_(r.company), no = pmiS_(r.po_no);
if (co.code || !no) { bad(co.code ? 'company' : 'po_no', 'PO_LINE_LINK_REQUIRED', 'a line names its PO by company + po_no (exactly as on its Header row)', co.code ? r.company : ''); return; }
var h = heads[(co.value + '|' + no).toLowerCase()];
if (!h) { bad('po_no', 'PO_LINE_ORPHAN', 'no Header row in this file has company ' + co.value + ' + po_no ' + no + ' - lines are never attached to an existing PO', no); return; }
var sku = pmiS_(r.sku), se = M.sku[sku];
state.sku[sku] = se ? { series: se.series, upc: se.upc, dup: se.dup } : null;
if (!sku) bad('sku', 'PO_REQUIRED', 'sku is required');
else if (!se) { var ci = M.skuLc[sku.toLowerCase()]; bad('sku', ci ? 'PO_SKU_CASE' : 'PO_SKU_UNKNOWN', ci ? 'sku is spelled ' + ci.join(' / ') + ' in sku_details' : 'sku is not in sku_details - no SKU is created here', sku); }
else if (se.dup) bad('sku', 'PO_SKU_AMBIGUOUS', 'sku_details holds this sku more than once', sku);
else {
if (pmiS_(r.series) && pmiS_(r.series) !== se.series) bad('series', 'PO_SKU_DERIVED_MISMATCH', 'series comes from sku_details (' + se.series + ')', r.series);
if (pmiS_(r.units_per_carton) && Number(r.units_per_carton) !== se.upc) bad('units_per_carton', 'PO_SKU_DERIVED_MISMATCH', 'units_per_carton comes from sku_details (' + se.upc + ')', r.units_per_carton);

if (/^(inactive|discontinued|eol|deleted)$/i.test(se.status) && h.status === 'draft') bad('sku', 'PO_SKU_INACTIVE_ON_DRAFT', sku + ' is ' + se.status + ' in sku_details - a Draft PO is a new purchase; reactivate the SKU first', sku);
else if (/^(inactive|discontinued|eol|deleted)$/i.test(se.status) && h.def && h.def.factory === 'ACTIVE') warnings.push({ sheet: PMI_L_, row: row, code: 'PO_SKU_INACTIVE_ON_OPEN_PO', message: sku + ' is ' + se.status + ' in sku_details' });
}
L.sku = sku; L.series = se ? se.series : ''; L.upc = se ? se.upc : 0;
var swh = imbCell_(r, 'supplier_warehouse_id');
if (swh.absent || swh.blank) { L.wh = h.wh; L.whDefaulted = true; }
else { var fac = pmiFactory_(M, r.supplier_warehouse_id, h.def); state.wh[pmiS_(r.supplier_warehouse_id).toLowerCase()] = M.fmap[pmiS_(r.supplier_warehouse_id).toLowerCase()] || null;
if (!fac.ok) bad('supplier_warehouse_id', fac.code, 'the receiving factory must be one warehouses row with is_factory_warehouse' + (h.def && h.def.factory === 'ACTIVE' ? ' and is_active' : ''), fac.value); L.wh = fac.ok ? fac.warehouse_id : ''; }
var oq = imbCell_(r, 'ordered_qty'), cq = imbCell_(r, 'completed_qty');
if (oq.absent || oq.blank) bad('ordered_qty', 'PO_REQUIRED', 'ordered_qty is required');
else { var po = pmiParse_(pmiField_(PMI_L_, 'ordered_qty'), r.ordered_qty); if (!po.ok || po.value <= 0) bad('ordered_qty', 'PO_QTY_INVALID', 'ordered_qty must be a whole number > 0', r.ordered_qty); else L.ordered = po.value; }
if (cq.absent || cq.blank) bad('completed_qty', 'PO_REQUIRED', 'completed_qty is required: the units already received (0 when none) - a blank is not 0');
else { var pc = pmiParse_(pmiField_(PMI_L_, 'completed_qty'), r.completed_qty); if (!pc.ok) bad('completed_qty', 'PO_QTY_INVALID', 'completed_qty must be a whole number >= 0', r.completed_qty); else L.completed = pc.value; }
if (L.ordered !== undefined && L.completed !== undefined && L.completed > L.ordered) bad('completed_qty', 'PO_COMPLETED_EXCEEDS_ORDERED', 'received ' + L.completed + ' > ordered ' + L.ordered, L.completed);
var sq = imbCell_(r, 'shipped_qty');
if (!sq.absent && !sq.blank && Number(r.shipped_qty) !== 0) bad('shipped_qty', 'PO_SHIPPED_QTY_NOT_IMPORTABLE', 'shipped quantities exist only as executed shipment allocations (32_); a PO number without that lineage blocks every later dispatch of the line - declare the units shipped before the cut-off in opening_shipped_qty instead', r.shipped_qty);
var osq = imbCell_(r, 'opening_shipped_qty'); L.od = '';
if (!osq.absent && !osq.blank) { var pd = pmiParse_(pmiField_(PMI_L_, 'opening_shipped_qty'), r.opening_shipped_qty); if (!pd.ok) bad('opening_shipped_qty', 'PO_QTY_INVALID', 'opening_shipped_qty must be a whole number >= 0 (blank = not known yet)', r.opening_shipped_qty); else L.od = pd.value; }
if (L.od !== '' && L.completed !== undefined && L.od > L.completed) bad('opening_shipped_qty', 'PO_OPENING_SHIPPED_EXCEEDS_RECEIVED', 'declared shipped ' + L.od + ' is more than the ' + L.completed + ' received - only received units can have left the factory', L.od);
L.vals = {};
['supplier_sku', 'factory_item_no', 'factory_item_name', 'unit_cost', 'inspection_date', 'expected_completion_date', 'expected_ship_date', 'note'].forEach(function (k) {
var c = imbCell_(r, k); if (c.absent || c.blank || c.clear) { L.vals[k] = ''; return; }
var p = pmiParse_(pmiField_(PMI_L_, k), r[k], { currency: h.currency }); if (!p.ok) { bad(k, p.code, p.message, r[k]); return; } L.vals[k] = p.value; L.vals[k + '#'] = p.cmp;
});
var lc = imbCell_(r, 'currency');
if (!lc.absent && !lc.blank && pmiS_(r.currency).toUpperCase() !== h.currency) bad('currency', 'PO_LINE_CURRENCY_MISMATCH', 'a line is in its PO\'s currency (' + h.currency + ')', r.currency);
h.lines.push(L);
});

var opCands = [];
order.forEach(function (h) {
if (!h.key || heads[h.key] !== h) return;
if (!h.lines.length) { imbIssue_(issues, PMI_H_, h.row, 'po_no', 'PO_HEADER_WITHOUT_LINES', 'a PO needs at least one Lines row (company + po_no)', h.po_no); h.ok = false; }
var lines = h.lines.filter(function (l) { return l.ordered !== undefined && l.completed !== undefined; });
if (h.def && lines.length === h.lines.length && lines.length) {
var anyRecv = lines.some(function (l) { return l.completed > 0; }), anyOpen = lines.some(function (l) { return l.completed < l.ordered; });
var q = h.def.qty, why = q === 'ZERO' && anyRecv ? 'a ' + h.status + ' PO has received nothing: a received unit makes it partial_completed (or completed when every line is full)'
: q === 'PARTIAL' && !(anyRecv && anyOpen) ? 'partial_completed needs some line received and some line still short' + (anyRecv ? ' (every line is full: completed)' : ' (nothing received: issued / in_production ...)')
: q === 'FULL' && anyOpen ? 'completed means every line is fully received (completed_qty = ordered_qty); a PO closed short is closure (with closure_reason) or cancelled' : '';
if (why) { imbIssue_(issues, PMI_H_, h.row, 'order_status', 'PO_STATUS_QTY_INCOHERENT', why, h.status); h.ok = false; }
}
if (!h.ok || h.lines.some(function (l) { return !l.ok; })) return;
var firstA = plan.appends.length, firstR = prev.rows.length, M2 = PMI_MARK_ + req.id, tq = 0, tc = 0, skuSet = {}, amt = '0', priced = false, ongoing = 0, recv = 0;
h.lines.forEach(function (l, i) {
l.id = 'POL-' + imbSha_('PMI|' + h.id + '|' + i).slice(0, 10).toUpperCase();
state.ids[l.id] = !!dbIds[l.id];
if (dbIds[l.id]) imbIssue_(issues, PMI_L_, l.row, 'sku', 'PO_ID_COLLISION', 'the derived purchase_order_line_id ' + l.id + ' already exists - use another import_batch_id', l.id);
var carton = l.upc > 0 ? Math.ceil(l.ordered / l.upc) : 0, split = procurementCompanyQty_(h.company, l.ordered), la = '';
if (l.vals.unit_cost !== '') { priced = true; var prod = pmiDigMul_(String(l.ordered), pmiScaled_(l.vals['unit_cost#'], 4)); amt = pmiDigAdd_(amt, prod); la = Number(pmiUnscale_(prod, 4, 2)); }
tq += l.ordered; tc += carton; skuSet[l.sku.toLowerCase()] = 1; recv += l.completed;
if (h.def.ongoing === 'OPEN') ongoing += l.ordered - l.completed;
if (h.status === 'draft') prev.impacts.draft_qty_not_supply += l.ordered;
var opening = l.completed > 0 ? { opening_completed_qty: l.completed, opening_shipped_qty: l.od, opening_lineage_qty: 0, opening_reconcile_status: PMI_OPENING_PENDING_ }
: { opening_completed_qty: '', opening_shipped_qty: '', opening_lineage_qty: '', opening_reconcile_status: '' };
plan.appends.push({ table: 'purchase_order_lines', id: h.id, line_id: l.id, obj: {
purchase_order_line_id: l.id, purchase_order_id: h.id, request_order_line_id: '', request_order_id: '', request_bucket: '', sku: l.sku, company: h.company, series: l.series,
factory_item_no: l.vals.factory_item_no, factory_item_name: l.vals.factory_item_name, supplier_id: h.supplier_id, supplier_name: h.supplier_name, supplier_sku: l.vals.supplier_sku,
supplier_warehouse_id: l.wh, km_qty: split.km_qty, resus_qty: split.resus_qty, restw_qty: split.restw_qty, recommended_qty: '', requested_qty: '', approved_qty: '',
ordered_qty: l.ordered, completed_qty: l.completed, shipped_qty: 0, remaining_qty: l.completed, carton_qty: carton, units_per_carton: l.upc, unit_cost: l.vals.unit_cost, line_amount: la,
currency: h.currency, line_status: '', inspection_date: l.vals.inspection_date, expected_completion_date: l.vals.expected_completion_date, expected_ship_date: l.vals.expected_ship_date,
related_shipment_id: '', note: l.vals.note, created_at: '$NOW', updated_at: '$NOW', import_batch_id: req.id,
opening_completed_qty: opening.opening_completed_qty, opening_shipped_qty: opening.opening_shipped_qty, opening_lineage_qty: opening.opening_lineage_qty, opening_reconcile_status: opening.opening_reconcile_status } });
if (l.completed > 0) opCands.push({ id: l.id, wh: l.wh, sku: l.sku, completed: l.completed, shipped: 0, od: l.od, lineage: 0, h: h, fifo: !!h.def.fifo, obj: plan.appends[plan.appends.length - 1].obj });
prev.rows.push({ sheet: PMI_L_, row: l.row, action: 'create', entity: 'purchase_order_lines', id: l.id, purchase_order_id: h.id, sku: l.sku, ordered_qty: l.ordered, completed_qty: l.completed,
unreceived_qty: l.ordered - l.completed, ongoing: h.def.ongoing, supplier_warehouse_id: l.wh + (l.whDefaulted ? ' (from Header)' : '') });
prev.impacts.purchase_order_lines.create++;
});
var total = priced && amt !== '0' ? Number(pmiUnscale_(amt, 4, 2)) : '', lineAppends = plan.appends.splice(firstA), lineRows = prev.rows.splice(firstR);
var nonDraft = !!h.order_date;
plan.appends.push({ table: 'purchase_orders', id: h.id, obj: {
purchase_order_id: h.id, po_no: h.po_no, km_po_no: h.vals.km_po_no, warehouse_id: h.wh, supplier_name: h.supplier_name, order_status: h.status, order_date: h.order_date,
deposit_due_date: h.vals.deposit_due_date, inspection_date: h.vals.inspection_date, expected_completion_date: h.vals.expected_completion_date, expected_ship_date: h.vals.expected_ship_date,
subtotal_amount: total, deposit_amount: h.vals.deposit_amount, balance_amount: h.vals.balance_amount, paid_amount: h.vals.paid_amount, payment_status: h.vals.payment_status,
payment_term_id: h.vals.payment_term_id, currency: h.currency, note: h.vals.note, purchase_order_no: h.po_no, po_version: 1, parent_purchase_order_id: h.id, request_order_id: '',
company: h.company, supplier_id: h.supplier_id, factory_id: h.wh, total_sku: Object.keys(skuSet).length, total_qty: tq, total_cartons: tc, total_amount: total,
supplier_expected_ready_date: h.vals.supplier_expected_ready_date, supplier_confirmed_ready_date: h.vals.supplier_confirmed_ready_date, request_bucket: '',
created_by: '$ACTOR', created_at: '$NOW', updated_by: '$ACTOR', updated_at: '$NOW', issued_by: nonDraft ? M2 : '', issued_at: '', confirmed_by: '', confirmed_at: '',
cancelled_by: h.status === 'cancelled' ? M2 : '', cancelled_at: '', completed_by: h.status === 'completed' ? M2 : '', completed_at: '',
closure_reason: h.closure_reason, closed_by: h.status === 'closure' ? M2 : '', closed_at: '', source_type: PMI_SOURCE_TYPE_, import_batch_id: req.id } });
plan.appends = plan.appends.concat(lineAppends);
prev.rows.push({ sheet: PMI_H_, row: h.row, action: 'create', entity: 'purchase_orders', id: h.id, company: h.company, po_no: h.po_no, order_status: h.status, warehouse_id: h.wh,
lines: h.lines.length, total_qty: tq, received_qty: recv, ongoing_unreceived_qty: ongoing, total_amount: total === '' ? '' : pmiUnscale_(amt, 4, 2) });
prev.rows = prev.rows.concat(lineRows);
prev.impacts.purchase_orders.create++; prev.impacts.ongoing_unreceived_added += ongoing;
if (recv > 0) warnings.push({ sheet: PMI_H_, row: h.row, code: 'PO_RECEIVED_NOT_POSTED_TO_STOCK', message: recv + ' received unit(s) are recorded on the PO only: factory stock is the snapshot as of ' + sc.asOf + ' and is NOT changed (no movement)' });
if (h.def.ongoing === 'OPEN' && ongoing > 0) warnings.push({ sheet: PMI_H_, row: h.row, code: 'PO_NO_RO_SOURCE', message: ongoing + ' unreceived unit(s) enter Ongoing without a Request Order source: KMOOP A2 places them by ' + h.company + '\'s Regular FC share; with no FC site they stay unallocated (never on a first site)' });
});


prev.impacts.opening_held_qty = 0; prev.impacts.opening_reconciled_lines = 0;
if (opCands.length && !issues.length) {
var dec = pmiOpeningDecide_(M.ss, T.pol.rows, opCands), byPo = {};
state.opening = { cover: dec.cover, status: dec.status };
opCands.forEach(function (c) {
var s = dec.status[c.id], b = byPo[c.h.id] = byPo[c.h.id] || { h: c.h, held: 0, rec: 0, why: {} };
c.obj.opening_reconcile_status = s;
if (s === PMI_OPENING_RECONCILED_) { b.rec += c.completed - c.od; prev.impacts.opening_reconciled_lines++; if (c.fifo) prev.impacts.fifo_available_added += c.completed - c.od; }
else { b.held += c.completed; prev.impacts.opening_held_qty += c.completed; b.why[dec.reason[c.id]] = (b.why[dec.reason[c.id]] || 0) + c.completed; }
prev.rows.forEach(function (pr) { if (pr.id === c.id) { pr.opening_reconcile_status = s; pr.opening_shipped_qty = c.od; pr.opening_reason = dec.reason[c.id] || ''; } });
});
Object.keys(byPo).forEach(function (id) {
var b = byPo[id];
if (b.held > 0) warnings.push({ sheet: PMI_H_, row: b.h.row, code: 'PO_OPENING_HELD', message: b.held + ' received unit(s) are HELD out of shipment FIFO until reconciled (' + Object.keys(b.why).sort().map(function (k) { return k + ' ' + b.why[k] + ': ' + PMI_OPENING_REASON_TEXT_[k]; }).join('; ') + ') - Ongoing is not affected' });
if (b.rec > 0) warnings.push({ sheet: PMI_H_, row: b.h.row, code: 'PO_OPENING_RECONCILED', message: b.rec + ' received unit(s) declared still at the factory and covered by its stock: ' + (b.h.def.fifo ? 'shippable PO balance for shipment FIFO' : 'not in shipment FIFO (a ' + b.h.status + ' PO)') });
});
}
return { plan: plan, state: state, preview: prev };
}





var PMI_REC_COLS_ = [['purchase_order_line_id', 'key', 'the line (system id)'], ['row_version', 'version', 'server digest of the line'], ['company', 'ref'], ['po_no', 'ref'], ['sku', 'ref'],
['supplier_warehouse_id', 'ref', 'the receiving factory'], ['completed_qty', 'ref'], ['shipped_qty', 'ref', 'the executed shipment lineage (32_)'], ['opening_completed_qty', 'ref'],
['opening_shipped_qty', 'declare', 'type it once when blank (units of opening_completed_qty already shipped before the cut-off); a stored declaration is never changed by a file'],
['opening_lineage_qty', 'ref', 'historical shipments proven by the Shipment import'], ['opening_reconcile_status', 'ref'], ['opening_held_qty', 'computed', 'units held out of shipment FIFO now'], ['opening_next', 'computed', 'what this line still needs']];
function pmiReconcileRow_(M, l, p) {
var od = pmiS_(l.opening_shipped_qty), lin = pmiOpeningNum_(l.opening_lineage_qty), held = typeof slaOpeningHold_ === 'function' ? slaOpeningHold_(l) : '';
var next = od === '' ? 'declare opening_shipped_qty' : lin < Number(od) ? 'import ' + (Number(od) - lin) + ' more historically shipped unit(s) through the Shipment import (with this purchase_order_line_id)'
: 'reconcile: the factory stock at ' + pmiS_(l.supplier_warehouse_id) + ' must cover the ' + Math.max(0, pmiOpeningNum_(l.completed_qty) - pmiOpeningNum_(l.shipped_qty)) + ' unit(s) still there';
return { purchase_order_line_id: pmiS_(l.purchase_order_line_id), row_version: pmiDigest_(l, M.T.pol.headers), company: pmiS_(l.company) || pmiS_(p.company), po_no: pmiS_(p.po_no), sku: pmiS_(l.sku),
supplier_warehouse_id: pmiS_(l.supplier_warehouse_id), completed_qty: pmiOpeningNum_(l.completed_qty), shipped_qty: pmiOpeningNum_(l.shipped_qty), opening_completed_qty: pmiOpeningNum_(l.opening_completed_qty),
opening_shipped_qty: od === '' ? '' : Number(od), opening_lineage_qty: lin, opening_reconcile_status: pmiS_(l.opening_reconcile_status).toUpperCase() || PMI_OPENING_PENDING_, opening_held_qty: held, opening_next: next };
}
function pmiReconcileTemplate_(M, sc, includeData) {
var poBy = {}, rows = [];
M.T.po.rows.forEach(function (p) { poBy[pmiS_(p.purchase_order_id)] = p; });
if (includeData) M.T.pol.rows.forEach(function (l) {
if (pmiOpeningNum_(l.opening_completed_qty) <= 0 || pmiS_(l.opening_reconcile_status).toUpperCase() === PMI_OPENING_RECONCILED_) return;
var p = poBy[pmiS_(l.purchase_order_id)]; if (p && pmiInScope_(p, sc)) rows.push(pmiReconcileRow_(M, l, p));
});
return { sheets: [{ name: PMI_L_, columns: PMI_REC_COLS_.map(function (c) { return { key: c[0], header: c[0], kind: c[1], type: c[0] === 'opening_shipped_qty' ? 'int' : 'text', required: c[1] === 'key' || c[1] === 'version', list: null, editable: c[1] === 'declare',
update_policy: c[1] === 'declare' ? 'DECLARE_ONCE' : 'READONLY', clearable: false, hidden: c[0] === 'row_version', comment: c[2] || ('purchase_order_lines.' + c[0] + ' (read-only here)') }; }), rows: rows }],
lists: {}, scope: sc, scope_label: 'opening lines still held out of shipment FIFO - ' + pmiScopeLabel_(sc), row_counts: { Lines: rows.length }, dictionary_version: PMI_SCHEMA_VERSION_,
notes: ['These are historical PO lines whose received units are HELD out of shipment FIFO. Nothing here posts stock or writes shipped_qty.',
'Type opening_shipped_qty where it is blank (how many of the received units had already shipped at the cut-off). The historical shipments themselves come in through the Shipment import, naming this purchase_order_line_id.',
'A line is released when the shipments proven equal the declaration and the factory stock covers what is said to be still at the factory; anything else stays held, with the reason.'] };
}
function pmiValidateReconcile_(M, req, sc, issues, warnings) {
var T = M.T, plan = { mode: PMI_RECONCILE_, appends: [], cells: [] }, prev = { counts: { create: 0, update: 0, unchanged: 0, reject: 0 }, rows: [],
impacts: { declared_lines: 0, reconciled_lines: 0, released_qty: 0, still_pending_lines: 0, shipped_qty_changes: 0, factory_stock_movements: 0, documents: 0, emails: 0 } };
var state = { mode: PMI_RECONCILE_, pol: {}, opening: null }, allowed = {}, poBy = {}, polBy = {}, seen = {}, cands = [];
PMI_REC_COLS_.forEach(function (c) { allowed[c[0]] = c; });
var miss = PMI_OPENING_COLUMNS_.filter(function (c) { return T.pol.headers.indexOf(c) < 0; });
if (miss.length) imbIssue_(issues, '', 0, 'purchase_order_lines', 'PO_IMPORT_SCHEMA_COLUMN_MISSING', 'purchase_order_lines lacks ' + miss.join(', ') + ' - an approved migration adds them; nothing is created here', miss.join(','));
if ((req.sheets[PMI_H_] || []).length) imbIssue_(issues, PMI_H_, 0, '', 'PO_RECONCILE_HEADER_NOT_USED', 'the opening reconciliation reads the Lines sheet only - leave Header out');
T.po.rows.forEach(function (p) { var id = pmiS_(p.purchase_order_id); if (id) (poBy[id] = poBy[id] || []).push(p); });
T.pol.rows.forEach(function (l) { var id = pmiS_(l.purchase_order_line_id); if (id) (polBy[id] = polBy[id] || []).push(l); });
(req.sheets[PMI_L_] || []).forEach(function (r) {
var row = r.__row, id = pmiS_(r.purchase_order_line_id), ls = polBy[id] || [];
Object.keys(r).forEach(function (k) { if (k !== '__row' && !allowed[k]) imbIssue_(issues, PMI_L_, row, k, PMI_NAMED_REFUSALS_[k] || 'PO_COLUMN_NOT_ACCEPTED', k + ' is not a column of the opening reconciliation'); });
if (!id) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_LINE_ID_REQUIRED', 'a line is named by purchase_order_line_id');
if (!ls.length) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_LINE_NOT_FOUND', 'no purchase order line ' + id, id);
if (ls.length > 1) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_LINE_ID_DUPLICATE_IN_DB', id + ' is on ' + ls.length + ' rows of purchase_order_lines', id);
if (seen[id]) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_DUPLICATE_IN_FILE', id + ' is already Lines row ' + seen[id], id);
seen[id] = row;
var l = ls[0], pid = pmiS_(l.purchase_order_id), hs = poBy[pid] || [], dg = pmiDigest_(l, T.pol.headers); state.pol[id] = dg;
if (hs.length !== 1) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_LINE_PARENT_UNRESOLVED', 'the line\'s purchase order ' + pid + ' is ' + (hs.length ? 'on several rows' : 'missing'), pid);
if (!pmiInScope_(hs[0], sc)) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_OUT_OF_SCOPE', 'its PO ' + pid + ' is outside this import\'s scope', id);
var rv = pmiS_(r.row_version);
if (!rv) return imbIssue_(issues, PMI_L_, row, 'row_version', 'PO_ROW_VERSION_REQUIRED', 'row_version is required - export the reconciliation file again');
if (rv !== dg) return imbIssue_(issues, PMI_L_, row, 'row_version', 'PO_STALE_EXPORT', id + ' changed after this file was exported (a shipment import, a receipt or a dispatch) - export again', rv);
var cur = pmiReconcileRow_(M, l, hs[0]), bad = false;
PMI_REC_COLS_.forEach(function (c) { if (c[1] !== 'ref') return; var cc = imbCell_(r, c[0]); if (cc.absent || cc.blank) return; if (String(cc.value) !== String(cur[c[0]])) { bad = true; imbIssue_(issues, PMI_L_, row, c[0], 'PO_RECONCILE_FIELD_READONLY', c[0] + ' is read-only here (stored ' + cur[c[0]] + ')', cc.value); } });
if (bad) return;
var oc = cur.opening_completed_qty, lineage = cur.opening_lineage_qty, stored = pmiS_(l.opening_shipped_qty), od = stored === '' ? '' : Number(stored), declare = false;
if (oc <= 0) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_OPENING_NOT_AN_OPENING_LINE', id + ' received nothing before a cut-off - it has nothing to reconcile', id);
var c = imbCell_(r, 'opening_shipped_qty');
if (c.clear) return imbIssue_(issues, PMI_L_, row, 'opening_shipped_qty', 'PO_OPENING_DECLARATION_LOCKED', 'a declaration is never cleared by a file');
if (!c.absent && !c.blank) {
var pv = pmiParse_({ key: 'opening_shipped_qty', type: 'int' }, r.opening_shipped_qty);
if (!pv.ok) return imbIssue_(issues, PMI_L_, row, 'opening_shipped_qty', 'PO_QTY_INVALID', 'opening_shipped_qty must be a whole number >= 0', r.opening_shipped_qty);
if (stored !== '' && Number(stored) !== pv.value) return imbIssue_(issues, PMI_L_, row, 'opening_shipped_qty', 'PO_OPENING_DECLARATION_LOCKED', 'declared ' + stored + ' already - a file never changes a declaration (a wrong one is a correction the Owner approves)', pv.value);
if (stored === '') {
if (pv.value > oc) return imbIssue_(issues, PMI_L_, row, 'opening_shipped_qty', 'PO_OPENING_SHIPPED_EXCEEDS_RECEIVED', 'declared shipped ' + pv.value + ' is more than the ' + oc + ' received at the cut-off', pv.value);
if (pv.value < lineage) return imbIssue_(issues, PMI_L_, row, 'opening_shipped_qty', 'PO_OPENING_DECLARED_BELOW_LINEAGE', 'the Shipment import already proved ' + lineage + ' shipped', pv.value);
od = pv.value; declare = true;
}
}
if (cur.opening_reconcile_status === PMI_OPENING_RECONCILED_) { prev.rows.push({ sheet: PMI_L_, row: row, action: 'unchanged', entity: 'purchase_order_lines', id: id, opening_reconcile_status: PMI_OPENING_RECONCILED_ }); return; }
cands.push({ id: id, wh: cur.supplier_warehouse_id, sku: cur.sku, completed: cur.completed_qty, shipped: cur.shipped_qty, od: od, lineage: lineage, row: row, l: l, pid: pid, declare: declare, held: cur.opening_held_qty });
});
if (!issues.length && cands.length) {
var dec = pmiOpeningDecide_(M.ss, T.pol.rows, cands);
state.opening = { cover: dec.cover, status: dec.status };
var mvS_ = M.ss.getSheetByName('factory_stock_movements'), rcvL_ = mvS_ ? poRcvLinesWithReceipt_(mvS_.getDataRange().getValues()) : {};   // R71 (K1): 13_'s receipt identity, read on every evaluation (the commit's own runs inside the import lock)
cands.forEach(function (c) {
var ch = [], stamp = { entity_table: 'purchase_order_lines', entity_id: c.pid, line_id: c.id };
function cell(k, v, b) { var col = T.pol.col(k); if (col < 0) return; plan.cells.push({ table: 'purchase_order_lines', row: c.l.__r, col: col, value: v, change: Object.assign({ field: k, before: b, after: String(v) }, stamp) }); if (k !== 'updated_at') ch.push({ field: k, before: b, after: String(v) }); }
if (c.declare) { cell('opening_shipped_qty', c.od, ''); prev.impacts.declared_lines++; }
if (dec.status[c.id] === PMI_OPENING_RECONCILED_) { cell('opening_reconcile_status', PMI_OPENING_RECONCILED_, pmiS_(c.l.opening_reconcile_status)); prev.impacts.reconciled_lines++; prev.impacts.released_qty += Number(c.held) || 0; }
else { prev.impacts.still_pending_lines++; warnings.push({ sheet: PMI_L_, row: c.row, code: 'PO_OPENING_STILL_PENDING', message: c.id + ' stays held: ' + PMI_OPENING_REASON_TEXT_[dec.reason[c.id]] + ' (' + dec.reason[c.id] + ')' }); }
var keep_ = rcvL_[c.id] === true;   // R71 (K1, Owner D3): a line with an in-system receipt keeps updated_at - only its opening_* cells are written
if (ch.length && !keep_) cell('updated_at', '$NOW', pmiS_(c.l.updated_at));
prev.rows.push({ sheet: PMI_L_, row: c.row, action: ch.length ? 'update' : 'unchanged', entity: 'purchase_order_lines', id: c.id, changes: ch, opening_reconcile_status: dec.status[c.id], opening_reason: dec.reason[c.id] || '', updated_at_kept: keep_ && ch.length ? true : undefined });
});
}
return { plan: plan, state: state, preview: prev };
}


function pmiValidateUpdate_(M, req, sc, issues, warnings) {
var T = M.T, plan = { mode: 'UPDATE', appends: [], cells: [] }, prev = { counts: { create: 0, update: 0, unchanged: 0, reject: 0 }, rows: [],
impacts: { purchase_orders: { update: 0 }, purchase_order_lines: { update: 0 }, cells: 0, ongoing_change: 0, factory_stock_change: 0, factory_stock_movements: 0, documents: 0, emails: 0, status_transitions: 0 } };
var state = { mode: 'UPDATE', po: {}, pol: {}, wh: {} };
var poBy = {}, polBy = {}, linesOf = {};
T.po.rows.forEach(function (p) { var id = pmiS_(p.purchase_order_id); if (id) (poBy[id] = poBy[id] || []).push(p); });
T.pol.rows.forEach(function (l) { var id = pmiS_(l.purchase_order_line_id); if (id) (polBy[id] = polBy[id] || []).push(l); var pid = pmiS_(l.purchase_order_id); (linesOf[pid] = linesOf[pid] || []).push(l); });
var touched = {}, lineEdits = {}, seenH = {}, seenL = {};
function statusOf(p) { return pmiS_(p.order_status || p.status).toLowerCase(); }
function allowed(pol, st) { return pol === 'ANY' || (pol === 'LIVE' && !{ cancelled: 1, closure: 1 }[st]) || (pol === 'DRAFT' && st === 'draft'); }

function diff(sn, r, cur, st, ctx, onChange) {
var n = 0;
Object.keys(r).forEach(function (k) {
if (k === '__row') return;
var f = pmiField_(sn, k); if (!f || f.update === 'KEY' || f.update === 'VERSION') return;
var c = imbCell_(r, k), curV = sn === PMI_L_ && k === 'po_no' ? ctx.po_no : cur[k], curS = pmiCur_(f, curV);
if (k === 'payment_term_id') { if (!(c.absent || c.blank) && pmiS_(r[k]) !== curS) warnings.push(pmiPaymentTermWarning_(sn, r.__row)); return; }
if (f.update === 'READONLY' || f.update === 'LINK') {
if (c.absent || c.blank) return;
var pr = f.type === 'enum' && f.list === 'order_status' ? { ok: true, cmp: pmiS_(r[k]).toLowerCase() } : pmiParse_(f, r[k], ctx);
var same = pr.ok ? pr.cmp === curS : pmiS_(r[k]) === curS;
if (!same) imbIssue_(issues, sn, r.__row, k, f.refuse || 'PO_FIELD_NOT_UPDATABLE', k + ' is read-only in an Update file (stored: ' + (curS || '(blank)') + ')' +
(k === 'order_status' ? ' - a status changes only through Send PO / Receive / Cancel' : f.kind === 'counter' ? ' - a received / shipped quantity changes only through Receive / Dispatch' : ''), r[k]);
return;
}
var after, afterS;
if (c.clear) { if (!f.clear) { imbIssue_(issues, sn, r.__row, k, 'PO_FIELD_NOT_CLEARABLE', k + ' cannot be cleared'); return; } after = ''; afterS = ''; }
else if (c.blank) { if (curS !== '') imbIssue_(issues, sn, r.__row, k, 'PO_BLANK_IS_NOT_CLEAR', k + ' is blank but holds ' + curS + ' - restore it, or type [CLEAR] to clear it'); return; }
else { var p = pmiParse_(f, r[k], ctx); if (!p.ok) { imbIssue_(issues, sn, r.__row, k, p.code, p.message, r[k]); return; } after = p.value; afterS = p.cmp; }
if (afterS === curS) return;
if (!allowed(f.update, st)) { imbIssue_(issues, sn, r.__row, k, f.update === 'DRAFT' && f.refuse ? f.refuse : 'PO_FIELD_LOCKED_IN_STATE', k + ' can change only ' + (f.update === 'DRAFT' ? 'while the PO is draft' : 'while the PO is not cancelled / closure') + ' (now ' + (st || 'blank') + ')', r[k]); return; }
if (k === 'ordered_qty' && after <= 0) { imbIssue_(issues, sn, r.__row, k, 'PO_QTY_INVALID', 'ordered_qty must be > 0', r[k]); return; }
if (k === 'warehouse_id' || k === 'supplier_warehouse_id') { var fac = pmiFactory_(M, after, { factory: 'ACTIVE' }); state.wh[String(after).toLowerCase()] = M.fmap[String(after).toLowerCase()] || null; if (!fac.ok) { imbIssue_(issues, sn, r.__row, k, fac.code, 'an active factory warehouse (one warehouses row)', after); return; } after = fac.warehouse_id; afterS = after; if (afterS === curS) return; }
onChange(k, curS, after, afterS); n++;
});
return n;
}
function cell(T0, row, key, value, change) { var c = T0.col(key); if (c < 0) return false; plan.cells.push({ table: T0.name, row: row, col: c, value: value, change: change }); return true; }
(req.sheets[PMI_H_] || []).forEach(function (r) {
var row = r.__row, id = pmiS_(r.purchase_order_id), hs = poBy[id] || [];
if (!id) return imbIssue_(issues, PMI_H_, row, 'purchase_order_id', 'PO_ID_REQUIRED', 'Update matches a PO by purchase_order_id only (never by po_no, row or SKU) - Add New creates new POs');
if (!hs.length) return imbIssue_(issues, PMI_H_, row, 'purchase_order_id', 'PO_NOT_FOUND', 'no purchase order ' + id, id);
if (hs.length > 1) return imbIssue_(issues, PMI_H_, row, 'purchase_order_id', 'PO_ID_DUPLICATE_IN_DB', id + ' is on ' + hs.length + ' rows of purchase_orders - fix the data first', id);
if (seenH[id]) return imbIssue_(issues, PMI_H_, row, 'purchase_order_id', 'PO_DUPLICATE_IN_FILE', id + ' is already Header row ' + seenH[id], id);
seenH[id] = row;
var p = hs[0], st = statusOf(p), dg = pmiDigest_(p, T.po.headers); state.po[id] = dg;
if (!pmiInScope_(p, sc)) return imbIssue_(issues, PMI_H_, row, 'purchase_order_id', 'PO_OUT_OF_SCOPE', id + ' is outside this import\'s scope (' + pmiScopeLabel_(sc) + ')', id);
var rv = pmiS_(r.row_version);
if (!rv) return imbIssue_(issues, PMI_H_, row, 'row_version', 'PO_ROW_VERSION_REQUIRED', 'row_version is required - export a new Update file');
if (rv !== dg) return imbIssue_(issues, PMI_H_, row, 'row_version', 'PO_STALE_EXPORT', id + ' changed after this file was exported (a receipt, a shipment, an edit or another import) - export again', rv);
var ch = [], cur = pmiS_(p.currency).toUpperCase();
diff(PMI_H_, r, p, st, { currency: pmiCurrencyDecimals_(cur) === null ? '' : cur, po_no: pmiS_(p.po_no) }, function (k, b, a, as) { ch.push({ field: k, before: b, after: as }); cell(T.po, p.__r, k, a, { entity_table: 'purchase_orders', entity_id: id, field: k, before: b, after: as });
if (k === 'warehouse_id' && T.po.col('factory_id') >= 0) cell(T.po, p.__r, 'factory_id', a, { entity_table: 'purchase_orders', entity_id: id, field: 'factory_id', before: pmiS_(p.factory_id), after: as }); });
if (ch.length) touched[id] = { p: p, row: row };
prev.rows.push({ sheet: PMI_H_, row: row, action: ch.length ? 'update' : 'unchanged', entity: 'purchase_orders', id: id, order_status: st, changes: ch });
});
(req.sheets[PMI_L_] || []).forEach(function (r) {
var row = r.__row, id = pmiS_(r.purchase_order_line_id), ls = polBy[id] || [];
if (!id) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_LINE_ID_REQUIRED', 'Update matches a line by purchase_order_line_id only - a new line is not added to an existing PO by a file');
if (!ls.length) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_LINE_NOT_FOUND', 'no purchase order line ' + id, id);
if (ls.length > 1) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_LINE_ID_DUPLICATE_IN_DB', id + ' is on ' + ls.length + ' rows of purchase_order_lines', id);
if (seenL[id]) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_DUPLICATE_IN_FILE', id + ' is already Lines row ' + seenL[id], id);
seenL[id] = row;
var l = ls[0], pid = pmiS_(l.purchase_order_id), hs = poBy[pid] || [], dg = pmiDigest_(l, T.pol.headers); state.pol[id] = dg;
if (hs.length !== 1) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_LINE_PARENT_UNRESOLVED', 'the line\'s purchase order ' + pid + (hs.length ? ' is on several rows' : ' does not exist') + ' - fix the data first', pid);
var p = hs[0], st = statusOf(p); state.po[pid] = state.po[pid] || pmiDigest_(p, T.po.headers);
if (!pmiInScope_(p, sc)) return imbIssue_(issues, PMI_L_, row, 'purchase_order_line_id', 'PO_OUT_OF_SCOPE', 'its PO ' + pid + ' is outside this import\'s scope', id);
var rv = pmiS_(r.row_version);
if (!rv) return imbIssue_(issues, PMI_L_, row, 'row_version', 'PO_ROW_VERSION_REQUIRED', 'row_version is required - export a new Update file');
if (rv !== dg) return imbIssue_(issues, PMI_L_, row, 'row_version', 'PO_STALE_EXPORT', id + ' changed after this file was exported (a receipt, a shipment, an edit or another import) - export again', rv);
var ch = [], cur = pmiS_(p.currency).toUpperCase(), le = { l: l, ch: {} };
diff(PMI_L_, r, l, st, { currency: pmiCurrencyDecimals_(cur) === null ? '' : cur, po_no: pmiS_(p.po_no) }, function (k, b, a, as) {
ch.push({ field: k, before: b, after: as }); le.ch[k] = { a: a, as: as };
cell(T.pol, l.__r, k, a, { entity_table: 'purchase_order_lines', entity_id: pid, line_id: id, field: k, before: b, after: as }); });
if (ch.length) { lineEdits[id] = le; touched[pid] = touched[pid] || { p: p, row: 0, viaLine: true }; }
prev.rows.push({ sheet: PMI_L_, row: row, action: ch.length ? 'update' : 'unchanged', entity: 'purchase_order_lines', id: id, purchase_order_id: pid, order_status: st, changes: ch });
});

Object.keys(lineEdits).forEach(function (id) {
var le = lineEdits[id], l = le.l, pid = pmiS_(l.purchase_order_id), stamp = { entity_table: 'purchase_order_lines', entity_id: pid, line_id: id };
if (le.ch.ordered_qty || le.ch.unit_cost) {
var q = le.ch.ordered_qty ? le.ch.ordered_qty.a : (parseFloat(l.ordered_qty) || 0), upc = parseFloat(l.units_per_carton) || 0;
var ucS = le.ch.unit_cost ? le.ch.unit_cost.as : pmiCanonMoney_(l.unit_cost), carton = upc > 0 ? Math.ceil(q / upc) : 0;
var la = ucS ? Number(pmiUnscale_(pmiDigMul_(String(q), pmiScaled_(ucS, 4)), 4, 2)) : '';
var rem = Math.max(0, (parseFloat(l.completed_qty) || 0) - (parseFloat(l.shipped_qty) || 0));
var split = procurementCompanyQty_(l.company, q), d = { carton_qty: carton, line_amount: la, remaining_qty: rem, km_qty: split.km_qty, resus_qty: split.resus_qty, restw_qty: split.restw_qty };
Object.keys(d).forEach(function (k) { var b = pmiS_(l[k]); if (String(d[k]) !== b) cell(T.pol, l.__r, k, d[k], Object.assign({ field: k, before: b, after: String(d[k]) }, stamp)); });
le.q = q; le.carton = carton; le.uc = ucS;
}
cell(T.pol, l.__r, 'updated_at', '$NOW', Object.assign({ field: 'updated_at', before: pmiS_(l.updated_at), after: '$NOW' }, stamp));
});
var hpc6_ = {};   // R71 small-6: one read of the receipt books for every touched PO
Object.keys(touched).forEach(function (pid) {
var t = touched[pid], p = t.p, all = linesOf[pid] || [], dq = 0, dc = 0, sk = {}, amt = '0', priced = false, recalc = false;
var blk6_ = poRcvHeaderWriteBlock_(M.ss, pid, p.updated_at, hpc6_);   // R71 small-6: an Update file never washes out a pending receipt
if (blk6_) { imbIssue_(issues, PMI_H_, t.row || 0, 'purchase_order_id', blk6_.code, blk6_.error, pid); return; }
all.forEach(function (l) {
var le = lineEdits[pmiS_(l.purchase_order_line_id)], q = le && le.q !== undefined ? le.q : (parseFloat(l.ordered_qty) || 0);
var c = le && le.carton !== undefined ? le.carton : (parseFloat(l.carton_qty) || 0), uc = le && le.uc !== undefined ? le.uc : pmiCanonMoney_(l.unit_cost);
if (le && le.q !== undefined) recalc = true;
dq += q; dc += c; if (pmiS_(l.sku)) sk[pmiS_(l.sku).toLowerCase()] = 1;
if (uc && uc.charAt(0) !== '-') { priced = true; amt = pmiDigAdd_(amt, pmiDigMul_(String(q), pmiScaled_(uc, 4))); }
});
var stamp = { entity_table: 'purchase_orders', entity_id: pid };
if (recalc) {
var tot = priced && amt !== '0' ? Number(pmiUnscale_(amt, 4, 2)) : '', d = { total_sku: Object.keys(sk).length, total_qty: dq, total_cartons: dc, total_amount: tot, subtotal_amount: tot };
Object.keys(d).forEach(function (k) { var b = pmiCur_({ type: k === 'total_amount' || k === 'subtotal_amount' ? 'money' : 'int' }, p[k]); if (String(d[k]) !== b) cell(T.po, p.__r, k, d[k], Object.assign({ field: k, before: b, after: String(d[k]) }, stamp)); });
}
if (t.viaLine && !t.row && !recalc) return;
cell(T.po, p.__r, 'updated_by', '$ACTOR', Object.assign({ field: 'updated_by', before: pmiS_(p.updated_by), after: '$ACTOR' }, stamp));
cell(T.po, p.__r, 'updated_at', '$NOW', Object.assign({ field: 'updated_at', before: pmiS_(p.updated_at), after: '$NOW' }, stamp));
});

Object.keys(touched).forEach(function (pid) { (linesOf[pid] || []).forEach(function (l) { state.pol[pmiS_(l.purchase_order_line_id)] = pmiDigest_(l, T.pol.headers); }); });
prev.rows.forEach(function (r) { if (r.action === 'update') { prev.counts.update++; prev.impacts[r.entity].update++; } else prev.counts.unchanged++; });
prev.impacts.cells = plan.cells.length;
return { plan: plan, state: state, preview: prev };
}




function pmiApply_(ss, plan, ctx) {
var J = ctx.journal, sheets = {}, created = { purchase_orders: 0, purchase_order_lines: 0 }, ids = [], n = 0;
function sh(name) { if (!sheets[name]) { var s = ss.getSheetByName(name); if (!s) throw new Error('PO_MASTER_UNREADABLE ' + name); var h = s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(function (x) { return String(x).trim(); }); sheets[name] = { s: s, h: h }; } return sheets[name]; }
function tok(v) { return v === '$NOW' ? ctx.now : v === '$ACTOR' ? ctx.actor : v; }
(plan.appends || []).forEach(function (a) {
var S = sh(a.table), obj = {};
Object.keys(a.obj).forEach(function (k) { obj[k] = tok(a.obj[k]); });
var miss = Object.keys(obj).filter(function (k) { return S.h.indexOf(k) < 0 && obj[k] !== '' && obj[k] !== null; });
if (miss.length) throw new Error('PO_IMPORT_SCHEMA_COLUMN_MISSING ' + a.table + ': ' + miss.join(', '));
J.appendRow(S.s, S.h, obj); created[a.table]++; n++;
if (a.table === 'purchase_orders') ids.push(a.id);
Object.keys(obj).forEach(function (k) { if (obj[k] === '' || obj[k] === null || obj[k] === undefined) return; J.change({ entity_table: a.table, entity_id: a.id, line_id: a.line_id || '', field: k, before: '', after: obj[k], result: 'CREATED' }); });
});
var upd = {};
(plan.cells || []).forEach(function (c) {
var S = sh(c.table), v = tok(c.value);
J.setCell(S.s, c.row, c.col, v); n++;
var ch = Object.assign({}, c.change); ch.after = tok(ch.after); J.change(ch);
upd[c.table + '|' + (c.change.line_id || c.change.entity_id)] = 1;
});
SpreadsheetApp.flush();
return { result: { mode: plan.mode, purchase_orders_created: created.purchase_orders, purchase_order_lines_created: created.purchase_order_lines, purchase_order_ids: ids,
rows_updated: Object.keys(upd).length, cells_written: (plan.cells || []).length, factory_stock_movements: 0, documents: 0, emails: 0, status_transitions: 0, writer: PMI_BUILD_VERSION_ } };
}


function pmiDictionary_() {
return { schema_version: PMI_SCHEMA_VERSION_, build: PMI_BUILD_VERSION_, sheets: [PMI_H_, PMI_L_], modes: ['ADD_NEW', 'UPDATE', PMI_RECONCILE_], source_type: PMI_SOURCE_TYPE_,
opening: { columns: PMI_OPENING_COLUMNS_, statuses: [PMI_OPENING_PENDING_, PMI_OPENING_RECONCILED_], reasons: PMI_OPENING_REASON_TEXT_, reconcile_columns: PMI_REC_COLS_.map(function (c) { return { key: c[0], kind: c[1] }; }),
hold: '32_ slaOpeningHold_: a line with opening_completed_qty > 0 whose status is not RECONCILED holds opening_completed_qty - opening_lineage_qty out of shipment FIFO (an unknown status is held)' },
new_columns: PMI_NEW_COLUMNS_, payment_status: PMI_PAYMENT_STATUS_, statuses: PMI_STATUSES_, aliases: PMI_ALIASES_, not_a_status: PMI_NOT_A_STATUS_,
fields: PMI_FIELDS_, named_refusals: PMI_NAMED_REFUSALS_, scope_keys: PMI_SCOPE_KEYS_,
lists: { companies: 'RO_COMPANIES_ (13_) - exact spelling; status from marketplace_skus registration', factories: 'warehouses with is_factory_warehouse (13_ procurementFactoryMap_ / procurementResolveWarehouseIn_); inactive = history only',
skus: 'sku_details', suppliers: 'supplier_price_list (supplier_id, supplier_name, is_active) when present', currencies: 'PRICING_FX_DECIMALS_ (73_) - the frozen supported-currency list',
payment_status: 'PMI_PAYMENT_STATUS_ (= the PO page list)', payment_terms: 'NONE - no master exists', order_status: 'PMI_STATUSES_' },
inactive_policy: 'factory / supplier: an inactive row is accepted only for a completed, cancelled or closure PO (a historical reference); a draft or open PO needs an active one (it can still receive)' };
}

function imbPoDomain_() {
return { domain: 'purchase_order', schema_version: PMI_SCHEMA_VERSION_, modes: ['ADD_NEW', 'UPDATE', PMI_RECONCILE_], sheets: [PMI_H_, PMI_L_], maxRows: 2000,
template: pmiTemplate_, validate: pmiValidate_, apply: pmiApply_, dictionary: pmiDictionary_ };
}
