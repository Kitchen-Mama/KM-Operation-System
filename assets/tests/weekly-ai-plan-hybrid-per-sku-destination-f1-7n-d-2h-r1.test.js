// Kitchen Mama Operation System — F1-7N-D-2h hybrid per-SKU destination + self-fulfilled warehouse-grain.
// Run: node assets/tests/weekly-ai-plan-hybrid-per-sku-destination-f1-7n-d-2h-r1.test.js
// -----------------------------------------------------------------------------------------------------------------
// USER authority (D-2h): a marketplace whose marketplace-level fulfillment_model='hybrid' resolves its destination
// PER SKU from marketplace_skus.fulfillment_model — self_fulfilled→WAREHOUSE, platform_fulfilled→MARKETPLACE,
// hybrid/blank/unknown→DESTINATION_AUTHORITY_UNRESOLVED (fail-closed, never guessed). This supersedes only the hybrid
// fail-close of D-F1-4B-FM5-R2b. Non-hybrid marketplaces are UNCHANGED. Self-fulfilled destination grain is
// warehouse-level: multiple warehouses stay independent nodes; ratios split demand ONCE across them (no pooling).
// Part 1 evals the bundle + 42_ handler; Part 2 proves the pure warehouse-grain split (KMDA).

var fs = require('fs'), path = require('path');
function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }
var BUNDLE = read('specs/active/apps-script/90_generated_supply_planning_bundle.gs');
var HANDLER = read('specs/active/apps-script/42_api_v1_recommendation_workspace.gs');
var KMDA = require('../js/core/supply-planning-demand-allocation.js');
var fail = 0, pass = 0;
function ok(c, l) { if (c) { pass++; } else { fail++; console.error('FAIL ' + l); } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) { pass++; } else { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } }
function section(n) { console.log('\n== ' + n + ' =='); }

var H = (new Function(BUNDLE + '\n' + HANDLER + '\n return { handle: handleRecommendationWorkspaceGet_ };'))();
function makeSs(tables) {
  return { getSheetByName: function (name) {
    var t = tables[name]; if (!t) return null; var values = [t.headers].concat(t.rows);
    return { getLastRow: function () { return values.length; }, getLastColumn: function () { return t.headers.length; },
      getDataRange: function () { return { getValues: function () { return values; } }; },
      getRange: function () { return { setValues: function () {}, setValue: function () {} }; }, appendRow: function () {} };
  } };
}
function io(ss) { return { now: function () { return 0; }, nextSeq: function () { return 1; }, configMonth: function () { return '2026-08'; }, configDate: function () { return '2026-08-07'; }, openTarget: function () { return ss; } }; }
function body(mkt) { return { requestId: 'REQ-D2H', payload: { scope: { company: 'KM', country: 'US', marketplace: mkt }, pagination: { page: 1, size: 100 } } }; }
var FC_HEADERS = ['company', 'country', 'marketplace', 'sku', 'year', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'forecast_id'];
function fcRow(mkt, sku) { return ['KM', 'US', mkt, sku, 2026, 0, 0, 0, 0, 0, 0, 0, 3100, 3000, 3100, 3000, 0, 'FC-' + sku]; }

// mktFm = marketplace-level fulfillment_model; skuRows = [ [sku, siteSku, skuFulfillmentModel] ... ]
function tablesFor(mkt, mktFm, skuRows) {
  return {
    marketplace_skus: { headers: ['company', 'country', 'marketplace', 'sku', 'site_sku', 'fulfillment_model', 'replenishment_model'],
      rows: skuRows.map(function (r) { return ['KM', 'US', mkt, r[0], r[1], r[2], 'forecast_driven']; }) },
    marketplaces: { headers: ['marketplace_id', 'company', 'country', 'marketplace', 'fulfillment_model', 'status'], rows: [['MP1', 'KM', 'US', mkt, mktFm, 'active']] },
    warehouses: { headers: ['warehouse_id', 'company', 'country', 'is_active', 'is_factory_warehouse', 'warehouse_type'], rows: [['WH-A', 'KM', 'US', 'TRUE', 'FALSE', '3PL']] },
    sku_details: { headers: ['sku', 'units_per_carton'], rows: skuRows.map(function (r) { return [r[0], 40]; }) },
    fc_regular_forecast: { headers: FC_HEADERS, rows: skuRows.map(function (r) { return fcRow(mkt, r[0]); }) },
    amazon_inventory_snapshot: { headers: ['country', 'marketplace', 'sku', 'available_qty'], rows: skuRows.map(function (r) { return ['US', mkt, r[0], 5000]; }) }
  };
}
function run(mkt, mktFm, skuRows) {
  var env = H.handle(body(mkt), io(makeSs(tablesFor(mkt, mktFm, skuRows))));
  return { env: env, lines: (env && env.data && env.data.lines) ? env.data.lines : [] };
}
function bySku(lines, sku) { return lines.filter(function (l) { return l.sku === sku; }); }

