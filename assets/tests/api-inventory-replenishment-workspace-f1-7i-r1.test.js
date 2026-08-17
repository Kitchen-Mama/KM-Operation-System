// Kitchen Mama Operation System — F1-7I-INVENTORY-REPLENISHMENT-WORKSPACE-AND-CUTOVER-R1
// Proves the scoped Inventory Replenishment workspace + primary-render cutover WITHOUT changing business output:
//   - backend 60_ reads ONLY the 19 primary-render tables; never getOperationDb; raw passthrough (client assembly
//     unchanged); non-silent `capped`; authors NO Gap/Recommendation/allocation/FIFO/PO and creates NO Request Order;
//   - the db-api adapter maps each table through the SAME normalizer + per-array filter as normalizeOperationDb, KEYED
//     BY GETTER NAME, so the page's get(name) choke point returns byte-identical arrays to the legacy getters;
//   - inventoryReplenishment activated CANONICAL (the LAST registered-only workspace → 0 remaining); router dispatch;
//     the page sources its primary read from the workspace (get() consults the read-model; _replenActiveMarketplaces
//     routes), fail-closed, scoped post-write; FLOW-A guard: no Request Order / Order Planning Gap / AI Plan; the
//     incoming reconstruction + Gap/Recommendation/allocation-draft owners are unchanged.
// Run: node assets/tests/api-inventory-replenishment-workspace-f1-7i-r1.test.js
// NOTE: no 'use strict' — extracted pure builders + browser fns are eval'd into module scope.

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
function extractAssignedFn(src, marker) {
  var i = src.indexOf(marker); if (i < 0) throw new Error('not found: ' + marker);
  var k = src.indexOf('{', i), depth = 0;
  for (; k < src.length; k++) { if (src[k] === '{') depth++; else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); } }
  throw new Error('unbalanced: ' + marker);
}

var GS60 = read('specs/active/apps-script/60_api_v1_inventory_replenishment_workspace.gs');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var FND = read('js/api/km-api-foundation.js');
var DBAPI = read('js/api/operation-system-db-api.js');
var IR_JS = read('js/pages/inventory-replenishment.js');

var window = { KM: { DB: {} } };
var _irReadModel = null;

// eval the WHOLE 60_ (pure builders + impure orchestrator; prod helpers referenced only inside the default io)
eval(GS60);
// eval the shared db-api helpers the normalizers depend on (code-display chain; var objects re-declared).
eval([extractFn(DBAPI, '_invPick'), extractFn(DBAPI, '_whBool'), extractFn(DBAPI, '_fcParseEventPeriodDates'),
      extractAssignedFn(DBAPI, 'var CUSTOMS_TYPE_LABELS_ =') + ';',
      extractFn(DBAPI, 'customsTypeLabelFallback_'), extractFn(DBAPI, '_codeHumanize_'),
      extractAssignedFn(DBAPI, 'var codeDisplay_ =') + ';'].join('\n'));
// eval ALL 19 db-api normalizers the adapter runs (BEFORE == AFTER end-to-end).
eval(['normalizeMarketplaceRecord', 'normalizeMarketplaceSkuRecord', 'normalizeSkuDetailsRecord', 'normalizeWarehouseRecord',
      'normalizeAmazonInventorySnapshotRecord', 'normalizeAmazonInventoryHealthSnapshotRecord', 'normalizeAmazonDailySalesSnapshotRecord',
      'normalizeAmazonWeeklySalesSnapshotRecord', 'normalizeFcRegularForecastRecord', 'normalizeFcTargetRuleRecord', 'normalizeFcSpecialEventRecord',
      'normalizeOverseasInventorySnapshotRecord', 'normalizeFactoryStockRecord', 'normalizeShipmentRecord', 'normalizeShipmentLineRecord',
      'normalizeShippingPlanRecord', 'normalizeShippingPlanLineRecord', 'normalizeShippingAllocationDraftRecord', 'normalizeShippingAllocationDraftLineRecord']
  .map(function (n) { return extractFn(DBAPI, n); }).join('\n'));
// eval the ACTUAL adapter (assigns window.KM.DB.adaptInventoryReplenishmentWorkspace)
eval(extractAssignedFn(DBAPI, 'window.KM.DB.adaptInventoryReplenishmentWorkspace = function') + ';');
// eval the frontend read-model accessor + the filter helper (both consult _irReadModel)
eval([extractFn(IR_JS, '_irWsGet'), extractFn(IR_JS, '_replenActiveMarketplaces')].join('\n'));

