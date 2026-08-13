// Kitchen Mama Operation System — F1-7D-REQUEST-ORDER-WORKSPACE-AND-CUTOVER-R1
// Proves the scoped Request Order workspace + Draft-page cutover WITHOUT changing business output:
//   - backend 51_ composes ONLY persisted request_orders/request_order_lines (+ the masters the page consumes);
//     NO Gap/Forecast/Recommendation, NO draft generation/persistence, NO RO->PO, NO FIFO, NO getOperationDb;
//   - request_order_line_sources (documented PENDING write path) is read OPTIONAL/missing-safe; the provisioned
//     tables stay fail-closed;
//   - requestOrder activated as a CANONICAL workspace; router dispatch present;
//   - request-order-draft.js sources its read-model from the workspace (no getOperationDb/loadOperationDb/_opDbCache
//     in the primary render path), fails closed on error, and reuses the SAME db-api normalizers (BEFORE == AFTER);
//   - Recommendation/scheduled-draft/user-edit-protection/RO->PO contracts untouched (source guards + request-order.js
//     deferred, unchanged).
// Run: node assets/tests/api-request-order-workspace-f1-7d-r1.test.js
// NOTE: no 'use strict' — the 51_ builders are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var GS51 = read('specs/active/apps-script/51_api_v1_request_order_workspace.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var FND = read('js/api/km-api-foundation.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var PAGE = read('js/pages/request-order-draft.js');

// eval the ENTIRE 51_ (all function declarations hoist; impure prod*/SpreadsheetApp refs live inside
// roWorkspaceDefaultIo_ and are only resolved when CALLED — the injected-io tests never call them).
eval(GS51);

// ---- backend build: rollups, join, filter, sort, pagination, passthrough ----
console.log('\n== roWorkspaceBuild_ View-Model ==');
var tables = {
  request_orders: [
    { request_order_id: 'RO-1', request_order_no: 'REQ-0001', company: 'KM', request_status: 'draft', created_at: '2026-08-10' },
    { request_order_id: 'RO-2', request_order_no: 'REQ-0002', company: 'ResTW', request_status: 'pending_approval', created_at: '2026-08-11' },
    { request_order_id: 'RO-3', request_order_no: 'REQ-0003', company: 'ResUS', status: 'approved', created_at: '2026-08-09' }   // legacy `status` fallback
  ],
  request_order_lines: [
    { request_order_line_id: 'ROL-1', request_order_id: 'RO-1', sku: 'GA0450', company: 'KM', request_bucket: 'T1', requested_qty: 100, approved_qty: 100 },
    { request_order_line_id: 'ROL-2', request_order_id: 'RO-1', sku: 'GA0451', company: 'ResUS', request_bucket: 'T2', requested_qty: 50, approved_qty: 40 },
    { request_order_line_id: 'ROL-3', request_order_id: 'RO-2', sku: 'GA0450', company: 'ResTW', request_bucket: 'T3', requested_qty: 200, approved_qty: 0 }
  ],
  request_order_line_sources: [{ request_order_line_id: 'ROL-1', sku: 'GA0450', company: 'KM', requested_qty: 100, approved_qty: 100 }],
  warehouses: [{ warehouse_id: 'WH-A', warehouse_name: 'Factory A', is_factory_warehouse: true, is_active: true, company: 'KM' }],
  sku_details: [{ sku: 'GA0450', product_name: 'Opener', units_per_carton: 24, category: 'Kitchen', series: 'GA' }, { sku: 'GA0451', units_per_carton: 12 }],
  supplier_price_list: [{ supplier_id: 'S1', supplier_name: 'Acme', sku: 'GA0450', is_active: true, unit_cost: 3.5, currency: 'USD' }]
};
var vm = roWorkspaceBuild_(tables, { page: { number: 1, size: 2000 } });
var byId = {}; vm.requestOrders.forEach(function (o) { byId[o.requestOrderId] = o; });
eq(byId['RO-1'].totalRequested, 150, 'RO-1 requested = 100+50'); eq(byId['RO-1'].totalApproved, 140, 'RO-1 approved = 100+40');
eq(byId['RO-1'].lineCount, 2, 'RO-1 lineCount = 2');
eq(byId['RO-1'].status, 'draft', 'RO-1 status = request_status'); eq(byId['RO-3'].status, 'approved', 'RO-3 status falls back to legacy `status`');
ok(byId['RO-1'].company === 'KM' && byId['RO-2'].company === 'ResTW' && byId['RO-3'].company === 'ResUS', 'company passed through verbatim (KM/ResTW/ResUS)');
ok(byId['RO-1'].raw && byId['RO-1'].raw.request_order_id === 'RO-1', 'order carries raw passthrough (adapter reproduces canonical fields)');
// details carry per-line raw passthrough + canonical request_bucket/company (verbatim, never recomputed)
var det = vm.detailsByRequestOrderId['RO-1'];
ok(det.lines.length === 2 && det.lines[0].raw && det.lines[0].raw.request_order_line_id === 'ROL-1', 'detail lines carry raw passthrough');
eq(det.lines[1].requestBucket, 'T2', 'detail line request_bucket passed through verbatim');
eq(det.lines[1].company, 'ResUS', 'detail line company passed through verbatim');
// summary + master passthrough subsets (adapter re-normalizes these → BEFORE == AFTER)
eq(vm.summary.totalRequestOrders, 3, 'summary RO count');
eq(vm.summary.byStatus.draft, 1, 'summary byStatus draft = 1');
ok(vm.lineSources.length === 1 && vm.warehouses.length === 1 && vm.skuDetails.length === 2 && vm.supplierPriceList.length === 1, 'raw master subsets returned for the adapter (line sources/warehouses/sku/supplier)');

