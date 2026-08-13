// Kitchen Mama Operation System — F1-5C-FINAL-OUTPUT-SCHEMA-LEAN-R1
// Proves the Final Output snapshot is materially leaner WITHOUT losing physical truth, historical integrity, or
// document reproducibility:
//   REMOVED (pure-derived, class 4): 5 header totals + declared_total_value → computed by the renderer.
//   PRESERVED (class 2/3/6/8): every frozen party/customs/master-display historical fact + multi-PO lineage FKs
//     (party VALUES are HALTed from removal — company_legal_entities / logistics_locations are mutable-in-place, so
//     the frozen values are the only historically exact source; the renderer stays snapshot-only).
// Run: node assets/tests/final-output-schema-lean-f1-5c-r1.test.js
// NOTE: no 'use strict' — pure blocks are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var GS34 = read('specs/active/apps-script/34_shipment_final_output_handlers.gs');
var GS35 = read('specs/active/apps-script/35_shipment_document_renderer.gs');
eval(slice(GS34, '// __SFO_PURE_START__', '// __SFO_PURE_END__'));
eval(slice(GS35, '// __DOC_PURE_START__', '// __DOC_PURE_END__'));

// -- extract the three header constants as arrays (source-truth for what is persisted) --
function headerArr(src, name) {
  var s = src.indexOf('var ' + name + ' = ['); var e = src.indexOf('];', s);
  var body = src.slice(s, e);
  var out = []; var re = /'([^']+)'/g, m; while ((m = re.exec(body))) out.push(m[1]); return out;
}
var HEAD = headerArr(GS34, 'SFO_SNAPSHOT_HEADERS_');
var LINE = headerArr(GS34, 'SFO_LINE_HEADERS_');
var POS = headerArr(GS34, 'SFO_LINE_PO_HEADERS_');

console.log('\n== §3 REMOVED: 5 header derived totals are no longer persisted ==');
['shipment_total_qty', 'shipment_total_cartons', 'shipment_total_gross_weight', 'shipment_total_net_weight', 'shipment_total_cbm']
  .forEach(function (c) { ok(HEAD.indexOf(c) === -1, 'header does NOT persist ' + c); });

console.log('\n== §5 REMOVED: declared_total_value (pure unit×qty) is no longer persisted ==');
ok(LINE.indexOf('declared_total_value') === -1, 'line does NOT persist declared_total_value');

console.log('\n== NO OVER-REMOVAL: frozen party VALUES stay (§2 HALT — masters mutable-in-place) ==');
['shipper_legal_name', 'shipper_display_name', 'shipper_country', 'shipper_address_line_1', 'shipper_city', 'shipper_postal_code', 'shipper_tax_or_business_id',
 'seller_of_record_legal_name', 'consignee_name', 'consignee_address_line_1', 'consignee_city', 'consignee_country', 'factory_name', 'carrier_name']
  .forEach(function (c) { ok(HEAD.indexOf(c) !== -1, 'header STILL freezes party value ' + c + ' (historically exact; not reconstructable)'); });
// the frozen FK identities the USER keeps
['shipper_legal_entity_id', 'consignee_location_id', 'destination_warehouse_id', 'factory_id', 'carrier_id']
  .forEach(function (c) { ok(HEAD.indexOf(c) !== -1, 'header keeps stable FK ' + c); });

console.log('\n== NO OVER-REMOVAL: frozen customs + master/display line facts stay (§4/§5) ==');
['country_of_origin', 'hs_code', 'declared_currency', 'declared_unit_value', 'gs1_code', 'gs1_type',
 'product_name_en', 'product_name_cn', 'site_sku', 'carton_length', 'carton_width', 'carton_height', 'material', 'product_use']
  .forEach(function (c) { ok(LINE.indexOf(c) !== -1, 'line STILL freezes ' + c); });

console.log('\n== NO OVER-REMOVAL: multi-PO lineage FKs + historical po_no stay (§6 re-parent DECLINED) ==');
['snapshot_line_po_id', 'snapshot_id', 'shipment_id', 'shipment_line_id', 'shipment_line_allocation_id', 'purchase_order_line_id', 'purchase_order_id', 'po_no', 'allocated_qty']
  .forEach(function (c) { ok(POS.indexOf(c) !== -1, 'line_pos keeps lineage/integrity field ' + c); });