// -------------------------------------------------------------------------------------------------------------------
// Fixture — raw sheet rows. A JUNK row in the filtered tables proves filter parity.
// -------------------------------------------------------------------------------------------------------------------
var rawTables = {
  marketplaces: [{ marketplace_id: 'MK-KM-US', company: 'KM', country: 'US', marketplace: 'amazon_us', marketplace_display_name: 'Amazon US', status: 'active' },
                 { marketplace_id: 'MK-RESTW-TW', company: 'ResTW', country: 'TW', marketplace: 'shopee_tw', status: 'active' }, {}],
  marketplace_skus: [{ marketplace_sku_id: 'M1', sku: 'GA0450', company: 'KM', country: 'US', marketplace: 'amazon_us', marketplace_id: 'MK-KM-US' }, { sku: '' }],
  sku_details: [{ sku: 'GA0450', product_name: 'Can Opener', category: 'Kitchen', series: 'Pro', lifecycle: 'Running in the Market' }, { sku: '' }],
  warehouses: [{ warehouse_id: 'WH-US-3PL', country: 'US', warehouse_type: '3PL', is_active: 'TRUE', is_factory_warehouse: 'FALSE' },
               { warehouse_id: 'WH-CN-FAC', country: 'CN', is_factory_warehouse: 'TRUE' }, {}],
  amazon_inventory_snapshot: [{ sku: 'GA0450', company: 'KM', country: 'US', marketplace: 'amazon_us', available_qty: 100, fc_transfer_qty: 10, fc_processing_qty: 5, snapshot_date: '2026-08-10' }, { sku: '' }],
  amazon_inventory_health_snapshot: [{ sku: 'GA0450', country: 'US' }, { sku: '' }],
  amazon_daily_sales_snapshot: [{ sku: 'GA0450', country: 'US' }, { sku: '' }],
  amazon_weekly_sales_snapshot: [{ sku: 'GA0450', country: 'US' }, { sku: '' }],
  fc_regular_forecast: [{ forecast_id: 'FC1', sku: 'GA0450', year: '2026', company: 'KM', country: 'US', marketplace: 'amazon_us' }, { forecast_id: '', sku: '' }],
  fc_target_rules: [{ target_rule_id: 'T1', scope_type: 'Category', scope_id: 'Kitchen', year: '2026' }, { target_rule_id: '', scope_id: '' }],
  fc_special_events: [{ event_fc_id: 'E1', campaign_id: 'C1', sku: 'GA0450', event: 'Prime Day', fc_qty: 50 }, { event: '', sku: '', scope_id: '' }],
  overseas_inventory_snapshot: [{ warehouse_id: 'WH-US-3PL', sku: 'GA0450', available_stock: 40 }, { warehouse_id: '', sku: '' }],
  factory_stock: [{ factory_stock_id: 'FS1', warehouse_id: 'WH-CN-FAC', sku: 'GA0450', current_stock: 1200 }, { factory_stock_id: '', sku: '' }],
  shipments: [{ shipment_id: 'SH-1', company: 'KM', country: 'US', marketplace: 'amazon_us', status: 'in_transit', eta: '2026-08-25' }, { shipment_id: '' }],
  shipment_lines: [{ shipment_line_id: 'SL-1', shipment_id: 'SH-1', sku: 'GA0450', shipment_qty: 300, shipment_received_qty: 100, shipping_plan_line_id: 'SPL-1' }, { shipment_line_id: '', shipment_id: '' }],
  shipping_plans: [{ shipping_plan_id: 'SP-1', company: 'KM', country: 'US', marketplace: 'amazon_us' }, { shipping_plan_id: '' }],
  shipping_plan_lines: [{ shipping_plan_line_id: 'SPL-1', shipping_plan_id: 'SP-1', sku: 'GA0450' }, { shipping_plan_line_id: '', shipping_plan_id: '' }],
  shipping_allocation_drafts: [{ allocation_draft_id: 'AD-1', company: 'KM', country: 'US', marketplace: 'amazon_us' }, { allocation_draft_id: '' }],
  shipping_allocation_draft_lines: [{ allocation_draft_line_id: 'ADL-1', allocation_draft_id: 'AD-1', sku: 'GA0450' }, { allocation_draft_line_id: '', allocation_draft_id: '' }]
};

