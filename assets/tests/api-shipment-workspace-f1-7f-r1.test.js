// Kitchen Mama Operation System — F1-7F-SHIPMENT-AND-ON-THE-WAY-WORKSPACE-CUTOVER-R1
// Proves the scoped Shipment workspace + page cutover WITHOUT changing business output:
//   - backend 57_ reads ONLY the Shipment table set (never getOperationDb); MAP-extra tables (routes/events/locations/
//     templates) returned only when the include flag is set; no FIFO/allocation/PO-shipped/receipt/factory authority;
//   - the db-api adapter runs the SAME normalizers + per-array filters as normalizeOperationDb → arrays byte-identical
//     to the legacy getters (BEFORE == AFTER);
//   - shipment activated CANONICAL; router dispatch present; both pages source their read-model from the workspace
//     (no getOperationDb/loadOperationDb/_opDbCache in the primary read path), fail-closed on error.
// Run: node assets/tests/api-shipment-workspace-f1-7f-r1.test.js
// NOTE: no 'use strict' — extracted pure builders are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}

var GS57 = read('specs/active/apps-script/57_api_v1_shipment_workspace.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var FND = read('js/api/km-api-foundation.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var SH_JS = read('js/pages/shipping-history.js');
var GLM_JS = read('js/pages/global-logistics-map.js');

// eval the PURE builder block of 57_ (constants + pure functions; the impure io orchestrator is excluded)
eval(slice(GS57, 'var SHIP_WS_SEQ_', '// --------------------------------------------------------------------------------------------------------\n// IMPURE'));

// ---- backend build: collection, line grouping, filter, sort, pagination, passthrough, include gating ----
console.log('\n== shipWorkspaceBuild_ View-Model ==');
var tables = {
  shipments: [
    { shipment_id: 'SH-1', shipment_no: 'KM-SH-1', company: 'KM', country: 'US', status: 'in_transit', carrier_id: 'C1', etd: '2026-08-01', eta: '2026-08-20', updated_at: '2026-08-10', destination_warehouse_id: 'WH-US' },
    { shipment_id: 'SH-2', shipment_no: 'KM-SH-2', company: 'ResTW', country: 'US', status: 'received', carrier_id: 'C1', etd: '2026-07-01', eta: '2026-07-20', updated_at: '2026-08-11', warehouse_id: 'WH-US' }
  ],
  shipment_lines: [
    { shipment_line_id: 'SL-1', shipment_id: 'SH-1', sku: 'GA0450', shipment_qty: 500, shipment_received_qty: 100 },
    { shipment_line_id: 'SL-2', shipment_id: 'SH-1', sku: 'GA0451', shipment_qty: 200, shipment_received_qty: '' },
    { shipment_line_id: 'SL-3', shipment_id: 'SH-2', sku: 'GA0450', shipment_qty: 300, shipment_received_qty: 300 }
  ],
  warehouses: [{ warehouse_id: 'WH-US', warehouse_name: 'US 3PL' }],
  carrier_rate_cards: [{ rate_card_id: 'RC-1', carrier_id: 'C1' }],
  shipment_routes: [{ shipment_route_id: 'R-1', shipment_id: 'SH-1', sequence_no: 1, latitude: 25, longitude: 121 }],
  shipment_events: [{ shipment_event_id: 'E-1', shipment_id: 'SH-1', event_sequence: 1, event_type: 'departed' }],
  logistics_locations: [{ logistics_location_id: 'LL-1', location_name: 'Taipei Port', latitude: 25, longitude: 121 }],
  shipment_route_templates: [{ route_template_id: 'RT-1', route_template_name: 'TW-US' }],
  shipment_route_template_nodes: [{ route_template_node_id: 'RTN-1', route_template_id: 'RT-1', node_name: 'Origin' }]
};
// base call (no map includes) — only base tables in the VM
var vm = shipWorkspaceBuild_(tables, { page: { number: 1, size: 3000 } });
var byId = {}; vm.shipments.forEach(function (s) { byId[s.shipmentId] = s; });
eq(byId['SH-1'].sumShipmentQty, 700, 'SH-1 sum shipment_qty = 500+200'); eq(byId['SH-1'].sumReceivedQty, 100, 'SH-1 received = 100+0(blank)');
eq(byId['SH-1'].destinationWarehouseId, 'WH-US', 'destination warehouse id'); eq(byId['SH-2'].destinationWarehouseId, 'WH-US', 'SH-2 legacy warehouse_id fallback');
ok(byId['SH-1'].company === 'KM' && byId['SH-2'].company === 'ResTW', 'company passthrough (KM/ResTW)');
ok(byId['SH-1'].raw && byId['SH-1'].raw.shipment_id === 'SH-1', 'shipment carries raw passthrough (adapter reproduces canonical fields)');
eq(vm.shipmentLines.length, 3, 'shipment_lines flat passthrough (pages group by shipment_id)');
ok(vm.shipmentLines[0].shipment_line_id === 'SL-1' && vm.shipmentLines[0].shipment_received_qty === 100, 'line raw passthrough (shipment_received_qty verbatim, not recomputed)');
ok(vm.warehouses.length === 1 && vm.carrierRateCards.length === 1, 'base master subsets returned');
ok(vm.shipmentRoutes === undefined && vm.shipmentEvents === undefined && vm.logisticsLocations === undefined, 'MAP-extra tables ABSENT without include (bounded includes, not broad load)');
eq(vm.summary.byStatus.in_transit, 1, 'summary byStatus in_transit=1');

// map call (with includes) — MAP-extra tables present
console.log('\n== include-gated MAP tables ==');
var vmMap = shipWorkspaceBuild_(tables, { page: { number: 1, size: 3000 }, include: { routes: true, events: true, locations: true, templates: true } });
ok(vmMap.shipmentRoutes.length === 1 && vmMap.shipmentEvents.length === 1 && vmMap.logisticsLocations.length === 1 && vmMap.shipmentRouteTemplates.length === 1 && vmMap.shipmentRouteTemplateNodes.length === 1, 'include → MAP route/event/location/template tables returned (raw passthrough)');
ok(vmMap.shipmentEvents[0].shipment_event_id === 'E-1', 'event raw passthrough (persisted coords/facts verbatim)');

console.log('\n== filter / sort / pagination / empty ==');
eq(shipWorkspaceBuild_(tables, { filters: { company: 'KM' } }).shipments.map(function (s) { return s.shipmentId; }), ['SH-1'], 'filter by company');
eq(shipWorkspaceBuild_(tables, { filters: { status: 'received' } }).shipments.map(function (s) { return s.shipmentId; }), ['SH-2'], 'filter by status');
eq(shipWorkspaceBuild_(tables, { search: 'KM-SH-2' }).shipments.map(function (s) { return s.shipmentId; }), ['SH-2'], 'search by shipment_no');
eq(shipWorkspaceBuild_(tables, { sort: [{ field: 'etd', direction: 'asc' }] }).shipments.map(function (s) { return s.shipmentId; }), ['SH-2', 'SH-1'], 'sort by etd asc');
var pg = shipWorkspaceBuild_(tables, { page: { number: 1, size: 1 } });
eq(pg.pagination.totalItems, 2, 'pagination totalItems=2'); eq(pg.shipments.length, 1, 'page size 1 → 1 item'); eq(pg.shipmentLines.length, 1, 'lines scoped to the single page shipment (SH-2 → SL-3)');
var empty = shipWorkspaceBuild_({ shipments: [], shipment_lines: [], warehouses: [], carrier_rate_cards: [] }, {});
eq(empty.shipments.length, 0, 'empty → 0 shipments'); eq(empty.summary.totalShipments, 0, 'empty summary 0');
var threw = false; try { shipWorkspaceBuild_(tables, { sort: [{ field: 'evil', direction: 'asc' }] }); } catch (e) { threw = (e.validationCode === 'VALIDATION_FAILED'); }
ok(threw, 'invalid sort field → VALIDATION_FAILED (fail closed)');

console.log('\n== §12/§13/§16 source guards: read-only, no FIFO/allocation/receipt/PO/factory authority ==');
var code57 = GS57.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code57), '57_ never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code57), '57_ writes nothing (read-only)');
ok(!/shipment_line_allocations|slaFifoCompare_|generateShipmentLineAllocations|factory_stock|purchase_order_lines|shipped_qty/.test(code57), '57_ runs NO FIFO/allocation/PO-shipped/factory-stock (no business authority moved)');
ok(/shipment_received_qty/.test(GS57) && !/shipment_received_qty\s*=[^=]/.test(code57), 'shipment_received_qty passed through (read/compare) — never assigned/recomputed');
ok(/action === 'shipment\.workspace\.get'/.test(ROUTER) && /handleShipmentWorkspaceGet_\(body\)/.test(ROUTER), 'router dispatches shipment.workspace.get');

