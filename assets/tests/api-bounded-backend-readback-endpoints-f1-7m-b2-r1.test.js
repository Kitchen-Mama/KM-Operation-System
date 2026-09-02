// Kitchen Mama Operation System — F1-7M-B2-BOUNDED-BACKEND-READBACK-ENDPOINTS-R1
// Proves the additive exact-id filters + frontend bounded readbacks, with BEFORE==AFTER parity:
//   B2-3 PO: optional filters.purchaseOrderId — absent → identical order set; present → only that PO; reference tables
//       (warehouses/sku_details) never filtered by PO id. Frontend confirmEdit merges ONE fresh PO in place (status-
//       invariant), retaining other orders + masters; other commands stay on the full readback.
//   B2-1 Shipment: optional filters.shipmentId — absent → identical; present → only that shipment, routes/events scoped
//       to it; reference (locations/templates/nodes) unscoped. Map merges ONE shipment's 4 arrays, retaining static ref.
//   IR = HALT (BOUNDED_READ_REQUIRES_SCHEMA_CHANGE + NOT_EQUIVALENT) — its post-write readback is UNCHANGED.
// Server stays authoritative (no optimistic patch); filter-absent byte-identical; stale-response guarded.
// Run: node assets/tests/api-bounded-backend-readback-endpoints-f1-7m-b2-r1.test.js
// NOTE: no 'use strict' — extracted source slices are eval'd into module scope.

var fs = require('fs'), path = require('path');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
function extractFn(src, name) {
  var sig = 'function ' + name + '('; var i = src.indexOf(sig); if (i < 0) throw new Error('fn not found: ' + name);
  var start = i, depth = 0, started = false;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') { depth++; started = true; } else if (ch === '}') { depth--; if (started && depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced fn: ' + name);
}

var PO_GS = read('specs/active/apps-script/50_api_v1_purchase_order_workspace.gs');
var SH_GS = read('specs/active/apps-script/57_api_v1_shipment_workspace.gs');
var PO_JS = read('js/pages/purchase-order-overview.js');
var GLM_JS = read('js/pages/global-logistics-map.js');
var IR_JS = read('js/pages/inventory-replenishment.js');

