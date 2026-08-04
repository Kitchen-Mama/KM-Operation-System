// Kitchen Mama Operation System — Apps Script Recommendation Source Reader tests (Phase 2C, Round 1P).
// Run: node assets/tests/supply-planning-source-reader.test.js
// Pure Node — exercises supply-planning-source-reader.js. Verifies Sheet Row → Domain Object → Runtime DTO
// mapping, null/type/enum/identity normalize, column rename, fail-closed error handling, purity/determinism,
// the demandKey identity linker, and a FULL Reader → Ledger → projectAllocationInputs → Weekly/Monthly Resolver
// → Bridge → Plan Builder integration (NO persistence). New assertion count reported separately.

'use strict';
var R = require('../js/core/supply-planning-source-reader.js');
var SF = require('../js/core/supply-planning-source-facts.js');
var LEDGER = require('../js/core/supply-planning-ledgers.js');
var BR = require('../js/core/supply-planning-plan-bridge.js');
var PB = require('../js/core/supply-planning-plan-builder.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function throwsRange(fn, l) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', sku: 'CO1100-R' };
var MSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };

// ---- canonical mock sheets (object-row form) ------------------------------------------------------------
function weeklySheets() {
  return {
    demand: [{ demand_type: 'REGULAR', source_ref: 'd1', required_by_date: '2026-09-01', quantity: 100, sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL', planning_cycle: '2026-W40' }],
    supply: [{ pool_type: 'THREE_PL', warehouse_id: 'WH-3PL', quantity: 100, sku: 'CO1100-R', company: 'KM', supply_lineage_ref: 'sp' }],
    receivers: [{ receiver_key: 'R1', demand_source_ref: 'd1', eligible_pool_types: 'THREE_PL', survival_need_qty: 50, allocation_priority: 1, demand_weight: 1, fulfillment_model: 'self_fulfilled', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL' }],
    planningFacts: [{ recommendation_type: 'WEEKLY_SHIPPING', sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', demand_source_ref: 'd1', calculated_gap_qty: 100, units_per_carton: 12 }]
  };
}
function monthlySheets() {
  return {
    demand: [{ demand_type: 'REGULAR', source_ref: 'd1', required_by_date: '2026-09-01', quantity: 100, sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL', planning_cycle: '2026-M08' }],
    supply: [{ pool_type: 'FACTORY', warehouse_id: 'WH-FAC', quantity: 60, sku: 'CO1100-R', company: 'KM', supply_lineage_ref: 'fs' }],
    factoryDemands: [{ demand_source_ref: 'd1', eligible_factory_warehouse_ids: 'WH-FAC', allocation_priority: 1, marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL', required_by_date: '2026-09-01' }],
    planningFacts: [{ recommendation_type: 'MONTHLY_ORDER', sku: 'CO1100-R', site_sku: 'ST-1', request_month: '2026-09', request_bucket: 'B1', demand_source_ref: 'd1', net_order_need_snapshot: 13, units_per_carton: 12 }]
  };
}
function readW(sheets, over) { var inp = { sheets: sheets || weeklySheets(), scope: WSCOPE, planningCycle: '2026-W40', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' }; if (over) for (var k in over) inp[k] = over[k]; return R.readWeeklyRecommendationSource(inp); }
function readM(sheets, over) { var inp = { sheets: sheets || monthlySheets(), scope: MSCOPE, planningCycle: '2026-M08', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' }; if (over) for (var k in over) inp[k] = over[k]; return R.readMonthlyRecommendationSource(inp); }

// ==========================================================================
section('A. Public API + DTO shape');
(function () {
  ok(typeof R.readWeeklyRecommendationSource === 'function' && typeof R.readMonthlyRecommendationSource === 'function' && typeof R.createRecommendationSourceReader === 'function', 'A1 public API present (no second reader)');
  var dto = readW();
  eq([dto.recommendationType, dto.planningCycle, dto.formulaVersion, dto.sourceDataAsOf], ['WEEKLY_SHIPPING', '2026-W40', 'fv1', '2026-08-01'], 'A2 run-level fields mapped');
  eq(dto.businessScope, WSCOPE, 'A3 businessScope = caller scope');
  ok(Array.isArray(dto.demandLedgerInput.entries) && Array.isArray(dto.supplyLedgerInput.entries) && Array.isArray(dto.receiverFacts) && Array.isArray(dto.weeklyPlanningFacts), 'A4 DTO carries ledger inputs + facts (feeds resolver pipeline, not Plan Builder)');
  ok(!dto.hasOwnProperty('command') && !dto.hasOwnProperty('recommendedLines'), 'A5 reader does NOT emit Plan Builder output');
})();

section('B. Sheet Row → Domain Object mapping (column rename)');
(function () {
  var dto = readW();
  eq(dto.demandLedgerInput.entries[0], { demandType: 'REGULAR', masterSku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', planningCycle: '2026-W40', requiredByDate: '2026-09-01', sourceRef: 'd1', quantity: 100 }, 'B1 demand row → §39 demand entry (snake→camel rename)');
  eq(dto.supplyLedgerInput.entries[0], { supplyLineageRef: 'sp', masterSku: 'CO1100-R', company: 'KM', warehouseId: 'WH-3PL', poolType: 'THREE_PL', lifecycleBucket: 'CURRENT_STOCK', quantity: 100 }, 'B2 supply row → §39 supply entry');
  eq(dto.receiverFacts[0], { receiverKey: 'R1', demandRef: 'd1', eligiblePoolTypes: ['THREE_PL'], marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', fulfillmentModel: 'self_fulfilled', survivalNeedQty: 50, allocationPriority: 1, demandWeight: 1 }, 'B3 receiver row → allocation receiver fact (demandRef, not demandKey)');
  eq(dto.weeklyPlanningFacts[0], { recommendationType: 'WEEKLY_SHIPPING', demandRef: 'd1', sku: 'CO1100-R', siteSku: 'ST-1', windowCode: 'W40-A', company: 'KM', country: 'US', marketplace: 'AMAZON_US', calculatedGap: 100, unitsPerCarton: 12 }, 'B4 weekly planning row → weekly fact');
  var m = readM();
  eq(m.factoryDemandFacts[0], { demandRef: 'd1', eligibleFactoryWarehouseIds: ['WH-FAC'], marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', requiredByDate: '2026-09-01', allocationPriority: 1 }, 'B5 factory row → factory demand fact');
  eq(m.monthlyPlanningFacts[0], { recommendationType: 'MONTHLY_ORDER', demandRef: 'd1', masterSku: 'CO1100-R', siteSku: 'ST-1', requestMonth: '2026-09', requestBucket: 'B1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', netOrderNeed: 13, unitsPerCarton: 12 }, 'B6 monthly planning row → monthly fact');
})();

section('C. 2D header values form (Apps Script getValues) === object form');
(function () {
  var twoD = {
    demand: [['demand_type', 'source_ref', 'required_by_date', 'quantity', 'sku', 'company', 'country', 'marketplace', 'destination_warehouse_id', 'planning_cycle'],
             ['REGULAR', 'd1', '2026-09-01', 100, 'CO1100-R', 'KM', 'US', 'AMAZON_US', 'WH-3PL', '2026-W40']],
    supply: [['pool_type', 'warehouse_id', 'quantity', 'sku', 'company', 'supply_lineage_ref'],
             ['THREE_PL', 'WH-3PL', 100, 'CO1100-R', 'KM', 'sp']],
    receivers: [['receiver_key', 'demand_source_ref', 'eligible_pool_types', 'survival_need_qty', 'allocation_priority', 'demand_weight', 'fulfillment_model', 'marketplace', 'destination_warehouse_id'],
                ['R1', 'd1', 'THREE_PL', 50, 1, 1, 'self_fulfilled', 'AMAZON_US', 'WH-3PL']],
    planningFacts: [['recommendation_type', 'sku', 'site_sku', 'window_code', 'demand_source_ref', 'calculated_gap_qty', 'units_per_carton'],
                    ['WEEKLY_SHIPPING', 'CO1100-R', 'ST-1', 'W40-A', 'd1', 100, 12]]
  };
  eq(readW(twoD), readW(weeklySheets()), 'C1 2D getValues form maps identically to object-row form');
})();

section('D. Null / type / enum normalize (MISSING ≠ ZERO)');
(function () {
  // empty quantity cell → MISSING (excluded), never 0
  var s = weeklySheets(); s.demand[0].quantity = '';
  var dto = readW(s);
  eq(dto.demandLedgerInput.entries.length, 0, 'D1 missing demand quantity → excluded (never fabricated 0)');
  ok(dto.issues.some(function (x) { return x.reason.indexOf('MISSING_DEMAND_QUANTITY') === 0; }), 'D2 missing quantity surfaced as issue');
  // explicit 0 is a valid quantity (kept)
  var s0 = weeklySheets(); s0.demand[0].quantity = 0;
  eq(readW(s0).demandLedgerInput.entries[0].quantity, 0, 'D3 explicit 0 is a valid quantity (not treated as missing)');
  // invalid enum: bad demand_type → excluded + issue
  var sb = weeklySheets(); sb.demand[0].demand_type = 'WHATEVER';
  var db = readW(sb);
  eq([db.demandLedgerInput.entries.length, db.issues[0].reason], [0, 'INVALID_DEMAND_TYPE:WHATEVER'], 'D4 invalid demand_type enum → excluded + issue');
  // invalid pool_type
  var sp = weeklySheets(); sp.supply[0].pool_type = 'BOGUS';
  ok(readW(sp).issues.some(function (x) { return x.reason === 'INVALID_POOL_TYPE:BOGUS'; }), 'D5 invalid pool_type enum → issue');
  // invalid fulfillment_model → excluded receiver + issue
  var sf = weeklySheets(); sf.receivers[0].fulfillment_model = 'weird';
  ok(readW(sf).issues.some(function (x) { return x.reason === 'INVALID_FULFILLMENT_MODEL:weird'; }), 'D6 invalid fulfillment_model → issue');
  // eligible list: comma string → sorted deduped array
  var se = weeklySheets(); se.receivers[0].eligible_pool_types = 'THREE_PL, FBA, THREE_PL';
  eq(readW(se).receiverFacts[0].eligiblePoolTypes, ['FBA', 'THREE_PL'], 'D7 eligible_pool_types comma-string → sorted deduped list');
})();

section('E. Missing required + fail-closed structural errors');
(function () {
  var s = weeklySheets(); delete s.demand[0].source_ref;
  ok(readW(s).issues.some(function (x) { return x.reason === 'MISSING_SOURCE_REF'; }), 'E1 missing source_ref → excluded + issue (no fallback)');
  var s2 = weeklySheets(); delete s2.demand[0].destination_warehouse_id;
  ok(readW(s2).issues.some(function (x) { return x.reason === 'MISSING_DESTINATION_WAREHOUSE_ID'; }), 'E2 missing destination_warehouse_id → issue');
  // run-level required
  throwsType(function () { R.readWeeklyRecommendationSource(null); }, 'E3 null input → TypeError');
  throwsType(function () { R.readWeeklyRecommendationSource({ planningCycle: '2026-W40' }); }, 'E4 missing scope → TypeError');
  throwsType(function () { R.readWeeklyRecommendationSource({ scope: WSCOPE }); }, 'E5 missing planningCycle → TypeError');
  // malformed sheet values
  throwsType(function () { readW({ demand: 42 }); }, 'E6 non-array sheet values → TypeError');
  throwsType(function () { readW({ demand: [42] }); }, 'E7 non-object row → TypeError');
  // planning cycle mismatch on a row → excluded
  var sc = weeklySheets(); sc.demand[0].planning_cycle = '2026-W41';
  ok(readW(sc).issues.some(function (x) { return x.reason.indexOf('PLANNING_CYCLE_MISMATCH') === 0; }), 'E8 row planning_cycle ≠ run planning_cycle → excluded + issue');
  // formula_version mismatch on a fact → excluded
  var sfv = weeklySheets(); sfv.planningFacts[0].formula_version = 'fvX';
  ok(readW(sfv).issues.some(function (x) { return x.reason.indexOf('FORMULA_VERSION_MISMATCH') === 0; }), 'E9 fact formula_version ≠ run formula_version → excluded + issue');
})();

section('F. Duplicate identity — fail closed');
(function () {
  // duplicate weekly line identity (sku|site_sku|window_code)
  var s = weeklySheets(); s.planningFacts.push({ recommendation_type: 'WEEKLY_SHIPPING', sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', demand_source_ref: 'd1', calculated_gap_qty: 50, units_per_carton: 12 });
  throwsRange(function () { readW(s); }, 'F1 duplicate Weekly line identity → RangeError');
  var m = monthlySheets(); m.planningFacts.push({ recommendation_type: 'MONTHLY_ORDER', sku: 'CO1100-R', request_month: '2026-09', request_bucket: 'B1', demand_source_ref: 'd1', net_order_need_snapshot: 20, units_per_carton: 12 });
  throwsRange(function () { readM(m); }, 'F2 duplicate Monthly line identity → RangeError');
  // ambiguous demandRef (two demandKeys sharing trailing segment) → resolveDemandKeys fails closed
  var dl = LEDGER.buildDemandLedger({ entries: [
    { demandType: 'REGULAR', masterSku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-A', planningCycle: '2026-W40', requiredByDate: '2026-09-01', sourceRef: 'shared', quantity: 10 },
    { demandType: 'REGULAR', masterSku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-B', planningCycle: '2026-W40', requiredByDate: '2026-09-01', sourceRef: 'shared', quantity: 20 }
  ] });
  throwsRange(function () { R.resolveDemandKeys({ receiverFacts: [{ receiverKey: 'R1', demandRef: 'shared' }] }, dl); }, 'F3 ambiguous demandRef → RangeError (fail closed)');
})();

section('G. demandKey linker — identity normalize (never recomputed)');
(function () {
  var dto = readW();
  var dl = LEDGER.buildDemandLedger(dto.demandLedgerInput);
  var linked = R.resolveDemandKeys(dto, dl);
  var emitted = dl.entries[0].demandKey;
  eq(linked.receiverFacts[0].demandKey, emitted, 'G1 receiver fact linked to ledger-EMITTED demandKey');
  eq(linked.weeklyPlanningFacts[0].demandKey, emitted, 'G2 weekly fact linked to ledger demandKey');
  ok(!linked.receiverFacts[0].hasOwnProperty('demandRef'), 'G3 demandRef consumed (replaced by demandKey)');
  // unknown demandRef → no demandKey (downstream blocks fail-closed; never fabricated)
  var linked2 = R.resolveDemandKeys({ weeklyPlanningFacts: [{ sku: 'X', demandRef: 'nope' }] }, dl);
  ok(!linked2.weeklyPlanningFacts[0].hasOwnProperty('demandKey'), 'G4 unknown demandRef → demandKey omitted (no fabrication)');
})();

section('H. Purity / determinism');
(function () {
  var sheets = weeklySheets();
  var inp = { sheets: sheets, scope: WSCOPE, planningCycle: '2026-W40', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' };
  var snap = JSON.stringify(inp);
  var a1 = R.readWeeklyRecommendationSource(inp);
  ok(JSON.stringify(inp) === snap, 'H1 input not mutated');
  var a2 = R.readWeeklyRecommendationSource(inp);
  eq(a1, a2, 'H2 repeat deep-equal (deterministic)');
  ok(a1 !== a2 && a1.demandLedgerInput !== a2.demandLedgerInput, 'H3 fresh output objects');
  a1.demandLedgerInput.entries.push({ tampered: 1 });
  eq(R.readWeeklyRecommendationSource(inp).demandLedgerInput.entries.length, 1, 'H4 mutating a prior result does not leak');
  // custom column map via factory
  var custom = R.createRecommendationSourceReader({ columns: { demand: { quantity: 'qty' } } });
  var s = weeklySheets(); s.demand[0].qty = s.demand[0].quantity; delete s.demand[0].quantity;
  eq(custom.readWeeklyRecommendationSource({ sheets: s, scope: WSCOPE, planningCycle: '2026-W40' }).demandLedgerInput.entries[0].quantity, 100, 'H5 createRecommendationSourceReader honors custom column map');
})();

section('I. Integration — Reader → Ledger → Allocation → Weekly Resolver → Bridge → Plan Builder');
(function () {
  var dto = readW();
  var dl = LEDGER.buildDemandLedger(dto.demandLedgerInput);
  var sl = LEDGER.buildSupplyLedger(dto.supplyLedgerInput);
  var linked = R.resolveDemandKeys(dto, dl);
  var ap = SF.projectAllocationInputs({ identity: dto.identity, demandLedger: dl, supplyLedger: sl, receiverFacts: linked.receiverFacts });
  var facts = SF.resolveWeeklyRecommendationFacts({ planningCycle: dto.planningCycle, businessScope: dto.businessScope, allocationProjection: ap, weeklyPlanningFacts: linked.weeklyPlanningFacts, formulaVersion: dto.formulaVersion, sourceDataAsOf: dto.sourceDataAsOf, demandLedger: dl });
  eq([facts.lines.length, facts.lines[0].recommendedQty, facts.lines[0].blockedReason], [1, 96, null], 'I1 Weekly resolver produces recommendedQty 96 from reader source');
  var bridged = BR.bridgeRecommendationFactsToPlan({ recommendationFacts: facts, mode: 'SCHEDULED_REFRESH', calculationRunId: 'RUN-1', draftVersion: 1 });
  var cmd = PB.buildRecommendation(bridged);
  eq([cmd.recommendationType, cmd.command.recommendedLines[0].recommendedQty], ['WEEKLY_SHIPPING', 96], 'I2 Plan Builder accepts bridged reader-sourced Weekly facts');
  eq(PB.splitLineKey('WEEKLY_SHIPPING', cmd.command.recommendedLines[0].lineKey), { sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A' }, 'I3 natural key intact end-to-end');
})();

section('J. Integration — Monthly Reader → … → Plan Builder');
(function () {
  var dto = readM();
  var dl = LEDGER.buildDemandLedger(dto.demandLedgerInput);
  var sl = LEDGER.buildSupplyLedger(dto.supplyLedgerInput);
  var linked = R.resolveDemandKeys(dto, dl);
  var ap = SF.projectAllocationInputs({ identity: dto.identity, demandLedger: dl, supplyLedger: sl, factoryDemandFacts: linked.factoryDemandFacts });
  var facts = SF.resolveMonthlyRecommendationFacts({ planningCycle: dto.planningCycle, businessScope: dto.businessScope, allocationProjection: ap, monthlyPlanningFacts: linked.monthlyPlanningFacts, formulaVersion: dto.formulaVersion, sourceDataAsOf: dto.sourceDataAsOf, demandLedger: dl });
  eq([facts.lines.length, facts.lines[0].recommendedQty, facts.lines[0].netOrderNeed], [1, 24, 13], 'J1 Monthly resolver: recommendedQty CEILING(13/12)*12 = 24');
  var cmd = PB.buildRecommendation(BR.bridgeRecommendationFactsToPlan({ recommendationFacts: facts, mode: 'MANUAL_REGENERATE', calculationRunId: 'RUN-2', draftVersion: 1 }));
  eq([cmd.recommendationType, cmd.generationType, cmd.command.recommendedLines[0].recommendedQty], ['MONTHLY_ORDER', 'manual_refresh', 24], 'J2 Plan Builder accepts bridged reader-sourced Monthly facts');
  eq(PB.splitLineKey('MONTHLY_ORDER', cmd.command.recommendedLines[0].lineKey), { request_month: '2026-09', request_bucket: 'B1' }, 'J3 Monthly natural key intact end-to-end');
})();

section('K. Blocked row surfaced, valid rows continue');
(function () {
  // one good demand + one blocked (missing qty) → good row kept, blocked surfaced
  var s = weeklySheets();
  s.demand.push({ demand_type: 'REGULAR', source_ref: 'd2', required_by_date: '2026-09-02', quantity: '', sku: 'CO1100-R', company: 'KM', destination_warehouse_id: 'WH-3PL', planning_cycle: '2026-W40' });
  var dto = readW(s);
  eq(dto.demandLedgerInput.entries.length, 1, 'K1 valid demand row kept; blocked row excluded');
  ok(dto.issues.some(function (x) { return x.reason.indexOf('MISSING_DEMAND_QUANTITY:d2') === 0; }), 'K2 blocked row surfaced with its source_ref');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1P Apps Script Source Reader assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
