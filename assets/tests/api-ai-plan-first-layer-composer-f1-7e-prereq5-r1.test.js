// Kitchen Mama Operation System — F1-7E-PREREQ-5-AI-PLAN-FIRST-LAYER-COMPOSER-AND-CUTOVER-R1
// MASTER GOLD-STANDARD equivalence: the NEW backend composer 56_ aplBuild_ MUST produce rows byte-identical to the
// CURRENT AI-Plan first-layer builder — request-order.js _buildRequestOrderRowsFromDb() — for the same data & frozen
// planning cycle. We run the ACTUAL browser builder (extracted; window.KM.DB stubbed with the ACTUAL db-api normalizers;
// _roTpeNow frozen == planning_cycle) and the ACTUAL backend composer (reusing 52_/53_/54_/55_ pure helpers) over the raw
// rows, and compare EVERY user-visible Layer-1 + identity field. Transport migration: BEFORE FACT == AFTER FACT.
// Run: node assets/tests/api-ai-plan-first-layer-composer-f1-7e-prereq5-r1.test.js
// NOTE: no 'use strict' — extracted functions bind into module scope via direct eval.

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
function extractVar(src, re) { var m = src.match(re); if (!m) throw new Error('var not found: ' + re); return m[0]; }

var DBAPI = read('js/api/operation-system-db-api.js');
var ROJS = read('js/pages/request-order.js');
var ROUTER = read('specs/active/apps-script/01_router.gs');
var GS56 = read('specs/active/apps-script/56_api_v1_ai_plan_first_layer.gs');

// ---- eval the reused Layer-1 owners (52_/53_/54_/55_) + the composer (56_). Distinct prefixes -> no collision. ----
eval(read('specs/active/apps-script/52_api_v1_open_po_remaining_owner.gs'));
eval(read('specs/active/apps-script/53_api_v1_fc_summary_raw_owner.gs'));
eval(read('specs/active/apps-script/54_api_v1_raw_inventory_owner.gs'));
eval(read('specs/active/apps-script/55_api_v1_lead_time_owner.gs'));
eval(GS56);

// ---- eval the REAL db-api normalizers (the browser's input path) — concatenate + eval ONCE at MODULE scope ----
var _dbFns = ['_invPick', '_whBool', '_fcParseEventPeriodDates',
  'normalizeMarketplaceSkuRecord', 'normalizeSkuDetailsRecord', 'normalizeFcRegularForecastRecord',
  'normalizeFcSpecialEventRecord', 'normalizeAmazonInventorySnapshotRecord', 'normalizeOverseasInventorySnapshotRecord',
  'normalizeFactoryStockRecord', 'normalizeWarehouseRecord', 'normalizePurchaseOrderRecord',
  'normalizePurchaseOrderLineRecord', 'normalizeSupplierPriceListRecord'
].map(function (n) { return extractFn(DBAPI, n); });
eval(_dbFns.join('\n'));

// ---- eval the REAL browser first-layer builder + its module-level helpers (concatenate + eval ONCE at MODULE scope) ----
var window = { KM: { DB: {} } };   // stubbed getters per fixture; _buildRequestOrderRowsFromDb does `var DB = window.KM.DB`
var _roTpeNow, _roUseDb;           // frozen per fixture
var _roSrc = [
  extractVar(ROJS, /var RO_MONTH_KEYS = \[[^\]]*\];/),
  extractVar(ROJS, /var _RO_EVT_DEAD_SET = \{[^}]*\};/),
  extractVar(ROJS, /var RO_OPEN_PO_STATUS = \{[^}]*\};/)
].concat(['_roUpper', '_roLower', '_roIsActiveFlag', '_roMonthWindow', '_roNextMonths', '_roYmKey', '_roParseDate',
  '_roEventPrepMonth', '_roEventScopeMatch', '_roScopedActiveEvents', '_roSpecialEventsTotal', '_buildRequestOrderRowsFromDb'
].map(function (n) { return extractFn(ROJS, n); }));
eval(_roSrc.join('\n'));