// -------------------------------------------------------------------------------------------------------------------
console.log('\n== sirWorkspaceBuild_ View-Model: raw passthrough of all 19 tables ==');
var vm = sirWorkspaceBuild_(rawTables, {});
ok(vm.marketplaces.length === 3 && vm.sku_details.length === 2 && vm.factory_stock.length === 2, 'raw passthrough keeps ALL rows (adapter filters, not the builder)');
ok(vm.shipments[0].shipment_id === 'SH-1' && vm.shipment_lines[0].shipment_received_qty === 100, 'rows are RAW (unmodified; shipment_received_qty verbatim — no MAX(0,..) in the workspace)');
eq(Object.keys(vm.counts).length, 19, 'counts cover all 19 tables');
ok(vm.capped.amazon_inventory_snapshot === false && vm.summary.factory_stock === 2, 'nothing capped; summary reflects raw totals');
ok(sirWorkspaceBuild_(rawTables, { include: { summary: false } }).summary === null, 'include.summary:false → summary omitted');
var vmEmpty = sirWorkspaceBuild_({}, {});
ok(vmEmpty.marketplaces.length === 0 && vmEmpty.shipments.length === 0, 'empty tables → 0 rows (EMPTY ≠ ERROR)');

console.log('\n== orchestrator reads all 19 tables (io injection) ==');
var readNames = [];
var mockIo = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { return {}; }, readTable: function (ss, name) { readNames.push(name); return rawTables[name] || []; } };
var env = handleInventoryReplenishmentWorkspaceGet_({ payload: {} }, mockIo);
ok(readNames.length === 19 && readNames.indexOf('shipments') >= 0 && readNames.indexOf('shipping_allocation_draft_lines') >= 0, 'orchestrator reads exactly the 19 primary tables');
ok(env.success === true && env.data && env.meta.workspace === 'inventoryReplenishment', 'orchestrator success envelope (workspace=inventoryReplenishment)');

console.log('\n== non-silent cap backstop (SIR_WS_ROW_MAX_) ==');
var big = []; for (var i = 0; i < 80001; i++) big.push({ sku: 'S' + i });
var capd = sirCap_(big);
ok(capd.capped === true && capd.rows.length === 80000 && capd.total === 80001, 'sirCap_ truncates at 80000 and REPORTS capped=true + true total (never silent)');

console.log('\n== db-api adapter == legacy getters (BEFORE == AFTER via SAME normalizers + SAME filters), keyed by getter name ==');
var adapted = window.KM.DB.adaptInventoryReplenishmentWorkspace(vm);
// end-to-end equivalence for the inventory/stock facts + masters (self-contained normalizers)
eq(adapted.getMarketplaces, rawTables.marketplaces.map(normalizeMarketplaceRecord).filter(function (r) { return r.marketplaceId || r.marketplace; }), 'getMarketplaces === legacy');
eq(adapted.getMarketplaceSkus, rawTables.marketplace_skus.map(normalizeMarketplaceSkuRecord).filter(function (r) { return r.sku; }), 'getMarketplaceSkus === legacy (junk dropped)');
eq(adapted.getAmazonInventorySnapshot, rawTables.amazon_inventory_snapshot.map(normalizeAmazonInventorySnapshotRecord).filter(function (r) { return r.sku; }), 'getAmazonInventorySnapshot === legacy (site stock fact)');
eq(adapted.getOverseasInventorySnapshot, rawTables.overseas_inventory_snapshot.map(normalizeOverseasInventorySnapshotRecord).filter(function (r) { return r.warehouseId && r.sku; }), 'getOverseasInventorySnapshot === legacy (3PL fact)');
eq(adapted.getFactoryStock, rawTables.factory_stock.map(normalizeFactoryStockRecord).filter(function (r) { return r.factoryStockId || r.sku; }), 'getFactoryStock === legacy (shared-factory raw pool)');
eq(adapted.getSkuDetails, rawTables.sku_details.map(normalizeSkuDetailsRecord).filter(function (r) { return r.sku; }), 'getSkuDetails === legacy');
eq(adapted.getWarehouses, rawTables.warehouses.map(normalizeWarehouseRecord).filter(function (r) { return r.warehouseId || r.warehouseName; }), 'getWarehouses === legacy');
eq(adapted.getFcRegularForecast, rawTables.fc_regular_forecast.map(normalizeFcRegularForecastRecord).filter(function (r) { return r.forecastId || r.sku; }), 'getFcRegularForecast === legacy');
eq(adapted.getShippingAllocationDrafts, rawTables.shipping_allocation_drafts.map(normalizeShippingAllocationDraftRecord).filter(function (r) { return r.allocationDraftId; }), 'getShippingAllocationDrafts === legacy');
ok(adapted.getFactoryStock[0].raw && adapted.getFactoryStock[0].raw.current_stock === 1200, 'factory raw pool passthrough preserves .raw (shared factory; company not inferred)');
// full wiring proof: the adapter maps all 19 table→getter pairs with the SAME filters normalizeOperationDb uses
var adSrc = extractAssignedFn(DBAPI, 'window.KM.DB.adaptInventoryReplenishmentWorkspace = function');
['getMarketplaces', 'getMarketplaceSkus', 'getSkuDetails', 'getWarehouses', 'getAmazonInventorySnapshot', 'getAmazonInventoryHealthSnapshot',
 'getAmazonDailySalesSnapshot', 'getAmazonWeeklySalesSnapshot', 'getFcRegularForecast', 'getFcTargetRules', 'getFcSpecialEvents',
 'getOverseasInventorySnapshot', 'getFactoryStock', 'getShipments', 'getShipmentLines', 'getShippingPlans', 'getShippingPlanLines',
 'getShippingAllocationDrafts', 'getShippingAllocationDraftLines'].forEach(function (g) { ok(adSrc.indexOf(g + ':') >= 0, 'adapter wires ' + g); });
