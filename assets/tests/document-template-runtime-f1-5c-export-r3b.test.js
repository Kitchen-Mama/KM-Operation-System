// F1-5C-EXPORT-R3B — document_templates / document_template_fields / generated_documents runtime.
// Proves: deterministic single-template resolution (fail-closed NOT_CONFIGURED/AMBIGUOUS); placeholder mapping from
// the R3A render model through document_template_fields (scalar + line + allocation collections); required-missing
// fail-closed; physical qty = snapshot shipment_qty; multi-PO preserved; GS1 != units_per_carton; shipper/consignee
// from frozen model; no live-master lookup / no FIFO / no recompute; idempotent generated-document lifecycle. Pure
// block eval'd; I/O + governance source-guarded.
// Run: node assets/tests/document-template-runtime-f1-5c-export-r3b.test.js
// NOTE: no 'use strict' — extracted pure helpers are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var GS = read('specs/active/apps-script/36_document_template_handlers.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
eval(slice(GS, '// __DOCTPL_PURE_START__', '// __DOCTPL_PURE_END__'));

// fixtures
function tmpl(o) { o = o || {}; return Object.assign({ template_id: 'TPL-SHIPDETAIL-STANDARD-V1', template_key: 'SHIPDETAIL_STANDARD',
  document_type: 'shipment_detail', status: 'active', is_active: true, template_version: 1,
  series: '', sku: '', supplier_id: '', factory_id: '', carrier_id: '', country: '', marketplace: '', language: '',
  effective_from: '', effective_to: '' }, o); }
function fld(o) { return Object.assign({ field_id: 'F', template_id: 'TPL-SHIPDETAIL-STANDARD-V1', field_type: 'scalar', data_scope: 'header',
  data_source_table: '', data_source_field: '', data_source_path: '', collection_key: '', sort_order: 1, required: false,
  default_value: '', format_rule: '', transform_rule: '', fallback_rule: '', is_active: true }, o); }

var MODEL = { ok: true, document_type: 'SHIPDETAIL', template_key: 'SHIPDETAIL_STANDARD', shipment_id: 'S1', snapshot_id: 'SFO-S1', snapshot_version: 1,
  header: { shipment_no: 'SH-001', dispatch_date: '2026-08-10', company: 'KM', country: 'US', marketplace: 'amazon',
    shipper: { legal_name: 'Kitchen Mama LLC', address: { line1: '1 Main St' } }, consignee: { name: 'Amazon FTW1', address: { line1: '33 Dock Rd' } },
    carrier_name: 'Sinotrans', shipping_method: 'sea', factory: { id: 'FAC-A', name: 'Factory A' }, po_numbers: ['KM-PO-A', 'KM-PO-B'], totals: { qty: 800, cartons: 40 } },
  lines: [{ sku: 'GA0450', site_sku: 'KM-GA0450-US', product_name_en: 'Can Opener', shipment_qty: 800, units_per_carton: 20, gs1_code: '0123456789012', gs1_type: 'UPC', hs_code: '8205.51', country_of_origin: 'CN', declared_total_value: 1600,
    po_allocations: [{ po_no: 'KM-PO-A', allocated_qty: 500, purchase_order_line_id: 'POL-A' }, { po_no: 'KM-PO-B', allocated_qty: 300, purchase_order_line_id: 'POL-B' }] }] };

