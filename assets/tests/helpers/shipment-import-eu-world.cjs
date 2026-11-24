'use strict';
const vm = require('node:vm');
const { createShipmentImportWorld } = require('./shipment-import-source-world.cjs');
const { read } = require('./order-mainline-world.cjs');
const { extract } = require('../ad4/extract.cjs');
const members = 'AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE'.split(' ');
function createEuWorld(destination = 'PL') {
  const h = createShipmentImportWorld(), c = h.c;
  for (const file of ['assets/js/core/supply-planning-country-identity.js',
    'assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs',
    'assets/specs/active/apps-script/87_api_v1_shipment_route_init.gs']) vm.runInContext(read(file), c, { filename: file });
  vm.runInContext(extract(read('assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs'), name => name === 'shipRouteEventSourceId_',
    name => name === 'SHIP_ARRIVAL_GATEWAY_RE_').map(part => part.text).join('\n'), c);
  h.put('warehouses', 'warehouse_id', 'RESUS-FBA', 'country', destination);
  h.put('warehouses', 'warehouse_id', 'RESUS-3PL', 'country', destination);
  h.put('marketplaces', 'company', 'ResUS', 'country', 'EU');
  h.put('carrier_rate_cards', 'carrier_id', 'CAR', 'destination_country', destination);
  h.put('carrier_lead_times', 'carrier_id', 'CAR', 'destination_country', destination);
  h.put('carrier_lead_times', 'carrier_id', 'CAR', 'origin_country', 'CN');
  const th = ['route_template_id', 'route_template_name', 'destination_country', 'carrier_id', 'transit_type', 'last_mile_delivery', 'origin_country', 'is_active'];
  h.sheet('shipment_route_templates', th, [destination, 'DE', 'EU'].map((country, i) => ({
    route_template_id: 'ROUTE-' + i, route_template_name: country + ' fixture lane', destination_country: country,
    carrier_id: 'CAR', transit_type: 'truck', last_mile_delivery: 'truck', origin_country: 'CN', is_active: true
  })));
  h.sheet('shipment_route_template_nodes', ['route_template_id', 'route_template_node_id', 'node_sequence', 'node_type', 'node_code', 'country', 'is_destination_placeholder'],
    [0, 1, 2].flatMap(i => [
      { route_template_id: 'ROUTE-' + i, route_template_node_id: 'N-' + i + '-1', node_sequence: 1, node_type: 'factory_pickup', node_code: 'PICKUP', country: 'CN' },
      { route_template_id: 'ROUTE-' + i, route_template_node_id: 'N-' + i + '-2', node_sequence: 2, node_type: 'warehouse', node_code: 'DEST', country: 'EU', is_destination_placeholder: true }
    ]));
  h.sheet('shipment_routes', [...new Set([...c.RTI_ROUTE_REQUIRED_, 'node_type', 'node_code', 'location_ref_type', 'location_ref_id', 'location_name', 'country', 'region', 'city', 'latitude', 'longitude', 'transport_mode', 'planned_event_type', 'planned_arrival_date', 'planned_departure_date', 'actual_arrival_date', 'actual_departure_date'])]);
  h.sheet('shipment_events', [...new Set([...c.RTI_EVENT_REQUIRED_, 'location_name', 'country', 'city', 'latitude', 'longitude', 'raw_status', 'updated_by', 'updated_at'])]);
  const body = h.body;
  h.body = (source = 'FACTORY', extra = {}) => body(source, { country: 'EU', ...extra });
  h.commitRequest = (body, v) => ({ ...body, scope: { ...body.scope, ...v.preview.server_scope }, preview_digest: v.preview_digest });
  return h;
}
module.exports = { createEuWorld, members };