function cycleToNow(cycle) { var m = cycle.match(/^RECO-(\d{4})-(\d{2})$/); return { year: parseInt(m[1], 10), monthIdx: parseInt(m[2], 10) - 1, day: 15 }; }
var FIELDS = ['sku', 'country', 'marketplace', 'marketplaceId', 'category', 'series', 'company', 'basicFcT3', 'specialEventsFc',
  'siteStock', 'thirdPartyStock', 'factoryStock', 'totalOngoingOrders', 'leadTime', 'boxSize', '_dbPlaceholder', 'risk', 'remaining', 'suggestedOrder'];

// The master harness: OLD browser _buildRequestOrderRowsFromDb() vs NEW composer aplBuild_(), on the SAME raw fixture.
function runEquiv(label, cycle, raw) {
  _roTpeNow = function () { return cycleToNow(cycle); };
  _roUseDb = function () { return true; };
  window.KM.DB = {
    getMarketplaceSkus: function () { return (raw.marketplace_skus || []).map(normalizeMarketplaceSkuRecord); },
    getSkuDetails: function () { return (raw.sku_details || []).map(normalizeSkuDetailsRecord); },
    getFcRegularForecast: function () { return (raw.fc_regular_forecast || []).map(normalizeFcRegularForecastRecord); },
    getFcSpecialEvents: function () { return (raw.fc_special_events || []).map(normalizeFcSpecialEventRecord); },
    getAmazonInventorySnapshot: function () { return (raw.amazon_inventory_snapshot || []).map(normalizeAmazonInventorySnapshotRecord); },
    getOverseasInventorySnapshot: function () { return (raw.overseas_inventory_snapshot || []).map(normalizeOverseasInventorySnapshotRecord); },
    getWarehouses: function () { return (raw.warehouses || []).map(normalizeWarehouseRecord); },
    getFactoryStock: function () { return (raw.factory_stock || []).map(normalizeFactoryStockRecord); },
    getPurchaseOrders: function () { return (raw.purchase_orders || []).map(normalizePurchaseOrderRecord); },
    getPurchaseOrderLines: function () { return (raw.purchase_order_lines || []).map(normalizePurchaseOrderLineRecord); },
    getSupplierPriceList: function () { return (raw.supplier_price_list || []).map(normalizeSupplierPriceListRecord); }
  };
  var OLD = _buildRequestOrderRowsFromDb();
  var NEW = aplBuild_(raw, { planning_cycle: cycle }).rows;
  eq(NEW.length, OLD.length, label + ' :: row count');
  for (var i = 0; i < OLD.length; i++) {
    var o = OLD[i], n = NEW[i] || {};
    var tag = label + ' :: row ' + i + ' [' + o.sku + '/' + o.country + '/' + o.marketplace + '/' + o.company + '] ';
    for (var f = 0; f < FIELDS.length; f++) { eq(n[FIELDS[f]], o[FIELDS[f]], tag + FIELDS[f]); }
  }
  return NEW;
}

