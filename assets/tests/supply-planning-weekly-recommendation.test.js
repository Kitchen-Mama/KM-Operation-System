// Kitchen Mama Operation System — Weekly Recommendation Facts resolver tests (Phase 2C, Round 1M).
// Run: node assets/tests/supply-planning-weekly-recommendation.test.js
// Pure Node — exercises resolveWeeklyRecommendationFacts in assets/js/core/supply-planning-source-facts.js.
// Builds real allocation projections (real buildDemandLedger/buildSupplyLedger + real allocators via
// projectAllocationInputs), then derives Weekly facts through the REAL calculateShippingAndResidual FLOOR helper
// (§31/§2C.1). Verifies frozen Weekly grain, calculatedGap/recommendedQty ownership, FLOOR (no Monthly CEILING),
// allocation mode/reason preservation, multi-source breakdown, blocked=null, valid-zero, live-analysis exclusion,
// determinism/purity. New assertion count reported separately.

'use strict';
var SF = require('../js/core/supply-planning-source-facts.js');
var LEDGER = require('../js/core/supply-planning-ledgers.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function throwsRange(fn, l) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SEP = String.fromCharCode(1);
var IDENT = { company: 'KM', country: 'US', masterSku: 'CO1100-R', fulfillmentModel: 'self_fulfilled' };
var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', source_page: 'replen' };

function demandEntry(ref, dest, mkt, qty, rbd) { return { demandType: 'REGULAR', masterSku: 'CO1100-R', company: 'KM', country: 'US', marketplace: mkt, destinationWarehouseId: dest, planningCycle: '2026-W40', requiredByDate: rbd || '2026-09-01', sourceRef: ref, quantity: qty }; }
function supplyEntry(lineage, wh, poolType, qty) { return { supplyLineageRef: lineage, masterSku: 'CO1100-R', company: 'KM', warehouseId: wh, poolType: poolType, lifecycleBucket: 'CURRENT_STOCK', quantity: qty }; }
function dk(dl, ref) { for (var i = 0; i < dl.entries.length; i++) { var k = dl.entries[i].demandKey; if (k.slice(-ref.length) === ref && k.charAt(k.length - ref.length - 1) === SEP) return k; } throw new Error('no demandKey ' + ref); }
function recv(key, demandKey, elig, extra) { var r = { receiverKey: key, demandKey: demandKey, marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', fulfillmentModel: 'self_fulfilled', survivalNeedQty: 50, allocationPriority: 1, demandWeight: 1, eligiblePoolTypes: elig }; if (extra) for (var k in extra) r[k] = extra[k]; return r; }
function ap(demandEntries, supplyEntries, receiverFacts, factoryFacts) {
  var dl = LEDGER.buildDemandLedger({ entries: demandEntries }), sl = LEDGER.buildSupplyLedger({ entries: supplyEntries });
  var proj = SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: sl, receiverFacts: receiverFacts || [], factoryDemandFacts: factoryFacts || [] });
  return { proj: proj, dl: dl, sl: sl };
}
function wf(dl, ref, windowCode, gap, upc, extra) { var f = { recommendationType: 'WEEKLY_SHIPPING', sku: 'CO1100-R', siteSku: 'ST-1', windowCode: windowCode, demandKey: dk(dl, ref), company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', calculatedGap: gap, unitsPerCarton: upc }; if (extra) for (var k in extra) f[k] = extra[k]; return f; }
function resolve(proj, facts) { return SF.resolveWeeklyRecommendationFacts({ planningCycle: '2026-W40', businessScope: SCOPE, allocationProjection: proj, weeklyPlanningFacts: facts, formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' }); }

// ==========================================================================
section('W. weekly line projection — NORMAL, FLOOR, grain');
(function () {
  var dl0 = LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] });
  var s = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dk(dl0, 'd1'), ['THREE_PL'])]);
  var r = resolve(s.proj, [wf(s.dl, 'd1', 'W40-A', 100, 12)]);
  eq(r.lines.length, 1, 'W1 one Weekly line');
  eq(r.lines[0].recommendedQty, 96, 'W1b recommendedQty = FLOOR(MIN(gap100, allocated100)/12)*12 = 96 (named §31 helper)');
  eq([r.lines[0].recommendationType, r.lines[0].masterSku, r.lines[0].siteSku, r.lines[0].windowCode], ['WEEKLY_SHIPPING', 'CO1100-R', 'ST-1', 'W40-A'], 'W1c frozen grain fields');
  eq(r.lines[0].allocationMode, 'NORMAL_ALLOCATION', 'W1d allocation mode preserved (not derived from qty)');
  eq([r.lines[0].sourcePoolType, r.lines[0].sourcePoolKey !== null], ['THREE_PL', true], 'W1e single distinct source pool identity preserved (survival+weighted records share the pool)');
  eq([r.lines[0].blockedReason, r.lines[0].calculatedGap], [null, 100], 'W1f not blocked; calculatedGap carried');
})();