console.log('\n== activation + db-api adapter (BEFORE == AFTER via SAME normalizers + filters) ==');
ok(/WORKSPACE_CANONICAL = \{[^}]*shipment: true/.test(FND), 'shipment is CANONICAL');
ok(/WORKSPACE_ENABLED_DEFAULT = \{[^}]*shipment: true/.test(FND), 'shipment per-workspace flag defaults ON');
ok(/register\('shipment', \{[^}]*status: WORKSPACE_STATUS\.IMPLEMENTED, resolver: shipmentResolver/.test(FND), 'shipment registered IMPLEMENTED with resolver');
ok(/KM\.DB\.normalizeShipment =/.test(DBAPI) && /KM\.DB\.normalizeShipmentLine =/.test(DBAPI), 'shipment normalizers exposed');
var adapter = slice(DBAPI, 'KM.DB.adaptShipmentWorkspace = function', '\n};\n');
ok(/normalizeShipmentRecord\(\(s && s\.raw\)/.test(adapter) && /normalizeShipmentLineRecord\)/.test(adapter), 'adapter maps DTO raw through the canonical shipment normalizers');
ok(/return r\.shipmentId; \}\)/.test(adapter) && /r\.shipmentLineId \|\| r\.shipmentId/.test(adapter) && /r\.shipmentEventId \|\| r\.shipmentId \|\| r\.eventType/.test(adapter), 'adapter applies the SAME per-array filters as normalizeOperationDb (arrays equal the getters)');
ok(/normalizeShipmentRouteRecord/.test(adapter) && /normalizeShipmentEventRecord/.test(adapter) && /normalizeLogisticsLocationRecord/.test(adapter) && /normalizeShipmentRouteTemplateRecord/.test(adapter), 'adapter re-normalizes the MAP-extra arrays with the same normalizers');

