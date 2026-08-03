// Kitchen Mama Operation System — Production Source-Facts reader CLEAN SLICE tests (Phase 2C, Round 1J).
// Run: node assets/tests/supply-planning-source-facts.test.js
// Pure Node — exercises assets/js/core/supply-planning-source-facts.js. Verifies readiness (§34A reuse),
// deterministic identity resolution (ambiguity BLOCKS), demand-ledger projection + supply-ledger projection
// (calling the REAL §39 builders), missing≠zero, and incoming-candidate adaptation (B4-R3/R4 reuse).

'use strict';
var SF = require('../js/core/supply-planning-source-facts.js');
var LEDGER = require('../js/core/supply-planning-ledgers.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

// ==========================================================================
section('A. readiness (§34A reuse — missing never becomes zero)');
(function () {
  eq(SF.classifySourceReadiness({ snapshotPresent: true, replenishmentModel: 'forecast_driven', forecastPresent: true, snapshotAgeDays: 1, stalenessThresholdDays: 7 }), { ready: true, status: 'OK', reason: null }, 'A: all ready → OK');
  eq(SF.classifySourceReadiness({ snapshotPresent: false, replenishmentModel: 'forecast_driven' }), { ready: false, status: 'MISSING_SNAPSHOT', reason: 'MISSING_SNAPSHOT' }, 'A: no snapshot → MISSING_SNAPSHOT (blocked, never 0)');
  eq(SF.classifySourceReadiness({ snapshotPresent: true, replenishmentModel: 'forecast_driven', forecastPresent: false, snapshotAgeDays: 1, stalenessThresholdDays: 7 }), { ready: false, status: 'MISSING_FORECAST', reason: 'MISSING_FORECAST' }, 'A: forecast-driven no forecast → MISSING_FORECAST');
  eq(SF.classifySourceReadiness({ snapshotPresent: true, replenishmentModel: 'sales_driven', salesBasisPresent: false, snapshotAgeDays: 1, stalenessThresholdDays: 7 }), { ready: false, status: 'MISSING_SALES_BASIS', reason: 'MISSING_SALES_BASIS' }, 'A: sales-driven no basis → MISSING_SALES_BASIS');
  eq(SF.classifySourceReadiness({ snapshotPresent: true, replenishmentModel: 'forecast_driven', forecastPresent: true, snapshotAgeDays: 10, stalenessThresholdDays: 7 }), { ready: true, status: 'STALE_SNAPSHOT', reason: 'STALE_SNAPSHOT' }, 'A: stale but present → STALE_SNAPSHOT (allowed + warning)');
  eq(SF.classifySourceReadiness({ snapshotPresent: true, replenishmentModel: 'forecast_driven', forecastPresent: true, snapshotAgeDays: 7, stalenessThresholdDays: 7 }), { ready: true, status: 'OK', reason: null }, 'A: age==threshold → fresh (OK)');
})();

section('B. identity resolution (deterministic; ambiguity BLOCKS, never first/latest)');
(function () {
  var ms = [{ marketplace_sku_id: 'MS-1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'GA0450', site_sku: 'ST-1', fulfillment_model: 'platform_fulfilled' }];
  var sd = [{ sku: 'GA0450' }];
  var wh = [{ warehouse_id: 'WH-A', warehouse_code: 'A', is_active: true }];
  var r = SF.resolveSourceIdentity({ rawScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'GA0450' }, marketplaceSkuRows: ms, skuDetailRows: sd, warehouseRows: wh, destinationWarehouseId: 'WH-A' });
  eq(r.status, 'RESOLVED', 'B: clean identity resolves');
  eq([r.identity.masterSku, r.identity.marketplaceSkuId, r.identity.siteSku, r.identity.fulfillmentModel, r.identity.destinationWarehouseId], ['GA0450', 'MS-1', 'ST-1', 'platform_fulfilled', 'WH-A'], 'B: identity fields (warehouse_id authority, not code)');
  // duplicate marketplace SKU → IDENTITY_CONFLICT (no first/latest)
  var dup = SF.resolveSourceIdentity({ rawScope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'GA0450' }, marketplaceSkuRows: ms.concat([{ marketplace_sku_id: 'MS-2', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'GA0450' }]), skuDetailRows: sd });
  eq([dup.status, dup.reason.indexOf('DUPLICATE_MARKETPLACE_SKU') === 0], ['IDENTITY_CONFLICT', true], 'B: duplicate marketplace SKU → IDENTITY_CONFLICT (blocked)');
  // duplicate master row → DUPLICATE_SOURCE
  eq(SF.resolveSourceIdentity({ rawScope: { company: 'KM', sku: 'GA0450' }, skuDetailRows: [{ sku: 'GA0450' }, { sku: 'GA0450' }] }).status, 'DUPLICATE_SOURCE', 'B: duplicate master SKU → DUPLICATE_SOURCE');
  // master not found
  eq(SF.resolveSourceIdentity({ rawScope: { company: 'KM', sku: 'ZZZ' }, skuDetailRows: sd }).status, 'SOURCE_NOT_AVAILABLE', 'B: master not found → SOURCE_NOT_AVAILABLE');
  // one Master SKU, many marketplaces → each resolves independently (no physical duplication of identity)
  var ms2 = ms.concat([{ marketplace_sku_id: 'MS-CA', company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', sku: 'GA0450', site_sku: 'ST-CA' }]);
  eq(SF.resolveSourceIdentity({ rawScope: { company: 'KM', country: 'CA', marketplace: 'AMAZON_CA', sku: 'GA0450' }, marketplaceSkuRows: ms2, skuDetailRows: sd }).identity.marketplaceSkuId, 'MS-CA', 'B: one master SKU maps to many marketplaces independently');
  // blank master / company blocked
  eq(SF.resolveSourceIdentity({ rawScope: { company: 'KM', sku: '' }, skuDetailRows: sd }).reason, 'MISSING_MASTER_SKU', 'B: blank master SKU blocked');
})();

section('C. demand-ledger projection (real §39 builder; missing≠zero; count-once)');
(function () {
  var base = { masterSku: 'GA0450', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08' };
  var out = SF.projectDemandLedger(Object.assign({}, base, { demandRows: [
    { demandType: 'REGULAR', sourceRef: 'FC-1', requiredByDate: '2026-08-20', quantity: 100 },
    { demandType: 'SPECIAL_EVENT', sourceRef: 'EV-1', requiredByDate: '2026-08-10', quantity: 40, eventId: 'E1' },
    { demandType: 'SAFETY', sourceRef: 'SAFETY-1', requiredByDate: '2026-08-31', quantity: 0 }   // explicit 0 allowed
  ] }));
  eq(out.entries.length, 3, 'C: three demand entries projected');
  eq(out.ledger.ledgerType, 'DEMAND_LEDGER', 'C: real §39 buildDemandLedger called');
  eq(out.ledger.totalEffectiveDemandQty, 140, 'C: effective demand 100+40+0');
  ok(out.entries[1].eventId === 'E1', 'C: SPECIAL_EVENT carries eventId (count-once identity)');
  // missing quantity → issue, NOT zero
  var miss = SF.projectDemandLedger(Object.assign({}, base, { demandRows: [{ demandType: 'REGULAR', sourceRef: 'FC-2', requiredByDate: '2026-08-20' }] }));
  eq(miss.entries.length, 0, 'C: missing quantity → NOT projected (never 0)');
  ok(miss.issues.length === 1 && miss.issues[0].reason.indexOf('MISSING_DEMAND_QUANTITY') === 0, 'C: missing quantity surfaced as issue');
  // unknown demand type → issue
  ok(SF.projectDemandLedger(Object.assign({}, base, { demandRows: [{ demandType: 'X', sourceRef: 'FC-3', requiredByDate: '2026-08-20', quantity: 5 }] })).issues[0].reason.indexOf('UNKNOWN_DEMAND_TYPE') === 0, 'C: unknown demand type → issue');
})();

section('D. current-stock supply-ledger projection (real §39 builder; CURRENT_STOCK)');
(function () {
  var out = SF.projectCurrentStockSupplyLedger({ masterSku: 'GA0450', company: 'KM', stockRows: [
    { poolType: 'FBA', warehouseId: 'FBA-US', quantity: 300, supplyLineageRef: 'fba:US' },
    { poolType: 'THREE_PL', warehouseId: 'US-3PL-1', quantity: 120 },
    { poolType: 'FACTORY', warehouseId: 'CN', quantity: 500 }
  ] });
  eq(out.ledger.ledgerType, 'SUPPLY_LEDGER', 'D: real §39 buildSupplyLedger called');
  eq(out.ledger.totalEffectiveSupplyQty, 920, 'D: effective supply 300+120+500 (CURRENT_STOCK)');
  ok(out.entries.every(function (e) { return e.lifecycleBucket === 'CURRENT_STOCK'; }), 'D: inventory authority → CURRENT_STOCK bucket');
  eq(out.entries[1].supplyLineageRef, 'stock:THREE_PL:US-3PL-1:GA0450', 'D: deterministic lineage ref when none supplied');
  // FBA/THREE_PL/FACTORY kept as separate pools (poolKey includes poolType)
  ok(out.ledger.pools.length === 3, 'D: FBA / THREE_PL / FACTORY are separate pools (never merged)');
  // missing quantity → issue, not 0
  var miss = SF.projectCurrentStockSupplyLedger({ masterSku: 'GA0450', company: 'KM', stockRows: [{ poolType: 'FBA', warehouseId: 'FBA-US' }] });
  eq(miss.entries.length, 0, 'D: missing stock quantity → NOT projected (never 0)');
  ok(miss.issues[0].reason.indexOf('MISSING_STOCK_QUANTITY') === 0, 'D: missing stock surfaced');
  // explicit 0 stock allowed
  eq(SF.projectCurrentStockSupplyLedger({ masterSku: 'GA0450', company: 'KM', stockRows: [{ poolType: 'FBA', warehouseId: 'FBA-US', quantity: 0 }] }).entries.length, 1, 'D: explicit 0 stock IS a valid entry');
  // unknown pool type → issue
  ok(SF.projectCurrentStockSupplyLedger({ masterSku: 'GA0450', company: 'KM', stockRows: [{ poolType: 'X', warehouseId: 'W', quantity: 1 }] }).issues[0].reason.indexOf('UNKNOWN_POOL_TYPE') === 0, 'D: unknown pool type → issue');
})();

section('E. incoming-candidate adaptation (B4-R3/R4 reuse)');
(function () {
  var scope = { company: 'KM', sku: 'GA0450', destinationWarehouseId: 'WH-A', country: 'US', marketplace: 'amazon_us' };
  var out = SF.adaptIncomingSupplyCandidates({ scope: scope, shipmentInputs: [
    { shipment: { shipmentId: 'S1', status: 'in_transit', company: 'KM', country: 'US', marketplace: 'amazon_us', eta: '2026-10-01', destinationWarehouseId: 'WH-A' }, line: { shipmentLineId: 'SHL-1', sku: 'GA0450', shipmentQty: 200 } }
  ] });
  eq(out.results.length, 1, 'E: one incoming candidate adapted via existing B4-R3/R4');
  ok(out.results[0].candidate && out.results[0].candidate.sku === 'GA0450', 'E: adapter result carries the built candidate');
  ok(out.issues.length === 0, 'E: clean adaptation → no issues');
})();

section('F. determinism + validation');
(function () {
  var base = { masterSku: 'GA0450', company: 'KM', destinationWarehouseId: 'US-3PL-1', planningCycle: '2026-08', demandRows: [{ demandType: 'REGULAR', sourceRef: 'FC-1', requiredByDate: '2026-08-20', quantity: 100 }] };
  eq(SF.projectDemandLedger(base), SF.projectDemandLedger(base), 'F: demand projection deterministic');
  throwsType(function () { SF.classifySourceReadiness(null); }, 'F: null readiness input → TypeError');
  throwsType(function () { SF.resolveSourceIdentity({}); }, 'F: missing rawScope → TypeError');
  throwsType(function () { SF.projectCurrentStockSupplyLedger({ company: 'KM', stockRows: [] }); }, 'F: missing masterSku → TypeError');
  ok(Object.keys(SF.READINESS_STATES).indexOf('OK') !== -1 && Object.keys(SF.READINESS_STATES).indexOf('MISSING_SNAPSHOT') !== -1, 'F: readiness vocabulary exposed');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All Round 1J Source-Facts (clean slice) assertions passed (' + pass + ' assertions).');
