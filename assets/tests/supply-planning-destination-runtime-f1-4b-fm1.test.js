// Kitchen Mama Operation System — Unified Destination-Node Recommendation Core Runtime (F1-4B-FM1).
// Run: node assets/tests/supply-planning-destination-runtime-f1-4b-fm1.test.js
// -----------------------------------------------------------------------------
// Proves the unified core runtime: MARKETPLACE (order-need via the frozen Monthly CEILING resolver) + WAREHOUSE
// (replenishment via the frozen Weekly FLOOR resolver + frozen ratio fanout), destination-node identity, the
// no-fake-zero Qualified-Incoming completeness gate, frozen-owner reuse (spied), determinism/safety, and the
// preserved Golden Matrix. NOT strict — one source-scan reads the runtime module text and must bind cleanly.

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var R = require('../js/core/supply-planning-destination-runtime.js');
var DA = require('../js/core/supply-planning-demand-allocation.js');
var CALC = require('../js/core/supply-planning-calculations.js');
var QI = require('../js/core/supply-planning-qualified-incoming.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function section(n) { console.log('\n== ' + n + ' =='); }
function spyOn(obj, name) { var orig = obj[name]; var o = { count: 0 }; obj[name] = function () { o.count++; return orig.apply(this, arguments); }; o.restore = function () { obj[name] = orig; }; return o; }

// ---- canonical fixtures ----
var MKTS = [{ marketplace_id: 'MP-KM-US-AMZ', company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'active', marketplace_display_name: 'Amazon US' }];
var MKTS_AMBIG = MKTS.concat([{ marketplace_id: 'MP-KM-US-AMZ-2', company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'active' }]);
var WHS = [
  { warehouse_id: 'WH-A', company: 'KM', country: 'US', is_active: true, warehouse_code: 'USA', warehouse_name: 'US A', warehouse_type: '3PL' },
  { warehouse_id: 'WH-B', company: 'KM', country: 'US', is_active: true, warehouse_code: 'USB', warehouse_name: 'US B', warehouse_type: '3PL' },
  { warehouse_id: 'WH-OFF', company: 'KM', country: 'US', is_active: false, warehouse_code: 'OFF', warehouse_name: 'Off' },
  { warehouse_id: 'WH-CO2', company: 'RESUS', country: 'US', is_active: true, warehouse_code: 'CO2' }
];
var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100' };
var RULES = [
  { allocation_rule_id: 'R1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-A', forecast_allocation_ratio: 0.30, sales_allocation_ratio: 0.30, status: 'active' },
  { allocation_rule_id: 'R2', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-B', forecast_allocation_ratio: 0.70, sales_allocation_ratio: 0.70, status: 'active' }
];

// =====================================================================================================
section('Destination identity (§3)');
(function () {
  var m = DA.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, { marketplaces: MKTS });
  ok(m.ok && m.destination.destinationType === 'MARKETPLACE' && m.destination.destinationRefId === 'MP-KM-US-AMZ' && m.destination.marketplaceId === 'MP-KM-US-AMZ', '1 MARKETPLACE validates by marketplace_id');
  ok(m.ok && m.destination.warehouseId === null, '2 MARKETPLACE warehouseId remains null');
  var w = DA.normalizeRecommendationDestination({ destinationType: 'WAREHOUSE', company: 'KM', warehouseId: 'WH-A' }, { warehouses: WHS });
  ok(w.ok && w.destination.destinationType === 'WAREHOUSE' && w.destination.warehouseId === 'WH-A' && w.destination.destinationRefId === 'WH-A', '3 WAREHOUSE validates by warehouse_id');
  // label must never be identity: a display-name-only marketplace input fails (no marketplace_id resolvable)
  var lbl = DA.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: 'KM', country: 'US', marketplace: 'Amazon US' }, { marketplaces: MKTS });
  ok(!lbl.ok && lbl.issues[0].code === 'MARKETPLACE_DESTINATION_NOT_FOUND', '4 labels are never identity (display name ≠ marketplace code)');
  var miss = DA.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: 'KM', country: 'US', marketplace: 'WALMART_US' }, { marketplaces: MKTS });
  var inact = DA.normalizeRecommendationDestination({ destinationType: 'WAREHOUSE', company: 'KM', warehouseId: 'WH-OFF' }, { warehouses: WHS });
  var conf = DA.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, { marketplaces: MKTS_AMBIG });
  var xco = DA.normalizeRecommendationDestination({ destinationType: 'WAREHOUSE', company: 'KM', warehouseId: 'WH-CO2' }, { warehouses: WHS });
  ok(!miss.ok && miss.issues[0].code === 'MARKETPLACE_DESTINATION_NOT_FOUND'
    && !inact.ok && inact.issues[0].code === 'DESTINATION_WAREHOUSE_INACTIVE'
    && !conf.ok && conf.issues[0].code === 'MARKETPLACE_DESTINATION_CONFLICT'
    && !xco.ok && xco.issues[0].code === 'DESTINATION_COMPANY_MISMATCH', '5 missing/inactive/conflicting/cross-company fail closed');
  // no fake Amazon warehouse: a MARKETPLACE node carrying a warehouseId is rejected at the planning-context seam
  var pcx = require('../js/core/supply-planning-planning-context.js').resolveRecommendationPlanningContext({
    calculationMonth: '2026-08', planningCycle: 'RECO-2026-08', marketplaces: MKTS,
    receivers: [{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', destination: { destinationType: 'MARKETPLACE', marketplaceId: 'MP-KM-US-AMZ', warehouseId: 'WH-A' }, regularForecastByMonth: { '2026-09': 1, '2026-10': 1, '2026-11': 1, '2026-12': 1 } }]
  });
  ok(!pcx.ready && pcx.issues.some(function (i) { return i.code === 'MARKETPLACE_DESTINATION_SCOPE_MISMATCH'; }), '6 no fabricated Amazon warehouse (MARKETPLACE node with warehouseId rejected)');
})();

