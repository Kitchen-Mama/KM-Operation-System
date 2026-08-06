// Kitchen Mama Operation System — Recommendation Destination + Multi-Warehouse Demand Allocation (F1-4B-E0R).
// Run: node assets/tests/supply-planning-demand-allocation-f1-4b-e0r.test.js
// -----------------------------------------------------------------------------
// Proves the pure Phase-1 building blocks for D-F1-4B-E0R: canonical destination DTO (MARKETPLACE vs WAREHOUSE, no
// fake Amazon warehouse), targeted rule reader, ratio validator (integer basis points, total = 100%), and the
// deterministic largest-remainder demand allocator that conserves the exact total. No DB, no clock, no RNG, no DOM.

'use strict';
var DA = require('../js/core/supply-planning-demand-allocation.js');
var fs = require('fs');
var path = require('path');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }

// canonical warehouses for KM/US
var WH = {
  'WH-KM-US-A': { warehouse_id: 'WH-KM-US-A', company: 'KM', country: 'US', is_active: true, warehouse_code: 'USA' },
  'WH-KM-US-B': { warehouse_id: 'WH-KM-US-B', company: 'KM', country: 'US', is_active: true, warehouse_code: 'USB' },
  'WH-KM-US-OFF': { warehouse_id: 'WH-KM-US-OFF', company: 'KM', country: 'US', is_active: false, warehouse_code: 'OFF' },
  'WH-RES-US': { warehouse_id: 'WH-RES-US', company: 'ResUS', country: 'US', is_active: true, warehouse_code: 'RES' }
};
var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
function rule(whId, f, s2, over) {
  var r = { allocation_rule_id: DA.allocationRuleId('KM', 'US', 'AMAZON_US', whId), company: 'KM', country: 'US', marketplace: 'AMAZON_US',
    destination_warehouse_id: whId, forecast_allocation_ratio: f, sales_allocation_ratio: s2, status: 'active', effective_from: '2026-01-01', effective_to: '' };
  if (over) for (var k in over) r[k] = over[k];
  return r;
}
function rules3070() { return [rule('WH-KM-US-A', 0.30, 0.30), rule('WH-KM-US-B', 0.70, 0.70)]; }
function validated(rows) { return DA.validateAllocationRules(DA.readActiveAllocationRules(rows, SCOPE, '2026-08'), SCOPE, WH); }

