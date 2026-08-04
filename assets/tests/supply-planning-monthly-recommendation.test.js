// Kitchen Mama Operation System — Monthly Recommendation Facts resolver tests (Phase 2C, Round 1N).
// Run: node assets/tests/supply-planning-monthly-recommendation.test.js
// Pure Node — exercises resolveMonthlyRecommendationFacts in assets/js/core/supply-planning-source-facts.js.
// Builds real factory allocation projections (real buildDemandLedger/buildSupplyLedger + real
// allocateFactoryDeterministic via projectAllocationInputs), derives Net Order Need via the named owners
// (calculateGap / sumRemainingShortages) and recommendedQty via the REAL calculateSuggestedOrderQty carton
// CEILING (§14/§31). Verifies frozen Monthly grain, Net Order Need ownership, CEILING (no Weekly FLOOR),
// factory lineage, blocked=null, valid-zero, live/user-qty exclusion, determinism/purity. Count reported separately.

'use strict';
var SF = require('../js/core/supply-planning-source-facts.js');
var LEDGER = require('../js/core/supply-planning-ledgers.js');
var CALC = require('../js/core/supply-planning-calculations.js');

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, e, l) { var A = JSON.stringify(a), E = JSON.stringify(e); if (A !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + A); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function throwsRange(fn, l) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function section(n) { console.log('\n== ' + n + ' =='); }

var SEP = String.fromCharCode(1);
var IDENT = { company: 'KM', country: 'US', masterSku: 'CO1100-R', fulfillmentModel: 'self_fulfilled' };
var SCOPE = { company: 'KM', country: 'US', marketplace: 'AMAZON_US', draft_purpose: 'monthly', sku: 'CO1100-R' };

function demandEntry(ref, dest, mkt, qty, rbd) { return { demandType: 'REGULAR', masterSku: 'CO1100-R', company: 'KM', country: 'US', marketplace: mkt, destinationWarehouseId: dest, planningCycle: '2026-M08', requiredByDate: rbd || '2026-09-01', sourceRef: ref, quantity: qty }; }
function supplyEntry(lineage, wh, poolType, qty) { return { supplyLineageRef: lineage, masterSku: 'CO1100-R', company: 'KM', warehouseId: wh, poolType: poolType, lifecycleBucket: 'CURRENT_STOCK', quantity: qty }; }
function dk(dl, ref) { for (var i = 0; i < dl.entries.length; i++) { var k = dl.entries[i].demandKey; if (k.slice(-ref.length) === ref && k.charAt(k.length - ref.length - 1) === SEP) return k; } throw new Error('no demandKey ' + ref); }
function fdem(key, elig, extra) { var d = { demandKey: key, marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', requiredByDate: '2026-09-01', allocationPriority: 1, eligibleFactoryWarehouseIds: elig }; if (extra) for (var k in extra) d[k] = extra[k]; return d; }
function proj(demandEntries, supplyEntries, factoryFacts) {
  var dl = LEDGER.buildDemandLedger({ entries: demandEntries }), sl = LEDGER.buildSupplyLedger({ entries: supplyEntries });
  var p = SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: sl, factoryDemandFacts: factoryFacts || [] });
  return { proj: p, dl: dl };
}
function mf(dl, ref, month, bucket, need, upc, extra) { var f = { recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', siteSku: 'ST-1', company: 'KM', country: 'US', marketplace: 'AMAZON_US', destinationWarehouseId: 'WH-3PL', requestMonth: month, requestBucket: bucket, demandKey: dk(dl, ref), netOrderNeed: need, unitsPerCarton: upc }; if (extra) for (var k in extra) f[k] = extra[k]; return f; }
function resolve(p, dl, facts, extra) { var inp = { planningCycle: '2026-M08', businessScope: SCOPE, allocationProjection: p, monthlyPlanningFacts: facts, formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01', demandLedger: dl }; if (extra) for (var k in extra) inp[k] = extra[k]; return SF.resolveMonthlyRecommendationFacts(inp); }

// ==========================================================================
section('M. monthly line projection — grain, CEILING, demand-based');
(function () {
  var s = proj([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('fs', 'WH-FAC', 'FACTORY', 60)], [fdem('__PH__', ['WH-FAC'])]);
  var dl = s.dl;
  s = proj([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('fs', 'WH-FAC', 'FACTORY', 60)], [fdem(dk(dl, 'd1'), ['WH-FAC'])]);
  var r = resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, 12)]);
  eq(r.lines.length, 1, 'M1 one Monthly line');
  eq([r.lines[0].netOrderNeed, r.lines[0].recommendedQty, r.lines[0].cartonQty], [13, 24, 2], 'M1b recommendedQty = CEILING(13/12)*12 = 24 (named §14 helper); cartonQty 2; netOrderNeed 13 unrounded');
  eq([r.lines[0].recommendationType, r.lines[0].masterSku, r.lines[0].requestMonth, r.lines[0].requestBucket], ['MONTHLY_ORDER', 'CO1100-R', '2026-09', 'B1'], 'M1c frozen Monthly grain fields');
  eq([r.lines[0].allocationMode, r.lines[0].sourceWarehouseId, r.lines[0].blockedReason], ['FACTORY_DETERMINISTIC', 'WH-FAC', null], 'M1d factory lineage preserved; not blocked');
  // recommendedQty is demand-based (CEILING of NEED 13 -> 24), NOT capped by the 60 factory allocation
  ok(r.lines[0].recommendedQty === 24 && r.lines[0].allocationBreakdown[0].allocatedQty === 60, 'M1e recommendedQty is demand-based (24), independent of factory-allocated 60 (lineage only)');
})();

section('M. carton CEILING boundary (real calculateSuggestedOrderQty)');
(function () {
  var s = proj([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [], [fdem(dkLocal('d1', 100), ['WH-FAC'])]);
  function dkLocal(ref, qty) { return dk(LEDGER.buildDemandLedger({ entries: [demandEntry(ref, 'WH-3PL', 'AMAZON_US', qty)] }), ref); }
  function need1(n, upc) { return resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', n, upc)]).lines[0].recommendedQty; }
  eq(need1(1, 12), 12, 'M2 need 1, UPC 12 → 12');
  eq(need1(12, 12), 12, 'M2b need 12 → 12 (exact multiple, one CEILING)');
  eq(need1(13, 12), 24, 'M2c need 13 → 24');
  eq(need1(0, 12), 0, 'M2d need 0 → 0');
  eq(need1(600, 12), 600, 'M2e large exact multiple → 600');
  ok(need1(13, 12) === CALC.calculateSuggestedOrderQty({ netOrderNeed: 13, unitsPerCarton: 12 }), 'M2f matches the real helper exactly (not reimplemented)');
  // missing / invalid UPC → blocked null (never Weekly FLOOR, never default 1)
  eq(resolve(s.proj, s.dl, [{ recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', demandKey: dk(s.dl, 'd1'), netOrderNeed: 13 }]).lines[0].blockedReason, 'MISSING_OR_INVALID_UNITS_PER_CARTON', 'M3 missing UPC → blocked null');
  eq(resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, 0)]).lines[0].blockedReason, 'MISSING_OR_INVALID_UNITS_PER_CARTON', 'M3b zero UPC → blocked');
  eq(resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, -12)]).lines[0].blockedReason, 'MISSING_OR_INVALID_UNITS_PER_CARTON', 'M3c negative UPC → blocked');
  eq(resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, 12.5)]).lines[0].blockedReason, 'MISSING_OR_INVALID_UNITS_PER_CARTON', 'M3d fractional UPC → blocked');
})();

