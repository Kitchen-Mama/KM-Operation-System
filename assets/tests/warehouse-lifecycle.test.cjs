'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
function world() {
  const c = vm.createContext({ KMSLS: require('../js/core/supply-planning-shipment-line-source.js') });
  for (const f of ['70_api_v1_overseas_stock_workspace.gs', '88_api_v1_warehouse_lifecycle.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, 'assets/specs/active/apps-script', f), 'utf8'), c);
  }
  return c;
}
const plain = x => JSON.parse(JSON.stringify(x));
function fixture() {
  return {
    warehouses: [{ warehouse_id: 'F', company: 'ResTW', warehouse_type: 'factory', is_factory_warehouse: true },
      { warehouse_id: 'W', company: 'KM', warehouse_type: '3PL' }, { warehouse_id: 'R', company: 'ResUS', warehouse_type: '3PL' }],
    factory_stock: [{ factory_stock_id: 'FS', warehouse_id: 'F', sku: 'A', fac_current_stock: 100, fac_reserved_stock: 10 }],
    overseas_inventory_snapshot: [{ warehouse_id: 'W', sku: 'A', wh_available_stock: 50, wh_on_the_way_qty: 999 }],
    sku_details: [], sku_regional_details: [], overseas_inventory_movements: [],
    purchase_orders: [{ purchase_order_id: 'P', company: 'KM', warehouse_id: 'F', order_status: 'partial_completed' }],
    purchase_order_lines: [{ purchase_order_line_id: 'PL', purchase_order_id: 'P', sku: 'A', ordered_qty: 100, completed_qty: 40, shipped_qty: 30, remaining_qty: 999 }],
    shipments: [{ shipment_id: 'S', shipment_no: 'S-1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'Amazon',
      destination_warehouse_id: 'W', source_warehouse_id: 'F', eta: '2026-12-02', record_origin: 'IMPORT_HISTORICAL', opening_supply_mode: 'COUNTED' },
      { shipment_id: 'D', status: 'draft', company: 'KM', country: 'US', marketplace: 'Shopify', source_warehouse_id: 'F', destination_warehouse_id: 'W' }],
    shipment_lines: [{ shipment_line_id: 'SL', shipment_id: 'S', sku: 'A', shipment_qty: 100, shipment_received_qty: 20 },
      { shipment_line_id: 'DL', shipment_id: 'D', sku: 'A', shipment_qty: 10, shipment_received_qty: 0 }],
    shipping_plans: [], shipping_plan_lines: [], shipment_plan_links: []
  };
}
module.exports = { world, fixture, plain, root };
if (require.main === module) {
  let checks = 0; const c = world();
  const eq = (a, b) => { assert.deepEqual(plain(a), b); checks++; };
  const overseas = t => plain(c.wilBuildOverseas_(t));
  const factory = t => plain(c.wilBuildFactory_(t));
  const first = (r, sku = 'A') => r.rows.find(x => x.sku === sku);
  let t = fixture(), before = JSON.stringify(t);
  eq(first(overseas(t)).onTheWayQty, 80);
  eq(first(factory(t)).inProduction, 60);
  eq(first(factory(t)).pendingShipout, 10);
  eq(JSON.stringify(t), before);
  eq(first(factory(t)).purchaseOrders[0].quantity, 60);
  eq(first(overseas(t)).shipments[0].quantity, 80);
  for (const status of ['shipped', 'in_transit', 'arrived', 'delivered', 'partial_received', 'partially_received']) {
    t = fixture(); t.shipments[0].status = status; eq(first(overseas(t)).onTheWayQty, 80);
  }
  for (const status of ['draft', 'ready_to_ship', 'received', 'closed', 'completed', 'cancelled', 'canceled']) {
    t = fixture(); t.shipments[0].status = status; eq(first(overseas(t)).onTheWayQty, 0);
  }
  t = fixture(); t.shipments[0].opening_supply_mode = 'DISPLAY_ONLY'; eq(first(overseas(t)).onTheWayQty, 80);
  t.shipments[0].opening_supply_mode = 'PENDING'; eq(first(overseas(t)).onTheWayQty, 0);
  t = fixture(); t.shipment_lines[0].shipment_received_qty = 100; eq(first(overseas(t)).onTheWayQty, 0);
  for (const [field, value] of [['shipment_qty', -1], ['shipment_received_qty', -1], ['shipment_received_qty', 101], ['shipment_qty', 1.5]]) {
    t = fixture(); t.shipment_lines[0][field] = value; eq(first(overseas(t)).onTheWayQty, null);
  }
  t = fixture(); t.shipments[0].eta = ''; eq(first(overseas(t)).onTheWayQty, 80); eq(first(overseas(t)).issues.length, 1);
  t = fixture(); t.shipments[0].destination_warehouse_id = 'R'; eq(overseas(t).rows.find(r => r.warehouseId === 'R').onTheWayQty, null);
  t = fixture(); t.shipments[0].destination_warehouse_id = ''; t.shipments[0].warehouse_id = 'W';
  eq(first(overseas(t)).onTheWayQty, 0); eq(overseas(t).issues.length, 1);
  t = fixture(); t.shipment_lines[0].line_status = 'removed'; eq(first(overseas(t)).onTheWayQty, 0);
  t = fixture(); t.shipment_lines[0].line_status = 'TYPO'; eq(first(overseas(t)).onTheWayQty, null);
  t = fixture(); t.overseas_inventory_snapshot = []; eq(first(overseas(t)).onTheWayQty, 80);
  for (const status of ['issued', 'confirmed', 'in_production', 'partial_completed', 'partial_shipped', 'ready_to_ship']) {
    t = fixture(); t.purchase_orders[0].order_status = status; eq(first(factory(t)).inProduction, 60);
  }
  for (const status of ['draft', 'completed', 'cancelled', 'closure', 'closed', 'shipped']) {
    t = fixture(); t.purchase_orders[0].order_status = status; eq(first(factory(t)).inProduction, 0);
  }
  t = fixture(); t.purchase_order_lines[0].completed_qty = 101; eq(first(factory(t)).inProduction, null);
  t = fixture(); t.purchase_orders[0].order_status = 'TYPO'; eq(first(factory(t)).inProduction, null);
  t = fixture(); t.shipments[0].status = 'TYPO'; eq(first(overseas(t)).onTheWayQty, null);
  t = fixture(); t.factory_stock[0].fac_reserved_stock = 9; eq(first(factory(t)).pendingShipout, null);
  t = fixture(); t.shipments[1].status = 'ready_to_ship'; eq(first(factory(t)).pendingShipout, 10);
  t = fixture(); t.shipments[1].status = 'shipped'; t.factory_stock[0].fac_reserved_stock = 0;
  eq(first(factory(t)).pendingShipout, 0); eq(first(overseas(t)).onTheWayQty, 90);
  t.shipment_lines[1].shipment_received_qty = 10; t.shipments[1].status = 'received'; eq(first(overseas(t)).onTheWayQty, 80);
  t = fixture(); t.shipments[1].record_origin = 'IMPORT_HISTORICAL'; t.shipments[1].opening_supply_mode = 'COUNTED'; t.factory_stock[0].fac_reserved_stock = 0;
  eq(first(factory(t)).pendingShipout, 0);
  t = fixture(); t.factory_stock = []; t.shipments[1].status = 'cancelled'; eq(first(factory(t)).inProduction, 60);
  eq(first(factory(t)).pendingShipout, 0);
  t = fixture(); t.shipment_lines.push({ ...t.shipment_lines[0] }); assert.throws(() => overseas(t), /DUPLICATE/); checks++;
  t = fixture(); t.factory_stock.push({ ...t.factory_stock[0] }); assert.throws(() => factory(t), /DUPLICATE/); checks++;
  const reads = [], io = { now: () => 0, openTarget: () => ({}), readTable: (ss, name) => { reads.push(name); return fixture()[name] || []; } };
  const f = c.handleFactoryInventoryWorkspaceGet_({}, io); eq(f.success, true); eq(f.meta.db_writes, 0); eq(first(f.data.lifecycle).pendingShipout, 10);
  eq(reads.includes('overseas_inventory_snapshot'), false);
  reads.length = 0; const o = c.handleOverseasStockWorkspaceGet_({ payload: { include: { lifecycle: true } } }, io);
  eq(o.success, true); eq(first(o.data.lifecycle).onTheWayQty, 80); eq(o.data.overseas_inventory_snapshot[0].wh_on_the_way_qty, 999);
  eq(reads.includes('factory_stock'), false);
  const fail = c.handleFactoryInventoryWorkspaceGet_({}, { ...io, readTable: () => { throw new Error('read failed'); } });
  eq(fail.success, false); eq(fail.data, null);
  console.log('WAREHOUSE_LIFECYCLE_PASS ' + checks + ' live_writes=0');
}
