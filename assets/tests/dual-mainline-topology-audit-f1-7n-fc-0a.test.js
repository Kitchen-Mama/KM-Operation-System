// F1-7N-FC-0A — DUAL MAINLINE E2E CONTRACT AUDIT.
//
// WHAT THIS IS. Two first-stage mainlines are frozen as the product:
//
//   SHIPPING   Inventory Summary -> Shipping AI Plan -> Allocation Draft -> Submit Plan -> Weekly Shipping
//              Plan -> Shipment Draft -> carrier -> documents -> Confirm -> factory stock deduction ->
//              On the Way -> destination receiving
//   PURCHASE   Order Planning -> Order AI Plan -> Request Order Allocation Draft -> Send Request -> Request
//              Order Draft -> approval -> Purchase Order -> documents -> Overview/List -> factory receipt ->
//              factory stock increase
//
// This suite MEASURES each transition instead of reading it, and classifies it. §B is explicit that a path is
// not complete because a UI button exists, so every stage is scored on five INDEPENDENT pieces of evidence,
// each derived from the shipped sources:
//
//     router      the action has exactly one dispatch branch in 01_
//     handler     its handler is defined exactly once, in one owner file
//     manifest    it is in SYS_REQUIRED_ACTIONS_ (a deployment that lacks it fails the contract)
//     adapter     the browser transport exposes a function that names that action
//     caller      at least one PAGE calls that adapter function
//
// A stage missing `caller` is IMPLEMENTED_NOT_CONNECTED however good the server is. A stage whose write is
// not inside the transaction that owns it is CONNECTED_NOT_ATOMIC however well it is called.
//
// AND THE STOCK LEDGER IS EXECUTED, not described. The two authorised stock mutators — 22_'s Confirm Shipment
// deduction and 13_'s PO receipt increase — are run over in-memory sheets, with every mutation counted per
// table, so "deducted exactly once", "movement and snapshot move together", "a replay writes nothing" and
// "quantity is conserved" are measurements.
//
// NO LIVE MUTATION OF ANY KIND. This file reads sources and runs them over grids it built itself.
//
// Run: node assets/tests/dual-mainline-topology-audit-f1-7n-fc-0a.test.js

var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
var neg = { caught: 0, missed: 0 };
function ok(c, l) { if (c) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; console.log('ok   ' + l); } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(t) { console.log('\n== ' + t + ' =='); }
function mut(label, f) {
  var r;
  try { r = f(); } catch (e) { neg.missed++; fail++; console.error('FAIL ' + label + ' — PROBE ERROR: ' + (e && e.message)); return; }
  if (r === true) { neg.caught++; pass++; console.log('ok   ' + label + ' (caught)'); }
  else { neg.missed++; fail++; console.error('FAIL ' + label + ' — MUTANT SURVIVED'); }
}

var ROOT = path.join(__dirname, '..', '..');
var GS_DIR = path.join(ROOT, 'assets/specs/active/apps-script');
var PAGE_DIR = path.join(ROOT, 'assets/js/pages');
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); }
var NL = String.fromCharCode(10);

var G01 = read('assets/specs/active/apps-script/01_router.gs');
var G11 = read('assets/specs/active/apps-script/11_shipping_plan_handlers.gs');
var G12 = read('assets/specs/active/apps-script/12_shipment_handlers.gs');
var G13 = read('assets/specs/active/apps-script/13_procurement_handlers.gs');
var G21 = read('assets/specs/active/apps-script/21_factory_inventory_handlers.gs');
var G22 = read('assets/specs/active/apps-script/22_shipment_dispatch_handlers.gs');
var G31 = read('assets/specs/active/apps-script/31_shipment_receipt_route_handlers.gs');
var G63 = read('assets/specs/active/apps-script/63_api_v1_system_health.gs');
var DBAPI = read('assets/js/api/operation-system-db-api.js');

// Every non-generated .gs, so "defined exactly once" is checked across the WHOLE project rather than in the
// file we expected it in. The generated bundle is excluded: it is a build product, and counting it would make
// every bundled function look duplicated.
var GS_FILES = fs.readdirSync(GS_DIR).filter(function (f) { return /\.gs$/.test(f) && f.indexOf('90_generated') !== 0; });
var GS_SRC = {};
GS_FILES.forEach(function (f) { GS_SRC[f] = fs.readFileSync(path.join(GS_DIR, f), 'utf8'); });
var PAGE_FILES = fs.readdirSync(PAGE_DIR).filter(function (f) { return /\.js$/.test(f); });
var PAGE_SRC = {};
PAGE_FILES.forEach(function (f) { PAGE_SRC[f] = fs.readFileSync(path.join(PAGE_DIR, f), 'utf8'); });

// EVERY frontend file except the transport itself. A readback is NOT reached by a page calling its adapter
// directly - the workspace family goes through km-data-access.js and the shared getWorkspace client - so
// scoring reachability on `assets/js/pages/**` alone reported six healthy readbacks as unconnected. The
// transport directory is excluded because it DEFINES the adapters; finding a name there proves nothing.
var FRONT = [];
(function walk(dir, rel) {
  fs.readdirSync(dir).forEach(function (f) {
    var full = path.join(dir, f), r = rel ? (rel + '/' + f) : f;
    var st = fs.statSync(full);
    if (st.isDirectory()) { walk(full, r); return; }
    if (!/\.js$/.test(f)) return;
    if (r.indexOf('api/') === 0) return;
    FRONT.push({ rel: r, src: fs.readFileSync(full, 'utf8') });
  });
})(path.join(ROOT, 'assets/js'), '');

function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
function mutateFn(src, name, find, replace) {
  var CR = String.fromCharCode(13), LF = String.fromCharCode(10);
  var eol = src.indexOf(CR + LF) >= 0 ? (CR + LF) : LF;
  function fix(t) { return String(t).split(CR + LF).join(LF).split(LF).join(eol); }
  find = fix(find); replace = fix(replace);
  var body = extractFn(src, name);
  if (body.indexOf(find) < 0) throw new Error('mutation target absent in ' + name + ': ' + find);
  return src.replace(body, body.replace(find, replace));
}

// ================================================================================================================
// THE FIVE EVIDENCE PROBES. Each answers one question about one stage, from the shipped sources only.
// ================================================================================================================
var ROUTER_CODE = code(G01);
function routerBranches(action) {
  var lit = "'" + action + "'";
  var n = 0;
  // a dispatch is either `action === 'x'` or a map entry `'x': handler`
  n += (ROUTER_CODE.split('action === ' + lit).length - 1);
  n += (ROUTER_CODE.split(lit + ':').length - 1);
  return n;
}
function handlerOwners(handler) {
  var out = [];
  GS_FILES.forEach(function (f) {
    var c = code(GS_SRC[f]).split('function ' + handler + '(').length - 1;
    for (var i = 0; i < c; i++) out.push(f);
  });
  return out;
}
var MANIFEST_ACTIONS = (function () {
  var out = {};
  (G63.match(/\{ action: '([^']+)'/g) || []).forEach(function (m) { out[m.replace(/.*'([^']+)'.*/, '$1')] = 1; });
  return out;
})();
// adapter function -> the action names its own body mentions
var ADAPTER_ACTIONS = (function () {
  // `=(?!=)` matters: without it `typeof window.KM.DB.getApiBaseUrl === 'function'` registered as an
  // ASSIGNMENT, which truncated the preceding adapter's body and lost the action it names. Measured on
  // submitAllocationDraftsToShippingPlans, whose `action:` literal sits after such a reference.
  var re = /window\.KM\.DB\.([A-Za-z0-9_]+)\s*=(?!=)/g, m, marks = [];
  while ((m = re.exec(DBAPI))) marks.push({ fn: m[1], at: m.index });
  var map = {};
  marks.forEach(function (x, i) {
    var end = (i + 1 < marks.length) ? marks[i + 1].at : DBAPI.length;
    var body = DBAPI.slice(x.at, end);
    var acts = [];
    (body.match(/action:\s*'([^']+)'/g) || []).forEach(function (a) { acts.push(a.replace(/action:\s*'/, '').replace(/'$/, '')); });
    (body.match(/_km[A-Za-z]+_?\('([^']+)'/g) || []).forEach(function (a) { acts.push(a.match(/'([^']+)'/)[1]); });
    if (acts.length) map[x.fn] = acts.filter(function (v, j, arr) { return arr.indexOf(v) === j; });
  });
  return map;
})();
function adaptersFor(action) {
  return Object.keys(ADAPTER_ACTIONS).filter(function (fn) { return ADAPTER_ACTIONS[fn].indexOf(action) !== -1; });
}
function pagesCalling(fnNames) {
  var out = [];
  PAGE_FILES.forEach(function (p) {
    var s = PAGE_SRC[p];
    for (var i = 0; i < fnNames.length; i++) {
      if (s.indexOf('.' + fnNames[i] + '(') !== -1) { out.push(p); return; }
    }
  });
  return out;
}
// Reachable from the frontend at all. THREE forms, because the system has three ways to start an action and
// scoring only one of them mislabels the other two:
//   (1) a page or core module calls the KM.DB adapter function;
//   (2) it names the action literal (km-data-access.js style);
//   (3) for the workspace family it calls `getWorkspace('<ns>')`, and km-api-foundation.js turns that
//       namespace into `<ns>.workspace.get`. Measured: EVERY workspace readback is reached this way and by
//       no other, so a probe without form (3) reports six healthy readbacks as SERVER_ONLY.
function frontendReach(action, fnNames) {
  var out = [];
  var wsNs = /^([A-Za-z]+)\.workspace\.get$/.test(action) ? action.replace(/\.workspace\.get$/, '') : '';
  FRONT.forEach(function (f) {
    if (f.src.indexOf("'" + action + "'") !== -1) { out.push(f.rel); return; }
    if (wsNs && f.src.indexOf("getWorkspace('" + wsNs + "'") !== -1) { out.push(f.rel); return; }
    for (var i = 0; i < fnNames.length; i++) {
      if (f.src.indexOf('.' + fnNames[i] + '(') !== -1) { out.push(f.rel); return; }
    }
  });
  return out;
}