// ---------- big multi-scenario fixture (KM/ResTW/ResUS, shared factory, all fact types, null vs zero) ----------
// planning_cycle RECO-2026-08 -> window Sep/Oct/Nov 2026.
console.log('\n== MASTER fixture: KM/ResTW/ResUS, shared factory, all facts, null-vs-zero ==');
var MASTER = {
  marketplace_skus: [
    { sku: 'CO1100-R', country: 'US', marketplace: 'amazon', marketplace_id: 'MKT-US-AMZ-KM', company: 'KM' },   // regular+special+site+overseas+factory+PO+lead
    { sku: 'CO1100-R', country: 'CA', marketplace: 'amazon', marketplace_id: 'MKT-CA-AMZ-KM', company: 'KM' },   // different site: forecast/site null; factory/PO shared
    { sku: 'GA0450', country: 'US', marketplace: 'amazon', marketplace_id: 'MKT-US-AMZ-RESTW', company: 'ResTW' }, // shared factory pool with GA0450 across companies
    { sku: 'GA0450', country: 'US', marketplace: 'amazon', marketplace_id: 'MKT-US-AMZ-RESUS', company: 'ResUS' }, // same sku/site, different company (special company filter)
    { sku: 'ZEROFC', country: 'US', marketplace: 'amazon', marketplace_id: 'MKT-Z', company: 'KM' },              // fc rows present but all 0 -> basicFcT3 == 0 (NOT null)
    { sku: 'NODATA', country: 'US', marketplace: 'amazon', marketplace_id: 'MKT-N', company: 'KM' }               // nothing -> all null / factory 0
  ],
  sku_details: [
    { sku: 'CO1100-R', category: 'Can Opener', series: 'CO1100', units_per_carton: 24 },
    { sku: 'GA0450', category: 'Kitchen', series: 'GA', units_per_carton: 12 },
    { sku: 'ZEROFC', category: 'Test', series: 'ZZ', units_per_carton: 6 }
    // NODATA absent from sku_details -> category/series '' , boxSize 0
  ],
  fc_regular_forecast: [
    { sku: 'CO1100-R', country: 'US', marketplace: 'amazon', year: 2026, sep: 100, oct: 200, nov: 50 },   // basic 350
    { sku: 'GA0450', country: 'US', marketplace: 'amazon', year: 2026, sep: 10, oct: 0, nov: 5 },          // basic 15
    { sku: 'ZEROFC', country: 'US', marketplace: 'amazon', year: 2026, sep: 0, oct: 0, nov: 0 }            // basic 0 (rows present)
  ],
  fc_special_events: [
    { sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'amazon', event_start_date: '2026-10-01', fc_qty: 500, status: 'active' }, // prep 2026-09 in window -> 500
    { sku: 'GA0450', company: 'ResUS', country: 'US', marketplace: 'amazon', event_start_date: '2026-10-01', fc_qty: 40, status: 'active' }   // only ResUS -> ResTW row special null; ResUS 40
  ],
  amazon_inventory_snapshot: [
    { snapshot_date: '2026-08-01', sku: 'CO1100-R', country: 'US', marketplace: 'amazon', available_qty: 5, fc_transfer_qty: 1, fc_processing_qty: 0 },
    { snapshot_date: '2026-08-10', sku: 'CO1100-R', country: 'US', marketplace: 'amazon', available_qty: 10, fc_transfer_qty: 0, fc_processing_qty: 0 }, // latest -> 10
    { snapshot_date: '2026-08-10', sku: 'GA0450', country: 'US', marketplace: 'amazon', available_qty: 0, fc_transfer_qty: 0, fc_processing_qty: 0 }     // site 0 (row matches) -> 0 NOT null
  ],
  overseas_inventory_snapshot: [
    { sku: 'CO1100-R', warehouse_id: 'WH-US-1', available_stock: 100 },
    { sku: 'CO1100-R', warehouse_id: 'WH-US-2', available_stock: 30 }   // pooled -> 130 (US); CA row: no country match -> null
  ],
  warehouses: [
    { warehouse_id: 'WH-US-1', country: 'US', is_factory_warehouse: 'false' },
    { warehouse_id: 'WH-US-2', country: 'US', is_factory_warehouse: '' },
    { warehouse_id: 'FAC-A', country: 'CN', is_factory_warehouse: 'true' }
  ],
  factory_stock: [
    { sku: 'CO1100-R', warehouse_id: 'FAC-A', company: 'KM', fac_current_stock: 200 },
    { sku: 'GA0450', warehouse_id: 'FAC-A', company: 'KM', fac_current_stock: 700 },
    { sku: 'GA0450', warehouse_id: 'FAC-A', company: 'ResTW', fac_current_stock: 300 }   // shared pool GA0450 = 1000 for both ResTW & ResUS rows
  ],
  purchase_orders: [
    { purchase_order_id: 'PO-1', order_status: 'in_production' },
    { purchase_order_id: 'PO-2', order_status: 'completed' }   // closed -> excluded
  ],
  purchase_order_lines: [
    { purchase_order_id: 'PO-1', sku: 'CO1100-R', ordered_qty: 500, completed_qty: 300, shipped_qty: 100, remaining_qty: 200 }, // persisted 200
    { purchase_order_id: 'PO-1', sku: 'GA0450', ordered_qty: 200, completed_qty: 150, shipped_qty: 40, remaining_qty: '' },      // fallback max(0,200-max(40,150))=50
    { purchase_order_id: 'PO-2', sku: 'CO1100-R', ordered_qty: 900, completed_qty: 0, shipped_qty: 0, remaining_qty: 900 }       // closed PO -> excluded
  ],
  supplier_price_list: [
    { sku: 'CO1100-R', is_active: 'active', effective_from: '2026-01-01', lead_time_days: 45 },
    { sku: 'GA0450', is_active: 'inactive', effective_from: '2026-06-01', lead_time_days: 30 }   // no active -> leadTime null
  ]
};
runEquiv('MASTER', 'RECO-2026-08', MASTER);