var FIELDS = [
  fld({ placeholder: 'SHIPMENT_NO', data_source_path: 'header.shipment_no', required: true, sort_order: 1 }),
  fld({ placeholder: 'SHIPPER_NAME', data_source_path: 'header.shipper.legal_name', required: true, sort_order: 2 }),
  fld({ placeholder: 'CONSIGNEE_NAME', data_source_path: 'header.consignee.name', required: true, sort_order: 3 }),
  fld({ placeholder: 'TOTAL_QTY', data_source_path: 'header.totals.qty', format_rule: 'number', sort_order: 4 }),
  fld({ placeholder: 'OPT_BLANK', data_source_path: 'header.nonexistent', required: false, sort_order: 5 }),
  fld({ placeholder: 'LINE_ITEMS', field_type: 'collection', data_scope: 'line', collection_key: 'LI', sort_order: 10 }),
  fld({ placeholder: 'SKU', field_type: 'collection_item', collection_key: 'LI', data_source_field: 'sku', required: true, sort_order: 11 }),
  fld({ placeholder: 'QTY', field_type: 'collection_item', collection_key: 'LI', data_source_field: 'shipment_qty', format_rule: 'number', sort_order: 12 }),
  fld({ placeholder: 'UPC', field_type: 'collection_item', collection_key: 'LI', data_source_field: 'units_per_carton', format_rule: 'number', sort_order: 13 }),
  fld({ placeholder: 'GS1_CODE', field_type: 'collection_item', collection_key: 'LI', data_source_field: 'gs1_code', sort_order: 14 }),
  fld({ placeholder: 'PO_ALLOCATIONS', field_type: 'collection', data_scope: 'allocation', collection_key: 'PA', sort_order: 20 }),
  fld({ placeholder: 'PO_NO', field_type: 'collection_item', collection_key: 'PA', data_source_field: 'po_no', sort_order: 21 }),
  fld({ placeholder: 'ALLOC_QTY', field_type: 'collection_item', collection_key: 'PA', data_source_field: 'allocated_qty', format_rule: 'number', sort_order: 22 })
];

console.log('\n== A/B/C template resolution (deterministic single; fail closed) ==');
eq(dtResolveTemplate_([tmpl()], { document_type: 'shipment_detail', country: 'US' }).ok, true, 'A exactly one SHIPDETAIL template resolves');
eq(dtResolveTemplate_([], { document_type: 'shipment_detail' }).error, 'DOCUMENT_TEMPLATE_NOT_CONFIGURED', 'B no template -> DOCUMENT_TEMPLATE_NOT_CONFIGURED');
eq(dtResolveTemplate_([tmpl(), tmpl({ template_id: 'TPL-SHIPDETAIL-STANDARD-V2' })], { document_type: 'shipment_detail' }).error, 'DOCUMENT_TEMPLATE_AMBIGUOUS', 'C two active matches -> DOCUMENT_TEMPLATE_AMBIGUOUS (no latest/first pick)');
ok(!dtResolveTemplate_([tmpl({ status: 'draft' })], { document_type: 'shipment_detail' }).ok, 'draft template not resolved');
ok(!dtResolveTemplate_([tmpl({ country: 'CA' })], { document_type: 'shipment_detail', country: 'US' }).ok, 'scope mismatch (CA vs US) not resolved');
ok(dtResolveTemplate_([tmpl({ country: 'US' })], { document_type: 'shipment_detail', country: 'US' }).ok, 'scoped template matches its scope');

console.log('\n== D/E/F placeholder mapping + required/optional ==');
var M = dtMapPlaceholders_(MODEL, FIELDS);
eq(M.values.SHIPMENT_NO, 'SH-001', 'D scalar maps via data_source_path');
eq(M.values.TOTAL_QTY, 800, 'D number format applied');
eq(M.missing.length, 0, 'D no required missing on a complete model');
eq(M.values.OPT_BLANK, '', 'F optional missing -> blank (allowed)');
var Mmiss = dtMapPlaceholders_(MODEL, FIELDS.concat([fld({ placeholder: 'REQ_GONE', data_source_path: 'header.nope', required: true, sort_order: 6 })]));
ok(Mmiss.missing.some(function (m) { return m.placeholder === 'REQ_GONE'; }), 'E required + unresolved -> DOCUMENT_REQUIRED_FIELD_MISSING signal');