section('W. mode preservation — SHORTAGE / PROTECTED + THREE_PL reserve');
(function () {
  var sh = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 30)], [recv('R1', dkOf('d1', 100), ['THREE_PL'])]);
  var rsh = resolve(sh.proj, [wf(sh.dl, 'd1', 'W40-A', 100, 12)]);
  eq([rsh.lines[0].allocationMode, rsh.lines[0].recommendedQty], ['SHORTAGE_ALLOCATION', 24], 'W2 SHORTAGE mode; recommendedQty = FLOOR(MIN(100,30)/12)*12 = 24');
  // PROTECTED: two receivers weight-skewed
  var pr = ap([demandEntry('a', 'WH-3PL', 'MP-A', 100), demandEntry('b', 'WH-3PL', 'MP-B', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)],
    [recv('RA', dkOf2('a', 100, 'b', 100, 'a'), ['THREE_PL'], { marketplace: 'MP-A', demandWeight: 9 }), recv('RB', dkOf2('a', 100, 'b', 100, 'b'), ['THREE_PL'], { marketplace: 'MP-B', demandWeight: 1 })]);
  var rpr = resolve(pr.proj, [wf(pr.dl, 'a', 'W40-A', 100, 12), wf(pr.dl, 'b', 'W40-B', 100, 12)]);
  eq(rpr.lines[0].allocationMode, 'PROTECTED_REALLOCATION', 'W3 PROTECTED mode preserved on the line');
  // THREE_PL_REPLENISHMENT_RESERVE reason surfaces in the breakdown
  var plat = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dkOf('d1', 100), ['THREE_PL'], { fulfillmentModel: 'platform_fulfilled' })]);
  var rplat = resolve(plat.proj, [wf(plat.dl, 'd1', 'W40-A', 100, 12)]);
  ok(rplat.lines[0].allocationBreakdown.some(function (b) { return b.allocationReason === 'THREE_PL_REPLENISHMENT_RESERVE'; }), 'W4 THREE_PL_REPLENISHMENT_RESERVE reason preserved in breakdown');
  function dkOf(ref, qty) { return dk(LEDGER.buildDemandLedger({ entries: [demandEntry(ref, 'WH-3PL', 'AMAZON_US', qty)] }), ref); }
  function dkOf2(r1, q1, r2, q2, want) { return dk(LEDGER.buildDemandLedger({ entries: [demandEntry(r1, 'WH-3PL', 'MP-A', q1), demandEntry(r2, 'WH-3PL', 'MP-B', q2)] }), want); }
})();

section('W. multi-source consolidation + breakdown balance');
(function () {
  var s = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('a', 'WH-3PL-A', 'THREE_PL', 60), supplyEntry('b', 'WH-3PL-B', 'THREE_PL', 60)],
    [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]);
  var r = resolve(s.proj, [wf(s.dl, 'd1', 'W40-A', 100, 12)]);
  var distinctPools = {}; var sum = 0; r.lines[0].allocationBreakdown.forEach(function (b) { distinctPools[b.sourcePoolKey] = 1; sum += b.allocatedQty; });
  eq(Object.keys(distinctPools).length, 2, 'W5 two distinct source pools feed one demand (consolidated line + breakdown)');
  eq([sum, r.lines[0].sourcePoolKey, r.lines[0].recommendedQty], [100, null, 96], 'W5b breakdown balances to 100; multi-source → sourcePoolKey null; recommendedQty FLOOR = 96');
})();

section('W. blocked / zero / no-allocation');
(function () {
  var s = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]);
  // missing windowCode → blocked null
  var mw = resolve(s.proj, [wf(s.dl, 'd1', '', 100, 12)]);
  eq([mw.lines[0].recommendedQty, mw.lines[0].blockedReason], [null, 'MISSING_WINDOW_CODE'], 'W6 missing windowCode → recommendedQty null, blocked');
  // missing calculatedGap (and no calculateGap inputs) → blocked null (missing never becomes 0)
  var mg = resolve(s.proj, [{ recommendationType: 'WEEKLY_SHIPPING', sku: 'CO1100-R', siteSku: 'ST-1', windowCode: 'W40-A', demandKey: dk(s.dl, 'd1'), unitsPerCarton: 12 }]);
  eq([mg.lines[0].recommendedQty, mg.lines[0].blockedReason, mg.lines[0].calculatedGap], [null, 'MISSING_CALCULATED_GAP', null], 'W7 missing gap → null (never 0)');
  // valid zero gap → recommendedQty 0 (not blocked)
  var zg = resolve(s.proj, [wf(s.dl, 'd1', 'W40-A', 0, 12)]);
  eq([zg.lines[0].recommendedQty, zg.lines[0].blockedReason], [0, null], 'W8 valid zero gap → recommendedQty 0, not blocked (zero != missing)');
  // no allocation (empty supply) → recommendedQty 0, unallocated preserved
  var noSup = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [], [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]);
  var rns = resolve(noSup.proj, [wf(noSup.dl, 'd1', 'W40-A', 100, 12)]);
  eq([rns.lines[0].recommendedQty, rns.lines[0].unallocatedQty, rns.lines[0].blockedReason], [0, 100, null], 'W9 no supply → recommendedQty 0, unallocatedQty 100 preserved');
  // missing UPC → blocked
  var mu = resolve(s.proj, [{ recommendationType: 'WEEKLY_SHIPPING', sku: 'CO1100-R', siteSku: 'ST-1', windowCode: 'W40-A', demandKey: dk(s.dl, 'd1'), calculatedGap: 100 }]);
  eq(mu.lines[0].blockedReason, 'MISSING_OR_INVALID_UNITS_PER_CARTON', 'W10 missing unitsPerCarton → blocked');
})();