console.log('\n== pages: workspace primary read, no broad DB, fail-closed ==');
// shipping-history.js
ok(/workspaceApiActive\('shipment'\)/.test(SH_JS), 'shipping-history: gates on canonical shipment workspace');
ok(/getWorkspace\('shipment'/.test(SH_JS) && /adaptShipmentWorkspace/.test(SH_JS), 'shipping-history: primary read via scoped workspace + adapter');
var shRefresh = slice(SH_JS, 'function _shRefresh_', 'function _shRenderError_');
ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(shRefresh.slice(0, shRefresh.indexOf('Legacy'))), 'shipping-history: Workspace read branch has NO getOperationDb/loadOperationDb/_opDbCache');
ok(/WORKSPACE_UNAVAILABLE|WORKSPACE_ERROR|SHIPMENT_READ_FAILED/.test(SH_JS), 'shipping-history: fail-closed error (no silent legacy fallback)');
ok(/KM\.loadState\.bindElement/.test(SH_JS), 'shipping-history: reuses KM.loadState region');
// global-logistics-map.js
ok(/workspaceApiActive\('shipment'\)/.test(GLM_JS), 'map: gates on canonical shipment workspace');
ok(/getWorkspace\('shipment'/.test(GLM_JS) && /adaptShipmentWorkspace/.test(GLM_JS), 'map: primary read via scoped workspace + adapter (with map includes)');
ok(/include:\s*\{[^}]*routes:\s*true[\s\S]*?events:\s*true[\s\S]*?locations:\s*true[\s\S]*?templates:\s*true/.test(GLM_JS), 'map: requests the MAP-extra includes');
ok(/WORKSPACE_UNAVAILABLE|WORKSPACE_ERROR|MAP_READ_FAILED/.test(GLM_JS), 'map: fail-closed error (no silent legacy fallback)');
// no frontend FIFO/allocation reconstruction added
ok(!/generateShipmentLineAllocations[\s\S]{0,40}slaFifoCompare_/.test(GLM_JS), 'map: no frontend FIFO/allocation reconstruction');

console.log('\n----------------------------------------');
console.log('API SHIPMENT WORKSPACE (F1-7F-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
