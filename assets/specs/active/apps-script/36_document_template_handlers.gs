



























var DOCUMENT_TEMPLATES_HEADERS_ = [
'template_id', 'template_key', 'template_name', 'document_type', 'related_entity_type', 'document_category', 'document_usage',
'series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language',
'template_file_type', 'template_file_id', 'template_drive_url', 'output_folder_id', 'file_name_rule',
'template_version', 'status', 'is_active', 'effective_from', 'effective_to', 'remark',
'created_by', 'created_at', 'updated_by', 'updated_at'
];
var DOCUMENT_TEMPLATE_FIELDS_HEADERS_ = [
'field_id', 'template_id', 'template_key', 'document_type', 'placeholder', 'field_label', 'field_type', 'data_scope',
'data_source_table', 'data_source_field', 'data_source_path', 'collection_key', 'sort_order', 'required',
'default_value', 'format_rule', 'transform_rule', 'fallback_rule', 'example_value', 'is_active', 'note', 'created_at', 'updated_at'
];
var GENERATED_DOCUMENTS_HEADERS_ = [
'document_id', 'template_id', 'template_key', 'template_version', 'related_entity_type', 'related_entity_id', 'document_type',
'series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language',
'file_name', 'file_id', 'file_url', 'pdf_file_id', 'pdf_file_url', 'output_folder_id',
'generated_by', 'generated_at', 'status', 'email_status', 'email_sent_at', 'regenerated_from_document_id', 'note', 'created_at', 'updated_at'
];



var DOC_TYPE_ENUM_ = { SHIPDETAIL: 'shipment_detail', PL: 'packing_list', CI: 'commercial_invoice' };

var DT_SCOPE_DIMS_ = ['series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language'];



function dtStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function dtLc_(v) { return dtStr_(v).toLowerCase(); }
function dtUc_(v) { return dtStr_(v).toUpperCase(); }
function dtNum_(v) { if (v === null || v === undefined || v === '') return 0; var n = Number(String(v).replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; }
function dtBool_(v) { if (v === true) return true; var s = dtLc_(v); return s === 'true' || s === 'yes' || s === 'y' || s === '1'; }
function dtInWindow_(row, asOf) {
var q = dtStr_(asOf); if (!q) return true;
var from = dtStr_(row.effective_from), to = dtStr_(row.effective_to);
if (from && from > q) return false;
if (to && to < q) return false;
return true;
}

function dtTemplateActive_(row, asOf) { return dtLc_(row.status) === 'active' && dtBool_(row.is_active) && dtInWindow_(row, asOf); }

function dtScopeMatch_(row, req) {
for (var i = 0; i < ['series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language'].length; i++) {
var dim = ['series', 'sku', 'supplier_id', 'factory_id', 'carrier_id', 'country', 'marketplace', 'language'][i];
var tv = dtStr_(row[dim]); if (!tv) continue;
if (dtLc_(tv) !== dtLc_(req[dim])) return false;
}
return true;
}

function dtResolveTemplate_(templateRows, req) {
var dt = dtLc_(req.document_type);
var cand = (templateRows || []).filter(function (r) { return dtLc_(r.document_type) === dt && dtTemplateActive_(r, req.asOf) && dtScopeMatch_(r, req); });
if (cand.length === 0) return { ok: false, error: 'DOCUMENT_TEMPLATE_NOT_CONFIGURED' };
if (cand.length > 1) return { ok: false, error: 'DOCUMENT_TEMPLATE_AMBIGUOUS', count: cand.length };
return { ok: true, template: cand[0] };
}

function dtResolvePath_(root, path) {
var p = dtStr_(path); if (!p) return '';
var cur = root, parts = p.split('.');
for (var i = 0; i < parts.length; i++) { if (cur === null || cur === undefined) return ''; cur = cur[parts[i]]; }
return (cur === null || cur === undefined) ? '' : cur;
}



var DT_PATH_RE_ = /^[A-Za-z_]\w*(\.\w+)*$/, DT_FALLBACK_LITERALS_ = ['0', '\u5426', 'USD', 'China', 'Kitchen Mama'];






var DT_SRC_ = { 'tax_referral_rates.vat_no': 'l:vat_no', 'tax_referral_rates.eori_no': 'l:eori_no', 'pricing_list.regular_price': 'l:regular_price', 'pricing_list.auto_regular_price': 'l:regular_price', 'pricing_list.currency': 'l:regular_price_currency',
'shipments.external_shipment_id': 'h:external_shipment_id', 'shipments.reference_id': 'h:reference_id', 'shipments.etd': 'h:etd', 'shipments.eta': 'h:eta',
'shipments.country': 'h:country', 'shipments.marketplace': 'h:marketplace', 'shipments.warehouse_code': 'h:warehouse_code', 'shipments.invoice_no': 'h:invoice_no',
'shipments.shipment_total_qty': 'h:totals.qty', 'shipments.shipment_total_cartons': 'h:totals.cartons', 'shipments.shipment_total_gross_weight': 'h:totals.gross_weight',
'shipments.shipment_total_net_weight': 'h:totals.net_weight', 'shipments.shipment_total_cbm': 'h:totals.cbm', 'carriers.carrier_name': 'h:carrier_name',
'shipment_lines.sku': 'l:sku', 'shipment_lines.shipment_qty': 'l:shipment_qty', 'shipment_lines.shipment_carton_qty': 'l:carton_qty', 'shipment_lines.carton_qty': 'l:carton_qty',
'shipment_lines.gross_weight': 'l:gross_weight', 'shipment_lines.net_weight': 'l:net_weight', 'shipment_lines.shipment_carton_cbm': 'l:cbm', 'shipment_lines.carton_cbm': 'l:cbm',
'shipment_lines.units_per_carton': 'l:units_per_carton', 'sku_details.product_name': 'l:product_name_en', 'sku_details.product_name_cn': 'l:product_name_cn',
'sku_details.carton_length': 'l:carton_length', 'sku_details.carton_width': 'l:carton_width', 'sku_details.carton_height': 'l:carton_height',
'sku_details.material': 'l:material', 'sku_details.product_use': 'l:product_use', 'sku_details.battery_type': 'l:battery_type', 'sku_details.magnet_type': 'l:magnet_type',
'tax_referral_rates.hscode': 'l:hs_code', 'tax_referral_rates.declared_value': 'l:declared_unit_value', 'tax_referral_rates.declared_currency': 'l:declared_currency',
'shipment_lines.carton_no_start,carton_no_end': 'l:carton_no_start', 'shipment_line_allocations.allocated_qty': 'l:allocated_qty', 'purchase_orders.po_no': 'l:po_no',
'tax_referral_rates.country_of_origin': 'l:country_of_origin', 'logistics_locations.location_name': 'h:consignee.name', 'logistics_locations.address': 'h:consignee_address',
'logistics_locations.city': 'h:consignee.address.city', 'logistics_locations.state_or_region': 'h:consignee.address.state_or_region', 'logistics_locations.postal_code': 'h:consignee.address.postal_code', 'logistics_locations.country': 'h:consignee.address.country',
'warehouses.warehouse_name': 'h:consignee.name', 'warehouses.contact_name': 'h:consignee.name', 'warehouses.address': 'h:consignee_address',
'warehouses.city': 'h:consignee.address.city', 'warehouses.state': 'h:consignee.address.state_or_region',
'warehouses.postal_code': 'h:consignee.address.postal_code', 'warehouses.country': 'h:consignee.address.country',
'shipments.shipping_method_label': 'h:shipping_method_label',
'carrier_rate_cards.shipping_method_label': 'h:shipping_method_label', 'shipments.shipments_customs_type': 'h:shipments_customs_type',
'sku_details.carton_weight': 'l:carton_weight', 'sku_details.package_weight': 'l:package_weight', 'sku_regional_details.product_url': 'l:product_url',
'sku_regional_details.marketplace_product_id': 'l:marketplace_product_id', 'shipments.destination': 'h:ship_to',
'warehouses.contact_phone': 'h:consignee_contact_phone', 'warehouses.contact_email': 'h:consignee_contact_email' };
var DT_DB12_ = ['material', 'product_use', 'battery_type', 'magnet_type'];

var DT_MASTER_ = { 'sku_details.carton_weight': ['sku_master_ref', 'carton_weight', 'kg'], 'sku_details.package_weight': ['sku_master_ref', 'package_weight', 'kg'],
'sku_regional_details.product_url': ['regional_ref', 'product_url', 'url'], 'sku_regional_details.marketplace_product_id': ['regional_ref', 'marketplace_product_id', 'id'],
'warehouses.contact_phone': ['consignee_contact_ref', 'consignee_contact_phone', 'phone'], 'warehouses.contact_email': ['consignee_contact_ref', 'consignee_contact_email', 'email'] };
var DT_BLANK_WARN_ = ['warehouses.contact_phone', 'warehouses.contact_email'];

function dtMasterIssues_(ls, src, no) {
var m = DT_MASTER_[src], o = { un: [], inv: [], miss: [] };
ls.forEach(function (l, i) {
var n = no ? no(l, i) : i + 1, ref = m[0] in l ? dtStr_(l[m[0]]) : null, q = (ref || '').split(';'), own = q.filter(function (x) { return x.indexOf(m[1] + '=') === 0; })[0], v = dtStr_(l[m[1]]), x;
if (ref === null || !(m[1] in l)) return o.un.push(n + ' NOT_FROZEN');
var sameSkuUrl = src === 'sku_regional_details.product_url' && q.some(function (p) { return /^product_url_source=SAME_SKU:/.test(p); });
if (!/^UNIQUE(:|$)/.test(q[0]) && !sameSkuUrl) return o.un.push(n + ' ' + (q[0] || 'NOT_FROZEN'));
if (own) return o.un.push(n + ' ' + own.slice(m[1].length + 1));
if (v === '') return o.miss.push(n);
x = Number(v.replace(/,/g, ''));
if (m[2] === 'kg' && !(isFinite(x) && x > 0)) o.inv.push(n + ' ' + (x === 0 ? 'ZERO' : 'NOT_A_POSITIVE_NUMBER'));
if (m[2] === 'url' && !/^https?:\/\/[^\s]+$/i.test(v)) o.inv.push(n + ' NOT_A_URL');
if (m[2] === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) o.inv.push(n + ' NOT_AN_EMAIL');
});
return o;
}
function dtMasterBad_(o, src, required) {
return (o.un.length ? ['DOCUMENT_SOURCE_UNRESOLVED:' + src + ' (line ' + o.un.join(', ') + ')'] : []).concat(o.inv.length ? ['DOCUMENT_FIELD_VALUE_INVALID:' + src + ' (line ' + o.inv.join(', ') + ')'] : [],
required && o.miss.length ? ['DOCUMENT_FIELD_VALUE_MISSING:' + src + ' (line ' + o.miss.join(', ') + ')'] : []);
}



function dtExpandAllocations_(lines, missing, key) {
var out = [];
lines.forEach(function (l, i) {
var a = l.po_allocations || [], t = 0;
if (!a.length) out.push(Object.assign({}, l, { po_no: '', allocated_qty: l.shipment_qty, __line: i, __span: 1 }));
a.forEach(function (x) { t += Number(x.allocated_qty); out.push(Object.assign({}, l, { po_no: x.po_no, allocated_qty: x.allocated_qty, __line: i, __span: a.length })); });
if (a.length && t !== Number(l.shipment_qty)) missing.push({ placeholder: key, problems: ['DOCUMENT_ALLOCATION_QTY_MISMATCH:' + dtStr_(l.sku)] });
});
return out;
}



function dtSrc_(m, ctx, hdr, join, bad, src) {
var k = m.slice(2), at = m[0] === 'h' ? (hdr || ctx.header || {}) : ctx.header ? null : ctx, ls = at ? [at] : ctx.lines || [], vs = [], raw = [], gone = 0, blank = 0;
ls.forEach(function (l) {
if (!dtHasPath_(l, k)) { gone++; return; }
var x = dtResolvePath_(l, k), v = dtStr_(x);
if (v === '') blank++; else if (vs.indexOf(v) < 0) { vs.push(v); raw.push(x); }
});
if (gone) { bad.push('DOCUMENT_SOURCE_NOT_FROZEN:' + src); return ''; }
var vx = /^tax_referral_rates\.(vat_no|eori_no)$/.test(src), un = vx ? ls.map(function (l, i) { return dtStr_(l.tax_match) === 'RESOLVED' ? '' : (i + 1) + ' ' + (dtStr_(l.tax_match) || 'NOT_FROZEN'); }).filter(Boolean) : [];
if (un.length) { bad.push('DOCUMENT_SOURCE_UNRESOLVED:' + src + ' (line ' + un.join(', ') + ')'); return ''; }
if (at) return dtResolvePath_(at, k);
if (blank && vs.length && !vx) bad.push('DOCUMENT_SOURCE_PARTIAL_BLANK:' + src);
if (vs.length > 1 && !join) bad.push('DOCUMENT_SOURCE_NOT_SINGLE:' + src);
return vs.length === 1 ? raw[0] : vs.join('; ');
}
function dtHasPath_(o, p) { return p.split('.').every(function (k) { var h = !!o && typeof o === 'object' && k in o; o = h ? o[k] : null; return h; }); }

var KM_BATTERY_NONE_ = ['no_battery', 'no battery'], KM_BATTERY_ALIAS_ = { aaa: 'alkaline_battery' }, KM_BATTERY_KNOWN_ = ['alkaline_battery', 'lithium_battery', 'rechargeable_lithium'];
function kmBatteryKind_(x) {
if (typeof x !== 'string') return null;
var s = x.trim().toLowerCase().replace(/\s+/g, ' ');
if (!s) return null;
if (KM_BATTERY_NONE_.indexOf(s) >= 0) return 'no_battery';
if (Object.prototype.hasOwnProperty.call(KM_BATTERY_ALIAS_, s)) return KM_BATTERY_ALIAS_[s];
return KM_BATTERY_KNOWN_.indexOf(s) >= 0 ? s : null;
}
function dtBatteryZh_(x) { return typeof x !== 'string' || !x.trim() ? null : kmBatteryKind_(x) === 'no_battery' ? '否' : '是'; }
function dtMagnetZh_(x) { var b = skuMagnetToBool_(x); return b === true ? '是' : b === false ? '否' : null; }
function dtApplyTransform_(v, rule, bad, ctx, hdr) {
dtStr_(rule).split(';').forEach(function (x) {
var r = dtLc_(x), d;
if (r === 'upper') v = dtUc_(v); else if (r === 'lower') v = dtLc_(v);
else if (r === 'date_only') { d = dgsDateOnly_(v); if (d === null) { if (bad) bad.push('DOCUMENT_FIELD_VALUE_INVALID'); } else if (d) v = d; }
else if (r === 'multiply_qty_declared_value' || r === 'sum_collection_amount') {
d = (r[0] === 'm' ? [ctx || {}] : (ctx && ctx.lines) || []).reduce(function (t, l) { var q = dtStr_(l.shipment_qty), u = dtStr_(l.declared_unit_value); return q === '' || u === '' ? NaN : t + Number(q) * Number(u); }, 0);
if (isFinite(d)) v = Math.round(d * 100) / 100; else if (bad) bad.push('DOCUMENT_FIELD_VALUE_INVALID');
} else if (r === 'country_to_iso2') { if (/^[A-Za-z]{2}$/.test(dtStr_(v))) v = dtUc_(v); else if (dtStr_(v) && bad) bad.push('DOCUMENT_FIELD_VALUE_INVALID'); }
else if (r === 'row_number') { if (ctx && ctx.__row) v = ctx.__row; else if (bad) bad.push('DOCUMENT_FIELD_VALUE_INVALID'); }
else if (r === 'carton_range' || r === 'carton_range_spaced' || r === 'carton_range_compact') {
d = ctx && 'carton_no_end' in ctx ? dtStr_(ctx.carton_no_end) : null;
if (d === null) { if (bad) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:shipment_lines.carton_no_end'); v = ''; }
else if ((!dtStr_(v) && d) || (dtStr_(v) && !/^[1-9]\d*$/.test(dtStr_(v))) || (d && (!/^[1-9]\d*$/.test(d) || Number(d) < Number(dtStr_(v))))) { if (bad) bad.push('DOCUMENT_FIELD_VALUE_INVALID'); v = ''; }
else v = dtStr_(v) && d && d !== dtStr_(v) ? dtStr_(v) + ' - ' + d : dtStr_(v);
} else if (/^(any_)?(battery|magnet)_to_zh$/.test(r)) {
var bm = /battery/.test(r), col = bm ? 'battery_type' : 'magnet_type', ls = r.charAt(0) === 'a' ? ((ctx && ctx.lines) || [ctx || {}]) : [null];
d = ls.map(function (l, i) { var x = l ? l[col] : v; return (bm ? dtBatteryZh_(x) : dtMagnetZh_(x)) === null ? (l ? i + 1 : (ctx && ctx.__row) || 1) : 0; }).filter(Boolean);
if (d.length) { if (bad) bad.push('DOCUMENT_FIELD_VALUE_UNRECOGNIZED:' + col + ' (line ' + d.join(', ') + ')'); v = ''; }
else v = ls.some(function (l) { return (bm ? dtBatteryZh_ : dtMagnetZh_)(l ? l[col] : v) === '是'; }) ? '是' : '否';
} else if (r === 'append_export_sequence_01') { if (dtStr_(v)) v = dtStr_(v) + '-01'; }
else if (r === 'customs_tax_refund_to_zh') {
d = dtLc_(v); v = d === 'tax_refund_customs' ? '是' : d === 'formal_customs' || d === 'third_party_customs' ? '否' : (bad && bad.push('DOCUMENT_FIELD_VALUE_UNRECOGNIZED:shipments_customs_type'), '');
} else if (r === 'carton_reference_format') {
var H = hdr || (ctx && ctx.header) || {}, c0 = ctx && 'carton_no_start' in ctx ? dtStr_(ctx.carton_no_start) : null, c1 = ctx && 'carton_no_end' in ctx ? dtStr_(ctx.carton_no_end) : null, ok = function (n) { return /^[1-9]\d*$/.test(n) && Number(n) <= 9007199254740991; };
if (!('external_shipment_id' in H)) { if (bad) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:shipments.external_shipment_id'); v = ''; }
else if (c0 === null || c1 === null) { if (bad) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:shipment_lines.carton_no_start,carton_no_end'); v = ''; }
else if (!dtStr_(H.external_shipment_id)) { if (bad) bad.push('DOCUMENT_FIELD_VALUE_MISSING:shipments.external_shipment_id'); v = ''; }
else if (!ok(c0) || !ok(c1) || Number(c1) < Number(c0)) { if (bad) bad.push('DOCUMENT_FIELD_VALUE_INVALID:carton_no_start,carton_no_end'); v = ''; }
else v = dtStr_(H.external_shipment_id) + 'U' + ('000000' + c0).slice(-Math.max(6, c0.length)) + '-' + c1;
} else if (r === 'current_marketplace_price') {
d = ctx && 'regular_price_ref' in ctx ? dtStr_(ctx.regular_price_ref) : null;
if (d === null) { if (bad) bad.push('DOCUMENT_SOURCE_NOT_FROZEN:pricing_list.regular_price'); v = ''; }
else if (!/:(OVERRIDE|AUTO)$/.test(d)) { if (bad) bad.push('DOCUMENT_SOURCE_UNRESOLVED:pricing_list.regular_price (' + d + ')'); v = ''; }
} else if (r === 'customs_type_label') { d = customsTypeLabel_(v); if (dtStr_(v) && !d && bad) bad.push('DOCUMENT_FIELD_VALUE_UNRECOGNIZED:shipments_customs_type'); v = d; } else if (r === 'merge_by_shipment_line') { if (ctx && ctx.__span > 1 && bad) bad.push('DOCUMENT_MERGE_NOT_IMPLEMENTED'); }
else if (r === 'latest_effective_row' || r === 'distinct_join_semicolon' || r === 'exact_regional_match') { }
else if (r && bad) bad.push('DOCUMENT_TRANSFORM_UNSUPPORTED:' + r);
});
return v;
}
function dtApplyFormat_(v, rule, bad, num) {
var r = dtLc_(rule), s = dtStr_(v), m, n; if (!r || r === 'text') return v;
if (r === 'country_to_iso2') return dtApplyTransform_(v, r, bad, {});
if (r === 'number' || r === 'currency') return dtNum_(v);
if ((m = /^#,##0(\.0+)?$/.exec(r))) {
n = Number(s.replace(/,/g, '')); if (!s) return v;
if (!isFinite(n)) { if (bad) bad.push('DOCUMENT_FIELD_VALUE_INVALID'); return v; }
n = n.toFixed(m[1] ? m[1].length - 1 : 0);
return num ? Number(n) : n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
if (r === 'yyyy-mm-dd' || r === 'dd.mm.yyyy') {
m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(dgsDateOnly_(v)); if (!m) { if (s && bad) bad.push('DOCUMENT_FIELD_VALUE_INVALID'); return v; }
return r[0] === 'y' ? m[0] : m[3] + '.' + m[2] + '.' + m[1];
}
if (bad) bad.push('DOCUMENT_FORMAT_UNSUPPORTED:' + r);
return v;
}

function dtResolveField_(field, ctx, num, hdr) {
var bad = [], warn = [], blankOk = false, p = dtStr_(field.data_source_path), fb = dtStr_(field.fallback_rule);
var tb = dtLc_(field.data_source_table), src = tb + '.' + dtLc_(field.data_source_field), sm = DT_SRC_[src], raw = '';
if (sm) raw = dtSrc_(sm, ctx, hdr, /distinct_join_semicolon|any_(battery|magnet)_to_zh/.test(dtLc_(field.transform_rule)), bad, src);
else if (tb && tb !== '-' && tb !== '.') bad.push('DOCUMENT_SOURCE_NOT_IN_MODEL:' + src);
else if (/^(constant|formula|system)$/.test(dtLc_(field.field_type))) { }
else if (p && !DT_PATH_RE_.test(p)) bad.push('DOCUMENT_SOURCE_PATH_UNSUPPORTED');
else raw = p ? dtResolvePath_(ctx, p) : dtResolvePath_(ctx, field.data_source_field);
if (sm && DT_MASTER_[src] && bad.indexOf('DOCUMENT_SOURCE_NOT_FROZEN:' + src) < 0) {
var mo = dtMasterIssues_(sm[0] === 'h' ? [hdr || ctx.header || ctx] : ctx.header ? (ctx.lines || []) : [ctx], src, function (l, i) { return l.__row || i + 1; });
if (DT_BLANK_WARN_.indexOf(src) >= 0 && mo.miss.length) { warn.push('DOCUMENT_FIELD_BLANK_ALLOWED:' + src); mo.miss = []; blankOk = true; }
var mb = dtMasterBad_(mo, src, dtBool_(field.required));
if (mb.length) { bad.push.apply(bad, mb); raw = ''; blankOk = false; }
}
var present = !(raw === '' || raw === null || raw === undefined), lit = !(sm && dtBool_(field.required));
if (!present) {

if (fb) { if (DT_FALLBACK_LITERALS_.indexOf(fb) >= 0) { if (lit) raw = fb; } else if (DT_PATH_RE_.test(fb) && dtHasPath_(ctx, fb)) raw = dtResolvePath_(ctx, fb); else bad.push(DT_PATH_RE_.test(fb) ? 'DOCUMENT_FALLBACK_PATH_UNRESOLVED' : 'DOCUMENT_FALLBACK_UNSUPPORTED'); }
else if (lit && dtStr_(field.default_value)) raw = field.default_value;
}
raw = dtApplyTransform_(raw, field.transform_rule, bad, ctx, hdr);
var has = !(raw === '' || raw === null || raw === undefined);
raw = dtApplyFormat_(raw, field.format_rule, bad, num);
return { value: raw, present: has || blankOk || (lit && dtStr_(field.default_value) !== ''), bad: bad, warn: warn };
}



function dtCartonOrder_(lines) {
return (lines || []).map(function (row, index) {
var text = dtStr_(row.carton_no_start), start = /^\d+$/.test(text) ? Number(text) : NaN;
return { row: row, index: index, start: start > 0 && start <= 9007199254740991 ? start : Infinity };
}).sort(function (a, b) { return a.start === b.start ? a.index - b.index : a.start - b.start; })
.map(function (item) { return item.row; });
}

function dtMapPlaceholders_(model, fieldRows, num) {
var fields = (fieldRows || []).filter(function (f) { return dtBool_(f.is_active) || dtStr_(f.is_active) === ''; })
.slice().sort(function (a, b) { return dtNum_(a.sort_order) - dtNum_(b.sort_order); });
var values = {}, missing = [], warnings = [], orderedLines = dtCartonOrder_(model.lines);
function collectionRows(scope) {
if (dtLc_(scope) === 'line') return orderedLines.slice();
if (dtLc_(scope) === 'allocation') {
var out = []; orderedLines.forEach(function (l) { (l.po_allocations || []).forEach(function (a) { out.push({ sku: l.sku, po_no: a.po_no, allocated_qty: a.allocated_qty, purchase_order_line_id: a.purchase_order_line_id }); }); }); return out;
}
return [];
}

var keys = {}; fields.forEach(function (f) { if (dtLc_(f.field_type) === 'collection') keys[dtStr_(f.collection_key)] = 1; });
function line(f) { return dtLc_(f.field_type) !== 'collection' && (dtLc_(f.field_type) === 'collection_item' || dtLc_(f.data_scope) === 'line' || dtStr_(f.collection_key) !== ''); }
fields.forEach(function (f) {
var ftype = dtLc_(f.field_type);
if (line(f)) { if (!keys[dtStr_(f.collection_key)]) missing.push({ placeholder: dtStr_(f.placeholder), problems: ['DOCUMENT_COLLECTION_UNDEFINED:' + dtStr_(f.collection_key)] }); return; }
if (ftype === 'collection') {
var rows = /expand_allocations/.test(dtLc_(f.transform_rule)) ? dtExpandAllocations_(orderedLines, missing, dtStr_(f.placeholder)) : collectionRows(f.data_scope);
var children = fields.filter(function (c) { return line(c) && dtStr_(c.collection_key) === dtStr_(f.collection_key); });
values[dtStr_(f.placeholder)] = rows.map(function (item, i) {
var row = {}; item = Object.assign({}, item, { __row: i + 1 });
children.forEach(function (c) {
var r = dtResolveField_(c, item, num, model.header);
row[dtStr_(c.placeholder)] = r.value;
if (r.bad.length) missing.push({ placeholder: dtStr_(c.placeholder), collection_key: dtStr_(f.collection_key), problems: r.bad, line: i + 1, sku: dtStr_(item.sku) });
(r.warn || []).forEach(function (w) { warnings.push({ placeholder: dtStr_(c.placeholder), collection_key: dtStr_(f.collection_key), warning: w, line: i + 1 }); });
if (dtBool_(c.required) && !r.present) missing.push({ placeholder: dtStr_(c.placeholder), collection_key: dtStr_(f.collection_key), data_source_field: dtStr_(c.data_source_field), data_source_path: dtStr_(c.data_source_path), line: i + 1, sku: dtStr_(item.sku) });
});
return row;
});
return;
}
var res = dtResolveField_(f, model, num);
values[dtStr_(f.placeholder)] = res.value;
if (res.bad.length) missing.push({ placeholder: dtStr_(f.placeholder), problems: res.bad });
(res.warn || []).forEach(function (w) { warnings.push({ placeholder: dtStr_(f.placeholder), warning: w }); });
if (dtBool_(f.required) && !res.present) missing.push({ placeholder: dtStr_(f.placeholder), data_source_field: dtStr_(f.data_source_field), data_source_path: dtStr_(f.data_source_path) });
});
return { values: values, missing: missing, warnings: warnings };
}

function dtGeneratedKey_(relatedEntityId, documentTypeEnum, templateId, templateVersion) {
return dtStr_(relatedEntityId) + '|' + dtLc_(documentTypeEnum) + '|' + dtStr_(templateId) + '|' + dtNum_(templateVersion);
}



// Carrier R2: interpret only the confirmed legacy mapping shapes; never rewrite registry rows.
function dtNormalizeCarrierFieldsR2_(rows) {
var totals = { TOTAL_QTY: 'shipment_total_qty', TOTAL_CARTONS: 'shipment_total_cartons', TOTAL_NET_WEIGHT: 'shipment_total_net_weight', TOTAL_GROSS_WEIGHT: 'shipment_total_gross_weight', TOTAL_CBM: 'shipment_total_cbm' };
var tabs = { '\u901a\u7528\u767c\u7968\u5c0e\u5165\u6a21\u7248': 'CARRIER_INVOICE_LINES', '\u88dd\u7bb1\u55ae\u767c\u7968\u901a\u7528\u6a21\u677f': 'CARRIER_PACKING_LINES' };
return (rows || []).map(function (row) {
var f = Object.assign({}, row), p = dtStr_(f.placeholder), src = dtLc_(f.data_source_table) + '.' + dtLc_(f.data_source_field), key = dtStr_(f.template_key), tab = dtStr_(f.worksheet_name);
if (src === 'shipments.shipments_customs_type_label' && !dtStr_(f.transform_rule)) {
f.data_source_field = 'shipments_customs_type'; f.transform_rule = 'customs_type_label';
}
if (key === 'PACKING_LIST_SINOTRANS' && /^FIELD-SINOTRANS-PL-04[0-4]0$/.test(dtStr_(f.field_id)) && totals[p] &&
dtLc_(f.field_type) === 'scalar' && dtLc_(f.data_scope) === 'shipments' && dtStr_(f.data_source_table) === totals[p] &&
dtStr_(f.data_source_field) === 'shipments.' + totals[p] && !dtStr_(f.data_source_path) && !dtStr_(f.collection_key)) {
f.data_scope = 'total'; f.data_source_table = 'shipments'; f.data_source_field = totals[p]; f.data_source_path = 'shipments.' + totals[p];
}
if (key === 'BOOKING_TOP_SEALAND' && tabs[tab] && dtLc_(f.data_scope) === 'line' && dtLc_(f.field_type) !== 'collection') {
var controllers = rows.filter(function (r) { return dtStr_(r.template_id) === dtStr_(f.template_id) && dtStr_(r.worksheet_name) === tab && dtLc_(r.field_type) === 'collection' && (dtBool_(r.is_active) || !dtStr_(r.is_active)); });
if (controllers.length === 1 && dtStr_(controllers[0].placeholder) === tabs[tab] && dtStr_(controllers[0].collection_key) === tabs[tab]) {
if (!dtStr_(f.collection_key)) f.collection_key = tabs[tab];
else if (p === 'CARTON_REFERENCE' && f.collection_key === 'carton_reference_format' && !dtStr_(f.transform_rule) && src === 'shipment_lines.carton_no_start,carton_no_end') {
f.collection_key = tabs[tab]; f.transform_rule = 'carton_reference_format';
}
}
}
return f;
});
}
function dtReadTable_(ss, name, headers) {
var rows = sfoRowsAsObjects_(dtRequireKnownLayoutSc2_(ss, name, headers));
return name === 'document_template_fields' ? dtNormalizeCarrierFieldsR2_(rows) : rows;
}

function handleDocumentTemplateList_(body) {
var ss = SpreadsheetApp.openById(prodExpectedDbId_());
var docType = dtLc_(body && body.document_type);
var rows = dtReadTable_(ss, 'document_templates', DOCUMENT_TEMPLATES_HEADERS_).filter(function (r) {
return dtTemplateActive_(r, '') && (!docType || dtLc_(r.document_type) === docType);
}).map(function (r) { return { template_id: dtStr_(r.template_id), template_key: dtStr_(r.template_key), template_name: dtStr_(r.template_name), document_type: dtStr_(r.document_type), template_version: dtNum_(r.template_version), template_file_type: dtStr_(r.template_file_type), template_file_id: dtStr_(r.template_file_id) }; });
return jsonResponse_({ success: true, templates: rows });
}
function handleDocumentTemplateGetFields_(body) {
var templateId = dtStr_(body && body.template_id);
if (!templateId) return jsonResponse_({ success: false, error: 'TEMPLATE_ID_REQUIRED' });
var ss = SpreadsheetApp.openById(prodExpectedDbId_());
var fields = dtReadTable_(ss, 'document_template_fields', DOCUMENT_TEMPLATE_FIELDS_HEADERS_).filter(function (r) { return dtStr_(r.template_id) === templateId; });
return jsonResponse_({ success: true, template_id: templateId, fields: fields });
}






function handleShipmentDocumentGenerate_(body) {
var shipmentId = dtStr_(body && body.shipment_id);
var docTypeIn = dtUc_(body && body.document_type);
var actor = dtStr_(body && body.actor) || 'system';
var regenerate = !!(body && body.regenerate);
var wantFile = !!(body && body.generate_file);
if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
var docEnum = DOC_TYPE_ENUM_[docTypeIn];
if (!docEnum) return jsonResponse_({ success: false, error: 'UNSUPPORTED_DOCUMENT_TYPE', supported: ['SHIPDETAIL', 'PL'] });

var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
try {
var ss = SpreadsheetApp.openById(prodExpectedDbId_());

var snap = docReadSnapshot_(ss, shipmentId);
if (!snap) return jsonResponse_({ success: true, finalized: false, shipment_id: shipmentId, note: 'No finalized snapshot — run finalizeShipmentFinalOutput first.' });
var model = (docTypeIn === 'SHIPDETAIL') ? docRenderShippingDetail_(snap) : docRenderPackingList_(snap);
if (!model.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, blocked: model.blocked || false, error: model.error || 'DOCUMENT_NOT_READY', reason: model.reason, missing: model.missing });


var h = snap.header;
var req = { document_type: docEnum, country: dtStr_(h.country), marketplace: dtStr_(h.marketplace), carrier_id: dtStr_(body && body.carrier_id), language: dtStr_(body && body.language), asOf: dtStr_(h.dispatch_date) };
var tRes = dtResolveTemplate_(dtReadTable_(ss, 'document_templates', DOCUMENT_TEMPLATES_HEADERS_), req);
if (!tRes.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, error: tRes.error, count: tRes.count });
var tpl = tRes.template;


var fields = dtReadTable_(ss, 'document_template_fields', DOCUMENT_TEMPLATE_FIELDS_HEADERS_).filter(function (r) { return dtStr_(r.template_id) === dtStr_(tpl.template_id); });
var mapped = dtMapPlaceholders_(model, fields);
if (mapped.missing.length) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: 'DOCUMENT_REQUIRED_FIELD_MISSING', missing: mapped.missing });


var genSheet = prodRequireSheet_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_);
var key = dtGeneratedKey_(shipmentId, docEnum, tpl.template_id, tpl.template_version);
var existing = sfoRowsAsObjects_(genSheet).filter(function (r) {
return dtGeneratedKey_(r.related_entity_id, r.document_type, r.template_id, r.template_version) === key && (dtLc_(r.status) === 'generated' || dtLc_(r.status) === 'regenerated');
});
var fileMeta = { document_type: docEnum, shipment_id: shipmentId, shipment_no: dtStr_(h.shipment_no), snapshot_id: dtStr_(h.snapshot_id), snapshot_version: dtStr_(h.snapshot_version), dispatch_date: dtStr_(h.dispatch_date) };
if (existing.length && !regenerate) {
var ex = existing[0];

if (wantFile && !dtStr_(ex.file_id)) {
var lfx = dtResolveLeafFolder_(ss, tpl, shipmentId);
if (!lfx.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: lfx.reason, detail: lfx });
var frx = dfoGenerateFile_(dfoDefaultIo_(), tpl, mapped, fileMeta, { folder_id: lfx.folder_id });
if (!frx.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: frx.error, message: frx.message, type: frx.type, supported: frx.supported, partial_file_id: frx.partial_file_id });
dtUpdateGeneratedFile_(genSheet, dtStr_(ex.document_id), frx, shipmentTimestamp_(), lfx.folder_id);
return jsonResponse_({ success: true, reused: true, generated_file: true, document_id: dtStr_(ex.document_id), template_id: dtStr_(tpl.template_id), template_version: dtNum_(tpl.template_version), file_name: frx.file_name, file_id: frx.file_id, file_url: frx.file_url, pdf_file_url: frx.pdf_file_url, download_url: (frx.pdf_file_url || frx.file_url) });
}
return jsonResponse_({ success: true, reused: true, document_id: dtStr_(ex.document_id), template_id: dtStr_(tpl.template_id), template_version: dtNum_(tpl.template_version), status: dtStr_(ex.status), file_url: dtStr_(ex.file_url), pdf_file_url: dtStr_(ex.pdf_file_url), download_url: (dtStr_(ex.pdf_file_url) || dtStr_(ex.file_url)), placeholder_values: mapped.values, note: 'Existing generated document reused (idempotent).' });
}


var fileFields = { file_name: '', file_id: '', file_url: '', pdf_file_id: '', pdf_file_url: '' };
var leafFolderId = '';
if (wantFile) {
var lf = dtResolveLeafFolder_(ss, tpl, shipmentId);
if (!lf.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: lf.reason, detail: lf });
leafFolderId = lf.folder_id;
var fr = dfoGenerateFile_(dfoDefaultIo_(), tpl, mapped, fileMeta, { folder_id: leafFolderId });
if (!fr.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docTypeIn, template_id: dtStr_(tpl.template_id), error: fr.error, message: fr.message, type: fr.type, supported: fr.supported, partial_file_id: fr.partial_file_id });
fileFields = { file_name: fr.file_name, file_id: fr.file_id, file_url: fr.file_url, pdf_file_id: fr.pdf_file_id, pdf_file_url: fr.pdf_file_url };
}
var now = shipmentTimestamp_();
var docId = 'GDOC-' + Utilities.getUuid().substring(0, 12).toUpperCase();
var row = {
document_id: docId, template_id: dtStr_(tpl.template_id), template_key: dtStr_(tpl.template_key), template_version: dtNum_(tpl.template_version),
related_entity_type: 'shipment', related_entity_id: shipmentId, document_type: docEnum,
series: '', sku: '', supplier_id: '', factory_id: dtStr_(h.factory_id), carrier_id: dtStr_(h.carrier_id) || dtStr_(body && body.carrier_id),
country: dtStr_(h.country), marketplace: dtStr_(h.marketplace), language: dtStr_(body && body.language),


file_name: fileFields.file_name, file_id: fileFields.file_id, file_url: fileFields.file_url, pdf_file_id: fileFields.pdf_file_id, pdf_file_url: fileFields.pdf_file_url, output_folder_id: leafFolderId,
generated_by: actor, generated_at: now, status: (existing.length ? 'regenerated' : 'generated'), email_status: 'not_sent', email_sent_at: '',
regenerated_from_document_id: (existing.length ? dtStr_(existing[0].document_id) : ''),
note: (wantFile ? 'R3C generated file from the configured template asset.' : 'R3B lifecycle record; file generation not requested.'), created_at: now, updated_at: now
};
dtAppendByHeader_(genSheet, row);
return jsonResponse_({ success: true, reused: false, regenerated: existing.length > 0, generated_file: wantFile, document_id: docId, template_id: dtStr_(tpl.template_id), template_version: dtNum_(tpl.template_version), status: row.status, snapshot_id: dtStr_(h.snapshot_id), file_name: fileFields.file_name, file_id: fileFields.file_id, file_url: fileFields.file_url, pdf_file_url: fileFields.pdf_file_url, download_url: (fileFields.pdf_file_url || fileFields.file_url), placeholder_values: mapped.values });
} catch (err) {
return jsonResponse_({ success: false, error: 'DOCUMENT_GENERATION_FAILED: ' + (err && err.message ? err.message : err), shipment_id: shipmentId });
} finally { try { lock.releaseLock(); } catch (e2) {} }
}

