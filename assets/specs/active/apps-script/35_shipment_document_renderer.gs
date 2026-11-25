var SDR_BUILD_VERSION_ = 'F1-AD3-SDR1-MC1';



































function docStr_(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
// Sheets can turn an ISO snapshot value back into a Date on read.
function docDay_(v) {
if (Object.prototype.toString.call(v) === '[object Date]') {
if (!isFinite(v.getTime())) return '';
return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}
return docStr_(v);
}
function docLc_(v) { return docStr_(v).toLowerCase(); }
function docUc_(v) { return docStr_(v).toUpperCase(); }
function docNum_(v) { if (v === null || v === undefined || v === '') return 0; var n = Number(String(v).replace(/,/g, '').trim()); return isNaN(n) ? 0 : n; }
function docAddr_(p, pre) {
return {
line1: docStr_(p[pre + 'address_line_1']), line2: docStr_(p[pre + 'address_line_2']),
city: docStr_(p[pre + 'city']), state_or_region: docStr_(p[pre + 'state_or_region']),
postal_code: docStr_(p[pre + 'postal_code']), country: docUc_(p[pre + 'country'])
};
}

function docRequire_(obj, fields) {
for (var i = 0; i < fields.length; i++) { if (!docStr_(obj[fields[i]])) return fields[i]; }
return null;
}

function docLinePos_(shipmentLineId, poLineage) {
return (poLineage || []).filter(function (p) { return docStr_(p.shipment_line_id) === docStr_(shipmentLineId); })
.map(function (p) { return { po_no: docStr_(p.po_no), allocated_qty: docNum_(p.allocated_qty), purchase_order_line_id: docStr_(p.purchase_order_line_id), purchase_order_id: docStr_(p.purchase_order_id) }; });
}
function docDistinctPoNos_(poLineage) {
var seen = {}, out = [];
(poLineage || []).forEach(function (p) { var n = docStr_(p.po_no); if (n && !seen[n]) { seen[n] = 1; out.push(n); } });
return out;
}

function docFamilyStatus_(snap, family, headerCol) {
var r = snap.readiness && snap.readiness[family];
if (r && r.status) return { status: docUc_(r.status), reason: docStr_(r.reason) };
return { status: docUc_(snap.header[headerCol]) || 'BLOCKED', reason: '' };
}



function docTotals_(lines) {
var t = { qty: 0, cartons: 0, gross_weight: 0, net_weight: 0, cbm: 0 }, u = {};
(lines || []).forEach(function (l) {
t.qty += docNum_(l.shipment_qty); t.cartons += docNum_(l.shipment_carton_qty);
t.gross_weight += docNum_(l.gross_weight); t.net_weight += docNum_(l.net_weight); t.cbm += docNum_(l.cbm);
['gross_weight', 'net_weight', 'cbm'].forEach(function (k) { if (docStr_(l[k]) === '') u[k] = 1; });   // SANDBOX-GATE-1l (K-1): one UNKNOWN line makes the total UNKNOWN
});
Object.keys(u).forEach(function (k) { t[k] = ''; });
return t;
}



function docHeaderBlock_(h, lines, poLineage) {
var o = {
shipment_id: docStr_(h.shipment_id), shipment_no: docStr_(h.shipment_no), reference_id: docStr_(h.reference_id),
dispatch_date: docDay_(h.dispatch_date), etd: docDay_(h.etd), eta: docDay_(h.eta),
company: docUc_(h.company), country: docUc_(h.country), marketplace: docStr_(h.marketplace),
shipper: { legal_name: docStr_(h.shipper_legal_name), display_name: docStr_(h.shipper_display_name), country: docUc_(h.shipper_country), tax_or_business_id: docStr_(h.shipper_tax_or_business_id), address: docAddr_(h, 'shipper_') },
seller_of_record: { legal_name: docStr_(h.seller_of_record_legal_name) },
consignee: { name: docStr_(h.consignee_name), warehouse_id: docStr_(h.consignee_warehouse_id), location_id: docStr_(h.consignee_location_id), address: docAddr_(h, 'consignee_') },
consignee_address: [docStr_(h.consignee_address_line_1), docStr_(h.consignee_address_line_2)].filter(String).join(', '),
carrier_name: docStr_(h.carrier_name), shipping_method: docStr_(h.shipping_method),
factory: { id: docStr_(h.factory_id), name: docStr_(h.factory_name) },
po_numbers: docDistinctPoNos_(poLineage),
totals: docTotals_(lines)
};
SFO_DB16_.forEach(function (k) { if (k in h) o[k] = docStr_(h[k]); });
if ('ship_to' in h) o.ship_to = docStr_(h.ship_to);
return o;
}


function docRenderShippingDetail_(snap) {
var gate = docFamilyStatus_(snap, 'shipping_detail', 'shipping_detail_ready');
if (gate.status !== 'READY') return { ok: false, blocked: true, document_type: 'SHIPDETAIL', reason: gate.reason || 'NOT_READY' };
var h = snap.header;
var miss = docRequire_(h, ['shipment_id', 'shipper_legal_name', 'consignee_name']);
if (miss || !(snap.lines && snap.lines.length)) return { ok: false, error: 'FINAL_OUTPUT_REQUIRED_FIELD_GAP', document_type: 'SHIPDETAIL', missing: miss || 'lines' };
var lines = snap.lines.map(function (l) {
return {
shipment_line_id: docStr_(l.shipment_line_id),   /* XCO-R15G: the line identity for the G3 company lookup */ sku: docStr_(l.sku), site_sku: docStr_(l.site_sku),
product_name_en: docStr_(l.product_name_en), product_name_cn: docStr_(l.product_name_cn),
shipment_qty: docNum_(l.shipment_qty),
units_per_carton: docNum_(l.units_per_carton), carton_qty: docNum_(l.shipment_carton_qty),
carton_no_start: docStr_(l.carton_no_start), carton_no_end: docStr_(l.carton_no_end),
gs1_code: docStr_(l.gs1_code), gs1_type: docStr_(l.gs1_type),
country_of_origin: docUc_(l.country_of_origin), hs_code: docStr_(l.hs_code),

declared_currency: docUc_(l.declared_currency), declared_unit_value: docNum_(l.declared_unit_value), declared_total_value: docNum_(l.declared_unit_value) * docNum_(l.shipment_qty),
gross_weight: docNum_(l.gross_weight), net_weight: docNum_(l.net_weight), cbm: docNum_(l.cbm),
carton_length: docNum_(l.carton_length), carton_width: docNum_(l.carton_width), carton_height: docNum_(l.carton_height),
po_allocations: docLinePos_(l.shipment_line_id, snap.po_lineage)
};
});
var hb = docHeaderBlock_(h, snap.lines, snap.po_lineage);
// AD3-B (Owner rule 九): what is not known is shown as PENDING, never invented (no carrier label, tracking, booking or cost is made up)
hb.carrier_display = docStr_(h.carrier_name) || docStr_(h.carrier_id) || '待指定 (pending)';
hb.freight_cost_status = docStr_(h.rate_card_id) ? 'QUOTED' : '待補 (pending)';
return { ok: true, document_type: 'SHIPDETAIL', template_key: 'SHIPDETAIL_STANDARD',
shipment_id: docStr_(h.shipment_id), snapshot_id: docStr_(h.snapshot_id), snapshot_version: docNum_(h.snapshot_version),
header: hb, lines: lines };
}


function docRenderPackingList_(snap) {
var gate = docFamilyStatus_(snap, 'packing_list', 'packing_list_ready');
if (gate.status !== 'READY') return { ok: false, blocked: true, document_type: 'PL', reason: gate.reason || 'NOT_READY' };
var h = snap.header;
var miss = docRequire_(h, ['shipment_id', 'consignee_name']);
if (miss || !(snap.lines && snap.lines.length)) return { ok: false, error: 'FINAL_OUTPUT_REQUIRED_FIELD_GAP', document_type: 'PL', missing: miss || 'lines' };
var lines = snap.lines.map(function (l) {
return {
shipment_line_id: docStr_(l.shipment_line_id),   /* XCO-R15G: the line identity for the G3 company lookup */ sku: docStr_(l.sku), product_name_en: docStr_(l.product_name_en),
shipment_qty: docNum_(l.shipment_qty),
units_per_carton: docNum_(l.units_per_carton), carton_qty: docNum_(l.shipment_carton_qty),
carton_no_start: docStr_(l.carton_no_start), carton_no_end: docStr_(l.carton_no_end),
gross_weight: docNum_(l.gross_weight), net_weight: docNum_(l.net_weight), cbm: docNum_(l.cbm),
carton_length: docNum_(l.carton_length), carton_width: docNum_(l.carton_width), carton_height: docNum_(l.carton_height),
po_allocations: docLinePos_(l.shipment_line_id, snap.po_lineage)
};
});
return { ok: true, document_type: 'PL', template_key: 'PL_STANDARD',
shipment_id: docStr_(h.shipment_id), snapshot_id: docStr_(h.snapshot_id), snapshot_version: docNum_(h.snapshot_version),
header: docHeaderBlock_(h, snap.lines, snap.po_lineage), lines: lines };
}







function docRenderCommercialInvoice_(snap) {
var gate = docFamilyStatus_(snap, 'commercial_invoice', 'commercial_invoice_ready');
if (gate.status !== 'READY') return { ok: false, blocked: true, document_type: 'CI', reason: gate.reason || 'NOT_READY' };
var h = snap.header;
var miss = docRequire_(h, ['shipment_id', 'shipper_legal_name', 'consignee_name']);
if (miss || !(snap.lines && snap.lines.length)) return { ok: false, error: 'FINAL_OUTPUT_REQUIRED_FIELD_GAP', document_type: 'CI', missing: miss || 'lines' };
var invoiceTotal = 0;
var lines = snap.lines.map(function (l) {
var qty = docNum_(l.shipment_qty), unit = docNum_(l.declared_unit_value), total = unit * qty;
invoiceTotal += total;
return {
shipment_line_id: docStr_(l.shipment_line_id),   /* XCO-R15G: the line identity for the G3 company lookup */ sku: docStr_(l.sku), site_sku: docStr_(l.site_sku),
description: docStr_(l.product_name_en), product_name_cn: docStr_(l.product_name_cn),
shipment_qty: qty, units_per_carton: docNum_(l.units_per_carton), carton_qty: docNum_(l.shipment_carton_qty),
carton_no_start: docStr_(l.carton_no_start), carton_no_end: docStr_(l.carton_no_end),
hs_code: docStr_(l.hs_code), country_of_origin: docUc_(l.country_of_origin),
declared_currency: docUc_(l.declared_currency), declared_unit_value: unit, declared_total_value: total,
gross_weight: docNum_(l.gross_weight), net_weight: docNum_(l.net_weight), cbm: docNum_(l.cbm),
po_allocations: docLinePos_(l.shipment_line_id, snap.po_lineage)
};
});

var currencies = {}; lines.forEach(function (l) { if (l.declared_currency) currencies[l.declared_currency] = 1; });
var curList = Object.keys(currencies);
if (curList.length > 1) return { ok: false, error: 'COMMERCIAL_INVOICE_CURRENCY_CONFLICT', document_type: 'CI', currencies: curList };
var header = docHeaderBlock_(h, snap.lines, snap.po_lineage);
header.invoice_no = docStr_(h.invoice_no);
header.invoice_date = docDay_(h.dispatch_date) || docDay_(h.etd);
header.currency = docUc_(h.currency) || curList[0] || '';
header.invoice_total_value = invoiceTotal;
header.booking_no = docStr_(h.booking_no);
header.container_no = docStr_(h.container_no);
return { ok: true, document_type: 'CI', template_key: 'COMMERCIAL_INVOICE_STANDARD',
shipment_id: docStr_(h.shipment_id), snapshot_id: docStr_(h.snapshot_id), snapshot_version: docNum_(h.snapshot_version),
header: header, lines: lines };
}





var DOC_CI_UNRESOLVED_AUTHORITY_ = {
INCOTERM: 'No canonical owner. Not on shipments, carriers, carrier_rate_cards or the R2B snapshot.',
PAYMENT_TERMS: 'No canonical owner. purchase_orders carries factory payment terms, which are not the export sale terms.',
PORT_OF_LOADING: 'No canonical owner in the frozen snapshot. shipment_routes holds nodes but is not a snapshot input.',
PORT_OF_DISCHARGE: 'No canonical owner in the frozen snapshot. Same limitation as PORT_OF_LOADING.',
IMPORTER_OF_RECORD: 'Genuinely governed by LEGAL_IMPORTER_AUTHORITY_GAP (R2A) — a legal-authority boundary, not a document limitation.'
};






function docCiFieldAuthorityReport_(fieldRows) {
var mapped = {};
(fieldRows || []).forEach(function (f) {
var p = docUc_(f.placeholder);
if (!DOC_CI_UNRESOLVED_AUTHORITY_[p]) return;
var activeRow = !(docLc_(f.is_active) === 'false' || docStr_(f.is_active) === '0');
var required = activeRow && docStr_(f.required) && docLc_(f.required) !== 'false' && docLc_(f.required) !== '0';
if (!mapped[p] || required) mapped[p] = { required: !!required, active: activeRow };
});
var out = [];
Object.keys(DOC_CI_UNRESOLVED_AUTHORITY_).forEach(function (p) {
var m = mapped[p];
out.push({
placeholder: p,
state: !m ? 'NOT_MAPPED' : (m.required ? 'REQUIRED_UNRESOLVED' : 'OPTIONAL_UNRESOLVED'),
required_by_active_template: !!(m && m.required),
resolved: false,
blocks_document: !!(m && m.required),
detail: DOC_CI_UNRESOLVED_AUTHORITY_[p]
});
});
return out;
}
function docCiUnresolvedFields_(fieldRows) {
var out = [];
(fieldRows || []).forEach(function (f) {
var p = docUc_(f.placeholder);
if (DOC_CI_UNRESOLVED_AUTHORITY_[p] && docStr_(f.required) && docLc_(f.required) !== 'false' && docLc_(f.required) !== '0') {
out.push({ placeholder: p, reason: 'DOCUMENT_FIELD_AUTHORITY_MISSING', detail: DOC_CI_UNRESOLVED_AUTHORITY_[p] });
}
});
return out;
}



function docReadSnapshot_(ss, shipmentId) {
var sid = docStr_(shipmentId);
var heads = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_snapshots', SFO_SNAPSHOT_HEADERS_))
.filter(function (r) { return docStr_(r.shipment_id) === sid && docLc_(r.status) !== 'superseded'; });
if (!heads.length) return null;
var header = heads[0], snapId = docStr_(header.snapshot_id);
var lines = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_lines', SFO_LINE_HEADERS_)).filter(function (r) { return docStr_(r.snapshot_id) === snapId; });
var pos = sfoRowsAsObjects_(prodRequireSheet_(ss, 'shipment_final_output_line_pos', SFO_LINE_PO_HEADERS_)).filter(function (r) { return docStr_(r.snapshot_id) === snapId; });
var readiness = {}; try { readiness = JSON.parse(header.readiness_detail || '{}'); } catch (e) {}
return { header: header, lines: lines, po_lineage: pos, readiness: readiness };
}

var DOC_SUPPORTED_ = { SHIPDETAIL: 1, PL: 1, CI: 1 };




function docRenderCarrierSet_(snap) {
var sd = docRenderShippingDetail_(snap), ci = sd.ok && docRenderCommercialInvoice_(snap), sl = snap.lines || [];
if (!sd.ok) return sd;
if (!ci.ok) return ci;
if (sd.lines.length !== sl.length || ci.lines.length !== sl.length || sd.lines.some(function (l, i) { return l.sku !== ci.lines[i].sku || l.sku !== docStr_(sl[i].sku); })) return { ok: false, error: 'CARRIER_SET_MODEL_MISALIGNED' };
return { ok: true, document_type: 'BOOKING', template_key: 'CARRIER_SET', shipment_id: sd.shipment_id, snapshot_id: sd.snapshot_id, snapshot_version: sd.snapshot_version,
header: Object.assign({}, sd.header, ci.header, { warehouse_code: docStr_(snap.header.warehouse_code) }),
lines: sd.lines.map(function (l, i) { var o = Object.assign({}, l, ci.lines[i]); ['material', 'product_use', 'battery_type', 'magnet_type'].forEach(function (k) { if (k in sl[i]) o[k] = sl[i][k]; }); return o; }) };
}
var DOC_LINE_FACTS_ = ['product_name_en', 'product_name_cn', 'carton_length', 'carton_width', 'carton_height', 'material', 'product_use', 'battery_type', 'magnet_type'], DOC_HEADER_FACTS_ = ['warehouse_code', 'invoice_no'];
function docRenderByClass_(renderKey, snap) {
var m = docRenderByClass0_(renderKey, snap), sl = (snap && snap.lines) || [];
if (m && m.ok && m.lines && m.lines.length === sl.length && m.lines.every(function (l, i) { return docStr_(l.sku) === docStr_(sl[i].sku); }))
m.lines.forEach(function (l, i) { SFO_DB16L_.concat(SFO_DB16A_, SFO_DB16U_).forEach(function (k) { if (k in sl[i]) l[k] = sl[i][k]; });
DOC_LINE_FACTS_.forEach(function (k) { if (k in sl[i] && !(k in l)) l[k] = sl[i][k]; }); });
if (m && m.ok && m.header && snap && snap.header) DOC_HEADER_FACTS_.forEach(function (k) { if (k in snap.header && !(k in m.header)) m.header[k] = docStr_(snap.header[k]); });
return docMixedCartons_(m, snap, renderKey);
}
function docMixedCartons_(model, snap, family) {
if (!model || !model.ok || !(snap.lines || []).some(function (l) {return String(l.note).indexOf('[KMPACK1:')>=0;})) return model;
try {
  var parts = KMPACK.portions(mcpRecords_(snap.lines,'snapshot'),family), byId={}, allocations={};
  model.lines.forEach(function (l) {byId[String(l.shipment_line_id)]=l;});
  snap.lines.forEach(function(l){
    var po=docLinePos_(l.shipment_line_id,snap.po_lineage).map(function(a){return Object.assign({},a);});
    if(po.length && (po.some(function(a){return !Number.isSafeInteger(a.allocated_qty)||a.allocated_qty<0;}) || po.reduce(function(n,a){return n+a.allocated_qty;},0)!==Number(l.shipment_qty))) throw new Error('MIXED_PACKING_PO_QTY_MISMATCH');
    allocations[String(l.shipment_line_id)]=po;
  });
  var result=Object.assign({},model);
  result.lines=parts.map(function (p) {
    var row=Object.assign({},byId[p.id]);
    Object.assign(row,{shipment_qty:p.quantity,carton_qty:p.cartons,carton_no_start:String(p.start),carton_no_end:String(p.end),
      gross_weight:p.grossKg===null?'':p.grossKg,net_weight:p.netKg===null?'':p.netKg,cbm:p.cbm===null?'':p.cbm,
      declared_unit_value:p.unitValue===null?'':p.unitValue,declared_total_value:p.declaredTotal===null?'':p.declaredTotal,
      packing_group:p.groupId,packing_series:p.series,packing_members:p.members,mixed_carton:p.mixed});
    if (p.box && p.box.length) {var f={cm:1,mm:0.1,m:100,in:2.54,inch:2.54}[String(p.box.unit).toLowerCase()];
      row.carton_length=p.box.length*f;row.carton_width=p.box.width*f;row.carton_height=p.box.height*f;row.carton_weight=p.box.grossKg;}
    row.po_allocations=[];
    p.members.forEach(function (a) {
      var remaining=a.quantity;
      (allocations[a.id]||[]).forEach(function(po){var take=Math.min(remaining,po.allocated_qty);if(take>0){row.po_allocations.push(Object.assign({},po,{allocated_qty:take}));po.allocated_qty-=take;remaining-=take;}});
      if((allocations[a.id]||[]).length && remaining) throw new Error('MIXED_PACKING_PO_QTY_MISMATCH');
    });
    return row;
  });
  return result;
} catch(e) {return {ok:false,error:e.code || 'MIXED_PACKING_INVALID',document_type:family};}
}
function docRenderByClass0_(renderKey, snap) {
if (renderKey === 'SHIPDETAIL') return docRenderShippingDetail_(snap);
if (renderKey === 'PL') return docRenderPackingList_(snap);
if (renderKey === 'CI') return docRenderCommercialInvoice_(snap);
if (renderKey === 'BOOKING') return docRenderCarrierSet_(snap);
return { ok: false, error: 'UNSUPPORTED_DOCUMENT_TYPE', document_type: String(renderKey || ''),
note: 'Carrier Booking (BOOKING) has no render model yet - CARRIER_BOOKING_MAPPING_SPEC.md defines the mapping, the runtime is deferred.' };
}




function handleRenderShipmentDocument_(body) {
var shipmentId = docStr_(body && body.shipment_id);
var docType = docUc_(body && body.document_type);
if (!shipmentId) return jsonResponse_({ success: false, error: 'SHIPMENT_ID_REQUIRED' });
if (!DOC_SUPPORTED_[docType]) return jsonResponse_({ success: false, error: 'UNSUPPORTED_DOCUMENT_TYPE', supported: ['SHIPDETAIL', 'PL', 'CI'], note: 'BOOKING / CUSTOMS renderers remain deferred.' });
var ss = SpreadsheetApp.openById(prodExpectedDbId_());
var snap = docReadSnapshot_(ss, shipmentId);
if (!snap) return jsonResponse_({ success: true, finalized: false, shipment_id: shipmentId, note: 'No finalized final-output snapshot — run finalizeShipmentFinalOutput first.' });
var model = docRenderByClass_(docType, snap);
if (!model.ok) return jsonResponse_({ success: false, shipment_id: shipmentId, document_type: docType, blocked: model.blocked || false, error: model.error || 'DOCUMENT_NOT_READY', reason: model.reason, missing: model.missing });

return jsonResponse_({ success: true, shipment_id: shipmentId, document: model, persisted: false,
note: 'Rendered from the frozen R2B snapshot (presentation only). Persisted document record + placeholder mapping deferred to R3B.' });
}

// XCO-R15G: document model lines keep shipment_line_id.
// XCO-R15G-35 (xco-r15g-impl): patched
