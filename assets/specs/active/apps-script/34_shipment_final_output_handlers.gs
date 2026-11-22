































var SFO_SNAPSHOT_HEADERS_ = [
'snapshot_id', 'shipment_id', 'snapshot_version', 'status', 'superseded_by', 'superseded_reason',



'shipment_no', 'reference_id', 'company', 'country', 'marketplace',
'source_warehouse_id', 'destination_warehouse_id', 'destination_type', 'warehouse_code', 'ship_from', 'ship_to',
'carrier_id', 'carrier_name', 'shipping_method', 'etd', 'eta', 'dispatch_date',
'booking_no', 'container_no', 'invoice_no', 'currency',
'shipper_legal_entity_id', 'shipper_company', 'shipper_legal_name', 'shipper_display_name', 'shipper_country',
'shipper_address_line_1', 'shipper_address_line_2', 'shipper_city', 'shipper_state_or_region', 'shipper_postal_code', 'shipper_tax_or_business_id',
'seller_of_record_legal_entity_id', 'seller_of_record_legal_name',
'consignee_location_id', 'consignee_warehouse_id', 'consignee_name',
'consignee_address_line_1', 'consignee_address_line_2', 'consignee_city', 'consignee_state_or_region', 'consignee_postal_code', 'consignee_country',
'factory_id', 'factory_name',



'shipping_detail_ready', 'packing_list_ready', 'commercial_invoice_ready', 'booking_ready', 'customs_ready', 'readiness_detail',
'finalized_by', 'finalized_at', 'created_at', 'updated_at'
];

var SFO_LINE_HEADERS_ = [
'snapshot_line_id', 'snapshot_id', 'shipment_id', 'shipment_line_id', 'sku', 'site_sku',
'product_name_en', 'product_name_cn', 'shipment_qty', 'shipment_carton_qty', 'carton_no_start', 'carton_no_end', 'units_per_carton',
'gross_weight', 'net_weight', 'cbm', 'carton_length', 'carton_width', 'carton_height',









'gs1_code', 'gs1_type', 'country_of_origin', 'hs_code', 'declared_currency', 'declared_unit_value',
'note', 'created_at'
];

var SFO_LINE_PO_HEADERS_ = [
'snapshot_line_po_id', 'snapshot_id', 'shipment_id', 'shipment_line_id', 'shipment_line_allocation_id',
'purchase_order_line_id', 'purchase_order_id', 'po_no', 'allocated_qty', 'created_at'
];














var SFO_DISPATCHED_STATUS_ = { shipped: 1, in_transit: 1, arrived: 1, received: 1, completed: 1, closed: 1 };

var SFO_NOT_DISPATCHED_STATUS_ = { draft: 1, ready_to_ship: 1, cancelled: 1 };



function sfoStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
function sfoDay_(v) {
if (Object.prototype.toString.call(v) === '[object Date]') return isFinite(v.getTime()) ? Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd') : '';
return sfoStr_(v);
}
function sfoLc_(v) { return sfoStr_(v).toLowerCase(); }
function sfoUc_(v) { return sfoStr_(v).toUpperCase(); }
// SANDBOX-GATE-1l (K-1): the round this file last changed
var SFO_BUILD_VERSION_ = 'F1-7N-FC-1B-E3-R4-A2-R1-R6-R7-R71-SBX1L-R15G-TAX1-DOC1-AD3-DW1';
// SANDBOX-GATE-1l (K-1): a measure whose source is blank is UNKNOWN (''), never 0; a stored 0 with a known source stays 0
function sfoHas_(v) { var t = sfoStr_(v); return t !== '' && !isNaN(Number(t.replace(/,/g, ''))); }
function sfoNumOrBlank_(v) { var t = sfoStr_(v); if (t === '') return ''; var n = Number(t.replace(/,/g, '')); return isNaN(n) ? '' : n; }
function sfoKnownNum_(v, sourceKnown) { var n = sfoNumOrBlank_(v); if (n === '') return ''; return (n === 0 && !sourceKnown) ? '' : n; }
function sfoNum_(v) {
if (v === null || v === undefined || v === '') return 0;
var n = Number(String(v).replace(/,/g, '').trim());
return isNaN(n) ? 0 : n;
}
function sfoIsDispatched_(shipment) { return !!SFO_DISPATCHED_STATUS_[sfoLc_(shipment && shipment.status)]; }



function sfoOverseasNoPoTransfer_(ss, shipment) {
  try {
    if (typeof csdOverseasTransferEligibility_ !== 'function' || typeof CSD_OVERSEAS_NO_PO_LINEAGE_ === 'undefined' || !CSD_OVERSEAS_NO_PO_LINEAGE_) return { eligible: false, reason: 'RULE_UNAVAILABLE' };
    if (typeof shipmentSourceDomain_ === 'function' && shipmentSourceDomain_(ss, sfoStr_(shipment.source_warehouse_id)) !== SHIPMENT_DOMAIN_OVERSEAS_) return { eligible: false, reason: 'SOURCE_NOT_OVERSEAS' };
    var r = csdOverseasTransferEligibility_(ss, shipment) || {};
    return { eligible: r.eligible === true, reason: r.reason || '', transfer_kind: r.transfer_kind || '' };
  } catch (e) { return { eligible: false, reason: 'ELIGIBILITY_UNREADABLE' }; }
}
function sfoConservation_(shipmentLines, executedAllocs) {
var byLine = {};
(executedAllocs || []).forEach(function (a) {
var k = sfoStr_(a.shipment_line_id);
byLine[k] = (byLine[k] || 0) + sfoNum_(a.allocated_qty);
});
var mism = [];
(shipmentLines || []).forEach(function (l) {
var k = sfoStr_(l.shipment_line_id);
var q = sfoNum_(l.shipment_qty), alloc = byLine[k] || 0;
if (alloc !== q) mism.push({ shipment_line_id: k, shipment_qty: q, executed_allocated: alloc });
});
if (mism.length) return { ok: false, error: 'FINAL_OUTPUT_PO_ALLOCATION_QTY_MISMATCH', mismatches: mism };
return { ok: true };
}