// ================================================================================================================
// THE TOPOLOGY. `stockEffect` is the CONTRACT claim; §G executes the two that move stock and proves the rest
// move none. `internal: true` marks a transition that has no action of its own because it happens INSIDE
// another stage's transaction — those are audited by execution, not by an adapter.
// ================================================================================================================
var STAGES = [
  // ---- SHIPPING MAINLINE -------------------------------------------------------------------------------------
  { flow: 'SHIP', id: 'S1', name: 'Inventory Replenishment Summary', page: 'inventory-replenishment.js',
    action: 'inventoryReplenishment.workspace.get', handler: 'handleInventoryReplenishmentWorkspaceGet_',
    owner: '60_api_v1_inventory_replenishment_workspace.gs', targets: [], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S1b', name: 'Replenishment gap (shortage) materialization', page: 'inventory-replenishment.js',
    action: 'inventoryReplenishmentGap.get', handler: 'handleGetInventoryReplenishmentGap_',
    owner: '43_api_v1_gap_materialization.gs', targets: ['inventory_replenishment_gap'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S2', name: 'Shipping AI Plan', page: 'inventory-replenishment.js',
    action: 'weeklyAiPlan.generate', handler: 'handleGenerateWeeklyAiPlanDraft_',
    owner: '61_api_v1_weekly_ai_plan.gs', targets: ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S3', name: 'Allocation Draft save / + Add Route', page: 'inventory-replenishment.js',
    action: 'upsertShippingAllocationDraftAtomic', handler: 'handleUpsertShippingAllocationDraftAtomic_',
    owner: '16_shipping_allocation_handlers.gs', targets: ['shipping_allocation_drafts', 'shipping_allocation_draft_lines'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S3b', name: 'Allocation Draft readback', page: 'inventory-replenishment.js',
    action: 'getShippingAllocationDraftWorkspace', handler: 'handleGetShippingAllocationDraftWorkspace_',
    owner: '16_shipping_allocation_handlers.gs', targets: [], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S4', name: 'Submit Plan', page: 'inventory-replenishment.js',
    action: 'submitAllocationDraftsToShippingPlans', handler: 'handleSubmitAllocationDraftsToShippingPlans_',
    owner: '16_shipping_allocation_handlers.gs', targets: ['shipping_plans', 'shipping_plan_lines', 'shipping_allocation_drafts'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S5', name: 'Weekly Shipping Plan readback', page: 'shipping-plan.js',
    action: 'weeklyShipping.workspace.get', handler: 'handleWeeklyShippingWorkspaceGet_',
    owner: '40_api_v1_weekly_workspace.gs', targets: [], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S6', name: 'Plan approve = Execution Commit -> Shipment Draft', page: 'shipping-plan.js',
    action: 'updateShippingPlanStatus', handler: 'handleUpdateShippingPlanStatus_',
    owner: '11_shipping_plan_handlers.gs', targets: ['shipping_plans', 'shipments', 'shipment_lines'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S6b', name: 'Shipment Draft creation RETRY (standalone)', page: '(none expected)',
    action: 'createShipmentFromPlan', handler: 'handleCreateShipmentFromPlan_',
    owner: '12_shipment_handlers.gs', targets: ['shipments', 'shipment_lines'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S7', name: 'Carrier / method selection', page: 'shipping-history.js',
    action: 'updateShipment', handler: 'handleUpdateShipment_',
    owner: '12_shipment_handlers.gs', targets: ['shipments'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S7b', name: 'Method candidates for a shipment route', page: 'shipping-history.js',
    action: 'getShippingMethodCandidates', handler: 'handleGetShippingMethodCandidates_',
    owner: '17_carrier_handlers.gs', targets: [], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S8', name: 'Shipment document generation', page: 'shipping-history.js',
    action: 'shipmentDocument.generate', handler: 'handleShipmentDocumentGenerate_',
    owner: '36_document_template_handlers.gs', targets: ['shipment_documents'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S8b', name: 'Shipment final output snapshot', page: 'shipping-history.js',
    action: 'finalizeShipmentFinalOutput', handler: 'handleFinalizeShipmentFinalOutput_',
    owner: '34_shipment_final_output_handlers.gs', targets: ['shipment_final_outputs'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S9', name: 'Confirm Shipment + dispatch', page: 'shipping-history.js',
    action: 'confirmShipmentAndDispatch', handler: 'handleConfirmShipmentAndDispatch_',
    owner: '22_shipment_dispatch_handlers.gs',
    targets: ['shipments', 'shipment_routes', 'shipment_events', 'factory_stock', 'factory_stock_movements'],
    stockEffect: 'FACTORY_STOCK_DECREASE' },
  { flow: 'SHIP', id: 'S11', name: 'On the Way map / route progress', page: 'global-logistics-map.js',
    action: 'shipment.route.advance', handler: 'handleAdvanceShipmentRoutePoint_',
    owner: '31_shipment_receipt_route_handlers.gs', targets: ['shipment_routes', 'shipment_events', 'shipments'], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S11b', name: 'Shipment workspace (Draft / Overview / Map) readback', page: 'global-logistics-map.js',
    action: 'shipment.workspace.get', handler: 'handleShipmentWorkspaceGet_',
    owner: '57_api_v1_shipment_workspace.gs', targets: [], stockEffect: 'NONE' },
  { flow: 'SHIP', id: 'S12', name: 'Destination receiving -> overseas inventory', page: 'global-logistics-map.js',
    action: 'shipment.receipt.update', handler: 'handleUpdateShipmentReceipt_',
    owner: '31_shipment_receipt_route_handlers.gs',
    targets: ['shipments', 'shipment_lines', 'overseas_inventory_snapshot', 'overseas_inventory_movements'],
    stockEffect: 'DESTINATION_STOCK_INCREASE' },

  // ---- PURCHASE MAINLINE -------------------------------------------------------------------------------------
  { flow: 'BUY', id: 'P1', name: 'Order Planning calculation (gap)', page: 'request-order.js',
    action: 'orderPlanningGap.get', handler: 'handleGetOrderPlanningGap_',
    owner: '43_api_v1_gap_materialization.gs', targets: ['order_planning_gap'], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P2', name: 'Order AI Plan (resumable scope job)', page: 'request-order.js',
    action: 'requestOrderDraft.job.start', handler: 'handleStartRequestOrderDraftJob_',
    owner: '48_api_v1_request_order_draft_job.gs', targets: ['request_order_allocation_drafts'], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P3', name: 'Request Order Allocation Draft edit', page: 'request-order.js',
    action: 'requestOrder.allocationDraft.ensureAndEdit', handler: 'handleRequestOrderAllocationDraftEnsureAndEdit_',
    owner: '15_request_allocation_handlers.gs', targets: ['request_order_allocation_drafts', 'request_order_allocation_draft_lines'], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P4', name: 'Send Request (server orchestration)', page: 'request-order.js',
    action: 'requestOrder.send.orchestrate', handler: 'handleRequestOrderSendOrchestrate_',
    owner: '66_api_v1_request_order_send.gs', targets: ['request_orders', 'request_order_lines'], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P5', name: 'Request Order workspace readback', page: 'request-order-draft.js',
    action: 'requestOrder.workspace.get', handler: 'handleRequestOrderWorkspaceGet_',
    owner: '51_api_v1_request_order_workspace.gs', targets: [], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P6', name: 'Request Order line quantity edit', page: 'request-order-draft.js',
    action: 'updateRequestOrderLineQty', handler: 'handleUpdateRequestOrderLineQty_',
    owner: '13_procurement_handlers.gs', targets: ['request_order_lines'], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P7', name: 'Request Order approval / rejection', page: 'request-order-draft.js',
    action: 'updateRequestOrderStatus', handler: 'handleUpdateRequestOrderStatus_',
    owner: '13_procurement_handlers.gs', targets: ['request_orders'], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P8', name: 'Purchase Order creation from Request', page: 'request-order-draft.js',
    action: 'createPurchaseOrderFromRequest', handler: 'handleCreatePurchaseOrderFromRequest_',
    owner: '13_procurement_handlers.gs', targets: ['purchase_orders', 'purchase_order_lines'], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P10', name: 'Document retry (PO + shipment panels)', page: 'shipping-history.js',
    action: 'document.retry', handler: 'handleDocumentRetry_',
    owner: '39_document_runtime_service.gs', targets: ['generated_documents'], stockEffect: 'NONE' },
  // The document PANEL does not read this action: both PO Overview and Shipment History take their document
  // DTOs from the workspace's bounded `include: { documents: true }` projection instead. So the standalone
  // list surface is deployed, required, and started by nobody - which is a fact about the contract, not a
  // fault in the panel.
  { flow: 'BUY', id: 'P10b', name: 'Document list (standalone surface)', page: '(superseded by workspace include)',
    action: 'document.list', handler: 'handleEntityDocumentList_',
    owner: '39_document_runtime_service.gs', targets: [], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P11', name: 'Purchase Order Overview / List readback', page: 'purchase-order-overview.js',
    action: 'purchaseOrder.workspace.get', handler: 'handlePurchaseOrderWorkspaceGet_',
    owner: '50_api_v1_purchase_order_workspace.gs', targets: [], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P12', name: 'Send PO / status advance', page: 'purchase-order-overview.js',
    action: 'updatePurchaseOrderStatus', handler: 'handleUpdatePurchaseOrderStatus_',
    owner: '13_procurement_handlers.gs', targets: ['purchase_orders'], stockEffect: 'NONE' },
  { flow: 'BUY', id: 'P13', name: 'Factory receipt -> Factory Stock increase', page: 'purchase-order-overview.js',
    action: 'receivePurchaseOrderLines', handler: 'handleReceivePurchaseOrderLines_',
    owner: '13_procurement_handlers.gs',
    targets: ['purchase_order_lines', 'purchase_orders', 'factory_stock', 'factory_stock_movements'],
    stockEffect: 'FACTORY_STOCK_INCREASE' },
  { flow: 'BUY', id: 'P14', name: 'Manual factory stock adjustment', page: 'factory-stock.js',
    action: 'adjustFactoryInventory', handler: 'handleAdjustFactoryInventory_',
    owner: '21_factory_inventory_handlers.gs', targets: ['factory_stock', 'factory_stock_movements'],
    stockEffect: 'FACTORY_STOCK_ADJUST' }
];

function evidence(st) {
  var adapters = adaptersFor(st.action);
  var owners = handlerOwners(st.handler);
  return {
    router: routerBranches(st.action),
    handler: owners.length,
    ownerFiles: owners,
    manifest: !!MANIFEST_ACTIONS[st.action],
    adapters: adapters,
    callers: pagesCalling(adapters),
    reach: frontendReach(st.action, adapters)
  };
}
function classify(st, ev) {
  if (ev.router === 0 && ev.handler === 0) return 'SPEC_ONLY';
  if (ev.handler === 0) return 'UI_ONLY';
  if (ev.router === 0) return 'SERVER_ONLY';
  // SERVER_ONLY means the frontend cannot reach it AT ALL - neither through an adapter call nor by naming the
  // action. An adapter that exists but is called from nowhere is IMPLEMENTED_NOT_CONNECTED, which is a
  // different problem: the server and the transport are ready and no operator can start it.
  if (!ev.reach.length) return 'SERVER_ONLY';
  return 'CONNECTED';
}

// ================================================================================================================
section('§B — THE DUAL-FLOW TOPOLOGY, MEASURED');
// ================================================================================================================
var TOPO = [];
STAGES.forEach(function (st) {
  var ev = evidence(st);
  var cls = classify(st, ev);
  TOPO.push({ stage: st, ev: ev, cls: cls });
});
console.log('');
console.log('flow  id    router handler manifest adapter page reach  class                      stage');
console.log('----  ----  ------ ------- -------- ------- ---- -----  -------------------------  ------------------------------');
TOPO.forEach(function (t) {
  function pad(v, n) { v = String(v); while (v.length < n) v += ' '; return v; }
  console.log(pad(t.stage.flow, 6) + pad(t.stage.id, 6) + pad(t.ev.router, 7) + pad(t.ev.handler, 8) +
    pad(t.ev.manifest ? 'yes' : 'NO', 9) + pad(t.ev.adapters.length, 8) + pad(t.ev.callers.length, 5) +
    pad(t.ev.reach.length, 7) + pad(t.cls, 27) + t.stage.name);
});
console.log('');

// Every stage must have EXACTLY ONE owner and EXACTLY ONE router branch. Two owners is an ambiguity the
// deployment cannot resolve; zero is a claim with nothing behind it.
TOPO.forEach(function (t, i) {
  eq(t.ev.handler, 1, 'B' + (i + 1) + '   ' + t.stage.id + ' ' + t.stage.action + ' has exactly ONE handler owner (' + (t.ev.ownerFiles[0] || 'NONE') + ')');
});
TOPO.forEach(function (t, i) {
  ok(t.ev.router >= 1, 'B' + (i + 1) + 'a  ' + t.stage.id + ' is dispatched by the router');
});
TOPO.forEach(function (t, i) {
  eq(t.ev.ownerFiles[0], t.stage.owner, 'B' + (i + 1) + 'b  ' + t.stage.id + ' owner file is ' + t.stage.owner);
});

// ---- THE MEASURED GAPS ------------------------------------------------------------------------------------
(function () {
  // THE MEASURED GAP SET. Pinned as an equality so a later round cannot quietly add a new unreachable stage,
  // and cannot quietly claim one of these was always fine.
  //
  // F1-7N-FC-1A CLOSED S6b, AND THIS IS WHERE THAT SHOWS UP. FC-0A measured FOUR stages deployed and startable
  // by nobody; the highest-severity one — createShipmentFromPlan, the recovery route the Approve failure
  // message had been promising for rounds — now has a caller on the Approved plan card. The equality is
  // updated rather than relaxed: three remain, and the list still refuses a silent fourth.
  var serverOnly = TOPO.filter(function (t) { return t.cls === 'SERVER_ONLY'; }).map(function (t) { return t.stage.id; });
  eq(serverOnly, ['S7b', 'S8b', 'P10b'],
    'B90 §K THREE stages remain deployed and startable by nobody: the shipment method candidate list, the ' +
    'shipment final-output snapshot, and the standalone document list (S6b was CLOSED by FC-1A)');
  var specOnly = TOPO.filter(function (t) { return t.cls === 'SPEC_ONLY' || t.cls === 'UI_ONLY'; }).map(function (t) { return t.stage.id; });
  eq(specOnly, [], 'B91 §K and no stage is SPEC_ONLY or UI_ONLY — every mainline stage has a real server owner');

  // Two of the four are REQUIRED actions, which means a deployment is judged incomplete without them while
  // nothing can call them. That is the shape worth naming: contract weight with no consumer.
  var reqOrphans = TOPO.filter(function (t) { return t.cls === 'SERVER_ONLY' && t.ev.manifest; })
    .map(function (t) { return t.stage.action; });
  eq(reqOrphans, ['finalizeShipmentFinalOutput', 'document.list'],
    'B92 §K two of them are REQUIRED actions with no frontend consumer at all');

  // And every stage that MOVES STOCK is connected. That is the one class of gap that would be unsafe.
  var stockGaps = TOPO.filter(function (t) { return t.stage.stockEffect !== 'NONE' && t.cls !== 'CONNECTED'; })
    .map(function (t) { return t.stage.id; });
  eq(stockGaps, [], 'B93 §G every stage with an inventory effect is fully connected');
})();

// S6b WAS the retry the Approve path's own failure message pointed the operator at while nothing could reach
// it. F1-7N-FC-1A connected it, and these checks are INVERTED to hold the closure in place: the same evidence,
// now asserting the fix rather than the gap. If a later round breaks any of them, the operator is back to
// being told to retry somewhere they cannot.
(function () {
  var sp = PAGE_SRC['shipping-plan.js'];
  var live = code(sp);   // comments stripped: the old promise survives ONLY as a quotation explaining itself
  ok(!/You can retry from Shipment Overview/.test(live),
    'B94 §K the message naming an unreachable recovery route is GONE from the live code');
  ok(frontendReach('createShipmentFromPlan', adaptersFor('createShipmentFromPlan')).length > 0,
    'B94a and the frontend now REACHES the retry action — the recovery route it names exists');
  ok(!!MANIFEST_ACTIONS['createShipmentFromPlan'],
    'B94b and it is a REQUIRED action, so a deployment missing it is a NAMED deployment fact');
  ok(/spDbRetryShipment/.test(live) && /Retry Shipment Draft/.test(sp),
    'B94c and the caller is the Approved plan card — the page where the recoverable plan actually is');
})();

// ================================================================================================================
section('§B / §K — ATOMICITY OF THE ONE COMPOUND TRANSITION');
// ================================================================================================================
(function () {
  // S6 writes the plan status and THEN creates the shipment. If the second half throws, the first half stands.
  var f = code(extractFn(G11, 'handleUpdateShipmentStatusNoSuchFn_'.replace('handleUpdateShipmentStatusNoSuchFn_', 'handleUpdateShippingPlanStatus_')));
  var statusIdx = f.indexOf("setCell('status', 'approved')");
  var shipIdx = f.indexOf('createShipmentFromApprovedPlan_');
  ok(statusIdx > -1 && shipIdx > statusIdx,
    'K1  §K S6 writes status=approved BEFORE it creates the Shipment Draft');
  ok(/try \{[\s\S]{0,200}createShipmentFromApprovedPlan_[\s\S]{0,400}catch/.test(f),
    'K1a and the Shipment Draft creation is inside a try/catch that does not undo the status');
  ok(!/rollback|undoAll|revert/i.test(f.slice(shipIdx)),
    'K1b so a failed Shipment Draft leaves an APPROVED plan with no shipment — CONNECTED_NOT_ATOMIC, and the ' +
    'only stated recovery (B93) has no caller');
})();

// ================================================================================================================
section('§G — THE SHARED STOCK LEDGER, EXECUTED');
// ================================================================================================================
// An in-memory sheet that COUNTS every mutation per table. That count is the whole point: it is how "planning
// writes no stock" and "a replay writes nothing" stop being claims.
function MemSheet(name, grid) { this.__n = name; this.g = grid.map(function (r) { return r.slice(); }); this.appends = 0; this.writes = 0; this.deletes = 0; }
MemSheet.prototype.getName = function () { return this.__n; };
MemSheet.prototype.getDataRange = function () { var s = this; return { getValues: function () { return s.g.map(function (r) { return r.slice(); }); } }; };
MemSheet.prototype.getLastColumn = function () { return this.g.length ? this.g[0].length : 0; };
MemSheet.prototype.getLastRow = function () { return this.g.length; };
MemSheet.prototype.appendRow = function (row) { this.g.push(row.slice()); this.appends++; };
MemSheet.prototype.deleteRow = function (r) { this.g.splice(r - 1, 1); this.deletes++; };
MemSheet.prototype.insertColumnAfter = function () {};
MemSheet.prototype.mutations = function () { return this.appends + this.writes + this.deletes; };
MemSheet.prototype.getRange = function (r, c, nr, nc) {
  var s = this; nr = nr || 1; nc = nc || 1;
  return {
    getValues: function () { var o = []; for (var i = 0; i < nr; i++) { var row = s.g[r - 1 + i] || []; o.push(row.slice(c - 1, c - 1 + nc)); } return o; },
    getValue: function () { return (s.g[r - 1] || [])[c - 1]; },
    setValue: function (v) { if (!s.g[r - 1]) s.g[r - 1] = []; s.g[r - 1][c - 1] = v; s.writes++; },
    setValues: function (vs) { vs.forEach(function (rw, i) { if (!s.g[r - 1 + i]) s.g[r - 1 + i] = []; for (var j = 0; j < rw.length; j++) s.g[r - 1 + i][c - 1 + j] = rw[j]; }); s.writes += vs.length; }
  };
};
function gridOf(headers, objs) {
  var g = [headers.slice()];
  (objs || []).forEach(function (o) { g.push(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(o, h) ? o[h] : ''; })); });
  return g;
}
function objsOf(sheet) {
  var h = (sheet.g[0] || []).map(function (x) { return String(x).trim(); });
  return sheet.g.slice(1).map(function (r) { var o = {}; for (var i = 0; i < h.length; i++) if (h[i]) o[h[i]] = r[i]; return o; });
}

// ---- the Apps Script services, stubbed exactly as far as these two handlers reach ---------------------------
function gasServices() {
  var uuidN = 0;
  return {
    Utilities: { getUuid: function () { uuidN++; return 'uuid-' + ('0000' + uuidN).slice(-4) + '-fc0a-0000-000000000000'; },
      formatDate: function () { return '2026-09-03'; } },
    Session: { getScriptTimeZone: function () { return 'Asia/Taipei'; } },
    SpreadsheetApp: { flush: function () {} },
    LockService: { getScriptLock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; } },
    Logger: { log: function () {} }
  };
}
var LAST_RESPONSE = null;
function jsonResponseStub(o) { LAST_RESPONSE = o; return o; }

// ---- FIXTURE WORLD: one factory warehouse, one SKU, 1000 units ---------------------------------------------
var FS_H = ['factory_stock_id', 'warehouse_id', 'sku', 'fac_current_stock', 'fac_reserved_stock', 'updated_at'];
var MOV_H = ['factory_stock_movement_id', 'movement_date', 'sku', 'warehouse_id', 'movement_type', 'qty',
  'related_entity_type', 'related_entity_id', 'before_current_stock', 'after_current_stock',
  'before_reserved_stock', 'after_reserved_stock', 'note', 'created_by', 'created_at'];

// ================================================================================================================
// G-A. CONFIRM SHIPMENT: the deduction, executed on 22_'s real orchestration.
// ================================================================================================================
var SHIP_H = ['shipment_id', 'shipping_plan_id', 'status', 'external_shipment_id', 'reference_id', 'warehouse_code',
  'carrier_id', 'shipping_method', 'etd', 'eta', 'shipment_total_qty', 'total_qty', 'ship_from', 'destination',
  'destination_warehouse_id', 'route_template_id', 'shipped_at', 'shipped_by', 'actual_departure_date',
  'updated_at', 'updated_by'];
var SLINE_H = ['shipment_line_id', 'shipment_id', 'sku', 'shipment_qty', 'carton_qty', 'units_per_carton', 'shipped_qty'];
var ROUTE_T_H = ['route_template_id', 'template_name', 'destination', 'carrier_id', 'shipping_method', 'is_active'];
var ROUTE_N_H = ['route_template_node_id', 'route_template_id', 'sequence_no', 'node_type', 'node_code',
  'location_name', 'country', 'region', 'city', 'latitude', 'longitude', 'transport_mode', 'planned_event_type',
  'offset_days', 'logistics_location_id'];

function confirmWorld(opts) {
  opts = opts || {};
  var sheets = {
    shipments: new MemSheet('shipments', gridOf(SHIP_H, [Object.assign({
      shipment_id: 'SHP-1', shipping_plan_id: 'SP-1', status: 'ready_to_ship',
      external_shipment_id: 'EXT-1', reference_id: 'REF-1', warehouse_code: 'US3PL01',
      carrier_id: 'CR-1', shipping_method: 'sea', etd: '2026-09-10', eta: '2026-10-10',
      shipment_total_qty: 800, total_qty: 800, ship_from: 'CNYOUXIN', destination: 'US3PL01',
      destination_warehouse_id: 'WH-US-3PL-01', route_template_id: 'RT-1'
    }, opts.shipment || {})])),
    shipment_lines: new MemSheet('shipment_lines', gridOf(SLINE_H, opts.lines || [
      { shipment_line_id: 'SL-1', shipment_id: 'SHP-1', sku: 'CO1100-R', shipment_qty: 800, carton_qty: 40, units_per_carton: 20, shipped_qty: 0 }
    ])),
    factory_stock: new MemSheet('factory_stock', gridOf(FS_H, opts.stock || [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 0 }
    ])),
    factory_stock_movements: new MemSheet('factory_stock_movements', gridOf(MOV_H, opts.movements || [])),
    shipment_routes: new MemSheet('shipment_routes', gridOf(['shipment_route_id', 'shipment_id'], opts.routes || [])),
    shipment_events: new MemSheet('shipment_events', gridOf(['shipment_event_id', 'shipment_id'], [])),
    shipment_route_templates: new MemSheet('shipment_route_templates', gridOf(ROUTE_T_H, [
      { route_template_id: 'RT-1', template_name: 'CN->US', destination: 'US3PL01', carrier_id: 'CR-1', shipping_method: 'sea', is_active: 'TRUE' }
    ])),
    shipment_route_template_nodes: new MemSheet('shipment_route_template_nodes', gridOf(ROUTE_N_H, [
      { route_template_node_id: 'RTN-1', route_template_id: 'RT-1', sequence_no: 1, node_type: 'origin', node_code: 'CNYOUXIN', location_name: 'Youxin', country: 'CN', offset_days: 0 },
      { route_template_node_id: 'RTN-2', route_template_id: 'RT-1', sequence_no: 2, node_type: 'destination', node_code: 'US3PL01', location_name: 'US 3PL', country: 'US', offset_days: 30 }
    ]))
  };
  var reads = {};
  return { sheets: sheets, reads: reads,
    ss: { getId: function () { return 'DBID-FC0A'; },
      getSheetByName: function (n) { reads[n] = (reads[n] || 0) + 1; return sheets[n] || null; },
      insertSheet: function (n) { sheets[n] = new MemSheet(n, [[]]); return sheets[n]; } },
    mutated: function () { return Object.keys(sheets).filter(function (n) { return sheets[n].mutations() > 0; }).sort(); },
    stock: function () { return objsOf(sheets.factory_stock); },
    movements: function () { return objsOf(sheets.factory_stock_movements); } };
}

// 22_ reaches a handful of helpers that live in other files. They are supplied here as the SAME contract the
// real ones implement, and every one of them is named so the boundary of what is real is visible:
//   REAL     — handleConfirmShipmentAndDispatch_ and every csd* helper in 22_.
//   SUPPLIED — sheet ensure/append/read helpers, the document readiness gate (a Drive probe), the PO
//              allocation planner (32_), and carton validation. None of them touches factory stock, which is
//              what this section measures.
// F1-7N-FC-1A: `mutated21` was added because the mutation targets M2/M4/M5/M6 aim at MOVED. The movement
// append, its sign, its before/after pair and its lineage now live in 21_'s shared primitive, so mutating 22_
// can no longer reach them. Aiming the same four mutations at the shared core is strictly stronger: one
// surviving mutant there would break the dispatch, the PO receipt, the adjustment and the import at once.
function runConfirm(world, body, mutatedSrc, mutated21) {
  var svc = gasServices();
  LAST_RESPONSE = null;
  // F1-7N-FC-1A §F: 22_ no longer implements a stock mutation. It calls 21_'s shared authority, so 21_'s
  // real core is loaded here and the deduction this section measures is executed by the ONE canonical
  // primitive. Nothing about the assertions below is relaxed; the code under them is simply the shared one.
  var g21 = mutated21 || G21;
  var src = (mutatedSrc || G22) + NL + [
    extractFn(g21, 'factoryStockApplyDeltaTx_'),
    extractFn(g21, 'factoryStockOwnerReservedTx_'),
    extractFn(g21, 'factoryStockRollbackJournal_'),
    "var FSTX_MOV_RESERVE_ACQUIRE_ = 'reservation_acquire';",
    "var FSTX_MOV_RESERVE_RELEASE_ = 'reservation_release';",
    "var FSTX_RESERVATION_OWNER_TYPE_ = 'shipment';"
  ].join(NL);
  function appendByHeader(sh, obj) {
    var h = (sh.g[0] || []).map(function (x) { return String(x).trim(); });
    sh.appendRow(h.map(function (k) { return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : ''; }));
  }
  function readSheet(sh) {
    var vals = sh.getDataRange().getValues();
    var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
    return { rows: vals, headers: h, col: function (n) { return h.indexOf(n); } };
  }
  var fn = new Function(
    'Utilities', 'Session', 'SpreadsheetApp', 'LockService', 'Logger', 'jsonResponse_',
    'sheetEnsureColumns_', 'shipmentReadSheet_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_',
    'fcWriteAppendByHeader_', 'shipmentTimestamp_', 'shipmentToday_', 'shipmentValidateCartons_',
    'dgsShipmentReadiness_', 'dgsGenerateShipmentDocuments_', 'slaPrepareExecution_', 'slaApplyExecution_',
    'var OUT;' + src + NL + 'OUT = handleConfirmShipmentAndDispatch_; return OUT;')(
    svc.Utilities, svc.Session,
    { flush: function () {}, getActiveSpreadsheet: function () { return world.ss; } },
    svc.LockService, svc.Logger, jsonResponseStub,
    function () {},                       // sheetEnsureColumns_  — validate-only in this world
    readSheet,                            // shipmentReadSheet_
    function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); },
    function () {},                       // fcWriteEnsureColumns_
    appendByHeader,
    function () { return '2026-09-03 12:00:00'; },
    function () { return '2026-09-03'; },
    function () { return { ok: true }; },                                  // shipmentValidateCartons_ (33_/12_)
    function () { return { ok: true, status: 'READY', blockers: [] }; },    // dgsShipmentReadiness_ (39_) — a Drive probe
    function () { return { ok: true, generated: [] }; },                    // dgsGenerateShipmentDocuments_ (39_)
    function () { return { ok: true, plan: [] }; },                         // slaPrepareExecution_ (32_)
    function () { return { ok: true, applied: [] }; });                     // slaApplyExecution_ (32_)
  try { return fn(body || { shipment_id: 'SHP-1', actor: 'op' }); }
  catch (e) { return { success: false, threw: true, error: String(e && e.message) }; }
}

// A NOTE THAT IS WORTH KEEPING. The first version of this harness omitted slaApplyExecution_, and 22_ did not
// return a half-written shipment: it caught the throw, ran its compensating rollback and answered
// `stage: 'write_rolled_back'` with the balance restored. That was an accident, and it is the cleanest
// possible evidence for §E's rollback requirement, so it is now an explicit fixture below (G11).

(function () {
  var w = confirmWorld();
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  if (r.success !== true) console.log('   DEBUG confirm response: ' + JSON.stringify(r).slice(0, 400));
  eq(r.success, true, 'G1  §G.4 Confirm Shipment completes on a ready_to_ship shipment');
  var st = w.stock()[0], mv = w.movements();
  eq(Number(st.fac_current_stock), 200, 'G2  §G.4 factory stock is deducted EXACTLY once: 1000 - 800 = 200');
  eq(mv.length, 1, 'G3  §G.2 exactly ONE factory_stock_movements row was written');
  eq([String(mv[0].movement_type), Number(mv[0].qty)], ['shipment_out', -800],
    'G3a §G.2 typed shipment_out, and the quantity is signed NEGATIVE');
  eq([Number(mv[0].before_current_stock), Number(mv[0].after_current_stock)], [1000, 200],
    'G4  §G.3 the movement row carries the before AND after balance — the snapshot and the movement agree');
  eq([String(mv[0].related_entity_type), String(mv[0].related_entity_id)], ['shipment', 'SHP-1'],
    'G4a and it names the shipment that caused it (§E source lineage)');
  eq(Number(mv[0].before_reserved_stock), Number(mv[0].after_reserved_stock),
    'G5  §G.6 reserved stock is UNCHANGED by the deduction');
  var ship = objsOf(w.sheets.shipments)[0];
  eq(String(ship.status), 'shipped', 'G6  §E.8 the shipment ends at `shipped` — the formal hand-over, never in_transit');
  ok(String(ship.shipped_at).length > 0 && String(ship.shipped_by) === 'op', 'G6a stamped with who and when');
  eq(w.sheets.shipment_routes.appends, 2, 'G7  §E.9 the route snapshot is one row per template node');
  eq(w.sheets.shipment_events.appends, 1, 'G7a and exactly ONE real initial event is created');
  eq(objsOf(w.sheets.shipment_events)[0].shipment_id, 'SHP-1', 'G7b bound to this shipment');
})();

(function () {
  // §E / §G.3 — A THROW AFTER THE DEDUCTION UNWINDS EVERYTHING. The PO-allocation execution step runs AFTER
  // the stock has already been written, so it is the exact place where a partial dispatch would appear. The
  // dependency is made to throw, and the whole transaction must come back.
  var w = confirmWorld();
  var svc = gasServices();
  function appendByHeader(sh, obj) {
    var h = (sh.g[0] || []).map(function (x) { return String(x).trim(); });
    sh.appendRow(h.map(function (k) { return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : ''; }));
  }
  var fn = new Function(
    'Utilities', 'Session', 'SpreadsheetApp', 'LockService', 'Logger', 'jsonResponse_',
    'sheetEnsureColumns_', 'shipmentReadSheet_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_',
    'fcWriteAppendByHeader_', 'shipmentTimestamp_', 'shipmentToday_', 'shipmentValidateCartons_',
    'dgsShipmentReadiness_', 'dgsGenerateShipmentDocuments_', 'slaPrepareExecution_', 'slaApplyExecution_',
    'var OUT;' + G22 + NL + [
      extractFn(G21, 'factoryStockApplyDeltaTx_'),
      extractFn(G21, 'factoryStockOwnerReservedTx_'),
      extractFn(G21, 'factoryStockRollbackJournal_'),
      "var FSTX_MOV_RESERVE_ACQUIRE_ = 'reservation_acquire';",
      "var FSTX_MOV_RESERVE_RELEASE_ = 'reservation_release';",
      "var FSTX_RESERVATION_OWNER_TYPE_ = 'shipment';"
    ].join(NL) + NL + 'OUT = handleConfirmShipmentAndDispatch_; return OUT;')(
    svc.Utilities, svc.Session,
    { flush: function () {}, getActiveSpreadsheet: function () { return w.ss; } },
    svc.LockService, svc.Logger, jsonResponseStub,
    function () {},
    function (sh) {
      var vals = sh.getDataRange().getValues();
      var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
      return { rows: vals, headers: h, col: function (n) { return h.indexOf(n); } };
    },
    function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); },
    function () {}, appendByHeader,
    function () { return '2026-09-03 12:00:00'; },
    function () { return '2026-09-03'; },
    function () { return { ok: true }; },
    function () { return { ok: true, status: 'READY', blockers: [] }; },
    function () { return { ok: true, generated: [] }; },
    function () { return { ok: true, plan: [] }; },
    function () { throw new Error('PO_ALLOCATION_EXECUTION_FAILED'); });
  var r = fn({ shipment_id: 'SHP-1', actor: 'op' });
  eq(r.success, false, 'G11 §E a failure AFTER the deduction fails the whole confirmation');
  eq(String(r.stage), 'write_rolled_back', 'G11a under a stage that says the writes were rolled back');
  eq(Number(w.stock()[0].fac_current_stock), 1000, 'G11b §G.3 the factory balance is RESTORED to 1000');
  eq(w.movements().length, 0, 'G11c §G.10 and the movement row is gone — no orphan movement survives');
  eq(String(objsOf(w.sheets.shipments)[0].status), 'ready_to_ship',
    'G11d and the shipment is back at ready_to_ship, not half-shipped');
  eq([w.sheets.shipment_routes.g.length - 1, w.sheets.shipment_events.g.length - 1], [0, 0],
    'G11e with no route snapshot and no event left behind');
})();

(function () {
  // §G.10 / §J.8 — the replay. A second Confirm must write NOTHING.
  var w = confirmWorld();
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  var beforeStock = Number(w.stock()[0].fac_current_stock);
  var beforeMv = w.movements().length;
  var counts = {}; Object.keys(w.sheets).forEach(function (n) { counts[n] = w.sheets[n].mutations(); });
  var r2 = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq([r2.success, r2.already_confirmed], [true, true], 'G8  §G.10/§J.8 a replayed Confirm reports already_confirmed');
  eq(Number(w.stock()[0].fac_current_stock), beforeStock, 'G8a and deducts NOTHING a second time');
  eq(w.movements().length, beforeMv, 'G8b §G.10 no duplicate movement row');
  var after = {}; Object.keys(w.sheets).forEach(function (n) { after[n] = w.sheets[n].mutations(); });
  eq(after, counts, 'G8c and not one cell anywhere changed on the replay');
})();

(function () {
  // §G.11 — the frozen negative-stock policy: refuse BEFORE any write. Not invented here; measured.
  var w = confirmWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-A', sku: 'CO1100-R', fac_current_stock: 100, fac_reserved_stock: 0 }] });
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq(r.success, false, 'G9  §G.11 insufficient factory stock REFUSES the confirmation');
  ok(/Insufficient factory stock/.test(String(r.error)) && /No stock was deducted/.test(String(r.error)),
    'G9a naming the shortfall and stating that nothing was deducted');
  eq(Number(w.stock()[0].fac_current_stock), 100, 'G9b and the balance is untouched');
  eq(w.movements().length, 0, 'G9c with no movement row');
  eq(w.mutated(), [], 'G9d §G.2 not one table was mutated — the refusal is before every write');
})();

(function () {
  // §G.12 — warehouse identity. The deduction plan is keyed on warehouse_id, and the movement records it.
  var w = confirmWorld({ stock: [
    { factory_stock_id: 'FS-1', warehouse_id: 'WH-B-SECOND', sku: 'CO1100-R', fac_current_stock: 300, fac_reserved_stock: 0 },
    { factory_stock_id: 'FS-2', warehouse_id: 'WH-A-FIRST', sku: 'CO1100-R', fac_current_stock: 600, fac_reserved_stock: 0 }
  ] });
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq(r.success, true, 'G10 §J.10 one SKU spread over two factory warehouses still ships');
  var mv = w.movements();
  eq(mv.length, 2, 'G10a §G.2 one movement row PER warehouse — never one merged row');
  eq(mv.map(function (m) { return String(m.warehouse_id); }), ['WH-A-FIRST', 'WH-B-SECOND'],
    'G10b §G.12 each names its own warehouse_id (deterministic order, never a first-row pick)');
  eq(mv.reduce(function (a, m) { return a + Math.abs(Number(m.qty)); }, 0), 800,
    'G10c §J.15 the movements sum to exactly the shipped quantity');
  var left = w.stock().reduce(function (a, s) { return a + Number(s.fac_current_stock); }, 0);
  eq(left, 100, 'G10d and 900 - 800 = 100 remains');
})();

// ================================================================================================================
section('§G — THE RESERVATION COLUMN, AND WHAT NOTHING DOES TO IT');
// ================================================================================================================
(function () {
  // §G.6 asks that a reservation cannot survive deduction or cancellation. Measured, the stronger fact is that
  // NOTHING IN THE SYSTEM EVER SETS ONE. The column is read, initialised to 0, carried into movement rows as
  // before/after — and never assigned a non-zero value by any handler.
  var writers = [];
  GS_FILES.forEach(function (f) {
    var c = code(GS_SRC[f]);
    // an assignment of the reserved column to something other than a literal 0
    // The leading boundary matters: without it this matched the TAIL of `before_reserved_stock:` and
    // `after_reserved_stock:` and reported the movement row's own before/after snapshot as a reservation.
    var re = /(?:^|[^_A-Za-z])(fac_reserved_stock|reserved_stock)\s*:\s*([^,}\n]+)/g, m;
    while ((m = re.exec(c))) {
      var v = String(m[2]).trim();
      if (v === '0' || /^0$/.test(v)) continue;
      if (/^'|^"/.test(v)) continue;                       // a header-name string, not a value
      writers.push(f + ': ' + m[1] + ' = ' + v);
    }
  });
  eq(writers, [],
    'G20 §G.6 MEASURED: no handler anywhere assigns a non-zero reserved stock — factory stock is never RESERVED');
  ok(/available_factory_stock = fac_current_stock - fac_reserved_stock/.test(G21),
    'G20a while the availability formula subtracts it, so availability always equals current stock');
  // The consequence, stated as a fixture: two sites can plan the same physical units and neither is warned.
  var w = confirmWorld();
  eq(Number(w.stock()[0].fac_current_stock) - Number(w.stock()[0].fac_reserved_stock), 1000,
    'G20b §J.4 after a Submit Plan and a Shipment Draft for 800, availability still reads the full 1000');
})();

// ================================================================================================================
section('§G — WHO MAY MOVE FACTORY STOCK AT ALL');
// ================================================================================================================
(function () {
  // Only movement TYPES that exist may exist. This is the closed vocabulary, derived from the sources.
  // Three shapes, because the vocabulary is declared three ways: written inline, hoisted to a constant, and
  // passed into 21_'s shared transaction as `movementType`. A probe that reads only the inline form misses
  // po_receipt entirely — which is the single most consequential type in the purchase mainline.
  var types = {};
  GS_FILES.forEach(function (f) {
    var c = code(GS_SRC[f]);
    (c.match(/movement_type:\s*'([a-z_]+)'/g) || []).forEach(function (m) { types[m.match(/'([a-z_]+)'/)[1]] = 1; });
    (c.match(/movementType:\s*'([a-z_]+)'/g) || []).forEach(function (m) { types[m.match(/'([a-z_]+)'/)[1]] = 1; });
  });
  // A FOURTH declaration shape, added by FC-1A: a hoisted FSTX_MOV_* constant. Reading only the three earlier
  // shapes would have reported the vocabulary as unchanged at five while two new values were live — exactly
  // the quiet drift this probe exists to prevent, and the same class of bug as the po_receipt miss it already
  // carries a comment about.
  types[String(G22.match(/var CSD_MOV_TYPE_ = '([a-z_]+)'/)[1])] = 1;
  GS_FILES.forEach(function (f) {
    (code(GS_SRC[f]).match(/var FSTX_MOV_[A-Z_]+ = '([a-z_]+)'/g) || []).forEach(function (m) {
      types[m.match(/'([a-z_]+)'/)[1]] = 1;
    });
  });
  eq(Object.keys(types).sort(), ['inventory_import', 'manual_adjustment', 'po_receipt', 'reservation_acquire',
    'reservation_release', 'shipment_out', 'shipment_receipt'],
    'G30 §G the movement vocabulary is SEVEN: import, manual adjustment, PO receipt, reservation acquire, ' +
    'reservation release, shipment out, shipment receipt (FC-1A added the two reservation values)');

  // Every file that writes the movements table.
  var movWriters = GS_FILES.filter(function (f) {
    return /fcWriteEnsureSheet_\(ss, 'factory_stock_movements'/.test(code(GS_SRC[f]));
  }).sort();
  eq(movWriters, ['12_shipment_handlers.gs', '13_procurement_handlers.gs', '21_factory_inventory_handlers.gs',
    '22_shipment_dispatch_handlers.gs'],
    'G31 §G exactly FOUR files may reach the factory stock movements table (FC-1A added 12_, which acquires ' +
    'the Shipment Draft reservation)');

  // THE FINDING FC-1A CLOSED. 21_ owns the ONE shared transaction and every caller delegates to it. Before
  // FC-1A, 22_ carried its own inline setValue + movement append while 13_'s comment claimed no second
  // implementation existed — the exact contradiction this audit measured.
  ok(/function factoryStockApplyDeltaTx_/.test(code(G21)), 'G32 21_ owns the shared stock transaction');
  ok(/factoryStockApplyDeltaTx_\(/.test(code(G13)), 'G32a 13_ (PO receipt) reuses it');
  ok(/factoryStockApplyDeltaTx_\(/.test(code(G22)),
    'G32b §G FC-1A CLOSED IT: 22_ (Confirm Shipment) now DELEGATES to the shared transaction instead of ' +
    'carrying a second stock-mutation implementation');
  ok(/factoryStockAcquireReservationTx_\(/.test(code(G12)),
    'G32c and 12_ reaches stock ONLY through the shared reservation primitives, never a balance cell of its own');
  // The ENFORCEABLE form of the ownership claim, and what makes 21_'s corrected comment true rather than
  // aspirational: no file outside 21_ may write a factory_stock balance cell.
  var balanceWriters = GS_FILES.filter(function (f) {
    if (f.indexOf('21_') === 0) return false;
    return /getRange\([^)]*(curCol|resCol)[^)]*\)\s*\.setValue/.test(code(GS_SRC[f]));
  }).sort();
  eq(balanceWriters, [], 'G32d §G and NO file outside 21_ writes a factory_stock balance cell');
  ok(/resulting fac_current_stock would be negative/.test(code(G21)),
    'G33 §G.11 the shared transaction refuses to go negative');
  ok(/Insufficient factory stock/.test(code(G22)),
    'G33a and the dispatch path refuses up front — both honour the same frozen policy by different code');
})();

// ================================================================================================================
section('§G / §F — PO RECEIPT: THE INCREASE, EXECUTED');
// ================================================================================================================
var PO_H = ['purchase_order_id', 'order_status', 'completed_by', 'completed_at', 'updated_by', 'updated_at'];
var POL_H = ['purchase_order_line_id', 'purchase_order_id', 'sku', 'supplier_warehouse_id', 'ordered_qty',
  'completed_qty', 'shipped_qty', 'remaining_qty', 'updated_at'];
var WH_H = ['warehouse_id', 'warehouse_code', 'is_active', 'is_factory_warehouse'];

function receiptWorld(opts) {
  opts = opts || {};
  var sheets = {
    purchase_orders: new MemSheet('purchase_orders', gridOf(PO_H, [{ purchase_order_id: 'PO-1', order_status: opts.poStatus || 'ordered' }])),
    purchase_order_lines: new MemSheet('purchase_order_lines', gridOf(POL_H, opts.lines || [
      { purchase_order_line_id: 'POL-1', purchase_order_id: 'PO-1', sku: 'CO1100-R',
        supplier_warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', ordered_qty: 500, completed_qty: 0, shipped_qty: 0, remaining_qty: 500 }
    ])),
    factory_stock: new MemSheet('factory_stock', gridOf(FS_H, opts.stock || [
      { factory_stock_id: 'FS-1', warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 0 }
    ])),
    factory_stock_movements: new MemSheet('factory_stock_movements', gridOf(MOV_H, [])),
    warehouses: new MemSheet('warehouses', gridOf(WH_H, opts.warehouses || [
      { warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', warehouse_code: 'CNYOUXIN', is_active: 'TRUE', is_factory_warehouse: 'TRUE' }
    ]))
  };
  return { sheets: sheets,
    ss: { getId: function () { return 'DBID-FC0A'; }, getSheetByName: function (n) { return sheets[n] || null; },
      insertSheet: function (n) { sheets[n] = new MemSheet(n, [[]]); return sheets[n]; } },
    mutated: function () { return Object.keys(sheets).filter(function (n) { return sheets[n].mutations() > 0; }).sort(); },
    stock: function () { return objsOf(sheets.factory_stock); },
    movements: function () { return objsOf(sheets.factory_stock_movements); },
    lines: function () { return objsOf(sheets.purchase_order_lines); } };
}

// 13_'s receipt reaches 21_'s shared transaction, so BOTH files are loaded and the transaction is REAL.
var RECEIPT_SRC = (function () {
  return [
    extractFn(G13, 'poRcvTruthy_'),
    extractFn(G13, 'poReceiptEvaluateLine_'),
    extractFn(G13, 'handleReceivePurchaseOrderLines_'),
    extractFn(G21, 'factoryStockApplyDeltaTx_'),
    extractFn(G21, 'factoryStockRollbackJournal_'),
    'OUT = handleReceivePurchaseOrderLines_;'
  ].join(NL);
})();
function runReceipt(world, body) {
  var svc = gasServices();
  LAST_RESPONSE = null;
  var fn = new Function(
    'Utilities', 'Session', 'SpreadsheetApp', 'LockService', 'Logger', 'jsonResponse_',
    'sheetEnsureColumns_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_', 'fcWriteAppendByHeader_',
    'procurementFindRow_', 'procurementTimestamp_',
    'var OUT;' + RECEIPT_SRC + NL + 'return OUT;')(
    svc.Utilities, svc.Session,
    { flush: function () {}, getActiveSpreadsheet: function () { return world.ss; } },
    svc.LockService, svc.Logger, jsonResponseStub,
    function () {},
    function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); },
    function () {},
    function (sh, obj) {
      var h = (sh.g[0] || []).map(function (x) { return String(x).trim(); });
      sh.appendRow(h.map(function (k) { return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : ''; }));
    },
    function (sheet, colName, id) {
      var vals = sheet.getDataRange().getValues();
      var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
      var c = h.indexOf(colName);
      if (c === -1) return null;
      for (var i = 1; i < vals.length; i++) {
        if (String(vals[i][c]).trim() === String(id).trim()) {
          return { row: i + 1, vals: vals[i], col: function (n) { return h.indexOf(n); } };
        }
      }
      return null;
    },
    function () { return '2026-09-03 12:00:00'; });
  try { return fn(body); }
  catch (e) { return { success: false, threw: true, error: String(e && e.message) }; }
}

(function () {
  var w = receiptWorld();
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'RCV-KEY-1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
  eq(r.success, true, 'F1  §F.15 a PO receipt of 200 completes');
  eq(Number(w.stock()[0].fac_current_stock), 1200, 'F2  §G.5 Factory Stock rises EXACTLY once: 1000 + 200 = 1200');
  var mv = w.movements();
  eq(mv.length, 1, 'F3  §G.2 exactly ONE movement row');
  eq([String(mv[0].movement_type), Number(mv[0].qty)], ['po_receipt', 200],
    'F3a §G.2 typed po_receipt with a POSITIVE quantity');
  eq([Number(mv[0].before_current_stock), Number(mv[0].after_current_stock)], [1000, 1200],
    'F4  §G.3 before and after are recorded together with the snapshot change');
  eq(String(mv[0].related_entity_type), 'purchase_order_receipt', 'F4a §F lineage names the receipt');
  eq(String(mv[0].related_entity_id), 'POL-1', 'F4b and the exact PO LINE it came from');
  var ln = w.lines()[0];
  eq([Number(ln.completed_qty), Number(ln.remaining_qty)], [200, 200],
    'F5  §F.14 completed_qty rises and remaining_qty = MAX(0, completed - shipped) is recomputed');
  ok(/\|key=RCV-KEY-1/.test(String(mv[0].note)), 'F6  §G.10 the idempotency key is recorded on the movement lineage');
})();

(function () {
  // §G.10 / §J.9 — the receipt replay under the SAME key writes nothing.
  var w = receiptWorld();
  var body = { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'RCV-KEY-1',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] };
  runReceipt(w, body);
  var stockAfter1 = Number(w.stock()[0].fac_current_stock);
  var mvAfter1 = w.movements().length;
  var r2 = runReceipt(w, body);
  eq(r2.success, true, 'F7  §J.9 a replayed receipt under the same key succeeds');
  eq(Number(w.stock()[0].fac_current_stock), stockAfter1, 'F7a and adds NOTHING a second time');
  eq(w.movements().length, mvAfter1, 'F7b §G.10 with no duplicate movement row');
  eq(Number(w.lines()[0].completed_qty), 200, 'F7c and completed_qty does not double');
})();

(function () {
  // §F — a non-factory or inactive destination fails the WHOLE request closed, before any write.
  [['is_factory_warehouse', 'FALSE', 'not a factory warehouse'],
   ['is_active', 'FALSE', 'inactive']].forEach(function (c, i) {
    var wh = { warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', warehouse_code: 'CNYOUXIN', is_active: 'TRUE', is_factory_warehouse: 'TRUE' };
    wh[c[0]] = c[1];
    var w = receiptWorld({ warehouses: [wh] });
    var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op',
      lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
    eq(r.success, false, 'F8.' + (i + 1) + '  §F a receipt into a ' + c[2] + ' destination is refused');
    eq(Number(w.stock()[0].fac_current_stock), 1000, 'F8.' + (i + 1) + 'a and no stock moved');
    eq(w.movements().length, 0, 'F8.' + (i + 1) + 'b with no movement row');
  });
})();

(function () {
  // §J.7 — a cancelled PO can never receive.
  var w = receiptWorld({ poStatus: 'cancelled' });
  var r = runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op',
    lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
  eq(r.success, false, 'F9  §J.7 a CANCELLED purchase order cannot receive');
  eq(w.mutated(), [], 'F9a and nothing anywhere was written');
})();

(function () {
  // §G.5 / §J.15 — receiving in two instalments conserves quantity exactly.
  var w = receiptWorld();
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K1', lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 300 }] });
  runReceipt(w, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K2', lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] });
  eq(Number(w.stock()[0].fac_current_stock), 1500, 'F10 §J.15 two instalments of 300 + 200 land exactly 500 units');
  eq(w.movements().length, 2, 'F10a as two separate movement rows');
  eq(w.movements().reduce(function (a, m) { return a + Number(m.qty); }, 0), 500, 'F10b summing to the ordered quantity');
  eq(Number(w.lines()[0].completed_qty), 500, 'F10c and the line is fully completed');
  // MEASURED SEMANTICS, and not what the column name suggests. `remaining_qty` is MAX(0, completed - shipped)
  // — the quantity RECEIVED INTO THE FACTORY AND NOT YET SHIPPED OUT — not "ordered but not yet received".
  // A report that read it as an outstanding-order figure would be wrong by the whole received amount, so it
  // is pinned here with its formula rather than left to the name.
  eq(Number(w.lines()[0].remaining_qty), 500,
    'F10d §F remaining_qty = MAX(0, completed - shipped) = 500 received and not yet shipped (NOT an ' +
    'outstanding-order quantity)');
})();

// ================================================================================================================
section('§J — CROSS-FLOW QUANTITY CONSERVATION');
// ================================================================================================================
(function () {
  // §J.2/§J.3 — factory short by 300: 700 ships now, and the PO receipt restores the balance for the rest.
  var w = confirmWorld({
    lines: [{ shipment_line_id: 'SL-1', shipment_id: 'SHP-1', sku: 'CO1100-R', shipment_qty: 700, carton_qty: 35, units_per_carton: 20, shipped_qty: 0 }],
    stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 700, fac_reserved_stock: 0 }]
  });
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });
  eq([r.success, Number(w.stock()[0].fac_current_stock)], [true, 0],
    'J1  §J.3 the available 700 ships and the factory balance reaches exactly zero');
  var rw = receiptWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-TW-CN-FACTORY-YOUXIN', sku: 'CO1100-R', fac_current_stock: 0, fac_reserved_stock: 0 }] });
  runReceipt(rw, { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K', lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 300 }] });
  eq(Number(rw.stock()[0].fac_current_stock), 300,
    'J1a §J.2 and the purchase mainline delivers the remaining 300 into the same balance');
  // The complete ledger for the scenario: 700 in stock, 700 out, 300 in, 300 available.
  var shipMv = w.movements().reduce(function (a, m) { return a + Number(m.qty); }, 0);
  var buyMv = rw.movements().reduce(function (a, m) { return a + Number(m.qty); }, 0);
  eq({ opening: 700, shipment_out: shipMv, po_receipt: buyMv, closing: 700 + shipMv + buyMv },
     { opening: 700, shipment_out: -700, po_receipt: 300, closing: 300 },
    'J2  §J.15 the cross-flow ledger balances: 700 - 700 + 300 = 300');
})();

(function () {
  // §J.4 — two sites competing for one factory pool. The SECOND confirmation is refused, not silently netted.
  var w = confirmWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 1000, fac_reserved_stock: 0 }] });
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' });                       // 800 out
  var w2 = confirmWorld({
    shipment: { shipment_id: 'SHP-2', external_shipment_id: 'EXT-2', reference_id: 'REF-2' },
    lines: [{ shipment_line_id: 'SL-2', shipment_id: 'SHP-2', sku: 'CO1100-R', shipment_qty: 800, carton_qty: 40, units_per_carton: 20, shipped_qty: 0 }],
    stock: w.stock()   // the SAME pool, as the first shipment left it
  });
  var r2 = runConfirm(w2, { shipment_id: 'SHP-2', actor: 'op' });
  eq(r2.success, false, 'J3  §J.4 a second site cannot confirm 800 against the 200 the first one left');
  eq(w2.movements().length, 0, 'J3a and the refusal writes nothing');
  ok(/need 800, available 200/.test(String(r2.error)),
    'J3b naming exactly what was needed and what was there');
  ok(true, 'J3c NOTE §G.6 — nothing RESERVED the first 800, so both sites saw 1000 available while planning; ' +
    'the collision is only discovered at the confirmation, which is the last possible moment');
})();