section('M. Net Order Need ownership (named helpers, not UI)');
(function () {
  var s = proj([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [], [fdem(dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['WH-FAC'])]);
  // via calculateGap: demand 100 - stock 30 - incoming 10 - committed 0 = 60 → CEILING(60/12)*12 = 60
  var g = resolve(s.proj, s.dl, [{ recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', demandKey: dk(s.dl, 'd1'), unitsPerCarton: 12, demand: 100, destinationCurrentStock: 30, timelyQualifiedIncoming: 10, timelyApprovedCommittedSupply: 0 }]);
  eq([g.lines[0].netOrderNeed, g.lines[0].recommendedQty], [60, 60], 'M4 netOrderNeed via calculateGap(100,30,10,0)=60; CEILING → 60');
  // via sumRemainingShortages (§12/§32): [10, 5, 8] = 23 → CEILING(23/12)*12 = 24
  var sh = resolve(s.proj, s.dl, [{ recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', demandKey: dk(s.dl, 'd1'), unitsPerCarton: 12, remainingShortages: [10, 5, 8] }]);
  eq([sh.lines[0].netOrderNeed, sh.lines[0].recommendedQty], [23, 24], 'M5 netOrderNeed via sumRemainingShortages=23; CEILING → 24');
  // gap clamps at zero: demand 50 fully covered by stock 60 → gap 0 → recommendedQty 0
  var z = resolve(s.proj, s.dl, [{ recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', demandKey: dk(s.dl, 'd1'), unitsPerCarton: 12, demand: 50, destinationCurrentStock: 60, timelyQualifiedIncoming: 0, timelyApprovedCommittedSupply: 0 }]);
  eq([z.lines[0].netOrderNeed, z.lines[0].recommendedQty, z.lines[0].blockedReason], [0, 0, null], 'M6 supply covers demand → netOrderNeed clamps to 0 → recommendedQty 0 (not blocked)');
  // missing need → blocked null (never 0)
  var mn = resolve(s.proj, s.dl, [{ recommendationType: 'MONTHLY_ORDER', masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', demandKey: dk(s.dl, 'd1'), unitsPerCarton: 12 }]);
  eq([mn.lines[0].netOrderNeed, mn.lines[0].recommendedQty, mn.lines[0].blockedReason], [null, null, 'MISSING_NET_ORDER_NEED'], 'M7 missing Net Order Need → null (never 0)');
})();

section('M. factory allocation lineage (real allocator)');
(function () {
  // two factory pools feeding one demand → breakdown length 2, sources retained, recommendedQty demand-based
  var dl = LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] });
  var p = SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: LEDGER.buildSupplyLedger({ entries: [supplyEntry('a', 'WH-FAC-A', 'FACTORY', 40), supplyEntry('b', 'WH-FAC-B', 'FACTORY', 40)] }), factoryDemandFacts: [fdem(dk(dl, 'd1'), ['WH-FAC-A', 'WH-FAC-B'])] });
  var r = resolve(p, dl, [mf(dl, 'd1', '2026-09', 'B1', 100, 12)]);
  var distinct = {}; var sum = 0; r.lines[0].allocationBreakdown.forEach(function (b) { distinct[b.sourcePoolKey] = 1; sum += b.allocatedQty; });
  eq([Object.keys(distinct).length, sum, r.lines[0].sourcePoolKey, r.lines[0].recommendedQty], [2, 80, null, 108], 'M8 two factory pools → breakdown balances 80; multi-source sourcePoolKey null; recommendedQty CEILING(100/12)*12=108');
  eq(r.lines[0].unallocatedQty, 20, 'M8b unallocated factory demand (100-80) preserved');
  // no eligible factory → no breakdown, recommendedQty still demand-based
  var pne = SF.projectAllocationInputs({ identity: IDENT, demandLedger: dl, supplyLedger: LEDGER.buildSupplyLedger({ entries: [supplyEntry('a', 'WH-FAC-A', 'FACTORY', 40)] }), factoryDemandFacts: [fdem(dk(dl, 'd1'), ['WH-OTHER'])] });
  var rne = resolve(pne, dl, [mf(dl, 'd1', '2026-09', 'B1', 100, 12)]);
  eq([rne.lines[0].allocationBreakdown.length, rne.lines[0].recommendedQty, rne.lines[0].unallocatedQty], [0, 108, 100], 'M9 no eligible factory → no breakdown; recommendedQty still demand-based 108; unallocated 100');
})();

section('M. blocked / separation / Weekly rejection');
(function () {
  var s = proj([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('fs', 'WH-FAC', 'FACTORY', 60)], [fdem(dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['WH-FAC'])]);
  eq(resolve(s.proj, s.dl, [mf(s.dl, 'd1', '', 'B1', 13, 12)]).lines[0].blockedReason, 'MISSING_REQUEST_MONTH', 'M10 missing requestMonth → blocked null');
  eq(resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', '', 13, 12)]).lines[0].blockedReason, 'MISSING_REQUEST_BUCKET', 'M10b missing requestBucket → blocked null');
  eq(resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, 12)]).lines[0].recommendedQty, 24, 'M10c control');
  // blocked Ledger demand
  var pb = proj([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100), demandEntry('d1', 'WH-3PL', 'AMAZON_US', 120)], [supplyEntry('fs', 'WH-FAC', 'FACTORY', 60)], []);
  var rb = resolve(pb.proj, pb.dl, [mf(pb.dl, 'd1', '2026-09', 'B1', 13, 12)]);
  eq([rb.lines[0].recommendedQty, rb.lines[0].blockedReason], [null, 'DEMAND_SOURCE_QTY_CONFLICT'], 'M11 blocked Ledger demand → line blocked null with Ledger reason');
  // duplicate line key → RangeError
  throwsRange(function () { resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, 12), mf(s.dl, 'd1', '2026-09', 'B1', 20, 12)]); }, 'M12 duplicate Monthly line key → RangeError');
  // different month/bucket → separate lines
  eq(resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, 12), mf(s.dl, 'd1', '2026-10', 'B2', 20, 12)]).lines.length, 2, 'M13 different month/bucket → separate lines');
  // Weekly recommendationType rejected as issue (distinguishable)
  var wk = resolve(s.proj, s.dl, [{ recommendationType: 'WEEKLY_SHIPPING', masterSku: 'CO1100-R', requestMonth: '2026-09', requestBucket: 'B1', demandKey: dk(s.dl, 'd1'), netOrderNeed: 13, unitsPerCarton: 12 }]);
  eq([wk.lines.length, wk.issues[0].reason.indexOf('NOT_MONTHLY_RECOMMENDATION_TYPE') === 0], [0, true], 'M14 Weekly fact rejected (Monthly distinguishable from Weekly)');
})();