console.log('\n== G/H physical qty + multi-PO through mapping ==');
eq(M.values.LINE_ITEMS[0].QTY, 800, 'G mapped QTY = snapshot shipment_qty (800)');
eq(M.values.PO_ALLOCATIONS.map(function (r) { return [r.PO_NO, r.ALLOC_QTY]; }), [['KM-PO-A', 500], ['KM-PO-B', 300]], 'H multi-PO lineage preserved through allocation collection');
eq(M.values.LINE_ITEMS.length, 1, 'H line grain preserved (1 line row; PO split lives in allocation collection)');

console.log('\n== I/J GS1 barcode vs units_per_carton ==');
eq(M.values.LINE_ITEMS[0].GS1_CODE, '0123456789012', 'I GS1 barcode maps from frozen model');
ok(M.values.LINE_ITEMS[0].UPC === 20 && M.values.LINE_ITEMS[0].GS1_CODE !== 20, 'J units_per_carton (20) mapped as UPC field is NOT the GS1 barcode');

console.log('\n== K/L shipper & consignee from frozen model ==');
eq(M.values.SHIPPER_NAME, 'Kitchen Mama LLC', 'K shipper from frozen render model');
eq(M.values.CONSIGNEE_NAME, 'Amazon FTW1', 'L consignee from frozen render model');

console.log('\n== M/N immutability: mapper is a pure fn of the model; no live master ==');
eq(dtMapPlaceholders_(MODEL, FIELDS), dtMapPlaceholders_(MODEL, FIELDS), 'M same model+fields -> identical mapping (deterministic)');
var mapperSrc = slice(GS, 'function dtMapPlaceholders_', 'function dtGeneratedKey_');
ok(!/getSheetByName|prodRequireSheet_|SpreadsheetApp/.test(mapperSrc), 'N mapper does NOT touch sheets (pure over the model)');