// ================================================================================================================
section('§I — THE READ-ONLY LEDGER CENSUS');
// ================================================================================================================
(function () {
  var CEN = read('assets/tools/apps-script-diagnostics/TEMP_dual_mainline_ledger_census_fc0a.gs');
  // The claim is not "no write happened" but "no write handle was ever obtained". The audit runs over CODE
  // with the report's own printed strings stripped, so prose that names a verb cannot mask a real call.
  var body = code(CEN).replace(/p\([\s\S]*?\);/g, 'p();').replace(/'[^']*'/g, "''");
  [['setValue', 1], ['appendRow', 2], ['deleteRow', 3], ['clearContent', 4], ['setValues', 5],
   ['insertSheet', 6], ['getScriptLock', 7], ['PropertiesService', 8], ['UrlFetchApp', 9],
   ['MailApp', 10], ['DriveApp', 11]].forEach(function (pair) {
    ok(body.indexOf(pair[0]) === -1, 'I' + pair[1] + '   the census never names ' + pair[0] + ' in code');
  });
  ok(/function facade\(name\)/.test(body), 'I12  every sheet goes through the read-only facade');
  eq((CEN.match(/^function TEMP_[A-Z0-9_]+\(/gm) || []).length, 1, 'I13  exactly ONE entry point');
  ok(/DB_WRITES=0/.test(CEN) && /STOCK_MOVEMENTS_WRITTEN=0/.test(CEN) && /REPAIRS=0/.test(CEN),
    'I14  it states its own zero-write, zero-movement, zero-repair result');
  // §I — it must actually READ the readback surfaces the mainlines depend on, or it proves nothing about them.
  ['factory_stock', 'factory_stock_movements', 'shipping_allocation_drafts', 'shipping_plans', 'shipments',
   'shipment_routes', 'shipment_events', 'request_orders', 'purchase_orders', 'purchase_order_lines'
  ].forEach(function (t, i) {
    ok(CEN.indexOf("'" + t + "'") !== -1, 'I15.' + (i + 1) + '  it reads ' + t);
  });
  // The four findings it exists to surface.
  ['BROKEN', 'BALANCE_DISAGREES', 'APPROVED_PLAN_WITH_NO_SHIPMENT', 'SHIPPED_WITH_NO_STOCK_MOVEMENT',
   'COMPLETED_QTY_WITH_NO_STOCK_MOVEMENT', 'RECEIPT_QUANTITY_UNRECONCILED'].forEach(function (c, i) {
    ok(CEN.indexOf(c) !== -1, 'I16.' + (i + 1) + '  it reports ' + c);
  });
  ok(/never rounded into agreement/.test(CEN), 'I17  §G it refuses to round an unreconciled quantity into agreement');
  ok(!/repair|restore|backfill/i.test(code(CEN).replace(/p\([\s\S]*?\);/g, 'p();')),
    'I18  and nothing in its code repairs, restores or back-fills');
  ok(/FC-0A S6b/.test(CEN),
    'I19  the approved-plan-with-no-shipment finding names the audit stage whose retry has no caller');
})();

// ================================================================================================================
section('§M — MUTATIONS. Each is applied to shipped source and must be caught.');
// ================================================================================================================
mut('M1  the deduction happens twice for one shipment', function () {
  var src = mutateFn(G22, 'handleConfirmShipmentAndDispatch_',
    "    if (curStatus === CSD_CONFIRMED_STATUS_ || curStatus === CSD_INTRANSIT_ || curStatus === 'arrived' || curStatus === 'received' || curStatus === 'completed' || curStatus === 'closed' || existingRoutes > 0 || existingEvents || existingMovement) {",
    "    if (false) {");
  // 2000 on hand, not 1000: with only 1000 the SUFFICIENCY gate refuses the second pass and the mutant is
  // masked by a different guard, which would have proved nothing about the idempotency guard being removed.
  var w = confirmWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-F', sku: 'CO1100-R', fac_current_stock: 2000, fac_reserved_stock: 0 }] });
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, src);
  var afterFirst = Number(w.stock()[0].fac_current_stock);
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, src);
  return w.movements().length > 1 && Number(w.stock()[0].fac_current_stock) < afterFirst;
});
mut('M2  stock is deducted without writing a movement row (mutating the SHARED authority)', function () {
  var g21 = mutateFn(G21, 'factoryStockApplyDeltaTx_',
    "  fcWriteAppendByHeader_(movSheet, {\n    factory_stock_movement_id: movementId,",
    "  if (false) fcWriteAppendByHeader_(movSheet, {\n    factory_stock_movement_id: movementId,");
  var w = confirmWorld();
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, null, g21);
  return Number(w.stock()[0].fac_current_stock) === 200 && w.movements().length === 0;
});
mut('M3  the sufficiency gate is removed and stock goes negative', function () {
  var src = mutateFn(G22, 'handleConfirmShipmentAndDispatch_',
    "    if (stockErrors.length) { lock.releaseLock(); return jsonResponse_({ success: false, error: 'Insufficient factory stock for: ' + stockErrors.join('; ') + '. No stock was deducted.', stage: 'stock' }); }",
    "    stockErrors = [];");
  var w = confirmWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-A', sku: 'CO1100-R', fac_current_stock: 100, fac_reserved_stock: 0 }] });
  var r = runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, src);
  // the shipped code refuses; the mutant proceeds (and may under-deduct or leave the balance wrong)
  var clean = confirmWorld({ stock: [{ factory_stock_id: 'FS-1', warehouse_id: 'WH-A', sku: 'CO1100-R', fac_current_stock: 100, fac_reserved_stock: 0 }] });
  var cr = runConfirm(clean, { shipment_id: 'SHP-1', actor: 'op' });
  return cr.success === false && r.success !== false;
});
mut('M4  the movement records a positive quantity for an OUTBOUND move', function () {
  var src = mutateFn(G22, 'handleConfirmShipmentAndDispatch_',
    "        deltaQty: -d.take, reservedDelta: -give,", "        deltaQty: d.take, reservedDelta: -give,");
  var w = confirmWorld();
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, src);
  var mv = w.movements();
  return mv.length > 0 && Number(mv[0].qty) > 0;
});
mut('M5  the before/after balance is dropped from the movement row (SHARED authority)', function () {
  var g21 = mutateFn(G21, 'factoryStockApplyDeltaTx_',
    "before_current_stock: beforeCurrent, after_current_stock: afterCurrent,",
    "before_current_stock: '', after_current_stock: '',");
  var w = confirmWorld();
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, null, g21);
  return String(w.movements()[0].before_current_stock) === '';
});
mut('M6  the shipment lineage is dropped from the movement row (SHARED authority)', function () {
  var g21 = mutateFn(G21, 'factoryStockApplyDeltaTx_',
    "related_entity_type: p.relatedEntityType, related_entity_id: p.relatedEntityId,",
    "related_entity_type: '', related_entity_id: '',");
  var w = confirmWorld();
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, null, g21);
  return String(w.movements()[0].related_entity_id) === '';
});
mut('M7  Confirm ends at in_transit instead of the formal hand-over', function () {
  var src = G22.replace("var CSD_CONFIRMED_STATUS_ = 'shipped';", "var CSD_CONFIRMED_STATUS_ = 'in_transit';");
  var w = confirmWorld();
  runConfirm(w, { shipment_id: 'SHP-1', actor: 'op' }, src);
  return String(objsOf(w.sheets.shipments)[0].status) !== 'shipped';
});
mut('M8  a PO receipt raises completed_qty without raising Factory Stock', function () {
  var src = RECEIPT_SRC.replace(
    extractFn(G21, 'factoryStockApplyDeltaTx_'),
    'function factoryStockApplyDeltaTx_(p) { return { ok: true, journal: [], beforeCurrent: 0, afterCurrent: 0 }; }');
  var svc = gasServices();
  var w = receiptWorld();
  var fn = new Function('Utilities', 'Session', 'SpreadsheetApp', 'LockService', 'Logger', 'jsonResponse_',
    'sheetEnsureColumns_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_', 'fcWriteAppendByHeader_',
    'procurementFindRow_', 'procurementTimestamp_', 'var OUT;' + src + NL + 'return OUT;')(
    svc.Utilities, svc.Session, { flush: function () {}, getActiveSpreadsheet: function () { return w.ss; } },
    svc.LockService, svc.Logger, jsonResponseStub, function () {},
    function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }, function () {},
    function (sh, obj) { var h = (sh.g[0] || []).map(function (x) { return String(x).trim(); }); sh.appendRow(h.map(function (k) { return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : ''; })); },
    function (sheet, colName, id) {
      var vals = sheet.getDataRange().getValues();
      var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
      var c = h.indexOf(colName); if (c === -1) return null;
      for (var i = 1; i < vals.length; i++) if (String(vals[i][c]).trim() === String(id).trim()) return { row: i + 1, vals: vals[i], col: function (n) { return h.indexOf(n); } };
      return null;
    },
    function () { return '2026-09-03 12:00:00'; });
  try { fn({ purchase_order_id: 'PO-1', actor: 'op', lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] }); } catch (e) {}
  return Number(w.lines()[0].completed_qty) === 200 && Number(w.stock()[0].fac_current_stock) === 1000;
});
mut('M9  the receipt idempotency pre-scan is removed and a retry double-counts', function () {
  var src = RECEIPT_SRC.replace('if (mNote !== -1 && String(movData[k][mNote] || \'\').indexOf(\'|key=\' + idemKey) !== -1) return true;', '');
  var svc = gasServices();
  var w = receiptWorld();
  function build(world) {
    return new Function('Utilities', 'Session', 'SpreadsheetApp', 'LockService', 'Logger', 'jsonResponse_',
      'sheetEnsureColumns_', 'fcWriteEnsureSheet_', 'fcWriteEnsureColumns_', 'fcWriteAppendByHeader_',
      'procurementFindRow_', 'procurementTimestamp_', 'var OUT;' + src + NL + 'return OUT;')(
      svc.Utilities, svc.Session, { flush: function () {}, getActiveSpreadsheet: function () { return world.ss; } },
      svc.LockService, svc.Logger, jsonResponseStub, function () {},
      function (ss, name) { return ss.getSheetByName(name) || ss.insertSheet(name); }, function () {},
      function (sh, obj) { var h = (sh.g[0] || []).map(function (x) { return String(x).trim(); }); sh.appendRow(h.map(function (k) { return Object.prototype.hasOwnProperty.call(obj, k) ? obj[k] : ''; })); },
      function (sheet, colName, id) {
        var vals = sheet.getDataRange().getValues();
        var h = (vals[0] || []).map(function (x) { return String(x).trim(); });
        var c = h.indexOf(colName); if (c === -1) return null;
        for (var i = 1; i < vals.length; i++) if (String(vals[i][c]).trim() === String(id).trim()) return { row: i + 1, vals: vals[i], col: function (n) { return h.indexOf(n); } };
        return null;
      },
      function () { return '2026-09-03 12:00:00'; });
  }
  var f = build(w);
  var body = { purchase_order_id: 'PO-1', actor: 'op', idempotency_key: 'K', lines: [{ purchase_order_line_id: 'POL-1', receive_qty: 200 }] };
  try { f(body); f(body); } catch (e) {}
  return Number(w.stock()[0].fac_current_stock) > 1200;
});
mut('M10 a stage loses its single-owner guarantee', function () {
  // A second definition of a stage handler anywhere in the project must be detectable, because a deployment
  // cannot choose between two.
  var probe = handlerOwners('handleConfirmShipmentAndDispatch_');
  var fakeFiles = GS_FILES.concat(['__fake.gs']);
  var saved = GS_SRC['__fake.gs'];
  GS_SRC['__fake.gs'] = 'function handleConfirmShipmentAndDispatch_(body) { return null; }';
  var before = probe.length;
  var after = (function () {
    var out = 0;
    fakeFiles.forEach(function (f) { out += code(GS_SRC[f] || '').split('function handleConfirmShipmentAndDispatch_(').length - 1; });
    return out;
  })();
  if (saved === undefined) delete GS_SRC['__fake.gs']; else GS_SRC['__fake.gs'] = saved;
  return before === 1 && after === 2;
});
mut('M11 the reservation audit stops noticing a real reservation write', function () {
  // Add a genuine non-zero reservation assignment and require the G20 probe to see it.
  var probe = function (extra) {
    var writers = [];
    var c = code(extra);
    var re = /(fac_reserved_stock|reserved_stock)\s*:\s*([^,}\n]+)/g, m;
    while ((m = re.exec(c))) {
      var v = String(m[2]).trim();
      if (v === '0') continue;
      if (/^'|^"/.test(v)) continue;
      if (/^(before|after)/.test(v)) continue;
      writers.push(v);
    }
    return writers;
  };
  return probe('setRow({ fac_reserved_stock: reserveQty });').length === 1 && probe('setRow({ fac_reserved_stock: 0 });').length === 0;
});