// =================================================================================================================
section('A non-hybrid self_fulfilled UNCHANGED — WAREHOUSE mode, fulfillmentModel=self_fulfilled');
var A = run('SHOPIFY_US', 'self_fulfilled', [['CO1', 'S1', '']]); // SKU-level blank is IGNORED for non-hybrid
ok(A.lines.length > 0 && A.lines.every(function (l) { return l.recommendationMode === 'WAREHOUSE_REPLENISHMENT'; }), 'A all lines WAREHOUSE_REPLENISHMENT');
ok(A.lines.every(function (l) { return l.fulfillmentModel === 'self_fulfilled'; }), 'A fulfillmentModel=self_fulfilled (marketplace-level, SKU-level ignored for non-hybrid)');

section('B non-hybrid platform_fulfilled UNCHANGED — MARKETPLACE logical destination, warehouseId null');
var B = run('AMAZON_US', 'platform_fulfilled', [['CO1', 'S1', '']]);
var b0 = B.lines[0];
ok(b0 && b0.recommendationMode === 'MARKETPLACE_ORDER_NEED', 'B MARKETPLACE_ORDER_NEED');
ok(b0 && b0.destinationType === 'MARKETPLACE' && b0.warehouseId === null, 'B destinationType MARKETPLACE, warehouseId null (no fabricated warehouse)');
ok(b0 && b0.fulfillmentModel === 'platform_fulfilled', 'B fulfillmentModel=platform_fulfilled');

// -----------------------------------------------------------------------------------------------------------------
// HYBRID marketplace (Walmart) with FOUR per-SKU models: platform / self / blank / hybrid.
var HYB = run('WALMART_US', 'hybrid', [
  ['SKU_P', 'SP', 'platform_fulfilled'],
  ['SKU_S', 'SS', 'self_fulfilled'],
  ['SKU_B', 'SB', ''],
  ['SKU_H', 'SH', 'hybrid']
]);
var lP = bySku(HYB.lines, 'SKU_P')[0], lS = bySku(HYB.lines, 'SKU_S')[0], lB = bySku(HYB.lines, 'SKU_B')[0], lH = bySku(HYB.lines, 'SKU_H')[0];

section('C hybrid + per-SKU platform_fulfilled → MARKETPLACE (no allocation rule required)');
ok(lP && lP.destinationType === 'MARKETPLACE' && lP.recommendationMode === 'MARKETPLACE_ORDER_NEED', 'C SKU_P → MARKETPLACE');
ok(lP && lP.fulfillmentModel === 'platform_fulfilled', 'C SKU_P fulfillmentModel=platform_fulfilled');
ok(lP && lP.warehouseId === null && (lP.marketplaceId || lP.destinationRefId), 'C SKU_P logical destination (marketplace_id), warehouseId null');
ok(lP && lP.blockedReason !== 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'C platform lane does NOT require a demand-allocation rule');

section('D hybrid + per-SKU self_fulfilled → WAREHOUSE (this lane DOES need an allocation rule)');
ok(lS && lS.recommendationMode === 'WAREHOUSE_REPLENISHMENT', 'D SKU_S → WAREHOUSE');
ok(lS && lS.fulfillmentModel === 'self_fulfilled', 'D SKU_S fulfillmentModel=self_fulfilled');
ok(lS && lS.blocked === true && lS.blockedReason === 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'D self lane requires allocation rule (blocked without one)');

