'use strict';
// Load complete runtime modules; all data and Drive operations stay synthetic.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const root = process.env.DOC_HOTFIX_GS || 'assets/specs/active/apps-script';
const base = process.env.DOC_HOTFIX_BASE || root;
const c = { console };
vm.createContext(c);
for (const f of ['12_shipment_handlers.gs', '34_shipment_final_output_handlers.gs', '35_shipment_document_renderer.gs', '36_document_template_handlers.gs', '37_shipment_document_file_renderer.gs', '38_document_output_folder_resolver.gs', '39_document_runtime_service.gs']) {
  vm.runInContext(fs.readFileSync((fs.existsSync(root + '/' + f) ? root : base) + '/' + f, 'utf8'), c, { filename: f });
}
let passed = 0;
function test(name, fn) { fn(); passed++; console.log('PASS ' + name); }
const plain = x => JSON.parse(JSON.stringify(x));
const template = { template_id: 'DETAIL', template_key: 'SHIPDETAIL_STANDARD', related_entity_type: 'shipment', status: 'active', is_active: true, file_name_rule: '{{TOTAL_QTY}}pcs_{{TOTAL_CARTONS}}ctns' };
const templates = [template, { ...template, template_id: 'OTHER' }];
const scalar = (placeholder, table, field, extra = {}) => ({ template_id: 'DETAIL', field_id: placeholder, placeholder, data_source_table: table, data_source_field: field, field_type: 'scalar', data_scope: 'header', required: true, is_active: true, ...extra });
const conflicts = [
  scalar('TOTAL_QTY', 'shipments', 'shipment_total_qty', { template_id: 'OTHER' }),
  scalar('TOTAL_QTY', 'shipment_lines', 'shipment_qty', { template_id: 'OTHER', transform_rule: 'distinct_join_semicolon' }),
  scalar('TOTAL_CARTONS', 'shipments', 'shipment_total_cartons', { template_id: 'OTHER', format_rule: '#,##0' }),
  scalar('TOTAL_CARTONS', 'shipment_lines', 'carton_qty', { template_id: 'OTHER', format_rule: 'number' })
];
test('canonical shipment label resolves from the frozen model', () => {
  const f = scalar('SHIPPING_METHOD', 'shipments', 'shipping_method_label');
  const r = c.dtMapPlaceholders_({ header: { shipping_method_label: 'Frozen service' }, lines: [] }, [f]);
  assert.deepEqual(plain(r.missing), []);
  assert.equal(r.values.SHIPPING_METHOD, 'Frozen service');
});
test('legacy rate-card source remains compatible with the same frozen model', () => {
  const r = c.dtMapPlaceholders_({ header: { shipping_method_label: 'Frozen service' } }, [scalar('SERVICE', 'carrier_rate_cards', 'shipping_method_label')]);
  assert.equal(r.values.SERVICE, 'Frozen service');
  assert.deepEqual(plain(r.missing), []);
});
test('missing frozen label is not invented or read from live master data', () => {
  const r = c.dtMapPlaceholders_({ header: {} }, [scalar('SHIPPING_METHOD', 'shipments', 'shipping_method_label')]);
  assert(r.missing.some(x => (x.problems || []).some(p => p.includes('NOT_FROZEN'))));
});
let fields = [scalar('SHIPPING_METHOD', 'shipments', 'shipping_method_label')];
c.dgsFieldsFor_ = () => fields;
const entry = { template_id: 'DETAIL', template_key: 'SHIPDETAIL_STANDARD', template: { ...template, file_name_rule: '' }, class_key: 'SHIPMENT_DETAIL', render: 'SHIPDETAIL' };
const contractContext = { snap: () => ['shipping_method_label'], rc: () => ({ ok: true }) };
test('pre-dispatch field contract accepts canonical shipping label', () => assert.deepEqual(plain(c.dgsFieldContract_({}, entry, () => [], contractContext)), []));
test('canonical label still requires a snapshot column', () => assert.match(c.dgsFieldContract_({}, entry, () => [], { ...contractContext, snap: () => [] }).join(), /NOT_FROZEN/));
test('canonical label still refuses an unresolved rate card', () => assert.match(c.dgsFieldContract_({}, entry, () => [], { ...contractContext, rc: () => ({ ok: false, reason: 'RATE_CARD_CHANGED' }) }).join(), /RATE_CARD_CHANGED/));
test('shipment filename totals do not borrow conflicting definitions', () => {
  const defs = c.dgsFileNameDefs_(template, {}, templates, conflicts);
  assert.equal(defs.TOTAL_QTY.data_source_table, 'shipments');
  assert.equal(defs.TOTAL_QTY.data_source_field, 'shipment_total_qty');
  assert.equal(defs.TOTAL_CARTONS.data_source_field, 'shipment_total_cartons');
  assert.equal(defs.TOTAL_CARTONS.format_rule, '');
});
test('shipment filename totals work without any other template', () => {
  const defs = c.dgsFileNameDefs_(template, {}, [template], []);
  const r = c.dgsFileNameBorrow_(defs, { header: { totals: { qty: 160, cartons: 4 } } }, () => 'DETAIL');
  assert.deepEqual(plain(r.bad), []);
  assert.equal(c.dgsFilename_(template.file_name_rule, r.values), '160pcs_4ctns');
});
test('existing local scalar definitions are not replaced', () => assert.deepEqual(plain(c.dgsFileNameDefs_(template, { TOTAL_QTY: 1, TOTAL_CARTONS: 1 }, templates, conflicts)), {}));
test('purchase-order definitions are not changed by shipment defaults', () => {
  const po = { ...template, related_entity_type: 'purchase_order' };
  const defs = c.dgsFileNameDefs_(po, {}, [po], conflicts.map(f => ({ ...f, template_id: 'DETAIL' })));
  assert.equal(defs.TOTAL_QTY, 'DOCUMENT_FILE_NAME_TOKEN_AMBIGUOUS');
});
test('unrelated ambiguous and undefined tokens still refuse', () => {
  const t = { ...template, file_name_rule: '{{OTHER}}_{{UNKNOWN}}' };
  const defs = c.dgsFileNameDefs_(t, {}, [t], [scalar('OTHER', 'shipments', 'country'), scalar('OTHER', 'shipments', 'marketplace')]);
  assert.equal(defs.OTHER, 'DOCUMENT_FILE_NAME_TOKEN_AMBIGUOUS');
  assert.equal(defs.UNKNOWN, 'DOCUMENT_FILE_NAME_TOKEN_UNDEFINED');
});
let lines = [
  { shipment_id: 'S', shipment_line_id: 'A', sku: 'RED', shipment_qty: 80, shipment_carton_qty: 2 },
  { shipment_id: 'S', shipment_line_id: 'B', sku: 'SILVER', shipment_qty: '80', shipment_carton_qty: '2' },
  { shipment_id: 'S', shipment_qty: 999, shipment_carton_qty: 999, line_status: 'removed' },
  { shipment_id: 'S', shipment_qty: 999, shipment_carton_qty: 999, note: '[SC13_REMOVED:old]' },
  { shipment_id: 'OTHER', shipment_qty: 999, shipment_carton_qty: 999 }
];
let reads = 0;
c.sfoReadTable_ = (ss, name) => { assert.equal(name, 'shipment_lines'); reads++; return lines; };
test('pre-dispatch totals sum only active lines of this shipment', () => assert.deepEqual(plain(c.dgsShipmentFileNameTotals_({}, 'S')), { qty: 160, cartons: 4 }));
test('partial cartons are summed without rounding up', () => {
  const old = lines; lines = [{ shipment_id: 'S', shipment_qty: 30, shipment_carton_qty: 0.75 }, { shipment_id: 'S', shipment_qty: 10, shipment_carton_qty: 0.25 }];
  assert.deepEqual(plain(c.dgsShipmentFileNameTotals_({}, 'S')), { qty: 40, cartons: 1 }); lines = old;
});
for (const value of ['', undefined, 'bad', 'Infinity', -1]) test('invalid carton total remains unknown: ' + value, () => {
  const old = lines; lines = [{ shipment_id: 'S', shipment_qty: 80, shipment_carton_qty: value }];
  assert.deepEqual(plain(c.dgsShipmentFileNameTotals_({}, 'S')), { qty: 80, cartons: '' }); lines = old;
});
test('no active shipment lines never produces a fake zero total', () => {
  const old = lines; lines = [];
  assert.deepEqual(plain(c.dgsShipmentFileNameTotals_({}, 'S')), { qty: '', cartons: '' }); lines = old;
});
// Exercise the actual readiness closure, including filename preflight, not only helpers.
c.dgsShipmentContext_ = () => ({ ok: true, external_shipment_id: 'EXT', ctx: { country: 'US' }, row: { shipment_id: 'S', external_shipment_id: 'EXT', country: 'US', shipping_method: 'truck' } });
c.dgsTemplates_ = () => templates;
c.dgsShipmentManifest_ = () => ({ entries: [{ ...entry, template, document_type: 'shipment_detail', requirement: 'ALWAYS' }], errors: [], covered: [] });
c.xcoCiCurrencyConflict_ = () => null;
c.dtReadTable_ = () => conflicts;
c.dgsDriveReadiness_ = () => ({ ok: true, status: 'READY' });
c.dgsExecutableManifest_ = () => ({ documents: [] });
c.sfoRateCardLabel_ = () => ({ ok: true, label: 'Frozen service' });
fields = [scalar('SHIPPING_METHOD', 'shipments', 'shipping_method_label')];
const ss = { getSheetByName: () => ({ getLastColumn: () => 1, getRange: () => ({ getValues: () => [['shipping_method_label']] }) }) };
test('reported readiness blocker is resolved without any writes', () => {
  const before = reads, r = c.dgsShipmentReadiness_(ss, 'S');
  assert.equal(r.status, 'READY', JSON.stringify(r.blockers));
  assert.equal(reads - before, 1);
});
test('readiness and finalized snapshot compute identical filename totals', () => {
  const built = lines.filter(l => l.shipment_id === 'S' && !c.sc13LineRemoved_(l)).map(l => c.sfoBuildLine_(l));
  const frozen = c.docHeaderBlock_({}, built, []).totals;
  assert.deepEqual(plain(c.dgsShipmentFileNameTotals_({}, 'S')), { qty: frozen.qty, cartons: frozen.cartons });
});
test('unknown total blocks readiness rather than permitting dispatch', () => {
  const old = lines; lines = [{ shipment_id: 'S', shipment_qty: 80, shipment_carton_qty: '' }];
  const r = c.dgsShipmentReadiness_(ss, 'S');
  assert.equal(r.status, 'BLOCKED'); assert.match(JSON.stringify(r.blockers), /TOTAL_CARTONS/); lines = old;
});
test('final payload filename uses frozen totals, never current shipment rows', () => {
  fields = [scalar('SHIPPING_METHOD', 'shipments', 'shipping_method_label')];
  c.xcoSeriesCompanyOf_ = () => null;
  const before = reads;
  const model = { header: { shipping_method_label: 'Frozen service', totals: { qty: 440, cartons: 11 } }, lines: [] };
  const r = c.dgsResolvePayload_({}, { entry: { ...entry, template }, model, related_entity_type: 'shipment', related_entity_id: 'S', folder_id: 'ROOT' });
  assert.equal(r.ok, true, JSON.stringify(r)); assert.equal(r.payload.file_name, '440pcs_11ctns'); assert.equal(reads, before);
});
test('invalid template source is still refused', () => {
  fields = [scalar('SHIPPING_METHOD', 'shipments', 'unknown_field')];
  assert.match(c.dgsFieldContract_({}, entry, () => [], contractContext).join(), /DOCUMENT_SOURCE_NOT_IN_MODEL/);
});
console.log('DOCUMENT_CONTRACT_HOTFIX_PASS ' + passed + ' live_business_writes=0');
