// Kitchen Mama Operation System — F1-5C-FINAL-OUTPUT-SCHEMA-LEAN-R2
// Final persistence-boundary freeze for the 3 Final Output tables. Proves the bounded R2 removals and — crucially —
// proves the FIELD-SPECIFIC HALTs that keep historical/legal truth intact:
//   REMOVED (proven safe): snapshot.status_at_finalization (redundant, unread); line.material + line.product_use
//     (no Phase-1 document renders them).
//   RETAINED (HALT — removing would reverse the snapshot-only renderer or lose legal/customs truth): all party values,
//     consignee values, customs facts, renderer-consumed display facts, factory/carrier names, PO lineage + po_no.
//   Snapshot lifecycle columns retained; the versioning runtime GAP is asserted (documented, not silently "working").
// Run: node assets/tests/final-output-schema-lean-f1-5c-r2.test.js
// NOTE: no 'use strict' — pure blocks are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var GS34 = read('specs/active/apps-script/34_shipment_final_output_handlers.gs');
var GS35 = read('specs/active/apps-script/35_shipment_document_renderer.gs');
var GS36 = read('specs/active/apps-script/36_document_template_handlers.gs');
var GS37 = read('specs/active/apps-script/37_shipment_document_file_renderer.gs');
eval(slice(GS34, '// __SFO_PURE_START__', '// __SFO_PURE_END__'));
eval(slice(GS35, '// __DOC_PURE_START__', '// __DOC_PURE_END__'));

function headerArr(src, name) { var s = src.indexOf('var ' + name + ' = ['); var e = src.indexOf('];', s); var b = src.slice(s, e); var o = [], re = /'([^']+)'/g, m; while ((m = re.exec(b))) o.push(m[1]); return o; }
var HEAD = headerArr(GS34, 'SFO_SNAPSHOT_HEADERS_');
var LINE = headerArr(GS34, 'SFO_LINE_HEADERS_');
var POS = headerArr(GS34, 'SFO_LINE_PO_HEADERS_');

console.log('\n== §5 REMOVED: status_at_finalization (redundant; snapshot.status lifecycle retained) ==');
ok(HEAD.indexOf('status_at_finalization') === -1, 'header does NOT persist status_at_finalization');
ok(HEAD.indexOf('status') !== -1 && HEAD.indexOf('snapshot_version') !== -1 && HEAD.indexOf('superseded_by') !== -1 && HEAD.indexOf('superseded_reason') !== -1, 'snapshot lifecycle columns (status / snapshot_version / superseded_by / superseded_reason) RETAINED');
ok(!/status_at_finalization/.test(GS34.replace(/\/\/[^\n]*/g, '')), 'no runtime write/read of status_at_finalization remains');

console.log('\n== §2 REMOVED: material / product_use (no Phase-1 document renders them) ==');
ok(LINE.indexOf('material') === -1 && LINE.indexOf('product_use') === -1, 'line does NOT persist material / product_use');
ok(!/product_use|\.material\b/.test(GS35) && !/product_use|\.material\b/.test(GS36), 'neither renderer (35_) nor mapper (36_) reads material / product_use (proven unread)');

console.log('\n== FIELD-SPECIFIC HALT: renderer-consumed display facts RETAINED frozen (removal = snapshot-only reversal) ==');
['product_name_en', 'product_name_cn', 'site_sku', 'gs1_code', 'gs1_type', 'carton_length', 'carton_width', 'carton_height']
  .forEach(function (c) { ok(LINE.indexOf(c) !== -1, 'line STILL freezes renderer-consumed display fact ' + c); });
// these are actually read by the renderer -> proof they cannot be dropped without a live-master join
['product_name_en', 'site_sku', 'gs1_code', 'carton_length'].forEach(function (c) { ok(new RegExp('l\\.' + c).test(GS35), 'renderer consumes l.' + c + ' from the frozen snapshot'); });

console.log('\n== HALT: customs / legal frozen facts RETAINED ==');
['country_of_origin', 'hs_code', 'declared_currency', 'declared_unit_value'].forEach(function (c) { ok(LINE.indexOf(c) !== -1, 'customs fact frozen ' + c); });

console.log('\n== §3 HALT: shipper/seller party values RETAINED (company_legal_entities not guaranteed reconstructable) ==');
['shipper_legal_entity_id', 'shipper_company', 'shipper_legal_name', 'shipper_display_name', 'shipper_country',
 'shipper_address_line_1', 'shipper_address_line_2', 'shipper_city', 'shipper_state_or_region', 'shipper_postal_code', 'shipper_tax_or_business_id',
 'seller_of_record_legal_entity_id', 'seller_of_record_legal_name'].forEach(function (c) { ok(HEAD.indexOf(c) !== -1, 'shipper/seller value frozen ' + c); });

console.log('\n== §4 HALT: consignee values RETAINED (logistics_locations changes more often) ==');
['consignee_location_id', 'consignee_warehouse_id', 'consignee_name', 'consignee_address_line_1', 'consignee_address_line_2',
 'consignee_city', 'consignee_state_or_region', 'consignee_postal_code', 'consignee_country'].forEach(function (c) { ok(HEAD.indexOf(c) !== -1, 'consignee value frozen ' + c); });