// CODEX-DOC-TAX-SOURCE-1: select the actual origin and normalize Sheet dates.
function sfoResolveCustoms_(taxRows, series, dutyCountry, asOf, origin, ss) {
var s = sfoLc_(series), dc = sfoLc_(dutyCountry), oc = sfoUc_(origin), q = shippingTaxDay_(ss, asOf), invalid = q === null;
var empty = function (why) { return { resolved: false, country_of_origin: '', hs_code: '', declared_currency: '', declared_unit_value: '', tax_rate_id: '', vat_no: '', eori_no: '', tax_match: why }; };
var cand = [];
(taxRows || []).forEach(function (t) {
if (!s || sfoLc_(t.series) !== s || (dc && sfoLc_(t.duty_country) !== dc) || (oc && sfoUc_(t.country_of_origin) !== oc)) return;
var from = shippingTaxDay_(ss, t.effective_from), to = shippingTaxDay_(ss, t.effective_to);
if (from === null || to === null || (from && to && to < from)) { invalid = true; return; }
if (q && ((from && from > q) || (to && to < q))) return;
cand.push({ row: t, from: from });
});
if (invalid) return empty('INVALID_DATE');
if (!cand.length) return empty('NOT_FOUND');
if (!oc && cand.some(function (t) { return sfoUc_(t.row.country_of_origin) !== sfoUc_(cand[0].row.country_of_origin); })) return empty('AMBIGUOUS');
cand.sort(function (a, b) { return b.from.localeCompare(a.from); });
if (cand.filter(function (t) { return t.from === cand[0].from; }).length !== 1) return empty('AMBIGUOUS');
var row = cand[0].row;
return { resolved: true, tax_rate_id: sfoStr_(row.tax_rate_id), vat_no: sfoStr_(row.vat_no), eori_no: sfoStr_(row.eori_no), tax_match: 'RESOLVED',
country_of_origin: sfoStr_(row.country_of_origin), hs_code: sfoStr_(row.hscode), declared_currency: sfoStr_(row.declared_currency), declared_unit_value: sfoNum_(row.declared_value) };
}
function sfoCustomsOriginDoc1_(line, master, warehouse) {
var explicit = sfoUc_((line || {}).country_of_origin) || sfoUc_((master || {}).country_of_origin);
if (explicit) return /^[A-Z]{2}$/.test(explicit) ? explicit : 'INVALID';
var w = warehouse || {}, factory = w.is_factory_warehouse === true || /^(true|1)$/i.test(sfoStr_(w.is_factory_warehouse));
return factory && !w.__duplicated && /^[A-Z]{2}$/.test(sfoUc_(w.country)) ? sfoUc_(w.country) : '';
}

function sfoBuildLine_(line, master, siteSku, customs, lineId) {
var m = master || {}, c = customs || {};
var qty = sfoNum_(line.shipment_qty);
var declaredUnit = c.resolved === false ? '' : sfoNum_(c.declared_unit_value);
return {
snapshot_line_id: sfoStr_(lineId),
shipment_line_id: sfoStr_(line.shipment_line_id),
sku: sfoStr_(line.sku),
site_sku: sfoStr_(siteSku),
product_name_en: sfoStr_(m.product_name),
product_name_cn: sfoStr_(m.product_name_cn),
shipment_qty: qty,
shipment_carton_qty: sfoNum_(line.shipment_carton_qty),
carton_no_start: sfoStr_(line.carton_no_start),
carton_no_end: sfoStr_(line.carton_no_end),
units_per_carton: sfoNum_(line.units_per_carton) || sfoNum_(m.units_per_carton),
gross_weight: sfoKnownNum_(line.gross_weight, sfoHas_(m.carton_weight)),   // SANDBOX-GATE-1l (K-1)
net_weight: sfoKnownNum_(line.net_weight, sfoHas_(m.item_weight)),
cbm: sfoKnownNum_(line.shipment_carton_cbm, sfoHas_(m.carton_length) && sfoHas_(m.carton_width) && sfoHas_(m.carton_height) && (sfoLc_(m.carton_dimension_unit) === '' || sfoLc_(m.carton_dimension_unit) === 'cm')),   // 11_ derives CBM for cm only (other units -> 0)
carton_length: sfoNumOrBlank_(m.carton_length), carton_width: sfoNumOrBlank_(m.carton_width), carton_height: sfoNumOrBlank_(m.carton_height),
gs1_code: sfoStr_(m.gs1_code), gs1_type: sfoStr_(m.gs1_type),
country_of_origin: sfoUc_(c.country_of_origin),
hs_code: sfoStr_(c.hs_code),
declared_currency: sfoUc_(c.declared_currency),
declared_unit_value: declaredUnit,

material: sfoStr_(m.material), product_use: sfoStr_(m.product_use), battery_type: sfoStr_(m.battery_type), magnet_type: sfoStr_(m.magnet_type),
tax_rate_id: sfoStr_(c.tax_rate_id), tax_match: sfoStr_(c.tax_match), vat_no: sfoStr_(c.vat_no), eori_no: sfoStr_(c.eori_no),
regular_price: (line.__price || {}).value, regular_price_currency: (line.__price || {}).currency || '', regular_price_ref: (line.__price || {}).ref || '',
carton_weight: (line.__master || {}).carton_weight, package_weight: (line.__master || {}).package_weight, sku_master_ref: (line.__master || {}).sku_master_ref,
product_url: (line.__master || {}).product_url, marketplace_product_id: (line.__master || {}).marketplace_product_id, regional_ref: (line.__master || {}).regional_ref,
note: sfoStr_(line.note)
};
}



function sfoBuildLinePos_(shipmentLineId, executedAllocsForLine, poByLineId, mkId) {
return (executedAllocsForLine || []).map(function (a) {
var pol = sfoStr_(a.purchase_order_line_id);
var po = (poByLineId && poByLineId[pol]) || {};
return {
snapshot_line_po_id: mkId(),
shipment_line_id: sfoStr_(shipmentLineId),
shipment_line_allocation_id: sfoStr_(a.shipment_line_allocation_id),
purchase_order_line_id: pol,
purchase_order_id: sfoStr_(po.purchase_order_id),
po_no: sfoStr_(po.po_no),
allocated_qty: sfoNum_(a.allocated_qty)
};
});
}