section('M. partial-carton / user-qty exclusion + live analysis');
(function () {
  var s = proj([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('fs', 'WH-FAC', 'FACTORY', 60)], [fdem(dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['WH-FAC'])]);
  var r = resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, 12, { order_qty: 7, planned_qty: 5, approved_qty: 9, partialCarton: 3, liveAnalysis: { currentSuggested: 999, remaining: 1 } })]);
  eq(r.lines[0].recommendedQty, 24, 'M15 recommendedQty ignores order_qty/planned_qty/approved_qty/partial-carton + liveAnalysis');
  eq(r.lines[0].liveAnalysis, { currentSuggested: 999, remaining: 1 }, 'M15b liveAnalysis returned separately (non-authoritative)');
  var str = JSON.stringify(r.lines[0]);
  ok(str.indexOf('order_qty') < 0 && str.indexOf('planned_qty') < 0 && str.indexOf('approved_qty') < 0 && str.indexOf('partialCarton') < 0, 'M15c output contains NO user order_qty / planned_qty / approved_qty / partial-carton');
})();

section('P. determinism / purity / error');
(function () {
  var s = proj([demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)], [supplyEntry('fs', 'WH-FAC', 'FACTORY', 60)], [fdem(dk(LEDGER.buildDemandLedger({ entries: [demandEntry('d1', 'WH-3PL', 'AMAZON_US', 100)] }), 'd1'), ['WH-FAC'])]);
  var facts = [mf(s.dl, 'd1', '2026-09', 'B1', 13, 12)];
  var inp = { planningCycle: '2026-M08', businessScope: SCOPE, allocationProjection: s.proj, monthlyPlanningFacts: facts, formulaVersion: 'fv1', sourceDataAsOf: '2026-08-01', demandLedger: s.dl };
  var snap = JSON.stringify(inp);
  var a1 = SF.resolveMonthlyRecommendationFacts(inp);
  ok(JSON.stringify(inp) === snap, 'P1 input not mutated');
  var a2 = SF.resolveMonthlyRecommendationFacts(inp);
  eq(a1, a2, 'P2 repeat deep-equal (deterministic)');
  ok(a1 !== a2 && a1.lines !== a2.lines, 'P3 fresh result objects');
  a1.lines.push({ tampered: 1 });
  eq(SF.resolveMonthlyRecommendationFacts(inp).lines.length, 1, 'P4 mutating a prior result does not leak');
  // permutation invariance
  var o1 = resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-09', 'B1', 13, 12), mf(s.dl, 'd1', '2026-10', 'B2', 20, 12)]);
  var o2 = resolve(s.proj, s.dl, [mf(s.dl, 'd1', '2026-10', 'B2', 20, 12), mf(s.dl, 'd1', '2026-09', 'B1', 13, 12)]);
  eq(o1.lines, o2.lines, 'P5 permutation-invariant lines');
  eq(o1.lineage, o2.lineage, 'P6 permutation-invariant lineage');
  throwsType(function () { SF.resolveMonthlyRecommendationFacts(null); }, 'P7 null input → TypeError');
  throwsType(function () { SF.resolveMonthlyRecommendationFacts({ planningCycle: '2026-M08', businessScope: SCOPE }); }, 'P8 missing allocationProjection → TypeError');
  throwsType(function () { SF.resolveMonthlyRecommendationFacts({ planningCycle: '2026-M08', businessScope: SCOPE, allocationProjection: s.proj, monthlyPlanningFacts: [42] }); }, 'P9 non-object fact → TypeError');
  eq([a2.formulaVersion, a2.sourceDataAsOf, a2.lines[0].formulaVersion, a2.lines[0].sourceDataAsOf], ['fv1', '2026-08-01', 'fv1', '2026-08-01'], 'P10 formulaVersion + sourceDataAsOf propagated to run + lines');
})();

// ==========================================================================
if (fail === 0) console.log('\nAll Round 1N Monthly Recommendation Facts assertions passed (' + pass + ' assertions).');
else { console.error('\n' + fail + ' FAILURE(S) of ' + (pass + fail) + ' assertions'); process.exit(1); }