// ===================================================================================================================
console.log('\n== B2-3 PO backend: purchaseOrderId filter — absent parity + exact-present + reference not filtered ==');
function poWsStr_(v) { return (v == null) ? '' : String(v).trim(); }
eval(extractFn(PO_GS, 'poNormalizeFilters_'));
eval(extractFn(PO_GS, 'poFilterOrders_'));
var poOrders = [
  { purchaseOrderId: 'PO1', poNo: 'A', company: 'KM', supplierName: 's', requestOrderId: 'RO1' },
  { purchaseOrderId: 'PO2', poNo: 'B', company: 'KM', supplierName: 's', requestOrderId: 'RO1' },
  { purchaseOrderId: 'PO3', poNo: 'C', company: 'RES', supplierName: 's', requestOrderId: 'RO2' }
];
var poAbsent = poNormalizeFilters_({}, '');
eq(poAbsent.purchaseOrderId, null, 'PO: filter-absent → purchaseOrderId normalizes to null (clause inert)');
eq(poFilterOrders_(poOrders, poAbsent).map(function (o) { return o.purchaseOrderId; }), ['PO1', 'PO2', 'PO3'], 'PO: filter-absent → ALL orders (byte-identical set — backward compatible)');
var poOne = poNormalizeFilters_({ purchaseOrderId: 'PO2' }, '');
eq(poFilterOrders_(poOrders, poOne).map(function (o) { return o.purchaseOrderId; }), ['PO2'], 'PO: purchaseOrderId=PO2 → ONLY PO2 (exact)');
// BEFORE==AFTER: bounded result == the PO selected from the full set.
var poFullSelected = poFilterOrders_(poOrders, poAbsent).filter(function (o) { return o.purchaseOrderId === 'PO2'; });
eq(poFilterOrders_(poOrders, poOne), poFullSelected, 'PO: bounded(PO2) === full-then-select(PO2) (parity)');
eq(poFilterOrders_(poOrders, poNormalizeFilters_({ purchaseOrderId: 'NOPE' }, '')), [], 'PO: unknown id → bounded EMPTY (never the full list)');
// reference tables are emitted from their own arrays in poWorkspaceBuild_ — never routed through poFilterOrders_.
ok(/warehouses: warehouses\.map\(/.test(PO_GS) && /skuDetails: skuDetails\.map\(/.test(PO_GS), 'PO: warehouses/skuDetails emitted from their OWN arrays (structurally unfilterable by PO id)');
ok(/poBuildFilterOptions_\(mappedAll\)/.test(PO_GS), 'PO: filterOptions still derived from ALL orders (option universe intact)');

// ===================================================================================================================
console.log('\n== B2-1 Shipment backend: shipmentId filter — absent parity + exact-present + routes/events scoping ==');
function shipWsStr_(v) { return (v == null) ? '' : String(v).trim(); }
eval(extractFn(SH_GS, 'shipNormalizeFilters_'));
eval(extractFn(SH_GS, 'shipFilterShipments_'));
var ships = [
  { shipmentId: 'S1', shipmentNo: 'N1', trackingNumber: '', containerNo: '', company: 'KM' },
  { shipmentId: 'S2', shipmentNo: 'N2', trackingNumber: '', containerNo: '', company: 'KM' }
];
var shAbsent = shipNormalizeFilters_({}, '');
eq(shAbsent.shipmentId, null, 'Shipment: filter-absent → shipmentId null (clause inert)');
eq(shipFilterShipments_(ships, shAbsent).map(function (s) { return s.shipmentId; }), ['S1', 'S2'], 'Shipment: filter-absent → ALL shipments (byte-identical)');
eq(shipFilterShipments_(ships, shipNormalizeFilters_({ shipmentId: 'S2' }, '')).map(function (s) { return s.shipmentId; }), ['S2'], 'Shipment: shipmentId=S2 → ONLY S2 (exact)');
eq(shipFilterShipments_(ships, shipNormalizeFilters_({ shipmentId: 'X' }, '')), [], 'Shipment: unknown id → bounded EMPTY (never full list)');
// routes/events are scoped to the filtered shipment's id ONLY when the filter is present; else full tables (unchanged).
ok(/out\.shipmentRoutes = f\.shipmentId \?[\s\S]*?pageIds\[shipWsStr_\(r\.shipment_id\)\][\s\S]*?: \(tables\.shipment_routes \|\| \[\]\);/.test(SH_GS), 'Shipment: routes scoped to the shipment id when filtered; full table when absent');
ok(/out\.shipmentEvents = f\.shipmentId \?[\s\S]*?pageIds\[shipWsStr_\(r\.shipment_id\)\][\s\S]*?: \(tables\.shipment_events \|\| \[\]\);/.test(SH_GS), 'Shipment: events scoped to the shipment id when filtered; full table when absent');
ok(/if \(include\.locations\) out\.logisticsLocations = tables\.logistics_locations \|\| \[\];/.test(SH_GS), 'Shipment: logistics_locations (no shipment_id) stays REFERENCE (never scoped by shipment id)');

// ===================================================================================================================
console.log('\n== PO frontend: confirmEdit bounded merge — ONE fresh PO in place, others + masters retained ==');
ok(/updatePurchaseOrderHeader\(payload\)[\s\S]{0,600}_poEndCmd\(key, btn\); closeModal\(\); _poBoundedReadback_\(id\);/.test(PO_JS), 'PO: confirmEdit success → bounded readback (not full loadAndRender)');
// F1-7N-FB-2: the include object gained `documents: true` (a BOUNDED registry include). The property under
// test is unchanged - the readback is still scoped to ONE purchaseOrderId and still skips summary/filterOptions.
ok(/getWorkspace\('purchaseOrder', \{ filters: \{ purchaseOrderId: id \}, include: \{ summary: false, filterOptions: false[^}]*\} \}\)/.test(PO_JS), 'PO: bounded readback requests filters.purchaseOrderId + skips summary/filterOptions');
ok(/if \(mySeq !== _poReadSeq\) return;/.test(PO_JS.slice(PO_JS.indexOf('function _poBoundedReadback_'))), 'PO: bounded readback is _poReadSeq stale-guarded');
ok(/else \{\s*loadAndRender\(\);/.test(PO_JS.slice(PO_JS.indexOf('function _poBoundedReadback_'), PO_JS.indexOf('function _poMergeOnePo_'))), 'PO: bounded miss/failure degrades to the full loadAndRender readback (fresh, not stale)');
// sendPo/receive/cancel stay on the full readback (section-move / removal → not single-PO reconcilable).
// Window widened for F1-7N-FB-1B: Send PO now inspects the document-generation result before refreshing, so
// more source sits between the transition and the readback. The PROPERTY is unchanged — sendPo/cancel still use
// the FULL loadAndRender readback and never the bounded single-PO one.
ok(/transition: 'issue'[\s\S]{0,1400}loadAndRender\(\);/.test(PO_JS) && /transition: 'cancel'[\s\S]{0,140}loadAndRender\(\);/.test(PO_JS), 'PO: sendPo/cancel keep the full readback (deferred — section-move/removal)');
ok(!/transition: 'issue'[\s\S]{0,1400}_poBoundedReadback_/.test(PO_JS), 'PO: and Send PO never uses the bounded single-PO readback');
// Behavioral merge:
(function () {
  var _poReadModel;
  eval(extractFn(PO_JS, '_poMergeOnePo_'));
  _poReadModel = {
    orders: [{ purchaseOrderId: 'PO1', note: 'old' }, { purchaseOrderId: 'PO2', note: 'keep' }],
    lines: [{ purchaseOrderId: 'PO1', sku: 'A', qty: 1 }, { purchaseOrderId: 'PO2', sku: 'Z', qty: 9 }],
    skuDetails: [{ sku: 'A' }], warehouses: [{ warehouseId: 'W' }]
  };
  var bounded = { orders: [{ purchaseOrderId: 'PO1', note: 'NEW' }], lines: [{ purchaseOrderId: 'PO1', sku: 'A', qty: 5 }], skuDetails: [], warehouses: [] };
  var okMerge = _poMergeOnePo_('PO1', bounded);
  ok(okMerge === true, 'PO merge: returns true when the bounded read contained the PO');
  eq(_poReadModel.orders.filter(function (o) { return o.purchaseOrderId === 'PO1'; })[0].note, 'NEW', 'PO merge: PO1 replaced with the fresh server value');
  eq(_poReadModel.orders.filter(function (o) { return o.purchaseOrderId === 'PO2'; })[0].note, 'keep', 'PO merge: PO2 (untouched) retained');
  eq(_poReadModel.orders.length, 2, 'PO merge: order count preserved (no dup/loss)');
  eq(_poReadModel.lines.filter(function (l) { return l.purchaseOrderId === 'PO1'; }), [{ purchaseOrderId: 'PO1', sku: 'A', qty: 5 }], 'PO merge: PO1 lines replaced by server lines');
  eq(_poReadModel.lines.filter(function (l) { return l.purchaseOrderId === 'PO2'; }), [{ purchaseOrderId: 'PO2', sku: 'Z', qty: 9 }], 'PO merge: PO2 lines retained');
  eq(_poReadModel.skuDetails, [{ sku: 'A' }], 'PO merge: reference masters (skuDetails) retained (not clobbered by bounded [])');
  ok(_poMergeOnePo_('NOPE', bounded) === false, 'PO merge: returns false when the PO is absent (→ caller degrades to full)');
})();

// ===================================================================================================================
console.log('\n== Shipment frontend (map): bounded merge — ONE shipment 4 arrays, static reference retained ==');
ok(/_glmBoundedReadback_\(shipmentId, _rebuild\)/.test(GLM_JS), 'Map: afterShipmentWrite → bounded readback when a model is held');
ok(/getWorkspace\('shipment', \{ filters: \{ shipmentId: shipmentId \}, include: \{ routes: true, events: true \} \}\)/.test(GLM_JS), 'Map: bounded readback requests filters.shipmentId + routes/events (NOT locations/templates — retained)');
ok(/if \(mySeq !== _glmReadSeq\) return;/.test(GLM_JS.slice(GLM_JS.indexOf('function _glmBoundedReadback_'))), 'Map: bounded readback is _glmReadSeq stale-guarded');
ok(/ensureDb\(true, function \(ok\)/.test(GLM_JS.slice(GLM_JS.indexOf('function _glmBoundedReadback_'), GLM_JS.indexOf('function _glmMergeShipment_'))), 'Map: bounded miss/failure degrades to full ensureDb (fresh, not stale)');
(function () {
  var _glmReadModel;
  eval(extractFn(GLM_JS, '_glmMergeShipment_'));
  _glmReadModel = {
    shipments: [{ shipmentId: 'S1', status: 'old' }, { shipmentId: 'S2', status: 'keep' }],
    shipmentLines: [{ shipmentId: 'S1', q: 1 }, { shipmentId: 'S2', q: 2 }],
    shipmentRoutes: [{ shipmentId: 'S1', seq: 1 }, { shipmentId: 'S2', seq: 1 }],
    shipmentEvents: [{ shipmentId: 'S1', e: 'x' }],
    logisticsLocations: [{ logisticsLocationId: 'L1' }], shipmentRouteTemplates: [{ routeTemplateId: 'T1' }],
    shipmentRouteTemplateNodes: [{ routeTemplateNodeId: 'N1' }], warehouses: [{ warehouseId: 'W1' }]
  };
  var mini = {
    shipments: [{ shipmentId: 'S1', status: 'NEW' }],
    shipmentLines: [{ shipmentId: 'S1', q: 5 }],
    shipmentRoutes: [{ shipmentId: 'S1', seq: 1 }, { shipmentId: 'S1', seq: 2 }],   // a node advanced (grew)
    shipmentEvents: [{ shipmentId: 'S1', e: 'x' }, { shipmentId: 'S1', e: 'y' }],   // an event added
    logisticsLocations: [], shipmentRouteTemplates: [], shipmentRouteTemplateNodes: [], warehouses: []
  };
  var okMerge = _glmMergeShipment_('S1', mini);
  ok(okMerge === true, 'Map merge: returns true when the bounded read contained the shipment');
  eq(_glmReadModel.shipments.filter(function (s) { return s.shipmentId === 'S1'; })[0].status, 'NEW', 'Map merge: S1 replaced with the fresh server row');
  eq(_glmReadModel.shipments.filter(function (s) { return s.shipmentId === 'S2'; })[0].status, 'keep', 'Map merge: S2 retained');
  eq(_glmReadModel.shipmentLines.filter(function (l) { return l.shipmentId === 'S1'; }), [{ shipmentId: 'S1', q: 5 }], 'Map merge: S1 lines replaced');
  eq(_glmReadModel.shipmentLines.filter(function (l) { return l.shipmentId === 'S2'; }), [{ shipmentId: 'S2', q: 2 }], 'Map merge: S2 lines retained');
  eq(_glmReadModel.shipmentRoutes.filter(function (r) { return r.shipmentId === 'S1'; }).length, 2, 'Map merge: S1 routes replaced (grew to 2 — old removed first, no lingering)');
  eq(_glmReadModel.shipmentEvents.filter(function (e) { return e.shipmentId === 'S1'; }).length, 2, 'Map merge: S1 events replaced (added event present)');
  eq(_glmReadModel.logisticsLocations, [{ logisticsLocationId: 'L1' }], 'Map merge: static logistics_locations RETAINED (not clobbered by bounded [])');
  eq(_glmReadModel.shipmentRouteTemplateNodes, [{ routeTemplateNodeId: 'N1' }], 'Map merge: static route-template nodes RETAINED');
  ok(_glmMergeShipment_('GONE', mini) === false, 'Map merge: returns false when the shipment is absent (→ caller degrades to full)');
})();

// ===================================================================================================================
console.log('\n== IR HALT + safety invariants ==');
// F1-7N-FB-4G-A1-R1 — RESTATED for the same reason as 7M-B's B3: the getWorkspace call site is parameterised
// now, so the literal `{}` is gone from the source while the POST-WRITE path it describes is untouched.
ok(/function _irAfterWrite\(cb\)[\s\S]{0,400}_irWorkspaceRefresh_\(\)/.test(IR_JS) &&
   !/function _irAfterWrite\(cb\)[\s\S]{0,400}carrier:\s*true/.test(IR_JS),
  'IR: post-write readback UNCHANGED (full workspace, no include) — HALT (schema-change / not-equivalent)');
ok(GLM_JS.indexOf('loadOperationDb') !== -1 ? /Legacy/.test(GLM_JS) : true, 'map: no new whole-DB load introduced (bounded readback is a scoped getWorkspace)');
ok(read('js/app.js').indexOf('loadOperationDb') === -1, 'app prime remains 0');
eq((read('js/api/operation-system-db-api.js').split('await loadOperationDb({ force: true });').length - 1), 2, 'writer full-reload remains 0');
// no optimistic patch: both merges consume SERVER-adapted data, never client-fabricated facts.
ok(/adaptPurchaseOrderWorkspace\(env\.data\)/.test(PO_JS) && /adaptShipmentWorkspace\(env\.data\)/.test(GLM_JS), 'both bounded merges use SERVER-returned data (no optimistic business patch)');

console.log('\n' + (fail ? ('✗ ' + fail + ' FAILED, ') : '✓ ') + pass + ' passed');
if (fail) process.exitCode = 1;