section('W. blocked Ledger demand propagation');
(function () {
  var s = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100), demandEntry('d1', 'WH-3PL', 'AMAZON_US', 120)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)],
    [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100), demandEntry('d1', 'WH-3PL', 'AMAZON_US', 120)] }), 'd1'), ['THREE_PL'])]);
  var r = resolve(s.proj, [wf(s.dl, 'd1', 'W40-A', 100, 12)]);
  eq([r.lines[0].recommendedQty, r.lines[0].blockedReason], [null, 'DEMAND_SOURCE_QTY_CONFLICT'], 'W11 blocked Ledger demand → line blocked null with the Ledger reason');
})();

section('W. gap via named calculateGap owner (not UI fields)');
(function () {
  var s = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]);
  // supply calculateGap inputs instead of calculatedGap: demand100 - stock20 - incoming10 - committed0 = 70
  var f = { recommendationType: 'WEEKLY_SHIPPING', sku: 'CO1100-R', siteSku: 'ST-1', windowCode: 'W40-A', demandKey: dk(s.dl, 'd1'), unitsPerCarton: 12, demand: 100, destinationCurrentStock: 20, timelyQualifiedIncoming: 10, timelyApprovedCommittedSupply: 0 };
  var r = resolve(s.proj, [f]);
  eq([r.lines[0].calculatedGap, r.lines[0].recommendedQty], [70, 60], 'W12 calculatedGap = calculateGap(100,20,10,0)=70; recommendedQty FLOOR(MIN(70,100)/12)*12 = 60');
})();

section('W. factory allocation weekly line');
(function () {
  var dl = LEDGER.buildDemandLedger({ entries: [demandEntry('fa', 'WH-3PL', 'AMAZON_US', 100)] });
  var proj = SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: LEDGER.buildSupplyLedger({ entries: [supplyEntry('fs', 'WH-FAC', 'FACTORY', 100)] }),
    factoryDemandFacts: [{ demandKey: dk(dl, 'fa'), marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', requiredByDate: '2026-09-01', allocationPriority: 1, eligibleFactoryWarehouseIds: ['WH-FAC'] }] });
  var r = SF.resolveWeeklyRecommendationFacts({ planningCycle: '2026-W40', businessScope: SCOPE, allocationProjection: proj, weeklyPlanningFacts: [wf(dl, 'fa', 'W40-A', 100, 12)], formulaVersion: 'fv1' });
  eq([r.lines[0].allocationMode, r.lines[0].allocationBreakdown[0].sourcePoolType, r.lines[0].recommendedQty], ['FACTORY_DETERMINISTIC', 'FACTORY', 96], 'W13 factory weekly line → FACTORY_DETERMINISTIC mode + FACTORY source + FLOOR 96');
})();

section('W. separation + duplicate line key + Monthly rejection');
(function () {
  var s = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]);
  // duplicate line key (same sku/site_sku/window_code) → RangeError
  throwsRange(function () { resolve(s.proj, [wf(s.dl, 'd1', 'W40-A', 100, 12), wf(s.dl, 'd1', 'W40-A', 50, 12)]); }, 'W14 duplicate Weekly line key → RangeError');
  // different window → separate lines (not merged)
  var two = resolve(s.proj, [wf(s.dl, 'd1', 'W40-A', 100, 12), Object.assign(wf(s.dl, 'd1', 'W40-B', 100, 12), { siteSku: 'ST-2' })]);
  eq(two.lines.length, 2, 'W15 different windowCode/siteSku → separate lines');
  // Monthly recommendationType rejected as issue (distinguishable)
  var mon = resolve(s.proj, [{ recommendationType: 'MONTHLY_ORDER', sku: 'CO1100-R', siteSku: 'ST-1', windowCode: 'W40-A', demandKey: dk(s.dl, 'd1'), calculatedGap: 100, unitsPerCarton: 12 }]);
  eq([mon.lines.length, mon.issues[0].reason.indexOf('NOT_WEEKLY_RECOMMENDATION_TYPE') === 0], [0, true], 'W16 Monthly fact rejected (Weekly distinguishable from Monthly)');
})();