var SFO_DB16_ = ['rate_card_id', 'shipping_method_label', 'last_mile_delivery', 'shipments_customs_type', 'external_shipment_id', 'rate_card_version',
'consignee_contact_phone', 'consignee_contact_email', 'consignee_contact_ref'];
var SFO_DB16L_ = ['tax_rate_id', 'tax_match', 'vat_no', 'eori_no', 'regular_price', 'regular_price_currency', 'regular_price_ref'];
var SFO_DB16A_ = ['carton_weight', 'package_weight', 'sku_master_ref'], SFO_DB16U_ = ['product_url', 'marketplace_product_id', 'regional_ref'];
function sfoRateCardLabel_(ss, s) {
var automatic = shipNoRatePolicy_(ss, s, shipRcLines_(ss, sfoStr_(s.shipment_id)), shipmentTimestamp_().slice(0, 10));
if (automatic.allowed) {
  var audit = { reason: automatic.policy, actor: 'system-policy', actor_source: 'server_policy', basis: 'NO_APPLICABLE_RATE', label: automatic.label, lines: shipUnpricedLines_(shipRcLines_(ss, sfoStr_(s.shipment_id))) };
  return { ok: true, rate_card_id: '', label: automatic.label, version: shipUnpricedReceipt_(s, audit), pricing_state: 'COST_PENDING_AUTO' };
}
var unpriced = shipUnpricedMeta_(s.rate_card_version);
if (unpriced) {
if (!shipUnpricedValid_(ss, s, shipRcLines_(ss, sfoStr_(s.shipment_id)), shipmentTimestamp_().slice(0, 10))) return { ok: false, reason: 'UNPRICED_APPROVAL_STALE', rate_card_id: '' };
return { ok: true, rate_card_id: '', label: unpriced.label, version: sfoStr_(s.rate_card_version), pricing_state: 'UNPRICED_APPROVED' };
}
var id = sfoStr_(s.rate_card_id), rows, r, off;
if (!id) return { ok: false, reason: 'RATE_CARD_NOT_SELECTED', rate_card_id: '' };
rows = sfoReadTable_(ss, 'carrier_rate_cards', []).filter(function (x) { return sfoStr_(x.rate_card_id) === id; });
if (rows.length !== 1) return { ok: false, reason: rows.length ? 'RATE_CARD_DUPLICATED' : 'RATE_CARD_NOT_FOUND', rate_card_id: id };
r = rows[0];
if (['draft', 'ready_to_ship'].indexOf(sfoLc_(s.status)) >= 0 && !sfoStr_(s.estimated_duty_currency)) return { ok: false, reason: 'DUTY_CURRENCY_RESELECT_REQUIRED', rate_card_id: id };
var mk = shipRcMarker_(s.rate_card_version);
if (mk.state === 'PENDING') return { ok: false, reason: 'RATE_CARD_SELECTION_PENDING', rate_card_id: id };
if (mk.state !== 'COMPLETE') return { ok: false, reason: 'RATE_CARD_NOT_CONFIRMED', rate_card_id: id };
if (shipRateCardVersion_(r) !== mk.ver) return { ok: false, reason: 'RATE_CARD_CHANGED_SINCE_SELECTION', rate_card_id: id };
if (!shippingRateActive_(r, sfoDay_(s.actual_departure_date).slice(0, 10) || shipmentTimestamp_().slice(0, 10))) return { ok: false, reason: 'RATE_CARD_NOT_EFFECTIVE', rate_card_id: id };
off = ['carrier_id', 'shipping_method', 'last_mile_delivery'].filter(function (k) { return sfoLc_(r[k]) !== sfoLc_(s[k]); });
if (sfoStr_(r.destination_country) && sfoUc_(r.destination_country) !== sfoUc_(sfoDestCountry15g_(ss, s))) off.push('destination_country');   // R15G-EU D2: the actual destination
var bc = shipBatteryClass_(ss, shipRcLines_(ss, sfoStr_(s.shipment_id)).map(function (l) { return l.sku; }));
if (bc.unclassified.length) return { ok: false, reason: 'RATE_CARD_BATTERY_UNCLASSIFIED', rate_card_id: id };
if ((sfoLc_(r.battery_type) === 'lithium_battery') !== (bc.cls === 'lithium_battery')) off.push('battery_type');
if (off.length) return { ok: false, reason: 'RATE_CARD_MISMATCH:' + off.join('+'), rate_card_id: id };
if (!shipRateCardLane_(ss, s, shipRcLines_(ss, sfoStr_(s.shipment_id)), sfoDay_(s.actual_departure_date).slice(0, 10) || shipmentTimestamp_().slice(0, 10)).some(function (candidate) { return sfoStr_(candidate.rate_card_id) === id; })) return { ok: false, reason: 'RATE_CARD_NOT_APPLICABLE', rate_card_id: id };
if (shipRcReceipt_(s, mk.ver) !== sfoStr_(s.rate_card_version)) return { ok: false, reason: 'RATE_CARD_SELECTION_STALE', rate_card_id: id };
return sfoStr_(r.shipping_method_label) ? { ok: true, rate_card_id: id, label: sfoStr_(r.shipping_method_label), version: mk.ver } : { ok: false, reason: 'RATE_CARD_LABEL_BLANK', rate_card_id: id };
}

function sfoRegularPrice_(ms, pl, sku, s) {
var co = sfoStr_(s.company), ct = sfoUc_(s.country), mk = sfoLc_(s.marketplace), a, p, r;
if (mk === 'multi') return { value: '', ref: 'PRICE_MARKETPLACE_MULTI' };
a = ms.filter(function (x) { return sfoStr_(x.sku) === sku && sfoStr_(x.company) === co && sfoUc_(x.country) === ct && sfoLc_(x.marketplace) === mk; });
if (a.length !== 1) return { value: '', ref: a.length ? 'PRICE_MARKETPLACE_SKU_DUPLICATED' : 'PRICE_MARKETPLACE_SKU_NOT_FOUND' };
p = pl.filter(function (x) { return sfoStr_(x.marketplace_sku_id) === sfoStr_(a[0].marketplace_sku_id); });
if (p.length !== 1) return { value: '', ref: p.length ? 'PRICE_ROW_DUPLICATED' : 'PRICE_ROW_NOT_FOUND' };
if (sfoStr_(p[0].sku) !== sku || sfoUc_(p[0].country) !== ct || sfoLc_(p[0].marketplace) !== mk) return { value: '', ref: 'PRICE_ROW_MISMATCH' };
if (pricingReadNumber_(p[0].regular_price).invalid) return { value: '', ref: 'PRICE_INVALID' };
r = pricingResolveEffective_(p[0], PRICING_FIELDS_[0]);
if (r.source !== 'OVERRIDE' && r.source !== 'AUTO') return { value: '', ref: 'PRICE_' + r.source };
if (!sfoStr_(p[0].currency)) return { value: '', ref: 'PRICE_CURRENCY_BLANK' };
return { value: r.value, currency: sfoUc_(p[0].currency), ref: sfoStr_(p[0].pricing_id) + ':' + r.source };
}


function sfoMasterTable_(ss, name) {
var sh = ss.getSheetByName(name), d = sh ? sh.getDataRange().getValues() : null, h, rows = [];
if (!d || !d.length) return { err: sh ? 'NO_HEADER' : 'NO_SHEET' };
h = d[0].map(sfoStr_);
for (var i = 1; i < d.length; i++) { var o = {}; for (var j = 0; j < h.length; j++) if (h[j]) o[h[j]] = d[i][j]; rows.push(o); }
return { h: h, rows: rows };
}