console.log('\n== builders no longer emit the derived facts ==');
var bh = sfoBuildHeader_({ shipment_id: 'S1', company: 'KM', status: 'in_transit' }, { legal_name: 'KM LLC' }, {}, {}, { factory_id: 'FAC-A' }, {});
ok(!('shipment_total_qty' in bh) && !('shipment_total_cbm' in bh), 'sfoBuildHeader_ emits NO totals');
ok(bh.factory_id === 'FAC-A' && bh.shipper_legal_name === 'KM LLC', 'sfoBuildHeader_ still freezes party+factory facts');
var bl = sfoBuildLine_({ shipment_line_id: 'SL-1', sku: 'GA0450', shipment_qty: 10 }, {}, '', { declared_unit_value: 5 }, 'L1');
ok(!('declared_total_value' in bl) && bl.declared_unit_value === 5, 'sfoBuildLine_ freezes declared_unit_value, emits NO declared_total_value');

console.log('\n== §3 renderer DERIVES header totals from the FROZEN LINES (not from any persisted header total) ==');
function hdr(o) { return Object.assign({ shipment_id: 'S1', snapshot_id: 'SFO-S1', snapshot_version: 1,
  shipper_legal_name: 'KM LLC', consignee_name: 'Amazon FTW1', consignee_location_id: 'LL-1',
  shipping_detail_ready: 'READY', packing_list_ready: 'READY' }, o || {}); }
function lnf(o) { return Object.assign({ shipment_line_id: 'SL-1', sku: 'GA0450', shipment_qty: 800, shipment_carton_qty: 40,
  gross_weight: 500, net_weight: 450, cbm: 3.2, declared_unit_value: 2, declared_currency: 'USD' }, o || {}); }
var RD = { shipping_detail: { status: 'READY' }, packing_list: { status: 'READY' } };
// header carries DELIBERATELY WRONG legacy totals — the renderer must ignore them and sum the lines.
var snapWrong = { header: hdr({ shipment_total_qty: 999999, shipment_total_cbm: 999 }),
  lines: [lnf(), lnf({ shipment_line_id: 'SL-2', sku: 'GA0451', shipment_qty: 100, shipment_carton_qty: 5, gross_weight: 60, net_weight: 55, cbm: 0.8 })],
  po_lineage: [{ shipment_line_id: 'SL-1', po_no: 'KM-PO-1', allocated_qty: 800, purchase_order_line_id: 'POL-1' },
               { shipment_line_id: 'SL-2', po_no: 'KM-PO-1', allocated_qty: 100, purchase_order_line_id: 'POL-9' }], readiness: RD };
var sd = docRenderShippingDetail_(snapWrong);
ok(sd.ok, 'SD renders');
eq(sd.header.totals, { qty: 900, cartons: 45, gross_weight: 560, net_weight: 505, cbm: 4.0 }, '§3 totals = Σ frozen lines (ignores wrong persisted header totals)');

console.log('\n== §5 renderer DERIVES declared_total_value = unit × physical qty ==');
eq(sd.lines[0].declared_total_value, 1600, 'SD line declared_total_value = 2 × 800 (derived)');
eq(sd.lines[1].declared_total_value, 200, 'SD line 2 declared_total_value = 2 × 100 (derived)');
var pl = docRenderPackingList_(snapWrong);
ok(pl.ok && !('declared_total_value' in pl.lines[0]), 'PL is physical-only: no declared_total_value (correctly absent)');
eq(pl.header.totals.qty, 900, 'PL header totals also derived from frozen lines');

console.log('\n== multi-PO lineage preserved; physical qty = frozen snapshot qty ==');
eq(sd.lines[0].po_allocations.length, 1, 'line 1 single allocation');
eq(sd.lines[0].shipment_qty, 800, 'physical qty = frozen snapshot shipment_qty');

console.log('\n== immutability preserved: renderer reads NO live master/operational table (still snapshot-only) ==');
ok(!/'sku_details'|'tax_referral_rates'|'company_legal_entities'|'logistics_locations'|'warehouses'|'carriers'|'purchase_order|partyResolve|sfoResolveCustoms_|skuRegionalLookup_/.test(GS35),
  'renderer never reads a live master (derivation uses ONLY frozen snapshot lines)');
ok(!/h\.shipment_total_/.test(GS35), 'renderer no longer reads any persisted header total (source removed)');

console.log('\n----------------------------------------');
console.log('FINAL OUTPUT SCHEMA LEAN (F1-5C-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