console.log('\n== O no live master/PO/shipment lookup in the document runtime ==');
ok(!/'sku_details'|'tax_referral_rates'|'company_legal_entities'|'logistics_locations'|'warehouses'|'purchase_order|'shipments'|'shipment_lines'/.test(GS), 'O reads no live master/operational tables (only doc tables + snapshot via 35_)');
ok(!/partyResolve|skuRegionalLookup_|sfoResolveCustoms_|procurementResolveFactoryId_|slaLoadPoLinesJoined_|sfoBuildSnapshot_/.test(GS), 'O calls no factual resolver (facts come frozen from the render model)');

console.log('\n== P/Q no FIFO / no recommendation-gap-forecast ==');
ok(!/order_date|slaFifoCompare_/.test(GS), 'P no FIFO in document runtime');
ok(!/\bgap\b|\bforecast\b|recommendation|avg_sales|projection/i.test(GS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')), 'Q no gap/forecast/recommendation recompute');

console.log('\n== R/S/T idempotent generated-document lifecycle ==');
eq(dtGeneratedKey_('S1', 'shipment_detail', 'TPL-SHIPDETAIL-STANDARD-V1', 1), dtGeneratedKey_('S1', 'shipment_detail', 'TPL-SHIPDETAIL-STANDARD-V1', 1), 'R idempotency key deterministic (retry/two-tab/lost-response converge)');
ok(dtGeneratedKey_('S1', 'shipment_detail', 'TPL-A', 1) !== dtGeneratedKey_('S1', 'shipment_detail', 'TPL-A', 2), 'template version participates in the key');
ok(/LockService\.getScriptLock\(\)/.test(GS) && /reused: true/.test(GS), 'S ScriptLock + reuse-existing short-circuit (no duplicate active record)');
ok(/if \(existing\.length && !regenerate\)/.test(GS), 'T retry converges to the existing generation record unless regenerate:true');

console.log('\n== U template-version + snapshot lineage on the generated record ==');
ok(/template_version: dtNum_\(tpl\.template_version\)/.test(GS), 'U generated record copies template_version (historical lineage)');
ok(/regenerated_from_document_id: \(existing\.length \? dtStr_\(existing\[0\]\.document_id\)/.test(GS), 'U regeneration links to its predecessor (append-only history)');
ok(/related_entity_type: 'shipment', related_entity_id: shipmentId/.test(GS) && /snapshot_id: dtStr_\(h\.snapshot_id\)/.test(GS), 'U lineage -> shipment (related_entity_id) + snapshot (SFO-<shipment_id>)');

console.log('\n== V/W/X SD + PL through the runtime; customs gap does not block ==');
ok(/SHIPDETAIL: 'shipment_detail'/.test(GS) && /PL: 'packing_list'/.test(GS), 'V/W SHIPDETAIL + PL map to frozen document_type enums');
ok(/docRenderShippingDetail_\(snap\)/.test(GS) && /docRenderPackingList_\(snap\)/.test(GS), 'V/W generate reuses the R3A renderers (no second renderer)');
ok(!/customs|LEGAL_IMPORTER/.test(GS), 'X document runtime never consults customs/legal-importer for SD/PL');

console.log('\n== Y no second engine; §18 governance ==');
var codeOnly = GS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/function sfoBuildSnapshot_|function docRenderShippingDetail_|SFO_SNAPSHOT_HEADERS_ =/.test(GS), 'Y no re-declared aggregator/renderer/snapshot schema (reuses R2B+R3A)');
ok(!/prodMigrateCreateSheet_\s*\(|prodMigrateAppendColumns_\s*\(/.test(codeOnly), 'Y no migration twin invoked (tables are USER migration)');
ok(/function dtReadTable_\(ss, name, headers\) \{ return sfoRowsAsObjects_\(prodRequireSheet_\(ss, name, headers\)\)/.test(GS) && /dtReadTable_\(ss, 'document_templates', DOCUMENT_TEMPLATES_HEADERS_\)/.test(GS), 'validate-only read of document_templates via prodRequireSheet_ (fail closed if missing)');

console.log('\n== frozen schemas: exact column counts ==');
function hdrBlock(name) { var s = GS.indexOf('var ' + name + ' ='); var e = GS.indexOf('];', s); return GS.slice(s, e + 2); }
function cols(name) { return (hdrBlock(name).match(/'[a-z0-9_]+'/g) || []).length; }
eq(cols('DOCUMENT_TEMPLATES_HEADERS_'), 30, 'document_templates = 30 frozen columns');
eq(cols('DOCUMENT_TEMPLATE_FIELDS_HEADERS_'), 23, 'document_template_fields = 23 frozen columns');
eq(cols('GENERATED_DOCUMENTS_HEADERS_'), 30, 'generated_documents = 30 frozen columns');
['template_id', 'template_key', 'document_type', 'template_file_id', 'template_version', 'status', 'is_active'].forEach(function (c) { ok(new RegExp("'" + c + "'").test(hdrBlock('DOCUMENT_TEMPLATES_HEADERS_')), 'document_templates owns ' + c); });
['field_id', 'placeholder', 'data_source_path', 'collection_key', 'data_scope', 'required'].forEach(function (c) { ok(new RegExp("'" + c + "'").test(hdrBlock('DOCUMENT_TEMPLATE_FIELDS_HEADERS_')), 'document_template_fields owns ' + c); });
['document_id', 'related_entity_id', 'template_version', 'regenerated_from_document_id', 'status'].forEach(function (c) { ok(new RegExp("'" + c + "'").test(hdrBlock('GENERATED_DOCUMENTS_HEADERS_')), 'generated_documents owns ' + c); });

console.log('\n== §22 router: 5 bounded document APIs ==');
['documentTemplate.list', 'documentTemplate.getFields', 'shipmentDocument.generate', 'shipmentDocument.get', 'shipmentDocument.list'].forEach(function (a) {
  ok(new RegExp("action === '" + a.replace('.', '\\.') + "'").test(ROUTER), 'router: ' + a);
});

console.log('\n----------------------------------------');
console.log('DOCUMENT TEMPLATE RUNTIME (F1-5C-EXPORT-R3B): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