// =====================================================================================================
section('Destination DTO / key (D-F1-4B-E0R-1 / §9)');
(function () {
  var mkt = DA.buildDestinationDTO({ destinationType: 'MARKETPLACE', company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP-KM-US-AMZ', marketplaceDisplayName: 'Amazon US' });
  ok(mkt.destinationType === 'MARKETPLACE' && mkt.destinationRefId === 'MP-KM-US-AMZ' && mkt.warehouseId === null, 'T1/T3/T6 MARKETPLACE uses canonical marketplace id; warehouseId null; no fake warehouse');
  var wh = DA.buildDestinationDTO({ destinationType: 'WAREHOUSE', company: 'KM', country: 'US', marketplace: 'AMAZON_US', warehouseId: 'WH-KM-US-A', warehouseCode: 'USA', warehouseName: 'US A' });
  ok(wh.destinationType === 'WAREHOUSE' && wh.destinationRefId === 'WH-KM-US-A' && wh.warehouseId === 'WH-KM-US-A', 'T2 WAREHOUSE uses canonical warehouse_id');
  var legacy = DA.buildDestinationDTO({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-KM-US-B' });
  ok(legacy.destinationType === 'WAREHOUSE' && legacy.warehouseId === 'WH-KM-US-B', 'T5 legacy destinationWarehouseId normalizes to WAREHOUSE');
  var amazon = DA.buildDestinationDTO({ company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP-KM-US-AMZ' });
  ok(amazon.destinationType === 'MARKETPLACE' && amazon.warehouseId === null, 'T3/T4 Amazon defaults to MARKETPLACE, needs no warehouse_id / no Amazon FC at recommendation stage');
  ok(DA.destinationKey(wh) !== DA.destinationKey(mkt), 'key: marketplace vs warehouse destinations are distinct');
  ok(DA.destinationKey(wh).indexOf('WH-KM-US-A') > -1 && !/USA A/.test(DA.destinationKey(wh)), 'key is identity-based (warehouse_id), not display name');
})();

// =====================================================================================================
section('Ratio validation (D-F1-4B-E0R-3 / §4)');
(function () {
  var v = validated(rules3070());
  ok(v.ok === true && v.warehouses.length === 2, 'T7 two-warehouse 30/70 validates');
  ok(v.forecastBpTotal === 10000 && v.salesBpTotal === 10000, 'T8 ratios sum to 100% (10000 bp)');
  ok(v.warehouses[0].warehouseId === 'WH-KM-US-A' && v.warehouses[0].forecastBp === 3000 && v.warehouses[1].forecastBp === 7000, 'basis points 3000/7000 (deterministic, sorted by warehouse_id)');
  var under = validated([rule('WH-KM-US-A', 0.30, 0.30), rule('WH-KM-US-B', 0.60, 0.60)]);
  ok(under.ok === false && under.issues.some(function (i) { return i.code === 'DEMAND_ALLOCATION_RATIO_TOTAL_INVALID'; }), 'T9a ratios below 100% block');
  var over = validated([rule('WH-KM-US-A', 0.40, 0.40), rule('WH-KM-US-B', 0.70, 0.70)]);
  ok(over.ok === false && over.issues.some(function (i) { return i.code === 'DEMAND_ALLOCATION_RATIO_TOTAL_INVALID'; }), 'T9b ratios above 100% block');
  var dup = validated([rule('WH-KM-US-A', 0.30, 0.30), rule('WH-KM-US-A', 0.70, 0.70)]);
  ok(dup.ok === false && dup.issues.some(function (i) { return i.code === 'DEMAND_ALLOCATION_DESTINATION_CONFLICT'; }), 'T10 duplicate active warehouse rule conflicts');
  var none = DA.validateAllocationRules([], SCOPE, WH);
  ok(none.ok === false && none.issues[0].code === 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED', 'T11 missing rule blocks (no default)');
  var inactiveWh = validated([rule('WH-KM-US-OFF', 0.30, 0.30), rule('WH-KM-US-B', 0.70, 0.70)]);
  ok(inactiveWh.ok === false && inactiveWh.issues.some(function (i) { return i.code === 'DESTINATION_WAREHOUSE_INVALID'; }), 'T12 inactive warehouse blocks');
  var crossCo = validated([rule('WH-RES-US', 0.30, 0.30), rule('WH-KM-US-B', 0.70, 0.70)]);
  ok(crossCo.ok === false && crossCo.issues.some(function (i) { return i.code === 'DESTINATION_WAREHOUSE_INVALID' && /cross-company/.test(i.message); }), 'T13 cross-company warehouse blocks');
  var badRatio = validated([rule('WH-KM-US-A', 1.3, 0.30), rule('WH-KM-US-B', 0.70, 0.70)]);
  ok(badRatio.issues.some(function (i) { return i.code === 'DEMAND_ALLOCATION_RATIO_INVALID'; }), 'ratio outside [0,1] → DEMAND_ALLOCATION_RATIO_INVALID');
  var period = validated([rule('WH-KM-US-A', 0.30, 0.30), rule('WH-KM-US-A', 0.30, 0.30, { effective_from: '2026-06-01', effective_to: '2026-12-31', allocation_rule_id: 'RDAR-KM-US-AMAZON_US-WH-KM-US-A-2' }), rule('WH-KM-US-B', 0.70, 0.70)]);
  ok(period.issues.some(function (i) { return i.code === 'DEMAND_ALLOCATION_PERIOD_CONFLICT'; }), 'T(period) overlapping effective periods for one warehouse → PERIOD_CONFLICT');
})();

// =====================================================================================================
section('Deterministic integer allocation — largest remainder, exact total (§5)');
(function () {
  var v = validated(rules3070());
  var a1000 = DA.allocateMarketplaceDemand(1000, v, 'forecast');
  ok(a1000.byKey['WH-KM-US-A'] === 300 && a1000.byKey['WH-KM-US-B'] === 700, 'T14 Forecast 1000 → 300 / 700');
  var a1001 = DA.allocateMarketplaceDemand(1001, v, 'forecast');
  ok(a1001.byKey['WH-KM-US-A'] + a1001.byKey['WH-KM-US-B'] === 1001, 'T15 odd quantity 1001 preserves exact total');
  ok(a1001.byKey['WH-KM-US-B'] === 701 && a1001.byKey['WH-KM-US-A'] === 300, 'T15b leftover unit → largest fractional remainder (WH-B .7), not first row');
  // permutation invariance: reversed rule order → identical result
  var vRev = DA.validateAllocationRules(DA.readActiveAllocationRules([rule('WH-KM-US-B', 0.70, 0.70), rule('WH-KM-US-A', 0.30, 0.30)], SCOPE, '2026-08'), SCOPE, WH);
  var aRev = DA.allocateMarketplaceDemand(1001, vRev, 'forecast');
  ok(aRev.byKey['WH-KM-US-A'] === 300 && aRev.byKey['WH-KM-US-B'] === 701, 'T16 output deterministic under input permutation');
  // odd split where the remainder must go by fraction: 10 @ 33/33/34 style — use 3-way to exercise remainder
  var v3 = DA.validateAllocationRules(DA.readActiveAllocationRules([rule('WH-KM-US-A', 0.3333, 0.3333), rule('WH-KM-US-B', 0.3333, 0.3333), rule('WH-KM-US-OFF-X', 0.3334, 0.3334, { destination_warehouse_id: 'WH-KM-US-C' })], SCOPE, '2026-08'),
    SCOPE, Object.assign({ 'WH-KM-US-C': { warehouse_id: 'WH-KM-US-C', company: 'KM', country: 'US', is_active: true } }, WH));
  var a10 = DA.allocateByBasisPoints(10, v3.warehouses.map(function (w) { return { key: w.warehouseId, bp: w.forecastBp }; }));
  ok(a10 && (a10.byKey['WH-KM-US-A'] + a10.byKey['WH-KM-US-B'] + a10.byKey['WH-KM-US-C']) === 10, 'T15c 3-way odd split preserves exact total');
  // T17 no first-row remainder authority: the leftover unit for 1001 went to WH-B (fraction), proven above
  ok(a1001.byKey['WH-KM-US-A'] === 300, 'T17 first row does NOT absorb the remainder by array order');
  // T18 explicit zero demand → zeros; T19 missing demand → null (not zero)
  var aZero = DA.allocateMarketplaceDemand(0, v, 'forecast');
  ok(aZero.byKey['WH-KM-US-A'] === 0 && aZero.byKey['WH-KM-US-B'] === 0, 'T18 explicit zero demand allocates as zero');
  var aMiss = DA.allocateMarketplaceDemand(null, v, 'forecast');
  ok(aMiss.ready === false && aMiss.missing === true && aMiss.byKey === null, 'T19 missing demand is NOT zero (null)');
})();

// =====================================================================================================
section('Warehouse isolation + no double-allocation (D-F1-4B-E0R-2/4 / §6/§7)');
(function () {
  var v = validated(rules3070());
  var facts = DA.buildWarehouseDemandFacts({ ruleset: v, marketplaceForecastQty: 1000, marketplaceSalesQty: 100 });
  var a = facts.perWarehouse.filter(function (w) { return w.warehouseId === 'WH-KM-US-A'; })[0];
  var b = facts.perWarehouse.filter(function (w) { return w.warehouseId === 'WH-KM-US-B'; })[0];
  ok(a.allocatedForecastQty === 300 && b.allocatedForecastQty === 700, 'T24 marketplace Forecast split once (300/700)');
  ok(a.allocatedSalesQty === 30 && b.allocatedSalesQty === 70, 'T25 marketplace Sales split once (30/70)');
  // T20/T21/T22: the facts carry ONLY demand — no stock/incoming keys — so A stock can never leak into B
  ok(!has(a, 'destinationCurrentStock') && !has(a, 'destinationQualifiedIncoming'), 'T20/T21/T22 demand facts carry no pooled stock/incoming (warehouse stock/incoming stay warehouse-scoped, computed elsewhere)');
  // T23/T26: a warehouse-level source is passed through, never re-split
  var pass = DA.passthroughWarehouseDemand('WH-KM-US-A', 500);
  ok(pass.split === false && pass.byKey['WH-KM-US-A'] === 500 && Object.keys(pass.byKey).length === 1, 'T23/T26 warehouse-level source passthrough (not re-split)');
  // T28 no double allocation: allocating the same qty twice via two kinds does not sum into one warehouse beyond its share
  ok((a.allocatedForecastQty + b.allocatedForecastQty) === 1000 && (a.allocatedSalesQty + b.allocatedSalesQty) === 100, 'T28 each demand source allocated once (totals conserved, no double split)');
})();

// =====================================================================================================
section('Special Event, multi-source route, purity, source classification (§8/§10/§13 + audit)');
(function () {
  // T27 Special Event is not copied to every warehouse: the allocator SPLITS (never duplicates). A 200-unit event
  // split 30/70 yields 60/140 (sum 200), never 200 to each.
  var v = validated(rules3070());
  var ev = DA.allocateMarketplaceDemand(200, v, 'forecast');
  ok(ev.byKey['WH-KM-US-A'] === 60 && ev.byKey['WH-KM-US-B'] === 140 && (ev.byKey['WH-KM-US-A'] + ev.byKey['WH-KM-US-B']) === 200, 'T27 event demand is split once (60/140), never duplicated 200 to each');
  // T29/T30 multi-source recommendation stays multi-line + shortage independent: the module returns per-warehouse
  // facts as separate entries (never a single collapsed line).
  var facts = DA.buildWarehouseDemandFacts({ ruleset: v, marketplaceForecastQty: 1000, marketplaceSalesQty: 0 });
  ok(facts.perWarehouse.length === 2 && facts.perWarehouse[0].warehouseId !== facts.perWarehouse[1].warehouseId, 'T29/T30 per-warehouse facts remain separate lines');
  // T31 no hard-coded 0.3/0.7 in the module; T32 no clock/RNG/row-index
  var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-demand-allocation.js'), 'utf8');
  ok(!/0\.3\b|0\.7\b|\b30\b\s*\/\s*\b70\b/.test(src.replace(/\/\/[^\n]*/g, '')), 'T31 no hard-coded 0.3 / 0.7 ratio constant in calculation code');
  ok(!/new Date|Date\.now|Math\.random/.test(src), 'T32 no browser clock / RNG in the module');
  ok(!/\[0\]\s*\+=|first.*remainder/i.test(src), 'T32b no first-row remainder authority');
  // T33 no runtime DB mutation (pure module — no SpreadsheetApp / setValues / appendRow / DB write)
  ok(!/SpreadsheetApp|setValues|appendRow|getOperationDb|deleteRow|insertSheet/.test(src), 'T33 no runtime DB mutation / whole-DB load in the module');
  // ratio→bp conversion is exact + rejects out of range
  ok(DA._ratioToBp(0.3) === 3000 && DA._ratioToBp(0.7) === 7000 && DA._ratioToBp(1.3) === null && DA._ratioToBp('x') === null, 'ratio→basis-point conversion exact + range-checked');
})();

console.log('\n----------------------------------------');
console.log('DEMAND ALLOCATION (F1-4B-E0R): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