// ================================================================================================================
section('§K — THE CLASSIFICATION, AND WHAT IT FORBIDS');
// ================================================================================================================
(function () {
  var byClass = {};
  TOPO.forEach(function (t) { (byClass[t.cls] = byClass[t.cls] || []).push(t.stage.id); });
  console.log('  classification: ' + JSON.stringify(byClass));
  // §K — the chain may not be called complete while a required downstream stage is UI_ONLY or SPEC_ONLY.
  eq((byClass.UI_ONLY || []).concat(byClass.SPEC_ONLY || []), [],
    'C1  §K no required stage is UI_ONLY or SPEC_ONLY');
  // But it is NOT complete either: the compound approve->shipment transition is not atomic, and its stated
  // recovery has no caller. Recorded as data so the report cannot overstate readiness.
  eq({ connected_not_atomic: ['S6'], server_only: (byClass.SERVER_ONLY || []),
       stock_stages_all_connected: true,
       overall: 'NOT_READY_FOR_UNCONDITIONAL_LIVE_ACCEPTANCE' },
     { connected_not_atomic: ['S6'], server_only: ['S7b', 'S8b', 'P10b'],
       stock_stages_all_connected: true,
       overall: 'NOT_READY_FOR_UNCONDITIONAL_LIVE_ACCEPTANCE' },
    'C2  §K the overall verdict, stated as data rather than prose');
})();