// =====================================================================================================
section('MARKETPLACE stock/demand (§5.1/§5.2)');
(function () {
  var dest = DA.normalizeRecommendationDestination({ destinationType: 'MARKETPLACE', company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, { marketplaces: MKTS }).destination;
  var d = R.resolveMarketplaceDemand({ destination: dest, calculationMonth: '2026-08', planningCycle: 'RECO-2026-08', marketplaces: MKTS, sku: 'CO1100', regularForecastByMonth: { '2026-09': 100, '2026-10': 100, '2026-11': 100, '2026-12': 100 } });
  ok(d.ready && d.qty === 400 && d.context.destinationWarehouseId === null && d.context.destinationType === 'MARKETPLACE', '7 Marketplace Forecast reaches the frozen KMPCX demand owner (Σ M+1..M+4)');
  var st = R.resolveMarketplaceCurrentStock({ rows: [{ country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', available_qty: 120 }], scope: SCOPE });
  ok(st.ready && st.qty === 120, '8 Amazon stock comes only from amazon_inventory_snapshot.available_qty');
  var stOv = R.resolveMarketplaceCurrentStock({ rows: [{ warehouseId: 'WH-A', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', quantity: 999 }], scope: SCOPE });
  ok(!stOv.ready && stOv.missing === true, '9 overseas inventory (warehouse-keyed) is excluded');
  var stFa = R.resolveMarketplaceCurrentStock({ rows: [{ warehouse_id: 'FACT', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', quantity: 999 }], scope: SCOPE });
  ok(!stFa.ready && stFa.missing === true, '10 factory stock is excluded');
  var stZero = R.resolveMarketplaceCurrentStock({ rows: [{ country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', available_qty: 0 }], scope: SCOPE });
  ok(stZero.ready && stZero.qty === 0, '11 explicit zero remains zero');
  var stMiss = R.resolveMarketplaceCurrentStock({ rows: [{ country: 'US', marketplace: 'AMAZON_US', sku: 'OTHER', available_qty: 5 }], scope: SCOPE });
  ok(!stMiss.ready && stMiss.missing === true && stMiss.qty === null, '12 missing Amazon stock is not zero');
  var stConf = R.resolveMarketplaceCurrentStock({ rows: [{ country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', available_qty: 120 }, { country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', available_qty: 200 }], scope: SCOPE });
  ok(!stConf.ready && stConf.conflict === true && stConf.issues[0].code === 'MARKETPLACE_STOCK_CONFLICT', '13 conflicting stock rows fail closed');
})();

// =====================================================================================================
section('MARKETPLACE incoming identity + completeness (§5.3/§5.4)');
(function () {
  var scopeDest = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', marketplaceId: 'MP-KM-US-AMZ' };
  function id(cands, mkts) { return R.resolveMarketplaceIncomingIdentity({ candidates: cands, marketplaces: mkts || MKTS, scope: scopeDest }); }
  ok(id([{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'shipped' }])[0].resolutionStatus === 'RESOLVED', '14 exact unique marketplace code resolves to marketplace_id');
  ok(id([{ company: 'KM', country: 'US', marketplace: 'MULTI', status: 'shipped' }])[0].resolutionStatus === 'UNRESOLVED', '15 MULTI remains unresolved');
  ok(id([{ company: 'KM', country: 'US', marketplace: '', status: 'shipped' }])[0].resolutionStatus === 'UNRESOLVED', '16 blank marketplace remains unresolved');
  var amb = id([{ company: 'KM', country: 'US', marketplace: 'AMAZON_US', status: 'shipped' }], MKTS_AMBIG)[0];
  ok(amb.resolutionStatus === 'UNRESOLVED' && amb.issueCode === 'MARKETPLACE_INCOMING_IDENTITY_CONFLICT', '17 ambiguous marketplace mapping remains unresolved');
  ok(id([{ destination_warehouse_id: 'WH-A', marketplace: 'AMAZON_US', status: 'shipped' }])[0].resolutionStatus === 'NOT_MARKETPLACE', '18 warehouse-destined incoming is excluded');

  var qiSpy = spyOn(QI, 'evaluateQualifiedIncoming');
  var res = R.resolveMarketplaceQualifiedIncoming({ candidates: [{ ref: 'SH1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', status: 'shipped', eta: '2026-08-20', quantity: 60 }], marketplaces: MKTS, scope: scopeDest, requiredByDate: '2026-09-01' });
  ok(qiSpy.count > 0 && res.confirmedQualifiedIncomingQty === 60, '19 resolved incoming passes through the existing QI evaluator');
  qiSpy.restore();
  var arr = R.resolveMarketplaceQualifiedIncoming({ candidates: [{ ref: 'SH-ARR', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', status: 'arrived', eta: '2026-08-25', quantity: 40 }], marketplaces: MKTS, scope: scopeDest, requiredByDate: '2026-09-01' });
  ok(arr.confirmedQualifiedIncomingQty === 40, '20 arrived remains in-transit incoming (still qualifying when timely)');
  var late = R.resolveMarketplaceQualifiedIncoming({ candidates: [{ ref: 'SH-LATE', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', status: 'shipped', eta: '2026-12-31', quantity: 40 }], marketplaces: MKTS, scope: scopeDest, requiredByDate: '2026-09-01' });
  ok(late.confirmedQualifiedIncomingQty === 0 && late.incomingCompleteness === 'COMPLETE', '21 late incoming remains visible but non-covering');
  var dup = R.resolveMarketplaceQualifiedIncoming({ candidates: [
    { ref: 'SHDUP', lineageKey: 'LK1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', status: 'shipped', eta: '2026-08-20', quantity: 60 },
    { ref: 'SHDUP', lineageKey: 'LK1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', status: 'shipped', eta: '2026-08-20', quantity: 60 }
  ], marketplaces: MKTS, scope: scopeDest, requiredByDate: '2026-09-01' });
  ok(dup.confirmedQualifiedIncomingQty === 60, '22 count-once remains enforced (identical lineage counted once)');
  var ext = R.resolveMarketplaceQualifiedIncoming({ candidates: [], externalIncomingResults: [{ adapterType: 'EXTERNAL_INCOMING_AUTHORITY', planningEligible: false, adapterEligibleQuantity: 0, observedQuantity: 50, quarantined: true, stateClass: 'QUARANTINED', candidate: { linkedShipmentId: '' } }], marketplaces: MKTS, scope: scopeDest, requiredByDate: '2026-09-01' });
  ok(ext.confirmedQualifiedIncomingQty === 0, '23 external incoming remains quarantined (never confirmed)');
  var part = R.resolveMarketplaceQualifiedIncoming({ candidates: [{ ref: 'SH-MULTI', company: 'KM', country: 'US', marketplace: 'MULTI', status: 'shipped', eta: '2026-08-20', quantity: 40 }], marketplaces: MKTS, scope: scopeDest, requiredByDate: '2026-09-01' });
  ok(part.incomingCompleteness === 'PARTIAL' && part.unresolvedIncomingCount === 1, '24 unresolved relevant incoming produces PARTIAL completeness');
  var recPart = R.resolveMarketplaceRecommendation({ demandQty: 1000, currentStockQty: 100, confirmedQualifiedIncomingQty: 0, incomingCompleteness: 'PARTIAL', unitsPerCarton: 12 });
  ok(recPart.blocked === true && recPart.recommendedQty === null, '25 PARTIAL completeness blocks the canonical recommendedQty');
  ok(recPart.provisionalOrderNeed !== null && typeof recPart.provisionalOrderNeed === 'number' && recPart.recommendedQty === null, '26 provisionalOrderNeed is clearly non-canonical (populated while recommendedQty is null)');
  var comp = R.resolveMarketplaceQualifiedIncoming({ candidates: [], marketplaces: MKTS, scope: scopeDest, requiredByDate: '2026-09-01' });
  var recComp = R.resolveMarketplaceRecommendation({ demandQty: 1000, currentStockQty: 100, confirmedQualifiedIncomingQty: comp.confirmedQualifiedIncomingQty, incomingCompleteness: comp.incomingCompleteness, unitsPerCarton: 12 });
  ok(comp.incomingCompleteness === 'COMPLETE' && recComp.blocked === false && recComp.recommendedQty === 900, '27 no unresolved rows → COMPLETE + canonical recommendation');
})();

// =====================================================================================================
section('Resolver ownership (§6/§7 frozen owners)');
(function () {
  var mDest = { destinationType: 'MARKETPLACE', destinationRefId: 'MP-KM-US-AMZ', marketplaceId: 'MP-KM-US-AMZ', warehouseId: null, company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
  var wDest = { destinationType: 'WAREHOUSE', destinationRefId: 'WH-A', warehouseId: 'WH-A', company: 'KM', country: 'US', marketplace: 'AMAZON_US' };
  var sOrder = spyOn(CALC, 'calculateSuggestedOrderQty'), sShip = spyOn(CALC, 'calculateShippingAndResidual'), sGap = spyOn(CALC, 'calculateGap');
  R.resolveMarketplaceRecommendation({ demandQty: 1000, currentStockQty: 100, incomingCompleteness: 'COMPLETE', unitsPerCarton: 12 });
  ok(sOrder.count > 0, '28 MARKETPLACE invokes the existing Monthly resolver (calculateSuggestedOrderQty)');
  ok(sShip.count === 0, '29 MARKETPLACE does not invoke the Weekly resolver (calculateShippingAndResidual)');
  var gapAfterMkt = sGap.count;
  R.resolveWarehouseRecommendation({ destinationNode: wDest, allocatedForecastQty: 300, currentStockQty: 50, qualifiedIncomingQty: 0, allocatedSupplyQty: 500, unitsPerCarton: 12 });
  ok(sShip.count > 0, '30 WAREHOUSE invokes the existing Weekly resolver (calculateShippingAndResidual)');
  ok(sGap.count === gapAfterMkt + 1 && gapAfterMkt >= 1, '31 calculateGap owner is reused by BOTH paths');
  ok(sOrder.count >= 1 && sShip.count >= 1, '32 carton-rounding owners reused (CEIL Monthly + FLOOR Weekly)');
  sOrder.restore(); sShip.restore(); sGap.restore();
  var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-destination-runtime.js'), 'utf8');
  ok(!/Math\.ceil\s*\(/.test(src) && !/Math\.floor\s*\(/.test(src), '33 no duplicated carton-rounding formula source in the runtime module');
})();

// =====================================================================================================
section('Warehouse fanout (§7)');
(function () {
  function fan(fc, rules) { return DA.resolveScopeWarehouseDemandFacts({ scope: { company: 'KM', country: 'US', marketplace: 'AMAZON_US' }, allocationRules: rules || RULES, warehousesById: { 'WH-A': WHS[0], 'WH-B': WHS[1] }, effectiveDate: '2026-08', marketplaceForecastQty: fc }); }
  var f1000 = fan(1000); var a1000 = f1000.warehouses.filter(function (w) { return w.warehouseId === 'WH-A'; })[0]; var b1000 = f1000.warehouses.filter(function (w) { return w.warehouseId === 'WH-B'; })[0];
  ok(a1000.allocatedForecastQty === 300 && b1000.allocatedForecastQty === 700, '34 configured 30/70 gives 300/700 for 1000');
  var f1001 = fan(1001); var a1001 = f1001.warehouses.filter(function (w) { return w.warehouseId === 'WH-A'; })[0]; var b1001 = f1001.warehouses.filter(function (w) { return w.warehouseId === 'WH-B'; })[0];
  ok(a1001.allocatedForecastQty === 300 && b1001.allocatedForecastQty === 701, '35 1001 gives 300/701 (largest-remainder)');
  ok(a1001.allocatedForecastQty + b1001.allocatedForecastQty === 1001, '36 total demand is conserved');
  function whRun(waStock, wbStock, target) {
    return R.resolveUnifiedDestinationRecommendation(
      { marketplaces: MKTS, warehouses: WHS, allocationRules: RULES },
      { scope: SCOPE, destination: { destinationType: 'WAREHOUSE', warehouseId: target }, calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' },
      { marketplaceForecastQty: 1000, marketplaceSalesQty: 100, unitsPerCarton: 12, perWarehouseSupply: { 'WH-A': { currentStockQty: waStock, qualifiedIncomingQty: 0, allocatedSupplyQty: 5000 }, 'WH-B': { currentStockQty: wbStock, qualifiedIncomingQty: 0, allocatedSupplyQty: 5000 } } }
    );
  }
  var bLow = whRun(0, 100, 'WH-B'); var bHigh = whRun(99999, 100, 'WH-B');
  ok(bLow.line.calculatedGap === bHigh.line.calculatedGap && bLow.line.recommendedQty === bHigh.line.recommendedQty, '37 Warehouse A stock never affects Warehouse B');
  function whRunInc(waInc, target) {
    return R.resolveUnifiedDestinationRecommendation(
      { marketplaces: MKTS, warehouses: WHS, allocationRules: RULES },
      { scope: SCOPE, destination: { destinationType: 'WAREHOUSE', warehouseId: target }, calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' },
      { marketplaceForecastQty: 1000, unitsPerCarton: 12, perWarehouseSupply: { 'WH-A': { currentStockQty: 0, qualifiedIncomingQty: waInc, allocatedSupplyQty: 5000 }, 'WH-B': { currentStockQty: 100, qualifiedIncomingQty: 0, allocatedSupplyQty: 5000 } } }
    );
  }
  ok(whRunInc(0, 'WH-B').line.calculatedGap === whRunInc(99999, 'WH-B').line.calculatedGap, '38 Warehouse A incoming never affects Warehouse B');
  ok(fan(1000, []).ready === false && fan(1000, []).issues.some(function (i) { return i.code === 'DEMAND_ALLOCATION_RULE_NOT_CONFIGURED'; }), '39 missing rules fail closed');
  var badTotal = [{ allocation_rule_id: 'R1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-A', forecast_allocation_ratio: 0.30, sales_allocation_ratio: 0.30, status: 'active' }, { allocation_rule_id: 'R2', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-B', forecast_allocation_ratio: 0.50, sales_allocation_ratio: 0.50, status: 'active' }];
  ok(fan(1000, badTotal).ready === false && fan(1000, badTotal).issues.some(function (i) { return i.code === 'DEMAND_ALLOCATION_RATIO_TOTAL_INVALID'; }), '40 invalid ratio total fails closed');
  var overlap = RULES.concat([{ allocation_rule_id: 'R1b', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-A', forecast_allocation_ratio: 0.30, sales_allocation_ratio: 0.30, status: 'active', effective_from: '2026-01-01', effective_to: '2027-01-01' }]);
  ok(fan(1000, overlap).ready === false, '41 overlapping rules fail closed');
})();

// =====================================================================================================
section('Safety / determinism (§10)');
(function () {
  var raw = { marketplaces: MKTS, warehouses: WHS, amazonInventory: [{ country: 'US', marketplace: 'AMAZON_US', sku: 'CO1100', available_qty: 120 }], marketplaceIncomingCandidates: [] };
  var req = { scope: SCOPE, destination: { destinationType: 'MARKETPLACE' }, calculationMonth: '2026-08', planningCycle: 'RECO-2026-08' };
  var opt = { marketplaceDemandQty: 1000, unitsPerCarton: 12 };
  var before = JSON.stringify([raw, req, opt]);
  var r1 = R.resolveUnifiedDestinationRecommendation(raw, req, opt);
  var after = JSON.stringify([raw, req, opt]);
  ok(before === after, '42 no input mutation');
  var r2 = R.resolveUnifiedDestinationRecommendation({ marketplaces: MKTS.slice().reverse(), warehouses: WHS.slice().reverse(), amazonInventory: raw.amazonInventory, marketplaceIncomingCandidates: [] }, req, opt);
  ok(JSON.stringify(r1.line) === JSON.stringify(r2.line), '43 permutation-invariant output');
  var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'core', 'supply-planning-destination-runtime.js'), 'utf8');
  var scan = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''); // strip comments before negative scans
  ok(!/Date\.now|new Date\s*\(|Math\.random|toLocale/.test(scan), '44 no Date.now / new Date / RNG / locale source');
  ok(!/setValues|appendRow|getRange\s*\(|deleteRow|clearContent/.test(scan), '45 no Sheet writes');
  ok(!/getOperationDb|loadOperationDb|SpreadsheetApp/.test(scan), '46 no getOperationDb / SpreadsheetApp');
  ok(!/insertSheet|setColumnWidth|deleteColumn|setFrozenRows/.test(scan), '47 no schema/header mutation');
})();

// =====================================================================================================
section('Golden Matrix + full-suite health (§10)');
(function () {
  var out;
  try { out = cp.execSync('node assets/tests/supply-planning-golden-scenarios.test.js', { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' }); }
  catch (e) { out = (e.stdout || '') + (e.stderr || ''); }
  ok(/39\/40 scenarios EXECUTED_EXISTING_CORE and PASSED/.test(out), '48 Golden Matrix remains ≥ 39/1/0');
  ok(/1\/40 scenarios IMPLEMENTATION_PENDING/.test(out) && /0\/40 scenarios reported as CANONICAL-BLOCKED/.test(out), '49 Scenario #34 remains Pending (1 pending / 0 blocked)');
  ok(typeof R.resolveUnifiedDestinationRecommendation === 'function' && typeof R.resolveMarketplaceRecommendation === 'function' && typeof R.resolveWarehouseRecommendation === 'function' && typeof R.resolveMarketplaceQualifiedIncoming === 'function' && typeof R.normalizeRecommendationDestination === 'function', '50 unified core entry + §5–§8 owners exported');
})();

console.log('\n----------------------------------------');
console.log('DESTINATION RUNTIME (F1-4B-FM1): ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { process.exitCode = 1; }
