'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createShipmentImportWorld } = require('./helpers/shipment-import-source-world.cjs');

test('Add New source list includes shared active factories and only selected company active overseas 3PLs', () => {
  const h = createShipmentImportWorld(), before = h.writes();
  for (const [company, expected] of [['ResUS', ['FACTORY', 'RESUS-3PL']], ['KM', ['FACTORY', 'KM-3PL']], ['', ['FACTORY']]]) {
    const t = h.template(company); assert.equal(t.success, true, JSON.stringify(t));
    assert.deepEqual(Array.from(t.lists.source_warehouse, r => r.value), expected);
  }
  assert.equal(h.writes(), before);
});
test('friendly label is updated in both modes; old friendly and technical labels stay parser aliases', () => {
  const h = createShipmentImportWorld();
  for (const mode of ['ADD_NEW', 'UPDATE']) {
    const t = h.template('ResUS', mode), col = t.sheets[0].columns.find(c => c.key === 'source_warehouse_id');
    assert.equal(col.header, '\u51fa\u8ca8\u5009');
    for (const old of ['\u51fa\u8ca8\u5de5\u5ee0\u5009', '\u51fa\u8ca8\u5de5\u5ee0\u5009 source_warehouse_id']) assert(col.aliases.includes(old));
    assert.equal(col.kind, mode === 'UPDATE' ? 'readonly' : 'required');
  }
});
for (const source of ['FACTORY', 'RESUS-3PL', 'RESUS-3PL | Old label']) test('full Add New validation accepts ' + source + ' without writing', () => {
  const h = createShipmentImportWorld(), before = h.writes(), r = h.c.handleImportValidate_(h.body(source));
  assert.equal(r.valid, true, JSON.stringify(r)); assert.equal(h.writes(), before);
});
for (const [source, code] of [
  ['KM-3PL', 'SHIPMENT_SOURCE_COMPANY_MISMATCH'], ['RESUS-3PL-OFF', 'SHIPMENT_SOURCE_INACTIVE'],
  ['OWNERLESS-3PL', 'SHIPMENT_SOURCE_COMPANY_UNKNOWN'], ['FACTORY-OFF', 'SHIPMENT_SOURCE_FACTORY_INACTIVE'],
  ['RESUS-FBA', 'SHIPMENT_SOURCE_TYPE_NOT_ALLOWED'], ['RESUS-RETURN', 'SHIPMENT_SOURCE_TYPE_NOT_ALLOWED'],
  ['RESUS-UNKNOWN', 'SHIPMENT_SOURCE_TYPE_NOT_ALLOWED'], ['MISSING', 'REFERENCE_UNKNOWN']
]) test('typed/pasted source still refuses ' + source + ' before writes', () => {
  const h = createShipmentImportWorld(), before = h.writes(), r = h.c.handleImportValidate_(h.body(source));
  assert.equal(r.valid, false, JSON.stringify(r)); assert(r.issues.some(i => i.field === 'source_warehouse_id' && i.code === code), JSON.stringify(r));
  assert.equal(h.writes(), before);
});
test('source and destination cannot be the same even for an allowed 3PL', () => {
  const h = createShipmentImportWorld(), r = h.c.handleImportValidate_(h.body('RESUS-3PL', { destination_warehouse_id: 'RESUS-3PL' }));
  assert.equal(r.valid, false); assert(r.issues.some(i => i.code === 'SHIPMENT_SOURCE_EQUALS_DESTINATION'));
});
test('duplicate warehouse identity remains a refusal', () => {
  const h = createShipmentImportWorld(), sh = h.tables.warehouses;
  sh.appendRow(sh.grid.find(r => r[0] === 'RESUS-3PL').slice());
  const r = h.c.handleImportValidate_(h.body()); assert.equal(r.valid, false);
  assert(r.issues.some(i => i.field === 'source_warehouse_id' && i.code === 'REFERENCE_AMBIGUOUS'));
});
test('commit records overseas source without source deduction/reservation or PO changes; replay is zero-write', () => {
  const h = createShipmentImportWorld(), body = h.body(), beforePo = JSON.stringify(h.rows('purchase_orders'));
  const beforeOverseas = JSON.stringify(h.rows('overseas_inventory_snapshot'));
  const validation = h.c.handleImportValidate_(body); assert.equal(validation.valid, true, JSON.stringify(validation));
  const req = { ...body, scope: { ...body.scope, ...validation.preview.server_scope }, preview_digest: validation.preview_digest };
  const r = h.c.handleImportCommit_(req); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(h.rows('shipments')[0].source_warehouse_id, 'RESUS-3PL');
  assert.equal(h.rows('shipments')[0].status, 'in_transit');
  assert.equal(h.rows('shipments')[0].opening_supply_mode, 'DISPLAY_ONLY');
  assert.equal(h.rows('shipment_lines')[0].shipment_qty, 20);
  assert.equal(h.rows('factory_stock_movements').length, 0);
  assert.equal(h.rows('shipment_line_allocations').length, 0);
  assert.equal(JSON.stringify(h.rows('overseas_inventory_snapshot')), beforeOverseas);
  assert.equal(h.rows('overseas_inventory_movements').length, 0);
  assert.equal(JSON.stringify(h.rows('purchase_orders')), beforePo);
  const writes = h.writes(), replay = h.c.handleImportCommit_(req);
  assert.equal(replay.replayed, true, JSON.stringify(replay)); assert.equal(h.writes(), writes);
});
test('source owner changed after preview invalidates commit', () => {
  const h = createShipmentImportWorld(), body = h.body(), v = h.c.handleImportValidate_(body); assert.equal(v.valid, true, JSON.stringify(v));
  h.put('warehouses', 'warehouse_id', 'RESUS-3PL', 'company', 'KM'); const before = h.writes();
  const r = h.c.handleImportCommit_({ ...body, scope: { ...body.scope, ...v.preview.server_scope }, preview_digest: v.preview_digest });
  assert.equal(r.success, false, JSON.stringify(r)); assert.equal(h.writes(), before); assert.equal(h.rows('shipments').length, 0);
});
test('new overseas source does not bypass the existing carrier origin/destination lane gate', () => {
  const h = createShipmentImportWorld(); h.tables.carrier_lead_times.grid.splice(1);
  const r = h.c.handleImportValidate_(h.body()); assert.equal(r.valid, false);
  assert(r.issues.some(i => i.code === 'SERVICE_NOT_OFFERED_BY_CARRIER'));
});
test('same-company overseas destination keeps its existing COUNTED supply mode', () => {
  const h = createShipmentImportWorld(), b = h.body('FACTORY', { destination_warehouse_id: 'RESUS-3PL' });
  const v = h.c.handleImportValidate_(b); assert.equal(v.valid, true, JSON.stringify(v));
  const r = h.c.handleImportCommit_({ ...b, scope: { ...b.scope, ...v.preview.server_scope }, preview_digest: v.preview_digest });
  assert.equal(r.success, true, JSON.stringify(r)); assert.equal(h.rows('shipments')[0].opening_supply_mode, 'COUNTED');
});
test('Update cannot change a stored source warehouse', () => {
  const h = createShipmentImportWorld(), b = h.body(), v = h.c.handleImportValidate_(b);
  assert.equal(h.c.handleImportCommit_({ ...b, scope: { ...b.scope, ...v.preview.server_scope }, preview_digest: v.preview_digest }).success, true);
  const t = h.template('ResUS', 'UPDATE', true); assert.equal(t.success, true, JSON.stringify(t));
  const req = { domain: 'shipment', mode: 'UPDATE', schema_version: h.c.SHI_SCHEMA_VERSION_, import_batch_id: 'SOURCE-UPDATE-TEST-01',
    scope: { company: 'ResUS' }, file_meta: { mode: 'UPDATE', template_version: h.c.SHI_SCHEMA_VERSION_, scope: JSON.stringify(t.scope) },
    sheets: Object.fromEntries(t.sheets.map(s => [s.name, s.rows.map(r => ({ ...r, ...(s.name === 'Header' ? { source_warehouse_id: 'FACTORY' } : {}) }))])) };
  const before = h.writes(), r = h.c.handleImportValidate_(req);
  assert.equal(r.valid, false, JSON.stringify(r)); assert(r.issues.some(i => i.field === 'source_warehouse_id'), JSON.stringify(r));
  assert.equal(h.writes(), before); assert.equal(h.rows('shipments')[0].source_warehouse_id, 'RESUS-3PL');
});
