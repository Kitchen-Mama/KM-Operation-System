// F1-5C-EXPORT-R3A — Shipping Detail / Packing List renderer over the frozen R2B snapshot.
// Proves: renderer is presentation-only over shipment_final_output_* (never live masters); physical qty = snapshot
// shipment_qty; multi-PO lineage preserved (never collapsed); GS1 != units_per_carton; shipper/consignee/factory from
// frozen snapshot (factory != company); readiness fails closed; customs gap never blocks SD/PL; no FIFO / no gap /
// forecast / recommendation recompute; persisted generated-document layer HALTed. Pure block eval'd; I/O source-guarded.
// Run: node assets/tests/shipment-document-renderer-f1-5c-export-r3a.test.js
// NOTE: no 'use strict' — extracted pure helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var GS = read('specs/active/apps-script/35_shipment_document_renderer.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
eval(slice(GS, '// __DOC_PURE_START__', '// __DOC_PURE_END__'));

// frozen-snapshot builders
function hdr(o) { o = o || {}; return Object.assign({
  shipment_id: 'S1', snapshot_id: 'SFO-S1', snapshot_version: 1, shipment_no: 'SH-001', dispatch_date: '2026-08-10',
  company: 'KM', country: 'US', marketplace: 'amazon',
  shipper_legal_name: 'Kitchen Mama LLC', shipper_display_name: 'Kitchen Mama', shipper_country: 'US', shipper_tax_or_business_id: 'EIN-1',
  shipper_address_line_1: '1 Main St', shipper_city: 'Town', shipper_state_or_region: 'CA', shipper_postal_code: '90001',
  seller_of_record_legal_name: 'Kitchen Mama LLC',
  consignee_name: 'Amazon FTW1', consignee_warehouse_id: 'WH-KM-US-FBA-1', consignee_location_id: 'LL-1',
  consignee_address_line_1: '33 Dock Rd', consignee_city: 'Fort Worth', consignee_state_or_region: 'TX', consignee_postal_code: '76177', consignee_country: 'US',
  carrier_name: 'Sinotrans', shipping_method: 'sea', factory_id: 'FAC-A', factory_name: 'Factory A',
  shipment_total_qty: 800, shipment_total_cartons: 40, shipment_total_gross_weight: 500, shipment_total_net_weight: 450, shipment_total_cbm: 3.2,
  shipping_detail_ready: 'READY', packing_list_ready: 'READY', customs_ready: 'BLOCKED'
}, o); }
function ln(o) { o = o || {}; return Object.assign({
  shipment_line_id: 'SL-1', sku: 'GA0450', site_sku: 'KM-GA0450-US', product_name_en: 'Can Opener', product_name_cn: '開罐器',
  shipment_qty: 800, units_per_carton: 20, shipment_carton_qty: 40, carton_no_start: '1', carton_no_end: '40',
  gs1_code: '0123456789012', gs1_type: 'UPC', country_of_origin: 'CN', hs_code: '8205.51', declared_currency: 'USD',
  declared_unit_value: 2, declared_total_value: 1600, gross_weight: 500, net_weight: 450, cbm: 3.2,
  carton_length: 40, carton_width: 30, carton_height: 25 }, o); }
function po(o) { return { shipment_line_id: o.line, po_no: o.po, allocated_qty: o.qty, purchase_order_line_id: o.pol, purchase_order_id: o.poid || ('PO-' + o.po) }; }
var RD = { shipping_detail: { status: 'READY' }, packing_list: { status: 'READY' }, commercial_invoice: { status: 'READY' }, booking: { status: 'READY' }, customs: { status: 'BLOCKED', reason: 'LEGAL_IMPORTER_AUTHORITY_GAP' } };
function snap(o) { o = o || {}; return { header: o.header || hdr(), lines: o.lines || [ln()], po_lineage: o.po || [po({ line: 'SL-1', po: 'KM-PO-1', qty: 800, pol: 'POL-1' })], readiness: o.readiness || RD }; }