function sfoMasterSource_(ss, need) {
if (!need) { var sh = ss.getSheetByName('shipment_final_output_lines'), n = sh ? sh.getLastColumn() : 0, h = n ? sh.getRange(1, 1, 1, n).getValues()[0].map(sfoStr_) : []; need = { a: h.indexOf('sku_master_ref') >= 0, u: h.indexOf('regional_ref') >= 0 }; }
var t = function (name) { try { return sfoMasterTable_(ss, name); } catch (e) { return { err: 'UNREADABLE' }; } };
return { sd: need.a ? t('sku_details') : null, rg: need.u ? t('sku_regional_details') : null };
}
function sfoSkuWeights_(t, sku) {
if (!t) return {};
var o = { carton_weight: '', package_weight: '' }, r, q = [];
if (t.err) return Object.assign(o, { sku_master_ref: 'SKU_DETAILS_' + t.err });
if (t.h.indexOf('sku') < 0) return Object.assign(o, { sku_master_ref: 'SKU_DETAILS_KEY_COLUMN_MISSING' });
r = sku ? t.rows.filter(function (x) { return sfoStr_(x.sku) === sku; }) : [];
if (r.length !== 1) return Object.assign(o, { sku_master_ref: r.length ? 'SKU_DETAILS_DUPLICATED' : 'SKU_DETAILS_NOT_FOUND' });
['carton_weight', 'package_weight'].forEach(function (k) {
var u = k + '_unit', unit = t.h.indexOf(u) < 0 ? '' : sfoStr_(r[0][u]);
if (t.h.indexOf(k) < 0) q.push(k + '=NO_COLUMN');
else if (unit && unit.toLowerCase() !== 'kg') q.push(k + '=UNIT_' + unit.replace(/[;=\s]/g, '_'));
else o[k] = r[0][k] === null || r[0][k] === undefined ? '' : r[0][k];
});
o.sku_master_ref = ['UNIQUE'].concat(q).join(';');
return o;
}
function sfoRegional_(t, sku, s) {
if (!t) return {};
var o = { product_url: '', marketplace_product_id: '' }, co = sfoStr_(s.company), ct = sfoStr_(s.country), mk = sfoStr_(s.marketplace), r, q = [];
if (t.err) return Object.assign(o, { regional_ref: 'REGIONAL_' + t.err });
if (mk.toLowerCase() === 'multi') return Object.assign(o, { regional_ref: 'REGIONAL_MARKETPLACE_MULTI' });
if (!sku || !co || !ct || !mk) return Object.assign(o, { regional_ref: 'REGIONAL_KEY_BLANK' });
if (['sku', 'company', 'country', 'marketplace'].some(function (k) { return t.h.indexOf(k) < 0; })) return Object.assign(o, { regional_ref: 'REGIONAL_KEY_COLUMN_MISSING' });
r = t.rows.filter(function (x) { return sfoStr_(x.sku) === sku && sfoStr_(x.company) === co && sfoStr_(x.country) === ct && sfoStr_(x.marketplace) === mk; });
if (r.length !== 1) return Object.assign(o, { regional_ref: r.length ? 'REGIONAL_ROW_DUPLICATED' : 'REGIONAL_ROW_NOT_FOUND' });
['product_url', 'marketplace_product_id'].forEach(function (k) { if (t.h.indexOf(k) < 0) q.push(k + '=NO_COLUMN'); else o[k] = sfoStr_(r[0][k]); });
o.regional_ref = ['UNIQUE:' + sfoStr_(r[0].regional_detail_id).replace(/[;=\s]/g, '_')].concat(q).join(';');
return o;
}
function sfoWarehouseContact_(t, wid, cwid) {
if (!t) return {};
var o = { consignee_contact_phone: '', consignee_contact_email: '' }, r, q = [];
wid = sfoUc_(wid);
if (t.err) return Object.assign(o, { consignee_contact_ref: 'WAREHOUSES_' + t.err });
if (!wid) return Object.assign(o, { consignee_contact_ref: 'CONTACT_DESTINATION_BLANK' });
if (sfoUc_(cwid) !== wid) return Object.assign(o, { consignee_contact_ref: 'CONTACT_CONSIGNEE_MISMATCH' });
if (t.h.indexOf('warehouse_id') < 0) return Object.assign(o, { consignee_contact_ref: 'WAREHOUSES_KEY_COLUMN_MISSING' });
r = t.rows.filter(function (x) { return sfoUc_(x.warehouse_id) === wid; });
if (r.length !== 1) return Object.assign(o, { consignee_contact_ref: r.length ? 'CONTACT_WAREHOUSE_DUPLICATED' : 'CONTACT_WAREHOUSE_NOT_FOUND' });
['contact_phone', 'contact_email'].forEach(function (k) { if (t.h.indexOf(k) < 0) q.push('consignee_' + k + '=NO_COLUMN'); else o['consignee_' + k] = sfoStr_(r[0][k]); });
o.consignee_contact_ref = ['UNIQUE:' + wid.replace(/[;=\s]/g, '_')].concat(q).join(';');
return o;
}
function sfoMasterFacts_(src, sku, s) { return Object.assign({}, sfoSkuWeights_(src.sd, sku), sfoRegional_(src.rg, sku, s)); }
function sfoPriceSource_(ss) {
var sh = ss.getSheetByName('shipment_final_output_lines'), n = sh ? sh.getLastColumn() : 0;
if (!n || sh.getRange(1, 1, 1, n).getValues()[0].map(sfoStr_).indexOf('regular_price_ref') < 0) return null;
try { return { ms: sfoReadTable_(ss, 'marketplace_skus', []), pl: sfoReadTable_(ss, 'pricing_list', []) }; } catch (e) { return { err: 'PRICE_SOURCE_UNREADABLE' }; }
}
function sfoBuildHeader_(shipment, shipper, seller, consignee, factory, carrier) {
var sp = shipper || {}, sl = seller || {}, cg = consignee || {}, fc = factory || {}, cr = carrier || {};
return {
shipment_id: sfoStr_(shipment.shipment_id),
shipment_no: sfoStr_(shipment.shipment_no),
reference_id: sfoStr_(shipment.reference_id),
company: sfoUc_(shipment.company),
country: sfoUc_(shipment.country),
marketplace: sfoStr_(shipment.marketplace),
source_warehouse_id: sfoStr_(shipment.source_warehouse_id),
destination_warehouse_id: sfoStr_(shipment.destination_warehouse_id || shipment.warehouse_id),
destination_type: sfoStr_(shipment.destination_type),
warehouse_code: sfoStr_(shipment.warehouse_code),
ship_from: sfoStr_(shipment.ship_from),
ship_to: sfoStr_(shipment.destination),
carrier_id: sfoStr_(shipment.carrier_id),
carrier_name: sfoStr_(cr.carrier_name),
shipping_method: sfoStr_(shipment.shipping_method),
etd: sfoDay_(shipment.etd), eta: sfoDay_(shipment.eta),
dispatch_date: sfoDay_(shipment.actual_departure_date),
booking_no: sfoStr_(shipment.booking_no), container_no: sfoStr_(shipment.container_no),
invoice_no: sfoStr_(shipment.invoice_no), currency: sfoUc_(shipment.currency),

shipper_legal_entity_id: sfoStr_(sp.company_legal_entity_id),
shipper_company: sfoUc_(sp.company),
shipper_legal_name: sfoStr_(sp.legal_name),
shipper_display_name: sfoStr_(sp.display_name),
shipper_country: sfoUc_(sp.country),
shipper_address_line_1: sfoStr_(sp.address_line_1), shipper_address_line_2: sfoStr_(sp.address_line_2),
shipper_city: sfoStr_(sp.city), shipper_state_or_region: sfoStr_(sp.state_or_region), shipper_postal_code: sfoStr_(sp.postal_code),
shipper_tax_or_business_id: sfoStr_(sp.tax_or_business_id),

seller_of_record_legal_entity_id: sfoStr_(sl.company_legal_entity_id),
seller_of_record_legal_name: sfoStr_(sl.legal_name),

consignee_location_id: sfoStr_(cg.logistics_location_id),
consignee_warehouse_id: sfoStr_(cg.warehouse_id),
consignee_name: sfoStr_(cg.recipient_name),
consignee_address_line_1: sfoStr_(cg.address_line_1), consignee_address_line_2: sfoStr_(cg.address_line_2),
consignee_city: sfoStr_(cg.city), consignee_state_or_region: sfoStr_(cg.state_or_region),
consignee_postal_code: sfoStr_(cg.postal_code), consignee_country: sfoUc_(cg.country),

factory_id: sfoStr_(fc.factory_id), factory_name: sfoStr_(fc.factory_name)
};
}







