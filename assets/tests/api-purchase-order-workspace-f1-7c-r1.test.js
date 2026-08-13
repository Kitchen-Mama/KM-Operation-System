// Kitchen Mama Operation System — F1-7C-PO-WORKSPACE-AND-CUTOVER-R1
// Proves the scoped Purchase Order workspace + page cutover WITHOUT changing business output:
//   - backend 50_ DTO owns remaining_qty = max(0, completed - shipped) (persisted, else the SAME projection);
//     shipped/completed/ordered passed through verbatim (no FIFO, no shipment recompute, no getOperationDb);
//   - purchaseOrder activated as a CANONICAL workspace; router dispatch present;
//   - PO pages source their read-model from the workspace (no getOperationDb/loadOperationDb/_opDbCache in the
//     primary render path), fail-closed on error, and consume the backend remaining_qty (no client derivation);
//   - PO→Shipment/FIFO/factory-stock contracts untouched (source guards).
// Run: node assets/tests/api-purchase-order-workspace-f1-7c-r1.test.js
// NOTE: no 'use strict' — extracted pure builders are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function slice(src, a, b) { var i = src.indexOf(a), j = src.indexOf(b); return src.slice(i, j); }

var GS50 = read('specs/active/apps-script/50_api_v1_purchase_order_workspace.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var FND = read('js/api/km-api-foundation.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var OV = read('js/pages/purchase-order-overview.js');
var LIST = read('js/pages/purchase-order-list.js');

// eval the PURE builder block of 50_ (constants + pure functions; the impure io orchestrator is excluded)
eval(slice(GS50, 'var PO_WS_SEQ_', '// ----------------------------------------------------------------------------------------------------\n// IMPURE'));

// ---- §4/§9 remaining_qty is BACKEND-OWNED ----
console.log('\n== remaining_qty = max(0, completed - shipped) (persisted preferred) ==');
eq(poLineRemaining_({ completed_qty: 300, shipped_qty: 0, remaining_qty: 300 }), 300, 'persisted remaining used');
eq(poLineRemaining_({ completed_qty: 400, shipped_qty: 100, remaining_qty: '' }), 300, 'blank persisted → max(0, 400-100)=300');
eq(poLineRemaining_({ completed_qty: 100, shipped_qty: 250, remaining_qty: '' }), 0, 'clamp ≥ 0 (100-250 → 0)');
eq(poLineRemaining_({ completed_qty: 0, shipped_qty: 0 }), 0, 'zeros → 0');
// the SAME formula the legacy client fallback used → BEFORE == AFTER for the displayed value
function legacyRem(l) { return (l.remaining_qty === '' || l.remaining_qty == null) ? Math.max(0, (+l.completed_qty || 0) - (+l.shipped_qty || 0)) : Math.max(0, +l.remaining_qty || 0); }
[{ completed_qty: 500, shipped_qty: 120, remaining_qty: '' }, { completed_qty: 500, shipped_qty: 120, remaining_qty: 380 }, { completed_qty: 50, shipped_qty: 90, remaining_qty: '' }].forEach(function (l, i) {
  eq(poLineRemaining_(l), legacyRem(l), 'DTO remaining == legacy client formula (case ' + i + ')');
});

// ---- backend build: rollups, join, filter, sort, pagination, passthrough ----
console.log('\n== poWorkspaceBuild_ View-Model ==');
var tables = {
  purchase_orders: [
    { purchase_order_id: 'PO-1', po_no: 'KM-PO-1', company: 'KM', factory_id: 'FAC-A', warehouse_id: 'WH-A', request_order_id: 'RO-1', request_bucket: 'T1', supplier_id: 'S1', currency: 'USD', order_status: 'in_production', order_date: '2026-08-10' },
    { purchase_order_id: 'PO-2', po_no: 'KM-PO-2', company: 'ResTW', factory_id: 'FAC-A', warehouse_id: 'WH-A', request_order_id: 'RO-1', request_bucket: 'T2_T3', supplier_id: 'S1', currency: 'USD', order_status: 'completed', order_date: '2026-08-11' }
  ],
  purchase_order_lines: [
    { purchase_order_line_id: 'POL-1', purchase_order_id: 'PO-1', sku: 'GA0450', ordered_qty: 500, completed_qty: 300, shipped_qty: 0, remaining_qty: 300 },
    { purchase_order_line_id: 'POL-2', purchase_order_id: 'PO-1', sku: 'GA0451', ordered_qty: 200, completed_qty: 200, shipped_qty: 50, remaining_qty: '' },   // → 150
    { purchase_order_line_id: 'POL-3', purchase_order_id: 'PO-2', sku: 'GA0450', ordered_qty: 400, completed_qty: 400, shipped_qty: 100, remaining_qty: 300 }
  ],
  warehouses: [{ warehouse_id: 'WH-A', warehouse_name: 'Factory A' }],
  sku_details: [{ sku: 'GA0450', category: 'Kitchen', series: 'GA' }, { sku: 'GA0451', category: 'Kitchen', series: 'GA' }]
};
var vm = poWorkspaceBuild_(tables, { page: { number: 1, size: 2000 } });
var byId = {}; vm.purchaseOrders.forEach(function (p) { byId[p.purchaseOrderId] = p; });
eq(byId['PO-1'].orderedQty, 700, 'PO-1 ordered = 500+200'); eq(byId['PO-1'].completedQty, 500, 'PO-1 completed = 300+200');
eq(byId['PO-1'].shippedQty, 50, 'PO-1 shipped = 0+50 (verbatim, not recomputed)');
eq(byId['PO-1'].remainingQty, 450, 'PO-1 remaining = 300 + max(0,200-50)=150 → 450 (backend-owned)');
eq(byId['PO-2'].remainingQty, 300, 'PO-2 remaining = persisted 300');
eq(byId['PO-1'].factoryName, 'Factory A', 'factory name joined from warehouses');
// shared factory KM/ResTW: same factory, distinct company (factory NEVER determines company)
ok(byId['PO-1'].company === 'KM' && byId['PO-2'].company === 'ResTW' && byId['PO-1'].factoryId === byId['PO-2'].factoryId, 'shared Factory A across KM/ResTW keeps distinct company');
// same RO producing two POs (lineage preserved)
ok(byId['PO-1'].requestOrderId === 'RO-1' && byId['PO-2'].requestOrderId === 'RO-1', 'same RO → two POs, request_order lineage preserved');
// details carry backend remaining + raw passthrough
var det = vm.detailsByPurchaseOrderId['PO-1'];
eq(det.lines[1].remainingQty, 150, 'detail line POL-2 remaining backend-owned (150)');
ok(det.lines[0].raw && det.lines[0].raw.purchase_order_line_id === 'POL-1', 'detail line carries raw passthrough (adapter reproduces canonical fields)');
ok(byId['PO-1'].raw && byId['PO-1'].raw.purchase_order_id === 'PO-1', 'order carries raw passthrough');
// summary + scoped subsets
eq(vm.summary.totalPurchaseOrders, 2, 'summary PO count');
eq(vm.summary.totalRemaining, 750, 'summary total remaining = 450 + 300');
ok(vm.skuDetails.length === 2 && vm.warehouses.length === 1, 'scoped sku/warehouse subsets returned (not whole masters)');

console.log('\n== filter / sort / pagination ==');
eq(poWorkspaceBuild_(tables, { filters: { company: 'KM' } }).purchaseOrders.length, 1, 'filter by company');
eq(poWorkspaceBuild_(tables, { filters: { requestBucket: 'T1' } }).purchaseOrders.map(function (p) { return p.purchaseOrderId; }), ['PO-1'], 'filter by request bucket (T1)');
eq(poWorkspaceBuild_(tables, { filters: { status: 'completed' } }).purchaseOrders.map(function (p) { return p.purchaseOrderId; }), ['PO-2'], 'filter by status');
var sorted = poWorkspaceBuild_(tables, { sort: [{ field: 'order_date', direction: 'asc' }] }).purchaseOrders;
eq(sorted.map(function (p) { return p.purchaseOrderId; }), ['PO-1', 'PO-2'], 'sort by order_date asc');
var pg = poWorkspaceBuild_(tables, { page: { number: 1, size: 1 } });
eq(pg.pagination.totalItems, 2, 'pagination totalItems = 2'); eq(pg.purchaseOrders.length, 1, 'page size 1 → 1 item');
var empty = poWorkspaceBuild_({ purchase_orders: [], purchase_order_lines: [], warehouses: [], sku_details: [] }, {});
eq(empty.purchaseOrders.length, 0, 'empty result → 0 orders'); eq(empty.summary.totalRemaining, 0, 'empty summary remaining 0');
var threw = false; try { poWorkspaceBuild_(tables, { sort: [{ field: 'evil', direction: 'asc' }] }); } catch (e) { threw = (e.validationCode === 'VALIDATION_FAILED'); }
ok(threw, 'invalid sort field → VALIDATION_FAILED (fail closed)');

console.log('\n== §13 PO→Shipment/FIFO/factory-stock contracts untouched (source guards) ==');
var code50 = GS50.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code50), '50_ never calls getOperationDb (scoped table reads only)');
ok(!/shipment_line_allocations|slaFifoCompare_|factory_stock|shipment_lines|\.setValue\(|appendRow|insertSheet/.test(code50), '50_ reads no shipment/FIFO/factory-stock table and writes nothing (read-only)');
ok(/shippedQty: poWsNum_\(r\.shipped_qty\)/.test(GS50), 'shipped_qty passed through verbatim (no reconciliation/recompute)');
ok(/purchase_orders|purchase_order_lines|warehouses|sku_details/.test(GS50) && !/'shipments'|'purchase_order_line/.test(code50.replace(/purchase_order_lines/g, 'x')), '50_ table scope = the 4 PO tables');

console.log('\n== activation + router ==');
ok(/WORKSPACE_CANONICAL = \{ recommendation: true, weeklyShipping: true, purchaseOrder: true \}/.test(FND), 'purchaseOrder is CANONICAL');
ok(/WORKSPACE_ENABLED_DEFAULT = \{ weeklyShipping: true,[^}]*purchaseOrder: true/.test(FND), 'purchaseOrder per-workspace flag defaults ON');
ok(/register\('purchaseOrder', \{[^}]*status: WORKSPACE_STATUS\.IMPLEMENTED, resolver: purchaseOrderResolver/.test(FND), 'purchaseOrder registered IMPLEMENTED with resolver');
ok(/action === 'purchaseOrder\.workspace\.get'/.test(ROUTER) && /handlePurchaseOrderWorkspaceGet_\(body\)/.test(ROUTER), 'router dispatches purchaseOrder.workspace.get');

console.log('\n== db-api adapter reuses canonical normalizers + backend remaining ==');
ok(/KM\.DB\.normalizePurchaseOrder =|KM\.DB\.normalizePurchaseOrderLine =/.test(DBAPI), 'PO normalizers exposed');
var adapter = slice(DBAPI, 'KM.DB.adaptPurchaseOrderWorkspace = function', 'window.KM.DB.getRequestOrderAllocationDrafts');
ok(/normalizePurchaseOrderRecord\(\(p && p\.raw\)/.test(adapter) && /normalizePurchaseOrderLineRecord\(\(l && l\.raw\)/.test(adapter), 'adapter maps DTO raw through the canonical normalizers (BEFORE == AFTER records)');
ok(/n\.remainingQty = parseFloat\(l\.remainingQty\)/.test(adapter), 'adapter overrides remainingQty from the backend DTO (backend-owned)');

console.log('\n== pages: workspace primary read, no broad DB, fail-closed, remaining backend-owned ==');
[['overview', OV], ['list', LIST]].forEach(function (pair) {
  var name = pair[0], src = pair[1];
  ok(/workspaceApiActive\('purchaseOrder'\)/.test(src), name + ': gates on canonical purchaseOrder workspace');
  ok(/getWorkspace\('purchaseOrder'/.test(src), name + ': primary read via scoped workspace');
  ok(/adaptPurchaseOrderWorkspace/.test(src), name + ': adapts the workspace DTO');
  var refresh = slice(src, 'function _po' + (name === 'list' ? 'l' : '') + 'Refresh_', 'function _po' + (name === 'list' ? 'l' : '') + 'RenderError_');
  ok(refresh.indexOf('_EffectiveWorkspace') !== -1 || /EffectiveWorkspace\(\)/.test(refresh), name + ': refresh branches on workspace mode');
  // the workspace branch (before the Legacy branch) contains NO broad-DB call
  var wsBranch = refresh.slice(0, refresh.indexOf('Legacy'));
  ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(wsBranch), name + ': Workspace read branch has NO getOperationDb/loadOperationDb/_opDbCache');
  ok(/WORKSPACE_UNAVAILABLE|WORKSPACE_ERROR|READ_FAILED/.test(refresh), name + ': fail-closed error (no silent legacy fallback)');
});
// list: remaining is backend-owned (no client derivation when workspace read-model is active)
ok(/_polReadModel \|\| \(l\.remainingQty/.test(LIST), 'list: remaining uses DTO value in Workspace mode (client max(0,…) fallback is Legacy-only)');
// buildModels sources switch to the read-model
ok(/_polReadModel \? _polReadModel\.orders/.test(LIST) && /_poReadModel \? _poReadModel\.orders/.test(OV), 'both pages source orders from the workspace read-model when canonical');
// no frontend FIFO / shipment reconstruction in either page path (transport only)
ok(!/generateShipmentLineAllocations|slaFifoCompare_/.test(OV) && !/generateShipmentLineAllocations|slaFifoCompare_/.test(LIST), 'no frontend FIFO/shipment-allocation reconstruction in PO pages');

console.log('\n----------------------------------------');
console.log('API PURCHASE ORDER WORKSPACE (F1-7C-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