console.log('\n== filter / sort / pagination ==');
eq(roWorkspaceBuild_(tables, { filters: { company: 'KM' } }).requestOrders.map(function (o) { return o.requestOrderId; }), ['RO-1'], 'filter by company');
eq(roWorkspaceBuild_(tables, { filters: { status: 'pending_approval' } }).requestOrders.map(function (o) { return o.requestOrderId; }), ['RO-2'], 'filter by status');
eq(roWorkspaceBuild_(tables, { search: 'REQ-0002' }).requestOrders.map(function (o) { return o.requestOrderId; }), ['RO-2'], 'search by request_order_no');
var asc = roWorkspaceBuild_(tables, { sort: [{ field: 'created_at', direction: 'asc' }] }).requestOrders.map(function (o) { return o.requestOrderId; });
eq(asc, ['RO-3', 'RO-1', 'RO-2'], 'sort by created_at asc');
var pg = roWorkspaceBuild_(tables, { page: { number: 1, size: 2 } });
eq(pg.pagination.totalItems, 3, 'pagination totalItems = 3'); eq(pg.requestOrders.length, 2, 'page size 2 → 2 items');
var empty = roWorkspaceBuild_({ request_orders: [], request_order_lines: [] }, {});
eq(empty.requestOrders.length, 0, 'empty result → 0 orders'); eq(empty.summary.totalRequestOrders, 0, 'empty summary 0');
// missing optional request_order_line_sources in the build input → [] (never a throw at the pure layer)
eq(empty.lineSources, [], 'missing request_order_line_sources → [] (optional)');
var threw = false; try { roWorkspaceBuild_(tables, { sort: [{ field: 'evil', direction: 'asc' }] }); } catch (e) { threw = (e.validationCode === 'VALIDATION_FAILED'); }
ok(threw, 'invalid sort field → VALIDATION_FAILED (fail closed)');

console.log('\n== io: optional line_sources missing-safe; provisioned tables fail-closed ==');
var io = roWorkspaceDefaultIo_();
eq(io.readTable({ getSheetByName: function () { return null; } }, 'request_order_line_sources', [], true), [], 'io: optional table absent → [] (no SCHEMA_NOT_PROVISIONED throw)');
var specs = {}; RO_WORKSPACE_TABLES_.forEach(function (s) { specs[s.name] = s; });
ok(specs['request_order_line_sources'].optional === true, 'request_order_line_sources is OPTIONAL (write path documented PENDING)');
ok(!specs['request_orders'].optional && !specs['request_order_lines'].optional && !specs['warehouses'].optional && !specs['sku_details'].optional && !specs['supplier_price_list'].optional, 'provisioned tables stay fail-closed (not optional)');