function sfoDocumentReadiness_(h, lines) {
var hasLines = !!(lines && lines.length);
var hasShipper = !!(sfoStr_(h.shipper_legal_entity_id) || sfoStr_(h.shipper_legal_name));
var hasConsignee = !!sfoStr_(h.consignee_location_id);
var allDeclared = hasLines && lines.every(function (l) { return sfoStr_(l.declared_currency) && sfoNum_(l.declared_unit_value) > 0; });
var hasCarrier = !!(sfoStr_(h.carrier_id) || sfoStr_(h.carrier_name)) && !!sfoStr_(h.shipping_method);
function fam(ok, reason) { return ok ? { status: 'READY' } : { status: 'BLOCKED', reason: reason }; }
return {
shipping_detail: fam(hasLines && hasShipper && hasConsignee, 'MISSING_BASE_FACTS'),
packing_list: fam(hasLines && hasConsignee, 'MISSING_CONSIGNEE_OR_LINES'),
commercial_invoice: fam(hasLines && hasShipper && hasConsignee && allDeclared, 'MISSING_DECLARED_VALUE'),
booking: fam(hasConsignee && hasCarrier, 'MISSING_CARRIER'),

customs: { status: 'BLOCKED', reason: 'LEGAL_IMPORTER_AUTHORITY_GAP' }
};
}



function sfoRowsAsObjects_(sheet) {
var d = sheet.getDataRange().getValues();
if (d.length < 2) return [];
var h = d[0].map(function (x) { return String(x).trim(); });
var out = [];
for (var i = 1; i < d.length; i++) { var o = {}; for (var j = 0; j < h.length; j++) { o[h[j]] = d[i][j]; } out.push(o); }
return out;
}
function sfoReadTable_(ss, name, headers) { return sfoRowsAsObjects_(prodRequireSheet_(ss, name, headers || [])); }

function sfoSkuMasterMap_(ss) {
var rows = sfoReadTable_(ss, 'sku_details', []);
var map = {}, rowsOf = {};
rows.forEach(function (r) {
var sku = sfoStr_(r.sku); if (!sku) return;
rowsOf[sku] = (rowsOf[sku] || 0) + 1;
if (!map[sku]) map[sku] = {
product_name: r.product_name, product_name_cn: r.product_name_cn, series: sfoStr_(r.series), country_of_origin: r.country_of_origin,
gs1_code: r.gs1_code, gs1_type: r.gs1_type, units_per_carton: r.units_per_carton,
carton_length: r.carton_length, carton_width: r.carton_width, carton_height: r.carton_height, carton_dimension_unit: r.carton_dimension_unit, carton_weight: r.carton_weight, item_weight: r.item_weight,
material: r.material, product_use: r.product_use, battery_type: r.battery_type, magnet_type: r.magnet_type

};
});
Object.keys(rowsOf).forEach(function (k) { if (rowsOf[k] > 1) map[k].__duplicated = rowsOf[k]; });
return map;
}
function sfoCarrierNameMap_(ss) {
var rows = sfoReadTable_(ss, 'carriers', []); var map = {};
rows.forEach(function (r) { var id = sfoStr_(r.carrier_id); if (id) map[id] = { carrier_name: sfoStr_(r.carrier_name) }; });
return map;
}
function sfoWarehouseNameMap_(ss) {
var rows = sfoReadTable_(ss, 'warehouses', []); var map = {};
rows.forEach(function (r) { var id = sfoUc_(r.warehouse_id); if (id) map[id] = { warehouse_name: sfoStr_(r.warehouse_name), warehouse_code: sfoStr_(r.warehouse_code), country: r.country, is_factory_warehouse: r.is_factory_warehouse, __duplicated: !!map[id] }; });
return map;
}


function sfoReadExecutedAllocations_(ss, lineIdSet, prospective) {
var rows = sfoReadTable_(ss, 'shipment_line_allocations', []);
return rows.filter(function (a) { var st = sfoLc_(a.allocation_status); return (st === 'executed' || (prospective && st === 'draft')) && lineIdSet[sfoStr_(a.shipment_line_id)]; });
}