ok(/normalizeShipmentRecord\).filter\(function\(r\) \{ return r\.shipmentId; \}\)/.test(adSrc) && /normalizeShipmentLineRecord\).filter\(function\(r\) \{ return r\.shipmentLineId \|\| r\.shipmentId; \}\)/.test(adSrc), 'shipment/shipment_lines wired with the SAME filters as normalizeOperationDb (incoming raw rows)');

console.log('\n== frontend read-model routing (get()/_replenActiveMarketplaces swap source) ==');
_irReadModel = null;
window.KM.DB.getMarketplaces = function () { return [{ marketplaceId: 'L', marketplace: 'legacy', status: 'active' }]; };
window.KM.DB.getShipments = function () { return [{ shipmentId: 'LEG' }]; };
ok(_irWsGet('getShipments')[0].shipmentId === 'LEG', 'Legacy: _irWsGet reads the broad-cache getter');
ok(_replenActiveMarketplaces()[0].marketplace === 'legacy', 'Legacy: _replenActiveMarketplaces reads getMarketplaces');
_irReadModel = adapted;
window.KM.DB.getShipments = function () { throw new Error('primary path must not hit the broad-cache getter in Workspace mode'); };
window.KM.DB.getMarketplaces = function () { throw new Error('no getter'); };
ok(_irWsGet('getShipments') === adapted.getShipments, 'Workspace: _irWsGet reads the scoped read-model (not the getter)');
ok(_replenActiveMarketplaces().length === adapted.getMarketplaces.filter(function (m) { var s = (m.status || '').toLowerCase(); return !s || s === 'active'; }).length, 'Workspace: _replenActiveMarketplaces reads the read-model');
// the local get() choke point inside _getCloudReplenishmentData consults _irReadModel
ok(/function get\(name\) \{ if \(_irReadModel\) return _irReadModel\[name\] \|\| \[\]; return \(DB\[name\]\)/.test(IR_JS), 'the main-assembly get() choke point consults the scoped read-model first');

console.log('\n== source guards: 60_ read-only, no getOperationDb, no Gap/Reco/allocation/FIFO/PO/Request-Order ==');
var code60 = GS60.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(!/getOperationDb/.test(code60), '60_ never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code60), '60_ writes nothing (read-only)');
// precise logic tokens (the table-name strings 'shipping_allocation_drafts'/'recommendation.workspace.get' in the header
// are prose/data, not logic — so guard on computation tokens, and confirm on comment-stripped code).
ok(!/MAX\(0|calculateGap|slaFifoCompare|generateShippingAllocation|ensureFactoryStockBaseline|fac_current_stock\s*=|shipped_qty\s*[-=]|qualifiedIncoming/i.test(code60), '60_ runs NO incoming MAX(0,..)/Gap/FIFO/allocation-compute/factory-init/PO logic');
ok(!/createRequestOrder|requestOrderDraft|createPurchaseOrder|order_planning_gap|aiPlanFirstLayer/i.test(code60), '60_ FLOW-A: never creates Request Order / Purchase Order / Order-Planning-Gap / AI Plan');
ok(/action === 'inventoryReplenishment\.workspace\.get'/.test(ROUTER) && /handleInventoryReplenishmentWorkspaceGet_\(body\)/.test(ROUTER), 'router dispatches inventoryReplenishment.workspace.get');

console.log('\n== activation + registration + LAST registered-only workspace ==');
ok(/WORKSPACE_CANONICAL = \{[^}]*inventoryReplenishment: true/.test(FND), 'inventoryReplenishment is CANONICAL');
ok(/WORKSPACE_ENABLED_DEFAULT = \{[^}]*inventoryReplenishment: true/.test(FND), 'inventoryReplenishment per-workspace flag defaults ON');
ok(/register\('inventoryReplenishment', \{[^}]*status: WORKSPACE_STATUS\.IMPLEMENTED, resolver: inventoryReplenishmentResolver/.test(FND), 'inventoryReplenishment registered IMPLEMENTED with resolver');
ok(/KM\.DB\.adaptInventoryReplenishmentWorkspace = function/.test(DBAPI), 'db-api exposes adaptInventoryReplenishmentWorkspace');

console.log('\n== page: workspace primary read, no broad DB in the primary path, fail-closed, Flow-A, scoped post-write ==');
ok(/workspaceApiActive\('inventoryReplenishment'\)/.test(IR_JS), 'page: gates on canonical inventoryReplenishment workspace');
ok(/getWorkspace\('inventoryReplenishment'/.test(IR_JS) && /adaptInventoryReplenishmentWorkspace/.test(IR_JS), 'page: primary read via scoped workspace + adapter');
var refresh = extractFn(IR_JS, '_irWorkspaceRefresh_');
ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(refresh), 'page: the scoped read path has NO getOperationDb/loadOperationDb/_opDbCache');
var search = extractFn(IR_JS, 'searchReplenishment');
ok(search.indexOf('_irEffectiveWorkspace') >= 0 && search.indexOf('loadOperationDb') > search.indexOf('Legacy'), 'page: the search broad load lives ONLY in the Legacy branch (no silent fallback in Workspace mode)');
ok(/INVENTORY_REPLENISHMENT_READ_FAILED|WORKSPACE_UNAVAILABLE/.test(IR_JS), 'page: fail-closed bounded read error');
ok(/KM\.loadState\.createRegion/.test(IR_JS), 'page: reuses KM.loadState');
ok(/function _irAfterWrite/.test(IR_JS) && (IR_JS.match(/_irAfterWrite\(/g) || []).length >= 3, 'page: scoped post-write refresh wired into the SKU writes (Add x2 + Edit)');
// FLOW-A regression guard: the whole page never creates procurement demand from replenishment
ok(!/createRequestOrder|requestOrderDraft|createPurchaseOrderFromRequest|aiPlanFirstLayer\.get|orderPlanningGap\.get/.test(IR_JS), 'FLOW-A: the page invokes NO Request Order / Order Planning Gap / AI Plan ordering (Gap → Reco → Shipping Plan → Shipment)');
ok(/createShippingPlansBatch/.test(IR_JS), 'downstream execution = createShippingPlansBatch (Weekly Shipping Plan runtime), not Request Order');
// existing scoped owners for Gap / Recommendation / allocation-draft are UNCHANGED (not duplicated by the workspace)
ok(/inventoryReplenishmentGap\.get|getInventoryReplenishmentGap/.test(IR_JS), 'Inventory Gap stays on inventoryReplenishmentGap.get (canonical, unchanged)');
ok(/getWorkspace\('recommendation'/.test(IR_JS), 'Recommendation stays on recommendation.workspace.get (unchanged)');
ok(/getShippingAllocationDraftWorkspace/.test(IR_JS), 'allocation-draft SSOT stays on getShippingAllocationDraftWorkspace (unchanged)');
// incoming reconstruction UNCHANGED (deferred INCOMING_INVENTORY_AUTHORITY_REDESIGN_REQUIRED)
ok(/_irBuildShipmentRemainingByReceiver/.test(IR_JS) && /MAX\(0/.test(IR_JS.replace(/\/\/[^\n]*/g, '')) === false, 'incoming reconstruction retained (presentation-side); no new backend incoming authority added this round');

console.log('\n----------------------------------------');
console.log('API INVENTORY REPLENISHMENT WORKSPACE (F1-7I-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