console.log('\n== end-to-end orchestrator via injected io (envelope + scope) ==');
var eio = { now: function () { return 0; }, nextSeq: function () { return 7; }, openTarget: function () { return {}; },
  readTable: function (ss, name) { return tables[name] || []; } };
var envE = handleRequestOrderWorkspaceGet_({ payload: { page: { number: 1, size: 2000 } } }, eio);
ok(envE.success === true && envE.meta.workspace === 'requestOrder' && envE.meta.action === 'requestOrder.workspace.get', 'orchestrator returns success envelope for the requestOrder workspace');
eq(envE.data.summary.totalRequestOrders, 3, 'orchestrator VM summary reachable through the envelope');
ok(envE.meta.tablesRead === 6, 'orchestrator reads exactly the 6 scoped tables');

console.log('\n== §1/§5/§12/§13 no second engine — source guards ==');
var code51 = GS51.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code51), '51_ never calls getOperationDb (scoped table reads only)');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code51), '51_ writes nothing (read-only)');
ok(!/generateRecommendation|runMonthlyOrderRecommendation|requestOrderDraft\.(job|generateFromGap)|forecastEngine|slaFifoCompare_|createPurchaseOrder|createRequestOrder/.test(code51),
  '51_ runs NO Recommendation/Forecast/draft-generation/FIFO/RO-creation/PO-creation (transport-only)');
ok(!/order_planning_gap|inventory_replenishment_gap|fc_regular_forecast|shipment_line_allocations|factory_stock/.test(code51),
  '51_ reads NO Gap/Forecast/shipment/factory-stock table (composes persisted request_orders only)');
ok(/requested_qty/.test(GS51) && /approved_qty/.test(GS51) && /request_bucket/.test(GS51), 'requested_qty/approved_qty/request_bucket present (passed through, not recomputed)');
var roTables = slice(GS51, 'var RO_WORKSPACE_TABLES_', 'var RO_WS_SORT_FIELDS_');
ok(/request_orders/.test(roTables) && /request_order_lines/.test(roTables) && /request_order_line_sources/.test(roTables) &&
   /warehouses/.test(roTables) && /sku_details/.test(roTables) && /supplier_price_list/.test(roTables), '51_ table scope = the 6 RO/master tables');