function sfoBuildSnapshot_(ss, shipmentId, opts) {
var pro = !!(opts && opts.prospective);
var sid = sfoStr_(shipmentId);
if (!sid) return { ok: false, error: 'SHIPMENT_ID_REQUIRED' };
var shipments = sfoReadTable_(ss, 'shipments', []);
var shipment = null;
for (var i = 0; i < shipments.length; i++) { if (sfoStr_(shipments[i].shipment_id) === sid) { shipment = shipments[i]; break; } }
if (!shipment) return { ok: false, error: 'SHIPMENT_NOT_FOUND' };
if (!pro && !sfoIsDispatched_(shipment)) return { ok: false, error: 'SHIPMENT_NOT_DISPATCHED', status: sfoLc_(shipment.status) };

sc13AssertReady_(shipment);
var scMulti = sc13LinkIds_(ss, sid).length > 1;
if (scMulti) sc13Verify_(ss, shipment);
var allLines = sfoReadTable_(ss, 'shipment_lines', []);
var lines = allLines.filter(function (l) { return sfoStr_(l.shipment_id) === sid && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); });   // XCO-R15G H2
if (!lines.length) return { ok: false, error: 'SHIPMENT_HAS_NO_LINES' };
var lineIdSet = {}; lines.forEach(function (l) { lineIdSet[sfoStr_(l.shipment_line_id)] = 1; });

var executed = sfoReadExecutedAllocations_(ss, lineIdSet, pro);
// AD3-B (Owner rule 九, 2026-11-21): a shipment the server proves is an APPROVED overseas no-PO transfer (22_ csdOverseasTransferEligibility_ on the
// SAVED row; the same exact branch Confirm uses) carries no PO lineage by design, so PO-allocation conservation does not apply to it - provided it
// really has NO executed / draft allocation (any allocation keeps the normal conservation check). Every other shipment is unchanged.
var ovsNoPo_ = sfoOverseasNoPoTransfer_(ss, shipment);
var anyAlloc_ = ovsNoPo_.eligible ? sfoReadExecutedAllocations_(ss, lineIdSet, true) : executed;   // round 7 (review): executed OR draft rows, in every mode
var cons = (ovsNoPo_.eligible && !anyAlloc_.length) ? { ok: true, overseas_no_po_lineage: true } : sfoConservation_(lines, executed);
if (!cons.ok) return { ok: false, error: cons.error, mismatches: cons.mismatches };


var poJoined = slaLoadPoLinesJoined_(ss);
var poByLineId = {};
poJoined.forEach(function (p) { poByLineId[sfoStr_(p.purchase_order_line_id)] = p; });


var asOf = sfoStr_(shipment.actual_departure_date) || null;
var asOfMs = asOf ? Date.parse(asOf) : null; if (asOf && isNaN(asOfMs)) asOfMs = null;
var entities = partyReadCompanyLegalEntities_(ss);
var locations = partyReadLogisticsLocations_(ss);
var shipperR = partyResolveShipmentShipper_(entities, shipment, asOfMs);
if (!shipperR.ok) return { ok: false, error: shipperR.error, stage: 'shipper' };
var sellerR = partyResolveSellerOfRecord_(entities, shipment, asOfMs);
var consigneeR = partyResolveConsignee_(locations, shipment, asOfMs);
if (!consigneeR.ok) return { ok: false, error: consigneeR.error, stage: 'consignee' };

var fr = procurementResolveWarehouse_(ss, sfoStr_(shipment.source_warehouse_id), '', 'history'), factoryId = fr.ok ? fr.warehouse_id : '';
var whNames = sfoWarehouseNameMap_(ss);
var factory = { factory_id: factoryId, factory_name: (whNames[sfoUc_(shipment.source_warehouse_id)] || {}).warehouse_name || '' };
var carrier = sfoCarrierNameMap_(ss)[sfoStr_(shipment.carrier_id)] || {};

var master = sfoSkuMasterMap_(ss);
var dupSkus = lines.map(function (l) { return sfoStr_(l.sku); }).filter(function (k, i, a) { return master[k] && master[k].__duplicated && a.indexOf(k) === i; });
if (dupSkus.length) return { ok: false, error: 'SKU_DETAILS_DUPLICATED', stage: 'sku_master:' + dupSkus.join(','), skus: dupSkus };
var taxRows = sfoReadTable_(ss, 'tax_referral_rates', []);
var dutyCountry = sfoDestCountry15g_(ss, shipment);   // R15G-EU D2: duty by the actual importing country

var outLines = [], outPos = [], px = sfoPriceSource_(ss), mx = sfoMasterSource_(ss);
lines.forEach(function (l, idx) {
var sku = sfoStr_(l.sku);
var source = scMulti ? sc13Source_(ss, l, shipment) : null;
var lineContext = source ? Object.assign({}, shipment, { company: source.company, country: source.country, marketplace: source.marketplace }) : shipment;
l = Object.assign({}, l, { note: sc13PublicNote_(l.note) });
var m = master[sku] || {};
var series = sfoStr_(m.series);
var site = ''; try { var rl = skuRegionalLookup_(ss, sku, sfoStr_(lineContext.company), sfoStr_(lineContext.country), sfoStr_(lineContext.marketplace)); if (rl && rl.siteSku) site = rl.siteSku; } catch (e) {}
if (!site) { var mm = procurementMarketplaceSkuMap_(ss)[sku + '|' + sfoStr_(lineContext.company) + '|' + sfoStr_(lineContext.country) + '|' + sfoStr_(lineContext.marketplace)]; if (mm && mm.site_sku) site = mm.site_sku; }
var customs = sfoResolveCustoms_(taxRows, series, dutyCountry, shipment.actual_departure_date || shipment.etd || shipment.shipped_at || asOf, sfoCustomsOriginDoc1_(l, m, whNames[sfoUc_(shipment.source_warehouse_id)]), ss);
l = Object.assign({}, l, { __price: !px ? {} : px.err ? { value: '', ref: px.err } : sfoRegularPrice_(px.ms, px.pl, sku, lineContext), __master: sfoMasterFacts_(mx, sku, lineContext) });
var lineId = 'SFOL-' + Utilities.getUuid().substring(0, 12).toUpperCase();
outLines.push(sfoBuildLine_(l, m, site, customs, lineId));
var execForLine = executed.filter(function (a) { return sfoStr_(a.shipment_line_id) === sfoStr_(l.shipment_line_id); });
var pos = sfoBuildLinePos_(sfoStr_(l.shipment_line_id), execForLine, poByLineId, function () { return 'SFOP-' + Utilities.getUuid().substring(0, 12).toUpperCase(); });
outPos = outPos.concat(pos);
});

