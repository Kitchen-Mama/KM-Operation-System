'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createTokenWorld: createEuWorld } = require('./helpers/shipment-method-tail-world.cjs');
function tokenBody(h, extra = {}) {
  const b = h.body('FACTORY', extra), scope = JSON.parse(b.file_meta.scope);
  scope.service_input = h.c.SHI_SERVICE_INPUT_;
  b.file_meta.scope = JSON.stringify(scope);
  return b;
}
test('new template offers only transport tokens, requires independent Last mile and marks its contract', () => {
  const h = createEuWorld(), t = h.template();
  assert.equal(t.scope.service_input, 'METHOD_LAST_MILE_V1');
  assert.deepEqual(Array.from(t.lists.shipping_method, x => x.value), ['air', 'sea', 'sea_express', 'truck']);
  const cols = t.sheets.find(s => s.name === 'Header').columns;
  for (const key of ['shipping_method', 'last_mile_delivery']) {
    const c = cols.find(x => x.key === key); assert.equal(c.required, true); assert.equal(c.kind, 'required');
  }
  assert(!cols.find(c => c.key === 'shipping_method').comment.includes('carrier\'s rate-card label'));
});
for (const rateCards of ['empty', 'missing', 'wrong-label']) test('DE route works independently of rate cards: ' + rateCards, () => {
  const h = createEuWorld('DE');
  h.put('shipment_route_templates', 'route_template_id', 'ROUTE-1', 'is_active', false);
  if (rateCards === 'empty') h.sheet('carrier_rate_cards', ['carrier_id', 'shipping_method', 'last_mile_delivery']);
  if (rateCards === 'missing') delete h.tables.carrier_rate_cards;
  if (rateCards === 'wrong-label') h.put('carrier_rate_cards', 'carrier_id', 'CAR', 'shipping_method_label', 'Misleading label');
  const before = h.writes(), v = h.c.handleImportValidate_(tokenBody(h));
  assert.equal(v.valid, true, JSON.stringify(v));
  const row = v.preview.rows.find(r => r.sheet === 'Header');
  assert.equal(row.shipping_method, 'truck'); assert.equal(row.last_mile_delivery, 'truck');
  assert(row.method_resolution.rule.startsWith('EXPLICIT_SERVICE_V1'));
  assert(row.route.candidates.some(c => c.route_template_id === 'ROUTE-0'), JSON.stringify(row));
  assert.equal(h.writes(), before);
});
test('EU-wide template alone proves a service through the dispatch matcher', () => {
  const h = createEuWorld('DE');
  for (const name of ['carrier_rate_cards', 'carrier_lead_times']) h.sheet(name, ['carrier_id', 'shipping_method', 'last_mile_delivery']);
  const sh = h.tables.shipment_route_templates;
  sh.grid.splice(1, sh.grid.length - 1, ...sh.grid.slice(1).filter(r => r[0] === 'ROUTE-2'));
  const v = h.c.handleImportValidate_(tokenBody(h)); assert.equal(v.valid, true, JSON.stringify(v));
  const row = v.preview.rows.find(r => r.sheet === 'Header');
  assert.equal(row.route.candidates[0].route_template_id, 'ROUTE-2');
  assert(row.method_resolution.evidence.includes('shipment_route_templates:ROUTE-2'));
});
test('matching template truck + parcel does not get overwritten by a truck-tail rate card', () => {
  const h = createEuWorld('DE');
  h.put('shipment_route_templates', 'route_template_id', 'ROUTE-1', 'is_active', false);
  h.put('shipment_route_templates', 'route_template_id', 'ROUTE-0', 'last_mile_delivery', 'parcel');
  const v = h.c.handleImportValidate_(tokenBody(h, { last_mile_delivery: 'parcel' }));
  assert.equal(v.valid, true, JSON.stringify(v));
  const row = v.preview.rows.find(r => r.sheet === 'Header');
  assert.equal(row.last_mile_delivery, 'parcel'); assert.equal(row.route.candidates[0].route_template_id, 'ROUTE-0');
});
for (const lm of ['', undefined]) test('new file cannot derive a missing Last mile from a rate card: ' + lm, () => {
  const h = createEuWorld(), before = h.writes(), v = h.c.handleImportValidate_(tokenBody(h, { last_mile_delivery: lm }));
  assert.equal(v.valid, false); assert(v.issues.some(i => i.field === 'last_mile_delivery' && i.code === 'REQUIRED'), JSON.stringify(v));
  assert.equal(h.writes(), before);
});
test('new file rejects a label even when the legacy rate-card mapping exists', () => {
  const h = createEuWorld(), v = h.c.handleImportValidate_(tokenBody(h, { shipping_method: 'Fixture truck service' }));
  assert.equal(v.valid, false); assert(v.issues.some(i => i.code === 'SHIPPING_SERVICE_TOKENS_REQUIRED'), JSON.stringify(v));
});
test('unknown service input contract is refused before writes', () => {
  const h = createEuWorld(), b = tokenBody(h), s = JSON.parse(b.file_meta.scope), before = h.writes();
  s.service_input = 'UNSUPPORTED'; b.file_meta.scope = JSON.stringify(s);
  const v = h.c.handleImportValidate_(b);
  assert.equal(v.valid, false); assert(v.issues.some(i => i.code === 'IMPORT_FILE_SERVICE_INPUT_UNSUPPORTED'));
  assert.equal(h.writes(), before);
});
test('previously downloaded label file preserves its original interpretation', () => {
  const h = createEuWorld(), v = h.c.handleImportValidate_(h.body('FACTORY', { shipping_method: 'Fixture truck service', last_mile_delivery: '' }));
  assert.equal(v.valid, true, JSON.stringify(v));
  assert.equal(v.preview.rows.find(r => r.sheet === 'Header').shipping_method, 'truck');
});
test('new token import still refuses another carrier lane and does not write', () => {
  const h = createEuWorld();
  for (const name of ['carrier_rate_cards', 'carrier_lead_times']) h.put(name, 'carrier_id', 'CAR', 'destination_country', 'US');
  for (const id of ['ROUTE-0', 'ROUTE-1', 'ROUTE-2']) h.put('shipment_route_templates', 'route_template_id', id, 'destination_country', 'US');
  const before = h.writes(), v = h.c.handleImportValidate_(tokenBody(h));
  assert.equal(v.valid, false); assert.equal(h.writes(), before);
});
test('Update export shows stored tokens with unchanged transport locks', () => {
  const h = createEuWorld(), b = tokenBody(h), v = h.c.handleImportValidate_(b);
  assert.equal(h.c.handleImportCommit_(h.commitRequest(b, v)).success, true);
  const t = h.template('ResUS', 'UPDATE', true), header = t.sheets.find(s => s.name === 'Header');
  assert.equal(header.rows[0].shipping_method, 'truck'); assert.equal(header.rows[0].last_mile_delivery, 'truck');
  assert.equal(header.columns.find(c => c.key === 'last_mile_delivery').header, 'Last mile');
  for (const key of ['shipping_method', 'last_mile_delivery']) assert.equal(header.columns.find(c => c.key === key).kind, 'readonly');
});
