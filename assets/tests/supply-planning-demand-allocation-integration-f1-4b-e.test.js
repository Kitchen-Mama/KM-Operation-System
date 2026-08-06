// Kitchen Mama Operation System — Demand Allocation Rule Provision + Runtime Integration (F1-4B-E).
// Run: node assets/tests/supply-planning-demand-allocation-integration-f1-4b-e.test.js
// -----------------------------------------------------------------------------
// Proves the provisioned replenishment_demand_allocation_rules authority is READ (targeted, read-only, safe-empty)
// and INTEGRATED: the pure adapter fans marketplace Forecast/Sales into per-warehouse demand facts (Warehouse
// Forecast) from the provisioned rules, and the EXISTING frozen planning-context runtime (KMPCX) consumes those
// per-warehouse WAREHOUSE destinations unchanged (one independent context per warehouse). No formula/API/UI change.
// NOTE: intentionally NOT strict — the DB reader (normalizer + getter) is loaded via direct eval and its
// declarations must bind into the surrounding scope (strict-mode eval would isolate them).

var fs = require('fs');
var path = require('path');
var DA = require('../js/core/supply-planning-demand-allocation.js');
var KMPCX = require('../js/core/supply-planning-planning-context.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }

// ---- extract the DB reader (normalizer + getter) from the window-attached DB API + eval with a window stub ----
var DBAPI = fs.readFileSync(path.join(__dirname, '..', 'js', 'api', 'operation-system-db-api.js'), 'utf8');
function extractFn(src, name) {
  var start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('not found: ' + name);
  var i = src.indexOf('{', start), depth = 0;
  for (; i < src.length; i++) { var ch = src[i]; if (ch === '{') depth++; else if (ch === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); } }
  throw new Error('unbalanced: ' + name);
}
var getterSrc = (DBAPI.match(/window\.KM\.DB\.getReplenishmentDemandAllocationRules = function\(\) \{[\s\S]*?\};/) || [''])[0];
var normSrc = extractFn(DBAPI, 'normalizeReplenishmentDemandAllocationRuleRecord');
var reader = (function () {
  var window = { KM: { DB: {} }, _opDbCache: null };
  eval(normSrc); eval(getterSrc);
  return { window: window, normalize: normalizeReplenishmentDemandAllocationRuleRecord, get: window.KM.DB.getReplenishmentDemandAllocationRules };
})();