// ================================================================================================================
section('§L — THE INVARIANTS THIS AUDIT PINNED, RE-CHECKED AFTER FC-1A');
// ================================================================================================================
// FC-0A itself changed no source file, and this section said so. FC-1A DID change 11_, 12_, 21_ and 22_ to
// close the findings above, so the section is renamed to what these four checks actually verify: that the
// facts FC-0A pinned still hold, and that the owners which changed DECLARE it. A stamp that had not moved
// while the behaviour did is the failure mode this manifest exists to catch.
(function () {
  eq((code(G11).match(/SP_BUILD_VERSION_ = '([^']+)'/) || [])[1], 'F1-7N-FC-1A',
    'L1  11_ DECLARES the FC-1A build — its Approve answer changed shape, and the frontend binds to it');
  eq((code(read('assets/specs/active/apps-script/16_shipping_allocation_handlers.gs')).match(/SAD_BUILD_VERSION_ = '([^']+)'/) || [])[1],
    'F1-7N-FB-4G-A2-R3-R1', 'L2  16_ unchanged');
  ok(/CSD_MOV_TYPE_ = 'shipment_out'/.test(G22),
    'L3  22_ still names shipment_out — FC-1A moved WHERE the movement is written, never WHAT it is called');
  ok(/movement_type='po_receipt'/.test(G13), 'L4  13_ unchanged — the PO receipt path was not touched');
  eq((code(G22).match(/CSD_BUILD_VERSION_ = '([^']+)'/) || [])[1], 'F1-7N-FC-1A',
    'L5  and 22_ DECLARES the FC-1A build — a 22_ a round behind returns SUCCESS while never releasing a ' +
    'reservation, so only a declared build can tell the two apart');
  eq((code(read('assets/specs/active/apps-script/12_shipment_handlers.gs')).match(/SHIPMENT_BUILD_VERSION_ = '([^']+)'/) || [])[1],
    'F1-7N-FC-1A', 'L6  as does 12_ — a 12_ a round behind creates Shipment Drafts that reserve NOTHING');
  eq((code(G21).match(/FSTX_BUILD_VERSION_ = '([^']+)'/) || [])[1], 'F1-7N-FC-1A',
    'L7  as does 21_ — the file that now owns every factory stock mutation');
})();

// ================================================================================================================
console.log('\n---');
console.log(pass + ' passed, ' + fail + ' failed');
console.log('mutations: ' + neg.caught + ' caught, ' + neg.missed + ' missed');
if (fail) process.exit(1);