function dtAppendByHeader_(sheet, obj) {
var lastCol = sheet.getLastColumn();
var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
var row = new Array(headers.length).fill('');
for (var i = 0; i < headers.length; i++) { if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) row[i] = obj[headers[i]]; }
sheet.appendRow(row);
}



function dtUpdateGeneratedFile_(sheet, documentId, fr, now, leafFolderId) {
var d = sheet.getDataRange().getValues();
var head = d[0].map(function (x) { return String(x).trim(); });
var cId = head.indexOf('document_id');
var set = { file_name: fr.file_name, file_id: fr.file_id, file_url: fr.file_url, pdf_file_id: fr.pdf_file_id, pdf_file_url: fr.pdf_file_url, updated_at: now };
if (dtStr_(leafFolderId)) set.output_folder_id = dtStr_(leafFolderId);
for (var r = 1; r < d.length; r++) {
if (String(d[r][cId]).trim() === String(documentId).trim()) {
Object.keys(set).forEach(function (k) { var c = head.indexOf(k); if (c !== -1) sheet.getRange(r + 1, c + 1).setValue(set[k]); });
return true;
}
}
return false;
}





function dtResolveLeafFolder_(ss, tpl, shipmentId) {
return dgsResolveShipmentLeafFolder_(ss, tpl, shipmentId);
}