// ---------- year-crossing cycle (RECO-2026-11 -> Dec 2026 / Jan / Feb 2027) ----------
console.log('\n== year-crossing planning cycle ==');
runEquiv('year-cross', 'RECO-2026-11', {
  marketplace_skus: [{ sku: 'YC', country: 'US', marketplace: 'amazon', marketplace_id: 'M', company: 'KM' }],
  sku_details: [{ sku: 'YC', category: 'C', series: 'S', units_per_carton: 8 }],
  fc_regular_forecast: [
    { sku: 'YC', country: 'US', marketplace: 'amazon', year: 2026, dec: 11 },
    { sku: 'YC', country: 'US', marketplace: 'amazon', year: 2027, jan: 3, feb: 5 }
  ],
  fc_special_events: [{ sku: 'YC', company: 'KM', country: 'US', marketplace: 'amazon', event_start_date: '2027-01-15', fc_qty: 70, status: 'active' }] // prep 2026-12 in window
});

// ---------- empty result ----------
console.log('\n== empty result ==');
runEquiv('empty', 'RECO-2026-08', { marketplace_skus: [] });

// ---------- composer envelope + planning_cycle authority + API error ----------
console.log('\n== composer envelope + cycle authority + error != empty ==');
var eio = { now: function () { return 0; }, nextSeq: function () { return 1; }, openTarget: function () { return {}; },
  readTable: function (ss, name) { return MASTER[name] || []; } };
var envOk = handleAiPlanFirstLayerGet_({ payload: { planning_cycle: 'RECO-2026-08' } }, eio);
ok(envOk.success === true && envOk.meta.workspace === 'aiPlanFirstLayer' && envOk.data.rows.length === 6, 'orchestrator success envelope (6 rows)');
eq(envOk.data.windowMonths, ['2026-09', '2026-10', '2026-11'], 'window derived from planning_cycle (NOT server clock)');
var envErr = handleAiPlanFirstLayerGet_({ payload: { planning_cycle: 'bad' } }, eio);
ok(envErr.success === false && envErr.errors[0].code === 'VALIDATION_FAILED' && envErr.data === null, 'malformed planning_cycle -> ERROR envelope (never rows/zero)');

console.log('\n== composer reuses owners (no duplicated formula) + read-only + layer separation ==');
var code56 = GS56.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
ok(/oprLineRemaining_/.test(GS56) && /fcrBasicRawT3_/.test(GS56) && /fcrSpecialRawQty_/.test(GS56) && /rivSiteStock_/.test(GS56) && /rivOverseasStock_/.test(GS56) && /ltoLeadTimeForSku_/.test(GS56) && /fcrParseCycle_/.test(GS56),
  'composer REUSES the 52_/53_/54_/55_ pure fact functions (no duplicated arithmetic)');