console.log('\n== A/B single & multi-SKU Shipping Detail ==');
var A = docRenderShippingDetail_(snap());
ok(A.ok && A.lines.length === 1, 'A single-SKU SD renders');
var B = docRenderShippingDetail_(snap({ lines: [ln(), ln({ shipment_line_id: 'SL-2', sku: 'GA0451', shipment_qty: 100 })], po: [po({ line: 'SL-1', po: 'KM-PO-1', qty: 800, pol: 'POL-1' }), po({ line: 'SL-2', po: 'KM-PO-1', qty: 100, pol: 'POL-9' })] }));
ok(B.ok && B.lines.length === 2, 'B multi-SKU SD renders 2 lines');

console.log('\n== C/D single- & multi-PO lineage (never collapsed) ==');
eq(docRenderShippingDetail_(snap()).lines[0].po_allocations.length, 1, 'C single-PO line -> 1 allocation');
var dSnap = snap({ po: [po({ line: 'SL-1', po: 'KM-PO-A', qty: 500, pol: 'POL-A' }), po({ line: 'SL-1', po: 'KM-PO-B', qty: 300, pol: 'POL-B' })] });
var D = docRenderShippingDetail_(dSnap);
eq(D.lines[0].po_allocations.length, 2, 'D multi-PO line -> 2 allocations (not collapsed)');
eq(D.lines[0].po_allocations.map(function (p) { return [p.po_no, p.allocated_qty]; }), [['KM-PO-A', 500], ['KM-PO-B', 300]], 'D both PO numbers + quantities preserved');
eq(D.header.po_numbers.sort(), ['KM-PO-A', 'KM-PO-B'], 'D header PO numbers distinct list');

console.log('\n== E/F physical qty = snapshot shipment_qty (not PO ordered/completed) ==');
eq(docRenderShippingDetail_(snap()).lines[0].shipment_qty, 800, 'E line physical qty = snapshot shipment_qty (800)');
var renderSrc = slice(GS, '// __DOC_PURE_START__', '// __DOC_PURE_END__');
ok(!/ordered_qty|completed_qty|recommended_qty|requested_qty|remaining_qty/.test(renderSrc), 'F renderer never reads PO ordered/completed/recommended/remaining qty');

console.log('\n== G/H GS1 barcode vs units_per_carton (distinct) ==');
var g = docRenderShippingDetail_(snap()).lines[0];
eq(g.gs1_code, '0123456789012', 'G gs1_code from snapshot'); eq(g.gs1_type, 'UPC', 'G gs1_type from snapshot');
ok(g.units_per_carton === 20 && g.gs1_code !== '20', 'H units_per_carton (20) is a distinct field, not the GS1 barcode');

console.log('\n== I/J shipper & consignee from frozen snapshot ==');
eq(A.header.shipper.legal_name, 'Kitchen Mama LLC', 'I shipper from snapshot header'); eq(A.header.shipper.address.postal_code, '90001', 'I shipper address frozen');
eq(A.header.consignee.name, 'Amazon FTW1', 'J consignee from snapshot header'); eq(A.header.consignee.address.state_or_region, 'TX', 'J consignee address frozen');

console.log('\n== K/L factory != company (shared factory valid) ==');
eq(A.header.factory.id, 'FAC-A', 'K factory frozen from snapshot');
var twSnap = snap({ header: hdr({ company: 'ResTW', shipper_legal_name: 'Res Taiwan Ltd', factory_id: 'FAC-A', factory_name: 'Factory A' }) });
var TW = docRenderShippingDetail_(twSnap);
ok(TW.header.shipper.legal_name !== A.header.shipper.legal_name && TW.header.factory.id === A.header.factory.id, 'L KM vs ResTW share Factory A but keep distinct shippers (factory does not determine company)');