function handleShipmentDocumentGet_(body) {
var documentId = dtStr_(body && body.document_id);
if (!documentId) return jsonResponse_({ success: false, error: 'DOCUMENT_ID_REQUIRED' });
var ss = SpreadsheetApp.openById(prodExpectedDbId_());
var rows = dtReadTable_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_).filter(function (r) { return dtStr_(r.document_id) === documentId; });
if (!rows.length) return jsonResponse_({ success: true, found: false, document_id: documentId });
return jsonResponse_({ success: true, found: true, document: rows[0] });
}
function handleShipmentDocumentList_(body) {
var shipmentId = dtStr_(body && body.shipment_id);
if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
var ss = SpreadsheetApp.openById(prodExpectedDbId_());
var rows = dtReadTable_(ss, 'generated_documents', GENERATED_DOCUMENTS_HEADERS_).filter(function (r) { return dtStr_(r.related_entity_id) === shipmentId; });
return jsonResponse_({ success: true, shipment_id: shipmentId, documents: rows });
}


var DOCUMENT_PHYSICAL_LAYOUTS_SC2_ = {
  "document_template_fields": [
    [
      "field_id",
      "template_id",
      "template_key",
      "document_type",
      "worksheet_name",
      "placeholder",
      "field_label",
      "field_type",
      "data_scope",
      "data_source_table",
      "data_source_field",
      "data_source_path",
      "collection_key",
      "sort_order",
      "required",
      "default_value",
      "format_rule",
      "transform_rule",
      "fallback_rule",
      "example_value",
      "is_active",
      "note",
      "created_at",
      "updated_at"
    ]
  ]
};

// SC2: only this module's pinned table layouts are compatible.
function dtRequireKnownLayoutSc2_(ss, name, required) {
  var layouts = DOCUMENT_PHYSICAL_LAYOUTS_SC2_[name];
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

var DOCUMENT_LAYOUT_BUILD_VERSION_ = 'SC2-DTF-20261111-WH1-CS1';
