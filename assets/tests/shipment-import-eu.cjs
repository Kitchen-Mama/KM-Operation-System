'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createEuWorld, members } = require('./helpers/shipment-import-eu-world.cjs');
for (const country of members) test('EU import accepts active same-company destination ' + country + ' without writes', () => {
  const h = createEuWorld(country), before = h.writes(), v = h.c.handleImportValidate_(h.body());
  assert.equal(v.valid, true, JSON.stringify(v)); assert.equal(h.writes(), before);
});
for (const country of ['GB', 'UK', 'CH', 'NO', 'US', 'CN', '']) test('EU import does not admit destination outside EU membership: ' + country, () => {
  const h = createEuWorld(country), before = h.writes(), v = h.c.handleImportValidate_(h.body());
  assert.equal(v.valid, false); assert(v.issues.some(i => i.code === 'SHIPMENT_DESTINATION_COUNTRY_MISMATCH'), JSON.stringify(v));
  assert.equal(h.writes(), before);
});
test('specific national scope remains national; DE cannot use PL as a regional wildcard', () => {
  const h = createEuWorld(); h.put('marketplaces', 'company', 'ResUS', 'country', 'DE');
  const v = h.c.handleImportValidate_(h.body('FACTORY', { country: 'DE' }));
  assert.equal(v.valid, false); assert(v.issues.some(i => i.code === 'SHIPMENT_DESTINATION_COUNTRY_MISMATCH'));
});
for (const [column, value, code] of [['company', 'KM', 'SHIPMENT_DESTINATION_COMPANY_MISMATCH'],
  ['is_active', false, 'SHIPMENT_DESTINATION_INACTIVE'], ['warehouse_type', 'FACTORY', 'SHIPMENT_DESTINATION_IS_FACTORY']]) {
  test('EU permission retains destination guard ' + code, () => {
    const h = createEuWorld(); h.put('warehouses', 'warehouse_id', 'RESUS-FBA', column, value);
    const before = h.writes(), v = h.c.handleImportValidate_(h.body());
    assert.equal(v.valid, false); assert(v.issues.some(i => i.code === code), JSON.stringify(v)); assert.equal(h.writes(), before);
  });
}
test('EU permission never picks one duplicate destination warehouse', () => {
  const h = createEuWorld(), sh = h.tables.warehouses;
  sh.appendRow(sh.grid.find(r => r[0] === 'RESUS-FBA').slice());
  const before = h.writes(), v = h.c.handleImportValidate_(h.body());
  assert.equal(v.valid, false); assert(v.issues.some(i => i.code === 'REFERENCE_AMBIGUOUS')); assert.equal(h.writes(), before);
});
for (const wrongLane of ['DE', 'EU']) test('EU -> PL cannot borrow carrier service for ' + wrongLane, () => {
  const h = createEuWorld();
  for (const name of ['carrier_rate_cards', 'carrier_lead_times']) h.put(name, 'carrier_id', 'CAR', 'destination_country', wrongLane);
  for (const id of ['ROUTE-0', 'ROUTE-1', 'ROUTE-2']) h.put('shipment_route_templates', 'route_template_id', id, 'destination_country', wrongLane);
  const before = h.writes(), v = h.c.handleImportValidate_(h.body());
  assert.equal(v.valid, false); assert(v.issues.some(i => i.code === 'SERVICE_NOT_OFFERED_BY_CARRIER'), JSON.stringify(v)); assert.equal(h.writes(), before);
});
test('route selection uses PL lane over EU-wide template, binds actual warehouse, retains business EU', () => {
  const h = createEuWorld(), b = h.body(), before = h.writes(), v = h.c.handleImportValidate_(b);
  assert.equal(v.valid, true, JSON.stringify(v));
  const facts = { ...b.sheets.Header[0], warehouse_code: 'RESUS-FBA' }, C = h.c.rtiCache_(h.ss);
  const routes = h.c.rtiCandidates_(C, facts);
  assert.deepEqual(Array.from(routes.candidates, r => r.route_template_id), ['ROUTE-0'], JSON.stringify(routes));
  const end = routes.candidates[0].nodes.at(-1);
  assert.equal(end.country, 'PL'); assert.equal(end.destination_binding.warehouse_id, 'RESUS-FBA');
  assert.equal(facts.country, 'EU'); assert.equal(h.writes(), before);
  assert.deepEqual(Array.from(h.c.KMCID.planningSetMembers('EU')), ['EU', 'DE', 'ES', 'IT', 'FR']);
});
test('EU-wide route template remains a valid fallback, not a DE-specific template for PL', () => {
  const h = createEuWorld(); h.put('shipment_route_templates', 'route_template_id', 'ROUTE-0', 'is_active', false);
  const routes = h.c.rtiCandidates_(h.c.rtiCache_(h.ss), h.body().sheets.Header[0]);
  assert.deepEqual(Array.from(routes.candidates, r => r.route_template_id), ['ROUTE-2'], JSON.stringify(routes));
});
for (const destination of ['RESUS-FBA', 'RESUS-3PL']) test('commit EU -> PL retains identity/supply mode, has no stock side effects and replays without writes: ' + destination, () => {
  const h = createEuWorld(), b = h.body('FACTORY', { destination_warehouse_id: destination }), v = h.c.handleImportValidate_(b);
  assert.equal(v.valid, true, JSON.stringify(v));
  const stock = JSON.stringify(h.rows('overseas_inventory_snapshot')), po = JSON.stringify(h.rows('purchase_orders'));
  const req = h.commitRequest(b, v), r = h.c.handleImportCommit_(req); assert.equal(r.success, true, JSON.stringify(r));
  const ship = h.rows('shipments')[0]; assert.equal(ship.country, 'EU'); assert.equal(ship.destination_warehouse_id, destination);
  assert.equal(ship.opening_supply_mode, destination === 'RESUS-FBA' ? 'DISPLAY_ONLY' : 'COUNTED');
  assert.equal(JSON.stringify(h.rows('overseas_inventory_snapshot')), stock); assert.equal(JSON.stringify(h.rows('purchase_orders')), po);
  for (const table of ['factory_stock_movements', 'overseas_inventory_movements', 'shipment_line_allocations', 'shipment_routes', 'shipment_events']) assert.equal(h.rows(table).length, 0, table);
  const writes = h.writes(), replay = h.c.handleImportCommit_(req); assert.equal(replay.replayed, true, JSON.stringify(replay)); assert.equal(h.writes(), writes);
});
test('destination changed from PL to US after preview rejects commit before writes', () => {
  const h = createEuWorld(), b = h.body(), v = h.c.handleImportValidate_(b); assert.equal(v.valid, true);
  h.put('warehouses', 'warehouse_id', 'RESUS-FBA', 'country', 'US'); const before = h.writes();
  const r = h.c.handleImportCommit_(h.commitRequest(b, v)); assert.equal(r.success, false, JSON.stringify(r));
  assert.equal(h.writes(), before); assert.equal(h.rows('shipments').length, 0);
});
test('EU -> PL chosen route commits actual PL terminal and reported event, not a stock movement', () => {
  const h = createEuWorld(), b = h.body(), facts = b.sheets.Header[0];
  const candidate = h.c.rtiCandidates_(h.c.rtiCache_(h.ss), facts).candidates[0];
  Object.assign(facts, { route_template_id: candidate.route_template_id, route_template_digest: candidate.template_digest,
    route_template_node_id: candidate.nodes[0].route_template_node_id, position_as_of: '2026-11-21 12:00', position_source: 'Fixture carrier report' });
  const v = h.c.handleImportValidate_(b); assert.equal(v.valid, true, JSON.stringify(v));
  const req = h.commitRequest(b, v), r = h.c.handleImportCommit_(req); assert.equal(r.success, true, JSON.stringify(r));
  const routes = h.rows('shipment_routes'); assert.equal(routes.length, 2);
  assert.equal(routes[1].country, 'PL'); assert.equal(routes[1].location_ref_id, 'RESUS-FBA');
  assert.equal(h.rows('shipments')[0].country, 'EU'); assert.equal(h.rows('shipment_events').length, 1);
  assert.equal(h.rows('overseas_inventory_movements').length, 0); assert.equal(h.rows('factory_stock_movements').length, 0);
  const before = h.writes(); assert.equal(h.c.handleImportCommit_(req).replayed, true); assert.equal(h.writes(), before);
});
test('updating only 80_ cannot silently widen membership when the shared 22_ rule is missing', () => {
  const h = createEuWorld(); h.c.csdShipmentDestinationCountryOk_ = undefined;
  const before = h.writes(), v = h.c.handleImportValidate_(h.body());
  assert.equal(v.valid, false); assert(v.issues.some(i => i.code === 'SHIPMENT_DESTINATION_COUNTRY_MISMATCH')); assert.equal(h.writes(), before);
});
test('existing imported EU -> PL can initialise its route later without changing shipment identity or quantity', () => {
  const h = createEuWorld(), b = h.body(), v = h.c.handleImportValidate_(b);
  assert.equal(h.c.handleImportCommit_(h.commitRequest(b, v)).success, true);
  const ship = h.rows('shipments')[0], candidate = h.c.rtiCandidates_(h.c.rtiCache_(h.ss), ship).candidates[0];
  const rb = { domain: 'shipment', mode: 'ROUTE_INIT', schema_version: h.c.SHI_SCHEMA_VERSION_, import_batch_id: 'EU-PL-ROUTE-INIT-01',
    scope: { company: 'ResUS', source_import_batch_id: b.import_batch_id },
    sheets: { Header: [{ __row: 3, shipment_id: ship.shipment_id, route_template_id: candidate.route_template_id,
      route_template_digest: candidate.template_digest, route_template_node_id: candidate.nodes[0].route_template_node_id,
      position_as_of: '2026-11-21 12:00', position_source: 'Fixture carrier report' }] } };
  const before = h.writes(), rv = h.c.handleImportValidate_(rb); assert.equal(rv.valid, true, JSON.stringify(rv)); assert.equal(h.writes(), before);
  const r = h.c.handleImportCommit_(h.commitRequest(rb, rv)); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(h.rows('shipment_routes').at(-1).country, 'PL'); assert.deepEqual(h.rows('shipments')[0], ship);
  assert.equal(h.rows('shipment_lines')[0].shipment_qty, 20); assert.equal(h.rows('overseas_inventory_movements').length, 0);
});