var header = sfoBuildHeader_(shipment, shipperR.shipper, sellerR.seller_of_record, consigneeR.consignee, factory, carrier), rc = sfoRateCardLabel_(ss, shipment);
Object.assign(header, { rate_card_id: rc.rate_card_id, shipping_method_label: rc.ok ? rc.label : '', last_mile_delivery: sfoLc_(shipment.last_mile_delivery), shipments_customs_type: sfoLc_(shipment.shipments_customs_type), external_shipment_id: sfoStr_(shipment.external_shipment_id), rate_card_version: rc.ok ? rc.version : '' });
var sh16 = ss.getSheetByName('shipment_final_output_snapshots'), n16 = sh16 ? sh16.getLastColumn() : 0;
if (n16 && sh16.getRange(1, 1, 1, n16).getValues()[0].map(sfoStr_).indexOf('consignee_contact_ref') >= 0) {
var wt; try { wt = sfoMasterTable_(ss, 'warehouses'); } catch (eW) { wt = { err: 'UNREADABLE' }; }
Object.assign(header, sfoWarehouseContact_(wt, shipment.destination_warehouse_id, header.consignee_warehouse_id));
}
var readiness = sfoDocumentReadiness_(header, outLines);
return { ok: true, header: header, lines: outLines, line_pos: outPos, readiness: readiness };
}

function sfoDeleteRowsFor_(sheet, colName, value) {
var d = sheet.getDataRange().getValues(); if (d.length < 2) return;
var h = d[0].map(function (x) { return String(x).trim(); });
var c = h.indexOf(colName); if (c === -1) return;
var target = sfoStr_(value);
for (var r = d.length - 1; r >= 1; r--) { if (sfoStr_(d[r][c]) === target) sheet.deleteRow(r + 1); }
}


function sfoFrozenRows_(built, shipmentId, actor, now) {
var snapId = 'SFO-' + shipmentId, readiness = built.readiness, headerRow = {};
SFO_SNAPSHOT_HEADERS_.concat(SFO_DB16_).forEach(function (k) { if (built.header.hasOwnProperty(k)) headerRow[k] = built.header[k]; });
headerRow.snapshot_id = snapId;
headerRow.shipment_id = shipmentId;
headerRow.snapshot_version = 1;
headerRow.status = 'final';
headerRow.shipping_detail_ready = readiness.shipping_detail.status;
headerRow.packing_list_ready = readiness.packing_list.status;
headerRow.commercial_invoice_ready = readiness.commercial_invoice.status;
headerRow.booking_ready = readiness.booking.status;
headerRow.customs_ready = readiness.customs.status;
headerRow.readiness_detail = JSON.stringify(readiness);
headerRow.finalized_by = actor; headerRow.finalized_at = now; headerRow.created_at = now; headerRow.updated_at = now;
return { header: headerRow,
lines: built.lines.map(function (l) { return Object.assign({}, l, { snapshot_id: snapId, shipment_id: shipmentId, created_at: now }); }),
pos: built.line_pos.map(function (p) { return Object.assign({}, p, { snapshot_id: snapId, shipment_id: shipmentId, created_at: now }); }) };
}


function sfoPrebuiltCheck_(ss, shipmentId, pb) {
var sid = sfoStr_(shipmentId), sh = sfoReadTable_(ss, 'shipments', []).filter(function (r) { return sfoStr_(r.shipment_id) === sid; })[0];
if (!pb || !pb.ok || !pb.header || sfoStr_(pb.header.shipment_id) !== sid) return { ok: false, error: 'SNAPSHOT_PREBUILT_NOT_THIS_SHIPMENT' };
if (!sh || !sfoIsDispatched_(sh)) return { ok: false, error: 'SHIPMENT_NOT_DISPATCHED', status: sfoLc_(sh && sh.status) };
var lines = sfoReadTable_(ss, 'shipment_lines', []).filter(function (l) { return sfoStr_(l.shipment_id) === sid && !(typeof sc13LineRemoved_ === 'function' && sc13LineRemoved_(l)); }), set = {};   // XCO-R15G H2
lines.forEach(function (l) { set[sfoStr_(l.shipment_line_id)] = 1; });
var ex = sfoReadExecutedAllocations_(ss, set).map(function (a) { return sfoStr_(a.shipment_line_allocation_id) + '|' + sfoNum_(a.allocated_qty); }).sort().join(',');
var pa = pb.line_pos.map(function (p) { return sfoStr_(p.shipment_line_allocation_id) + '|' + sfoNum_(p.allocated_qty); }).sort().join(',');
var ln = lines.map(function (l) { return sfoStr_(l.shipment_line_id) + '|' + sfoNum_(l.shipment_qty); }).join(','), pl = pb.lines.map(function (l) { return sfoStr_(l.shipment_line_id) + '|' + sfoNum_(l.shipment_qty); }).join(',');
return ex === pa && ln === pl ? pb : { ok: false, error: 'SNAPSHOT_PREBUILT_STALE' };
}






var SFO_DIGEST_SKIP_ = { snapshot_id: 1, snapshot_version: 1, status: 1, superseded_by: 1, superseded_reason: 1, finalized_by: 1, finalized_at: 1, created_at: 1, updated_at: 1,
dispatch_date: 1, booking_no: 1, container_no: 1, invoice_no: 1, etd: 1, eta: 1, shipping_detail_ready: 1, packing_list_ready: 1, commercial_invoice_ready: 1, booking_ready: 1,
customs_ready: 1, readiness_detail: 1, snapshot_line_id: 1, snapshot_line_po_id: 1 };
function sfoSnapshotDigest_(built, shipmentId) {
var fr = sfoFrozenRows_(built, sfoStr_(shipmentId), '', '');
function val(v) { return v === null || v === undefined ? '' : (Object.prototype.toString.call(v) === '[object Date]' ? (isNaN(v.getTime()) ? '' : v.toISOString()) : String(v)); }
function pick(o) { var r = {}; Object.keys(o).sort().forEach(function (k) { if (!SFO_DIGEST_SKIP_[k]) r[k] = val(o[k]); }); return r; }
function by(k) { return function (a, b) { return a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0; }; }
var body = JSON.stringify({ h: pick(fr.header), l: fr.lines.map(pick).sort(by('shipment_line_id')), p: fr.pos.map(pick).sort(by('shipment_line_allocation_id')) });
return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, body, Utilities.Charset.UTF_8).map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('').slice(0, 32);
}

