// Kitchen Mama Operation System — KMFSR preallocated §41 adapter tests — F1-7N-FA-3B1.
// Run: node assets/tests/supply-planning-surplus-reallocation-preallocated-f1-7n-fa-3b1.test.js
// Proves KMFSR.reallocatePreallocatedFactorySupply: runs §41 over ALREADY-allocated factory coverage WITHOUT a
// second §40 allocation, shares the SAME §41 core as projectSurplusReallocation, preserves conservation, and
// fails closed on invalid preallocated input. Pure Node.

'use strict';
var ALLOC = require('../js/core/supply-planning-allocations.js');
var K = require('../js/core/supply-planning-surplus-reallocation.js');
var project = K.projectSurplusReallocation;
var adapt = K.reallocatePreallocatedFactorySupply;

var fail = 0, pass = 0;
function ok(c, l) { if (!c) { fail++; console.error('FAIL ' + l); } else { pass++; } }
function eq(a, b, l) { var X = JSON.stringify(a), E = JSON.stringify(b); if (X !== E) { fail++; console.error('FAIL ' + l + '\n  exp ' + E + '\n  got ' + X); } else { pass++; } }
function throwsType(fn, l) { try { fn(); } catch (e) { if (e instanceof TypeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function throwsRange(fn, l) { try { fn(); } catch (e) { if (e instanceof RangeError) { pass++; return; } fail++; console.error('FAIL ' + l + ' (threw ' + (e && e.name) + ')'); return; } fail++; console.error('FAIL ' + l + ' (no throw)'); }
function tierRank(t) { return t === 'T1' ? 1 : (t === 'T2' ? 2 : (t === 'T3' ? 3 : 0)); }
function section(n) { console.log('\n== ' + n + ' =='); }
function byKey(res) { var m = {}; res.receivers.forEach(function (f) { m[f.demandKey] = f; }); return m; }

var CALC = '2026-08-20';
var T1a = '2026-08-25', T1b = '2026-08-26', T2a = '2026-10-15', T3a = '2026-11-15', T4a = '2026-12-15';

function rc(demandKey, over) {
  var o = { demandKey: demandKey, requiredByDate: T1a, allocationPriority: 5, projectedRequirementQty: 100, eligibleFactoryWarehouseIds: ['CN'], initialAllocationBySource: {} };
  if (over) for (var k in over) o[k] = over[k];
  return o;
}
function run(receivers, unused) { return adapt({ masterSku: 'GA', calculationDate: CALC, unusedFactorySupplyQty: unused || 0, receivers: receivers }); }

function invariants(res, label) {
  ok(res.totals.totalInitialAllocatedQty <= res.totals.totalFactorySupplyQty, label + ' §41.9(1) Σinitial ≤ supply');
  var sumShort = 0; res.receivers.forEach(function (f) { if (f.actionable) sumShort += f.remainingShortageQty; });
  eq(res.totalNetOrderNeed, sumShort, label + ' §41.9(7) netOrderNeed = Σ actionable shortage');
  var inByR = {}, outByD = {};
  res.transferLedger.forEach(function (t) {
    inByR[t.receiverDemandKey] = (inByR[t.receiverDemandKey] || 0) + t.qty;
    outByD[t.donorDemandKey] = (outByD[t.donorDemandKey] || 0) + t.qty;
    ok(tierRank(t.donorTier) > 0 && tierRank(t.receiverTier) > 0 && tierRank(t.donorTier) <= tierRank(t.receiverTier), label + ' §41.9(9) tier order ' + t.donorDemandKey + '->' + t.receiverDemandKey);
  });
  res.receivers.forEach(function (f) {
    eq(f.reallocatedInQty, inByR[f.demandKey] || 0, label + ' in matches ledger ' + f.demandKey);
    eq(f.reallocatedOutQty, outByD[f.demandKey] || 0, label + ' out matches ledger ' + f.demandKey);
    ok(f.reallocatedOutQty <= f.initialFactoryAllocationQty - f.protectedFactoryQty, label + ' §41.9(8) out ≤ initial-protected ' + f.demandKey);
    ok(f.releasableSurplusQty >= 0 && f.remainingShortageQty >= 0, label + ' non-negative ' + f.demandKey);
    ok([f.initialFactoryAllocationQty, f.reallocatedInQty, f.reallocatedOutQty, f.remainingShortageQty].every(Number.isInteger), label + ' integer ' + f.demandKey);
  });
}

// ==========================================================================
section('A. public API present');
ok(typeof adapt === 'function', 'A reallocatePreallocatedFactorySupply is callable');
ok(typeof project === 'function', 'A projectSurplusReallocation still present (additive)');

section('B. NO second §40 allocation (executable spy proof)');
(function () {
  var calls = 0; var real = ALLOC.allocateFactoryDeterministic;
  ALLOC.allocateFactoryDeterministic = function () { calls++; return real.apply(this, arguments); };
  try {
    // adapter path — must NOT touch the §40 allocator
    run([rc('D1', { projectedRequirementQty: 60, initialAllocationBySource: { CN: 100 } }), rc('D2', { requiredByDate: T2a, projectedRequirementQty: 50, initialAllocationBySource: {} })]);
    ok(calls === 0, 'B adapter made ZERO allocateFactoryDeterministic calls (calls=' + calls + ')');
    // standalone path — DOES use the §40 allocator (control)
    var before = calls;
    project({ masterSku: 'GA', calculationDate: CALC, factoryPools: [{ poolKey: 'CN-1', poolType: 'FACTORY', warehouseId: 'CN', effectiveSupplyQty: 100 }], receivers: [{ demandKey: 'S1', company: 'KM', marketplace: 'amz', destinationWarehouseId: 'W1', requiredByDate: T1a, allocationPriority: 5, demandQty: 100, projectedRequirementQty: 60, eligibleFactoryWarehouseIds: ['CN'] }] });
    ok(calls > before, 'B standalone DID call allocateFactoryDeterministic (control; calls=' + calls + ')');
  } finally { ALLOC.allocateFactoryDeterministic = real; }
})();

section('C. shared §41 core — standalone vs adapter equivalence');
(function () {
  var std = project({ masterSku: 'GA', calculationDate: CALC, factoryPools: [{ poolKey: 'CN-1', poolType: 'FACTORY', warehouseId: 'CN', effectiveSupplyQty: 100 }],
    receivers: [{ demandKey: 'D1', company: 'KM', marketplace: 'amz', destinationWarehouseId: 'W1', requiredByDate: T1a, allocationPriority: 5, demandQty: 100, projectedRequirementQty: 60, eligibleFactoryWarehouseIds: ['CN'] },
                 { demandKey: 'D2', company: 'ResUS', marketplace: 'amz', destinationWarehouseId: 'W2', requiredByDate: T2a, allocationPriority: 5, demandQty: 0, projectedRequirementQty: 50, eligibleFactoryWarehouseIds: ['CN'] }] });
  var adp = run([rc('D1', { projectedRequirementQty: 60, initialAllocationBySource: { CN: 100 } }), rc('D2', { requiredByDate: T2a, projectedRequirementQty: 50, initialAllocationBySource: {} })]);
  eq(adp.receivers, std.receivers, 'C receivers identical (shared §41 core)');
  eq(adp.transferLedger, std.transferLedger, 'C transferLedger identical');
  eq(adp.totalNetOrderNeed, std.totalNetOrderNeed, 'C totalNetOrderNeed identical (=10)');
  eq(adp.totals.totalReallocatedQty, std.totals.totalReallocatedQty, 'C totalReallocatedQty identical (=40)');
})();

section('D + E. donor/receiver behavior + conservation');
(function () {
  // eligible T1 donor → T2 receiver, partial coverage
  var r = run([rc('D1', { projectedRequirementQty: 60, initialAllocationBySource: { CN: 100 } }), rc('D2', { requiredByDate: T2a, projectedRequirementQty: 50, initialAllocationBySource: {} })]);
  var m = byKey(r);
  eq(m.D1.reallocatedOutQty, 40, 'E D1 releases 40'); eq(m.D2.reallocatedInQty, 40, 'E D2 receives 40'); eq(m.D2.remainingShortageQty, 10, 'E D2 remaining 10');
  invariants(r, 'partial');
  // T2→T1 ineligible → no transfer
  var rej = run([rc('LATE', { requiredByDate: T2a, projectedRequirementQty: 20, initialAllocationBySource: { CN: 60 } }), rc('EARLY', { requiredByDate: T1a, projectedRequirementQty: 40, initialAllocationBySource: {} })]);
  eq(rej.transferLedger.length, 0, 'E T2→T1 ineligible: no transfer'); eq(byKey(rej).EARLY.remainingShortageQty, 40, 'E EARLY shortage remains');
  invariants(rej, 'ineligible');
  // multi-donor deterministic (earliest req-by first)
  var md = run([rc('DA', { requiredByDate: T1a, projectedRequirementQty: 10, initialAllocationBySource: { CN: 40 } }),
                rc('DB', { requiredByDate: T1b, projectedRequirementQty: 10, initialAllocationBySource: { CN: 40 } }),
                rc('RB', { requiredByDate: T2a, projectedRequirementQty: 50, initialAllocationBySource: {} })]);
  var mm = byKey(md);
  eq(mm.DA.reallocatedOutQty, 30, 'E multi-donor: DA (earliest) gives 30 first'); eq(mm.DB.reallocatedOutQty, 20, 'E DB gives 20'); eq(mm.RB.reallocatedInQty, 50, 'E RB covered 50');
  invariants(md, 'multi-donor');
})();

section('F. zero cases');
(function () {
  var z1 = run([rc('Z', { projectedRequirementQty: 100, initialAllocationBySource: {} })]);
  eq(byKey(z1).Z.remainingShortageQty, 100, 'F zero preallocated supply → full shortage'); eq(z1.totals.totalInitialAllocatedQty, 0, 'F zero allocated');
  invariants(z1, 'zero-supply');
  var z2 = run([rc('S', { projectedRequirementQty: 100, initialAllocationBySource: { CN: 100 } })]);
  eq(byKey(z2).S.releasableSurplusQty, 0, 'F no surplus (initial==req)'); eq(byKey(z2).S.remainingShortageQty, 0, 'F no shortage');
  invariants(z2, 'zero-surplus');
  var z3 = run([rc('N', { projectedRequirementQty: 0, initialAllocationBySource: {} })]);
  eq(byKey(z3).N.remainingShortageQty, 0, 'F zero requirement → no shortage'); eq(byKey(z3).N.coverageReason, 'NO_REQUIREMENT', 'F NO_REQUIREMENT');
  invariants(z3, 'zero-req');
  // residual (unused) carried separately, never donor surplus
  var z4 = run([rc('R', { projectedRequirementQty: 30, initialAllocationBySource: { CN: 30 } })], 70);
  eq(z4.totals.totalUnusedFactorySupplyQty, 70, 'F unusedFactorySupplyQty retained separately (§43.6)'); eq(z4.totals.totalFactorySupplyQty, 100, 'F supply = allocated + unused');
})();

section('G. validation fails closed');
throwsType(function () { adapt(null); }, 'G null input → TypeError');
throwsType(function () { adapt({ calculationDate: CALC, receivers: [] }); }, 'G missing masterSku → TypeError');
throwsType(function () { run([rc('X', { initialAllocationBySource: [] })]); }, 'G initialAllocationBySource array → TypeError');
throwsRange(function () { run([rc('X', { initialAllocationBySource: { CN: -5 } })]); }, 'G negative qty → RangeError');
throwsRange(function () { run([rc('X', { initialAllocationBySource: { CN: 10.5 } })]); }, 'G fractional qty → RangeError');
throwsRange(function () { run([rc('DUP'), rc('DUP')]); }, 'G duplicate demandKey → RangeError');
throwsRange(function () { run([rc('T4', { requiredByDate: T4a, projectedRequirementQty: 50, initialAllocationBySource: { CN: 30 } })]); }, 'G non-actionable (T4) with preallocated supply → RangeError (fail closed)');
throwsRange(function () { run([rc('NEG', { projectedRequirementQty: -1 })]); }, 'G negative projectedRequirementQty → RangeError');

section('H. immutability + determinism');
(function () {
  var input = { masterSku: 'GA', calculationDate: CALC, unusedFactorySupplyQty: 0, receivers: [rc('D1', { projectedRequirementQty: 60, initialAllocationBySource: { CN: 100 } }), rc('D2', { requiredByDate: T2a, projectedRequirementQty: 50, initialAllocationBySource: {} })] };
  var frozen = JSON.stringify(input);
  var r1 = adapt(input);
  eq(JSON.stringify(input), frozen, 'H input not mutated');
  var r2 = adapt({ masterSku: 'GA', calculationDate: CALC, unusedFactorySupplyQty: 0, receivers: [rc('D2', { requiredByDate: T2a, projectedRequirementQty: 50, initialAllocationBySource: {} }), rc('D1', { projectedRequirementQty: 60, initialAllocationBySource: { CN: 100 } })] });
  eq(r1, r2, 'H determinism — receiver order invariant');
})();

// ==========================================================================
console.log('');
if (fail) { console.error('\n' + fail + ' assertion(s) FAILED (' + pass + ' passed).'); process.exit(1); }
console.log('All F1-7N-FA-3B1 KMFSR preallocated-adapter assertions passed (' + pass + ' assertions).');
