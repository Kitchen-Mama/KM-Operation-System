// Kitchen Mama Operation System — Recommendation Orchestrator ↔ Source Reader integration tests (Round 1Q).
// Run: node assets/tests/supply-planning-recommendation-source-integration.test.js
// Proves the SOURCE_READER_PENDING seam is replaced by the REAL Round 1P reader, composed with the frozen
// Ledger / Allocation / Weekly-Monthly Resolver / Bridge runtimes, and driven end-to-end through the UNCHANGED
// locked Orchestrator (via deps.computeFacts) to the Plan Builder — NO persistence write. Covers routing,
// reader-issue propagation, structural fail-closed, demandKey ownership, purity, and boundary.

'use strict';
var INT = require('../js/core/supply-planning-recommendation-source-integration.js');
var ORCH = require('../js/core/supply-planning-recommendation-orchestrator.js');
var SR = require('../js/core/supply-planning-source-reader.js');
var PB = require('../js/core/supply-planning-plan-builder.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function throwsRange(fn, l) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var WSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen', sku: 'CO1100-R' };
var MSCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };
var W_ORCH_SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen' };
var M_ORCH_SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };

function weeklyInput() {
  return {
    recommendationType: 'WEEKLY_SHIPPING',
    sheets: {
      demand: [{ demand_type: 'REGULAR', source_ref: 'd1', required_by_date: '2026-09-01', quantity: 100, sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL', planning_cycle: '2026-W40' }],
      supply: [{ pool_type: 'THREE_PL', warehouse_id: 'WH-3PL', quantity: 100, sku: 'CO1100-R', company: 'KM', supply_lineage_ref: 'sp' }],
      receivers: [{ receiver_key: 'R1', demand_source_ref: 'd1', eligible_pool_types: 'THREE_PL', survival_need_qty: 50, allocation_priority: 1, demand_weight: 1, fulfillment_model: 'self_fulfilled', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL' }],
      planningFacts: [{ recommendation_type: 'WEEKLY_SHIPPING', sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', demand_source_ref: 'd1', calculated_gap_qty: 100, units_per_carton: 12 }]
    },
    scope: WSCOPE, planningCycle: '2026-W40', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01'
  };
}
function monthlyInput() {
  return {
    recommendationType: 'MONTHLY_ORDER',
    sheets: {
      demand: [{ demand_type: 'REGULAR', source_ref: 'd1', required_by_date: '2026-09-01', quantity: 100, sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL', planning_cycle: '2026-M08' }],
      supply: [{ pool_type: 'FACTORY', warehouse_id: 'WH-FAC', quantity: 60, sku: 'CO1100-R', company: 'KM', supply_lineage_ref: 'fs' }],
      factoryDemands: [{ demand_source_ref: 'd1', eligible_factory_warehouse_ids: 'WH-FAC', allocation_priority: 1, marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-3PL', required_by_date: '2026-09-01' }],
      planningFacts: [{ recommendation_type: 'MONTHLY_ORDER', sku: 'CO1100-R', site_sku: 'ST-1', request_month: '2026-09', request_bucket: 'B1', demand_source_ref: 'd1', net_order_need_snapshot: 13, units_per_carton: 12 }]
    },
    scope: MSCOPE, planningCycle: '2026-M08', formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01'
  };
}

// spy reader that counts which read* the integration calls (proves "never the other reader")
function spyReader() {
  var calls = { weekly: 0, monthly: 0 };
  var s = {
    readWeeklyRecommendationSource: function (i) { calls.weekly++; return SR.readWeeklyRecommendationSource(i); },
    readMonthlyRecommendationSource: function (i) { calls.monthly++; return SR.readMonthlyRecommendationSource(i); },
    resolveDemandKeys: SR.resolveDemandKeys, createRecommendationSourceReader: SR.createRecommendationSourceReader
  };
  return { s: s, calls: calls };
}
// drive the UNCHANGED orchestrator with a fake locked apply that CAPTURES the plan (no persistence write)
function runOrch(sourceInput, type, orchScope, mode) {
  var captured = null;
  var r = ORCH.runRecommendationGeneration(
    { recommendationType: type, mode: mode, planningCycle: sourceInput.planningCycle, businessScope: orchScope, actor: 'sys', now: 'T' },
    { loadActiveContext: function () { return { status: 'CREATE' }; }, loadPriorSnapshot: function () { return null; },
      computeFacts: INT.createComputeFacts(sourceInput, { mode: mode }), lockedApply: function (p) { captured = p; return { status: 'COMPLETED' }; } }
  );
  return { r: r, plan: captured };
}
function recQtyOf(plan) { return plan.lineOps.map(function (o) { return o.row && o.row.recommended_qty; }).filter(function (v) { return typeof v === 'number'; }); }

// ==========================================================================
section('A. Weekly routing → full chain → Plan Builder (recommendedQty 96)');
(function () {
  eq(INT.selectReaderName('WEEKLY_SHIPPING'), 'readWeeklyRecommendationSource', 'A1 routing selects Weekly reader');
  var sp = spyReader();
  var integ = INT.createRecommendationSourceIntegration({ KMSR: sp.s });
  var full = integ.resolveRecommendationFactsFromSource(weeklyInput(), { mode: 'SCHEDULED_REFRESH' });
  eq([sp.calls.weekly, sp.calls.monthly], [1, 0], 'A2 Weekly reader used; Monthly reader NEVER called');
  eq([full.ready, full.reason, full.recommendationType], [true, null, 'WEEKLY_SHIPPING'], 'A3 ready weekly facts');
  eq(full.bridgeResult.lines[0].recommendedQty, 96, 'A4 recommendedQty 96 (verified example) through the real chain');
  var cmd = PB.buildRecommendation(full.bridgeResult);
  eq([cmd.recommendationType, cmd.command.recommendedLines[0].recommendedQty], ['WEEKLY_SHIPPING', 96], 'A5 Plan Builder accepts reader-sourced Weekly facts → 96');
  var o = runOrch(weeklyInput(), 'WEEKLY_SHIPPING', W_ORCH_SCOPE, 'SCHEDULED_REFRESH');
  eq([o.r.status, o.r.coreAction, o.r.generationType], ['COMPLETED', 'CREATE', 'scheduled'], 'A6 orchestrator runs the reader-backed chain end-to-end → COMPLETED');
  eq(recQtyOf(o.plan), [96], 'A7 recommended_qty 96 reaches the locked-apply plan via the Orchestrator');
})();

section('B. Monthly routing → full chain → Plan Builder (CEILING 24, manual_refresh)');
(function () {
  eq(INT.selectReaderName('MONTHLY_ORDER'), 'readMonthlyRecommendationSource', 'B1 routing selects Monthly reader');
  var sp = spyReader();
  var integ = INT.createRecommendationSourceIntegration({ KMSR: sp.s });
  var full = integ.resolveRecommendationFactsFromSource(monthlyInput(), { mode: 'MANUAL_REGENERATE' });
  eq([sp.calls.monthly, sp.calls.weekly], [1, 0], 'B2 Monthly reader used; Weekly reader NEVER called');
  eq([full.ready, full.bridgeResult.lines[0].recommendedQty], [true, 24], 'B3 CEILING(13/12)*12 = 24 through the real chain');
  var o = runOrch(monthlyInput(), 'MONTHLY_ORDER', M_ORCH_SCOPE, 'MANUAL_REGENERATE');
  eq([o.r.status, o.r.generationType], ['COMPLETED', 'manual_refresh'], 'B4 orchestrator COMPLETED; generationType manual_refresh');
  eq(recQtyOf(o.plan), [24], 'B5 recommended_qty 24 reaches the locked-apply plan');
})();

section('C. Reader issues propagation (valid rows continue; issues not lost)');
(function () {
  var inp = weeklyInput();
  inp.sheets.demand.push({ demand_type: 'WHATEVER', source_ref: 'bad', required_by_date: '2026-09-03', quantity: 5, sku: 'CO1100-R', company: 'KM', destination_warehouse_id: 'WH-3PL', planning_cycle: '2026-W40' });
  var full = INT.resolveRecommendationFactsFromSource(inp, { mode: 'SCHEDULED_REFRESH' });
  ok(full.sourceIssues.some(function (x) { return x.stage === 'reader' && x.reason === 'INVALID_DEMAND_TYPE:WHATEVER'; }), 'C1 reader issue surfaced in sourceIssues (not cleared)');
  eq([full.ready, full.bridgeResult.lines[0].recommendedQty], [true, 96], 'C2 valid row continues → recommendedQty 96 (invalid row excluded, not fabricated)');
  eq(full.ledgerResult.demandLedger.entries.length, 1, 'C3 only the valid demand row entered the ledger');
})();

section('D. Structural fail-closed (propagated, no fallback)');
(function () {
  var noScope = weeklyInput(); delete noScope.scope;
  throwsType(function () { INT.resolveRecommendationFactsFromSource(noScope, {}); }, 'D1 missing scope → TypeError (propagated)');
  var noCycle = weeklyInput(); delete noCycle.planningCycle;
  throwsType(function () { INT.resolveRecommendationFactsFromSource(noCycle, {}); }, 'D2 missing planningCycle → TypeError');
  var badSheet = weeklyInput(); badSheet.sheets.demand = 42;
  throwsType(function () { INT.resolveRecommendationFactsFromSource(badSheet, {}); }, 'D3 invalid sheet values → TypeError');
  var dupW = weeklyInput(); dupW.sheets.planningFacts.push({ recommendation_type: 'WEEKLY_SHIPPING', sku: 'CO1100-R', site_sku: 'ST-1', window_code: 'W40-A', demand_source_ref: 'd1', calculated_gap_qty: 50, units_per_carton: 12 });
  throwsRange(function () { INT.resolveRecommendationFactsFromSource(dupW, {}); }, 'D4 duplicate Weekly identity → RangeError');
  var dupM = monthlyInput(); dupM.sheets.planningFacts.push({ recommendation_type: 'MONTHLY_ORDER', sku: 'CO1100-R', request_month: '2026-09', request_bucket: 'B1', demand_source_ref: 'd1', net_order_need_snapshot: 20, units_per_carton: 12 });
  throwsRange(function () { INT.resolveRecommendationFactsFromSource(dupM, {}); }, 'D5 duplicate Monthly identity → RangeError');
  var amb = weeklyInput();
  amb.sheets.demand = [
    { demand_type: 'REGULAR', source_ref: 'shared', required_by_date: '2026-09-01', quantity: 10, sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-A', planning_cycle: '2026-W40' },
    { demand_type: 'REGULAR', source_ref: 'shared', required_by_date: '2026-09-01', quantity: 20, sku: 'CO1100-R', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destination_warehouse_id: 'WH-B', planning_cycle: '2026-W40' }
  ];
  amb.sheets.receivers[0].demand_source_ref = 'shared'; amb.sheets.planningFacts[0].demand_source_ref = 'shared';
  throwsRange(function () { INT.resolveRecommendationFactsFromSource(amb, {}); }, 'D6 ambiguous demandRef → RangeError (fail closed)');
})();

section('E. demandKey ownership (Ledger-owned; never recomputed; unknown ref fails closed)');
(function () {
  var full = INT.resolveRecommendationFactsFromSource(weeklyInput(), {});
  var ledgerKey = full.ledgerResult.demandLedger.entries[0].demandKey;
  eq(full.bridgeResult.lines[0].demandKey, ledgerKey, 'E1 line demandKey === Ledger-EMITTED demandKey (not recomputed)');
  // unknown demandRef on the planning fact → no demandKey → resolver blocks the line (fail closed, never fabricated)
  var unk = weeklyInput(); unk.sheets.planningFacts[0].demand_source_ref = 'nope';
  var f2 = INT.resolveRecommendationFactsFromSource(unk, {});
  eq([f2.bridgeResult.lines[0].blocked, f2.bridgeResult.lines[0].recommendedQty, f2.bridgeResult.lines[0].reason], [true, null, 'MISSING_DEMAND_KEY'], 'E2 unknown demandRef → blocked line (recommendedQty null, not fabricated 0)');
})();

section('F. Purity / determinism');
(function () {
  var inp = weeklyInput();
  var snap = JSON.stringify(inp);
  var a1 = INT.resolveRecommendationFactsFromSource(inp, { mode: 'SCHEDULED_REFRESH' });
  ok(JSON.stringify(inp) === snap, 'F1 sourceInput not mutated');
  var a2 = INT.resolveRecommendationFactsFromSource(inp, { mode: 'SCHEDULED_REFRESH' });
  eq(a1, a2, 'F2 deterministic (repeat deep-equal; no clock/random/locale)');
  ok(a1 !== a2 && a1.lines !== a2.lines, 'F3 fresh result objects');
})();

section('G. Boundary (no persistence write / submit / PO / projection in the integration)');
(function () {
  var cf = INT.createComputeFacts(weeklyInput(), { mode: 'SCHEDULED_REFRESH' });
  var facts = cf({ recommendationType: 'WEEKLY_SHIPPING' });
  var keys = Object.keys(facts).sort();
  eq(keys, ['formulaVersion', 'lines', 'ready', 'reason', 'sourceDataAsOf', 'sourceIssues'], 'G1 computeFacts returns ONLY the source-facts subset (no draftId/lock/wrote/submit/PO)');
  var full = INT.resolveRecommendationFactsFromSource(weeklyInput(), {});
  ok(!full.hasOwnProperty('lock') && !full.hasOwnProperty('draftId') && !full.hasOwnProperty('wrote'), 'G2 integration result carries no persistence write fields');
  // demand qty 100 flows unchanged into the ledger authority (no projection/derivation added by the integration)
  eq(full.ledgerResult.demandLedger.entries[0].effectiveDemandQty, 100, 'G3 demand quantity passes through unchanged (no projection business logic)');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1Q Recommendation Source Integration assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
