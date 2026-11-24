'use strict';
const vm = require('node:vm');
const { createShipmentImportWorld } = require('./shipment-import-source-world.cjs');
const { read, plain } = require('./order-mainline-world.cjs');
function createReceiptWorld(mode = 'DISPLAY_ONLY') {
  const h = createShipmentImportWorld();
  h.c.Utilities.parseDate = value => new Date(String(value).replace(' ', 'T') + '+08:00');
  for (const name of ['05_overseas_inventory_handlers.gs', '22_shipment_dispatch_handlers.gs', '31_shipment_receipt_route_handlers.gs']) {
    vm.runInContext(read('assets/specs/active/apps-script/' + name), h.c, { filename: name });
  }
  let tick = 0;
  h.c.shipmentTimestamp_ = () => '2026-11-24 15:' + String(++tick).padStart(2, '0') + ':00';
  h.sheet('shipments', [...new Set([...h.c.SHIPMENTS_HEADERS_, ...h.c.SHI_NEW_COLUMNS_.shipments])], [{
    shipment_id: 'AMZ-DE', shipment_no: 'AMZ-DE', external_shipment_id: 'FBA-DE-FIXTURE', company: 'ResUS', country: 'EU', marketplace: 'Amazon',
    status: 'in_transit', record_origin: 'IMPORT_HISTORICAL', opening_supply_mode: mode, source_warehouse_id: 'FACTORY',
    destination_warehouse_id: 'RESUS-FBA', warehouse_id: 'RESUS-FBA', eta: '2026-11-30', etd: '2026-11-20', updated_at: '2026-11-24 14:00:00'
  }]);
  h.put('warehouses', 'warehouse_id', 'RESUS-FBA', 'country', 'DE');
  h.sheet('shipment_lines', [...new Set([...h.c.SHIPMENT_LINES_HEADERS_, ...h.c.SHI_NEW_COLUMNS_.shipment_lines])], [
    { shipment_line_id: 'LINE-A', shipment_id: 'AMZ-DE', sku: 'SKU-A', shipment_qty: 100, shipment_received_qty: 0 },
    { shipment_line_id: 'LINE-B', shipment_id: 'AMZ-DE', sku: 'SKU-B', shipment_qty: 50, shipment_received_qty: 0 }
  ]);
  h.sheet('shipment_events', h.c.SHIP_EVENT_HEADERS_);
  h.sheet('shipment_routes', ['shipment_route_id', 'shipment_id']);
  h.sheet('amazon_inventory_snapshot', ['country', 'sku', 'available_qty'], [{ country: 'DE', sku: 'SKU-A', available_qty: 733 }]);
  const stockTables = ['amazon_inventory_snapshot', 'overseas_inventory_snapshot', 'overseas_inventory_movements', 'factory_stock', 'factory_stock_movements', 'purchase_order_lines', 'shipment_line_allocations'];
  const stock = () => JSON.stringify(Object.fromEntries(stockTables.map(k => [k, h.rows(k)])));
  const receive = (lines, token = h.rows('shipments')[0].updated_at) => plain(h.c.handleUpdateShipmentReceipt_({
    shipment_id: 'AMZ-DE', actor: 'fixture', expected_updated_at: token,
    lines: Object.entries(lines).map(([shipment_line_id, shipment_received_qty]) => ({ shipment_line_id, shipment_received_qty }))
  }));
  function model() {
    const camel = r => Object.fromEntries(Object.entries(r).map(([key, v]) => [key.replace(/_([a-z])/g, (_, c) => c.toUpperCase()), v]));
    return { shipments: h.rows('shipments').map(camel), shipmentLines: h.rows('shipment_lines').map(camel), shipmentEvents: h.rows('shipment_events').map(camel),
      shipmentRoutes: h.rows('shipment_routes').map(camel), warehouses: h.rows('warehouses').map(camel), logisticsLocations: [], shipmentRouteTemplates: [], shipmentRouteTemplateNodes: [] };
  }
  return { ...h, receive, stock, model };
}
function mapFunctions(names) {
  const { extract } = require('../ad4/extract.cjs');
  return extract(read('assets/js/pages/global-logistics-map.js').replace(/^  /gm, ''), n => names.includes(n), () => false).map(p => p.text).join('\n');
}
module.exports = { createReceiptWorld, mapFunctions };