ok(!/getOperationDb/.test(code56), 'composer never calls getOperationDb');
ok(!/\.setValue\(|appendRow|insertSheet|deleteRow|\.setValues\(/.test(code56), 'composer writes nothing (read-only)');
ok(!/order_planning_gap|recommendation\.workspace|generateRecommendation|calculatedGap|slaFifoCompare_|createRequestOrder|createPurchaseOrder/.test(code56),
  'composer computes NO Gap/Recommendation/allocation/FIFO/RO-PO (Layer-2/3 untouched; no second engine)');
ok(/action === 'aiPlanFirstLayer\.get'/.test(ROUTER) && /handleAiPlanFirstLayerGet_\(body\)/.test(ROUTER), 'router dispatches aiPlanFirstLayer.get');

console.log('\n== frontend cutover: canonical composer primary read, fail-closed, no broad DB in first-layer assembly ==');
var DBAPI2 = read('js/api/operation-system-db-api.js');
ok(/KM\.DB\.getAiPlanFirstLayer = function/.test(DBAPI2) && /_kmGapRead_\('aiPlanFirstLayer\.get'/.test(DBAPI2), 'db-api exposes getAiPlanFirstLayer via the scoped read transport');
// canonical default ON + kill switch (mirrors USE_MATERIALIZED_GAP_READ)
ok(/function _opUseFirstLayerComposer\(\)/.test(ROJS) && /USE_AI_PLAN_FIRST_LAYER_COMPOSER/.test(ROJS) && /return true;/.test(ROJS.slice(ROJS.indexOf('_opUseFirstLayerComposer'), ROJS.indexOf('_opUseFirstLayerComposer') + 400)), 'canonical default ON + kill switch flag USE_AI_PLAN_FIRST_LAYER_COMPOSER');
// planning_cycle resolved from _roTpeNow (client, PDR-2) — NOT the server clock
ok(/function _opFirstLayerCycle\(\)[\s\S]*?_roTpeNow\(\)/.test(ROJS) && /'RECO-'/.test(ROJS), 'planning_cycle resolved client-side from _roTpeNow (PDR-2; server never uses its clock)');
// init routes the canonical first-layer to the composer; the broad load lives ONLY in the Legacy branch
var initFn = extractFn(ROJS, 'initRequestOrderSection');
// F1-7J-A2: the canonical branch now loads the bounded marketplace reference FIRST, then the composer (both scoped reads).
ok(/_opUseFirstLayerComposer\(\) && _opFirstLayerReady\(\)/.test(initFn) && /_roLoadMarketplaceRef_\(\)\.then\([\s\S]*_opLoadFirstLayerComposer_\(\)/.test(initFn) && /return;/.test(initFn), 'init routes canonical first-layer to the scoped composer (after the scoped marketplace reference load)');
// the composer load path has NO broad-DB call (fail-closed, no silent legacy fallback)
var loadFn = extractFn(ROJS, '_opLoadFirstLayerComposer_');
ok(!/getOperationDb|loadOperationDb|_opDbCache/.test(loadFn), 'composer read path has NO getOperationDb/loadOperationDb/_opDbCache (first-layer assembly independent of broad DB)');
ok(/getAiPlanFirstLayer/.test(loadFn) && /READ_FAILED|AI_PLAN_READ_FAILED/.test(loadFn) && /_opFirstLayerError_/.test(loadFn), 'composer read path: getAiPlanFirstLayer + fail-closed error (no legacy fallback)');
var errFn = extractFn(ROJS, '_opFirstLayerError_');
ok(!/loadOperationDb|_buildRequestOrderRowsFromDb/.test(errFn), 'error path does NOT fall back to the legacy broad-cache render');
// KM.loadState region reused (no new loading framework)
ok(/KM\.loadState\.bindElement/.test(ROJS) && /KM\.loadState\.STATES\.(READY|EMPTY|ERROR)/.test(ROJS), 'reuses KM.loadState region (INITIAL_LOADING/READY/EMPTY/ERROR)');
// second-layer secondary surfaces lazy-load broad cache on expand (first-layer never depends on it)
var toggleFn = extractFn(ROJS, '_roToggleRowByKey');
ok(/_opUseFirstLayerComposer\(\) && !window\._opDbCache[\s\S]*?loadOperationDb/.test(toggleFn), 'secondary expand surfaces lazy-load broad cache (first-layer stays composer-only)');
// the legacy _buildRequestOrderRowsFromDb remains (kill-switch path) but is NOT the canonical primary read
ok(/function _buildRequestOrderRowsFromDb\(/.test(ROJS), 'legacy _buildRequestOrderRowsFromDb retained for the kill-switch path (DORMANT in canonical mode)');

console.log('\n----------------------------------------');
console.log('API AI-PLAN FIRST-LAYER COMPOSER (F1-7E-PREREQ-5-R1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) process.exitCode = 1;