console.log('\n== M/N immutability: renderer is a pure fn of the snapshot; reads no live masters ==');
eq(docRenderShippingDetail_(snap()), docRenderShippingDetail_(snap()), 'M same snapshot -> identical output (deterministic; master edits cannot leak in)');
ok(!/partyResolve|skuRegionalLookup_|procurementResolveFactoryId_|sfoResolveCustoms_|sfoSkuMasterMap_|sfoBuildSnapshot_|procurementMarketplaceSkuMap_/.test(GS), 'N renderer/reader NEVER calls a master resolver');
ok(!/'sku_details'|'tax_referral_rates'|'company_legal_entities'|'logistics_locations'|'warehouses'|'carriers'|'purchase_order/.test(GS), 'N reads NO live master/operational tables (snapshot only)');
var reader = slice(GS, 'function docReadSnapshot_', 'var DOC_SUPPORTED_');
ok(/shipment_final_output_snapshots/.test(reader) && /shipment_final_output_lines/.test(reader) && /shipment_final_output_line_pos/.test(reader), 'N reader consumes ONLY the 3 frozen snapshot tables');

console.log('\n== O/P no FIFO / no recommendation-gap-forecast recompute ==');
ok(!/order_date|slaFifoCompare_|\.sort\(function[\s\S]{0,60}po_no/.test(GS), 'O no FIFO ordering in renderer');
ok(!/\bgap\b|\bforecast\b|recommendation|avg_sales|projection/i.test(GS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')), 'P no gap/forecast/recommendation recompute');

console.log('\n== Q missing required snapshot field -> fail closed ==');
var qOut = docRenderShippingDetail_(snap({ header: hdr({ consignee_name: '' }) }));
eq(qOut.error, 'FINAL_OUTPUT_REQUIRED_FIELD_GAP', 'Q blank required field -> FINAL_OUTPUT_REQUIRED_FIELD_GAP'); eq(qOut.missing, 'consignee_name', 'Q reports the exact missing field');

console.log('\n== R/S/T readiness gating ==');
ok(docRenderShippingDetail_(snap()).ok, 'R SD READY renders');
ok(docRenderPackingList_(snap()).ok, 'S PL READY renders');
var blocked = docRenderShippingDetail_(snap({ readiness: { shipping_detail: { status: 'BLOCKED', reason: 'MISSING_BASE_FACTS' } } }));
eq(blocked.ok, false, 'SD BLOCKED fails closed'); eq(blocked.reason, 'MISSING_BASE_FACTS', 'SD blocked returns exact reason');
// customs BLOCKED must NOT block SD/PL
var tSnap = snap({ readiness: { shipping_detail: { status: 'READY' }, packing_list: { status: 'READY' }, customs: { status: 'BLOCKED', reason: 'LEGAL_IMPORTER_AUTHORITY_GAP' } } });
ok(docRenderShippingDetail_(tSnap).ok && docRenderPackingList_(tSnap).ok, 'T customs BLOCKED does NOT block Shipping Detail / Packing List');

console.log('\n== U/V idempotent, lineage-tagged; persisted generated-doc HALTed ==');
eq(docRenderShippingDetail_(snap()).template_key, 'SHIPDETAIL_STANDARD', 'V model carries template_key (frozen convention)');
ok(A.shipment_id === 'S1' && A.snapshot_id === 'SFO-S1' && A.snapshot_version === 1, 'V lineage -> shipment + snapshot + version');
ok(/persisted: false/.test(GS) && /Persisted generated-document record is intentionally NOT written/.test(GS), 'U/§9 R3A does NOT persist a generated document (idempotent read; persistence HALTed)');

console.log('\n== W no second engine; §9/§14 persisted document layer HALTed (not built) ==');
var codeOnly = GS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/prodMigrateCreateSheet_\s*\(|prodMigrateAppendColumns_\s*\(/.test(codeOnly), 'W no migration twin invoked (no new document tables created)');
ok(!/generated_documents|document_templates|document_template_fields/.test(codeOnly), 'W renderer does NOT create/write generated_documents / document_templates / document_template_fields');
ok(!/SFO_SNAPSHOT_HEADERS_ =|SFO_LINE_HEADERS_ =|function sfoBuildSnapshot_/.test(GS), 'W no second aggregator / re-declared snapshot schema (reuses R2B authority)');

console.log('\n== router: one render action ==');
ok(/action === 'renderShipmentDocument'/.test(ROUTER) && /handleRenderShipmentDocument_\(body\)/.test(ROUTER), 'renderShipmentDocument routed');

console.log('\n----------------------------------------');
console.log('SHIPMENT DOCUMENT RENDERER (F1-5C-EXPORT-R3A): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