section('E hybrid + blank / both-lane SKU → fail-closed UNRESOLVED (never guessed)');
ok(lB && lB.blocked === true && lB.blockedReason === 'DESTINATION_AUTHORITY_UNRESOLVED', 'E SKU_B (blank) → UNRESOLVED');
ok(lB && lB.fulfillmentModel === '', 'E SKU_B fulfillmentModel=""');
ok(lH && lH.blocked === true && lH.blockedReason === 'DESTINATION_AUTHORITY_UNRESOLVED', 'E SKU_H (both-lane hybrid) → UNRESOLVED');
ok(lH && lH.fulfillmentModel === 'hybrid', 'E SKU_H fulfillmentModel=hybrid (carried; still fail-closed, no split invented)');

section('F ONE hybrid marketplace emits BOTH a WAREHOUSE and a MARKETPLACE lane for different SKUs');
var hasWh = HYB.lines.some(function (l) { return l.destinationType === 'WAREHOUSE'; });
var hasMkt = HYB.lines.some(function (l) { return l.destinationType === 'MARKETPLACE'; });
ok(hasWh && hasMkt, 'F Walmart produces both WAREHOUSE (SKU_S) and MARKETPLACE (SKU_P) lanes — not one blanket type');
ok(HYB.lines.every(function (l) { return !(l.destinationType === 'MARKETPLACE' && l.warehouseId); }), 'F no marketplace lane carries a physical warehouseId (marketplace_id never in a warehouse field)');

section('G self-fulfilled warehouse-grain — 30/70 split is independent + conserves demand ONCE (KMDA, pure)');
var SCOPE = { company: 'KM', country: 'US', marketplace: 'SHOPIFY_US' };
var rules = [
  { allocation_rule_id: 'RDAR-KM-US-SHOPIFY_US-WH-A', company: 'KM', country: 'US', marketplace: 'SHOPIFY_US', destination_warehouse_id: 'WH-A', forecast_allocation_ratio: 0.3, sales_allocation_ratio: 0.3, status: 'active' },
  { allocation_rule_id: 'RDAR-KM-US-SHOPIFY_US-WH-B', company: 'KM', country: 'US', marketplace: 'SHOPIFY_US', destination_warehouse_id: 'WH-B', forecast_allocation_ratio: 0.7, sales_allocation_ratio: 0.7, status: 'active' }
];
var whById = { 'WH-A': { warehouse_id: 'WH-A', company: 'KM', is_active: true }, 'WH-B': { warehouse_id: 'WH-B', company: 'KM', is_active: true } };
var active = KMDA.readActiveAllocationRules(rules, SCOPE, '2026-08');
var ruleset = KMDA.validateAllocationRules(active, SCOPE, whById);
ok(ruleset.ok === true, 'G ruleset valid (two independent warehouse nodes)');
eq(ruleset.warehouses.map(function (w) { return w.warehouseId; }).sort(), ['WH-A', 'WH-B'], 'G two distinct destination warehouses');
var split = KMDA.allocateMarketplaceDemand(100, ruleset, 'forecast');
ok(split.ready === true, 'G allocation ready');
eq(split.byKey['WH-A'], 30, 'G WH-A demand = 30 (independent)');
eq(split.byKey['WH-B'], 70, 'G WH-B demand = 70 (independent)');
eq(split.byKey['WH-A'] + split.byKey['WH-B'], 100, 'G total conserved ONCE (30+70=100; no pooling, no double-count)');
// single-warehouse policy: zero rules → NOT_CONFIGURED (no canonical auto-1.0 fallback; EXPLICIT_1_REQUIRED)
var none = KMDA.validateAllocationRules(KMDA.readActiveAllocationRules([], SCOPE, '2026-08'), SCOPE, whById);
ok(none.ok === false && none.issues[0].code === 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'G single/zero rule → fail-closed (EXPLICIT_1_REQUIRED; no implicit 1.0)');

console.log('\n----------------------------------------');
console.log('WEEKLY AI PLAN HYBRID PER-SKU DESTINATION (F1-7N-D-2h): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