console.log('\n== activation + router ==');
ok(/WORKSPACE_CANONICAL = \{[^}]*requestOrder: true/.test(FND), 'requestOrder is CANONICAL');
ok(/WORKSPACE_ENABLED_DEFAULT = \{[^}]*requestOrder: true/.test(FND), 'requestOrder per-workspace flag defaults ON');
ok(/register\('requestOrder', \{[^}]*status: WORKSPACE_STATUS\.IMPLEMENTED, resolver: requestOrderResolver/.test(FND), 'requestOrder registered IMPLEMENTED with resolver');
ok(/buildRequestOrderRequestDTO/.test(FND) && /action: 'requestOrder\.workspace\.get'/.test(FND), 'requestOrder request DTO builds the workspace action');
ok(/action === 'requestOrder\.workspace\.get'/.test(ROUTER) && /handleRequestOrderWorkspaceGet_\(body\)/.test(ROUTER), 'router dispatches requestOrder.workspace.get');

console.log('\n== db-api adapter reuses canonical normalizers + master normalizers (BEFORE == AFTER) ==');
ok(/KM\.DB\.normalizeRequestOrder =/.test(DBAPI) && /KM\.DB\.normalizeRequestOrderLine =/.test(DBAPI), 'RO normalizers exposed');
var adapter = slice(DBAPI, 'KM.DB.adaptRequestOrderWorkspace = function', 'window.KM.DB.getRequestOrderAllocationDrafts');
ok(/normalizeRequestOrderRecord\(\(o && o\.raw\)/.test(adapter) && /normalizeRequestOrderLineRecord\(\(l && l\.raw\)/.test(adapter), 'adapter maps DTO raw through the canonical RO normalizers');
ok(/normalizeRequestOrderLineSourceRecord/.test(adapter) && /normalizeWarehouseRecord/.test(adapter) && /normalizeSkuDetailsRecord/.test(adapter) && /normalizeSupplierPriceListRecord/.test(adapter),
  'adapter re-normalizes the master subsets with the SAME normalizers the legacy getters use');
ok(/r\.requestOrderId;/.test(adapter) && /r\.warehouseId \|\| r\.warehouseName/.test(adapter) && /return r\.sku;/.test(adapter),
  'adapter applies the SAME per-array filters as normalizeOperationDb (arrays equal the legacy getters)');

console.log('\n== page: workspace primary read, no broad DB, fail-closed, read-model accessors ==');
ok(/workspaceApiActive\('requestOrder'\)/.test(PAGE), 'page gates on canonical requestOrder workspace');
ok(/getWorkspace\('requestOrder'/.test(PAGE), 'page primary read via scoped workspace');
ok(/adaptRequestOrderWorkspace/.test(PAGE), 'page adapts the workspace DTO');
var refresh = slice(PAGE, 'function _roRefresh_', 'function _roRenderError_');
ok(/_roEffectiveWorkspace\(\)/.test(refresh), 'refresh branches on workspace mode');
var wsBranch = refresh.slice(0, refresh.indexOf('Legacy'));
ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(wsBranch), 'Workspace read branch has NO getOperationDb/loadOperationDb/_opDbCache');
ok(/WORKSPACE_UNAVAILABLE|WORKSPACE_ERROR|RO_READ_FAILED/.test(refresh), 'fail-closed error (no silent legacy fallback)');
ok(/loadAndRender[\s\S]{0,400}_roRefresh_\(\)/.test(PAGE), 'loadAndRender delegates to the scoped _roRefresh_ (primary + post-write)');
// primary render + create-modal masters source from the read-model when canonical
ok(/var orders = _roGetOrders\(\)/.test(PAGE) && /var lines = _roGetLines\(\)/.test(PAGE), 'renderFromDb sources orders/lines from the read-model accessors');
ok(/function _roActiveWarehouses\(\) \{ return _roGetWarehousesArr\(\)/.test(PAGE) && /function _roSkuMaster\(\) \{ return _roGetSkuMaster\(\)/.test(PAGE) && /function _roSupplierPriceList\(\) \{ return _roGetSupplierPriceListArr\(\)/.test(PAGE),
  'create-modal masters source from the read-model accessors (modal never needs a broad DB load)');
ok(/function _roGetLineSources\(\) \{ return _roReadModel \? _roReadModel\.lineSources/.test(PAGE), 'allocation-popup line sources source from the read-model');
// KM.loadState region (no new loading framework)
ok(/KM\.loadState\.bindElement/.test(PAGE) && /KM\.loadState\.STATES\.(READY|EMPTY|ERROR)/.test(PAGE), 'page reuses KM.loadState region (INITIAL_LOADING/READY/EMPTY/ERROR)');
// no forbidden business math introduced (transport only) — no client Gap/Forecast/Recommendation/FIFO
ok(!/forecastEngine|slaFifoCompare_|generateShipmentLineAllocations|runMonthlyOrderRecommendation/.test(PAGE), 'no frontend Gap/Forecast/Recommendation/FIFO reconstruction in the Draft page');
// writes unchanged (authority + payload): still the SAME KM.DB.* write methods, no workspace write command
ok(/KM\.DB\.updateRequestOrderLineQty/.test(PAGE) && /KM\.DB\.updateRequestOrderStatus/.test(PAGE) && /KM\.DB\.createPurchaseOrderFromRequest/.test(PAGE) && PAGE.indexOf('KM.api.executeCommand') < 0,
  'writes unchanged (KM.DB.* authority; no KM.api workspace write)');

console.log('\n== §11/§12 user-edit protection + Monthly Recommendation chain untouched (request-order.js deferred) ==');
var ROJS = read('js/pages/request-order.js');
ok(/requestOrderDraft\.job\.start/.test(ROJS) && /_opMatCache/.test(ROJS), 'request-order.js (AI-Plan/scheduled draft consumer) retains its scoped gap/draft path — NOT migrated this round');

console.log('\n----------------------------------------');
console.log('API REQUEST ORDER WORKSPACE (F1-7D-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
