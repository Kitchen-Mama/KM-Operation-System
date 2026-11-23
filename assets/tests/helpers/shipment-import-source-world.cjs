'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createWorld, root, read } = require('./order-mainline-world.cjs');
function createShipmentImportWorld() {
  const h = createWorld(), c = h.c;
  vm.runInContext(read('assets/specs/active/apps-script/78_api_v1_import_batch.gs'), c);
  const file = process.env.KM_SHIPMENT_IMPORT_GS || path.join(root, 'assets/specs/active/apps-script/80_api_v1_shipment_import.gs');
  vm.runInContext(fs.readFileSync(file, 'utf8'), c, { filename: '80_api_v1_shipment_import.gs' });
  c.imbNow_ = () => '2026-11-23 17:00:00';
  h.sheet('shipments', [...new Set([...c.SHIPMENTS_HEADERS_, ...c.SHI_NEW_COLUMNS_.shipments])]);
  h.sheet('shipment_lines', [...new Set([...c.SHIPMENT_LINES_HEADERS_, ...c.SHI_NEW_COLUMNS_.shipment_lines])]);
  h.sheet('shipment_line_allocations', c.SHIPMENT_LINE_ALLOCATIONS_HEADERS_);
  h.sheet('import_batches', c.IMB_RECEIPT_HEADERS_);
  h.sheet('import_batch_changes', c.IMB_CHANGE_HEADERS_);
  h.sheet('overseas_inventory_snapshot', ['warehouse_id', 'sku', 'wh_available_stock', 'wh_reserved_stock'], [
    { warehouse_id: 'RESUS-3PL', sku: 'SKU-A', wh_available_stock: 100, wh_reserved_stock: 0 }
  ]);
  h.sheet('overseas_inventory_movements', ['movement_id', 'warehouse_id', 'sku', 'qty']);
  const warehouse = (warehouse_id, company, warehouse_type, is_active = true) => ({ warehouse_id, company, warehouse_type, is_active,
    warehouse_code: warehouse_id, warehouse_name: warehouse_id + ' fixture', country: warehouse_type === 'FACTORY' ? 'CN' : 'US', is_factory_warehouse: warehouse_type === 'FACTORY' });
  h.sheet('warehouses', ['warehouse_id', 'warehouse_code', 'warehouse_name', 'warehouse_type', 'is_factory_warehouse', 'is_active', 'company', 'country'], [
    warehouse('FACTORY', 'ResTW', 'FACTORY'), warehouse('FACTORY-OFF', 'ResTW', 'FACTORY', false),
    warehouse('RESUS-3PL', 'ResUS', '3PL'), warehouse('KM-3PL', 'KM', '3PL'),
    warehouse('RESUS-3PL-OFF', 'ResUS', '3PL', false), warehouse('OWNERLESS-3PL', '', '3PL'),
    warehouse('RESUS-FBA', 'ResUS', 'FBA'), warehouse('RESUS-RETURN', 'ResUS', 'RETURN'), warehouse('RESUS-UNKNOWN', 'ResUS', 'UNKNOWN')
  ]);
  h.sheet('marketplaces', ['company', 'country', 'marketplace', 'fulfillment_model', 'is_active'], [
    { company: 'ResUS', country: 'US', marketplace: 'Amazon', fulfillment_model: 'platform_fulfilled', is_active: true },
    { company: 'KM', country: 'US', marketplace: 'Amazon', fulfillment_model: 'platform_fulfilled', is_active: true }
  ]);
  h.sheet('carriers', ['carrier_id', 'carrier_name', 'is_active'], [{ carrier_id: 'CAR', carrier_name: 'Fixture Carrier', is_active: true }]);
  h.sheet('carrier_lead_times', ['carrier_id', 'shipping_method', 'last_mile_delivery', 'origin_country', 'destination_country', 'is_active'], [
    { carrier_id: 'CAR', shipping_method: 'truck', last_mile_delivery: 'truck', origin_country: 'US', destination_country: 'US', is_active: true }
  ]);
  h.sheet('carrier_rate_cards', ['carrier_id', 'shipping_method', 'shipping_method_label', 'last_mile_delivery', 'origin_country', 'destination_country', 'is_active'], [
    { carrier_id: 'CAR', shipping_method: 'truck', shipping_method_label: 'Fixture truck service', last_mile_delivery: 'truck', origin_country: 'CN', destination_country: 'US', is_active: true }
  ]);
  h.template = (company = 'ResUS', mode = 'ADD_NEW', include_data = false) => c.handleImportTemplateGet_({ domain: 'shipment', mode, scope: { company }, include_data });
  h.body = (source = 'RESUS-3PL', extra = {}) => ({
    domain: 'shipment', mode: 'ADD_NEW', schema_version: c.SHI_SCHEMA_VERSION_, import_batch_id: 'SOURCE-WAREHOUSE-TEST-01', scope: { company: 'ResUS' },
    file_meta: { mode: 'ADD_NEW', template_version: c.SHI_SCHEMA_VERSION_, scope: JSON.stringify({ company: 'ResUS', template_contract: c.SHI_ADD_CONTRACT_ }) },
    sheets: { Header: [{ __row: 3, external_shipment_id: 'SOURCE-WAREHOUSE-SHIP-01', country: 'US', marketplace: 'Amazon',
      source_warehouse_id: source, destination_warehouse_id: 'RESUS-FBA', etd: '2026-11-20', eta: '2026-12-01',
      reference_id: 'REF-01', carrier_id: 'CAR', shipping_method: 'truck', last_mile_delivery: 'truck', ...extra }],
    Lines: [{ __row: 3, external_shipment_id: 'SOURCE-WAREHOUSE-SHIP-01', sku: 'SKU-A', opening_remaining_qty: 20 }] }
  });
  return h;
}
module.exports = { createShipmentImportWorld };