// canonical warehouses
var WH = {
  'WH-KM-US-A': { warehouse_id: 'WH-KM-US-A', company: 'KM', country: 'US', is_active: true, warehouse_code: 'USA', warehouse_name: 'US A' },
  'WH-KM-US-B': { warehouse_id: 'WH-KM-US-B', company: 'KM', country: 'US', is_active: true, warehouse_code: 'USB', warehouse_name: 'US B' }
};
var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP-KM-US-AMZ' };
// raw sheet rows (snake) as the backend would return them
function rawRows() {
  return [
    { allocation_rule_id: 'RDAR-KM-US-AMAZON_US-WH-KM-US-A', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-KM-US-A', forecast_allocation_ratio: 0.30, sales_allocation_ratio: 0.30, status: 'active', effective_from: '2026-01-01', effective_to: '' },
    { allocation_rule_id: 'RDAR-KM-US-AMAZON_US-WH-KM-US-B', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-KM-US-B', forecast_allocation_ratio: 0.70, sales_allocation_ratio: 0.70, status: 'active', effective_from: '2026-01-01', effective_to: '' }
  ];
}

// =====================================================================================================
section('A. Reader — targeted, read-only, safe-empty, normalized');
(function () {
  reader.window._opDbCache = null;
  var empty = reader.get();
  ok(Array.isArray(empty) && empty.length === 0, 'A1 no cache → [] (safe-empty, read-only)');
  reader.window._opDbCache = {};   // cache loaded but tab absent
  ok(Array.isArray(reader.window.KM.DB.getReplenishmentDemandAllocationRules()) && reader.window.KM.DB.getReplenishmentDemandAllocationRules().length === 0, 'A2 cache loaded but tab absent → [] (missing-source safe)');
  reader.window._opDbCache = { replenishmentDemandAllocationRules: rawRows().map(reader.normalize) };
  var rows = reader.window.KM.DB.getReplenishmentDemandAllocationRules();
  ok(rows.length === 2 && rows[0].destinationWarehouseId === 'WH-KM-US-A' && rows[0].forecastAllocationRatio === 0.30, 'A3 returns normalized rows (destinationWarehouseId + numeric ratio)');
  var blank = reader.normalize({ allocation_rule_id: 'X', destination_warehouse_id: 'W', marketplace: 'M', forecast_allocation_ratio: '', sales_allocation_ratio: '' });
  ok(blank.forecastAllocationRatio === null && blank.salesAllocationRatio === null, 'A4 blank ratio → null (never coerced to 0)');
  // source-scan: getter is read-only over the cache; no whole-DB load / fetch / sheet creation
  ok(!/getOperationDb|loadOperationDb|fetch\s*\(|SpreadsheetApp|insertSheet|setValues/.test(getterSrc), 'A5 getter does no whole-DB load / fetch / sheet mutation');
  ok(/replenishmentDemandAllocationRules: \(db\.replenishment_demand_allocation_rules/.test(DBAPI), 'A6 cache assembly maps the tab ([] when absent)');
})();

// =====================================================================================================
section('B. Adapter — provisioned rules → per-warehouse demand facts (Warehouse Forecast)');
(function () {
  // consume the DB-normalized shape directly (as getReplenishmentDemandAllocationRules returns)
  var normalized = rawRows().map(reader.normalize);
  var res = DA.resolveScopeWarehouseDemandFacts({ scope: SCOPE, allocationRules: normalized, warehousesById: WH, effectiveDate: '2026-08', marketplaceForecastQty: 1000, marketplaceSalesQty: 100 });
  ok(res.ready === true && res.warehouses.length === 2, 'B1 two warehouse demand facts produced');
  var a = res.warehouses.filter(function (w) { return w.warehouseId === 'WH-KM-US-A'; })[0];
  var b = res.warehouses.filter(function (w) { return w.warehouseId === 'WH-KM-US-B'; })[0];
  ok(a.allocatedForecastQty === 300 && b.allocatedForecastQty === 700, 'B2 marketplace Forecast 1000 split 300/700');
  ok(a.allocatedSalesQty === 30 && b.allocatedSalesQty === 70, 'B3 marketplace Sales 100 split 30/70');
  ok(a.destination.destinationType === 'WAREHOUSE' && a.destination.warehouseId === 'WH-KM-US-A' && a.destination.destinationRefId === 'WH-KM-US-A', 'B4 canonical WAREHOUSE destination DTO per warehouse (warehouse_id identity)');
  ok(a.destination.destinationLabel === 'US A' && a.destination.marketplaceId === 'MP-KM-US-AMZ', 'B5 destination carries code/name + marketplace scope (display ≠ identity)');
  ok(a.allocatedForecastQty !== b.allocatedForecastQty, 'B6 warehouse A demand ≠ warehouse B demand (independent)');
  // accepts the raw snake shape too
  var resSnake = DA.resolveScopeWarehouseDemandFacts({ scope: SCOPE, allocationRules: rawRows(), warehousesById: WH, effectiveDate: '2026-08', marketplaceForecastQty: 1000 });
  ok(resSnake.ready === true && resSnake.warehouses.length === 2, 'B7 adapter accepts raw snake rows too');
})();

// =====================================================================================================
section('C. Missing / invalid rule → fail closed (no default)');
(function () {
  var none = DA.resolveScopeWarehouseDemandFacts({ scope: SCOPE, allocationRules: [], warehousesById: WH, effectiveDate: '2026-08', marketplaceForecastQty: 1000 });
  ok(none.ready === false && none.issues.some(function (i) { return i.code === 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED'; }), 'C1 no rule → DEMAND_ALLOCATION_RULE_NOT_CONFIGURED (no default 100% / 50-50 / first-warehouse)');
  // out-of-scope rule (different marketplace) → not configured for THIS scope
  var wrongScope = rawRows().map(function (r) { return Object.assign({}, r, { marketplace: 'WALMART_US' }); });
  var nm = DA.resolveScopeWarehouseDemandFacts({ scope: SCOPE, allocationRules: wrongScope, warehousesById: WH, effectiveDate: '2026-08', marketplaceForecastQty: 1000 });
  ok(nm.ready === false, 'C2 rule for another marketplace does not configure this scope');
})();

// =====================================================================================================
section('D. Existing recommendation runtime (KMPCX) consumes the per-warehouse destinations UNCHANGED');
(function () {
  var res = DA.resolveScopeWarehouseDemandFacts({ scope: SCOPE, allocationRules: rawRows(), warehousesById: WH, effectiveDate: '2026-08', marketplaceForecastQty: 1000 });
  // Build EXISTING-runtime receivers from the adapter's warehouse facts (F1-5-A caller seam: injected month/cycle +
  // per-warehouse regular forecast). This proves KMPCX consumes the provisioned-rule WAREHOUSE destinations.
  var warehousesInput = [WH['WH-KM-US-A'], WH['WH-KM-US-B']];
  var receivers = res.warehouses.map(function (w) {
    var q = w.allocatedForecastQty;   // the allocated warehouse forecast flows into the runtime as its FC basis
    return { sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: w.warehouseId,
      regularForecastByMonth: { '2026-09': q / 4, '2026-10': q / 4, '2026-11': q / 4, '2026-12': q / 4 } };
  });
  var ctx = KMPCX.resolveRecommendationPlanningContext({ calculationMonth: '2026-08', planningCycle: '2026-W40', warehouses: warehousesInput, receivers: receivers });
  ok(ctx.ready === true && ctx.contexts.length === 2, 'D1 KMPCX (frozen) consumes both warehouse destinations → 2 ready contexts');
  var ids = ctx.contexts.map(function (c) { return c.destinationWarehouseId; }).sort();
  ok(ids[0] === 'WH-KM-US-A' && ids[1] === 'WH-KM-US-B', 'D2 each context binds its own provisioned-rule warehouse_id (independent)');
  var cA = ctx.contexts.filter(function (c) { return c.destinationWarehouseId === 'WH-KM-US-A'; })[0];
  var cB = ctx.contexts.filter(function (c) { return c.destinationWarehouseId === 'WH-KM-US-B'; })[0];
  ok(cA.forecastShareQty === 300 && cB.forecastShareQty === 700, 'D3 the split warehouse forecast (300/700) flows through the existing runtime unchanged');
  ok(cA.contextId !== cB.contextId, 'D4 warehouse A and B stay separate lines (never collapsed)');
})();

console.log('\n----------------------------------------');
console.log('DEMAND ALLOCATION INTEGRATION (F1-4B-E): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