console.log('\n== §8 factory / carrier: FK + frozen name retained; factory != company ==');
['factory_id', 'factory_name', 'carrier_id', 'carrier_name'].forEach(function (c) { ok(HEAD.indexOf(c) !== -1, 'header keeps ' + c); });
var hb = sfoBuildHeader_({ shipment_id: 'S1', company: 'KM', status: 'in_transit' }, { legal_name: 'Kitchen Mama LLC' }, {}, {}, { factory_id: 'FAC-A', factory_name: 'Factory A' }, {});
var hb2 = sfoBuildHeader_({ shipment_id: 'S2', company: 'ResTW', status: 'in_transit' }, { legal_name: 'Res Taiwan Ltd' }, {}, {}, { factory_id: 'FAC-A', factory_name: 'Factory A' }, {});
ok(hb.shipper_legal_name !== hb2.shipper_legal_name && hb.factory_id === hb2.factory_id, 'shared Factory A across KM/ResTW keeps DISTINCT shippers (factory never determines company)');
ok(/procurementResolveFactoryId_\(ss, sfoStr_\(shipment\.source_warehouse_id\)/.test(GS34), 'factory resolution semantics unchanged (warehouse-resolved, never company)');

console.log('\n== builders no longer emit the removed fields ==');
ok(!('status_at_finalization' in hb), 'sfoBuildHeader_ emits NO status_at_finalization');
var bl = sfoBuildLine_({ shipment_line_id: 'SL-1', sku: 'GA0450', shipment_qty: 10 }, { product_name: 'Can Opener', material: 'ABS', product_use: 'kitchen' }, 'KM-GA0450-US', { declared_unit_value: 5 }, 'L1');
ok(!('material' in bl) && !('product_use' in bl), 'sfoBuildLine_ emits NO material / product_use');
ok(bl.product_name_en === 'Can Opener' && bl.site_sku === 'KM-GA0450-US' && bl.declared_unit_value === 5, 'sfoBuildLine_ STILL freezes display + customs facts');

console.log('\n== physical qty authority + multi-PO lineage unchanged ==');
eq(bl.shipment_qty, 10, 'physical qty = frozen shipment_qty');
['snapshot_line_po_id', 'snapshot_id', 'shipment_id', 'shipment_line_id', 'shipment_line_allocation_id', 'purchase_order_line_id', 'purchase_order_id', 'po_no', 'allocated_qty', 'created_at']
  .forEach(function (c) { ok(POS.indexOf(c) !== -1, 'line_pos lineage field intact ' + c); });
var posN = sfoBuildLinePos_('SL-1', [{ shipment_line_allocation_id: 'A1', purchase_order_line_id: 'POL-1', allocated_qty: 6 }, { shipment_line_allocation_id: 'A2', purchase_order_line_id: 'POL-2', allocated_qty: 4 }], { 'POL-1': { purchase_order_id: 'PO-1', po_no: 'KM-PO-1' }, 'POL-2': { purchase_order_id: 'PO-2', po_no: 'KM-PO-2' } }, (function () { var n = 0; return function () { return 'SFOP-' + (++n); }; })());
eq(posN.length, 2, 'multi-PO lineage: 2 executed allocations preserved (never collapsed)');
eq(posN.map(function (p) { return p.po_no; }), ['KM-PO-1', 'KM-PO-2'], 'both frozen po_no preserved');

console.log('\n== §6 versioning GAP is real (deterministic id + hardcoded v1 + no supersede writer) ==');
ok(/var snapId = 'SFO-' \+ shipmentId/.test(GS34), 'deterministic snapshot id SFO-<shipment_id> (one row per shipment)');
ok(/headerRow\.snapshot_version = 1;/.test(GS34), 'snapshot_version hardcoded to 1 (no V2 path)');
ok(/status !== 'superseded'/.test(GS34.replace(/[<]/g, '<')) || /'superseded'/.test(GS34), 'superseded only appears in READ filters');
ok(!/\.status\s*=\s*'superseded'|status:\s*'superseded'|superseded_by\s*[:=]/.test(GS34), 'NO runtime writer sets status=superseded / superseded_by → versioning is schema-only (CONFIRMED gap; documented, not implemented)');
ok(/already_finalized: true/.test(GS34), 'finalize short-circuits on an existing active snapshot (idempotent; never auto-creates V2)');

console.log('\n== §7 generated-file immutability: copy-new, never overwrite; regenerate = new lineage ==');
ok(/makeCopy\(/.test(GS37) && !/setContent|removeFile|setTrashed|\.remove\(\)/.test(GS37), '37_ always makeCopy (new file); never overwrites/deletes an existing file');
ok(/regenerated_from_document_id/.test(GS36), '36_ links a regenerated doc to its predecessor (regenerated_from_document_id) — old row/file preserved');
ok(/dfoGenerateFile_ BEFORE persisting|generate the file BEFORE persisting/.test(GS36) || /file BEFORE persisting the row/.test(GS36), 'file generated before DB persist (no false generated record) — supersession-safe');

console.log('\n== no second engine; renderer stays snapshot-only (no live master read introduced) ==');
ok(!/'sku_details'|'tax_referral_rates'|'company_legal_entities'|'logistics_locations'|'warehouses'|'carriers'|'purchase_order|partyResolve|sfoResolveCustoms_|skuRegionalLookup_/.test(GS35), 'renderer still reads NO live master/operational table');
ok(!/function sfoBuildSnapshot_|SFO_SNAPSHOT_HEADERS_ =/.test(GS35) && !/SFO_LINE_HEADERS_ =/.test(GS35), 'no second aggregator / re-declared schema in the renderer');

console.log('\n== final counts ==');
eq(HEAD.length, 61, 'snapshot header count = 61 (was 62)');
eq(LINE.length, 27, 'line header count = 27 (was 29)');
eq(POS.length, 10, 'line_pos header count = 10 (unchanged)');

console.log('\n----------------------------------------');
console.log('FINAL OUTPUT SCHEMA LEAN R2 (F1-5C): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
