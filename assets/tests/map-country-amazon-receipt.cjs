'use strict';
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { test } = require('node:test');
const { createReceiptWorld, mapFunctions } = require('./helpers/map-amazon-receipt-world.cjs');
const { read, plain } = require('./helpers/order-mainline-world.cjs');
function trackWorld() {
  const c = vm.createContext({ window: {}, low: s => String(s || '').trim().toLowerCase() });
  vm.runInContext(mapFunctions(['glmTrim_', 'glmReceiptFacts_', 'glmTrackingOf_', 'glmDestinationCountry_']), c);
  return c;
}
function track(h, held) {
  const m = h.model(), s = m.shipments[0];
  return trackWorld().glmTrackingOf_({ ...s, openingDisplayOnly: true, events: m.shipmentEvents, arrival: { arrived: true } }, m.shipmentLines, held);
}
test('Amazon partial then full receipt records quantities/status/events, never changes any stock or allocations', () => {
  const h = createReceiptWorld(), stock = h.stock();
  let r = h.receive({ 'LINE-A': 40 }); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(r.data.posting.status, 'SKIP_PLATFORM'); assert.equal(r.data.status, 'partially_received');
  assert.equal(r.data.lines.find(x => x.shipment_line_id === 'LINE-A').remaining_qty, 60);
  assert.equal(track(h).active, true); assert.equal(track(h).receipt, 'partial'); assert.equal(h.stock(), stock);
  r = h.receive({ 'LINE-A': 100, 'LINE-B': 50 }); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(r.data.status, 'received'); assert.equal(track(h).active, false); assert.equal(track(h).code, 'FULLY_RECEIVED');
  assert.equal(h.stock(), stock); assert.equal(h.rows('shipment_events').filter(x => x.event_type === 'received').length, 1);
});
test('a lost-answer full receipt replay is zero-write, and a held/incomplete receipt is never hidden early', () => {
  const h = createReceiptWorld(), token = h.rows('shipments')[0].updated_at;
  assert.equal(h.receive({ 'LINE-A': 100, 'LINE-B': 50 }, token).success, true);
  assert.equal(track(h, { incomplete: true }).active, true);
  const before = h.writes(), replay = h.receive({ 'LINE-A': 100, 'LINE-B': 50 }, token);
  assert.equal(replay.success, true, JSON.stringify(replay)); assert.equal(replay.data.outcome, 'REPLAYED'); assert.equal(h.writes(), before);
  assert.equal(replay.data.posting.status, 'SKIP_PLATFORM');
});
test('missing final receipt event keeps a fully populated Amazon shipment visible until the same receipt completes', () => {
  const h = createReceiptWorld(), append = h.tables.shipment_events.appendRow;
  h.tables.shipment_events.appendRow = () => { throw Error('fixture event write interrupted'); };
  let r = h.receive({ 'LINE-A': 100, 'LINE-B': 50 }); assert.equal(r.code, 'SHIPMENT_RECEIPT_INCOMPLETE');
  assert.equal(track(h).active, true); assert.equal(track(h).code, 'RECEIPT_EVENT_MISSING');
  h.tables.shipment_events.appendRow = append;
  r = h.receive({ 'LINE-A': 100, 'LINE-B': 50 }); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(track(h).active, false);
});
test('stale, over-received, backwards and foreign-line receipts are refused without stock or receipt writes', () => {
  const h = createReceiptWorld(); assert.equal(h.receive({ 'LINE-A': 40 }).success, true);
  for (const [values, tok] of [[{ 'LINE-A': 50 }, '2026-11-24 13:00:00'], [{ 'LINE-A': 101 }], [{ 'LINE-A': 39 }], [{ FOREIGN: 5 }]]) {
    const before = h.writes(), r = h.receive(values, tok); assert.equal(r.success, false, JSON.stringify(r)); assert.equal(h.writes(), before);
  }
});
for (const mode of ['PENDING:DISPLAY_ONLY', 'PENDING:COUNTED', 'UNKNOWN']) test('unfinished/unknown import remains non-receivable: ' + mode, () => {
  const h = createReceiptWorld(mode), before = h.writes(), r = h.receive({ 'LINE-A': 10 });
  assert.equal(r.success, false); assert.equal(r.code, 'SHIPMENT_OPENING_NOT_COMMITTED', JSON.stringify(r)); assert.equal(h.writes(), before);
});
test('committed display-only marker never posts into 3PL inventory after a destination master change', () => {
  const h = createReceiptWorld(); h.put('warehouses', 'warehouse_id', 'RESUS-FBA', 'warehouse_type', '3PL');
  const before = h.stock(), r = h.receive({ 'LINE-A': 10 }); assert.equal(r.success, true, JSON.stringify(r)); assert.equal(r.data.posting.status, 'SKIP_PLATFORM'); assert.equal(h.stock(), before);
});
test('normal FBA receipt still skips posting; COUNTED 3PL retains its posting decision and amount', () => {
  const h = createReceiptWorld('COUNTED'), ls = h.c.shipmentReadSheet_(h.tables.shipment_lines), byId = { 'LINE-A': { sku: 'SKU-A', oldReceived: 0, shippedQty: 100 } };
  let f = h.c.shipReceiptLedgerFacts_(h.ss, 'AMZ-DE', h.tables.shipments, ls, byId);
  assert.equal(f.decision, 'SKIP_PLATFORM');
  h.put('shipments', 'shipment_id', 'AMZ-DE', 'destination_warehouse_id', 'RESUS-3PL');
  f = h.c.shipReceiptLedgerFacts_(h.ss, 'AMZ-DE', h.tables.shipments, ls, byId); assert.equal(f.decision, 'POST');
  assert.equal(h.c.shipReceiptPostAmount_(100, 40), 60);
});
test('real Production 3PL stock owners still post only receipt deltas and never post a replay twice', () => {
  const h = createReceiptWorld('COUNTED');
  for (const file of ['05_overseas_inventory_handlers.gs', '21_factory_inventory_handlers.gs']) vm.runInContext(read('output/dw2-workflow-20261122/release-4/candidate/Production/apps-script/' + file), h.c);
  h.put('shipments', 'shipment_id', 'AMZ-DE', 'destination_warehouse_id', 'RESUS-3PL');
  h.sheet('overseas_inventory_movements', h.c.SHIP_RECEIPT_OVS_MOV_HEADERS_);
  let r = h.receive({ 'LINE-A': 40 }); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(h.rows('overseas_inventory_snapshot')[0].wh_available_stock, 140);
  const before = h.writes(); r = h.receive({ 'LINE-A': 40 }); assert.equal(r.success, true); assert.equal(h.writes(), before);
  r = h.receive({ 'LINE-A': 100 }); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(h.rows('overseas_inventory_snapshot')[0].wh_available_stock, 200);
  assert.deepEqual(h.rows('overseas_inventory_movements').map(x => x.wh_quantity), [40, 60]);
});
test('destination country resolves actual warehouse, normalizes UK, and falls back without using origin or gateway', () => {
  const c = trackWorld();
  const idx = { whRowsById: { DE: [{ country: 'DE' }], UK: [{ country: 'UK' }] } };
  assert.equal(c.glmDestinationCountry_({ country: 'EU', destinationWarehouseId: 'DE', warehouseId: 'UK' }, idx), 'DE');
  assert.equal(c.glmDestinationCountry_({ country: 'GB', warehouseId: 'UK' }, idx), 'GB');
  assert.equal(c.glmDestinationCountry_({ country: 'CA', warehouseId: 'MISSING' }, idx), 'CA');
});
test('Update Existing cannot shrink an imported total after a receipt started, even when status was not yet written', () => {
  const h = createReceiptWorld(); h.put('shipment_lines', 'shipment_line_id', 'LINE-A', 'shipment_received_qty', 10);
  const t = h.template('ResUS', 'UPDATE', true); assert.equal(t.success, true, JSON.stringify(t));
  const sheets = Object.fromEntries(t.sheets.map(s => [s.name, s.rows.map(r => ({ ...r, ...(s.name === 'Lines' ? { opening_remaining_qty: 30 } : {}) }))]));
  const req = { domain: 'shipment', mode: 'UPDATE', schema_version: h.c.SHI_SCHEMA_VERSION_, import_batch_id: 'RECEIPT-STARTED-TEST', scope: { company: 'ResUS' },
    file_meta: { mode: 'UPDATE', template_version: h.c.SHI_SCHEMA_VERSION_, scope: JSON.stringify(t.scope) }, sheets };
  const before = h.writes(), r = h.c.handleImportValidate_(req);
  assert.equal(r.valid, false); assert(r.issues.some(x => x.code === 'SHIPMENT_OPENING_RECEIPT_STARTED'), JSON.stringify(r)); assert.equal(h.writes(), before);
});
test('country filter replaces destination warehouse; shared arrival label no longer refuses Amazon receiving', () => {
  const map = read('assets/js/pages/global-logistics-map.js'), hist = read('assets/js/pages/shipping-history.js');
  assert(map.includes("selHtml('Destination Country', 'destCountry'")); assert(!map.includes("selHtml('Destination', 'destWarehouse'"));
  assert(!/不在本系統收貨|不計入供給、不收貨|DISPLAY_ONLY_NO_RECEIPT_HOLD/.test(map + hist));
  const c = vm.createContext({}); vm.runInContext(hist.slice(hist.indexOf('var KMLogisticsArrival ='), hist.indexOf("if (typeof window !== 'undefined') window.KMLogisticsArrival")), c);
  const state = plain(c.KMLogisticsArrival.stateFromVerdict({ status: 'in_transit', displayOnly: true }, { arrived: true }));
  assert.match(state.label, /待收貨/); assert(!/不在本系統/.test(state.label));
});
test('even the Received Today KPI cannot return completed cards to the active map', () => {
  const c = vm.createContext({ state: { filters: { search: '', kpi: 'deliveredToday' } }, allVms: () => [{ track: { active: false }, flags: { deliveredToday: true } }] });
  vm.runInContext(mapFunctions(['filteredVms']), c); assert.equal(c.filteredVms().length, 0);
});
test('Amazon may report arrival on its server-bound manual route without receiving or posting stock', () => {
  const h = createReceiptWorld();
  h.sheet('shipment_routes', ['shipment_route_id', 'shipment_id', 'route_template_id', 'route_template_node_id', 'sequence_no', 'status', 'node_type', 'location_ref_type', 'location_ref_id'], [
    { shipment_route_id: 'MAN-ORIGIN', shipment_id: 'AMZ-DE', route_template_id: 'MANUAL', route_template_node_id: 'MANUAL:ORIGIN', sequence_no: 1, status: 'current', node_type: 'origin', location_ref_type: 'warehouse', location_ref_id: 'FACTORY' },
    { shipment_route_id: 'MAN-DEST', shipment_id: 'AMZ-DE', route_template_id: 'MANUAL', route_template_node_id: 'MANUAL:DESTINATION', sequence_no: 2, status: 'planned', node_type: 'destination', location_ref_type: 'warehouse', location_ref_id: 'RESUS-FBA' }
  ]);
  const before = h.stock(), body = { shipment_id: 'AMZ-DE', manual_report: 'ARRIVED_AT_DESTINATION', operation_id: 'MANUAL-ARRIVAL-TEST', report_time: '2026-11-24 14:30', reason: 'Fixture warehouse confirmation', expected_updated_at: h.rows('shipments')[0].updated_at };
  const r = h.c.shipManualPositionReport_(body); assert.equal(r.success, true, JSON.stringify(r));
  assert.equal(h.rows('shipment_routes')[1].status, 'current'); assert.equal(h.rows('shipment_lines')[0].shipment_received_qty, 0); assert.equal(h.stock(), before);
  const writes = h.writes(); assert.equal(h.c.shipManualPositionReport_(body).success, true); assert.equal(h.writes(), writes);
});