function sfoRetryBuild_(ss, shipmentId) {
if (typeof dgsFrozenValueGate_ !== 'function') return { ok: false, error: 'SNAPSHOT_RETRY_UNPROVEN', reason: 'the value gate is not deployed with this build' };
var g = dgsFrozenValueGate_(ss, shipmentId);
if (!g.ok) return { ok: false, error: 'SNAPSHOT_RETRY_VALUES_INVALID', blockers: g.blockers || [], correction: 'correct the named master values, then retry (nothing was written)' };
if (!g.built) { var b0 = sfoBuildSnapshot_(ss, shipmentId); if (b0.ok) b0.proof = 'NO_DOCUMENTS'; return b0; }
var sid = sfoStr_(shipmentId), sh = sfoReadTable_(ss, 'shipments', []).filter(function (r) { return sfoStr_(r.shipment_id) === sid; })[0] || {};
var proof = Object.prototype.hasOwnProperty.call(sh, 'final_output_validated_digest') ? sfoStr_(sh.final_output_validated_digest) : null, dig = sfoSnapshotDigest_(g.built, sid);
if (proof === null || proof === '') return { ok: false, error: 'SNAPSHOT_RETRY_UNPROVEN', reason: proof === null ? 'shipments.final_output_validated_digest is not provisioned' : 'this shipment carries no Confirm-time proof (confirmed before it existed)', rebuilt_digest: dig,
correction: 'an Owner-approved correction re-freezes it (nothing was written)' };
if (proof !== dig) return { ok: false, error: 'SNAPSHOT_RETRY_DIFFERS_FROM_VALIDATED', validated_digest: proof, rebuilt_digest: dig, correction: 'a master value changed since Confirm - an Owner-approved correction decides (nothing was written)' };
var chk = sfoPrebuiltCheck_(ss, sid, g.built); if (chk.ok) chk.proof = 'VALIDATED_DIGEST_MATCH';
return chk;
}
function handleFinalizeShipmentFinalOutput_(body) { return sfoFinalizeWith_(body, null); }
function sfoFinalizeWith_(body, prebuilt) {
var shipmentId = sfoStr_(body && body.shipment_id);
var actor = sfoStr_(body && body.actor) || 'system';
if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });

var lock = LockService.getScriptLock();
try { if (!lock.tryLock(30000)) return jsonResponse_({ success: false, error: 'Could not acquire lock; please retry.', stage: 'lock' }); }
catch (e) { return jsonResponse_({ success: false, error: 'Lock error: ' + (e && e.message ? e.message : e), stage: 'lock' }); }
try {
var ss = SpreadsheetApp.openById(prodExpectedDbId_());
var snapId = 'SFO-' + shipmentId;
var headSheet = prodRequireSheet_(ss, 'shipment_final_output_snapshots', SFO_SNAPSHOT_HEADERS_);


var existing = sfoRowsAsObjects_(headSheet).filter(function (r) { return sfoStr_(r.shipment_id) === shipmentId && sfoLc_(r.status) !== 'superseded'; });
if (existing.length) {
return jsonResponse_({ success: true, already_finalized: true, snapshot_id: sfoStr_(existing[0].snapshot_id), shipment_id: shipmentId, note: 'Final-output snapshot already finalized (idempotent).' });
}

var built = prebuilt ? sfoPrebuiltCheck_(ss, shipmentId, prebuilt) : sfoRetryBuild_(ss, shipmentId);
if (!built.ok) return jsonResponse_({ success: false, error: built.error, detail: built, shipment_id: shipmentId, stage: prebuilt ? 'prebuilt' : 'aggregate' });

var now = shipmentTimestamp_();
var lineSheet = prodRequireSheet_(ss, 'shipment_final_output_lines', SFO_LINE_HEADERS_);
var poSheet = prodRequireSheet_(ss, 'shipment_final_output_line_pos', SFO_LINE_PO_HEADERS_);

sfoDeleteRowsFor_(lineSheet, 'shipment_id', shipmentId);
sfoDeleteRowsFor_(poSheet, 'shipment_id', shipmentId);

var readiness = built.readiness, fr = sfoFrozenRows_(built, shipmentId, actor, now);
sfoAppendByHeader_(headSheet, fr.header);
fr.lines.forEach(function (l) { sfoAppendByHeader_(lineSheet, l); });
fr.pos.forEach(function (p) { sfoAppendByHeader_(poSheet, p); });

return jsonResponse_({ success: true, finalized: true, snapshot_id: snapId, shipment_id: shipmentId,
lines: built.lines.length, po_allocations: built.line_pos.length, readiness: readiness, proof: built.proof || (prebuilt ? 'CONFIRM_VALIDATED_IN_LOCK' : '') });
} catch (err) {
return jsonResponse_({ success: false, error: 'FINAL_OUTPUT_FINALIZATION_FAILED: ' + (err && err.message ? err.message : err), shipment_id: shipmentId, note: 'Shipment remains truthfully dispatched; retry can materialize the snapshot.' });
} finally { try { lock.releaseLock(); } catch (e2) {} }
}

function sfoAppendByHeader_(sheet, obj) {
var lastCol = sheet.getLastColumn();
var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
var row = new Array(headers.length).fill('');
for (var i = 0; i < headers.length; i++) { if (obj.hasOwnProperty(headers[i]) && obj[headers[i]] !== undefined && obj[headers[i]] !== null) row[i] = obj[headers[i]]; }
sheet.appendRow(row);
}



function handleGetShipmentFinalOutput_(body) {
var shipmentId = sfoStr_(body && body.shipment_id);
if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
var ss = SpreadsheetApp.openById(prodExpectedDbId_());
var heads = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_snapshots', SFO_SNAPSHOT_HEADERS_))
.filter(function (r) { return sfoStr_(r.shipment_id) === shipmentId && sfoLc_(r.status) !== 'superseded'; });
if (!heads.length) return jsonResponse_({ success: true, finalized: false, shipment_id: shipmentId, note: 'No finalized final-output snapshot for this shipment.' });
var header = heads[0];
var snapId = sfoStr_(header.snapshot_id);
var lines = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_lines', SFO_LINE_HEADERS_)).filter(function (r) { return sfoStr_(r.snapshot_id) === snapId; });
var pos = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_line_pos', SFO_LINE_PO_HEADERS_)).filter(function (r) { return sfoStr_(r.snapshot_id) === snapId; });
var readiness = {}; try { readiness = JSON.parse(header.readiness_detail || '{}'); } catch (e) {}
return jsonResponse_({ success: true, finalized: true, snapshot_id: snapId, header: header, lines: lines, po_lineage: pos, readiness: readiness });
}

// R15G-EU D2: the actual destination country (eu-docs-39 dgsDestCountry15g_); a non-set row keeps sfoStr_(row.country) exactly.
function sfoDestCountry15g_(ss, s) { var d = dgsDestCountry15g_(ss, s); return d.set && !d.unresolved ? d.country : sfoStr_(s.country); }
// R15G-EU-DOCS-34 (sbx-r15g-eu): patched

// XCO-R15G H2: 34_ snapshot skips removed lines (sc13LineRemoved_, 12_).
// XCO-R15G-34 (xco-r15g-impl): patched
// R15G-STAMPS (final candidate): patched

// CODEX-TAX-SPLIT-1: local candidate, Owner fractional rates and separate currencies.