section('W. live-analysis exclusion + no decision-authority qty');
(function () {
  var s = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]);
  var withLive = resolve(s.proj, [wf(s.dl, 'd1', 'W40-A', 100, 12, { liveAnalysis: { currentGap: 9999, daysOfSupply: 3 }, planned_qty: 777, order_qty: 888 })]);
  eq(withLive.lines[0].recommendedQty, 96, 'W17 recommendedQty ignores liveAnalysis and planned_qty/order_qty');
  eq(withLive.lines[0].liveAnalysis, { currentGap: 9999, daysOfSupply: 3 }, 'W17b liveAnalysis returned separately (non-authoritative)');
  var str = JSON.stringify(withLive.lines[0]);
  ok(str.indexOf('planned_qty') < 0 && str.indexOf('order_qty') < 0, 'W17c output contains NO planned_qty / order_qty');
})();

section('P. determinism / purity / error');
(function () {
  var s = ap([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 100)], [recv('R1', dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['THREE_PL'])]);
  var facts = [wf(s.dl, 'd1', 'W40-A', 100, 12)];
  var inp = { planningCycle: '2026-W40', businessScope: SCOPE, allocationProjection: s.proj, weeklyPlanningFacts: facts, formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01' };
  var snap = JSON.stringify(inp);
  var a1 = SF.resolveWeeklyRecommendationFacts(inp);
  ok(JSON.stringify(inp) === snap, 'P1 input not mutated');
  var a2 = SF.resolveWeeklyRecommendationFacts(inp);
  eq(a1, a2, 'P2 repeat deep-equal (deterministic)');
  ok(a1 !== a2 && a1.lines !== a2.lines, 'P3 fresh result objects');
  a1.lines.push({ tampered: 1 });
  eq(SF.resolveWeeklyRecommendationFacts(inp).lines.length, 1, 'P4 mutating a prior result does not leak');
  // permutation invariance
  var dl2 = LEDGER.buildDemandLedger({ entries: [demandEntry('p1', 'WH-3PL', 'AMAZON_US', 40), demandEntry('p2', 'WH-3PL', 'AMAZON_US', 60)] });
  var proj2 = SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl2, supplyLedger: LEDGER.buildSupplyLedger({ entries: [supplyEntry('sp', 'WH-3PL', 'THREE_PL', 200)] }), receiverFacts: [recv('RA', dk(dl2, 'p1'), ['THREE_PL']), recv('RB', dk(dl2, 'p2'), ['THREE_PL'])] });
  var o1 = SF.resolveWeeklyRecommendationFacts({ planningCycle: '2026-W40', businessScope: SCOPE, allocationProjection: proj2, weeklyPlanningFacts: [wf(dl2, 'p1', 'W40-A', 40, 12), Object.assign(wf(dl2, 'p2', 'W40-B', 60, 12), { siteSku: 'ST-2' })] });
  var o2 = SF.resolveWeeklyRecommendationFacts({ planningCycle: '2026-W40', businessScope: SCOPE, allocationProjection: proj2, weeklyPlanningFacts: [Object.assign(wf(dl2, 'p2', 'W40-B', 60, 12), { siteSku: 'ST-2' }), wf(dl2, 'p1', 'W40-A', 40, 12)] });
  eq(o1.lines, o2.lines, 'P5 permutation-invariant lines');
  eq(o1.lineage, o2.lineage, 'P6 permutation-invariant lineage');
  // errors
  throwsType(function () { SF.resolveWeeklyRecommendationFacts(null); }, 'P7 null input → TypeError');
  throwsType(function () { SF.resolveWeeklyRecommendationFacts({ planningCycle: '2026-W40', businessScope: SCOPE }); }, 'P8 missing allocationProjection → TypeError');
  throwsType(function () { SF.resolveWeeklyRecommendationFacts({ planningCycle: '2026-W40', businessScope: SCOPE, allocationProjection: s.proj, weeklyPlanningFacts: [42] }); }, 'P9 non-object fact → TypeError');
  // sourceDataAsOf / formulaVersion propagation
  eq([a2.formulaVersion, a2.sourceDataAsOf, a2.lines[0].formulaVersion, a2.lines[0].sourceDataAsOf], ['fv1', '2026-08-01', 'fv1', '2026-08-01'], 'P10 formulaVersion + sourceDataAsOf propagated to run + lines');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1M Weekly Recommendation Facts assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
